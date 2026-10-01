// ============================================================
// MOTORE HEADLESS DEI BOT (A1) — RISIKO ONLINE
// ------------------------------------------------------------
// Il problema: i turni dei bot li fa girare una SCHEDA del browser (l'admin).
// I browser CONGELANO le schede in secondo piano → i bot rallentano o si
// piantano, il turno rimbalza, le mosse non si salvano. Tenere una scheda
// sempre aperta e in primo piano non è accettabile per una partita vera.
//
// La soluzione (A1): far girare ESATTAMENTE quella scheda dentro un Chrome
// HEADLESS, su un host sempre acceso. Headless = mai in secondo piano, timer
// a piena velocità. Si riusa TUTTO il codice del gioco (nessuna riscrittura
// della IA), e non serve Firebase Blaze: il motore parla con lo stesso
// Firestore di sempre. I giocatori aprono i loro link (NON admin) e basta.
//
// Cosa fa questo script:
//   1) apre l'editor del gioco in un Chrome headless;
//   2) fa il login con l'account ADMIN (via Firebase Auth, non tocca la UI);
//   3) lascia che il codice del gioco piloti i bot, e lo "sveglia" ogni pochi
//      secondi (watchdog Risiko.driveBots) così non si pianta mai;
//   4) se il browser crasha, riparte da solo (supervisore).
//
// La partita la PREPARI e la AVVII una volta dall'editor vero (Prepara →
// assegna i regni → 🏁 Avvia). Da lì in poi questo motore muove i bot, e puoi
// chiudere il tuo editor. Vedi driver/README.md.
// ============================================================

'use strict';

const puppeteer = require('puppeteer');
try { require('dotenv').config(); } catch (e) { /* dotenv opzionale */ }

// SISTEMA MAIL (regola dell'utente): il modulo mail vive fuori (mailer.js /
// mail-templates.js). Se il .env non ha le credenziali SMTP, `initMailer`
// torna null e il driver gira lo stesso — non deve MAI bloccare la partita
// se il mailer non è configurato.
const { initMailer } = require('./mailer');

const GAME_URL = process.env.GAME_URL || 'https://roberto-toresani.github.io/Timeline-War/index.html';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

// Base della plancia usata nei link della mail. Se non impostata la deduco da
// GAME_URL sostituendo `index.html` → `play.html`, così l'utente non deve
// configurarla in casi normali.
const PLAY_BASE_URL = process.env.PLAY_BASE_URL || GAME_URL.replace(/index\.html(\?.*)?$/, 'play.html');

// TIMEOUT DEL TURNO UMANO (regola dell'utente): 6 ore di tempo "diurno" — la
// fascia 23:30-8:30 (ora italiana) non conta, vedi GameRules.turnActiveMs. Espresso in ore per
// coerenza col testo della mail e con la plancia; il codice lavora in ms.
const TURN_DEADLINE_MS = (Number(process.env.TURN_DEADLINE_HOURS) || 6) * 60 * 60 * 1000;

// Velocità dei bot sul MOTORE: qui nessuno "guarda giocare" l'IA (è headless),
// quindi la pausa fra un'azione e l'altra è tempo perso. La si porta al minimo,
// così i turni dei bot scorrono in fretta e i giocatori arrivano subito al loro
// turno. Nel gioco il default è 600ms; qui ~40ms. Regolabile da .env (BOT_SPEED_MS).
const BOT_SPEED_MS = Number(process.env.BOT_SPEED_MS) || 40;

// Ogni quanto "svegliare" il driver dei bot (watchdog): idempotente, il gioco
// controlla da sé lease e se sta già girando. È la rete che rialza il motore se
// un giro si fosse impuntato.
const WATCHDOG_MS = 8000;
// Ogni quanto stampare a che punto è il turno (per vedere che sta lavorando).
const HEARTBEAT_MS = 15000;
// Riavvio preventivo del browser ogni tot, per non accumulare memoria in un
// processo sempre acceso. 0 = mai.
const RELOAD_EVERY_MS = 6 * 60 * 60 * 1000;   // 6 ore

function log() {
  const a = Array.prototype.slice.call(arguments);
  console.log('[' + new Date().toISOString() + ']', a.join(' '));
}

if (!EMAIL || !PASSWORD) {
  log('MANCANO le credenziali admin. Crea il file driver/.env (copia da .env.example) con ADMIN_EMAIL e ADMIN_PASSWORD.');
  process.exit(1);
}

// SISTEMA MAIL — inizializzato una volta per sessione del browser. Se le
// credenziali SMTP mancano `mailer` resta null e il resto del driver gira
// come prima (retrocompatibile).
let mailer = null;

// Chiave d'ultima mail e d'ultimo auto-turno: `turno_globale:playerId`.
// Servono a NON mandare due volte la stessa notifica e a NON riattivare
// più volte l'auto-turno nello stesso turno. Vivono in memoria per sessione:
// un riavvio del browser viene assorbito seedando queste due chiavi dallo
// stato appena letto (vedi `seededKeys`), così un restart non manda mail
// duplicate per il turno in corso.
let lastMailedTurn = null;
let lastAutoTurnKey = null;
let seededKeys = false;

// DEDUPLICA PERSISTENTE DELLE MAIL: la chiave dell'ultima mail mandata vive su
// Firestore (doc presence/driver-mail, collezione già aperta in scrittura),
// non solo in memoria. Serve al motore IN CLOUD (GitHub Actions, RUN_FOR_MIN),
// che parte e si spegne ogni pochi minuti: con la sola memoria o rimanderebbe
// la stessa mail a ogni avvio, o (col seed) non la manderebbe mai. In
// transazione, così due motori accesi insieme (PC + cloud) non la mandano due
// volte. Torna true = tocca a me mandarla, false = già mandata, null = errore
// (ripiego sulla memoria).
const PERSISTENT_MAIL_KEY = true;
async function claimMail(page, key) {
  try {
    return await page.evaluate(async function (k) {
      const db = firebase.firestore();
      const ref = db.collection('presence').doc('driver-mail');
      return db.runTransaction(function (tx) {
        return tx.get(ref).then(function (d) {
          if (d.exists && (d.data() || {}).key === k) return false;
          tx.set(ref, { key: k, at: Date.now() });
          return true;
        });
      });
    }, key);
  } catch (e) {
    log('mail: deduplica su Firestore non riuscita, uso la memoria —', (e && e.message) || e);
    return null;
  }
}

// MODALITÀ "A TEMPO" (motore in cloud): con RUN_FOR_MIN il motore gira per
// quei minuti e poi ESCE, invece di restare acceso per sempre. È il modo in
// cui lo lancia GitHub Actions ogni 10 minuti (.github/workflows/motore.yml):
// a ogni giro muove i bot, manda le mail e chiude i turni scaduti, anche col
// PC spento. Interrompere un bot a metà turno è sicuro: al giro dopo riprende
// dalla fase in cui era (beginTurn è idempotente).
const RUN_FOR_MS = (Number(process.env.RUN_FOR_MIN) || 0) * 60 * 1000;

async function runOnce() {
  const browser = await puppeteer.launch({
    headless: 'new',
    // I flag che IMPEDISCONO al Chrome headless di rallentare i timer come farebbe
    // con una scheda in secondo piano: è tutto il punto di A1.
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  let watchdog = null, heartbeat = null, reloadTimer = null;
  const cleanup = () => {
    if (watchdog) clearInterval(watchdog);
    if (heartbeat) clearInterval(heartbeat);
    if (reloadTimer) clearTimeout(reloadTimer);
    watchdog = heartbeat = reloadTimer = null;
  };

  try {
    const page = await browser.newPage();
    // Riporta in console solo le righe che contano (errori, bot, scritture rifiutate).
    page.on('console', (m) => {
      const t = m.text();
      if (/error|errore|\[bot\]|rifiut|driver|lease/i.test(t)) log('  page>', t);
    });
    page.on('pageerror', (e) => log('  page ERROR>', e && e.message));

    log('Apro', GAME_URL);
    await page.goto(GAME_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Aspetta che Firebase sia caricato, poi login admin PROGRAMMATICO (non tocca
    // il form: più robusto se la UI cambia). onAuthStateChanged nel gioco fa il
    // resto (isAdmin true → il driver dei bot si attiva).
    await page.waitForFunction('typeof firebase !== "undefined" && !!firebase.auth', { timeout: 30000 });
    log('Login admin…');
    const res = await page.evaluate(async (email, pw) => {
      try {
        await firebase.auth().signInWithEmailAndPassword(email, pw);
        return 'ok';
      } catch (e) { return 'ERR: ' + (e && e.message ? e.message : e); }
    }, EMAIL, PASSWORD);
    if (res !== 'ok') throw new Error('login fallito → ' + res);

    await page.waitForFunction('window.Risiko && Risiko.isAdmin && Risiko.isAdmin() === true', { timeout: 30000 });
    log('Admin attivo. Il motore pilota i bot.  (Ctrl+C per fermare)');

    // SISTEMA MAIL: inizializzo il trasporto una volta per sessione. Se non
    // configurato, `mailer` resta null e la logica di invio è un no-op.
    if (!mailer) {
        mailer = initMailer(process.env);
        if (mailer && mailer.verify) { await mailer.verify(); }
    }
    // Un restart deve NON rimandare la mail del turno in corso: seed viene
    // fatto al primo heartbeat, sotto.
    seededKeys = false;

    // Primo calcio e poi WATCHDOG: sveglia il driver dei bot a intervalli. È
    // idempotente (il gioco gestisce lease e "sta già girando"), quindi non fa
    // danni e rialza il motore se un giro si fosse impuntato.
    // Porta i bot a velocità massima (nessuno li guarda qui) e dà il calcio al
    // driver. Bot.speed va rimesso a ogni giro perché è una variabile di modulo,
    // ripristinata al default a ogni caricamento della pagina.
    const kick = () => page.evaluate(function (spd) {
      try { if (window.Bot && window.Bot.speed) window.Bot.speed(spd); } catch (e) {}
      try { if (window.Risiko && Risiko.driveBots) Risiko.driveBots(); } catch (e) {}
    }, BOT_SPEED_MS).catch(function () {});
    await kick();
    log('Velocità bot impostata a', BOT_SPEED_MS + 'ms/azione.');
    watchdog = setInterval(kick, WATCHDOG_MS);

    // Heartbeat: a chi tocca ora (così vedi che scorre) + SISTEMA MAIL
    // (regola dell'utente): al passaggio di turno a un umano mando la mail
    // con la sua preferenza di auto-schieramento; allo scadere delle 6h
    // (TURN_DEADLINE_MS) eseguo l'auto-turno. La deduplica per turno vive
    // in `lastMailedTurn` / `lastAutoTurnKey` (chiave = turno_globale:playerId),
    // seedati al primo heartbeat perché un restart non riparta a mandare
    // mail per il turno in corso.
    heartbeat = setInterval(async () => {
      try {
        const s = await page.evaluate(function () {
          const R = window.Risiko; if (!R) return null;
          const t = R.turnoDi();
          if (t === null || t === undefined) return { stato: 'in attesa (nessun turno attivo)' };
          const p = R.players().find(function (x) { return x.id === t; });
          if (!p) return { stato: 'giocatore ' + t + ' non trovato' };
          // Anno "narrativo" del turno globale (js/chronicle.js): 1000 + (turn-1)*10.
          // Al mailer serve solo il numero del ciclo/turno; l'anno lo può
          // aggiungere il testo. Ripiego: se Chronicle non c'è, uso il turno crudo.
          var turnGlobal = R.turn();
          var ciclo = Math.floor((turnGlobal - 1) / 10) + 1;
          var passo = ((turnGlobal - 1) % 10) + 1;
          var anno = 1000 + (turnGlobal - 1) * 10;
          return {
            turnoDi: t,
            turnGlobal: turnGlobal,
            turnLabel: 'ciclo ' + ciclo + '/decennio ' + passo + ' (anno ' + anno + ')',
            chi: p.name,
            bot: !!p.bot,
            player: !p.bot && p.controllo === 'player',
            email: p.email || '',
            invite: p.invite || '',
            autoTurno: p.autoTurno || 'niente',
            turnStartedAt: p.turnStartedAt || 0,
            // Tempo che CONTA (notti 23:30-8:30 escluse), dalla stessa funzione
            // della plancia: GameRules.turnActiveMs. Calcolato nella pagina,
            // col fuso Europe/Rome fissato lì dentro.
            turnActiveMs: (p.turnStartedAt && window.GameRules && GameRules.turnActiveMs)
              ? GameRules.turnActiveMs(p.turnStartedAt, Date.now())
              : (p.turnStartedAt ? Date.now() - p.turnStartedAt : 0),
            // Pausa notturna (23:30-8:30, ora italiana): la mail aspetta le 8:30.
            quiet: !!(window.GameRules && GameRules.isTurnQuietTime && GameRules.isTurnQuietTime(Date.now()))
          };
        });
        if (!s) return;
        if (s.stato) { log('·', s.stato); return; }
        log('· turno di', s.chi, s.bot ? '(bot — lo muovo io)' : '(umano — aspetto la sua mossa)');

        var key = s.turnGlobal + ':' + s.turnoDi;

        // Seed al PRIMO heartbeat dopo un (ri)avvio: registro la chiave
        // corrente come "già mailata" senza mandare mail — così un restart
        // non duplica una notifica per un turno che era già stato annunciato
        // prima. Il seed viene fatto ANCHE quando il turno corrente è di un
        // bot: se ripartissimo a seedare solo al primo umano incontrato,
        // salteremmo la mail alla PRIMA transizione bot → umano dopo il
        // restart. NON seedo `lastAutoTurnKey`: il timeout DEVE poter
        // scattare anche se il driver è ripartito dentro un turno, perché
        // `turnStartedAt` vive nello stato del gioco e sopravvive.
        // Con la deduplica PERSISTENTE (Firestore, vedi claimMail) il seed non
        // serve più: la mail del turno in corso non riparte perché il doc dice
        // già che è stata mandata. Resta solo come ripiego se Firestore non
        // risponde (claimMail → null).
        if (!seededKeys) {
          seededKeys = true;
          if (!PERSISTENT_MAIL_KEY) { lastMailedTurn = key; return; }
        }

        // Solo i turni UMANI ci riguardano da qui in giù: le mail non partono
        // per i bot e il timer 6h non scatta (i bot si muovono da soli).
        if (s.bot) return;
        // E solo i regni affidati a un PLAYER remoto (menu "🔗 Player"): un regno
        // "🧑 Admin" lo gioca l'admin, niente mail e niente chiusura d'ufficio.
        if (!s.player) return;

        // MAIL — se il turno è cambiato dall'ultima mail mandata. Di notte
        // (23:30-8:30) NON parte: resta in sospeso e la manda il primo battito
        // dopo le 8:30, quando anche il cronometro riprende. Se nel frattempo il
        // giocatore ha già giocato, la chiave è cambiata e la mail non parte più.
        if (mailer && s.email && !s.quiet && key !== lastMailedTurn
            && (await claimMail(page, key)) !== false) {
          lastMailedTurn = key;
          var playUrl = PLAY_BASE_URL + (PLAY_BASE_URL.indexOf('?') >= 0 ? '&' : '?') + 'p=' + encodeURIComponent(s.invite);
          mailer.sendTurnMail({
            toEmail: s.email,
            regno: s.chi,
            playUrl: playUrl,
            turnLabel: s.turnLabel
          }).catch(function (e) { log('mail: eccezione', (e && e.message) || e); });
        }

        // TIMEOUT 6h — chiude il turno secondo la preferenza salvata. Le ore
        // fra le 23:30 e le 8:30 (ora italiana) non contano: il cronometro di
        // notte è fermo (s.turnActiveMs le ha già tolte).
        // Se il player ha rimesso mano al motore in mezzo (autoTurno cambiato)
        // rispetta la sua ultima scelta.
        if (s.turnStartedAt && s.turnActiveMs > TURN_DEADLINE_MS) {
          if (key !== lastAutoTurnKey) {
            lastAutoTurnKey = key;
            log('· 6h scadute per', s.chi, '— chiudo il turno (' + s.autoTurno + ')');
            const res = await page.evaluate(function (id, mode) {
              try {
                const r = window.GameActions.autoPlayTurn(id, mode);
                // Scrittura FORZATA: il turno è di un umano, e se il suo link è
                // aperto (presenza) il motore non è lo scrittore autorizzato —
                // shouldPushState bloccherebbe il push e la chiusura resterebbe
                // solo qui. Dopo 6h di silenzio nessuno sta scrivendo.
                if (r && r.ok !== false && window.Risiko && Risiko.engine && Risiko.engine.saveForced)
                  Risiko.engine.saveForced();
                return r;
              }
              catch (e) { return { ok: false, msg: (e && e.message) || String(e) }; }
            }, s.turnoDi, s.autoTurno || 'niente');
            if (res && res.ok === false) log('  auto-turno rifiutato:', res.msg);
          }
        }
      } catch (e) { /* la pagina potrebbe essere in ricarica */ }
    }, HEARTBEAT_MS);

    // Riavvio preventivo periodico (memoria) chiudendo il browser: il supervisore
    // lo riapre.
    if (RUN_FOR_MS > 0) {
      // Fine del tempo: si fermano i bot e si lascia partire l'ultimo push
      // (debounce di 600 ms in sync.js) prima di chiudere.
      reloadTimer = setTimeout(async () => {
        log('Tempo scaduto (' + (RUN_FOR_MS / 60000) + ' min): chiudo.');
        if (watchdog) { clearInterval(watchdog); watchdog = null; }
        try {
          await page.evaluate(function () {
            try { if (window.Bot && Bot.stop) Bot.stop(); } catch (e) {}
          });
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 3000));
        browser.close().catch(function () {});
      }, RUN_FOR_MS);
    } else if (RELOAD_EVERY_MS > 0) {
      reloadTimer = setTimeout(() => {
        log('Riavvio preventivo periodico del browser…');
        browser.close().catch(function () {});
      }, RELOAD_EVERY_MS);
    }

    // Resta vivo finché il browser non si chiude/crasha.
    await new Promise((resolve) => { browser.on('disconnected', resolve); });
  } finally {
    cleanup();
    try { await browser.close(); } catch (e) {}
  }
}

// Supervisore: qualunque cosa vada storta, si riparte. MA su un errore di LOGIN
// si aspetta a lungo, NON 5 secondi: ritentare in fretta con credenziali sbagliate
// fa scattare il blocco di Firebase (auth/too-many-requests) e peggiora tutto.
const SHORT_WAIT = 5000;         // crash normale del browser: riparto subito
const AUTH_WAIT = 5 * 60 * 1000; // errore di login/blocco: aspetto 5 minuti

function isAuthError(msg) {
  return /login fallito|auth\/|too-many-requests|credential/i.test(String(msg || ''));
}

(async function supervisor() {
  log('Motore headless dei bot — avvio. Host:', process.platform, 'Node', process.version);
  if (RUN_FOR_MS > 0) {
    // Motore a tempo (cloud): un giro solo, poi si esce. Il prossimo lo lancia
    // il cron. Niente supervisore: un errore si vede nel log del giro e il giro
    // successivo riprova da capo.
    try {
      await runOnce();
      log('Giro concluso.');
      process.exit(0);
    } catch (e) {
      log('Errore:', (e && e.message) ? e.message : e);
      process.exit(1);
    }
  }
  for (;;) {
    let wait = SHORT_WAIT;
    try {
      await runOnce();
      log('Sessione terminata (browser chiuso). Riparto fra 5s…');
    } catch (e) {
      const msg = (e && e.message) ? e.message : e;
      if (isAuthError(msg)) {
        wait = AUTH_WAIT;
        log('Errore di LOGIN:', msg);
        log('  → credenziali sbagliate o Firebase ha bloccato i tentativi. NON martello:');
        log('  → controlla ADMIN_EMAIL/ADMIN_PASSWORD nel .env, poi riparto da solo fra 5 minuti.');
      } else {
        log('Errore:', msg, '— riparto fra 5s…');
      }
    }
    await new Promise((r) => setTimeout(r, wait));
  }
})();

// Chiusura pulita.
process.on('SIGINT', () => { log('Stop richiesto. Ciao.'); process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });

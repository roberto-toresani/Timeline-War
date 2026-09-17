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

const GAME_URL = process.env.GAME_URL || 'https://roberto-toresani.github.io/Timeline-War/index.html';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

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

    // Heartbeat: a chi tocca ora (così vedi che scorre).
    heartbeat = setInterval(async () => {
      try {
        const s = await page.evaluate(function () {
          const R = window.Risiko; if (!R) return null;
          const t = R.turnoDi();
          if (t === null || t === undefined) return { stato: 'in attesa (nessun turno attivo)' };
          const p = R.players().find(function (x) { return x.id === t; });
          return { chi: p ? p.name : ('id ' + t), bot: p ? !!p.bot : false };
        });
        if (!s) return;
        if (s.stato) log('·', s.stato);
        else log('· turno di', s.chi, s.bot ? '(bot — lo muovo io)' : '(umano — aspetto la sua mossa)');
      } catch (e) { /* la pagina potrebbe essere in ricarica */ }
    }, HEARTBEAT_MS);

    // Riavvio preventivo periodico (memoria) chiudendo il browser: il supervisore
    // lo riapre.
    if (RELOAD_EVERY_MS > 0) {
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

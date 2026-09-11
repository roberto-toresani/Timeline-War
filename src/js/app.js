// TEMP (fase di test): quando true, tutti hanno permessi admin senza bisogno di login.
// Rimettere a false quando il gioco sarà pronto per il rilascio, cosi' la mappa condivisa
// tornera' modificabile solo dopo autenticazione Firebase con UID = ADMIN_UID.
const DEV_ADMIN_BYPASS = false;

document.addEventListener('DOMContentLoaded', () => {
    // play.html carica lo stesso app.js dell'editor ma si comporta da plancia:
    // il regno in focus non va azzerato al cambio ruolo e i pennelli da editor
    // non esistono. Vedi src/js/player-board.js.
    const BOARD_MODE = document.body.dataset.mode === 'player';

    // Colori della mappa presi dai token CSS, cosi' la tinta "pergamena" delle
    // province neutre e il grigio della nebbia si cambiano da tokens.css e non
    // vanno rincorsi qui dentro.
    const cssVar = (name, fallback) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const NEUTRAL_FILL = cssVar('--province-neutral', '#d1dbdd');
    const FOG_FILL = cssVar('--fog', '#3a3a3a');

    // ISOLE NON GIOCABILI (regola dell'utente): isolotti senza risorse e senza
    // utilità strategica. Restano DISEGNATI come terra — nel raw SVG hanno già
    // fill #d1dbdd (= --province-neutral) e l'alone costiero (map-decor.js) li
    // clona come ogni altra terra — ma NON sono province vere: `provincePaths`
    // (l'unica porta al motore, letta da E().allPaths) li esclude, quindi non
    // entrano nel grafo delle adiacenze, nei presidi neutrali, nel sorteggio
    // dei feudi, nella nebbia né tra i bersagli. Non hanno click né tooltip
    // (i listener si attaccano solo alle province di `provincePaths`). Chi ne
    // aggiunge una la mette qui, per ID SVG.
    const NON_PLAYABLE = new Set([
        'East_Aegean_Islands', 'West_Aegean_Islands',
        'Canary_Islands', 'Cabo_Verde', 'Bahamas',
        'Hawaiian_Islands', 'South_Atlantic_Islands'
    ]);
    const isPlayableProvince = (id) => !!id && !NON_PLAYABLE.has(id);

    const container = document.getElementById('svg-container');
    const nameDisplay = document.getElementById('province-name');
    const gameNameDisplay = document.getElementById('p-name');
    const ownerDisplay = document.getElementById('p-owner');
    const resourceDisplay = document.getElementById('p-resource');

    function showResourceInfo(key) {
        if (!resourceDisplay) return;
        const r = (typeof RESOURCES !== 'undefined' && RESOURCES[key]) ? RESOURCES[key] : null;
        resourceDisplay.textContent = r ? r.nome : 'Nessuna';
        resourceDisplay.style.color = r ? r.colore : '#888';
    }

    // La partita comincia dal turno 1: il calendario (js/chronicle.js) fa
    // corrispondere il turno 1 al decennio 1000-1009.
    const FIRST_TURN = (window.Chronicle && window.Chronicle.FIRST_TURN) || 1;
    let currentTurn = FIRST_TURN;
    let TURN_HISTORY = {};
    let selectedPlayer = null;
    let selectedResource = null; // null = nessun "pennello risorsa" attivo; altrimenti chiave risorsa o '__erase__'
    let selectedPiece = null;    // null = nessun "pennello figura" attivo; altrimenti chiave figura o '__erase__'
    const PIECE_NEUTRAL = '#555555'; // colore delle figure su province senza proprietario
    // Inchiostro del contorno delle pedine: unica fonte è PC_INK (piece_icons.js),
    // qui serve per i pezzi disegnati a mano (il pallino del numero).
    const PIECE_INK = (typeof PC_INK !== 'undefined') ? PC_INK : '#14100b';
    // Insediamenti maggiori: al massimo UNO per provincia (Capitale, Città o Fortezza
    // si escludono a vicenda). Le navi (barca/vascello) solo su province costiere.
    const SETTLEMENT_GROUP = ['capitale', 'citta', 'fortezza'];
    const SHIP_TYPES = ['barca', 'vascello'];

    // ============================================================
    // MISURA DI PEDINE E ICONE-RISORSA (regola dell'utente: "allinea la
    // grandezza dei simboli delle risorse e delle pedine, per evitare che ci
    // siano truppe giganti e truppe minuscole in base alla grandezza della
    // provincia").
    // Prima la misura era proporzionale al corpo della provincia dentro una
    // banda larghissima — pedine da 1,7 a 8, risorse da 3 a 11 — quindi la
    // stessa armata era quattro volte più grande in Russia che in Olanda, e
    // la mappa sembrava disegnata a caso. Ora c'è una misura NOMINALE (il
    // massimo) e un PAVIMENTO sotto cui non si scende mai: la proporzione
    // resta solo come freno dove la provincia è davvero troppo stretta, e il
    // divario si è ridotto da 4,6× a 1,3×.
    // Il fattore è alto apposta (0,45 e 0,5): serve a far toccare il tetto
    // alla grande maggioranza delle province, non a graduarle una per una.
    const PIECE_SIZE = 5.6, PIECE_SIZE_MIN = 4.2;   // pedine (soldati, città, navi…)
    const RES_SIZE = 6.4, RES_SIZE_MIN = 5;         // icone-risorsa
    let ROADS = [];          // strade tra province: [{a, b, c}] (a,b = id province adiacenti, c = colore)
    let pendingRoad = null;  // id della prima provincia scelta col pennello strada (attesa della seconda)
    let isAdminMode = false;
    let selectedTabPlayerId = null; // null = main view (no focus, no fog)
    // Presenza dei giocatori: mappa {codice invito: dato} da Firestore (vedi
    // sync.js). Dice quale regno una PERSONA ha preso aprendo il suo link; l'editor
    // la mostra sulla scheda del regno, così l'admin vede che non lo giocherà lui.
    let presenceMap = {};

    // INTERVENTO ADMIN A PARTITA IN CORSO (regola dell'utente: creare i Cinesi,
    // prendere i Mongoli, ecc. senza aspettare la fine della partita — le modifiche
    // attive dal turno successivo). Il problema è che editor e giocatori scrivono
    // tutto il documento: per non cancellarsi a vicenda, l'admin edita "congelato"
    // (la sync in arrivo non sovrascrive i suoi ritocchi, e i suoi non escono) e al
    // COMMIT si calcola il diff coi soli campi toccati; il diff si applica al
    // prossimo CAMBIO TURNO sopra lo stato aggiornato, così nulla va perso.
    let adminIntervening = false;   // l'admin sta preparando un intervento
    let interventionBase = null;    // snapshot (clone) all'inizio dell'intervento
    let bufferedRemote = null;      // ultimo stato remoto arrivato mentre si edita
    let pendingDiff = null;         // diff in attesa del cambio turno
    let pendingBaseTurnoDi = null;  // turnoDi al commit: si applica quando cambia
    // Comandi della vista mappa (fit/insets), riempiti da wireMapZoom: li usa la plancia.
    // Dichiarato qui in cima perche' initMap gira molto prima del corpo di wireMapZoom.
    let mapView = null;
    let NEIGHBORS = {};      // grafo completo (terra + brevi salti via mare): per usi futuri (navi)
    let NEIGHBORS_LAND = {}; // solo confini via terra (province che si toccano): usato dalla nebbia
    // Il grafo dei confini si calcola in differita (vedi initMap): per un paio di
    // secondi dopo il caricamento NON c'è. Chi ragiona sulle adiacenze — sorteggio
    // di una partita nuova, turni dei bot — deve aspettare, o vedrebbe una mappa di
    // isole scollegate e produrrebbe una partita rotta senza dire niente.
    let neighborsReady = false;
    // Province visibili al regno in focus, aggiornate da refreshMapDisplay.
    // null = nessuna nebbia (vista generale o editor): si vede tutto.
    let visibleSet = null;
    // Come si colora la mappa: 'owner' (per regno, di default), 'fede' (per
    // religione) o 'terreno' (chiuso/aperto, §9 — dove conviene attaccare).
    // È solo pittura: non cambia proprietari né permessi, e rispetta la nebbia.
    let mapPaintMode = 'owner';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const XLINK_NS = 'http://www.w3.org/1999/xlink';

    // 10 giocatori con palette perceptualmente distinta (adattata da Sasha Trubetskoy).
    // I nomi sono placeholder "Giocatore N": rinominali con doppio clic quando sei admin.
    let PLAYERS = [
        { id: 1,  name: 'Giocatore 1',  color: '#e6194B' }, // rosso
        { id: 2,  name: 'Giocatore 2',  color: '#3cb44b' }, // verde
        { id: 3,  name: 'Giocatore 3',  color: '#ffe119' }, // giallo
        { id: 4,  name: 'Giocatore 4',  color: '#4363d8' }, // blu
        { id: 5,  name: 'Giocatore 5',  color: '#f58231' }, // arancione
        { id: 6,  name: 'Giocatore 6',  color: '#911eb4' }, // viola
        { id: 7,  name: 'Giocatore 7',  color: '#42d4f4' }, // ciano
        { id: 8,  name: 'Giocatore 8',  color: '#f032e6' }, // magenta
        { id: 9,  name: 'Giocatore 9',  color: '#9A6324' }, // marrone
        { id: 10, name: 'Giocatore 10', color: '#800000' }  // bordeaux
    ];

    // Mappa vuota di partenza: nessun impero pre-assegnato.
    const INITIAL_MAP_DATA = {};

    // --- STATO ECONOMICO E DI TURNO (docs/GAME_DESIGN.md §3) ---
    // I campi economici vivono sul record del giocatore; le truppe restano dove
    // erano, in data-pieces sui path SVG (nessuna migrazione).
    let turnoDi = null;        // id del giocatore che sta giocando il suo turno
    let ordine = [];           // ordine dei giocatori (id) nel giro
    let primoDelGiro = 0;      // indice in `ordine` di chi apre il round (ruota, §2.1)
    // EVENTI STORICI (js/events.js): lo stato GLOBALE del calendario degli eventi
    // datati (crociate, mongoli, peste…). `attivi` = eventi in corso col loro
    // stato persistente; `fatti` = one-shot già scattati (guardia anti-bis). Vive
    // qui come turnoDi/ordine, viaggia nello snapshot e lo muta game-actions.
    let eventi = { attivi: [], fatti: [] };

    const TESORO_INIZIALE = 1000;   // §11
    const SOLDATI_INIZIALI = 5;     // §11, per provincia posseduta

    // Riempie i campi mancanti senza toccare quelli già presenti: uno stato
    // salvato prima di questa versione resta valido.
    function normalizePlayer(p) {
        if (p.monete === undefined) p.monete = TESORO_INIZIALE;
        if (!p.scorte) p.scorte = GameRules.emptyScorte();
        GameRules.RES.forEach(k => { if (typeof p.scorte[k] !== 'number') p.scorte[k] = 0; });
        if (!p.tassazione) p.tassazione = 'normale';
        // Reclute in attesa: le LIBERE in un contatore, le OBBLIGATORIE per
        // provincia (nascono da Capitale/Città/Fortezza e restano lì, §5.1).
        if (typeof p.recluteDaSchierare !== 'number') p.recluteDaSchierare = 0;
        if (!p.recluteVincolate) p.recluteVincolate = {};
        if (!p.schierateTurno) p.schierateTurno = {};
        if (typeof p.prestigioCiclo !== 'number') p.prestigioCiclo = 0;
        if (typeof p.puntiOro !== 'number') p.puntiOro = 0;
        if (typeof p.stradeGratis !== 'number') p.stradeGratis = 0;
        // TURNO DI FONDAZIONE: 1 per i regni d'inizio partita, il turno dell'evento
        // per chi nasce a partita in corso (game-actions.eventSpawnKingdom). Serve
        // alla GRAZIA DELL'INSEDIAMENTO (§8, js/popularity.js), che si conta
        // sull'età del REGNO: senza, un regno nato al turno 25 non avrebbe i decenni
        // di indulgenza che gli altri hanno avuto all'inizio.
        if (typeof p.nato !== 'number') p.nato = 1;
        // DOTTRINA SOSPESA (js/events.js, l'Orda dal 1350): un regno d'evento che
        // ha finito la sua storia di marcia e da qui gioca senza dottrina —
        // difensivo e moderato. Lo legge bot.js (doctrineOf/marchTip); di default
        // spento, così ogni altro regno tiene la sua dottrina come sempre.
        if (typeof p.dottrinaSospesa !== 'boolean') p.dottrinaSospesa = false;
        if (!p.temporanei) p.temporanei = {};
        // Fase del turno (§2): schiera → costruisci → attacca → sposta. Uno stato
        // salvato prima delle fasi riparte dallo schieramento, che è corretto.
        if (!p.fase) p.fase = 'schiera';
        if (typeof p.spostamentoFatto !== 'boolean') p.spostamentoFatto = false;
        if (p.conquista === undefined) p.conquista = null;
        // Capitale nemica appena presa, in attesa che il giocatore decida se
        // promuoverla a Capitale ufficiale o lasciarla Città (§Capitale). Di
        // default è già una Città (game-actions), quindi lo stato è consistente
        // anche se la scelta non arriva mai: si azzera a fine turno.
        if (p.capitalePresa === undefined) p.capitalePresa = null;
        // Commerci (§7): le proposte RICEVUTE stanno sul record di chi le riceve.
        // Chi le ha mandate le ritrova scorrendo gli altri regni (tradeOutbox in
        // game-actions.js): una proposta esiste in un posto solo.
        if (!Array.isArray(p.offerte)) p.offerte = [];
        // COMMERCI CONCLUSI (§7): lo STORICO degli scambi andati a buon fine (per
        // riproporli al volo) e gli AVVISI in coda per il proponente, che scopre
        // l'esito all'apertura del suo turno — stessa logica degli editti.
        if (!Array.isArray(p.commerciStorico)) p.commerciStorico = [];
        if (!Array.isArray(p.commerciAvvisi)) p.commerciAvvisi = [];
        // EDITTI (GameActions.decree): gli interventi dell'admin che riguardano
        // questo regno. Restano qui finché il giocatore non apre il suo turno e
        // se li vede srotolare — un editto non deve poter passare inosservato.
        if (!Array.isArray(p.editti)) p.editti = [];
        // EVENTI STORICI (js/events.js): gli avvisi in coda (crociata bandita, orda
        // in arrivo, peste, guerra dichiarata), srotolati come pergamena all'apertura
        // del turno — stessa logica degli editti, così un evento non passa inosservato.
        if (!Array.isArray(p.eventiAvvisi)) p.eventiAvvisi = [];
        // PESTE (js/events.js, GameActions.eventDecimate): le province dove
        // l'epidemia ha ucciso uomini QUESTO giro — la loro risorsa non si
        // raccoglie. `beginTurn` la legge e la svuota alla prossima produzione
        // di questo regno, quindi non deve mai sopravvivere a un salvataggio.
        if (!Array.isArray(p.pesteBlocco)) p.pesteBlocco = [];
        // FELICITÀ (§6.1, "Festa"): il privilegio di QUESTO turno —
        // `festaRisorse` (1-2 tipi di risorsa scontati sulle costruzioni,
        // GameRules.costFor) e `festaCostruzioneBonus` (monete restituite a ogni
        // acquisto pagato, GameActions.payConstruction). Sorteggiati da
        // `beginTurn` a ogni turno del regno, dalla Felicità sulla Capitale —
        // non devono sopravvivere a un salvataggio più di un turno.
        if (!Array.isArray(p.festaRisorse)) p.festaRisorse = [];
        if (typeof p.festaCostruzioneBonus !== 'number') p.festaCostruzioneBonus = 0;
        // CRONACHE STORICHE (js/chronicles.js): le VIGNETTE di colore che scattano
        // quando la situazione del regno tocca una soglia evocativa (la marina
        // inglese, il feudo francese, i cavalieri teutonici). Nessun effetto sulla
        // mappa — è solo racconto. `cronacheFatte` = gli id già srotolati (ognuno
        // una volta sola per regno); `cronacaUltima` = il turno dell'ultima, per
        // distanziarle (regola dell'utente: non troppo frequenti).
        if (!Array.isArray(p.cronacheFatte)) p.cronacheFatte = [];
        if (typeof p.cronacaUltima !== 'number') p.cronacaUltima = 0;
        // SPIE (§9.3): [{prov, turno}] — dove sta ciascuna e da che turno.
        // La scadenza non si salva: si calcola (js/spies.js), così una spia non
        // può sopravvivere a un salvataggio riaperto tre decenni dopo.
        if (!Array.isArray(p.spie)) p.spie = [];
        // RANCORE (la vendetta dell'IA): [{prov, chi, peso, turno}] — le province
        // PREZIOSE strappate a questo regno e chi le ha prese. Lo scrive la
        // conquista (game-actions.applyBattleOutcome, unico punto), lo legge il
        // bot per tornare a riprendersele. Vive nello stato come le spie: serve ai
        // regni IA, ma non fa male tenerlo per tutti (un umano semplicemente lo
        // ignora).
        if (!Array.isArray(p.rancore)) p.rancore = [];
        // AGGRESSIONI SUBITE (§Diplomazia, il livello di rapporto): [{chi, prov,
        // esito, peso, turno}] — TUTTO quel che un altro regno ti ha portato
        // addosso, non solo le prede grosse: le province strappate (`presa`) e
        // anche i colpi RESPINTI (`respinto`), che il rancore non registra perché
        // ai bot non servono. Lo scrive l'unico punto in cui una battaglia si
        // risolve (game-actions.attack); lo legge Diplomacy.standing.
        // Un salvataggio anteriore a questo registro lo eredita dal rancore: le
        // province preziose già perdute non spariscono dal rapporto.
        if (!Array.isArray(p.aggressioni)) {
            p.aggressioni = (Array.isArray(p.rancore) ? p.rancore : []).map(g => ({
                chi: g.chi, prov: g.prov, esito: 'presa', peso: g.peso || 1, turno: g.turno || 1
            }));
        }
        // AIUTI RICEVUTI (§Diplomazia): [{chi, prov, uomini, turno}] — i rinforzi
        // che un alleato ti ha mandato al fronte. È il rovescio positivo delle
        // aggressioni, e l'unico fatto diplomatico che costa uomini a chi lo compie.
        if (!Array.isArray(p.aiuti)) p.aiuti = [];
        // RICHIESTE D'AIUTO RICEVUTE (§Diplomazia): [{id, da, daNome, prov, turno}]
        // — "mandami uomini QUI". Vivono sul record di chi le riceve, come le
        // offerte di commercio e le proposte di patto: una richiesta esiste in un
        // posto solo. Si spengono quando i rinforzi arrivano o quando scadono.
        if (!Array.isArray(p.richiesteAiuto)) p.richiesteAiuto = [];
        // SPEDIZIONI OLTREMARE (§9.2, rotte lunghe): [{id, dir, carico, merc, x, y,
        // turno}] — i Velieri in rotta lunga, in mare aperto fuori da ogni
        // provincia. Ognuno porta con sé posizione (x,y in coordinate SVG), la
        // direzione che segue e il carico. Persistono nel salvataggio come le spie.
        if (!Array.isArray(p.spedizioni)) p.spedizioni = [];
        // AVVISI DI MARE (§9.2): naufragi e morìa dell'equipaggio in mare aperto,
        // in coda finché il giocatore non li ha letti — stessa logica degli editti,
        // così un naufragio non si perde se la pagina si ricarica prima del turno.
        if (!Array.isArray(p.spedizioniAvvisi)) p.spedizioniAvvisi = [];
        // DIPLOMAZIA (§Diplomazia): i PATTI. `patti` è la lista MUTUA degli
        // accordi attivi ({tipo, con, dal, scad}), scritta su entrambi i record
        // da game-actions (come recordTrade). `pattiProposte` sono le proposte
        // RICEVUTE (sul record di chi le riceve, come le offerte di commercio);
        // `pattiAvvisi` gli avvisi pop-up a inizio turno (accettato / scaduto /
        // rotto / tradito), come editti e commerci. `permessiAttacco` sono i
        // consensi CONCESSI da questo regno: [{chi, prov}] = "permetto a `chi`
        // di attaccare la mia `prov` senza rompere il patto". Vivono nello stato
        // come il rancore: servono ai bot, un umano se ne serve dalla plancia.
        if (!Array.isArray(p.patti)) p.patti = [];
        if (!Array.isArray(p.pattiProposte)) p.pattiProposte = [];
        if (!Array.isArray(p.pattiAvvisi)) p.pattiAvvisi = [];
        if (!Array.isArray(p.permessiAttacco)) p.permessiAttacco = [];
        // MANUTENZIONE DELLE MIGLIORIE CIVICHE (§6.1): ogni 5 turni un contributo
        // di 1 risorsa per edificio (auto-pagato dal magazzino); se manca, la
        // miglioria va dormiente e poi crolla. `welfareMaintTurn` = ultimo turno di
        // manutenzione già processato (evita il doppio prelievo a un ricaricamento);
        // `welfareAvvisi` = gli esiti in coda per la pergamena a inizio turno, come
        // gli editti e gli avvisi di mare.
        if (typeof p.welfareMaintTurn !== 'number') p.welfareMaintTurn = 0;
        if (!Array.isArray(p.welfareAvvisi)) p.welfareAvvisi = [];
        // OBIETTIVI DI PRESTIGIO (§10, js/objectives.js): la spunta del ciclo
        // corrente è DAL VIVO (si ricalcola, non si salva), quindi qui basta lo
        // STORICO dei cicli conclusi — fotografato al passaggio di ciclo e sempre
        // consultabile dalla plancia. `puntiPrestigio` è il PUNTEGGIO accumulato:
        // i punti TENUTI a fine di ogni ciclo, sommati per sempre (niente Punto
        // d'Oro — scelta dell'utente: si conta quanto si fa per sezione). Il ciclo
        // in corso conta dal vivo ma entra nel totale solo quando si archivia.
        if (!Array.isArray(p.obiettiviStorico)) p.obiettiviStorico = [];
        if (typeof p.puntiPrestigio !== 'number') p.puntiPrestigio = 0;
        // Il BINARIO STORICO: `capitolo` è dove il regno è arrivato nella PROPRIA
        // storia (0 = ancora da dedurre), `intensita` con che respiro lo affronta.
        // `obiettiviCiclo` è l'assegnazione del ciclo in corso — serializzabile
        // apposta (template + argomenti + soglia), quindi vive nel salvataggio
        // come le spie e gli editti, e la plancia mostra sempre i numeri con cui
        // il ciclo è cominciato invece di rigenerarli a ogni render.
        // `cicliStorico` è il registro di performance su cui il puntatore si
        // muove; `obiettiviAvvisi` è il canale della pergamena di inizio ciclo.
        if (typeof p.capitolo !== 'number') p.capitolo = 0;
        if (typeof p.intensita !== 'string') p.intensita = 'avanzare';
        if (!p.obiettiviCiclo || !Array.isArray(p.obiettiviCiclo.items)) p.obiettiviCiclo = null;
        if (!Array.isArray(p.cicliStorico)) p.cicliStorico = [];
        if (!Array.isArray(p.obiettiviAvvisi)) p.obiettiviAvvisi = [];
        return p;
    }

    function normalizePlayers() { PLAYERS.forEach(normalizePlayer); }
    normalizePlayers();

    // --- ROLE / ADMIN LOGIN ---
    function applyRole(admin) {
        isAdminMode = admin;

        const banner = document.getElementById('role-banner');
        const bannerText = document.getElementById('role-banner-text');
        const loginBtn = document.getElementById('admin-login-btn');
        const logoutBtn = document.getElementById('admin-logout-btn');
        const tabsBar = document.getElementById('player-tabs-bar');
        const turnPrevBtn = document.getElementById('turn-prev');
        const turnNextBtn = document.getElementById('turn-next');

        if (banner) banner.className = 'role-banner ' + (admin ? 'role-admin' : 'role-readonly');
        if (bannerText) bannerText.textContent = admin ? '🔓 Modalità admin (modifiche attive)' : '🔒 Modalità sola lettura';
        if (loginBtn) loginBtn.style.display = admin ? 'none' : 'inline-block';
        if (logoutBtn) logoutBtn.style.display = admin ? 'inline-block' : 'none';
        // Le schede giocatore sono disponibili in ENTRAMBE le modalità: in sola lettura
        // ogni giocatore accede alla propria scheda personale (province + limitrofe +
        // pannello Popolarità) senza poter modificare nulla (l'editing resta admin-only,
        // vedi syncPlayerControlsVisibility e le guardie isAdminMode nei click handler).
        if (tabsBar) tabsBar.style.display = 'flex';
        if (turnPrevBtn) turnPrevBtn.style.display = admin ? 'inline-block' : 'none';
        if (turnNextBtn) turnNextBtn.style.display = admin ? 'inline-block' : 'none';
        syncPlayerControlsVisibility();

        // Al cambio ruolo si torna alla vista principale (nessun focus): sarà il
        // giocatore a selezionare il proprio regno dalle schede.
        selectedResource = null;
        selectedPiece = null;
        document.querySelectorAll('.resource-chip').forEach(c => c.classList.remove('selected'));
        // Nella plancia il regno in focus e' deciso dal link d'invito, non dalle
        // schede: azzerarlo qui spegnerebbe nebbia e pannelli a ogni cambio ruolo.
        if (!BOARD_MODE) {
            selectedTabPlayerId = null;
            const content = document.getElementById('player-tab-content');
            if (content) content.style.display = 'none';
        }
        refreshMapDisplay();
        renderPlayerTabs();
        updateInterventionUI();   // il bottone "Intervieni" è solo per l'admin
    }

    function wireAdminLogin() {
        const loginBtn = document.getElementById('admin-login-btn');
        const logoutBtn = document.getElementById('admin-logout-btn');
        const loginModal = document.getElementById('admin-login-modal');
        const closeLoginModal = document.getElementById('close-login-modal');
        const submitBtn = document.getElementById('admin-login-submit');
        const emailInput = document.getElementById('admin-email');
        const passwordInput = document.getElementById('admin-password');
        const errorDisplay = document.getElementById('admin-login-error');

        if (!loginBtn) return;

        if (!MultiplayerSync.isConfigured) {
            loginBtn.title = 'Multiplayer non configurato (vedi firebase-config.js)';
        }

        loginBtn.addEventListener('click', () => {
            errorDisplay.textContent = '';
            loginModal.style.display = 'block';
        });

        logoutBtn.addEventListener('click', () => {
            MultiplayerSync.logout();
        });

        closeLoginModal.addEventListener('click', () => {
            loginModal.style.display = 'none';
        });

        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) loginModal.style.display = 'none';
        });

        submitBtn.addEventListener('click', () => {
            errorDisplay.textContent = '';
            MultiplayerSync.login(emailInput.value.trim(), passwordInput.value)
                .then(() => {
                    loginModal.style.display = 'none';
                    passwordInput.value = '';
                })
                .catch(err => {
                    errorDisplay.textContent = 'Accesso fallito: ' + err.message;
                });
        });
    }

    // --- TURN LOGIC ---
    const turnDisplay = document.getElementById('turn-display');
    const turnPrevBtn = document.getElementById('turn-prev');
    const turnNextBtn = document.getElementById('turn-next');

    if (turnDisplay && turnPrevBtn && turnNextBtn) {
        turnPrevBtn.addEventListener('click', () => {
            if (!isAdminMode) return;
            if (currentTurn > FIRST_TURN) {
                saveCurrentTurnToHistory();
                currentTurn--;
                loadTurnFromHistory();
                updateTurnUI();
                saveAutoSave();
            }
        });

        turnNextBtn.addEventListener('click', () => {
            if (!isAdminMode) return;
            saveCurrentTurnToHistory();
            currentTurn++;
            loadTurnFromHistory();
            updateTurnUI();
            refreshMapDisplay();
            saveAutoSave();
        });
    }

    // Un turno vale un decennio: il calendario sta tutto in js/chronicle.js,
    // perché lo stesso anno serve anche alla fondazione delle città.
    const yearOfTurn = (t) => (window.Chronicle ? window.Chronicle.yearOfTurn(t) : 1000 + (t || 0) * 10);

    function updateTurnUI() {
        if (turnDisplay) {
            turnDisplay.textContent = `Turno ${currentTurn}`;
        }
        const dateDisplay = document.getElementById('date-display');
        if (dateDisplay) {
            dateDisplay.textContent = `${yearOfTurn(currentTurn)} AD`;
        }
    }

    // 1. Prepare Province Lookup Map (Normalized)
    const gameProvinces = {};
    if (typeof provinces !== 'undefined') {
        provinces.forEach(p => {
            const key = normalize(p.nome);
            gameProvinces[key] = p;
        });
    }

    // Load the SVG file
    if (typeof RAW_SVG_CONTENT !== 'undefined') {
        container.innerHTML = RAW_SVG_CONTENT;
        initMap();
    } else {
        fetch('assets/world_map.svg')
            .then(response => {
                if (!response.ok) throw new Error("Failed to load map");
                return response.text();
            })
            .then(svgContent => {
                container.innerHTML = svgContent;
                initMap();
            })
            .catch(err => {
                container.innerHTML = `<p style="color:red">Error loading map: ${err.message}</p>`;
                console.error(err);
            });
    }

    function initMap() {
        const svg = container.querySelector('svg');
        if (!svg) return;

        svg.style.width = '100%';
        svg.style.height = '100%';

        // Vestizione "carta antica": mare, grana, alone costiero (js/map-decor.js).
        if (window.MapDecor) MapDecor.decorate(svg);

        // Griglia delle rotte di mare (§9.2): ~0,5 s una volta sola, in sottofondo.
        // Finché non è pronta le portate restano vuote, quindi appena arriva si
        // ridipinge — è lì che compaiono le province in nebbia leggera.
        if (window.SeaRoutes) {
            SeaRoutes.prepare(svg).then(() => { try { refreshMapDisplay(); } catch (e) {} });
        }

        // Tooltip
        let tooltip = document.getElementById('map-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'map-tooltip';
            tooltip.className = 'map-tooltip';
            document.body.appendChild(tooltip);
        }

        // ViewBox della mappa mondiale (MapChart world map).
        svg.setAttribute('viewBox', '0 0 1200 575');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        wireMapZoom(svg);

        // Simboli-risorsa e simboli-figura disponibili subito (li usano anche i chip della palette).
        injectResourceDefs(svg);
        injectPieceDefs(svg);

        // Solo i territori giocabili: `provincePaths` esclude sfondo, bordi e
        // pattern dell'SVG *e* la copia congelata delle terre che fa da alone
        // costiero, che ha anche lei class="state" ma non ha id. Col selettore
        // crudo le si riscriveva addosso il fill di ogni provincia: l'alone
        // restava blu solo perché il suo filtro reimpone la tinta.
        const paths = provincePaths(svg);
        const defaultFill = NEUTRAL_FILL;

        paths.forEach(path => {
            path.style.cursor = 'pointer';
            path.style.transition = 'fill 0.2s';
            path.style.fill = defaultFill;

            // Seed iniziale della risorsa: prima i default globali (default_state.js,
            // per id SVG), poi come fallback il campo "risorsa" di map_data.js.
            // Uno stato salvato piu' recente potra' sovrascriverlo (applyResourceState).
            if (!path.hasAttribute('data-resource')) {
                let seedKey = (typeof DEFAULT_RESOURCES !== 'undefined' && DEFAULT_RESOURCES[path.id]) || null;
                if (!seedKey) {
                    const seed = findMatch(path.id, path.getAttribute('name'));
                    if (seed && seed.risorsa) seedKey = seed.risorsa;
                }
                if (seedKey && typeof RESOURCES !== 'undefined' && RESOURCES[seedKey]) {
                    path.setAttribute('data-resource', seedKey);
                }
            }

            // Seed iniziale della RELIGIONE (js/religions.js): eccezione per nome,
            // poi blocco regionale per coordinate. Come per la risorsa, uno stato
            // salvato piu' recente potra' sovrascriverla (applyReligionState).
            if (!path.hasAttribute('data-religione') && typeof Religions !== 'undefined') {
                let b = null; try { b = path.getBBox(); } catch (e) { b = null; }
                const cx = b ? b.x + b.width / 2 : 0;
                const cy = b ? b.y + b.height / 2 : 0;
                const faith = Religions.seedFaith(provinceLabel(path), cx, cy);
                if (faith) path.setAttribute('data-religione', faith);
            }

            path.addEventListener('mouseenter', () => {
                path.style.opacity = '0.7';
                const id = path.id;
                const nameAttr = path.getAttribute('name');
                const owner = path.getAttribute('data-owner');
                const data = findMatch(id, nameAttr, nameAttr);
                const displayName = data ? data.nome : (nameAttr || id);
                // In una scheda personale il proprietario delle province in nebbia
                // non deve trapelare: si vede solo il nome della regione.
                const isFogged = path.classList.contains('fog');
                const showOwner = owner && !isFogged;
                tooltip.innerHTML = showOwner
                    ? `<strong>${displayName}</strong><br><span style="color:#fff">${owner}</span>`
                    : `<strong>${displayName}</strong>`;
                tooltip.style.display = 'block';
            });

            path.addEventListener('mousemove', (e) => {
                if (tooltip.style.display === 'block') {
                    tooltip.style.top = e.pageY + 'px';
                    tooltip.style.left = e.pageX + 'px';
                }
            });

            path.addEventListener('mouseleave', () => {
                path.style.opacity = '1';
                tooltip.style.display = 'none';
            });

            path.addEventListener('click', (e) => {
                e.stopPropagation();

                const id = path.id || "Unknown";
                const nameAttr = path.getAttribute('name') || id;
                const owner = path.getAttribute('data-owner');
                const data = findMatch(id, nameAttr, nameAttr);
                const displayTitle = data ? data.nome
                    : (typeof ID_MAP !== 'undefined' && ID_MAP[id] ? ID_MAP[id] : nameAttr);
                const isFogged = path.classList.contains('fog');
                const inTab = selectedTabPlayerId !== null;

                nameDisplay.textContent = displayTitle;
                gameNameDisplay.textContent = displayTitle;

                // In scheda personale il giocatore vede solo le proprie province e i vicini:
                // qualsiasi click su una provincia in nebbia va ignorato (non sa che esiste).
                // I campi vanno comunque svuotati, altrimenti restano quelli della
                // provincia precedente e sembrano riferirsi a questa.
                if (inTab && isFogged) {
                    ownerDisplay.textContent = 'Sconosciuto';
                    ownerDisplay.style.color = '#888';
                    showResourceInfo('');
                    return;
                }

                // Pennello risorsa attivo: il click assegna/rimuove la risorsa
                // (ha priorita' sulla pittura del proprietario).
                if (isAdminMode && selectedResource !== null) {
                    const current = resourceKeyOf(path);
                    let next;
                    if (selectedResource === '__erase__') next = '';
                    else next = (current === selectedResource) ? '' : selectedResource;
                    if (next) path.setAttribute('data-resource', next);
                    else path.removeAttribute('data-resource');
                    renderMarkerForPath(svg, path);
                    renderRoads(svg);   // l'icona e' cambiata: le strade la rischivano
                    showResourceInfo(next);
                    saveAutoSave();
                    return;
                }

                // Pennello STRADA: collega due province cliccandole in sequenza.
                // Il cancello compare a cavallo del confine tra le due (adiacenti).
                if (isAdminMode && selectedPiece === 'strada') {
                    if (pendingRoad === null) {
                        pendingRoad = path.id;
                        showPieceNotice('Strada: ora clicca la seconda provincia (adiacente).');
                    } else if (pendingRoad === path.id) {
                        pendingRoad = null;
                        showPieceNotice('Strada annullata.');
                    } else {
                        const a = pendingRoad, b = path.id;
                        pendingRoad = null;
                        if (!areLandAdjacent(a, b)) {
                            showPieceNotice('Le due province non sono adiacenti via terra.');
                        } else {
                            const A = document.getElementById(a);
                            const color = selectedPlayer ? selectedPlayer.color
                                : (ownerColorHex(A) || ownerColorHex(path) || PIECE_NEUTRAL);
                            const res = toggleRoad(a, b, color);
                            renderRoads(svg);
                            saveAutoSave();
                            showPieceNotice(res === 'added' ? 'Strada creata.' : 'Strada rimossa.');
                        }
                    }
                    return;
                }

                // Pennello figura attivo: click sinistro = +1 (impila le unita').
                // La figura prende il colore del giocatore selezionato (memorizzato
                // sulla provincia), altrimenti quello del proprietario, altrimenti neutro.
                if (isAdminMode && selectedPiece !== null) {
                    if (selectedPiece === '__erase__') {
                        changePiece(path, '__erase__');
                    } else {
                        const chk = canPlacePiece(path, selectedPiece);
                        if (!chk.ok) { showPieceNotice(chk.msg); return; }
                        changePiece(path, selectedPiece, +1);
                        if (path.getAttribute('data-pieces') || path.getAttribute('data-ships')) {
                            if (selectedPlayer) path.setAttribute('data-pc-color', selectedPlayer.color);
                            else if (!path.getAttribute('data-pc-color')) {
                                const oc = ownerColorHex(path);
                                if (oc) path.setAttribute('data-pc-color', oc);
                            }
                        }
                    }
                    renderPiecesForPath(svg, path);
                    renderPopularityPanel();
                    saveAutoSave();
                    return;
                }

                showResourceInfo(resourceKeyOf(path));

                if (selectedPlayer && isAdminMode) {
                    // Paint / conquista. In scheda personale il giocatore selezionato e' gia'
                    // stato forzato a quello della scheda (vedi handler tab click).
                    if (owner === selectedPlayer.name) {
                        path.removeAttribute('data-owner');
                        ownerDisplay.textContent = "Nessuno";
                        ownerDisplay.style.color = "#888";
                    } else {
                        path.setAttribute('data-owner', selectedPlayer.name);
                        ownerDisplay.textContent = selectedPlayer.name;
                        ownerDisplay.style.color = selectedPlayer.color;
                    }
                    refreshMapDisplay();
                    renderPlayerTabs();
                    saveAutoSave();
                } else {
                    // Modalita' ispezione. Nella scheda personale una provincia in nebbia
                    // non deve rivelare il suo proprietario (ma qui e' gia' bloccata sopra).
                    const showOwner = owner && !isFogged;
                    ownerDisplay.textContent = showOwner ? owner : "Nessuno";
                    const pObj = showOwner ? PLAYERS.find(p => p.name === owner) : null;
                    ownerDisplay.style.color = pObj ? pObj.color : '#888';
                }
            });

            // Click destro con un pennello-figura attivo: -1 di quella figura
            // (in scheda personale una provincia in nebbia resta intoccabile).
            path.addEventListener('contextmenu', (e) => {
                if (!isAdminMode || selectedPiece === null) return; // altrimenti menu normale
                if (selectedTabPlayerId !== null && path.classList.contains('fog')) return;
                e.preventDefault();
                e.stopPropagation();
                if (selectedPiece === '__erase__') changePiece(path, '__erase__');
                else changePiece(path, selectedPiece, -1);
                if (!path.getAttribute('data-pieces') && !path.getAttribute('data-ships')) {
                    path.removeAttribute('data-pc-color');
                }
                renderPiecesForPath(svg, path);
                renderPopularityPanel();
                saveAutoSave();
            });
        });

        // Compute adjacency graph once (deferred so it doesn't block first paint).
        setTimeout(() => {
            const g = computeNeighborGraph(svg);
            NEIGHBORS = g.full;
            NEIGHBORS_LAND = g.land;
            neighborsReady = true;
            renderResourceMarkers(svg);
            renderPieceMarkers(svg);
            renderRoads(svg);
            refreshMapDisplay();
        }, 50);

        // Wire the top tabs bar (toggle + clear).
        wireTopTabsBar();

        // Load state: cloud if configured, else localStorage.
        if (MultiplayerSync.isConfigured) {
            MultiplayerSync.onStateChange(applyCloudState);
            MultiplayerSync.onPresenceChange(applyPresence);
            // Una scrittura rifiutata dalla guardia anti-regressione (sync.js) vuol
            // dire che lo stato online è più avanti del nostro: non sovrascriviamo,
            // e lo diciamo. L'ultimo snapshot valido arriva comunque da sé.
            if (MultiplayerSync.onPushReject) MultiplayerSync.onPushReject(() => {
                showPieceNotice('Salvataggio annullato: la partita online è più avanti. Ricarico lo stato aggiornato.');
            });
        } else {
            loadAutoSave();
        }
    }

    // Presenza aggiornata da Firestore: si tiene la mappa e si ridipinge la palette
    // (solo l'editor ce l'ha; sulla plancia non fa nulla).
    function applyPresence(map) {
        presenceMap = map || {};
        if (document.getElementById('palette')) initPalette();
    }

    // Geometria della mappa (bordo delle province, ancoraggi di terra e di mare):
    // vive in js/map-anchors.js, che non sa nulla del gioco ed è verificabile da
    // solo. Qui restano solo gli alias, per non riscrivere mezzo file.
    // ATTENZIONE: alias dichiarati come `function` e non come `const arrow`. initMap()
    // gira in cima a questa closure e da lì scende fino a renderResourceMarkers: un
    // `const` più in basso nel file è ancora nella sua zona morta e lancia
    // "Cannot access before initialization". L'errore veniva inghiottito dal
    // try/catch di loadAutoSave e la partita salvata non si caricava più (la plancia
    // diceva "Partita non avviata"). Le function declaration sono hoistate: nessun buco.
    function boundaryPoints(p) { return MapAnchors.boundaryPoints(p); }

    // Registra un punto in una griglia spaziale (hash) su una cella e le 8 adiacenti,
    // cosi' due punti a cavallo del bordo di cella si incontrano lo stesso.
    function hashPoint(cells, id, x, y, cell) {
        const cx = Math.round(x / cell), cy = Math.round(y / cell);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = (cx + dx) + ':' + (cy + dy);
                let set = cells.get(key);
                if (!set) { set = new Set(); cells.set(key, set); }
                set.add(id);
            }
        }
    }

    // Costruisce un grafo di adiacenza da una griglia: due province che condividono
    // almeno una cella sono vicine.
    function graphFromCells(cells, ids) {
        const graph = {};
        ids.forEach(id => { graph[id] = new Set(); });
        cells.forEach(set => {
            if (set.size < 2) return;
            const arr = Array.from(set);
            for (let i = 0; i < arr.length; i++)
                for (let j = i + 1; j < arr.length; j++) {
                    graph[arr[i]].add(arr[j]);
                    graph[arr[j]].add(arr[i]);
                }
        });
        return graph;
    }

    // Campiona il perimetro di ogni provincia una sola volta (densita' alta) e produce
    // DUE grafi di adiacenza:
    //   - full: griglia grossa -> include anche i brevi salti via mare (per usi futuri: navi)
    //   - land: griglia fine   -> solo confini che si toccano davvero via terra.
    // Idea: un confine condiviso ha punti quasi coincidenti sui due lati (distanza ->0 con
    // molti campioni), mentre uno stretto di mare mantiene un divario -> nella griglia fine
    // i due lati non condividono celle e il collegamento sparisce.
    // Le province VERE: i path.state che hanno un id. L'alone costiero
    // (map-decor.js) è un clone congelato di #map-group con gli id rimossi, e
    // ha la stessa classe: senza questo filtro entrava nel grafo delle adiacenze
    // come un unico nodo "" confinante con tutto il mondo (e finiva anche nei
    // presidi neutrali). Unica porta d'accesso all'elenco delle province.
    function provincePaths(svg) {
        const root = svg || document.querySelector('svg');
        if (!root) return [];
        return Array.from(root.querySelectorAll('path.state')).filter(p => isPlayableProvince(p.id));
    }

    function computeNeighborGraph(svg) {
        const CELL_FULL = 0.6;    // griglia grossa (comportamento storico, permissivo)
        const CELL_LAND = 0.32;   // griglia fine: separa terra (contatto) da mare (divario)
        const cellsFull = new Map();
        const cellsLand = new Map();
        const ids = [];

        provincePaths(svg).forEach(path => {
            const id = path.id;
            ids.push(id);
            const pts = boundaryPoints(path);
            for (let i = 0; i < pts.length; i++) {
                hashPoint(cellsFull, id, pts[i].x, pts[i].y, CELL_FULL);
                hashPoint(cellsLand, id, pts[i].x, pts[i].y, CELL_LAND);
            }
        });

        return { full: graphFromCells(cellsFull, ids), land: graphFromCells(cellsLand, ids) };
    }

    // Inietta una sola volta i <symbol> delle risorse nei <defs> del root SVG.
    // Parsing via DOMParser (image/svg+xml) per preservare viewBox/camelCase.
    function injectResourceDefs(svg) {
        if (typeof RESOURCE_SYMBOLS === 'undefined') return;
        if (svg.querySelector('#res-defs')) return;
        const doc = new DOMParser().parseFromString(
            `<svg xmlns="${SVG_NS}"><defs id="res-defs">${RESOURCE_SYMBOLS}</defs></svg>`,
            'image/svg+xml'
        );
        const defs = doc.querySelector('#res-defs');
        if (defs) svg.insertBefore(document.importNode(defs, true), svg.firstChild);
    }

    // Risorsa attualmente assegnata a una provincia (attributo runtime data-resource).
    function resourceKeyOf(path) {
        const k = path.getAttribute('data-resource');
        return (k && typeof RESOURCES !== 'undefined' && RESOURCES[k]) ? k : '';
    }

    function pointInPath(path, x, y) { return MapAnchors.pointInPath(path, x, y); }

    // Ancora dell'icona-risorsa: individua il CORPO PRINCIPALE della provincia
    // (ignora isole lontane usando la mediana dei punti del perimetro), poi sceglie
    // un angolo di quel corpo e garantisce che il centro dell'icona cada dentro il
    // poligono (isPointInFill). Cosi' l'icona non sfora in mare o in un'altra provincia.
    function mainBodyBBox(path) { return MapAnchors.mainBodyBBox(path); }

    function markerAnchor(path) {
        const bb = mainBodyBBox(path);
        if (!bb) return null;
        const mx = bb.x, my = bb.y, mw = bb.w, mh = bb.h;

        const size = Math.max(RES_SIZE_MIN, Math.min(Math.min(mw, mh) * 0.5, RES_SIZE));
        const inset = size * 0.6;
        const ccx = mx + mw / 2, ccy = my + mh / 2; // centro del corpo principale
        const corners = [
            [mx + inset, my + inset],               // alto-sinistra (preferito)
            [mx + mw - inset, my + inset],          // alto-destra
            [mx + inset, my + mh - inset],          // basso-sinistra
            [mx + mw - inset, my + mh - inset],     // basso-destra
            [ccx, ccy]                              // centro (ultima spiaggia)
        ];
        let cx = ccx, cy = ccy;
        for (const [qx, qy] of corners) {
            let ok = null;
            // Dall'angolo scivola verso il centro finche' il punto e' dentro il poligono.
            for (let t = 0; t <= 1.0001; t += 0.2) {
                const px = qx + (ccx - qx) * t, py = qy + (ccy - qy) * t;
                if (pointInPath(path, px, py)) { ok = [px, py]; break; }
            }
            if (ok) { cx = ok[0]; cy = ok[1]; break; }
        }
        return { x: cx - size / 2, y: cy - size / 2, size };
    }

    // Disegna (o ridisegna) l'icona-risorsa ancorata al corpo principale di UNA
    // provincia. Piccola e in un angolo, cosi' lascia il centro libero per
    // soldati/citta'/mercati/strade. Nascosta se la provincia e' in nebbia.
    function renderMarkerForPath(svg, path) {
        svg.querySelectorAll(`.resource-marker[data-prov="${CSS.escape(path.id)}"]`).forEach(m => m.remove());
        const key = resourceKeyOf(path);
        if (!key) return;
        const a = markerAnchor(path);
        if (!a) return;
        const use = document.createElementNS(SVG_NS, 'use');
        use.setAttribute('href', '#res-' + key);
        use.setAttributeNS(XLINK_NS, 'href', '#res-' + key);
        use.setAttribute('x', a.x);
        use.setAttribute('y', a.y);
        use.setAttribute('width', a.size);
        use.setAttribute('height', a.size);
        use.setAttribute('class', 'resource-marker');
        use.setAttribute('data-prov', path.id);
        use.setAttribute('pointer-events', 'none');
        if (path.classList.contains('fog')) use.style.display = 'none';
        svg.appendChild(use);
    }

    // Ridisegna tutti i marker dall'attributo data-resource di ogni provincia.
    function renderResourceMarkers(svg) {
        if (typeof RESOURCES === 'undefined') return;
        injectResourceDefs(svg);
        svg.querySelectorAll('.resource-marker').forEach(m => m.remove());
        provincePaths(svg).forEach(path => renderMarkerForPath(svg, path));
        // Le strade schivano le icone-risorsa (vedi freeRoadIndex): se le icone
        // cambiano, le strade vanno rifatte o resterebbero sotto quelle nuove.
        renderRoads(svg);
    }

    // Snapshot { provinceId: risorsa } delle sole province con risorsa assegnata.
    function collectResources(svg) {
        const out = {};
        provincePaths(svg).forEach(p => {
            const k = resourceKeyOf(p);
            if (k) out[p.id] = k;
        });
        return out;
    }

    // Applica uno snapshot risorse (autoritativo): le province non presenti
    // restano senza risorsa. Usato al caricamento di stato salvato/cloud.
    function applyResourceState(map) {
        const svg = document.querySelector('svg');
        if (!svg || !map || typeof map !== 'object') return;
        provincePaths(svg).forEach(p => {
            const k = map[p.id];
            if (k && typeof RESOURCES !== 'undefined' && RESOURCES[k]) p.setAttribute('data-resource', k);
            else p.removeAttribute('data-resource');
        });
        renderResourceMarkers(svg);
    }

    // ====================== RELIGIONE ======================
    // La fede di una provincia vive nell'attributo data-religione, come la
    // risorsa. È dato di mappa (parte della posizione di partenza), non di
    // partita: viaggia negli snapshot accanto a resources/pieces/roads.
    function religionKeyOf(path) {
        const raw = path && path.getAttribute('data-religione');
        if (!raw || typeof Religions === 'undefined') return '';
        // Canonicalizza: una fede ritirata (data d'archivio o mappa vecchia) si
        // legge come quella in cui è confluita (Religions.LEGACY), così non svanisce.
        const k = Religions.canonical(raw);
        return Religions.exists(k) ? k : '';
    }

    // ====================== TERRENO ======================
    // Il terreno (§9) non è stato di partita né dato di mappa modificabile: è la
    // geografia, sempre uguale, e sta in data/province_terrain.js. Non entra
    // negli snapshot e non si dipinge nell'editor — si legge e basta. Memoizzato
    // sull'elemento perché la vista-mappa per terreno lo chiede a tutte e 628 le
    // province a ogni refresh, e provinceLabel non è gratis.
    function terrainKeyOf(path) {
        if (!path || typeof Terrain === 'undefined') return '';
        if (path.__terrain === undefined) path.__terrain = Terrain.of(provinceLabel(path));
        return path.__terrain;
    }

    // Snapshot { provinceId: fede } delle sole province con religione assegnata.
    // Il suffisso '*' marca la fede FISSATA dalla conquista (data-fede-conq): così
    // viaggia nel salvataggio e uno scisma incontrato dopo un ricaricamento non la
    // tocca (§la fede segue la spada).
    function collectReligions(svg) {
        const out = {};
        provincePaths(svg || document.querySelector('svg')).forEach(p => {
            const k = religionKeyOf(p);
            if (!k) return;
            out[p.id] = p.getAttribute('data-fede-conq') ? k + '*' : k;
        });
        return out;
    }

    // Applica uno snapshot religioni: le province presenti prendono la fede
    // indicata, le altre restano come stanno (uno snapshot vuoto non spoglia la
    // mappa dei seed iniziali). Il '*' finale ripristina il vincolo di conquista.
    // Poi ridisegna, perché la vista-fede dipende da qui.
    function applyReligionState(map) {
        const svg = document.querySelector('svg');
        if (!svg || !map || typeof map !== 'object') return;
        provincePaths(svg).forEach(p => {
            let v = map[p.id];
            if (typeof v !== 'string' || !v) return;
            const locked = v.charAt(v.length - 1) === '*';
            if (locked) v = v.slice(0, -1);
            const k = (typeof Religions !== 'undefined') ? Religions.canonical(v) : v;
            if (k && typeof Religions !== 'undefined' && Religions.exists(k)) {
                p.setAttribute('data-religione', k);
                if (locked) p.setAttribute('data-fede-conq', '1');
                else p.removeAttribute('data-fede-conq');
            }
        });
        if (mapPaintMode === 'fede') refreshMapDisplay();
    }

    // Rimette la mappa delle fedi com'era al Mille: ogni provincia torna al suo
    // seed (eccezione per nome, poi blocco regionale — gli stessi due passi di
    // initMap) e nessuna resta agganciata alla corona di un regno (data-fede-conq).
    // La chiama GameActions.startGame, dov'è il calendario a tornare al turno 1:
    // senza, una partita nuova cominciava nel 1000 con l'Inghilterra protestante,
    // perché la Riforma dalla partita PRECEDENTE era rimasta scritta sulla mappa —
    // e da lì in poi gli scismi del calendario non avevano più niente da spezzare.
    function resetReligions() {
        const svg = document.querySelector('svg');
        if (!svg || typeof Religions === 'undefined') return 0;
        let n = 0;
        provincePaths(svg).forEach(p => {
            p.removeAttribute('data-fede-conq');
            let b = null; try { b = p.getBBox(); } catch (e) { b = null; }
            const cx = b ? b.x + b.width / 2 : 0;
            const cy = b ? b.y + b.height / 2 : 0;
            const faith = Religions.seedFaith(provinceLabel(p), cx, cy);
            if (!faith) return;
            if (religionKeyOf(p) !== faith) n++;
            p.setAttribute('data-religione', faith);
        });
        refreshMapDisplay();
        return n;
    }

    // Religione di STATO di un regno = fede della provincia della sua Capitale.
    // Nessuna Capitale → nessuna religione di stato (null).
    //
    // L'ECCEZIONE È CHI NON HA UNA FEDE PROPRIA (l'Orda, `senzaFede` in
    // js/doctrines.js — regola dell'utente: i Mongoli non hanno religione,
    // assimilano quella dei paesi conquistati). Per loro la fede di stato non sta
    // in un seggio ma nelle TERRE: è quella della maggioranza delle province, e
    // cambia da sé man mano che l'impero cambia forma. Vale per quel che si
    // PROFESSA — la plancia, le famiglie di fede, la diplomazia; quel che si
    // IMPONE conquistando è un'altra domanda, e la risposta è "niente"
    // (imposedFaithOf in game-actions.js: la provincia presa tiene i suoi dèi).
    function stateReligionOf(player) {
        if (!player) return null;
        if (typeof Doctrines !== 'undefined' && Doctrines.faithless(player)) {
            return assimilatedFaithOf(player.name);
        }
        // getCapitalPathFor cerca per COLORE: vuole il record del giocatore,
        // non il suo nome (col nome trovava sempre null e ogni regno risultava
        // senza religione di stato).
        const cap = getCapitalPathFor(player);
        return cap ? religionKeyOf(cap) : null;
    }

    // La fede ASSIMILATA: la confessione più diffusa fra le province del regno.
    // A parità di province vince la prima incontrata sulla mappa — deterministico,
    // e comunque un pareggio dura un decennio. Null finché non si possiede nulla
    // che abbia una fede.
    function assimilatedFaithOf(playerName) {
        const conta = new Map();
        ownedPaths(playerName).forEach(p => {
            const f = religionKeyOf(p);
            if (f) conta.set(f, (conta.get(f) || 0) + 1);
        });
        let best = null;
        conta.forEach((n, f) => { if (!best || n > best.n) best = { f, n }; });
        return best ? best.f : null;
    }

    // Province possedute da `playerName` la cui fede appartiene alla FAMIGLIA
    // indicata (cristiani, musulmani…): è il conto su cui poggiano gli obiettivi
    // di prestigio ("conquista 3 province cristiane"). `family` null → tutte.
    function provincesByFamily(playerName, family) {
        return ownedPaths(playerName).filter(p => {
            const f = religionKeyOf(p);
            if (!f) return false;
            return !family || (Religions.familyOf(f) === family);
        });
    }

    // ====================== FIGURE (pedine di gioco) ======================
    // Modello "Risiko da tavolo":
    //   - data-pieces  = lista "tipo:quantita" separata da virgole, es.
    //                    "soldato:3,citta:1". Le unita' mobili si impilano (mostrano
    //                    il numero); generale ed edifici restano a 1 (vedi PIECES.max).
    //   - data-pc-color = colore dell'"esercito" su quella provincia (memorizzato al
    //                    piazzamento dal giocatore selezionato). Cosi' le figure hanno
    //                    un colore proprio anche su province senza proprietario.
    // PIECE_NEUTRAL (dichiarato in cima) e' il fallback se non c'e' ne' colore
    // memorizzato ne' proprietario.

    function injectPieceDefs(svg) {
        if (typeof PIECE_SYMBOLS === 'undefined') return;
        if (svg.querySelector('#pc-defs')) return;
        const doc = new DOMParser().parseFromString(
            // xmlns:xlink va dichiarato: i simboli usano <use xlink:href> e il
            // parser XML (image/svg+xml) rifiuta un prefisso non dichiarato.
            `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"><defs id="pc-defs">${PIECE_SYMBOLS}</defs></svg>`,
            'image/svg+xml'
        );
        const defs = doc.querySelector('#pc-defs');
        if (defs) svg.insertBefore(document.importNode(defs, true), svg.firstChild);
    }

    function pieceMax(type) {
        return (typeof PIECES !== 'undefined' && PIECES[type] && PIECES[type].max) || 1;
    }

    // ====================== SCAFI (docs/GAME_DESIGN.md §9.2) ======================
    // Le navi NON si contano come i soldati: ogni scafo è una pedina a sé, con il
    // suo carico di uomini, perché quel numero va MOSTRATO a chi la vede o la
    // intercetta. Due Navi nella stessa provincia sono due scafi distinti: 16
    // uomini possono partire 8+8 su due chiglie dirette a due bersagli diversi.
    //
    //   data-ships = "barca:8,barca:0,vascello:15" — UNA voce per scafo, in ordine.
    //
    // Perché un attributo separato da data-pieces: lì la forma è "tipo:quantità" e
    // una quantità non può portare carichi diversi. Restano però in data-pieces per
    // il CONTEGGIO: piecesOf() sintetizza le voci-nave leggendo di qui, così tutto
    // ciò che vuole solo sapere "quante navi ha" (countPiece, kingdom-stats, la
    // plancia) continua a funzionare senza sapere che esistono gli scafi.
    // Carico massimo di uno scafo (§9.2). È una `function` con i numeri dentro,
    // non un `const` con una tabella, e non è pigrizia: `initMap` → `loadAutoSave`
    // → `applyPieceState` legge gli scafi PRIMA che i `const` di questa metà della
    // closure siano inizializzati, quindi una tabella dichiarata qui sarebbe ancora
    // nella sua zona morta ("Cannot access before initialization"). L'errore lo
    // inghiottiva il try/catch di loadAutoSave e lo stato salvato non si caricava
    // più. Le dichiarazioni di funzione sono hoistate e il buco non esiste — è la
    // stessa ragione per cui gli alias di MapAnchors sono `function` (CLAUDE.md).
    function shipCapacity(tipo) {
        if (tipo === 'barca') return 8;
        if (tipo === 'vascello') return 15;
        return 0;
    }

    function shipsOf(path) {
        const raw = path.getAttribute('data-ships');
        if (!raw) return [];
        const out = [];
        raw.split(',').forEach(tok => {
            const parts = tok.split(':');
            const tipo = (parts[0] || '').trim();
            if (SHIP_TYPES.indexOf(tipo) < 0) return;
            const n = parseInt(parts[1], 10);
            out.push({ tipo, carico: Math.max(0, Math.min(n > 0 ? n : 0, shipCapacity(tipo))) });
        });
        return out;
    }

    function setShips(path, arr) {
        const s = (arr || []).map(e => e.tipo + ':' + (e.carico || 0)).join(',');
        if (s) path.setAttribute('data-ships', s);
        else path.removeAttribute('data-ships');
    }

    function addShip(path, tipo, carico) {
        if (SHIP_TYPES.indexOf(tipo) < 0) return;
        const arr = shipsOf(path);
        arr.push({ tipo, carico: Math.max(0, Math.min(carico || 0, shipCapacity(tipo))) });
        setShips(path, arr);
    }

    // Toglie l'ULTIMO scafo di quel tipo (è quello appena messo: il pennello
    // dell'editor e il ritiro di una costruzione tolgono sempre l'ultimo).
    function removeShip(path, tipo) {
        const arr = shipsOf(path);
        for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].tipo === tipo) { arr.splice(i, 1); break; }
        }
        setShips(path, arr);
    }

    // ====================== MERCENARI (docs/GAME_DESIGN.md §5.3) ======================
    // Quanti dei soldati di una provincia sono di ventura: data-merc="3".
    // Vive sul PATH e non sul record del giocatore perche' le truppe appartengono
    // a chi possiede la provincia (esattamente come le navi, §9.2): cosi' la quota
    // viaggia negli snapshot, sopravvive a un editto e non serve un secondo libro
    // mastro da tenere allineato.
    //
    // INVARIANTE: data-merc <= soldati presenti. La impone `setMerc`, e
    // `changePiece` la riapplica ogni volta che i soldati calano — nessun percorso
    // (pennello dell'editor compreso) puo' lasciare piu' mercenari che uomini.
    // Le funzioni sono dichiarate `function` apposta: `applyPieceState` gira in
    // cima alla closure, dove un `const` sarebbe ancora nella sua zona morta
    // (stessa ragione degli alias di MapAnchors, vedi CLAUDE.md).
    function mercOf(path) {
        const n = parseInt(path.getAttribute('data-merc'), 10);
        return n > 0 ? n : 0;
    }

    function setMerc(path, n) {
        const v = Math.max(0, Math.min(Math.floor(n || 0), countPiece(path, 'soldato')));
        if (v > 0) path.setAttribute('data-merc', String(v));
        else path.removeAttribute('data-merc');
    }

    // MIGLIORIE CIVICHE (§6.1): Sanità e Felicità vivono in data-welfare, una voce
    // per edificio nel formato `chiave:turnoCostruzione(:d se dormiente)`, es.
    // "acquedotto:4,teatro:6:d". Stanno sul PATH, non sul record del regno: sono
    // costruzioni della città-capitale e viaggiano con la provincia — spostare la
    // Capitale le lascia sulla vecchia sede (non contano più), conquistarla le
    // regala al vincitore. `turno` serve alla manutenzione (§6.1): garantisce un
    // primo ciclo pieno prima del primo prelievo. `dormiente` = manutenzione
    // saltata una volta: non conta più per il Benessere finché non si paga, e al
    // secondo salto crolla. Solo game-actions le muta; qui c'è il deposito.
    // Salvataggi vecchi ("acquedotto" senza turno) → turno 0, attiva: si migrano
    // da soli.
    function welfareOf(path) {
        if (!path) return [];
        const raw = path.getAttribute('data-welfare');
        if (!raw) return [];
        const out = [];
        raw.split(',').forEach(tok => {
            const parts = tok.split(':');
            const key = (parts[0] || '').trim();
            if (!key || typeof GameRules === 'undefined' || !GameRules.WELFARE_INDEX[key]) return;
            const turn = parseInt(parts[1], 10);
            out.push({ key, turn: turn > 0 ? turn : 0, dormant: parts.indexOf('d') >= 1 });
        });
        return out;
    }

    function setWelfare(path, list) {
        if (!path) return;
        // Accetta voci come oggetti {key,turn,dormant} o stringhe "chiave:turno:d".
        // Deduplica per chiave, preserva l'ordine, scarta le chiavi sconosciute.
        const seen = {};
        const toks = [];
        (list || []).forEach(e => {
            let key, turn, dormant;
            if (typeof e === 'string') {
                const p = e.split(':'); key = (p[0] || '').trim();
                turn = parseInt(p[1], 10); dormant = p.indexOf('d') >= 1;
            } else if (e && typeof e === 'object') { key = e.key; turn = e.turn; dormant = e.dormant; }
            if (!key || seen[key]) return;
            if (typeof GameRules !== 'undefined' && !GameRules.WELFARE_INDEX[key]) return;
            seen[key] = 1;
            let t = key + ':' + (turn > 0 ? turn : 0);
            if (dormant) t += ':d';
            toks.push(t);
        });
        if (toks.length) path.setAttribute('data-welfare', toks.join(','));
        else path.removeAttribute('data-welfare');
    }

    // Elenco (validato, con quantita') delle figure di una provincia: [{type,count}].
    // Le navi non stanno in data-pieces: si sintetizzano dagli scafi, così chi
    // conta non deve sapere nulla di carichi e chiglie.
    function piecesOf(path) {
        const out = [];
        const raw = path.getAttribute('data-pieces');
        if (raw) raw.split(',').forEach(tok => {
            const parts = tok.split(':');
            const type = (parts[0] || '').trim();
            if (!type || typeof PIECES === 'undefined' || !PIECES[type]) return;
            if (SHIP_TYPES.indexOf(type) >= 0) return;   // le navi vivono in data-ships
            let n = parseInt(parts[1], 10);
            if (!(n > 0)) n = 1;
            const ex = out.find(e => e.type === type);
            if (ex) ex.count = Math.min(ex.count + n, pieceMax(type));
            else out.push({ type, count: Math.min(n, pieceMax(type)) });
        });
        shipsOf(path).forEach(s => {
            const ex = out.find(e => e.type === s.tipo);
            if (ex) ex.count++;
            else out.push({ type: s.tipo, count: 1 });
        });
        return out;
    }

    function serializePieces(arr) {
        return arr.filter(e => e.count > 0 && SHIP_TYPES.indexOf(e.type) < 0)
            .map(e => e.type + ':' + e.count).join(',');
    }

    // Applica una lista [{type,count}] alla provincia (svuota gli attributi se vuota).
    // Le voci-nave si ignorano: gli scafi si toccano con addShip/removeShip.
    function setPieces(path, arr) {
        const s = serializePieces(arr);
        if (s) path.setAttribute('data-pieces', s);
        else {
            path.removeAttribute('data-pieces');
            if (!path.getAttribute('data-ships')) path.removeAttribute('data-pc-color');
        }
    }

    // +1 / -1 di un tipo (rispetta il max; '__erase__' svuota tutto).
    function changePiece(path, type, delta) {
        if (type === '__erase__') {
            path.removeAttribute('data-pieces');
            path.removeAttribute('data-ships');
            path.removeAttribute('data-pc-color');
            path.removeAttribute('data-merc');
            return;
        }
        if (typeof PIECES === 'undefined' || !PIECES[type]) return;
        if (SHIP_TYPES.indexOf(type) >= 0) {
            if (delta > 0) addShip(path, type, 0); else removeShip(path, type);
            return;
        }
        const max = pieceMax(type);
        const arr = piecesOf(path);
        const e = arr.find(x => x.type === type);
        if (!e) { if (delta > 0) arr.push({ type, count: Math.min(delta, max) }); }
        else { e.count = Math.max(0, Math.min(e.count + delta, max)); }
        setPieces(path, arr);
        // Rete di sicurezza dell'invariante dei mercenari: se i soldati calano, la
        // ventura non puo' restare piu' numerosa di loro. Chi vuole decidere QUALI
        // uomini se ne vanno (partenze proporzionali, perdite alla ventura per
        // prima) lo fa esplicitamente in game-actions.js: qui si tappa e basta.
        if (type === 'soldato' && delta < 0) setMerc(path, mercOf(path));
    }

    function ownerColorHex(path) {
        const owner = path.getAttribute('data-owner');
        const pObj = owner ? PLAYERS.find(p => p.name === owner) : null;
        return pObj ? pObj.color : null;
    }

    // Colore delle figure: colore memorizzato > colore proprietario > neutro.
    function pieceColorOf(path) {
        return path.getAttribute('data-pc-color') || ownerColorHex(path) || PIECE_NEUTRAL;
    }

    // Disegna (o ridisegna) le figure di UNA provincia: una fila compatta, piccola,
    // ancorata dentro il corpo della provincia (le navi in mare aperto accanto alla
    // costa) e ridotta per stare nello spazio libero. I tipi impilabili mostrano un
    // pallino col numero. Nascoste in nebbia.
    // Il centro del bounding box NON va bene come ancora: su Messico, Norvegia o
    // Cile cade fuori dalla provincia. Le ancore le calcola map-anchors.js, che
    // restituisce anche il raggio libero: la fila non deve sbordare da lì.
    function renderPiecesForPath(svg, path) {
        svg.querySelectorAll(`.piece-marker[data-prov="${CSS.escape(path.id)}"]`).forEach(m => m.remove());
        const arr = piecesOf(path);
        if (!arr.length) return;
        const bb = mainBodyBBox(path);
        if (!bb) return;
        const color = pieceColorOf(path);
        const fogged = path.classList.contains('fog');
        const sizeBase = Math.max(PIECE_SIZE_MIN, Math.min(Math.min(bb.w, bb.h) * 0.45, PIECE_SIZE));

        const land = arr.filter(e => SHIP_TYPES.indexOf(e.type) < 0 && e.type !== 'strada');
        // Una pedina PER SCAFO, non una pedina col numero di navi: ognuna mostra il
        // proprio carico di uomini (§9.2). È la ragione per cui gli scafi non si
        // impilano — quel numero serve a chi le guarda, non solo a chi le muove.
        const ships = shipsOf(path).map(s => ({ type: s.tipo, count: 1, badge: s.carico }));

        if (land.length) {
            const a = MapAnchors.landAnchor(path) || { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, r: bb.w / 2 };
            drawPieceRow(svg, path, land, a.x, a.y, sizeBase, Math.min(bb.w * 0.9, Math.max(a.r * 2.2, sizeBase * 1.5)), color, fogged);
        }
        if (ships.length) {
            const a = seaAnchor(path);
            if (a) drawPieceRow(svg, path, ships, a.x, a.y, sizeBase, Math.min(bb.w * 1.6, Math.max(a.r * 2.2, sizeBase * 1.5)), color, fogged);
            else {
                const l = MapAnchors.landAnchor(path) || { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, r: bb.w / 2 };
                drawPieceRow(svg, path, ships, l.x, l.y, sizeBase, Math.min(bb.w * 0.9, l.r * 2.2), color, fogged);
            }
        }
    }

    // Disegna una fila di figure centrata su (cx,cy), rimpicciolita per stare in maxW.
    function drawPieceRow(svg, path, arr, cx, cy, sizeBase, maxW, color, fogged) {
        const n = arr.length;
        let size = Math.min(sizeBase, PIECE_SIZE);
        const gapR = 0.12;
        let totalW = n * size + (n - 1) * size * gapR;
        // La fila si stringe per stare nello spazio libero, ma MAI sotto il
        // pavimento: era qui che nascevano le pedine da 1,7 (tre figure in una
        // provincia stretta). Meglio una fila che sborda di un soffio di una
        // che non si vede.
        if (totalW > maxW) {
            size = Math.max(size * (maxW / totalW), PIECE_SIZE_MIN);
            totalW = n * size + (n - 1) * size * gapR;
        }
        const step = size * (1 + gapR);
        const startX = cx - totalW / 2;

        const add = (el) => {
            el.setAttribute('class', 'piece-marker');
            el.setAttribute('data-prov', path.id);
            el.setAttribute('pointer-events', 'none');
            el.style.color = color;
            if (fogged) el.style.display = 'none';
            svg.appendChild(el);
        };

        arr.forEach((e, i) => {
            const x = startX + i * step, y = cy - size / 2;
            const use = document.createElementNS(SVG_NS, 'use');
            use.setAttribute('href', '#pc-' + e.type);
            use.setAttributeNS(XLINK_NS, 'href', '#pc-' + e.type);
            use.setAttribute('x', x);
            use.setAttribute('y', y);
            use.setAttribute('width', size);
            use.setAttribute('height', size);
            add(use);

            // `badge` = numero da mostrare sempre (il carico di uno scafo, anche 0);
            // altrimenti si mostra la quantità, e solo se vale la pena.
            const badge = (e.badge !== undefined) ? e.badge : (e.count > 1 ? e.count : null);
            if (badge !== null) {
                const bx = x + size * 0.84, by = y + size * 0.16, br = size * 0.26;
                const c = document.createElementNS(SVG_NS, 'circle');
                c.setAttribute('cx', bx); c.setAttribute('cy', by); c.setAttribute('r', br);
                c.setAttribute('fill', '#fff');
                // Anello scuro come il contorno delle pedine: il numero deve
                // leggersi anche sopra una provincia del colore del giocatore.
                c.setAttribute('stroke', PIECE_INK);
                c.setAttribute('stroke-width', size * 0.07);
                add(c);
                const t = document.createElementNS(SVG_NS, 'text');
                t.setAttribute('x', bx); t.setAttribute('y', by);
                t.setAttribute('text-anchor', 'middle');
                t.setAttribute('dominant-baseline', 'central');
                t.setAttribute('font-size', br * 1.4);
                t.setAttribute('font-weight', 'bold');
                t.setAttribute('font-family', 'sans-serif');
                t.setAttribute('fill', 'currentColor');
                t.textContent = badge;
                add(t);
            }
        });
    }

    // Ridisegna tutte le figure dall'attributo data-pieces di ogni provincia.
    function renderPieceMarkers(svg) {
        if (typeof PIECES === 'undefined') return;
        injectPieceDefs(svg);
        svg.querySelectorAll('.piece-marker').forEach(m => m.remove());
        provincePaths(svg).forEach(path => renderPiecesForPath(svg, path));
        renderExpeditions(svg);
    }

    // SPEDIZIONI OLTREMARE (§9.2, rotte lunghe): i Velieri in rotta lunga stanno in
    // mare aperto, fuori da ogni provincia, quindi non hanno un `data-ships` su cui
    // appoggiarsi — vivono nel record del giocatore (player.spedizioni) e qui si
    // disegnano al loro (x,y). Solo quelle del regno che sta guardando: una
    // spedizione nemica non si vede (come le spie, la nebbia è di chi guarda). In
    // vista generale (nessun focus) non se ne mostra nessuna.
    function drawExpedition(svg, exp, color) {
        const size = PIECE_SIZE;   // come una pedina qualunque: la misura è una sola
        const x = exp.x - size / 2, y = exp.y - size / 2;
        const add = (el) => {
            el.setAttribute('class', 'exped-marker');
            el.setAttribute('pointer-events', 'none');
            el.style.color = color;
            svg.appendChild(el);
        };
        const use = document.createElementNS(SVG_NS, 'use');
        use.setAttribute('href', '#pc-vascello');
        use.setAttributeNS(XLINK_NS, 'href', '#pc-vascello');
        use.setAttribute('x', x); use.setAttribute('y', y);
        use.setAttribute('width', size); use.setAttribute('height', size);
        add(use);
        // Il carico a bordo, nel pallino, come su ogni scafo (§9.2).
        const bx = x + size * 0.84, by = y + size * 0.16, br = size * 0.26;
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', bx); c.setAttribute('cy', by); c.setAttribute('r', br);
        c.setAttribute('fill', '#fff');
        c.setAttribute('stroke', PIECE_INK);
        c.setAttribute('stroke-width', size * 0.07);
        add(c);
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', bx); t.setAttribute('y', by);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('font-size', br * 1.4);
        t.setAttribute('font-weight', 'bold');
        t.setAttribute('font-family', 'sans-serif');
        t.setAttribute('fill', 'currentColor');
        t.textContent = exp.carico;
        add(t);
    }

    function renderExpeditions(svg) {
        svg.querySelectorAll('.exped-marker').forEach(m => m.remove());
        const focus = PLAYERS.find(p => p.id === selectedTabPlayerId);
        if (!focus || !Array.isArray(focus.spedizioni)) return;
        const color = focus.color || PIECE_INK;
        focus.spedizioni.forEach(exp => {
            if (typeof exp.x === 'number' && typeof exp.y === 'number') {
                drawExpedition(svg, exp, color);
            }
        });
    }

    // Snapshot { provinceId: { t:"soldato:3,citta:1", c:"#e6194B" } } delle province con figure.
    function collectPieces(svg) {
        const out = {};
        provincePaths(svg).forEach(p => {
            const t = p.getAttribute('data-pieces');
            const s = p.getAttribute('data-ships');   // scafi, §9.2
            const w = p.getAttribute('data-welfare'); // migliorie civiche, §6.1
            if (!t && !s && !w) return;
            const entry = {};
            if (t) entry.t = t;
            if (s) entry.s = s;
            if (w) entry.w = w;
            const m = p.getAttribute('data-merc');   // mercenari, §5.3
            if (m) entry.m = m;
            const c = p.getAttribute('data-pc-color');
            if (c) entry.c = c;
            out[p.id] = entry;
        });
        return out;
    }

    // Applica uno snapshot figure (autoritativo). Accetta il formato nuovo
    // {t,c} oppure il vecchio (stringa "a,b" senza quantita').
    // Applica la voce-figure di UNA provincia (formato nuovo {t,s,w,m,c} o vecchio
    // stringa/array). Estratta dal ciclo di applyPieceState perché serve anche a
    // applyAdminDiff, che tocca solo le province cambiate senza spogliare le altre.
    // v null/undefined/vuoto = provincia sgombra.
    function applyPieceEntry(p, v) {
        let str = '', ships = '', color = '', merc = 0, welfare = '';
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            str = v.t || ''; ships = v.s || ''; color = v.c || '';
            merc = parseInt(v.m, 10) || 0;
            welfare = v.w || '';
        }
        else if (typeof v === 'string') str = v;
        else if (Array.isArray(v)) str = v.join(',');

        // Salvataggi vecchi: le navi stavano in data-pieces come "barca:2".
        // Si convertono in altrettanti scafi vuoti — nessuna migrazione a mano.
        const arr = piecesFromString(str);
        const hulls = [];
        if (ships) {
            ships.split(',').forEach(tok => {
                const parts = tok.split(':');
                const tipo = (parts[0] || '').trim();
                if (SHIP_TYPES.indexOf(tipo) < 0) return;
                const n = parseInt(parts[1], 10);
                hulls.push({ tipo, carico: n > 0 ? n : 0 });
            });
        } else {
            arr.forEach(e => {
                if (SHIP_TYPES.indexOf(e.type) < 0) return;
                for (let i = 0; i < e.count; i++) hulls.push({ tipo: e.type, carico: 0 });
            });
        }

        const land = serializePieces(arr);   // filtra da sé le voci-nave
        if (land) p.setAttribute('data-pieces', land); else p.removeAttribute('data-pieces');
        setShips(p, hulls);
        setWelfare(p, welfare ? welfare.split(',') : []);   // migliorie civiche, §6.1
        setMerc(p, merc);   // si clampa da sé sui soldati appena applicati (§5.3)
        if ((land || hulls.length) && color) p.setAttribute('data-pc-color', color);
        else p.removeAttribute('data-pc-color');
    }

    function applyPieceState(map) {
        const svg = document.querySelector('svg');
        if (!svg || !map || typeof map !== 'object') return;
        provincePaths(svg).forEach(p => applyPieceEntry(p, map[p.id]));
        renderPieceMarkers(svg);
    }

    // ====================== STRADE (collegamenti tra province) ======================
    // Una strada unisce DUE province adiacenti via terra ed e' disegnata a meta'
    // del loro confine comune. ROADS = [{a, b, c}] (id province + colore).
    function roadKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
    function findRoad(a, b) { const k = roadKey(a, b); return ROADS.find(r => roadKey(r.a, r.b) === k); }

    function areLandAdjacent(a, b) {
        const set = NEIGHBORS_LAND[a];
        if (!set) return false;
        return set.has ? set.has(b) : (Array.isArray(set) && set.indexOf(b) >= 0);
    }

    function toggleRoad(aId, bId, color) {
        const existing = findRoad(aId, bId);
        if (existing) { ROADS = ROADS.filter(r => r !== existing); return 'removed'; }
        ROADS.push({ a: aId, b: bId, c: color || PIECE_NEUTRAL });
        return 'added';
    }

    // Quanto e' lunga una strada, cioe' quanto sporge di traverso al confine.
    // Unica fonte della misura: chi la vuole diversa tocca solo questa riga.
    // Piccola apposta (poco piu' di due unita' su province da dieci): sono decine
    // di segni sparsi su una mappa gia' piena, e il primo difetto di questa roba
    // e' l'affollamento, non l'invisibilita'.
    function roadSpan(ref) { return Math.max(1.5, Math.min(ref * 0.085, 2.4)); }

    // Quanto confine si percorre, per lato, per misurarne la direzione. NON e' la
    // lunghezza della strada: e' una misura della geografia e resta fissa anche se
    // la strada si rimpicciolisce. Corto prende la frastagliatura del bordo, lungo
    // da' la corda di tutto il confine e la strada esce storta.
    // `function` e non `const`: renderRoads gira da initMap (in cima alla closure),
    // quindi un `const` qui sarebbe ancora in zona morta — vedi la nota sugli alias
    // di MapAnchors. L'errore finiva nel try/catch di loadAutoSave e la partita
    // salvata non si caricava piu': "Partita non avviata" a turno in corso.
    function roadTangentR() { return 1.6; }

    // DOVE sta una strada e COM'E' GIRATA. Il punto di mezzo non basta: serve
    // l'inclinazione del CONFINE, perche' la strada lo taglia di traverso —
    // verticale su un confine orizzontale e viceversa. La direzione NON puo'
    // venire dai centri delle due province: su un confine a L, o fra province
    // di forma strana, punta altrove e la strada finisce di sbieco o dentro una
    // provincia. Si misura sui punti dove i due bordi si TOCCANO davvero.
    // La geografia non cambia mai: il risultato si memoizza sull'elemento.
    function roadPlacement(A, B) {
        const cache = A.__roadGeom || (A.__roadGeom = {});
        if (!(B.id in cache)) cache[B.id] = computeRoadPlacement(A, B);
        return cache[B.id];
    }

    function computeRoadPlacement(A, B) {
        const ba = mainBodyBBox(A), bb = mainBodyBBox(B);
        if (!ba || !bb) return null;
        const ref = Math.min(Math.min(ba.w, ba.h), Math.min(bb.w, bb.h));
        // Il confine condiviso puo' stare solo dove i due riquadri si sovrappongono:
        // scartare subito il resto del bordo fa la differenza fra 120 ms e 5 ms per
        // strada (Russia e Canada hanno migliaia di punti di bordo). Se il ritaglio
        // lascia troppo poco (province a isole, il cui riquadro principale non copre
        // tutto) si ricade sui punti interi: meglio lento che sbagliato.
        const pad = 3;
        const box = { x0: Math.max(ba.x, bb.x) - pad, y0: Math.max(ba.y, bb.y) - pad,
                      x1: Math.min(ba.x + ba.w, bb.x + bb.w) + pad, y1: Math.min(ba.y + ba.h, bb.y + bb.h) + pad };
        const clip = pts => {
            const out = pts.filter(p => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1);
            return out.length >= 3 ? out : pts;
        };
        const pa = clip(boundaryPoints(A)), pb = clip(boundaryPoints(B));
        // Punti di contatto fra i due bordi. Hash spaziale su B: il confronto
        // tutti-contro-tutti costerebbe centinaia di migliaia di distanze.
        const hits = [];
        if (pa.length && pb.length) {
            const CELL = 1.2, grid = new Map();
            for (const p of pb) {
                const k = Math.round(p.x / CELL) + ',' + Math.round(p.y / CELL);
                const cell = grid.get(k);
                if (cell) cell.push(p); else grid.set(k, [p]);
            }
            const thr2 = CELL * CELL;
            for (const p of pa) {
                const gx = Math.round(p.x / CELL), gy = Math.round(p.y / CELL);
                let done = false;
                for (let dx = -1; dx <= 1 && !done; dx++) for (let dy = -1; dy <= 1 && !done; dy++) {
                    const cell = grid.get((gx + dx) + ',' + (gy + dy)); if (!cell) continue;
                    for (const q of cell) {
                        const ex = p.x - q.x, ey = p.y - q.y;
                        if (ex * ex + ey * ey < thr2) {
                            hits.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
                            done = true; break;
                        }
                    }
                }
            }
        }
        const vx = (bb.x + bb.w / 2) - (ba.x + ba.w / 2), vy = (bb.y + bb.h / 2) - (ba.y + ba.h / 2);
        // Ripiego: confine non trovato (bordi mal ritagliati). Meglio una strada
        // storta che nessuna strada — si torna al vecchio criterio dei centri.
        if (hits.length < 3) {
            return { ref, fissa: { x: (ba.x + ba.w / 2 + bb.x + bb.w / 2) / 2,
                                   y: (ba.y + ba.h / 2 + bb.y + bb.h / 2) / 2,
                                   ang: Math.atan2(vy, vx) * 180 / Math.PI } };
        }
        // Il mezzo del confine: il punto di contatto piu' vicino al baricentro dei
        // contatti. Il baricentro da solo, su un confine curvo, cade fuori dal confine.
        let cx = 0, cy = 0;
        for (const h of hits) { cx += h.x; cy += h.y; }
        cx /= hits.length; cy /= hits.length;
        let midIdx = 0, best = Infinity;
        for (let i = 0; i < hits.length; i++) {
            const d = (hits[i].x - cx) * (hits[i].x - cx) + (hits[i].y - cy) * (hits[i].y - cy);
            if (d < best) { best = d; midIdx = i; }
        }
        // PCA sull'intero confine: serve solo come ripiego quando il tratto sotto la
        // strada e' troppo corto per dare una direzione (vedi roadPoseAt).
        let sxx = 0, syy = 0, sxy = 0;
        for (const h of hits) { const dx = h.x - cx, dy = h.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
        const thAll = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        return { ref, hits, midIdx, vx, vy, tAllX: Math.cos(thAll), tAllY: Math.sin(thAll) };
    }

    // Posa della strada su UN punto del confine (indice nell'elenco dei contatti):
    // dove sta e di quanto e' ruotata. E' separata da roadPlacement perche' il punto
    // non e' sempre il mezzo del confine — se li' c'e' un'icona, la strada scivola
    // lungo il confine (vedi freeRoadIndex) e da qui si ricava la posa nuova.
    // Direzione in cui CORRE il confine: non si STIMA con una nuvola di punti, si
    // CAMMINA sul confine. I contatti nascono nell'ordine in cui si percorre il bordo
    // di A, quindi camminare e' scorrere l'array — avanti e indietro dal punto di posa
    // finche' non si e' percorso roadTangentR(). La corda fra i due estremi e' la
    // tangente, e non risente della frastagliatura del bordo come farebbe una PCA su
    // un raggio piccolo. Si interrompe se due contatti consecutivi distano troppo: li'
    // il confine e' in due tronconi e saltare dall'uno all'altro darebbe una direzione
    // inventata.
    function roadPoseAt(geom, idx) {
        const hits = geom.hits, R = roadTangentR();
        const walk = dir => {
            let i = idx, acc = 0;
            while (acc < R) {
                const j = i + dir;
                if (j < 0 || j >= hits.length) break;
                const d = Math.hypot(hits[j].x - hits[i].x, hits[j].y - hits[i].y);
                if (d > 1.5) break;
                acc += d; i = j;
            }
            return hits[i];
        };
        const e0 = walk(-1), e1 = walk(1);
        let tx = e1.x - e0.x, ty = e1.y - e0.y;
        if (Math.hypot(tx, ty) < 0.3) { tx = geom.tAllX; ty = geom.tAllY; }
        let nx = -ty, ny = tx;            // la strada e' perpendicolare al confine
        // Orienta la normale da A verso B (conta solo per il verso, il disegno e' simmetrico).
        if (nx * geom.vx + ny * geom.vy < 0) { nx = -nx; ny = -ny; }
        return { x: hits[idx].x, y: hits[idx].y, ang: Math.atan2(ny, nx) * 180 / Math.PI };
    }

    // Le strade vivono in un LORO strato, subito sopra le terre (#map-group) e
    // sotto i marker (risorse, pedine): questi ultimi sono appesi in coda al root
    // e restano cosi' sempre davanti, senza piu' coprirli con le strade.
    function roadsLayer(svg) {
        let layer = svg.querySelector('#roads-layer');
        if (!layer) {
            layer = document.createElementNS(SVG_NS, 'g');
            layer.setAttribute('id', 'roads-layer');
            layer.setAttribute('pointer-events', 'none');
            const land = svg.querySelector('#map-group');
            if (land && land.nextSibling) svg.insertBefore(layer, land.nextSibling);
            else svg.appendChild(layer);
        }
        return layer;
    }

    // Una strada e' un CANCELLO APERTO: due trattini scuri che tagliano il confine
    // di traverso, col varco in mezzo — il confine passa fra i due. E' un GANCIO,
    // non una carreggiata: deve dire "queste due province sono collegate" e sparire
    // dalla vista, perche' sulla mappa comandano pedine, citta' e risorse.
    // Il gruppo e' ruotato lungo la NORMALE al confine (vedi roadPlacement), quindi
    // i trattini si disegnano in coordinate locali: x = di traverso al confine,
    // y = lungo il confine. Cosi' l'orientamento segue il TIPO di confine da se':
    // trattini verticali su un confine orizzontale, orizzontali su uno verticale.
    // Indice provincia -> riquadri delle sue ICONE-RISORSA, in UNA passata. Non si
    // interroga l'SVG dentro il ciclo delle strade: e' lo stesso errore che faceva
    // costare un secondo a refreshMapDisplay (vedi markerIndex).
    // Le PEDINE non entrano qui apposta: si muovono a ogni turno, e una strada che
    // le schivasse salterebbe di posto a ogni mossa — deve restare un punto fermo
    // della mappa. Le risorse invece si assegnano nell'editor e poi stanno ferme.
    function resourceBoxIndex(svg) {
        const idx = new Map();
        svg.querySelectorAll('.resource-marker').forEach(u => {
            const id = u.getAttribute('data-prov'); if (!id) return;
            const x = parseFloat(u.getAttribute('x')), y = parseFloat(u.getAttribute('y'));
            const w = parseFloat(u.getAttribute('width')), h = parseFloat(u.getAttribute('height'));
            if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return;
            let arr = idx.get(id); if (!arr) { arr = []; idx.set(id, arr); }
            arr.push({ x, y, w, h });
        });
        return idx;
    }

    // Il punto del confine su cui posare la strada: il mezzo, se e' libero. Se li'
    // c'e' un'icona-risorsa la strada SCIVOLA lungo il confine — un punto vale
    // l'altro, purche' sia sul confine giusto — fino al primo libero, cercando
    // alternativamente da una parte e dall'altra per restare il piu' vicino
    // possibile al mezzo. Se e' tutto occupato (province piccole, confine corto)
    // si tiene il mezzo: meglio una strada coperta che una spostata a caso.
    function freeRoadIndex(geom, boxes, L) {
        if (!boxes.length) return geom.midIdx;
        const half = L / 2 + 0.3;   // l'ingombro del segno, non solo il suo centro
        const libero = i => {
            const p = geom.hits[i];
            return !boxes.some(b => p.x + half > b.x && p.x - half < b.x + b.w &&
                                    p.y + half > b.y && p.y - half < b.y + b.h);
        };
        if (libero(geom.midIdx)) return geom.midIdx;
        const MAX = 40;             // quanti contatti al massimo si scorre per lato
        for (let d = 1; d <= MAX; d++) {
            const su = geom.midIdx + d, giu = geom.midIdx - d;
            if (su < geom.hits.length && libero(su)) return su;
            if (giu >= 0 && libero(giu)) return giu;
        }
        return geom.midIdx;
    }

    function renderRoads(svg) {
        svg.querySelectorAll('.road-marker').forEach(m => m.remove());
        const layer = roadsLayer(svg);
        const resIdx = ROADS.length ? resourceBoxIndex(svg) : null;
        ROADS.forEach(r => {
            const A = document.getElementById(r.a), B = document.getElementById(r.b);
            if (!A || !B) return;
            const geom = roadPlacement(A, B); if (!geom) return;
            const L = roadSpan(geom.ref);         // quanto sporgono di traverso al confine
            const boxes = (resIdx.get(r.a) || []).concat(resIdx.get(r.b) || []);
            const pos = geom.fissa || roadPoseAt(geom, freeRoadIndex(geom, boxes, L));
            const gap = L * 0.38;                 // il varco, lungo il confine
            const w = Math.max(0.34, L * 0.19);   // piu' grossi del tratto di confine
            const g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('class', 'road-marker');
            g.setAttribute('data-road', roadKey(r.a, r.b));
            g.setAttribute('pointer-events', 'none');
            g.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)}) rotate(${pos.ang.toFixed(1)})`);
            // Scuri, ma non neri: il colore del regno resta riconoscibile da vicino.
            const ink = inkShade(r.c || PIECE_NEUTRAL, 0.62);
            [-gap, gap].forEach(y => {
                const el = document.createElementNS(SVG_NS, 'line');
                el.setAttribute('x1', (-L / 2).toFixed(2)); el.setAttribute('y1', y.toFixed(2));
                el.setAttribute('x2', (L / 2).toFixed(2)); el.setAttribute('y2', y.toFixed(2));
                el.setAttribute('stroke', ink);
                el.setAttribute('stroke-width', w.toFixed(2));
                el.setAttribute('stroke-linecap', 'round');
                g.appendChild(el);
            });
            layer.appendChild(g);
        });
    }

    // Scurisce un colore verso l'inchiostro della mappa: k=0 lo lascia com'e',
    // k=1 lo annerisce. Serve alle strade, che devono essere scure ma restare
    // attribuibili a un regno.
    function inkShade(color, k) {
        const m = /^#([0-9a-fA-F]{6})$/.exec(String(color).trim());
        if (!m) return '#14100b';
        const n = parseInt(m[1], 16);
        const mix = (c, ink) => Math.round(c * (1 - k) + ink * k);
        const r = mix(n >> 16 & 255, 0x14), g = mix(n >> 8 & 255, 0x10), b = mix(n & 255, 0x0b);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function collectRoads() { return ROADS.map(r => ({ a: r.a, b: r.b, c: r.c })); }

    function applyRoadState(list) {
        ROADS = [];
        if (Array.isArray(list)) {
            list.forEach(r => {
                if (r && r.a && r.b && document.getElementById(r.a) && document.getElementById(r.b)) {
                    ROADS.push({ a: r.a, b: r.b, c: r.c || PIECE_NEUTRAL });
                }
            });
        }
        const svg = document.querySelector('svg');
        if (svg) renderRoads(svg);
    }

    // --- Regole di piazzamento (stile Risiko) ---

    // Costa e approdo delle navi: geometria pura, sta in map-anchors.js.
    // Function declaration, non const: vedi la nota su boundaryPoints — questi alias
    // vengono chiamati dal render delle pedine, che parte da initMap in cima al file.
    function isCoastalProvince(path) { return MapAnchors.isCoastal(path); }
    function seaAnchor(path) { return MapAnchors.seaAnchor(path); }

    // Verifica se una figura puo' essere posata sulla provincia. { ok, msg }.
    function canPlacePiece(path, type) {
        if (SHIP_TYPES.indexOf(type) >= 0 && !isCoastalProvince(path)) {
            return { ok: false, msg: 'Le navi si posano solo su province sul mare.' };
        }
        if (SETTLEMENT_GROUP.indexOf(type) >= 0) {
            const other = piecesOf(path).find(e => SETTLEMENT_GROUP.indexOf(e.type) >= 0 && e.type !== type);
            if (other) {
                const nome = (PIECES[other.type] && PIECES[other.type].nome) || other.type;
                return { ok: false, msg: `Qui c'è già ${nome}: Capitale, Città e Fortezza si escludono a vicenda.` };
            }
        }
        // Il Mercato non convive con un insediamento (regola dell'utente): dove c'è
        // una Capitale, una Città o una Fortezza non si costruisce un Mercato, e
        // per la stessa esclusività non si posa un insediamento dove c'è già un Mercato.
        if (type === 'mercato') {
            const s = piecesOf(path).find(e => SETTLEMENT_GROUP.indexOf(e.type) >= 0);
            if (s) {
                const nome = (PIECES[s.type] && PIECES[s.type].nome) || s.type;
                return { ok: false, msg: `Qui c'è già ${nome}: il Mercato vuole una provincia senza insediamento.` };
            }
        }
        if (SETTLEMENT_GROUP.indexOf(type) >= 0 && piecesOf(path).some(e => e.type === 'mercato')) {
            return { ok: false, msg: 'Qui c\'è già un Mercato: non convive con un insediamento.' };
        }
        // Capitale: 1 sola per regno (il "regno" e' identificato dal colore-esercito).
        if (type === 'capitale') {
            const color = selectedPlayer ? selectedPlayer.color
                : (path.getAttribute('data-pc-color') || ownerColorHex(path));
            if (color && PLAYERS.some(p => p.color === color)) {
                const svg = document.querySelector('svg');
                let taken = false;
                if (svg) {
                    provincePaths(svg).forEach(pp => {
                        if (pp === path || taken) return;
                        if (pp.getAttribute('data-pc-color') === color &&
                            piecesOf(pp).some(e => e.type === 'capitale')) taken = true;
                    });
                }
                if (taken) return { ok: false, msg: 'Questo regno ha già una Capitale (1 per regno).' };
            }
        }
        return { ok: true };
    }

    // Avviso non bloccante (toast) per un piazzamento rifiutato.
    function showPieceNotice(msg) {
        let el = document.getElementById('piece-notice');
        if (!el) {
            el = document.createElement('div');
            el.id = 'piece-notice';
            el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);background:#b23b3b;color:#fff;padding:8px 14px;border-radius:6px;font-size:14px;z-index:10000;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;opacity:0;transition:opacity .2s;';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
    }

    // Parsa una stringa "tipo:count,tipo" (count opzionale) in [{type,count}].
    function piecesFromString(str) {
        if (!str) return [];
        const out = [];
        String(str).split(',').forEach(tok => {
            const parts = tok.split(':');
            const type = (parts[0] || '').trim();
            if (!type || typeof PIECES === 'undefined' || !PIECES[type]) return;
            let n = parseInt(parts[1], 10);
            if (!(n > 0)) n = 1;
            const ex = out.find(e => e.type === type);
            if (ex) ex.count = Math.min(ex.count + n, pieceMax(type));
            else out.push({ type, count: Math.min(n, pieceMax(type)) });
        });
        return out;
    }

    // Zoom (rotella) + pan (trascinamento) manipolando il viewBox del root <svg>.
    // Approccio "mappa di gioco": la mappa riempie sempre la cornice (niente scrollbar),
    // lo zoom punta verso il cursore e il pan sposta la vista senza uscire dai confini.
    function wireMapZoom(svg) {
        const wrapper = document.getElementById('map-wrapper');
        if (!wrapper) return;

        // Frazioni di larghezza coperte dai pannelli laterali della plancia: la mappa
        // continua a occupare tutta la cornice, ma il contenuto vive nella fascia
        // centrale libera, cosi' non finisce mai sotto un pannello.
        const insets = { left: 0, right: 0 };
        let lastFit = null;   // ultimo insieme di province inquadrato (per il resize)

        // Ingrandimento massimo rispetto alla vista intera. Alto perche' alcune zone
        // (es. il dettaglio storico d'Europa) hanno molti territori piccoli e ravvicinati:
        // serve poter zoomare a fondo per selezionarli comodamente uno per uno.
        const MAX_ZOOM = 60;
        const DRAG_THRESHOLD = 4;  // px prima di considerarlo un vero trascinamento

        // Bounding box dei soli territori: serve a scartare i margini vuoti (oceano)
        // che l'SVG di MapChart lascia intorno alle terre emerse.
        function landBBox() {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            provincePaths(svg).forEach(p => {
                let b; try { b = p.getBBox(); } catch (e) { return; }
                if (!b || (!b.width && !b.height)) return;
                if (b.x < minX) minX = b.x;
                if (b.y < minY) minY = b.y;
                if (b.x + b.width > maxX) maxX = b.x + b.width;
                if (b.y + b.height > maxY) maxY = b.y + b.height;
            });
            if (minX === Infinity) return { x: 0, y: 0, w: 1200, h: 575 };
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }

        // Vista "tutto il mondo": bbox delle terre + piccolo margine, allargato per
        // combaciare con l'aspetto della cornice -> la mappa riempie il riquadro senza
        // bande vuote sopra/sotto. Allarga soltanto (non taglia mai) i territori.
        function computeBaseViewBox() {
            const b = landBBox();
            const pad = 0.02;
            let x = b.x - b.w * pad, y = b.y - b.h * pad;
            let w = b.w * (1 + 2 * pad), h = b.h * (1 + 2 * pad);
            // Allarga la vista di quanto coprono i pannelli, in modo che le terre
            // restino tutte nella fascia centrale visibile (e che il pan possa
            // comunque portare una provincia di bordo al centro).
            const usable = Math.max(0.2, 1 - insets.left - insets.right);
            if (insets.left || insets.right) {
                const nw = w / usable;
                x -= nw * insets.left;
                w = nw;
            }
            const frameAR = (wrapper.clientWidth || 1) / (wrapper.clientHeight || 1);
            const vbAR = w / h;
            if (vbAR < frameAR) {
                const nw = h * frameAR; x -= (nw - w) / 2; w = nw;
            } else {
                const nh = w / frameAR; y -= (nh - h) / 2; h = nh;
            }
            return { x, y, w, h };
        }

        let base = computeBaseViewBox();
        let vb = { x: base.x, y: base.y, w: base.w, h: base.h };

        function apply() {
            svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
        }

        /* --------------------------------------------------------------
           ZOOM E PAN FLUIDI.

           Cambiare viewBox costringe il browser a ridisegnare la mappa a una
           risoluzione nuova, e con lei l'alone costiero: mille e quattrocento
           path clonati dentro due sfocature. Rifarlo a ogni evento di rotella
           (che ne spara decine al secondo) è ciò che rendeva lo zoom una
           sequenza di scatti. Due accorgimenti, entrambi solo per la durata
           della gesture:
             - il viewBox si riscrive UNA volta per frame, non una per evento;
             - l'alone si spegne mentre la mano si muove (`.map-interacting`
               in style.css) e torna 140 ms dopo l'ultimo scatto.
           Chi inquadra a comando (fit, reset, insets) continua a usare
           `apply()`, che è sincrono: lì il ridisegno è uno solo.
           -------------------------------------------------------------- */
        let frameRaf = null, idleTimer = null;

        function applySoon() {
            if (frameRaf === null) {
                frameRaf = requestAnimationFrame(() => { frameRaf = null; apply(); });
            }
            svg.classList.add('map-interacting');
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                svg.classList.remove('map-interacting');
            }, 140);
        }

        // Non uscire mai dai confini della vista intera.
        function clampPan() {
            if (vb.w > base.w) vb.w = base.w;
            if (vb.h > base.h) vb.h = base.h;
            if (vb.x < base.x) vb.x = base.x;
            if (vb.y < base.y) vb.y = base.y;
            if (vb.x + vb.w > base.x + base.w) vb.x = base.x + base.w - vb.w;
            if (vb.y + vb.h > base.y + base.h) vb.y = base.y + base.h - vb.h;
        }

        // Inquadra un gruppo di province nella fascia centrale libera dai pannelli.
        // Usato dalla plancia per aprire il gioco gia' sul regno del giocatore.
        function fitToProvinces(ids) {
            if (!ids || !ids.length) return false;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            ids.forEach(id => {
                const p = document.getElementById(id);
                if (!p) return;
                let b; try { b = p.getBBox(); } catch (e) { return; }
                if (!b || (!b.width && !b.height)) return;
                if (b.x < minX) minX = b.x;
                if (b.y < minY) minY = b.y;
                if (b.x + b.width > maxX) maxX = b.x + b.width;
                if (b.y + b.height > maxY) maxY = b.y + b.height;
            });
            if (minX === Infinity) return false;

            lastFit = ids.slice();
            const pad = 0.25;                      // respiro attorno al regno
            const rawW = maxX - minX, rawH = maxY - minY;
            const bx = minX - rawW * pad, by = minY - rawH * pad;
            const bw = rawW * (1 + 2 * pad), bh = rawH * (1 + 2 * pad);

            const usable = Math.max(0.2, 1 - insets.left - insets.right);
            const frameAR = (wrapper.clientWidth || 1) / (wrapper.clientHeight || 1);
            let w = bw / usable;
            let h = w / frameAR;
            if (h < bh) { h = bh; w = h * frameAR; }        // regno alto e stretto

            // Centra il regno dentro la sola fascia visibile.
            const bandLeft = w * insets.left;
            vb = {
                x: bx - bandLeft - (w * usable - bw) / 2,
                y: by + bh / 2 - h / 2,
                w: w,
                h: h
            };
            clampPan();
            apply();
            return true;
        }

        // Punto (in coordinate SVG) sotto il cursore, robusto rispetto al letterboxing.
        function cursorUserPoint(e) {
            const ctm = svg.getScreenCTM();
            if (!ctm) return null;
            const pt = svg.createSVGPoint();
            pt.x = e.clientX; pt.y = e.clientY;
            return pt.matrixTransform(ctm.inverse());
        }

        apply();

        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const p = cursorUserPoint(e);
            if (!p) return;
            const minW = base.w / MAX_ZOOM;
            const factor = e.deltaY < 0 ? 1 / 1.15 : 1.15; // su = zoom in
            let newW = Math.max(minW, Math.min(base.w, vb.w * factor));
            if (newW === vb.w) return;
            const scale = newW / vb.w;
            // mantieni fermo il punto sotto il cursore mentre si zooma
            vb.x = p.x - (p.x - vb.x) * scale;
            vb.y = p.y - (p.y - vb.y) * scale;
            vb.w = newW;
            vb.h = vb.h * scale;
            clampPan();
            applySoon();
        }, { passive: false });

        // Pan con trascinamento. Attivo solo oltre una soglia, altrimenti il click
        // resta una normale selezione di provincia.
        let dragging = false, moved = false;
        let startClientX = 0, startClientY = 0, startVBx = 0, startVBy = 0;

        wrapper.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // solo tasto sinistro
            dragging = true; moved = false;
            startClientX = e.clientX; startClientY = e.clientY;
            startVBx = vb.x; startVBy = vb.y;
        });

        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startClientX;
            const dy = e.clientY - startClientY;
            if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
                moved = true;
                wrapper.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
            }
            if (moved) {
                const rect = svg.getBoundingClientRect();
                vb.x = startVBx - dx * (vb.w / rect.width);
                vb.y = startVBy - dy * (vb.h / rect.height);
                clampPan();
                applySoon();
            }
        });

        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            const wasDragging = moved;
            dragging = false; moved = false;
            wrapper.style.cursor = '';
            document.body.style.userSelect = '';
            // Dopo un pan, sopprimi il click successivo per non selezionare una provincia.
            if (wasDragging) {
                const suppress = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
                wrapper.addEventListener('click', suppress, { capture: true, once: true });
            }
        });

        // Ricomputa la vista intera quando la finestra cambia dimensione.
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                base = computeBaseViewBox();
                vb = { x: base.x, y: base.y, w: base.w, h: base.h };
                apply();
                // Nella plancia il resize non deve far perdere il regno di vista.
                if (lastFit) fitToProvinces(lastFit);
            }, 150);
        });

        mapView = {
            fitToProvinces,
            // Larghezze dei pannelli in frazione della cornice: ricalcola la vista base.
            setInsets(left, right) {
                insets.left = Math.max(0, Math.min(0.45, left || 0));
                insets.right = Math.max(0, Math.min(0.45, right || 0));
                base = computeBaseViewBox();
                if (lastFit) fitToProvinces(lastFit);
                else { vb = { x: base.x, y: base.y, w: base.w, h: base.h }; apply(); }
            },
            resetView() {
                lastFit = null;
                base = computeBaseViewBox();
                vb = { x: base.x, y: base.y, w: base.w, h: base.h };
                apply();
            }
        };
    }

    function wireTopTabsBar() {
        const bar = document.getElementById('player-tabs-bar');
        const toggle = document.getElementById('player-tabs-toggle');
        const clear = document.getElementById('player-tabs-clear');
        if (!bar || !toggle || !clear) return;

        toggle.addEventListener('click', () => {
            bar.classList.toggle('tabs-collapsed');
            toggle.textContent = bar.classList.contains('tabs-collapsed')
                ? '▾ Schede giocatore'
                : '▴ Schede giocatore';
        });

        clear.addEventListener('click', () => {
            selectedTabPlayerId = null;
            selectedPlayer = null;
            document.querySelectorAll('.player-card').forEach(b => b.classList.remove('selected'));
            const content = document.getElementById('player-tab-content');
            if (content) content.style.display = 'none';
            document.querySelectorAll('.player-tab').forEach(t => t.classList.remove('active'));
            syncPlayerControlsVisibility();
            refreshMapDisplay();
        });

        // Viste alternative anche nell'editor: comode per controllare religioni e
        // terreno mentre si dipinge la mappa. Solo pittura, come nella plancia.
        // Sono modi esclusivi dello stesso interruttore: accenderne uno spegne
        // l'altro, quindi i due bottoni si risincronizzano insieme.
        const faithBtn = document.getElementById('faith-view-btn');
        const terrainBtn = document.getElementById('terrain-view-btn');
        function syncViewBtns() {
            if (faithBtn) {
                const on = mapPaintMode === 'fede';
                faithBtn.textContent = on ? '☩ Regni' : '☩ Fedi';
                faithBtn.classList.toggle('on', on);
            }
            if (terrainBtn) {
                const on = mapPaintMode === 'terreno';
                terrainBtn.textContent = on ? '⛰ Regni' : '⛰ Terreno';
                terrainBtn.classList.toggle('on', on);
            }
        }
        function toggleView(mode) {
            mapPaintMode = (mapPaintMode === mode) ? 'owner' : mode;
            syncViewBtns();
            refreshMapDisplay();
        }
        if (faithBtn) faithBtn.addEventListener('click', () => toggleView('fede'));
        if (terrainBtn) terrainBtn.addEventListener('click', () => toggleView('terreno'));
        syncViewBtns();
    }

    // Il pannello palette+file (usato dall'admin per assegnare liberamente le province)
    // deve sparire quando si entra in una scheda personale, perche' in quella modalita'
    // si agisce solo come il giocatore della scheda.
    function syncPlayerControlsVisibility() {
        const playerControls = document.getElementById('player-controls');
        if (!playerControls) return;
        const inTab = selectedTabPlayerId !== null;
        playerControls.style.display = (isAdminMode && !inTab) ? 'block' : 'none';
    }

    function applyCloudState(data) {
        // Intervento admin in corso: si CONGELA lo schermo sui suoi ritocchi. Lo
        // stato remoto che arriva mentre edita non lo sovrascrive — lo si tiene da
        // parte come "ultimo stato vero" (bufferedRemote), da ripristinare al commit.
        if (adminIntervening) { bufferedRemote = data; return; }

        if (!data) {
            internalApplyMapData(INITIAL_MAP_DATA);
            updateTurnUI();
            if (MultiplayerSync.isAdmin) saveAutoSave();
            return;
        }

        if (data.players) {
            mergePlayerData(data.players);
            initPalette();
        }

        if (data.history) TURN_HISTORY = data.history;

        if (data.turn !== undefined) {
            currentTurn = data.turn;
            updateTurnUI();
            loadTurnFromHistory();
        }

        if ('resources' in data) applyResourceState(data.resources || {});
        if ('religions' in data) applyReligionState(data.religions || {});
        if ('pieces' in data) applyPieceState(data.pieces || {});
        if ('roads' in data) applyRoadState(data.roads || []);
        applyTurnState(data);

        refreshMapDisplay();
        renderPlayerTabs();

        // Intervento admin in attesa: appena il turno CAMBIA (il giocatore in corso
        // ha finito), si applica il diff sopra lo stato appena arrivato e si salva.
        if (pendingDiff && turnoDi !== pendingBaseTurnoDi) applyPendingIntervention();
    }

    // ---------- interventi admin (creare regni, prendere bot, ecc.) ----------
    // Vedi le variabili adminIntervening/pendingDiff in cima al file.
    function buildSnapshotClone() {
        const s = buildSnapshot();
        return s ? JSON.parse(JSON.stringify(s)) : null;
    }

    // Diff coi SOLI campi che l'admin ha toccato: province (proprietario/pedine/
    // risorsa/fede), regni aggiunti, controllo/nome/colore cambiati, ordine e strade.
    // Tutto il resto (le mosse dei giocatori nel frattempo) resta intatto.
    function diffSnapshots(base, ed) {
        const diff = { provinces: {}, addPlayers: [], setPlayer: {}, ordineAppend: [], roadsAdd: [], roadsRemove: [] };
        const bp = base.pieces || {}, ep = ed.pieces || {};
        const br = base.resources || {}, er = ed.resources || {};
        const bf = base.religions || {}, ef = ed.religions || {};
        const bo = (base.history && base.history[base.turn]) || {}, eo = (ed.history && ed.history[ed.turn]) || {};
        const ids = new Set([].concat(
            Object.keys(bp), Object.keys(ep), Object.keys(br), Object.keys(er),
            Object.keys(bf), Object.keys(ef), Object.keys(bo), Object.keys(eo)));
        ids.forEach(id => {
            const oB = bo[id] || null, oE = eo[id] || null;
            const pB = bp[id] ? JSON.stringify(bp[id]) : null, pE = ep[id] ? JSON.stringify(ep[id]) : null;
            const rB = br[id] || null, rE = er[id] || null;
            const fB = bf[id] || null, fE = ef[id] || null;
            if (oB !== oE || pB !== pE || rB !== rE || fB !== fE) {
                diff.provinces[id] = { owner: oE, pieces: ep[id] || null, resource: rE, religione: fE };
            }
        });
        const baseIds = new Set((base.players || []).map(p => p.id));
        (ed.players || []).forEach(p => {
            const b = (base.players || []).find(x => x.id === p.id);
            if (!b) { diff.addPlayers.push(p); return; }
            const ch = {};
            if (b.bot !== p.bot) ch.bot = p.bot || null;
            if (b.name !== p.name) ch.name = p.name;
            if (b.color !== p.color) ch.color = p.color;
            if (Object.keys(ch).length) diff.setPlayer[p.id] = ch;
        });
        const baseOrd = new Set(base.ordine || []);
        (ed.ordine || []).forEach(id => { if (!baseOrd.has(id)) diff.ordineAppend.push(id); });
        const rk = r => (r.a < r.b ? r.a + '|' + r.b : r.b + '|' + r.a);
        const baseRoads = {}, edRoads = {};
        (base.roads || []).forEach(r => baseRoads[rk(r)] = r);
        (ed.roads || []).forEach(r => edRoads[rk(r)] = r);
        Object.keys(edRoads).forEach(k => { if (!baseRoads[k]) diff.roadsAdd.push(edRoads[k]); });
        Object.keys(baseRoads).forEach(k => { if (!edRoads[k]) diff.roadsRemove.push(baseRoads[k]); });
        return diff;
    }

    function applyAdminDiff(diff) {
        if (!diff) return;
        const svg = document.querySelector('svg');
        if (!svg) return;
        (diff.addPlayers || []).forEach(rec => {
            if (!PLAYERS.find(p => p.id === rec.id)) PLAYERS.push(normalizePlayer(Object.assign({}, rec)));
        });
        Object.keys(diff.setPlayer || {}).forEach(idStr => {
            const pl = PLAYERS.find(p => String(p.id) === String(idStr));
            if (!pl) return;
            const ch = diff.setPlayer[idStr];
            if ('bot' in ch) pl.bot = ch.bot || null;
            if ('name' in ch) pl.name = ch.name;
            if ('color' in ch) pl.color = ch.color;
        });
        (diff.ordineAppend || []).forEach(id => { if (ordine.indexOf(id) < 0) ordine.push(id); });
        Object.keys(diff.provinces || {}).forEach(id => {
            const p = document.getElementById(id);
            if (!p) return;
            const cell = diff.provinces[id];
            if (cell.owner) p.setAttribute('data-owner', cell.owner); else p.removeAttribute('data-owner');
            applyPieceEntry(p, cell.pieces);
            if (cell.resource && typeof RESOURCES !== 'undefined' && RESOURCES[cell.resource]) p.setAttribute('data-resource', cell.resource);
            else p.removeAttribute('data-resource');
            if (cell.religione) {
                let v = cell.religione;
                const locked = v.charAt(v.length - 1) === '*';
                if (locked) v = v.slice(0, -1);
                const k = (typeof Religions !== 'undefined') ? Religions.canonical(v) : v;
                if (k && typeof Religions !== 'undefined' && Religions.exists(k)) {
                    p.setAttribute('data-religione', k);
                    if (locked) p.setAttribute('data-fede-conq', '1'); else p.removeAttribute('data-fede-conq');
                }
            } else { p.removeAttribute('data-religione'); p.removeAttribute('data-fede-conq'); }
        });
        (diff.roadsRemove || []).forEach(r => {
            ROADS = ROADS.filter(x => !((x.a === r.a && x.b === r.b) || (x.a === r.b && x.b === r.a)));
        });
        (diff.roadsAdd || []).forEach(r => { if (!findRoad(r.a, r.b)) ROADS.push({ a: r.a, b: r.b, c: r.c || PIECE_NEUTRAL }); });
        initPalette();
        renderPlayerTabs();
        renderDecreeControls();
        renderResourceMarkers(svg);   // ridisegna anche le strade (renderRoads in coda)
        renderPieceMarkers(svg);
        refreshMapDisplay();
    }

    function applyPendingIntervention() {
        const diff = pendingDiff;
        pendingDiff = null;
        pendingBaseTurnoDi = null;
        applyAdminDiff(diff);
        saveAutoSave();   // scrive lo stato fuso (l'admin scrive: writes aperte)
        renderGameControls();
        updateInterventionUI();
        showPieceNotice('Interventi admin applicati (nuovo turno).');
    }

    function beginIntervention() {
        if (adminIntervening) return;
        if (pendingDiff) { showPieceNotice('C\'è già un intervento in attesa del prossimo turno.'); return; }
        adminIntervening = true;
        bufferedRemote = null;
        interventionBase = buildSnapshotClone();
        updateInterventionUI();
    }

    function commitIntervention() {
        if (!adminIntervening) return;
        const edited = buildSnapshotClone();
        pendingDiff = diffSnapshots(interventionBase, edited);
        adminIntervening = false;
        const live = bufferedRemote || interventionBase;   // stato vero a cui tornare
        pendingBaseTurnoDi = (live && live.turnoDi !== undefined) ? live.turnoDi : null;
        bufferedRemote = null;
        interventionBase = null;
        applyCloudState(live);   // ripristina lo schermo sulla partita in corso
        updateInterventionUI();
        showPieceNotice('Intervento salvato: sarà attivo dal prossimo turno.');
    }

    function cancelIntervention() {
        if (!adminIntervening) return;
        const live = bufferedRemote || interventionBase;
        adminIntervening = false;
        bufferedRemote = null;
        interventionBase = null;
        if (live) applyCloudState(live);
        updateInterventionUI();
        showPieceNotice('Intervento annullato.');
    }

    function updateInterventionUI() {
        const banner = document.getElementById('intervention-banner');
        const beginBtn = document.getElementById('intervene-btn');
        const commitBtn = document.getElementById('intervene-apply-btn');
        const cancelBtn = document.getElementById('intervene-cancel-btn');
        // "Intervieni" ha senso solo se una partita esiste (regni nel giro): in pura
        // modalità editor l'admin edita direttamente, senza differire nulla.
        const gameLive = (ordine && ordine.length > 0) || turnoDi !== null;
        if (beginBtn) beginBtn.style.display = (isAdminMode && gameLive && !adminIntervening && !pendingDiff) ? '' : 'none';
        if (commitBtn) commitBtn.style.display = adminIntervening ? '' : 'none';
        if (cancelBtn) cancelBtn.style.display = adminIntervening ? '' : 'none';
        // Pannello di ripristino: visibile a partita viva se admin e online (i
        // backup vivono su Firestore). Si popola alla prima comparsa.
        const restore = document.getElementById('restore-controls');
        if (restore) {
            const canRestore = isAdminMode && gameLive
                && typeof MultiplayerSync !== 'undefined' && MultiplayerSync.isConfigured;
            const wasHidden = restore.style.display === 'none';
            restore.style.display = canRestore ? '' : 'none';
            const sel = document.getElementById('restore-select');
            if (canRestore && wasHidden && sel && !sel.options.length) refreshRestorePanel();
        }
        if (banner) {
            if (adminIntervening) {
                banner.textContent = '🔧 Intervento in preparazione — edita liberamente, poi «Applica al prossimo turno». Le tue modifiche non sono ancora in partita.';
                banner.style.display = '';
            } else if (pendingDiff) {
                banner.textContent = '⏳ Intervento in attesa: sarà applicato al prossimo cambio turno.';
                banner.style.display = '';
            } else {
                banner.style.display = 'none';
            }
        }
    }

    function saveCurrentTurnToHistory() {
        const svg = document.querySelector('svg');
        if (!svg) return;
        const currentData = {};
        svg.querySelectorAll('path').forEach(p => {
            const owner = p.getAttribute('data-owner');
            if (owner) currentData[p.id] = owner;
        });
        TURN_HISTORY[currentTurn] = currentData;
    }

    function loadTurnFromHistory() {
        if (TURN_HISTORY[currentTurn]) {
            internalApplyMapData(TURN_HISTORY[currentTurn]);
        } else {
            const prevTurn = currentTurn - 1;
            let source = INITIAL_MAP_DATA;

            if (prevTurn >= FIRST_TURN && TURN_HISTORY[prevTurn]) {
                source = TURN_HISTORY[prevTurn];
            } else if (currentTurn > FIRST_TURN) {
                const turns = Object.keys(TURN_HISTORY).map(Number).sort((a, b) => b - a);
                const latestTurn = turns.find(t => t < currentTurn);
                if (latestTurn !== undefined) source = TURN_HISTORY[latestTurn];
            }

            internalApplyMapData(source);
            saveCurrentTurnToHistory();
        }
    }

    // --- INVITI ---
    // Ogni giocatore ha un codice che compare nel link della sua plancia
    // (play.html?p=CODICE). Il codice non e' un segreto forte: serve a portare il
    // giocatore direttamente sul suo regno, mentre la scrittura resta admin-only
    // (firebase/firestore.rules). L'invio dell'invito per email verra' dopo.
    function inviteCodeFor(player) {
        if (!player.invite) {
            player.invite = 'r' + player.id + '-' + Math.random().toString(36).slice(2, 8);
        }
        return player.invite;
    }

    function inviteUrlFor(player) {
        const dir = location.href.split('?')[0].replace(/[^/]*$/, '');
        return dir + 'play.html?p=' + encodeURIComponent(inviteCodeFor(player));
    }

    function initPalette() {
        const palette = document.getElementById('palette');
        if (!palette) return;
        palette.innerHTML = '';

        PLAYERS.forEach(p => {
        // CHI GOVERNA IL REGNO (regola dell'utente: l'admin deve poter prendere il
        // controllo di un regno IA — i Mongoli, un bot qualunque — e ridarlo). Il
        // menu elenca "🧑 Admin" (nessuna IA: lo gioca l'admin dalla plancia col 👁)
        // e le strategie di js/bot.js (Bot.KEYS). Cambiare qui scrive `p.bot`:
        // vuoto = null → Bot.run lo salta e aspetta la mano dell'admin; una
        // strategia → da lì lo gioca l'IA. Vale anche per un regno appena creato
        // (i Maya, i Cinesi): lo si fa IA o lo si tiene in mano.
        const botKeys = (window.Bot && window.Bot.KEYS) || [];
        const botLabels = { espansione: 'Espansione', costruttore: 'Costruttore', opportunista: 'Opportunista', predone: 'Predone' };
        const botOptions = ['<option value=""' + (p.bot ? '' : ' selected') + '>🧑 Admin (nessuna IA)</option>']
            .concat(botKeys.map(k => '<option value="' + k + '"' + (p.bot === k ? ' selected' : '') + '>🤖 ' +
                (botLabels[k] || (k.charAt(0).toUpperCase() + k.slice(1))) + '</option>')).join('');

        // "Preso da un giocatore": un umano ha aperto il link di questo regno (vedi
        // presenceMap / sync.js). Ha senso solo quando il regno NON è dell'IA: se
        // c'è una strategia, lo gioca l'IA a prescindere. Senza presenza e con
        // bot=null resta il default "lo gioca l'admin".
        const claimed = p.invite && presenceMap[p.invite];
        const claimBadge = (claimed && !p.bot)
            ? '<div class="player-claim" title="Un giocatore ha aperto il link di questo regno: lo gioca lui, non l\'admin">👤 Preso dal giocatore</div>'
            : '';

        const btn = document.createElement('div');
            btn.className = 'player-card';
            btn.title = p.name;
            btn.dataset.playerId = p.id;

            btn.innerHTML = `
                <div class="player-logo" style="background:${p.color};color:#fff;font-weight:bold;position:relative;">
                    <span style="display:flex;justify-content:center;align-items:center;height:100%;width:100%;">${p.name[0]}</span>
                    <input type="color" value="${p.color}" class="color-picker" style="position:absolute;top:0;left:0;opacity:0;width:100%;height:100%;cursor:pointer;" />
                </div>
                <div class="player-info" style="border-bottom: 4px solid ${p.color}">
                    <span class="player-name" title="Doppio clic per rinominare">${p.name}</span>
                </div>
                <div class="player-actions">
                    <button type="button" class="player-action view-btn" title="Apri la sua plancia (come admin, in una nuova scheda)">👁</button>
                    <button type="button" class="player-action invite-btn" title="Copia il link d'invito">🔗</button>
                    <button type="button" class="player-action rename-btn" title="Rinomina">✎</button>
                    <button type="button" class="player-action remove-btn" title="Rimuovi">×</button>
                </div>
                <select class="player-bot" title="Chi governa il regno: Admin o una strategia dell'IA" style="width:100%;margin-top:4px;font-size:.8rem;">${botOptions}</select>
                ${claimBadge}
            `;

            const botSelect = btn.querySelector('.player-bot');
            botSelect.addEventListener('click', (e) => e.stopPropagation());
            botSelect.addEventListener('change', (e) => {
                if (!isAdminMode) return;
                p.bot = e.target.value || null;
                saveAutoSave();
                showPieceNotice(p.name + (p.bot ? ' è governato dall\'IA (' + e.target.value + ').' : ' è tuo: giocalo dalla plancia (👁).'));
            });

            const colorInput = btn.querySelector('input');
            colorInput.addEventListener('click', (e) => e.stopPropagation());
            colorInput.addEventListener('input', (e) => {
                if (!isAdminMode) return;
                const newColor = e.target.value;
                const oldColor = p.color;
                p.color = newColor;
                btn.querySelector('.player-logo').style.background = newColor;
                btn.querySelector('.player-info').style.borderBottomColor = newColor;
                updateMapColors(p.name, newColor, oldColor);
                renderPlayerTabs();
                saveAutoSave();
            });

            btn.addEventListener('click', () => {
                if (!isAdminMode) return;
                if (selectedPlayer && selectedPlayer.id === p.id) {
                    selectedPlayer = null;
                    document.querySelectorAll('.player-card').forEach(b => b.classList.remove('selected'));
                } else {
                    selectedPlayer = p;
                    selectedResource = null; // il giocatore convive con l'eventuale pennello-figura
                    document.querySelectorAll('.player-card').forEach(b => b.classList.remove('selected'));
                    document.querySelectorAll('.resource-chip:not(.piece-chip)').forEach(c => c.classList.remove('selected'));
                    btn.classList.add('selected');
                }
            });

            btn.querySelector('.player-name').addEventListener('dblclick', (e) => {
                e.stopPropagation();
                renamePlayer(p);
            });

            btn.querySelector('.view-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const hadCode = !!p.invite;
                const url = inviteUrlFor(p);
                if (!hadCode) saveAutoSave();   // il codice appena creato va salvato
                // Scheda separata, così l'editor resta aperto. Ma nei pannelli di
                // anteprima (e ovunque ci sia un blocco popup) window.open torna
                // null senza dire niente e il bottone sembra rotto: in quel caso
                // si va sulla plancia in questa stessa scheda, da cui si torna
                // indietro col link "🛠 Editor".
                const w = window.open(url, '_blank');
                if (!w) window.location.href = url;
            });

            btn.querySelector('.invite-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const hadCode = !!p.invite;
                const url = inviteUrlFor(p);
                if (!hadCode) saveAutoSave();   // il codice appena creato va salvato
                const done = () => showPieceNotice('Link di ' + p.name + ' copiato.');
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(done, () => window.prompt('Link d\'invito:', url));
                } else {
                    window.prompt('Link d\'invito:', url);
                }
            });

            btn.querySelector('.rename-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                renamePlayer(p);
            });

            btn.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                removePlayer(p);
            });

            palette.appendChild(btn);
        });
    }

    // Palette risorse (admin): scegli una risorsa e clicca le province per assegnarla.
    // Un click sulla stessa provincia con la stessa risorsa la rimuove. "Nessuna" cancella.
    function initResourcePalette() {
        const palette = document.getElementById('resource-palette');
        if (!palette || typeof RESOURCES === 'undefined') return;
        palette.innerHTML = '';

        const makeChip = (key, label, previewHTML) => {
            const chip = document.createElement('div');
            chip.className = 'resource-chip' + (key === '__erase__' ? ' resource-chip-erase' : '');
            chip.dataset.res = key;
            chip.title = label;
            chip.innerHTML = `<span class="resource-chip-icon">${previewHTML}</span><span class="resource-chip-label">${label}</span>`;
            chip.addEventListener('click', () => {
                if (!isAdminMode) return;
                if (selectedResource === key) {
                    selectedResource = null;
                    chip.classList.remove('selected');
                } else {
                    selectedResource = key;
                    selectedPlayer = null; // un solo pennello attivo alla volta
                    selectedPiece = null;
                    document.querySelectorAll('.player-card').forEach(b => b.classList.remove('selected'));
                    document.querySelectorAll('.resource-chip').forEach(c => c.classList.remove('selected'));
                    chip.classList.add('selected');
                }
            });
            palette.appendChild(chip);
        };

        Object.keys(RESOURCES).forEach(key => {
            makeChip(key, RESOURCES[key].nome, `<svg viewBox="0 0 100 100" width="24" height="24"><use href="#res-${key}"></use></svg>`);
        });
        makeChip('__erase__', 'Nessuna', '<span class="resource-chip-x">&times;</span>');
    }

    // Palette figure (admin): scegli una figura e clicca le province per posarla.
    // I chip condividono lo stile ".resource-chip"; ".piece-chip" e' l'aggancio
    // specifico per la selezione. Un solo pennello attivo alla volta.
    function initPiecePalette() {
        const palette = document.getElementById('piece-palette');
        if (!palette || typeof PIECES === 'undefined') return;
        palette.innerHTML = '';

        const makeChip = (key, label, previewHTML) => {
            const chip = document.createElement('div');
            chip.className = 'resource-chip piece-chip' + (key === '__erase__' ? ' resource-chip-erase' : '');
            chip.dataset.piece = key;
            chip.title = label;
            chip.innerHTML = `<span class="resource-chip-icon">${previewHTML}</span><span class="resource-chip-label">${label}</span>`;
            chip.addEventListener('click', () => {
                if (!isAdminMode) return;
                if (selectedPiece === key) {
                    selectedPiece = null;
                    chip.classList.remove('selected');
                } else {
                    selectedPiece = key;
                    selectedResource = null; // la figura convive col giocatore (per il colore)
                    document.querySelectorAll('.resource-chip').forEach(c => c.classList.remove('selected'));
                    chip.classList.add('selected');
                }
            });
            palette.appendChild(chip);
        };

        Object.keys(PIECES).forEach(key => {
            makeChip(key, PIECES[key].nome, `<svg viewBox="0 0 100 100" width="26" height="26" style="color:${PIECE_NEUTRAL}"><use href="#pc-${key}"></use></svg>`);
        });
        makeChip('__erase__', 'Rimuovi tutte', '<span class="resource-chip-x">&times;</span>');
    }

    function updateMapColors(playerName, newColor, oldColor) {
        const svg = document.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll(`path[data-owner="${playerName}"]`).forEach(path => {
            path.style.fill = newColor;
        });
        // Le figure il cui "colore-esercito" era quello vecchio seguono il nuovo colore.
        if (oldColor && oldColor !== newColor) {
            provincePaths(svg).forEach(path => {
                if (path.getAttribute('data-pc-color') === oldColor) {
                    path.setAttribute('data-pc-color', newColor);
                    svg.querySelectorAll(`.piece-marker[data-prov="${CSS.escape(path.id)}"]`).forEach(m => {
                        m.style.color = newColor;
                    });
                }
            });
        }
        if (ownerDisplay.textContent === playerName) {
            ownerDisplay.style.color = newColor;
        }
    }

    function renamePlayer(player) {
        if (!isAdminMode) return;
        const newName = prompt(`Rinomina ${player.name} in:`, player.name);
        if (!newName || newName === player.name) return;

        const oldName = player.name;
        player.name = newName;

        const svg = document.querySelector('svg');
        if (svg) {
            svg.querySelectorAll(`path[data-owner="${oldName}"]`).forEach(p => {
                p.setAttribute('data-owner', newName);
            });
        }

        for (const turnKey in TURN_HISTORY) {
            const turnData = TURN_HISTORY[turnKey];
            for (const regionId in turnData) {
                if (turnData[regionId] === oldName) turnData[regionId] = newName;
            }
        }

        initPalette();
        renderPlayerTabs();
        saveAutoSave();
    }

    // Colore per un nuovo giocatore: pesca il primo di una palette distinta non ancora
    // usato; se sono esauriti, genera una tinta HSL a passo "angolo aureo" (sempre esadecimale).
    function pickNewPlayerColor() {
        const used = new Set(PLAYERS.map(p => (p.color || '').toLowerCase()));
        const candidates = [
            '#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4',
            '#f032e6', '#9A6324', '#800000', '#469990', '#000075', '#808000', '#e6beff',
            '#fabed4', '#bfef45', '#ffd8b1', '#aaffc3', '#a9a9a9', '#f58a91'
        ];
        for (const c of candidates) if (!used.has(c.toLowerCase())) return c;
        const hue = (PLAYERS.length * 137.508) % 360;
        return hslToHex(hue, 65, 50);
    }

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
        return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
    }

    function addPlayer() {
        if (!isAdminMode) return;
        const nextId = PLAYERS.reduce((m, p) => Math.max(m, p.id), 0) + 1;
        PLAYERS.push(normalizePlayer({ id: nextId, name: 'Giocatore ' + nextId, color: pickNewPlayerColor() }));
        // A PARTITA IN CORSO il nuovo regno deve entrare nel giro dei turni, o
        // possiederebbe province senza giocare mai (stessa regola di
        // eventSpawnKingdom, §Mongoli). Si accoda in fondo all'`ordine`: gioca dal
        // giro dopo, e `primoDelGiro` (indice sul prefisso) non si sposta. Fuori
        // partita (ordine vuoto) non si forza dentro: ci penserà l'avvio.
        if (ordine.length && ordine.indexOf(nextId) === -1) ordine.push(nextId);
        initPalette();
        renderPlayerTabs();
        saveAutoSave();   // lo snapshot include turnoDi/ordine/primoDelGiro
    }

    function removePlayer(player) {
        if (!isAdminMode) return;
        askConfirm({
            title: 'Rimuovere ' + player.name + '?',
            text: 'Le sue province torneranno senza proprietario.',
            ok: 'Rimuovi', tone: 'war'
        }, () => doRemovePlayer(player));
    }

    function doRemovePlayer(player) {
        // Libera le province possedute dal giocatore (nella mappa e nello storico turni).
        const svg = document.querySelector('svg');
        if (svg) svg.querySelectorAll(`path[data-owner="${player.name}"]`).forEach(p => p.removeAttribute('data-owner'));
        for (const turnKey in TURN_HISTORY) {
            const td = TURN_HISTORY[turnKey];
            for (const id in td) if (td[id] === player.name) delete td[id];
        }

        PLAYERS = PLAYERS.filter(p => p.id !== player.id);
        // A PARTITA IN CORSO il regno va tolto anche dal giro dei turni, o
        // resterebbe un id fantasma che `endTurn` cerca di far giocare. Si tiene
        // `primoDelGiro` (indice) coerente col nuovo prefisso; se toccava proprio a
        // lui, il turno passa al successivo nel giro.
        if (ordine.indexOf(player.id) !== -1) {
            const wasIdx = ordine.indexOf(player.id);
            ordine = ordine.filter(id => id !== player.id);
            if (wasIdx < primoDelGiro) primoDelGiro = Math.max(0, primoDelGiro - 1);
            if (primoDelGiro >= ordine.length) primoDelGiro = 0;
            if (turnoDi === player.id) turnoDi = ordine.length ? ordine[Math.min(wasIdx, ordine.length - 1)] : null;
        }
        if (selectedPlayer && selectedPlayer.id === player.id) selectedPlayer = null;
        if (selectedTabPlayerId === player.id) {
            selectedTabPlayerId = null;
            const content = document.getElementById('player-tab-content');
            if (content) content.style.display = 'none';
            syncPlayerControlsVisibility();
        }

        initPalette();
        renderPlayerTabs();
        refreshMapDisplay();
        saveAutoSave();
    }

    initPalette();
    initResourcePalette();
    initPiecePalette();
    const addPlayerBtn = document.getElementById('add-player-btn');
    if (addPlayerBtn) addPlayerBtn.addEventListener('click', addPlayer);
    wireAdminLogin();
    MultiplayerSync.onRoleChange(applyRole);

    if (DEV_ADMIN_BYPASS) {
        // Force admin locally so the whole UI is unlocked during testing.
        // Cloud writes will still fail without a real Firebase login — that's fine while offline.
        applyRole(true);
    }

    // --- SAVE / LOAD LOGIC ---
    const saveBtn = document.getElementById('save-btn');
    const loadBtn = document.getElementById('load-btn');
    const fileInput = document.getElementById('file-input');

    if (saveBtn) saveBtn.addEventListener('click', saveMap);
    if (loadBtn && fileInput) {
        loadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', loadMap);
    }

    // --- COMANDI PARTITA (admin) ---
    // "Avvia partita" azzera l'economia ai valori del §11 e fissa l'ordine dei turni;
    // "Fine turno" chiude il turno del giocatore corrente ed esegue la Fase 1 del successivo.
    const startGameBtn = document.getElementById('start-game-btn');
    const endTurnBtn = document.getElementById('end-turn-btn');

    // Dichiarata come funzione (non const) perche' refreshMapDisplay la chiama
    // molto prima che questa parte del file venga eseguita.
    function renderGameControls() {
        const info = document.getElementById('game-turn-info');
        if (!info) return;
        renderReinforceBoard();
        updateInterventionUI();
        if (turnoDi === null || turnoDi === undefined) {
            info.textContent = 'Partita non avviata';
            info.className = '';
            return;
        }
        const p = PLAYERS.find(x => x.id === turnoDi);
        info.textContent = p ? ('Turno di ' + p.name) : 'Turno di un regno rimosso';
        info.className = 'active';
        if (p) info.style.borderLeftColor = p.color;
    }

    // Aggancio dei tre bottoni d'intervento (l'HTML sta in index.html).
    (function wireInterventionButtons() {
        const b = document.getElementById('intervene-btn');
        const a = document.getElementById('intervene-apply-btn');
        const c = document.getElementById('intervene-cancel-btn');
        if (b) b.addEventListener('click', () => { if (isAdminMode) beginIntervention(); });
        if (a) a.addEventListener('click', () => { if (isAdminMode) commitIntervention(); });
        if (c) c.addEventListener('click', () => { if (isAdminMode) cancelIntervention(); });
    })();

    // --- BACKUP / RIPRISTINO PER TURNO (§salvataggi robusti) ---
    // Riempie il menu coi turni salvati su Firestore. Non gira da solo a ogni
    // refresh (una lettura di rete): solo alla comparsa del pannello e sul bottone ↻.
    function refreshRestorePanel() {
        const sel = document.getElementById('restore-select');
        const info = document.getElementById('restore-info');
        if (!sel || !window.Risiko || !window.Risiko.listBackups) return;
        if (info) info.textContent = 'Backup per turno: lettura…';
        window.Risiko.listBackups().then(list => {
            sel.innerHTML = '';
            if (!list.length) {
                if (info) info.textContent = 'Backup per turno: nessuno ancora (si creano a ogni nuovo turno).';
                return;
            }
            list.forEach(b => {
                const opt = document.createElement('option');
                opt.value = String(b.turn);
                const anno = (window.Chronicle && Chronicle.yearOfTurn) ? (' — ' + Chronicle.yearOfTurn(b.turn)) : '';
                opt.textContent = 'Inizio turno ' + b.turn + anno;
                sel.appendChild(opt);
            });
            if (info) info.textContent = list.length + ' turni salvati (il più recente in alto).';
        });
    }

    (function wireRestoreButtons() {
        const refresh = document.getElementById('restore-refresh-btn');
        const apply = document.getElementById('restore-apply-btn');
        const sel = document.getElementById('restore-select');
        if (refresh) refresh.addEventListener('click', () => { if (isAdminMode) refreshRestorePanel(); });
        if (apply) apply.addEventListener('click', () => {
            if (!isAdminMode || !sel || !sel.value) return;
            const turn = Number(sel.value);
            askConfirm({
                title: 'Ricaricare dal turno ' + turn + '?',
                text: 'La partita torna allo stato di INIZIO turno ' + turn + ' per tutti i giocatori. '
                    + 'Quello che è successo dopo va perso, e i backup dei turni successivi vengono cancellati. '
                    + 'Da usare solo per rimediare a un danno.',
                ok: '🕰 Ripristina',
                tone: 'danger'
            }, () => {
                window.Risiko.restoreTurn(turn).then(() => {
                    showPieceNotice('Partita ricaricata dall\'inizio del turno ' + turn + '.');
                    renderGameControls();
                    refreshRestorePanel();
                }).catch(err => showPieceNotice('Ripristino fallito: ' + (err && err.message || err)));
            });
        });
    })();

    // Quadro delle reclute in attesa: un rigo per regno in gioco, con le libere e
    // (fra parentesi) quelle obbligate in una provincia. A partita ferma sparisce.
    function renderReinforceBoard() {
        const box = document.getElementById('game-reinforce-board');
        if (!box) return;
        const inGioco = PLAYERS.filter(p => ordine.indexOf(p.id) >= 0);
        if (!inGioco.length) { box.innerHTML = ''; box.style.display = 'none'; return; }

        box.style.display = 'block';
        box.innerHTML = '<div class="reinforce-head">Reclute da schierare</div>' + inGioco.map(p => {
            const vincolate = Object.keys(p.recluteVincolate || {})
                .reduce((s, k) => s + (p.recluteVincolate[k] || 0), 0);
            const libere = p.recluteDaSchierare || 0;
            const tot = libere + vincolate;
            return '<div class="reinforce-row' + (p.id === turnoDi ? ' now' : '') + '">' +
                '<span class="reinforce-dot" style="background:' + p.color + '"></span>' +
                '<span class="reinforce-name">' + p.name + '</span>' +
                '<span class="reinforce-num' + (tot ? ' on' : '') + '">' + libere +
                (vincolate ? ' <em>+' + vincolate + '</em>' : '') + '</span>' +
                '</div>';
        }).join('') +
            '<div class="reinforce-note">libere <em>+ obbligatorie</em> (Capitale/Città/Fortezza)</div>';
    }

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (!isAdminMode) return;
            askConfirm({
                title: 'Avviare la partita?',
                text: 'Ogni provincia posseduta torna a 5 soldati e ogni regno a 1000 monete con scorte azzerate.',
                ok: '🏁 Avvia'
            }, () => {
                const r = GameActions.startGame();
                showPieceNotice(r.msg);
                renderGameControls();
            });
        });
    }

    if (endTurnBtn) {
        endTurnBtn.addEventListener('click', () => {
            if (!isAdminMode) return;
            const r = GameActions.endTurn();
            showPieceNotice(r.msg);
            renderGameControls();
            if (window.Bot) window.Bot.run();
        });
    }

    // --- EDITTO (admin) ---
    // Il pannello è solo un modulo da compilare: chi muta lo stato resta
    // GameActions.decree, come per ogni altra azione. Qui si riempiono le tendine
    // (regni, province, risorse), si mostrano i campi che servono all'editto
    // scelto e si passa tutto al motore.
    function renderDecreeControls() {
        const box = document.getElementById('decree-controls');
        if (!box) return;
        box.style.display = isAdminMode ? 'block' : 'none';
        if (!isAdminMode) return;

        const sel = document.getElementById('decree-player');
        if (sel) {
            const prima = sel.value;
            sel.innerHTML = '<option value="">— nessun regno (terra di nessuno) —</option>' +
                PLAYERS.map(p => '<option value="' + p.id + '">' + p.name + '</option>').join('');
            if (prima) sel.value = prima;
        }

        const res = document.getElementById('decree-res');
        if (res && !res.options.length) {
            res.innerHTML = GameRules.RES
                .map(k => '<option value="' + k + '">' + GameRules.RES_LABEL[k] + '</option>').join('');
        }

        // L'elenco delle province si costruisce una volta sola: la geografia non
        // cambia, e sono 628 <option>.
        const list = document.getElementById('decree-provinces');
        if (list && !list.options.length) {
            const svg = document.querySelector('svg');
            if (svg) {
                list.innerHTML = provincePaths(svg)
                    .map(p => '<option value="' + p.id + '">' + provinceLabel(p) + '</option>').join('');
            }
        }
        syncDecreeFields();
    }

    function syncDecreeFields() {
        const azione = (document.getElementById('decree-action') || {}).value;
        const show = (id, on) => {
            const el = document.getElementById(id);
            if (el) el.style.display = on ? '' : 'none';
        };
        show('decree-from', azione === 'truppe');
        show('decree-to', azione === 'truppe' || azione === 'provincia');
        show('decree-n', azione !== 'provincia');
        show('decree-res', azione === 'scorte');
        show('decree-mode', azione === 'truppe');
    }

    const decreeAction = document.getElementById('decree-action');
    if (decreeAction) decreeAction.addEventListener('change', syncDecreeFields);

    const decreeBtn = document.getElementById('decree-btn');
    if (decreeBtn) {
        decreeBtn.addEventListener('click', () => {
            if (!isAdminMode) return;
            const val = id => (document.getElementById(id) || {}).value;
            const playerId = val('decree-player');
            const r = GameActions.decree({
                azione: val('decree-action'),
                playerId: playerId === '' ? null : playerId,
                fromId: (val('decree-from') || '').trim() || null,
                toId: (val('decree-to') || '').trim() || null,
                n: parseInt(val('decree-n'), 10) || 0,
                risorsa: val('decree-res'),
                modo: val('decree-mode'),
                titolo: (val('decree-title') || '').trim(),
                testo: (val('decree-text') || '').trim()
            });
            const out = document.getElementById('decree-result');
            if (out) {
                out.textContent = r.msg;
                out.style.color = r.ok ? '#8fc98f' : '#ff9d9d';
            }
            showPieceNotice(r.msg);
            if (r.ok) renderGameControls();
        });
    }

    // --- PARTITA CONTRO L'IA (admin) ---
    // Tre strade, e la differenza è tutta qui: la prima TIENE i regni disegnati
    // sulla mappa (è il modo normale di cominciare), la seconda li butta e ne
    // sorteggia di nuovi, la terza tiene la mappa ma NON dà nessun regno all'IA —
    // li muove tutti il giocatore (partita in solitaria, vedi finalize in
    // setup.js). "🏁 Avvia partita" resta quello di prima: azzera l'economia e
    // basta, senza IA.
    function avviaPartitaIA(mantieniMappa, tuttiUmani, umani) {
        if (!isAdminMode) return;
        if (!window.GameSetup) { showPieceNotice('setup.js non caricato.'); return; }
        if (!neighborsReady) {
            showPieceNotice('La mappa sta ancora calcolando i confini: riprova fra un istante.');
            return;
        }
        const neutrali = 'Le terre di nessuno partono con ' + GameRules.NEUTRAL_START +
            ' soldati (+' + GameRules.NEUTRAL_STEP + ' ogni ' + GameRules.NEUTRAL_EVERY +
            ' turni, fino a ' + GameRules.NEUTRAL_MAX + '). Le terre lontane (Americhe, ' +
            'Asia, Africa sub-sahariana) restano a ' + GameRules.NEUTRAL_START +
            ' fino al 5º ciclo, poi ' + GameRules.FAR_GARRISON_LATE + ' dal 6º.';
        // Numero di regni umani da sorteggiare (2+): partita mista, gli altri all'IA.
        const nUmani = (umani | 0) >= 2 ? (umani | 0) : 0;
        const opts = nUmani
            ? {
                title: 'Seguire ' + nUmani + ' regni tuoi?',
                text: nUmani + ' regni sulla mappa saranno tuoi: li giochi a turno, uno alla ' +
                    'volta, e la plancia passa da sé al tuo regno quando torna il suo turno. ' +
                    'Tutti gli altri li governa l\'IA. Mappa ed economia partono come nella ' +
                    'partita normale: nessun regno ha una Capitale, la prima cosa da fare al ' +
                    'turno 1 è costruirla (500 monete). ' + neutrali,
                ok: '🎭 Comincia'
            }
            : tuttiUmani
            ? {
                title: 'Giocare tu tutti i regni?',
                text: 'Nessuna IA: i regni sulla mappa li muovi tu, uno alla volta, ' +
                    'nell\'ordine dei turni. La plancia passa da sé al regno di turno, e ' +
                    'ognuno vede solo quel che vede lui. Mappa ed economia partono come nella ' +
                    'partita normale: nessun regno ha una Capitale, la prima cosa da fare al ' +
                    'turno 1 è costruirla (500 monete). ' + neutrali,
                ok: '👥 Comincia'
            }
            : mantieniMappa
            ? {
                title: 'Giocare con i regni che sono sulla mappa?',
                text: 'I territori restano esattamente come li hai dipinti. Ogni regno torna a ' +
                    '1000 monete e 5 soldati per provincia, e il calendario riparte dal turno 1 ' +
                    '(1000 AD). Nessun regno parte con una Capitale: la prima cosa da fare al ' +
                    'turno 1 è costruirla (500 monete). Uno dei regni sarà tuo, gli altri li ' +
                    'governa l\'IA. ' + neutrali,
                ok: '⚔️ Comincia'
            }
            : {
                title: 'Sorteggiare una mappa nuova?',
                text: 'Attenzione: la mappa attuale viene sparecchiata — province, pedine, strade e ' +
                    'cronologia dei turni. I regni rinascono in ' + window.GameSetup.REGIONS.europa.nome +
                    ' con 3 province a testa, senza Capitale: la prima cosa da fare al turno 1 è ' +
                    'costruirla (500 monete). ' + neutrali,
                ok: '🎲 Sorteggia',
                tone: 'danger'
            };

        askConfirm(opts, () => {
            const res = window.GameSetup.newGame({
                mantieniMappa: !!mantieniMappa,
                tuttiUmani: !!tuttiUmani,
                umani: nUmani || undefined
            });
            showPieceNotice(res.msg);
            renderGameControls();
            renderNewGameResult(res);
            // Inquadra i regni in gioco: la partita si gioca lì, non serve il
            // planisfero intero.
            if (res.ok && mapView) {
                const ids = res.regni.reduce((a, r) => a.concat(r.province), []);
                if (ids.length) mapView.fitToProvinces(ids);
            }
            if (window.Bot) window.Bot.run();
        });
    }

    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) newGameBtn.addEventListener('click', () => avviaPartitaIA(true));

    const drawGameBtn = document.getElementById('draw-game-btn');
    if (drawGameBtn) drawGameBtn.addEventListener('click', () => avviaPartitaIA(false));

    const soloGameBtn = document.getElementById('solo-game-btn');
    if (soloGameBtn) soloGameBtn.addEventListener('click', () => avviaPartitaIA(true, true));

    const followTwoBtn = document.getElementById('follow-two-btn');
    if (followTwoBtn) followTwoBtn.addEventListener('click', () => avviaPartitaIA(true, false, 2));

    // Esito del sorteggio: chi sei, con che link entri nella tua plancia, e con
    // che testa giocano gli altri nove.
    function renderNewGameResult(res) {
        const box = document.getElementById('new-game-result');
        if (!box || !res || !res.ok) return;
        // I regni umani possono essere più d'uno (segui 2+ regni, gli altri IA).
        const umani = res.umani || (res.umano ? [res.umano] : []);
        const umanoIds = new Set(umani.map(p => p.id));
        const righe = res.regni.map(r => {
            const p = r.player;
            const bot = window.Bot ? window.Bot.strategyOf(p) : null;
            return '<div class="ng-row' + (umanoIds.has(p.id) ? ' me' : '') + '">' +
                '<span class="ng-dot" style="background:' + p.color + '"></span>' +
                '<span class="ng-name">' + p.name + '</span>' +
                '<span class="ng-kind">' + (bot ? bot.nome : '👤 tu') + '</span>' +
                '</div>';
        }).join('');
        // Con più regni tuoi (solitaria o partita mista) non c'è UN regno solo: la
        // plancia si apre senza codice d'invito (play.html liscio) e da lì segue il
        // turno di regno in regno. Aprirla col link di uno solo la incollerebbe a
        // quel regno anche dopo un ricaricamento (vedi resolvePlayer in player-board.js).
        const dir = location.href.split('?')[0].replace(/[^/]*$/, '');
        const unSoloUmano = umani.length === 1 ? umani[0] : null;
        const link = (umani.length !== 1) ? dir + 'play.html'
            : (unSoloUmano ? inviteUrlFor(unSoloUmano) : null);
        const testa = res.tuttiUmani
            ? 'Giochi tutti i ' + res.regni.length + ' regni'
            : umani.length >= 2
            ? 'Segui ' + umani.map(p => p.name).join(' e ')
            : (unSoloUmano ? 'Giochi ' + unSoloUmano.name : 'Nessun regno umano');
        box.innerHTML =
            '<div class="ng-head">' + testa + '</div>' +
            (link ? '<a class="ng-link" href="' + link + '">▶ Apri la plancia</a>' : '') +
            righe;
    }

    renderGameControls();

    function saveMap() {
        if (!isAdminMode) return;
        const svg = document.querySelector('svg');
        if (!svg) return;

        const saveData = {};
        svg.querySelectorAll('path').forEach(p => {
            const owner = p.getAttribute('data-owner');
            if (owner) saveData[p.id] = owner;
        });

        const jsonStr = JSON.stringify({
            turn: currentTurn,
            players: PLAYERS,
            history: TURN_HISTORY,
            provinces: saveData,
            resources: collectResources(svg),
            religions: collectReligions(svg),
            pieces: collectPieces(svg),
            roads: collectRoads()
        }, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = "map_save.json";
        a.click();
        URL.revokeObjectURL(url);
    }

    function loadMap(event) {
        if (!isAdminMode) return;
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.players) {
                    mergePlayerData(data.players);
                    initPalette();
                }
                TURN_HISTORY = data.history || {};

                if (data.turn !== undefined) {
                    currentTurn = data.turn;
                    updateTurnUI();
                    if (data.history && data.history[currentTurn]) {
                        internalApplyMapData(data.history[currentTurn]);
                    } else {
                        internalApplyMapData(data.provinces || data);
                    }
                } else {
                    internalApplyMapData(data.provinces || data);
                    saveCurrentTurnToHistory();
                }

                if ('resources' in data) applyResourceState(data.resources || {});
                if ('religions' in data) applyReligionState(data.religions || {});
                if ('pieces' in data) applyPieceState(data.pieces || {});
                if ('roads' in data) applyRoadState(data.roads || []);
                renderPlayerTabs();
                saveAutoSave();
                alert("Mappa caricata.");
            } catch (err) {
                alert("Errore caricamento: " + err.message);
            }
            document.getElementById('file-input').value = '';
        };
        reader.readAsText(file);
    }

    // --- AUTO SAVE / PERSISTENCE ---
    // Costruisce lo snapshot completo dello stato (stessa forma che legge
    // applyCloudState). Estratto da saveAutoSave perché serve anche a catturare la
    // base/l'esito di un intervento admin (vedi beginIntervention/commitIntervention).
    function buildSnapshot() {
        const svg = document.querySelector('svg');
        if (!svg) return null;
        saveCurrentTurnToHistory();
        return {
            turn: currentTurn,
            players: PLAYERS,
            history: TURN_HISTORY,
            resources: collectResources(svg),
            religions: collectReligions(svg),
            pieces: collectPieces(svg),
            roads: collectRoads(),
            turnoDi: turnoDi,
            ordine: ordine,
            primoDelGiro: primoDelGiro,
            eventi: eventi
        };
    }

    // Force one-shot per la prossima scrittura condivisa: la alzano SOLO le azioni
    // che regrediscono il calendario di proposito (partita nuova, ripristino di un
    // backup). Una scrittura di gioco normale non la alza, così la guardia di
    // sync.js può rifiutare uno stato arretrato senza bloccare i reset voluti.
    let forcePushOnce = false;
    function saveAutoSave() {
        const stateSnapshot = buildSnapshot();
        if (!stateSnapshot) return;
        localStorage.setItem('antigravity_map_save', JSON.stringify(stateSnapshot));
        // Mentre l'admin sta preparando un intervento (vedi beginIntervention) le
        // sue modifiche NON devono uscire: restano locali finché non le committa,
        // e verranno applicate al cambio turno sopra lo stato aggiornato.
        if (!adminIntervening) MultiplayerSync.pushState(stateSnapshot, { force: forcePushOnce });
        forcePushOnce = false;
    }

    function loadAutoSave() {
        const json = localStorage.getItem('antigravity_map_save');
        if (!json) {
            internalApplyMapData(INITIAL_MAP_DATA);
            updateTurnUI();
            return;
        }

        try {
            const data = JSON.parse(json);
            if (data.players) {
                mergePlayerData(data.players);
                initPalette();
            }
            if (data.history) TURN_HISTORY = data.history;

            if (data.turn !== undefined) {
                currentTurn = data.turn;
                updateTurnUI();
                loadTurnFromHistory();
            } else if (data.provinces) {
                internalApplyMapData(data.provinces);
            }
            if ('resources' in data) applyResourceState(data.resources || {});
            if ('religions' in data) applyReligionState(data.religions || {});
            if ('pieces' in data) applyPieceState(data.pieces || {});
            if ('roads' in data) applyRoadState(data.roads || []);
            applyTurnState(data);
            renderPlayerTabs();
        } catch (e) {
            console.error("Failed to load auto-save", e);
        }
    }

    // Lo stato salvato e' autoritativo sull'elenco giocatori: cosi' aggiunte E rimozioni
    // (anche dei giocatori di default) vengono rispettate al ricaricamento.
    function mergePlayerData(savedPlayers) {
        if (!savedPlayers || !Array.isArray(savedPlayers) || !savedPlayers.length) return;
        // Copia integrale del record: tesoro, scorte, prestigio, serbatoio reclute e
        // codice d'invito devono sopravvivere al ricaricamento. Prima si teneva solo
        // id/nome/colore e a ogni reload il regno tornava povero.
        PLAYERS = savedPlayers.map(p => normalizePlayer(Object.assign({}, p)));
    }

    // Stato di turno dal documento salvato (vale sia per localStorage sia per Firestore).
    function applyTurnState(data) {
        turnoDi = (data && data.turnoDi !== undefined) ? data.turnoDi : null;
        ordine = (data && Array.isArray(data.ordine)) ? data.ordine.slice() : [];
        primoDelGiro = (data && typeof data.primoDelGiro === 'number') ? data.primoDelGiro : 0;
        eventi = (data && data.eventi && Array.isArray(data.eventi.attivi) && Array.isArray(data.eventi.fatti))
            ? data.eventi : { attivi: [], fatti: [] };
    }

    // --- MAP DISPLAY ---
    // Two modes:
    //   - Main view (selectedTabPlayerId === null): show real owner colors for every province.
    //   - Focus view (a player tab is active): show real owner colors for that player's provinces
    //     and their direct neighbors; every other province is "fogged" (dark, non-interactive).
    // Indice dei marker per provincia, in UNA passata. Prima si cercavano con
    // querySelectorAll dentro il ciclo, cioè due query su tutto l'SVG per ognuna
    // delle 628 province: 1256 query a refresh, ~1 secondo misurato. E il refresh
    // gira dopo OGNI azione — anche dopo ogni singola mossa dei bot, che era il
    // motivo per cui la partita "laggava" a guardarli giocare.
    function markerIndex(svg) {
        const res = new Map(), pieces = new Map();
        svg.querySelectorAll('.resource-marker').forEach(m => {
            const k = m.getAttribute('data-prov'); if (k) res.set(k, m);
        });
        svg.querySelectorAll('.piece-marker').forEach(m => {
            const k = m.getAttribute('data-prov'); if (!k) return;
            let arr = pieces.get(k); if (!arr) { arr = []; pieces.set(k, arr); }
            arr.push(m);
        });
        return { res, pieces };
    }

    function refreshMapDisplay() {
        const svg = document.querySelector('svg');
        if (!svg) return;

        const focus = PLAYERS.find(p => p.id === selectedTabPlayerId);
        const seen = focus ? computeVisibleProvinces(focus.name) : null;
        // `visible` = si vede la provincia (piena o in nebbia leggera).
        // `hazed`   = si vede la provincia ma NON le sue pedine (§9.2).
        const visible = seen ? new Set([...seen.visible, ...seen.haze]) : null;
        const hazed = seen ? seen.haze : null;
        // Dove stanno i nostri uomini (§9.3): un segno sulla provincia, non un
        // grado di visibilità — quel che la spia mostra è già in `hazed`.
        const spied = seen ? seen.spie : null;

        visibleSet = visible;   // memorizzato per Risiko.isVisible (nebbia, §fog)

        const { res, pieces } = markerIndex(svg);
        // Colore per proprietario, una volta sola invece di un find per provincia.
        const colorOf = new Map(PLAYERS.map(p => [p.name, p.color]));

        // Solo le province vere: l'alone costiero (map-decor.js) è un clone
        // filtrato, il suo `fill` non si vede e ridipingerlo raddoppiava il lavoro.
        const faithView = mapPaintMode === 'fede' && typeof Religions !== 'undefined';
        const terrainView = mapPaintMode === 'terreno' && typeof Terrain !== 'undefined';
        provincePaths(svg).forEach(path => {
            const owner = path.getAttribute('data-owner');
            const isVisible = !visible || visible.has(path.id);

            // Vista per fede: la provincia prende la tinta della sua religione;
            // le terre senza fede assegnata e quelle in nebbia restano al neutro.
            // Vista per terreno: la tinta dice se lì il numero conta o no (§9).
            const color = !isVisible
                ? FOG_FILL
                : (terrainView
                    ? Terrain.color(terrainKeyOf(path))
                    : faithView
                    ? (religionKeyOf(path) ? Religions.color(religionKeyOf(path)) : NEUTRAL_FILL)
                    : (colorOf.get(owner) || NEUTRAL_FILL));
            // Path SVG "fill=" attribute takes precedence over CSS in some browsers,
            // so we drive both the attribute and the inline style to stay consistent.
            path.setAttribute('fill', color);
            path.style.fill = color;
            path.classList.toggle('fog', !isVisible);
            // Nebbia leggera: la provincia si vede (colore del proprietario), le
            // sue pedine no — dal mare si riconosce la bandiera, non la guarnigione.
            const isHazed = !!(hazed && hazed.has(path.id));
            path.classList.toggle('haze', isHazed);
            path.classList.toggle('spied', !!(spied && spied.has(path.id)));

            // L'icona-risorsa segue la visibilita' della sua provincia (sparisce in nebbia).
            const marker = res.get(path.id);
            if (marker) marker.style.display = isVisible ? '' : 'none';

            // Le figure usano il colore-esercito memorizzato (fallback proprietario/
            // neutro) e seguono la nebbia per la visibilita'.
            const lista = pieces.get(path.id);
            if (lista) {
                const pcColor = pieceColorOf(path);
                lista.forEach(m => {
                    m.style.color = pcColor;
                    m.style.display = (isVisible && !isHazed) ? '' : 'none';
                });
            }
        });

        // Le strade spariscono se anche una sola delle due province e' in nebbia.
        svg.querySelectorAll('.road-marker').forEach(m => {
            const key = m.getAttribute('data-road'); if (!key) return;
            const parts = key.split('|');
            const vis = !visible || (visible.has(parts[0]) && visible.has(parts[1]));
            m.style.display = vis ? '' : 'none';
        });

        // I Velieri in rotta lunga (§9.2) stanno in mare aperto: si ridisegnano a
        // ogni refresh perché la loro posizione cambia di turno in turno e non
        // vivono su un path (niente marker persistente da limitare a mostrare).
        renderExpeditions(svg);

        renderPopularityPanel();
        renderGameControls();
        renderDecreeControls();
        notifyBoard();
    }

    // Aggancio della plancia giocatore: si ridisegna quando cambia qualcosa del regno.
    function notifyBoard() {
        if (window.Risiko && typeof window.Risiko.onRefresh === 'function') {
            window.Risiko.onRefresh();
        }
    }

    // Due gradi di visibilità (§9.2):
    //   visible → si vede tutto, pedine comprese;
    //   haze    → NEBBIA LEGGERA: quel che raggiunge una nostra nave, o dove
    //             guarda una nostra spia (§9.3). Si vede di chi è la provincia
    //             (o che è neutrale) ma NON quanti uomini ci sono. È quel che si
    //             scorge dal mare: bandiera sì, guarnigione no.
    // `spie` è solo il POSTO dove stanno i nostri uomini: serve a disegnarcelo
    // sopra un segno, non aggiunge visibilità (è già dentro haze).
    function computeVisibleProvinces(playerName) {
        const svg = document.querySelector('svg');
        const visible = new Set(), haze = new Set(), spie = new Set();
        if (!svg) return { visible, haze, spie };
        svg.querySelectorAll(`path[data-owner="${playerName}"]`).forEach(path => {
            visible.add(path.id);
            // Nebbia di default: si vedono le province confinanti via TERRA...
            const neigh = NEIGHBORS_LAND[path.id];
            if (neigh) neigh.forEach(id => visible.add(id));
            // ...e, appena si costruisce una nave, tutto quel che quella nave
            // raggiunge via mare — ma solo in nebbia leggera.
            if (typeof SeaRoutes === 'undefined' || !SeaRoutes.isReady(svg)) return;
            SHIP_TYPES.forEach(tipo => {
                if (!countPiece(path, tipo)) return;
                const r = SeaRoutes.rangeOf(tipo);
                if (r > 0) SeaRoutes.reachCached(svg, path.id, r).forEach(id => haze.add(id));
            });
        });

        // SPIE (§9.3): la provincia dove sta l'uomo e le sue limitrofe. Stesso
        // grado di nebbia della nave, e per la stessa ragione: riconosce le
        // bandiere (e le risorse), non conta le guarnigioni.
        // Si guardano SOLO le spie di questo regno, ed è la regola dell'utente:
        // una spia nemica sul proprio suolo non si vede e non si può scoprire.
        // Da qui esce anche il set `spie`, quindi il segno sulla mappa lo vede
        // solo chi l'ha pagata — e in vista generale (nessun focus) nessuno.
        const me = PLAYERS.find(p => p.name === playerName);
        if (me && typeof Spies !== 'undefined') {
            Spies.active(me.spie, currentTurn).forEach(s => {
                spie.add(s.prov);
                Spies.watch(s.prov, id => NEIGHBORS_LAND[id]).forEach(id => haze.add(id));
            });
        }

        // SPEDIZIONI OLTREMARE (§9.2): un Veliero in rotta lunga avvista, dalla sua
        // posizione in mare aperto, tutte le coste entro la sua portata — stessa
        // nebbia leggera della nave ancorata (bandiere, non guarnigioni).
        if (me && Array.isArray(me.spedizioni) && me.spedizioni.length &&
            typeof SeaRoutes !== 'undefined' && SeaRoutes.isReady(svg)) {
            const r = SeaRoutes.rangeOf('vascello');
            me.spedizioni.forEach(exp => {
                SeaRoutes.reachFromPointCached(svg, exp.x, exp.y, r).forEach(id => haze.add(id));
            });
        }

        // VISIONE CONDIVISA (§Diplomazia): con un patto di 'vista' (o
        // un'alleanza, che la comprende) si vede il territorio del partner come
        // il proprio, truppe comprese — è il senso del patto. Si aggiunge in
        // piena visibilità, non in nebbia leggera: un alleato non ti nasconde le
        // guarnigioni. I bot non hanno nebbia, ma la relazione vale comunque.
        if (me && typeof Diplomacy !== 'undefined') {
            PLAYERS.forEach(other => {
                if (other === me || !Diplomacy.sharesVision(me, other)) return;
                svg.querySelectorAll(`path[data-owner="${other.name}"]`).forEach(path => {
                    visible.add(path.id);
                });
            });
        }

        haze.forEach(id => { if (visible.has(id)) haze.delete(id); });
        return { visible, haze, spie };
    }

    function internalApplyMapData(saveData) {
        const svg = document.querySelector('svg');
        if (!svg) return 0;

        svg.querySelectorAll('path').forEach(p => p.removeAttribute('data-owner'));

        let count = 0;
        for (const [id, ownerName] of Object.entries(saveData)) {
            const p = document.getElementById(id);
            if (p) {
                p.setAttribute('data-owner', ownerName);
                count++;
            }
        }

        refreshMapDisplay();
        return count;
    }

    function findMatch(id, name) {
        if (typeof ID_MAP !== 'undefined') {
            const gameName = ID_MAP[id];
            if (gameName && gameProvinces[normalize(gameName)]) {
                return gameProvinces[normalize(gameName)];
            }
        }
        if (gameProvinces[normalize(id)]) return gameProvinces[normalize(id)];
        if (gameProvinces[normalize(name)]) return gameProvinces[normalize(name)];
        return null;
    }

    function normalize(str) {
        if (!str) return "";
        return str.toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    // Nome leggibile di una provincia: dati di gioco > mappatura id > attributo name.
    function provinceLabel(path) {
        if (!path) return '';
        const id = path.id;
        const nameAttr = path.getAttribute('name');
        const data = findMatch(id, nameAttr);
        if (data) return data.nome;
        if (typeof ID_MAP !== 'undefined' && ID_MAP[id]) return ID_MAP[id];
        return nameAttr || id;
    }

    // Elementi <path> delle province di un giocatore (il nome puo' contenere
    // virgolette, quindi niente selettore costruito a mano).
    function ownedPaths(playerName) {
        const svg = document.querySelector('svg');
        if (!svg || !playerName) return [];
        return provincePaths(svg)
            .filter(p => p.getAttribute('data-owner') === playerName);
    }

    // --- PLAYER TABS (admin-only per-player detail panel) ---
    function getProvincesOwnedBy(playerName) {
        return ownedPaths(playerName).map(provinceLabel).sort();
    }

    function renderPlayerTabs() {
        const bar = document.getElementById('player-tabs-bar');
        if (!bar || bar.style.display === 'none') return;

        const tabsList = document.getElementById('player-tabs-list');
        const content = document.getElementById('player-tab-content');
        if (!tabsList || !content) return;

        tabsList.innerHTML = '';
        PLAYERS.forEach(p => {
            const tab = document.createElement('div');
            tab.className = 'player-tab' + (p.id === selectedTabPlayerId ? ' active' : '');
            tab.style.borderBottomColor = p.color;
            tab.textContent = p.name;
            tab.title = p.name;
            tab.addEventListener('click', () => {
                selectedTabPlayerId = p.id;
                // Nella scheda personale il "giocatore selezionato" è implicitamente
                // quello della scheda: qualsiasi paint/conquista sarà a suo nome.
                selectedPlayer = p;
                syncPlayerControlsVisibility();
                renderPlayerTabs();
                refreshMapDisplay();
            });
            tabsList.appendChild(tab);
        });

        const active = PLAYERS.find(p => p.id === selectedTabPlayerId);
        if (!active) {
            content.style.display = 'none';
            content.innerHTML = '';
            return;
        }

        content.style.display = 'flex';
        const provincesOwned = getProvincesOwnedBy(active.name);
        const year = yearOfTurn(currentTurn);
        content.innerHTML = `
            <div class="tab-header" style="border-left: 5px solid ${active.color};">
                <strong>${active.name}</strong>
                <span class="tab-subtle">${provincesOwned.length} prov</span>
            </div>
            <div class="tab-section">
                <label>Turno</label>
                <div class="tab-value">${currentTurn} · ${year} AD</div>
            </div>
            <div class="tab-section">
                <label>Oro</label>
                <div class="tab-value">—</div>
            </div>
            <div class="tab-section">
                <label>Risorse</label>
                <div class="tab-value">—</div>
            </div>
            <div class="tab-section tab-section-provinces">
                <label>Province</label>
                <div class="tab-province-inline">
                    ${provincesOwned.length
                        ? provincesOwned.join(' · ')
                        : '<span class="tab-subtle">Nessuna</span>'}
                </div>
            </div>
        `;
    }

    // ============================================================
    // Pannello Popolarità — scheda personale del giocatore focalizzato.
    // Attivo dalla costruzione della Capitale; senza Capitale mostra un invito.
    // Formula (docs/GAME_DESIGN.md §8): Popolarità = round((Sicurezza+Benessere+Tassa)/3).
    // ============================================================

    const TAX_LEVELS = Popularity.TAX_LEVELS;

    // Cibo (§8): le risorse che sfamano. Grano e Bestiame, niente altro.
    const FOOD_RES = ['grano', 'bestiame'];

    // Provincia-Capitale del giocatore (match sul colore-esercito della pedina).
    function getCapitalPathFor(player) {
        const svg = document.querySelector('svg');
        if (!svg || !player) return null;
        let found = null;
        provincePaths(svg).forEach(pp => {
            if (found) return;
            if (pieceColorOf(pp) === player.color &&
                piecesOf(pp).some(e => e.type === 'capitale')) found = pp;
        });
        return found;
    }

    // Quante pedine di un tipo ci sono su una provincia.
    function countPiece(path, type) {
        const e = piecesOf(path).find(x => x.type === type);
        return e ? e.count : 0;
    }

    // MISURA i fattori della Popolarità (§8) sulla mappa. La FORMULA non è qui:
    // sta in `js/popularity.js`, che è puro e non conosce il DOM — così la stessa
    // formula che mostra il pannello risponde anche all'IA quando chiede "quanto
    // farei SE abbassassi le tasse?" (Popularity.plan). Qui si legge e basta.
    // `connectedSet` (facoltativo) è la rete di province collegate: chi ce l'ha già
    // in mano la passa, così non si rifà la stessa BFS due volte per render.
    function popularityFactors(player, capitalPath, connectedSet) {
        // --- Sicurezza (Difesa) ---
        // Province nemiche confinanti con la Capitale: e = quante → P_conf = 5 − e.
        // Nemica = tutto ciò che non è nostro, TERRE DI NESSUNO COMPRESE (regola
        // dell'utente): sono presidiate (GameRules.neutralGarrison) e razziano i
        // vicini di fede diversa, quindi minacciano la Capitale come un regno.
        const neigh = Array.from(NEIGHBORS_LAND[capitalPath.id] || []);
        let enemyBorders = 0;
        neigh.forEach(id => {
            const np = document.getElementById(id);
            if (!np) return;
            if ((np.getAttribute('data-owner') || '') !== player.name) enemyBorders++;
        });

        // --- Benessere --- conta solo ciò che è COLLEGATO alla rete della Capitale
        // (§4): una provincia scollegata non manda in tavola niente. La rete è la
        // stessa della raccolta (GameActions.connectedOf), non una copia locale.
        const connSet = connectedSet ||
            ((typeof GameActions !== 'undefined' && GameActions.connectedOf)
                ? GameActions.connectedOf(player)
                : new Set());
        const kinds = {};
        let foodProv = 0;
        ownedPaths(player.name).forEach(p => {
            if (!connSet.has(p.id)) return;
            const k = resourceKeyOf(p);
            if (!k) return;
            kinds[k] = true;
            if (FOOD_RES.indexOf(k) >= 0) foodProv++;
        });

        // Sanità e Felicità (§6.1): le migliorie civiche costruite SULLA Capitale.
        // Ogni miglioria ATTIVA vale +1 punto al suo indice (max 5). Le dormienti
        // (manutenzione saltata, §6.1) non contano finché non si pagano. Legate
        // alla città: si leggono dal path della Capitale — spostarla le lascia
        // indietro, conquistarla le trasferisce, senza codice apposta.
        const attive = welfareOf(capitalPath).filter(e => !e.dormant).map(e => e.key);
        const sanita = GameRules.welfareCount(attive, 'sanita');
        const felicita = GameRules.welfareCount(attive, 'felicita');

        return {
            enemyBorders,
            soldiers: countPiece(capitalPath, 'soldato'),   // guardia: i soldati oltre i 5
            hasGeneral: countPiece(capitalPath, 'generale') > 0,
            varieta: Object.keys(kinds).length,             // TIPI distinti collegati
            foodProv,                                       // province di Grano/Bestiame
            sanita, felicita,                               // migliorie civiche (§6.1)
            tax: player.tassazione || 'normale',
            turn: currentTurn,                              // grazia dell'insediamento (§8)
            nato: player.nato || 1                          // ...che si conta dall'ETÀ del regno
        };
    }

    // Calcola i tre componenti + il totale della Popolarità per un giocatore.
    function computePopularity(player, capitalPath, connectedSet) {
        return Popularity.score(popularityFactors(player, capitalPath, connectedSet));
    }

    // ---------- Obiettivi di prestigio (§10, js/objectives.js) ----------
    // Solo TRASPORTO: costruisce le letture di stato che il modulo puro
    // Objectives usa per valutare la completezza (la REGOLA sta nel modulo).
    function objectiveContext(player) {
        const paths = ownedPaths(player.name);
        const ids = paths.map(p => p.id);
        const idSet = new Set(ids);
        const connected = (typeof GameActions !== 'undefined' && GameActions.connectedOf)
            ? GameActions.connectedOf(player) : new Set();
        let connOwned = 0; const types = new Set();
        paths.forEach(p => {
            if (!connected.has(p.id)) return;
            connOwned++;
            const k = resourceKeyOf(p);
            if (k) types.add(k);
        });
        let roads = 0;                          // strade con ENTRAMBI gli estremi miei
        ROADS.forEach(r => { if (idSet.has(r.a) && idSet.has(r.b)) roads++; });
        // Popolarità e le sue due componenti misurabili (§8, serve la Capitale).
        // Il Benessere sta accanto alla Sicurezza perché è l'altra metà della
        // formula e si muove con leve diverse: la Sicurezza si compra con la
        // guardia, il Benessere solo collegando risorse e cibo (§4).
        let pop = 0, sic = 0, ben = 0, capId = null;
        try {
            const cap = getCapitalPathFor(player);
            if (cap) { const p = computePopularity(player, cap, connected); pop = p.totale; sic = p.sicurezza; ben = p.benessere; capId = cap.id; }
        } catch (e) { pop = 0; sic = 0; ben = 0; capId = null; }
        // La famiglia di fede di STATO (§Religione), per il template `fede`
        // (converti REGIONE): letta una volta, come pop/sic/ben qui sopra.
        let statoFam = null;
        try { const f = stateReligionOf(player); statoFam = f ? Religions.familyOf(f) : null; } catch (e) { statoFam = null; }
        return {
            owns: id => idSet.has(id),
            ownedIds: () => ids,
            provCount: () => ids.length,
            soldiersOn: id => { const el = document.getElementById(id); return el ? countPiece(el, 'soldato') : 0; },
            hasMercato: () => paths.some(p => countPiece(p, 'mercato') > 0),
            hasCity: () => paths.some(p => countPiece(p, 'citta') > 0),
            hasFortress: () => paths.some(p => countPiece(p, 'fortezza') > 0),
            cityIds: () => paths.filter(p => countPiece(p, 'citta') > 0).map(p => p.id),
            shipIds: () => paths.filter(p => { const s = p.getAttribute('data-ships'); return s && s.split(',').filter(Boolean).length > 0; }).map(p => p.id),
            shipCount: () => paths.reduce((n, p) => { const s = p.getAttribute('data-ships'); return n + (s ? s.split(',').filter(Boolean).length : 0); }, 0),
            // Scafi di un TIPO solo (barca | vascello): un Veliero non è una
            // nave più grande, è l'unica che attraversi un oceano (§9.2).
            shipCountOf: kind => paths.reduce((n, p) => {
                const s = p.getAttribute('data-ships');
                if (!s) return n;
                return n + s.split(',').filter(Boolean).filter(v => v.split(':')[0] === kind).length;
            }, 0),
            monete: player.monete || 0,
            scorteOf: res => (player.scorte && player.scorte[res]) || 0,
            connectedCount: () => connOwned,
            connectedTypes: () => types.size,
            isConnected: id => connected.has(id),
            roadCount: () => roads,
            isCoastal: id => { const el = document.getElementById(id); return el ? isCoastalProvince(el) : false; },
            popularity: () => pop,
            sicurezza: () => sic,
            benessere: () => ben,
            // Quante Città e quante Fortezze, non solo "ne hai una": è la
            // misura che distingue un impero da un regno, e su cui poggiano i
            // capitoli tardi del §10 (una Città costa 1000 monete, una Fortezza
            // 2000 più sei risorse — due o tre insieme non stanno nei primi cicli).
            cityCount: () => paths.filter(p => countPiece(p, 'citta') > 0).length,
            fortressCount: () => paths.filter(p => countPiece(p, 'fortezza') > 0).length,
            // La provincia della Capitale ADESSO (null se non ne hai una): serve
            // al template `capitale` ("presidia la Capitale", Polonia/Ungheria) —
            // un capitolo non può nominare una provincia che dipende da dove il
            // giocatore l'ha costruita o traslocata.
            capitalId: () => capId,
            // La fede della provincia è della TUA famiglia di stato (§Religione)?
            // Serve al template `fede` (converti REGIONE): senza una Capitale non
            // c'è fede di stato e torna sempre false, come per ogni altra lettura
            // che dipende da stateReligionOf.
            isOwnFaith: id => {
                if (!statoFam) return false;
                const el = document.getElementById(id);
                const f = el ? religionKeyOf(el) : null;
                return !!f && Religions.familyOf(f) === statoFam;
            },
            // Le proprie province che confinano via terra con un altro REGNO
            // (un vicino con un proprietario diverso dal mio): il presidio di
            // frontiera del §10 ("rafforza ogni confine") legge da qui, non da
            // una lista fissa — i confini si spostano a ogni conquista. Le terre
            // di NESSUNO non contano (regola dell'utente): è un obiettivo contro
            // i nemici, non contro le neutrali — un vicino senza proprietario
            // (`data-owner` vuoto/assente) viene ignorato.
            borderIds: () => ids.filter(id => {
                const ns = NEIGHBORS_LAND[id];
                if (!ns || !ns.size) return false;
                for (const n of ns) {
                    const el = document.getElementById(n);
                    const ow = el && el.getAttribute('data-owner');
                    if (ow && ow !== player.name) return true;
                }
                return false;
            })
        };
    }

    // Valutazione LIVE degli obiettivi del ciclo in corso di un regno.
    // L'assegnazione vive sul record (`player.obiettiviCiclo`): la scrive
    // GameActions.closeCycle a ogni cambio ciclo. Se manca — salvataggio
    // anteriore al binario, partita già in corso, ciclo cambiato senza che
    // nessuno abbia chiuso il giro — si genera al volo, così un regno non resta
    // mai senza obiettivi.
    function objectivesFor(player) {
        if (typeof window.Objectives === 'undefined' || !player) return null;
        const a = ensureAssignment(player);
        if (!a) return null;
        return window.Objectives.evaluate(a, objectiveContext(player));
    }

    // L'assegnazione del ciclo in corso, generandola se non c'è. È l'unica
    // scrittura che parte da una lettura, ed è voluta: è la migrazione dei
    // salvataggi vecchi, e vale una volta per ciclo.
    function ensureAssignment(player) {
        const O = window.Objectives;
        const cyc = O.cycleOfTurn(currentTurn);
        // Col nuovo puntatore (si avanza in ogni caso, di UN capitolo per ciclo e
        // mai di più — nessun capitolo si salta) il capitolo tiene il passo del
        // ciclo. Si porta avanti un regno rimasto indietro — anche nella PARTITA
        // IN CORSO, il cui salvataggio nasceva sotto la vecchia regola del
        // ripetere/arretrare — fin dove dovrebbe essere; mai indietro. I regni
        // senza binario (nati per evento) non hanno capitoli.
        const chapters = O.chapterCount(player.name);
        if (chapters > 0) player.capitolo = Math.max(player.capitolo || 0, Math.min(cyc, chapters));
        else if (!player.capitolo) player.capitolo = cyc;
        const a = player.obiettiviCiclo;
        // Rigenera anche quando il capitolo dell'assegnazione salvata non combacia
        // più con quello atteso: è il caso della migrazione qui sopra su un regno
        // che, sotto la vecchia regola, era rimasto fermo a un capitolo vecchio.
        if (a && a.ciclo === cyc && a.capitolo === player.capitolo
            && Array.isArray(a.items) && a.items.length) return a;
        backfillCycles(player, cyc);
        // Calibrata come quella di closeCycle: senza ritmo (non c'è uno storico
        // su cui misurarlo) ma con la soglia che parte da dove il regno è,
        // così anche un salvataggio migrato non riceve obiettivi già fatti.
        player.obiettiviCiclo = O.generate(player.name, objectiveContext(player), {
            ciclo: cyc, capitolo: player.capitolo,
            intensita: player.intensita, turno: currentTurn, calibra: true
        });
        return player.obiettiviCiclo;
    }

    // MIGRAZIONE dei salvataggi anteriori al binario: i cicli già chiusi che
    // non sono nello storico si archiviano una volta sola, valutando il loro
    // capitolo sullo stato ATTUALE. È quel che faceva il vecchio
    // archiveCyclesIfNeeded, ed è il meglio che si possa fare a posteriori; da
    // qui in poi la fotografia VERA la scatta closeCycle a fine ciclo.
    function backfillCycles(player, cyc) {
        const O = window.Objectives;
        for (let c = 1; c < cyc; c++) {
            if (player.obiettiviStorico.some(h => h.ciclo === c)) continue;
            const snap = O.evaluate(player.name, objectiveContext(player), c);
            // Marcato BACKFILL: è una ricostruzione a posteriori, non la
            // fotografia di fine ciclo. GameActions.closeCycle la BUTTA e
            // riarchivia quella vera — vedi il commento là. Senza il marchio,
            // un backfill che passa qui in mezzo (fra advanceGlobalTurn e
            // closeCycle ci sono scismi e razzie, che ridisegnano) faceva da
            // tappo: il ciclo risultava già archiviato e la LEVA non veniva
            // mai versata.
            if (snap) archiveObjectives(player, snap, true);
        }
    }

    // Archivia la spunta di un ciclo concluso e somma i punti TENUTI a fine
    // ciclo. Unico punto che tocca `puntiPrestigio`: lo chiamano la migrazione
    // qui sopra e GameActions.closeCycle.
    // Torna il record archiviato: closeCycle ci timbra sopra la LEVA (i soldati
    // versati per gli obiettivi compiuti, §10) — che NON si scrive qui, perché
    // questa funzione la chiama anche la migrazione dei salvataggi vecchi, e un
    // ciclo ricostruito a posteriori non ha mai versato uomini a nessuno.
    function archiveObjectives(player, snap, backfill) {
        if (!Array.isArray(player.obiettiviStorico)) player.obiettiviStorico = [];
        const rec = {
            ciclo: snap.ciclo, capitolo: snap.capitolo, tema: snap.tema,
            epoca: snap.epoca, intensita: snap.intensita,
            punti: snap.punti, puntiMax: snap.puntiMax, leva: 0,
            // Ricostruzione a posteriori (backfillCycles) o fotografia vera di
            // fine ciclo (closeCycle)? La prima è provvisoria e sostituibile.
            backfill: !!backfill,
            items: snap.items.map(i => ({ tier: i.tier, titolo: i.titolo, punti: i.punti, completato: i.completato }))
        };
        player.obiettiviStorico.push(rec);
        if (typeof player.puntiPrestigio !== 'number') player.puntiPrestigio = 0;
        player.puntiPrestigio += snap.punti;
        return rec;
    }

    // La fotografia di fine ciclo su cui si misura la performance: quel che
    // serve a dire se il regno è cresciuto, ha stagnato o è crollato. Non
    // esisteva niente del genere — TURN_HISTORY conserva solo i proprietari
    // delle province, non l'economia.
    function objectiveProfile(player) {
        const c = objectiveContext(player);
        let esercito = 0;
        ownedPaths(player.name).forEach(p => { esercito += countPiece(p, 'soldato'); });
        return {
            province: c.provCount(), monete: c.monete, esercito: esercito,
            collegate: c.connectedCount(), tipiCollegati: c.connectedTypes(),
            popolarita: c.popularity(), capitale: !!getCapitalPathFor(player),
            scorte: Object.assign({}, player.scorte || {})
        };
    }

    function circlesHtml(value, mini) {
        let h = `<div class="pop-circles${mini ? ' mini-row' : ''}">`;
        for (let i = 1; i <= 5; i++) {
            h += `<div class="pop-circle${mini ? ' mini' : ''}${i <= value ? ' filled' : ''}"></div>`;
        }
        return h + '</div>';
    }

    // Ricorda quali sotto-sezioni sono aperte tra un render e l'altro.
    const popOpenState = { sicurezza: false, benessere: false, tassazione: false };

    // Migliorie civiche (§6.1) DENTRO la sottosezione Benessere: le due voci
    // Sanità/Felicità non sono più solo un numero, sono i loro edifici da
    // costruire. Ogni categoria: intestazione N/5 + i 5 edifici (uno per risorsa)
    // come pulsanti. `buildOk` = si può agire davvero (plancia, proprio turno,
    // fase costruisci); altrimenti i pulsanti restano lì ma spenti, così il
    // giocatore vede cosa gli manca senza poter cliccare fuori tempo.
    function welfareBlocksHtml(player, capital, buildOk) {
        const entries = welfareOf(capital);
        const byKey = {};
        entries.forEach(e => { byKey[e.key] = e; });
        const resLabel = k => GameRules.RES_LABEL[k] || k;

        const blocks = ['sanita', 'felicita'].map(cat => {
            const def = GameRules.WELFARE[cat];
            const keys = Object.keys(def.edifici);
            const n = keys.filter(k => byKey[k] && !byKey[k].dormant).length;   // solo ATTIVE contano
            const btns = keys.map(key => {
                const e = def.edifici[key];
                const cost = GameRules.welfareCost(key);
                const entry = byKey[key];
                let cls = 'pop-welfare-btn', title, disabled = '', costTxt;
                if (entry && !entry.dormant) {
                    cls += ' built'; title = 'Attiva · manutenzione 1 ' + resLabel(e.res) + ' ogni 5 turni';
                    disabled = 'disabled'; costTxt = '✓';
                } else if (entry && entry.dormant) {
                    // Dormiente: riattivabile pagando 1 (la manutenzione arretrata).
                    const upkeep = {}; upkeep[e.res] = 1;
                    const okRi = GameRules.canAfford(player, upkeep, 0);
                    costTxt = '1 ' + resLabel(e.res);
                    if (!okRi.ok) { cls += ' no dormant'; title = 'Dormiente — ' + GameRules.missingText(okRi.missing) + ' per riattivarla'; disabled = 'disabled'; }
                    else if (!buildOk) { cls += ' locked dormant'; title = 'Dormiente — riattivala nel tuo turno (fase Costruisci)'; disabled = 'disabled'; }
                    else { cls += ' revive dormant'; title = 'Riattiva — 1 ' + resLabel(e.res); }
                } else {
                    const afford = GameRules.canAfford(player, cost, 0);
                    costTxt = GameRules.formatCost(cost);
                    if (!afford.ok) { cls += ' no'; title = GameRules.missingText(afford.missing); disabled = 'disabled'; }
                    else if (!buildOk) { cls += ' locked'; title = 'Solo nel tuo turno, in fase Costruisci'; disabled = 'disabled'; }
                    else { cls += ' ok'; title = 'Costruisci — ' + GameRules.formatCost(cost); }
                }
                return `<button type="button" class="${cls}" data-welfare-key="${key}" title="${title}" ${disabled}>` +
                    `<span class="pwb-name">${e.label}</span>` +
                    `<span class="pwb-cost">${costTxt}</span></button>`;
            }).join('');
            return `<div class="pop-welfare" data-cat="${cat}">` +
                `<div class="pop-welfare-head"><span class="pwf-name">${def.icon} ${def.label}</span>` +
                `<span class="pwf-score">${n}/5</span></div>` +
                `<div class="pop-welfare-btns">${btns}</div></div>`;
        }).join('');

        // Riga di stato della manutenzione (§6.1): quando cade il prossimo prelievo
        // e cosa reclama. Rispetta la stessa GRAZIA della logica: un edificio è
        // coinvolto in un turno di manutenzione M solo se ha compiuto il primo ciclo
        // pieno (turno ≤ M−5), così un edificio appena costruito non compare come
        // "dovuto" al ciclo che salta.
        let status = '';
        if (entries.length) {
            const T = currentTurn;
            const firstMaint = (T % 5 === 0) ? T + 5 : (Math.floor(T / 5) + 1) * 5;
            // Turno in cui QUESTO edificio viene davvero prelevato: il primo turno di
            // manutenzione futuro in cui ha già compiuto il ciclo pieno (turno ≤ M−5).
            const dueAt = e => { let M = firstMaint; while ((e.turn || 0) > M - 5) M += 5; return M; };
            const nextDue = Math.min.apply(null, entries.map(dueAt));
            const dovute = entries.filter(e => dueAt(e) === nextDue);
            const dormienti = entries.filter(e => e.dormant);
            let txt = '🔧 Prossima manutenzione: turno ' + nextDue +
                ' · ' + dovute.length + (dovute.length === 1 ? ' risorsa' : ' risorse') + ' (1 per edificio)';
            status = '<div class="pop-welfare-maint">' + txt + '</div>';
            if (dormienti.length) {
                const quando = Math.min.apply(null, dormienti.map(dueAt));
                status += '<div class="pop-welfare-maint warn">⚠ Dormienti: ' +
                    dormienti.map(e => GameRules.welfareLabel(e.key)).join(', ') +
                    ' — crollano al turno ' + quando + ' se non paghi 1 ' +
                    dormienti.map(e => resLabel(GameRules.welfareInfo(e.key).res)).filter((v, i, a) => a.indexOf(v) === i).join('/') +
                    '.</div>';
            }
        }
        return blocks + status;
    }

    function renderPopularityPanel() {
        const panel = document.getElementById('popularity-panel');
        if (!panel) return;
        const body = document.getElementById('pop-body');
        const player = PLAYERS.find(p => p.id === selectedTabPlayerId);

        // Nessun giocatore focalizzato → pannello nascosto.
        if (!player || !body) { panel.style.display = 'none'; return; }
        panel.style.display = 'flex';

        const capital = getCapitalPathFor(player);
        if (!capital) {
            body.innerHTML = '<div class="pop-empty"><span>Ogni grande impero è nato attorno ad una gloriosa capitale.</span></div>';
            return;
        }

        const pop = computePopularity(player, capital);
        const d = pop.detail;
        // Si può costruire davvero? Solo nella plancia/admin, nel proprio turno e
        // in fase costruisci — game-actions rifiuta comunque, ma così i pulsanti
        // lo dicono prima invece di far cliccare a vuoto.
        const buildOk = (BOARD_MODE || isAdminMode) && turnoDi === player.id &&
            GameActions.phaseOf(player) === 'costruisci';
        const taxSel = ['leggera', 'normale', 'dura'].map(k =>
            `<div class="pop-tax-opt${(d.tax === k) ? ' active' : ''}" data-tax="${k}">${TAX_LEVELS[k].label}</div>`
        ).join('');

        body.innerHTML = `
            <div class="pop-total">
                <div class="pop-total-label">Livello ${pop.totale} / 5</div>
                ${circlesHtml(pop.totale, false)}
                ${pop.grazia ? `<div class="pop-grace" title="Nei primi decenni il popolo di un regno giovane è indulgente: questo bonus cala e sparisce. Costruisci strade e migliorie civiche prima che svanisca.">✨ Grazia dell'insediamento +${pop.grazia}</div>` : ''}
            </div>
            <div class="pop-sub${popOpenState.sicurezza ? ' open' : ''}" data-sub="sicurezza">
                <div class="pop-sub-head">
                    <span class="pop-sub-caret">▶</span>
                    <span class="pop-sub-icon">🛡️</span>
                    <span class="pop-sub-name">Sicurezza</span>
                    <span class="pop-sub-score">${pop.sicurezza}/5</span>
                </div>
                <div class="pop-sub-body">
                    ${circlesHtml(pop.sicurezza, true)}
                    <div class="pop-factor"><span class="pop-factor-label">Province nemiche al confine (neutrali incluse)</span><span class="pop-factor-val">${d.enemyBorders} → ${d.pConf}/5</span></div>
                    <div class="pop-factor"><span class="pop-factor-label">Guardia cittadina (soldati &gt; 5)</span><span class="pop-factor-val">${d.soldiers} → ${d.pGuardia}/5</span></div>
                    <div class="pop-factor"><span class="pop-factor-label">Generale in Capitale</span><span class="pop-factor-val">${d.hasGeneral ? '+1' : '—'}</span></div>
                </div>
            </div>
            <div class="pop-sub${popOpenState.benessere ? ' open' : ''}" data-sub="benessere">
                <div class="pop-sub-head">
                    <span class="pop-sub-caret">▶</span>
                    <span class="pop-sub-icon">🌾</span>
                    <span class="pop-sub-name">Benessere</span>
                    <span class="pop-sub-score">${pop.benessere}/5</span>
                </div>
                <div class="pop-sub-body">
                    ${circlesHtml(pop.benessere, true)}
                    <div class="pop-factor"><span class="pop-factor-label">Tipi di risorsa collegati</span><span class="pop-factor-val">${d.varieta}/5</span></div>
                    <div class="pop-factor"><span class="pop-factor-label">Cibo collegato (Grano/Bestiame)</span><span class="pop-factor-val">${d.foodProv} → ${d.cibo}/5</span></div>
                    ${welfareBlocksHtml(player, capital, buildOk)}
                </div>
            </div>
            <div class="pop-sub${popOpenState.tassazione ? ' open' : ''}" data-sub="tassazione">
                <div class="pop-sub-head">
                    <span class="pop-sub-caret">▶</span>
                    <span class="pop-sub-icon">💰</span>
                    <span class="pop-sub-name">Tassazione</span>
                    <span class="pop-sub-score">${pop.tassa}/5</span>
                </div>
                <div class="pop-sub-body">
                    ${circlesHtml(pop.tassa, true)}
                    <div class="pop-factor"><span class="pop-factor-label">Più tasse = più monete, meno popolarità</span></div>
                    <div class="pop-tax-select">${taxSel}</div>
                </div>
            </div>
        `;

        // Espandi/comprimi le sotto-sezioni.
        body.querySelectorAll('.pop-sub-head').forEach(head => {
            head.addEventListener('click', () => {
                const sub = head.parentElement;
                const key = sub.getAttribute('data-sub');
                popOpenState[key] = !popOpenState[key];
                sub.classList.toggle('open', popOpenState[key]);
            });
        });

        // Migliorie civiche (§6.1): costruzione diretta dalla sottosezione Benessere.
        // Passa da GameActions come ogni mutazione (salvataggio + rifiuto fuori
        // turno/fase); poi ridisegna il pannello e avvisa la plancia (il Benessere,
        // e quindi la Popolarità, sono cambiati).
        body.querySelectorAll('.pop-welfare-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isAdminMode && !BOARD_MODE) return;
                const res = GameActions.buildWelfare(player, btn.getAttribute('data-welfare-key'));
                if (!res.ok) { showPieceNotice(res.msg); return; }
                renderPopularityPanel();
                notifyBoard();
            });
        });

        // Selettore di tassazione (solo admin): cambia lo stato del regno e ricalcola.
        body.querySelectorAll('.pop-tax-opt').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                // Nella plancia e' il giocatore stesso a decidere la propria tassazione.
                if (!isAdminMode && !BOARD_MODE) return;
                // Passa da GameActions come ogni altra mutazione di stato: da lì
                // arrivano il salvataggio e il rifiuto fuori turno.
                const res = GameActions.setTax(player, opt.getAttribute('data-tax'));
                if (!res.ok) { showPieceNotice(res.msg); return; }
                renderPopularityPanel();
                notifyBoard();   // entrate e rinforzi dipendono dalla tassa
            });
        });
    }

    // Il pannello dell'editor è una colonna fissa a sinistra (vedi --editor-col in
    // tokens.css): non si trascina e non si ridimensiona, quindi non serve più né il
    // drag né lo zoom legato alla larghezza. La leggibilità la decide il font-size
    // di #side-panel, da cui dipendono in em quasi tutti i figli.

    // ============================================================
    // CONFERMA IN PAGINA — rimpiazza window.confirm.
    // Il dialogo nativo non è affidabile: in un pannello di anteprima (o in un
    // iframe sandboxato, o con i popup bloccati) il browser lo chiude d'ufficio e
    // confirm() torna sempre false. Chi cliccava "Attacca" non vedeva succedere
    // nulla e sembrava un bug del gioco. Qui il dialogo è DOM nostro: funziona
    // ovunque e si veste come il resto della plancia.
    // ============================================================

    // `onNo` (opzionale) scatta SOLO sul bottone di rifiuto esplicito, non su
    // Esc/click fuori: così un pop-up può offrire tre esiti — sì (onYes), no
    // (onNo) e "più tardi" (chiudi e basta). I chiamanti che passano solo onYes
    // restano identici a prima.
    function askConfirm(opts, onYes, onNo) {
        const o = (typeof opts === 'string') ? { text: opts } : (opts || {});
        const old = document.getElementById('ui-confirm');
        if (old) old.remove();

        const wrap = document.createElement('div');
        wrap.id = 'ui-confirm';
        wrap.innerHTML =
            '<div class="uc-card">' +
            '<div class="uc-title"></div>' +
            '<div class="uc-text"></div>' +
            '<div class="uc-actions">' +
            '<button type="button" class="uc-no"></button>' +
            '<button type="button" class="uc-yes"></button>' +
            '</div></div>';
        wrap.querySelector('.uc-title').textContent = o.title || 'Confermi?';
        wrap.querySelector('.uc-text').textContent = o.text || '';
        wrap.querySelector('.uc-yes').textContent = o.ok || 'Conferma';
        wrap.querySelector('.uc-no').textContent = o.cancel || 'Annulla';
        if (o.tone) wrap.querySelector('.uc-card').classList.add(o.tone);

        const close = () => { document.removeEventListener('keydown', onKey); wrap.remove(); };
        const accept = () => { close(); if (typeof onYes === 'function') onYes(); };
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'Enter') { e.preventDefault(); accept(); }
        }

        const refuse = () => { close(); if (typeof onNo === 'function') onNo(); };
        wrap.querySelector('.uc-no').addEventListener('click', refuse);
        wrap.querySelector('.uc-yes').addEventListener('click', accept);
        wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
        wrap.querySelector('.uc-yes').focus();
    }

    // ============================================================
    // PERGAMENA DI CRONACA — un annuncio, non una domanda.
    // Tre eventi la srotolano (js/chronicle.js decide il contenuto):
    //   - `citta`     una Città sorge: nome vero e anno dentro il decennio;
    //   - `capitale`  il regno vi mette il seggio;
    //   - `battaglia` in questa provincia, in questo decennio, si è combattuta
    //                 davvero una battaglia (data/historic_battles.js).
    // Si chiude con un click, Esc o Invio.
    // ============================================================

    const FOUNDATION_EYEBROW = {
        battaglia: 'Cronaca — accadde davvero in questi anni',
        capitale: 'Cronaca del regno',
        scisma: 'Cronaca della fede',
        editto: 'Editto — accaduto mentre non eri al potere',
        naufragio: 'Cronaca del mare — accadde in rotta',
        commercio: 'Commercio — una carovana ha concluso',
        patto: 'Diplomazia — un araldo alla tua corte',
        tradimento: 'Diplomazia — un araldo reca la nuova di un tradimento',
        manutenzione: 'Migliorie civiche — la manutenzione reclama il suo (§6.1)',
        regno: 'Cronaca — una corona nuova sorge ai tuoi confini',
        cronaca: 'Cronaca del regno — la storia bussa alla corte',
        peste: 'La peste — un male che non guarda in faccia nessuno',
        // La crociata è un evento raro e importante (§Eventi): senza
        // un'etichetta propria ricadeva sulla generica "Cronaca del regno",
        // che non dice che è successo qualcosa di grosso — regola dell'utente:
        // il giocatore non deve rischiare di non accorgersene.
        crociata: 'La Crociata — l’oste giunge in Terra Santa'
    };

    // UN REGNO È COMPATTO IN UN'UNICA FEDE (regola dell'utente, generalizzata):
    // ogni provincia che possiedi — conquistata o tua fin dall'inizio — professa
    // SEMPRE la fede DI STATO corrente della tua Capitale. Prima la regola valeva
    // solo per le province CONQUISTATE (data-fede-conq): il territorio nativo,
    // mai toccato da una battaglia, seguiva ognuno la propria geografia — e uno
    // scisma regionale spaccava un regno mai stato in guerra (bug segnalato
    // dall'utente: il Sacro Romano Impero, tutto territorio originario, usciva
    // dalla Riforma con la Capitale cattolica e Saxony/Anhalt protestanti, pur
    // non avendo mai conquistato nessuno). Ora la geografia decide SOLO per la
    // Capitale (che è la fonte della fede di stato) e per le terre di nessuno
    // (che non hanno una corona a cui allinearsi); ogni altra provincia propria
    // la insegue qui. Chi non ha ancora una Capitale (quindi nessuna fede di
    // stato) resta come sta. Va chiamata ad ogni giro completo (applySchisms,
    // sotto), non solo quando scatta uno scisma nuovo: così ripara anche il
    // disallineamento di una partita già in corso.
    // Una provincia è il SEGGIO di un regno se ha un proprietario e ci sta sopra
    // la pedina Capitale. Non si passa da getCapitalPathFor (che cerca per colore
    // partendo dal record del giocatore): qui la domanda è al contrario — data la
    // provincia, è una Capitale? — e serve dentro cicli su tutte e 628.
    function isCapitalSeat(path) {
        return !!(path && path.getAttribute('data-owner') && countPiece(path, 'capitale') > 0);
    }

    function syncKingdomFaiths(paths) {
        if (typeof Religions === 'undefined') return 0;
        const stateFaith = new Map();
        let changed = 0;
        paths.forEach(p => {
            const ownerName = p.getAttribute('data-owner');
            if (!ownerName) return;          // terra di nessuno: resta alla geografia
            if (isCapitalSeat(p)) return;     // la Capitale è la fonte, non il bersaglio
            if (!stateFaith.has(ownerName)) {
                const owner = PLAYERS.find(pl => pl.name === ownerName);
                stateFaith.set(ownerName, owner ? stateReligionOf(owner) : null);
            }
            const sf = stateFaith.get(ownerName);
            if (sf && religionKeyOf(p) !== sf) {
                p.setAttribute('data-religione', sf);
                changed++;
            }
        });
        return changed;
    }

    // ---------- scismi (js/religions.js) ----------
    // A un dato turno una fede si spezza in un'altra dentro certe regioni. Muta le
    // province sulla mappa e srotola la pergamena (uguale a una fondazione, tinta
    // 'scisma'). Chiamata da game-actions.endTurn a giro finito; si autodisegna,
    // così vale sia per il turno umano sia per quelli dei bot. Ritorna gli scismi
    // che hanno davvero cambiato qualcosa (per log/test).
    function applySchisms(turn) {
        if (typeof Religions === 'undefined') return [];
        const svg = document.querySelector('svg');
        if (!svg) return [];
        const paths = provincePaths(svg);
        const fired = Religions.schismsAt(turn);

        const done = [];
        if (fired.length) {
            // Centro di ogni provincia, una volta sola: le regole degli scismi
            // filtrano per rettangolo sul centro.
            const center = new Map();
            paths.forEach(p => {
                let b = null; try { b = p.getBBox(); } catch (e) { b = null; }
                center.set(p, b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 });
            });

            fired.forEach(sc => {
                let changed = 0;
                (sc.rules || []).forEach(rule => {
                    const scoped = !!(rule.rects || rule.names);
                    paths.forEach(p => {
                        // Una provincia PROPRIA non si scisma per GEOGRAFIA: la
                        // sua sorte è legata alla Capitale del suo regno, e ci
                        // pensa syncKingdomFaiths qui sotto. ECCEZIONE: la
                        // provincia che OSPITA il seggio — è lei la fonte della
                        // fede di stato, quindi è lei che deve rispondere alla
                        // geografia (anche quando il seggio sta su una terra
                        // conquistata: presa a un nemico e promossa, o
                        // traslocata su una Città di conquista). Solo le terre
                        // di nessuno (nessun proprietario) restano pura geografia.
                        if (p.getAttribute('data-owner') && !isCapitalSeat(p)) return;
                        if (religionKeyOf(p) !== rule.from) return;
                        if (scoped) {
                            const c = center.get(p);
                            const inRect = rule.rects && rule.rects.some(r =>
                                c.x >= r[0] && c.x <= r[2] && c.y >= r[1] && c.y <= r[3]);
                            const inNames = rule.names && rule.names.indexOf(provinceLabel(p)) >= 0;
                            if (!inRect && !inNames) return;
                        }
                        p.setAttribute('data-religione', rule.to);
                        changed++;
                    });
                });
                if (changed) done.push(sc);
            });
        }

        // Ad ogni giro, scisma o no: riallinea OGNI provincia propria alla fede
        // di stato corrente del suo regno (vedi syncKingdomFaiths).
        const synced = syncKingdomFaiths(paths);

        if (done.length || synced) refreshMapDisplay();
        if (done.length) {
            const anno = (typeof Chronicle !== 'undefined') ? Chronicle.yearOfTurn(turn) : 1000;
            // Uno scisma per turno (SCHISMS ha turni distinti): srotola il primo.
            const sc = done[0];
            showFoundation({ tipo: 'scisma', anno, titolo: sc.titolo, testo: sc.testo, nota: sc.nota });
        }
        return done;
    }

    function showFoundation(info) {
        if (!info) return;
        const old = document.getElementById('ui-foundation');
        if (old) old.remove();

        const wrap = document.createElement('div');
        wrap.id = 'ui-foundation';
        wrap.innerHTML =
            '<div class="uf-scroll">' +
            '<div class="uf-rod"></div>' +
            '<div class="uf-sheet">' +
            '<div class="uf-eyebrow"></div>' +
            '<div class="uf-year"></div>' +
            '<div class="uf-title"></div>' +
            '<div class="uf-text"></div>' +
            '<div class="uf-note"></div>' +
            '<div class="uf-actions"><button type="button" class="uf-ok">Così sia</button></div>' +
            '</div>' +
            '<div class="uf-rod"></div>' +
            '</div>';

        const scroll = wrap.querySelector('.uf-scroll');
        if (info.colore) scroll.style.setProperty('--kingdom', info.colore);
        if (info.tipo) scroll.classList.add('uf-' + info.tipo);
        wrap.querySelector('.uf-eyebrow').textContent =
            FOUNDATION_EYEBROW[info.tipo] ||
            ('Cronaca' + (info.regno ? ' del regno di ' + info.regno : ''));
        wrap.querySelector('.uf-year').textContent = 'Anno Domini ' + info.anno;
        wrap.querySelector('.uf-title').textContent = info.titolo || '';
        wrap.querySelector('.uf-text').textContent = info.testo || '';
        wrap.querySelector('.uf-note').textContent = info.nota || '';

        const close = () => { document.removeEventListener('keydown', onKey); wrap.remove(); };
        function onKey(e) {
            if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); }
        }
        wrap.querySelector('.uf-ok').addEventListener('click', close);
        wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
        wrap.querySelector('.uf-ok').focus();
    }

    // ============================================================
    // SCENA DELLA BATTAGLIA (§9) — un attacco deve VEDERSI sulla mappa, non solo
    // comparire come riga di testo in un pannello.
    // Tre battute, nell'ordine in cui il giocatore le capisce:
    //   1) FUOCO SPENTO: la mappa si abbassa, restano accese le due province;
    //   2) CARICA: una lama corre dall'attaccante al difensore;
    //   3) IMPATTO: lampo, scossa breve della mappa, e i caduti che si staccano
    //      dai due campi come numeri rossi.
    // Le regole di "game feel" a cui si ispira: hit-stop (un attimo di stasi sul
    // colpo, perché il giocatore registri cosa è successo), screen shake corto e
    // proporzionato all'evento, numeri di danno flottanti che dicono il costo.
    // Tutto in SVG + CSS: nessuna libreria, e con prefers-reduced-motion il CSS
    // spegne i movimenti lasciando i numeri leggibili.
    //
    // DURATE (scelta dell'utente: la scena deve VEDERSI, e l'esito arrivare
    // dopo). Stanno qui, non sparse nei setTimeout della plancia: chi mostra un
    // pop-up dopo una battaglia non deve indovinare quanto dura la scena, chiede
    // `Risiko.battleFxBusy()` e aspetta. BATTLE_FX_SETTLE è il respiro fra la
    // fine della scena e il pop-up: senza, l'avviso piomba sull'ultimo fotogramma.
    // ============================================================

    const BATTLE_FX_MS = 5200;      // quanto dura la scena sulla mappa
    const BATTLE_FX_SETTLE = 900;   // e quanto si aspetta ancora prima dei pop-up

    let battleTimers = [];
    let battleFxUntil = 0;

    // "La scena è ancora in corso (o è appena finita)?" — l'unica risposta,
    // usata dalla plancia per non coprire il colpo con una modale.
    function battleFxBusy() {
        return nowMs() < battleFxUntil;
    }

    function nowMs() {
        return (typeof performance !== 'undefined' && performance.now)
            ? performance.now() : Date.now();
    }

    function clearBattleFx() {
        battleTimers.forEach(clearTimeout);
        battleTimers = [];
        const svg = document.querySelector('svg');
        if (svg) {
            svg.querySelectorAll('.battle-fx').forEach(el => el.remove());
            svg.classList.remove('battle-focus');
            svg.querySelectorAll('.battle-attacker, .battle-defender').forEach(p => {
                p.classList.remove('battle-attacker', 'battle-defender');
            });
        }
        const wrap = document.getElementById('map-wrapper');
        if (wrap) wrap.classList.remove('battle-shake');
    }

    function battleLater(fn, ms) { battleTimers.push(setTimeout(fn, ms)); }

    function provinceCenter(path) {
        const b = mainBodyBBox(path);
        if (!b) return null;
        return { x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(1, Math.min(b.w, b.h) / 2) };
    }

    function fxEl(svg, tag, attrs, cls) {
        const el = document.createElementNS(SVG_NS, tag);
        Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k]));
        el.setAttribute('class', 'battle-fx ' + (cls || ''));
        el.setAttribute('pointer-events', 'none');
        svg.appendChild(el);
        return el;
    }

    // Numero di caduti che sale e svanisce sopra una provincia.
    function fxCasualty(svg, center, n, size, color, delay) {
        if (!n) return;
        const t = fxEl(svg, 'text', {
            x: center.x, y: center.y,
            'text-anchor': 'middle',
            'font-size': size,
            fill: color,
            style: 'animation-delay:' + delay + 'ms'
        }, 'fx-casualty');
        t.textContent = '−' + n;
    }

    // ============================================================
    // FRECCE D'ATTACCO (fase 3) — la mappa deve dire da sola dove si può
    // colpire: dalla provincia di partenza parte una freccia animata verso ogni
    // confinante attaccabile.
    // Stanno in un gruppo a parte (#attack-arrows) appeso in coda all'SVG, non
    // fra le pedine: refreshMapDisplay riscrive `fill` sulle province e
    // renderPiecesForPath rifà i gruppi delle pedine — qualsiasi cosa messa lì
    // dentro verrebbe cancellata. La plancia le ridisegna a ogni render, perché
    // i bersagli cambiano a ogni conquista.
    // ============================================================

    function clearAttackArrows() {
        const g = document.getElementById('attack-arrows');
        if (g) g.remove();
    }

    // kind: 'attacca' (rosse, il caso normale) o 'sposta' (oro): la freccia dice
    // anche CHE COSA succede se si clicca là, non solo dove si può andare.
    function showAttackArrows(fromId, targetIds, kind) {
        clearAttackArrows();
        const svg = document.querySelector('svg');
        if (!svg || !fromId || !targetIds || !targetIds.length) return;
        const A = provinceCenter(document.getElementById(fromId));
        if (!A) return;

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('id', 'attack-arrows');
        if (kind === 'sposta') g.setAttribute('class', 'atk-move');
        g.setAttribute('pointer-events', 'none');
        svg.appendChild(g);

        targetIds.forEach((id, i) => {
            const B = provinceCenter(document.getElementById(id));
            if (!B) return;
            const dx = B.x - A.x, dy = B.y - A.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len;
            // Parte fuori dal centro e si ferma prima del bersaglio: al centro
            // delle province ci sono le pedine, una freccia lì sopra le copre.
            // I due tagli sono limitati a una frazione della distanza: fra due
            // province grandi e vicine i raggi sommati superano la distanza fra i
            // centri e senza il clamp resta una freccia lunga due pixel.
            const trimA = Math.min(A.r * 0.75, len * 0.28);
            const trimB = Math.min(B.r * 0.85, len * 0.3);
            const shaft = len - trimA - trimB;
            const x1 = A.x + ux * trimA, y1 = A.y + uy * trimA;
            const x2 = B.x - ux * trimB, y2 = B.y - uy * trimB;
            // Spessore e punta scalano sulla freccia, non solo sulle province:
            // su un tratto corto una punta "giusta" diventerebbe una macchia.
            // Lo SPOSTAMENTO le vuole più sottili (scelta dell'utente): è una
            // marcia in casa, non una carica — un filo, non un dardo. La punta
            // segue lo spessore (h dipende da w), quindi si rimpicciolisce da sé.
            const wCap = Math.min(Math.min(A.r, B.r) * 0.16, shaft * 0.16);
            const w = kind === 'sposta'
                ? Math.max(0.32, wCap * 0.5)
                : Math.max(0.6, wCap);
            const delay = (i * 120) + 'ms';

            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('class', 'atk-arrow');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', x2); line.setAttribute('y2', y2);
            line.setAttribute('stroke-width', w);
            line.setAttribute('stroke-dasharray', (w * 2.2) + ' ' + (w * 1.8));
            line.style.animationDelay = delay;
            g.appendChild(line);

            // Punta: triangolo pieno sulla fine della linea.
            const h = Math.min(w * 3.2, shaft * 0.5);
            const px = -uy, py = ux;                       // perpendicolare
            const head = document.createElementNS(SVG_NS, 'polygon');
            head.setAttribute('class', 'atk-arrow-head');
            head.setAttribute('points', [
                x2 + ',' + y2,
                (x2 - ux * h + px * h * 0.6) + ',' + (y2 - uy * h + py * h * 0.6),
                (x2 - ux * h - px * h * 0.6) + ',' + (y2 - uy * h - py * h * 0.6)
            ].join(' '));
            head.style.animationDelay = delay;
            g.appendChild(head);
        });
    }

    // ============================================================
    // BERSAGLI CLICCABILI SULLA MAPPA — è la mappa a dire dove si può agire.
    // Le frecce dicono la direzione; questo dice CHE COSA SI PUÒ CLICCARE
    // dipingendo un RETINO (righe diagonali nel colore della fase) DENTRO la
    // provincia, come una zona segnata su una carta militare. Scelta dell'utente:
    // il vecchio contorno spesso (1,5 su bordi da 0,25) fra due bersagli
    // confinanti si saldava in una banda che non era di nessuno dei due —
    // confusionario. Il retino sta dentro ed è ritagliato sul poligono, quindi
    // non sconfina mai nel vicino.
    //
    // Tre regole imparate qui:
    //  1. Si dipinge su uno STRATO a parte (#order-marks), non sui path delle
    //     province: refreshMapDisplay riscrive `fill` su ogni provincia a ogni
    //     render e cancellerebbe qualunque cosa messa lì. Lo strato sta sopra le
    //     terre e sotto pedine/risorse (appese in coda), così le guarnigioni
    //     restano leggibili.
    //  2. Il retino è ritagliato con un clipPath sul path della provincia. I
    //     clip si creano UNA volta per id (la geometria non cambia mai) e si
    //     riusano: markTargets gira a ogni render, anche dopo ogni mossa dei bot
    //     (~20 ms di budget in refreshMapDisplay).
    //  3. Il clic resta della plancia: lo strato è `pointer-events:none`, quindi
    //     il clic attraversa e colpisce il path della provincia sotto. La classe
    //     `order-clickable` serve solo al cursore a manina.
    //
    // SPIE (§9.3) e PARTENZE dello spostamento NON prendono il retino: sono
    // decine di province e un retino ovunque farebbe luce dappertutto. Restano
    // un tratto sottile (via classe CSS), leggero apposta.
    // ============================================================

    // Colori di fase del retino: arancio attacco, oro spostamento, verde per la
    // partenza (primo clic dello spostamento), oro chiaro per l'origine di un
    // ordine. Un posto solo, così plancia e disegno non divergono.
    const ORDER_HUE = {
        attacca: { line: '#ff7a45', edge: '#ff7a45' },
        sposta:  { line: '#ffd479', edge: '#e8b530' },
    };

    // Il retino (pattern di righe diagonali) si costruisce una volta per fase e
    // vive nei defs. userSpaceOnUse: le righe sono in coordinate mappa, quindi
    // scalano da sé con lo zoom, senza infittirsi o diradarsi.
    const orderPatterns = {};
    function orderHatch(kind) {
        if (orderPatterns[kind]) return orderPatterns[kind];
        const svg = document.querySelector('svg');
        let defs = svg.querySelector('#order-defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            defs.setAttribute('id', 'order-defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        const id = 'order-hatch-' + kind;
        const col = (ORDER_HUE[kind] || ORDER_HUE.attacca).line;
        const pat = document.createElementNS(SVG_NS, 'pattern');
        pat.setAttribute('id', id);
        pat.setAttribute('width', '1.6');
        pat.setAttribute('height', '1.6');
        pat.setAttribute('patternUnits', 'userSpaceOnUse');
        pat.setAttribute('patternTransform', 'rotate(45)');
        const bg = document.createElementNS(SVG_NS, 'rect');
        bg.setAttribute('width', '1.6'); bg.setAttribute('height', '1.6');
        bg.setAttribute('fill', col); bg.setAttribute('fill-opacity', '.12');
        const ln = document.createElementNS(SVG_NS, 'line');
        ln.setAttribute('x1', '0'); ln.setAttribute('y1', '0');
        ln.setAttribute('x2', '0'); ln.setAttribute('y2', '1.6');
        ln.setAttribute('stroke', col); ln.setAttribute('stroke-width', '.35');
        ln.setAttribute('stroke-opacity', '.55');
        pat.appendChild(bg); pat.appendChild(ln);
        defs.appendChild(pat);
        orderPatterns[kind] = id;
        return id;
    }

    // Un clipPath sul poligono della provincia, così il retino resta dentro. La
    // geometria non cambia mai: si crea una volta per id e si riusa.
    const orderClips = new Set();
    function orderClip(path) {
        const id = 'order-clip-' + path.id;
        if (orderClips.has(id)) return id;
        const svg = document.querySelector('svg');
        let defs = svg.querySelector('#order-clip-defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            defs.setAttribute('id', 'order-clip-defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        const cp = document.createElementNS(SVG_NS, 'clipPath');
        cp.setAttribute('id', id);
        const clone = document.createElementNS(SVG_NS, 'path');
        clone.setAttribute('d', path.getAttribute('d'));
        cp.appendChild(clone);
        defs.appendChild(cp);
        orderClips.add(id);
        return id;
    }

    // Lo strato dei marchi: sopra le terre (#map-group), sotto i marker appesi in
    // coda. pointer-events:none, così il clic passa alla provincia sotto.
    function orderLayer(svg) {
        let layer = svg.querySelector('#order-marks');
        if (!layer) {
            layer = document.createElementNS(SVG_NS, 'g');
            layer.setAttribute('id', 'order-marks');
            layer.setAttribute('pointer-events', 'none');
            const land = svg.querySelector('#map-group');
            if (land && land.nextSibling) svg.insertBefore(layer, land.nextSibling);
            else svg.appendChild(layer);
        }
        return layer;
    }

    // Il retino di un bersaglio: la velatura a righe + un filo di bordo interno
    // che lo definisce. Tutto ritagliato dentro il poligono.
    function paintHatch(layer, path, kind) {
        const clip = 'url(#' + orderClip(path) + ')';
        const hue = ORDER_HUE[kind] || ORDER_HUE.attacca;
        const fill = document.createElementNS(SVG_NS, 'path');
        fill.setAttribute('d', path.getAttribute('d'));
        fill.setAttribute('fill', 'url(#' + orderHatch(kind) + ')');
        fill.setAttribute('clip-path', clip);
        layer.appendChild(fill);
        const edge = document.createElementNS(SVG_NS, 'path');
        edge.setAttribute('d', path.getAttribute('d'));
        edge.setAttribute('fill', 'none');
        edge.setAttribute('stroke', hue.edge);
        edge.setAttribute('stroke-width', '0.9');
        edge.setAttribute('stroke-linejoin', 'round');
        edge.setAttribute('clip-path', clip);
        layer.appendChild(edge);
    }

    // Un filo di bordo interno, senza retino: per l'origine di un ordine (oro) e
    // per le partenze dello spostamento (verde). Leggeri apposta.
    function paintEdge(layer, path, color, width) {
        const edge = document.createElementNS(SVG_NS, 'path');
        edge.setAttribute('d', path.getAttribute('d'));
        edge.setAttribute('fill', 'none');
        edge.setAttribute('stroke', color);
        edge.setAttribute('stroke-width', String(width));
        edge.setAttribute('stroke-linejoin', 'round');
        edge.setAttribute('clip-path', 'url(#' + orderClip(path) + ')');
        layer.appendChild(edge);
    }

    let markedTargets = [];     // province con classi CSS (cursore, spie): da ripulire

    function clearTargets() {
        markedTargets.forEach(p =>
            p.classList.remove('order-clickable', 'order-spy'));
        markedTargets = [];
        const layer = document.querySelector('#order-marks');
        if (layer) layer.textContent = '';
    }

    function markTargets(fromId, ids, kind) {
        clearTargets();
        const svg = document.querySelector('svg');
        if (!svg) return;

        // SPIE (§9.3): decine di mete, nessuna partenza. Restano un tratto
        // tratteggiato leggero (classe CSS), non un retino che accenderebbe
        // mezzo mondo.
        if (kind === 'spia') {
            (ids || []).forEach(id => {
                const p = document.getElementById(id);
                if (!p) return;
                p.classList.add('order-spy', 'order-clickable');
                markedTargets.push(p);
            });
            return;
        }

        const layer = orderLayer(svg);

        // PARTENZE dello spostamento (primo clic): province DA CUI si può muovere,
        // spesso molte. Filo verde sottile, niente retino — non sono mete.
        if (kind === 'partenza') {
            (ids || []).forEach(id => {
                const p = document.getElementById(id);
                if (!p) return;
                paintEdge(layer, p, '#a8cf83', 0.7);
                p.classList.add('order-clickable');
                markedTargets.push(p);
            });
            return;
        }

        // ATTACCO / SPOSTAMENTO: il retino sui bersagli, un filo d'oro sull'origine.
        // Una voce di `ids` può essere una stringa (il colore è quello della fase)
        // oppure {id, kind}: serve alla fase d'attacco, dove le province di un
        // ALLEATO si accendono col retino d'oro dello spostamento invece che con
        // l'arancio della carica (§Diplomazia, marciare in aiuto). Il colore dice
        // subito che quel confine non è un fronte.
        const from = fromId && document.getElementById(fromId);
        if (from) paintEdge(layer, from, '#ffe9a8', 0.9);
        (ids || []).forEach(v => {
            const id = (v && v.id) || v;
            const k = (v && v.kind) || kind;
            const p = document.getElementById(id);
            if (!p || p === from) return;
            paintHatch(layer, p, k === 'sposta' ? 'sposta' : 'attacca');
            p.classList.add('order-clickable');
            markedTargets.push(p);
        });
    }

    // ============================================================
    // I CONFINI COI REGNI DI GIOCATORI (richiesta dell'utente)
    //
    // "sulla mappa sempre visibile, sarebbe bello fossero evidenziati i confini
    //  con regni di giocatori": le province ALTRUI che toccano le tue si segnano
    // col colore di chi le possiede — un filo tratteggiato e un alone morbido
    // dentro il poligono. Serve a vedere a colpo d'occhio dove finisce il tuo
    // regno e comincia quello di un altro, senza aprire nulla.
    //
    // Vive su uno STRATO SUO (#border-marks) e non su #order-marks: quello lo
    // azzera markTargets a ogni fase, e il confine deve restare acceso sempre.
    // Per il resto valgono le stesse tre regole dei retini d'ordine — strato a
    // parte perché refreshMapDisplay riscrive i `fill`, clip riusato per id,
    // pointer-events:none così il clic passa alla provincia sotto.
    //
    // CHI marcare non si decide qui: la plancia passa la lista già filtrata
    // (province visibili, confinanti con le proprie, di regni umani), perché è
    // lei a sapere chi è il giocatore e cosa vede oltre la nebbia.
    // ============================================================
    function borderLayer(svg) {
        let layer = svg.querySelector('#border-marks');
        if (!layer) {
            layer = document.createElementNS(SVG_NS, 'g');
            layer.setAttribute('id', 'border-marks');
            layer.setAttribute('pointer-events', 'none');
            const land = svg.querySelector('#map-group');
            if (land && land.nextSibling) svg.insertBefore(layer, land.nextSibling);
            else svg.appendChild(layer);
        }
        return layer;
    }

    function clearBorders() {
        const layer = document.querySelector('#border-marks');
        if (layer) layer.textContent = '';
    }

    // `list` = [{id, color}]. Restituisce quante ne ha davvero segnate, così la
    // plancia sa se accendere la legenda.
    function markBorders(list) {
        const svg = document.querySelector('svg');
        if (!svg) return 0;
        const layer = borderLayer(svg);
        layer.textContent = '';
        let segnate = 0;
        (list || []).forEach(item => {
            const p = item && document.getElementById(item.id);
            if (!p) return;
            const clip = 'url(#' + orderClip(p) + ')';
            const col = item.color || '#c0a062';
            // alone: largo e tenue, tutto ritagliato dentro la provincia — è la
            // banda di frontiera, non un bordo netto.
            const halo = document.createElementNS(SVG_NS, 'path');
            halo.setAttribute('d', p.getAttribute('d'));
            halo.setAttribute('fill', 'none');
            halo.setAttribute('stroke', col);
            halo.setAttribute('stroke-width', '4.2');
            halo.setAttribute('stroke-opacity', '.28');
            halo.setAttribute('stroke-linejoin', 'round');
            halo.setAttribute('clip-path', clip);
            layer.appendChild(halo);
            // il filo tratteggiato: dice "questo confine è di qualcuno", e il
            // tratteggio lo distingue dai retini pieni degli ordini.
            const line = document.createElementNS(SVG_NS, 'path');
            line.setAttribute('d', p.getAttribute('d'));
            line.setAttribute('fill', 'none');
            line.setAttribute('stroke', col);
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('stroke-dasharray', '4 2.4');
            line.setAttribute('stroke-linejoin', 'round');
            line.setAttribute('clip-path', clip);
            layer.appendChild(line);
            segnate++;
        });
        return segnate;
    }

    // ============================================================
    // LE PROVINCE DI UN OBIETTIVO (§10, richiesta dell'utente)
    //
    // Il foglio 👑 copre la mappa e un obiettivo dice "possiedi N province di
    // un GRUPPO" (NORMANDY_FR, IBERIA…): il giocatore non sa quali siano. Il
    // bottone "Vedi sulla mappa" della card obiettivo (player-board) chiude il
    // foglio e chiama questa: accende quelle province e le inquadra.
    //
    // Strato SUO, persistente, come #border-marks e non #order-marks — quello
    // lo azzera il render a ogni fase, questo deve restare acceso mentre si
    // guarda. Lo spegne il primo clic sulla mappa (listener in player-board).
    // Valgono le stesse tre regole degli altri retini: strato a parte perché
    // refreshMapDisplay riscrive i fill, clip riusato per id, pointer-events
    // none così il clic passa alla provincia sotto.
    // ============================================================
    function objectiveLayer(svg) {
        let layer = svg.querySelector('#objective-marks');
        if (!layer) {
            layer = document.createElementNS(SVG_NS, 'g');
            layer.setAttribute('id', 'objective-marks');
            layer.setAttribute('pointer-events', 'none');
            const land = svg.querySelector('#map-group');
            if (land && land.nextSibling) svg.insertBefore(layer, land.nextSibling);
            else svg.appendChild(layer);
        }
        return layer;
    }

    function clearObjectiveSpot() {
        const layer = document.querySelector('#objective-marks');
        if (layer) layer.textContent = '';
    }

    // Accende gli id passati (le province del gruppo dell'obiettivo) e le
    // inquadra. Ritaglia dentro il poligono un velo d'oro + un filo netto, così
    // si legge "questo è il gruppo" senza sconfinare. Non guarda la nebbia: sono
    // i CONTORNI a illuminarsi, non le guarnigioni — e i contorni sono pubblici.
    function spotlightObjective(ids) {
        const svg = document.querySelector('svg');
        if (!svg) return 0;
        const layer = objectiveLayer(svg);
        layer.textContent = '';
        const validi = (ids || []).filter(id => document.getElementById(id));
        validi.forEach(id => {
            const p = document.getElementById(id);
            const clip = 'url(#' + orderClip(p) + ')';
            const d = p.getAttribute('d');
            const addPath = (attrs) => {
                const el = document.createElementNS(SVG_NS, 'path');
                el.setAttribute('d', d);
                el.setAttribute('clip-path', clip);
                el.setAttribute('class', 'obj-spot');
                el.setAttribute('stroke-linejoin', 'round');
                Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
                layer.appendChild(el);
            };
            // Deve leggersi su QUALSIASI colore di provincia (l'oro tenue sparisce
            // sul giallo): un velo dorato, poi un bordo interno a due strati —
            // un casing scuro sotto e un filo oro brillante sopra — così il segno
            // stacca sia sulle terre chiare sia su quelle scure. La pulsazione
            // (CSS .obj-spot) fa il resto: l'occhio trova ciò che lampeggia.
            addPath({ fill: '#ffcf5e', 'fill-opacity': '.28' });
            addPath({ fill: 'none', stroke: '#2a1c08', 'stroke-width': '6', 'stroke-opacity': '.55' });
            addPath({ fill: 'none', stroke: '#ffe08a', 'stroke-width': '3', 'stroke-opacity': '1' });
        });
        if (validi.length && mapView) mapView.fitToProvinces(validi);
        return validi.length;
    }

    // Posizione della provincia in pixel dentro #map-wrapper: serve alla plancia
    // per ancorare il cursore di schieramento HTML sopra la mappa. In pixel e non
    // in coordinate SVG apposta — l'overlay è HTML, non entra nel viewBox.
    function provinceScreenPos(id) {
        const path = document.getElementById(id);
        const wrap = document.getElementById('map-wrapper');
        if (!path || !wrap || !path.getBoundingClientRect) return null;
        const b = path.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        if (!b.width && !b.height) return null;
        // Il cursore va sopra la provincia, non sopra il centro del suo rettangolo:
        // sulle province a mezzaluna quello cade in mare. Stessa ancora delle pedine,
        // riportata in pixel con la matrice dello schermo.
        let px = b.left + b.width / 2, py = b.top + b.height / 2;
        const a = MapAnchors.landAnchor(path);
        const ctm = path.getScreenCTM && path.getScreenCTM();
        if (a && ctm) {
            px = ctm.a * a.x + ctm.c * a.y + ctm.e;
            py = ctm.b * a.x + ctm.d * a.y + ctm.f;
        }
        return {
            x: px - w.left,
            y: py - w.top,
            w: b.width, h: b.height,
            visible: b.right > w.left && b.left < w.right && b.bottom > w.top && b.top < w.bottom
        };
    }

    // info: l'oggetto restituito da GameActions.attack.
    function playBattleFx(info) {
        const svg = document.querySelector('svg');
        if (!svg || !info || !info.fromId || !info.toId) return;
        const from = document.getElementById(info.fromId);
        const to = document.getElementById(info.toId);
        if (!from || !to) return;
        const A = provinceCenter(from), B = provinceCenter(to);
        if (!A || !B) return;

        clearBattleFx();

        const dist = Math.max(1, Math.hypot(B.x - A.x, B.y - A.y));
        // Il segno è più GRANDE di prima (richiesta dell'utente: la scena si
        // deve vedere). Il tetto resta il raggio libero delle due province — se
        // no, su due province piccole l'impatto uscirebbe fuori dai loro confini
        // e non si capirebbe più chi le sta prendendo.
        const unit = Math.max(4.5, Math.min(dist * 0.13, Math.min(A.r, B.r) * 1.25));
        const vinta = !!info.conquistata;

        // Le urla partono con la carica, non con l'esito: è il momento in cui
        // l'ordine è dato. Il grido è più grosso quando l'assalto è grosso.
        if (window.RisikoAudio) {
            const uomini = info.engaged || 0;   // quanti uomini sono partiti davvero
            window.RisikoAudio.battleCry({ scala: Math.min(1, uomini / 20) });
        }

        battleFxUntil = nowMs() + BATTLE_FX_MS + BATTLE_FX_SETTLE;

        svg.classList.add('battle-focus');
        from.classList.add('battle-attacker');
        to.classList.add('battle-defender');

        // 1) la traiettoria della carica: si "scrive" da attaccante a difensore
        const line = fxEl(svg, 'line', {
            x1: A.x, y1: A.y, x2: B.x, y2: B.y,
            stroke: info.coloreAttaccante || '#e0c097',
            'stroke-width': Math.max(1.4, unit * 0.34),
            'stroke-linecap': 'round',
            pathLength: 100
        }, 'fx-charge');
        line.style.stroke = info.coloreAttaccante || '#e0c097';

        // Le lame che corrono lungo la traiettoria (CSS: translate da 0 a
        // dx/dy). Sono TRE, sfalsate: una sola lama era un puntino che passava,
        // tre sono un'ondata — e lo sfalsamento si legge come una colonna in
        // marcia invece che come un colpo secco.
        [0, 170, 330].forEach((ritardo, i) => {
            const blade = fxEl(svg, 'text', {
                x: A.x, y: A.y,
                'text-anchor': 'middle',
                'dominant-baseline': 'central',
                'font-size': unit * (i === 0 ? 2.6 : 1.9),
                // due animazioni (corsa, poi dissolvenza): due ritardi, e il
                // secondo è il primo più la durata della corsa (1s nel CSS).
                style: 'animation-delay:' + ritardo + 'ms, ' + (ritardo + 1020) + 'ms'
            }, 'fx-blade');
            blade.textContent = '⚔';
            blade.style.setProperty('--dx', (B.x - A.x) + 'px');
            blade.style.setProperty('--dy', (B.y - A.y) + 'px');
            // le due lame di scorta viaggiano di fianco alla prima, non sopra
            if (i) blade.setAttribute('opacity', '.75');
        });

        // 2) impatto sul difensore: tre onde d'urto + lampo della provincia
        battleLater(() => {
            [0, 170, 340].forEach((d, i) => {
                const c = fxEl(svg, 'circle', {
                    cx: B.x, cy: B.y, r: unit * 1.3,
                    fill: 'none',
                    stroke: vinta ? '#ffd479' : '#ff8a8a',
                    'stroke-width': Math.max(1.2, unit * 0.26),
                    style: 'animation-delay:' + d + 'ms'
                }, 'fx-blast');
                if (i) c.setAttribute('opacity', (0.75 - i * 0.2).toFixed(2));
            });
            to.classList.add(vinta ? 'battle-hit' : 'battle-held');
            const wrap = document.getElementById('map-wrapper');
            if (wrap) {
                wrap.classList.add('battle-shake');
                battleLater(() => wrap.classList.remove('battle-shake'), 780);
            }
        }, 1000);

        // 3) il conto dei caduti, uno per campo: è la parte che resta impressa
        battleLater(() => {
            fxCasualty(svg, A, info.perditeAttaccante, unit * 0.95, '#ff9b9b', 0);
            fxCasualty(svg, B, info.perditeDifensore, unit * 0.95, '#ff9b9b', 260);
        }, 1250);

        // 4) il verdetto, staccato dai caduti: prima si legge quanto è costata,
        // poi com'è finita. Arriva tardi apposta — è l'esito, e l'esito deve
        // farsi aspettare.
        battleLater(() => {
            const esito = fxEl(svg, 'text', {
                x: B.x, y: B.y + unit * 1.5,
                'text-anchor': 'middle',
                // MOLTO più piccolo (regola dell'utente): a unit*2.3 il
                // verdetto era largo quanto mezzo continente e copriva le
                // province attorno a quella contesa.
                'font-size': unit * 0.65,
                fill: vinta ? '#ffd479' : '#cfe8cf'
            }, 'fx-verdict');
            esito.textContent = vinta ? 'CONQUISTATA' : 'RESPINTO';
        }, 1750);

        battleLater(() => {
            to.classList.remove('battle-hit', 'battle-held');
            clearBattleFx();
        }, BATTLE_FX_MS);
    }

    // ============================================================
    // CAROVANE DEL COMMERCIO (§7) — quando parte una proposta o si chiude uno
    // scambio, una carovana parte dal Mercato del mittente verso il regno
    // destinatario. Stessa filosofia della scena della battaglia: solo SVG +
    // CSS, disegna dove le province già stanno e NON muove la telecamera.
    // SOLO LA DIREZIONE (regola dell'utente): la carovana mostra da che parte
    // va, MAI la provincia d'arrivo. Esce dal Mercato lungo la direzione della
    // meta e svanisce per strada, in mare aperto — vale anche quando la meta
    // sarebbe visibile: dove va una carovana diplomatica non è un'informazione
    // che si regala guardando l'animazione. Con toId nullo (scambio con la
    // banca) punta verso il largo. Gli elementi sono figli diretti dell'SVG e
    // sopravvivono ai refresh, come le frecce d'attacco e la battaglia.
    // ============================================================

    // Europa vs resto del mondo (Africa/Oriente): sceglie la BESTIA DA SOMA del
    // commercio — mulo in Europa, cammello altrove (richiesta dell'utente). I
    // rettangoli sono in coordinate SVG, misurati sulla mappa: l'Europa
    // continentale (dal Portogallo agli Urali) più la sponda nord del
    // Mediterraneo (Iberia, Italia, Balcani, Grecia). Restano fuori — e quindi
    // cammello — Nord Africa, Levante, Anatolia, Arabia, Persia e l'Oriente.
    const EUROPE_RECTS = [
        [515, 0, 815, 152],
        [545, 152, 700, 200]
    ];
    // La sponda AFRICANA del Mediterraneo (Maghreb e Cirenaica) sta alla stessa
    // latitudine di quella europea e finirebbe nel secondo rettangolo: la si
    // toglie a mano, o le carovane del Nord Africa userebbero il mulo invece del
    // cammello. La sponda europea (Andalusia, Sicilia, Peloponneso) resta più a
    // nord di y≈183 e non è toccata; le isole greche a est stanno oltre x≈672.
    const AFRICA_MED_RECTS = [
        [560, 183, 672, 205]
    ];
    function isEuropeProvince(id) {
        const p = document.getElementById(id);
        const c = p && provinceCenter(p);
        if (!c) return false;
        if (AFRICA_MED_RECTS.some(r => c.x >= r[0] && c.x <= r[2] && c.y >= r[1] && c.y <= r[3])) return false;
        return EUROPE_RECTS.some(r => c.x >= r[0] && c.x <= r[2] && c.y >= r[1] && c.y <= r[3]);
    }

    let tradeTimers = [];

    function clearTradeFx() {
        tradeTimers.forEach(clearTimeout);
        tradeTimers = [];
        const svg = document.querySelector('svg');
        if (svg) svg.querySelectorAll('.trade-fx').forEach(el => el.remove());
    }

    function tradeLater(fn, ms) { tradeTimers.push(setTimeout(fn, ms)); }

    // Una tratta: il sentiero tratteggiato che compare e il glifo che ci scorre
    // sopra da A a B (il movimento è tutto nel CSS, via --dx/--dy come fx-blade).
    function tradeCaravanLeg(svg, A, B, glyph, color, delay, size) {
        const trail = document.createElementNS(SVG_NS, 'line');
        trail.setAttribute('class', 'trade-fx trade-trail');
        trail.setAttribute('x1', A.x); trail.setAttribute('y1', A.y);
        trail.setAttribute('x2', B.x); trail.setAttribute('y2', B.y);
        trail.setAttribute('stroke', color);
        trail.setAttribute('stroke-width', Math.max(0.4, size * 0.1));
        trail.setAttribute('stroke-linecap', 'round');
        trail.setAttribute('stroke-dasharray', (size * 0.5) + ' ' + (size * 0.55));
        trail.setAttribute('pointer-events', 'none');
        trail.style.animationDelay = delay + 'ms';
        svg.appendChild(trail);

        const car = document.createElementNS(SVG_NS, 'text');
        car.setAttribute('class', 'trade-fx trade-car');
        car.setAttribute('x', A.x); car.setAttribute('y', A.y);
        car.setAttribute('text-anchor', 'middle');
        car.setAttribute('dominant-baseline', 'central');
        car.setAttribute('font-size', size);
        car.setAttribute('pointer-events', 'none');
        car.style.animationDelay = delay + 'ms';
        car.style.setProperty('--dx', (B.x - A.x) + 'px');
        car.style.setProperty('--dy', (B.y - A.y) + 'px');
        car.textContent = glyph;
        svg.appendChild(car);
    }

    function playTradeFx(fromId, toId, opts) {
        opts = opts || {};
        const svg = document.querySelector('svg');
        if (!svg || !fromId) return;
        const from = document.getElementById(fromId);
        if (!from) return;
        const A = provinceCenter(from);
        if (!A) return;

        // La direzione verso cui parte la carovana: verso la meta, o verso il
        // largo per lo scambio con la banca. La provincia d'arrivo NON si mostra:
        // si prende solo il verso e si percorre un tratto di strada limitato,
        // così la carovana svanisce prima di rivelare dove finisce.
        let dir;
        if (opts.abroad || !toId) {
            dir = { x: 1, y: -0.4 };
        } else {
            const to = document.getElementById(toId);
            const c = to && provinceCenter(to);
            if (!c) return;
            dir = { x: c.x - A.x, y: c.y - A.y };
        }
        const d = Math.max(1, Math.hypot(dir.x, dir.y));
        const reach = Math.min(d * 0.5, A.r * 5);
        const B = { x: A.x + dir.x / d * reach, y: A.y + dir.y / d * reach, r: A.r };

        clearTradeFx();
        const size = Math.max(4, Math.min(A.r * 1.4, reach * 0.7));
        tradeCaravanLeg(svg, A, B, opts.glyph || '📜', opts.color || '#e8c56a', 0, size);
        let dur = 1700;
        if (opts.back) {
            tradeCaravanLeg(svg, B, A, opts.back, opts.color2 || opts.color || '#cda24a', 320, size);
            dur = 2200;
        }
        tradeLater(clearTradeFx, dur);
    }

    // ============================================================
    // Superficie pubblica per la plancia giocatore (src/js/player-board.js).
    // app.js resta una singola closure: invece di spezzarlo in moduli, esponiamo
    // qui le poche funzioni che servono da fuori.
    // ============================================================
    window.Risiko = {
        // Chiamata a ogni ridisegno della mappa: la plancia ci aggancia il render.
        onRefresh: null,

        isBoardMode: () => BOARD_MODE,
        isAdmin: () => isAdminMode,
        players: () => PLAYERS,
        turn: () => currentTurn,
        focusId: () => selectedTabPlayerId,
        inviteUrlFor,

        playerByInvite(code) {
            if (!code) return null;
            return PLAYERS.find(p => p.invite === code) || null;
        },

        // Entra nel regno del giocatore: nebbia sulle province non sue, pannello
        // Popolarita' attivo, nessun pennello da editor.
        focusPlayer(id) {
            selectedTabPlayerId = id;
            selectedPlayer = null;
            selectedResource = null;
            selectedPiece = null;
            syncPlayerControlsVisibility();
            refreshMapDisplay();
        },

        // Un giocatore ha aperto la plancia di questo regno col suo link: lo si
        // segna nella presenza condivisa, così l'editor dell'admin mostra che lo
        // giocherà lui. NON lo scrive l'admin che apre col 👁 per curiosare: si
        // aspetta l'esito dell'auth e si scrive solo se NON si è admin.
        markPresence(player) {
            if (!player || !player.invite || !MultiplayerSync.isConfigured) return;
            MultiplayerSync.authReady.then(() => {
                if (MultiplayerSync.isAdmin) return;
                MultiplayerSync.setPresence(player.invite, {
                    invite: player.invite, playerId: player.id, name: player.name
                });
            });
        },

        // Interventi admin a partita in corso (creare regni, prendere bot, editti):
        // si edita congelati e le modifiche entrano al prossimo cambio turno.
        beginIntervention, commitIntervention, cancelIntervention,
        isIntervening: () => adminIntervening,
        hasPendingIntervention: () => !!pendingDiff,

        ownedPaths,
        provinceLabel,
        piecesOf,
        countPiece,
        playBattleFx,
        clearBattleFx,
        // Quanto dura la scena (e quanto si aspetta ancora prima di un pop-up):
        // la plancia non deve indovinarlo con un numero suo.
        battleFxBusy,
        battleFxMs: () => BATTLE_FX_MS + BATTLE_FX_SETTLE,
        playTradeFx,
        clearTradeFx,
        isEuropeProvince,
        showAttackArrows,
        clearAttackArrows,
        markTargets,
        clearTargets,
        // Confini coi regni di giocatori: strato a parte, resta acceso sempre.
        markBorders,
        clearBorders,
        // Province di un obiettivo (§10): il "Vedi sulla mappa" della card.
        spotlightObjective,
        clearObjectiveSpot,
        provinceScreenPos,
        confirm: askConfirm,
        showFoundation,
        resourceKeyOf,
        getCapitalPathFor,
        computePopularity,
        // Obiettivi di prestigio (§10, binario storico): la valutazione live per
        // la plancia e per l'IA, più le tre letture che servono a
        // GameActions.closeCycle — il contesto con cui il modulo puro valuta e
        // genera, l'archiviazione di un ciclo concluso, il profilo di fine ciclo.
        objectivesFor,
        objectiveContext,
        archiveObjectives,
        objectiveProfile,
        // I fattori misurati (nemiche al confine, guardia, varietà, cibo, tassa):
        // è quel che serve a Popularity.plan per rispondere "quanto costa il
        // livello che voglio?". Lo usa l'IA (js/bot.js) prima di ogni turno.
        popularityFactors,
        save: saveAutoSave,

        // --- religione (js/religions.js) ---
        // Fede di una provincia (per id), religione di stato di un regno, conteggio
        // per famiglia (per gli obiettivi di prestigio), pittura della mappa per
        // fede e applicazione degli scismi (chiamata da game-actions).
        faithOf(id) { const p = document.getElementById(id); return p ? religionKeyOf(p) : ''; },
        stateReligionOf,
        resetReligions,
        // Riallinea ORA ogni provincia propria alla fede di stato del suo regno
        // (la stessa passata che applySchisms fa a ogni giro). La chiama chi
        // sposta, promuove o costruisce una Capitale: da quel momento la fede di
        // stato è un'altra, e l'impero deve seguirla nello stesso istante — non
        // al prossimo giro completo, con la mappa che nel frattempo mente.
        syncStateFaiths() {
            const svg = document.querySelector('svg');
            if (!svg) return 0;
            const n = syncKingdomFaiths(provincePaths(svg));
            if (n) refreshMapDisplay();
            return n;
        },
        provincesByFamily,
        applySchisms,
        setMapPaint(mode) {
            mapPaintMode = (mode === 'fede' || mode === 'terreno') ? mode : 'owner';
            refreshMapDisplay();
            return mapPaintMode;
        },
        mapPaint: () => mapPaintMode,

        // Terreno di una provincia (per id): 'chiuso' o 'aperto' (§9, js/terrain.js).
        terrainOf(id) { return terrainKeyOf(document.getElementById(id)); },

        // --- stato di turno (docs/GAME_DESIGN.md §2) ---
        turnoDi: () => turnoDi,
        ordine: () => ordine.slice(),
        primoDelGiro: () => primoDelGiro,
        setTurnState(t, o, primo) {
            turnoDi = t;
            if (o) ordine = o.slice();
            if (typeof primo === 'number') primoDelGiro = primo;
        },
        // EVENTI STORICI (js/events.js): lo stato globale del calendario. Lo legge
        // e lo scrive game-actions (applyEvents/tickEvents); qui vive e si salva.
        eventi: () => eventi,
        setEventi(e) { eventi = (e && Array.isArray(e.attivi) && Array.isArray(e.fatti)) ? e : { attivi: [], fatti: [] }; },
        // Aggiunge un REGNO a partita in corso (evento: spawnKingdom). Come
        // addPlayer, ma con nome/colore dati; restituisce il record creato. NON
        // tocca province né ordine dei turni — quello lo fa game-actions, che
        // possiede lo stato di gioco. initPalette/renderPlayerTabs guardano da sé
        // l'elemento mancante, quindi vale sia in editor sia nella plancia.
        addKingdom(spec) {
            const s = spec || {};
            const nextId = PLAYERS.reduce((m, p) => Math.max(m, p.id), 0) + 1;
            const used = new Set(PLAYERS.map(p => (p.color || '').toLowerCase()));
            const color = (s.color && !used.has(s.color.toLowerCase())) ? s.color : pickNewPlayerColor();
            const pl = normalizePlayer({ id: nextId, name: s.name || ('Giocatore ' + nextId), color });
            pl.bot = s.bot || null;
            PLAYERS.push(pl);
            initPalette();
            renderPlayerTabs();
            // Il pannello Editto legge PLAYERS solo quando renderDecreeControls
            // gira: senza questa chiamata un regno nato a partita in corso (es.
            // l'invasione mongola) resta invisibile al menu finché non capita
            // un'altra azione qualsiasi a ridisegnare la mappa.
            renderDecreeControls();
            return pl;
        },
        advanceGlobalTurn() {
            saveCurrentTurnToHistory();
            currentTurn++;
            loadTurnFromHistory();
            updateTurnUI();
        },
        // Riporta il calendario all'anno zero e butta via la cronologia dei
        // proprietari: serve solo a chi apre una partita NUOVA (js/setup.js).
        resetHistory() {
            TURN_HISTORY = {};
            currentTurn = FIRST_TURN;
            updateTurnUI();
        },

        // --- BACKUP / RIPRISTINO PER TURNO (§salvataggi robusti) ---
        // L'elenco dei turni salvati (dal più recente): [{turn, savedAt}].
        listBackups() {
            return (typeof MultiplayerSync !== 'undefined' && MultiplayerSync.listBackups)
                ? MultiplayerSync.listBackups() : Promise.resolve([]);
        },
        // Ricarica la partita dall'inizio del turno `turn`: prende il backup, lo
        // applica localmente e lo ripubblica come stato vivo (FORZANDO la scrittura,
        // perché regredisce il calendario di proposito), poi cancella i backup dei
        // turni successivi — la vecchia linea temporale non deve lasciare fantasmi.
        // Solo l'admin, e con conferma dalla UI dell'editor.
        restoreTurn(turn) {
            if (typeof MultiplayerSync === 'undefined' || !MultiplayerSync.getBackup)
                return Promise.reject(new Error('Backup non disponibili.'));
            return MultiplayerSync.getBackup(turn).then(snap => {
                if (!snap) throw new Error('Nessun backup per il turno ' + turn + '.');
                // applyCloudState rimette in piedi mappa, giocatori, turno ed eventi
                // dallo snapshot, esattamente come un normale aggiornamento cloud.
                applyCloudState(snap);
                forcePushOnce = true;
                saveAutoSave();
                if (MultiplayerSync.deleteBackupsAfter) MultiplayerSync.deleteBackupsAfter(turn);
                return turn;
            });
        },

        // --- primitive di manipolazione della mappa, usate da game-actions.js ---
        // Superficie volutamente stretta: game-actions non conosce il DOM dell'SVG.
        engine: {
            path: (id) => document.getElementById(id),
            ownedPaths,
            // Tutte le province della mappa (serve ai presidi neutrali e al
            // sorteggio dei regni iniziali): niente alone costiero, vedi provincePaths.
            allPaths: () => provincePaths(),
            // Centro del corpo principale in coordinate SVG (gestisce il wrap del
            // bordo mappa, tipo Alaska): serve a classificare le province "lontane"
            // per il presidio neutrale (GameRules.isFarProvince).
            provinceCenter(path) {
                const c = provinceCenter(path);
                return c ? { x: c.x, y: c.y } : null;
            },
            landNeighbors: (id) => Array.from(NEIGHBORS_LAND[id] || []),
            areLandAdjacent,
            pieces: piecesOf,
            countPiece,
            canPlacePiece,
            addPiece(path, type, delta) { changePiece(path, type, delta); },
            erasePieces(path) { changePiece(path, '__erase__'); },
            // MERCENARI (§5.3): quanti dei soldati della provincia sono di ventura.
            // Deposito e nient'altro — CHI parte e CHI cade lo decide game-actions.
            merc: mercOf,
            setMerc,
            addMerc(path, n) { setMerc(path, mercOf(path) + Math.floor(n || 0)); },
            // MIGLIORIE CIVICHE (§6.1): Sanità/Felicità della città-capitale.
            // Voci {key,turn,dormant} sul path; chi le muta è game-actions.
            welfare: welfareOf,
            setWelfare,
            addWelfare(path, key, turn) {
                setWelfare(path, welfareOf(path).concat({ key, turn: turn || 0, dormant: false }));
            },
            setWelfareDormant(path, key, on) {
                setWelfare(path, welfareOf(path).map(e =>
                    e.key === key ? { key: e.key, turn: e.turn, dormant: !!on } : e));
            },
            removeWelfare(path, key) {
                setWelfare(path, welfareOf(path).filter(e => e.key !== key));
            },
            // SCAFI (§9.2): ogni nave è una pedina a sé, col suo carico.
            ships: shipsOf,
            setShips,
            addShip,
            removeShip,
            shipCapacity,
            shipRange: (tipo) => (typeof SeaRoutes !== 'undefined' ? SeaRoutes.rangeOf(tipo) : 0),
            // Che cosa raggiunge via mare una provincia con quel raggio (§9.2).
            // Vuoto finché la griglia non è pronta: la portata non si inventa.
            seaReach(provId, radius) {
                const svg = document.querySelector('svg');
                if (!svg || typeof SeaRoutes === 'undefined' || !SeaRoutes.isReady(svg)) return new Set();
                return SeaRoutes.reachCached(svg, provId, radius);
            },
            // SPEDIZIONI OLTREMARE (§9.2, rotte lunghe). Da dove una nave prende il
            // mare (approdo in acqua libera di una provincia costiera):
            seaAnchor(provId) {
                const p = document.getElementById(provId);
                if (!p) return null;
                const a = seaAnchor(p);
                return a ? { x: a.x, y: a.y } : null;
            },
            // Avanza una spedizione di una portata verso `dir` seguendo l'acqua.
            sail(x, y, dir, radius) {
                const svg = document.querySelector('svg');
                if (!svg || typeof SeaRoutes === 'undefined' || !SeaRoutes.isReady(svg)) return null;
                return SeaRoutes.sail(svg, x, y, dir, radius);
            },
            // Le coste che una spedizione ferma in (x,y) avvista/raggiunge.
            reachFromPoint(x, y, radius) {
                const svg = document.querySelector('svg');
                if (!svg || typeof SeaRoutes === 'undefined' || !SeaRoutes.isReady(svg)) return new Set();
                return SeaRoutes.reachFromPointCached(svg, x, y, radius);
            },
            armyColor: pieceColorOf,
            setArmyColor(path, color) {
                if (color) path.setAttribute('data-pc-color', color);
                else path.removeAttribute('data-pc-color');
            },
            owner: (path) => path.getAttribute('data-owner'),
            setOwner(path, name) {
                if (name) path.setAttribute('data-owner', name);
                else path.removeAttribute('data-owner');
            },
            religion: (path) => religionKeyOf(path),
            setReligion(path, faith) {
                if (faith && typeof Religions !== 'undefined' && Religions.exists(faith)) {
                    path.setAttribute('data-religione', Religions.canonical(faith));
                }
            },
            // Vincolo di conquista (§la fede segue la spada): una provincia presa
            // tiene la fede del conquistatore anche attraverso gli scismi futuri
            // (applySchisms salta chi ha data-fede-conq). Viaggia nel salvataggio
            // col suffisso '*' di collectReligions.
            setReligionLock(path, on) {
                if (on) path.setAttribute('data-fede-conq', '1');
                else path.removeAttribute('data-fede-conq');
            },
            roads: () => ROADS.slice(),
            hasRoad: (a, b) => !!findRoad(a, b),
            addRoad(a, b, color) { if (!findRoad(a, b)) toggleRoad(a, b, color); },
            removeRoad(a, b) {
                const existing = findRoad(a, b);
                if (existing) ROADS = ROADS.filter(r => r !== existing);
                return !!existing;
            },
            redrawProvince(path) { renderPiecesForPath(document.querySelector('svg'), path); },
            redrawRoads() { renderRoads(document.querySelector('svg')); },
            refresh: refreshMapDisplay,
            notice: showPieceNotice,
            save: saveAutoSave,
            // Salvataggio FORZATO: scavalca la guardia anti-regressione di sync.js.
            // Lo usano solo i reset voluti (partita nuova via startGame, ripristino
            // di un backup) — quelli che abbassano di proposito il numero di turno.
            saveForced() { forcePushOnce = true; saveAutoSave(); },
            // Backup dell'intero stato a inizio decennio (§salvataggi robusti):
            // game-actions lo chiama nel blocco `giroFinito` di endTurn. Un
            // documento per turno in games/main/turns, così si può sempre
            // ricaricare la partita da un turno precedente.
            backupTurn(turn) {
                if (typeof MultiplayerSync === 'undefined' || !MultiplayerSync.backupTurn) return;
                const snap = buildSnapshot();
                if (snap) MultiplayerSync.backupTurn(turn, snap);
            }
        },

        // --- MAPPA INIZIALE (js/start-map.js) ---
        // Fotografa e rimette la POSIZIONE DI PARTENZA. È una mappa, non una
        // partita salvata: entrano proprietari, risorse, pedine, strade e
        // l'anagrafica dei regni (id/nome/colore), e nient'altro. Tesoro,
        // scorte, reclute, fase, turno e strategie dei bot restano fuori
        // apposta — se ne occupa `GameActions.startGame()` quando la partita
        // comincia davvero, e così la stessa mappa si rigioca identica.
        scenario: {
            capture() {
                const svg = document.querySelector('svg');
                if (!svg) return null;
                const provinces = {};
                provincePaths(svg).forEach(p => {
                    const owner = p.getAttribute('data-owner');
                    if (owner) provinces[p.id] = owner;
                });
                return {
                    players: PLAYERS.map(p => ({ id: p.id, name: p.name, color: p.color })),
                    provinces,
                    resources: collectResources(svg),
                    religions: collectReligions(svg),
                    pieces: collectPieces(svg),
                    roads: collectRoads()
                };
            },
            // Rimette la mappa e riporta tutto a "partita non avviata":
            // calendario al turno 1, nessun turno in corso, cronologia buttata.
            // Da qui si preme "⚔️ Gioca con l'IA (mappa attuale)".
            apply(data) {
                if (!data || !document.querySelector('svg')) return false;
                if (window.Bot) window.Bot.stop();
                if (Array.isArray(data.players) && data.players.length) {
                    mergePlayerData(data.players);
                    initPalette();
                }
                TURN_HISTORY = {};
                currentTurn = FIRST_TURN;
                updateTurnUI();
                internalApplyMapData(data.provinces || {});
                applyResourceState(data.resources || {});
                if (data.religions) applyReligionState(data.religions);
                applyPieceState(data.pieces || {});
                applyRoadState(data.roads || []);
                turnoDi = null;
                eventi = { attivi: [], fatti: [] };
                ordine = [];
                primoDelGiro = 0;
                renderPlayerTabs();
                refreshMapDisplay();
                saveAutoSave();
                return true;
            }
        },

        // Vista mappa (disponibile solo dopo initMap).
        fitToProvinces(ids) { return mapView ? mapView.fitToProvinces(ids) : false; },
        setViewInsets(left, right) { if (mapView) mapView.setInsets(left, right); },
        resetView() { if (mapView) mapView.resetView(); },
        mapReady: () => !!mapView,

        // --- NEBBIA ---
        // Cosa può vedere adesso chi sta guardando: `null` = nessuna nebbia
        // (editor, o vista generale della plancia). Serve a chi racconta quel che
        // succede — registro dell'IA, scena della battaglia — perché una notizia
        // da dentro la nebbia è un'informazione che il giocatore non deve avere.
        visibleProvinces: () => visibleSet,
        isVisible: (id) => !visibleSet || visibleSet.has(id),
        // Isolotti non giocabili: disegnati come terra ma fuori dal motore. Serve
        // alla plancia per ignorare un clic su di loro (l'unico click handler che
        // li può ancora intercettare, via closest('path.state')).
        isPlayable: isPlayableProvince,
        // Cosa vede UN REGNO, chiunque stia guardando adesso: {visible, haze,
        // spie}. Non è la stessa domanda di `visibleProvinces` (che è "cosa vede
        // chi ha il focus"): serve a chi deve ragionare sul regno di un altro —
        // le spie (§9.3) si mandano solo dove quel regno NON vede già.
        seenBy: (playerName) => computeVisibleProvinces(playerName),
        // Confini pronti? Finché è false le adiacenze sono vuote (vedi neighborsReady).
        neighborsReady: () => neighborsReady
    };
});

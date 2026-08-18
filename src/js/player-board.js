// ============================================================
// Plancia giocatore (play.html)
// Legge il codice d'invito, entra nel regno corrispondente, inquadra la mappa
// sulle sue province, tiene aggiornati i due pannelloni e offre le azioni del
// turno (schiera, costruisci, recluta, attacca).
//
// Qui non c'è nessuna regola: i costi e i calcoli stanno in game-rules.js, le
// mutazioni in game-actions.js. Questo file disegna e raccoglie i clic.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const R = window.Risiko;
    if (!R) { console.error('player-board: app.js non ha esposto window.Risiko'); return; }

    const $ = id => document.getElementById(id);
    const RES_KEYS = (typeof RESOURCES !== 'undefined') ? Object.keys(RESOURCES) : [];
    const GR = () => window.GameRules;
    const GA = () => window.GameActions;

    let currentPlayerId = null;
    let hasFitted = false;
    let selectedProvId = null;
    let lastBattle = null;
    // Con che cosa si parte all'attacco (§9.2): null = via terra, altrimenti il
    // tipo di scafo scelto. Si azzera da sé quando cambia la provincia di
    // partenza — una nave scelta in Normandia non ha senso partendo da Napoli.
    let attackVessel = null;
    let attackVesselProv = null;

    // SPOSTAMENTO IN DUE CLIC (regola dell'utente): un clic sceglie la PARTENZA,
    // uno l'ARRIVO. Prima la partenza era semplicemente la provincia selezionata,
    // che entrando nella fase è quella dove si era chiuso l'attacco: siccome
    // ogni provincia propria collegata è anche una meta, cliccarne un'altra
    // apriva un ordine invece di cambiare partenza, e per liberarsi bisognava
    // passare da una provincia altrui. Ora la partenza va ARMATA apposta: finché
    // `moveArmed` è falso sulla mappa si accendono le province da cui si può
    // muovere, e la selezione ereditata dalla fase precedente non comanda nulla.
    // Ricliccare la partenza la libera (torna al primo passo).
    let moveArmed = false;

    // Stato dei moduli di commercio (§7): si tiene qui perché render() ricostruisce
    // l'HTML a ogni azione (anche dei bot) e i menù a tendina perderebbero la scelta.
    const tradeUI = { dai: null, prendi: null, n: 1, verso: null, offroT: null, offroN: 3, chiedoT: null, chiedoN: 2 };

    // ---------- pannelli: tre colonne, o tendine su schermi stretti ----------
    // Da 1200px in su i pannelli sono due colonne vere della griglia: la mappa
    // ha la sua terza colonna tutta per sé e gli inset restano a zero. Sotto,
    // tornano tendine sovrapposte sulla mappa.
    // I DUE PANNELLI SI CHIUDONO SEMPRE (richiesta dell'utente): chiuso, il
    // pannello sparisce e la sua colonna va a zero (classi left-closed /
    // right-closed su #board-main), così la mappa si prende lo spazio invece
    // di lasciare un buco. Chiudendoli entrambi resta solo la mappa.
    // Le linguette stanno dentro la cornice della mappa: sono sempre allo
    // stesso posto, aperto o chiuso.

    const leftPanel = $('board-left');
    const rightPanel = $('board-right');
    const mainEl = $('board-main');
    const wideQuery = window.matchMedia('(min-width: 1200px)');
    const isWide = () => wideQuery.matches;

    // La mappa ha una colonna sua: niente da compensare nel viewBox. La chiamata
    // serve comunque a rifare il fit quando la colonna centrale cambia misura —
    // ed è proprio quello che succede aprendo o chiudendo un pannello.
    function syncViewInsets() { R.setViewInsets(0, 0); }

    // Le frecce puntano dove va il pannello: aperto, indica la direzione in cui
    // sparirà; chiuso, quella da cui tornerà.
    const PANEL_GLYPH = { left: ['◀', '▶'], right: ['▶', '◀'] };
    const PANEL_NAME = { left: 'della corona', right: 'del turno' };

    function syncPanelTab(panel, tab, side) {
        const open = !panel.classList.contains('collapsed');
        tab.textContent = PANEL_GLYPH[side][open ? 0 : 1];
        tab.title = (open ? 'Nascondi' : 'Mostra') + ' il pannello ' + PANEL_NAME[side];
        mainEl.classList.toggle(side + '-closed', !open);
    }

    function wirePanelToggle(panel, tab, side) {
        if (!panel || !tab) return;
        tab.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            syncPanelTab(panel, tab, side);
            // Aperto o chiuso a mano durante la vista generale: è quello che si
            // ritrova rientrando nel regno, non lo stato di prima.
            if (panelsBeforeSpectate) panelsBeforeSpectate[side] = !panel.classList.contains('collapsed');
            // La mappa ha appena cambiato larghezza: si reinquadra dopo che il
            // layout si è assestato, altrimenti misura la colonna vecchia.
            requestAnimationFrame(syncViewInsets);
        });
        if (!isWide()) panel.classList.add('collapsed');
        syncPanelTab(panel, tab, side);
    }

    // VISTA GENERALE = SOLO LA MAPPA (richiesta dell'utente): entrando in
    // spettatore i due pannelloni si chiudono e la mappa si prende tutta la
    // larghezza; la barra in alto resta (turno, viste, velocità dell'IA).
    // Lo stato di partenza si ricorda, perché chiudere un pannello è anche un
    // gesto manuale: rientrando nel regno non si deve riaprire quello che il
    // giocatore aveva chiuso lui.
    let panelsBeforeSpectate = null;

    function setPanelOpen(panel, side, open) {
        if (!panel) return;
        panel.classList.toggle('collapsed', !open);
        syncPanelTab(panel, $('board-' + side + '-tab'), side);
    }

    function syncPanelsForSpectate(on) {
        if (on) {
            if (!panelsBeforeSpectate) panelsBeforeSpectate = {
                left: !leftPanel.classList.contains('collapsed'),
                right: !rightPanel.classList.contains('collapsed')
            };
            setPanelOpen(leftPanel, 'left', false);
            setPanelOpen(rightPanel, 'right', false);
        } else {
            const was = panelsBeforeSpectate || { left: isWide(), right: isWide() };
            panelsBeforeSpectate = null;
            setPanelOpen(leftPanel, 'left', was.left);
            setPanelOpen(rightPanel, 'right', was.right);
        }
        requestAnimationFrame(syncViewInsets);
    }

    wirePanelToggle(leftPanel, $('board-left-tab'), 'left');
    wirePanelToggle(rightPanel, $('board-right-tab'), 'right');

    // Al cambio di modalità i pannelli si rimettono nello stato giusto: aperti
    // in griglia (dove non coprono nulla), chiusi come tendine (dove aperti
    // nasconderebbero tutta la mappa). Senza questo la classe "collapsed" resta
    // appiccicata e le linguette raccontano il contrario di quel che si vede.
    const onWideChange = () => {
        const wide = isWide();
        // In vista generale si resta con la sola mappa, larga o stretta che sia.
        if (spectating) { syncPanelsForSpectate(true); return; }
        leftPanel.classList.toggle('collapsed', !wide);
        rightPanel.classList.toggle('collapsed', !wide);
        syncPanelTab(leftPanel, $('board-left-tab'), 'left');
        syncPanelTab(rightPanel, $('board-right-tab'), 'right');
    };
    if (wideQuery.addEventListener) wideQuery.addEventListener('change', onWideChange);
    else wideQuery.addListener(onWideChange);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(syncViewInsets, 200);
    });

    // ---------- scelta del regno ----------

    function currentPlayer() {
        return R.players().find(p => p.id === currentPlayerId) || null;
    }

    function enterKingdom(player) {
        if (!player) return;
        currentPlayerId = player.id;
        // Solitaria: si segna il turno per cui si è entrati qui. Vale sia per il
        // passaggio automatico sia per una scelta col cambio regno — così, se si
        // va a guardare un altro regno a metà turno, la plancia non ci rimbalza
        // subito indietro; ricomincerà a seguire al turno successivo.
        lastFollowed = R.turnoDi();
        hasFitted = false;
        selectedProvId = null;
        moveArmed = false;
        lastBattle = null;
        R.clearAttackArrows();
        R.clearTargets();
        closeOrder();
        try { sessionStorage.setItem('risiko_board_player', String(player.id)); } catch (e) { /* privato */ }
        $('board-picker').style.display = 'none';
        R.focusPlayer(player.id);
        syncViewInsets();
        render();
    }

    // ---------- partita in solitaria (tutti i regni tuoi) ----------
    // Se NESSUN regno è governato dall'IA, la plancia segue il turno da sé: chiuso
    // il turno di un regno si entra in quello dopo, invece di doverlo cercare col
    // cambio regno. Non è una modalità a parte — è la stessa plancia, con lo stesso
    // motore: si passa da enterKingdom come un giocatore qualunque, quindi la
    // NEBBIA resta quella del regno in cui si entra. Giocare dieci regni non vuol
    // dire vedere tutta la mappa in una volta: per quello c'è il 🌍.
    function soloGame() {
        const players = R.players();
        if (!players.length || !window.Bot) return false;
        return !players.some(p => window.Bot.isBot(p));
    }

    // Chiamata in testa a render(): torna true se ha cambiato regno (e allora il
    // render in corso è già stato rifatto da enterKingdom). Non può ricorrere —
    // dopo il cambio currentPlayerId è quello di turno e la funzione esce subito.
    let lastFollowed = null;   // turno per cui si è entrati nel regno corrente

    function followTurn() {
        const t = R.turnoDi();
        if (t === null || t === undefined || t === currentPlayerId) return false;
        if (t === lastFollowed) return false;   // si sta guardando un altro regno apposta
        if (!soloGame()) return false;
        const next = R.players().find(p => p.id === t);
        if (!next) return false;
        if (spectating) setSpectate(false);
        enterKingdom(next);
        // L'avviso va in coda apposta: il cambio di regno avviene dentro il refresh
        // di endTurn, cioè PRIMA che run() mostri il messaggio di fine turno. Senza
        // l'attesa, il passaggio di consegne verrebbe coperto un istante dopo.
        setTimeout(() => showNotice('Passa il comando: ora giochi ' + next.name), 0);
        return true;
    }

    function showPicker() {
        const box = $('board-picker');
        const list = $('board-picker-list');
        if (!box || !list) return;
        list.innerHTML = '';
        R.players().forEach(p => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'board-pick';
            b.style.borderLeftColor = p.color;
            b.textContent = p.name;
            b.addEventListener('click', () => enterKingdom(p));
            list.appendChild(b);
        });
        box.style.display = 'flex';
    }

    function resolvePlayer() {
        const code = new URLSearchParams(location.search).get('p');
        if (code) {
            const byInvite = R.playerByInvite(code);
            if (byInvite) return byInvite;
        }
        let saved = null;
        try { saved = sessionStorage.getItem('risiko_board_player'); } catch (e) { /* privato */ }
        if (saved) return R.players().find(p => String(p.id) === saved) || null;
        return null;
    }

    $('board-switch').addEventListener('click', showPicker);

    // Link di ritorno all'editor: solo per l'admin (login Firebase reale, o
    // DEV_ADMIN_BYPASS in sviluppo). Un giocatore invitato non lo vede. Il ruolo
    // può arrivare in modo asincrono (login Firebase), quindi si ricontrolla a
    // ogni render invece che una volta sola all'avvio.
    function syncEditorLink() {
        $('board-editor-link').style.display = R.isAdmin() ? '' : 'none';
    }

    // ---------- utilità di render ----------

    function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
    function signed(n) { return (n > 0 ? '+' : '') + n; }
    // Mercenario e Guarnigione non sono pedine: il nome sta in GameRules.ITEM_LABEL.
    function pieceName(type) {
        return (GR().ITEM_LABEL && GR().ITEM_LABEL[type])
            || ((typeof PIECES !== 'undefined' && PIECES[type]) ? PIECES[type].nome : type);
    }
    // Soldati che possono lasciare la provincia (§5: uno resta sempre a presidiare).
    // Tutti i massimi mostrati qui devono essere questi, non il totale presente:
    // un massimo che il motore poi rifiuta è peggio di un bottone spento.
    function spareOf(path) { return GR().spendableTroops(R.countPiece(path, 'soldato')); }

    // La provincia di PARTENZA dello spostamento, o null se non è ancora stata
    // scelta. Non è "la provincia selezionata": dev'essere stata armata con un
    // clic apposta in questa fase, essere tua e avere qualcuno che possa
    // partire. Un solo posto la decide — mappa, pannello e cursore d'ordine
    // leggono tutti da qui, o direbbero cose diverse.
    function moveOriginPath(player) {
        if (!moveArmed || !selectedProvId) return null;
        const path = R.engine.path(selectedProvId);
        if (!path || R.engine.owner(path) !== player.name || !spareOf(path)) return null;
        return path;
    }

    // Questa provincia può essere una partenza? (stesso metro di moveOrigins in
    // game-actions.js, che è quello che accende la mappa.)
    function canBeMoveOrigin(player, path) {
        if (!path || R.engine.owner(path) !== player.name || !spareOf(path)) return false;
        return GA().ownReachable(player, path.id).size > 0;
    }

    // Esegue un'azione e ridisegna. Le azioni chiamano gia' Risiko.save() e
    // refresh(), che riporta qui via onRefresh: basta mostrare il messaggio.
    function run(result) {
        if (!result) return;
        if (result.battle) {
            lastBattle = result;
            // Scena sulla mappa, ma nessuna inquadratura: la vista è del
            // giocatore, si sposta solo quando la sposta lui (zoom, trascinamento
            // o il bottone ↺ del rapporto di battaglia).
            R.playBattleFx(result);
        }
        showNotice(result.msg, result.ok);
        render();
        // La nascita di una città (o di una capitale) è un fatto di cronaca: si
        // srotola la pergamena (showFoundation in app.js). Dopo il render,
        // altrimenti il ridisegno della plancia ruba il focus al bottone.
        if (result.fondazione && R.showFoundation) {
            R.showFoundation(result.fondazione);
        }
        // Eco storica di una battaglia: si aspetta che la scena sulla mappa sia
        // finita (playBattleFx dura ~3,6s), altrimenti la pergamena coprirebbe
        // proprio il colpo che il giocatore stava guardando.
        if (result.cronaca && R.showFoundation) {
            clearTimeout(run._eco);
            run._eco = setTimeout(() => R.showFoundation(result.cronaca), result.battle ? 3900 : 0);
        }
        // Razzie delle terre di nessuno di fine giro (il proprio Fine turno).
        if (result.razzie) reportRaids(result.razzie);
    }

    function showNotice(msg, ok) {
        let el = $('board-notice');
        if (!el) {
            el = document.createElement('div');
            el.id = 'board-notice';
            el.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);' +
                'padding:10px 18px;border-radius:8px;font-family:inherit;font-size:.95rem;z-index:10000;' +
                'max-width:70vw;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.5);';
            document.body.appendChild(el);
        }
        el.style.background = ok === false ? '#5a2626' : '#2b2118';
        el.style.color = ok === false ? '#ffd3d3' : '#e0c097';
        el.style.border = '1px solid ' + (ok === false ? '#7a3b3b' : '#c0a062');
        el.textContent = msg;
        el.style.display = 'block';
        clearTimeout(showNotice._t);
        showNotice._t = setTimeout(() => { el.style.display = 'none'; }, 4200);
    }

    // ---------- barra regno e stato del turno ----------

    function renderTopbar(player, owned) {
        const turn = R.turn();
        $('board-crest').style.background = player.color;
        setText('board-kingdom', player.name);
        setText('board-subtitle', owned.length + (owned.length === 1 ? ' provincia' : ' province'));
        // Turni 1-based (js/chronicle.js): il ciclo 1 va dal turno 1 al 10.
        setText('board-cycle', 'ciclo ' + (Math.floor((turn - 1) / 10) + 1) +
            ' · turno ' + (((turn - 1) % 10) + 1) + '/10');

        const state = $('board-turn-state');
        const endBtn = $('board-end-turn');
        const turnoDi = R.turnoDi();
        if (turnoDi === null || turnoDi === undefined) {
            state.textContent = 'Partita non avviata';
            state.className = 'turn-wait';
            endBtn.disabled = true;
        } else if (turnoDi === player.id) {
            state.textContent = 'Tocca a te';
            state.className = 'turn-mine';
            endBtn.disabled = false;
        } else {
            const chi = R.players().find(p => p.id === turnoDi);
            const bot = (window.Bot && chi) ? window.Bot.strategyOf(chi) : null;
            state.textContent = (bot ? '⚙ ' : 'Attendi: ') + (chi ? chi.name : '—') +
                (bot ? ' · ' + bot.nome : '');
            state.className = 'turn-wait';
            endBtn.disabled = true;
        }
    }

    // ---------- vista generale (spettatore) ----------
    // Toglie la nebbia e mostra tutta la mappa: serve a guardare i regni dell'IA
    // giocare. Non cambia i permessi — le azioni restano quelle del proprio
    // regno nel proprio turno; cambia solo cosa si vede.
    let spectating = false;

    function syncSpectateBtn() {
        const b = $('board-spectate');
        if (!b) return;
        b.textContent = spectating ? '👑 Torna al regno' : '🌍 Mappa generale';
        b.classList.toggle('on', spectating);
        document.body.classList.toggle('spectating', spectating);
    }

    function setSpectate(on) {
        const player = currentPlayer();
        if (!player) return;
        spectating = !!on;
        // Prima i pannelli, poi l'inquadratura: resetView deve misurare la
        // mappa già larga, altrimenti inquadra la colonna vecchia.
        syncPanelsForSpectate(spectating);
        if (spectating) {
            R.focusPlayer(null);          // nessun focus = nessuna nebbia
            R.resetView();
            hasFitted = true;             // niente reinquadrature sul proprio regno
        } else {
            R.focusPlayer(player.id);
            hasFitted = false;            // rientrando si reinquadra il regno
        }
        syncSpectateBtn();
        render();
    }

    $('board-spectate').addEventListener('click', () => setSpectate(!spectating));

    // ---------- viste alternative della mappa: fede e terreno ----------
    // Colorano la mappa per religione o per terreno invece che per regno
    // (Risiko.setMapPaint). È solo pittura: non tocca proprietari, turni o
    // permessi, e rispetta la nebbia. I due modi sono esclusivi, quindi si
    // accendono e si spengono insieme dallo stesso interruttore.
    const VIEW_BTNS = [
        { id: 'board-faith', mode: 'fede', on: '☩ Regni', off: '☩ Fedi',
            titleOn: 'Torna a colorare per regno', titleOff: 'Colora la mappa per religione' },
        { id: 'board-terrain', mode: 'terreno', on: '⛰ Regni', off: '⛰ Terreno',
            titleOn: 'Torna a colorare per regno',
            titleOff: 'Colora la mappa per terreno: dove il numero conta e dove no' }
    ];

    function syncViewBtns() {
        const mode = R.mapPaint ? R.mapPaint() : 'owner';
        VIEW_BTNS.forEach(v => {
            const b = $(v.id);
            if (!b) return;
            const on = mode === v.mode;
            b.textContent = on ? v.on : v.off;
            b.title = on ? v.titleOn : v.titleOff;
            b.classList.toggle('on', on);
        });
    }

    (function wireViewBtns() {
        if (!R.setMapPaint) return;
        VIEW_BTNS.forEach(v => {
            const b = $(v.id);
            if (!b) return;
            b.addEventListener('click', () => {
                R.setMapPaint(R.mapPaint() === v.mode ? 'owner' : v.mode);
                syncViewBtns();
            });
        });
        syncViewBtns();
    })();

    // ---------- velocità dell'IA ----------
    // Guardare nove regni giocare a 600 ms per azione è bello la prima volta e
    // lungo la decima: il bottone cicla fra "seguo l'azione" e "portami al mio
    // turno". Sta qui e non in bot.js perché è una preferenza di chi guarda.
    const SPEEDS = [
        { ms: 600, label: '⏩ IA normale' },
        { ms: 220, label: '⏩⏩ IA veloce' },
        { ms: 40, label: '⏭ IA lampo' },
        { ms: 1400, label: '🐢 IA lenta' }
    ];
    let speedIdx = 0;

    function syncSpeedBtn() {
        const b = $('board-speed');
        if (b) b.textContent = SPEEDS[speedIdx].label;
    }

    $('board-speed').addEventListener('click', () => {
        speedIdx = (speedIdx + 1) % SPEEDS.length;
        if (window.Bot) window.Bot.speed(SPEEDS[speedIdx].ms);
        syncSpeedBtn();
    });

    // ---------- registro dell'IA ----------
    // Guardare i bot non deve voler dire inseguirli. La telecamera resta dove
    // l'hai lasciata: quello che fanno si LEGGE qui, una riga per azione, e sulla
    // mappa si vede solo il colore cambiare più un alone breve sulla provincia
    // toccata. Niente zoom automatici, niente scena della battaglia — a 600 ms
    // per mossa diventavano un frullatore.
    const AI_LOG_MAX = 16;
    const aiLines = [];

    // La prima frase basta: "Conquistata Baviera: 4 superstiti (1 caduti)." dice
    // già tutto, il resto è testo per il pannello del giocatore.
    function shortMsg(msg) {
        const s = String(msg || '').trim();
        const cut = s.indexOf('. ');
        return (cut > 20 ? s.slice(0, cut + 1) : s);
    }

    // Ordine di CRONACA (il più recente in fondo, come un diario) e non a stack:
    // l'intestazione del regno deve stare sopra le sue mosse, altrimenti si legge
    // il turno al contrario. Il riquadro segue da solo l'ultima riga.
    // NEBBIA: il registro racconta solo quello che il regno può davvero vedere.
    // Ogni azione dice dove è successa (`prov`, `provs`, `fromId`/`toId` nei
    // risultati di game-actions.js); se nessuna di quelle province è visibile, la
    // riga non esiste — sapere che un regno lontano ha schierato truppe è
    // un'informazione che il giocatore non ha. In vista generale (🌍) e
    // nell'editor la nebbia non c'è e si vede tutto.
    function placesOf(result) {
        const ids = [result.prov, result.prov2, result.fromId, result.toId];
        if (Array.isArray(result.provs)) ids.push.apply(ids, result.provs);
        return ids.filter(Boolean);
    }

    function visibleAction(result) {
        const ids = placesOf(result);
        if (!ids.length) return false;          // azione senza luogo: non si racconta
        return ids.some(id => R.isVisible(id));
    }

    // L'intestazione del regno si scrive solo se poi c'è qualcosa da raccontare:
    // altrimenti resterebbe un blocco vuoto che dice comunque "questo regno sta
    // giocando lì da qualche parte".
    let pendingHeader = null;

    function aiLog(player, result) {
        const box = $('bp-ailog');
        if (!box || !player) return;

        if (!result) {
            const s = window.Bot ? window.Bot.strategyOf(player) : null;
            pendingHeader = { colore: player.color, capo: true, n: 1,
                txt: player.name + (s ? ' · ' + s.nome : '') };
            return;
        }

        if (!result.ok) return;                                  // rifiuti del motore: rumore
        if (/^Fase \d/.test(result.msg || '')) return;            // passaggi di fase: rumore
        if (!visibleAction(result)) return;                       // succede nella nebbia

        if (pendingHeader) { aiLines.push(pendingHeader); pendingHeader = null; }

        const txt = shortMsg(result.msg);
        const ultima = aiLines[aiLines.length - 1];
        // Tre mercenari di fila sono una riga sola con "×3": il registro serve
        // a capire il turno, non a contare i click.
        if (ultima && !ultima.capo && ultima.txt === txt) ultima.n++;
        else aiLines.push({ colore: player.color, capo: false, n: 1, txt });

        while (aiLines.length > AI_LOG_MAX) aiLines.shift();
        renderAiLog();
    }

    // Le razzie delle terre di nessuno (game-actions.neutralRaids) arrivano nel
    // risultato di fine turno. Le si racconta come le mosse dei bot, ma solo se
    // toccano una provincia VISIBILE (§3, nebbia): sotto nebbia non si deve sapere
    // di una razzia dall'altra parte del mondo.
    const RAID_COLOR = '#9c8f7a';   // grigio-terra: la fede di nessuno
    function reportRaids(razzie) {
        if (!Array.isArray(razzie) || !razzie.length) return;
        let added = false;
        razzie.forEach(r => {
            if (!R.isVisible(r.fromId) && !R.isVisible(r.toId)) return;
            const txt = r.esito === 'riconquistata'
                ? 'Le terre di nessuno riprendono ' + r.toLabel + ' a ' + r.difensore + '.'
                : r.toLabel + ' respinge una razzia delle terre di nessuno.';
            aiLines.push({ colore: RAID_COLOR, capo: false, n: 1, txt });
            added = true;
        });
        if (!added) return;
        while (aiLines.length > AI_LOG_MAX) aiLines.shift();
        renderAiLog();
    }

    function renderAiLog() {
        const box = $('bp-ailog');
        if (!box) return;

        if (!aiLines.length) {
            // Registro vuoto per una ragione precisa, e va detta: se non si dice,
            // sembra rotto. Sotto nebbia si sa solo quel che succede ai propri
            // confini — il resto della guerra si guarda dalla vista generale.
            box.innerHTML = '<div class="bp-empty-hint">' + (R.visibleProvinces()
                ? 'Dai tuoi confini non si vede nulla di quel che fanno gli altri regni. Passa alla vista generale (🌍) per seguire tutta la guerra.'
                : 'Qui compaiono le mosse dell\'IA, una riga per azione.') + '</div>';
            return;
        }

        box.innerHTML = aiLines.map(l =>
            '<div class="ai-line' + (l.capo ? ' capo' : '') + '">' +
            '<span class="ai-dot" style="background:' + l.colore + '"></span>' +
            '<span class="ai-txt"></span>' +
            (l.n > 1 ? '<span class="ai-n">×' + l.n + '</span>' : '') +
            '</div>').join('');
        // testo via textContent: i nomi delle province arrivano dai dati, non si
        // concatenano dentro l'HTML.
        box.querySelectorAll('.ai-txt').forEach((el, i) => { el.textContent = aiLines[i].txt; });
        box.scrollTop = box.scrollHeight;
    }

    // ---------- regni in gioco ----------

    function renderKingdoms(player) {
        const box = $('bp-kingdoms');
        if (!box) return;
        const turnoDi = R.turnoDi();
        // Quante province ha un regno è cosa che si CONTA guardando la mappa:
        // sotto nebbia non si sa, e il numero salirebbe da solo a ogni conquista
        // dall'altra parte del mondo. Il proprio si vede sempre; gli altri solo
        // in vista generale (🌍).
        const contaVisibile = !R.visibleProvinces();
        box.innerHTML = R.players().map(p => {
            const bot = window.Bot ? window.Bot.strategyOf(p) : null;
            const province = R.ownedPaths(p.name).length;
            const mio = p.id === player.id;
            if (!province && !mio) return '';
            return '<div class="bk-row' + (p.id === turnoDi ? ' now' : '') +
                (mio ? ' me' : '') + '">' +
                '<span class="bk-dot" style="background:' + p.color + '"></span>' +
                '<span class="bk-name">' + p.name + '</span>' +
                '<span class="bk-kind">' + (bot ? bot.nome : '👤 tu') + '</span>' +
                '<span class="bk-prov">' + ((mio || contaVisibile) ? province : '—') + '</span>' +
                '</div>';
        }).join('') +
            '<div class="bp-empty-hint">' + (contaVisibile
                ? 'Un regno sparisce dall\'elenco quando perde tutte le province.'
                : 'Le province degli altri regni si contano solo dalla vista generale (🌍).') +
            '</div>';
    }

    // Conferme in pagina (R.confirm), non window.confirm: il dialogo nativo viene
    // chiuso d'ufficio in certi contesti e l'azione non partiva mai.
    function askEndTurn() {
        R.confirm({
            title: 'Chiudere il tuo turno?',
            text: 'Le unità temporanee scadono, i rinforzi obbligatori rimasti vengono schierati d\'ufficio e si passa al regno successivo.',
            ok: 'Chiudi il turno'
        }, () => {
            run(GA().endTurn());
            // Chiuso il turno umano tocca all'IA: la catena dei bot va avanti da
            // sola e si ferma quando torna il turno di un giocatore umano.
            if (window.Bot) window.Bot.run();
        });
    }

    $('board-end-turn').addEventListener('click', askEndTurn);

    // Il giocatore può agire solo nel proprio turno, e solo a partita avviata.
    function isPlaying(player) {
        const t = R.turnoDi();
        return t !== null && t !== undefined && t === player.id;
    }

    // ---------- fasi del turno: quattro cartelle ----------
    // L'elenco delle fasi e la loro sequenza stanno in game-actions.js: qui si
    // disegnano soltanto. Chi vuole aggiungere una fase la aggiunge là.
    // Le quattro linguette sono CARTELLE: cliccandone una si apre il suo
    // contenuto nel corpo del pannello, e nel corpo c'è solo quello. Aprire non
    // è agire — il turno avanza col bottone in fondo, e solo in avanti.

    function phase(player) { return GA().phaseOf(player); }
    function inPhase(player, f) { return isPlaying(player) && phase(player) === f && !player.conquista; }

    // Cartella aperta. null = "segui la fase in corso", che è il caso normale:
    // così un turno nuovo non si apre sulla cartella lasciata aperta in quello
    // vecchio. Si torna a null appena la fase vera cambia.
    let openFolder = null;
    let lastPhaseSeen = null;

    function viewPhase(player) {
        const cur = phase(player);
        // Cambiata la fase vera si riparte puliti: cartella chiusa e partenza
        // dello spostamento da riscegliere (entrando in `sposta` la selezione è
        // quella dell'attacco appena chiuso, e non deve comandare).
        if (lastPhaseSeen !== cur) { lastPhaseSeen = cur; openFolder = null; moveArmed = false; }
        return (openFolder && GA().PHASES.indexOf(openFolder) >= 0) ? openFolder : cur;
    }

    // Sto sbirciando: la cartella aperta non è la fase in corso, o non è il mio
    // turno. Si legge, non si agisce.
    function peeking(player) { return !isPlaying(player) || viewPhase(player) !== phase(player); }

    // Spegne i comandi di un blocco: è la traduzione visiva di "questa cartella
    // la stai solo guardando". Il rifiuto vero resta di game-actions.js
    // (requirePhase), qui si evita solo il click che non poteva funzionare.
    function freeze(box) {
        if (!box) return;
        box.querySelectorAll('button, input, select').forEach(el => { el.disabled = true; });
    }

    function renderPhases(player) {
        const box = $('bp-phases');
        const cur = GA().phaseIndex(player);
        const view = viewPhase(player);
        const peek = peeking(player);
        box.innerHTML = '';
        GA().PHASES.forEach((f, i) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'bp-phase-chip' + (i === cur ? ' now' : i < cur ? ' done' : '') +
                (f === view ? ' open' : '') + (f === view && peek ? ' peek' : '');
            chip.innerHTML = '<span class="n">' + (i < cur ? '✓' : i + 1) + '</span><span class="t"></span>';
            chip.querySelector('.t').textContent = GA().PHASE_LABEL[f];
            chip.title = 'Apri la cartella "' + GA().PHASE_LABEL[f] + '"' +
                (i === cur ? ' (la fase in corso)' : ' — solo per guardare');
            chip.addEventListener('click', () => { openFolder = f; render(); });
            box.appendChild(chip);
        });

        // Una riga sola: il nome della fase è già scritto grande sulla linguetta
        // accesa, qui serve solo cosa ci si fa.
        setText('bp-phase-sub', GA().PHASE_HINT[view]);

        // Perché i comandi sono spenti: detto qui una volta, invece che
        // ripetuto su ogni bottone.
        const note = $('bp-peek-note');
        if (!peek) {
            note.style.display = 'none';
        } else {
            note.style.display = '';
            note.textContent = !isPlaying(player)
                ? 'Non è il tuo turno: la plancia si legge, non si tocca.'
                : GA().PHASES.indexOf(view) < cur
                    ? 'Fase già chiusa: la stai rileggendo. Ora sei in "' + GA().PHASE_LABEL[GA().PHASES[cur]] + '".'
                    : 'Fase non ancora aperta: prima devi chiudere "' + GA().PHASE_LABEL[GA().PHASES[cur]] + '".';
            if (isPlaying(player)) {
                const back = document.createElement('button');
                back.type = 'button';
                back.className = 'bp-mini wide';
                back.textContent = '↩ torna alla fase in corso';
                back.addEventListener('click', () => { openFolder = null; render(); });
                note.appendChild(back);
            }
        }

        // Blocchi che esistono solo in una cartella.
        $('fase-schiera').style.display = view === 'schiera' ? '' : 'none';
        $('fase-commerci').style.display = view === 'costruisci' ? '' : 'none';
        $('fase-spie').style.display = view === 'costruisci' ? '' : 'none';
        $('fase-sposta').style.display = view === 'sposta' ? '' : 'none';

        const next = $('bp-next-phase');
        const last = cur === GA().PHASES.length - 1;
        next.textContent = last ? '✓ Chiudi il turno'
            : 'Fatto → ' + GA().PHASE_LABEL[GA().PHASES[cur + 1]];
        next.className = 'bp-next' + (last ? ' end' : '');
        next.disabled = !isPlaying(player) || !!player.conquista;
    }

    $('bp-next-phase').addEventListener('click', () => {
        const player = currentPlayer();
        if (!player) return;
        if (GA().phaseIndex(player) === GA().PHASES.length - 1) { askEndTurn(); return; }
        run(GA().nextPhase(player));
    });

    // ---------- reclute in attesa (§5.1) ----------
    // Due mucchi: LIBERE (dove vuole) e OBBLIGATORIE (nella provincia dell'edificio
    // che le ha prodotte). Il totale finisce anche nel badge della barra in alto,
    // perché è il primo numero che il giocatore deve vedere quando tocca a lui.

    function renderDeployPanel(player) {
        const free = player.recluteDaSchierare || 0;
        const bound = GA().boundPool(player);
        const boundTot = GA().boundTotal(player);
        const tot = free + boundTot;
        const myTurn = inPhase(player, 'schiera');

        setText('bp-pool', tot);
        setText('board-reinf-num', tot);
        // Una riga, e in italiano: "1 reclute" si legge come un errore e distrae
        // da quello che il numero sta dicendo.
        $('bp-pool-note').innerHTML =
            (tot === 1 ? 'recluta in mano' : 'reclute in mano') +
            ' · <em class="free">' + free + (free === 1 ? ' libera' : ' libere') + '</em>' +
            ' · <em class="bound">⚑ ' + boundTot +
            (boundTot === 1 ? ' obbligatoria' : ' obbligatorie') + '</em>';

        const badge = $('board-reinforce');
        badge.className = 'reinf-badge' + (!tot ? ' empty' : myTurn ? ' hot' : ' pending');
        badge.title = tot
            ? tot + ' reclute da schierare: ' + free + ' libere, ' + boundTot + ' obbligatorie'
            : 'Nessuna recluta in attesa';

        const list = $('bp-bound-list');
        list.innerHTML = '';
        const ids = Object.keys(bound).filter(id => bound[id] > 0);
        if (ids.length) {
            const head = document.createElement('div');
            head.className = 'bp-bound-head';
            head.textContent = 'Nascono da Capitale, Città e Fortezza: si schierano solo lì.';
            list.appendChild(head);

            ids.forEach(id => {
                const path = R.engine.path(id);
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'bp-bound-row';
                b.disabled = !myTurn;
                b.innerHTML = '<span class="bp-bound-n">+' + bound[id] + '</span>' +
                    '<span class="bp-bound-name"></span>' +
                    '<span class="bp-bound-go">schiera qui</span>';
                b.querySelector('.bp-bound-name').textContent = path ? R.provinceLabel(path) : id;
                b.addEventListener('click', () => {
                    selectedProvId = id;
                    run(GA().deployBound(player, id));
                });
                list.appendChild(b);
            });

            if (ids.length > 1) {
                const all = document.createElement('button');
                all.type = 'button';
                all.className = 'bp-act';
                all.disabled = !myTurn;
                all.innerHTML = '<span class="bp-act-name">Schiera tutte le obbligatorie</span>' +
                    '<span class="bp-act-cost">' + boundTot + '</span>';
                all.addEventListener('click', () => run(GA().deployAllBound(player)));
                list.appendChild(all);
            }
        }

        const note = $('bp-deploy-note');
        if (!tot) note.textContent = 'Nessuna recluta in attesa: arrivano a inizio turno.';
        else if (!myTurn) note.textContent = 'Le schiererai quando tocca a te.';
        else note.textContent = 'Clicca una provincia sulla mappa e usa + e −. Finché non chiudi la fase puoi spostarle a piacere.';

        // Il riquadro sparisce del tutto quando non c'è niente da schierare: una
        // fila di zeri è rumore, e in fase 1 senza reclute non c'è altro da fare
        // che passare avanti.
        $('bp-recruit-pool').classList.toggle('empty', !tot);
    }

    // ---------- cursore di schieramento sulla mappa ----------
    // In fase 1 le truppe si muovono anche senza guardare il pannello: sopra la
    // provincia selezionata compare un − N + ancorato alla mappa. È HTML e non
    // SVG apposta: dentro l'SVG i bottoni scalerebbero con lo zoom fino a
    // diventare impraticabili sulle province piccole.
    // La posizione si insegue con requestAnimationFrame perché pan e zoom della
    // mappa non emettono eventi: si misura la sola provincia selezionata.

    const hud = $('map-deploy-hud');
    let hudRaf = null;
    let hudLast = '';

    function placeHud() {
        const pos = selectedProvId && R.provinceScreenPos(selectedProvId);
        if (!pos || !pos.visible) { hud.style.visibility = 'hidden'; return; }
        hud.style.visibility = 'visible';
        const key = Math.round(pos.x) + ':' + Math.round(pos.y);
        if (key === hudLast) return;
        hudLast = key;
        hud.style.left = pos.x + 'px';
        hud.style.top = pos.y + 'px';
    }

    function trackHud() {
        if (hud.style.display === 'none') { hudRaf = null; return; }
        placeHud();
        hudRaf = requestAnimationFrame(trackHud);
    }

    function renderMapHud(player) {
        const path = selectedProvId ? R.engine.path(selectedProvId) : null;
        const on = path && inPhase(player, 'schiera') && R.engine.owner(path) === player.name;
        if (!on) {
            hud.style.display = 'none';
            if (hudRaf) { cancelAnimationFrame(hudRaf); hudRaf = null; }
            return;
        }

        const rec = GA().placedPool(player)[path.id] || { libere: 0, vincolate: 0 };
        const messe = rec.libere + rec.vincolate;
        const attesa = GA().boundPool(player)[path.id] || 0;
        const libere = player.recluteDaSchierare || 0;

        hud.querySelector('.mdh-name').textContent = R.provinceLabel(path);
        setText('mdh-troops', R.countPiece(path, 'soldato'));
        setText('mdh-added', messe ? '+' + messe : '');
        $('mdh-minus').disabled = !Math.min(messe, spareOf(path));
        $('mdh-plus').disabled = !(libere || attesa);
        setText('mdh-note', attesa
            ? '⚑ ' + attesa + ' obbligatorie da posare qui'
            : libere ? libere + ' libere in mano' : 'nessuna recluta in mano');

        hud.style.display = 'block';
        hudLast = '';
        placeHud();
        if (!hudRaf) hudRaf = requestAnimationFrame(trackHud);
    }

    // Il + posa prima le obbligatorie della provincia: sono quelle che non hanno
    // altro posto dove andare, tenerle in mano è solo un modo di scordarsele.
    $('mdh-plus').addEventListener('click', () => {
        const player = currentPlayer();
        if (!player || !selectedProvId) return;
        const attesa = GA().boundPool(player)[selectedProvId] || 0;
        run(attesa ? GA().deployBound(player, selectedProvId, 1) : GA().deploy(player, selectedProvId, 1));
    });

    $('mdh-minus').addEventListener('click', () => {
        const player = currentPlayer();
        if (!player || !selectedProvId) return;
        run(GA().undeploy(player, selectedProvId, 1));
    });

    // ---------- pannello sinistro ----------

    function renderPrestige(player) {
        // Prestigio sospeso (GameRules.PRESTIGE_ENABLED): il blocco sparisce
        // invece di mostrare numeri che non si muovono mai.
        const block = $('bp-prestige-block');
        if (!GR().PRESTIGE_ENABLED) {
            if (block) block.style.display = 'none';
            return;
        }
        if (block) block.style.display = '';
        setText('bp-gold-points', player.puntiOro || 0);
        const n = player.prestigioCiclo || 0;
        $('bp-cycle-ticks').innerHTML = Array.from({ length: 10 },
            (_, i) => '<span class="bp-tick' + (i < n ? ' on' : '') + '"></span>').join('');
        setText('bp-cycle-note', n + ' / 10 punti nel ciclo · a 10 scatta 1 punto d\'oro.');

        $('bp-goals').innerHTML = [
            { kind: 'Primario', pts: 6 },
            { kind: 'Secondario', pts: 2 },
            { kind: 'Terziario', pts: 2 }
        ].map(g => `
            <div class="bp-goal">
                <div class="bp-goal-head">
                    <span class="bp-goal-kind">${g.kind}</span>
                    <span class="bp-goal-pts">${g.pts} pt</span>
                </div>
                <div class="bp-goal-text"><span class="bp-soon">assegnato a inizio ciclo</span></div>
            </div>
        `).join('');
    }

    function renderPopEffect(pop) {
        const el = $('bp-pop-effect');
        if (!pop) {
            el.className = 'bp-effect flat';
            el.textContent = 'Costruisci una Capitale per attivare la Popolarità.';
            return;
        }
        const e = GR().popEffectOf(pop.totale);
        el.className = 'bp-effect ' + (pop.totale >= 4 ? '' : pop.totale <= 2 ? 'bad' : 'flat');
        el.textContent = 'Popolarità ' + pop.totale + '/5 → ' +
            [signed(e.soldati) + ' soldati', signed(e.risorse) + ' risorse', signed(e.prestigio) + ' prestigio'].join(' · ') +
            ' per turno';
    }

    // ---------- cruscotto sempre visibile ----------
    // Oro, esercito, fede di stato e scorte: i quattro numeri con cui si decide
    // ogni mossa. Stanno fuori dalla parte che scorre (#bp-status), così
    // restano sotto gli occhi per tutto il turno, in qualunque cartella si sia.

    function renderTreasury(player, units, snapshot, connectedSet, pop) {
        const inc = KingdomStats.income(units, player.tassazione || 'normale');
        setText('bp-coins', (player.monete || 0).toLocaleString('it-IT'));
        const note = $('bp-income');
        note.textContent = inc.cities ? signed(inc.total) + ' per turno' : 'nessuna città, nessuna entrata';
        note.className = inc.cities ? 'good' : '';
        note.title = inc.cities ? inc.cities + ' città × ' + inc.rate + ' (§7)' : 'Le entrate vengono dalle città (§7).';

        // La resa conta solo le province COLLEGATE (§4): senza Capitale è zero.
        const collegate = snapshot.filter(p => connectedSet.has(p.id));
        const yields = KingdomStats.resourceYield(collegate, RES_KEYS);

        $('bp-resources').innerHTML = RES_KEYS.map(k => {
            const gain = yields[k] || 0;
            const have = (player.scorte && player.scorte[k]) || 0;
            return `
            <div class="bps-r" style="border-bottom-color:${RESOURCES[k].colore}"
                 title="${RESOURCES[k].nome}: ${have} in scorta, ${gain ? '+' + gain : 'nessuna'} per turno">
                <svg viewBox="0 0 100 100" aria-hidden="true"><use href="#res-${k}"></use></svg>
                <span class="bps-r-n">${have}</span>
                <span class="bps-r-g${gain ? '' : ' zero'}">${gain ? '+' + gain : '—'}</span>
            </div>`;
        }).join('');

        const mod = pop ? GR().popEffectOf(pop.totale).risorse : 0;
        const modEl = $('bp-pop-mod');
        modEl.style.display = mod ? '' : 'none';
        modEl.textContent = mod ? 'Popolarità ' + pop.totale + '/5: ' + signed(mod) + ' unità di risorse per turno' : '';

        // Fede di stato: è quella della Capitale (Risiko.stateReligionOf), quindi
        // perderla o spostarla cambia religione all'impero. Sta nel cruscotto
        // perché entra negli obiettivi e nelle razzie delle terre di nessuno.
        const faithEl = $('bp-faith-state');
        const fede = R.stateReligionOf ? R.stateReligionOf(player) : null;
        if (fede && window.Religions) {
            faithEl.innerHTML = '<span class="p-faith-dot" style="background:' +
                window.Religions.color(fede) + '"></span><span class="bps-faith-t"></span>';
            faithEl.querySelector('.bps-faith-t').textContent = window.Religions.label(fede);
            faithEl.title = 'Religione di stato: quella della Capitale';
        } else {
            faithEl.textContent = '—';
            faithEl.title = 'Senza Capitale non c\'è religione di stato';
        }
    }

    function renderArmy(owned, units, pop, capitalPath, connectedSet) {
        setText('bp-prov-owned', owned.length);
        setText('bp-prov-connected', connectedSet.size);
        // Nel cruscotto lo spazio è una riga sola: il nome della Capitale basta,
        // "Capitale:" davanti lo mangerebbe tutto (le capitali hanno nomi lunghi).
        const capEl = $('bp-capital');
        capEl.textContent = capitalPath ? '⌂ ' + R.provinceLabel(capitalPath) : 'nessuna Capitale';
        capEl.title = capitalPath
            ? 'La Capitale è in ' + R.provinceLabel(capitalPath) + ': è lei a dare la fede di stato'
            : 'Senza Capitale non c\'è religione di stato, e il regno non raccoglie nulla';
        setText('bp-soldiers', units.soldato);
        const inCap = capitalPath ? R.countPiece(capitalPath, 'soldato') : 0;
        // Sotto i 6 la Popolarità cade a 2 (§8): il numero da solo non lo dice.
        setText('bp-soldiers-cap', inCap + ' in Capitale' + (capitalPath && inCap <= 5 ? ' ⚠' : ''));
        $('bp-soldiers-cap').className = (capitalPath && inCap <= 5) ? 'bad' : '';
        $('bp-soldiers-cap').title = (capitalPath && inCap <= 5)
            ? 'Guardia debole: con 5 o meno soldati in Capitale la Popolarità scende a 2 (§8)'
            : 'Soldati di guardia nella Capitale';
        setText('bp-units', units.generale + ' · ' + units.barca + ' · ' + units.vascello);
        setText('bp-buildings', units.citta + ' · ' + units.fortezza + ' · ' + units.mercato);

        const r = KingdomStats.reinforcements(owned.length, units, pop ? pop.totale : null);
        setText('bp-reinf', signed(r.total));
        $('bp-reinf-detail').innerHTML = r.breakdown.map(b => `
            <div class="bp-line">
                <span class="k">${b.label}${b.vincolata ? ' <em class="bp-bound-tag">⚑</em>' : ''}</span>
                <span class="v${b.value > 0 ? ' good' : b.value < 0 ? ' bad' : ''}">${signed(b.value)}</span>
            </div>`).join('') +
            `<div class="bp-line bp-line-sum">
                <span class="k">${r.libere} libere · ${r.vincolate} obbligatorie <em class="bp-bound-tag">⚑</em></span>
                <span class="v">${r.total}</span>
            </div>`;
    }

    // ---------- elenco delle mie province ----------

    // L'elenco è anche il tavolo dello schieramento: ogni riga ha − e + per
    // togliere e mettere reclute libere senza dover prima selezionare la provincia.
    // È qui che si esercita la libertà di spostarle finché il turno è aperto.
    function renderProvinceList(player, paths, connectedSet) {
        const box = $('bp-province-list');
        if (!paths.length) {
            box.innerHTML = '<div class="bp-empty-hint">Nessuna provincia: l\'admin te le assegna dalla mappa principale.</div>';
            return;
        }
        const myTurn = inPhase(player, 'schiera');   // i −/+ esistono solo in fase 1
        const bound = GA().boundPool(player);
        const placed = GA().placedPool(player);

        box.innerHTML = '';
        paths.slice()
            .sort((a, b) => R.provinceLabel(a).localeCompare(R.provinceLabel(b)))
            .forEach(path => {
                const troops = R.countPiece(path, 'soldato');
                const tags = ['capitale', 'citta', 'fortezza', 'mercato']
                    .filter(t => R.countPiece(path, t) > 0)
                    .map(t => pieceName(t)[0])
                    .join('');
                const rec = placed[path.id] || { libere: 0, vincolate: 0 };
                const messe = rec.libere + rec.vincolate;
                const attesa = bound[path.id] || 0;

                const row = document.createElement('div');
                row.className = 'bp-prov' + (path.id === selectedProvId ? ' active' : '');
                row.innerHTML = `
                    <span class="bp-link-dot${connectedSet.has(path.id) ? ' on' : ''}"
                          title="${connectedSet.has(path.id) ? 'Collegata alla Capitale' : 'Non collegata: non produce'}"></span>
                    <span class="bp-prov-name">${R.provinceLabel(path)}</span>
                    <span class="bp-prov-tags">${tags}</span>
                    ${attesa ? `<span class="bp-prov-bound" title="Rinforzi obbligatori in attesa: possono andare solo qui">⚑${attesa}</span>` : ''}
                    <span class="bp-prov-troops">${troops}${messe ? `<em>+${messe}</em>` : ''}</span>`;
                row.addEventListener('click', () => selectProvince(path.id, true));

                if (myTurn) row.appendChild(provinceDeployControls(player, path, messe, attesa));
                box.appendChild(row);
            });
    }

    // −/+ (e ⚑ per le obbligatorie) su una riga dell'elenco.
    function provinceDeployControls(player, path, messe, attesa) {
        const ctl = document.createElement('span');
        ctl.className = 'bp-prov-ctl';

        const mk = (txt, title, off, action) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'bp-mini';
            b.textContent = txt;
            b.title = title;
            b.disabled = off;
            b.addEventListener('click', (e) => { e.stopPropagation(); action(); });
            return b;
        };

        if (attesa) {
            ctl.appendChild(mk('⚑', 'Schiera qui i ' + attesa + ' rinforzi obbligatori', false,
                () => run(GA().deployBound(player, path.id))));
        }
        const ritirabili = Math.min(messe, spareOf(path));
        ctl.appendChild(mk('−',
            ritirabili ? 'Ritira 1 recluta schierata in questo turno'
                : messe ? 'È l\'ultimo soldato: la provincia non resta sguarnita'
                    : 'Qui non hai schierato nulla in questo turno',
            !ritirabili, () => run(GA().undeploy(player, path.id, 1))));
        ctl.appendChild(mk('+', (player.recluteDaSchierare || 0) ? 'Schiera 1 recluta libera qui' : 'Nessuna recluta libera',
            !(player.recluteDaSchierare > 0), () => run(GA().deploy(player, path.id, 1))));
        return ctl;
    }

    function selectProvince(id, center) {
        closeOrder();
        selectedProvId = id;
        if (center) R.fitToProvinces([id]);
        render();
    }

    // ---------- azioni sulla provincia selezionata ----------

    // La fede della provincia, come promemoria nel pannello. Sotto nebbia non si
    // svela (come il proprietario, §3); altrimenti pallino colorato + nome.
    function renderFaith(path, fogged) {
        const el = $('bsel-faith');
        if (!el) return;
        const Rel = window.Religions;
        const f = (path && !fogged && Rel) ? R.faithOf(path.id) : '';
        el.classList.toggle('off', !f);
        if (!f) { el.textContent = ''; return; }
        el.innerHTML = '<span class="p-faith-dot" style="background:' + Rel.color(f) + '"></span>' +
            Rel.label(f);
    }

    // Una tessera della riga di anagrafica: testo + colore, o "spenta" se non
    // c'è niente da dire. Prima erano cinque paragrafi "Chiave: valore" alti
    // 170px; qui sono quattro parole su una riga.
    function metaTag(id, txt, color, title) {
        const el = $(id);
        if (!el) return;
        el.textContent = txt || '—';
        el.style.color = color || '';
        el.title = title || '';
        el.classList.toggle('off', !txt);
    }

    function renderSelected(player, connectedSet) {
        const nameEl = $('bp-province-name');
        const actions = $('bp-actions');
        const dot = $('bp-province-dot');
        const path = selectedProvId ? R.engine.path(selectedProvId) : null;

        if (!path) {
            nameEl.textContent = 'Nessuna provincia selezionata';
            setText('bp-province-troops', '');
            dot.style.background = 'transparent';
            renderFaith(null, false);
            metaTag('bsel-owner', '', '');
            metaTag('bsel-res', '', '');
            metaTag('bsel-terrain', '', '');
            actions.innerHTML = '<div class="bp-empty-hint">Clicca una provincia sulla mappa.</div>';
            return;
        }

        const fogged = path.classList.contains('fog');
        const mine = R.engine.owner(path) === player.name;
        nameEl.textContent = R.provinceLabel(path);
        renderFaith(path, fogged);

        // Anagrafica della provincia, su una riga. Le tessere sono NOSTRE
        // (bsel-*): gli id di app.js si aggiornano a ogni clic sulla mappa,
        // anche quando quel clic è un ordine su un bersaglio, e finirebbero per
        // raccontare la provincia sbagliata.
        setText('p-name', R.provinceLabel(path));
        const owner = fogged ? 'Sconosciuto' : (R.engine.owner(path) || 'Terra di nessuno');
        const ownerPlayer = R.players().find(p => p.name === owner);
        metaTag('bsel-owner', owner, ownerPlayer ? ownerPlayer.color : '#9c8f7a', 'Chi la governa');
        dot.style.background = ownerPlayer ? ownerPlayer.color : (fogged ? '#555' : '#9c8f7a');

        const resKey = fogged ? '' : (R.resourceKeyOf(path) || '');
        const res = resKey && typeof RESOURCES !== 'undefined' ? RESOURCES[resKey] : null;
        metaTag('bsel-res', fogged ? '' : (res ? res.nome : 'Nessuna risorsa'),
            res ? res.colore : '', 'Risorsa della provincia');

        // Il terreno decide quanto conta il numero in battaglia (§9): sta qui
        // perché è la cosa che si vuole sapere PRIMA di scegliere dove colpire.
        const terr = fogged ? '' : terrainTag(R.terrainOf ? R.terrainOf(path.id) : '');
        metaTag('bsel-terrain', terr, '',
            terr ? 'Terreno: cambia il peso del numero in battaglia (§9)' : '');

        // Le truppe sono il numero che conta: grande, accanto al nome. Il resto
        // della guarnigione (edifici, navi) sta nel titolo del riquadro.
        const pieces = R.piecesOf(path);
        const soldati = R.countPiece(path, 'soldato');
        const altro = pieces.filter(x => x.type !== 'soldato')
            .map(x => pieceName(x.type) + (x.count > 1 ? ' ×' + x.count : ''));
        // La VENTURA sta accanto alle truppe e non in una tessera a parte: è un
        // pezzo di quel numero, non un'altra proprietà della provincia (§5.3).
        const merc = fogged ? 0 : R.engine.merc(path);
        const troopsEl = $('bp-province-troops');
        troopsEl.textContent = fogged ? '?' : '⚔ ' + soldati + (merc ? ' · ' + merc + '⚑' : '');
        troopsEl.title = fogged ? 'Territorio in nebbia'
            : (soldati + ' soldati' + (merc ? ', di cui ' + merc + ' di ventura (rendono meno in battaglia)' : '') +
               (altro.length ? ' · ' + altro.join(', ') : ''));
        troopsEl.classList.toggle('extra', !fogged && (altro.length > 0 || merc > 0));

        if (fogged) {
            actions.innerHTML = '<div class="bp-empty-hint">Territorio sconosciuto.</div>';
            return;
        }
        if (!mine) {
            actions.innerHTML = '<div class="bp-empty-hint">Non è tua. Per attaccarla, seleziona una tua provincia confinante.</div>';
            return;
        }
        if (!isPlaying(player)) {
            actions.innerHTML = '<div class="bp-empty-hint">Non è il tuo turno: puoi guardare, non agire.</div>';
            return;
        }
        if (player.conquista) {
            actions.innerHTML = '<div class="bp-empty-hint">Conquista in sospeso: decidi qui sotto come occuparla.</div>';
            return;
        }

        // Una cartella per volta: mostrare le costruzioni mentre si schiera (o
        // gli attacchi mentre si costruisce) è esattamente il disordine che
        // questa struttura elimina. Le azioni seguono la cartella APERTA; se non
        // è la fase in corso, render() le spegne (freeze) e il perché sta in
        // #bp-peek-note. Il rifiuto vero lo fa comunque game-actions.js.
        actions.innerHTML = '';
        switch (viewPhase(player)) {
            case 'schiera':
                actions.appendChild(deployGroup(player, path));
                break;
            case 'costruisci':
                actions.appendChild(buildGroup(player, path, connectedSet));
                actions.appendChild(roadGroup(player, path));
                break;
            case 'attacca':
                actions.appendChild(attackGroup(player, path));
                break;
            case 'sposta':
                // Niente testo: la provincia di partenza è già evidente (è
                // questa) e la strada da seguire la dice renderMove qui sotto,
                // una volta sola. Ripeterlo qui era rumore.
                if (player.spostamentoFatto) {
                    actions.innerHTML = '<div class="bp-empty-hint">Lo spostamento del turno è già stato fatto.</div>';
                }
                break;
        }
    }

    function group(title) {
        const g = document.createElement('div');
        g.className = 'bp-act-group';
        g.innerHTML = '<div class="bp-act-head">' + title + '</div>';
        return g;
    }

    function actionButton(label, cost, disabledWhy, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bp-act';
        b.innerHTML = `<span class="bp-act-name">${label}</span>` +
            (cost ? `<span class="bp-act-cost">${cost}</span>` : '') +
            (disabledWhy ? `<span class="bp-act-why">${disabledWhy}</span>` : '');
        if (disabledWhy) { b.disabled = true; b.title = disabledWhy; }
        else b.addEventListener('click', onClick);
        return b;
    }

    function deployGroup(player, path) {
        const g = group('Reclute');
        const pool = player.recluteDaSchierare || 0;
        const attesa = GA().boundPool(player)[path.id] || 0;

        // Le obbligatorie per prime: sono le uniche che non hanno alternative.
        if (attesa) {
            g.appendChild(actionButton('⚑ Schiera i ' + attesa + ' rinforzi obbligatori',
                'nascono qui', null, () => run(GA().deployBound(player, path.id))));
        }

        if (pool) {
            g.appendChild(numberRow('Schiera qui', pool, 'di ' + pool + ' libere',
                n => run(GA().deploy(player, path.id, n))));
        } else if (!attesa) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Serbatoio vuoto: le reclute arrivano a inizio turno.</div>');
        }

        // Ripensarci è parte della fase: si ritira solo ciò che si è messo adesso,
        // e comunque mai l'ultimo soldato della provincia (§5).
        const rec = GA().placedPool(player)[path.id] || { libere: 0, vincolate: 0 };
        const messe = rec.libere + rec.vincolate;
        const ritirabili = Math.min(messe, spareOf(path));
        if (ritirabili) {
            g.appendChild(numberRow('Ritira', ritirabili, 'schierate ora: ' + messe,
                n => run(GA().undeploy(player, path.id, n))));
        } else if (messe) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">L\'ultima recluta non si ritira: senza di lei ' +
                R.provinceLabel(path) + ' resterebbe sguarnita.</div>');
        }
        return g;
    }

    // Riga "campo numerico + bottone", precompilata col massimo.
    function numberRow(label, max, hint, onGo) {
        const row = document.createElement('div');
        row.className = 'bp-act-row';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = String(max);
        input.value = String(max);
        row.appendChild(input);
        row.appendChild(actionButton(label, hint, null, () => onGo(parseInt(input.value, 10))));
        return row;
    }

    function buildGroup(player, path, connectedSet) {
        const g = group('Costruisci');
        const soldiersHere = spareOf(path);   // il presidio non si spende
        g.insertAdjacentHTML('beforeend',
            '<div class="bp-army"><span class="bp-army-n">' + soldiersHere + '</span>' +
            '<span class="bp-army-l">soldati spendibili qui · uno resta sempre a presidiare</span></div>');

        GR().BUILDABLE_ON_PROVINCE.forEach(type => {
            const cost = GR().COSTS[type];
            let why = null;

            const place = R.engine.canPlacePiece(path, type);
            if (!place.ok) why = place.msg;

            const max = (typeof PIECES !== 'undefined' && PIECES[type] && PIECES[type].max) || 1;
            if (!why && R.countPiece(path, type) >= max) why = 'già presente';
            if (!why && type === 'capitale' && R.getCapitalPathFor(player)) why = 'ne hai già una';

            if (!why) {
                const afford = GR().canAfford(player, cost, soldiersHere);
                if (!afford.ok) why = GR().missingText(afford.missing);
            }

            g.appendChild(actionButton(pieceName(type), GR().formatCost(cost),
                why ? shorten(why) : null,
                () => run(GA().build(player, path.id, type))));
        });

        // Reclutamento: la Guarnigione dura un turno, il Mercenario resta ma è di
        // ventura. L'etichetta lo dice, perché sono due acquisti opposti (§5.3).
        GR().RECRUITABLE.forEach(type => {
            const cost = GR().COSTS[type];
            const afford = GR().canAfford(player, cost, soldiersHere);
            const temporanea = GR().TEMPORARY.indexOf(type) >= 0;
            g.appendChild(actionButton(pieceName(type) + (temporanea ? ' (1 turno)' : ' (resta, ma è ventura)'),
                GR().formatCost(cost),
                afford.ok ? null : shorten(GR().missingText(afford.missing)),
                () => run(GA().recruit(player, path.id, type))));
        });

        if (!connectedSet.has(path.id)) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Questa provincia non è collegata alla Capitale: non produce risorse finché non ci arriva una strada.</div>');
        }
        return g;
    }

    function roadGroup(player, path) {
        const g = group('Strade');
        const gratis = player.stradeGratis || 0;
        const vicine = R.engine.landNeighbors(path.id)
            .map(id => R.engine.path(id))
            .filter(p => p && R.engine.owner(p) === player.name && !R.engine.hasRoad(path.id, p.id));

        if (!vicine.length) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Nessuna provincia tua confinante da collegare.</div>');
            return g;
        }
        const cost = gratis ? 'gratuita (' + gratis + ')' : GR().formatCost(GR().COSTS.strada);
        vicine.forEach(target => {
            let why = null;
            if (!gratis) {
                const afford = GR().canAfford(player, GR().COSTS.strada, spareOf(path));
                if (!afford.ok) why = shorten(GR().missingText(afford.missing));
            }
            g.appendChild(actionButton('→ ' + R.provinceLabel(target), cost, why,
                () => run(GA().buildRoad(player, path.id, target.id))));
        });
        return g;
    }

    function attackGroup(player, path) {
        const g = document.createElement('div');
        g.className = 'bp-act-group';
        const available = R.countPiece(path, 'soldato');
        const partenti = spareOf(path);      // tutti meno il presidio (§5)
        let targets = GA().attackTargets(player, path.id);

        // Il vincolo che decide tutto il resto (uno resta sempre a casa) e
        // l'istruzione: si comanda dalla mappa. Il riquadrone col numero
        // gigante non serve più — quel numero è già nel cursore d'ordine.
        g.insertAdjacentHTML('beforeend',
            '<div class="bp-hint map-hint">Le province attaccabili sono <b>accese sulla mappa</b>: ' +
            'cliccane una e decidi lì quanti uomini partono. Da ' + R.provinceLabel(path) +
            ' possono partire <b>' + partenti + '</b> soldati su ' + available + '.</div>');

        // ---- CON CHE COSA SI PARTE (§9.2) ----
        // Prima la nave, poi quanti uomini, poi dove: la nave non si sceglie da
        // sé in fondo al percorso. Chi non ha scafi qui non vede nemmeno la riga.
        const flotta = [];
        R.engine.ships(path).forEach(h => {
            const e = flotta.find(x => x.tipo === h.tipo);
            if (e) e.n++; else flotta.push({ tipo: h.tipo, n: 1 });
        });
        if (attackVesselProv !== path.id) { attackVessel = null; attackVesselProv = path.id; }
        if (attackVessel && !flotta.some(f => f.tipo === attackVessel)) attackVessel = null;

        if (flotta.length) {
            const row = document.createElement('div');
            row.className = 'bp-vessels';
            const pick = (tipo, testo, sub) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'bp-vessel' + (attackVessel === tipo ? ' on' : '');
                b.innerHTML = '<span class="bv-name">' + testo + '</span>' +
                    '<span class="bv-sub">' + sub + '</span>';
                b.addEventListener('click', () => { attackVessel = tipo; render(); });
                row.appendChild(b);
            };
            pick(null, '⚔ Via terra', 'fino a ' + partenti + ' uomini');
            flotta.forEach(f => {
                const cap = R.engine.shipCapacity(f.tipo);
                pick(f.tipo,
                    (f.tipo === 'vascello' ? '🚢 Veliero' : '⛵ Nave') + (f.n > 1 ? ' ×' + f.n : ''),
                    'porta ' + cap + ' uomini');
            });
            g.appendChild(row);
        }

        // L'elenco dei bersagli segue la scelta: via terra i confinanti, con una
        // nave solo quel che QUELLA nave raggiunge.
        targets = attackVessel
            ? targets.filter(t => t.viaMare && t.scafi.indexOf(attackVessel) >= 0)
            : targets.filter(t => !t.viaMare);

        if (!targets.length) {
            g.insertAdjacentHTML('beforeend', '<div class="bp-empty-hint">' + (attackVessel
                ? 'Questa nave non raggiunge nessuna costa nemica da qui.'
                : 'Nessun confine nemico da qui: scegli un\'altra provincia di partenza.') + '</div>');
            return g;
        }
        if (!partenti) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Servono almeno 2 soldati: uno resta sempre a presidiare la provincia di partenza.</div>');
            return g;
        }

        // ---- L'ELENCO È LA STRADA LUNGA ----
        // Da quando si comanda dalla mappa, l'elenco dei bersagli serve in due
        // casi: gli SBARCHI (un Veliero tocca coste dall'altra parte del mondo,
        // sulla mappa non le trovi) e chi preferisce leggere tutte le
        // percentuali una sotto l'altra. Quindi sta in una cartellina, e si apre
        // da sé solo quando la mappa non può mostrarli tutti.
        const fold = document.createElement('details');
        fold.className = 'bp-fold';
        fold.open = targets.length > ORDER_MAX_MARKS;
        fold.innerHTML = '<summary>Tutti i bersagli <span class="bp-fold-hint">' +
            targets.length + (targets.length === 1 ? ' raggiungibile' : ' raggiungibili') +
            ' · con la probabilità di vittoria</span></summary>';
        const body = document.createElement('div');
        body.className = 'bp-fold-body';
        fold.appendChild(body);
        g.appendChild(fold);

        // Quanti uomini: con una nave il tetto è il suo carico, non l'esercito.
        const tetto = attackVessel
            ? Math.min(partenti, R.engine.shipCapacity(attackVessel))
            : partenti;
        const row = document.createElement('div');
        row.className = 'bp-act-row';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = String(tetto);
        input.value = String(tetto);
        input.title = attackVessel
            ? 'Uomini da imbarcare (il resto non ci sta a bordo)'
            : 'Truppe impegnate (ne resta almeno 1 a presidiare)';
        row.appendChild(input);
        row.insertAdjacentHTML('beforeend', '<span class="bp-act-cost">' + (attackVessel
            ? 'a bordo · la nave ne porta ' + R.engine.shipCapacity(attackVessel) +
              ', in provincia ne possono partire ' + partenti
            : 'di ' + partenti + ' che possono partire') + '</span>');
        body.appendChild(row);

        // Pronostico prima di lanciare la carica: è la stessa formula della
        // battaglia (§9, P_A = A² / (A² + Deff²)), così il giocatore sa cosa
        // rischia invece di tirare a caso.
        // Attacco di terra o SBARCO (§9.2): lo stesso elenco porta i due modi. Su
        // un bersaglio di mare il tetto non è l'esercito ma il CARICO dello scafo,
        // quindi il numero impegnato si stringe lì — ed è il numero su cui si fa
        // il pronostico, se no la percentuale mostrata mentirebbe.
        const engagedFor = () => Math.max(0, Math.min(parseInt(input.value, 10) || 0, tetto));

        const odds = [];
        targets.forEach(t => {
            const bonus = t.fort ? ' +' + t.fort : '';
            const terr = terrainTag(t.terreno);
            // La ventura del difensore si vede come si vedono le sue truppe: è
            // parte di quel che si sa guardando il confine (§5.3).
            const vent = t.merc ? ' · ' + t.merc + '⚑' : '';
            const btn = actionButton((t.viaMare ? '⚓ ' : '⚔ ') + t.label,
                t.owner + ' · ' + t.troops + bonus + vent + (terr ? ' · ' + terr : ''), null,
                () => askAttack(player, path, t, engagedFor()));
            const chip = document.createElement('span');
            chip.className = 'bp-odds';
            btn.appendChild(chip);
            odds.push(() => {
                const f = forecast(path, engagedFor(), t);
                chip.textContent = oddsText(f);
                chip.title = mercNote(f);
                chip.className = 'bp-odds ' + (f.p >= 60 ? 'good' : f.p >= 40 ? 'even' : 'bad');
            });
            body.appendChild(btn);
        });

        const refreshOdds = () => odds.forEach(f => f());
        input.addEventListener('input', refreshOdds);
        refreshOdds();
        return g;
    }

    // La conferma dell'attacco (o dello sbarco) sta QUI e non dentro l'elenco:
    // la chiamano sia i bottoni del pannello sia il cursore d'ordine sulla
    // mappa, e il giocatore deve leggere le stesse parole comunque ci arrivi.
    function askAttack(player, path, t, n) {
        const f = forecast(path, n, t);
        // Il terreno è la cosa che il giocatore rischia di non vedere: va detta
        // prima della carica, non nel rapporto dopo.
        const nota = (typeof Terrain !== 'undefined' && Terrain.exists(t.terreno))
            ? ' ' + Terrain.label(t.terreno) + ' (' + Terrain.get(t.terreno).breve + '): ' +
              Terrain.get(t.terreno).testo
            : '';
        // Uno sbarco si paga di più di un attacco: parte anche la nave, e non
        // c'è modo di richiamarla indietro (§9.2). Va detto qui, prima della
        // carica, non scoperto nel rapporto dopo.
        const testoSbarco = t.viaMare
            ? ' Parte anche la ' + (attackVessel === 'vascello' ? 'nave da guerra' : 'nave') +
              ': approda comunque vada. Vinci e resta ancorata sulla costa presa; ' +
              'perdi e finisce in mano al difensore, con tutti gli uomini a bordo. ' +
              'Uno sbarco non si può fermare a metà.'
            : ' Le truppe impegnate lasciano ' + R.provinceLabel(path) +
              ' comunque vada: se vinci deciderai quante restano nella provincia presa ' +
              'e quante rientrano; se perdi non torna nessuno.';
        // La ventura è l'altra cosa che non si vede: se c'è, il numero mostrato è
        // una media e va detto qui, prima della carica (§5.3).
        const testoVentura = f.banda ? ' ' + mercNote(f) : '';
        R.confirm({
            title: (t.viaMare ? 'Sbarcare a ' : 'Attaccare ') + t.label + '?',
            text: n + (n === 1 ? ' truppa imbarcata' : ' truppe') + ' contro ' +
                t.troops + (t.fort ? ' difensori (+' + t.fort + ' dalle strutture)' : ' difensori') +
                ' · probabilità di vittoria ' + (f.banda ? 'intorno al ' : '') + f.p + '%.' +
                testoVentura + nota + testoSbarco,
            ok: t.viaMare ? '⚓ Sbarca' : '⚔ Carica', tone: 'war'
        }, () => { closeOrder(); run(GA().attack(player, path.id, t.id, n, undefined, attackVessel)); });
    }

    // Probabilità di vittoria dell'attaccante col numero di truppe scelto.
    // La formula NON si riscrive qui: chiama battle.js, così il pronostico e la
    // battaglia vera non possono divergere (mura + terreno del bersaglio, §9).
    //
    // Con dei MERCENARI in campo (§5.3) la risposta onesta non è un numero ma una
    // banda: `p` è la media, `min`/`max` gli estremi. La plancia mostra la media e
    // dice la banda — promettere una precisione che la battaglia non ha sarebbe
    // esattamente la bugia che questa funzione esiste per evitare.
    function forecast(from, n, target) {
        const a = Math.max(0, Math.floor(n || 0));
        if (!a) return { p: 0, min: 0, max: 0, banda: 0, mercA: 0, mercD: 0 };
        const mercA = from ? GA().mercEngaged(from.id, a) : 0;
        const f = RisikoBattle.winForecast(a, (target.troops || 0) + (target.fort || 0),
            target.esponente, mercA, target.merc || 0);
        return {
            p: Math.round(100 * f.p), min: Math.round(100 * f.min), max: Math.round(100 * f.max),
            banda: Math.round(100 * f.banda), mercA, mercD: target.merc || 0
        };
    }

    // "62%" oppure "~62%" quando la ventura rende il numero incerto.
    function oddsText(f) { return (f.banda ? '~' : '') + f.p + '%'; }

    // Che cosa c'è dietro quel numero, in una riga: serve al `title` del chip e al
    // testo della conferma. Vuoto quando non ci sono mercenari.
    function mercNote(f) {
        if (!f.banda) return '';
        const chi = [];
        if (f.mercA) chi.push(f.mercA + ' dei tuoi');
        if (f.mercD) chi.push(f.mercD + ' dei suoi');
        return 'Ventura in campo (' + chi.join(', ') + '): la battaglia sta fra ' +
            f.min + '% e ' + f.max + '%.';
    }

    // Etichetta del terreno di un bersaglio: '⛰ chiuso' / '≈ aperto'.
    function terrainTag(key) {
        if (!key || typeof Terrain === 'undefined' || !Terrain.exists(key)) return '';
        return Terrain.icon(key) + ' ' + key;
    }

    function shorten(msg) {
        if (!msg) return msg;
        return msg.length > 34 ? msg.slice(0, 32) + '…' : msg;
    }

    // ---------- conquista: come occupare la provincia appena presa ----------
    // Passo obbligato dopo una vittoria: finché è aperto game-actions rifiuta
    // qualsiasi altra azione, quindi qui non serve disabilitare nient'altro.

    function renderConquest(player) {
        const box = $('bp-conquest');
        const c = GA().conquestPending(player);
        if (!c) { box.style.display = 'none'; return; }

        box.style.display = 'block';
        box.innerHTML = `
            <div class="bc-head">⚑ ${c.toLabel} è tua — quanti restano a occuparla?</div>
            <div class="bc-route">${c.superstiti} superstiti dell'assalto partito da ${c.fromLabel}</div>
            <div class="bc-split">
                <div class="bc-cell win"><span class="n" id="bc-occup">0</span><span class="l">occupano ${c.toLabel}</span></div>
                <div class="bc-cell back"><span class="n" id="bc-back">0</span><span class="l">rientrano in ${c.fromLabel}</span></div>
            </div>
            <input type="range" id="bc-range" min="1" max="${c.superstiti}" value="${c.superstiti}">
            <div class="bc-note">Almeno 1 deve restare, se no la provincia resta sguarnita.</div>
            <button type="button" class="bp-act bc-go"><span class="bp-act-name">Conferma l'occupazione</span></button>`;

        const range = box.querySelector('#bc-range');
        const sync = () => {
            const n = parseInt(range.value, 10);
            setText('bc-occup', n);
            setText('bc-back', c.superstiti - n);
        };
        range.addEventListener('input', sync);
        sync();
        box.querySelector('.bc-go').addEventListener('click',
            () => run(GA().resolveConquest(player, parseInt(range.value, 10))));
    }

    // ---------- spostamento di fine turno (uno solo) ----------

    function renderMove(player) {
        const box = $('bp-move');
        box.innerHTML = '';
        if (!isPlaying(player)) {
            box.innerHTML = '<div class="bp-empty-hint">Non è il tuo turno.</div>';
            return;
        }
        if (player.spostamentoFatto) {
            box.innerHTML = '<div class="bp-empty-hint">Spostamento già fatto: se ne fa uno solo per turno. ' +
                'Puoi chiudere il turno.</div>';
            return;
        }

        // Primo clic: la partenza. Finché non è scelta il pannello non racconta
        // nessuna provincia — quella selezionata è l'eredità della fase
        // precedente e non c'entra più (vedi moveOriginPath).
        const path = moveOriginPath(player);
        if (!path) {
            const quante = GA().moveOrigins(player).length;
            box.innerHTML = '<div class="bp-empty-hint">Due clic: prima la provincia <b>da cui</b> partono i ' +
                'soldati, poi quella <b>dove</b> arrivano. Sulla mappa sono accese le ' + quante +
                ' province da cui puoi muovere' + (quante ? ': cliccane una' : '') + '.</div>';
            return;
        }

        const available = R.countPiece(path, 'soldato');
        const mobili = spareOf(path);

        const targets = GA().moveTargets(player, path.id);
        if (!targets.length) {
            box.innerHTML = '<div class="bp-empty-hint">Da ' + R.provinceLabel(path) +
                ' non si raggiunge nessun\'altra tua provincia via terra.</div>';
            return;
        }

        box.insertAdjacentHTML('beforeend',
            '<div class="bp-hint map-hint">Parti da <b>' + R.provinceLabel(path) + '</b>: se ne muovono <b>' +
            mobili + '</b> su ' + available + '. Le province dove possono arrivare sono ' +
            '<b>accese sulla mappa</b>: cliccane una e decidi lì quanti partono.</div>');

        // Cambiare partenza dev'essere un gesto, non un rompicapo: sulla mappa
        // basta ricliccare la provincia di partenza, ma quella è una scorciatoia
        // che nessuno indovina — qui c'è scritta.
        box.appendChild(actionButton('↩ Cambia partenza', 'scegli un\'altra provincia', null, () => {
            moveArmed = false;
            closeOrder();
            render();
        }));

        // Come per l'attacco, l'elenco resta la strada lunga: un regno grande ha
        // decine di province collegate e la lista le scorrerebbe tutte.
        const fold = document.createElement('details');
        fold.className = 'bp-fold';
        fold.open = targets.length > ORDER_MAX_MARKS;
        fold.innerHTML = '<summary>Tutte le destinazioni <span class="bp-fold-hint">' +
            targets.length + ' province collegate</span></summary>';
        const body = document.createElement('div');
        body.className = 'bp-fold-body';
        fold.appendChild(body);
        box.appendChild(fold);

        const row = document.createElement('div');
        row.className = 'bp-act-row';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = String(mobili);
        input.value = String(mobili);
        input.title = 'Soldati da spostare (ne resta almeno 1)';
        row.appendChild(input);
        row.insertAdjacentHTML('beforeend', '<span class="bp-act-cost">di ' + mobili + '</span>');
        body.appendChild(row);

        targets.forEach(t => {
            body.appendChild(actionButton('→ ' + t.label, t.troops + ' già lì', null, () => {
                const n = parseInt(input.value, 10);
                R.confirm({
                    title: 'Spostare a ' + t.label + '?',
                    text: n + (n === 1 ? ' soldato lascia ' : ' soldati lasciano ') + R.provinceLabel(path) +
                        ' per ' + t.label + '. È l\'unico spostamento del turno: dopo non se ne fanno altri.',
                    ok: 'Sposta'
                }, () => run(GA().finalMove(player, path.id, t.id, n)));
            }));
        });
    }

    // ---------- commerci (§7) ----------
    // Tre cose in una sezione, tutte dentro la fase costruzioni: lo scambio con
    // l'estero (banca 2:1), l'invio di proposte agli altri regni e le carovane
    // arrivate. Le regole e le mutazioni stanno in game-rules/game-actions: qui
    // si disegna e si raccolgono i clic.

    const RES = () => GR().RES;
    const GOLD = 'monete';
    function resName(k) { return (GR().RES_LABEL && GR().RES_LABEL[k]) || k; }
    function goodName(k) { return k === GOLD ? 'Oro' : resName(k); }

    // <select> di risorse, con la scelta corrente preselezionata. La banca (2:1)
    // scambia solo risorse, quindi qui NON compare l'oro.
    function resSelect(current, onChange) {
        const sel = document.createElement('select');
        sel.className = 'bp-trade-sel';
        RES().forEach(k => {
            const o = document.createElement('option');
            o.value = k; o.textContent = resName(k);
            if (k === current) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => onChange(sel.value));
        return sel;
    }

    // Come resSelect, ma con l'ORO in coda: nelle proposte fra regni una merce
    // può essere una risorsa o oro (oro→risorse, risorse→oro).
    function goodSelect(current, onChange) {
        const sel = document.createElement('select');
        sel.className = 'bp-trade-sel';
        RES().concat([GOLD]).forEach(k => {
            const o = document.createElement('option');
            o.value = k; o.textContent = goodName(k);
            if (k === current) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => onChange(sel.value));
        return sel;
    }

    function qtyInput(value, max, onChange) {
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = '1'; inp.className = 'bp-trade-qty';
        if (max) inp.max = String(max);
        inp.value = String(value);
        inp.addEventListener('input', () => onChange(parseInt(inp.value, 10) || 0));
        return inp;
    }

    // Campo quantità che conosce la merce: l'oro va a passi di 100 e ha il suo
    // tetto, le risorse a passi di 1. Così il numero mostrato è già valido.
    function goodQty(tipo, value, onChange) {
        const gold = tipo === GOLD;
        const step = gold ? GR().GOLD_UNIT : 1;
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'bp-trade-qty';
        inp.min = String(step);
        inp.step = String(step);
        inp.max = String(gold ? GR().TRADE_MAX_GOLD : GR().TRADE_MAX_UNITS);
        inp.value = String(value);
        inp.addEventListener('input', () => onChange(parseInt(inp.value, 10) || 0));
        return inp;
    }

    // Un'altra merce, diversa da quella data: serve a non ritrovarsi "oro per oro"
    // o "pietra per pietra" quando si cambia un lato della proposta.
    function altGood(tipo) { return tipo === GOLD ? RES()[0] : (RES().find(k => k !== tipo) || GOLD); }

    // Cambia il TIPO di un lato della proposta e rimette una quantità sensata per
    // quel tipo (oro→100, risorsa→un piccolo default), evitando i due lati uguali.
    function setLegType(leg, tipo) {
        if (leg === 'offro') { tradeUI.offroT = tipo; tradeUI.offroN = tipo === GOLD ? GR().GOLD_UNIT : 3; }
        else { tradeUI.chiedoT = tipo; tradeUI.chiedoN = tipo === GOLD ? GR().GOLD_UNIT : 2; }
        if (tradeUI.offroT === tradeUI.chiedoT) {
            if (leg === 'offro') tradeUI.chiedoT = altGood(tipo);
            else tradeUI.offroT = altGood(tipo);
        }
    }

    // ---------- spie (§9.3) ----------
    // Si comprano OCCHI: 300 monete, 3 turni, una provincia lontana e le sue
    // limitrofe viste in nebbia leggera — le bandiere, non le guarnigioni.
    // Due scelte da tenere ferme:
    //  1. Il bersaglio si sceglie SULLA MAPPA, come l'attacco e lo spostamento
    //     (regola dell'utente). Il bottone qui non manda nessuno: accende le
    //     province dove la spia può arrivare, e il clic sulla mappa chiude
    //     l'affare. Un elenco di cento nomi di terre mai viste non si legge.
    //  2. Qui NON si scrive chi governa i bersagli: è quello che la spia va a
    //     comprare (per questo `GA().spyTargets` non lo restituisce nemmeno).
    //     Delle spie già partite invece si dice eccome — è il loro rapporto.

    let spyPicking = false;      // sto scegliendo dove mandarla?
    let spyChoices = [];         // bersagli di QUESTO render (li usa anche la mappa)

    function renderSpies(player) {
        const box = $('bp-spies');
        if (!box) return;
        const S = window.Spies;
        if (!S) { box.innerHTML = '<div class="bp-empty-hint">Spie non disponibili.</div>'; return; }

        const turno = R.turn();
        const attive = S.active(player.spie, turno);
        const myTurn = inPhase(player, 'costruisci');
        box.innerHTML = '';

        // --- il rapporto: dove sono i nostri uomini e cosa hanno visto ---
        if (attive.length) {
            const list = document.createElement('div');
            list.className = 'bp-spy-list';
            attive.forEach(s => {
                const path = R.engine.path(s.prov);
                const resta = S.remaining(s, turno);
                const owner = path ? R.engine.owner(path) : null;
                const row = document.createElement('div');
                row.className = 'bp-spy-row';
                row.innerHTML = '<span class="bp-spy-ico">🕵</span>' +
                    '<span class="bp-spy-name"></span>' +
                    '<span class="bp-spy-owner"></span>' +
                    '<span class="bp-spy-left">' + resta + (resta === 1 ? ' turno' : ' turni') + '</span>';
                row.querySelector('.bp-spy-name').textContent = path ? R.provinceLabel(path) : s.prov;
                row.querySelector('.bp-spy-owner').textContent = owner || 'terra di nessuno';
                list.appendChild(row);
            });
            box.appendChild(list);
        }

        // --- mandarne un'altra ---
        const costo = GR().COSTS.spia;
        let why = null;
        if (!myTurn) why = 'Solo nel tuo turno, in fase costruzioni.';
        else if (attive.length >= S.MAX) why = 'Ne hai già ' + S.MAX + ' in perlustrazione.';
        else {
            const afford = GR().canAfford(player, costo, 0);
            if (!afford.ok) why = GR().missingText(afford.missing);
        }

        if (spyPicking) {
            box.appendChild(actionButton('✕ Lascia stare', null, null,
                () => { spyPicking = false; render(); }));
            box.insertAdjacentHTML('beforeend',
                '<div class="bp-hint map-hint">Le province dove la spia può arrivare sono ' +
                '<b>accese sulla mappa</b> (' + spyChoices.length + '): cliccane una. ' +
                'Sono quelle che non vedi già, entro ' + S.RAGGIO + ' confini dal tuo territorio.</div>');
            if (!spyChoices.length) {
                box.insertAdjacentHTML('beforeend',
                    '<div class="bp-empty-hint">Nessuna meta: da qui non si esce dalla propria vista ' +
                    'in ' + S.RAGGIO + ' confini. Conquista o naviga più lontano, poi riprova.</div>');
            }
        } else {
            box.appendChild(actionButton('🕵 Manda una spia', GR().formatCost(costo),
                why ? shorten(why) : null, () => { spyPicking = true; render(); }));
        }

        box.insertAdjacentHTML('beforeend',
            '<div class="bp-empty-hint">' + S.DURATA + ' turni di perlustrazione, al massimo ' +
            S.MAX + ' insieme. Vedrai di chi sono la provincia e le sue limitrofe, ' +
            'mai quante truppe ci stanno.</div>');
    }

    // La conferma è una sola, come per l'attacco: chi arriva dalla mappa e chi
    // dal pannello deve leggere le stesse parole. Di chi sia la provincia non si
    // dice: si sta pagando per saperlo.
    function askSpy(player, t) {
        const S = window.Spies;
        R.confirm({
            title: 'Mandare una spia a ' + t.label + '?',
            text: GR().formatCost(GR().COSTS.spia) + '. Dista ' + t.dist +
                (t.dist === 1 ? ' confine' : ' confini') + ' dal tuo territorio. Per ' + S.DURATA +
                ' turni vedrai di chi sono ' + t.label + ' e le province che la circondano — ' +
                'le bandiere, non le guarnigioni.',
            ok: '🕵 Manda la spia'
        }, () => { spyPicking = false; run(GA().sendSpy(player, t.id)); });
    }

    function renderTrade(player) {
        const box = $('bp-trade');
        if (!box) return;

        if (!GA().hasMarket(player)) {
            box.innerHTML = '<div class="bp-empty-hint">Nessun Mercato: costruiscine uno per commerciare con l\'estero ' +
                'e trattare con gli altri regni.</div>';
            return;
        }

        // Valori di default coerenti con le scorte del regno.
        const scorte = player.scorte || {};
        if (!tradeUI.dai) tradeUI.dai = RES().slice().sort((a, b) => (scorte[b] || 0) - (scorte[a] || 0))[0];
        if (!tradeUI.prendi) tradeUI.prendi = RES().find(k => k !== tradeUI.dai);
        if (!tradeUI.offroT) tradeUI.offroT = tradeUI.dai;
        if (!tradeUI.chiedoT) tradeUI.chiedoT = tradeUI.prendi;

        box.innerHTML = '';
        const myTurn = inPhase(player, 'costruisci');

        box.appendChild(bankTradeCard(player, myTurn));
        box.appendChild(proposeCard(player, myTurn));
        box.appendChild(inboxCard(player, myTurn));
        box.appendChild(outboxCard(player, myTurn));
    }

    // --- scambio con l'estero (banca 2:1) ---
    function bankTradeCard(player, myTurn) {
        const card = document.createElement('div');
        card.className = 'bp-trade-card';
        card.innerHTML = '<div class="bp-trade-head">Scambio con l\'estero <span class="bp-trade-rate">' +
            GR().TRADE_RATE + ':1</span></div>';

        if (tradeUI.prendi === tradeUI.dai) tradeUI.prendi = RES().find(k => k !== tradeUI.dai);

        const row = document.createElement('div');
        row.className = 'bp-trade-row';

        const give = document.createElement('div');
        give.className = 'bp-trade-leg';
        give.innerHTML = '<span class="bp-trade-lab">dai</span>';
        give.appendChild(resSelect(tradeUI.dai, v => { tradeUI.dai = v; renderTrade(player); }));

        const get = document.createElement('div');
        get.className = 'bp-trade-leg';
        get.innerHTML = '<span class="bp-trade-lab">ricevi</span>';
        get.appendChild(resSelect(tradeUI.prendi, v => { tradeUI.prendi = v; renderTrade(player); }));
        get.appendChild(qtyInput(tradeUI.n, GR().TRADE_MAX_UNITS, v => { tradeUI.n = v; syncBank(); }));

        row.appendChild(give);
        row.insertAdjacentHTML('beforeend', '<span class="bp-trade-arrow">→</span>');
        row.appendChild(get);
        card.appendChild(row);

        const check = GR().canBankTrade(player, tradeUI.dai, tradeUI.prendi, tradeUI.n);
        const cost = GR().bankTradeCost(tradeUI.n);
        const note = document.createElement('div');
        note.className = 'bp-trade-cost';
        note.textContent = 'Costo: ' + cost + ' ' + resName(tradeUI.dai) +
            ' (ne hai ' + (player.scorte[tradeUI.dai] || 0) + ')';
        card.appendChild(note);

        const why = myTurn ? (check.ok ? null : check.msg) : 'Solo nel tuo turno, in fase costruzioni.';
        card.appendChild(actionButton('Scambia', null, why ? shorten(why) : null,
            () => run(GA().tradeWithBank(player, tradeUI.dai, tradeUI.prendi, tradeUI.n))));
        card._syncBank = () => { note.textContent = 'Costo: ' + GR().bankTradeCost(tradeUI.n) + ' ' +
            resName(tradeUI.dai) + ' (ne hai ' + (player.scorte[tradeUI.dai] || 0) + ')'; };
        function syncBank() { if (card._syncBank) card._syncBank(); }
        return card;
    }

    // --- proposta a un altro regno ---
    function proposeCard(player, myTurn) {
        const card = document.createElement('div');
        card.className = 'bp-trade-card';
        card.innerHTML = '<div class="bp-trade-head">Proponi a un regno</div>';

        const altri = R.players().filter(p => p.id !== player.id && R.ownedPaths(p.name).length);
        if (!altri.length) {
            card.insertAdjacentHTML('beforeend', '<div class="bp-empty-hint">Nessun altro regno con cui trattare.</div>');
            return card;
        }
        if (!tradeUI.verso || !altri.some(p => p.id === tradeUI.verso)) tradeUI.verso = altri[0].id;
        if (tradeUI.chiedoT === tradeUI.offroT) tradeUI.chiedoT = RES().find(k => k !== tradeUI.offroT);

        const dst = document.createElement('div');
        dst.className = 'bp-trade-leg';
        dst.innerHTML = '<span class="bp-trade-lab">a</span>';
        const sel = document.createElement('select');
        sel.className = 'bp-trade-sel';
        altri.forEach(p => {
            const o = document.createElement('option');
            o.value = String(p.id); o.textContent = p.name;
            if (p.id === tradeUI.verso) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => { tradeUI.verso = parseInt(sel.value, 10); });
        dst.appendChild(sel);
        card.appendChild(dst);

        const row = document.createElement('div');
        row.className = 'bp-trade-row';
        const off = document.createElement('div');
        off.className = 'bp-trade-leg';
        off.innerHTML = '<span class="bp-trade-lab">offri</span>';
        off.appendChild(goodQty(tradeUI.offroT, tradeUI.offroN, v => { tradeUI.offroN = v; }));
        off.appendChild(goodSelect(tradeUI.offroT, v => { setLegType('offro', v); renderTrade(player); }));

        const req = document.createElement('div');
        req.className = 'bp-trade-leg';
        req.innerHTML = '<span class="bp-trade-lab">chiedi</span>';
        req.appendChild(goodQty(tradeUI.chiedoT, tradeUI.chiedoN, v => { tradeUI.chiedoN = v; }));
        req.appendChild(goodSelect(tradeUI.chiedoT, v => { setLegType('chiedo', v); renderTrade(player); }));

        row.appendChild(off);
        row.insertAdjacentHTML('beforeend', '<span class="bp-trade-arrow">⇄</span>');
        row.appendChild(req);
        card.appendChild(row);

        const aperte = GA().tradeOutbox(player).length;
        const offHave = tradeUI.offroT === GOLD ? (player.monete || 0) : (player.scorte[tradeUI.offroT] || 0);
        const offChk = GR().checkGoods({ tipo: tradeUI.offroT, n: tradeUI.offroN });
        const chiChk = GR().checkGoods({ tipo: tradeUI.chiedoT, n: tradeUI.chiedoN });
        let why = null;
        if (!myTurn) why = 'Solo nel tuo turno, in fase costruzioni.';
        else if (aperte >= GR().TRADE_MAX_PENDING) why = 'Hai già ' + aperte + ' proposte aperte.';
        else if (!offChk.ok) why = offChk.msg;
        else if (!chiChk.ok) why = chiChk.msg;
        else if (offHave < tradeUI.offroN) why = 'Non hai abbastanza da offrire.';

        card.insertAdjacentHTML('beforeend',
            '<div class="bp-trade-cost">La merce offerta parte subito come pegno: torna se rifiutano o alla scadenza.</div>');
        card.appendChild(actionButton('Invia proposta', null, why ? shorten(why) : null,
            () => run(GA().proposeTrade(player, tradeUI.verso,
                { tipo: tradeUI.offroT, n: tradeUI.offroN }, { tipo: tradeUI.chiedoT, n: tradeUI.chiedoN }))));
        return card;
    }

    // --- carovane arrivate ---
    function inboxCard(player, myTurn) {
        const card = document.createElement('div');
        card.className = 'bp-trade-card';
        const inbox = GA().tradeInbox(player);
        card.innerHTML = '<div class="bp-trade-head">Richieste dall\'estero' +
            (inbox.length ? ' <span class="bp-trade-badge">' + inbox.length + '</span>' : '') + '</div>';

        if (!inbox.length) {
            card.insertAdjacentHTML('beforeend', '<div class="bp-empty-hint">Nessuna carovana in arrivo.</div>');
            return card;
        }

        inbox.forEach(o => {
            const from = R.players().find(p => p.id === o.da);
            const hai = o.chiedo.tipo === GOLD ? (player.monete || 0) : (player.scorte[o.chiedo.tipo] || 0);
            const puoi = hai >= o.chiedo.n;
            const item = document.createElement('div');
            item.className = 'bp-trade-offer';
            item.innerHTML =
                '<div class="bp-trade-offer-head"><span class="bp-trade-dot" style="background:' +
                ((from && from.color) || '#888') + '"></span><span class="bp-trade-from"></span></div>' +
                '<div class="bp-trade-terms"><span class="in">+ ' + GR().goodsText(o.offro) +
                '</span><span class="out">− ' + GR().goodsText(o.chiedo) + '</span></div>';
            item.querySelector('.bp-trade-from').textContent = (from ? from.name : 'Regno ignoto') +
                ' offre uno scambio';

            const acts = document.createElement('div');
            acts.className = 'bp-trade-acts';
            const ok = document.createElement('button');
            ok.type = 'button'; ok.className = 'bp-mini ok'; ok.textContent = '✓ Accetta';
            ok.disabled = !puoi;
            ok.title = puoi ? 'Consegni ' + GR().goodsText(o.chiedo) : 'Non hai ' + GR().goodsText(o.chiedo);
            ok.addEventListener('click', () => run(GA().acceptTrade(player, o.id)));
            const no = document.createElement('button');
            no.type = 'button'; no.className = 'bp-mini no'; no.textContent = '✕ Rifiuta';
            no.addEventListener('click', () => run(GA().refuseTrade(player, o.id)));
            acts.appendChild(ok); acts.appendChild(no);
            item.appendChild(acts);
            card.appendChild(item);
        });
        return card;
    }

    // --- proposte partite, in attesa di risposta ---
    function outboxCard(player) {
        const card = document.createElement('div');
        card.className = 'bp-trade-card';
        const outbox = GA().tradeOutbox(player);
        card.innerHTML = '<div class="bp-trade-head">Proposte in attesa' +
            (outbox.length ? ' <span class="bp-trade-badge">' + outbox.length + '</span>' : '') + '</div>';

        if (!outbox.length) {
            card.insertAdjacentHTML('beforeend', '<div class="bp-empty-hint">Nessuna proposta in sospeso.</div>');
            return card;
        }

        outbox.forEach(o => {
            const to = R.players().find(p => p.id === o.a);
            const item = document.createElement('div');
            item.className = 'bp-trade-offer';
            item.innerHTML =
                '<div class="bp-trade-offer-head"><span class="bp-trade-dot" style="background:' +
                ((to && to.color) || '#888') + '"></span><span class="bp-trade-from"></span></div>' +
                '<div class="bp-trade-terms"><span class="out">− ' + GR().goodsText(o.offro) +
                '</span><span class="in">+ ' + GR().goodsText(o.chiedo) + '</span></div>';
            item.querySelector('.bp-trade-from').textContent = 'A ' + (to ? to.name : 'regno ignoto');

            const acts = document.createElement('div');
            acts.className = 'bp-trade-acts';
            const cancel = document.createElement('button');
            cancel.type = 'button'; cancel.className = 'bp-mini no'; cancel.textContent = 'Ritira';
            cancel.title = 'Ritira la proposta: la merce offerta torna nelle scorte';
            cancel.addEventListener('click', () => run(GA().cancelTrade(player, o.id)));
            acts.appendChild(cancel);
            item.appendChild(acts);
            card.appendChild(item);
        });
        return card;
    }

    // ============================================================
    // COMANDARE DALLA MAPPA (richiesta dell'utente)
    // Attacco e spostamento non si scelgono più da un elenco nel pannello: si
    // fanno sulla mappa. Selezionata una provincia propria, le province dove si
    // può andare si ACCENDONO (Risiko.markTargets) e le frecce dicono la
    // direzione; cliccandone una si apre lì sopra il CURSORE D'ORDINE
    // (#map-order-hud): quanti uomini, che probabilità, e via.
    //
    // Tre regole imparate qui:
    //  1. La verità sui bersagli resta di game-actions.js. `orderTargets` è solo
    //     l'indice id→bersaglio dell'ULTIMO render: serve al clic per capire in
    //     un colpo se quella provincia è un ordine o una nuova selezione.
    //  2. Il cursore si costruisce UNA VOLTA all'apertura e poi si aggiorna:
    //     ricostruirlo a ogni render (e i render arrivano anche dai bot)
    //     azzererebbe il cursore mentre lo si trascina.
    //  3. Il pannello resta la strada lunga e non sparisce: gli sbarchi di un
    //     Veliero toccano cento province lontane, e sulla mappa non si trovano.
    // ============================================================

    let orderTargets = new Map();     // id → bersaglio, aggiornato a ogni render
    let order = null;                 // ordine aperto: {kind, fromId, target, n, max}
    let orderKey = '';                // firma dell'ordine disegnato adesso
    const ORDER_MAX_MARKS = 24;       // oltre, la mappa si illumina tutta e non dice più niente

    const orderHud = $('map-order-hud');
    let orderRaf = null;

    function closeOrder() {
        order = null;
        orderKey = '';
        if (orderHud) orderHud.style.display = 'none';
        if (orderRaf) { cancelAnimationFrame(orderRaf); orderRaf = null; }
    }

    // Quanti uomini possono partire per questo ordine. Il presidio minimo (§5)
    // vale sempre; con una nave c'è il secondo tetto del carico (§9.2).
    function orderMax(kind, path, target) {
        const partenti = spareOf(path);
        if (kind === 'attacca' && target.viaMare && attackVessel) {
            return Math.min(partenti, R.engine.shipCapacity(attackVessel));
        }
        return partenti;
    }

    function openOrder(toId) {
        const player = currentPlayer();
        const target = orderTargets.get(toId);
        if (!player || !target) return;
        // La spia (§9.3) non parte da una provincia: non ha uomini da contare né
        // probabilità da mostrare, quindi niente cursore d'ordine — si conferma
        // e si parte.
        if (target.kind === 'spia') { askSpy(player, target); return; }
        const path = selectedProvId ? R.engine.path(selectedProvId) : null;
        if (!path) return;
        const kind = phase(player);
        const max = orderMax(kind, path, target);
        if (max < 1) {
            showNotice('In ' + R.provinceLabel(path) + ' non c\'è nessuno che possa partire: ' +
                'un soldato resta sempre a presidiare.', false);
            return;
        }
        order = { kind, fromId: path.id, target, max, n: max };
        render();
    }

    // Il cursore d'ordine: si posa SOPRA la provincia bersaglio (non addosso —
    // coprirebbe proprio la guarnigione che si sta valutando) e insegue la mappa
    // come il cursore di schieramento, perché pan e zoom non emettono eventi.
    // Resta comunque dentro la cornice: un bersaglio sul bordo della mappa
    // manderebbe metà cursore fuori, coi bottoni intagliati.
    const mapWrap = $('map-wrapper');

    function placeOrderHud() {
        const pos = order && R.provinceScreenPos(order.target.id);
        if (!pos || !pos.visible) { orderHud.style.visibility = 'hidden'; return; }
        orderHud.style.visibility = 'visible';
        const W = mapWrap.clientWidth, H = mapWrap.clientHeight;
        const w = orderHud.offsetWidth || 216, h = orderHud.offsetHeight || 160;
        const m = 8;                       // margine dal bordo della cornice
        const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
        const x = clamp(pos.x, w / 2 + m, W - w / 2 - m);
        const y = clamp(pos.y - h / 2 - 24, h / 2 + m, H - h / 2 - m);
        orderHud.style.left = x + 'px';
        orderHud.style.top = y + 'px';
    }

    function trackOrderHud() {
        if (!order) { orderRaf = null; return; }
        placeOrderHud();
        orderRaf = requestAnimationFrame(trackOrderHud);
    }

    function renderOrderHud(player) {
        if (!orderHud) return;
        // L'ordine vale solo per la provincia, la fase e il turno in cui è nato.
        if (order && (!isPlaying(player) || player.conquista ||
            phase(player) !== order.kind || selectedProvId !== order.fromId ||
            !orderTargets.has(order.target.id))) {
            closeOrder();
        }
        if (!order) { orderHud.style.display = 'none'; return; }

        const path = R.engine.path(order.fromId);
        order.target = orderTargets.get(order.target.id);      // dati freschi
        order.max = orderMax(order.kind, path, order.target);
        order.n = Math.max(1, Math.min(order.n, order.max));

        const t = order.target;
        const chiave = [order.kind, order.fromId, t.id, order.max, attackVessel].join('|');
        if (chiave !== orderKey) { buildOrderHud(player, path); orderKey = chiave; }
        syncOrderHud();

        orderHud.style.display = 'block';
        placeOrderHud();
        if (!orderRaf) orderRaf = requestAnimationFrame(trackOrderHud);
    }

    function buildOrderHud(player, path) {
        const t = order.target;
        const attacco = order.kind === 'attacca';
        const sbarco = attacco && t.viaMare;
        const terr = terrainTag(t.terreno);

        orderHud.className = 'moh ' + (attacco ? 'atk' : 'mov');
        orderHud.innerHTML =
            '<div class="moh-head"><span class="moh-ico">' +
                (sbarco ? '⚓' : attacco ? '⚔' : '➜') + '</span>' +
                '<span class="moh-name"></span></div>' +
            '<div class="moh-sub"></div>' +
            '<div class="moh-ctl">' +
                '<button type="button" class="moh-btn" data-d="-1">−</button>' +
                '<span class="moh-n"></span>' +
                '<button type="button" class="moh-btn" data-d="1">+</button>' +
            '</div>' +
            '<input type="range" class="moh-range" min="1" max="' + order.max + '" value="' + order.n + '">' +
            (attacco ? '<div class="moh-odds"></div>' : '') +
            '<div class="moh-acts">' +
                '<button type="button" class="moh-no">✕ Lascia stare</button>' +
                '<button type="button" class="moh-go">' +
                    (sbarco ? '⚓ Sbarca' : attacco ? '⚔ Carica' : '➜ Sposta') + '</button>' +
            '</div>';

        orderHud.querySelector('.moh-name').textContent = t.label;
        orderHud.querySelector('.moh-sub').textContent = attacco
            ? t.owner + ' · ' + t.troops + ' a difesa' + (t.fort ? ' +' + t.fort + ' mura' : '') +
              (t.merc ? ' · ' + t.merc + '⚑' : '') + (terr ? ' · ' + terr : '')
            : t.troops + ' già lì · da ' + R.provinceLabel(path);

        const range = orderHud.querySelector('.moh-range');
        range.addEventListener('input', () => {
            order.n = Math.max(1, Math.min(parseInt(range.value, 10) || 1, order.max));
            syncOrderHud();
        });
        orderHud.querySelectorAll('.moh-btn').forEach(b => {
            b.addEventListener('click', () => {
                order.n = Math.max(1, Math.min(order.n + parseInt(b.dataset.d, 10), order.max));
                syncOrderHud();
            });
        });
        orderHud.querySelector('.moh-no').addEventListener('click', () => { closeOrder(); render(); });
        orderHud.querySelector('.moh-go').addEventListener('click', () => confirmOrder(player, path));
    }

    // Solo i numeri: si chiama a ogni tacca del cursore, non deve ricostruire nulla.
    function syncOrderHud() {
        const t = order.target;
        orderHud.querySelector('.moh-n').textContent = order.n;
        const range = orderHud.querySelector('.moh-range');
        if (range.value !== String(order.n)) range.value = String(order.n);
        const odds = orderHud.querySelector('.moh-odds');
        if (!odds) return;
        const f = forecast(R.engine.path(order.fromId), order.n, t);
        // Con la ventura in campo il cursore mostra la banda: è lì che il
        // giocatore decide quanti uomini mandare, ed è lì che deve vedere che
        // quel numero è meno saldo del solito (§5.3).
        odds.textContent = f.banda
            ? '~' + f.p + '% di vittoria (' + f.min + '–' + f.max + '%)'
            : f.p + '% di vittoria';
        odds.title = mercNote(f);
        odds.className = 'moh-odds ' + (f.p >= 60 ? 'good' : f.p >= 40 ? 'even' : 'bad');
    }

    // La conferma resta: attacco e spostamento non si annullano. Il testo è lo
    // stesso dell'elenco nel pannello — la regola sta in un posto solo, la
    // strada per arrivarci sono due.
    function confirmOrder(player, path) {
        const t = order.target;
        const n = order.n;
        if (order.kind === 'sposta') {
            const to = t.id;
            R.confirm({
                title: 'Spostare a ' + t.label + '?',
                text: n + (n === 1 ? ' soldato lascia ' : ' soldati lasciano ') + R.provinceLabel(path) +
                    ' per ' + t.label + '. È l\'unico spostamento del turno: dopo non se ne fanno altri.',
                ok: '➜ Sposta'
            }, () => { closeOrder(); run(GA().finalMove(player, path.id, to, n)); });
            return;
        }
        askAttack(player, path, t, n);
    }

    // Bersagli della fase in corso: accende le province sulla mappa, disegna le
    // frecce e tiene l'indice per il clic. Gira a ogni render — i bersagli
    // cambiano dopo ogni conquista.
    function syncMapOrders(player) {
        orderTargets = new Map();
        const path = selectedProvId ? R.engine.path(selectedProvId) : null;
        const mio = path && R.engine.owner(path) === player.name;
        const f = phase(player);
        const inFase = isPlaying(player) && !player.conquista && viewPhase(player) === f;
        const attivo = mio && inFase;

        // SPIE (§9.3): l'unico ordine che non parte da una provincia propria —
        // si sceglie solo la meta. Accendono la mappa mentre si sta scegliendo,
        // e sono tante apposta: quel che si illumina è esattamente l'anello di
        // mondo che non si vede ma si può raggiungere.
        if (inFase && f === 'costruisci' && spyPicking && spyChoices.length) {
            spyChoices.forEach(t => orderTargets.set(t.id, {
                id: t.id, label: t.label, dist: t.dist, kind: 'spia'
            }));
            R.clearAttackArrows();
            R.markTargets(null, spyChoices.map(t => t.id), 'spia');
            return;
        }

        // SPOSTAMENTO, primo clic: finché la partenza non è scelta si accendono
        // le province DA CUI si può muovere. Non entrano in `orderTargets` —
        // sono selezioni, non ordini — quindi il clic segue la strada normale e
        // le arma. È l'unico modo perché il primo clic della fase sia già
        // quello buono invece dell'eredità dell'attacco appena chiuso.
        if (inFase && f === 'sposta' && !player.spostamentoFatto && !moveOriginPath(player)) {
            const origini = GA().moveOrigins(player);
            R.clearAttackArrows();
            R.markTargets(null, origini.map(t => t.id), 'partenza');
            return;
        }

        if (!attivo || (f !== 'attacca' && f !== 'sposta')) {
            R.clearAttackArrows();
            R.clearTargets();
            return;
        }

        let scelti = [];
        if (f === 'attacca' && spareOf(path)) {
            // I bersagli seguono la nave scelta: via terra i confinanti, con uno
            // scafo quel che QUELLO scafo raggiunge (§9.2).
            const targets = GA().attackTargets(player, path.id);
            scelti = attackVessel
                ? targets.filter(t => t.viaMare && t.scafi.indexOf(attackVessel) >= 0)
                : targets.filter(t => !t.viaMare);
        } else if (f === 'sposta' && !player.spostamentoFatto && spareOf(path)) {
            scelti = GA().moveTargets(player, path.id);
        }

        scelti.forEach(t => orderTargets.set(t.id, t));

        // Un Veliero tocca oltre cento province: accenderle tutte nasconderebbe
        // proprio quel che si vuole vedere. Sopra la soglia si rinuncia al
        // disegno (l'elenco del pannello le mostra comunque tutte), ma il clic
        // resta valido — se una si trova, funziona.
        const disegnabili = scelti.length <= ORDER_MAX_MARKS ? scelti : [];
        R.markTargets(path.id, disegnabili.map(t => t.id), f);
        R.showAttackArrows(path.id, disegnabili.slice(0, 12).map(t => t.id), f);
    }

    // ---------- esito battaglia ----------

    function caduti(n) { return n ? '−' + n + ' caduti' : 'nessun caduto'; }

    // COME HA RESO LA VENTURA (§5.3). È la sola parte dell'esito che il giocatore
    // non può dedurre da quel che vede: il tiro di tenuta è già stato fatto, e
    // spiega perché una battaglia data per vinta è andata storta (o viceversa).
    function mercLine(L) {
        const b = L.battle;
        if (!b || (!b.mercA && !b.mercD)) return '';
        const resa = (rho) => Math.round(rho * 100) + '%';
        const voci = [];
        if (b.mercA) voci.push(b.mercA + ' dei tuoi hanno reso il ' + resa(b.rhoA));
        if (b.mercD) voci.push(b.mercD + ' dei suoi hanno reso il ' + resa(b.rhoD));
        return '<div class="bb-merc">⚑ Ventura in campo: ' + voci.join(' · ') + '.</div>';
    }

    // Rapporto di battaglia: i due schieramenti a confronto, con quanti sono
    // partiti, quanti sono caduti e quanti sono rimasti in piedi. È il posto dove
    // il giocatore torna a leggere con calma quello che sulla mappa è durato 3".
    function renderBattle() {
        const box = $('bp-battle');
        const title = $('bp-battle-title');   // il capitolo 1.3 esiste solo se c'è una battaglia
        if (!lastBattle || !lastBattle.battle) {
            box.style.display = 'none';
            if (title) title.style.display = 'none';
            return;
        }
        if (title) title.style.display = '';

        const L = lastBattle;
        const b = L.battle;
        const vinta = b.attackerWins;
        const odds = Math.round(b.P_A * 100);
        // Il terreno del campo di battaglia: spiega perché quel numero è quello.
        const terreno = terrainTag(L.terreno) ? ' · ' + terrainTag(L.terreno) : '';

        box.style.display = 'block';
        box.className = 'bp-battle ' + (vinta ? 'win' : 'lose');
        box.innerHTML = `
            <div class="bb-head">
                <span class="bb-verdict">${vinta ? '⚔ Provincia conquistata' : '🛡 Attacco respinto'}</span>
                <button type="button" class="bb-replay" title="Rivedi lo scontro sulla mappa">↺</button>
            </div>
            <div class="bb-route"></div>
            <div class="bb-sides">
                <div class="bb-side att">
                    <div class="bb-who"></div>
                    <div class="bb-n">${L.engaged} <span>impegnati</span></div>
                    <div class="bb-loss${L.perditeAttaccante ? '' : ' none'}">${caduti(L.perditeAttaccante)}</div>
                    <div class="bb-left">${vinta ? L.superstiti + ' in marcia' : 'nessun superstite'}</div>
                </div>
                <div class="bb-mid">vs</div>
                <div class="bb-side def">
                    <div class="bb-who"></div>
                    <div class="bb-n">${L.defTroops} <span>a difesa</span>${L.fort ? '<em> +' + L.fort + '</em>' : ''}</div>
                    <div class="bb-loss${L.perditeDifensore ? '' : ' none'}">${caduti(L.perditeDifensore)}</div>
                    <div class="bb-left">${!L.defTroops ? 'provincia sguarnita' : vinta ? 'annientati' : L.superstiti + ' ancora in piedi'}</div>
                </div>
            </div>
            <div class="bb-odds">
                <div class="bb-bar"><span style="width:${odds}%"></span></div>
                <div class="bb-odds-txt">probabilità che avevi di vincere: ${odds}%${L.fort ? ' · +' + L.fort + ' di difesa dalle strutture' : ''}${terreno}</div>
            </div>
            ${mercLine(L)}
            ${L.conversione ? '<div class="bb-faith">☩ La provincia si converte: ora è ' +
                L.conversione.label + '</div>' : ''}`;

        box.querySelector('.bb-route').textContent = L.fromLabel + ' → ' + L.toLabel;
        box.querySelector('.bb-side.att .bb-who').textContent = L.attaccante;
        box.querySelector('.bb-side.def .bb-who').textContent = L.difensore;
        if (L.coloreAttaccante) box.querySelector('.bb-side.att').style.borderLeftColor = L.coloreAttaccante;
        if (L.coloreDifensore) box.querySelector('.bb-side.def').style.borderLeftColor = L.coloreDifensore;
        box.querySelector('.bb-replay').addEventListener('click', () => {
            R.fitToProvinces([L.fromId, L.toId]);
            R.playBattleFx(L);
        });
    }

    // ---------- legenda costi ----------
    // Cartellina richiudibile: si genera solo da aperta, così il pannello non
    // paga a ogni render (anche dei bot) un calcolo che nessuno sta guardando.

    $('fold-legend').addEventListener('toggle', () => render());

    function renderLegend(player) {
        const box = $('bp-legend');
        if (!$('fold-legend').open) { box.innerHTML = ''; return; }

        // La legenda si genera da GameRules.COSTS: costi e testo non possono
        // divergere da quelli che la validazione applica davvero.
        const path = selectedProvId ? R.engine.path(selectedProvId) : null;
        const soldiersHere = path ? spareOf(path) : 0;

        box.innerHTML = Object.keys(GR().COSTS).map(type => {
            const cost = GR().COSTS[type];
            const afford = GR().canAfford(player, cost, soldiersHere);
            const stato = afford.ok
                ? '<div class="bp-legend-state ok">Puoi permettertelo</div>'
                : '<div class="bp-legend-state no">' + capitalize(GR().missingText(afford.missing)) + '</div>';
            return `
            <div class="bp-legend-item">
                <div class="bp-legend-head">
                    <span class="bp-legend-name">${pieceName(type)}</span>
                    <span class="bp-legend-cost">${GR().formatCost(cost)}</span>
                </div>
                <div class="bp-legend-eff">${GR().EFFECTS[type] || ''}</div>
                ${stato}
            </div>`;
        }).join('') +
            '<div class="bp-empty-hint">I costi in soldati si pagano sulla provincia selezionata, ' +
            'e uno resta sempre a presidiarla' +
            (path ? ' (' + R.provinceLabel(path) + ': ' + soldiersHere + ' spendibili su ' +
                R.countPiece(path, 'soldato') + ')' : '') + '.</div>';
    }

    function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

    // ---------- render principale ----------

    function snapshotProvinces(player) {
        return R.ownedPaths(player.name).map(path => ({
            id: path.id,
            resource: R.resourceKeyOf(path) || null,
            pieces: R.piecesOf(path)
        }));
    }

    // ---------- editti dell'admin (GameActions.decree) ----------
    // L'admin interviene fuori dal turno del giocatore: truppe che partono per la
    // crociata, province che cambiano padrone, carestie. Il giocatore lo scopre
    // QUI, all'apertura del proprio turno, con la stessa pergamena delle
    // fondazioni. Non appena l'ha vista si segna `letto` e si salva: un editto si
    // srotola una volta sola, ma finché non lo si è visto resta in coda anche
    // dopo un ricaricamento della pagina.
    function showPendingEditti(player) {
        const attesa = (player.editti || []).filter(e => !e.letto);
        if (!attesa.length || !R.showFoundation) return;
        // Solo nel proprio turno: mentre si guardano giocare gli altri l'editto
        // interromperebbe la partita di qualcun altro.
        if (!isPlaying(player)) return;

        attesa.forEach(e => { e.letto = true; });
        R.save();

        // Più editti nello stesso intervallo si leggono in una pergamena sola,
        // invece di farne comparire una dietro l'altra.
        const primo = attesa[0];
        const anno = (typeof Chronicle !== 'undefined' && Chronicle.yearOfTurn)
            ? Chronicle.yearOfTurn(primo.turno || R.turn())
            : (primo.turno || R.turn());
        R.showFoundation({
            tipo: 'editto',
            anno,
            regno: player.name,
            colore: player.color,
            titolo: primo.titolo || 'Editto',
            testo: attesa.map(e => e.testo).filter(Boolean).join('\n\n'),
            nota: attesa.length > 1 ? attesa.length + ' editti ti attendevano.' : ''
        });
    }

    function render() {
        // In solitaria la plancia segue il turno: se è cambiato regno, enterKingdom
        // ha già rifatto il render e questo va lasciato cadere.
        if (followTurn()) return;
        const player = currentPlayer();
        if (!player) return;

        const paths = R.ownedPaths(player.name);
        const snapshot = snapshotProvinces(player);
        const units = KingdomStats.countUnits(snapshot);
        const capitalPath = R.getCapitalPathFor(player);
        const connectedSet = GA().connectedOf(player);
        const pop = capitalPath ? R.computePopularity(player, capitalPath, connectedSet) : null;

        syncEditorLink();
        renderTopbar(player, paths);
        renderPrestige(player);
        renderPopEffect(pop);
        renderPhases(player);
        renderDeployPanel(player);
        renderSelected(player, connectedSet);
        // Spie (§9.3): i bersagli si calcolano UNA volta per render — li leggono
        // sia il pannello sia la mappa (syncMapOrders), e il conto costa una
        // visita del grafo dei confini.
        if (!inPhase(player, 'costruisci')) spyPicking = false;
        spyChoices = spyPicking ? GA().spyTargets(player) : [];
        renderSpies(player);
        renderTrade(player);
        renderConquest(player);
        renderBattle();
        renderMove(player);
        renderProvinceList(player, paths, connectedSet);
        renderKingdoms(player);
        renderAiLog();
        renderMapHud(player);
        // Prima si accendono i bersagli sulla mappa, poi si disegna il cursore
        // d'ordine: renderOrderHud legge `orderTargets` per capire se l'ordine
        // aperto è ancora valido.
        syncMapOrders(player);
        renderOrderHud(player);
        renderTreasury(player, units, snapshot, connectedSet, pop);
        renderArmy(paths, units, pop, capitalPath, connectedSet);
        renderLegend(player);

        // Cartella aperta ≠ fase in corso: i comandi di quella cartella si
        // spengono in blocco. L'elenco delle province resta vivo apposta —
        // i suoi + e − esistono solo nella fase 1 vera, e da lì si seleziona
        // una provincia anche mentre si sbircia un'altra cartella.
        if (peeking(player)) {
            ['fase-schiera', 'fase-commerci', 'fase-spie', 'fase-sposta', 'bp-actions'].forEach(id => freeze($(id)));
        }

        if (!hasFitted && paths.length && R.mapReady()) {
            hasFitted = R.fitToProvinces(paths.map(p => p.id));
        }

        // In coda al render: la pergamena non deve rubare il focus ai comandi
        // mentre la plancia si sta ancora ridisegnando (stessa ragione per cui
        // le fondazioni si srotolano dopo render() in run()).
        showPendingEditti(player);
    }

    // ---------- selezione dalla mappa ----------

    // Un clic sulla mappa è una SELEZIONE o un ORDINE, e a deciderlo è la
    // provincia: se è accesa come bersaglio della fase in corso (orderTargets)
    // il clic apre il cursore d'ordine invece di spostare la selezione. È il
    // motivo per cui la selezione non si perde a metà di un attacco.
    document.addEventListener('click', (e) => {
        const path = e.target.closest && e.target.closest('path.state');
        if (!path) return;
        if (orderTargets.has(path.id)) { openOrder(path.id); return; }
        closeOrder();
        // Fase di spostamento: questo clic è la PARTENZA (le mete sono già
        // ordini, e sono state intercettate sopra). Ricliccare la partenza la
        // libera, così cambiarla costa un clic e non serve passare da una
        // provincia altrui per sbloccarsi.
        const pl = currentPlayer();
        if (pl && isPlaying(pl) && phase(pl) === 'sposta' && viewPhase(pl) === 'sposta') {
            moveArmed = (selectedProvId !== path.id || !moveArmed) && canBeMoveOrigin(pl, path);
        }
        selectedProvId = path.id;
        render();
    }, true);

    // ---------- avvio ----------

    R.onRefresh = render;

    // I turni dell'IA (js/bot.js) arrivano qui: la mappa si ridisegna da sola
    // (ogni azione chiama refresh), a noi resta da raccontare cosa è successo e,
    // in vista generale, da seguire la battaglia con l'inquadratura.
    if (window.Bot) {
        window.Bot.onEvent = (evt) => {
            if (!evt) return;
            if (evt.type === 'start') { aiLog(evt.player, null); return; }
            if (evt.type === 'action') { aiLog(evt.player, evt.result); return; }
            // Fine turno di un bot: a giro finito può portare razzie delle terre
            // di nessuno (gli scismi si srotolano da soli in app.js).
            if (evt.type === 'end') { if (evt.result && evt.result.razzie) reportRaids(evt.result.razzie); return; }
            if (evt.type === 'idle') { render(); }
        };
    }

    function boot(attempt) {
        let player = resolvePlayer();
        // In solitaria non c'è un regno "tuo" e la plancia si apre senza codice
        // d'invito: si entra in quello di turno, e da lì i turni si seguono da sé.
        if (!player && soloGame()) {
            const t = R.turnoDi();
            player = R.players().find(p => p.id === t) || null;
        }
        if (player) {
            enterKingdom(player);
            syncSpectateBtn();
            syncSpeedBtn();
            // Se al caricamento tocca a un regno dell'IA, la partita riparte da sé.
            if (window.Bot) window.Bot.run();
            return;
        }
        if (attempt < 12) { setTimeout(() => boot(attempt + 1), 120); return; }
        showPicker();
    }
    boot(0);
});

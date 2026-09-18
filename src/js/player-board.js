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
    // Arrivati col codice d'invito (?p=CODICE): quel link comanda UN regno solo.
    // La plancia resta inchiodata a quel regno — non segue i turni degli altri
    // (fondamentale nel multiplayer vero: ogni player ha il suo link) e nasconde
    // i comandi che permetterebbero di uscirne (cambia regno, mappa generale,
    // editor). Falso in solitaria e nella partita mista, aperte senza codice.
    let invitePinned = false;
    let hasFitted = false;
    // Cronache storiche (js/chronicles.js): il turno per cui abbiamo GIÀ valutato
    // il catalogo per un regno, per id regno. Solo ottimizzazione (render gira di
    // continuo): evita di ricostruire il contesto-situazione a ogni ridisegno.
    const chronicleCheckedAt = {};
    let selectedProvId = null;
    // Chiave del turno per cui è già stata azzerata la selezione ereditata
    // (id regno + numero di turno): vedi il blocco "Turno nuovo" in render().
    let lastTurnKey = null;
    let lastBattle = null;
    // Esito dell'ultima battaglia: la scheda è OPZIONALE e non si apre mai da
    // sola (richiesta dell'utente). Resta chiusa finché non la si apre col
    // pulsante, e ogni nuova battaglia la richiude — non deve saltare fuori.
    let battleOpen = false;
    // Con che cosa si parte all'attacco (§9.2): null = via terra, altrimenti il
    // tipo di scafo scelto. Si azzera da sé quando cambia la provincia di
    // partenza — una nave scelta in Normandia non ha senso partendo da Napoli.
    let attackVessel = null;
    let attackVesselProv = null;
    // SPEDIZIONE OLTREMARE (§9.2, rotte lunghe): la direzione scelta nel lanciatore
    // e la rotta che si sta impostando per una spedizione già in mare. Si tengono
    // qui perché render() ricostruisce l'HTML a ogni azione (anche dei bot).
    let expedDir = null;

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
    // Diplomazia (§Diplomazia): a chi propongo e che patto. `consenso` è la
    // provincia scelta nel riquadro "concedi attacco", per partner.
    const diploUI = { verso: null, tipo: 'alleanza', consenso: {} };

    // CHAT fra i giocatori (proposta dell'utente): rende viva l'attesa fra i turni.
    // I messaggi arrivano dal canale `chat` di sync.js e vivono qui; il trasporto
    // NON è stato di gioco (come la presenza). `chatChannel` è il canale aperto:
    // 'all' = tutti, 'priv:<idRegno>' = filo privato con un regno (foglio 🕊 /
    // scorciatoia dalla scheda del regno). `chatSeen` ricorda l'ultimo messaggio
    // letto per canale, così il pallino sul dock conta solo il non letto — sta nel
    // localStorage del browser (è una comodità di chi guarda, non stato di partita).
    let chatMessages = [];
    let chatChannel = 'all';
    let chatSeen = {};
    try { chatSeen = JSON.parse(localStorage.getItem('risiko_chat_seen') || '{}') || {}; } catch (e) { chatSeen = {}; }
    // Voci dei bot: al più una battuta per turno di bot, per non intasare la chat.
    let botChatTurn = -1;
    // RISPOSTE dei bot in chat (regola dell'utente): i messaggi già considerati (per
    // non rispondere due volte allo stesso, né alla storia al primo caricamento) e
    // il momento dell'ultima replica (freno anti-spam). `chatAnswered` null = non
    // ancora seminato con lo storico.
    let chatAnswered = null;
    let lastBotReplyAt = 0;

    // ============================================================
    // LA SCENA: mappa piena, il turno agganciato, i fogli sopra
    //
    // (richiesta dell'utente) I pannelloni non si spartiscono più lo schermo con
    // la mappa. Adesso:
    //   · la MAPPA è il fondo e prende tutto lo spazio che c'è;
    //   · il PANNELLO DEL TURNO è una colonna snella a destra, che si apre e si
    //     chiude con la sua linguetta — chiusa, la mappa si prende anche quella;
    //   · CORONA, DIPLOMAZIA e MERCATO non sono più colonne: sono PULSANTI del
    //     dock (dentro la cornice della mappa) che aprono un foglio sull'INTERA
    //     VISUALE, uno per volta;
    //   · i COSTI ED EFFETTI sono un POP-UP che si apre e si chiude in qualunque
    //     momento, anche sopra un foglio, invece di essere una cartella in fondo
    //     a un pannello che scorre e che una volta aperta resta lì.
    // Un foglio per volta ed Esc che chiude: è la regola che toglie la
    // confusione di prima, quando restavano aperte tre cose insieme.
    // ============================================================

    const rightPanel = $('board-right');
    const mainEl = $('board-main');
    const wideQuery = window.matchMedia('(min-width: 1200px)');
    const isWide = () => wideQuery.matches;

    // La mappa non è più in una griglia a colonne fisse: niente da compensare nel
    // viewBox. La chiamata serve comunque a rifare il fit quando la mappa cambia
    // misura — ed è proprio quello che succede aprendo o chiudendo il turno.
    function syncViewInsets() { R.setViewInsets(0, 0); }

    // ---------- la colonna del turno ----------

    function rightOpen() { return !rightPanel.classList.contains('collapsed'); }

    function syncRightTab() {
        const tab = $('board-right-tab');
        if (!tab) return;
        const open = rightOpen();
        // La freccia punta dove va il pannello: aperto, dove sparirà; chiuso, da
        // dove tornerà.
        tab.textContent = open ? '▶' : '◀';
        tab.title = (open ? 'Nascondi' : 'Mostra') + ' il pannello del turno';
        // Aperto il pannello, la chiamata non serve più: la spegne qui e non al
        // prossimo render, se no la linguetta continua a pulsare a vuoto.
        if (open) tab.classList.remove('now');
    }

    function setRightOpen(open) {
        rightPanel.classList.toggle('collapsed', !open);
        syncRightTab();
        // La mappa ha appena cambiato larghezza: si reinquadra dopo che il
        // layout si è assestato, altrimenti misura la colonna vecchia.
        requestAnimationFrame(syncViewInsets);
    }

    const rightTab = $('board-right-tab');
    if (rightTab) rightTab.addEventListener('click', () => setRightOpen(!rightOpen()));

    // ---------- i fogli del dock ----------

    const sheetsEl = $('board-sheets');
    const costsPop = $('bp-costs-pop');
    const dockButtons = Array.from(document.querySelectorAll('#board-dock .dock-btn[data-sheet]'));
    let openSheet = null;      // 'corona' | 'diplomazia' | 'mercato' | null
    let costsOpen = false;

    function syncDock() {
        dockButtons.forEach(b => b.classList.toggle('on', b.dataset.sheet === openSheet));
        const costi = $('dock-costi');
        if (costi) costi.classList.toggle('on', costsOpen);
    }

    // Apre `name`, o lo chiude se era già quello aperto. null chiude e basta.
    function showSheet(name) {
        openSheet = (name && name !== openSheet) ? name : null;
        if (sheetsEl) {
            sheetsEl.style.display = openSheet ? '' : 'none';
            sheetsEl.querySelectorAll('.sheet').forEach(s => {
                s.style.display = (s.dataset.sheet === openSheet) ? '' : 'none';
            });
            // La DIPLOMAZIA non copre tutto: parla con la mappa (i confini si
            // accendono passando sopra una scheda), quindi le lascia una
            // striscia scoperta e non oscura il fondo — vedi .sheet-diplo in
            // board.css. Gli altri fogli restano a tutta visuale.
            // Diplomazia e chat non coprono la mappa: la prima parla con la mappa,
            // la seconda si legge guardando i bot giocare durante l'attesa.
            sheetsEl.classList.toggle('peek', openSheet === 'diplomazia' || openSheet === 'chat');
        }
        syncDock();
        // Un foglio che si apre non deve mostrare i numeri di dieci turni fa:
        // alcune sezioni si disegnano solo quando sono in vista (costa meno).
        if (openSheet && currentPlayer()) render();
    }

    function showCosts(on) {
        costsOpen = !!on;
        if (costsPop) costsPop.style.display = costsOpen ? '' : 'none';
        syncDock();
        const p = currentPlayer();
        if (costsOpen && p) renderLegend(p);
    }

    dockButtons.forEach(btn => btn.addEventListener('click', () => showSheet(btn.dataset.sheet)));
    if ($('dock-costi')) $('dock-costi').addEventListener('click', () => showCosts(!costsOpen));
    if ($('sheet-backdrop')) $('sheet-backdrop').addEventListener('click', () => showSheet(null));
    document.querySelectorAll('#board-sheets .sheet-close')
        .forEach(b => b.addEventListener('click', () => showSheet(null)));
    if (costsPop) {
        const x = costsPop.querySelector('.sheet-close');
        if (x) x.addEventListener('click', () => showCosts(false));
    }

    // "Vedi sulla mappa" di un obiettivo (§10): il foglio 👑 copre la mappa e un
    // obiettivo dice "possiedi N province di un GRUPPO" — il giocatore non sa
    // quali siano. Il bottone chiude il foglio e accende quelle province
    // (Risiko.spotlightObjective). Listener DELEGATO sul contenitore (che resta),
    // perché renderObjectives ne riscrive l'innerHTML a ogni giro.
    if ($('bp-objectives')) {
        $('bp-objectives').addEventListener('click', (e) => {
            const b = e.target.closest && e.target.closest('.bo-map');
            if (!b || !R.spotlightObjective) return;
            const ids = (b.dataset.ids || '').split(',').filter(Boolean);
            if (!ids.length) return;
            showSheet(null);
            R.spotlightObjective(ids);
        });
    }

    // Esc chiude una cosa per volta, dalla più superficiale: prima il pop-up dei
    // costi (che può stare sopra un foglio), poi il foglio.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (costsOpen) { showCosts(false); return; }
        if (openSheet) showSheet(null);
    });

    // ---------- chat: sottoscrizione e invio ----------
    // Il canale `chat` (sync.js) ri-emette l'ultimo elenco a chi si iscrive dopo la
    // prima consegna: un nuovo messaggio ridipinge subito la chat, anche a metà
    // attesa fra i turni, senza passare da un refresh dello stato di gioco.
    if (typeof MultiplayerSync !== 'undefined' && MultiplayerSync.onChatChange) {
        MultiplayerSync.onChatChange(msgs => {
            chatMessages = Array.isArray(msgs) ? msgs : [];
            // I bot rispondono a chi li nomina in chat (solo il browser che li muove).
            handleIncomingChat(chatMessages);
            const p = currentPlayer();
            if (p) renderChat(p);
        });
    }

    // La barra dei canali si ridisegna a ogni render: la delega sta sul contenitore
    // fisso, che resta.
    if ($('chat-channels')) {
        $('chat-channels').addEventListener('click', (e) => {
            const b = e.target.closest && e.target.closest('.chat-chan');
            if (!b) return;
            chatChannel = b.dataset.chan || 'all';
            const p = currentPlayer();
            if (p) renderChat(p);
            const inp = $('chat-input');
            if (inp) inp.focus();
        });
    }

    if ($('chat-form')) {
        $('chat-form').addEventListener('submit', (e) => {
            e.preventDefault();
            sendChatMessage();
        });
    }

    // ---------- stato di partenza: SOLO LA MAPPA (richiesta dell'utente) ----------
    // Si apre sulla mappa piena col dock dei pulsanti: niente pannelli addosso.
    // Il turno lo si apre con la linguetta, e quando tocca a te la linguetta si
    // accende (classe `now`, vedi renderTopbar) così non la si cerca.
    rightPanel.classList.add('collapsed');
    syncRightTab();
    syncDock();

    // VISTA GENERALE = SOLO LA MAPPA: entrando in spettatore si chiude tutto e la
    // mappa si prende lo schermo; la barra in alto resta (turno, viste, velocità
    // dell'IA). Lo stato di prima si ricorda, perché chiudere il turno è anche un
    // gesto manuale: rientrando nel regno non si riapre quel che era chiuso.
    let rightBeforeSpectate = null;

    function syncPanelsForSpectate(on) {
        if (on) {
            if (rightBeforeSpectate === null) rightBeforeSpectate = rightOpen();
            showSheet(null);
            showCosts(false);
            setRightOpen(false);
        } else {
            const was = rightBeforeSpectate;
            rightBeforeSpectate = null;
            setRightOpen(was === null ? false : was);
        }
    }

    // ---------- sezioni del pannello destro a fisarmonica ----------
    // Richiesta dell'utente: le sezioni si aprono come un menù — aprendone una
    // (Spie, Le tue province, i "Tutti i bersagli" di attacco e spostamento) le
    // altre si chiudono, così il pannello mostra una cosa per volta. La legenda
    // dei costi non è più in questo gruppo perché non è più una cartella: è il
    // pop-up 📜 del dock, che si apre e si chiude senza toccare nient'altro.
    // Ascolto in fase di CATTURA perché l'evento `toggle` non fa bubbling: così
    // una sola delega copre anche le cartelle create a ogni render.
    rightPanel.addEventListener('toggle', (e) => {
        const d = e.target;
        if (!d || d.nodeName !== 'DETAILS' || !d.classList.contains('bp-fold')) return;
        if (!d.open) return;
        rightPanel.querySelectorAll('details.bp-fold[open]').forEach(other => {
            if (other !== d) other.open = false;
        });
    }, true);

    // Cambiata la larghezza dello schermo la mappa cambia misura (sotto i 1200px
    // la colonna del turno diventa una tendina sovrapposta): si reinquadra.
    const onWideChange = () => { requestAnimationFrame(syncViewInsets); };
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
        battleOpen = false;
        conquestPromptFor = null;
        R.clearAttackArrows();
        R.clearTargets();
        closeOrder();
        try { sessionStorage.setItem('risiko_board_player', String(player.id)); } catch (e) { /* privato */ }
        $('board-picker').style.display = 'none';
        R.focusPlayer(player.id);
        // Arrivato col link d'invito: si segna che QUESTA persona ha preso il regno,
        // così l'editor dell'admin lo mostra (la scrittura la salta da sé se è
        // l'admin che apre col 👁 — vedi Risiko.markPresence). Solo col pin: senza
        // codice (solitaria/mista) non c'è un giocatore remoto da segnare.
        if (invitePinned && R.markPresence) R.markPresence(player);
        syncViewInsets();
        render();
    }

    // ---------- più regni tuoi (solitaria o "seguo N regni, gli altri IA") --------
    // Se il giocatore controlla PIÙ D'UN regno, la plancia segue il turno da sé:
    // chiuso il turno di un regno umano si entra nel prossimo regno umano, invece di
    // doverlo cercare col cambio regno. Vale sia per la solitaria (tutti i regni
    // tuoi) sia per la partita mista (2+ regni tuoi, gli altri governati dall'IA):
    // in quest'ultima i turni dei bot li gioca `Bot.run()` e la plancia li salta,
    // riprendendo il comando appena tocca a un umano. Non è una modalità a parte —
    // è la stessa plancia, con lo stesso motore: si passa da enterKingdom come un
    // giocatore qualunque, quindi la NEBBIA resta quella del regno in cui si entra.
    function humanPlayers() {
        const players = R.players();
        if (!players.length || !window.Bot) return [];
        return players.filter(p => !window.Bot.isBot(p));
    }

    // La plancia segue i turni solo quando i regni umani sono più d'uno. Con un
    // solo umano (partita normale) resta ferma sul suo regno, raggiunto col codice
    // d'invito; con zero umani (editor) non c'è niente da seguire.
    function followEnabled() {
        return humanPlayers().length >= 2;
    }
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
        // Col codice d'invito si comanda un regno solo: mai seguire i turni altrui.
        if (invitePinned) return false;
        if (t === lastFollowed) return false;   // si sta guardando un altro regno apposta
        if (!followEnabled()) return false;
        const next = R.players().find(p => p.id === t);
        if (!next) return false;
        // Turno di un bot: lo gioca Bot.run(), la plancia non ci si sposta sopra
        // (mostrerebbe un regno che non è tuo). Si resta dove si è finché il giro
        // non riporta il comando a un regno umano.
        if (window.Bot && window.Bot.isBot(next)) return false;
        // Un regno affidato a un PLAYER remoto (controllo 'player') lo gioca LUI dal
        // suo ?p=CODICE, non la plancia dell'admin che segue i turni: si salta, come
        // un bot. Così la plancia senza codice diventa "la plancia dei regni che
        // gestisco io" (admin + regni d'evento/editor, tutti controllo 'admin'),
        // hoppando fra i miei turni e lasciando i turni altrui alle loro plance
        // agganciate — niente due scritture sullo stesso regno (regola dell'utente:
        // baseline multiplayer stabile).
        if (next.controllo === 'player') return false;
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
        invitePinned = false;
        const code = new URLSearchParams(location.search).get('p');
        if (code) {
            // Col codice d'invito si comanda QUEL regno e nessun altro. I codici
            // arrivano con l'autosave, DOPO che i record dei regni esistono già:
            // se il codice non è ancora risolvibile si torna null e `boot`
            // RITENTA — mai ripiegare sul sessionStorage, che aprirebbe il regno
            // di un test precedente (era esattamente questo il bug: al primo giro
            // di boot gli inviti erano undefined, quindi si finiva sul regno
            // salvato nel sessionStorage invece che su quello del link).
            const byInvite = R.playerByInvite(code);
            if (byInvite) { invitePinned = true; return byInvite; }
            return null;
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
        // Un giocatore arrivato col codice d'invito comanda UN regno solo: la sua
        // visuale non ha "cambia regno", "mappa generale" né il ritorno all'editor
        // (regola dell'utente) — quel link vale per il suo regno e basta. In
        // solitaria o nella partita mista (aperte senza codice) i tre comandi
        // restano: lì servono a seguire i bot e a passare da un regno all'altro.
        const single = invitePinned;
        const editor = $('board-editor-link');
        if (editor) editor.style.display = (R.isAdmin() && !single) ? '' : 'none';
        const sw = $('board-switch');
        if (sw) sw.style.display = single ? 'none' : '';
        const spec = $('board-spectate');
        if (spec) spec.style.display = single ? 'none' : '';
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
    // game-actions.js, che è quello che accende la mappa.) Vale una meta qualsiasi:
    // confinante via terra o costa propria raggiunta da una nave ancorata qui.
    function canBeMoveOrigin(player, path) {
        if (!path || R.engine.owner(path) !== player.name || !spareOf(path)) return false;
        return GA().moveTargets(player, path.id).length > 0;
    }

    // Esegue un'azione e ridisegna. Le azioni chiamano gia' Risiko.save() e
    // refresh(), che riporta qui via onRefresh: basta mostrare il messaggio.
    function run(result) {
        if (!result) return;
        if (result.battle) {
            lastBattle = result;
            battleOpen = false;   // mai proposta da sola: la scheda resta chiusa
            // Scena sulla mappa, ma nessuna inquadratura: la vista è del
            // giocatore, si sposta solo quando la sposta lui (zoom, trascinamento
            // o il bottone ↺ del rapporto di battaglia).
            R.playBattleFx(result);
        }
        // L'ESITO ARRIVA DOPO (richiesta dell'utente): con una battaglia in
        // corso il messaggio non compare subito — direbbe com'è finita mentre
        // le lame stanno ancora correndo. Si aspetta il verdetto sulla mappa
        // (fx-verdict, ~1,75s in playBattleFx) e si esce insieme a lui.
        clearTimeout(run._notice);
        if (result.battle) {
            run._notice = setTimeout(() => showNotice(result.msg, result.ok), 1900);
        } else {
            showNotice(result.msg, result.ok);
        }
        render();
        // La nascita di una città (o di una capitale) è un fatto di cronaca: si
        // srotola la pergamena (showFoundation in app.js). Dopo il render,
        // altrimenti il ridisegno della plancia ruba il focus al bottone.
        if (result.fondazione && R.showFoundation) {
            R.showFoundation(result.fondazione);
        }
        // Eco storica di una battaglia: si aspetta che la scena sulla mappa sia
        // finita, altrimenti la pergamena coprirebbe proprio il colpo che il
        // giocatore stava guardando. Quanto duri lo dice app.js (battleFxMs),
        // qui non si indovina un numero.
        if (result.cronaca && R.showFoundation) {
            clearTimeout(run._eco);
            const attesa = result.battle ? (R.battleFxMs ? R.battleFxMs() : 3900) : 0;
            run._eco = setTimeout(() => R.showFoundation(result.cronaca), attesa);
        }
        // Razzie delle terre di nessuno di fine giro (il proprio Fine turno).
        if (result.razzie) reportRaids(result.razzie);
        // CONQUISTA da decidere: la modale di ripartizione si arma QUI, dal
        // risultato dell'attacco, non solo dal ciclo di render (che poteva
        // morire e lasciare la presa risolta d'ufficio — bug dell'utente:
        // l'invasione non concedeva di decidere come spostare le truppe). È
        // legata al giocatore che ha appena attaccato, quindi non dipende da
        // quale regno il render sta mostrando né da corse di sincronizzazione.
        if (result.richiedeConquista) armConquestPrompt(result);
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
            // Se l'ordine è già popolato la partita è PREPARATA e ferma: il
            // giocatore ha aperto il suo link ma l'admin non ha ancora dato il via.
            const pronta = R.ordine && R.ordine().length > 0;
            state.textContent = pronta
                ? 'In attesa che l\'admin avvii la partita'
                : 'Partita non avviata';
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

        // La plancia si apre sulla sola mappa (richiesta dell'utente): quando
        // tocca a te la linguetta del turno si accende, così non la si cerca.
        const tab = $('board-right-tab');
        if (tab) tab.classList.toggle('now', turnoDi === player.id && !rightOpen());
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

    // ---------- urla della battaglia ----------
    // Interruttore del suono (js/audio.js). Come la velocità dell'IA, è una
    // preferenza di CHI GUARDA: sta nel browser (localStorage), non nella
    // partita, e non entra nello stato condiviso.
    (function wireSoundBtn() {
        const b = $('board-sound');
        if (!b) return;
        const A = () => window.RisikoAudio;
        if (!A()) { b.style.display = 'none'; return; }
        function sync() {
            const muto = A().isMuted();
            b.textContent = muto ? '🔇 Muto' : '🔊 Suono';
            b.title = muto ? 'Riaccendi le urla della battaglia' : 'Spegni le urla della battaglia';
            b.classList.toggle('on', !muto);
        }
        b.addEventListener('click', () => {
            const muto = A().toggle();
            // Riacceso, si dà subito una prova: se no non si sa se ha funzionato
            // finché non parte un attacco.
            if (!muto) A().battleCry({ scala: 0.35 });
            sync();
        });
        sync();
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
            text: 'I rinforzi obbligatori rimasti vengono schierati d\'ufficio e si passa al regno successivo.',
            ok: 'Chiudi il turno'
        }, () => {
            run(GA().endTurn());
            // Chiuso il turno umano tocca all'IA: la catena dei bot va avanti da
            // sola e si ferma quando torna il turno di un giocatore umano. Passa dal
            // lease (R.driveBots) così, con più tab admin aperti, ne guida uno solo.
            if (R.driveBots) R.driveBots(); else if (window.Bot) window.Bot.run();
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
        // I COMMERCI non sono più qui: vivono nel foglio ⚖ Mercato, che si
        // consulta in qualunque momento. Non si nascondono fuori fase — si
        // spengono da soli, perché renderTrade misura `inPhase(costruisci)` e
        // disabilita i comandi quando non è il momento.
        $('fase-schiera').style.display = view === 'schiera' ? '' : 'none';
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

    // ---------- Obiettivi di prestigio (§10) ----------
    // Il piano del regno nella corona: le tre medaglie (5/3/2), la spunta
    // AUTOMATICA dal vivo (R.objectivesFor rivaluta a ogni render) e lo storico
    // dei cicli conclusi, sempre consultabile. Contenuto tutto nostro: niente
    // escaping. Se il regno non ha un binario storico, il blocco sparisce.
    // NON archivia più niente da qui: la chiusura di un ciclo è un fatto della
    // partita, non del render, e la fa GameActions.closeCycle a fine giro —
    // prima dipendeva da chi apriva la plancia, e fotografava lo stato di
    // allora invece di quello di fine ciclo.
    const CICLO_ROMANO = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    function medalClass(pts) { return pts >= 5 ? 'm5' : pts >= 3 ? 'm3' : 'm2'; }

    // Il PROGRESSO di un obiettivo (regola dell'utente: "a che punto sei verso il
    // completamento — quanto manca o quante province hai già sul totale"). Il dato
    // è già in evaluate: `misura` = quanto hai adesso, `soglia` = quanto serve.
    // La barra si mostra solo quando c'è un conteggio da riempire (soglia ≥ 2): un
    // obiettivo sì/no — costruisci un Mercato, possiedi una Fortezza — lo dice già
    // la spunta ✓/○, e "0 / 1" non aggiungerebbe nulla.
    function objProgress(o) {
        const cur = o.misura, tgt = o.soglia;
        if (typeof cur !== 'number' || !isFinite(cur) || cur < 0) return '';
        if (typeof tgt !== 'number' || !isFinite(tgt) || tgt <= 1) return '';
        const c = Math.round(cur), t = Math.round(tgt);
        const pct = Math.max(0, Math.min(100, (c / t) * 100));
        const manca = Math.max(0, t - c);
        const cls = o.completato ? ' full' : (manca <= Math.max(1, t * 0.25) ? ' near' : '');
        const coda = o.completato ? 'fatto' : ('manca ' + manca);
        return '<div class="bo-prog' + cls + '">' +
            '<div class="bo-prog-bar"><span style="width:' + pct.toFixed(0) + '%"></span></div>' +
            '<span class="bo-prog-num">' + c + ' / ' + t + '<em>' + coda + '</em></span>' +
        '</div>';
    }

    // Gli id delle province del GRUPPO di un obiettivo, letti dal `hint` (la
    // lettura macchina che objectives.js espone, la stessa che usa bot.js). Un
    // hint può avere `region` (un Set), `provinces` (un array) o `province` (una
    // stringa), e per gli obiettivi combinati (`tutti`) è un array di hint: si
    // scorrono tutti. Vuoto = niente da mostrare sulla mappa (oro, Popolarità…).
    function objRegionIds(hint) {
        const out = [];
        const walk = (h) => {
            if (!h) return;
            if (Array.isArray(h)) { h.forEach(walk); return; }
            if (h.region && h.region.forEach) h.region.forEach(id => out.push(id));
            if (Array.isArray(h.provinces)) h.provinces.forEach(id => out.push(id));
            if (typeof h.province === 'string') out.push(h.province);
        };
        walk(hint);
        return out.filter((id, i) => out.indexOf(id) === i);
    }

    function renderObjectives(player) {
        const box = $('bp-objectives');
        if (!box) return;
        const data = R.objectivesFor ? R.objectivesFor(player) : null;
        if (!data) { box.innerHTML = ''; box.style.display = 'none'; return; }
        box.style.display = '';
        const rows = data.items.map(o => {
            const ids = objRegionIds(o.hint);
            const mapBtn = (ids.length && R.spotlightObjective)
                ? `<button type="button" class="bo-map" data-ids="${ids.join(',')}"
                        title="Chiude il foglio e accende sulla mappa le province di questo obiettivo">🔍 Vedi sulla mappa</button>`
                : '';
            return `
            <div class="bo-item${o.completato ? ' done' : ''}">
                <span class="bo-medal ${medalClass(o.punti)}">${o.punti}</span>
                <div class="bo-body">
                    <div class="bo-top"><span class="bo-chip t-${o.tipo}">${o.tier}</span><span class="bo-title">${o.titolo}</span></div>
                    <div class="bo-desc">${o.descrizione}</div>
                    <div class="bo-check"><span class="bo-mark">${o.completato ? '✓' : '○'}</span> ${o.check}</div>
                    ${objProgress(o)}
                    ${mapBtn}
                </div>
            </div>`;
        }).join('');
        const totale = player.puntiPrestigio || 0;
        // LA LEVA (§10, regola dell'utente): quel che gli obiettivi già compiuti
        // varranno in UOMINI a inizio del ciclo prossimo. È la ricompensa che si
        // sente — il prestigio è una promessa lontana, e oggi pure sospesa —
        // quindi sta in cima, sotto il punteggio, non in fondo alla pagina.
        const lev = (typeof Objectives !== 'undefined' && Objectives.leva)
            ? Objectives.leva(data) : data.punti;
        const levaMax = (typeof Objectives !== 'undefined' && Objectives.leva)
            ? Objectives.leva({ punti: data.puntiMax }) : data.puntiMax;
        box.innerHTML =
            '<div class="bp-title">Prestigio</div>' +
            '<div class="bo-total"><span class="bo-total-num">' + totale + '</span>' +
                '<span class="bo-total-unit">punti accumulati</span>' +
                (data.punti ? '<span class="bo-total-live">+' + data.punti + ' in corso</span>' : '') + '</div>' +
            '<div class="bo-head"><span class="bo-cycle">Obiettivi · Ciclo ' + (CICLO_ROMANO[data.ciclo] || data.ciclo) + '</span>' +
                '<span class="bo-score">' + data.punti + ' / ' + data.puntiMax + '</span></div>' +
            '<div class="bo-leva' + (lev ? ' on' : '') + '">' +
                '<span class="bo-leva-num">+' + lev + '</span>' +
                '<span class="bo-leva-txt">soldati alla leva del Ciclo ' +
                    (CICLO_ROMANO[data.ciclo + 1] || (data.ciclo + 1)) +
                    ' <em>(fino a ' + levaMax + ': un obiettivo compiuto vale i suoi punti in uomini)</em></span>' +
            '</div>' +
            '<div class="bo-list">' + rows + '</div>' +
            objHistoryHtml(player);
    }

    function objHistoryHtml(player) {
        const hist = (player.obiettiviStorico || []).slice().sort((a, b) => a.ciclo - b.ciclo);
        if (!hist.length) return '';
        const cicli = hist.map(h => {
            const items = h.items.map(i =>
                '<div class="bh-item' + (i.completato ? ' done' : '') + '">' +
                    '<span class="bh-mark">' + (i.completato ? '✓' : '✗') + '</span>' +
                    '<span class="bh-pts">' + i.punti + '</span>' +
                    '<span class="bh-title">' + i.titolo + '</span></div>').join('');
            const leva = h.leva ? ' <span class="bh-leva">+' + h.leva + ' soldati</span>' : '';
            return '<div class="bh-cycle"><div class="bh-head">Ciclo ' + (CICLO_ROMANO[h.ciclo] || h.ciclo) +
                ' <span class="bh-score">' + h.punti + ' / ' + h.puntiMax + '</span>' + leva + '</div>' + items + '</div>';
        }).join('');
        return '<details class="bp-fold bo-history"><summary>Storico obiettivi</summary>' +
            '<div class="bp-fold-body">' + cicli + '</div></details>';
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
        const r = KingdomStats.reinforcements(owned.length, units, pop ? pop.totale : null);
        // Nel cruscotto lo spazio è una riga sola: il nome della Capitale basta,
        // "Capitale:" davanti lo mangerebbe tutto (le capitali hanno nomi lunghi).
        // La guardia debole (≤5, §8) si segna qui con ⚠: prima stava nella
        // tessera dei soldati, che ora conta le province.
        const inCap = capitalPath ? R.countPiece(capitalPath, 'soldato') : 0;
        const weakGuard = !!(capitalPath && inCap <= 5);
        const capEl = $('bp-capital');
        capEl.textContent = capitalPath
            ? '⌂ ' + R.provinceLabel(capitalPath) + (weakGuard ? ' ⚠' : '')
            : 'nessuna Capitale';
        capEl.title = capitalPath
            ? 'La Capitale è in ' + R.provinceLabel(capitalPath) + ' (' + inCap + ' di guardia)' +
              (weakGuard ? ' — guardia debole: 5 o meno soldati fanno scendere la Popolarità a 2 (§8)' : '') +
              '. È lei a dare la fede di stato.'
            : 'Senza Capitale non c\'è religione di stato, e il regno non raccoglie nulla';
        capEl.classList.toggle('bad', weakGuard);

        // CRUSCOTTO (richiesta dell'utente): al posto dei soldati, le PROVINCE
        // controllate e, sotto, i RINFORZI che porteranno il prossimo turno — è
        // il numero con cui si decide quanto crescere (province ÷ 3 + edifici +
        // Popolarità, §5.1). L'esercito totale resta nel tooltip.
        setText('bp-soldiers', owned.length);
        const provItem = $('bp-provinces-item');
        if (provItem) provItem.title = owned.length + (owned.length === 1 ? ' provincia controllata' : ' province controllate') +
            ' · esercito: ' + units.soldato + ' soldati · Capitale: ' + inCap + ' di guardia';
        const reinfEl = $('bp-soldiers-cap');
        setText('bp-soldiers-cap', signed(r.total) + ' il prossimo turno');
        reinfEl.className = r.total > 0 ? 'good' : (r.total < 0 ? 'bad' : '');
        reinfEl.title = 'Rinforzi stimati del prossimo turno: ' + r.libere + ' libere, ' +
            r.vincolate + ' obbligatorie (da Capitale, Città, Fortezza)';
        setText('bp-units', units.generale + ' · ' + units.barca + ' · ' + units.vascello);
        setText('bp-buildings', units.citta + ' · ' + units.fortezza + ' · ' + units.mercato);

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
            // Le spedizioni in mare (§9.2) non stanno su una provincia: si comandano
            // anche a selezione vuota, altrimenti sparirebbero appena si deseleziona.
            maybeAppendExpeditions(player, actions);
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
            maybeAppendExpeditions(player, actions);
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
            case 'costruisci': {
                actions.appendChild(buildGroup(player, path, connectedSet));
                actions.appendChild(roadGroup(player, path));
                const demolizione = demolitionGroup(player, path);
                if (demolizione) actions.appendChild(demolizione);
                break;
            }
            case 'attacca':
                actions.appendChild(attackGroup(player, path));
                maybeAppendExpeditions(player, actions);
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

    // ============================================================
    // LE COSTRUZIONI SONO TESSERE-ICONA (richiesta dell'utente)
    //
    // "al posto di un elenco di scritte che dicono cosa puoi o non puoi
    //  costruire, delle icone da cliccare che ti dicono il costo; sempre
    //  evidenziate se già fattibili."
    //
    // Una griglia di tessere invece di righe di testo. Ogni tessera porta la
    // SAGOMA VERA della pedina — gli stessi `<symbol>` che stanno sulla mappa
    // (`#pc-…`, iniettati da app.js in `#pc-defs`), tinti col colore del regno,
    // così quel che si clicca è già quel che si vedrà sulla provincia — il nome
    // e il costo in **gettoni**, non in una frase.
    //
    // Le due regole di lettura, che sono il punto della richiesta:
    //   · FATTIBILE ADESSO = tessera ACCESA (bordo d'oro). È l'unica cosa da
    //     cercare con l'occhio: quel che è spento non si può fare e basta.
    //   · IL GETTONE CHE MANCA È ROSSO. "Perché no" si legge sul costo stesso,
    //     senza aprire la legenda: due Pietra in rosso dicono tutto.
    // Il tooltip porta l'effetto completo (`GameRules.EFFECTS`) per chi vuole
    // il dettaglio; il pop-up 📜 resta per la tabella intera.
    // ============================================================

    // Quale sagoma per quale voce. Mercenario e Guarnigione non hanno una pedina
    // propria — sono soldati: a distinguerli è il bollino sulla tessera.
    const BUILD_SYMBOL = {
        capitale: 'pc-capitale', citta: 'pc-citta', fortezza: 'pc-fortezza',
        mercato: 'pc-mercato', barca: 'pc-barca', vascello: 'pc-vascello',
        generale: 'pc-generale', strada: 'pc-strada',
        mercenario: 'pc-soldato', guarnigione: 'pc-soldato'
    };
    const BUILD_BADGE = { mercenario: '⚔', guarnigione: '⚑' };

    // Le risorse hanno un colore fisso e una sagoma propria (`#res-…`): sono
    // riconoscibili a 14px. Monete e soldati non ce l'hanno e restano glifi.
    const COST_SYMBOL = {
        pietra: 'res-pietra', legno: 'res-legno', grano: 'res-grano',
        bestiame: 'res-bestiame', argilla: 'res-argilla'
    };
    const COST_GLYPH = { monete: '💰', soldati: '⚔' };

    function costChips(cost, missing) {
        const manca = {};
        (missing || []).forEach(m => { manca[m.tipo] = true; });
        return Object.keys(cost || {}).map(k => {
            const ico = COST_SYMBOL[k]
                ? '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#' + COST_SYMBOL[k] + '"></use></svg>'
                : '<span class="bt-glyph">' + (COST_GLYPH[k] || '•') + '</span>';
            return '<span class="bt-cost' + (manca[k] ? ' short' : '') + '">' +
                ico + '<b>' + cost[k] + '</b></span>';
        }).join('');
    }

    // Il "perché no" sulla tessera va in due parole: lo spazio è 112px e il
    // dettaglio completo sta nel tooltip. I messaggi di `canPlacePiece` mettono
    // la spiegazione dopo i due punti — sulla tessera serve la prima metà.
    function tileNote(msg) {
        if (!msg) return '';
        if (/solo su province sul mare/i.test(msg)) return 'solo sul mare';
        if (/ha già una Capitale/i.test(msg)) return 'ne hai già una';
        const testa = msg.split(':')[0].replace(/^Qui c'è/i, 'c\'è').trim();
        return shorten(testa.charAt(0).toLowerCase() + testa.slice(1));
    }

    // `why` spegne la tessera e riempie il tooltip; `opts.nota` è la riga corta
    // che si stampa SULLA tessera — e si mette solo quando il blocco è il POSTO.
    // Quando invece è il prezzo, a dirlo sono già i gettoni rossi: ripeterlo a
    // parole sotto l'icona ricostruirebbe l'elenco di scritte che si voleva
    // togliere (richiesta dell'utente).
    // `opts`: { label, symbol, badge, effetto, nota } per le voci che non sono
    // una pedina qualunque (il trasloco della Capitale, una strada a un vicino).
    function buildTile(player, type, cost, why, missing, onClick, opts) {
        const o = opts || {};
        const nome = o.label || pieceName(type);
        const sym = o.symbol || BUILD_SYMBOL[type] || 'pc-soldato';
        const badge = o.badge !== undefined ? o.badge : BUILD_BADGE[type];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bp-tile ' + (why ? 'no' : 'can');
        b.innerHTML =
            '<span class="bt-ico" style="color:' + player.color + '">' +
            '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#' + sym + '"></use></svg>' +
            (badge ? '<i class="bt-badge">' + badge + '</i>' : '') +
            '</span>' +
            '<span class="bt-name"></span>' +
            '<span class="bt-costs">' + costChips(cost, missing) + '</span>' +
            (o.nota ? '<span class="bt-why"></span>' : '');
        b.querySelector('.bt-name').textContent = nome;
        if (o.nota) b.querySelector('.bt-why').textContent = o.nota;

        const effetto = o.effetto !== undefined ? o.effetto : (GR().EFFECTS[type] || '');
        b.title = nome + ' — ' + (GR().formatCost(cost) || 'gratis') +
            (effetto ? '\n' + effetto : '') +
            (why ? '\n\n✕ ' + why : '\n\n✓ puoi farlo qui, adesso');

        if (why) b.disabled = true;
        else b.addEventListener('click', onClick);
        return b;
    }

    function tileGrid() {
        const grid = document.createElement('div');
        grid.className = 'bp-tiles';
        return grid;
    }

    function buildGroup(player, path, connectedSet) {
        const g = group('Costruisci');
        const soldiersHere = spareOf(path);   // il presidio non si spende
        g.insertAdjacentHTML('beforeend',
            '<div class="bp-army"><span class="bp-army-n">' + soldiersHere + '</span>' +
            '<span class="bp-army-l">soldati spendibili qui · uno resta sempre a presidiare</span></div>');
        // FESTA (§Felicità): se questo turno c'è uno sconto o un bonus attivo lo
        // si dice qui, in testa alle tessere — altrimenti i gettoni scontati
        // sembrerebbero un errore di conto invece che un privilegio guadagnato.
        if ((player.festaRisorse || []).length || player.festaCostruzioneBonus > 0) {
            const nomiRisorse = (player.festaRisorse || []).map(k => GR().RES_LABEL[k] || k);
            const pezzi = [];
            if (nomiRisorse.length) pezzi.push('sconto di 1 su ' + nomiRisorse.join(' e '));
            if (player.festaCostruzioneBonus > 0) pezzi.push('+' + player.festaCostruzioneBonus + ' monete a ogni costruzione pagata');
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint bp-festa">🎭 Festa di quest\'anno: ' + pezzi.join(', ') + '.</div>');
        }

        const grid = tileGrid();

        // La prima Capitale (500 monete, 0 uomini) si costruisce come tutto il
        // resto; ma una volta che il regno ne ha una la voce SPARISCE dalle
        // costruzioni (non se ne fa una seconda) e al suo posto si può spostare
        // il seggio con un'azione a parte, qui sotto.
        const capPath = R.getCapitalPathFor(player);
        GR().BUILDABLE_ON_PROVINCE.forEach(type => {
            if (type === 'capitale' && capPath) return;   // ne ha già una → niente voce
            const cost = GR().costFor(type, player);   // §Felicità: sconto della Festa, se attiva

            const place = R.engine.canPlacePiece(path, type);
            const max = (typeof PIECES !== 'undefined' && PIECES[type] && PIECES[type].max) || 1;
            const gia = R.countPiece(path, type) >= max;
            // L'AFFORDABILITÀ si calcola SEMPRE, anche quando la tessera è già
            // spenta per il posto: i gettoni rossi devono dire cosa manca
            // comunque, se no una Fortezza "già presente" sembrerebbe pagabile.
            const afford = GR().canAfford(player, cost, soldiersHere);

            // Prima il POSTO (è un no secco), poi il PREZZO.
            const why = !place.ok ? place.msg
                : gia ? 'Qui c\'è già ' + pieceName(type) + '.'
                    : afford.ok ? null : GR().missingText(afford.missing);
            const nota = !place.ok ? tileNote(place.msg) : (gia ? 'già presente' : '');

            grid.appendChild(buildTile(player, type, cost, why, afford.missing,
                () => run(GA().build(player, path.id, type)), { nota }));
        });

        // Spostamento della Capitale (500 monete): la vecchia sede diventa Città e
        // la Città di destinazione viene assorbita dal seggio. Compare solo se il
        // regno ha una Capitale e la provincia scelta è propria e diversa dalla
        // Capitale attuale; è possibile SOLO su una propria Città (regola
        // dell'utente: prima si fonda la Città, poi vi si sposta la Capitale).
        if (capPath && R.engine.owner(path) === player.name && path.id !== capPath.id) {
            const cost = GR().COSTS.capitale;
            const afford = GR().canAfford(player, cost, soldiersHere);
            const senzaCitta = R.countPiece(path, 'citta') === 0;
            const why = senzaCitta ? 'Il seggio si trasloca solo su una tua Città.'
                : (afford.ok ? null : GR().missingText(afford.missing));
            grid.appendChild(buildTile(player, 'capitale', cost, why, afford.missing,
                () => run(GA().moveCapital(player, path.id)),
                {
                    label: 'Sposta qui la Capitale', badge: '⇢',
                    nota: senzaCitta ? 'serve una tua Città' : '',
                    effetto: 'Trasloca il seggio su una tua Città: la vecchia sede diventa Città, ' +
                        'la Città di destinazione viene assorbita dalla Capitale.'
                }));
        }

        // Reclutamento: entrambe restano, ma sono due acquisti opposti (§5.3) — la
        // Guarnigione è rinforzo puro, il Mercenario resta ma è di ventura. Prima
        // lo diceva un suffisso nell'etichetta; ora lo dicono il bollino sulla
        // tessera (⚔ ventura, ⚑ rinforzo) e il tooltip, che porta già l'effetto.
        GR().RECRUITABLE.forEach(type => {
            const cost = GR().costFor(type, player);   // §Felicità: sconto della Festa, se attiva
            const afford = GR().canAfford(player, cost, soldiersHere);
            grid.appendChild(buildTile(player, type, cost,
                afford.ok ? null : GR().missingText(afford.missing),
                afford.missing, () => run(GA().recruit(player, path.id, type))));
        });

        g.appendChild(grid);

        if (!connectedSet.has(path.id)) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Questa provincia non è collegata alla Capitale: non produce risorse finché non ci arriva una strada.</div>');
        }
        return g;
    }

    // DEMOLIZIONE (regola dell'utente): giustifica prendere una provincia con un
    // Mercato o una Nave che già hai — invece di restare un insediamento morto
    // (duplicato, §Mercato), si demolisce e si recupera QUALCOSA: mai il pieno
    // valore, o conquistare varrebbe più che costruire da zero.
    //   Mercato → 2 uomini + 100 monete.  Nave → 1 uomo + 1 Legno.
    // SOLO la Nave (barca): il Vascello (4000 monete, rotte lunghe §9.2) non si
    // demolisce — recuperarne un decimo svaluterebbe l'investimento (regola
    // dell'utente).
    // Un bottone semplice (`actionButton`, lo stesso di "Schiera"/"Ritira"), non
    // una tessera-icona: qui non c'è niente da confrontare o da tenere d'occhio
    // per affordabilità, solo un'azione da un click.
    function demolitionGroup(player, path) {
        const mercato = R.countPiece(path, 'mercato') > 0;
        const navi = R.engine.ships(path).filter(s => s.tipo === 'barca');
        if (!mercato && !navi.length) return null;

        const g = group('Demolisci');
        if (mercato) {
            g.appendChild(actionButton('🔨 Demolisci il Mercato', '+2 uomini, +100 monete', null,
                () => run(GA().destroyMarket(player, path.id))));
        }
        navi.forEach(s => {
            g.appendChild(actionButton('🔨 Demolisci la Nave', '+1 uomo, +1 Legno', null,
                () => run(GA().destroyShip(player, path.id, s.tipo))));
        });
        return g;
    }

    // MIGLIORIE CIVICHE (§6.1): Sanità e Felicità. Si costruiscono SULLA Capitale
    // e alzano il Benessere (§8). Compaiono solo quando la provincia selezionata è
    // la Capitale — è lì che si costruiscono, ed è lì che il giocatore le cerca.
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

        // Stesse tessere delle costruzioni (richiesta dell'utente): una per
        // vicino, col nome della provincia sotto la sagoma della strada. Una
        // strada gratuita non ha gettoni da mostrare — il costo è zero e si dice.
        const cost = GR().COSTS.strada;
        const afford = gratis ? { ok: true, missing: [] }
                              : GR().canAfford(player, cost, spareOf(path));
        if (gratis) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Hai ' + gratis +
                (gratis === 1 ? ' strada gratuita: non costa nulla.'
                              : ' strade gratuite: non costano nulla.') + '</div>');
        }

        const grid = tileGrid();
        vicine.forEach(target => {
            grid.appendChild(buildTile(player, 'strada',
                gratis ? {} : cost,
                afford.ok ? null : GR().missingText(afford.missing),
                afford.missing,
                () => run(GA().buildRoad(player, path.id, target.id)),
                {
                    label: R.provinceLabel(target),
                    badge: gratis ? '★' : null,
                    effetto: 'Collega ' + R.provinceLabel(path) + ' a ' + R.provinceLabel(target) +
                        (gratis ? ' — strada gratuita.' : '.')
                }));
        });
        g.appendChild(grid);
        return g;
    }

    // Quanti scafi di un tipo sono ancorati in questa provincia. Serve al tetto di
    // carico combinato (§9.2): due navi imbarcano il doppio (regola dell'utente).
    function vesselCount(path, tipo) {
        if (!path || !tipo) return 0;
        return R.engine.ships(path).filter(h => h.tipo === tipo).length;
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

        // ---- SPEDIZIONE OLTREMARE (§9.2, rotte lunghe) ----
        // Scelto il Veliero, oltre allo sbarco entro la portata si può SALPARE per
        // una rotta lunga: si sceglie una direzione e la nave naviga di turno in
        // turno alla ricerca di una costa. Vive solo qui, sotto il Veliero.
        if (attackVessel === 'vascello' && partenti > 0) {
            const l = expeditionLauncher(player, path, partenti);
            if (l) g.appendChild(l);
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

        // Quanti uomini partono: con le navi il tetto è il carico COMBINATO di
        // tutti gli scafi di quel tipo ancorati qui (§9.2, regola dell'utente: due
        // navi imbarcano il doppio), non l'esercito. Serve sia all'elenco dei
        // bersagli sia a quello degli alleati, quindi si dichiara prima di tutti e due.
        const nScafi = vesselCount(path, attackVessel);
        const tetto = attackVessel
            ? Math.min(partenti, R.engine.shipCapacity(attackVessel) * nScafi)
            : partenti;
        const input = document.createElement('input');
        const engagedFor = () => Math.max(0, Math.min(parseInt(input.value, 10) || 0, tetto));

        // ---- GLI ALLEATI A TIRO (§Diplomazia) ----
        // Sulla mappa il cursore d'ordine offre già "Marcia in aiuto" quando si
        // clicca la provincia di un alleato; qui l'elenco lo dice a parole,
        // perché quel bottone nessuno lo indovina se non prova a cliccare un
        // regno amico. Solo via terra e solo con l'accesso militare: il motore
        // (sendReinforcements) rifiuta tutto il resto.
        const alleate = targets.filter(t => t.rinforzabile);
        if (alleate.length && partenti) {
            const af = document.createElement('details');
            af.className = 'bp-fold bp-ally-fold';
            af.innerHTML = '<summary>🛡 Alleati da rinforzare <span class="bp-fold-hint">' +
                alleate.length + (alleate.length === 1 ? ' provincia' : ' province') +
                ' · gli uomini diventano suoi</span></summary>';
            const ab = document.createElement('div');
            ab.className = 'bp-fold-body';
            ab.insertAdjacentHTML('beforeend',
                '<div class="bp-hint">Marciare in aiuto <b>non consuma</b> lo spostamento di fine turno ' +
                'e si può fare quante volte vuoi: quel che spendi sono gli uomini, che passano ' +
                'sotto le sue insegne e non tornano.</div>');
            alleate.forEach(t => {
                ab.appendChild(actionButton('🛡 ' + t.label,
                    t.owner + ' · ' + t.troops + ' di presidio', null,
                    () => askReinforce(player, path, t, engagedFor())));
            });
            af.appendChild(ab);
            g.appendChild(af);
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

        const row = document.createElement('div');
        row.className = 'bp-act-row';
        input.type = 'number';
        input.min = '1';
        input.max = String(tetto);
        input.value = String(tetto);
        input.title = attackVessel
            ? 'Uomini da imbarcare (il resto non ci sta a bordo)'
            : 'Truppe impegnate (ne resta almeno 1 a presidiare)';
        row.appendChild(input);
        row.insertAdjacentHTML('beforeend', '<span class="bp-act-cost">' + (attackVessel
            ? (nScafi > 1
                ? 'a bordo · le tue ' + nScafi + ' navi portano fino a ' + (R.engine.shipCapacity(attackVessel) * nScafi)
                : 'a bordo · la nave ne porta ' + R.engine.shipCapacity(attackVessel)) +
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

    // ---------- SPEDIZIONI OLTREMARE (§9.2, rotte lunghe) ----------
    // La rotta lunga del Veliero non si comanda dalla mappa (la meta è ignota: si
    // scopre navigando): si sceglie una DIREZIONE con una bussola e la nave avanza
    // di turno in turno. Il lanciatore vive sotto il Veliero nella fase attacco; le
    // spedizioni già in mare hanno un gruppo tutto loro, indipendente dalla
    // provincia selezionata — sono in mare aperto, non appartengono a una costa.
    const DIR_ARROW = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };

    // Bussola: 8 bottoni-direzione, disposti a rosa dei venti (griglia 3×3 via CSS).
    function compass(sel, onPick) {
        const wrap = document.createElement('div');
        wrap.className = 'bp-compass';
        GA().EXPED_DIRS.forEach(d => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'bp-dir bp-dir-' + d + (sel === d ? ' on' : '');
            b.innerHTML = '<span class="bp-dir-a">' + DIR_ARROW[d] + '</span>';
            b.title = 'Rotta verso ' + GA().EXPED_DIR_LABEL[d];
            b.addEventListener('click', () => onPick(d));
            wrap.appendChild(b);
        });
        return wrap;
    }

    function expeditionLauncher(player, path, partenti) {
        const cap = R.engine.shipCapacity('vascello');
        const tetto = Math.min(partenti, cap);
        const fold = document.createElement('details');
        fold.className = 'bp-fold bp-exped-launch';
        fold.open = true;
        fold.innerHTML = '<summary>🧭 Spedizione oltremare <span class="bp-fold-hint">' +
            'più turni · alla ricerca di una costa</span></summary>';
        const body = document.createElement('div');
        body.className = 'bp-fold-body';
        fold.appendChild(body);

        body.insertAdjacentHTML('beforeend',
            '<div class="bp-hint">Il Veliero salpa e <b>naviga di turno in turno</b> verso la ' +
            'direzione scelta, scoprendo le coste che avvista. Non sbarca subito: approderai quando ' +
            'vorrai, su una terra in vista. Uomini e nave lasciano ' + R.provinceLabel(path) +
            ' e restano in mare finché non tocchi terra.</div>');

        body.appendChild(compass(expedDir, d => { expedDir = d; render(); }));

        const row = document.createElement('div');
        row.className = 'bp-act-row';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1'; input.max = String(tetto); input.value = String(tetto);
        input.title = 'Uomini da imbarcare (il Veliero ne porta ' + cap + ')';
        row.appendChild(input);
        row.insertAdjacentHTML('beforeend', '<span class="bp-act-cost">a bordo · la nave porta ' +
            cap + ', in provincia possono partire ' + partenti + '</span>');
        body.appendChild(row);

        const cargoFor = () => Math.max(0, Math.min(parseInt(input.value, 10) || 0, tetto));
        const go = actionButton(
            expedDir ? '⛵ Salpa verso ' + GA().EXPED_DIR_LABEL[expedDir] : '⛵ Scegli prima una rotta',
            'spedizione', expedDir ? null : 'Scegli una direzione sulla bussola',
            () => {
                const n = cargoFor();
                const dir = expedDir;
                if (!dir || !n) return;
                R.confirm({
                    title: 'Salpare verso ' + GA().EXPED_DIR_LABEL[dir] + '?',
                    text: n + (n === 1 ? ' uomo salpa' : ' uomini salpano') + ' da ' + R.provinceLabel(path) +
                        ' con il Veliero. La spedizione navigherà per più turni: uomini e nave restano in ' +
                        'mare aperto finché non approdi su una costa avvistata. Non si può richiamare a metà, ' +
                        'e più a lungo resta in mare più rischia naufragi e morìa dell\'equipaggio.',
                    ok: '⛵ Salpa', tone: 'war'
                }, () => { expedDir = null; run(GA().launchExpedition(player, path.id, dir, n)); });
            });
        body.appendChild(go);
        return fold;
    }

    // Aggiunge il gruppo delle spedizioni in mare al pannello, se è il turno del
    // giocatore e sta guardando la fase attacco — anche senza provincia selezionata
    // (le spedizioni non appartengono a una costa: vivono in mare aperto).
    function maybeAppendExpeditions(player, actions) {
        if (!isPlaying(player) || viewPhase(player) !== 'attacca') return;
        const eg = expeditionsGroup(player);
        if (eg) actions.appendChild(eg);
    }

    function expeditionsGroup(player) {
        const list = Array.isArray(player.spedizioni) ? player.spedizioni : [];
        if (!list.length) return null;
        const g = document.createElement('div');
        g.className = 'bp-act-group';
        g.innerHTML = '<div class="bp-act-head">🚢 Spedizioni in mare (' + list.length + ')</div>';

        list.forEach(exp => {
            const card = document.createElement('div');
            card.className = 'bp-exped';
            const vNote = exp.merc ? ' · ' + exp.merc + '⚑' : '';
            const mNote = exp.turniInMare ? ' · ' + exp.turniInMare + '° turno in mare' : '';
            card.insertAdjacentHTML('beforeend',
                '<div class="bp-exped-head">Veliero · <b>' + exp.carico + '</b> a bordo' + vNote +
                ' · rotta <b>' + (GA().EXPED_DIR_LABEL[exp.dir] || exp.dir) + '</b>' + mNote + '</div>');

            const targets = GA().expeditionTargets(player, exp);
            if (!targets.length) {
                card.insertAdjacentHTML('beforeend',
                    '<div class="bp-empty-hint">Mare aperto: nessuna costa in vista. Continua a navigare ' +
                    'verso ' + (GA().EXPED_DIR_LABEL[exp.dir] || exp.dir) + ' — puoi cambiare rotta qui sotto.</div>');
            } else {
                card.insertAdjacentHTML('beforeend', '<div class="bp-hint">Coste avvistate — approda dove vuoi:</div>');
                const mercA = Math.min(exp.merc || 0, exp.carico);
                targets.forEach(t => {
                    if (t.mia) {
                        card.appendChild(actionButton('⚓ ' + t.label, 'tua costa · rinforzo', null,
                            () => R.confirm({
                                title: 'Approdare a ' + t.label + '?',
                                text: 'La spedizione sbarca ' + exp.carico + (exp.carico === 1 ? ' uomo' : ' uomini') +
                                    ' sulla tua costa e la nave getta l\'ancora lì.',
                                ok: '⚓ Approda', tone: 'calm'
                            }, () => run(GA().expeditionLand(player, exp.id, t.id)))));
                        return;
                    }
                    const f = RisikoBattle.winForecast(exp.carico, (t.troops || 0) + (t.fort || 0),
                        t.esponente, mercA, t.merc || 0);
                    const p = Math.round(100 * f.p), banda = Math.round(100 * f.banda);
                    const bonus = t.fort ? ' +' + t.fort : '';
                    const vent = t.merc ? ' · ' + t.merc + '⚑' : '';
                    const terr = terrainTag(t.terreno);
                    const btn = actionButton('⚓ ' + t.label,
                        t.owner + ' · ' + t.troops + bonus + vent + (terr ? ' · ' + terr : ''), null,
                        () => R.confirm({
                            title: 'Sbarcare a ' + t.label + '?',
                            text: exp.carico + (exp.carico === 1 ? ' uomo' : ' uomini') + ' contro ' + t.troops +
                                (t.fort ? ' difensori (+' + t.fort + ')' : ' difensori') + ' · vittoria ' +
                                (banda ? 'intorno al ' : '') + p + '%. Sbarco totale: vinci e la costa è tua con ' +
                                'la nave ancorata; perdi e la spedizione è perduta.',
                            ok: '⚓ Sbarca', tone: 'war'
                        }, () => run(GA().expeditionLand(player, exp.id, t.id))));
                    const chip = document.createElement('span');
                    chip.className = 'bp-odds ' + (p >= 60 ? 'good' : p >= 40 ? 'even' : 'bad');
                    chip.textContent = (banda ? '~' : '') + p + '%';
                    btn.appendChild(chip);
                    card.appendChild(btn);
                });
            }

            // Cambia rotta senza far avanzare la nave (l'avanzamento è a inizio turno).
            const steer = document.createElement('details');
            steer.className = 'bp-fold';
            steer.innerHTML = '<summary>Cambia rotta</summary>';
            const sb = document.createElement('div');
            sb.className = 'bp-fold-body';
            sb.appendChild(compass(exp.dir, d => run(GA().steerExpedition(player, exp.id, d))));
            steer.appendChild(sb);
            card.appendChild(steer);

            g.appendChild(card);
        });
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
        // Quanti scafi salpano davvero: quelli che servono a portare `n` uomini
        // (⌈n/carico⌉), lo stesso conto del motore. Va detto, perché condividono
        // tutti la sorte dell'assalto (§9.2): perdere lo sbarco le perde tutte.
        const navi = t.viaMare && attackVessel
            ? Math.max(1, Math.ceil(n / R.engine.shipCapacity(attackVessel)))
            : 0;
        const testoSbarco = t.viaMare
            ? (navi > 1
                ? ' Partono ' + navi + ' navi: approdano comunque vada. Vinci e restano ancorate sulla costa presa; ' +
                  'perdi e finiscono in mano al difensore, con tutti gli uomini a bordo. '
                : ' Parte anche la ' + (attackVessel === 'vascello' ? 'nave da guerra' : 'nave') +
                  ': approda comunque vada. Vinci e resta ancorata sulla costa presa; ' +
                  'perdi e finisce in mano al difensore, con tutti gli uomini a bordo. ') +
              'Uno sbarco non si può fermare a metà.'
            : ' Le truppe impegnate lasciano ' + R.provinceLabel(path) +
              ' comunque vada: se vinci deciderai quante restano nella provincia presa ' +
              'e quante rientrano; se perdi non torna nessuno.';
        // La ventura è l'altra cosa che non si vede: se c'è, il numero mostrato è
        // una media e va detto qui, prima della carica (§5.3).
        const testoVentura = f.banda ? ' ' + mercNote(f) : '';
        // IL TRADIMENTO (§Diplomazia): con un patto di non aggressione in essere
        // l'attacco non parte da solo — il motore lo rifiuta senza il flag. Finché
        // la plancia non lo passava, l'unica strada era sciogliere il patto dal
        // foglio 🕊 e attaccare il turno dopo. Ora si può tradire, ma va DETTO:
        // rompe ogni patto col difensore e, se c'era un'alleanza, costa prestigio.
        const tradisce = !!t.patto && !t.consenso;
        const costo = t.alleanza
            ? ' e ti costa −' + ((window.Diplomacy && Diplomacy.BREAK_PRESTIGE) || 2) + ' prestigio'
            : '';
        const testoPatto = tradisce
            ? ' ATTENZIONE: hai un patto con ' + t.owner + '. Colpirlo è un TRADIMENTO: rompe ogni ' +
              'accordo fra voi' + costo + ', e lui lo saprà.'
            : (t.consenso ? ' ' + t.owner + ' ti ha concesso questa provincia: l\'attacco non rompe il patto.' : '');
        R.confirm({
            title: (tradisce ? 'Tradire ' + t.owner + ' a ' : t.viaMare ? 'Sbarcare a ' : 'Attaccare ') + t.label + '?',
            text: n + (n === 1 ? ' truppa imbarcata' : ' truppe') + ' contro ' +
                t.troops + (t.fort ? ' difensori (+' + t.fort + ' dalle strutture)' : ' difensori') +
                ' · probabilità di vittoria ' + (f.banda ? 'intorno al ' : '') + f.p + '%.' +
                testoVentura + nota + testoSbarco + testoPatto,
            ok: tradisce ? '⚔ Tradisci' : t.viaMare ? '⚓ Sbarca' : '⚔ Carica',
            tone: tradisce ? 'danger' : 'war'
        }, () => {
            closeOrder();
            run(GA().attack(player, path.id, t.id, n, undefined, attackVessel, tradisce));
        });
    }

    // MARCIARE IN AIUTO DI UN ALLEATO (§Diplomazia, regola dell'utente): in fase
    // d'attacco, sulla provincia di un alleato, al posto di caricare. La conferma
    // sta qui perché ci si arriva da due strade (il cursore sulla mappa e
    // l'elenco degli alleati nel pannello) e devono dire le stesse parole, come
    // askAttack.
    function askReinforce(player, path, t, n) {
        R.confirm({
            title: 'Mandare rinforzi a ' + t.label + '?',
            text: n + (n === 1 ? ' soldato lascia ' : ' soldati lasciano ') + R.provinceLabel(path) +
                ' e passano sotto le insegne di ' + t.owner + ': da quel momento sono SUOI, ' +
                'e non tornano indietro. La provincia resta sua — è un aiuto, non una conquista. ' +
                'Non consuma lo spostamento di fine turno.',
            ok: '🛡 Marcia in aiuto'
        }, () => { closeOrder(); run(GA().sendReinforcements(player, path.id, t.id, n)); });
    }

    // La conferma dello SPOSTAMENTO, gemella di askAttack: la chiamano sia i
    // bottoni dell'elenco sia il cursore d'ordine sulla mappa, e il giocatore deve
    // leggere le stesse parole comunque ci arrivi. Le due cose che non può dedurre
    // stanno qui: che i soldati mandati a un ALLEATO diventano suoi, e che in un
    // porto alleato la nave non ci resta.
    function askMove(player, path, t, n, prima) {
        const navale = t.viaMare;
        const testoNave = !navale ? ''
            : t.alleato
                ? ' La nave ' + (n === 1 ? 'lo' : 'li') + ' sbarca nel porto alleato e rientra a ' + R.provinceLabel(path) +
                  ': ancorarla là la regalerebbe.'
                : ' La nave li accompagna e resta ancorata lì.';
        const testoAlleato = t.alleato
            ? (n === 1 ? ' Da adesso quel soldato è di ' : ' Da adesso quei soldati sono di ') +
              (t.owner || 'chi governa lì') + ': un rinforzo si dona, non si presta.'
            : '';
        R.confirm({
            title: (t.alleato ? 'Mandare rinforzi a ' : navale ? 'Rinforzare via nave ' : 'Spostare a ') +
                t.label + '?',
            text: n + (n === 1 ? ' soldato lascia ' : ' soldati lasciano ') + R.provinceLabel(path) +
                (navale ? (n === 1 ? ' e s\'imbarca' : ' e s\'imbarcano') : '') +
                ' per ' + t.label + '.' + testoAlleato + testoNave +
                ' È l\'unico spostamento del turno: dopo non se ne fanno altri.',
            ok: navale ? '⚓ Imbarca' : t.alleato ? '🛡 Invia' : '➜ Sposta'
        }, () => { if (prima) prima(); run(GA().finalMove(player, path.id, t.id, n)); });
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

    // ---------- avviso di conquista sulla MAPPA (richiesta dell'utente) ----------
    // Vinta una battaglia con più superstiti, la ripartizione (quanti occupano,
    // quanti rientrano) va decisa. La sezione nel pannello destro resta come
    // ripiego, ma l'avviso salta fuori CENTRALE sopra la mappa: si decide lì,
    // senza andare a cercare la sezione. Si mostra una volta per conquista;
    // "Decido dopo" la chiude e lascia il pannello a farla concludere.
    let conquestPromptFor = null;
    let conquestSeen = null;   // la presa vista al render precedente (vedi sotto)

    function showConquestPrompt(player) {
        const c = GA().conquestPending(player);
        if (!c) { conquestPromptFor = null; conquestSeen = null; return; }
        if (!isPlaying(player)) return;
        const key = c.fromId + '>' + c.toId + '@' + R.turn();
        if (conquestPromptFor === key) return;              // già proposta per questa presa
        if (document.getElementById('ui-conquest')) return;  // già aperta
        const retry = (ms) => {
            clearTimeout(showConquestPrompt._t);
            showConquestPrompt._t = setTimeout(render, ms);
        };
        // Una modale/pergamena per volta: se qualcosa è già a schermo, si RIPROVA
        // al render successivo. Prima qui si tornava SENZA riprogrammare un
        // retry: se una pergamena (es. l'eco storica della battaglia) o una
        // conferma era aperta quando scadeva l'ultimo timer, il ciclo di
        // ritentativi MORIVA e la modale di ripartizione non compariva più — la
        // conquista finiva risolta d'ufficio a fine turno (tutti restano) senza
        // che il giocatore avesse deciso quanti uomini mandare, e non c'era modo
        // di rifarla (bug segnalato dall'utente). Ora si continua a riprovare
        // finché lo schermo non si libera.
        if (document.getElementById('ui-foundation') || document.getElementById('ui-confirm')) {
            retry(350);
            return;
        }
        // Non coprire la scena della battaglia: la si lascia finire — e si
        // aspetta anche il respiro dopo (battleFxBusy in app.js tiene conto di
        // entrambi), così l'avviso non piomba sull'ultimo fotogramma. Si riprova
        // da soli finché la scena non ha chiuso.
        // Una presa APPENA comparsa non apre mai la modale al primo colpo:
        // `attack()` salva e ridisegna la plancia PRIMA di restituire il
        // risultato, quindi in quel render la scena della battaglia non è ancora
        // partita e chiedere "è in corso?" direbbe di no — la modale piomberebbe
        // sul colpo. Si lascia passare un battito e si ricontrolla: a quel punto
        // playBattleFx è partita e si aspetta che finisca.
        if (conquestSeen !== key) {
            conquestSeen = key;
            retry(120);
            return;
        }
        const inCorso = R.battleFxBusy ? R.battleFxBusy() : !!document.querySelector('svg.battle-focus');
        if (inCorso) {
            retry(350);
            return;
        }

        conquestPromptFor = key;
        openConquestModal(player, c);
    }

    // Arma la modale di conquista DAL RISULTATO dell'attacco (chiamata da run()).
    // È il canale principale, indipendente dal ciclo di render: appena la scena
    // della battaglia e le eventuali pergamene si liberano, apre la ripartizione.
    // showConquestPrompt (in render) resta come rete di sicurezza. Legge sempre
    // `conquestPending` dal vivo, quindi se la presa è già stata risolta (o la
    // conquista è sparita) semplicemente non fa nulla.
    function armConquestPrompt(result) {
        const delay = (result && result.battle && R.battleFxMs) ? R.battleFxMs() + 300 : 60;
        clearTimeout(armConquestPrompt._t);
        const tick = () => {
            const player = currentPlayer();
            if (!player || !isPlaying(player)) return;            // turno cambiato
            const c = GA().conquestPending(player);
            if (!c) return;                                       // già risolta o sparita
            const key = c.fromId + '>' + c.toId + '@' + R.turn();
            if (conquestPromptFor === key) return;                // già mostrata per questa presa
            if (document.getElementById('ui-conquest')) return;   // già aperta
            // Una cosa per volta: aspetta che scena e pergamene si liberino.
            const busy = R.battleFxBusy ? R.battleFxBusy() : !!document.querySelector('svg.battle-focus');
            if (busy || document.getElementById('ui-foundation') || document.getElementById('ui-confirm')) {
                armConquestPrompt._t = setTimeout(tick, 300);
                return;
            }
            conquestPromptFor = key;
            conquestSeen = key;
            openConquestModal(player, c);
        };
        armConquestPrompt._t = setTimeout(tick, delay);
    }

    function openConquestModal(player, c) {
        const old = document.getElementById('ui-conquest');
        if (old) old.remove();

        const wrap = document.createElement('div');
        wrap.id = 'ui-conquest';
        wrap.innerHTML =
            '<div class="uc-card">' +
            '<div class="bc-head">⚑ ' + c.toLabel + ' è tua — quanti restano a occuparla?</div>' +
            '<div class="bc-route">' + c.superstiti + ' superstiti dell\'assalto partito da ' + c.fromLabel + '</div>' +
            '<div class="bc-split">' +
                '<div class="bc-cell win"><span class="n" id="uq-occup">0</span><span class="l">occupano ' + c.toLabel + '</span></div>' +
                '<div class="bc-cell back"><span class="n" id="uq-back">0</span><span class="l">rientrano in ' + c.fromLabel + '</span></div>' +
            '</div>' +
            '<input type="range" id="uq-range" min="1" max="' + c.superstiti + '" value="' + c.superstiti + '">' +
            '<div class="bc-note">Almeno 1 resta a occuparla, se no la provincia torna sguarnita.</div>' +
            '<div class="uc-actions">' +
                '<button type="button" class="uc-no uq-later">Decido dopo</button>' +
                '<button type="button" class="uc-yes uq-go">Conferma</button>' +
            '</div></div>';

        const range = wrap.querySelector('#uq-range');
        const sync = () => {
            const n = parseInt(range.value, 10);
            wrap.querySelector('#uq-occup').textContent = n;
            wrap.querySelector('#uq-back').textContent = c.superstiti - n;
        };
        range.addEventListener('input', sync);
        sync();

        const close = () => { document.removeEventListener('keydown', onKey); wrap.remove(); };
        function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
        wrap.querySelector('.uq-later').addEventListener('click', close);
        wrap.querySelector('.uq-go').addEventListener('click', () => {
            close();
            run(GA().resolveConquest(player, parseInt(range.value, 10)));
        });
        // NIENTE chiusura al clic-fuori (a differenza delle altre modali): la
        // ripartizione è una decisione obbligata e cliccare la mappa per
        // continuare la faceva sparire per sempre (conquestPromptFor già segnato),
        // lasciando la presa risolta d'ufficio. Si esce solo con un bottone o Esc.
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
        wrap.querySelector('.uq-go').focus();
    }

    // ---------- capitale nemica presa: promuovila o lasciala Città ----------
    // Compare quando si conquista una Capitale nemica avendone già una propria.
    // Di default la presa è già una Città (lo stato è consistente): qui si offre
    // la promozione a Capitale ufficiale, che declassa la vecchia sede a Città.
    // Non blocca il turno; si azzera alla scelta o d'ufficio a fine turno.
    function renderCapitalChoice(player) {
        const box = $('bp-capital-choice');
        const c = player && player.capitalePresa;
        const to = c ? R.engine.path(c.toId) : null;
        if (!to) { box.style.display = 'none'; return; }

        const cap = R.getCapitalPathFor(player);
        box.style.display = 'block';
        box.innerHTML = `
            <div class="bc-head">👑 Hai preso la Capitale di ${R.provinceLabel(to)}</div>
            <div class="bc-route">Renderla la Capitale ufficiale${cap ? ' declasserebbe ' + R.provinceLabel(cap) + ' a Città' : ''}. Nessun costo.</div>
            <div class="bp-act-row">
                <button type="button" class="bp-act cap-promote"><span class="bp-act-name">👑 Rendi Capitale ufficiale</span></button>
                <button type="button" class="bp-act cap-keep"><span class="bp-act-name">🏰 Lasciala Città</span></button>
            </div>`;
        box.querySelector('.cap-promote').addEventListener('click',
            () => run(GA().resolveCapital(player, true)));
        box.querySelector('.cap-keep').addEventListener('click',
            () => run(GA().resolveCapital(player, false)));
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
            box.innerHTML = '<div class="bp-empty-hint">' + (quante
                ? 'Due clic: prima la provincia <b>da cui</b> partono i soldati, poi quella ' +
                  '<b>dove</b> arrivano. Sulla mappa sono accese le ' + quante +
                  ' province da cui puoi muovere: cliccane una.'
                : 'Nessuna provincia ha soldati da mandare a una tua confinante: uno resta ' +
                  'sempre a presidiare. Puoi chiudere il turno.') + '</div>';
            return;
        }

        const available = R.countPiece(path, 'soldato');
        const mobili = spareOf(path);

        const targets = GA().moveTargets(player, path.id);
        if (!targets.length) {
            box.innerHTML = '<div class="bp-empty-hint">Da ' + R.provinceLabel(path) +
                ' non confina nessun\'altra tua provincia.</div>';
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
        // decine di destinazioni e la lista le scorrerebbe tutte. Serve soprattutto
        // ai rinforzi via nave, che sulla mappa possono cadere dall'altra parte.
        const viaMareN = targets.filter(t => t.viaMare).length;
        const fold = document.createElement('details');
        fold.className = 'bp-fold';
        fold.open = targets.length > ORDER_MAX_MARKS;
        fold.innerHTML = '<summary>Tutte le destinazioni <span class="bp-fold-hint">' +
            targets.length + ' destinazioni' + (viaMareN ? ', ' + viaMareN + ' via nave' : '') +
            '</span></summary>';
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
            // Via nave il carico è un secondo tetto oltre al presidio (§9.2).
            const tetto = t.viaMare ? Math.min(mobili, R.engine.shipCapacity(t.scafo)) : mobili;
            const nota = t.troops + ' già lì' + (t.alleato ? ' · 🛡 ' + (t.owner || 'alleato') : '') +
                (t.viaMare ? ' · ⚓ via nave, max ' + tetto : '');
            const ico = t.viaMare ? '⚓ ' : t.alleato ? '🛡 ' : '→ ';
            body.appendChild(actionButton(ico + t.label, nota, null, () => {
                askMove(player, path, t, Math.min(parseInt(input.value, 10) || 0, tetto));
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

    // Anima una carovana quando parte una proposta o si chiude uno scambio
    // (richiesta dell'utente). Il commercio è regno↔regno, senza una provincia
    // sua: si parte dal Mercato del mittente e si punta alla Capitale del
    // destinatario (o alla sua prima provincia). La nebbia la gestisce app.js.
    function tradeAnchor(player, preferMarket) {
        if (!player) return null;
        if (preferMarket) { const m = GA().marketPath(player); if (m) return m.id; }
        const cap = R.getCapitalPathFor(player);
        if (cap) return cap.id;
        const owned = R.ownedPaths(player.name);
        return owned.length ? owned[0].id : null;
    }

    function tradeCaravan(fromPlayer, toPlayer, opts) {
        if (!R.playTradeFx) return;
        const fromId = tradeAnchor(fromPlayer, true);
        const toId = tradeAnchor(toPlayer, false);
        if (fromId && toId && fromId !== toId) R.playTradeFx(fromId, toId, opts);
    }

    // La bestia da soma dipende dalla regione della meta: mulo in Europa,
    // cammello in Africa e Oriente (richiesta dell'utente). La regione la sa il
    // gioco (isEuropeProvince); il giocatore vede solo l'animale e la direzione,
    // mai la provincia d'arrivo.
    function tradeBeast(provId) {
        return (R.isEuropeProvince && R.isEuropeProvince(provId)) ? '🫏' : '🐫';
    }

    // ============================================================
    // MERCATO — IL POLSO DEL COMMERCIO (#bp-market-pulse, foglio ⚖)
    //
    // (richiesta dell'utente) "aprendo il mercato, sarebbe bello un pannello che
    // elencasse le trattative in corso, i regni con cui hai trattato di più e
    // altre cose": è questa colonna. I banchi veri (estero 2:1, proposta,
    // carovane, storico) restano quelli di sempre, #bp-trade, nella colonna
    // accanto; qui si legge il QUADRO — quante trattative sono aperte, con chi
    // passano davvero le carovane, cosa hai in magazzino da mettere sul banco.
    //
    // Non c'è un registro nuovo da tenere: tutto esce da `commerciStorico` e
    // dalle due caselle (GameActions.tradeInbox/tradeOutbox), cioè da quello che
    // il gioco già scrive quando uno scambio parte o si chiude.
    // ============================================================

    // Il pallino rosso sui pulsanti del dock: quante cose aspettano una TUA
    // risposta. È l'unica ragione per cui un foglio chiuso deve chiamarti —
    // senza questo, chiudere i pannelli vorrebbe dire perdersi le proposte.
    function syncDockBadges(player) {
        const set = (id, n) => {
            const el = $(id);
            if (!el) return;
            el.textContent = n;
            el.style.display = n ? '' : 'none';
        };
        set('dock-badge-diplomazia', player ? (GA().pactInbox(player) || []).length : 0);
        set('dock-badge-mercato', player ? (GA().tradeInbox(player) || []).length : 0);
    }

    function mkBlock(title) {
        const b = document.createElement('div');
        b.className = 'mk-block';
        const h = document.createElement('div');
        h.className = 'mk-head';
        h.textContent = title;
        b.appendChild(h);
        return b;
    }

    function renderMarketPulse(player) {
        const box = $('bp-market-pulse');
        if (!box) return;
        // Costa un giro di liste: si disegna solo col foglio aperto.
        if (openSheet !== 'mercato') { box.innerHTML = ''; return; }
        box.innerHTML = '';

        const inbox = GA().tradeInbox(player);
        const outbox = GA().tradeOutbox(player);
        const log = player.commerciStorico || [];

        // --- 1. le trattative aperte adesso ---
        const aperte = mkBlock('Trattative in corso');
        const tiles = document.createElement('div');
        tiles.className = 'mk-tiles';
        const tile = (n, lab, hot) =>
            '<div class="mk-tile' + (hot && n ? ' hot' : '') + '"><b>' + n + '</b><i>' + lab + '</i></div>';
        tiles.innerHTML =
            tile(inbox.length, 'in arrivo', true) +
            tile(outbox.length, 'in attesa') +
            tile(log.length, 'concluse');
        aperte.appendChild(tiles);
        aperte.insertAdjacentHTML('beforeend',
            '<div class="bp-empty-hint" style="margin-top:8px">' +
            (inbox.length
                ? 'Ci sono carovane che aspettano una risposta: le trovi nei banchi qui accanto.'
                : outbox.length
                    ? 'Hai proposte in viaggio: la merce offerta è già fuori dal magazzino.'
                    : 'Nessuna trattativa aperta. Il banco è libero.') +
            '</div>');
        box.appendChild(aperte);

        // --- 2. con chi commerci di più ---
        // Si misura in MERCE MOSSA, non in numero di scambi: due carovane grosse
        // legano più di cinque scambi da un sacco.
        const conti = new Map();
        log.forEach(h => {
            const k = String(h.conId);
            const c = conti.get(k) || { id: h.conId, nome: h.conNome, n: 0, merce: 0 };
            c.n++;
            c.merce += ((h.dato && h.dato.n) || 0) + ((h.ricevuto && h.ricevuto.n) || 0);
            c.nome = h.conNome || c.nome;
            conti.set(k, c);
        });
        const rank = Array.from(conti.values()).sort((a, b) => b.merce - a.merce);
        const partner = mkBlock('Con chi commerci di più');
        if (!rank.length) {
            partner.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Nessuno, per ora: serve un Mercato e un regno in vista con cui trattare.</div>');
        } else {
            const max = rank[0].merce || 1;
            rank.slice(0, 6).forEach(c => {
                const chi = R.players().find(p => String(p.id) === String(c.id));
                const col = (chi && chi.color) || '#8a7a63';
                const row = document.createElement('div');
                row.className = 'mk-rank';
                row.innerHTML =
                    '<span class="mk-dot" style="background:' + col + '"></span>' +
                    '<span class="mk-who"></span>' +
                    '<span class="mk-track"><span class="mk-fill" style="width:' +
                    Math.round(100 * c.merce / max) + '%;background:' + col + '"></span></span>' +
                    '<span class="mk-n">' + c.n + '×</span>';
                row.querySelector('.mk-who').textContent = c.nome || 'Regno ignoto';
                row.title = c.nome + ': ' + c.n + (c.n === 1 ? ' scambio' : ' scambi') +
                    ', ' + c.merce + ' unità di merce passate di mano';
                partner.appendChild(row);
            });
        }
        box.appendChild(partner);

        // --- 3. il magazzino, per sapere cosa mettere sul banco ---
        const stock = mkBlock('Nel tuo magazzino');
        const scorte = player.scorte || {};
        const goods = document.createElement('div');
        goods.className = 'mk-stock';
        goods.innerHTML =
            '<span class="mk-good"><span>Monete</span><b>' + (player.monete || 0) + '</b></span>' +
            RES().map(k => {
                const n = scorte[k] || 0;
                return '<span class="mk-good' + (n ? '' : ' zero') + '"><span>' +
                    resName(k) + '</span><b>' + n + '</b></span>';
            }).join('');
        stock.appendChild(goods);
        stock.insertAdjacentHTML('beforeend',
            '<div class="bp-empty-hint" style="margin-top:8px">Quel che ti avanza è quel che puoi ' +
            'offrire; quel che è a zero è quel che conviene chiedere.</div>');
        box.appendChild(stock);
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
        box.appendChild(historyCard(player));
    }

    // --- storico degli scambi conclusi: si RIPROPONGONO con un click ---
    // (richiesta dell'utente) Ogni scambio andato a buon fine resta qui, dal
    // punto di vista di questo regno (cosa ha DATO, cosa ha RICEVUTO). "Riproponi"
    // compila la proposta qui sopra con gli stessi termini verso lo stesso regno:
    // rifarlo è un click, non da ricomporre a mano ogni volta.
    function historyCard(player) {
        const card = document.createElement('div');
        card.className = 'bp-trade-card';
        const log = player.commerciStorico || [];
        card.innerHTML = '<div class="bp-trade-head">Storico degli scambi' +
            (log.length ? ' <span class="bp-trade-badge">' + log.length + '</span>' : '') + '</div>';

        if (!log.length) {
            card.insertAdjacentHTML('beforeend', '<div class="bp-empty-hint">Nessuno scambio concluso, per ora.</div>');
            return card;
        }

        const anno = t => (typeof Chronicle !== 'undefined' && Chronicle.yearOfTurn)
            ? ' · A.D. ' + Chronicle.yearOfTurn(t) : '';
        log.slice().reverse().forEach(h => {   // i più recenti in cima
            const con = R.players().find(p => p.id === h.conId);
            const item = document.createElement('div');
            item.className = 'bp-trade-offer';
            item.innerHTML =
                '<div class="bp-trade-offer-head"><span class="bp-trade-dot" style="background:' +
                ((con && con.color) || '#888') + '"></span><span class="bp-trade-from"></span></div>' +
                '<div class="bp-trade-terms"><span class="out">− ' + GR().goodsText(h.dato) +
                '</span><span class="in">+ ' + GR().goodsText(h.ricevuto) + '</span></div>';
            item.querySelector('.bp-trade-from').textContent = 'Con ' + h.conNome + anno(h.turno);

            const acts = document.createElement('div');
            acts.className = 'bp-trade-acts';
            const again = document.createElement('button');
            again.type = 'button'; again.className = 'bp-mini'; again.textContent = '↻ Riproponi';
            const vivo = con && R.ownedPaths(con.name).length;
            again.disabled = !vivo;
            again.title = vivo ? 'Compila la proposta qui sopra con gli stessi termini'
                : h.conNome + ' non ha più province con cui trattare';
            again.addEventListener('click', () => {
                tradeUI.verso = h.conId;
                tradeUI.offroT = h.dato.tipo; tradeUI.offroN = h.dato.n;
                tradeUI.chiedoT = h.ricevuto.tipo; tradeUI.chiedoN = h.ricevuto.n;
                renderTrade(player);
                // La card "Proponi a un regno" è la seconda: la si porta in vista.
                const prop = $('bp-trade').children[1];
                if (prop && prop.scrollIntoView) prop.scrollIntoView({ block: 'nearest' });
            });
            acts.appendChild(again);
            item.appendChild(acts);
            card.appendChild(item);
        });
        return card;
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
            () => {
                const res = GA().tradeWithBank(player, tradeUI.dai, tradeUI.prendi, tradeUI.n);
                run(res);
                const mkt = GA().marketPath(player);
                if (res && res.ok && mkt && R.playTradeFx) {
                    // Estero: la bestia la sceglie la regione del proprio Mercato;
                    // torna carica di merce (anfora, non un pacco moderno).
                    R.playTradeFx(mkt.id, null, { abroad: true, glyph: tradeBeast(mkt.id), back: '🏺', color: player.color });
                }
            }));
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
            () => {
                const dest = R.players().find(p => p.id === tradeUI.verso);
                const res = GA().proposeTrade(player, tradeUI.verso,
                    { tipo: tradeUI.offroT, n: tradeUI.offroN }, { tipo: tradeUI.chiedoT, n: tradeUI.chiedoN });
                run(res);
                if (res && res.ok) tradeCaravan(player, dest, { glyph: '📜', color: player.color });
            }));
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
            ok.addEventListener('click', () => {
                const res = GA().acceptTrade(player, o.id);
                run(res);
                // Scambio concluso: le carovane si incrociano nei due sensi. La
                // bestia dipende dalla regione del partner (mulo in Europa,
                // cammello in Africa/Oriente).
                if (res && res.ok) {
                    const beast = tradeBeast(tradeAnchor(from, false));
                    tradeCaravan(player, from, {
                        glyph: beast, color: player.color, back: beast, color2: (from && from.color)
                    });
                }
            });
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
            // Carico combinato di tutti gli scafi di quel tipo (§9.2): due navi il doppio.
            return Math.min(partenti, R.engine.shipCapacity(attackVessel) * vesselCount(path, attackVessel));
        }
        // Rinforzo navale (§9.2): il carico della nave che ci arriva è il secondo
        // tetto. Si usa lo scafo più capiente della meta, che è quello mostrato.
        if (kind === 'sposta' && target.viaMare && target.scafo) {
            return Math.min(partenti, R.engine.shipCapacity(target.scafo));
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
        const navale = !attacco && t.viaMare;      // rinforzo via nave (§9.2)
        const dono = !attacco && t.alleato;        // rinforzo a un alleato: diventano suoi
        const terr = terrainTag(t.terreno);

        // ALLEATO A TIRO (§Diplomazia, regola dell'utente): su una provincia di
        // un alleato la fase d'attacco offre DUE strade — marciare in aiuto
        // (gli uomini diventano suoi) o colpirlo lo stesso, che però è un
        // TRADIMENTO e rompe ogni patto. Il bottone d'oro resta quello di
        // sempre; l'aiuto sta su una riga sua, e la carica si veste da tradimento
        // per non farla partire distrattamente.
        const aiuto = attacco && !!t.rinforzabile;
        const tradisce = attacco && !!t.patto && !t.consenso;

        orderHud.className = 'moh ' + (attacco ? 'atk' : 'mov');
        orderHud.innerHTML =
            '<div class="moh-head"><span class="moh-ico">' +
                (sbarco || navale ? '⚓' : attacco ? '⚔' : dono ? '🛡' : '➜') + '</span>' +
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
                (aiuto ? '<button type="button" class="moh-help">🛡 Marcia in aiuto</button>' : '') +
                // Con tre bottoni l'annulla resta la sola icona: "Lascia stare"
                // per esteso spingerebbe il bottone d'azione a capo, e il cursore
                // diventerebbe una colonna di tre righe alta mezza mappa.
                '<button type="button" class="moh-no">✕' + (aiuto ? '' : ' Lascia stare') + '</button>' +
                '<button type="button" class="moh-go' + (tradisce ? ' betray' : '') + '">' +
                    (sbarco ? '⚓ Sbarca' : attacco ? (tradisce ? '⚔ Tradisci' : '⚔ Carica')
                        : navale ? '⚓ Imbarca' : dono ? '🛡 Invia' : '➜ Sposta') + '</button>' +
            '</div>';

        orderHud.querySelector('.moh-name').textContent = t.label;
        orderHud.querySelector('.moh-sub').textContent = attacco
            ? t.owner + ' · ' + t.troops + (aiuto ? ' di presidio' : ' a difesa') +
              (t.fort ? ' +' + t.fort + ' mura' : '') +
              (t.merc ? ' · ' + t.merc + '⚑' : '') + (terr ? ' · ' + terr : '') +
              (aiuto ? ' · alleato' : t.consenso ? ' · consenso concesso' : tradisce ? ' · patto in essere' : '')
            : t.troops + ' già lì · da ' + R.provinceLabel(path) + (navale ? ' · via nave' : '') +
              (dono ? ' · in aiuto di ' + (t.owner || 'un alleato') : '');

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
        const help = orderHud.querySelector('.moh-help');
        if (help) help.addEventListener('click', () => askReinforce(player, path, order.target, order.n));
    }

    // Solo i numeri: si chiama a ogni tacca del cursore, non deve ricostruire nulla.
    function syncOrderHud() {
        const t = order.target;
        orderHud.querySelector('.moh-n').textContent = order.n;
        const range = orderHud.querySelector('.moh-range');
        if (range.value !== String(order.n)) range.value = String(order.n);
        const odds = orderHud.querySelector('.moh-odds');
        if (!odds) return;
        if (t.rinforzabile) {
            // Con un alleato davanti la percentuale è una domanda sbagliata: il
            // cursore dice quel che cambia davvero, cioè quanti uomini gli restano.
            odds.textContent = 'Marciando in aiuto: ' + (t.troops + order.n) + ' a presidio, tutti suoi';
            odds.title = '';
            odds.className = 'moh-odds even';
            return;
        }
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
            askMove(player, path, t, n, closeOrder);
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
        // In fase d'attacco la provincia di un ALLEATO si accende d'oro come una
        // meta di spostamento, non d'arancio come un bersaglio: è lì che si
        // marcia in aiuto (§Diplomazia). Il retino dice a colpo d'occhio quali
        // confini sono un fronte e quali no; il cursore d'ordine offre poi le due
        // strade (aiuto o tradimento).
        R.markTargets(path.id,
            disegnabili.map(t => (t.rinforzabile ? { id: t.id, kind: 'sposta' } : t.id)), f);
        R.showAttackArrows(path.id,
            disegnabili.filter(t => !t.rinforzabile).slice(0, 12).map(t => t.id), f);
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
        const title = $('bp-battle-title');   // il pulsante esiste solo se c'è una battaglia
        if (!lastBattle || !lastBattle.battle) {
            box.style.display = 'none';
            if (title) title.style.display = 'none';
            return;
        }

        // La scheda è OPZIONALE (richiesta dell'utente): il pulsante c'è sempre
        // che ci sia una battaglia da rivedere, ma il riquadro si apre solo se
        // il giocatore l'ha chiesto. Il click alterna, e ogni nuova battaglia
        // parte da chiuso (run() azzera battleOpen).
        if (title) {
            const vintaLast = lastBattle.battle.attackerWins;
            title.style.display = '';
            title.classList.toggle('open', battleOpen);
            title.textContent = (battleOpen ? '▾ ' : '▸ ') +
                (vintaLast ? 'Ultima battaglia — vinta' : 'Ultima battaglia — persa');
            title.onclick = () => { battleOpen = !battleOpen; renderBattle(); };
        }
        if (!battleOpen) { box.style.display = 'none'; return; }

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
                    <div class="bb-left">${(() => { const s = L.engaged - L.perditeAttaccante; return vinta ? s + ' in marcia' : (s > 0 ? s + (s === 1 ? ' ripiega' : ' ripiegano') : 'nessun superstite'); })()}</div>
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
            ${L.bottino ? '<div class="bb-loot">🪙 Bottino di conquista: +' + L.bottino + ' monete</div>' : ''}
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

    // ---------- costi ed effetti: il pop-up 📜 ----------
    // (richiesta dell'utente) "un pulsante azionabile in qualsiasi momento che
    // esce a pop-up, non che io debba scorrere per trovare e che poi rimane
    // aperto e crea ulteriore confusione": non è più una cartellina in fondo al
    // pannello che scorre, è il pop-up del dock. Si genera solo da aperto, così
    // il pannello non paga a ogni render (anche dei bot) un calcolo che nessuno
    // sta guardando.

    function renderLegend(player) {
        const box = $('bp-legend');
        if (!box) return;
        if (!costsOpen) { box.innerHTML = ''; return; }

        // La legenda si genera da GameRules.COSTS (scontata dalla Festa
        // §Felicità come GameActions.costFor): costi e testo non possono
        // divergere da quelli che la validazione applica davvero.
        const path = selectedProvId ? R.engine.path(selectedProvId) : null;
        const soldiersHere = path ? spareOf(path) : 0;

        box.innerHTML = Object.keys(GR().COSTS).map(type => {
            const cost = GR().costFor(type, player);
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

    // ---------- eventi storici (js/events.js) ----------
    // Crociata bandita, orda in arrivo, peste, guerra dichiarata: game-actions
    // (applyEvents/tickEvents via ctx.notify) lascia l'avviso in coda
    // (player.eventiAvvisi); qui lo si srotola all'apertura del proprio turno, una
    // volta sola, con la stessa pergamena degli editti. È in TESTA alla catena di
    // precedenza: un evento storico è il titolo del decennio. Il `tipo` (crociata/
    // mongoli/peste/guerra) colora la pergamena — la sua veste CSS arriva quando si
    // specifica l'evento; per ora ricade sullo stile neutro.
    function showPendingEventi(player) {
        const attesa = (player.eventiAvvisi || []).filter(a => !a.letto);
        if (!attesa.length || !R.showFoundation) return;
        if (!isPlaying(player)) return;

        attesa.forEach(a => { a.letto = true; });
        R.save();

        const primo = attesa[0];
        const anno = (typeof Chronicle !== 'undefined' && Chronicle.yearOfTurn)
            ? Chronicle.yearOfTurn(primo.turno || R.turn())
            : (primo.turno || R.turn());
        R.showFoundation({
            tipo: primo.tipo || 'evento',
            anno,
            regno: player.name,
            colore: player.color,
            titolo: primo.titolo || 'Cronaca del decennio',
            testo: attesa.map(a => a.testo).filter(Boolean).join('\n\n'),
            nota: (attesa.length > 1 ? attesa.length + ' notizie ti attendevano. ' : '') +
                (primo.nota || '')
        });
    }

    // ---------- naufragi e morìa in mare (GameActions.advanceExpeditions) ----------
    // Le spedizioni avanzano fra un turno e l'altro (§9.2): se il mare si è preso
    // parte dell'equipaggio, o ha inghiottito una nave intera, il giocatore lo
    // scopre QUI, all'apertura del proprio turno, con la stessa pergamena degli
    // editti e delle fondazioni. Il mare non cambia le cose di nascosto.
    function showPendingWrecks(player) {
        const attesa = (player.spedizioniAvvisi || []).filter(a => !a.letto);
        if (!attesa.length || !R.showFoundation) return;
        if (!isPlaying(player)) return;

        // Una sola pergamena per volta (#ui-foundation): se un editto dell'admin
        // attende, ha la precedenza e questa aspetta il render dopo — così un
        // naufragio non copre un editto senza lasciarne traccia.
        if ((player.editti || []).some(e => !e.letto)) return;

        attesa.forEach(a => { a.letto = true; });
        R.save();

        const dirLabel = d => (GA().EXPED_DIR_LABEL && GA().EXPED_DIR_LABEL[d]) || d || '?';
        const riga = a => {
            const rotta = 'In rotta verso ' + dirLabel(a.dir) + ', al ' + a.turniInMare +
                'º turno di mare aperto, ';
            return a.tipo === 'totale'
                ? rotta + 'una tempesta ha inghiottito la nave e gli ultimi ' + a.morti +
                    (a.morti === 1 ? ' uomo a bordo' : ' uomini a bordo') + ': la spedizione è perduta.'
                : rotta + 'il mare si è preso ' + a.morti +
                    (a.morti === 1 ? ' uomo dell\'equipaggio.' : ' uomini dell\'equipaggio.');
        };
        const naufragio = attesa.some(a => a.tipo === 'totale');
        const primo = attesa[0];
        const anno = (typeof Chronicle !== 'undefined' && Chronicle.yearOfTurn)
            ? Chronicle.yearOfTurn(primo.turno || R.turn())
            : (primo.turno || R.turn());
        R.showFoundation({
            tipo: 'naufragio',
            anno,
            regno: player.name,
            colore: player.color,
            titolo: naufragio ? 'Naufragio' : 'Il pedaggio del mare',
            testo: attesa.map(riga).join('\n\n'),
            nota: attesa.length > 1 ? attesa.length + ' notizie dal mare ti attendevano.' : ''
        });
    }

    // ---------- carovane concluse (§7, richiesta dell'utente) ----------
    // Uno scambio ANDATO A BUON FINE lo conclude l'altro regno, spesso nel suo
    // turno: il proponente lo scopre QUI, all'apertura del proprio, con la stessa
    // pergamena degli editti. game-actions.recordTrade lascia l'avviso in coda
    // (player.commerciAvvisi); qui lo si srotola una volta sola e si segna letto.
    function showPendingCommerci(player) {
        const attesa = (player.commerciAvvisi || []).filter(a => !a.letto);
        if (!attesa.length || !R.showFoundation) return;
        if (!isPlaying(player)) return;
        // Una pergamena per volta (#ui-foundation): editti e avvisi di mare hanno
        // la precedenza, questa aspetta il render dopo.
        if ((player.editti || []).some(e => !e.letto)) return;
        if ((player.spedizioniAvvisi || []).some(a => !a.letto)) return;

        attesa.forEach(a => { a.letto = true; });
        R.save();

        const primo = attesa[0];
        const anno = (typeof Chronicle !== 'undefined' && Chronicle.yearOfTurn)
            ? Chronicle.yearOfTurn(primo.turno || R.turn())
            : (primo.turno || R.turn());
        const riga = a => 'Accordo con ' + a.conNome + ': hai dato ' +
            GR().goodsText(a.dato) + ', ricevuto ' + GR().goodsText(a.ricevuto) + '.';
        R.showFoundation({
            tipo: 'commercio',
            anno,
            regno: player.name,
            colore: player.color,
            titolo: attesa.length > 1 ? 'Le carovane sono tornate' : 'La carovana è tornata',
            testo: attesa.map(riga).join('\n\n'),
            nota: 'Le ritrovi nello storico dei Commerci, pronte da riproporre.'
        });
    }

    // ---------- diplomazia: il PANNELLO (§Diplomazia) ----------
    // (regola dell'utente) Come i commerci, ma per i PATTI: proporre a un regno
    // VISIBILE (anche via spia), vedere i patti attivi e romperli/tradirli,
    // concedere a un partner di attaccare una propria provincia. Le proposte in
    // arrivo hanno già il pop-up a inizio turno; qui restano elencate per
    // decidere con calma. Nessun vincolo di fase: basta il proprio turno.
    function diploKingdomsVisibili(player) {
        // I regni che questo giocatore VEDE: quelli con almeno una provincia
        // visibile (in vista generale/editor la nebbia è nulla e si vedono tutti).
        const noFog = !R.visibleProvinces || !R.visibleProvinces();
        return R.players().filter(p => {
            if (p.id === player.id) return false;
            const paths = R.ownedPaths(p.name);
            if (!paths.length) return false;
            return noFog || paths.some(pt => R.isVisible(pt.id));
        });
    }
    // ============================================================
    // I CONFINI COI REGNI DI GIOCATORI — sulla mappa, sempre
    //
    // (richiesta dell'utente) "sulla mappa sempre visibile, sarebbe bello
    // fossero evidenziati i confini con regni di giocatori": le province ALTRUI
    // che toccano le tue si segnano col colore di chi le possiede. Il disegno
    // sta in app.js (Risiko.markBorders, strato #border-marks che resta acceso
    // anche quando cambiano le fasi); QUI si decide solo CHI marcare, perché è
    // la plancia a sapere chi sei e cosa vedi oltre la nebbia.
    //
    // La regola: di norma solo i regni di GIOCATORI — sono quelli con cui si
    // tratta davvero, e accendere tutte le frontiere farebbe luce dappertutto.
    // Col foglio 🕊 aperto si accendono tutte le frontiere in vista (lì stai
    // proprio guardando la politica), e passando sopra una scheda resta accesa
    // solo quella.
    // ============================================================

    let hotKingdomId = null;    // scheda sotto il mouse nel foglio Diplomazia

    // Le province ALTRUI che toccano le tue, regno per regno: { idRegno: [idProv] }.
    // Serve sia alle schede (quante frontiere avete) sia alla mappa. Le province
    // sotto nebbia non entrano: il confine non deve svelare quel che non vedi.
    function borderMap(player) {
        const mine = R.ownedPaths(player.name);
        const mineIds = new Set(mine.map(p => p.id));
        const byName = {};
        R.players().forEach(p => { byName[p.name] = p; });
        const noFog = !R.visibleProvinces || !R.visibleProvinces();
        const out = {};
        const visti = new Set();
        mine.forEach(p => {
            R.engine.landNeighbors(p.id).forEach(nid => {
                if (mineIds.has(nid) || visti.has(nid)) return;
                if (!noFog && !R.isVisible(nid)) return;
                const np = R.engine.path(nid);
                if (!np) return;
                const altro = byName[R.engine.owner(np)];
                if (!altro || altro.id === player.id) return;
                visti.add(nid);
                (out[altro.id] = out[altro.id] || []).push(nid);
            });
        });
        return out;
    }

    function syncBorderMarks(player) {
        const key = $('map-border-key');
        if (!R.markBorders) return;
        // In vista generale non c'è un "tuo" confine da segnare.
        if (!player || spectating) {
            R.clearBorders();
            if (key) { key.style.display = 'none'; key.innerHTML = ''; }
            return;
        }
        const confini = borderMap(player);
        const quali = R.players().filter(p => {
            if (!(confini[p.id] || []).length) return false;
            if (hotKingdomId != null) return p.id === hotKingdomId;
            if (openSheet === 'diplomazia') return true;
            return !p.bot;                       // di norma: i regni di GIOCATORI
        });

        const list = [];
        quali.forEach(p => confini[p.id].forEach(id => list.push({ id, color: p.color })));
        R.markBorders(list);

        if (!key) return;
        if (!quali.length) { key.style.display = 'none'; key.innerHTML = ''; return; }
        key.style.display = '';
        key.innerHTML = '<div class="mbk-title">' +
            (hotKingdomId != null ? 'Confini con questo regno'
                : openSheet === 'diplomazia' ? 'Confini coi regni in vista'
                    : 'Confini coi regni di giocatori') + '</div>' +
            quali.map(p =>
                '<div class="mbk-row"><span class="mbk-dot" style="background:' + p.color +
                '"></span><span class="mbk-who"></span><span class="mbk-n">' +
                confini[p.id].length + '</span></div>').join('');
        Array.from(key.querySelectorAll('.mbk-who')).forEach((el, i) => { el.textContent = quali[i].name; });
    }

    // ============================================================
    // DIPLOMAZIA — IL FOGLIO 🕊: le schede dei regni (#bp-relations)
    //
    // (richiesta dell'utente) "sarebbe bello che si aprisse un pannello centrale
    // che entra più nel dettaglio degli accordi presi, il livello di rapporto che
    // c'è tra i regni e il resto".
    //
    // Una scheda per ogni regno che VEDI: che patti avete e cosa costa
    // scioglierli, quanto vi rispettate e — soprattutto — PERCHÉ. Il livello di
    // rapporto non è un voto calato dall'alto: è la somma dei fatti già scritti
    // nello stato (Diplomacy.standing in js/diplomacy.js, unica formula), e la
    // scheda li elenca uno per uno col loro segno.
    //
    // Le AZIONI non si sdoppiano: proporre, accettare e concedere restano nella
    // colonna degli araldi (#bp-diplomacy, le tre schede di sempre). Qui c'è
    // solo il collegamento — "proponi a lui" prepara il modulo di là — e lo
    // scioglimento, che passa comunque dall'unico bottone breakPactButton.
    // ============================================================

    function renderRelations(player) {
        const box = $('bp-relations');
        if (!box) return;
        if (openSheet !== 'diplomazia') { box.innerHTML = ''; return; }
        const D = window.Diplomacy;
        const visibili = diploKingdomsVisibili(player);
        box.innerHTML = '';
        if (!visibili.length) {
            box.innerHTML = '<div class="bp-empty-hint">Nessun regno in vista con cui trattare. ' +
                'Chi confina con te compare da sé; per gli altri serve una spia.</div>';
            return;
        }
        const confini = borderMap(player);
        const myTurn = isPlaying(player);
        // Il rapporto si misura con tutto quel che il gioco sa: i confini, il
        // TURNO (i torti sbiadiscono) e le due religioni di STATO — che sono
        // quelle delle Capitali, e che diplomacy.js non può leggersi da sé
        // (è puro come popularity.js: riceve i numeri, non guarda la mappa).
        const miaFede = R.stateReligionOf ? R.stateReligionOf(player) : null;
        visibili
            .map(p => ({
                p,
                st: D.standing(player, p, {
                    confinanti: (confini[p.id] || []).length > 0,
                    turno: R.turn(),
                    fedeMia: miaFede,
                    fedeSua: R.stateReligionOf ? R.stateReligionOf(p) : null
                })
            }))
            .sort((a, b) => b.st.score - a.st.score)     // prima gli amici, in fondo i nemici
            .forEach(({ p, st }) =>
                box.appendChild(relationCard(player, p, st, (confini[p.id] || []), myTurn)));
    }

    function relationCard(player, altro, st, confini, myTurn) {
        const D = window.Diplomacy;
        const card = document.createElement('div');
        card.className = 'rel-card';
        card.style.borderLeftColor = altro.color;

        // Sotto il mouse: la mappa accende solo i confini di QUESTO regno.
        card.addEventListener('mouseenter', () => {
            hotKingdomId = altro.id;
            card.classList.add('hot');
            syncBorderMarks(player);
        });
        card.addEventListener('mouseleave', () => {
            hotKingdomId = null;
            card.classList.remove('hot');
            syncBorderMarks(player);
        });

        // --- chi è, e da che parte pende il rapporto ---
        const head = document.createElement('div');
        head.className = 'rel-head';
        head.innerHTML =
            '<span class="rel-dot" style="background:' + altro.color + '"></span>' +
            '<span class="rel-name"></span><span class="rel-kind"></span>' +
            '<span class="rel-score">' + (st.score > 0 ? '+' : '') + st.score + '</span>';
        head.querySelector('.rel-name').textContent = altro.name;
        const kind = head.querySelector('.rel-kind');
        const bot = (window.Bot && altro.bot) ? window.Bot.strategyOf(altro) : null;
        kind.textContent = bot ? (bot.nome || 'IA') : 'giocatore';
        kind.classList.toggle('human', !altro.bot);
        card.appendChild(head);

        const lv = document.createElement('div');
        lv.className = 'rel-level l-' + st.level;
        lv.textContent = st.label;
        card.appendChild(lv);

        // Barra con lo zero al centro: a destra la fiducia, a sinistra il rancore.
        const largo = Math.min(50, Math.abs(st.score) / 2);
        const bar = document.createElement('div');
        bar.className = 'rel-bar';
        bar.innerHTML = '<span class="zero"></span><span class="fill ' +
            (st.score >= 0 ? 'pos' : 'neg') + '" style="' +
            (st.score >= 0 ? 'left:50%;width:' : 'right:50%;width:') + largo + '%"></span>';
        card.appendChild(bar);

        // --- i numeri secchi ---
        const viste = R.ownedPaths(altro.name).filter(p => R.isVisible(p.id)).length;
        const facts = document.createElement('div');
        facts.className = 'rel-facts';
        facts.innerHTML =
            '<span class="f">province viste <b>' + viste + '</b></span>' +
            '<span class="f">confini con te <b>' + confini.length + '</b></span>';
        card.appendChild(facts);

        // --- PERCHÉ il rapporto è quello: i fatti, col loro segno ---
        const why = document.createElement('div');
        why.className = 'rel-why';
        if (!st.why.length) {
            why.innerHTML = '<div class="w">Nessun precedente fra voi: finora vi siete solo guardati.</div>';
        } else {
            why.innerHTML = st.why.map(w =>
                '<div class="w ' + (w.delta >= 0 ? 'pos' : 'neg') + '"><b>' +
                (w.delta > 0 ? '+' : '') + w.delta + '</b><span></span></div>').join('');
            Array.from(why.querySelectorAll('.w span'))
                .forEach((el, i) => { el.textContent = st.why[i].txt; });
        }
        card.appendChild(why);

        // --- i patti in essere, con il loro scioglimento ---
        const patti = D.pactsWith(player, altro.id);
        const pacts = document.createElement('div');
        pacts.className = 'rel-pacts';
        if (!patti.length) {
            pacts.innerHTML = '<span class="bp-empty-hint">Nessun patto in essere.</span>';
        } else {
            patti.forEach(p => {
                const chip = document.createElement('span');
                chip.className = 'rel-pact';
                chip.innerHTML = '<span class="lab"></span>' +
                    (p.scad != null ? ' <span class="exp">scade al turno ' + p.scad + '</span>' : '');
                chip.querySelector('.lab').textContent = D.LABEL[p.tipo] || p.tipo;
                chip.appendChild(breakPactButton(player, altro, p, myTurn, { label: '✕', className: '' }));
                pacts.appendChild(chip);
            });
        }
        card.appendChild(pacts);

        // --- scorciatoie: nessuna azione nuova, solo il ponte con gli araldi ---
        const acts = document.createElement('div');
        acts.className = 'rel-acts';

        const prop = document.createElement('button');
        prop.type = 'button'; prop.className = 'bp-mini';
        // Il nome del regno è già scritto grande in testa alla scheda: ripeterlo
        // qui allungava il bottone oltre la sua metà di riga.
        prop.textContent = '🕊 Proponi un patto';
        prop.title = 'Prepara il modulo degli araldi qui accanto, già intestato a ' + altro.name;
        prop.addEventListener('click', () => {
            diploUI.verso = altro.id;
            renderDiplomacy(player);
            const araldi = $('bp-diplomacy');
            if (araldi && araldi.scrollIntoView) araldi.scrollIntoView({ block: 'nearest' });
        });
        acts.appendChild(prop);

        if (confini.length) {
            const look = document.createElement('button');
            look.type = 'button'; look.className = 'bp-mini';
            look.textContent = '🔍 Vedi il confine';
            look.title = 'Chiude il foglio e inquadra la frontiera fra voi';
            look.addEventListener('click', () => {
                showSheet(null);
                R.fitToProvinces(confini);
            });
            acts.appendChild(look);
        }

        // Filo privato con questo regno (proposta dell'utente: la chat privata si
        // sblocca in diplomazia). Vale per OGNI regno visibile — coi regni umani è
        // una chat vera, coi regni-bot è un canale su cui ribattono in personalità.
        // Apre il foglio 💬 sul suo canale.
        const chat = document.createElement('button');
        chat.type = 'button'; chat.className = 'rel-chat';
        chat.textContent = '💬 Messaggio privato';
        chat.title = 'Apri la chat sul filo riservato con ' + altro.name;
        chat.addEventListener('click', () => openChatWith(altro));
        acts.appendChild(chat);

        card.appendChild(acts);

        return card;
    }

    // Il bottone che SCIOGLIE un patto. Vive in un posto solo perché sta in due:
    // sulla scheda del regno (foglio 🕊) e fra gli araldi. Rompere un'ALLEANZA
    // costa prestigio e quindi passa da una conferma; i patti leggeri no.
    function breakPactButton(player, altro, pact, myTurn, opts) {
        const D = window.Diplomacy;
        const o = opts || {};
        const tradisci = D.costsPrestige(pact.tipo);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = o.className === undefined ? 'bp-mini' : o.className;
        b.textContent = o.label ||
            ((tradisci ? '⚔ Sciogli ' : '✕ Sciogli ') + (D.LABEL[pact.tipo] || pact.tipo).toLowerCase());
        b.title = tradisci
            ? 'Rompere un\'alleanza costa −' + D.BREAK_PRESTIGE + ' prestigio'
            : 'Si scioglie senza costo';
        b.disabled = !myTurn || !altro;
        b.addEventListener('click', () => {
            if (!altro) return;
            if (!tradisci) { run(GA().breakPact(player, altro.id, pact.tipo, {})); return; }
            R.confirm({
                title: 'Sciogliere l\'alleanza?',
                text: 'Rompere il patto con ' + altro.name + ' ti costa −' +
                    D.BREAK_PRESTIGE + ' prestigio. Procedo?',
                ok: 'Rompi il patto', cancel: 'Lascia stare', tone: 'danger'
            }, () => run(GA().breakPact(player, altro.id, pact.tipo, {})));
        });
        return b;
    }

    // ============================================================
    // 💬 CHAT fra i giocatori (proposta dell'utente)
    //
    // Un canale di TUTTI e un filo PRIVATO per regno, per rendere viva l'attesa
    // fra i turni. Il trasporto è la collezione `chat` di sync.js (non è stato di
    // gioco, come la presenza): ogni player scrive dal proprio browser. Le voci
    // dei bot arrivano dallo stesso canale (le scrive il browser dell'admin che
    // muove i bot), marcate come battute d'atmosfera — e mai col nome di una
    // provincia, per non far trapelare la nebbia.
    //
    // L'instradamento è per NOME di regno: un messaggio privato porta `to` (il
    // destinatario) accanto a `regno` (il mittente); il filo fra me e X sono i
    // messaggi in cui uno dei due è `regno` e l'altro `to`.
    // ============================================================

    function chatVisibleTo(m, me) {
        // Un messaggio globale (senza `to`) lo vedono tutti; un privato solo i due
        // capi del filo.
        return !m.to || m.to === me.name || m.regno === me.name;
    }
    function chatChannelOf(m, me) {
        if (!m.to) return 'all';
        return 'priv:' + (m.regno === me.name ? m.to : m.regno);
    }
    function channelKingdom(key) {
        if (!key || key.indexOf('priv:') !== 0) return null;
        const name = key.slice(5);
        return R.players().find(p => p.name === name) || null;
    }
    function chatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const p = n => String(n).padStart(2, '0');
        return p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // I canali: Tutti + un filo privato per ogni regno VISIBILE governato da una
    // persona (coi bot non si chatta in privato — non rispondono). Il canale
    // aperto resta in elenco anche se il regno è uscito di vista, per rileggerne
    // lo storico.
    function chatChannels(me) {
        const chans = [{ key: 'all', label: '🌍 Tutti', color: null }];
        // Un filo privato per OGNI regno visibile, esattamente come la diplomazia
        // (regola dell'utente): coi regni umani è una chat vera, coi regni-bot è
        // un canale su cui rispondono in personalità (vedi maybeBotReplyPrivate).
        diploKingdomsVisibili(me).forEach(p => {
            chans.push({ key: 'priv:' + p.name, label: p.name, color: p.color });
        });
        if (chatChannel !== 'all' && !chans.some(c => c.key === chatChannel)) {
            const k = channelKingdom(chatChannel);
            if (k) chans.push({ key: chatChannel, label: k.name, color: k.color });
        }
        return chans;
    }

    function chatUnread(me) {
        const map = {};
        let total = 0;
        chatMessages.forEach(m => {
            if (!chatVisibleTo(m, me) || m.regno === me.name) return;   // i miei non contano
            const key = chatChannelOf(m, me);
            if ((m.ts || 0) > (chatSeen[key] || 0)) { map[key] = (map[key] || 0) + 1; total++; }
        });
        return { map, total };
    }

    function updateChatBadge(me) {
        const badge = $('dock-badge-chat');
        if (!badge) return;
        const total = me ? chatUnread(me).total : 0;
        badge.textContent = total;
        badge.style.display = total ? '' : 'none';
    }

    function markChatSeen(channel, me) {
        let latest = 0;
        chatMessages.forEach(m => {
            if (chatVisibleTo(m, me) && chatChannelOf(m, me) === channel) latest = Math.max(latest, m.ts || 0);
        });
        if (latest > (chatSeen[channel] || 0)) {
            chatSeen[channel] = latest;
            try { localStorage.setItem('risiko_chat_seen', JSON.stringify(chatSeen)); } catch (e) { /* privato */ }
        }
    }

    function renderChat(me) {
        if (!me) return;
        // Il pallino sul dock si aggiorna SEMPRE, anche a foglio chiuso: è l'unico
        // richiamo quando la chat è nascosta.
        updateChatBadge(me);
        if (openSheet !== 'chat') return;

        const { map: unreadByChan } = chatUnread(me);
        const chans = chatChannels(me);
        if (!chans.some(c => c.key === chatChannel)) chatChannel = 'all';

        // --- barra dei canali ---
        const cbox = $('chat-channels');
        if (cbox) {
            cbox.innerHTML = chans.map(c => {
                const n = (c.key !== chatChannel) ? (unreadByChan[c.key] || 0) : 0;
                return '<button type="button" class="chat-chan' + (c.key === chatChannel ? ' on' : '') +
                    '" data-chan="' + c.key + '">' +
                    (c.color ? '<span class="chat-chan-dot" style="background:' + c.color + '"></span>' : '') +
                    '<span class="chat-chan-lab"></span>' +
                    (n ? '<span class="chat-chan-badge">' + n + '</span>' : '') +
                    '</button>';
            }).join('');
            const labs = cbox.querySelectorAll('.chat-chan-lab');
            chans.forEach((c, i) => { if (labs[i]) labs[i].textContent = c.label; });
        }

        // --- messaggi del canale aperto ---
        const log = $('chat-log');
        if (log) {
            const msgs = chatMessages.filter(m => chatVisibleTo(m, me) && chatChannelOf(m, me) === chatChannel);
            if (!msgs.length) {
                log.innerHTML = '<div class="chat-empty">' +
                    (chatChannel === 'all'
                        ? 'Ancora nessun messaggio. Rompi il ghiaccio: gli altri regni ti leggono.'
                        : 'Nessun messaggio privato con questo regno.') + '</div>';
            } else {
                log.innerHTML = msgs.map(m => {
                    const cls = 'chat-msg' + (m.regno === me.name ? ' mine' : '') + (m.bot ? ' bot' : '');
                    const priv = m.to ? '<span class="chat-priv">🔒</span>' : '';
                    return '<div class="' + cls + '">' +
                        '<div class="chat-meta">' +
                        '<span class="chat-dot" style="background:' + (m.colore || '#888') + '"></span>' +
                        '<span class="chat-who"></span>' + priv +
                        '<span class="chat-when">' + chatTime(m.ts) + '</span>' +
                        '</div><div class="chat-bubble"></div></div>';
                }).join('');
                // testo e nomi via textContent: arrivano dai dati, non si concatenano.
                const whos = log.querySelectorAll('.chat-who');
                const bubs = log.querySelectorAll('.chat-bubble');
                msgs.forEach((m, i) => {
                    if (whos[i]) whos[i].textContent = m.regno || '—';
                    if (bubs[i]) bubs[i].textContent = m.testo || '';
                });
                log.scrollTop = log.scrollHeight;
            }
        }

        // --- riga d'invio ---
        const inp = $('chat-input');
        const send = $('chat-send');
        const canWrite = typeof MultiplayerSync !== 'undefined' && !!MultiplayerSync.sendChat;
        if (inp) {
            inp.disabled = !canWrite;
            const k = channelKingdom(chatChannel);
            inp.placeholder = chatChannel === 'all'
                ? 'Scrivi a tutti…'
                : ('Messaggio privato a ' + (k ? k.name : '—') + '…');
        }
        if (send) send.disabled = !canWrite;

        // Aperto il canale, i suoi messaggi sono letti: si segna e si ridipinge il
        // pallino del dock (che avevamo calcolato PRIMA di marcare letto).
        markChatSeen(chatChannel, me);
        updateChatBadge(me);
    }

    function sendChatMessage() {
        const inp = $('chat-input');
        const me = currentPlayer();
        if (!inp || !me) return;
        const text = (inp.value || '').trim();
        if (!text) return;
        if (typeof MultiplayerSync === 'undefined' || !MultiplayerSync.sendChat) {
            showNotice('Chat non disponibile: Firebase non è configurato.');
            return;
        }
        const msg = { testo: text.slice(0, 500), regno: me.name, colore: me.color, aid: me.id, turno: R.turn() };
        if (chatChannel !== 'all') {
            const k = channelKingdom(chatChannel);
            if (k) { msg.to = k.name; msg.toId = k.id; }
        }
        MultiplayerSync.sendChat(msg);
        // Il canale aperto lo consideriamo letto fino ad ora: il proprio messaggio
        // non deve accendere il pallino a se stessi quando torna dal server.
        inp.value = '';
        inp.focus();
    }

    // Apre la chat sul filo privato con un regno (scorciatoia dalla scheda del
    // regno nel foglio 🕊). showSheet('chat') fa partire un render che disegna
    // tutto; se il foglio è già aperto si ridipinge a mano.
    function openChatWith(kingdom) {
        if (!kingdom) return;
        chatChannel = 'priv:' + kingdom.name;
        if (openSheet !== 'chat') showSheet('chat');
        else { const p = currentPlayer(); if (p) renderChat(p); }
        const inp = $('chat-input');
        if (inp) setTimeout(() => inp.focus(), 0);
    }

    // ============================================================
    // LE VOCI DEI BOT in chat (regola dell'utente)
    //
    // Un regno dell'IA non subisce soltanto il suo carattere: lo DICE. Le frasi
    // vengono dalla DOTTRINA (js/doctrines.js, campo `chat`), così i Selgiuchidi
    // si ossessionano con Bisanzio nominandolo, i nordici parlano di Finlandia,
    // l'Orda annuncia la fine del mondo appena colpisce. Un regno SENZA dottrina
    // (i dieci di partenza) ha solo la battuta generica sulla conquista.
    //
    // Le fanno parlare Bot.onEvent → botIntent (all'inizio del turno del bot) e
    // botChatter (dopo una conquista). Entrambe passano da botSay, che gira SOLO
    // sul browser che muove i bot (l'admin: niente doppioni) e lascia UNA battuta
    // per turno di bot. player-board.js le pesca e le invia: sono colore, non una
    // mossa, quindi non stanno in bot.js.
    // ============================================================

    const BOT_TAUNTS = [
        'Un altro vessillo cade sotto le nostre insegne.',
        'Le nostre schiere avanzano. Chi si oppone, cada.',
        'La corona si allarga. Tremate, vicini.',
        'Un decennio, una conquista. Così scrive la storia.',
        'Le nostre lance hanno di nuovo assaggiato il ferro.',
        'Chi confina con noi farebbe bene a pregare.',
        'La nostra ambizione non conosce inverno.',
        'Un regno si piega, e non sarà l\'ultimo.'
    ];
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    // Il nemico DICHIARATO dalla dottrina che è DAVVERO in partita (ha ancora
    // province): senza di lui le frasi che lo nominano ({nemico}) si tacciono.
    function doctrineEnemyInPlay(d) {
        if (!d || !Array.isArray(d.nemici)) return null;
        return d.nemici.find(n => R.players().some(p => p.name === n && R.ownedPaths(p.name).length)) || null;
    }

    // L'INVIO vero e proprio per conto di un bot. Scrive SOLO il browser che muove
    // i bot — lo stesso gate di Bot.run (R.isAdmin, che rispetta il DEV bypass) —
    // così la battuta esce una volta sola, dal browser che davvero comanda l'IA.
    // Invia una battuta per conto di un bot. Con `toName`/`toId` è PRIVATA (torna
    // sul filo del mittente); senza, è pubblica.
    function botEmit(botPlayer, text, toName, toId) {
        if (!botPlayer || !text) return false;
        if (typeof MultiplayerSync === 'undefined' || !MultiplayerSync.sendChat) return false;
        if (R.isAdmin && !R.isAdmin()) return false;
        const msg = {
            testo: text, regno: botPlayer.name, colore: botPlayer.color,
            aid: botPlayer.id, bot: true, turno: R.turn()
        };
        if (toName) { msg.to = toName; if (toId != null) msg.toId = toId; }
        MultiplayerSync.sendChat(msg);
        return true;
    }

    // Battuta SPONTANEA (intento/conquista): al più una per turno di bot, per non
    // intasare la chat. Le risposte alle provocazioni passano invece da botEmit
    // (una conversazione non si conta a turni).
    function botSay(botPlayer, text) {
        if (!botPlayer || !text) return false;
        if (R.isAdmin && !R.isAdmin()) return false;
        const key = botPlayer.id + '@' + R.turnoDi();
        if (botChatTurn === key) return false;    // ha già parlato questo turno
        botChatTurn = key;
        return botEmit(botPlayer, text);
    }

    // PROATTIVA: all'inizio del turno di un bot, ogni tanto ne palesa il carattere.
    // Solo i regni con dottrina (gli altri non hanno nulla da dichiarare), e mai
    // l'Orda, che resta il segreto della nebbia finché non colpisce (la sua `chat`
    // ha solo `conquista`). Le frasi sul nemico pesano DOPPIO: è l'ossessione.
    function botIntent(botPlayer) {
        if (!botPlayer || !window.Doctrines || !Doctrines.of) return;
        const d = Doctrines.of(botPlayer);
        if (!d || !d.chat) return;
        const enemy = doctrineEnemyInPlay(d);
        const bag = [];
        if (enemy && d.chat.nemico) d.chat.nemico.forEach(l => { bag.push(l); bag.push(l); });
        if (d.chat.meta) d.chat.meta.forEach(l => bag.push(l));
        if (d.chat.generico) d.chat.generico.forEach(l => bag.push(l));
        if (!bag.length) return;
        if (Math.random() > 0.3) return;          // non a ogni turno
        let line = pick(bag);
        if (line.indexOf('{nemico}') >= 0) {
            if (!enemy) return;
            line = line.split('{nemico}').join(enemy);
        }
        botSay(botPlayer, line);
    }

    // REAZIONE: dopo una conquista visibile. Se ha battuto proprio il nemico
    // dichiarato, la frase lo nomina (`nemicoVinto`); se no la sua `conquista`, e
    // in mancanza di dottrina la battuta generica. NON nomina mai la provincia —
    // è colore, non una fuga di notizie.
    function botChatter(botPlayer, result) {
        if (!botPlayer || !result || !result.conquistata) return;
        // Nebbia: se chi guarda non vede la provincia presa (né quella di partenza),
        // silenzio.
        if (result.toId && R.isVisible && !R.isVisible(result.toId) &&
            (!result.fromId || !R.isVisible(result.fromId))) return;
        if (Math.random() > 0.45) return;
        const d = (window.Doctrines && Doctrines.of) ? Doctrines.of(botPlayer) : null;
        let line = null;
        if (d && d.chat && d.chat.nemicoVinto && result.difensore &&
            Doctrines.isEnemy(d, result.difensore)) {
            line = pick(d.chat.nemicoVinto).split('{nemico}').join(result.difensore);
        } else if (d && d.chat && d.chat.conquista) {
            line = pick(d.chat.conquista);
        } else {
            line = pick(BOT_TAUNTS);
        }
        botSay(botPlayer, line);
    }

    // ============================================================
    // I BOT RISPONDONO a chi li nomina in chat pubblica (regola dell'utente)
    //
    // I dieci regni di partenza sono UMANI: possono sfottere o parlare coi regni
    // dell'IA, e questi ribattono in personalità. La replica la genera — come le
    // battute spontanee — SOLO il browser che muove i bot (botEmit → R.isAdmin),
    // così esce una volta sola. Regole per non degenerare:
    //   · solo la chat PUBBLICA (un messaggio con `to` è privato, lo si lascia stare);
    //   · non si risponde a un altro bot (niente botta-e-risposta infinito fra IA);
    //   · si risponde una sola volta per messaggio (chatAnswered) e non alla storia
    //     al primo caricamento (si semina il set con quel che c'è già);
    //   · un freno globale (una replica ogni ~4s) evita il muro di testo se un
    //     umano spamma;
    //   · l'Orda TACE (Doctrines.faithless): parla solo con la spada, resta il
    //     segreto della nebbia finché non colpisce.
    // ============================================================

    // Come si riconosce un regno-bot nominato: gli alias (i nomi che un umano
    // scrive davvero — "selgiuchidi", "turchi", "orda" — non il nome ufficiale).
    // Per un bot senza voce in tabella si ripiega sulle parole del suo nome.
    const BOT_ALIASES = {
        'Sultanato Selgiuchide': ['selgiuchid', 'turch', 'sultano', 'sultanato'],
        'Regno di Portogallo': ['portog', 'portoghes'],
        'Regno di Bulgaria': ['bulgar'],
        'Regno di Norvegia': ['norveg', 'viching'],
        'Regno di Svezia': ['svedes', 'svezia'],
        'Mongoli': ['mongol', 'orda', 'tartar']
    };
    const NAME_STOPWORDS = new Set(['regno', 'ducato', 'impero', 'califfato', 'sultanato', 'di', 'del', 'della', 'the', 'of']);
    function nameStems(name) {
        return (name || '').toLowerCase().split(/[^a-zàèéìòù]+/)
            .filter(w => w.length >= 4 && !NAME_STOPWORDS.has(w));
    }

    // Risposte generiche per un regno-bot SENZA una tabella `risposte` propria (un
    // regno di partenza che l'admin abbia messo all'IA): personalità di base.
    const REPLY_FALLBACK = {
        minaccia: [
            'Parole grosse, {mittente}. Il campo dirà chi ha ragione.',
            'Ci minacci? Ti aspettiamo al confine, {mittente}.',
            'Molti l\'hanno detto, {mittente}. Riposano tutti sotto terra.'
        ],
        pace: [
            'La pace ha un prezzo, {mittente}. Sei disposto a pagarlo?',
            'Parliamone, {mittente}, se le tue offerte sono serie.'
        ],
        saluto: ['Salute a te, {mittente}. Che tu sia amico o preda, lo vedremo.'],
        default: ['Ti ascoltiamo, {mittente}. Ma i fatti contano più delle parole.']
    };

    // Che cosa vuole chi scrive, dedotto a parole chiave (niente NLP): basta a
    // scegliere il tono della risposta.
    function classifyMessage(text) {
        const t = ' ' + (text || '').toLowerCase() + ' ';
        if (/allean|tregua|amic|pace|patto|insieme|commerci|scambi/.test(t)) return 'pace';
        if (/distrugg|conquist|mort|cadr|batter|sconfigg|annient|schiacc|attacc|guerra|vendetta|invad|brucer|distruggerò|maledett|vi prend|ti prend|nemic|codard|verme|pezzente/.test(t)) return 'minaccia';
        if (/\bciao\b|\bsalve\b|salute|buongiorno|buonasera|come va|come state/.test(t)) return 'saluto';
        return 'default';
    }

    // Il regno-bot nominato in un messaggio (o null). L'Orda è esclusa: tace.
    function mentionedBot(text) {
        const t = ' ' + (text || '').toLowerCase() + ' ';
        const bots = R.players().filter(p =>
            window.Bot && window.Bot.isBot(p) && R.ownedPaths(p.name).length);
        for (const p of bots) {
            const d = (window.Doctrines && Doctrines.of) ? Doctrines.of(p) : null;
            if (d && Doctrines.faithless && Doctrines.faithless(p)) continue;   // l'Orda tace
            const aliases = BOT_ALIASES[p.name] || nameStems(p.name);
            if (aliases.some(a => a && t.indexOf(a) >= 0)) return { player: p, doctrine: d };
        }
        return null;
    }

    // La frase con cui il bot ribatte: la sua tabella `risposte` per intento
    // (veleno speciale se a parlare è il nemico dichiarato), o il ripiego generico.
    function botReplyLine(doctrine, m) {
        const intent = classifyMessage(m.testo);
        const risposte = doctrine && doctrine.chat && doctrine.chat.risposte;
        let pool = null;
        if (risposte && risposte.nemico && Doctrines.isEnemy(doctrine, m.regno)) pool = risposte.nemico;
        else if (risposte && risposte[intent]) pool = risposte[intent];
        else if (risposte && risposte.default) pool = risposte.default;
        else pool = REPLY_FALLBACK[intent] || REPLY_FALLBACK.default;
        if (!pool || !pool.length) return null;
        let line = pick(pool).split('{mittente}').join(m.regno || 'straniero');
        if (line.indexOf('{nemico}') >= 0) {
            const enemy = doctrineEnemyInPlay(doctrine) || 'i nostri nemici';
            line = line.split('{nemico}').join(enemy);
        }
        return line;
    }

    function handleIncomingChat(msgs) {
        if (!Array.isArray(msgs)) return;
        // Risponde solo il browser che muove i bot: inutile che ogni client generi
        // la stessa replica (e la scrittura la bloccherebbe comunque botEmit).
        if (R.isAdmin && !R.isAdmin()) return;
        // Primo giro: si semina il set con lo storico già arrivato, così i bot NON
        // rispondono a tutti i messaggi vecchi in blocco al caricamento.
        if (chatAnswered === null) {
            chatAnswered = new Set(msgs.map(m => m.id));
            return;
        }
        for (const m of msgs) {
            if (!m || m.id == null || chatAnswered.has(m.id)) continue;
            chatAnswered.add(m.id);
            if (m.bot) continue;       // non si risponde a un altro bot
            if (m.to) maybeBotReplyPrivate(m);   // filo privato con un regno-bot
            else maybeBotReply(m);               // chat pubblica: chi viene nominato
        }
    }

    // PUBBLICA: chi viene nominato ribatte a tutti.
    function maybeBotReply(m) {
        const target = mentionedBot(m.testo);
        if (!target) return;
        const now = Date.now();
        if (now - lastBotReplyAt < 4000) return;   // freno anti-spam
        lastBotReplyAt = now;
        const line = botReplyLine(target.doctrine, m);
        if (!line) return;
        // Un attimo di ritardo perché sembri una risposta, non un'eco.
        setTimeout(() => botEmit(target.player, line), 700 + Math.random() * 1500);
    }

    // PRIVATA: un umano scrive in privato a un regno-bot (il canale si sblocca come
    // la diplomazia); il bot ribatte sullo STESSO filo, indirizzando la risposta al
    // mittente. Stesso carattere della chat pubblica; l'Orda resta muta anche qui.
    function maybeBotReplyPrivate(m) {
        const target = (m.toId != null && R.players().find(p => String(p.id) === String(m.toId)))
            || R.players().find(p => p.name === m.to);
        if (!target || !window.Bot || !window.Bot.isBot(target)) return;
        const d = (window.Doctrines && Doctrines.of) ? Doctrines.of(target) : null;
        if (d && Doctrines.faithless && Doctrines.faithless(target)) return;   // l'Orda tace
        const now = Date.now();
        if (now - lastBotReplyAt < 4000) return;
        lastBotReplyAt = now;
        const line = botReplyLine(d, m);
        if (!line) return;
        setTimeout(() => botEmit(target, line, m.regno, m.aid), 700 + Math.random() * 1500);
    }

    function renderDiplomacy(player) {
        const box = $('bp-diplomacy');
        if (!box) return;
        box.innerHTML = '';
        const myTurn = isPlaying(player);
        box.appendChild(diploProposeCard(player, myTurn));
        box.appendChild(diploActiveCard(player, myTurn));
        box.appendChild(diploHelpCard(player, myTurn));
        box.appendChild(diploInboxCard(player, myTurn));
    }

    function diploProposeCard(player, myTurn) {
        const card = document.createElement('div');
        card.className = 'bp-trade-card';
        card.innerHTML = '<div class="bp-trade-head">Proponi un patto</div>';

        const D = window.Diplomacy;
        const visibili = diploKingdomsVisibili(player);
        if (!visibili.length) {
            card.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Nessun regno in vista con cui trattare. Una spia allarga lo sguardo.</div>');
            return card;
        }
        if (!diploUI.verso || !visibili.some(p => p.id === diploUI.verso)) diploUI.verso = visibili[0].id;

        const row = document.createElement('div');
        row.className = 'bp-trade-row';

        const who = document.createElement('div');
        who.className = 'bp-trade-leg';
        who.innerHTML = '<span class="bp-trade-lab">con</span>';
        const selWho = document.createElement('select');
        selWho.className = 'bp-trade-sel';
        visibili.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id; o.textContent = p.name;
            if (p.id === diploUI.verso) o.selected = true;
            selWho.appendChild(o);
        });
        selWho.addEventListener('change', () => { diploUI.verso = parseInt(selWho.value, 10); renderDiplomacy(player); });
        who.appendChild(selWho);

        const what = document.createElement('div');
        what.className = 'bp-trade-leg';
        what.innerHTML = '<span class="bp-trade-lab">patto</span>';
        const selWhat = document.createElement('select');
        selWhat.className = 'bp-trade-sel';
        D.TYPES.forEach(t => {
            const o = document.createElement('option');
            o.value = t; o.textContent = D.LABEL[t];
            if (t === diploUI.tipo) o.selected = true;
            selWhat.appendChild(o);
        });
        selWhat.addEventListener('change', () => { diploUI.tipo = selWhat.value; renderDiplomacy(player); });
        what.appendChild(selWhat);

        row.appendChild(who);
        row.appendChild(what);
        card.appendChild(row);

        // Una riga che dice cosa concede e cosa costa romperlo.
        const nota = document.createElement('div');
        nota.className = 'bp-trade-cost';
        nota.textContent = pactGrantText(diploUI.tipo) + ' ' +
            (D.costsPrestige(diploUI.tipo) ? 'Rottura: −' + D.BREAK_PRESTIGE + ' prestigio.' : 'Rottura: gratis.');
        card.appendChild(nota);

        const altro = R.players().find(p => p.id === diploUI.verso);
        const chk = altro ? D.canPropose(player, altro, diploUI.tipo) : { ok: false, msg: 'Scegli un regno.' };
        const why = myTurn ? (chk.ok ? null : chk.msg) : 'Solo nel tuo turno.';
        card.appendChild(actionButton('Invia l\'araldo', null, why ? shorten(why) : null,
            () => run(GA().proposePact(player, diploUI.verso, diploUI.tipo))));
        return card;
    }

    function diploActiveCard(player, myTurn) {
        const card = document.createElement('div');
        card.className = 'bp-trade-card';
        const D = window.Diplomacy;
        const patti = (player.patti || []);
        card.innerHTML = '<div class="bp-trade-head">Patti attivi' +
            (patti.length ? ' <span class="bp-trade-badge">' + patti.length + '</span>' : '') + '</div>';
        if (!patti.length) {
            card.insertAdjacentHTML('beforeend', '<div class="bp-empty-hint">Nessun patto in vigore.</div>');
            return card;
        }
        // Raggruppa per regno: un partner può avere più patti leggeri.
        const perRegno = new Map();
        patti.forEach(p => {
            const k = String(p.con);
            if (!perRegno.has(k)) perRegno.set(k, []);
            perRegno.get(k).push(p);
        });
        perRegno.forEach((lista, con) => {
            const altro = R.players().find(p => String(p.id) === con);
            const item = document.createElement('div');
            item.className = 'bp-trade-offer';
            const chips = lista.map(p => {
                const scad = p.scad != null ? ' <em>(scade al ' + p.scad + ')</em>' : '';
                return D.LABEL[p.tipo] + scad;
            }).join(' · ');
            item.innerHTML =
                '<div class="bp-trade-offer-head"><span class="bp-trade-dot" style="background:' +
                ((altro && altro.color) || '#888') + '"></span><span class="bp-trade-from"></span></div>' +
                '<div class="bp-trade-terms" style="flex-wrap:wrap">' + chips + '</div>';
            item.querySelector('.bp-trade-from').textContent = altro ? altro.name : 'Regno scomparso';

            const acts = document.createElement('div');
            acts.className = 'bp-trade-acts';
            // Un bottone solo, condiviso con le schede del foglio 🕊
            // (breakPactButton): la conferma dell'alleanza vive lì dentro.
            lista.forEach(p => acts.appendChild(breakPactButton(player, altro, p, myTurn)));
            item.appendChild(acts);

            // Concessione d'attacco: se c'è un patto di non aggressione, puoi
            // permettere al partner di colpire UNA tua provincia senza rottura.
            if (altro && D.grantsNonAggression(player, altro)) {
                item.appendChild(diploConsentRow(player, altro, myTurn));
            }
            // ACCESSO MILITARE: con l'alleanza (o il patto dei rinforzi) puoi
            // CHIEDERGLI uomini, dicendo dove servono. È l'altra metà di quel
            // privilegio — mandare si fa dalla mappa, in fase d'attacco.
            if (altro && D.allowsReinforce(player, altro)) {
                item.appendChild(diploHelpRow(player, altro, myTurn));
            }
            card.appendChild(item);
        });
        return card;
    }

    // Riquadro "concedi attacco": scegli una tua provincia e la offri al partner.
    function diploConsentRow(player, altro, myTurn) {
        const wrap = document.createElement('div');
        wrap.className = 'bp-trade-row';
        wrap.style.marginTop = '4px';
        const mie = R.ownedPaths(player.name);
        const sel = document.createElement('select');
        sel.className = 'bp-trade-sel';
        const key = String(altro.id);
        mie.forEach(pt => {
            const o = document.createElement('option');
            o.value = pt.id; o.textContent = R.provinceLabel(pt);
            if (diploUI.consenso[key] === pt.id) o.selected = true;
            sel.appendChild(o);
        });
        if (!diploUI.consenso[key] && mie[0]) diploUI.consenso[key] = mie[0].id;
        sel.addEventListener('change', () => { diploUI.consenso[key] = sel.value; });
        wrap.appendChild(sel);
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'bp-mini';
        b.textContent = '🏳 Concedi attacco';
        b.title = 'Permetti a ' + altro.name + ' di attaccare questa provincia senza rompere il patto';
        b.disabled = !myTurn;
        b.addEventListener('click', () => run(GA().grantAttack(player, altro.id, diploUI.consenso[key] || (mie[0] && mie[0].id))));
        wrap.appendChild(b);
        return wrap;
    }

    // Riquadro "chiedi rinforzi": scegli una TUA provincia e gli dici che è lì
    // che il fronte cede (regola dell'utente: "lo si potesse esplicitamente
    // chiedere indicando dove servirebbe averli"). È un messaggio, non un
    // obbligo: l'alleato deciderà se marciare.
    function diploHelpRow(player, altro, myTurn) {
        const wrap = document.createElement('div');
        wrap.className = 'bp-trade-row';
        wrap.style.marginTop = '4px';
        const mie = R.ownedPaths(player.name);
        const sel = document.createElement('select');
        sel.className = 'bp-trade-sel';
        const key = 'h' + altro.id;
        // Le province più scoperte in cima: è lì che serve aiuto, ed è la sola
        // cosa che il giocatore deve poter trovare senza cercare.
        mie.slice()
            .sort((a, b) => R.countPiece(a, 'soldato') - R.countPiece(b, 'soldato'))
            .forEach(pt => {
                const o = document.createElement('option');
                o.value = pt.id;
                o.textContent = R.provinceLabel(pt) + ' (' + R.countPiece(pt, 'soldato') + ')';
                if (diploUI.consenso[key] === pt.id) o.selected = true;
                sel.appendChild(o);
            });
        if (!diploUI.consenso[key] && sel.options.length) diploUI.consenso[key] = sel.options[0].value;
        sel.addEventListener('change', () => { diploUI.consenso[key] = sel.value; });
        wrap.appendChild(sel);
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'bp-mini';
        b.textContent = '🆘 Chiedi rinforzi';
        b.title = 'Chiedi a ' + altro.name + ' di mandare uomini in questa provincia';
        b.disabled = !myTurn;
        b.addEventListener('click', () =>
            run(GA().askReinforcements(player, altro.id, diploUI.consenso[key] || (sel.options[0] && sel.options[0].value))));
        wrap.appendChild(b);
        return wrap;
    }

    // Le richieste d'aiuto: quelle ARRIVATE (a cui rispondere marciando) e quelle
    // MANDATE (che si possono ritirare). Vivono in una card sola perché sono la
    // stessa conversazione vista dai due capi.
    function diploHelpCard(player, myTurn) {
        const card = document.createElement('div');
        const inbox = GA().helpInbox(player);
        const outbox = GA().helpOutbox(player);
        card.className = 'bp-trade-card';
        card.innerHTML = '<div class="bp-trade-head">Richieste di rinforzi' +
            (inbox.length ? ' <span class="bp-trade-badge">' + inbox.length + '</span>' : '') + '</div>';
        if (!inbox.length && !outbox.length) {
            card.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Nessuna richiesta. Con un\'alleanza (o il patto dei rinforzi) ' +
                'puoi chiedere uomini indicando dove servono, e mandarne tu dalla fase d\'attacco.</div>');
            return card;
        }
        inbox.forEach(h => {
            const chi = R.players().find(p => String(p.id) === String(h.da));
            const item = document.createElement('div');
            item.className = 'bp-trade-offer';
            item.innerHTML =
                '<div class="bp-trade-offer-head"><span class="bp-trade-dot" style="background:' +
                ((chi && chi.color) || '#888') + '"></span><span class="bp-trade-from"></span></div>' +
                '<div class="bp-trade-terms"></div>';
            item.querySelector('.bp-trade-from').textContent = (chi ? chi.name : 'Un alleato') + ' chiede aiuto';
            item.querySelector('.bp-trade-terms').textContent = provNameOf(h.prov) +
                ' · turno ' + (h.turno || R.turn());
            const acts = document.createElement('div');
            acts.className = 'bp-trade-acts';
            const look = document.createElement('button');
            look.type = 'button'; look.className = 'bp-mini';
            look.textContent = '🔍 Guarda il fronte';
            look.title = 'Chiude il foglio e inquadra la provincia: da una tua confinante, ' +
                'in fase d\'attacco, potrai marciare in aiuto';
            look.addEventListener('click', () => { showSheet(null); R.fitToProvinces([h.prov]); });
            acts.appendChild(look);
            item.appendChild(acts);
            card.appendChild(item);
        });
        outbox.forEach(h => {
            const item = document.createElement('div');
            item.className = 'bp-trade-offer';
            item.innerHTML = '<div class="bp-trade-offer-head"><span class="bp-trade-from"></span></div>' +
                '<div class="bp-trade-terms"></div>';
            item.querySelector('.bp-trade-from').textContent = 'Hai chiesto aiuto a ' + h.aNome;
            item.querySelector('.bp-trade-terms').textContent = provNameOf(h.prov);
            const acts = document.createElement('div');
            acts.className = 'bp-trade-acts';
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'bp-mini';
            b.textContent = '✕ Ritira';
            b.disabled = !myTurn;
            b.addEventListener('click', () => run(GA().cancelHelp(player, h.a, h.prov)));
            acts.appendChild(b);
            item.appendChild(acts);
            card.appendChild(item);
        });
        return card;
    }

    function provNameOf(provId) {
        const p = R.engine && R.engine.path(provId);
        return p ? R.provinceLabel(p) : provId;
    }

    function diploInboxCard(player, myTurn) {
        const card = document.createElement('div');
        card.className = 'bp-trade-card';
        const D = window.Diplomacy;
        const list = (player.pattiProposte || []);
        card.innerHTML = '<div class="bp-trade-head">Araldi alla porta' +
            (list.length ? ' <span class="bp-trade-badge">' + list.length + '</span>' : '') + '</div>';
        if (!list.length) {
            card.insertAdjacentHTML('beforeend', '<div class="bp-empty-hint">Nessuna proposta in arrivo.</div>');
            return card;
        }
        list.forEach(off => {
            const mitt = R.players().find(p => p.id === off.da);
            const item = document.createElement('div');
            item.className = 'bp-trade-offer';
            item.innerHTML =
                '<div class="bp-trade-offer-head"><span class="bp-trade-dot" style="background:' +
                ((mitt && mitt.color) || '#888') + '"></span><span class="bp-trade-from"></span></div>' +
                '<div class="bp-trade-terms">' + D.LABEL[off.tipo] + '</div>';
            item.querySelector('.bp-trade-from').textContent = (mitt ? mitt.name : 'Un regno') + ' propone';

            const acts = document.createElement('div');
            acts.className = 'bp-trade-acts';
            const yes = document.createElement('button');
            yes.type = 'button'; yes.className = 'bp-mini'; yes.textContent = '✓ Accetta';
            yes.disabled = !myTurn;
            yes.addEventListener('click', () => run(GA().acceptPact(player, off.id)));
            const no = document.createElement('button');
            no.type = 'button'; no.className = 'bp-mini'; no.textContent = '✕ Rifiuta';
            no.disabled = !myTurn;
            no.addEventListener('click', () => run(GA().declinePact(player, off.id)));
            acts.appendChild(yes); acts.appendChild(no);
            item.appendChild(acts);
            card.appendChild(item);
        });
        return card;
    }

    // ---------- diplomazia: avvisi dai patti (§Diplomazia) ----------
    // Gli ESITI dei patti (accettato / sciolto / TRADITO / scaduto / consenso
    // concesso) arrivano spesso nel turno di un altro regno: il giocatore li
    // scopre QUI, all'apertura del suo, con la stessa pergamena degli editti.
    // game-actions li lascia in player.pattiAvvisi; qui si srotolano una volta.
    function pactLabel(tipo) {
        return (typeof Diplomacy !== 'undefined' && Diplomacy.LABEL && Diplomacy.LABEL[tipo]) || 'patto';
    }
    function showPendingPactNotices(player) {
        const attesa = (player.pattiAvvisi || []).filter(a => !a.letto);
        if (!attesa.length || !R.showFoundation) return;
        if (!isPlaying(player)) return;
        // Una pergamena per volta (#ui-foundation): editti, mare e commerci hanno
        // la precedenza, questa aspetta il render dopo.
        if ((player.editti || []).some(e => !e.letto)) return;
        if ((player.spedizioniAvvisi || []).some(a => !a.letto)) return;
        if ((player.commerciAvvisi || []).some(a => !a.letto)) return;

        attesa.forEach(a => { a.letto = true; });
        R.save();

        const provLabel = id => { const p = R.engine && R.engine.path(id); return p ? R.provinceLabel(p) : id; };
        const riga = a => {
            const patto = pactLabel(a.patto);
            switch (a.tipo) {
                case 'accettato': return a.conNome + ' ha accettato: ' + patto.toLowerCase() + ' in vigore.';
                case 'rotto': return a.conNome + ' ha sciolto il patto con te (' + patto.toLowerCase() + ').';
                case 'tradito': return a.conNome + ' ti ha TRADITO: ha infranto ' + patto.toLowerCase() + ' e ti ha attaccato.';
                case 'scaduto': return 'L\'accordo con ' + a.conNome + ' (' + patto.toLowerCase() + ') è giunto a scadenza.';
                case 'consenso': return a.conNome + ' ti concede di attaccare ' + provLabel(a.prov) + ' senza rompere il patto.';
                case 'aiuto': return a.conNome + ' chiede rinforzi a ' + provLabel(a.prov) +
                    ': marcia in aiuto da una tua provincia confinante, in fase d\'attacco.';
                case 'rinforzi': return a.conNome + ' ha mandato ' + (a.uomini || 0) +
                    (a.uomini === 1 ? ' uomo' : ' uomini') + ' in tuo aiuto a ' + provLabel(a.prov) +
                    ': sono tuoi.';
                default: return '';
            }
        };
        const tradito = attesa.some(a => a.tipo === 'tradito');
        const primo = attesa[0];
        const anno = (typeof Chronicle !== 'undefined' && Chronicle.yearOfTurn)
            ? Chronicle.yearOfTurn(primo.turno || R.turn())
            : (primo.turno || R.turn());
        R.showFoundation({
            tipo: tradito ? 'tradimento' : 'patto',
            anno,
            regno: player.name,
            colore: player.color,
            titolo: tradito ? 'Un araldo reca cattive nuove' : 'Un araldo reca notizia',
            testo: attesa.map(riga).filter(Boolean).join('\n\n'),
            nota: attesa.length > 1 ? attesa.length + ' notizie ti attendevano.' : ''
        });
    }

    // ---------- diplomazia: proposte di patto in arrivo (§Diplomazia) ----------
    // (regola dell'utente) Come le richieste di commercio, una proposta di patto
    // deve COMPARIRE a inizio turno, non restare nascosta in un pannello: un
    // pop-up per accettarla o rifiutarla lì. Una per volta, cedendo il passo alle
    // pergamene. "Più tardi" (Esc/click fuori) la lascia in sospeso: torna al
    // render successivo. Le proposte vivono in player.pattiProposte finché non si
    // decide, quindi non serve un flag "letto".
    function pactGrantText(tipo) {
        switch (tipo) {
            case 'alleanza': return 'Concede tutto: non vi attaccate, visione condivisa e accesso militare reciproco.';
            case 'alleanzaTempo': return 'Tutti i privilegi dell\'alleanza, per ' +
                ((typeof Diplomacy !== 'undefined' && Diplomacy.TIMED) || 5) + ' turni, poi scade da sé.';
            case 'nonBelligeranza': return 'Un impegno a non attaccarvi.';
            case 'rinforzi': return 'Accesso militare: rinforzi e passaggio fra i vostri territori.';
            case 'vista': return 'Vi vedrete a vicenda oltre la nebbia.';
            default: return '';
        }
    }
    // Le proposte a cui il giocatore ha GIÀ risposto (accettate o rifiutate) in
    // questa sessione. Serve perché la risposta rimuove la proposta dallo stato
    // locale, ma un'eco stantia dal cloud (o un refresh del driver dei bot) può
    // ri-aggiungerla a `pattiProposte` prima che la scrittura propaghi: senza
    // questo filtro il pop-up dell'araldo si ripresentava 2-3 volte anche dopo
    // aver risposto (bug segnalato dall'utente). Le proposte ids sono unici
    // (newTradeId), quindi sopprimere per id è sicuro. "Decido dopo" (Esc/click
    // fuori) NON segna la proposta come risposta: resta in coda e torna al turno
    // successivo, come deve.
    let pactAnswered = new Set();
    function showPendingPactProposals(player) {
        if (!isPlaying(player) || !R.confirm) return;
        const list = (player.pattiProposte || []).filter(o => o && !pactAnswered.has(o.id));
        if (!list.length) return;
        // Una modale per volta: se una pergamena o un'altra conferma è aperta,
        // si riprova al render dopo.
        if (document.getElementById('ui-foundation') || document.getElementById('ui-confirm')) return;

        const off = list[0];
        const mittente = R.players().find(p => p.id === off.da);
        const nome = mittente ? mittente.name : 'Un regno';
        const costa = typeof Diplomacy !== 'undefined' && Diplomacy.costsPrestige && Diplomacy.costsPrestige(off.tipo);
        R.confirm({
            title: 'Un araldo alla tua corte',
            text: 'Un messo di ' + nome + ' reca una proposta di ' + pactLabel(off.tipo).toLowerCase() + '. ' +
                pactGrantText(off.tipo) + ' ' +
                (costa ? 'Un\'alleanza, se rotta, costa prestigio a chi tradisce.'
                       : 'È un patto leggero: si può sciogliere senza costo.'),
            ok: 'Accetta',
            cancel: 'Rifiuta'
        },
        () => { pactAnswered.add(off.id); run(GA().acceptPact(player, off.id)); },
        () => { pactAnswered.add(off.id); run(GA().declinePact(player, off.id)); });
    }

    // ---------- schieramento automatico dei rinforzi obbligatori ----------
    // (richiesta dell'utente) I rinforzi OBBLIGATORI (Capitale +1, Città +1,
    // Fortezza +5) hanno una destinazione sola: non c'è niente da decidere, e
    // nemmeno da confermare. A inizio turno si posano TUTTI da soli, senza
    // pop-up né avviso: il giocatore se li ritrova già al loro posto. Una
    // volta per turno.
    let boundDeployedFor = null;

    function autoDeployBound(player) {
        if (!isPlaying(player) || !inPhase(player, 'schiera')) return;
        if (!GA().boundTotal(player)) return;
        const key = player.id + '@' + R.turn();
        if (boundDeployedFor === key) return;
        boundDeployedFor = key;
        run(GA().deployAllBound(player));
    }

    function render() {
        // In solitaria la plancia segue il turno: se è cambiato regno, enterKingdom
        // ha già rifatto il render e questo va lasciato cadere.
        if (followTurn()) return;
        const player = currentPlayer();
        if (!player) return;

        // Turno nuovo: si riparte senza selezione ereditata. In partita normale
        // (un solo umano) enterKingdom non viene richiamato a ogni turno, quindi
        // la provincia scelta nell'ultima fase del turno prima resterebbe
        // selezionata — e il cursore di schieramento comparirebbe subito su di
        // essa. (richiesta dell'utente) In schieramento si deve prima cliccare
        // una provincia. Una volta per turno del regno.
        const turnKey = player.id + '@' + R.turn();
        if (turnKey !== lastTurnKey) {
            lastTurnKey = turnKey;
            selectedProvId = null;
            moveArmed = false;
        }

        const paths = R.ownedPaths(player.name);
        const snapshot = snapshotProvinces(player);
        const units = KingdomStats.countUnits(snapshot);
        const capitalPath = R.getCapitalPathFor(player);
        const connectedSet = GA().connectedOf(player);
        const pop = capitalPath ? R.computePopularity(player, capitalPath, connectedSet) : null;

        syncEditorLink();
        renderTopbar(player, paths);
        renderPrestige(player);
        renderObjectives(player);
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
        renderMarketPulse(player);
        renderDiplomacy(player);
        renderRelations(player);
        renderChat(player);
        syncDockBadges(player);
        renderConquest(player);
        renderCapitalChoice(player);
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
        // I confini coi regni di giocatori: strato a parte, non c'entra con le
        // fasi e resta acceso anche quando i bersagli si spengono.
        syncBorderMarks(player);
        renderTreasury(player, units, snapshot, connectedSet, pop);
        renderArmy(paths, units, pop, capitalPath, connectedSet);
        renderLegend(player);

        // Cartella aperta ≠ fase in corso: i comandi di quella cartella si
        // spengono in blocco. L'elenco delle province resta vivo apposta —
        // i suoi + e − esistono solo nella fase 1 vera, e da lì si seleziona
        // una provincia anche mentre si sbircia un'altra cartella.
        if (peeking(player)) {
            ['fase-schiera', 'fase-spie', 'fase-sposta', 'bp-actions'].forEach(id => freeze($(id)));
        }

        if (!hasFitted && paths.length && R.mapReady()) {
            hasFitted = R.fitToProvinces(paths.map(p => p.id));
        }

        // In coda al render: la pergamena non deve rubare il focus ai comandi
        // mentre la plancia si sta ancora ridisegnando (stessa ragione per cui
        // le fondazioni si srotolano dopo render() in run()).
        showPendingEventi(player);
        showPendingEditti(player);
        showPendingWrecks(player);
        showPendingCommerci(player);
        showPendingPactNotices(player);
        showPendingPactProposals(player);
        showPendingWelfare(player);
        showPendingLeva(player);
        showPendingCronache(player);
        showConquestPrompt(player);
        autoDeployBound(player);
    }

    // ---------- manutenzione delle migliorie civiche (§6.1) ----------
    // Ogni 5 turni le migliorie reclamano 1 risorsa (game-actions.maintainWelfare,
    // auto-pagata). L'esito di chi è andato dormiente / si è riattivato / è
    // crollato attende in player.welfareAvvisi; qui lo si srotola una volta sola,
    // con la stessa pergamena degli avvisi di mare. Cede la precedenza a editti,
    // mare, commerci e patti: una pergamena per volta (#ui-foundation).
    function showPendingWelfare(player) {
        const attesa = (player.welfareAvvisi || []).filter(a => !a.letto);
        if (!attesa.length || !R.showFoundation) return;
        if (!isPlaying(player)) return;
        if ((player.editti || []).some(e => !e.letto)) return;
        if ((player.spedizioniAvvisi || []).some(a => !a.letto)) return;
        if ((player.commerciAvvisi || []).some(a => !a.letto)) return;
        if ((player.pattiAvvisi || []).some(a => !a.letto)) return;

        attesa.forEach(a => { a.letto = true; });
        R.save();

        const verbo = { dormiente: 'è andata dormiente', riattivata: 'è tornata attiva', crollata: 'è CROLLATA' };
        const resLabel = k => (GR().RES_LABEL && GR().RES_LABEL[k]) || k;
        const righe = [];
        let crolli = 0;
        attesa.forEach(a => (a.eventi || []).forEach(ev => {
            if (ev.esito === 'crollata') crolli++;
            const nome = GR().welfareLabel(ev.key);
            let frase = nome + ' ' + (verbo[ev.esito] || ev.esito);
            if (ev.esito === 'dormiente') frase += ': mancava 1 ' + resLabel(ev.res) +
                '. Procurala entro la prossima manutenzione o crollerà.';
            else if (ev.esito === 'crollata') frase += ': senza 1 ' + resLabel(ev.res) +
                ' per due manutenzioni. Per riaverla va ricostruita a prezzo pieno.';
            else frase += ' (1 ' + resLabel(ev.res) + ' versata).';
            righe.push(frase);
        }));
        if (!righe.length) return;
        const anno = (typeof Chronicle !== 'undefined' && Chronicle.yearOfTurn)
            ? Chronicle.yearOfTurn(attesa[0].turno || R.turn()) : (attesa[0].turno || R.turn());
        R.showFoundation({
            tipo: 'manutenzione',
            anno,
            regno: player.name,
            colore: player.color,
            titolo: crolli ? 'Le opere della Capitale rovinano' : 'Manutenzione della Capitale',
            testo: righe.join('\n\n'),
            nota: 'Le migliorie civiche reclamano un contributo ogni 5 turni (§6.1).'
        });
    }

    // ---------- la LEVA degli obiettivi (§10, regola dell'utente) ----------
    // Chiuso un ciclo, ogni obiettivo compiuto ha versato altrettanti soldati
    // nelle reclute libere (GameActions.closeCycle). Il giocatore lo scopre qui,
    // all'apertura del suo primo turno del ciclo nuovo: gli uomini non compaiono
    // di nascosto. Ultima della fila — un evento storico, un editto o un
    // naufragio hanno la precedenza: una pergamena per volta (#ui-foundation).
    function showPendingLeva(player) {
        const attesa = (player.obiettiviAvvisi || []).filter(a => !a.letto);
        if (!attesa.length || !R.showFoundation) return;
        if (!isPlaying(player)) return;
        if ((player.eventiAvvisi || []).some(a => !a.letto)) return;
        if ((player.editti || []).some(e => !e.letto)) return;
        if ((player.spedizioniAvvisi || []).some(a => !a.letto)) return;
        if ((player.commerciAvvisi || []).some(a => !a.letto)) return;
        if ((player.pattiAvvisi || []).some(a => !a.letto)) return;
        if ((player.welfareAvvisi || []).some(a => !a.letto)) return;

        attesa.forEach(a => { a.letto = true; });
        R.save();

        const tot = attesa.reduce((n, a) => n + (a.leva || 0), 0);
        if (!tot) return;
        const righe = [];
        attesa.forEach(a => {
            (a.fatti || []).forEach(f => righe.push(f.titolo + ' — ' + f.punti +
                ' uomin' + (f.punti === 1 ? 'o' : 'i')));
        });
        const primo = attesa[0];
        const anno = (typeof Chronicle !== 'undefined' && Chronicle.yearOfTurn)
            ? Chronicle.yearOfTurn(primo.turno || R.turn()) : (primo.turno || R.turn());
        R.showFoundation({
            tipo: 'leva',
            anno,
            regno: player.name,
            colore: player.color,
            titolo: 'La leva risponde alla corona',
            testo: 'Le imprese del ciclo che si è chiuso hanno acceso il regno: ' +
                tot + ' uomin' + (tot === 1 ? 'o si presenta' : 'i si presentano') +
                ' alle armi.\n\n' + righe.join('\n'),
            nota: 'Li trovi fra le reclute libere: schierali dove vuoi, in questo turno o nei prossimi.'
        });
    }

    // ---------- cronache storiche (js/chronicles.js) ----------
    // Le VIGNETTE del regno: quando la situazione tocca una soglia evocativa (la
    // marina inglese col primo Veliero, il feudo di Francia, i cavalieri teutonici
    // con la prima Fortezza), si srotola una pergamena di colore. Nessun effetto
    // sulla mappa — è racconto. La logica di scelta e di rarità sta in chronicles.js
    // (puro): qui costruiamo la situazione con Risiko.objectiveContext — lo stesso
    // metro degli obiettivi — e teniamo i libri mastri sul record del giocatore.
    //
    // È l'ULTIMA della catena di pergamene e cede a tutte le altre (una pergamena
    // per volta, #ui-foundation): un evento storico, un editto, la leva contano di
    // più di un colore di cronaca. La rarità (COOLDOWN in chronicles.js) fa il
    // resto: fra una cronaca e l'altra passano decenni.
    function showPendingCronache(player) {
        if (!R.showFoundation || !window.Chronicles || !window.Chronicles.pick) return;
        if (!isPlaying(player)) return;
        // Cede a ogni altra pergamena in coda: la cronaca è la meno urgente.
        if ((player.eventiAvvisi || []).some(a => !a.letto)) return;
        if ((player.editti || []).some(e => !e.letto)) return;
        if ((player.spedizioniAvvisi || []).some(a => !a.letto)) return;
        if ((player.commerciAvvisi || []).some(a => !a.letto)) return;
        if ((player.pattiAvvisi || []).some(a => !a.letto)) return;
        if ((player.welfareAvvisi || []).some(a => !a.letto)) return;
        if ((player.obiettiviAvvisi || []).some(a => !a.letto)) return;

        const turno = R.turn();
        // Una cronaca per turno al massimo, e mai dentro la finestra di silenzio.
        if (player.cronacaUltima === turno) return;
        const COOLDOWN = window.Chronicles.COOLDOWN || 5;
        if (player.cronacaUltima && (turno - player.cronacaUltima) < COOLDOWN) return;
        // Già valutato il catalogo per questo regno in questo turno: niente da dire.
        if (chronicleCheckedAt[player.id] === turno) return;
        chronicleCheckedAt[player.id] = turno;

        const c = R.objectiveContext && R.objectiveContext(player);
        if (!c) return;
        const wronged = Array.isArray(player.rancore) && player.rancore.length > 0;
        const pick = window.Chronicles.pick({
            nome: player.name, turno, c, wronged,
            fatti: player.cronacheFatte || [],
            since: player.cronacaUltima ? (turno - player.cronacaUltima) : Infinity
        });
        if (!pick) return;

        player.cronacheFatte = (player.cronacheFatte || []).concat(pick.id);
        player.cronacaUltima = turno;
        R.save();

        const anno = (typeof Chronicle !== 'undefined' && Chronicle.yearOfTurn)
            ? Chronicle.yearOfTurn(turno) : turno;
        R.showFoundation({
            tipo: 'cronaca',
            anno,
            regno: player.name,
            colore: player.color,
            titolo: pick.titolo,
            testo: pick.testo,
            nota: pick.nota
        });
    }

    // ---------- selezione dalla mappa ----------

    // Un clic sulla mappa è una SELEZIONE o un ORDINE, e a deciderlo è la
    // provincia: se è accesa come bersaglio della fase in corso (orderTargets)
    // il clic apre il cursore d'ordine invece di spostare la selezione. È il
    // motivo per cui la selezione non si perde a metà di un attacco.
    document.addEventListener('click', (e) => {
        const path = e.target.closest && e.target.closest('path.state');
        if (!path) return;
        // Isolotto non giocabile (isole senza risorse/utilità): è solo scenario,
        // il clic non seleziona nulla — resta la selezione precedente.
        if (R.isPlayable && !R.isPlayable(path.id)) return;
        // Tornato a toccare la mappa, lo spotlight di un obiettivo ha finito il
        // suo compito: si spegne, così non resta acceso a intralciare.
        if (R.clearObjectiveSpot) R.clearObjectiveSpot();
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
            if (evt.type === 'start') { aiLog(evt.player, null); botIntent(evt.player); return; }
            if (evt.type === 'action') {
                aiLog(evt.player, evt.result);
                // Voce del bot in chat: una battuta d'atmosfera sulle conquiste
                // (dentro botChatter: solo l'admin la scrive, rispetta la nebbia,
                // non nomina province, al più una per turno).
                botChatter(evt.player, evt.result);
                return;
            }
            // Fine turno di un bot: a giro finito può portare razzie delle terre
            // di nessuno (gli scismi si srotolano da soli in app.js).
            if (evt.type === 'end') { if (evt.result && evt.result.razzie) reportRaids(evt.result.razzie); return; }
            if (evt.type === 'idle') { render(); }
        };
    }

    function boot(attempt) {
        let player = resolvePlayer();
        const hasCode = !!new URLSearchParams(location.search).get('p');
        // Più regni tuoi (solitaria, o 2+ regni con l'IA sugli altri): la plancia si
        // apre senza codice d'invito. Si entra nel regno umano di turno; se al
        // caricamento tocca a un bot, si entra nel primo regno umano e Bot.run()
        // porta il giro fino al prossimo turno umano, che followTurn seguirà.
        // Col codice d'invito questo fallback NON scatta: si aspetta che il codice
        // risolva al suo regno, non si entra in un umano qualsiasi.
        if (!player && !hasCode && followEnabled()) {
            const t = R.turnoDi();
            const tp = R.players().find(p => p.id === t) || null;
            player = (tp && window.Bot && !window.Bot.isBot(tp))
                ? tp
                : humanPlayers()[0] || null;
        }
        // Col codice d'invito si ritenta più a lungo: i codici arrivano con
        // l'autosave (in locale subito, online via Firebase anche dopo un secondo)
        // e non si deve mai ripiegare su un altro regno mentre si aspetta.
        const maxAttempts = hasCode ? 60 : 12;
        if (player) {
            enterKingdom(player);
            syncSpectateBtn();
            syncSpeedBtn();
            // Se al caricamento tocca a un regno dell'IA, la partita riparte da sé
            // (dal lease: con più tab admin ne guida uno solo — §multi-tab).
            if (R.driveBots) R.driveBots(); else if (window.Bot) window.Bot.run();
            return;
        }
        if (attempt < maxAttempts) { setTimeout(() => boot(attempt + 1), 120); return; }
        showPicker();
    }
    boot(0);
});

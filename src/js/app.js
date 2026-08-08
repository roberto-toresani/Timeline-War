// TEMP (fase di test): quando true, tutti hanno permessi admin senza bisogno di login.
// Rimettere a false quando il gioco sarà pronto per il rilascio, cosi' la mappa condivisa
// tornera' modificabile solo dopo autenticazione Firebase con UID = ADMIN_UID.
const DEV_ADMIN_BYPASS = true;

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
    let ROADS = [];          // strade tra province: [{a, b, c}] (a,b = id province adiacenti, c = colore)
    let pendingRoad = null;  // id della prima provincia scelta col pennello strada (attesa della seconda)
    let isAdminMode = false;
    let selectedTabPlayerId = null; // null = main view (no focus, no fog)
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
        if (!p.temporanei) p.temporanei = {};
        // Fase del turno (§2): schiera → costruisci → attacca → sposta. Uno stato
        // salvato prima delle fasi riparte dallo schieramento, che è corretto.
        if (!p.fase) p.fase = 'schiera';
        if (typeof p.spostamentoFatto !== 'boolean') p.spostamentoFatto = false;
        if (p.conquista === undefined) p.conquista = null;
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

        // Solo i territori giocabili (class="state"): esclude sfondo, bordi e pattern dell'SVG.
        const paths = svg.querySelectorAll('path.state');
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
                    showResourceInfo(next);
                    saveAutoSave();
                    return;
                }

                // Pennello STRADA: collega due province cliccandole in sequenza.
                // La strada compare a meta' del confine tra le due (province adiacenti).
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
                        if (path.getAttribute('data-pieces')) {
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
                if (!path.getAttribute('data-pieces')) path.removeAttribute('data-pc-color');
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
        } else {
            loadAutoSave();
        }
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
        return Array.from(root.querySelectorAll('path.state')).filter(p => p.id);
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

        const size = Math.max(3, Math.min(Math.min(mw, mh) * 0.5, 11));
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

    // Elenco (validato, con quantita') delle figure di una provincia: [{type,count}].
    function piecesOf(path) {
        const raw = path.getAttribute('data-pieces');
        if (!raw) return [];
        const out = [];
        raw.split(',').forEach(tok => {
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

    function serializePieces(arr) {
        return arr.filter(e => e.count > 0).map(e => e.type + ':' + e.count).join(',');
    }

    // Applica una lista [{type,count}] alla provincia (svuota gli attributi se vuota).
    function setPieces(path, arr) {
        const s = serializePieces(arr);
        if (s) path.setAttribute('data-pieces', s);
        else { path.removeAttribute('data-pieces'); path.removeAttribute('data-pc-color'); }
    }

    // +1 / -1 di un tipo (rispetta il max; '__erase__' svuota tutto).
    function changePiece(path, type, delta) {
        if (type === '__erase__') { path.removeAttribute('data-pieces'); path.removeAttribute('data-pc-color'); return; }
        if (typeof PIECES === 'undefined' || !PIECES[type]) return;
        const max = pieceMax(type);
        const arr = piecesOf(path);
        const e = arr.find(x => x.type === type);
        if (!e) { if (delta > 0) arr.push({ type, count: Math.min(delta, max) }); }
        else { e.count = Math.max(0, Math.min(e.count + delta, max)); }
        setPieces(path, arr);
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
        const sizeBase = Math.min(bb.w, bb.h) * 0.30;

        const land = arr.filter(e => SHIP_TYPES.indexOf(e.type) < 0 && e.type !== 'strada');
        const ships = arr.filter(e => SHIP_TYPES.indexOf(e.type) >= 0);

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
        let size = Math.max(2.5, Math.min(sizeBase, 8));
        const gapR = 0.12;
        let totalW = n * size + (n - 1) * size * gapR;
        if (totalW > maxW) { size *= maxW / totalW; totalW = maxW; }
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

            if (e.count > 1) {
                const bx = x + size * 0.9, by = y + size * 0.1, br = size * 0.42;
                const c = document.createElementNS(SVG_NS, 'circle');
                c.setAttribute('cx', bx); c.setAttribute('cy', by); c.setAttribute('r', br);
                c.setAttribute('fill', '#fff');
                // Anello scuro come il contorno delle pedine: il numero deve
                // leggersi anche sopra una provincia del colore del giocatore.
                c.setAttribute('stroke', PIECE_INK);
                c.setAttribute('stroke-width', size * 0.11);
                add(c);
                const t = document.createElementNS(SVG_NS, 'text');
                t.setAttribute('x', bx); t.setAttribute('y', by);
                t.setAttribute('text-anchor', 'middle');
                t.setAttribute('dominant-baseline', 'central');
                t.setAttribute('font-size', br * 1.5);
                t.setAttribute('font-weight', 'bold');
                t.setAttribute('font-family', 'sans-serif');
                t.setAttribute('fill', 'currentColor');
                t.textContent = e.count;
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
    }

    // Snapshot { provinceId: { t:"soldato:3,citta:1", c:"#e6194B" } } delle province con figure.
    function collectPieces(svg) {
        const out = {};
        provincePaths(svg).forEach(p => {
            const t = p.getAttribute('data-pieces');
            if (!t) return;
            const entry = { t };
            const c = p.getAttribute('data-pc-color');
            if (c) entry.c = c;
            out[p.id] = entry;
        });
        return out;
    }

    // Applica uno snapshot figure (autoritativo). Accetta il formato nuovo
    // {t,c} oppure il vecchio (stringa "a,b" senza quantita').
    function applyPieceState(map) {
        const svg = document.querySelector('svg');
        if (!svg || !map || typeof map !== 'object') return;
        provincePaths(svg).forEach(p => {
            const v = map[p.id];
            let str = '', color = '';
            if (v && typeof v === 'object' && !Array.isArray(v)) { str = v.t || ''; color = v.c || ''; }
            else if (typeof v === 'string') str = v;
            else if (Array.isArray(v)) str = v.join(',');
            const arr = piecesFromString(str);
            if (arr.length) {
                p.setAttribute('data-pieces', serializePieces(arr));
                if (color) p.setAttribute('data-pc-color', color); else p.removeAttribute('data-pc-color');
            } else { p.removeAttribute('data-pieces'); p.removeAttribute('data-pc-color'); }
        });
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

    // Punto a meta' del confine condiviso tra due province (media dei punti-bordo
    // di A vicini al bordo di B). Fallback: meta' tra i due centri.
    function sharedBorderMidpoint(A, B) {
        const pa = boundaryPoints(A), pb = boundaryPoints(B);
        if (pa.length && pb.length) {
            const thr2 = 4 * 4;
            let sx = 0, sy = 0, n = 0;
            for (const p of pa) {
                for (const q of pb) {
                    const dx = p.x - q.x, dy = p.y - q.y;
                    if (dx * dx + dy * dy < thr2) { sx += (p.x + q.x) / 2; sy += (p.y + q.y) / 2; n++; break; }
                }
            }
            if (n) return { x: sx / n, y: sy / n };
        }
        const ba = mainBodyBBox(A), bb = mainBodyBBox(B);
        if (ba && bb) return { x: (ba.x + ba.w / 2 + bb.x + bb.w / 2) / 2, y: (ba.y + ba.h / 2 + bb.y + bb.h / 2) / 2 };
        return null;
    }

    function toggleRoad(aId, bId, color) {
        const existing = findRoad(aId, bId);
        if (existing) { ROADS = ROADS.filter(r => r !== existing); return 'removed'; }
        ROADS.push({ a: aId, b: bId, c: color || PIECE_NEUTRAL });
        return 'added';
    }

    function renderRoads(svg) {
        injectPieceDefs(svg);
        svg.querySelectorAll('.road-marker').forEach(m => m.remove());
        ROADS.forEach(r => {
            const A = document.getElementById(r.a), B = document.getElementById(r.b);
            if (!A || !B) return;
            const mid = sharedBorderMidpoint(A, B);
            if (!mid) return;
            const ba = mainBodyBBox(A), bb = mainBodyBBox(B);
            const ref = Math.min(ba ? Math.min(ba.w, ba.h) : 12, bb ? Math.min(bb.w, bb.h) : 12);
            const size = Math.max(4, Math.min(ref * 0.5, 12));
            const use = document.createElementNS(SVG_NS, 'use');
            use.setAttribute('href', '#pc-strada');
            use.setAttributeNS(XLINK_NS, 'href', '#pc-strada');
            use.setAttribute('x', mid.x - size / 2);
            use.setAttribute('y', mid.y - size / 2);
            use.setAttribute('width', size);
            use.setAttribute('height', size);
            use.setAttribute('class', 'road-marker');
            use.setAttribute('data-road', roadKey(r.a, r.b));
            use.setAttribute('pointer-events', 'none');
            use.style.color = r.c || PIECE_NEUTRAL;
            svg.appendChild(use);
        });
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
            apply();
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
                apply();
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
        if ('pieces' in data) applyPieceState(data.pieces || {});
        if ('roads' in data) applyRoadState(data.roads || []);
        applyTurnState(data);

        refreshMapDisplay();
        renderPlayerTabs();
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
            `;

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
        initPalette();
        renderPlayerTabs();
        saveAutoSave();
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

    // --- PARTITA CONTRO L'IA (admin) ---
    // Due strade, e la differenza è tutta qui: la prima TIENE i regni disegnati
    // sulla mappa (è il modo normale di cominciare), la seconda li butta e ne
    // sorteggia di nuovi. "🏁 Avvia partita" resta quello di prima: azzera
    // l'economia e basta, senza IA.
    function avviaPartitaIA(mantieniMappa) {
        if (!isAdminMode) return;
        if (!window.GameSetup) { showPieceNotice('setup.js non caricato.'); return; }
        if (!neighborsReady) {
            showPieceNotice('La mappa sta ancora calcolando i confini: riprova fra un istante.');
            return;
        }
        const neutrali = 'Le terre di nessuno partono con ' + GameRules.NEUTRAL_START +
            ' soldati (+' + GameRules.NEUTRAL_STEP + ' ogni ' + GameRules.NEUTRAL_EVERY + ' turni).';
        const opts = mantieniMappa
            ? {
                title: 'Giocare con i regni che sono sulla mappa?',
                text: 'I territori restano esattamente come li hai dipinti. Ogni regno che non ha ' +
                    'una Capitale la riceve nella sua provincia più interna, torna a 1000 monete e ' +
                    '5 soldati per provincia, e il calendario riparte dal turno 1 (1000 AD). ' +
                    'Uno dei regni sarà tuo, gli altri li governa l\'IA. ' + neutrali,
                ok: '⚔️ Comincia'
            }
            : {
                title: 'Sorteggiare una mappa nuova?',
                text: 'Attenzione: la mappa attuale viene sparecchiata — province, pedine, strade e ' +
                    'cronologia dei turni. I regni rinascono in ' + window.GameSetup.REGIONS.europa.nome +
                    ' con 3 province e una Capitale a testa. ' + neutrali,
                ok: '🎲 Sorteggia',
                tone: 'danger'
            };

        askConfirm(opts, () => {
            const res = window.GameSetup.newGame({ mantieniMappa: !!mantieniMappa });
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

    // Esito del sorteggio: chi sei, con che link entri nella tua plancia, e con
    // che testa giocano gli altri nove.
    function renderNewGameResult(res) {
        const box = document.getElementById('new-game-result');
        if (!box || !res || !res.ok) return;
        const umano = res.umano;
        const righe = res.regni.map(r => {
            const p = r.player;
            const bot = window.Bot ? window.Bot.strategyOf(p) : null;
            return '<div class="ng-row' + (umano && p.id === umano.id ? ' me' : '') + '">' +
                '<span class="ng-dot" style="background:' + p.color + '"></span>' +
                '<span class="ng-name">' + p.name + '</span>' +
                '<span class="ng-kind">' + (bot ? bot.nome : '👤 tu') + '</span>' +
                '</div>';
        }).join('');
        const link = umano ? inviteUrlFor(umano) : null;
        box.innerHTML =
            '<div class="ng-head">' + (umano ? 'Giochi ' + umano.name : 'Nessun regno umano') + '</div>' +
            (link ? '<a class="ng-link" href="' + link + '">▶ Apri la tua plancia</a>' : '') +
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
    function saveAutoSave() {
        const svg = document.querySelector('svg');
        if (!svg) return;

        saveCurrentTurnToHistory();

        const stateSnapshot = {
            turn: currentTurn,
            players: PLAYERS,
            history: TURN_HISTORY,
            resources: collectResources(svg),
            pieces: collectPieces(svg),
            roads: collectRoads(),
            turnoDi: turnoDi,
            ordine: ordine,
            primoDelGiro: primoDelGiro
        };

        localStorage.setItem('antigravity_map_save', JSON.stringify(stateSnapshot));
        MultiplayerSync.pushState(stateSnapshot);
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
    }

    // --- MAP DISPLAY ---
    // Two modes:
    //   - Main view (selectedTabPlayerId === null): show real owner colors for every province.
    //   - Focus view (a player tab is active): show real owner colors for that player's provinces
    //     and their direct neighbors; every other province is "fogged" (dark, non-interactive).
    function refreshMapDisplay() {
        const svg = document.querySelector('svg');
        if (!svg) return;

        const focus = PLAYERS.find(p => p.id === selectedTabPlayerId);
        const visible = focus ? computeVisibleProvinces(focus.name) : null;

        svg.querySelectorAll('path').forEach(path => {
            const owner = path.getAttribute('data-owner');
            const pObj = PLAYERS.find(p => p.name === owner);
            const isVisible = !visible || visible.has(path.id);

            const color = isVisible
                ? (pObj ? pObj.color : NEUTRAL_FILL)
                : FOG_FILL;
            // Path SVG "fill=" attribute takes precedence over CSS in some browsers,
            // so we drive both the attribute and the inline style to stay consistent.
            path.setAttribute('fill', color);
            path.style.fill = color;
            path.classList.toggle('fog', !isVisible);

            // L'icona-risorsa segue la visibilita' della sua provincia (sparisce in nebbia).
            const marker = svg.querySelector(`.resource-marker[data-prov="${CSS.escape(path.id)}"]`);
            if (marker) marker.style.display = isVisible ? '' : 'none';

            // Le figure usano il colore-esercito memorizzato (fallback proprietario/
            // neutro) e seguono la nebbia per la visibilita'.
            const pcColor = pieceColorOf(path);
            svg.querySelectorAll(`.piece-marker[data-prov="${CSS.escape(path.id)}"]`).forEach(m => {
                m.style.color = pcColor;
                m.style.display = isVisible ? '' : 'none';
            });
        });

        // Le strade spariscono se anche una sola delle due province e' in nebbia.
        svg.querySelectorAll('.road-marker').forEach(m => {
            const key = m.getAttribute('data-road'); if (!key) return;
            const parts = key.split('|');
            const vis = !visible || (visible.has(parts[0]) && visible.has(parts[1]));
            m.style.display = vis ? '' : 'none';
        });

        renderPopularityPanel();
        renderGameControls();
        notifyBoard();
    }

    // Aggancio della plancia giocatore: si ridisegna quando cambia qualcosa del regno.
    function notifyBoard() {
        if (window.Risiko && typeof window.Risiko.onRefresh === 'function') {
            window.Risiko.onRefresh();
        }
    }

    function computeVisibleProvinces(playerName) {
        const svg = document.querySelector('svg');
        const visible = new Set();
        if (!svg) return visible;
        svg.querySelectorAll(`path[data-owner="${playerName}"]`).forEach(path => {
            visible.add(path.id);
            // Nebbia di default: si vedono solo le province confinanti via TERRA.
            // I collegamenti via mare verranno sbloccati dalle navi (feature futura).
            const neigh = NEIGHBORS_LAND[path.id];
            if (neigh) neigh.forEach(id => visible.add(id));
        });
        return visible;
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

    const TAX_LEVELS = {
        leggera: { label: 'Leggera', score: 5 },
        normale: { label: 'Normale', score: 3 },
        dura:    { label: 'Dura',    score: 1 }
    };

    function clamp05(n) { return Math.max(0, Math.min(5, n)); }

    // Arrotondamento del regolamento (§8): per difetto, salvo parte decimale > 0,8.
    // Es. 2,83 → 3 · 2,5 → 2 · 4,8 → 4. Diverso da Math.round, che darebbe 3 · 3 · 5.
    function roundRule(x) {
        if (typeof KingdomStats !== 'undefined') return KingdomStats.roundRule(x);
        const f = Math.floor(x);
        return (x - f > 0.8) ? f + 1 : f;
    }

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

    // Calcola i tre componenti + il totale della Popolarità per un giocatore.
    function computePopularity(player, capitalPath) {
        // --- Sicurezza (Difesa) ---
        // Province nemiche confinanti con la Capitale: e = quante → P_conf = 5 − e.
        const neigh = Array.from(NEIGHBORS_LAND[capitalPath.id] || []);
        let enemyBorders = 0;
        neigh.forEach(id => {
            const np = document.getElementById(id);
            const owner = np && np.getAttribute('data-owner');
            if (owner && owner !== player.name) enemyBorders++;
        });
        const pConf = clamp05(5 - enemyBorders);
        const soldiers = countPiece(capitalPath, 'soldato');   // guardia cittadina: soldati oltre i 5
        const pGuardia = clamp05(Math.max(0, soldiers - 5));
        const hasGeneral = countPiece(capitalPath, 'generale') > 0;
        const sicurezza = clamp05(roundRule((pConf + pGuardia) / 2) + (hasGeneral ? 1 : 0));

        // --- Benessere --- (Risorse+Cibo+Sanità+Felicità)/4: economia non ancora
        // tracciata → baseline neutra 3, sotto-fattori "in arrivo".
        const benessere = 3;

        // --- Tassa --- dal livello di tassazione scelto dal regno.
        const tax = player.tassazione || 'normale';
        const tassa = (TAX_LEVELS[tax] || TAX_LEVELS.normale).score;

        // Il totale e' clampato 1–5 (§8): il livello 0 non esiste nella tabella effetti.
        const totale = Math.max(1, clamp05(roundRule((sicurezza + benessere + tassa) / 3)));
        return {
            totale, sicurezza, benessere, tassa,
            detail: { enemyBorders, pConf, soldiers, pGuardia, hasGeneral, tax }
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
        const taxSel = ['leggera', 'normale', 'dura'].map(k =>
            `<div class="pop-tax-opt${(d.tax === k) ? ' active' : ''}" data-tax="${k}">${TAX_LEVELS[k].label}</div>`
        ).join('');

        body.innerHTML = `
            <div class="pop-total">
                <div class="pop-total-label">Livello ${pop.totale} / 5</div>
                ${circlesHtml(pop.totale, false)}
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
                    <div class="pop-factor"><span class="pop-factor-label">Province nemiche al confine</span><span class="pop-factor-val">${d.enemyBorders} → ${d.pConf}/5</span></div>
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
                    <div class="pop-factor"><span class="pop-factor-label">Diversità risorse</span><span class="pop-factor-val muted">in arrivo</span></div>
                    <div class="pop-factor"><span class="pop-factor-label">Cibo collegato</span><span class="pop-factor-val muted">in arrivo</span></div>
                    <div class="pop-factor"><span class="pop-factor-label">Sanità</span><span class="pop-factor-val muted">in arrivo</span></div>
                    <div class="pop-factor"><span class="pop-factor-label">Felicità</span><span class="pop-factor-val muted">in arrivo</span></div>
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

        // Selettore di tassazione (solo admin): cambia lo stato del regno e ricalcola.
        body.querySelectorAll('.pop-tax-opt').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                // Nella plancia e' il giocatore stesso a decidere la propria tassazione.
                if (!isAdminMode && !BOARD_MODE) return;
                player.tassazione = opt.getAttribute('data-tax');
                renderPopularityPanel();
                notifyBoard();   // entrate e rinforzi dipendono dalla tassa
                if (typeof saveAutoSave === 'function') saveAutoSave();
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

    function askConfirm(opts, onYes) {
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

        wrap.querySelector('.uc-no').addEventListener('click', close);
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
        capitale: 'Cronaca del regno'
    };

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
    // ============================================================

    let battleTimers = [];

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

    function showAttackArrows(fromId, targetIds) {
        clearAttackArrows();
        const svg = document.querySelector('svg');
        if (!svg || !fromId || !targetIds || !targetIds.length) return;
        const A = provinceCenter(document.getElementById(fromId));
        if (!A) return;

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('id', 'attack-arrows');
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
            const w = Math.max(0.6, Math.min(Math.min(A.r, B.r) * 0.16, shaft * 0.16));
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
        const unit = Math.max(3, Math.min(dist * 0.09, Math.min(A.r, B.r) * 0.9));
        const vinta = !!info.conquistata;

        svg.classList.add('battle-focus');
        from.classList.add('battle-attacker');
        to.classList.add('battle-defender');

        // 1) la traiettoria della carica: si "scrive" da attaccante a difensore
        const line = fxEl(svg, 'line', {
            x1: A.x, y1: A.y, x2: B.x, y2: B.y,
            stroke: info.coloreAttaccante || '#e0c097',
            'stroke-width': Math.max(1, unit * 0.28),
            'stroke-linecap': 'round',
            pathLength: 100
        }, 'fx-charge');
        line.style.stroke = info.coloreAttaccante || '#e0c097';

        // la lama che corre lungo la traiettoria (CSS: translate da 0 a dx/dy)
        const blade = fxEl(svg, 'text', {
            x: A.x, y: A.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': unit * 2
        }, 'fx-blade');
        blade.textContent = '⚔';
        blade.style.setProperty('--dx', (B.x - A.x) + 'px');
        blade.style.setProperty('--dy', (B.y - A.y) + 'px');

        // 2) impatto sul difensore: due onde d'urto + lampo della provincia
        battleLater(() => {
            [0, 160].forEach((d, i) => {
                const c = fxEl(svg, 'circle', {
                    cx: B.x, cy: B.y, r: unit * 1.2,
                    fill: 'none',
                    stroke: vinta ? '#ffd479' : '#ff8a8a',
                    'stroke-width': Math.max(1, unit * 0.22),
                    style: 'animation-delay:' + d + 'ms'
                }, 'fx-blast');
                if (i) c.setAttribute('opacity', '.7');
            });
            to.classList.add(vinta ? 'battle-hit' : 'battle-held');
            const wrap = document.getElementById('map-wrapper');
            if (wrap) {
                wrap.classList.add('battle-shake');
                battleLater(() => wrap.classList.remove('battle-shake'), 520);
            }
        }, 620);

        // 3) il conto dei caduti, uno per campo: è la parte che resta impressa
        battleLater(() => {
            fxCasualty(svg, A, info.perditeAttaccante, unit * 2.4, '#ff9b9b', 0);
            fxCasualty(svg, B, info.perditeDifensore, unit * 2.4, '#ff9b9b', 220);

            const esito = fxEl(svg, 'text', {
                x: B.x, y: B.y + unit * 3.4,
                'text-anchor': 'middle',
                'font-size': unit * 1.9,
                fill: vinta ? '#ffd479' : '#cfe8cf'
            }, 'fx-verdict');
            esito.textContent = vinta ? 'CONQUISTATA' : 'RESPINTO';
        }, 780);

        battleLater(() => {
            to.classList.remove('battle-hit', 'battle-held');
            clearBattleFx();
        }, 3600);
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

        ownedPaths,
        provinceLabel,
        piecesOf,
        countPiece,
        playBattleFx,
        clearBattleFx,
        showAttackArrows,
        clearAttackArrows,
        provinceScreenPos,
        confirm: askConfirm,
        showFoundation,
        resourceKeyOf,
        getCapitalPathFor,
        computePopularity,
        save: saveAutoSave,

        // --- stato di turno (docs/GAME_DESIGN.md §2) ---
        turnoDi: () => turnoDi,
        ordine: () => ordine.slice(),
        primoDelGiro: () => primoDelGiro,
        setTurnState(t, o, primo) {
            turnoDi = t;
            if (o) ordine = o.slice();
            if (typeof primo === 'number') primoDelGiro = primo;
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

        // --- primitive di manipolazione della mappa, usate da game-actions.js ---
        // Superficie volutamente stretta: game-actions non conosce il DOM dell'SVG.
        engine: {
            path: (id) => document.getElementById(id),
            ownedPaths,
            // Tutte le province della mappa (serve ai presidi neutrali e al
            // sorteggio dei regni iniziali): niente alone costiero, vedi provincePaths.
            allPaths: () => provincePaths(),
            landNeighbors: (id) => Array.from(NEIGHBORS_LAND[id] || []),
            areLandAdjacent,
            pieces: piecesOf,
            countPiece,
            canPlacePiece,
            addPiece(path, type, delta) { changePiece(path, type, delta); },
            erasePieces(path) { changePiece(path, '__erase__'); },
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
            save: saveAutoSave
        },

        // Vista mappa (disponibile solo dopo initMap).
        fitToProvinces(ids) { return mapView ? mapView.fitToProvinces(ids) : false; },
        setViewInsets(left, right) { if (mapView) mapView.setInsets(left, right); },
        resetView() { if (mapView) mapView.resetView(); },
        mapReady: () => !!mapView,
        // Confini pronti? Finché è false le adiacenze sono vuote (vedi neighborsReady).
        neighborsReady: () => neighborsReady
    };
});

// TEMP (fase di test): quando true, tutti hanno permessi admin senza bisogno di login.
// Rimettere a false quando il gioco sarà pronto per il rilascio, cosi' la mappa condivisa
// tornera' modificabile solo dopo autenticazione Firebase con UID = ADMIN_UID.
const DEV_ADMIN_BYPASS = true;

document.addEventListener('DOMContentLoaded', () => {
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

    let currentTurn = 0;
    let TURN_HISTORY = {};
    let selectedPlayer = null;
    let selectedResource = null; // null = nessun "pennello risorsa" attivo; altrimenti chiave risorsa o '__erase__'
    let isAdminMode = false;
    let selectedTabPlayerId = null; // null = main view (no focus, no fog)
    let NEIGHBORS = {};      // grafo completo (terra + brevi salti via mare): per usi futuri (navi)
    let NEIGHBORS_LAND = {}; // solo confini via terra (province che si toccano): usato dalla nebbia
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
        if (tabsBar) tabsBar.style.display = admin ? 'flex' : 'none';
        if (turnPrevBtn) turnPrevBtn.style.display = admin ? 'inline-block' : 'none';
        if (turnNextBtn) turnNextBtn.style.display = admin ? 'inline-block' : 'none';
        syncPlayerControlsVisibility();

        // When leaving admin mode, drop any focused player so the map returns to the main view.
        if (!admin) {
            selectedResource = null;
            document.querySelectorAll('.resource-chip').forEach(c => c.classList.remove('selected'));
            selectedTabPlayerId = null;
            const content = document.getElementById('player-tab-content');
            if (content) content.style.display = 'none';
            refreshMapDisplay();
        } else {
            renderPlayerTabs();
        }
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
            if (currentTurn > 0) {
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

    function updateTurnUI() {
        if (turnDisplay) {
            turnDisplay.textContent = `Turno ${currentTurn}`;
        }
        const dateDisplay = document.getElementById('date-display');
        if (dateDisplay) {
            const year = 1000 + currentTurn * 10;
            dateDisplay.textContent = `${year} AD`;
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
        makeDraggable(document.getElementById('side-panel'));
    } else {
        fetch('assets/world_map.svg')
            .then(response => {
                if (!response.ok) throw new Error("Failed to load map");
                return response.text();
            })
            .then(svgContent => {
                container.innerHTML = svgContent;
                initMap();
                makeDraggable(document.getElementById('side-panel'));
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

        // Simboli-risorsa disponibili subito (li usano anche i chip della palette).
        injectResourceDefs(svg);

        // Solo i territori giocabili (class="state"): esclude sfondo, bordi e pattern dell'SVG.
        const paths = svg.querySelectorAll('path.state');
        const defaultFill = '#d1dbdd';

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
                if (inTab && isFogged) return;

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
        });

        // Compute adjacency graph once (deferred so it doesn't block first paint).
        setTimeout(() => {
            const g = computeNeighborGraph(svg);
            NEIGHBORS = g.full;
            NEIGHBORS_LAND = g.land;
            renderResourceMarkers(svg);
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
    function computeNeighborGraph(svg) {
        const CELL_FULL = 0.6;    // griglia grossa (comportamento storico, permissivo)
        const CELL_LAND = 0.32;   // griglia fine: separa terra (contatto) da mare (divario)
        const cellsFull = new Map();
        const cellsLand = new Map();
        const ids = [];

        svg.querySelectorAll('path.state').forEach(path => {
            const id = path.id;
            ids.push(id);
            let len;
            try { len = path.getTotalLength(); } catch (e) { len = 0; }
            if (!len) return;

            // ~1 campione ogni 0.45 unita' SVG, tra 70 e 200 per provincia. Densita'
            // moderata: i due lati di un confine condiviso cadono comunque nelle stesse
            // celle fini (distanza perpendicolare ~0), quindi non serve di piu'.
            const samples = Math.max(70, Math.min(Math.round(len / 0.45), 200));
            const step = len / samples;
            for (let i = 0; i < samples; i++) {
                let pt; try { pt = path.getPointAtLength(i * step); } catch (e) { continue; }
                hashPoint(cellsFull, id, pt.x, pt.y, CELL_FULL);
                hashPoint(cellsLand, id, pt.x, pt.y, CELL_LAND);
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

    function median(arr) {
        const a = arr.slice().sort((x, y) => x - y);
        const n = a.length;
        if (!n) return 0;
        return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
    }

    function pointInPath(path, x, y) {
        if (typeof path.isPointInFill !== 'function') return true; // fallback: non bloccare
        try { return path.isPointInFill(new DOMPoint(x, y)); } catch (e) { return true; }
    }

    // Ancora dell'icona-risorsa: individua il CORPO PRINCIPALE della provincia
    // (ignora isole lontane usando la mediana dei punti del perimetro), poi sceglie
    // un angolo di quel corpo e garantisce che il centro dell'icona cada dentro il
    // poligono (isPointInFill). Cosi' l'icona non sfora in mare o in un'altra provincia.
    function markerAnchor(path) {
        let b; try { b = path.getBBox(); } catch (e) { return null; }
        if (!b || (!b.width && !b.height)) return null;

        let len; try { len = path.getTotalLength(); } catch (e) { len = 0; }
        let mx = b.x, my = b.y, mw = b.width, mh = b.height;

        if (len) {
            const N = 140;
            const xs = [], ys = [];
            for (let i = 0; i < N; i++) {
                const p = path.getPointAtLength(i * len / N);
                xs.push(p.x); ys.push(p.y);
            }
            const medX = median(xs), medY = median(ys);
            const dist = xs.map((x, i) => Math.hypot(x - medX, ys[i] - medY));
            const thr = Math.max(median(dist) * 2.5, 1e-6); // scarta i punti delle isole lontane
            const ix = [], iy = [];
            for (let i = 0; i < xs.length; i++) if (dist[i] <= thr) { ix.push(xs[i]); iy.push(ys[i]); }
            if (ix.length >= 3) {
                const minx = Math.min(...ix), maxx = Math.max(...ix);
                const miny = Math.min(...iy), maxy = Math.max(...iy);
                mx = minx; my = miny; mw = maxx - minx; mh = maxy - miny;
            }
        }

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
        svg.querySelectorAll('path.state').forEach(path => renderMarkerForPath(svg, path));
    }

    // Snapshot { provinceId: risorsa } delle sole province con risorsa assegnata.
    function collectResources(svg) {
        const out = {};
        svg.querySelectorAll('path.state').forEach(p => {
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
        svg.querySelectorAll('path.state').forEach(p => {
            const k = map[p.id];
            if (k && typeof RESOURCES !== 'undefined' && RESOURCES[k]) p.setAttribute('data-resource', k);
            else p.removeAttribute('data-resource');
        });
        renderResourceMarkers(svg);
    }

    // Zoom (rotella) + pan (trascinamento) manipolando il viewBox del root <svg>.
    // Approccio "mappa di gioco": la mappa riempie sempre la cornice (niente scrollbar),
    // lo zoom punta verso il cursore e il pan sposta la vista senza uscire dai confini.
    function wireMapZoom(svg) {
        const wrapper = document.getElementById('map-wrapper');
        if (!wrapper) return;

        // Ingrandimento massimo rispetto alla vista intera. Alto perche' alcune zone
        // (es. il dettaglio storico d'Europa) hanno molti territori piccoli e ravvicinati:
        // serve poter zoomare a fondo per selezionarli comodamente uno per uno.
        const MAX_ZOOM = 60;
        const DRAG_THRESHOLD = 4;  // px prima di considerarlo un vero trascinamento

        // Bounding box dei soli territori: serve a scartare i margini vuoti (oceano)
        // che l'SVG di MapChart lascia intorno alle terre emerse.
        function landBBox() {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            svg.querySelectorAll('path.state').forEach(p => {
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
            }, 150);
        });
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

            if (prevTurn >= 0 && TURN_HISTORY[prevTurn]) {
                source = TURN_HISTORY[prevTurn];
            } else if (currentTurn > 0) {
                const turns = Object.keys(TURN_HISTORY).map(Number).sort((a, b) => b - a);
                const latestTurn = turns.find(t => t < currentTurn);
                if (latestTurn !== undefined) source = TURN_HISTORY[latestTurn];
            }

            internalApplyMapData(source);
            saveCurrentTurnToHistory();
        }
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
                    <button type="button" class="player-action rename-btn" title="Rinomina">✎</button>
                    <button type="button" class="player-action remove-btn" title="Rimuovi">×</button>
                </div>
            `;

            const colorInput = btn.querySelector('input');
            colorInput.addEventListener('click', (e) => e.stopPropagation());
            colorInput.addEventListener('input', (e) => {
                if (!isAdminMode) return;
                const newColor = e.target.value;
                p.color = newColor;
                btn.querySelector('.player-logo').style.background = newColor;
                btn.querySelector('.player-info').style.borderBottomColor = newColor;
                updateMapColors(p.name, newColor);
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
                    document.querySelectorAll('.player-card').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                }
            });

            btn.querySelector('.player-name').addEventListener('dblclick', (e) => {
                e.stopPropagation();
                renamePlayer(p);
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

    function updateMapColors(playerName, newColor) {
        const svg = document.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll(`path[data-owner="${playerName}"]`).forEach(path => {
            path.style.fill = newColor;
        });
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
        PLAYERS.push({ id: nextId, name: 'Giocatore ' + nextId, color: pickNewPlayerColor() });
        initPalette();
        renderPlayerTabs();
        saveAutoSave();
    }

    function removePlayer(player) {
        if (!isAdminMode) return;
        if (!confirm(`Rimuovere ${player.name}? Le sue province torneranno senza proprietario.`)) return;

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
            resources: collectResources(svg)
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
            resources: collectResources(svg)
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
            renderPlayerTabs();
        } catch (e) {
            console.error("Failed to load auto-save", e);
        }
    }

    // Lo stato salvato e' autoritativo sull'elenco giocatori: cosi' aggiunte E rimozioni
    // (anche dei giocatori di default) vengono rispettate al ricaricamento.
    function mergePlayerData(savedPlayers) {
        if (!savedPlayers || !Array.isArray(savedPlayers) || !savedPlayers.length) return;
        PLAYERS = savedPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
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
                ? (pObj ? pObj.color : '#d1dbdd')
                : '#3a3a3a'; // fog grey
            // Path SVG "fill=" attribute takes precedence over CSS in some browsers,
            // so we drive both the attribute and the inline style to stay consistent.
            path.setAttribute('fill', color);
            path.style.fill = color;
            path.classList.toggle('fog', !isVisible);

            // L'icona-risorsa segue la visibilita' della sua provincia (sparisce in nebbia).
            const marker = svg.querySelector(`.resource-marker[data-prov="${CSS.escape(path.id)}"]`);
            if (marker) marker.style.display = isVisible ? '' : 'none';
        });
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

    // --- PLAYER TABS (admin-only per-player detail panel) ---
    function getProvincesOwnedBy(playerName) {
        const svg = document.querySelector('svg');
        if (!svg) return [];
        const owned = [];
        svg.querySelectorAll(`path[data-owner="${playerName}"]`).forEach(path => {
            const id = path.id;
            const nameAttr = path.getAttribute('name');
            const data = findMatch(id, nameAttr);
            owned.push(data ? data.nome : (typeof ID_MAP !== 'undefined' && ID_MAP[id]) ? ID_MAP[id] : (nameAttr || id));
        });
        return owned.sort();
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
        const year = 1000 + currentTurn * 10;
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

    function makeDraggable(el) {
        if (!el) return;
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const handles = el.querySelectorAll('h2, h3');
        if (handles.length > 0) {
            handles.forEach(h => h.onmousedown = dragMouseDown);
        } else {
            el.onmousedown = dragMouseDown;
        }

        function dragMouseDown(e) {
            e = e || window.event;
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('.player-card') || e.target.closest('.player-tab')) return;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
            el.style.right = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
});

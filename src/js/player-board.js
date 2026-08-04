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
    let legendOpen = false;
    let lastBattle = null;

    // ---------- pannelli: apertura/chiusura e spazio riservato sulla mappa ----------

    const leftPanel = $('board-left');
    const rightPanel = $('board-right');

    function syncViewInsets() {
        const main = $('board-main');
        if (!main) return;
        const w = main.clientWidth || 1;
        const frac = (panel) => (panel && !panel.classList.contains('collapsed'))
            ? (panel.offsetWidth + 24) / w
            : 0;
        R.setViewInsets(frac(leftPanel), frac(rightPanel));
    }

    function wirePanelToggle(panel, tab, openLabel, closedLabel) {
        if (!panel || !tab) return;
        const sync = () => {
            const open = !panel.classList.contains('collapsed');
            tab.textContent = open ? openLabel : closedLabel;
            syncViewInsets();
        };
        tab.addEventListener('click', () => { panel.classList.toggle('collapsed'); sync(); });
        if (window.innerWidth <= 1100) panel.classList.add('collapsed');
        sync();
    }

    wirePanelToggle(leftPanel, $('board-left-tab'), '◀ Corona', 'Corona ▶');
    wirePanelToggle(rightPanel, $('board-right-tab'), 'Regno ▶', '◀ Regno');

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
        hasFitted = false;
        selectedProvId = null;
        lastBattle = null;
        try { sessionStorage.setItem('risiko_board_player', String(player.id)); } catch (e) { /* privato */ }
        $('board-picker').style.display = 'none';
        R.focusPlayer(player.id);
        syncViewInsets();
        render();
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

    // Esegue un'azione e ridisegna. Le azioni chiamano gia' Risiko.save() e
    // refresh(), che riporta qui via onRefresh: basta mostrare il messaggio.
    function run(result) {
        if (!result) return;
        if (result.battle) lastBattle = result;
        showNotice(result.msg, result.ok);
        render();
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
        setText('board-cycle', 'ciclo ' + (Math.floor(turn / 10) + 1) + ' · turno ' + (turn % 10 + 1) + '/10');

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
            state.textContent = 'Attendi: ' + (chi ? chi.name : '—');
            state.className = 'turn-wait';
            endBtn.disabled = true;
        }
    }

    $('board-end-turn').addEventListener('click', () => {
        if (!confirm('Chiudere il tuo turno? Le unità temporanee scadono e si passa al regno successivo.')) return;
        run(GA().endTurn());
    });

    // ---------- pannello sinistro ----------

    function renderPrestige(player) {
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

    // ---------- pannello destro: tesoro e scorte ----------

    function renderTreasury(player, units, snapshot, connectedSet, pop) {
        const inc = KingdomStats.income(units, player.tassazione || 'normale');
        setText('bp-coins', (player.monete || 0).toLocaleString('it-IT'));
        const note = $('bp-income');
        note.textContent = inc.cities
            ? '+' + inc.total + ' / turno · ' + inc.cities + ' città × ' + inc.rate
            : 'Nessuna città: nessuna entrata (§7).';
        note.className = inc.cities ? 'bp-note good' : 'bp-note';

        // La resa conta solo le province COLLEGATE (§4): senza Capitale è zero.
        const collegate = snapshot.filter(p => connectedSet.has(p.id));
        const yields = KingdomStats.resourceYield(collegate, RES_KEYS);

        $('bp-resources').innerHTML = RES_KEYS.map(k => {
            const gain = yields[k] || 0;
            const have = (player.scorte && player.scorte[k]) || 0;
            return `
            <div class="bp-res" style="border-left-color:${RESOURCES[k].colore}">
                <div class="bp-res-name">
                    <svg viewBox="0 0 100 100" aria-hidden="true"><use href="#res-${k}"></use></svg>${RESOURCES[k].nome}
                </div>
                <div class="bp-res-val">${have}
                    <span class="bp-res-gain${gain ? '' : ' zero'}">${gain ? '+' + gain : '0'}/turno</span>
                </div>
            </div>`;
        }).join('');

        if (pop) {
            const mod = GR().popEffectOf(pop.totale).risorse;
            if (mod) $('bp-resources').insertAdjacentHTML('beforeend',
                `<div class="bp-res" style="grid-column:1/-1;border-left-color:var(--gold-edge)">
                    <div class="bp-res-name">Modificatore Popolarità</div>
                    <div class="bp-res-val">${signed(mod)} <span class="bp-res-gain zero">unità totali/turno</span></div>
                </div>`);
        }
    }

    function renderArmy(owned, units, pop, capitalPath, connectedSet) {
        setText('bp-prov-owned', owned.length);
        setText('bp-prov-connected', connectedSet.size);
        setText('bp-capital', capitalPath ? R.provinceLabel(capitalPath) : 'Nessuna');
        setText('bp-soldiers', units.soldato);
        setText('bp-soldiers-cap', capitalPath ? R.countPiece(capitalPath, 'soldato') : 0);
        setText('bp-units', units.generale + ' · ' + units.barca + ' · ' + units.vascello);
        setText('bp-buildings', units.citta + ' · ' + units.fortezza + ' · ' + units.mercato);

        const r = KingdomStats.reinforcements(owned.length, units, pop ? pop.totale : null);
        setText('bp-reinf', signed(r.total));
        $('bp-reinf-detail').innerHTML = r.breakdown.map(b => `
            <div class="bp-line">
                <span class="k">${b.label}</span>
                <span class="v${b.value > 0 ? ' good' : b.value < 0 ? ' bad' : ''}">${signed(b.value)}</span>
            </div>`).join('');
    }

    // ---------- elenco delle mie province ----------

    function renderProvinceList(player, paths, connectedSet) {
        const box = $('bp-province-list');
        if (!paths.length) {
            box.innerHTML = '<div class="bp-empty-hint">Nessuna provincia: l\'admin te le assegna dalla mappa principale.</div>';
            return;
        }
        box.innerHTML = '';
        paths.slice()
            .sort((a, b) => R.provinceLabel(a).localeCompare(R.provinceLabel(b)))
            .forEach(path => {
                const troops = R.countPiece(path, 'soldato');
                const tags = ['capitale', 'citta', 'fortezza', 'mercato']
                    .filter(t => R.countPiece(path, t) > 0)
                    .map(t => pieceName(t)[0])
                    .join('');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'bp-prov' + (path.id === selectedProvId ? ' active' : '');
                btn.innerHTML = `
                    <span class="bp-link-dot${connectedSet.has(path.id) ? ' on' : ''}"
                          title="${connectedSet.has(path.id) ? 'Collegata alla Capitale' : 'Non collegata: non produce'}"></span>
                    <span class="bp-prov-name">${R.provinceLabel(path)}</span>
                    <span class="bp-prov-tags">${tags}</span>
                    <span class="bp-prov-troops">${troops}</span>`;
                btn.addEventListener('click', () => selectProvince(path.id, true));
                box.appendChild(btn);
            });
    }

    function selectProvince(id, center) {
        selectedProvId = id;
        if (center) R.fitToProvinces([id]);
        render();
    }

    // ---------- azioni sulla provincia selezionata ----------

    function renderSelected(player, connectedSet) {
        const nameEl = $('bp-province-name');
        const actions = $('bp-actions');
        const path = selectedProvId ? R.engine.path(selectedProvId) : null;

        if (!path) {
            nameEl.textContent = 'Nessuna provincia selezionata';
            setText('bp-province-troops', '—');
            actions.innerHTML = '<div class="bp-empty-hint">Clicca una provincia sulla mappa o nell\'elenco qui sotto.</div>';
            return;
        }

        const fogged = path.classList.contains('fog');
        const mine = R.engine.owner(path) === player.name;
        nameEl.textContent = R.provinceLabel(path);

        const pieces = R.piecesOf(path);
        setText('bp-province-troops', fogged ? '—' : (pieces.length
            ? pieces.map(x => pieceName(x.type) + (x.count > 1 ? ' ×' + x.count : '')).join(', ')
            : 'Nessuna'));

        if (fogged) {
            actions.innerHTML = '<div class="bp-empty-hint">Territorio sconosciuto.</div>';
            return;
        }
        if (!mine) {
            actions.innerHTML = '<div class="bp-empty-hint">Non è tua. Per attaccarla, seleziona una tua provincia confinante.</div>';
            return;
        }
        if (!GA().isMyTurn(player)) {
            actions.innerHTML = '<div class="bp-empty-hint">Non è il tuo turno: puoi guardare, non agire.</div>';
            return;
        }

        actions.innerHTML = '';
        actions.appendChild(deployGroup(player, path));
        actions.appendChild(buildGroup(player, path, connectedSet));
        actions.appendChild(roadGroup(player, path));
        actions.appendChild(attackGroup(player, path));
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
        const g = group('Schiera reclute');
        const pool = player.recluteDaSchierare || 0;
        if (!pool) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Serbatoio vuoto: le reclute arrivano a inizio turno.</div>');
            return g;
        }
        const row = document.createElement('div');
        row.className = 'bp-act-row';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = String(pool);
        input.value = String(pool);
        row.appendChild(input);
        row.appendChild(actionButton('Schiera qui (max ' + pool + ')', '', null,
            () => run(GA().deploy(player, path.id, parseInt(input.value, 10)))));
        g.appendChild(row);
        return g;
    }

    function buildGroup(player, path, connectedSet) {
        const g = group('Costruisci');
        const soldiersHere = R.countPiece(path, 'soldato');

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

        // Unità temporanee: valgono solo questo turno.
        GR().TEMPORARY.forEach(type => {
            const cost = GR().COSTS[type];
            const afford = GR().canAfford(player, cost, R.countPiece(path, 'soldato'));
            g.appendChild(actionButton(pieceName(type) + ' (1 turno)', GR().formatCost(cost),
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
                const afford = GR().canAfford(player, GR().COSTS.strada, R.countPiece(path, 'soldato'));
                if (!afford.ok) why = shorten(GR().missingText(afford.missing));
            }
            g.appendChild(actionButton('→ ' + R.provinceLabel(target), cost, why,
                () => run(GA().buildRoad(player, path.id, target.id))));
        });
        return g;
    }

    function attackGroup(player, path) {
        const g = group('Attacca');
        const available = R.countPiece(path, 'soldato');
        const targets = GA().attackTargets(player, path.id);

        if (!targets.length) {
            g.insertAdjacentHTML('beforeend', '<div class="bp-empty-hint">Nessun confine nemico da qui.</div>');
            return g;
        }
        if (available < 2) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Servono almeno 2 soldati: uno resta sempre a presidiare la provincia di partenza.</div>');
            return g;
        }

        const row = document.createElement('div');
        row.className = 'bp-act-row';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = String(available - 1);
        input.value = String(available - 1);
        input.title = 'Truppe impegnate (ne resta almeno 1 a presidiare)';
        row.appendChild(input);
        row.insertAdjacentHTML('beforeend',
            '<span class="bp-act-cost">di ' + available + ' disponibili</span>');
        g.appendChild(row);

        targets.forEach(t => {
            const bonus = t.fort ? ' +' + t.fort : '';
            g.appendChild(actionButton('⚔ ' + t.label,
                t.owner + ' · ' + t.troops + bonus, null,
                () => {
                    const n = parseInt(input.value, 10);
                    if (!confirm('Attaccare ' + t.label + ' con ' + n + ' truppe?')) return;
                    run(GA().attack(player, path.id, t.id, n));
                }));
        });
        return g;
    }

    function shorten(msg) {
        if (!msg) return msg;
        return msg.length > 34 ? msg.slice(0, 32) + '…' : msg;
    }

    // ---------- esito battaglia ----------

    function renderBattle() {
        const box = $('bp-battle');
        if (!lastBattle || !lastBattle.battle) { box.style.display = 'none'; return; }
        const b = lastBattle.battle;
        box.style.display = 'block';
        box.className = 'bp-battle ' + (b.attackerWins ? 'win' : 'lose');
        box.innerHTML = lastBattle.msg +
            '<div class="bp-battle-detail">' +
            lastBattle.engaged + ' attaccanti contro ' + lastBattle.defTroops +
            (lastBattle.fort ? ' (+' + lastBattle.fort + ' da struttura)' : '') +
            ' · probabilità di vittoria ' + Math.round(b.P_A * 100) + '%' +
            '</div>';
    }

    // ---------- legenda costi ----------

    $('bp-legend-toggle').addEventListener('click', () => {
        legendOpen = !legendOpen;
        render();
    });

    function renderLegend(player) {
        const box = $('bp-legend');
        const btn = $('bp-legend-toggle');
        btn.textContent = legendOpen ? 'nascondi' : 'mostra';
        box.style.display = legendOpen ? 'block' : 'none';
        if (!legendOpen) return;

        // La legenda si genera da GameRules.COSTS: costi e testo non possono
        // divergere da quelli che la validazione applica davvero.
        const path = selectedProvId ? R.engine.path(selectedProvId) : null;
        const soldiersHere = path ? R.countPiece(path, 'soldato') : 0;

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
            '<div class="bp-empty-hint">I costi in soldati si pagano sulla provincia selezionata' +
            (path ? ' (' + R.provinceLabel(path) + ': ' + soldiersHere + ')' : '') + '.</div>';
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

    function render() {
        const player = currentPlayer();
        if (!player) return;

        const paths = R.ownedPaths(player.name);
        const snapshot = snapshotProvinces(player);
        const units = KingdomStats.countUnits(snapshot);
        const capitalPath = R.getCapitalPathFor(player);
        const pop = capitalPath ? R.computePopularity(player, capitalPath) : null;
        const connectedSet = GA().connectedOf(player);

        syncEditorLink();
        renderTopbar(player, paths);
        renderPrestige(player);
        renderPopEffect(pop);
        setText('bp-pool', player.recluteDaSchierare || 0);
        renderSelected(player, connectedSet);
        renderBattle();
        renderProvinceList(player, paths, connectedSet);
        renderTreasury(player, units, snapshot, connectedSet, pop);
        renderArmy(paths, units, pop, capitalPath, connectedSet);
        renderLegend(player);

        if (!hasFitted && paths.length && R.mapReady()) {
            hasFitted = R.fitToProvinces(paths.map(p => p.id));
        }
    }

    // ---------- selezione dalla mappa ----------

    document.addEventListener('click', (e) => {
        const path = e.target.closest && e.target.closest('path.state');
        if (!path) return;
        selectedProvId = path.id;
        render();
    }, true);

    // ---------- avvio ----------

    R.onRefresh = render;

    function boot(attempt) {
        const player = resolvePlayer();
        if (player) { enterKingdom(player); return; }
        if (attempt < 12) { setTimeout(() => boot(attempt + 1), 120); return; }
        showPicker();
    }
    boot(0);
});

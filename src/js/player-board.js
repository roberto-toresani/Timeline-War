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

    // ---------- pannelli: tre colonne, o tendine su schermi stretti ----------
    // Da 1200px in su i pannelli sono due colonne vere della griglia: la mappa
    // ha la sua terza colonna tutta per sé e gli inset restano a zero. Sotto,
    // tornano tendine sovrapposte e servono le linguette (vedi board.css).

    const leftPanel = $('board-left');
    const rightPanel = $('board-right');
    const wideQuery = window.matchMedia('(min-width: 1200px)');
    const isWide = () => wideQuery.matches;

    // La mappa ha una colonna sua: niente da compensare nel viewBox. La chiamata
    // serve comunque a rifare il fit quando la colonna centrale cambia misura.
    function syncViewInsets() { R.setViewInsets(0, 0); }

    function wirePanelToggle(panel, tab, openLabel, closedLabel) {
        if (!panel || !tab) return;
        const sync = () => {
            const open = !panel.classList.contains('collapsed');
            tab.textContent = open ? openLabel : closedLabel;
        };
        tab.addEventListener('click', () => { panel.classList.toggle('collapsed'); sync(); });
        if (!isWide()) panel.classList.add('collapsed');
        sync();
    }

    wirePanelToggle(leftPanel, $('board-left-tab'), '◀ Corona', 'Corona ▶');
    wirePanelToggle(rightPanel, $('board-right-tab'), 'Regno ▶', '◀ Regno');

    // Al cambio di modalità i pannelli si rimettono nello stato giusto: aperti
    // in griglia (dove non coprono nulla), chiusi come tendine (dove aperti
    // nasconderebbero tutta la mappa). Senza questo la classe "collapsed" resta
    // appiccicata e le linguette raccontano il contrario di quel che si vede.
    const onWideChange = () => {
        const wide = isWide();
        leftPanel.classList.toggle('collapsed', !wide);
        rightPanel.classList.toggle('collapsed', !wide);
        $('board-left-tab').textContent = wide ? '◀ Corona' : 'Corona ▶';
        $('board-right-tab').textContent = wide ? 'Regno ▶' : '◀ Regno';
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
        hasFitted = false;
        selectedProvId = null;
        lastBattle = null;
        R.clearAttackArrows();
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
    // Soldati che possono lasciare la provincia (§5: uno resta sempre a presidiare).
    // Tutti i massimi mostrati qui devono essere questi, non il totale presente:
    // un massimo che il motore poi rifiuta è peggio di un bottone spento.
    function spareOf(path) { return GR().spendableTroops(R.countPiece(path, 'soldato')); }

    // Esegue un'azione e ridisegna. Le azioni chiamano gia' Risiko.save() e
    // refresh(), che riporta qui via onRefresh: basta mostrare il messaggio.
    function run(result) {
        if (!result) return;
        if (result.battle) {
            lastBattle = result;
            // La battaglia va guardata: si inquadrano le due province e parte la
            // scena sulla mappa (vedi playBattleFx in app.js).
            R.fitToProvinces([result.fromId, result.toId]);
            R.playBattleFx(result);
        }
        showNotice(result.msg, result.ok);
        render();
        // La nascita di una città (o di una capitale) è un fatto di cronaca: si
        // inquadra la provincia e si srotola la pergamena (showFoundation in
        // app.js). Dopo il render, altrimenti il ridisegno della plancia ruba il
        // focus al bottone.
        if (result.fondazione && R.showFoundation) {
            if (result.fondazione.id) R.fitToProvinces([result.fondazione.id]);
            R.showFoundation(result.fondazione);
        }
        // Eco storica di una battaglia: si aspetta che la scena sulla mappa sia
        // finita (playBattleFx dura ~3,6s), altrimenti la pergamena coprirebbe
        // proprio il colpo che il giocatore stava guardando.
        if (result.cronaca && R.showFoundation) {
            clearTimeout(run._eco);
            run._eco = setTimeout(() => R.showFoundation(result.cronaca), result.battle ? 3900 : 0);
        }
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

    // ---------- regni in gioco ----------

    function renderKingdoms(player) {
        const box = $('bp-kingdoms');
        if (!box) return;
        const turnoDi = R.turnoDi();
        box.innerHTML = R.players().map(p => {
            const bot = window.Bot ? window.Bot.strategyOf(p) : null;
            const province = R.ownedPaths(p.name).length;
            if (!province && p.id !== player.id) return '';
            return '<div class="bk-row' + (p.id === turnoDi ? ' now' : '') +
                (p.id === player.id ? ' me' : '') + '">' +
                '<span class="bk-dot" style="background:' + p.color + '"></span>' +
                '<span class="bk-name">' + p.name + '</span>' +
                '<span class="bk-kind">' + (bot ? bot.nome : '👤 tu') + '</span>' +
                '<span class="bk-prov">' + province + '</span>' +
                '</div>';
        }).join('') + '<div class="bp-empty-hint">Un regno sparisce dall\'elenco quando perde tutte le province.</div>';
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

    // ---------- fasi del turno ----------
    // L'elenco delle fasi e la loro sequenza stanno in game-actions.js: qui si
    // disegnano soltanto. Chi vuole aggiungere una fase la aggiunge là.

    function phase(player) { return GA().phaseOf(player); }
    function inPhase(player, f) { return isPlaying(player) && phase(player) === f && !player.conquista; }

    function renderPhases(player) {
        const box = $('bp-phases');
        const cur = GA().phaseIndex(player);
        box.innerHTML = '';
        GA().PHASES.forEach((f, i) => {
            const chip = document.createElement('div');
            chip.className = 'bp-phase-chip' + (i === cur ? ' now' : i < cur ? ' done' : '');
            chip.innerHTML = '<span class="n">' + (i < cur ? '✓' : i + 1) + '</span><span class="t"></span>';
            chip.querySelector('.t').textContent = GA().PHASE_LABEL[f];
            box.appendChild(chip);
        });

        const f = phase(player);
        $('bp-phase-head').setAttribute('data-step', String(cur + 1));
        setText('bp-phase-name', GA().PHASE_LABEL[f]);
        setText('bp-phase-sub', isPlaying(player)
            ? GA().PHASE_HINT[f]
            : 'Non è il tuo turno: la plancia mostra dove sei rimasto.');

        // Blocchi che esistono solo in una fase.
        $('fase-schiera').style.display = f === 'schiera' ? '' : 'none';
        $('fase-sposta').style.display = f === 'sposta' ? '' : 'none';

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
        setText('bp-pool-free', free);
        setText('bp-pool-bound', boundTot);
        setText('board-reinf-num', tot);

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
        else note.textContent = 'Usa + e − sulla mappa (sulla provincia selezionata) o nell\'elenco delle province: ' +
            'finché non chiudi la fase puoi spostarle a piacere.';
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
            actions.innerHTML = '<div class="bp-empty-hint">Clicca una provincia sulla mappa, o nell\'elenco 1.4 qui sotto.</div>';
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
        if (!isPlaying(player)) {
            actions.innerHTML = '<div class="bp-empty-hint">Non è il tuo turno: puoi guardare, non agire.</div>';
            return;
        }
        if (player.conquista) {
            actions.innerHTML = '<div class="bp-empty-hint">Conquista in sospeso: decidi qui sotto come occuparla.</div>';
            return;
        }

        // Una fase per volta: mostrare le costruzioni mentre si schiera (o gli
        // attacchi mentre si costruisce) è esattamente il disordine che questa
        // struttura elimina. Il rifiuto vero lo fa comunque game-actions.js.
        actions.innerHTML = '';
        switch (phase(player)) {
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
                actions.innerHTML = '<div class="bp-empty-hint">Fase di spostamento: ' +
                    (player.spostamentoFatto
                        ? 'lo spostamento del turno è già stato fatto.'
                        : 'questa è la provincia di partenza, scegli l\'arrivo qui sotto.') + '</div>';
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

        // Unità temporanee: valgono solo questo turno.
        GR().TEMPORARY.forEach(type => {
            const cost = GR().COSTS[type];
            const afford = GR().canAfford(player, cost, soldiersHere);
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
                const afford = GR().canAfford(player, GR().COSTS.strada, spareOf(path));
                if (!afford.ok) why = shorten(GR().missingText(afford.missing));
            }
            g.appendChild(actionButton('→ ' + R.provinceLabel(target), cost, why,
                () => run(GA().buildRoad(player, path.id, target.id))));
        });
        return g;
    }

    function attackGroup(player, path) {
        const g = group('Attacca da ' + R.provinceLabel(path));
        const available = R.countPiece(path, 'soldato');
        const partenti = spareOf(path);      // tutti meno il presidio (§5)
        const targets = GA().attackTargets(player, path.id);

        // L'esercito a disposizione va detto prima dei bersagli: è il vincolo che
        // decide tutto il resto (uno resta sempre a casa).
        g.insertAdjacentHTML('beforeend',
            '<div class="bp-army">' +
            '<span class="bp-army-n">' + partenti + '</span>' +
            '<span class="bp-army-l">possono partire · su ' + available +
            ' nella provincia, uno resta sempre a presidiare</span></div>');

        if (!targets.length) {
            g.insertAdjacentHTML('beforeend', '<div class="bp-empty-hint">Nessun confine nemico da qui: scegli un\'altra provincia di partenza.</div>');
            return g;
        }
        if (!partenti) {
            g.insertAdjacentHTML('beforeend',
                '<div class="bp-empty-hint">Servono almeno 2 soldati: uno resta sempre a presidiare la provincia di partenza.</div>');
            return g;
        }

        const row = document.createElement('div');
        row.className = 'bp-act-row';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = String(partenti);
        input.value = String(partenti);
        input.title = 'Truppe impegnate (ne resta almeno 1 a presidiare)';
        row.appendChild(input);
        row.insertAdjacentHTML('beforeend',
            '<span class="bp-act-cost">di ' + partenti + ' che possono partire</span>');
        g.appendChild(row);

        // Pronostico prima di lanciare la carica: è la stessa formula della
        // battaglia (§9, P_A = A² / (A² + Deff²)), così il giocatore sa cosa
        // rischia invece di tirare a caso.
        const odds = [];
        targets.forEach(t => {
            const bonus = t.fort ? ' +' + t.fort : '';
            const btn = actionButton('⚔ ' + t.label, t.owner + ' · ' + t.troops + bonus, null,
                () => {
                    const n = parseInt(input.value, 10);
                    const p = winChance(n, t);
                    R.confirm({
                        title: 'Attaccare ' + t.label + '?',
                        text: n + (n === 1 ? ' truppa impegnata' : ' truppe impegnate') + ' contro ' +
                            t.troops + (t.fort ? ' difensori (+' + t.fort + ' dalle strutture)' : ' difensori') +
                            ' · probabilità di vittoria ' + p + '%. Le truppe impegnate lasciano ' +
                            R.provinceLabel(path) + ' comunque vada: se vinci deciderai quante ' +
                            'restano nella provincia presa e quante rientrano; se perdi non torna nessuno.',
                        ok: '⚔ Carica', tone: 'war'
                    }, () => run(GA().attack(player, path.id, t.id, n)));
                });
            const chip = document.createElement('span');
            chip.className = 'bp-odds';
            btn.appendChild(chip);
            odds.push(() => {
                const p = winChance(parseInt(input.value, 10), t);
                chip.textContent = p + '%';
                chip.className = 'bp-odds ' + (p >= 60 ? 'good' : p >= 40 ? 'even' : 'bad');
            });
            g.appendChild(btn);
        });

        const refreshOdds = () => odds.forEach(f => f());
        input.addEventListener('input', refreshOdds);
        refreshOdds();
        return g;
    }

    // Probabilità di vittoria dell'attaccante col numero di truppe scelto.
    function winChance(n, target) {
        const a = Math.max(0, Math.floor(n || 0));
        if (!a) return 0;
        const deff = target.troops + target.fort;
        return Math.round(100 * (a * a) / (a * a + deff * deff));
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

        const path = selectedProvId ? R.engine.path(selectedProvId) : null;
        if (!path || R.engine.owner(path) !== player.name) {
            box.innerHTML = '<div class="bp-empty-hint">Scegli sulla mappa (o nell\'elenco) la provincia da cui far partire i soldati.</div>';
            return;
        }

        const available = R.countPiece(path, 'soldato');
        const mobili = spareOf(path);
        if (!mobili) {
            box.innerHTML = '<div class="bp-empty-hint">In ' + R.provinceLabel(path) +
                ' c\'è un solo soldato: deve restare a presidiare.</div>';
            return;
        }

        const targets = GA().moveTargets(player, path.id);
        if (!targets.length) {
            box.innerHTML = '<div class="bp-empty-hint">Da ' + R.provinceLabel(path) +
                ' non si raggiunge nessun\'altra tua provincia via terra.</div>';
            return;
        }

        box.insertAdjacentHTML('beforeend',
            '<div class="bp-army"><span class="bp-army-n">' + mobili + '</span>' +
            '<span class="bp-army-l">muovibili da ' + R.provinceLabel(path) + ' · su ' + available +
            ', uno resta a presidiare</span></div>');

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
        box.appendChild(row);

        targets.forEach(t => {
            box.appendChild(actionButton('→ ' + t.label, t.troops + ' già lì', null, () => {
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

    // ---------- frecce d'attacco sulla mappa ----------
    // Si ridisegnano a ogni render perché i bersagli cambiano dopo ogni conquista.

    function syncAttackArrows(player) {
        const path = selectedProvId ? R.engine.path(selectedProvId) : null;
        if (!path || !inPhase(player, 'attacca') || R.engine.owner(path) !== player.name) {
            R.clearAttackArrows();
            return;
        }
        const targets = GA().attackTargets(player, path.id);
        if (R.countPiece(path, 'soldato') < 2 || !targets.length) { R.clearAttackArrows(); return; }
        R.showAttackArrows(path.id, targets.map(t => t.id));
    }

    // ---------- esito battaglia ----------

    function caduti(n) { return n ? '−' + n + ' caduti' : 'nessun caduto'; }

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
                <div class="bb-odds-txt">probabilità che avevi di vincere: ${odds}%${L.fort ? ' · +' + L.fort + ' di difesa dalle strutture' : ''}</div>
            </div>`;

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
        renderPhases(player);
        renderDeployPanel(player);
        renderSelected(player, connectedSet);
        renderConquest(player);
        renderBattle();
        renderMove(player);
        renderProvinceList(player, paths, connectedSet);
        renderKingdoms(player);
        renderMapHud(player);
        syncAttackArrows(player);
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

    // I turni dell'IA (js/bot.js) arrivano qui: la mappa si ridisegna da sola
    // (ogni azione chiama refresh), a noi resta da raccontare cosa è successo e,
    // in vista generale, da seguire la battaglia con l'inquadratura.
    if (window.Bot) {
        window.Bot.onEvent = (evt) => {
            if (!evt) return;
            if (evt.type === 'start') {
                showNotice('⚙ ' + evt.player.name + ' — ' + window.Bot.labelOf(evt.player) +
                    ': ' + window.Bot.strategyOf(evt.player).motto, true);
                return;
            }
            if (evt.type === 'action' && evt.result && evt.result.battle) {
                if (spectating) R.fitToProvinces([evt.result.fromId, evt.result.toId]);
                showNotice(evt.player.name + ' → ' + evt.result.msg, evt.result.ok);
                return;
            }
            if (evt.type === 'idle') { render(); }
        };
    }

    function boot(attempt) {
        const player = resolvePlayer();
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

// PAGINA DI LAVORO (non fa parte del gioco).
// Porta la partita alla fase indicata da ?fase= e apre il cursore d'ordine sul
// primo bersaglio utile: serve a fotografare i comandi sulla mappa in headless,
// dove non si può cliccare. Lo carica solo _dev-play.html (copia di play.html).
(function () {
    const FASE = new URLSearchParams(location.search).get('fase') || 'attacca';
    const APRI = new URLSearchParams(location.search).get('apri') !== '0';
    const VAI = new URLSearchParams(location.search).get('vai') === '1';
    const SPIA = new URLSearchParams(location.search).get('spia') === '1';
    // ?foglio=corona|diplomazia|mercato|costi — apre un pannello del dock.
    // I pannelloni non sono più colonne fisse: Corona, Diplomazia e Mercato si
    // aprono da un pulsante, e i costi sono un pop-up. In headless non si
    // clicca, quindi per fotografarli serve questo.
    const FOGLIO = new URLSearchParams(location.search).get('foglio');
    // ?patti=1 — al turno 1 nessun regno è ancora in vista, quindi il foglio
    // della Diplomazia è vuoto e non si può fotografare. Questo toglie la nebbia
    // e stringe due patti finti col primo regno che confina (o, se non confina
    // nessuno, coi primi due della lista): serve a guardare le SCHEDE, non a
    // giocare. È scenografia di lavoro e resta solo in memoria — non si salva.
    const PATTI = new URLSearchParams(location.search).get('patti') === '1';

    function scenaPatti() {
        const R = window.Risiko, me = P();
        if (!PATTI || !me || !window.Diplomacy) return;
        R.focusPlayer(null);                       // niente nebbia: si vedono tutti
        const altri = R.players().filter(p => p.id !== me.id && R.ownedPaths(p.name).length);
        const a = altri[0], b = altri[1];
        if (!a) return;
        me.patti = [{ tipo: 'nonBelligeranza', con: a.id, dal: 1 }];
        if (b) me.patti.push({ tipo: 'vista', con: b.id, dal: 1 },
                             { tipo: 'nonBelligeranza', con: b.id, dal: 1 });
        me.commerciStorico = [{
            conId: a.id, conNome: a.name, turno: 1,
            dato: { tipo: 'grano', n: 3 }, ricevuto: { tipo: 'pietra', n: 2 }
        }];
        // Una frontiera vera con `a`, così compare anche "Vedi il confine".
        const mie = R.ownedPaths(me.name).map(p => p.id);
        const vicine = [].concat.apply([], mie.map(id => R.engine.landNeighbors(id)))
            .filter(id => mie.indexOf(id) < 0);
        vicine.slice(0, 2).forEach(id => {
            const p = R.engine.path(id);
            if (p) p.setAttribute('data-owner', a.name);
        });
        if (R.onRefresh) R.onRefresh();
    }

    function apriFoglio(n) {
        if (!FOGLIO) return;
        const b = FOGLIO === 'costi'
            ? document.getElementById('dock-costi')
            : document.querySelector('#board-dock .dock-btn[data-sheet="' + FOGLIO + '"]');
        if (!b) { if (n < 200) setTimeout(() => apriFoglio(n + 1), 60); return; }
        b.click();
    }

    function P() { return window.Risiko && window.Risiko.playerByInvite('dev'); }

    // La plancia si apre sulla sola mappa: la colonna del turno è chiusa. Qui la
    // si vuole sempre aperta — è quella che si sta fotografando. `?turno=0` per
    // vedere la mappa da sola.
    function apriTurno() {
        if (new URLSearchParams(location.search).get('turno') === '0') return;
        const p = document.getElementById('board-right');
        const tab = document.getElementById('board-right-tab');
        if (p && tab && p.classList.contains('collapsed')) tab.click();
    }

    function go(n) {
        if (window.Bot) window.Bot.speed(10);   // i bot devono solo togliersi di mezzo
        const p = P();
        if (!p || !window.GameActions || window.Risiko.turnoDi() !== p.id) {
            if (n < 4000) return setTimeout(() => go(n + 1), 60);
            return;
        }
        // Solo in avanti, e mai oltre: il turno non torna indietro, e un clic di
        // troppo aprirebbe il dialogo di fine turno invece della fase chiesta.
        const meta = window.GameActions.PHASES.indexOf(SPIA ? 'costruisci' : FASE);
        let guard = 0;
        while (window.GameActions.phaseIndex(p) < meta && guard++ < 6) {
            document.getElementById('bp-next-phase').click();
        }
        setTimeout(() => (SPIA ? spia(p) : pick(p)), 300);
    }

    // ?spia=1 — apre la cartella delle spie (§9.3) e accende sulla mappa le
    // province dove la perlustrazione può arrivare, poi ci inquadra sopra.
    function spia(p) {
        const fold = document.getElementById('fase-spie');
        if (!fold) return;
        fold.open = true;
        const btn = fold.querySelector('.bp-act');
        if (btn) btn.click();
        setTimeout(() => {
            const accese = Array.from(document.querySelectorAll('path.state.order-spy')).map(el => el.id);
            const mie = window.Risiko.ownedPaths(p.name).map(el => el.id);
            if (accese.length) window.Risiko.fitToProvinces(mie.concat(accese));
            // ?vai=1 va fino in fondo: sceglie la meta più lontana fra quelle
            // accese e conferma, così lo scatto mostra la spia già in campo.
            if (!VAI || !accese.length) return;
            setTimeout(() => {
                const to = document.getElementById(accese[accese.length - 1]);
                if (to) to.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                setTimeout(() => {
                    const yes = document.querySelector('#ui-confirm .uc-yes');
                    if (yes) yes.click();
                    // Inquadra la perlustrazione: la provincia e le sue limitrofe,
                    // che sono esattamente quel che la spia mostra (§9.3).
                    setTimeout(() => {
                        const dove = to && to.id;
                        if (dove) window.Risiko.fitToProvinces(
                            [dove].concat(Array.from(window.Risiko.engine.landNeighbors(dove))));
                    }, 400);
                }, 300);
            }, 400);
        }, 400);
    }

    function pick(p) {
        const mie = window.Risiko.ownedPaths(p.name);
        let from = null, targets = null;
        for (const path of mie) {
            const t = (FASE === 'sposta')
                ? window.GameActions.moveTargets(p, path.id)
                : window.GameActions.attackTargets(p, path.id).filter(x => !x.viaMare);
            if (t.length && window.Risiko.countPiece(path, 'soldato') > 1) { from = path; targets = t; break; }
        }
        if (!from) return;
        from.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        setTimeout(() => {
            window.Risiko.fitToProvinces([from.id].concat(targets.map(t => t.id)));
            if (!APRI) return;
            setTimeout(() => {
                const to = document.getElementById(targets[0].id);
                if (to) to.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                if (!VAI) return;
                // ?vai=1 va fino in fondo: preme il bottone del cursore e conferma.
                setTimeout(() => {
                    const go = document.querySelector('#map-order-hud .moh-go');
                    if (go) go.click();
                    setTimeout(() => {
                        const yes = document.querySelector('#ui-confirm .uc-yes');
                        if (yes) yes.click();
                    }, 300);
                }, 400);
            }, 500);
        }, 300);
    }

    go(0);
    setTimeout(apriTurno, 900);
    // La scenografia dei patti PRIMA del foglio: il foglio si disegna
    // all'apertura, e deve trovare le schede già pronte.
    setTimeout(scenaPatti, 1300);
    // Dopo che la plancia si è disegnata almeno una volta: il pulsante del dock
    // c'è dal principio, ma il contenuto del foglio lo riempie il render.
    setTimeout(() => apriFoglio(0), 1700);
})();

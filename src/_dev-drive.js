// PAGINA DI LAVORO (non fa parte del gioco).
// Porta la partita alla fase indicata da ?fase= e apre il cursore d'ordine sul
// primo bersaglio utile: serve a fotografare i comandi sulla mappa in headless,
// dove non si può cliccare. Lo carica solo _dev-play.html (copia di play.html).
(function () {
    const FASE = new URLSearchParams(location.search).get('fase') || 'attacca';
    const APRI = new URLSearchParams(location.search).get('apri') !== '0';
    const VAI = new URLSearchParams(location.search).get('vai') === '1';
    const SPIA = new URLSearchParams(location.search).get('spia') === '1';

    function P() { return window.Risiko && window.Risiko.playerByInvite('dev'); }

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
})();

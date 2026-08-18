// ============================================================
// SPIE (§9.3) — occhi che si COMPRANO invece di conquistarli.
// Funzioni PURE, senza DOM: si passano id di province e una funzione che dice
// chi confina con chi. Chi muta lo stato è game-actions.js (sendSpy), chi
// dipinge la nebbia è app.js (computeVisibleProvinces).
//
// Che cosa fa una spia, in una riga: per 300 monete manda un uomo in un
// territorio LONTANO e per 3 turni ti fa vedere di CHI SONO quella provincia e
// le sue limitrofe. Non le truppe: una spia riconosce le bandiere, non conta le
// guarnigioni — è esattamente la NEBBIA LEGGERA del §9.2 (`haze`), la stessa
// che dà la portata di una nave. Per questo la spia non ha bisogno di un grado
// di visibilità nuovo: si versa in quello che c'è già.
//
// Il RAGGIO si misura in PROVINCE, non in unità di mappa: 5 confini di distanza
// dal proprio territorio, camminando via terra. È il modo in cui viaggia un
// uomo, ed è anche l'unica misura che il giocatore può verificare guardando la
// mappa (contare confini) invece di doverla prendere per buona.
// ============================================================

(function (root) {
    'use strict';

    const COSTO = 300;      // monete (§6)
    const DURATA = 3;       // turni di perlustrazione, cioè 3 decenni (§9.3)
    const MAX = 3;          // perlustrazioni aperte contemporaneamente
    const RAGGIO = 5;       // quanti confini si possono percorrere per arrivarci

    function turnOf(s) { return Math.floor((s && s.turno) || 0); }

    // Le spie ancora in campo a questo turno. Si filtra invece di cancellare,
    // così la stessa lista risponde correttamente a chiunque la legga (la
    // plancia, la nebbia, l'azione) senza dipendere da chi ha fatto pulizia per
    // ultimo. La potatura vera la fa `beginTurn`, ed è solo ordine.
    function active(spie, turno) {
        return (spie || []).filter(s => s && s.prov && (turno - turnOf(s)) < DURATA && (turno - turnOf(s)) >= 0);
    }

    // Quanti turni le restano, questo compreso: 3 appena partita, 1 all'ultimo.
    function remaining(spia, turno) {
        return Math.max(0, DURATA - (turno - turnOf(spia)));
    }

    // Che cosa vede UNA spia: la provincia dove sta e le sue limitrofe via terra.
    function watch(provId, neighborsOf) {
        const out = [provId];
        (neighborsOf(provId) || []).forEach(id => { if (id) out.push(id); });
        return out;
    }

    // Che cosa vedono TUTTE le spie ancora in campo di un regno.
    function watched(spie, turno, neighborsOf) {
        const out = new Set();
        active(spie, turno).forEach(s => watch(s.prov, neighborsOf).forEach(id => out.add(id)));
        return out;
    }

    // Dove si può mandarne una: cammino a onde (BFS) di al più `raggio` confini
    // a partire da TUTTE le proprie province, meno quel che si vede già.
    // Il cammino attraversa province di chiunque — la distanza è geografia, non
    // proprietà: una spia passa dalle terre altrui, è il suo mestiere.
    // Ritorna [{id, dist}] ordinato per distanza crescente.
    function targets(ownedIds, seenIds, neighborsOf, raggio) {
        raggio = raggio || RAGGIO;
        const seen = seenIds instanceof Set ? seenIds : new Set(seenIds || []);
        const visti = new Set();
        let fronte = [];
        (ownedIds || []).forEach(id => { if (id && !visti.has(id)) { visti.add(id); fronte.push(id); } });

        const out = [];
        for (let d = 1; d <= raggio && fronte.length; d++) {
            const prossima = [];
            fronte.forEach(cur => {
                (neighborsOf(cur) || []).forEach(id => {
                    if (!id || visti.has(id)) return;
                    visti.add(id);
                    prossima.push(id);
                    // Le province già visibili restano parte del cammino (ci si
                    // passa attraverso) ma non sono mete: 300 monete per guardare
                    // quel che si vede dalla finestra non sono una spia.
                    if (!seen.has(id)) out.push({ id, dist: d });
                });
            });
            fronte = prossima;
        }
        return out;
    }

    const api = { COSTO, DURATA, MAX, RAGGIO, active, remaining, watch, watched, targets };

    root.Spies = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);

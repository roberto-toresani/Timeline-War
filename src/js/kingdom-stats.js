// Cruscotto del regno: funzioni PURE che traducono uno "snapshot" di province in
// numeri da mostrare (province, truppe, entrate, rinforzi, resa risorse).
// Nessun DOM qui dentro: chi chiama (player-board.js) legge la mappa e passa i dati.
// Testabile da riga di comando come battle.js.
//
// Snapshot atteso:
//   provinces: [{ id, resource: 'grano'|null, pieces: [{type, count}] }]
//   tax:       'leggera' | 'normale' | 'dura'
//
// Riferimento regole: docs/GAME_DESIGN.md §5 (truppe), §7 (monete), §8 (popolarità).

(function (root) {
    'use strict';

    // Monete incassate da OGNI città per turno (§7). La Capitale conta come città.
    const TAX_INCOME = { leggera: 50, normale: 100, dura: 150 };

    // Effetti per livello di Popolarità (§8). La colonna prestigio segue il §10:
    // Popolarità ≥ 4 → +1/turno, Popolarità 1 → −1/turno.
    const POP_EFFECT = {
        1: { soldati: -2, risorse: -2, prestigio: -1 },
        2: { soldati: -1, risorse: -1, prestigio: 0 },
        3: { soldati: 0, risorse: 0, prestigio: 0 },
        4: { soldati: 1, risorse: 1, prestigio: 0 },
        5: { soldati: 2, risorse: 2, prestigio: 1 }
    };

    // Arrotondamento del regolamento (§8): per difetto, salvo parte decimale > 0,8.
    // 2,83 → 3 · 2,5 → 2 · 4,8 → 4 · 3,9 → 4.
    function roundRule(x) {
        const f = Math.floor(x);
        return (x - f > 0.8) ? f + 1 : f;
    }

    function popEffect(level) {
        return POP_EFFECT[level] || { soldati: 0, risorse: 0, prestigio: 0 };
    }

    // Somma di tutte le pedine del regno, per tipo.
    function countUnits(provinces) {
        const t = {};
        (provinces || []).forEach(p => {
            (p.pieces || []).forEach(e => {
                t[e.type] = (t[e.type] || 0) + e.count;
            });
        });
        return {
            soldato: t.soldato || 0,
            generale: t.generale || 0,
            barca: t.barca || 0,
            vascello: t.vascello || 0,
            capitale: t.capitale || 0,
            citta: t.citta || 0,
            fortezza: t.fortezza || 0,
            mercato: t.mercato || 0
        };
    }

    // Entrate per turno: solo le Città pagano le tasse, e la Capitale conta come Città (§7).
    function income(units, tax) {
        const rate = TAX_INCOME[tax] || TAX_INCOME.normale;
        const payingCities = units.citta + units.capitale;
        return { total: payingCities * rate, cities: payingCities, rate };
    }

    // Reclute a inizio turno (§5.1). La Fortezza vale 5 soldati (in alternativa 1
    // Generale, a scelta: qui contiamo i 5 soldati).
    // La CAPITALE conta come Città anche qui: §6 dice che "conta come una Città a
    // tutti gli effetti ... +1 soldato/turno". Il §5.1 nomina solo le Città, ma è
    // un'abbreviazione — confermato dall'utente.
    //
    // Le reclute nascono in DUE mucchi diversi, e la differenza è una regola, non
    // una comodità di UI (confermata dall'utente):
    //  - LIBERE: quelle del territorio (1 ogni 3 province) e il modificatore di
    //    Popolarità. Il giocatore le distribuisce come vuole fra le sue province,
    //    e finché è il suo turno può anche ritirarle e rimetterle altrove.
    //  - VINCOLATE: quelle prodotte da un edificio (Capitale +1, Città +1,
    //    Fortezza +5). Nascono nella provincia dell'edificio e lì devono restare.
    // Il modificatore di Popolarità morde solo il mucchio libero (che non scende
    // sotto zero): non può cancellare la guarnigione di una Fortezza.
    function reinforcements(provinceCount, units, popularity) {
        const cities = units.citta + units.capitale;
        const fromProvinces = Math.floor(provinceCount / 3);
        const fromCities = cities;
        const fromForts = units.fortezza * 5;
        const fromPop = popularity ? popEffect(popularity).soldati : 0;
        const breakdown = [
            { label: provinceCount + ' province ÷ 3', value: fromProvinces, vincolata: false }
        ];
        if (popularity) breakdown.push({ label: 'Popolarità ' + popularity, value: fromPop, vincolata: false });
        breakdown.push(
            { label: cities + ' città (Capitale inclusa)', value: fromCities, vincolata: true },
            { label: units.fortezza + (units.fortezza === 1 ? ' fortezza' : ' fortezze'), value: fromForts, vincolata: true }
        );
        const libere = Math.max(0, fromProvinces + fromPop);
        const vincolate = fromCities + fromForts;
        return { total: libere + vincolate, libere, vincolate, breakdown };
    }

    // Come `reinforcements`, ma dice anche DOVE vanno le vincolate: serve al motore
    // per riempire il serbatoio di inizio turno e alla plancia per mostrarlo.
    // Ritorna in più `perProvincia = { idProvincia: n }`.
    function reinforcementPlan(provinces, popularity) {
        const list = provinces || [];
        const plan = reinforcements(list.length, countUnits(list), popularity);
        const perProvincia = {};
        list.forEach(p => {
            const u = countUnits([p]);
            const n = u.capitale + u.citta + u.fortezza * 5;
            if (n > 0) perProvincia[p.id] = n;
        });
        return Object.assign({}, plan, { perProvincia });
    }

    // Resa risorse per turno: 1 unità per provincia (§4). La connettività alla Capitale
    // non è ancora tracciata, quindi qui contiamo le province POSSEDUTE — il numero è un
    // massimo teorico finché non arriveranno strade e collegamenti.
    function resourceYield(provinces, keys) {
        const out = {};
        (keys || []).forEach(k => { out[k] = 0; });
        (provinces || []).forEach(p => {
            if (p.resource && out[p.resource] !== undefined) out[p.resource] += 1;
        });
        return out;
    }

    // Quanti tipi DIVERSI di risorsa possiede il regno (è il sotto-fattore
    // "diversità" del Benessere, §8).
    function resourceVariety(provinces) {
        const seen = {};
        (provinces || []).forEach(p => { if (p.resource) seen[p.resource] = true; });
        return Object.keys(seen).length;
    }

    const api = {
        TAX_INCOME, POP_EFFECT,
        roundRule, popEffect, countUnits, income, reinforcements, reinforcementPlan,
        resourceYield, resourceVariety
    };

    root.KingdomStats = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);

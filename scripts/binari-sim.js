// Banco di prova del BINARIO STORICO: simula tre regni — uno che corre, uno che
// arranca, uno che crolla — per dieci cicli, e stampa a ogni giro capitolo,
// epoca, intensità e le tre soglie generate. Serve a tarare le curve senza
// giocare cento turni. Riproduce le stesse regole di GameActions.closeCycle.
// Uso:  node scripts/binari-sim.js "Regno di Castiglia"
const O = require("../src/js/objectives.js");

// L'ordine in cui un regno conquista: prima le regioni dei suoi capitoli, poi
// le province nominate, poi terre generiche. Così la meta del capitolo entra
// nel possesso man mano che il regno cresce, come in partita.
function sequenzaDi(name) {
    const seq = [];
    const push = id => { if (id && seq.indexOf(id) < 0) seq.push(id); };
    (O.BINARI[name] || []).forEach(cap => cap.voci.forEach(v => {
        const a = v.arg || {};
        if (a.set) O.SETS[a.set].forEach(push);
        if (a.id) push(a.id);
        if (a.ids) a.ids.forEach(push);
        if (a.capo && a.capo.arg && a.capo.arg.set) O.SETS[a.capo.arg.set].forEach(push);
    }));
    for (let i = 0; i < 60; i++) push('Terra_' + i);
    return seq;
}

function ctxDi(seq, st) {
    const ids = seq.slice(0, Math.max(0, st.province));
    const idSet = new Set(ids);
    const citta = ids.slice(0, st.citta);
    const navi = ids.slice(0, st.navi);
    return {
        owns: id => idSet.has(id),
        ownedIds: () => ids,
        provCount: () => ids.length,
        soldiersOn: id => idSet.has(id) ? st.guarnigione : 0,
        hasMercato: () => st.mercato, hasCity: () => citta.length > 0, hasFortress: () => false,
        cityIds: () => citta,
        shipIds: () => navi, shipCount: () => st.navi,
        monete: st.monete,
        scorteOf: () => st.scorte,
        connectedCount: () => Math.min(ids.length, st.collegate),
        connectedTypes: () => st.tipi,
        isConnected: id => idSet.has(id),
        roadCount: () => st.strade,
        isCoastal: (id) => ids.indexOf(id) % 3 === 0,
        popularity: () => st.popolarita, sicurezza: () => st.sicurezza
    };
}

// I tre destini. `passo(ciclo)` restituisce lo stato del regno a fine ciclo.
const DESTINI = {
    'corre': c => ({ province: 3 + c * 4, guarnigione: 3 + c, monete: 800 + c * 400,
        scorte: 2 + c * 2, collegate: 2 + c * 3, tipi: Math.min(5, 1 + c), strade: c * 2,
        navi: Math.floor(c / 2), citta: Math.floor(c / 2), mercato: c >= 2,
        popolarita: Math.min(5, 1 + Math.floor(c / 2)), sicurezza: Math.min(5, Math.floor(c / 2)) }),
    'arranca': c => ({ province: 3 + Math.floor(c / 3), guarnigione: 2 + Math.floor(c / 4),
        monete: 500 + c * 40, scorte: 1 + Math.floor(c / 3), collegate: Math.floor(c / 3),
        tipi: Math.min(2, Math.floor(c / 4)), strade: Math.floor(c / 2), navi: 0,
        citta: 0, mercato: c >= 6, popolarita: 1 + (c >= 5 ? 1 : 0), sicurezza: c >= 6 ? 1 : 0 }),
    'crolla': c => ({ province: Math.max(1, 8 - c), guarnigione: Math.max(1, 5 - c),
        monete: Math.max(0, 900 - c * 120), scorte: Math.max(0, 6 - c), collegate: Math.max(0, 5 - c),
        tipi: Math.max(0, 3 - c), strade: Math.max(0, 4 - c), navi: 0,
        citta: c <= 2 ? 1 : 0, mercato: c <= 3, popolarita: Math.max(1, 4 - c),
        sicurezza: Math.max(0, 3 - c) })
};

function profiloDa(st, fatti, ciclo, capitolo) {
    return { ciclo, capitolo, province: st.province, monete: st.monete,
        esercito: st.province * st.guarnigione, collegate: st.collegate,
        tipiCollegati: st.tipi, popolarita: st.popolarita,
        capitale: st.citta > 0 || st.province > 2, obiettiviFatti: fatti };
}

function simula(name, destino) {
    const seq = sequenzaDi(name);
    const capitoli = O.chapterCount(name);
    let capitolo = 1, intensita = 'avanzare', ritmo = 1, punti = 0;
    const profili = [];
    console.log('\n=== ' + name + ' — destino: ' + destino + ' (binario di ' + capitoli + ' capitoli) ===');
    // Assegnazione del ciclo I, calibrata sullo stato di partenza.
    let ass = O.generate(name, ctxDi(seq, DESTINI[destino](0)), {
        ciclo: 1, capitolo, intensita, ritmo, calibra: true });

    for (let ciclo = 1; ciclo <= 10; ciclo++) {
        const st = DESTINI[destino](ciclo);
        const ctx = ctxDi(seq, st);
        const snap = O.evaluate(ass, ctx);
        const fatti = snap.items.filter(i => i.completato).length;
        punti += snap.punti;

        console.log(
            'ciclo ' + String(ciclo).padStart(2) + ' · cap ' + ass.capitolo + ' ' + ass.epoca +
            ' "' + ass.tema + '" · ' + ass.intensita.padEnd(9) +
            ' · ' + st.province + ' prov · esito ' + snap.punti + '/10 [' +
            snap.items.map(i => i.completato ? 'x' : '-').join('') + ']');
        snap.items.forEach(i => console.log('        ' + i.tier.padEnd(11) + ' ' +
            String(i.soglia).padStart(5) + '  ' + i.check));

        const prof = profiloDa(st, fatti, ciclo, capitolo);
        profili.push(prof);
        const prec = profili.length > 1 ? profili[profili.length - 2] : null;
        ritmo = O.ritmoDa(prof, prec);
        const mossa = O.passo({
            primarioFatto: !!snap.items[0].completato, fatti: fatti,
            province: prof.province, provincePrec: prec ? prec.province : null,
            capitalePersa: !!(prec && prec.capitale && !prof.capitale),
            intensita: intensita, capitolo: capitolo, ciclo: ciclo + 1, capitoli: capitoli
        });
        capitolo = mossa.capitolo; intensita = mossa.intensita;
        let salti = 0;
        while (salti++ < 4 && capitolo < capitoli && capitolo < (ciclo + 1) + O.FRENO
               && O.superato(name, capitolo, ctx)) capitolo++;
        ass = O.generate(name, ctx, { ciclo: ciclo + 1, capitolo, intensita, ritmo, calibra: true });
    }
    console.log('   → prestigio accumulato: ' + punti + ' su 100');
    return punti;
}

const regno = process.argv[2] || 'Regno di Inghilterra';
['corre', 'arranca', 'crolla'].forEach(d => simula(regno, d));

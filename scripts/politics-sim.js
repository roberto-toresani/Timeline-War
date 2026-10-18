// Banco di prova della POLITICA DEL REGNO (src/js/politics.js): stampa la
// tabella degli effetti, controlla gli invarianti e simula tre corone che
// giocano la politica in tre modi diversi per cinque cicli. Serve a decidere se
// i numeri piacciono PRIMA di metterli in partita.
//
// Uso:
//   node scripts/politics-sim.js            tutto
//   node scripts/politics-sim.js tabella    solo la tabella degli effetti
//   node scripts/politics-sim.js consiglio  solo la finestra del Consiglio
//   node scripts/politics-sim.js partite    solo le tre corone a confronto

const P = require('../src/js/politics.js');

const ARG = (process.argv[2] || 'tutto').toLowerCase();
const CAV_DAL = 11;                       // GameRules.UNLOCK_TURN.cavaliere
const seg = n => (n > 0 ? '+' : '') + n;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const anno = t => 1000 + (t - 1) * 10;
const ROMANI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function titolo(s) {
    console.log('\n' + s);
    console.log('='.repeat(s.length));
}

// ---------------------------------------------------------------- la tabella
function tabella() {
    titolo('EFFETTO DELLA POPOLARITÀ, PER GRADO DI POLITICA');
    console.log('militare = reclute (e cavalieri dal ciclo II) · produzione = risorse raccolte\n');

    console.log(pad('', 6) + P.GRADES.map(g => lpad(g.label, 18)).join(''));
    for (let pop = 5; pop >= 1; pop--) {
        const celle = P.GRADES.map(g => {
            const e = P.effect(pop, g.v);
            const s = seg(e.militare) + ' mil / ' + seg(e.produzione) + ' prod';
            return lpad(s, 19);
        });
        console.log(pad('Pop ' + pop, 6) + celle.join(''));
    }

    titolo('INVARIANTE: il netto è quello di oggi (nessun bonus gratuito)');
    let ko = 0;
    for (let pop = 1; pop <= 5; pop++) {
        const oggi = (pop - 3) * 2;             // popEffectOf: soldati + risorse
        P.GRADES.forEach(g => {
            const e = P.effect(pop, g.v);
            const netto = e.militare + e.produzione;
            if (netto !== oggi) {
                console.log('  ✗ Pop ' + pop + ' grado ' + g.v + ': netto ' + netto + ', atteso ' + oggi);
                ko++;
            }
        });
    }
    console.log(ko ? '  ' + ko + ' scostamenti' : '  ✓ tutti e 25 i casi tornano');

    titolo('IL PRIVILEGIO DEI GRADI ESTREMI');
    console.log('  Non spostano di più: aggiungono una cosa di natura diversa.');
    P.GRADES.forEach(g => {
        const pk = P.perks(g.v, 2);
        console.log('  ' + pad(g.label, 16) + (pk.testo || '—'));
    });
    console.log('');
    console.log('  Su un ciclo intero: ' + (P.CYCLE / P.PERK_CAVALIERE_OGNI) + ' cavalieri' +
        '  contro  ' + (P.CYCLE * P.PERK_MONETE) + ' monete.');
}

// ------------------------------------------------------------- il Consiglio
function consiglio() {
    titolo('LA FINESTRA DEL CONSIGLIO (regno dall\'inizio, nato al turno 1)');
    let r = '';
    for (let t = 1; t <= 24; t++) {
        const ap = P.councilOpen(t, 1);
        r += (P.cycleStart(t) ? '|' : ' ') + (ap ? '●' : '·');
    }
    console.log('  turni 1-24: ' + r);
    console.log('  ● aperto · chiuso   | inizio di ciclo (qui scatta il ritorno all\'Equilibrio)');

    titolo('UN REGNO NATO PER EVENTO (l\'Orda, turno 21)');
    let o = '';
    for (let t = 19; t <= 34; t++) o += (P.councilOpen(t, 21) ? '●' : '·');
    console.log('  turni 19-34: ' + o + '   (apre subito alla nascita, poi col ciclo)');

    titolo('IL RITORNO ALL\'EQUILIBRIO');
    [-2, -1, 0, 1, 2].forEach(g => {
        console.log('  ' + pad(P.grade(g).label, 16) + lpad(g, 3) + ' → ' + seg(P.drift(g)) +
            '   (' + P.grade(P.drift(g)).label + ')');
    });

    titolo('canIssue: i quattro rifiuti');
    const base = { turno: 1, nato: 1, grado: 0, emanati: [], haCapitale: true };
    const casi = [
        ['dentro la finestra, nessun decreto', 'torneo', base],
        ['fuori finestra (turno 5)', 'torneo', Object.assign({}, base, { turno: 5 })],
        ['senza Capitale', 'torneo', Object.assign({}, base, { haCapitale: false })],
        ['già emanato', 'torneo', Object.assign({}, base, { emanati: ['torneo'] })],
        ['tetto di 2 raggiunto', 'torneo', Object.assign({}, base, { emanati: ['corvee', 'feudo'] })],
        ['grado già al minimo', 'torneo', Object.assign({}, base, { grado: -2 })],
        ['grado al minimo, ma decreto opposto', 'decime', Object.assign({}, base, { grado: -2 })]
    ];
    casi.forEach(([etichetta, id, ctx]) => {
        const v = P.canIssue(id, ctx);
        console.log('  ' + pad(etichetta, 36) + (v.ok ? '✓ grado → ' + seg(v.grado) : '✗ ' + v.motivo));
    });
}

// ------------------------------------------------------------- le tre corone
// Una corona simulata, con solo quel che serve a far girare la politica.
function corona(nome, strategia) {
    return {
        nome, strategia,
        grado: 0,
        monete: 1000,
        scorte: { pietra: 2, legno: 2, argilla: 1, grano: 3, bestiame: 2 },
        reclute: 0, cavalieri: 0, risorse: 0,   // totali incassati, per il confronto
        spesoMonete: 0, decretiFatti: 0, saltati: 0,
        raccoltoPerso: 0, raccoltoVinto: 0, uominiCeduti: 0, perkMonete: 0,
        log: []
    };
}

function puoPagare(c, d) {
    if ((d.costo.monete || 0) > c.monete) return false;
    const s = d.costo.scorte || {};
    return Object.keys(s).every(k => (c.scorte[k] || 0) >= s[k]);
}

function paga(c, d) {
    c.monete -= (d.costo.monete || 0);
    c.spesoMonete += (d.costo.monete || 0);
    Object.keys(d.costo.scorte || {}).forEach(k => { c.scorte[k] -= d.costo.scorte[k]; });
    const dono = d.dono || {};
    Object.keys(dono.scorte || {}).forEach(k => { c.scorte[k] = (c.scorte[k] || 0) + dono.scorte[k]; });
}

// La strategia sceglie il verso; dentro quel verso prende il primo decreto che
// può pagare. È lo stesso criterio che avrà il bot (bot.js policyPlan).
function versoVoluto(c, turno) {
    if (c.strategia === 'nobilta') return -1;
    if (c.strategia === 'popolo') return 1;
    if (c.strategia === 'alterna') return P.cycleOf(turno) % 2 ? -1 : 1;
    return 0;        // 'ferma': non emana niente
}

function consiglioDi(c, turno) {
    const verso = versoVoluto(c, turno);
    if (!verso) return;

    // UNA SEDUTA, UN DECRETO — e la seduta dura più turni. Il conto di quel
    // che si è già emanato va tenuto sulla CORONA, con una chiave che unisce
    // ciclo e seduta: tenendolo in una variabile locale (com'era) la corona
    // emanava un decreto a ogni turno della finestra, cioè tre invece di uno,
    // e arrivava al grado estremo entro il turno 2.
    const slot = P.councilSlot(turno, 1);
    if (!slot) return;
    const chiave = P.cycleOf(turno) + ':' + slot;
    c.sedute = c.sedute || {};
    const emanati = (c.sedute[chiave] = c.sedute[chiave] || []);
    const nuovi = [];   // solo quel che si emana ADESSO, per il registro

    for (let k = emanati.length; k < P.MAX_DECREES; k++) {
        const scelto = P.decreesFor(verso).find(d => {
            const v = P.canIssue(d.id, {
                turno, nato: 1, grado: c.grado, emanati, haCapitale: true
            });
            return v.ok && puoPagare(c, d);
        });
        if (!scelto) { c.saltati++; break; }
        paga(c, scelto);

        // IL PREZZO CHE NON STA IN MAGAZZINO. Feudo e Corvée tolgono il
        // raccolto di una provincia fino a fine ciclo, la Franchigia le tasse
        // di una Città per 3 turni, l'Affrancatura rende +1 ma costa 2 uomini.
        // Senza questo conto la colonna "monete spese" diceva che la politica
        // dei signori è quasi gratis, che era vero solo perché il suo prezzo è
        // scritto sulla mappa e non nelle casse.
        const fino = P.expiryOf(scelto, turno);
        const turni = fino ? Math.max(0, fino - turno + 1) : 0;
        if (scelto.id === 'feudo' || scelto.id === 'corvee') {
            c.risorse -= turni; c.raccoltoPerso += turni;
        } else if (scelto.id === 'affranca') {
            c.risorse += turni; c.raccoltoVinto += turni; c.uominiCeduti += scelto.prov.soldati;
        } else if (scelto.id === 'franchigia') {
            c.monete -= turni * 100; c.spesoMonete += turni * 100;
        }

        c.grado = P.clamp(c.grado + scelto.verso);
        emanati.push(scelto.id);
        nuovi.push(scelto.id);
        c.decretiFatti++;
    }
    if (nuovi.length) c.log.push({ turno, grado: c.grado, decreti: nuovi });
}

// Quel che il regno raccoglie SENZA la politica: serve al traboccamento del
// malus (Politics.spill). Un regno medio: 6 province (→ 2 reclute, §5.1) di cui
// 4 con risorsa collegata.
const BASE = { militare: 2, produzione: 4 };

// Il turno: prima il Consiglio (se è il suo momento), poi la produzione.
function turnoDi(c, turno, pop) {
    if (P.cycleStart(turno) && turno > 1) c.grado = P.drift(c.grado);
    if (P.councilOpen(turno, 1)) consiglioDi(c, turno);

    // Con `BASE` il conto passa da spill: quel che un canale non può pagare lo
    // paga l'altro, quindi i totali che si confrontano qui sotto sono quelli
    // veri, non quelli nominali.
    const e = P.effect(pop, c.grado, BASE);
    const pk = P.perks(c.grado, turno);
    c.reclute += Math.max(-BASE.militare, e.militare);
    c.cavalieri += (turno >= CAV_DAL ? pk.cavaliere : 0);
    c.monete += pk.monete;
    c.perkMonete += pk.monete;
    c.risorse += Math.max(-BASE.produzione, e.produzione);
    return { e, pk };
}

function partite() {
    // Il profilo di Popolarità di un regno che gioca bene: parte nella trappola
    // del turno 1 (§8), ne esce in qualche turno, poi oscilla fra 3 e 4 e in
    // guerra ricade. È il caso realistico, non quello comodo.
    const POP = [1, 2, 2, 3, 3, 4, 4, 4, 3, 3,
                 4, 4, 5, 4, 3, 3, 4, 4, 4, 3,
                 4, 5, 5, 4, 4, 3, 2, 3, 4, 4,
                 4, 4, 5, 5, 4, 3, 3, 4, 4, 5,
                 5, 4, 4, 3, 3, 4, 5, 5, 4, 4];

    titolo('TRE CORONE, CINQUE CICLI, LA STESSA POPOLARITÀ');
    console.log('La Popolarità è identica per tutte e tre: cambia solo come la spendono.\n');

    const corone = [
        corona('Sempre coi signori', 'nobilta'),
        corona('Sempre col popolo', 'popolo'),
        corona('Alterna per ciclo', 'alterna'),
        corona('Nessun decreto', 'ferma')
    ];

    // Dettaglio del primo regno, turno per turno: serve a vedere il ritmo.
    const dett = corone[0];
    console.log('Dettaglio di «' + dett.nome + '», turno per turno:');
    console.log('  ' + pad('turno', 7) + pad('anno', 6) + pad('pop', 5) + pad('grado', 8) +
        pad('reclute', 9) + pad('cavall.', 9) + pad('risorse', 9) + 'Consiglio');

    const altri = corone.slice(1);
    for (let t = 1; t <= 50; t++) {
        const pop = POP[t - 1];
        const r = turnoDi(dett, t, pop);
        altri.forEach(c => turnoDi(c, t, pop));

        const ultimo = dett.log.length && dett.log[dett.log.length - 1].turno === t
            ? dett.log[dett.log.length - 1].decreti.map(id => P.decree(id).nome).join(' + ')
            : (P.councilOpen(t, 1) ? '(seduta aperta, nessun decreto)' : '');
        if (t <= 24 || P.councilOpen(t, 1)) {
            console.log('  ' + pad(t, 7) + pad(anno(t), 6) + pad(pop, 5) +
                pad(P.grade(dett.grado).label, 17) +
                pad(seg(r.e.militare), 9) + pad(r.pk.cavaliere && t >= CAV_DAL ? '+1' : '', 9) +
                pad(seg(r.e.produzione), 9) + ultimo);
        }
    }

    titolo('TOTALI DOPO 50 TURNI (5 cicli)');
    console.log('  ' + pad('strategia', 22) + lpad('reclute', 9) + lpad('cavalieri', 11) +
        lpad('risorse', 9) + lpad('monete spese', 14) + lpad('raccolti persi', 16));
    corone.forEach(c => {
        console.log('  ' + pad(c.nome, 22) + lpad(seg(c.reclute), 9) + lpad(c.cavalieri, 11) +
            lpad(seg(c.risorse), 9) + lpad(c.spesoMonete, 14) + lpad(c.raccoltoPerso, 16));
    });

    titolo('LETTURA');
    const n = corone[0], p = corone[1], f = corone[3];
    console.log('  Chi sta coi signori prende ' + (n.reclute + n.cavalieri) + ' uomini e ' +
        seg(n.risorse) + ' risorse.');
    console.log('  Chi sta col popolo prende ' + (p.reclute + p.cavalieri) + ' uomini e ' +
        seg(p.risorse) + ' risorse.');
    console.log('  Chi non decreta nulla resta a ' + (f.reclute + f.cavalieri) + ' uomini e ' +
        seg(f.risorse) + ' risorse — è il metro di oggi.');
    console.log('  I privilegi dei gradi estremi: ' + n.cavalieri + ' cavalieri ai signori, ' +
        p.perkMonete + ' monete al popolo.');

    titolo('LA TRAPPOLA DEL TURNO 1 (§8), col grado che si può avere al turno 1');
    console.log('  Al turno 1 si parte da Equilibrio e il Consiglio d\'apertura vale UN decreto.');
    [0, -1, -2, 1, 2].forEach(g => {
        const e = P.effect(1, g);
        console.log('  ' + pad(P.grade(g).label, 20) +
            'reclute ' + lpad(seg(e.militare), 3) + ' · risorse ' + lpad(seg(e.produzione), 3));
    });
}

if (ARG === 'tutto' || ARG === 'tabella') tabella();
if (ARG === 'tutto' || ARG === 'consiglio') consiglio();
if (ARG === 'tutto' || ARG === 'partite') partite();
console.log('');

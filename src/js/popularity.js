// ============================================================
// POPOLARITÀ (§8) — la formula, pura, e il suo rovescio: il PIANO.
//
// Due funzioni, e la seconda è il motivo per cui questo file esiste.
//   score(m)  → dai fattori misurati sulla mappa esce il livello 1-5.
//   plan(m,o) → la domanda opposta: "quanto mi costa il livello che voglio?"
//               Cioè quale tassazione e quanti soldati in Capitale bastano.
//
// Perché sta qui e non in app.js. La formula c'era, ma dentro `computePopularity`,
// che legge il DOM: un bot non poteva chiedere "quanto farei SE abbassassi le
// tasse?". Senza quella domanda l'IA restava inchiodata a Popolarità 1 — che
// toglie 2 reclute e 2 risorse a turno, cioè tutto il raccolto di un regno
// piccolo — senza sapere che le due leve per uscirne le aveva in mano.
// Stessa scelta già fatta per `RisikoBattle.winChance`: la formula vive in UN
// posto, la chiamano sia la UI sia l'IA, e non possono divergere.
//
// Niente DOM qui dentro: chi chiama misura e passa i numeri.
// ============================================================

(function (root) {
    'use strict';

    // §8: leggera → 5 punti di Popolarità ma 50 monete a città; dura → 1 e 150.
    const TAX_LEVELS = {
        leggera: { label: 'Leggera', score: 5, income: 50 },
        normale: { label: 'Normale', score: 3, income: 100 },
        dura:    { label: 'Dura',    score: 1, income: 150 }
    };
    const TAX_KEYS = ['leggera', 'normale', 'dura'];

    // Sanità e Felicità (§6.1) sono ora IN GIOCO: contano le migliorie civiche
    // costruite sulla Capitale (una per tipo di risorsa, max 5 per indice). Chi
    // misura (app.js popularityFactors) passa i due conteggi; se un chiamante li
    // omette valgono 0 — non c'è più una baseline neutra, il Benessere parte
    // basso e lo si alza costruendo. (WELFARE_PENDING resta esportato solo per
    // compatibilità: nessuna formula lo usa più.)
    const WELFARE_PENDING = 0;

    // La guardia cittadina ha due soli valori che contano: 5 soldati (=0) e 10
    // (=5, il massimo). Chi ne parcheggia 7 sta spendendo metà leva. Chi ne
    // parcheggia 12 ne butta 2.
    const GUARD_FREE = 5;     // soldati che non contano
    const GUARD_MAX = 5;      // punti massimi

    function clamp05(n) { return Math.max(0, Math.min(5, n)); }

    // Arrotondamento del regolamento (§8): per difetto, salvo parte decimale > 0,8.
    // 2,83 → 3 · 2,5 → 2 · 4,8 → 4. Diverso da Math.round.
    function roundRule(x) {
        const f = Math.floor(x);
        return (x - f > 0.8) ? f + 1 : f;
    }

    // Punti della guardia cittadina, e il suo inverso: quanti soldati servono in
    // Capitale per valerne N. Servono entrambi — uno per misurare, l'altro per
    // pianificare.
    function guardScore(soldiers) {
        return clamp05(Math.max(0, (soldiers || 0) - GUARD_FREE));
    }
    function soldiersForGuard(points) {
        return GUARD_FREE + Math.max(0, Math.min(GUARD_MAX, points || 0));
    }

    // Livello Difesa (§8): (P_conf + P_guardia)/2 + generale.
    // P_conf = 5 − province nemiche al confine della Capitale, TERRE DI NESSUNO
    // COMPRESE (regola dell'utente): sono presidiate e razziano.
    function defence(m) {
        const pConf = clamp05(5 - (m.enemyBorders || 0));
        const pGuardia = guardScore(m.soldiers);
        return {
            pConf, pGuardia,
            valore: clamp05(roundRule((pConf + pGuardia) / 2) + (m.hasGeneral ? 1 : 0))
        };
    }

    // Livello Benessere (§8): (Risorse + Cibo + Sanità + Felicità)/4.
    // `varieta` = tipi distinti di risorsa COLLEGATI; `foodProv` = province di
    // Grano/Bestiame collegate. Si contano le province, non la raccolta.
    function welfare(m) {
        const varieta = clamp05(m.varieta || 0);
        const cibo = clamp05(m.foodProv || 0);
        const sanita = clamp05((m.sanita === undefined) ? WELFARE_PENDING : m.sanita);
        const felicita = clamp05((m.felicita === undefined) ? WELFARE_PENDING : m.felicita);
        return {
            varieta, cibo, sanita, felicita,
            valore: clamp05(roundRule((varieta + cibo + sanita + felicita) / 4))
        };
    }

    function taxScore(tax) {
        return (TAX_LEVELS[tax] || TAX_LEVELS.normale).score;
    }

    // GRAZIA DELL'INSEDIAMENTO (§8, regola dell'utente). Nei primi decenni il
    // popolo di un regno giovane è indulgente: un bonus alla Popolarità che scala e
    // sparisce. Serve perché, tolta la baseline neutra del Benessere (§6.1), un
    // regno appena nato — nessuna strada, nessuna miglioria civica — precipiterebbe
    // a Popolarità 1 (−2 reclute, −2 risorse: raccolto zero) prima ancora di avere
    // i mezzi per rimediare. La grazia gli dà i decenni per costruirseli, poi
    // svanisce e il regno regge sulle proprie gambe. Vale per tutti — umano e IA.
    // Ancorata all'ETÀ DEL REGNO, non a quella del mondo (regola dell'utente): un
    // regno che nasce a partita in corso — l'Orda mongola del turno 25, i
    // Selgiuchidi, il Portogallo (js/events.js) — è giovane quanto lo era un regno
    // d'inizio partita al turno 1, e senza strade né migliorie precipiterebbe subito
    // a Popolarità 1. `nato` è il turno di fondazione (1 per chi c'è dall'inizio),
    // quindi per loro la grazia è la stessa, solo spostata avanti nel calendario.
    const GRACE_START = 2;   // punti di Popolarità nei primissimi turni di vita
    const GRACE_EVERY = 3;   // ogni quanti turni cala di 1
    const GRACE_LAST = 5;    // ultimo turno di vita con grazia: dal 6º in poi è zero (regola dell'utente)
    // Andamento: turni di vita 1-3: +2 · 4-5: +1 · 6+: 0. Il tetto GRACE_LAST tronca
    // la coda che la sola scala darebbe (6º turno), così la grazia dura al MASSIMO
    // per i primi cinque decenni del regno.
    function graceBonus(turn, nato) {
        if (turn === undefined || turn === null) return 0;
        const t = Math.max(1, Math.floor(turn));
        const n = Math.max(1, Math.floor(nato || 1));
        const eta = t - n + 1;                 // 1 = il turno in cui il regno nasce
        if (eta < 1 || eta > GRACE_LAST) return 0;
        return Math.max(0, GRACE_START - Math.floor((eta - 1) / GRACE_EVERY));
    }

    // La formula del §8 per intero. `m` sono i fattori misurati:
    //   { enemyBorders, soldiers, hasGeneral, varieta, foodProv, sanita, felicita,
    //     tax, turn, nato }
    // Il totale è clampato 1–5: il livello 0 non esiste nella tabella effetti.
    // `turn` (col turno di fondazione `nato`) porta la grazia dell'insediamento:
    // chi non lo passa non la riceve.
    function score(m) {
        const meas = m || {};
        const dif = defence(meas);
        const ben = welfare(meas);
        const tax = TAX_LEVELS[meas.tax] ? meas.tax : 'normale';
        const tassa = taxScore(tax);
        const grazia = graceBonus(meas.turn, meas.nato);
        const base = roundRule((dif.valore + ben.valore + tassa) / 3);
        const totale = Math.max(1, clamp05(base + grazia));
        return {
            totale,
            sicurezza: dif.valore,
            benessere: ben.valore,
            tassa,
            grazia,
            detail: {
                enemyBorders: meas.enemyBorders || 0,
                pConf: dif.pConf,
                soldiers: meas.soldiers || 0,
                pGuardia: dif.pGuardia,
                hasGeneral: !!meas.hasGeneral,
                tax,
                varieta: ben.varieta,
                cibo: ben.cibo,
                foodProv: meas.foodProv || 0,
                sanita: ben.sanita,
                felicita: ben.felicita,
                grazia
            }
        };
    }

    // ============================================================
    // IL PIANO — "che livello posso permettermi, e a che prezzo?"
    // ============================================================

    // Le due leve costano monete, ma in valute diverse: un soldato in più nella
    // guardia si compra col prezzo di un mercenario, un gradino di tassa in meno
    // si paga ogni turno su ogni città. Portarle allo stesso metro è l'unico modo
    // per sceglierle davvero, invece di alternarle a naso.
    const SOLDIER_COIN = 100;    // quanto costa un soldato in più (§6, mercenario)

    // Costo di una combinazione, rispetto a quel che si ha già: i soldati già in
    // Capitale sono spesi e non si contano, quelli da portarci sì.
    function comboCost(m, tax, soldiers, cities) {
        const nuovi = Math.max(0, soldiers - (m.soldiers || 0));
        const perso = (TAX_LEVELS.dura.income - TAX_LEVELS[tax].income) * Math.max(1, cities || 1);
        return nuovi * SOLDIER_COIN + perso;
    }

    // Il piano vero e proprio. `opts`:
    //   target      livello desiderato (default 3: è quello che azzera i malus)
    //   maxSoldiers quanti soldati può davvero avere la Capitale (tetto pedine,
    //               truppe disponibili). Default: quanto serve per la guardia piena.
    //   cities      quante città pagano le tasse (per pesare il gradino di tassa)
    //   tax         livelli ammessi, se si vuole vincolarne qualcuno
    // Ritorna la combinazione più economica che raggiunge `target`; se `target`
    // è fuori portata, la più economica fra quelle che arrivano al massimo
    // possibile — un piano irraggiungibile non è un piano, meglio il migliore vero.
    function plan(m, opts) {
        const o = opts || {};
        const meas = m || {};
        const target = Math.max(1, Math.min(5, o.target || 3));
        const cities = Math.max(1, o.cities || 1);
        const livelli = (o.tax && o.tax.length) ? o.tax : TAX_KEYS;
        // Quanti soldati vale la pena provare. Il tetto è la guardia piena: oltre
        // quella il conto non si muove più (GUARD_MAX punti e basta), e un piano
        // che chiedesse 30 uomini in Capitale terrebbe fermo mezzo esercito per
        // niente. Il fondo è ZERO e non "quanti ce ne sono adesso": la domanda è
        // *quanti ne servono*, e se ne bastano meno di quelli presenti la
        // differenza è un'armata libera di muoversi. I soldati già in Capitale
        // sono spesi (`comboCost` non li riconta), quindi tenerne di più non
        // costa nulla sulla carta — per questo a parità di prezzo si preferisce
        // il numero PIÙ BASSO.
        const pieno = soldiersForGuard(GUARD_MAX);
        const maxS = Math.min(pieno, (o.maxSoldiers === undefined)
            ? pieno
            : Math.max(0, o.maxSoldiers));
        const candidati = [];
        for (let s = 0; s <= maxS; s++) candidati.push(s);
        if (!candidati.length) candidati.push(0);

        // Due modi di scegliere, e la differenza conta.
        //  `best` — il target è raggiungibile: si prende la combinazione più
        //     ECONOMICA che ci arriva. Nessun motivo di pagare di più per un
        //     livello che si ha già.
        //  `top`  — il target è fuori portata (turno 1: la Capitale è circondata
        //     da neutrali, Sicurezza 0, e nessuna leva da sola basta): allora si
        //     compra quel che AVVICINA di più, non quel che costa meno. Le due
        //     leve sono complementari — tassa leggera da sola dà 2, guardia piena
        //     da sola dà 2, insieme più il primo campo di grano danno 3 — e una
        //     regola al risparmio le scarterebbe entrambe per sempre, restando
        //     nel pozzo. Per questo l'ordine è: livello, poi POTENZIALE (il
        //     totale non arrotondato, che vede i progressi dentro il gradino),
        //     e solo a parità il costo.
        let best = null;
        let top = null;
        livelli.forEach(tax => {
            candidati.forEach(s => {
                const ipotesi = Object.assign({}, meas, { tax, soldiers: s });
                const p = score(ipotesi);
                const costo = comboCost(meas, tax, s, cities);
                const voce = {
                    tax, soldiers: s, pop: p.totale, costo,
                    potenziale: potential(ipotesi), dettaglio: p
                };
                if (!top || voce.pop > top.pop ||
                    (voce.pop === top.pop && voce.potenziale > top.potenziale) ||
                    (voce.pop === top.pop && voce.potenziale === top.potenziale && costo < top.costo)) top = voce;
                if (p.totale >= target && (!best || costo < best.costo ||
                    (costo === best.costo && voce.soldiers < best.soldiers))) best = voce;
            });
        });

        const scelto = best || top;
        return {
            tax: scelto.tax,
            soldiers: scelto.soldiers,
            pop: scelto.pop,
            costo: scelto.costo,
            target,
            raggiunto: !!best,
            massimo: top ? top.pop : scelto.pop,
            // Quanti soldati mancano in Capitale per il piano: è il numero che
            // schieramento e spostamento di fine turno devono inseguire.
            manca: Math.max(0, scelto.soldiers - (meas.soldiers || 0))
        };
    }

    // Il totale SENZA arrotondamenti: non è il livello (quello lo dà `score`), è
    // la stessa quantità prima che i tre `roundRule` la squadrino. Serve solo a
    // ORDINARE: fra due conquiste che oggi non cambiano il livello, questa dice
    // quale delle due avvicina il gradino. Col livello secco si otterrebbe zero
    // per entrambe e l'IA sceglierebbe a caso.
    function potential(m) {
        const meas = m || {};
        const pConf = clamp05(5 - (meas.enemyBorders || 0));
        const pGuardia = guardScore(meas.soldiers);
        const dif = clamp05((pConf + pGuardia) / 2 + (meas.hasGeneral ? 1 : 0));
        const sanita = clamp05((meas.sanita === undefined) ? WELFARE_PENDING : meas.sanita);
        const felicita = clamp05((meas.felicita === undefined) ? WELFARE_PENDING : meas.felicita);
        const ben = clamp05((clamp05(meas.varieta || 0) + clamp05(meas.foodProv || 0) +
            sanita + felicita) / 4);
        return (dif + ben + taxScore(meas.tax)) / 3;
    }

    // Quanto salirebbe la Popolarità cambiando UN fattore: serve a dare un prezzo
    // a una conquista (una provincia nemica in meno al confine della Capitale) o
    // a una strada (un tipo di risorsa, una provincia di cibo in più).
    // In continuo (vedi `potential`); `levelGainIf` dà invece il salto di livello
    // vero, che spesso è ZERO — ed è un'informazione anche quella: con 7 nemiche
    // al confine della Capitale le prime due conquiste non valgono niente.
    function gainIf(m, delta) {
        return potential(Object.assign({}, m, delta)) - potential(m);
    }
    function levelGainIf(m, delta) {
        return score(Object.assign({}, m, delta)).totale - score(m).totale;
    }

    const api = {
        TAX_LEVELS, TAX_KEYS, WELFARE_PENDING, GUARD_FREE, GUARD_MAX, SOLDIER_COIN,
        GRACE_START, GRACE_EVERY, GRACE_LAST, graceBonus,
        roundRule, clamp05, guardScore, soldiersForGuard, taxScore,
        defence, welfare, score, potential, plan, gainIf, levelGainIf
    };

    root.Popularity = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);

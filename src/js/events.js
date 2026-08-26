// ============================================================
// EVENTI STORICI — il calendario datato della partita (PURO).
// Crociate, invasioni mongole, Guerra dei Cent'Anni, Peste: fatti che scattano a
// un TURNO preciso (il calendario è compresso, un turno = un decennio) e che
// possono durare per una finestra di turni. È il gemello di js/religions.js
// (SCHISMS): qui stanno le DATE, la narrazione e i PIANIFICATORI puri; l'unico
// posto che MUTA lo stato resta game-actions.js (applyEvents/tickEvents).
//
// FORMA DI UN DESCRITTORE
//   { id:      'mongoli',            // chiave stabile (guardia anti-doppio-scatto)
//     turn:    11,                   // decennio in cui SCATTA (onStart)
//     fino:    20,                   // ultimo decennio ATTIVO (onRound); null = one-shot
//     tipo:    'mongoli',            // tipo pergamena (Risiko.showFoundation)
//     titolo, testo, nota,           // la cronaca srotolata al giocatore
//     dato:    { … },                // config statica dell'evento (province, forze…)
//     onStart(ctx) { … },            // una volta, quando scatta
//     onRound(ctx) { … },            // a ogni giro finché è attivo (dal decennio dopo)
//     onEnd(ctx)   { … } }           // una volta, quando la finestra si chiude
//
// IL CICLO DI VITA vive nel descrittore: onStart/onRound/onEnd chiamano i
// mutatori di `ctx` (ctx.spawnKingdom, ctx.notify, ctx.decimate…), che sono
// funzioni di game-actions. Così ogni set-piece si legge tutto in un posto solo,
// ma le scritture restano concentrate in game-actions. I PIANIFICATORI qui sotto
// (marcia dell'orda, propagazione del contagio) sono invece PURI: l'evento li
// chiama direttamente — stesso modulo — e passa il risultato a `ctx` da applicare
// (come SeaRoutes.sail calcola e game-actions applica).
//
// Il calendario è VUOTO: è l'impianto. Gli eventi si aggiungono uno per uno.
// ============================================================
(function (root) {
    'use strict';

    // PRIMA CROCIATA (ciclo 2). Le mete sono SCAMBIATE rispetto alla marcia
    // storica per volere dell'utente: Bisanzio, da Costantinopoli (Eastern_Thrace),
    // punta a Gerusalemme (Palestine); la Francia ad Aleppo. `forza` è la taglia di
    // ciascuna oste, radunata drenando le VERE truppe del regno (§5): non è evocata.
    const PRIMA_CROCIATA = {
        forza: 10,
        spedizioni: [
            { regno: 'Impero Bizantino', da: 'Eastern_Thrace', meta: 'Palestine' }, // → Gerusalemme
            { regno: 'Regno di Francia', da: null, meta: 'Aleppo' }
        ],
        alleati: ['Regno di Francia', 'Impero Bizantino'],
        patto: 'vista'   // solo vista condivisa: si vedono in Terra Santa, ma possono farsi guerra
    };

    // INVASIONE MONGOLA (ciclo 3). L'Orda sorge nella Mongolia storica — Urga
    // (Ulaanbaatar), Uliastai, Buryatia — tutte neutrali e lontanissime a est: la
    // nebbia le tiene nascoste ai regni europei finché non si avvicina. Nasce come
    // regno vero (colore, ordine dei turni) ma `bot:null`: **lo gioca l'admin**,
    // che da lì si conquista steppe, Russia ed Europa. 15 armate per stato (45 in
    // tutto): abbastanza da attraversare il corridoio di neutrali senza sciogliersi.
    const INVASIONE_MONGOLA = {
        name: 'Mongoli',
        color: '#6b2b2b',   // rosso-bruno di steppa, distinto dai 10 regni
        province: [
            { id: 'Urga', soldati: 15 },       // il cuore dell'Orda
            { id: 'Uliastai', soldati: 15 },
            { id: 'Buryatia', soldati: 15 }
        ]
    };

    // Il calendario. Ogni voce è un descrittore come sopra.
    const EVENTS = [
        {
            id: 'invasione-mongola', turn: 25, fino: null, tipo: 'mongoli',
            titolo: 'L\'Orda Mongola',
            testo: 'Dalle steppe d\'Oriente si leva l\'Orda: i popoli del feltro sono uniti, e i loro cavalli guardano a Occidente.',
            nota: '',
            onStart(ctx) {
                // Nasce il regno mongolo in Mongolia. Nessuna pergamena globale: la
                // nebbia deve tenerlo segreto finché non arriva ai confini di qualcuno.
                ctx.spawnKingdom(INVASIONE_MONGOLA);
            }
        },
        {
            id: 'prima-crociata', turn: 11, fino: null, tipo: 'crociata',
            titolo: 'La Prima Crociata',
            testo: 'Da Chiaravalle il Papa bandisce la crociata: Franchi e Bizantini marciano sulla Terra Santa.',
            nota: '',
            // Orchestrazione (regola dell'utente: nel descrittore, con ctx). Raduna
            // le due osti, le sbarca all'assalto, lega i due regni, avvisa entrambi.
            onStart(ctx) {
                const d = PRIMA_CROCIATA;
                const esiti = [];
                d.spedizioni.forEach(sp => {
                    const host = ctx.muster(sp.regno, { da: sp.da, forza: d.forza });
                    if (!host) return;                  // regno morto o senza uomini: la gamba salta
                    const esito = ctx.assault(sp.regno, sp.meta, host);
                    if (esito) esiti.push(esito);
                });
                // Solo vista condivisa fra i due: condividono la visuale in Terra Santa.
                ctx.pact(d.alleati[0], d.alleati[1], d.patto);
                // Pergamena a ciascun protagonista, dal suo punto di vista.
                esiti.forEach(e => {
                    const testo = e.rinforzo
                        ? 'La nostra oste rinforza ' + e.metaLabel + ' in Terra Santa.'
                        : (e.vinta
                            ? 'La nostra oste espugna ' + e.metaLabel + ': ' + e.superstiti +
                              (e.superstiti === 1 ? ' superstite tiene la città' : ' superstiti tengono la città') +
                              (e.conversione ? ', convertita alla nostra fede' : '') + '.'
                            : 'La nostra oste s\'infrange sotto le mura di ' + e.metaLabel +
                              ': la spedizione è perduta.');
                    ctx.notify(e.regno, {
                        tipo: 'crociata',
                        titolo: 'La Prima Crociata',
                        testo,
                        nota: 'Franchi e Bizantini si legano: condividono la visuale in Terra Santa.'
                    });
                });
            }
        }
    ];

    // Gli eventi che SCATTANO a questo turno (onStart). Come Religions.schismsAt.
    function startingAt(turn) {
        const t = Math.floor(turn || 0);
        return EVENTS.filter(e => e.turn === t);
    }

    // Gli eventi ATTIVI a questo turno: già scattati e con la finestra ancora
    // aperta (fino null = one-shot, attivo solo nel turno di scatto).
    function activeAt(turn) {
        const t = Math.floor(turn || 0);
        return EVENTS.filter(e => e.turn <= t && (e.fino == null ? e.turn === t : t <= e.fino));
    }

    function byId(id) { return EVENTS.find(e => e.id === id) || null; }

    // ---------- PIANIFICATORI PURI (crescono con gli eventi) ----------
    // Qui andranno hordeAdvance(stato, mappa) → bersagli, plagueSpread(stato) →
    // nuovi focolai, warLockBetween(a, b, eventi) → bool. Restano funzioni pure:
    // ricevono lo stato, restituiscono un piano, non toccano niente.

    root.Events = {
        EVENTS,
        startingAt, activeAt, byId
    };

})(typeof window !== 'undefined' ? window : globalThis);

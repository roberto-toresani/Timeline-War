// POLITICA DEL REGNO (§8-bis): chi sostiene la corona, la nobiltà o il popolo.
//
// La Popolarità (js/popularity.js, §8) NON cambia e resta il motore: tasse,
// Benessere e Sicurezza decidono QUANTO il regno guadagna o perde ogni turno.
// Questo modulo decide IN CHE FORMA quel ± arriva — reclute e cavalieri se la
// corona sta coi nobili, risorse raccolte se sta coi contadini. La Popolarità in
// quinti è lo specchio delle politiche verso i due ceti (regola dell'utente).
//
// Il grado NON si sceglie con un cursore: si sposta con i DECRETI del Consiglio
// della Corona, che siede nei primi 3 turni di ogni ciclo. Ogni decreto costa
// qualcosa di concreto e sposta il grado di un passo. E a ogni Consiglio il grado
// torna di un passo verso l'Equilibrio (regola dell'utente: i favori si
// dimenticano, quindi i decreti servono anche solo a MANTENERE la politica che
// si ha — non si conquista una posizione una volta per sempre).
//
// Modulo PURO, come popularity.js e objectives.js: niente DOM, niente mappa.
// Chi misura (app.js) passa i numeri, chi muta (game-actions.js) applica. Gira
// anche in Node per le simulazioni: vedi scripts/politics-sim.js.

(function (root) {
    'use strict';

    // ---------- I 5 GRADI ----------
    // Il valore numerico è la SCALA, e il segno dice il verso: negativo verso la
    // nobiltà (appoggio militare), positivo verso il popolo (appoggio alla
    // produzione). Tenere il segno dentro il numero fa sì che un decreto sia
    // sempre un `grado + verso` con un limite, senza una tabella di transizioni.
    const MIN = -2;
    const MAX = 2;

    // `glifo` dice QUALE sagoma disegnare (la spada dei signori, la bilancia,
    // il martello dei lavoratori) e `doppio` se va disegnata due volte: il disegno
    // vero vive nella UI, come per le pedine, perché qui dentro non entra SVG.
    // Nei testi (registro, messaggi) si usa `label`, mai un'icona.
    const GRADES = [
        { v: -2, id: 'nobiltaForte', glifo: 'spada', doppio: true, label: 'Nobiltà forte',
          nota: 'La corona è dei signori: cavalieri e reclute, ma i campi soffrono.' },
        { v: -1, id: 'nobilta', glifo: 'spada', doppio: false, label: 'Pro-nobiltà',
          nota: 'La corona guarda ai signori: il favore arriva in uomini.' },
        { v: 0, id: 'equilibrio', glifo: 'bilancia', doppio: false, label: 'Equilibrio',
          nota: 'Nessun ceto favorito: il favore e il malcontento si dividono.' },
        { v: 1, id: 'popolo', glifo: 'martello', doppio: false, label: 'Pro-popolo',
          nota: 'La corona guarda ai contadini: il favore arriva in raccolto.' },
        { v: 2, id: 'popoloForte', glifo: 'martello', doppio: true, label: 'Popolo forte',
          nota: 'La corona è dei contadini: raccolti pieni, ma i signori disertano.' }
    ];

    function grade(v) {
        const n = clamp(Math.round(v || 0));
        return GRADES.find(g => g.v === n) || GRADES[2];
    }
    function clamp(v) { return Math.max(MIN, Math.min(MAX, v || 0)); }

    // ---------- L'EFFETTO: dove va il ± della Popolarità ----------
    // Il NETTO è sempre quello di sempre (popEffectOf: 1 → −2/−2 … 5 → +2/+2):
    // la politica SPOSTA il budget fra i due canali, non lo crea. Se no la
    // politica sarebbe un bonus gratuito e il §8 andrebbe ritarato da capo.
    //
    //   v = Popolarità − 3   (quindi −2..+2, lo stesso ± di oggi)
    //
    // LA POPOLARITÀ DECIDE *QUANTO*, LA POLITICA *COME SI DIVIDE* — e le due
    // cose sono indipendenti (regola dell'utente, nata da un pasticcio mio).
    // Nella prima versione la politica era una FETTA del bonus di Popolarità:
    // più alto il bonus, più grande lo spostamento. Conseguenza: a Popolarità 3
    // il bonus è zero, non c'era niente da affettare e tutti e cinque i gradi
    // davano lo stesso risultato — la leva si spegneva da sola proprio al
    // livello più comune della partita. E faceva confondere due cose diverse:
    // "Popolarità 3" (il regno è tiepido) ed "Equilibrio" (la corona non
    // favorisce nessuno).
    //
    // Ora lo spostamento è SEMPRE DI UNO, qualunque sia la Popolarità e
    // qualunque sia l'intensità:
    //   Equilibrio  → niente, il regno di oggi tale e quale
    //   moderato    → 1 unità passa da un canale all'altro
    //   estremo     → la stessa unità, PIÙ un privilegio di natura diversa
    //                 (vedi `perks`): non "uguale ma di più", un'altra cosa.
    // Così fra un estremo e l'altro ci sono sempre 2 unità di scarto, che
    // pesano poco quando il regno è ricco e molto quando è povero — ed è giusto
    // che sia così.
    //
    // `base` (facoltativo) è quel che il regno raccoglie SENZA la politica —
    // { militare: reclute di base, produzione: risorse raccolte }: con esso il
    // conto passa da `spill` e il netto si mantiene davvero. Chi vuole la
    // tabella astratta (la legenda del pannello) lo omette.
    const SHIFT = 1;

    function effect(level, grado, base) {
        const v = (Math.max(1, Math.min(5, level || 3))) - 3;
        const g = clamp(grado);
        const s = g ? SHIFT : 0;

        // Si parte da quel che la Popolarità dà a tutti e due i canali (il
        // gioco di oggi), poi la politica sposta `s` dall'uno all'altro.
        let e;
        if (g < 0) e = { militare: v + s, produzione: v - s, favorito: 'militare', grado: g, netto: v * 2 };
        else if (g > 0) e = { militare: v - s, produzione: v + s, favorito: 'produzione', grado: g, netto: v * 2 };
        else e = { militare: v, produzione: v, favorito: null, grado: 0, netto: v * 2 };

        return base ? spill(e, base) : e;
    }

    // ---------- IL PRIVILEGIO DEI GRADI ESTREMI ----------
    // Quel che distingue l'estremo dal moderato NON è un numero più grande ma
    // una cosa di natura diversa (regola dell'utente): dai signori gli uomini
    // vengono a cavallo, dal popolo arrivano monete perché i mercati fioriscono.
    // Senza questo l'estremo sarebbe "il moderato ma di più" e la terra di un
    // regno amatissimo finirebbe per rendere il doppio di sé stessa.
    //
    // Pesano uguale, a occhio: su un ciclo intero fanno 5 cavalieri contro 1000
    // monete, che è il prezzo di una Città. Da ritarare col simulatore.
    const PERK_CAVALIERE_OGNI = 2;     // turni fra un cavaliere e l'altro
    const PERK_MONETE = 100;           // monete per turno

    // Il privilegio si PERDE a ogni inizio ciclo, perché il ritorno
    // all'Equilibrio fa scendere l'estremo a moderato: chi tiene una posizione
    // radicale paga ogni ciclo il buco fra l'inizio e il decreto che ce lo
    // rimette. Non è una regola in più, è una conseguenza del ritorno.
    function perks(grado, turno) {
        const g = clamp(grado);
        if (g === -2) {
            return {
                cavaliere: ((turno || 1) % PERK_CAVALIERE_OGNI === 0) ? 1 : 0,
                monete: 0,
                testo: '1 cavaliere ogni ' + PERK_CAVALIERE_OGNI + ' turni'
            };
        }
        if (g === 2) {
            return { cavaliere: 0, monete: PERK_MONETE, testo: '+' + PERK_MONETE + ' monete a turno' };
        }
        return { cavaliere: 0, monete: 0, testo: '' };
    }

    // IL MALUS CHE UN CANALE NON PUÒ PAGARE TRABOCCA SULL'ALTRO (regola
    // dell'utente). Né le reclute né il raccolto scendono sotto zero: un regno
    // da sei province ha 2 reclute, quindi "−5 reclute" e "−2 reclute" gli
    // costano esattamente lo stesso, cioè tutto quel che ha. Senza questo, la
    // politica estrema era GRATIS proprio a Popolarità 1-2 — concentrare il
    // malus su un canale vuoto non toglie niente a nessuno.
    //
    // Ora quel che non si riesce a togliere da un canale si toglie dall'altro,
    // e il netto torna a essere quello dell'Equilibrio: un regno in crisi perde
    // lo stesso, qualunque politica abbia. Se anche l'altro canale è a secco il
    // conto finisce lì — a un regno che non ha più niente non si può togliere
    // altro, e non è un'eccezione da correggere.
    function spill(e, base) {
        const bm = Math.max(0, Math.round(base.militare || 0));
        const bp = Math.max(0, Math.round(base.produzione || 0));
        let mil = e.militare, prod = e.produzione;

        const nonPagatoMil = mil < 0 ? Math.max(0, -(bm + mil)) : 0;
        if (nonPagatoMil) { mil += nonPagatoMil; prod -= nonPagatoMil; }

        const nonPagatoProd = prod < 0 ? Math.max(0, -(bp + prod)) : 0;
        if (nonPagatoProd) { prod += nonPagatoProd; mil -= nonPagatoProd; }

        return Object.assign({}, e, {
            militare: mil, produzione: prod,
            travasato: nonPagatoMil + nonPagatoProd
        });
    }

    // ---------- IL CONSIGLIO DELLA CORONA ----------
    // Siede DUE volte per ciclo (regola dell'utente), e ogni seduta vale UN
    // decreto solo:
    //   - l'APERTURA, turni 1-3: si stabilisce l'orientamento del ciclo;
    //   - la STRAORDINARIA, turno 7: si convoca in caso eccezionale per
    //     correggere la rotta, verso l'equilibrio o verso l'estremo.
    // Con un decreto per seduta, tenere una posizione estrema consuma
    // l'apertura (il ritorno l'ha appena fatta scendere) e lascia la
    // straordinaria senza nulla da fare: il prezzo della posizione radicale non
    // è in monete, è la libertà di reagire a metà ciclo. Chi sta al moderato,
    // invece, al turno 7 ha ancora una mossa.
    const CYCLE = 10;             // un ciclo = 10 turni (§10, come gli obiettivi)
    const COUNCIL_TURNS = 3;      // quanto dura la seduta d'apertura
    const COUNCIL_EXTRA = 7;      // il turno del ciclo in cui si convoca la straordinaria
    const MAX_DECREES = 1;        // quanti decreti vale UNA seduta

    function cycleOf(turno) { return Math.floor(((turno || 1) - 1) / CYCLE) + 1; }

    // Il primo turno di un ciclo: è lì che scatta il ritorno all'Equilibrio.
    function cycleStart(turno) { return ((turno || 1) - 1) % CYCLE === 0; }

    // QUALE seduta è aperta adesso: 'apertura' | 'straordinaria' | null. È
    // anche la chiave con cui si ricorda se è già stata spesa, quindi le due
    // sedute dello stesso ciclo non si rubano il decreto a vicenda.
    // L'apertura vale anche nei primi 3 turni di VITA di un regno nato per
    // evento (§Eventi): l'Orda che nasce al turno 25 non deve aspettare il 31
    // per avere una politica, come non aspetta la grazia dell'insediamento.
    function councilSlot(turno, nato) {
        const t = turno || 1;
        const nelCiclo = (t - 1) % CYCLE;
        if (nelCiclo < COUNCIL_TURNS) return 'apertura';
        if (nelCiclo === COUNCIL_EXTRA - 1) return 'straordinaria';
        const n = nato || 1;
        if ((t - n) >= 0 && (t - n) < COUNCIL_TURNS) return 'apertura';
        return null;
    }

    function councilOpen(turno, nato) { return !!councilSlot(turno, nato); }

    const SLOT_LABEL = {
        apertura: 'Consiglio d\'apertura',
        straordinaria: 'Consiglio straordinario'
    };

    // Quanti turni resta aperta la seduta in corso, contando quello attuale
    // (0 = chiusa). La straordinaria dura un turno solo.
    function councilTurnsLeft(turno, nato) {
        const slot = councilSlot(turno, nato);
        if (!slot) return 0;
        if (slot === 'straordinaria') return 1;
        const t = turno || 1;
        const perCiclo = COUNCIL_TURNS - ((t - 1) % CYCLE);
        const perNascita = COUNCIL_TURNS - (t - (nato || 1));
        return Math.max(perCiclo > 0 ? perCiclo : 0, perNascita > 0 ? perNascita : 0);
    }

    // Il turno della prossima seduta (per dire "si riunisce nel 1060").
    function nextCouncilTurn(turno) {
        const t = turno || 1;
        const nelCiclo = (t - 1) % CYCLE;
        const inizio = t - nelCiclo;
        if (nelCiclo < COUNCIL_EXTRA - 1) return inizio + COUNCIL_EXTRA - 1;
        return inizio + CYCLE;
    }

    // Il ritorno all'Equilibrio: un passo verso lo zero. Non è un azzeramento —
    // chi ha conquistato il grado forte scende a moderato e con UN decreto ci
    // risale, chi era a moderato torna neutro.
    function drift(grado) {
        const g = clamp(grado);
        if (g > 0) return g - 1;
        if (g < 0) return g + 1;
        return 0;
    }

    // ---------- I DECRETI ----------
    // Ogni decreto ha un COSTO concreto e sposta il grado di un passo nel suo
    // `verso`. Tre tipi per ceto, apposta: uno si paga in monete, uno in risorse,
    // uno in un prezzo STRUTTURALE che si vede sulla mappa per tutto il ciclo —
    // così mantenere una politica ha sempre almeno una strada aperta, qualunque
    // cosa manchi al regno.
    //
    //   verso:  −1 verso la nobiltà, +1 verso il popolo
    //   costo:  { monete, scorte: {tipo: n} }  (quel che si paga una volta)
    //   prov:   null, oppure cosa deve essere la provincia scelta:
    //             tipo 'risorsa' | 'citta' | 'qualunque'
    //             noCapitale   — la Capitale non si può usare
    //             noCitta      — la provincia non deve avere una Città
    //             soldati      — quanti uomini se ne vanno (oltre al presidio §5)
    //   durata: null (effetto immediato) | 'ciclo' | un numero di turni
    const DECREES = [
        // ---- verso la NOBILTÀ ----
        {
            id: 'torneo', verso: -1, ico: '🏆', nome: 'Bandisci un torneo',
            testo: 'Giostre e banchetti per i signori del regno. Chi vince resta a corte.',
            costo: { monete: 200, scorte: { bestiame: 2 } },
            dono: { cavaliere: 1 },
            effetto: 'Dal ciclo II: 1 cavaliere si unisce alla guardia della Capitale.',
            durata: null
        },
        {
            id: 'corvee', verso: -1, ico: '⛏', nome: 'Corvée per i signori',
            testo: 'I contadini lavorano gratis ai castelli dei baroni: la pietra arriva, i campi restano fermi.',
            costo: {},
            dono: { scorte: { pietra: 2 } },
            // Il prezzo NON è in magazzino, è sulla mappa: quella provincia non
            // raccoglie per tutto il ciclo. Senza, era l'unico decreto gratis
            // che per giunta rendeva, e la simulazione lo mostrava: la corona
            // pro-nobiltà spendeva 200 monete in 50 turni contro le 900 di
            // quella pro-popolo. Una politica deve costare da tutti e due i lati.
            prov: { tipo: 'risorsa', noCapitale: true },
            effetto: '+2 Pietra subito, ma per tutto il ciclo quella provincia non raccoglie.',
            durata: 'ciclo'
        },
        {
            id: 'feudo', verso: -1, ico: '🏰', nome: 'Concedi un feudo',
            testo: 'Una provincia passa sotto un barone: la sua rendita è sua, non tua.',
            costo: {},
            prov: { tipo: 'risorsa', noCapitale: true, noCitta: true },
            effetto: 'Per tutto il ciclo quella provincia non consegna la sua risorsa.',
            durata: 'ciclo'
        },

        // ---- verso il POPOLO ----
        {
            id: 'decime', verso: 1, ico: '💰', nome: 'Esenta dalle decime',
            testo: 'La corona rinuncia alla sua parte del raccolto per un anno.',
            costo: { monete: 300 },
            effetto: 'Nessun altro effetto: è la strada pulita, e cara.',
            durata: null
        },
        {
            id: 'granai', verso: 1, ico: '🌾', nome: 'Apri i granai',
            testo: 'Il grano della corona si distribuisce nelle piazze.',
            costo: { scorte: { grano: 3 } },
            effetto: 'Nessun altro effetto: il popolo mangia, il magazzino cala.',
            durata: null
        },
        {
            id: 'affranca', verso: 1, ico: '🔓', nome: 'Affranca i servi',
            testo: 'Due uomini d\'arme tornano ai campi come uomini liberi.',
            costo: {},
            prov: { tipo: 'risorsa', soldati: 2 },
            effetto: 'Per tutto il ciclo quella provincia rende +1 della sua risorsa.',
            durata: 'ciclo'
        },
        {
            id: 'franchigia', verso: 1, ico: '📜', nome: 'Carta di franchigia',
            testo: 'Una città si governa da sé, e per un po\' non versa nulla.',
            costo: {},
            prov: { tipo: 'citta', noCapitale: true },
            effetto: 'Quella Città non paga tasse per 3 turni.',
            durata: 3
        }
    ];

    function decree(id) { return DECREES.find(d => d.id === id) || null; }
    function decreesFor(verso) { return DECREES.filter(d => d.verso === verso); }

    // Si può emanare? I controlli PURI, quelli che non guardano la mappa:
    // la finestra, il tetto per Consiglio, il doppione, il limite del grado.
    // I controlli di mappa (provincia propria, soldati, Città) li fa chi muta —
    // è lui l'unico che può guardarla.
    //
    //   ctx: { turno, nato, grado, emanati: [id…], haCapitale }
    function canIssue(id, ctx) {
        const d = decree(id);
        if (!d) return { ok: false, motivo: 'Decreto sconosciuto.' };
        const c = ctx || {};
        if (!c.haCapitale) {
            return { ok: false, motivo: 'Senza Capitale il Consiglio non siede.' };
        }
        const slot = councilSlot(c.turno, c.nato);
        if (!slot) {
            return { ok: false, motivo: 'Il Consiglio è chiuso: si riunisce al ' +
                'turno ' + nextCouncilTurn(c.turno) + '.' };
        }
        // `emanati` è quel che si è già fatto IN QUESTA seduta (chi chiama tiene
        // le due sedute separate per chiave): un decreto per seduta, e mai due
        // volte lo stesso.
        const fatti = c.emanati || [];
        if (fatti.indexOf(id) >= 0) {
            return { ok: false, motivo: 'Questo decreto è già stato emanato.' };
        }
        if (fatti.length >= MAX_DECREES) {
            return { ok: false, motivo: 'Il ' + SLOT_LABEL[slot].toLowerCase() +
                ' ha già emanato il suo decreto.' };
        }
        // Il limite della scala: un decreto che non può spostare niente non si
        // emana, o si pagherebbe per nulla.
        const g = clamp(c.grado);
        if (g + d.verso < MIN || g + d.verso > MAX) {
            return { ok: false, motivo: 'La politica del regno è già tutta da quel lato.' };
        }
        return { ok: true, grado: g + d.verso, slot };
    }

    // ---------- GLI EFFETTI DI DURATA ----------
    // Vivono in player.decretiAttivi = [{id, prov, fino}]. Qui si traducono in
    // quel che la produzione deve sapere, in un oggetto solo: così
    // turnProduction fa una lettura e non quattro ricerche nella lista.
    function activeEffects(attivi, turno) {
        const out = { bloccate: {}, extra: {}, esenti: {} };
        (attivi || []).forEach(a => {
            if (!a || !a.prov) return;
            if (a.fino != null && turno > a.fino) return;     // scaduto
            if (a.id === 'feudo' || a.id === 'corvee') out.bloccate[a.prov] = true;
            else if (a.id === 'affranca') out.extra[a.prov] = (out.extra[a.prov] || 0) + 1;
            else if (a.id === 'franchigia') out.esenti[a.prov] = true;
        });
        return out;
    }

    // Fino a quando dura un decreto emanato al turno `turno`. 'ciclo' = l'ultimo
    // turno del ciclo in corso (un feudo concesso al turno 3 dura fino al 10),
    // un numero = tanti turni da adesso.
    function expiryOf(d, turno) {
        if (!d || !d.durata) return null;
        if (d.durata === 'ciclo') return cycleOf(turno) * CYCLE;
        return (turno || 1) + d.durata - 1;
    }

    const api = {
        MIN, MAX, CYCLE, COUNCIL_TURNS, COUNCIL_EXTRA, MAX_DECREES, SHIFT,
        PERK_CAVALIERE_OGNI, PERK_MONETE, SLOT_LABEL,
        GRADES, grade, clamp,
        effect, perks,
        cycleOf, cycleStart, councilSlot, councilOpen, councilTurnsLeft,
        nextCouncilTurn, drift,
        DECREES, decree, decreesFor, canIssue, activeEffects, expiryOf
    };

    root.Politics = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

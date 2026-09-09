// ============================================================
// CRONACHE STORICHE — le VIGNETTE del regno (PURO).
// Non è il calendario datato di js/events.js (crociate, orda, scismi): quelle
// scattano a un TURNO fisso e MUTANO la mappa. Queste no. Una cronaca è una
// pergamena di colore che scatta quando la SITUAZIONE di un regno tocca una
// soglia che merita d'essere raccontata: la nascita della marina inglese quando
// l'Inghilterra vara il suo primo Veliero, il feudo di Francia quando la corona
// raduna il suo dominio, le lotte dei cavalieri teutonici quando l'Impero
// erige la sua prima Fortezza. Nessun effetto meccanico — è racconto.
//
// COME È FATTA (un descrittore):
//   { id:     'marina-inglese',       // chiave stabile: ogni cronaca UNA volta sola
//     regni:  ['Regno di Inghilterra'],// a chi può capitare (omesso = a chiunque)
//     gruppo: 'marina-reale',          // due cronache dello stesso gruppo non
//                                      //   capitano allo stesso regno: la specifica
//                                      //   di un regno SOFFOCA la generica (viene prima)
//     min:    3, max: 40,              // finestra di decenni (opzionale)
//     quando: c => c.shipCountOf('vascello') >= 1,  // il PREDICATO, puro, sul
//                                      //   contesto-situazione (Risiko.objectiveContext)
//     titolo, testo, nota }            // la pergamena (Risiko.showFoundation, tipo 'cronaca')
//
// COME NON DIVENTA MARTELLANTE (regola dell'utente: "non troppo frequenti"):
//   - ogni cronaca capita UNA volta per regno (`fatti`);
//   - due cronache dello stesso `gruppo` non capitano al medesimo regno;
//   - fra una cronaca e la successiva passano almeno COOLDOWN decenni (`since`).
// Il chiamante (player-board) tiene i tre libri mastri sul record del giocatore
// (`cronacheFatte`, `cronacaUltima`) e chiede a `pick` la prossima da srotolare.
//
// PURO come objectives.js: legge il contesto, non tocca niente. Il contesto `c`
// è quello di Risiko.objectiveContext — provCount, cityCount, fortressCount,
// shipCount(Of), popularity, hasMercato… — così una cronaca legge la situazione
// con lo stesso metro degli obiettivi.
// ============================================================
(function (root) {
    'use strict';

    // Decenni di silenzio fra una cronaca e l'altra per lo stesso regno: le
    // vignette devono essere rare, non un notiziario a ogni turno.
    const COOLDOWN = 5;

    // L'ordine CONTA: le cronache di un regno preciso stanno PRIMA delle generiche
    // dello stesso gruppo, così quando entrambe sono possibili vince la specifica
    // (la generica resta soffocata dal `gruppo` già speso). Le date `min` sono
    // prudenti: quasi ogni soglia si auto-data da sé (un Veliero non esiste al
    // turno 1), ma dove la soglia è solo "quante province" un `min` evita che la
    // vignetta arrivi con l'inchiostro ancora fresco della partita.
    const CHRONICLES = [

        // ---------- vignette del REGNO (le storie che l'utente ha chiesto) ----------

        // LA MARINA INGLESE. Il primo Veliero della corona: non una barca da
        // stretto, la nave che attraversa gli oceani (§9.2). Gruppo a sé
        // (`marina-reale`), così non la soffoca la generica "prima flotta".
        {
            id: 'marina-inglese', regni: ['Regno di Inghilterra'], gruppo: 'marina-reale',
            quando: c => c.shipCountOf('vascello') >= 1,
            titolo: 'La nascita della marina inglese',
            testo: 'Nei cantieri del regno prende forma il primo grande veliero: la corona d\'Inghilterra guarda oltre la Manica, verso mari che nessun re dell\'isola aveva ancora osato solcare.',
            nota: 'Una vela sola, e già il mondo pare più piccolo.'
        },

        // IL FEUDO DI FRANCIA. Non una conquista precisa: il momento in cui la
        // corona raccoglie sotto di sé un dominio degno del nome — il feudo dei
        // Capetingi che si fa regno.
        {
            id: 'feudo-francese', regni: ['Regno di Francia'], gruppo: 'feudo', min: 4,
            quando: c => c.provCount() >= 8,
            titolo: 'Il feudo e la corona di Francia',
            testo: 'I grandi vassalli piegano il capo: attorno all\'Île-de-France il dominio regio si allarga, e ciò che era un intrico di feudi comincia a somigliare a un regno.',
            nota: 'La corona di Francia mette radici.'
        },

        // I CAVALIERI TEUTONICI. La prima Fortezza dell'Impero: l'incastellamento
        // e gli ordini monastico-militari che ne nascono. Gruppo 'fortezza'
        // (condiviso con le altre corone del castello): a ogni regno la sua.
        {
            id: 'teutonici-impero', regni: ['Sacro Romano Impero'], gruppo: 'fortezza',
            quando: c => c.fortressCount() >= 1,
            titolo: 'I cavalieri teutonici',
            testo: 'All\'ombra della prima grande fortezza si raccoglie un ordine di cavalieri in mantello bianco e croce nera: monaci e soldati insieme, votati alla spada e alla fede ai confini dell\'Impero.',
            nota: 'La pietra e la croce marciano assieme.'
        },
        // Il rovescio della stessa storia, dal Baltico: la Polonia che quei
        // cavalieri li affronta.
        {
            id: 'teutonici-polonia', regni: ['Ducato di Polonia'], gruppo: 'fortezza',
            quando: c => c.fortressCount() >= 1,
            titolo: 'Le lotte contro i cavalieri teutonici',
            testo: 'Sul Baltico i cavalieri in croce nera premono sulle terre polacche. Il duca risponde con la pietra: la prima grande fortezza si leva a sbarrare la strada all\'Ordine.',
            nota: 'Il Baltico non si arrende all\'Ordine.'
        },
        // Bisanzio: la sua fortezza è un\'altra cosa — le mura leggendarie.
        {
            id: 'mura-teodosiane', regni: ['Impero Bizantino'], gruppo: 'fortezza',
            quando: c => c.fortressCount() >= 1,
            titolo: 'Le mura di Teodosio',
            testo: 'Sotto il cielo del Bosforo si rinsaldano le mura più famose della cristianità: triplice cinta, torri e fossato, la cortina di pietra che per secoli terrà lontano ogni assedio.',
            nota: 'Nessun ariete ha mai piegato quella cinta.'
        },
        // L\'Ungheria del Duecento: l\'incastellamento dopo l\'urto delle steppe.
        {
            id: 'incastellamento-ungherese', regni: ['Ducato di Ungheria'], gruppo: 'fortezza',
            quando: c => c.fortressCount() >= 1,
            titolo: 'L\'incastellamento d\'Ungheria',
            testo: 'Sulle alture della corona di Santo Stefano sorgono i castelli di pietra: dopo il turbine venuto da oriente, il regno d\'Ungheria impara a difendersi dall\'alto delle sue rocche.',
            nota: 'Il regno si fa di pietra.'
        },

        // LA CASA DELLA SAPIENZA. La prima Città degli Abbasidi: Baghdad, la
        // capitale del sapere. Gruppo 'citta' (condiviso con la generica).
        {
            id: 'casa-sapienza', regni: ['Califfato Abbaside'], gruppo: 'citta',
            quando: c => c.cityCount() >= 1,
            titolo: 'La Casa della Sapienza',
            testo: 'Fra i mercati e le moschee della prima grande città sorge la Casa della Sapienza: astronomi, medici e traduttori vi raccolgono il sapere del mondo antico.',
            nota: 'L\'oro del Califfato si spende in inchiostro.'
        },

        // LA RECONQUISTA. La Castiglia che cresce: il dominio cristiano che
        // riguadagna la penisola.
        {
            id: 'reconquista', regni: ['Regno di Castiglia'], gruppo: 'reconquista', min: 4,
            quando: c => c.provCount() >= 9,
            titolo: 'La Reconquista avanza',
            testo: 'Città dopo città, la croce riguadagna terreno sulla mezzaluna: la corona di Castiglia allarga il suo dominio verso il sud, e i cronisti già cantano la riconquista.',
            nota: 'Il confine scende verso mezzogiorno.'
        },

        // LE FLOTTE FATIMIDI. Il Califfato del Cairo, potenza di mare nel
        // Mediterraneo. Gruppo 'marina' (la specifica soffoca la generica).
        {
            id: 'flotte-fatimidi', regni: ['Califfato Fatimide'], gruppo: 'marina',
            quando: c => c.shipCount() >= 1,
            titolo: 'Le flotte del Califfato',
            testo: 'Dagli arsenali del Cairo salpa la prima flotta califfale: il Mediterraneo, che i Fatimidi chiamano il proprio mare, si copre delle loro vele.',
            nota: 'Il mare di mezzo cambia padrone.'
        },

        // LA RUS\' DI KIEV. La prima città del principato, sul cammino "dai
        // Variaghi ai Greci".
        {
            id: 'rus-di-kiev', regni: ['Kievan Ru\'s'], gruppo: 'citta', min: 3,
            quando: c => c.cityCount() >= 1,
            titolo: 'La Rus\' di Kiev',
            testo: 'Sulle rive del Dnepr cresce la prima grande città della Rus\': sul cammino che dai Variaghi porta ai Greci, mercanti e principi vi fondano il cuore di un popolo nuovo.',
            nota: 'Dal fiume nasce un regno.'
        },

        // ---------- vignette GENERICHE (a qualunque regno le tocchi) ----------

        // La prima nave d\'assalto: il regno che scopre il mare. Chi ha una
        // vignetta navale propria (Inghilterra col Veliero, Fatimidi) la riceve
        // al posto di questa, o in aggiunta — dipende dal gruppo.
        {
            id: 'prima-flotta', gruppo: 'marina',
            quando: c => c.shipCount() >= 1,
            titolo: 'Il regno prende il mare',
            testo: 'Sulla spiaggia si allineano le prime chiglie del regno: dove finiva la terra ora comincia una strada d\'acqua, e i confini smettono d\'essere un limite.',
            nota: 'La costa non è più la fine del mondo.'
        },

        // La prima Fortezza: la corona di pietra. La ricevono i regni senza una
        // storia di castello propria (le altre l\'hanno più su, nel gruppo 'fortezza').
        {
            id: 'prima-fortezza', gruppo: 'fortezza',
            quando: c => c.fortressCount() >= 1,
            titolo: 'La corona di pietra',
            testo: 'Sul confine più conteso si leva la prima fortezza del regno: bastioni, camminamenti e una guarnigione che veglia. Da qui la frontiera non arretrerà facilmente.',
            nota: 'La pietra vale mille lance.'
        },

        // La prima Città: un centro che raccoglie mercati, artigiani e chiese.
        {
            id: 'prima-citta', gruppo: 'citta',
            quando: c => c.cityCount() >= 1,
            titolo: 'Nasce una grande città',
            testo: 'Dove sorgeva un borgo cresce ora una città vera: mura, campanili e fiere che chiamano gente da lontano. Il regno ha finalmente un cuore che pulsa.',
            nota: 'Una città, e il regno ha un centro.'
        },

        // Il primo Mercato: le fiere, le carovane, la ricchezza che circola.
        {
            id: 'prime-fiere', gruppo: 'mercato',
            quando: c => c.hasMercato(),
            titolo: 'Fiere e mercanti',
            testo: 'Al primo mercato del regno accorrono carovane e banchi di cambio: lana, sale e spezie cambiano mano, e con le merci viaggiano notizie e monete.',
            nota: 'Dove passano le merci, cresce la corona.'
        },

        // Il regno insanguinato: qualcuno gli ha strappato una terra che
        // contava. La ferita che accende la vendetta.
        {
            id: 'regno-insanguinato', gruppo: 'guerra', min: 4,
            quando: (c, sit) => !!sit.wronged,
            titolo: 'Il regno insanguinato',
            testo: 'Una terra cara è caduta in mano nemica, e i suoi campanili suonano ora per un altro signore. Alla corte non si parla d\'altro che di riprendersela.',
            nota: 'Un torto ricordato è una guerra rimandata.'
        },

        // L\'età dell\'oro: un regno ampio e contento. La vignetta dell\'apice.
        {
            id: 'eta-oro', gruppo: 'apice', min: 6,
            quando: c => c.popularity() >= 5 && c.provCount() >= 10,
            titolo: 'L\'età dell\'oro del regno',
            testo: 'Le messi sono abbondanti, i sudditi cantano il loro re e le fortezze vegliano ai confini: i cronisti scriveranno di questi anni come dell\'età dell\'oro del regno.',
            nota: 'Anni che i posteri invidieranno.'
        }
    ];

    function byId(id) { return CHRONICLES.find(ch => ch.id === id) || null; }

    // La prossima cronaca da srotolare per un regno, o null. Il chiamante passa la
    // situazione:
    //   nome   il nome del regno (per il campo `regni`)
    //   turno  il decennio corrente (per min/max)
    //   c      il contesto-situazione (Risiko.objectiveContext) — il PREDICATO legge qui
    //   wronged  se il regno ha subìto un torto (rancore) — per la vignetta di guerra
    //   fatti  gli id già srotolati a questo regno (ognuno una volta sola)
    //   since  decenni dall\'ultima cronaca di questo regno (Infinity se mai)
    // Applica in ordine: distanza minima (COOLDOWN), poi per ogni descrittore
    // "già fatto? gruppo già speso? è il mio regno? sono nella finestra? la
    // situazione lo accende?". La prima che passa vince.
    function pick(sit) {
        sit = sit || {};
        if ((sit.since != null) && sit.since < COOLDOWN) return null;   // troppo presto
        const fatti = new Set(sit.fatti || []);
        // I gruppi già spesi: derivati dai fatti, così una specifica già uscita
        // impedisce alla generica dello stesso gruppo di ripetere il concetto.
        const gruppiSpesi = new Set();
        fatti.forEach(id => { const d = byId(id); if (d && d.gruppo) gruppiSpesi.add(d.gruppo); });
        const turno = sit.turno || 0;
        for (const ch of CHRONICLES) {
            if (fatti.has(ch.id)) continue;
            if (ch.gruppo && gruppiSpesi.has(ch.gruppo)) continue;
            if (ch.regni && ch.regni.indexOf(sit.nome) === -1) continue;
            if (ch.min != null && turno < ch.min) continue;
            if (ch.max != null && turno > ch.max) continue;
            let ok = false;
            try { ok = !!ch.quando(sit.c, sit); } catch (e) { ok = false; }
            if (!ok) continue;
            return { id: ch.id, gruppo: ch.gruppo || null, titolo: ch.titolo, testo: ch.testo, nota: ch.nota || '' };
        }
        return null;
    }

    root.Chronicles = { CHRONICLES, COOLDOWN, pick, byId };

})(typeof window !== 'undefined' ? window : globalThis);

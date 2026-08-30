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
// mutatori di `ctx` (ctx.spawnKingdom, ctx.reinforce, ctx.notify, ctx.decimate…), che sono
// funzioni di game-actions. Così ogni set-piece si legge tutto in un posto solo,
// ma le scritture restano concentrate in game-actions. I PIANIFICATORI qui sotto
// (marcia dell'orda, propagazione del contagio) sono invece PURI: l'evento li
// chiama direttamente — stesso modulo — e passa il risultato a `ctx` da applicare
// (come SeaRoutes.sail calcola e game-actions applica).
//
// Il calendario si aggiunge un evento per volta. Oggi contiene: la Prima
// Crociata (turno 11), l'Orda Mongola (25) e i REGNI CHE NASCONO a partita in
// corso — Selgiuchidi (9), Portogallo (16), Bulgaria (19), Norvegia e Svezia (24).
// ============================================================
(function (root) {
    'use strict';

    // PRIMA CROCIATA (ciclo 2). Le mete sono SCAMBIATE rispetto alla marcia
    // storica per volere dell'utente: Bisanzio, da Costantinopoli (Eastern_Thrace),
    // punta a Gerusalemme (Palestine); la Francia ad Aleppo. `forza` è la taglia di
    // ciascuna oste, radunata drenando le VERE truppe del regno (§5): non è evocata.
    // Bisanzio ha una provincia fissa (`da`): è la stessa Eastern Thrace che
    // l'obiettivo bi2 chiede di riempire di uomini. La Francia invece ha una
    // `regione` di candidate — le stesse tre coste di MED_FR in objectives.js
    // (obiettivo fr1, "raduna 10 uomini su una costa mediterranea"): l'oste parte
    // da quella dove il giocatore ha DAVVERO ammassato l'esercito, non da un
    // punto fisso. Tenere questo elenco allineato a objectives.js se cambia.
    const PRIMA_CROCIATA = {
        forza: 10,
        spedizioni: [
            { regno: 'Impero Bizantino', da: 'Eastern_Thrace', meta: 'Palestine' }, // → Gerusalemme
            { regno: 'Regno di Francia', regione: ['Provence', 'Languedoc', 'Rhone'], meta: 'Aleppo' }
        ],
        alleati: ['Regno di Francia', 'Impero Bizantino'],
        patto: 'vista'   // solo vista condivisa: si vedono in Terra Santa, ma possono farsi guerra
    };

    // INVASIONE MONGOLA (ciclo 3). L'Orda sorge nella Mongolia storica — Urga
    // (Ulaanbaatar), Uliastai, Buryatia — tutte neutrali e lontanissime a est: la
    // nebbia le tiene nascoste ai regni europei finché non si avvicina. Nasce come
    // regno vero (colore, ordine dei turni) e **la gioca l'IA** come ogni altro
    // regno d'evento (regola dell'utente: l'Orda deve arrivare, ma non è il
    // giocatore a doverla manovrare). La strategia è `predone`: razzia, colpisce
    // il debole e non ha scrupoli a tradire — il profilo dell'Orda.
    // 25 armate per stato (75 in tutto, regola dell'utente): il corridoio di
    // neutrali fino all'Europa è lungo un continente ed è presidiato
    // (neutralGarrison cresce col turno): a 15 per stato l'Orda ci si scioglieva
    // dentro prima di vedere il Volga.
    // DOVE va, e con che passo, sta in due posti soli: il BINARIO (Uralsk →
    // Rostov → cuore dell'Europa centrale) è la marcia della sua dottrina
    // (js/doctrines.js), le ONDATE sono qui sotto in `rinforzo`.
    const INVASIONE_MONGOLA = {
        name: 'Mongoli',
        turno: 25,          // il decennio in cui si leva (e da cui si contano le ondate)
        fino: 100,          // la finestra resta aperta: l'Orda non smette di arrivare
        color: '#6b2b2b',   // rosso-bruno di steppa, distinto dai 10 regni
        bot: 'predone',
        province: [
            { id: 'Urga', soldati: 25 },       // il cuore dell'Orda
            { id: 'Uliastai', soldati: 25 },
            { id: 'Buryatia', soldati: 25 }
        ],
        // LE ONDATE (regola dell'utente): ogni 10 turni una nuova armata di 10
        // uomini raggiunge l'Orda, perché l'impatto sia quello devastante che fu.
        // Non è un'evocazione dal nulla come le reclute: sono i tumen che
        // continuano ad arrivare dalla steppa alle spalle della marcia — e per
        // questo calano sulla PUNTA della marcia (ctx.reinforce), non sparse per il
        // regno: dieci uomini in retrovia non sfondano niente.
        rinforzo: { ogni: 10, forza: 10 }
    };

    // ============================================================
    // I REGNI CHE NASCONO A PARTITA IN CORSO (regola dell'utente).
    // Selgiuchidi, Portogallo, Bulgaria, Norvegia e Svezia non sono comparse: sono
    // regni veri, governati dall'IA, che sorgono al loro decennio e crescono
    // lentamente di fianco ai giocatori. Il CARATTERE di ciascuno (chi attacca,
    // con chi tratta, dove non mette piede) sta in js/doctrines.js, indicizzato
    // per NOME — quindi i nomi qui sotto e quelli là devono combaciare.
    //
    // Dove nascono, in una regola sola (ctx.spawnKingdom):
    //   soloLibere   una provincia già di un regno non si tocca — un regno nuovo
    //                non piove addosso a chi c'è
    //   ripiego      per ogni provincia occupata si cerca una terra di nessuno
    //                CONFINANTE con quelle di partenza (i Selgiuchidi devono
    //                comunque sorgere in quell'angolo di mondo)
    //   minProvince  sotto questa soglia il regno NON nasce affatto: se il posto
    //                è occupato, quella storia semplicemente non accade
    // ============================================================

    // 1080 — L'ONDA TURCA. Nasce fra il lago di Van e l'Azerbaigian, con 6 uomini
    // per provincia. Musulmani convinti: la dottrina gli vieta ogni patto coi
    // cristiani e lo lega agli Abbasidi.
    const SELGIUCHIDI = {
        name: 'Sultanato Selgiuchide',
        color: '#b5824a',            // marrone chiaro di steppa anatolica
        bot: 'espansione',
        soloLibere: true, ripiego: true, minProvince: 1,
        province: [
            { id: 'Tabriz', soldati: 6 },
            { id: 'Urmia', soldati: 6 },
            { id: 'Erzurum', soldati: 6 },
            { id: 'Diyarbakir', soldati: 6 }
        ],
        annuncio: {
            tipo: 'regno',
            titolo: 'I Turchi Selgiuchidi',
            testo: 'Da oriente cala un popolo a cavallo: i Selgiuchidi piantano le tende fra Tabriz e l\'alto Tigri, e i loro emiri guardano a occidente.',
            nota: 'Un regno nuovo confina con te.'
        }
    };

    // 1150 — IL PORTOGALLO, fra Castiglia e Fatimidi. Non vuole espandersi via
    // terra: si difende, commercia e guarda al mare. Per questo parte più ricco
    // (2000 monete) e con del legname in magazzino: sono gli scafi la sua storia.
    const PORTOGALLO = {
        name: 'Regno di Portogallo',
        color: '#006d5b',            // verde-teal delle carte atlantiche
        bot: 'costruttore',
        soloLibere: true, minProvince: 1,
        monete: 2000,
        scorte: { legno: 3 },
        province: [
            { id: 'Beira', soldati: 5 },
            { id: 'Estremadura', soldati: 5 },   // la provincia "Portugal" della mappa
            { id: 'Alentejo', soldati: 5 }
        ],
        annuncio: {
            tipo: 'regno',
            titolo: 'Il Regno di Portogallo',
            testo: 'Fra il Douro e il Tago si leva una corona nuova: il Portogallo non chiede terra ai vicini, chiede il mare.',
            nota: 'Un regno nuovo confina con te.'
        }
    };

    // 1180 — I BULGARI risorgono sul basso Danubio, in quel che è rimasto libero.
    // Se non è rimasto niente, non risorgono affatto.
    const BULGARIA = {
        name: 'Regno di Bulgaria',
        color: '#808000',            // verde oliva
        bot: 'costruttore',
        soloLibere: true, minProvince: 1,
        province: [
            { id: 'Moldavia', soldati: 6 },
            { id: 'Bessarabia', soldati: 6 },
            { id: 'Dobrudja', soldati: 6 },
            { id: 'Wallachia', soldati: 6 }
        ],
        annuncio: {
            tipo: 'regno',
            titolo: 'La rivolta bulgara',
            testo: 'Sul basso Danubio i boiari alzano lo stendardo: la Bulgaria torna a essere un regno.',
            nota: 'Un regno nuovo confina con te.'
        }
    };

    // 1230 — I DUE REGNI DEL NORD. Due corone distinte e NON in guerra fra loro:
    // salgono verso il settentrione, non scendono in Danimarca, e si contendono
    // solo la Finlandia (js/doctrines.js). Otto uomini a testa: nascono da una
    // provincia sola e le terre di nessuno di questo decennio sono presidiate.
    const NORVEGIA = {
        name: 'Regno di Norvegia',
        color: '#5a6b7c',            // grigio ardesia dei fiordi
        bot: 'espansione',
        soloLibere: true, ripiego: true, minProvince: 1,
        province: [{ id: 'Western_Norway', soldati: 8 }],
        annuncio: {
            tipo: 'regno',
            titolo: 'La corona di Norvegia',
            testo: 'Sui fiordi occidentali una sola casa raccoglie i jarl: nasce il regno di Norvegia.',
            nota: 'Un regno nuovo confina con te.'
        }
    };
    const SVEZIA = {
        name: 'Regno di Svezia',
        color: '#00629b',            // blu acciaio del Baltico
        bot: 'espansione',
        soloLibere: true, ripiego: true, minProvince: 1,
        province: [{ id: 'Gotaland', soldati: 8 }],
        annuncio: {
            tipo: 'regno',
            titolo: 'La corona di Svezia',
            testo: 'Dal Götaland i re degli Svear muovono verso il settentrione: nasce il regno di Svezia.',
            nota: 'Un regno nuovo confina con te.'
        }
    };

    // Il calendario. Ogni voce è un descrittore come sopra.
    const EVENTS = [
        {
            id: 'selgiuchidi', turn: 9, fino: null, tipo: 'regno',
            titolo: 'I Turchi Selgiuchidi',
            testo: 'Un popolo a cavallo scende dall\'Asia centrale e si fa signore dell\'altopiano.',
            nota: '',
            onStart(ctx) { ctx.spawnKingdom(SELGIUCHIDI); }
        },
        {
            id: 'regno-portogallo', turn: 16, fino: null, tipo: 'regno',
            titolo: 'Il Regno di Portogallo',
            testo: 'Nella lotta fra Castiglia e Fatimidi nasce una corona che guarda all\'oceano.',
            nota: '',
            onStart(ctx) { ctx.spawnKingdom(PORTOGALLO); }
        },
        {
            id: 'regno-bulgaria', turn: 19, fino: null, tipo: 'regno',
            titolo: 'La rivolta bulgara',
            testo: 'Sul basso Danubio i boiari alzano lo stendardo: la Bulgaria torna a essere un regno.',
            nota: '',
            onStart(ctx) { ctx.spawnKingdom(BULGARIA); }
        },
        {
            id: 'regni-nordici', turn: 24, fino: null, tipo: 'regno',
            titolo: 'Le corone del Nord',
            testo: 'Norvegia e Svezia si danno un re ciascuna: due regni distinti, non in guerra fra loro.',
            nota: '',
            // Due regni, due spawn: nascono insieme ma restano indipendenti — e
            // ognuno può mancare per conto suo, se il suo feudo è già di qualcuno
            // e non c'è terra libera lì attorno.
            onStart(ctx) { ctx.spawnKingdom(NORVEGIA); ctx.spawnKingdom(SVEZIA); }
        },
        {
            id: 'invasione-mongola', turn: INVASIONE_MONGOLA.turno, fino: INVASIONE_MONGOLA.fino,
            tipo: 'mongoli',
            titolo: 'L\'Orda Mongola',
            testo: 'Dalle steppe d\'Oriente si leva l\'Orda: i popoli del feltro sono uniti, e i loro cavalli guardano a Occidente.',
            nota: '',
            onStart(ctx) {
                // Nasce il regno mongolo in Mongolia. Nessuna pergamena globale: la
                // nebbia deve tenerlo segreto finché non arriva ai confini di qualcuno.
                ctx.spawnKingdom(INVASIONE_MONGOLA);
            },
            // LE ONDATE. L'evento resta attivo per il resto della partita e ogni
            // `ogni` decenni cala un'armata sulla PUNTA della marcia — la provincia
            // dell'Orda più vicina alla prima tappa non ancora conquistata. L'asse
            // si chiede alla DOTTRINA (js/doctrines.js: Doctrines.march), che è il
            // posto dove il binario storico è già scritto: due elenchi di province
            // in due file finirebbero per divergere al primo ritocco.
            onRound(ctx) {
                const r = INVASIONE_MONGOLA.rinforzo;
                if (!r || (ctx.turn - INVASIONE_MONGOLA.turno) % r.ogni !== 0) return;
                const asse = (root.Doctrines && root.Doctrines.march(INVASIONE_MONGOLA.name)) || [];
                ctx.reinforce(INVASIONE_MONGOLA.name, { forza: r.forza, verso: asse });
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
                    const host = ctx.muster(sp.regno, { da: sp.da, regione: sp.regione, forza: d.forza });
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

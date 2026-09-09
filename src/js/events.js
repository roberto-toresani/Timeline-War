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
// Crociata (turno 11), l'Orda Mongola (21), la crociata inglese (21), la
// Peste Nera (35-39) e i REGNI CHE NASCONO a partita in corso — Selgiuchidi
// (9), Portogallo (16), Bulgaria (19), Norvegia e Svezia (24).
// ============================================================
(function (root) {
    'use strict';

    // PRIMA CROCIATA (ciclo 2, turno 11). Solo la FRANCIA marcia su Aleppo
    // (regola dell'utente: Bisanzio NON ha più la chiamata del Papa — il suo
    // obiettivo storico è cambiato, e Gerusalemme la prenderà l'Inghilterra nel
    // ciclo 3, vedi CROCIATA_INGLESE). `forza` è la taglia dell'oste, radunata
    // drenando le VERE truppe del regno (§5): non è evocata. La Francia ha una
    // `regione` di candidate — le stesse tre coste di MED_FR in objectives.js
    // (obiettivo fr1, "raduna 10 uomini su una costa mediterranea"): l'oste parte
    // da quella dove il giocatore ha DAVVERO ammassato l'esercito, non da un
    // punto fisso. Tenere questo elenco allineato a objectives.js se cambia.
    // Una gamba sola, quindi niente più patto di vista fra i due crociati.
    const PRIMA_CROCIATA = {
        forza: 10,
        spedizioni: [
            { regno: 'Regno di Francia', regione: ['Provence', 'Languedoc', 'Rhone'], meta: 'Aleppo' }
        ]
    };

    // CROCIATA INGLESE (ciclo 3, turno 21). Gli uomini che l'Inghilterra ha
    // radunato a Home Counties alla FINE del ciclo 2 (obiettivo in2-2, "La
    // chiamata del Papa") salpano all'INIZIO del ciclo 3 e sbarcano all'assalto
    // di Gerusalemme (Palestine) — regola dell'utente: è l'Inghilterra, non più
    // Bisanzio, a portare la croce in Terra Santa. `da` è fisso su Home Counties,
    // la stessa provincia che l'obiettivo chiede di riempire; `forza` è la taglia
    // dell'oste (drena da Home Counties per primo, poi dal resto del regno se là
    // non bastano — il trasporto è del Papa, §editto). L'evento scatta al
    // passaggio al turno 21, prima che chiunque giochi il ciclo 3.
    const CROCIATA_INGLESE = {
        forza: 10,
        regno: 'Regno di Inghilterra',
        da: 'Home_Counties',
        meta: 'Palestine'   // → Gerusalemme
    };

    // INVASIONE MONGOLA (turno 21 = 1200, scelta dell'utente: si leva presto
    // apposta, così entra in contatto coi popoli d'Occidente entro quattro o
    // cinque decenni invece di arrivare a partita quasi finita).
    // L'Orda sorge nella Mongolia storica — Urga
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
    // Rostov → cuore dell'Europa centrale, più l'ala di Persia) è la marcia della
    // sua dottrina (js/doctrines.js), le ONDATE sono qui sotto in `rinforzo`.
    // Fuori dal binario non conquista nulla (`soloMete` nella dottrina): niente
    // Cina, niente Corea, niente Siberia — ogni provincia presa alle spalle è un
    // decennio tolto alla corsa verso occidente.
    const INVASIONE_MONGOLA = {
        name: 'Mongoli',
        turno: 21,          // 1200: il decennio in cui si leva (e da cui si contano le ondate)
        fino: 100,          // la finestra resta aperta: l'Orda non smette di arrivare
        color: '#6b2b2b',   // rosso-bruno di steppa, distinto dai 10 regni
        bot: 'predone',
        province: [
            { id: 'Urga', soldati: 25 },       // il cuore dell'Orda
            { id: 'Uliastai', soldati: 25 },
            { id: 'Buryatia', soldati: 25 }
        ],
        // LE ONDATE (regola dell'utente): le 75 armate di partenza non bastano ad
        // arrivare in Europa e in Medio Oriente, quindi OGNI 5 turni, fino al 1350,
        // l'Orda riceve un bonus in DUE parti:
        //   reclute      10 truppe LIBERE che l'IA schiera dove serve (§5.1: reclute
        //                da schierare — non calano sulla punta, le dispone il bot)
        //   perProvincia 1 uomo su OGNI provincia posseduto, AUTOMATICAMENTE: cresce
        //                con l'impero, così più l'Orda si allarga più regge il fronte
        // `finoAl` (turno 35 = 1349) è l'ultimo decennio in cui piovono rinforzi.
        rinforzo: { ogni: 5, reclute: 10, perProvincia: 1, finoAl: 35 },
        // IL GRANDE PASSO DEL 1350 (turno 36, regola dell'utente): dopo un secolo e
        // mezzo di marcia l'Orda si ferma. Da qui niente più rinforzi, la dottrina
        // di marcia si spegne (`dottrinaSospesa`, letta da bot.js) e la strategia
        // passa a `costruttore`: l'Orda diventa STANZIALE — difende ciò che ha e
        // torna a poter trattare, invece di sfondare a occidente all'infinito.
        stanziale: { turno: 36, bot: 'costruttore' }
    };

    // LA PESTE NERA (turno 35 = 1340-1349: la Peste Nera dilaga in Europa fra il
    // 1347 e il 1351, e il decennio compresso la contiene). A differenza
    // dell'Orda non è scriptata su una geografia: colpisce OGNI regno IN GIOCO,
    // comprese le corone appena sorte — Selgiuchidi, Portogallo, Bulgaria,
    // Norvegia, Svezia e l'Orda stessa, che nella storia vera fu proprio una
    // delle porte da cui la peste entrò in Europa (l'assedio di Caffa, 1347).
    // Resta attiva per `fino` turni — le ondate di ritorno del secondo Trecento
    // — e OGNI turno, per OGNI regno, il conto è GameRules.plagueTier(sanita):
    // quante migliorie di SANITÀ (§6.1) ha sulla Capitale decide quanti uomini
    // cadono e se il raccolto di chi muore salta quel turno. Non è una
    // conquista né un premio: è un peso uguale per tutti, e l'unica leva che il
    // giocatore ha per alleggerirlo è costruire ospedali — prima che bussi, o
    // mentre imperversa (dura abbastanza per poterci ancora rimediare).
    const PESTE = { turno: 35, fino: 39 };

    // LA PESTE — un giro: per ogni regno ANCORA IN GIOCO (ha province) legge le
    // migliorie di Sanità sulla sua Capitale e applica il piano che ne esce
    // (GameRules.plagueTier). Un regno senza Capitale (o senza province) non ha
    // nulla da cui leggere sanita, quindi va già al tier 0 — ma `ctx.decimate`
    // senza owned paths ritorna null da sé, quindi qui basta il filtro iniziale.
    // `esordio` cambia solo il tono della pergamena: il primo colpo annuncia
    // l'epidemia, i successivi ne raccontano il seguito.
    function plagueRound(ctx, esordio) {
        const GR = root.GameRules;
        if (!GR) return;
        (ctx.R.players() || []).forEach(regno => {
            if (!ctx.map.ownedPaths(regno.name).length) return;
            const cap = ctx.R.getCapitalPathFor(regno);
            const attive = cap ? ctx.map.welfare(cap).filter(e => !e.dormant).map(e => e.key) : [];
            const sanita = GR.welfareCount(attive, 'sanita');
            const piano = GR.plagueTier(sanita);
            if (!piano) return;
            const esito = ctx.decimate(regno.name, piano);
            if (!esito || !esito.colpiti.length) return;
            const dettagli = esito.colpiti
                .map(c => (c.capitale ? 'la Capitale' : c.label) +
                    ' (' + c.persi + (c.persi === 1 ? ' uomo' : ' uomini') + ')')
                .join(' e ');
            const bloccaTxt = piano.bloccaRaccolta
                ? ' Le loro risorse non si raccolgono questo turno.' : '';
            ctx.notify(regno.name, {
                tipo: 'peste',
                titolo: esordio ? 'La Morte Nera' : 'La peste continua',
                testo: (esordio ? 'La peste nera dilaga nel regno: cadono ' : 'La peste continua a mietere: cadono ')
                    + dettagli + '.' + bloccaTxt,
                nota: 'Più migliorie di Sanità sulla Capitale, meno vittime — 4 bastano a fermarla.'
            });
        });
    }

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
    // solo la Finlandia (js/doctrines.js). DIECI uomini a testa (regola
    // dell'utente): nascono da una provincia sola, le terre di nessuno di questo
    // decennio ne hanno già quattro, e con otto non si espandevano affatto. Come
    // ogni regno nato per evento hanno la grazia dell'insediamento (§8), che si
    // conta dal loro turno di fondazione (player.nato).
    const NORVEGIA = {
        name: 'Regno di Norvegia',
        color: '#5a6b7c',            // grigio ardesia dei fiordi
        bot: 'espansione',
        soloLibere: true, ripiego: true, minProvince: 1,
        province: [{ id: 'Western_Norway', soldati: 10 }],
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
        province: [{ id: 'Gotaland', soldati: 10 }],
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
            // LE ONDATE e IL GRANDE PASSO DEL 1350. Fino al 1349 (finoAl) ogni
            // `ogni` decenni cala un'ondata di rinforzi (reclute libere + un uomo
            // su ogni provincia). Dal 1350 (stanziale.turno) l'Orda si ferma: si
            // spegne la dottrina di marcia e la strategia passa a quella moderata,
            // una volta sola.
            onRound(ctx) {
                const m = INVASIONE_MONGOLA;
                if (ctx.turn >= m.stanziale.turno) {
                    const orda = ctx.R.players().find(p => p.name === m.name);
                    if (orda && !orda.dottrinaSospesa) {
                        orda.dottrinaSospesa = true;   // bot.js: da qui gioca senza dottrina
                        orda.bot = m.stanziale.bot;    // difensiva e moderata
                    }
                    return;
                }
                const r = m.rinforzo;
                if (!r || ctx.turn > r.finoAl) return;
                if ((ctx.turn - m.turno) % r.ogni !== 0) return;
                ctx.reinforce(m.name, { reclute: r.reclute, perProvincia: r.perProvincia });
            }
        },
        {
            id: 'prima-crociata', turn: 11, fino: null, tipo: 'crociata',
            titolo: 'La Prima Crociata',
            testo: 'Da Chiaravalle il Papa bandisce la crociata: i Franchi marciano sulla Terra Santa.',
            nota: '',
            // Orchestrazione (regola dell'utente: nel descrittore, con ctx). Raduna
            // l'oste franca, la sbarca all'assalto, avvisa il regno.
            onStart(ctx) { crusadeHost(ctx, PRIMA_CROCIATA.spedizioni[0], PRIMA_CROCIATA.forza, 'La Prima Crociata'); }
        },
        {
            id: 'crociata-inglese', turn: 21, fino: null, tipo: 'crociata',
            titolo: 'La crociata inglese',
            testo: 'L\'oste radunata a Home Counties salpa per la Terra Santa: l\'Inghilterra muove su Gerusalemme.',
            nota: '',
            onStart(ctx) {
                const d = CROCIATA_INGLESE;
                crusadeHost(ctx, { regno: d.regno, da: d.da, meta: d.meta }, d.forza, 'La crociata inglese');
            }
        },
        {
            id: 'peste-nera', turn: PESTE.turno, fino: PESTE.fino, tipo: 'peste',
            titolo: 'La Morte Nera',
            testo: 'Dalle vie dei mercanti la peste dilaga fino in Europa: falcidia le corone, feroce con chi non ha ospedali.',
            nota: '',
            onStart(ctx) { plagueRound(ctx, true); },
            onRound(ctx) { plagueRound(ctx, false); }
        }
    ];

    // Raduna un'oste da un regno e la sbarca all'assalto della sua meta,
    // avvisando il regno con la pergamena dal suo punto di vista. Cuore comune
    // a tutte le crociate: una gamba = una chiamata di questa funzione.
    function crusadeHost(ctx, sp, forza, titolo) {
        const host = ctx.muster(sp.regno, { da: sp.da, regione: sp.regione, forza });
        if (!host) return null;             // regno morto o senza uomini: la crociata non parte
        const e = ctx.assault(sp.regno, sp.meta, host);
        if (!e) return null;
        const testo = e.rinforzo
            ? 'La nostra oste rinforza ' + e.metaLabel + ' in Terra Santa.'
            : (e.vinta
                ? 'La nostra oste espugna ' + e.metaLabel + ': ' + e.superstiti +
                  (e.superstiti === 1 ? ' superstite tiene la città' : ' superstiti tengono la città') +
                  (e.conversione ? ', convertita alla nostra fede' : '') + '.'
                : 'La nostra oste s\'infrange sotto le mura di ' + e.metaLabel +
                  ': la spedizione è perduta.');
        ctx.notify(e.regno, { tipo: 'crociata', titolo, testo, nota: '' });
        return e;
    }

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
    // Qui andranno hordeAdvance(stato, mappa) → bersagli, warLockBetween(a, b,
    // eventi) → bool. Restano funzioni pure: ricevono lo stato, restituiscono
    // un piano, non toccano niente. (La peste non ha bisogno di un pianificatore
    // a parte: il suo piano è GameRules.plagueTier, letto da plagueRound qui sopra.)

    root.Events = {
        EVENTS,
        startingAt, activeAt, byId
    };

})(typeof window !== 'undefined' ? window : globalThis);

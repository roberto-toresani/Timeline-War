// ============================================================================
//  OBIETTIVI DI PRESTIGIO (§10) — catalogo + valutazione. Modulo PURO.
//  Come popularity.js e religions.js: qui vivono le REGOLE (il catalogo dei 30
//  obiettivi del Ciclo I e la funzione che ne calcola la completezza); app.js
//  fornisce le letture dello stato via un "contesto" (ctx) e player-board.js
//  disegna. Nessuna dipendenza dal DOM: così è testabile e non può divergere
//  fra la plancia e (in futuro) l'IA.
//
//  Spunta = DAL VIVO (regola dell'utente): `completato` riflette lo stato
//  ATTUALE. Un obiettivo "conquista e difendi" o "costruisci un Mercato" conta
//  solo se lo TIENI quando si fanno i conti (a fine ciclo). Nessun latch.
//
//  Le condizioni "per regione" (costa mediterranea/adriatica, penisola iberica,
//  Isole Britanniche, al-Andalus) usano ELENCHI DI ID-PROVINCIA curati qui
//  sotto: precisi e ritoccabili in un posto solo.
//
//  Catalogo DEFINITIVO (revisione dell'utente sul foglio Obiettivi.xlsx,
//  2026-08-26): i 60 obiettivi (Ciclo I + Ciclo II) sono stati rivisti a mano
//  dall'utente — soglie alzate/abbassate, alcuni obiettivi sostituiti di netto,
//  due coppie Primario/Secondario scambiate di posto (Bisanzio e Ungheria nel
//  Ciclo II: la voce più identitaria è promossa a Primario). Il testo del
//  foglio è la fonte di verità; il `check` qui sotto descrive la formula VERA
//  (nel foglio la colonna delle note tecniche non sempre seguiva la modifica
//  del testo narrativo, quindi non ci si è appoggiati a quella colonna dov'era
//  in contraddizione col testo).
// ============================================================================
(function (root) {
    'use strict';

    // --- Insiemi di province (id SVG) -------------------------------------
    // al-Andalus: le province che al Mille nascono musulmane (data/start_religions.js).
    // "3 province che in partenza erano arabe" = 3 di queste ancora tue.
    const ANDALUS = new Set(['Toledo', 'Badajoz', 'Andalusia', 'Granada', 'Valencia', 'Alentejo']);
    // Penisola iberica (per lo sbarco fatimide "2 province iberiche").
    const IBERIA = new Set(['Galicia', 'Asturias', 'Navarra', 'Castile', 'Aragon', 'Catalonia',
        'Toledo', 'Estremadura', 'Valencia', 'Badajoz', 'Alentejo', 'Andalusia', 'Granada']);
    // Isole Britanniche (per "unifica l'isola" inglese).
    const BRITISH = new Set(['Home_Counties', 'East_Anglia', 'Midlands', 'Wales', 'West_Country',
        'Yorkshire', 'Lancashire', 'Lowlands', 'Highlands', 'Leinster', 'Ulster', 'Munster', 'Connaught']);
    // Coste mediterranee, per regione (raggiungibili dal regno interessato).
    const MED_FR = new Set(['Provence', 'Languedoc', 'Rhone']);        // Francia → crociata
    const ADRIATIC = new Set(['Croatia', 'Dalmatia', 'Istria']);      // Ungheria → Adriatico
    const LEVANT = new Set(['Lebanon', 'Syria', 'Palestine']);         // Abbasidi → Levante
    // Ciclo II: la costa francese dove sbarca l'Inghilterra (Impero angioino).
    const NORMANDY_FR = new Set(['Normandy', 'Brittany', 'Picardy', 'Flanders', 'Aquitaine', 'Burgundy']);
    // Ciclo II: cuore della Grecia, oltre a Macedonia/Bulgaria già bizantine dal Ciclo I.
    const GREECE = new Set(['Thessalia', 'Attica', 'Peloponnese', 'Crete', 'West_Aegean_Islands', 'Albania', 'Northern_Thrace']);
    // Ciclo II: l'Egitto, meta dell'espansione fatimide verso est. Elenco della
    // revisione 2026-08-26: Matruh è entrata, Sinai è uscita (il foglio elenca
    // esplicitamente "matruh, lower/middle/upper egypt o egyptian desert").
    const EGYPT = new Set(['Matruh', 'Lower_Egypt', 'Upper_Egypt', 'Middle_Egypt', 'Egyptian_Desert']);
    // Ciclo II: le isole del Mediterraneo occidentale, meta navale di Castiglia.
    // Revisione 2026-08-26: Corsica è uscita ("fra Sicilia e Sardegna", non più
    // "Sicilia, Sardegna e Corsica") — unico obiettivo che usa questo insieme.
    const ISLANDS = new Set(['Sicily', 'Sardinia']);
    // Ciclo II: le province di Terra Santa prese dai crociati (Francia/Bisanzio), da riconquistare.
    const HOLY_LAND = new Set(['Palestine', 'Aleppo', 'Lebanon', 'Syria']);

    const has = (set, ctx) => ctx.ownedIds().filter(id => set.has(id)).length;
    // Tutte le province di `ids` possedute e presidiate con almeno `n` uomini.
    const heldWith = (ids, ctx, n) => ids.every(id => ctx.owns(id) && ctx.soldiersOn(id) >= n);

    // --- Catalogo del Ciclo I (turni 1-10), per NOME di regno --------------
    // tier: etichetta · punti: 5/3/2 · tipo: per il chip colorato · test(ctx): booleano.
    const CICLO_1 = {
        'Regno di Castiglia': [
            { id: 'ca1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Reconquista',
              descrizione: 'Conquista e difendi 3 province che in partenza erano arabe.',
              check: 'province con fede di partenza musulmana ≥ 3',
              test: c => has(ANDALUS, c) >= 3 },
            { id: 'ca2', tier: 'Secondario', punti: 3, tipo: 'economia', titolo: 'Il tesoro reale',
              descrizione: 'Conserva 1000 monete d’oro.', check: 'monete ≥ 1000',
              test: c => c.monete >= 1000 },
            { id: 'ca3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Le strade di frontiera',
              descrizione: 'Costruisci 5 strade nel tuo regno.', check: 'strade nel regno ≥ 5',
              test: c => c.roadCount() >= 5 }
        ],
        'Regno di Francia': [
            { id: 'fr1', tier: 'Primario', punti: 5, tipo: 'preparazione', titolo: 'La Prima Crociata',
              descrizione: 'Raduna 10 uomini su una costa mediterranea, per il Papa.',
              check: 'una provincia in Provence/Languedoc/Rhone con soldati ≥ 10',
              test: c => c.ownedIds().some(id => MED_FR.has(id) && c.soldiersOn(id) >= 10) },
            { id: 'fr2', tier: 'Secondario', punti: 3, tipo: 'espansione', titolo: 'Espandere il regno',
              descrizione: 'Conquista 3 province per espandere il regno.', check: 'province ≥ 6',
              test: c => c.provCount() >= 6 },
            { id: 'fr3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Le foreste di Francia',
              descrizione: 'Conserva 6 scorte di legno.', check: 'scorte di legno ≥ 6',
              test: c => c.scorteOf('legno') >= 6 }
        ],
        'Califfato Fatimide': [
            { id: 'fa1', tier: 'Primario', punti: 5, tipo: 'navale', titolo: 'Verso al-Andalus',
              descrizione: 'Conquista e difendi 2 province nella penisola iberica.',
              check: '2 province iberiche possedute',
              test: c => has(IBERIA, c) >= 2 },
            { id: 'fa2', tier: 'Secondario', punti: 3, tipo: 'economia', titolo: 'La pergamena del califfo',
              descrizione: 'Collega 5 tuoi territori con strade.',
              check: 'province collegate ≥ 5',
              test: c => c.connectedCount() >= 5 },
            { id: 'fa3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'L’emporio del Mediterraneo',
              descrizione: 'Costruisci un Mercato.', check: 'possiedi un Mercato',
              test: c => c.hasMercato() }
        ],
        'Regno di Inghilterra': [
            { id: 'in1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Unificare l’isola',
              descrizione: 'Unifica l’isola conquistando 4 nuove province.',
              check: '7 province, tutte nelle Isole Britanniche',
              test: c => has(BRITISH, c) >= 7 },
            { id: 'in2', tier: 'Secondario', punti: 3, tipo: 'economia', titolo: 'La ricchezza della lana',
              descrizione: 'Accumula 3 scorte di bestiame.', check: 'scorte di bestiame ≥ 3',
              test: c => c.scorteOf('bestiame') >= 3 },
            { id: 'in3', tier: 'Terziario', punti: 2, tipo: 'navale', titolo: 'La flotta',
              descrizione: 'Costruisci una barca e difendi la provincia con 6 uomini.',
              check: 'una provincia con una nave e soldati ≥ 6',
              test: c => c.shipIds().some(id => c.soldiersOn(id) >= 6) }
        ],
        'Sacro Romano Impero': [
            { id: 'sr1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Consolidare l’Impero',
              descrizione: 'Difendi con almeno 4 uomini un minimo di 6 territori.',
              check: '6 province con soldati ≥ 4 ciascuna',
              test: c => c.ownedIds().filter(id => c.soldiersOn(id) >= 4).length >= 6 },
            { id: 'sr2', tier: 'Secondario', punti: 3, tipo: 'economia', titolo: 'Il legname del Reno',
              descrizione: 'Immagazzina 8 scorte di legno.', check: 'scorte di legno ≥ 8',
              test: c => c.scorteOf('legno') >= 8 },
            { id: 'sr3', tier: 'Terziario', punti: 2, tipo: 'espansione', titolo: 'Il valico del Tirolo',
              descrizione: 'Conquista e difendi la regione Tyrol.', check: 'possiedi Tyrol',
              test: c => c.owns('Tyrol') }
        ],
        'Ducato di Polonia': [
            { id: 'po1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Sbocco al mare',
              descrizione: 'Conquista 3 province che sboccano sul mare e difendile con almeno 4 uomini ciascuna.',
              check: '3 province costiere con soldati ≥ 4 ciascuna',
              test: c => c.ownedIds().filter(id => c.isCoastal(id) && c.soldiersOn(id) >= 4).length >= 3 },
            { id: 'po2', tier: 'Secondario', punti: 3, tipo: 'economia', titolo: 'Il mercato e le mandrie',
              descrizione: 'Costruisci un Mercato e immagazzina 4 scorte di bestiame.',
              check: 'un Mercato e scorte di bestiame ≥ 4',
              test: c => c.hasMercato() && c.scorteOf('bestiame') >= 4 },
            { id: 'po3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Le vie del regno',
              descrizione: 'Collega alla Capitale almeno 3 tipi di risorse diverse.',
              check: 'tipi di risorsa collegati ≥ 3',
              test: c => c.connectedTypes() >= 3 }
        ],
        'Kievan Ru\'s': [
            { id: 'ru1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Le terre della Rus’',
              descrizione: 'Conquista 9 territori.', check: 'province ≥ 9',
              test: c => c.provCount() >= 9 },
            { id: 'ru2', tier: 'Secondario', punti: 3, tipo: 'economia', titolo: 'Le strade dei fiumi',
              descrizione: 'Collega con strade almeno 6 territori e 2 risorse.',
              check: '≥ 6 province collegate e ≥ 2 tipi di risorsa',
              test: c => c.connectedCount() >= 6 && c.connectedTypes() >= 2 },
            { id: 'ru3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Le pellicce della steppa',
              descrizione: 'Immagazzina 6 scorte di bestiame.',
              check: 'scorte di bestiame ≥ 6',
              test: c => c.scorteOf('bestiame') >= 6 }
        ],
        'Ducato di Ungheria': [
            { id: 'un1', tier: 'Primario', punti: 5, tipo: 'crescita', titolo: 'Il regno prospero',
              descrizione: 'Ottieni una Sicurezza di livello 5 entro la fine del ciclo.',
              check: 'Sicurezza (§8) ≥ 5',
              test: c => c.sicurezza() >= 5 },
            { id: 'un2', tier: 'Secondario', punti: 3, tipo: 'espansione', titolo: 'Verso l’Adriatico',
              descrizione: 'Conquista e difendi l’accesso al Mar Mediterraneo.',
              check: 'una provincia costiera adriatica (Croatia/Dalmatia/Istria)',
              test: c => c.ownedIds().some(id => ADRIATIC.has(id)) },
            { id: 'un3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Il mercato di Buda',
              descrizione: 'Costruisci un Mercato.', check: 'possiedi un Mercato',
              test: c => c.hasMercato() }
        ],
        'Impero Bizantino': [
            { id: 'bi1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'La riconquista balcanica',
              descrizione: 'Conquista e difendi Macedonia e Bulgaria.',
              check: 'possiedi Macedonia e Bulgaria',
              test: c => c.owns('Macedonia') && c.owns('Bulgaria') },
            { id: 'bi2', tier: 'Secondario', punti: 3, tipo: 'preparazione', titolo: 'L’appello di Alessio I',
              descrizione: 'Raggruppa 8 uomini in Eastern Thrace per la crociata.',
              check: 'soldati in Eastern Thrace ≥ 8',
              test: c => c.owns('Eastern_Thrace') && c.soldiersOn('Eastern_Thrace') >= 8 },
            { id: 'bi3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Le vie dell’impero',
              descrizione: 'Collega almeno 4 province alla Capitale con strade.',
              check: 'province collegate ≥ 4',
              test: c => c.connectedCount() >= 4 }
        ],
        'Califfato Abbaside': [
            { id: 'ab1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Sbocco sul Mediterraneo',
              descrizione: 'Conquista e difendi con almeno 6 armate la provincia di Syria.',
              check: 'possiedi Syria con soldati ≥ 6',
              test: c => c.owns('Syria') && c.soldiersOn('Syria') >= 6 },
            { id: 'ab2', tier: 'Secondario', punti: 3, tipo: 'economia', titolo: 'Il tesoro del bazar',
              descrizione: 'Immagazzina 1000 monete.', check: 'monete ≥ 1000',
              test: c => c.monete >= 1000 },
            { id: 'ab3', tier: 'Terziario', punti: 2, tipo: 'espansione', titolo: 'Rafforzare il Califfato',
              descrizione: 'Conquista e difendi 7 province con almeno 2 uomini ciascuna.',
              check: '7 province con soldati ≥ 2 ciascuna',
              test: c => c.ownedIds().filter(id => c.soldiersOn(id) >= 2).length >= 7 }
        ]
    };

    // --- Catalogo del Ciclo II (turni 11-20 ≈ 1100-1199), per NOME di regno --
    // Francia e Bisanzio hanno appena preso Aleppo/Palestina con la Prima
    // Crociata (js/events.js): il tema è tenerle. Inghilterra e HRI radunano
    // per una chiamata futura del Papa; Ungheria/HRI/Rus' consolidano con un
    // edificio (Città/flotta); Fatimidi ed Castiglia proseguono le rispettive
    // direzioni del Ciclo I (Iberia→Egitto, Reconquista→isole); gli Abbasidi
    // rispondono riprendendo la Terra Santa e presidiando l'Oriente.
    // Revisione 2026-08-26: per Bisanzio e Ungheria la voce più identitaria
    // (riconquista della Grecia; dominio adriatico) è stata promossa a
    // Primario, l'altra retrocessa a Secondario — scambio di posto voluto
    // dall'utente sul foglio, non un refuso.
    const CICLO_2 = {
        'Regno di Francia': [
            { id: 'fr2-1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Difendi Aleppo',
              descrizione: 'Difendi l’avamposto di Aleppo in Terra Santa con almeno 10 armate.',
              check: 'possiedi Aleppo con soldati ≥ 10',
              test: c => c.owns('Aleppo') && c.soldiersOn('Aleppo') >= 10 },
            { id: 'fr2-2', tier: 'Secondario', punti: 3, tipo: 'espansione', titolo: 'Il regno consolidato',
              descrizione: 'Espandi il regno a 10 province.', check: 'province ≥ 10',
              test: c => c.provCount() >= 10 },
            { id: 'fr2-3', tier: 'Terziario', punti: 2, tipo: 'crescita', titolo: 'Il regno feudale',
              descrizione: 'Costruisci una Città e difendila con almeno 5 uomini.',
              check: 'una Città con soldati ≥ 5',
              test: c => c.cityIds().some(id => c.soldiersOn(id) >= 5) }
        ],
        'Impero Bizantino': [
            { id: 'bi2-1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'La riconquista della Grecia',
              descrizione: 'Completa la conquista della Grecia: possiedi 5 delle 7 province greche.',
              check: 'province greche possedute ≥ 5 (su 7)',
              test: c => has(GREECE, c) >= 5 },
            { id: 'bi2-2', tier: 'Secondario', punti: 3, tipo: 'espansione', titolo: 'La guardia di Gerusalemme',
              descrizione: 'Difendi l’avamposto di Palestina in Terra Santa con almeno 5 armate.',
              check: 'possiedi Palestine con soldati ≥ 5',
              test: c => c.owns('Palestine') && c.soldiersOn('Palestine') >= 5 },
            { id: 'bi2-3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Il tesoro di Costantinopoli',
              descrizione: 'Conserva 1200 monete d’oro.', check: 'monete ≥ 1200',
              test: c => c.monete >= 1200 }
        ],
        'Regno di Inghilterra': [
            { id: 'in2-1', tier: 'Primario', punti: 5, tipo: 'navale', titolo: 'Sbarco in Normandia',
              descrizione: 'Sbarca sul continente e conquista 2 province in Francia.',
              check: 'province della costa francese possedute ≥ 2',
              test: c => has(NORMANDY_FR, c) >= 2 },
            { id: 'in2-2', tier: 'Secondario', punti: 3, tipo: 'preparazione', titolo: 'La chiamata del Papa',
              descrizione: 'Raduna 10 uomini a Home Counties, pronti a salpare per la crociata.',
              check: 'soldati a Home Counties ≥ 10',
              test: c => c.owns('Home_Counties') && c.soldiersOn('Home_Counties') >= 10 },
            { id: 'in2-3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Le strade della corona',
              descrizione: 'Collega alla Capitale almeno 6 province con strade.',
              check: 'province collegate ≥ 6',
              test: c => c.connectedCount() >= 6 }
        ],
        'Sacro Romano Impero': [
            { id: 'sr2-1', tier: 'Primario', punti: 5, tipo: 'crescita', titolo: 'La città imperiale',
              descrizione: 'Costruisci una Città e difendila con 6 uomini.',
              check: 'una Città con soldati ≥ 6',
              test: c => c.cityIds().some(id => c.soldiersOn(id) >= 6) },
            { id: 'sr2-2', tier: 'Secondario', punti: 3, tipo: 'preparazione', titolo: 'La chiamata del Papa',
              descrizione: 'Raduna 10 uomini in Bavaria, pronti a marciare verso sud.',
              check: 'soldati in Bavaria ≥ 10',
              test: c => c.owns('Bavaria') && c.soldiersOn('Bavaria') >= 10 },
            { id: 'sr2-3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Le cave imperiali',
              descrizione: 'Immagazzina 6 scorte di pietra.', check: 'scorte di pietra ≥ 6',
              test: c => c.scorteOf('pietra') >= 6 }
        ],
        'Ducato di Polonia': [
            { id: 'po2-1', tier: 'Primario', punti: 5, tipo: 'navale', titolo: 'La flotta del Baltico',
              descrizione: 'Costruisci 2 navi per dominare il Baltico.', check: 'navi ≥ 2',
              test: c => c.shipCount() >= 2 },
            { id: 'po2-2', tier: 'Secondario', punti: 3, tipo: 'economia', titolo: 'Le vie del regno',
              descrizione: 'Collega alla Capitale almeno 4 tipi di risorse diverse.',
              check: 'tipi di risorsa collegati ≥ 4',
              test: c => c.connectedTypes() >= 4 },
            { id: 'po2-3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'Le foreste polacche',
              descrizione: 'Immagazzina 8 scorte di legno.', check: 'scorte di legno ≥ 8',
              test: c => c.scorteOf('legno') >= 8 }
        ],
        'Kievan Ru\'s': [
            { id: 'ru2-1', tier: 'Primario', punti: 5, tipo: 'crescita', titolo: 'Le mura di pietra',
              descrizione: 'Costruisci una Città nella provincia di Kiev e difendila con 6 uomini.',
              check: 'una Città a Kiev con soldati a Kiev ≥ 6',
              test: c => c.cityIds().indexOf('Kiev') !== -1 && c.soldiersOn('Kiev') >= 6 },
            { id: 'ru2-2', tier: 'Secondario', punti: 3, tipo: 'espansione', titolo: 'Le terre della Rus’',
              descrizione: 'Espandi il regno a 13 province.', check: 'province ≥ 13',
              test: c => c.provCount() >= 13 },
            { id: 'ru2-3', tier: 'Terziario', punti: 2, tipo: 'preparazione', titolo: 'Sentinella d’Oriente',
              descrizione: 'Raduna 8 uomini a Tartaria per difendere i confini a oriente.',
              check: 'soldati a Tartaria ≥ 8',
              test: c => c.owns('Tartaria') && c.soldiersOn('Tartaria') >= 8 }
        ],
        'Ducato di Ungheria': [
            { id: 'un2-1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Il dominio adriatico',
              descrizione: 'Conquista e tieni tutte e 3 le province adriatiche (Croatia, Dalmatia, Istria) e difendile con 5 uomini ciascuna.',
              check: 'le 3 province adriatiche, soldati ≥ 5 ciascuna',
              test: c => heldWith(Array.from(ADRIATIC), c, 5) },
            { id: 'un2-2', tier: 'Secondario', punti: 3, tipo: 'crescita', titolo: 'La città di Buda',
              descrizione: 'Costruisci una Città nel tuo regno.', check: 'possiedi una Città',
              test: c => c.hasCity() },
            { id: 'un2-3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'I granai della Pannonia',
              descrizione: 'Immagazzina 8 scorte di argilla.', check: 'scorte di argilla ≥ 8',
              test: c => c.scorteOf('argilla') >= 8 }
        ],
        'Califfato Fatimide': [
            { id: 'fa2-1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'L’emirato resiste',
              descrizione: 'Difendi la posizione in Iberia: possiedi 3 province della penisola.',
              check: 'province iberiche possedute ≥ 3',
              test: c => has(IBERIA, c) >= 3 },
            { id: 'fa2-2', tier: 'Secondario', punti: 3, tipo: 'espansione', titolo: 'Verso l’Egitto',
              descrizione: 'Espanditi in Egitto: possiedi 2 province egiziane.',
              check: 'province egiziane possedute ≥ 2',
              test: c => has(EGYPT, c) >= 2 },
            { id: 'fa2-3', tier: 'Terziario', punti: 2, tipo: 'economia', titolo: 'I granai del Nilo',
              descrizione: 'Immagazzina 8 scorte di grano.', check: 'scorte di grano ≥ 8',
              test: c => c.scorteOf('grano') >= 8 }
        ],
        'Regno di Castiglia': [
            { id: 'ca2-1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Avanza la Reconquista',
              descrizione: 'Avanza sulla penisola iberica: possiedi 9 delle 13 province iberiche.',
              check: 'province iberiche possedute ≥ 9',
              test: c => has(IBERIA, c) >= 9 },
            { id: 'ca2-2', tier: 'Secondario', punti: 3, tipo: 'crescita', titolo: 'Il benessere del popolo',
              descrizione: 'Chiudi il ciclo con una Popolarità di livello 4.',
              check: 'Popolarità ≥ 4',
              test: c => c.popularity() >= 4 },
            { id: 'ca2-3', tier: 'Terziario', punti: 2, tipo: 'navale', titolo: 'Verso Sardegna e Sicilia',
              descrizione: 'Sbarca e conquista una provincia fra Sicilia e Sardegna.',
              check: 'province fra Sicily/Sardinia possedute ≥ 1',
              test: c => has(ISLANDS, c) >= 1 }
        ],
        'Califfato Abbaside': [
            { id: 'ab2-1', tier: 'Primario', punti: 5, tipo: 'espansione', titolo: 'Riconquista la Terra Santa',
              descrizione: 'Riconquista le province cristiane in Terra Santa: possiedi 2 fra Palestina, Aleppo, Libano e Siria.',
              check: 'province di Terra Santa possedute ≥ 2',
              test: c => has(HOLY_LAND, c) >= 2 },
            { id: 'ab2-2', tier: 'Secondario', punti: 3, tipo: 'preparazione', titolo: 'Le sentinelle d’Oriente',
              descrizione: 'Conquista e difendi le province di Isfahan e Irakajemi con almeno 5 uomini l’una.',
              check: 'Isfahan e Irakajemi, soldati ≥ 5 ciascuna',
              test: c => heldWith(['Isfahan', 'Irakajemi'], c, 5) },
            { id: 'ab2-3', tier: 'Terziario', punti: 2, tipo: 'crescita', titolo: 'Lo splendore Abbaside',
              descrizione: 'Costruisci una Città e collegala a una risorsa.',
              check: 'una Città collegata alla rete, con ≥ 1 tipo di risorsa raggiungibile',
              test: c => c.cityIds().some(id => c.isConnected(id)) && c.connectedTypes() >= 1 }
        ]
    };

    // Cataloghi per ciclo, per NOME di regno. Un regno assente da un ciclo
    // (non dovrebbe succedere per i 10 nomi fissi) semplicemente non c'è.
    const CYCLES = { 1: CICLO_1, 2: CICLO_2 };
    const LAST_CYCLE = Math.max.apply(null, Object.keys(CYCLES).map(Number));

    // Compat: CATALOG resta il catalogo del Ciclo I (era l'unico, letto altrove?
    // nessun altro modulo lo legge oggi, ma si tiene per non rompere l'API).
    const CATALOG = CICLO_1;

    function cycleOfTurn(turn) { return Math.floor((Math.max(1, turn | 0) - 1) / 10) + 1; }

    // Valuta gli obiettivi del regno `name` con le letture di stato `ctx`, per
    // il ciclo `cycle` (default: I). Un ciclo senza catalogo dedicato ricade
    // sull'ultimo definito, così un regno non resta senza obiettivi mentre il
    // catalogo del ciclo in corso non è ancora stato scritto.
    // Torna null se il regno non ha un catalogo (partita fuori dai 10 regni).
    function evaluate(name, ctx, cycle) {
        let cyc = Math.max(1, (cycle | 0) || 1);
        if (!CYCLES[cyc]) cyc = LAST_CYCLE;
        const defs = CYCLES[cyc][name];
        if (!defs) return null;
        let punti = 0, puntiMax = 0;
        const items = defs.map(d => {
            let ok = false;
            try { ok = !!d.test(ctx); } catch (e) { ok = false; }
            puntiMax += d.punti;
            if (ok) punti += d.punti;
            return {
                id: d.id, tier: d.tier, punti: d.punti, tipo: d.tipo,
                titolo: d.titolo, descrizione: d.descrizione, check: d.check, completato: ok
            };
        });
        return { ciclo: cyc, items: items, punti: punti, puntiMax: puntiMax };
    }

    root.Objectives = {
        CATALOG, CYCLES, evaluate, cycleOfTurn,
        SETS: { ANDALUS, IBERIA, BRITISH, MED_FR, ADRIATIC, LEVANT, NORMANDY_FR, GREECE, EGYPT, ISLANDS, HOLY_LAND }
    };

})(typeof window !== 'undefined' ? window : globalThis);

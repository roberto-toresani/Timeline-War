// ============================================================================
//  OBIETTIVI DI PRESTIGIO (§10) — il BINARIO STORICO di ogni regno. Modulo PURO.
//  Come popularity.js e religions.js: qui vivono le REGOLE, app.js fornisce le
//  letture dello stato via un "contesto" (ctx) e player-board.js disegna.
//  Nessuna dipendenza dal DOM: così è testabile e non può divergere fra la
//  plancia e l'IA.
//
//  L'IMPIANTO (regola dell'utente). Gli obiettivi non sono più tre righe fisse
//  per (regno, ciclo): ogni regno ha un BINARIO, cioè la sequenza dei capitoli
//  della sua storia. Il binario NON è indicizzato per ciclo, ma per dove il
//  regno è arrivato nella PROPRIA storia (`player.capitolo`): chi compie un
//  capitolo avanza al successivo, chi non ce la fa lo rifà in intensità minore.
//  Così un regno martellato non resta indietro per sempre (rifà il suo capitolo,
//  che è un obiettivo che PUÒ fare) e un regno che corre non trova obiettivi già
//  completati (riceve il pezzo di storia successivo, non un numero più grande a
//  caso). L'adattamento cambia il PASSO e l'INTENSITÀ, mai il soggetto: il
//  filone storico guida tutto.
//
//  Un capitolo è un blocco di TRE voci — Primario 5 · Secondario 3 · Terziario 2
//  (la forma che il catalogo ha sempre avuto). Ogni voce è un TEMPLATE (21
//  archetipi coprono tutto) più argomenti JSON puri, quindi un'assegnazione si
//  SERIALIZZA e vive nel salvataggio: `test` e `hint` si ricostruiscono al volo.
//
//  Le tre INTENSITÀ (`resistere` · `avanzare` · `eccedere`) sono lo stesso
//  capitolo raccontato a tre scale: l'autore scrive tre ancore e un passo, il
//  generatore sceglie la soglia dentro quella banda.
//
//  Spunta = DAL VIVO (regola dell'utente): `completato` riflette lo stato
//  ATTUALE. Un obiettivo "conquista e difendi" o "costruisci un Mercato" conta
//  solo se lo TIENI quando si fanno i conti (a fine ciclo). Nessun latch.
//
//  I capitoli I e II sono i 60 obiettivi del foglio Obiettivi.xlsx (revisione
//  dell'utente 2026-08-26), riparametrizzati senza cambiarne una soglia:
//  l'ancora `avanzare` di ogni voce È il numero scritto a mano. Il testo del
//  foglio resta la fonte di verità.
//
//  Dal capitolo III in poi il foglio non arriva: i capitoli lunghi si scrivono
//  regno per regno seguendo docs/BINARI_STORICI.md (l'Inghilterra è il primo
//  binario steso fino all'VIII). Le ancore nuove non hanno un foglio dietro, ma
//  la stessa regola: `avanzare` è quel che si chiede a un regno in salute,
//  `resistere` quel che si chiede a uno che le sta prendendo.
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
    // Ciclo II: l'Egitto, meta dell'espansione fatimide verso est.
    const EGYPT = new Set(['Matruh', 'Lower_Egypt', 'Upper_Egypt', 'Middle_Egypt', 'Egyptian_Desert']);
    // Ciclo II: le isole del Mediterraneo occidentale, meta navale di Castiglia.
    const ISLANDS = new Set(['Sicily', 'Sardinia']);
    // Ciclo II: le province di Terra Santa prese dai crociati (Francia/Bisanzio), da riconquistare.
    const HOLY_LAND = new Set(['Palestine', 'Aleppo', 'Lebanon', 'Syria']);
    // L'Irlanda intera: quattro province, il capitolo V inglese (prenderla tutta
    // è caro, ed è il punto — è la conquista che fa mollare la presa sul continente).
    const IRELAND = new Set(['Leinster', 'Ulster', 'Munster', 'Connaught']);
    // Le terre angioine sul continente, Fiandre ESCLUSE: il capitolo III inglese
    // chiede una provincia di Francia *e* le Fiandre, quindi le due richieste
    // devono poter cadere su province diverse.
    const FRANCIA = new Set(['Normandy', 'Brittany', 'Picardy', 'Maine_Anjou', 'Poitou',
        'Guyenne', 'Aquitaine', 'Burgundy']);
    // Il Nuovo Mondo: la costa atlantica delle Tredici Colonie, dove approda la
    // rotta lunga del Veliero (§9.2) e dove l'Inghilterra fonda il suo insediamento.
    const AMERICA = new Set(['Maine', 'New_Hampshire', 'Massachusetts', 'Connecticut', 'New_York',
        'New_Jersey', 'Delaware', 'Maryland', 'Virginia', 'North_Carolina', 'South_Carolina',
        'Georgia', 'Florida']);
    // L'Oriente: le coste dell'India e quelle africane sulla rotta delle Indie.
    // Un solo insieme apposta — la meta è "verso oriente", e la storia si scrive
    // dove il mare porta la spedizione.
    const INDIE = new Set(['Sindh', 'Gujarat', 'Bombay', 'Travancore', 'Madras', 'Andhra',
        'Orissa', 'Bengal', 'Ceylon',
        'Senegal', 'Gambia', 'Guinea', 'Ivory_Coast', 'Ghana', 'Nigeria', 'Niger_Delta', 'Gabon',
        'North_Angola', 'South_Angola', 'Namaqualand', 'Cape_Colony', 'Eastern_Cape', 'Zululand',
        'Mocambique', 'Zanzibar', 'Kenya', 'Somaliland']);

    const SETS = {
        ANDALUS, IBERIA, BRITISH, MED_FR, ADRIATIC, LEVANT, NORMANDY_FR, GREECE, EGYPT,
        ISLANDS, HOLY_LAND, IRELAND, FRANCIA, AMERICA, INDIE
    };

    // "una provincia" / "3 province": il testo di un obiettivo cambia col numero,
    // e a soglia 1 la forma plurale suonerebbe da macchina.
    const pl = (n, uno, molti) => n === 1 ? uno : n + ' ' + molti;

    // ------------------------------------------------------------------------
    //  TEMPLATES — gli archetipi di obiettivo.
    // ------------------------------------------------------------------------
    //  Ogni template dichiara una `misura(ctx, arg)` e il test è SEMPRE
    //  `misura >= soglia`. È questa uniformità che rende possibile generare: la
    //  stessa funzione che dice SE è fatto dice anche DOVE SEI, e quindi da dove
    //  far partire la soglia del ciclo nuovo.
    //
    //  `hint(arg, n)` è la lettura MACCHINA dello stesso obiettivo, per bot.js:
    //  la stessa richiesta spezzata in dati che un bot può confrontare con la
    //  mappa senza reinterpretare il testo italiano. Vocabolario: region (Set,
    //  min[, viaSea, ownedOnly, garrisonAny]) · province/provinces · gold ·
    //  stock (res, min) · roads · connected · connectedTypes · provCount ·
    //  garrisonCount/coastalGarrison ({count, threshold}) · mercato · city
    //  ({min, at, connected}) · ships · shipGarrison · popularity · security.
    //  Vive qui, non in bot.js, per la stessa ragione delle regole pure: un
    //  obiettivo e la sua spinta cambiano insieme, in un solo file.
    //
    //  `misuraCal` (facoltativa) è la misura usata per CALIBRARE la soglia
    //  quando differisce da quella del test: serve ai combinati, dove `misura`
    //  vale -1 finché la parte fissa non è soddisfatta e schiaccerebbe la stima.
    //
    //  Convenzione: una misura che vale -1 dice "non possiedi nemmeno il posto",
    //  così una soglia 0 significa "basta che sia tuo".
    const TEMPLATES = {
        // N province di una regione. La meta geografica, l'archetipo più storico.
        regione: {
            misura: (c, a) => c.ownedIds().filter(id => SETS[a.set].has(id)).length,
            tetto: a => SETS[a.set].size,
            hint: (a, n) => ({ region: SETS[a.set], min: n, viaSea: !!a.viaSea })
        },
        // Una provincia QUALUNQUE della regione, con almeno n uomini: radunare
        // un'oste su una costa, non conquistare la costa intera.
        regioneGuarnigione: {
            misura: (c, a) => c.ownedIds().reduce((m, id) =>
                SETS[a.set].has(id) ? Math.max(m, c.soldiersOn(id)) : m, -1),
            hint: (a, n) => ({ region: SETS[a.set], ownedOnly: true, garrisonAny: n })
        },
        // TUTTE le province elencate, ciascuna con almeno n uomini.
        province: {
            misura: (c, a) => a.ids.reduce((m, id) =>
                Math.min(m, c.owns(id) ? c.soldiersOn(id) : -1), Infinity),
            hint: (a, n) => ({ provinces: a.ids.slice(), min: n })
        },
        // Una provincia precisa, con almeno n uomini (n = 0 → basta possederla).
        provincia: {
            misura: (c, a) => c.owns(a.id) ? c.soldiersOn(a.id) : -1,
            hint: (a, n) => ({ province: a.id, min: n })
        },
        provCount: { misura: c => c.provCount(), hint: (a, n) => ({ provCount: n }) },
        // n province con almeno `arg.soglia` uomini ciascuna.
        guarnigioni: {
            misura: (c, a) => c.ownedIds().filter(id => c.soldiersOn(id) >= a.soglia).length,
            hint: (a, n) => ({ garrisonCount: { count: n, threshold: a.soglia } })
        },
        guarnigioniCostiere: {
            misura: (c, a) => c.ownedIds().filter(id => c.isCoastal(id) && c.soldiersOn(id) >= a.soglia).length,
            hint: (a, n) => ({ coastalGarrison: { count: n, threshold: a.soglia } })
        },
        oro: { misura: c => c.monete, hint: (a, n) => ({ gold: n }) },
        scorte: { misura: (c, a) => c.scorteOf(a.res), hint: (a, n) => ({ stock: a.res, min: n }) },
        strade: { misura: c => c.roadCount(), hint: (a, n) => ({ roads: n }) },
        collegate: { misura: c => c.connectedCount(), hint: (a, n) => ({ connected: n }) },
        tipiCollegati: { misura: c => c.connectedTypes(), hint: (a, n) => ({ connectedTypes: n }) },
        mercato: { misura: c => c.hasMercato() ? 1 : 0, hint: () => ({ mercato: true }) },
        // Una Città, eventualmente in un posto preciso (`at`) o collegata alla
        // rete (`connected`), con almeno n uomini.
        citta: {
            misura: (c, a) => {
                let ids = c.cityIds();
                if (a.at) ids = ids.filter(id => id === a.at);
                if (a.connected) ids = ids.filter(id => c.isConnected(id));
                return ids.reduce((m, id) => Math.max(m, c.soldiersOn(id)), -1);
            },
            hint: (a, n) => {
                const h = { city: true, min: n };
                if (a.at) h.at = a.at;
                if (a.connected) h.connected = true;
                return h;
            }
        },
        navi: { misura: c => c.shipCount(), hint: (a, n) => ({ ships: n }) },
        // Navi di un TIPO preciso: il Veliero non è una barca più grande, è
        // l'unica chiglia che attraversa un oceano (§9.2), e un capitolo che
        // chiede il Nuovo Mondo deve poter chiedere prima quella.
        naviTipo: {
            misura: (c, a) => c.shipCountOf(a.tipo),
            hint: (a, n) => ({ ships: n, shipType: a.tipo })
        },
        // Una Città dentro una REGIONE, con almeno n uomini. È il gemello di
        // `citta` con `at`: là il posto è una provincia sola (Kiev), qui è un
        // pezzo di mondo — «fonda un insediamento nel Nuovo Mondo» non può
        // nominare la provincia, perché quale sia lo decide dove approda la nave.
        cittaRegione: {
            misura: (c, a) => c.cityIds().reduce((m, id) =>
                SETS[a.set].has(id) ? Math.max(m, c.soldiersOn(id)) : m, -1),
            hint: (a, n) => ({ city: true, min: n, region: SETS[a.set] })
        },
        // Una provincia con una nave ancorata e almeno n uomini a difenderla.
        naveGuarnigione: {
            misura: c => c.shipIds().reduce((m, id) => Math.max(m, c.soldiersOn(id)), -1),
            hint: (a, n) => ({ ships: 1, shipGarrison: n })
        },
        popolarita: { misura: c => c.popularity(), tetto: () => 5, hint: (a, n) => ({ popularity: n }) },
        sicurezza: { misura: c => c.sicurezza(), tetto: () => 5, hint: (a, n) => ({ security: n }) },
        // Il BENESSERE (§8): l'altra metà della Popolarità, e l'unica che non si
        // compra con la guardia — sale collegando risorse e cibo (§4). Un
        // capitolo che lo chiede sta chiedendo di governare, non di vincere: è il
        // contrappeso giusto a un secolo speso a conquistare.
        benessere: { misura: c => c.benessere(), tetto: () => 5, hint: (a, n) => ({ welfare: n }) },
        // Combinato: una parte SCALABILE (`capo`) più parti fisse (`altri`) che
        // vanno tutte soddisfatte. Finché le fisse non lo sono la misura è -1,
        // così l'obiettivo non risulta mai completo; per la calibrazione conta
        // però solo il capo, se no la soglia nascerebbe schiacciata.
        tutti: {
            misura: (c, a) => {
                const ok = a.altri.every(p => TEMPLATES[p.tmpl].misura(c, p.arg || {}) >= p.soglia);
                return ok ? TEMPLATES[a.capo.tmpl].misura(c, a.capo.arg || {}) : -1;
            },
            misuraCal: (c, a) => TEMPLATES[a.capo.tmpl].misura(c, a.capo.arg || {}),
            tetto: a => { const t = TEMPLATES[a.capo.tmpl]; return t.tetto ? t.tetto(a.capo.arg || {}) : Infinity; },
            hint: (a, n) => [TEMPLATES[a.capo.tmpl].hint(a.capo.arg || {}, n)]
                .concat(a.altri.map(p => TEMPLATES[p.tmpl].hint(p.arg || {}, p.soglia)))
        }
    };

    // ------------------------------------------------------------------------
    //  I BINARI — la storia di ogni regno, un capitolo per secolo.
    // ------------------------------------------------------------------------
    //  Un capitolo: { ciclo, epoca, tema, voci: [Primario, Secondario, Terziario] }.
    //  `ciclo` è il secolo a cui il capitolo APPARTIENE nella storia vera, non
    //  quello in cui lo si riceve: un regno lento arriva al capitolo III al
    //  quinto ciclo, e va bene così — è la sua storia che è andata più piano.
    //
    //  Una voce: { id, tipo, titolo, tmpl, arg, n:{resistere,avanzare,eccedere,passo},
    //  testo(n), check(n) }. `tipo` serve solo al chip colorato della plancia.
    //  L'ancora `avanzare` è la soglia scritta a mano sul foglio: a intensità
    //  `avanzare` il gioco chiede esattamente quello che chiedeva prima.
    const BINARI = {
        'Regno di Castiglia': [
            { ciclo: 1, epoca: '1000-1099', tema: 'La Reconquista comincia', voci: [
                { id: 'ca1', tipo: 'espansione', titolo: 'Reconquista',
                  tmpl: 'regione', arg: { set: 'ANDALUS' },
                  n: { resistere: 1, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Conquista e difendi ${n} province che in partenza erano arabe.`,
                  check: n => `province con fede di partenza musulmana ≥ ${n}` },
                { id: 'ca2', tipo: 'economia', titolo: 'Il tesoro reale',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 600, avanzare: 1000, eccedere: 1500, passo: 200 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'ca3', tipo: 'economia', titolo: 'Le strade di frontiera',
                  tmpl: 'strade', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Costruisci ${n} strade nel tuo regno.`,
                  check: n => `strade nel regno ≥ ${n}` }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'Verso il Tago', voci: [
                { id: 'ca2-1', tipo: 'espansione', titolo: 'Avanza la Reconquista',
                  tmpl: 'regione', arg: { set: 'IBERIA' },
                  n: { resistere: 6, avanzare: 9, eccedere: 11, passo: 1 },
                  testo: n => `Avanza sulla penisola iberica: possiedi ${n} delle 13 province iberiche.`,
                  check: n => `province iberiche possedute ≥ ${n}` },
                { id: 'ca2-2', tipo: 'crescita', titolo: 'Il benessere del popolo',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` },
                { id: 'ca2-3', tipo: 'navale', titolo: 'Verso Sardegna e Sicilia',
                  tmpl: 'regione', arg: { set: 'ISLANDS', viaSea: true },
                  n: { resistere: 1, avanzare: 1, eccedere: 2, passo: 1 },
                  testo: n => `Sbarca e conquista ${pl(n, 'una provincia', 'province')} fra Sicilia e Sardegna.`,
                  check: n => `province fra Sicily/Sardinia possedute ≥ ${n}` }
            ] }
        ],
        'Regno di Francia': [
            { ciclo: 1, epoca: '1000-1099', tema: 'L’appello di Clermont', voci: [
                { id: 'fr1', tipo: 'preparazione', titolo: 'La Prima Crociata',
                  tmpl: 'regioneGuarnigione', arg: { set: 'MED_FR' },
                  n: { resistere: 6, avanzare: 10, eccedere: 14, passo: 2 },
                  testo: n => `Raduna ${n} uomini su una costa mediterranea, per il Papa.`,
                  check: n => `una provincia in Provence/Languedoc/Rhone con soldati ≥ ${n}` },
                { id: 'fr2', tipo: 'espansione', titolo: 'Espandere il regno',
                  tmpl: 'provCount', arg: {},
                  n: { resistere: 4, avanzare: 6, eccedere: 8, passo: 1 },
                  testo: n => `Espandi il regno fino a ${n} province.`,
                  check: n => `province ≥ ${n}` },
                { id: 'fr3', tipo: 'economia', titolo: 'Le foreste di Francia',
                  tmpl: 'scorte', arg: { res: 'legno' },
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Conserva ${n} scorte di legno.`,
                  check: n => `scorte di legno ≥ ${n}` }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'Oltremare', voci: [
                { id: 'fr2-1', tipo: 'espansione', titolo: 'Difendi Aleppo',
                  tmpl: 'provincia', arg: { id: 'Aleppo' },
                  n: { resistere: 5, avanzare: 10, eccedere: 14, passo: 2 },
                  testo: n => `Difendi l’avamposto di Aleppo in Terra Santa con almeno ${n} armate.`,
                  check: n => `possiedi Aleppo con soldati ≥ ${n}` },
                { id: 'fr2-2', tipo: 'espansione', titolo: 'Il regno consolidato',
                  tmpl: 'provCount', arg: {},
                  n: { resistere: 7, avanzare: 10, eccedere: 13, passo: 1 },
                  testo: n => `Espandi il regno a ${n} province.`,
                  check: n => `province ≥ ${n}` },
                { id: 'fr2-3', tipo: 'crescita', titolo: 'Il regno feudale',
                  tmpl: 'citta', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Costruisci una Città e difendila con almeno ${n} uomini.`,
                  check: n => `una Città con soldati ≥ ${n}` }
            ] }
        ],
        'Califfato Fatimide': [
            { ciclo: 1, epoca: '1000-1099', tema: 'Il mare dei Fatimidi', voci: [
                { id: 'fa1', tipo: 'navale', titolo: 'Verso al-Andalus',
                  tmpl: 'regione', arg: { set: 'IBERIA', viaSea: true },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Conquista e difendi ${pl(n, 'una provincia', 'province')} nella penisola iberica.`,
                  check: n => `province iberiche possedute ≥ ${n}` },
                { id: 'fa2', tipo: 'economia', titolo: 'La pergamena del califfo',
                  tmpl: 'collegate', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Collega ${n} tuoi territori con strade.`,
                  check: n => `province collegate ≥ ${n}` },
                { id: 'fa3', tipo: 'economia', titolo: 'L’emporio del Mediterraneo',
                  tmpl: 'mercato', arg: {},
                  n: { resistere: 1, avanzare: 1, eccedere: 1, passo: 0 },
                  testo: () => 'Costruisci un Mercato.',
                  check: () => 'possiedi un Mercato' }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'L’emirato e l’Egitto', voci: [
                { id: 'fa2-1', tipo: 'espansione', titolo: 'L’emirato resiste',
                  tmpl: 'regione', arg: { set: 'IBERIA' },
                  n: { resistere: 2, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Difendi la posizione in Iberia: possiedi ${n} province della penisola.`,
                  check: n => `province iberiche possedute ≥ ${n}` },
                { id: 'fa2-2', tipo: 'espansione', titolo: 'Verso l’Egitto',
                  tmpl: 'regione', arg: { set: 'EGYPT' },
                  n: { resistere: 1, avanzare: 2, eccedere: 4, passo: 1 },
                  testo: n => `Espanditi in Egitto: possiedi ${n} province egiziane.`,
                  check: n => `province egiziane possedute ≥ ${n}` },
                { id: 'fa2-3', tipo: 'economia', titolo: 'I granai del Nilo',
                  tmpl: 'scorte', arg: { res: 'grano' },
                  n: { resistere: 5, avanzare: 8, eccedere: 12, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di grano.`,
                  check: n => `scorte di grano ≥ ${n}` }
            ] }
        ],
        'Regno di Inghilterra': [
            { ciclo: 1, epoca: '1000-1099', tema: 'Unificare l’isola', voci: [
                { id: 'in1', tipo: 'espansione', titolo: 'Unificare l’isola',
                  tmpl: 'regione', arg: { set: 'BRITISH' },
                  n: { resistere: 5, avanzare: 7, eccedere: 9, passo: 1 },
                  testo: n => `Unifica l’isola: possiedi ${n} province delle Isole Britanniche.`,
                  check: n => `province britanniche possedute ≥ ${n}` },
                { id: 'in2', tipo: 'economia', titolo: 'La ricchezza della lana',
                  tmpl: 'scorte', arg: { res: 'bestiame' },
                  n: { resistere: 2, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Accumula ${n} scorte di bestiame.`,
                  check: n => `scorte di bestiame ≥ ${n}` },
                { id: 'in3', tipo: 'navale', titolo: 'La flotta',
                  tmpl: 'naveGuarnigione', arg: {},
                  n: { resistere: 4, avanzare: 6, eccedere: 8, passo: 1 },
                  testo: n => `Costruisci una barca e difendi la provincia con ${n} uomini.`,
                  check: n => `una provincia con una nave e soldati ≥ ${n}` }
            ] },
            // Ciclo II — lo SBARCO resta la mira primaria (regola dell'utente); il
            // raduno a Home Counties gli sta sotto ed è quel che lo rende possibile,
            // non quel che lo sostituisce. La guerra vera comincia comunque al IV:
            // qui l'Inghilterra mette il piede sulla riva, non conquista la Francia.
            { ciclo: 2, epoca: '1100-1199', tema: 'L’impero angioino', voci: [
                { id: 'in2-1', tipo: 'navale', titolo: 'Sbarco in Normandia',
                  tmpl: 'regione', arg: { set: 'NORMANDY_FR', viaSea: true },
                  n: { resistere: 1, avanzare: 2, eccedere: 4, passo: 1 },
                  testo: n => `Sbarca sul continente e conquista ${pl(n, 'una provincia', 'province')} in Francia.`,
                  check: n => `province della costa francese possedute ≥ ${n}` },
                { id: 'in2-2', tipo: 'preparazione', titolo: 'La chiamata del Papa',
                  tmpl: 'provincia', arg: { id: 'Home_Counties' },
                  n: { resistere: 6, avanzare: 10, eccedere: 14, passo: 2 },
                  testo: n => `Raduna ${n} uomini a Home Counties, pronti a salpare per la crociata.`,
                  check: n => `soldati a Home Counties ≥ ${n}` },
                { id: 'in2-3', tipo: 'economia', titolo: 'Le strade della corona',
                  tmpl: 'collegate', arg: {},
                  n: { resistere: 4, avanzare: 6, eccedere: 8, passo: 1 },
                  testo: n => `Collega alla Capitale almeno ${n} province con strade.`,
                  check: n => `province collegate ≥ ${n}` }
            ] },
            // Ciclo III — non si conquista niente di nuovo: si TIENE quel che si
            // è preso, e si tiene in due posti precisi (le Fiandre e una terra di
            // Francia), perché una testa di ponte sola è una testa di ponte persa.
            { ciclo: 3, epoca: '1200-1299', tema: 'Le teste di ponte', voci: [
                { id: 'in3-1', tipo: 'espansione', titolo: 'Fiandre e Francia',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'provincia', arg: { id: 'Flanders' } },
                      altri: [{ tmpl: 'regioneGuarnigione', arg: { set: 'FRANCIA' }, soglia: 5 }]
                  },
                  n: { resistere: 4, avanzare: 8, eccedere: 12, passo: 2 },
                  testo: n => `Tieni le Fiandre con ${n} uomini e una provincia di Francia con almeno 5.`,
                  check: n => `Flanders con soldati ≥ ${n} e una provincia francese con soldati ≥ 5` },
                { id: 'in3-2', tipo: 'espansione', titolo: 'L’isola alle spalle',
                  tmpl: 'regione', arg: { set: 'BRITISH' },
                  n: { resistere: 6, avanzare: 8, eccedere: 10, passo: 1 },
                  testo: n => `Non lasciare sguarnita l’isola: possiedi ${n} province britanniche.`,
                  check: n => `province britanniche possedute ≥ ${n}` },
                { id: 'in3-3', tipo: 'crescita', titolo: 'Governare, non solo tenere',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` }
            ] },
            // Ciclo IV — i Cent'Anni: qui comincia la guerra vera, e la posta è
            // l'Aquitania. Prenderla non basta: va difesa, se no il capitolo si
            // chiude aperto com'era.
            { ciclo: 4, epoca: '1300-1399', tema: 'I Cent’Anni', voci: [
                { id: 'in4-1', tipo: 'espansione', titolo: 'L’Aquitania',
                  tmpl: 'provincia', arg: { id: 'Aquitaine' },
                  n: { resistere: 4, avanzare: 8, eccedere: 12, passo: 2 },
                  testo: n => `Conquista l’Aquitania e difendila con ${n} uomini.`,
                  check: n => `possiedi Aquitaine con soldati ≥ ${n}` },
                { id: 'in4-2', tipo: 'espansione', titolo: 'Le terre di Francia',
                  tmpl: 'regione', arg: { set: 'FRANCIA' },
                  n: { resistere: 1, avanzare: 2, eccedere: 4, passo: 1 },
                  testo: n => `Tieni ${pl(n, 'una provincia', 'province')} sul continente francese.`,
                  check: n => `province francesi possedute ≥ ${n}` },
                { id: 'in4-3', tipo: 'espansione', titolo: 'L’esercito in campo',
                  tmpl: 'guarnigioni', arg: { soglia: 5 },
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Tieni ${n} province difese con almeno 5 uomini ciascuna.`,
                  check: n => `${n} province con soldati ≥ 5 ciascuna` }
            ] },
            // Ciclo V — l'Irlanda intera, e una Città a tenerla. È il capitolo
            // più caro del binario ed è voluto (regola dell'utente): prenderla
            // tutta costa l'esercito che sta in Francia, quindi è QUI che
            // l'Inghilterra molla il continente. Il legno serve al capitolo dopo:
            // un Veliero ne vuole 10 (GameRules.COSTS.vascello).
            { ciclo: 5, epoca: '1400-1499', tema: 'L’Irlanda', voci: [
                { id: 'in5-1', tipo: 'espansione', titolo: 'Conquistare l’Irlanda',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'IRELAND' } },
                      altri: [{ tmpl: 'cittaRegione', arg: { set: 'IRELAND' }, soglia: 0 }]
                  },
                  n: { resistere: 2, avanzare: 4, eccedere: 4, passo: 1 },
                  testo: n => `Conquista ${n} delle 4 province irlandesi e costruisci una Città in Irlanda.`,
                  check: n => `province irlandesi possedute ≥ ${n} e una Città in Irlanda` },
                { id: 'in5-2', tipo: 'economia', titolo: 'Il legname per la flotta',
                  tmpl: 'scorte', arg: { res: 'legno' },
                  n: { resistere: 6, avanzare: 10, eccedere: 14, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di legno.`,
                  check: n => `scorte di legno ≥ ${n}` },
                // Qui c'era «possiedi 9 province britanniche», che a un regno
                // arrivato al capitolo V era già in tasca da venti turni (regola
                // dell'utente): un Terziario non deve essere un obiettivo vecchio
                // rifatto. Il Benessere invece si perde davvero mentre si
                // conquista — l'esercito che sbarca in Irlanda è quello che non
                // sta costruendo strade.
                { id: 'in5-3', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] },
            // Ciclo VI — il Veliero, entro la fine del secolo. È l'unica chiglia
            // che attraversi un oceano (§9.2): senza, i due capitoli successivi
            // non esistono.
            { ciclo: 6, epoca: '1500-1599', tema: 'La flotta dei Tudor', voci: [
                { id: 'in6-1', tipo: 'navale', titolo: 'Il Veliero',
                  tmpl: 'naviTipo', arg: { tipo: 'vascello' },
                  n: { resistere: 1, avanzare: 1, eccedere: 2, passo: 1 },
                  testo: n => n > 1 ? `Vara ${n} Velieri entro la fine del secolo.`
                                    : 'Costruisci un Veliero entro la fine del secolo.',
                  check: n => `Velieri posseduti ≥ ${n}` },
                { id: 'in6-2', tipo: 'economia', titolo: 'Il tesoro dell’ammiragliato',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1000, avanzare: 2000, eccedere: 3500, passo: 500 },
                  testo: n => `Conserva ${n} monete d’oro per la flotta.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'in6-3', tipo: 'navale', titolo: 'Il porto difeso',
                  tmpl: 'naveGuarnigione', arg: {},
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 1 },
                  testo: n => `Difendi con ${n} uomini la provincia dove è ancorata una nave.`,
                  check: n => `una provincia con una nave e soldati ≥ ${n}` }
            ] },
            // Ciclo VII — il Nuovo Mondo. La rotta lunga porta il Veliero oltre
            // l'Atlantico (§9.2) e la storia si chiude solo quando su quella
            // costa nasce una Città: sbarcare è arrivare, fondare è restare.
            { ciclo: 7, epoca: '1600-1699', tema: 'Il Nuovo Mondo', voci: [
                { id: 'in7-1', tipo: 'crescita', titolo: 'L’insediamento',
                  tmpl: 'cittaRegione', arg: { set: 'AMERICA' },
                  n: { resistere: 0, avanzare: 2, eccedere: 5, passo: 1 },
                  testo: n => n > 0 ? `Fonda una Città nel Nuovo Mondo e difendila con ${n} uomini.`
                                    : 'Fonda una Città nel Nuovo Mondo.',
                  check: n => n > 0 ? `una Città in America con soldati ≥ ${n}` : 'una Città in America' },
                { id: 'in7-2', tipo: 'navale', titolo: 'Le colonie',
                  tmpl: 'regione', arg: { set: 'AMERICA', viaSea: true },
                  n: { resistere: 1, avanzare: 2, eccedere: 4, passo: 1 },
                  testo: n => `Sbarca in America e possiedi ${pl(n, 'una provincia', 'province')}.`,
                  check: n => `province americane possedute ≥ ${n}` },
                { id: 'in7-3', tipo: 'economia', titolo: 'Il denaro della compagnia',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 800, avanzare: 1500, eccedere: 2500, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo VIII — a oriente: l'India, o le coste d'Africa lungo la sua
            // rotta. Quale delle due lo decide il mare, non il capitolo.
            { ciclo: 8, epoca: '1700-1799', tema: 'Le Indie', voci: [
                { id: 'in8-1', tipo: 'navale', titolo: 'La rotta d’Oriente',
                  tmpl: 'regione', arg: { set: 'INDIE', viaSea: true },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Manda il Veliero a oriente: conquista ${pl(n, 'una provincia', 'province')} fra India e coste d’Africa.`,
                  check: n => `province in India o sulle coste africane ≥ ${n}` },
                { id: 'in8-2', tipo: 'navale', titolo: 'La flotta d’altura',
                  tmpl: 'naviTipo', arg: { tipo: 'vascello' },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Tieni ${pl(n, 'un Veliero', 'Velieri')} in servizio.`,
                  check: n => `Velieri posseduti ≥ ${n}` },
                { id: 'in8-3', tipo: 'crescita', titolo: 'Le spezie sulle tavole',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] }
        ],
        'Sacro Romano Impero': [
            { ciclo: 1, epoca: '1000-1099', tema: 'I ducati', voci: [
                { id: 'sr1', tipo: 'espansione', titolo: 'Consolidare l’Impero',
                  tmpl: 'guarnigioni', arg: { soglia: 4 },
                  n: { resistere: 4, avanzare: 6, eccedere: 8, passo: 1 },
                  testo: n => `Difendi con almeno 4 uomini un minimo di ${n} territori.`,
                  check: n => `${n} province con soldati ≥ 4 ciascuna` },
                { id: 'sr2', tipo: 'economia', titolo: 'Il legname del Reno',
                  tmpl: 'scorte', arg: { res: 'legno' },
                  n: { resistere: 5, avanzare: 8, eccedere: 12, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di legno.`,
                  check: n => `scorte di legno ≥ ${n}` },
                { id: 'sr3', tipo: 'espansione', titolo: 'Il valico del Tirolo',
                  tmpl: 'provincia', arg: { id: 'Tyrol' },
                  n: { resistere: 0, avanzare: 0, eccedere: 2, passo: 0 },
                  testo: n => n > 0 ? `Conquista Tyrol e difendila con ${n} uomini.`
                                    : 'Conquista e difendi la regione Tyrol.',
                  check: n => n > 0 ? `possiedi Tyrol con soldati ≥ ${n}` : 'possiedi Tyrol' }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'Le città imperiali', voci: [
                { id: 'sr2-1', tipo: 'crescita', titolo: 'La città imperiale',
                  tmpl: 'citta', arg: {},
                  n: { resistere: 4, avanzare: 6, eccedere: 8, passo: 1 },
                  testo: n => `Costruisci una Città e difendila con ${n} uomini.`,
                  check: n => `una Città con soldati ≥ ${n}` },
                { id: 'sr2-2', tipo: 'preparazione', titolo: 'La chiamata del Papa',
                  tmpl: 'provincia', arg: { id: 'Bavaria' },
                  n: { resistere: 6, avanzare: 10, eccedere: 14, passo: 2 },
                  testo: n => `Raduna ${n} uomini in Bavaria, pronti a marciare verso sud.`,
                  check: n => `soldati in Bavaria ≥ ${n}` },
                { id: 'sr2-3', tipo: 'economia', titolo: 'Le cave imperiali',
                  tmpl: 'scorte', arg: { res: 'pietra' },
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di pietra.`,
                  check: n => `scorte di pietra ≥ ${n}` }
            ] }
        ],
        'Ducato di Polonia': [
            { ciclo: 1, epoca: '1000-1099', tema: 'Sbocco al mare', voci: [
                { id: 'po1', tipo: 'espansione', titolo: 'Sbocco al mare',
                  tmpl: 'guarnigioniCostiere', arg: { soglia: 4 },
                  n: { resistere: 2, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Conquista ${n} province che sboccano sul mare e difendile con almeno 4 uomini ciascuna.`,
                  check: n => `${n} province costiere con soldati ≥ 4 ciascuna` },
                { id: 'po2', tipo: 'economia', titolo: 'Il mercato e le mandrie',
                  tmpl: 'tutti', arg: { capo: { tmpl: 'scorte', arg: { res: 'bestiame' } },
                                        altri: [{ tmpl: 'mercato', arg: {}, soglia: 1 }] },
                  n: { resistere: 2, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `Costruisci un Mercato e immagazzina ${n} scorte di bestiame.`,
                  check: n => `un Mercato e scorte di bestiame ≥ ${n}` },
                { id: 'po3', tipo: 'economia', titolo: 'Le vie del regno',
                  tmpl: 'tipiCollegati', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Collega alla Capitale almeno ${n} tipi di risorse diverse.`,
                  check: n => `tipi di risorsa collegati ≥ ${n}` }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'La flotta baltica', voci: [
                { id: 'po2-1', tipo: 'navale', titolo: 'La flotta del Baltico',
                  tmpl: 'navi', arg: {},
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Costruisci ${n} navi per dominare il Baltico.`,
                  check: n => `navi ≥ ${n}` },
                { id: 'po2-2', tipo: 'economia', titolo: 'Le vie del regno',
                  tmpl: 'tipiCollegati', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Collega alla Capitale almeno ${n} tipi di risorse diverse.`,
                  check: n => `tipi di risorsa collegati ≥ ${n}` },
                { id: 'po2-3', tipo: 'economia', titolo: 'Le foreste polacche',
                  tmpl: 'scorte', arg: { res: 'legno' },
                  n: { resistere: 5, avanzare: 8, eccedere: 12, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di legno.`,
                  check: n => `scorte di legno ≥ ${n}` }
            ] }
        ],
        'Kievan Ru\'s': [
            { ciclo: 1, epoca: '1000-1099', tema: 'Le terre della Rus’', voci: [
                { id: 'ru1', tipo: 'espansione', titolo: 'Le terre della Rus’',
                  tmpl: 'provCount', arg: {},
                  n: { resistere: 6, avanzare: 9, eccedere: 12, passo: 1 },
                  testo: n => `Conquista ${n} territori.`,
                  check: n => `province ≥ ${n}` },
                { id: 'ru2', tipo: 'economia', titolo: 'Le strade dei fiumi',
                  tmpl: 'tutti', arg: { capo: { tmpl: 'collegate', arg: {} },
                                        altri: [{ tmpl: 'tipiCollegati', arg: {}, soglia: 2 }] },
                  n: { resistere: 4, avanzare: 6, eccedere: 8, passo: 1 },
                  testo: n => `Collega con strade almeno ${n} territori e 2 risorse.`,
                  check: n => `≥ ${n} province collegate e ≥ 2 tipi di risorsa` },
                { id: 'ru3', tipo: 'economia', titolo: 'Le pellicce della steppa',
                  tmpl: 'scorte', arg: { res: 'bestiame' },
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di bestiame.`,
                  check: n => `scorte di bestiame ≥ ${n}` }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'Kiev di pietra', voci: [
                { id: 'ru2-1', tipo: 'crescita', titolo: 'Le mura di pietra',
                  tmpl: 'citta', arg: { at: 'Kiev' },
                  n: { resistere: 4, avanzare: 6, eccedere: 8, passo: 1 },
                  testo: n => `Costruisci una Città nella provincia di Kiev e difendila con ${n} uomini.`,
                  check: n => `una Città a Kiev con soldati a Kiev ≥ ${n}` },
                { id: 'ru2-2', tipo: 'espansione', titolo: 'Le terre della Rus’',
                  tmpl: 'provCount', arg: {},
                  n: { resistere: 10, avanzare: 13, eccedere: 16, passo: 1 },
                  testo: n => `Espandi il regno a ${n} province.`,
                  check: n => `province ≥ ${n}` },
                { id: 'ru2-3', tipo: 'preparazione', titolo: 'Sentinella d’Oriente',
                  tmpl: 'provincia', arg: { id: 'Tartaria' },
                  n: { resistere: 5, avanzare: 8, eccedere: 11, passo: 2 },
                  testo: n => `Raduna ${n} uomini a Tartaria per difendere i confini a oriente.`,
                  check: n => `soldati a Tartaria ≥ ${n}` }
            ] }
        ],
        'Ducato di Ungheria': [
            { ciclo: 1, epoca: '1000-1099', tema: 'Il regno prospero', voci: [
                { id: 'un1', tipo: 'crescita', titolo: 'Il regno prospero',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 5, passo: 1 },
                  testo: n => `Ottieni una Sicurezza di livello ${n} entro la fine del ciclo.`,
                  check: n => `Sicurezza (§8) ≥ ${n}` },
                { id: 'un2', tipo: 'espansione', titolo: 'Verso l’Adriatico',
                  tmpl: 'regione', arg: { set: 'ADRIATIC' },
                  n: { resistere: 1, avanzare: 1, eccedere: 2, passo: 1 },
                  testo: n => n > 1 ? `Conquista e difendi ${n} province adriatiche.`
                                    : 'Conquista e difendi l’accesso al Mar Mediterraneo.',
                  check: n => `province adriatiche (Croatia/Dalmatia/Istria) ≥ ${n}` },
                { id: 'un3', tipo: 'economia', titolo: 'Il mercato di Buda',
                  tmpl: 'mercato', arg: {},
                  n: { resistere: 1, avanzare: 1, eccedere: 1, passo: 0 },
                  testo: () => 'Costruisci un Mercato.',
                  check: () => 'possiedi un Mercato' }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'L’Adriatico', voci: [
                { id: 'un2-1', tipo: 'espansione', titolo: 'Il dominio adriatico',
                  tmpl: 'province', arg: { ids: ['Croatia', 'Dalmatia', 'Istria'] },
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Conquista e tieni tutte e 3 le province adriatiche (Croatia, Dalmatia, Istria) e difendile con ${n} uomini ciascuna.`,
                  check: n => `le 3 province adriatiche, soldati ≥ ${n} ciascuna` },
                { id: 'un2-2', tipo: 'crescita', titolo: 'La città di Buda',
                  tmpl: 'citta', arg: {},
                  n: { resistere: 0, avanzare: 0, eccedere: 3, passo: 0 },
                  testo: n => n > 0 ? `Costruisci una Città e difendila con ${n} uomini.`
                                    : 'Costruisci una Città nel tuo regno.',
                  check: n => n > 0 ? `una Città con soldati ≥ ${n}` : 'possiedi una Città' },
                { id: 'un2-3', tipo: 'economia', titolo: 'Le cave della Pannonia',
                  tmpl: 'scorte', arg: { res: 'argilla' },
                  n: { resistere: 5, avanzare: 8, eccedere: 12, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di argilla.`,
                  check: n => `scorte di argilla ≥ ${n}` }
            ] }
        ],
        'Impero Bizantino': [
            { ciclo: 1, epoca: '1000-1099', tema: 'La riconquista balcanica', voci: [
                { id: 'bi1', tipo: 'espansione', titolo: 'La riconquista balcanica',
                  tmpl: 'province', arg: { ids: ['Macedonia', 'Bulgaria'] },
                  n: { resistere: 0, avanzare: 0, eccedere: 3, passo: 0 },
                  testo: n => n > 0 ? `Conquista Macedonia e Bulgaria e difendile con ${n} uomini ciascuna.`
                                    : 'Conquista e difendi Macedonia e Bulgaria.',
                  check: n => n > 0 ? `Macedonia e Bulgaria, soldati ≥ ${n} ciascuna` : 'possiedi Macedonia e Bulgaria' },
                { id: 'bi2', tipo: 'preparazione', titolo: 'L’appello di Alessio I',
                  tmpl: 'provincia', arg: { id: 'Eastern_Thrace' },
                  n: { resistere: 5, avanzare: 8, eccedere: 11, passo: 2 },
                  testo: n => `Raggruppa ${n} uomini in Eastern Thrace per la crociata.`,
                  check: n => `soldati in Eastern Thrace ≥ ${n}` },
                { id: 'bi3', tipo: 'economia', titolo: 'Le vie dell’impero',
                  tmpl: 'collegate', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `Collega almeno ${n} province alla Capitale con strade.`,
                  check: n => `province collegate ≥ ${n}` }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'I Comneni', voci: [
                { id: 'bi2-1', tipo: 'espansione', titolo: 'La riconquista della Grecia',
                  tmpl: 'regione', arg: { set: 'GREECE' },
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Completa la conquista della Grecia: possiedi ${n} delle 7 province greche.`,
                  check: n => `province greche possedute ≥ ${n} (su 7)` },
                { id: 'bi2-2', tipo: 'espansione', titolo: 'La guardia di Gerusalemme',
                  tmpl: 'provincia', arg: { id: 'Palestine' },
                  n: { resistere: 3, avanzare: 5, eccedere: 8, passo: 1 },
                  testo: n => `Difendi l’avamposto di Palestina in Terra Santa con almeno ${n} armate.`,
                  check: n => `possiedi Palestine con soldati ≥ ${n}` },
                { id: 'bi2-3', tipo: 'economia', titolo: 'Il tesoro di Costantinopoli',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 700, avanzare: 1200, eccedere: 1800, passo: 200 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] }
        ],
        'Califfato Abbaside': [
            { ciclo: 1, epoca: '1000-1099', tema: 'Sbocco sul Mediterraneo', voci: [
                { id: 'ab1', tipo: 'espansione', titolo: 'Sbocco sul Mediterraneo',
                  tmpl: 'provincia', arg: { id: 'Syria' },
                  n: { resistere: 3, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Conquista e difendi con almeno ${n} armate la provincia di Syria.`,
                  check: n => `possiedi Syria con soldati ≥ ${n}` },
                { id: 'ab2', tipo: 'economia', titolo: 'Il tesoro del bazar',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 600, avanzare: 1000, eccedere: 1500, passo: 200 },
                  testo: n => `Immagazzina ${n} monete.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'ab3', tipo: 'espansione', titolo: 'Rafforzare il Califfato',
                  tmpl: 'guarnigioni', arg: { soglia: 2 },
                  n: { resistere: 5, avanzare: 7, eccedere: 10, passo: 1 },
                  testo: n => `Conquista e difendi ${n} province con almeno 2 uomini ciascuna.`,
                  check: n => `${n} province con soldati ≥ 2 ciascuna` }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'La Terra Santa', voci: [
                { id: 'ab2-1', tipo: 'espansione', titolo: 'Riconquista la Terra Santa',
                  tmpl: 'regione', arg: { set: 'HOLY_LAND' },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Riconquista le province cristiane in Terra Santa: possiedi ${n} fra Palestina, Aleppo, Libano e Siria.`,
                  check: n => `province di Terra Santa possedute ≥ ${n}` },
                { id: 'ab2-2', tipo: 'preparazione', titolo: 'Le sentinelle d’Oriente',
                  tmpl: 'province', arg: { ids: ['Isfahan', 'Irakajemi'] },
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Conquista e difendi le province di Isfahan e Irakajemi con almeno ${n} uomini l’una.`,
                  check: n => `Isfahan e Irakajemi, soldati ≥ ${n} ciascuna` },
                { id: 'ab2-3', tipo: 'crescita', titolo: 'Lo splendore Abbaside',
                  tmpl: 'tutti', arg: { capo: { tmpl: 'tipiCollegati', arg: {} },
                                        altri: [{ tmpl: 'citta', arg: { connected: true }, soglia: 0 }] },
                  n: { resistere: 1, avanzare: 1, eccedere: 2, passo: 1 },
                  testo: n => `Costruisci una Città e collegala a ${pl(n, 'una risorsa', 'tipi di risorsa')}.`,
                  check: n => `una Città collegata alla rete e tipi di risorsa collegati ≥ ${n}` }
            ] }
        ]
    };

    // ------------------------------------------------------------------------
    //  Il motore: dal binario all'assegnazione, dall'assegnazione alla spunta.
    // ------------------------------------------------------------------------

    // I tre gradini di un capitolo. Somma 10: è il tetto del ciclo (§10).
    const TIERS = [
        { tier: 'Primario', punti: 5 },
        { tier: 'Secondario', punti: 3 },
        { tier: 'Terziario', punti: 2 }
    ];
    const INTENSITA = ['resistere', 'avanzare', 'eccedere'];

    // Il FRENO: il capitolo non può superare il ciclo di più di due, altrimenti
    // un regno fortunato finirebbe il millennio al turno trenta.
    const FRENO = 2;
    // Sotto queste province il regno è in ginocchio: il capitolo ARRETRA.
    const CROLLO_PROV = 2;
    // Quanto il ritmo del ciclo scorso pesa sul passo, per gradino: al Primario
    // si chiede di fare MEGLIO, al Secondario di ripetersi, al Terziario di non
    // peggiorare.
    const K_TIER = { Primario: 1.2, Secondario: 1.0, Terziario: 0.5 };
    const RITMO_MIN = 0.5, RITMO_MAX = 2;
    // I template che si RATCHETTANO per intero: quel che si conquista o si
    // costruisce non si perde spendendolo, quindi la soglia parte da dove sei
    // PIÙ un passo. Gli altri — oro, scorte, Popolarità, Sicurezza — sono
    // livelli da TENERE, non da superare: lì la soglia arriva a dove sei e si
    // ferma, se no un tesoro chiederebbe di non spendere mai e una scorta di
    // non costruire mai. (La banda dell'autore fa comunque da tetto a entrambi.)
    const CRESCITA = new Set(['regione', 'regioneGuarnigione', 'province', 'provincia',
        'provCount', 'guarnigioni', 'guarnigioniCostiere', 'strade', 'collegate',
        'tipiCollegati', 'mercato', 'citta', 'cittaRegione', 'navi', 'naviTipo',
        'naveGuarnigione']);
    // Un combinato eredita la natura della sua parte scalabile.
    function cresce(tmpl, arg) {
        if (tmpl === 'tutti') return cresce(arg.capo.tmpl, arg.capo.arg || {});
        return CRESCITA.has(tmpl);
    }

    function cycleOfTurn(turn) { return Math.floor((Math.max(1, turn | 0) - 1) / 10) + 1; }

    // Quanti capitoli ha il binario di un regno (0 = regno senza binario).
    function chapterCount(name) { return (BINARI[name] || []).length; }

    // La soglia di una voce. Senza `misura` (generatore spento) è l'ancora nuda
    // dell'intensità, cioè il numero scritto a mano sul foglio. Con la misura si
    // CALIBRA, e sono tre vincoli insieme:
    //   · mai sotto l'ancora dell'intensità — è il minimo che l'autore chiede;
    //   · mai già completata alla nascita, per quel che si conquista e si
    //     costruisce (`misura + passo`); un livello da TENERE arriva invece a
    //     dove sei e si ferma;
    //   · sempre dentro la BANDA fra `resistere` e mezza volta `eccedere`, e mai
    //     oltre il TETTO naturale del template — una regione di 13 province non
    //     può chiederne 15, e la Popolarità si ferma a 5. Senza, il ratchet di un
    //     regno che possiede già tutta l'Iberia generava un obiettivo impossibile.
    // Il passo si allunga o si accorcia col RITMO del ciclo scorso e col
    // gradino: al Primario si chiede di fare meglio, al Terziario di reggere.
    function soglia(voce, intensita, misura, opts) {
        const n = voce.n || {};
        const anc = typeof n[intensita] === 'number' ? n[intensita] : (n.avanzare || 0);
        if (typeof misura !== 'number' || !isFinite(misura)) return anc;
        opts = opts || {};
        const k = K_TIER[opts.tier] || 1;
        const rit = Math.min(RITMO_MAX, Math.max(RITMO_MIN,
            typeof opts.ritmo === 'number' && isFinite(opts.ritmo) ? opts.ritmo : 1));
        const base = typeof n.passo === 'number' ? n.passo : 1;
        const passo = base ? Math.max(1, Math.round(base * k * rit)) : 0;
        const ratchet = cresce(voce.tmpl, voce.arg || {}) ? misura + passo : misura;
        const lo = typeof n.resistere === 'number' ? n.resistere : anc;
        const t = TEMPLATES[voce.tmpl];
        const tetto = t && t.tetto ? t.tetto(voce.arg || {}) : Infinity;
        const hi = Math.max(lo, Math.min(tetto,
            Math.round((typeof n.eccedere === 'number' ? n.eccedere : anc) * 1.5)));
        return Math.min(Math.max(anc, ratchet, lo), hi);
    }

    // Il RITMO del ciclo appena chiuso: quanto il regno è cresciuto, in una
    // cifra sola. 0,5 = fermo o in ritirata, 1 = normale, 2 = corsa. Si legge
    // dalle province perché sono la misura che ogni regno ha (un tesoro può
    // essere zero per scelta, le province no).
    function ritmoDa(profilo, precedente) {
        if (!profilo || !precedente || !precedente.province) return 1;
        const cresc = (profilo.province - precedente.province) / precedente.province;
        if (cresc <= 0) return RITMO_MIN;
        return Math.min(RITMO_MAX, 1 + cresc);
    }

    // IL PUNTATORE. Dato com'è andato il ciclo, dove si trova ora il regno nella
    // sua storia e con che respiro affronta il pezzo successivo. È la regola che
    // rende il sistema quel che è: chi compie il capitolo AVANZA, chi non ce la
    // fa lo RIFÀ in intensità minore (un obiettivo che può fare, non uno più
    // grande che non farà mai), chi crolla ARRETRA. Il numero del ciclo entra
    // solo come freno.
    // L'intensità è una SCALA a tre gradini e si sale o si scende di uno per
    // volta. Con un interruttore acceso/spento il regno oscillava: a resistere
    // riusciva a fare un obiettivo, veniva ripromosso ad avanzare, falliva tutto
    // e ricadeva — avanti e indietro per l'intera partita, senza mai concludere
    // un capitolo. Un gradino per volta invece consolida.
    function giu(i) { return INTENSITA[Math.max(0, INTENSITA.indexOf(i) - 1)] || 'resistere'; }

    // o = { primarioFatto, fatti, intensita, province, provincePrec,
    //       capitalePersa, capitolo, ciclo, capitoli }
    function passo(o) {
        o = o || {};
        const capitoli = Math.max(1, o.capitoli | 0 || 1);
        const cap = Math.max(1, o.capitolo | 0 || 1);
        const ciclo = Math.max(1, o.ciclo | 0 || 1);
        const ora = INTENSITA.indexOf(o.intensita) >= 0 ? o.intensita : 'avanzare';
        const chiudi = (c, intensita, motivo) => ({
            capitolo: Math.min(Math.max(1, c), Math.min(capitoli, ciclo + FRENO)),
            intensita: intensita, motivo: motivo
        });
        // Crollo: il regno è in ginocchio. Si torna al capitolo prima, a
        // resistere — non si pretende che la storia vada avanti da sotto terra.
        if (o.province <= CROLLO_PROV || o.capitalePersa) return chiudi(cap - 1, 'resistere', 'crollo');
        // Capitolo COMPIUTO: si passa al pezzo di storia successivo. Con tutti e
        // tre gli obiettivi in tasca lo si affronta al massimo respiro.
        if (o.primarioFatto) return chiudi(cap + 1, o.fatti >= 3 ? 'eccedere' : 'avanzare',
            o.fatti >= 3 ? 'trionfo' : 'compiuto');
        const perse = typeof o.provincePrec === 'number' && o.province < o.provincePrec;
        // Due obiettivi su tre e il regno non arretra: il capitolo non è compiuto
        // ma il regno lo regge. Si sale di un gradino e ci si riprova.
        if (o.fatti >= 2 && !perse) return chiudi(cap, ora === 'resistere' ? 'avanzare' : ora, 'quasi');
        // Un obiettivo solo: si resta esattamente com'era. Non è un progresso da
        // premiare con soglie più alte, ma nemmeno un fallimento da punire.
        if (o.fatti >= 1 && !perse) return chiudi(cap, ora, 'parziale');
        // Niente fatto, o province perdute: stesso capitolo, un gradino più in
        // basso. È qui che si spezza l'effetto a catena.
        return chiudi(cap, giu(ora), perse ? 'arretrato' : 'fermo');
    }

    // Il capitolo `idx` non ha più niente da dire a questo regno: la sua voce
    // Primaria è già oltre l'ancora più ambiziosa. Serve a far ACCELERARE la
    // storia di chi corre — riceve il pezzo successivo, non lo stesso capitolo
    // con un numero più grande.
    function superato(name, idx, ctx) {
        const cap = chapter(name, idx);
        if (!cap || !ctx) return false;
        const v = cap.voci[0], t = TEMPLATES[v.tmpl];
        const ecc = (v.n || {}).eccedere;
        if (!t || typeof ecc !== 'number') return false;
        try { return (t.misuraCal || t.misura)(ctx, v.arg || {}) >= ecc; } catch (e) { return false; }
    }

    // Il capitolo di un regno, per indice (1-based). Un indice oltre la fine del
    // binario ricade sull'ultimo scritto, così un regno non resta senza
    // obiettivi mentre i capitoli tardi non sono ancora stati scritti.
    function chapter(name, idx) {
        const rail = BINARI[name];
        if (!rail || !rail.length) return null;
        return rail[Math.min(Math.max(1, idx | 0 || 1), rail.length) - 1];
    }

    // Genera l'ASSEGNAZIONE di un ciclo: la forma serializzabile che finisce nel
    // record del giocatore. `opts`: { ciclo, capitolo, intensita, turno, calibra }.
    // `calibra` accende il generatore (soglie sulla misura attuale); spento, le
    // soglie sono le ancore, cioè il catalogo scritto a mano.
    function generate(name, ctx, opts) {
        opts = opts || {};
        const cap = chapter(name, opts.capitolo || opts.ciclo || 1);
        if (!cap) return null;
        const intensita = INTENSITA.indexOf(opts.intensita) >= 0 ? opts.intensita : 'avanzare';
        const items = cap.voci.map((v, i) => {
            const t = TEMPLATES[v.tmpl];
            let mis = null;
            if (opts.calibra && t && ctx) {
                try { mis = (t.misuraCal || t.misura)(ctx, v.arg || {}); } catch (e) { mis = null; }
            }
            const n = soglia(v, intensita, mis, { tier: TIERS[i].tier, ritmo: opts.ritmo });
            return {
                id: v.id, tier: TIERS[i].tier, punti: TIERS[i].punti, tipo: v.tipo,
                tmpl: v.tmpl, arg: v.arg || {}, soglia: n,
                titolo: v.titolo, descrizione: v.testo(n), check: v.check(n),
                base: typeof mis === 'number' && isFinite(mis) ? mis : null
            };
        });
        return {
            ciclo: Math.max(1, opts.ciclo | 0 || 1),
            capitolo: (BINARI[name] || []).indexOf(cap) + 1,
            intensita: intensita, epoca: cap.epoca, tema: cap.tema,
            generatoAl: opts.turno | 0 || 0, items: items
        };
    }

    // Valuta un'assegnazione contro lo stato. Accetta anche la vecchia firma
    // `evaluate(nomeRegno, ctx, ciclo)`: in quel caso l'assegnazione si genera
    // al volo dal binario (è la strada di chi non ne ha ancora una salvata).
    // Torna null se il regno non ha un binario (partita fuori dai 10 regni).
    function evaluate(assegnazione, ctx, cycle) {
        let a = assegnazione;
        if (typeof a === 'string') a = generate(a, ctx, { ciclo: cycle || 1 });
        if (!a || !a.items) return null;
        let punti = 0, puntiMax = 0;
        const items = a.items.map(it => {
            const t = TEMPLATES[it.tmpl];
            let mis = -1;
            try { if (t) mis = t.misura(ctx, it.arg || {}); } catch (e) { mis = -1; }
            const ok = mis >= it.soglia;
            puntiMax += it.punti;
            if (ok) punti += it.punti;
            return {
                id: it.id, tier: it.tier, punti: it.punti, tipo: it.tipo,
                titolo: it.titolo, descrizione: it.descrizione, check: it.check,
                soglia: it.soglia, base: it.base, misura: mis, completato: ok,
                hint: t && t.hint ? t.hint(it.arg || {}, it.soglia) : null
            };
        });
        return {
            ciclo: a.ciclo, capitolo: a.capitolo, intensita: a.intensita,
            epoca: a.epoca, tema: a.tema,
            items: items, punti: punti, puntiMax: puntiMax
        };
    }

    // ------------------------------------------------------------------------
    //  LA LEVA (regola dell'utente): un obiettivo compiuto non paga solo in
    //  prestigio — una promessa lontana, e per giunta oggi sospesa
    //  (GameRules.PRESTIGE_ENABLED) — ma in UOMINI, subito. Chi porta a casa un
    //  obiettivo riceve tanti soldati quanti erano i suoi punti (5 · 3 · 2, cioè
    //  al massimo 10 per ciclo) da schierare dal PRIMO TURNO del ciclo successivo.
    //  È di proposito un handicap, come il punteggio: dieci uomini sono mezzo
    //  ciclo di reclutamento per un regno da sei province e un'inezia per chi ne
    //  ha trenta. Qui sta solo il CONTO (modulo puro); a versare gli uomini è
    //  GameActions.closeCycle, l'unico punto che chiude un ciclo.
    const LEVA_PER_PUNTO = 1;
    function leva(snap) {
        if (!snap || typeof snap.punti !== 'number') return 0;
        return Math.max(0, Math.round(snap.punti * LEVA_PER_PUNTO));
    }

    const api = {
        BINARI, TEMPLATES, SETS, TIERS, INTENSITA, FRENO, CROLLO_PROV, K_TIER,
        LEVA_PER_PUNTO, leva,
        cycleOfTurn, chapter, chapterCount, soglia, ritmoDa, passo, superato,
        generate, evaluate
    };

    root.Objectives = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);

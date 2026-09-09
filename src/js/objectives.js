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
    // Ciclo III bizantino: l'Anatolia asiatica, tutta — 9 province, quel che
    // resta di Bisanzio dopo Manzikert e quel che i Comneni si riprendono.
    const ANATOLIA = new Set(['Trabzon', 'Hudavendigar', 'Aydin', 'Konya', 'Kastamonu',
        'Ankara', 'Erzurum', 'Diyarbakir', 'Adana']);
    // Ciclo III bizantino: oltre la Palestina, verso il deserto e il Libano —
    // la meta SOLO se Bisanzio ha tenuto Gerusalemme (§10, voce condizionale).
    const TRANSGIORDANIA = new Set(['Transjordan', 'Lebanon']);
    // Ciclo IV bizantino: lo sbarco normanno al contrario — Sicilia e Calabria,
    // le due sole terre da prendere via mare.
    const SICILIA_CALABRIA = new Set(['Sicily', 'Calabria']);
    // Ciclo V bizantino: l'Italia meridionale oltre la testa di ponte, se tenuta.
    const ITALIA_SUD = new Set(['Abruzzo', 'Umbria', 'Campania', 'Apulia', 'Calabria']);
    // Ciclo VIII bizantino: le terre che nel Mille erano musulmane e che
    // Bisanzio può realisticamente raggiungere — frontiera anatolica,
    // Mesopotamia, Levante fatimide e la Sicilia degli emiri
    // (data/start_religions.js, non calcolato: sono le stesse eccezioni,
    // lette una volta e fissate qui come per ANDALUS).
    const ISLAM_ORIGINE = new Set(['Sicily', 'Diyarbakir', 'Mosul', 'Deir_Ez_Zor', 'Aleppo',
        'Syria', 'Palestine', 'Lebanon', 'Transjordan', 'Sinai']);
    // Le regioni dei capitoli III-VIII degli altri otto binari (docs/BINARI_STORICI.md,
    // §"Le regioni" — id verificati su data/map_data.js).
    const MAGHREB = new Set(['Inner_Morocco', 'Oran', 'Constantine', 'Tunisia', 'Tripoli']);
    const ITALIA_NORD = new Set(['Piedmont', 'Lombardy', 'Venetia', 'Tuscany', 'Romagna']);
    const GERMANIA = new Set(['Anhalt', 'Saxony', 'Franconia', 'Bavaria', 'Rhineland', 'Hesse', 'Brandenburg']);
    const AUSTRIA_EST = new Set(['Austria', 'Bohemia', 'Moravia', 'Silesia', 'Styria', 'Tyrol']);
    const RENO = new Set(['Rhineland', 'Flanders', 'Picardy']);
    const BALTICO = new Set(['East_Prussia', 'West_Prussia', 'Pomerania', 'Courland']);
    const POLONIA = new Set(['Mazovia', 'Posen', 'Silesia', 'West_Galicia', 'East_Galicia', 'Volhynia']);
    const PANNONIA = new Set(['Central_Hungary', 'Transdanubia', 'West_Slovakia', 'East_Slovakia', 'Slavonia']);
    const BALCANI = new Set(['Serbia', 'Bosnia', 'Bulgaria', 'Macedonia', 'Albania', 'Wallachia', 'Moldavia']);
    const RUS_NORD = new Set(['Novgorod', 'Moscow', 'Tver', 'Pskov', 'Smolensk', 'Ryazan']);
    const EST_RUSSO = new Set(['Kazan', 'Astrakhan', 'Ural', 'Uralsk', 'Perm', 'Tartaria']);
    // La Siberia (Kievan Rus', capitolo VII): non è nel foglio delle regioni
    // originali — la marcia di Yermak, id verificati sulla mappa.
    const SIBERIA = new Set(['Krasnoyarsk', 'Buryatia', 'Irkutsk', 'Tomsk', 'Trans_Baikal',
        'Sakhalin', 'Chukotka', 'Kamchatka', 'Amur']);
    const MESOPOTAMIA = new Set(['Baghdad', 'Basra', 'Mosul']);
    const PERSIA = new Set(['Isfahan', 'Fars', 'Khorasan', 'Persian_Kurdistan', 'Irakajemi', 'Tabriz', 'Urmia']);
    const ARABIA = new Set(['Yemen', 'Oman']);

    const SETS = {
        ANDALUS, IBERIA, BRITISH, MED_FR, ADRIATIC, LEVANT, NORMANDY_FR, GREECE, EGYPT,
        ISLANDS, HOLY_LAND, IRELAND, FRANCIA, AMERICA, INDIE,
        ANATOLIA, TRANSGIORDANIA, SICILIA_CALABRIA, ITALIA_SUD, ISLAM_ORIGINE,
        MAGHREB, ITALIA_NORD, GERMANIA, AUSTRIA_EST, RENO, BALTICO, POLONIA, PANNONIA,
        BALCANI, RUS_NORD, EST_RUSSO, SIBERIA, MESOPOTAMIA, PERSIA, ARABIA
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
        // n province DI UNA REGIONE con almeno `arg.soglia` uomini ciascuna: il
        // gemello regionale di `guarnigioni`, per un "tieni N terre di un pezzo
        // di mondo, e tienile ARMATE" (l'Anatolia bizantina, non una guarnigione
        // qualunque sparsa nel regno).
        regioneGuarnigioni: {
            misura: (c, a) => c.ownedIds().filter(id => SETS[a.set].has(id) && c.soldiersOn(id) >= a.soglia).length,
            tetto: a => SETS[a.set].size,
            hint: (a, n) => ({ region: SETS[a.set], min: n, garrison: a.soglia })
        },
        // Il MINIMO di soldati fra le proprie province DI CONFINE — quelle che
        // toccano via terra un altro REGNO (regola dell'utente: solo i nemici,
        // NON le terre di nessuno). L'insieme non è un elenco fisso: si
        // ricalcola a ogni lettura sul confine VERO del momento (ctx.borderIds,
        // app.js), quindi un fronte che avanza o arretra sposta da sé quel che
        // l'obiettivo sorveglia. Senza confini con un nemico (un regno isolato,
        // o circondato solo da neutrali) non c'è niente da presidiare e la
        // misura torna Infinity: già fatto.
        guarnigioniConfine: {
            misura: c => {
                const b = c.borderIds();
                if (!b.length) return Infinity;
                return b.reduce((m, id) => Math.min(m, c.soldiersOn(id)), Infinity);
            },
            hint: (a, n) => ({ borderGarrison: n })
        },
        oro: { misura: c => c.monete, hint: (a, n) => ({ gold: n }) },
        scorte: { misura: (c, a) => c.scorteOf(a.res), hint: (a, n) => ({ stock: a.res, min: n }) },
        strade: { misura: c => c.roadCount(), hint: (a, n) => ({ roads: n }) },
        collegate: { misura: c => c.connectedCount(), hint: (a, n) => ({ connected: n }) },
        tipiCollegati: { misura: c => c.connectedTypes(), hint: (a, n) => ({ connectedTypes: n }) },
        mercato: { misura: c => c.hasMercato() ? 1 : 0, hint: () => ({ mercato: true }) },
        // Possiedi una Fortezza (§6): booleano come `mercato`. Serve agli ultimi
        // capitoli di un binario che finisce sotto assedio — Polonia VIII,
        // Ungheria VI — dove il punto non è ESPANDERSI ma reggere l'urto.
        fortezza: { misura: c => c.hasFortress() ? 1 : 0, hint: () => ({ fortress: true }) },
        // Presidia la CAPITALE, dovunque sia ADESSO: il gemello di `provincia`
        // per un obiettivo che non può nominare una provincia fissa, perché la
        // Capitale si costruisce, si sposta e si conquista (§Capitale). Misura
        // -1 se il regno non ne ha una — non è "già fatto", è "non c'è nemmeno
        // il posto".
        capitale: {
            misura: c => { const id = c.capitalId(); return id ? c.soldiersOn(id) : -1; },
            hint: (a, n) => ({ capital: true, min: n })
        },
        // CONVERTI <REGIONE> (vocabolario di docs/BINARI_STORICI.md): quante
        // province della regione sono già della TUA famiglia di fede di stato.
        // È il rovescio di ANDALUS/ISLAM_ORIGINE — lì si conta chi è rimasto
        // dell'altra fede, qui chi è già arrivato alla propria (per conquista o
        // per scisma: `isOwnFaith` non guarda la fede di PARTENZA, guarda quella
        // di ADESSO).
        fede: {
            misura: (c, a) => c.ownedIds().filter(id => SETS[a.set].has(id) && c.isOwnFaith(id)).length,
            tetto: a => SETS[a.set].size,
            hint: (a, n) => ({ region: SETS[a.set], min: n, ownFaith: true })
        },
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
        // Quante CITTÀ in tutto il regno. Non è `citta`, che ne chiede UNA e la
        // sua guarnigione: qui conta il NUMERO, ed è la misura che distingue un
        // impero da un regno. Una Città costa 1000 monete più pietra, argilla e
        // bestiame (COSTS.citta), quindi tre o quattro insieme sono un traguardo
        // che i primi cicli non possono raggiungere — è per questo che i
        // capitoli tardi ci poggiano sopra (vedi LA SCALA DELL'AMBIZIONE).
        cittaCount: {
            misura: c => c.cityCount(),
            hint: (a, n) => ({ cityCount: n })
        },
        // Quante Città dentro una REGIONE: «fonda 2 Città nel Nuovo Mondo». Il
        // gemello di `cittaRegione` (che ne chiede una sola, con la guarnigione)
        // per i capitoli in cui il punto è quante se ne piantano, non quanto si
        // difende quella che c'è.
        cittaRegioneCount: {
            misura: (c, a) => c.cityIds().filter(id => SETS[a.set].has(id)).length,
            tetto: a => SETS[a.set].size,
            hint: (a, n) => ({ cityCount: n, region: SETS[a.set] })
        },
        // Quante FORTEZZE (§6: 2000 monete e sei risorse diverse). `fortezza` è
        // il booleano "ne hai una"; questo conta, per i capitoli d'impero.
        fortezze: {
            misura: c => c.fortressCount(),
            hint: (a, n) => ({ fortressCount: n })
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
    //
    //  LA SCALA DELL'AMBIZIONE (regola dell'utente). Un capitolo tardo non può
    //  chiedere una cosa che era già fattibile nei primi cicli: al ciclo 6 o 7
    //  un regno ha venti province, migliaia di monete e una flotta, e sentirsi
    //  chiedere «prendi 2 province del Maghreb» — che poteva fare al ciclo 2 —
    //  non è un obiettivo, è già fatto. La regola per chi scrive un capitolo:
    //    I-II    la propria terra: 1-3 province vicine, il primo Mercato, la
    //            prima Città, le prime strade.
    //    III-IV  la regione confinante, o unificare la propria; guarnigioni
    //            che cominciano a costare (5-6 uomini a provincia).
    //    V       un TEATRO INTERO: tutta una regione, non una parte.
    //    VI      il primo CANCELLO DI SPESA — quel che i primi cicli non
    //            potevano permettersi: il Veliero (4000 monete, §9.2), la
    //            Fortezza (2000 più sei risorse), la seconda o terza Città.
    //    VII-VIII quel che può fare solo un IMPERO: teatri lontani raggiunti
    //            per mare, PIÙ Città o Fortezze insieme, tesori da migliaia,
    //            e una scala che nessun regno piccolo tocca.
    //  Il modo concreto di rispettare la scala è il combinato `tutti`: al ciclo
    //  7 non si chiede «una regione», si chiede «quella regione E una Città
    //  dentro» — la conquista da sola non basta più, bisogna anche restarci.
    //  I template che contano gli insediamenti (`cittaCount`,
    //  `cittaRegioneCount`, `fortezze`) esistono per questo.
    //
    //  QUEL CHE UN CAPITOLO NON PUÒ DARE PER SCONTATO (regola dell'utente): un
    //  EVENTO. L'invasione mongola (§Eventi) scatta al turno 21, ma l'Orda deve
    //  attraversare mezzo mondo e non è detto che arrivi in tempo — o che
    //  arrivi affatto, se il posto dove nasce è occupato. Un capitolo che
    //  chiedesse di «fermare l'Orda» sarebbe compiuto o impossibile per ragioni
    //  che non dipendono dal giocatore. Perciò i capitoli difensivi chiedono
    //  quel che il giocatore controlla — presidiare i confini, tenere unito il
    //  regno, erigere una Fortezza — e il testo non nomina mai un invasore che
    //  potrebbe non presentarsi. Lo stesso vale per ogni potenza che il gioco
    //  non mette sulla mappa (Ottomani, Ilkhanato, Timuridi): al più danno il
    //  NOME a un capitolo, mai la sua condizione di vittoria.
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
            ] },
            // Ciclo III — Las Navas de Tolosa (1212) apre al-Andalus: da qui la
            // Reconquista smette di essere un'incursione. Il secondario prepara
            // già la traversata dello Stretto del capitolo dopo — sbarcare in
            // Maghreb vuole una nave, non solo un esercito.
            { ciclo: 3, epoca: '1200-1299', tema: 'Las Navas de Tolosa', voci: [
                { id: 'ca3-1', tipo: 'espansione', titolo: 'Las Navas de Tolosa',
                  tmpl: 'regione', arg: { set: 'ANDALUS' },
                  n: { resistere: 3, avanzare: 5, eccedere: 6, passo: 1 },
                  testo: n => `Las Navas de Tolosa spalanca al-Andalus: possiedi ${n} delle 6 province che nel Mille erano arabe.`,
                  check: n => `province ex-arabe possedute ≥ ${n}` },
                { id: 'ca3-2', tipo: 'navale', titolo: 'La flotta per lo Stretto',
                  tmpl: 'naveGuarnigione', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Prepara la traversata dello Stretto: costruisci una nave e difendi il porto con ${n} uomini.`,
                  check: n => `una provincia con una nave e soldati ≥ ${n}` },
                { id: 'ca3-3', tipo: 'crescita', titolo: 'Il regno che si governa',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` }
            ] },
            // Ciclo IV — lo Stretto: Rio Salado (1340), la Castiglia porta la
            // guerra in Africa. Il secondario prosegue il lavoro di fondo su
            // tutta la penisola, che al ciclo V diventa la mira primaria.
            { ciclo: 4, epoca: '1300-1399', tema: 'Lo Stretto', voci: [
                // Ordine dell'xlsx: consolidare la penisola è il Primario, la
                // traversata dello Stretto (Rio Salado) il Secondario.
                { id: 'ca4-1', tipo: 'espansione', titolo: 'La penisola si consolida',
                  tmpl: 'regione', arg: { set: 'IBERIA' },
                  n: { resistere: 8, avanzare: 10, eccedere: 12, passo: 1 },
                  testo: n => `Consolida la penisola: possiedi ${n} delle 13 province iberiche.`,
                  check: n => `province iberiche possedute ≥ ${n}` },
                { id: 'ca4-2', tipo: 'navale', titolo: 'Rio Salado',
                  tmpl: 'regione', arg: { set: 'MAGHREB', viaSea: true },
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Attraversa lo Stretto: sbarca e conquista ${n} province in Maghreb.`,
                  check: n => `province del Maghreb possedute ≥ ${n}` },
                { id: 'ca4-3', tipo: 'economia', titolo: 'Il tesoro della guerra',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1000, avanzare: 1600, eccedere: 2400, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo V — Granada cade (1492) e comincia l'Atlantico: la Reconquista
            // si compie proprio mentre parte la storia dopo. Il legno chiesto al
            // Secondario è quello del Veliero (`COSTS.vascello`: 10 legno) — il
            // capitolo dopo.
            { ciclo: 5, epoca: '1400-1499', tema: 'Granada e l’Atlantico', voci: [
                { id: 'ca5-1', tipo: 'espansione', titolo: 'Granada cade',
                  tmpl: 'regione', arg: { set: 'IBERIA' },
                  n: { resistere: 9, avanzare: 11, eccedere: 13, passo: 1 },
                  testo: n => `Unifica la penisola: possiedi ${n} delle 13 province iberiche.`,
                  check: n => `province iberiche possedute ≥ ${n}` },
                { id: 'ca5-2', tipo: 'economia', titolo: 'Il legname delle caravelle',
                  tmpl: 'scorte', arg: { res: 'legno' },
                  n: { resistere: 6, avanzare: 10, eccedere: 14, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di legno.`,
                  check: n => `scorte di legno ≥ ${n}` },
                { id: 'ca5-3', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] },
            // Ciclo VI — l'impero dove non tramonta il sole: il Veliero E
            // l'approdo insieme (`tutti`), perché la spedizione non è la nave in
            // mare, è dove scende.
            { ciclo: 6, epoca: '1500-1599', tema: 'L’impero dove non tramonta il sole', voci: [
                { id: 'ca6-1', tipo: 'navale', titolo: 'I galeoni della Corona',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'AMERICA', viaSea: true } },
                      altri: [{ tmpl: 'naviTipo', arg: { tipo: 'vascello' }, soglia: 1 }]
                  },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Vara un Veliero e manda la Corona oltreoceano: conquista ${pl(n, 'una provincia', 'province')} nel Nuovo Mondo.`,
                  check: n => `un Veliero posseduto e province nel Nuovo Mondo ≥ ${n}` },
                { id: 'ca6-2', tipo: 'economia', titolo: 'L’oro delle Indie',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1500, avanzare: 2500, eccedere: 3800, passo: 400 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'ca6-3', tipo: 'navale', titolo: 'Il porto difeso',
                  tmpl: 'naveGuarnigione', arg: {},
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 1 },
                  testo: n => `Difendi con ${n} uomini la provincia dove è ancorata una nave.`,
                  check: n => `una provincia con una nave e soldati ≥ ${n}` }
            ] },
            // Ciclo VII — l'impero si RADICA: non basta più toccare la costa
            // del Nuovo Mondo (era il VI), bisogna piantarci delle Città
            // (revisione dell'utente). Due Città oltreoceano sono 2000 monete
            // più le risorse, portate dove il Veliero le ha scaricate: è la
            // definizione di un obiettivo che al ciclo 2 non esisteva.
            { ciclo: 7, epoca: '1600-1699', tema: 'Difendere l’impero', voci: [
                { id: 'ca7-1', tipo: 'crescita', titolo: 'Le città del Nuovo Mondo',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'cittaRegioneCount', arg: { set: 'AMERICA' } },
                      altri: [{ tmpl: 'naviTipo', arg: { tipo: 'vascello' }, soglia: 1 }]
                  },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Fonda ${n} Città nel Nuovo Mondo.`,
                  check: n => `Città in America ≥ ${n} e almeno un Veliero` },
                { id: 'ca7-2', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 4, avanzare: 5, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` },
                { id: 'ca7-3', tipo: 'economia', titolo: 'Le casse della Corona',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 2000, avanzare: 3200, eccedere: 4800, passo: 500 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo VIII — le riforme borboniche: si governa un impero, e la
            // misura di un impero sono le sue Città. Prima qui c'erano tre voci
            // di governo (Popolarità, Benessere, risorse collegate) e nessuna
            // che chiedesse una scala: un regno da quattro province le poteva
            // compiere tutte e tre.
            { ciclo: 8, epoca: '1700-1799', tema: 'Le riforme borboniche', voci: [
                { id: 'ca8-1', tipo: 'crescita', titolo: 'L’impero amministrato',
                  tmpl: 'cittaCount', arg: {},
                  n: { resistere: 2, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `Amministra l’impero dalle sue capitali di provincia: possiedi ${n} Città.`,
                  check: n => `Città possedute ≥ ${n}` },
                { id: 'ca8-2', tipo: 'crescita', titolo: 'Il buon governo',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` },
                { id: 'ca8-3', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
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
                  n: { resistere: 5, avanzare: 8, eccedere: 11, passo: 2 },
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
            ] },
            // Ciclo III — Bouvines (1214) e la crociata contro gli Albigesi: il
            // dominio reale si riafferma sulla Normandia e sul Midi. Lo stesso
            // pezzo di mondo che l'Inghilterra chiama NORMANDY_FR — è la stessa
            // guerra vista dall'altra sponda.
            { ciclo: 3, epoca: '1200-1299', tema: 'Bouvines e il Midi', voci: [
                // Ordine dell'xlsx: le marce di confine sono il Primario, Bouvines
                // il Secondario (prima era il contrario).
                { id: 'fr3-1', tipo: 'espansione', titolo: 'Le marce difese',
                  tmpl: 'guarnigioni', arg: { soglia: 5 },
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Arma le province di confine: tieni ${n} territori con almeno 5 uomini ciascuno.`,
                  check: n => `${n} province con soldati ≥ 5 ciascuna` },
                { id: 'fr3-2', tipo: 'espansione', titolo: 'Bouvines',
                  tmpl: 'regione', arg: { set: 'NORMANDY_FR' },
                  n: { resistere: 2, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `Riafferma il dominio reale: possiedi ${n} delle 6 province fra Normandia, Bretagna, Piccardia, Fiandre, Aquitania e Borgogna.`,
                  check: n => `province di NORMANDY_FR possedute ≥ ${n}` },
                { id: 'fr3-3', tipo: 'economia', titolo: 'La crociata contro gli eretici',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 700, avanzare: 1200, eccedere: 1800, passo: 200 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo IV — i Cent'Anni cominciano (1337): l'inglese sbarca proprio
            // dove la Francia ha appena consolidato. Aquitaine è la stessa
            // provincia che l'Inghilterra chiede al suo capitolo IV — chi la
            // tiene, la toglie all'altro.
            { ciclo: 4, epoca: '1300-1399', tema: 'I Cent’Anni', voci: [
                { id: 'fr4-1', tipo: 'espansione', titolo: 'L’inglese sbarca',
                  tmpl: 'regione', arg: { set: 'NORMANDY_FR' },
                  n: { resistere: 2, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Non lasciare che l’inglese ti scacci dalla Normandia: tieni ${n} delle sue 6 province.`,
                  check: n => `province di NORMANDY_FR possedute ≥ ${n}` },
                // Ordine dell'xlsx: prima i confini armati (Secondario), poi
                // l'Aquitania (Terziario).
                { id: 'fr4-2', tipo: 'espansione', titolo: 'Ogni confine armato',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza ogni provincia che confina con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` },
                { id: 'fr4-3', tipo: 'espansione', titolo: 'Non cedere l’Aquitania',
                  tmpl: 'provincia', arg: { id: 'Aquitaine' },
                  n: { resistere: 3, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Difendi l’Aquitania con almeno ${n} uomini.`,
                  check: n => `possiedi Aquitaine con soldati ≥ ${n}` }
            ] },
            // Ciclo V — Giovanna d'Arco (1429): l'inglese è cacciato, la Francia
            // riprende per intero le terre normanne. Il secondario mette da parte
            // l'oro delle guerre d'Italia del capitolo dopo.
            { ciclo: 5, epoca: '1400-1499', tema: 'Cacciare l’inglese', voci: [
                { id: 'fr5-1', tipo: 'espansione', titolo: 'Giovanna d’Arco',
                  tmpl: 'regione', arg: { set: 'NORMANDY_FR' },
                  n: { resistere: 4, avanzare: 6, eccedere: 6, passo: 1 },
                  testo: n => `Caccia l’inglese dal suolo di Francia: possiedi tutte e 6 le province normanne, fiamminghe e aquitane.`,
                  check: n => `province di NORMANDY_FR possedute ≥ ${n}` },
                { id: 'fr5-2', tipo: 'economia', titolo: 'Il tesoro per l’Italia',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1200, avanzare: 2000, eccedere: 3000, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'fr5-3', tipo: 'crescita', titolo: 'Il regno che si rialza',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` }
            ] },
            // Ciclo VI — le guerre d'Italia (1494 in poi): Carlo VIII e Francesco I
            // scendono oltre le Alpi. Lo stesso Nord Italia che il Sacro Romano
            // Impero rivendica al suo capitolo III — è la stessa guerra.
            { ciclo: 6, epoca: '1500-1599', tema: 'Le guerre d’Italia', voci: [
                { id: 'fr6-1', tipo: 'espansione', titolo: 'Oltre le Alpi',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'ITALIA_NORD' } },
                      altri: [{ tmpl: 'fortezze', arg: {}, soglia: 1 }]
                  },
                  n: { resistere: 2, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Scendi in Italia e tienila: possiedi ${n} delle 5 province lombarde e venete, con una Fortezza a guardarti le spalle.`,
                  check: n => `province di ITALIA_NORD ≥ ${n} e una Fortezza` },
                { id: 'fr6-2', tipo: 'economia', titolo: 'Le fortificazioni del nord-est',
                  tmpl: 'scorte', arg: { res: 'pietra' },
                  n: { resistere: 5, avanzare: 8, eccedere: 12, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di pietra.`,
                  check: n => `scorte di pietra ≥ ${n}` },
                { id: 'fr6-3', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] },
            // Ciclo VII — i confini naturali: Richelieu e Luigi XIV spingono sul
            // Reno. Il legno del Secondario è quello del Veliero coloniale del
            // capitolo dopo.
            { ciclo: 7, epoca: '1600-1699', tema: 'I confini naturali', voci: [
                // Le tre terre del Reno da sole erano un obiettivo da ciclo 2:
                // confinano con la Francia e si prendono per terra. Al ciclo 7
                // il confine naturale vuol dire tenerle TUTTE e mettere piede
                // oltre il fiume, in Germania.
                { id: 'fr7-1', tipo: 'espansione', titolo: 'Sul Reno',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'RENO' } },
                      altri: [{ tmpl: 'regione', arg: { set: 'GERMANIA' }, soglia: 2 }]
                  },
                  n: { resistere: 2, avanzare: 3, eccedere: 3, passo: 1 },
                  testo: n => `Porta il regno ai suoi confini naturali: ${n} delle 3 terre del Reno, e almeno 2 province di Germania oltre il fiume.`,
                  check: n => `province di RENO ≥ ${n} e province di GERMANIA ≥ 2` },
                { id: 'fr7-2', tipo: 'economia', titolo: 'Il legname per le colonie',
                  tmpl: 'scorte', arg: { res: 'legno' },
                  n: { resistere: 6, avanzare: 10, eccedere: 14, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di legno.`,
                  check: n => `scorte di legno ≥ ${n}` },
                { id: 'fr7-3', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` }
            ] },
            // Ciclo VIII — le colonie: la Nuova Francia e le Antille, la stessa
            // corsa al Nuovo Mondo dell'Inghilterra e della Castiglia.
            { ciclo: 8, epoca: '1700-1799', tema: 'Le colonie', voci: [
                { id: 'fr8-1', tipo: 'navale', titolo: 'La Nuova Francia',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'AMERICA', viaSea: true } },
                      altri: [{ tmpl: 'naviTipo', arg: { tipo: 'vascello' }, soglia: 1 },
                              { tmpl: 'cittaRegioneCount', arg: { set: 'AMERICA' }, soglia: 1 }]
                  },
                  n: { resistere: 1, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Vara un Veliero e fonda la Nuova Francia: conquista ${n} province nel Nuovo Mondo e piantavi una Città.`,
                  check: n => `un Veliero, province in America ≥ ${n} e una Città lì` },
                { id: 'fr8-2', tipo: 'economia', titolo: 'Le compagnie commerciali',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1500, avanzare: 2500, eccedere: 3800, passo: 400 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'fr8-3', tipo: 'navale', titolo: 'Il porto difeso',
                  tmpl: 'naveGuarnigione', arg: {},
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 1 },
                  testo: n => `Difendi con ${n} uomini la provincia dove è ancorata una nave.`,
                  check: n => `una provincia con una nave e soldati ≥ ${n}` }
            ] }
        ],
        'Califfato Fatimide': [
            { ciclo: 1, epoca: '1000-1099', tema: 'Il mare dei Fatimidi', voci: [
                { id: 'fa1', tipo: 'espansione', titolo: 'Verso al-Andalus',
                  tmpl: 'regione', arg: { set: 'IBERIA' },
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
            ] },
            // Ciclo III — Saladino riprende Gerusalemme (1187): il califfato
            // torna in Terra Santa. Il secondario prepara già la difesa del
            // Levante che il capitolo dopo (Ain Jalut) chiede di tenere.
            { ciclo: 3, epoca: '1200-1299', tema: 'Saladino', voci: [
                { id: 'fa3-1', tipo: 'espansione', titolo: 'Saladino riprende Gerusalemme',
                  tmpl: 'regione', arg: { set: 'HOLY_LAND' },
                  n: { resistere: 1, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Riprendi la Terra Santa, chiunque la tenga: possiedi ${n} delle 4 province fra Palestina, Aleppo, Libano e Siria.`,
                  check: n => `province di HOLY_LAND possedute ≥ ${n}` },
                { id: 'fa3-2', tipo: 'espansione', titolo: 'Il Levante presidiato',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'LEVANT', soglia: 5 },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Presidia il Levante: tieni ${n} sue province con almeno 5 uomini ciascuna.`,
                  check: n => `${n} province del Levante con soldati ≥ 5 ciascuna` },
                { id: 'fa3-3', tipo: 'economia', titolo: 'Il tesoro del Cairo',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 800, avanzare: 1300, eccedere: 2000, passo: 200 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo IV — il sultanato mamelucco tiene il Levante. NON si nomina
            // l'Orda (regola dell'utente): un capitolo non può dipendere da un
            // evento che potrebbe non arrivare in tempo. Quel che si chiede è
            // quel che il giocatore controlla — presidiare il Levante.
            { ciclo: 4, epoca: '1300-1399', tema: 'I mamelucchi', voci: [
                { id: 'fa4-1', tipo: 'espansione', titolo: 'Il Levante armato',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'LEVANT', soglia: 6 },
                  n: { resistere: 1, avanzare: 3, eccedere: 3, passo: 1 },
                  testo: n => `Il Levante si tiene con le armi: presidia ${n} sue province con almeno 6 uomini ciascuna.`,
                  check: n => `${n} province del Levante con soldati ≥ 6 ciascuna` },
                { id: 'fa4-2', tipo: 'economia', titolo: 'I granai per la campagna d’Arabia',
                  tmpl: 'scorte', arg: { res: 'grano' },
                  n: { resistere: 6, avanzare: 9, eccedere: 13, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di grano.`,
                  check: n => `scorte di grano ≥ ${n}` },
                { id: 'fa4-3', tipo: 'espansione', titolo: 'Ogni confine armato',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza ogni provincia che confina con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` }
            ] },
            // Ciclo V — le vie del Mar Rosso: un TEATRO intero (la scala del
            // ciclo V), non una provincia sola. Yemen e Oman insieme, e la
            // flotta che ci arriva: prima bastava una delle due, che è quel che
            // un regno poteva già fare al secondo ciclo.
            { ciclo: 5, epoca: '1400-1499', tema: 'Le vie del Mar Rosso', voci: [
                { id: 'fa5-1', tipo: 'navale', titolo: 'Le vie del Mar Rosso',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'ARABIA' } },
                      altri: [{ tmpl: 'navi', arg: {}, soglia: 1 }]
                  },
                  n: { resistere: 1, avanzare: 2, eccedere: 2, passo: 1 },
                  testo: n => `Domina le vie del Mar Rosso: possiedi ${n === 1 ? 'una provincia' : 'Yemen e Oman'} e tieni una flotta in mare.`,
                  check: n => `province di ARABIA ≥ ${n} e almeno una nave` },
                { id: 'fa5-2', tipo: 'espansione', titolo: 'L’Egitto si blinda',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'EGYPT', soglia: 6 },
                  n: { resistere: 1, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Blinda l’Egitto: tieni ${n} sue province con almeno 6 uomini ciascuna.`,
                  check: n => `${n} province egiziane con soldati ≥ 6 ciascuna` },
                { id: 'fa5-3', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] },
            // Ciclo VI — il CANCELLO DI SPESA del binario fatimide: la
            // cittadella del Cairo. Una Fortezza costa 2000 monete e sei
            // risorse diverse (COSTS.fortezza) — nessun regno la mette in piedi
            // nei primi cicli, ed è questo che rende il capitolo un capitolo
            // tardo. Prima qui si chiedeva solo di presidiare l'Egitto, cioè
            // la propria terra di partenza.
            { ciclo: 6, epoca: '1500-1599', tema: 'La cittadella del Cairo', voci: [
                // Il CAPO è la Fortezza, non l'Egitto: una regione che possiedi
                // già è un tetto (`tetto`), e la soglia non può crescerci sopra
                // — l'obiettivo nascerebbe già compiuto. Quel che scala senza
                // tetto sono gli insediamenti che devi ancora costruire.
                { id: 'fa6-1', tipo: 'crescita', titolo: 'La cittadella',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'fortezze', arg: {} },
                      altri: [{ tmpl: 'regioneGuarnigioni', arg: { set: 'EGYPT', soglia: 8 }, soglia: 3 }]
                  },
                  n: { resistere: 1, avanzare: 1, eccedere: 2, passo: 1 },
                  testo: n => `Erigi ${pl(n, 'una Fortezza', 'Fortezze')} e fanne il perno dell’Egitto, con 3 province egiziane presidiate da almeno 8 uomini.`,
                  check: n => `Fortezze ≥ ${n} e 3 province egiziane con soldati ≥ 8` },
                { id: 'fa6-2', tipo: 'economia', titolo: 'Il tesoro per il Maghreb',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1200, avanzare: 2000, eccedere: 3000, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'fa6-3', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` }
            ] },
            // Ciclo VII — il Nordafrica. È L'ESEMPIO che ha fatto nascere la
            // scala dell'ambizione (regola dell'utente): «2 province del
            // Maghreb» al ciclo 7 era un obiettivo da ciclo 2 — Tripoli
            // confina con l'Egitto e si prende per terra. Adesso il capitolo
            // chiede il Maghreb quasi INTERO e una Città piantata là in fondo,
            // a duemila miglia dal Cairo: quello sì che vuole un impero.
            { ciclo: 7, epoca: '1600-1699', tema: 'Il Nordafrica', voci: [
                { id: 'fa7-1', tipo: 'espansione', titolo: 'Il Nordafrica',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'MAGHREB' } },
                      altri: [{ tmpl: 'cittaRegioneCount', arg: { set: 'MAGHREB' }, soglia: 1 }]
                  },
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Estendi il califfato su tutto il Nordafrica: ${n} delle 5 province del Maghreb, e una Città a governarle.`,
                  check: n => `province del Maghreb ≥ ${n} e una Città lì` },
                { id: 'fa7-2', tipo: 'economia', titolo: 'Le pietre del Cairo',
                  tmpl: 'scorte', arg: { res: 'pietra' },
                  n: { resistere: 3, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di pietra.`,
                  check: n => `scorte di pietra ≥ ${n}` },
                { id: 'fa7-3', tipo: 'economia', titolo: 'Le vie del bazar',
                  tmpl: 'tipiCollegati', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Collega alla Capitale almeno ${n} tipi di risorse diverse.`,
                  check: n => `tipi di risorsa collegati ≥ ${n}` }
            ] },
            // Ciclo VIII — i bey: il califfato è ormai una costellazione di
            // città che si governano da sé. La misura è quante ne hai, non che
            // tu ne abbia una (che era l'obiettivo del ciclo 2 francese).
            { ciclo: 8, epoca: '1700-1799', tema: 'I bey e i mamelucchi', voci: [
                { id: 'fa8-1', tipo: 'crescita', titolo: 'I bey delle province',
                  tmpl: 'cittaCount', arg: {},
                  n: { resistere: 2, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `Ogni provincia il suo bey: possiedi ${n} Città in tutto il califfato.`,
                  check: n => `Città possedute ≥ ${n}` },
                { id: 'fa8-2', tipo: 'economia', titolo: 'Le casse dei bey',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1500, avanzare: 2500, eccedere: 3800, passo: 400 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'fa8-3', tipo: 'crescita', titolo: 'Il regno che si governa',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` }
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
                  tmpl: 'guarnigioni', arg: { soglia: 3 },
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Difendi con almeno 3 uomini un minimo di ${n} territori.`,
                  check: n => `${n} province con soldati ≥ 3 ciascuna` },
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
            ] },
            // Ciclo III — Federico II scende in Italia: lo stesso Nord Italia che
            // la Francia rivendicherà al suo capitolo VI — la stessa contesa.
            { ciclo: 3, epoca: '1200-1299', tema: 'L’Italia di Federico II', voci: [
                { id: 'sr3-1', tipo: 'espansione', titolo: 'Federico scende in Italia',
                  tmpl: 'regione', arg: { set: 'ITALIA_NORD' },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Scendi in Italia: possiedi ${n} delle 5 province fra Piemonte, Lombardia, Veneto, Toscana e Romagna.`,
                  check: n => `province di ITALIA_NORD possedute ≥ ${n}` },
                { id: 'sr3-2', tipo: 'espansione', titolo: 'I ducati tedeschi',
                  tmpl: 'regione', arg: { set: 'GERMANIA' },
                  n: { resistere: 4, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Consolida i ducati tedeschi: possiedi ${n} delle 7 province di Germania.`,
                  check: n => `province di GERMANIA possedute ≥ ${n}` },
                { id: 'sr3-3', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` }
            ] },
            // Ciclo IV — la Bolla d'Oro (1356): la costituzione dell'Impero
            // formalizza il dominio sulla Germania intera.
            { ciclo: 4, epoca: '1300-1399', tema: 'La Bolla d’Oro', voci: [
                { id: 'sr4-1', tipo: 'espansione', titolo: 'La Bolla d’Oro',
                  tmpl: 'regione', arg: { set: 'GERMANIA' },
                  n: { resistere: 5, avanzare: 6, eccedere: 7, passo: 1 },
                  testo: n => `Unifica la Germania: possiedi ${n} delle sue 7 province.`,
                  check: n => `province di GERMANIA possedute ≥ ${n}` },
                { id: 'sr4-2', tipo: 'economia', titolo: 'Il tesoro per l’Austria',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1000, avanzare: 1600, eccedere: 2400, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'sr4-3', tipo: 'economia', titolo: 'Le vie imperiali',
                  tmpl: 'collegate', arg: {},
                  n: { resistere: 5, avanzare: 7, eccedere: 10, passo: 1 },
                  testo: n => `Collega ${n} tuoi territori con strade.`,
                  check: n => `province collegate ≥ ${n}` }
            ] },
            // Ciclo V — gli Asburgo: la casa d'Austria sale, e con lei l'Impero
            // mette radici a est. Il Benessere prepara il terreno prima che la
            // fede si spezzi al capitolo dopo — si governa mentre si può ancora.
            { ciclo: 5, epoca: '1400-1499', tema: 'Gli Asburgo', voci: [
                { id: 'sr5-1', tipo: 'espansione', titolo: 'Gli Asburgo',
                  tmpl: 'regione', arg: { set: 'AUSTRIA_EST' },
                  n: { resistere: 2, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `La casa d’Austria sale: possiedi ${n} delle 6 province fra Austria, Boemia, Moravia, Slesia, Stiria e Tirolo.`,
                  check: n => `province di AUSTRIA_EST possedute ≥ ${n}` },
                { id: 'sr5-2', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` },
                { id: 'sr5-3', tipo: 'economia', titolo: 'Il tesoro degli Asburgo',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1500, avanzare: 2400, eccedere: 3600, passo: 400 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo VI — la fede spezzata: la Riforma (nel calendario compresso
            // del gioco è già accaduta, §Religione) lascia l'Impero diviso. Qui
            // non se ne annuncia l'arrivo — se ne vive la CONSEGUENZA: ricomporre
            // la Germania attorno alla confessione che alla Capitale è rimasta.
            { ciclo: 6, epoca: '1500-1599', tema: 'La fede spezzata', voci: [
                { id: 'sr6-1', tipo: 'crescita', titolo: 'Ricomporre la fede',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'cittaCount', arg: {} },
                      altri: [{ tmpl: 'fede', arg: { set: 'GERMANIA' }, soglia: 5 }]
                  },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Ricomponi l’Impero attorno alla confessione che ti è rimasta: 5 province tedesche della tua fede, e ${n} Città a tenerle insieme.`,
                  check: n => `province di GERMANIA della tua fede ≥ 5 e Città ≥ ${n}` },
                // Il cancello di spesa del ciclo VI: la Fortezza (2000 monete e
                // sei risorse), che nessun regno erige nei primi cicli.
                { id: 'sr6-2', tipo: 'crescita', titolo: 'La rocca imperiale',
                  tmpl: 'fortezze', arg: {},
                  n: { resistere: 1, avanzare: 1, eccedere: 2, passo: 1 },
                  testo: n => n > 1 ? `Erigi ${n} Fortezze a difesa dell’Impero.`
                                    : 'Erigi una Fortezza a difesa dell’Impero.',
                  check: n => `Fortezze possedute ≥ ${n}` },
                { id: 'sr6-3', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` }
            ] },
            // Ciclo VII — i Trent'Anni (1618-1648): la devastazione peggiore
            // della storia tedesca. Qui non si conquista, si tiene.
            { ciclo: 7, epoca: '1600-1699', tema: 'I Trent’Anni', voci: [
                // Al ciclo IV si chiedevano 6 province tedesche: chiederne 5 al
                // VII sarebbe stato un passo INDIETRO. Qui l'Impero le tiene
                // quasi tutte, e le tiene fortificate.
                { id: 'sr7-1', tipo: 'espansione', titolo: 'L’Impero non si sfalda',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'fortezze', arg: {} },
                      altri: [{ tmpl: 'regione', arg: { set: 'GERMANIA' }, soglia: 6 }]
                  },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Reggi la tempesta di un secolo di guerre: tieni 6 delle 7 province tedesche, difese da ${pl(n, 'una Fortezza', 'Fortezze')}.`,
                  check: n => `province di GERMANIA ≥ 6 e Fortezze ≥ ${n}` },
                { id: 'sr7-2', tipo: 'economia', titolo: 'Il tesoro per l’Oriente',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1800, avanzare: 2800, eccedere: 4200, passo: 400 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'sr7-3', tipo: 'crescita', titolo: 'La ricostruzione',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] },
            // Ciclo VIII — verso oriente: l'Impero si allunga sui Balcani. Non
            // si nomina l'Ottomano (non è un regno del gioco): il capitolo
            // chiede la terra e l'insediamento che la tiene, non di battere
            // qualcuno che potrebbe non esserci.
            { ciclo: 8, epoca: '1700-1799', tema: 'Verso oriente', voci: [
                { id: 'sr8-1', tipo: 'espansione', titolo: 'La marcia d’Oriente',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'BALCANI' } },
                      altri: [{ tmpl: 'cittaRegioneCount', arg: { set: 'BALCANI' }, soglia: 1 }]
                  },
                  n: { resistere: 2, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `Spingi l’Impero verso oriente: ${n} delle 7 province balcaniche, e una Città a tenerle.`,
                  check: n => `province di BALCANI ≥ ${n} e una Città lì` },
                { id: 'sr8-2', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` },
                { id: 'sr8-3', tipo: 'economia', titolo: 'I nuovi commerci',
                  tmpl: 'tipiCollegati', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Collega alla Capitale almeno ${n} tipi di risorse diverse.`,
                  check: n => `tipi di risorsa collegati ≥ ${n}` }
            ] }
        ],
        'Ducato di Polonia': [
            { ciclo: 1, epoca: '1000-1099', tema: 'Sbocco al mare', voci: [
                { id: 'po1', tipo: 'espansione', titolo: 'Sbocco al mare',
                  tmpl: 'guarnigioniCostiere', arg: { soglia: 3 },
                  n: { resistere: 2, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Conquista ${n} province che sboccano sul mare e difendile con almeno 3 uomini ciascuna.`,
                  check: n => `${n} province costiere con soldati ≥ 3 ciascuna` },
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
                // xlsx: qui il Benessere, non un doppione di "Le vie del regno"
                // (che è già il Terziario del ciclo I).
                { id: 'po2-2', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` },
                { id: 'po2-3', tipo: 'economia', titolo: 'Le foreste polacche',
                  tmpl: 'scorte', arg: { res: 'legno' },
                  n: { resistere: 5, avanzare: 8, eccedere: 12, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di legno.`,
                  check: n => `scorte di legno ≥ ${n}` }
            ] },
            // Ciclo III — la frammentazione feudale: il ducato si divide fra i
            // duchi (il vero problema polacco del Duecento). NON si nomina
            // l'Orda: un capitolo non può poggiare su un evento che potrebbe
            // non arrivare in tempo. Tenere insieme il regno è una cosa che il
            // giocatore controlla; l'arrivo di un invasore no.
            { ciclo: 3, epoca: '1200-1299', tema: 'La frammentazione', voci: [
                // Ordine dell'xlsx: la difesa dei confini è il Primario (l'xlsx qui
                // aveva un doppione di "La flotta per Grunwald", che vive già al
                // ciclo IV; al suo posto resta il coerente "Il regno diviso").
                { id: 'po3-1', tipo: 'espansione', titolo: 'Ogni confine armato',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza ogni provincia che confina con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` },
                { id: 'po3-2', tipo: 'espansione', titolo: 'Il regno diviso',
                  tmpl: 'regione', arg: { set: 'POLONIA' },
                  n: { resistere: 3, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `Il ducato si spartisce fra i duchi: tieni insieme il cuore del regno — ${n} delle sue 6 province.`,
                  check: n => `province di POLONIA possedute ≥ ${n}` },
                { id: 'po3-3', tipo: 'economia', titolo: 'Le pietre per Casimiro',
                  tmpl: 'scorte', arg: { res: 'pietra' },
                  n: { resistere: 3, avanzare: 5, eccedere: 8, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di pietra.`,
                  check: n => `scorte di pietra ≥ ${n}` }
            ] },
            // Ciclo IV — Casimiro il Grande (1333-1370): "trovò una Polonia di
            // legno e la lasciò di pietra". La pietra del ciclo prima serve qui.
            { ciclo: 4, epoca: '1300-1399', tema: 'Casimiro il Grande', voci: [
                { id: 'po4-1', tipo: 'crescita', titolo: 'Una Polonia di pietra',
                  tmpl: 'cittaRegione', arg: { set: 'POLONIA' },
                  n: { resistere: 0, avanzare: 2, eccedere: 5, passo: 1 },
                  testo: n => n > 0 ? `Fonda una Città nel cuore del regno e difendila con ${n} uomini.`
                                    : 'Fonda una Città nel cuore del regno.',
                  check: n => n > 0 ? `una Città in POLONIA con soldati ≥ ${n}` : 'una Città in POLONIA' },
                { id: 'po4-2', tipo: 'navale', titolo: 'La flotta per Grunwald',
                  tmpl: 'navi', arg: {},
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Costruisci ${n} navi.`,
                  check: n => `navi ≥ ${n}` },
                { id: 'po4-3', tipo: 'economia', titolo: 'Il tesoro reale',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1000, avanzare: 1600, eccedere: 2400, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo V — l'unione con la Lituania e Grunwald (1410): i Cavalieri
            // Teutonici sono fermati, la costa baltica si apre.
            { ciclo: 5, epoca: '1400-1499', tema: 'L’unione e Grunwald', voci: [
                { id: 'po5-1', tipo: 'espansione', titolo: 'Grunwald',
                  tmpl: 'regione', arg: { set: 'BALTICO' },
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Prendi la costa che chiude il regno a settentrione: possiedi ${n} delle 4 province baltiche.`,
                  check: n => `province di BALTICO possedute ≥ ${n}` },
                { id: 'po5-2', tipo: 'economia', titolo: 'Il granaio d’Europa',
                  tmpl: 'scorte', arg: { res: 'grano' },
                  n: { resistere: 6, avanzare: 10, eccedere: 14, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di grano.`,
                  check: n => `scorte di grano ≥ ${n}` },
                { id: 'po5-3', tipo: 'economia', titolo: 'Le vie del regno',
                  tmpl: 'tipiCollegati', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Collega alla Capitale almeno ${n} tipi di risorse diverse.`,
                  check: n => `tipi di risorsa collegati ≥ ${n}` }
            ] },
            // Ciclo VI — il granaio d'Europa (1500s, età dell'oro del grano
            // polacco): il ciclo del commercio granario riempie l'erario.
            { ciclo: 6, epoca: '1500-1599', tema: 'Il granaio d’Europa', voci: [
                // Il PRIMARIO è la Città, non l'oro: un tesoro è un livello da
                // TENERE, quindi la sua soglia arriva a dove sei e si ferma
                // (vedi `soglia`) — come mira primaria di un capitolo tardo
                // nascerebbe già compiuta per chiunque abbia le casse piene.
                { id: 'po6-1', tipo: 'crescita', titolo: 'Le città del grano',
                  tmpl: 'cittaCount', arg: {},
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Il commercio del grano fa fiorire le città: possiedi ${n} Città.`,
                  check: n => `Città possedute ≥ ${n}` },
                { id: 'po6-2', tipo: 'economia', titolo: 'Il granaio d’Europa',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1500, avanzare: 2500, eccedere: 4000, passo: 400 },
                  testo: n => `Arricchisci il tesoro reale fino a ${n} monete.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'po6-3', tipo: 'economia', titolo: 'Le pietre per l’ultima difesa',
                  tmpl: 'scorte', arg: { res: 'pietra' },
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di pietra.`,
                  check: n => `scorte di pietra ≥ ${n}` }
            ] },
            // Ciclo VII — il Diluvio svedese (1655-1660): la devastazione
            // peggiore della storia polacca. Il secondario costruisce già la
            // Fortezza che il capitolo dopo — le spartizioni — chiede di
            // difendere: la pietra del ciclo prima serve a questo.
            { ciclo: 7, epoca: '1600-1699', tema: 'Il diluvio', voci: [
                { id: 'po7-1', tipo: 'espansione', titolo: 'Il Diluvio svedese',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'fortezze', arg: {} },
                      altri: [{ tmpl: 'regione', arg: { set: 'POLONIA' }, soglia: 5 }]
                  },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Non lasciare che la Polonia sprofondi: tieni 5 delle sue 6 province, dietro ${pl(n, 'una Fortezza', 'Fortezze')}.`,
                  check: n => `province di POLONIA ≥ 5 e Fortezze ≥ ${n}` },
                { id: 'po7-2', tipo: 'economia', titolo: 'Le casse per la difesa',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1500, avanzare: 2600, eccedere: 4000, passo: 400 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'po7-3', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` }
            ] },
            // Ciclo VIII — le spartizioni (1772-1795): le tre potenze si
            // dividono il regno. L'unica cosa che conta è la Capitale, dietro le
            // mura della Fortezza appena costruita.
            { ciclo: 8, epoca: '1700-1799', tema: 'Le spartizioni', voci: [
                { id: 'po8-1', tipo: 'espansione', titolo: 'L’ultima trincea',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'capitale', arg: {} },
                      altri: [{ tmpl: 'fortezza', arg: {}, soglia: 1 }]
                  },
                  n: { resistere: 6, avanzare: 10, eccedere: 15, passo: 2 },
                  testo: n => `Le tre potenze si dividono il regno: l’ultima trincea è la Capitale, dietro le mura di una Fortezza — difendila con ${n} uomini.`,
                  check: n => `una Fortezza posseduta e soldati alla Capitale ≥ ${n}` },
                { id: 'po8-2', tipo: 'espansione', titolo: 'Ogni confine armato',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza ogni provincia che confina con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` },
                { id: 'po8-3', tipo: 'crescita', titolo: 'Il popolo non si arrende',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` }
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
            ] },
            // Ciclo III — l'ascesa di Mosca fra i principati divisi. NON è "il
            // giogo" (regola dell'utente): l'Orda potrebbe non arrivare mai fin
            // qui, e un capitolo che chiedesse di sopravviverle sarebbe
            // compiuto o impossibile per ragioni che non dipendono dal
            // giocatore. Si chiede quel che si controlla: tenere insieme le
            // terre del nord e fare di Mosca la più forte fra le città russe.
            { ciclo: 3, epoca: '1200-1299', tema: 'L’ascesa di Mosca', voci: [
                { id: 'ru3-1', tipo: 'espansione', titolo: 'I principati divisi',
                  tmpl: 'regione', arg: { set: 'RUS_NORD' },
                  n: { resistere: 3, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `Fra i principati che si dividono, tieni insieme le terre della Rus’: ${n} delle 6 del settentrione.`,
                  check: n => `province di RUS_NORD possedute ≥ ${n}` },
                { id: 'ru3-2', tipo: 'espansione', titolo: 'Mosca si rafforza',
                  tmpl: 'provincia', arg: { id: 'Moscow' },
                  n: { resistere: 4, avanzare: 7, eccedere: 10, passo: 2 },
                  testo: n => `Mosca si rafforza: difendila con almeno ${n} uomini.`,
                  check: n => `possiedi Moscow con soldati ≥ ${n}` },
                { id: 'ru3-3', tipo: 'espansione', titolo: 'Ogni confine armato',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza ogni provincia che confina con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` }
            ] },
            // Ciclo IV — raccogliere le terre russe: Mosca diventa il fulcro
            // attorno a cui la Rus’ settentrionale si ricompone per intero.
            { ciclo: 4, epoca: '1300-1399', tema: 'Raccogliere le terre russe', voci: [
                { id: 'ru4-1', tipo: 'espansione', titolo: 'Raccogliere le terre russe',
                  tmpl: 'regione', arg: { set: 'RUS_NORD' },
                  n: { resistere: 5, avanzare: 6, eccedere: 6, passo: 1 },
                  testo: n => `Ricomponi la Rus’ attorno a Mosca: possiedi tutte e 6 le sue terre settentrionali.`,
                  check: n => `province di RUS_NORD possedute ≥ ${n}` },
                { id: 'ru4-2', tipo: 'economia', titolo: 'Il tesoro per l’Oriente',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1000, avanzare: 1600, eccedere: 2400, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'ru4-3', tipo: 'crescita', titolo: 'Il regno che si governa',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` }
            ] },
            // Ciclo V — la Rus' si spinge a oriente, oltre il Volga. Il nome
            // non chiama in causa nessun khanato: la meta è la terra.
            { ciclo: 5, epoca: '1400-1499', tema: 'Oltre il Volga', voci: [
                { id: 'ru5-1', tipo: 'espansione', titolo: 'Oltre il Volga',
                  tmpl: 'regione', arg: { set: 'EST_RUSSO' },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Spingi la Rus’ a oriente: possiedi ${n} delle 6 terre a est di Mosca.`,
                  check: n => `province di EST_RUSSO possedute ≥ ${n}` },
                { id: 'ru5-2', tipo: 'espansione', titolo: 'Le terre orientali armate',
                  tmpl: 'guarnigioni', arg: { soglia: 4 },
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Arma ${n} province con almeno 4 uomini ciascuna.`,
                  check: n => `${n} province con soldati ≥ 4 ciascuna` },
                { id: 'ru5-3', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] },
            // Ciclo VI — verso oriente: Ivan il Terribile prende Kazan e
            // Astrakhan, Yermak apre la strada alla Siberia del capitolo dopo.
            { ciclo: 6, epoca: '1500-1599', tema: 'Verso oriente', voci: [
                { id: 'ru6-1', tipo: 'espansione', titolo: 'Kazan e Astrakhan',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'cittaCount', arg: {} },
                      altri: [{ tmpl: 'regione', arg: { set: 'EST_RUSSO' }, soglia: 5 }]
                  },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Unifica le terre a est e piantavi le tue città: 5 delle 6 province oltre il Volga, e ${n} Città nel regno.`,
                  check: n => `province di EST_RUSSO ≥ 5 e Città ≥ ${n}` },
                { id: 'ru6-2', tipo: 'economia', titolo: 'Il tesoro per la Siberia',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1200, avanzare: 2000, eccedere: 3000, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'ru6-3', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` }
            ] },
            // Ciclo VII — la Siberia: Yermak Timofeevič apre la marcia verso
            // l’estremo Oriente (1580 in poi). Il secondario arma già la flotta
            // che al capitolo dopo apre la finestra sul Baltico.
            { ciclo: 7, epoca: '1600-1699', tema: 'La Siberia', voci: [
                { id: 'ru7-1', tipo: 'espansione', titolo: 'Yermak apre la Siberia',
                  tmpl: 'regione', arg: { set: 'SIBERIA' },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Conquista ${n} delle 9 terre selvagge di Siberia.`,
                  check: n => `province di SIBERIA possedute ≥ ${n}` },
                { id: 'ru7-2', tipo: 'navale', titolo: 'La flotta del Baltico',
                  tmpl: 'navi', arg: {},
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Costruisci ${n} navi.`,
                  check: n => `navi ≥ ${n}` },
                { id: 'ru7-3', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] },
            // Ciclo VIII — la finestra sul Baltico: Pietro il Grande e la Grande
            // Guerra del Nord, San Pietroburgo come porta sull’Europa.
            { ciclo: 8, epoca: '1700-1799', tema: 'La finestra sul Baltico', voci: [
                // La finestra sul Baltico non è una provincia costiera: è la
                // città che ci si costruisce sopra (Pietroburgo). Senza, al
                // ciclo VIII si chiedeva quel che la Polonia chiede al V.
                { id: 'ru8-1', tipo: 'espansione', titolo: 'La finestra sul Baltico',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'BALTICO' } },
                      altri: [{ tmpl: 'cittaRegioneCount', arg: { set: 'BALTICO' }, soglia: 1 }]
                  },
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Apri la finestra sull’Europa: possiedi ${n} delle 4 province baltiche e fondavi la tua città sul mare.`,
                  check: n => `province di BALTICO ≥ ${n} e una Città lì` },
                { id: 'ru8-2', tipo: 'crescita', titolo: 'Il regno che si governa',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` },
                { id: 'ru8-3', tipo: 'economia', titolo: 'Le casse dell’impero',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1500, avanzare: 2500, eccedere: 3800, passo: 400 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] }
        ],
        'Ducato di Ungheria': [
            { ciclo: 1, epoca: '1000-1099', tema: 'Il regno prospero', voci: [
                { id: 'un1', tipo: 'crescita', titolo: 'Il regno prospero',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
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
            ] },
            // Ciclo III — le fortezze di pietra di Béla IV: il programma di
            // incastellamento che rifece l'Ungheria nel Duecento. NON si nomina
            // l'Orda (regola dell'utente) — quel che si chiede è tenere unita
            // la Pannonia e armarne i confini, che dipende dal giocatore.
            { ciclo: 3, epoca: '1200-1299', tema: 'Le fortezze di pietra', voci: [
                { id: 'un3-1', tipo: 'espansione', titolo: 'Il regno incastellato',
                  tmpl: 'regione', arg: { set: 'PANNONIA' },
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni unito il regno e mettilo in stato di difesa: ${n} delle 5 terre della Pannonia.`,
                  check: n => `province di PANNONIA possedute ≥ ${n}` },
                { id: 'un3-2', tipo: 'espansione', titolo: 'Ogni confine armato',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza ogni provincia che confina con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` },
                { id: 'un3-3', tipo: 'economia', titolo: 'Il tesoro reale',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 700, avanzare: 1200, eccedere: 1800, passo: 200 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo IV — gli Angioini (Carlo Roberto, 1308-1342): il regno si
            // espande nei Balcani.
            { ciclo: 4, epoca: '1300-1399', tema: 'Gli Angioini', voci: [
                { id: 'un4-1', tipo: 'espansione', titolo: 'Gli Angioini nei Balcani',
                  tmpl: 'regione', arg: { set: 'BALCANI' },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Espandi il regno nei Balcani: possiedi ${n} delle sue 7 province.`,
                  check: n => `province di BALCANI possedute ≥ ${n}` },
                { id: 'un4-2', tipo: 'espansione', titolo: 'I Balcani armati',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'BALCANI', soglia: 4 },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Presidia i Balcani: tieni ${n} sue province con almeno 4 uomini ciascuna.`,
                  check: n => `${n} province balcaniche con soldati ≥ 4 ciascuna` },
                { id: 'un4-3', tipo: 'crescita', titolo: 'Il regno che si governa',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` }
            ] },
            // Ciclo V — Hunyadi e l'assedio di Belgrado (1456): l'Ottomano è
            // fermato. Il secondario mette da parte la pietra per la Fortezza
            // che Mohács, al capitolo dopo, chiederà attorno alla Capitale.
            { ciclo: 5, epoca: '1400-1499', tema: 'Hunyadi e Belgrado', voci: [
                { id: 'un5-1', tipo: 'espansione', titolo: 'Belgrado tiene',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'BALCANI', soglia: 6 },
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni la frontiera del sud come Hunyadi tenne Belgrado: presidia ${n} province balcaniche con almeno 6 uomini ciascuna.`,
                  check: n => `${n} province balcaniche con soldati ≥ 6 ciascuna` },
                { id: 'un5-2', tipo: 'economia', titolo: 'Le pietre per l’ultima difesa',
                  tmpl: 'scorte', arg: { res: 'pietra' },
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Prepara le difese della Capitale: immagazzina ${n} scorte di pietra.`,
                  check: n => `scorte di pietra ≥ ${n}` },
                { id: 'un5-3', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] },
            // Ciclo VI — il cancello di spesa ungherese: la Capitale dietro le
            // mura di una Fortezza (2000 monete e sei risorse), con la pietra
            // messa da parte al ciclo prima. Il capitolo porta il nome del
            // secolo, ma non chiede di battere nessuno: chiede di essere pronti.
            { ciclo: 6, epoca: '1500-1599', tema: 'Il regno in armi', voci: [
                { id: 'un6-1', tipo: 'espansione', titolo: 'L’ultima difesa',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'capitale', arg: {} },
                      altri: [{ tmpl: 'fortezza', arg: {}, soglia: 1 }]
                  },
                  n: { resistere: 6, avanzare: 10, eccedere: 15, passo: 2 },
                  testo: n => `Chiudi la corona dentro le mura: erigi una Fortezza e tieni la Capitale con almeno ${n} uomini a guardia.`,
                  check: n => `una Fortezza posseduta e soldati alla Capitale ≥ ${n}` },
                { id: 'un6-2', tipo: 'espansione', titolo: 'Il regno non si sgretola',
                  tmpl: 'provCount', arg: {},
                  n: { resistere: 6, avanzare: 9, eccedere: 13, passo: 1 },
                  testo: n => `Non lasciare che il regno si sgretoli: mantieni almeno ${n} province.`,
                  check: n => `province ≥ ${n}` },
                { id: 'un6-3', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` }
            ] },
            // Ciclo VII — la Pannonia INTERA, e una Città a tenerla. Prima qui
            // si chiedevano 3 province su 5, cioè MENO delle 4 del capitolo III:
            // un capitolo tardo non può valere meno di uno precoce.
            { ciclo: 7, epoca: '1600-1699', tema: 'Il regno riunito', voci: [
                { id: 'un7-1', tipo: 'espansione', titolo: 'Riprendersi ogni terra',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'cittaCount', arg: {} },
                      altri: [{ tmpl: 'regione', arg: { set: 'PANNONIA' }, soglia: 5 }]
                  },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Riprenditi ogni terra del regno — tutte e 5 le province della Pannonia — e governale da ${n} Città.`,
                  check: n => `province di PANNONIA ≥ 5 e Città ≥ ${n}` },
                { id: 'un7-2', tipo: 'economia', titolo: 'I nuovi commerci',
                  tmpl: 'tipiCollegati', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Collega alla Capitale almeno ${n} tipi di risorse diverse.`,
                  check: n => `tipi di risorsa collegati ≥ ${n}` },
                { id: 'un7-3', tipo: 'espansione', titolo: 'Ogni confine armato',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza ogni provincia che confina con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` }
            ] },
            // Ciclo VIII — oltre la Pannonia: il regno riunito guarda a
            // mezzogiorno. Ripetere "tutta la Pannonia" dopo il VII sarebbe un
            // obiettivo già in tasca; qui la scala è quella dei Balcani.
            { ciclo: 8, epoca: '1700-1799', tema: 'Verso mezzogiorno', voci: [
                { id: 'un8-1', tipo: 'espansione', titolo: 'La corona di Santo Stefano',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'regione', arg: { set: 'BALCANI' } },
                      altri: [{ tmpl: 'cittaCount', arg: {}, soglia: 2 }]
                  },
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Il regno riunito guarda a mezzogiorno: possiedi ${n} delle 7 province balcaniche, con almeno 2 Città nel regno.`,
                  check: n => `province di BALCANI ≥ ${n} e Città ≥ 2` },
                { id: 'un8-2', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` },
                { id: 'un8-3', tipo: 'economia', titolo: 'I nuovi commerci',
                  tmpl: 'tipiCollegati', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Collega alla Capitale almeno ${n} tipi di risorse diverse.`,
                  check: n => `tipi di risorsa collegati ≥ ${n}` }
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
                // Non più "per la crociata": con la storia cambiata Bisanzio non
                // marcia in Terra Santa. L'appello di Alessio I torna a essere quel
                // che fu storicamente — un grido d'aiuto per la frontiera anatolica
                // sfondata dopo Manzicerta. Il raduno è a Hudavendigar (la Bitinia,
                // porta dell'Anatolia), non a Costantinopoli.
                { id: 'bi2', tipo: 'preparazione', titolo: 'L’appello di Alessio I',
                  tmpl: 'provincia', arg: { id: 'Hudavendigar' },
                  n: { resistere: 5, avanzare: 8, eccedere: 11, passo: 2 },
                  testo: n => `Raggruppa ${n} uomini in Hudavendigar per difendere i confini della cristianità.`,
                  check: n => `soldati in Hudavendigar ≥ ${n}` },
                { id: 'bi3', tipo: 'economia', titolo: 'Le vie dell’impero',
                  tmpl: 'collegate', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 6, passo: 1 },
                  testo: n => `Collega almeno ${n} province alla Capitale con strade.`,
                  check: n => `province collegate ≥ ${n}` }
            ] },
            { ciclo: 2, epoca: '1100-1199', tema: 'I Comneni', voci: [
                { id: 'bi2-1', tipo: 'espansione', titolo: 'La riconquista della Grecia',
                  tmpl: 'regione', arg: { set: 'GREECE' },
                  n: { resistere: 2, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Riconquista la Grecia: possiedi ${n} delle 7 province greche.`,
                  check: n => `province greche possedute ≥ ${n}` },
                // La svolta di storia (regola dell'utente): Bisanzio non tiene più
                // Gerusalemme — non ci va nemmeno. La minaccia del ciclo II sono i
                // Selgiuchidi in Anatolia, non la Terra Santa. Al posto de "La
                // guardia di Gerusalemme" (Palestine), il fronte anatolico.
                { id: 'bi2-2', tipo: 'espansione', titolo: 'La lotta ai Selgiuchidi',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'ANATOLIA', soglia: 5 },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Frena i Selgiuchidi in Anatolia: tieni ${pl(n, 'una provincia', 'province')} anatoliche con almeno 5 uomini ciascuna.`,
                  check: n => `${n} province anatoliche con soldati ≥ 5 ciascuna` },
                { id: 'bi2-3', tipo: 'economia', titolo: 'Il tesoro di Costantinopoli',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 700, avanzare: 1200, eccedere: 1800, passo: 200 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo III — la riscossa d'Anatolia (i Comneni oltre la Grecia): la
            // meta primaria è tenere ARMATA la frontiera anatolica, non solo
            // possederla; il popolo di Costantinopoli e i granai d'Anatolia la
            // reggono. Il vecchio ramo condizionale su Gerusalemme (se Bisanzio la
            // teneva, spingi verso la Transgiordania) è CADUTO con la storia
            // cambiata: Bisanzio non è mai stata in Terra Santa, quindi non c'è più
            // niente da proseguire — il ciclo guarda tutto a oriente.
            { ciclo: 3, epoca: '1200-1299', tema: 'La riscossa d’Anatolia', voci: [
                { id: 'bi3-1', tipo: 'espansione', titolo: 'La riscossa d’Anatolia',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'ANATOLIA', soglia: 6 },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Riconquista l’Anatolia: tieni ${pl(n, 'una provincia', 'province')} anatoliche con almeno 6 uomini ciascuna.`,
                  check: n => `${n} province anatoliche con soldati ≥ 6 ciascuna` },
                { id: 'bi3-2', tipo: 'crescita', titolo: 'Il popolo di Costantinopoli',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` },
                { id: 'bi3-3', tipo: 'economia', titolo: 'I granai d’Anatolia',
                  tmpl: 'scorte', arg: { res: 'grano' },
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di grano.`,
                  check: n => `scorte di grano ≥ ${n}` }
            ] },
            // Ciclo IV — la frontiera vigilata: dopo la riconquista, si presidia
            // ogni confine con un REGNO nemico (le neutrali non contano), mentre
            // a ovest si apre un fronte navale nuovo, il rovescio dello sbarco
            // normanno in Sicilia.
            { ciclo: 4, epoca: '1300-1399', tema: 'Le frontiere vigilate', voci: [
                { id: 'bi4-1', tipo: 'espansione', titolo: 'Le frontiere vigilate',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza OGNI provincia a contatto con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` },
                { id: 'bi4-2', tipo: 'navale', titolo: 'Lo sbarco in Italia',
                  tmpl: 'regione', arg: { set: 'SICILIA_CALABRIA', viaSea: true },
                  n: { resistere: 1, avanzare: 2, eccedere: 2, passo: 1 },
                  testo: n => `Sbarca in Italia: conquista ${pl(n, 'una provincia', 'province')} fra Sicilia e Calabria.`,
                  check: n => `province fra Sicily e Calabria possedute ≥ ${n}` },
                { id: 'bi4-3', tipo: 'economia', titolo: 'Il tesoro del Bosforo',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1200, avanzare: 2000, eccedere: 3000, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo V — la cristianità in pericolo: la pressione a oriente
            // costringe a TENERE (non più conquistare) l'Anatolia con una guardia
            // pesante, mentre una Città nuova la consolida e il popolo regge
            // l'assedio. Il vecchio ramo condizionale sullo sbarco in Italia è
            // caduto con la storia riscritta: la frontiera che conta è quella a est.
            { ciclo: 5, epoca: '1400-1499', tema: 'La cristianità in pericolo', voci: [
                { id: 'bi5-1', tipo: 'espansione', titolo: 'La cristianità in pericolo',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'ANATOLIA', soglia: 8 },
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Difendi la cristianità in Anatolia: tieni ${n} province anatoliche con almeno 8 uomini ciascuna.`,
                  check: n => `${n} province anatoliche con soldati ≥ 8 ciascuna` },
                { id: 'bi5-2', tipo: 'crescita', titolo: 'Il popolo regge l’assedio',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` },
                { id: 'bi5-3', tipo: 'crescita', titolo: 'Una città in Anatolia',
                  tmpl: 'cittaRegione', arg: { set: 'ANATOLIA' },
                  n: { resistere: 2, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Consolida la frontiera: costruisci una Città in Anatolia e difendila con ${n} uomini.`,
                  check: n => `una Città anatolica con soldati ≥ ${n}` }
            ] },
            // Ciclo VI — la rinascita imperiale: passata la tempesta, si
            // ricostruisce. Una Città nuova, le strade che la reggono, l'erario
            // che si riempie di nuovo.
            { ciclo: 6, epoca: '1500-1599', tema: 'La rinascita imperiale', voci: [
                { id: 'bi6-1', tipo: 'crescita', titolo: 'La rinascita imperiale',
                  tmpl: 'citta', arg: {},
                  n: { resistere: 3, avanzare: 6, eccedere: 8, passo: 2 },
                  testo: n => `Costruisci una Città e difendila con almeno ${n} uomini.`,
                  check: n => `una Città con soldati ≥ ${n}` },
                { id: 'bi6-2', tipo: 'economia', titolo: 'Le strade imperiali ricostruite',
                  tmpl: 'collegate', arg: {},
                  n: { resistere: 5, avanzare: 7, eccedere: 10, passo: 1 },
                  testo: n => `Collega ${n} tuoi territori con strade.`,
                  check: n => `province collegate ≥ ${n}` },
                { id: 'bi6-3', tipo: 'economia', titolo: 'L’erario ricostituito',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1500, avanzare: 2500, eccedere: 3800, passo: 400 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo VII — verso l'Adriatico: i Balcani occidentali, l'ultimo
            // pezzo di terra fra Costantinopoli e l'Italia già presa.
            { ciclo: 7, epoca: '1600-1699', tema: 'Verso l’Adriatico', voci: [
                { id: 'bi7-1', tipo: 'espansione', titolo: 'Verso l’Adriatico',
                  tmpl: 'province', arg: { ids: ['Albania', 'Serbia', 'Montenegro'] },
                  n: { resistere: 0, avanzare: 0, eccedere: 4, passo: 0 },
                  testo: n => n > 0 ? `Conquista Albania, Serbia e Montenegro e difendile con ${n} uomini ciascuna.`
                                    : 'Conquista e difendi Albania, Serbia e Montenegro.',
                  check: n => n > 0 ? `Albania, Serbia e Montenegro, soldati ≥ ${n} ciascuna` : 'possiedi Albania, Serbia e Montenegro' },
                { id: 'bi7-2', tipo: 'espansione', titolo: 'Il dominio dell’Adriatico',
                  tmpl: 'regione', arg: { set: 'ADRIATIC' },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Estendi il controllo sull’Adriatico: possiedi ${pl(n, 'una provincia', 'province')} fra Croazia, Dalmazia e Istria.`,
                  check: n => `province fra Croatia/Dalmatia/Istria possedute ≥ ${n}` },
                { id: 'bi7-3', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` }
            ] },
            // Ciclo VIII — le terre perdute dell'Islam: l'impero che non è
            // caduto si riprende, un pezzo alla volta, quel che nel Mille era
            // musulmano (ANDALUS a parti invertite: qui è Bisanzio a riconquistare).
            { ciclo: 8, epoca: '1700-1799', tema: 'Le terre perdute dell’Islam', voci: [
                { id: 'bi8-1', tipo: 'espansione', titolo: 'Le terre perdute dell’Islam',
                  tmpl: 'regione', arg: { set: 'ISLAM_ORIGINE' },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Riconquista terre un tempo islamiche: possiedi ${n} province che nel Mille erano musulmane.`,
                  check: n => `province di fede musulmana di partenza possedute ≥ ${n}` },
                { id: 'bi8-2', tipo: 'navale', titolo: 'La flotta del Bosforo',
                  tmpl: 'naveGuarnigione', arg: {},
                  n: { resistere: 4, avanzare: 6, eccedere: 9, passo: 1 },
                  testo: n => `Difendi con ${n} uomini la provincia dove è ancorata una nave.`,
                  check: n => `una provincia con una nave e soldati ≥ ${n}` },
                { id: 'bi8-3', tipo: 'economia', titolo: 'Le casse dell’impero',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 2000, avanzare: 3200, eccedere: 4800, passo: 500 },
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
            ] },
            // Ciclo III — il cuore del califfato. NON è "il sacco di Baghdad"
            // (regola dell'utente): l'ala persiana della marcia mongola potrebbe
            // non arrivare mai, e il capitolo si reggerebbe su un evento che non
            // accade. Si chiede di tenere la Mesopotamia e di armarne i confini.
            { ciclo: 3, epoca: '1200-1299', tema: 'Il cuore della Mesopotamia', voci: [
                { id: 'ab3-1', tipo: 'espansione', titolo: 'Il cuore del califfato',
                  tmpl: 'regione', arg: { set: 'MESOPOTAMIA' },
                  n: { resistere: 1, avanzare: 3, eccedere: 3, passo: 1 },
                  testo: n => `Il cuore del califfato non si cede: tieni ${n} delle 3 province della Mesopotamia.`,
                  check: n => `province di MESOPOTAMIA possedute ≥ ${n}` },
                { id: 'ab3-2', tipo: 'espansione', titolo: 'Ogni confine armato',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza ogni provincia che confina con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` },
                { id: 'ab3-3', tipo: 'economia', titolo: 'Il tesoro del bazar',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 800, avanzare: 1300, eccedere: 2000, passo: 200 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` }
            ] },
            // Ciclo IV — l'altopiano persiano: il califfato si allunga a
            // oriente. Nessun Ilkhanato da nominare (non è un regno del gioco):
            // la meta è la terra.
            { ciclo: 4, epoca: '1300-1399', tema: 'L’altopiano persiano', voci: [
                { id: 'ab4-1', tipo: 'espansione', titolo: 'Verso l’altopiano',
                  tmpl: 'regione', arg: { set: 'PERSIA' },
                  n: { resistere: 1, avanzare: 3, eccedere: 5, passo: 1 },
                  testo: n => `Allunga il califfato sull’altopiano: possiedi ${n} delle 7 province persiane.`,
                  check: n => `province di PERSIA possedute ≥ ${n}` },
                { id: 'ab4-2', tipo: 'espansione', titolo: 'La Persia presidiata',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'PERSIA', soglia: 5 },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Presidia la Persia: tieni ${n} sue province con almeno 5 uomini ciascuna.`,
                  check: n => `${n} province persiane con soldati ≥ 5 ciascuna` },
                { id: 'ab4-3', tipo: 'crescita', titolo: 'Il regno che prospera',
                  tmpl: 'benessere', arg: {},
                  n: { resistere: 2, avanzare: 3, eccedere: 4, passo: 1 },
                  testo: n => `Tieni il Benessere del regno al livello ${n}.`,
                  check: n => `Benessere ≥ ${n}` }
            ] },
            // Ciclo V — la Persia si tiene con le armi. Nessun conquistatore da
            // nominare: quel che si chiede è il presidio, che dipende dal
            // giocatore e non da chi si presenta al confine.
            { ciclo: 5, epoca: '1400-1499', tema: 'La Persia in armi', voci: [
                { id: 'ab5-1', tipo: 'espansione', titolo: 'La Persia presidiata',
                  tmpl: 'regioneGuarnigioni', arg: { set: 'PERSIA', soglia: 7 },
                  n: { resistere: 2, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni l’altopiano con le armi: ${n} province persiane con almeno 7 uomini ciascuna.`,
                  check: n => `${n} province persiane con soldati ≥ 7 ciascuna` },
                { id: 'ab5-2', tipo: 'economia', titolo: 'Il tesoro per i Safavidi',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1200, avanzare: 2000, eccedere: 3000, passo: 300 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'ab5-3', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` }
            ] },
            // Ciclo VI — i Safavidi (1501, Shah Ismail impone la fede sciita):
            // ricomporre la Persia attorno alla nuova confessione. Il secondario
            // mette da parte la pietra per Isfahan, la Città del capitolo dopo.
            { ciclo: 6, epoca: '1500-1599', tema: 'I Safavidi', voci: [
                { id: 'ab6-1', tipo: 'crescita', titolo: 'La fede sciita',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'cittaCount', arg: {} },
                      altri: [{ tmpl: 'fede', arg: { set: 'PERSIA' }, soglia: 5 }]
                  },
                  n: { resistere: 1, avanzare: 2, eccedere: 4, passo: 1 },
                  testo: n => `La confessione nuova si radica dove si costruisce: 5 province persiane della tua fede, e ${n} Città a custodirla.`,
                  check: n => `province di PERSIA della tua fede ≥ 5 e Città ≥ ${n}` },
                { id: 'ab6-2', tipo: 'economia', titolo: 'Le pietre per Isfahan',
                  tmpl: 'scorte', arg: { res: 'pietra' },
                  n: { resistere: 3, avanzare: 5, eccedere: 8, passo: 2 },
                  testo: n => `Immagazzina ${n} scorte di pietra.`,
                  check: n => `scorte di pietra ≥ ${n}` },
                { id: 'ab6-3', tipo: 'economia', titolo: 'Le vie del bazar',
                  tmpl: 'tipiCollegati', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Collega alla Capitale almeno ${n} tipi di risorse diverse.`,
                  check: n => `tipi di risorsa collegati ≥ ${n}` }
            ] },
            // Ciclo VII — Isfahan, "metà del mondo": la capitale di Shah Abbas.
            { ciclo: 7, epoca: '1600-1699', tema: 'Isfahan', voci: [
                // «Isfahan è metà del mondo» dicevano di Shah Abbas: una Città
                // sola non lo rende: al ciclo VII il califfato ne ha già più
                // d'una, e il capitolo chiede che la capitale nuova sia la
                // perla di una corona di città.
                { id: 'ab7-1', tipo: 'crescita', titolo: 'Isfahan è metà del mondo',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'citta', arg: { at: 'Isfahan' } },
                      altri: [{ tmpl: 'cittaCount', arg: {}, soglia: 3 }]
                  },
                  n: { resistere: 3, avanzare: 6, eccedere: 9, passo: 2 },
                  testo: n => `Costruisci a Isfahan la perla del califfato — difendila con ${n} uomini — e tieni almeno 3 Città in tutto il regno.`,
                  check: n => `una Città a Isfahan con soldati ≥ ${n} e Città ≥ 3` },
                { id: 'ab7-2', tipo: 'economia', titolo: 'Il tesoro per il declino',
                  tmpl: 'oro', arg: {},
                  n: { resistere: 1500, avanzare: 2500, eccedere: 3800, passo: 400 },
                  testo: n => `Conserva ${n} monete d’oro.`,
                  check: n => `monete ≥ ${n}` },
                { id: 'ab7-3', tipo: 'crescita', titolo: 'Il regno che si governa',
                  tmpl: 'popolarita', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Chiudi il ciclo con una Popolarità di livello ${n}.`,
                  check: n => `Popolarità ≥ ${n}` }
            ] },
            // Ciclo VIII — il declino: la dinastia vacilla, le invasioni afghane
            // premono. Qui non si conquista, si tiene.
            { ciclo: 8, epoca: '1700-1799', tema: 'Il declino', voci: [
                { id: 'ab8-1', tipo: 'espansione', titolo: 'La dinastia non cede',
                  tmpl: 'tutti', arg: {
                      capo: { tmpl: 'fortezze', arg: {} },
                      altri: [{ tmpl: 'regione', arg: { set: 'PERSIA' }, soglia: 6 }]
                  },
                  n: { resistere: 1, avanzare: 2, eccedere: 3, passo: 1 },
                  testo: n => `Il califfato al tramonto non cede: 6 delle 7 province persiane, e ${pl(n, 'una Fortezza', 'Fortezze')} a guardarle.`,
                  check: n => `province di PERSIA ≥ 6 e Fortezze ≥ ${n}` },
                { id: 'ab8-2', tipo: 'crescita', titolo: 'La pace armata',
                  tmpl: 'sicurezza', arg: {},
                  n: { resistere: 3, avanzare: 4, eccedere: 5, passo: 1 },
                  testo: n => `Tieni la Sicurezza del regno al livello ${n}.`,
                  check: n => `Sicurezza ≥ ${n}` },
                { id: 'ab8-3', tipo: 'espansione', titolo: 'Ogni confine armato',
                  tmpl: 'guarnigioniConfine', arg: {},
                  n: { resistere: 3, avanzare: 5, eccedere: 7, passo: 1 },
                  testo: n => `Rafforza ogni provincia che confina con un regno nemico con almeno ${n} uomini.`,
                  check: n => `ogni provincia confinante con un nemico con soldati ≥ ${n}` }
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

    // Il FRENO: il capitolo non può superare il ciclo di più di uno (regola
    // dell'utente: un regno può correre, ma gli obiettivi restano plausibili e
    // storicamente attendibili — non ci si può ritrovare a chiedere i confini
    // sul Reno di Richelieu due secoli prima che la Francia normanna abbia
    // ancora finito i Cent'Anni). Era 2: bastava una manciata di cicli forti
    // perché un regno saltasse due capitoli avanti, cioè due secoli di storia
    // scavalcati. Con 1 la deriva massima resta un capitolo, cento anni.
    const FRENO = 1;
    // Sotto queste province il regno è in ginocchio: il capitolo ARRETRA.
    const CROLLO_PROV = 2;
    // Quanto il ritmo del ciclo scorso pesa sul passo, per gradino: al Primario
    // si chiede di fare MEGLIO, al Secondario di ripetersi, al Terziario di non
    // peggiorare.
    const K_TIER = { Primario: 1.2, Secondario: 1.0, Terziario: 0.5 };
    // La BANDA del ritmo è stretta apposta (regola dell'utente: "margine meno alto
    // in positivo e in negativo — non può raddoppiare una richiesta solo perché al
    // turno prima sei andato bene"). Un ciclo brillante amplifica il passo al più
    // di 1,4×, uno disastroso lo riduce al più a 0,75×: l'obiettivo si adatta, ma
    // non impenna. Il tetto vero è nel cap `hi` di `soglia` (eccedere × 1,2), che
    // impedisce alla soglia di sfondare l'ancora più ambiziosa scritta a mano.
    const RITMO_MIN = 0.75, RITMO_MAX = 1.4;
    // I template che si RATCHETTANO per intero: quel che si conquista o si
    // costruisce non si perde spendendolo, quindi la soglia parte da dove sei
    // PIÙ un passo. Gli altri — oro, scorte, Popolarità, Sicurezza — sono
    // livelli da TENERE, non da superare: lì la soglia arriva a dove sei e si
    // ferma, se no un tesoro chiederebbe di non spendere mai e una scorta di
    // non costruire mai. (La banda dell'autore fa comunque da tetto a entrambi.)
    const CRESCITA = new Set(['regione', 'regioneGuarnigione', 'regioneGuarnigioni', 'province', 'provincia',
        'provCount', 'guarnigioni', 'guarnigioniCostiere', 'guarnigioniConfine', 'strade', 'collegate',
        'tipiCollegati', 'mercato', 'citta', 'cittaRegione', 'navi', 'naviTipo',
        'naveGuarnigione', 'capitale', 'fortezza', 'fede',
        'cittaCount', 'cittaRegioneCount', 'fortezze']);
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
            Math.round((typeof n.eccedere === 'number' ? n.eccedere : anc) * 1.2)));
        return Math.min(Math.max(anc, ratchet, lo), hi);
    }

    // Il RITMO del ciclo appena chiuso: quanto il regno è cresciuto, in una
    // cifra sola, dentro la banda stretta [RITMO_MIN, RITMO_MAX] = 0,75 fermo/in
    // ritirata · 1 normale · 1,4 corsa. Si legge dalle province perché sono la
    // misura che ogni regno ha (un tesoro può essere zero per scelta, le province no).
    function ritmoDa(profilo, precedente) {
        if (!profilo || !precedente || !precedente.province) return 1;
        const cresc = (profilo.province - precedente.province) / precedente.province;
        if (cresc <= 0) return RITMO_MIN;
        return Math.min(RITMO_MAX, 1 + cresc);
    }

    // IL PUNTATORE. Dato com'è andato il ciclo, dove si trova ora il regno nella
    // sua storia e con che respiro affronta il pezzo successivo.
    // SI AVANZA IN OGNI CASO (regola dell'utente): la storia di un regno scorre
    // di UN capitolo per ciclo, che il precedente sia stato compiuto o no. Un
    // capitolo non si RIFÀ mai e non si ARRETRA mai — prima un regno che non
    // completava il Primario restava inchiodato allo stesso capitolo per l'intera
    // partita (la Francia bloccata su fr1, che chiede una costa mediterranea che
    // può non possedere). Quel che cambia col merito è solo l'INTENSITÀ con cui si
    // affronta il pezzo successivo: chi ha fatto bene lo prende al respiro pieno,
    // chi le ha prese lo prende a intensità minore — ma lo prende. Il numero del
    // ciclo entra solo come freno (il capitolo non supera `ciclo + FRENO`).
    // L'intensità è una SCALA a tre gradini e si sale o si scende di uno per
    // volta: un gradino per volta consolida invece di far oscillare.
    function giu(i) { return INTENSITA[Math.max(0, INTENSITA.indexOf(i) - 1)] || 'resistere'; }

    // o = { primarioFatto, fatti, intensita, province, provincePrec,
    //       capitalePersa, capitolo, ciclo, capitoli }
    function passo(o) {
        o = o || {};
        const capitoli = Math.max(1, o.capitoli | 0 || 1);
        const cap = Math.max(1, o.capitolo | 0 || 1);
        const ciclo = Math.max(1, o.ciclo | 0 || 1);
        const ora = INTENSITA.indexOf(o.intensita) >= 0 ? o.intensita : 'avanzare';
        // Il capitolo AVANZA sempre di uno, entro il freno e la fine del binario.
        const avanti = (intensita, motivo) => ({
            capitolo: Math.min(cap + 1, Math.min(capitoli, ciclo + FRENO)),
            intensita: intensita, motivo: motivo
        });
        // Crollo: il regno è in ginocchio. Si avanza comunque, ma al respiro minimo.
        if (o.province <= CROLLO_PROV || o.capitalePersa) return avanti('resistere', 'crollo');
        // Capitolo COMPIUTO: col trittico in tasca il pezzo dopo si affronta al massimo.
        if (o.primarioFatto) return avanti(o.fatti >= 3 ? 'eccedere' : 'avanzare',
            o.fatti >= 3 ? 'trionfo' : 'compiuto');
        const perse = typeof o.provincePrec === 'number' && o.province < o.provincePrec;
        // Due obiettivi su tre e il regno non arretra: si sale di un gradino.
        if (o.fatti >= 2 && !perse) return avanti(ora === 'resistere' ? 'avanzare' : ora, 'quasi');
        // Un obiettivo solo: stessa intensità sul capitolo nuovo.
        if (o.fatti >= 1 && !perse) return avanti(ora, 'parziale');
        // Niente fatto, o province perdute: si avanza, ma un gradino più in basso.
        return avanti(giu(ora), perse ? 'arretrato' : 'fermo');
    }

    // Un capitolo di norma elenca le sue tre voci come un array fisso. Il
    // modulo supporta anche una `voci` che è una FUNZIONE `(ctx) => [...]`, per
    // un capitolo il cui pezzo di storia dipende da com'è andato quello PRIMA:
    // la si chiama con lo stato di ADESSO (lo stesso ctx con cui si calibra la
    // soglia), così la scelta si congela alla generazione come ogni altra
    // soglia. Oggi NESSUN binario la usa — i due condizionali bizantini (se
    // teneva la Palestina/l'Italia spingeva oltre) sono caduti con la storia
    // riscritta: Bisanzio non va più in Terra Santa. La capacità resta.
    function voicesOf(cap, ctx) {
        if (typeof cap.voci === 'function') {
            try { return cap.voci(ctx) || []; } catch (e) { return []; }
        }
        return cap.voci;
    }

    // Il capitolo `idx` non ha più niente da dire a questo regno: la sua voce
    // Primaria è già oltre l'ancora più ambiziosa. Serve a far ACCELERARE la
    // storia di chi corre — riceve il pezzo successivo, non lo stesso capitolo
    // con un numero più grande.
    function superato(name, idx, ctx) {
        const cap = chapter(name, idx);
        if (!cap || !ctx) return false;
        const voci = voicesOf(cap, ctx);
        const v = voci[0], t = v && TEMPLATES[v.tmpl];
        const ecc = v && (v.n || {}).eccedere;
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
        const voci = voicesOf(cap, ctx);
        const items = voci.map((v, i) => {
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

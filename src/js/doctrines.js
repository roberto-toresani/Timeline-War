// ============================================================
// DOTTRINE — il CARATTERE STORICO di un regno, sopra la sua strategia.
//
// Una strategia di bot.js (espansione, costruttore, opportunista, predone) dice
// COME si gioca; una dottrina dice PERCHÉ e CONTRO CHI. Serve ai regni che
// nascono per evento (js/events.js) a metà partita — Selgiuchidi, Portogallo,
// Bulgaria, Norvegia e Svezia — che non sono regni generici: hanno tre città da
// prendere, un nemico solo, una fede che non firma coi cristiani, un mare da
// attraversare, una terra su cui non scendono.
//
// Modulo PURO come religions.js/popularity.js: qui c'è solo il sapere (la
// tabella e le domande che le si pongono). Chi la applica è bot.js — negli
// attacchi (bestAttack) e nella diplomazia — e nessun altro. Un regno senza
// dottrina non paga niente di tutto questo: gioca come ha sempre giocato.
//
// FORMA DI UNA DOTTRINA (tutti i campi sono facoltativi)
//   bot          strategia di partenza (chiave di Bot.STRATEGIES)
//   fede         famiglia di fede DICHIARATA: ripiego quando il regno non ha
//                (ancora, o più) una Capitale da cui leggerla
//   vietaFede    famiglie con cui non si firma nulla, mai
//   amici        regni che non si attaccano (salvo che per una `meta`) e con cui
//                si tratta anche attraverso una barriera di fede
//   pattoAmico   il patto che si CERCA con un amico (assente = non lo si propone)
//   nemici       regni da colpire per primi, e con cui non si firma niente
//   pesoNemici   moltiplicatore del punteggio d'attacco contro un nemico
//   mete         province che valgono più di ogni altra cosa finché non sono tue
//   pesoMete     quanto vale una meta, in premio d'attacco
//   marcia       un BINARIO di conquista: tappe ORDINATE {peso, prov:[…]}, da
//                dove si parte a dove si vuole arrivare. Le sue province sono
//                mete a tutti gli effetti, ma ognuna pesa quanto la SUA tappa —
//                è così che l'Orda va a occidente invece che in Cina
//   nessunPatto  non firma niente con nessuno, mai (l'Orda: la sua storia è
//                arrivare, non trattare)
//   senzaFede    non ha una religione propria: ASSIMILA quella delle terre che
//                conquista e non converte nessuno (l'Orda)
//   soloMete     non conquista NIENT'ALTRO che le proprie mete (le tappe della
//                marcia comprese) e le province che gli sono state strappate.
//                È il freno dei regni che seguono una storia sola: l'Orda che
//                deve correre a occidente invece di mangiarsi la Cina, i
//                Bulgari che vogliono la Bulgaria e poi basta
//   vietate      province su cui non si mette piede (la Danimarca dei nordici)
//   conservatore preso ciò che voleva, attacca solo terre di nessuno e i nemici
//   soloMare     non si espande via terra: difende, commercia e va per mare
//   coloniale    quando può, arma il Veliero e salpa a fondare colonie
//   rotte        le direzioni delle spedizioni coloniali, a turni alterni
//   chat         le VOCI del regno in chat (proposta dell'utente): il suo
//                carattere si sente, non solo si subisce. Un oggetto con liste di
//                frasi per categoria — `nemico` (ossessione per il nemico
//                dichiarato, col segnaposto {nemico} = il suo nome), `meta` (la
//                missione), `generico`, `conquista` (reazione a una conquista) e
//                `nemicoVinto` (l'aver battuto proprio il nemico). Le pesca e le
//                invia player-board.js (botIntent/botChatter), non bot.js: sono
//                colore, non una mossa. Chi le fa parlare risolve {nemico} col
//                regno vero, e tace la frase se quel nemico non è in partita.
// ============================================================
(function (root) {
    'use strict';

    // La Danimarca del 1230 (Jutland, Zealand e la Scania, allora danese): i due
    // regni nordici si espandono a SETTENTRIONE e non scendono di lì (regola
    // dell'utente).
    const DANIMARCA = ['Jutland', 'Zealand', 'Scania'];
    // La Finlandia: l'unica terra per cui Norvegia e Svezia si faranno la guerra
    // — chi ci mette le mani per primo tiene anche l'accesso al continente da
    // nord. È `meta` per entrambi, ed è per questo che l'amicizia fra loro non
    // vale qui (vedi isFriend + isMeta in bot.js).
    const FINLANDIA = ['Ostrobothnia', 'Oulu', 'Kuopio', 'Uusimaa'];

    // LA MARCIA DELL'ORDA (1200) — il binario storico dei Mongoli, in tappe
    // ORDINATE da oriente a occidente (regola dell'utente): si attraversa la
    // steppa, si entra in Europa da URALSK, si scende sul Don a ROSTOV, si sfonda
    // nel CUORE dell'Europa centrale. Ogni tappa ha il suo peso, e i pesi crescono
    // verso occidente: la strada della steppa vale poco (è cammino, non bottino),
    // la porta d'Europa e il Volga valgono molto, l'Europa centrale più di tutto.
    // NON serve un puntatore di tappa: la geografia le mette già in fila — Aktobe
    // confina con Uralsk, Uralsk con Tartaria, Tartaria con Rostov — e il peso
    // dice soltanto che, potendo scegliere, l'Orda va a occidente invece di
    // perdersi in Cina o in Persia. Le province sono id VERI del grafo di terra
    // (verificati sulla mappa): chi le ritocca ricontrolli che la catena si tenga.
    const MARCIA_MONGOLA = [
        // la strada della steppa: da Urga al Caspio settentrionale
        { peso: 3, prov: ['Uliastai', 'Altai', 'Jetisy', 'Syrdarya', 'Aktobe'] },
        // la porta d'Europa
        { peso: 8, prov: ['Uralsk'] },
        // il Volga e il Don
        { peso: 8, prov: ['Tartaria', 'Rostov'] },
        // il cuore dell'Europa centrale, per la via dei Galiziani
        { peso: 10, prov: ['Kharkov', 'Kursk', 'Kiev', 'Volhynia', 'East_Galicia',
            'Lesser_Poland', 'West_Galicia', 'Silesia', 'Bohemia', 'Moravia',
            'East_Slovakia', 'Central_Hungary', 'Northern_Transylvania'] },
        // LA BRANCA DI PERSIA (regola dell'utente: "verso medio oriente e russia").
        // Storicamente l'Orda si spacca in due: un'ala scende sull'Iran e sulla
        // Mesopotamia. Pesa MENO della porta d'Europa apposta — il Volga viene
        // prima — e sta in coda all'elenco perché `Doctrines.march` restituisce
        // l'asse in fila e le ondate di rinforzo devono continuare a cadere sulla
        // punta OCCIDENTALE, non su quella persiana. Catena verificata sul grafo:
        // Syrdarya→Khiva→Turkmenia→Khorasan/Mazandaran→Tabriz→Mosul→Baghdad.
        { peso: 4, prov: ['Khiva', 'Turkmenia', 'Khorasan', 'Mazandaran',
            'Tabriz', 'Persian_Kurdistan', 'Mosul', 'Baghdad'] }
    ];

    // LA MARCIA SELGIUCHIDE (1080) — la missione dei Turchi, in tappe ordinate
    // (regola dell'utente): sostenere gli Abbasidi nelle crociate, LIBERARE LA
    // TERRA SANTA dai cristiani, poi puntare su COSTANTINOPOLI e di lì entrare in
    // Europa. I pesi dicono la priorità quando due strade sono aperte insieme: la
    // Terra Santa (8) viene prima della strada d'Anatolia (5), e Costantinopoli
    // (10) è il premio che vale più di tutto. L'ordine in cui si arriva lo impone
    // la geografia — dall'altopiano non si tocca il Bosforo senza attraversare la
    // Frigia. Catena verificata sul grafo: Diyarbakir→Aleppo→Syria/Lebanon→
    // Palestine; Adana→Konya→Hudavendigar→Eastern_Thrace→Thracia europea.
    const MARCIA_SELGIUCHIDE = [
        { peso: 4, prov: ['Ankara', 'Adana', 'Aleppo', 'Deir_Ez_Zor'] },   // l'altopiano e la porta di Siria
        { peso: 8, prov: ['Syria', 'Lebanon', 'Palestine'] },              // la Terra Santa
        { peso: 5, prov: ['Konya', 'Kastamonu', 'Hudavendigar', 'Aydin'] },// la strada di Costantinopoli
        { peso: 10, prov: ['Eastern_Thrace'] },                            // Costantinopoli
        { peso: 7, prov: ['Western_Thrace', 'Northern_Thrace'] }           // e di lì, l'Europa
    ];

    const DOCTRINES = {
        // 1080 — l'onda turca da oriente. Musulmani convinti: con cristiani e
        // ortodossi non si tratta, si combatte. Con gli Abbasidi, che sono della
        // loro fede, ci si allea e si combatte al loro fianco nelle crociate —
        // l'alleanza vale anche come corridoio militare, quindi gli mandano uomini
        // al fronte come ogni alleato (§Diplomazia, sendReinforcements).
        // La missione è una MARCIA (MARCIA_SELGIUCHIDE qui sopra): Terra Santa,
        // poi Costantinopoli, poi l'Europa. Bisanzio è il nemico vero.
        'Sultanato Selgiuchide': {
            bot: 'espansione',
            fede: 'musulmani',
            vietaFede: ['cristiani'],
            amici: ['Califfato Abbaside'],
            pattoAmico: 'alleanza',
            nemici: ['Impero Bizantino'],
            pesoNemici: 1.8,
            marcia: MARCIA_SELGIUCHIDE,
            // I Selgiuchidi sono OSSESSIONATI da Bisanzio (regola dell'utente):
            // lo nominano di continuo, ne pretendono la caduta e Costantinopoli.
            chat: {
                nemico: [
                    '{nemico} siede su Costantinopoli come un usurpatore. Non per molto.',
                    'Il Bosforo parlerà turco, {nemico}. Lo giuro sul Profeta.',
                    'Ogni notte vedo cadere le mura di {nemico}. Presto non sarà più un sogno.',
                    'Non conosceremo pace finché {nemico} regnerà. Prima la Terra Santa, poi la tua città.',
                    '{nemico}, conta i tuoi giorni: la mezzaluna sorge a oriente.',
                    'Costantinopoli è una mela matura, {nemico}. La coglieremo noi.'
                ],
                nemicoVinto: [
                    '{nemico} sanguina. Un altro passo verso Costantinopoli.',
                    'Vedi, {nemico}? Gli eserciti del Sultano non si fermano.'
                ],
                meta: [
                    'Gerusalemme ci attende. La libereremo dai crociati.',
                    'L\'altopiano d\'Anatolia è la culla del nostro impero.'
                ],
                conquista: ['Avanti, sempre avanti: è la volontà del Sultano.']
            }
        },

        // 1150 — nasce in mezzo alla lotta fra Castiglia e Fatimidi, e ne resta
        // fuori: non si espande via terra, si difende, commercia, e quando ha
        // scafi salpa per l'Africa e per l'oceano.
        'Regno di Portogallo': {
            bot: 'costruttore',
            fede: 'cristiani',
            amici: ['Regno di Castiglia'],
            pattoAmico: 'nonBelligeranza',
            // Coi Fatimidi mai: la barriera di fede lo direbbe già, ma per il
            // Portogallo è dottrina, non prudenza.
            vietaFede: ['musulmani'],
            soloMare: true,
            chat: {
                meta: [
                    'Il mare non ha padroni. Noi lo faremo nostro.',
                    'Oltre l\'oceano c\'è un mondo intero, e nessuno vi ha ancora piantato una croce.',
                    'Le nostre caravelle andranno dove le carte finiscono.'
                ],
                generico: ['Castiglia, che la pace fra noi duri: c\'è oceano a sufficienza per entrambi.'],
                conquista: ['Una nuova terra si apre a occidente. Dio lo vuole.']
            },
            // Una COLONIA si fonda su terra di nessuno: `conservatore` gli
            // impedisce di prendersela con i regni (né Yorkshire agli inglesi né
            // le Fiandre ai francesi). Con `soloMare` insieme resta una cosa
            // sola: sbarcare su coste libere, in Africa e oltre l'oceano.
            conservatore: true,
            coloniale: true,
            rotte: ['S', 'W']            // a mezzogiorno l'Africa, a ponente l'oceano (EXPED_DIRS)
        },

        // 1180 — i Bulgari risorgono sul basso Danubio. NON sono un regno
        // espansionista (regola dell'utente): prendono la provincia di Bulgaria e
        // poi basta — si rafforzano, costruiscono e commerciano. `soloMete` è
        // quel "e poi basta": nemmeno una terra di nessuno in più. L'unico regno
        // con cui non firmano è l'Ungheria; con bizantini, russi e chiunque altro
        // si tratta.
        'Regno di Bulgaria': {
            bot: 'costruttore',
            fede: 'cristiani',
            nemici: ['Ducato di Ungheria'],
            pesoNemici: 1.6,
            mete: ['Bulgaria'],
            pesoMete: 5,
            soloMete: true,
            chat: {
                nemico: [
                    '{nemico}, il Danubio è il nostro confine, non la tua strada.',
                    'I Bulgari non dimenticano i torti. {nemico} farebbe bene a ricordarlo.'
                ],
                meta: [
                    'La Bulgaria ai Bulgari. Non chiediamo altro — ma quello lo pretendiamo.',
                    'Un regno piccolo e saldo vale più di un impero che si sfalda.'
                ]
            }
        },

        // 1230 — i due regni scandinavi. Non sono in conflitto: si espandono a
        // nord, non scendono in Danimarca, e si scontrano solo sulla Finlandia.
        'Regno di Norvegia': {
            bot: 'espansione',
            fede: 'cristiani',
            amici: ['Regno di Svezia'],
            mete: FINLANDIA,
            pesoMete: 3,
            vietate: DANIMARCA,
            chat: {
                meta: [
                    'La Finlandia guarda a occidente — cioè guarda a noi.',
                    'Il Nord è vasto e freddo, e porterà il nostro stendardo.'
                ],
                generico: ['I mari del settentrione ci appartengono.']
            }
        },
        'Regno di Svezia': {
            bot: 'espansione',
            fede: 'cristiani',
            amici: ['Regno di Norvegia'],
            mete: FINLANDIA,
            pesoMete: 3,
            vietate: DANIMARCA,
            chat: {
                meta: [
                    'La Finlandia sarà svedese. Che nessuno osi contendercela.',
                    'Da Gotland al Golfo di Botnia: un solo regno, il nostro.'
                ]
            }
        },

        // 1240 — L'ORDA MONGOLA. Non è un regno che cresce: è una MARCIA, e la
        // marcia ha un binario (MARCIA_MONGOLA qui sopra). L'Orda non firma niente
        // con nessuno — `nessunPatto` — perché la sua storia è arrivare, non
        // trattare: senza questo un'Orda che compra pace dall'Ungheria al confine
        // si ferma proprio dove doveva sfondare. Nemici dichiarati i tre regni che
        // travolse davvero; nessuna `fede` dichiarata (i popoli del feltro non
        // stanno in nessuna delle famiglie del gioco) e nessun amico.
        'Mongoli': {
            bot: 'predone',
            nessunPatto: true,
            // I popoli del feltro non portano un dio con sé: prendono quello delle
            // terre in cui entrano (regola dell'utente). Da qui due cose, che sono
            // la stessa: l'Orda non converte NIENTE — la provincia presa tiene i
            // suoi dèi (game-actions.js, imposedFaithOf) — e la sua fede di stato
            // è quella della MAGGIORANZA delle sue province, che cambia da sé man
            // mano che l'impero cambia forma (app.js, stateReligionOf).
            senzaFede: true,
            nemici: ['Kievan Ru\'s', 'Ducato di Ungheria', 'Ducato di Polonia'],
            pesoNemici: 1.8,
            marcia: MARCIA_MONGOLA,
            // L'Orda NON ha voci proattive (né `nemico` né `meta`): resta il
            // segreto della nebbia finché non arriva ai confini di qualcuno (il suo
            // spawn è annunciato solo ai vicini). Ha solo la reazione di conquista,
            // che è fog-gated — si sente quando ormai sta già travolgendo chi la
            // vede. È voluto che l'Orda parli solo con la spada.
            chat: {
                conquista: [
                    'Il cielo eterno ci ha promesso la terra fino al mare d\'occidente.',
                    'Arrendetevi o cadete: all\'Orda non si resiste.',
                    'Dove passano i nostri cavalli, l\'erba non ricresce.'
                ]
            },
            // NIENTE Cina, Corea, Siberia (regola dell'utente): l'Orda deve
            // arrivare in Europa il prima possibile, e ogni provincia presa alle
            // sue spalle è un decennio perso. `soloMete` la inchioda al binario —
            // e il binario, a occidente, finisce dentro Rus', Polonia e Ungheria.
            soloMete: true
        }
    };

    // Gli elenchi si consultano a ogni bersaglio di ogni attacco di ogni bot:
    // diventano Set una volta sola, qui, e la dottrina si porta dietro il proprio
    // indice (niente ricerca per nome a ogni domanda).
    //
    // Una MARCIA (tappe ordinate, ognuna col suo peso) si appiattisce qui dentro:
    // le sue province entrano fra le `mete` e il loro peso in `pesi`, così il resto
    // del modulo — e bot.js, che non cambia di una riga — continua a fare le
    // domande di sempre (isMeta/metaWeight) e riceve la risposta giusta per tappa.
    Object.keys(DOCTRINES).forEach(nome => {
        const d = DOCTRINES[nome];
        const mete = new Set(d.mete || []);
        const pesi = new Map();
        (d.marcia || []).forEach(tappa => {
            (tappa.prov || []).forEach(id => { mete.add(id); pesi.set(id, tappa.peso); });
        });
        Object.defineProperty(d, '_idx', {
            value: {
                mete,
                pesi,
                // Le tappe in fila, da oriente a occidente: è l'ASSE della marcia,
                // e serve fuori di qui (js/events.js: dove cala l'armata di
                // rinforzo dell'Orda). Vuoto per una dottrina senza marcia.
                marcia: (d.marcia || []).reduce((acc, t) => acc.concat(t.prov || []), []),
                vietate: new Set(d.vietate || []),
                amici: new Set(d.amici || []),
                nemici: new Set(d.nemici || []),
                vietaFede: new Set(d.vietaFede || [])
            },
            enumerable: false
        });
    });

    function nameOf(who) {
        if (!who) return null;
        return (typeof who === 'string') ? who : (who.name || null);
    }
    // La dottrina di un regno (record o nome), o null: la grande maggioranza dei
    // regni non ne ha, ed è il caso normale.
    function of(who) {
        const n = nameOf(who);
        return (n && DOCTRINES[n]) || null;
    }
    function idx(d) { return (d && d._idx) || null; }

    function isMeta(d, provId) { const i = idx(d); return !!i && i.mete.has(provId); }
    function forbids(d, provId) { const i = idx(d); return !!i && i.vietate.has(provId); }
    function isFriend(d, who) { const i = idx(d), n = nameOf(who); return !!i && !!n && i.amici.has(n); }
    function isEnemy(d, who) { const i = idx(d), n = nameOf(who); return !!i && !!n && i.nemici.has(n); }
    function blocksFaith(d, famiglia) {
        const i = idx(d);
        return !!i && !!famiglia && i.vietaFede.has(famiglia);
    }
    function faithOf(d) { return (d && d.fede) || null; }

    // Quanto vale, in premio d'attacco, prendere questa provincia per la
    // dottrina. Zero per tutte le altre.
    function metaWeight(d, provId) {
        const i = idx(d);
        if (!i || !i.mete.has(provId)) return 0;
        // Una provincia di MARCIA pesa quanto la sua tappa (la steppa poco,
        // l'Europa centrale molto); una meta semplice pesa il suo pesoMete.
        return i.pesi.has(provId) ? i.pesi.get(provId) : (d.pesoMete || 3);
    }
    function enemyWeight(d, who) {
        return isEnemy(d, who) ? (d.pesoNemici || 1.8) : 1;
    }
    function onlySea(d) { return !!(d && d.soloMare); }
    // Chi segue una storia sola non conquista nient'altro: solo le proprie mete
    // (e le tappe della marcia). Chi lo legge — bot.js — ci aggiunge l'unica
    // deroga sensata: riprendersi quel che gli è stato strappato.
    function onlyGoals(d) { return !!(d && d.soloMete); }
    // L'ORDA non firma niente con nessuno: la sua storia è arrivare, non trattare.
    // Lo legge bot.js in canDealWith, prima ancora della fede.
    function signsNothing(d) { return !!(d && d.nessunPatto); }
    // Un regno SENZA FEDE PROPRIA: non converte e non professa — assimila. Accetta
    // una dottrina, un record di regno o un nome, perché a chiederlo sono app.js
    // (che fede professa) e game-actions.js (che fede impone), che hanno in mano
    // il regno e non la sua dottrina.
    function faithless(who) {
        const d = (who && typeof who === 'object' && who._idx) ? who : of(who);
        return !!(d && d.senzaFede);
    }
    // L'ASSE della marcia: le province delle tappe in fila, da oriente a
    // occidente. Serve a chi deve sapere DOVE punta un'orda senza rifarsi la
    // geografia per conto suo (js/events.js: l'armata di rinforzo cala sulla punta
    // della marcia). Vuoto per una dottrina senza marcia, cioè per quasi tutte.
    function march(who) {
        const i = idx(of(who));
        return i ? i.marcia.slice() : [];
    }
    function isColonial(d) { return !!(d && d.coloniale); }
    // La rotta di una spedizione coloniale: le direzioni si alternano di turno in
    // turno, così il primo scafo va in Africa e il secondo nell'oceano.
    function routeAt(d, turno) {
        const r = (d && d.rotte) || [];
        if (!r.length) return 'W';
        return r[Math.max(0, Math.floor(turno || 0)) % r.length];
    }
    // Un CONSERVATORE non attacca i regni: solo le terre di nessuno, il nemico
    // dichiarato e le proprie mete. `owner` è il nome del proprietario del
    // bersaglio (null/'Neutrale' = terra di nessuno).
    function keepsPeaceWith(d, owner, provId) {
        if (!d || !d.conservatore) return false;
        if (!owner || owner === 'Neutrale') return false;
        return !isEnemy(d, owner) && !isMeta(d, provId);
    }

    root.Doctrines = {
        DOCTRINES,
        of, isMeta, forbids, isFriend, isEnemy, blocksFaith, faithOf,
        metaWeight, enemyWeight, onlySea, onlyGoals, signsNothing, faithless, march, isColonial, routeAt, keepsPeaceWith
    };

})(typeof window !== 'undefined' ? window : this);

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
//   vietate      province su cui non si mette piede (la Danimarca dei nordici)
//   conservatore preso ciò che voleva, attacca solo terre di nessuno e i nemici
//   soloMare     non si espande via terra: difende, commercia e va per mare
//   coloniale    quando può, arma il Veliero e salpa a fondare colonie
//   rotte        le direzioni delle spedizioni coloniali, a turni alterni
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

    // LA MARCIA DELL'ORDA (1240) — il binario storico dei Mongoli, in tappe
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
            'East_Slovakia', 'Central_Hungary', 'Northern_Transylvania'] }
    ];

    const DOCTRINES = {
        // 1080 — l'onda turca da oriente. Musulmani convinti: con cristiani e
        // ortodossi non si tratta, si combatte. Con gli Abbasidi, che sono della
        // loro fede, ci si allea e si commercia.
        'Sultanato Selgiuchide': {
            bot: 'espansione',
            fede: 'musulmani',
            vietaFede: ['cristiani'],
            amici: ['Califfato Abbaside'],
            pattoAmico: 'alleanza',
            nemici: ['Impero Bizantino'],
            pesoNemici: 1.8,
            // Le tre città del secondo ciclo: è lì che si combattono le crociate.
            mete: ['Aleppo', 'Adana', 'Ankara'],
            pesoMete: 4
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
            // Una COLONIA si fonda su terra di nessuno: `conservatore` gli
            // impedisce di prendersela con i regni (né Yorkshire agli inglesi né
            // le Fiandre ai francesi). Con `soloMare` insieme resta una cosa
            // sola: sbarcare su coste libere, in Africa e oltre l'oceano.
            conservatore: true,
            coloniale: true,
            rotte: ['S', 'W']            // a mezzogiorno l'Africa, a ponente l'oceano (EXPED_DIRS)
        },

        // 1180 — i Bulgari risorgono sul basso Danubio. Presa la Bulgaria si
        // chiudono in difesa: l'unico nemico vero è l'Ungheria; con bizantini,
        // russi e chiunque altro si può firmare.
        'Regno di Bulgaria': {
            bot: 'costruttore',
            fede: 'cristiani',
            nemici: ['Ducato di Ungheria'],
            pesoNemici: 1.6,
            mete: ['Bulgaria'],
            pesoMete: 5,
            conservatore: true
        },

        // 1230 — i due regni scandinavi. Non sono in conflitto: si espandono a
        // nord, non scendono in Danimarca, e si scontrano solo sulla Finlandia.
        'Regno di Norvegia': {
            bot: 'espansione',
            fede: 'cristiani',
            amici: ['Regno di Svezia'],
            mete: FINLANDIA,
            pesoMete: 3,
            vietate: DANIMARCA
        },
        'Regno di Svezia': {
            bot: 'espansione',
            fede: 'cristiani',
            amici: ['Regno di Norvegia'],
            mete: FINLANDIA,
            pesoMete: 3,
            vietate: DANIMARCA
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
            nemici: ['Kievan Ru\'s', 'Ducato di Ungheria', 'Ducato di Polonia'],
            pesoNemici: 1.8,
            marcia: MARCIA_MONGOLA
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
    // L'ORDA non firma niente con nessuno: la sua storia è arrivare, non trattare.
    // Lo legge bot.js in canDealWith, prima ancora della fede.
    function signsNothing(d) { return !!(d && d.nessunPatto); }
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
        metaWeight, enemyWeight, onlySea, signsNothing, march, isColonial, routeAt, keepsPeaceWith
    };

})(typeof window !== 'undefined' ? window : this);

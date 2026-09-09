// ============================================================
// REGNI GOVERNATI DALL'IA (i "bot").
// Un bot è un giocatore normale con un campo in più: `player.bot` = chiave di
// STRATEGIES. Non ha poteri speciali — gioca passando dalle STESSE azioni del
// giocatore umano (game-actions.js), quindi rispetta fasi, presidio minimo,
// costi e conquiste. Se una regola cambia lì, cambia anche per loro.
//
// Il turno del bot è un GENERATORE: ogni `yield` è un'azione già eseguita, e il
// driver aspetta qualche centinaio di millisecondi prima di riprendere. Serve a
// poterli GUARDARE giocare sulla mappa (vedi la vista generale in play.html);
// non è una pausa di comodo, è la velocità di lettura della partita.
//
// Chi muove i bot: solo chi ha i permessi di scrittura (Risiko.isAdmin()), come
// per qualsiasi altra scrittura di stato — vedi firebase/firestore.rules.
// ============================================================

(function (root) {
    'use strict';

    const R = () => root.Risiko;
    const E = () => root.Risiko.engine;
    const GA = () => root.GameActions;
    const GR = () => root.GameRules;
    const D = () => root.Diplomacy;   // DIPLOMAZIA (§Diplomazia): la relazione pura

    // ---------- profili di gioco ----------
    // Ogni strategia è un modo diverso di rispondere a tre domande: dove metto le
    // reclute, cosa costruisco, quando attacco. I numeri sono tarati sul modello
    // di battaglia (battle.js: P = A²/(A²+D²)), non scelti a caso:
    //   soglia .55 → basta un leggero vantaggio numerico;  .80 → serve il doppio.
    // `popTarget` è il livello di Popolarità che il regno considera irrinunciabile.
    // 3 è la soglia dei malus: sotto, ogni turno si perdono reclute e risorse (§8),
    // e un regno da tre province con Popolarità 1 raccoglie ZERO — non è una
    // penalità, è un pozzo da cui non si esce più. Chi vuole vivere ci arriva
    // prima di pensare a qualsiasi altra cosa. `guardiaCapitale` non è più un
    // numero fisso: il piano (vedi popPlan) calcola quanti soldati servono
    // DAVVERO, e questo resta solo il ripiego se la Capitale non c'è ancora.
    const STRATEGIES = {
        espansione: {
            nome: 'Espansione',
            motto: 'prende terra a ogni turno, e la difende dopo',
            soglia: 0.55, maxAttacchi: 6, impegno: 1, riservaCasa: 0, guardiaCapitale: 6,
            popTarget: 3,
            pesoNeutrali: 1.3, pesoGiocatori: 1,
            avanzata: 1,            // quota di superstiti che resta nella provincia presa
            build: ['capitale', 'strada', 'citta', 'mercato'],
            mercenari: 4,           // quanti se ne possono comprare in un turno, se servono a vincere
            baratto: 1.2,           // quanto deve ricevere per ogni unità che dà (§7)
            tradimento: 0.4,        // §Diplomazia: quanto è disposto a tradire un patto (0-1)
            dispiegamento: 'punta'
        },
        costruttore: {
            nome: 'Costruttore',
            motto: 'strade, città, e la guerra solo se conviene',
            soglia: 0.75, maxAttacchi: 2, impegno: 0.8, riservaCasa: 1, guardiaCapitale: 8,
            popTarget: 4,
            pesoNeutrali: 1.6, pesoGiocatori: 0.7,
            avanzata: 0.6,
            build: ['capitale', 'strada', 'mercato', 'citta', 'fortezza'],
            mercenari: 1,
            baratto: 0.9,           // le risorse gli servono: tratta volentieri
            tradimento: 0.1,        // quasi mai: la parola data vale
            dispiegamento: 'fronte'
        },
        opportunista: {
            nome: 'Opportunista',
            motto: 'colpisce dove è più debole, non dove è più utile',
            soglia: 0.68, maxAttacchi: 4, impegno: 0.9, riservaCasa: 1, guardiaCapitale: 7,
            popTarget: 3,
            pesoNeutrali: 1.2, pesoGiocatori: 1.1,
            avanzata: 0.8,
            build: ['capitale', 'strada', 'mercato', 'citta'],
            mercenari: 3,
            baratto: 1.1,
            tradimento: 0.85,       // colpisce dove è debole, patto o no
            dispiegamento: 'punta'
        },
        predone: {
            nome: 'Predone',
            motto: 'ignora le terre di nessuno: vuole i regni degli altri',
            soglia: 0.6, maxAttacchi: 5, impegno: 1, riservaCasa: 0, guardiaCapitale: 6,
            popTarget: 3,
            pesoNeutrali: 0.5, pesoGiocatori: 1.8,
            avanzata: 1,
            build: ['capitale', 'strada', 'mercato'],
            mercenari: 4,
            baratto: 2.5,           // prende quello che vuole: quasi non baratta
            tradimento: 1,          // nessuna lealtà: un patto è solo una copertura
            dispiegamento: 'punta'
        }
    };

    const KEYS = Object.keys(STRATEGIES);

    // ---------- DOTTRINA: il carattere storico, sopra la strategia ----------
    // I regni che nascono per evento (js/events.js) non sono regni generici: i
    // Selgiuchidi hanno tre città da prendere e non firmano coi cristiani, il
    // Portogallo non si espande via terra, i nordici non scendono in Danimarca e
    // si contendono solo la Finlandia. Tutto questo vive in js/doctrines.js
    // (puro, per NOME di regno); qui c'è solo il ponte. Chi non ha dottrina —
    // cioè quasi tutti — non paga nulla di tutto ciò.
    const DOC = () => root.Doctrines;
    // Un regno può SOSPENDERE la sua dottrina a partita in corso (l'Orda dal 1350,
    // js/events.js: si ferma, difende e torna a trattare). Da qui in poi gioca come
    // un regno qualunque — nessuna marcia, nessun nemico dichiarato, nessun divieto
    // di patti — con la sola strategia di STRATEGIES. È l'UNICO ponte alla dottrina,
    // quindi spegnerlo qui la spegne dappertutto in bot.js (marchTip la ripesca per
    // nome: va gattato anche là).
    function doctrineOf(player) {
        if (player && player.dottrinaSospesa) return null;
        return DOC() ? DOC().of(player) : null;
    }

    function strategyOf(player) {
        return (player && player.bot && STRATEGIES[player.bot]) || null;
    }
    function isBot(player) { return !!strategyOf(player); }
    function labelOf(player) {
        const s = strategyOf(player);
        return s ? s.nome : 'Umano';
    }

    // ---------- lettura della mappa ----------

    function pathOf(id) { return E().path(id); }
    function troopsAt(id) { const p = pathOf(id); return p ? E().countPiece(p, 'soldato') : 0; }
    function ownerAt(id) { const p = pathOf(id); return p ? E().owner(p) : null; }
    function unitsAt(id) { const p = pathOf(id); return p ? GA().unitsOf([p]) : null; }
    function roomAt(id) {
        const max = (typeof PIECES !== 'undefined' && PIECES.soldato && PIECES.soldato.max) || 30;
        return Math.max(0, max - troopsAt(id));
    }
    // Pronostico su un bersaglio di GA().attackTargets: truppe + mura + TERRENO
    // (§9) + VENTURA delle due parti (§5.3). Non ricalcola niente, chiama la
    // stessa formula della battaglia — così il bot non attacca in montagna
    // credendo di essere in pianura, né conta su mercenari come su sudditi.
    // `fromId` serve a sapere quanti dei partenti sono di ventura: senza, il bot
    // comprerebbe mercenari fidandosi di un pronostico che li ignora.
    function winProbMerc(A, t, mercA) {
        return RisikoBattle.winForecast(A, (t.troops || 0) + (t.fort || 0), t.esponente,
            mercA || 0, t.merc || 0).p;
    }
    function winProb(A, t, fromId) {
        return winProbMerc(A, t, fromId ? GA().mercEngaged(fromId, A) : 0);
    }

    // ---------- il presidio contro le razzie delle terre di nessuno ----------
    // Una neutrale di fede diversa marcia solo a 3 contro 1 (GameRules.neutralCanRaid):
    // basta quindi un pugno di uomini per chiudere quel confine, e il punto è
    // sapere QUANTI. `raidFloor` è il rovescio della regola applicato a una
    // provincia: il presidio sotto il quale una terra di nessuno confinante
    // potrebbe prendersela. Il bot lo tratta come un pavimento — ci schiera fin
    // lì e non scende mai sotto, né attaccando né spostando.
    // Senza questo conto lasciava 1 soldato sui confini neutrali e perdeva
    // province a ogni giro: non per una guerra, per distrazione.
    // Fede diversa = razzia possibile; stessa fede = quel confine è tranquillo
    // per sempre, e non vale la pena presidiarlo.
    // `salvo` = una neutrale da NON contare, perché la si sta per attaccare: se
    // l'attacco riesce quel confine non esiste più, e tenersi in casa il presidio
    // contro la provincia che si vuole prendere significherebbe non prenderla mai.
    function raidFloor(id, salvo) {
        const min = GR().MIN_GARRISON;
        const p = pathOf(id);
        if (!p || typeof Religions === 'undefined') return min;
        const mia = E().religion(p);
        return E().landNeighbors(id).reduce((need, n) => {
            if (n === salvo) return need;
            const np = pathOf(n);
            if (!np || E().owner(np)) return need;             // solo terre di nessuno
            const nf = E().religion(np);
            if (!nf || Religions.sameFaith(nf, mia)) return need;
            return Math.max(need, GR().neutralSafeGarrison(E().countPiece(np, 'soldato')));
        }, min);
    }

    // ---------- L'ISTINTO DI SOPRAVVIVENZA: la difesa contro un REGNO ----------
    // `raidFloor` chiude la porta alle terre di nessuno; questo chiude la porta a
    // un VICINO in armi. Un esercito ammassato al confine è la minaccia vera: se
    // la provincia è troppo sguarnita cade al primo assalto, e se quella provincia
    // è la Capitale cade la partita (§8). Prima il bot vedeva la minaccia solo
    // come un "peso" morbido nello schieramento e spediva comunque tutti gli
    // uomini all'attacco dall'altra parte: nessun istinto di conservazione.
    //
    // `enemyThreat` è l'esercito nemico più forte che potrebbe piombare qui: il
    // MASSIMO degli SPENDIBILI (§5) dei vicini di un altro regno (le neutrali le
    // conta già raidFloor). `defenseFloor` lo traduce in un presidio: abbastanza
    // uomini perché il confine non sia preda a colpo sicuro — sul proprio terreno
    // (§9) tenerne circa i tre quarti è già una difesa seria — ma MAI oltre un
    // tetto, perché un pavimento troppo alto è l'altro modo di perdere: tutti a
    // presidiare, nessuno a conquistare. `salvo` = il nemico che si sta per
    // attaccare proprio da qui: prenderlo TOGLIE la minaccia, quindi non si conta
    // (come il `salvo` di raidFloor), se no il regno non contrattaccherebbe mai.
    const DEFEND_RATIO = 0.7;   // quanta parte dell'esercito nemico si eguaglia
    const DEFENSE_CAP = 12;     // nessuna provincia pretende più uomini di così
    const BETRAY_RELUCTANCE = 0.6;  // §Diplomazia: pedaggio fisso sullo score di un tradimento
    // DOTTRINA: quanto si sconta l'attacco a un AMICO storico (Selgiuchidi e
    // Abbasidi, i due regni nordici). Più caro di un tradimento: un patto si
    // rompe per un buon bottino, un'amicizia di sangue no.
    const FRIEND_DISCOUNT = 0.25;
    const FRIEND_TOLL = 0.8;
    function enemyThreat(player, id, salvo) {
        return E().landNeighbors(id).reduce((max, n) => {
            if (n === salvo) return max;
            const np = pathOf(n);
            if (!np) return max;
            const chi = E().owner(np);
            if (!chi || chi === player.name) return max;   // libero o mio: non è un invasore
            // Un partner di non aggressione (§Diplomazia) non ti invade: il suo
            // confine è tranquillo e non chiede presidio. Vale finché il patto
            // regge — se lui tradisce, al giro dopo torna a contare.
            const altro = D() ? R().players().find(p => p.name === chi) : null;
            if (altro && D().grantsNonAggression(player, altro)) return max;
            return Math.max(max, GR().spendableTroops(E().countPiece(np, 'soldato')));
        }, 0);
    }
    function defenseFloor(player, id, salvo) {
        const minaccia = enemyThreat(player, id, salvo);
        if (minaccia < 2) return 0;                        // un uomo solo non è un'invasione
        return Math.min(DEFENSE_CAP, Math.ceil(minaccia * DEFEND_RATIO));
    }
    // Il pavimento COMPLESSIVO di una provincia: né una razzia né un vicino in
    // armi devono trovarla sguarnita. È l'unico numero che survey, gli attacchi e
    // gli spostamenti usano come "quanti restano comunque qui".
    function holdFloor(player, id, salvo) {
        return Math.max(raidFloor(id, salvo), defenseFloor(player, id, salvo));
    }

    // Ritratto di una provincia del regno: quanto vale come base di partenza e
    // quanto è esposta. Tutto quello che decide il bot esce da qui.
    function survey(player) {
        return E().ownedPaths(player.name).map(path => {
            const id = path.id;
            const vicini = E().landNeighbors(id).filter(n => ownerAt(n) !== player.name);
            const minaccia = vicini.reduce((s, n) => {
                const chi = ownerAt(n);
                return s + troopsAt(n) * (chi ? 1.5 : 0.6);   // un regno vicino pesa più di una terra neutra
            }, 0);
            const debolezza = vicini.reduce((m, n) => Math.max(m, 1 / (1 + troopsAt(n))), 0);
            // Il presidio tiene conto ANCHE del vicino in armi, non solo delle
            // razzie: così le reclute vanno a rinforzare i confini minacciati e gli
            // attacchi/spostamenti non li lasciano scoperti (istinto di difesa).
            const presidio = holdFloor(player, id);
            return {
                id, path,
                truppe: troopsAt(id),
                spare: GR().spendableTroops(troopsAt(id)),
                // Quel che può DAVVERO uscire di qui: il presidio minimo (§5) non
                // basta dove una neutrale ostile aspetta il confine sguarnito.
                mobili: Math.max(0, Math.min(GR().spendableTroops(troopsAt(id)),
                    troopsAt(id) - presidio)),
                presidio,
                scoperta: Math.max(0, presidio - troopsAt(id)),
                fronte: vicini.length > 0,
                vicini, minaccia, debolezza
            };
        });
    }

    // ---------- IL PIANO DEL REGNO (Popolarità, §8) ----------
    // La cosa che ammazzava i bot non era la guerra: era restare a Popolarità 1.
    // A quel livello si perdono 2 reclute e 2 risorse a turno, cioè l'intero
    // raccolto di un regno piccolo — niente truppe, niente costruzioni, niente
    // modo di rimediare. E le due leve per uscirne (tassa più leggera, guardia
    // cittadina più alta) non costano quasi nulla: bastava chiederselo.
    //
    // `popState` è quel "chiederselo": misura i fattori veri sulla mappa
    // (Risiko.popularityFactors, gli stessi che vede il pannello del giocatore) e
    // li dà a Popularity.plan, che risponde con la combinazione più economica di
    // tassazione e guardia che raggiunge il livello voluto. Da lì escono tre
    // decisioni: quanto tassare, quanti soldati tenere in Capitale, e quanto vale
    // una conquista che toglie una nemica dal confine della Capitale.
    const FOOD_RES = ['grano', 'bestiame'];

    function popState(player, s, og) {
        const cap = R().getCapitalPathFor(player);
        if (!cap || typeof root.Popularity === 'undefined' || !R().popularityFactors) return null;

        const collegate = GA().connectedOf(player);
        const m = R().popularityFactors(player, cap, collegate);
        const units = GA().unitsOf(E().ownedPaths(player.name));

        // Quanti soldati può ARRIVARE ad avere la Capitale in questo turno: quelli
        // che ci sono, più le reclute in mano, più il massimo che un solo
        // spostamento di fine turno può portarci. Chiedere un piano da 10 soldati
        // quando se ne possono avere 7 è chiedere un piano che non si eseguirà.
        const reclute = (player.recluteDaSchierare || 0) + (GA().boundPool(player)[cap.id] || 0);
        let trasferibili = 0;
        GA().ownAdjacent(player, cap.id).forEach(id => {
            trasferibili = Math.max(trasferibili, GR().spendableTroops(troopsAt(id)));
        });
        const maxSoldiers = Math.min(m.soldiers + reclute + trasferibili,
            m.soldiers + roomAt(cap.id));

        // Un obiettivo aperto può chiedere più Popolarità/Sicurezza di quanta la
        // strategia già ne persegua (§10): il target vero è il più alto dei due.
        const target = Math.max(s.popTarget || 3, (og && og.popTarget) || 0);
        const piano = root.Popularity.plan(m, {
            target,
            maxSoldiers,
            cities: Math.max(1, units.citta + units.capitale)
        });

        // I tipi di risorsa GIÀ collegati: serve a sapere se una provincia nuova
        // porterebbe varietà (§8) o solo un doppione.
        const tipiCollegati = new Set();
        collegate.forEach(id => {
            const k = R().resourceKeyOf(pathOf(id));
            if (k) tipiCollegati.add(k);
        });

        // I confinanti della Capitale, una volta sola: `popValueOf` li interroga
        // per ogni bersaglio di ogni provincia, e sono sempre gli stessi.
        return {
            cap, m, piano, collegate, tipiCollegati,
            capNeigh: new Set(E().landNeighbors(cap.id))
        };
    }

    // Quanti soldati vuole la Capitale. Il piano lo calcola; senza piano (Capitale
    // non ancora costruita) resta il numero fisso della strategia.
    // Sotto i 5 il piano non chiederà mai di scendere — `P_guardia` conta i soldati
    // OLTRE i cinque, quindi da 5 in giù la Popolarità non guadagna nulla — ma un
    // regno con la Capitale a 1 uomo la perde al primo che passa, e con lei la
    // Popolarità, il raccolto e la partita. Il piano ottimizza il popolo; questo
    // pavimento ricorda che la Capitale va comunque difesa.
    const GUARD_FLOOR = 5;
    function guardWanted(st, s) {
        return Math.max(GUARD_FLOOR, st ? st.piano.soldiers : (s.guardiaCapitale || 6));
    }
    // La guardia che la Capitale vuole DAVVERO: quella che ottimizza la Popolarità
    // (guardWanted) in tempo di pace, ma ALZATA a difesa quando un regno le è
    // arrivato alle porte (holdFloor). Senza minaccia resta al livello del piano e
    // gli uomini in più escono a conquistare — non marciscono in Capitale (regola
    // dell'utente); con l'invasore al confine, invece, la si rinforza per prima.
    function capitalGuard(player, s, st, cap) {
        const c = cap || (st ? st.cap : R().getCapitalPathFor(player));
        const base = guardWanted(st, s);
        return c ? Math.max(base, holdFloor(player, c.id)) : base;
    }

    // Quanto vale, in Popolarità, mettere le mani su questa provincia. Due voci:
    // una nemica in meno al confine della Capitale (Sicurezza) e una risorsa che
    // porta varietà o cibo (Benessere). La seconda conta solo se la provincia è
    // COLLEGABILE — una risorsa scollegata non entra nel Benessere né nel raccolto
    // (§4), e prometterselo sarebbe barare col proprio pronostico.
    function popValueOf(st, provId, viaMare) {
        if (!st) return 0;
        const delta = {};
        if (st.capNeigh.has(provId)) {
            delta.enemyBorders = Math.max(0, st.m.enemyBorders - 1);
        }
        const k = R().resourceKeyOf(pathOf(provId));
        if (k && !viaMare && E().landNeighbors(provId).some(n => st.collegate.has(n))) {
            if (!st.tipiCollegati.has(k)) delta.varieta = st.m.varieta + 1;
            if (FOOD_RES.indexOf(k) >= 0) delta.foodProv = st.m.foodProv + 1;
        }
        if (!Object.keys(delta).length) return 0;
        return root.Popularity.gainIf(st.m, delta);
    }

    // ---------- LA VENDETTA (lettura del rancore) ----------
    // Il torto lo scrive la conquista (game-actions.applyBattleOutcome, unico
    // punto): `player.rancore` elenca le province PREZIOSE strappate al regno e chi
    // le ha prese, col `peso` di quanto bruciano (Capitale 3, Città/Fortezza 2,
    // risorsa 1). Qui lo si legge: quanto vale, IN PIÙ, riprendersi questa
    // provincia. Il rancore ha effetto solo finché il bersaglio ha senso — se chi
    // l'ha presa non la tiene più (l'ha persa a sua volta) la vendetta ha smarrito
    // il colpevole e tace. Quando la provincia torna nostra il rancore si spegne
    // da sé (clearGrudge in game-actions), quindi qui non serve potarlo.
    function grudgeAgainst(player, provId) {
        const lista = player && player.rancore;
        if (!Array.isArray(lista) || !lista.length) return 0;
        const chi = ownerAt(provId);
        if (!chi || chi === player.name) return 0;
        return lista.reduce((peso, g) => {
            if (g.prov !== provId) return peso;
            if (g.chi && g.chi !== chi) return peso;      // colpevole diverso: non è la stessa offesa
            return Math.max(peso, g.peso || 1);
        }, 0);
    }

    // ---------- OBIETTIVI DI PRESTIGIO (§10): i bot li perseguono DAVVERO ----------
    // js/objectives.js porta, su ogni obiettivo del ciclo, un `hint`: la STESSA
    // richiesta del `check` spezzata in dati che un bot può confrontare con la
    // mappa (vocabolario in testa a quel file), non una seconda regola. Il
    // `hint` arriva ORA sulla valutazione stessa (Risiko.objectivesFor), che lo
    // ricostruisce dal template e dalla soglia dell'assegnazione: non c'è più un
    // catalogo da ripescare per NOME di regno, perché gli obiettivi sono
    // generati per capitolo. Si scartano i già completati e quel che resta
    // diventa spinte concrete:
    // bersagli d'attacco da preferire, province da presidiare a una soglia,
    // monete e scorte da non spendere sotto un tetto, un sito di costruzione
    // preciso. Senza questo un bot gioca bene ma alla cieca — mai il bersaglio
    // che il foglio degli obiettivi chiede — ed è esattamente la domanda a cui
    // una partita di prova deve rispondere: sono obiettivi fattibili?
    function objectiveGoals(player) {
        if (typeof root.Objectives === 'undefined' || !R().objectivesFor) return [];
        const ev = R().objectivesFor(player);
        if (!ev || !ev.items) return [];
        return ev.items
            .filter(it => it.hint && !it.completato)
            .map(it => ({ id: it.id, punti: it.punti, hints: Array.isArray(it.hint) ? it.hint : [it.hint] }));
    }

    // Quante monete NON toccare perché un obiettivo aperto chiede un tesoro. Solo
    // negli ultimi turni del ciclo si fa sul serio (`left <= 3`): prima le monete
    // servono a costruire, un tesoro messo via troppo presto è un regno fermo.
    function objectiveGoldFloor(goals) {
        let floor = 0;
        goals.forEach(g => g.hints.forEach(h => { if (h.gold) floor = Math.max(floor, h.gold); }));
        if (!floor) return 0;
        const turn = R().turn ? R().turn() : 1;
        const left = 10 - ((Math.max(1, turn) - 1) % 10);
        return left > 3 ? Math.round(floor * 0.4) : floor;
    }

    // Scorte minime da non svendere perché un obiettivo aperto le vuole in
    // magazzino. `resourceNeed` le tratta come un bisogno vero: il Mercato non
    // le vende (bassa `avanza()`) e la banca le compra.
    function objectiveStockFloor(goals) {
        const floor = {};
        goals.forEach(g => g.hints.forEach(h => {
            if (h.stock && typeof h.min === 'number') floor[h.stock] = Math.max(floor[h.stock] || 0, h.min);
        }));
        return floor;
    }

    // Il livello di Popolarità/Sicurezza/Benessere che un obiettivo chiede, se
    // più alto di quello che la strategia già persegue (popState). Le due
    // componenti non hanno un piano a sé: alzare il target di Popolarità totale
    // spinge le leve che le fanno salire (tassa e guardia per la Sicurezza,
    // strade e risorse collegate per il Benessere — che `roadWorth` e
    // `popValueOf` già inseguono), quindi è l'approssimazione giusta.
    function objectivePopTarget(goals) {
        let target = 0;
        goals.forEach(g => g.hints.forEach(h => {
            if (typeof h.popularity === 'number') target = Math.max(target, h.popularity);
            if (typeof h.security === 'number') target = Math.max(target, h.security);
            if (typeof h.welfare === 'number') target = Math.max(target, h.welfare);
        }));
        return Math.min(5, target);
    }

    // Qualunque obiettivo "province ≥ N" rende utile una terra in più anche
    // fuori da una regione precisa: un piccolo premio piatto su OGNI bersaglio,
    // proporzionale ai punti in palio.
    function objectiveProvCountBonus(goals) {
        let bonus = 0;
        goals.forEach(g => g.hints.forEach(h => { if (h.provCount) bonus = Math.max(bonus, g.punti * 0.06); }));
        return bonus;
    }

    // Quanto vale, in punteggio d'attacco, prendere QUESTA provincia per gli
    // obiettivi ancora aperti: la somma dei pesi di ogni regione/provincia che la
    // riguarda (i punti dell'obiettivo, 5/3/2, contano più del generico
    // `provCount`, che vale per qualunque terra e quindi pesa poco a bersaglio
    // singolo).
    function objectiveAttackWeight(og, provId) {
        if (!og) return 0;
        let peso = og.provCountBonus || 0;
        og.goals.forEach(g => g.hints.forEach(h => {
            if (h.region && h.region.has(provId)) peso += g.punti * 0.5;
            if (h.province === provId) peso += g.punti * 0.7;
            if (h.provinces && h.provinces.indexOf(provId) >= 0) peso += g.punti * 0.6;
        }));
        return peso;
    }

    // A quale provincia (già mia) un obiettivo chiede una soglia di soldati:
    // radunare un'oste per il Papa, tenere un avamposto, difendere Tyrol. Il
    // MASSIMO fra tutti gli obiettivi che la riguardano, così due richieste sulla
    // stessa provincia non si sommano. `garrisonAny` (una costa qualunque del
    // set, non tutte) sceglie quella già mia più avanti verso la soglia.
    function objectiveGarrisonNeeds(player, goals) {
        const need = new Map();
        const mine = id => ownerAt(id) === player.name;
        goals.forEach(g => g.hints.forEach(h => {
            if (h.province && typeof h.min === 'number' && h.min > 0 && mine(h.province)) {
                need.set(h.province, Math.max(need.get(h.province) || 0, h.min));
            }
            if (h.provinces && typeof h.min === 'number' && h.min > 0) {
                h.provinces.filter(mine).forEach(id => need.set(id, Math.max(need.get(id) || 0, h.min)));
            }
            if (h.garrisonAny && h.region) {
                let best = null;
                h.region.forEach(id => {
                    if (!mine(id)) return;
                    if (!best || troopsAt(id) > troopsAt(best)) best = id;
                });
                if (best) need.set(best, Math.max(need.get(best) || 0, h.garrisonAny));
            }
            if (h.shipGarrison) {
                let best = null;
                E().ownedPaths(player.name).forEach(p => {
                    if (!E().ships(p).length) return;
                    if (!best || troopsAt(p.id) > troopsAt(best)) best = p.id;
                });
                if (best) need.set(best, Math.max(need.get(best) || 0, h.shipGarrison));
            }
            if (h.city && typeof h.min === 'number' && h.min > 0) {
                // Un `at` esplicito (es. Kiev) vale solo finché non è mio: se non
                // lo possiedo ancora non c'è niente da presidiare lì, e ricadere
                // su una Città qualunque garrigerebbe il posto sbagliato.
                const at = h.at ? (mine(h.at) ? h.at : null)
                    : (E().ownedPaths(player.name).find(p => (unitsAt(p.id) || {}).citta) || {}).id;
                if (at) need.set(at, Math.max(need.get(at) || 0, h.min));
            }
        }));
        return need;
    }

    // La provincia dove un obiettivo vuole la Città PROPRIO lì (es. Kiev per la
    // Rus'), se ne ha una in sospeso. `siteFor` la usa come sito forzato: se è
    // fra i siti papabili (mia, libera, si può pagare) la sceglie, altrimenti
    // ricade sul punteggio generico.
    function objectiveCityAt(goals) {
        let at = null;
        goals.forEach(g => g.hints.forEach(h => { if (h.city && h.at) at = h.at; }));
        return at;
    }

    // Tutto quel che serve al resto del turno, calcolato una volta sola: gli
    // obiettivi aperti cambiano poco durante un turno di un bot, quindi non c'è
    // bisogno di rileggerli a ogni azione (come invece `st`, che una conquista
    // può cambiare da un momento all'altro).
    function objectiveState(player) {
        const goals = objectiveGoals(player);
        if (!goals.length) return null;
        return {
            goals,
            provCountBonus: objectiveProvCountBonus(goals),
            garrisonNeeds: objectiveGarrisonNeeds(player, goals),
            goldFloor: objectiveGoldFloor(goals),
            stockFloor: objectiveStockFloor(goals),
            popTarget: objectivePopTarget(goals),
            cityAt: objectiveCityAt(goals)
        };
    }

    // ---------- FASE 1 · schieramento ----------

    // Ripartisce N reclute fra le province secondo i pesi, col metodo dei resti
    // maggiori: nessuna recluta si perde per arrotondamento.
    function share(n, entries) {
        const tot = entries.reduce((s, e) => s + e.peso, 0);
        if (!tot || !n) return [];
        const quota = entries.map(e => ({ id: e.id, esatto: n * e.peso / tot }));
        const out = quota.map(q => ({ id: q.id, n: Math.floor(q.esatto) }));
        let resto = n - out.reduce((s, o) => s + o.n, 0);
        quota.map((q, i) => ({ i, f: q.esatto - Math.floor(q.esatto) }))
            .sort((a, b) => b.f - a.f)
            .forEach(x => { if (resto > 0) { out[x.i].n++; resto--; } });
        return out.filter(o => o.n > 0);
    }

    function deployPlan(player, s, st, og) {
        let pool = player.recluteDaSchierare || 0;
        if (!pool) return [];
        const prov = survey(player);
        if (!prov.length) return [];

        const piano = [];

        // PRIMA DI TUTTO: la guardia della Capitale. La Popolarità (§8) conta i
        // soldati OLTRE i cinque presenti nella Capitale, e ogni livello perso
        // costa reclute e risorse a ogni turno: riempire la guardia vale più di
        // qualsiasi provincia in più. È la prima cosa che fa un bot.
        // Quanti ne servono lo dice il piano, non un numero fisso: la guardia
        // rende a scatti (5 soldati = 0 punti, 10 = 5, il massimo), quindi
        // parcheggiarne 7 significa spendere metà leva e 12 buttarne due.
        const cap = st ? st.cap : R().getCapitalPathFor(player);
        if (cap) {
            // Con un invasore alle porte la guardia richiesta sale (capitalGuard):
            // difendere il seggio viene prima di qualsiasi provincia in più.
            const manca = capitalGuard(player, s, st, cap) - troopsAt(cap.id);
            const n = Math.min(Math.max(0, manca), pool, roomAt(cap.id));
            if (n > 0) { piano.push({ id: cap.id, n }); pool -= n; }
        }
        if (!pool) return piano;

        // SUBITO DOPO: i confini che una terra di nessuno potrebbe razziare.
        // Costa pochissimo — di solito 1 o 2 uomini, perché la razzia vuole 3
        // contro 1 — e ogni recluta spesa qui vale una provincia intera: quella
        // persa a fine giro sarebbe tornata neutrale, con le sue costruzioni, e
        // andrebbe riconquistata da capo. Si comincia dalle più scoperte.
        prov.filter(p => p.scoperta > 0 && p.id !== (cap && cap.id))
            .sort((a, b) => b.scoperta - a.scoperta)
            .forEach(p => {
                if (!pool) return;
                const n = Math.min(p.scoperta, pool, roomAt(p.id));
                if (n > 0) { piano.push({ id: p.id, n }); pool -= n; }
            });
        if (!pool) return piano;

        // OBIETTIVI (§10): province che un obiettivo aperto vuole vedere a una
        // soglia precisa di soldati (un'oste da radunare per il Papa, un
        // avamposto da tenere). Vale una provincia intera anche qui, e spesso è
        // la parte più facile del foglio: bastano reclute, non conquiste.
        if (og && og.garrisonNeeds && og.garrisonNeeds.size) {
            Array.from(og.garrisonNeeds.entries())
                .sort((a, b) => b[1] - a[1])
                .forEach(([id, min]) => {
                    if (!pool) return;
                    const manca = min - troopsAt(id);
                    const n = Math.min(Math.max(0, manca), pool, roomAt(id));
                    if (n > 0) { piano.push({ id, n }); pool -= n; }
                });
        }
        if (!pool) return piano;

        const fronte = prov.filter(p => p.fronte);
        const base = fronte.length ? fronte : prov;

        // "punta": due terzi delle reclute nella provincia da cui conviene
        // attaccare, il resto sul fronte. Se c'è un torto da vendicare (una
        // provincia preziosa persa) e la si può riprendere da un confine, la
        // punta si ammassa LÌ: è così che la vendetta si vede sulla mappa invece
        // di restare un numero. Altrimenti si sceglie il bersaglio più debole.
        if (s.dispiegamento === 'punta' && fronte.length) {
            const vendetta = base.filter(p =>
                p.vicini.some(n => grudgeAgainst(player, n) > 0));
            const lancia = (vendetta.length ? vendetta : base)
                .slice().sort((a, b) => b.debolezza - a.debolezza)[0];
            const grosso = Math.min(Math.max(1, Math.round(pool * 0.66)), roomAt(lancia.id));
            piano.push({ id: lancia.id, n: grosso });
            const resto = pool - grosso;
            const altri = base.filter(p => p.id !== lancia.id);
            if (resto > 0 && altri.length) {
                share(resto, altri.map(p => ({ id: p.id, peso: 1 + p.minaccia })))
                    .forEach(x => piano.push(x));
            }
            return piano.filter(x => x.n > 0);
        }

        // "minaccia": tutto dove il nemico preme di più. "fronte": distribuito.
        const pesi = base.map(p => ({
            id: p.id,
            peso: s.dispiegamento === 'minaccia' ? 1 + p.minaccia * 2 : 1 + p.minaccia * 0.5
        }));
        share(pool, pesi).forEach(x => piano.push(x));
        return piano.filter(x => x.n > 0);
    }

    // ---------- FASE 2 · costruzioni ----------

    // Prima strada utile: collega una provincia SCOLLEGATA a una già collegata
    // alla Capitale (§4). È la costruzione che sblocca la raccolta, quindi viene
    // prima di tutto il resto; con `stradeGratis` non costa nulla.
    //
    // QUALE collegare per prima non è indifferente. Una provincia collegata dà
    // una risorsa a turno (§4), ma se quella risorsa è un TIPO NUOVO alza anche la
    // varietà, e se è Grano o Bestiame alza il Cibo: sono due delle quattro voci
    // del Benessere (§8), cioè un terzo della Popolarità. Prima si ordinava solo
    // per "ha una risorsa": un doppione di legno valeva quanto il primo campo di
    // grano del regno.
    function roadWorth(st, id) {
        const k = R().resourceKeyOf(pathOf(id));
        if (!k) return 0;
        let val = 1;                                  // +1 risorsa a turno, sempre
        if (k === 'pietra') val += 0.5;               // la pietra fa le strade dopo
        if (st) {
            const delta = {};
            if (!st.tipiCollegati.has(k)) delta.varieta = st.m.varieta + 1;
            if (FOOD_RES.indexOf(k) >= 0) delta.foodProv = st.m.foodProv + 1;
            if (Object.keys(delta).length) val += root.Popularity.gainIf(st.m, delta) * 12;
        }
        return val;
    }

    // Il gancio non è indifferente: la Strada costa 1 Pietra e **1 soldato pagato
    // sulla provincia di aggancio** (§6, `COSTS.strada`), e col presidio minimo
    // (§5) un aggancio con un solo uomo non può pagarlo. Prendendo il primo
    // aggancio che càpita — com'era prima — bastava che quello avesse 1 soldato
    // per far fallire la strada, e con essa TUTTE le strade del turno: i bot
    // finivano con 60 Pietra in cassa e metà regno scollegato, cioè senza raccolto
    // e senza Benessere. Quindi si guardano tutti gli agganci possibili e si tiene
    // solo chi può pagare, preferendo il più guarnito.
    function nextRoad(player, st) {
        const collegate = st ? st.collegate : GA().connectedOf(player);
        const mie = E().ownedPaths(player.name).map(p => p.id);
        if (!collegate.size) return null;
        const gratis = (player.stradeGratis || 0) > 0;
        const candidate = [];
        mie.filter(id => !collegate.has(id)).forEach(id => {
            const valore = roadWorth(st, id);
            E().landNeighbors(id).forEach(n => {
                if (!collegate.has(n) || E().hasRoad(id, n)) return;
                const paga = GR().spendableTroops(troopsAt(n));
                if (!gratis && paga < (GR().COSTS.strada.soldati || 1)) return;
                candidate.push({ a: n, b: id, valore, paga });
            });
        });
        if (!candidate.length) return null;
        candidate.sort((x, y) => (y.valore - x.valore) || (y.paga - x.paga));
        return candidate[0];
    }

    // ---------- DOVE SIEDE LA CAPITALE ----------
    // Non è una costruzione come le altre: la Capitale DECIDE due terzi della
    // Popolarità (§8). La Sicurezza si misura sui suoi confini (`P_conf = 5 − e`,
    // e = province non tue che la toccano, terre di nessuno comprese), e il
    // Benessere si misura sulla rete di strade che parte da lei (§4) — una
    // Capitale in un angolo del regno lascia metà province scollegate per sempre.
    // Sbagliare questa scelta al turno 1 costa l'intera partita, ed è il motivo
    // per cui i regni dell'IA si bloccavano: sceglievano la provincia con più
    // soldati, che è quasi sempre quella di frontiera.
    //
    // Il punteggio pesa quel che conta davvero, nell'ordine:
    //   PROTEZIONE  — `P_conf` che avrebbe se sedesse lì. Vale doppio: è la metà
    //                 della Sicurezza e l'unico fattore che non si può comprare.
    //   RISORSE     — quante ne raggiunge attraverso il PROPRIO territorio, con
    //                 uno sconto per ogni passo di distanza (ogni passo è una
    //                 strada da costruire: 1 Pietra e 1 soldato). Un tipo mai
    //                 visto e il cibo pesano di più, perché sono due delle
    //                 quattro voci del Benessere.
    //   PRESENZA    — dove ci sono già uomini, e lontano da dove il nemico preme.
    const CAPITAL_REACH = 3;        // passi di territorio proprio che si guardano

    function capitalScore(player, p) {
        const mie = new Set(E().ownedPaths(player.name).map(x => x.id));
        const stranieri = E().landNeighbors(p.id).filter(n => !mie.has(n)).length;
        const pConf = Math.max(0, Math.min(5, 5 - stranieri));

        // Le risorse a portata di strada, scontate per distanza.
        const tipi = new Set();
        let risorse = 0;
        let onda = [p.id];
        const visti = new Set(onda);
        for (let dist = 0; dist <= CAPITAL_REACH && onda.length; dist++) {
            const prossima = [];
            onda.forEach(id => {
                const k = R().resourceKeyOf(pathOf(id));
                if (k) {
                    let peso = 1;
                    if (!tipi.has(k)) { peso += 1; tipi.add(k); }
                    if (FOOD_RES.indexOf(k) >= 0) peso += 1;
                    risorse += peso / (1 + dist);
                }
                E().landNeighbors(id).forEach(n => {
                    if (visti.has(n) || !mie.has(n)) return;
                    visti.add(n);
                    prossima.push(n);
                });
            });
            onda = prossima;
        }

        // Il salto da 1 a 0 non è un punto come gli altri: a `P_conf = 0` la
        // Sicurezza dipende solo dalla guardia, cioè si dimezza per sempre. È la
        // trappola del turno 1 (§8) resa permanente da una scelta di sito, e vale
        // una penalità a sé — se no un campo di grano basta a farci sedere sopra
        // una Capitale con sei confini nemici.
        const protezione = pConf * 2 - (pConf === 0 ? 2 : 0);
        return protezione + risorse + (p.truppe || 0) * 0.1 - (p.minaccia || 0) * 0.15;
    }

    // Dove mettere una costruzione.
    // Il costo in soldati si paga SULLA PROVINCIA (§6) e sopra il presidio minimo
    // (§5): un sito che non può pagarlo non è un sito, e sceglierlo lo stesso
    // significa rinunciare alla costruzione anche quando un'altra provincia del
    // regno l'avrebbe pagata senza problemi. È lo stesso inciampo che teneva i
    // bot senza Mercato (4 soldati) per tutta la partita.
    function siteFor(player, type, s, og) {
        const serve = (GR().COSTS[type] || {}).soldati || 0;
        const insediamento = (type === 'capitale' || type === 'citta' || type === 'fortezza');
        let prov = survey(player).filter(p => {
            const u = unitsAt(p.id);
            if (!u) return false;
            if (u.capitale || u.citta || u.fortezza) return false;   // insediamenti esclusivi
            // Mercato e insediamenti si escludono a vicenda: un insediamento non va
            // dove c'è già un Mercato, e il Mercato non va su un insediamento (già
            // escluso sopra).
            if (insediamento && u.mercato) return false;
            return true;
        });
        if (serve) {
            const paganti = prov.filter(p => p.spare >= serve);
            if (!paganti.length) return null;
            prov = paganti;
        }
        if (!prov.length) return null;
        // OBIETTIVI (§10): la Città che un obiettivo vuole PROPRIO in una
        // provincia (es. Kiev per la Rus') si costruisce lì se è fra i siti
        // papabili; altrimenti si ricade sul punteggio generico.
        if (type === 'citta' && og && og.cityAt) {
            const forced = prov.find(p => p.id === og.cityAt);
            if (forced) return forced;
        }
        if (type === 'capitale') {
            // Il punteggio si calcola UNA volta per provincia: dentro il
            // comparatore verrebbe rifatto a ogni confronto, e ognuno costa una
            // visita del territorio.
            const pesate = prov.map(p => ({ p, punti: capitalScore(player, p) }));
            pesate.sort((a, b) => b.punti - a.punti);
            return pesate.length ? pesate[0].p : null;
        }
        if (type === 'fortezza') {
            return prov.slice().sort((a, b) => b.minaccia - a.minaccia)[0] || null;
        }
        // Città e Mercato: nell'entroterra collegato, dove non verranno presi il
        // turno dopo. (Il Mercato deve stare in una provincia del regno e basta,
        // ma metterlo in prima linea è un modo per regalarlo al vicino.)
        const rete = GA().connectedOf(player);
        const buone = prov.filter(p => rete.has(p.id));
        const pool = buone.length ? buone : prov;
        return pool.slice().sort((a, b) => a.minaccia - b.minaccia)[0] || null;
    }

    function canBuild(player, type, provId) {
        const cost = GR().COSTS[type];
        if (!cost) return false;
        return GR().canAfford(player, cost, GR().spendableTroops(troopsAt(provId))).ok;
    }

    // ---------- FASE 2 · NAVI: rompere l'assedio del mare (§9.2) ----------
    // Un regno costiero che ha finito le province a portata di TERRA non deve
    // fermarsi: costruisce una Nave e sbarca sul continente. È il caso
    // dell'Inghilterra oltre la Manica e dei Fatimidi oltre Gibilterra — senza
    // scafo restavano bloccati sull'isola/in Africa perché `attackTargets`
    // mostra un bersaglio di mare SOLO se una nave è già ancorata lì (§9.2), e
    // quindi `bestAttack` finiva a vuoto e il turno moriva. La macchina d'assalto
    // sa già sbarcare: l'unico pezzo che mancava era COSTRUIRE la nave.
    // Si punta sulla Nave (barca), non sul Veliero: costa pochissimo — 1 Legno e
    // 3 soldati — e con portata 12 attraversa gli stretti; il Veliero (4000
    // monete) è per gli oceani, non per l'espansione ordinaria.
    const BOAT = 'barca';

    // Le coste nemiche/neutrali che uno scafo con questa portata raggiunge da
    // `id` e che la TERRAFERMA non tocca: è questo che rende utile una nave.
    // Vuoto = qui una nave non aprirebbe niente.
    function seaPreyFrom(player, id, range) {
        const r = range || E().shipRange(BOAT);
        if (!(r > 0)) return [];
        const terra = new Set(E().landNeighbors(id));   // già raggiungibili a piedi
        const out = [];
        E().seaReach(id, r).forEach(tid => {
            if (terra.has(tid)) return;
            const tp = pathOf(tid);
            if (tp && E().owner(tp) !== player.name) out.push(tid);
        });
        return out;
    }

    // Il regno ha GIÀ uno scafo pronto a colpire una preda oltremare? Se sì non se
    // ne costruisce un altro: prima si usa quello che c'è (bestAttack lo farà da
    // sé), poi semmai se ne arma un secondo.
    function hasReadyShip(player) {
        return E().ownedPaths(player.name).some(pp => {
            const hulls = E().ships(pp);
            if (!hulls.length) return false;
            return hulls.some(h => seaPreyFrom(player, pp.id, E().shipRange(h.tipo)).length > 0);
        });
    }

    // Dove (e se) costruire una Nave. La provincia costiera che può pagarla (Legno
    // + 3 soldati sopra il presidio §5) e da cui si raggiungono più prede
    // oltremare, con abbastanza uomini da riempire poi lo scafo per lo sbarco.
    function shipPlan(player, s, st) {
        if (((player.scorte || {}).legno || 0) < ((GR().COSTS[BOAT] || {}).legno || 1)) return null;
        if (hasReadyShip(player)) return null;               // usa prima quella che hai
        const serve = (GR().COSTS[BOAT] || {}).soldati || 3;
        let best = null;
        survey(player).forEach(p => {
            if (E().ships(p.path).length) return;            // già una nave qui
            if (!E().canPlacePiece(p.path, BOAT).ok) return; // non è costiera
            if (p.spare < serve) return;                     // non può armarla
            const prede = seaPreyFrom(player, p.id);
            if (!prede.length) return;
            // Uomini che resterebbero da imbarcare dopo aver pagato la ciurma e
            // lasciato il presidio: se nessuno può sbarcare, la nave è inutile ora.
            const sbarco = p.truppe - serve - p.presidio;
            if (sbarco < 1) return;
            const punti = prede.length + sbarco * 0.1;
            if (!best || punti > best.punti) best = { id: p.id, punti };
        });
        return best;
    }

    // Il regno "vuole il mare"? Serve all'economia: se sì e manca il Legno, lo si
    // compra/baratta (vedi resourceNeed) così la Nave si potrà poi costruire.
    function wantsSea(player) {
        if (hasReadyShip(player)) return false;
        return survey(player).some(p =>
            !E().ships(p.path).length && E().canPlacePiece(p.path, BOAT).ok &&
            seaPreyFrom(player, p.id).length > 0);
    }

    // ---------- IL MARE DEI COLONIALI (dottrina `coloniale`, js/doctrines.js) ----------
    // Il Portogallo non prende terra ai vicini: la sua espansione è oltremare
    // (regola dell'utente). Due gambe, tutte e due sulle azioni che il giocatore
    // ha già — nessuna scorciatoia:
    //   - la NAVE (barca) porta le prime teste di ponte in Africa, e a farlo sono
    //     shipPlan/bestAttack come per qualunque altro regno costiero;
    //   - il VELIERO (§9.2) apre le ROTTE LUNGHE: si salpa in una direzione e si
    //     naviga di decennio in decennio finché non si avvista una costa dove
    //     scendere. È l'unico modo di arrivare in America, e costa quanto vale
    //     (4000 monete): un regno che non fa la guerra ci arriva col commercio.
    // Una rotta per volta: finché una spedizione è in mare non se ne arma un'altra.
    const OCEAN = 'vascello';
    const COLONY_CREW = 6;   // ciurma minima perché una rotta lunga abbia senso
    function isColonial(player) {
        return !!(DOC() && DOC().isColonial(doctrineOf(player)));
    }
    function oceanHullAt(player) {
        return E().ownedPaths(player.name)
            .find(p => E().ships(p).some(h => h.tipo === OCEAN)) || null;
    }
    // Dove armare il Veliero: la costa più popolosa che può ospitarlo e pagarlo.
    function colonyShipPlan(player) {
        if (!isColonial(player)) return null;
        if ((player.spedizioni || []).length || oceanHullAt(player)) return null;
        let best = null;
        survey(player).forEach(p => {
            if (E().ships(p.path).some(h => h.tipo === OCEAN)) return;
            if (!E().canPlacePiece(p.path, OCEAN).ok) return;   // non è costiera
            if (!canBuild(player, OCEAN, p.id)) return;
            if (p.mobili < 3) return;                           // nessuna ciurma da imbarcare
            if (!best || p.truppe > best.truppe) best = { id: p.id, truppe: p.truppe };
        });
        return best;
    }
    // Salpare: la ciurma è quel che può lasciare la provincia senza scoprirla
    // (holdFloor), fino alla capienza dello scafo. La rotta la dà la dottrina e
    // si alterna di decennio in decennio: a mezzogiorno l'Africa, a ponente
    // l'oceano.
    function colonyLaunch(player) {
        if (!isColonial(player)) return null;
        if ((player.spedizioni || []).length) return null;
        const porto = oceanHullAt(player);
        if (!porto) return null;
        const truppe = E().countPiece(porto, 'soldato');
        const mobili = Math.max(0, Math.min(GR().spendableTroops(truppe),
            truppe - holdFloor(player, porto.id)));
        const carico = Math.min(E().shipCapacity(OCEAN), mobili);
        // Una ciurma di tre uomini non fonda niente: sbarcherebbe sotto la soglia
        // di rischio della strategia e resterebbe a navigare finché il mare non se
        // la prende (§9.2). Meglio aspettare che il porto si riempia.
        if (carico < COLONY_CREW) return null;
        return { fromId: porto.id, dir: DOC().routeAt(doctrineOf(player), R().turn()), carico };
    }
    // Approdo: fra le coste avvistate si scende su quella che si può tenere. Una
    // costa VUOTA vale più di una difesa da spezzare — si viene a fondare, non a
    // fare la guerra — e su un partner di non aggressione o su un amico di
    // dottrina non si sbarca affatto.
    function colonyLandings(player, s) {
        const out = [];
        if (!isColonial(player)) return out;
        const doc = doctrineOf(player);
        (player.spedizioni || []).forEach(exp => {
            let best = null;
            GA().expeditionTargets(player, exp).forEach(t => {
                if (t.mia) return;                       // tornare a casa non è una colonia
                if (DOC().forbids(doc, t.id)) return;
                const altro = (t.owner && t.owner !== 'Neutrale')
                    ? R().players().find(p => p.name === t.owner) : null;
                if (altro && D() && D().grantsNonAggression(player, altro)) return;
                if (altro && DOC().isFriend(doc, t.owner)) return;
                const p100 = RisikoBattle.winForecast(exp.carico,
                    (t.troops || 0) + (t.fort || 0), t.esponente, exp.merc || 0, t.merc || 0).p;
                if (p100 < s.soglia) return;
                const punti = p100 + (altro ? 0 : 0.3);
                if (!best || punti > best.punti) best = { expId: exp.id, toId: t.id, punti };
            });
            if (best) out.push(best);
        });
        return out;
    }

    // TRASLOCARE il seggio (GameActions.moveCapital, 500 monete). Una Capitale
    // scelta bene al turno 1 può diventare pessima al turno 10: il regno cresce da
    // una parte sola e la vecchia sede si ritrova sul confine, con `P_conf` a zero
    // e mezza Sicurezza persa per sempre. Muoverla è caro, quindi si fa solo
    // quando il guadagno è netto e i soldi non servono ad altro.
    // La vecchia sede diventa Città — non si perde niente, anzi si guadagna un
    // secondo esattore (§7).
    function capitalPlan(player, s, st, og) {
        if (!st || !GA().moveCapital) return null;
        const costo = (GR().COSTS.capitale || {}).monete || 500;
        if ((player.monete || 0) < costo + coinReserve(player, s, og)) return null;

        const prov = survey(player);
        const sede = prov.find(p => p.id === st.cap.id);
        if (!sede) return null;
        const attuale = capitalScore(player, sede);
        let meglio = null;
        prov.forEach(p => {
            if (p.id === st.cap.id) return;
            const u = unitsAt(p.id);
            // Il seggio si trasloca solo su una propria Città (regola dell'utente):
            // la Città viene assorbita dalla Capitale. Le altre province non sono
            // mete valide.
            if (!u || !u.citta) return;
            const punti = capitalScore(player, p);
            if (!meglio || punti > meglio.punti) meglio = { id: p.id, punti };
        });
        // Soglia alta apposta: 500 monete sono metà Città, e un trasloco per mezzo
        // punto è il modo migliore di non costruire mai niente.
        if (!meglio || meglio.punti < attuale + 3) return null;
        return { provId: meglio.id, guadagno: meglio.punti - attuale };
    }

    // Vale la pena costruirlo, adesso? Non basta potersi permettere una cosa per
    // doverla comprare. Qui c'è un solo caso, ed è il MERCATO — l'edificio che i
    // bot ignoravano e che invece è la loro via d'uscita quando la pietra non ce
    // l'hanno: senza pietra niente strade, senza strade niente province collegate,
    // e senza province collegate il Benessere (§8) e il raccolto (§4) restano a
    // zero. Col Mercato si comprano 1 pietra ogni 2 unità di un'altra risorsa
    // (§7), e il regno riparte.
    // Ma solo se serve davvero: se la pietra la produce già o ne ha in scorta il
    // Mercato è 800 monete buttate, e se non raccoglie NIENTE la banca non ha
    // niente da prendere in cambio — un mercato vuoto non commercia.
    function wantsBuild(player, type, st) {
        if (type !== 'mercato') return true;
        if (GA().hasMarket(player)) return false;
        const collegate = st ? st.collegate : GA().connectedOf(player);
        const tipi = new Set();
        let raccoglie = 0;
        collegate.forEach(id => {
            const k = R().resourceKeyOf(pathOf(id));
            if (!k) return;
            raccoglie++;
            tipi.add(k);
        });
        if (!raccoglie) return false;                     // niente da dare in cambio
        // E niente da dare in cambio ADESSO è lo stesso che niente: un Mercato
        // comprato al turno 1 costa 800 monete (quasi tutto il tesoro iniziale)
        // per stare fermo finché non arrivano le prime scorte. Si aspetta di
        // avere merce vera in magazzino.
        const merce = GR().RES.reduce((n, k) => n + ((player.scorte || {})[k] || 0), 0);
        if (merce < GR().TRADE_RATE + 2) return false;
        return tipi.size < GR().RES.length - 1;           // gli manca più di un tipo
    }

    // MIGLIORIE CIVICHE (§6.1): Sanità/Felicità sulla Capitale alzano il Benessere
    // (§8), cioè un terzo della Popolarità, e costano solo 3 unità di una risorsa.
    // Il bot le completa IN BASE ALLE RISORSE CHE HA (regola dell'utente): fra le
    // migliorie che avvicinano il Benessere, sceglie quella la cui risorsa gli
    // AVANZA di più — così spende ciò che ha in eccesso e le due sezioni
    // (Sanità/Felicità) crescono secondo il magazzino, non con un ordine fisso.
    // Sempre solo con le ECCEDENZE — mai sotto RESERVE, che è la scorta minima da
    // lasciare a un edificio vero. Senza queste migliorie un regno resta inchiodato
    // in basso: la baseline neutra di un tempo non esiste più, il Benessere parte
    // da zero e va costruito.
    const WELFARE_RESERVE = 3;   // di una risorsa non si scende mai sotto questo per una miglioria
    const WELFARE_PER_TURN = 2;  // quante migliorie al massimo per turno
    function welfarePlan(player, s, st) {
        if (!st || !st.cap || typeof root.Popularity === 'undefined') return [];
        const cap = st.cap;
        const built = new Set(E().welfare(cap).map(e => e.key));   // attive o dormienti: non si ricostruiscono
        const scorte = Object.assign({}, player.scorte || {});   // copia: non tocco le vere
        const m = Object.assign({}, st.m);                       // sanita/felicita simulati
        const cost = GR().WELFARE_COST;
        const idx = GR().WELFARE_INDEX;
        const out = [];

        while (out.length < WELFARE_PER_TURN) {
            let best = null;
            Object.keys(idx).forEach(k => {
                if (built.has(k) || out.indexOf(k) >= 0) return;
                const res = idx[k].res;
                const have = scorte[res] || 0;
                if (have < cost + WELFARE_RESERVE) return;   // niente eccedenza
                const cat = idx[k].cat;
                const cur = (cat === 'sanita') ? m.sanita : m.felicita;
                const delta = (cat === 'sanita') ? { sanita: cur + 1 } : { felicita: cur + 1 };
                const gain = root.Popularity.gainIf(m, delta);
                if (gain <= 0) return;                       // non muove il Benessere
                // Priorità alla risorsa di cui ha PIÙ eccedenza; a parità, il
                // guadagno maggiore. È così che "completa in base a ciò che ha".
                if (!best || have > best.have || (have === best.have && gain > best.gain)) {
                    best = { k, cat, cur, gain, res, have };
                }
            });
            if (!best) break;
            out.push(best.k);
            if (best.cat === 'sanita') m.sanita = best.cur + 1; else m.felicita = best.cur + 1;
            scorte[best.res] = (scorte[best.res] || 0) - cost;
        }
        return out;
    }

    // La banca, cioè L'ESTERO (§7): 2 unità di quel che avanza → 1 di quel che
    // manca, subito e senza contrattare con nessuno. È il canale più affidabile
    // che un regno abbia — l'altro regno può rifiutare, la banca no — e quindi è
    // quello che sblocca davvero una costruzione ferma.
    // Cosa comprare lo dice il BISOGNO (`resourceNeed`), non la scorta più bassa:
    // avere zero Legno non è un problema se il Legno non serve a niente di quel
    // che si vuole costruire, mentre l'Argilla a 1 può bloccare una Città da mille
    // monete. Si tiene sempre un margine su ciò che si dà via: svuotare una scorta
    // per riempirne un'altra sposta soltanto il problema.
    function bankPlan(player, s, st, og) {
        if (!GA().hasMarket(player)) return null;
        const scorte = player.scorte || {};
        const need = resourceNeed(player, s, st, og);

        const dai = GR().RES.slice()
            .sort((a, b) => ((scorte[b] || 0) - need[b] * 4) - ((scorte[a] || 0) - need[a] * 4))[0];
        if (!dai) return null;
        const avanzo = (scorte[dai] || 0) - 2;            // due non si toccano
        if (avanzo < GR().TRADE_RATE) return null;

        const prendi = GR().RES.filter(k => k !== dai)
            .sort((a, b) => need[b] - need[a])[0];
        if (!prendi || need[prendi] <= 0) return null;
        // Non si baratta per pareggiare due scorte già simili: sarebbe solo attrito.
        if ((scorte[prendi] || 0) >= (scorte[dai] || 0) - GR().TRADE_RATE) return null;

        const n = Math.min(3, Math.floor(avanzo / GR().TRADE_RATE));
        return n > 0 ? { dai, prendi, n } : null;
    }

    // ---------- FASE 2 · commerci (§7) ----------
    // Un bot col Mercato commercia come tutto il resto: passando dalle azioni del
    // giocatore. Fa due cose, entrambe in fase costruzioni.
    //
    // Quanto vale una merce per un bot, in monete: l'oro vale il suo taglio, una
    // risorsa vale COIN_PER_RES (le risorse sono più scarse del denaro, quindi
    // valgono più di 100). Serve a confrontare offerte in oro e in risorse.
    const COIN_PER_RES = 150;

    // QUANTO SERVE ciascuna risorsa, adesso, a QUESTO regno. È il numero che
    // mancava: senza, "2 Argilla" valeva come "2 Legno" anche per un regno che ha
    // dieci Legno in magazzino e non può costruire la Città solo perché l'Argilla
    // è zero. Un mercato che tratta tutto allo stesso prezzo non serve a niente,
    // ed è per questo che i regni si bloccavano con le casse piene.
    //
    // Il bisogno esce dalle COSTRUZIONI IN PROGRAMMA (s.build, in ordine: le prime
    // pesano di più) confrontate con le scorte, più una voce fissa per la Pietra —
    // la Pietra è la strada, la strada è la provincia collegata, e la provincia
    // collegata è il Benessere (§8) e il raccolto (§4). Quel che abbonda non si
    // desidera più: da lì in poi è merce di scambio.
    function resourceNeed(player, s, st, og) {
        const scorte = (player && player.scorte) || {};
        const need = {};
        GR().RES.forEach(k => { need[k] = 0; });

        ((s && s.build) || []).forEach((type, i) => {
            const cost = GR().COSTS[type] || {};
            const peso = 1 / (1 + i);
            GR().RES.forEach(k => {
                const serve = cost[k] || 0;
                if (!serve) return;
                const manca = serve - (scorte[k] || 0);
                if (manca > 0) need[k] += peso * Math.min(1, manca / serve);
            });
        });

        // La PIETRA non si conta come le altre: non è un ingrediente, è la STRADA
        // (1 Pietra l'una), cioè la provincia collegata, cioè il raccolto (§4) e il
        // Benessere (§8). Finché ci sono province scollegate ne serve, e tanta —
        // senza questa riga i bot vendevano allegramente 4 Pietra per 300 monete
        // avendo mezzo regno da collegare.
        const rete = st ? st.collegate : GA().connectedOf(player);
        const scollegate = E().ownedPaths(player.name).filter(p => !rete.has(p.id)).length;
        if (scollegate > 0) {
            need.pietra = Math.max(need.pietra, Math.min(1.2, scollegate / 3));
        } else if ((scorte.pietra || 0) < 2) {
            need.pietra += 0.4;
        }

        // Il LEGNO della Nave (§9.2): un regno costiero che vuole sbarcare sul
        // continente ne ha bisogno per la barca (COSTS.barca). La barca non è in
        // s.build, quindi senza questa riga il bisogno di legno resta zero e il
        // regno non compra mai il legname per attraversare il mare — resta
        // bloccato sull'isola. Con questa, banca e carovane glielo procurano.
        if (wantsSea(player)) {
            const serveLegno = (GR().COSTS[BOAT] || {}).legno || 3;
            if ((scorte.legno || 0) < serveLegno) need.legno = Math.max(need.legno, 0.9);
        }

        // Il LEGNAME DEL VELIERO: un regno COLONIALE (js/doctrines.js) ne vuole
        // dieci per la rotta lunga (§9.2), e il Veliero non sta in `s.build` più
        // di quanto ci stia la barca. Senza questa riga il Portogallo aspetterebbe
        // per sempre un legname che nessuno gli procura.
        if (isColonial(player) && !(player.spedizioni || []).length && !oceanHullAt(player)) {
            GR().RES.forEach(k => {
                const serve = (GR().COSTS[OCEAN] || {})[k] || 0;
                if (serve && (scorte[k] || 0) < serve) need[k] = Math.max(need[k], 1);
            });
        }

        // L'abbondanza raffredda il desiderio, ma non cancella un fabbisogno già
        // contato: dieci Pietra con dieci province da collegare restano poche.
        GR().RES.forEach(k => {
            if ((scorte[k] || 0) >= 8) need[k] = Math.max(0, need[k] - 0.6);
        });

        // OBIETTIVI (§10): una scorta che un obiettivo aperto vuole in magazzino
        // e non c'è ancora è un bisogno vero — così il Mercato non la svende
        // (bassa `avanza()`, vedi tradePlan) e la banca la compra per prima.
        if (og && og.stockFloor) {
            Object.keys(og.stockFloor).forEach(k => {
                if ((scorte[k] || 0) < og.stockFloor[k]) need[k] = Math.max(need[k], 1);
            });
        }
        return need;
    }

    // Quanto vale una merce PER CHI GUARDA: l'oro vale il suo taglio, una risorsa
    // vale il suo prezzo di base moltiplicato per quanto la si desidera. Vale in
    // tutte e due le direzioni — dare via l'ultima Argilla costa caro tanto quanto
    // riceverla vale, ed è giusto così.
    function goodValue(g, need) {
        if (!g) return 0;
        if (g.tipo === 'monete') return g.n;
        const voglia = need ? (need[g.tipo] || 0) : 0.4;
        return g.n * COIN_PER_RES * (0.6 + voglia);
    }
    function haveGood(player, g) {
        return g.tipo === 'monete' ? (player.monete || 0) : ((player.scorte && player.scorte[g.tipo]) || 0);
    }
    //
    // RISPONDE alle carovane arrivate: accetta se ci guadagna abbastanza (il VALORE
    // che riceve è almeno `baratto` volte quello che consegna) e se ha la merce; se
    // no rifiuta, così il pegno torna al mittente invece di marcire. Rispondere non
    // chiede turno né fase (vedi acceptTrade), ma il bot lo fa nel suo turno
    // perché è lì che il generatore gira.
    // L'oro e le risorse si confrontano solo passando da un valore comune
    // (goodValue): senza, "200 monete" e "2 pietra" non sono paragonabili, e la
    // merce chiesta in oro va cercata nel tesoro, non nelle scorte.
    function tradeAnswers(player, s, st, og) {
        const mosse = [];
        const soglia = (s && s.baratto) || 1.1;
        const need = resourceNeed(player, s, st, og);
        // Il magazzino si scala mano a mano: le risposte si decidono tutte insieme
        // ma si eseguono una per una, e accettare la prima carovana può togliere
        // proprio l'oro che serviva alla seconda. Senza questo conto il bot
        // accettava e poi si sentiva rispondere "non hai 300 monete da consegnare".
        const cassa = { monete: player.monete || 0 };
        GR().RES.forEach(k => { cassa[k] = (player.scorte || {})[k] || 0; });

        GA().tradeInbox(player).forEach(o => {
            const conviene = goodValue(o.offro, need) >= goodValue(o.chiedo, need) * soglia;
            const posso = (cassa[o.chiedo.tipo] || 0) >= o.chiedo.n;
            if (conviene && posso) {
                cassa[o.chiedo.tipo] -= o.chiedo.n;
                cassa[o.offro.tipo] = (cassa[o.offro.tipo] || 0) + o.offro.n;
                mosse.push({ kind: 'accept', id: o.id });
            } else {
                mosse.push({ kind: 'refuse', id: o.id });
            }
        });
        return mosse;
    }

    // PROPONE carovane agli altri regni (§7). Prima ne partiva UNA sola, verso un
    // regno TIRATO A SORTE, e solo se le scorte erano molto sbilanciate: quasi
    // sempre finiva da qualcuno che quella merce non l'aveva, e il regno restava
    // fermo con l'Argilla a zero e mille monete in cassa.
    //
    // Adesso il bot fa quello che farebbe un mercante:
    //   COMPRA quel che gli manca (`resourceNeed`) da CHI CE L'HA DAVVERO — il
    //     magazzino altrui si legge, non si indovina — pagando con quel che gli
    //     avanza, oppure con ORO se non ha eccedenze (§7: oro→risorse è ammesso).
    //   VENDE quel che gli avanza in cambio di oro quando le casse sono vuote:
    //     una scorta ferma non costruisce niente.
    // Manda fino a TRADE_MAX_PENDING proposte, tenendo il conto della merce già
    // impegnata: l'offerta lascia SUBITO il magazzino come pegno, quindi promettere
    // due volte la stessa Pietra vuol dire vedersi rifiutare la seconda carovana.
    function tradePlan(player, s, st, og) {
        if (!GA().hasMarket(player)) return [];
        const spazio = GR().TRADE_MAX_PENDING - GA().tradeOutbox(player).length;
        if (spazio < 1) return [];

        // Chi ha già una nostra carovana ferma davanti alla porta non ne riceve
        // un'altra: o non ha ancora risposto, o non risponderà (un regno umano
        // può lasciarla lì per sempre). Senza questo filtro tutti i bot finivano
        // per scaricare le eccedenze sullo stesso regno più ricco, che le teneva
        // in casella mentre la merce restava impegnata come pegno.
        const inAttesa = new Set(GA().tradeOutbox(player).map(o => o.a));
        const altri = R().players().filter(p =>
            p.id !== player.id && !inAttesa.has(p.id) && E().ownedPaths(p.name).length);
        if (!altri.length) return [];

        const need = resourceNeed(player, s, st, og);
        const cassa = { monete: player.monete || 0 };
        GR().RES.forEach(k => { cassa[k] = (player.scorte || {})[k] || 0; });
        const riserva = coinReserve(player, s, og);

        const avanza = () => GR().RES
            .filter(k => cassa[k] >= 5 && need[k] < 0.3)
            .sort((a, b) => cassa[b] - cassa[a])[0] || null;

        const proposte = [];
        // --- comprare quel che manca ---
        GR().RES
            .filter(k => need[k] > 0.3 && cassa[k] < 3)
            .sort((a, b) => need[b] - need[a])
            .forEach(k => {
                if (proposte.length >= spazio) return;
                // Fra i tre magazzini più forniti si sceglie a caso: bussare ogni
                // turno alla stessa porta che ha già detto no è il modo migliore
                // di non comprare mai niente, e ogni regno ha una sua idea di
                // quanto deve guadagnarci (`baratto`).
                const forniti = altri.slice()
                    .sort((a, b) => ((b.scorte || {})[k] || 0) - ((a.scorte || {})[k] || 0))
                    .filter(p => ((p.scorte || {})[k] || 0) >= 2)
                    .slice(0, 3);
                if (!forniti.length) return;                            // non ce l'ha nessuno
                const chi = forniti[Math.floor(Math.random() * forniti.length)];

                const chiedo = { tipo: k, n: 2 };
                const merce = avanza();
                let offro = null;
                if (merce) { offro = { tipo: merce, n: 3 }; cassa[merce] -= 3; }
                else {
                    // In oro si paga il PREZZO DI MERCATO più il sovrapprezzo di
                    // chi ha fretta: chi vende deve guadagnarci, se no rifiuta e
                    // la carovana torna indietro con le mani vuote.
                    const prezzo = Math.ceil(chiedo.n * COIN_PER_RES * 1.4 / GR().GOLD_UNIT) * GR().GOLD_UNIT;
                    if (cassa.monete - riserva >= prezzo) { offro = { tipo: 'monete', n: prezzo }; cassa.monete -= prezzo; }
                }
                if (offro) proposte.push({ toId: chi.id, offro, chiedo });
            });

        // --- vendere quel che avanza, se servono monete ---
        if (proposte.length < spazio && (player.monete || 0) < 600) {
            const merce = avanza();
            if (merce && cassa[merce] >= 6) {
                // Fra i tre più ricchi, uno a caso: bussare sempre alla porta del
                // regno più facoltoso vuol dire fare la fila dietro le carovane di
                // tutti gli altri.
                const ricchi = altri.slice()
                    .sort((a, b) => (b.monete || 0) - (a.monete || 0))
                    .filter(p => (p.monete || 0) >= 400)
                    .slice(0, 3);
                if (ricchi.length) {
                    const chi = ricchi[Math.floor(Math.random() * ricchi.length)];
                    cassa[merce] -= 4;
                    proposte.push({ toId: chi.id, offro: { tipo: merce, n: 4 }, chiedo: { tipo: 'monete', n: 300 } });
                }
            }
        }
        return proposte.slice(0, spazio);
    }

    // ---------- FASE 3 · attacchi ----------

    // Il miglior attacco possibile in questo momento, o null se nessuno supera
    // la soglia di rischio della strategia.
    // `extra` (facoltativo) = soldati che si potrebbero AGGIUNGERE alla provincia
    // di partenza comprando mercenari: serve a chiedersi "quale attacco si
    // sbloccherebbe se spendessi?" prima di spendere davvero (vedi mercenaryPlan).
    function bestAttack(player, s, st, extra, og) {
        let best = null;
        const doc = doctrineOf(player);
        // Il rapporto con un regno si calcola UNA volta per chiamata: bestAttack
        // gira su tutte le province per tutti i bersagli, e standing ricostruisce
        // le sue liste a ogni lettura.
        const relCache = new Map();
        const cap = st ? st.cap : R().getCapitalPathFor(player);
        const guardiaPiano = guardWanted(st, s);
        const rinforzo = Math.max(0, extra || 0);
        survey(player).forEach(p => {
            // Dalla Capitale non parte mai la guardia: quei soldati non sono
            // truppe di manovra, sono il livello di Popolarità del regno (§8).
            if (p.spare < 1) return;
            GA().attackTargets(player, p.id).forEach(t => {
                // E da nessuna provincia parte il presidio: né quello anti-razzia
                // né quello contro un vicino in armi (holdFloor). Svuotare un
                // confine per prendere una provincia, e perderne un'altra per la
                // porta lasciata aperta, non è un guadagno. Il pavimento si
                // ricalcola per BERSAGLIO saltando il bersaglio stesso: se la
                // minaccia è proprio la provincia che si sta per attaccare,
                // tenersi in casa gli uomini per difendersene vorrebbe dire non
                // attaccarla mai. La Capitale non scende comunque sotto la guardia
                // che le chiede la Popolarità.
                const salvo = t.viaMare ? null : t.id;
                const suolo = (cap && cap.id === p.id)
                    ? Math.max(guardiaPiano, holdFloor(player, p.id, salvo))
                    : holdFloor(player, p.id, salvo);
                const tetto = Math.max(0, Math.min(p.spare, p.truppe - suolo));
                const disponibili = Math.max(0, tetto - s.riservaCasa) + rinforzo;
                if (disponibili < 1) return;
                // Sbarco (§9.2): non partono tutti i disponibili, parte quel che
                // sta sullo scafo. Il bot deve fare il conto con lo stesso tetto
                // del giocatore, se no pronostica su un'armata che non s'imbarca.
                const imbarcabili = t.viaMare ? Math.min(disponibili, t.carico) : disponibili;
                if (imbarcabili < 1) return;
                const p100 = winProb(imbarcabili, t, p.id);
                if (p100 < s.soglia) return;
                // TRADIMENTO (§Diplomazia): un bersaglio di un partner di non
                // aggressione si colpisce solo col suo CONSENSO (t.consenso, gratis
                // e senza rottura) o TRADENDO. Un bot FEDELE (propensione ~0) lo
                // salta e basta; gli altri lo valutano, ma il bottino deve valere
                // lo strappo — lo score è poi scontato più in basso. È la traduzione
                // di "opportunisti a scaglioni": ogni carattere ha la sua soglia.
                const tradimento = !!(t.patto && !t.consenso);
                if (tradimento && (s.tradimento || 0) <= 0) return;
                // DOTTRINA (js/doctrines.js): le porte chiuse, prima ancora di
                // fare i conti. Una terra su cui il regno non mette piede (la
                // Danimarca dei nordici); un regno che non si espande via terra
                // (il Portogallo: le sue conquiste sono sbarchi, non confini); un
                // conservatore che coi regni non se la prende, tranne il nemico
                // dichiarato e le proprie mete.
                // E il freno più stretto di tutti, `soloMete`: chi segue una
                // storia sola non conquista NIENT'ALTRO — l'Orda che deve correre
                // a occidente non si mangia la Cina alle spalle, i Bulgari presa
                // la Bulgaria non prendono altro. L'unica deroga è riprendersi
                // quel che gli è stato strappato (il rancore, che vale solo per
                // le province che contavano): difendersi non è espandersi.
                if (doc) {
                    if (DOC().forbids(doc, t.id)) return;
                    if (DOC().onlySea(doc) && !t.viaMare) return;
                    if (DOC().keepsPeaceWith(doc, t.owner, t.id)) return;
                    if (DOC().onlyGoals(doc) && !DOC().isMeta(doc, t.id) &&
                        !grudgeAgainst(player, t.id)) return;
                }
                const u = unitsAt(t.id) || {};
                // Il premio dice QUANTO vale la provincia, non quanto è facile.
                // La voce più pesante è la Popolarità: togliere una nemica dal
                // confine della Capitale o annettere il primo campo di grano vale
                // più di una città presa, perché rende a ogni turno per sempre.
                // `popValueOf` lo misura sulla formula vera (§8) e spesso risponde
                // ZERO — con 7 nemiche al confine le prime conquiste non muovono
                // nulla, ed è giusto che l'IA lo sappia invece di illudersi.
                // La VENDETTA (regola dell'utente): riprendersi una provincia
                // preziosa che ci hanno strappato vale un premio a sé, tanto più
                // grosso quanto più bruciava perderla (peso 1-3 dal rancore). A
                // parità di bersagli il bot torna dov'è stato colpito invece di
                // vagare.
                // LO SBARCO sul continente vale un premio a sé (§9.2): oltremare la
                // Popolarità non conta (la costa presa non è collegata, popValueOf
                // tace), ma una testa di ponte è espansione vera — è così che
                // l'Inghilterra passa la Manica e i Fatimidi Gibilterra invece di
                // restare fermi. Senza, un attacco di mare aveva premio ~1 e perdeva
                // sempre contro qualsiasi conquista di terra.
                // OBIETTIVI (§10): una provincia che il foglio degli obiettivi
                // chiede vale un premio a sé, tanto più grosso quanto più punti
                // mette in palio — è così che un bot "prova davvero" a fare la
                // Reconquista invece di conquistare la prima provincia debole.
                // DOTTRINA: una META vale più di ogni altra cosa finché non è
                // tua (le tre città dei Selgiuchidi, la Bulgaria dei Bulgari, la
                // Finlandia dei nordici), e un NEMICO DICHIARATO si colpisce
                // prima di chiunque altro.
                const premio = 1 + (u.capitale ? 1.2 : 0) + (u.citta ? 0.6 : 0) + (u.fortezza ? 0.4 : 0)
                    + popValueOf(st, t.id, t.viaMare) * 6
                    + grudgeAgainst(player, t.id) * 1.5
                    + (t.viaMare ? 0.8 : 0)
                    + objectiveAttackWeight(og, t.id)
                    + (doc ? DOC().metaWeight(doc, t.id) : 0);
                const peso = ((t.owner === 'Neutrale' || !ownerAt(t.id)) ? s.pesoNeutrali : s.pesoGiocatori)
                    * (doc ? DOC().enemyWeight(doc, t.owner) : 1);
                let score = (p100 - s.soglia + 0.1) * premio * peso;
                // IL RAPPORTO (§Diplomazia): un vicino con cui si sta bene si
                // colpisce meno volentieri, uno che ci ha già derubati di più.
                // Sul binario storico (nemico dichiarato o meta della dottrina)
                // il fattore vale 1 e la storia va avanti comunque.
                score *= relationFactor(player, s, doc, t, relCache);
                // L'AMICO DI DOTTRINA non si attacca — "a meno che non sia
                // assolutamente conveniente" (regola dell'utente): stesso
                // meccanismo del tradimento, ma con un pedaggio più caro, così
                // solo un bottino enorme lo giustifica. L'eccezione è una META:
                // è per la Finlandia che Norvegia e Svezia si guarderanno male,
                // e per Aleppo che i Selgiuchidi passeranno sugli Abbasidi.
                if (doc && DOC().isFriend(doc, t.owner) && !DOC().isMeta(doc, t.id)) {
                    score = score * FRIEND_DISCOUNT - FRIEND_TOLL;
                    if (score <= 0) return;
                }
                // Il tradimento paga un pedaggio: lo score si sconta per la
                // propensione del carattere e per una riluttanza fissa (la fiducia
                // rotta, il rancore che ne nasce). Così un partner si attacca solo
                // se vale MOLTO più di una conquista qualunque, e i fedeli non lo
                // fanno mai. `consenso` non paga pedaggio: è un attacco autorizzato.
                if (tradimento) {
                    score = score * (s.tradimento || 0) - BETRAY_RELUCTANCE;
                    if (score <= 0) return;
                }
                if (!best || score > best.score) {
                    best = {
                        fromId: p.id, toId: t.id, disponibili: imbarcabili, target: t, score, p100,
                        tradimento,
                        // Quanti uomini avrebbe SENZA il rinforzo immaginato: serve a
                        // mercenaryPlan per trovare quanti gliene mancano davvero.
                        base: Math.max(0, disponibili - rinforzo)
                    };
                }
            });
        });
        return best;
    }

    // ---------- FASE 2 · mercenari (§5.3) ----------
    // I mercenari RESTANO (150 monete l'uno), ma restano come ventura: in linea
    // valgono meno di un suddito e quanto rendano si sa solo sul campo (§9). Sono
    // quindi due spese in una — monete oggi, affidabilità per sempre — e la regola
    // di prima vale ancora, per una ragione nuova:
    //
    // si comprano SOLO per chiudere un attacco che senza di loro non si farebbe.
    // Se il miglior bersaglio è già sopra soglia non servono; se resta sotto
    // soglia anche con tutti quelli comprabili, non si spende niente. Comprarne
    // per averne vorrebbe dire annacquare per sempre l'esercito che li ospita —
    // e con Mercato (800) e Città (1000) da pagare, quelle monete servono altrove.
    //
    // Il conto lo fa `winProbMerc` sulla formula vera, con la quota che la
    // provincia AVREBBE dopo l'acquisto: un bot che pronosticasse coi mercenari
    // contati come sudditi comprerebbe per raggiungere una soglia che poi non
    // raggiunge.
    //
    // La riserva è l'altra metà della regola: le monete che servono alla prossima
    // costruzione in programma non si toccano. Un mercenario oggi non vale una
    // Città mai.
    // Quanto oro NON si tocca: quello della prossima costruzione davvero a
    // portata, cioè quella di cui si hanno già le risorse. Prima si teneva da
    // parte il costo PIÙ ALTO della lista — 2000 monete per una Fortezza che non
    // si potrà costruire per venti turni — e il risultato era un regno che non
    // spendeva mai niente e intanto restava fermo. Se non c'è niente a portata la
    // riserva è zero: i soldi servono a essere spesi.
    function coinReserve(player, s, og) {
        const scorte = player.scorte || {};
        let riserva = 0;
        (s.build || []).forEach(type => {
            const cost = GR().COSTS[type] || {};
            const monete = cost.monete || 0;
            if (!monete) return;
            if (type === 'capitale' && R().getCapitalPathFor(player)) return;
            if (type === 'mercato' && GA().hasMarket(player)) return;
            if (GR().RES.some(k => (cost[k] || 0) > (scorte[k] || 0))) return;
            if (!riserva || monete < riserva) riserva = monete;
        });
        // OBIETTIVI (§10): un tesoro che un obiettivo aperto chiede è oro da non
        // spendere, non solo da accumulare — negli ultimi turni del ciclo diventa
        // il pavimento vero (objectiveGoldFloor).
        if (og && og.goldFloor) riserva = Math.max(riserva, og.goldFloor);
        // DOTTRINA COLONIALE: le 4000 monete del Veliero si mettono da parte solo
        // quando il legname c'è già — stessa regola di sopra ("la prossima
        // costruzione RAGGIUNGIBILE"): tenerle da parte prima vorrebbe dire non
        // comprare mai il legname con cui renderlo raggiungibile.
        if (isColonial(player) && !(player.spedizioni || []).length && !oceanHullAt(player)) {
            const costo = GR().COSTS[OCEAN] || {};
            if (!GR().RES.some(k => (costo[k] || 0) > (scorte[k] || 0))) {
                riserva = Math.max(riserva, costo.monete || 0);
            }
        }
        return riserva;
    }

    function mercenaryPlan(player, s, st, og) {
        const quanti = s.mercenari || 0;
        if (!quanti) return null;
        const prezzo = GR().COSTS.mercenario.monete;
        const budget = Math.floor(Math.max(0, (player.monete || 0) - coinReserve(player, s, og)) / prezzo);
        const tetto = Math.min(quanti, budget);
        if (tetto < 1) return null;

        // Se un attacco lo porta già a casa così, i mercenari sono soldi buttati.
        if (bestAttack(player, s, st, 0, og)) return null;

        // Che cosa si sbloccherebbe spendendo tutto il comprabile? Una domanda
        // sola: `bestAttack` costa una scansione di tutto il regno, e chiederla
        // una volta per ogni numero da 1 al tetto sarebbe lo stesso conto fatto
        // cinque volte. Trovato il bersaglio, il numero minimo che basta si
        // calcola sulla formula, senza rifare il giro.
        const b = bestAttack(player, s, st, tetto, og);
        if (!b) return null;
        const mercOra = GA().mercOf(b.fromId);
        const truppeOra = troopsAt(b.fromId);
        for (let n = 1; n <= Math.min(tetto, roomAt(b.fromId)); n++) {
            const forza = b.target.viaMare ? Math.min(b.base + n, b.target.carico) : b.base + n;
            // Quota di ventura della provincia DOPO l'acquisto: i mercenari comprati
            // entrano nel mucchio e partono insieme agli altri, in proporzione.
            const mercA = GR().mercShare(mercOra + n, truppeOra + n, forza);
            if (winProbMerc(forza, b.target, mercA) >= s.soglia) return { provId: b.fromId, n };
        }
        return null;
    }

    // Quante truppe impegnare: il minimo che tiene la probabilità sopra soglia,
    // poi corretto dall'aggressività (chi è aggressivo manda tutto e sfonda).
    function engagedFor(best, s) {
        const D = best.target.troops + best.target.fort;
        let minimo = 1;
        while (minimo < best.disponibili && winProb(minimo, best.target) < s.soglia) {
            minimo++;
        }
        const voluto = Math.ceil(best.disponibili * s.impegno);
        return Math.max(1, Math.min(best.disponibili, Math.max(minimo + (D > 0 ? 1 : 0), voluto)));
    }

    // ---------- FASE 4 · spostamento ----------

    // ---------- LA COLONNA DELLA MARCIA (dottrina `marcia`) ----------
    // Un'orda che tiene il grosso dell'esercito in Mongolia non arriva in Europa.
    // La conquista porta avanti solo i superstiti della punta — che si assottiglia
    // di provincia in provincia, perché ognuna presa ne trattiene almeno uno — e
    // le retrovie restano piene di uomini che non hanno più niente da attaccare
    // (`soloMete` chiude loro anche la Cina). Lo spostamento di fine turno, che
    // per tutti è UNO SOLO fra province confinanti, diventa allora la COLONNA:
    // il grosso che avanza di una provincia verso la PUNTA della marcia. Nessun
    // potere speciale — è la stessa GameActions.finalMove del giocatore.
    //
    // La punta è la prima tappa del binario non ancora nostra (lo stesso criterio
    // con cui le ondate di rinforzo scelgono dove calare, js/events.js); la
    // direzione la dà una BFS di distanze in confini di terra da quella provincia:
    // si sposta chi ha più uomini verso il vicino che è più vicino alla meta.
    function marchTip(player) {
        if (player && player.dottrinaSospesa) return null;   // dottrina sospesa: niente marcia
        const asse = DOC() ? DOC().march(player.name) : [];
        if (!asse.length) return null;
        return asse.find(id => ownerAt(id) !== player.name) || null;
    }
    function landDistancesFrom(id) {
        const dist = new Map([[id, 0]]);
        const q = [id];
        for (let i = 0; i < q.length; i++) {
            const d = dist.get(q[i]) + 1;
            E().landNeighbors(q[i]).forEach(n => {
                if (!dist.has(n)) { dist.set(n, d); q.push(n); }
            });
        }
        return dist;
    }
    function marchMove(player, s, st) {
        const tip = marchTip(player);
        if (!tip) return null;
        const dist = landDistancesFrom(tip);
        const cap = st ? st.cap : R().getCapitalPathFor(player);
        const guardia = capitalGuard(player, s, st, cap);
        // Dalla Capitale non si sguarnisce, come in movePlan: la Popolarità del
        // regno sta lì dentro anche mentre si marcia.
        const partenti = p => (cap && p.id === cap.id)
            ? Math.max(0, Math.min(p.spare, p.truppe - guardia))
            : p.mobili;
        let best = null;
        survey(player).forEach(p => {
            const via = partenti(p);
            if (via < 1) return;
            const dFrom = dist.has(p.id) ? dist.get(p.id) : Infinity;
            GA().ownAdjacent(player, p.id).forEach(n => {
                const dTo = dist.has(n) ? dist.get(n) : Infinity;
                if (!(dTo < dFrom)) return;                 // si marcia solo in avanti
                const quanti = Math.min(via, roomAt(n));
                if (quanti < 1) return;
                // Il grosso per primo; a parità di uomini, il passo più avanzato.
                const punti = quanti * 10 - dTo;
                if (!best || punti > best.punti) best = { fromId: p.id, toId: n, n: quanti, punti };
            });
        });
        return best;
    }

    function movePlan(player, s, st, og) {
        const prov = survey(player);
        const cap = st ? st.cap : R().getCapitalPathFor(player);
        // Guardia che tiene conto dell'invasore: se preme sulla Capitale, l'ultimo
        // spostamento del turno serve a rinforzarla, non a portare truppe al fronte
        // offensivo.
        const guardia = capitalGuard(player, s, st, cap);

        // Dalla CAPITALE non si sguarnisce: quel che eccede la guardia voluta è
        // tutto ciò che può partire. Senza questo la Capitale finiva scelta come
        // "retrovia" — è la provincia più interna, quindi quasi mai sul fronte —
        // e restava con 1 uomo: la Popolarità, il raccolto e la partita stanno
        // tutti lì dentro. Dalle altre parte quel che eccede il presidio
        // anti-razzia (`mobili`), non il presidio minimo del §5.
        const partenti = p => (cap && p.id === cap.id)
            ? Math.max(0, Math.min(p.spare, p.truppe - guardia))
            : p.mobili;

        const retro = prov.filter(p => !p.fronte && partenti(p) > 0)
            .sort((a, b) => partenti(b) - partenti(a))[0];
        if (!retro) return null;

        // Priorità allo spostamento verso la Capitale finché la guardia è sotto
        // quota: un turno di Popolarità bassa costa più di una provincia difesa
        // male. Ed è l'ULTIMA occasione del turno per arrivarci — al primo turno
        // le reclute sono zero (il malus se le mangia) e questo spostamento è
        // l'unico modo di riempire la guardia.
        if (cap && cap.id !== retro.id && troopsAt(cap.id) < guardia &&
            GA().ownAdjacent(player, retro.id).has(cap.id)) {
            const n = Math.min(partenti(retro), guardia - troopsAt(cap.id), roomAt(cap.id));
            if (n > 0) return { fromId: retro.id, toId: cap.id, n };
        }

        // Poi le porte lasciate aperte: le razzie si risolvono a fine giro, quindi
        // questo spostamento è l'ULTIMA occasione per chiudere un confine che una
        // terra di nessuno può prendersi. Un attacco appena vinto lascia spesso
        // la provincia di partenza con un uomo solo: è qui che si rimedia.
        const scoperta = prov.filter(p => p.scoperta > 0 && p.id !== retro.id)
            .sort((a, b) => b.scoperta - a.scoperta)[0];
        if (scoperta && GA().ownAdjacent(player, retro.id).has(scoperta.id)) {
            const n = Math.min(partenti(retro), scoperta.scoperta, roomAt(scoperta.id));
            if (n > 0) return { fromId: retro.id, toId: scoperta.id, n };
        }

        // OBIETTIVI (§10): la provincia con la lacuna più grande verso una soglia
        // richiesta (un'oste da radunare, un avamposto da tenere) si rinforza
        // prima del fronte generico — è la stessa priorità di deployPlan, qui
        // per l'ultimo movimento del turno.
        if (og && og.garrisonNeeds && og.garrisonNeeds.size) {
            let target = null, manca = 0;
            og.garrisonNeeds.forEach((min, id) => {
                const m = min - troopsAt(id);
                if (m > manca) { manca = m; target = id; }
            });
            if (target && target !== retro.id && GA().ownAdjacent(player, retro.id).has(target)) {
                const n = Math.min(partenti(retro), manca, roomAt(target));
                if (n > 0) return { fromId: retro.id, toId: target, n };
            }
        }

        const fronte = prov.filter(p => p.fronte)
            .sort((a, b) => (b.minaccia - b.truppe) - (a.minaccia - a.truppe))[0];
        if (!fronte || fronte.id === retro.id) return null;
        if (!GA().ownAdjacent(player, retro.id).has(fronte.id)) return null;
        const n = Math.min(partenti(retro), roomAt(fronte.id));
        return n > 0 ? { fromId: retro.id, toId: fronte.id, n } : null;
    }

    // ---------- DIPLOMAZIA (§Diplomazia) ----------
    // I bot fanno diplomazia "per bisogno" (regola dell'utente): non tessono reti
    // per il gusto di farlo, ma comprano pace quando un fronte scotta e accettano
    // i patti che convengono. La lealtà è nell'attacco: `bestAttack` non colpisce
    // un partner se non tradendo, e tradisce solo secondo il carattere
    // (`s.tradimento`). Qui restano proposte e risposte.
    function kingdomStrength(p) {
        return E().ownedPaths(p.name).reduce((n, pt) => n + E().countPiece(pt, 'soldato'), 0);
    }
    function botBorders(player, other) {
        return E().ownedPaths(player.name).some(pt =>
            E().landNeighbors(pt.id).some(n => ownerAt(n) === other.name));
    }
    // Un vicino-regno più DEBOLE che confina con me è una preda: un bot aggressivo
    // (pesoGiocatori alto) preferisce mangiarselo piuttosto che firmarci la pace.
    function isJuicyPrey(player, s, other) {
        return botBorders(player, other) &&
            (s.pesoGiocatori || 1) >= 1 &&
            kingdomStrength(other) < kingdomStrength(player) * 0.8;
    }
    function pendingBetween(player, other) {
        return (other.pattiProposte || []).some(o => String(o.da) === String(player.id)) ||
               (player.pattiProposte || []).some(o => String(o.da) === String(other.id));
    }
    // ---------- LA GUERRA È LA REGOLA, LA DIPLOMAZIA L'ECCEZIONE ----------
    // (regola dell'utente: "essendo un gioco di guerra, si deve fare la guerra").
    // Un'IA non manda araldi di alleanza a chiunque incontri. Tre muri, in ordine:
    //   1. LA FEDE. Fra famiglie diverse non si firma niente — né si chiede né si
    //      accetta. Gli unici patti che scavalcano la fede sono quelli stretti da
    //      un EVENTO (le crociate: ctx.pact in game-actions, che non passa di qui).
    //   2. LA DOTTRINA (js/doctrines.js). Un nemico dichiarato non si tratta mai;
    //      un amico storico si tratta sempre, fede o no.
    //   3. IL BISOGNO, e solo quello. Si compra pace da chi al confine è più forte
    //      di noi, non da chiunque passi; e mai oltre PACT_MAX patti in essere —
    //      un regno che ha firmato con mezzo mondo non fa più guerra a nessuno.
    const PACT_MAX = 2;           // patti attivi al massimo (l'amico di dottrina è a parte)
    const PACT_NEED = 1.2;        // quanto più forte dev'essere il fronte per comprarne la pace
    const PACT_MIN_THREAT = 4;    // sotto questo, la minaccia non vale un araldo

    // La FAMIGLIA di fede di un regno: quella della sua Capitale (§Religione).
    // Senza Capitale — un regno appena nato, o che l'ha appena persa — vale la
    // fede DICHIARATA dalla dottrina, e in ultimo la fede della maggioranza delle
    // sue province: un impero non diventa apolide perché gli hanno preso il seggio.
    function faithFamilyOf(player) {
        if (typeof Religions === 'undefined' || !player) return null;
        const fede = R().stateReligionOf ? R().stateReligionOf(player) : null;
        if (fede) return Religions.familyOf(fede);
        const dichiarata = DOC() ? DOC().faithOf(doctrineOf(player)) : null;
        if (dichiarata) return dichiarata;
        const conta = new Map();
        E().ownedPaths(player.name).forEach(p => {
            const f = Religions.familyOf(E().religion(p));
            if (f) conta.set(f, (conta.get(f) || 0) + 1);
        });
        let best = null;
        conta.forEach((n, f) => { if (!best || n > best.n) best = { f, n }; });
        return best ? best.f : null;
    }

    // Si può anche solo PARLARE di patti con questo regno?
    function canDealWith(player, other) {
        if (!player || !other) return false;
        const mio = doctrineOf(player), suo = doctrineOf(other);
        if (DOC()) {
            // Chi non firma NIENTE con nessuno (l'Orda) chiude la porta prima di
            // qualunque conto: non c'è fede, amicizia o bisogno che la riapra.
            if (DOC().signsNothing(mio) || DOC().signsNothing(suo)) return false;
            const miaFede = faithFamilyOf(player), suaFede = faithFamilyOf(other);
            // La dottrina prima di tutto: una fede nemica chiude la porta anche a
            // chi la fede generica lascerebbe passare, e viceversa un amico
            // storico la tiene aperta comunque.
            if (DOC().blocksFaith(mio, suaFede) || DOC().blocksFaith(suo, miaFede)) return false;
            if (DOC().isEnemy(mio, other.name) || DOC().isEnemy(suo, player.name)) return false;
            if (DOC().isFriend(mio, other.name) || DOC().isFriend(suo, player.name)) return true;
            if (!miaFede || !suaFede) return true;   // fede ignota: non s'inventa un muro
            return miaFede === suaFede;
        }
        const a = faithFamilyOf(player), b = faithFamilyOf(other);
        return (!a || !b) ? true : a === b;
    }
    // Un'amicizia di dottrina basta che la dichiari UNA delle due parti: la
    // Castiglia non ha dottrina, ma il Portogallo la nomina amica, e deve poter
    // firmare con lei anche se agli occhi di Castiglia è solo un vicino debole
    // (regola dell'utente: "i portoghesi accetteranno patti con la Castiglia").
    function isDoctrineFriend(player, other) {
        if (!DOC() || !player || !other) return false;
        return DOC().isFriend(doctrineOf(player), other.name) ||
               DOC().isFriend(doctrineOf(other), player.name);
    }

    // Risposte agli araldi arrivati: si accettano i patti che convengono, e solo
    // da chi si può trattare. Un patto leggero si prende salvo che il proponente
    // sia una preda; un'alleanza solo se il proponente non è preda ed è forte
    // abbastanza da valere l'impegno. L'amico di dottrina si accetta e basta.
    function diploAnswers(player, s) {
        if (!D()) return [];
        const partner = D().partnersOf(player, R().players()).length;
        return (player.pattiProposte || []).slice().map(off => {
            const mitt = R().players().find(p => p.id === off.da);
            if (!mitt || !E().ownedPaths(mitt.name).length) return { id: off.id, kind: 'decline' };
            if (!canDealWith(player, mitt)) return { id: off.id, kind: 'decline' };
            const amico = isDoctrineFriend(player, mitt);
            if (!amico && partner >= PACT_MAX) return { id: off.id, kind: 'decline' };
            const preda = isJuicyPrey(player, s, mitt);
            const forte = kingdomStrength(mitt) >= kingdomStrength(player) * 0.6;
            const accetta = amico || (D().costsPrestige(off.tipo) ? (!preda && forte) : !preda);
            return { id: off.id, kind: accetta ? 'accept' : 'decline' };
        });
    }

    // Un solo araldo per turno, e solo per due ragioni.
    //   L'AMICO DI DOTTRINA: l'unico patto che un regno cerca senza esservi
    //   costretto (i Selgiuchidi si alleano con gli Abbasidi, il Portogallo firma
    //   la non belligeranza con la Castiglia).
    //   LA PAURA: un fronte dove il vicino è nettamente più forte di noi. Non "un
    //   vicino armato" — uno che ci schiaccia: la pace si compra quando serve, se
    //   no si combatte.
    function diploProposals(player, s) {
        if (!D()) return null;
        const doc = doctrineOf(player);
        if (doc && doc.pattoAmico) {
            const amico = (doc.amici || [])
                .map(n => R().players().find(p => p.name === n))
                .find(p => p && E().ownedPaths(p.name).length &&
                    !D().pactsWith(player, p.id).length && !pendingBetween(player, p));
            if (amico) return { toId: amico.id, tipo: doc.pattoAmico };
        }
        if (D().partnersOf(player, R().players()).length >= PACT_MAX) return null;

        // Per ogni regno confinante: quanto è forte LUI sul confine e quanto siamo
        // forti NOI di fronte a lui.
        const fronti = new Map();
        E().ownedPaths(player.name).forEach(pt => {
            const mia = E().countPiece(pt, 'soldato');
            E().landNeighbors(pt.id).forEach(n => {
                const owner = ownerAt(n);
                if (!owner || owner === player.name) return;
                const other = R().players().find(p => p.name === owner);
                if (!other) return;   // neutrale: non si tratta
                const forza = GR().spendableTroops(E().countPiece(pathOf(n), 'soldato'));
                const f = fronti.get(other.id) || { minaccia: 0, mia: 0 };
                f.minaccia = Math.max(f.minaccia, forza);
                f.mia = Math.max(f.mia, mia);
                fronti.set(other.id, f);
            });
        });
        let target = null, best = 0;
        fronti.forEach((f, id) => {
            const other = R().players().find(p => p.id === id);
            if (!other) return;
            if (f.minaccia < PACT_MIN_THREAT) return;           // minaccia trascurabile
            if (f.minaccia < f.mia * PACT_NEED) return;         // reggo il confine: si combatte
            if (!canDealWith(player, other)) return;            // fede o dottrina: non si tratta
            if (D().grantsNonAggression(player, other)) return; // già in pace
            if (pendingBetween(player, other)) return;          // araldo già in viaggio
            if (isJuicyPrey(player, s, other)) return;          // preferisco attaccarlo
            if (f.minaccia > best) { best = f.minaccia; target = other; }
        });
        return target ? { toId: target.id, tipo: 'nonBelligeranza' } : null;
    }

    // ============================================================
    // IL RAPPORTO PESA SULL'ATTACCO — MA LA STORIA PESA DI PIÙ
    // (regola dell'utente: "l'IA può combinare i propri obiettivi storici con lo
    // stato di amicizia. Ma i mongoli attaccheranno la Russia anche se ci hanno
    // scambiato qualcosa, e lo stesso vale per i Selgiuchidi contro i cristiani e
    // i bizantini").
    //
    // Il livello di rapporto (Diplomacy.standing, l'unica formula) entra nel
    // punteggio d'attacco come un MOLTIPLICATORE: si colpisce meno volentieri chi
    // ha la tua stessa fede, chi ti manda carovane, chi ti ha mandato uomini al
    // fronte; più volentieri chi ti ha già strappato province o rotto la parola.
    // Non è un divieto — un bottino grosso vince comunque — ed è il pezzo che
    // mancava perché la diplomazia si vedesse anche fuori dai patti firmati.
    //
    // LA DEROGA È IL PUNTO: sul BINARIO STORICO il rapporto non conta niente. Un
    // nemico DICHIARATO dalla dottrina (`nemici`) e una META della dottrina
    // (`mete`, che per l'Orda sono le tappe della marcia) si attaccano allo stesso
    // modo qualunque cosa sia successo fra i due regni. Un'orda che si ferma
    // davanti alla Rus' perché ci ha fatto commercio non arriva in Europa, e i
    // Selgiuchidi che risparmiano Bisanzio non fanno la storia che devono fare.
    //
    // Il CARATTERE modula quanto pesa: chi tradisce facilmente (predone,
    // opportunista) bada poco ai buoni rapporti; un costruttore ci bada molto.
    // Si riusa `s.tradimento`, che è già la scala della slealtà — un secondo
    // numero per profilo direbbe la stessa cosa con un altro nome.
    const REL_WEIGHT = 0.6;      // quanto un rapporto ottimo raffredda l'attacco
    const REL_SPITE  = 0.35;     // quanto un rapporto pessimo lo scalda

    function standingWith(player, other, viaMare, cache) {
        if (!D() || !D().standing || !other) return 0;
        const k = other.name;
        if (cache.has(k)) return cache.get(k);
        const st = D().standing(player, other, {
            confinanti: !viaMare,
            turno: R().turn(),
            fedeMia: R().stateReligionOf ? R().stateReligionOf(player) : null,
            fedeSua: R().stateReligionOf ? R().stateReligionOf(other) : null
        });
        cache.set(k, st.score);
        return st.score;
    }

    // Il moltiplicatore da applicare al punteggio d'attacco. 1 = il rapporto non
    // dice niente (bersaglio neutrale, nessun precedente, oppure la deroga
    // storica).
    function relationFactor(player, s, doc, t, cache) {
        if (!t.owner || t.owner === 'Neutrale') return 1;     // le terre di nessuno non hanno diplomazia
        // LA DEROGA STORICA: il binario passa sopra il rapporto.
        if (doc && (DOC().isEnemy(doc, t.owner) || DOC().isMeta(doc, t.id))) return 1;
        const other = R().players().find(p => p.name === t.owner);
        if (!other) return 1;
        const rel = standingWith(player, other, t.viaMare, cache);
        if (!rel) return 1;
        if (rel > 0) {
            const cura = REL_WEIGHT * (1 - (s.tradimento || 0) * 0.6);
            return Math.max(0.25, 1 - cura * (rel / 100));
        }
        return 1 + REL_SPITE * (-rel / 100);
    }

    // ============================================================
    // ALLEATI: CHIEDERE UOMINI E MANDARNE (§Diplomazia)
    //
    // È la parte dell'alleanza che si vede sulla mappa, e un bot non ha bisogno
    // di ragionamenti nuovi per usarla: sa già dov'è scoperto (survey.scoperta,
    // cioè quanto gli manca per reggere il pavimento §5.4/istinto di difesa) e sa
    // già quanti uomini gli avanzano (survey.mobili). Da lì:
    //   CHIEDE dove il confine cede, e lo chiede all'alleato che PUÒ arrivarci
    //     (un grido d'aiuto a chi non confina con quella provincia è rumore).
    //   MANDA quel che gli avanza DOPO gli attacchi: gli uomini che restano in
    //     casa a far niente valgono di più al fronte di un amico.
    // Uno per turno per parte, come gli araldi dei patti: due alleati che si
    // travasano truppe a ogni tornata sarebbero un solo esercito con due nomi.
    // ============================================================
    const HELP_KEEP = 2;     // uomini che restano comunque, oltre il pavimento

    function helpAskPlan(player) {
        if (!D() || !GA().helpOutbox) return null;
        const alleati = D().partnersOf(player, R().players(), 'rinforzi');
        if (!alleati.length) return null;
        // La provincia più scoperta rispetto al suo pavimento: è lì che serve.
        let worst = null;
        survey(player).forEach(p => {
            if (p.scoperta > 0 && (!worst || p.scoperta > worst.scoperta)) worst = p;
        });
        if (!worst) return null;
        const gia = GA().helpOutbox(player);
        const chi = alleati.find(a =>
            E().landNeighbors(worst.id).some(n => ownerAt(n) === a.name) &&
            !gia.some(h => String(h.prov) === String(worst.id) && String(h.a) === String(a.id)));
        return chi ? { toId: chi.id, provId: worst.id } : null;
    }

    function helpSendPlan(player) {
        if (!D() || !GA().helpInbox) return null;
        const inbox = GA().helpInbox(player);
        if (!inbox.length) return null;
        const mie = survey(player);
        for (const h of inbox) {
            const chi = R().players().find(p => String(p.id) === String(h.da));
            if (!chi || !D().allowsReinforce(player, chi)) continue;
            if (ownerAt(h.prov) !== chi.name) continue;      // quel fronte non è più suo
            const base = mie
                .filter(p => E().landNeighbors(p.id).indexOf(h.prov) >= 0 && p.mobili > HELP_KEEP)
                .sort((a, b) => b.mobili - a.mobili)[0];
            if (!base) continue;
            const n = Math.min(base.mobili - HELP_KEEP, Math.max(1, Math.floor(base.mobili / 2)));
            if (n > 0) return { fromId: base.id, toId: h.prov, n };
        }
        return null;
    }

    // ============================================================
    // IL TURNO DEL BOT
    // Ogni `yield` è un'azione già applicata alla mappa: il driver la mostra e
    // poi riprende. Le decisioni si prendono alla ripresa, quindi ogni passo
    // vede la mappa aggiornata dal passo precedente.
    // ============================================================

    // Porta il giocatore fino alla fase richiesta (le fasi vanno solo avanti).
    function* advanceTo(player, fase) {
        const target = GA().PHASES.indexOf(fase);
        let guardia = GA().PHASES.length;
        while (GA().phaseIndex(player) < target && guardia-- > 0) {
            yield GA().nextPhase(player);
        }
    }

    function* turnScript(player) {
        const s = strategyOf(player);
        if (!s) return;
        if (!E().ownedPaths(player.name).length) return;   // regno annientato: niente da fare

        // Gli obiettivi di prestigio (§10) ancora aperti, letti UNA volta per
        // turno: cambiano poco da un'azione all'altra, a differenza di `st` (che
        // una conquista o una strada aggiornano di continuo).
        const og = objectiveState(player);

        // Turno ripreso a metà (pagina ricaricata mentre giocava l'IA): prima si
        // chiude la conquista in sospeso, poi si riparte dalla fase in cui è
        // rimasto — non dalla prima, che il motore rifiuterebbe.
        const sospesa = GA().conquestPending(player);
        if (sospesa) {
            yield GA().resolveConquest(player, Math.max(1, Math.round(sospesa.superstiti * s.avanzata)));
        }

        // --- LA TASSAZIONE, PRIMA DI TUTTO ---
        // Non costa niente, non consuma la fase, e vale fino a 2 punti di
        // Popolarità (§8): è la leva più economica che il regno abbia. Il piano
        // sceglie il livello più redditizio che regge il target, quindi le tasse
        // scendono quando il popolo mugugna e RISALGONO da sé appena Sicurezza e
        // Benessere se lo possono permettere.
        let st = popState(player, s, og);
        if (st && st.piano.tax !== player.tassazione) {
            yield GA().setTax(player, st.piano.tax);
            st = popState(player, s, og);
        }

        // --- FASE 1 · schieramento ---
        if (GA().phaseOf(player) === 'schiera') {
            if (GA().boundTotal(player)) { yield GA().deployAllBound(player); st = popState(player, s, og); }
            for (const passo of deployPlan(player, s, st, og)) {
                if (!(player.recluteDaSchierare > 0)) break;
                const n = Math.min(passo.n, player.recluteDaSchierare, roomAt(passo.id));
                if (n > 0) yield GA().deploy(player, passo.id, n);
            }
            st = popState(player, s, og);
        }
        yield* advanceTo(player, 'costruisci');

        // --- FASE 2 · costruzioni ---
        let costruite = GA().phaseOf(player) === 'costruisci' ? 0 : 99;

        // La banca PRIMA di costruire (§7): il Mercato esiste per comprare la
        // pietra che manca, e una pietra comprata dopo aver rinunciato alla
        // strada resta in magazzino per un turno intero. Si fa la spesa, poi si
        // costruisce.
        if (GA().phaseOf(player) === 'costruisci') {
            const banca = bankPlan(player, s, st, og);
            if (banca) yield GA().tradeWithBank(player, banca.dai, banca.prendi, banca.n);
        }

        // Il seggio si è ritrovato sul confine? Si trasloca (500 monete). Va fatto
        // PRIMA delle strade del turno: la rete di collegamenti parte dalla
        // Capitale, e spostarla dopo aver costruito significa costruire dal punto
        // sbagliato.
        if (GA().phaseOf(player) === 'costruisci') {
            const trasloco = capitalPlan(player, s, st, og);
            if (trasloco) {
                yield GA().moveCapital(player, trasloco.provId);
                st = popState(player, s, og);
            }
        }

        for (const type of s.build) {
            if (costruite >= 3) break;
            if (type === 'strada') {
                // Le strade hanno un budget SOLO LORO e non consumano quello degli
                // edifici: collegare il regno è la precondizione di tutto il resto
                // (§4 il raccolto, §8 il Benessere), e un tetto di 3 costruzioni
                // condiviso lo faceva sempre perdere contro una Città. Due per
                // turno di norma — il limite serve a non mangiarsi tutta la pietra
                // — ma quando la pietra abbonda quel motivo non esiste più.
                const maxStrade = ((player.scorte || {}).pietra > 10) ? 4 : 2;
                for (let k = 0; k < maxStrade; k++) {
                    const road = nextRoad(player, st);
                    if (!road) break;
                    const gratis = (player.stradeGratis || 0) > 0;
                    if (!gratis && !canBuild(player, 'strada', road.a)) break;
                    yield GA().buildRoad(player, road.a, road.b);
                    st = popState(player, s, og);       // una strada cambia il Benessere
                }
                continue;
            }
            if (type === 'capitale' && R().getCapitalPathFor(player)) continue;
            if (!wantsBuild(player, type, st)) continue;
            const sito = siteFor(player, type, s, og);
            if (!sito || !canBuild(player, type, sito.id)) continue;
            yield GA().build(player, sito.id, type);
            costruite++;
        }

        // Migliorie civiche (§6.1): dopo gli edifici veri, le eccedenze di risorsa
        // vanno in Sanità/Felicità sulla Capitale — Benessere a poco prezzo.
        if (GA().phaseOf(player) === 'costruisci' && st) {
            for (const key of welfarePlan(player, s, st)) {
                yield GA().buildWelfare(player, key);
                st = popState(player, s, og);   // ogni miglioria cambia il Benessere
            }
        }

        // NAVE (§9.2): se il regno è costiero e ha finito le prede di terra ma ne
        // ha oltremare (l'Inghilterra dietro la Manica, i Fatimidi dietro
        // Gibilterra), si arma una barca sulla costa giusta. Da lì l'attacco di
        // mare lo fa `bestAttack` da sé, perché ora `attackTargets` vede lo scafo.
        if (GA().phaseOf(player) === 'costruisci') {
            const nave = shipPlan(player, s, st);
            if (nave && canBuild(player, BOAT, nave.id)) {
                yield GA().build(player, nave.id, BOAT);
                st = popState(player, s, og);
            }
        }

        // VELIERO (§9.2): solo un regno COLONIALE (js/doctrines.js) lo arma, e
        // solo per la rotta lunga — è la nave con cui il Portogallo va a fondare
        // colonie in Africa e oltre l'oceano.
        if (GA().phaseOf(player) === 'costruisci') {
            const oceano = colonyShipPlan(player);
            if (oceano) {
                yield GA().build(player, oceano.id, OCEAN);
                st = popState(player, s, og);
            }
        }

        // Commerci (§7): prima si risponde alle carovane arrivate (il pegno di chi
        // ha proposto non deve marcire), poi si mandano le proprie — quel che
        // manca si compra, quel che avanza si vende. Tutto dentro la fase
        // costruzioni, come per l'umano.
        if (GA().phaseOf(player) === 'costruisci') {
            for (const m of tradeAnswers(player, s, st, og)) {
                yield m.kind === 'accept' ? GA().acceptTrade(player, m.id) : GA().refuseTrade(player, m.id);
            }
            for (const prop of tradePlan(player, s, st, og)) {
                yield GA().proposeTrade(player, prop.toId, prop.offro, prop.chiedo);
            }
            // Diplomazia (§Diplomazia): prima si risponde agli araldi arrivati,
            // poi si manda il proprio se un fronte scotta. proposePact/acceptPact
            // non vogliono la fase (solo il turno), ma restiamo qui per ordine.
            for (const a of diploAnswers(player, s)) {
                yield a.kind === 'accept' ? GA().acceptPact(player, a.id) : GA().declinePact(player, a.id);
            }
            const patto = diploProposals(player, s);
            if (patto) yield GA().proposePact(player, patto.toId, patto.tipo);
            // E, se un confine cede, si chiede aiuto all'alleato che ci arriva
            // (§Diplomazia): un araldo per turno, come i patti.
            const sos = helpAskPlan(player);
            if (sos) yield GA().askReinforcements(player, sos.toId, sos.provId);
        }

        // Mercenari: monete convertite in muscoli per questo turno soltanto, e
        // solo se chiudono un attacco che senza di loro non si farebbe.
        if (GA().phaseOf(player) === 'costruisci') {
            const merc = mercenaryPlan(player, s, st, og);
            for (let k = 0; merc && k < merc.n; k++) {
                yield GA().recruit(player, merc.provId, 'mercenario');
            }
        }
        yield* advanceTo(player, 'attacca');

        // --- FASE 3 · attacchi ---
        // Prima di tutto le SPEDIZIONI già in mare (dottrina coloniale): una
        // ciurma che ha avvistato una costa dove può reggersi scende lì. Va prima
        // degli attacchi perché una colonia fondata è terra guadagnata senza
        // toccare i confini di casa.
        if (GA().phaseOf(player) === 'attacca') {
            for (const app of colonyLandings(player, s)) {
                yield GA().expeditionLand(player, app.expId, app.toId);
            }
            // E subito dopo SALPA il Veliero appena armato, PRIMA degli attacchi:
            // se lo si lasciasse lì, `bestAttack` se ne servirebbe come di uno
            // scafo qualunque per il primo sbarco a tiro, e la rotta lunga non
            // partirebbe mai. La divisione dei compiti è quella del §9.2: la
            // Nave per le coste vicine, il Veliero per l'oceano.
            const rotta = colonyLaunch(player);
            if (rotta) yield GA().launchExpedition(player, rotta.fromId, rotta.dir, rotta.carico);
        }
        const maxAttacchi = GA().phaseOf(player) === 'attacca' ? s.maxAttacchi : 0;
        for (let k = 0; k < maxAttacchi; k++) {
            const best = bestAttack(player, s, st, undefined, og);
            if (!best) break;
            const engaged = engagedFor(best, s);
            // Il 7º argomento è il TRADIMENTO (§Diplomazia): serve solo quando il
            // bersaglio è di un partner senza consenso — bestAttack l'ha già deciso.
            yield GA().attack(player, best.fromId, best.toId, engaged, undefined, undefined, best.tradimento);
            // La conquista si chiude SUBITO: finché è aperta il motore blocca
            // qualsiasi altra azione (compreso il passaggio di fase).
            const pend = GA().conquestPending(player);
            if (pend) {
                const occupanti = Math.max(1, Math.round(pend.superstiti * s.avanzata));
                yield GA().resolveConquest(player, occupanti);
            }
            st = popState(player, s, og);      // una conquista cambia confini e risorse
        }

        // Quel che avanza DOPO gli attacchi marcia in aiuto di un alleato che
        // l'ha chiesto (§Diplomazia). Va in coda alla fase apposta: prima si
        // combatte la propria guerra, poi si regalano gli uomini che restano — e
        // questo non consuma lo spostamento di fine turno, che resta per sé.
        if (GA().phaseOf(player) === 'attacca') {
            const aiuto = helpSendPlan(player);
            if (aiuto) yield GA().sendReinforcements(player, aiuto.fromId, aiuto.toId, aiuto.n);
        }

        yield* advanceTo(player, 'sposta');

        // --- FASE 4 · spostamento ---
        if (!player.spostamentoFatto) {
            const stm = popState(player, s, og);
            // Chi ha una MARCIA muove la colonna verso la punta; se non c'è un
            // passo avanti da fare, vale lo spostamento di sempre.
            const mossa = marchMove(player, s, stm) || movePlan(player, s, stm, og);
            if (mossa) yield GA().finalMove(player, mossa.fromId, mossa.toId, mossa.n);
        }
    }

    // ============================================================
    // DRIVER — fa scorrere i turni dei bot finché non tocca a un umano.
    // ============================================================

    let timer = null;
    let active = false;
    let velocita = 600;          // ms fra un'azione e la successiva

    function currentPlayer() {
        const t = R().turnoDi();
        return R().players().find(p => p.id === t) || null;
    }

    function botOfTurn() {
        const p = currentPlayer();
        return isBot(p) ? p : null;
    }

    function emit(type, player, result) {
        if (typeof api.onEvent === 'function') {
            try { api.onEvent({ type, player, result }); } catch (e) { console.error(e); }
        }
    }

    // La scena della battaglia si vede anche quando attacca l'IA: la carica, il
    // lampo e i caduti sono il modo in cui la partita si racconta. Quello che il
    // bot NON fa è muovere la telecamera: `playBattleFx` disegna dove le province
    // già stanno, `fitToProvinces` invece inquadra d'ufficio — e con una battaglia
    // ogni pochi decimi di secondo la mappa diventava un frullatore.
    function showResult(player, result) {
        if (!result) return;
        // La scena si vede solo se almeno una delle due province è fuori dalla
        // nebbia: una battaglia dall'altra parte del mondo non deve arrivare a
        // chi non potrebbe saperne nulla (Risiko.isVisible → null = nessuna
        // nebbia, cioè editor o vista generale).
        const guardabile = !R().isVisible ||
            R().isVisible(result.toId) || R().isVisible(result.fromId);
        if (result.battle && guardabile && R().playBattleFx) R().playBattleFx(result);
        emit('action', player, result);
    }

    function playTurn(player) {
        active = true;
        emit('start', player, null);
        const it = turnScript(player);

        const tick = () => {
            let step;
            try { step = it.next(); }
            catch (err) { console.error('[bot] turno interrotto', err); step = { done: true }; }

            if (!step.done) {
                showResult(player, step.value);
                timer = setTimeout(tick, velocita);
                return;
            }

            const fine = GA().endTurn();
            emit('end', player, fine);
            timer = setTimeout(() => {
                const next = botOfTurn();
                if (next) { playTurn(next); return; }
                active = false;
                emit('idle', currentPlayer(), null);
            }, velocita);
        };

        timer = setTimeout(tick, velocita);
    }

    // Da chiamare dopo ogni fine turno umano (e all'apertura della pagina):
    // se tocca a un bot, la catena parte e si ferma da sola quando torna a un
    // giocatore in carne e ossa.
    function run() {
        if (active) return false;
        if (!R() || !R().isAdmin()) return false;   // scrive lo stato: solo chi può
        const p = botOfTurn();
        if (!p) return false;
        // I confini arrivano in differita (vedi neighborsReady in app.js): far
        // giocare un bot prima vorrebbe dire fargli vedere una mappa di isole —
        // niente attacchi, niente strade, turno buttato. Si aspetta e basta.
        if (R().neighborsReady && !R().neighborsReady()) {
            clearTimeout(timer);
            timer = setTimeout(run, 300);
            return false;
        }
        playTurn(p);
        return true;
    }

    function stop() {
        clearTimeout(timer);
        timer = null;
        active = false;
    }

    // Assegna una strategia a ogni regno tranne quello umano (usato da setup.js).
    function assignStrategies(players, humanId, rng) {
        const rand = rng || Math.random;
        // `humanId` può essere un id singolo (com'era), oppure un Set/array di id:
        // i regni umani sono più d'uno quando si seguono 2+ regni con l'IA sugli altri.
        const umani = (humanId instanceof Set) ? humanId
            : new Set((Array.isArray(humanId) ? humanId
                : (humanId === null || humanId === undefined ? [] : [humanId])));
        const mazzo = [];
        while (mazzo.length < players.length) KEYS.forEach(k => mazzo.push(k));
        // mescolata: due regni vicini non devono per forza giocare allo stesso modo
        for (let i = mazzo.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [mazzo[i], mazzo[j]] = [mazzo[j], mazzo[i]];
        }
        let k = 0;
        players.forEach(p => {
            p.bot = umani.has(p.id) ? null : mazzo[k++];
        });
        return players;
    }

    const api = {
        STRATEGIES, KEYS,
        isBot, strategyOf, labelOf, assignStrategies,
        run, stop, playTurn,
        // Diagnostica/banco di prova (NON usato dal gioco): il cervello del turno
        // e il regno di turno, per un driver headless che li faccia girare in
        // modo sincrono (scripts/_dev-sim.html). Sono riferimenti alle stesse
        // funzioni interne: non cambiano nulla del comportamento.
        turnScript, botOfTurn,
        isRunning: () => active,
        speed(ms) { if (ms > 0) velocita = ms; return velocita; },
        onEvent: null
    };

    root.Bot = api;

})(typeof window !== 'undefined' ? window : globalThis);

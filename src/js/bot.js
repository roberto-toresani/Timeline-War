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
            dispiegamento: 'punta'
        },
        conservativo: {
            nome: 'Conservatore',
            motto: 'poche province, ben presidiate',
            soglia: 0.82, maxAttacchi: 1, impegno: 0.7, riservaCasa: 2, guardiaCapitale: 9,
            popTarget: 4,           // vive di rendita: la Popolarità è il suo raccolto
            pesoNeutrali: 1.5, pesoGiocatori: 0.6,
            avanzata: 0.5,
            build: ['capitale', 'strada', 'mercato', 'fortezza', 'citta'],
            mercenari: 1,
            baratto: 1.5,
            dispiegamento: 'minaccia'
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
            dispiegamento: 'punta'
        }
    };

    const KEYS = Object.keys(STRATEGIES);

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
    function enemyThreat(player, id, salvo) {
        return E().landNeighbors(id).reduce((max, n) => {
            if (n === salvo) return max;
            const np = pathOf(n);
            if (!np) return max;
            const chi = E().owner(np);
            if (!chi || chi === player.name) return max;   // libero o mio: non è un invasore
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

    function popState(player, s) {
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

        const piano = root.Popularity.plan(m, {
            target: s.popTarget || 3,
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

    function deployPlan(player, s, st) {
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
    function siteFor(player, type, s) {
        const serve = (GR().COSTS[type] || {}).soldati || 0;
        let prov = survey(player).filter(p => {
            const u = unitsAt(p.id);
            if (!u) return false;
            if (u.capitale || u.citta || u.fortezza) return false;   // insediamenti esclusivi
            return true;
        });
        if (serve) {
            const paganti = prov.filter(p => p.spare >= serve);
            if (!paganti.length) return null;
            prov = paganti;
        }
        if (!prov.length) return null;
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

    // TRASLOCARE il seggio (GameActions.moveCapital, 500 monete). Una Capitale
    // scelta bene al turno 1 può diventare pessima al turno 10: il regno cresce da
    // una parte sola e la vecchia sede si ritrova sul confine, con `P_conf` a zero
    // e mezza Sicurezza persa per sempre. Muoverla è caro, quindi si fa solo
    // quando il guadagno è netto e i soldi non servono ad altro.
    // La vecchia sede diventa Città — non si perde niente, anzi si guadagna un
    // secondo esattore (§7).
    function capitalPlan(player, s, st) {
        if (!st || !GA().moveCapital) return null;
        const costo = (GR().COSTS.capitale || {}).monete || 500;
        if ((player.monete || 0) < costo + coinReserve(player, s)) return null;

        const prov = survey(player);
        const sede = prov.find(p => p.id === st.cap.id);
        if (!sede) return null;
        const attuale = capitalScore(player, sede);
        let meglio = null;
        prov.forEach(p => {
            if (p.id === st.cap.id) return;
            const u = unitsAt(p.id);
            if (!u || u.citta || u.fortezza || u.capitale) return;   // insediamenti esclusivi
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

    // La banca, cioè L'ESTERO (§7): 2 unità di quel che avanza → 1 di quel che
    // manca, subito e senza contrattare con nessuno. È il canale più affidabile
    // che un regno abbia — l'altro regno può rifiutare, la banca no — e quindi è
    // quello che sblocca davvero una costruzione ferma.
    // Cosa comprare lo dice il BISOGNO (`resourceNeed`), non la scorta più bassa:
    // avere zero Legno non è un problema se il Legno non serve a niente di quel
    // che si vuole costruire, mentre l'Argilla a 1 può bloccare una Città da mille
    // monete. Si tiene sempre un margine su ciò che si dà via: svuotare una scorta
    // per riempirne un'altra sposta soltanto il problema.
    function bankPlan(player, s, st) {
        if (!GA().hasMarket(player)) return null;
        const scorte = player.scorte || {};
        const need = resourceNeed(player, s, st);

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
    function resourceNeed(player, s, st) {
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

        // L'abbondanza raffredda il desiderio, ma non cancella un fabbisogno già
        // contato: dieci Pietra con dieci province da collegare restano poche.
        GR().RES.forEach(k => {
            if ((scorte[k] || 0) >= 8) need[k] = Math.max(0, need[k] - 0.6);
        });
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
    function tradeAnswers(player, s, st) {
        const mosse = [];
        const soglia = (s && s.baratto) || 1.1;
        const need = resourceNeed(player, s, st);
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
    function tradePlan(player, s, st) {
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

        const need = resourceNeed(player, s, st);
        const cassa = { monete: player.monete || 0 };
        GR().RES.forEach(k => { cassa[k] = (player.scorte || {})[k] || 0; });
        const riserva = coinReserve(player, s);

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
    function bestAttack(player, s, st, extra) {
        let best = null;
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
                const premio = 1 + (u.capitale ? 1.2 : 0) + (u.citta ? 0.6 : 0) + (u.fortezza ? 0.4 : 0)
                    + popValueOf(st, t.id, t.viaMare) * 6
                    + grudgeAgainst(player, t.id) * 1.5;
                const peso = (t.owner === 'Neutrale' || !ownerAt(t.id)) ? s.pesoNeutrali : s.pesoGiocatori;
                const score = (p100 - s.soglia + 0.1) * premio * peso;
                if (!best || score > best.score) {
                    best = {
                        fromId: p.id, toId: t.id, disponibili: imbarcabili, target: t, score, p100,
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
    function coinReserve(player, s) {
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
        return riserva;
    }

    function mercenaryPlan(player, s, st) {
        const quanti = s.mercenari || 0;
        if (!quanti) return null;
        const prezzo = GR().COSTS.mercenario.monete;
        const budget = Math.floor(Math.max(0, (player.monete || 0) - coinReserve(player, s)) / prezzo);
        const tetto = Math.min(quanti, budget);
        if (tetto < 1) return null;

        // Se un attacco lo porta già a casa così, i mercenari sono soldi buttati.
        if (bestAttack(player, s, st, 0)) return null;

        // Che cosa si sbloccherebbe spendendo tutto il comprabile? Una domanda
        // sola: `bestAttack` costa una scansione di tutto il regno, e chiederla
        // una volta per ogni numero da 1 al tetto sarebbe lo stesso conto fatto
        // cinque volte. Trovato il bersaglio, il numero minimo che basta si
        // calcola sulla formula, senza rifare il giro.
        const b = bestAttack(player, s, st, tetto);
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

    function movePlan(player, s, st) {
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

        const fronte = prov.filter(p => p.fronte)
            .sort((a, b) => (b.minaccia - b.truppe) - (a.minaccia - a.truppe))[0];
        if (!fronte || fronte.id === retro.id) return null;
        if (!GA().ownAdjacent(player, retro.id).has(fronte.id)) return null;
        const n = Math.min(partenti(retro), roomAt(fronte.id));
        return n > 0 ? { fromId: retro.id, toId: fronte.id, n } : null;
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
        let st = popState(player, s);
        if (st && st.piano.tax !== player.tassazione) {
            yield GA().setTax(player, st.piano.tax);
            st = popState(player, s);
        }

        // --- FASE 1 · schieramento ---
        if (GA().phaseOf(player) === 'schiera') {
            if (GA().boundTotal(player)) { yield GA().deployAllBound(player); st = popState(player, s); }
            for (const passo of deployPlan(player, s, st)) {
                if (!(player.recluteDaSchierare > 0)) break;
                const n = Math.min(passo.n, player.recluteDaSchierare, roomAt(passo.id));
                if (n > 0) yield GA().deploy(player, passo.id, n);
            }
            st = popState(player, s);
        }
        yield* advanceTo(player, 'costruisci');

        // --- FASE 2 · costruzioni ---
        let costruite = GA().phaseOf(player) === 'costruisci' ? 0 : 99;

        // La banca PRIMA di costruire (§7): il Mercato esiste per comprare la
        // pietra che manca, e una pietra comprata dopo aver rinunciato alla
        // strada resta in magazzino per un turno intero. Si fa la spesa, poi si
        // costruisce.
        if (GA().phaseOf(player) === 'costruisci') {
            const banca = bankPlan(player, s, st);
            if (banca) yield GA().tradeWithBank(player, banca.dai, banca.prendi, banca.n);
        }

        // Il seggio si è ritrovato sul confine? Si trasloca (500 monete). Va fatto
        // PRIMA delle strade del turno: la rete di collegamenti parte dalla
        // Capitale, e spostarla dopo aver costruito significa costruire dal punto
        // sbagliato.
        if (GA().phaseOf(player) === 'costruisci') {
            const trasloco = capitalPlan(player, s, st);
            if (trasloco) {
                yield GA().moveCapital(player, trasloco.provId);
                st = popState(player, s);
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
                    st = popState(player, s);       // una strada cambia il Benessere
                }
                continue;
            }
            if (type === 'capitale' && R().getCapitalPathFor(player)) continue;
            if (!wantsBuild(player, type, st)) continue;
            const sito = siteFor(player, type, s);
            if (!sito || !canBuild(player, type, sito.id)) continue;
            yield GA().build(player, sito.id, type);
            costruite++;
        }

        // Commerci (§7): prima si risponde alle carovane arrivate (il pegno di chi
        // ha proposto non deve marcire), poi si mandano le proprie — quel che
        // manca si compra, quel che avanza si vende. Tutto dentro la fase
        // costruzioni, come per l'umano.
        if (GA().phaseOf(player) === 'costruisci') {
            for (const m of tradeAnswers(player, s, st)) {
                yield m.kind === 'accept' ? GA().acceptTrade(player, m.id) : GA().refuseTrade(player, m.id);
            }
            for (const prop of tradePlan(player, s, st)) {
                yield GA().proposeTrade(player, prop.toId, prop.offro, prop.chiedo);
            }
        }

        // Mercenari: monete convertite in muscoli per questo turno soltanto, e
        // solo se chiudono un attacco che senza di loro non si farebbe.
        if (GA().phaseOf(player) === 'costruisci') {
            const merc = mercenaryPlan(player, s, st);
            for (let k = 0; merc && k < merc.n; k++) {
                yield GA().recruit(player, merc.provId, 'mercenario');
            }
        }
        yield* advanceTo(player, 'attacca');

        // --- FASE 3 · attacchi ---
        const maxAttacchi = GA().phaseOf(player) === 'attacca' ? s.maxAttacchi : 0;
        for (let k = 0; k < maxAttacchi; k++) {
            const best = bestAttack(player, s, st);
            if (!best) break;
            const engaged = engagedFor(best, s);
            yield GA().attack(player, best.fromId, best.toId, engaged);
            // La conquista si chiude SUBITO: finché è aperta il motore blocca
            // qualsiasi altra azione (compreso il passaggio di fase).
            const pend = GA().conquestPending(player);
            if (pend) {
                const occupanti = Math.max(1, Math.round(pend.superstiti * s.avanzata));
                yield GA().resolveConquest(player, occupanti);
            }
            st = popState(player, s);      // una conquista cambia confini e risorse
        }
        yield* advanceTo(player, 'sposta');

        // --- FASE 4 · spostamento ---
        if (!player.spostamentoFatto) {
            const mossa = movePlan(player, s, popState(player, s));
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
        isRunning: () => active,
        speed(ms) { if (ms > 0) velocita = ms; return velocita; },
        onEvent: null
    };

    root.Bot = api;

})(typeof window !== 'undefined' ? window : globalThis);

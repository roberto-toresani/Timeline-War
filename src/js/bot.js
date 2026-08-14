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
    const STRATEGIES = {
        espansione: {
            nome: 'Espansione',
            motto: 'prende terra a ogni turno, e la difende dopo',
            soglia: 0.55, maxAttacchi: 6, impegno: 1, riservaCasa: 0, guardiaCapitale: 6,
            pesoNeutrali: 1.3, pesoGiocatori: 1,
            avanzata: 1,            // quota di superstiti che resta nella provincia presa
            build: ['capitale', 'strada', 'citta'],
            mercenari: 4,
            baratto: 1.2,           // quanto deve ricevere per ogni unità che dà (§7)
            dispiegamento: 'punta'
        },
        conservativo: {
            nome: 'Conservatore',
            motto: 'poche province, ben presidiate',
            soglia: 0.82, maxAttacchi: 1, impegno: 0.7, riservaCasa: 2, guardiaCapitale: 9,
            pesoNeutrali: 1.5, pesoGiocatori: 0.6,
            avanzata: 0.5,
            build: ['capitale', 'strada', 'fortezza', 'mercato', 'citta'],
            mercenari: 0,
            baratto: 1.5,
            dispiegamento: 'minaccia'
        },
        costruttore: {
            nome: 'Costruttore',
            motto: 'strade, città, e la guerra solo se conviene',
            soglia: 0.75, maxAttacchi: 2, impegno: 0.8, riservaCasa: 1, guardiaCapitale: 8,
            pesoNeutrali: 1.6, pesoGiocatori: 0.7,
            avanzata: 0.6,
            build: ['capitale', 'strada', 'citta', 'mercato', 'fortezza'],
            mercenari: 0,
            baratto: 0.9,           // le risorse gli servono: tratta volentieri
            dispiegamento: 'fronte'
        },
        opportunista: {
            nome: 'Opportunista',
            motto: 'colpisce dove è più debole, non dove è più utile',
            soglia: 0.68, maxAttacchi: 4, impegno: 0.9, riservaCasa: 1, guardiaCapitale: 7,
            pesoNeutrali: 1.2, pesoGiocatori: 1.1,
            avanzata: 0.8,
            build: ['capitale', 'strada', 'citta', 'mercato'],
            mercenari: 2,
            baratto: 1.1,
            dispiegamento: 'punta'
        },
        predone: {
            nome: 'Predone',
            motto: 'ignora le terre di nessuno: vuole i regni degli altri',
            soglia: 0.6, maxAttacchi: 5, impegno: 1, riservaCasa: 0, guardiaCapitale: 6,
            pesoNeutrali: 0.5, pesoGiocatori: 1.8,
            avanzata: 1,
            build: ['capitale', 'strada'],
            mercenari: 5,
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
    // (§9). Non ricalcola niente, chiama la stessa formula della battaglia — così
    // il bot non attacca in montagna credendo di essere in pianura.
    function winProb(A, t) {
        return RisikoBattle.winChance(A, (t.troops || 0) + (t.fort || 0), t.esponente);
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
            return {
                id, path,
                truppe: troopsAt(id),
                spare: GR().spendableTroops(troopsAt(id)),
                fronte: vicini.length > 0,
                vicini, minaccia, debolezza
            };
        });
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

    function deployPlan(player, s) {
        let pool = player.recluteDaSchierare || 0;
        if (!pool) return [];
        const prov = survey(player);
        if (!prov.length) return [];

        const piano = [];

        // PRIMA DI TUTTO: la guardia della Capitale. La Popolarità (§8) conta i
        // soldati OLTRE i cinque presenti nella Capitale, e una Popolarità di 2
        // costa −1 risorsa e −1 recluta ogni turno: portare la guardia a 6-8 vale
        // più di qualsiasi provincia in più. È la prima cosa che fa un bot.
        const cap = R().getCapitalPathFor(player);
        if (cap) {
            const manca = (s.guardiaCapitale || 6) - troopsAt(cap.id);
            const n = Math.min(Math.max(0, manca), pool, roomAt(cap.id));
            if (n > 0) { piano.push({ id: cap.id, n }); pool -= n; }
        }
        if (!pool) return piano;

        const fronte = prov.filter(p => p.fronte);
        const base = fronte.length ? fronte : prov;

        // "punta": due terzi delle reclute nella provincia da cui conviene
        // attaccare (il bersaglio più debole), il resto sul fronte.
        if (s.dispiegamento === 'punta' && fronte.length) {
            const lancia = base.slice().sort((a, b) => b.debolezza - a.debolezza)[0];
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
    function nextRoad(player) {
        const collegate = GA().connectedOf(player);
        const mie = E().ownedPaths(player.name).map(p => p.id);
        if (!collegate.size) return null;
        const fuori = mie.filter(id => !collegate.has(id));
        // Prima le province che portano una risorsa: sono quelle che ripagano.
        fuori.sort((a, b) => (R().resourceKeyOf(pathOf(b)) ? 1 : 0) - (R().resourceKeyOf(pathOf(a)) ? 1 : 0));
        for (const id of fuori) {
            const gancio = E().landNeighbors(id).find(n => collegate.has(n) && !E().hasRoad(id, n));
            if (gancio) return { a: gancio, b: id };
        }
        return null;
    }

    // Dove mettere una costruzione: la Capitale nella provincia più popolata
    // (deve pagare 5 soldati), gli altri edifici dove servono davvero.
    function siteFor(player, type, s) {
        const prov = survey(player).filter(p => {
            const u = unitsAt(p.id);
            if (!u) return false;
            if (u.capitale || u.citta || u.fortezza) return false;   // insediamenti esclusivi
            return true;
        });
        if (!prov.length) return null;
        if (type === 'capitale') {
            return prov.slice().sort((a, b) => b.spare - a.spare)[0] || null;
        }
        if (type === 'fortezza') {
            return prov.slice().sort((a, b) => b.minaccia - a.minaccia)[0] || null;
        }
        // Città: nell'entroterra collegato, dove non verrà presa il turno dopo.
        const collegate = GA().connectedOf(player);
        const buone = prov.filter(p => collegate.has(p.id));
        const pool = buone.length ? buone : prov;
        return pool.slice().sort((a, b) => a.minaccia - b.minaccia)[0] || null;
    }

    function canBuild(player, type, provId) {
        const cost = GR().COSTS[type];
        if (!cost) return false;
        return GR().canAfford(player, cost, GR().spendableTroops(troopsAt(provId))).ok;
    }

    // ---------- FASE 2 · commerci (§7) ----------
    // Un bot col Mercato commercia come tutto il resto: passando dalle azioni del
    // giocatore. Fa due cose, entrambe in fase costruzioni.
    //
    // Quanto vale una merce per un bot, in monete: l'oro vale il suo taglio, una
    // risorsa vale COIN_PER_RES (le risorse sono più scarse del denaro, quindi
    // valgono più di 100). Serve a confrontare offerte in oro e in risorse.
    const COIN_PER_RES = 150;
    function goodValue(g) {
        if (!g) return 0;
        return g.tipo === 'monete' ? g.n : g.n * COIN_PER_RES;
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
    function tradeAnswers(player, s) {
        const mosse = [];
        const soglia = (s && s.baratto) || 1.1;
        GA().tradeInbox(player).forEach(o => {
            const hai = haveGood(player, o.chiedo);
            const conviene = goodValue(o.offro) >= goodValue(o.chiedo) * soglia;
            if (conviene && hai >= o.chiedo.n) mosse.push({ kind: 'accept', id: o.id });
            else mosse.push({ kind: 'refuse', id: o.id });
        });
        return mosse;
    }

    // PROPONE uno scambio quando ha un'eccedenza netta di una risorsa e gli manca
    // un'altra: offre un po' di ciò che gli avanza per un po' di ciò che gli serve,
    // a un altro regno ancora vivo. Una proposta per turno basta: non deve
    // scommerciare, deve solo non star fermo se ha risorse ferme.
    function tradePlan(player, s) {
        if (!GA().hasMarket(player)) return null;
        if (GA().tradeOutbox(player).length >= GR().TRADE_MAX_PENDING) return null;

        const scorte = player.scorte || {};
        const ordinate = GR().RES.slice().sort((a, b) => (scorte[b] || 0) - (scorte[a] || 0));
        const abbondante = ordinate[0], scarso = ordinate[ordinate.length - 1];
        if ((scorte[abbondante] || 0) < 6) return null;             // niente da svendere
        if ((scorte[abbondante] || 0) - (scorte[scarso] || 0) < 4) return null;  // scorte piatte

        const altri = R().players().filter(p =>
            p.id !== player.id && E().ownedPaths(p.name).length);
        if (!altri.length) return null;
        const verso = altri[Math.floor(Math.random() * altri.length)];

        // Offre 3 dell'abbondante per 2 dello scarso: un affare per chi riceve,
        // così la proposta ha davvero speranza di essere accettata.
        return { toId: verso.id, offro: { tipo: abbondante, n: 3 }, chiedo: { tipo: scarso, n: 2 } };
    }

    // ---------- FASE 3 · attacchi ----------

    // Il miglior attacco possibile in questo momento, o null se nessuno supera
    // la soglia di rischio della strategia.
    function bestAttack(player, s) {
        let best = null;
        const cap = R().getCapitalPathFor(player);
        const guardia = s.guardiaCapitale || 6;
        survey(player).forEach(p => {
            // Dalla Capitale non parte mai la guardia: quei soldati non sono
            // truppe di manovra, sono il livello di Popolarità del regno (§8).
            const tetto = (cap && cap.id === p.id) ? Math.max(0, p.truppe - guardia) : p.spare;
            const disponibili = Math.max(0, Math.min(p.spare, tetto) - s.riservaCasa);
            if (disponibili < 1) return;
            GA().attackTargets(player, p.id).forEach(t => {
                // Sbarco (§9.2): non partono tutti i disponibili, parte quel che
                // sta sullo scafo. Il bot deve fare il conto con lo stesso tetto
                // del giocatore, se no pronostica su un'armata che non s'imbarca.
                const imbarcabili = t.viaMare ? Math.min(disponibili, t.carico) : disponibili;
                if (imbarcabili < 1) return;
                const p100 = winProb(imbarcabili, t);
                if (p100 < s.soglia) return;
                const u = unitsAt(t.id) || {};
                const premio = 1 + (u.capitale ? 1.2 : 0) + (u.citta ? 0.6 : 0) + (u.fortezza ? 0.4 : 0);
                const peso = (t.owner === 'Neutrale' || !ownerAt(t.id)) ? s.pesoNeutrali : s.pesoGiocatori;
                const score = (p100 - s.soglia + 0.1) * premio * peso;
                if (!best || score > best.score) {
                    best = { fromId: p.id, toId: t.id, disponibili: imbarcabili, target: t, score, p100 };
                }
            });
        });
        return best;
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

    function movePlan(player, s) {
        const prov = survey(player);
        const retro = prov.filter(p => !p.fronte && p.spare > 0)
            .sort((a, b) => b.spare - a.spare)[0];
        if (!retro) return null;

        // Priorità allo spostamento verso la Capitale finché la guardia è sotto
        // quota: un turno di Popolarità 2 costa più di una provincia difesa male.
        const cap = R().getCapitalPathFor(player);
        const guardia = (s && s.guardiaCapitale) || 6;
        if (cap && cap.id !== retro.id && troopsAt(cap.id) < guardia &&
            GA().ownReachable(player, retro.id).has(cap.id)) {
            const n = Math.min(retro.spare, guardia - troopsAt(cap.id), roomAt(cap.id));
            if (n > 0) return { fromId: retro.id, toId: cap.id, n };
        }

        const fronte = prov.filter(p => p.fronte)
            .sort((a, b) => (b.minaccia - b.truppe) - (a.minaccia - a.truppe))[0];
        if (!fronte || fronte.id === retro.id) return null;
        if (!GA().ownReachable(player, retro.id).has(fronte.id)) return null;
        const n = Math.min(retro.spare, roomAt(fronte.id));
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

        // --- FASE 1 · schieramento ---
        if (GA().phaseOf(player) === 'schiera') {
            if (GA().boundTotal(player)) yield GA().deployAllBound(player);
            for (const passo of deployPlan(player, s)) {
                if (!(player.recluteDaSchierare > 0)) break;
                const n = Math.min(passo.n, player.recluteDaSchierare, roomAt(passo.id));
                if (n > 0) yield GA().deploy(player, passo.id, n);
            }
        }
        yield* advanceTo(player, 'costruisci');

        // --- FASE 2 · costruzioni ---
        let costruite = GA().phaseOf(player) === 'costruisci' ? 0 : 99;
        for (const type of s.build) {
            if (costruite >= 3) break;
            if (type === 'strada') {
                // Fino a due strade per turno: la connettività è la cosa che rende
                // un regno ricco, ma non deve mangiarsi tutta la pietra.
                for (let k = 0; k < 2; k++) {
                    const road = nextRoad(player);
                    if (!road) break;
                    const gratis = (player.stradeGratis || 0) > 0;
                    if (!gratis && !canBuild(player, 'strada', road.a)) break;
                    yield GA().buildRoad(player, road.a, road.b);
                    costruite++;
                }
                continue;
            }
            if (type === 'capitale' && R().getCapitalPathFor(player)) continue;
            const sito = siteFor(player, type, s);
            if (!sito || !canBuild(player, type, sito.id)) continue;
            yield GA().build(player, sito.id, type);
            costruite++;
        }
        // Commerci (§7): prima si risponde alle carovane arrivate (il pegno di chi
        // ha proposto non deve marcire), poi si prova a mandarne una se c'è
        // un'eccedenza ferma. Tutto dentro la fase costruzioni, come per l'umano.
        if (GA().phaseOf(player) === 'costruisci') {
            for (const m of tradeAnswers(player, s)) {
                yield m.kind === 'accept' ? GA().acceptTrade(player, m.id) : GA().refuseTrade(player, m.id);
            }
            const prop = tradePlan(player, s);
            if (prop) yield GA().proposeTrade(player, prop.toId, prop.offro, prop.chiedo);
        }

        // Mercenari: monete convertite in muscoli per questo turno soltanto.
        // Li comprano solo i profili aggressivi, e solo dove partirà l'attacco.
        if (s.mercenari && costruite < 99) {
            const lancia = survey(player).filter(p => p.fronte)
                .sort((a, b) => b.debolezza - a.debolezza)[0];
            for (let k = 0; k < s.mercenari && lancia; k++) {
                if ((player.monete || 0) < GR().COSTS.mercenario.monete + 300) break;
                if (roomAt(lancia.id) < 1) break;
                yield GA().recruit(player, lancia.id, 'mercenario');
            }
        }
        yield* advanceTo(player, 'attacca');

        // --- FASE 3 · attacchi ---
        const maxAttacchi = GA().phaseOf(player) === 'attacca' ? s.maxAttacchi : 0;
        for (let k = 0; k < maxAttacchi; k++) {
            const best = bestAttack(player, s);
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
        }
        yield* advanceTo(player, 'sposta');

        // --- FASE 4 · spostamento ---
        if (!player.spostamentoFatto) {
            const mossa = movePlan(player, s);
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
        const mazzo = [];
        while (mazzo.length < players.length) KEYS.forEach(k => mazzo.push(k));
        // mescolata: due regni vicini non devono per forza giocare allo stesso modo
        for (let i = mazzo.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [mazzo[i], mazzo[j]] = [mazzo[j], mazzo[i]];
        }
        let k = 0;
        players.forEach(p => {
            p.bot = (p.id === humanId) ? null : mazzo[k++];
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

// ============================================================
// AZIONI DI GIOCO — è l'unico posto che modifica lo stato della partita.
// Ogni azione valida da sé (proprietà, adiacenza, costi, esclusività) e ritorna
// { ok, msg }: la UI si limita a mostrare il messaggio.
//
// Non tocca il DOM dell'SVG: passa da window.Risiko.engine (vedi coda di app.js).
// Le regole e i costi stanno in game-rules.js; la battaglia in battle.js.
// Riferimento: docs/GAME_DESIGN.md §2, §4, §5, §6, §9.
// ============================================================

(function (root) {
    'use strict';

    const R = () => root.Risiko;
    const E = () => root.Risiko.engine;
    const GR = () => root.GameRules;

    const fail = (msg) => ({ ok: false, msg });
    const done = (msg, extra) => Object.assign({ ok: true, msg }, extra || {});

    // ---------- helper condivisi ----------

    function unitsOf(paths) {
        return KingdomStats.countUnits(paths.map(p => ({ pieces: E().pieces(p) })));
    }

    function snapshotOf(player) {
        return E().ownedPaths(player.name).map(p => ({
            id: p.id,
            resource: R().resourceKeyOf(p) || null,
            pieces: E().pieces(p)
        }));
    }

    // Province collegate del regno (§4): serve alla raccolta e all'etichetta in UI.
    function connectedOf(player) {
        const paths = E().ownedPaths(player.name);
        const owned = paths.map(p => p.id);
        const hubs = paths
            .filter(p => E().countPiece(p, 'capitale') > 0 || E().countPiece(p, 'citta') > 0)
            .map(p => p.id);
        return GR().connected(owned, E().roads(), hubs);
    }

    // Paga un costo: monete e scorte dal regno, soldati dalla provincia indicata.
    function pay(player, cost, path) {
        Object.keys(cost).forEach(k => {
            if (k === 'monete') player.monete -= cost[k];
            else if (k === 'soldati') {
                E().addPiece(path, 'soldato', -cost[k]);
                consumePlaced(player, path.id, cost[k]);   // spesi: non si ritirano più
            }
            else player.scorte[k] -= cost[k];
        });
    }

    // ---------- serbatoi delle reclute (§5.1) ----------
    // Due mucchi distinti, vedi KingdomStats.reinforcements:
    //   player.recluteDaSchierare  → LIBERE, vanno dove vuole il giocatore
    //   player.recluteVincolate    → { idProvincia: n }, obbligate in quella provincia
    //   player.schierateTurno      → { idProvincia: {libere, vincolate} } quel che ha
    //                                 già posato IN QUESTO TURNO: è l'unica cosa che
    //                                 può ritirare (i soldati vecchi non si smontano).

    function boundPool(player) {
        if (!player.recluteVincolate) player.recluteVincolate = {};
        return player.recluteVincolate;
    }

    function placedPool(player) {
        if (!player.schierateTurno) player.schierateTurno = {};
        return player.schierateTurno;
    }

    function placedAt(player, provId) {
        const pool = placedPool(player);
        if (!pool[provId]) pool[provId] = { libere: 0, vincolate: 0 };
        return pool[provId];
    }

    // Soldati appena schierati che lasciano la provincia (spesi in una costruzione,
    // partiti all'attacco): non sono più ritirabili, altrimenti il serbatoio si
    // riempirebbe di reclute che sulla mappa non ci sono più.
    function consumePlaced(player, provId, n) {
        const rec = placedPool(player)[provId];
        if (!rec) return;
        const libere = Math.min(rec.libere, n);
        rec.libere -= libere;
        rec.vincolate = Math.max(0, rec.vincolate - (n - libere));
    }

    function boundTotal(player) {
        const pool = boundPool(player);
        return Object.keys(pool).reduce((s, k) => s + (pool[k] || 0), 0);
    }

    // Tetto di impilamento della provincia (PIECES.soldato.max): senza questo
    // controllo changePiece scarterebbe in silenzio le reclute in eccesso.
    function roomFor(path) {
        const max = (typeof PIECES !== 'undefined' && PIECES.soldato && PIECES.soldato.max) || 30;
        return Math.max(0, max - E().countPiece(path, 'soldato'));
    }

    // Soldati che possono LASCIARE la provincia: tutti meno il presidio minimo
    // (§5, GameRules.MIN_GARRISON). Vale per gli attacchi, gli spostamenti, i
    // costi in soldati delle costruzioni e il ritiro delle reclute: nessuna di
    // queste può ridurre una provincia a zero.
    function spare(path) {
        return GR().spendableTroops(E().countPiece(path, 'soldato'));
    }

    function garrisonFail(path) {
        return fail('In ' + R().provinceLabel(path) + ' resta un solo soldato: una provincia ' +
            'non si lascia mai sguarnita.');
    }

    function isMyTurn(player) {
        const t = R().turnoDi();
        return t === null || t === undefined || t === player.id;
    }

    function requireTurn(player) {
        if (isMyTurn(player)) return null;
        const chi = R().players().find(p => p.id === R().turnoDi());
        return fail('Non è il tuo turno' + (chi ? ': tocca a ' + chi.name : '') + '.');
    }

    // ---------- fasi del turno (§2) ----------
    // Il turno del giocatore è una sequenza, non un menù: prima si schiera, poi si
    // costruisce, poi si attacca, e in coda si fa UN solo spostamento. Le fasi si
    // avanzano e basta: tornare indietro dopo aver attaccato permetterebbe di
    // costruire con le truppe già sacrificate, che è un altro gioco.
    // Il vincolo vive QUI e non nella UI: la plancia nasconde i comandi fuori fase,
    // ma è questo modulo a rifiutare l'azione, così un click fuori tempo non passa.

    const PHASES = ['schiera', 'costruisci', 'attacca', 'sposta'];

    const PHASE_LABEL = {
        schiera: 'Schieramento',
        costruisci: 'Costruzioni',
        attacca: 'Attacchi',
        sposta: 'Spostamento'
    };

    const PHASE_HINT = {
        schiera: 'Distribuisci le reclute fra le tue province. Le obbligatorie restano dove nascono.',
        costruisci: 'Spendi monete e risorse: edifici, navi, strade, unità temporanee.',
        attacca: 'Scegli da dove parti e chi colpisci. Puoi attaccare quante volte vuoi.',
        sposta: 'Un solo spostamento, fra due tue province collegate via terra.'
    };

    function phaseOf(player) {
        if (PHASES.indexOf(player.fase) < 0) player.fase = PHASES[0];
        return player.fase;
    }

    function phaseIndex(player) { return PHASES.indexOf(phaseOf(player)); }

    // Errore se non siamo nella fase richiesta. Dice sempre dove siamo davvero:
    // "non puoi" senza il perché è la cosa che fa sembrare rotto il gioco.
    function requirePhase(player, fase) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        if (player.conquista) {
            return fail('Prima decidi come occupare ' + labelOf(player.conquista.toId) + ': la conquista è in sospeso.');
        }
        if (phaseOf(player) === fase) return null;
        return fail('Sei nella fase "' + PHASE_LABEL[phaseOf(player)] + '": ' +
            (PHASES.indexOf(fase) < phaseIndex(player)
                ? 'la fase "' + PHASE_LABEL[fase] + '" è già passata.'
                : 'arriva prima alla fase "' + PHASE_LABEL[fase] + '".'));
    }

    function labelOf(provId) {
        const path = E().path(provId);
        return path ? R().provinceLabel(path) : provId;
    }

    // Passa alla fase successiva. Uscendo dallo schieramento i rinforzi obbligatori
    // rimasti si posano d'ufficio: possono andare in un posto solo, tenerli in mano
    // sarebbe solo un modo di dimenticarseli.
    function nextPhase(player) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        if (player.conquista) {
            return fail('Prima decidi come occupare ' + labelOf(player.conquista.toId) + '.');
        }
        const i = phaseIndex(player);
        if (i >= PHASES.length - 1) return fail('Sei all\'ultima fase: da qui si chiude il turno.');

        let nota = '';
        if (PHASES[i] === 'schiera') {
            const forzate = forcePendingBound(player);
            if (forzate) nota = ' (' + forzate + ' rinforzi obbligatori schierati d\'ufficio)';
        }
        player.fase = PHASES[i + 1];
        E().refresh();
        E().save();
        return done('Fase ' + (i + 2) + ': ' + PHASE_LABEL[player.fase] + '.' + nota);
    }

    // ---------- avvio partita (admin) ----------

    // Porta la partita ai valori iniziali del §11: 5 soldati per provincia
    // posseduta, 1000 monete, scorte a 0, e fissa l'ordine di turno.
    function startGame() {
        const players = R().players();
        players.forEach(pl => {
            pl.monete = 1000;
            pl.scorte = GR().emptyScorte();
            pl.recluteDaSchierare = 0;
            pl.recluteVincolate = {};
            pl.schierateTurno = {};
            pl.prestigioCiclo = 0;
            pl.puntiOro = 0;
            pl.temporanei = {};
            pl.fase = PHASES[0];
            pl.spostamentoFatto = false;
            pl.conquista = null;
            E().ownedPaths(pl.name).forEach(path => {
                const cur = E().countPiece(path, 'soldato');
                E().addPiece(path, 'soldato', 5 - cur);
                E().setArmyColor(path, pl.color);
                E().redrawProvince(path);
            });
        });

        // Giocano solo i regni che hanno almeno una provincia.
        const ordine = players.filter(pl => E().ownedPaths(pl.name).length).map(pl => pl.id);
        R().setTurnState(ordine.length ? ordine[0] : null, ordine, 0);
        beginTurn();
        E().refresh();
        E().save();
        return done(ordine.length
            ? 'Partita avviata: ' + ordine.length + ' regni in gioco.'
            : 'Nessun regno ha province: assegnale prima dalla mappa.');
    }

    // ---------- ciclo del turno ----------

    // FASE 1 (§2): produzione automatica per il giocatore di turno.
    function beginTurn() {
        const player = R().players().find(p => p.id === R().turnoDi());
        if (!player) return fail('Nessun giocatore di turno.');

        const paths = E().ownedPaths(player.name);
        const units = unitsOf(paths);
        const capital = R().getCapitalPathFor(player);
        const pop = capital ? R().computePopularity(player, capital).totale : null;
        const prod = GR().turnProduction(snapshotOf(player), connectedOf(player), units,
            player.tassazione, pop);

        player.monete += prod.monete;
        GR().RES.forEach(k => { player.scorte[k] += prod.risorse[k]; });
        player.prestigioCiclo = Math.max(0, Math.min(10, player.prestigioCiclo + prod.prestigio));

        // Le libere si sommano a quelle avanzate dal turno prima; le vincolate
        // entrano nel serbatoio della loro provincia. Lo storico di cosa è stato
        // posato riparte da zero: si ritira solo dentro il proprio turno.
        player.recluteDaSchierare += prod.reclute;
        const bound = boundPool(player);
        Object.keys(prod.vincolate || {}).forEach(id => {
            bound[id] = (bound[id] || 0) + prod.vincolate[id];
        });
        player.schierateTurno = {};

        // Il turno riparte sempre dalla prima fase, con lo spostamento di nuovo
        // disponibile e nessuna conquista in sospeso.
        player.fase = PHASES[0];
        player.spostamentoFatto = false;
        player.conquista = null;

        return done('Turno di ' + player.name, { produzione: prod });
    }

    // FASE 3 (§2): scadono i temporanei, passa il turno. Chiuso il giro,
    // avanza il turno globale (l'anno) e ruota chi apre il round (§2.1).
    function endTurn() {
        const ordine = R().ordine();
        if (!ordine.length) return fail('La partita non è stata avviata.');

        const player = R().players().find(p => p.id === R().turnoDi());
        // I rinforzi degli edifici sono obbligatori: se il giocatore chiude il turno
        // senza averli posati li si schiera d'ufficio, invece di bloccarlo o di
        // lasciarli evaporare.
        const forzate = player ? forcePendingBound(player) : 0;
        // Conquista lasciata a metà: i superstiti restano tutti nella provincia
        // presa (è già la situazione sulla mappa), si chiude solo la pratica.
        if (player) { player.conquista = null; expireTemporaries(player); }

        const idx = ordine.indexOf(R().turnoDi());
        const primo = R().primoDelGiro();
        const nextIdx = (idx + 1) % ordine.length;

        // Giro completo quando si torna a chi lo ha aperto.
        const giroFinito = nextIdx === primo;
        if (giroFinito) {
            R().advanceGlobalTurn();
            const nuovoPrimo = (primo + 1) % ordine.length;
            R().setTurnState(ordine[nuovoPrimo], ordine, nuovoPrimo);
        } else {
            R().setTurnState(ordine[nextIdx], ordine, primo);
        }

        const res = beginTurn();
        E().refresh();
        E().save();
        const nota = forzate ? ' (' + forzate + ' rinforzi obbligatori schierati d\'ufficio)' : '';
        return done((giroFinito ? 'Giro completato: nuovo turno.' : 'Turno passato.') + nota,
            { produzione: res.produzione });
    }

    // Mercenari e Guarnigioni valgono un turno solo (§5.3).
    function expireTemporaries(player) {
        const temp = player.temporanei || {};
        Object.keys(temp).forEach(provId => {
            const path = E().path(provId);
            if (path && temp[provId] > 0) {
                E().addPiece(path, 'soldato', -temp[provId]);
                E().redrawProvince(path);
            }
        });
        player.temporanei = {};
    }

    // ---------- azioni del giocatore ----------

    // Provincia valida per schierare: mia, esistente, e siamo nella fase 1.
    function deployablePath(player, provId) {
        const turnErr = requirePhase(player, 'schiera'); if (turnErr) return { err: turnErr };
        const path = E().path(provId);
        if (!path) return { err: fail('Provincia sconosciuta.') };
        if (E().owner(path) !== player.name) return { err: fail('Puoi schierare solo nelle tue province.') };
        return { path };
    }

    // Posa fisica delle reclute + colore d'esercito. Non tocca i serbatoi.
    function putSoldiers(player, path, n) {
        E().addPiece(path, 'soldato', n);
        E().setArmyColor(path, player.color);
        E().redrawProvince(path);
    }

    // Schiera N reclute LIBERE su una provincia propria (§5.1). Finché dura il
    // turno il giocatore può ripensarci: vedi `undeploy`.
    function deploy(player, provId, n) {
        const { path, err } = deployablePath(player, provId); if (err) return err;

        n = Math.floor(n);
        if (!(n > 0)) return fail('Indica quante truppe schierare.');
        const pool = player.recluteDaSchierare || 0;
        if (!pool) return fail('Non hai reclute libere da schierare.');
        if (n > pool) return fail('Hai solo ' + pool + ' reclute libere da schierare.');
        const room = roomFor(path);
        if (n > room) {
            return fail(R().provinceLabel(path) + ' non regge altri ' + n + ' soldati: c\'è posto per ' + room + '.');
        }

        putSoldiers(player, path, n);
        player.recluteDaSchierare = pool - n;
        placedAt(player, provId).libere += n;

        E().refresh();
        E().save();
        return done(n + (n === 1 ? ' recluta schierata' : ' reclute schierate') + ' in ' +
            R().provinceLabel(path) + '. Restano ' + player.recluteDaSchierare + ' libere.');
    }

    // Schiera i rinforzi OBBLIGATORI di una provincia (quelli di Capitale, Città e
    // Fortezza): possono andare solo lì, quindi non serve dire quanti — di default
    // si posano tutti.
    function deployBound(player, provId, n) {
        const { path, err } = deployablePath(player, provId); if (err) return err;

        const bound = boundPool(player);
        const avail = bound[provId] || 0;
        if (!avail) return fail('In ' + R().provinceLabel(path) + ' non ci sono rinforzi obbligatori da schierare.');

        n = (n === undefined || n === null) ? avail : Math.floor(n);
        if (!(n > 0)) return fail('Indica quanti rinforzi schierare.');
        n = Math.min(n, avail, roomFor(path));
        if (!n) return fail(R().provinceLabel(path) + ' è piena: non regge altri soldati.');

        putSoldiers(player, path, n);
        bound[provId] = avail - n;
        if (!bound[provId]) delete bound[provId];
        placedAt(player, provId).vincolate += n;

        E().refresh();
        E().save();
        return done(n + (n === 1 ? ' rinforzo obbligatorio schierato' : ' rinforzi obbligatori schierati') +
            ' in ' + R().provinceLabel(path) + '.');
    }

    // Posa in un colpo solo tutti i rinforzi obbligatori rimasti.
    function deployAllBound(player) {
        const turnErr = requirePhase(player, 'schiera'); if (turnErr) return turnErr;
        if (!boundTotal(player)) return fail('Non hai rinforzi obbligatori in attesa.');
        const n = forcePendingBound(player);
        E().refresh();
        E().save();
        return done(n + (n === 1 ? ' rinforzo obbligatorio schierato' : ' rinforzi obbligatori schierati') + '.');
    }

    // Svuota il serbatoio vincolato senza chiedere: usato dal bottone "schiera tutti"
    // e a fine turno. Le reclute di una provincia persa nel frattempo si perdono
    // con lei — non possono andare altrove per definizione.
    function forcePendingBound(player) {
        const bound = boundPool(player);
        let posate = 0;
        Object.keys(bound).forEach(provId => {
            const n = bound[provId] || 0;
            delete bound[provId];
            if (!n) return;
            const path = E().path(provId);
            if (!path || E().owner(path) !== player.name) return;
            const k = Math.min(n, roomFor(path));
            if (!k) return;
            putSoldiers(player, path, k);
            placedAt(player, provId).vincolate += k;
            posate += k;
        });
        return posate;
    }

    // Ritira reclute schierate IN QUESTO TURNO e le rimette nel serbatoio di
    // provenienza: le libere tornano disponibili per un'altra provincia, le
    // obbligatorie tornano in coda per questa (possono andare solo qui).
    // I soldati che c'erano prima del turno non si toccano: quelli si muovono
    // solo attaccando.
    function undeploy(player, provId, n) {
        const { path, err } = deployablePath(player, provId); if (err) return err;

        const rec = placedAt(player, provId);
        const max = rec.libere + rec.vincolate;
        if (!max) {
            return fail('In ' + R().provinceLabel(path) + ' non hai schierato reclute in questo turno: ' +
                'si ritirano solo quelle appena messe.');
        }

        // Anche il ritiro rispetta il presidio: l'ultima recluta di una provincia
        // che senza di lei resterebbe vuota non si tira più indietro.
        n = (n === undefined || n === null) ? max : Math.floor(n);
        if (!(n > 0)) return fail('Indica quante reclute ritirare.');
        n = Math.min(n, max, spare(path));
        if (!n) return garrisonFail(path);

        // Prima le libere: sono quelle che il giocatore può davvero riposizionare.
        const libere = Math.min(n, rec.libere);
        const vincolate = n - libere;

        putSoldiers(player, path, -n);
        rec.libere -= libere;
        rec.vincolate -= vincolate;
        player.recluteDaSchierare = (player.recluteDaSchierare || 0) + libere;
        if (vincolate) boundPool(player)[provId] = (boundPool(player)[provId] || 0) + vincolate;

        E().refresh();
        E().save();
        return done(n + (n === 1 ? ' recluta ritirata' : ' reclute ritirate') + ' da ' + R().provinceLabel(path) +
            (vincolate ? ' (' + vincolate + ' obbligatorie: possono tornare solo qui).' : '.'));
    }

    // Costruisce su UNA provincia propria (§6).
    function build(player, provId, type) {
        const turnErr = requirePhase(player, 'costruisci'); if (turnErr) return turnErr;
        const cost = GR().COSTS[type];
        if (!cost) return fail('Non si può costruire questo.');
        if (GR().BUILDABLE_ON_PROVINCE.indexOf(type) < 0) return fail('Questa voce non si costruisce su una provincia.');

        const path = E().path(provId);
        if (!path) return fail('Provincia sconosciuta.');
        if (E().owner(path) !== player.name) return fail('Puoi costruire solo nelle tue province.');

        // Regole di piazzamento già scritte per l'editor: costa/esclusività/1 Capitale.
        const place = E().canPlacePiece(path, type);
        if (!place.ok) return fail(place.msg);

        // La Capitale è unica per regno anche quando le province non hanno colore-esercito.
        if (type === 'capitale' && R().getCapitalPathFor(player)) {
            return fail('Hai già una Capitale: se ne costruisce una sola per regno.');
        }

        // Tetto per tipo (PIECES[type].max): senza questo controllo si pagherebbe
        // una costruzione che poi changePiece scarta silenziosamente.
        const max = (typeof PIECES !== 'undefined' && PIECES[type] && PIECES[type].max) || 1;
        if (E().countPiece(path, type) >= max) {
            const nome = (typeof PIECES !== 'undefined' && PIECES[type]) ? PIECES[type].nome : type;
            return fail(max === 1 ? nome + ' c\'è già qui.' : 'Massimo ' + max + ' ' + nome + ' per provincia.');
        }

        // I soldati del costo escono dalla provincia: si contano gli spendibili,
        // non i presenti, o una Capitale (5 soldati) svuoterebbe una provincia da 5.
        const afford = GR().canAfford(player, cost, spare(path));
        if (!afford.ok) return fail('Non puoi permettertelo: ' + GR().missingText(afford.missing) + '.');

        pay(player, cost, path);
        E().addPiece(path, type, +1);
        E().setArmyColor(path, player.color);

        // Bonus una tantum della Città: +1 Pietra (§6).
        let extra = '';
        if (type === 'citta') { player.scorte.pietra += 1; extra = ' (+1 Pietra)'; }
        // La Capitale dà una strada gratuita (§6): la si spende col pulsante Strada.
        if (type === 'capitale') { player.stradeGratis = (player.stradeGratis || 0) + 1; extra = ' (hai 1 strada gratuita)'; }

        // Città e Capitale non sono solo pedine: sono fatti di cronaca. Nome vero
        // della città e anno dentro il decennio del turno (js/chronicle.js) -> la
        // plancia apre la pergamena. Se chronicle.js non c'è, si costruisce e basta.
        let fondazione = null;
        if (root.Chronicle && (type === 'citta' || type === 'capitale')) {
            const label = R().provinceLabel(path);
            fondazione = (type === 'capitale')
                ? root.Chronicle.foundCapital(label, R().turn(), player.name)
                : root.Chronicle.foundCity(label, R().turn(), player.name);
            fondazione.colore = player.color;
            fondazione.id = path.id;
        }

        E().redrawProvince(path);
        E().refresh();
        E().save();
        const nome = (typeof PIECES !== 'undefined' && PIECES[type]) ? PIECES[type].nome : type;
        return done(nome + ' costruita in ' + R().provinceLabel(path) + extra + '.',
            fondazione ? { fondazione } : null);
    }

    // Strada fra due province proprie adiacenti via terra (§6).
    function buildRoad(player, aId, bId) {
        const turnErr = requirePhase(player, 'costruisci'); if (turnErr) return turnErr;
        const A = E().path(aId), B = E().path(bId);
        if (!A || !B) return fail('Provincia sconosciuta.');
        if (E().owner(A) !== player.name || E().owner(B) !== player.name) {
            return fail('La strada collega due province che possiedi.');
        }
        if (!E().areLandAdjacent(aId, bId)) return fail('Le due province non confinano via terra.');
        if (E().hasRoad(aId, bId)) return fail('Questa strada esiste già.');

        const gratis = (player.stradeGratis || 0) > 0;
        if (!gratis) {
            const cost = GR().COSTS.strada;
            const afford = GR().canAfford(player, cost, spare(A));
            if (!afford.ok) return fail('Non puoi permettertela: ' + GR().missingText(afford.missing) + '.');
            pay(player, cost, A);
            E().redrawProvince(A);
        } else {
            player.stradeGratis--;
        }

        E().addRoad(aId, bId, player.color);
        E().redrawRoads();
        E().refresh();
        E().save();
        return done('Strada fra ' + R().provinceLabel(A) + ' e ' + R().provinceLabel(B) +
            (gratis ? ' (gratuita).' : '.'));
    }

    // Unità temporanee: valgono questo turno soltanto (§5.3).
    function recruit(player, provId, type) {
        const turnErr = requirePhase(player, 'costruisci'); if (turnErr) return turnErr;
        if (GR().TEMPORARY.indexOf(type) < 0) return fail('Non è un\'unità temporanea.');
        const path = E().path(provId);
        if (!path) return fail('Provincia sconosciuta.');
        if (E().owner(path) !== player.name) return fail('Puoi reclutare solo nelle tue province.');

        const cost = GR().COSTS[type];
        const afford = GR().canAfford(player, cost, spare(path));
        if (!afford.ok) return fail('Non puoi permettertelo: ' + GR().missingText(afford.missing) + '.');

        pay(player, cost, path);
        const n = (type === 'guarnigione') ? 2 : 1;
        E().addPiece(path, 'soldato', n);
        E().setArmyColor(path, player.color);
        player.temporanei[provId] = (player.temporanei[provId] || 0) + n;

        E().redrawProvince(path);
        E().refresh();
        E().save();
        return done('+' + n + ' soldati temporanei in ' + R().provinceLabel(path) + ' (scadono a fine turno).');
    }

    // Bersagli d'attacco validi: province adiacenti via terra non tue (§9).
    function attackTargets(player, provId) {
        return E().landNeighbors(provId)
            .map(id => E().path(id))
            .filter(p => p && E().owner(p) !== player.name)
            .map(p => ({
                id: p.id,
                label: R().provinceLabel(p),
                owner: E().owner(p) || 'Neutrale',
                troops: E().countPiece(p, 'soldato'),
                fort: GR().defenceBonus(unitsOf([p]))
            }));
    }

    // Attacco (§9): risolve con battle.js e applica l'esito alla mappa.
    function attack(player, fromId, toId, engaged, rng) {
        const turnErr = requirePhase(player, 'attacca'); if (turnErr) return turnErr;
        const from = E().path(fromId), to = E().path(toId);
        if (!from || !to) return fail('Provincia sconosciuta.');
        if (E().owner(from) !== player.name) return fail('Puoi attaccare solo da una tua provincia.');
        if (E().owner(to) === player.name) return fail('Non puoi attaccare te stesso.');
        if (!E().areLandAdjacent(fromId, toId)) return fail('Le due province non confinano via terra.');

        // Parte al massimo tutto meno il presidio: la provincia di partenza non
        // resta mai vuota, nemmeno se l'attacco riesce.
        const partenti = spare(from);
        engaged = Math.floor(engaged);
        if (!(engaged > 0)) return fail('Indica quante truppe impegnare.');
        if (!partenti) return garrisonFail(from);
        if (engaged > partenti) {
            return fail('Da ' + R().provinceLabel(from) + ' possono partire al massimo ' + partenti +
                (partenti === 1 ? ' soldato' : ' soldati') + ': uno resta sempre a presidiare.');
        }

        const defTroops = E().countPiece(to, 'soldato');
        const fort = GR().defenceBonus(unitsOf([to]));
        const difensore = E().owner(to) || 'Neutrale';
        const fromLabel = R().provinceLabel(from), toLabel = R().provinceLabel(to);
        const res = RisikoBattle.resolveBattle(engaged, defTroops, fort, rng);
        if (!res) return fail('Nessuna battaglia possibile.');

        // Le truppe impegnate lasciano comunque la provincia di partenza.
        E().addPiece(from, 'soldato', -engaged);
        consumePlaced(player, fromId, engaged);

        let msg;
        if (res.attackerWins) {
            // Il difensore perde tutte le sue truppe, ma le COSTRUZIONI restano
            // (Capitale/Città/Fortezza/Mercato/Generale/navi): cambiano solo
            // proprietario e colore, non vengono rase.
            E().addPiece(to, 'soldato', -defTroops);
            const defender = R().players().find(p => p.name === E().owner(to));
            if (defender && defender.temporanei) delete defender.temporanei[toId];
            E().setOwner(to, player.name);
            E().addPiece(to, 'soldato', res.attackerSurvivors);
            E().setArmyColor(to, player.color);
            pruneRoadsTouching(toId);

            // I superstiti entrano tutti nella provincia presa, ma la ripartizione
            // vera la decide il giocatore in fase di conquista (resolveConquest):
            // finché `player.conquista` è aperta nessun'altra azione passa. Con un
            // solo superstite non c'è niente da scegliere e si chiude subito.
            player.conquista = res.attackerSurvivors > 1
                ? { fromId, toId, superstiti: res.attackerSurvivors }
                : null;

            msg = 'Conquistata ' + R().provinceLabel(to) + ': ' + res.attackerSurvivors +
                (res.attackerSurvivors === 1 ? ' superstite' : ' superstiti') +
                ' (' + res.losses + ' caduti). Le costruzioni restano, ora sono tue.';
        } else {
            E().addPiece(to, 'soldato', -(defTroops - res.defenderSurvivors));
            msg = R().provinceLabel(to) + ' ha retto: perdi tutte le ' + engaged +
                ' truppe impegnate, al difensore restano ' + res.defenderSurvivors + '.';
        }

        E().redrawProvince(from);
        E().redrawProvince(to);
        E().redrawRoads();
        E().refresh();
        E().save();

        // Il conto dei caduti in chiaro: la UI non deve ricavarlo da sé.
        // Vince l'attaccante → il difensore perde tutto; vince il difensore →
        // l'attaccante perde tutte le truppe impegnate (§9).
        const perditeAttaccante = res.attackerWins ? res.losses : engaged;
        const perditeDifensore = res.attackerWins ? defTroops : (defTroops - res.defenderSurvivors);

        // Eco storica: se in questa provincia, in questo decennio, si è davvero
        // combattuta una battaglia, la cronaca la ricorda (js/chronicle.js +
        // data/historic_battles.js). Prima la provincia contesa, poi quella di
        // partenza; nessuna corrispondenza -> niente pergamena, ed è la norma.
        const eco = root.Chronicle && root.Chronicle.battleEcho
            ? root.Chronicle.battleEcho([toLabel, fromLabel], R().turn())
            : null;
        if (eco) { eco.colore = player.color; eco.id = eco.provincia === toLabel ? toId : fromId; }

        return done(msg, {
            cronaca: eco,
            battle: res, engaged, defTroops, fort,
            fromId, toId, fromLabel, toLabel,
            attaccante: player.name, difensore,
            coloreAttaccante: player.color,
            coloreDifensore: (R().players().find(p => p.name === difensore) || {}).color || null,
            perditeAttaccante, perditeDifensore,
            superstiti: res.attackerWins ? res.attackerSurvivors : res.defenderSurvivors,
            conquistata: res.attackerWins,
            richiedeConquista: !!player.conquista
        });
    }

    // ---------- fase di conquista ----------
    // Vinta la battaglia i superstiti sono tutti nella provincia presa: qui il
    // giocatore decide quanti ne restano davvero e quanti tornano indietro a
    // presidiare la provincia di partenza. Almeno 1 deve occupare la conquista,
    // altrimenti la provincia resterebbe vuota di chi l'ha presa.

    function conquestPending(player) {
        const c = player.conquista;
        if (!c) return null;
        const from = E().path(c.fromId), to = E().path(c.toId);
        // Se nel frattempo qualcosa non torna (stato caricato a metà), si chiude.
        if (!from || !to || E().owner(to) !== player.name) { player.conquista = null; return null; }
        return {
            fromId: c.fromId, toId: c.toId,
            fromLabel: R().provinceLabel(from), toLabel: R().provinceLabel(to),
            superstiti: c.superstiti,
            presidioAttuale: E().countPiece(from, 'soldato')
        };
    }

    // occupanti = quanti dei superstiti restano nella provincia conquistata.
    function resolveConquest(player, occupanti) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        const c = conquestPending(player);
        if (!c) return fail('Non c\'è nessuna conquista da sistemare.');

        // Stessa regola di sempre, dall'altra parte del confine: la provincia presa
        // deve restare presidiata, quindi almeno MIN_GARRISON superstiti si fermano
        // lì. La provincia di partenza è già a posto — l'attacco non l'ha svuotata.
        occupanti = Math.floor(occupanti);
        if (!(occupanti >= GR().MIN_GARRISON)) {
            return fail('Almeno ' + GR().MIN_GARRISON + ' soldato deve restare a occupare ' + c.toLabel +
                ': una provincia non si lascia mai sguarnita.');
        }
        if (occupanti > c.superstiti) return fail('Hai solo ' + c.superstiti + ' superstiti.');

        const indietro = c.superstiti - occupanti;
        if (indietro) {
            const to = E().path(c.toId), from = E().path(c.fromId);
            const room = roomFor(from);
            const k = Math.min(indietro, room);
            if (k) {
                E().addPiece(to, 'soldato', -k);
                putSoldiers(player, from, k);
                E().redrawProvince(to);
            }
            if (k < indietro) {
                player.conquista = null;
                E().refresh(); E().save();
                return done(c.fromLabel + ' è piena: solo ' + k + ' sono potuti rientrare, ' +
                    (c.superstiti - k) + ' restano in ' + c.toLabel + '.');
            }
        }

        player.conquista = null;
        E().refresh();
        E().save();
        return done(occupanti + (occupanti === 1 ? ' soldato occupa ' : ' soldati occupano ') + c.toLabel +
            (indietro ? ', ' + indietro + ' rientrano in ' + c.fromLabel + '.' : '.'));
    }

    // ---------- fase di spostamento (uno solo per turno) ----------
    // Si sposta fra due province PROPRIE unite da una catena ininterrotta di
    // province proprie: è il classico "riposizionamento" del Risiko, non un
    // teletrasporto. Almeno 1 soldato resta sempre a presidiare la partenza.

    function ownReachable(player, fromId) {
        const owned = new Set(E().ownedPaths(player.name).map(p => p.id));
        if (!owned.has(fromId)) return new Set();
        const seen = new Set([fromId]);
        const queue = [fromId];
        while (queue.length) {
            const cur = queue.shift();
            E().landNeighbors(cur).forEach(id => {
                if (seen.has(id) || !owned.has(id)) return;
                seen.add(id);
                queue.push(id);
            });
        }
        seen.delete(fromId);
        return seen;
    }

    function moveTargets(player, fromId) {
        return Array.from(ownReachable(player, fromId))
            .map(id => E().path(id))
            .filter(Boolean)
            .map(p => ({ id: p.id, label: R().provinceLabel(p), troops: E().countPiece(p, 'soldato') }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    function finalMove(player, fromId, toId, n) {
        const turnErr = requirePhase(player, 'sposta'); if (turnErr) return turnErr;
        if (player.spostamentoFatto) return fail('Lo spostamento di fine turno si fa una volta sola: l\'hai già fatto.');

        const from = E().path(fromId), to = E().path(toId);
        if (!from || !to) return fail('Provincia sconosciuta.');
        if (E().owner(from) !== player.name || E().owner(to) !== player.name) {
            return fail('Lo spostamento avviene fra due province che possiedi.');
        }
        if (fromId === toId) return fail('Partenza e arrivo sono la stessa provincia.');
        if (!ownReachable(player, fromId).has(toId)) {
            return fail(R().provinceLabel(to) + ' non è raggiungibile da ' + R().provinceLabel(from) +
                ' passando solo per province tue.');
        }

        const mobili = spare(from);
        n = Math.floor(n);
        if (!(n > 0)) return fail('Indica quanti soldati spostare.');
        if (!mobili) return garrisonFail(from);
        if (n > mobili) {
            return fail('Da ' + R().provinceLabel(from) + ' puoi muoverne al massimo ' + mobili +
                ': uno resta sempre a presidiare.');
        }
        const room = roomFor(to);
        if (n > room) return fail(R().provinceLabel(to) + ' regge solo altri ' + room + ' soldati.');

        E().addPiece(from, 'soldato', -n);
        consumePlaced(player, fromId, n);
        putSoldiers(player, to, n);
        E().redrawProvince(from);
        player.spostamentoFatto = true;

        E().refresh();
        E().save();
        return done(n + (n === 1 ? ' soldato spostato da ' : ' soldati spostati da ') +
            R().provinceLabel(from) + ' a ' + R().provinceLabel(to) + '. Lo spostamento del turno è speso.');
    }

    // Una strada appartiene al colore di chi l'ha costruita (road.c). Una conquista
    // NON la distrugge da sola: sparisce solo quando ENTRAMBE le province che
    // collega sono passate a un colore diverso da quello della strada (l'utente
    // l'ha chiarito esplicitamente: le costruzioni sopravvivono alla conquista,
    // le strade "di frontiera" restano finché resta almeno un capo del colore giusto).
    function pruneRoadsTouching(provId) {
        E().roads().filter(r => r.a === provId || r.b === provId).forEach(r => {
            const pA = E().path(r.a), pB = E().path(r.b);
            if (!pA || !pB) return;
            const colorA = E().armyColor(pA), colorB = E().armyColor(pB);
            if (colorA !== r.c && colorB !== r.c) E().removeRoad(r.a, r.b);
        });
    }

    root.GameActions = {
        startGame, beginTurn, endTurn,
        deploy, deployBound, deployAllBound, undeploy,
        build, buildRoad, recruit, attack, attackTargets,
        conquestPending, resolveConquest,
        moveTargets, finalMove,
        PHASES, PHASE_LABEL, PHASE_HINT, phaseOf, phaseIndex, nextPhase,
        connectedOf, unitsOf, snapshotOf, isMyTurn,
        boundPool, boundTotal, placedPool
    };

})(typeof window !== 'undefined' ? window : globalThis);

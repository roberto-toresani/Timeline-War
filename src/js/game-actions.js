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
    const D = () => root.Diplomacy;   // DIPLOMAZIA (alleanze): la relazione pura
    const EV = () => root.Events;     // EVENTI STORICI (crociate, mongoli, peste…)
    const OB = () => root.Objectives; // OBIETTIVI (§10): il binario storico dei regni
    const GR = () => root.GameRules;

    const fail = (msg) => ({ ok: false, msg });
    const done = (msg, extra) => Object.assign({ ok: true, msg }, extra || {});

    // ---------- helper condivisi ----------

    function unitsOf(paths) {
        return KingdomStats.countUnits(paths.map(p => ({ pieces: E().pieces(p) })));
    }

    // Il terreno di una provincia e l'esponente che ne esce (§9, js/terrain.js).
    // Si combatte SEMPRE nella provincia attaccata: è il suo terreno a decidere
    // quanto pesa il numero. Senza il modulo si torna al vecchio quadrato.
    function terrainOf(path) {
        if (typeof Terrain === 'undefined' || !path) return null;
        return Terrain.of(R().provinceLabel(path));
    }
    function terrainExp(path) {
        const t = terrainOf(path);
        return t ? Terrain.exponent(t) : RisikoBattle.DEFAULT_EXP;
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

    // ---------- mercenari (§5.3) ----------
    // Un mercenario è un soldato come gli altri dappertutto: presidio, costi in
    // soldati, spostamenti. Si distingue in due soli momenti, e sono qui:
    //   - PARTENZE (attacco, spostamento, rientro dei superstiti, editto): parte
    //     la quota PROPORZIONALE, non se ne sceglie il colore (GameRules.mercShare).
    //   - PERDITE: cadono per primi i mercenari. È il contingente che si sfalda
    //     per primo, ed è anche il modo in cui la quota si ripulisce da sola —
    //     nessun esercito resta inaffidabile per sempre.
    // Quanti degli `n` che lasciano questa provincia sono di ventura. Si legge
    // PRIMA di togliere i soldati (dopo, la quota è già cambiata).
    function mercLeaving(path, n) {
        return GR().mercShare(E().merc(path), E().countPiece(path, 'soldato'), n);
    }

    function garrisonFail(path) {
        return fail('In ' + R().provinceLabel(path) + ' resta un solo soldato: una provincia ' +
            'non si lascia mai sguarnita.');
    }

    // ---------- presidio delle terre di nessuno ----------
    // Regola dell'utente: nessuna provincia neutrale è vuota. Parte con 2 soldati
    // e ogni 10 turni ne guadagna 1 (GameRules.neutralGarrison). Due modi:
    //  - `seed` (avvio partita): porta ogni neutrale alla quota del decennio.
    //  - a fine giro: NON ripiana le perdite. I neutrali sono uomini veri, come
    //    quelli di un giocatore (regola dell'utente): chi ne perde in battaglia —
    //    difendendo un attacco o marciando in una razzia — resta scoperto e NON si
    //    ripristina "a caso" il giro dopo. L'unico rinforzo è la crescita del
    //    decennio: quando scatta una nuova soglia (neutralGarrison sale di 1) si
    //    aggiunge quel +1 a CIÒ CHE C'È, mai un riempimento alla quota piena. Così
    //    una neutrale bastonata recupera solo col lento passare dei decenni.
    // Una provincia conquistata non è più neutrale, quindi esce da qui da sola.
    function garrisonNeutrals(opts) {
        const turn = R().turn();
        const target = GR().neutralGarrison(turn);
        const seed = !!(opts && opts.seed);
        // crescita del decennio: 0 di norma, 1 nel giro che scavalca una soglia.
        const grow = target - GR().neutralGarrison(turn - 1);
        let province = 0, soldati = 0;
        E().allPaths().forEach(path => {
            if (E().owner(path)) return;
            const cur = E().countPiece(path, 'soldato');
            // seed: sale fino a target. A regime: aggiunge solo `grow`, sempre
            // entro target (non si supera la quota) e capienza.
            const delta = Math.min(seed ? target - cur : grow, target - cur, roomFor(path));
            if (delta <= 0) return;
            E().addPiece(path, 'soldato', delta);
            E().redrawProvince(path);
            province++; soldati += delta;
        });
        return { target, province, soldati };
    }

    // ---------- razzie delle terre di nessuno (regola dell'utente) ----------
    // La fede conta anche per le neutrali: una provincia di nessuno della TUA
    // stessa religione ti lascia in pace, una di fede diversa può marciarti
    // contro. Gira a fine giro (prima del rifornimento neutrale), una volta per
    // provincia neutrale: sceglie il vicino-giocatore più debole di fede diversa,
    // risolve con battle.js e, se VINCE, si riprende la provincia — che torna
    // neutrale coi superstiti. Se perde, il difensore incassa solo i caduti.
    // Restituisce l'elenco delle razzie (con le province, per la nebbia §3).
    function neutralRaids(turn) {
        if (typeof Religions === 'undefined') return { razzie: [], perse: 0 };
        const razzie = [];
        E().allPaths().forEach(np => {
            if (E().owner(np)) return;                       // solo terre di nessuno
            const nf = E().religion(np);
            const truppeNeutrali = E().countPiece(np, 'soldato');
            const attaccanti = GR().spendableTroops(truppeNeutrali);
            if (!nf || attaccanti <= 0) return;

            // Bersagli: confinanti di un giocatore, di fede DIVERSA dalla neutrale, e
            // in schiacciante inferiorità. Regola dell'utente: la terra di nessuno
            // marcia solo a 3 contro 1 (GameRules.neutralCanRaid) — con 4 soldati
            // neutrali, che ne spendono 3, contro una provincia difesa da 1 solo.
            // Non è una battaglia alla pari: è una razzia, e va tentata solo quando
            // il confine è davvero sguarnito.
            const targets = E().landNeighbors(np.id)
                .map(id => E().path(id))
                .filter(tp => tp && E().owner(tp)
                    && !Religions.sameFaith(E().religion(tp), nf)
                    && GR().neutralCanRaid(truppeNeutrali, E().countPiece(tp, 'soldato')));
            if (!targets.length) return;
            targets.sort((a, b) => E().countPiece(a, 'soldato') - E().countPiece(b, 'soldato'));
            const tp = targets[0];

            const difOwner = E().owner(tp);
            const difTruppe = E().countPiece(tp, 'soldato');
            const fort = GR().defenceBonus(unitsOf([tp]));
            // Le terre di nessuno non assoldano nessuno: la ventura è solo di chi
            // difende, e pesa anche qui (§5.3).
            const mercDif = E().merc(tp);
            const res = RisikoBattle.resolveBattle(attaccanti, difTruppe, fort, null, terrainExp(tp),
                0, mercDif);
            if (!res) return;

            // Gli attaccanti lasciano comunque la provincia neutrale (resta il
            // presidio). Sono uomini VERI (regola dell'utente): partiti, non
            // tornano — in vittoria marciano sulla provincia presa, in sconfitta
            // cadono. Il rifornimento neutrale non li ripiana (garrisonNeutrals è
            // additivo, non un top-up): la razzia costa davvero, e la provincia
            // resta scoperta finché non scatta la crescita del decennio.
            E().addPiece(np, 'soldato', -attaccanti);

            let esito;
            let conversione = null;
            if (res.attackerWins) {
                // La provincia RITORNA NEUTRALE coi superstiti: le costruzioni
                // restano (come in una conquista normale), cambia solo il colore.
                E().addPiece(tp, 'soldato', -difTruppe);
                const difensore = R().players().find(p => p.name === difOwner);
                if (difensore && difensore.temporanei) delete difensore.temporanei[tp.id];
                E().setOwner(tp, null);
                // Una CAPITALE non sopravvive in terra di nessuno: lì non governa
                // più nessuno. Si declassa a Città, esattamente come una Capitale
                // nemica conquistata (vedi applyBattleOutcome) — così
                // `getCapitalPathFor` non trova mai un seggio appeso a una
                // provincia senza padrone. Senza questa riga il regno razziato
                // restava senza Capitale MA con la pedina ancora sulla mappa:
                // niente Popolarità, niente raccolto, niente reclute, e nessun
                // modo di capire perché. È il blocco definitivo.
                const seggio = E().countPiece(tp, 'capitale');
                if (seggio > 0) {
                    E().addPiece(tp, 'capitale', -seggio);
                    E().addPiece(tp, 'citta', 1);
                }
                E().addPiece(tp, 'soldato', res.attackerSurvivors);
                E().setMerc(tp, 0);           // i contratti sono morti col regno che li pagava
                E().setArmyColor(tp, null);
                // LA FEDE SEGUE LA SPADA anche per le terre di nessuno (regola
                // dell'utente): la provincia presa prende la confessione della
                // neutrale che l'ha razziata. Un presidio musulmano che sfonda un
                // confine cattolico lascia dietro di sé una provincia musulmana.
                // Nessun lock: torna neutrale e resta soggetta agli scismi come le
                // altre terre di nessuno.
                // Il vincolo di conquista (data-fede-conq) si SCIOGLIE qui: era
                // l'aggancio alla corona di chi la teneva, e quella corona non la
                // tiene più. Senza questa riga la provincia restava agganciata a
                // un regno che non la possiede — nessuno scisma la toccava mai
                // più (applySchisms salta le province vincolate) e nemmeno
                // syncConquestFaiths poteva rimediare, perché una terra di
                // nessuno non ha proprietario a cui riallinearla: la fede ci
                // restava congelata per il resto della partita.
                E().setReligionLock(tp, false);
                if (nf && E().religion(tp) !== nf) {
                    conversione = { da: E().religion(tp) || null, a: nf, label: Religions.label(nf) };
                    E().setReligion(tp, nf);
                }
                pruneRoadsTouching(tp.id);
                esito = 'riconquistata';
            } else {
                // Respinta: il difensore perde solo i caduti, tiene la provincia.
                const caduti = difTruppe - res.defenderSurvivors;
                E().addPiece(tp, 'soldato', -caduti);
                E().setMerc(tp, mercDif - caduti);   // cadono per primi i mercenari
                esito = 'respinta';
            }
            E().redrawProvince(np);
            E().redrawProvince(tp);

            razzie.push({
                fromId: np.id, toId: tp.id,
                fromLabel: R().provinceLabel(np), toLabel: R().provinceLabel(tp),
                esito, difensore: difOwner,
                fedeNeutrale: nf,
                attaccanti, difensori: difTruppe,
                perditeDifensore: res.attackerWins ? difTruppe : (difTruppe - res.defenderSurvivors),
                superstiti: res.attackerWins ? res.attackerSurvivors : res.defenderSurvivors,
                battle: res,
                conversione,
                coloreDifensore: (R().players().find(p => p.name === difOwner) || {}).color || null
            });
        });
        if (razzie.length) E().redrawRoads();
        return { razzie, perse: razzie.filter(r => r.esito === 'riconquistata').length };
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
            // Il BINARIO STORICO riparte dal primo capitolo: una partita nuova
            // non eredita il punto a cui era arrivata la storia di quella prima.
            pl.capitolo = 1;
            pl.intensita = 'avanzare';
            pl.obiettiviCiclo = null;
            pl.obiettiviStorico = [];
            pl.cicliStorico = [];
            pl.obiettiviAvvisi = [];
            pl.puntiPrestigio = 0;
            pl.temporanei = {};
            pl.offerte = [];
            pl.spie = [];
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

        // Le terre di nessuno partono presidiate (2 soldati, +1 ogni 10 turni).
        garrisonNeutrals({ seed: true });

        // Il calendario degli eventi storici (js/events.js) riparte pulito: una
        // partita nuova non eredita orde o pestilenze da quella prima.
        if (R().setEventi) R().setEventi({ attivi: [], fatti: [] });

        // ...e con lui la mappa delle FEDI: gli scismi (Religions.SCHISMS) sono
        // sul calendario, quindi una partita che riparte dal turno 1 deve
        // ripartire dalle confessioni del Mille. Senza, la Riforma della partita
        // precedente restava scritta sulle province e quella nuova nasceva già
        // spaccata, con gli scismi a venire che non trovavano più nulla da
        // spezzare (e i vincoli di conquista di regni che non esistono più).
        if (R().resetReligions) R().resetReligions();

        // Giocano solo i regni che hanno almeno una provincia. L'ordine di turno
        // si sorteggia (Fisher-Yates) a ogni avvio: chi parte non è sempre lo
        // stesso regno (regola dell'utente).
        const ordine = players.filter(pl => E().ownedPaths(pl.name).length).map(pl => pl.id);
        for (let i = ordine.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
        }
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
        const collegate = connectedOf(player);
        const pop = capital ? R().computePopularity(player, capital, collegate).totale : null;
        const prod = GR().turnProduction(snapshotOf(player), collegate, units,
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

        // Le spie rientrate (§9.3) si tolgono dalla lista. La scadenza vale
        // comunque, anche senza questa riga — `Spies.active` la calcola a ogni
        // lettura: qui si fa solo ordine, così lo stato salvato non si trascina
        // dietro perlustrazioni di tre decenni fa.
        if (root.Spies) player.spie = root.Spies.active(player.spie, R().turn());

        // Manutenzione delle migliorie civiche (§6.1): ogni 5 turni globali un
        // contributo di 1 risorsa per edificio, auto-pagato DOPO la raccolta di
        // questo turno (così vale tutto ciò che si è accumulato nei 5 turni). Chi
        // resta scoperto va dormiente, poi crolla; l'esito va nella pergamena.
        maintainWelfare(player);

        // Le spedizioni in mare (§9.2, rotte lunghe) avanzano di una portata verso
        // la loro rotta: si sono mosse nell'intervallo, il giocatore le ritrova più
        // avanti. Va PRIMA di restituire, così la nebbia del turno le vede già lì.
        advanceExpeditions(player);

        // Il turno riparte sempre dalla prima fase, con lo spostamento di nuovo
        // disponibile e nessuna conquista in sospeso.
        player.fase = PHASES[0];
        player.spostamentoFatto = false;
        player.conquista = null;
        player.capitalePresa = null;

        return done('Turno di ' + player.name, { produzione: prod });
    }

    // FASE 3 (§2): scadono i temporanei, passa il turno. Chiuso il giro,
    // avanza il turno globale (l'anno) e ruota chi apre il round (§2.1).
    // ---------- OBIETTIVI: la chiusura di un ciclo (§10, js/objectives.js) ----------
    // Il calendario è entrato in un ciclo nuovo. Qui, e SOLO qui, si fanno i
    // conti del ciclo che si chiude: si congela la spunta (una fotografia VERA,
    // non una rivalutazione a posteriori come faceva il render della plancia),
    // si scrive il profilo del regno, si muove il puntatore sul binario e si
    // genera l'assegnazione del ciclo nuovo. Sta nel blocco `giroFinito` di
    // endTurn DOPO eventi, scismi, razzie e rifornimenti, così la fotografia è
    // lo stato con cui il ciclo nuovo comincia davvero.
    const PROFILE_MAX = 12;

    // Le assegnazioni IN CORSO, lette prima che il calendario si muova. Da
    // `advanceGlobalTurn` in poi il ciclo è quello nuovo, e qualunque render
    // che passi di lì (un evento, uno scisma, una razzia: tutti ridisegnano)
    // rigenererebbe l'assegnazione per il ciclo nuovo, cancellando le soglie
    // con cui il ciclo che si chiude era cominciato. Si fotografa prima.
    function grabAssignments() {
        const m = {};
        R().players().forEach(p => { m[p.id] = p.obiettiviCiclo || null; });
        return m;
    }

    function closeCycle(nuovoCiclo, assegnazioni) {
        if (!OB() || !R().objectiveContext) return null;
        const chiuso = nuovoCiclo - 1;
        const esiti = [];
        R().players().forEach(player => {
            const ctx = R().objectiveContext(player);
            const grabbed = assegnazioni ? assegnazioni[player.id] : null;
            const a = grabbed || player.obiettiviCiclo;
            // 1. i conti del ciclo che si chiude. Si valuta l'ASSEGNAZIONE, cioè
            //    le soglie con cui il ciclo era cominciato; senza (regno appena
            //    nato, salvataggio vecchio) si ricade sul binario.
            const suo = a && Array.isArray(a.items) && a.items.length && a.ciclo === chiuso;
            const snap = suo ? OB().evaluate(a, ctx) : OB().evaluate(player.name, ctx, chiuso);
            let leva = 0;
            if (snap && !player.obiettiviStorico.some(h => h.ciclo === snap.ciclo)) {
                const rec = R().archiveObjectives(player, snap);
                // 1-bis. LA LEVA (regola dell'utente): un obiettivo compiuto vale
                //     altrettanti SOLDATI, versati nel serbatoio delle reclute
                //     LIBERE. Le libere si sommano a quelle avanzate e non
                //     scadono (beginTurn), quindi il regno se le ritrova pronte
                //     nella fase «schiera» del suo PRIMO turno del ciclo nuovo —
                //     questo giro si è appena chiuso, il prossimo che apre è già
                //     quello. Vale per tutti: i bot le spendono da sé, perché
                //     deployPlan legge lo stesso serbatoio.
                leva = OB().leva ? OB().leva(snap) : 0;
                if (leva > 0) {
                    player.recluteDaSchierare = (player.recluteDaSchierare || 0) + leva;
                    if (rec) rec.leva = leva;
                    if (!Array.isArray(player.obiettiviAvvisi)) player.obiettiviAvvisi = [];
                    player.obiettiviAvvisi.push({
                        ciclo: chiuso, leva: leva,
                        punti: snap.punti, puntiMax: snap.puntiMax,
                        fatti: snap.items.filter(i => i.completato)
                            .map(i => ({ titolo: i.titolo, punti: i.punti })),
                        turno: R().turn(), letto: false
                    });
                    while (player.obiettiviAvvisi.length > 8) player.obiettiviAvvisi.shift();
                }
            }
            // 2. il profilo su cui si misura la performance del regno.
            const prof = R().objectiveProfile(player);
            prof.ciclo = chiuso;
            prof.capitolo = player.capitolo || chiuso;
            prof.obiettiviFatti = snap ? snap.items.filter(i => i.completato).length : 0;
            player.cicliStorico.push(prof);
            while (player.cicliStorico.length > PROFILE_MAX) player.cicliStorico.shift();
            // 3. IL PUNTATORE. Chi ha compiuto il capitolo passa al pezzo di
            //    storia successivo; chi non ce l'ha fatta lo rifà a voce più
            //    bassa; chi è crollato torna indietro. Il ritmo del ciclo appena
            //    chiuso allunga o accorcia il passo delle soglie.
            const prec = player.cicliStorico.length > 1
                ? player.cicliStorico[player.cicliStorico.length - 2] : null;
            const ritmo = OB().ritmoDa(prof, prec);
            const mossa = OB().passo({
                primarioFatto: !!(snap && snap.items[0] && snap.items[0].completato),
                fatti: prof.obiettiviFatti,
                intensita: player.intensita,
                province: prof.province,
                provincePrec: prec ? prec.province : null,
                capitalePersa: !!(prec && prec.capitale && !prof.capitale),
                capitolo: player.capitolo || chiuso,
                ciclo: nuovoCiclo,
                capitoli: OB().chapterCount(player.name)
            });
            player.capitolo = mossa.capitolo;
            player.intensita = mossa.intensita;
            // La storia ACCELERA: se il capitolo che tocca ora è già stato
            // superato dai fatti — la sua meta è oltre l'ancora più ambiziosa —
            // si passa al successivo invece di riproporlo con un numero più
            // grande. È il caso del regno che ha corso: gli si dà il pezzo dopo,
            // non lo stesso pezzo gonfiato.
            let salti = 0;
            while (salti++ < 4
                && player.capitolo < OB().chapterCount(player.name)
                && player.capitolo < nuovoCiclo + OB().FRENO
                && OB().superato(player.name, player.capitolo, ctx)) {
                player.capitolo++;
            }
            // 4. l'assegnazione del ciclo nuovo, calibrata sullo stato di adesso.
            player.obiettiviCiclo = OB().generate(player.name, ctx, {
                ciclo: nuovoCiclo, capitolo: player.capitolo,
                intensita: player.intensita, ritmo: ritmo,
                turno: R().turn(), calibra: true
            });
            if (snap) esiti.push({
                regno: player.name, punti: snap.punti, puntiMax: snap.puntiMax, leva: leva,
                motivo: mossa.motivo, capitolo: player.capitolo, intensita: player.intensita
            });
        });
        return { ciclo: chiuso, esiti: esiti };
    }

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
        if (player) { player.conquista = null; player.capitalePresa = null; expireTemporaries(player); }

        const idx = ordine.indexOf(R().turnoDi());
        const primo = R().primoDelGiro();
        const nextIdx = (idx + 1) % ordine.length;

        // Giro completo quando si torna a chi lo ha aperto.
        const giroFinito = nextIdx === primo;
        let neutrali = null;
        let scadute = 0;
        let razzie = null;
        let scismi = null;
        let cicli = null;
        if (giroFinito) {
            const turnoPrima = R().turn();
            const assPrima = OB() ? grabAssignments() : null;
            R().advanceGlobalTurn();
            // Nuovo decennio: gli EVENTI STORICI (js/events.js) scattano e
            // ticchettano PRIMA di scismi, razzie e rifornimenti — così un'orda
            // appena arrivata è già sulla mappa quando le neutrali si ricalcolano.
            applyEvents(R().turn());
            tickEvents(R().turn());
            // Nuovo decennio: uno SCISMA può spezzare una fede (Religions.SCHISMS).
            // È un fatto di cronaca globale: app.js srotola la pergamena da sé.
            scismi = R().applySchisms ? R().applySchisms(R().turn()) : null;
            // Nuovo decennio: le carovane rimaste senza risposta tornano a casa
            // con la merce (§7) — il pegno non resta appeso all'infinito.
            scadute = expireTrades();
            // ...e le alleanze a tempo giunte a scadenza si sciolgono da sé,
            // gratis, avvisando entrambi i firmatari (§Diplomazia).
            expirePacts();
            // ...e i gridi d'aiuto rimasti senza risposta si spengono (§Diplomazia).
            expireHelpRequests();
            // Le terre di nessuno di fede diversa razziano PRIMA del rifornimento,
            // così colpiscono a piena forza (§ religione).
            razzie = neutralRaids(R().turn());
            // Nuovo decennio: le terre di nessuno crescono SOLO se scatta la soglia
            // dei 10 turni, e la crescita si aggiunge a ciò che resta — non ripiana
            // le perdite in battaglia (garrisonNeutrals è additivo, regola
            // dell'utente): una neutrale bastonata non torna a quota da sola.
            neutrali = garrisonNeutrals();
            // Il calendario può essere entrato in un CICLO nuovo (§10): si
            // chiudono i conti di quello appena finito e si assegnano gli
            // obiettivi del prossimo. Ultimo della catena apposta: la
            // fotografia deve vedere orde, scismi e razzie già applicati.
            if (OB()) {
                const cicloOra = OB().cycleOfTurn(R().turn());
                if (cicloOra > OB().cycleOfTurn(turnoPrima)) cicli = closeCycle(cicloOra, assPrima);
            }
            // Un evento può aver aggiunto un regno all'ordine (spawnKingdom): rileggo
            // la lista VIVA, così il nuovo regno entra nel giro invece di essere
            // clobberato dalla copia locale catturata a inizio funzione. L'append è
            // in coda, quindi `primo` (indice sul prefisso) resta valido.
            const ordAfter = R().ordine();
            const nuovoPrimo = (primo + 1) % ordAfter.length;
            R().setTurnState(ordAfter[nuovoPrimo], ordAfter, nuovoPrimo);
        } else {
            R().setTurnState(ordine[nextIdx], ordine, primo);
        }

        const res = beginTurn();
        E().refresh();
        E().save();
        const nota = forzate ? ' (' + forzate + ' rinforzi obbligatori schierati d\'ufficio)' : '';
        const notaN = (neutrali && neutrali.province)
            ? ' Le terre di nessuno salgono a ' + neutrali.target + ' soldati.' : '';
        const notaC = scadute
            ? ' ' + scadute + (scadute === 1 ? ' proposta di commercio è scaduta' : ' proposte di commercio sono scadute') + '.'
            : '';
        const notaR = (razzie && razzie.perse)
            ? ' Le terre di nessuno ne riprendono ' + razzie.perse + '.' : '';
        return done((giroFinito ? 'Giro completato: nuovo turno.' : 'Turno passato.') + nota + notaN + notaC + notaR,
            { produzione: res.produzione, neutrali, scadute,
              razzie: (razzie && razzie.razzie) || [], scismi: scismi || [], cicli });
    }

    // ---------- EVENTI STORICI (js/events.js) ----------
    // L'unico posto che APPLICA il calendario degli eventi, come applySchisms per
    // gli scismi e neutralRaids per le terre di nessuno. Un evento ha tre agganci
    // — onStart/onRound/onEnd — che chiamano i mutatori di `ctx` (qui sotto): così
    // l'orchestrazione si legge nel descrittore, ma le scritture restano in questo
    // modulo. Lo stato che PERSISTE (fronte dell'orda, focolai, regni spawnati)
    // vive in R().eventi() = { attivi:[{id,dal,fino,stato}], fatti:[id…] }; `fatti`
    // è la guardia anti-doppio-scatto — uno spawn NON è idempotente.
    function eventsBook() {
        return (EV() && Array.isArray(EV().EVENTS)) ? EV().EVENTS : [];
    }
    function eventStore() {
        const s = R().eventi ? R().eventi() : null;
        if (s && Array.isArray(s.attivi) && Array.isArray(s.fatti)) return s;
        const fresh = { attivi: [], fatti: [] };
        if (R().setEventi) R().setEventi(fresh);
        return fresh;
    }

    // La superficie stretta e DICHIARATA che gli agganci usano per toccare lo
    // stato. Cresce man mano che si specificano i singoli eventi: i mutatori
    // pesanti sono per ora dei segnaposto che falliscono a voce alta, così un
    // evento che li usi prima del tempo si vede subito (il calendario è vuoto,
    // quindi oggi nessuno di questi viene chiamato).
    function eventTodo(nome) {
        throw new Error('ctx.' + nome + ' non ancora implementato (impianto eventi).');
    }
    function makeEventCtx(rec, turn) {
        return {
            turn,
            state: rec.stato,          // lo stato persistente DI QUESTO evento
            map: E(),                  // lettura mappa: non muta niente
            R: R(),
            // Pergamena a inizio turno ai regni toccati (rispetta la nebbia in
            // player-board), come gli editti: vive in player.eventiAvvisi.
            notify: (regni, avviso) => eventNotify(regni, avviso),
            // CROCIATE: `muster` raduna un'oste drenando le vere truppe di un regno
            // (§5); `assault` la sbarca all'assalto di una provincia (§9.2, terreno
            // del difensore); `pact` lega due regni (bondPact, su entrambi).
            muster: (regno, opts) => eventMuster(regno, opts),
            assault: (regno, metaId, host) => eventAssault(regno, metaId, host),
            pact: (a, b, tipo) => eventPact(a, b, tipo),
            // MONGOLI: crea un nuovo regno a partita in corso, gli posa le province
            // di partenza con un esercito e lo infila nell'ordine dei turni.
            spawnKingdom: (spec) => eventSpawnKingdom(spec),
            // Le ONDATE dell'Orda: un'armata di rinforzo cala sulla punta della marcia.
            reinforce: (regno, opts) => eventReinforce(regno, opts),
            // --- mutatori ancora da implementare (peste, Cent'Anni) ---
            despawnKingdom: () => eventTodo('despawnKingdom'),
            dropArmy: () => eventTodo('dropArmy'),
            decimate: () => eventTodo('decimate'),
            convert: () => eventTodo('convert'),
            giveProvince: () => eventTodo('giveProvince'),
            setWarLock: () => eventTodo('setWarLock')
        };
    }

    // Mette un avviso in coda ai regni indicati. `regni` è un id/nome o un array;
    // `avviso` è {tipo, titolo, testo, nota} (il tipo colora la pergamena).
    function eventNotify(regni, avviso) {
        const ids = (Array.isArray(regni) ? regni : [regni]).filter(Boolean);
        const players = R().players();
        ids.forEach(key => {
            const p = players.find(pl => pl.id === key || pl.name === key);
            if (!p) return;
            if (!Array.isArray(p.eventiAvvisi)) p.eventiAvvisi = [];
            p.eventiAvvisi.push(Object.assign({ letto: false, turno: R().turn() }, avviso || {}));
        });
    }

    // CROCIATE — raduna un'oste drenando le VERE truppe del regno (§5): non è
    // evocata. Da dove si preleva, in ordine: `da` (una provincia fissa, es.
    // Eastern Thrace per Bisanzio — è già dove l'obiettivo bi2 chiede di
    // radunare); altrimenti `regione` (le province candidate dell'obiettivo di
    // "preparazione", es. MED_FR per fr1: "raduna 10 uomini su una costa
    // mediterranea") — fra quelle si sceglie quella dove il giocatore ha DAVVERO
    // ammassato più uomini, cioè dove ha eseguito l'obiettivo; se in nessuna
    // c'è un solo soldato (l'obiettivo non è stato preparato) si ripiega sulla
    // provincia più piena di tutto il regno. La Capitale non ha corsie
    // preferenziali: è solo una provincia come le altre nel conteggio. Presidio
    // minimo ovunque, ventura in quota (§5.3). Ritorna { soldati, merc, fromId,
    // fromLabel } o null se il regno non esiste / non ha uomini da dare.
    function eventMuster(regnoName, opts) {
        const o = opts || {};
        const forza = Math.max(0, Math.floor(o.forza || 0));
        const regno = R().players().find(p => p.name === regnoName);
        if (!regno || forza <= 0) return null;
        const owned = E().ownedPaths(regnoName);
        if (!owned.length) return null;
        let da = o.da || null;
        if (!da && o.regione) {
            const regione = (o.regione instanceof Set) ? o.regione : new Set(o.regione);
            let best = null, bestN = 0;
            owned.forEach(p => {
                if (!regione.has(p.id)) return;
                const n = GR().spendableTroops(E().countPiece(p, 'soldato'));
                if (n > bestN) { bestN = n; best = p; }
            });
            if (best) da = best.id;
        }
        const rank = p => (da && p.id === da) ? 1 : 0;
        const ordered = owned.slice().sort((a, b) => {
            const dr = rank(b) - rank(a);
            if (dr) return dr;
            return GR().spendableTroops(E().countPiece(b, 'soldato')) -
                   GR().spendableTroops(E().countPiece(a, 'soldato'));
        });
        let restano = forza, soldati = 0, merc = 0;
        ordered.forEach(path => {
            if (restano <= 0) return;
            const disp = GR().spendableTroops(E().countPiece(path, 'soldato'));
            const take = Math.min(disp, restano);
            if (take <= 0) return;
            const mercPrima = E().merc(path);
            const mercVia = mercLeaving(path, take);
            E().addPiece(path, 'soldato', -take);
            E().setMerc(path, mercPrima - mercVia);
            E().redrawProvince(path);
            soldati += take; merc += mercVia; restano -= take;
        });
        if (soldati <= 0) return null;
        const fromPath = (da && E().path(da)) || ordered[0];
        return { soldati, merc,
            fromId: fromPath ? fromPath.id : null,
            fromLabel: fromPath ? R().provinceLabel(fromPath) : null };
    }

    // CROCIATE — l'oste SBARCA e assalta `metaId`: stessa battaglia dello sbarco
    // d'editto (terreno del difensore e bonus costruzioni, §9), senza vincoli di
    // adiacenza/carico perché il trasporto è del Papa. Se la meta è GIÀ del regno
    // la RINFORZA invece di sprecarsi. Ritorna un esito per la pergamena, o null
    // se la meta non esiste. La conquista (proprietario, fede, ventura, superstiti)
    // passa da applyBattleOutcome, l'unico punto della regola.
    function eventAssault(regnoName, metaId, host) {
        const regno = R().players().find(p => p.name === regnoName);
        const to = E().path(metaId);
        if (!regno || !to || !host || host.soldati <= 0) return null;
        const mossi = host.soldati, mercMossi = host.merc || 0;
        if (E().owner(to) === regnoName) {
            E().addPiece(to, 'soldato', mossi);
            if (mercMossi) E().addMerc(to, mercMossi);
            E().redrawProvince(to);
            return { regno: regnoName, metaId, metaLabel: R().provinceLabel(to),
                rinforzo: true, vinta: true, superstiti: mossi };
        }
        const defTroops = E().countPiece(to, 'soldato');
        const fort = GR().defenceBonus(unitsOf([to]));
        const difensore = E().owner(to) || 'Neutrale';
        const mercDif = E().merc(to);
        const res = RisikoBattle.resolveBattle(mossi, defTroops, fort, null, terrainExp(to), mercMossi, mercDif);
        if (!res) return null;
        const mercArrivati = res.attackerWins ? Math.max(0, mercMossi - res.losses) : 0;
        const conversione = applyBattleOutcome(regno, to, res, defTroops, mercArrivati);
        E().redrawProvince(to);
        E().redrawRoads();
        return {
            regno: regnoName, metaId, metaLabel: R().provinceLabel(to),
            fromId: host.fromId, fromLabel: host.fromLabel,
            difensore, terreno: terrainOf(to),
            engaged: mossi, defTroops, vinta: res.attackerWins,
            superstiti: res.attackerWins ? res.attackerSurvivors : 0,
            perditeAttaccante: res.attackerWins ? res.losses : mossi,
            perditeDifensore: res.attackerWins ? defTroops : (defTroops - res.defenderSurvivors),
            conversione
        };
    }

    // EVENTI — L'ARMATA DI RINFORZO (le ondate dell'Orda, regola dell'utente).
    // `forza` uomini raggiungono un regno d'evento e si versano sulla PUNTA della
    // sua marcia: la sua provincia più vicina, in confini di terra, alla prima
    // tappa non ancora conquistata (`verso` è l'asse della marcia, da
    // Doctrines.march). Dieci uomini posati in retrovia non sfondano niente — è la
    // punta che deve pesare.
    // Il FRONTE si ordina con UNA sola onda a ritroso DALLE mete ancora libere: le
    // province del regno si accodano man mano che l'onda le tocca (le più vicine
    // per prime, a pari distanza prima la più piena: si ammassa, non si sparge), e
    // in coda le province che l'onda non raggiunge affatto. Senza asse — o con
    // l'asse tutto conquistato — resta l'ordine per truppe, cioè il pugno del regno.
    // L'armata si VERSA lungo quel fronte: una provincia non tiene più di
    // `pieceMax('soldato')` uomini (30), quindi ciò che non entra nella punta scende
    // sulla provincia dietro invece di svanire. Il travaso si misura sul conteggio
    // vero prima/dopo, così il tetto resta uno solo — quello del deposito — e non se
    // ne scrive una seconda copia qui.
    // Ritorna { regno, forza, posati, prov, provLabel, dove:[{prov,n}] } o null.
    function eventReinforce(regnoName, opts) {
        const o = opts || {};
        const forza = Math.max(0, Math.floor(o.forza || 0));
        const regno = R().players().find(p => p.name === regnoName);
        if (!regno || forza <= 0) return null;
        const owned = E().ownedPaths(regnoName);
        if (!owned.length) return null;
        const mie = new Map(owned.map(p => [p.id, p]));
        const truppe = p => E().countPiece(p, 'soldato');
        const perPiene = lista => lista.slice().sort((a, b) => truppe(b) - truppe(a));

        const mete = (o.verso || []).filter(id => !mie.has(id) && E().path(id));
        const fronte = [];
        const accodate = new Set();
        if (mete.length) {
            const visti = new Set(mete);
            let onda = mete.slice();
            while (onda.length) {
                const prossima = [];
                const tocche = [];
                onda.forEach(id => (E().landNeighbors(id) || []).forEach(n => {
                    if (visti.has(n)) return;
                    visti.add(n);
                    if (mie.has(n)) tocche.push(mie.get(n));
                    else prossima.push(n);
                }));
                perPiene(tocche).forEach(p => { fronte.push(p); accodate.add(p.id); });
                onda = prossima;
            }
        }
        perPiene(owned).forEach(p => { if (!accodate.has(p.id)) fronte.push(p); });

        let restano = forza;
        const dove = [];
        fronte.forEach(path => {
            if (restano <= 0) return;
            const prima = truppe(path);
            E().addPiece(path, 'soldato', restano);
            const messi = truppe(path) - prima;      // il deposito clampa da sé sul tetto
            if (messi <= 0) return;
            E().redrawProvince(path);
            dove.push({ prov: path.id, n: messi });
            restano -= messi;
        });
        if (!dove.length) return null;
        const punta = E().path(dove[0].prov);
        return { regno: regnoName, forza, posati: forza - restano,
            prov: dove[0].prov, provLabel: punta ? R().provinceLabel(punta) : null, dove };
    }

    // CROCIATE — lega due regni con un patto (bondPact scrive su ENTRAMBI). Salta
    // se un regno non esiste più o non ha province.
    function eventPact(aName, bName, tipo) {
        const a = R().players().find(p => p.name === aName);
        const b = R().players().find(p => p.name === bName);
        if (!a || !b) return false;
        if (!E().ownedPaths(a.name).length || !E().ownedPaths(b.name).length) return false;
        bondPact(a, b, tipo || 'vista');
        return true;
    }

    // MONGOLI, SELGIUCHIDI, PORTOGALLO, BULGARIA, REGNI NORDICI — crea un NUOVO
    // regno a partita in corso e lo infila nell'ordine dei turni, attivo dal giro
    // dopo. Gli posa le province di partenza con un esercito del suo colore; una
    // provincia neutrale viene semplicemente insediata (le costruzioni, se ci
    // fossero, restano e cambiano colore, come in conquista). `bot` è la strategia
    // che lo governa (null = lo gioca l'admin, come l'Orda).
    // spec: { name, color, bot, province:[{id, soldati, merc, capitale}],
    //         soloLibere, ripiego, minProvince, monete, scorte, annuncio }.
    //
    // DOVE nasce davvero (regola dell'utente): un regno nuovo non piove addosso a
    // chi c'è. `soloLibere` scarta le province già di un regno; `ripiego` cerca
    // per ognuna scartata una terra di nessuno CONFINANTE con le province di
    // partenza; `minProvince` è la soglia sotto la quale il regno NON nasce
    // affatto — se il posto è occupato, quella storia non accade. Nessuna
    // Capitale in regalo: come ogni regno se la costruisce da sé (§Capitale).
    function eventSpawnKingdom(spec) {
        const s = spec || {};
        if (!R().addKingdom) return null;

        const libera = id => { const p = E().path(id); return !!p && !E().owner(p); };
        const spots = [];
        const presi = new Set();
        const scartate = [];
        (s.province || []).forEach(spot => {
            if (!spot || !E().path(spot.id)) return;
            if (!s.soloLibere || libera(spot.id)) { spots.push(spot); presi.add(spot.id); }
            else scartate.push(spot);
        });
        if (s.ripiego) {
            scartate.forEach(spot => {
                let alt = null;
                (s.province || []).some(base => {
                    alt = (E().landNeighbors(base.id) || [])
                        .find(n => !presi.has(n) && libera(n)) || null;
                    return !!alt;
                });
                if (alt) { spots.push(Object.assign({}, spot, { id: alt })); presi.add(alt); }
            });
        }
        if (spots.length < (s.minProvince || 1)) return null;

        // Un regno con questo NOME c'è già? Si riusa il suo record invece di
        // crearne un gemello: il nome è la chiave con cui lo riconoscono dottrine
        // (js/doctrines.js) e obiettivi (§10), e due record omonimi le
        // manderebbero in confusione. Capita quando si ricarica la mappa iniziale
        // e si ricomincia con una partita nuova: il calendario riparte da zero
        // (`eventi` azzerato) ma l'anagrafica dei regni resta.
        const pl = R().players().find(p => p.name === s.name) ||
            R().addKingdom({ name: s.name, color: s.color, bot: s.bot || null });
        if (!pl) return null;
        pl.bot = s.bot || null;
        // FONDAZIONE: nasce ADESSO, anche se il record è riusato (stessa mappa
        // ricaricata). Da qui la GRAZIA DELL'INSEDIAMENTO (§8) gli conta i suoi
        // primi decenni come li ha contati a chi c'era dal turno 1: un regno che
        // sorge al 25º turno è giovane, non in ritardo.
        pl.nato = R().turn();
        // Il tesoro e il magazzino di partenza (il Portogallo nasce ricco e con
        // del legname: è il mare la sua storia). Senza, valgono i valori del §11
        // che normalizePlayer ha già messo.
        if (typeof s.monete === 'number') pl.monete = s.monete;
        if (s.scorte) Object.keys(s.scorte).forEach(k => { pl.scorte[k] = s.scorte[k]; });
        spots.forEach(spot => {
            const path = spot && E().path(spot.id);
            if (!path) return;
            E().setOwner(path, pl.name);
            E().setArmyColor(path, pl.color);
            // Un regno nuovo FONDA, non conquista: la provincia (una terra di
            // nessuno) non resta agganciata alla corona di chi la teneva un tempo.
            // Senza, una vecchia conquista poi razziata rinascerebbe qui vincolata
            // a un regno che non c'entra nulla, e nessuno scisma la toccherebbe più.
            E().setReligionLock(path, false);
            const cur = E().countPiece(path, 'soldato');
            const want = Math.max(0, Math.floor(spot.soldati || 0));
            if (want !== cur) E().addPiece(path, 'soldato', want - cur);
            if (spot.merc) E().setMerc(path, Math.min(want, Math.floor(spot.merc)));
            if (spot.capitale && E().countPiece(path, 'capitale') === 0) E().addPiece(path, 'capitale', 1);
            E().redrawProvince(path);
        });
        E().redrawRoads();
        // In coda all'ordine: gioca dal giro successivo. `primoDelGiro` è un indice
        // sul prefisso, che appendendo in fondo non si sposta. Se la partita non è
        // avviata (ordine vuoto) non lo si forza dentro. endTurn rilegge l'ordine
        // vivo prima di ruotare, così questo append non viene perso.
        const ordine = R().ordine();
        if (ordine.length && ordine.indexOf(pl.id) === -1) {
            ordine.push(pl.id);
            R().setTurnState(R().turnoDi(), ordine, R().primoDelGiro());
        }
        // L'ANNUNCIO ai soli CONFINANTI: la mappa non cambia mai di nascosto per
        // chi ce l'ha davanti agli occhi, ma un regno lontano non deve saperlo (è
        // la stessa nebbia che tiene segreta l'Orda finché non arriva). Chi non
        // vuole annuncio non mette `annuncio` nella spec: nasce in silenzio.
        if (s.annuncio) {
            const vicini = new Set();
            spots.forEach(spot => (E().landNeighbors(spot.id) || []).forEach(n => {
                const np = E().path(n);
                const chi = np && E().owner(np);
                if (chi && chi !== pl.name) vicini.add(chi);
            }));
            if (vicini.size) eventNotify(Array.from(vicini), s.annuncio);
        }
        return pl;
    }

    // onStart di chi scatta ORA (non già in `fatti`), poi onEnd di chi ha chiuso
    // la finestra. Gira in endTurn dopo advanceGlobalTurn, prima delle razzie.
    function applyEvents(turn) {
        const store = eventStore();
        const book = eventsBook();
        book.forEach(ev => {
            if (ev.turn !== turn) return;
            if (store.fatti.indexOf(ev.id) !== -1) return;   // già scattato: niente bis
            const oneShot = (ev.fino == null);               // one-shot: niente attivi/onRound/onEnd
            const rec = { id: ev.id, dal: turn, fino: oneShot ? null : ev.fino, stato: {} };
            store.fatti.push(ev.id);
            if (!oneShot) store.attivi.push(rec);            // solo i ticking restano attivi
            if (typeof ev.onStart === 'function') {
                try { ev.onStart(makeEventCtx(rec, turn)); }
                catch (err) { console.error('Evento ' + ev.id + ' onStart:', err); }
            }
        });
        // Finestra chiusa (fino < turno): onEnd e rimozione dagli attivi.
        store.attivi.filter(rec => rec.fino != null && rec.fino < turn).forEach(rec => {
            const ev = book.find(e => e.id === rec.id);
            if (ev && typeof ev.onEnd === 'function') {
                try { ev.onEnd(makeEventCtx(rec, turn)); }
                catch (err) { console.error('Evento ' + rec.id + ' onEnd:', err); }
            }
        });
        store.attivi = store.attivi.filter(rec => !(rec.fino != null && rec.fino < turn));
        if (R().setEventi) R().setEventi(store);
        return store;
    }

    // onRound degli eventi attivi. Salta quelli scattati proprio ORA: il loro
    // onStart ha già girato in questo stesso giro, l'onRound parte dal successivo.
    function tickEvents(turn) {
        const store = eventStore();
        const book = eventsBook();
        store.attivi.forEach(rec => {
            if (rec.dal === turn) return;
            const ev = book.find(e => e.id === rec.id);
            if (ev && typeof ev.onRound === 'function') {
                try { ev.onRound(makeEventCtx(rec, turn)); }
                catch (err) { console.error('Evento ' + rec.id + ' onRound:', err); }
            }
        });
        if (R().setEventi) R().setEventi(store);
        return store;
    }

    // La Guarnigione vale un turno solo (§5.3). Il Mercenario NO: si paga di più
    // (150 monete) e resta, ma resta come ventura — vedi `data-merc`.
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
        // `prov` dice DOVE è successo: serve a chi racconta l'azione (il registro
        // dell'IA nella plancia) per tacere quel che accade dentro la nebbia.
        return done(n + (n === 1 ? ' recluta schierata' : ' reclute schierate') + ' in ' +
            R().provinceLabel(path) + '. Restano ' + player.recluteDaSchierare + ' libere.',
            { prov: provId });
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
            ' in ' + R().provinceLabel(path) + '.', { prov: provId });
    }

    // Posa in un colpo solo tutti i rinforzi obbligatori rimasti.
    function deployAllBound(player) {
        const turnErr = requirePhase(player, 'schiera'); if (turnErr) return turnErr;
        if (!boundTotal(player)) return fail('Non hai rinforzi obbligatori in attesa.');
        const dove = Object.keys(boundPool(player));
        const n = forcePendingBound(player);
        E().refresh();
        E().save();
        return done(n + (n === 1 ? ' rinforzo obbligatorio schierato' : ' rinforzi obbligatori schierati') + '.',
            { provs: dove });
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
            (vincolate ? ' (' + vincolate + ' obbligatorie: possono tornare solo qui).' : '.'),
            { prov: provId });
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
        if (type === 'capitale') {
            player.stradeGratis = (player.stradeGratis || 0) + 1; extra = ' (hai 1 strada gratuita)';
            // Prima di questo momento il regno non aveva religione di stato: le
            // province già conquistate non erano agganciate a nessuna corona.
            // Adesso ce n'è una, e chi porta il vincolo la segue (§religione).
            if (R().syncStateFaiths) R().syncStateFaiths();
        }

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
            Object.assign({ prov: provId }, fondazione ? { fondazione } : null));
    }

    // MIGLIORIE CIVICHE (§6.1): Sanità/Felicità. Si costruiscono SULLA Capitale,
    // costano 3 unità di una risorsa e alzano il Benessere (§8). Vivono in
    // data-welfare sulla provincia-capitale (E().welfare): spostare la Capitale le
    // annulla, conquistarla le trasferisce, senza codice apposta. Una miglioria
    // DORMIENTE (manutenzione saltata, §6.1) si RIATTIVA da qui pagando subito 1
    // unità della sua risorsa, invece di aspettare la manutenzione successiva.
    function buildWelfare(player, key) {
        const turnErr = requirePhase(player, 'costruisci'); if (turnErr) return turnErr;
        const info = GR().welfareInfo(key);
        if (!info) return fail('Miglioria sconosciuta.');
        const cap = R().getCapitalPathFor(player);
        if (!cap) return fail('Le migliorie civiche si costruiscono sulla Capitale: prima costruiscine una.');
        const esistente = E().welfare(cap).find(e => e.key === key);

        // Già attiva: niente da fare. Dormiente: si riattiva pagando 1 (la
        // manutenzione arretrata), non si ricostruisce da capo.
        if (esistente && !esistente.dormant) return fail(GR().welfareLabel(key) + ' è già attiva.');
        if (esistente && esistente.dormant) {
            const upkeep = {}; upkeep[info.res] = 1;
            const okRiatt = GR().canAfford(player, upkeep, 0);
            if (!okRiatt.ok) return fail('Per riattivarla serve ' + GR().missingText(okRiatt.missing) + '.');
            pay(player, upkeep, cap);
            E().setWelfareDormant(cap, key, false);
            E().refresh(); E().save();
            return done(GR().welfareLabel(key) + ' riattivata in ' + R().provinceLabel(cap) + '.',
                { prov: cap.id });
        }

        const cost = GR().welfareCost(key);
        // Non costano soldati: il presidio minimo non c'entra (soldiersHere = 0).
        const afford = GR().canAfford(player, cost, 0);
        if (!afford.ok) return fail('Non puoi permettertelo: ' + GR().missingText(afford.missing) + '.');

        pay(player, cost, cap);
        E().addWelfare(cap, key, R().turn());   // il turno di costruzione: manutenzione (§6.1)
        E().refresh();
        E().save();
        const catLabel = GR().WELFARE[info.cat].label;
        return done(GR().welfareLabel(key) + ' costruita in ' + R().provinceLabel(cap) +
            ' — ' + catLabel + ' +1.', { prov: cap.id });
    }

    // MANUTENZIONE DELLE MIGLIORIE CIVICHE (§6.1, regola dell'utente). Ogni 5 turni
    // GLOBALI (sincronizzata: turni multipli di 5) ogni miglioria reclama 1 unità
    // della sua risorsa. È AUTO-PAGATA dal magazzino — nessuna micro-gestione: se
    // la risorsa c'è, si scala. Se manca:
    //   attiva  → DORMIENTE (smette di contare per il Benessere, ma resta in piedi);
    //   dormiente → CROLLA (rimossa; per riaverla si ricostruisce a prezzo pieno).
    // Una miglioria è ESENTE finché non ha compiuto il primo ciclo pieno
    // (turnoCostruzione ≤ T−5): così ha davvero 5 turni prima del primo prelievo.
    // Gira per TUTTI in beginTurn; l'umano ne vede l'esito nella pergamena
    // (welfareAvvisi), i bot no. `welfareMaintTurn` evita il doppio prelievo se
    // beginTurn rigira nello stesso turno (ricaricamento).
    function maintainWelfare(player) {
        const T = R().turn();
        if (T % 5 !== 0) return null;                    // solo i turni di manutenzione
        if (player.welfareMaintTurn === T) return null;  // già fatto in questo turno
        const cap = R().getCapitalPathFor(player);
        if (!cap) { player.welfareMaintTurn = T; return null; }
        const entries = E().welfare(cap);
        if (!entries.length) { player.welfareMaintTurn = T; return null; }

        const eventi = [];
        const rimasti = [];
        entries.forEach(e => {
            if ((e.turn || 0) > T - 5) { rimasti.push(e); return; }   // troppo giovane: esente
            const res = GR().welfareInfo(e.key).res;
            const ha = (player.scorte[res] || 0) >= 1;
            if (!e.dormant) {
                if (ha) { player.scorte[res] -= 1; rimasti.push(e); }               // pagata
                else { rimasti.push({ key: e.key, turn: e.turn, dormant: true });    // → dormiente
                    eventi.push({ key: e.key, res, esito: 'dormiente' }); }
            } else {
                if (ha) { player.scorte[res] -= 1; rimasti.push({ key: e.key, turn: e.turn, dormant: false });
                    eventi.push({ key: e.key, res, esito: 'riattivata' }); }         // rimediata
                else { eventi.push({ key: e.key, res, esito: 'crollata' }); }        // → crolla (fuori)
            }
        });
        E().setWelfare(cap, rimasti);
        player.welfareMaintTurn = T;
        if (eventi.length) player.welfareAvvisi.push({ turno: T, eventi, letto: false });
        return eventi.length ? { prov: cap.id, eventi } : null;
    }

    // Trasloco fisico del seggio: la vecchia Capitale diventa Città (non si rade
    // nulla — l'insediamento resta, cambia solo grado), la nuova provincia diventa
    // Capitale. È l'UNICO punto che sposta il seggio: lo chiamano sia lo
    // spostamento volontario (moveCapital) sia la promozione di una Capitale presa
    // (resolveCapital), così le due strade non possono divergere. `oldPath` può
    // essere null (adozione di una prima Capitale conquistata: non c'è vecchia
    // sede da declassare).
    function seatCapital(player, oldPath, newPath) {
        if (oldPath && oldPath.id !== newPath.id) {
            E().addPiece(oldPath, 'capitale', -E().countPiece(oldPath, 'capitale'));
            E().addPiece(oldPath, 'citta', 1);
            // Le migliorie civiche (§6.1) erano della città-capitale: abbandonando
            // il seggio si annullano (non è più la stessa città, regola dell'utente).
            // La nuova sede parte senza — se ne costruiscono di sue.
            E().setWelfare(oldPath, []);
            E().setArmyColor(oldPath, player.color);
            E().redrawProvince(oldPath);
        }
        // La provincia presa poteva essere stata declassata a Città un attimo prima
        // (default della conquista): tolgo la Città prima di posare la Capitale, così
        // l'esclusività Capitale/Città/Fortezza resta rispettata.
        E().addPiece(newPath, 'citta', -E().countPiece(newPath, 'citta'));
        if (E().countPiece(newPath, 'capitale') === 0) E().addPiece(newPath, 'capitale', 1);
        E().setArmyColor(newPath, player.color);
        E().redrawProvince(newPath);
        // La fede di STATO è quella della Capitale: spostando il seggio può
        // essere cambiata in questo istante, e le province conquistate seguono la
        // CORONA (§la fede segue la spada). Riallinearle qui e non aspettare il
        // prossimo giro completo: fino ad allora la mappa delle fedi mostrerebbe
        // un impero che non esiste più.
        if (R().syncStateFaiths) R().syncStateFaiths();
    }

    // Sposta la Capitale su una provincia propria (500 monete). La vecchia sede
    // diventa Città. Non si ridà la strada gratuita — è un bonus di fondazione,
    // non di trasloco.
    function moveCapital(player, provId) {
        const turnErr = requirePhase(player, 'costruisci'); if (turnErr) return turnErr;
        const cap = R().getCapitalPathFor(player);
        if (!cap) return fail('Non hai ancora una Capitale: prima costruiscine una.');
        const path = E().path(provId);
        if (!path) return fail('Provincia sconosciuta.');
        if (E().owner(path) !== player.name) return fail('Puoi spostare la Capitale solo su una tua provincia.');
        if (path.id === cap.id) return fail('La Capitale è già qui.');
        // Il seggio si trasloca SOLO su una propria Città (regola dell'utente):
        // prima si fonda la Città, poi vi si sposta la Capitale — altrimenti
        // spostare la Capitale su una provincia qualunque sarebbe troppo facile.
        // La Città viene assorbita dal seggio (seatCapital toglie la Città prima
        // di posare la Capitale).
        if (E().countPiece(path, 'citta') === 0) {
            return fail('Puoi spostare la Capitale solo in una tua Città: fondane una lì, prima.');
        }
        const cost = GR().COSTS.capitale;   // { monete: 500 }
        const afford = GR().canAfford(player, cost, spare(path));
        if (!afford.ok) return fail('Non puoi permetterti lo spostamento: ' + GR().missingText(afford.missing) + '.');

        pay(player, cost, path);
        seatCapital(player, cap, path);

        let fondazione = null;
        if (root.Chronicle) {
            fondazione = root.Chronicle.foundCapital(R().provinceLabel(path), R().turn(), player.name);
            fondazione.colore = player.color;
            fondazione.id = path.id;
        }
        E().refresh();
        E().save();
        return done('La Capitale si sposta a ' + R().provinceLabel(path) + ': ' +
            R().provinceLabel(cap) + ' resta come Città.',
            Object.assign({ prov: provId, provs: [provId, cap.id] }, fondazione ? { fondazione } : null));
    }

    // Decide la sorte di una Capitale nemica appena conquistata (player.capitalePresa).
    // Di default è già stata declassata a Città (applyBattleOutcome), quindi lo
    // stato è consistente: qui `promuovi=true` la promuove a Capitale ufficiale del
    // regno (e la vecchia diventa Città), senza costi. `promuovi=false` la lascia
    // Città. In entrambi i casi si chiude la pratica.
    function resolveCapital(player, promuovi) {
        const c = player.capitalePresa;
        if (!c) return fail('Non c\'è nessuna Capitale da decidere.');
        const to = E().path(c.toId);
        if (!to || E().owner(to) !== player.name) { player.capitalePresa = null; return done('Deciso.'); }
        let msg = R().provinceLabel(to) + ' resta una Città.';
        let fondazione = null;
        if (promuovi) {
            const old = R().getCapitalPathFor(player);   // la Capitale attuale (diversa da `to`, che ora è Città)
            seatCapital(player, old, to);
            msg = R().provinceLabel(to) + ' è ora la Capitale del regno' +
                (old && old.id !== to.id ? ': ' + R().provinceLabel(old) + ' torna una Città.' : '.');
            if (root.Chronicle) {
                fondazione = root.Chronicle.foundCapital(R().provinceLabel(to), R().turn(), player.name);
                fondazione.colore = player.color;
                fondazione.id = to.id;
            }
        }
        player.capitalePresa = null;
        E().refresh();
        E().save();
        return done(msg, Object.assign({ prov: c.toId }, fondazione ? { fondazione } : null));
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
            (gratis ? ' (gratuita).' : '.'), { prov: aId, prov2: bId });
    }

    // Reclutamento (§5.3). Due unità, entrambe permanenti:
    //   Guarnigione — 2 soldati di rinforzo, truppe normali che restano.
    //   Mercenario  — 1 soldato che RESTA per sempre, ma è di ventura: entra in
    //                 `data-merc` e da lì pesa su ogni battaglia della provincia
    //                 finché non muore o non viene mandato altrove (§9).
    function recruit(player, provId, type) {
        const turnErr = requirePhase(player, 'costruisci'); if (turnErr) return turnErr;
        if (GR().RECRUITABLE.indexOf(type) < 0) return fail('Non è un\'unità reclutabile.');
        const path = E().path(provId);
        if (!path) return fail('Provincia sconosciuta.');
        if (E().owner(path) !== player.name) return fail('Puoi reclutare solo nelle tue province.');

        const cost = GR().COSTS[type];
        const afford = GR().canAfford(player, cost, spare(path));
        if (!afford.ok) return fail('Non puoi permettertelo: ' + GR().missingText(afford.missing) + '.');

        const n = (type === 'guarnigione') ? 2 : 1;
        const room = roomFor(path);
        if (n > room) return fail(R().provinceLabel(path) + ' non regge altri soldati.');

        pay(player, cost, path);
        E().addPiece(path, 'soldato', n);
        E().setArmyColor(path, player.color);

        // Il Mercenario entra in `data-merc` (ventura, §9); la Guarnigione è
        // rinforzo puro — soldati normali che restano, niente da segnare.
        if (type === 'mercenario') E().addMerc(path, n);

        E().redrawProvince(path);
        E().refresh();
        E().save();
        if (type === 'guarnigione') {
            return done('+' + n + ' soldati di rinforzo in ' + R().provinceLabel(path) + '.',
                { prov: provId });
        }
        // Il mercenario si paga due volte: una in monete, una in affidabilità. La
        // seconda va detta subito, con la quota della provincia, o il giocatore
        // scopre il conto solo quando perde una battaglia che dava per vinta.
        const merc = E().merc(path), truppe = E().countPiece(path, 'soldato');
        return done('+1 mercenario in ' + R().provinceLabel(path) + ': resta per sempre, ma qui ' +
            merc + ' truppe su ' + truppe + ' sono ormai di ventura — in battaglia rendono meno, ' +
            'e quanto meno si scopre sul campo.', { prov: provId });
    }

    // ---------- SPIE (§9.3) ----------
    // Si comprano OCCHI, non truppe: 300 monete e per 3 turni si vede di chi
    // sono una provincia lontana e le sue limitrofe. Nessuna pedina sulla mappa
    // e nessun grado di visibilità nuovo — la spia versa nella nebbia leggera
    // del §9.2, la stessa della portata di una nave: bandiere sì, guarnigioni no.
    // Le regole (costo, durata, tetto, raggio) e il conto dei passi stanno in
    // js/spies.js, che è puro; qui resta solo quel che tocca lo stato.
    //
    // Perché il bersaglio deve essere fuori dalla propria vista: la distanza non
    // basta a rendere una spia sensata — la provincia a 5 confini può essere
    // raggiunta anche dalla portata di un Veliero, e allora quelle 300 monete
    // comprerebbero una cosa che si ha già.

    function SP() { return root.Spies; }

    function spiesOf(player) {
        return SP() ? SP().active(player.spie, R().turn()) : [];
    }

    // Dove si può mandarne una adesso: [{id, dist, label}].
    // NON dice di chi è la provincia, ed è il punto: quello è esattamente ciò
    // che la spia deve andare a scoprire. Metterlo qui lo farebbe finire nel
    // pannello, e il giocatore leggerebbe gratis la cosa che sta comprando.
    // Vuoto finché i confini non sono pronti (app.js li costruisce all'avvio):
    // meglio nessun bersaglio che un raggio misurato su un grafo a metà.
    function spyTargets(player) {
        if (!SP() || !R().neighborsReady || !R().neighborsReady()) return [];
        const owned = E().ownedPaths(player.name).map(p => p.id);
        if (!owned.length) return [];
        const seen = R().seenBy(player.name);
        const visti = new Set([...seen.visible, ...seen.haze]);
        return SP().targets(owned, visti, id => E().landNeighbors(id))
            .map(t => {
                const path = E().path(t.id);
                return { id: t.id, dist: t.dist, label: path ? R().provinceLabel(path) : t.id };
            });
    }

    function sendSpy(player, provId) {
        const turnErr = requirePhase(player, 'costruisci'); if (turnErr) return turnErr;
        if (!SP()) return fail('Le spie non sono disponibili in questa partita.');

        const attive = spiesOf(player);
        if (attive.length >= SP().MAX) {
            return fail('Hai già ' + attive.length + ' spie in perlustrazione: ' +
                'aspetta che una rientri (il massimo è ' + SP().MAX + ').');
        }

        const path = E().path(provId);
        if (!path) return fail('Provincia sconosciuta.');

        // Il bersaglio si ricava dalla stessa funzione che accende la mappa: se
        // non è in quell'elenco, il perché è uno dei due, e si dice quale.
        const target = spyTargets(player).find(t => t.id === provId);
        if (!target) {
            if (!R().neighborsReady || !R().neighborsReady()) {
                return fail('La mappa non ha ancora finito di calcolare i confini: riprova fra un istante.');
            }
            const seen = R().seenBy(player.name);
            if (seen.visible.has(provId) || seen.haze.has(provId)) {
                return fail(R().provinceLabel(path) + ' la vedi già: una spia si manda dove non arrivano ' +
                    'né i tuoi confini né le tue navi.');
            }
            return fail(R().provinceLabel(path) + ' è troppo lontana: una spia percorre al più ' +
                SP().RAGGIO + ' confini dal tuo territorio.');
        }

        const cost = GR().COSTS.spia;
        const afford = GR().canAfford(player, cost, 0);
        if (!afford.ok) return fail('Non puoi permettertela: ' + GR().missingText(afford.missing) + '.');

        player.monete -= cost.monete;
        if (!Array.isArray(player.spie)) player.spie = [];
        player.spie.push({ prov: provId, turno: R().turn() });

        E().refresh();
        E().save();
        return done('Una spia parte per ' + target.label + ' (' + target.dist +
            (target.dist === 1 ? ' confine' : ' confini') + ' dal tuo territorio): per ' +
            SP().DURATA + ' turni vedrai di chi sono quella provincia e le sue limitrofe, ' +
            'non quante truppe ci stanno.', { prov: provId });
    }

    // ---------- TASSAZIONE (§7, §8) ----------
    // Il livello di tassazione è una LEVA DI GOVERNO, non una costruzione: non
    // costa niente e non consuma la fase, quindi si può cambiare in qualunque
    // momento del proprio turno. Quello che cambia è il prossimo inizio turno —
    // `beginTurn` legge `player.tassazione` sia per le monete (§7) sia per il
    // componente Tassa della Popolarità (§8): più tasse, più oro, meno popolo.
    // Passa da qui e non da un assegnamento nella UI perché questo resta l'unico
    // punto che muta lo stato: da qui arrivano gratis il salvataggio, il `prov`
    // per il registro che rispetta la nebbia, e il fatto che l'IA e il giocatore
    // usino la stessa strada.
    function setTax(player, livello) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        const L = (typeof Popularity !== 'undefined') ? Popularity.TAX_LEVELS : null;
        if (L && !L[livello]) return fail('Livello di tassazione sconosciuto.');
        if (player.tassazione === livello) return fail('La tassazione è già ' + livello + '.');

        player.tassazione = livello;
        const cap = R().getCapitalPathFor(player);
        const rate = GR().TAX_INCOME[livello];
        E().refresh();
        E().save();
        return done('Tassazione ' + (L ? L[livello].label.toLowerCase() : livello) +
            ': ' + rate + ' monete per città a turno.',
            { prov: cap ? cap.id : null, tassazione: livello });
    }

    // ---------- COMMERCI (§7) ----------
    // Il Mercato è l'infrastruttura del commercio: senza, un regno non tratta con
    // nessuno. Da lì partono due canali diversi, tutti e due dentro la fase
    // "costruisci":
    //   - L'ESTERO (la banca): 2 unità di una risorsa tua → 1 di un altro tipo,
    //     subito. Non c'è nessuno dall'altra parte, quindi non c'è niente da
    //     aspettare.
    //   - LE PROPOSTE agli altri regni: si mandano nel proprio turno, ma si
    //     RISPONDE quando arrivano — accettare o rifiutare non chiede né turno né
    //     fase (una carovana che bussa alla porta si accoglie quando bussa).
    // La merce offerta lascia SUBITO la scorta di chi propone (è un pegno): senza
    // questo la stessa pietra si potrebbe promettere a tre regni diversi.
    // Una proposta vive in un posto solo: la lista `offerte` di CHI LA RICEVE.

    function marketPath(player) {
        return E().ownedPaths(player.name).find(p => E().countPiece(p, 'mercato') > 0) || null;
    }

    function hasMarket(player) { return !!marketPath(player); }

    // Dove "succede" un'azione che non ha una provincia sua (accettare, rifiutare,
    // ritirare): la Capitale, o la prima provincia del regno. Serve alla nebbia —
    // ogni azione deve dire dove è avvenuta, o il registro non sa se raccontarla.
    function homeId(player) {
        const cap = R().getCapitalPathFor(player);
        if (cap) return cap.id;
        const first = E().ownedPaths(player.name)[0];
        return first ? first.id : null;
    }

    function offersOf(player) {
        if (!Array.isArray(player.offerte)) player.offerte = [];
        return player.offerte;
    }

    // Le proposte ARRIVATE a questo regno.
    function tradeInbox(player) { return offersOf(player).slice(); }

    // Le proposte PARTITE da questo regno: stanno sul record di chi le ha ricevute.
    function tradeOutbox(player) {
        const out = [];
        R().players().forEach(p => offersOf(p).forEach(o => {
            if (o.da === player.id) out.push(o);
        }));
        return out;
    }

    function newTradeId() {
        return 't' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
    }

    function goods(x) {
        return { tipo: x && x.tipo, n: Math.floor((x && x.n) || 0) };
    }

    // Quanta di una merce ha un regno, e come gliela si aggiunge/toglie. L'oro
    // vive sul tesoro (player.monete), le risorse nelle scorte: qui il resto del
    // commercio non deve sapere quale sia quale.
    function haveGood(player, g) {
        return g.tipo === 'monete' ? (player.monete || 0) : ((player.scorte && player.scorte[g.tipo]) || 0);
    }

    function giveGood(player, g, sign) {
        if (g.tipo === 'monete') player.monete = (player.monete || 0) + sign * g.n;
        else player.scorte[g.tipo] = ((player.scorte && player.scorte[g.tipo]) || 0) + sign * g.n;
    }

    function nameOf(id) {
        const p = R().players().find(x => x.id === id);
        return p ? p.name : 'un regno scomparso';
    }

    // Scambio con la banca: 2:1, immediato (GameRules.canBankTrade fa le regole).
    function tradeWithBank(player, dai, prendi, n) {
        const turnErr = requirePhase(player, 'costruisci'); if (turnErr) return turnErr;
        const mercato = marketPath(player);
        if (!mercato) return fail('Senza un Mercato non si commercia con l\'estero: costruiscine uno.');

        const check = GR().canBankTrade(player, dai, prendi, n);
        if (!check.ok) return fail(check.msg);

        n = Math.floor(n);
        player.scorte[dai] -= check.costo;
        player.scorte[prendi] += n;

        E().refresh();
        E().save();
        return done('Mercato di ' + R().provinceLabel(mercato) + ': ' + check.costo + ' ' +
            GR().RES_LABEL[dai] + ' → ' + n + ' ' + GR().RES_LABEL[prendi] + '.',
            { prov: mercato.id });
    }

    // Manda una proposta a un altro regno. La merce offerta esce subito (pegno).
    function proposeTrade(player, toId, offro, chiedo) {
        const turnErr = requirePhase(player, 'costruisci'); if (turnErr) return turnErr;
        const mercato = marketPath(player);
        if (!mercato) return fail('Serve un Mercato per far partire una carovana: costruiscine uno.');

        const altro = R().players().find(p => String(p.id) === String(toId));
        if (!altro) return fail('Regno sconosciuto.');
        if (altro.id === player.id) return fail('Non si commercia con se stessi.');
        if (!E().ownedPaths(altro.name).length) {
            return fail(altro.name + ' non ha più province: non c\'è nessuno con cui trattare.');
        }

        const off = goods(offro), chi = goods(chiedo);
        // Ogni lato può essere una risorsa o oro (multipli di 100): risorse↔risorse,
        // oro→risorse, risorse→oro. Non oro↔oro — sarebbe spostare monete e basta.
        const offChk = GR().checkGoods(off); if (!offChk.ok) return fail(offChk.msg);
        const chiChk = GR().checkGoods(chi); if (!chiChk.ok) return fail(chiChk.msg);
        if (off.tipo === chi.tipo) {
            return fail(off.tipo === 'monete'
                ? 'Oro per oro non è un commercio: chiedi o offri una risorsa.'
                : 'Offri e chiedi la stessa risorsa: non è uno scambio.');
        }
        if (haveGood(player, off) < off.n) {
            return fail('Non hai ' + GR().goodsText(off) + ' da offrire.');
        }

        const aperte = tradeOutbox(player).length;
        if (aperte >= GR().TRADE_MAX_PENDING) {
            return fail('Hai già ' + aperte + ' proposte in attesa di risposta: ritirane una prima di mandarne altre.');
        }

        giveGood(player, off, -1);      // pegno: la merce parte con la carovana
        offersOf(altro).push({
            id: newTradeId(), da: player.id, a: altro.id,
            offro: off, chiedo: chi, turno: R().turn()
        });

        E().refresh();
        E().save();
        return done('Proposta inviata a ' + altro.name + ': ' + GR().goodsText(off) +
            ' in cambio di ' + GR().goodsText(chi) + '. La merce offerta è già partita.',
            { prov: mercato.id });
    }

    // La merce in pegno torna a chi l'aveva offerta (rifiuto, ritiro, scadenza).
    function refundTrade(off) {
        const mittente = R().players().find(p => p.id === off.da);
        if (mittente) giveGood(mittente, off.offro, +1);
    }

    // ---------- storico e avvisi dei commerci (§7, richiesta dell'utente) ----------
    // Uno scambio ANDATO A BUON FINE si registra su ENTRAMBI i regni, ognuno dal
    // proprio punto di vista (cosa ha DATO, cosa ha RICEVUTO): serve alla plancia
    // per rileggere lo storico e RIPROPORRE al volo lo stesso affare. In più chi
    // ha mandato la carovana (il proponente) non era al tavolo quando l'altro ha
    // accettato: se ne accorge solo all'apertura del proprio turno, con un avviso
    // in coda come per gli editti — così una trattativa conclusa non passa
    // inosservata. L'accettante invece l'ha appena fatto lui e vede subito l'esito.
    const TRADE_LOG_MAX = 20;

    function tradeHistory(player) {
        if (!Array.isArray(player.commerciStorico)) player.commerciStorico = [];
        return player.commerciStorico;
    }
    function tradeNotices(player) {
        if (!Array.isArray(player.commerciAvvisi)) player.commerciAvvisi = [];
        return player.commerciAvvisi;
    }
    function pushTrade(player, entry) {
        const log = tradeHistory(player);
        log.push(entry);
        while (log.length > TRADE_LOG_MAX) log.shift();
    }
    function recordTrade(mittente, accettante, off) {
        const turno = R().turn();
        // Il proponente ha DATO il pegno (off.offro) e RICEVUTO la contropartita.
        pushTrade(mittente, {
            conId: accettante.id, conNome: accettante.name,
            dato: off.offro, ricevuto: off.chiedo, turno
        });
        // L'accettante è lo specchio: dà off.chiedo e riceve off.offro.
        pushTrade(accettante, {
            conId: mittente.id, conNome: mittente.name,
            dato: off.chiedo, ricevuto: off.offro, turno
        });
        // Solo il proponente scopre l'esito a turno chiuso: a lui l'avviso pop-up.
        const av = tradeNotices(mittente);
        av.push({
            letto: false, turno, conNome: accettante.name,
            dato: off.offro, ricevuto: off.chiedo
        });
        while (av.length > TRADE_LOG_MAX) av.shift();
    }

    function takeOffer(player, offerId) {
        const list = offersOf(player);
        const i = list.findIndex(o => o.id === offerId);
        return i < 0 ? null : { list, i, off: list[i] };
    }

    // Accetta: NIENTE vincolo di turno o di fase. Il Mercato e la fase costruzioni
    // li deve avere chi manda la carovana, non chi la riceve — altrimenti una
    // trattativa durerebbe un giro intero e nessuno commercerebbe mai.
    function acceptTrade(player, offerId) {
        const found = takeOffer(player, offerId);
        if (!found) return fail('Questa proposta non c\'è più.');
        const { list, i, off } = found;

        const mittente = R().players().find(p => p.id === off.da);
        if (!mittente) {
            list.splice(i, 1);
            E().save();
            return fail('Il regno che l\'aveva mandata non esiste più: proposta annullata.');
        }
        if (haveGood(player, off.chiedo) < off.chiedo.n) {
            return fail('Non hai ' + GR().goodsText(off.chiedo) + ' da consegnare: la proposta resta aperta.');
        }

        giveGood(player, off.chiedo, -1);        // consegni quel che ti hanno chiesto
        giveGood(player, off.offro, +1);         // ricevi il pegno del mittente
        giveGood(mittente, off.chiedo, +1);      // il mittente incassa la contropartita
        list.splice(i, 1);
        recordTrade(mittente, player, off);      // storico su entrambi + avviso al proponente

        E().refresh();
        E().save();
        return done('Accordo con ' + mittente.name + ': ricevi ' + GR().goodsText(off.offro) +
            ', consegni ' + GR().goodsText(off.chiedo) + '.', { prov: homeId(player) });
    }

    function refuseTrade(player, offerId) {
        const found = takeOffer(player, offerId);
        if (!found) return fail('Questa proposta non c\'è più.');
        const { list, i, off } = found;
        refundTrade(off);
        list.splice(i, 1);

        E().refresh();
        E().save();
        return done('Proposta di ' + nameOf(off.da) + ' rifiutata: la carovana torna indietro.',
            { prov: homeId(player) });
    }

    // Ritiro da parte di CHI HA MANDATO la proposta: la cerca fra i regni, non
    // fra le proprie (una proposta vive solo nella lista di chi la riceve).
    function cancelTrade(player, offerId) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        let tolta = null;
        R().players().forEach(p => {
            const list = offersOf(p);
            const i = list.findIndex(o => o.id === offerId && o.da === player.id);
            if (i >= 0 && !tolta) { tolta = list[i]; list.splice(i, 1); }
        });
        if (!tolta) return fail('Questa proposta non c\'è più.');
        refundTrade(tolta);

        E().refresh();
        E().save();
        return done('Proposta a ' + nameOf(tolta.a) + ' ritirata: ' + GR().goodsText(tolta.offro) +
            ' torna nelle scorte.', { prov: homeId(player) });
    }

    // Una proposta senza risposta non resta in pegno per sempre: dopo
    // GameRules.TRADE_EXPIRY turni la carovana torna a casa con la merce.
    // Gira a giro completato (endTurn), cioè una volta per decennio.
    function expireTrades() {
        const limite = R().turn() - GR().TRADE_EXPIRY;
        let scadute = 0;
        R().players().forEach(p => {
            const list = offersOf(p);
            for (let i = list.length - 1; i >= 0; i--) {
                if ((list[i].turno || 0) > limite) continue;
                refundTrade(list[i]);
                list.splice(i, 1);
                scadute++;
            }
        });
        return scadute;
    }

    // ============================================================
    // DIPLOMAZIA — stringere, ROMPERE e TRADIRE i patti (§Diplomazia).
    // La relazione pura e i privilegi stanno in js/diplomacy.js; qui vive tutto
    // ciò che MUTA lo stato, perché questo resta l'unico mutatore. Un patto è
    // MUTUO: le funzioni lo scrivono/cancellano su ENTRAMBI i record in un colpo
    // (bondPact/unbondPact), come recordTrade scrive lo storico da tutti e due i
    // lati — così le liste non divergono. Le PROPOSTE viaggiano come le offerte
    // di commercio (sul record di chi le riceve), gli AVVISI come gli editti.
    // ============================================================
    const PACT_LOG_MAX = 20;

    function pactInbox(player) {
        if (!Array.isArray(player.pattiProposte)) player.pattiProposte = [];
        return player.pattiProposte;
    }
    function pactNotices(player) {
        if (!Array.isArray(player.pattiAvvisi)) player.pattiAvvisi = [];
        return player.pattiAvvisi;
    }
    function pactsMut(player) {
        if (!Array.isArray(player.patti)) player.patti = [];
        return player.patti;
    }
    function pushPactNotice(player, entry) {
        const av = pactNotices(player);
        av.push(Object.assign({ letto: false, turno: R().turn() }, entry));
        while (av.length > PACT_LOG_MAX) av.shift();
    }
    // Scrive un patto `tipo` di `owner` verso `partnerId` (togliendo un eventuale
    // doppione dello stesso tipo). `scad` solo per l'alleanza a tempo.
    function addPact(owner, partnerId, tipo, dal, scad) {
        const list = pactsMut(owner);
        for (let i = list.length - 1; i >= 0; i--) {
            if (String(list[i].con) === String(partnerId) && list[i].tipo === tipo) list.splice(i, 1);
        }
        const rec = { tipo, con: partnerId, dal };
        if (scad != null) rec.scad = scad;
        list.push(rec);
    }
    function bondPact(a, b, tipo) {
        const dal = R().turn();
        const scad = tipo === 'alleanzaTempo' ? dal + D().TIMED : null;
        addPact(a, b.id, tipo, dal, scad);
        addPact(b, a.id, tipo, dal, scad);
        return scad;
    }
    // Cancella da ENTRAMBI il patto `tipo` (o TUTTI i patti fra i due se tipo è null).
    function unbondPact(a, b, tipo) {
        [[a, b.id], [b, a.id]].forEach(([owner, pid]) => {
            owner.patti = pactsMut(owner).filter(p =>
                !(String(p.con) === String(pid) && (!tipo || p.tipo === tipo)));
        });
    }
    function takePactProposal(player, offerId) {
        const list = pactInbox(player);
        const i = list.findIndex(o => o.id === offerId);
        return i < 0 ? null : { list, i, off: list[i] };
    }

    // Propone un patto a un regno visibile. Non è commercio: niente Mercato,
    // niente fase — basta il proprio turno (la visibilità la filtra la plancia,
    // come per i commerci). La proposta finisce nella casella del destinatario.
    function proposePact(player, toId, tipo) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        const altro = R().players().find(p => String(p.id) === String(toId));
        if (!altro) return fail('Regno sconosciuto.');
        if (!E().ownedPaths(altro.name).length) return fail(altro.name + ' non ha più province.');
        const chk = D().canPropose(player, altro, tipo);
        if (!chk.ok) return fail(chk.msg);
        const dup = o => o.tipo === tipo &&
            ((String(o.da) === String(player.id) && String(o.a) === String(altro.id)) ||
             (String(o.da) === String(altro.id) && String(o.a) === String(player.id)));
        if (pactInbox(altro).some(dup) || pactInbox(player).some(dup)) {
            return fail('C\'è già una proposta di ' + D().LABEL[tipo].toLowerCase() + ' in sospeso con ' + altro.name + '.');
        }
        pactInbox(altro).push({ id: newTradeId(), da: player.id, a: altro.id, tipo, turno: R().turn() });
        E().refresh(); E().save();
        return done('Proposta di ' + D().LABEL[tipo].toLowerCase() + ' inviata a ' + altro.name + '.', { prov: homeId(player) });
    }

    // Accetta: si ricontrolla la validità al momento dell'accordo (nel frattempo
    // può essere nata un'alleanza che copre tutto). Il patto nasce mutuo e il
    // proponente lo scopre con un avviso a inizio turno.
    function acceptPact(player, offerId) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        const found = takePactProposal(player, offerId);
        if (!found) return fail('Questa proposta non c\'è più.');
        const { list, i, off } = found;
        const mittente = R().players().find(p => p.id === off.da);
        if (!mittente) { list.splice(i, 1); E().save(); return fail('Il regno che l\'aveva proposta non esiste più.'); }
        const chk = D().canPropose(player, mittente, off.tipo);
        if (!chk.ok) { list.splice(i, 1); E().save(); return fail(chk.msg); }
        bondPact(player, mittente, off.tipo);
        list.splice(i, 1);
        pushPactNotice(mittente, { tipo: 'accettato', patto: off.tipo, conNome: player.name });
        E().refresh(); E().save();
        return done(D().LABEL[off.tipo] + ' con ' + mittente.name + ': patto stretto.', { prov: homeId(player) });
    }

    function declinePact(player, offerId) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        const found = takePactProposal(player, offerId);
        if (!found) return fail('Questa proposta non c\'è più.');
        const nome = nameOf(found.off.da);
        found.list.splice(found.i, 1);
        E().refresh(); E().save();
        return done('Proposta di ' + D().LABEL[found.off.tipo].toLowerCase() + ' di ' + nome + ' rifiutata.', { prov: homeId(player) });
    }

    // Rompe un patto (o tutti quelli con `partnerId` se `tipo` è null: è il caso
    // di un attacco, atto di guerra che scioglie ogni accordo). Solo la rottura
    // di un'ALLEANZA costa prestigio (§10, D.BREAK_PRESTIGE): i patti leggeri no.
    // Il prestigio è oggi spento (GameRules.PRESTIGE_ENABLED=false), quindi il
    // −2 su puntiOro è un no-op finché non si riaccende il §10 — la regola è
    // già qui, pronta. `tradimento` cambia solo il testo dell'avviso al tradito;
    // il rancore lo segna già la conquista (recordGrudge). `silent` evita il
    // doppio refresh/save quando la chiama attack() a metà transazione.
    function breakPact(player, partnerId, tipo, opts) {
        const altro = R().players().find(p => String(p.id) === String(partnerId));
        if (!altro) return fail('Regno sconosciuto.');
        const presenti = D().pactsWith(player, altro.id).filter(p => !tipo || p.tipo === tipo);
        if (!presenti.length) return fail('Non avete questo patto.');
        const tradimento = !!(opts && opts.tradimento);
        const perde = presenti.some(p => D().costsPrestige(p.tipo));
        unbondPact(player, altro, tipo || null);
        if (perde) player.puntiOro = Math.max(0, (player.puntiOro || 0) - D().BREAK_PRESTIGE);
        pushPactNotice(altro, {
            tipo: tradimento ? 'tradito' : 'rotto',
            patto: tipo || presenti[0].tipo, conNome: player.name
        });
        if (!(opts && opts.silent)) { E().refresh(); E().save(); }
        const testa = tradimento ? 'Hai tradito ' + altro.name
                                 : (tipo ? D().LABEL[tipo] : 'Ogni patto') + ' con ' + altro.name + ' sciolto';
        return done(testa + (perde ? ' (−' + D().BREAK_PRESTIGE + ' prestigio).' : '.'), { prov: homeId(player) });
    }

    // CONSENSO ALL'ATTACCO (regola dell'utente): il PROPRIETARIO concede a un
    // partner di colpire una PROPRIA provincia senza che il patto si rompa. Vive
    // come un permesso una-tantum sul record di chi lo concede: [{chi, prov}].
    function consentIndex(owner, attackerId, provId) {
        const list = owner && owner.permessiAttacco;
        if (!Array.isArray(list)) return -1;
        return list.findIndex(x => String(x.chi) === String(attackerId) && String(x.prov) === String(provId));
    }
    function grantAttack(player, toId, provId) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        const altro = R().players().find(p => String(p.id) === String(toId));
        if (!altro) return fail('Regno sconosciuto.');
        if (!D().grantsNonAggression(player, altro)) {
            return fail('Non avete un patto di non aggressione: ' + altro.name + ' non ha bisogno del tuo consenso per attaccarti.');
        }
        const path = E().path(provId);
        if (!path || E().owner(path) !== player.name) return fail('Puoi concedere solo una tua provincia.');
        if (!Array.isArray(player.permessiAttacco)) player.permessiAttacco = [];
        if (consentIndex(player, altro.id, provId) < 0) {
            player.permessiAttacco.push({ chi: altro.id, prov: provId, turno: R().turn() });
        }
        pushPactNotice(altro, { tipo: 'consenso', prov: provId, conNome: player.name });
        E().refresh(); E().save();
        return done('Consenti a ' + altro.name + ' di attaccare ' + labelOf(provId) + ' senza rompere il patto.', { prov: provId });
    }

    // ============================================================
    // A COSA SERVE DAVVERO UN'ALLEANZA: CHIEDERE E MANDARE RINFORZI
    // (regola dell'utente: "nella meccanica dell'alleanza non si capisce cosa si
    // possa effettivamente fare oltre a concedere uno stato ad un altro regno").
    //
    // Il privilegio 'rinforzi' (che l'alleanza comprende, e che il patto omonimo
    // dà da solo) apriva finora una sola porta, e stretta: lo spostamento di FINE
    // turno verso un alleato confinante — uno per turno, in concorrenza con la
    // manovra propria. Due cose mancavano, e sono queste:
    //
    //   1. CHIEDERE. `askReinforcements` manda all'alleato una richiesta che dice
    //      DOVE servono gli uomini. È un messaggio, non un obbligo: vive come le
    //      proposte di patto (sul record di chi la riceve) e si spegne da sé
    //      quando i rinforzi arrivano o dopo HELP_TTL turni. Dove sta cedendo il
    //      fronte lo sa il difensore, non chi lo guarda da lontano.
    //   2. MANDARE, in FASE D'ATTACCO. `sendReinforcements` è l'altra cosa che si
    //      può fare da una provincia di confine oltre a caricare: invece di
    //      colpire l'alleato, gli si marcia in aiuto. Non consuma lo spostamento
    //      di fine turno (che resta per la propria manovra) e non ha un tetto di
    //      volte: il tetto è che quegli uomini DIVENTANO SUOI e non tornano.
    //
    // Chi riceve segna l'aiuto in `aiuti`, che Diplomacy.standing legge come il
    // fatto positivo più caro: sono uomini, non merce.
    // ============================================================
    const HELP_TTL = 5;          // una richiesta d'aiuto invecchia in mezzo ciclo
    const HELP_MAX = 12;
    function helpInbox(player) {
        if (!Array.isArray(player.richiesteAiuto)) player.richiesteAiuto = [];
        return player.richiesteAiuto;
    }
    // Le richieste che questo regno ha MANDATO: come tradeOutbox, si trovano
    // scorrendo le caselle altrui — una richiesta esiste in un posto solo.
    function helpOutbox(player) {
        const out = [];
        R().players().forEach(p => {
            if (String(p.id) === String(player.id)) return;
            helpInbox(p).forEach(h => {
                if (String(h.da) === String(player.id)) out.push(Object.assign({ a: p.id, aNome: p.name }, h));
            });
        });
        return out;
    }

    // "Mandami uomini QUI." Serve l'accesso militare (alleanza o patto dei
    // rinforzi) e una provincia PROPRIA: si chiede aiuto per casa propria.
    function askReinforcements(player, toId, provId) {
        const turnErr = requireTurn(player); if (turnErr) return turnErr;
        const altro = R().players().find(p => String(p.id) === String(toId));
        if (!altro) return fail('Regno sconosciuto.');
        if (!D().allowsReinforce(player, altro)) {
            return fail('Con ' + altro.name + ' non hai un\'alleanza né un patto di rinforzi: ' +
                'nessuno dei due può marciare in aiuto dell\'altro.');
        }
        const path = E().path(provId);
        if (!path || E().owner(path) !== player.name) return fail('Puoi chiedere aiuto solo per una tua provincia.');
        const inbox = helpInbox(altro);
        if (inbox.some(h => String(h.da) === String(player.id) && String(h.prov) === String(provId))) {
            return fail('Hai già chiesto rinforzi a ' + altro.name + ' per ' + labelOf(provId) + '.');
        }
        inbox.push({
            id: newTradeId(), da: player.id, daNome: player.name,
            prov: provId, turno: R().turn()
        });
        while (inbox.length > HELP_MAX) inbox.shift();
        pushPactNotice(altro, { tipo: 'aiuto', prov: provId, conNome: player.name });
        E().refresh(); E().save();
        return done('Hai chiesto a ' + altro.name + ' rinforzi per ' + labelOf(provId) + '.', { prov: provId });
    }

    // Ritira una richiesta (o la spegne quando il fronte è passato).
    function cancelHelp(player, toId, provId) {
        const altro = R().players().find(p => String(p.id) === String(toId));
        if (!altro) return fail('Regno sconosciuto.');
        const inbox = helpInbox(altro);
        const i = inbox.findIndex(h => String(h.da) === String(player.id) && String(h.prov) === String(provId));
        if (i < 0) return fail('Questa richiesta non c\'è più.');
        inbox.splice(i, 1);
        E().refresh(); E().save();
        return done('Richiesta di rinforzi a ' + altro.name + ' ritirata.', { prov: provId });
    }

    // Le richieste vecchie si spengono a giro finito, come le carovane senza
    // risposta: un grido d'aiuto di mezzo secolo fa non è più una notizia.
    function expireHelpRequests() {
        const turno = R().turn();
        let scadute = 0;
        R().players().forEach(p => {
            const inbox = helpInbox(p);
            for (let i = inbox.length - 1; i >= 0; i--) {
                if (turno - (inbox[i].turno || 0) >= HELP_TTL) { inbox.splice(i, 1); scadute++; }
            }
        });
        return scadute;
    }

    // MARCIARE IN AIUTO invece che addosso (fase 'attacca'). Gli uomini passano
    // all'alleato: entrano nella sua provincia senza cambiarne proprietario né
    // colore, esattamente come nel rinforzo di fine turno (finalMove) — la regola
    // è la stessa, e quindi anche la ventura (§5.3) viaggia con la sua quota.
    function sendReinforcements(player, fromId, toId, n) {
        const turnErr = requirePhase(player, 'attacca'); if (turnErr) return turnErr;
        const from = E().path(fromId), to = E().path(toId);
        if (!from || !to) return fail('Provincia sconosciuta.');
        if (E().owner(from) !== player.name) return fail('I rinforzi partono da una tua provincia.');
        const altro = R().players().find(p => p.name === E().owner(to));
        if (!altro || String(altro.id) === String(player.id)) {
            return fail('I rinforzi si mandano a un ALTRO regno: fra province tue c\'è lo spostamento.');
        }
        if (!D().allowsReinforce(player, altro)) {
            return fail('Puoi marciare in aiuto solo di un alleato (o di chi ti ha concesso i rinforzi).');
        }
        if (!E().areLandAdjacent(fromId, toId)) {
            return fail('I rinforzi passano solo per un confine di terra: ' + R().provinceLabel(to) +
                ' non tocca ' + R().provinceLabel(from) + '.');
        }
        const mobili = spare(from);
        n = Math.floor(n);
        if (!(n > 0)) return fail('Indica quanti soldati mandare.');
        if (!mobili) return garrisonFail(from);
        if (n > mobili) {
            return fail('Da ' + R().provinceLabel(from) + ' possono partire al massimo ' + mobili +
                ': uno resta sempre a presidiare.');
        }
        const room = roomFor(to);
        if (n > room) return fail(R().provinceLabel(to) + ' regge solo altri ' + room + ' soldati.');

        const mercPrima = E().merc(from);
        const mercMossi = mercLeaving(from, n);
        E().addPiece(from, 'soldato', -n);
        E().setMerc(from, mercPrima - mercMossi);
        consumePlaced(player, fromId, n);
        E().addPiece(to, 'soldato', n);
        E().addMerc(to, mercMossi);
        E().redrawProvince(from);
        E().redrawProvince(to);

        // Il fatto diplomatico: chi riceve se lo segna (Diplomacy.standing lo
        // legge come il credito più caro) e lo scopre a inizio turno con la
        // pergamena, come ogni altra notizia d'araldo.
        if (!Array.isArray(altro.aiuti)) altro.aiuti = [];
        altro.aiuti.push({ chi: player.name, prov: toId, uomini: n, turno: R().turn() });
        while (altro.aiuti.length > HELP_MAX * 2) altro.aiuti.shift();
        pushPactNotice(altro, { tipo: 'rinforzi', prov: toId, conNome: player.name, uomini: n });
        // Se erano stati chiesti proprio lì, la richiesta è esaudita.
        const inbox = helpInbox(player);
        for (let i = inbox.length - 1; i >= 0; i--) {
            if (String(inbox[i].da) === String(altro.id) && String(inbox[i].prov) === String(toId)) inbox.splice(i, 1);
        }

        E().refresh(); E().save();
        return done(n + (n === 1 ? ' soldato marcia' : ' soldati marciano') + ' in aiuto di ' + altro.name +
            ' a ' + R().provinceLabel(to) + ': ora sono suoi.', { fromId, toId });
    }

    // Un'alleanza a tempo scaduta si scioglie da sé — GRATIS (niente prestigio):
    // gira a giro completato (endTurn), come expireTrades. Avvisa entrambi.
    function expirePacts() {
        const turno = R().turn();
        const visti = new Set();
        let scadute = 0;
        R().players().forEach(p => {
            pactsMut(p).slice().forEach(pact => {
                if (pact.scad == null || turno < pact.scad) return;
                const chiave = [String(p.id), String(pact.con), pact.tipo].sort().join('|');
                if (visti.has(chiave)) return;
                visti.add(chiave);
                const partner = R().players().find(x => String(x.id) === String(pact.con));
                if (partner) {
                    unbondPact(p, partner, pact.tipo);
                    pushPactNotice(p, { tipo: 'scaduto', patto: pact.tipo, conNome: partner.name });
                    pushPactNotice(partner, { tipo: 'scaduto', patto: pact.tipo, conNome: p.name });
                } else {
                    p.patti = pactsMut(p).filter(x => x !== pact);
                }
                scadute++;
            });
        });
        return scadute;
    }

    // Bersagli d'attacco validi: province adiacenti via terra non tue (§9).
    // `terreno`/`esponente` viaggiano col bersaglio: plancia e bot pronosticano
    // con lo stesso numero che poi userà la battaglia, senza rileggerlo da sé.
    function attackTargets(player, provId) {
        const seen = new Set();
        const card = (p, viaMare, scafo) => {
        const difP = R().players().find(pl => pl.name === E().owner(p));
        // DIPLOMAZIA: se il bersaglio è di un partner di non aggressione, la
        // plancia deve saperlo per chiedere consenso/tradimento invece di
        // attaccare liscio. `alleanza` distingue il patto che costa prestigio.
        const pattoNonAgg = !!(difP && D().grantsNonAggression(player, difP));
        return {
            id: p.id,
            label: R().provinceLabel(p),
            owner: E().owner(p) || 'Neutrale',
            patto: pattoNonAgg,
            alleanza: !!(difP && D().areAllied(player, difP)),
            // ACCESSO MILITARE (§Diplomazia): su questa provincia si può marciare
            // in AIUTO invece che addosso. Viaggia col bersaglio come il terreno,
            // così la plancia offre il secondo bottone senza rifare il conto.
            rinforzabile: !!(difP && D().allowsReinforce(player, difP) && !viaMare),
            consenso: pattoNonAgg && difP ? consentIndex(difP, player.id, p.id) >= 0 : false,
            troops: E().countPiece(p, 'soldato'),
            // Quanti di quei difensori sono di ventura (§5.3): viaggia col
            // bersaglio come il terreno, così plancia e bot pronosticano con lo
            // stesso numero che userà la battaglia.
            merc: E().merc(p),
            fort: GR().defenceBonus(unitsOf([p])),
            terreno: terrainOf(p),
            esponente: terrainExp(p),
            // Come ci si arriva: via terra o con uno sbarco (§9.2). Chi sbarca
            // porta al massimo il carico dello scafo, non tutta la provincia.
            viaMare: !!viaMare,
            // `scafi` = TUTTI i tipi di scafo ancorati qui che ci arrivano: è
            // quello su cui la plancia filtra quando il giocatore ha scelto con
            // che nave partire. `scafo`/`carico` restano il più capiente, che è
            // il default quando nessuno sceglie (i bot).
            scafi: viaMare ? scafo.slice() : [],
            scafo: viaMare ? scafo[scafo.length - 1] : null,
            carico: viaMare ? E().shipCapacity(scafo[scafo.length - 1]) : null
        };
        };

        const out = [];
        E().landNeighbors(provId)
            .map(id => E().path(id))
            .filter(p => p && E().owner(p) !== player.name)
            .forEach(p => { seen.add(p.id); out.push(card(p, false, null)); });

        // Sbarchi: ogni scafo ancorato qui rende limitrofa ogni provincia
        // costiera dentro la sua portata (§9.2). A parità di bersaglio vince lo
        // scafo più capiente, che è quello che ci può portare più uomini.
        const from = E().path(provId);
        if (!from || E().owner(from) !== player.name) return out;
        const hulls = E().ships(from);
        if (!hulls.length) return out;
        // Per ogni bersaglio, TUTTI i tipi di scafo che ci arrivano, ordinati per
        // capienza crescente: l'ultimo è il più capiente e fa da default.
        const best = new Map();
        hulls.forEach(h => {
            const r = E().shipRange(h.tipo);
            if (!(r > 0)) return;
            E().seaReach(provId, r).forEach(id => {
                if (seen.has(id)) return;   // già raggiungibile via terra
                let list = best.get(id);
                if (!list) { list = []; best.set(id, list); }
                if (list.indexOf(h.tipo) < 0) {
                    list.push(h.tipo);
                    list.sort((a, b) => E().shipCapacity(a) - E().shipCapacity(b));
                }
            });
        });
        best.forEach((tipi, id) => {
            const p = E().path(id);
            if (p && E().owner(p) !== player.name) out.push(card(p, true, tipi));
        });
        return out;
    }

    // Lo scafo con cui si può sbarcare a `toId` portando `engaged` uomini.
    // Se il giocatore ne ha scelto uno (`voluto`), è quello e basta: la plancia
    // fa scegliere la nave PRIMA della destinazione, e il motore non deve
    // scavalcare quella scelta. Senza preferenza si prende il MENO capiente che
    // basti, per non sprecare un Veliero dove arriva una Nave (è il caso dei bot).
    function hullForLanding(from, toId, engaged, voluto) {
        let pick = null;
        E().ships(from).forEach(h => {
            if (voluto && h.tipo !== voluto) return;
            const r = E().shipRange(h.tipo);
            if (!(r > 0) || !E().seaReach(from.id, r).has(toId)) return;
            if (E().shipCapacity(h.tipo) < engaged) return;
            if (!pick || E().shipCapacity(h.tipo) < E().shipCapacity(pick.tipo)) pick = h;
        });
        return pick;
    }

    // Attacco (§9): risolve con battle.js e applica l'esito alla mappa.
    // `scafoVoluto` (facoltativo): con che nave si parte, quando è il giocatore a
    // sceglierlo dalla plancia. Senza, il motore prende quella che basta.
    // L'esito di una battaglia applicato alla mappa. Lo chiamano sia l'attacco del
    // giocatore sia lo SBARCO di un editto (decree): la regola di conquista del §9
    // — il difensore perde le truppe, le COSTRUZIONI restano e cambiano soltanto
    // colore — deve vivere in un posto solo, o le due strade divergono al primo
    // ritocco. Non decide la ripartizione dei superstiti (`player.conquista`):
    // quella è dell'attacco via terra, e la sceglie chi chiama.
    // LA FEDE SEGUE LA SPADA (regola dell'utente): chi conquista converte. La
    // provincia presa — nemica o terra di nessuno che sia — prende la confessione
    // ESATTA del conquistatore, cioè la sua religione di stato (quella della sua
    // Capitale, §religione). Vale per ogni regno, non solo per i cristiani: la
    // mappa delle fedi si muove con i confini, in tutte le direzioni. Senza
    // Capitale non c'è religione di stato, quindi non c'è conversione.
    // Sta dentro la regola di conquista perché valga ovunque si conquisti:
    // attacco via terra, sbarco, sbarco d'editto. Restituisce { da, a, label }
    // per chi deve raccontarlo, null se non c'è stata conversione.
    //
    // La fede del conquistatore si legge PRIMA di applicare la conquista: se la
    // provincia presa ospita la Capitale del difensore, quella resta in piedi
    // (le costruzioni non si radono) e cambia colore — cioè da quel momento
    // `stateReligionOf` potrebbe trovare LEI e leggere la fede del vinto.
    // Il passaggio di mano SENZA battaglia (un editto che assegna o consegna una
    // provincia). La regola della fede è la stessa della conquista — non può
    // esserci una porta di servizio da cui una provincia cambia padrone senza
    // cambiare fede: al giro dopo syncConquestFaiths troverebbe una provincia
    // agganciata alla corona sbagliata, o non agganciata affatto. "nuovo" null =
    // torna terra di nessuno: si scioglie il vincolo e la provincia torna
    // soggetta agli scismi come ogni altra neutrale.
    // La fede del nuovo padrone si legge PRIMA del passaggio di mano (stesso
    // motivo di applyBattleOutcome): se la provincia che cambia mano ospita una
    // Capitale, un attimo dopo getCapitalPathFor troverebbe QUELLA e leggerebbe
    // la fede sbagliata.
    function handOver(nuovo, to, fede) {
        if (!nuovo) { E().setReligionLock(to, false); return null; }
        const conv = convertOnConquest(nuovo, to, fede);
        if (fede) E().setReligionLock(to, true);
        return conv;
    }

    function convertOnConquest(winner, to, fede) {
        if (typeof Religions === 'undefined' || !fede) return null;
        const prima = E().religion(to);
        if (prima === fede) return null;
        E().setReligion(to, fede);
        return { da: prima || null, a: fede, label: Religions.label(fede) };
    }

    // ---------- LA VENDETTA (rancore) ----------
    // Un regno non dimentica chi gli ha strappato una provincia che CONTAVA. Il
    // torto si registra qui — l'unico punto in cui una provincia cambia padrone —
    // sul record del regno DERUBATO, e il bot lo rilegge per tornare a bussare
    // dov'è stato colpito (js/bot.js, grudgeAgainst). Una provincia spoglia non
    // entra nel rancore: la vendetta è per il prezioso o lo strategico (regola
    // dell'utente), quindi il peso misura QUANTO brucia perderla.
    const GRUDGE_MAX = 8;
    function grudgeWorth(to) {
        if (E().countPiece(to, 'capitale') > 0) return 3;          // il torto massimo
        if (E().countPiece(to, 'citta') > 0 || E().countPiece(to, 'fortezza') > 0) return 2;
        if (R().resourceKeyOf && R().resourceKeyOf(to)) return 1;  // una risorsa collegabile
        return 0;
    }
    // Va chiamata PRIMA di cambiare proprietario/costruzioni: legge la provincia
    // com'era del difensore (una Capitale ancora Capitale, non già declassata).
    function recordGrudge(defender, to, aggressor) {
        if (!defender) return;                                     // nessuno da vendicare (neutrale)
        const peso = grudgeWorth(to);
        if (!peso) return;
        if (!Array.isArray(defender.rancore)) defender.rancore = [];
        defender.rancore = defender.rancore.filter(g => g.prov !== to.id);   // un rancore per provincia
        defender.rancore.push({ prov: to.id, chi: aggressor, peso, turno: R().turn() });
        while (defender.rancore.length > GRUDGE_MAX) defender.rancore.shift();
    }
    function clearGrudge(winner, provId) {
        if (winner && Array.isArray(winner.rancore) && winner.rancore.length) {
            winner.rancore = winner.rancore.filter(g => g.prov !== provId);  // ripresa: torto saldato
        }
    }

    // ---------- LE ARMI CHE HAI SUBITO (aggressioni) ----------
    // Il RANCORE è il registro dei BOT e tiene solo le prede grosse: una
    // provincia spoglia non muove la loro vendetta. La DIPLOMAZIA invece ha
    // bisogno di tutto (regola dell'utente: "se ci sono stati tentativi di
    // attacchi, invasioni o conquiste passate"), perché un attacco RESPINTO non
    // toglie niente dalla mappa ma cambia per sempre come guardi quel vicino.
    // Quindi due registri, e non uno solo allargato: hanno due lettori diversi e
    // due criteri diversi. Questo vive sul record di chi l'ha SUBITO, come il
    // rancore, e lo legge Diplomacy.standing.
    const AGGRO_MAX = 24;
    function recordAggression(defender, to, aggressorName, esito) {
        if (!defender) return;                                   // neutrale: non ha memoria
        if (!Array.isArray(defender.aggressioni)) defender.aggressioni = [];
        defender.aggressioni.push({
            chi: aggressorName, prov: to.id, esito,
            peso: grudgeWorth(to), turno: R().turn()
        });
        while (defender.aggressioni.length > AGGRO_MAX) defender.aggressioni.shift();
    }

    // `mercIn` = quanti dei superstiti che entrano nella provincia presa sono di
    // ventura (§5.3). La ventura del difensore la si legge qui: se perde tutto
    // sparisce con lui, se regge perde i suoi caduti per primi.
    function applyBattleOutcome(winner, to, res, defTroops, mercIn) {
        const fedeVincitore = R().stateReligionOf ? R().stateReligionOf(winner) : null;
        const mercDif = E().merc(to);
        // CONQUISTA DI UNA CAPITALE NEMICA (§Capitale): si legge PRIMA delle
        // mutazioni, quando `to` è ancora del difensore, se la provincia presa
        // ospita una Capitale e se il vincitore ne ha già una propria altrove.
        const hadEnemyCapital = res.attackerWins && E().countPiece(to, 'capitale') > 0;
        const ownCapBefore = hadEnemyCapital ? R().getCapitalPathFor(winner) : null;
        if (res.attackerWins) {
            E().addPiece(to, 'soldato', -defTroops);
            const defender = R().players().find(p => p.name === E().owner(to));
            // Il torto si segna col difensore ancora proprietario (la Capitale non
            // è ancora declassata), e riprendendosi la provincia il vecchio
            // rancore del vincitore per quella terra si spegne.
            recordGrudge(defender, to, winner.name);
            clearGrudge(winner, to.id);
            if (defender && defender.temporanei) delete defender.temporanei[to.id];
            E().setOwner(to, winner.name);
            E().addPiece(to, 'soldato', res.attackerSurvivors);
            // La ventura della provincia adesso è solo quella arrivata: quella del
            // difensore è caduta con lui, e i suoi contratti non passano di mano.
            E().setMerc(to, Math.max(0, mercIn || 0));
            E().setArmyColor(to, winner.color);
            pruneRoadsTouching(to.id);
            const conv = convertOnConquest(winner, to, fedeVincitore);
            // La provincia è ora del vincitore: la sua fede resta quella del regno
            // anche dopo gli scismi futuri (§la fede segue la spada). Vale su OGNI
            // conquista, pure quando la fede non cambia (già dello stesso credo):
            // il vincolo protegge comunque dallo scisma. Se il vincitore non ha
            // religione di stato non c'è fede da fissare.
            if (fedeVincitore) E().setReligionLock(to, true);
            // Se il vincitore aveva già una Capitale, la presa NON può restare una
            // seconda Capitale (getCapitalPathFor ne vuole una sola): default sicuro
            // = declassata a Città, e si offre al giocatore (non ai bot) la
            // promozione opzionale a Capitale ufficiale. Se il vincitore non ne
            // aveva, la presa resta la sua prima Capitale: adozione automatica.
            if (hadEnemyCapital && ownCapBefore) {
                E().addPiece(to, 'capitale', -E().countPiece(to, 'capitale'));
                E().addPiece(to, 'citta', 1);
                E().redrawProvince(to);
                if (!winner.bot) winner.capitalePresa = { toId: to.id };
            }
            return conv;
        }
        const caduti = defTroops - res.defenderSurvivors;
        E().addPiece(to, 'soldato', -caduti);
        E().setMerc(to, mercDif - caduti);   // i mercenari cadono per primi
        return null;
    }

    function attack(player, fromId, toId, engaged, rng, scafoVoluto, tradimento) {
        const turnErr = requirePhase(player, 'attacca'); if (turnErr) return turnErr;
        const from = E().path(fromId), to = E().path(toId);
        if (!from || !to) return fail('Provincia sconosciuta.');
        if (E().owner(from) !== player.name) return fail('Puoi attaccare solo da una tua provincia.');
        if (E().owner(to) === player.name) return fail('Non puoi attaccare te stesso.');
        // NON AGGRESSIONE (§Diplomazia): con chi hai un patto di non aggressione
        // (alleanza, alleanza a tempo o non belligeranza) non ci si attacca —
        // salvo tre vie: il suo CONSENSO a colpire QUESTA provincia (permesso
        // una-tantum, non rompe il patto), oppure TRADIRE apposta (rompe TUTTI i
        // patti con lui; se c'era un'alleanza costa −2 prestigio). Senza consenso
        // né flag l'attacco si rifiuta, così non parte per sbaglio. Vale anche
        // per i bot: chiamano attack senza flag, quindi restano fedeli finché
        // bot.js non decide apposta di tradire.
        const difRegno = R().players().find(p => p.name === E().owner(to));
        const pattoNonAgg = !!(difRegno && D().grantsNonAggression(player, difRegno));
        const consenso = pattoNonAgg && difRegno ? consentIndex(difRegno, player.id, toId) >= 0 : false;
        if (pattoNonAgg && !consenso && !tradimento) {
            return fail('Hai un patto con ' + difRegno.name + ': serve il suo consenso per colpire ' +
                R().provinceLabel(to) + ', oppure devi tradire (rompe il patto' +
                (D().areAllied(player, difRegno) ? ', −' + D().BREAK_PRESTIGE + ' prestigio' : '') + ').');
        }
        // ATTACCO DI TERRA o SBARCO (§9.2). Se le due province non confinano, si
        // cerca uno scafo che copra la distanza: è lui a rendere `to` limitrofa.
        const viaMare = !E().areLandAdjacent(fromId, toId);
        let scafo = null;
        if (viaMare) {
            const raggiungibile = E().ships(from).some(h => {
                if (scafoVoluto && h.tipo !== scafoVoluto) return false;
                const r = E().shipRange(h.tipo);
                return r > 0 && E().seaReach(fromId, r).has(toId);
            });
            if (!raggiungibile) {
                return fail('Le due province non confinano via terra e nessuna tua nave arriva fin lì.');
            }
        }

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

        // Lo sbarco ha un secondo tetto: il CARICO dello scafo (§9.2). È questo,
        // più del raggio, a impedire di rovesciare un'armata oltremare in un turno.
        if (viaMare) {
            scafo = hullForLanding(from, toId, engaged, scafoVoluto);
            if (!scafo) {
                const capienza = E().ships(from)
                    .filter(h => (!scafoVoluto || h.tipo === scafoVoluto))
                    .filter(h => { const r = E().shipRange(h.tipo); return r > 0 && E().seaReach(fromId, r).has(toId); })
                    .reduce((m, h) => Math.max(m, E().shipCapacity(h.tipo)), 0);
                return fail('Nessuna nave può portare ' + engaged + ' uomini fin lì: al massimo ' +
                    capienza + ' per sbarco.');
            }
        }

        const defTroops = E().countPiece(to, 'soldato');
        const fort = GR().defenceBonus(unitsOf([to]));
        const difensore = E().owner(to) || 'Neutrale';
        const fromLabel = R().provinceLabel(from), toLabel = R().provinceLabel(to);
        // Si combatte in casa del difensore: il terreno è il suo (§9).
        const terreno = terrainOf(to);
        // VENTURA (§5.3): parte la quota proporzionale della provincia, e il
        // difensore mette in campo la sua. Si contano PRIMA di muovere i soldati.
        const mercPrima = E().merc(from);
        const mercImp = mercLeaving(from, engaged);
        const mercDif = E().merc(to);
        const res = RisikoBattle.resolveBattle(engaged, defTroops, fort, rng, terrainExp(to),
            mercImp, mercDif);
        if (!res) return fail('Nessuna battaglia possibile.');

        // IL PATTO si scioglie QUI, non prima: solo ora l'attacco è certo (tutto
        // validato, battaglia risolta). Col CONSENSO del proprietario si consuma
        // il permesso una-tantum e il patto resta; senza, è un TRADIMENTO che
        // rompe ogni patto col difensore (−2 prestigio se c'era un'alleanza) e
        // avvisa il tradito. Il save di questa attack in coda copre tutto (silent).
        if (pattoNonAgg && difRegno) {
            const ci = consentIndex(difRegno, player.id, toId);
            if (ci >= 0) difRegno.permessiAttacco.splice(ci, 1);
            else breakPact(player, difRegno.id, null, { tradimento: true, silent: true });
        }

        // L'ATTO DI GUERRA SI REGISTRA COMUNQUE VADA (§Diplomazia): la provincia
        // si legge ora, ancora del difensore e con le sue costruzioni in piedi,
        // così `peso` dice quanto valeva davvero. Vinto o respinto, il vicino se
        // lo ricorda — è la differenza fra il rancore (che vuole le prede grosse,
        // per i bot) e il rapporto diplomatico (che conta ogni colpo portato).
        recordAggression(difRegno, to, player.name, res.attackerWins ? 'presa' : 'respinto');

        // Le truppe impegnate lasciano comunque la provincia di partenza.
        E().addPiece(from, 'soldato', -engaged);
        E().setMerc(from, mercPrima - mercImp);
        consumePlaced(player, fromId, engaged);

        // Chi cade è di ventura per primo: dei mercenari partiti arrivano a
        // destinazione solo quelli che avanzano dopo le perdite del vincitore.
        // Se l'attacco fallisce non arriva nessuno — sono morti tutti con gli altri.
        const mercArrivati = res.attackerWins ? Math.max(0, mercImp - res.losses) : 0;

        // LO SBARCO È LA NAVE STESSA (§9.2): lo scafo lascia la sua provincia e
        // approda in quella attaccata, comunque vada. Non si torna indietro —
        // o si conquista, o si perdono uomini E nave. Chi possiede la provincia
        // possiede le navi che ci stanno: se l'assalto fallisce lo scafo è già
        // sulla spiaggia del difensore, e diventa suo senza bisogno di dirlo.
        if (viaMare && scafo) {
            E().removeShip(from, scafo.tipo);
            E().addShip(to, scafo.tipo, 0);
        }

        let msg;
        let conversione = null;
        // RITIRATA (§9): in una disfatta di TERRA i superstiti non muoiono più
        // tutti — ripiegano sulla provincia di partenza, mercenari compresi (le
        // perdite hanno colpito prima la ventura). Lo sbarco resta totale (§9.2):
        // chi non conquista la spiaggia è perduto con la nave, niente ritorno.
        const superstitiRitorno = (!res.attackerWins && !viaMare) ? res.attackerSurvivors : 0;
        const mercRitorno = superstitiRitorno > 0
            ? Math.max(0, mercImp - (engaged - superstitiRitorno)) : 0;
        if (res.attackerWins) {
            conversione = applyBattleOutcome(player, to, res, defTroops, mercArrivati);

            // I superstiti entrano tutti nella provincia presa, ma la ripartizione
            // vera la decide il giocatore in fase di conquista (resolveConquest):
            // finché `player.conquista` è aperta nessun'altra azione passa. Con un
            // solo superstite non c'è niente da scegliere e si chiude subito.
            //
            // LO SBARCO È TOTALE (§9.2): chi scende dalla nave resta a terra, non
            // esiste il drappello che si reimbarca a fine battaglia. Chi vuole
            // riportare indietro degli uomini lo fa con lo spostamento di fine
            // turno, usando la nave come mezzo di trasporto — che è una scelta
            // successiva e visibile, non un ripensamento dentro l'assalto.
            player.conquista = (!viaMare && res.attackerSurvivors > 1)
                ? { fromId, toId, superstiti: res.attackerSurvivors }
                : null;

            msg = (viaMare ? 'Sbarco riuscito a ' : 'Conquistata ') + R().provinceLabel(to) + ': ' +
                res.attackerSurvivors + (res.attackerSurvivors === 1 ? ' superstite' : ' superstiti') +
                ' (' + res.losses + ' caduti). Le costruzioni restano, ora sono tue.' +
                (viaMare ? ' La nave è ora ancorata lì: la prossima portata si misura da quella costa.' : '') +
                (conversione ? ' La provincia si converte alla tua fede: ' + conversione.label + '.' : '');
        } else {
            applyBattleOutcome(player, to, res, defTroops, 0);
            if (superstitiRitorno > 0) {
                E().addPiece(from, 'soldato', superstitiRitorno);
                if (mercRitorno > 0) E().addMerc(from, mercRitorno);
            }
            const caduti = engaged - superstitiRitorno;
            msg = superstitiRitorno > 0
                ? R().provinceLabel(to) + ' ha retto: ' + superstitiRitorno +
                  (superstitiRitorno === 1 ? ' superstite ripiega' : ' superstiti ripiegano') +
                  ' su ' + R().provinceLabel(from) + ' (' + caduti +
                  (caduti === 1 ? ' caduto' : ' caduti') + '), al difensore restano ' +
                  res.defenderSurvivors + '.'
                : R().provinceLabel(to) + ' ha retto: le ' + engaged +
                  ' truppe impegnate sono perdute' + (viaMare ? ' con la nave' : '') +
                  ', al difensore restano ' + res.defenderSurvivors + '.';
            if (viaMare) {
                msg += ' La ' + (scafo.tipo === 'vascello' ? 'nave da guerra' : 'nave') +
                    ' è finita in mano al difensore.';
            }
        }

        E().redrawProvince(from);
        E().redrawProvince(to);
        E().redrawRoads();
        E().refresh();
        E().save();

        // Il conto dei caduti in chiaro: la UI non deve ricavarlo da sé.
        // Vince l'attaccante → il difensore perde tutto; vince il difensore →
        // l'attaccante perde tutte le truppe impegnate (§9).
        const perditeAttaccante = res.attackerWins ? res.losses : (engaged - superstitiRitorno);
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
            conversione,
            battle: res, engaged, defTroops, fort, terreno,
            // Ventura in campo (§5.3): quanti per parte e quanti ne sono arrivati.
            mercImpegnati: mercImp, mercDifensore: mercDif, mercArrivati,
            viaMare, scafo: viaMare && scafo ? scafo.tipo : null,
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

    // ========== SPEDIZIONI OLTREMARE (§9.2, rotte lunghe) ==========
    // Un Veliero può salpare per una ROTTA lunga: sceglie una DIREZIONE (uno degli
    // 8 punti cardinali), imbarca un carico e prende il mare aperto. NON sbarca nel
    // turno stesso — a ogni proprio turno avanza di una portata piena (SeaRoutes),
    // scoprendo le coste che gli entrano nel raggio, finché il giocatore non decide
    // di approdare su una terra avvistata. È una scoperta: non si sa dove si arriva.
    // Le portate del §9.2 lasciano fuori mezzo mondo a un Veliero fermo; la rotta
    // lunga è il modo di attraversare un oceano, un decennio per volta.
    const EXPED_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const EXPED_DIR_LABEL = {
        N: 'Nord', NE: 'Nord-Est', E: 'Est', SE: 'Sud-Est',
        S: 'Sud', SW: 'Sud-Ovest', W: 'Ovest', NW: 'Nord-Ovest'
    };

    // NAUFRAGI E MORÌA IN MARE APERTO (regola dell'utente): più a lungo una
    // spedizione resta al largo, più il mare la logora. A `t` turni di
    // navigazione si tira r∈[0,1) e muore il 10%·L della ciurma, con
    // L = max(0, t − ⌊r/0.15⌋). La tabella che ne esce è esattamente quella
    // voluta — ogni turno in più aggiunge una fascia di gravità E alza le
    // probabilità di quelle già esistenti:
    //   t=1 → 15% perde il 10%
    //   t=2 → 30% perde il 10%, 15% perde il 20%
    //   t=3 → 45% perde il 10%, 30% perde il 20%, 15% perde il 30%
    //   … (a 7 turni la perdita è ormai certa: il mare non perdona le rotte lunghe)
    // Le perdite colpiscono i MERCENARI per primi (§5.3), come in battaglia; se
    // portano via tutta la ciurma è il naufragio, e la spedizione sparisce.
    const WRECK_STEP = 0.15;    // ampiezza di una fascia di probabilità
    const WRECK_TOLL = 0.10;    // quota di ciurma che porta via una fascia

    function wreckTollFraction(turniInMare, rng) {
        const roll = (rng ? rng() : Math.random());
        const L = Math.max(0, turniInMare - Math.floor(roll / WRECK_STEP));
        return Math.min(1, L * WRECK_TOLL);
    }

    // Salpa: un Veliero ancorato in `fromId` lascia la costa con `carico` uomini e
    // punta verso `dir`. Consuma la fase attacco come un attacco qualsiasi.
    function launchExpedition(player, fromId, dir, carico) {
        const turnErr = requirePhase(player, 'attacca'); if (turnErr) return turnErr;
        const from = E().path(fromId);
        if (!from) return fail('Provincia sconosciuta.');
        if (E().owner(from) !== player.name) return fail('Puoi salpare solo da una tua provincia.');
        if (EXPED_DIRS.indexOf(dir) < 0) return fail('Direzione di rotta non valida.');
        // La rotta lunga è solo del Veliero (§9.2): serve uno scafo ancorato qui.
        if (!E().ships(from).some(h => h.tipo === 'vascello')) {
            return fail('Serve un Veliero ancorato qui per una spedizione oltremare.');
        }
        // Da dove prende il mare: l'approdo in acqua libera della provincia.
        const ancora = E().seaAnchor(fromId);
        if (!ancora) return fail(R().provinceLabel(from) + ' non ha uno sbocco sul mare aperto.');

        const cap = E().shipCapacity('vascello');
        carico = Math.floor(carico);
        const partenti = spare(from);            // il presidio minimo resta (§5)
        if (!(carico > 0)) return fail('Indica quanti uomini imbarcare.');
        if (!partenti) return garrisonFail(from);
        const tetto = Math.min(partenti, cap);
        if (carico > tetto) {
            return fail('Il Veliero porta al massimo ' + tetto +
                (tetto === 1 ? ' uomo' : ' uomini') + ' da qui (carico ' + cap +
                ', presidio minimo a parte).');
        }

        // Uomini e nave lasciano la provincia: da ora vivono nella spedizione, in
        // mare aperto. La ventura parte in quota proporzionale, come in un attacco.
        const mercPrima = E().merc(from);
        const mercImb = mercLeaving(from, carico);
        E().addPiece(from, 'soldato', -carico);
        E().setMerc(from, mercPrima - mercImb);
        consumePlaced(player, fromId, carico);
        E().removeShip(from, 'vascello');

        if (!Array.isArray(player.spedizioni)) player.spedizioni = [];
        const id = 'sp' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
        player.spedizioni.push({
            id, dir, carico, merc: mercImb,
            x: ancora.x, y: ancora.y, turno: R().turn()
        });

        E().redrawProvince(from);
        E().refresh();
        E().save();
        return done('Spedizione salpata da ' + R().provinceLabel(from) + ' verso ' +
            EXPED_DIR_LABEL[dir] + ' con ' + carico + (carico === 1 ? ' uomo' : ' uomini') +
            '. Navigherà di turno in turno alla ricerca di una costa: approda quando ne avvisti una.',
            { prov: fromId });
    }

    // Le coste che una spedizione avvista adesso (entro la portata del Veliero dalla
    // sua posizione): dove può approdare. `mia` = costa propria (rinforzo, niente
    // battaglia); le altre sono uno sbarco d'assalto col terreno del difensore (§9).
    function expeditionTargets(player, exp) {
        const out = [];
        if (!exp) return out;
        const r = E().shipRange('vascello');
        E().reachFromPoint(exp.x, exp.y, r).forEach(id => {
            const p = E().path(id);
            if (!p) return;
            const mia = E().owner(p) === player.name;
            out.push({
                id, label: R().provinceLabel(p),
                owner: E().owner(p) || 'Neutrale',
                troops: E().countPiece(p, 'soldato'),
                merc: E().merc(p),
                fort: GR().defenceBonus(unitsOf([p])),
                terreno: terrainOf(p),
                esponente: terrainExp(p),
                mia
            });
        });
        return out;
    }

    // Cambia la rotta di una spedizione in mare (senza avanzare): il giocatore
    // corregge la direzione quando ciò che ha scoperto non è dove voleva andare.
    function steerExpedition(player, expId, dir) {
        const turnErr = requirePhase(player, 'attacca'); if (turnErr) return turnErr;
        if (EXPED_DIRS.indexOf(dir) < 0) return fail('Direzione di rotta non valida.');
        const exp = (player.spedizioni || []).find(s => s.id === expId);
        if (!exp) return fail('Spedizione non trovata.');
        exp.dir = dir;
        E().save();
        return done('La spedizione punta ora verso ' + EXPED_DIR_LABEL[dir] + '.');
    }

    // Approdo: la spedizione scende sulla costa avvistata `toId`. Su costa PROPRIA
    // è un rinforzo (si sbarca e la nave ancora); altrove è uno sbarco d'assalto
    // TOTALE (§9.2), stessa regola di conquista di `attack`. La nave e gli uomini
    // lasciano il mare comunque vada: vinta approda sulla costa presa, persa è
    // perduta col carico. La spedizione si consuma in entrambi i casi.
    function expeditionLand(player, expId, toId, rng) {
        const turnErr = requirePhase(player, 'attacca'); if (turnErr) return turnErr;
        const exp = (player.spedizioni || []).find(s => s.id === expId);
        if (!exp) return fail('Spedizione non trovata.');
        const to = E().path(toId);
        if (!to) return fail('Provincia sconosciuta.');
        const r = E().shipRange('vascello');
        if (!E().reachFromPoint(exp.x, exp.y, r).has(toId)) {
            return fail('La spedizione non ha ancora avvistato quella costa.');
        }
        const carico = exp.carico;
        const mercImp = Math.min(exp.merc || 0, carico);
        const dropExp = () => { player.spedizioni = (player.spedizioni || []).filter(s => s.id !== expId); };

        // APPRODO SU COSTA PROPRIA: nessuna battaglia, si sbarca e la nave ancora.
        if (E().owner(to) === player.name) {
            E().addPiece(to, 'soldato', carico);
            if (mercImp > 0) E().addMerc(to, mercImp);
            E().addShip(to, 'vascello', 0);
            dropExp();
            E().redrawProvince(to); E().refresh(); E().save();
            return done('La spedizione approda a ' + R().provinceLabel(to) + ': ' + carico +
                (carico === 1 ? ' uomo sbarca' : ' uomini sbarcano') + ' e la nave getta l\'ancora.',
                { prov: toId, fromId: toId, toId });
        }

        // SBARCO D'ASSALTO (§9.2, totale): si combatte in casa del difensore, col
        // suo terreno e le sue strutture. Stessa regola di conquista di `attack`.
        const defTroops = E().countPiece(to, 'soldato');
        const fort = GR().defenceBonus(unitsOf([to]));
        const difensore = E().owner(to) || 'Neutrale';
        const toLabel = R().provinceLabel(to);
        const terreno = terrainOf(to);
        const mercDif = E().merc(to);
        const res = RisikoBattle.resolveBattle(carico, defTroops, fort, rng, terrainExp(to), mercImp, mercDif);
        if (!res) return fail('Nessuna battaglia possibile.');
        const mercArrivati = res.attackerWins ? Math.max(0, mercImp - res.losses) : 0;

        // La spedizione si consuma comunque: la nave lascia il mare, vinta o persa.
        dropExp();

        let msg, conversione = null;
        if (res.attackerWins) {
            conversione = applyBattleOutcome(player, to, res, defTroops, mercArrivati);
            // Lo sbarco è totale (§9.2): i superstiti restano tutti a terra, niente
            // fase di conquista. La nave ancora sulla costa presa.
            E().addShip(to, 'vascello', 0);
            msg = 'Spedizione approdata a ' + toLabel + ': ' + res.attackerSurvivors +
                (res.attackerSurvivors === 1 ? ' superstite conquista' : ' superstiti conquistano') +
                ' la costa (' + res.losses + ' caduti). Le costruzioni restano, ora sono tue.' +
                (conversione ? ' La provincia si converte alla tua fede: ' + conversione.label + '.' : '');
        } else {
            applyBattleOutcome(player, to, res, defTroops, 0);
            msg = toLabel + ' ha retto: la spedizione è perduta con la nave e tutti gli uomini a bordo, ' +
                'al difensore restano ' + res.defenderSurvivors + '.';
        }

        E().redrawProvince(to);
        E().redrawRoads();
        E().refresh();
        E().save();

        const eco = root.Chronicle && root.Chronicle.battleEcho
            ? root.Chronicle.battleEcho([toLabel], R().turn()) : null;
        if (eco) { eco.colore = player.color; eco.id = toId; }

        const perditeAttaccante = res.attackerWins ? res.losses : carico;
        const perditeDifensore = res.attackerWins ? defTroops : (defTroops - res.defenderSurvivors);
        return done(msg, {
            cronaca: eco, conversione,
            battle: res, engaged: carico, defTroops, fort, terreno,
            mercImpegnati: mercImp, mercDifensore: mercDif, mercArrivati,
            viaMare: true, scafo: 'vascello', spedizione: true,
            // Niente provincia di partenza: la spedizione veniva dal mare aperto.
            // toId è la costa presa (ora visibile), quindi la nebbia (§3) la mostra.
            fromId: null, toId, fromLabel: 'Spedizione', toLabel,
            attaccante: player.name, difensore,
            coloreAttaccante: player.color,
            coloreDifensore: (R().players().find(p => p.name === difensore) || {}).color || null,
            perditeAttaccante, perditeDifensore,
            superstiti: res.attackerWins ? res.attackerSurvivors : res.defenderSurvivors,
            conquistata: res.attackerWins, richiedeConquista: false
        });
    }

    // A ogni proprio turno le spedizioni in mare avanzano di una portata piena
    // verso la loro rotta, seguendo l'acqua (§9.2). Chiamata da beginTurn: così la
    // nave si muove nell'intervallo fra un turno e l'altro e il giocatore, aprendo
    // il suo, la ritrova più avanti con nuove coste in vista.
    function advanceExpeditions(player, rng) {
        if (!Array.isArray(player.spedizioni) || !player.spedizioni.length) return;
        const r = E().shipRange('vascello');
        const superstiti = [];
        player.spedizioni.forEach(exp => {
            // Un altro turno in mare: prima il pedaggio del mare, poi la rotta.
            exp.turniInMare = (exp.turniInMare || 0) + 1;
            const morti = Math.round((exp.carico || 0) * wreckTollFraction(exp.turniInMare, rng));
            if (morti > 0) {
                const mercMorti = Math.min(exp.merc || 0, morti);
                exp.merc = Math.max(0, (exp.merc || 0) - mercMorti);   // la ventura cade per prima
                exp.carico = Math.max(0, exp.carico - morti);
                if (exp.carico <= 0) {
                    // NAUFRAGIO: nave e ciurma inghiottiti dal mare aperto.
                    wreckNotice(player, { tipo: 'totale', morti, turniInMare: exp.turniInMare, dir: exp.dir });
                    return;   // fuori dai superstiti: la spedizione non esiste più
                }
                wreckNotice(player, { tipo: 'parziale', morti, turniInMare: exp.turniInMare, dir: exp.dir });
            }
            const next = E().sail(exp.x, exp.y, exp.dir, r);
            if (next && (next.x !== exp.x || next.y !== exp.y)) { exp.x = next.x; exp.y = next.y; }
            superstiti.push(exp);
        });
        player.spedizioni = superstiti;
    }

    // Il naufragio si scopre all'apertura del proprio turno, con la pergamena
    // (player-board.showPendingWrecks): la mappa — e il mare — non cambiano mai di
    // nascosto. Coda potata come gli editti, così un regno che non apre la plancia
    // non si trascina dietro cinquanta avvisi.
    const WRECK_MAX = 12;
    function wreckNotice(player, info) {
        if (!player) return;
        if (!Array.isArray(player.spedizioniAvvisi)) player.spedizioniAvvisi = [];
        player.spedizioniAvvisi.push(Object.assign({ letto: false, turno: R().turn() }, info));
        while (player.spedizioniAvvisi.length > WRECK_MAX) player.spedizioniAvvisi.shift();
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
                // Chi torna indietro si porta la sua quota di ventura (§5.3).
                const mercPrima = E().merc(to);
                const mercTorna = mercLeaving(to, k);
                E().addPiece(to, 'soldato', -k);
                E().setMerc(to, mercPrima - mercTorna);
                putSoldiers(player, from, k);
                E().addMerc(from, mercTorna);
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
            (indietro ? ', ' + indietro + ' rientrano in ' + c.fromLabel + '.' : '.'),
            { fromId: c.fromId, toId: c.toId });
    }

    // ---------- fase di spostamento (uno solo per turno) ----------
    // Si sposta fra due province PROPRIE unite da una catena ininterrotta di
    // province proprie: è il classico "riposizionamento" del Risiko, non un
    // teletrasporto. Almeno 1 soldato resta sempre a presidiare la partenza.

    // Lo spostamento avviene fra due province CONFINANTI (regola dell'utente):
    // non più a catena attraverso le province proprie, ma un solo confine di
    // terra. Qui le mete valide di `fromId`: i vicini di terra che sono tuoi.
    function ownAdjacent(player, fromId) {
        const owned = new Set(E().ownedPaths(player.name).map(p => p.id));
        if (!owned.has(fromId)) return new Set();
        return new Set(E().landNeighbors(fromId).filter(id => owned.has(id)));
    }

    function moveTargets(player, fromId) {
        const seen = new Set();
        const card = (p, viaMare, scafi, alleato) => ({
            id: p.id, label: R().provinceLabel(p),
            troops: E().countPiece(p, 'soldato'),
            // Come per gli sbarchi (§9.2): via terra o via nave. Un rinforzo via
            // mare porta al massimo il CARICO dello scafo, oltre al presidio (§5).
            viaMare: !!viaMare,
            alleato: !!alleato,
            scafi: viaMare ? scafi.slice() : [],
            scafo: viaMare ? scafi[scafi.length - 1] : null,
            carico: viaMare ? E().shipCapacity(scafi[scafi.length - 1]) : null
        });

        // Chi può RICEVERE rinforzi da me (§Diplomazia, privilegio 'rinforzi', che
        // l'alleanza comprende), per nome di regno. La risposta si chiede una volta
        // sola: la portata di un Veliero tocca decine di province, e cercare il
        // record del proprietario per ognuna rifarebbe cento volte lo stesso giro.
        const allyMemo = new Map();
        const canReinforce = (owner) => {
            if (!owner || owner === player.name) return false;
            if (allyMemo.has(owner)) return allyMemo.get(owner);
            const altro = R().players().find(pl => pl.name === owner);
            const ok = !!(altro && D().allowsReinforce(player, altro));
            allyMemo.set(owner, ok);
            return ok;
        };

        const out = [];
        // Via terra: le CONFINANTI mie (requisito dell'utente: un solo confine).
        ownAdjacent(player, fromId).forEach(id => {
            const p = E().path(id);
            if (p) { seen.add(id); out.push(card(p, false, null)); }
        });

        // CORRIDOIO (§Diplomazia, privilegio 'rinforzi' — o un'alleanza, che lo
        // comprende): si possono INVIARE rinforzi a una provincia ALLEATA
        // confinante via terra. I soldati diventano suoi, ad aiutarlo a tenere il
        // fronte: è un rinforzo, non una conquista. La meta porta `alleato:true`.
        E().landNeighbors(fromId).forEach(id => {
            if (seen.has(id)) return;
            const p = E().path(id);
            if (!p) return;
            if (!canReinforce(E().owner(p))) return;
            seen.add(id);
            out.push(card(p, false, null, true));
        });

        // Via mare: con una nave ancorata qui si rinforza una costiera entro
        // portata (regola dell'utente, il caso tipico è dopo uno sbarco: la nave
        // è ora sulla costa presa e riparte da lì). È un rinforzo, non un
        // attacco — la meta dev'essere già TUA, oppure di un ALLEATO che ti ha
        // aperto il corridoio (§Diplomazia): il mare è la via naturale per
        // soccorrere chi non confina con te. A parità di meta si tengono tutti
        // gli scafi che ci arrivano, il più capiente fa da default.
        const from = E().path(fromId);
        if (from && E().owner(from) === player.name) {
            const best = new Map();
            E().ships(from).forEach(h => {
                const r = E().shipRange(h.tipo);
                if (!(r > 0)) return;
                E().seaReach(fromId, r).forEach(id => {
                    if (seen.has(id)) return;                       // già confinante via terra
                    const p = E().path(id);
                    if (!p) return;
                    const owner = E().owner(p);
                    const mia = owner === player.name;
                    if (!mia && !canReinforce(owner)) return;       // mie, o dell'alleato
                    let rec = best.get(id);
                    if (!rec) { rec = { tipi: [], alleato: !mia }; best.set(id, rec); }
                    if (rec.tipi.indexOf(h.tipo) < 0) {
                        rec.tipi.push(h.tipo);
                        rec.tipi.sort((a, b) => E().shipCapacity(a) - E().shipCapacity(b));
                    }
                });
            });
            best.forEach((rec, id) => out.push(card(E().path(id), true, rec.tipi, rec.alleato)));
        }

        return out.sort((a, b) => a.label.localeCompare(b.label));
    }

    // Le province DA CUI si può partire: l'altra metà dello spostamento. Serve
    // alla plancia per accenderle sulla mappa PRIMA che la partenza sia scelta
    // (due clic: partenza, arrivo), così non si resta incollati alla provincia
    // dove è finito l'attacco. Vale se ha uomini oltre il presidio (§5) e almeno
    // una meta: una confinante propria via terra, OPPURE una propria costa che
    // una nave ancorata qui raggiunge (una testa di ponte oltremare parte da qui
    // anche se non confina con nulla di suo).
    function moveOrigins(player) {
        return E().ownedPaths(player.name)
            .filter(p => spare(p) > 0 && moveTargets(player, p.id).length > 0)
            .map(p => ({
                id: p.id, label: R().provinceLabel(p),
                troops: E().countPiece(p, 'soldato'), mobili: spare(p)
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    function finalMove(player, fromId, toId, n, scafoVoluto) {
        const turnErr = requirePhase(player, 'sposta'); if (turnErr) return turnErr;
        if (player.spostamentoFatto) return fail('Lo spostamento di fine turno si fa una volta sola: l\'hai già fatto.');

        const from = E().path(fromId), to = E().path(toId);
        if (!from || !to) return fail('Provincia sconosciuta.');
        if (E().owner(from) !== player.name) return fail('Lo spostamento parte da una tua provincia.');
        if (fromId === toId) return fail('Partenza e arrivo sono la stessa provincia.');

        // La meta è una PROPRIA provincia, oppure — col privilegio 'rinforzi'
        // (§Diplomazia) — un ALLEATO a cui inviare rinforzi (i soldati diventano
        // suoi). All'alleato si arriva per lo stesso paio di strade con cui si
        // raggiunge una provincia propria: il confine di terra, o una nave
        // ancorata alla partenza (regola dell'utente) — un alleato oltremare
        // è proprio quello che ha più bisogno d'essere soccorso.
        const toMine = E().owner(to) === player.name;
        let allyTo = null;
        if (!toMine) {
            allyTo = R().players().find(pl => pl.name === E().owner(to));
            if (!allyTo || !D().allowsReinforce(player, allyTo)) {
                return fail('Lo spostamento avviene fra due province tue, o come rinforzo a un alleato.');
            }
        }

        // Confinano via terra? È uno spostamento normale. Se no (solo fra province
        // proprie), serve una nave ancorata alla partenza che copra la distanza
        // (§9.2): il rinforzo navale dopo uno sbarco. Come per l'attacco,
        // `scafoVoluto` fissa la nave quando è il giocatore a sceglierla; senza, si
        // prende il meno capiente che basti (non si sciupa un Veliero dove arriva
        // una Nave).
        const viaMare = !E().areLandAdjacent(fromId, toId);
        let scafo = null;

        const mobili = spare(from);
        n = Math.floor(n);
        if (!(n > 0)) return fail('Indica quanti soldati spostare.');
        if (!mobili) return garrisonFail(from);

        if (viaMare) {
            scafo = hullForLanding(from, toId, n, scafoVoluto);
            if (!scafo) {
                const arriva = E().ships(from)
                    .filter(h => (!scafoVoluto || h.tipo === scafoVoluto))
                    .filter(h => { const r = E().shipRange(h.tipo); return r > 0 && E().seaReach(fromId, r).has(toId); });
                if (!arriva.length) {
                    return fail(R().provinceLabel(to) + ' non confina con ' + R().provinceLabel(from) +
                        ' e nessuna nave ancorata lì la raggiunge.');
                }
                const capMax = Math.max.apply(null, arriva.map(h => E().shipCapacity(h.tipo)));
                return fail('La nave regge al massimo ' + capMax + ' uomini: riduci il carico.');
            }
        }

        // Tetto: il presidio minimo sempre, e via mare anche il carico dello scafo.
        const tetto = viaMare ? Math.min(mobili, E().shipCapacity(scafo.tipo)) : mobili;
        if (n > tetto) {
            return fail(viaMare
                ? 'La nave porta al massimo ' + tetto + ' uomini da ' + R().provinceLabel(from) + '.'
                : 'Da ' + R().provinceLabel(from) + ' puoi muoverne al massimo ' + tetto +
                  ': uno resta sempre a presidiare.');
        }
        const room = roomFor(to);
        if (n > room) return fail(R().provinceLabel(to) + ' regge solo altri ' + room + ' soldati.');

        // La ventura si sposta con la sua quota, come in un attacco (§5.3).
        const mercPrima = E().merc(from);
        const mercMossi = mercLeaving(from, n);
        E().addPiece(from, 'soldato', -n);
        E().setMerc(from, mercPrima - mercMossi);
        consumePlaced(player, fromId, n);
        if (allyTo) {
            // Rinforzo a un alleato: i soldati (e la loro ventura) diventano SUOI.
            // Si aggiungono senza toccare proprietario né colore della provincia.
            E().addPiece(to, 'soldato', n);
            E().addMerc(to, mercMossi);
        } else {
            putSoldiers(player, to, n);
            E().addMerc(to, mercMossi);
        }
        // La nave viaggia con gli uomini: lascia la partenza e ancora all'arrivo
        // a carico vuoto, come nello sbarco (§9.2). Le navi sono di chi possiede
        // la provincia, quindi basta spostare lo scafo — ed è per questo che in un
        // porto ALLEATO lo scafo non ci resta: ancorarlo là lo regalerebbe. Scarica
        // gli uomini e torna all'ormeggio di partenza.
        if (viaMare && scafo && !allyTo) {
            E().removeShip(from, scafo.tipo);
            E().addShip(to, scafo.tipo, 0);
        }
        E().redrawProvince(from);
        E().redrawProvince(to);
        player.spostamentoFatto = true;

        E().refresh();
        E().save();
        const testa = allyTo
            ? n + (n === 1 ? ' soldato inviato' : ' soldati inviati') + (viaMare ? ' via nave' : '') +
              ' in rinforzo a ' + allyTo.name + ' (' + R().provinceLabel(to) + '): ora sono suoi.' +
              (viaMare ? ' La nave rientra a ' + R().provinceLabel(from) + '.' : '')
            : n + (n === 1 ? ' soldato spostato' : ' soldati spostati') + (viaMare ? ' via nave' : '') +
              ' da ' + R().provinceLabel(from) + ' a ' + R().provinceLabel(to) + '.';
        return done(testa + ' Lo spostamento del turno è speso.', { fromId, toId });
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

    // ---------- EDITTO (intervento dell'admin) ----------
    // L'admin non gioca: crea SITUAZIONI. Un editto sposta truppe, assegna
    // province, versa o toglie oro e scorte — cose che nessuna regola concede a
    // un giocatore — e passa comunque da qui, perché questo resta l'unico punto
    // che muta lo stato. Da lì due cose vengono gratis: l'azione porta `prov` e
    // quindi entra nel registro rispettando la nebbia come tutte le altre, e il
    // regno colpito riceve un AVVISO che gli si srotola davanti all'apertura del
    // suo turno. Il punto è proprio questo: la mappa non cambia di nascosto.
    //
    // Nata per le CROCIATE, che nessun regno cristiano può raggiungere via mare
    // con le portate del §9.2: il giocatore raduna l'esercito, l'admin lo
    // trasporta in Terra Santa "per conto del Papa".

    const DECREE_MAX = 12;      // quanti avvisi si conservano per regno

    function decreeNotice(player, info) {
        if (!player) return;
        if (!Array.isArray(player.editti)) player.editti = [];
        player.editti.push(Object.assign({ letto: false, turno: R().turn() }, info));
        // Non si accumulano all'infinito: un regno che non apre mai la plancia
        // non deve trascinarsi dietro cinquanta pergamene.
        while (player.editti.length > DECREE_MAX) player.editti.shift();
    }

    // Le truppe appartengono a chi possiede la PROVINCIA (come le navi, §9.2):
    // `data-pc-color` è solo la bandiera che si vede. Perciò posare soldati su
    // una provincia altrui non li consegna a nessuno — chi promulga un editto
    // deve saperlo, e la funzione glielo dice invece di far finta di niente.
    function decree(opts) {
        if (!R().isAdmin || !R().isAdmin()) return fail('Solo l\'admin può promulgare un editto.');

        const o = opts || {};
        const players = R().players();
        const target = (o.playerId !== null && o.playerId !== undefined)
            ? players.find(p => p.id === +o.playerId) : null;
        const n = Math.floor(o.n || 0);
        const from = o.fromId ? E().path(o.fromId) : null;
        const to = o.toId ? E().path(o.toId) : null;
        if (o.fromId && !from) return fail('Provincia di partenza sconosciuta.');
        if (o.toId && !to) return fail('Provincia d\'arrivo sconosciuta.');

        const tocchi = [];          // province toccate: servono al registro e alla nebbia
        const avvisati = new Set(); // regni a cui è arrivato l'avviso
        let msg = '';
        let esito = null;           // esito della battaglia, se l'editto è uno sbarco

        if (o.azione === 'truppe') {
            if (n <= 0) return fail('Indica quanti uomini.');
            if (!from && !to) return fail('Indica almeno una provincia.');
            let mossi = n;
            let mercMossi = 0;      // ventura prelevata insieme agli uomini (§5.3)
            if (from) {
                // Anche un editto rispetta il presidio minimo (§5): una provincia
                // non resta mai sguarnita, nemmeno per volere del Papa.
                const disponibili = GR().spendableTroops(E().countPiece(from, 'soldato'));
                mossi = Math.min(n, disponibili);
                if (mossi <= 0) return fail('In ' + R().provinceLabel(from) + ' non ci sono uomini da prelevare (ne resta sempre 1 di presidio).');
                // Nemmeno il Papa sceglie chi imbarcare: parte la quota che c'è.
                const mercPrima = E().merc(from);
                mercMossi = mercLeaving(from, mossi);
                E().addPiece(from, 'soldato', -mossi);
                E().setMerc(from, mercPrima - mercMossi);
                E().redrawProvince(from);
                tocchi.push(from.id);
            }
            const suaGia = to && target && E().owner(to) === target.name;
            // SBARCO: le truppe non ricevono la provincia in regalo, se la
            // PRENDONO. È la stessa battaglia dell'attacco normale — terreno del
            // difensore e bonus delle sue costruzioni compresi (§9) — solo senza
            // i vincoli di adiacenza e di carico, perché il trasporto lo fa il
            // Papa. Vinta, la provincia è del regno e dal turno dopo la gestisce
            // lui; persa, quegli uomini non tornano.
            if (to && target && !suaGia && o.modo !== 'consegna') {
                const defTroops = E().countPiece(to, 'soldato');
                const fort = GR().defenceBonus(unitsOf([to]));
                const difensore = E().owner(to) || 'Neutrale';
                const mercDif = E().merc(to);
                const res = RisikoBattle.resolveBattle(mossi, defTroops, fort, null, terrainExp(to),
                    mercMossi, mercDif);
                if (!res) return fail('Nessuna battaglia possibile.');
                const mercArrivati = res.attackerWins ? Math.max(0, mercMossi - res.losses) : 0;
                const conversione = applyBattleOutcome(target, to, res, defTroops, mercArrivati);
                E().redrawProvince(to);
                E().redrawRoads();
                tocchi.push(to.id);

                // Lo sbarco è TOTALE (§9.2): nessuna ripartizione dei superstiti,
                // chi scende resta a terra. Vale per la crociata come per la nave.
                esito = {
                    battle: res, engaged: mossi, defTroops, fort,
                    mercImpegnati: mercMossi, mercDifensore: mercDif, mercArrivati,
                    terreno: terrainOf(to), viaMare: true, scafo: null,
                    fromId: from ? from.id : null, toId: to.id,
                    fromLabel: from ? R().provinceLabel(from) : null,
                    toLabel: R().provinceLabel(to),
                    attaccante: target.name, difensore,
                    coloreAttaccante: target.color,
                    coloreDifensore: (players.find(p => p.name === difensore) || {}).color || null,
                    perditeAttaccante: res.attackerWins ? res.losses : mossi,
                    perditeDifensore: res.attackerWins ? defTroops : (defTroops - res.defenderSurvivors),
                    superstiti: res.attackerWins ? res.attackerSurvivors : res.defenderSurvivors,
                    conquistata: res.attackerWins, richiedeConquista: false, conversione
                };
                msg = res.attackerWins
                    ? 'Sbarco riuscito a ' + R().provinceLabel(to) + ': ' + res.attackerSurvivors +
                      (res.attackerSurvivors === 1 ? ' superstite' : ' superstiti') +
                      ' (' + res.losses + ' caduti). La provincia è di ' + target.name + '.' +
                      (conversione ? ' La provincia si converte alla fede di ' + target.name + ': ' + conversione.label + '.' : '')
                    : R().provinceLabel(to) + ' ha retto: ' +
                      (mossi === 1 ? 'l\'unico uomo sbarcato è perduto' : 'i ' + mossi + ' uomini sbarcati sono perduti') +
                      ', al difensore ne restano ' + res.defenderSurvivors + '.';

            } else if (to) {
                // CONSEGNA: le truppe si posano e basta. Serve quando la provincia
                // è già del regno (rinforzo) o quando l'admin vuole regalarla.
                let convConsegna = null;
                if (o.modo === 'consegna' && target && !suaGia) {
                    const fedeNuova = R().stateReligionOf ? R().stateReligionOf(target) : null;
                    E().setOwner(to, target.name);
                    E().setArmyColor(to, target.color);
                    pruneRoadsTouching(to.id);
                    convConsegna = handOver(target, to, fedeNuova);   // la fede segue la spada (§religione)
                }
                E().addPiece(to, 'soldato', mossi);
                E().addMerc(to, mercMossi);   // la ventura arriva con gli uomini (§5.3)
                if (target && E().owner(to) === target.name) E().setArmyColor(to, target.color);
                E().redrawProvince(to);
                tocchi.push(to.id);
                msg = from
                    ? mossi + (mossi === 1 ? ' uomo trasferito da ' : ' uomini trasferiti da ') +
                      R().provinceLabel(from) + ' a ' + R().provinceLabel(to) + '.'
                    : mossi + ' uomini compaiono in ' + R().provinceLabel(to) + '.';
                if (convConsegna) {
                    msg += ' ' + R().provinceLabel(to) + ' si converte alla fede di ' +
                           target.name + ': ' + convConsegna.label + '.';
                }
                // L'avvertimento che conta: soldati su una provincia che non è del
                // regno non sono suoi, e non ci potrà fare niente.
                if (target && E().owner(to) !== target.name) {
                    msg += ' Attenzione: ' + R().provinceLabel(to) + ' non è di ' + target.name +
                           ', quindi quegli uomini non sono a sua disposizione.';
                }
            } else {
                msg = mossi + ' uomini richiamati da ' + R().provinceLabel(from) + '.';
            }

        } else if (o.azione === 'provincia') {
            if (!to) return fail('Indica la provincia da assegnare.');
            const prima = E().owner(to);
            const fedeNuova = target && R().stateReligionOf ? R().stateReligionOf(target) : null;
            E().setOwner(to, target ? target.name : null);
            E().setArmyColor(to, target ? target.color : null);
            pruneRoadsTouching(to.id);
            const convProv = handOver(target, to, fedeNuova);   // la fede segue la spada (§religione)
            E().redrawProvince(to);
            tocchi.push(to.id);
            msg = R().provinceLabel(to) + (target ? ' passa a ' + target.name + '.' : ' torna terra di nessuno.');
            if (convProv) {
                msg += ' Si converte alla fede di ' + target.name + ': ' + convProv.label + '.';
            }
            // Cambia padrone: lo deve sapere anche chi la perde.
            const perdente = prima ? players.find(p => p.name === prima) : null;
            if (perdente && (!target || perdente.id !== target.id)) {
                decreeNotice(perdente, {
                    titolo: o.titolo || 'Editto',
                    testo: o.testo || (R().provinceLabel(to) + ' non è più sotto il tuo dominio.'),
                    prov: to.id
                });
                avvisati.add(perdente.id);
            }

        } else if (o.azione === 'oro') {
            if (!target) return fail('Indica il regno.');
            if (!n) return fail('Indica quante monete (negative per toglierle).');
            target.monete = Math.max(0, (target.monete || 0) + n);
            msg = (n > 0 ? '+' : '') + n + ' monete a ' + target.name + '.';

        } else if (o.azione === 'scorte') {
            if (!target) return fail('Indica il regno.');
            const res = o.risorsa;
            if (GR().RES.indexOf(res) < 0) return fail('Risorsa sconosciuta.');
            if (!n) return fail('Indica quante scorte (negative per toglierle).');
            if (!target.scorte) target.scorte = GR().emptyScorte();
            target.scorte[res] = Math.max(0, (target.scorte[res] || 0) + n);
            msg = (n > 0 ? '+' : '') + n + ' ' + GR().RES_LABEL[res] + ' a ' + target.name + '.';

        } else {
            return fail('Editto sconosciuto.');
        }

        if (target && !avvisati.has(target.id)) {
            // Il testo dell'admin racconta il PERCHÉ; l'esito della battaglia si
            // aggiunge da sé, perché è la parte che il giocatore non può dedurre
            // e che decide cosa si ritrova all'apertura del turno.
            const racconto = [o.testo, esito ? msg : null].filter(Boolean).join('\n\n');
            decreeNotice(target, {
                titolo: o.titolo || 'Editto',
                testo: racconto || msg,
                prov: (esito && esito.toId) || tocchi[0] || null
            });
        }

        E().refresh();
        E().save();
        return done('Editto promulgato. ' + msg,
            Object.assign({ prov: tocchi[0] || null, provs: tocchi, editto: true }, esito || {}));
    }

    root.GameActions = {
        startGame, beginTurn, endTurn,
        // EVENTI STORICI (js/events.js): il calendario datato. Chiamati da endTurn;
        // esposti anche qui per poterli guidare a mano nei test.
        applyEvents, tickEvents,
        decree,
        deploy, deployBound, deployAllBound, undeploy,
        build, buildWelfare, maintainWelfare, buildRoad, moveCapital, resolveCapital, recruit, attack, attackTargets,
        launchExpedition, expeditionTargets, expeditionLand, steerExpedition, advanceExpeditions,
        EXPED_DIRS, EXPED_DIR_LABEL,
        sendSpy, spyTargets, spiesOf,
        hasMarket, marketPath, tradeWithBank, setTax,
        proposeTrade, acceptTrade, refuseTrade, cancelTrade,
        tradeInbox, tradeOutbox, expireTrades, tradeHistory,
        // DIPLOMAZIA (§Diplomazia): proporre, accettare, rifiutare, rompere i
        // patti; concedere l'attacco a un proprio territorio; far scadere le
        // alleanze a tempo (chiamata da endTurn come expireTrades).
        proposePact, acceptPact, declinePact, breakPact, grantAttack, expirePacts, pactInbox,
        // A cosa serve l'alleanza: chiedere rinforzi (indicando DOVE servono) e
        // marciare in aiuto in fase d'attacco invece di colpire.
        askReinforcements, cancelHelp, sendReinforcements, helpInbox, helpOutbox, expireHelpRequests,
        conquestPending, resolveConquest,
        moveTargets, moveOrigins, finalMove, ownAdjacent, garrisonNeutrals, neutralRaids,
        PHASES, PHASE_LABEL, PHASE_HINT, phaseOf, phaseIndex, nextPhase,
        connectedOf, unitsOf, snapshotOf, isMyTurn,
        boundPool, boundTotal, placedPool,
        // VENTURA (§5.3): quanti mercenari ci sono in una provincia e quanti ne
        // partirebbero mandandone via `n`. Plancia e IA pronosticano da qui, così
        // il numero che si legge prima dell'attacco è quello che poi combatte.
        mercOf: (provId) => { const p = E().path(provId); return p ? E().merc(p) : 0; },
        mercEngaged: (provId, n) => { const p = E().path(provId); return p ? mercLeaving(p, n) : 0; }
    };

})(typeof window !== 'undefined' ? window : globalThis);

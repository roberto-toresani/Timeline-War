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
    // e ogni 5 turni ne guadagna 1 (GameRules.neutralGarrison). Si chiama all'avvio
    // e alla fine di ogni giro completo: alza il presidio di chi è sotto la quota
    // del decennio e non tocca nient'altro — una provincia conquistata non è più
    // neutrale, quindi esce da qui da sola.
    function garrisonNeutrals() {
        const target = GR().neutralGarrison(R().turn());
        let province = 0, soldati = 0;
        E().allPaths().forEach(path => {
            if (E().owner(path)) return;
            const cur = E().countPiece(path, 'soldato');
            const delta = Math.min(target - cur, roomFor(path));
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

            // Gli attaccanti lasciano comunque la provincia neutrale (resta il presidio).
            E().addPiece(np, 'soldato', -attaccanti);

            let esito;
            if (res.attackerWins) {
                // La provincia RITORNA NEUTRALE coi superstiti: le costruzioni
                // restano (come in una conquista normale), cambia solo il colore.
                E().addPiece(tp, 'soldato', -difTruppe);
                const difensore = R().players().find(p => p.name === difOwner);
                if (difensore && difensore.temporanei) delete difensore.temporanei[tp.id];
                E().setOwner(tp, null);
                E().addPiece(tp, 'soldato', res.attackerSurvivors);
                E().setMerc(tp, 0);           // i contratti sono morti col regno che li pagava
                E().setArmyColor(tp, null);
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

        // Le terre di nessuno partono presidiate (2 soldati, +1 ogni 5 turni).
        garrisonNeutrals();

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
        let neutrali = null;
        let scadute = 0;
        let razzie = null;
        let scismi = null;
        if (giroFinito) {
            R().advanceGlobalTurn();
            // Nuovo decennio: uno SCISMA può spezzare una fede (Religions.SCHISMS).
            // È un fatto di cronaca globale: app.js srotola la pergamena da sé.
            scismi = R().applySchisms ? R().applySchisms(R().turn()) : null;
            // Nuovo decennio: le carovane rimaste senza risposta tornano a casa
            // con la merce (§7) — il pegno non resta appeso all'infinito.
            scadute = expireTrades();
            // Le terre di nessuno di fede diversa razziano PRIMA del rifornimento,
            // così colpiscono a piena forza e poi tornano in quota (§ religione).
            razzie = neutralRaids(R().turn());
            // Nuovo decennio: le terre di nessuno si rinforzano se è scattata la
            // soglia dei 5 turni (garrisonNeutrals alza solo chi è sotto quota).
            neutrali = garrisonNeutrals();
            const nuovoPrimo = (primo + 1) % ordine.length;
            R().setTurnState(ordine[nuovoPrimo], ordine, nuovoPrimo);
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
              razzie: (razzie && razzie.razzie) || [], scismi: scismi || [] });
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
            Object.assign({ prov: provId }, fondazione ? { fondazione } : null));
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

    // Reclutamento (§5.3). Due unità, due nature opposte:
    //   Guarnigione — 2 soldati che scadono a fine turno (expireTemporaries).
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

        const temporanea = GR().TEMPORARY.indexOf(type) >= 0;
        if (temporanea) player.temporanei[provId] = (player.temporanei[provId] || 0) + n;
        else E().addMerc(path, n);

        E().redrawProvince(path);
        E().refresh();
        E().save();
        if (temporanea) {
            return done('+' + n + ' soldati temporanei in ' + R().provinceLabel(path) + ' (scadono a fine turno).',
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

    // Bersagli d'attacco validi: province adiacenti via terra non tue (§9).
    // `terreno`/`esponente` viaggiano col bersaglio: plancia e bot pronosticano
    // con lo stesso numero che poi userà la battaglia, senza rileggerlo da sé.
    function attackTargets(player, provId) {
        const seen = new Set();
        const card = (p, viaMare, scafo) => ({
            id: p.id,
            label: R().provinceLabel(p),
            owner: E().owner(p) || 'Neutrale',
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
        });

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
    function convertOnConquest(winner, to, fede) {
        if (typeof Religions === 'undefined' || !fede) return null;
        const prima = E().religion(to);
        if (prima === fede) return null;
        E().setReligion(to, fede);
        return { da: prima || null, a: fede, label: Religions.label(fede) };
    }

    // `mercIn` = quanti dei superstiti che entrano nella provincia presa sono di
    // ventura (§5.3). La ventura del difensore la si legge qui: se perde tutto
    // sparisce con lui, se regge perde i suoi caduti per primi.
    function applyBattleOutcome(winner, to, res, defTroops, mercIn) {
        const fedeVincitore = R().stateReligionOf ? R().stateReligionOf(winner) : null;
        const mercDif = E().merc(to);
        if (res.attackerWins) {
            E().addPiece(to, 'soldato', -defTroops);
            const defender = R().players().find(p => p.name === E().owner(to));
            if (defender && defender.temporanei) delete defender.temporanei[to.id];
            E().setOwner(to, winner.name);
            E().addPiece(to, 'soldato', res.attackerSurvivors);
            // La ventura della provincia adesso è solo quella arrivata: quella del
            // difensore è caduta con lui, e i suoi contratti non passano di mano.
            E().setMerc(to, Math.max(0, mercIn || 0));
            E().setArmyColor(to, winner.color);
            pruneRoadsTouching(to.id);
            return convertOnConquest(winner, to, fedeVincitore);
        }
        const caduti = defTroops - res.defenderSurvivors;
        E().addPiece(to, 'soldato', -caduti);
        E().setMerc(to, mercDif - caduti);   // i mercenari cadono per primi
        return null;
    }

    function attack(player, fromId, toId, engaged, rng, scafoVoluto) {
        const turnErr = requirePhase(player, 'attacca'); if (turnErr) return turnErr;
        const from = E().path(fromId), to = E().path(toId);
        if (!from || !to) return fail('Provincia sconosciuta.');
        if (E().owner(from) !== player.name) return fail('Puoi attaccare solo da una tua provincia.');
        if (E().owner(to) === player.name) return fail('Non puoi attaccare te stesso.');
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
            msg = R().provinceLabel(to) + ' ha retto: perdi tutte le ' + engaged +
                ' truppe impegnate, al difensore restano ' + res.defenderSurvivors + '.' +
                (viaMare ? ' La ' + (scafo.tipo === 'vascello' ? 'nave da guerra' : 'nave') +
                    ' è finita in mano al difensore.' : '');
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

    // Le province DA CUI si può partire: l'altra metà dello spostamento. Serve
    // alla plancia per accenderle sulla mappa PRIMA che la partenza sia scelta
    // (due clic: partenza, arrivo), così non si resta incollati alla provincia
    // dove è finito l'attacco. Basta un vicino di terra proprio — se ce l'ha,
    // ownReachable non è vuoto — e almeno un soldato oltre il presidio (§5).
    function moveOrigins(player) {
        const owned = E().ownedPaths(player.name);
        const mie = new Set(owned.map(p => p.id));
        return owned
            .filter(p => spare(p) > 0 && E().landNeighbors(p.id).some(id => mie.has(id)))
            .map(p => ({
                id: p.id, label: R().provinceLabel(p),
                troops: E().countPiece(p, 'soldato'), mobili: spare(p)
            }))
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

        // La ventura si sposta con la sua quota, come in un attacco (§5.3).
        const mercPrima = E().merc(from);
        const mercMossi = mercLeaving(from, n);
        E().addPiece(from, 'soldato', -n);
        E().setMerc(from, mercPrima - mercMossi);
        consumePlaced(player, fromId, n);
        putSoldiers(player, to, n);
        E().addMerc(to, mercMossi);
        E().redrawProvince(from);
        player.spostamentoFatto = true;

        E().refresh();
        E().save();
        return done(n + (n === 1 ? ' soldato spostato da ' : ' soldati spostati da ') +
            R().provinceLabel(from) + ' a ' + R().provinceLabel(to) + '. Lo spostamento del turno è speso.',
            { fromId, toId });
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
                if (o.modo === 'consegna' && target && !suaGia) {
                    E().setOwner(to, target.name);
                    E().setArmyColor(to, target.color);
                    pruneRoadsTouching(to.id);
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
            E().setOwner(to, target ? target.name : null);
            E().setArmyColor(to, target ? target.color : null);
            pruneRoadsTouching(to.id);
            E().redrawProvince(to);
            tocchi.push(to.id);
            msg = R().provinceLabel(to) + (target ? ' passa a ' + target.name + '.' : ' torna terra di nessuno.');
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
        decree,
        deploy, deployBound, deployAllBound, undeploy,
        build, buildRoad, recruit, attack, attackTargets,
        sendSpy, spyTargets, spiesOf,
        hasMarket, marketPath, tradeWithBank, setTax,
        proposeTrade, acceptTrade, refuseTrade, cancelTrade,
        tradeInbox, tradeOutbox, expireTrades,
        conquestPending, resolveConquest,
        moveTargets, moveOrigins, finalMove, ownReachable, garrisonNeutrals, neutralRaids,
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

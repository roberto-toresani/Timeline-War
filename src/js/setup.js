// ============================================================
// NUOVA PARTITA — sorteggio dei regni iniziali.
// Sparecchia la mappa (proprietari, pedine, strade, cronologia), assegna a ogni
// regno un piccolo feudo di partenza ben distanziato dagli altri, gli mette la
// Capitale, decide chi gioca l'umano e chi è governato dall'IA (js/bot.js), poi
// chiama GameActions.startGame() — che è ciò che fissa i valori del §11 e
// presidia le terre di nessuno.
//
// Perché la Capitale è REGALATA: senza Capitale un regno non raccoglie nulla
// (§2/§4) e non produce reclute, e per costruirla servono 5 soldati spendibili
// in una sola provincia — che all'inizio (5 per provincia, 1 di presidio) non
// si hanno. Senza questo regalo la partita non partirebbe proprio.
// Per lo stesso motivo il feudo iniziale confina con una provincia di PIETRA:
// la prima strada (quella gratuita della Capitale) la collega, e da lì in poi
// il regno ha la materia prima per costruirne altre.
// ============================================================

(function (root) {
    'use strict';

    const R = () => root.Risiko;
    const E = () => root.Risiko.engine;

    const DEFAULTS = {
        province: 3,        // province per regno all'avvio
        distanza: 6,        // distanza minima (in confini) fra due capitali
        risorsaChiave: 'pietra',
        regione: 'europa'   // dove nascono i regni (vedi REGIONS)
    };

    // DOVE NASCONO I REGNI (scelta dell'utente: "tutti in Europa, al massimo
    // Arabia e Nord Africa"). La mappa non ha un campo "continente", quindi la
    // regione è definita a rettangoli sulle coordinate dell'SVG: ogni provincia
    // ci sta dentro se il centro del suo bounding box ci cade.
    // I bordi sono MISURATI sulla mappa vera (Estremadura 571,169 · Ural 807,89 ·
    // Sicilia 646,176 · Nejd 763,234 · Oman 787,238) e tagliati apposta per
    // lasciare fuori Persia (Fars 775,207), Sudan (Dongola 706,242) e Sahel
    // (Niger 633,244): se la mappa cambia vanno rimisurati, non indovinati.
    // Le province che scavalcano il bordo della mappa (Alaska, Chukotka) hanno un
    // bounding box largo quanto il mondo: si riconoscono dalla larghezza e si
    // scartano, altrimenti il loro "centro" cadrebbe in mezzo all'Europa.
    const REGIONS = {
        europa: {
            nome: 'Europa, Nord Africa e Arabia',
            rects: [
                [520, 0, 812, 152],     // Europa, dal Portogallo agli Urali
                [545, 152, 742, 205],   // Mediterraneo: Iberia, Italia, Balcani, Anatolia, Levante, Maghreb
                [545, 205, 700, 235],   // Nord Africa: Marocco → Libia
                [695, 205, 730, 232],   // valle del Nilo
                [728, 200, 772, 258],   // Arabia occidentale e centrale
                [772, 220, 800, 250]    // Arabia del Golfo
            ]
        },
        mondo: { nome: 'Tutto il mondo', rects: null }
    };

    const MAX_PROVINCE_WIDTH = 200;

    function inRegion(id, region) {
        if (!region || !region.rects) return true;
        const p = E().path(id);
        if (!p || !p.getBBox) return false;
        let b; try { b = p.getBBox(); } catch (e) { return false; }
        if (!b || b.width > MAX_PROVINCE_WIDTH) return false;
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        return region.rects.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]);
    }

    function shuffle(arr, rand) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Province entro `depth` confini da `id` (l'id stesso incluso).
    function within(id, depth) {
        const seen = new Set([id]);
        let border = [id];
        for (let d = 0; d < depth; d++) {
            const next = [];
            border.forEach(cur => E().landNeighbors(cur).forEach(n => {
                if (seen.has(n)) return;
                seen.add(n); next.push(n);
            }));
            border = next;
            if (!border.length) break;
        }
        return seen;
    }

    function resourceOf(id) {
        const p = E().path(id);
        return p ? (R().resourceKeyOf(p) || null) : null;
    }

    // Candidati a capitale, dal migliore al ripiego:
    //  1. la provincia produce già di suo E ha la pietra a un confine (la strada
    //     gratuita la collega subito: due risorse al turno, che è quanto serve
    //     per non farsi mangiare il raccolto dal malus di Popolarità §8);
    //  2. almeno la pietra a un confine;
    //  3. abbastanza vicini per un feudo;  4. qualunque provincia.
    function candidates(size, risorsa, region) {
        const all = E().allPaths().map(p => p.id).filter(id => inRegion(id, region));
        const conVicini = all.filter(id => E().landNeighbors(id).length >= size - 1);
        const conPietra = conVicini.filter(id =>
            resourceOf(id) === risorsa || E().landNeighbors(id).some(n => resourceOf(n) === risorsa));
        const ricchi = conPietra.filter(id => resourceOf(id));
        return [ricchi, conPietra, conVicini, all];
    }

    // Semi ben distanziati: si prova con la distanza richiesta e si allenta solo
    // se la mappa non ne ha abbastanza (continenti piccoli, molti regni).
    function pickSeeds(n, size, rand, distanza, risorsa, region) {
        const scale = candidates(size, risorsa, region);
        for (const pool of scale) {
            if (pool.length < n) continue;
            for (let d = distanza; d >= 1; d--) {
                const mescolato = shuffle(pool.slice(), rand);
                const vietate = new Set();
                const semi = [];
                for (const id of mescolato) {
                    if (vietate.has(id)) continue;
                    semi.push(id);
                    within(id, d).forEach(x => vietate.add(x));
                    if (semi.length === n) return { semi, distanza: d };
                }
            }
        }
        return { semi: shuffle(scale[scale.length - 1].slice(), rand).slice(0, n), distanza: 0 };
    }

    // Feudo intorno al seme: prima la provincia con la risorsa chiave (è quella
    // che la strada gratuita andrà a collegare), poi le altre confinanti libere.
    function growFief(seed, size, presi, risorsa) {
        const feudo = [seed];
        presi.add(seed);
        const vicini = E().landNeighbors(seed).filter(id => !presi.has(id));
        vicini.sort((a, b) => (resourceOf(b) === risorsa ? 1 : 0) - (resourceOf(a) === risorsa ? 1 : 0));
        for (const id of vicini) {
            if (feudo.length >= size) break;
            feudo.push(id);
            presi.add(id);
        }
        return feudo;
    }

    // Sparecchia: nessun proprietario, nessuna pedina, nessuna strada, nessuna
    // cronologia. Da qui in poi la mappa è una pagina bianca.
    function clearMap() {
        E().allPaths().forEach(path => {
            E().setOwner(path, null);
            E().erasePieces(path);
            E().setArmyColor(path, null);
            E().redrawProvince(path);
        });
        E().roads().forEach(r => E().removeRoad(r.a, r.b));
        E().redrawRoads();
        if (R().resetHistory) R().resetHistory();
    }

    // ---------- partita sulla mappa già disegnata ----------
    // È il modo NORMALE di cominciare: i regni sono quelli che l'admin ha dipinto
    // sulla mappa, con i loro confini storici. Non si sorteggia niente — si
    // aggiunge solo quel che serve per giocare (Capitale, colori, economia).

    function kingdomsOnMap(players) {
        return players
            .map(pl => ({ player: pl, province: E().ownedPaths(pl.name).map(p => p.id) }))
            .filter(k => k.province.length);
    }

    // Dove mettere la Capitale di un regno che non ce l'ha: la provincia più
    // "interna" (più confinanti dello stesso regno), a parità quella con una
    // risorsa. È la scelta che un giocatore farebbe: la sede al riparo.
    function capitalSiteFor(k) {
        const mie = new Set(k.province);
        let best = null, bestScore = -1;
        k.province.forEach(id => {
            const path = E().path(id);
            if (!path) return;
            // Capitale, Città e Fortezza si escludono: dove c'è già un insediamento
            // non si può posare.
            const occupata = ['capitale', 'citta', 'fortezza'].some(t => E().countPiece(path, t) > 0);
            if (occupata) return;
            const amici = E().landNeighbors(id).filter(n => mie.has(n)).length;
            const score = amici * 2 + (resourceOf(id) ? 1 : 0);
            if (score > bestScore) { bestScore = score; best = id; }
        });
        return best;
    }

    function prepareExisting(players) {
        const regni = kingdomsOnMap(players);
        regni.forEach(k => {
            const pl = k.player;
            // Il colore-esercito serve a riconoscere la Capitale del regno: se la
            // mappa è stata dipinta senza pedine, va messo adesso.
            k.province.forEach(id => {
                const path = E().path(id);
                if (path) E().setArmyColor(path, pl.color);
            });
            let cap = R().getCapitalPathFor(pl);
            if (!cap) {
                const sito = capitalSiteFor(k);
                if (sito) {
                    const path = E().path(sito);
                    E().addPiece(path, 'capitale', 1);
                    E().setArmyColor(path, pl.color);
                    E().redrawProvince(path);
                    cap = path;
                }
            }
            k.capitale = cap ? cap.id : null;
        });
        return regni;
    }

    // opts: { mantieniMappa, province, distanza, regione, umano (id), rng }
    function newGame(opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const rand = o.rng || Math.random;
        const region = REGIONS[o.regione] || REGIONS.europa;
        if (root.Bot) root.Bot.stop();

        const players = R().players();
        if (!players.length) return { ok: false, msg: 'Nessun regno configurato.' };
        // Senza il grafo dei confini ogni provincia sembra un'isola: i feudi non
        // crescono, i bot non attaccano. Meglio dirlo che sorteggiare una partita
        // rotta (vedi neighborsReady in app.js).
        if (R().neighborsReady && !R().neighborsReady()) {
            return { ok: false, msg: 'La mappa sta ancora calcolando i confini: riprova fra un istante.' };
        }

        // MODO NORMALE: si gioca la mappa che c'è. Il sorteggio dei feudi resta
        // disponibile (mantieniMappa: false) ma è l'eccezione — cancella il lavoro
        // fatto nell'editor, e non è quello che si vuole quasi mai.
        const suMappa = o.mantieniMappa !== false && kingdomsOnMap(players).length > 0;
        if (suMappa) {
            const regni = prepareExisting(players);
            const esito = finalize(players, regni, o, rand);
            esito.msg = 'Partita avviata sulla mappa attuale: ' + regni.length + ' regni. ' + esito.avvio;
            esito.suMappa = true;
            return esito;
        }

        clearMap();

        const { semi, distanza } = pickSeeds(players.length, o.province, rand, o.distanza, o.risorsaChiave, region);
        const presi = new Set();
        const regni = [];

        players.forEach((pl, i) => {
            const seed = semi[i];
            if (!seed) return;
            const feudo = growFief(seed, o.province, presi, o.risorsaChiave);
            feudo.forEach(id => {
                const path = E().path(id);
                if (!path) return;
                E().setOwner(path, pl.name);
                E().setArmyColor(path, pl.color);
            });
            // La Capitale nel seme: è il regalo che fa partire la macchina.
            const capitale = E().path(seed);
            E().addPiece(capitale, 'capitale', 1);
            E().setArmyColor(capitale, pl.color);
            E().redrawProvince(capitale);
            regni.push({ player: pl, capitale: seed, province: feudo });
        });

        const esito = finalize(players, regni, o, rand);
        esito.distanza = distanza;
        esito.regione = region.nome;
        esito.msg = 'Nuova partita in ' + region.nome + ': ' + regni.length + ' regni, ' +
            o.province + ' province a testa. ' + esito.avvio;
        return esito;
    }

    // Coda comune ai due modi (mappa attuale o sorteggio): chi gioca l'umano, le
    // strategie dell'IA, l'avvio vero del motore e il salvataggio.
    function finalize(players, regni, o, rand) {
        // PARTITA IN SOLITARIA (o.tuttiUmani): nessuna IA, i regni li muove tutti
        // il giocatore, uno alla volta, nell'ordine dei turni. È il banco di prova
        // delle regole — se chi le conosce riesce a sbloccare tutti e dieci i regni
        // dalla trappola del turno 1 (§8), la trappola è dura ma non cieca.
        const tuttiUmani = !!o.tuttiUmani;
        // Chi gioca l'umano: sorteggiato fra i regni CHE ESISTONO sulla mappa —
        // pescare un regno senza province vorrebbe dire dare al giocatore un seggio
        // già eliminato.
        const inGioco = regni.map(r => r.player);
        const umano = tuttiUmani ? null
            : ((o.umano !== undefined && o.umano !== null)
                ? players.find(p => p.id === o.umano)
                : inGioco[Math.floor(rand() * inGioco.length)]);
        if (root.Bot) {
            if (tuttiUmani) players.forEach(pl => { pl.bot = null; });
            else root.Bot.assignStrategies(players, umano ? umano.id : null, rand);
        }

        // Il calendario riparte dall'anno 1000 (turno 1), ma la mappa resta com'è.
        if (R().resetHistory) R().resetHistory();

        // Da qui in poi comanda il motore: 5 soldati per provincia, 1000 monete,
        // scorte a zero, ordine di turno, terre di nessuno presidiate (§11).
        const avvio = root.GameActions.startGame();

        // Una strada gratuita a testa, come se la Capitale fosse stata costruita.
        // Valore assoluto e non incremento: due avvii di fila non regalano due strade.
        // Tassazione al valore iniziale del §11.
        players.forEach(pl => { pl.stradeGratis = 1; pl.tassazione = 'normale'; });

        // Codice d'invito a tutti PRIMA del salvataggio: il link della plancia
        // deve funzionare subito. Generarlo dopo il save lo lascerebbe solo in
        // memoria, e play.html non troverebbe il regno.
        if (R().inviteUrlFor) players.forEach(pl => R().inviteUrlFor(pl));

        E().refresh();
        E().save();

        return { ok: true, umano, tuttiUmani, regni, avvio: avvio.msg };
    }

    root.GameSetup = { newGame, clearMap, kingdomsOnMap, inRegion, REGIONS, DEFAULTS };

})(typeof window !== 'undefined' ? window : globalThis);

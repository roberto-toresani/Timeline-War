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

    // opts: { province, distanza, regione, umano (id), rng }
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

        // Chi gioca l'umano: sorteggiato fra tutti i regni, come chiesto.
        const umano = (o.umano !== undefined && o.umano !== null)
            ? players.find(p => p.id === o.umano)
            : players[Math.floor(rand() * players.length)];
        if (root.Bot) root.Bot.assignStrategies(players, umano ? umano.id : null, rand);

        // Da qui in poi comanda il motore: 5 soldati per provincia, 1000 monete,
        // scorte a zero, ordine di turno, terre di nessuno presidiate (§11).
        const avvio = root.GameActions.startGame();

        // Una strada gratuita a testa, come se la Capitale fosse stata costruita:
        // serve a collegare subito la provincia della risorsa. Valore assoluto e
        // non incremento: due sorteggi di fila non devono regalare due strade.
        // Tassazione al valore iniziale del §11.
        players.forEach(pl => { pl.stradeGratis = 1; pl.tassazione = 'normale'; });

        // Codice d'invito a tutti PRIMA del salvataggio: il link della plancia
        // deve funzionare subito dopo il sorteggio. Generarlo dopo il save lo
        // lascerebbe solo in memoria, e play.html non troverebbe il regno.
        if (R().inviteUrlFor) players.forEach(pl => R().inviteUrlFor(pl));

        E().refresh();
        E().save();

        return {
            ok: true,
            umano,
            regni,
            distanza,
            regione: region.nome,
            msg: 'Nuova partita in ' + region.nome + ': ' + regni.length + ' regni, ' +
                o.province + ' province a testa. ' + avvio.msg
        };
    }

    root.GameSetup = { newGame, clearMap, inRegion, REGIONS, DEFAULTS };

})(typeof window !== 'undefined' ? window : globalThis);

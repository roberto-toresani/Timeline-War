// ============================================================
// NUOVA PARTITA — sorteggio dei regni iniziali.
// Sparecchia la mappa (proprietari, pedine, strade, cronologia), assegna a ogni
// regno un piccolo feudo di partenza ben distanziato dagli altri, decide chi
// gioca l'umano e chi è governato dall'IA (js/bot.js), poi chiama
// GameActions.startGame() — che è ciò che fissa i valori del §11 e presidia le
// terre di nessuno.
//
// La Capitale NON è più regalata (regola dell'utente): i regni partono SENZA
// Capitale e la prima cosa da fare al turno 1 è costruirla — costa 500 monete e
// NESSUN uomo (game-rules), quindi con le 1000 monete d'avvio è alla portata di
// tutti, umano e bot (i bot hanno `capitale` in testa all'ordine di costruzione).
// Il feudo iniziale confina con una provincia di PIETRA: la prima strada (quella
// gratuita che nasce dalla costruzione della Capitale) la collega, e da lì in poi
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

    // Regni che il sorteggio dell'umano NON pesca mai (regola dell'utente): sono
    // regni nati per EVENTO (js/events.js) e non regni d'inizio partita. Il nome è
    // la chiave, come per dottrine e obiettivi. Restano assegnabili a mano per id.
    const NON_SORTEGGIABILI = ['Mongoli'];

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

    function prepareExisting(players) {
        const regni = kingdomsOnMap(players);
        regni.forEach(k => {
            const pl = k.player;
            // Il colore-esercito serve a riconoscere il regno (e la sua Capitale, se
            // e quando la costruirà): se la mappa è stata dipinta senza pedine, va
            // messo adesso. La Capitale NON si regala più — se sulla mappa dipinta
            // ce n'è già una la si tiene, altrimenti il regno parte senza e la
            // costruirà al turno 1.
            k.province.forEach(id => {
                const path = E().path(id);
                if (path) E().setArmyColor(path, pl.color);
            });
            const cap = R().getCapitalPathFor(pl);
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
            // Niente Capitale nel seme: il regno parte senza e la costruisce al
            // turno 1 (500 monete, 0 uomini). Il seme resta solo l'origine del feudo
            // — e la provincia più naturale su cui posare la prima Capitale.
            regni.push({ player: pl, capitale: null, province: feudo });
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
        // già eliminato. I regni umani possono essere più d'uno (regola dell'utente:
        // "seguo 2 regni, gli altri IA"): `o.umani` è un ELENCO di id espliciti,
        // oppure un NUMERO di regni da sorteggiare. In mancanza si ricade su `o.umano`
        // (un solo id) o su un regno estratto a sorte, come prima.
        const inGioco = regni.map(r => r.player);
        let umani;
        if (tuttiUmani) {
            umani = inGioco.slice();
        } else if (Array.isArray(o.umani)) {
            umani = o.umani.map(id => inGioco.find(p => p.id === id)).filter(Boolean);
        } else if (o.umano !== undefined && o.umano !== null) {
            const one = players.find(p => p.id === o.umano);
            umani = one ? [one] : [];
        } else {
            // Il sorteggio pesca fra i regni SORTEGGIABILI: l'Orda mongola resta
            // fuori (regola dell'utente). È un regno di conquista che nasce per
            // evento al turno 25 e che gioca l'admin — se resta sulla mappa da una
            // partita precedente, l'estrazione potrebbe darlo al giocatore al posto
            // di un regno d'inizio partita. Chiederlo per id (`o.umano`/`o.umani`)
            // resta possibile: qui si esclude solo il caso.
            const sorteggiabili = inGioco.filter(p => NON_SORTEGGIABILI.indexOf(p.name) < 0);
            const pool = sorteggiabili.length ? sorteggiabili : inGioco;
            const n = Math.max(1, Math.min((o.umani | 0) || 1, pool.length));
            umani = shuffle(pool.slice(), rand).slice(0, n);
        }
        const umanoIds = new Set(umani.map(p => p.id));
        if (root.Bot) {
            if (tuttiUmani) players.forEach(pl => { pl.bot = null; });
            else root.Bot.assignStrategies(players, umanoIds, rand);
        }
        // ...e nemmeno una strategia: l'Orda la gioca l'ADMIN (`bot:null`, come
        // quando nasce per evento). Se un regno d'evento è rimasto sulla mappa da
        // una partita precedente, assegnargli un profilo lo farebbe partire a
        // conquistare dal turno 1 al posto di restare in mano all'admin.
        NON_SORTEGGIABILI.forEach(nome => {
            const pl = players.find(p => p.name === nome);
            if (pl) pl.bot = null;
        });

        // Il calendario riparte dall'anno 1000 (turno 1), ma la mappa resta com'è.
        if (R().resetHistory) R().resetHistory();

        // Da qui in poi comanda il motore: 5 soldati per provincia, 1000 monete,
        // scorte a zero, ordine di turno, terre di nessuno presidiate (§11).
        // `deferSave`: NON salvare ancora — sotto si aggiungono ancora codici
        // d'invito, strade gratis e `nato`, e il salvataggio (FORZATO, perché il
        // calendario regredisce al turno 1) lo fa finalize alla fine con lo stato
        // completo. Salvare due volte esporrebbe il reset alla cancellazione (vedi
        // pushState in sync.js: un push non forzato in mezzo lo annullava e la
        // vecchia partita continuava a tornare da Firestore).
        const avvio = root.GameActions.startGame({ deferSave: true });

        // Tassazione al valore iniziale del §11. La strada gratuita NON si regala
        // più all'avvio: nasce dalla costruzione della Capitale (build() fa
        // `stradeGratis += 1`), quindi darla anche qui ne regalerebbe due.
        players.forEach(pl => { pl.stradeGratis = 0; pl.tassazione = 'normale'; });
        // Partita nuova = tutti fondati adesso: il turno di fondazione torna a 1,
        // così la grazia dell'insediamento (§8) riparte per tutti. Senza, un regno
        // rimasto sulla mappa da una partita precedente e nato per evento (es. i
        // Mongoli, `nato` 25) non ne prenderebbe più.
        players.forEach(pl => { pl.nato = 1; });

        // Codice d'invito a tutti PRIMA del salvataggio: il link della plancia
        // deve funzionare subito. Generarlo dopo il save lo lascerebbe solo in
        // memoria, e play.html non troverebbe il regno.
        if (R().inviteUrlFor) players.forEach(pl => R().inviteUrlFor(pl));

        E().refresh();
        // Salvataggio UNICO e FORZATO della partita nuova, con lo stato completo
        // (codici d'invito compresi). Forzato perché regredisce il calendario al
        // turno 1: senza, la guardia anti-regressione di sync.js lo rifiuta e la
        // partita vecchia resta su Firestore. Vedi anche startGame({deferSave}).
        (E().saveForced || E().save)();

        // `umano` (singolo) resta per retrocompatibilità: vale solo quando c'è UN
        // regno umano. Con più regni la plancia si apre senza codice d'invito e
        // segue i turni da sé, come in solitaria — vedi renderNewGameResult.
        const umano = umani.length === 1 ? umani[0] : null;
        return { ok: true, umano, umani, tuttiUmani, regni, avvio: avvio.msg };
    }

    root.GameSetup = { newGame, clearMap, kingdomsOnMap, inRegion, REGIONS, DEFAULTS };

})(typeof window !== 'undefined' ? window : globalThis);

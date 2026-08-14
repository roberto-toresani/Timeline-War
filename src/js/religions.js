// ============================================================
// RELIGIONI — la fede delle province e dei regni.
//
// Ogni provincia ha una `religione`; la religione DI STATO di un regno è quella
// della sua Capitale (chi perde o sposta la Capitale può cambiare fede a tutto
// l'impero). Serve a tre cose, tutte volute dall'utente:
//   - OBIETTIVI DI PRESTIGIO: "conquista 3 province cristiane / arabe" — si
//     ragiona per FAMIGLIA (cristiani, musulmani…), non per la singola confessione;
//   - TERRE DI NESSUNO: una provincia neutrale della TUA fede non ti attacca; una
//     di fede diversa può farlo (game-actions.neutralRaids);
//   - VISTA MAPPA per fede (Risiko.setMapPaint('fede')).
//
// Modulo PURO, senza DOM: le confessioni, le famiglie, i blocchi regionali del
// Mille e gli scismi che spezzano una fede col passare dei decenni. Chi dipinge
// e chi muta la mappa è app.js/game-actions.js; qui c'è solo il sapere.
//
// Il tempo è quello di Chronicle (1 turno = 1 decennio, turno 1 = 1000-1009), ma
// gli scismi corrono su un CALENDARIO COMPRESSO (scelta dell'utente): a scala
// storica la Riforma cadrebbe al turno 52 e nessuna partita la vedrebbe. Qui i
// turni sono scelti perché una partita normale li incontri (vedi SCHISMS).
// ============================================================

(function (root) {
    'use strict';

    // Le confessioni. `famiglia` è il raggruppamento largo su cui lavorano gli
    // obiettivi ("province cristiane" = tutta la famiglia cristiani). `da` è il
    // turno in cui la fede COMPARE (le figlie di uno scisma non esistono prima).
    // `colore` è la tinta della vista-mappa per fede.
    const FAITHS = {
        // ---- cristiani ----
        cristiani:     { label: 'Cristiani',      famiglia: 'cristiani', colore: '#c9a227', da: 1 },
        cattolici:     { label: 'Cattolici',      famiglia: 'cristiani', colore: '#d4b03a', da: 1 },
        ortodossi:     { label: 'Ortodossi',      famiglia: 'cristiani', colore: '#8e7cc3', da: 1 },
        protestanti:   { label: 'Protestanti',    famiglia: 'cristiani', colore: '#3f7fbf', da: 12 },
        anglicani:     { label: 'Anglicani',      famiglia: 'cristiani', colore: '#5aa0d0', da: 13 },
        calvinisti:    { label: 'Calvinisti',     famiglia: 'cristiani', colore: '#4a6fa5', da: 13 },
        vecchicredenti:{ label: 'Vecchi Credenti',famiglia: 'cristiani', colore: '#6f5aa0', da: 18 },
        // ---- musulmani (già divisi al Mille) ----
        sunniti:       { label: 'Sunniti',        famiglia: 'musulmani', colore: '#2e8b57', da: 1 },
        sciiti:        { label: 'Sciiti',         famiglia: 'musulmani', colore: '#1f6f4a', da: 1 },
        wahhabiti:     { label: 'Wahhabiti',      famiglia: 'musulmani', colore: '#145a3a', da: 16 },
        // ---- altre fedi del mondo (colore della mappa, mai religione di stato di un regno giocante) ----
        ebrei:         { label: 'Ebrei',          famiglia: 'ebraismo',  colore: '#c05a8a', da: 1 },
        pagani:        { label: 'Pagani',         famiglia: 'pagani',    colore: '#9c6b3f', da: 1 },
        indu:          { label: 'Induisti',       famiglia: 'dharmiche', colore: '#e08a2e', da: 1 },
        buddhisti:     { label: 'Buddhisti',      famiglia: 'dharmiche', colore: '#d0a050', da: 1 },
        shintoisti:    { label: 'Shintoisti',     famiglia: 'dharmiche', colore: '#c26a6a', da: 1 },
        animisti:      { label: 'Animisti',       famiglia: 'animisti',  colore: '#7a8b3f', da: 1 },
        nativi:        { label: 'Culti nativi',   famiglia: 'animisti',  colore: '#6b8b5a', da: 1 }
    };

    const DEFAULT_FAITH = 'pagani';

    function get(id) { return FAITHS[id] || null; }
    function label(id) { const f = FAITHS[id]; return f ? f.label : ''; }
    function color(id) { const f = FAITHS[id]; return f ? f.colore : '#888'; }
    function familyOf(id) { const f = FAITHS[id]; return f ? f.famiglia : null; }
    function exists(id) { return !!FAITHS[id]; }

    // Stessa confessione esatta (sunniti === sunniti). Le neutrali "amiche" sono
    // quelle della TUA fede esatta.
    function sameFaith(a, b) { return !!a && a === b; }
    // Stessa FAMIGLIA (cattolici e ortodossi sono entrambi cristiani): è il metro
    // degli obiettivi di prestigio.
    function sameFamily(a, b) {
        const fa = familyOf(a), fb = familyOf(b);
        return !!fa && fa === fb;
    }

    // Le confessioni "vive" a un dato turno (le figlie di uno scisma non ancora
    // avvenuto non compaiono). Utile per menù/legende future.
    function faithsAt(turn) {
        const t = Math.max(1, Math.floor(turn || 1));
        return Object.keys(FAITHS).filter(id => FAITHS[id].da <= t);
    }

    // ---------- assegnazione di partenza ----------
    // La tabella delle eccezioni (data/start_religions.js): frontiere di fede
    // troppo fini per un rettangolo. Manca il file → nessuna eccezione.
    function nameTable() {
        return (typeof RELIGIONS_START !== 'undefined') ? RELIGIONS_START : root.RELIGIONS_START || {};
    }

    // Blocchi regionali per coordinate dell'SVG (viewBox 0 0 1200 575). Ordine =
    // priorità: la prima regola che contiene il punto vince. Misurati sul telaio
    // di GameSetup.REGIONS (Europa x520-812, y0-205; Maghreb y205-235; Nilo
    // x695-730; Arabia x728-800). Il resto del mondo è volutamente grossolano:
    // serve solo a COLORARE, nessun regno giocante nasce fuori dall'Europa/Med.
    const BLOCKS = [
        // [x0, y0, x1, y1, fede]
        [0,   0,   500, 575, 'nativi'],     // Americhe
        [735, 200, 740, 262, 'sciiti'],     // (guardia stretta) valle del Nilo, gestita sotto
        [695, 198, 736, 262, 'sciiti'],     // Egitto fatimide (sciita)
        [735, 148, 815, 205, 'cristiani'],  // Anatolia bizantina
        [725, 195, 815, 278, 'sunniti'],    // Arabia
        [760, 120, 880, 262, 'sunniti'],    // Levante, Mesopotamia, Persia
        // Costa mediterranea del Maghreb (Marocco del nord, Algeria, Tunisia): sta
        // fra y182 e y195, sopra il blocco Maghreb ma sotto l'Iberia (che finisce a
        // y178). Stretta a x≤645 per non toccare Creta e le isole dell'Egeo.
        [500, 182, 645, 195, 'sunniti'],
        [500, 195, 736, 245, 'sunniti'],    // Maghreb / Nord Africa (interno e costa est)
        // Europa e Rus' (cristiani, poi lo Scisma). Due fasce: a nord la cintura
        // russa arriva fino agli Urali (x900); a sud si ferma prima (x815) per non
        // dipingere di cristiano Tibet e Xinjiang, che stanno a quelle latitudini.
        [470, 0,   900, 130, 'cristiani'],
        [470, 130, 815, 205, 'cristiani'],
        [812, 100, 950, 235, 'sunniti'],    // Turkestan / Asia centrale musulmana
        [830, 195, 965, 320, 'indu'],       // India
        [1075,118, 1200,205, 'shintoisti'], // Giappone
        [950, 90,  1200,340, 'buddhisti'],  // Cina e Sud-est asiatico
        [812, 0,   1200,110, 'pagani'],     // Siberia / Mongolia
        [500, 235, 812, 420, 'animisti'],   // Africa subsahariana
        [900, 300, 1200,575, 'animisti']    // Oceania / Australia
    ];

    function faithByRegion(x, y) {
        for (let i = 0; i < BLOCKS.length; i++) {
            const b = BLOCKS[i];
            if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return b[4];
        }
        return DEFAULT_FAITH;
    }

    // La fede iniziale di una provincia: prima l'eccezione per nome, poi il blocco
    // per coordinate. `name` come lo mostra la mappa; `x,y` = centro della provincia.
    function seedFaith(name, x, y) {
        const t = nameTable();
        if (name && t[name]) return t[name];
        return faithByRegion(x, y);
    }

    // ---------- scismi (calendario compresso) ----------
    // Uno scisma trasforma, a un certo turno, le province di una fede in un'altra.
    // Ogni regola: { from, to, rects?, names? }. Senza né `rects` né `names` vale
    // ovunque (catch-all); altrimenti una provincia è colpita se il suo centro
    // cade in un rettangolo OPPURE se il suo nome è nell'elenco. Le regole si
    // applicano NELL'ORDINE dato — così lo Scisma d'Oriente fa prima gli ortodossi
    // (elenco + Anatolia + Rus') e poi "tutto il resto dei cristiani è cattolico".
    // La linea cattolico/ortodosso è diagonale: un rettangolo che prenda i Balcani
    // greci si mangerebbe anche Italia, Polonia e Ungheria (cattoliche). Per la
    // fascia meridionale contesa si va quindi per NOME; i rettangoli restano solo
    // dove non ci sono cattolici (Anatolia bizantina, cuore della Rus').
    // `turn` è compresso: scelto per essere incontrato in una partita normale.
    const SCHISMS = [
        {
            id: 'grande-scisma', turn: 5,
            titolo: 'Il Grande Scisma',
            testo: 'La Cristianità si spezza: Roma e Costantinopoli si scomunicano a vicenda.',
            nota: 'L\'Oriente si fa ortodosso, l\'Occidente cattolico.',
            rules: [
                // Oriente ortodosso. Fascia bizantino-slava del Sud per nome, più i
                // due blocchi senza cattolici: Anatolia e cuore della Rus'.
                { from: 'cristiani', to: 'ortodossi',
                    names: [
                        // Grecia ed Egeo
                        'Thessalia', 'Attica', 'Peloponnese', 'Crete',
                        'West Aegean Islands', 'East Aegean Islands',
                        // Balcani ortodossi
                        'Macedonia', 'Skopia', 'Albania', 'Montenegro', 'Serbia',
                        'Bulgaria', 'Bosnia',
                        'Northern Thrace', 'Western Thrace', 'Eastern Thrace',
                        // Romania (Valacchia e Moldavia)
                        'Wallachia', 'Moldavia', 'Bessarabia', 'Dobrudja',
                        // Caucaso e frontiera anatolica cristiana
                        'Armenia', 'Erzurum', 'Trabzon',
                        // Rus' occidentale (il resto lo prende il rettangolo)
                        'Kiev', 'Cherson', 'Crimea', 'Volhynia', 'East Galicia'
                    ],
                    rects: [
                        [690, 145, 815, 205],   // Anatolia bizantina (dall'Egeo all'Eufrate)
                        [690, 0,   900, 150]    // Rus' e Russia (a est della Polonia)
                    ] },
                // Tutto il resto della Cristianità diventa cattolico.
                { from: 'cristiani', to: 'cattolici' }
            ]
        },
        {
            id: 'riforma', turn: 12,
            titolo: 'La Riforma',
            testo: 'Dalla Germania la protesta contro Roma dilaga: nasce il Protestantesimo.',
            nota: 'Il Nord d\'Europa abbandona l\'obbedienza al Papa.',
            // Rettangoli misurati sui centri veri delle province (viewBox SVG).
            // L'ordine conta: prima le anglicane, poi le calviniste, infine le
            // protestanti — le zone non si sovrappongono (la Renania e la Baviera
            // restano cattoliche, come nella storia).
            rules: [
                // Isole britanniche: anglicani.
                { from: 'cattolici', to: 'anglicani', rects: [ [568, 85, 605, 128] ] },
                // Paesi Bassi e Svizzera: calvinisti.
                { from: 'cattolici', to: 'calvinisti', rects: [
                    [606, 108, 622, 130],   // Paesi Bassi
                    [620, 133, 634, 146]    // Svizzera
                ] },
                // Germania settentrionale e Scandinavia: protestanti (luterani).
                { from: 'cattolici', to: 'protestanti', rects: [
                    [622, 104, 660, 126],   // Nord Germania (non la Baviera, più a sud)
                    [620, 35,  670, 104]    // Danimarca, Norvegia, Svezia
                ] }
            ]
        },
        {
            id: 'wahhabismo', turn: 16,
            titolo: 'Il Wahhabismo',
            testo: 'Nel cuore dell\'Arabia sorge una predicazione di ritorno alle origini.',
            nota: 'La penisola sunnita si fa wahhabita.',
            rules: [
                { from: 'sunniti', to: 'wahhabiti', rects: [ [740, 210, 800, 270] ] }
            ]
        },
        {
            id: 'vecchi-credenti', turn: 18,
            titolo: 'Lo scisma dei Vecchi Credenti',
            testo: 'Le riforme del rito spaccano la Chiesa ortodossa di Russia.',
            nota: 'Chi rifiuta i nuovi libri diventa Vecchio Credente.',
            rules: [
                { from: 'ortodossi', to: 'vecchicredenti', rects: [ [770, 0, 880, 130] ] }
            ]
        }
    ];

    function schismsAt(turn) {
        const t = Math.floor(turn || 0);
        return SCHISMS.filter(s => s.turn === t);
    }

    const api = {
        FAITHS, DEFAULT_FAITH, SCHISMS,
        get, label, color, familyOf, exists,
        sameFaith, sameFamily, faithsAt,
        seedFaith, faithByRegion, schismsAt
    };

    root.Religions = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);

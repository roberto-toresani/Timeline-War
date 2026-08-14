/* ============================================================
   MAP-DECOR — vestizione "medievale" della mappa.

   Tutto quello che serve a far sembrare la mappa una carta antica sta qui, e
   agisce SOLO su elementi statici: il rettangolo di fondo (il mare) e una copia
   sfocata delle terre che fa da alone costiero. Le province vere non si toccano:
   app.js riscrive `fill` su ogni path a ogni refresh, quindi qualsiasi effetto
   messo lì verrebbe cancellato al primo cambio di turno.

   Struttura dell'SVG su cui lavoriamo (vedi data/embedded_map.js):
       svg#wrapper
         ├─ rect#svg-background     <- il mare: qui va il gradiente
         ├─ g#map-group             <- le terre (i marker stanno FUORI, sul root)
         └─ use/text ...            <- pedine, risorse, strade

   L'alone costiero è un <use> che riusa #map-group e lo passa in un filtro che
   ne appiattisce i colori a blu e lo sfoca: piazzato SOTTO il gruppo vero, di
   lui resta visibile solo il bordo che sborda dalle coste. Costa un solo nodo
   invece di clonare trecento path.
   ============================================================ */

(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';

    // I <defs> della decorazione, in un blocco solo: gradiente del mare, grana
    // della carta, alone delle coste. Gli id sono prefissati `decor-` per non
    // scontrarsi con i defs che app.js genera per risorse e pedine.
    const DEFS = `
        <!-- Ancorato alle coordinate della mappa (viewBox 1200x575) e non al
             riquadro del rettangolo: così il fondale può sbordare all'infinito
             senza che il gradiente si stiri con lui. -->
        <radialGradient id="decor-sea" gradientUnits="userSpaceOnUse" cx="600" cy="260" r="720">
            <stop offset="0%"   stop-color="#cfe3ee"/>
            <stop offset="55%"  stop-color="#b3d0e0"/>
            <stop offset="100%" stop-color="#8fb4ca"/>
        </radialGradient>

        <!-- Grana della carta: rumore frattale desaturato, tenuto molto tenue.
             RIPIEGO: di norma la grana è un bitmap cotto una volta sola (vedi
             bakeGrain piu' sotto), perché un filtro va rieseguito a ogni cambio
             di scala e questo, steso su tutto il fondale, era la voce più cara
             dello zoom. Questo filtro resta come rete di sicurezza se il canvas
             non è disponibile. -->
        <filter id="decor-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="7" result="noise"/>
            <feColorMatrix in="noise" type="saturate" values="0"/>
        </filter>

        <!-- Alone costiero: appiattisce l'ingresso a un blu unico (la matrice
             azzera i canali e li rimpiazza con una tinta fissa, tenendo l'alpha),
             poi due sfocature di raggio diverso danno l'onda vicino alla riva e
             quella larga al largo.
             La feColorMatrix NON è ornamentale: la copia congelata delle terre
             conserva class="state", e basta un selettore crudo altrove per
             ricolorarla di sabbia. Finché la tinta la impone il filtro, l'alone
             resta blu qualunque cosa gli finisca dentro. -->
        <filter id="decor-coast" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
            <feColorMatrix type="matrix" result="flat"
                values="0 0 0 0 0.17
                        0 0 0 0 0.40
                        0 0 0 0 0.56
                        0 0 0 1 0"/>
            <feGaussianBlur in="flat" stdDeviation="2.2" result="near"/>
            <feGaussianBlur in="flat" stdDeviation="7"   result="far"/>
            <feMerge>
                <feMergeNode in="far"/>
                <feMergeNode in="near"/>
            </feMerge>
        </filter>
    `;

    /* ------------------------------------------------------------------
       GRANA COTTA UNA VOLTA SOLA.

       Un `feTurbulence` non si calcola in coordinate mappa ma in pixel dello
       schermo: cambiare zoom cambia la risoluzione e obbliga il browser a
       rigenerare tutto il rumore, ogni singolo scatto di rotella. Qui il
       rumore lo generiamo noi una volta in una piastrella 256x256 e poi la
       ripetiamo con un `<pattern>`: da lì in poi zoomare costa quanto scalare
       un'immagine.

       Il rumore è frattale come prima (quattro ottave, ognuna col doppio delle
       celle della precedente) e ciclico sui bordi — gli indici del reticolo
       girano in modulo — così la piastrella si affianca a sé stessa senza
       mostrare la giuntura.
       ------------------------------------------------------------------ */

    const GRAIN_TILE = 256;

    function fractalField(size, seed) {
        let s = seed >>> 0;
        const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
        const out = new Float32Array(size * size);
        let amp = 1, total = 0;
        for (let o = 0; o < 4; o++) {
            // Come in feTurbulence: l'ottava PIÙ FITTA è quella a piena
            // ampiezza (una cella per pixel, cioè il grano della carta), le
            // successive sono più larghe e pesano la metà ogni volta. Invertirle
            // darebbe nuvoloni al posto della grana.
            const cells = size >> o;                // 256, 128, 64, 32 celle per lato
            const step = size / cells;
            const grid = new Float32Array(cells * cells);
            for (let i = 0; i < grid.length; i++) grid[i] = rnd();
            for (let y = 0; y < size; y++) {
                const gy = y / step, y0 = Math.floor(gy), fy = gy - y0;
                const sy = fy * fy * (3 - 2 * fy);
                const r0 = (y0 % cells) * cells, r1 = ((y0 + 1) % cells) * cells;
                for (let x = 0; x < size; x++) {
                    const gx = x / step, x0 = Math.floor(gx), fx = gx - x0;
                    const sx = fx * fx * (3 - 2 * fx);
                    const c0 = x0 % cells, c1 = (x0 + 1) % cells;
                    const a = grid[r0 + c0], b = grid[r0 + c1];
                    const c = grid[r1 + c0], d = grid[r1 + c1];
                    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
                    out[y * size + x] += (top + (bot - top) * sy) * amp;
                }
            }
            total += amp;
            amp /= 2;
        }
        for (let i = 0; i < out.length; i++) out[i] /= total;
        return out;
    }

    // Piastrella PNG in data URI, o null se il canvas non collabora.
    function bakeGrain() {
        try {
            const n = GRAIN_TILE;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = n;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            // Come nel filtro originale: il rumore fa sia il grigio sia
            // l'opacità, cioè macchia la carta invece di velarla in modo piatto.
            const lum = fractalField(n, 7);
            const alpha = fractalField(n, 1987);
            const img = ctx.createImageData(n, n);
            for (let i = 0; i < lum.length; i++) {
                const g = (lum[i] * 255) | 0;
                img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
                img.data[i * 4 + 3] = (alpha[i] * 255) | 0;
            }
            ctx.putImageData(img, 0, 0);
            const url = canvas.toDataURL('image/png');
            return url && url.length > 32 ? url : null;
        } catch (e) {
            return null;
        }
    }

    /* ------------------------------------------------------------------
       ORNAMENTI — rosa dei venti, cartiglio, velieri, serpente marino, onde.
       Coordinate nel sistema della mappa (viewBox 0 0 1200 575, mapping 1:1
       con l'SVG annidato). Le posizioni sono state scelte su acqua libera,
       verificando l'occupazione reale delle province: se un domani la mappa
       cambia, questi numeri vanno rifatti, non indovinati.
       Tutto il gruppo è `pointer-events: none` e sta SOTTO le terre, così un
       ornamento che sborda finisce coperto dalla costa invece che sopra.
       ------------------------------------------------------------------ */

    // Rosa dei venti: quattro punte lunghe, quattro corte in diagonale, e le
    // lettere dei punti cardinali. Ogni punta è mezza chiara e mezza scura,
    // come nelle carte nautiche, per darle rilievo.
    function compassRose(x, y, s) {
        const spike = (len, half, rot, side) =>
            `<path d="M0,-${len} L${side * half},0 L0,${half * 0.6} Z" transform="rotate(${rot})" opacity="${side > 0 ? .75 : .45}"/>`;
        let points = '';
        [0, 90, 180, 270].forEach(r => { points += spike(50, 8, r, 1) + spike(50, 8, r, -1); });
        [45, 135, 225, 315].forEach(r => { points += spike(30, 5, r, 1) + spike(30, 5, r, -1); });
        return `
        <g class="decor-rose" transform="translate(${x},${y}) scale(${s})">
            <circle r="58" fill="none" stroke-width="1"/>
            <circle r="44" fill="none" stroke-width="0.7"/>
            <circle r="9"  fill="none" stroke-width="0.7"/>
            <g class="decor-rose-points">${points}</g>
            <text y="-64" text-anchor="middle" font-size="15">N</text>
            <text y="74"  text-anchor="middle" font-size="15">S</text>
            <text x="68"  y="5" text-anchor="middle" font-size="15">E</text>
            <text x="-68" y="5" text-anchor="middle" font-size="15">O</text>
        </g>`;
    }

    // Veliero visto di lato. Le vele sono quadre e gonfie di vento (il lato
    // sinistro dritto sull'albero, il destro panciuto): a questa scala una vela
    // triangolare piccola si legge come una macchia, una quadra no.
    function ship(x, y, s, flip) {
        return `
        <g class="decor-ship" transform="translate(${x},${y}) scale(${flip ? -s : s},${s})">
            <path d="M-26,-3 h52 q-7,13 -26,13 q-19,0 -26,-13 z" stroke-width=".8"/>
            <path d="M-26,-3 h52" stroke-width="1.4" fill="none"/>
            <path d="M0,-3 V-40" stroke-width="1.4" fill="none"/>
            <path d="M-15,-37 q17,7 30,0 v13 q-13,7 -30,0 z" opacity=".6"/>
            <path d="M-17,-20 q19,8 34,0 v12 q-15,8 -34,0 z" opacity=".45"/>
            <path d="M0,-40 l14,4 -14,4 z" opacity=".85"/>
        </g>`;
    }

    // Serpente marino: le gobbe che escono e rientrano dall'acqua, la testa
    // alzata con la cresta. È il "hic sunt dracones" delle carte antiche.
    function seaSerpent(x, y, s) {
        return `
        <g class="decor-serpent" transform="translate(${x},${y}) scale(${s})">
            <path d="M0,0 q14,-20 28,0 M34,0 q14,-20 28,0 M68,0 q14,-20 28,0"
                  fill="none" stroke-width="3.4" stroke-linecap="round"/>
            <!-- collo che si alza dall'ultima gobba, poi la testa. Serve che si
                 legga come drago e non come pesce, quindi cranio allungato,
                 mascella staccata e corno all'indietro: sono quei tre pezzi a
                 fare la differenza a questa dimensione. -->
            <path d="M94,-2 q14,-4 18,-20" fill="none" stroke-width="3.4" stroke-linecap="round"/>
            <g transform="translate(110,-24) rotate(-22)">
                <ellipse cx="11" cy="0" rx="15" ry="6"/>
                <path d="M8,3 l18,3 -16,3 z" opacity=".75"/>
                <path d="M0,-4 l-9,-10 13,5 z" opacity=".7"/>
                <path d="M-4,-2 l-10,-6 11,1 z" opacity=".55"/>
                <circle cx="16" cy="-2" r="1.6" class="decor-eye"/>
            </g>
        </g>`;
    }

    // Onde stilizzate: due archetti sfalsati, il riempitivo classico degli oceani.
    function waves(list) {
        return list.map(([x, y, s]) => `
        <g class="decor-wave" transform="translate(${x},${y}) scale(${s || 1})">
            <path d="M0,0 q7,-6 14,0 q7,6 14,0" fill="none" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M6,7 q7,-6 14,0 q7,6 14,0" fill="none" stroke-width="1.6" stroke-linecap="round"/>
        </g>`).join('');
    }

    /* NOMI DELLE ACQUE — oceani e mari, in latino da carta antica.

       Stesso font delle province ('Cinzel', ereditato da #decor-ornaments):
       sono scrittura, non disegno, e stanno SOTTO le terre come tutto il
       gruppo — un nome che sborda finisce coperto dalla costa invece di
       galleggiarci sopra.

       Le coordinate sono MISURATE, non indovinate: la mappa è stata campionata
       a griglia con isPointInFill (terra/acqua) e ogni nome è stato messo dentro
       uno specchio d'acqua vero, con la dimensione che ci sta. Chi ne aggiunge
       o ne sposta uno rifaccia la misura, altrimenti il nome finisce sull'entroterra.

       `t` va a capo su '|': gli oceani grandi stanno su due righe, come nelle
       carte antiche, perché in orizzontale non ci starebbero mai.  */
    function waterName(t, x, y, size, sp, rot, cls) {
        const lines = t.split('|');
        const lh = size * 1.4;
        const y0 = -(lines.length - 1) * lh / 2;
        // letter-spacing aggiunge spazio anche DOPO l'ultima lettera: con
        // text-anchor="middle" la riga risulterebbe spostata a sinistra di
        // mezza spaziatura. Il dx la rimette in asse.
        const rows = lines.map((s, i) =>
            `<tspan x="${(sp / 2).toFixed(2)}" y="${(y0 + i * lh).toFixed(1)}">${s}</tspan>`).join('');
        return `
        <text class="decor-water ${cls}" transform="translate(${x},${y}) rotate(${rot || 0})"
              text-anchor="middle" dominant-baseline="central"
              font-size="${size}" letter-spacing="${sp}">${rows}</text>`;
    }

    // Oceani: due righe, lettere larghe. Mari: corpo piccolo, e dove il bacino
    // è storto (Mediterraneo) il nome si corica sul suo stesso angolo.
    // Mancano apposta Mar Rosso, Golfo Persico, Caspio, Mare del Nord e Baltico:
    // su questa mappa sono corridoi da 8-15 unità, e un nome che ci stia dentro
    // sarebbe illeggibile. Meglio nessun nome che una riga di formiche.
    const WATERS = [
        ['OCEANVS GLACIALIS',  642,  10, 11, 4,   0, 'ocean'],
        ['OCEANVS|ATLANTICVS', 478, 152, 13, 5,  -6, 'ocean'],
        ['OCEANVS|PACIFICVS',  112, 248, 13, 5,   0, 'ocean'],
        ['MARE|PACIFICVM',    1090, 232, 13, 5,   0, 'ocean'],
        ['MARE|AETHIOPICVM',   550, 352, 12, 4,   0, 'ocean'],
        ['OCEANVS|INDICVS',    848, 318, 13, 5,   0, 'ocean'],
        ['OCEANVS AVSTRALIS',  205, 542, 11, 4,   0, 'ocean'],

        ['MARE NORDICVM',      580,  64, 5.5, 1,   0, 'sea'],
        ['MARE MEDITERRANEVM', 676, 188, 4.7, 1,   7.5, 'sea'],
        ['PONTVS EVXINVS',     715, 156, 3.8, 0.3, 0, 'sea'],
        ['MARE CARIBAEVM',     345, 250, 5.5, 1,   0, 'sea'],
        ['MARE ARABICVM',      814, 251, 5,   1,   0, 'sea'],
        ['MARE SINENSE',       978, 249, 4.2, 0.6, 0, 'sea']
    ].map(a => waterName.apply(null, a)).join('');

    // Cartiglio: pergamena srotolata con i due capi avvolti, in fondo alla carta.
    function cartouche(x, y, w, label) {
        const h = 34, half = w / 2;
        return `
        <g class="decor-cartouche" transform="translate(${x},${y})">
            <path d="M${-half},${-h / 2} h${w} v${h} h${-w} z" class="decor-scroll"/>
            <path d="M${-half},${-h / 2} q-16,${h / 2} 0,${h} q-9,${-h / 2} 0,${-h} z" class="decor-scroll-end"/>
            <path d="M${half},${-h / 2} q16,${h / 2} 0,${h} q9,${-h / 2} 0,${-h} z" class="decor-scroll-end"/>
            <text y="7" text-anchor="middle" font-size="21" letter-spacing="4">${label}</text>
        </g>`;
    }

    const ORNAMENTS = `
        ${WATERS}
        ${compassRose(105, 370, 1.15)}
        ${cartouche(640, 545, 400, 'ORBIS TERRARVM')}
        ${seaSerpent(12, 175, 1.1)}
        ${ship(255, 480, 1.6, false)}
        ${ship(985, 520, 1.5, true)}
        ${waves([[55, 300, 1.1], [150, 470, 1], [270, 155, .9], [470, 500, 1], [560, 430, 1], [700, 480, 1], [830, 440, 1], [1010, 545, 1], [1090, 300, .9], [1130, 460, 1]])}
    `;

    function decorate(svg) {
        if (!svg || svg.querySelector('#decor-defs')) return;   // già vestita

        const bg = svg.querySelector('#svg-background');
        const land = svg.querySelector('#map-group');
        if (!bg || !land) return;   // mappa diversa da quella attesa: lascia stare

        const defs = document.createElementNS(SVG_NS, 'defs');
        defs.id = 'decor-defs';
        defs.innerHTML = DEFS;
        svg.insertBefore(defs, svg.firstChild);

        // 1. il mare prende il gradiente al posto del bianco piatto. L'SVG sorgente
        //    porta anche un background-color bianco inline, che si vedrebbe come
        //    cornice chiara intorno alla carta quando la mappa è inquadrata stretta.
        bg.setAttribute('fill', 'url(#decor-sea)');
        svg.style.backgroundColor = 'transparent';

        // Il fondale sborda ben oltre la tela: quando la mappa è inquadrata su un
        // regno (viewBox stretto) il mare deve continuare fino al bordo del telaio.
        const OVER = { x: -1800, y: -1200, width: 4800, height: 3000 };
        Object.entries(OVER).forEach(([k, v]) => bg.setAttribute(k, v));

        // 2. velo di grana sopra il mare, sotto le terre. La piastrella cotta
        //    una volta si ripete con un pattern; solo se il canvas non risponde
        //    si ripiega sul filtro (che però fa singhiozzare lo zoom).
        const grain = document.createElementNS(SVG_NS, 'rect');
        grain.id = 'decor-grain-layer';
        Object.entries(OVER).forEach(([k, v]) => grain.setAttribute(k, v));
        const tile = bakeGrain();
        if (tile) {
            const pat = document.createElementNS(SVG_NS, 'pattern');
            pat.id = 'decor-grain-tile';
            pat.setAttribute('patternUnits', 'userSpaceOnUse');
            pat.setAttribute('width', GRAIN_TILE);
            pat.setAttribute('height', GRAIN_TILE);
            const im = document.createElementNS(SVG_NS, 'image');
            im.setAttribute('href', tile);
            im.setAttribute('width', GRAIN_TILE);
            im.setAttribute('height', GRAIN_TILE);
            im.setAttribute('preserveAspectRatio', 'none');
            pat.appendChild(im);
            defs.appendChild(pat);
            grain.setAttribute('fill', 'url(#decor-grain-tile)');
        } else {
            grain.setAttribute('filter', 'url(#decor-grain)');
        }
        grain.setAttribute('opacity', '0.13');
        grain.setAttribute('pointer-events', 'none');
        bg.after(grain);

        // 2-bis. ornamenti da carta antica, sopra il mare e sotto le terre
        const orn = document.createElementNS(SVG_NS, 'g');
        orn.id = 'decor-ornaments';
        orn.setAttribute('pointer-events', 'none');
        orn.innerHTML = ORNAMENTS;
        grain.after(orn);

        // 3. alone costiero: silhouette CONGELATA delle terre, subito sotto quelle vere.
        //    Un <use> di #map-group sarebbe stato un nodo solo, ma seguendo il gruppo
        //    vivo costringeva il browser a ripassare il filtro a ogni ricolorazione
        //    (misurato: +80ms per refresh). Una copia inerte lo fa calcolare una volta.
        const halo = land.cloneNode(true);
        halo.id = 'decor-coast-layer';
        halo.setAttribute('filter', 'url(#decor-coast)');
        halo.setAttribute('pointer-events', 'none');
        // via gli id duplicati: due elementi con lo stesso id romperebbero
        // getElementById e i selettori di app.js.
        halo.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        land.before(halo);
    }

    window.MapDecor = { decorate };
})();

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
             Sostituisce il piatto assoluto del fondo bianco originale. -->
        <filter id="decor-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="7" result="noise"/>
            <feColorMatrix in="noise" type="saturate" values="0"/>
        </filter>

        <!-- Alone costiero: appiattisce l'ingresso a un blu unico (la matrice
             azzera i canali e li rimpiazza con una tinta fissa, tenendo l'alpha),
             poi due sfocature di raggio diverso danno l'onda vicino alla riva e
             quella larga al largo. -->
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

        // 2. velo di grana sopra il mare, sotto le terre
        const grain = document.createElementNS(SVG_NS, 'rect');
        grain.id = 'decor-grain-layer';
        Object.entries(OVER).forEach(([k, v]) => grain.setAttribute(k, v));
        grain.setAttribute('filter', 'url(#decor-grain)');
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

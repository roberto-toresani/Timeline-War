/* ============================================================
   MAP-CITY — l'insediamento che cresce con lo zoom (LOD).

   Idea (richiesta dell'utente): da lontano la mappa resta minimale, con il
   solo glifo-icona della città. Avvicinandosi, SU quella provincia l'icona
   lascia il posto a una PIANTA 2D di città cinta da mura — nello spirito delle
   mappe fantasy di città, ma molto più semplice. De-zoomando, la pianta si
   dissolve e torna l'icona.

   Come si incastra nel resto:
   - NON tocca `renderPiecesForPath`: la pianta è un overlay `.city-plan` sul
     root <svg>, sopra il glifo. Il glifo resta sotto, ma la pianta ha un fondo
     pieno e lo copre; così la nebbia e il refresh delle pedine non vanno
     gestiti qui.
   - Si aggiorna SOLO quando la gesture di zoom si posa (app.js chiama
     `MapCity.update`), mai a ogni frame: la generazione è più cara di una
     pedina e non deve pesare sullo zoom fluido.
   - La forma è SEMINATA dall'id della provincia: una città ha sempre la stessa
     pianta, partita dopo partita. Le torri e il mastio si tingono del colore
     dell'armata che la possiede — primo passo verso il "ridisegno" per
     giocatore (stile mura + nome), che leggiamo già da `data-city-*` se
     presenti.

   La soglia di comparsa è ADATTIVA: conta quanto la provincia riempie la
   vista (bbox / viewBox), non lo zoom assoluto — così una provincia minuscola
   mostra la pianta solo quando ci si è avvicinati davvero. Isteresi fra
   comparsa e scomparsa per non far lampeggiare la pianta al confine.
   ============================================================ */

(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Soglie LOD progressive: frazione della larghezza del viewBox coperta
    // dalla provincia. Avvicinandosi compaiono, in ordine: il terreno vestito
    // (erba/sabbia), poi alberelli e rocce, poi — SOLO a zoom molto avanzato —
    // la pianta della città, che resta un BORGO dentro la provincia, non la
    // riempie tutta.
    const T_GROUND  = 0.12;   // vestizione del terreno
    const T_SCATTER = 0.28;   // alberelli, rocce, ciuffi
    const SHOW = 0.62;        // la pianta compare quando la provincia riempie la vista
    const HIDE = 0.48;        // sotto questa, torna l'icona (isteresi fra le due)

    // Tavolozza "carta antica" coerente con map-decor.
    const COL = {
        wall:   '#ece0c2',   // pietra delle mura
        wallIn: '#ddceac',   // ombra interna del cammino di ronda
        ink:    '#3b3120',   // contorni a inchiostro
        roadFill:'#e7d8b5',  // strade sterrate
        ground: '#d8c9a2',   // terra dentro le mura
        roofWarm:'#bd5a39',  // tetti in coppi
        roofSlate:'#43607c', // tetti in ardesia
        roofRidge:'#2c2318'  // colmo del tetto
    };

    /* ---- piccolo RNG deterministico (mulberry32 + hash di stringa) ---- */
    function hashStr(s) {
        let h = 1779033703 ^ s.length;
        for (let i = 0; i < s.length; i++) {
            h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        return h >>> 0;
    }
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ---- geometria della città (in uno spazio a raggio ~100) ---- */
    function townGeometry(rng, kind, wallStyle) {
        const big = kind === 'capitale';
        const fort = kind === 'fortezza';
        const N = fort ? (7 + (rng() * 2 | 0))
                : big ? (11 + (rng() * 3 | 0))
                      : (9 + (rng() * 3 | 0));
        const gate = rng() * N | 0;
        const verts = [];
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2 + (rng() - 0.5) * 0.12;
            const rad = 100 * (0.86 + rng() * 0.14);
            verts.push({ a, x: Math.cos(a) * rad, y: Math.sin(a) * rad, gate: i === gate, sq: wallStyle === 'square' });
        }
        // Case: rettangoli ruotati, più densi verso il centro, lontani dal mastio.
        const nB = fort ? (6 + (rng() * 4 | 0))
                 : big ? (16 + (rng() * 8 | 0))
                       : (11 + (rng() * 6 | 0));
        const builds = [];
        let tries = 0;
        while (builds.length < nB && tries < nB * 7) {
            tries++;
            const a = rng() * Math.PI * 2;
            const r = Math.sqrt(rng()) * 66;
            const x = Math.cos(a) * r, y = Math.sin(a) * r;
            if (Math.hypot(x, y) < 15) continue;          // lascia libero il centro
            builds.push({
                x, y,
                w: 9 + rng() * 9,
                h: 7 + rng() * 7,
                rot: (rng() - 0.5) * 0.9,
                slate: rng() < 0.45
            });
        }
        // Strade: dalla porta verso il centro, con una traversa.
        const g = verts[gate];
        const roads = [
            [[g.x * 0.96, g.y * 0.96], [0, 0]],
            [[-60, 18], [55, -10]]
        ];
        return { N, verts, gate, builds, roads, big, fort };
    }

    function el(name, attrs) {
        const n = document.createElementNS(SVG_NS, name);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        return n;
    }

    // Tinge una pietra chiara verso il colore dell'armata (mix leggero).
    function tint(hex, owner, amt) {
        if (!owner || owner[0] !== '#' || owner.length < 7) return hex;
        const a = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        const b = [parseInt(owner.slice(1, 3), 16), parseInt(owner.slice(3, 5), 16), parseInt(owner.slice(5, 7), 16)];
        const m = a.map((v, i) => Math.round(v + (b[i] - v) * amt));
        return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
    }

    /* ---- costruzione del gruppo SVG della pianta ---- */
    function buildPlan(prov, kind, color, name, wallStyle) {
        const rng = mulberry32(hashStr(prov + '|' + kind));
        const G = townGeometry(rng, kind, wallStyle);
        const g = el('g', { class: 'city-plan', 'data-prov': prov, 'pointer-events': 'none' });

        // 1) terra dentro le mura (alone morbido)
        g.appendChild(el('circle', { cx: 0, cy: 0, r: 96, fill: COL.ground, opacity: 0.85 }));

        // 2) anello di mura
        let d = 'M' + G.verts.map(v => v.x.toFixed(1) + ',' + v.y.toFixed(1)).join(' L') + ' Z';
        g.appendChild(el('path', { d, fill: COL.wall, stroke: COL.ink, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
        // cammino di ronda interno
        let d2 = 'M' + G.verts.map(v => (v.x * 0.9).toFixed(1) + ',' + (v.y * 0.9).toFixed(1)).join(' L') + ' Z';
        g.appendChild(el('path', { d: d2, fill: 'none', stroke: COL.wallIn, 'stroke-width': 1.4 }));

        // 3) strade
        G.roads.forEach(r => {
            g.appendChild(el('line', {
                x1: r[0][0].toFixed(1), y1: r[0][1].toFixed(1),
                x2: r[1][0].toFixed(1), y2: r[1][1].toFixed(1),
                stroke: COL.roadFill, 'stroke-width': 5, 'stroke-linecap': 'round'
            }));
        });

        // 4) case
        G.builds.forEach(b => {
            const roof = b.slate ? COL.roofSlate : COL.roofWarm;
            const r = el('rect', {
                x: (-b.w / 2).toFixed(1), y: (-b.h / 2).toFixed(1),
                width: b.w.toFixed(1), height: b.h.toFixed(1),
                rx: 1, fill: roof, stroke: COL.ink, 'stroke-width': 0.8,
                transform: `translate(${b.x.toFixed(1)},${b.y.toFixed(1)}) rotate(${(b.rot * 57.3).toFixed(1)})`
            });
            g.appendChild(r);
        });

        // 5) mastio / cattedrale al centro, tinto del colore del regno
        const keepCol = tint('#cdbb95', color, 0.55);
        if (G.big) {
            g.appendChild(el('circle', { cx: 0, cy: 0, r: 12, fill: keepCol, stroke: COL.ink, 'stroke-width': 1.4 }));
            g.appendChild(el('line', { x1: 0, y1: -12, x2: 0, y2: -24, stroke: COL.ink, 'stroke-width': 1.2 }));
            g.appendChild(el('path', { d: 'M0,-24 L9,-21 L0,-18 Z', fill: color || COL.roofWarm, stroke: COL.ink, 'stroke-width': 0.6 }));
        } else {
            g.appendChild(el('rect', { x: -10, y: -11, width: 20, height: 22, rx: 1.5, fill: keepCol, stroke: COL.ink, 'stroke-width': 1.4 }));
        }

        // 6) torri sui vertici (tonde o quadrate), più grandi alla porta
        const towerCol = tint(COL.wall, color, 0.28);
        G.verts.forEach(v => {
            const rr = (G.fort ? 6.5 : 6) * (v.gate ? 1.35 : 1);
            if (v.sq) {
                g.appendChild(el('rect', {
                    x: (v.x - rr).toFixed(1), y: (v.y - rr).toFixed(1),
                    width: (rr * 2).toFixed(1), height: (rr * 2).toFixed(1),
                    rx: 1, fill: towerCol, stroke: COL.ink, 'stroke-width': 1.3
                }));
            } else {
                g.appendChild(el('circle', { cx: v.x.toFixed(1), cy: v.y.toFixed(1), r: rr.toFixed(1), fill: towerCol, stroke: COL.ink, 'stroke-width': 1.3 }));
            }
            if (v.gate) {
                // arco della porta
                g.appendChild(el('circle', { cx: (v.x * 0.98).toFixed(1), cy: (v.y * 0.98).toFixed(1), r: 2.4, fill: COL.ink }));
            }
        });

        // 7) cartiglio col nome città
        if (name) {
            const w = Math.min(190, 30 + name.length * 11);
            g.appendChild(el('rect', { x: (-w / 2).toFixed(1), y: 110, width: w.toFixed(1), height: 26, rx: 6, fill: '#f3e9cf', stroke: COL.ink, 'stroke-width': 1, opacity: 0.92 }));
            const t = el('text', {
                x: 0, y: 128, 'text-anchor': 'middle', 'font-size': 17,
                'font-family': 'Georgia, "Times New Roman", serif', 'font-weight': '600',
                fill: COL.ink
            });
            t.textContent = name;
            g.appendChild(t);
        }

        // 8) FUMO dei camini: ora vive DENTRO la pianta, così sale solo quando
        //    la città è "aperta" in zoom (richiesta dell'utente) e sparisce da
        //    lontano con l'icona. Riusa le classi .settle-smoke/.smoke-puff già
        //    in style.css (animazione + reduced-motion). Due o tre fili sopra i
        //    tetti, sfalsati nel tempo.
        const chimneys = G.big ? 3 : (G.fort ? 1 : 2);
        for (let c = 0; c < chimneys; c++) {
            const b = G.builds[(c * 3 + 1) % G.builds.length] || { x: 0, y: -20 };
            const sm = el('g', { class: 'settle-smoke', transform: `translate(${b.x.toFixed(1)},${(b.y - 6).toFixed(1)})` });
            [0, 1, 2].forEach(i => {
                const p = el('circle', { class: 'smoke-puff', cx: 0, cy: 0, r: (2.6 * (1 + i * 0.12)).toFixed(2), fill: '#6b6256' });
                p.style.setProperty('--rise', '48px');
                p.style.animationDelay = (c * 0.5 + i * 1.05).toFixed(2) + 's';
                sm.appendChild(p);
            });
            g.appendChild(sm);
        }

        return g;
    }

    /* =====================================================================
       VESTIZIONE DEL TERRENO (erba/sabbia, ombre, alberelli).

       Sotto zoom la terra non è più una macchia colorata: prende un velo del
       suo bioma (erba o sabbia) e si popola di alberelli, rocce e ciuffi
       d'erba con l'ombra, nello spirito della mappa-città di riferimento. Il
       colore politico resta (il velo è semitrasparente), così si continua a
       capire di chi è la provincia.

       Il bioma per ora è `data-biome` sul path (default erba): un domani lo
       popoleremo per bene; il motore grafico è già pronto a leggerlo.
       ===================================================================== */
    function groundColors(biome) {
        if (biome === 'sand') return { base: '#d9c48a', tree: '#718f41', tree2: '#8aa85a', trunk: '#8a6a3c', rock: '#c3b48c', tuft: '#9caf62' };
        return { base: '#a6c078', tree: '#4e7a33', tree2: '#6f9c45', trunk: '#6b4a2b', rock: '#a59f90', tuft: '#5d8a34' };
    }

    // Un alberello: ombra morbida + tronco + chioma a più palle con luce.
    function buildTree(x, y, r, pal) {
        const g = el('g', { transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` });
        g.appendChild(el('ellipse', { cx: r * 0.3, cy: r * 0.72, rx: r * 0.95, ry: r * 0.4, fill: '#000', opacity: 0.16 }));
        g.appendChild(el('rect', { x: -r * 0.12, y: 0, width: r * 0.24, height: r * 0.7, fill: pal.trunk }));
        g.appendChild(el('circle', { cx: -r * 0.4, cy: -r * 0.1, r: r * 0.55, fill: pal.tree }));
        g.appendChild(el('circle', { cx: r * 0.4, cy: -r * 0.1, r: r * 0.5, fill: pal.tree }));
        g.appendChild(el('circle', { cx: 0, cy: -r * 0.6, r: r * 0.62, fill: pal.tree }));
        g.appendChild(el('circle', { cx: -r * 0.18, cy: -r * 0.72, r: r * 0.28, fill: pal.tree2 }));
        return g;
    }
    function buildRock(x, y, r, pal) {
        const g = el('g', { transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` });
        g.appendChild(el('ellipse', { cx: r * 0.25, cy: r * 0.5, rx: r * 1, ry: r * 0.35, fill: '#000', opacity: 0.14 }));
        g.appendChild(el('path', { d: `M${-r},${r * 0.3} Q${-r * 0.8},${-r * 0.7} 0,${-r * 0.5} Q${r},${-r * 0.6} ${r * 0.9},${r * 0.35} Z`, fill: pal.rock, stroke: '#6f6a5c', 'stroke-width': r * 0.08 }));
        return g;
    }
    function buildTuft(x, y, r, pal) {
        const g = el('g', { transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`, stroke: pal.tuft, 'stroke-width': Math.max(0.4, r * 0.18), 'stroke-linecap': 'round', fill: 'none' });
        g.appendChild(el('path', { d: `M0,0 Q${-r * 0.3},${-r * 0.7} ${-r * 0.5},${-r}` }));
        g.appendChild(el('path', { d: `M0,0 L0,${-r * 1.1}` }));
        g.appendChild(el('path', { d: `M0,0 Q${r * 0.3},${-r * 0.7} ${r * 0.5},${-r}` }));
        return g;
    }

    // Velo del bioma: una copia della provincia, tinta e semitrasparente.
    function buildGroundWash(path, biome) {
        const clone = path.cloneNode(false);
        clone.removeAttribute('id');
        clone.removeAttribute('data-pieces');
        clone.setAttribute('class', 'ground-wash');
        clone.setAttribute('fill', groundColors(biome).base);
        clone.setAttribute('stroke', 'none');
        clone.setAttribute('pointer-events', 'none');
        return clone;
    }

    // Spargimento di alberelli/rocce/ciuffi dentro i confini della provincia.
    function buildScatter(path, bb, biome, avoid) {
        const g = el('g', { class: 'ground-scatter', 'pointer-events': 'none' });
        const pal = groundColors(biome);
        const rng = mulberry32(hashStr(path.id + '|scatter'));
        const unit = Math.max(bb.width, bb.height);
        // Densità BASSA: pochi alberelli a dare vita, non una foresta.
        const target = Math.max(2, Math.min(13, Math.round((bb.width * bb.height) / (unit * 5.5))));
        const sz = Math.max(1.1, Math.min(bb.width, bb.height) * 0.045);
        const PIP = (window.MapAnchors && MapAnchors.pointInPath) ? MapAnchors.pointInPath : null;
        let placed = 0, tries = 0;
        while (placed < target && tries < target * 9) {
            tries++;
            const x = bb.x + rng() * bb.width, y = bb.y + rng() * bb.height;
            try { if (PIP && !PIP(path, x, y)) continue; } catch (e) { }
            if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < avoid.r) continue;
            const k = rng();
            if (biome === 'sand') {
                if (k < 0.5) g.appendChild(buildRock(x, y, sz * (0.7 + rng() * 0.5), pal));
                else if (k < 0.72) g.appendChild(buildTree(x, y, sz * (0.8 + rng() * 0.6), pal));
                else g.appendChild(buildTuft(x, y, sz * 0.9, pal));
            } else {
                if (k < 0.56) g.appendChild(buildTree(x, y, sz * (0.8 + rng() * 0.7), pal));
                else if (k < 0.76) g.appendChild(buildRock(x, y, sz * (0.6 + rng() * 0.4), pal));
                else g.appendChild(buildTuft(x, y, sz * 0.95, pal));
            }
            placed++;
        }
        return g;
    }

    /* ---- stato: piante e terreni già in scena, per provincia ---- */
    const cities = Object.create(null);    // prov -> { node, sig }
    const grounds = Object.create(null);   // prov -> { node, sig }

    function citySig(kind, color, name, wall) {
        return kind + '|' + (color || '') + '|' + (name || '') + '|' + (wall || '');
    }

    function settlementKind(path) {
        const p = path.getAttribute('data-pieces') || '';
        if (p.indexOf('capitale') >= 0) return 'capitale';
        if (p.indexOf('citta') >= 0) return 'citta';
        if (p.indexOf('fortezza') >= 0) return 'fortezza';
        return null;
    }

    // app.js chiama questo quando lo zoom si posa. ctx = { anchorOf, colorOf,
    // nameOf } risolve sul path (vivono nella closure di app.js).
    function update(svg, factor, vb, ctx) {
        if (!svg || !vb) return;
        const parent = svg.querySelector('#map-group') || svg;
        // Tutte le province vere (i cloni dell'alone perdono l'id → `[id]` li esclude).
        const paths = svg.querySelectorAll('path.state[id]');
        const vx0 = vb.x, vy0 = vb.y, vx1 = vb.x + vb.w, vy1 = vb.y + vb.h;

        paths.forEach(path => {
            const id = path.id;
            let bb; try { bb = path.getBBox(); } catch (e) { return; }
            if (!bb || !bb.width) { dropGround(id); dropCity(id); return; }
            // fuori dalla vista: niente di niente
            if (bb.x > vx1 || bb.x + bb.width < vx0 || bb.y > vy1 || bb.y + bb.height < vy0) {
                dropGround(id); dropCity(id); return;
            }
            // Le province d'acqua non si vestono di terra (niente erba né alberi in mare).
            let water = false;
            try { water = !!(window.MapAnchors && MapAnchors.isWater && MapAnchors.isWater(path)); } catch (e) { }
            if (water) { dropGround(id); dropCity(id); return; }

            const ratio = bb.width / vb.w;
            const kind = settlementKind(path);

            // ancora dell'insediamento: serve sia alla città sia a tener puliti
            // gli alberelli attorno alla città. La città è un BORGO dentro la
            // provincia (~1/4 del lato minore), non la riempie tutta.
            const a = kind ? (ctx.anchorOf(path) || { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, r: Math.min(bb.width, bb.height) / 2 }) : null;
            const planR = a ? Math.max(5, Math.min(a.r * 0.95, Math.min(bb.width, bb.height) * 0.26)) : 0;

            /* --- TERRENO --- */
            const gWant = grounds[id] ? ratio > T_GROUND * 0.7 : ratio > T_GROUND;
            if (gWant) {
                const biome = path.getAttribute('data-biome') || 'grass';
                const scatter = ratio > T_SCATTER;
                const sig = biome + '|' + (scatter ? 1 : 0);
                const cur = grounds[id];
                if (!cur || cur.sig !== sig) {
                    dropGround(id, true);
                    const node = el('g', { class: 'ground-lod', 'data-prov': id, 'pointer-events': 'none' });
                    node.appendChild(buildGroundWash(path, biome));
                    if (scatter) {
                        // Clip sui confini della provincia: una garanzia in più che
                        // nessun alberello sbordi in mare o nella provincia vicina.
                        const clipId = 'gclip-' + id.replace(/[^\w-]/g, '_');
                        const cp = el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
                        const cpath = path.cloneNode(false);
                        cpath.removeAttribute('id'); cpath.removeAttribute('class'); cpath.removeAttribute('data-pieces');
                        cp.appendChild(cpath);
                        node.appendChild(cp);
                        const sc = buildScatter(path, bb, biome, a ? { x: a.x, y: a.y, r: planR * 1.3 } : null);
                        sc.setAttribute('clip-path', 'url(#' + clipId + ')');
                        node.appendChild(sc);
                    }
                    parent.appendChild(node);
                    requestAnimationFrame(() => node.classList.add('shown'));
                    grounds[id] = { node, sig };
                } else {
                    cur.node.classList.add('shown');
                }
            } else {
                dropGround(id);
            }

            /* --- PIANTA CITTÀ --- */
            if (kind) {
                const cWant = cities[id] ? ratio > HIDE : ratio > SHOW;
                if (cWant) {
                    const color = ctx.colorOf(path);
                    const name = path.getAttribute('data-city-name') || ctx.nameOf(path);
                    const wall = path.getAttribute('data-wall') || '';
                    const sig = citySig(kind, color, name, wall);
                    const s = planR / 100;
                    const tr = `translate(${a.x.toFixed(2)},${a.y.toFixed(2)}) scale(${s.toFixed(4)})`;
                    const cur = cities[id];
                    if (!cur || cur.sig !== sig) {
                        dropCity(id, true);
                        const node = buildPlan(id, kind, color, name, wall);
                        node.setAttribute('transform', tr);
                        svg.appendChild(node);
                        requestAnimationFrame(() => node.classList.add('shown'));
                        cities[id] = { node, sig };
                    } else {
                        cur.node.setAttribute('transform', tr);
                        cur.node.classList.add('shown');
                    }
                } else { dropCity(id); }
            } else { dropCity(id); }
        });
    }

    function fade(reg, prov, now) {
        const cur = reg[prov];
        if (!cur) return;
        delete reg[prov];
        const n = cur.node;
        if (now) { if (n.parentNode) n.parentNode.removeChild(n); return; }
        n.classList.remove('shown');
        setTimeout(() => { if (n.parentNode) n.parentNode.removeChild(n); }, 320);
    }
    function dropCity(prov, now) { fade(cities, prov, now); }
    function dropGround(prov, now) { fade(grounds, prov, now); }

    function clear(svg) {
        for (const k in cities) delete cities[k];
        for (const k in grounds) delete grounds[k];
        if (svg) svg.querySelectorAll('.city-plan, .ground-lod').forEach(n => n.remove());
    }

    // buildPlan esposto: serve all'anteprima e alla futura UI di
    // personalizzazione (stile mura + nome) dove il giocatore vede la pianta
    // aggiornarsi mentre sceglie.
    window.MapCity = { update, clear, buildPlan };
})();

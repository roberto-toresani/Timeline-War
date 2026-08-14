// sea-routes.js — QUANTO LONTANO ARRIVA UNA NAVE (docs/GAME_DESIGN.md §9.2)
//
// La portata di una nave si misura SULL'ACQUA, non in linea d'aria: gira attorno
// alle penisole, passa per gli stretti, si ferma sulle coste. Non è un dettaglio
// di precisione — misurato su questa mappa, dalla Normandia il Languedoc (costa
// mediterranea, oltre tutta la Francia) dista 16,4 unità in linea d'aria e le
// Asturie 21,8: un cerchio geometrico abbastanza largo da mostrare la Spagna del
// nord farebbe attaccare Montpellier a una nave ferma nella Manica.
//
// Come funziona
// -------------
// Una griglia di celle da CELL unità copre la mappa. Ogni cella è acqua o terra;
// le celle di terra sanno a quale provincia appartengono. Da lì:
//   reach(svg, provId, R) → Dijkstra sull'acqua a partire dalla costa di provId,
//   fermato a R, e per ogni cella d'acqua raggiunta si segnano le province che
//   tocca. Il risultato è "che cosa vede/attacca una nave ancorata lì".
//
// La griglia si costruisce UNA volta per mappa, con due passate di rasterizzazione
// (prepare(), asincrona, ~1s):
//   1. maschera terra/acqua — tutte le province dello stesso colore, antialiasing
//      acceso: i bordi condivisi si fondono e non nascono fessure fasulle fra due
//      province. Una cella è acqua se ANCHE UN SOLO sottocampione è acqua: è quello
//      che tiene aperti gli stretti veri (Gibilterra è larga ~1 unità).
//   2. indice delle province — un colore diverso per provincia e `shape-rendering:
//      crispEdges` (niente antialiasing, quindi niente colori mescolati da
//      decodificare). Qui le fessure fra province non fanno danno: servono solo ad
//      attribuire a una provincia una cella già dichiarata terra dalla passata 1.
//
// Finché prepare() non ha finito si ripiega su un test punto-per-punto (isPointInFill
// con indice per bounding box), che è lento ma corretto: la portata non dipende mai
// dal fatto che il raster sia pronto, solo la velocità.
//
// Distanze di riferimento misurate su questa mappa (rotta di mare, unità SVG;
// la mappa è 1200x575, 1 unità ≈ 33 km):
//   Normandia→Olanda 12 · Sicilia→Tunisia 4 · Barcellona→Gerusalemme 111
//   Barcellona→Cuba 278 · Barcellona→India 612 · Barcellona→Giava 666
// Portate di §9.2: Nave 12, Veliero 170.

(function (global) {
    'use strict';

    // La mappa vive in uno spazio di coordinate fisso 1200x575 (viewBox dell'SVG
    // embeddato). Lo zoom riscrive il viewBox ma non questo spazio.
    const MAP_W = 1200, MAP_H = 575;
    const CELL = 1.5;               // lato della cella, come WCELL di map-anchors.js
    const SUB = 3;                  // sottocampioni per lato → raster a 0.5 unità/px
    const GW = Math.ceil(MAP_W / CELL);
    const GH = Math.ceil(MAP_H / CELL);
    const DIAG = CELL * Math.SQRT2;

    const WATER = 0, LAND = 1, UNKNOWN = 2;
    const NO_PROV = -1;

    // ------------------------------------------------------------------ griglia
    function gridOf(svg) {
        if (!svg.__seaGrid) {
            svg.__seaGrid = {
                kind: new Uint8Array(GW * GH).fill(UNKNOWN),
                prov: new Int16Array(GW * GH).fill(NO_PROV),
                ids: [],            // indice → id provincia
                index: new Map(),   // id provincia → indice
                bbox: null,         // indice per bounding box (ripiego lento)
                // ISOLE PIÙ PICCOLE DI UNA CELLA (Canarie, Malta, Egeo, Antille):
                // non riempiono mai una cella di terra, quindi la griglia le
                // perderebbe e nessuna nave le vedrebbe. Si registrano a parte,
                // sulle celle d'ACQUA che occupano: cella → indici di provincia.
                tiny: new Map(),
                tinyDone: false,
                ready: false,
                pending: null
            };
        }
        return svg.__seaGrid;
    }

    function provincePathsOf(svg) {
        const group = svg.querySelector('#map-group') || svg;
        return Array.prototype.slice.call(group.querySelectorAll('path.state'))
            .filter(p => p.id);
    }

    // Le province che scavalcano il bordo mappa (Alaska, Ciukotka) hanno un
    // bounding box largo quanto il mondo: nei test punto-per-punto risponderebbero
    // "sì" ovunque. Si scartano dal ripiego, come fa GameSetup con le regioni.
    function buildBBoxIndex(svg, g) {
        if (g.bbox) return g.bbox;
        const out = [];
        provincePathsOf(svg).forEach(path => {
            let b; try { b = path.getBBox(); } catch (e) { return; }
            if (!b || b.width > MAP_W / 3) return;
            out.push({ path, x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height });
        });
        g.bbox = out;
        return out;
    }

    function pointInPath(path, x, y) {
        try { return path.isPointInFill(new DOMPoint(x, y)); } catch (e) { return false; }
    }

    // Verdetto lento ma sempre disponibile per UNA cella.
    function classifyCell(svg, g, i, j) {
        const idx = buildBBoxIndex(svg, g);
        // Acqua se anche un solo sottocampione è acqua: stessa regola del raster,
        // così i due percorsi danno la stessa mappa.
        let land = null;
        for (let b = 0; b < SUB; b++) {
            for (let a = 0; a < SUB; a++) {
                const x = (i + (a + 0.5) / SUB) * CELL;
                const y = (j + (b + 0.5) / SUB) * CELL;
                let hit = null;
                for (let k = 0; k < idx.length; k++) {
                    const e = idx[k];
                    if (x < e.x0 || x > e.x1 || y < e.y0 || y > e.y1) continue;
                    if (pointInPath(e.path, x, y)) { hit = e.path; break; }
                }
                if (!hit) { setCell(g, i, j, WATER, NO_PROV); return; }
                if (!land) land = hit;
            }
        }
        setCell(g, i, j, LAND, indexOfProvince(g, land.id));
    }

    function setCell(g, i, j, kind, prov) {
        const k = j * GW + i;
        g.kind[k] = kind;
        g.prov[k] = prov;
    }

    function indexOfProvince(g, id) {
        let n = g.index.get(id);
        if (n === undefined) { n = g.ids.length; g.ids.push(id); g.index.set(id, n); }
        return n;
    }

    function kindAt(svg, g, i, j) {
        if (i < 0 || j < 0 || i >= GW || j >= GH) return WATER; // fuori mappa = mare
        const k = j * GW + i;
        if (g.kind[k] === UNKNOWN) classifyCell(svg, g, i, j);
        return g.kind[k];
    }

    // ------------------------------------------------------- rasterizzazione
    // Disegna il gruppo mappa su un canvas e legge i pixel. Due passate: vedi
    // l'intestazione del file per il perché.
    function rasterize(svg, paint) {
        const group = svg.querySelector('#map-group');
        if (!group) return Promise.reject(new Error('map-group assente'));
        const clone = group.cloneNode(true);
        clone.removeAttribute('filter');
        clone.removeAttribute('transform');
        const paths = clone.querySelectorAll('path.state');
        paths.forEach((p, i) => paint(p, i));
        clone.querySelectorAll('*').forEach(el => {
            el.removeAttribute('filter');
            el.removeAttribute('style');
        });

        const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        holder.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        holder.setAttribute('viewBox', '0 0 ' + MAP_W + ' ' + MAP_H);
        holder.setAttribute('width', GW * SUB);
        holder.setAttribute('height', GH * SUB);
        holder.appendChild(clone);

        const markup = new XMLSerializer().serializeToString(holder);
        const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const cv = document.createElement('canvas');
                    cv.width = GW * SUB; cv.height = GH * SUB;
                    const ctx = cv.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(img, 0, 0);
                    resolve(ctx.getImageData(0, 0, cv.width, cv.height).data);
                } catch (e) { reject(e); }
                finally { URL.revokeObjectURL(url); }
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('raster fallito')); };
            img.src = url;
        });
    }

    function prepare(svg) {
        const g = gridOf(svg);
        if (g.ready) return Promise.resolve(g);
        if (g.pending) return g.pending;

        // Ordine stabile provincia→indice, deciso PRIMA di dipingere: il colore
        // della passata 2 è la chiave di lettura, non può dipendere dal DOM.
        const paths = provincePathsOf(svg);
        paths.forEach(p => indexOfProvince(g, p.id));

        // 1) maschera terra/acqua — stesso colore per tutti, antialiasing acceso.
        const maskP = rasterize(svg, p => {
            p.setAttribute('fill', '#000');
            p.setAttribute('stroke', 'none');
        });
        // 2) indice delle province — un colore per provincia, niente antialiasing.
        const idxP = rasterize(svg, (p) => {
            const n = g.index.get(p.id);
            const v = (n === undefined ? 0 : n + 1);
            p.setAttribute('fill', 'rgb(' + (v & 255) + ',' + ((v >> 8) & 255) + ',0)');
            p.setAttribute('stroke', 'none');
            p.setAttribute('shape-rendering', 'crispEdges');
        });

        g.pending = Promise.all([maskP, idxP]).then(([mask, ids]) => {
            const rw = GW * SUB;
            for (let j = 0; j < GH; j++) {
                for (let i = 0; i < GW; i++) {
                    let water = false, prov = NO_PROV;
                    for (let b = 0; b < SUB && !water; b++) {
                        for (let a = 0; a < SUB; a++) {
                            const o = ((j * SUB + b) * rw + (i * SUB + a)) * 4;
                            if (mask[o + 3] < 40) { water = true; break; }
                            if (prov === NO_PROV) {
                                const v = ids[o] | (ids[o + 1] << 8);
                                if (v > 0 && v <= g.ids.length) prov = v - 1;
                            }
                        }
                    }
                    setCell(g, i, j, water ? WATER : LAND, water ? NO_PROV : prov);
                }
            }
            g.ready = true;
            g.pending = null;
            return g;
        }).catch(err => {
            // Il raster è solo un acceleratore: se fallisce si resta sul ripiego
            // punto-per-punto, che è lento ma dà la stessa mappa.
            g.pending = null;
            console.warn('[sea-routes] raster non disponibile, uso il ripiego lento:', err && err.message);
            return g;
        });
        return g.pending;
    }

    // ------------------------------------------------------------ isolotti
    // Celle d'acqua effettivamente occupate da una provincia più piccola della
    // griglia. Si campiona come classifyCell, ma basta UN punto dentro il poligono.
    function tinyCellsOf(svg, g, provId) {
        const path = document.getElementById(provId);
        const out = [];
        if (!path) return out;
        let b; try { b = path.getBBox(); } catch (e) { return out; }
        if (!b || b.width > MAP_W / 3) return out;
        const i0 = Math.max(0, Math.floor(b.x / CELL));
        const j0 = Math.max(0, Math.floor(b.y / CELL));
        const i1 = Math.min(GW - 1, Math.floor((b.x + b.width) / CELL));
        const j1 = Math.min(GH - 1, Math.floor((b.y + b.height) / CELL));
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                let inside = false;
                for (let sb = 0; sb < SUB && !inside; sb++) {
                    for (let sa = 0; sa < SUB; sa++) {
                        const x = (i + (sa + 0.5) / SUB) * CELL;
                        const y = (j + (sb + 0.5) / SUB) * CELL;
                        if (pointInPath(path, x, y)) { inside = true; break; }
                    }
                }
                if (inside) out.push(j * GW + i);
            }
        }
        return out;
    }

    // Registra tutte le province che la griglia non ha mai visto come terra.
    function indexTinyIslands(svg, g) {
        if (g.tinyDone) return;
        g.tinyDone = true;
        const seen = new Set();
        for (let k = 0; k < g.prov.length; k++) if (g.prov[k] !== NO_PROV) seen.add(g.prov[k]);
        g.ids.forEach((id, n) => {
            if (seen.has(n)) return;
            tinyCellsOf(svg, g, id).forEach(cell => {
                let list = g.tiny.get(cell);
                if (!list) { list = []; g.tiny.set(cell, list); }
                if (list.indexOf(n) < 0) list.push(n);
            });
        });
    }

    // ---------------------------------------------------------------- portata
    // Celle d'acqua che bagnano la provincia: da lì parte la navigazione.
    function coastCellsOf(svg, g, provId) {
        const n = g.index.get(provId);
        const out = [];
        if (n === undefined) return out;
        const path = svg.getElementById ? svg.getElementById(provId) : document.getElementById(provId);
        if (!path) return out;
        let b; try { b = path.getBBox(); } catch (e) { return out; }
        if (!b) return out;
        const i0 = Math.max(0, Math.floor(b.x / CELL) - 1);
        const j0 = Math.max(0, Math.floor(b.y / CELL) - 1);
        const i1 = Math.min(GW - 1, Math.ceil((b.x + b.width) / CELL) + 1);
        const j1 = Math.min(GH - 1, Math.ceil((b.y + b.height) / CELL) + 1);
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                if (kindAt(svg, g, i, j) !== LAND) continue;
                if (g.prov[j * GW + i] !== n) continue;
                for (let dj = -1; dj <= 1; dj++) {
                    for (let di = -1; di <= 1; di++) {
                        if (!di && !dj) continue;
                        const ni = i + di, nj = j + dj;
                        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
                        if (kindAt(svg, g, ni, nj) === WATER) out.push(nj * GW + ni);
                    }
                }
            }
        }
        // Isolotto più piccolo di una cella: non ha celle di terra, salpa dalle
        // celle d'acqua che occupa.
        if (!out.length) return tinyCellsOf(svg, g, provId);
        return out;
    }

    // Dijkstra sull'acqua fermato a `radius`. Restituisce Map(idProvincia → distanza).
    // Le distanze sono in unità SVG, le stesse di §9.2.
    function distances(svg, provId, radius) {
        const g = gridOf(svg);
        const out = new Map();
        if (!(radius > 0)) return out;
        indexTinyIslands(svg, g);
        const start = coastCellsOf(svg, g, provId);
        if (!start.length) return out;   // provincia senza sbocco: niente mare

        // Coda a bucket: le distanze crescono di CELL o CELL·√2, quindi un passo
        // di CELL/4 basta a ordinarle senza inventare uno heap.
        const STEP = CELL / 4;
        const nb = Math.ceil(radius / STEP) + 2;
        const buckets = new Array(nb);
        const dist = new Float32Array(GW * GH).fill(Infinity);
        const push = (cell, d) => {
            if (d > radius || d >= dist[cell]) return;
            dist[cell] = d;
            const b = Math.min(nb - 1, Math.floor(d / STEP));
            (buckets[b] || (buckets[b] = [])).push(cell);
        };
        start.forEach(c => push(c, 0));

        const self = g.index.get(provId);
        for (let b = 0; b < nb; b++) {
            const q = buckets[b];
            if (!q) continue;
            for (let h = 0; h < q.length; h++) {
                const cell = q[h];
                const d = dist[cell];
                if (d > (b + 1) * STEP) continue;      // rimesso in coda più avanti
                // Isolotti che stanno DENTRO questa cella d'acqua (§ isole piccole).
                const tiny = g.tiny.get(cell);
                if (tiny) tiny.forEach(p => {
                    if (p === self) return;
                    const prev = out.get(g.ids[p]);
                    if (prev === undefined || d < prev) out.set(g.ids[p], d);
                });
                const i = cell % GW, j = (cell / GW) | 0;
                for (let dj = -1; dj <= 1; dj++) {
                    for (let di = -1; di <= 1; di++) {
                        if (!di && !dj) continue;
                        const ni = i + di, nj = j + dj;
                        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
                        const k = nj * GW + ni;
                        const kind = kindAt(svg, g, ni, nj);
                        if (kind === LAND) {
                            // Terra bagnata da questa cella d'acqua: la provincia è
                            // raggiungibile a questa distanza.
                            const p = g.prov[k];
                            if (p !== NO_PROV && p !== self) {
                                const prev = out.get(g.ids[p]);
                                if (prev === undefined || d < prev) out.set(g.ids[p], d);
                            }
                            continue;
                        }
                        push(k, d + ((di && dj) ? DIAG : CELL));
                    }
                }
            }
        }
        return out;
    }

    // Set degli id raggiungibili entro `radius` (esclusa la provincia di partenza).
    function reach(svg, provId, radius) {
        return new Set(distances(svg, provId, radius).keys());
    }

    // Stessa cosa, memoizzata. `refreshMapDisplay` gira dopo OGNI azione — anche
    // dopo ogni mossa di ogni bot — e deve restare sui ~20 ms: una portata da
    // veliero costa ~30 ms, quindi non si ricalcola a ogni giro. La geografia non
    // cambia mai, quindi la coppia (provincia, raggio) è una chiave definitiva.
    function reachCached(svg, provId, radius) {
        const memo = svg.__seaReach || (svg.__seaReach = new Map());
        const key = provId + '@' + radius;
        let s = memo.get(key);
        if (!s) { s = reach(svg, provId, radius); memo.set(key, s); }
        return s;
    }

    // Una provincia ha uno sbocco sul mare vero? (le navi si costruiscono solo lì)
    function hasSeaAccess(svg, provId) {
        return coastCellsOf(svg, gridOf(svg), provId).length > 0;
    }

    global.SeaRoutes = {
        CELL, prepare, reach, reachCached, distances, hasSeaAccess,
        // Portate di §9.2. Chi ne vuole una nuova la aggiunge qui, non sparsa.
        RANGE: { barca: 12, vascello: 170 },
        rangeOf: tipo => (global.SeaRoutes.RANGE[tipo] || 0),
        isReady: svg => !!(svg && svg.__seaGrid && svg.__seaGrid.ready)
    };
})(window);

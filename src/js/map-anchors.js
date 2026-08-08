// ============================================================================
// map-anchors.js — DOVE si posano le cose sulla mappa. Geometria pura: prende
// un <path> di provincia e restituisce punti in coordinate SVG. Nessuno stato
// di gioco, nessun DOM di UI: per questo è testabile da solo (vedi la pagina
// di diagnostica, che disegna gli ancoraggi di tutte le province).
//
// Tre ancoraggi, tre problemi diversi:
//   landAnchor(path)  punto BEN DENTRO il corpo principale — soldati, città,
//                     capitali, e il cursore di schieramento. Il centro del
//                     bounding box NON va bene: su province concave o a mezzaluna
//                     (Messico, Norvegia, Cile) cade in mare o in un'altra
//                     provincia. Qui si cerca il punto più "profondo" (il più
//                     lontano dal bordo) fra i candidati che stanno davvero
//                     dentro il poligono, e si restituisce anche il raggio
//                     libero, così chi disegna sa quanto spazio ha.
//   seaAnchor(path)   punto in ACQUA APERTA appena al largo — navi. Non basta
//                     "fuori dalla provincia e fuori dai vicini di terra": il
//                     punto poteva finire su una provincia non confinante o in
//                     un'insenatura. Qui si controlla contro TUTTE le province
//                     (indice per bounding box) e si misura quanta acqua libera
//                     c'è intorno, scegliendo l'approdo più vicino alla
//                     provincia fra quelli abbastanza aperti.
//   markerAnchor      resta in app.js: è l'angolo per l'icona-risorsa.
//
// Le province VERE sono i path.state CON id: l'alone costiero di map-decor.js è
// un clone senza id con la stessa classe e non deve entrare nell'indice.
// ============================================================================
const MapAnchors = (() => {
    'use strict';

    // ---------------------------------------------------------------- bordo
    // Estrae i punti del bordo parsando l'attributo "d" (assoluti), con
    // densificazione dei segmenti lunghi. Evita getPointAtLength, che sui path
    // complessi costa ~decine di ms A CHIAMATA e faceva saturare il browser.
    function parsePathBoundaryPoints(d) {
        const STEP = 0.5;       // interpola i segmenti piu' lunghi di questo
        const MAX_INTERP = 60;  // cap di punti interpolati per segmento (sicurezza)
        const pts = [];
        if (!d) return pts;
        const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
        if (!tokens) return pts;

        let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = '';
        let lastX = null, lastY = null;
        const num = () => parseFloat(tokens[i++]);
        const skip = n => { i += n; };
        const isCmd = t => t.length === 1 && /[A-Za-z]/.test(t);

        function push(x, y) {
            if (lastX !== null) {
                const dx = x - lastX, dy = y - lastY, dist = Math.hypot(dx, dy);
                if (dist > STEP) {
                    const n = Math.min(Math.floor(dist / STEP), MAX_INTERP);
                    for (let k = 1; k < n; k++) pts.push({ x: lastX + dx * k / n, y: lastY + dy * k / n });
                }
            }
            pts.push({ x, y });
            lastX = x; lastY = y;
        }

        while (i < tokens.length) {
            if (isCmd(tokens[i])) { cmd = tokens[i]; i++; }
            else if (!cmd) { i++; continue; }
            const rel = cmd === cmd.toLowerCase();
            const C = cmd.toUpperCase();
            if (C === 'Z') { cx = sx; cy = sy; push(cx, cy); continue; }
            let x, y;
            switch (C) {
                case 'M':
                    x = num(); y = num(); if (rel) { x += cx; y += cy; }
                    cx = x; cy = y; sx = x; sy = y;
                    lastX = null; lastY = null; // nuovo sotto-tracciato: niente densify dal precedente
                    push(x, y);
                    cmd = rel ? 'l' : 'L'; // le ripetizioni di M sono lineto
                    break;
                case 'L':
                    x = num(); y = num(); if (rel) { x += cx; y += cy; }
                    cx = x; cy = y; push(x, y); break;
                case 'H':
                    x = num(); if (rel) x += cx; cx = x; push(cx, cy); break;
                case 'V':
                    y = num(); if (rel) y += cy; cy = y; push(cx, cy); break;
                case 'C': skip(4); x = num(); y = num(); if (rel) { x += cx; y += cy; } cx = x; cy = y; push(x, y); break;
                case 'S': skip(2); x = num(); y = num(); if (rel) { x += cx; y += cy; } cx = x; cy = y; push(x, y); break;
                case 'Q': skip(2); x = num(); y = num(); if (rel) { x += cx; y += cy; } cx = x; cy = y; push(x, y); break;
                case 'T': x = num(); y = num(); if (rel) { x += cx; y += cy; } cx = x; cy = y; push(x, y); break;
                case 'A': skip(5); x = num(); y = num(); if (rel) { x += cx; y += cy; } cx = x; cy = y; push(x, y); break;
                default: i++; break; // token inatteso: avanza per non bloccare
            }
        }
        return pts;
    }

    // Punti del bordo di una provincia (memoizzati sull'elemento).
    function boundaryPoints(pathEl) {
        if (pathEl.__bpts) return pathEl.__bpts;
        const pts = parsePathBoundaryPoints(pathEl.getAttribute('d'));
        pathEl.__bpts = pts;
        return pts;
    }

    // Sottocampiona il bordo a ~n punti: per i test "quanto sono lontano dal
    // bordo" non serve la densità piena e il costo scende di un ordine.
    function thinned(pts, n) {
        if (pts.length <= n) return pts;
        const step = Math.ceil(pts.length / n);
        const out = [];
        for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
        return out;
    }

    function median(arr) {
        const a = arr.slice().sort((x, y) => x - y);
        const n = a.length;
        if (!n) return 0;
        return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
    }

    function pointInPath(path, x, y) {
        if (typeof path.isPointInFill !== 'function') return true; // fallback: non bloccare
        try { return path.isPointInFill(new DOMPoint(x, y)); } catch (e) { return true; }
    }

    // BBox del CORPO PRINCIPALE: la mediana dei punti del bordo scarta le isole
    // lontane, così ancore e figure non finiscono su un arcipelago remoto.
    function mainBodyBBox(path) {
        let b; try { b = path.getBBox(); } catch (e) { return null; }
        if (!b || (!b.width && !b.height)) return null;

        let mx = b.x, my = b.y, mw = b.width, mh = b.height;

        const pts = boundaryPoints(path);
        if (pts.length >= 8) {
            const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
            const medX = median(xs), medY = median(ys);
            const dist = new Array(pts.length);
            for (let i = 0; i < pts.length; i++) dist[i] = Math.hypot(xs[i] - medX, ys[i] - medY);
            const thr = Math.max(median(dist) * 2.5, 1e-6); // scarta i punti delle isole lontane
            let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, cnt = 0;
            for (let i = 0; i < pts.length; i++) {
                if (dist[i] > thr) continue;
                const x = xs[i], y = ys[i];
                if (x < minx) minx = x; if (x > maxx) maxx = x;
                if (y < miny) miny = y; if (y > maxy) maxy = y;
                cnt++;
            }
            if (cnt >= 3) { mx = minx; my = miny; mw = maxx - minx; mh = maxy - miny; }
        }
        return { x: mx, y: my, w: mw, h: mh };
    }

    // ------------------------------------------------------- indice di terra
    // Elenco {path, bbox} di tutte le province, costruito una volta e appeso
    // all'<svg>. Serve a chiedersi "questo punto è terra?" senza interrogare
    // 600+ poligoni: si testano solo quelli il cui bounding box contiene il
    // punto (quasi sempre 0, 1 o 2).
    function landIndex(svg) {
        if (!svg) return [];
        if (svg.__landIndex) return svg.__landIndex;
        const idx = [];
        Array.from(svg.querySelectorAll('path.state')).forEach(p => {
            if (!p.id) return; // l'alone costiero di map-decor.js non ha id
            let b; try { b = p.getBBox(); } catch (e) { return; }
            if (!b || (!b.width && !b.height)) return;
            idx.push({ path: p, x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height });
        });
        svg.__landIndex = idx;
        return idx;
    }

    // true se il punto cade dentro una qualsiasi provincia (terra), escluse
    // quelle passate in `skip`.
    function isLand(svg, x, y, skip) {
        const idx = landIndex(svg);
        for (let i = 0; i < idx.length; i++) {
            const e = idx[i];
            if (x < e.x0 || x > e.x1 || y < e.y0 || y > e.y1) continue;
            if (skip && skip.indexOf(e.path) >= 0) continue;
            if (pointInPath(e.path, x, y)) return true;
        }
        return false;
    }

    const isWater = (svg, x, y) => !isLand(svg, x, y, null);

    // ------------------------------------------------------- mare oppure lago
    // I laghi NON sono mare (scelta dell'utente): niente navi sul Ciad, sui laghi
    // finlandesi o nelle fessure fra due province. Il discrimine è la STAZZA dello
    // specchio d'acqua: si allaga (BFS) la macchia d'acqua a partire dal punto, su
    // una griglia grossolana, e ci si ferma appena si superano SEA_CELLS celle.
    // Chi arriva al tetto è mare, chi si chiude prima è lago.
    // Tutte le celle visitate ereditano il verdetto: ogni specchio d'acqua si paga
    // una volta sola per l'intera mappa, non una volta per provincia.
    const WCELL = 1.5;        // lato della cella (unità SVG; la mappa è 1200x575)
    const SEA_CELLS = 200;    // ~450 unità² d'acqua = mare. Sotto: lago.

    function cellIsWater(svg, i, j, memo) {
        const k = i + ':' + j;
        let v = memo.get(k);
        if (v === undefined) { v = !isLand(svg, (i + 0.5) * WCELL, (j + 0.5) * WCELL, null); memo.set(k, v); }
        return v;
    }

    function waterIsSea(svg, x, y) {
        const verdict = svg.__waterBody || (svg.__waterBody = new Map());
        const cells = svg.__waterCells || (svg.__waterCells = new Map());
        const si = Math.floor(x / WCELL), sj = Math.floor(y / WCELL);
        const key0 = si + ':' + sj;
        if (verdict.has(key0)) return verdict.get(key0);
        if (!cellIsWater(svg, si, sj, cells)) return false;

        const seen = new Set([key0]);
        const queue = [[si, sj]];
        let sea = false;
        for (let head = 0; head < queue.length; head++) {
            if (seen.size > SEA_CELLS) { sea = true; break; }
            const [i, j] = queue[head];
            const around = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
            for (const [ni, nj] of around) {
                const k = ni + ':' + nj;
                if (seen.has(k)) continue;
                if (!cellIsWater(svg, ni, nj, cells)) continue;
                seen.add(k);
                queue.push([ni, nj]);
            }
        }
        seen.forEach(k => verdict.set(k, sea));
        return sea;
    }

    // -------------------------------------------------------- ancora di terra
    // Punto ben dentro il corpo principale + raggio libero attorno. Si prova una
    // griglia di candidati, si tengono quelli dentro il poligono e vince il più
    // lontano dal bordo (a parità, il più vicino al centro).
    function landAnchor(path) {
        if (path.__landAnchor) return path.__landAnchor;
        const bb = mainBodyBBox(path);
        if (!bb) return null;
        const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        const edge = thinned(boundaryPoints(path), 200);

        const clearRadius = (x, y) => {
            let best = Infinity;
            for (let i = 0; i < edge.length; i++) {
                const dx = edge[i].x - x, dy = edge[i].y - y;
                const d = dx * dx + dy * dy;
                if (d < best) best = d;
            }
            return Math.sqrt(best);
        };

        const N = 9; // 9x9 candidati: abbastanza fitto anche per province strette
        let best = null;
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                const x = bb.x + bb.w * (i + 0.5) / N;
                const y = bb.y + bb.h * (j + 0.5) / N;
                if (!pointInPath(path, x, y)) continue;
                const r = clearRadius(x, y);
                // piccola preferenza per il centro, così una provincia tondeggiante
                // non sposta la pedina per un decimo di unità di "profondità".
                const score = r - 0.06 * Math.hypot(x - cx, y - cy);
                if (!best || score > best.score) best = { x, y, r, score };
            }
        }
        // Rete di sicurezza per gli arcipelaghi (isolotti più piccoli del passo
        // della griglia, tipo West_Micronesia): il punto di mezzo di una corda
        // fra due punti vicini dello stesso isolotto cade dentro l'isolotto.
        if (!best) {
            const chord = [2, 4, 8, 16];
            for (let i = 0; i < edge.length && !best; i++) {
                for (const k of chord) {
                    const q = edge[(i + k) % edge.length];
                    const x = (edge[i].x + q.x) / 2, y = (edge[i].y + q.y) / 2;
                    if (!pointInPath(path, x, y)) continue;
                    const r = clearRadius(x, y);
                    if (!best || r > best.r) best = { x, y, r };
                    break;
                }
            }
        }
        if (!best) best = { x: cx, y: cy, r: Math.min(bb.w, bb.h) / 6 };
        const out = { x: best.x, y: best.y, r: Math.max(best.r, 0.5) };
        path.__landAnchor = out;
        return out;
    }

    // -------------------------------------------------------- ancora di mare
    // Normale uscente approssimata nel punto i del bordo: perpendicolare alla
    // corda fra i punti vicini, orientata verso l'esterno della provincia.
    function outwardNormal(path, pts, i, eps) {
        const n = pts.length;
        const a = pts[(i - 4 + n) % n], b = pts[(i + 4) % n], p = pts[i];
        let tx = b.x - a.x, ty = b.y - a.y;
        let len = Math.hypot(tx, ty);
        if (!len) return null;
        tx /= len; ty /= len;
        let nx = ty, ny = -tx;
        if (pointInPath(path, p.x + nx * eps, p.y + ny * eps)) { nx = -nx; ny = -ny; }
        if (pointInPath(path, p.x + nx * eps, p.y + ny * eps)) return null; // sottile: entrambi i lati dentro
        return { nx, ny, tx, ty };
    }

    // Candidati "affacciati sul mare": punti del bordo la cui normale uscente
    // porta in acqua. `stopAtFirst` serve alla sola domanda "è costiera?".
    function seaCandidates(path, stopAtFirst) {
        const svg = path.ownerSVGElement;
        if (!svg || typeof path.isPointInFill !== 'function') return [];
        const bb = mainBodyBBox(path);
        const pts = boundaryPoints(path);
        if (!bb || pts.length < 8) return [];
        const size = Math.max(bb.w, bb.h);
        const step = Math.max(1, Math.floor(pts.length / 90));
        const eps = 0.6;
        const off = Math.min(Math.max(size * 0.04, 1.0), 3); // quanto uscire per dire "qui c'è mare"
        const out = [];
        for (let i = 0; i < pts.length; i += step) {
            const p = pts[i];
            // resta sul corpo principale: le isole lontane non fanno da porto
            if (p.x < bb.x - 1 || p.x > bb.x + bb.w + 1 || p.y < bb.y - 1 || p.y > bb.y + bb.h + 1) continue;
            const nrm = outwardNormal(path, pts, i, eps);
            if (!nrm) continue;
            const qx = p.x + nrm.nx * off, qy = p.y + nrm.ny * off;
            if (isLand(svg, qx, qy, null)) continue;
            out.push({ x: p.x, y: p.y, nx: nrm.nx, ny: nrm.ny, tx: nrm.tx, ty: nrm.ty });
            if (stopAtFirst) break;
        }
        return out;
    }

    // Quanta acqua libera c'è intorno a (x,y): il raggio più grande (fino a max)
    // per cui otto direzioni cadono tutte in acqua.
    function waterClearance(svg, x, y, max) {
        if (isLand(svg, x, y, null)) return 0;
        const DIRS = 8;
        let r = 0;
        for (let step = 1; step <= 4; step++) {
            const rr = max * step / 4;
            let ok = true;
            for (let k = 0; k < DIRS && ok; k++) {
                const a = 2 * Math.PI * k / DIRS;
                if (isLand(svg, x + Math.cos(a) * rr, y + Math.sin(a) * rr, null)) ok = false;
            }
            if (!ok) break;
            r = rr;
        }
        return r;
    }

    // Ingombro della fila di navi di una provincia (raggio): serve sia a tenere
    // gli approdi staccati fra loro sia a sapere quanto spazio chiedere all'acqua.
    function shipFootprint(bb) {
        return Math.max(2.5, Math.min(Math.min(bb.w, bb.h) * 0.30, 8)) * 0.9;
    }

    // Quanto un approdo pesta i piedi agli approdi già assegnati (0 = libero).
    function crowding(svg, x, y, occ) {
        const spots = svg.__seaSpots;
        if (!spots || !spots.length) return 0;
        let worst = 0;
        for (let i = 0; i < spots.length; i++) {
            const s = spots[i];
            const need = occ + s.occ;
            const d = Math.hypot(x - s.x, y - s.y);
            if (d < need && need - d > worst) worst = need - d;
        }
        return worst;
    }

    // Punto in MARE APERTO appena al largo, dove disegnare le navi.
    // { x, y, r } con r = acqua libera attorno (serve a dimensionare la fila).
    // null = questa provincia non ha sbocco sul mare (i laghi non contano).
    function seaAnchor(path) {
        if (path.__seaAnchor !== undefined) return path.__seaAnchor;
        const svg = path.ownerSVGElement;
        const bb = mainBodyBBox(path);
        const cands = seaCandidates(path, false);
        let out = null;
        if (bb && cands.length) {
            const size = Math.max(bb.w, bb.h);
            const push0 = Math.min(Math.max(size * 0.16, 3.5), 10);
            const la = landAnchor(path) || { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
            const occ = shipFootprint(bb);
            // Si prova prima al largo; se lì è tutto terra (mari stretti: Baltico,
            // Adriatico, Manica) ci si accosta alla riva invece di rinunciare.
            for (const f of [1, 0.6, 0.35, 0.2]) {
                const push = push0 * f;
                const want = push * 0.75;   // acqua libera considerata "sufficiente"
                let best = null;
                cands.forEach(c => {
                    const x = c.x + c.nx * push, y = c.y + c.ny * push;
                    const clear = waterClearance(svg, x, y, push);
                    if (!clear) return;
                    if (!waterIsSea(svg, x, y)) return; // è un lago: non è un porto
                    const dist = Math.hypot(x - la.x, y - la.y);
                    // in ordine: chi non si sovrappone agli approdi già assegnati,
                    // chi ha acqua a sufficienza, chi è più vicino alla provincia
                    // (le navi devono leggersi come "sue").
                    const crowd = crowding(svg, x, y, occ);
                    const enough = clear >= want ? 1 : 0;
                    // chiave di preferenza, dalla più importante alla meno (minore vince)
                    const key = [crowd ? 1 : 0, -enough, crowd || (enough ? dist : -clear)];
                    if (!best || key.some((v, i) => v !== best.key[i] && v < best.key[i]
                        && key.slice(0, i).every((w, j) => w === best.key[j]))) {
                        best = { x, y, r: clear, dist, clear, enough, crowd, key, c, push };
                    }
                });
                if (best) { out = shiftAway(svg, best, occ); break; }
            }
        }
        path.__seaAnchor = out;
        if (out) {
            (svg.__seaSpots || (svg.__seaSpots = [])).push({ x: out.x, y: out.y, occ: out.occ });
        }
        return out;
    }

    // Anticollisione: se il posto migliore è comunque occupato, si scivola al largo
    // lungo la normale (e in subordine lungo la costa) finché le navi non si
    // sovrappongono più, restando in acqua. Se non si trova, si tiene il meno peggio.
    function shiftAway(svg, best, occ) {
        const keep = { x: best.x, y: best.y, r: best.r, occ };
        if (!best.crowd) return keep;
        const c = best.c;
        const tries = [];
        for (let k = 1; k <= 4; k++) {
            const d = best.crowd * k / 2;
            tries.push([c.nx * d, c.ny * d]);                       // più al largo
            tries.push([c.tx * d, c.ty * d]);                       // lungo la costa
            tries.push([-c.tx * d, -c.ty * d]);
            tries.push([(c.nx + c.tx) * d * 0.7, (c.ny + c.ty) * d * 0.7]);
            tries.push([(c.nx - c.tx) * d * 0.7, (c.ny - c.ty) * d * 0.7]);
        }
        // si prende lo spostamento che si pesta MENO i piedi (0 = perfetto); nei mari
        // stretti (Adriatico, Manica) lo zero non esiste e ci si accontenta del meglio.
        let win = null;
        for (const [dx, dy] of tries) {
            const x = best.x + dx, y = best.y + dy;
            if (isLand(svg, x, y, null)) continue;
            if (!waterIsSea(svg, x, y)) continue;
            const crowd = crowding(svg, x, y, occ);
            if (crowd >= best.crowd) continue;
            const r = waterClearance(svg, x, y, best.push);
            if (!r) continue;
            if (!win || crowd < win.crowd) win = { x, y, r, occ, crowd };
            if (!crowd) break;
        }
        return win ? { x: win.x, y: win.y, r: win.r, occ } : keep;
    }

    // Costiera = ha un approdo vero sul mare. I laghi non contano (scelta
    // dell'utente): niente navi sul Ciad o sui laghi finlandesi. Risposta
    // memorizzata sull'elemento, la calcola seaAnchor una volta sola.
    function isCoastal(path) {
        if (path.dataset.coast === '1') return true;
        if (path.dataset.coast === '0') return false;
        if (typeof path.isPointInFill !== 'function') return true; // browser vecchio: non bloccare
        const coastal = !!seaAnchor(path);
        path.dataset.coast = coastal ? '1' : '0';
        return coastal;
    }

    return {
        parsePathBoundaryPoints, boundaryPoints, median, pointInPath,
        mainBodyBBox, landAnchor, seaAnchor, isCoastal, isWater, landIndex,
    };
})();

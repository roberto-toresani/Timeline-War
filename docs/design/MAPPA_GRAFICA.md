# Mappa e Grafica — Implementazione

## Mappa SVG
- Embeddada come stringa in `data/embedded_map.js` (`RAW_SVG_CONTENT`). **MAI leggere per intero** (~1.3 MB).
- `fetch` di `assets/world_map_optimized.svg` è solo fallback.
- **Non usare `querySelectorAll('path.state')` crudo**: il clone `#map-group` di `map-decor.js` ha la stessa `class="state"` → prende nodi fantasma. Usa `provincePaths()`.

## map-anchors.js — ancoraggi
- **`landAnchor(id)`**: dove si posano pedine e icone (punto interno sicuro del poligono).
- **`seaAnchor(id)`**: approdo navale (centro della prima costa disponibile).
- Coste e laghi: distinti dagli ancoraggi mare aperto.
- **Funzioni come `function`, non `const` arrow** (alias verso MapAnchors in cima alla closure di `app.js`): sono hoisted, non cadono in TDZ. Vedi gotcha principale in CLAUDE.md.
- `boundaryPoints`, `pointInPath`, `mainBodyBBox`, `isCoastalProvince`, `seaAnchor` sono `function` apposta.

## map-decor.js — carta antica
- Stile "carta antica": texture grana, colore mare, alone costiero.
- L'alone costiero è un clone di `#map-group` con `class="state"` → non usare `querySelectorAll` crudo.
- Viene iniettato **prima** di `#map-group` nell'SVG (z-order più basso).

## Render pedine (`renderPiecesForPath`)
- **`markerIndex`** pre-costruito: MAI `querySelectorAll` dentro questo ciclo (budget ~20 ms).
- Disegna una pedina per scafo (senza numero per gli scafi, con pallino solo per le spedizioni).
- Pedina `#pc-cavaliere` mostrata accanto ai fanti.

## Strade
- **`roadPlacement`**: posiziona le strade su archi confinanti, con PCA per scegliere l'asse.
- Strade salvate in `data-roads` sulle province, viaggiano nello snapshot.
- Strada gratuita dalla costruzione della Capitale (non dall'avvio).

## Portata delle navi (`js/sea-routes.js`)
- Distanza calcolata **sull'acqua** via Dijkstra, non in linea d'aria.
- Griglia (~1.5 unità per cella): due rasterizzazioni su canvas (`prepare()`, asincrona ~0.5 s).
- **`reachCached` obbligatorio** nei cicli di render: una portata da veliero costa ~30 ms senza cache.
- Portate in `SeaRoutes.RANGE`: Nave 12, Veliero 170.
- **Mari interni** (`INNER_SEAS`): Mediterraneo+Mar Nero, Baltico, Mar Arabico+Golfo, Caspio → ogni passo costa `INNER_COST = 12/18` (la Nave arriva a 18, non 12). Solo per la Nave.
- **Isole piccole** (Canarie, Egeo, Antille): registrate in `g.tiny` sulle celle d'acqua — non riempiono una cella intera.
- `prepare()` è asincrona: finché non finisce le portate sono vuote; `initMap` ridipinge all'arrivo.
- Ripiego punto-per-punto se il canvas non risponde.

## Scafi (`data-ships`)
- Formato: `data-ships="barca:8,barca:8,vascello:15"` (una voce per scafo, in ordine).
- `piecesOf()` sintetizza → `countPiece(path,'barca')` risponde come sempre.
- `Risiko.engine.ships/addShip/removeShip/setShips` per chi tocca i carichi.
- Salvataggi vecchi: `applyPieceState` converte `barca:2` da `data-pieces` in due scafi vuoti.
- Sulla mappa: una pedina per scafo, **senza numero** (`badge: null`).

## Terreno (`js/terrain.js` + `data/province_terrain.js`)
- `chiuso` (monti, foreste, paludi) o `aperto` (pianure, steppe, deserti).
- Cambia l'ESPONENTE della formula battaglia: k=1.4 chiuso, k=2.6 aperto.
- Geografia fissa — non entra negli snapshot, non si dipinge, non cambia.
- Su `<path>`: `terrainKeyOf(el)`, memoizzato sull'elemento (628 province a ogni refresh).
- Formula battaglia: `RisikoBattle.winChance(A, Deff, k)` — unico punto.
- **Perdite**: base = `min(proprie truppe, forza_nemico × KILL_TERRAIN)` + frazione legata all'equilibrio.
- Vista mappa per terreno: bottone ⛰ → `Risiko.setMapPaint('terreno')`.

## Nebbia
- `computeVisibleProvinces` restituisce `{visible, haze, spie}`.
- `haze`: raggiunto dalle nostre navi/spie — si vede il colore del proprietario, non le truppe.
- `Risiko.isVisible` = `visible ∪ haze`. Chi mostra truppe controlla anche la classe `haze` sul path.

## Modalità di pittura mappa
- `mapPaintMode`: `owner` | `fede` | `terreno`.
- `refreshMapDisplay` ridipinge in base a `mapPaintMode` a ogni azione.
- Chi aggiunge un'azione che cambia proprietario o fede non deve aggiornare la pittura: `refreshMapDisplay` lo fa già.

## `provincePaths()` — l'unico modo sicuro
- Usa `provincePaths()` (app.js) invece di `querySelectorAll('path.state')` crudo.
- L'alone costiero di `map-decor.js` ha la stessa classe e restituisce nodi fantasma.

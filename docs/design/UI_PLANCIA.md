# UI Plancia — Implementazione

## Struttura generale
- **La mappa è il fondo e prende tutto**: niente tre colonne, niente scorrimento durante il turno.
- **Colonna del turno a destra** (`#board-right`, `--turn-col`): linguetta, aperta/chiusa.
- **Dock** (`#board-dock`, dentro la cornice mappa): pulsanti che aprono fogli a tutta visuale.
- **Fogli** (`#board-sheets`, `showSheet()`): 👑 Corona, 🕊 Diplomazia, ⚖ Mercato. Esc chiude.
  - **Diplomazia** è `peek` (non copre la mappa): passando sopra scheda regno si accendono i confini.
- **Pop-up costi** (`#bp-costs-pop` 📜): apribile/richiudibile in qualsiasi momento, anche sopra un foglio.

## Comandi dalla mappa
- Attacco e spostamento si comandano dalla mappa, non da elenchi.
- `markTargets(fromId, ids, kind)` dipinge sul layer `#order-marks`; `clearTargets()` svuota.
- **kind**: `attacca`/`sposta` → retino + bordo interno; `spia`/`partenza` → trattino leggero.
- Layer `pointer-events:none` → i clic passano al path sotto; `order-clickable` per il cursore.
- `orderTargets` (player-board.js): indice id→bersaglio dell'ultimo render. Se la provincia è lì = ordine; altrimenti = selezione.
- Province accese come **partenza** spostamento NON stanno in `orderTargets` (clic = scelta, non ordine).

## Retino
- **Retino, non contorno**: righe diagonali nel colore della fase, **ritagliate dentro** il poligono.
- Pattern `#order-hatch-*` + clip path per provincia; si creano una volta (`orderClip`/`orderHatch`) e si riusano.
- Pattern `userSpaceOnUse` → scala con lo zoom. Mai dipingere il fill dei path (`refreshMapDisplay` lo sovrascrive).
- `!important` sui tratti CSS residui (`order-spy` in `board.css`): molti path SVG hanno `style="stroke"` inline.

## Cursore d'ordine (`#map-order-hud`)
- Si costruisce una volta (`buildOrderHud`) e poi si aggiorna (`syncOrderHud`).
- Insegue la provincia con `requestAnimationFrame`; rimane dentro la cornice (`placeOrderHud` fa clamp).
- **Riga per reparto** quando la partenza ha cavalieri (`squadRowsHtml`/`setSquad`).
- **Un'unica conferma** per cursore e elenco (`askAttack()` / `askMove()`).
- L'elenco "Tutti i bersagli" resta chiuso; si apre da sé sopra `ORDER_MAX_MARKS = 24`.

## Colonna del turno (destra)
- In alto: cruscotto `#bp-status` (una riga sola: oro, province+rinforzi, fede, scorte). Non scorre mai.
- Poi: 4 cartelle delle fasi `#bp-phases` con una riga di spiegazione.
- Poi: `#bp-body` (solo la cartella aperta).
- In fondo: bottone di avanzamento (fisso).
- Provincia selezionata: `.bsel-head` + `.bsel-meta` (2 righe, 4 tessere colorate). Id nascosti `p-owner`/`p-resource`/`p-name` ancora presenti perché `app.js` ci scrive a ogni clic.

## Fase costruisci — tessere-icona
- **Tessere-icona**, non elenco di scritte: `buildTile`/`costChips` in player-board.js, griglia `.bp-tiles`.
- Sagoma vera della pedina (symbol `#pc-…`, tinta col colore regno via `currentColor`).
- **Accesa** (`.can`, bordo oro) se fattibile; **spenta** (`.no`, grigio) se no. Gettone mancante in rosso.
- Nota sul motivo solo se è il posto (`opts.nota`), mai se è il prezzo (i gettoni rossi lo dicono già).
- Strade: una tessera per vicino; badge ★ quando gratuite.
- Nuova voce costruibile → aggiungi sagoma a `BUILD_SYMBOL` (e `BUILD_BADGE` se condivide sagoma).

## Aprire/sbirciare cartelle
- `openFolder` decide *cosa si vede*; `player.fase` decide *cosa si può fare*.
- Cartella aperta ≠ fase in corso → `freeze()` spegne i comandi del blocco; `#bp-peek-note` spiega.
- `openFolder` si azzera da sé a cambio di fase vera.

## Fogli
- **👑 Corona**: Popolarità + obiettivi (sinistra, `#board-left` / `.bp-crown`), regno in numeri + regni in gioco + registro IA (destra).
- **🕊 Diplomazia**: standing per scheda-regno + pannello araldi a destra.
- **⚖ Mercato**: commerci + banca.

## Confini sulla mappa
- `Risiko.markBorders` su layer `#border-marks` (separato da `#order-marks`).
- `syncBorderMarks` in player-board: normalmente regni umani confinanti; col foglio 🕊 aperto tutte le frontiere visibili.

## Tour al primo turno
- `startTour`/`maybeStartTour`: tour a fumetti con anello d'oro `.tour-hole` attorno al pezzo.
- **Non copre la visuale**: `#ui-tour` è `pointer-events:none`, il fumetto prende solo i suoi clic.
- Obbligatorio al primo turno (niente Salta/Chiudi); dal secondo compare ❓ Guida.
- Parte solo a partita avviata (`turnoDi` non null) e senza pergamene/conferme aperte.
- Nuova voce importante in plancia → aggiungi passo in `buildTourSteps`.

## Vista da telefono / mobile
- Versione semplificata: a schermo stretto (≤820px) il pannello è a tutto schermo e a colonna.
- Il bottone Papa ✝ in basso a sinistra (a destra c'è la colonna del turno).
- Plancia completa solo desktop; su telefono si accende la vista semplice.

## `GA_MUTATORS` — rete sotto l'osservazione admin
- Ogni nuovo mutatore di `GameActions` usato dalla plancia va in `GA_MUTATORS` (player-board.js).
- `observing(player)` → `GA()` consegna un Proxy che rifiuta tutto ciò che c'è in `GA_MUTATORS`.
- Barra in alto per l'admin-osservatore: "👁 Osservi — gioca il suo giocatore".

# RISIKO ONLINE — Stato e sviluppi

Documento di stato **condiviso tra tutte le chat**. Riporta la versione attuale del gioco
e dei suoi sistemi. Va aggiornato **ogni volta che si fa un progresso** (in qualunque chat),
e in particolare al momento del commit.

- **Ultimo aggiornamento:** 2026-08-07 (partita contro l'IA, presidi neutrali, vista generale)
- **Branch corrente:** `feat/pedine-gioco`
- **Ultimo commit:** vedi `git log` — Plancia giocatore giocabile (turni, economia, costruzioni, attacco)

## Sistemi in gioco (stato attuale)

- **Mappa interattiva** — SVG storica embeddata (`data/embedded_map.js`), province
  selezionabili, colori, nomi ingranditi, scaling del pannello col ridimensionamento.
- **Giocatori e turni** — gestione giocatori, turni, colori, UI.
- **Risorse** — sistema risorse per provincia; nebbia via terra.
- **Popolarità e Prestigio** — definiti a design; prestigio convertibile in punti d'oro.
- **Figure di gioco (pedine)** — aggiunte con editor sulla mappa (WIP).
- **Motore di battaglia / Combattimento** — modello probabilistico con bonus difensivo
  ridotto, ora collegato alla UI (vedi sotto).
- **Plancia giocatore (`play.html`)** — pagina separata dall'editor: si apre col link
  d'invito (`play.html?p=CODICE`), inquadra la mappa sulle province del giocatore e mostra
  due pannelloni ancorati — a sinistra Prestigio/Obiettivi/Popolarità, a destra
  Tesoro/Scorte/Territorio/Esercito/Rinforzi/azioni. `index.html` resta l'editor dell'admin;
  link di ritorno "🛠 Editor" nella barra della plancia, visibile solo all'admin.
  Calcoli in `js/kingdom-stats.js` (puro), render in `js/player-board.js`, palette
  centralizzata in `css/tokens.css`.
- **Partita giocabile** — `js/game-rules.js` (costi §6, connettività §4, produzione §2, puro)
  e `js/game-actions.js` (l'unico punto che muta lo stato: schiera, costruisci, strada,
  recluta temporanei, attacca, inizio/fine turno). L'admin avvia la partita e passa i turni
  dall'editor (`#start-game-btn`/`#end-turn-btn`); ogni giocatore agisce solo nel proprio
  turno (`turnoDi`, ordine a rotazione, §2.1). La plancia mostra l'elenco delle proprie
  province (cliccabili, con pallino "collegata"), il pannello azioni sulla provincia
  selezionata (Schiera/Costruisci/Strade/Attacca) e una legenda costi generata da
  `GameRules.COSTS` (mostra/nasconde, dice cosa manca).
  **Conquista**: le costruzioni sopravvivono al cambio di proprietario (non vengono rase);
  una strada sparisce solo quando ENTRAMBE le province che collega passano a un colore
  diverso dal suo (regola confermata dall'utente, `docs/GAME_DESIGN.md` §9).
- **Fase di schieramento (§5.1)** — le reclute di inizio turno nascono in due mucchi:
  **libere** (1 ogni 3 province + modificatore di Popolarità) che il giocatore distribuisce
  dove vuole, e **obbligatorie** (Capitale +1, Città +1, Fortezza +5) che possono andare
  solo nella provincia dell'edificio che le ha prodotte. Finché il turno è aperto le
  reclute schierate **adesso** si possono ritirare e rimettere altrove (− e + su ogni riga
  dell'elenco province); i soldati già presenti prima del turno non si toccano. Le
  obbligatorie non ancora posate vengono schierate d'ufficio alla chiusura del turno.
  Il totale in attesa è visibile nel badge della barra della plancia, nel riquadro
  "Reclute da schierare" e — regno per regno — nel pannello dell'admin.
  Motore: `recluteDaSchierare` / `recluteVincolate` / `schierateTurno` sul giocatore,
  azioni `deploy`, `deployBound`, `deployAllBound`, `undeploy` in `js/game-actions.js`,
  calcolo puro in `KingdomStats.reinforcementPlan`.
- **Conferme in pagina** — `Risiko.confirm` (`askConfirm` in `js/app.js`) al posto di
  `window.confirm`: il dialogo nativo veniva chiuso d'ufficio dal browser del pannello
  d'anteprima e tornava sempre `false`, quindi attacco, fine turno e avvio partita non
  partivano mai. Ora il dialogo è DOM nostro (Invio conferma, Esc annulla).
- **Scena della battaglia** — l'attacco si vede sulla mappa: la mappa si abbassa e restano
  accese le due province, una lama corre dall'attaccante al difensore, l'impatto dà onde
  d'urto, lampo sulla provincia, scossa breve della mappa e i numeri dei caduti che salgono
  dai due campi (`playBattleFx` in `js/app.js` + CSS in `css/style.css`, spento da
  `prefers-reduced-motion`). Nel pannello destro resta il **rapporto di battaglia**:
  impegnati, caduti e superstiti dei due schieramenti, probabilità che si aveva di vincere
  e bottone ↺ per rivedere lo scontro. Prima di attaccare, ogni bersaglio mostra il
  pronostico in % che si aggiorna col numero di truppe scelto.

- **Partita contro l'IA (nuovo)** — `js/bot.js` + `js/setup.js`.
  - **Nuova partita** (bottone 🎲 nell'editor): sparecchia la mappa, sorteggia 10 feudi da
    3 province **in Europa, Nord Africa e Arabia** (`GameSetup.REGIONS`), il più distanti
    possibile fra loro, regala a ognuno la **Capitale** e una strada gratuita, estrae a
    sorte il regno **umano** e assegna una strategia a tutti gli altri. Il pannello mostra
    chi sei e il link diretto alla tua plancia; la mappa si inquadra sulla regione.
  - **Cinque strategie**: Espansione, Conservatore, Costruttore, Opportunista, Predone —
    cambiano dove schierano, cosa costruiscono, con quale margine di rischio attaccano e
    quanti superstiti lasciano nella provincia presa.
  - I bot **non hanno poteri speciali**: passano dalle stesse azioni di `game-actions.js`
    (fasi, presidio minimo, costi, conquista). Giocano **a passi visibili** (600 ms, vedi
    `Bot.speed`), così la partita si può guardare. Li muove solo chi ha i permessi di
    scrittura (`Risiko.isAdmin()`).
- **Terre di nessuno presidiate (nuovo)** — ogni provincia neutrale ha **2 soldati** (turni
  1-5), e ogni **5 turni** la quota sale di 1 (`GameRules.neutralGarrison`, applicata da
  `GameActions.garrisonNeutrals` all'avvio e a ogni giro completo).
- **Il calendario parte dal turno 1 (nuovo)** — turno 1 = 1000-1009, turno 2 = 1010-1019
  (`Chronicle.FIRST_TURN`). Prima si partiva dal turno 0.
- **Vista generale nella plancia (nuovo)** — bottone 🌍 nella barra: toglie la nebbia e
  mostra tutta la mappa per guardare giocare l'IA; 👑 riporta al proprio regno. Non cambia
  i permessi, solo cosa si vede.
- **Prestigio sospeso** — `GameRules.PRESTIGE_ENABLED = false`: non si accumula e il blocco
  sparisce dalla plancia. Il codice e il §10 restano al loro posto.
- **Fix adiacenze** — l'alone costiero (`map-decor.js`) è un clone di `#map-group` senza id
  ma con la stessa classe `state`: entrava nel grafo dei confini come un nodo `""`
  confinante con tutto il mondo. Ora l'elenco delle province passa da `provincePaths()`
  (solo path con id) in `js/app.js`.

## In lavorazione (WIP)

- Rifinitura pedine e loro editor.
- Bilanciamento del motore di battaglia.
- Obiettivi del ciclo (primario/secondario/terziario) e punti prestigio d'oro: ancora
  segnaposto ("assegnato a inizio ciclo") — manca la logica di assegnazione/verifica.
- Migliorie civiche §6.1 (Sanità/Felicità): il Benessere della Popolarità resta a 3 fisso.
- Movimento truppe fra province proprie (§5.2): oggi si sposta solo schierando reclute o
  conquistando. Le reclute del turno in corso si possono spostare (ritirandole e
  rimettendole), ma i soldati già presenti da prima restano dove sono.
- Mercato (scambio 2:1 con la banca): costruibile ma senza ancora un'interfaccia di scambio.
- Invio dell'invito per email: oggi il link va copiato a mano dall'editor (bottone 🔗
  sulla scheda di ogni giocatore).

## Note

- Multiplayer Firebase: ancora placeholder (`INSERISCI_...`) → modalità locale, nessuna sync.
- `DEV_ADMIN_BYPASS = true` in `js/app.js`: solo test, da rimettere a `false` prima del rilascio.

---
*Regola: questo file si aggiorna a ogni progresso significativo e a ogni commit. Vedi
`rules and behaviours.md`.*

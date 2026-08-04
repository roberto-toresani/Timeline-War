# RISIKO ONLINE — Stato e sviluppi

Documento di stato **condiviso tra tutte le chat**. Riporta la versione attuale del gioco
e dei suoi sistemi. Va aggiornato **ogni volta che si fa un progresso** (in qualunque chat),
e in particolare al momento del commit.

- **Ultimo aggiornamento:** 2026-08-04
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

## In lavorazione (WIP)

- Rifinitura pedine e loro editor.
- Bilanciamento del motore di battaglia.
- Obiettivi del ciclo (primario/secondario/terziario) e punti prestigio d'oro: ancora
  segnaposto ("assegnato a inizio ciclo") — manca la logica di assegnazione/verifica.
- Migliorie civiche §6.1 (Sanità/Felicità): il Benessere della Popolarità resta a 3 fisso.
- Movimento truppe fra province proprie (§5.2): oggi si sposta solo schierando reclute o
  conquistando; niente riallocazione manuale di soldati già piazzati.
- Mercato (scambio 2:1 con la banca): costruibile ma senza ancora un'interfaccia di scambio.
- Invio dell'invito per email: oggi il link va copiato a mano dall'editor (bottone 🔗
  sulla scheda di ogni giocatore).

## Note

- Multiplayer Firebase: ancora placeholder (`INSERISCI_...`) → modalità locale, nessuna sync.
- `DEV_ADMIN_BYPASS = true` in `js/app.js`: solo test, da rimettere a `false` prima del rilascio.

---
*Regola: questo file si aggiorna a ogni progresso significativo e a ogni commit. Vedi
`rules and behaviours.md`.*

# RISIKO ONLINE — istruzioni per l'AI

Gioco di strategia tipo Risiko, online su mappa storica interattiva.
Segui sempre `rules and behaviours.md` per il modus operandi (risposte, sintesi, commit, screenshot).

## Stack
- **Frontend**: HTML + CSS + JS vanilla. Nessun framework, nessun build step.
- **Multiplayer**: Firebase (Firestore per lo stato condiviso, Auth per l'admin).
- **Hosting**: GitHub Pages (deploy da `.github/workflows/deploy-pages.yml`).
- Si serve la cartella `src/` come sito statico.

## Struttura
```
src/
├─ index.html            editor mappa admin (homepage)
├─ play.html             plancia del giocatore (?p=CODICE)
├─ css/
│  ├─ tokens.css         palette e misure :root
│  ├─ style.css          stile editor
│  └─ board.css          stile plancia
├─ js/
│  ├─ app.js             logica principale, closure unica, espone window.Risiko
│  ├─ player-board.js    render plancia: colonna turno, fogli dock, azioni
│  ├─ game-rules.js      costi, connettività, produzione — puro
│  ├─ game-actions.js    UNICO mutatore di stato: schiera/costruisci/attacca/turni
│  ├─ popularity.js      formula Popolarità + piano — puro
│  ├─ spies.js           spie: costo, durata, raggio — puro
│  ├─ religions.js       confessioni, famiglie, blocchi di partenza, scismi — puro
│  ├─ events.js          eventi storici datati: calendario + ciclo di vita — puro
│  ├─ chronicles.js      cronache di colore sul contesto del regno — puro
│  ├─ terrain.js         terreno chiuso/aperto: esponente battaglia — puro
│  ├─ sea-routes.js      portata navi via acqua (Dijkstra su griglia) — puro
│  ├─ doctrines.js       carattere storico dei regni d'evento — puro
│  ├─ objectives.js      obiettivi §10: binario storico, generatore, leva — puro
│  ├─ bot.js             regni IA: 4 strategie + driver turni
│  ├─ setup.js           "Nuova partita": sorteggio feudi, Capitali, umano vs bot
│  ├─ start-map.js       salva/ricarica posizione di partenza
│  ├─ save-slots.js      archivio partite: salva/carica/nuova, slot locali
│  ├─ pope-chat.js       console del Papa: chat admin verso regni
│  ├─ kingdom-stats.js   calcoli puri cruscotto (province, truppe, entrate)
│  ├─ chronicle.js       calendario (1 turno = 1 decennio) e fondazione città — puro
│  ├─ map-anchors.js     dove si posano pedine e navi — puro
│  ├─ map-decor.js       vestizione "carta antica": mare, grana, alone costiero
│  ├─ battle.js          risoluzione probabilistica battaglie — puro
│  ├─ sync.js            sincronizzazione multiplayer (Firestore)
│  ├─ diplomacy.js       patti, privilegi, standing — puro
│  ├─ politics.js        Politica del regno: nobiltà ↔ popolo — puro
│  └─ firebase-config.js chiavi Firebase + UID admin
├─ data/
│  ├─ embedded_map.js    mappa SVG inline in RAW_SVG_CONTENT  ← MAI leggere per intero
│  ├─ map_data.js        dati province
│  ├─ city_names.js      provincia → città storica
│  ├─ historic_battles.js battaglie verificate: anno + provincia
│  ├─ start_religions.js  religione di partenza: eccezioni per nome
│  ├─ province_terrain.js terreno di tutte le 628 province
│  ├─ start_map.json     mappa iniziale salvata (📌 nell'editor)
│  └─ id_mapping.js      mapping id SVG ↔ nomi province
├─ mappe/                copia congelata della mappa definitiva (read-only)
├─ _diag-*.html          pagine di lavoro (non in deploy)
└─ assets/               mappe SVG sorgente
firebase/firestore.rules  regole di sicurezza Firestore
scripts/serve.ps1        server locale dependency-free
driver/                  motore headless Node+Puppeteer per turni bot
docs/                    documentazione per topic (non auto-caricata)
salvataggi/              partite salvate JSON (git-ignored)
```

## Come funziona (punti chiave)
- **Mappa**: embeddada come stringa in `data/embedded_map.js`. Il fetch di `assets/world_map_optimized.svg` è solo fallback.
- **Stato condiviso**: un documento Firestore `games/main`, scritto da tutti i client. Le regole di turno/fase le impone `game-actions.js` lato client.
- **Due pagine, un motore**: `play.html` carica lo stesso `app.js` di `index.html`, distingue con `<body data-mode="player">`. La plancia si aggancia via `Risiko.onRefresh`.
- **Turno a fasi**: `schiera → costruisci → attacca → sposta` (`GameActions.PHASES`). Solo `game-actions.js` muta lo stato — mai mutare direttamente `PLAYERS` o simili.
- **Admin vs giocatore**: `Risiko.isAdmin()` controlla chi muove i bot e chi può intervenire. `?local=1` forza modalità locale concedendo anche l'admin.
- **Partita in due tempi**: `prepareGame` (prepara, `turnoDi = null`) → `beginMatch` (avvia, sorteggia l'ordine).
- Per dettagli su ogni sottosistema → vedi la **guida di navigazione** qui sotto.

## Avvio in locale
Doppio clic su `avvia.bat`, oppure:
```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Root src -Port 5500
```
Poi `http://localhost:5500/`.
`.claude/launch.json` ha la config "risiko" per il server integrato.
`scripts/shot.ps1` cattura screenshot con Chrome headless.

## ⚠ Convenzioni e gotcha obbligatori

Queste regole si applicano a OGNI modifica — leggerle prima di toccare il codice.

- **DEV_ADMIN_BYPASS = true** in `app.js` è solo per test; va rimesso a `false` prima del rilascio.
- **?local=1** (`forceLocal` in `sync.js`): usa sempre per le prove — il server locale punta su Firebase di PRODUZIONE (`timeline-war`). Senza `?local=1`, una `newGame` scrive sul cloud vivo.
- **Mai `window.confirm` / `alert`**: nel pannello anteprima tornano sempre `false`. Usa `Risiko.confirm({title, text, ok, tone}, onYes)`.
- **`MultiplayerSync` è `const`, NON su `window`**: un `const` a livello di script non diventa `window.X`. Usa `typeof MultiplayerSync !== 'undefined'`, mai `window.MultiplayerSync`.
- **`function` non `const arrow` per alias in `app.js`**: gli helper dichiarati con `const`/`let` nella closure di `app.js` sono nella TDZ quando `initMap()` gira in cima — lanciano "Cannot access before initialization". Gli alias verso `MapAnchors` (`boundaryPoints`, `pointInPath`, ecc.) sono `function` apposta (hoisted).
- **`provincePaths()` non `querySelectorAll('path.state')` crudo**: l'alone costiero di `map-decor.js` è un clone di `#map-group` con la stessa `class="state"` — il selettore crudo lo include e restituisce nodi fantasma.
- **`markerIndex` non query in cicli su province**: `refreshMapDisplay` gira dopo ogni azione e ogni mossa bot (~20 ms di budget). Mai `querySelectorAll` dentro quel ciclo — si usa l'indice pre-costruito.
- **`data/embedded_map.js` MAI leggere per intero** (~1.3 MB, ~325K token). Accesso sempre mirato: Grep per `id`/nome provincia + Edit sulla sola porzione.
- **`ownsBoard(player)`** su ogni pop-up che muta stato: un admin che sbircia un regno preso non deve consumare le pergamene (editti, eventi, conquiste, ecc.) al posto del giocatore vero.
- **`GA_MUTATORS`** in `player-board.js`: ogni nuovo mutatore di `GameActions` usato dalla plancia va aggiunto a quell'elenco, o il gate anti-admin non lo coprirà.
- **`reachCached`** obbligatorio per le portate delle navi nei cicli di render: `prepare()` in `sea-routes.js` è asincrona (~0.5 s) e ogni portata da Veliero costa ~30 ms senza cache.
- **`salvataggi/`** è git-ignored: non committare file JSON di partite.
- **`Risiko.confirm`** scrive `textContent`, non `innerHTML`: no tag HTML nelle stringhe passate. Per a-capo usare `\n` e assicurarsi che `#ui-confirm .uc-text` abbia `white-space: pre-line`.

## Come navigare la documentazione

**Tre sezioni distinte. Aprire solo quella richiesta.**

---

### 📖 SEZIONE REGOLE
Per ogni domanda su meccaniche, simulazioni, nuove funzionalità: carica sempre `docs/regole/MASTER.md` + la sotto-sezione pertinente.

| Domanda / area | File da aprire |
|---|---|
| Contesto fasi turno, formule, costanti (sempre) | `docs/regole/MASTER.md` |
| Attacchi, difese, invasioni, truppe, Capitale, neutrali | `docs/regole/ATTACCHI_TRUPPE.md` |
| Popolarità, benessere, politica, tassazione | `docs/regole/POPOLARITA_POLITICA.md` |
| Diplomazia, patti, alleanze, standing, fede, scismi | `docs/regole/DIPLOMAZIA_FEDE.md` |
| Mercati, commerci, carovane, banca, rotte | `docs/regole/MERCATI_COMMERCI.md` |
| Obiettivi §10, binari storici, strategie bot, dottrine | `docs/regole/OBIETTIVI_BOT.md` |
| Raccolta, risorse, produzione, mercenari, cavalieri, bonus/malus | `docs/regole/RISORSE_ECONOMIA.md` |
| Eventi storici, crociate, Peste, Mongoli, spie, spedizioni | `docs/regole/EVENTI.md` |
| Regole complete (§1–§11) | `docs/GAME_DESIGN.md` |
| Numeri esatti obiettivi per regno | `docs/BINARI_STORICI.md` |

---

### 🎨 SEZIONE DESIGN
**Non aprire mai automaticamente.** Solo se il task riguarda esplicitamente mappa, grafica, UI o layout.

| Area | File |
|---|---|
| Mappa SVG, render pedine, terreno, navi, nebbia, strade | `docs/design/MAPPA_GRAFICA.md` |
| UI plancia, fogli dock, cursori, modale conquista, tour, mobile | `docs/design/UI_PLANCIA.md` |

---

### 💾 SEZIONE SALVATAGGI E SYNC
**Solo su richiesta esplicita** (interventi admin, tornare indietro di un turno, problemi di sync).

| Area | File |
|---|---|
| Firebase, sync, turni, interventi admin, save slots, multiplayer | `docs/sync/MULTIPLAYER_SYNC.md` |
| Partite salvate | `salvataggi/` (git-ignored, non aprire) |
| Versione originale CLAUDE.md | `docs/archive/CLAUDE_ORIGINALE.md` |

---

### File da NON aprire mai automaticamente
- `data/embedded_map.js` (1.3 MB, ~325K token)
- `salvataggi/*.json`
- `Obiettivi*.xlsx`
- `docs/CRONOLOGIA_STORICA.md`
- `docs/archive/*` (solo su richiesta esplicita)
- `driver/node_modules/**`

## Deploy
Push su `main` → GitHub Pages pubblica il contenuto di `src/`.
Le chiavi Firebase nel client non sono segrete: la sicurezza è in `firebase/firestore.rules`.

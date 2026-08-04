# RISIKO ONLINE — istruzioni per l'AI

Gioco di strategia tipo Risiko, giocato online su una mappa storica interattiva.
Questo file descrive **com'è fatto il progetto** e **come lavorarci**. È la fonte di verità
per qualsiasi agente AI (Claude, ecc.).

## Stack
- **Frontend**: HTML + CSS + JavaScript vanilla. Nessun framework, nessun build step.
- **Multiplayer**: Firebase (Firestore per lo stato condiviso, Auth per l'admin).
- **Hosting**: GitHub Pages (deploy automatico da `.github/workflows/deploy-pages.yml`).
- Si apre servendo la cartella `src/` come sito statico.

## Struttura
```
src/                     l'app di gioco (tutto ciò che viene servito/deployato)
├─ index.html            EDITOR MAPPA dell'admin (homepage)
├─ play.html             PLANCIA del giocatore, si apre col link d'invito ?p=CODICE
├─ css/
│  ├─ tokens.css         palette e misure in :root (unica fonte dei colori)
│  ├─ style.css          stile dell'editor (usato anche dalla plancia)
│  └─ board.css          stile della plancia giocatore
├─ js/
│  ├─ app.js             logica di gioco e UI (file principale, comune alle due pagine)
│  ├─ player-board.js    render dei due pannelloni + azioni della plancia
│  ├─ game-rules.js      costi (§6), connettività (§4), produzione di turno (§2) — puro
│  ├─ game-actions.js    UNICO punto che muta lo stato: schiera/costruisci/attacca/turni
│  ├─ kingdom-stats.js   calcoli puri del cruscotto (province, truppe, entrate, rinforzi)
│  ├─ battle.js          risoluzione probabilistica delle battaglie (funzione pura)
│  ├─ sync.js            sincronizzazione multiplayer (Firestore)
│  └─ firebase-config.js chiavi Firebase + UID admin (placeholder finché non configurato)
├─ data/
│  ├─ embedded_map.js    la mappa SVG completa, inline in RAW_SVG_CONTENT
│  ├─ map_data.js        dati delle province
│  └─ id_mapping.js      mappatura id SVG ↔ nomi province
└─ assets/               mappe SVG (world_map*.svg)
firebase/firestore.rules regole di sicurezza Firestore (da pubblicare nella console Firebase)
scripts/serve.ps1        server statico locale dependency-free (PowerShell)
_archive/                materiale legacy/di supporto NON usato dal gioco (git-ignored)
```

## Come funziona (in breve)
- La mappa è **embeddata** come stringa in `data/embedded_map.js` (`RAW_SVG_CONTENT`); il fetch
  di `assets/world_map_optimized.svg` in `app.js` è solo un fallback che di norma non scatta.
- Lo stato di gioco vive in un unico documento Firestore `games/main`: chiunque lo legge in
  tempo reale (sola lettura), solo l'admin (UID in `firebase-config.js`) può scriverlo.
- `app.js` gestisce turni, giocatori, selezione province, colori e la UI.
- **Due pagine, un solo motore**: `play.html` carica lo stesso `app.js` di `index.html` e si
  dichiara con `<body data-mode="player">`. app.js resta una singola closure e in coda espone
  `window.Risiko` (poche funzioni: focus del giocatore, province possedute, pedine, popolarità,
  inquadratura della mappa) più l'hook `Risiko.onRefresh`, a cui `player-board.js` aggancia il
  render dei pannelli. Chi aggiunge roba alla plancia passa da lì, non spezza app.js in moduli.
- **Link d'invito**: ogni giocatore ha un campo `invite` (codice) salvato nello stato; l'admin
  lo copia dal bottone 🔗 sulla scheda del giocatore. Il codice **non è un segreto**: porta al
  regno giusto, ma la sicurezza vera resta `firestore.rules` (scrittura solo admin). Nella
  plancia, il link "🛠 Editor" per tornare a `index.html` è visibile solo quando
  `Risiko.isAdmin()` è vero.
- **Partita e turni**: l'admin avvia la partita (`#start-game-btn` in `index.html`, chiama
  `GameActions.startGame()`) e passa i turni (`#end-turn-btn`); ogni giocatore ha anche il
  proprio bottone Fine turno nella plancia. `turnoDi`/`ordine`/`primoDelGiro` vivono in
  `app.js` ed entrano nel documento di stato — un giocatore può agire solo quando
  `turnoDi` è il suo id (§2.1, rotazione del primo giocatore a ogni giro).
- **Regola di conquista (confermata dall'utente, non nel design doc originale)**: le
  costruzioni **non vengono rase** quando una provincia cambia proprietario — restano,
  cambiano solo colore. Una strada sparisce solo quando **entrambe** le province che
  collega sono passate a un colore diverso dal suo (`pruneRoadsTouching` in
  `game-actions.js`). Vedi `docs/GAME_DESIGN.md` §9.

## Avvio in locale
Doppio clic su `avvia.bat` (apre il browser e avvia il server), oppure da terminale:
```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Root src -Port 5500
```
Poi apri http://localhost:5500/ . (Esiste anche `.claude/launch.json` con la config "risiko".)
`scripts/serve.ps1` gestisce ogni richiesta in try/catch: un errore su una richiesta non
deve mai spegnere il server.

## Convenzioni / cose da sapere
- I file in `_archive/` sono materiale vecchio (script Python di generazione mappa, txt di
  debug, immagini di bandiere/risorse non usate, versioni di test). Non caricarli nel gioco;
  usali solo come riferimento. Non sono committati.
- `DEV_ADMIN_BYPASS = true` in `js/app.js` dà a tutti i permessi admin: è **solo per test**,
  va rimesso a `false` prima del rilascio.
- `firebase-config.js` contiene placeholder `INSERISCI_...`: finché non c'è un vero progetto
  Firebase, il multiplayer resta in modalità locale (nessuna sync).
- Le chiavi Firebase nel client **non sono segrete**: la sicurezza è data da `firestore.rules`.
- **Mai leggere per intero** `assets/world_map.svg` e `data/embedded_map.js` (~1,3 MB / ~325k
  token: sfondano il contesto). Accesso sempre mirato: Grep per `id`/nome provincia + Edit
  sulla sola porzione. Dettaglio: vedi `rules and behaviours.md` §8-10.

## Regole e comportamenti dell'AI
Segui sempre `rules and behaviours.md` (regole su risposte, sintesi, domande, commit e
screenshot). È la fonte di verità per il modus operandi.

## Deploy
Push su `main` → GitHub Pages pubblica il contenuto di `src/`.

# Multiplayer e Sync — Implementazione

## Architettura
- Stato: documento Firestore `games/main`, scritto da tutti i client.
- Regole di turno: imposte lato client da `game-actions.js`, NON da `firestore.rules` (`allow write: if true`).
- `MultiplayerSync` è un `const`, **NON su `window`**: usa `typeof MultiplayerSync !== 'undefined'`, mai `window.MultiplayerSync`.

## lastState / hasState
- `MultiplayerSync` ricorda l'ultimo snapshot (`lastState`/`hasState`) e lo ri-emette ai listener tardivi.
- Senza, chi arriva dopo il primo `onSnapshot` vedeva "Partita non avviata" finché l'admin non toccava qualcosa.

## History snellita (perf 2026-10-08)
- `history` nel documento cloud: solo il turno corrente (`{ [turn]: TURN_HISTORY[turn] }`).
- `saveAutoSave` snellisce prima di spedire; `applyCloudState` **fonde** con `Object.assign` invece di sostituire.
- **Chi tocca `saveAutoSave` NON rimetta lo storico intero** nel push "per uniformità".
- Autosave locale, archivio e backup per-turno (`backupTurn`) hanno lo storico pieno.

## `mergePlayerData` — snapshot ricrea i record
- Ogni snapshot ricrea i record dei regni. Chi tiene un record vecchio muta un oggetto fuori dallo stato.
- `liveArg` in coda a ogni funzione esportata di `game-actions.js`: scambia un record non più vivo con quello attuale.
- Chi muta un regno **fuori** da game-actions.js rilegge il record da `Risiko.players()`.

## Presenza (`presence/{codice}`)
- Dice quale regno una persona ha aperto (link `?p=`).
- Regola Firestore: `match /presence/{id}` aperta a tutti.
- `setPresence`/`onPresenceChange` in sync.js, con replay dell'ultimo stato.
- `Risiko.markPresence(player)` la scrive dalla plancia quando `invitePinned`, saltando se è admin.
- Badge "👤 Preso dal giocatore" solo se `!p.bot`.

## Chat (`chat/{id}`)
- Regola Firestore: `match /chat/{id}` aperta a tutti.
- Ultimi `CHAT_KEEP = 300` messaggi (`orderBy('ts','desc').limit(300)` poi rovesciati).
- Si azzera a partita nuova: `GameActions.startGame` → `MultiplayerSync.clearChat()`.
- Messaggio privato: `{to, toId}` — filtro lato client, non crittografico.
- **Bot in chat**: `maybeBotReply` (pubblico) / `maybeBotReplyPrivate` (privato). Gate `R.isAdmin()`. Una replica ogni ~4s (`lastBotReplyAt`). Mai rispondere a un altro bot.

## Papa (`js/pope-chat.js`)
- Non è un regno. Firma in chat che l'admin usa da finestra a parte.
- Stessa collezione `chat`: `{regno:'Il Papa', papa:true, to?, toId?}`.
- Visibile solo a `Risiko.isAdmin()` e senza `?p=` nell'URL.
- Regni musulmani: filo Papa compare **solo** dopo che il Papa ha scritto loro (`papaReachable`).
- `papa:true` fa saltare `handleIncomingChat` → i bot non rispondono al Papa.

## Link d'invito
- Campo `invite` (codice) su ogni player, copiato dal bottone 🔗.
- **Codice sul documento VIVO**: `inviteUrlLive` → `MultiplayerSync.ensureInvite(id, code)` (transazione: se già esiste online, restituisce quello).
- Con `?p=CODICE`: `resolvePlayer` **non** guarda mai sessionStorage — ritenta ogni 250ms finché arriva lo stato. Dopo ~10s il codice è sbagliato.
- `invitePinned`: blocca `followTurn` su quel regno. Nasconde "Cambia regno", "🌍", "🛠 Editor".

## Save slots
- **Tre livelli di persistenza** (non confonderli):
  1. **Mappa iniziale** (`start-map.js`): proprietari/pedine/strade/anagrafica — non è una partita.
  2. **Backup per turno** (`backupTurn`/`restoreTurn`, collezione Firestore): rimediare a un danno.
  3. **Archivio slot** (`save-slots.js`, localStorage `risiko_save_slots`): partite intere con nome.
- `buildSnapshot()` = unica fotografia; `applySnapshot()` = unica porta di caricamento.
- `Risiko.loadSnapshot(data)` gated `isAdminMode`; forza un push al cloud (`forcePushOnce`).
- **Cartella `salvataggi/`** (serve.ps1 `GET /_saves`/`POST /_saves`): un file per turno, `turno-NNN_YYYY.json`, si sovrascrive.

## Interventi admin a partita in corso
- `beginIntervention`: alza `adminIntervening`, blocca `applyCloudState` (mosse non sovrascrivono) e `saveAutoSave` (non esce).
- `commitIntervention`: calcola `diffSnapshots`, ripristina lo stato vivo, **persiste con saveAutoSave()**.
- **`pendingDiff` VIVE NELLO STATO** (non solo in memoria): `buildSnapshot` lo porta, `applyTurnState` lo riAdotta.
- Online viaggia su `presence/admin-intervention` (canale a sé, non `games/main`).
- Applicato **solo dall'admin regista** al cambio turno (`isInterventionApplier`).
- Oro/scorte a partita in corso: `deferDecree` → `queueDecree` → `pendingDiff.decrees` → `applyDecree` (idempotente, `edittoId`).

## 🔄 Aggiorna tutti
- `#reload-all-btn` → doc `presence/app-reload` → ogni pagina aperta si ricarica dopo 5s.
- Il motore headless non si ricarica (`navigator.webdriver`).

## Rev e guardia di monotonìa
- `rev` cresce a ogni scrittura riuscita (transazione in sync.js).
- `lastAppliedRev`: scarta snapshot con `rev` non superiore all'ultimo applicato.
- `beginTurn` è **idempotente per turno globale** (`player.beginStamp`): produzione fatta una volta sola.

## Modalità locale (`?local=1`, `forceLocal` in sync.js)
- Usa sempre `?local=1` per le prove — il server locale punta su Firebase di PRODUZIONE.
- Senza `?local=1`, una `newGame` scrive sul cloud vivo.

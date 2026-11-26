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

## Registro del turno (`player.registro`, dal 2026-11-25)
- Ogni azione **riuscita** lascia una voce compatta sul record del regno: la scrive l'involucro dell'API in coda a `game-actions.js` (regole in `TURN_LOG`), più le voci interne del motore (`inizio`, `leva`, `diserzione`, `schiera-vincolate` d'ufficio, `schiera-auto`, `auto-turno`).
- Ogni voce: `t` (turno globale), `f` (fase), `az` (azione) + campi propri; `delta` = monete/scorte guadagnate (+) o spese (−) dall'azione.
- `attacca`/`approdo`: `A` attaccanti (`mercA`, `cavA`), `D` difensori (`mercD`, `cavD`), `mura`, `ter`, `P` = pronostico mostrato (%), `Peff` = probabilità del tiro vero se la ventura l'ha spostata, `esito`, `persiA`/`persiD`, `sup`. Primo dei due attacchi: `esito: 'primo attacco …'` e `Pdopo`.
- `inizio`: `chi` (`umano` / `admin` / `bot:<strategia>`), `province`, `libere` (nuove), `avanzate`, `vincolate`, `entrate`, `cassa`, `popolarita`, `soldati`, `fronte` = fino a 12 province proprie confinanti con un regno `{p, mie, loro, chi}`, le più esposte prima.
- `opzioni` (entrando in Attacchi): il menu degli attacchi di terra, fino a 12 `{da, verso, dif, A (tutti i partenti), D, mura, P, patto}`, i più probabili prima. Confrontato con le voci `attacca` dice cosa è stato scelto e cosa scartato.
- `consiglio` (solo regni NON bot): cosa avrebbe fatto l'IA al posto suo (`Bot.advice` in `bot.js`, strategia del regno o `espansione`). `fase: 'schiera'` → `schiera: [{p, n}]`; `fase: 'attacca'` → `attacco: {da, verso, dif, A, D, P}` + `soglia` della strategia. Non muove niente e non sporca la memoria del turno di un bot.
- Si tengono gli ultimi 3 turni globali (max 150 voci per regno). Voci ripulite da `undefined` e da array di array (Firestore rifiuta l'intera scrittura).
- **Archivio permanente**: a giro finito (accanto a `backupTurn`) le voci del turno appena chiuso di tutti i regni vanno in `games/main/turns/registro-N` = `{registroTurno, regni: [{id, name, chi, voci}], savedAt}`. Senza campo `turn` apposta: potatura/elenco/cancellazione dei backup filtrano su `turn` e non lo toccano. Scritto con `set`: un turno rigiocato sostituisce la copia vecchia. In locale (`?local=1`) va in `localStorage['risiko_registro_archivio']`, ultimi 20 turni.
- Lettura: `GameActions.turnLogOf(idONome, turno?)` in console, `players[i].registro` da `games/main`, oppure via REST `.../documents/games/main/turns/registro-N`.
- Le azioni fallite non si registrano; i turni giocati prima del 2026-11-25 non hanno registro.

## Presenza (`presence/{codice}`)
- Dice quale regno una persona ha aperto (link `?p=`).
- Regola Firestore: `match /presence/{id}` aperta a tutti.
- `setPresence`/`onPresenceChange` in sync.js, con replay dell'ultimo stato.
- `Risiko.markPresence(player)` la scrive dalla plancia quando `invitePinned`, saltando se è admin.
- Badge "👤 Preso dal giocatore" solo se `!p.bot`.

## Chat (`chat/{id}`)
- Regola Firestore: `match /chat/{id}` aperta a tutti.
- Ascolto sugli ultimi `CHAT_KEEP = 60` messaggi (era 300: consumava la quota di letture). I messaggi visti si accumulano in `chatAll` (per id), così non spariscono quando escono dalla finestra.
- **Storico a richiesta**: bottone "↑ Mostra messaggi precedenti" in cima alla chat della plancia → `MultiplayerSync.loadOlderChat()` (get una tantum, `startAfter` il più vecchio, blocchi da 60); `chatHasOlder()` dice se ce ne sono altri.
- **Turno sul messaggio**: `sendChat` timbra `turno` (`Risiko.turn()`); plancia e console del Papa mostrano "turno N · anno" invece dell'ora. I messaggi anteriori al 2026-11-26 non hanno `turno`: si mostra il giorno.
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

## Salvataggio affidabile e quota Firestore (2026-11-26)
- **Bug "turno chiuso di notte, la mattina non c'è"**: le 50.000 letture gratuite al giorno di Firestore finivano verso sera (log del motore: `resource-exhausted` dalle 20:52). `pushState` è una transazione (legge prima di scrivere) → falliva fino all'azzeramento delle 9:00 italiane; la presenza (set semplice) invece passava. Il giocatore vedeva il turno chiuso, online non c'era.
- **Consumo principale**: la chat leggeva 300 messaggi a ogni apertura/ripresa della plancia → `CHAT_KEEP = 60`.
- **sync.js**: un push alla volta (`pushInFlight`/`pushQueued`, niente più rifiuti di guardia contro il proprio push precedente); errori non di guardia ritentati da soli (2→30 s, e su `online`/ritorno in primo piano) ricostruendo lo stato dal vivo con `setRetryHook(saveAutoSave)`; `flushNow` su `visibilitychange`/`pagehide`; fine turno con `{ now: true }` (niente debounce).
- **Spia sulla plancia** (`#sync-pill`, `onPushStatus`): "✓ Salvato online" / avviso rosso fisso se non salvato (messaggio apposito per la quota).
- **Diagnostica**: un errore lascia `syncErr`/`syncErrAt`/`syncUa` sul doc `presence/{codice}` del giocatore (merge), `syncOkAt` alla ripresa.
- `saveAutoSave`: l'autosave in localStorage è in try/catch, non può più bloccare il push online.

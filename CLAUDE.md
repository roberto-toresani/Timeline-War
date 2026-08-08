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
│  ├─ bot.js             regni governati dall'IA: 5 strategie + driver dei turni
│  ├─ setup.js           "Nuova partita": sorteggio feudi, Capitali, umano vs bot
│  ├─ kingdom-stats.js   calcoli puri del cruscotto (province, truppe, entrate, rinforzi)
│  ├─ chronicle.js       calendario (1 turno = 1 decennio) e fondazione delle città — puro
│  ├─ map-anchors.js     DOVE si posano le cose: ancora di terra e approdo — puro
│  ├─ map-decor.js       vestizione "carta antica": mare, grana, alone costiero
│  ├─ battle.js          risoluzione probabilistica delle battaglie (funzione pura)
│  ├─ sync.js            sincronizzazione multiplayer (Firestore)
│  └─ firebase-config.js chiavi Firebase + UID admin (placeholder finché non configurato)
├─ data/
│  ├─ embedded_map.js    la mappa SVG completa, inline in RAW_SVG_CONTENT
│  ├─ map_data.js        dati delle province
│  ├─ city_names.js      provincia → città storica che vi sorge (solo colore)
│  ├─ historic_battles.js battaglie vere: anno + provincia (solo se verificate)
│  └─ id_mapping.js      mappatura id SVG ↔ nomi province
├─ _diag-anchors.html    pagina di lavoro: disegna gli ancoraggi di tutte le province
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
- **Presidio minimo (§5)**: una provincia **non resta mai sguarnita**. `GameRules.MIN_GARRISON`
  (=1) e `GameRules.spendableTroops(n)` sono l'unica fonte della regola: qualunque cosa porti
  soldati fuori da una provincia lavora sugli **spendibili**, non sui presenti — attacco,
  spostamento finale, costi in soldati delle costruzioni (Capitale 5, Mercato 4, Nave 3,
  Strada 1) e persino il ritiro di una recluta appena schierata. Anche la conquista la
  rispetta dall'altra parte: almeno 1 superstite resta nella provincia presa. Se aggiungi
  un'azione che sottrae soldati, passa da `spare(path)` in `game-actions.js` e da `spareOf(path)`
  in `player-board.js`, così il massimo mostrato e quello accettato non divergono.
- **Il turno è a fasi, in quest'ordine**: `schiera → costruisci → attacca → sposta`
  (`GameActions.PHASES`, campo `player.fase`). Si avanza con `GameActions.nextPhase()`
  e non si torna indietro. Il vincolo vive in `game-actions.js` (ogni azione chiama
  `requirePhase`), non solo nella UI: il pannello destro mostra solo la fase corrente
  ma è il motore a rifiutare un click fuori tempo. In `play.html` la "pista delle
  fasi" (`#bp-phases`) è l'indice di lettura del pannello.
  - `schiera`: reclute libere e obbligatorie (§5.1). Oltre all'elenco province c'è il
    **cursore sulla mappa** (`#map-deploy-hud`), un −N+ ancorato alla provincia
    selezionata; è HTML e non SVG apposta (dentro l'SVG i bottoni scalerebbero con lo
    zoom), e insegue la provincia con `requestAnimationFrame` perché pan e zoom della
    mappa non emettono eventi. Coordinate da `Risiko.provinceScreenPos(id)`.
  - `costruisci`: edifici, navi, strade, unità temporanee.
  - `attacca`: quanti attacchi si vuole. `Risiko.showAttackArrows(fromId, ids)` disegna
    frecce animate verso i confinanti attaccabili, nel gruppo `#attack-arrows` appeso in
    coda all'SVG (non fra le pedine: `renderPiecesForPath` le cancellerebbe).
  - **conquista**: vinta una battaglia con più di 1 superstite, `player.conquista` resta
    aperta e blocca ogni altra azione finché `resolveConquest(player, occupanti)` non
    decide quanti restano nella provincia presa e quanti rientrano in quella di partenza
    (almeno 1 deve occupare). A fine turno si chiude d'ufficio lasciandoli tutti lì.
  - `sposta`: **un solo** spostamento per turno (`player.spostamentoFatto`), fra due
    province proprie unite da una catena ininterrotta di province proprie
    (`moveTargets`), lasciando almeno 1 soldato alla partenza.
- **Schieramento (§5.1)**: le reclute di inizio turno sono di due tipi. Le **libere**
  (province ÷ 3, più il modificatore di Popolarità) vanno dove vuole il giocatore e si
  possono ritirare/rimettere finché il turno è aperto; le **obbligatorie** (Capitale +1,
  Città +1, Fortezza +5) possono andare **solo** nella provincia dell'edificio che le ha
  prodotte, e a fine turno vengono schierate d'ufficio se il giocatore non l'ha fatto.
  Serbatoi sul record giocatore: `recluteDaSchierare`, `recluteVincolate` (per provincia),
  `schierateTurno` (cosa si è posato adesso: è l'unica cosa ritirabile).
- **Alias di funzione: `function`, non `const arrow`.** `initMap()` gira in cima alla
  closure di `app.js` e da lì scende fino al render di risorse e pedine: qualunque
  helper dichiarato più in basso con `const`/`let` è ancora nella sua **zona morta** e
  lancia "Cannot access before initialization". L'errore veniva inghiottito dal
  try/catch di `loadAutoSave`, quindi lo stato salvato non si caricava e la plancia
  diceva "Partita non avviata" con la partita in corso. Gli alias verso `MapAnchors`
  (`boundaryPoints`, `pointInPath`, `mainBodyBBox`, `isCoastalProvince`, `seaAnchor`)
  sono `function` apposta: sono hoistate e il buco non esiste.
- **Partita contro l'IA — due avvii diversi.** Quello NORMALE (`⚔️ Gioca con l'IA`,
  `GameSetup.newGame()`) **tiene la mappa dipinta nell'editor**: i regni sono quelli
  che ci sono, con i loro confini; chi non ha una Capitale la riceve nella sua
  provincia più interna, l'economia torna ai valori del §11 e il calendario al turno 1.
  Il sorteggio (`🎲 Sorteggia una mappa nuova`, `newGame({mantieniMappa:false})`)
  **cancella** province, pedine e strade: è l'eccezione, e il dialogo lo dice.
- **Sorteggio della mappa (solo `mantieniMappa:false`)**: `js/setup.js` —
  sparecchia la mappa, dà a ogni regno 3 province ben distanziate (≥6 confini) e la
  **Capitale in regalo** — i regni nascono tutti in **Europa, Nord Africa e Arabia**
  (`GameSetup.REGIONS.europa`: rettangoli sulle coordinate dell'SVG, misurati sulla mappa
  vera per lasciare fuori Persia, Sudan e Sahel; le province che scavalcano il bordo
  mappa, tipo Alaska, hanno un bounding box largo quanto il mondo e si scartano dalla
  larghezza). Senza Capitale non si raccoglie nulla e costruirla vorrebbe 5
  soldati spendibili che all'inizio non ci sono: senza il regalo la partita non parte),
  più una strada gratuita e un feudo che confina con una provincia di **pietra** (la
  prima strada la collega e dà la materia prima per le successive). Poi estrae a sorte il
  regno **umano** e assegna a tutti gli altri una strategia di `js/bot.js`.
  I bot **non hanno scorciatoie**: chiamano le stesse funzioni di `game-actions.js` del
  giocatore, quindi qualsiasi regola nuova vale anche per loro. Il turno di un bot è un
  **generatore**: ogni `yield` è un'azione già applicata e il driver aspetta `Bot.speed()`
  ms — serve a poterli guardare, non è una pausa di comodo. La catena parte da
  `Bot.run()` (dopo il fine turno umano e all'apertura della pagina) e si ferma da sola
  quando torna il turno di un umano. **Solo chi è admin** muove i bot (`Risiko.isAdmin()`):
  le scritture di stato restano dell'admin, come da `firestore.rules`.
  Una strategia in più = una voce in `Bot.STRATEGIES`, non un ramo `if` sparso.
- **Terre di nessuno presidiate** (regola dell'utente): ogni provincia neutrale ha
  `GameRules.neutralGarrison(turno)` soldati — 2 nei turni 1-5, 3 nei 6-10, e così via.
  `GameActions.garrisonNeutrals()` è l'unico posto che li mette: gira all'avvio partita e
  alla fine di ogni giro completo, e **alza soltanto** (una provincia conquistata non è
  più neutrale e esce da sola dal conteggio; una che ha respinto un attacco torna a quota
  al giro dopo).
- **Popolarità e guardia della Capitale**: con ≤5 soldati nella Capitale la Popolarità
  vale 2 (§8), cioè −1 risorsa e −1 recluta ogni turno — abbastanza da azzerare il
  raccolto di un regno piccolo. Portare la guardia a 6+ la riporta a 3. I bot lo sanno
  (`guardiaCapitale` nel profilo): schierano lì per primi, non fanno partire la guardia
  all'attacco e ci riportano truppe con lo spostamento di fine turno.
- **Prestigio sospeso**: `GameRules.PRESTIGE_ENABLED = false` (scelta dell'utente). Non si
  accumula e il blocco sparisce dalla plancia; il §10 e il codice restano. Si riaccende
  cambiando quella sola costante.
- **Vista generale della plancia**: il bottone 🌍 in `play.html` chiama
  `Risiko.focusPlayer(null)` — niente focus, niente nebbia, si vede tutta la mappa e si
  guardano giocare i bot. Non dà permessi: le azioni restano quelle del proprio regno nel
  proprio turno.
- **Dove si posano pedine e navi (`js/map-anchors.js`)**: il centro del bounding box
  NON è un punto della provincia — su Messico, Norvegia, Cile e su ogni forma a
  mezzaluna cade in mare o dentro il vicino. `MapAnchors.landAnchor(path)` cerca il
  punto più *profondo* (il più lontano dal bordo) fra i candidati che stanno davvero
  dentro il poligono e restituisce `{x, y, r}`, dove `r` è il raggio libero: chi
  disegna una fila la stringe dentro quel raggio. `MapAnchors.seaAnchor(path)` fa
  l'equivalente in acqua per le navi: prende i punti di bordo la cui **normale
  uscente** porta in acqua, li spinge al largo e sceglie il più vicino alla provincia
  fra quelli con abbastanza acqua libera intorno; se al largo è tutto terra (Baltico,
  Adriatico, Manica) si riaccosta alla riva invece di rinunciare. "È acqua?" si chiede
  a **tutte** le province tramite un indice per bounding box (`landIndex`), non ai soli
  vicini di terra: era da lì che le navi finivano sopra una provincia non confinante.
  - **I laghi non sono mare** (scelta dell'utente): niente navi sul lago Ciad, sui laghi
    finlandesi, sui Grandi Laghi o nella fessura fra due province mal ritagliate. Il
    discrimine è la **stazza** dello specchio d'acqua: `waterIsSea` allaga (BFS) la
    macchia d'acqua su una griglia di `WCELL` e si ferma appena supera `SEA_CELLS` celle
    — chi arriva al tetto è mare, chi si chiude prima è lago. Il verdetto vale per tutte
    le celle visitate, quindi ogni specchio d'acqua si paga una volta per l'intera
    mappa. Da qui discende `isCoastal`: **costiera = ha un approdo vero**, ed è la
    stessa risposta che usa `canPlacePiece` per accettare o rifiutare una nave. Con le
    soglie attuali il Caspio passa per mare (è grande) e i Grandi Laghi no: se serve
    cambiare, si tocca `SEA_CELLS`, non si aggiungono elenchi di eccezioni.
  - **Anticollisione**: ogni approdo assegnato si registra in `svg.__seaSpots` con il
    proprio ingombro; i successivi preferiscono i punti liberi e, se il posto migliore è
    comunque occupato, `shiftAway` scivola al largo o lungo la costa finché le navi non
    si sovrappongono più. Nei mari stretti lo zero non esiste e si tiene il meno peggio.
  Tutto è memoizzato sull'elemento `<path>` e ricalcolato solo al ricaricamento della
  mappa. Verifica: `http://localhost:5500/_diag-anchors.html` disegna gli ancoraggi di
  tutte le province (verde = dentro, rosso = fuori, blu = approdo) e conta gli errori;
  `?zoom=Provence`, `?only=Mexico,Sonora`, `?pieces=1` per guardare le pedine vere.
- **Elenco province = `provincePaths()`**: l'alone costiero di `map-decor.js` è un clone di
  `#map-group` con gli id rimossi ma con la stessa classe `state`. Chi cerca le province
  con `querySelectorAll('path.state')` prende anche quello: prima finiva nel grafo dei
  confini come nodo `""` confinante con tutto il mondo. Usa `provincePaths()` (app.js) o
  `Risiko.engine.allPaths()`, mai il selettore crudo.
- **Mai `window.confirm`/`alert`**: nel pannello d'anteprima (e in iframe sandboxati) il
  browser chiude d'ufficio il dialogo nativo e `confirm()` torna sempre `false` — l'azione
  non parte e sembra un bug del gioco. Usa `Risiko.confirm({title, text, ok, tone}, onYes)`
  (`askConfirm` in `app.js`), che è DOM nostro.
- **Scena della battaglia**: `Risiko.playBattleFx(info)` in `app.js` disegna l'attacco
  sulla mappa (carica, impatto, scossa, numeri dei caduti) usando l'oggetto che
  `GameActions.attack` restituisce; il CSS sta in `style.css` ed è disattivato da
  `prefers-reduced-motion`. Il rapporto di battaglia nel pannello destro è
  `renderBattle()` in `player-board.js`.
- **Calendario e fondazione delle città**: un turno è un **decennio** e la partita
  comincia dal **turno 1** = 1000-1009 (`Chronicle.FIRST_TURN`; app.js parte da lì e
  `resetHistory()` ci riporta). Chi conta i turni per un ciclo o per una soglia usa
  `turno − 1`, non `turno`.
  Il calendario sta tutto in `js/chronicle.js` (`YEAR_ZERO`, `yearOfTurn`): `app.js` legge
  da lì per la targhetta dell'anno, non ricalcola `1000 + turno*10`. Quando si costruisce
  una **Città** (o una **Capitale**, `Chronicle.foundCapital`),
  `GameActions.build` allega al risultato un oggetto `fondazione`
  (`Chronicle.foundCity`) e la plancia srotola la pergamena `Risiko.showFoundation(info)`
  (in `app.js`, CSS `#ui-foundation` in `style.css`): "Anno Domini 1142 — nella provincia
  di Home Counties nasce la città di Londra". Il nome vero della città viene da
  `data/city_names.js` (provincia → città); se la provincia non è in tabella vale il suo
  stesso nome (mezzo mondo si chiama già come la sua città). L'anno **non è casuale**: è un
  hash di provincia+turno dentro il decennio, così non serve salvarlo nello stato e la
  stessa fondazione dà sempre lo stesso anno. È **solo colore**: nessuna regola dipende da
  qui, e se `chronicle.js` non c'è la Città si costruisce lo stesso.
- **Eco storica delle battaglie**: se nella provincia attaccata (o in quella di partenza),
  **dentro il decennio di quel turno**, si è combattuta davvero una battaglia, `attack`
  allega `cronaca` (`Chronicle.battleEcho`) e la plancia srotola la stessa pergamena in
  variante rossa (`.uf-battaglia`), dopo la scena della battaglia (~3,9s) per non coprirla.
  Il corpus è `data/historic_battles.js`, chiuso a chiave: **entra solo ciò che è
  verificato**, cioè anno e campo di battaglia accertati *e* sito che cade senza ambiguità
  dentro quella provincia. L'abbinamento sito → provincia è stato controllato due volte
  (nome della regione storica + riproiezione delle coordinate reali dentro l'SVG con
  `isPointInFill`); le battaglie a cavallo di due province di questa mappa o in regioni che
  la mappa non distingue sono state **scartate** e sono elencate nell'intestazione del file.
  Chi aggiunge una riga usa lo stesso metro: nel dubbio non si aggiunge. Attenzione: la
  chiave è il **nome** della provincia, non l'id SVG (`Northern_Serbia` → "Serbia",
  `Estremadura` → "Portugal").
- **Aspetto della mappa**: `js/map-decor.js` veste l'SVG appena caricato (chiamato da
  `initMap` in `app.js`). Agisce **solo su elementi statici** — il `rect#svg-background`
  (mare) e una copia congelata di `#map-group` che fa da alone costiero — perché
  `app.js` riscrive `fill` su ogni provincia a ogni refresh: qualsiasi effetto messo lì
  verrebbe cancellato. La silhouette dell'alone è clonata e non un `<use>` apposta: un
  `<use>` segue il gruppo vivo e costringe a ripassare il filtro a ogni ricolorazione
  (+80ms per refresh, misurati). Il colore delle terre neutre è `--province-neutral`.
  Gli **ornamenti** (rosa dei venti, cartiglio, velieri, serpente marino, onde, nomi
  latini degli oceani) stanno nel gruppo `#decor-ornaments`, sopra il mare e sotto le
  terre, con `pointer-events: none`. Le loro coordinate sono state scelte su acqua
  libera misurando l'occupazione reale delle province: se la mappa cambia vanno
  rimisurate, non indovinate. Per spegnerli: `#decor-ornaments { display: none; }`.
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
`scripts/shot.ps1` cattura uno screenshot con Chrome headless (profilo usa e getta, nessuna
dipendenza dal pannello di anteprima): è il modo per guardare una pagina a una dimensione
qualsiasi. `-Url ... -Width 1600 -Height 1000` → stampa il path del PNG.
**Il gioco è pensato per desktop**: non serve lavoro responsive, sotto ~800px il layout
sfonda ed è accettato.
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

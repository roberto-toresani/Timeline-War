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
│  ├─ religions.js       RELIGIONI: confessioni, famiglie, blocchi di partenza, scismi — puro
│  ├─ terrain.js         TERRENO chiuso/aperto: l'esponente della battaglia (§9) — puro
│  ├─ sea-routes.js      PORTATA DELLE NAVI: quanto lontano si arriva via mare (§9.2) — puro
│  ├─ bot.js             regni governati dall'IA: 5 strategie + driver dei turni
│  ├─ setup.js           "Nuova partita": sorteggio feudi, Capitali, umano vs bot
│  ├─ start-map.js       MAPPA INIZIALE: salva/ricarica la posizione di partenza
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
│  ├─ start_religions.js  RELIGIONE di partenza: le ECCEZIONI per nome (frontiere di fede)
│  ├─ province_terrain.js TERRENO di tutte e 628 le province: chiuso | aperto
│  ├─ start_map.json     la mappa iniziale salvata (nasce al primo 📌 dell'editor)
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
  `requirePhase`), non solo nella UI: il pannello destro mostra una fase per volta
  ma è il motore a rifiutare un click fuori tempo. In `play.html` le quattro
  **cartelle** (`#bp-phases`) sono l'indice di lettura del pannello: vedi
  "Struttura dei due pannelli" più sotto.
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
- **Struttura dei due pannelli (plancia)** — impianto voluto dall'utente: durante il
  turno non si deve scorrere per trovare le cose.
  - **Destra, tre fasce e solo quella di mezzo scorre.** In alto il **cruscotto**
    (`#bp-status`): oro, soldati (con la guardia della Capitale), **fede di stato**
    e la striscia delle scorte. Non scorre mai — sono i numeri con cui si decide
    ogni mossa. In mezzo le quattro **cartelle delle fasi** (`#bp-phases`, linguette
    cliccabili) e sotto `#bp-body`, che mostra **solo la cartella aperta**. In fondo,
    fisso, il bottone di avanzamento. Quel che si consulta e basta (elenco province,
    territorio/rinforzi, costi) sta in `<details class="bp-fold">` richiudibili.
  - **Aprire una cartella non è agire**: `openFolder` in `player-board.js` decide
    *cosa si vede*, `player.fase` *cosa si può fare*. Se la cartella aperta non è la
    fase in corso si sta **sbirciando**: `freeze()` spegne i comandi di quel blocco e
    `#bp-peek-note` dice perché (col bottone per tornare). `openFolder` si azzera da
    sé quando la fase vera cambia, così un turno nuovo non si apre su una cartella
    vecchia. Chi aggiunge un blocco di fase lo mostra in base a `viewPhase(player)`,
    non a `phase(player)`, e lo aggiunge all'elenco che `render()` congela.
  - **Sinistra, la corona**: Popolarità e (quando torneranno) gli **obiettivi di
    prestigio** prendono tutto lo spazio (`.bp-crown`); regni in gioco e registro
    dell'IA sono cronaca e stanno in fondo in cartelline con un tetto d'altezza
    (`.bp-chronicle`), richiudibili.
  - **I due pannelli si chiudono**: la linguetta (`.board-tab`) sta dentro la cornice
    della mappa, non ai bordi dello schermo, così è sempre allo stesso posto. Chiuso,
    il pannello sparisce **e la sua colonna va a zero** (`left-closed`/`right-closed`
    su `#board-main`): la mappa si prende lo spazio invece di lasciare un buco, e
    subito dopo si richiama `Risiko.setViewInsets(0,0)` per reinquadrare.
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
- **Mappa iniziale (`js/start-map.js` + `data/start_map.json`)**: la POSIZIONE DI
  PARTENZA, dipinta a mano una volta e messa in cassaforte. Tre bottoni nell'editor:
  🧹 svuota la mappa (pagina bianca), 📌 salva quella dipinta adesso, 🗺 la rimette.
  È il punto zero delle prove contro l'IA e della partita vera: stessa mappa, stesse
  condizioni, partite confrontabili. Nel file entrano **solo** proprietari, risorse,
  pedine, strade e l'anagrafica dei regni (id/nome/colore): tesoro, scorte, reclute,
  fase, turno e strategie dei bot restano fuori apposta — è una mappa, non una partita
  salvata. Chi la carica torna a "partita non avviata" al turno 1 e comincia da
  `⚔️ Gioca con l'IA (mappa attuale)`, che è ciò che fissa l'economia del §11.
  Motore: `Risiko.scenario.capture()/apply()` in `app.js` (unico punto che conosce
  `PLAYERS` e le collect/apply dello stato); `start-map.js` fa solo trasporto e UI.
  **Come ci arriva il file**: `scripts/serve.ps1` accetta una `POST /_start-map` e
  scrive lui `src/data/start_map.json` — un click e la mappa nasce già dov'è
  versionata. È l'unica rotta che scrive su disco e scrive sempre e solo quel file
  (il percorso non arriva mai dalla richiesta). Servito da altro (GitHub Pages) la
  POST fallisce e si ripiega sul download del browser: il file va copiato a mano in
  `src/data/`. **Se il server era già acceso quando serve.ps1 è cambiato, va
  riavviato**, altrimenti il salvataggio ripiega sul download.
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
- **Religione (`js/religions.js` + `data/start_religions.js`)**: ogni provincia ha una
  fede (`data-religione`, come `data-resource`: viaggia negli snapshot accanto a
  resources/pieces/roads, seminata a `initMap` se assente). La religione **di stato** di
  un regno è quella della sua **Capitale** (`Risiko.stateReligionOf`) — perdere o
  spostare la Capitale può cambiare fede all'impero. Al Mille i **cristiani** sono un
  popolo solo; **sunniti/sciiti** esistono già. L'assegnazione di partenza è in due
  passi: `RELIGIONS_START` (eccezioni per NOME di provincia, le frontiere fini) e
  `Religions.faithByRegion` (blocchi rettangolari per coordinate SVG, per tutto il
  resto). Tre cose ci poggiano, tutte volute dall'utente:
  - **Obiettivi di prestigio** "conquista N province cristiane/arabe": si ragiona per
    **famiglia** (`Religions.sameFamily`, `Risiko.provincesByFamily`), non per la singola
    confessione (cattolici e ortodossi sono entrambi `cristiani`; sunniti/sciiti/wahhabiti
    `musulmani`).
  - **Terre di nessuno per fede** (`GameActions.neutralRaids`, a giro finito in `endTurn`,
    PRIMA del rifornimento neutrale): una provincia neutrale della TUA stessa fede non ti
    tocca; una di fede diversa razzia il vicino-giocatore più debole **che riesce a
    superare in numero** e, se **vince**, si riprende la provincia — che **torna neutrale**
    coi superstiti (scelta dell'utente). Le costruzioni restano, come in una conquista.
    **Soglia (regola dell'utente)**: la neutrale marcia solo quando ha **almeno 1 soldato
    più** della provincia bersaglio (soldati neutrali > soldati del difensore); se non
    supera nessun confinante di fede diversa, resta ferma.
  - **Scismi su calendario compresso** (`Religions.SCHISMS`, applicati da
    `Risiko.applySchisms` in `endTurn`): a scala storica la Riforma cadrebbe al turno 52 e
    nessuna partita la vedrebbe, quindi i turni sono compressi (Grande Scisma 5, Riforma
    12, Wahhabismo 16, Vecchi Credenti 18). Uno scisma trasforma le province di una fede
    in un'altra dentro certe regioni e **srotola la pergamena** da sé (riusa
    `showFoundation`, tipo `scisma`), così vale sia per il turno umano sia per quelli dei
    bot. La linea cattolico/ortodosso è diagonale: la fascia meridionale contesa (Balcani,
    Grecia, Rus' occidentale) va per **nome**, i rettangoli restano solo dove non ci sono
    cattolici (Anatolia, cuore della Rus'). Chi ritocca i confini di uno scisma **misura i
    centri veri** delle province (come s'è fatto qui), non li indovina.
  - **Vista mappa per fede**: bottone ☩ (plancia `#board-faith`, editor `#faith-view-btn`)
    → `Risiko.setMapPaint('fede')`. È **solo pittura**: non cambia proprietari, turni o
    permessi, e rispetta la nebbia. Chi aggiunge un'azione che sposta la Capitale o
    cambia una fede ricordi che `refreshMapDisplay` ridipinge secondo `mapPaintMode`.
- **Terreno (`js/terrain.js` + `data/province_terrain.js`)**: ogni provincia è `chiuso`
  (monti, gole, foreste, paludi) o `aperto` (pianure, steppe, deserti aperti). Non è un
  bonus difensivo come le mura — quelle sommano difensori virtuali — ma **quanto conta il
  numero**: cambia l'ESPONENTE della formula, `P_A = A^k / (A^k + Deff^k)`, con k=1.4 in
  terreno chiuso, k=2.6 in aperto, k=2 se il modulo non c'è. Decide **la provincia
  attaccata**: si combatte in casa del difensore. Un 3-contro-1 vale 82% in montagna e 95%
  in pianura — è la scelta strategica di DOVE attaccare, non solo con quanti.
  - **È geografia, non stato di partita**: sta in un file di dati e non cambia mai. Non
    entra negli snapshot, non si dipinge nell'editor, non finisce in `start_map.json`.
    Su un `<path>` si legge con `terrainKeyOf` (app.js), memoizzato sull'elemento perché
    la vista-mappa lo chiede a tutte e 628 le province a ogni refresh.
  - **La formula vive in UN posto solo**: `RisikoBattle.winChance(A, Deff, k)`. Il
    pronostico della plancia e quello del bot chiamano quella — prima ognuno riscriveva
    `A²/(A²+D²)` per conto suo, e bastava un ritocco per far mentire la percentuale
    mostrata al giocatore. Chi aggiunge un pronostico passa da lì.
  - **I bersagli portano il terreno con sé**: `GameActions.attackTargets` mette `terreno` e
    `esponente` su ogni bersaglio, così plancia e bot non se lo ricalcolano (e non possono
    sbagliarlo). Il risultato di `attack` porta `terreno` per il rapporto di battaglia.
  - **Vista mappa per terreno**: bottone ⛰ (plancia `#board-terrain`, editor
    `#terrain-view-btn`) → `Risiko.setMapPaint('terreno')`. `mapPaintMode` ora ha tre
    valori (`owner` | `fede` | `terreno`) e i due bottoni sono esclusivi: si
    risincronizzano insieme. È solo pittura e rispetta la nebbia, come la vista per fede.
  - **Chi ritocca l'assegnazione** legge il criterio in testa a `province_terrain.js`: nel
    dubbio vince il tratto che ha DECISO le guerre di quel territorio, non la percentuale
    di rilievo (la Vandea è quasi piatta, ma il bocage l'ha resa inespugnabile).
- **Portata delle navi (`js/sea-routes.js`)**: quanto lontano arriva una nave si misura
  **sull'acqua**, non in linea d'aria — e non è pignoleria: dalla Normandia il Languedoc
  (costa mediterranea, oltre tutta la Francia) è a 16 unità in linea d'aria e le Asturie a
  22, quindi un cerchio geometrico farebbe attaccare Montpellier a una nave nella Manica.
  Portate del §9.2 in `SeaRoutes.RANGE` (Nave 12, Veliero 170): chi ne vuole una nuova la
  aggiunge lì, non sparsa.
  - La griglia (celle da 1,5 unità, come `WCELL` di map-anchors) si costruisce **una volta**
    con due rasterizzazioni dell'SVG su canvas: la prima, tutte le province dello stesso
    colore e **antialiasing acceso**, dice terra o acqua — i bordi condivisi si fondono e non
    nascono fessure fasulle in mezzo a un continente; la seconda, un colore per provincia e
    `shape-rendering: crispEdges`, dice *quale* provincia. Una cella è acqua se **anche un
    solo** sottocampione è acqua: è così che restano aperti gli stretti veri (Gibilterra è
    larga ~1 unità). Suez e Panama restano chiusi — verificato: Barcellona→Yemen misura 560
    (giro dell'Africa), non 230.
  - **Le isole più piccole di una cella** (Canarie, Egeo, Antille) non riempiono mai una cella
    di terra e la griglia le perderebbe: si registrano a parte in `g.tiny`, sulle celle
    d'**acqua** che occupano. Se aggiungi un criterio nuovo alla griglia, ricòrdati di loro.
  - `reachCached` è obbligatorio nei cicli di render: `refreshMapDisplay` gira dopo ogni
    azione e ogni mossa di ogni bot, una portata da veliero costa ~30 ms. La geografia non
    cambia mai, quindi `(provincia, raggio)` è una chiave definitiva.
  - `prepare()` è **asincrona** (~0,5 s). Finché non ha finito le portate sono vuote: `initMap`
    la lancia e ridipinge quando arriva. C'è un ripiego punto-per-punto (lento ma identico)
    se il canvas non risponde, così la portata non dipende mai dal raster.
- **Scafi (§9.2): le navi non si contano, si elencano.** Ogni nave è una pedina a sé col
  suo carico di uomini — quel numero va **mostrato** a chi la vede, quindi non può stare in
  una quantità. Vivono in `data-ships="barca:8,barca:8,vascello:15"` (una voce per scafo, in
  ordine), non in `data-pieces`. Capienze in `SHIP_CAPACITY` (Nave 8, Veliero 15).
  - **Il contagio è fermato a monte**: `piecesOf()` sintetizza le voci-nave leggendo
    `data-ships`, quindi `countPiece(path,'barca')` risponde come sempre e kingdom-stats,
    game-rules e la plancia non sanno che esistono gli scafi. Chi tocca un carico passa da
    `Risiko.engine.ships/addShip/removeShip/setShips`; chi conta e basta non cambia nulla.
    `setPieces` filtra da sé le voci-nave: scriverle lì non fa danno, semplicemente non
    attecchisce.
  - **I salvataggi vecchi si migrano da soli**: `applyPieceState` converte un `barca:2`
    trovato in `data-pieces` in due scafi vuoti. Non serve toccare `start_map.json`.
  - Sulla mappa si disegna **una pedina per scafo** con il carico nel pallino (`badge` in
    `drawPieceRow`, che si mostra sempre, anche a 0 — è diverso dal numero di pedine, che
    compare solo da 2 in su).
- **Sbarchi (§9.2)**: in fase `attacca` il bersaglio può essere di terra o di mare, e
  `GameActions.attackTargets` li restituisce mescolati con `viaMare`, `scafo` e `carico`
  addosso — la plancia non deve ricalcolare niente. `attack()` capisce da sé di che si
  tratta: se le due province non confinano via terra cerca uno scafo che copra la
  distanza, e sceglie il **meno capiente che basti** (non si spreca un Veliero dove
  arriva una Nave). Il carico è un secondo tetto oltre al presidio minimo del §5.
  **Lo sbarco è la nave stessa**: lo scafo lascia la provincia di partenza e approda in
  quella attaccata *comunque vada* — vinta, è ancorato sulla costa presa e la portata
  successiva si misura da lì; persa, è già sulla spiaggia del difensore e diventa suo
  senza codice apposta, perché le navi appartengono a chi possiede la provincia. Non
  esiste modo di annullare uno sbarco a metà, ed è voluto.
- **Nebbia leggera (§9.2)**: `computeVisibleProvinces` non torna più un Set ma
  `{visible, haze}`. `haze` è quel che raggiungono le nostre navi: la provincia si vede
  **col colore del proprietario** ma le sue pedine no — dal mare si riconosce la bandiera,
  non la guarnigione. Chi legge la nebbia usa `Risiko.isVisible` (che è `visible ∪ haze`);
  chi mostra **numeri** di truppe deve controllare anche la classe `haze` sul path.
- **Popolarità e guardia della Capitale**: con ≤5 soldati nella Capitale la Popolarità
  vale 2 (§8), cioè −1 risorsa e −1 recluta ogni turno — abbastanza da azzerare il
  raccolto di un regno piccolo. Portare la guardia a 6+ la riporta a 3. I bot lo sanno
  (`guardiaCapitale` nel profilo): schierano lì per primi, non fanno partire la guardia
  all'attacco e ci riportano truppe con lo spostamento di fine turno.
- **Prestigio sospeso**: `GameRules.PRESTIGE_ENABLED = false` (scelta dell'utente). Non si
  accumula e il blocco sparisce dalla plancia; il §10 e il codice restano. Si riaccende
  cambiando quella sola costante.
- **Guardare l'IA non deve costare niente.** Due regole, tutte e due imparate sul
  campo:
  1. **Nessuno muove la telecamera tranne il giocatore.** `fitToProvinces` non si
     chiama più da solo: né sugli attacchi dell'IA, né su quelli del giocatore, né
     sulla fondazione di una città. Resta solo sul bottone ↺ del rapporto di
     battaglia (lì l'inquadratura la chiede l'utente) e sul primo ingresso nel
     proprio regno. La **scena** della battaglia (`playBattleFx`) invece si vede
     sempre, anche quando attacca l'IA: disegna dove le province già stanno e non
     sposta niente. Quello che l'IA fa si legge nel **registro** (`#bp-ailog`,
     `aiLog` in `player-board.js`).
  3. **Il racconto rispetta la nebbia.** Registro e scena della battaglia mostrano
     solo azioni che toccano una provincia **visibile**: sotto nebbia il giocatore
     non deve sapere che un regno dall'altra parte del mondo ha schierato truppe o
     conquistato qualcosa. La verità sta in `Risiko.isVisible(provId)` /
     `Risiko.visibleProvinces()` (null = nessuna nebbia → editor o vista generale
     🌍), aggiornata da `refreshMapDisplay`. Perché funzioni, **ogni azione dice
     dove è successa**: i risultati di `game-actions.js` portano `prov` (o `provs`,
     o `fromId`/`toId`). Chi aggiunge un'azione nuova ci metta la provincia, o
     quell'azione diventerà invisibile — o peggio, una spia.
  2. **`refreshMapDisplay` gira dopo OGNI azione**, quindi anche dopo ogni mossa
     di ogni bot: deve restare sui ~20 ms. Costava **1 secondo** perché dentro il
     ciclo sulle province faceva due `querySelectorAll` sull'intero SVG per
     trovarne i marker (1256 query a refresh). Ora l'indice dei marker si costruisce
     in una passata (`markerIndex`) e il ciclo tocca solo `provincePaths()`. Chi
     aggiunge roba lì dentro non ci metta selettori: si passa dall'indice.
- **Zoom e pan devono restare fluidi** (`wireMapZoom` in `app.js`). Cambiare `viewBox`
  obbliga il browser a ridisegnare la mappa a una risoluzione nuova: tutto ciò che è
  un **filtro SVG** viene rifatto da capo a ogni tacca di rotella, e ne servono ~29
  per attraversare l'escursione di zoom. Da qui tre regole:
  1. Durante una gesture il `viewBox` si riscrive **una volta per frame** (`applySoon`,
     coalescing su `requestAnimationFrame`), non una per evento. Chi inquadra a
     comando (fit, reset, insets) usa invece `apply()`, che è sincrono.
  2. Mentre la mano si muove l'SVG porta la classe `.map-interacting` e l'alone
     costiero sparisce (regola in `style.css`); torna 140 ms dopo l'ultimo movimento.
     Sono 628 path clonati dentro due sfocature: è il pezzo più caro della scena.
  3. **Niente filtri SVG su superfici grandi.** Se serve un effetto steso su tutto il
     fondale si cuoce in un bitmap una volta sola e si ripete con un `<pattern>`
     (vedi la grana in `map-decor.js`), non lo si lascia ricalcolare al browser.
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
  `Risiko.engine.allPaths()`, mai il selettore crudo. Il seed iniziale in `initMap`
  usava ancora il selettore crudo e ridipingeva di sabbia i 628 path dell'alone: si
  vedeva solo togliendo la feColorMatrix del filtro. Se aggiungi un ciclo sulle
  province e l'alone cambia colore, hai trovato lo stesso errore.
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
  La **feColorMatrix** in testa al filtro `#decor-coast` non è ornamentale: la copia
  congelata conserva `class="state"`, quindi un selettore crudo altrove le riscrive
  addosso il fill delle province. Finché è il filtro a imporre la tinta, l'alone resta
  blu qualunque cosa gli finisca dentro — toglierla lo fa diventare color sabbia.
  La **grana della carta** NON è più un `feTurbulence`: un filtro si ricalcola a ogni
  cambio di scala, cioè a ogni scatto di rotella, e steso su tutto il fondale era la
  voce più cara dello zoom. Ora `bakeGrain()` cuoce una volta sola una piastrella
  256×256 di rumore frattale (ciclica sui bordi, ottava più fitta a piena ampiezza come
  in feTurbulence) e la ripete con un `<pattern>`: zoomare costa quanto scalare
  un'immagine. Il filtro resta nei `defs` solo come ripiego se il canvas non risponde.
  Gli **ornamenti** (rosa dei venti, cartiglio, velieri, serpente marino, onde, nomi
  latini di oceani e mari) stanno nel gruppo `#decor-ornaments`, sopra il mare e sotto le
  terre, con `pointer-events: none`. Le loro coordinate sono state scelte su acqua
  libera misurando l'occupazione reale delle province: se la mappa cambia vanno
  rimisurate, non indovinate. Per spegnerli: `#decor-ornaments { display: none; }`.
  I **nomi delle acque** sono la tabella `WATERS` in `map-decor.js` (testo, centro,
  corpo, spaziatura, rotazione, classe): stesso font delle province ('Cinzel', ereditato
  dal gruppo), oceani su due righe in tondo, mari più piccoli in corsivo. Stando sotto le
  terre, un nome che sborda viene coperto dalla costa invece di galleggiarci sopra — ma
  la posizione va comunque **misurata**: si campiona la mappa a griglia con
  `isPointInFill` (terra/acqua) e si controlla che il riquadro del testo cada in acqua.
  È così che sono stati piazzati tutti (≤3% di terra sotto il testo, e solo isolotti).
  Mar Rosso, Golfo Persico, Caspio, Mare del Nord e Baltico **non hanno nome apposta**:
  su questa mappa sono corridoi da 8-15 unità e un nome che ci stia dentro non si legge.
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
**L'AI ha il permesso permanente di aprire e usare il gioco nel browser** (avviare il server,
navigare, cliccare, leggere console/rete, fare screenshot): non deve chiederlo ogni volta —
vedi `rules and behaviours.md` §4.
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

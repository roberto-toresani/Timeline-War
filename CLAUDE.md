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
│  ├─ popularity.js      POPOLARITÀ (§8): la formula E il suo rovescio (il piano) — puro
│  ├─ spies.js           SPIE (§9.3): costo, durata, raggio in province, cosa vedono — puro
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
├─ mappe/                CASSAFORTE: la mappa definitiva congelata + il suo visualizzatore
│  ├─ mappa-definitiva.js   copia congelata di data/start_map.json (non si aggiorna da sola)
│  └─ mappa-definitiva.html pagina di sola lettura: zoom, regni isolabili, risorse
├─ _diag-anchors.html    pagina di lavoro: disegna gli ancoraggi di tutte le province
├─ _diag-roads.html      pagina di lavoro: confronta i disegni possibili di una strada
├─ _dev-start.html       pagina di lavoro: avvia una partita e dà al regno umano l'invito "dev"
├─ _dev-drive.js         pagina di lavoro: porta la partita a una fase e apre il cursore d'ordine
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
  spostamento finale, costi in soldati delle costruzioni (Mercato 4, Nave 3,
  Strada 1 — la Capitale non costa soldati) e persino il ritiro di una recluta appena schierata. Anche la conquista la
  rispetta dall'altra parte: almeno 1 superstite resta nella provincia presa. Se aggiungi
  un'azione che sottrae soldati, passa da `spare(path)` in `game-actions.js` e da `spareOf(path)`
  in `player-board.js`, così il massimo mostrato e quello accettato non divergono.
- **Capitale: si costruisce, si sposta, si conquista (regola dell'utente)**. I regni
  **non partono** con una Capitale (setup non ne regala più): la prima si costruisce al
  turno 1 per **500 monete e 0 uomini** (`GameRules.COSTS.capitale = { monete: 500 }`),
  scegliendo la provincia. Con le 1000 monete d'avvio è alla portata di tutti (i bot hanno
  `capitale` in testa a `build:[...]` e la costruiscono da soli se manca). La strada
  gratuita nasce **dalla costruzione** della Capitale, non più dall'avvio (setup non setta
  più `stradeGratis`). Costruita una Capitale, la voce **sparisce** dalle costruzioni
  (`buildGroup` la salta) e al suo posto compare `GameActions.moveCapital` — **spostare** il
  seggio su una provincia propria per altre **500 monete**, con la vecchia sede che diventa
  **Città**. Conquistando una **Capitale nemica**: se non ne hai una è adozione automatica;
  se ne hai già una la presa è declassata a Città di default (così `getCapitalPathFor` ne
  trova sempre **una sola**) e `player.capitalePresa` offre all'umano la **promozione**
  opzionale (`GameActions.resolveCapital`, la vecchia → Città). I bot non promuovono
  (`capitalePresa` non si imposta per `winner.bot`). Il trasloco fisico del seggio vive in
  **un posto solo**, `seatCapital` in `game-actions.js`, chiamato sia da `moveCapital` sia
  da `resolveCapital`; la regola di conquista sta dentro `applyBattleOutcome`.
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
  - `costruisci`: edifici, navi, strade, reclutamenti (Mercenario, Guarnigione).
  - `attacca`: quanti attacchi si vuole. Si comanda **dalla mappa** (vedi
    "Comandare dalla mappa"): `Risiko.showAttackArrows(fromId, ids, kind)` disegna
    frecce animate verso i bersagli, nel gruppo `#attack-arrows` appeso in coda
    all'SVG (non fra le pedine: `renderPiecesForPath` le cancellerebbe).
  - **conquista**: vinta una battaglia con più di 1 superstite, `player.conquista` resta
    aperta e blocca ogni altra azione finché `resolveConquest(player, occupanti)` non
    decide quanti restano nella provincia presa e quanti rientrano in quella di partenza
    (almeno 1 deve occupare). A fine turno si chiude d'ufficio lasciandoli tutti lì.
  - `sposta`: **un solo** spostamento per turno (`player.spostamentoFatto`), fra due
    province proprie **confinanti** (regola dell'utente: un solo confine di terra, non
    più una catena — `GameActions.ownAdjacent`), lasciando almeno 1 soldato alla
    partenza. **In più, il rinforzo via nave** (regola dell'utente, il caso tipico è
    dopo uno sbarco): se la partenza ha una nave ancorata, lo spostamento del turno può
    andare **via mare** verso una **propria** costa entro la portata dello scafo (§9.2).
    È un rinforzo, non un attacco — la meta dev'essere già tua — e il carico è un tetto
    oltre al presidio (`moveTargets` restituisce `viaMare`/`scafo`/`carico` come
    `attackTargets`; `finalMove` rileva il mare da `areLandAdjacent`, sceglie lo scafo
    con `hullForLanding`, e la nave **viaggia con gli uomini** e resta ancorata
    all'arrivo, come nello sbarco). Consuma comunque l'unico spostamento del turno.
    **Due clic: la partenza e l'arrivo** (regola dell'utente). La partenza NON è più
    la provincia selezionata — entrando nella fase quella è dove si è chiuso
    l'attacco, e siccome ogni provincia propria collegata è anche una meta,
    cliccarne un'altra apriva un ordine invece di cambiare partenza: per liberarsi
    bisognava passare da una provincia altrui. Ora va **armata apposta**
    (`moveArmed` in `player-board.js`, letto solo da `moveOriginPath`): finché non
    lo è, sulla mappa si accendono le province **da cui** si può muovere
    (`GameActions.moveOrigins`, classe `order-start`) e non sono ordini —
    non entrano in `orderTargets`, quindi il clic è una normale selezione che le
    arma. Ricliccare la partenza la libera (c'è anche il bottone "↩ Cambia
    partenza" nel pannello, perché la scorciatoia sulla mappa nessuno la indovina).
    `moveArmed` si azzera da sé quando cambia la fase vera (dentro `viewPhase`,
    accanto a `openFolder`) e all'ingresso in un regno.
- **Comandare dalla mappa (regola dell'utente)**: attacco e spostamento **non si
  scelgono da un elenco**, si fanno sulla mappa. Selezionata una provincia propria,
  le province dove si può andare si **accendono** e cliccandone una si apre lì sopra
  il **cursore d'ordine** (`#map-order-hud`): quanti uomini, che probabilità, e via.
  - **Il segno è un RETINO, non un contorno** (scelta dell'utente): i bersagli
    d'attacco e le mete di spostamento si segnano con righe diagonali nel colore
    della fase (arancio/oro) **ritagliate dentro** il poligono — una zona segnata
    come su una carta militare. Il vecchio contorno spesso (1,5 su bordi da 0,25)
    fra due bersagli confinanti si saldava in una banda doppia che non era di
    nessuno dei due: confusionario. Il retino sta **dentro** e non sconfina.
  - Chi accende cosa: `Risiko.markTargets(fromId, ids, kind)` dipinge sullo strato
    **`#order-marks`** (un `<g>` sopra `#map-group` e sotto i marker appesi in coda,
    così pedine e risorse restano davanti); `Risiko.clearTargets()` svuota lo strato.
    `kind` vale `attacca` | `sposta` | `spia` | `partenza`:
    - `attacca`/`sposta`: **retino** sui bersagli (pattern `#order-hatch-*` +
      un filo di bordo interno) e un filo d'oro sull'**origine** (`fromId`).
    - `spia` e `partenza` **non** prendono il retino (sono decine di province): un
      **tratto** leggero — spie tratteggiate viola (classe CSS `order-spy`),
      partenze un filo verde sullo strato. `fromId` è null per entrambe.
    Il clic resta della plancia: lo strato è `pointer-events:none`, quindi passa al
    path della provincia sotto; la classe `order-clickable` serve solo al cursore.
  - **I clipPath e i pattern si creano UNA volta** (`orderClip`/`orderHatch`, per id
    di provincia e per fase) e si riusano: la geometria non cambia mai e markTargets
    gira a ogni render, anche dopo ogni mossa dei bot (~20 ms di budget in
    `refreshMapDisplay`). Il pattern è `userSpaceOnUse`, quindi le righe scalano da
    sé con lo zoom. **Mai dipingere il fill dei path delle province** qui:
    `refreshMapDisplay` lo riscrive inline a ogni render — per questo il retino vive
    su uno strato a parte.
  - **`!important` sui tratti CSS residui** (`board.css`, `order-spy`): metà dei path
    dell'SVG si porta dietro dalla sorgente uno `style="stroke: rgb(0,0,0)"` in linea,
    e senza `!important` vince lui.
  - Il clic sulla mappa è una **selezione** o un **ordine**, e a deciderlo è
    `orderTargets` (player-board.js), l'indice id→bersaglio dell'ultimo render: se
    la provincia è accesa il clic apre il cursore, altrimenti sposta la selezione.
    Così la selezione non si perde a metà di un attacco. Le province accese come
    **partenza** dello spostamento sono l'eccezione voluta: sono dipinte ma **non**
    stanno in `orderTargets`, perché lì il clic deve scegliere, non ordinare.
  - Il cursore si costruisce **una volta** all'apertura e poi si aggiorna
    (`buildOrderHud` / `syncOrderHud`): ricostruirlo a ogni render lo azzererebbe
    mentre lo si trascina. Insegue la provincia con `requestAnimationFrame` e resta
    **dentro la cornice** della mappa (`placeOrderHud` fa clamp su `#map-wrapper`).
  - **La conferma è una sola**: `askAttack()` la scrive per il cursore e per
    l'elenco. Chi arriva da strade diverse deve leggere le stesse parole.
  - **L'elenco resta**, ma in una cartellina chiusa ("Tutti i bersagli"): serve agli
    **sbarchi** — un Veliero tocca coste dall'altra parte del mondo e sulla mappa non
    le trovi — e si apre da sé quando i bersagli superano `ORDER_MAX_MARKS` (24),
    cioè quando accenderli tutti farebbe luce ovunque e non direbbe più niente.
- **Struttura dei due pannelli (plancia)** — impianto voluto dall'utente: durante il
  turno non si deve scorrere per trovare le cose, e **si deve leggere poco**.
  - **Destra, quattro fasce e solo la terza scorre.** In alto il **cruscotto**
    (`#bp-status`): una riga sola con oro, soldati (e la guardia della Capitale),
    **fede di stato**, più la striscia delle scorte. Non scorre mai — sono i numeri
    con cui si decide ogni mossa. Poi le quattro **cartelle delle fasi**
    (`#bp-phases`, linguette cliccabili) con **una riga** di spiegazione
    (`#bp-phase-sub`: il nome della fase è già grande sulla linguetta accesa). Poi
    `#bp-body`, che mostra **solo la cartella aperta**. In fondo, fisso, il bottone
    di avanzamento.
  - **La provincia selezionata sta in due righe** (`.bsel-head` + `.bsel-meta`):
    nome, truppe, e quattro tessere colorate — chi la governa, risorsa, fede,
    terreno. Erano cinque paragrafi "Chiave: valore" alti 170px.
    Attenzione: le tessere hanno id **propri** (`bsel-*`). Gli id `p-owner` /
    `p-resource` / `p-name` / `province-name` restano nascosti in fondo al pannello
    perché **app.js ci scrive a ogni clic su una provincia** senza controllare che
    esistano — e quel clic può essere un ordine su un bersaglio, non una selezione:
    la riga finirebbe per raccontare la provincia sbagliata.
  - **Quel che si consulta e basta sta in `#bp-consult`**, in coda al corpo: elenco
    province, territorio/rinforzi, costi. Tutte `<details class="bp-fold">`
    **chiuse**. Non sono azioni: andarsele a cercare è un gesto apposta.
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
- **`src/mappe/` è un'altra cosa**: lì sta la copia **congelata** della mappa definitiva
  (`mappa-definitiva.js`) con la sua pagina di sola lettura
  (`mappa-definitiva.html`: zoom/pan propri, regni isolabili dalla legenda, risorse,
  tooltip con provincia/regno/risorsa/città). `data/start_map.json` è **viva** e il 📌 la
  riscrive a ogni salvataggio; la copia in `mappe/` cambia solo quando lo si decide, ed è
  il punto zero a cui tornare. Il gioco non carica niente da quella cartella — la pagina
  riusa i moduli esistenti (`embedded_map`, `map-anchors`, `map-decor`, icone) e non
  duplica dati. La copia è un `.js` (`window.MAPPA_DEFINITIVA`) e non un `.json` apposta:
  così la pagina si apre anche col doppio clic, dove un `fetch` da `file://` sarebbe
  bloccato. Come rigenerarla: `src/mappe/README.md`.
- **Partita contro l'IA — due avvii diversi.** Quello NORMALE (`⚔️ Gioca con l'IA`,
  `GameSetup.newGame()`) **tiene la mappa dipinta nell'editor**: i regni sono quelli
  che ci sono, con i loro confini; chi non ha una Capitale la riceve nella sua
  provincia più interna, l'economia torna ai valori del §11 e il calendario al turno 1.
  Il sorteggio (`🎲 Sorteggia una mappa nuova`, `newGame({mantieniMappa:false})`)
  **cancella** province, pedine e strade: è l'eccezione, e il dialogo lo dice.
- **Partita in solitaria — tutti i regni tuoi** (`👥 Gioca tu tutti i regni`,
  `newGame({tuttiUmani:true})`): stessa mappa e stessa economia della partita normale,
  ma **nessuna strategia assegnata** (`player.bot = null` per tutti). Serve a PROVARE le
  regole di apertura: se chi le conosce sblocca tutti e dieci i regni dalla trappola del
  turno 1 (§8), la trappola è dura ma non cieca. Non è una modalità a parte — è la stessa
  plancia e lo stesso motore:
  - **La plancia segue il turno da sé** (`followTurn` in `player-board.js`, chiamata in
    testa a `render()`): chiuso un turno si entra nel regno successivo passando da
    `enterKingdom`, come un giocatore qualunque. Quindi la **nebbia resta quella del regno
    in cui si entra** — giocare dieci regni non vuol dire vedere tutta la mappa in una
    volta (per quello c'è il 🌍).
  - **Si riconosce dallo stato, non da un flag**: `soloGame()` guarda se esiste ancora un
    regno con una strategia. Un flag salvato a parte potrebbe divergere dal `player.bot`
    che decide chi muove davvero.
  - **Un cambio regno a mano non viene rimbalzato indietro**: `enterKingdom` segna in
    `lastFollowed` il turno per cui si è entrati, e `followTurn` riprende a seguire solo
    quando il turno cambia. Senza, andare a sbirciare un altro regno a metà turno
    riporterebbe subito alla plancia di prima.
  - **La plancia si apre senza codice d'invito** (`play.html` liscio): non c'è un regno
    "tuo", e un link `?p=` incollerebbe la pagina a quel regno anche dopo un
    ricaricamento (`resolvePlayer`). Senza codice, `boot` entra nel regno di turno.
- **Sorteggio della mappa (solo `mantieniMappa:false`)**: `js/setup.js` —
  sparecchia la mappa, dà a ogni regno 3 province ben distanziate (≥6 confini) — i regni
  nascono tutti in **Europa, Nord Africa e Arabia**
  (`GameSetup.REGIONS.europa`: rettangoli sulle coordinate dell'SVG, misurati sulla mappa
  vera per lasciare fuori Persia, Sudan e Sahel; le province che scavalcano il bordo
  mappa, tipo Alaska, hanno un bounding box largo quanto il mondo e si scartano dalla
  larghezza). La Capitale **non** è più regalata: la si costruisce al turno 1 (500 monete,
  0 uomini), e con essa arriva la prima strada gratuita. Il feudo iniziale confina con una
  provincia di **pietra** (la prima strada la collega e dà la materia prima per le
  successive). Poi estrae a sorte il
  regno **umano** e assegna a tutti gli altri una strategia di `js/bot.js`.
  I bot **non hanno scorciatoie**: chiamano le stesse funzioni di `game-actions.js` del
  giocatore, quindi qualsiasi regola nuova vale anche per loro. Il turno di un bot è un
  **generatore**: ogni `yield` è un'azione già applicata e il driver aspetta `Bot.speed()`
  ms — serve a poterli guardare, non è una pausa di comodo. La catena parte da
  `Bot.run()` (dopo il fine turno umano e all'apertura della pagina) e si ferma da sola
  quando torna il turno di un umano. **Solo chi è admin** muove i bot (`Risiko.isAdmin()`):
  le scritture di stato restano dell'admin, come da `firestore.rules`.
  Una strategia in più = una voce in `Bot.STRATEGIES`, non un ramo `if` sparso.
- **Quello che un bot deve saper fare per non incepparsi** (tutte regole dell'utente,
  nate guardandoli giocare). Un bot che non sa queste cose non gioca male: **si blocca**,
  perché a Popolarità 1 non ha più né reclute né risorse con cui rimediare.
  0. **Dove piantare la Capitale** (`capitalScore`, usata da `siteFor`). Non è una
     costruzione come le altre: decide due terzi della Popolarità. La Sicurezza si
     misura sui **suoi** confini (`P_conf = 5 − e`) e il Benessere sulla rete di strade
     che parte da **lei** (§4), quindi una Capitale in un angolo lascia mezzo regno
     scollegato per sempre. Il punteggio somma la **protezione** che avrebbe (vale
     doppio — è l'unica cosa che non si può comprare — con una penalità a sé quando
     `P_conf` sarebbe **zero**, perché lì la Sicurezza resta dimezzata per sempre), le
     **risorse raggiungibili attraverso il proprio territorio** scontate per distanza
     (ogni passo è una strada da costruire; un tipo nuovo e il cibo pesano di più) e in
     coda gli uomini già presenti meno la pressione nemica. Prima si sceglieva la
     provincia **con più soldati**, che è quasi sempre quella di frontiera.
     Il seggio si **trasloca** anche (`capitalPlan` → `GameActions.moveCapital`, 500
     monete): un regno cresce da una parte sola e la vecchia sede si ritrova sul
     confine. La soglia è alta apposta (+3 punti pieni) — traslocare per mezzo punto è
     il modo migliore di non costruire mai nient'altro.
  1. **La Popolarità prima di tutto.** `popState` in `bot.js` misura i fattori veri
     (`Risiko.popularityFactors`) e chiede il piano a `Popularity.plan`. Da lì escono
     tre decisioni: **quanto tassare** (si abbassa quando il popolo mugugna e **risale
     da sé** appena Sicurezza e Benessere se lo possono permettere — il piano sceglie
     sempre il livello più redditizio che regge il target), **quanti soldati in
     Capitale** (`guardWanted`, che ha sostituito il numero fisso `guardiaCapitale`), e
     **quanto vale una conquista** (`popValueOf`).
  2. **Conquistare attorno alla Capitale, ma solo se serve davvero.** `popValueOf` pesa
     ogni bersaglio sulla formula vera e spesso risponde **zero**: con 7 nemiche al
     confine, `P_conf = 5 − e` resta 0 anche dopo due conquiste. Un bot che desse per
     scontato il guadagno sprecherebbe due turni di guerra per niente.
  3. **Annettere cibo e tipi di risorsa nuovi.** Valgono due delle quattro voci del
     Benessere, cioè un terzo della Popolarità. Conta sia negli attacchi (`popValueOf`)
     sia nella scelta di **quale strada** costruire (`roadWorth`): prima si ordinava per
     "ha una risorsa" e un doppione di legno valeva quanto il primo campo di grano.
     Il bonus si dà solo alle province **collegabili** — una risorsa scollegata non entra
     né nel Benessere né nel raccolto (§4), e prometterselo sarebbe barare col proprio
     pronostico.
  4. **I mercenari restano, ma annacquano l'esercito**: si comprano **solo** per chiudere
     un attacco che senza di loro non si farebbe (`mercenaryPlan`), mai per averne.
     Comprarne finché ci sono monete — come facevano — voleva dire bruciare 400-500 monete
     a turno con 100 di entrate e non arrivare mai né al Mercato (800) né alla Città
     (1000); ora vorrebbe dire anche tenersi per sempre un esercito di ventura. C'è la
     **riserva** (`coinReserve`): le monete della prossima costruzione in programma non si
     toccano. E il conto lo fa `winProbMerc` con la quota che la provincia **avrebbe dopo**
     l'acquisto — pronosticare coi mercenari contati come sudditi vorrebbe dire comprare
     per una soglia che poi non si raggiunge.
  5. **Il Mercato è il modo di non restare bloccati.** Senza pietra niente strade, senza
     strade niente province collegate, e senza collegamenti Benessere e raccolto restano
     a zero. `wantsBuild` lo fa costruire quando manca più di un tipo di risorsa e c'è
     già merce in magazzino da dare in cambio (comprarlo al turno 1 con le scorte a zero
     è buttare 800 monete). Da lì partono due canali, e i bot li usano tutti e due:
     - **L'ESTERO** (`bankPlan`, 2:1): il canale sicuro, perché la banca non rifiuta.
       Cosa comprare lo dice `resourceNeed`, non la scorta più bassa — avere zero Legno
       non è un problema se il Legno non serve a niente di quel che si vuole costruire,
       mentre l'Argilla a 1 blocca una Città da mille monete.
     - **GLI ALTRI REGNI** (`tradePlan`, fino a `TRADE_MAX_PENDING` carovane a turno):
       si compra da **chi ce l'ha davvero** (il magazzino altrui si legge, non si tira a
       sorte fra tre magazzini vuoti), pagando con le eccedenze o, se non ce ne sono,
       in **oro** a prezzo di mercato più un sovrapprezzo — chi vende deve guadagnarci,
       se no rifiuta. E si **vende** l'eccedenza quando le casse sono vuote. Non si manda
       una seconda carovana a chi non ha ancora risposto alla prima: la merce offerta è
       un pegno che parte subito, e un regno umano può lasciarla lì per sempre.
     - **Il prezzo dipende dal bisogno** (`resourceNeed` → `goodValue`), in tutte e due
       le direzioni: ricevere l'unica Argilla che manca vale molto, darla via costa
       altrettanto. Con un prezzo unico per tutto, un mercato non serve a niente.
  6. **La riserva di monete guarda alla prossima costruzione RAGGIUNGIBILE**
     (`coinReserve`): quella di cui si hanno già le risorse. Tenere da parte 2000 monete
     per una Fortezza che non si potrà costruire per venti turni significa non spendere
     mai niente.
- **Istinto di sopravvivenza: difendere prima di espandere** (regola dell'utente).
  Un bot con un invasore alle porte deve mettere al sicuro Capitale e confini PRIMA di
  andare a conquistare altrove — e allo stesso tempo non deve ammassare uomini inutili
  in Capitale a marcire. Due leve in `bot.js`, entrambe nate guardandoli perdere:
  - **`defenseFloor` è il fratello di `raidFloor`**: dove `raidFloor` chiude la porta
    alle terre di nessuno, questo la chiude a un VICINO-regno in armi. `enemyThreat`
    misura l'esercito nemico più forte al confine (il massimo degli spendibili §5 dei
    vicini di un altro regno; le neutrali le conta già `raidFloor`), e `defenseFloor` ne
    tiene circa i tre quarti (`DEFEND_RATIO = 0.7`) con un tetto (`DEFENSE_CAP = 12`) —
    perché un pavimento troppo alto è l'altro modo di perdere: tutti a presidiare,
    nessuno a conquistare. `holdFloor(player, id, salvo)` è il **max** dei due, ed è
    l'unico numero che `survey` (→ `presidio`/`mobili`/`scoperta`), gli attacchi e gli
    spostamenti usano come "quanti restano comunque qui". Da lì, gratis: le reclute vanno
    prima a tappare i confini minacciati, e attacchi/spostamenti non li lasciano scoperti.
    Il `salvo` è lo stesso di `raidFloor` — il nemico che si sta per attaccare da qui non
    si conta, se no il regno non contrattaccherebbe mai.
  - **La guardia della Capitale respira** (`capitalGuard`): in pace resta al livello che
    ottimizza la Popolarità (`guardWanted`, cioè il piano §8) e gli uomini in più escono
    a conquistare invece di marcire; con l'invasore al confine sale a `holdFloor` della
    Capitale. La usano `deployPlan` (la riempie per prima), `bestAttack` (non ne fa mai
    partire la guardia) e `movePlan` (l'ultimo spostamento del turno rinforza un seggio
    sotto assedio). È la traduzione diretta di "prima difendere, poi non sprecare".
- **La vendetta dell'IA (`rancore`, regola dell'utente)**: un regno non dimentica chi gli
  ha strappato una provincia che CONTAVA. Il torto si registra nell'**unico** punto di
  conquista — `applyBattleOutcome` in `game-actions.js` (`recordGrudge`) — sul record del
  regno derubato, e **solo per province preziose**: `grudgeWorth` dà peso 3 a una
  Capitale, 2 a Città/Fortezza, 1 a una risorsa, **0 a una provincia spoglia** (che quindi
  non entra nel rancore — la vendetta è per il prezioso o lo strategico). Vive in
  `player.rancore` come `[{prov, chi, peso, turno}]`, persiste nei salvataggi
  (`normalizePlayer` lo inizializza) come le spie: serve ai bot, un umano lo ignora.
  - Si legge la provincia com'era del difensore, PRIMA di cambiarle padrone e costruzioni
    (una Capitale è ancora Capitale, non già declassata a Città).
  - `clearGrudge` lo spegne quando la provincia torna al derubato: riprendersela salda il
    torto. Un solo rancore per provincia (si aggiorna, non si accumula), tetto `GRUDGE_MAX`.
  - Il bot lo legge con `grudgeAgainst` (`bot.js`): premio d'attacco maggiorato
    (`× peso × 1.5` in `bestAttack`) per riprendersi ciò che gli è stato tolto, e in
    schieramento "punta" la lancia si ammassa sul confine adiacente al torto — così la
    vendetta si vede sulla mappa, non resta un numero. Il rancore **tace** se chi l'ha
    preso non la tiene più (l'ha persa a sua volta): la vendetta ha smarrito il colpevole.
- **Terre di nessuno presidiate** (regola dell'utente): ogni provincia neutrale ha
  `GameRules.neutralGarrison(turno)` soldati — 2 nei turni 1-10, 3 nei 11-20, e così via
  (`NEUTRAL_EVERY = 10`). `GameActions.garrisonNeutrals()` è l'unico posto che li mette:
  gira all'avvio partita e alla fine di ogni giro completo, e **alza soltanto** (una
  provincia conquistata non è più neutrale e esce da sola dal conteggio; una che ha
  respinto un attacco torna a quota al giro dopo). La crescita è **lenta apposta**: le
  neutrali sono un attrito, non un avversario in più — a +1 ogni 5 turni diventavano
  imprendibili a metà partita.
- **Le neutrali razziano solo a 3 contro 1** (regola dell'utente, §5.4 del design):
  `GameRules.neutralCanRaid(soldatiNeutrali, difensori)` è l'unica fonte —
  `spendableTroops(neutrali) ≥ 3 × difensori`, cioè col presidio minimo del §5 servono
  **4 neutrali contro 1 solo difensore**. Prima bastava 1 uomo in più e le razzie erano
  continue. Il rovescio è `GameRules.neutralSafeGarrison(soldatiNeutrali)`: quanti uomini
  chiudono quel confine.
  - **I bot lo sanno e si presidiano PRIMA** (`raidFloor` in `bot.js`): per ogni provincia
    calcola il pavimento imposto dalle neutrali confinanti **di fede diversa** (stessa fede
    = confine tranquillo, non si presidia). `survey` lo porta addosso come `presidio`,
    `mobili` (quanti possono davvero uscire) e `scoperta` (quanti mancano). Da lì tre cose:
    `deployPlan` tappa le province scoperte **subito dopo la guardia della Capitale**
    (costa 1-2 uomini e vale una provincia intera), `bestAttack` e `movePlan` non scendono
    mai sotto il pavimento, e lo spostamento di fine turno — l'ultima azione prima che le
    razzie si risolvano — chiude la porta lasciata aperta da un attacco appena vinto.
  - **`raidFloor(id, salvo)` salta il bersaglio che si sta per attaccare**: se la minaccia
    è proprio la neutrale che si vuole prendere, tenersi in casa gli uomini per difendersene
    vorrebbe dire non prenderla mai. Per questo in `bestAttack` il pavimento si ricalcola
    **per bersaglio**, non una volta per provincia.
- **Editto (`GameActions.decree`, pannello 📜 nell'editor)**: l'admin non gioca, **crea
  situazioni**. Un editto sposta truppe fra due province qualsiasi, assegna una provincia,
  versa o toglie oro e scorte — cose che nessuna regola concede a un giocatore — e passa
  comunque da `game-actions.js`, perché quello resta l'unico punto che muta lo stato. Da lì
  due cose vengono gratis: il risultato porta `prov`/`provs`, quindi entra nel registro
  rispettando la nebbia come ogni altra azione, e il regno colpito riceve un **avviso**.
  - **Nato per le crociate**: con le portate del §9.2 nessun regno cristiano raggiunge la
    Terra Santa (serve un Veliero da 4000 monete, più dell'incasso di un ciclo intero). Il
    giocatore **raduna** l'esercito, l'admin lo **trasporta** per conto del Papa.
  - **L'avviso si srotola nel turno del giocatore, non subito**: gli editti vivono in
    `player.editti` (persistono nel salvataggio, `normalizePlayer` li inizializza) e
    `showPendingEditti` in `player-board.js` li mostra in coda a `render()` **solo se è il
    suo turno**, con la pergamena di `showFoundation` (tipo `editto`). Visti, si segnano
    `letto` e si salva: uno si legge una volta sola, ma finché non l'ha visto resta in coda
    anche dopo un ricaricamento. Più editti in attesa si leggono in una pergamena sola.
    Il punto è questo: **la mappa non cambia mai di nascosto**.
  - **Lo sbarco è una BATTAGLIA, non un regalo** (regola dell'utente): le truppe mandate in
    crociata — Terra Santa, crociate teutoniche, qualunque spedizione — devono **conquistare**
    la provincia dove scendono. L'editto "truppe" ha due modi: `sbarco` (predefinito) risolve
    la battaglia vera, col **terreno del difensore** e il bonus delle sue costruzioni (§9),
    solo senza i vincoli di adiacenza e di carico, perché il trasporto lo fa il Papa; vinta,
    la provincia è del regno e **dal turno dopo la gestisce lui**; persa, quegli uomini non
    tornano. `consegna` è l'altro modo: le truppe si posano e basta (rinforzo su provincia
    propria, o provincia in regalo). L'esito si aggiunge **da sé** al testo dell'editto: il
    giocatore lo legge nella pergamena, perché è la parte che non può dedurre.
  - **La regola di conquista vive in un posto solo**: `applyBattleOutcome` — il difensore
    perde le truppe, le costruzioni restano e cambiano soltanto colore. La chiamano sia
    `attack` sia lo sbarco dell'editto, così non possono divergere. Non decide la
    ripartizione dei superstiti (`player.conquista`): quella è solo dell'attacco via terra,
    perché **lo sbarco è totale** (§9.2) — chi scende resta a terra.
  - **Anche un editto rispetta il presidio minimo (§5)**: prelevando uomini da una provincia
    ne resta sempre 1. E le truppe appartengono a chi possiede la **provincia** (come le navi,
    §9.2): con `consegna` posare soldati su una provincia non del regno non glieli consegna —
    `decree` lo dice nel messaggio invece di far finta di niente.
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
    tocca; una di fede diversa razzia il vicino-giocatore più debole **che schiaccia di
    numero** e, se **vince**, si riprende la provincia — che **torna neutrale**
    coi superstiti (scelta dell'utente). Le costruzioni restano, come in una conquista.
    **Soglia (regola dell'utente)**: `GameRules.neutralCanRaid`, cioè **3 attaccanti per
    ogni difensore** — 4 soldati neutrali (3 spendibili) contro 1 solo difensore è il caso
    limite. Se non schiaccia nessun confinante di fede diversa, resta ferma. È una razzia
    su una porta aperta, non un secondo fronte.
    **Una Capitale razziata si declassa a Città**, come una Capitale nemica conquistata:
    in terra di nessuno non governa più nessuno. Senza questo il regno restava senza
    seggio ma con la pedina ancora piantata su una provincia neutrale —
    `getCapitalPathFor` non trovava niente e il regno perdeva Popolarità, raccolto e
    reclute **per sempre**, senza che nulla lo dicesse. Era il blocco definitivo.
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
  - **La fede segue la spada (regola dell'utente)**: chi conquista converte. La provincia
    presa — nemica o neutrale — prende la confessione **esatta** del conquistatore (la sua
    religione di stato), e vale per **ogni** regno, non solo per i cristiani. Niente
    Capitale → niente religione di stato → niente conversione.
    Vive in `convertOnConquest` dentro `applyBattleOutcome`
    (`game-actions.js`), cioè nell'unico punto della regola di conquista: così vale per
    l'attacco via terra, per lo sbarco e per lo sbarco d'editto senza tre copie. La fede
    del vincitore si legge **prima** di applicare la conquista: la Capitale del difensore
    resta in piedi e cambia colore, quindi subito dopo `stateReligionOf` potrebbe trovare
    quella e leggere la fede del vinto. `attack` restituisce `conversione` ({da, a, label})
    e il rapporto di battaglia la mostra (`.bb-faith`).
  - **Vista mappa per fede**: bottone ☩ (plancia `#board-faith`, editor `#faith-view-btn`)
    → `Risiko.setMapPaint('fede')`. È **solo pittura**: non cambia proprietari, turni o
    permessi, e rispetta la nebbia. Chi aggiunge un'azione che sposta la Capitale o
    cambia una fede ricordi che `refreshMapDisplay` ridipinge secondo `mapPaintMode`.
- **Mercenari: permanenti, ma di ventura (§5.3, §9.0)**. 150 monete, **restano per sempre**
  (la Guarnigione no: `GameRules.TEMPORARY` contiene solo lei, e chi si recluta sta in
  `RECRUITABLE`). Un mercenario è un soldato **dappertutto** — presidio §5, spostamenti,
  costi in soldati: si distingue **solo** nel tiro di battaglia.
  - **Due effetti, e la separazione è il punto** (`MERC_VALUE = 0.85`, `MERC_SPREAD = 0.25`
    in `battle.js`, uniche manopole): in linea vale 0,85 soldati — costo piccolo e certo,
    sposta la **media**; e quel valore scarta di ±0,25 a ogni battaglia — è il prezzo vero,
    apre la **banda**. `A_eff = (A − m) + m·ρ`, un tiro **per schieramento** (non per uomo),
    simmetrico anche in difesa (se no presidiare con la ventura sarebbe gratis). Le
    **perdite** restano sulle truppe reali: sposta la probabilità, non fa vittime extra.
    Un'armata di ventura non è più debole, è **meno sicura** — 12 contro 8 passa da 69%
    certo a 62% fra 45 e 73.
  - **La quota vive sul PATH** (`data-merc`), non sul record del giocatore: le truppe sono
    di chi possiede la provincia, come le navi. Viaggia negli snapshot (`m` in
    `collectPieces`), sopravvive a un editto, e non serve un secondo libro mastro.
    **Invariante**: `data-merc ≤ soldati`. La impone `setMerc`, e `changePiece` la riapplica
    a ogni calo di soldati — nemmeno il pennello dell'editor può romperla.
  - **Chi parte e chi cade sta in `game-actions.js`, non nel deposito**: partenze in quota
    **proporzionale** (`GameRules.mercShare`; poter tenere i sudditi a casa e spedire sempre
    la ventura vorrebbe dire comprarne il vantaggio senza il difetto), perdite **ai mercenari
    per primi** (ed è così che la quota si ripulisce da sé). Chi aggiunge un'azione che muove
    soldati fra province deve muovere anche la quota: `mercLeaving(from, n)` **prima** di
    togliere i soldati, `E().addMerc(to, …)` all'arrivo.
  - **Il pronostico non può più essere un numero**: `RisikoBattle.winForecast` restituisce
    media + banda, e la chiamano sia la plancia sia `bot.js` (`winProbMerc`). `winChance`
    resta per il caso senza ventura. Il bersaglio porta `merc` addosso come porta `terreno`.
    Il rapporto di battaglia mostra **quanto hanno reso** (`.bb-merc`): è la sola parte
    dell'esito che il giocatore non può dedurre.
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
  **Lo sbarco è totale**: dopo uno sbarco vinto `player.conquista` NON si apre — la
  ripartizione fra chi occupa e chi rientra vale solo per le conquiste via terra. Chi
  scende dalla nave resta a terra; per riportare indietro degli uomini c'è lo spostamento
  di fine turno. Chi tocca `attack()` non rimetta la conquista sugli sbarchi "per
  uniformità": è una regola, non una dimenticanza.
- **Nebbia leggera (§9.2)**: `computeVisibleProvinces` non torna più un Set ma
  `{visible, haze, spie}`. `haze` è quel che raggiungono le nostre navi **e dove guardano
  le nostre spie** (§9.3): la provincia si vede **col colore del proprietario** ma le sue
  pedine no — dal mare si riconosce la bandiera, non la guarnigione. `spie` è solo il
  POSTO dove stanno i nostri uomini (per il contorno sulla mappa), non un grado di
  visibilità in più. Chi legge la nebbia usa `Risiko.isVisible` (che è `visible ∪ haze`);
  chi mostra **numeri** di truppe deve controllare anche la classe `haze` sul path.
- **Spie (`js/spies.js`, §9.3)**: 300 monete, **3 turni**, **3 per regno**, bersaglio entro
  **5 confini** dal proprio territorio e **solo dove non si vede già**. Non è una pedina:
  non sta sulla mappa, non presidia, non si cattura — vive in `player.spie` come
  `[{prov, turno}]` e versa nella nebbia leggera che c'è già. Tre cose da sapere:
  - **La scadenza si calcola, non si salva.** `Spies.active(spie, turno)` filtra a ogni
    lettura (nebbia, plancia, azione); `beginTurn` pota la lista solo per ordine. Così una
    spia non può sopravvivere a un salvataggio riaperto tre decenni dopo, e non esiste il
    caso "una parte del codice l'ha già cancellata e un'altra no".
  - **Il bersaglio si sceglie DALLA MAPPA**, come attacco e spostamento: il bottone
    `🕵 Manda una spia` accende con `markTargets(null, ids, 'spia')` le province
    raggiungibili (`GameActions.spyTargets`) e il clic apre la conferma, non il cursore
    d'ordine — non c'è niente da contare. È l'unico ordine **senza provincia di partenza**:
    `openOrder` lo intercetta prima di cercare la selezione. Le mete sono decine e si
    accendono **tutte** (niente `ORDER_MAX_MARKS`): quel che si illumina è esattamente
    l'anello di mondo che non vedi ma puoi raggiungere, ed è l'informazione.
  - **`spyTargets` non dice di chi sono le province**, apposta: è quello che la spia va a
    comprare. Se finisse nel pannello, il giocatore leggerebbe gratis la cosa che sta
    pagando. Delle spie **già partite** invece la plancia dice eccome chi governa — quello
    è il loro rapporto.
  - **Una spia nemica sul tuo suolo è INVISIBILE (regola dell'utente)**: nessun segno,
    nessun avviso, nessun controspionaggio. Viene gratis dal modo in cui è fatta la
    nebbia — il set `spie` esce da `computeVisibleProvinces(focus.name)`, cioè contiene
    solo le spie di CHI sta guardando, e in vista generale (`focus` null) non si segna
    niente. Chi tocca `refreshMapDisplay` o la classe `.spied` non la trasformi in un
    marcatore "per tutti": diventerebbe un avviso di spionaggio, che è un altro gioco.
    (Lo stato condiviso contiene comunque le spie di tutti, come contiene tutta la mappa:
    la nebbia è lato client e non è un segreto crittografico.)
  - I **bot non comprano spie**: leggono lo stato vero della mappa e la nebbia non li
    riguarda, quindi per loro sarebbero 300 monete buttate. Se un giorno l'IA giocherà a
    informazione limitata, è lì che la spia entrerà anche per lei.
- **Popolarità: la formula sta in `js/popularity.js`, non in app.js.** `app.js` misura e
  basta (`popularityFactors`: nemiche al confine, guardia, generale, varietà, cibo,
  tassa) e passa i numeri a `Popularity.score`. Stessa scelta di
  `RisikoBattle.winChance`: una formula sola, chiamata dal pannello del giocatore e
  dall'IA, che quindi non possono divergere.
  - **Il rovescio della formula è il PIANO** (`Popularity.plan`), ed è il motivo per cui
    il modulo esiste: data la situazione, qual è la combinazione più economica di
    **tassazione** e **guardia della Capitale** che raggiunge il livello voluto? Con la
    formula chiusa dentro app.js quella domanda non si poteva fare, e i bot restavano a
    Popolarità 1 per tutta la partita.
  - **La trappola del turno 1** (verificata coi numeri): la Capitale nasce circondata da
    neutrali, quindi `P_conf = 0`; con 5 soldati `P_guardia = 0` → Sicurezza **0**. Con
    una sola strada il Benessere vale **1**. Tassa normale 3 → `(0+1+3)/3` = Popolarità
    **1**, cioè −2 reclute e −2 risorse: un regno da 3 province raccoglie **zero** e non
    ha più niente con cui rimediare. Ne esce chi tira due leve che costano quasi nulla:
    **tassa leggera** (+2 sul terzo componente) e **guardia a 10** (`P_guardia` è a
    scatti: 5 soldati = 0 punti, 10 = 5, il massimo — parcheggiarne 7 è mezza leva
    sprecata, 12 sono due buttati). Le due leve **da sole non bastano** (2 e 2), insieme
    più il primo campo di grano collegato fanno 3. Per questo `plan`, quando il target è
    fuori portata, sceglie quel che **avvicina** di più (il `potential`, cioè il totale
    non arrotondato) e non quel che costa meno: al risparmio le scarterebbe entrambe e
    resterebbe nel pozzo per sempre.
  - **Per l'umano la trappola resta**, ed è una scelta dell'utente: chi conosce le regole
    ne esce in 3-4 turni, e il §8 non si tocca.
  - `GameActions.setTax` è l'unico modo di cambiare tassazione (prima la scriveva il
    click nella UI): non consuma la fase, vale in tutto il proprio turno, e da lì
    arrivano gratis il salvataggio e il `prov` per il registro.
  Due regole dell'utente dentro il calcolo:
  - **Sicurezza**: nemica al confine della Capitale è **ogni provincia non tua**, terre di
    nessuno comprese — sono presidiate e razziano, quindi contano come un regno.
  - **Benessere**: *Risorse* = quanti **tipi diversi** di risorsa sono COLLEGATI (§4),
    *Cibo* = quante province di **Grano/Bestiame** collegate, fino a 5. Si contano le
    province, non la raccolta: il ±N di risorse della Popolarità non entra nel Cibo,
    altrimenti il Benessere si nutrirebbe di sé stesso. *Sanità* e *Felicità* aspettano
    le migliorie del §6.1 e valgono la baseline neutra `WELFARE_PENDING = 3`.
    La rete di province collegate è quella di `GameActions.connectedOf`: chi ce l'ha già
    la passa come terzo argomento, così non si rifà la BFS due volte per render.
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
  - **In vista generale si vede SOLO la mappa** (scelta dell'utente): entrando, i due
    pannelloni si chiudono da sé (`syncPanelsForSpectate` in `player-board.js`, che passa
    dalle stesse classi `collapsed` / `left-closed` / `right-closed` della linguetta) e la
    mappa si prende tutta la larghezza. La barra in alto **resta**: è da lì che si torna al
    regno e si cambia la velocità dell'IA. Uscendo, i pannelli tornano **come stavano**:
    lo stato si ricorda all'ingresso (`panelsBeforeSpectate`) e la linguetta lo aggiorna se
    lo si tocca durante la vista, così rientrando non si riapre un pannello chiuso a mano.
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
- **Come si disegna una strada (scelta dell'utente)**: è un **cancello aperto** — due
  trattini scuri che tagliano il confine di traverso, col varco in mezzo — e nient'altro.
  Non è una carreggiata: deve dire "queste due province sono agganciate" e poi sparire
  dalla vista, perché sulla mappa comandano pedine, città e risorse. Il selciato di
  ciottoli che c'era prima era grande il doppio e rubava l'occhio.
  - **L'inclinazione viene dal CONFINE, non dai centri delle province.** `roadPlacement`
    (app.js) trova i punti dove i due bordi si toccano e ne prende l'asse principale
    (PCA): la strada gli sta perpendicolare, quindi l'orientamento segue da sé il tipo
    di confine — trattini verticali su un confine orizzontale e viceversa. La direzione
    centro-A → centro-B, che si usava prima, su un confine a L punta altrove e la strada
    finisce di sbieco o dentro una provincia.
  - **La direzione del confine non si stima: si CAMMINA.** I punti di contatto nascono
    nell'ordine in cui si percorre il bordo di A, quindi dal punto di posa si scorre
    l'array avanti e indietro finché non si è percorso `ROAD_TANGENT_R` (1,6 unità per
    lato) e si prende la corda fra i due estremi. Una PCA su una nuvola di punti
    sbagliava di 5-18°: presa su tutto il confine dà la corda di un arco, presa su un
    raggio piccolo prende la frastagliatura del bordo. Col cammino lo scarto dalla
    perpendicolare sta sotto i 2° e il segno cade a **0,03-0,06 unità dal confine**
    (prima 0,23-0,35). Il cammino si interrompe se due contatti consecutivi distano
    più di 1,5: lì il confine è in due tronconi e saltare darebbe una direzione
    inventata.
  - **`ROAD_TANGENT_R` non è la misura della strada**: è quanto confine si guarda per
    capire com'è girato, ed è una proprietà della geografia. Resta 1,6 anche se la
    strada si rimpicciolisce — legarlo a `roadSpan` fu l'errore della prima versione.
  - **Misure (scelta dell'utente: piccole)**: `roadSpan` dà 1,5-2,4 unità su province
    che ne misurano dieci, spessore ~0,4. Sono decine di segni su una mappa già piena:
    il difetto da temere è l'affollamento, non l'invisibilità. Chi le vuole diverse
    tocca **solo** `roadSpan` — e le prova prima col cursore "misura" della pagina di
    diagnostica, che monta le stesse formule.
  - **La strada SCIVOLA per non finire sotto un'icona-risorsa** (`freeRoadIndex`): un
    punto del confine vale l'altro, quindi se il mezzo è coperto si cerca il primo
    libero scorrendo i contatti alternativamente di qua e di là (fino a 40 per lato),
    e la posa si ricalcola lì con `roadPoseAt`. Se è tutto occupato si tiene il mezzo:
    meglio coperta che spostata a caso. Per questo `renderResourceMarkers` chiama
    `renderRoads` in coda — cambiate le icone, le strade vanno rifatte o resterebbero
    sotto quelle nuove.
    - **Le PEDINE non entrano nello schivamento, ed è voluto**: si muovono a ogni turno
      e una strada che le evitasse salterebbe di posto a ogni mossa. Una strada è un
      punto fermo della mappa; le risorse si assegnano nell'editor e poi stanno ferme.
    - L'indice dei riquadri (`resourceBoxIndex`) si costruisce **una volta** per
      `renderRoads`: una `querySelectorAll` per strada portava il render da 2 a 15 ms,
      lo stesso errore che faceva costare un secondo a `refreshMapDisplay`.
  - **Costa, quindi si memoizza**: cercare i contatti fra due bordi è O(n·m) e `renderRoads`
    gira a ogni applicazione di stato. Il risultato sta su `A.__roadGeom[B.id]` (la
    geografia non cambia mai) e i punti di bordo si ritagliano prima sulla sovrapposizione
    dei due riquadri (Nunavut: 3520 punti → 343). A caldo 9 strade costano 2 ms; a freddo
    ~37 ms per strada nel caso peggiore (le province più grandi del mondo). Le province
    che scavalcano il bordo mappa (Alaska) hanno un riquadro largo quanto il mondo e il
    ritaglio non le tocca: c'è il ripiego sui punti interi.
  - Confronto visivo delle alternative: `http://localhost:5500/_diag-roads.html`
    (bottoni/tasti 0-4, cursore "misura", `?all=1` per la prova di affollamento,
    `?vb=x,y,w,h` per zoomare, **`?debug=1`** per vedere in magenta i punti di confine
    trovati dal calcolo e in ciano il punto di posa — è così che si controlla se una
    strada sta davvero sul confine, invece di dedurlo da un bordo spesso mezzo pixel).
    La pagina accoppia le province per sovrapposizione dei riquadri, quindi filtra da
    sé le coppie che si toccano appena (≥8 contatti, ≥2 unità di confine): nel gioco
    non esistono, perché `areLandAdjacent` le rifiuta.
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
**Fotografare la PLANCIA in headless** vuole due passi, perché in headless non si clicca e
il profilo usa e getta parte senza partita salvata: serve un profilo **persistente**
(`--user-data-dir` fisso) e le due pagine di lavoro. Prima `_dev-start.html`, che carica la
mappa iniziale, avvia la partita contro l'IA e dà al regno umano il codice d'invito `dev`;
poi `_dev-play.html?p=dev&fase=attacca` (copia di `play.html` con `_dev-drive.js` in coda),
che porta il turno alla fase chiesta, seleziona una provincia utile e apre il cursore
d'ordine (`&apri=0` per vedere solo i bersagli accesi). `_dev-play.html` va **rigenerato da
`play.html`** ogni volta che si tocca la plancia, se no fotografa la versione vecchia.
Lo stato resta nel profilo: prima di ogni scatto si ripassa da `_dev-start.html`, altrimenti
la partita è dove l'ha lasciata lo scatto precedente e le fasi non tornano indietro.
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

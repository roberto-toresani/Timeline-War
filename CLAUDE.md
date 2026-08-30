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
│  ├─ player-board.js    render della plancia: colonna del turno, fogli del dock, azioni
│  ├─ game-rules.js      costi (§6), connettività (§4), produzione di turno (§2) — puro
│  ├─ game-actions.js    UNICO punto che muta lo stato: schiera/costruisci/attacca/turni
│  ├─ popularity.js      POPOLARITÀ (§8): la formula E il suo rovescio (il piano) — puro
│  ├─ spies.js           SPIE (§9.3): costo, durata, raggio in province, cosa vedono — puro
│  ├─ religions.js       RELIGIONI: confessioni, famiglie, blocchi di partenza, scismi — puro
│  ├─ events.js          EVENTI STORICI datati (crociate, mongoli, peste, Cent'Anni): calendario + ciclo di vita — puro
│  ├─ terrain.js         TERRENO chiuso/aperto: l'esponente della battaglia (§9) — puro
│  ├─ sea-routes.js      PORTATA DELLE NAVI: quanto lontano si arriva via mare (§9.2) — puro
│  ├─ doctrines.js       DOTTRINE: il carattere storico dei regni nati per evento (mete, nemici, fede) — puro
│  ├─ objectives.js     OBIETTIVI (§10): il BINARIO STORICO di ogni regno, template e generatore — puro
│  ├─ bot.js             regni governati dall'IA: 4 strategie + driver dei turni
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
  spostamento finale, costi in soldati delle costruzioni (Mercato 4, Nave 1,
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
  seggio per altre **500 monete**, con la vecchia sede che diventa **Città**. Il seggio si
  trasloca **solo su una propria Città** (regola dell'utente: prima si fonda la Città, poi
  vi si sposta la Capitale — altrimenti spostarla su una provincia qualunque sarebbe troppo
  facile); la Città di destinazione viene **assorbita** dalla Capitale (`seatCapital` toglie
  la Città prima di posare il seggio). Conquistando una **Capitale nemica**: se non ne hai una è adozione automatica;
  se ne hai già una la presa è declassata a Città di default (così `getCapitalPathFor` ne
  trova sempre **una sola**) e `player.capitalePresa` offre all'umano la **promozione**
  opzionale (`GameActions.resolveCapital`, la vecchia → Città). I bot non promuovono
  (`capitalePresa` non si imposta per `winner.bot`). Il trasloco fisico del seggio vive in
  **un posto solo**, `seatCapital` in `game-actions.js`, chiamato sia da `moveCapital` sia
  da `resolveCapital`; la regola di conquista sta dentro `applyBattleOutcome`.
- **Il Mercato non convive con un insediamento (regola dell'utente)**: dove c'è già una
  Capitale, una Città o una Fortezza non si costruisce un **Mercato**, e per la stessa
  esclusività non si posa un insediamento dove c'è già un Mercato. Vive nell'**unico**
  punto delle regole di piazzamento, `canPlacePiece` in `app.js` (usato sia dall'editor sia
  da `GameActions.build`), accanto all'esclusività Capitale/Città/Fortezza. I bot lo
  rispettano da sé: `siteFor` in `bot.js` scarta le province con un Mercato quando cerca
  dove posare un insediamento (e già scartava gli insediamenti quando cerca dove posare il
  Mercato).
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
    **Sono TESSERE-ICONA, non un elenco di scritte** (richiesta dell'utente):
    `buildTile`/`costChips` in `player-board.js`, griglia `.bp-tiles`. Ogni
    tessera porta la **sagoma vera della pedina** — gli stessi `<symbol>` `#pc-…`
    che stanno sulla mappa (iniettati in `#pc-defs`), tinti col colore del regno
    via `color` perché usano `currentColor` — il nome e il costo in **gettoni**
    (`#res-…` per le risorse, glifi per monete e soldati). Due regole di lettura:
    **fattibile adesso = tessera accesa** (`.can`, bordo d'oro; `.no` è spenta e
    in grigio), e **il gettone di ciò che manca è rosso** (`.bt-cost.short`, da
    `canAfford().missing`, calcolato **sempre** — anche quando il blocco è il
    posto e non il prezzo). Sulla tessera si scrive il motivo **solo se è il
    posto** (`opts.nota`, accorciata da `tileNote`): quando è il prezzo lo dicono
    già i gettoni rossi, e ripeterlo a parole in 112px rifarebbe l'elenco che si
    voleva togliere. L'effetto completo sta nel `title`; la tabella intera nel
    pop-up 📜. Anche le **strade** sono tessere (una per vicino, nome della
    provincia sotto la sagoma; badge ★ e nessun gettone quando sono gratuite).
    Chi aggiunge una voce costruibile aggiunge la sua sagoma a `BUILD_SYMBOL`
    (e, se condivide la sagoma con un'altra voce, un bollino in `BUILD_BADGE`).
  - `attacca`: quanti attacchi si vuole. Si comanda **dalla mappa** (vedi
    "Comandare dalla mappa"): `Risiko.showAttackArrows(fromId, ids, kind)` disegna
    frecce animate verso i bersagli, nel gruppo `#attack-arrows` appeso in coda
    all'SVG (non fra le pedine: `renderPiecesForPath` le cancellerebbe).
  - **conquista**: vinta una battaglia con più di 1 superstite, `player.conquista` resta
    aperta e blocca ogni altra azione finché `resolveConquest(player, occupanti)` non
    decide quanti restano nella provincia presa e quanti rientrano in quella di partenza
    (almeno 1 deve occupare). A fine turno si chiude d'ufficio lasciandoli tutti lì.
    **La scelta salta fuori CENTRALE sopra la mappa** (regola dell'utente): la modale
    `#ui-conquest` (`showConquestPrompt`/`openConquestModal` in `player-board.js`) con lo
    slider di ripartizione compare da sé dopo la presa, così si decide lì senza cercare la
    sezione nel pannello. Aspetta che la scena della battaglia finisca (`svg.battle-focus`,
    ~3,6s) per non piombarci sopra; "Decido dopo" la chiude e lascia il pannello
    `#bp-conquest` (`renderConquest`, sempre presente) a farla concludere. Si mostra una
    volta per presa (`conquestPromptFor`, chiave `from>to@turno`).
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
- **Struttura della plancia** — impianto voluto dall'utente: **la mappa è il fondo e
  prende tutto**, durante il turno non si deve scorrere per trovare le cose, e **si
  deve leggere poco**. Non ci sono più tre colonne che si spartiscono lo schermo:
  - **Il TURNO è una colonna snella a destra** (`#board-right`, `--turn-col` in
    `board.css`), aperta e chiusa dalla sua linguetta. Qui ci sta **solo quel che
    serve ad agire adesso**.
  - **Tutto quel che si consulta è un PULSANTE del dock** (`#board-dock`, dentro la
    cornice della mappa) che apre un **foglio a tutta visuale**, uno per volta
    (`#board-sheets`, `showSheet()` in `player-board.js`): 👑 **Corona** (Popolarità,
    obiettivi, il tuo regno, i regni in gioco, cosa fa l'IA), 🕊 **Diplomazia**,
    ⚖ **Mercato**. Esc chiude. Il **foglio della diplomazia è l'unico che non copre
    tutto** (`.sheet-diplo`, classe `peek`): parla con la mappa — passando sopra la
    scheda di un regno se ne accendono i confini — e coprirla la renderebbe muta.
  - **I costi ed effetti sono un POP-UP** (📜 `#bp-costs-pop`), apribile e
    richiudibile **in qualunque momento**, anche sopra un foglio: non è più una
    cartella in fondo a un pannello che scorre e che, aperta, resta lì.
  - **Si parte con la sola mappa**: colonna del turno chiusa, fogli chiusi. Quando
    tocca a te la linguetta si accende (`.board-tab.now`, la accende `renderTopbar`).
  - Chi aggiunge **un'azione** la mette nella fase del pannello destro; chi aggiunge
    **qualcosa da consultare** la mette in un foglio, non in coda al turno.
  - **`.bp-mini` è un MINIMO, non una misura.** Nasce quadrato per i comandi a una
    sola icona (⚑ − + dell'elenco province), ma quasi tutti i suoi usi portano
    un'etichetta di testo ("✓ Accetta", "🏳 Concedi attacco", "🕊 Proponi un
    patto"). Con `width`/`height` **fissi** a 30px quel testo usciva dal bottone e
    finiva a scriversi **sopra il riquadro accanto** — è così che le schede della
    Diplomazia si accavallavano. Ora sono `min-width`/`min-height` + padding:
    l'icona sola resta 30×30 (glifo e padding stanno sotto il minimo), il testo
    allarga il bottone. Chi mette un bottoncino con un'etichetta non deve
    aggiungere un override di larghezza per il suo contenitore.
  - **Destra, quattro fasce e solo la terza scorre.** In alto il **cruscotto**
    (`#bp-status`): una riga sola con oro, **province controllate** (col numero dei
    **rinforzi del prossimo turno** sotto, richiesta dell'utente: è il numero con
    cui si decide quanto crescere, §5.1 — l'esercito totale e la guardia della
    Capitale restano nel tooltip, e la guardia debole ≤5 si segna con ⚠ sulla
    tessera della Capitale), **fede di stato**, più la striscia delle scorte. Non
    scorre mai — sono i numeri con cui si decide ogni mossa. La scrive `renderArmy`
    (`bp-soldiers`/`bp-soldiers-cap` sono rimasti gli id, ma ora contano province e
    rinforzi). Poi le quattro **cartelle delle fasi**
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
  - **Nel pannello del turno resta solo `#bp-consult` con l'elenco delle province**
    (`<details class="bp-fold">` chiusa): da lì si **seleziona** e in fase 1 si
    schiera con + e −, quindi è un comando, non una lettura. Territorio e rinforzi
    sono passati al foglio 👑 Corona, i costi al pop-up 📜.
  - **Aprire una cartella non è agire**: `openFolder` in `player-board.js` decide
    *cosa si vede*, `player.fase` *cosa si può fare*. Se la cartella aperta non è la
    fase in corso si sta **sbirciando**: `freeze()` spegne i comandi di quel blocco e
    `#bp-peek-note` dice perché (col bottone per tornare). `openFolder` si azzera da
    sé quando la fase vera cambia, così un turno nuovo non si apre su una cartella
    vecchia. Chi aggiunge un blocco di fase lo mostra in base a `viewPhase(player)`,
    non a `phase(player)`, e lo aggiunge all'elenco che `render()` congela.
  - **Il foglio 👑 Corona**, in due colonne: a sinistra Popolarità e obiettivi
    (`#board-left` + `.bp-crown` — l'id resta perché è lì che app.js inietta il
    pannello Popolarità e da lì pendono le sue misure in `board.css`), a destra il
    regno in numeri, i regni in gioco e il registro dell'IA.
  - **Il pannello del turno si chiude**: la linguetta (`.board-tab`) sta dentro la
    cornice della mappa, non ai bordi dello schermo, così è sempre allo stesso posto.
    Chiuso, sparisce e la mappa si prende il suo posto; subito dopo si richiama
    `Risiko.setViewInsets(0,0)` per reinquadrare.
  - **I confini coi regni di GIOCATORI sono segnati sulla mappa, sempre**
    (`Risiko.markBorders` in `app.js`, strato **`#border-marks`** a parte — non
    `#order-marks`, che `markTargets` azzera a ogni fase). CHI marcare lo decide
    `syncBorderMarks` in `player-board.js`: di norma solo i regni **non bot** che
    confinano con te; col foglio 🕊 aperto tutte le frontiere in vista; sotto il
    mouse di una scheda, solo quella. Le province in nebbia non entrano mai.
- **Schieramento (§5.1)**: le reclute di inizio turno sono di due tipi. Le **libere**
  (province ÷ 3, più il modificatore di Popolarità) vanno dove vuole il giocatore e si
  possono ritirare/rimettere finché il turno è aperto; le **obbligatorie** (Capitale +1,
  Città +1, Fortezza +5) possono andare **solo** nella provincia dell'edificio che le ha
  prodotte, e a fine turno vengono schierate d'ufficio se il giocatore non l'ha fatto.
  Serbatoi sul record giocatore: `recluteDaSchierare`, `recluteVincolate` (per provincia),
  `schierateTurno` (cosa si è posato adesso: è l'unica cosa ritirabile).
  - **Le obbligatorie si posano con un pop-up centrale, a inizio turno** (regola
    dell'utente): hanno una destinazione sola, quindi non c'è niente da decidere.
    `showDeployPrompt` in `player-board.js` apre a inizio turno la conferma centrale
    (`Risiko.confirm`) "Schiera tutti (N)", che chiama `GameActions.deployAllBound` — un
    click e vanno tutte al loro posto, senza cercarle nel pannello. Una volta per turno
    (`deployPromptShownFor`, chiave `id@turno`): chi risponde "Li dispongo io" non viene
    più interrotto, e l'elenco `#bp-bound-list` resta per farlo a mano.
- **Commerci conclusi: avviso a inizio turno + storico da riproporre** (§7, regola
  dell'utente). Uno scambio ANDATO A BUON FINE lo conclude l'altro regno, spesso nel suo
  turno: chi ha mandato la carovana (il **proponente**) non era al tavolo. `recordTrade`
  in `game-actions.js` (dentro `acceptTrade`, l'unico punto in cui uno scambio si chiude)
  registra l'affare su **entrambi** i regni dal loro punto di vista (`commerciStorico`:
  `{conId, conNome, dato, ricevuto, turno}`) e lascia un **avviso** al solo proponente
  (`commerciAvvisi`, come gli editti — l'accettante l'ha appena fatto lui e vede subito
  l'esito). `normalizePlayer` inizializza entrambi; tetto `TRADE_LOG_MAX = 20`.
  - **L'avviso è un pop-up centrale a inizio turno**: `showPendingCommerci` in
    `player-board.js` srotola la pergamena (`Risiko.showFoundation`, tipo `commercio`)
    all'apertura del proprio turno, una volta sola (`letto`), cedendo la precedenza a
    editti e avvisi di mare (una pergamena per volta, `#ui-foundation`).
  - **Lo storico si RIPROPONE con un click**: la card "Storico degli scambi"
    (`historyCard` in `renderTrade`) elenca gli scambi conclusi; "↻ Riproponi" ricompila
    la card "Proponi a un regno" (`tradeUI`) con gli stessi termini verso lo stesso
    regno. Rifare un affare è un click, non da ricomporre a mano.
- **Diplomazia: i PATTI, e il fatto che si possono ROMPERE** (§Diplomazia, regola
  dell'utente: "si può sempre mentire"). Come le richieste di commercio, un regno propone
  a un altro **visibile** (anche via spia) uno di **cinque** patti di peso diverso. La
  relazione pura e i **privilegi** stanno in `js/diplomacy.js` (`window.Diplomacy`, come
  `popularity.js`); le mutazioni **solo** in `game-actions.js`; la UI in `player-board.js`
  (fatti i **pop-up a inizio turno** e il **pannello Diplomazia** — vedi sotto; resta
  l'attacco-con-consenso/tradimento **dalla mappa**). Un patto è **mutuo**: `bondPact`/`unbondPact` lo scrivono su **entrambi** i
  record (`player.patti = [{tipo, con, dal, scad}]`), come `recordTrade`. Proposte come le
  offerte (`pattiProposte` su chi riceve), avvisi come gli editti (`pattiAvvisi`).
  - **I cinque patti e i privilegi** (`Diplomacy.GRANTS`): `alleanza` (tutti i privilegi,
    senza scadenza), `alleanzaTempo` (tutti, dura `Diplomacy.TIMED = 5` turni poi scade),
    `nonBelligeranza` (solo non-aggressione), `rinforzi` (solo accesso militare), `vista`
    (solo visione condivisa). I privilegi: `nonAgg` (non ci si attacca), `vista` (§9.2, in
    `computeVisibleProvinces` il territorio del partner si vede in **piena** visibilità,
    truppe comprese), `rinforzi` (accesso militare: lo spostamento di fine turno può
    **inviare rinforzi** a un alleato confinante via terra — `moveTargets` lo segna
    `alleato:true`, `finalMove` aggiunge i soldati alla provincia del partner **senza**
    cambiarne proprietario/colore: diventano suoi. Solo via terra, niente sbarco).
  - **Solo l'alleanza costa a romperla**: `−2` prestigio (`Diplomacy.BREAK_PRESTIGE`, su
    `puntiOro`). I patti leggeri si sciolgono **gratis** — è il loro vantaggio (impegni
    meno). Il prestigio è **oggi spento** (`GameRules.PRESTIGE_ENABLED = false`), quindi il
    `−2` è un no-op finché non si riaccende il §10: **la regola è già codificata**, morde
    da sé quando torna il prestigio.
  - **Attacco a un alleato: consenso o tradimento.** In `attack()` (parametro finale
    `tradimento`) colpire un partner di non-aggressione è bloccato, salvo: (1) il
    **consenso** del proprietario a quella provincia — `grantAttack` lascia un permesso
    una-tantum `owner.permessiAttacco = [{chi, prov}]`, l'attacco **non rompe** il patto e
    consuma il permesso; (2) `tradimento` esplicito — rompe **tutti** i patti col
    difensore (`breakPact(..., null)`), `−2` se c'era un'alleanza. Il rancore del tradito
    lo segna già la conquista (`recordGrudge`), non serve raddoppiarlo. Il patto si scioglie
    al **commit** (battaglia risolta, `silent`), non prima.
  - **Scadenza gratis**: `expirePacts()` (in `endTurn`, come `expireTrades`) scioglie le
    alleanze a tempo giunte a `scad`, senza prestigio, avvisando entrambi. `scad = dal +
    TIMED`; niente zombie.
  - **`attackTargets` porta la diplomazia sul bersaglio**: `patto` (non-aggressione),
    `alleanza` (costa prestigio romperla), `consenso` (permesso già concesso) — così la
    plancia chiede consenso/tradimento invece di attaccare liscio.
  - **Pop-up a inizio turno (regola dell'utente: come i commerci, ma con un pop-up)**, in
    `player-board.js` e agganciati in coda a `render()`: `showPendingPactProposals` apre una
    modale **azionabile** (`Risiko.confirm` con il terzo esito `onNo`) — *"Un araldo alla
    tua corte"*, **Accetta**/**Rifiuta**, Esc/click-fuori = decidi dopo (la proposta resta
    in `pattiProposte`, ritorna al render successivo); `showPendingPactNotices` srotola la
    pergamena (`showFoundation`, tipo `patto`/`tradimento`, *"Un araldo reca notizia/cattive
    nuove"*) per gli esiti in `pattiAvvisi`, cedendo la precedenza a editti/mare/commerci.
    Il taglio è quello di un **araldo/messo** che reca la proposta o la notizia.
  - **Il livello di rapporto** (`Diplomacy.standing(me, altro, ctx)`, puro): non è un
    campo nuovo dello stato — è la somma dei fatti che il gioco già registra, da −100 a
    +100, con `why[]` che porta ogni voce e il suo segno. È il punto di vista di `me` su
    `altro`: legge solo il registro di `me`, quindi non svela niente che il giocatore non
    sappia già. Chi lo mostra è `renderRelations` (`#bp-relations`, colonna sinistra del
    foglio 🕊); chi volesse farlo pesare all'IA lo legge da lì, non se lo ricalcola.
    Le voci, e da dove escono (regola dell'utente: *"sarebbe meglio articolare di più il
    punteggio di amicizia"*):
    - i **patti** in essere (`PACT_WEIGHT`, l'alleanza vale 50);
    - la **FEDE** (regola dell'utente: *"due regni che hanno la stessa religione partono
      più amici del normale ma non alleati"*): stessa confessione **+18**, fedi sorelle
      (stessa famiglia — cattolici/ortodossi, sunniti/sciiti) +9, famiglie diverse −10.
      È l'unica voce che vale **prima di qualsiasi fatto**: due corone della stessa fede
      partono *Amichevoli*, e un confine senza accordi (−6) le riporta a *Neutrali*.
      `Alleati` (≥45) resta irraggiungibile senza firmare. Le confessioni arrivano dal
      chiamante (`ctx.fedeMia`/`ctx.fedeSua` = `Risiko.stateReligionOf`, cioè la fede
      della **Capitale**): diplomacy.js non guarda la mappa, come popularity.js non la
      misura. Senza Capitale non c'è fede di stato e la voce non compare;
    - gli **scambi conclusi** (`commerciStorico`) e i **consensi** concessi;
    - gli **AIUTI ricevuti** (`aiuti`): i rinforzi che un alleato ti ha mandato al
      fronte. Vale più di una carovana — sono uomini, non merce;
    - le **AGGRESSIONI subite** (`aggressioni`, registro nuovo): non solo le province
      strappate ma anche i **colpi RESPINTI** (regola dell'utente: *"se ci sono stati
      tentativi di attacchi, invasioni o conquiste passate"*). Il **rancore** resta il
      registro dei BOT e tiene solo le prede grosse (`grudgeWorth` ≥ 1); questo tiene
      tutto, perché un esercito arrivato al confine è un fatto diplomatico comunque sia
      finita. Lo scrive `recordAggression` nell'unico punto in cui una battaglia si
      risolve (`attack` in game-actions), leggendo la provincia **prima** delle
      mutazioni. `normalizePlayer` lo semina dal `rancore` nei salvataggi vecchi;
    - i **patti rotti e traditi** (`pattiAvvisi`) e il **confinare senza accordi**.
    **Il tempo sbiadisce** (`fade`, serve `ctx.turno`): pieno entro 10 turni, 0,6 entro
    20, poi 0,35. Serve a far sì che due regni che si sono fatti la guerra tre cicli fa
    possano tornare a parlarsi — se no il rapporto sarebbe una condanna a vita.
  - **A COSA SERVE DAVVERO UN'ALLEANZA: chiedere e mandare rinforzi** (regola
    dell'utente: *"nella meccanica dell'alleanza non si capisce cosa si possa
    effettivamente fare oltre a concedere uno stato ad un altro regno"*). Il privilegio
    `rinforzi` apriva una porta sola e stretta — lo spostamento di FINE turno verso un
    alleato confinante, uno per turno, in concorrenza con la manovra propria. Ora ne ha
    tre, tutte in `game-actions.js` (unico mutatore):
    - **CHIEDERE** (`askReinforcements(player, toId, provId)`): un messaggio che dice
      **dove** servono gli uomini. Vive come le proposte di patto — sul record di chi la
      riceve (`player.richiesteAiuto`, una richiesta esiste in un posto solo; le proprie
      si ritrovano con `helpOutbox`, come `tradeOutbox`) — con l'avviso sul canale dei
      patti (`pattiAvvisi`, tipo `aiuto`). Basta il proprio turno, nessuna fase. Si
      spegne quando i rinforzi arrivano, con `cancelHelp`, o da sé dopo `HELP_TTL` = 5
      turni (`expireHelpRequests`, in `endTurn` accanto a `expirePacts`).
    - **MANDARE, in FASE D'ATTACCO** (`sendReinforcements(player, fromId, toId, n)`,
      regola dell'utente): sulla provincia di un alleato confinante, al posto di
      caricare, gli si **marcia in aiuto**. Gli uomini (e la loro quota di ventura, §5.3)
      entrano nella sua provincia senza cambiarne proprietario né colore — la stessa
      regola del rinforzo di `finalMove`. **Non consuma** lo spostamento di fine turno e
      non ha un tetto di volte: il tetto è che quegli uomini **diventano suoi** e non
      tornano. Solo via terra, solo col privilegio `rinforzi`.
    - **TRADIRE dalla plancia**: `askAttack` passa finalmente il 7º argomento di
      `attack`. Prima la plancia non lo passava mai, quindi il motore rifiutava e
      l'unica strada era sciogliere il patto dal foglio 🕊 e attaccare il turno dopo.
      Ora la conferma è `danger`, dice che rompe ogni accordo e quanto costa, e il
      bottone d'oro del cursore diventa rosso (`.moh-go.betray`).
    Sulla mappa: `attackTargets` porta `rinforzabile` sul bersaglio, il retino di una
    provincia alleata è **oro** (quello dello spostamento) invece che arancio —
    `markTargets` accetta ora una voce `{id, kind}` accanto alla stringa — e il cursore
    d'ordine offre due strade ("🛡 Marcia in aiuto" su una riga sua, "⚔ Tradisci" in
    rosso). Nel pannello c'è la cartella "🛡 Alleati da rinforzare"; nel foglio 🕊 la
    riga "🆘 Chiedi rinforzi" (accanto a "Concedi attacco", sono le due cose che si
    fanno **con** un patto) e la card "Richieste di rinforzi" coi due capi della
    conversazione. **I bot le usano** (`helpAskPlan`/`helpSendPlan` in bot.js, uno per
    turno per parte come gli araldi): chiedono dove sono **scoperti** (`survey.scoperta`)
    all'alleato che **confina** con quella provincia, e mandano quel che avanza
    (`survey.mobili`) **dopo** gli attacchi — prima la propria guerra, poi gli uomini
    che restano.
  - **Le schede dei regni** (`renderRelations` → `relationCard`, foglio 🕊): una per
    regno visibile, ordinate dagli amici ai nemici — barra col rapporto (zero al
    centro), i fatti che lo compongono, i patti in essere e le due scorciatoie
    ("Proponi a…" prepara il modulo degli araldi, "Vedi il confine" chiude il foglio e
    inquadra la frontiera). **Le azioni non si sdoppiano**: proporre/accettare/concedere
    restano negli araldi; lo scioglimento passa dall'unico `breakPactButton`, condiviso.
  - **Il pannello degli araldi** (`renderDiplomacy`, `#bp-diplomacy`, colonna destra del
    foglio 🕊, non vincolato a una fase — un araldo si manda in ogni momento del proprio
    turno): tre card
    (`bp-trade-card`, stessa veste dei commerci). *Proponi un patto* (select del regno
    **visibile** via `diploKingdomsVisibili` + select del tipo → `proposePact`); *Patti
    attivi* raggruppati per regno, con "Sciogli/⚔" (`breakPact`; l'alleanza chiede conferma
    `danger` per il −2) e, per ogni partner di non-aggressione, il riquadro *Concedi
    attacco* (select di una propria provincia → `grantAttack`); *Araldi alla porta* (le
    proposte in arrivo, Accetta/Rifiuta — le stesse del pop-up, qui elencate).
  - **I bot fanno diplomazia "per bisogno"** (regola dell'utente), in `bot.js`, dentro la
    fase costruzioni del `turnScript` accanto ai commerci. `diploAnswers` risponde agli
    araldi arrivati (accetta i patti che convengono: un leggero salvo che il proponente sia
    una **preda** `isJuicyPrey`; un'alleanza solo se il proponente non è preda ed è forte);
    `diploProposals` compra pace — un solo araldo per turno — proponendo la **non
    belligeranza** al vicino-regno più minaccioso su un confine, se non è già in pace, non è
    preda, e non ha un araldo già in viaggio (`pendingBetween`). La lealtà vive
    nell'**attacco**: `bestAttack` salta un bersaglio di un partner di non aggressione
    (`t.patto`) a meno del suo **consenso** (`t.consenso`, gratis) o di un **tradimento**,
    che dipende dal carattere — `s.tradimento` per profilo (predone 1, opportunista 0.85,
    espansione 0.4, costruttore 0.1: *"opportunisti a scaglioni"*). Il tradimento sconta lo
    score (`× s.tradimento − BETRAY_RELUCTANCE`), così si tradisce solo per un bottino che
    vale molto più di una conquista qualunque; `best.tradimento` diventa il 7º argomento di
    `attack`. Guerra coordinata di base: `enemyThreat` **non** conta un partner di non
    aggressione come minaccia (confine tranquillo, niente presidio).
  - **La GUERRA è la regola, la diplomazia l'eccezione** (regola dell'utente: *"non voglio
    che i regni AI mandino sempre messaggi di alleanza a tutti quelli che incontrano;
    essendo un gioco di guerra, si deve fare la guerra"*). In `bot.js`, tre muri prima di
    qualsiasi patto — proposto **o** accettato:
    1. **La FEDE** (`faithFamilyOf` + `canDealWith`): fra famiglie diverse non si firma
       niente. Gli unici patti che scavalcano la fede sono quelli stretti da un **evento**
       (le crociate: `ctx.pact` in game-actions, che non passa di qui). La famiglia è quella
       della Capitale (§Religione); senza Capitale vale la fede **dichiarata** dalla dottrina
       e, in ultimo, la maggioranza delle province — un impero non diventa apolide perché
       gli hanno preso il seggio.
    2. **La DOTTRINA** (`js/doctrines.js`): un nemico dichiarato non si tratta mai; un amico
       storico si tratta sempre, fede o no. L'amicizia basta che la dichiari **una** delle
       due parti — la Castiglia non ha dottrina, ma il Portogallo la nomina amica e deve
       poterci firmare anche se ai suoi occhi è solo un vicino debole.
    3. **Il BISOGNO**, e solo quello: `diploProposals` compra pace **solo** da chi al confine
       è nettamente più forte (`minaccia ≥ nostra × PACT_NEED`, e almeno `PACT_MIN_THREAT`),
       non da chiunque passi, e mai oltre **`PACT_MAX` = 2** patti in essere. L'unico patto
       che un regno cerca senza esservi costretto è quello con l'**amico di dottrina**
       (`pattoAmico`: alleanza fra Selgiuchidi e Abbasidi, non belligeranza fra Portogallo e
       Castiglia).
- **Dottrine (`js/doctrines.js`)**: il **carattere storico** di un regno, sopra la sua
  strategia. Una strategia di `bot.js` dice COME si gioca; una dottrina dice PERCHÉ e CONTRO
  CHI, e serve ai regni che nascono per evento (vedi §Eventi). Modulo **puro** indicizzato
  per NOME di regno; l'unico che lo applica è `bot.js`, e un regno senza dottrina — cioè
  quasi tutti — non paga niente di tutto questo.
  - In `bestAttack`: `vietate` chiude una terra (la Danimarca dei nordici), `soloMare` vieta
    l'espansione via terra (il Portogallo conquista solo sbarcando), `conservatore` vieta di
    prendersela coi regni salvo nemici e mete, `mete` dà un premio grosso finché la provincia
    non è tua, `nemici` moltiplica il punteggio. Un **amico** si attacca solo *"se è
    assolutamente conveniente"*: stesso meccanismo del tradimento con un pedaggio più caro
    (`FRIEND_DISCOUNT`/`FRIEND_TOLL`), e l'eccezione è la **meta** — è per la Finlandia che
    Norvegia e Svezia si guarderanno male, e per Aleppo che i Selgiuchidi passeranno sugli
    Abbasidi.
  - **La MARCIA** (`marcia`, oggi la sola Orda Mongola): un binario di conquista in
    **tappe ordinate** `{peso, prov:[…]}`. Le sue province sono `mete` a tutti gli
    effetti — l'indice della dottrina le appiattisce lì dentro — ma ognuna pesa quanto
    la SUA tappa, e i pesi crescono verso la meta finale. `Doctrines.march(regno)`
    restituisce l'asse in fila: lo usa `js/events.js` per sapere dove cala l'armata di
    rinforzo dell'Orda, e resta l'unico posto dove il binario è scritto. `nessunPatto`
    invece chiude la diplomazia in blocco (bot.js, `canDealWith`).
  - **Coloniale** (oggi il solo Portogallo): la Nave (barca) fa le teste di ponte vicine
    come per ogni regno costiero, e il **Veliero** apre le **rotte lunghe** (§9.2) —
    `colonyShipPlan` lo arma, `colonyLaunch` lo fa **salpare PRIMA degli attacchi** (se no
    `bestAttack` se ne servirebbe come di uno scafo qualunque per il primo sbarco a tiro e la
    rotta lunga non partirebbe mai), `colonyLandings` sceglie dove scendere fra le coste
    avvistate. Ciurma minima `COLONY_CREW`, una rotta per volta, e `resourceNeed`/`coinReserve`
    mettono da parte legname e 4000 monete — ma la riserva scatta solo quando il legname c'è
    già, se no non si comprerebbe mai il legname con cui rendere il Veliero raggiungibile.
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
- **Espansione via mare: costruire navi e sbarcare** (regola dell'utente). Un regno
  costiero che ha finito le province a portata di TERRA non deve fermarsi —
  l'Inghilterra deve passare la Manica, i Fatimidi Gibilterra (e prendersi la Spagna,
  come nella storia). La macchina d'assalto sapeva già sbarcare (`attackTargets`
  restituisce i bersagli di mare con `viaMare`/`scafo`/`carico`, §9.2): l'unico pezzo
  che mancava ai bot era **costruire lo scafo**, quindi `bestAttack` finiva a vuoto e il
  turno moriva. Tre pezzi in `bot.js`, tutti nati guardando l'Inghilterra bloccarsi
  sull'isola:
  - **`shipPlan` arma una Nave** (`barca`, non il Veliero: costa poco — vedi
    `COSTS.barca`, 3 Legno e 1 soldato — e con portata 12 attraversa gli stretti) sulla
    costa da cui si raggiungono più **prede oltremare** (`seaPreyFrom`: coste
    nemiche/neutrali entro portata che la terraferma non tocca), con abbastanza uomini
    da riempire poi lo scafo. Non se ne arma un'altra se ce n'è già una **pronta a
    colpire** (`hasReadyShip`): prima si usa quella che c'è. Da lì l'attacco di mare lo
    fa `bestAttack` da sé, perché ora una nave è ancorata lì.
  - **`resourceNeed` compra il Legno** quando il regno "vuole il mare" (`wantsSea`): la
    barca non è in `s.build`, quindi senza questa riga il bisogno di Legno restava zero
    e un'isola senza foreste non attraversava mai il mare. Con essa, banca e carovane
    (§7) glielo procurano.
  - **Lo sbarco vale un premio a sé** in `bestAttack` (`+0.8` sui bersagli `viaMare`):
    oltremare la Popolarità non conta (la costa presa non è collegata, `popValueOf`
    tace), ma una testa di ponte è espansione vera — senza il premio un attacco di mare
    perdeva sempre contro qualsiasi conquista di terra e i bot restavano fermi.
  - **Solo la Nave, per ora**: il Veliero (4000 monete, portata 170) e le spedizioni
    oltremare (§9.2, rotte lunghe) restano dell'umano; i bot fanno lo sbarco entro
    portata, che basta per Manica e Gibilterra.
- **La personalità "Conservatore" NON esiste più** (regola dell'utente: difensivista e
  succube). `Bot.STRATEGIES` ha 4 profili — `espansione`, `costruttore`, `opportunista`,
  `predone` — e `KEYS` li deriva da sé. La difesa non è più una personalità: è
  l'istinto di sopravvivenza (`holdFloor`/`capitalGuard`) che vale per tutti.
- **Terre di nessuno presidiate** (regola dell'utente): ogni provincia neutrale ha
  `GameRules.neutralGarrison(turno)` soldati — 2 nei turni 1-10, 3 nei 11-20, e così via
  (`NEUTRAL_EVERY = 10`) **fino al tetto di `NEUTRAL_MAX = 6`** (regola dell'utente): dal
  turno 41 in poi non crescono più. Il 6 è il rovescio della soglia di razzia: 6 uomini ne
  spendono 5 (§5) e 5 non schiaccia 3-contro-1 due difensori, quindi **una provincia
  presidiata da 2 uomini non è più razziabile da nessuno per il resto della partita**. Chi
  alza il tetto alza anche `neutralSafeGarrison`, che è la stessa regola letta al rovescio. `GameActions.garrisonNeutrals()` è l'unico posto che li mette:
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
- **Eventi storici (`js/events.js`)**: il calendario datato della partita (crociate,
  mongoli, peste, Cent'Anni) sul calendario compresso, gemello di `Religions.SCHISMS`.
  `events.js` è **puro**: descrittori `{id, turn, fino, tipo, titolo, testo, nota, dato,
  onStart, onRound, onEnd}` + helper (`startingAt`, `activeAt`, `byId`) + i pianificatori
  puri (marcia dell'orda, contagio — arriveranno). L'**unico posto che applica** è
  `game-actions.js`: `applyEvents(turn)` (onStart di chi scatta + onEnd di chi chiude la
  finestra) e `tickEvents(turn)` (onRound), agganciati in `endTurn` nel blocco `giroFinito`
  **prima** di scismi/razzie/rifornimenti, così un'orda appena arrivata è già sulla mappa
  quando le neutrali si ricalcolano.
  - **L'orchestrazione vive nel descrittore, con `ctx`** (regola dell'utente): `onStart(ctx)`
    chiama i mutatori di `ctx` (`muster`/`assault`/`pact`/`notify`/`spawnKingdom`/`reinforce`…), che sono
    funzioni di game-actions — così il set-piece si legge tutto in un posto, ma le scritture
    restano concentrate. I verbi ancora non serviti sono segnaposto che **falliscono a voce
    alta** (`eventTodo`): un evento che li usi prima del tempo si vede subito.
  - **Lo stato che PERSISTE** vive in `R().eventi() = { attivi:[{id,dal,fino,stato}], fatti:[…] }`
    (accanto a `turnoDi`/`ordine` in app.js, nello snapshot/save, reset in `startGame` e
    `scenario.apply`). `fatti` è la **guardia anti-doppio-scatto**: uno spawn NON è
    idempotente. Un **one-shot** (`fino:null`) non entra mai negli `attivi`; solo i ticking
    (con `fino`) restano e prendono onRound/onEnd. tickEvents salta l'evento nel suo stesso
    giro di scatto (`rec.dal === turn`).
  - **Gli avvisi** al giocatore riusano il canale editti: `player.eventiAvvisi` (init in
    `normalizePlayer`), srotolati da `showPendingEventi` in player-board **in testa** alla
    catena di pergamene (un evento storico è il titolo del decennio), rispettando la nebbia.
  - **I bot reagiscono gratis**: un'orda che conquista al confine alza `enemyThreat` →
    `defenseFloor`/`holdFloor`, la peste che decima entra nei conti da sé. Niente rami `if`.
  - **Prima Crociata** (`prima-crociata`, turno 11 = ciclo 2, one-shot): al bando, due osti
    partono. **Mete scambiate per volere dell'utente**: `Impero Bizantino` da `Eastern_Thrace`
    (Costantinopoli) → **Palestine** (Gerusalemme); `Regno di Francia` → **Aleppo**. Ogni oste
    è `forza:10` **radunata drenando le VERE truppe** del regno (`ctx.muster`: §5 rispettato)
    — non è evocata. Da dove si preleva: Bisanzio ha una provincia fissa (`da:
    'Eastern_Thrace'`, la stessa che l'obiettivo bi2 chiede di riempire); la Francia ha
    una **`regione`** di candidate — le tre coste di `MED_FR` in `objectives.js`, lo
    stesso elenco dell'obiettivo fr1 ("raduna 10 uomini su una costa mediterranea") — e
    l'oste parte da quella dove il giocatore ha **davvero** ammassato più uomini, non da
    un punto fisso; se non ne ha preparata nessuna si ripiega sulla provincia più piena
    del regno. La Capitale non ha corsie preferenziali: prima le prelevava sempre a lei
    per prima, anche a scapito della provincia scelta per l'obiettivo. Poi
    `ctx.assault` la **sbarca all'assalto** (stessa battaglia dello sbarco d'editto:
    `applyBattleOutcome`, terreno del difensore, nessun vincolo di adiacenza/carico); se la
    meta è già del regno la rinforza invece di sprecarsi. Vinta → provincia del regno,
    superstiti di presidio, fede **convertita** (la fede segue la spada) e lock; persa → l'oste
    è perduta. Al turno 11 i due regni hanno una Capitale (costruita al turno 1), quindi la
    conversione a `cristiani` scatta; senza Capitale (test al turno 1) non c'è religione di
    stato e non converte — non è un bug. Infine `ctx.pact('Regno di Francia','Impero
    Bizantino','vista')` lega i due con la **sola vista condivisa** (`bondPact`, su entrambi):
    si vedono in Terra Santa ma possono comunque farsi guerra. Le mete sono neutrali sulla
    mappa iniziale, ma al turno 11 possono essere dei Califfati (Abbaside/Fatimide): l'assalto
    combatte chi le tiene in quel momento. (Difesa cristiana e riconquista araba del ciclo 2:
    obiettivi, ancora da fare.)
  - **Invasione mongola** (`invasione-mongola`, turno 25 = ciclo 3, ~1240): l'Orda
    **non è scriptata**: nasce un **regno nuovo governato dall'IA** con la strategia
    `predone` (regola dell'utente, cambiata in corsa: l'Orda deve arrivare, ma il
    giocatore non deve doverla manovrare in prima persona — prima nasceva `bot:null`,
    cioè in mano all'admin). `onStart` chiama `ctx.spawnKingdom(...)` con la
    Mongolia storica — **Urga** (Ulaanbaatar), **Uliastai**, **Buryatia**, tutte neutrali e
    lontanissime a est — **25 armate per stato** (75 in tutto: bastano ad attraversare il
    corridoio di neutrali fino all'Europa senza sciogliersi). Colore `#6b2b2b` (rosso-bruno di
    steppa, distinto dai 10 regni). **Nessuna pergamena globale**: la nebbia lo
    tiene segreto finché non arriva ai confini di qualcuno — il corridoio Mongolia→steppe
    kazake→Volga→Kievan Rus'→Polonia/Ungheria è tutto terra di nessuno, e i vicini si
    difendono da sé (`enemyThreat`/`holdFloor`).
    - **Il BINARIO della marcia** (regola dell'utente: l'Orda deve entrare in Europa
      da **Uralsk**, scendere su **Rostov** e sfondare nel **cuore dell'Europa
      centrale**) sta nella sua **dottrina** (`js/doctrines.js`, voce `Mongoli`),
      non in un motore a parte: è il campo `marcia`, tappe **ordinate** con un peso
      crescente verso occidente — la strada della steppa (Altai→Aktobe) vale 3, la
      porta d'Europa e il Volga 8, l'Europa centrale 10. Non serve un puntatore di
      tappa: la geografia le mette già in fila, e il peso dice soltanto che, potendo
      scegliere, l'Orda va a occidente invece di perdersi in Cina o in Persia.
      `Doctrines.metaWeight` legge il peso della tappa e **bot.js non cambia di una
      riga**. Nemici dichiarati Rus', Ungheria e Polonia (`pesoNemici`), e
      `nessunPatto: true` — l'Orda non firma niente con nessuno (`canDealWith` in
      `bot.js`, prima ancora della fede): un'Orda che compra pace dall'Ungheria si
      ferma proprio dove doveva sfondare.
    - **Le ONDATE** (regola dell'utente): l'evento **non è più one-shot** (`fino:
      100`, la finestra resta aperta per il resto della partita) e ogni **10 turni**
      il suo `onRound` cala un'**armata di 10 uomini** — i tumen che continuano ad
      arrivare dalla steppa. Non si spargono per il regno: `ctx.reinforce`
      (`eventReinforce` in `game-actions.js`) le versa sulla **punta della marcia**,
      cioè la provincia dell'Orda più vicina — in confini di terra — alla prima
      tappa non ancora conquistata. Il fronte si ordina con **una sola onda a
      ritroso dalle mete** (a pari distanza vince la più piena: si ammassa, non si
      sparge), e siccome una provincia non tiene più di 30 soldati (`pieceMax`) ciò
      che non entra nella punta **scende sulla provincia dietro** invece di
      svanire — il travaso si misura sul conteggio vero prima/dopo, così il tetto
      resta uno solo, quello del deposito. L'asse lo chiede a `Doctrines.march`: due
      elenchi di province in due file divergerebbero al primo ritocco.
    L'Orda **non entra nel sorteggio del regno umano** (`NON_SORTEGGIABILI` in
    `js/setup.js`, regola dell'utente): è un regno d'evento, e se resta
    sulla mappa da una partita precedente l'estrazione potrebbe darlo al giocatore.
    La sua strategia gliela dà l'evento (`predone`), non il sorteggio. Chiederla per id
    (`newGame({umano})`) resta possibile.
  - **La grazia dell'insediamento (§8) si conta sull'ETÀ DEL REGNO** (regola dell'utente),
    non su quella del mondo: `Popularity.graceBonus(turno, nato)` e `player.nato`, il turno
    di fondazione (1 per chi c'è dall'inizio, il turno dell'evento per chi nasce dopo —
    `eventSpawnKingdom` lo scrive, `setup.finalize` lo riazzera a 1 a partita nuova). Senza,
    l'Orda del turno 25 — e Selgiuchidi, Portogallo, Bulgaria, Norvegia, Svezia — nascerebbe
    a Popolarità 1 (niente strade, niente migliorie) senza i decenni di indulgenza che gli
    altri hanno avuto al turno 1.
  - **`spawnKingdom` (il verbo nuovo, `game-actions.eventSpawnKingdom`)**: crea un regno a
    partita in corso via `R().addKingdom({name,color,bot})` (app.js: come `addPlayer`, ma con
    nome/colore dati e ritorna il record — `initPalette`/`renderPlayerTabs` guardano l'elemento
    mancante, quindi vale anche nella plancia), gli posa le province con l'esercito del suo
    colore (una neutrale è un insediamento; le costruzioni, se ci fossero, restano e cambiano
    colore come in conquista), e lo **infila in coda all'`ordine`** (attivo dal giro dopo;
    l'append in fondo non sposta `primoDelGiro`, indice sul prefisso). **`endTurn` rilegge
    l'ordine VIVO** (`ordAfter = R().ordine()`) prima di ruotare nel blocco `giroFinito`: se
    no la copia locale catturata a inizio funzione clobbererebbe il regno appena nato.
    **Dove nasce davvero** (regola dell'utente: un regno nuovo non piove addosso a chi c'è):
    `soloLibere` scarta le province già di un regno, `ripiego` cerca per ognuna scartata una
    terra di nessuno **confinante** con quelle di partenza, `minProvince` è la soglia sotto la
    quale il regno **non nasce affatto** — se il posto è occupato, quella storia non accade.
    In più `monete`/`scorte` (il Portogallo nasce ricco e col legname) e `annuncio`, la
    pergamena che va **ai soli confinanti** (chi è lontano non deve saperlo: è la stessa
    nebbia che tiene segreta l'Orda). Nessuna Capitale in regalo: se la costruiscono da sé.
    Un regno **con lo stesso nome** già esistente viene RIUSATO invece di essere clonato — il
    nome è la chiave di dottrine e obiettivi, e due record omonimi le manderebbero in
    confusione (capita ricaricando la mappa iniziale: il calendario riparte, l'anagrafica no).
  - **REGNI CHE NASCONO A PARTITA IN CORSO** (regola dell'utente): non sono comparse, sono
    regni veri governati dall'IA che crescono lentamente di fianco ai giocatori. Il **quando
    e il dove** stanno in `events.js`, il **carattere** in `js/doctrines.js` (per NOME: i due
    file devono combaciare).
    - **Selgiuchidi** (turno 9 = 1080): Tabriz, Urmia, Erzurum, Diyarbakir, 6 uomini l'una,
      col ripiego su una confinante libera se una è occupata. Mete **Aleppo, Adana, Ankara**
      (le crociate del ciclo II), nemico dichiarato **Bisanzio**, amici gli **Abbasidi** (con
      cui cercano l'**alleanza**): musulmani convinti, coi cristiani non firmano mai.
    - **Portogallo** (turno 16 = 1150): Beira, Estremadura (la provincia "Portugal"), Alentejo
      con 5 uomini, **solo dove è libero** e senza ripiego — occupato il posto, non nasce.
      Parte con **2000 monete e 3 Legno**: `soloMare` + `conservatore` gli lasciano una cosa
      sola, sbarcare su **coste libere** (l'Africa con la Nave, l'oceano col Veliero), mai
      prendere terra ai vicini. Firma con la **Castiglia**, mai coi Fatimidi.
    - **Bulgaria** (turno 19 = 1180): nelle province ancora libere fra Moldavia, Bessarabia,
      Dobrudja e Wallachia (6 uomini); **nessuna libera = non compare**. Meta la **Bulgaria**,
      nemico l'**Ungheria**, poi `conservatore`: coi regni non se la prende più, e vive di
      commercio.
    - **Norvegia e Svezia** (turno 24 = 1230): due corone distinte da Western Norway e
      Gotaland, 8 uomini. Salgono a settentrione, la **Danimarca** (Jutland, Zealand, Scania —
      danese nel 1230) è terra **vietata**, e sono **amiche** fra loro: l'unica cosa per cui
      si guarderanno male è la **Finlandia**, che è `meta` di entrambe (l'amicizia non vale su
      una meta — è così che nasce la corsa).
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
  - **Il vincolo lega alla CORONA, non a un istante** (bug segnalati dall'utente: "la regola
    si perde nel corso del gioco"). Il vincolo di conquista (`data-fede-conq`) è un aggancio
    al regno che tiene la provincia, e ogni punto in cui quell'aggancio poteva restare orfano
    è chiuso — tutti nei posti dove la regola già viveva, non in un guardiano a parte:
    - **Lo scisma raggiunge la CAPITALE anche se vincolata** (`isCapitalSeat` in
      `applySchisms`): un seggio può benissimo sedere su terra conquistata (Capitale nemica
      promossa, o trasloco su una Città di conquista). Se il vincolo valesse anche lì, quel
      regno resterebbe fuori da ogni scisma per sempre — e con lui tutto l'impero, che via
      `syncConquestFaiths` segue la sua Capitale. Era il modo principale in cui la regola si
      perdeva a metà partita.
    - **Il riallineamento è IMMEDIATO quando la corona si muove**: `Risiko.syncStateFaiths()`
      (la stessa passata di `syncConquestFaiths`, esposta) la chiamano `seatCapital` (quindi
      `moveCapital` e `resolveCapital`) e la costruzione della **prima** Capitale — da lì in
      poi il regno ha una fede di stato e le sue conquiste devono seguirla nello stesso
      istante, non al prossimo giro completo con la mappa che nel frattempo mente.
    - **Il vincolo si SCIOGLIE quando la provincia perde il padrone**: razzia neutrale
      (`neutralRaids`), editto che la rende terra di nessuno, regno che nasce su una libera
      (`eventSpawnKingdom`). Una neutrale non è agganciata a nessuna corona: se resta
      vincolata, nessuno scisma la tocca più e nemmeno `syncConquestFaiths` può rimediare,
      perché non c'è un proprietario a cui riallinearla. La fede ci restava congelata per il
      resto della partita.
    - **L'editto non è una porta di servizio**: `handOver` applica al passaggio di mano senza
      battaglia (assegna una provincia / consegna in regalo) la stessa regola della conquista
      — converte alla fede di stato del nuovo padrone e vincola. La fede si legge **prima**
      del `setOwner`, come in `applyBattleOutcome`, per lo stesso motivo (se la provincia
      ospita una Capitale, un attimo dopo `getCapitalPathFor` leggerebbe quella).
    - **Una partita nuova riparte dalle confessioni del Mille**: `Risiko.resetReligions()`
      (riseminata da `Religions.seedFaith`, vincoli azzerati) chiamata da
      `GameActions.startGame`, dov'è il calendario a tornare al turno 1. Senza, la partita
      nuova cominciava nel 1000 con l'Inghilterra **protestante** — la Riforma della partita
      precedente era rimasta scritta sulla mappa — e gli scismi a calendario non trovavano
      più niente da spezzare.
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
  - **Le province conquistate seguono la CORONA, non restano congelate** (fix di un bug
    segnalato dall'utente): "segue la spada" vuol dire seguire la fede di stato corrente
    del regno, non il valore fissato al momento della presa. La Capitale, in casa propria,
    non è mai `data-fede-conq` e quindi **uno scisma geografico la tocca** — se il regno
    aveva conquistato province mentre era ancora, poniamo, `cristiani` generico, e poi il
    Grande Scisma spacca la sua Capitale in `ortodossi`, quelle province restavano
    indietro sul vecchio `cristiani` (una fede che dopo lo scisma non esiste più in nessun
    regno). `syncConquestFaiths` (app.js, chiamata da `applySchisms` ad **ogni giro
    completo**, scisma o no) riallinea ogni provincia `data-fede-conq` alla
    `stateReligionOf` corrente del suo proprietario — così anche il disallineamento di una
    partita già in corso si ripara da solo al giro successivo, senza bisogno di un editto.
    Chi non ha (più) una Capitale non ha fede di stato e resta come sta.
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
- **Spedizioni oltremare — rotte lunghe del Veliero (§9.2, regola dell'utente)**: oltre
  allo sbarco entro la portata, in fase `attacca` un **Veliero** può **salpare per una
  rotta lunga** che NON si conclude nel turno. Si sceglie una **direzione** (uno degli 8
  punti cardinali) e la nave, in mare aperto, **naviga di turno in turno alla ricerca di
  una costa**: ogni proprio turno avanza di una portata piena (`advanceExpeditions` in
  `beginTurn`), scoprendo le coste che le entrano nel raggio, finché il giocatore non
  decide di **approdare** su una terra avvistata. È una scoperta: la meta è ignota (le
  portate del §9.2 lasciano fuori mezzo mondo a un Veliero fermo — la rotta lunga è il
  modo di attraversare un oceano, un decennio per volta). **Solo l'umano** per ora (i bot
  no, come per le spie).
  - **Vivono nel record del giocatore**, non su un path: `player.spedizioni =
    [{id, dir, carico, merc, x, y, turno}]` — sono in mare aperto, fuori da ogni provincia,
    quindi non hanno un `data-ships` su cui appoggiarsi. `x,y` sono in coordinate SVG.
    Persistono nel salvataggio come le spie (`normalizePlayer` le inizializza).
  - **La geometria sta in `sea-routes.js`**, un posto solo: `floodWater` è il Dijkstra
    sull'acqua condiviso (lo usa anche `distances`); `sail(x,y,dir,range)` avanza alla
    cella d'acqua raggiungibile entro la portata che va **più lontano nella direzione**
    voluta (massima proiezione sul versore) **seguendo l'acqua** — gira le penisole, non
    attraversa la terra, e se è imbottigliata resta ferma; `reachFromPoint(x,y,r)` (e la
    sua versione cached, obbligatoria nella nebbia) dà le coste che una spedizione ferma
    lì avvista/raggiunge.
  - **Le regole stanno in `game-actions.js`**: `launchExpedition` (uomini e nave lasciano
    la provincia rispettando il presidio §5 e la quota di ventura §5.3, il Veliero sparisce
    dalla costa), `expeditionTargets` (le coste in vista: `mia`=rinforzo, le altre uno
    sbarco d'assalto col terreno del difensore), `expeditionLand` (stessa regola di
    conquista di `attack` via `applyBattleOutcome`; sbarco **totale**, niente
    `player.conquista`; vinta la nave ancora sulla costa presa, persa è perduta col carico),
    `steerExpedition` (cambia rotta senza avanzare), `advanceExpeditions` (chiamata da
    `beginTurn`). L'approdo su costa propria è un rinforzo senza battaglia.
  - **Naufragi e morìa in mare aperto (regola dell'utente)**: più a lungo una spedizione
    resta al largo, più il mare la logora. Ogni avanzamento (`advanceExpeditions`)
    incrementa `exp.turniInMare` e, PRIMA di far rotta, tira il pedaggio: a `t` turni si
    estrae `r∈[0,1)` e muore il `10%·L` della ciurma, con `L = max(0, t − ⌊r/0.15⌋)`
    (`wreckTollFraction`, costanti `WRECK_STEP=0.15`/`WRECK_TOLL=0.10`). Ne esce esatta la
    tabella voluta — `t=1` 15% perde il 10%; `t=2` 30% il 10% e 15% il 20%; a `t=7` la
    perdita è certa (verificato con Monte Carlo). Le perdite colpiscono i **mercenari per
    primi** (§5.3), come in battaglia; se portano via tutta la ciurma è il **naufragio** e
    la spedizione sparisce. Il giocatore lo scopre all'apertura del proprio turno con la
    pergamena (`showPendingWrecks` in `player-board.js`, tipo `naufragio` di `showFoundation`):
    gli avvisi vivono in `player.spedizioniAvvisi` come gli editti (`letto` + potatura,
    `normalizePlayer` li inizializza) — il mare non cambia le cose di nascosto. I bot non
    lanciano spedizioni, quindi il pedaggio è per ora solo dell'umano.
  - **La nebbia e il marker sono in `app.js`**: `computeVisibleProvinces` aggiunge alla
    `haze` le coste avvistate da ogni spedizione del regno che guarda (bandiere, non
    guarnigioni, come una nave ancorata); `renderExpeditions` disegna una pedina-Veliero al
    (x,y) col carico nel pallino, **solo** per il regno focalizzato (una spedizione nemica
    non si vede, come le spie). Primitive del motore: `engine.seaAnchor/sail/reachFromPoint`.
  - **La UI è in `player-board.js`**: il **lanciatore** (bussola a rosa dei venti + carico)
    vive sotto la scelta del Veliero in `attackGroup`; le spedizioni **già in mare** hanno
    un gruppo tutto loro (`expeditionsGroup`), mostrato via `maybeAppendExpeditions` anche
    **a selezione vuota** (non appartengono a una costa) — con le coste avvistate, la
    probabilità di sbarco (col terreno) e la bussola per cambiare rotta.
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
- **Obiettivi di prestigio: il BINARIO STORICO (`js/objectives.js`, §10)**. Gli obiettivi
  non sono tre righe fisse per (regno, ciclo): ogni regno ha un **binario**, la sequenza
  dei capitoli della sua storia, e il binario **non è indicizzato per ciclo** ma per dove
  il regno è arrivato nella PROPRIA storia (`player.capitolo`). Chi compie un capitolo
  **avanza** al successivo; chi non ce la fa lo **rifà** a intensità minore; chi crolla
  **arretra**. Due conseguenze, che sono le due cose per cui il sistema esiste (regola
  dell'utente): chi corre non trova obiettivi già completati — riceve il pezzo di storia
  successivo, non un numero più grande a caso — e chi è martellato non resta indietro per
  sempre, perché rifà un capitolo che PUÒ fare. L'adattamento cambia il **passo** e
  l'**intensità**, mai il soggetto: il filone storico guida tutto.
  - **Un capitolo = tre voci** (Primario 5 · Secondario 3 · Terziario 2, il §10 intatto:
    cap 10 per ciclo, handicap puro — i punti non scalano con l'ambizione, il prestigio
    misura quanto bene hai giocato la TUA posizione, non quanto sei grande).
  - **Ogni voce è un TEMPLATE + argomenti JSON**, non una closure. I 22 archetipi
    (`regione`, `provincia`, `provCount`, `guarnigioni`, `oro`, `scorte`, `citta`,
    `cittaRegione`, `navi`, `naviTipo`, `popolarita`, `benessere`, `tutti`…) coprono
    tutti e 60 gli obiettivi del foglio e i capitoli lunghi. Ognuno dichiara una
    `misura(ctx)` e il test è **sempre** `misura ≥ soglia`: è questa uniformità che
    rende possibile generare, perché la stessa funzione che dice SE è fatto dice anche
    DOVE SEI. I `SETS` si citano **per nome** (`{set:'IBERIA'}`), così un'assegnazione
    si serializza e vive nel salvataggio; `hint` li risolve indietro e `bot.js` legge
    gli stessi `Set` di prima — ma li legge da `ev.items[].hint`, **non** più da un
    catalogo per nome di regno, che non esiste più.
  - **Le tre INTENSITÀ** (`resistere` · `avanzare` · `eccedere`) sono lo stesso capitolo
    a tre scale: l'autore scrive **tre ancore e un passo** per voce, e l'ancora
    `avanzare` È il numero del foglio Obiettivi.xlsx. L'intensità è una **scala** e si
    sale o si scende di un gradino per volta: con un interruttore acceso/spento il regno
    oscillava — a `resistere` faceva un obiettivo, veniva ripromosso, falliva tutto,
    ricadeva, per l'intera partita senza mai concludere un capitolo.
  - **La soglia** (`Objectives.soglia`) è tre vincoli insieme: mai sotto l'ancora
    dell'intensità, mai già completata alla nascita (`misura + passo`), sempre dentro la
    **banda** fra `resistere` e mezza volta `eccedere` — la banda è il guinzaglio
    dell'autore, ed è lei a impedire che il generatore derivi lontano dal bilanciamento
    tarato a mano. Il `+ passo` vale solo per quel che si **conquista o si costruisce**:
    oro, scorte, Popolarità e Sicurezza sono livelli da **tenere**, e lì la soglia
    arriva a dove sei e si ferma (se no un tesoro chiederebbe di non spendere mai e una
    scorta di non costruire mai). Il passo si allunga col **ritmo** del ciclo scorso
    (`Objectives.ritmoDa`, dalle province) e col gradino (`K_TIER`: al Primario si
    chiede di fare meglio, al Terziario di reggere).
  - **Il puntatore** è `Objectives.passo`, puro. Il numero del ciclo entra **solo come
    freno** (`FRENO = 2`: il capitolo non supera il ciclo di più di due). Il capitolo
    salta oltre quando è già stato **superato** dai fatti (`Objectives.superato`: la
    meta del Primario è oltre l'ancora `eccedere`) — è così che la storia di chi corre
    accelera invece di ripetersi gonfiata.
  - **Lo stato sul giocatore**: `capitolo`, `intensita`, `obiettiviCiclo`
    (l'assegnazione in corso, serializzabile), `cicliStorico` (il registro di
    performance su cui il puntatore si muove — non esisteva niente del genere,
    `TURN_HISTORY` conserva solo i proprietari delle province), `obiettiviStorico`,
    `obiettiviAvvisi`. Inizializzati in `normalizePlayer`, quindi persistono da soli.
  - **Chiude il ciclo `GameActions.closeCycle`**, nel blocco `giroFinito` di `endTurn`
    dopo eventi, scismi, razzie e rifornimenti. È l'unico punto che archivia e che muove
    il puntatore. Prima lo faceva il **render** della plancia (`archiveCyclesIfNeeded`,
    tolto): dipendeva da chi apriva il pannello e rivalutava i cicli passati sullo stato
    di ADESSO invece di fotografare la fine del ciclo.
    **Le assegnazioni si catturano PRIMA di `advanceGlobalTurn`** (`grabAssignments`):
    da lì in poi il calendario è nel ciclo nuovo, e qualunque render che passi in mezzo
    — un evento, uno scisma, una razzia ridisegnano tutti — farebbe rigenerare
    l'assegnazione per il ciclo nuovo, cancellando le soglie con cui il ciclo che si
    chiude era cominciato. È un bug vero, visto succedere: un ciclo archiviato col
    numero sbagliato.
  - **`Risiko.objectiveContext`** è il solo ponte fra stato e regole (app.js misura, il
    modulo puro decide), e `objectivesFor` genera al volo se l'assegnazione manca —
    salvataggi anteriori al binario, partite già in corso. `archiveObjectives` è l'unico
    punto che tocca `puntiPrestigio`.
  - **L'INGHILTERRA è il primo binario steso per intero** (capitoli I-VIII; gli altri
    nove regni si fermano al II). La sua forma è il modello: II **sbarca** in Francia
    col raduno a Home Counties sotto (il continente resta leggero apposta — la guerra
    vera è il IV), III **tiene** le Fiandre più una provincia di `FRANCIA`, IV
    prende e difende l'Aquitania, V conquista **tutta l'Irlanda** con una Città (il
    capitolo più caro, ed è la cerniera: è lì che l'esercito lascia il continente, non
    per una regola che glielo impone) e mette da parte il legno del Veliero, VI-VIII
    sono una cosa sola in tre tempi — costruire il Veliero, portarlo in America e
    fondare, portarlo a oriente. Il *cosa* sta in `docs/BINARI_STORICI.md`, i numeri
    solo in `objectives.js`. Due template nuovi vivono da qui: `naviTipo` (scafi di un
    tipo solo — un Veliero non è una barca più grande) e `cittaRegione` (una Città
    dentro una regione: quale provincia lo decide dove approda la nave, quindi il
    capitolo non può nominarla). `naviTipo` chiede a `objectiveContext` la lettura
    nuova `shipCountOf(kind)`, che legge `data-ships`.
  - **Un Terziario non è un obiettivo vecchio rifatto** (regola dell'utente): chiedere al
    capitolo V «9 province britanniche» a chi al I ne doveva prendere 7 non chiede niente.
    Il contrappeso a un secolo di guerra sono **Popolarità e Benessere**, e vanno messi
    **spesso** — sono le sole voci che un regno perde davvero mentre conquista. Perciò
    esiste il template `benessere` accanto a `popolarita`/`sicurezza`: è la componente
    del §8 che **non** si compra con la guardia (sale solo collegando risorse e cibo, §4),
    e `objectiveContext` la espone come `benessere()` leggendo `Popularity.score`. Nel
    binario inglese ricorrono a III (Popolarità), V e VIII (Benessere). Il `hint`
    `{welfare:n}` entra in `objectivePopTarget` di `bot.js` come gli altri due.
  - **Un regno senza binario** (Selgiuchidi, Portogallo, Bulgaria, Norvegia, Svezia,
    Orda: nascono per evento) resta senza obiettivi, senza rompere niente. Il pool
    condiviso di riscossa che li raccoglierà non c'è ancora.
  - **Quel che il puntatore NON risolve**, ed è voluto saperlo: un regno ridotto a una
    provincia continua a prendere zero. Le soglie scendono fino al pavimento
    dell'autore, ma «unifica l'isola» resta impossibile per chi ha perso l'isola — non è
    il numero a essere sbagliato, è l'obiettivo. Servono le **deroghe** (raggiungibilità,
    binario tematico, pool di ultima spiaggia), che sono il pezzo successivo.
  - **Come si tarano le curve senza giocare cento turni**: `objectives.js` esporta
    `module.exports`, quindi gira in Node: `node scripts/binari-sim.js "Regno di
    Castiglia"` simula tre regni — uno che corre, uno che arranca, uno che crolla —
    per dieci cicli e stampa capitolo, intensità e le tre
    soglie generate. È così che si è vista l'oscillazione dell'intensità, che in partita
    sarebbe costata decine di turni per accorgersene.
  - **LA LEVA: un obiettivo compiuto vale UOMINI** (regola dell'utente). Il prestigio è una
    promessa lontana — e oggi per giunta sospesa — quindi un obiettivo paga **subito**, in
    soldati: tanti uomini quanti erano i suoi punti (5 · 3 · 2, al massimo **10 per ciclo**),
    versati nelle **reclute libere** e schierabili dal **primo turno del ciclo successivo**
    (le libere si sommano e non scadono, quindi basta versarle a fine ciclo). È un handicap
    come il punteggio: dieci uomini sono mezzo ciclo di reclutamento per un regno da sei
    province, un'inezia per chi ne ha trenta.
    - Il **conto** è puro (`Objectives.leva(snap)`, `LEVA_PER_PUNTO`); a **versare** gli
      uomini è `GameActions.closeCycle`, dentro la stessa guardia che archivia il ciclo —
      così non si paga due volte. **Non** in `archiveObjectives` (app.js): quella la chiama
      anche la migrazione dei salvataggi vecchi, e un ciclo ricostruito a posteriori non ha
      mai versato uomini a nessuno; closeCycle timbra la leva sul record che archiveObjectives
      restituisce (`rec.leva`, per lo storico della plancia).
    - **I bot la incassano gratis**: `deployPlan` legge lo stesso serbatoio
      `recluteDaSchierare`. Nessun ramo `if` in `bot.js`.
    - **Non compaiono di nascosto**: `player.obiettiviAvvisi` (il canale c'era già,
      inizializzato e mai usato) e `showPendingLeva` in player-board srotolano la pergamena
      *"La leva risponde alla corona"* all'apertura del primo turno del ciclo nuovo, **ultima**
      della fila delle pergamene (evento, editto, naufragio, commercio, patto, manutenzione).
      Nel foglio 👑 la riga `.bo-leva` dice quanti uomini valgono gli obiettivi **già**
      compiuti; lo storico segna la leva incassata a ogni ciclo.
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
  - **In vista generale si vede SOLO la mappa** (scelta dell'utente): entrando,
    `syncPanelsForSpectate` in `player-board.js` chiude il foglio aperto, il pop-up dei
    costi e la colonna del turno, e spegne i confini segnati (non c'è un "tuo" confine
    da marcare senza focus). La barra in alto **resta**: è da lì che si torna al regno e
    si cambia la velocità dell'IA. Uscendo, la colonna del turno torna **come stava**
    (`rightBeforeSpectate`), così rientrando non si riapre quel che era chiuso a mano.
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
  `renderBattle()` in `player-board.js`. **La scheda è OPZIONALE e non si apre mai da
  sola** (regola dell'utente): `#bp-battle-title` è un pulsante ("▸/▾ Ultima battaglia —
  vinta/persa") che appare solo se c'è una battaglia da rivedere, e il riquadro
  `#bp-battle` resta chiuso finché non lo si apre (stato `battleOpen`, che `run()` azzera
  a ogni nuova battaglia — non deve saltare fuori). La **scena** sulla mappa
  (`playBattleFx`) invece parte sempre: è l'azione, non un rapporto.
  - **La scena si deve VEDERE, e l'esito arriva DOPO** (regola dell'utente). I tempi
    stanno in **un posto solo**, `BATTLE_FX_MS` (5,2 s) + `BATTLE_FX_SETTLE` (0,9 s di
    respiro) in `app.js`, esposti come `Risiko.battleFxBusy()` / `Risiko.battleFxMs()`:
    chi mostra un pop-up dopo una battaglia **chiede**, non indovina un numero suo. Le
    misure CSS in `style.css` (carica 1 s, scossa 0,7 s, caduti 2,5 s) sono l'altra metà
    degli stessi secondi — chi tocca l'una guardi l'altra o le due si sfasano.
    Nell'ordine: carica (tre lame sfalsate, non una), impatto a 1 s, caduti a 1,25 s,
    verdetto **staccato** a 1,75 s. Il messaggio in basso (`showNotice`) esce col
    verdetto, non col click: prima diceva com'era finita mentre le lame correvano ancora.
  - **Una presa appena fatta non apre la modale al primo render**: `attack()` salva e
    ridisegna la plancia **prima** di restituire il risultato, quindi in quel render la
    scena non è ancora partita e `battleFxBusy()` direbbe di no. `showConquestPrompt`
    (player-board) lascia passare un battito (`conquestSeen`) e ricontrolla: a quel punto
    aspetta la fine della scena come deve.
- **Il suono della battaglia (`js/audio.js`, richiesta dell'utente)**: appena l'attacco è
  commissionato si sentono le **urla**. `playBattleFx` chiama
  `RisikoAudio.battleCry({scala})` con la scala presa dagli uomini impegnati: è l'unico
  aggancio, quindi vale anche per gli attacchi dei bot e per il ↺ del rapporto.
  - **Niente file audio**: il grido è sintetizzato con WebAudio, come la grana della carta
    si cuoce in un canvas (`map-decor.js`). Nessun asset da servire, nessuna CDN.
  - **Una folla NON è rumore** (imparato sbagliando: la prima versione, rumore filtrato che
    gonfiava e calava, suonava come il **mare**). Il grido è fatto di **gole**: corno di
    guerra, due colpi di tamburo, una **salva** compatta di 5-8 voci all'unisono e poi una
    **folla sfasata** che continua — è lo sfasamento a fare la massa —, infine l'acciaio.
    Ogni gola ha attacco **consonantico** (30 ms di rumore, la "R" di RAAAH), tre
    **formanti** di /a/ aperta e un **rasp** (waveshaper): un urlo è una voce forzata.
  - **L'interruttore è di chi guarda**: `#board-sound` nella barra della plancia, stato in
    `localStorage`, non nello stato di partita (come la velocità dell'IA). Il contesto
    audio si apre al primo clic o tasto: i browser non lo lasciano nascere prima.
  - Come si verifica senza sentire: si rirende `battleCry` in un `OfflineAudioContext` e si
    misurano picco e **zero-crossing rate** per finestra — nell'attacco deve stare in banda
    vocale (~700-1600 Hz). Se sale a 4-5 kHz nei primi 0,5 s, è tornato a essere rumore.
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

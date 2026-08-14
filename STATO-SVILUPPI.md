# RISIKO ONLINE — Stato e sviluppi

Documento di stato **condiviso tra tutte le chat**. Riporta la versione attuale del gioco
e dei suoi sistemi. Va aggiornato **ogni volta che si fa un progresso** (in qualunque chat),
e in particolare al momento del commit.

- **Ultimo aggiornamento:** 2026-08-13 (nomi latini di oceani e mari sulla carta)
- **Branch corrente:** `feat/partita-giocabile`
- **Ultimo commit:** vedi `git log` — Pedine scontornate e ancoraggi (niente truppe in mare, navi in acqua aperta)

## Sistemi in gioco (stato attuale)

- **Mappa interattiva** — SVG storica embeddata (`data/embedded_map.js`), province
  selezionabili, colori, nomi ingranditi, scaling del pannello col ridimensionamento.
- **Giocatori e turni** — gestione giocatori, turni, colori, UI.
- **Risorse** — sistema risorse per provincia; nebbia via terra.
- **Religione** — ogni provincia ha una fede (`data-religione`), ogni regno ha la
  religione di **stato** = quella della sua Capitale. Al Mille i cristiani sono un
  popolo solo (`cristiani`), l'Islam è già diviso (sunniti/sciiti). Assegnazione di
  partenza in due passi (`js/religions.js` + `data/start_religions.js`): eccezioni per
  nome nelle frontiere fini (Al-Andalus, Sicilia degli emiri, Terra Santa fatimide,
  Baltico pagano, Etiopia copta) e blocchi regionali per coordinate per tutto il resto.
  Tre effetti: **scismi** su calendario compresso (Grande Scisma turno 5, Riforma
  turno 12, Wahhabismo 16, Vecchi Credenti 18) che spezzano una fede e srotolano una
  pergamena; **terre di nessuno per fede** (una neutrale della tua religione ti lascia
  in pace, una di fede diversa può razziarti e, se vince, si **riprende** la provincia);
  **vista mappa per fede** (bottone ☩, colora per religione invece che per regno).
  Ganci pronti per gli obiettivi di prestigio "conquista N province cristiane/arabe"
  (`Risiko.provincesByFamily`, `Religions.sameFamily`).
- **Popolarità e Prestigio** — definiti a design; prestigio convertibile in punti d'oro.
- **Figure di gioco (pedine)** — aggiunte con editor sulla mappa (WIP). Ogni pedina è
  **scontornata di nero** (strato di contorno in `data/piece_icons.js`, costanti `PC_INK`
  / `PC_OUT` / `PC_LINE`): si legge anche de-zoomando e anche quando la provincia ha lo
  stesso colore del giocatore. **Dove** si posano lo decide `js/map-anchors.js`: ancora
  di terra sempre dentro la provincia (prima era il centro del bounding box, che su
  Messico & co. cadeva in mare) e approdo delle navi in acqua aperta verificato contro
  tutte le province. **I laghi non contano come mare** (Ciad, laghi finlandesi, Grandi
  Laghi, fessure fra province): le province costiere sono passate da 447 a 364 e la
  regola vale anche per `canPlacePiece`, quindi lì le navi non si possono proprio
  costruire. Gli approdi si tengono **staccati fra loro** (anticollisione): niente più
  flotte sovrapposte nello stesso braccio di mare. Numeri: su 628 province, col criterio
  vecchio la pedina cadeva fuori dalla provincia in **48** casi, ora in **0**; navi
  finite su terra: **0**. Controllo ripetibile: `/_diag-anchors.html`.
- **Motore di battaglia / Combattimento** — modello probabilistico con bonus difensivo
  ridotto, ora collegato alla UI (vedi sotto).
- **Terreno delle province** — ogni provincia della mappa è `chiuso` (monti, gole,
  foreste, paludi) o `aperto` (pianure, steppe, deserti aperti): **628 su 628 assegnate**
  a mano su base geografica e storica in `data/province_terrain.js` (326 chiuse, 302
  aperte), regole in `js/terrain.js`. Non è un bonus difensivo ma **quanto conta il
  numero**: cambia l'esponente della formula, `P_A = A^k/(A^k+Deff^k)` con k=1.4 in
  chiuso e k=2.6 in aperto (prima era sempre il quadrato). Decide il terreno della
  provincia **attaccata**. Un 3-contro-1 vale 82% in montagna e 95% in pianura: da
  Bavaria, con 4 truppe contro 2 difensori, Bohemia (chiusa) dà 73% e Franconia (aperta)
  86%. Il pronostico della plancia, il rapporto di battaglia e i **bot** passano tutti
  dalla stessa `RisikoBattle.winChance`, quindi nessuno può mentire sulla percentuale.
  Nuova **vista mappa per terreno** (bottone ⛰, plancia ed editor), esclusiva con quella
  per fede. Criterio d'assegnazione documentato in testa al file di dati.
- **Plancia giocatore (`play.html`)** — pagina separata dall'editor: si apre col link
  d'invito (`play.html?p=CODICE`), inquadra la mappa sulle province del giocatore e mostra
  due pannelloni ancorati. `index.html` resta l'editor dell'admin; link di ritorno
  "🛠 Editor" nella barra della plancia, visibile solo all'admin. Calcoli in
  `js/kingdom-stats.js` (puro), render in `js/player-board.js`, palette centralizzata
  in `css/tokens.css`.
- **Struttura dei pannelli (rifatta)** — durante il turno non si scorre più per cercare
  le cose.
  - **Destra**: in alto un **cruscotto fisso** (oro + entrata, soldati + guardia della
    Capitale, **fede di stato**, striscia delle scorte) che non scorre mai; poi le
    quattro fasi come **cartelle cliccabili** (`#bp-phases`) di cui se ne apre una per
    volta nel corpo (`#bp-body`); in fondo, fisso, il bottone di avanzamento di fase.
    Aprire una cartella che non è la fase in corso è **sbirciare**: i comandi sono
    spenti e un avviso dice perché, col bottone per tornare. Elenco province,
    territorio/rinforzi e legenda costi sono cartelline richiudibili in coda.
  - **Sinistra**: Popolarità (e, quando torneranno, gli **obiettivi di prestigio**)
    prendono tutto lo spazio; regni in gioco e registro dell'IA scendono in fondo, in
    cartelline richiudibili con un tetto d'altezza.
  - **Entrambi i pannelli si chiudono** dalle linguette ai bordi della mappa: chiusi,
    la loro colonna va a zero e la mappa si prende tutto lo schermo.
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

- **Mappa iniziale (nuovo)** — `js/start-map.js` + `data/start_map.json`. La posizione
  di partenza si dipinge a mano nell'editor e si mette in cassaforte: 🧹 svuota la mappa,
  📌 la salva, 🗺 la rimette identica. Serve a provare l'IA e poi a giocare la partita
  vera sulla **stessa** mappa, con le stesse condizioni. Nel file entrano solo
  proprietari, risorse, pedine, strade e l'anagrafica dei regni: chi la carica torna a
  "partita non avviata" al turno 1 e comincia da `⚔️ Gioca con l'IA (mappa attuale)`.
  Il salvataggio è **un click**: `scripts/serve.ps1` risponde a `POST /_start-map` e
  scrive lui il file in `src/data/` (fuori dal server locale si ripiega sul download).
- **Partita contro l'IA (nuovo)** — `js/bot.js` + `js/setup.js`.
  - **Avvio normale** (bottone ⚔️ nell'editor): si gioca **la mappa che c'è**, con i regni
    già dipinti e i loro confini. A chi non ha una Capitale viene data nella provincia più
    interna, l'economia torna ai valori del §11, il calendario al turno 1, un regno a caso
    è l'umano e gli altri li governa l'IA.
  - **Fix: lo stato salvato non si caricava più.** Gli alias di geometria verso
    `MapAnchors` erano `const arrow` dichiarati sotto il punto in cui `initMap()` li usa:
    zona morta → "Cannot access before initialization" → `loadAutoSave` falliva in
    silenzio (try/catch) e la plancia diceva "Partita non avviata" a partita avviata.
    Ora sono `function` (hoistate).
  - **Sorteggio** (bottone 🎲, l'eccezione): sparecchia la mappa, sorteggia 10 feudi da
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
- **Guardare l'IA senza essere trascinati (nuovo)** — la **telecamera non si muove più da
  sola**: `fitToProvinces` è sparito dagli attacchi (propri e dell'IA) e dalla fondazione
  delle città; resta solo sul bottone ↺ del rapporto di battaglia e al primo ingresso nel
  proprio regno. La **scena della battaglia** invece si vede sempre, anche quando attacca
  l'IA: disegna sulle province dove sono, senza inquadrare. Quello che l'IA combina si
  legge nel **registro** del pannello sinistro (`#bp-ailog`).
  **Il racconto rispetta la nebbia**: registro e scena mostrano solo le azioni che toccano
  una provincia visibile, e il conteggio delle province altrui è nascosto finché non si
  passa alla vista generale (🌍). Ogni azione di `game-actions.js` porta con sé la
  provincia (`prov` / `provs` / `fromId`+`toId`), che è quello che permette il filtro
  (`Risiko.isVisible`).
  **Prestazioni**: `refreshMapDisplay` — che gira dopo ogni singola azione, quindi anche
  dopo ogni mossa di ogni bot — costava **1060 ms** perché cercava i marker con due
  `querySelectorAll` per provincia (1256 query a refresh). Con l'indice dei marker in una
  passata sola è passato a **21 ms**: un'azione di bot sulla plancia costa ora ~25 ms
  in tutto (13 dei quali sono il render dei pannelli).
- **Vista generale nella plancia (nuovo)** — bottone 🌍 nella barra: toglie la nebbia e
  mostra tutta la mappa per guardare giocare l'IA; 👑 riporta al proprio regno. Non cambia
  i permessi, solo cosa si vede.
- **Prestigio sospeso** — `GameRules.PRESTIGE_ENABLED = false`: non si accumula e il blocco
  sparisce dalla plancia. Il codice e il §10 restano al loro posto.
- **Fix adiacenze** — l'alone costiero (`map-decor.js`) è un clone di `#map-group` senza id
  ma con la stessa classe `state`: entrava nel grafo dei confini come un nodo `""`
  confinante con tutto il mondo. Ora l'elenco delle province passa da `provincePaths()`
  (solo path con id) in `js/app.js`.
- **Zoom fluido sulla mappa (nuovo)** — entrare nella mappa e zoomare sulle province era
  una sequenza di scatti. Il conto lo facevano i **filtri SVG**, che il browser rifà da
  capo a ogni cambio di scala, cioè a ogni tacca di rotella (~29 per attraversare tutta
  l'escursione di zoom). Tre interventi:
  - la **grana della carta** non è più un `feTurbulence` steso su tutto il fondale
    (4800×3000 unità di rumore frattale a 4 ottave, rigenerate a ogni scatto): ora
    `bakeGrain()` in `map-decor.js` cuoce **una volta sola** una piastrella 256×256 di
    rumore ciclico (~55 ms al caricamento) e la ripete con un `<pattern>`;
  - l'**alone costiero** — 628 path clonati dentro due sfocature — si spegne mentre si
    zooma o si trascina (classe `.map-interacting`) e torna 140 ms dopo l'ultimo
    movimento;
  - il **`viewBox` si riscrive una volta per frame** invece che a ogni evento di rotella.
  La carta resta identica: confronto pixel su mare e alone, scarto ≤1/255 sull'alone.
- **Fix alone color sabbia** — il seed iniziale in `initMap` usava ancora
  `querySelectorAll('path.state')` crudo e ridipingeva i 628 path dell'alone costiero
  con il fill delle province. Non si vedeva solo perché la `feColorMatrix` del filtro
  reimpone la tinta blu. Ora anche quel ciclo passa da `provincePaths()`.
- **Commerci (nuovo, §7)** — il **Mercato** (ora **800 monete** + 4 soldati) apre due
  canali, tutti e due dentro la **fase costruzioni**, nella sezione "Commerci" del pannello
  destro (`#fase-commerci`/`#bp-trade`, `renderTrade` in `js/player-board.js`):
  - **Scambio con l'estero (banca 2:1)** — 2 unità di una risorsa che hai → 1 di un'altra,
    subito, senza contrattare. Solo risorse: la banca non tratta oro
    (`GameActions.tradeWithBank`, regole in `GameRules.canBankTrade`).
  - **Proposte fra regni** — mandi a un altro regno un'offerta e ne aspetti la risposta.
    Ogni lato può essere una **risorsa** o **oro** (risorse↔risorse, oro→risorse,
    risorse→oro), non oro↔oro; l'oro si muove a **multipli di 100**. La merce offerta
    parte **subito come pegno** (non si promette due volte la stessa) e torna a chi l'ha
    mandata se rifiutano, se la si ritira o se scade dopo 2 turni. Accettare/rifiutare
    **non** chiede turno né fase — una carovana si accoglie quando arriva. Le proposte
    ricevute stanno sul record di chi le riceve (`player.offerte`); le proprie si ritrovano
    scorrendo gli altri regni (`tradeOutbox`). Motore: `proposeTrade`/`acceptTrade`/
    `refuseTrade`/`cancelTrade`/`expireTrades` in `js/game-actions.js`.
  - **I bot commerciano** con le stesse azioni: rispondono alle carovane (accettano se ci
    guadagnano abbastanza — profilo `baratto` per strategia — e se hanno la merce, oro
    compreso; se no rifiutano così il pegno non marcisce) e mandano una proposta quando
    hanno una risorsa in eccesso e un'altra scarsa (`tradeAnswers`/`tradePlan` in
    `js/bot.js`; oro e risorse confrontati via `goodValue`, `COIN_PER_RES = 150`).

- **Nomi di oceani e mari (nuovo)** — la carta ha i nomi delle acque in latino, nel font
  delle province ('Cinzel'): 7 oceani su due righe in tondo (Glaciale, Atlantico, Pacifico
  su entrambi i bordi, Etiopico, Indiano, Australe) e 6 mari più piccoli in corsivo
  (Nordico, Mediterraneo — coricato sull'angolo del bacino —, Ponto Eusino, Caraibico,
  Arabico, Cinese). Tabella `WATERS` in `js/map-decor.js`, stile in `css/style.css`
  (`.decor-water`). Stanno nel gruppo degli ornamenti, quindi **sotto le terre**: un nome
  che sborda finisce coperto dalla costa. Ogni posizione è stata **misurata** campionando
  la mappa con `isPointInFill` (griglia terra/acqua), non indovinata: sotto il testo resta
  ≤3% di terra, e solo isolotti. Mar Rosso, Golfo Persico, Caspio, Mare del Nord e Baltico
  restano senza nome apposta: sono corridoi da 8-15 unità, illeggibili a quel corpo.

## In lavorazione (WIP)

- Rifinitura pedine e loro editor.
- Bilanciamento del motore di battaglia.
- Obiettivi del ciclo (primario/secondario/terziario) e punti prestigio d'oro: ancora
  segnaposto ("assegnato a inizio ciclo") — manca la logica di assegnazione/verifica.
- Migliorie civiche §6.1 (Sanità/Felicità): il Benessere della Popolarità resta a 3 fisso.
- Movimento truppe fra province proprie (§5.2): oggi si sposta solo schierando reclute o
  conquistando. Le reclute del turno in corso si possono spostare (ritirandole e
  rimettendole), ma i soldati già presenti da prima restano dove sono.
- Invio dell'invito per email: oggi il link va copiato a mano dall'editor (bottone 🔗
  sulla scheda di ogni giocatore).

## Note

- Multiplayer Firebase: ancora placeholder (`INSERISCI_...`) → modalità locale, nessuna sync.
- `DEV_ADMIN_BYPASS = true` in `js/app.js`: solo test, da rimettere a `false` prima del rilascio.

---
*Regola: questo file si aggiorna a ogni progresso significativo e a ogni commit. Vedi
`rules and behaviours.md`.*

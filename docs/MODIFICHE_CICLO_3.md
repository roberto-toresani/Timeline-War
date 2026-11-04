# RISIKO ONLINE — Modifiche in arrivo dal ciclo 3

Nota di design per le modifiche decise dall'utente da applicare **a partire dal ciclo 3**
(turno 21). Raccoglie quanto concordato finora, da trasformare in implementazione quando
si deciderà di aprirle. Non è ancora codice: è la fonte di verità del *cosa* e del *perché*.

Legenda: **[REGOLA]** = deciso dall'utente · **[PROPOSTA]** = proposta da confermare/tarare
· **[APERTO]** = ancora da discutere.

Gating: **[REGOLA]** attive dal **ciclo 3 = turno 21**. Precedente già nel motore:
`GameRules.UNLOCK_TURN`/`isUnlocked` (cavalieri dal ciclo II). Motivazione: le prime due
fasi restano semplici; mobilità e coalizione entrano quando la mappa è già grande.

---

## 1. Spostamenti di fine turno — DEFINITO

Oggi: **un solo** spostamento per turno, fra due province proprie confinanti
(`player.spostamentoFatto`, `GameActions.ownAdjacent`), più il rinforzo via nave.
Troppo stretto per un impero grande.

**[REGOLA] Due modalità, esclusive nel turno** (si sceglie A **oppure** B):

### Modalità A — fino a 3 spostamenti
- **Fino a 3 spostamenti** per turno.
- **Ogni provincia può partire una volta sola** (non puoi partire due volte dalla stessa
  provincia di partenza).
- **Una partenza muove solo gli uomini presenti all'INIZIO del turno** in quella provincia,
  non quelli arrivati con un altro spostamento dello stesso turno. È questo il vincolo che
  impedisce a un'armata di attraversare due regioni in un turno (la catena è il mestiere di
  B). *Formulazione scelta: ordine-indipendente — vedi sotto.*
- **Gli arrivi sono liberi di ripetersi**: più partenze diverse possono confluire in **una
  stessa destinazione** (aggregazione: prov1→X, prov2→X, prov3→X).
- Una provincia può fare **sia da partenza sia da arrivo** nello stesso turno (es. parte coi
  suoi uomini di inizio turno e più tardi ne riceve altri, che però restano lì).
- **Contatore visibile**: "spostamenti rimasti: N/3" sempre in vista nella fase `sposta`; le
  partenze già usate si spengono.

Esempio valido (confermato dall'utente):
- Spost. 1: prov2 → prov3 (3 uomini)
- Spost. 2: prov1 → prov2 (1 uomo)
- Spost. 3: prov4 → prov3 (1 uomo)

Qui prov2 è partenza (spost. 1) e arrivo (spost. 2); prov3 riceve due volte. Tutto lecito
perché prov2 parte coi suoi uomini di inizio turno e l'uomo che le arriva non prosegue.

Esempio vietato (catena mascherata):
- prov1 → prov2, poi prov2 → prov3 **usando gli uomini appena arrivati**. Gli uomini arrivati
  in prov2 da prov1 sono "congelati" e non possono proseguire verso prov3. Niente armata che
  salta due regioni.

**[REGOLA] Formulazione (a) — ordine-indipendente** (scelta dell'utente). Le partenze
attingono SOLO dal presidio di inizio turno della provincia; il giocatore non deve pensare
all'ordine dei click. (Scartata la (b) "una provincia che ha ricevuto non può più partire",
più semplice da spiegare ma dipendente dall'ordine e più restrittiva.)

> Invariante da implementare: per ogni provincia, *troppe uscenti ≤ presidio di inizio turno*;
> ogni provincia parte al massimo una volta; destinazioni ripetibili; massimo 3 spostamenti.

### Modalità B — una catena
- **Una sola armata**, di quanti soldati vuoi, lungo una **catena di province proprie
  confinanti via terra**, a qualunque distanza (BFS su territorio proprio). È il ritorno
  della catena, ma come scelta esplicita e non come default.
- Gli intermedi sono solo la **rotta**: i soldati partono da **una** provincia e arrivano in
  **una**, §5 (presidio minimo) rispettato solo agli estremi.

### Regole comuni a A e B
- **Rinforzo via nave** = conta come **uno** spostamento (uno dei 3 in A; la mossa in B).
- **Invio al fronte alleato** (vedi §4) **ammesso in entrambe** le modalità: consuma il
  movimento dell'armata (in A uno dei 3; in B la catena del turno).
- **Costo in tempo della coalizione**: le truppe inviate al fronte alleato **arrivano al
  turno 1** e sono **usabili/attaccabili dal turno 2**. Freno automatico al gang-up istantaneo.

### Impatti noti sul codice (da affrontare in implementazione)
- `player.spostamentoFatto` (booleano) → **contatore** per A (es. `spostamentiFatti`), più
  lo stato di quali province hanno già fatto da partenza e il presidio di inizio turno.
- Selettore di modalità A/B nella fase `sposta` (riusa l'impianto del selettore `.bp-vessels`).
- `moveTargets`/`finalMove`/`moveOrigins` e l'armamento a due click (`moveArmed`): B richiede
  pathfinding sul territorio proprio.
- **Bot**: `movePlan` e `marchMove` (colonna dell'Orda) vanno insegnati alle due modalità —
  la colonna diventa più naturale con B.

---

## 2. Commerci — PARZIALMENTE DEFINITO

### 2A — Gating per confine [REGOLA]
Oggi si propone commercio a chiunque sia **visibile** (`diploKingdomsVisibili`): per l'umano
è alla cieca (non sa cosa producono/servono gli altri). La carovana viaggia via terra.

**[REGOLA]** Si può commerciare **solo con chi confina ora, o ha confinato di recente e ora
non più**. Serve un piccolo stato nuovo: registro `ultimoConfine[coppia] = turno`; ammesso se
confini ora **oppure** `turno − ultimoConfine ≤ K` (stessa logica del `fade` diplomatico).

**Distinzione netta col §3**: il **commercio** si lega al **confine** (carovane = terra); la
**diplomazia no** (lettere/araldi = ovunque). Oggi sono gated dallo stesso
`diploKingdomsVisibili`: qui si **separano**.

### 2B — Rotte commerciali [REGOLA] (v1 solo terra)
Oltre agli scambi occasionali (§2A), per trarne profitto stabile si crea una **rotta commerciale
fra due Mercati** di due regni. Non è un bonus una-tantum: è un **tubo ricorrente** — ogni turno
una **carovana** percorre la rotta e, se arriva, i due regni **si scambiano le risorse concordate
+ 50 monete a testa**.

- **Ancora**: un **Mercato** a ciascun capo (riusa la costruzione esistente).
- **Merci**: ogni rotta scambia **fino a 2 tipi** di risorsa, concordati alla firma.
- **Cap per Mercato**: un Mercato → max **1 rotta verso lo stesso regno** e max **2 rotte totali**
  (verso 2 regni diversi). Più Mercati → più rotte (budget per-Mercato).
- **Nascita**: proposta da araldo (come patti/commerci); entrambi devono possedere un Mercato ed
  entrambi accettano. Può collegare Mercati **non confinanti** (è il senso del corridoio) — a
  differenza dello scambio occasionale del §2A, legato al confine.

**Il corridoio.**
- Linea **fluttuante, colore in risalto**, che passa per il **centro esatto** delle province
  attraversate.
- Tracciata sulla **strada più breve** via terra (BFS sui confini di terra, a parità la più corta
  geometricamente). Mercati confinanti → linea diretta; non confinanti → attraversa province di
  regni o neutrali.
- **Geografica e congelata alla firma**: se un terzo conquista una provincia del corridoio, la
  rotta **non si re-instrada** (è il senso del raid). [punto 1]
- **Niente via di terra fra i due Mercati → rotta non creabile** in v1. [punto 2]
- **Solo terra** in v1; le rotte via mare (carovana→nave, intercettazione navale) sono
  un'estensione futura.
- **Nebbia**: la rotta si vede con le **regole delle icone-risorsa** (la vedi dove vedi la
  provincia), ma **senza i dettagli di scambio** (merci/quantità).

**Resa, una volta per giro.** La rotta si risolve nel blocco `giroFinito` di `endTurn` (accanto a
`neutralRaids`/eventi): se la carovana non è stata razziata, paga i due capi (merci concordate +
50 monete ciascuno). Risolvendo per **giro** non c'è ambiguità di "carovana a metà viaggio": si
guarda la proprietà del corridoio e i flag di razzia di QUEL giro.
- **Se un capo non ha le risorse concordate** quel turno → l'intero scambio **salta** (niente
  merci, **niente +50**: la carovana non è partita). [punto 3]

**Razzia e "lascia passare".** Un terzo che possiede una provincia del corridoio decide dalla
**sezione Mercato**:
- **Default ogni giro = lascia passare.** La razzia **NON è persistente**: va decisa
  **esplicitamente giro per giro** dal proprietario del valico; il flag si **azzera a ogni giro**.
  [punto 4 — rivisto dall'utente]
- **Razzia**: sequestra le **merci in transito** di quel giro e **blocca il bonus monete** ai due
  capi. È un **atto di guerra** → `aggressione`/`rancore` verso entrambi i capi e calo di `standing`.
- **Lascia passare**: la rotta frutta; l'eventuale compenso per il passaggio si **regola via chat**,
  nessun pedaggio imposto dal motore. [punto 6]
- **Più terzi sul corridoio**: il **primo razziatore lungo il percorso** si prende il carico e
  blocca il bonus per tutti a valle. [punto 5]

**La nebbia vale anche per la razzia [REGOLA].** Un capo che **non confina** (e non vede) il valico
razziato **non vede l'atto** — stessa nebbia delle icone-risorsa. Ne sente però l'**effetto** sulla
propria economia: quel giro la rotta non frutta. Avviso al capo a due livelli:
- valico **non visibile** → "una tua rotta è stata interrotta" (senza chi/dove);
- valico **visibile** (confine, patto `vista`, o **spia**) → dettaglio pieno (chi l'ha razziata).
Emergente e voluto: la trade interdetta spinge a **mandare una spia** o a **mettere in sicurezza il
corridoio** per scoprire chi ti strozza.

**UI**: le rotte si gestiscono/vedono nella **sezione Mercato** della plancia. Stile approvato su
mock (`claude.ai/artifact/9GZjUFbG8GCrv6kyBWGMyk`): linea d'oro fluttuante, carovana che scorre,
segno di razzia al valico, trattamento in nebbia. [APERTO, minore] colore definitivo della rotta
(oro vs cremisi/turchese) e quanto "viva" la carovana — da decidere sulla **mappa vera**
(`_dev`/`_diag-rotte.html`).

**NB — niente primitivo condiviso col §4** (correzione): nel design finale la razzia è decisa dal
**proprietario del valico** (un flag giro per giro), quindi la carovana è **solo colore**, non un
token che si intercetta. Il mattone nuovo del §4 è invece **"stack straniero su una provincia"**,
che le rotte non usano. Le due feature restano separate.

**Piano**: 2A (semplice) subito col §3; 2B come progetto a sé, sul primitivo carovana.

---

## 3. Diplomazia persistente oltre il confine — [REGOLA]

**[REGOLA]** Anche se due regni **non confinano più**, la diplomazia fra loro **resta intatta**
e possono **scriversi privatamente**.

In gran parte è un **cambio di gating UI**, non di meccanica:
- I patti già vivono su entrambi i record a prescindere dalla vista (`bondPact`).
- `standing` legge solo il proprio registro (funziona fuori vista).
- La chat già mostra "un filo privato che ha già messaggi anche se il regno è fuori vista".

Serve il concetto di **regno conosciuto** (set per giocatore: "incontrato almeno una volta"),
per cui pannello Diplomazia + chat restano aperti anche quando si perde confine/vista.
Attenzione: la scheda mostra i **fatti della relazione** (proprio registro) — ok — ma **non**
truppe/province, che restano fog-gated. Nessun leak.

---

## 4. Rinforzi alleati sul fronte comune — [REGOLA] (grande e rischiosa)

Oggi: i rinforzi all'alleato **diventano suoi** (perdono colore/proprietà), per non rompere
l'invariante *"le truppe appartengono a chi possiede la provincia"*.

**[REGOLA]** Si può inviare un'armata **direttamente sul fronte col nemico comune**; le truppe
**mantengono il colore del proprietario** e sono **comandate dal regno d'origine al suo turno**.
L'alleato può **ritirarle** o **aprire la diplomazia** col nemico. Rende la guerra di coalizione
realistica.

**Rischio chiave**: rompe l'invariante portante del motore (una provincia può ora ospitare
truppe di un altro proprietario). L'invariante è ovunque (`data-pieces`, `data-merc`,
`data-cav`, `data-ships`, presidio, produzione, combattimento).

**[REGOLA] Architettura — struttura PARALLELA sul record del MITTENTE** (come `spie`/`spedizioni`),
**non** dentro `data-pieces`:
```
B.corpiSpedizione = [{ id, prov, alleato:'A', soldati, cav, merc }]
```
È "un'armata di B parcheggiata su suolo alleato": tiene colore e proprietà di B; la provincia resta
di A con le sue pedine (invariante salvo). I **due soli punti che toccano il cuore del motore**:
1. **Difesa a somma di due stack**: un attacco alla provincia ospite lo difendono insieme la
   guarnigione di A **e** il corpo di B.
2. **Attacco con origine su provincia altrui**: B attacca partendo dalla provincia di A dove sta il
   corpo (oggi le origini di attacco/movimento sono solo province proprie).

**Ciclo di vita [REGOLA]:**
- **Invio** (fase movimento, §1): B manda un'armata su una provincia di un **alleato** (accesso
  militare = patto `rinforzi` o alleanza), raggiungibile via catena di terra (mod. B) o passo/nave
  (mod. A). Consuma il movimento. **Arriva al turno 1, usabile dal turno 2.** Nessun flag "nemico
  comune": l'accesso militare è il cancello, poi B combatte chi vuole (fronte comune emergente).
- **Ospitalità/difesa**: il corpo **difende sempre insieme** alla guarnigione di A (anche nel turno
  di A). Non conta per il presidio minimo di A, né per la sua produzione/§8. [punto 7]
- **Comando (turno di B)**: il corpo è **un'armata di B a tutti gli effetti**, sta solo su suolo
  alleato; muove/attacca con le regole §1 (una mossa / un attacco) **dalla provincia ospite**. Le
  armate muovibili di B = truppe nelle sue province **+** corpi su province alleate.
- **Base di proiezione** [punto 6]: dalla provincia ospite B può attaccare **qualunque** provincia
  nemica adiacente (A fa da base); un corpo **non può attaccare il proprio ospite** (niente
  pugnalata dall'interno — il tradimento resta quello di confine). Se ad A non sta bene, rompe
  l'alleanza e il corpo diventa sconfinamento da ritirare.
- **Conquista** [punto 1]: la provincia presa **va a B** (testa di ponte sua), con la ripartizione
  conquista di B.
- **Ritiro** [punto 3]: **richiamo immediato** alla provincia di B **più vicina** (si rifonde nella
  guarnigione). **Costa come lo spostamento di fine turno in modalità B** (la "versione 2": un'unica
  armata): quel turno **occupa tutto il movimento** ed è **esclusivo con i 3 spostamenti della
  modalità A**. (L'invio resta invece ammesso in entrambe le modalità; solo il ritiro è prezzato
  come la B.) Se B non ha più province, il corpo non può rientrare.
- **Difesa e perdita** [punti 2+4, chiariti dall'utente]: ospite + corpo combattono come **un'unica
  difesa**, perdite **proporzionali** fra i due stack (ventura per prima in ciascuno). Difesa che
  **regge** → i due si spartiscono le perdite; provincia che **cade** → **cadono tutti**,
  guarnigione di A e corpo di B, **nessun superstite** (modello a difesa combinata, non "il nemico
  ignora gli alleati"). È il prezzo vero dell'impegno oltreconfine.

**Bot [punto 5]**: in v1 comandare un corpo è **solo umano** (come spie/spedizioni); i bot tengono
il rinforzo-che-fonde (`sendReinforcements`). Un umano può mandare un corpo da un **alleato-bot**
(il bot ospita, l'umano comanda). L'AI dei corpi arriva dopo.

**Nebbia/render**: le pedine di B si disegnano sulla provincia di A col **colore di B** + coccarda
"corpo di spedizione"; visibili a B (è roba sua) e a chi vede le truppe di quella provincia
(confine/`vista`/spia), come una guarnigione in più.

---

## Stato e ordine suggerito

| # | Stato | Rischio | Mossa |
|---|-------|---------|-------|
| 1 Spostamenti | **Definito** | Basso | Primo taglio |
| 2A Commerci per confine | Definito | Basso | Col §3 |
| 2B Rotte commerciali | **Definito** | Molto alto (sottosistema) | Progetto a sé, sul primitivo carovana |
| 3 Diplomazia persistente | Definito | Basso (gating UI) | Col §2A |
| 4 Rinforzi alleati al fronte | **Definito** | Alto (invariante) | Struttura parallela, a sé |

Lotto a rischio basso: **1 + 2A + 3**. Poi **4** (struttura parallela). Poi **2B** riusando il
primitivo "carovana/corpo" maturato sul 4.

## Pezzi ancora aperti
- **Generale** (gancio futuro): unità che, dov'è presente, lascia muovere la **stessa** armata
  due volte in modalità A (eccezione al "una partenza per provincia"). Da definire: origine
  (reclutato? guadagnato? uno per regno?), costo, pedina propria, regola esatta. **Non** nel
  primo taglio degli spostamenti.
- **Rotte commerciali §2B**: design chiuso; restano minori — colore definitivo della linea e
  "vivacità" della carovana, da decidere sulla mappa vera.
- **§4 corpi di spedizione**: design chiuso; restano l'implementazione, l'AI dei bot per
  comandarli (v1 è solo-umano), e un'eventuale preview su mappa vera.

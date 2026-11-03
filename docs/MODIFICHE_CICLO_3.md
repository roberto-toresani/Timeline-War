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

### 2B — Rotte commerciali [PROPOSTA / APERTO]
Oltre agli scambi occasionali (come oggi), per trarne profitto si può creare una **rotta
commerciale fra due Mercati**:
- **+50 monete per regno a ogni scambio** sulla rotta.
- Creando la rotta si traccia una **linea** (immaginaria) fra i due Mercati.
- **Chiunque possieda una provincia toccata dalla linea** può **inserirsi** nella rotta
  (vendere/acquistare e godere dei bonus economici) **oppure** conquistare la provincia e
  **razziare le carovane**.

Ancora = i **Mercati** (riusa la costruzione esistente; investimento gate per entrambe le parti).

**[APERTO] Quattro decisioni che definiscono la meccanica:**
1. **Chi incassa il +50**: solo i due proprietari dei Mercati, o anche gli **intermediari**
   sulla linea? Alternativa storica più ricca: l'intermediario che controlla il valico
   **tassa** la carovana (fetta presa *dai* due capi) = *skimming* invece che bonus diffuso.
2. **Cosa traccia la linea**: **retta** fra i due Mercati (semplice; campionamento del
   segmento con `isPointInFill`) oppure **cammino vero** strade+mare
   (`connectedOf`/`sea-routes.js`, realistico ma pesante). Propensione: retta, come da
   "linea immaginaria".
3. **"Razziare le carovane"**: *passiva* (possiedi una provincia del corridoio → tagli/tassi)
   o *attiva* (una **carovana** vera viaggia e può essere intercettata e distrutta).
4. **Un nemico sulla linea rompe la rotta?** Presumibilmente sì (interdizione): la rotta paga
   solo se il corridoio è amico/neutrale.

Nota architetturale: la **carovana** (3-attiva) e il **corpo di spedizione alleato** (§4) sono
lo **stesso primitivo** — "oggetto sulla mappa, del colore del proprietario, che viaggia ed è
attaccabile" — già visto in `spie`/`spedizioni` (`player.spedizioni`, `x,y`, avanzamento in
`beginTurn`, render dedicato, nebbia). Se si sceglie la razzia attiva, conviene disegnare quel
primitivo **una volta** e usarlo per entrambi.

**Piano**: 2A (semplice) subito col §3; 2B come progetto a sé, sul pattern `spedizioni`.

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

**[PROPOSTA] Architettura consigliata — struttura PARALLELA sul record del proprietario**, come
`spie`/`spedizioni`, **non** dentro `data-pieces`:
```
B.corpiSpedizione = [{ prov, alleato:'A', soldati, cav, merc }]
```
- La provincia resta di A con le SUE pedine (invariante salvo).
- Render speciale: bandiera/pedine di B sopra la provincia di A (come la pedina-spedizione).
- **Difesa di coalizione**: se qualcuno attacca quella provincia, il combattimento somma
  presidio di A **+** i corpi di B presenti.
- **Turno di B**: B riceve azioni sui corpi — attaccare il nemico confinante *da lì*, ritirarli,
  o niente. Il fronte comune nasce da sé. Arrivano al turno 1, attaccabili dal turno 2 (§1).

**[APERTO] Da decidere prima di implementare:**
- Se A perde la provincia mentre i corpi di B sono lì → distrutti? ritirata forzata? catturati?
- I corpi di B contano per la Sicurezza §8 di A (nemiche al confine della Capitale)? (Direi no.)
- Nebbia: A vede cosa fa B dai propri territori? (coerente con patto `vista`.)
- **Bot**: `sendReinforcements` oggi fonde; serve una modalità "corpo di spedizione" + AI che
  lo muove al proprio turno.

---

## Stato e ordine suggerito

| # | Stato | Rischio | Mossa |
|---|-------|---------|-------|
| 1 Spostamenti | **Definito** | Basso | Primo taglio |
| 2A Commerci per confine | Definito | Basso | Col §3 |
| 2B Rotte commerciali | Aperto | Molto alto (sottosistema) | Progetto a sé |
| 3 Diplomazia persistente | Definito | Basso (gating UI) | Col §2A |
| 4 Rinforzi alleati al fronte | Definito (archit. aperta) | Alto (invariante) | Struttura parallela, a sé |

Lotto a rischio basso: **1 + 2A + 3**. Poi **4** (struttura parallela). Poi **2B** riusando il
primitivo "carovana/corpo" maturato sul 4.

## Pezzi ancora aperti
- **Generale** (gancio futuro): unità che, dov'è presente, lascia muovere la **stessa** armata
  due volte in modalità A (eccezione al "una partenza per provincia"). Da definire: origine
  (reclutato? guadagnato? uno per regno?), costo, pedina propria, regola esatta. **Non** nel
  primo taglio degli spostamenti.
- **Rotte commerciali §2B**: le 4 decisioni qui sopra.
- **Dettagli architetturali del §4**: i 4 punti aperti qui sopra.

# Diplomazia, Rapporti, Patti tra Regni e Fede

## 5 tipi di patto (`Diplomacy.GRANTS`)
1. **Non-belligeranza**: nessun attacco reciproco.
2. **Alleanza**: concede non-aggressione, **vista** (automatica) e **rinforzi**; i rinforzi sono anche il requisito per ospitare un corpo di spedizione (serve poi che l'alleato apra il fronte — vedi sotto).
3. **Commercio preferenziale**: sconto sulle carovane reciproche + **prerequisito per le rotte commerciali inter-regno** (vedi `MERCATI_COMMERCI.md § Prerequisiti`).
4. **Vassallaggio**: il vassallo cede risorse, il signore protegge.
5. **Tregua**: pausa temporanea (N turni), poi scade.

## Regole patti
- Patti sono **mutui**: entrambi devono accettare (`expirePacts` / consenso).
- Rottura unilaterale: penalità standing + `recordGrudge` sul tradito.
- `expirePacts(turn)`: rimuove patti scaduti a fine turno.
- Max patti attivi: vedi `PACT_MAX` in diplomacy.js.

## Rinforzi
- `askReinforcements(from, to, qty)`: richiesta all'alleato.
- `sendReinforcements(from, to, qty)`: alleato invia (costa un'azione costruzione).
- **Tradire**: inviare truppe e poi attaccare → standing crolla a minimo.

## Condivisioni diplomatiche

**Mostra fronte** (`showFront` / `hideFront`, dato `player.frontiMostrati = [{a, nemico}]`): A apre a un alleato B il proprio confine con un avversario X. È una **concessione unilaterale** — A clicca e apre, nessuna accettazione di B — **revocabile** in ogni momento (`hideFront`). Si fa dalla **sezione Diplomazia**, nella scheda dell'alleato: un bottone per ogni nemico che A confina.
- **Prerequisito obbligatorio del corpo di spedizione**: B può inviare un corpo su una provincia di A **solo** se A le ha aperto il fronte col nemico che quella provincia confina (`canSendCorpsTo`). Senza fronte aperto, l'invio è rifiutato.
- A può aprire fronti diversi (nemici diversi) allo stesso alleato, e lo stesso fronte a più alleati.
- Unidirezionale: A apre a B, non viceversa.

**Condivisione vista**: oggi la vista sulle province dell'alleato arriva **automaticamente** col privilegio `vista` dell'alleanza (`sharesVision` / `GRANTS.alleanza`), non come condivisione opt-in separata. (Una "condividi vista" esplicita e opt-in resta un'estensione futura.)

## Standing (`Diplomacy.standing`)
- Numero −100 / +100 per coppia di regni.
- `why[]`: lista motivi (tradimento, patto rispettato, aiuto...); si sfuma nel tempo (`fade`).
- Standing basso blocca nuovi patti anche se fede compatibile.
- `ctx`: `{ confinanti, turno, fedeMia, fedeSua, truppe_confine }` — passato dal chiamante.

### Criteri di standing

| # | Criterio | Delta |
|---|---|---|
| 1 | Patti attivi firmati | variabile (il più pesante) |
| 2 | Stessa fede | +18 |
| 2 | Fedi sorelle (Catt/Ort, Sunn/Sciita) | **−15** (rivali: si contendono le stesse anime) |
| 2 | Fedi di famiglie diverse | −10 |
| 3 | Scambi commerciali conclusi | +7 cadauno, cap +28 |
| 3b | Rotta commerciale instaurata (≥1 scambio) | +10 fisso |
| 4 | Rinforzi ricevuti (aiuti) | pesato per età, cap +27 |
| 5 | Consensi di passaggio concessi | +4 cadauno, cap +8 |
| 6 | Province prese in guerra | −(6 + 5×peso) × fade, cap −50 |
| 6 | Attacchi respinti | −5 × fade, cap −20 |
| 7 | Patti traditi / rotti da lui | −30 / −14 cadauno |
| 8 | Confinano senza accordi | −6 |
| 8b | Confini armati (>6 truppe al confine, senza accordi) | −8 aggiuntivi |

## Bot e diplomazia
- **Fede blocca prima**: famiglie di fede diverse non firmano (`canDealWith`).
- Nemico dichiarato in dottrina → mai trattare.
- Propone non-belligeranza solo se il vicino è nettamente più forte.
- Max 2 patti attivi per i bot.
- `diploAnswers`: risponde agli araldi; `diploProposals`: propone autonomamente.
- `helpAskPlan`/`helpSendPlan`: un rinforzo per turno per parte.

## Religione e fede
- `data-religione` su ogni `<path>`: fede corrente della provincia.
- `stateReligionOf(player)`: fede maggioritaria del regno.
- Dati di partenza: `data/start_religions.js` (eccezioni per nome provincia).

## Fede segue la spada
- `convertOnConquest(path, newOwner)`: conquista → la provincia prende la fede del conquistatore.
- `imposedFaithOf(player)`: fede che il regno impone alle province conquistate.
- `syncKingdomFaiths` / `syncStateFaiths`: riallineamento di massa dopo eventi.

## Scismi
- **Grande Scisma** (turno 5): divisione Cattolici/Ortodossi.
- **Riforma** (turno 52): nascita Protestanti dal blocco cattolico.
- Scismi applicati da `applyEvents` → `syncKingdomFaiths` → `syncStateFaiths`.
- Dopo uno scisma, patti tra fedi ora incompatibili restano in vigore ma non si rinnovano.

## Corpi di spedizione

Meccanica avanzata (v1 solo umani): B invia un'armata su una provincia di A (alleato con patto alleanza/rinforzi). Le truppe **mantengono colore e proprietà di B** e sono **comandate da B al suo turno**.

### Architettura — struttura parallela sul mittente
```
B.corpiSpedizione = [{ id, prov, alleato:'A', soldati, cav, merc }]
```
La provincia resta di A. Il corpo **non entra in `data-pieces`** della provincia ospite (l'invariante "truppe appartengono al proprietario della provincia" è preservata). I punti del motore che devono leggere i corpi: combattimento, render, turno di B.

### Ciclo di vita

**Invio** (fase **sposta**, movimento tipo B): l'invio di un corpo di spedizione **è** il movimento di tipo B — l'unica grande mossa che attraversa più province. Usarlo esclude qualsiasi altro spostamento quel turno (sia il tipo B normale, sia i 3 spostamenti tipo A). Serve un **patto di alleanza o rinforzi** con l'ospite A, **e** che A ti abbia **aperto il fronte** con il nemico su quella provincia (vedi *Mostra fronte*): senza fronte aperto l'invio è rifiutato. Il corpo arriva al turno 1, è usabile dal turno 2.

**Ospitalità / difesa**: il corpo difende **sempre insieme** alla guarnigione di A (anche nel turno di A). Non conta per il presidio minimo di A né per la sua produzione/§8.

**Comando (turno di B)**: il corpo è un'armata di B a tutti gli effetti, parcheggiata su suolo alleato. Le armate muovibili di B = truppe nelle province di B **+** corpi su province alleate. Una mossa / un attacco per turno (§1 standard).

**UX — la provincia alleata si tratta come tua**: dove hai un corpo, clicchi la provincia sulla mappa e agisci come se fosse tua — in fase **attacca** scegli il bersaglio adiacente, in fase **sposta** scegli se ritirare gli uomini. Comandi **solo il tuo corpo**: la guarnigione dell'alleato resta sua (difende insieme, ma non la muovi tu).

**Base di proiezione**: dalla provincia ospite B può attaccare **qualunque** provincia nemica adiacente (A fa da base). Un corpo **non può attaccare il proprio ospite** (niente pugnalata dall'interno — il tradimento resta quello di confine). Se ad A non sta bene, rompe l'alleanza e il corpo diventa sconfinamento da ritirare.

**Conquista**: la provincia presa **va a B** (testa di ponte sua), con la ripartizione conquista di B.

**Ritiro (richiamo immediato)**: il corpo rientra nella provincia di B **più vicina** e si rifonde nella guarnigione. Costa come la **modalità B dello spostamento di fine turno** (l'unica grande mossa): quel turno occupa tutto il movimento ed è **esclusivo con i 3 spostamenti modalità A**. L'invio non ha questo vincolo; solo il ritiro è prezzato come modalità B.

### Difesa e perdite
Sul fronte condiviso le due armate si **sommano**: soldati di A + soldati di B, con le rispettive ventura e cavalieri; terreno e mura sono quelli della provincia ospite, contati una volta sola. La somma vale anche per il limite di conquista e per la soglia dei due attacchi (§9).
- **Difesa che regge**: perdite ripartite in **proporzione** (ventura per prima in ciascuno).
- **Provincia che cade**: cadono guarnigione di A **e** corpo di B — nessun superstite. È il prezzo dell'impegno oltreconfine.

### §8 / Sicurezza
Il corpo di B non cambia la Sicurezza di A (la proprietà delle province non cambia).

### Bot (v1)
Comandare un corpo è **solo umano** (come spie/spedizioni). I bot continuano a usare `sendReinforcements` (fusione classica). Un umano può mandare un corpo da un alleato-bot (il bot ospita, l'umano comanda).

### Render
Pedine di B sulla provincia di A disegnate col **colore di B** + coccarda "corpo di spedizione". Visibili a B e a chi vede le truppe di quella provincia (confine / `vista` / spia).

### Punti di impatto nel motore
| File | Cosa cambia |
|---|---|
| `game-actions.js` | invio crea entry in `corpiSpedizione`; turno B include corpi come armate mossibili |
| `battle.js` | difensori = `data-pieces`(A) + corpi di B su quella prov |
| `game-actions.js` (attacco) | origine attacco/movimento ammessa anche su provincia altrui (solo per corpi) |
| `game-rules.js` / `kingdom-stats.js` | corpi esclusi da presidio/produzione/§8 di A |
| `sync.js` | `corpiSpedizione` serializzato nel documento Firestore |
| `refreshMapDisplay` | render con colore B + coccarda |

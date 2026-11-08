# Mercati, Commerci e Rotte

## Costruzione Mercato
- Sblocca la banca 2:1 e le carovane verso altri regni.
- **Incompatibilità**: Mercato e Fortezza non possono coesistere nella stessa provincia.
- Demolizione Mercato: rimane con 2 uomini + 100 monete rimborso.

## Banca 2:1 (`bankPlan`)
- Scambia 2 unità di una risorsa con 1 di qualsiasi altra.
- Canale sicuro: sempre disponibile con Mercato.
- I bot usano `bankPlan` quando `resourceNeed` supera la soglia.

## Carovane (`tradePlan`)
- `acceptTrade` / `recordTrade`: handshake in due fasi.
- `commerciStorico`: storico degli scambi per valutare l'affidabilità.
- Max `TRADE_MAX_PENDING` carovane pendenti per volta.
- Non si manda una seconda carovana a chi non ha ancora risposto.
- Prezzo: eccedenze o oro a prezzo di mercato + sovrapprezzo (`goodValue`).

## Festa §6.1
- `joyTier(player)` 0-3: livello festa (produzione abbondante + popolarità alta).
- `discountedCost` / `costFor`: sconto su costruzioni durante la festa.
- `payConstruction`: applica il costo (scontato o pieno).

## Rotte commerciali (produzione interna)
- Rotte via terra: province adiacenti con strada costruita (`data-roads`).
- Rotte via mare: via nave (Nave o Veliero), `seaLinksOf(player)`.
- `connectedOf(player)`: tutte le province raggiungibili dalla Capitale (terra + mare).
- Senza connessione: la risorsa non conta per la produzione.

## Rotte commerciali inter-regno (`player.rotteCommerciali`) — v1 solo terra

Accordo permanente fra due Mercati di regni diversi. Genera un **tubo ricorrente**: ogni turno parte una carovana che porta le risorse concordate e **+50 monete a testa**.

### Corridoio
- Tracciato alla firma con **BFS sui confini di terra** (meno province attraversate; a parità il più corto geometricamente).
- La linea passa per il **centro esatto** (`MapAnchors.landAnchor`) di ogni provincia attraversata — è geografica e visibile.
- **Congelato alla firma**: se un terzo conquista una provincia del corridoio la rotta non si re-instrada — resta lì, esponendo il corridoio.
- Visibile in nebbia con le stesse regole delle icone-risorsa (vedi la linea dove vedi la provincia), **senza** dettagli di scambio.
- Visibile nella **sezione Mercato** della plancia.
- v1 solo terra; rotte via mare (con intercettazione navale) sono un'estensione futura.

### Economia
- Ogni rotta scambia **fino a 2 tipi di risorsa** concordati alla firma.
- **+50 monete a testa** per ogni turno in cui la carovana arriva.
- Se un capo non ha le risorse concordate quel turno → l'intero scambio **salta** (niente merci, niente +50).

### Cap per Mercato
- 1 Mercato → max **1 rotta verso lo stesso regno**, max **2 rotte totali** verso regni diversi.
- Con più Mercati (province diverse) si possono aprire più rotte.

### Prerequisiti per creare una rotta
Per poter proporre una rotta dalla sezione Mercato devono essere soddisfatte **tutte e cinque** le condizioni:

1. **Hai almeno un Mercato.**
2. **L'altro regno ha almeno un Mercato.**
3. **Avete un patto `commercio preferenziale`** — è il requisito diplomatico minimo; l'alleanza non è necessaria, ma non impedisce le rotte.
4. **Esiste un corridoio di terra** tra i due Mercati (BFS trova un percorso); se il mare separa completamente i due Mercati, in v1 la rotta non si può creare.
5. **Il cap del Mercato non è esaurito**: max 2 rotte totali per Mercato, max 1 verso lo stesso regno.

Se tutte le condizioni sono soddisfatte, nella sezione Mercato compare il pulsante per proporre la rotta; l'altro regno deve accettare (araldo, come i patti).

### Ciclo di vita
- **Proposta via araldo** (come i patti): entrambi devono avere un Mercato, entrambi accettano, si scelgono le merci.
- Persiste finché un capo la scioglie o il corridoio rimane interrotto N turni.
- Struttura sul player: `player.rotteCommerciali = [{ id, conId, conNome, prov:[], risorse:[], turnoFirma }]`.

### Terzi sul corridoio
Se un regno terzo possiede una provincia del corridoio, nella sua **sezione Mercato** vede quella rotta e può scegliere:

- **Lascia passare** *(default ogni turno)*: la carovana transita, il terzo non ottiene nulla dal motore (si regola via chat col capo se vuole un compenso). Il flag si azzera a ogni turno — deve scegliere attivamente ogni giro.
- **Razzia** (flag esplicito quel turno): il terzo incassa le risorse in transito e blocca il bonus +50 agli altri capi. Registrato come `aggressione` verso entrambi i capi → deteriora lo standing con entrambi.

**Più razziatori sul corridoio**: il primo lungo il percorso si prende il carico — gli altri a valle restano a secco.

**Nebbia sull'atto di razzia**: il capo non vede chi razzia se non confina né ha `vista`/spia sulla provincia. Riceve solo "una tua rotta è stata interrotta". Se vede la provincia → dettaglio pieno (chi e dove).

### Standing
- Avere una rotta attiva con un regno → +10 standing (vedi `DIPLOMAZIA_FEDE.md § Criteri di standing`, criterio 3b).
- Razziare → `aggressione` verso entrambi i capi → penalità standing automatica.

## Costi costruzioni (GameRules — aggiornare se cambiano in codice)
| Edificio | Monete | Risorse |
|---|---|---|
| Strada | 100 | — |
| Fortezza | 300 | 1 Pietra |
| Mercato | 200 | 1 Legno |
| Porto | 400 | 2 Legno |
| Nave | 300 | 1 Legno |
| Veliero | 600 | 2 Legno |
| Capitale (prima) | 500 | 1 Pietra + 1 Legno |
| Capitale (sposta) | 500 | — |

> Fonte di verità: `GameRules` in `js/game-rules.js`. Verificare prima di citare cifre.

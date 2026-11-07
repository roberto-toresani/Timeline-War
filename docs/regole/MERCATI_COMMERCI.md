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

## Rotte commerciali
- Rotte via terra: province adiacenti con strada costruita (`data-roads`).
- Rotte via mare: via nave (Nave o Veliero), `seaLinksOf(player)`.
- `connectedOf(player)`: tutte le province raggiungibili dalla Capitale (terra + mare).
- Senza connessione: la risorsa non conta per la produzione.

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

# Obiettivi, Percorsi Storici e Linee Guida per Regni IA

## Obiettivi §10 (`js/objectives.js`)
- Binario storico per regno + generatore di obiettivi casuali.
- `closeCycle`: chiude il ciclo corrente e assegna i nuovi (`ensureAssignment`).
- Numeri esatti degli obiettivi per regno → `docs/BINARI_STORICI.md`.
- Modifica obiettivi: si cambia `js/objectives.js`; vale dal ciclo successivo.

## Leva di ciclo (dottrina)
- `levaCiclo: N` in doctrines.js: N reclute libere a ogni `closeCycle`.
- Alternativa alla leva degli obiettivi per regni d'evento con dottrina attiva.

## 4 strategie bot (`Bot.STRATEGIES`)
| Strategia | Comportamento |
|---|---|
| `espansione` | Conquista aggressiva, pochi edifici |
| `costruttore` | Priorità a infrastrutture e risorse |
| `opportunista` | Attacca chi è debole, si adatta |
| `predone` | Razzie veloci, nessun insediamento stabile |

- **Conservatore non esiste**: la difesa è `holdFloor`/`capitalGuard` per tutti.
- Una nuova strategia = voce in `Bot.STRATEGIES`, non un ramo `if` sparso.

## 6 regole essenziali bot (per non bloccarsi)
0. **Dove costruire la Capitale** (`capitalScore`): protezione + risorse + uomini presenti.
1. **Popolarità prima** (`popState → Popularity.plan`): tassazione e guardia come priorità 1.
2. **Conquistare solo se vale** (`popValueOf`: spesso zero).
3. **Annettere risorse nuove** (`roadWorth`: preferisce tipi non già in possesso).
4. **Mercenari solo per chiudere un attacco** (`mercenaryPlan + coinReserve`).
5. **Mercato quando manca più di un tipo** (con scorte già presenti).
6. **Riserva monete sulla prossima costruzione raggiungibile** (`coinReserve`).

## Istinto di sopravvivenza
- `defenseFloor`: ~3/4 dell'esercito nemico più forte al confine (tetto `DEFENSE_CAP=12`).
- `raidFloor`: presidio contro razzie neutrali di fede diversa.
- `holdFloor(player, id, salvo)` = max(defenseFloor, raidFloor).
- `capitalGuard`: in pace segue `guardWanted`; con invasore = `holdFloor` della Capitale.

## Rancore (`player.rancore`)
- Scritto solo in `applyBattleOutcome` (`recordGrudge`), solo per province preziose.
- Pesi: Capitale 3 · Città/Fortezza 2 · risorsa 1 · provincia spoglia 0.
- `clearGrudge`: si spegne se la provincia torna al derubato.
- In bot: premio attacco `× peso × 1.5`; in schieramento "punta" ammassa la lancia.

## Dottrine (`js/doctrines.js`)
Campi: `mete`, `nemici`, `vietate`, `soloMare`, `conservatore`, `soloMete`, `marcia`, `nessunPatto`, `senzaFede`, `levaCiclo`.
- `Doctrines.march(regno)`: tappe ordinate (Mongoli → occidente, Selgiuchidi → Terra Santa...).
- `marchMove` in bot.js: spostamento finale avanza il grosso verso la punta.
- `dottrinaSospesa`: disattiva la dottrina (Orda al turno 36 diventa `costruttore`).

## Navi e sbarchi (bot)
- `shipPlan`: arma una Nave sulla costa con più prede oltremare (`seaPreyFrom`).
- Non arma una seconda nave se c'è già una pronta (`hasReadyShip`).
- Premio sbarco `+0.8` in `bestAttack` (senza, il mare perde sempre contro terra).

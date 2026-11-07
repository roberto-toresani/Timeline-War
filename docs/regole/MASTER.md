# Regole Master — cheat-sheet sempre caricato

## Fasi turno (`GameActions.PHASES`)
`schiera → costruisci → attacca → sposta`
Solo `game-actions.js` muta lo stato. Mai mutare `PLAYERS` direttamente.
`prepareGame` (`turnoDi=null`) → `beginMatch` (sorteggia ordine).
Admin vs giocatore: `Risiko.isAdmin()`. `?local=1` → modalità locale + admin.

## Battaglia
`RisikoBattle.winChance(A, D, k)` — unico punto.
k = **1.4** chiuso (monti, foreste, paludi) · k = **2.6** aperto (pianure, steppe, deserti).
Due attacchi per turno (`firstCharge` + `resolveFullBattle`).
Limite conquista: servono ≥ **1.5 × difensori** per garantire successo.
Presidio minimo: `MIN_GARRISON = 1` → `spendableTroops = uomini − 1`.

## Popolarità
`Popularity.score(factors)` → `Popularity.plan(player)`.
Trappola turno 1: tassa leggera + guardia a 10 → salvo al turno 2.
Senza Capitale: `province÷3` reclute invece del normale.

## Produzione / raccolta
Risorse collegate dalla Capitale via route (`connectedOf`).
Isole: solo via nave (`seaLinksOf`). `pesteBlocco` blocca raccolta per 1 turno.

## Costanti chiave
| Costante | Valore |
|---|---|
| `MIN_GARRISON` | 1 |
| `CROCIATA_MINIMO` / `CROCIATA_FORZA` | 6 / 10 |
| `ORDER_MAX_MARKS` | 24 |
| `CHAT_KEEP` | 300 |
| `SeaRoutes.RANGE` Nave / Veliero | 12 / 170 |
| `INNER_COST` Nave mari interni | 12–18 |
| `KNIGHT_VALUE` / `MERC_VALUE` | vedi RISORSE_ECONOMIA |
| Turno mongoli / grande passo | 21 / 36 |
| Peste Nera | turni 35–39 |

## Gotcha obbligatori
- **`?local=1` sempre** in locale — punta Firebase PRODUZIONE senza.
- **Mai `window.confirm/alert`** → `Risiko.confirm({title,text,ok,tone}, onYes)`.
- **`MultiplayerSync` è `const`**, NON su `window` → `typeof MultiplayerSync !== 'undefined'`.
- **`provincePaths()`** non `querySelectorAll('path.state')` crudo (clone alone costiero).
- **`markerIndex`** non query in cicli su province (`refreshMapDisplay` ~20 ms budget).
- **`ownsBoard(player)`** su ogni pop-up che muta stato (admin non consuma pergamene).
- **`data/embedded_map.js`** MAI leggere per intero (~325K token).
- **`function` non `const` arrow** per alias in `app.js` (TDZ in `initMap`).
- **`DEV_ADMIN_BYPASS = true`** solo per test; `false` prima del rilascio.

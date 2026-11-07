# Eventi storici, Obiettivi e Sistemi correlati

## Framework eventi (`js/events.js`)
- Modulo **puro**: descrittori `{id, turn, fino, tipo, titolo, testo, nota, dato, onStart, onRound, onEnd}`.
- **L'unico che applica** è `game-actions.js`: `applyEvents(turn)` + `tickEvents(turn)` in `endTurn`, **prima** di scismi/razzie/rifornimenti.
- `onStart(ctx)` chiama i verbi di `ctx`: `muster`, `assault`, `pact`, `notify`, `spawnKingdom`, `reinforce`, ecc. (tutti in game-actions).
- Verbi non ancora implementati = `eventTodo`, fallisce a voce alta.
- **Stato persistente**: `R().eventi() = { attivi:[{id,dal,fino,stato}], fatti:[] }`. `fatti` è la guardia anti-doppio-scatto.
- One-shot (`fino:null`) non entra negli `attivi`; solo ticking resta e prende `onRound`/`onEnd`.
- `tickEvents` salta l'evento nel suo stesso giro di scatto (`rec.dal === turn`).
- Avvisi al giocatore: `player.eventiAvvisi` → `showPendingEventi` in player-board (testa alla catena pergamene).

## Prima Crociata (turno 11, one-shot)
- **Francia → Aleppo** (non più Bisanzio). Oste radunata dalla `regione` più piena del regno francese (`MED_FR` in objectives.js).
- Drena le vere truppe (`ctx.muster`), senza ripiego se <6 uomini (`CROCIATA_MINIMO = 6`). Tetto 10 (`CROCIATA_FORZA`).
- `ctx.assault`: battaglia vera (`applyBattleOutcome`), terreno del difensore, nessun vincolo adiacenza.
- Funzione condivisa con la crociata inglese: `crusadeHost` in events.js.
- Avviso: `ctx.notify` → `player.eventiAvvisi` → pergamena `crociata`.

## Crociata inglese (turno 21, one-shot)
- **Inghilterra → Palestine** (Gerusalemme). Raduno: `da: 'Home_Counties'`.
- Stessa `crusadeHost`. La quota è il **90%** (`quota: 0.9`) degli uomini in Home Counties.
- Scatta al passaggio al turno 21 in `endTurn` (prima che chiunque giochi il ciclo 3).

## Invasione mongola (turno 21)
- **Non è scriptata**: nasce un regno nuovo governato dall'IA (`predone`) con `ctx.spawnKingdom`.
- Province: Urga, Uliastai, Buryatia — 35 uomini (20 cavalieri + 15 fanti).
- **Nessuna pergamena globale**: la nebbia lo tiene segreto finché non arriva ai confini.
- Dottrina `Mongoli` in doctrines.js: `marcia` verso occidente, `soloMete`, `nessunPatto`, `senzaFede`.
- **Ondate di rinforzo** ogni 5 turni fino al 1350 (`rinforzo: {ogni:5, reclute:10, perProvincia:1, finoAl:35}`).
- **Grande passo del 1350** (turno 36): `orda.dottrinaSospesa = true`, `orda.bot = 'costruttore'`.

## Selgiuchidi (turno 9)
- Province: Tabriz, Urmia, Erzurum, Diyarbakir (6 uomini), con ripiego su confinante libera.
- Marcia: altopiano→Terra Santa→Costantinopoli→Eastern Thrace. Nemico: Bisanzio.
- **Leva di dottrina** (`levaCiclo: 5`): 5 reclute libere a ogni ciclo chiuso (`closeCycle`), alternativa alla leva degli obiettivi.

## Portogallo (turno 11)
- Province: Beira, Estremadura (Portugal), Alentejo. 5 uomini. Solo dove è libero, senza ripiego.
- 2000 monete + 3 Legno all'avvio. `soloMare` + `conservatore`: sbarca solo su coste libere.

## Bulgaria (turno 11), Norvegia e Svezia (turno 24)
- Bulgaria: Moldavia/Bessarabia/Dobrudja/Wallachia. `soloMete`, meta = Bulgaria, amici con tutti tranne Ungheria.
- Norvegia e Svezia: Western Norway / Gotaland, 10 uomini. Danimarca vietata. Meta condivisa: Finlandia.

## Peste Nera (turni 35-39)
- Colpisce **ogni regno in gioco** (compresi regni d'evento e Orda).
- `GameRules.plagueTier(migliorieSanità)`: 0-1 → morti in Capitale e più popolosa, raccolto bloccato; 4-5 → immune.
- `GameActions.eventDecimate` (dietro `ctx.decimate`): presidio minimo rispettato, mercenari cadono per primi.
- Blocco raccolta: `regno.pesteBlocco` scritto da `eventDecimate`, consumato in `beginTurn` del giro dopo.
- Pergamena tipo `peste` per ogni colpo.

## `spawnKingdom` (verbo `game-actions.eventSpawnKingdom`)
- Crea regno a partita in corso, lo accoda all'ordine (`append` in fondo).
- `endTurn` rilegge l'ordine VIVO (`ordAfter`) prima di ruotare.
- `soloLibere`: scarta province già di un regno; `ripiego` cerca confinanti libere; `minProvince` = soglia minima.
- **Non nasce con la Capitale**: la costruisce da sé.
- Regno con lo stesso nome già esistente: **RIUSATO** (non clonato) — il nome è chiave di dottrina e obiettivi.
- **Non entra nel sorteggio umano** (`NON_SORTEGGIABILI` in setup.js).
- **Grazia dell'insediamento** (`player.nato`): usata da `Popularity.graceBonus(turno, nato)`.

## Cronache (`js/chronicles.js`)
- **Vignette di colore**, NON eventi datati. Scattano su soglie di situazione (`Risiko.objectiveContext`).
- Modulo puro: `CHRONICLES` di descrittori + `Chronicles.pick(sit)`.
- **Tre leve anti-spam**: una sola per regno (`cronacheFatte`), due dello stesso gruppo non alla volta, cooldown di 5 turni (`COOLDOWN`).
- `showPendingCronache` in player-board: **ultima** della catena pergamene, una per turno, solo nel turno del regno che si mostra.
- Specifica di un regno viene PRIMA nel catalogo e soffoca la generica dello stesso gruppo.

## Obiettivi §10 (`js/objectives.js`)
- Binario storico per regno, generatore di obiettivi, leva di ciclo.
- `closeCycle`: al termine di ogni ciclo chiude i vecchi obiettivi e assegna i nuovi (`ensureAssignment`).
- Numeri esatti degli obiettivi → vedi `docs/BINARI_STORICI.md`.
- **Cambiare gli obiettivi**: si modifica `js/objectives.js`. La modifica vale dal ciclo successivo.

## Spie (`js/spies.js`)
- 300 monete, 3 turni, 3 per regno, bersaglio entro 5 confini, solo dove non si vede già.
- `Spies.active(spie, turno)` filtra a ogni lettura — la scadenza si calcola, non si salva.
- Scelta dalla mappa con `markTargets(null, ids, 'spia')`. Unico ordine senza provincia di partenza.
- `spyTargets` non dice di chi sono le province (quello si compra con la spia).
- Spia nemica = **invisibile** lato client (il set `spie` esce da `computeVisibleProvinces(focus.name)`).
- I bot non comprano spie (leggono lo stato vero).

## Spedizioni (`game-actions.js` + `sea-routes.js`)
- Solo Veliero, solo umano. Rotta lunga che NON si conclude nel turno.
- `player.spedizioni = [{id, dir, carico, merc, x, y, turno}]` sul record del giocatore.
- `advanceExpeditions` in `beginTurn`: avanza + pedaggio naufragi.
- **Naufragi**: `wreckTollFraction` → 10% della ciurma per ogni turno in mare (da t=1 con prob 15%).
- `expeditionLand`: stessa regola di conquista, sbarco totale (niente `player.conquista`).
- Nebbia: spedizioni nemiche non visibili. `renderExpeditions` solo per il regno focalizzato.

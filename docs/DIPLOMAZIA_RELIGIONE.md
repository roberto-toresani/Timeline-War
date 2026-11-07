# Diplomazia e Religione — Implementazione

## Cinque patti (`Diplomacy.GRANTS`)
- `alleanza`: tutti i privilegi, senza scadenza.
- `alleanzaTempo`: tutti i privilegi, dura `Diplomacy.TIMED = 5` turni poi scade gratis.
- `nonBelligeranza`: solo non-aggressione.
- `rinforzi`: solo accesso militare (rinforzo verso alleato in spostamento finale).
- `vista`: visione condivisa del territorio alleato (§9.2 `computeVisibleProvinces`).

## Regole patti
- **Mutui**: `bondPact`/`unbondPact` scrivono su **entrambi** i record.
- **Solo l'alleanza costa a romperla**: −1 prestigio (`Diplomacy.BREAK_PRESTIGE`). Patti leggeri gratis.
- **Attacco a un alleato**: consenso (`grantAttack`, permesso una-tantum, non rompe) o tradimento (rompe tutti i patti, −2 se alleanza). Solo al commit della battaglia.
- `expirePacts()` in `endTurn` scioglie le alleanze a tempo scadute senza costo.

## Rinforzi (privilegio `rinforzi`)
- **Chiedere** (`askReinforcements`): messaggio con provincia dove servono, TTL 5 turni.
- **Mandare in fase attacco** (`sendReinforcements`): marcia in aiuto su alleato confinante, non consuma lo spostamento finale.
- **Tradire dalla plancia**: `askAttack` passa il 7° argomento `tradimento`; bottone `.moh-go.betray` rosso.
- Sulla mappa: retino **oro** per provincia alleata rinforzabile.

## Standing (`Diplomacy.standing`)
- Da −100 a +100, con `why[]`. Vista di `me` su `altro`, solo dal registro di `me`.
- Voci: patti, **fede** (+18 stessa confessione, +9 famiglia, −10 diversa), scambi conclusi, aiuti ricevuti (`aiuti`), aggressioni subite (`aggressioni`), patti rotti, confinare senza accordi.
- **Il tempo sbiadisce** (`fade`): pieno entro 10 turni, 0.6 a 20, 0.35 dopo.
- `standingWith` **memoizza per chiamata** (`relCache` in `bestAttack`).

## Bot e diplomazia
- **La fede blocca prima**: famiglie diverse non firmano niente (tranne eventi-crociate).
- **La dottrina**: nemico dichiarato → mai trattare; amico storico → sempre trattare.
- **Solo per bisogno**: propone non-belligeranza solo al vicino nettamente più forte. Max `PACT_MAX = 2` patti.
- `diploAnswers` risponde agli araldi (accetta patti leggeri, alleanze solo se partner non è preda).
- Il rapporto pesa sull'attacco (`relationFactor` in `bestAttack`): non è un divieto, è un moltiplicatore. La dottrina (nemico/meta) lo ignora (`fattore = 1`).

## UI diplomazia
- **Foglio 🕊 "peek"** (non copre la mappa): passare sopra una scheda accende i confini.
- **Pannello araldi** (`renderDiplomacy`, `#bp-diplomacy`): proponi, patti attivi, araldi alla porta.
- **Pop-up a inizio turno**: `showPendingPactProposals` (araldo, Accetta/Rifiuta, Esc = decidi dopo); `showPendingPactNotices` (esiti, pergamena tipo `patto`/`tradimento`).
- `diploKingdomsVisibili` = i regni visibili (nebbia inclusa).
- `breakPactButton`: unico punto per sciogliere i patti.

## Religione
- Fede di ogni provincia in `data-religione`, seminata a `initMap` se assente.
- **Fede di stato** = confessione della Capitale (`Risiko.stateReligionOf`).
- Assegnazione di partenza: `start_religions.js` (eccezioni per nome) + `Religions.faithByRegion` (blocchi rettangolari).

## La fede segue la spada
- `convertOnConquest` dentro `applyBattleOutcome`: unico punto (terra, sbarco, editto).
- Fede del vincitore letta **prima** di applicare la conquista (la Capitale nemica ancora esiste).
- `imposedFaithOf`: per regni senza fede (`senzaFede`, oggi solo Mongoli) restituisce null → la provincia mantiene la sua fede, nessun vincolo `data-fede-conq`.

## Riallineamento del regno
- `syncKingdomFaiths` (in `applySchisms` a ogni giro completo + `Risiko.syncStateFaiths()` al cambio Capitale): riallinea ogni provincia con proprietario alla fede di stato corrente.
- `syncStateFaiths()` chiamata da `seatCapital`, costruzione prima Capitale, `moveCapital`, `resolveCapital`.
- **Fede assimilata** (senzaFede = Mongoli): `assimilatedFaithOf` legge la confessione della maggioranza delle province possedute.

## Scismi
- Due scismi nel calendario: **Grande Scisma** (turno 5, anticipato), **Riforma** (turno 52 = 1510-1519, anno storico).
- `Religions.SCHISMS` → applicati da `Risiko.applySchisms` in `endTurn`.
- Avviso su `player.eventiAvvisi` di **ogni regno** (pergamena globale): NON più `showFoundation` diretto.
- Lo scisma raggiunge la Capitale anche se vincolata (`isCapitalSeat`).

## Terre di nessuno e fede
- `neutralRaids` a giro finito in `endTurn` (prima del rifornimento neutrale).
- Una neutrale di fede diversa razzia il vicino-giocatore più debole se schiaccia 3-contro-1.
- **Una sola razzia per giro** (a sorte fra le candidate).
- Provincia razziata torna neutrale coi superstiti; una Capitale razziata si declassa a Città.

## `ownsBoard` — regola fondamentale
- Ogni pop-up che consuma stato (editti, eventi, patti, cronache, conquista, schieramento obbligatorie) passa da `ownsBoard(player)`.
- Consuma solo se `invitePinned` (giocatore col suo link) oppure regno senza giocatore assegnato.
- Admin che sbircia un regno preso: la pergamena NON si tocca.

# Eventi Storici, Spie e Spedizioni

## Framework eventi (`js/events.js`)
- Modulo puro: descrittori `{id, turn, fino, tipo, titolo, testo, onStart, onRound, onEnd}`.
- **Solo `game-actions.js`** applica: `applyEvents(turn)` + `tickEvents(turn)` in `endTurn`, prima di scismi/razzie.
- `onStart(ctx)` usa verbi: `muster`, `assault`, `pact`, `notify`, `spawnKingdom`, ecc.
- Stato persistente: `R().eventi() = { attivi:[...], fatti:[] }`. `fatti` = guardia anti-doppio scatto.
- `tickEvents` salta l'evento nel suo stesso giro di scatto (`rec.dal === turn`).

## Prima Crociata (turno 11)
Francia → Aleppo. Oste radunata dalla regione più piena (`MED_FR`).
Drena le vere truppe (`ctx.muster`). Min 6 uomini (`CROCIATA_MINIMO`), tetto 10 (`CROCIATA_FORZA`).
Funzione condivisa: `crusadeHost` in events.js.

## Crociata inglese (turno 21)
Inghilterra → Gerusalemme, da `Home_Counties`. Quota 90% degli uomini presenti.

## Invasione mongola (turno 21)
Nasce regno IA `predone` (`ctx.spawnKingdom`). Province: Urga, Uliastai, Buryatia — 35 uomini.
Dottrina: marcia verso occidente, `soloMete`, `nessunPatto`, `senzaFede`.
Rinforzi ogni 5 turni fino al 1350. **Grande passo turno 36**: `dottrinaSospesa=true`, bot → `costruttore`.
**Ritiro dell'Orda turno 31** (regola dell'utente, `INVASIONE_MONGOLA.ritiro`): l'Orda tiene solo Tianshan, Dzungaria,
Uliastai, Altai, Tuva, Gansu, Alxa; tutte le altre sue province tornano neutrali con **3 uomini** (`ctx.release` →
`GameActions.eventRelease`: Capitale→Città, via ventura/cavalieri/navi, vincolo di fede sciolto, strade potate).
Poi `dottrinaSospesa`, bot → `costruttore` (Chiuso), `controllo:'ai'`, niente più ondate; `player.ordaRitirata`
impedisce di ripeterlo. Pergamena "L'Orda si ritira" all'Orda e ai regni confinanti. Il presidio poi segue il
calendario normale delle neutrali (si alza soltanto): le terre del core salgono a 4 già dal turno 31.

## Selgiuchidi (turno 9)
Province: Tabriz, Urmia, Erzurum, Diyarbakir (6 uomini). Marcia → Terra Santa → Costantinopoli.
`levaCiclo: 5` — 5 reclute libere a ogni ciclo chiuso.

## Sultanato di Delhi e Impero Giapponese (turno 31)
- **Sultanato di Delhi**: Delhi, Rajputana, Punjab (5 uomini ciascuna), 1500 monete, fede musulmana, Equilibrato; mete Gujarat, Central_India, Awadh, Sindh.
- **Impero Giapponese**: Chugoku, Kansai, Shikoku (5 uomini ciascuna), 1500 monete, fede dharmica, Equilibrato; mete Kyushu, Chubu, Kanto, Tohoku. Una Città nel Kanto si chiama Edo.
- Obiettivi: un capitolo fisso ciascuno (`objectives.js`, ciclo IV).

## Portogallo (turno 11), Bulgaria (turno 11), Norvegia+Svezia (turno 24)
- **Portogallo**: 5 uomini, `soloMare`+`conservatore`, 2000 monete + 3 Legno all'avvio.
- **Bulgaria**: carattere Chiuso, `soloMete` → Bulgaria; alleanza cercata con la Rus' e non belligeranza coi Bizantini (`pattiAmici`); nemica l'Ungheria, nessun patto coi musulmani.
- **Portogallo**: carattere Mercante (`opportunista`).
- **Impero del Mali** (creato dall'admin, nessun evento): Equilibrato; `custodia` contro i Mori a sud della sua frontiera settentrionale.
- **Norvegia+Svezia**: 10 uomini, Danimarca vietata, meta condivisa Finlandia.

## Peste Nera (turni 35-40 inclusi)
Colpisce tutti i regni, ogni turno; nessuno è immune. `plagueTier(sanità)` → uomini persi:
| Sanità | Capitale | ogni Città | province più popolose (no Capitale/Città) | raccolto |
|---|---|---|---|---|
| 0 | 3 | 2 | 2 in **tutte** | bloccato |
| 1 | 3 | — | 2 nelle top 3 | bloccato |
| 2 | 2 | 2 | 2 nelle top 3 | bloccato |
| 3 | 1 | 2 | 2 nelle top 3 | libero |
| 4 | 1 | 1 | 1 nelle top 3 | libero |
| 5 | 1 | 1 | 1 nella più popolosa | libero |
`eventDecimate`: presidio minimo rispettato, mercenari cadono per primi.
`pesteBlocco` su `player`: consumato in `beginTurn` del giro dopo.

## `spawnKingdom`
Crea regno a partita in corso, accodato in fondo all'ordine.
`endTurn` rilegge ordine VIVO (`ordAfter`) prima di ruotare.
`soloLibere`: scarta province già di un ALTRO regno; `ripiego` cerca confinanti libere.
Una provincia già del regno che nasce (record riusato, assegnata dall'editor) conta come libera: prende i suoi uomini lì, niente ripiego (bug del 1300: Delhi finiva su Ngari/Awadh/Central_India, il Giappone su Kyushu).
Non nasce con la Capitale. Nome già esistente → RIUSATO (non clonato).
`NON_SORTEGGIABILI` in setup.js. `player.nato` → `Popularity.graceBonus`.

## Cronache (`js/chronicles.js`)
Vignette di colore (non eventi datati). `Chronicles.pick(sit)` su soglie di situazione.
Anti-spam: una sola per regno, cooldown 5 turni, due dello stesso gruppo non insieme.
`showPendingCronache` in player-board: ultima della catena pergamene.

## Spie (`js/spies.js`)
300 monete, 3 turni di durata, max 3 per regno, bersaglio entro 5 confini.
`Spies.active(spie, turno)`: scadenza calcolata a ogni lettura, non salvata.
`markTargets(null, ids, 'spia')`: unico ordine senza provincia di partenza.
I bot non comprano spie (leggono lo stato vero direttamente).

## Spedizioni (`game-actions.js` + `sea-routes.js`)
Solo Veliero, solo umano. Rotta lunga che non si conclude nel turno.
`player.spedizioni = [{id, dir, carico, merc, x, y, turno}]`.
`advanceExpeditions` in `beginTurn`: avanza + pedaggio naufragi (10% per turno, prob 15% da t=1).
`expeditionLand`: conquista normale, sbarco totale.

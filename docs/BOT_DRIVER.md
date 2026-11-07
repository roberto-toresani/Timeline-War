# Bot, IA e Driver — Implementazione

## Regole base bot
- **Solo chi è admin muove i bot** (`Risiko.isAdmin()`): `Bot.run()` ha il gate.
- I bot chiamano le stesse funzioni di `game-actions.js` del giocatore → ogni regola nuova vale anche per loro.
- Il turno di un bot è un **generatore**: ogni `yield` è un'azione già applicata, poi aspetta `Bot.speed()` ms.
- `Bot.STRATEGIES` ha 4 profili: `espansione`, `costruttore`, `opportunista`, `predone`.
- Una strategia in più = una voce in `Bot.STRATEGIES`, non un ramo `if` sparso.
- **Conservatore non esiste**: la difesa è `holdFloor`/`capitalGuard` per tutti.

## Regole essenziali per non bloccarsi
0. **Dove costruire la Capitale** (`capitalScore`): guarda protezione, risorse raggiungibili, uomini presenti.
1. **Popolarità prima di tutto** (`popState` → `Popularity.plan`): tassazione, guardia, valore conquista.
2. **Conquistare attorno alla Capitale solo se serve** (`popValueOf`: spesso risponde zero).
3. **Annettere cibo e tipi di risorsa nuovi** (`roadWorth` preferisce risorse non doppiate, solo se collegabili).
4. **Mercenari solo per chiudere un attacco** (`mercenaryPlan` + `coinReserve`).
5. **Mercato quando manca più di un tipo di risorsa** (con scorte già presenti).
6. **Riserva monete sulla prossima costruzione raggiungibile** (`coinReserve`, non su quella impossibile).

## Istinto di sopravvivenza
- `defenseFloor`: ~3/4 dell'esercito nemico più forte al confine (tetto `DEFENSE_CAP = 12`).
- `raidFloor`: presidio contro razzie neutrali di fede diversa.
- `holdFloor(player, id, salvo)` = max(defenseFloor, raidFloor). Unico numero per "quanti restano".
- `capitalGuard`: in pace segue `guardWanted` (piano §8); con invasore = `holdFloor` della Capitale.
- `raidFloor` salta il bersaglio che si sta attaccando (`salvo`).

## Commerci e banca
- `bankPlan` (banca 2:1): canale sicuro, `resourceNeed` decide cosa comprare.
- `tradePlan` (carovane, max `TRADE_MAX_PENDING`): compra da chi ce l'ha davvero, paga con eccedenze o in oro a prezzo di mercato + sovrapprezzo.
- Prezzo dipende dal bisogno (`resourceNeed` → `goodValue`).
- Non si manda una seconda carovana a chi non ha risposto.

## Navi e sbarchi
- `shipPlan`: arma una Nave sulla costa con più prede oltremare (`seaPreyFrom`), con abbastanza uomini.
- Non arma una seconda nave se c'è già una pronta (`hasReadyShip`).
- `resourceNeed` compra Legno quando il regno "vuole il mare" (`wantsSea`).
- Premio sbarco `+0.8` in `bestAttack` (senza, il mare perde sempre contro terra).

## Diplomazia bot
- **Fede blocca prima**: famiglie diverse non firmano (`canDealWith`).
- **Dottrina**: nemico dichiarato → mai trattare; amico storico → sempre.
- **Solo per bisogno**: propone non-belligeranza solo se il vicino è nettamente più forte. Max 2 patti.
- `diploAnswers`: risponde agli araldi (accetta patti leggeri; alleanza solo se partner non è preda).
- Rinforzi: `helpAskPlan`/`helpSendPlan` — uno per turno per parte.

## Rancore (`player.rancore`)
- Scritto solo in `applyBattleOutcome` (`recordGrudge`), solo per province preziose.
- Pesi: Capitale 3, Città/Fortezza 2, risorsa 1, provincia spoglia 0.
- `clearGrudge`: si spegne se la provincia torna al derubato.
- In bot: premio attacco `× peso × 1.5`; in schieramento "punta" ammassa la lancia sul confine del torto.

## Motore headless (`driver/`)
- Node + Puppeteer: apre l'editor in Chrome headless, login admin, lascia girare il codice del gioco.
- **Un solo motore** — più browser admin che guidano insieme si scrivono addosso.
- **`?nodrive=1`** (`isNoDrive` in app.js): un editor aperto così NON pilota i bot. L'admin usa questo per subentrare.
- Badge avviso in `renderGameControls` quando il motore è attivo.

## Sistema mail
- Quando il turno passa a un giocatore umano: mail personalizzata con link plancia e due scorciatoie autoplay.
- Testi in `driver/mail-templates.js` (10 regni di partenza + ripiego `_default` per regni d'evento).
- Mittente: `risiko.motore.war@gmail.com` (Gmail SMTP, `driver/mailer.js`, nodemailer).
- Senza `SMTP_*` in `.env`: stampa avviso e prosegue **senza** mail.

## Timer 6h
- **Fascia notturna**: 23:30-8:30 (Europe/Rome) non conta. Fonte unica: `GameRules.turnActiveMs`/`turnTimeLeft`/`isTurnQuietTime`.
- Mail aspetta le 8:30 (`!s.quiet` in driver.js).
- **Timbro di consegna dal motore**: `player.turnClockAt`/`player.turnClockFor` scritti dal motore al primo battito che vede il turno.
- `GameRules.turnClockStart(p)`: usa il timbro di consegna se è di QUESTO turno, altrimenti `turnStartedAt`.
- **Non confrontare** il timbro del motore con `turnStartedAt`: sono due orologi diversi.

## Auto-turno
- `GameActions.autoPlayTurn(playerId, mode)`: distribuisce reclute libere (`capitale`/`confini`) poi chiama `endTurn`.
- `?autoplay=confini|capitale` in URL → scatta in `boot()` di player-board.js; la URL viene ripulita.
- Preferenza salvata in `player.autoTurno` (`'niente'|'confini'|'capitale'`).

## Motore in cloud — catena (non cron)
- `.github/workflows/motore.yml`: giri da ~3 ore (`RUN_FOR_MIN: 175`), l'ultimo rilancia il successivo con `gh workflow run`.
- Cron `*/20` come rete se la catena si spezza.
- Invio fallito: `releaseMail` + ritenta ogni 5' (`MAIL_RETRY_MS`).

## Dottrina (`js/doctrines.js`)
- Carattere storico dei regni d'evento: `mete`, `nemici`, `vietate`, `soloMare`, `conservatore`, `soloMete`, `marcia`, `nessunPatto`, `senzaFede`, `levaCiclo`.
- **Marcia** (`marcia`): tappe ordinate con pesi. `Doctrines.march(regno)` restituisce l'asse in fila.
- `marchMove` in bot.js: spostamento finale avanza il grosso verso la punta.
- `dottrinaSospesa`: flag che disattiva la dottrina (Orda al turno 36 diventa `costruttore`).

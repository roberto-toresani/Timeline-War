# Diplomazia, Rapporti, Patti tra Regni e Fede

## 5 tipi di patto (`Diplomacy.GRANTS`)
1. **Non-belligeranza**: nessun attacco reciproco.
2. **Alleanza**: condivisione visione + rinforzi.
3. **Commercio preferenziale**: sconto sulle carovane reciproche.
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

## Standing (`Diplomacy.standing`)
- Numero −100 / +100 per coppia di regni.
- `why[]`: lista motivi (tradimento, patto rispettato, aiuto...); si sfuma nel tempo (`fade`).
- Standing basso blocca nuovi patti anche se fede compatibile.

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

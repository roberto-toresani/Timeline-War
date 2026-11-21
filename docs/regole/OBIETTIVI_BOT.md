# Obiettivi, Percorsi Storici e Linee Guida per Regni IA

## Obiettivi §10 (`js/objectives.js`)
- Binario storico per regno + generatore di obiettivi casuali.
- `closeCycle`: chiude il ciclo corrente e assegna i nuovi (`ensureAssignment`).
- Numeri esatti degli obiettivi per regno → `docs/BINARI_STORICI.md`.
- Modifica obiettivi: si cambia `js/objectives.js`; vale dal ciclo successivo.

## Leva di ciclo (dottrina)
- `levaCiclo: N` in doctrines.js: N reclute libere a ogni `closeCycle`.
- Alternativa alla leva degli obiettivi per regni d'evento con dottrina attiva.

## 4 caratteri bot (`Bot.STRATEGIES`, rev. 2026-11-21)
Le chiavi sono rimaste quelle vecchie (le usano partita in corso, dottrine, eventi); cambiano nome e comportamento.

| Chiave | Nome | Comportamento |
|---|---|---|
| `costruttore` | **Chiuso** | Non attacca (`guerra:'difesa'`): solo riconquista e risposta a chi l'ha invaso negli ultimi 5 turni. Mercato dal 2° turno (`mercatoDa:1`), rinforza i confini, mercenari solo per tappare un confine cruciale (`mercDifesa`). 1 carovana, compra solo ciò che blocca una costruzione, non vende. Offre la non belligeranza a ogni vicino (`diplomazia:'pace'`), alleanze solo con amici di dottrina. |
| `opportunista` | **Mercante** | Niente guerra ai regni (`guerra:'risorse'`): prende solo terre di nessuno con una risorsa, anche via nave. 3 carovane, vende sempre, baratto 0.8. Non belligeranza con tutti, alleanze coi forti. Politica verso il popolo (monete). |
| `espansione` | **Equilibrato** | Conquista quando conviene, commercia, patti per bisogno/guerra in stallo/fede vicina (il comportamento dei giocatori della partita vera). |
| `predone` | **Guerrafondaio** | Soglia bassa, 6 attacchi, premio Capitali nemiche ×3 (`premioCapitale`), mercenari a ogni turno con l'oro libero (`mercLibero`) e fino a 5 cavalieri. Non concede alleanze; non belligeranza solo da chi è più forte o se sta per essere schiacciato. |

- **Cambi di carattere** (`situational`): Guerrafondaio con Popolarità < 3 o Capitale minacciata → 2 attacchi, soglia +0.1, niente mercenari a pioggia. Chiuso con una provincia appena strappata → contrattacco (solo contro l'aggressore e per riprendersi il suo).
- Cosa può attaccare un carattere: `profileAllows` (usato da `bestAttack`, `spearhead`, `shipPlan`).
- La difesa resta `holdFloor`/`capitalGuard` per tutti.
- Una nuova strategia = voce in `Bot.STRATEGIES`, non un ramo `if` sparso.

## Lezioni dai giocatori umani (studio della partita vera, turni 9-12-28)
- **Capitale** sulla provincia centrale del feudo, accanto a grano/pietra anche neutrali (`capitalScore`).
- **Prima l'anello della Capitale**, poi le risorse (`ringBonus`, `resourceBonus`; la prima cava di pietra vale doppio).
- **Punta di lancia**: reclute e spostamenti ammassati su una provincia di partenza (`spearhead`), non spalmati.
- **Strade solo verso risorse o Città**, passando dalle intermedie (`nextRoad`).
- **Province cruciali** (Mercato, Città, risorse) al confine con un regno: almeno 3 uomini (`CRUCIAL_MIN`).
- **Spostamenti dal ciclo III**: una mossa a catena col grosso (`chainMovePlan`) o fino a 3 da 5 uomini.
- **Saper fermarsi**: dopo un assalto respinto, niente ritorno sulla stessa provincia nel turno e margine in più contro quel regno.
- **Patti**: dopo una guerra in stallo e coi vicini della stessa fede; il rancore li blocca (`holdsGrudge`).
- Dottrina: `pattiAmici` (patto per amico), `custodia` (il Mali contro i Mori a sud della sua frontiera).

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

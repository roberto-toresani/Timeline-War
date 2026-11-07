# Meccaniche di gioco — Implementazione

## Turno a fasi
- Ordine fisso: `schiera → costruisci → attacca → sposta` (`GameActions.PHASES`, `player.fase`)
- Si avanza solo con `GameActions.nextPhase()` — nessun ritorno. Il motore rifiuta azioni fuori fase (`requirePhase`).
- `turnoDi`/`ordine`/`primoDelGiro` vivono in `app.js` e vanno nello snapshot.
- **Partita in due tempi**: `prepareGame` (prepara, `turnoDi = null`) → `beginMatch` (avvia, sorteggia l'ordine).
  - Stato "preparata ma non avviata": `ordine` pieno + `turnoDi` null → nessun bot gira, nessuno agisce.

## Schieramento (fase 1)
- **Libere** (province ÷ 3 + modificatore Popolarità): vanno dove vuoi, ritirare/rimettere finché aperto.
- **Obbligatorie** (Capitale +1, Città +1, Fortezza +5): solo nella provincia dell'edificio, posa d'ufficio a fine turno.
- Serbatoi: `recluteDaSchierare`, `recluteVincolate` (per provincia), `schierateTurno` (solo questo è ritirabile).
- Pop-up centrale `showDeployPrompt` a inizio turno: "Schiera tutti (N)" chiama `GameActions.deployAllBound`, una volta per turno.

## Presidio minimo (§5)
- `GameRules.MIN_GARRISON = 1`: **mai** una provincia vuota.
- `GameRules.spendableTroops(n)` è l'unica fonte. Usa sempre `spare(path)` per quanto può partire.
- Rispettato da: attacco, spostamento, costi in soldati delle costruzioni, ritiro recluta, conquista (almeno 1 restante).

## Capitale
- Non regalata all'avvio: si costruisce per **500 monete, 0 uomini** (prima Capitale del regno).
- Strada gratuita nasce dalla **costruzione**, non dall'avvio.
- **Sposta** (`moveCapital`): 500 monete, solo su una propria Città → la vecchia Capitale diventa Città.
- **Conquista nemica**: se non hai una Capitale è adozione automatica; se già ce l'hai → declassata a Città + `player.capitalePresa` apre la scelta per l'umano.
- Tutto il trasloco fisico sta in `seatCapital` (game-actions.js), chiamato da `moveCapital`, `resolveCapital` e `applyBattleOutcome`.

## Conquista e modale
- Vinta la battaglia con >1 superstite: `player.conquista` aperta, blocca ogni azione.
- `resolveConquest(player, occupanti)` decide chi occupa e chi rientra (almeno 1 deve occupare).
- **Modale `#ui-conquest`**: appare CENTRALE sopra la mappa, una volta per presa. "Decido dopo" → apre `#bp-conquest`.
- **Sbarco = conquista totale**: `player.conquista` NON si apre — chi scende resta a terra.

## Spostamento finale (fase 4)
- **Un solo spostamento** per turno (`player.spostamentoFatto`), fra province proprie confinanti (un solo confine di terra).
- **Via nave** (con scafo ancorato alla partenza): verso propria costa o di **ALLEATO** con privilegio `rinforzi` — entro la portata dello scafo; la nave resta ancorata all'arrivo verso una tua, **rientra** verso un alleato.
- **Due clic**: la partenza va "armata" (`moveArmed`) prima — clic su propria provincia accende le partenze possibili, non è un ordine. Ricliccare libera; bottone "↩ Cambia partenza" nel pannello.
- `moveArmed` si azzera da sé a cambio di fase vera (in `viewPhase`/`openFolder`) e all'ingresso in un regno.

## Mercato e incompatibilità
- Mercato non convive con Capitale, Città o Fortezza — e viceversa: `canPlacePiece` in `app.js` è l'unico punto.
- Bot: `siteFor` scarta province col Mercato per gli insediamenti, e vice versa.

## Demolizione (fase 2)
- **Mercato → 2 uomini + 100 monete**; **Nave (barca) → 1 uomo + 1 Legno**. MAI il Vascello.
- Solo su proprie province in fase `costruisci`.
- Uomini recuperati rispettano il tetto d'impilamento (`roomFor`).
- In plancia: bottone semplice `demolitionGroup` (non tessera-icona), uno per Mercato/scafo trovato.

## Neutrali
- `GameRules.neutralGarrison(turn)`: 2 (turni 1-10), 3 (11-20), … fino a `NEUTRAL_MAX = 6` (dal turno 41).
- **Terre lontane** (Americhe, Asia, Africa sub-sahariana): restano a 2 per i primi 50 turni, poi al massimo 3 (`isFarProvince`).
- `garrisonNeutrals()` unico punto — solo alza, mai abbassa; gira all'avvio e a ogni giro completo.
- **Razzia solo a 3 contro 1** (`neutralCanRaid`): 4 neutrali contro 1 difensore è il caso limite. `neutralSafeGarrison` è il rovescio.
- **Una sola razzia per giro** (`neutralRaids`): una candidata a sorte, non una per ogni neutrale.
- Una Capitale razziata si declassa a Città (o rimane senza Capitale, bloccandosi).

## Due attacchi (§9)
- Sopra i 10 uomini per parte: il primo attacco (`firstCharge`) non conquista ma fa perdite; il secondo (`resolveBattle`) è la battaglia finale.
- `player.primiAttacchi = [{from, to, turno, consenso}]`.
- Chi non può fermarsi usa `resolveFullBattle` (sbarchi, editti, crociate, razzie).

## Limite di conquista
- Sotto 1,5 attaccanti per difensore (in forza effettiva): `P_A = 0` — impossibile conquistare. `winForecast` mostra 0%.
- Non si spiega in gioco di proposito: i giocatori lo imparano.

## Dove non modificare mai
- **Solo `game-actions.js` muta lo stato** — mai `PLAYERS` direttamente.
- `applyBattleOutcome` è l'unico punto della regola di conquista (vale per terra, sbarco, editto).
- `spare(path)` / `spendableTroops(n)` sono le uniche fonti del presidio minimo.

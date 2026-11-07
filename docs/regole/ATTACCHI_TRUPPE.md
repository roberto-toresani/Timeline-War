# Attacchi, Difese, Invasioni e Truppe

## Fasi attacco
- `firstCharge`: primo attacco del turno (flag `player.firstCharge`).
- `resolveBattle(from, to, units)`: calcola esito, ritorna `{won, lossA, lossD}`.
- `resolveFullBattle`: applica esito, aggiorna province, modale conquista.
- **Due attacchi per turno** (contati da `player.attacchi`).
- Limite conquista: attaccante deve avere ≥ `1.5 × difensori` per essere favorito.

## Presidio minimo
- `MIN_GARRISON = 1` (GameRules): una truppa rimane sempre.
- `spendableTroops(path)` = `countPiece(path,'uomo') − MIN_GARRISON`.
- Cavalieri contano come truppe per il presidio ma hanno `KNIGHT_VALUE` separato.

## Conquista e modale
- Conquista apre `#ui-conquest`: scelta quante truppe portare nella provincia.
- `player.conquista` tiene traccia della conquista pendente in quel turno.
- `ownsBoard(player)` su ogni azione del modale — l'admin osservatore non deve consumare pergamene.

## Capitale
- Costruzione: una per regno, in `costruisci`. `seatCapital(id)`.
- Spostamento Capitale: costa 500 monete + un'azione costruzione.
- Conquista Capitale nemica: il regno perde metà truppe su tutte le province.
- Senza Capitale: `province÷3` reclute libere (non il normale calcolo).

## Spostamento finale (`moveArmed`)
- Solo nella fase `sposta`: trascina truppe da A a B adiacente o via nave.
- Via nave: richiede scafo con capienza, provincia costiera di partenza e arrivo.
- `reachCached` obbligatorio nei cicli di render per le portate.

## Neutrali
- `neutralGarrison`: presidio fisso delle province neutrali.
- `isFarProvince`: province lontane dalle Capitali iniziali, presidio maggiore.
- `neutralCanRaid`: neutrali di fede diversa possono razziare confini.
- **Una razzia per giro** per ogni neutrale (`neutralRaids` in `endTurn`).

## Demolizione
- Mercato → rimane con 2 uomini + 100 monete di rimborso.
- Nave → rimane con 1 uomo + 1 Legno.
- **Mai demolire il Vascello** (non è implementato, non ha path di demolizione).

## Schieramento libere / obbligatorie
- Reclute libere: distribuite a piacere nelle province del regno.
- Reclute obbligatorie (da Capitale): almeno 1 in Capitale se sotto soglia.
- In `schiera`: `GameActions.deploy(playerId, provinciaId, qty)`.

# Popolarità, Benessere, Politica e Tassazione

## Formula Popolarità
`Popularity.score(player, turn)` → numero 0-100.
`Popularity.plan(player)` → consigli operativi per il turno.
`popularityFactors(player)`: raccoglie i fattori (tasse, guardia, conquiste, eventi...).

## Fattori chiave
- **Tassazione**: tassa pesante penalizza; tassa leggera lascia il popolo contento.
- **Guardia**: presidio alto nelle province popolose migliora sicurezza → popolarità.
- **Conquista**: conquistare province di fede diversa abbassa la popolarità.
- **Politica**: scelte nobiltà ↔ popolo influenzano il valore di ogni fattore.

## Trappola turno 1
Tassa leggera + guardia a 10 al primo turno → pop sufficientemente alta al turno 2.
Senza questa base si entra nel ciclo decrescente difficile da invertire.

## Grazia insediamento
`player.nato` = turno di nascita del regno.
`Popularity.graceBonus(turn, nato)`: bonus decrescente nei primi turni (regni d'evento).

## Politica del regno (`js/politics.js`)
Asse **nobiltà ↔ popolo**: ogni scelta sposta l'ago.
- Nobiltà: esercito più forte, tasse più alte tollerate, meno produzione.
- Popolo: costo reclute ridotto (apposta), produzione maggiore, meno toleranza militare.
`player.politica` = valore corrente dell'asse; impatta `popularityFactors`.

## Festa §6.1
`joyTier(player)`: livello festa (0-3) in base a produzione e popolarità.
`discountedCost(player, tipo)` / `costFor(player, tipo)`: sconto costruzioni durante festa.
`payConstruction`: applica il costo scontato.
La festa si attiva automaticamente se le condizioni sono soddisfatte al momento della costruzione.

## Impatto Peste Nera (turni 35-39)
`plagueTier`: 0-1 → morti in Capitale e provincia più popolosa, blocco raccolta.
`pesteBlocco` su `player`: blocca `beginTurn` della produzione per 1 turno.
Sanità alta (4-5) → immune alla Peste.

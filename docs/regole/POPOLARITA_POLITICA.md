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

## Festa / Malcontento §6.1
`joyTier(felicita)`: legge le **migliorie di Felicità sulla Capitale (0-5)** — non produzione/popolarità — e piega i costi del turno, **dentro il prezzo** (`costFor`), mai come rimborso: un acquisto non può far crescere il tesoro.
- **0-1 Malcontento**: +100 monete sulle costruzioni in monete, +1 su **1 risorsa sorteggiata a turno** (`festaMalusRes`) per quelle senza monete (turno con Pietra → Strada = 2 Pietre).
- **2**: niente.
- **3**: sconto −1 su 1 tipo di risorsa sorteggiato. **4**: su 2 tipi.
- **5**: come 4 + −50 monete sugli acquisti grandi (Città, Fortezza, Mercato, Vascello; la Nave no, non costa monete).

Lo sconto di risorsa non tocca mai i costi a un solo tipo (Strada, Nave, migliorie §6.1). `beginTurn` sorteggia i tipi scontati una volta a turno → `player.festaRisorse` / `festaMalus` / `festaBonusGrandi`. `payConstruction` paga e basta (il costo è già piegato da `costFor`).

## Impatto Peste Nera (turni 35-39)
`plagueTier`: 0-1 → morti in Capitale e provincia più popolosa, blocco raccolta.
`pesteBlocco` su `player`: blocca `beginTurn` della produzione per 1 turno.
Sanità alta (4-5) → immune alla Peste.

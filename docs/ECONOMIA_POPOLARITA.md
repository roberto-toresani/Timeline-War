# Economia e Popolarità — Implementazione

## Formula Popolarità
- **Formula pura in `js/popularity.js`**: `app.js` misura i fattori (`popularityFactors`) e li passa a `Popularity.score`.
  - Stesso modulo usato da pannello umano e IA → non possono divergere.
- **Fattori** (tutti in `app.js`): `P_conf` (province nemiche al confine Capitale), guardia, generale, varietà risorse, cibo, tassa.
  - "Nemica al confine" = ogni provincia non tua, terre di nessuno comprese.
  - **Risorse** = tipi diversi COLLEGATI (§4); **Cibo** = province Grano/Bestiame collegate (max 5).

## Piano — il rovescio della formula
- `Popularity.plan(fattori, target)`: data la situazione, qual è la combinazione più economica di tassazione e guardia che raggiunge il target?
- Se il target è irraggiungibile, sceglie ciò che massimizza il `potential` (non quel che costa meno).
- I bot lo usano (`popState` in bot.js) per decidere tassazione, guardia Capitale e valore di ogni conquista.

## Trappola del turno 1
- Al turno 1: nessuna Capitale → `P_conf = 0`; guardia < 10 → `P_guardia = 0` → Sicurezza = 0.
- Con 1 strada: Benessere = 1. Tassa normale 3 → Popolarità **1** = −2 reclute, −2 risorse.
- Uscita: **tassa leggera + guardia a 10** (a scatti: 5→0pt, 10→5pt — 7 è sprecato, 12 sono due buttati).
- La trappola è voluta (il §8 non si tocca); i bot la risolvono da soli via `plan`.

## Produzione e raccolta
- `GameRules.connected` + `connectedOf`: BFS dal territorio, 4° arg `seaLinks` per isole via nave.
- **Isole via nave** (§4): una provincia con tua nave si aggancia alla rete se lo scafo raggiunge un hub (Città/Capitale) nella sua portata.
- `seaLinksOf` è l'UNICO punto → plancia, bot e obiettivi non divergono.

## Senza Capitale
- Arrivano solo: **province ÷ 3** reclute libere. Niente monete, niente raccolto, niente rinforzi da edifici.
- Regola in `KingdomStats.reinforcements` (mostra nel cruscotto) **e** `turnProduction` — devono coincidere.
- Politica: si congela, `politicsDrift` non scatta.

## Politica del regno (`js/politics.js`)
- Nobiltà ↔ lavoratori: decide **come si divide** fra reclute e raccolto, non QUANTO (quello resta la Popolarità).
- Modulo puro; muta solo game-actions.js; disegna solo player-board.js.
- Scala: 5 gradi da −2 a +2. Il popolo (lavoratori) costa meno apposta — costruire a basso costo.
- `Politics.canIssue`: senza Capitale non si siede il Consiglio, il grado si congela.

## Commerci (§7)
- Proposta da regno visibile (anche via spia). Accettazione chiude l'affare in `acceptTrade` (l'unico punto).
- `recordTrade` scrive `commerciStorico` su **entrambi** i record + avviso solo al proponente (`commerciAvvisi`).
- **Avviso a inizio turno**: `showPendingCommerci` srotola la pergamena una volta sola (`letto`).
- **Storico + "↻ Riproponi"**: ricompila i termini verso lo stesso regno in un click.
- Bot: `tradePlan` (carovane) + `bankPlan` (banca 2:1). `resourceNeed` decide cosa comprare (non la scorta più bassa). Non si manda una seconda carovana a chi non ha risposto.

## Festa §6.1
- **Non è un evento a calendario**: è un privilegio permanente, sempre valutato.
- `GameRules.joyTier` legge le migliorie di Felicità sulla Capitale (0-5).
- Tier 2: 1 tipo di risorsa scontato; tier 3: 2 tipi; tier 4-5: 2 tipi + 100 monete a ogni costruzione pagata.
- I 2 tipi scontati sono sorteggiati da `beginTurn` una volta per turno (`player.festaRisorse`) — non cambiano durante il turno.
- **Chi chiede UN solo tipo di risorsa non è mai scontato** (Strada, Nave, ogni miglioria §6.1).
- `GameRules.discountedCost` applica lo sconto; `costFor` è l'UNICO punto da cui UI e motore leggono il prezzo.
- `GameActions.payConstruction` versa il bonus in monete; non vale per `moveCapital` (non costruisce).

## Pest Nera (§ eventi — rilevante per economia)
- `GameRules.plagueTier`: 0-1 migliorie Sanità → muore gente in Capitale e nella più popolosa, bloccate le risorse.
- 4-5 migliorie: immune. I blocchi vivono in `regno.pesteBlocco`, consumati in `beginTurn`.
- Le province colpite restano collegate (§4) — il blocco è solo sul raccolto di quel turno.

## Mercenari (§5.3)
- 150 monete, permanenti (`GameRules.TEMPORARY` contiene solo la Guarnigione).
- Quota sul PATH (`data-merc`), invariante `data-merc ≤ soldati`.
- In battaglia: valore 0.85 ± 0.25 (`MERC_VALUE`/`MERC_SPREAD` in battle.js).
- Partono in quota proporzionale (`GameRules.mercShare`); cadono per primi nelle perdite.
- `mercLeaving(from, n)` prima di togliere soldati; `addMerc(to, …)` all'arrivo.

## Cavalieri
- Disponibili dal ciclo II (turno 11), `GameRules.UNLOCK_TURN`.
- Quota sul PATH (`data-cav`), invariante `merc + cav ≤ soldati`.
- Valore 1.45 in campo aperto, 0.9 vs Città, 0.7 vs Fortezza; terreno chiuso moltiplica per 0.75.
- Fanti e cavalieri sono reparti distinti nella UI (`squadRowsHtml`, cursore con due righe).
- `troopsLeaving` e `casualtySplit` gestiscono chi parte e chi cade.

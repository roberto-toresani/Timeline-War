# Sistemi di Raccolta, Risorse, Bonus e Malus

## Produzione e raccolta
- `beginTurn`: raccoglie risorse e monete per il regno che inizia il turno.
- Risorse connesse: solo province raggiungibili dalla Capitale (`connectedOf`).
- Isole: solo se collegate via nave (`seaLinksOf`).
- `pesteBlocco`: blocca la raccolta per il turno successivo alla Peste (turni 35-39).
- `beginStamp`: idempotente — produzione fatta una volta sola per turno globale.

## Tipi di risorsa
Cinque risorse (`RES` in `game-rules.js`): **Pietra, Legno, Grano, Bestiame, Argilla**. Ogni provincia ne produce al massimo una.
L'**Oro** NON è una risorsa di `RES`: sono le **monete** (`monete`), canale a parte.
- `resourceNeed(player)`: calcola quale risorsa manca di più → guida banca e commerci.
- `roadWorth`: preferisce connettere province con risorse non già doppiate.

## Monete
- Entrate per turno: province × valore + bonus Mercato + commerci ricevuti.
- `coinReserve`: riserva calcolata sui prossimi acquisti pianificabili.
- `goodValue(tipo, player)`: prezzo dinamico basato sulla scarsità.

## Mercenari
- `data-merc` sul path: mercenari presenti nella provincia.
- `MERC_VALUE`: forza in combattimento; `MERC_SPREAD`: spread prezzo.
- `mercLeaving`: mercenari abbandonano se non pagati.
- `addMerc(path, qty)`: aggiunge mercenari; `mercenaryPlan` decide quando comprarli.
- I bot comprano mercenari solo per chiudere un attacco (`mercenaryPlan + coinReserve`).

## Cavalieri
- Sbloccati al **turno 11** (ciclo II, anno 1100) — `UNLOCK_TURN = { cavaliere: 11 }`.
- **Costo: 50 monete + 1 Bestiame** (`COSTS.cavaliere`): il prezzo vero è la bestia, non l'oro.
- `data-cav` sul path: conteggio cavalieri.
- Valore in battaglia **1,45** fanti; all'assalto delle mura **0,9** (Città/Capitale) / **0,7** (Fortezza); difesa 1,45; in terreno chiuso ogni valore −¼.
- `squadRowsHtml`: riga separata nel cursore d'ordine quando ci sono cavalieri.
- I cavalieri contribuiscono al presidio (`spendableTroops` li include).

## Costi reali (sink di risorse) — fonte: `COSTS` in `game-rules.js`
Reclutare e costruire sono già sink ricorrenti: oltre alle monete spendono risorse a ogni acquisto.
| Voce | Monete | Risorse / soldati |
|---|---|---|
| Strada | — | 1 Pietra + 1 soldato (sulla prima provincia) |
| Barca (Nave) | — | 3 Legno + 1 soldato |
| Capitale | 500 | — |
| Città | 800 | 3 Pietra, 2 Argilla, 2 Bestiame |
| Fortezza | 1500 | 6 Pietra, 4 Legno, 4 Argilla, 2 Bestiame, 2 Grano |
| Vascello | 1800 | 10 Legno, 2 Argilla, 4 Bestiame, 4 Grano |
| Mercato | 600 | 3 soldati |
| Generale | 200 | 3 Bestiame, 3 Grano, 1 Argilla |
| Mercenario | 100 | — |
| Guarnigione | — | 1 Bestiame, 1 Grano, 1 Argilla |
| Cavaliere | 50 | 1 Bestiame |
| Spia | 200 | — |

> Fonte di verità: `COSTS` in `js/game-rules.js`. Verificare prima di citare cifre.

## Bonus costruzioni e territorio
- Strada: collega province adiacenti per la raccolta e la portata truppe.
- Fortezza: bonus difesa in battaglia (`k` del terreno aumentato).
- Porto: amplia le rotte marittime, obbligatorio per le Navi di porto.
- Costruzioni gratuite: strada dalla fondazione della Capitale (non dall'avvio partita).

## Malus principali
- Popolarità bassa → reclute ridotte al turno successivo.
- Senza Capitale → `province÷3` reclute, nessuna produzione dalla Capitale.
- Isolamento di una provincia (nessuna connessione) → risorsa non conteggiata.
- `pesteBlocco` → un turno senza raccolta.
- Mercenari non pagati → abbandonano a fine turno (`mercLeaving`).

## Magazzino (tetto risorse) — IMPLEMENTATO (2026-11-20)
Limita quante risorse di **ogni tipo** puoi stoccare (tetto per singolo tipo, non globale). Nasce per fermare l'accumulo infinito dei regni grandi.

| Livello | Tetto per tipo | Costo upgrade |
|---|---|---|
| 1 (base) | 10 | — |
| 2 | 20 | 1000 monete |
| 3 | 40 | 1000 monete |

- Al raggiungimento del tetto del livello: o si **upgrada** il magazzino, o l'eccedenza viene **venduta automaticamente** a **50 monete ogni 3 risorse** eccedenti, **arrotondando per difetto** (le monete). Il resto sotto le 3 unità trabocca e va perso: oltre il tetto non si accumula nulla.
- **Nessun tier "infinito"**: il livello 3 resta finito (40) apposta, così anche i regni ricchi di monete non possono comprarsi fuori dal limite.
- **Scudo dei nuovi regni**: a **lvl 1 la manutenzione delle STRUTTURE è spenta**. Il **primo upgrade (lvl 1→2)** la accende. Un regno troppo piccolo per reggere i costi resta a lvl 1, cap 10, nessun costo di struttura. (La manutenzione delle TRUPPE è sempre attiva — vedi sotto.)
- Interazione voluta con la Manutenzione: il tetto del Grano stringe le grandi armate (~1 Grano ogni 15 uomini ogni 7 turni) → spinge verso il magazzino alto.

## Manutenzione (strutture ogni 3 turni, truppe ogni 7) — IMPLEMENTATO (2026-11-20)
Il regno paga il mantenimento in due blocchi, con **cadenze** e regole di attivazione diverse: **strutture ogni 3 turni** globali (3, 6, 9…), **truppe ogni 7 turni** globali (7, 14, 21…; regola dell'utente 2026-11-26). È il **sink strutturale** che frena gli imperi grandi: più possiedi, più bruci.

### Strutture — ogni 3 turni, gated dallo scudo (attive solo da magazzino lvl 2+)
| Voce | Costo ogni 3 turni |
|---|---|
| Strade | 1 Pietra ogni 5 strade |
| Capitale / Fortezza | 1 Pietra ciascuna |
| Città | 1 Argilla ciascuna |
| Mercato | 1 Legno ciascuno |
| Navi (barca / vascello) | 1 Legno ciascuna |

Mancato pagamento → icona **"zzz"** sull'edificio: resta **dormiente/offline** finché non si paga.

### Truppe — ogni 7 turni, SEMPRE attive (fuori dallo scudo)
| Voce | Costo ogni 7 turni |
|---|---|
| Uomini (fanti) | 1 Grano ogni 15 |
| Cavalieri | 1 Bestiame ogni 5 |

È il freno **anti-snowball**: non si schiva restando a lvl 1, e su un regno piccolo (pochi uomini) pesa pochissimo. Mancato pagamento → **diserzione** di **1 fante e/o 1 cavaliere a turno**, per ogni turno scoperto.

**Chi diserta [REGOLA, utente 2026-11-26]**: fra i fanti **disertano per primi i mercenari**. L'uomo parte dalla provincia che ha più uomini di quel tipo (più fanti per il Grano, più cavalieri per il Bestiame), mai sotto il presidio minimo (`desert` in `game-actions.js`).

- Da ritarare: Pietra/Legno/Argilla drenano poco un impero molto ricco; il morso vero è il **Grano** sulle grandi armate. Alzare i coefficienti se serve più pressione.

## Magazzino e manutenzione — come è implementato (2026-11-20)
Regole pure in `GameRules` (`warehouseCap`, `overflowOf`, `upkeepBill`, costanti `UPKEEP_*`), applicazione in
`GameActions` (`upgradeWarehouse`, `applyWarehouseCap`, `maintainKingdom`, `payUpkeep`, `hullsOf`).
Stato sul **record del regno**, non sulla mappa: `player.magazzino` (1-3),
`player.dormienti = [{prov, tipo, dal}]`, `player.manutenzione = {turno, grano, bestiame, pietraStrade}`.
Esiti in `player.welfareAvvisi` con `kind` (stessa pergamena «Manutenzione»). Plancia: riquadro
«Magazzino e manutenzione» in fase Costruisci + riga d'allarme sotto le scorte. Mappa: 💤 sulla provincia.

Scelte prese in implementazione **[PROPOSTA, da confermare]** — il design non le fissava:
- **Quando si vende l'eccedenza**: a **fine turno** di chi gioca (`endTurn`), non alla raccolta: il giocatore ha il turno intero per spendere, scambiare o ampliare.
- **Come si conta l'eccedenza**: sommata su **tutti i tipi** (es. +2 Pietra e +2 Legno = 4 → 50 monete, 1 persa).
- **Ampliamento**: azione della fase Costruisci (`upgradeWarehouse`), 1000 monete per livello. Il passaggio 1→2 chiede conferma e mostra il conto delle strutture che si accende.
- **Quando si paga**: in `beginTurn` **dopo la raccolta** — strutture nei turni globali multipli di 3 (`UPKEEP_EVERY`, segnato in `manutenzione.turno`), truppe nei multipli di 7 (`TROOP_UPKEEP_EVERY`, segnato in `manutenzione.turnoTruppe`). Ordine di pagamento quando cadono insieme (21, 42…): truppe, poi Capitale → Città → Fortezze → Mercati → Velieri → Navi, strade per ultime.
- **Struttura dormiente (💤) = resta in piedi ma non rende**: Capitale/Città niente tasse e niente +1 recluta (la Capitale dormiente tiene comunque in vita raccolta e Popolarità, se no non si potrebbe più pagare); Fortezza niente +5 (le mura difendono ancora); Mercato niente banca, carovane né rotte (la rotta risulta interrotta); Nave/Veliero non salpa, non sbarca e non collega isole.
- **Riattivazione**: al conto successivo se le scorte bastano, o subito con **«Salda la manutenzione»** (fase Costruisci, 1 unità per struttura).
- **Strade non pagate**: non vanno dormienti (spezzerebbero la rete e il raccolto con cui pagare): restano **dissestate** — niente strade nuove finché non si versa la Pietra.
- **Debito delle truppe non si accumula**: a ogni conto riparte da quanto si deve adesso (il vecchio è già stato pagato in disertori). E **segue le bocche da sfamare**: se l'esercito scende sotto la soglia (14 fanti non chiedono Grano), il debito scende con lui e la diserzione si ferma. Ogni turno il debito aperto si salda da sé se le scorte lo permettono; se no diserta **1 fante** (Grano) e/o **1 cavaliere** (Bestiame), con la regola «Chi diserta» qui sopra (mercenari per primi).
- **Conteggi per difetto**: 14 fanti = 0 Grano, 4 cavalieri = 0 Bestiame, 4 strade = 0 Pietra. I corpi di spedizione contano come truppe del mittente.
- **Bot**: saldano la manutenzione prima di costruire e ampliano il magazzino quando una scorta è a 2 dal tetto e la cassa regge 1000 monete oltre la riserva.
- **Partita già in corso**: i regni partono al livello 1; l'eccedenza oltre 10 si vende alla prima chiusura di turno.

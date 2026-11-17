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

## Magazzino (tetto risorse) — DA IMPLEMENTARE (design concordato)
Limita quante risorse di **ogni tipo** puoi stoccare (tetto per singolo tipo, non globale). Nasce per fermare l'accumulo infinito dei regni grandi.

| Livello | Tetto per tipo | Costo upgrade |
|---|---|---|
| 1 (base) | 10 | — |
| 2 | 20 | 500 monete |
| 3 | 40 | 1000 monete |

- Al raggiungimento del tetto del livello: o si **upgrada** il magazzino, o l'eccedenza viene **venduta automaticamente** a **50 monete ogni 3 risorse** eccedenti, **arrotondando per difetto** (le monete). Il resto sotto le 3 unità trabocca e va perso: oltre il tetto non si accumula nulla.
- **Nessun tier "infinito"**: il livello 3 resta finito (40) apposta, così anche i regni ricchi di monete non possono comprarsi fuori dal limite.
- Interazione voluta con la Manutenzione: il tetto del Grano stringe le grandi armate (~1 Grano ogni 15 uomini ogni 3 turni) → spinge verso il magazzino alto.

## Manutenzione strutturale (ogni 3 turni) — DA IMPLEMENTARE (design concordato)
Ogni 3 turni il regno paga il mantenimento di strutture e truppe. È il **sink strutturale** che frena gli imperi grandi: più possiedi, più bruci.

| Voce | Costo ogni 3 turni |
|---|---|
| Strade | 1 Pietra ogni 5 strade |
| Capitale / Fortezza | 1 Pietra ciascuna |
| Città | 1 Argilla ciascuna |
| Mercato | 1 Legno ciascuno |
| Navi (barca / vascello) | 1 Legno ciascuna |
| Uomini (fanti) | 1 Grano ogni 15 |
| Cavalieri | 1 Bestiame ogni 5 |

- **Mancato pagamento → conseguenza:**
  - **Edifici**: icona **"zzz"** sull'edificio → resta **dormiente/offline** finché non si paga.
  - **Truppe**: **diserzione** di **1 fante e/o 1 cavaliere a turno**, per ogni turno in cui la manutenzione non è coperta.
- Da ritarare: Pietra/Legno/Argilla drenano poco un impero molto ricco; il morso vero è il **Grano** sulle grandi armate. Alzare i coefficienti se serve più pressione.

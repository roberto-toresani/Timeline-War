# Sistemi di Raccolta, Risorse, Bonus e Malus

## Produzione e raccolta
- `beginTurn`: raccoglie risorse e monete per il regno che inizia il turno.
- Risorse connesse: solo province raggiungibili dalla Capitale (`connectedOf`).
- Isole: solo se collegate via nave (`seaLinksOf`).
- `pesteBlocco`: blocca la raccolta per il turno successivo alla Peste (turni 35-39).
- `beginStamp`: idempotente — produzione fatta una volta sola per turno globale.

## Tipi di risorsa
Legno, Pietra, Ferro, Grano, Oro (prodotto speciale). Ogni provincia produce al massimo uno.
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
- Sbloccati al turno `UNLOCK_TURN` (vedi game-rules.js).
- `data-cav` sul path: conteggio cavalieri.
- `KNIGHT_VALUE`: moltiplicatore forza rispetto ai fanti.
- `squadRowsHtml`: riga separata nel cursore d'ordine quando ci sono cavalieri.
- I cavalieri contribuiscono al presidio (`spendableTroops` li include).

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

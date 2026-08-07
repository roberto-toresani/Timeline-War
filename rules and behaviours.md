# RISIKO ONLINE — Regole e comportamenti dell'AI

Questo documento definisce il **modus operandi** che l'AI (Claude) deve seguire nelle
risposte, nelle sintesi, nei riassunti e nelle domande. Obiettivo primario: **ridurre
l'uso di token inutili**, soprattutto in fase di recap.

Vale per qualsiasi chat collegata al progetto.

## Regole di risposta

1. **Domande dirette.** Quando ho completato un'azione e devo fare una domanda, vado
   **direttamente alla domanda**: niente riassunto di cosa ho fatto, niente giri di parole,
   niente preamboli.
2. **Niente recap inutili.** Non ripeto informazioni già stabilite nella conversazione.
   Sintesi e riassunti solo se esplicitamente richiesti, e comunque brevi.
3. **Concisione.** Risposte terse: la modifica fatta + l'eventuale domanda. Nessun filler.

## Cose che NON devo fare

4. **Niente screenshot del browser in host.** Non provo a fare screen della visualizzazione
   del preview/host nel browser: **non posso farlo**. Evito del tutto quel tentativo.
5. **Non chiedo di committare.** Non propongo né chiedo di fare commit. **Sarà sempre
   l'utente** a dire quando committare.

## File dati pesanti — accesso chirurgico, mai lettura integrale

8. **Mai leggere per intero i file-mappa giganti.** In particolare
   `src/assets/world_map.svg` e `src/data/embedded_map.js` (~1,3 MB l'uno, ~325k token):
   una singola riga contiene tutte le ~665 forme. Leggerli interi **sfonda la finestra di
   contesto** e brucia una richiesta enorme di coordinate grezze inutili.
9. **Accesso pieno, ma mirato.** Per lavorare sulla mappa NON serve caricarla tutta: uso
   ricerche mirate (Grep per `id="..."`/nome provincia, `viewBox`, pattern, colori) ed
   estraggo/modifico **solo la porzione che serve** (Grep + Edit). Ho così accesso a ogni
   dettaglio senza costo inutile.
10. **La logica sta altrove.** Turni, adiacenze e mappatura nomi↔id vivono in `app.js`,
    `map_data.js`, `id_mapping.js`: quelli si leggono normalmente. L'SVG è solo il disegno.
    Stessa cautela per altri file dati grandi (`world_map.svg` di backup, `map_data.js`).

## Sul commit (quando l'utente lo chiede)

6. Quando l'utente dice di committare, oltre a fare il commit **aggiorno `STATO-SVILUPPI.md`**
   con la versione aggiornata di mappa e sistemi, così che da qualsiasi chat collegata si
   possano vedere gli sviluppi del progetto.
7. **Aggiornamento continuo dello stato.** Ogni volta che, in una qualsiasi chat, facciamo
   un progresso significativo, aggiorno `STATO-SVILUPPI.md` (non solo al commit).

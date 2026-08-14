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

## Browser: accesso permanente al gioco

4. **Posso sempre aprire e usare Risiko nel browser, senza chiedere il permesso ogni volta.**
   L'autorizzazione è data una volta per tutte, vale per tutte le chat del progetto:
   avviare il server locale (`.claude/launch.json`, config "risiko" su
   http://localhost:5500/), aprire `index.html` e `play.html`, navigare, cliccare,
   leggere console/rete, fare screenshot della pagina e ricaricare dopo una modifica.
   Non chiedo conferma per nessuna di queste cose: le faccio e basta, e mostro il
   risultato. Se il server è già acceso lo riuso invece di riavviarlo.
5. **Verifico nel browser prima di dire che una cosa funziona.** Quando una modifica è
   visibile nel gioco, la guardo davvero (screenshot o lettura della pagina) invece di
   chiedere all'utente di controllare.

## Cose che NON devo fare

6. **Non chiedo di committare.** Non propongo né chiedo di fare commit. **Sarà sempre
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

11. Quando l'utente dice di committare, oltre a fare il commit **aggiorno `STATO-SVILUPPI.md`**
   con la versione aggiornata di mappa e sistemi, così che da qualsiasi chat collegata si
   possano vedere gli sviluppi del progetto.
12. **Aggiornamento continuo dello stato.** Ogni volta che, in una qualsiasi chat, facciamo
   un progresso significativo, aggiorno `STATO-SVILUPPI.md` (non solo al commit).

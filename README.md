# RISIKO ONLINE

Gioco di strategia tipo Risiko su una mappa storica interattiva, giocabile online.
App web statica (HTML/CSS/JavaScript vanilla) con multiplayer via Firebase e hosting su
GitHub Pages.

## Avvio in locale
**Modo più semplice:** doppio clic su **`avvia.bat`** nella cartella del progetto.
Apre il browser su http://localhost:5500 e avvia il server. Per fermarlo, chiudi la finestra nera.

In alternativa, da terminale (Windows, nessuna dipendenza):

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Root src -Port 5500
```

Poi apri **http://localhost:5500/**

Comandi sulla mappa: **rotella** per zoom, **trascina** per spostarti.

## Struttura
```
src/         l'app di gioco (index.html, css/, js/, data/, assets/)
firebase/    regole di sicurezza Firestore
scripts/     server statico locale
_archive/    materiale legacy non usato dal gioco (non committato)
```
Dettagli e note per lo sviluppo: vedi [CLAUDE.md](CLAUDE.md).

## Multiplayer (Firebase)
Il gioco funziona anche in locale senza Firebase (modalità sola-lettura/single).
Per attivare la sincronizzazione online servono le chiavi di un progetto Firebase in
`src/js/firebase-config.js` e la pubblicazione di `firebase/firestore.rules`.

## Deploy
Ogni push sul branch `main` pubblica automaticamente `src/` su GitHub Pages.

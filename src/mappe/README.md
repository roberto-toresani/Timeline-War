# Mappe

La cassaforte delle mappe: qui dentro sta la **versione definitiva** della posizione di
partenza, congelata, e la pagina per guardarla. Non è codice di gioco — il gioco non carica
niente da questa cartella e continua a funzionare anche se la si cancella.

## Cosa c'è

| file | cos'è |
| --- | --- |
| `mappa-definitiva.js` | la mappa congelata: 10 regni, 30 province assegnate, 198 risorse. Copia di `../data/start_map.json` presa il **2026-08-08**. |
| `mappa-definitiva.html` | il visualizzatore: apre la mappa e basta, non la può modificare. |

## Come si guarda

Col server locale acceso:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Root src -Port 5500
```

poi <http://localhost:5500/mappe/mappa-definitiva.html>.

Funziona anche **col doppio clic** sul file, senza server: per questo la mappa congelata è un
`.js` (`window.MAPPA_DEFINITIVA = {...}`) e non un `.json` — un `fetch` da `file://` verrebbe
bloccato dal browser, un `<script src>` no.

Cosa si può fare: rotella per lo zoom, trascinare per spostarsi, passare sopra una provincia
per nome/regno/risorsa/città storica, clic su un regno nella colonna per isolarlo e volarci
sopra (secondo clic per tornare), `Risorse` per spegnere i gettoni, `Inquadra tutto` per il
planisfero intero.

## Perché è separata da `data/start_map.json`

`start_map.json` è **viva**: il 📌 dell'editor la riscrive ogni volta che si salva la mappa
dipinta al momento. Questa copia no — è il punto zero a cui tornare, e cambia solo quando lo
si decide.

## Come si aggiorna (quando la definitiva cambia davvero)

1. Nell'editor si dipinge la mappa e si preme **📌** (scrive `src/data/start_map.json`).
2. Si rigenera la copia congelata:

```bash
powershell -NoProfile -Command "$j = Get-Content 'src/data/start_map.json' -Raw; $h = Get-Content 'src/mappe/mappa-definitiva.js' -Raw; $head = ($h -split 'window\.MAPPA_DEFINITIVA = ')[0]; Set-Content 'src/mappe/mappa-definitiva.js' -Value ($head + 'window.MAPPA_DEFINITIVA = ' + $j.TrimEnd() + \";`r`n\") -Encoding utf8 -NoNewline"
```

3. Si aggiorna la data nell'intestazione di `mappa-definitiva.js`.

Il visualizzatore non va toccato: legge quello che trova, comprese pedine e strade se un
giorno la definitiva ne avrà (adesso non ne ha, si dipingono in partita).

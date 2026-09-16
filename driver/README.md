# Motore headless dei bot (A1)

Fa girare i turni dei bot **senza tenere aperta una scheda del browser**. È la
stessa scheda-admin di sempre, ma dentro un **Chrome headless** su un host
**sempre acceso**: headless = mai in secondo piano, i timer girano a piena
velocità, i bot non si piantano più.

- **Non serve Firebase Blaze**, non ci sono costi Firebase: il motore parla con
  lo stesso Firestore del gioco.
- **Riusa il codice del gioco**: nessuna riscrittura dell'IA.
- I **giocatori** aprono i loro link `?p=CODICE` come sempre, **senza** login
  admin.

## Come funziona il flusso della partita

1. **Tu**, una volta, apri l'**editor** vero (nel tuo browser), prepari la
   partita (Prepara → assegna a ogni regno Admin/Player/AI → **🏁 Avvia**).
2. Da quel momento il **motore** (questo script) muove i bot. Puoi **chiudere il
   tuo editor**: la partita va avanti lo stesso.
3. I giocatori giocano dai loro link. Quando tocca a un bot, lo muove il motore;
   quando tocca a un umano, il motore aspetta la sua mossa.

> Regola d'oro: **un solo motore** in tutta la partita, e **niente login admin
> sulle plance dei giocatori**. Dopo aver avviato la partita, chiudi il tuo
> editor così l'unico "admin" che guida è il motore.

## Requisiti

- **Node.js 18+** installato sull'host (il tuo PC, un Raspberry Pi, una VM…).
  Verifica con `node -v`.
- Connessione a internet (parla con Firestore e con il sito live).

## Installazione (una volta)

Da terminale, in questa cartella `driver/`:

```bash
npm install
```

(Scarica anche un Chromium dedicato: la prima volta ci mette un po'.)

Poi crea il file delle credenziali:

1. Copia `.env.example` in `.env` (stessa cartella).
2. Apri `.env` e metti l'**email e la password dell'account admin** — le stesse
   con cui fai "Accesso admin" nell'editor.

> Il file `.env` **non** viene committato (è in `.gitignore`): la password resta
> solo sul tuo host.

## Avvio

```bash
npm start
```

Vedrai qualcosa tipo:

```
[…] Motore headless dei bot — avvio. Host: win32 Node v20.x
[…] Apro https://roberto-toresani.github.io/Timeline-War/index.html
[…] Login admin…
[…] Admin attivo. Il motore pilota i bot.  (Ctrl+C per fermare)
[…] · turno di Ducato di Polonia (bot — lo muovo io)
[…] · turno di Regno di Inghilterra (umano — aspetto la sua mossa)
```

Lascia la finestra del terminale aperta: finché gira, i bot vengono mossi.
`Ctrl+C` per fermarlo.

## Tenerlo sempre acceso

- **Sul tuo PC**: basta lasciare il terminale aperto. Per farlo ripartire da solo
  a ogni accensione, si può usare l'Utilità di pianificazione di Windows (o
  `pm2`, vedi sotto).
- **Con pm2** (gestore di processi Node, comodo su qualsiasi host):
  ```bash
  npm install -g pm2
  pm2 start driver.js --name risiko-motore
  pm2 save
  pm2 startup     # segui le istruzioni per l'avvio automatico
  ```
- **Su un Raspberry Pi / VM Linux**: stessi comandi; `pm2` è la via più semplice.

## Subentrare e giocare alcuni regni a mano (Mongoli, Cinesi…)

Vuoi che il motore muova i bot **ma** tu poter prendere in mano un regno quando
vuoi? Si può, con **una regola sola**: il tuo editor interattivo **non deve
guidare i bot** (li guida il motore), altrimenti tornate a scrivervi addosso.

Per questo esiste il flag **`?nodrive=1`**. Apri il tuo editor così:

```
https://roberto-toresani.github.io/Timeline-War/index.html?nodrive=1
```

Vedrai in alto l'avviso «🤖 Modalità intervento: i bot li muove il MOTORE».
Da qui:
1. Sulla scheda di un regno scegli **🧑 Admin** nel menu (Admin / Player / AI):
   quel regno diventa "tuo", e il **motore lo salta** e aspetta la tua mossa.
2. Aprilo con **👁** (o col suo link) e **giocane il turno** come un giocatore.
3. Quando hai finito, se vuoi ridarlo all'IA rimetti una **strategia** nel menu:
   il motore riprende a muoverlo da solo.

Così il **motore resta l'unico a guidare i bot**, e tu subentri sui regni che
vuoi, quando vuoi, senza conflitti. (Regola d'oro: **niente** editor SENZA
`?nodrive=1` aperto insieme al motore, e niente login admin sulle plance dei
giocatori.)

## Parametri (facoltativi, nel file `.env`)

- `GAME_URL` — la pagina da pilotare (default: l'editor del sito live).
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — credenziali admin (obbligatorie).

## Diagnostica

- **"login fallito"**: email/password sbagliate nel `.env`, o l'account non è
  quello admin.
- **"turno di … (umano — aspetto la sua mossa)"** fisso: è normale, il motore
  aspetta che quel giocatore giochi. Se quel giocatore non c'è, mettilo su AI
  dall'editor (menu del regno) e riavvia la partita.
- **Non parte Chromium**: su alcuni Linux servono librerie di sistema; su
  Windows/Mac di norma funziona subito dopo `npm install`.

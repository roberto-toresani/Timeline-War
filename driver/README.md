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

## Mail del turno (regola dell'utente)

Quando il turno passa a un giocatore umano, il motore gli manda una mail
personalizzata col link della plancia e due scorciatoie di auto-schieramento
("schiera ai confini e passa il turno", "schiera in Capitale e passa il turno").
Ogni giocatore ha **6 ore** per giocare: dopo, il motore chiude il turno da
sé secondo la preferenza salvata sulla sua scheda-regno (di default *niente*).

### Setup una volta

1. **Un account Gmail dedicato** (consigliato — es. `risiko-motore@gmail.com`).
2. Nel Google Account attiva la **verifica in due passaggi**, poi vai in
   **Sicurezza → Password per le app** e crea una **app-password** — è una
   password di 16 caratteri specifica per il mailer, che NON è la tua
   password Google.
3. Nel file `driver/.env` metti (accanto a `ADMIN_EMAIL`/`ADMIN_PASSWORD`):
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=risiko-motore@gmail.com
   SMTP_PASS=xxxx-xxxx-xxxx-xxxx      (l'app-password, senza spazi)
   MAIL_FROM="Risiko Online <risiko-motore@gmail.com>"
   PLAY_BASE_URL=https://roberto-toresani.github.io/Timeline-War/play.html
   TURN_DEADLINE_HOURS=6
   ```
4. Riavvia il motore (`npm start`). A avvio vedrai `[mail] SMTP OK · from: …`:
   se invece leggi `SMTP verify FALLITO`, ricontrolla utente e app-password.

### Dove si scrive l'e-mail del giocatore

Nell'**editor**, sulla **scheda-regno**, c'è la casella *"e-mail del
giocatore (facoltativa)"* e il menù *"Se scadono le 6h: niente / schiera ai
confini / schiera in Capitale"*. Se un regno è senza e-mail, semplicemente
non riceve la mail (il timer 6h scatta lo stesso).

### Il testo cambia col regno

I dieci regni di partenza hanno una mail curata a mano
(`driver/mail-templates.js`): l'Inghilterra riceve un testo diverso dagli
Abbasidi. I regni d'evento (Selgiuchidi, Portogallo, Bulgaria, Norvegia,
Svezia, Orda) e ogni regno rinominato ricevono un fallback generico.

### Come si comporta il timer

Il conto delle 6h parte quando il turno del giocatore **si apre** davvero
(`beginTurn`, timbrato in `player.turnStartedAt`), non quando il precedente
ha cliccato "Fine turno" — se in mezzo ci sono bot, contano loro non il
giocatore. Il timer è persistente nello stato del gioco: un riavvio del
motore NON azzera il cronometro. **Di notte il cronometro è fermo**: le ore
fra le 23:30 e le 8:30 (ora italiana, Europe/Rome anche col motore in cloud
che gira in UTC) non contano nelle 6h — un turno aperto alle 22:00 scade alle
13:00 del giorno dopo. Anche la **mail** di notte aspetta: un turno che si apre
dopo le 23:30 viene annunciato al primo giro del motore dopo le 8:30. Il calcolo è `GameRules.turnActiveMs`, lo stesso per
motore e plancia. Al passaggio di turno la scheda-plancia
mostra "5h 42m rimasti" accanto al bottone Fine turno.

### Se lasci vuote le SMTP\_\*

Il motore parte lo stesso e stampa `[mail] SMTP non configurato: nessuna
mail verrà inviata`. Il timer 6h continua a funzionare: allo scadere
esegue comunque l'auto-turno o salta il turno.

## Diagnostica

- **"login fallito"**: email/password sbagliate nel `.env`, o l'account non è
  quello admin.
- **"turno di … (umano — aspetto la sua mossa)"** fisso: è normale, il motore
  aspetta che quel giocatore giochi. Se quel giocatore non c'è, mettilo su AI
  dall'editor (menu del regno) e riavvia la partita.
- **Non parte Chromium**: su alcuni Linux servono librerie di sistema; su
  Windows/Mac di norma funziona subito dopo `npm install`.

## Motore in cloud (GitHub Actions) — col PC spento

`.github/workflows/motore.yml` lancia questo motore **ogni 10 minuti** sui server
di GitHub, per 9 minuti a giro (`RUN_FOR_MIN`). A ogni giro: muove i bot di turno,
manda la mail a chi tocca, chiude i turni oltre le 6 ore. Il repo è pubblico,
quindi i minuti sono gratuiti. Interrompere un bot a metà turno è sicuro: al giro
dopo riprende dalla fase in cui era.

**Per accenderlo** (una volta): su GitHub → *Settings → Secrets and variables →
Actions → New repository secret*, crea questi secret con gli stessi valori di
`driver/.env`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Finché mancano, ogni giro esce subito.
Per provarlo subito: *Actions → Motore della partita → Run workflow*.

- **Granularità**: un turno scade fra 6h00 e ~6h15 (il cron di GitHub può tardare
  di qualche minuto). I bot avanzano a ondate di 9 minuti ogni 10.
- **Insieme all'editor**: un editor aperto normalmente fa da secondo motore; il
  lease in Firestore fa guidare uno solo. Per intervenire senza fare da driver,
  `index.html?nodrive=1`.
- **Mail doppie**: impossibili anche con due motori accesi (PC + cloud) — la
  chiave dell'ultima mail vive in `presence/driver-mail` e si prende in
  transazione.
- **I log sono pubblici**: il motore non scrive credenziali e maschera gli
  indirizzi mail.
- **60 giorni**: GitHub spegne i cron di un repo senza commit da 60 giorni; si
  riaccende da *Actions → Enable workflow*.

# RISIKO ONLINE — Progettazione del gioco (regolamento completo)

Documento di design del "vero gioco". Fissa le regole date dall'utente e propone
in modo concreto le parti lasciate aperte. Fonte di verità per l'implementazione.

Legenda: **[REGOLA]** = deciso dall'utente · **[PROPOSTA]** = proposta da confermare/tarare.

Modello di consegna: **[REGOLA] online sequenziale asincrono (play-by-email).** Si stabilisce
un ordine di gioco; ogni giocatore gioca il proprio turno completo, poi al successivo arriva
una **mail** e parte una finestra di **6–8 ore** per giocare. Un **admin** configura la partita
(assegna province iniziali, ecc.). In sviluppo si testa in **locale con l'admin**; il livello
asincrono (login per-giocatore, notifiche, timer) si aggiunge sopra (§2.2).

---

## 1. Panoramica

Ambientazione medievale dall'anno 1000. Ogni giocatore controlla un regno e punta a
espandersi, sviluppare infrastrutture e gestire risorse. Tre pilastri:

1. **Espansione territoriale** — conquistare province.
2. **Logistica** — collegare le province alla Capitale via strade per raccogliere risorse.
3. **Equilibrio interno** — la Popolarità (1–5) che modula produzione e prestigio.

**[PROPOSTA] Anno/turni:** 1 turno = 10 anni (già presente: "1000 AD", +10/turno).
Partita a scadenza (es. 50 turni → anno 1500) con possibili vittorie anticipate (§10).

---

## 2. Struttura del turno

Ogni turno appartiene a un giocatore. In ordine:

### Fase 1 — Produzione & entrate (automatica, a inizio turno)
Eseguita solo per i regni che possiedono almeno una **Capitale** (senza Capitale non si
raccoglie nulla, [REGOLA]).
1. **Ricalcolo Popolarità** (§8).
2. **Rendita truppe** (§5.1): base = ⌊province ÷ 3⌋ + bonus edifici + modificatore Popolarità.
   Le reclute compaiono nella Capitale.
3. **Raccolta risorse** (§4): +1 unità del proprio tipo per ogni provincia **collegata**,
   ± modificatore Popolarità.
4. **Entrate monete** (§7): province collegate × tassa base + rendita Città + effetti Popolarità.
5. **Prestigio**: +1 se Popolarità 5, −1 se Popolarità 1 (§10).

### Fase 2 — Azioni del giocatore (manuali, admin)
In qualsiasi ordine, finché ci sono risorse/monete/soldati:
- **Costruire** strutture/unità (§6) — spende scorte, monete e soldati.
- **Reclutare** unità temporanee (Mercenario, Guarnigione) valide solo questo turno.
- **Muovere** truppe nella propria rete collegata (§5.2).
- **Attaccare** province adiacenti o raggiungibili via Nave/Vascello (§9).

### Fase 3 — Fine turno
- Le unità **temporanee** (Mercenari, Guarnigioni) scadono.
- Si passa al giocatore successivo. Completato il giro, avanza il numero di turno globale.

### 2.1 Ordine dei turni e "conquista + avanzata" nello stesso turno

Requisito: un giocatore deve poter **conquistare e proseguire l'invasione nello stesso turno**
(attacchi a catena, reagendo all'esito). Questo richiede di **vedere il risultato** di un
attacco prima di decidere il successivo → è incompatibile con turni **realmente simultanei**
(dove tutti danno gli ordini "alla cieca" e si risolvono insieme).

**Scelta [REGOLA] hotseat: turni SEQUENZIALI.** Un giocatore alla volta gioca il turno
completo; gli attacchi a catena funzionano naturalmente (reagisci a ogni esito). È anche il
modello di Risiko/Civilization. Per l'equità si **ruota il primo giocatore** a ogni round
(niente vantaggio permanente del primo che muove).

**Se in futuro si vorrà il multiplayer "tutti insieme":** l'unico modo per conservare la
catena è il modello **a impulsi (WeGo)** — il turno si divide in N impulsi; in ogni impulso
ciascuno dà **un** comando, si risolvono, poi si passa all'impulso successivo potendo reagire.
Una catena di conquiste si sviluppa lungo gli impulsi. Va definita la regola dei **conflitti**
(due che attaccano lo stesso bersaglio nello stesso impulso: difesa piena contro entrambi, o
priorità). È più complesso: consigliato solo dopo che il gioco sequenziale è solido.

### 2.2 Livello asincrono (play-by-email) — infrastruttura **[REGOLA/PROPOSTA]**

Turni **sequenziali ma asincroni**: i giocatori non sono insieme; ognuno gioca nella sua
finestra. Serve:
- **Login per-giocatore (Firebase Auth):** ogni account è legato a un regno. Le regole
  Firestore consentono di scrivere **solo nel proprio turno** e **solo le proprie azioni**
  (oggi `firestore.rules` permette la scrittura al solo admin: va esteso).
- **[REGOLA] Admin onnipotente:** l'admin ha **totale libertà e controllo** — può accedere
  alla **visualizzazione di qualsiasi giocatore** e svolgerne il turno (da solo, o in chiamata
  **insieme** al player), **scavalcando** ordine di turno e timer. È anche il "piano B" quando
  un giocatore resta inattivo troppo a lungo. (Corrisponde all'attuale modalità admin;
  `firestore.rules` deve continuare a dare all'admin scrittura piena su tutto.)
- **Stato "di chi è il turno":** in `games/main` → `turnoDi` (id giocatore) + `scadenza`
  (timestamp). Alla fine del turno si imposta il successivo e la nuova scadenza (+6–8h).
- **Notifica via mail:** GitHub Pages è statico e **non può inviare mail**. Opzioni:
  1. **Firebase Cloud Functions** + estensione "Trigger Email" o servizio SMTP (SendGrid/
     Mailgun): al cambio di `turnoDi`, invia la mail. *Richiede piano Firebase Blaze (a consumo).*
  2. **EmailJS** lato client: la mail parte dal browser di chi **conclude** il turno. Zero
     backend, ma dipende da quel browser ed espone una chiave pubblica. Ripiego semplice.
- **Timer 6–8h (auto-avanzamento):** cosa succede se un giocatore non gioca in tempo?
  - Meccanismo: **Cloud Function schedulata** (cron, piano Blaze) che a scadenza passa il turno;
    oppure **controllo pigro** — quando un qualsiasi utente apre il sito si verifica se la
    scadenza è passata e in tal caso si avanza (senza backend, ma la mail al successivo parte
    solo quando qualcuno visita).
  - **[REGOLA] Effetto del timeout — "turno automatico":**
    - **Produzione automatica** completa (risorse, oro/monete): sempre applicata.
    - **Soldati allocati automaticamente** in modo **difensivo** (mai attacchi automatici,
      convenzione Diplomacy). Politica di default: **come il turno precedente**; oppure la
      macro-scelta fatta via mail (vedi sotto).
    - **Nessuna eliminazione per inattività:** si perde solo restando senza province (§10).
      L'assenza ripetuta = turni automatici difensivi, il regno resta in gioco.

### 2.3 Ordini rapidi via mail (A/B/C) **[REGOLA]**

Nella mail "è il tuo turno" ci sono pulsanti che permettono una **decisione macro con un clic,
senza giocare il turno completo**. Tecnicamente (EmailJS invia solo, non riceve) sono **link**
a una **pagina minima "ordine rapido"**: il clic registra la scelta in Firestore e conferma
("Ordine registrato ✓"), poi il turno automatico la esegue. Opzioni proposte:

- **A — Distribuisci le truppe ai confini:** reclute e ridistribuzione verso le province di
  confine con nemici (difesa perimetrale).
- **B — Rafforza Capitale e Città:** reclute concentrate su Capitale/Città (protezione del
  cuore + guardia cittadina per la Popolarità).
- **C — Entra subito:** link diretto all'app per attacchi/strategie complesse (turno normale).

Se non si clicca nulla e scade il timer → default = **come il turno precedente** (o B se non
c'è storico). *Grazia/AI [PROPOSTA]:* nessun limite di turni saltati (niente boot); si può
valutare in futuro un "autopilota difensivo" più intelligente dopo N assenze.

**Sequenza di sviluppo consigliata:** costruire e validare **prima** tutta la logica di gioco
in locale (admin), **poi** aggiungere questo livello asincrono. Le mail/timer richiedono un
progetto Firebase reale (oggi `firebase-config.js` ha placeholder) ed eventualmente il piano a
consumo.

---

## 3. Modello di stato (schema dati)

Estende lo stato attuale (già: `data-owner` e `data-resource` per provincia, elenco
giocatori, turno, storico). Salvato in localStorage/Firestore e in Save/Load.

### Per giocatore (regno)
```
{
  id, name, color,
  monete: int,                 // tesoro
  prestigio: int,
  tassazione: 'leggera'|'normale'|'pesante',
  popolarita: 1..5,            // calcolata (§8), non modificabile a mano
  scorte: { pietra, legno, grano, bestiame, argilla }   // risorse accumulate
}
```

### Per provincia
```
{
  owner,                       // giocatore o nessuno (neutra)
  risorsa,                     // tipo prodotto (già esistente): pietra|legno|grano|bestiame|argilla|nessuna
  truppe: int,                 // soldati stanziati nella provincia
  edifici: {
    capitale: bool,
    citta: bool,
    fortezza: bool,
    mercato: bool
  }
}
```

### Strade / navi (collegamenti)
```
strade: [ [provA, provB], ... ]   // archi non orientati tra province controllate
navi:   [ [provA, provB], ... ]   // collegamenti marittimi (Nave)
vascelli: [ provId, ... ]         // provincia con Vascello = movimento globale
```
Una provincia è **collegata** se raggiungibile dalla Capitale (o da una Città) percorrendo
solo strade/navi tra province **dello stesso proprietario** (§4).

Nota: `truppe` per-provincia è **[PROPOSTA]** (le truppe sono unità che si spostano e
presidiano; la Capitale ne ospita per la "guardia cittadina").

---

## 4. Risorse e raccolta

- **[REGOLA]** Le risorse le producono le province (tipo fisso `risorsa`).
- **[REGOLA]** Si raccolgono solo dalle province **collegate alla Capitale via strade**.
  Senza Capitale, nessuna raccolta.
- **[REGOLA]** La **Città** funge da capitale secondaria: collega localmente le province
  attorno a sé (una provincia collegata a una Città collegata alla rete conta come collegata).
- **[REGOLA]** Produzione: **1 unità/turno** del proprio tipo per provincia collegata (fisso).
  La meccanica dello "sviluppo" del vecchio gioco **non esiste** più.
- **[PROPOSTA]** La diversità di risorse collegate (tipi distinti, max 5) alimenta la
  Popolarità (§8), non moltiplica la resa.

Connettività (algoritmo): grafo dei collegamenti = archi `strade`/`navi` i cui due estremi
sono province dello **stesso** proprietario; le province nella componente connessa che
contiene una **Capitale o Città** del giocatore sono "collegate".

---

## 5. Truppe

### 5.1 Rendita a inizio turno
`reclute = ⌊(#province controllate) ÷ 3⌋` **[REGOLA]**
`+ 1 per ogni Città` **[REGOLA]**
`+ 5 per ogni Fortezza` (oppure 1 Generale, a scelta) **[REGOLA]**
`+ modificatore Popolarità` (−2…+2, §8) **[REGOLA]**
`+ eventuali Mercenari/Guarnigioni reclutati (temporanei)` **[REGOLA]**
→ Le reclute permanenti compaiono nella **Capitale** **[PROPOSTA]**.

### 5.2 Movimento **[PROPOSTA]**
- Un giocatore può spostare truppe tra province **proprie e collegate** (rete di §4).
- Portata base: **1 provincia adiacente** per unità, per turno.
- **Generale** in una provincia: "facilita i movimenti interni" → consente movimento libero
  (qualsiasi distanza) all'interno della propria rete collegata, per le truppe che partono
  con lui.
- **Vascello**: movimento **globale** senza limiti geografici da/verso la sua provincia.
- **Nave**: consente movimento/espansione verso la provincia marittima/isola collegata.

### 5.3 Valori delle unità speciali
- **Generale** = vale 2 soldati **[REGOLA]**, e conta per la Popolarità se nella Capitale.
- **Mercenario** = 1 soldato temporaneo (1 turno) **[REGOLA]**.
- **Guarnigione** = 2 soldati temporanei (1 turno) **[REGOLA]**.

---

## 6. Costruzioni e unità (costi ed effetti)

Costi **[REGOLA]** (esatti come da regolamento). Effetti dettagliati/piazzamento **[PROPOSTA]**
dove indicato.

| Elemento | Costo | Effetto |
|---|---|---|
| **Strada** | 1 Pietra + 1 soldato | Collega due province controllate adiacenti. |
| **Nave** | 1 Legno + 3 soldati | Collega/espande verso province lontane o isole. |
| **Capitale** | 5 soldati + 500 monete | **Conta come una Città a tutti gli effetti** (difesa **+3**, paga le tasse, +1 soldato/turno, hub di collegamento) e in più: obbligatoria per la raccolta, attiva la Popolarità, **1 sola per regno**, dà **1 strada gratuita**. |
| **Città** | 3 Pietra + 2 Argilla + 2 Bestiame + 1000 monete | Capitale secondaria (collegamento locale). Difesa **+3**. Alla costruzione: **+1 Pietra** (una tantum). Ogni turno: **+1 soldato** e **monete da tassazione** (§7). |
| **Fortezza** | 6 Pietra + 4 Legno + 4 Argilla + 2 Bestiame + 2 Grano + 2000 monete | Struttura **militare a parte**: **non costruibile** dove c'è già una Capitale/Città. Difesa **+5**. Ogni turno: +5 soldati **oppure** +1 Generale. |
| **Vascello** | 10 Legno + 2 Argilla + 4 Bestiame + 4 Grano + 4000 monete | Movimento globale senza limiti (§5.2). |
| **Mercato** | 4 soldati + 1000 monete | Scambio risorse con la banca **2:1**. |
| **Generale** | 3 Bestiame + 3 Grano + 1 Argilla + 500 monete | Vale 2 soldati, facilita i movimenti interni (§5.2). |
| **Mercenario** | 100 monete | +1 soldato temporaneo (1 turno). |
| **Guarnigione** | 2 Bestiame + 2 Grano + 1 Argilla | +2 soldati temporanei (1 turno). |

**Interpretazioni [PROPOSTA]:**
- Città "+1 Pietra" = **[REGOLA]** bonus **una tantum** alla costruzione (+1 Pietra alle scorte),
  non uno sconto ricorrente.
- Capitale/Città/Fortezza si costruiscono su una **provincia controllata**; Strada/Nave
  collegano **due** province controllate.

---

## 7. Economia delle monete

- **[REGOLA] Solo le Città pagano le tasse.** Nient'altro genera monete di rendita (scelta
  voluta per tenere basso il denaro e alto il peso relativo dei costi).
- **Entrate/turno:** `Σ(#Città) × tassa(livello)`.
- **[REGOLA] tassa per Città:** Leggera **50** · Normale **100** · Pesante **150**.
- Un regno con solo la Capitale (nessuna Città) ha **0 entrate**: le monete arrivano
  costruendo Città.
- **Uscite:** costi di costruzione/reclutamento (§6).
- **Mercato [REGOLA]:** converte risorse con la banca al rapporto **2:1** (2 di un tipo → 1 a scelta).

---

## 8. Popolarità (1–5)  ⏸️ IN SOSPESO

> Da rivedere insieme all'utente (formula, soglie, significato di "±N risorse/turno", fonti
> di prestigio). Quanto segue è una **bozza [PROPOSTA]** di lavoro, non ancora confermata.

Attiva solo con la Capitale. Tre macro-fattori danno un punteggio; il totale mappa il livello.

### Punteggi **[PROPOSTA]**

**Difesa e sicurezza** (Dif, −2…+2):
- Province **nemiche** confinanti con la Capitale `e`: e=0 → +2 · e=1 → +1 · e=2 → 0 · e=3 → −1 · e≥4 → −2.
- Guardia cittadina: soldati oltre 5 nella Capitale → +1 ogni 2 extra, max +2.
- Generale nella Capitale → +1.
- `Dif = clamp(somma, −2, +2)`

**Benessere e risorse** (Ben, −2…+2):
- Diversità risorse collegate `d` (tipi distinti 1–5) → `d − 3` (d=5 → +2, d=1 → −2).
- Cibo (province di Grano/Bestiame collegate `a`): a=0 → −1 · a=1 → 0 · a=2–3 → +1 · a≥4 → +2.
- `Ben = clamp(somma, −2, +2)`

**Tassazione** (Tax, −1…+1): Leggera +1 · Normale 0 · Pesante −1.

**Livello finale:** `T = Dif + Ben + Tax` (−5…+5) → `Popolarità = clamp(3 + round(T/2), 1, 5)`.

### Effetti per livello **[REGOLA]**
| Liv | Soldati/turno | Risorse/turno | Prestigio/turno |
|---|---|---|---|
| 1 | −2 | −2 | −1 |
| 2 | −1 | −1 | 0 |
| 3 | 0 | 0 | 0 |
| 4 | +1 | +1 | 0 |
| 5 | +2 | +2 | +1 |

**[PROPOSTA]** "Risorse/turno ±N" = N unità totali aggiunte/tolte alla raccolta del turno
(distribuite/prelevate sui tipi raccolti). Da confermare l'interpretazione.

---

## 9. Combattimento e conquista **[REGOLA]**

Modello **ibrido "deterministico + sorte ravvicinata" con attrito**: a grande divario vince
il più numeroso (certezza); a piccola differenza (entro **4** soldati) entra la sorte, con il
più forte favorito ma il più debole mai spacciato.

**Bersagli validi:** provincia nemica/neutra **adiacente via terra** a una tua provincia, o
raggiungibile via **Nave** (marittima/isola) o **Vascello** (ovunque).

**Valori effettivi:**
- `A` = truppe attaccanti **impegnate**: l'attaccante **sceglie quante** portarne dalla provincia
  d'attacco (un Generale conta 2).
- `D` = **tutte** le truppe presenti nella provincia bersaglio (il difensore difende sempre con
  tutto il disponibile).
- `De = D + bonus struttura` — difesa effettiva. Bonus: **Capitale/Città +3**, **Fortezza +5**.
  Non si sommano: ogni provincia ha **una sola** di queste strutture. Neutra senza truppe: `De = 0`.
- `d = A − De`.

**Chi vince:**
- `d > 4` → **attaccante vince** (deterministico).
- `d < −4` → **attacco respinto** (deterministico).
- `|d| ≤ 4` → **la sorte decide**: `P(attaccante) = clamp(0.5 + 0.1·d, 0.05, 0.95)`
  (d=0 → 50% · +2 → 70% · +4 → 90%; il più debole conserva sempre ≥ ~10%).

**Attrito (perdite):**
- **Attaccante vince** → perde `round(0.6·De)` truppe; le superstiti entrano e conquistano;
  le strutture nemiche in B sono **rase** (tranne le strade). B diventa tua.
- **Difensore regge** → l'attaccante perde **tutte** le truppe impegnate; il difensore perde
  `round(0.6·A)`.

**Parametri tarabili:** banda = 4 · pendenza = 0.1/soldato · attrito = 0.6.

**Esiti testati (Monte Carlo):** alla pari 50/50; +1→60% · +2→70% · +4→90%; oltre la banda
100%. Contro una Fortezza (+5) un attacco 8 vs 5 vince solo 30%. Il vincitore esce sempre
ridotto (attrito). Tabella completa nella chat di design.

---

## 10. Prestigio, vittoria e sconfitta **[REGOLA]**

- **Nessuna scadenza a turni.** La partita continua finché qualcuno vince.
- **Sconfitta:** un giocatore è eliminato quando **perde tutte le province** (fuori dalla mappa).
- **Vittoria** (una delle due):
  1. **Prestigio:** raggiungere una **soglia** di punti prestigio. **[PROPOSTA] soglia = 30**
     (tarabile).
  2. **Eliminazione:** restare l'**unico regno** in gioco.

**Prestigio:** +1/turno a Popolarità 5, −1/turno a Popolarità 1 (§8). (Fonti aggiuntive di
prestigio — es. conquiste, monumenti — da decidere insieme alla Popolarità, in sospeso.)

---

## 11. Valori iniziali **[REGOLA]**

- Province iniziali: assegnate dall'admin (come oggi).
- Tesoro iniziale: **1000 monete**.
- Soldati iniziali: **5 per provincia** posseduta all'inizio.
- Scorte risorse iniziali: **0** (vanno raccolte costruendo Capitale + strade).
- Tassazione iniziale: **normale**. Popolarità iniziale: calcolata (tipicamente 3).

---

## 12. UI (hotseat)

- **Cruscotto regno** (per il giocatore di turno): monete, scorte (5 risorse), prestigio,
  Popolarità (1–5 con effetto), selettore Tassazione, #province.
- **Pannello provincia** (al click): proprietario, risorsa, truppe, edifici, stato "collegata".
  Pulsanti azione per il giocatore di turno: Costruisci ▸ (Strada/Capitale/Città/Fortezza/
  Mercato/Vascello) · Recluta ▸ (Mercenario/Guarnigione/Generale) · Muovi · Attacca.
- **Mappa**: badge numerico truppe e icone edifici sugli angoli della provincia (l'icona
  risorsa è già presente).
- **Fine turno**: esegue la Fase 1 del giocatore successivo e mostra un riepilogo (rendite,
  raccolte, variazioni Popolarità/Prestigio).

---

## 13. Roadmap di implementazione

1. **Fondamenta**: schema di stato (§3), cruscotto regno, persistenza; rendita truppe base.
2. **Costruzioni**: piazzamento + scalata costi (§6), a partire da Capitale e Strada.
3. **Logistica & raccolta**: connettività (§4) e Fase 1 automatica (raccolta + monete).
4. **Popolarità** (§8) e Tassazione (§7) con effetti.
5. **Movimento** (§5.2) e **Combattimento/Conquista** (§9).
6. **Prestigio/Vittoria** (§10), riepiloghi di fine turno, rifiniture UI.

---

## 14. Stato delle decisioni

**Confermate [REGOLA]:**
- Combattimento **ibrido deterministico + sorte ravvicinata + attrito** (§9), bonus difensivi
  Città +3, Fortezza +5.
- Vittoria: **soglia di prestigio** (proposta 30) **oppure** eliminazione degli altri; si
  **perde** restando senza province. Nessuna scadenza a turni.
- Tassazione: **solo le Città**, 50/100/150 (leggera/normale/pesante).
- Valori iniziali: **1000 monete**, **5 soldati/provincia**, **0 scorte**.
- Città: **+1 Pietra una tantum** alla costruzione, poi +1 soldato + monete-tasse/turno.
- Risorse: **1/turno per provincia collegata** (niente sviluppo).

**Ancora aperte:**
- **Ordine dei turni**: sequenziale (a rotazione) vs simultaneo a impulsi — vedi §2.1.
- **Popolarità** (§8) → ⏸️ in sospeso, da rivedere insieme.
- **Soglia di prestigio** per la vittoria (30?) e eventuali **fonti extra di prestigio**.

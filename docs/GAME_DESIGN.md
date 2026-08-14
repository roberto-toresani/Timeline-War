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
  prestigioCiclo: 0..10,       // prestigio del ciclo corrente (si azzera ogni 10 turni), cap 10
  puntiOro: int,               // Punti Prestigio d'Oro permanenti = punteggio di vittoria (§10)
  tassazione: 'leggera'|'normale'|'dura',
  capitaleProvincia: id|null,  // provincia con la Capitale (chiave per la Popolarità, §8)
  popolarita: 1..5,            // calcolata (§8): totale + i 3 componenti Difesa/Benessere/Tassa
  scorte: { pietra, legno, grano, bestiame, argilla },  // risorse accumulate
  salute:   { acquedotti, bestiariMedici, erboristerie, pozziNeri, capanniMedici },  // bool (§6.1)
  felicita: { terme, fiereBestiame, festaRaccolto, fornitureTaverne, palchiGiostre }, // bool (§6.1)
  obiettivi: {                 // obiettivi del ciclo di 10 turni corrente (§10)
    primario:   { descrizione, completato },   // 6 punti
    secondario: { descrizione, completato },   // 2 punti
    terziario:  { descrizione, completato }     // 2 punti
  }
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

### Strade (collegamenti) e navi (scafi)
```
strade: [ [provA, provB], ... ]   // archi non orientati tra province controllate
scafi: [                          // OGNI nave è un oggetto a sé: ha identità e carico
  { id, tipo: 'barca'|'vascello', owner, prov, carico: int, rotta?, pos?: {x,y} },
  ...
]
```
Le navi **non sono archi** e **non si impilano**: ogni scafo è un'entità singola con un suo
carico di uomini, perché quel numero va **mostrato** a chi la vede o la intercetta (§9.2). Due
Navi nella stessa provincia sono due pedine distinte — 16 uomini possono partire come 8+8 su
due scafi diretti a due bersagli diversi. Uno scafo è ancorato a una provincia costiera
(`prov`) e da lì proietta la sua **portata**; un Veliero in rotta lunga sta in mare aperto,
fuori da ogni provincia, e allora porta con sé `pos` e la `rotta` che sta seguendo.

Questo **non** è il modello attuale del codice: oggi le pedine vivono in `data-pieces` come
`"tipo:quantità"` (`barca` e `vascello` hanno `max: 15` in `data/piece_icons.js`) e si
disegnano come un marker unico con un pallino col numero. Gli scafi vanno tirati fuori da lì:
lista propria nello stato, marker propri sulla mappa, uno per scafo, ciascuno con il suo carico.
Una provincia è **collegata** se raggiungibile dalla Capitale (o da una Città) percorrendo
solo **strade** tra province **dello stesso proprietario** (§4). **Le navi non collegano**
(§9.2): oltremare si produce solo dopo aver fondato una Città.

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

Connettività (algoritmo): grafo dei collegamenti = archi `strade` i cui due estremi
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
- **Nave / Veliero**: portata di mare e sbarchi hanno regole proprie — vedi **§9.2**. Il
  movimento globale illimitato del Vascello è **superato**: nessuna nave attraversa un oceano
  in un turno.

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
| **Nave** | 2 Legno + 2 soldati | Solo su provincia **costiera**. Portata di mare **12**, carico **8** soldati (§9.2). |
| **Capitale** | 5 soldati + 500 monete | **Conta come una Città a tutti gli effetti** (difesa **+1**, paga le tasse, +1 soldato/turno, hub di collegamento) e in più: obbligatoria per la raccolta, attiva la Popolarità, **1 sola per regno**, dà **1 strada gratuita**. |
| **Città** | 3 Pietra + 2 Argilla + 2 Bestiame + 1000 monete | Capitale secondaria (collegamento locale). Difesa **+1**. Alla costruzione: **+1 Pietra** (una tantum). Ogni turno: **+1 soldato** e **monete da tassazione** (§7). |
| **Fortezza** | 6 Pietra + 4 Legno + 4 Argilla + 2 Bestiame + 2 Grano + 2000 monete | Struttura **militare a parte**: **non costruibile** dove c'è già una Capitale/Città. Difesa **+3**. Ogni turno: +5 soldati **oppure** +1 Generale. |
| **Veliero** (Vascello) | 10 Legno + 2 Argilla + 4 Bestiame + 4 Grano + 4000 monete | Solo su provincia **costiera**. Portata di mare **170**, carico **15** soldati, navigazione a rotta oltre la portata (§9.2). |
| **Mercato** | 4 soldati + 800 monete | Apre i commerci: scambio con l'estero **2:1** e trattative fra regni. |
| **Generale** | 3 Bestiame + 3 Grano + 1 Argilla + 500 monete | Vale 2 soldati, facilita i movimenti interni (§5.2). |
| **Mercenario** | 100 monete | +1 soldato temporaneo (1 turno). |
| **Guarnigione** | 2 Bestiame + 2 Grano + 1 Argilla | +2 soldati temporanei (1 turno). |

**Interpretazioni [PROPOSTA]:**
- Città "+1 Pietra" = **[REGOLA]** bonus **una tantum** alla costruzione (+1 Pietra alle scorte),
  non uno sconto ricorrente.
- Capitale/Città/Fortezza si costruiscono su una **provincia controllata**; Strada/Nave
  collegano **due** province controllate.

### 6.1 Migliorie civiche — Salute e Svago **[REGOLA]**

Migliorie **una tantum per regno** (non ripetibili) che alzano il **Benessere** (§8). Ogni
categoria ha **5 migliorie, una per tipo di risorsa**; ognuna completata dà **+1 punto** al suo
indice (max 5). Costo: **3 unità** della risorsa indicata (nient'altro). Richiedono una Capitale.

**Salute e sanità** → indice **Sanità**
| Miglioria | Costo |
|---|---|
| Acquedotti | 3 Pietra |
| Bestiari medici | 3 Bestiame |
| Erboristerie | 3 Grano |
| Pozzi neri | 3 Argilla |
| Capanni medici | 3 Legno |

**Felicità e svago** → indice **Felicità**
| Miglioria | Costo |
|---|---|
| Terme | 3 Pietra |
| Fiere del bestiame | 3 Bestiame |
| Festa del raccolto | 3 Grano |
| Forniture per taverne | 3 Argilla |
| Palchi e giostre teatrali | 3 Legno |

---

## 7. Economia delle monete

- **[REGOLA] Solo le Città pagano le tasse.** Nient'altro genera monete di rendita (scelta
  voluta per tenere basso il denaro e alto il peso relativo dei costi).
- **Entrate/turno:** `Σ(#Città) × tassa(livello)`, dove la **Capitale conta come Città** (§6).
- **[REGOLA] tassa per Città:** Leggera **50** · Normale **100** · Dura **150**.
- Quindi con la sola Capitale si incassa già 1× la tassa; altre Città moltiplicano le entrate.
- **Uscite:** costi di costruzione/reclutamento (§6).
- **Mercato [REGOLA]:** converte risorse con la banca al rapporto **2:1** (2 di un tipo → 1 a scelta).

---

## 8. Popolarità (1–5)

Attiva quando il regno ha una **Capitale**. La **Capitale è l'elemento chiave** (ma non l'unico)
su cui si misura la popolarità: il sistema tiene **sempre traccia della provincia-capitale** di
ogni giocatore (§3).

**Formula [REGOLA]:** `Popolarità = arrotonda( (Difesa + Benessere + Tassa) / 3 )` (clamp 1–5),
dove ciascun componente ha il proprio calcolo.

**Arrotondamento [REGOLA]:** per **difetto**, salvo quando la parte decimale è **> 0,8**, allora
per eccesso. `arrotonda(x) = (x − floor(x) > 0.8) ? ceil(x) : floor(x)`.
Es.: 2,83 → 3 · 2,5 → 2 · 4,8 → 4 · 3,9 → 4.

### Livello Difesa — `(P_conf + P_guardia) / 2 + generale` **[REGOLA]**
- **P_conf** (province nemiche confinanti con la Capitale, punti su 5): `5 − e`, con `e` = numero
  di province nemiche a contatto (max 5). → 0 nemiche = 5 · 1 = 4 · 2 = 3 · 3 = 2 · 4 = 1 · ≥5 = 0
- **P_guardia** (guardia cittadina, punti su 5): `min(5, max(0, soldatiCapitale − 5))` — ogni
  soldato oltre i 5 nella Capitale vale 1, fino a 5. → 7 soldati = 2 · 10+ = 5
- **Generale nella Capitale**: `+1` (ce l'hai o non ce l'hai)
- `Difesa = (P_conf + P_guardia) / 2 + (generale ? 1 : 0)` → intervallo **0–6**

### Livello Benessere — `(Risorse + Cibo + Sanità + Felicità) / 4` **[REGOLA]**
- **Risorse** (diversità, su 5): numero di **tipi distinti** di risorsa collegati.
  *Es.: 5 province di solo Bestiame collegate → Risorse = 1 (un solo tipo), ma Cibo = 5.*
- **Cibo** (su 5): province di **Grano/Bestiame** collegate, `min(5, conteggio)`.
- **Sanità** (su 5): numero di **migliorie di salute** completate (una per tipo di risorsa, §6.1).
- **Felicità** (su 5): numero di **migliorie di svago** completate (una per tipo di risorsa, §6.1).
- `Benessere = (Risorse + Cibo + Sanità + Felicità) / 4` → intervallo **0–5**

### Livello Tassa **[REGOLA]**
- Leggera → **5** · Normale → **3** · Dura → **1**.
- Trade-off: la tassa **dura** dà più monete (§7, 150) ma popolarità minima; la **leggera** dà
  meno monete (50) ma popolarità massima.

### Effetti per livello **[REGOLA]**
| Liv | Soldati/turno | Risorse/turno | Prestigio/turno |
|---|---|---|---|
| 1 | −2 | −2 | −1 |
| 2 | −1 | −1 | 0 |
| 3 | 0 | 0 | 0 |
| 4 | +1 | +1 | 0 |
| 5 | +2 | +2 | +1 |

**[PROPOSTA]** "Risorse/turno ±N" = N unità totali aggiunte/tolte alla raccolta del turno
(sui tipi raccolti). Da confermare.

**Nota Prestigio:** la colonna "Prestigio/turno" qui sopra è **superata** dal sistema a cicli
del §10 (Popolarità ≥ 4 → +1 Prestigio/turno; Popolarità 1 → −1/turno, **malus mantenuto**).

### Pannello Popolarità (UI) **[REGOLA]**
Nella **scheda personale** del giocatore, a partire dalla **costruzione della Capitale**, compare
un **pannello dedicato** che si **aggiorna automaticamente** ed evolve, mostrando:
- **Popolarità** totale (1–5) e l'effetto corrente (soldati/risorse/prestigio).
- I tre componenti **Difesa / Benessere / Tassa** con il loro livello e il **dettaglio dei
  sotto-fattori** (province nemiche confinanti con la Capitale, guardia cittadina, generale,
  diversità risorse, cibo collegato, livello di tassazione).
- Il **selettore di Tassazione** (leggera/normale/dura).

---

## 9. Combattimento e conquista **[REGOLA]**

Modello **probabilistico**: il più numeroso è favorito in modo **super-lineare** (l'esponente),
ma il più debole ha **sempre** una probabilità non nulla. Implementato in `src/js/battle.js`
(funzione pura `resolveBattle(A, D, fort, rng, esponente)`, testata).

**Bersagli validi:** provincia nemica/neutra **adiacente via terra**, oppure costiera dentro la
**portata di mare** di una propria Nave/Veliero (§9.2) — che a tutti gli effetti la rende limitrofa.

**Valori:**
- `A` = truppe attaccanti **impegnate** (l'attaccante **sceglie quante**; un Generale conta 2).
- `D` = **tutte** le truppe del difensore (difende sempre con tutto il disponibile).
- `Deff = D + bonus struttura` — bonus: **Città/Capitale +1**, **Fortezza +3** (esclusive → al più
  uno). Le **mura difendono anche a guarnigione vuota** (D=0). Neutra senza truppe né strutture:
  `Deff = 0` → l'attaccante vince.
- `k` = **esponente del terreno** della provincia **attaccata** (vedi sotto).

**Probabilità di vittoria dell'attaccante:** `P_A = A^k / (A^k + Deff^k)`.
Esempi (D=5, terreno neutro k=2): A5 → 50% · A8 → 72% · A10 → 80%; **Città (+1)** pareggio a **A6**;
**Fortezza (+3)** pareggio a **A8** (A10 → 61%).

### 9.1 Terreno **[REGOLA]**

Ogni provincia della mappa è **`chiuso`** o **`aperto`** — nessuna terza via. È la geografia, non
stato di partita: sta in `src/data/province_terrain.js` (tutte e 628 le province), le regole in
`src/js/terrain.js`. Non entra negli snapshot, non si dipinge nell'editor, non cambia mai.

Il terreno **non è un bonus difensivo** come le mura (quelle sommano difensori virtuali). È la
misura di **quanto conta il numero**: cambia l'esponente `k`.

| terreno | `k` | cos'è | cosa vuol dire |
|---|---|---|---|
| `aperto` | **2,6** | pianure, steppe, deserti aperti, grandi valli | c'è spazio per schierare tutti: il vantaggio numerico si moltiplica |
| (nessuno) | 2,0 | ripiego se `terrain.js` non c'è | il vecchio quadrato |
| `chiuso` | **1,4** | monti, gole, foreste, paludi, coste a fiordo, isole montuose | fronte stretto: un drappello può reggere a un'armata |

Conta **il terreno della provincia attaccata**: è lì che si combatte.

| A/Deff | `chiuso` | neutro | `aperto` |
|---|---|---|---|
| 1,5× | 64% | 69% | 74% |
| 2× | 73% | 80% | 86% |
| 3× | 82% | 90% | 95% |
| 4× | 87% | 94% | 97% |

Un 3-contro-1 in montagna lascia al difensore quasi il doppio delle possibilità che in pianura.
Attaccare in salita si può — si paga.

**Criterio di assegnazione** (documentato in testa a `province_terrain.js`): `chiuso` dove il
terreno ha storicamente favorito i piccoli reparti (Termopili, Roncisvalle, Teutoburgo, Morgarten,
il Rif, la Sierra Maestra, il Darién); `aperto` dove le armate numerose hanno potuto pesare
(Gaugamela, Canne, i Campi Catalaunici, Mohács, Kursk). Nel dubbio ha vinto il tratto che ha
**deciso le guerre** di quel territorio, non la percentuale di rilievo. Bilancio: 326 `chiuso`,
302 `aperto`.

**Dove si vede:** il pronostico della plancia e il rapporto di battaglia mostrano il terreno
accanto alla percentuale; il bottone **⛰ Terreno** (plancia ed editor) colora la mappa per
terreno — solo pittura, come la vista per fede. I **bot** leggono lo stesso campo dai bersagli di
`attackTargets` e usano la stessa `RisikoBattle.winChance`: non attaccano in montagna credendo di
essere in pianura.

**Attrito (perdite), calcolato sulle TRUPPE REALI (le mura spostano la probabilità, non fanno
vittime extra):**
- `muBase = 0.8 · L/(W+L)` (W, L = truppe di vincitore/perdente) → più le forze sono simili, più
  il vincitore perde.
- `muAttrito = +0.03 · ln(1 + A/10)` se vince l'attaccante (freno anti-valanga); 0 se vince il difensore.
- Variabilità legata all'incertezza `I = 4·P_A·P_D`. Perdite del vincitore
  `C = min(W−1, round(W·muF))` → al vincitore resta sempre **≥ 1**.
- **Attaccante vince** → difensore azzerato, entrano `A−C`. **[REGOLA] Le costruzioni NON
  vengono rase**: Capitale/Città/Fortezza/Mercato/Generale/navi restano sulla provincia e
  cambiano semplicemente proprietario (e colore). **Difensore regge** → l'attaccante perde
  **tutte** le impegnate, il difensore tiene `D−C`.
- **Strade**: una strada appartiene al colore di chi l'ha costruita. La conquista di UNA delle
  due province che collega **non la distrugge**: sparisce solo quando **entrambe** le province
  sono passate a un colore diverso da quello della strada.

### 9.2 Mare: portata, carico, sbarco **[REGOLA]**

**La portata si misura sull'acqua, non in linea d'aria.** Il raggio si propaga per rotta di
mare: gira attorno alle penisole, passa per gli stretti, si ferma sulle coste. Un cerchio
geometrico non funziona e non è un dettaglio — misurato su questa mappa, dalla Normandia il
**Languedoc** (costa mediterranea, oltre tutta la Francia) dista **16,4** unità in linea d'aria
e le **Asturie 21,8**: un cerchio abbastanza largo da mostrare la Spagna del nord farebbe
attaccare Montpellier a una nave ferma nella Manica.

Unità di misura: la mappa è **1200×575**, 1 unità ≈ **33 km**. Riferimento comodo:
**Barcellona–Gerusalemme per mare = 111 unità**.

| | portata | carico | dove |
|---|---|---|---|
| **Nave** | **12** | **8** soldati | solo provincia costiera |
| **Veliero** | **170** | **15** soldati | solo provincia costiera |

**Tutto ciò che sta dentro la portata è provincia limitrofa a tutti gli effetti**: si vede sulla
mappa e si attacca subito, senza passaggi intermedi né turni di avvicinamento. Oltre la portata
c'è il buio.

Quanto apre una portata (province raggiungibili, **misurate** sulla mappa vera):

| nave ancorata a | Nave (12) | Veliero (170) |
|---|---|---|
| Barcellona | 6 | 133 |
| Sicilia | 13 | 123 |
| Normandia | 7 | 107 |

Esempi di Nave (12), come li calcola `js/sea-routes.js`: Normandia → West Country, Home
Counties, East Anglia, Fiandre, **Olanda**; Sicilia → Calabria, Tunisia, Campania, Puglia,
Sardegna, Abruzzo, Lazio. È la traversata di uno stretto o di un mare breve, mai un mare intero.

**Rotte lunghe (solo Veliero).** Oltre la portata il giocatore indica una **rotta** — uno degli 8
punti cardinali — e ogni turno il veliero avanza di una portata piena, scoprendo quel che gli
entra nel raggio; può fermarsi appena avvista una terra nuova. Turni di navigazione da
Barcellona, **misurati**:

| turni | mete |
|---|---|
| **1** | tutto il Mediterraneo (Gerusalemme compresa), Senegal, Guinea, Sierra Leone, Islanda |
| **2** | Groenlandia, Terranova, Brasile, Virginia, **Cuba**, Florida, **Capo di Buona Speranza**, Yucatan |
| **3** | Messico, Veracruz, Zanzibar, Somalia |
| **4** | Yemen, Oman, **India**, **Sumatra, Malacca, Giava** |

**Suez non esiste**: per l'Asia si passa dal Capo. Verificato sulla mappa — Barcellona→Yemen
misura 560 unità (giro dell'Africa), non 230 (Mar Rosso).

**Lo sbarco è la nave stessa.** Attaccare via mare significa **approdare**: la nave lascia la sua
provincia, si porta dietro il carico e combatte nella provincia bersaglio, col terreno di
quella provincia (§9.1).
- **Vinta** → nave e superstiti occupano la provincia presa. La nave è ora ancorata lì e la
  portata successiva si misura da quella costa: **la flotta avanza con la conquista**.
  **Lo sbarco è totale**: chi scende resta a terra, non esiste la ripartizione fra chi
  occupa e chi rientra che invece si fa dopo una conquista via terra. Per riportare
  indietro degli uomini c'è lo **spostamento di fine turno**, con la nave come mezzo di
  trasporto — una scelta successiva e visibile, non un ripensamento dentro l'assalto.
- **Persa** → l'attaccante perde tutte le truppe impegnate **e la nave, che passa al difensore**.

Sbarco solo su provincia **costiera**. Il carico è il tetto **per scafo**: un'invasione vera si
programma con più navi (3 Navi = 6 Legno + 6 soldati = **24 uomini a turno** oltre la Manica).

**Ogni scafo è una pedina a sé** (§3): non si impilano e non si contano come i soldati. Ognuno
imbarca il suo carico e lo **mostra** — 16 uomini si dividono in 8+8 su due Navi che possono
partire per due bersagli diversi, e chi le avvista sa quanti uomini portano. È anche la ragione
per cui il carico dev'essere un dato dello scafo e non della provincia: serve a chi guarda, non
solo a chi muove.

**Le navi seguono la provincia.** Chi conquista una provincia eredita le navi che vi sono
ancorate, Veliero compreso: è lo stesso principio delle costruzioni (§9 — non si rade nulla,
cambia il colore).

**Le navi non collegano** (§4). Uno scafo porta uomini, non rifornimenti: una conquista
d'oltremare **non è collegata** alla Capitale e quindi **non produce nulla** finché non vi si
costruisce una **Città**, che da lì fa da capitale secondaria per tutto quel che le sta attorno.
Prendere una costa è a buon mercato; farla rendere è l'investimento vero. Il Veliero da 4000
monete ti **apre** un continente, la Città da 1000 te lo fa diventare impero.

**Aperto, da definire:** lo **scontro navale in mare aperto** — due velieri che si incontrano
durante una rotta lunga si combattono. Rimandato di proposito: nel calendario compresso i
velieri sono roba del 1500, cioè a molti turni dall'inizio, e tutto il resto funziona senza.

---

## 10. Prestigio — vittoria, cicli e obiettivi **[REGOLA]**

Il **Prestigio** è uno degli obiettivi principali (con la conquista territoriale e l'eliminazione
degli avversari): misura il successo politico, economico e strategico del regno.

- **Nessuna scadenza fissa a turni.** La partita si chiude quando lo si **decide**.
- **Sconfitta:** un giocatore è eliminato quando **perde tutte le province**.
- **Vittoria:** vince chi ha **più Punti Prestigio d'Oro** al momento in cui si decide di
  terminare la partita. (Restare l'**unico regno** in gioco è comunque una vittoria immediata.)
- **Punto Prestigio d'Oro:** ogni ciclo in cui raggiungi i **10 punti prestigio** vale **1 punto
  d'oro** (vedi sotto). I punti d'oro si accumulano per tutta la partita e sono il vero punteggio.

### Cicli di 10 turni
Il Prestigio si assegna a **cicli di 10 turni**. All'inizio di ogni ciclo, ogni giocatore riceve
una serie di **obiettivi** da completare entro i 10 turni successivi, **bilanciati** in base allo
stato della partita e **ispirati al contesto storico** del regno rappresentato.

### Punti per ciclo (fino a 10)
- **Popolarità:** **+1** Prestigio per ogni turno con Popolarità **alta (≥ 4)**; **−1** per ogni
  turno a Popolarità **1** (malus mantenuto **[REGOLA]**). Pop. 2–3 → 0.
- **Obiettivo Primario:** **6** punti — il più complesso/strategico (espansione, costruzione,
  controllo di aree specifiche).
- **Obiettivo Secondario:** **2** punti — difficoltà intermedia, integra il primario.
- **Obiettivo Terziario:** **2** punti — più semplice/situazionale, flessibilità tattica.

- **Conquista di una Capitale nemica: +2 Prestigio**, **a prescindere dagli obiettivi** (non serve
  che sia il tuo obiettivo). È solo un altro modo di guadagnare prestigio nel ciclo.
- **Perdere la propria Capitale: nessun malus di prestigio** — il danno meccanico (perdita di
  raccolta, monete, popolarità, difesa) è già sufficiente. Si premia l'attaccante, non si punisce
  due volte il difensore. *(Le Città non danno prestigio di conquista, salvo decisione futura.)*

**Tetto e punto d'oro [REGOLA]:** in un ciclo puoi accumulare prestigio da **più fonti insieme**
(Popolarità + obiettivi + conquiste). Il totale del ciclo è **cappato a 10**: puoi anche superarlo,
ma il massimo resta 10 e l'eccesso è perso. **Raggiungere 10 in un ciclo → 1 Punto Prestigio d'Oro.**
I punti prestigio "normali" sono per-ciclo (ci si riparte ogni 10 turni); i **punti d'oro** sono
permanenti e decretano il vincitore.

### Prossimo passo
Progettare **esempi concreti di obiettivi** (per civiltà/situazione di gioco): è lì che si gioca
il vero bilanciamento. → *in discussione.*

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
- Combattimento **probabilistico** `P_A = A^k/(A^k+Deff^k)`, `k` dal terreno, con attrito anti-valanga (§9,
  `battle.js`), bonus difensivi **Città/Capitale +1, Fortezza +3** (in `Deff = D + bonus`).
- Vittoria: **soglia di prestigio** (proposta 30) **oppure** eliminazione degli altri; si
  **perde** restando senza province. Nessuna scadenza a turni.
- Tassazione: **solo le Città**, 50/100/150 (leggera/normale/dura).
- Valori iniziali: **1000 monete**, **5 soldati/provincia**, **0 scorte**.
- Città: **+1 Pietra una tantum** alla costruzione, poi +1 soldato + monete-tasse/turno.
- Risorse: **1/turno per provincia collegata** (niente sviluppo).
- **Popolarità** (§8): formula `(Difesa+Benessere+Tassa)/3`, i tre indici coi loro calcoli,
  migliorie civiche (§6.1), arrotondamento (>0,8), pannello dedicato.
- **Prestigio** (§10): cicli di 10 turni; tutte le fonti (Popolarità ≥4 +1/turno e 1 −1/turno;
  obiettivi 6/2/2; conquista Capitale +2) confluiscono in un totale **cappato a 10**; raggiungere
  10 = **1 Punto Prestigio d'Oro**. **Vittoria = più punti d'oro** quando si decide di finire (o
  ultimo regno in gioco); niente malus per la Capitale persa.

**Ancora aperte:**
- **Obiettivi di ciclo**: progettare esempi concreti (per civiltà/situazione) — *prossima discussione*.

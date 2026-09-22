# I BINARI STORICI DEI DIECI REGNI

Questo documento è la **traccia storica** su cui corrono gli obiettivi di prestigio (§10).
Non contiene numeri, e non deve contenerne: qui si scrive **dove ogni regno deve trovarsi**
di secolo in secolo, e quello è tutto. Quanto oro, quanta pietra, quante province, quale
guarnigione — li decide il generatore (`src/js/objectives.js`) a ogni cambio ciclo, sulla
situazione reale di quel regno in quella partita.

**La divisione del lavoro, in una riga**: qui si dice *cosa*, il generatore decide *quanto*.

## Come si legge un capitolo

Ogni cella è un **capitolo**: un secolo della storia di quel regno, con la sua **mira
primaria** — la voce da 5 punti, quella che *è* la ragione per cui quel secolo esiste nella
storia di quel regno. Secondario (3p) e Terziario (2p) non si scrivono: li compone il
generatore scegliendo, fra i bisogni veri del regno in quel momento, quelli che sostengono
la mira primaria (se ti manca la pietra ti chiederà pietra, se non hai strade ti chiederà
strade, se sei povero ti chiederà un tesoro).

Il capitolo **non è legato al numero del ciclo**: è legato a `player.capitolo`, cioè a dove
il regno è arrivato nella *propria* storia. Chi compie un capitolo passa al successivo; chi
non ce la fa lo rifà a intensità minore; chi crolla arretra. Un regno lento arriva al
capitolo III al quinto ciclo, e va bene così — è la sua storia che è andata più piano.

## Un capitolo non si salta mai

**Un obiettivo con un gancio storico non può sparire** (regola dell'utente), e vale
doppio se un **evento strutturato** dipende proprio da lui — l'Inghilterra raduna a
Home Counties (capitolo II) perché è di lì che parte la `crociata-inglese` del turno
21 (§Eventi): se quel capitolo saltasse, l'evento non avrebbe più uomini da imbarcare.
Il capitolo avanza **sempre di uno** per ciclo, mai di più: non esiste più uno scatto
che ne salta uno intero perché il regno ha "già superato" quel che chiedeva.

Un regno che corre non riceve il pezzo dopo — riceve **lo stesso pezzo, più duro**:

- **La soglia si alza fin dove serve.** Se a fine ciclo I hai già 25 uomini a Home
  Counties (l'ancora `eccedere` era 14), il capitolo II non ti chiede più 14 — ti
  chiede 27. Prima la banda si fermava a `eccedere × 1,2`: un obiettivo del genere
  nasceva già completo, cioè un premio gratis invece che un traguardo.
- **Se anche il tetto naturale è già pieno, il capitolo TRABOCCA** in una regione
  storicamente successiva invece di certificare gratis una conquista vecchia. Esempio:
  Castiglia V chiede di unificare l'Iberia (13 province); se la penisola è già tutta
  tua *prima* che il capitolo nasca, il capitolo non dice più "possiedi 13 province
  iberiche" (già vero) — dice "spingiti oltre lo Stretto: possiedi N province del
  Maghreb". Lo decide l'autore del capitolo, non il generatore da solo: una voce
  `regione` porta `arg.oltre` (il nome del SET successivo), `nOltre` e `testoOltre`/
  `checkOltre` — le quattro vanno scritte insieme, o il testo parlerebbe della regione
  sbagliata mentre il conto ne misura un'altra.

**La PONDERAZIONE conta più del meccanismo** (regola dell'utente): "non puoi passare
da 'conquista altre 2-3 province in Spagna' a un obiettivo quasi impossibile come
prendere TUTTO il Nordafrica" — e non puoi chiedere alla Germania 8 province italiane
solo perché ha già raggiunto la sua massima estensione storica. `nOltre` esiste apposta
per questo: sono ancore SCRITTE A MANO per la regione nuova, non quelle del capitolo
vecchio riciclate. Riusare l'`n` vecchio sballava la scala sempre nello stesso modo —
la sua `eccedere` era tarata su una regione magari il doppio più grande, e finiva
clampata al tetto di quella nuova: chiedeva l'INTERA regione nuova in un colpo, non un
passo avanti. La regola pratica: `nOltre` chiede quasi sempre gli stessi numeri (un
gradino più in basso) che un **capitolo successivo dello stesso binario** già chiede
DAVVERO per quella regione — così l'ambizione resta sulla scala giusta E resta
storicamente credibile, perché è la stessa storia che il binario racconterebbe comunque,
solo in anticipo.

**Verificato riga per riga sul codice vivo di `objectives.js` (2026-09-22, riallineamento
dei docs col codice reale)**: 17 traboccamenti attivi, su 7 dei 10 regni. **Castiglia,
Emirato dei Mori e Inghilterra non ne hanno NESSUNO** (non solo "non ne hanno bisogno":
verificato che nessuna loro voce dichiara `arg.oltre` — anche dove la vecchia versione di
questo documento ne dava per scontato uno, es. Castiglia ANDALUS→IBERIA/IBERIA→MAGHREB e
Mori HOLY_LAND→ARABIA, che **non sono mai esistiti nel codice**: erano intenzione di design
mai scritta, o scritta e poi sostituita da un capitolo diverso senza aggiornare questi docs).

| regno | trabocca da → a | quando | voce |
|---|---|---|---|
| Regno di Francia | NORMANDY_FR → MED_FR | cap III (Bouvines coincide con gli Albigesi, 1209-1229) | fr3-1 |
| Regno di Francia | NORMANDY_FR → ITALIA_NORD | cap V, un ciclo prima del vero 1494 di Carlo VIII | fr5-1 |
| Sacro Romano Impero | ITALIA_NORD → ADRIATIC | cap III | sr3-1 |
| Sacro Romano Impero | AUSTRIA_EST → PANNONIA | cap V (**non** BALCANI: la vecchia versione di questo doc sbagliava la meta) | sr5-1 |
| Ducato di Polonia | POLONIA_EST → RUS_NORD | cap II (**non** cap V da BALTICO: la vecchia versione di questo doc sbagliava sia il ciclo sia la regione di partenza) | po2-1 |
| Ducato di Polonia | RUTENIA → RUS_NORD | cap VII, "Verso la Russia" — lo stesso intervento polacco nei Torbidi (1605-1618) | po7-1 |
| Kievan Rus' | RUS_NORD → EST_RUSSO | cap IV (una volta sola, non due: la vecchia versione di questo doc ne contava due) | ru4-1 |
| Kievan Rus' | CAUCASO → PERSIA | cap V, le guerre russo-persiane in anticipo | ru5-2 |
| Kievan Rus' | RUTENIA → POLONIA | cap VI, "L'invasione d'Europa" | ru6-1 |
| Kievan Rus' | BALTICO_NORD → BALTICO | cap VIII, oltre la finestra di Pietro il Grande | ru8-1 |
| Ducato di Ungheria | ADRIATIC → BALCANI_OVEST | cap II | un2-1 |
| Ducato di Ungheria | PANNONIA → BALCANI | cap III, la stessa meta di un4-1 in anticipo | un3-1 |
| Ducato di Ungheria | AUSTRIA_EST → ITALIA_NORD | cap V (non presente nella vecchia versione di questo doc) | un5-1 |
| Impero Bizantino | GREECE → BALCANI | cap II (la vecchia versione di questo doc diceva che Bisanzio non ne avesse bisogno: falso) | bi2-1 |
| Impero Bizantino | BALCANI_OVEST → PANNONIA | cap VI (idem) | bi6-1 |
| Califfato Abbaside | PERSIA_OVEST → PERSIA_EST | cap II (**non** MESOPOTAMIA→PERSIA al cap III, che non è mai esistito) | ab2-2 |
| Califfato Abbaside | PERSIA_EST → ARABIA | cap III, la stessa meta di ab4-1 in anticipo | ab3-2 |

## La scala dell'ambizione

**Un capitolo tardo non può chiedere una cosa che era già fattibile nei primi cicli**
(regola dell'utente). Al ciclo 6 o 7 un regno ha venti province, migliaia di monete e una
flotta: sentirsi chiedere «prendi 2 province del Maghreb» — che poteva fare al ciclo 2 —
non è un obiettivo, è già fatto. La scala:

| ciclo | che cosa può chiedere la mira primaria |
|---|---|
| I-II | la propria terra: 1-3 province vicine, il primo Mercato, la prima Città, le prime strade |
| III-IV | la regione confinante, o unificare la propria; guarnigioni che cominciano a costare (5-6 uomini) |
| V | un **teatro intero**: tutta una regione, non una parte |
| VI | il primo **cancello di spesa** — il Veliero (4000 monete), la Fortezza (2000 più sei risorse), la seconda o terza Città |
| VII-VIII | quel che può fare solo un **impero**: teatri lontani raggiunti per mare, più Città o Fortezze insieme, tesori da migliaia |

Il modo concreto di rispettarla è il combinato `tutti`: al ciclo VII non si chiede «quella
regione», si chiede «quella regione **e** una Città dentro» — conquistare non basta più,
bisogna restarci.

**E il capo del combinato dev'essere la parte SENZA tetto.** Una regione che possiedi già è
un tetto (`tetto` nel template): la soglia non può crescerci sopra, e l'obiettivo nasce già
compiuto. Quel che scala senza limite sono gli insediamenti che devi ancora costruire —
perciò nei capitoli «tieni quel che hai» il capo è `fortezze` o `cittaCount` e la regione
sta fra le richieste fisse, non viceversa. Verificato: con un regno che possiede la propria
regione d'origine e il teatro vicino, 3 Città e una Fortezza, **nessuno** dei 30 primari dei
cicli VI-VIII nasce già compiuto (prima erano 9 su 30).

## Quel che un capitolo non può dare per scontato: un EVENTO

**Nessun capitolo si appoggia all'invasione mongola** (regola dell'utente). L'Orda nasce al
turno 21 (§Eventi) ma deve attraversare mezzo mondo, e non è detto che arrivi in tempo — né
che nasca affatto, se il posto dove dovrebbe comparire è occupato. Un capitolo che chiedesse
di «fermare l'Orda» sarebbe compiuto o impossibile per ragioni che non dipendono dal
giocatore. I capitoli difensivi chiedono perciò quel che il giocatore controlla —
presidiare i confini, tenere unito il regno, erigere una Fortezza — e il **testo non nomina
mai un invasore che potrebbe non presentarsi**. Un rinforzo dei confini va benissimo; «resisti
all'Orda» no. Lo stesso vale per ogni potenza che il gioco non mette sulla mappa (Ottomani,
Ilkhanato, Timuridi): al più danno il **nome** a un capitolo, mai la sua condizione di vittoria.

I capitoli riscritti per questa regola:

| regno | ciclo | era | ora |
|---|---|---|---|
| Ducato di Polonia | III | «L'Orda a Legnica» | **La frammentazione** — il ducato si spartisce fra i duchi |
| Ducato di Ungheria | III | «Mohi» | **Le fortezze di pietra** — l'incastellamento di Béla IV |
| Kievan Rus' | III | «Il giogo» | **L'ascesa di Mosca** — fra i principati divisi |
| Kievan Rus' | V | «La fine del giogo» | **Oltre il Volga** |
| Emirato dei Mori | IV | «Ain Jalut» | **I mamelucchi** — il Levante armato |
| Califfato Abbaside | III | «1258, il sacco di Baghdad» | **Il cuore della Mesopotamia** |
| Califfato Abbaside | IV | «L'Ilkhanato» | **L'altopiano persiano** |
| Califfato Abbaside | V | «Timur» | **La Persia in armi** |
| Ducato di Ungheria | VI | «Mohács» | **Il regno in armi** |
| Emirato dei Mori | VI | «La marea ottomana» | **La cittadella del Cairo** |
| Sacro Romano Impero | VIII | «Ricacciare l'Ottomano» | **La marcia d'Oriente** |

Le **crociate** restano nominate (Francia I, Inghilterra II, Bisanzio I, Mori III): sono
un evento che *sbarca direttamente* sulla sua meta invece di attraversare il mondo, e
soprattutto quegli obiettivi chiedono comunque una cosa che il giocatore controlla —
radunare uomini su una costa, possedere N province — non che la crociata riesca.

**Un Terziario non è un obiettivo vecchio rifatto** (regola dell'utente). Chiedere al capitolo
V «possiedi 9 province britanniche» a un regno a cui il capitolo I ne chiedeva 7 non chiede
niente: quel traguardo è in tasca da venti turni. Il contrappeso giusto a un secolo speso a
conquistare sono **Popolarità e Benessere**, e vanno messi *spesso* — sono le uniche voci che
un regno perde davvero mentre fa la guerra (l'esercito che sbarca è quello che non sta
costruendo strade), e il Benessere in particolare non si compra con la guardia: sale solo
collegando risorse e cibo (§4, §8). Nel binario inglese ricorrono a III, V e VIII.

## Il vocabolario delle mire

| mira | che cosa chiede | template che il generatore userà |
|---|---|---|
| `conquista <REGIONE>` | avanzare dentro una regione | `regione` |
| `unifica <REGIONE>` | possederla quasi tutta | `regione` (soglia al tetto) |
| `tieni <REGIONE>` | non perdere quel che hai lì | `regione` (livello da tenere) |
| `presidia <provincia>` | una provincia precisa, ben difesa | `provincia` |
| `raduna <REGIONE>` | ammassare uomini su una costa/frontiera | `regioneGuarnigione` |
| `sbarca <REGIONE>` | prendere via mare | `regione` + `viaSea` |
| `spedizione` | rotte lunghe oltremare (Veliero) | `regione` + `viaSea` sulla meta d'oltremare |
| `flotta` | navi | `navi`, oppure `naviTipo` per il **Veliero** |
| `fonda <dove>` | una Città, difesa | `citta` (provincia precisa) · `cittaRegione` (una regione) |
| `riprendi` | riconquistare ciò che ti hanno tolto | `provincia`, dal `rancore` |
| `arricchisci` | un tesoro degno | `oro` |
| `regna` | Popolarità / Sicurezza / Benessere | `popolarita`, `sicurezza`, `benessere` |
| `converti <REGIONE>` | province della tua confessione | `fede` |
| `presidia la Capitale` | ovunque sia ADESSO, non una provincia fissa | `capitale` |
| *(modificatore)* `dietro le mura` | possiedi una Fortezza | `fortezza`, combinato con `tutti` |
| `fonda N città` | quante Città, non una sola | `cittaCount` · `cittaRegioneCount` per «N nel Nuovo Mondo» |
| `erigi N fortezze` | quante Fortezze | `fortezze` |

Tutti i template del vocabolario sono scritti. La `spedizione` non ne vuole uno suo: quel che
conta non è che una nave sia in mare, ma dove SCENDE — e quello lo dicono già `regione` +
`viaSea` sulla meta d'oltremare, come nei capitoli VII e VIII inglesi. `fede` (converti) misura
quante province di una regione sono ADESSO della tua famiglia di fede di stato — non guarda la
fede di partenza, guarda quella di oggi, per conquista o per scisma. `capitale` risolve
"presidia la Capitale" (Polonia VIII, Ungheria VI): la Capitale si costruisce, si sposta e si
conquista, quindi un capitolo non può nominare una provincia fissa — legge `ctx.capitalId()`,
qualunque essa sia in quel momento. `fortezza` è booleano come `mercato` ("possiedi una
Fortezza") e serve da solo o combinato con `capitale` via `tutti`, per gli ultimi capitoli di un
binario che finisce sotto assedio.

---

# La direzione voluta dall'utente (riferimento, 2026-09-14)

**Questa è una LEGENDA, non una lista di obiettivi** (regola dell'utente). Non va tradotta
in obiettivi uno-a-uno: serve solo a vedere che **direzione** prende ogni regno nel corso
della partita, così che gli obiettivi che inserisco io — quando quelli dell'utente non si
possono usare — restino **in linea con quella rotta**. È il *cosa a grandi linee*; i capitoli
di sopra e i numeri di `objectives.js` sono l'attuazione. Dove i due divergono, è segnato.

| regno | cicli 1‑5 | cicli 6‑8 | stato vs binario attuale (verificato 2026-09-22) |
|---|---|---|---|
| **Inghilterra** | Regno Unito + Irlanda, crociata, invasione del continente e Cent'Anni | dominio navale del mondo: Stati Uniti, India, ecc. | ✅ allineato |
| **Francia** | espansione e consolidamento del regno, crociata, Cent'Anni | Italia, navigazione oltreoceano in **Africa + Canada** | ✅ VIII (`fr8-1`) fonda città in AMERICA **e** sbarca in AFRICA (Maghreb escluso) — non esiste una regione Canada dedicata, l'America resta condivisa con l'Inghilterra (come NORMANDY_FR/ITALIA_NORD, "la stessa guerra vista da due lati") |
| **Sacro Romano Impero** | espansione **prima su Austria e Italia**, unificazione Germania; **poi vira verso Paesi Bassi e Danimarca** | lotta per i confini verso Boemia, Austria e Balcani | ⚠ tuttora assente il nord (Paesi Bassi/Danimarca); il codice conferma invece la direzione a oriente (ITALIA_NORD→ADRIATIC al cap III, AUSTRIA_EST→PANNONIA al cap V) — probabilmente più fedele alla storia vera (l'Impero non ha mai tenuto stabilmente Paesi Bassi o Danimarca, ma respinge davvero gli Ottomani), da confermare con l'utente se la nota del 2026-09-14 va considerata superata |
| **Spagna (Castiglia)** | Reconquista, lotta agli arabi; poi Sud Italia | dominio coloniale in **centro e sud America** (come nella storia) | ✅ risolto (2026-09-22): VI (`ca6-1`) sbarca in AMERICA_CENTRO ("I conquistadores"), VII (`ca7-1`) fonda città in AMERICA_SUD ("Pizarro e l'impero d'argento") |
| **Emirato dei Mori** *(ex "Califfato Fatimide")* | espansione verso Spagna, Egitto e **intero Nord Africa** | espansione su **Mar Rosso e Sud Italia** | ⚠ ancora così: MAGHREB arriva solo al ciclo VII, nessuna meta "Mar Rosso" dedicata (ARABIA nel codice è solo abbaside, i Mori non la usano), Sicilia/Creta è solo un Terziario navale al ciclo III, non un vero fronte "Sud Italia" |
| **Abbasidi** | guerre sante in Medio Oriente, difesa dei confini contro i Mongoli, conquista dell'**intera Persia** | **mira espansionistica marcata**, non solo difesa della Persia: India, Africa orientale, lotta ai cristiani in **Turchia** | ⚠ parzialmente risolto: V (`ab5-2`) tocca già il Corno d'Africa (AFRICA_CE, via nave), VII (`ab7-3`) sbarca in Anatolia "per strapparla ai cristiani" — ma VI e VIII restano centrati sulla Persia (fede, provCount, Hudavendigar), l'India resta assente |
| **Kievan Rus'** | espansione e lotta ai Mongoli; **discesa in Europa e verso il Mediterraneo** | conquista dell'**Asia centrale**, lotta ai cattolici polacchi | ⚠ parzialmente risolto: VI (`ru6-1`, "L'invasione d'Europa") trabocca già verso la Polonia quando la Rutenia è tutta russa, V (`ru5-2`) trabocca verso la Persia — ma nessuno dei due arriva davvero al Mediterraneo |
| **Polonia** | consolidamento territori, avvicinamento al mare, difesa dei confini | **combattere i russi** ed espansione **verso est** | ✅ risolto: II (`po2-1`) e VII (`po7-1`, "Verso la Russia") traboccano entrambi verso RUS_NORD quando le terre lituano-rutene sono già polacche — è lo stesso intervento reale nei Torbidi russi (1605-1618) |
| **Ungheria** | espansione in Europa centrale, presa dei Balcani, lotta alle potenze del centro Europa, espansione verso **Austria** | espansione verso **Grecia** e lotta ai **russi** | ⚠ parzialmente risolto: l'Austria c'è (V, `un5-1`, con trabocco oltre le Alpi in Italia) — Grecia e lotta ai russi restano assenti. Storicamente l'Ungheria non ha mai avuto un vero fronte greco o russo: valutare con l'utente se derubricare questi due punti |
| **Bisanzio** | **niente evento crociata**, ma di fatto combatte gli arabi (Selgiuchidi e Abbasidi) **in Turchia**; espansione in Grecia, navi verso Sud Italia | conquista e difesa della Turchia, espansione in Italia e nei Balcani | ✅ coerente, e **con traboccamenti veri** che questo doc prima non registrava: GREECE→BALCANI al cap II (`bi2-1`), BALCANI_OVEST→PANNONIA al cap VI (`bi6-1`) — il fronte anatolico (ANATOLIA III/V) resta la lotta agli arabi; nessuna Terra Santa |
| **Selgiuchidi** *(bot, almeno all'inizio)* | conquista Turchia e Costantinopoli | lotta ai cristiani fino al centro Europa, se riescono | ✅ dottrina (`marcia`, doctrines.js) |
| **Mongoli** *(bot, almeno all'inizio)* | invasione di Russia e Medio Oriente | ritirata e consolidamento in Asia centrale | ✅ dottrina (`marcia` + stanziale al 1350) |
| **Portogallo** *(bot, almeno all'inizio)* | difesa dei confini | viaggi navali verso il Sud America appena possibile | ✅ dottrina (`soloMare`/coloniale) |

**Precisazioni dell'utente (2026-09-14):**
- **Bisanzio** resta **senza evento crociata** — la "lotta agli arabi" si realizza
  combattendo Selgiuchidi e Abbasidi **in Turchia** (il fronte ANATOLIA che il binario già
  ha ai capitoli III/V). Nessuna Terra Santa: nodo chiuso.
- **Abbasidi**: la mira dev'essere **più marcatamente espansionistica**, non il solo
  difendere la Persia — i capitoli 6‑8 vanno spinti fuori dall'altopiano (India, Africa
  orientale, Turchia).
- **Spagna**: le colonie devono puntare a **centro‑sud America** come nella storia.
- **Sacro Romano Impero**: l'espansione **prima** su Austria e Italia, **poi** vira a nord
  verso Paesi Bassi e Danimarca.

**Nodo colonie — Castiglia risolta (2026-09-22), il resto come nel 2026-09-14:**
Inghilterra→Nord America (AMERICA), Spagna→centro/sud America (**ora agganciata**:
AMERICA_CENTRO al VI, AMERICA_SUD al VII), Portogallo→sud America (dottrina `coloniale`,
non un binario a capitoli), Francia→AMERICA (condivisa con l'Inghilterra) + AFRICA
subsahariana. Restano da fare, se si vuole completare il nodo: (a) per il Portogallo, un
**sottoinsieme Brasile** di `AMERICA_SUD`, così Spagna e Portogallo non puntino allo stesso
teatro identico; (b) una meta **Canada** dedicata per la Francia — sulla mappa esistono già
le province (Quebec, Ontario, Newfoundland, Manitoba, Alberta, Saskatchewan, British
Columbia, verificato in `map_data.js`), ma finché la Francia condivide AMERICA con
l'Inghilterra come "la stessa guerra coloniale vista da due lati" (lo stesso pattern di
NORMANDY_FR e ITALIA_NORD) non è chiaro che una regione Canada separata aggiunga qualcosa:
da discutere con l'utente prima di scriverla.

---

# I dieci binari

## Regno di Castiglia — *dalla Reconquista all'impero atlantico*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | La Reconquista comincia | `conquista ANDALUS` |
| II | 1100-1199 | Verso il Tago | `conquista IBERIA` |
| III | 1200-1299 | Las Navas de Tolosa | espandi il regno *(`provCount`, non `unifica ANDALUS`: al cap III la mira è già il conteggio province totali)* |
| IV | 1300-1399 | Lo Stretto | consolida IBERIA *(`regione IBERIA`, non `sbarca MAGHREB`: lo sbarco in Maghreb è il Secondario `ca4-2`)* |
| V | 1400-1499 | Granada e l'Atlantico | vara un Veliero *(`naviTipo: vascello`, non `unifica IBERIA` — **nessun trabocco**: Castiglia non ha `arg.oltre` da nessuna parte nel codice, a differenza di quanto diceva la vecchia versione di questo doc)* |
| VI | 1500-1599 | I conquistadores | sbarca AMERICA_CENTRO *(`ca6-1`, corretto il 2026-09-22: prima puntava per errore alla stessa AMERICA di Inghilterra/Francia — il Messico di Cortés, non le tredici colonie)* |
| VII | 1600-1699 | Pizarro e l'impero d'argento | fonda città in AMERICA_SUD *(`ca7-1`, corretto insieme al VI: il Perù di Pizarro)* |
| VIII | 1700-1799 | Le riforme borboniche | fonda N Città *(`cittaCount`, non `regna`)* |
| IX | 1800-1899 | La penisola invasa | `tieni IBERIA` |
| X | 1900-1999 | La ricostruzione | `arricchisci` |

## Regno di Francia — *dal dominio reale all'egemonia continentale*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | L'appello di Clermont | `raduna MED_FR` |
| II | 1100-1199 | Oltremare | `presidia Aleppo` |
| III | 1200-1299 | Bouvines e il Midi | `conquista NORMANDY_FR` *(trabocca in `MED_FR` se già intera — Béziers/Albigesi)* |
| IV | 1300-1399 | I Cent'Anni | `tieni NORMANDY_FR` |
| V | 1400-1499 | Cacciare l'inglese | `unifica NORMANDY_FR` *(trabocca in `ITALIA_NORD` se già intera)* |
| VI | 1500-1599 | Le guerre d'Italia e gli Ugonotti | `conquista ITALIA_NORD` |
| VII | 1600-1699 | I confini naturali e la revoca dell'Editto di Nantes | fonda AMERICA (Nuova Francia) *(`fr7-1`, `tutti`: Veliero + colonia — **non** `conquista RENO`: RENO è ancora definita fra i SET ma non è più usata da nessun binario; il capitolo VII è stato riscritto sulla colonia americana, non sul Reno)* |
| VIII | 1700-1799 | Le colonie | fonda AMERICA + sbarca AFRICA *(`fr8-1`, `tutti`: Città americana + provincia africana, Maghreb escluso)* |
| IX | 1800-1899 | L'egemonia continentale | `conquista GERMANIA` |
| X | 1900-1999 | Tenere | `tieni` |

## Emirato dei Mori — *dal Mediterraneo all'Egitto, e ritorno* (già "Califfato Fatimide": rinominato per riflettere Almoravidi e Almohadi, i veri protagonisti della guerra in Iberia — vedi `docs/CRONOLOGIA_STORICA.md`)

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Le vele degli Almoravidi | `conquista IBERIA` *(`fa1`: sbarco e presa, ratchet come ogni `regione`)* |
| II | 1100-1199 | Gli Almohadi e l'Egitto | `conquista IBERIA` *(`fa2-1`, non `EGYPT`: l'Egitto è il Secondario `fa2-2` — **nessun trabocco**: i Mori non hanno `arg.oltre` da nessuna parte)* |
| III | 1200-1299 | Saladino | conquista Terra Santa *(`province: [Palestine, Lebanon]`, elenco fisso — non `regione HOLY_LAND`, e HOLY_LAND non è mai usata dai Mori)* |
| IV | 1300-1399 | I mamelucchi | `conquista EGYPT` *(non `tieni LEVANT`: LEVANT è definita ma non usata da nessun binario)* |
| V | 1400-1499 | Le vie del Mar Rosso | regna *(`turniPopolarita`, non `conquista ARABIA`: ARABIA nel codice è usata solo dagli Abbasidi, mai dai Mori)* |
| VI | 1500-1599 | La cittadella del Cairo | fonda N Città *(`cittaCount`, non `tieni EGYPT`)* |
| VII | 1600-1699 | Il Nordafrica | `conquista MAGHREB` |
| VIII | 1700-1799 | I bey e i mamelucchi | flotta + fortezza *(`tutti`: una barca e una Fortezza, non `fonda EGYPT`)* |
| IX | 1800-1899 | Il canale | `arricchisci` |
| X | 1900-1999 | L'indipendenza | `regna` |

## Regno di Inghilterra — *dall'isola all'impero, e ritorno all'isola*

**È stato il primo binario steso per intero** (capitoli I-VIII, revisione dell'utente del
2026-08-29) e la sua forma è rimasta il modello per gli altri nove, scritti a ruota (tutti e
dieci i binari coprono ora i capitoli I-VIII in `objectives.js`): il continente si prende presto
e leggero, si perde a metà partita, e la storia continua per mare.

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Unificare l'isola | `conquista BRITISH` |
| II | 1100-1199 | L'impero angioino | `sbarca NORMANDY_FR` |
| III | 1200-1299 | Le teste di ponte | `presidia Flanders` + una di `FRANCIA` |
| IV | 1300-1399 | I Cent'Anni | `presidia Aquitaine` |
| V | 1400-1499 | L'Irlanda | `unifica IRELAND` + `fonda` lì una Città |
| VI | 1500-1599 | La flotta dei Tudor | `flotta` (un **Veliero**) |
| VII | 1600-1699 | Il Nuovo Mondo | `fonda AMERICA` |
| VIII | 1700-1799 | Le Indie | `sbarca INDIE` |
| IX | 1800-1899 | Il dominio dei mari | `arricchisci` |
| X | 1900-1999 | L'isola | `tieni BRITISH` |

Il filo che tiene insieme i capitoli, e che va letto prima di ritoccare una soglia:

- **II è lo sbarco**, e sotto ci sta il raduno a Home Counties: preparare l'oste è quel che
  rende possibile la traversata, non quel che la sostituisce. Resta comunque un piede sulla
  riva — la guerra vera comincia al IV.
- **III non conquista niente**: tiene quel che il II ha preso, e lo tiene in due posti
  (le Fiandre e una terra di Francia), perché una testa di ponte sola è una testa di ponte persa.
- **V è il capitolo più caro del binario**, ed è la cerniera: prendere tutta l'Irlanda e
  fondarvi una Città costa l'esercito che sta in Francia. È **qui** che l'Inghilterra molla il
  continente, e non per una regola che glielo impone. Il legno chiesto al Secondario è quello
  del Veliero (`COSTS.vascello`: 10 legno), cioè il capitolo dopo.
- **VI, VII e VIII sono una sola cosa in tre tempi**: costruire il Veliero, portarlo a
  occidente e fondare, portarlo a oriente. Senza il VI gli altri due non esistono.

## Sacro Romano Impero — *dai ducati alla potenza continentale*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | I ducati | presidia il regno *(`guarnigioni`, non `presidia GERMANIA`: GERMANIA come regione non è usata prima del cap VII)* |
| II | 1100-1199 | Le città imperiali | fonda una Città *(`citta`, non `fonda GERMANIA`: nessuna regione, una Città qualunque)* |
| III | 1200-1299 | L'Italia di Federico II | `conquista ITALIA_NORD` *(trabocca in `ADRIATIC` se già intera)* |
| IV | 1300-1399 | La Bolla d'Oro | `conquista BALTICO_EST` *(non `unifica GERMANIA`: il cap IV chiede le coste baltiche di Tallin/Tartu/Riga/Courland, non la Germania)* |
| V | 1400-1499 | Gli Asburgo | `conquista AUSTRIA_EST` *(trabocca in `PANNONIA` se già intera — **non** in `BALCANI`: la vecchia versione di questo doc sbagliava la meta)* |
| VI | 1500-1599 | La fede spezzata | fonda città fra Austria/Bohemia/Franconia *(`cittaRegioneCount` su `IMPERO_CENTRO` — verificato: il template `fede` **non compare da nessuna parte** nel cap VI del codice attuale, né come Primario né come Secondario/Terziario (`sr6-2` è scorte di pietra, `sr6-3` è tipiCollegati). CLAUDE.md §Religione afferma il contrario ("il Sacro Romano Impero VI... vive la CONSEGUENZA della Riforma... col template `fede`"): va corretto anche lì, o il capitolo va riscritto per usarlo davvero)* |
| VII | 1600-1699 | I Trent'Anni | `tieni GERMANIA` |
| VIII | 1700-1799 | Verso oriente | erigi una Fortezza *(`fortezza`, non `conquista BALCANI`: BALCANI non compare nel cap VIII del codice attuale)* |
| IX | 1800-1899 | L'unificazione | `unifica GERMANIA` |
| X | 1900-1999 | La potenza continentale | `regna` |

## Ducato di Polonia — *dal mare alle spartizioni, e ritorno*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Sbocco al mare | presidia le coste *(`guarnigioniCostiere`, non `presidia BALTICO`: BALTICO come regione non è mai usata da questo binario)* |
| II | 1100-1199 | Verso le terre lituane | `conquista POLONIA_EST` *(trabocca in `RUS_NORD` se già intera — **non** `flotta`: il capitolo non parla mai di navi, era un titolo rimasto sbagliato da prima del 2026-09-22)* |
| III | 1200-1299 | La frammentazione | presidia i confini *(`guarnigioniConfine`, non `tieni POLONIA`: POLONIA come regione non compare in questo capitolo)* |
| IV | 1300-1399 | Casimiro il Grande e l'unione di Krewo | `fonda POLONIA` |
| V | 1400-1499 | L'unione e Grunwald | espandi il regno *(`provCount`, non `conquista BALTICO`: BALTICO non è mai usata come regione da conquistare da nessun binario, solo come meta di trabocco di Kievan Rus' VIII)* |
| VI | 1500-1599 | L'Unione di Lublino e il granaio d'Europa | fonda N Città *(`cittaCount`, non `arricchisci`)* |
| VII | 1600-1699 | Il diluvio | `conquista RUTENIA` *("Verso la Russia", trabocca in `RUS_NORD` se già intera — non `tieni POLONIA`: il capitolo è offensivo, non difensivo)* |
| VIII | 1700-1799 | Le spartizioni | espandi il regno *(`provCount`, non `presidia` la Capitale: la Capitale non compare in questo capitolo, che ha invece `provCount`/`guarnigioniConfine`/`popolarita`)* |
| IX | 1800-1899 | Senza stato | `riprendi` |
| X | 1900-1999 | Rinascere | `unifica POLONIA` |

## Kievan Rus' — *dalla Rus' all'impero*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Le terre della Rus' | espandi il regno *(`provCount`, non `conquista RUS_NORD`: RUS_NORD come regione entra in gioco solo dal cap IV)* |
| II | 1100-1199 | Kiev di pietra | `fonda Kiev` |
| III | 1200-1299 | L'ascesa di Mosca | presidia Uralsk *(`provincia`, non `tieni RUS_NORD`: la frontiera è una provincia sola, Uralsk — non un'intera regione)* |
| IV | 1300-1399 | Raccogliere le terre russe | `unifica RUS_NORD` *(trabocca in `EST_RUSSO` se già intera — **una volta sola**, non due come diceva la vecchia versione di questo doc)* |
| V | 1400-1499 | Oltre il Volga | `conquista EST_RUSSO` *(il Secondario `ru5-2` trabocca `CAUCASO`→`PERSIA`, ma non è il Primario)* |
| VI | 1500-1599 | Verso oriente | `conquista RUTENIA` *("L'invasione d'Europa", trabocca in `POLONIA` se già intera — **non** `unifica EST_RUSSO`: EST_RUSSO non compare in questo capitolo)* |
| VII | 1600-1699 | La Siberia | presidia Minsk *(`provincia`, non `conquista` l'estremo est: la Siberia vera è il Secondario `ru7-2`, il Primario è ancora un confine occidentale, Minsk)* |
| VIII | 1700-1799 | La finestra sul Baltico | `conquista BALTICO_NORD` *(trabocca in `BALTICO` se già intera — non `conquista BALTICO` direttamente: BALTICO_NORD, cioè Ingria/Carelia/coste estone-livoni, viene prima)* |
| IX | 1800-1899 | L'impero | `conquista CAUCASO` |
| X | 1900-1999 | La potenza | `regna` |

## Ducato di Ungheria — *dal regno prospero al Trianon*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Il regno prospero | regna *(`sicurezza`, coerente con `regna`)* |
| II | 1100-1199 | L'Adriatico | `conquista ADRIATIC` *(trabocca in `BALCANI_OVEST` se già intera)* |
| III | 1200-1299 | Le fortezze di pietra | `tieni PANNONIA` *(trabocca in `BALCANI` se già intera — il tema si chiamava "Mohi" nella vecchia versione di questo doc: rinominato per la regola "un capitolo non può poggiare su un evento", vedi sopra)* |
| IV | 1300-1399 | Gli Angioini | fonda BALCANI *(`cittaRegione`, non `conquista BALCANI`: al cap IV si chiede una Città nei Balcani, non la conquista dell'intera regione — quella arriva all'VIII)* |
| V | 1400-1499 | Hunyadi e Belgrado | `conquista AUSTRIA_EST` *(trabocca in `ITALIA_NORD` se già intera — **non** `presidia BALCANI`: al cap V la mira è l'Austria, non i Balcani)* |
| VI | 1500-1599 | Il regno in armi | `presidia` la Capitale + fortezza *(`tutti`, coerente)* |
| VII | 1600-1699 | Il regno riunito | `unifica PANNONIA` *(non `riprendi`: il cap VII chiede l'intera Pannonia, 5/5 province — la riconquista/BALCANI è all'VIII)* |
| VIII | 1700-1799 | Verso mezzogiorno | `conquista BALCANI` *(7 province — non `unifica PANNONIA`, che è già compiuta al VII)* |
| IX | 1800-1899 | Il dualismo | `fonda PANNONIA` |
| X | 1900-1999 | Il Trianon | `tieni PANNONIA` |

## Impero Bizantino — *la frontiera d'Oriente*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | La riconquista balcanica | `conquista Macedonia+Bulgaria` |
| II | 1100-1199 | I Comneni | `conquista GREECE` *(trabocca in `BALCANI` se già intera)* |
| III | 1200-1299 | La riscossa d'Anatolia | `presidia(6) ANATOLIA` *(**nessun trabocco** in questo capitolo)* |
| IV | 1300-1399 | Le frontiere vigilate | `presidia ogni confine` |
| V | 1400-1499 | La cristianità in pericolo | `presidia(8) ANATOLIA` |
| VI | 1500-1599 | La rinascita imperiale | `conquista BALCANI_OVEST` *(trabocca in `PANNONIA` se già intera — verificato: nel cap VI attuale non c'è nessuna voce "Città" (né Primario né Secondario/Terziario): le tre voci sono BALCANI_OVEST, strade collegate e oro)* |
| VII | 1600-1699 | Verso l'Adriatico | `conquista ADRIATIC` *(non "Albania+Serbia+Montenegro": quell'elenco fisso è sparito, ora è la regione `ADRIATIC` — Croazia/Dalmazia/Istria — col ratchet)* |
| VIII | 1700-1799 | Le terre perdute dell'Islam | erigi una Fortezza *(`fortezza`, non `conquista ISLAM_ORIGINE`: ISLAM_ORIGINE è definita fra i SET ma **non è più usata** — il cap VIII oggi è `fortezza`+`capitale`+`turniTassaDura`)* |
| IX | 1800-1899 | L'impero commerciale | `arricchisci` |
| X | 1900-1999 | Costantinopoli | `tieni GREECE` |

**La storia riscritta (regola dell'utente): Bisanzio NON va più in Terra Santa.**
Non ha più la chiamata del Papa (quella la eredita l'Inghilterra, che sbarca a
Gerusalemme all'inizio del ciclo III — vedi `events.js`, `crociata-inglese`). Di
conseguenza:
- **II — I Comneni**: il primario è la riconquista della **Grecia** (`GREECE`, 4/7);
  il secondario è **La lotta ai Selgiuchidi** (presidia 2 province di `ANATOLIA` con
  ≥5), non più *La guardia di Gerusalemme* (Palestine).
- **I — l'appello di Alessio I** raduna a **Hudavendigar** «per difendere i confini
  della cristianità» (la frontiera anatolica dopo Manzicerta), non più a Eastern
  Thrace «per la crociata».
- **III e V**: i due secondari CONDIZIONALI (`voci: ctx => [...]`) sono CADUTI —
  poggiavano sul possesso di Palestina/Sicilia, che con la storia nuova non è più
  una tappa del binario. Al III il secondario è la Popolarità, al V una Città in
  Anatolia. Nessun binario usa più la forma `voci: ctx`; la capacità resta in
  `objectives.js`.

## Califfato Abbaside — *da Baghdad alla Persia*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Sbocco sul Mediterraneo | `presidia Syria` |
| II | 1100-1199 | La Terra Santa | `conquista HOLY_LAND` *(il Secondario `ab2-2` trabocca `PERSIA_OVEST`→`PERSIA_EST`, ma non è il Primario)* |
| III | 1200-1299 | Il cuore della Mesopotamia | converti Terra Santa *(`fede` su `HOLY_LAND` — "scaccia i cristiani": non `tieni MESOPOTAMIA`, MESOPOTAMIA è definita fra i SET ma **non è mai usata**; il Secondario `ab3-2` trabocca `PERSIA_EST`→`ARABIA`, ma non è il Primario)* |
| IV | 1300-1399 | L'altopiano persiano | `conquista ARABIA` *(non `conquista PERSIA`: la Persia armata è il Secondario `ab4-2` — `regioneGuarnigioni`, non `regione`, quindi non traboccabile)* |
| V | 1400-1499 | La Persia in armi | fonda ARABIA *(`cittaRegione`, non `tieni PERSIA`)* |
| VI | 1500-1599 | I Safavidi | `converti PERSIA` + fonda N Città *(`tutti`: `fede` su PERSIA (soglia 5) col capo `cittaCount` — coerente con `converti PERSIA` ma non da solo)* |
| VII | 1600-1699 | Isfahan | espandi il regno *(`provCount`, non `fonda Isfahan`: Isfahan come provincia nominata non compare più, l'VII oggi è dominio territoriale + sbarco in Anatolia come Terziario `ab7-3`)* |
| VIII | 1700-1799 | Il declino | conquista Hudavendigar *(`provincia`, "La marcia su Costantinopoli" — non `tieni PERSIA`: la Persia non compare più nell'VIII)* |
| IX | 1800-1899 | Fra due imperi | `presidia PERSIA` |
| X | 1900-1999 | Il petrolio | `arricchisci` |

---

# Le regioni

**Riscritta il 2026-09-22 direttamente dalle costanti `const X = new Set([...])` in testa a
`objectives.js`** (righe ~46-207), non più dal vecchio foglio: quelle SONO il codice, quindi
questa tabella non può più andare fuori sincrono sulle liste di province. Gli id SVG
sostituiscono gli spazi con `_`. In **grassetto** le regioni **davvero usate** da almeno un
binario oggi; le altre sono definite in `SETS` ma **nessuna voce le referenzia** — codice
morto, non un errore, ma da sapere prima di scrivere un capitolo nuovo che le dia per buone.

| regione | province | usata da (verificato sul codice) |
|---|---|---|
| **ANDALUS** | Toledo, Badajoz, Andalusia, Granada, Valencia, Alentejo | Castiglia I |
| **IBERIA** | Galicia, Asturias, Navarra, Castile, Aragon, Catalonia, Toledo, Estremadura, Valencia, Badajoz, Alentejo, Andalusia, Granada | Castiglia II/IV, Emirato dei Mori I/II |
| **BRITISH** | Home_Counties, East_Anglia, Midlands, Wales, West_Country, Yorkshire, Lancashire, Lowlands, Highlands, Leinster, Ulster, Munster, Connaught | Inghilterra I/III |
| **IRELAND** | Leinster, Ulster, Munster, Connaught | Inghilterra V |
| **FRANCIA** | Normandy, Brittany, Picardy, Maine_Anjou, Poitou, Guyenne, Aquitaine, Burgundy *(le terre angioine, **Fiandre escluse**)* | Inghilterra III (Secondario)/VI |
| **AMERICA** | Maine, New_Hampshire, Massachusetts, Connecticut, New_York, New_Jersey, Delaware, Maryland, Virginia, North_Carolina, South_Carolina, Georgia, Florida *(Nord — condivisa)* | Inghilterra VII, Francia VII/VIII — **non più Castiglia** (spostata su AMERICA_CENTRO/SUD il 2026-09-22) |
| **AMERICA_CENTRO** | Mexico, Veracruz, Guerrero, Oaxaca, Chiapas, Jalisco, Bajio, Yucatan, Guatemala, Honduras, San_Salvador, Nicaragua, Costa_Rica, Panama, Cuba, Haiti, Santo_Domingo, West_Indies | **Castiglia VI** (agganciata il 2026-09-22: "I conquistadores") |
| **AMERICA_SUD** | Zulia, Miranda, Bolivar, Antioquia, Cundinamarca, Cauca, Guayana, Guaviare, Ecuador, Pastaza, Lima, Cajamarca, Arequipa, Ica, Acre, La_Paz, Potosi, Santa_Cruz, Para, Maranhao, Amazonas, Piaui, Ceara, Paraiba, Pernambuco, Bahia, Goias, Mato_Grosso, Minas_Gerais, Rio_De_Janeiro, Sao_Paulo, Alto_Paraguay, Bajo_Paraguay, Chaco, Corrientes, Santa_Fe, Buenos_Aires, Uruguay, Rio_Grande_Do_Sul, Parana, Santa_Catarina, Tucuman, Jujuy, Antofagasta, Tarapaca, Santiago, Araucania, Rio_Negro, La_Pampa, Patagonia | **Castiglia VII** (agganciata il 2026-09-22: "Pizarro e l'impero d'argento"); per il solo Brasile del Portogallo servirebbe ancora un sottoinsieme dedicato |
| **INDIE** | Sindh, Gujarat, Bombay, Travancore, Madras, Andhra, Orissa, Bengal, Ceylon, Senegal, Gambia, Guinea, Ivory_Coast, Ghana, Nigeria, Niger_Delta, Gabon, North_Angola, South_Angola, Namaqualand, Cape_Colony, Eastern_Cape, Zululand, Mocambique, Zanzibar, Kenya, Somaliland | Inghilterra VIII |
| **MED_FR** | Provence, Languedoc, Rhone | Francia I (base), III (meta di trabocco da NORMANDY_FR) |
| **NORMANDY_FR** | Normandy, Brittany, Picardy, Flanders, French_Low_Countries, Aquitaine, Burgundy *(7 province, non 6: French_Low_Countries mancava nella versione precedente di questo doc)* | Inghilterra II (via mare), Francia III/IV/V |
| **ADRIATIC** | Croatia, Dalmatia, Istria | Ungheria I/II (trabocca da qui verso BALCANI_OVEST), meta di trabocco di Sacro Romano Impero III, Bisanzio VII |
| **GREECE** | Thessalia, Attica, Peloponnese, Crete, Albania, Northern_Thrace *(6 province: West_Aegean_Islands nella versione precedente di questo doc non esiste in questo SET)* | Bisanzio II (trabocca verso BALCANI) |
| **EGYPT** | Matruh, Lower_Egypt, Upper_Egypt, Middle_Egypt, Egyptian_Desert | Emirato dei Mori II/IV |
| **ISLANDS** | Sicily, Sardinia | Castiglia II |
| **HOLY_LAND** | Palestine, Aleppo, Lebanon, Syria | Abbaside II — **non** l'Emirato dei Mori (la vecchia versione di questo doc lo dava per scontato, ma i Mori non la referenziano mai; il cap III dei Mori usa un elenco fisso `province: [Palestine, Lebanon]`, non questa `regione`) |
| LEVANT | Lebanon, Syria, Palestine | *nessuno — definita, mai usata* |
| **ANATOLIA** | Trabzon, Hudavendigar, Aydin, Konya, Kastamonu, Ankara, Erzurum, Diyarbakir, Adana *(9 province — la vecchia versione di questo doc la elencava DUE volte con contenuti diversi: un bug del documento, non del codice, che ha una sola costante)* | Bisanzio II/III/V, Abbaside VII (via mare) |
| TRANSGIORDANIA | Transjordan, Lebanon | *nessuno — era il condizionale bizantino III, caduto con la storia riscritta* |
| **SICILIA_CALABRIA** | Sicily, Calabria | Bisanzio IV (lo sbarco in Italia) |
| ITALIA_SUD | Abruzzo, Umbria, Campania, Apulia, Calabria | *nessuno — era il condizionale bizantino V, caduto con la storia riscritta* |
| ISLAM_ORIGINE | Sicily, Diyarbakir, Mosul, Deir_Ez_Zor, Aleppo, Syria, Palestine, Lebanon, Transjordan, Sinai | *nessuno — la vecchia versione di questo doc diceva "Bisanzio capitolo VIII", ma quel capitolo oggi è `fortezza`+`capitale`+`turniTassaDura`: non la referenzia più* |
| **MAGHREB** | Inner_Morocco, Oran, Constantine, Tunisia, Tripoli | Castiglia IV (via mare), Emirato dei Mori VII |
| **ITALIA_NORD** | Piedmont, Lombardy, Venetia, Tuscany, Romagna | Sacro Romano Impero III (meta di trabocco da qui), Francia VI, Castiglia VIII (via mare), meta di trabocco di Francia V e Ungheria V |
| **GERMANIA** | Anhalt, Saxony, Franconia, Bavaria, Rhineland, Hesse, Brandenburg | **solo** Sacro Romano Impero VII (**non** III/IV/VI come diceva la versione precedente: III è ITALIA_NORD, IV è BALTICO_EST, VI è IMPERO_CENTRO) |
| **AUSTRIA_EST** | Austria, Bohemia, Moravia, Silesia, Styria, Tyrol | Sacro Romano Impero V (trabocca verso PANNONIA), Ungheria V (trabocca verso ITALIA_NORD) |
| RENO | Rhineland, Flanders, Picardy | *nessuno — la vecchia versione di questo doc la dava per il cap VII di Impero e Francia, ma nessuno dei due la usa più (entrambi riscritti su altro: l'Impero su GERMANIA, la Francia sulla Nuova Francia in AMERICA)* |
| **BALTICO** | East_Prussia, West_Prussia, Pomerania, Courland | **solo** meta di trabocco di Kievan Rus' VIII (**non** Polonia V, che oggi usa `provCount`, non questa regione) |
| **POLONIA** | Mazovia, Posen, Silesia, West_Galicia, East_Galicia, Volhynia | Polonia IV (una Città qui), meta di trabocco di Kievan Rus' VI |
| **POLONIA_EST** *(non nella versione precedente di questo doc)* | Vilnius, Brest, Minsk, Volhynia, Mogilev | Polonia II (trabocca verso RUS_NORD) |
| **PANNONIA** | Central_Hungary, Transdanubia, West_Slovakia, East_Slovakia, Slavonia | Ungheria VII (base), meta di trabocco di Ungheria III, Sacro Romano Impero V, Bisanzio VI |
| **BALCANI** | Northern_Serbia, Bosnia, Bulgaria, Macedonia, Albania, Wallachia, Moldavia | Ungheria VIII (base), meta di trabocco di Ungheria III e Bisanzio II |
| **BALCANI_OVEST** *(non nella versione precedente di questo doc)* | Albania, Northern_Serbia, Montenegro, Bosnia, Macedonia | meta di trabocco di Ungheria II, base di Bisanzio VI (trabocca verso PANNONIA) |
| **RUS_NORD** | Novgorod, Moscow, Tver, Pskov, Smolensk, Ryazan | Kievan Rus' IV (trabocca verso EST_RUSSO), meta di trabocco di Polonia II e VII |
| **RUTENIA** *(non nella versione precedente di questo doc)* | Kiev, Chernihiv, Mogilev, Minsk, Brest, Volhynia | Polonia VII "Verso la Russia" (trabocca verso RUS_NORD), Kievan Rus' VI "L'invasione d'Europa" (trabocca verso POLONIA) |
| **BALTICO_NORD** *(non nella versione precedente di questo doc)* | Ingria, East_Karelia, Talinn, Tartu, Riga | Kievan Rus' VIII (trabocca verso BALTICO) |
| **EST_RUSSO** | Kazan, Astrakhan, Ural, Uralsk, Perm, Tartaria | Kievan Rus' V (base), meta di trabocco di Kievan Rus' IV |
| **CAUCASO** | Stavropol, Dagestan, Kuban, Georgia, Azerbaijan, Armenia | Kievan Rus' V, Secondario (trabocca verso PERSIA) — **non** "riservata al ciclo IX, non ancora scritto": è già attiva |
| MESOPOTAMIA | Baghdad, Basra, Mosul | *nessuno — la vecchia versione di questo doc diceva "Abbaside III", ma quel capitolo usa `fede` su HOLY_LAND, mai questa regione* |
| **PERSIA** | Isfahan, Fars, Khorasan, Persian_Kurdistan, Irakajemi, Tabriz, Urmia | Abbaside IV (Secondario, guarnigioni)/VI (dentro `fede`, combinato), meta di trabocco di Kievan Rus' V |
| **PERSIA_OVEST** *(non nella versione precedente di questo doc)* | Isfahan, Irakajemi, Persian_Kurdistan, Tabriz, Urmia | Abbaside II, Secondario (trabocca verso PERSIA_EST) |
| **PERSIA_EST** *(non nella versione precedente di questo doc)* | Semnan, Khorasan, Kerman, Mazandaran, Fars | Abbaside III, Secondario (trabocca verso ARABIA), meta di trabocco di Abbaside II |
| **ARABIA** | Nejd, Yemen, Oman *(3 province: Nejd mancava nella versione precedente di questo doc)* | Abbaside IV (base)/V (una Città qui), meta di trabocco di Abbaside III — **non** usata dall'Emirato dei Mori |
| **BALTICO_EST** *(non nella versione precedente di questo doc)* | Talinn, Tartu, Riga, Courland | Sacro Romano Impero IV |
| **IMPERO_CENTRO** *(non nella versione precedente di questo doc)* | Austria, Bohemia, Franconia | Sacro Romano Impero VI (Città qui) |
| **SICILIA_CRETA** *(non nella versione precedente di questo doc)* | Sicily, Crete | Emirato dei Mori III |
| **AFRICA_CE** *(non nella versione precedente di questo doc)* | Eritrea, Somaliland, Kenya, Zanzibar, Tanganyika, Mocambique, Uganda | Abbaside V (via mare, dentro un `tutti`) |
| **AFRICA** *(non nella versione precedente di questo doc)* | Senegal, Gambia, Guinea, Ivory_Coast, Ghana, Nigeria, Niger_Delta, Gabon, North_Angola, South_Angola, Namaqualand, Cape_Colony, Eastern_Cape, Zululand, Mocambique, Zanzibar, Kenya, Somaliland, Eritrea, Tanganyika, Uganda | Francia VIII (via mare, dentro un `tutti`; Maghreb escluso) |
| SIBERIA | Krasnoyarsk, Buryatia, Irkutsk, Tomsk, Trans_Baikal, Sakhalin, Chukotka, Kamchatka, Amur *(non è nel foglio delle regioni originali)* | Kievan Rus' VII, Secondario (la marcia di Yermak) |
| SCANDINAVIA | Jutland, Scania, Gotaland, Western_Norway, Eastern_Norway | dottrina di Norvegia/Svezia, `js/doctrines.js` — non fa parte di `SETS` in `objectives.js`, non un binario |

---

# Tre nodi sciolti

Erano tre questioni aperte quando solo Inghilterra e Bisanzio avevano un binario completo.
Sono risolte tutte e tre, e i dieci binari coprono ora i capitoli I-VIII in `objectives.js`:

**1. Le fedi corrono sull'anno vero.** Il Grande Scisma resta anticipato al turno 5
(scelta dell'utente, per essere incontrato presto in partita); la Riforma è invece al
turno 52 = 1510-1519, il decennio delle 95 Tesi di Lutero (`Religions.SCHISMS`),
corretto un errore rimasto a lungo dove scattava al turno 12 = 1110, quattro secoli
prima di Lutero. Il turno 52 cade dentro il ciclo VI (1500-1599): il capitolo VI del
Sacro Romano Impero («La fede spezzata») e
il VI degli Abbasidi («I Safavidi») raccontano entrambi un fatto avvenuto proprio in
quel giro di secolo, ma **solo gli Abbasidi lo vivono davvero col template `fede`**
(`ab6-1`, dentro un `tutti` con `cittaCount`): misura la confessione di OGGI, non
quella di partenza, quindi se lo scisma non è ancora scattato nei primi turni del
ciclo l'obiettivo misura semplicemente 0 finché non arriva, senza bisogno di saperlo
in anticipo. **Il Sacro Romano Impero VI, verificato il 2026-09-22, NON usa `fede`**:
le sue tre voci sono `cittaRegioneCount(IMPERO_CENTRO)`, scorte di pietra e
`tipiCollegati` — il titolo «La fede spezzata» resta, la CONSEGUENZA meccanica no. Se
si vuole che anche l'Impero viva davvero lo scisma nei numeri, il capitolo va
riscritto per usare `fede` su GERMANIA o su IMPERO_CENTRO, non solo rititolato.

**2. I capitoli VI-VIII sono ora binari veri, non tracce.** Restava vero che una partita
tipica finisce fra il terzo e il quinto ciclo, ma l'utente ha chiesto la copertura completa
fino all'ottavo per tutti e dieci i regni — non solo Inghilterra e Bisanzio — per due
ragioni: un binario storico coerente resta leggibile anche a chi gioca oltre il quinto
ciclo, e ogni capitolo lungo è stato scritto seguendo la stessa regola dei primi tre —
Secondario e Terziario non ripetono il Primario a numeri più alti, PREPARANO quello del
capitolo dopo (scorte di legno prima di un Veliero, pietra prima di una Fortezza o di una
Città, oro prima di una spedizione, Popolarità/Sicurezza/Benessere a intervalli regolari
perché sono le uniche voci che un regno perde davvero mentre fa la guerra). I capitoli IX-X
restano non scritti: il generatore ricade sull'VIII quando un capitolo li supera
(`chapter()`, `objectives.js`), quindi un regno che arriva fin là non resta senza obiettivi.

**3. Il template `converti` è scritto** (`fede` in `objectives.js`): conta le province di una
regione che sono ADESSO della tua famiglia di fede di stato, per conquista o per scisma —
non guarda la fede di partenza (quella la misurano `ANDALUS`/`ISLAM_ORIGINE`). Con
l'occasione sono stati scritti altri due template che il vocabolario non prevedeva ma che i
capitoli tardi degli otto binari nuovi chiedevano: `capitale` (presidia la Capitale ovunque
sia ADESSO — **Ungheria VI** (Primario) e **Bisanzio VIII** (Secondario), più **Francia IV**
(Secondario `fr4-2`, dentro un `tutti` con una Città) — non Polonia VIII come diceva la
versione precedente di questo doc: verificato il 2026-09-22 con un giro completo su
`Objectives.BINARI`, `po8` non usa mai `capitale`, le sue tre voci sono
`provCount`/`guarnigioniConfine`/`popolarita` — perché la Capitale si costruisce,
si sposta e si conquista e un capitolo non può nominare una provincia fissa) e `fortezza`
(possiedi una Fortezza, booleano come `mercato` — l'ultima difesa di un binario che finisce
sotto assedio, spesso combinato con `capitale` via `tutti`, come in Ungheria VI e Bisanzio
VIII). La `spedizione` restava data per mancante ma non lo era: un capitolo non chiede di
salpare, chiede di ARRIVARE, e per quello bastano `regione` + `viaSea` sulla meta
d'oltremare (Inghilterra II/VII/VIII, Castiglia VI/VIII, Francia VII/VIII — **non** Francia
VI, che è la sola conquista di ITALIA_NORD via terra, senza mare).

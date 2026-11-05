# Ciclo III (1200-1299) — ricerca storica e base per gli obiettivi

Documento di lavoro per riscrivere i capitoli III dei dieci binari (`js/objectives.js`).
Parte da `docs/BINARI_STORICI.md` e vi aggiunge la **ricerca degli eventi del XIII secolo**
regno per regno. Per ciascuno: *cosa è successo davvero*, *cosa chiede oggi il binario*,
*com'è messo il regno sulla mappa a fine ciclo II*, *proposta*.

Le soglie sono indicate all'ancora `avanzare` (ratchet e intensità le adattano a fine ciclo).

---

## Il filo del secolo: i Mongoli

Il XIII secolo è, per metà del tabellone, **il secolo dei Mongoli**, e il gioco lo
ricalca: l'**invasione mongola** (`js/events.js`, `invasione-mongola`) scatta al **turno 21**,
cioè all'inizio esatto del ciclo III, e cala da **oriente** — il corridoio Uralsk → Volga →
Rus' → Polonia/Ungheria, più l'ala di Persia verso Baghdad. Nella storia vera è tutto
addensato sul 1237-1258:

- **1237-1240** — invasione della Rus', sacco di **Kiev** (dic. 1240): fine della Rus' unita.
- **9 aprile 1241** — **Legnica**: l'orda travolge i duchi polacchi, muore Enrico II il Pio.
- **11 aprile 1241** — **Mohi**: distruzione dell'esercito ungherese, Béla IV in fuga.
- **1258** — **sacco di Baghdad** di Hülegü: fine politica del Califfato abbaside.

**Regola d'oro (già nel design doc):** *un capitolo non può poggiare su un evento.* L'Orda
potrebbe non arrivare in tempo o fermarsi nel corridoio di neutrali. Quindi per i regni
d'oriente (Rus', Polonia, Ungheria, Abbasidi) il ciclo III **non** chiede «resisti all'Orda»,
ma quel che il giocatore controlla e che paga comunque: **presidiare i confini orientali,
incastellare, tenere unito il regno**. È esattamente ciò che fecero Béla IV (gli ~100
castelli, 66 di pietra) e i duchi Piast. L'Orda, se arriva, troverà un regno in stato di
difesa; se non arriva, il regno ne esce comunque più solido.

I regni d'occidente e del Mediterraneo hanno ciascuno il proprio arco:
Castiglia la grande Reconquista, Francia Bouvines e il Midi albigese, Bisanzio il fronte
anatolico, il Sacro Impero l'Italia di Federico II, i Mori il **crollo** dopo Las Navas.

---

## Esito del ciclo II (base di partenza, turno 20)

Dai dati live + le tue previsioni sull'ultimo turno:

| Regno | C2 | note |
|---|---|---|
| Abbaside | 10/10 | chiuso |
| Inghilterra | 10/10 | sbarco fatto |
| Kievan Rus' | 10/10 | dilaga (26 province) |
| Bizantino | 10/10 | a "eccedere" |
| Francia | → **10/10** | riprende Aleppo (tua previsione: riesce) |
| Castiglia | 7/10 | Pop 3/4 persa |
| Sacro Impero | 7/10 | muster Italia 9/10 per 1 uomo |
| Polonia | 7/10 (forse 10) | benessere 2→3 incerto |
| Mori | **5/10** | sbarco in Iberia non riesce |
| Ungheria | ~3-5/10 | Secondario sì, Primario incerto |

Il ciclo III eredita quindi: tre regni fortissimi (Rus', Inghilterra, Bisanzio), un blocco
mediano, e **due regni in affanno** (Mori, Ungheria) a cui servono capitoli raggiungibili.

---

## I dieci binari — ciclo III

### Regno di Castiglia — *Las Navas de Tolosa*

**Eventi XIII sec.** — **1212** Las Navas de Tolosa (al-ʿUqab): Alfonso VIII spezza gli
Almohadi, svolta della Reconquista. Poi la grande avanzata di **Ferdinando III**:
**Córdoba 1236**, **Jaén 1246**, **Siviglia 1248**. Al 1248 ai musulmani resta solo
**Granada** (vassalla). Unione definitiva di Castiglia e León (1230).

**Oggi nel binario (ca3):** `provCount 12` · `guarnigioniConfine 6` · `popolarità 4`.

**Stato live:** 12 province, IBERIA 11/13 (già tutta cattolica), oro 850, pop 3.

**Proposta** — il secolo di Castiglia è **la conquista del sud**, non un generico conteggio:
- **P** — *La valle del Guadalquivir*: conquista **ANDALUS** (Toledo, Badajoz, Andalusia,
  Granada, Valencia, Alentejo) → `regione ANDALUS`, avz ~4/6. Córdoba e Siviglia.
- **S** — *La frontiera di Granada*: `guarnigioniConfine` ≥6 (il fronte con l'ultimo islam).
- **T** — *Il regno che si governa*: `popolarità 4` **oppure** `benessere 3` (meglio
  benessere — Castiglia ha già mancato la Pop nel C2, varia il contrappeso).

### Regno di Francia — *Bouvines e il Midi*

**Eventi XIII sec.** — **27 lug. 1214 Bouvines**: Filippo II annienta la coalizione
anglo-imperiale, nasce l'egemonia capetingia nel nord. **Crociata albigese 1209-1229**:
Luigi VIII e la corona assorbono il **Midi** (Linguadoca), sancito dal Trattato di Parigi
(1229). **Luigi IX** (San Luigi, regno 1226-1270): buon governo, due crociate (Egitto
1248-50, Tunisi 1270).

**Oggi nel binario (fr3):** `NORMANDY_FR 4 (trabocca MED_FR)` · `guarnigioni 5×≥5` · `oro 1200`.

**Stato live:** NORMANDY_FR 4/7, MED_FR 3/3 piena, oro basso, pop 3.

**Proposta** — tenere Bouvines + rendere il **Midi albigese** una meta vera, non solo trabocco:
- **P** — *Bouvines*: consolida il dominio reale, `regione NORMANDY_FR` avz 5 (trabocca
  MED_FR se già intera — resta com'è, va bene).
- **S** — *La crociata albigese*: `regione MED_FR` (Provenza, Linguadoca, Rodano) ≥2/3 —
  esplicito, non più nascosto nel trabocco del Primario.
- **T** — *Il regno di San Luigi*: `benessere 3` o `popolarità 4` (il re giusto e il buon
  governo) al posto dell'`oro 1200`, che su un regno povero è il solito muro.

### Emirato dei Mori — *il crollo almohade* ⚠ IL NODO DA RISCRIVERE

**Eventi XIII sec.** — **1212** Las Navas: disfatta almohade, inizio del **tracollo**.
Revolte tribali nel Maghreb, ascesa dei **Merinidi** (dal ~1215; Marrakech 1269) e degli
Abd al-Wadid (Tlemcen). In al-Andalus i cristiani travolgono tutto: **Córdoba 1236,
Siviglia 1248**. È un secolo di **sconfitta e ritirata**, non di conquista.

**Oggi nel binario (fa3):** `province [Palestine, Lebanon]` — *"Saladino riprende
Gerusalemme"*. **Incoerente**: i Mori (Almoravidi/Almohadi) stanno in Iberia+Maghreb;
Saladino è l'Ayyubide d'Egitto-Siria. E la Terra Santa è dall'altra parte del mondo —
Palestina è abbaside, Libano francese, i Mori ne possiedono 0/4 ed è irraggiungibile.

**Stato live:** Iberia 0/2 (sbarco fallito), **MAGHREB 5/5 già intero**, Egitto 1/5 (Matruh),
benessere ok, oro 650.

**Proposta** — riscrivere il capitolo sulla **storia vera**: resistere in al-Andalus e
reggere il Maghreb contro i Merinidi, poi affacciarsi all'Egitto (che è già la mira del
cap IV):
- **P** — *La disfatta di al-Andalus*: tieni il piede in Iberia / difendi lo Stretto —
  `regioneGuarnigioni` su **IBERIA** (le province iberiche ancora tue, presidiate) con
  soglia bassa (resistere: 1-2), perché stanno **perdendo**. In alternativa storica più
  pulita, `regione MAGHREB` (tieni unito il Nordafrica merinide) già a portata.
- **S** — *Verso l'Egitto*: `regione EGYPT` ≥2 (Matruh c'è, spingere su Basso/Alto Egitto) —
  anticipa il cap IV mamelucco.
- **T** — nave / benessere dell'emirato (resta `navi` o `benessere`).

*Da decidere con te:* il cap III dei Mori diventa **difensivo-iberico** o **espansivo-egiziano**?
E va rinominato (via "Saladino"): *"La disfatta di al-Andalus"* o *"Gli Almohadi e i Merinidi"*.

### Regno di Inghilterra — *Magna Carta e il Galles*

**Eventi XIII sec.** — **1215 Magna Carta** (Giovanni Senzaterra a Runnymede). Minorità e
lungo regno di **Enrico III**; guerra dei baroni di **Simon de Montfort**, sconfitto a
**Evesham 1265**. **Edoardo I** (1272-1307): **conquista del Galles 1277-1283** (Statuto di
Rhuddlan 1284). Sul continente resta solo la Guascogna.

**Oggi nel binario (in3):** *"teste di ponte"* — `Flanders + una di FRANCIA` · `BRITISH 9` ·
`pop 4`.

**Stato live:** BRITISH 9/13, FRANCIA 0/8, Flanders neutrale, oro 1350 (il più ricco).

**Nota di coerenza:** la "testa di ponte in Fiandra" è un po' anacronistica — nel Duecento
l'Inghilterra ha **perso** il continente (Normandia 1204) e guarda **dentro l'isola** (Galles).
Il modello inglese tiene però di proposito un piede sul continente leggero fino ai Cent'Anni
(cap IV). Due strade:
- **(a) fedele alla storia:** P = unisci l'isola / il **Galles** (`regione BRITISH`, le
  province gallesi/scozzesi sono già dentro il set) · S = *Magna Carta* governo
  (`popolarità`/`benessere`) · T = un piede in Guascogna (`provincia Aquitaine` leggera).
- **(b) com'è:** tieni la testa di ponte continentale. Più debole storicamente.

Propendo per **(a)**: l'isola e il Galles sono la vera storia del Duecento inglese.

### Sacro Romano Impero — *l'Italia di Federico II*

**Eventi XIII sec.** — **Federico II** (imperatore 1220-1250): scontro con la **Lega
Lombarda**, vittoria a **Cortenuova 1237**, scomunica 1239. Alla sua **morte (1250)** il
**Grande Interregno** (1250-1273), frammentazione, fine dell'influenza imperiale in Italia,
poi gli **Asburgo** (Rodolfo, 1273).

**Oggi nel binario (sr3):** `ITALIA_NORD 3 (trabocca ADRIATIC)` · `collegate 8` · `navi 1 (Baltico)`.

**Stato live:** ITALIA_NORD **0/5** (deve ancora scendere), benessere 1, 0 navi, oro 600.

**Proposta** — l'Italia di Federico resta il cuore; via la nave baltica (l'Impero non è
navale):
- **P** — *Federico scende in Italia*: `regione ITALIA_NORD` avz 3 (trabocca ADRIATIC). ✔ ok.
- **S** — *Le vie dell'Impero*: `collegate` — abbassare a **6** (benessere 1, 8 è troppo).
- **T** — *Tenere l'Impero* (l'Interregno): `guarnigioniConfine` o `benessere 3`, al posto
  della nave sul Baltico.

### Ducato di Polonia — *la frammentazione e Legnica*

**Eventi XIII sec.** — **frammentazione feudale** (ducati divisi dei Piast). **Legnica
9 apr. 1241**: i Mongoli travolgono i polacchi, muore **Enrico II il Pio**, la riunificazione
si blocca. Nel tardo secolo si prepara la ripresa (poi Casimiro il Grande, 1333).

**Oggi nel binario (po3):** `guarnigioniConfine 5` · `conquisteNavali 2` · `scorte pietra 5`.

**Stato live:** POLONIA 2/6, BALTICO 4/4, pietra **0** (ha legno 7), 1 barca, 0 conquiste navali.

**Proposta** — ⚠ `conquisteNavali 2` è sbagliato: la Polonia del Duecento è una potenza di
terra **schiacciata** dai Mongoli, non una marina. Tema giusto ("La frammentazione"):
- **P** — *Ogni confine armato*: `guarnigioniConfine 5` (reggere l'urto da oriente). ✔ ok.
- **S** — *Tenere unito il ducato*: `provCount` o `regione POLONIA` ≥3 (contro la
  frammentazione), **al posto delle conquiste navali**.
- **T** — *Le pietre per i castelli*: `scorte pietra 5` (l'incastellamento che verrà). ✔ ok.

### Kievan Rus' — *il giogo e l'ascesa di Mosca*

**Eventi XIII sec.** — **1237-1240** invasione di Batu: **sacco di Kiev** (dic. 1240), fine
della Rus' unita. **Giogo tataro**: il potere scivola a nord-est, da Kiev a **Vladimir** e poi
**Mosca**. **Alexander Nevskij** (principe di Novgorod) regge il nord.

**Oggi nel binario (ru3):** `provincia Uralsk ≥5` · `tipiCollegati 4` · `guarnigioni 5×≥5`.

**Stato live:** **26 province** (il regno più grande), RUS_NORD 5/6, Uralsk neutrale a est,
già 5 tipi collegati, pop 4. È il **leader incontrastato**.

**Nota:** Uralsk è proprio la **porta da cui entra l'Orda** (il corridoio dell'evento). Il
capitolo "ascesa di Mosca / frontiera di Uralsk" è già allineato al secolo e alla regola
anti-evento (chiede di presidiare il confine, non di sconfiggere l'Orda). Buono così, ma il
leader va spinto:
- **P** — *La frontiera orientale*: `provincia Uralsk ≥5` → ratchet naturale; per un 26-province
  l'intensità sale a `eccedere`. ✔
- **S** — *Le vie di Mosca*: `tipiCollegati 4` (già fatto) → alzare a 5, o `benessere 3`.
- **T** — *Le terre difese*: `guarnigioni 5×≥5` → alzare (7×≥5) data la taglia.

### Ducato di Ungheria — *Mohi e le fortezze di pietra*

**Eventi XIII sec.** — **Bolla d'Oro 1222** (libertà nobiliari). **Mohi 11 apr. 1241**:
catastrofe, Béla IV fugge in Dalmazia. Dopo il 1242 la **ricostruzione**: Béla IV erige
**~100 castelli (66 di pietra)**, l'**incastellamento**, e richiama coloni. È il regno che
**risorge dalla rovina costruendo**.

**Oggi nel binario (un3):** *"Le fortezze di pietra"* — `PANNONIA 4 (trabocca BALCANI)` ·
`guarnigioniConfine 4` · `oro 1200`.

**Stato live:** PANNONIA **5/5 già piena** (→ trabocca su BALCANI 1/7), 32 soldati, benessere 0,
oro ~150, 0 scorte. **È il regno più in crisi.**

**Proposta** — il tema è già perfetto (Mohi → incastellamento), ma va tradotto in obiettivi
**raggiungibili e costruttivi**, togliendo l'oro che l'ha già bloccato:
- **P** — *Tenere il regno*: `PANNONIA` (già piena → trabocca BALCANI, chiede ~4 balcaniche).
  ✔ ok, è un Primario onesto per chi sta risorgendo.
- **S** — *Le fortezze di pietra*: **erigi una Fortezza** (`fortezza`) **o** `scorte pietra 5`
  — l'incastellamento di Béla IV, storicamente esatto e concreto. Dà all'Ungheria povera
  una meta di costruzione invece di un muro di monete.
- **T** — *I coloni*: `benessere 3` (il ripopolamento post-Mohi), al posto dell'`oro 1200`.

### Impero Bizantino — *la riscossa d'Anatolia*

**Eventi XIII sec.** — (contesto: **1204** IV Crociata saccheggia Costantinopoli → Impero in
esilio a **Nicea**.) **25 lug. 1261**: **Michele VIII Paleologo** riprende Costantinopoli dai
Latini, restaura l'impero, fonda la dinastia paleologa. Fronte perenne in **Anatolia** contro
i Turchi/Selgiuchidi.

**Oggi nel binario (bi3):** `ANATOLIA 3×≥6` · `popolarità 4` · `scorte legno 5`.

**Stato live:** ANATOLIA 3/9, intensità **eccedere** (→ 5×≥6), GREECE 5/6, pop 3.

**Nota:** in gioco Costantinopoli non è mai caduta (niente IV Crociata), quindi la
"riconquista del 1261" non si applica — ma il **fronte anatolico** è vivo e reale: i
**Selgiuchidi** sono sulla mappa (14 province, evento del t9) e tengono l'Anatolia. Il
capitolo "riscossa d'Anatolia" mappa **direttamente** sulla guerra col vicino selgiuchide.
Buono così; per il primo della classe a `eccedere` è giusto che chieda 5 province anatoliche.
- **P** — `regioneGuarnigioni ANATOLIA` ≥3 (ecc 5). ✔
- **S** — `popolarità 4`. ✔ (o benessere, per varietà)
- **T** — `scorte legno 5` (prepara la flotta del cap successivo). ✔

### Califfato Abbaside — *il cuore della Mesopotamia*

**Eventi XIII sec.** — **1258 sacco di Baghdad**: Hülegü distrugge la città, giustizia
al-Mustaʿsim, **fine politica del Califfato**. È l'apocalisse da oriente, come per la Rus'.
(La linea abbaside sopravvive solo come fantoccio al Cairo sotto i Mamelucchi.)

**Oggi nel binario (ab3):** `fede HOLY_LAND 4` · `PERSIA_EST 2 (trabocca ARABIA)` · `oro 1300`.

**Stato live:** HOLY_LAND 2/4 (Palestina+Siria), MESOPOTAMIA 2/3, PERSIA_EST 3/5, oro 1000.

**Nota:** come per i regni d'oriente, il Duecento abbaside è **difensivo** — l'Orda arriva
anche qui (l'ala di Persia dell'evento: Khiva → Khorasan → Baghdad). Per la regola
anti-evento, il capitolo chiede di **tenere la Mesopotamia e l'altopiano orientale** (dove
cala l'Orda), non di "resistere ai Mongoli". PERSIA_EST è proprio quel fronte.
- **P** — *Il cuore della Mesopotamia*: `regione MESOPOTAMIA` (Baghdad, Basra, Mosul) —
  **tenere Baghdad**, il sacco del 1258 ribaltato in "difendi la capitale del Califfato".
  Più pungente del `fede HOLY_LAND`.
- **S** — *L'altopiano orientale*: `regione PERSIA_EST` ≥2 (il fronte da cui scende l'Orda). ✔
- **T** — `oro` abbassato (1000, non 1300) **o** `benessere`/`scorte` per prepararsi.

---

## Riepilogo delle modifiche proposte

| Regno | tenere | ritoccare | riscrivere |
|---|---|---|---|
| Castiglia | — | P → `regione ANDALUS`; T → benessere | — |
| Francia | P (Bouvines) | S → `MED_FR` esplicito; T → governo | — |
| **Mori** | — | — | **cap III intero (via "Saladino")** |
| Inghilterra | — | verso l'isola+Galles / Magna Carta | opz. (a) |
| Sacro Impero | P (Italia) | S collegate 8→6; T → via nave baltica | — |
| Polonia | P, T (pietra) | — | S → terra, **via conquiste navali** |
| Kievan Rus' | P (Uralsk) | S/T alzati (è il leader) | — |
| **Ungheria** | P (Pannonia) | — | **S → Fortezza; T → benessere (via oro)** |
| Bizantino | P, S, T | — | — |
| Abbaside | S (Persia Est) | T oro 1300→1000 | P → `MESOPOTAMIA` |

**Priorità:** (1) **Mori** — il capitolo è storicamente e geograficamente rotto; (2) **Ungheria**
— regno in crisi con un muro d'oro frustrante, la Fortezza è il fix storico; (3) i ritocchi
minori (Polonia navale, Sacro nave baltica/collegate, oro di Francia/Abbasidi).

---

## Obiettivi ADOTTATI (scritti dall'utente, 2026-11-05)

I capitoli III sono stati riscritti in `js/objectives.js` con gli obiettivi decisi dall'utente
(numeri **FISSI**, `fisso: true`, a ogni intensità). Titoli aggiunti per coerenza storica.

| Regno | tema | P (5) | S (3) | T (2) |
|---|---|---|---|---|
| Castiglia | Las Navas de Tolosa | Le città della Reconquista — **2 città** | La frontiera della cristianità — **Granada+Andalusia ≥10** | Verso l'Atlantico — **1 conquista navale** |
| Francia | Bouvines e il Midi | Le marche del regno — **Aquitaine+Piedmont+Savoy+West_Switzerland** | Il regno di San Luigi — **Pop 4** | La crociata di San Luigi — **≥1 provincia in Terra Santa** |
| Mori | L'emirato d'Egitto | L'emirato d'Egitto — **tutto l'Egitto + Sinai (6)** | La cittadella del Cairo — **città in Middle_Egypt ≥8** | La prosperità del Nilo — **Pop 4** |
| Inghilterra | Magna Carta | Le terre del continente — **3 province fuori dall'isola + 1 città ≥6** | La Magna Carta — **politica Nobiltà forte** | La signoria d'Irlanda — **2 province d'Irlanda** |
| Sacro Impero | L'Italia di Federico II | Federico scende in Italia — **3 di {Lombardy,Venetia,Romagna,Emilia} ≥3** | Le mura degli Asburgo — **1 città** | La Lega Anseatica — **rotta commerciale** |
| Polonia | La frammentazione | Il rafforzamento interno — **Posen+Silesia+W/E Galicia + 1 città** | L'affrancamento dei villaggi — **politica Popolo forte** | L'ambra del Baltico — **rotta commerciale** |
| Kievan Rus' | Le invasioni mongole | Le invasioni mongole — **Tartaria+Kazan+Kursk+Chernihiv+Kiev** | Il consenso del popolo — **Pop 5** | La via del Baltico — **provincia del Baltico + nave** |
| Ungheria | Le fortezze di pietra | Il dominio dei Balcani — **Bosnia+Serbia+Albania+Montenegro ≥3** | La Bolla d'Oro — **politica Nobiltà forte** | I coloni di Béla — **Benessere 3** |
| Bizantino | Le porte della Grecia | Le porte della Grecia — **Northern_Thrace+Skopia+Albania ≥8** | Le vele verso l'Italia — **2 province Sud Italia + 1 città** | I cavalieri dell'impero — **10 cavalieri** |
| Abbaside | Il cuore della Mesopotamia | Nessun crociato in Terra Santa — **HOLY_LAND senza cristiani** | L'estensione del Califfato — **16 province** | Le carovane di Baghdad — **rotta commerciale** |

### Meccaniche nuove aggiunte per realizzarli

Gli obiettivi dell'utente richiedevano tre cose che il motore non misurava; sono state
aggiunte come template puri + letture di contesto (nessuna UI nuova):

- **`politica`** (template) + **`ctx.politicaGrade`** (app.js): legge `player.politica`
  (−2 Nobiltà forte … +2 Popolo forte). «Fortemente ai nobili/al popolo» = soglia 2.
  Usato da Inghilterra S, Polonia S, Ungheria S.
- **`cavalieri`** (template) + **`ctx.knightCount`** (app.js): somma `data-cav` su tutte
  le province del regno. Usato da Bizantino T (10 cavalieri).
- **`rottaCommerciale`** (template) + **`ctx.tradesThisCycle`** (app.js) + contatore
  **`player.commerciCiclo`** (game-actions `recordTrade` lo incrementa su entrambi i regni,
  `closeCycle`/`prepareGame` lo azzerano, `normalizePlayer` lo inizializza). Interpreta
  «apri una rotta e mantienila fino a fine ciclo» come **concludi almeno uno scambio nel
  ciclo** — tenere viva la rotta = continuare a commerciare. Usato da Sacro T, Polonia T,
  Abbaside T. *(Se vuoi una soglia più alta — es. 2 scambi per dire «mantenuta» — è un
  solo numero da cambiare.)*

Due SET nuovi: **ITALIA_FED** (Lombardy, Venetia, Romagna, Emilia) e **EGYPT_SINAI**
(i 5 egiziani + Sinai). IRELAND e ITALIA_SUD esistevano già e sono riusati.

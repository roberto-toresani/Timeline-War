# Ciclo IV (1300-1399, turni 31-40) — analisi, stime e proposta di obiettivi

Documento di lavoro, stessa forma di `docs/archive/CICLO3_RICERCA.md`. Letto dal vivo
(`games/main`) al **turno 28**, con Ungheria di turno (Abbasidi, Sacro Impero, Castiglia,
Polonia, Bisanzio e Rus' hanno già giocato il 28; restano Ungheria, Inghilterra, Francia).
Procedura generale: `.claude/skills/obiettivi-ciclo/SKILL.md`.

**Intensità** — nel codice sono `eccedere` / `avanzare` / `resistere`; qui le chiamo
**AVANZARE / EQUILIBRATO / DIFENDERE**. Le decide `Objectives.passo()` a `closeCycle`:
Primario + tutti e 3 → AVANZARE · Primario fatto → EQUILIBRATO · 2 su 3 senza perdere
province (rispetto a fine ciclo II) → resta dov'è (da DIFENDERE sale a EQUILIBRATO) ·
1 su 3 senza perdite → resta · altrimenti → scende di un gradino.

---

## 1. Esito del ciclo III — dove sono e cosa manca

| Regno | ora | cosa manca | probabilità | stima finale | intensità C4 |
|---|---|---|---|---|---|
| Inghilterra | 5/10 (S, T ✔) | **P**: una Città sul continente con 6 uomini. Ha 4 province continentali (Gelre 8, Fiandre francesi 7). Servono 800 oro (ne ha 750, +100/turno), 2 argilla e 2 bestiame (ne ha 0: le deve comprare al Mercato col grano e la pietra in più). 3 turni pieni | 55% | 10 o 5 | **AVANZARE** in entrambi i casi |
| Abbasidi | 7/10 (P, T ✔) | **S**: la 16ª provincia (ne ha 15). Neutrali accanto: Sistan 4, Baluchistan 2, Nejd 4, Transgiordania 4. Khorasan ha 8 uomini. Oro 50 | 70% | 10 | **AVANZARE** (EQUILIBRATO se manca S) |
| Sacro Impero | 5/10 (S, T ✔) | **P**: Venezia 2→3 e Lombardia 1→3 uomini (Romagna ha già 3). Due turni di reclute | 85% | 10 | **AVANZARE** (da EQUILIBRATO) |
| Francia | 0/10 | **P**: manca solo l'Aquitania, tenuta dalla Castiglia con **1 uomo**; la Francia confina con Poitou 8 e Guyenne 5 e con la Castiglia non ha nessun patto. **S**: Popolarità 4. Oggi è (5+2+3)/3 = 3; con la **tassa leggera** diventa (5+2+5)/3 = 4. **T**: Terra Santa, irraggiungibile (tutta abbaside) | P 75% · S 75% · T 5% | 8 | **EQUILIBRATO** |
| Castiglia | 5/10 (S, T ✔) | **P**: la seconda Città. Risorse già in magazzino (pietra 3, argilla 2, bestiame 6); l'oro arriva a 850 al turno 30 se non spende (450 + 200/turno). Perderà l'Aquitania, ma resta sopra le 12 province di fine ciclo II | 60% | 10 o 5 | **AVANZARE** (EQUILIBRATO se manca P) |
| Kievan Rus' | 7/10 (P, T ✔) | **S**: Popolarità 5. Ha Sicurezza 3 (Capitale poco guardata), quindi 5 è fuori portata. P a rischio solo a Tartaria (1 uomo, confina con Uralsk dell'Orda) | S 10% | 7 | **EQUILIBRATO** (ha 29 province contro le 32 di fine ciclo II, ma col Primario fatto non conta) |
| Polonia | 8/10 (P, S ✔) | **T**: concludere uno scambio entro fine ciclo (oggi 0). Ha il Mercato e l'alleanza con l'Impero | 55% | 10 o 8 | **AVANZARE** 55% / EQUILIBRATO |
| Bisanzio | 3/10 (S ✔) | **P**: Tracia settentrionale 1→8 uomini (Skopia 10 e Albania 9 sono a posto). Confina con Tracia orientale 10 e Bulgaria 10: basta un turno di reclute più una mossa. **T**: 10 cavalieri, ne ha 4; non ha né bestiame né oro (100) | P 65% · T 5% | 8 | **EQUILIBRATO** |
| Ungheria | 3/10 (S ✔) | **P**: l'Albania è bizantina con 9 uomini, e Bisanzio la deve tenere per il suo Primario; la Bosnia ha 1 uomo, ne servono 3. **T**: Benessere 1→3, impossibile in 2 turni | P 15% | 3 | **EQUILIBRATO** (DIFENDERE se perde una provincia) |
| Mori | 5/10 (P ✔) | **S**: la Città in Medio Egitto, 4→8 uomini. **T**: Popolarità 4, anche qui basta la tassa leggera: (5+3+5)/3 = 4,33 | S 85% · T 60% | 10 o 8 | **AVANZARE** 55% / EQUILIBRATO |
| Danimarca | 0/10 | P impossibile: patto di non belligeranza con l'Impero, che tiene lo Schleswig-Holstein. S: manca la Finnmark (neutrale, 2 uomini). T: Mercato a Oslo (ha 700 oro) | — | 2-5 | capitolo fisso |
| Svezia | 0/10 | P 4/6. S: politica verso il popolo. T: Mercato a Stoccolma (ha 1600 oro) | — | 5 | capitolo fisso |

**La Peste (turni 35-39) è dentro il ciclo IV**, e ogni turno colpisce in base alle
**migliorie di Sanità sulla Capitale** (`GameRules.plagueTier`): con 0-2 il regno perde
uomini e il raccolto, con 3 perde un uomo nelle province popolose, con 4-5 è al riparo.
Situazione oggi: **al riparo** Inghilterra (4), Abbasidi (4), Rus' (5) · **a 3** Francia,
Castiglia, Impero, Polonia, Bisanzio (la terza è un lebbrosario dormiente) e Mori ·
**a 2** l'Ungheria · **a 0** Danimarca e Svezia.

---

## 2. Il filo del secolo: Cent'Anni e Peste

- **La guerra dei Cent'Anni (1337-1453)**, prima fase: Sluys 1340 (flotta francese
  distrutta), sbarco in Normandia e **Crécy 1346**, **Calais 1347** (inglese fino al 1558),
  Poitiers 1356 e Giovanni II prigioniero, **Brétigny 1360**. Poi la riconquista di
  Carlo V e Du Guesclin (dal 1369: nel 1375 agli inglesi restano solo Guascogna e
  Calais). Il ciclo IV la fa combattere **da tutti e due i lati sulle stesse province**:
  l'Inghilterra deve prendere Piccardia e Normandia, la Francia deve tenerle. Vale la
  stessa regola di NORMANDY_FR: la stessa guerra vista da due lati.
- **La Peste Nera (1347-1351)**: in gioco sono i turni 35-39. Per la regola «un
  capitolo non si appoggia a un evento» nessun obiettivo chiede di *sopravvivere* alla
  Peste. Chiedono la cosa che il giocatore controlla: **le migliorie di Sanità sulla
  Capitale** (nuovo template `sanita`, §4). La Peste arriva comunque, e così
  l'obiettivo vale anche come preparazione.
- **Lo Stretto**: Río Salado 1340 e Algeciras 1344. Castiglia e Mori si contendono
  l'**Al-Rif** (Tangeri e Ceuta), che in gioco confina con Andalusia e Granada. È il
  secondo fronte doppio del ciclo.

---

## 3. Gli obiettivi del ciclo IV — revisione dell'utente (2026-11-22)

Numeri **fissi** (`fisso: true`), come nel ciclo III. L'intensità prevista resta scritta
accanto al regno come riferimento.

| Regno | tema | P (5) | S (3) | T (2) |
|---|---|---|---|---|
| Inghilterra *(avanzare)* | I Cent'Anni | **Crécy e Calais** — conquista Piccardia e Normandia e difendile con 8 uomini ciascuna | **L'Ordine della Giarrettiera** — 8 cavalieri nel tuo esercito *(proposta)* | **Il Buon Parlamento** — Benessere 4 *(proposta)* |
| Francia *(equilibrato)* | Carlo V e Du Guesclin | **La riscossa di Carlo di Valois** — difendi Normandia, Bretagna, Piccardia e Poitou con 6 uomini ciascuna | **Avignone e il Delfinato** — una Città fra Provenza, Linguadoca e Rodano, difesa con 4 uomini | **La Morte Nera a Parigi** — 4 migliorie di Sanità sulla Capitale |
| Castiglia *(avanzare)* | Río Salado e lo Stretto | **Río Salado** — Al-Rif e Fez cristiane: nessuna delle due resta musulmana (il Portogallo può tenersi Fez) | **Le Atarazanas di Siviglia** — conserva 10 scorte di legno | **La Hermandad delle città** — politica fortemente a favore del popolo |
| Mori *(avanzare)* | Merinidi e Mamelucchi | **Il Maghreb dei Merinidi** — possiedi Marocco interno, Fez e Al-Rif con 5 uomini ciascuna | **Le galee di Ceuta** — una conquista navale | **La Peste al Cairo** — 4 migliorie di Sanità sulla Capitale |
| Sacro Romano Impero *(avanzare)* | Le corone di Carlo IV | **Marienburg** — conquista Prussia occidentale e orientale e difendile con 8 uomini ciascuna | **Praga, città di Carlo IV** — una Città in Boemia, difesa con 6 uomini | **La Bolla d'Oro** — politica fortemente a favore della nobiltà |
| Polonia *(avanzare)* | Casimiro il Grande e Krewo | **L'unione di Krewo** — possiedi Vilnius, Minsk e Vitebsk con 6 uomini ciascuna | **Una Polonia di pietra** — costruisci una Fortezza | **Il re dei contadini** — Benessere 4 |
| Kievan Rus' *(equilibrato)* | Dmitrij Donskoj | **Le steppe del Mar Nero** — conquista Kuban, Stavropol, Calmucchia, Astrachan' e Uralsk; Kuban e Stavropol difese con 3 uomini ciascuna | **Kolomna, la piazza d'armi** — costruisci una Fortezza | **Le schiere di Donskoj** — 15 cavalieri nel tuo esercito |
| Ungheria *(equilibrato)* | Luigi il Grande | **La pace di Zara** — possiedi Dalmazia, Croazia e Slovenia; la Slovenia difesa con 4 uomini | **La corte di Visegrád** — costruisci una Città | **La peste di Napoli** — 3 migliorie di Sanità sulla Capitale |
| Bisanzio *(equilibrato)* | I Turchi in Bitinia | **Bursa e Nicea** — 5 province d'Anatolia con almeno 5 uomini ciascuna | **La via Egnatia** — collega alla Capitale 4 tipi di risorsa | **La Peste a Costantinopoli** — 4 migliorie di Sanità sulla Capitale |
| Abbasidi *(avanzare)* | Il Califfato e le Città Sante | **Il custode delle Città Sante** — conquista l'intera penisola arabica: Hail, Hegiaz, Nejd, Yemen, Oman, Abu Dhabi (basta possederle, nessuna guarnigione minima) | **Le cupole dei Jalayiridi** — fonda 2 nuove Città (3 in tutto) | **Le carovane di Hormuz** — 5 scambi commerciali nel ciclo |
| Danimarca *(fisso)* | Valdemar Atterdag | **Il richiamo del Danelaw** — conquista una provincia del Regno d'Inghilterra | **La pace di Valdemar** — Sicurezza 5 | **La flotta per Visby** — conserva 5 scorte di legno |
| Svezia *(fisso)* | Magnus Eriksson e Nöteborg | **Il trattato di Nöteborg** — conquista il Norrbotten e 3 province finlandesi | **Il Landslag di Magnus** — Sicurezza 4 | **Il ferro di Bergslagen** — costruisci un Mercato e concludi 2 scambi |
| Sultanato di Delhi *(nuovo, turno 31)* | I Khalji e i Tughlaq | **Le campagne di Alauddin** — conquista Gujarat, Malwa, Sind e Awadh | **Le città di Firuz Shah** — una Città oltre la Capitale | **Il mercato di Alauddin** — costruisci un Mercato |
| Impero Giapponese *(nuovo, turno 31)* | Le due Corti | **L'unione delle due Corti** — possiedi Kyushu, Chubu, Kanto e Tohoku | **Kamakura ed Edo** — una Città nel Kanto (il pop-up dice «Edo») | **I pirati wakō** — una conquista navale |

### Note storiche dei titoli nuovi
- **Ordine della Giarrettiera** (1348): l'ordine cavalleresco di Edoardo III, nato fra
  Crécy e Poitiers. **Buon Parlamento** (1376): i Comuni mettono sotto accusa i ministri
  corrotti del re.
- **Atarazanas di Siviglia**: i cantieri reali che armano le galee castigliane, quelle
  di Algeciras e di La Rochelle (1372). **Hermandad** (1315): la lega delle città
  castigliane, sotto la minorità di Alfonso XI.
- **Ceuta**: la base navale merinide sullo Stretto.
- **Marienburg** (1309): diventa la capitale dell'Ordine teutonico, lo stato tedesco di
  Prussia.
- **Kolomna** (1380): la piazza dove Dmitrij raduna l'esercito prima di Kulikovo.
- **Peste di Napoli** (1348): Luigi d'Ungheria occupa Napoli e la lascia per la peste.
- **Via Egnatia**: la strada romana che attraversa i Balcani bizantini fino a Tessalonica.
- **Jalayiridi**: costruttori a Baghdad e Tabriz (madrasa Mirjaniya, 1357).
  **Hormuz**: l'emporio del Golfo nel XIV secolo.
- **Landfred di Valdemar** (1360): la pace del regno. **Visby** (1361): Valdemar sbarca
  a Gotland con la flotta e saccheggia la città anseatica.
- **Bergslagen**: le miniere di ferro svedesi che commerciano con la Hansa.

### Nodi da sapere (non bloccano: sono conflitti voluti o da sciogliere col gioco)
- **Patti da rompere** per il Primario:
  - Sacro Impero → Polonia (alleanza + non belligeranza) per la Prussia;
  - Ungheria → Sacro Impero (non belligeranza) per la Slovenia, che ha 5 uomini;
  - Rus' → Selgiuchidi (non belligeranza) per Kuban e Stavropol.
- **Fronti doppi**:
  - Castiglia e Mori sull'Al-Rif e su Fez;
  - Inghilterra e Francia su Piccardia e Normandia;
  - Sacro Impero e Polonia sulla Prussia, ma il Primario polacco è in Lituania e non la
    tocca.
- **Danimarca**: nessuna provincia inglese confina via terra con la Danimarca. La più
  vicina è la Frisia (3 uomini), da raggiungere per nave (ne ha 2).
- **Svezia**: le province finlandesi sono Oulu (neutrale) più Ostrobotnia, Kuopio,
  Uusimaa e Carelia occidentale (polacche). Se nel ciclo III costruisce il Mercato di
  Stoccolma, nel T resteranno da fare solo i 2 scambi.
- **Abbasidi**: la penisola sono 6 province, 5 delle quali neutrali con 4 uomini.

---

## 4. Implementazione (fatta il 2026-11-22, non ancora pubblicata)

1. **Template `sanita`** + `ctx.sanitaCount()` in `objectiveContext` (app.js): conta le
   migliorie di Sanità attive sulla Capitale, con la stessa lettura di `plagueRound`
   (`GameRules.welfareCount(attive, 'sanita')`). Lo usano Francia, Mori, Ungheria e
   Bisanzio.
2. **Nuovi SET**:
   - `STRETTO` (Al_Rif, Fez);
   - `STEPPA_NERA` (Kuban, Stavropol, Kalmykia, Astrakhan, Uralsk);
   - `DALMAZIA_HU` (Dalmatia, Croatia, Slovenia);
   - `ARABIA_INTERA` (Hail, Hedjaz, Nejd, Yemen, Oman, Abu_Dhabi);
   - `REGNO_INGLESE` (BRITISH + Friesland, Holland, Gelre, French_Low_Countries);
   - `FINLANDIA` (Oulu, Ostrobothnia, Kuopio, Uusimaa, West_Karelia).
   - `INDIA_KHALJI` (Gujarat, Central_India, Sindh, Awadh), `GIAPPONE_ISOLE` (Kyushu, Chubu, Kanto, Tohoku).

   Gli id sono verificati sulla mappa.
3. Il resto si fa coi template esistenti:
   - `province`, `regioneGuarnigioni`, `regioneSenzaFede` (famiglia `musulmani`), `regione`;
   - `cavalieri`, `benessere`, `sicurezza`, `politica`, `scorte`;
   - `conquisteNavali` (si azzera a ogni ciclo), `rottaCommerciale`;
   - `fortezza`, `cittaCount`, `citta`, `cittaRegione`, `tipiCollegati`;
   - `tutti`, per:
     - Svezia P (Norrbotten + 3 FINLANDIA) e T (Mercato + 2 scambi);
     - Rus' P (`regione` STEPPA_NERA 5 + Kuban e Stavropol con 3 uomini);
     - Ungheria P (`regione` DALMAZIA_HU 3 + Slovenia con 4 uomini).
   - Danimarca T: `scorte` di legno, 5.
4. **Danimarca e Svezia**: il capitolo IV va aggiunto come secondo capitolo del loro
   binario, che oggi ne ha uno solo e lo ripete.
5. Deploy **prima** del turno 31: `closeCycle` genera gli obiettivi e li congela in
   `obiettiviCiclo`.

---

## Fonti (ricerca del 2026-11-22)

- [Hundred Years' War 1337–1360](https://wikipedia.com/wiki/Hundred_Years%27_War_(1337-1360)) · [Truce of Calais](https://Wikipedia.com/wiki/Truce_of_Calais) · [Edward III — Britannica](https://www.britannica.com/place/United-Kingdom/Edward-III-1327-77)
- [Charles V of France](https://en.wikipedia.org/wiki/Charles_V_of_France) · [Caroline War 1369–1389](https://www.wikipedia.com/wiki/Caroline_War)
- [Battle of Río Salado](https://en.wikipedia.org/wiki/Battle_of_R%C3%ADo_Salado) · [Siege of Algeciras 1342–1344](https://wikipedia.com/wiki/Siege_of_Algeciras_(1342-1344))
- [Henry VII, Holy Roman Emperor](https://en.Wikipedia.com/wiki/Henry_VII_(HRR)) · [Germany 1250–1493 — Britannica](https://www.britannica.com/topic/history-of-Germany/Germany-from-1250-to-1493)
- [Casimir III the Great](https://en.wikipedia.org/wiki/Casimir_III_the_Great) · [Treaty of Kalisz 1343](https://en.wikipedia.org/wiki/Treaty_of_Kalisz_(1343)) · [Union of Krewo](https://en.wikipedia.org/wiki/Union_of_Krewo)
- [Dmitry Donskoy](https://en.wikipedia.org/wiki/Dmitry_Donskoy) · [Ivan I of Moscow](https://EN.wikipedia.com/wiki/Ivan_Kalita) · [Moscow history — Britannica](https://www.britannica.com/place/Moscow/History)
- [Treaty of Zadar](https://en.wikipedia.org/wiki/Treaty_of_Zadar) · [Louis I of Hungary — Britannica](https://britannica.com/biography/Louis-I-king-of-Hungary)
- [Byzantine Empire under the Palaiologos](https://en.wikipedia.com/wiki/Late-Byzantine) · [Byzantine–Ottoman wars](https://EN.wikipedia.com/wiki/Byzantine-Ottoman_wars)
- [Siege of Tlemcen 1335–1337](https://en.wikipedia.org/wiki/Siege_of_Tlemcen_(1335%E2%80%931337)) · [Abu al-Hasan Ali](https://en.wikipedia.com/wiki/Abu_al-Hasan_%27Ali) · [North Africa c.1250–1500 — Britannica](https://www.britannica.com/place/North-Africa/Political-fragmentation-and-the-triumph-of-Islamic-culture-c-1250-c-1500)
- [Jalayirid Sultanate](https://en.wikipedia.org/wiki/Jalayirid_Sultanate) · [Muzaffarids](https://Www.Wikipedia.org/wiki/Muzafarids) · [Siege of Baghdad 1393](https://en.wikipedia.org/wiki/Siege_of_Baghdad_(1393))
- [Valdemar IV of Denmark](https://Www.wikipedia.org/wiki/Valdemar_IV) · [Treaty of Stralsund — Britannica](https://www.britannica.com/topic/Treaty-of-Stralsund) · [Kalmar Union](https://www.wikipedia.org/wiki/Kalmar_Union)
- [Treaty of Nöteborg](https://en.wikipedia.org/wiki/Treaty_of_N%C3%B6teborg) · [Magnus Eriksson](https://en.wikipedia.org/wiki/Magnus_Eriksson) · [Albert, King of Sweden](https://en.wikipedia.org/wiki/Albert,_King_of_Sweden)

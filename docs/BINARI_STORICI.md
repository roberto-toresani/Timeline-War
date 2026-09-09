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
| Califfato Fatimide | IV | «Ain Jalut» | **I mamelucchi** — il Levante armato |
| Califfato Abbaside | III | «1258, il sacco di Baghdad» | **Il cuore della Mesopotamia** |
| Califfato Abbaside | IV | «L'Ilkhanato» | **L'altopiano persiano** |
| Califfato Abbaside | V | «Timur» | **La Persia in armi** |
| Ducato di Ungheria | VI | «Mohács» | **Il regno in armi** |
| Califfato Fatimide | VI | «La marea ottomana» | **La cittadella del Cairo** |
| Sacro Romano Impero | VIII | «Ricacciare l'Ottomano» | **La marcia d'Oriente** |

Le **crociate** restano nominate (Francia I, Inghilterra II, Bisanzio I, Fatimidi III): sono
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

# I dieci binari

## Regno di Castiglia — *dalla Reconquista all'impero atlantico*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | La Reconquista comincia | `conquista ANDALUS` |
| II | 1100-1199 | Verso il Tago | `conquista IBERIA` |
| III | 1200-1299 | Las Navas de Tolosa | `unifica ANDALUS` |
| IV | 1300-1399 | Lo Stretto | `sbarca MAGHREB` |
| V | 1400-1499 | Granada e l'Atlantico | `unifica IBERIA` |
| VI | 1500-1599 | L'impero dove non tramonta il sole | `spedizione` |
| VII | 1600-1699 | Difendere l'impero | `flotta` |
| VIII | 1700-1799 | Le riforme borboniche | `regna` |
| IX | 1800-1899 | La penisola invasa | `tieni IBERIA` |
| X | 1900-1999 | La ricostruzione | `arricchisci` |

## Regno di Francia — *dal dominio reale all'egemonia continentale*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | L'appello di Clermont | `raduna MED_FR` |
| II | 1100-1199 | Oltremare | `presidia Aleppo` |
| III | 1200-1299 | Bouvines e il Midi | `conquista NORMANDY_FR` |
| IV | 1300-1399 | I Cent'Anni | `tieni NORMANDY_FR` |
| V | 1400-1499 | Cacciare l'inglese | `unifica NORMANDY_FR` |
| VI | 1500-1599 | Le guerre d'Italia | `conquista ITALIA_NORD` |
| VII | 1600-1699 | I confini naturali | `conquista RENO` |
| VIII | 1700-1799 | Le colonie | `spedizione` |
| IX | 1800-1899 | L'egemonia continentale | `conquista GERMANIA` |
| X | 1900-1999 | Tenere | `tieni` |

## Califfato Fatimide — *dal Mediterraneo all'Egitto, e ritorno*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Il mare dei Fatimidi | `sbarca IBERIA` |
| II | 1100-1199 | L'emirato e l'Egitto | `conquista IBERIA` |
| III | 1200-1299 | Saladino | `conquista HOLY_LAND` |
| IV | 1300-1399 | Ain Jalut | `tieni LEVANT` |
| V | 1400-1499 | Le vie del Mar Rosso | `conquista ARABIA` |
| VI | 1500-1599 | La marea ottomana | `tieni EGYPT` |
| VII | 1600-1699 | Il Nordafrica | `conquista MAGHREB` |
| VIII | 1700-1799 | I bey e i mamelucchi | `fonda EGYPT` |
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
| I | 1000-1099 | I ducati | `presidia GERMANIA` |
| II | 1100-1199 | Le città imperiali | `fonda GERMANIA` |
| III | 1200-1299 | L'Italia di Federico II | `conquista ITALIA_NORD` |
| IV | 1300-1399 | La Bolla d'Oro | `unifica GERMANIA` |
| V | 1400-1499 | Gli Asburgo | `conquista AUSTRIA_EST` |
| VI | 1500-1599 | La fede spezzata | `converti GERMANIA` |
| VII | 1600-1699 | I Trent'Anni | `tieni GERMANIA` |
| VIII | 1700-1799 | Verso oriente | `conquista BALCANI` |
| IX | 1800-1899 | L'unificazione | `unifica GERMANIA` |
| X | 1900-1999 | La potenza continentale | `regna` |

## Ducato di Polonia — *dal mare alle spartizioni, e ritorno*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Sbocco al mare | `presidia BALTICO` |
| II | 1100-1199 | La flotta baltica | `flotta` |
| III | 1200-1299 | L'orda | `tieni POLONIA` |
| IV | 1300-1399 | Casimiro il Grande | `fonda POLONIA` |
| V | 1400-1499 | L'unione e Grunwald | `conquista BALTICO` |
| VI | 1500-1599 | Il granaio d'Europa | `arricchisci` |
| VII | 1600-1699 | Il diluvio | `tieni POLONIA` |
| VIII | 1700-1799 | Le spartizioni | `presidia` la Capitale |
| IX | 1800-1899 | Senza stato | `riprendi` |
| X | 1900-1999 | Rinascere | `unifica POLONIA` |

## Kievan Rus' — *dalla Rus' all'impero*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Le terre della Rus' | `conquista RUS_NORD` |
| II | 1100-1199 | Kiev di pietra | `fonda Kiev` |
| III | 1200-1299 | Il giogo | `tieni RUS_NORD` |
| IV | 1300-1399 | Raccogliere le terre russe | `unifica RUS_NORD` |
| V | 1400-1499 | La fine del giogo | `conquista EST_RUSSO` |
| VI | 1500-1599 | Verso oriente | `unifica EST_RUSSO` |
| VII | 1600-1699 | La Siberia | `conquista` l'estremo est |
| VIII | 1700-1799 | La finestra sul Baltico | `conquista BALTICO` |
| IX | 1800-1899 | L'impero | `conquista CAUCASO` |
| X | 1900-1999 | La potenza | `regna` |

## Ducato di Ungheria — *dal regno prospero al Trianon*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | Il regno prospero | `regna` |
| II | 1100-1199 | L'Adriatico | `conquista ADRIATIC` |
| III | 1200-1299 | Mohi | `tieni PANNONIA` |
| IV | 1300-1399 | Gli Angioini | `conquista BALCANI` |
| V | 1400-1499 | Hunyadi e Belgrado | `presidia BALCANI` |
| VI | 1500-1599 | Mohács | `presidia` la Capitale |
| VII | 1600-1699 | L'occupazione | `riprendi` |
| VIII | 1700-1799 | La riconquista | `unifica PANNONIA` |
| IX | 1800-1899 | Il dualismo | `fonda PANNONIA` |
| X | 1900-1999 | Il Trianon | `tieni PANNONIA` |

## Impero Bizantino — *la frontiera d'Oriente*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | La riconquista balcanica | `conquista Macedonia+Bulgaria` |
| II | 1100-1199 | I Comneni | `conquista(4) GREECE` |
| III | 1200-1299 | La riscossa d'Anatolia | `conquista+presidia(6) ANATOLIA` |
| IV | 1300-1399 | Le frontiere vigilate | `presidia(5) ogni confine` |
| V | 1400-1499 | La cristianità in pericolo | `presidia(8) ANATOLIA` |
| VI | 1500-1599 | La rinascita imperiale | `fonda+presidia(6) una Città` |
| VII | 1600-1699 | Verso l'Adriatico | `conquista Albania+Serbia+Montenegro` |
| VIII | 1700-1799 | Le terre perdute dell'Islam | `conquista ISLAM_ORIGINE` |
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
| II | 1100-1199 | La Terra Santa | `conquista HOLY_LAND` |
| III | 1200-1299 | 1258, Baghdad | `tieni MESOPOTAMIA` |
| IV | 1300-1399 | L'Ilkhanato | `conquista PERSIA` |
| V | 1400-1499 | Timur | `tieni PERSIA` |
| VI | 1500-1599 | I Safavidi | `converti PERSIA` |
| VII | 1600-1699 | Isfahan | `fonda Isfahan` |
| VIII | 1700-1799 | Il declino | `tieni PERSIA` |
| IX | 1800-1899 | Fra due imperi | `presidia PERSIA` |
| X | 1900-1999 | Il petrolio | `arricchisci` |

---

# Le regioni

Province verificate su `src/data/map_data.js` (628 province). Gli id SVG sostituiscono gli
spazi con `_`. In **grassetto** le regioni già esistenti in `objectives.js`.

| regione | province |
|---|---|
| **ANDALUS** | Toledo, Badajoz, Andalusia, Granada, Valencia, Alentejo |
| **IBERIA** | Galicia, Asturias, Navarra, Castile, Aragon, Catalonia, Toledo, Estremadura, Valencia, Badajoz, Alentejo, Andalusia, Granada |
| **BRITISH** | Home_Counties, East_Anglia, Midlands, Wales, West_Country, Yorkshire, Lancashire, Lowlands, Highlands, Leinster, Ulster, Munster, Connaught |
| **IRELAND** | Leinster, Ulster, Munster, Connaught |
| **FRANCIA** | Normandy, Brittany, Picardy, Maine_Anjou, Poitou, Guyenne, Aquitaine, Burgundy *(le terre angioine, **Fiandre escluse**: il capitolo III inglese chiede una provincia di Francia* e *le Fiandre)* |
| **AMERICA** | Maine, New_Hampshire, Massachusetts, Connecticut, New_York, New_Jersey, Delaware, Maryland, Virginia, North_Carolina, South_Carolina, Georgia, Florida |
| **INDIE** | Sindh, Gujarat, Bombay, Travancore, Madras, Andhra, Orissa, Bengal, Ceylon, Senegal, Gambia, Guinea, Ivory_Coast, Ghana, Nigeria, Niger_Delta, Gabon, North_Angola, South_Angola, Namaqualand, Cape_Colony, Eastern_Cape, Zululand, Mocambique, Zanzibar, Kenya, Somaliland |
| **MED_FR** | Provence, Languedoc, Rhone |
| **NORMANDY_FR** | Normandy, Brittany, Picardy, Flanders, Aquitaine, Burgundy |
| **ADRIATIC** | Croatia, Dalmatia, Istria |
| **GREECE** | Thessalia, Attica, Peloponnese, Crete, West_Aegean_Islands, Albania, Northern_Thrace |
| **EGYPT** | Matruh, Lower_Egypt, Upper_Egypt, Middle_Egypt, Egyptian_Desert |
| **ISLANDS** | Sicily, Sardinia |
| **HOLY_LAND** | Palestine, Aleppo, Lebanon, Syria |
| **LEVANT** | Lebanon, Syria, Palestine |
| **ANATOLIA** | Trabzon, Hudavendigar, Aydin, Konya, Kastamonu, Ankara, Erzurum, Diyarbakir, Adana *(l'Anatolia asiatica per intero, 9 province — Bisanzio, capitoli III/V)* |
| **TRANSGIORDANIA** | Transjordan, Lebanon *(non più usata: era il condizionale bizantino III, caduto con la storia riscritta)* |
| **SICILIA_CALABRIA** | Sicily, Calabria *(Bisanzio, capitoli IV/V: lo sbarco in Italia)* |
| **ISLAM_ORIGINE** | Sicily, Diyarbakir, Mosul, Deir_Ez_Zor, Aleppo, Syria, Palestine, Lebanon, Transjordan, Sinai *(le terre musulmane del Mille raggiungibili da Bisanzio, capitolo VIII — vedi data/start_religions.js)* |
| **MAGHREB** | Inner_Morocco, Oran, Constantine, Tunisia, Tripoli *(Castiglia IV, Fatimidi VII)* |
| **ITALIA_NORD** | Piedmont, Lombardy, Venetia, Tuscany, Romagna *(Sacro Romano Impero III, Francia VI — la stessa contesa vista dai due lati)* |
| **ITALIA_SUD** | Abruzzo, Umbria, Campania, Apulia, Calabria *(non più usata: era il condizionale bizantino V, caduto con la storia riscritta)* |
| **GERMANIA** | Anhalt, Saxony, Franconia, Bavaria, Rhineland, Hesse, Brandenburg *(Sacro Romano Impero III/IV/VI/VII)* |
| **AUSTRIA_EST** | Austria, Bohemia, Moravia, Silesia, Styria, Tyrol *(Sacro Romano Impero V)* |
| **RENO** | Rhineland, Flanders, Picardy *(Sacro Romano Impero, Francia VII)* |
| **BALTICO** | East_Prussia, West_Prussia, Pomerania, Courland *(Polonia V, Kievan Rus' VIII — la stessa costa contesa)* |
| **POLONIA** | Mazovia, Posen, Silesia, West_Galicia, East_Galicia, Volhynia *(Polonia III/IV/VII)* |
| **PANNONIA** | Central_Hungary, Transdanubia, West_Slovakia, East_Slovakia, Slavonia *(Ungheria III/VII/VIII)* |
| **BALCANI** | Serbia, Bosnia, Bulgaria, Macedonia, Albania, Wallachia, Moldavia *(Ungheria IV/V/VII, Sacro Romano Impero VIII)* |
| **RUS_NORD** | Novgorod, Moscow, Tver, Pskov, Smolensk, Ryazan *(Kievan Rus' III/IV)* |
| **EST_RUSSO** | Kazan, Astrakhan, Ural, Uralsk, Perm, Tartaria *(Kievan Rus' V/VI)* |
| **SIBERIA** | Krasnoyarsk, Buryatia, Irkutsk, Tomsk, Trans_Baikal, Sakhalin, Chukotka, Kamchatka, Amur *(Kievan Rus' VII — la marcia di Yermak; non è nel foglio delle regioni originali)* |
| CAUCASO | North_Caucasus, Greater_Caucasus, Georgia, Armenia, Azerbaijan *(riservata al ciclo IX di Kievan Rus', non ancora scritto)* |
| **ANATOLIA** | Ankara, Konya, Adana, Trabzon, Erzurum, Diyarbakir |
| **MESOPOTAMIA** | Baghdad, Basra, Mosul *(Abbaside III)* |
| **PERSIA** | Isfahan, Fars, Khorasan, Persian_Kurdistan, Irakajemi, Tabriz, Urmia *(Abbaside IV/V/VI/VIII)* |
| **ARABIA** | Yemen, Oman *(Fatimidi V)* |
| SCANDINAVIA | Jutland, Scania, Gotaland, Western_Norway, Eastern_Norway *(dottrina di Norvegia/Svezia, js/doctrines.js — non un binario)* |

---

# Tre nodi sciolti

Erano tre questioni aperte quando solo Inghilterra e Bisanzio avevano un binario completo.
Sono risolte tutte e tre, e i dieci binari coprono ora i capitoli I-VIII in `objectives.js`:

**1. Le fedi corrono su un calendario più veloce.** Gli scismi sono compressi apposta
(`Religions.SCHISMS`: Grande Scisma turno 5, Riforma turno 12, Wahhabismo 16) perché a
scala storica la Riforma cadrebbe al turno 52 e nessuna partita la vedrebbe. Il capitolo VI
del Sacro Romano Impero («La fede spezzata») e il VI degli Abbasidi («I Safavidi») parlano
quindi di un fatto che nel gioco è già accaduto da tempo. Risolto scegliendo la seconda
strada indicata qui: i due capitoli non annunciano lo scisma, ne vivono la CONSEGUENZA —
«ricomponi l'impero attorno alla fede che ti è rimasta» — col nuovo template `fede`
(vocabolario `converti`), che misura la confessione di OGGI, non quella di partenza.

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
sia ADESSO — Polonia VIII, Ungheria VI — perché la Capitale si costruisce, si sposta e si
conquista e un capitolo non può nominare una provincia fissa) e `fortezza` (possiedi una
Fortezza, booleano come `mercato` — l'ultima difesa di un binario che finisce sotto
assedio, spesso combinato con `capitale` via `tutti`). La `spedizione` restava data per
mancante ma non lo era: un capitolo non chiede di salpare, chiede di ARRIVARE, e per quello
bastano `regione` + `viaSea` sulla meta d'oltremare (Inghilterra VII/VIII, Castiglia e
Francia VI/VIII).

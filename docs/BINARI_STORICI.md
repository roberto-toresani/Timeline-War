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
| `converti <REGIONE>` | province della tua confessione | `fede` *(da scrivere)* |

Resta da scrivere un template solo, `fede` (converti). La `spedizione` invece non ne vuole uno
suo: quel che conta non è che una nave sia in mare, ma dove SCENDE — e quello lo dicono già
`regione` + `viaSea` sulla meta d'oltremare, come nei capitoli VII e VIII inglesi.

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

**È il primo binario steso per intero** (capitoli I-VIII scritti in `objectives.js`, revisione
dell'utente del 2026-08-29). La sua forma è il modello per gli altri nove: il continente si
prende presto e leggero, si perde a metà partita, e la storia continua per mare.

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

## Impero Bizantino — *il binario che può finire, o non finire*

| # | epoca | capitolo | mira primaria |
|---|---|---|---|
| I | 1000-1099 | La riconquista balcanica | `conquista BALCANI` |
| II | 1100-1199 | I Comneni | `conquista GREECE` |
| III | 1200-1299 | 1204 | `riprendi Eastern_Thrace` |
| IV | 1300-1399 | I Paleologi | `tieni GREECE` |
| V | 1400-1499 | 1453 | `presidia Eastern_Thrace` |
| VI | 1500-1599 | L'impero che non cadde | `conquista ANATOLIA` |
| VII | 1600-1699 | Il mare di Marmara | `flotta` |
| VIII | 1700-1799 | La terza Roma | `converti GREECE` |
| IX | 1800-1899 | L'impero commerciale | `arricchisci` |
| X | 1900-1999 | Costantinopoli | `tieni GREECE` |

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
| MAGHREB | Inner_Morocco, Oran, Constantine, Tunisia, Tripoli |
| ITALIA_NORD | Piedmont, Lombardy, Venetia, Tuscany, Romagna |
| ITALIA_SUD | Abruzzo, Umbria, Campania, Apulia, Calabria |
| GERMANIA | Anhalt, Saxony, Franconia, Bavaria, Rhineland, Hesse, Brandenburg |
| AUSTRIA_EST | Austria, Bohemia, Moravia, Silesia, Styria, Tyrol |
| RENO | Rhineland, Flanders, Picardy |
| BALTICO | East_Prussia, West_Prussia, Pomerania, Courland |
| POLONIA | Mazovia, Posen, Silesia, West_Galicia, East_Galicia, Volhynia |
| PANNONIA | Central_Hungary, Transdanubia, West_Slovakia, East_Slovakia, Slavonia |
| BALCANI | Serbia, Bosnia, Bulgaria, Macedonia, Albania, Wallachia, Moldavia |
| RUS_NORD | Novgorod, Moscow, Tver, Pskov, Smolensk, Ryazan |
| EST_RUSSO | Kazan, Astrakhan, Ural, Uralsk, Perm, Tartaria |
| CAUCASO | North_Caucasus, Greater_Caucasus, Georgia, Armenia, Azerbaijan |
| ANATOLIA | Ankara, Konya, Adana, Trabzon, Erzurum, Diyarbakir |
| MESOPOTAMIA | Baghdad, Basra, Mosul |
| PERSIA | Isfahan, Fars, Khorasan, Persian_Kurdistan, Irakajemi, Tabriz, Urmia |
| ARABIA | Yemen, Oman |
| SCANDINAVIA | Jutland, Scania, Gotaland, Western_Norway, Eastern_Norway |

---

# Tre nodi da sciogliere

**1. Le fedi corrono su un calendario più veloce.** Gli scismi sono compressi apposta
(`Religions.SCHISMS`: Grande Scisma turno 5, Riforma turno 12, Wahhabismo 16) perché a
scala storica la Riforma cadrebbe al turno 52 e nessuna partita la vedrebbe. Quindi il
capitolo VI del Sacro Romano Impero («La fede spezzata») e il VI degli Abbasidi («I
Safavidi») parlano di un fatto che in gioco è già successo al secondo ciclo. Le opzioni:
spostare quei capitoli molto più avanti nel binario, oppure — meglio — lasciarli dove sono
ma renderli *conseguenza* dello scisma («ricomporre l'impero attorno alla fede che ti è
rimasta») invece che il suo annuncio.

**2. I capitoli VI-X sono tracce, non partite.** Una partita vera finisce fra il terzo e il
quinto ciclo. I capitoli **III, IV e V** meritano la cura; da VI in poi bastano queste
righe, e il generatore sa comunque renderle giocabili.

**3. Un template manca ancora: `converti`** (province della propria confessione). Serve al
capitolo VI del Sacro Romano Impero e degli Abbasidi. La `spedizione`, che qui era data per
mancante, si è risolta da sé: un capitolo non chiede di salpare, chiede di ARRIVARE, e per
quello bastano `regione` + `viaSea` (Inghilterra VII e VIII).

// ============================================================
// TERRENO DELLE PROVINCE — dove il numero conta e dove non conta.
//
// Ogni provincia della mappa è o `chiuso` o `aperto`. Non c'è terza via: è una
// scelta di gioco (vedi js/terrain.js e GAME_DESIGN.md §9), non una carta
// geografica. Il terreno cambia l'ESPONENTE della formula di battaglia:
//   aperto  → P_A = A^2.6 / (A^2.6 + Deff^2.6)   il numero pesa di più del solito
//   chiuso  → P_A = A^1.4 / (A^1.4 + Deff^1.4)   il numero pesa molto meno
// È il terreno della provincia ATTACCATA (il campo di battaglia) a decidere.
//
// CRITERIO — come sono state assegnate le 628 province:
//   `chiuso`  monti e altipiani con soli passi obbligati, gole e strettoie,
//             foreste fitte e taiga, paludi e acquitrini, giungla, coste a
//             fiordo o a falesia, isole montuose, penisole e istmi stretti.
//             Sono le terre dove un pugno di uomini che conosce il posto ferma
//             un'armata: Termopili, Roncisvalle, Teutoburgo, Morgarten, il
//             Rif di Abd el-Krim, la Sierra Maestra, il Darién.
//   `aperto`  pianure e bassopiani, steppe e praterie, altopiani larghi senza
//             strettoie, grandi valli e delta fluviali coltivati, deserti di
//             sabbia e ghiaia dove ci si muove in ogni direzione.
//             Sono le terre dove chi ha più uomini li può schierare tutti:
//             Gaugamela, Canne, i Campi Catalaunici, Mohács, Kursk.
//
// Nel dubbio ha vinto il tratto che ha DECISO le guerre di quel territorio, non
// la percentuale di rilievo: la Piccola Polonia ha colline, ma è la via delle
// invasioni; la Vandea è quasi piatta, ma il bocage l'ha resa inespugnabile.
//
// Chiave = nome della provincia come sta in data/map_data.js (inglese), la
// stessa di data/city_names.js. Una provincia che manca qui vale `aperto`
// (js/terrain.js, DEFAULT_TERRAIN).
// ============================================================

const PROVINCE_TERRAIN = {

    // ================= ISOLE BRITANNICHE E IRLANDA =================
    'Home Counties': 'aperto',
    'East Anglia': 'aperto',
    'Midlands': 'aperto',
    'Lancashire': 'aperto',
    'Yorkshire': 'aperto',          // la Vale of York: Stamford Bridge, Towton
    'West Country': 'chiuso',       // Dartmoor, Exmoor, la penisola di Cornovaglia
    'Wales': 'chiuso',              // Snowdonia: due secoli di guerra gallese
    'Highlands': 'chiuso',          // glen e passi: Killiecrankie, Glen Coe
    'Lowlands': 'aperto',
    'Ulster': 'chiuso',             // boschi e drumlin: la guerra dei Nove Anni
    'Connaught': 'chiuso',          // torbiere e Connemara
    'Leinster': 'aperto',
    'Munster': 'chiuso',            // i monti del Kerry, le rivolte dei Desmond
    'Iceland': 'chiuso',

    // ================= SCANDINAVIA E BALTICO =================
    'Finnmark': 'chiuso',
    'Trondelag': 'chiuso',
    'Western Norway': 'chiuso',     // i fiordi: nessun fronte largo esiste
    'Eastern Norway': 'chiuso',
    'Norrbotten': 'chiuso',
    'Gavleborg': 'chiuso',
    'Svealand': 'aperto',
    'Gotaland': 'aperto',
    'Scania': 'aperto',
    'Jutland': 'aperto',
    'Zealand': 'aperto',
    'Kola': 'chiuso',
    'Oulu': 'chiuso',
    'Kuopio': 'chiuso',             // il labirinto dei laghi finlandesi
    'Ostrobothnia': 'aperto',
    'Uusimaa': 'aperto',
    'East Karelia': 'chiuso',       // foresta: le sacche di Suomussalmi
    'West Karelia': 'chiuso',
    'Ingria': 'chiuso',             // le paludi della Neva
    'Talinn': 'aperto',
    'Tartu': 'aperto',
    'Riga': 'aperto',
    'Courland': 'aperto',
    'Vilnius': 'chiuso',            // boschi e laghi della Lituania
    'East Prussia': 'chiuso',       // i laghi Masuri: Tannenberg
    'West Prussia': 'aperto',
    'Pomerania': 'aperto',

    // ================= GERMANIA E PAESI BASSI =================
    'Schleswig Holstein': 'aperto',
    'Mecklenburg': 'aperto',
    'Brandenburg': 'aperto',
    'Posen': 'aperto',
    'Silesia': 'aperto',            // Leuthen, Mollwitz: pianura da manovra
    'Elbe': 'aperto',
    'Anhalt': 'aperto',
    'Hannover': 'aperto',
    'Saxony': 'aperto',             // Breitenfeld, Lützen, Lipsia
    'Franconia': 'aperto',
    'Bavaria': 'aperto',            // la valle del Danubio: Höchstädt
    'Westphalia': 'chiuso',         // la selva di Teutoburgo
    'Ruhr': 'aperto',
    'Rhineland': 'chiuso',          // la gola del Reno, l'Eifel, l'Hunsrück
    'Hesse': 'chiuso',              // Vogelsberg, Rhön, foreste
    'Baden': 'chiuso',              // la Foresta Nera
    'Alsace Lorraine': 'aperto',
    'Friesland': 'aperto',
    'Holland': 'aperto',
    'Gelre': 'aperto',
    'Flanders': 'aperto',
    'Wallonia': 'chiuso',           // le Ardenne
    'French Low Countries': 'aperto',

    // ================= FRANCIA =================
    'Picardy': 'aperto',
    'Normandy': 'chiuso',           // il bocage: siepi e strade incassate
    'Brittany': 'chiuso',           // massiccio armoricano, la chouannerie
    'Maine Anjou': 'aperto',
    'Orleans': 'aperto',            // la Beauce, il granaio del regno
    'Champagne': 'aperto',          // i Campi Catalaunici
    'Lorraine': 'aperto',
    'Franche Comte': 'chiuso',      // il Giura
    'Burgundy': 'aperto',
    'Poitou': 'chiuso',             // bocage e paludi: la guerra di Vandea
    'Guyenne': 'aperto',
    'Aquitaine': 'aperto',
    'Auvergne Limousin': 'chiuso',  // il Massiccio Centrale: Gergovia
    'Rhone': 'aperto',
    'Languedoc': 'aperto',
    'Provence': 'chiuso',           // le Prealpi, il Verdon, le gole del retroterra

    // ================= IBERIA =================
    'Galicia': 'chiuso',            // monti verdi e rías
    'Asturias': 'chiuso',           // i Picos de Europa: Covadonga
    'Navarra': 'chiuso',            // i Pirenei: Roncisvalle
    'Aragon': 'aperto',             // la depressione dell'Ebro
    'Catalonia': 'chiuso',          // Pirenei e catene costiere
    'Valencia': 'aperto',
    'Castile': 'aperto',            // la Meseta
    'Toledo': 'aperto',
    'Badajoz': 'aperto',
    'Andalusia': 'aperto',          // la valle del Guadalquivir
    'Granada': 'chiuso',            // Sierra Nevada e Alpujarras
    'Portugal': 'aperto',
    'Beira': 'chiuso',              // la Serra da Estrela
    'Alentejo': 'aperto',
    'Canary Islands': 'chiuso',

    // ================= ITALIA E ISOLE DEL MEDITERRANEO =================
    'Piedmont': 'chiuso',           // l'arco alpino, il Moncenisio, le valli valdesi
    'Savoy': 'chiuso',
    'Lombardy': 'aperto',           // la pianura padana
    'Venetia': 'aperto',
    'Emilia': 'aperto',
    'Romagna': 'aperto',
    'Tuscany': 'chiuso',            // l'Appennino e le colline: la Linea Gotica
    'Umbria': 'chiuso',             // la stretta del Trasimeno
    'Lazio': 'aperto',
    'Abruzzo': 'chiuso',            // Gran Sasso e Maiella
    'Campania': 'aperto',
    'Apulia': 'aperto',             // il Tavoliere: Canne
    'Calabria': 'chiuso',           // Sila e Aspromonte
    'Sicily': 'chiuso',             // interno montuoso, l'Etna
    'Sardinia': 'chiuso',           // il Gennargentu, la Barbagia
    'Corsica': 'chiuso',            // la macchia e i monti di Paoli
    'South Tyrol': 'chiuso',
    'Tyrol': 'chiuso',              // il Bergisel di Andreas Hofer
    'Istria': 'chiuso',             // il Carso
    'Slovenia': 'chiuso',           // Alpi Giulie e Carso: l'Isonzo

    // ================= EUROPA CENTRALE E BALCANI =================
    'Austria': 'aperto',            // la valle del Danubio, il bacino di Vienna
    'Styria': 'chiuso',
    'East Switzerland': 'chiuso',   // Morgarten: i picchieri contro i cavalieri
    'West Switzerland': 'chiuso',
    'Bohemia': 'chiuso',            // una conca chiusa da tre catene di monti
    'Moravia': 'aperto',            // la Porta Morava: Austerlitz
    'West Slovakia': 'chiuso',
    'East Slovakia': 'chiuso',
    'Greater Poland': 'aperto',
    'Lesser Poland': 'aperto',
    'Mazovia': 'aperto',
    'West Galicia': 'aperto',
    'East Galicia': 'chiuso',       // i Carpazi boscosi
    'Transylvania': 'chiuso',       // il bastione carpatico, la Torre Rossa
    'Central Hungary': 'aperto',    // l'Alföld: Mohács
    'Transdanubia': 'aperto',
    'Bekes': 'aperto',
    'Delvidek': 'aperto',
    'Banat': 'aperto',
    'Slavonia': 'aperto',
    'Croatia': 'chiuso',            // le prime alture dinariche
    'Dalmatia': 'chiuso',           // una striscia fra il mare e le Dinariche
    'Bosnia': 'chiuso',             // il cuore dinarico: terra da imboscate
    'Montenegro': 'chiuso',         // le Montagne Nere, mai davvero prese
    'Serbia': 'chiuso',             // la Šumadija boscosa
    'Albania': 'chiuso',            // i passi di Scanderbeg
    'Skopia': 'chiuso',
    'Macedonia': 'chiuso',
    'Bulgaria': 'chiuso',           // il Balkan: il passo di Shipka
    'Wallachia': 'aperto',
    'Moldavia': 'aperto',
    'Bessarabia': 'aperto',
    'Dobrudja': 'aperto',
    'Northern Thrace': 'aperto',
    'Western Thrace': 'aperto',
    'Eastern Thrace': 'aperto',

    // ================= GRECIA ED EGEO =================
    'Thessalia': 'chiuso',          // le Termopili e la valle di Tempe
    'Attica': 'chiuso',
    'Peloponnese': 'chiuso',        // l'Arcadia, il Taigeto
    'Crete': 'chiuso',              // le Montagne Bianche
    'East Aegean Islands': 'chiuso',
    'West Aegean Islands': 'chiuso',
    'Cyprus': 'chiuso',             // il Troodos

    // ================= ANATOLIA E CAUCASO =================
    'Hudavendigar': 'chiuso',       // l'Olimpo di Bitinia
    'Aydin': 'chiuso',
    'Kastamonu': 'chiuso',          // le catene pontiche
    'Trabzon': 'chiuso',            // le Alpi Pontiche, muraglia sul mare
    'Ankara': 'aperto',             // la steppa dell'altopiano
    'Konya': 'aperto',
    'Adana': 'aperto',              // la piana di Cilicia
    'Diyarbakir': 'chiuso',
    'Erzurum': 'chiuso',
    'Armenia': 'chiuso',
    'Greater Caucasus': 'chiuso',   // trent'anni di guerra di Shamil
    'North Caucasus': 'chiuso',
    'Dagestan': 'chiuso',
    'Azerbaijan': 'aperto',         // la piana del Kura
    'Tabriz': 'chiuso',
    'Urmia': 'chiuso',

    // ================= LEVANTE E MESOPOTAMIA =================
    'Aleppo': 'aperto',
    'Syria': 'aperto',
    'Deir Ez Zor': 'aperto',
    'Mosul': 'aperto',              // le piane assire: Gaugamela
    'Baghdad': 'aperto',
    'Basra': 'chiuso',              // le paludi del basso Iraq
    'Lebanon': 'chiuso',            // il Monte Libano, rifugio di ogni minoranza
    'Palestine': 'aperto',          // la piana di Esdrelon, campo di mille eserciti
    'Transjordan': 'aperto',
    'Sinai': 'aperto',

    // ================= ARABIA =================
    'Hedjaz': 'chiuso',             // i monti della Rivolta Araba
    'Nejd': 'aperto',
    'Hail': 'aperto',
    'Yemen': 'chiuso',              // gli altipiani che nessun impero ha tenuto
    'Oman': 'chiuso',               // il Jebel Akhdar
    'Abu Dhabi': 'aperto',

    // ================= PERSIA E ASIA CENTRALE =================
    'Persian Kurdistan': 'chiuso',  // lo Zagros
    'Luristan': 'chiuso',           // le Porte Persiane
    'Irakajemi': 'chiuso',
    'Isfahan': 'aperto',
    'Fars': 'chiuso',
    'Laristan': 'chiuso',
    'Kerman': 'aperto',
    'Semnan': 'aperto',
    'Mazandaran': 'chiuso',         // l'Alborz e la foresta ircana
    'Khorasan': 'aperto',
    'Sistan': 'aperto',
    'Baluchistan': 'chiuso',        // le catene del Makran
    'Northern Baluchistan': 'chiuso',
    'Pashtunistan': 'chiuso',       // il Khyber: la terra delle imboscate
    'Central Highlands': 'chiuso',  // l'Hazarajat afghano
    'Kandahar': 'aperto',
    'Herat': 'aperto',
    'Balkh': 'aperto',              // la piana battriana
    'Merz': 'aperto',               // l'oasi di Merv nel Karakum
    'Turkmenia': 'aperto',
    'Khiva': 'aperto',
    'Uzbekia': 'aperto',
    'Syrdarya': 'aperto',
    'Fergana': 'chiuso',            // una valle chiusa, entrate obbligate
    'Semireche': 'aperto',
    'Jetisy': 'aperto',
    'Tartaria': 'aperto',
    'Akmolinsk': 'aperto',
    'Uralsk': 'aperto',
    'Aktobe': 'aperto',
    'Tianshan': 'chiuso',
    'Dzungaria': 'aperto',

    // ================= RUSSIA EUROPEA =================
    'Novgorod': 'chiuso',           // foreste e acquitrini dell'Ilmen
    'Pskov': 'chiuso',              // i laghi: la battaglia sul ghiaccio
    'Tver': 'chiuso',               // le alture boscose del Valdaj
    'Yaroslavl': 'chiuso',
    'Galich': 'chiuso',
    'Vyatka': 'chiuso',
    'Perm': 'chiuso',
    'Ural': 'chiuso',
    'Ufa': 'chiuso',                // gli Urali meridionali, le rivolte baschire
    'Chelyabinsk': 'aperto',
    'Arkhangelsk': 'chiuso',
    'Nenetsia': 'chiuso',
    'Moscow': 'aperto',             // le campagne aperte di Borodino
    'Nizhny Novgorod': 'aperto',
    'Ryazan': 'aperto',
    'Oryol': 'aperto',
    'Kursk': 'aperto',              // la terra nera: la più grande battaglia di carri
    'Kharkov': 'aperto',
    'Smolensk': 'aperto',           // la porta di Smolensk, via delle invasioni
    'Mogilev': 'aperto',
    'Vitebsk': 'chiuso',            // il paese dei laghi bielorussi
    'Minsk': 'chiuso',              // foreste e partigiani
    'Brest': 'chiuso',              // le paludi del Pripjat
    'Volhynia': 'chiuso',
    'Chernihiv': 'chiuso',
    'Kiev': 'aperto',
    'Cherson': 'aperto',
    'Taurida': 'aperto',
    'Crimea': 'chiuso',             // si entra solo da Perekop, poi i monti
    'Rostov': 'aperto',
    'Kuban': 'aperto',
    'Stavropol': 'aperto',
    'Kalmykia': 'aperto',
    'Astrakhan': 'aperto',
    'Samara': 'aperto',
    'Kazan': 'aperto',

    // ================= SIBERIA E ESTREMO NORD =================
    'Ob': 'chiuso',                 // la palude di Vasjugan, la più grande del mondo
    'Surgut': 'chiuso',
    'Tobolsk': 'chiuso',
    'Tomsk': 'chiuso',
    'Krasnoyarsk': 'chiuso',
    'Upper Yeniseysk': 'chiuso',
    'Irkutsk': 'chiuso',
    'Buryatia': 'chiuso',
    'Trans Baikal': 'chiuso',
    'Tuva': 'chiuso',
    'Altai': 'chiuso',
    'Yakutsk': 'chiuso',
    'Kolyma': 'chiuso',
    'Okhotsk': 'chiuso',
    'Kamchatka': 'chiuso',
    'Chukotka': 'chiuso',
    'Sakhalin': 'chiuso',
    'Outer Manchuria': 'chiuso',    // la taiga del Sichote-Alin
    'Amur': 'aperto',
    'Northern Manchuria': 'aperto',
    'Southern Manchuria': 'aperto', // la piana di Mukden
    'Shengjing': 'aperto',
    'Hinggan': 'chiuso',            // il Grande Khingan
    'Uliastai': 'aperto',
    'Urga': 'aperto',

    // ================= CINA =================
    'Beijing': 'aperto',
    'Zhili': 'aperto',
    'Shandong': 'aperto',
    'Henan': 'aperto',              // la Pianura Centrale, il campo di tutta la Cina
    'Jiangsu': 'aperto',
    'Nanjing': 'aperto',
    'Yangho': 'aperto',
    'Suzhou': 'aperto',
    'Eastern Hubei': 'aperto',
    'Xian': 'aperto',               // il Guanzhong
    'Ningxia': 'aperto',
    'Alxa': 'aperto',
    'Qinghai': 'aperto',
    'Guangdong': 'aperto',
    'Shanxi': 'chiuso',             // il Taihang e i suoi passi
    'Gansu': 'chiuso',              // il corridoio dell'Hexi: un imbuto lungo mille li
    'Sichuan': 'chiuso',            // "la via di Shu è ardua": il passo di Jianmen
    'Chongqing': 'chiuso',          // le Tre Gole
    'Western Hubei': 'chiuso',
    'Hunan': 'chiuso',
    'Jiangxi': 'chiuso',
    'Zhejiang': 'chiuso',
    'Fujian': 'chiuso',             // monti che l'hanno tenuta fuori dalla Cina
    'Shaozhou': 'chiuso',           // i passi del Nanling
    'Guangxi': 'chiuso',            // il carso a torri di Guilin
    'Guizhou': 'chiuso',            // "non tre li di terra piana"
    'Yunnan': 'chiuso',
    'Lhasa': 'chiuso',
    'Ngari': 'chiuso',

    // ================= GIAPPONE E COREA =================
    'Hokkaido': 'chiuso',
    'Tohoku': 'chiuso',
    'Kanto': 'aperto',              // la piana del Kanto, la più larga dell'arcipelago
    'Chubu': 'chiuso',              // le Alpi giapponesi, la stretta di Sekigahara
    'Kansai': 'chiuso',
    'Chugoku': 'chiuso',
    'Shikoku': 'chiuso',
    'Kyushu': 'chiuso',
    'Pyongyang': 'aperto',
    'Sariwon': 'aperto',            // il corridoio occidentale coreano
    'Seoul': 'aperto',
    'Busan': 'chiuso',              // i monti Sobaek

    // ================= INDIA =================
    'Kashmir': 'chiuso',
    'Himalayas': 'chiuso',
    'Punjab': 'aperto',             // Panipat: qui si è deciso tre volte l'India
    'Delhi': 'aperto',
    'Sindh': 'aperto',
    'Rajputana': 'chiuso',          // gli Aravalli: Chittor, Haldighati
    'Gujarat': 'aperto',
    'Bombay': 'chiuso',             // i Ghati occidentali: i forti di Shivaji
    'Central India': 'chiuso',      // Vindhya e Satpura
    'Nagpur': 'chiuso',
    'Awadh': 'aperto',
    'Bihar': 'aperto',
    'Bengal': 'aperto',             // la piana del Gange: Plassey
    'Orissa': 'chiuso',
    'Andhra': 'aperto',
    'Madras': 'aperto',
    'Hyderabad': 'aperto',          // l'altopiano del Deccan
    'Mysore': 'chiuso',
    'Travancore': 'chiuso',         // i Ghati e le lagune: le Linee di Travancore
    'Ceylon': 'chiuso',             // l'altopiano di Kandy, mai preso dagli europei
    'Assam': 'chiuso',              // diciassette invasioni moghul respinte
    'Kachin': 'chiuso',

    // ================= SUD-EST ASIATICO =================
    'Burma': 'chiuso',
    'Pegu': 'aperto',               // il delta dell'Irrawaddy
    'Shan States': 'chiuso',
    'Chiang Mai': 'chiuso',
    'Tenasserim': 'chiuso',         // una striscia fra monte e mare
    'Bangkok': 'aperto',            // la piana del Chao Phraya
    'Nakhon Ratchasima': 'aperto',  // l'altopiano del Khorat
    'Laos': 'chiuso',               // la catena annamita
    'Cambodia': 'aperto',
    'Mekong': 'aperto',
    'Annam': 'chiuso',
    'Tonkin': 'chiuso',             // i monti del nord: Dien Bien Phu
    'Malaya': 'chiuso',             // la giungla della dorsale
    'Aceh': 'chiuso',               // trent'anni di guerriglia contro l'Olanda
    'North Sumatra': 'chiuso',
    'South Sumatra': 'chiuso',
    'West Java': 'chiuso',
    'Central Java': 'aperto',
    'East Java': 'aperto',
    'North Borneo': 'chiuso',
    'West Borneo': 'chiuso',
    'East Borneo': 'chiuso',
    'Celebes': 'chiuso',
    'Moluccas': 'chiuso',
    'Sunda Islands': 'chiuso',
    'Luzon': 'chiuso',
    'Visayas': 'chiuso',
    'Mindanao': 'chiuso',
    'Formosa': 'chiuso',            // la catena centrale
    'Western New Guinea': 'chiuso',
    'Eastern New Guinea': 'chiuso', // il sentiero di Kokoda

    // ================= OCEANIA =================
    'Western Australia': 'aperto',
    'Northern Territory': 'aperto',
    'South Australia': 'aperto',
    'Queensland': 'aperto',
    'New South Wales': 'aperto',
    'Victoria': 'aperto',
    'Tasmania': 'chiuso',
    'North Island': 'chiuso',       // i pā maori nella boscaglia
    'South Island': 'chiuso',       // le Alpi meridionali
    'Solomon Islands': 'chiuso',
    'Bougainville': 'chiuso',
    'Vanuatu': 'chiuso',
    'Kanak': 'chiuso',
    'Fiji': 'chiuso',
    'Tonga': 'chiuso',
    'Tahiti': 'chiuso',
    'Hawaiian Islands': 'chiuso',
    'East Micronesia': 'chiuso',
    'West Micronesia': 'chiuso',

    // ================= NORD AFRICA =================
    'Al Rif': 'chiuso',             // il Rif: il disastro di Annual
    'Fez': 'chiuso',                // il Medio Atlante
    'Marrakech': 'chiuso',          // l'Alto Atlante
    'Inner Morocco': 'chiuso',
    'Oran': 'aperto',
    'Constantine': 'chiuso',        // la Cabilia e l'Aurès
    'Tunisia': 'aperto',
    'Tripoli': 'aperto',
    'Libya': 'aperto',
    'Matruh': 'aperto',
    'Lower Egypt': 'aperto',
    'Middle Egypt': 'aperto',
    'Upper Egypt': 'aperto',
    'Egyptian Desert': 'aperto',
    'Libyan Desert': 'aperto',
    'Sahara': 'aperto',
    'East Sahara': 'aperto',
    'West Sahara': 'aperto',
    'Mauritania': 'aperto',
    'Inner Mauritania': 'aperto',
    'Cabo Verde': 'chiuso',

    // ================= SAHEL E AFRICA OCCIDENTALE =================
    'Senegal': 'aperto',
    'Gambia': 'aperto',
    'Timbuktu': 'aperto',
    'Western Mali': 'aperto',
    'Eastern Mali': 'aperto',
    'Niger': 'aperto',
    'Chad': 'aperto',
    'Waddai': 'aperto',
    'Bornu': 'aperto',
    'Hausaland': 'aperto',          // la savana della cavalleria haussa
    'East Hausaland': 'aperto',
    'Outer Hausaland': 'aperto',
    'Volta': 'aperto',
    'Togo': 'aperto',               // la breccia di savana che arriva al mare
    'Dahomey': 'aperto',
    'Guinea': 'chiuso',             // il Fouta Djallon di Samori Touré
    'Sierra Leone': 'chiuso',
    'Liberia': 'chiuso',
    'Ivory Coast': 'chiuso',
    'Ghana': 'chiuso',              // la foresta ashanti: agguati e sentieri
    'Benin': 'chiuso',
    'Nigeria': 'chiuso',
    'Niger Delta': 'chiuso',        // la mangrovia
    'Yoruba States': 'chiuso',
    'Windward Coast': 'chiuso',

    // ================= AFRICA ORIENTALE E CORNO =================
    'Dongola': 'aperto',
    'Kordofan': 'aperto',
    'Blue Nile': 'aperto',
    'Darfur': 'aperto',
    'Equatoria': 'chiuso',          // il Sudd, la palude che ferma tutto
    'Eritrea': 'chiuso',            // la scarpata: Adua
    'Amhara': 'chiuso',             // le amba etiopiche, Magdala
    'Gonder': 'chiuso',             // il Simien
    'Oromia': 'chiuso',
    'Somaliland': 'aperto',
    'Uganda': 'chiuso',
    'Rift Valley': 'chiuso',        // le scarpate della fossa
    'Kenya': 'chiuso',              // gli altipiani e la foresta dei Mau Mau
    'Tanganyika': 'aperto',
    'Zanzibar': 'chiuso',
    'Lindi': 'chiuso',              // l'altopiano makonde e la boscaglia
    'North Madagascar': 'chiuso',
    'South Madagascar': 'chiuso',

    // ================= AFRICA CENTRALE =================
    'North Cameroon': 'aperto',
    'South Cameroon': 'chiuso',
    'Gabon': 'chiuso',
    'Ubangi Shari': 'aperto',
    'Congo': 'chiuso',              // la foresta pluviale
    'Congo Orientale': 'chiuso',    // l'Ituri, il Ruwenzori
    'Equateur': 'chiuso',
    'Bas Congo': 'chiuso',          // i Monti di Cristallo e le cateratte
    'Kasai': 'aperto',
    'Katanga': 'aperto',
    'Kazembe': 'aperto',
    'Zambia': 'aperto',
    'Zambezi': 'aperto',
    'Zambezia': 'aperto',
    'Mocambique': 'aperto',
    'Lourenco Marques': 'aperto',
    'North Angola': 'chiuso',
    'East Angola': 'aperto',
    'South Angola': 'aperto',

    // ================= AFRICA AUSTRALE =================
    'Hereroland': 'aperto',
    'Namaqualand': 'aperto',
    'Botswana': 'aperto',           // il Kalahari
    'Northern Cape': 'aperto',
    'Cape Colony': 'aperto',
    'Eastern Cape': 'chiuso',       // l'Amatola: nove guerre di frontiera
    'Zululand': 'chiuso',
    'Vrystaat': 'aperto',           // l'highveld dei boeri
    'Transvaal': 'aperto',

    // ================= NORD AMERICA — CANADA E ARTIDE =================
    'Alaska': 'chiuso',
    'Yukon Territory': 'chiuso',
    'British Columbia': 'chiuso',
    'Northwest Territories': 'aperto',
    'Nunavut': 'aperto',
    'Greenland': 'chiuso',
    'Alberta': 'aperto',
    'Saskatchewan': 'aperto',
    'Manitoba': 'aperto',
    'Ontario': 'chiuso',            // lo scudo canadese: foresta e laghi
    'Quebec': 'chiuso',             // le Laurentides
    'New Brunswick': 'chiuso',
    'Newfoundland': 'chiuso',

    // ================= STATI UNITI =================
    'Maine': 'chiuso',
    'New Hampshire': 'chiuso',      // le White Mountains
    'Vermont': 'chiuso',            // le Green Mountains
    'Massachusetts': 'aperto',
    'Connecticut': 'aperto',
    'New York': 'chiuso',           // gli Adirondack e l'Hudson: Saratoga
    'New Jersey': 'aperto',
    'Pennsylvania': 'chiuso',       // le Allegheny: la disfatta del Monongahela
    'Delaware': 'aperto',
    'Maryland': 'aperto',
    'District Of Columbia': 'aperto',
    'Virginia': 'chiuso',           // la Wilderness e la valle dello Shenandoah
    'West Virginia': 'chiuso',
    'North Carolina': 'chiuso',
    'South Carolina': 'aperto',
    'Georgia': 'aperto',
    'Florida': 'chiuso',            // le Everglades: sette anni di guerra seminole
    'Alabama': 'aperto',
    'Mississippi': 'aperto',
    'Louisiana': 'chiuso',          // i bayou: New Orleans 1815
    'Tennessee': 'chiuso',          // il Cumberland e le Smoky Mountains
    'Kentucky': 'aperto',
    'Ohio': 'aperto',
    'Indiana': 'aperto',
    'Illinois': 'aperto',
    'Michigan': 'aperto',
    'Wisconsin': 'aperto',
    'Minnesota': 'aperto',
    'Iowa': 'aperto',
    'Missouri': 'aperto',
    'Arkansas': 'chiuso',           // gli Ozark e gli Ouachita
    'North Dakota': 'aperto',
    'South Dakota': 'aperto',
    'Nebraska': 'aperto',
    'Kansas': 'aperto',
    'Oklahoma': 'aperto',
    'Texas': 'aperto',
    'Montana': 'aperto',
    'Wyoming': 'chiuso',            // i Bighorn: l'agguato a Fetterman
    'Colorado': 'chiuso',
    'Idaho': 'chiuso',              // i monti del Salmon River
    'Utah': 'chiuso',               // i canyon e il Wasatch
    'Nevada': 'aperto',
    'Arizona': 'chiuso',            // i canyon apache di Cochise e Geronimo
    'New Mexico': 'chiuso',
    'California': 'chiuso',
    'Oregon': 'chiuso',
    'Washington': 'chiuso',         // le Cascades

    // ================= MESSICO E AMERICA CENTRALE =================
    'Baja California': 'chiuso',
    'Sonora': 'chiuso',             // la Sierra Madre yaqui
    'Chihuahua': 'aperto',
    'Sinaloa': 'chiuso',            // le barrancas della Sierra Madre
    'Durango': 'chiuso',
    'Zacatecas': 'aperto',
    'Rio Grande': 'aperto',
    'Bajio': 'aperto',
    'Jalisco': 'chiuso',
    'Mexico': 'chiuso',             // la conca dei vulcani e le calzate lacustri
    'Guerrero': 'chiuso',           // la Sierra Madre del Sur
    'Oaxaca': 'chiuso',
    'Veracruz': 'aperto',
    'Chiapas': 'chiuso',            // la selva lacandona
    'Yucatan': 'chiuso',            // la boscaglia della Guerra delle Caste
    'Guatemala': 'chiuso',
    'San Salvador': 'chiuso',
    'Honduras': 'chiuso',
    'Nicaragua': 'chiuso',          // le Segovie di Sandino
    'Costa Rica': 'chiuso',
    'Panama': 'chiuso',             // il tappo del Darién
    'Cuba': 'chiuso',               // la Sierra Maestra, due volte decisiva
    'Haiti': 'chiuso',
    'Santo Domingo': 'chiuso',
    'Bahamas': 'aperto',
    'West Indies': 'chiuso',

    // ================= SUD AMERICA =================
    'Zulia': 'chiuso',
    'Miranda': 'chiuso',
    'Bolivar': 'aperto',            // i llanos dell'Orinoco: Carabobo
    'Guayana': 'chiuso',
    'Guaviare': 'chiuso',
    'Cundinamarca': 'chiuso',
    'Antioquia': 'chiuso',
    'Cauca': 'chiuso',
    'Ecuador': 'chiuso',
    'Pastaza': 'chiuso',
    'Cajamarca': 'chiuso',          // la piazza di Cajamarca: 168 contro un impero
    'Lima': 'aperto',
    'Ica': 'aperto',
    'Arequipa': 'chiuso',
    'Tarapaca': 'aperto',           // l'Atacama della Guerra del Pacifico
    'Antofagasta': 'aperto',
    'Potosi': 'chiuso',
    'La Paz': 'chiuso',             // le Ande e le Yungas
    'Santa Cruz': 'aperto',
    'Acre': 'chiuso',
    'Amazonas': 'chiuso',
    'Para': 'chiuso',
    'Maranhao': 'aperto',
    'Piaui': 'aperto',
    'Ceara': 'aperto',
    'Rio Grande Do Norte': 'aperto',
    'Paraiba': 'aperto',
    'Pernambuco': 'aperto',
    'Bahia': 'chiuso',              // la caatinga di Canudos
    'Goias': 'aperto',
    'Mato Grosso': 'aperto',
    'Minas Gerais': 'chiuso',       // la Serra do Espinhaço
    'Rio De Janeiro': 'chiuso',     // la Serra do Mar
    'Sao Paulo': 'aperto',
    'Parana': 'aperto',
    'Santa Catarina': 'chiuso',     // la Serra Geral del Contestado
    'Rio Grande Do Sul': 'aperto',
    'Uruguay': 'aperto',
    'Corrientes': 'aperto',
    'Chaco': 'chiuso',              // il Chaco che ha consumato due eserciti
    'Alto Paraguay': 'chiuso',
    'Bajo Paraguay': 'aperto',
    'Jujuy': 'chiuso',              // la quebrada dei gauchos di Güemes
    'Tucuman': 'chiuso',
    'Santiago': 'aperto',
    'Santa Fe': 'aperto',
    'Buenos Aires': 'aperto',       // la pampa
    'La Pampa': 'aperto',
    'Rio Negro': 'aperto',
    'Patagonia': 'aperto',
    'Araucania': 'chiuso',          // trecento anni di resistenza mapuche
    'Los Rios': 'chiuso',
    'South Atlantic Islands': 'chiuso'
};

if (typeof window !== 'undefined') window.PROVINCE_TERRAIN = PROVINCE_TERRAIN;
if (typeof module !== 'undefined' && module.exports) module.exports = PROVINCE_TERRAIN;

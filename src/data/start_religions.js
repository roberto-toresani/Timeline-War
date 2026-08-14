// ============================================================
// RELIGIONE DI PARTENZA — le ECCEZIONI, provincia per provincia.
//
// La fede di una provincia si assegna in due passi (js/religions.js):
//   1. questa tabella, se la provincia c'è (dettaglio, per NOME di provincia
//      come lo mostra la mappa — la stessa chiave di data/city_names.js);
//   2. altrimenti i blocchi regionali per coordinate (Religions.faithByRegion).
//
// Qui stanno SOLO le province che i blocchi sbaglierebbero: le frontiere di
// fede del Mille (Al-Andalus, la Sicilia degli emiri, la Terra Santa fatimide,
// il Baltico ancora pagano, l'Etiopia cristiana in mezzo all'Africa…). Tutto il
// resto — l'Europa cristiana, il Maghreb e l'Arabia sunnite, l'Egitto sciita —
// lo dipingono i blocchi, così non serve elencare mezzo continente.
//
// I cristiani al Mille sono UN popolo solo (`cristiani`): lo Scisma d'Oriente
// (js/religions.js, SCHISMS) li divide in cattolici e ortodossi più avanti.
// L'Islam invece nasce già diviso: sunniti e sciiti esistono dal turno 1.
//
// Anno di riferimento: ~1000 d.C. (turno 1). Fonte di verità della MECCANICA è
// religions.js; questo è solo il dato.
// ============================================================

const RELIGIONS_START = {
    // --- Al-Andalus: la Spagna musulmana (Califfato di Cordova) ---
    'Andalusia': 'sunniti',
    'Granada': 'sunniti',
    'Valencia': 'sunniti',
    'Toledo': 'sunniti',
    'Badajoz': 'sunniti',
    'Alentejo': 'sunniti',

    // --- Sicilia: emirato kalbita (musulmana nel Mille) ---
    'Sicily': 'sunniti',

    // --- Frontiera anatolica e Mesopotamia: qui finisce Bisanzio ---
    'Diyarbakir': 'sunniti',
    'Mosul': 'sunniti',
    'Deir Ez Zor': 'sunniti',
    'Aleppo': 'sunniti',
    'Syria': 'sunniti',
    'Baghdad': 'sunniti',      // califfato abbaside, sunnita
    'Adana': 'cristiani',      // Cilicia, ancora bizantina
    'Armenia': 'cristiani',
    'Erzurum': 'cristiani',

    // --- Terra Santa e Levante fatimide: sotto il Cairo sciita ---
    'Palestine': 'sciiti',
    'Lebanon': 'sciiti',
    'Transjordan': 'sciiti',
    'Sinai': 'sciiti',

    // --- Sciismo del Golfo e dello Yemen ---
    'Basra': 'sciiti',         // qarmati / influenza sciita
    'Yemen': 'sciiti',         // zaiditi

    // --- Caucaso e Volga musulmani ---
    'Dagestan': 'sunniti',
    'Azerbaijan': 'sunniti',
    'Kazan': 'sunniti',        // Bulgari del Volga, islamizzati dal 922
    'Tabriz': 'sunniti',
    'Urmia': 'sunniti',

    // --- Etiopia cristiana (chiesa copta): una sua isola in Africa ---
    'Amhara': 'ortodossi',
    'Gonder': 'ortodossi',
    'Eritrea': 'ortodossi',
    'Oromia': 'ortodossi',

    // --- Baltico e Finlandia ancora pagani nel Mille ---
    'Oulu': 'pagani',
    'Kuopio': 'pagani',
    'Uusimaa': 'pagani',
    'Kola': 'pagani',
    'Ostrobothnia': 'pagani',
    'East Karelia': 'pagani',
    'West Karelia': 'pagani',
    'Tartu': 'pagani',
    'Talinn': 'pagani',
    'Riga': 'pagani',
    'Courland': 'pagani',
    'Vilnius': 'pagani',
    'Ingria': 'pagani',
    'East Prussia': 'pagani',   // Prussi baltici, pagani fino al XIII sec.

    // --- Rus' di Kiev: cristiana dal 988 (diventerà ortodossa allo Scisma) ---
    'Kiev': 'cristiani',
    'Cherson': 'cristiani',
    'Novgorod': 'cristiani',
    'Pskov': 'cristiani',
    'Moscow': 'cristiani',
    'Volhynia': 'cristiani'
};

if (typeof window !== 'undefined') window.RELIGIONS_START = RELIGIONS_START;
if (typeof module !== 'undefined' && module.exports) module.exports = RELIGIONS_START;

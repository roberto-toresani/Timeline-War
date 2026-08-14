// ============================================================
// TERRENO — la variabile geografica della battaglia (§9).
//
// Ogni provincia è `chiuso` o `aperto` (data/province_terrain.js). Non è un
// bonus difensivo come le mura: è la MISURA DI QUANTO CONTA IL NUMERO. Le mura
// sommano difensori virtuali (Deff = D + fort), il terreno cambia invece
// l'ESPONENTE della formula:
//
//     P_A = A^k / (A^k + Deff^k)
//
//   k = 2.6  terreno APERTO — pianure, steppe, deserti aperti: chi ha più
//            uomini li schiera tutti e il vantaggio numerico si moltiplica.
//   k = 2.0  il valore storico del gioco (nessun terreno: solo il ripiego).
//   k = 1.4  terreno CHIUSO — monti, gole, foreste, paludi: il fronte è stretto,
//            l'armata grande non riesce a far pesare i suoi numeri.
//
// Conta il terreno della provincia ATTACCATA: è lì che si combatte.
//
// Cosa cambia davvero (rapporto A/Deff → probabilità dell'attaccante):
//     rapporto   chiuso   normale   aperto
//       1,5×      64%       69%      74%
//       2×        73%       80%      86%
//       3×        82%       90%      95%
//       4×        87%       94%      97%
// Un 3-contro-1 in montagna lascia al difensore quasi il doppio delle
// possibilità che in pianura: attaccare in salita si può, ma si paga.
//
// Modulo PURO, senza DOM: qui c'è solo il sapere. Chi combatte è battle.js,
// chi muta lo stato è game-actions.js.
// ============================================================

(function (root) {
    'use strict';

    // `esponente` è l'unico numero che tocca le regole: label, icona, colore e
    // testi servono alla plancia e alla vista-mappa per terreno.
    const TERRAINS = {
        aperto: {
            label: 'Terreno aperto',
            breve: 'pianure, steppe, deserti aperti',
            testo: 'Spazio per schierare tutti: qui il numero pesa più del solito.',
            icona: '≈',
            colore: '#d9b96b',
            esponente: 2.6
        },
        chiuso: {
            label: 'Terreno chiuso',
            breve: 'monti, gole, foreste, paludi',
            testo: 'Fronte stretto: un piccolo drappello può reggere a un\'armata.',
            icona: '⛰',
            colore: '#7f8f6a',
            esponente: 1.4
        }
    };

    // Terra senza scheda: si comporta come prima che il terreno esistesse.
    const DEFAULT_TERRAIN = 'aperto';
    const NEUTRAL_EXPONENT = 2;   // il valore storico del gioco, ripiego puro

    function table() {
        if (typeof PROVINCE_TERRAIN !== 'undefined') return PROVINCE_TERRAIN;
        return root.PROVINCE_TERRAIN || {};
    }

    // Il terreno di una provincia, dal suo NOME come lo mostra la mappa (la
    // stessa chiave di data/city_names.js e data/start_religions.js).
    function of(name) {
        const t = table()[name];
        return TERRAINS[t] ? t : DEFAULT_TERRAIN;
    }

    function get(id) { return TERRAINS[id] || null; }
    function label(id) { const t = TERRAINS[id]; return t ? t.label : ''; }
    function icon(id) { const t = TERRAINS[id]; return t ? t.icona : ''; }
    function color(id) { const t = TERRAINS[id]; return t ? t.colore : '#888'; }
    function exists(id) { return !!TERRAINS[id]; }

    // L'esponente da passare a battle.js. Accetta sia la chiave del terreno
    // ('chiuso'/'aperto') sia direttamente il nome della provincia: le due
    // famiglie di nomi non si sovrappongono, e chi chiama non deve convertire.
    function exponent(idOrName) {
        if (!idOrName) return NEUTRAL_EXPONENT;
        const t = TERRAINS[idOrName] || TERRAINS[of(idOrName)];
        return t ? t.esponente : NEUTRAL_EXPONENT;
    }

    const api = {
        TERRAINS, DEFAULT_TERRAIN, NEUTRAL_EXPONENT,
        of, get, label, icon, color, exists, exponent
    };

    root.Terrain = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);

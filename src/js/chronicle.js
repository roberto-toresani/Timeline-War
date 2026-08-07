// ============================================================
// CRONACA DEL REGNO — il calendario della partita e le note di cronaca.
//
// Un turno non è un numero: è un DECENNIO. Il turno 1 (il primo della partita)
// copre il 1000-1009, il turno 2 il 1010-1019 e così via. Su questo calendario
// poggiano tre cose:
//   - la FONDAZIONE di una città: nome vero (data/city_names.js) e anno dentro
//     il decennio → "Anno Domini 1143, nella provincia di Home Counties nasce
//     la città di Londra";
//   - la CAPITALE, quando il regno vi mette il suo seggio;
//   - l'ECO STORICA di una battaglia: se in quella provincia, in quel decennio,
//     si è combattuta davvero una battaglia (data/historic_battles.js), la
//     cronaca la ricorda accanto a quella appena giocata.
//
// Funzioni PURE, nessun DOM: chi disegna la pergamena è showFoundation() in
// app.js, chi decide QUANDO è game-actions.js (build / attack).
//
// L'anno NON è casuale: esce da un hash di provincia + turno. Così la stessa
// fondazione riletta (ricarica di pagina, altro giocatore che guarda) dà
// sempre lo stesso anno, senza doverlo salvare nello stato della partita.
// ============================================================

(function (root) {
    'use strict';

    // Il tempo di gioco. app.js legge da qui: l'anno mostrato nella targhetta
    // in alto e l'anno della fondazione devono essere lo stesso calendario.
    const YEAR_ZERO = 1000;
    const YEARS_PER_TURN = 10;
    // La partita comincia dal turno 1 (non dallo 0): il turno 1 è il decennio
    // 1000-1009, il 2 il 1010-1019. Chi conta i turni parte da qui, così il
    // calendario e la targhetta dell'anno non possono divergere.
    const FIRST_TURN = 1;

    function yearOfTurn(turn) {
        const t = Math.max(FIRST_TURN, Math.floor(turn || FIRST_TURN));
        return YEAR_ZERO + (t - FIRST_TURN) * YEARS_PER_TURN;
    }

    // Primo e ultimo anno coperti dal turno.
    function spanOfTurn(turn) {
        const from = yearOfTurn(turn);
        return [from, from + YEARS_PER_TURN - 1];
    }

    // Hash stabile (djb2): stessa stringa -> stesso numero, sempre.
    function hash(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    // La città che sorge in quella provincia (data/city_names.js). Se non è in
    // tabella vale il nome della provincia: mezzo mondo si chiama già come la
    // sua città (Riga, Baghdad, Lima…).
    function cityNameFor(provinceName) {
        const table = (typeof CITY_NAMES !== 'undefined') ? CITY_NAMES : root.CITY_NAMES;
        return (table && table[provinceName]) || provinceName;
    }

    // Chiusa della cronaca. Non dipende da nessun dato della provincia: è solo
    // la voce del cronista. Si sceglie con lo stesso hash dell'anno, così la
    // stessa fondazione ha sempre la stessa riga.
    const CHRONICLE_LINES = [
        'Attorno alle prime mura si stringono le case, e chi vi abita smette di chiamarlo villaggio.',
        'Il cronista annota il nome sul registro del regno: da oggi la si conta fra le città.',
        'Vi si aprono botteghe e un mercato, e le strade dei dintorni cominciano a portare lì.',
        'Le campane della nuova città si sentono fino ai villaggi di confine.'
    ];

    // Tutto quel che serve alla pergamena. `provinceName` è il nome della
    // provincia come lo mostra la mappa; `turn` è il turno globale.
    function foundCity(provinceName, turn, kingdom) {
        const span = spanOfTurn(turn);
        const seed = hash(provinceName + '#' + turn);
        const anno = span[0] + seed % YEARS_PER_TURN;
        const citta = cityNameFor(provinceName);
        const omonima = citta === provinceName;
        return {
            tipo: 'citta',
            citta,
            provincia: provinceName,
            regno: kingdom || '',
            anno,
            da: span[0],
            a: span[1],
            titolo: omonima
                ? 'Il borgo di ' + citta + ' diventa città'
                : 'Nasce la città di ' + citta,
            testo: (omonima
                ? 'Nella provincia di ' + provinceName + ', il borgo di ' + citta + ' cinge le sue prime mura.'
                : 'Nella provincia di ' + provinceName + ' sorge la città di ' + citta + '.'),
            // hash diverso da quello dell'anno: con lo stesso seme le due scelte
            // resterebbero agganciate (10 e 4 hanno un fattore in comune).
            nota: CHRONICLE_LINES[hash(citta + '!' + turn) % CHRONICLE_LINES.length]
        };
    }

    // La capitale non "nasce": ci si mette il seggio. Stessa pergamena, altro
    // annuncio — e la città resta quella vera della provincia.
    function foundCapital(provinceName, turn, kingdom) {
        const span = spanOfTurn(turn);
        const anno = span[0] + hash(provinceName + '@' + turn) % YEARS_PER_TURN;
        const citta = cityNameFor(provinceName);
        return {
            tipo: 'capitale',
            citta,
            provincia: provinceName,
            regno: kingdom || '',
            anno,
            da: span[0],
            a: span[1],
            titolo: citta + ', capitale del regno',
            testo: 'Nella provincia di ' + provinceName + ', la corte prende stanza a ' + citta +
                   (kingdom ? ': da qui si governa il regno di ' + kingdom + '.' : '.'),
            nota: 'Le strade del regno si misureranno da queste mura.'
        };
    }

    // ---------- eco storica delle battaglie ----------
    // Cerca in data/historic_battles.js una battaglia VERA combattuta in una di
    // queste province dentro il decennio del turno. `provinceNames` va passato
    // in ordine di preferenza: prima la provincia contesa, poi quella di
    // partenza. Nessuna corrispondenza -> null, e non si mostra niente: la
    // rarità è voluta, l'eco vale proprio perché non esce a ogni attacco.
    function battlesOfTurn(provinceNames, turn) {
        const table = (typeof HISTORIC_BATTLES !== 'undefined') ? HISTORIC_BATTLES : root.HISTORIC_BATTLES;
        if (!table) return [];
        const span = spanOfTurn(turn);
        const names = (provinceNames || []).filter(Boolean);
        return table
            .filter(b => b.anno >= span[0] && b.anno <= span[1] && names.indexOf(b.provincia) >= 0)
            .sort((a, b) => names.indexOf(a.provincia) - names.indexOf(b.provincia));
    }

    function battleEcho(provinceNames, turn) {
        const found = battlesOfTurn(provinceNames, turn);
        if (!found.length) return null;
        // Più battaglie nello stesso decennio e nella stessa provincia: se ne
        // sceglie una sola, sempre la stessa (niente Math.random: lo stesso
        // attacco riletto deve raccontare lo stesso fatto).
        const first = found.filter(b => b.provincia === found[0].provincia);
        const b = first[hash(found[0].provincia + '~' + turn) % first.length];
        return {
            tipo: 'battaglia',
            anno: b.anno,
            provincia: b.provincia,
            titolo: b.nome,
            testo: 'Accadde qui davvero, ' + b.luogo + '.',
            nota: b.chi + '. ' + b.esito
        };
    }

    const api = {
        YEAR_ZERO, YEARS_PER_TURN, FIRST_TURN, yearOfTurn, spanOfTurn, cityNameFor,
        foundCity, foundCapital, battlesOfTurn, battleEcho
    };

    root.Chronicle = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);

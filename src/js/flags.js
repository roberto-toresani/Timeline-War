// STEMMI ARALDICI dei regni (richiesta dell'utente: "una bandiera medievale di
// fianco al nome del regno"). Modulo PURO, nessun DOM e nessun file immagine: ogni
// arme è uno SCUDO SVG inline disegnato a mano, come i simboli delle pedine (#pc-…)
// e la grana della carta (map-decor). Si chiama con Flags.markup(nome, colore) e si
// inietta come innerHTML di fianco al nome, nei posti dove compare un regno
// (palette ed linguette dell'editor, intestazione del turno, "regni in gioco",
// schede della diplomazia, canali della chat).
//
// Le TINTURE sono fisse per regno (è araldica: l'Inghilterra è sempre croce rossa
// in campo d'argento, a prescindere dal colore-pedina che l'admin gli assegna sulla
// mappa). Il colore del giocatore serve SOLO al ripiego (un regno senza arme nota,
// es. "Giocatore 7"): lì il campo prende quel colore e sopra va l'iniziale.
//
// Chi aggiunge un regno storico aggiunge la sua voce in ARMS (per NOME esatto, come
// doctrines.js/objectives.js). Un regno senza voce ricade sul ripiego, senza errori.

(function (root) {
    'use strict';

    // Scudo "a goccia" (heater) nel riquadro 0 0 24 28. Tutto il campo e le figure
    // vengono ritagliati dentro questo profilo.
    const SHIELD = 'M2.4 2.4 H21.6 V13 C21.6 21.4 16.8 25 12 27.2 C7.2 25 2.4 21.4 2.4 13 Z';

    // Tinture (tinctures) araldiche.
    const T = {
        gules:  '#b11616',   // rosso
        gulesD: '#7e1515',   // rosso cupo (Bulgaria)
        azure:  '#1d4e8f',   // azzurro
        azureL: '#2a6bb0',   // azzurro cielo (Mongoli)
        teal:   '#1d8a84',   // turchese (Selgiuchidi)
        or:     '#e4b43a',   // oro (campo)
        orCh:   '#edca55',   // oro (figura su campo scuro/rosso)
        argent: '#f2ecda',   // argento / bianco
        sable:  '#1b1813',   // nero
        vert:   '#2f7d34',   // verde
        purpure:'#5e2a7e'
    };

    let seq = 0;

    // Avvolge le figure nello scudo: ritaglio + bordo scuro. `inner` è l'SVG delle
    // figure (campo compreso). `cls` e `px` dimensionano.
    function shield(inner, opts) {
        opts = opts || {};
        const id = 'flg' + (seq++);
        const cls = 'heraldry' + (opts.cls ? ' ' + opts.cls : '');
        let dim;
        if (opts.px) dim = 'width="' + Math.round(opts.px * 24 / 28) + '" height="' + opts.px + '"';
        else dim = 'width="1em" height="1.17em"';
        return '<svg class="' + cls + '" ' + dim + ' viewBox="0 0 24 28" ' +
            'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" ' +
            'style="vertical-align:-.22em;flex:0 0 auto;display:inline-block">' +
            '<defs><clipPath id="' + id + '"><path d="' + SHIELD + '"/></clipPath></defs>' +
            '<g clip-path="url(#' + id + ')">' + inner + '</g>' +
            '<path d="' + SHIELD + '" fill="none" stroke="#241c14" stroke-width="1.5" stroke-linejoin="round"/>' +
            '</svg>';
    }

    function field(color) {
        return '<rect x="0" y="0" width="24" height="28" fill="' + color + '"/>';
    }

    // ---- figure riusabili (charges) ------------------------------------------

    // Giglio di Francia, centrato in (cx,cy), altezza ~2.6*s.
    function fleur(cx, cy, s, fill) {
        const p =
            'M0,-6.5 C1.1,-4 3.1,-3.8 2.3,-1 C4.1,-2.4 5,0.1 2.6,1.3 L1.2,1.3 ' +
            'C1.7,3.1 1.7,5 0,6.6 C-1.7,5 -1.7,3.1 -1.2,1.3 L-2.6,1.3 ' +
            'C-5,0.1 -4.1,-2.4 -2.3,-1 C-3.1,-3.8 -1.1,-4 0,-6.5 Z';
        const band = 'M-3,2.3 L3,2.3 L2.5,3.7 L-2.5,3.7 Z';
        return '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')" fill="' + fill + '">' +
            '<path d="' + p + '"/><path d="' + band + '"/></g>';
    }

    // Castello di Castiglia (tre torri merlate + porta), centrato in (cx,cy).
    function castle(cx, cy, s, fill, doorFill) {
        const g =
            // corpo + porta
            '<path d="M-6,-1 H6 V6 H-6 Z"/>' +
            // merli del corpo
            '<path d="M-6,-1 V-3 H-4 V-1 H-2 V-3 H0 V-1 H2 V-3 H4 V-1 H6 V-1 Z"/>' +
            // torre centrale
            '<path d="M-2.4,-3 H2.4 V-7 H1.2 V-5.6 H0.6 V-7 H-0.6 V-5.6 H-1.2 V-7 H-2.4 Z"/>' +
            // torri laterali
            '<path d="M-6,-3 H-3 V-6 H-4 V-4.8 H-4.6 V-6 H-5 V-4.8 H-5.4 V-6 H-6 Z"/>' +
            '<path d="M6,-3 H3 V-6 H4 V-4.8 H4.6 V-6 H5 V-4.8 H5.4 V-6 H6 Z"/>';
        const door = '<path d="M-1.4,6 V1.4 C-1.4,0.2 1.4,0.2 1.4,1.4 V6 Z" fill="' + (doorFill || '#4a2f12') + '"/>';
        return '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')"><g fill="' + fill + '">' + g + '</g>' + door + '</g>';
    }

    // Mezzaluna (apertura verso l'alto), centrata in (cx,cy).
    function crescent(cx, cy, s, fill) {
        const p = 'M-5,-1.5 A5,5 0 1 0 5,-1.5 A6.4,6.4 0 1 1 -5,-1.5 Z';
        return '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')" fill="' + fill + '"><path d="' + p + '"/></g>';
    }

    // Stella a otto punte (due quadrati sovrapposti) — Selgiuchidi.
    function star8(cx, cy, r, fill) {
        const sq = 'M' + (-r) + ',0 L0,' + (-r) + ' L' + r + ',0 L0,' + r + ' Z';
        return '<g transform="translate(' + cx + ',' + cy + ')" fill="' + fill + '">' +
            '<path d="' + sq + '"/>' +
            '<g transform="rotate(45)"><path d="' + sq + '"/></g></g>';
    }

    // Tridente (tryzub) di Kiev.
    function trident(cx, cy, s, fill) {
        const p =
            'M-5,-6 L-4.2,-6 C-4,0 -2.6,2.2 -0.8,2.6 L-0.8,-4.5 L0.8,-4.5 L0.8,2.6 ' +
            'C2.6,2.2 4,0 4.2,-6 L5,-6 C5,2.2 2.8,5 0,5.2 C-2.8,5 -5,2.2 -5,-6 Z ' +
            'M-0.8,5.2 L0.8,5.2 L0.8,7.5 L-0.8,7.5 Z';
        return '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')" fill="' + fill + '"><path d="' + p + '"/></g>';
    }

    // Corona semplice a tre punte, centrata in (cx,cy).
    function crown(cx, cy, s, fill) {
        const p = 'M-4.5,2 L-5,-3 L-2.3,0 L0,-4 L2.3,0 L5,-3 L4.5,2 Z M-4.8,2.6 H4.8 V4 H-4.8 Z';
        return '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')" fill="' + fill + '"><path d="' + p + '"/></g>';
    }

    // Scudetto azzurro con cinque bisanti (una "quina" del Portogallo), centro (cx,cy).
    function quina(cx, cy, s, fill, dot) {
        const esc = 'M-2.6,-3 H2.6 V0.6 C2.6,2.6 1.2,3.6 0,4.2 C-1.2,3.6 -2.6,2.6 -2.6,0.6 Z';
        const dots = '<g fill="' + (dot || '#f2ecda') + '">' +
            '<circle cx="0" cy="-1.6" r="0.6"/><circle cx="0" cy="0.2" r="0.6"/>' +
            '<circle cx="-1" cy="-0.7" r="0.6"/><circle cx="1" cy="-0.7" r="0.6"/><circle cx="0" cy="1.9" r="0.55"/></g>';
        return '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')"><path d="' + esc + '" fill="' + fill + '"/>' + dots + '</g>';
    }

    // Aquila spiegata (displayed): si disegna la metà destra e si specchia. `heads`
    // = 1 (Polonia) o 2 (bicipite: Sacro Romano Impero). Centro asse x=12.
    function eagleHalf(fill) {
        // metà destra del corpo + ala (asse in x=0, poi traslata/ specchiata)
        return '<path d="M0,-4.2 C1,-5 2.2,-5 2.8,-4 L7.2,-5.2 C8.3,-5.4 8.7,-4.2 7.8,-3.5 ' +
            'L4,-1.8 L8.4,-1.6 C9.4,-1.5 9.4,-0.3 8.4,0 L4.2,1 L7.6,2.3 C8.5,2.7 8.2,3.9 7.2,3.8 ' +
            'L3,3 C3.3,4.8 3,6.6 2,7.8 L3.2,8.2 C3.8,8.5 3.6,9.5 2.8,9.5 L0,9.2 Z" fill="' + fill + '"/>';
    }
    function eagleHead(cx, dir, fill) {
        // testa coronata stilizzata con becco; dir=+1 verso destra, -1 verso sinistra
        return '<g transform="translate(' + cx + ',-5) scale(' + dir + ',1)" fill="' + fill + '">' +
            '<circle cx="0" cy="0" r="1.5"/>' +
            '<path d="M1.2,-0.4 L3.2,0.1 L1.2,1.1 Z"/></g>';
    }
    function eagleDisplayed(fill, heads) {
        const body = '<g transform="translate(12,13)">' + eagleHalf(fill) +
            '<g transform="scale(-1,1)">' + eagleHalf(fill) + '</g></g>';
        let h;
        if (heads === 2) h = eagleHead(12 - 2.4, -1, fill) /*→ sx*/ + eagleHead(12 + 2.4, 1, fill) /*→ dx, con transform locale*/;
        else h = eagleHead(12, 1, fill);
        // le teste sopra il corpo (asse y=13): rialzo
        return body + '<g transform="translate(0,13)">' + h + '</g>';
    }

    // Leone rampante stilizzato (profilo, rivolto a sinistra), centro ~ (12,14).
    // Riusato da Bulgaria e (con ascia) Norvegia.
    function lionRampant(fill) {
        const p =
            'M16.5,23 C15.2,20.5 15,18 15.6,15.6 L16.4,11.5 C16.9,8.8 16.2,6.6 14,5.6 ' +
            'C14.8,5 15,3.8 14.3,3.1 C13.6,2.5 12.5,2.8 12.2,3.7 ' +
            'C11,3 9.4,3.2 8.6,4.4 L6.2,4 C5.4,3.9 5,4.9 5.7,5.4 L7.4,6.2 ' +
            'C6.6,6.9 6.4,8 7,8.9 L5.2,9.2 C4.4,9.3 4.4,10.5 5.3,10.7 L7.9,10.9 ' +
            'C8.9,11.6 9.2,12.9 8.9,14.3 L8.1,17.8 C7.6,20 8.2,22.2 10,23.4 ' +
            'L9.4,24.6 L11.4,24.3 L12,22.4 C12.6,23.2 13.4,23.6 14.4,23.6 ' +
            'L14,24.9 L16,24.6 L16.2,22.9 C16.3,22.9 16.4,22.9 16.5,23 Z ' +
            'M18,9.5 L21,7.5 L20,10.5 Z';   // coda che si rialza dietro
        return '<path d="' + p + '" fill="' + fill + '" stroke="' + fill + '" stroke-width="0.3" stroke-linejoin="round"/>';
    }

    // Soyombo stilizzato (fiamma + sole + luna) per i Mongoli.
    function soyombo(cx, cy, s, fill) {
        return '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')" fill="' + fill + '">' +
            // fiamma a tre lingue
            '<path d="M0,-8.2 L1,-5.6 L-1,-5.6 Z M-2.3,-5 L-0.9,-5.6 L-1.5,-4 Z M2.3,-5 L0.9,-5.6 L1.5,-4 Z"/>' +
            '<circle cx="0" cy="-2.2" r="1.3"/>' +               // sole
            '<path d="M-3.4,2.4 A2.7,2.7 0 0 0 3.4,2.4 A3.7,3.7 0 0 1 -3.4,2.4 Z"/>' + // luna
            '</g>';
    }

    // ---- stemmi per regno -----------------------------------------------------
    // Ogni voce è una funzione che ritorna l'SVG interno (campo + figure).

    const ARMS = {
        'Regno di Inghilterra': function () {   // croce di San Giorgio
            return field(T.argent) +
                '<rect x="9.8" y="0" width="4.4" height="28" fill="' + T.gules + '"/>' +
                '<rect x="0" y="11.2" width="24" height="4.4" fill="' + T.gules + '"/>';
        },
        'Regno di Francia': function () {        // d'azzurro, tre gigli d'oro
            return field(T.azure) + fleur(9, 9, 0.8, T.orCh) + fleur(15, 9, 0.8, T.orCh) + fleur(12, 18.5, 0.8, T.orCh);
        },
        'Regno di Castiglia': function () {      // di rosso, castello d'oro
            return field(T.gules) + castle(12, 15, 1.08, T.orCh);
        },
        'Emirato dei Mori': function () {        // di verde, mezzaluna e stella d'oro
            return field(T.vert) + crescent(11.5, 15, 1.05, T.orCh) + star8(16, 9, 1.7, T.orCh);
        },
        'Sacro Romano Impero': function () {     // d'oro, aquila bicipite di nero
            return field(T.or) + eagleDisplayed(T.sable, 2);
        },
        'Ducato di Polonia': function () {       // di rosso, aquila d'argento
            return field(T.gules) + eagleDisplayed(T.argent, 1);
        },
        "Kievan Ru's": function () {             // d'azzurro, tridente d'oro
            return field(T.azure) + trident(12, 13.5, 1.15, T.orCh);
        },
        'Impero Bizantino': function () {        // di rosso, croce d'oro accantonata da 4 "B"
            const cross = '<rect x="10.1" y="4" width="3.8" height="19" fill="' + T.orCh + '"/>' +
                '<rect x="4" y="10.8" width="16" height="3.8" fill="' + T.orCh + '"/>';
            function beta(x, y) {
                return '<path d="M' + x + ',' + y + ' h1.6 a1,1 0 0 1 0,2 a1,1 0 0 1 0,2 h-1.6 Z" fill="' + T.orCh + '"/>';
            }
            return field(T.gules) + cross + beta(6.2, 6.3) + beta(15, 6.3) + beta(6.2, 15.4) + beta(15, 15.4);
        },
        'Ducato di Ungheria': function () {      // fasciato di 8 pezzi, rosso e argento (Árpád)
            let bars = '';
            for (let i = 0; i < 8; i++) {
                bars += '<rect x="0" y="' + (2 + i * 3.1) + '" width="24" height="3.1" fill="' +
                    (i % 2 ? T.argent : T.gules) + '"/>';
            }
            return bars;
        },
        'Califfato Abbaside': function () {      // vessillo nero (al-Musawwada), bordo e tratto d'oro
            return field(T.sable) +
                '<rect x="3.4" y="3.4" width="17.2" height="21" fill="none" stroke="' + T.orCh + '" stroke-width="0.9"/>' +
                '<rect x="10.9" y="7" width="2.2" height="13" fill="' + T.orCh + '"/>' +
                '<rect x="8.6" y="7" width="6.8" height="2" fill="' + T.orCh + '"/>';
        },
        'Mongoli': function () {                 // cielo, soyombo d'oro
            return field(T.azureL) + soyombo(12, 15, 1.1, T.orCh);
        },
        'Sultanato Selgiuchide': function () {   // turchese, stella a 8 punte d'oro
            return field(T.teal) + star8(12, 13.5, 6, T.orCh);
        },
        'Regno di Portogallo': function () {     // d'argento, cinque quine d'azzurro in croce
            return field(T.argent) +
                quina(12, 13.5, 0.95, T.azure) +
                quina(12, 6.2, 0.78, T.azure) + quina(12, 20.8, 0.78, T.azure) +
                quina(6.4, 12.4, 0.78, T.azure) + quina(17.6, 12.4, 0.78, T.azure);
        },
        'Regno di Bulgaria': function () {       // di rosso cupo, leone rampante d'oro
            return field(T.gulesD) + lionRampant(T.orCh);
        },
        'Regno di Norvegia': function () {       // bandiera norvegese: croce scandinava
            const RED = '#ba0c2f', WHITE = '#ffffff', BLUE = '#00205b';
            // croce bianca (larga) e azzurra (stretta) decentrate verso l'asta (sx).
            return field(RED) +
                '<rect x="7" y="0" width="5" height="28" fill="' + WHITE + '"/>' +
                '<rect x="0" y="10.5" width="24" height="5" fill="' + WHITE + '"/>' +
                '<rect x="8.2" y="0" width="2.6" height="28" fill="' + BLUE + '"/>' +
                '<rect x="0" y="11.7" width="24" height="2.6" fill="' + BLUE + '"/>';
        },
        'Regno di Svezia': function () {         // d'azzurro, tre corone d'oro
            return field(T.azure) + crown(9, 9.5, 0.82, T.orCh) + crown(15, 9.5, 0.82, T.orCh) + crown(12, 18.5, 0.82, T.orCh);
        }
    };

    // Ripiego per un regno senza arme nota (es. "Giocatore 7", regni creati a mano):
    // campo nel colore del giocatore, iniziale in bianco.
    function fallback(name, color) {
        const letter = (name && name.trim()[0] || '?').toUpperCase();
        const light = isLight(color);
        return field(color || '#888') +
            '<text x="12" y="16.5" text-anchor="middle" font-family="Cinzel, Georgia, serif" ' +
            'font-size="13" font-weight="700" fill="' + (light ? '#1b1813' : '#f2ecda') + '">' +
            escapeText(letter) + '</text>';
    }

    function isLight(hex) {
        if (!hex || hex[0] !== '#') return false;
        const h = hex.length === 4
            ? hex.slice(1).split('').map(c => parseInt(c + c, 16))
            : [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        return (0.299 * h[0] + 0.587 * h[1] + 0.114 * h[2]) > 150;
    }
    function escapeText(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // API: markup(nome, colore, opts) -> stringa SVG pronta da iniettare.
    function markup(name, color, opts) {
        const arm = ARMS[name];
        const inner = arm ? arm() : fallback(name, color);
        return shield(inner, opts || {});
    }

    const api = { markup, has: n => !!ARMS[n], SHIELD };
    root.Flags = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);

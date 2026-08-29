// ====================== MOTORE DI BATTAGLIA ======================
// Risoluzione di uno scontro fra due province, in base alle sole TRUPPE
// (pedine "soldato"): A = soldati impegnati dall'attaccante, D = soldati del
// difensore. Funzione PURA e senza dipendenze dal DOM: dati A, D (e un RNG
// opzionale) restituisce vincitore e perdite. La UI/aggancio ai click verra'
// costruita a parte; qui c'e' solo la matematica.
//
// Modello (vedi anche il regolamento §9):
//   Difesa effettiva  Deff = D + bonus struttura   (Citta'/Capitale +1, Fortezza +3;
//   sono esclusive, quindi al piu' uno). Le mura difendono anche a guarnigione vuota (D=0).
//   Probabilita' di vittoria dell'attaccante   P_A = A^k / (A^k + Deff^k)
//   L'esponente k amplifica il vantaggio numerico (chi e' piu' grande non e'
//   solo proporzionalmente favorito, ha un vantaggio extra) e lo decide il
//   TERRENO della provincia attaccata (js/terrain.js): k = 2.6 in pianura, dove
//   l'armata numerosa schiera tutti i suoi uomini; k = 1.4 fra monti, gole e
//   paludi, dove il fronte stretto annulla i numeri. Senza terreno k = 2, il
//   valore storico del gioco.
//   Esito:  u ~ U(0,1);  attaccante vince se  u < P_A,  altrimenti difensore.
//   L'attrito (perdite) si calcola sulle TRUPPE REALI (A, D), non su Deff: le mura
//   spostano la probabilita', non fanno vittime extra.
//   Incertezza  I = 4 P_A (1 - P_A)   (1 = 50/50, ~0 = esito quasi certo).
//
//   MERCENARI (§5.3): un mercenario e' un soldato a tutti gli effetti — presidio,
//   spostamenti, costi in soldati — TRANNE nel tiro di battaglia: e' pagato, non
//   giurato. Due effetti distinti, e la separazione E' il punto:
//     VALORE  rho medio 0.85: in linea vale meno di un suddito. Costo piccolo e
//             sempre presente, che sposta la MEDIA.
//     TENUTA  +/- 0.25: quanto renda davvero si sa solo sul campo. E' il prezzo
//             vero, e cresce solo con la QUOTA mercenaria — un'armata al 20% di
//             ventura oscilla del 5%, una tutta mercenaria del 25%.
//   Il tiro e' uno per SCHIERAMENTO (non uno per uomo): tiene il contingente o si
//   sfilaccia, non il singolo. Vale simmetrico anche in difesa, se no comprare
//   ventura per presidiare sarebbe gratis.
//     Truppe efficaci  A_eff = (A - mA) + mA*rho_A   e altrettanto per Deff
//     P_A = A_eff^k / (A_eff^k + Deff_eff^k)
//   Le PERDITE restano sulle truppe reali: la ventura sposta la probabilita', non
//   fa vittime extra — esattamente come le mura.
//
//   PERDITE — tutto ruota attorno all'EQUILIBRIO I = 4 P_A (1 - P_A) (0 = esito
//   scontato, 1 = perfetto 50/50): uno scontro serrato e' un bagno di sangue per
//   TUTTI, uno squilibrato costa poco a chi vince e polverizza chi perde. Ogni
//   media porta un tiro casuale (z ~ U(-1,1)) che garantisce imprevedibilita'
//   SEMPRE, anche in battaglia squilibrata; z sposta l'entita', non il vincitore.
//
//   Perdite del VINCITORE (W = sue truppe):
//     loss_W = WIN_LOSS_MIN + (WIN_LOSS_MAX - WIN_LOSS_MIN) * I
//     mu_f   = clamp( loss_W * (1 + CASUALTY_SPREAD * z), 0, 0.95 )
//     C = min(W - 1, round(W * mu_f))        (al vincitore resta sempre >= 1)
//   20-contro-13 (I alto) dissangua chi vince; 20-contro-5 (I basso) no.
//
//   Vince l'attaccante -> CONQUISTA: il difensore perde tutte le truppe,
//   l'attaccante conserva A - C ed entra nella provincia.
//   Vince il difensore -> l'attaccante RIPIEGA (non piu' annientato): perde una
//   FRAZIONE delle truppe impegnate, tanto piu' grande quanto piu' la battaglia
//   era pari — stessa direzione delle perdite del vincitore, non il contrario
//   (scala quindi con la taglia dell'armata):
//     loss_L = ROUT_LOSS_MIN + (ROUT_LOSS_MAX - ROUT_LOSS_MIN) * I
//     mu_l   = clamp( loss_L * (1 + CASUALTY_SPREAD * zr), 0, 0.95 )
//     persi  = max(1, round(A * mu_l))       (sconfitta = almeno un caduto)
//   Scontro sproporzionato perso -> pochi caduti (chi vince aveva pochi uomini
//   per far danno); scontro pari perso -> un bagno di sangue anche per chi
//   perde. Il difensore conserva D - C. (Lo sbarco §9.2 resta totale: la
//   ritirata la applica game-actions, solo all'attacco di terra.)

(function (root) {
    'use strict';

    function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

    // Esponente di default: nessun terreno = il valore storico del gioco.
    const DEFAULT_EXP = 2;

    // Probabilita' di vittoria dell'attaccante, sola. E' l'UNICO posto in cui la
    // formula vive: il pronostico della plancia e quello del bot chiamano qui,
    // cosi' quel che si promette al giocatore e quel che poi succede non possono
    // divergere. Deff = difensori + bonus struttura; k = esponente del terreno.
    function winChance(A, Deff, k) {
        A = Math.max(0, A);
        Deff = Math.max(0, Deff);
        if (A <= 0) return 0;
        k = (k > 0) ? k : DEFAULT_EXP;
        const a = Math.pow(A, k), d = Math.pow(Deff, k);
        return a / (a + d);        // A>0 => denominatore > 0 (Deff=0 => 1)
    }

    // ====================== MERCENARI (§5.3) ======================
    // Le due manopole della ventura. Sono QUI e non sparse: chi vuole mercenari
    // piu' leggeri alza MERC_VALUE e abbassa MERC_SPREAD, e non deve toccare
    // altro — pronostico della plancia e testa dell'IA leggono da qui.
    const MERC_VALUE = 0.85;    // quanto vale in linea un mercenario, in media
    const MERC_SPREAD = 0.25;   // di quanto quel valore puo' scartare, sul campo
    const MERC_MIN = MERC_VALUE - MERC_SPREAD;
    const MERC_MAX = MERC_VALUE + MERC_SPREAD;

    // ====================== PERDITE E RITIRATA (§9) ======================
    // Le manopole delle perdite, tutte qui. Tutto ruota attorno all'EQUILIBRIO
    // della battaglia I = 4*P_A*P_D (0 = esito scontato, 1 = perfetto 50/50):
    // uno scontro serrato e' un bagno di sangue per TUTTI, uno squilibrato costa
    // poco a chi vince e polverizza chi perde.
    //
    // 1) Perdite del VINCITORE: frazione media persa, cresce con I. Lopsided
    //    (I->0) la porta a casa quasi intatta; battaglia pari (I->1) resta con
    //    un pugno di uomini. Cosi' 20-contro-13 dissangua chi vince, 20-contro-5 no.
    const WIN_LOSS_MIN = 0.10;  // frazione persa dal vincitore in uno scontro scontato
    const WIN_LOSS_MAX = 0.80;  // ...e in un perfetto 50/50
    // 2) Perdite dell'attaccante SCONFITTO (ripiega, non e' annientato): frazione
    //    media che NON torna a casa, cresce con l'EQUILIBRIO I come le perdite
    //    del vincitore (§ sopra) — non il contrario. Un piccolo che sbaraglia un
    //    grande non puo' infliggergli piu' morti di quanti uomini abbia lui
    //    stesso da menare le mani: se lo scontro era nettamente sproporzionato
    //    sulla carta (I basso), la sconfitta e' rapida e pulita per ENTRAMBI —
    //    il perdente si ritira con poche perdite, non annientato da un pugno di
    //    difensori. Solo uno scontro alla pari (I alto), vinto o perso, e' un
    //    bagno di sangue per tutti. E' una FRAZIONE, cosi' scala con la taglia
    //    dell'armata.
    const ROUT_LOSS_MIN = 0.10; // frazione persa in una sconfitta netta (scontro sproporzionato)
    const ROUT_LOSS_MAX = 0.70; // ...e in uno scontro alla pari perso
    // 3) Ampiezza casuale attorno a OGNI media (z ~ U(-1,1)): garantisce
    //    imprevedibilita' SEMPRE, anche in una battaglia squilibrata.
    const CASUALTY_SPREAD = 0.35;

    // Resa del contingente di ventura per un tiro z ~ U(-1,1).
    function mercYield(z) { return clamp(MERC_VALUE + MERC_SPREAD * z, 0, 2); }

    // Truppe EFFICACI: i regolari valgono 1, i mercenari `rho`. Funziona anche su
    // Deff (= difensori + mura): si toglie merc*(1-rho), e le mura non sono uomini
    // di ventura, quindi non ne vengono toccate.
    function effective(n, merc, rho) {
        n = Math.max(0, n);
        merc = clamp(merc || 0, 0, n);
        return Math.max(0, n - merc * (1 - rho));
    }

    // Punti di quadratura sulla U(-1,1) (regola del punto medio, 5 celle): serve a
    // fare la media della PROBABILITA', non la probabilita' della media — con un
    // esponente le due cose non coincidono.
    const QUAD = [-0.8, -0.4, 0, 0.4, 0.8];

    // PRONOSTICO ONESTO. Con dei mercenari in campo la risposta non e' un numero
    // ma una banda: `p` e' la media (quel che si promette al giocatore), `min` e
    // `max` gli estremi (quel che si rischia). Senza mercenari i tre valori
    // coincidono e si torna esattamente a winChance. E' l'unico posto da cui
    // plancia e IA leggono un pronostico: se divergessero, il gioco mentirebbe.
    function winForecast(A, Deff, k, mercA, mercD) {
        A = Math.max(0, A); Deff = Math.max(0, Deff);
        mercA = clamp(Math.floor(mercA || 0), 0, A);
        mercD = clamp(Math.floor(mercD || 0), 0, Deff);
        if (!mercA && !mercD) {
            const p = winChance(A, Deff, k);
            return { p: p, min: p, max: p, banda: 0, mercA: 0, mercD: 0 };
        }
        let s = 0;
        for (let i = 0; i < QUAD.length; i++) {
            const ea = effective(A, mercA, mercYield(QUAD[i]));
            for (let j = 0; j < QUAD.length; j++) {
                s += winChance(ea, effective(Deff, mercD, mercYield(QUAD[j])), k);
            }
        }
        // Il caso peggiore e' la mia ventura che si sfalda MENTRE regge la sua.
        const min = winChance(effective(A, mercA, MERC_MIN), effective(Deff, mercD, MERC_MAX), k);
        const max = winChance(effective(A, mercA, MERC_MAX), effective(Deff, mercD, MERC_MIN), k);
        return {
            p: s / (QUAD.length * QUAD.length),
            min: min, max: max, banda: max - min,
            mercA: mercA, mercD: mercD
        };
    }

    // Risolve una battaglia. rng() opzionale: deve restituire U(0,1) (default
    // Math.random); iniettabile per test deterministici. `esponente` viene dal
    // terreno della provincia attaccata (Terrain.exponent); omesso vale 2.
    // Restituisce null se non c'e' battaglia possibile (nessuna truppa da
    // entrambe le parti). Tutti i valori casuali e intermedi vengono restituiti
    // per trasparenza/log.
    function resolveBattle(A, D, fort, rng, esponente, mercA, mercD) {
        // Retro-compat: se il 3o argomento e' una funzione, e' il rng (nessun bonus).
        if (typeof fort === 'function') { rng = fort; fort = 0; }
        rng = rng || Math.random;
        A = Math.max(0, Math.floor(A));
        D = Math.max(0, Math.floor(D));
        fort = Math.max(0, Math.floor(fort || 0)); // bonus difensivo: Citta'/Capitale +1, Fortezza +3
        const k = (esponente > 0) ? esponente : DEFAULT_EXP;
        if (A === 0) return null;                   // niente attacco senza truppe impegnate

        // Difensori "virtuali": le mura difendono anche a guarnigione vuota (D=0).
        const Deff = D + fort;

        // La ventura tira la sua TENUTA, un tiro per schieramento. Si tira SOLO se
        // ce n'e': senza mercenari la sequenza casuale resta identica a prima,
        // quindi i test con rng iniettato non cambiano di una virgola.
        mercA = clamp(Math.floor(mercA || 0), 0, A);
        mercD = clamp(Math.floor(mercD || 0), 0, D);
        const rhoA = mercA ? mercYield(rng() * 2 - 1) : 1;
        const rhoD = mercD ? mercYield(rng() * 2 - 1) : 1;
        const Aeff = effective(A, mercA, rhoA);
        const DeffM = effective(Deff, mercD, rhoD);

        const P_A = winChance(Aeff, DeffM, k);
        const P_D = 1 - P_A;
        const I = 4 * P_A * P_D;

        const u = rng();
        const attackerWins = u < P_A;

        // Vincitore in termini di truppe iniziali.
        const W = attackerWins ? A : D;

        // Perdite del VINCITORE: frazione media legata all'EQUILIBRIO I, piu' un
        // tiro casuale che garantisce imprevedibilita' anche in uno scontro
        // squilibrato. Piu' la battaglia e' pari, piu' anche chi vince si dissangua.
        const z = rng() * 2 - 1;                             // U(-1,1)
        const lossW = WIN_LOSS_MIN + (WIN_LOSS_MAX - WIN_LOSS_MIN) * I;
        const muF = clamp(lossW * (1 + CASUALTY_SPREAD * z), 0, 0.95);
        const C = Math.min(W - 1, Math.round(W * muF));      // vincitore tiene >= 1
        const winnerSurvivors = W - C;

        // ESITO PER I DUE SCHIERAMENTI.
        //   Vince l'attaccante -> CONQUISTA: il difensore e' spazzato via (la
        //   provincia cambia mano, non puo' restare presidiata dal vinto).
        //   Vince il difensore -> l'attaccante RIPIEGA, non e' piu' annientato:
        //   perde una FRAZIONE delle truppe impegnate, tanto piu' grande quanto
        //   piu' la battaglia era equilibrata — stessa logica delle perdite del
        //   vincitore (§ sopra), non il contrario: uno scontro nettamente
        //   sproporzionato e' una sconfitta rapida e pulita anche per chi perde.
        //   Almeno un caduto sempre; la rotta totale (0 superstiti) esce solo
        //   nella coda alta di `I`, quindi di rado. E' game-actions a riportare i
        //   superstiti alla provincia di partenza; lo sbarco resta totale (§9.2).
        let attackerSurvivors, defenderSurvivors, zr = 0, lossL = 0, muL = 0;
        if (attackerWins) {
            attackerSurvivors = winnerSurvivors;
            defenderSurvivors = 0;
        } else {
            defenderSurvivors = winnerSurvivors;
            zr = rng() * 2 - 1;                              // U(-1,1), tiro della ritirata
            lossL = ROUT_LOSS_MIN + (ROUT_LOSS_MAX - ROUT_LOSS_MIN) * I;
            muL = clamp(lossL * (1 + CASUALTY_SPREAD * zr), 0, 0.95);
            const lost = Math.max(1, Math.round(A * muL));   // sconfitta = almeno un caduto
            attackerSurvivors = Math.max(0, A - lost);
        }

        return {
            attackerWins: attackerWins,
            winner: attackerWins ? 'attacker' : 'defender',
            attackerSurvivors: attackerSurvivors,
            defenderSurvivors: defenderSurvivors,
            losses: C,                 // truppe perse dal vincitore
            // Valori diagnostici (utili per log/animazioni/bilanciamento):
            fort: fort, Deff: Deff, esponente: k,
            // Ventura (§5.3): quanti erano e quanto hanno reso. Il rapporto di
            // battaglia li mostra — e' la parte di esito che il giocatore non
            // puo' dedurre da solo.
            mercA: mercA, mercD: mercD, rhoA: rhoA, rhoD: rhoD,
            Aeff: Aeff, DeffMerc: DeffM,
            P_A: P_A, P_D: P_D, I: I,
            u: u, z: z, zr: zr,
            lossW: lossW, muF: muF, lossL: lossL, muL: muL
        };
    }

    const api = {
        resolveBattle: resolveBattle, winChance: winChance, winForecast: winForecast,
        mercYield: mercYield, effective: effective, clamp: clamp,
        DEFAULT_EXP: DEFAULT_EXP,
        MERC_VALUE: MERC_VALUE, MERC_SPREAD: MERC_SPREAD, MERC_MIN: MERC_MIN, MERC_MAX: MERC_MAX
    };

    // Espone sia come global browser (window.RisikoBattle) sia come modulo Node
    // (per test da riga di comando), senza build step.
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.RisikoBattle = api;
})(typeof window !== 'undefined' ? window : this);

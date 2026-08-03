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
//   Probabilita' di vittoria dell'attaccante   P_A = A^2 / (A^2 + Deff^2)
//   Il quadrato amplifica il vantaggio numerico (chi e' piu' grande non e'
//   solo proporzionalmente favorito, ha un vantaggio extra).
//   Esito:  u ~ U(0,1);  attaccante vince se  u < P_A,  altrimenti difensore.
//   L'attrito (perdite) si calcola sulle TRUPPE REALI (A, D), non su Deff: le mura
//   spostano la probabilita', non fanno vittime extra.
//   Incertezza  I = 4 P_A (1 - P_A)   (1 = 50/50, ~0 = esito quasi certo).
//
//   Perdite MEDIE del vincitore (W = truppe del vincitore, L = del perdente):
//     mu_base   = 0.8 * L / (W + L)          cresce se le forze sono simili
//     mu_attrito = 0.03 * ln(1 + A/10)       solo se vince l'attaccante
//                = 0                          se vince il difensore
//     mu = mu_base + mu_attrito              (attrito anti-snowball)
//   Variabilita':  z ~ U(-1,1)
//     mu_f = clamp( mu * (1 + 0.2 * I * z), 0, 0.95 )
//   z sposta solo l'entita' delle perdite, non il vincitore. Con battaglia
//   equilibrata (I alto) le perdite oscillano di piu'; sbilanciata (I basso)
//   restano vicine alla media.
//
//   Truppe perse dal vincitore:  C = min(W - 1, round(W * mu_f))
//   (il "-1" garantisce che al vincitore resti almeno 1 truppa).
//   Vince l'attaccante -> il difensore perde tutte le truppe, l'attaccante
//   conserva A - C. Vince il difensore -> l'attaccante perde tutte le truppe
//   impegnate, il difensore conserva D - C.

(function (root) {
    'use strict';

    function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

    // Risolve una battaglia. rng() opzionale: deve restituire U(0,1) (default
    // Math.random); iniettabile per test deterministici. Restituisce null se
    // non c'e' battaglia possibile (nessuna truppa da entrambe le parti).
    // Tutti i valori casuali e intermedi vengono restituiti per trasparenza/log.
    function resolveBattle(A, D, fort, rng) {
        // Retro-compat: se il 3o argomento e' una funzione, e' il rng (nessun bonus).
        if (typeof fort === 'function') { rng = fort; fort = 0; }
        rng = rng || Math.random;
        A = Math.max(0, Math.floor(A));
        D = Math.max(0, Math.floor(D));
        fort = Math.max(0, Math.floor(fort || 0)); // bonus difensivo: Citta'/Capitale +1, Fortezza +3
        if (A === 0) return null;                   // niente attacco senza truppe impegnate

        // Difensori "virtuali": le mura difendono anche a guarnigione vuota (D=0).
        const Deff = D + fort;
        const a2 = A * A, d2 = Deff * Deff;
        const P_A = a2 / (a2 + d2);   // A>0 => denominatore > 0 (D=0 e fort=0 => P_A=1)
        const P_D = 1 - P_A;
        const I = 4 * P_A * P_D;

        const u = rng();
        const attackerWins = u < P_A;

        // Vincitore / perdente in termini di truppe iniziali.
        const W = attackerWins ? A : D;
        const L = attackerWins ? D : A;

        const muBase = 0.8 * (L / (W + L));                 // W+L = A+D > 0
        const muAttrito = attackerWins ? 0.03 * Math.log(1 + A / 10) : 0;
        const mu = muBase + muAttrito;

        const z = rng() * 2 - 1;                             // U(-1,1)
        const muF = clamp(mu * (1 + 0.2 * I * z), 0, 0.95);

        const C = Math.min(W - 1, Math.round(W * muF));      // vincitore tiene >= 1
        const survivors = W - C;

        return {
            attackerWins: attackerWins,
            winner: attackerWins ? 'attacker' : 'defender',
            attackerSurvivors: attackerWins ? survivors : 0,
            defenderSurvivors: attackerWins ? 0 : survivors,
            losses: C,                 // truppe perse dal vincitore
            // Valori diagnostici (utili per log/animazioni/bilanciamento):
            fort: fort, Deff: Deff,
            P_A: P_A, P_D: P_D, I: I,
            u: u, z: z,
            muBase: muBase, muAttrito: muAttrito, mu: mu, muF: muF
        };
    }

    const api = { resolveBattle: resolveBattle, clamp: clamp };

    // Espone sia come global browser (window.RisikoBattle) sia come modulo Node
    // (per test da riga di comando), senza build step.
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.RisikoBattle = api;
})(typeof window !== 'undefined' ? window : this);

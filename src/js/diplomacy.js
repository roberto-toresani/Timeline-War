// ============================================================
// DIPLOMAZIA — i PATTI fra regni, e il fatto che si possono ROMPERE.
//
// "Come ogni bel gioco di strategia si possono fare accordi, e si può sempre
//  mentire" (regola dell'utente). Come le richieste di commercio, un regno può
//  proporre a un altro (che vede, anche solo tramite una spia) uno di CINQUE
//  patti, di peso diverso:
//
//   alleanza          — dà TUTTI i privilegi; senza scadenza. Romperla costa
//                       PRESTIGIO (§10): la parola data pesa.
//   alleanzaTempo     — come l'alleanza ma dura DIPLO.TIMED turni e poi scade
//                       da sé (scadenza = gratis; romperla PRIMA = costo pieno).
//   nonBelligeranza   — non vi attaccate. Leggero: si rompe SENZA costo.
//   rinforzi          — accesso militare: rinforzi/passaggio fra i territori.
//                       Leggero, rottura gratis.
//   vista             — vi vedete oltre la nebbia. Leggero, rottura gratis.
//
// I patti leggeri costano poco a impegnarsi e niente a sciogliersi: è il loro
// vantaggio. Solo l'alleanza dà tutto, e solo lei fa perdere prestigio se
// tradita. In più, un alleato può CONCEDERE all'altro di attaccare un suo
// territorio: con quel consenso l'attacco non rompe il patto e non costa nulla.
//
// Questo file è PURO come popularity.js/terrain.js: conosce i patti e i loro
// PRIVILEGI, non muta lo stato e non tocca il DOM. Chi stringe/rompe passa da
// game-actions.js (unico mutatore); i bot ragionano in bot.js; la plancia
// mostra in player-board.js. Una fonte sola, come RisikoBattle.winChance.
//
// DOVE VIVONO: un patto è MUTUO, quindi sta su ENTRAMBI i record
// (`player.patti = [{tipo, con, dal, scad}]`), scritto in un colpo dalle
// funzioni di game-actions (come recordTrade scrive da tutti e due i lati).
// Nessun campo globale da infilare in sync: viaggiano coi giocatori.
// ============================================================

(function (root) {
    'use strict';

    const TYPES = ['alleanza', 'alleanzaTempo', 'nonBelligeranza', 'rinforzi', 'vista'];
    const LABEL = {
        alleanza: 'Alleanza',
        alleanzaTempo: 'Alleanza a tempo',
        nonBelligeranza: 'Patto di non belligeranza',
        rinforzi: 'Invio di rinforzi',
        vista: 'Condivisione della vista'
    };

    const TIMED = 5;            // durata dell'alleanza a tempo, in turni
    const BREAK_PRESTIGE = 2;   // prestigio perso rompendo un'alleanza (§10)

    // I PRIVILEGI che ogni patto concede. Un'alleanza (piena o a tempo) li dà
    // tutti; ogni patto leggero ne dà uno solo. Chi aggiunge un privilegio lo
    // mette qui, in un posto solo.
    //   nonAgg    → non ci si può attaccare (senza consenso/tradimento)
    //   vista     → visione condivisa oltre la nebbia (§9.2)
    //   rinforzi  → accesso militare: rinforzi/passaggio fra i territori
    const FULL = ['nonAgg', 'vista', 'rinforzi'];
    const GRANTS = {
        alleanza: FULL,
        alleanzaTempo: FULL,
        nonBelligeranza: ['nonAgg'],
        rinforzi: ['rinforzi'],
        vista: ['vista']
    };

    function sameId(a, b) { return String(a) === String(b); }
    function isFullAlliance(tipo) { return tipo === 'alleanza' || tipo === 'alleanzaTempo'; }
    // Solo la rottura di un'alleanza costa prestigio; i patti leggeri no.
    function costsPrestige(tipo) { return isFullAlliance(tipo); }

    function pactsList(player) {
        return Array.isArray(player && player.patti) ? player.patti : [];
    }
    // I patti che questo regno ha con `partnerId`. La lista è mutua, quindi per
    // una coppia basta guardare un lato; le funzioni difensive uniscono i due.
    function pactsWith(player, partnerId) {
        return pactsList(player).filter(p => sameId(p.con, partnerId));
    }
    function hasPactType(player, partnerId, tipo) {
        return pactsWith(player, partnerId).some(p => p.tipo === tipo);
    }
    function hasPrivilege(player, partnerId, priv) {
        return pactsWith(player, partnerId).some(p => (GRANTS[p.tipo] || []).indexOf(priv) >= 0);
    }

    // Le tre domande che il resto del gioco pone (simmetriche: basta che UNO dei
    // due lati porti il privilegio — le liste dovrebbero combaciare, ma si legge
    // difensivo).
    function grantsNonAggression(a, b) {
        if (!a || !b || sameId(a.id, b.id)) return false;
        return hasPrivilege(a, b.id, 'nonAgg') || hasPrivilege(b, a.id, 'nonAgg');
    }
    function sharesVision(a, b) {
        if (!a || !b || sameId(a.id, b.id)) return false;
        return hasPrivilege(a, b.id, 'vista') || hasPrivilege(b, a.id, 'vista');
    }
    function allowsReinforce(a, b) {
        if (!a || !b || sameId(a.id, b.id)) return false;
        return hasPrivilege(a, b.id, 'rinforzi') || hasPrivilege(b, a.id, 'rinforzi');
    }
    // Alleanza PIENA (piena o a tempo) fra i due: è quella che, tradita, costa
    // prestigio e fa scattare la "guerra coordinata" dei bot.
    function areAllied(a, b) {
        if (!a || !b || sameId(a.id, b.id)) return false;
        return pactsWith(a, b.id).some(p => isFullAlliance(p.tipo)) ||
               pactsWith(b, a.id).some(p => isFullAlliance(p.tipo));
    }

    // I regni con cui c'è un patto di NON aggressione (per i controlli d'attacco
    // e per la lista in plancia), dato l'elenco di tutti i giocatori.
    function partnersOf(player, allPlayers, priv) {
        if (!player || !Array.isArray(allPlayers)) return [];
        return allPlayers.filter(p => p && !sameId(p.id, player.id) &&
            (priv ? hasPrivilege(player, p.id, priv) || hasPrivilege(p, player.id, priv)
                  : pactsWith(player, p.id).length > 0));
    }
    function alliesOf(player, allPlayers) {
        if (!player || !Array.isArray(allPlayers)) return [];
        return allPlayers.filter(p => p && !sameId(p.id, player.id) && areAllied(player, p));
    }

    // Si può proporre `tipo` da `from` a `to`? (regola pura; turno/visibilità li
    // controllano il chiamante e la UI.) Niente doppioni dello stesso patto, e
    // niente patti se c'è già un'alleanza piena (dà già tutto).
    function canPropose(from, to, tipo) {
        if (!from || !to || sameId(from.id, to.id)) return { ok: false, msg: 'Regno non valido.' };
        if (TYPES.indexOf(tipo) < 0) return { ok: false, msg: 'Tipo di patto sconosciuto.' };
        if (hasPactType(from, to.id, tipo)) return { ok: false, msg: 'Avete già questo patto.' };
        if (areAllied(from, to)) return { ok: false, msg: 'Siete già alleati: l\'alleanza concede tutto.' };
        return { ok: true };
    }

    root.Diplomacy = {
        TYPES, LABEL, TIMED, BREAK_PRESTIGE, GRANTS,
        isFullAlliance, costsPrestige,
        pactsList, pactsWith, hasPactType, hasPrivilege,
        grantsNonAggression, sharesVision, allowsReinforce, areAllied,
        partnersOf, alliesOf, canPropose
    };
})(typeof window !== 'undefined' ? window : this);

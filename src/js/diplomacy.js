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

    // ============================================================
    // IL LIVELLO DI RAPPORTO (richiesta dell'utente: "il livello di rapporto che
    // c'è tra i regni").
    //
    // Non è un campo nuovo nello stato, e non deve esserlo: il gioco REGISTRA
    // GIÀ tutto quel che serve a dire come stanno fra loro due regni — i patti
    // in essere, gli scambi andati a buon fine (`commerciStorico`), le province
    // preziose strappate (`rancore`), gli avvisi di patto rotto o tradito
    // (`pattiAvvisi`), i consensi concessi (`permessiAttacco`). Qui quei fatti
    // si sommano in un solo numero, da −100 (guerra aperta) a +100 (fratelli).
    //
    // È il PUNTO DI VISTA DI `me` SU `other`: legge solo il registro di `me`,
    // quindi non svela niente che il giocatore non sappia già. E resta puro come
    // il resto del file: nessuna mutazione, nessun DOM. Chi la mostra è
    // renderRelations in player-board.js; chi volesse farla pesare all'IA la
    // legge da qui, non se la ricalcola.
    //
    // Ogni voce porta con sé il PERCHÉ: il pannello non mostra un numero calato
    // dall'alto, mostra i fatti che lo compongono.
    // ============================================================
    const PACT_WEIGHT = {
        alleanza: 50,
        alleanzaTempo: 40,
        nonBelligeranza: 20,
        rinforzi: 15,
        vista: 15
    };
    const LEVELS = [
        { min: 45,  key: 'allied',  label: 'Alleati' },
        { min: 15,  key: 'warm',    label: 'Amichevoli' },
        { min: -15, key: 'neutral', label: 'Neutrali' },
        { min: -45, key: 'tense',   label: 'Tesi' },
        { min: -Infinity, key: 'hostile', label: 'Ostili' }
    ];

    function levelOf(score) {
        return LEVELS.find(l => score >= l.min) || LEVELS[LEVELS.length - 1];
    }

    function standing(me, other, ctx) {
        const why = [];
        const add = (delta, txt) => { if (delta) why.push({ delta, txt }); };
        const cap = (n, max) => Math.max(-max, Math.min(max, n));
        const opts = ctx || {};
        if (!me || !other) return { score: 0, level: 'neutral', label: 'Neutrali', why };

        // 1. I patti in essere: è il fatto che pesa di più, ed è l'unico che
        //    entrambi hanno firmato.
        pactsWith(me, other.id).forEach(p => {
            add(PACT_WEIGHT[p.tipo] || 10, LABEL[p.tipo] || p.tipo);
        });

        // 2. Gli scambi CONCLUSI: ogni carovana arrivata è fiducia guadagnata.
        const scambi = (Array.isArray(me.commerciStorico) ? me.commerciStorico : [])
            .filter(h => String(h.conId) === String(other.id)).length;
        add(cap(scambi * 7, 28), scambi === 1 ? '1 scambio concluso' : scambi + ' scambi conclusi');

        // 3. I consensi che gli hai concesso: passaggio d'armi dato e non tradito.
        const consensi = (Array.isArray(me.permessiAttacco) ? me.permessiAttacco : [])
            .filter(x => String(x.chi) === String(other.id)).length;
        add(cap(consensi * 4, 8), consensi === 1 ? '1 consenso concesso' : consensi + ' consensi concessi');

        // 4. Il RANCORE: le province preziose che ti ha strappato. `g.chi` è il
        //    NOME di chi le ha prese (così lo scrive recordGrudge).
        const torti = (Array.isArray(me.rancore) ? me.rancore : [])
            .filter(g => g.chi === other.name);
        const peso = torti.reduce((s, g) => s + (g.peso || 1), 0);
        add(-cap(peso * 9, 45), torti.length === 1 ? '1 provincia strappata' : torti.length + ' province strappate');

        // 5. La parola data e ripresa: patti rotti e, peggio, traditi.
        const avvisi = (Array.isArray(me.pattiAvvisi) ? me.pattiAvvisi : [])
            .filter(a => a.conNome === other.name);
        const traditi = avvisi.filter(a => a.tipo === 'tradito').length;
        const rotti = avvisi.filter(a => a.tipo === 'rotto').length;
        add(-cap(traditi * 30, 60), traditi === 1 ? 'ti ha tradito' : traditi + ' tradimenti');
        add(-cap(rotti * 14, 42), rotti === 1 ? '1 patto sciolto da lui' : rotti + ' patti sciolti da lui');

        // 6. Confinare senza nessun accordo è di per sé una tensione: due eserciti
        //    che si guardano. Vale poco, ma vale.
        if (opts.confinanti && !pactsWith(me, other.id).length) {
            add(-6, 'confinate senza accordi');
        }

        const score = Math.max(-100, Math.min(100, why.reduce((s, w) => s + w.delta, 0)));
        const lv = levelOf(score);
        return { score, level: lv.key, label: lv.label, why };
    }

    root.Diplomacy = {
        TYPES, LABEL, TIMED, BREAK_PRESTIGE, GRANTS,
        isFullAlliance, costsPrestige,
        pactsList, pactsWith, hasPactType, hasPrivilege,
        grantsNonAggression, sharesVision, allowsReinforce, areAllied,
        partnersOf, alliesOf, canPropose,
        // il livello di rapporto e i fatti che lo compongono
        standing, LEVELS
    };
})(typeof window !== 'undefined' ? window : this);

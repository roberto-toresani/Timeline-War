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
    // in essere, la FEDE delle due corone, gli scambi andati a buon fine
    // (`commerciStorico`), i rinforzi ricevuti (`aiuti`), le armi che ti ha
    // portato addosso (`aggressioni`: province strappate E colpi respinti), gli
    // avvisi di patto rotto o tradito (`pattiAvvisi`), i consensi concessi
    // (`permessiAttacco`). Qui quei fatti si sommano in un solo numero, da −100
    // (guerra aperta) a +100 (fratelli), e il TEMPO li sbiadisce (fade): una
    // guerra di tre cicli fa non deve condannare due regni per sempre.
    //
    // `ctx` porta quel che il modulo puro non può leggere da sé:
    //   { confinanti, turno, fedeMia, fedeSua }
    // — le fedi sono le religioni di STATO (Risiko.stateReligionOf), cioè quelle
    // delle due Capitali: diplomacy.js non guarda la mappa, come popularity.js
    // non la misura.
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

    // LA FEDE (regola dell'utente: "due regni che hanno la stessa religione
    // partono più amici del normale ma non alleati"). È l'unica voce che vale
    // PRIMA di qualsiasi fatto: due corone della stessa confessione si guardano
    // con simpatia dal giorno zero, e restano comunque a metà strada dai patti —
    // due corone della stessa confessione bastano a partire 'Amichevoli' (+18,
    // appena sopra la soglia), ma 'Alleati' resta irraggiungibile senza firmare
    // qualcosa — e un confine senza accordi le riporta comunque a 'Neutrali'.
    // Fedi sorelle (cattolici/ortodossi, sunniti/sciiti: stessa FAMIGLIA,
    // confessione diversa) valgono metà; fedi di famiglie diverse sono un
    // sospetto di partenza, non un'ostilità.
    const FAITH_SAME = 18, FAITH_KIN = 9, FAITH_ALIEN = -10;

    // GLI AIUTI RICEVUTI: ogni drappello che un alleato ti ha mandato al fronte
    // (§Diplomazia, rinforzi). Vale più di una carovana — sono uomini, non merce.
    const HELP_WEIGHT = 9, HELP_CAP = 27;

    // LE AGGRESSIONI SUBITE: le province strappate e i colpi respinti. Una presa
    // pesa quanto valeva la provincia (grudgeWorth: Capitale 3, Città/Fortezza 2,
    // risorsa 1, spoglia 0 → resta comunque il torto di base); un attacco
    // RESPINTO è meno grave ma non si dimentica: è pur sempre un esercito
    // arrivato al confine.
    const AGGRO_BASE = 6, AGGRO_PER_PESO = 5, AGGRO_CAP = 50;
    const RAID_WEIGHT = 5, RAID_CAP = 20;

    // IL TEMPO SBIADISCE (ma non cancella): un decennio dopo il torto brucia
    // ancora tutto, dopo due meno della metà, poi resta la cicatrice. Serve a far
    // sì che due regni che si sono fatti la guerra tre cicli fa possano tornare a
    // parlarsi — se no il rapporto sarebbe una condanna a vita.
    function fade(turno, quando) {
        if (!(turno > 0) || !(quando > 0)) return 1;
        const eta = Math.max(0, turno - quando);
        if (eta <= 10) return 1;
        if (eta <= 20) return 0.6;
        return 0.35;
    }
    // La fede di due regni: 'stessa' | 'sorella' | 'estranea' | null (uno dei due
    // non ha religione di stato, cioè non ha Capitale). La famiglia la sa
    // js/religions.js, che è l'unica fonte di quella parentela.
    function faithTie(a, b) {
        if (!a || !b) return null;
        if (String(a) === String(b)) return 'stessa';
        const Rel = root.Religions;
        if (Rel && Rel.sameFamily && Rel.sameFamily(a, b)) return 'sorella';
        return 'estranea';
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

        // 2. LA FEDE, il fatto che vale prima di tutti gli altri. Le confessioni
        //    arrivano dal chiamante (ctx.fedeMia/ctx.fedeSua = Risiko.stateReligionOf):
        //    diplomacy.js non legge la mappa, come popularity.js non la misura.
        const tie = faithTie(opts.fedeMia, opts.fedeSua);
        if (tie === 'stessa') add(FAITH_SAME, 'stessa fede');
        else if (tie === 'sorella') add(FAITH_KIN, 'fedi sorelle');
        else if (tie === 'estranea') add(FAITH_ALIEN, 'fedi di famiglie diverse');

        // 3. Gli scambi CONCLUSI: ogni carovana arrivata è fiducia guadagnata.
        const scambi = (Array.isArray(me.commerciStorico) ? me.commerciStorico : [])
            .filter(h => String(h.conId) === String(other.id)).length;
        add(cap(scambi * 7, 28), scambi === 1 ? '1 scambio concluso' : scambi + ' scambi conclusi');

        // 4. GLI AIUTI: i rinforzi che ti ha mandato al fronte. Sono la cosa più
        //    cara che un alleato possa darti — uomini che poteva tenersi.
        const aiuti = (Array.isArray(me.aiuti) ? me.aiuti : [])
            .filter(h => h.chi === other.name);
        const uominiAiuto = aiuti.reduce((s, h) => s + (h.uomini || 0), 0);
        add(cap(Math.round(aiuti.reduce((s, h) => s + HELP_WEIGHT * fade(opts.turno, h.turno), 0)), HELP_CAP),
            uominiAiuto + (uominiAiuto === 1 ? ' uomo mandato in tuo aiuto' : ' uomini mandati in tuo aiuto'));

        // 5. I consensi che gli hai concesso: passaggio d'armi dato e non tradito.
        const consensi = (Array.isArray(me.permessiAttacco) ? me.permessiAttacco : [])
            .filter(x => String(x.chi) === String(other.id)).length;
        add(cap(consensi * 4, 8), consensi === 1 ? '1 consenso concesso' : consensi + ' consensi concessi');

        // 6. LE ARMI: quel che ha provato a farti, riuscito o no (regola
        //    dell'utente: "se ci sono stati tentativi di attacchi, invasioni o
        //    conquiste passate"). Il registro è `aggressioni`, scritto dall'unico
        //    punto in cui un attacco si risolve (game-actions.attack): ogni riga
        //    dice chi, dove, con che esito e quanto valeva la provincia. Il
        //    RANCORE resta il registro dei bot (solo le province preziose); qui
        //    contano anche quelle spoglie e i colpi respinti, perché un esercito
        //    al confine è un fatto diplomatico comunque sia finita.
        const guerra = (Array.isArray(me.aggressioni) ? me.aggressioni : [])
            .filter(a => a.chi === other.name);
        const prese = guerra.filter(a => a.esito === 'presa');
        const respinti = guerra.filter(a => a.esito !== 'presa');
        add(-cap(Math.round(prese.reduce((s, a) =>
                s + (AGGRO_BASE + AGGRO_PER_PESO * (a.peso || 0)) * fade(opts.turno, a.turno), 0)), AGGRO_CAP),
            prese.length === 1 ? '1 provincia strappata' : prese.length + ' province strappate');
        add(-cap(Math.round(respinti.reduce((s, a) =>
                s + RAID_WEIGHT * fade(opts.turno, a.turno), 0)), RAID_CAP),
            respinti.length === 1 ? '1 attacco respinto' : respinti.length + ' attacchi respinti');

        // 7. La parola data e ripresa: patti rotti e, peggio, traditi.
        const avvisi = (Array.isArray(me.pattiAvvisi) ? me.pattiAvvisi : [])
            .filter(a => a.conNome === other.name);
        const traditi = avvisi.filter(a => a.tipo === 'tradito').length;
        const rotti = avvisi.filter(a => a.tipo === 'rotto').length;
        add(-cap(traditi * 30, 60), traditi === 1 ? 'ti ha tradito' : traditi + ' tradimenti');
        add(-cap(rotti * 14, 42), rotti === 1 ? '1 patto sciolto da lui' : rotti + ' patti sciolti da lui');

        // 8. Confinare senza nessun accordo è di per sé una tensione: due eserciti
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
        standing, LEVELS, faithTie
    };
})(typeof window !== 'undefined' ? window : this);

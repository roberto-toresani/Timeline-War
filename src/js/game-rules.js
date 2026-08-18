// ============================================================
// REGOLE DI GIOCO — costi, connettività, produzione di inizio turno.
// Funzioni PURE, senza DOM: si testano passando dati e leggendo il ritorno.
// Chi muta davvero la mappa è game-actions.js.
//
// Riferimento: docs/GAME_DESIGN.md §2 (turno), §4 (raccolta), §5 (truppe),
// §6 (costi), §7 (monete), §8 (popolarità).
// ============================================================

(function (root) {
    'use strict';

    const RES = ['pietra', 'legno', 'grano', 'bestiame', 'argilla'];

    const RES_LABEL = {
        pietra: 'Pietra', legno: 'Legno', grano: 'Grano',
        bestiame: 'Bestiame', argilla: 'Argilla',
        monete: 'Monete', soldati: 'Soldati'
    };

    // Tabella costi §6, alla lettera. È l'UNICA fonte: la legenda in UI si
    // genera da qui e la validazione legge da qui, così non possono divergere.
    // `soldati` = soldati consumati sulla provincia dove si costruisce (per la
    // Strada, sulla prima delle due province).
    const COSTS = {
        strada:      { pietra: 1, soldati: 1 },
        barca:       { legno: 1, soldati: 3 },
        capitale:    { monete: 500, soldati: 5 },
        citta:       { monete: 1000, pietra: 3, argilla: 2, bestiame: 2 },
        fortezza:    { monete: 2000, pietra: 6, legno: 4, argilla: 4, bestiame: 2, grano: 2 },
        vascello:    { monete: 4000, legno: 10, argilla: 2, bestiame: 4, grano: 4 },
        mercato:     { monete: 800, soldati: 4 },
        generale:    { monete: 500, bestiame: 3, grano: 3, argilla: 1 },
        mercenario:  { monete: 150 },
        guarnigione: { bestiame: 2, grano: 2, argilla: 1 },
        spia:        { monete: 300 }
    };

    // Descrizione dell'effetto, per la legenda (§6).
    const EFFECTS = {
        strada:      'Collega due province adiacenti che possiedi: serve alla raccolta.',
        barca:       'Collega o espande verso province marittime e isole. Solo su costa.',
        capitale:    'Una sola per regno. Attiva raccolta e Popolarità, difesa +1, paga le tasse, +1 soldato/turno, dà una strada gratuita.',
        citta:       'Capitale secondaria: difesa +1, paga le tasse, +1 soldato/turno. Alla costruzione dà +1 Pietra.',
        fortezza:    'Difesa +3. Ogni turno +5 soldati. Non dove c\'è già Capitale o Città.',
        vascello:    'Movimento globale, senza limiti geografici. Solo su costa.',
        mercato:     'Apre i commerci: scambio con l\'estero al rapporto 2:1 e trattative con gli altri regni.',
        generale:    'Vale 2 soldati. Nella Capitale dà +1 alla Sicurezza.',
        mercenario:  '+1 soldato che resta per sempre, ma è di ventura: in battaglia vale meno di un suddito e quanto renda si sa solo sul campo (§9).',
        guarnigione: '+2 soldati temporanei: scadono a fine turno.',
        spia:        'Perlustra un territorio lontano: per 3 turni vedi di chi sono quella provincia e le sue limitrofe — le bandiere, non le guarnigioni (§9.3).'
    };

    // Cosa si costruisce su UNA provincia (la Strada ne collega due).
    const BUILDABLE_ON_PROVINCE = ['capitale', 'citta', 'fortezza', 'mercato', 'barca', 'vascello', 'generale'];
    // Si reclutano (non si costruiscono): il Mercenario RESTA, la Guarnigione no.
    // Due elenchi e non uno con un flag, perché a `expireTemporaries` serve
    // esattamente il secondo e a nient'altro serve il primo.
    const RECRUITABLE = ['mercenario', 'guarnigione'];
    const TEMPORARY = ['guarnigione'];

    // MERCENARI (§5.3): quanti dei `partenti` sono di ventura. PROPORZIONALE alla
    // quota della provincia, e non è un dettaglio di comodo: lasciar scegliere
    // quali uomini mandare vorrebbe dire tenere i sudditi a casa e spedire sempre
    // la ventura, cioè comprare truppe senza mai pagarne il difetto.
    function mercShare(merc, troops, leaving) {
        merc = Math.max(0, Math.floor(merc || 0));
        troops = Math.max(0, Math.floor(troops || 0));
        leaving = Math.max(0, Math.floor(leaving || 0));
        if (!merc || !troops || !leaving) return 0;
        return Math.min(merc, leaving, Math.round(leaving * merc / troops));
    }

    // Monete incassate da ogni Città per turno (§7). La Capitale conta come Città.
    const TAX_INCOME = { leggera: 50, normale: 100, dura: 150 };

    // PRESIDIO MINIMO (§5): una provincia non resta MAI sguarnita. Qualunque cosa
    // porti via soldati da una provincia — un attacco, uno spostamento, il costo in
    // soldati di una costruzione, il ritiro di una recluta — lavora su quanti se ne
    // possono muovere, non su quanti ce ne sono. È l'unica fonte di questa regola:
    // sia la validazione (game-actions.js) sia i massimi mostrati in UI
    // (player-board.js) passano di qui, così non possono divergere.
    const MIN_GARRISON = 1;

    function spendableTroops(troopsInProvince) {
        return Math.max(0, (troopsInProvince || 0) - MIN_GARRISON);
    }

    // PRESIDIO DELLE PROVINCE NEUTRALI (regola dell'utente, non nel design doc).
    // Le terre di nessuno non sono vuote: partono con 2 soldati e ogni 10 turni ne
    // guadagnano 1, così l'espansione facile dei primi decenni si chiude da sola.
    // La crescita è LENTA apposta: le neutrali sono un attrito, non un avversario
    // in più — a un uomo ogni 5 turni diventavano imprendibili a metà partita.
    // Il presidio si ALZA soltanto (chi conquista non "eredita" il conto: la
    // provincia smette di essere neutrale). Unica fonte: game-actions.garrisonNeutrals.
    const NEUTRAL_START = 2;
    const NEUTRAL_EVERY = 10;   // turni
    const NEUTRAL_STEP = 1;

    // I turni partono da 1 (js/chronicle.js): turni 1-10 → 2 soldati, 11-20 → 3, ecc.
    function neutralGarrison(turn) {
        const t = Math.max(1, Math.floor(turn || 1));
        return NEUTRAL_START + Math.floor((t - 1) / NEUTRAL_EVERY) * NEUTRAL_STEP;
    }

    // RAZZIE DELLE TERRE DI NESSUNO (regola dell'utente). Una neutrale marcia
    // contro un vicino di fede diversa SOLO in schiacciante superiorità: tre
    // attaccanti per ogni difensore. Il presidio minimo (§5) vale anche per loro,
    // quindi il caso limite è 4 soldati neutrali (3 spendibili) contro 1 solo
    // difensore; sotto quella soglia le terre di nessuno restano ferme.
    // Prima bastava 1 soldato in più e le razzie erano continue: una neutrale da
    // 3 uomini poteva strappare una provincia da 2, e a metà partita nessun
    // confine reggeva. Unica fonte della regola: la usano game-actions.neutralRaids
    // (che le esegue) e bot.js (che ci si difende PRIMA che accadano).
    const NEUTRAL_RAID_RATIO = 3;

    function neutralCanRaid(neutralTroops, defenderTroops) {
        return spendableTroops(neutralTroops) >= NEUTRAL_RAID_RATIO * Math.max(0, defenderTroops || 0);
    }

    // Il rovescio della regola: quanti soldati bastano in una provincia perché
    // quella neutrale NON possa marciarci contro. È quello che serve al bot (e a
    // chiunque voglia mostrarlo al giocatore) per presidiare il confine giusto.
    function neutralSafeGarrison(neutralTroops) {
        const attaccanti = spendableTroops(neutralTroops);
        return Math.max(MIN_GARRISON, Math.floor(attaccanti / NEUTRAL_RAID_RATIO) + 1);
    }

    // COMMERCI (§7). Il Mercato apre due canali, e sono due cose diverse:
    //   - l'ESTERO (la banca): 2 unità di una risorsa che hai → 1 di un altro
    //     tipo, subito, senza contrattare con nessuno. SOLO risorse: la banca
    //     non compra né vende oro.
    //   - le TRATTATIVE con gli altri regni: una proposta che parte, resta in
    //     sospeso e vive finché l'altro risponde (o finché scade). Qui la merce
    //     può essere una risorsa OPPURE oro (monete): risorse↔risorse,
    //     oro→risorse, risorse→oro. L'oro si muove a multipli di 100 (§7).
    // Qui sta solo la parte pura — il rapporto della banca e la validazione delle
    // merci; chi muove davvero scorte e monete è game-actions.js.
    const TRADE_RATE = 2;           // quante ne dai per riceverne 1 dalla banca
    const TRADE_MAX_PENDING = 3;    // proposte aperte contemporaneamente per regno
    const TRADE_MAX_UNITS = 20;     // tetto per lato in RISORSE di una proposta
    const TRADE_EXPIRY = 2;         // turni di vita di una proposta senza risposta
    const GOLD_UNIT = 100;          // l'oro nelle proposte va a multipli di 100
    const TRADE_MAX_GOLD = 2000;    // tetto per lato in ORO di una proposta

    // Una merce barattabile in una proposta fra regni: risorsa o oro (monete).
    // La banca invece accetta solo risorse (vedi canBankTrade).
    function isTradeGood(tipo) { return RES.indexOf(tipo) >= 0 || tipo === 'monete'; }

    // Valida un lato di una proposta ({tipo, n}). L'oro va a multipli di 100 e ha
    // un tetto suo; le risorse restano intere entro TRADE_MAX_UNITS.
    function checkGoods(g) {
        const tipo = g && g.tipo;
        const n = Math.floor((g && g.n) || 0);
        if (!isTradeGood(tipo)) return { ok: false, msg: 'Merce sconosciuta.' };
        if (!(n > 0)) return { ok: false, msg: 'Indica la quantità.' };
        if (tipo === 'monete') {
            if (n % GOLD_UNIT !== 0) return { ok: false, msg: 'L\'oro si scambia a multipli di ' + GOLD_UNIT + ' monete.' };
            if (n > TRADE_MAX_GOLD) return { ok: false, msg: 'Una carovana porta al massimo ' + TRADE_MAX_GOLD + ' monete per lato.' };
        } else if (n > TRADE_MAX_UNITS) {
            return { ok: false, msg: 'Una carovana porta al massimo ' + TRADE_MAX_UNITS + ' unità per lato.' };
        }
        return { ok: true };
    }

    function bankTradeCost(n) { return Math.max(0, Math.floor(n || 0)) * TRADE_RATE; }

    // Lo scambio con la banca è valido? Ritorna anche il costo, così chi chiama
    // non ricalcola il rapporto per conto suo.
    function canBankTrade(player, dai, prendi, n) {
        n = Math.floor(n || 0);
        if (RES.indexOf(dai) < 0 || RES.indexOf(prendi) < 0) return { ok: false, msg: 'Risorsa sconosciuta.' };
        if (dai === prendi) {
            return { ok: false, msg: 'Il mercato scambia risorse diverse: dai un tipo, ne ricevi un altro.' };
        }
        if (!(n > 0)) return { ok: false, msg: 'Indica quante risorse vuoi ricevere.' };
        const costo = bankTradeCost(n);
        const hai = ((player && player.scorte) || {})[dai] || 0;
        if (hai < costo) {
            return {
                ok: false, costo,
                msg: 'Per ' + n + ' ' + RES_LABEL[prendi] + ' servono ' + costo + ' ' + RES_LABEL[dai] +
                    ': ne hai ' + hai + '.'
            };
        }
        return { ok: true, costo };
    }

    // "3 Pietra", "200 monete": come una merce si legge in un messaggio o su un
    // bottone. L'oro segue lo stesso minuscolo dei costi ("500 monete").
    function goodsText(g) {
        if (!g) return '';
        if (g.tipo === 'monete') return g.n + (g.n === 1 ? ' moneta' : ' monete');
        return g.n + ' ' + (RES_LABEL[g.tipo] || g.tipo);
    }

    // PRESTIGIO SOSPESO (scelta dell'utente): il §10 resta scritto e il codice
    // resta al suo posto, ma per ora non si accumula e la plancia non lo mostra.
    // Rimettere a true per riaccenderlo: non serve toccare altro.
    const PRESTIGE_ENABLED = false;

    function emptyScorte() {
        const s = {};
        RES.forEach(k => { s[k] = 0; });
        return s;
    }

    // Nome delle voci costruibili. Mercenario, Guarnigione e Spia non sono
    // pedine (non stanno in PIECES), quindi il nome deve arrivare da qui.
    const ITEM_LABEL = {
        strada: 'Strada', barca: 'Nave', capitale: 'Capitale', citta: 'Città',
        fortezza: 'Fortezza', vascello: 'Vascello', mercato: 'Mercato',
        generale: 'Generale', mercenario: 'Mercenario', guarnigione: 'Guarnigione',
        spia: 'Spia'
    };

    // Testo leggibile di un costo: "500 monete + 5 soldati", "1 Pietra + 1 soldato".
    function formatCost(cost) {
        return Object.keys(cost || {}).map(k => {
            const n = cost[k];
            if (k === 'monete') return n + (n === 1 ? ' moneta' : ' monete');
            if (k === 'soldati') return n + (n === 1 ? ' soldato' : ' soldati');
            return n + ' ' + (RES_LABEL[k] || k);
        }).join(' + ');
    }

    // Il regno può permettersi il costo? `soldiersHere` = soldati SPENDIBILI sulla
    // provincia interessata (i costi in soldati si pagano lì, non dal totale, e chi
    // chiama deve già aver tolto il presidio minimo con spendableTroops).
    // Ritorna anche cosa manca, così la UI può dirlo invece di limitarsi a un "no".
    function canAfford(player, cost, soldiersHere) {
        const missing = [];
        const scorte = (player && player.scorte) || emptyScorte();
        Object.keys(cost || {}).forEach(k => {
            const need = cost[k];
            let have;
            if (k === 'monete') have = (player && player.monete) || 0;
            else if (k === 'soldati') have = soldiersHere || 0;
            else have = scorte[k] || 0;
            if (have < need) missing.push({ tipo: k, label: RES_LABEL[k] || k, serve: need, hai: have });
        });
        return { ok: missing.length === 0, missing };
    }

    // Frase pronta per l'utente: "ti mancano 2 Pietra e 500 monete".
    // Soldati e monete si accordano al numero: col presidio minimo (§5) il caso
    // "ti manca 1 soldato" capita a ogni costruzione, e "1 Soldati" si legge male.
    function missingText(missing) {
        if (!missing || !missing.length) return '';
        const parts = missing.map(m => {
            const n = m.serve - m.hai;
            if (m.tipo === 'soldati') return n + (n === 1 ? ' soldato' : ' soldati');
            if (m.tipo === 'monete') return n + (n === 1 ? ' moneta' : ' monete');
            return n + ' ' + m.label;
        });
        if (parts.length === 1) return 'ti manca ' + parts[0];
        return 'ti mancano ' + parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1];
    }

    // Province COLLEGATE (§4): raggiungibili da una Capitale o Città percorrendo
    // strade fra province dello stesso proprietario. Senza hub non si raccoglie nulla.
    // Nota: le navi non entrano ancora nella rete (le strade sono l'unico arco
    // implementato); quando ci saranno, basta aggiungerne gli archi a `links`.
    function connected(ownedIds, roads, hubIds) {
        const owned = new Set(ownedIds || []);
        const hubs = (hubIds || []).filter(id => owned.has(id));
        const out = new Set();
        if (!hubs.length) return out;

        const adj = {};
        (roads || []).forEach(r => {
            if (!owned.has(r.a) || !owned.has(r.b)) return;   // strade verso l'esterno non collegano
            (adj[r.a] = adj[r.a] || []).push(r.b);
            (adj[r.b] = adj[r.b] || []).push(r.a);
        });

        const queue = hubs.slice();
        hubs.forEach(id => out.add(id));
        while (queue.length) {
            const cur = queue.shift();
            (adj[cur] || []).forEach(next => {
                if (out.has(next)) return;
                out.add(next);
                queue.push(next);
            });
        }
        return out;
    }

    // FASE 1 del turno (§2): produzione ed entrate di un regno.
    // provinces: [{id, resource, pieces:[{type,count}]}] — solo quelle del regno.
    // connectedSet: Set degli id collegati (da `connected`).
    // units: conteggio pedine del regno (da KingdomStats.countUnits).
    // popularity: 1..5 oppure null se il regno non ha ancora la Capitale.
    function turnProduction(provinces, connectedSet, units, tax, popularity) {
        const hasCapital = units.capitale > 0;
        const zero = {
            monete: 0, risorse: emptyScorte(), reclute: 0, vincolate: {}, recluteTotali: 0,
            prestigio: 0, collegate: 0, hasCapital: false
        };
        // Senza Capitale non si raccoglie nulla (§2, §4): niente monete, niente
        // risorse, niente reclute. Il regno resta fermo finché non la costruisce.
        if (!hasCapital) return zero;

        const popMod = popularity ? popEffectOf(popularity) : { soldati: 0, risorse: 0, prestigio: 0 };

        // Monete: solo le Città pagano, la Capitale conta come Città (§7).
        const rate = TAX_INCOME[tax] || TAX_INCOME.normale;
        const monete = (units.citta + units.capitale) * rate;

        // Risorse: 1 per provincia collegata che ha una risorsa (§4).
        const risorse = emptyScorte();
        let collegate = 0;
        (provinces || []).forEach(p => {
            if (!connectedSet.has(p.id)) return;
            collegate++;
            if (p.resource && risorse[p.resource] !== undefined) risorse[p.resource] += 1;
        });

        // Modificatore Popolarità: ±N unità TOTALI sulla raccolta, distribuite
        // partendo dal tipo più abbondante (in negativo) o più scarso (in positivo).
        applyResourceModifier(risorse, popMod.risorse);

        // Reclute (§5.1): il calcolo col dettaglio vive in kingdom-stats.js, che è
        // anche quello che la UI mostra — una formula sola, così non divergono.
        // `reclute` sono le LIBERE (il giocatore le mette dove vuole), `vincolate`
        // dice quante ne nascono in ciascuna provincia con Capitale/Città/Fortezza:
        // quelle lì devono restare.
        const plan = KingdomStats.reinforcementPlan(provinces || [], popularity);

        return {
            monete, risorse,
            reclute: plan.libere,
            vincolate: plan.perProvincia,
            recluteTotali: plan.total,
            prestigio: PRESTIGE_ENABLED ? popMod.prestigio : 0,
            collegate, hasCapital: true
        };
    }

    // Sposta N unità totali dentro/fuori dalla raccolta senza scendere sotto zero.
    function applyResourceModifier(risorse, mod) {
        if (!mod) return;
        let left = Math.abs(mod);
        const sign = mod > 0 ? 1 : -1;
        // In positivo si parte dai tipi già raccolti (più utile del nulla);
        // in negativo si toglie dai più abbondanti, per non azzerare un tipo raro.
        while (left > 0) {
            const pool = RES.filter(k => sign > 0 ? risorse[k] > 0 : risorse[k] > 0);
            if (!pool.length) break;
            pool.sort((a, b) => sign > 0 ? risorse[a] - risorse[b] : risorse[b] - risorse[a]);
            risorse[pool[0]] += sign;
            left--;
        }
    }

    // Effetti per livello di Popolarità (§8 + §10 per il prestigio).
    function popEffectOf(level) {
        const t = {
            1: { soldati: -2, risorse: -2, prestigio: -1 },
            2: { soldati: -1, risorse: -1, prestigio: 0 },
            3: { soldati: 0, risorse: 0, prestigio: 0 },
            4: { soldati: 1, risorse: 1, prestigio: 0 },
            5: { soldati: 2, risorse: 2, prestigio: 1 }
        };
        return t[level] || t[3];
    }

    // Bonus difensivo della provincia in battaglia (§9): esclusivi, vince il maggiore.
    function defenceBonus(units) {
        if (units.fortezza > 0) return 3;
        if (units.capitale > 0 || units.citta > 0) return 1;
        return 0;
    }

    const api = {
        RES, RES_LABEL, ITEM_LABEL, COSTS, EFFECTS, TAX_INCOME,
        BUILDABLE_ON_PROVINCE, RECRUITABLE, TEMPORARY, MIN_GARRISON, mercShare,
        NEUTRAL_START, NEUTRAL_EVERY, NEUTRAL_STEP, neutralGarrison, PRESTIGE_ENABLED,
        NEUTRAL_RAID_RATIO, neutralCanRaid, neutralSafeGarrison,
        TRADE_RATE, TRADE_MAX_PENDING, TRADE_MAX_UNITS, TRADE_EXPIRY,
        GOLD_UNIT, TRADE_MAX_GOLD, isTradeGood, checkGoods,
        bankTradeCost, canBankTrade, goodsText,
        emptyScorte, formatCost, canAfford, missingText, spendableTroops,
        connected, turnProduction, popEffectOf, defenceBonus
    };

    root.GameRules = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);

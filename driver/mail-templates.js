// ============================================================
// SISTEMA MAIL — TESTI PERSONALIZZATI PER OGNI REGNO
// ------------------------------------------------------------
// Regola dell'utente ("uno per regno, curato a mano"). L'oggetto e il corpo
// della mail cambiano col regno: gli inglesi non ricevono la stessa formula
// degli Abbasidi. Un regno che non è in tabella riceve `_default` — succede
// per i regni d'evento (Selgiuchidi, Portogallo, Bulgaria, Norvegia, Svezia,
// Orda) e per una mappa iniziale col regno rinominato.
//
// Il corpo è una funzione (ctx) → stringa: `ctx` porta i dati che il driver
// ha già in mano quando manda la mail — nome del regno, anno-turno, il link
// alla plancia (URL d'invito) e i due link scorciatoia di auto-schieramento
// (append `&autoplay=confini|capitale`). Nessuna dipendenza dal codice del
// gioco: questo file è puro testo.
// ============================================================

'use strict';

// Timbro comune (fondo di ogni mail): 6h di tempo + le tre scorciatoie.
// È l'unica parte identica per tutti; il colore lo dà il testo sopra.
function timbro(ctx) {
    return [
        '',
        '— Come si gioca il turno —',
        '',
        '• Apri la plancia:',
        '  ' + ctx.playUrl,
        '  (dal telefono si apre la vista semplice: un turno rapido in pochi tocchi)',
        '',
        '• Non hai tempo? Schiera al confine e passa il turno:',
        '  ' + ctx.playUrl + (ctx.playUrl.indexOf('?') >= 0 ? '&' : '?') + 'autoplay=confini',
        '',
        '• Non hai tempo? Schiera in Capitale e passa il turno:',
        '  ' + ctx.playUrl + (ctx.playUrl.indexOf('?') >= 0 ? '&' : '?') + 'autoplay=capitale',
        '',
        'Hai 6 ore per giocare (di notte, dalle 23:30 alle 8:30, il tempo non',
        'scorre). Dopo, il motore chiuderà il turno secondo la preferenza che',
        'hai scelto sulla plancia (di default: salta senza schierare).',
        '',
        '— Il consiglio del regno'
    ].join('\n');
}

const TEMPLATES = {
    'Regno di Inghilterra': {
        subject: (ctx) => 'Sire, l’Inghilterra vi attende — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Sire d’Inghilterra,\n\n' +
'Il consiglio della corona si è radunato a Home Counties. La Manica ci separa\n' +
'da un continente inquieto, e le nostre galee — quando avranno vela — riporteranno\n' +
'la nostra insegna oltre il mare. Fino ad allora, si guardino le coste, si tengano\n' +
'le Marche, si prepari il legname per il Veliero che deve venire.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    'Regno di Francia': {
        subject: (ctx) => 'Maestà, i baroni chiedono la vostra parola — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Maestà di Francia,\n\n' +
'I feudi vi guardano. L’Île-de-France è il cuore, ma i grandi vassalli tirano\n' +
'in ogni direzione: la Normandia guarda al mare, la Guyenna al vino d’Inghilterra,\n' +
'il Delfinato alle Alpi. Il Papa siede a Roma, e Aleppo attende chi porti la Croce.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    'Sacro Romano Impero': {
        subject: (ctx) => 'Imperatore, la Dieta si riunisce — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Imperatore del Sacro Romano Impero,\n\n' +
'La Dieta si è riunita. I principi elettori attendono la vostra guida: la\n' +
'Renania mercanteggia, la Baviera prega, la Sassonia mormora. Oltre le Alpi\n' +
'ci chiama l’Italia; a oriente le marche battono i tamburi contro i pagani.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    'Regno di Castiglia': {
        subject: (ctx) => 'Vostra Grazia, la Reconquista non aspetta — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Vostra Grazia di Castiglia,\n\n' +
'A sud brilla Al-Andalus; a est cavalca l’Aragona; il Portogallo si affaccia\n' +
'sull’oceano. La Reconquista è un’opera di generazioni, ma comincia adesso,\n' +
'un feudo per volta. Granada cadrà — quando l’avrete circondata.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    'Kievan Ru\'s': {
        subject: (ctx) => 'Principe, la Rus\' vi chiama — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Principe di Kiev,\n\n' +
'Le foreste stanno mute, ma dalla steppa a oriente si leva sempre polvere.\n' +
'Volga, Dnepr, Don: tre fiumi, tre fronti. Fortificate le vie, tenetevi\n' +
'stretti i boiari, e non guardate mai una sola direzione per troppo tempo.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    'Ducato di Polonia': {
        subject: (ctx) => 'Duca, la Vistola vi attende — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Duca di Polonia,\n\n' +
'Fra Odra e Vistola la vostra Corona cresce a fatica: i Teutonici da un lato,\n' +
'la Rus\' dall\'altro, e i pagani baltici ancora nei boschi. La pianura non\n' +
'perdona la debolezza: costruite città, tenete i confini, cercate alleati fra\n' +
'chi ha il vostro stesso nemico.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    'Ducato di Ungheria': {
        subject: (ctx) => 'Voivoda, la pianura pannonica vi guarda — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Voivoda d\'Ungheria,\n\n' +
'La Pannonia è aperta ai quattro venti: Bisanzio a sud, il Sacro Romano Impero\n' +
'a occidente, la steppa a oriente. Chi tiene Buda tiene il Danubio, e chi tiene\n' +
'il Danubio tiene il grano di mezza Europa.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    'Impero Bizantino': {
        subject: (ctx) => 'Basileus, la Città vi aspetta — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Basileus dei Romei,\n\n' +
'Costantinopoli è la porta fra due mari e fra due mondi. A oriente premono\n' +
'i turchi, a occidente si muovono i latini; la Tracia è sottile e le mura\n' +
'sono ciò che ci separa dalla fine. Tenete la Città — il resto si ricostruisce.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    'Califfato Abbaside': {
        subject: (ctx) => 'Califfo, la casa dell\'Islam vi ascolta — turno ' + ctx.turnLabel,
        body: (ctx) =>
'O Califfo di Baghdad,\n\n' +
'Alla Casa della Sapienza si accende ancora la lampada. Ma dai monti dell\'Iran\n' +
'i Turchi Selgiuchidi si affacciano sulla Mesopotamia, e a occidente i Franchi\n' +
'preparano la loro guerra santa. Che la vostra spada sia salda quanto la\n' +
'vostra fede.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    'Emirato dei Mori': {
        subject: (ctx) => 'Emiro, Marrakech e Siviglia vi attendono — turno ' + ctx.turnLabel,
        body: (ctx) =>
'O Emiro dei Mori,\n\n' +
'Dallo Stretto risalgono le vostre navi verso l\'Iberia; le carovane portano oro\n' +
'dal Sahel attraverso l\'Atlante; i predicatori Almoravidi e Almohadi tengono\n' +
'salda la fede sunnita fra i vostri emiri. Ma oltre il Tago i regni cristiani\n' +
'premono, e a oriente, verso il Cairo, il Levante prepara la sua tempesta:\n' +
'pellegrini con la croce sull\'elmo.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').' + timbro(ctx)
    },

    // Ripiego generico — regni d'evento (Selgiuchidi, Portogallo, Bulgaria,
    // Norvegia, Svezia, Orda) e ogni regno rinominato che non risulta in tabella.
    _default: {
        subject: (ctx) => 'Tocca a ' + ctx.regno + ' — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Signore di ' + ctx.regno + ',\n\n' +
'Il consiglio si è riunito. È il vostro turno (' + ctx.turnLabel + ') — la\n' +
'mappa vi attende.' + timbro(ctx)
    }
};

function pick(regno) {
    if (regno && Object.prototype.hasOwnProperty.call(TEMPLATES, regno)) return TEMPLATES[regno];
    return TEMPLATES._default;
}

module.exports = { pick };

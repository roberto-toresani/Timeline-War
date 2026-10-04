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

// FONDO COMUNE (identico per tutti; il colore lo dà il testo del regno sopra).
// Regola dell'utente: deve essere chiaro QUALE link aprire. Due blocchi ben
// separati: (1) GIOCA — un link solo, lo stesso da PC e da telefono (sul
// telefono la plancia accende da sé la vista semplice); (2) NON PUOI GIOCARE —
// le due scorciatoie che chiudono il turno all'istante, con l'avvertenza di non
// aprirle se si vuole giocare. Esiste in testo semplice e in HTML (bottoni).
function links(ctx) {
    const sep = ctx.playUrl.indexOf('?') >= 0 ? '&' : '?';
    return {
        gioca: ctx.playUrl,
        confini: ctx.playUrl + sep + 'autoplay=confini',
        capitale: ctx.playUrl + sep + 'autoplay=capitale'
    };
}

function footerText(ctx) {
    const l = links(ctx);
    return [
        '',
        '',
        '==============================================',
        ' ▶ PER GIOCARE IL TURNO (da PC o da telefono)',
        '==============================================',
        '',
        '  ' + l.gioca,
        '',
        '  È lo stesso link per PC e telefono: sul telefono',
        '  si apre da sé la vista semplice.',
        '',
        '',
        '----------------------------------------------',
        ' ✋ NON PUOI GIOCARE? (il turno si chiude subito)',
        '----------------------------------------------',
        '',
        '  ATTENZIONE: questi due link NON servono per giocare.',
        '  Schierano le reclute al posto tuo e PASSANO IL TURNO.',
        '  Usane uno solo, e solo se non vuoi giocare.',
        '',
        '  • Schiera ai confini e passa il turno:',
        '    ' + l.confini,
        '',
        '  • Schiera in Capitale e passa il turno:',
        '    ' + l.capitale,
        '',
        '',
        'Hai 6 ore per giocare (di notte, dalle 23:30 alle 8:30, il tempo non',
        'scorre). Se non fai niente, alla scadenza il motore chiude il turno',
        'secondo la preferenza scelta sulla plancia (di default: senza schierare).',
        '',
        '— Il consiglio del regno'
    ].join('\n');
}

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Il corpo del regno (testo) in paragrafi HTML: le righe a capo del testo sono
// a misura di mail semplice, in HTML si riuniscono.
function bodyHtml(text) {
    return String(text).split(/\n\s*\n/).map(function (par) {
        return '<p style="margin:0 0 14px;">' + esc(par.replace(/\n/g, ' ')) + '</p>';
    }).join('');
}

function footerHtml(ctx) {
    const l = links(ctx);
    const btnBig = 'display:inline-block;background:#8a5a12;color:#ffffff;text-decoration:none;'
        + 'font-weight:bold;font-size:18px;padding:14px 28px;border-radius:8px;';
    const btnSmall = 'display:inline-block;background:#ffffff;color:#5b4632;text-decoration:none;'
        + 'font-size:14px;padding:9px 14px;border-radius:6px;border:1px solid #b9a888;margin:4px 0;';
    return ''
        + '<div style="margin:22px 0;padding:20px;border:2px solid #8a5a12;border-radius:10px;background:#fbf3df;text-align:center;">'
        +   '<div style="font-size:13px;letter-spacing:1px;color:#8a5a12;font-weight:bold;margin-bottom:12px;">PER GIOCARE IL TURNO</div>'
        +   '<a href="' + esc(l.gioca) + '" style="' + btnBig + '">▶ Gioca il turno</a>'
        +   '<div style="font-size:13px;color:#5b4632;margin-top:12px;">Lo stesso link vale <b>da PC e da telefono</b>: sul telefono si apre da sé la vista semplice.</div>'
        + '</div>'
        + '<div style="margin:22px 0;padding:16px;border:1px dashed #b9a888;border-radius:10px;background:#f4f1ea;">'
        +   '<div style="font-size:13px;letter-spacing:1px;color:#6b6257;font-weight:bold;margin-bottom:6px;">✋ NON PUOI GIOCARE?</div>'
        +   '<div style="font-size:13px;color:#7a2a1a;margin-bottom:10px;"><b>Attenzione:</b> questi link <b>non servono per giocare</b>. '
        +     'Schierano le reclute al posto tuo e <b>passano subito il turno</b>. Usane uno solo, e solo se non vuoi giocare.</div>'
        +   '<a href="' + esc(l.confini) + '" style="' + btnSmall + '">Schiera ai confini e passa il turno</a><br>'
        +   '<a href="' + esc(l.capitale) + '" style="' + btnSmall + '">Schiera in Capitale e passa il turno</a>'
        + '</div>'
        + '<p style="font-size:12px;color:#6b6257;margin:0 0 14px;">Hai 6 ore per giocare (di notte, dalle 23:30 alle 8:30, il tempo non scorre). '
        +   'Se non fai niente, alla scadenza il motore chiude il turno secondo la preferenza scelta sulla plancia (di default: senza schierare).</p>'
        + '<p style="margin:0;color:#5b4632;"><i>— Il consiglio del regno</i></p>';
}

// Mail completa: testo semplice (ripiego) + HTML coi bottoni.
function compose(tpl, ctx) {
    const intro = tpl.body(ctx);
    return {
        subject: tpl.subject(ctx),
        text: intro + footerText(ctx),
        html: '<div style="font-family:Georgia,serif;font-size:15px;line-height:1.5;color:#2b2118;max-width:560px;">'
            + bodyHtml(intro) + footerHtml(ctx) + '</div>'
    };
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
'È il vostro turno (' + ctx.turnLabel + ').'
    },

    'Regno di Francia': {
        subject: (ctx) => 'Maestà, i baroni chiedono la vostra parola — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Maestà di Francia,\n\n' +
'I feudi vi guardano. L’Île-de-France è il cuore, ma i grandi vassalli tirano\n' +
'in ogni direzione: la Normandia guarda al mare, la Guyenna al vino d’Inghilterra,\n' +
'il Delfinato alle Alpi. Il Papa siede a Roma, e Aleppo attende chi porti la Croce.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').'
    },

    'Sacro Romano Impero': {
        subject: (ctx) => 'Imperatore, la Dieta si riunisce — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Imperatore del Sacro Romano Impero,\n\n' +
'La Dieta si è riunita. I principi elettori attendono la vostra guida: la\n' +
'Renania mercanteggia, la Baviera prega, la Sassonia mormora. Oltre le Alpi\n' +
'ci chiama l’Italia; a oriente le marche battono i tamburi contro i pagani.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').'
    },

    'Regno di Castiglia': {
        subject: (ctx) => 'Vostra Grazia, la Reconquista non aspetta — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Vostra Grazia di Castiglia,\n\n' +
'A sud brilla Al-Andalus; a est cavalca l’Aragona; il Portogallo si affaccia\n' +
'sull’oceano. La Reconquista è un’opera di generazioni, ma comincia adesso,\n' +
'un feudo per volta. Granada cadrà — quando l’avrete circondata.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').'
    },

    'Kievan Ru\'s': {
        subject: (ctx) => 'Principe, la Rus\' vi chiama — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Principe di Kiev,\n\n' +
'Le foreste stanno mute, ma dalla steppa a oriente si leva sempre polvere.\n' +
'Volga, Dnepr, Don: tre fiumi, tre fronti. Fortificate le vie, tenetevi\n' +
'stretti i boiari, e non guardate mai una sola direzione per troppo tempo.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').'
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
'È il vostro turno (' + ctx.turnLabel + ').'
    },

    'Ducato di Ungheria': {
        subject: (ctx) => 'Voivoda, la pianura pannonica vi guarda — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Voivoda d\'Ungheria,\n\n' +
'La Pannonia è aperta ai quattro venti: Bisanzio a sud, il Sacro Romano Impero\n' +
'a occidente, la steppa a oriente. Chi tiene Buda tiene il Danubio, e chi tiene\n' +
'il Danubio tiene il grano di mezza Europa.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').'
    },

    'Impero Bizantino': {
        subject: (ctx) => 'Basileus, la Città vi aspetta — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Basileus dei Romei,\n\n' +
'Costantinopoli è la porta fra due mari e fra due mondi. A oriente premono\n' +
'i turchi, a occidente si muovono i latini; la Tracia è sottile e le mura\n' +
'sono ciò che ci separa dalla fine. Tenete la Città — il resto si ricostruisce.\n' +
'\n' +
'È il vostro turno (' + ctx.turnLabel + ').'
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
'È il vostro turno (' + ctx.turnLabel + ').'
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
'È il vostro turno (' + ctx.turnLabel + ').'
    },

    // Ripiego generico — regni d'evento (Selgiuchidi, Portogallo, Bulgaria,
    // Norvegia, Svezia, Orda) e ogni regno rinominato che non risulta in tabella.
    _default: {
        subject: (ctx) => 'Tocca a ' + ctx.regno + ' — turno ' + ctx.turnLabel,
        body: (ctx) =>
'Signore di ' + ctx.regno + ',\n\n' +
'Il consiglio si è riunito. È il vostro turno (' + ctx.turnLabel + ') — la\n' +
'mappa vi attende.'
    }
};

function pick(regno) {
    if (regno && Object.prototype.hasOwnProperty.call(TEMPLATES, regno)) return TEMPLATES[regno];
    return TEMPLATES._default;
}

module.exports = { pick, compose };

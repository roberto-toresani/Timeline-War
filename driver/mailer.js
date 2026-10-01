// ============================================================
// SISTEMA MAIL — INVIO
// ------------------------------------------------------------
// Regola dell'utente: quando il turno passa a un giocatore umano gli arriva
// una mail personalizzata col link della plancia e due scorciatoie di
// auto-schieramento. Il motore che manda le mail sta qui, nel `driver/` che
// è già acceso su un host permanente (Node + Puppeteer). Niente Firebase
// Blaze, niente servizi terzi obbligati: nodemailer + SMTP Gmail
// (app-password) — l'utente ha scelto questa strada.
//
// Il modulo espone `initMailer(env)` (torna null se il .env non ha le
// credenziali SMTP: in quel caso il driver va avanti senza mail, che è
// l'unico comportamento accettabile — non deve bloccare la partita se il
// mailer non è configurato) e `sendTurnMail({toEmail, regno, playUrl,
// turnLabel})` che confeziona oggetto+corpo dal template del regno
// (`mail-templates.js`) e li spedisce.
//
// Anti-doppione: chi CHIAMA sendTurnMail lo fa una volta per apertura di
// turno; qui non teniamo storia. La deduplicazione vive nel driver perché
// dipende dallo stato del gioco (turno globale + id del giocatore).
// ============================================================

'use strict';

let nodemailer;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

const templates = require('./mail-templates');

// Indirizzo mascherato nei log: il motore in cloud gira su GitHub Actions di
// un repo PUBBLICO, e i suoi log li legge chiunque.
function mask(email) {
    const s = String(email || '');
    const at = s.indexOf('@');
    return at > 0 ? s[0] + '***' + s.slice(at) : '***';
}

function log() {
    const a = Array.prototype.slice.call(arguments);
    console.log('[' + new Date().toISOString() + '] [mail]', a.join(' '));
}

// Configura il trasporto SMTP dal .env. Se manca qualcosa torna `null` e il
// driver fa a meno del mailer — non è un errore fatale, la partita gira lo
// stesso.
function initMailer(env) {
    const host = env.SMTP_HOST;
    const port = Number(env.SMTP_PORT || 587);
    const user = env.SMTP_USER;
    const pass = env.SMTP_PASS;
    const from = env.MAIL_FROM || user;
    if (!host || !user || !pass) {
        log('SMTP non configurato: nessuna mail verrà inviata. (Serve SMTP_HOST, SMTP_USER, SMTP_PASS in driver/.env)');
        return null;
    }
    if (!nodemailer) {
        log('nodemailer non installato: dentro driver/ esegui `npm install`.');
        return null;
    }
    // Gmail SMTP: host smtp.gmail.com, porta 587 (STARTTLS). L'app-password
    // è nella dashboard "Sicurezza" → "Password per le app" del Google
    // Account, non la password del login. Nulla di specifico a Gmail nel
    // codice: qualunque SMTP con login funziona.
    const transporter = nodemailer.createTransport({
        host, port,
        secure: port === 465,   // 465 = TLS diretto; 587 = STARTTLS
        auth: { user, pass }
    });

    async function sendTurnMail(opts) {
        const to = (opts && opts.toEmail || '').trim();
        if (!to) return { ok: false, reason: 'no-address' };
        const regno = opts.regno || 'il vostro regno';
        const playUrl = opts.playUrl || '';
        const turnLabel = opts.turnLabel || '';
        const tpl = templates.pick(regno);
        const ctx = { regno, playUrl, turnLabel };
        const subject = tpl.subject(ctx);
        const text = tpl.body(ctx);
        try {
            const info = await transporter.sendMail({ from, to, subject, text });
            log('inviata a', mask(to), '·', regno, '·', turnLabel, '·', info.messageId || '');
            return { ok: true, id: info.messageId || null };
        } catch (err) {
            log('ERRORE invio a', mask(to), '·', (err && err.message) || err);
            return { ok: false, reason: (err && err.message) || String(err) };
        }
    }

    // Fa un ping opzionale (verify) al server SMTP a inizio driver, così
    // se le credenziali sono sbagliate te ne accorgi subito e non al primo
    // turno umano.
    async function verify() {
        try { await transporter.verify(); log('SMTP OK · from:', from); return true; }
        catch (err) { log('SMTP verify FALLITO:', (err && err.message) || err); return false; }
    }

    return { sendTurnMail, verify };
}

module.exports = { initMailer };

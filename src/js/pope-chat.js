// ============================================================
// ✝ IL PAPA — la voce dell'admin in chat (regola dell'utente)
//
// Il Papa NON è un regno: niente province, niente turno, niente record in
// PLAYERS. È solo una firma in chat, che l'admin presta da qui (editor). Scrive
// in PRIVATO a qualunque regno — confini o no, nebbia o no — oppure a tutti
// (un'enciclica sul canale pubblico). Ogni regno trova nella sua chat il filo
// "✝ Il Papa" e può rispondergli lì (player-board.js; i regni musulmani solo
// dopo che il Papa ha scritto loro).
//
// Il pannello è una CASELLA DI POSTA (regola dell'utente): in alto TUTTE le
// conversazioni in corso, dalla più recente, con l'ultima riga, l'ora e i non
// letti; un clic apre il filo sotto. "Nuova lettera a…" apre il filo con un
// regno a cui il Papa non ha ancora scritto.
//
// Trasporto: la stessa collezione `chat` di sync.js. Un messaggio del Papa è
// {regno:'Il Papa', papa:true, to?, toId?}; uno al Papa è {regno:<regno>,
// to:'Il Papa', papa:true}. `papa:true` dice ai bot di non rispondere.
// Il "letto" della console sta in localStorage (comodità di chi guarda).
// ============================================================

(function (root, doc) {
    'use strict';

    const PAPA = 'Il Papa';
    const COLORE = '#f2e2a0';
    const SEEN_KEY = 'risiko_papa_seen';
    const ENC = '';             // la "conversazione" delle encicliche (canale pubblico)

    const R = () => root.Risiko;
    const $ = id => doc.getElementById(id);
    const sync = () => (typeof MultiplayerSync !== 'undefined' ? MultiplayerSync : null);

    let messages = [];
    let target = ENC;           // ENC = encicliche, altrimenti il NOME del regno
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (e) { seen = {}; }
    let lastListSig = '';
    let lastSelSig = '';
    let lastLogSig = '';

    function isAdmin() {
        const r = R();
        return !!(r && r.isAdmin && r.isAdmin());
    }

    function kingdoms() {
        const r = R();
        return (r && r.players) ? r.players() : [];
    }

    // Il filo fra il Papa e un regno; con ENC l'elenco delle encicliche.
    function thread(name) {
        if (name === ENC) return messages.filter(m => m.regno === PAPA && !m.to);
        return messages.filter(m =>
            (m.regno === PAPA && m.to === name) || (m.to === PAPA && m.regno === name));
    }

    // Quanti messaggi AL Papa da quel regno non sono ancora stati letti qui.
    function unread(name) {
        if (name === ENC) return 0;
        const at = seen[name] || 0;
        return messages.filter(m => m.to === PAPA && m.regno === name && (m.ts || 0) > at).length;
    }

    function markSeen(name) {
        if (name === ENC) return;
        const last = thread(name).reduce((a, m) => Math.max(a, m.ts || 0), 0);
        if (last > (seen[name] || 0)) {
            seen[name] = last;
            try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* privato */ }
        }
    }

    // Tutte le conversazioni che hanno almeno un messaggio, dalla più recente.
    // Un regno uscito di scena resta in elenco col suo nome: lo storico non si perde.
    function conversations() {
        const by = new Map();
        messages.forEach(m => {
            let key = null;
            if (m.regno === PAPA) key = m.to || ENC;
            else if (m.to === PAPA) key = m.regno;
            if (key === null || key === undefined) return;
            const c = by.get(key) || { name: key, last: null, n: 0 };
            c.n++;
            if (!c.last || (m.ts || 0) >= (c.last.ts || 0)) c.last = m;
            by.set(key, c);
        });
        // Il filo aperto resta in elenco anche se è ancora vuoto (nuova lettera).
        if (!by.has(target)) by.set(target, { name: target, last: null, n: 0 });
        return Array.from(by.values())
            .sort((a, b) => ((b.last && b.last.ts) || Infinity) - ((a.last && a.last.ts) || Infinity));
    }

    function colorOf(name) {
        if (name === ENC) return COLORE;
        const k = kingdoms().find(p => p.name === name);
        if (k) return k.color;
        const m = messages.find(x => x.regno === name && x.colore);
        return m ? m.colore : '#888';
    }

    function labelOf(name) {
        return name === ENC ? '🌍 Encicliche (a tutti)' : name;
    }

    function time(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const p = n => String(n).padStart(2, '0');
        const oggi = new Date();
        const stessoGiorno = d.toDateString() === oggi.toDateString();
        return (stessoGiorno ? '' : p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ') +
            p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function renderThreads() {
        const box = $('pope-threads');
        if (!box) return;
        const convs = conversations();
        const sig = target + '|' + convs.map(c => c.name + ':' + c.n + ':' + unread(c.name) +
            ':' + (c.last ? c.last.id : '')).join('|');
        if (sig === lastListSig) return;
        lastListSig = sig;
        box.innerHTML = '';
        convs.forEach(c => {
            const row = doc.createElement('button');
            row.type = 'button';
            row.className = 'pope-thread' + (c.name === target ? ' on' : '');
            const n = unread(c.name);

            const dot = doc.createElement('span');
            dot.className = 'pope-dot';
            dot.style.background = colorOf(c.name);
            const name = doc.createElement('span');
            name.className = 'pope-thread-name';
            name.textContent = labelOf(c.name);
            const when = doc.createElement('span');
            when.className = 'pope-thread-when';
            when.textContent = c.last ? time(c.last.ts) : 'nuova';
            const top = doc.createElement('div');
            top.className = 'pope-thread-top';
            top.appendChild(dot); top.appendChild(name); top.appendChild(when);
            if (n) {
                const b = doc.createElement('span');
                b.className = 'pope-unread';
                b.textContent = n;
                top.appendChild(b);
            }

            const prev = doc.createElement('div');
            prev.className = 'pope-thread-prev' + (n ? ' new' : '');
            prev.textContent = c.last
                ? (c.last.regno === PAPA ? 'Tu: ' : '') + (c.last.testo || '')
                : 'Nessuna lettera ancora.';

            row.appendChild(top); row.appendChild(prev);
            row.addEventListener('click', () => open(c.name));
            box.appendChild(row);
        });
    }

    // "Nuova lettera a…": tutti i regni (e le encicliche), per aprire un filo
    // che non c'è ancora. Scelto, torna sulla voce guida.
    function renderSelect() {
        const sel = $('pope-target');
        if (!sel) return;
        const ks = kingdoms();
        const sig = ks.map(k => k.name).join('|');
        if (sig === lastSelSig) return;
        lastSelSig = sig;
        sel.innerHTML = '';
        const add = (value, text) => {
            const o = doc.createElement('option');
            o.value = value; o.textContent = text;
            sel.appendChild(o);
        };
        add('__', '✉ Nuova lettera a…');
        add(ENC, '🌍 Tutti i regni (enciclica pubblica)');
        ks.forEach(k => add(k.name, '🔒 ' + k.name));
        sel.value = '__';
    }

    function renderTotal() {
        const box = $('pope-unread');
        if (!box) return;
        const tot = conversations().reduce((a, c) => a + unread(c.name), 0);
        box.textContent = tot ? '✉ ' + tot : '';
        box.style.display = tot ? '' : 'none';
    }

    function renderLog() {
        const head = $('pope-thread-head');
        if (head) head.textContent = target === ENC
            ? '🌍 Encicliche — le leggono tutti i regni'
            : '🔒 Lettere con ' + target;
        const log = $('pope-log');
        if (!log) return;
        const msgs = thread(target);
        // Il controllo ogni 2 s non deve riportare in fondo chi sta rileggendo.
        const sig = target + '#' + msgs.length + '#' + (msgs.length ? msgs[msgs.length - 1].id : '');
        if (sig === lastLogSig) return;
        lastLogSig = sig;
        log.innerHTML = '';
        if (!msgs.length) {
            const e = doc.createElement('div');
            e.className = 'pope-empty';
            e.textContent = target !== ENC
                ? 'Nessuna lettera fra il Papa e ' + target + '.'
                : 'Nessuna enciclica. Quel che scrivi qui lo leggono tutti i regni.';
            log.appendChild(e);
            return;
        }
        msgs.forEach(m => {
            const row = doc.createElement('div');
            row.className = 'pope-msg' + (m.regno === PAPA ? ' mine' : '');
            const meta = doc.createElement('div');
            meta.className = 'pope-meta';
            const dot = doc.createElement('span');
            dot.className = 'pope-dot';
            dot.style.background = m.colore || '#888';
            const who = doc.createElement('b');
            who.textContent = m.regno === PAPA ? '✝ ' + PAPA : (m.regno || '—');
            const when = doc.createElement('span');
            when.textContent = ' ' + time(m.ts);
            meta.appendChild(dot); meta.appendChild(who); meta.appendChild(when);
            const bub = doc.createElement('div');
            bub.className = 'pope-bubble';
            bub.textContent = m.testo || '';
            row.appendChild(meta); row.appendChild(bub);
            log.appendChild(row);
        });
        log.scrollTop = log.scrollHeight;
    }

    function render() {
        const box = $('pope-controls');
        if (!box) return;
        const admin = isAdmin();
        box.style.display = admin ? 'block' : 'none';
        if (!admin) return;
        // Aperto un filo, le lettere di quel regno sono lette.
        markSeen(target);
        renderSelect();
        renderThreads();
        renderTotal();
        renderLog();
        const inp = $('pope-text');
        if (inp) inp.placeholder = target !== ENC
            ? 'Lettera privata a ' + target + '…'
            : 'Enciclica a tutti i regni…';
    }

    function open(name) {
        target = name;
        lastListSig = ''; lastLogSig = '';
        render();
        const inp = $('pope-text');
        if (inp) inp.focus();
    }

    function send() {
        const inp = $('pope-text');
        const s = sync();
        if (!inp || !s || !s.sendChat || !isAdmin()) return;
        const text = (inp.value || '').trim();
        if (!text) return;
        const r = R();
        const msg = { testo: text.slice(0, 500), regno: PAPA, colore: COLORE, papa: true,
                      turno: (r && r.turn) ? r.turn() : null };
        if (target !== ENC) {
            const k = kingdoms().find(p => p.name === target);
            msg.to = target;
            if (k) msg.toId = k.id;
        }
        s.sendChat(msg);
        inp.value = '';
        inp.focus();
    }

    function wire() {
        const sel = $('pope-target');
        if (sel) sel.addEventListener('change', () => {
            if (sel.value === '__') return;
            const v = sel.value;
            sel.value = '__';
            open(v);
        });
        const btn = $('pope-send');
        if (btn) btn.addEventListener('click', send);
        const inp = $('pope-text');
        if (inp) inp.addEventListener('keydown', e => {
            // Invio manda, Maiusc+Invio va a capo.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });
        const s = sync();
        if (s && s.onChatChange) s.onChatChange(msgs => {
            messages = Array.isArray(msgs) ? msgs : [];
            render();
        });
        // I regni nascono e cambiano nome a partita in corso, e l'admin si
        // riconosce solo dopo il login: un controllo leggero ogni 2 s basta
        // (ogni parte ridisegna solo se qualcosa è cambiato).
        setInterval(render, 2000);
        render();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', wire);
    else wire();

    root.PopeChat = { render: render, open: open, NAME: PAPA };
})(window, document);

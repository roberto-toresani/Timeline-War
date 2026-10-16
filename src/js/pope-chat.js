// ============================================================
// ✝ IL PAPA — la voce dell'admin in chat (regola dell'utente)
//
// Il Papa NON è un regno: niente province, niente turno, niente record in
// PLAYERS. È solo una firma in chat, che l'admin presta da qui (editor). Scrive
// in PRIVATO a qualunque regno — confini o no, nebbia o no — oppure a tutti
// (un'enciclica sul canale pubblico). Ogni regno trova nella sua chat il filo
// "✝ Il Papa" sempre in elenco e può rispondergli lì (player-board.js).
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

    const R = () => root.Risiko;
    const $ = id => doc.getElementById(id);
    const sync = () => (typeof MultiplayerSync !== 'undefined' ? MultiplayerSync : null);

    let messages = [];
    let target = '';            // '' = tutti (enciclica), altrimenti il NOME del regno
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (e) { seen = {}; }
    let lastSig = '';
    let lastLogSig = '';

    function isAdmin() {
        const r = R();
        return !!(r && r.isAdmin && r.isAdmin());
    }

    function kingdoms() {
        const r = R();
        return (r && r.players) ? r.players() : [];
    }

    // Il filo fra il Papa e un regno; con '' l'elenco delle encicliche.
    function thread(name) {
        if (!name) return messages.filter(m => m.regno === PAPA && !m.to);
        return messages.filter(m =>
            (m.regno === PAPA && m.to === name) || (m.to === PAPA && m.regno === name));
    }

    // Quanti messaggi AL Papa da quel regno non sono ancora stati letti qui.
    function unread(name) {
        const at = seen[name] || 0;
        return messages.filter(m => m.to === PAPA && m.regno === name && (m.ts || 0) > at).length;
    }

    function markSeen(name) {
        if (!name) return;
        const last = thread(name).reduce((a, m) => Math.max(a, m.ts || 0), 0);
        if (last > (seen[name] || 0)) {
            seen[name] = last;
            try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* privato */ }
        }
    }

    function time(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const p = n => String(n).padStart(2, '0');
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function renderSelect() {
        const sel = $('pope-target');
        if (!sel) return;
        const ks = kingdoms();
        const sig = ks.map(k => k.name + ':' + unread(k.name)).join('|') + '#' + target;
        if (sig === lastSig) return;
        lastSig = sig;
        if (target && !ks.some(k => k.name === target)) target = '';
        sel.innerHTML = '';
        const all = doc.createElement('option');
        all.value = ''; all.textContent = '🌍 Tutti i regni (enciclica pubblica)';
        sel.appendChild(all);
        ks.forEach(k => {
            const o = doc.createElement('option');
            const n = unread(k.name);
            o.value = k.name;
            o.textContent = '🔒 ' + k.name + (n ? '  — ✉ ' + n + ' nuov' + (n === 1 ? 'o' : 'i') : '');
            sel.appendChild(o);
        });
        sel.value = target;
    }

    function renderTotal() {
        const box = $('pope-unread');
        if (!box) return;
        const tot = kingdoms().reduce((a, k) => a + unread(k.name), 0);
        box.textContent = tot ? '✉ ' + tot : '';
        box.style.display = tot ? '' : 'none';
    }

    function renderLog() {
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
            e.textContent = target
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
        if (target) markSeen(target);
        renderSelect();
        renderTotal();
        renderLog();
        const inp = $('pope-text');
        if (inp) inp.placeholder = target
            ? 'Lettera privata a ' + target + '…'
            : 'Enciclica a tutti i regni…';
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
        if (target) {
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
        if (sel) sel.addEventListener('change', () => { target = sel.value; lastSig = ''; render(); });
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
            lastSig = '';
            render();
        });
        // I regni nascono e cambiano nome a partita in corso, e l'admin si
        // riconosce solo dopo il login: un controllo leggero ogni 2 s basta
        // (renderSelect non ridisegna se niente è cambiato).
        setInterval(render, 2000);
        render();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', wire);
    else wire();

    root.PopeChat = { render: render, NAME: PAPA };
})(window, document);

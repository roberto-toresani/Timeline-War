// ============================================================
// ✝ IL PAPA — la voce dell'admin in chat (regola dell'utente)
//
// Il Papa NON è un regno: niente province, niente turno, niente record in
// PLAYERS. È solo una firma in chat, che l'admin presta da qui. Scrive in
// PRIVATO a qualunque regno — confini o no, nebbia o no — oppure a tutti
// (un'enciclica sul canale pubblico). Ogni regno trova nella sua chat il filo
// "✝ Il Papa" e può rispondergli lì (player-board.js; i regni musulmani solo
// dopo che il Papa ha scritto loro).
//
// È una FINESTRA A PARTE (regola dell'utente), non un pannello dell'editor:
// normalmente CHIUSA, si apre col bottone ✝ che solo l'admin vede, sia
// nell'editor sia nella plancia, da PC e da telefono. Il modulo costruisce da
// sé bottone e finestra, quindi basta caricarlo in una pagina.
//   · a sinistra i REGNI con la loro relazione con la Santa Sede — fede di
//     stato, come la Chiesa li considera, se possono scrivere al Papa, chi li
//     governa, lettere scambiate, ultimo contatto, non lette;
//   · a destra il filo aperto e la riga d'invio.
//   Da telefono è una colonna sola: l'elenco, e il filo sopra con "← Regni".
//
// Trasporto: la stessa collezione `chat` di sync.js. Un messaggio del Papa è
// {regno:'Il Papa', papa:true, to?, toId?}; uno al Papa è {regno:<regno>,
// to:'Il Papa', papa:true}. `papa:true` dice ai bot di non rispondere.
// Il "letto" sta in localStorage (comodità di chi guarda).
// ============================================================

(function (root, doc) {
    'use strict';

    const PAPA = 'Il Papa';
    const COLORE = '#f2e2a0';
    const SEEN_KEY = 'risiko_papa_seen';
    const ENC = '';             // la "conversazione" delle encicliche (canale pubblico)

    const R = () => root.Risiko;
    const sync = () => (typeof MultiplayerSync !== 'undefined' ? MultiplayerSync : null);

    let messages = [];
    let target = null;          // null = nessun filo aperto; ENC = encicliche; altrimenti NOME del regno
    let isOpen = false;
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (e) { seen = {}; }
    let lastListSig = '';
    let lastLogSig = '';
    let el = null;              // i pezzi della finestra, creati una volta

    // Una plancia aperta col link d'invito (?p=) è la pagina di un giocatore:
    // lì il Papa non compare nemmeno se chi guarda è l'admin.
    const onPlayerLink = (() => {
        try { return new URLSearchParams(root.location.search).has('p'); } catch (e) { return false; }
    })();

    function isAdmin() {
        const r = R();
        return !onPlayerLink && !!(r && r.isAdmin && r.isAdmin());
    }

    function kingdoms() {
        const r = R();
        return (r && r.players) ? r.players() : [];
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ---------- i fili ----------

    function thread(name) {
        if (name === ENC) return messages.filter(m => m.regno === PAPA && !m.to);
        return messages.filter(m =>
            (m.regno === PAPA && m.to === name) || (m.to === PAPA && m.regno === name));
    }

    function unread(name) {
        if (name === ENC || name == null) return 0;
        const at = seen[name] || 0;
        return messages.filter(m => m.to === PAPA && m.regno === name && (m.ts || 0) > at).length;
    }

    function totalUnread() {
        const names = new Set(kingdoms().map(k => k.name));
        messages.forEach(m => { if (m.to === PAPA && m.regno) names.add(m.regno); });
        let t = 0;
        names.forEach(n => { t += unread(n); });
        return t;
    }

    function markSeen(name) {
        if (name === ENC || name == null) return;
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
        const stessoGiorno = d.toDateString() === new Date().toDateString();
        return (stessoGiorno ? '' : p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ') +
            p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // ---------- la relazione con la Santa Sede ----------
    // Tutta letta dallo stato che il gioco già tiene: niente campi nuovi.

    function faithOf(k) {
        const r = R();
        const fede = (r && r.stateReligionOf) ? r.stateReligionOf(k) : null;
        const Rel = root.Religions;
        if (fede && Rel) return { id: fede, label: Rel.label(fede), fam: Rel.familyOf(fede), color: Rel.color(fede) };
        // Senza Capitale non c'è fede di stato: la famiglia che pesa sui patti
        // (dottrina, poi maggioranza delle province) dice almeno da che parte sta.
        const fam = (root.Bot && root.Bot.faithFamilyOf) ? root.Bot.faithFamilyOf(k) : null;
        return fam ? { id: null, label: fam.charAt(0).toUpperCase() + fam.slice(1), fam: fam, color: '#888' } : null;
    }

    // Come la Chiesa di Roma guarda quel regno, dalla sua fede.
    function standing(f) {
        if (!f) return { label: 'Fede ignota', cls: 'unk' };
        if (f.id === 'cattolici' || f.id === 'cristiani') return { label: 'Figlio della Chiesa', cls: 'faithful' };
        if (f.id === 'ortodossi') return { label: 'Scismatico', cls: 'schism' };
        if (f.id === 'protestanti') return { label: 'Eretico', cls: 'heretic' };
        if (f.fam === 'cristiani') return { label: 'Cristiano', cls: 'faithful' };
        if (f.fam === 'musulmani') return { label: 'Infedele', cls: 'infidel' };
        return { label: 'Pagano', cls: 'pagan' };
    }

    function relationOf(k) {
        const f = faithOf(k);
        const th = thread(k.name);
        const sent = th.filter(m => m.regno === PAPA).length;
        const recv = th.length - sent;
        const last = th.length ? th[th.length - 1] : null;
        // Stessa regola della plancia (papaReachable): un regno musulmano non si
        // rivolge al Papa finché il Papa non gli ha scritto.
        const voce = (f && f.fam === 'musulmani')
            ? (sent ? 'Può rispondere al Papa' : 'Non scrive finché il Papa non scrive')
            : 'Può scrivere al Papa';
        const chi = k.bot ? '🤖 IA — non risponde' : (k.controllo === 'player' ? '👤 Giocatore' : '🧑 Admin');
        return { fede: f, st: standing(f), sent, recv, last, voce, chi, unread: unread(k.name) };
    }

    // ---------- la finestra ----------

    function build() {
        if (el) return el;
        const fab = doc.createElement('button');
        fab.type = 'button';
        fab.id = 'pope-fab';
        fab.title = 'Il Papa — lettere ai regni';
        fab.innerHTML = '<span class="pf-ico">✝</span><span class="pf-badge" style="display:none;"></span>';
        fab.style.display = 'none';
        fab.addEventListener('click', () => (isOpen ? close() : open()));

        const win = doc.createElement('div');
        win.id = 'pope-win';
        win.style.display = 'none';
        win.innerHTML =
            '<div class="pw-box" role="dialog" aria-label="La Santa Sede">' +
              '<header class="pw-head">' +
                '<span class="pw-title">✝ La Santa Sede</span>' +
                '<span class="pw-sub">lettere e rapporti con i regni</span>' +
                '<span class="pw-unread" style="display:none;"></span>' +
                '<button type="button" class="pw-close" title="Chiudi (Esc)">✕</button>' +
              '</header>' +
              '<div class="pw-body">' +
                '<aside class="pw-list"></aside>' +
                '<section class="pw-thread">' +
                  '<div class="pw-thead">' +
                    '<button type="button" class="pw-back">← Regni</button>' +
                    '<div class="pw-tinfo"></div>' +
                  '</div>' +
                  '<div class="pw-log"></div>' +
                  '<form class="pw-form" autocomplete="off">' +
                    '<textarea class="pw-text" rows="2" maxlength="500"></textarea>' +
                    '<button type="submit" class="pw-send">✉ Invia</button>' +
                  '</form>' +
                '</section>' +
              '</div>' +
            '</div>';
        doc.body.appendChild(fab);
        doc.body.appendChild(win);

        el = {
            fab, win,
            badge: fab.querySelector('.pf-badge'),
            unread: win.querySelector('.pw-unread'),
            list: win.querySelector('.pw-list'),
            info: win.querySelector('.pw-tinfo'),
            log: win.querySelector('.pw-log'),
            form: win.querySelector('.pw-form'),
            text: win.querySelector('.pw-text')
        };

        win.querySelector('.pw-close').addEventListener('click', close);
        win.querySelector('.pw-back').addEventListener('click', () => select(null));
        // Un clic sul velo (fuori dal riquadro) chiude, come le altre finestre.
        win.addEventListener('mousedown', e => { if (e.target === win) close(); });
        el.list.addEventListener('click', e => {
            const card = e.target.closest && e.target.closest('.pw-card');
            if (card) select(card.dataset.name);
        });
        el.form.addEventListener('submit', e => { e.preventDefault(); send(); });
        el.text.addEventListener('keydown', e => {
            // Invio manda, Maiusc+Invio va a capo.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });
        doc.addEventListener('keydown', e => { if (isOpen && e.key === 'Escape') close(); });
        return el;
    }

    function open() {
        if (!isAdmin()) return;
        build();
        isOpen = true;
        el.win.style.display = '';
        el.fab.classList.add('on');
        // Da PC si apre già sul filo più recente; da telefono si parte dall'elenco.
        if (target == null && !narrow()) {
            const recente = cards()[0];
            target = recente ? recente.name : ENC;
        }
        lastListSig = ''; lastLogSig = '';
        render();
    }

    function close() {
        isOpen = false;
        if (!el) return;
        el.win.style.display = 'none';
        el.fab.classList.remove('on');
    }

    function narrow() { return root.matchMedia && root.matchMedia('(max-width: 820px)').matches; }

    function select(name) {
        target = name;
        lastListSig = ''; lastLogSig = '';
        render();
        if (name != null && el && !narrow()) el.text.focus();
    }

    // Le schede dell'elenco: le encicliche, poi i regni con cui c'è già
    // corrispondenza (dalla più recente), poi tutti gli altri per nome. Un regno
    // uscito di scena resta col suo nome finché ha lettere.
    function cards() {
        const byName = new Map();
        kingdoms().forEach(k => byName.set(k.name, k));
        messages.forEach(m => {
            const n = m.regno === PAPA ? m.to : (m.to === PAPA ? m.regno : null);
            if (n && !byName.has(n)) byName.set(n, { name: n, color: m.colore || '#888', ghost: true });
        });
        const list = Array.from(byName.values()).map(k => {
            const rel = k.ghost ? null : relationOf(k);
            const th = thread(k.name);
            return { name: k.name, color: k.color, k, rel, lastTs: th.length ? (th[th.length - 1].ts || 0) : 0 };
        });
        list.sort((a, b) => (b.lastTs - a.lastTs) || a.name.localeCompare(b.name));
        return list;
    }

    function renderList() {
        const cs = cards();
        const enc = thread(ENC);
        const sig = target + '|' + enc.length + '|' + cs.map(c =>
            c.name + ':' + c.lastTs + ':' + (c.rel ? c.rel.unread + c.rel.st.label + c.rel.chi : '')).join('|');
        if (sig === lastListSig) return;
        lastListSig = sig;

        const encLast = enc.length ? enc[enc.length - 1] : null;
        let html = '<button type="button" class="pw-card enc' + (target === ENC ? ' on' : '') + '" data-name="">' +
            '<div class="pw-crow"><span class="pw-dot" style="background:' + COLORE + '"></span>' +
            '<span class="pw-cname">🌍 Encicliche</span>' +
            '<span class="pw-when">' + (encLast ? time(encLast.ts) : '') + '</span></div>' +
            '<div class="pw-cmeta">A tutti i regni, sul canale pubblico · ' + enc.length + ' inviate</div></button>';

        cs.forEach(c => {
            const r = c.rel;
            const last = r ? r.last : null;
            html += '<button type="button" class="pw-card' + (target === c.name ? ' on' : '') + '" data-name="' + esc(c.name) + '">' +
                '<div class="pw-crow"><span class="pw-dot" style="background:' + esc(c.color || '#888') + '"></span>' +
                '<span class="pw-cname">' + esc(c.name) + '</span>' +
                (r && r.unread ? '<span class="pw-badge">' + r.unread + '</span>' : '') +
                '<span class="pw-when">' + (last ? esc(time(last.ts)) : '') + '</span></div>';
            if (r) {
                html += '<div class="pw-tags">' +
                    '<span class="pw-tag st-' + r.st.cls + '">' + esc(r.st.label) + '</span>' +
                    (r.fede ? '<span class="pw-tag"><i style="background:' + esc(r.fede.color) + '"></i>' + esc(r.fede.label) + '</span>' : '') +
                    '</div>' +
                    '<div class="pw-cmeta">' + esc(r.chi) + ' · ✉ ' + r.sent + ' inviate · ' + r.recv + ' ricevute</div>';
                if (last) {
                    html += '<div class="pw-prev' + (r.unread ? ' new' : '') + '">' +
                        (last.regno === PAPA ? 'Tu: ' : '') + esc(last.testo) + '</div>';
                }
            } else {
                html += '<div class="pw-cmeta">Regno non più in gioco</div>';
            }
            html += '</button>';
        });
        el.list.innerHTML = html;
    }

    function renderThread() {
        const box = el.win.querySelector('.pw-box');
        box.classList.toggle('has-thread', target != null);
        if (target == null) {
            el.info.innerHTML = '';
            el.log.innerHTML = '<div class="pw-empty">Scegli un regno a sinistra per leggere le lettere e scrivergli.</div>';
            el.text.disabled = true;
            lastLogSig = '';
            return;
        }
        el.text.disabled = false;
        el.text.placeholder = target === ENC ? 'Enciclica a tutti i regni…' : 'Lettera privata a ' + target + '…';

        // Intestazione del filo: chi è e com'è messo con Roma.
        if (target === ENC) {
            el.info.innerHTML = '<div class="pw-tname">🌍 Encicliche</div>' +
                '<div class="pw-tline">Le leggono tutti i regni nel canale pubblico della chat.</div>';
        } else {
            const k = kingdoms().find(p => p.name === target);
            const r = k ? relationOf(k) : null;
            el.info.innerHTML = '<div class="pw-tname"><span class="pw-dot" style="background:' +
                esc(k ? k.color : '#888') + '"></span>' + esc(target) + '</div>' +
                (r ? '<div class="pw-tags">' +
                    '<span class="pw-tag st-' + r.st.cls + '">' + esc(r.st.label) + '</span>' +
                    (r.fede ? '<span class="pw-tag"><i style="background:' + esc(r.fede.color) + '"></i>' + esc(r.fede.label) + '</span>' : '') +
                    '<span class="pw-tag">' + esc(r.chi) + '</span>' +
                    '<span class="pw-tag">' + esc(r.voce) + '</span>' +
                    '</div>' : '<div class="pw-tline">Regno non più in gioco.</div>');
        }

        const msgs = thread(target);
        // Il controllo periodico non deve riportare in fondo chi sta rileggendo.
        const sig = target + '#' + msgs.length + '#' + (msgs.length ? msgs[msgs.length - 1].id : '');
        if (sig === lastLogSig) return;
        lastLogSig = sig;
        if (!msgs.length) {
            el.log.innerHTML = '<div class="pw-empty">' + (target === ENC
                ? 'Nessuna enciclica. Quel che scrivi qui lo leggono tutti i regni.'
                : 'Nessuna lettera fra il Papa e ' + esc(target) + '.') + '</div>';
            return;
        }
        el.log.innerHTML = msgs.map(m => {
            const mine = m.regno === PAPA;
            return '<div class="pw-msg' + (mine ? ' mine' : '') + '">' +
                '<div class="pw-mmeta"><span class="pw-dot" style="background:' + esc(m.colore || '#888') + '"></span>' +
                '<b>' + esc(mine ? '✝ ' + PAPA : (m.regno || '—')) + '</b> ' + esc(time(m.ts)) + '</div>' +
                '<div class="pw-bubble">' + esc(m.testo) + '</div></div>';
        }).join('');
        el.log.scrollTop = el.log.scrollHeight;
    }

    function render() {
        const admin = isAdmin();
        if (!admin) {
            if (el) { el.fab.style.display = 'none'; close(); }
            return;
        }
        build();
        el.fab.style.display = '';
        if (isOpen && target != null) markSeen(target);
        const tot = totalUnread();
        el.badge.textContent = tot;
        el.badge.style.display = tot ? '' : 'none';
        if (!isOpen) return;
        el.unread.textContent = tot ? '✉ ' + tot + ' da leggere' : '';
        el.unread.style.display = tot ? '' : 'none';
        renderList();
        renderThread();
    }

    function send() {
        const s = sync();
        if (!el || !s || !s.sendChat || !isAdmin() || target == null) return;
        const text = (el.text.value || '').trim();
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
        el.text.value = '';
        el.text.focus();
    }

    function wire() {
        const s = sync();
        if (s && s.onChatChange) s.onChatChange(msgs => {
            messages = Array.isArray(msgs) ? msgs : [];
            render();
        });
        // I regni nascono e cambiano a partita in corso, e l'admin si riconosce
        // solo dopo il login: un controllo leggero ogni 2 s basta (ogni parte
        // ridisegna solo se qualcosa è cambiato).
        setInterval(render, 2000);
        render();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', wire);
    else wire();

    root.PopeChat = { open: open, close: close, render: render, NAME: PAPA };
})(window, document);

// ============================================================
// VOCE DELLA BATTAGLIA (js/audio.js) — urla, acciaio, tamburo.
//
// Il gioco non ha file audio e non ne vuole: nessun build step, nessuna
// dipendenza, GitHub Pages serve solo quel che c'e' in src/. Quindi il grido
// dell'oste si SINTETIZZA con WebAudio, come la grana della carta si cuoce in
// un canvas invece di caricare una texture (map-decor.js).
//
// COS'E' UN GRIDO DI BATTAGLIA, e cosa NON e' (imparato sbagliando): la prima
// versione faceva la massa con rumore filtrato che gonfiava e calava — cioe'
// il modo esatto in cui si sintetizza il MARE. Una folla non e' rumore: e'
// tante GOLE, ognuna con la sua altezza, le sue formanti e il suo attacco
// consonantico. Il rumore, se c'e', sta sotto e non si sente da solo.
//
// Come lo fanno i giochi di guerra (Total War, Age of Empires, Mount & Blade),
// e come e' fatto qui:
//   1) CORNO     — il segnale che parte l'assalto: due voci di ottone in quinta,
//                  attacco lento, la cosa che dice "si va" prima ancora del resto;
//   2) TAMBURI   — due colpi bassi, non uno: un colpo solo e' un tonfo, due sono
//                  una marcia;
//   3) L'URLO    — una salva COMPATTA di gole all'unisono ("HAAA!"), che e' quel
//                  che si riconosce come grido di guerra, seguita da una folla
//                  SFILACCIATA che continua a urlare sfasata: e' lo sfasamento a
//                  fare la massa, non il volume;
//   4) ACCIAIO   — le lame, sparse dopo il grido: partite le urla, si combatte.
// Ogni gola ha (a) un attacco CONSONANTICO — un colpo di rumore di 30 ms, la
// "R" di "RAAAH": senza, la voce non parte, sfuma dentro; (b) tre FORMANTI da
// vocale aperta; (c) un RASP (waveshaper): un urlo e' una voce forzata, e la
// distorsione e' proprio quello che l'orecchio riconosce come "sforzato".
//
// Modulo puro-effetto: non legge e non scrive nulla dello stato di gioco.
// L'unico stato e' il MUTO, che e' una preferenza di chi guarda e vive in
// localStorage (come la velocita' dell'IA sta nella plancia e non nella partita).
// ============================================================

(function () {
    'use strict';

    // ---------- INTERRUTTORE GENERALE (scelta dell'utente) ----------
    // Le urla sono SPENTE. Non era il muto del giocatore a mancare: la scena
    // della battaglia si SENTE anche quando non si VEDE — `playBattleFx` lancia
    // il grido per ogni battaglia che passa la nebbia, comprese quelle dei bot
    // fuori dall'inquadratura — e a 600 ms per azione diventa un rumore
    // continuo. Finche' non ci sara' un aggancio che suoni solo cio' che si
    // vede, il modulo non si espone affatto: senza `window.RisikoAudio` app.js
    // salta il grido (`if (window.RisikoAudio)`) e la plancia nasconde da se'
    // il bottone 🔊 (wireSoundBtn). Si riaccende cambiando questa costante.
    const ENABLED = false;
    if (!ENABLED) return;

    const KEY = 'risiko-audio-muto';
    const VOLUME = 0.85;        // volume generale: la battaglia non deve urlare in casa
    const MIN_GAP = 350;        // ms fra due gridi (l'IA lampo ne farebbe una poltiglia)

    let ctx = null;
    let noiseBuf = null;
    let raspCurve = null;
    let muted = false;
    let lastCry = 0;

    try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }

    // Il contesto audio non puo' nascere prima di un gesto dell'utente: i browser
    // lo creano sospeso. Si apre al primo clic o al primo tasto e resta aperto.
    function ac() {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        if (!ctx) { try { ctx = new C(); } catch (e) { return null; } }
        // resume() puo' fallire sia lanciando sia rifiutando la promessa (e una
        // promessa rifiutata il try/catch non la prende): si zittiscono entrambe.
        if (ctx.state === 'suspended') {
            try {
                const r = ctx.resume();
                if (r && r.catch) r.catch(() => { /* ignora */ });
            } catch (e) { /* ignora */ }
        }
        return ctx;
    }

    ['pointerdown', 'keydown'].forEach(ev => {
        document.addEventListener(ev, function unlock() {
            if (!muted) ac();
        }, { passive: true });
    });

    function noise(c) {
        if (!noiseBuf) {
            const len = Math.floor(c.sampleRate * 2.5);
            noiseBuf = c.createBuffer(1, len, c.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        const src = c.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        return src;
    }

    function filt(c, type, freq, q) {
        const f = c.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        if (q != null) f.Q.value = q;
        return f;
    }

    function gainNode(c, v) {
        const g = c.createGain();
        g.gain.value = v == null ? 1 : v;
        return g;
    }

    // Il RASP della voce forzata: una tanh che schiaccia le creste. E' la
    // differenza fra "canta" e "urla".
    function rasp(c, drive) {
        const ws = c.createWaveShaper();
        if (!raspCurve) {
            const n = 1024;
            raspCurve = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const x = (i / (n - 1)) * 2 - 1;
                raspCurve[i] = Math.tanh(x * 3.2);
            }
        }
        ws.curve = raspCurve;
        ws.oversample = '2x';
        const pre = gainNode(c, drive == null ? 2.5 : drive);
        pre.connect(ws);
        return { in: pre, out: ws };
    }

    // Panning: dove non c'e' StereoPanner (Safari vecchio) si va in mono, non si
    // rinuncia al suono.
    function pan(c, v) {
        if (!c.createStereoPanner) return null;
        const p = c.createStereoPanner();
        p.pan.value = v;
        return p;
    }

    function chain(nodes, out) {
        let prev = null;
        nodes.forEach(n => { if (prev) prev.connect(n); prev = n; });
        if (prev) prev.connect(out);
    }

    // ---------- il corno di guerra ----------
    // Due voci in quinta, attacco lento: e' il segnale, non l'assalto. Sta sotto
    // le urla e si sente soprattutto nel primo mezzo secondo.
    function horn(c, out, t, len) {
        [1, 1.5].forEach((k, i) => {
            const o = c.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(105 * k * 0.99, t);
            o.frequency.linearRampToValueAtTime(105 * k, t + 0.25);
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.2 / (i + 1), t + 0.18);
            g.gain.setValueAtTime(0.2 / (i + 1), t + len * 0.6);
            g.gain.exponentialRampToValueAtTime(0.0001, t + len);
            chain([o, filt(c, 'lowpass', 1400, 0.9), g], out);
            o.start(t); o.stop(t + len + 0.05);
        });
    }

    // ---------- i tamburi ----------
    function drum(c, out, t, forza) {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(44, t + 0.25);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(forza, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(g); g.connect(out);
        osc.start(t); osc.stop(t + 0.55);

        // la pelle: un colpo corto sopra il tonfo, se no e' un basso e basta
        const n = noise(c);
        const ng = c.createGain();
        ng.gain.setValueAtTime(0.28 * forza, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        chain([n, filt(c, 'lowpass', 1100), ng], out);
        n.start(t); n.stop(t + 0.2);
    }

    // ---------- una gola ----------
    // (a) la consonante: 30 ms di rumore, la "R" che fa partire l'urlo;
    // (b) la vocale: onda ricca -> rasp -> tre formanti di /a/ aperta;
    // (c) l'altezza: sale di scatto in 60 ms (un urlo non "attacca" in tono, ci
    //     arriva sopra) e poi cede.
    function shout(c, out, t, f0, len, gain, where) {
        const p = pan(c, where);
        const dest = p || out;
        if (p) p.connect(out);

        // (a) consonante
        const cn = noise(c);
        const cg = c.createGain();
        cg.gain.setValueAtTime(gain * 0.9, t);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        chain([cn, filt(c, 'bandpass', 1500 + Math.random() * 900, 1.1), cg], dest);
        cn.start(t); cn.stop(t + 0.08);

        // (b+c) vocale
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f0 * 0.72, t);
        osc.frequency.exponentialRampToValueAtTime(f0 * 1.06, t + 0.06);
        osc.frequency.setValueAtTime(f0 * 1.06, t + len * 0.45);
        osc.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + len);

        // vibrato + jitter: due modulatori lenti e scorrelati. Un urlo tenuto
        // fermo suona come una sirena.
        const lfo = c.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 5 + Math.random() * 4;
        const lfoG = gainNode(c, f0 * (0.03 + Math.random() * 0.04));
        lfo.connect(lfoG); lfoG.connect(osc.frequency);

        const dist = rasp(c, 2.2 + Math.random());
        osc.connect(dist.in);

        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.045);          // attacco secco
        g.gain.linearRampToValueAtTime(gain * 0.72, t + len * 0.65);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);

        // tre formanti di vocale aperta (/a/): F1 ~700, F2 ~1150, F3 ~2600.
        // Sono loro a far dire all'orecchio "e' una bocca", non un filtro.
        const scarto = 0.9 + Math.random() * 0.2;
        [[700, 6, 1], [1150, 8, 0.7], [2600, 9, 0.35]].forEach(f => {
            const bp = filt(c, 'bandpass', f[0] * scarto, f[1]);
            const fg = gainNode(c, f[2]);
            dist.out.connect(bp); bp.connect(fg); fg.connect(g);
        });
        g.connect(dest);

        osc.start(t); osc.stop(t + len + 0.05);
        lfo.start(t); lfo.stop(t + len + 0.05);
    }

    // ---------- l'acciaio ----------
    function clash(c, out, t, where) {
        const p = pan(c, where);
        const dest = p || out;
        if (p) p.connect(out);

        const n = noise(c);
        const g = c.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        chain([n, filt(c, 'highpass', 3000), g], dest);
        n.start(t); n.stop(t + 0.15);

        // il "ding": parziali inarmonici, il suono di due lame che si incontrano
        [1, 1.71, 2.43].forEach((k, i) => {
            const o = c.createOscillator();
            o.type = 'triangle';
            o.frequency.value = (2100 + Math.random() * 1100) * k;
            const og = c.createGain();
            og.gain.setValueAtTime(0.1 / (i + 1), t);
            og.gain.exponentialRampToValueAtTime(0.0001, t + 0.42 - i * 0.12);
            o.connect(og); og.connect(dest);
            o.start(t); o.stop(t + 0.45);
        });
    }

    // ============================================================
    // IL GRIDO — si chiama quando l'attacco parte (playBattleFx in app.js).
    // `scala` 0..1 dice quanto e' grosso l'assalto: cambia quante gole si sentono
    // e quanto dura la coda, non il volume — un attacco piccolo non deve essere
    // un attacco lontano.
    // ============================================================
    function battleCry(opts) {
        if (muted) return;
        const c = ac();
        if (!c) return;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (now - lastCry < MIN_GAP) return;     // niente poltiglia con l'IA lampo
        lastCry = now;

        const o = opts || {};
        const scala = Math.max(0, Math.min(1, o.scala == null ? 0.5 : o.scala));
        const t0 = c.currentTime + 0.02;

        const master = gainNode(c, VOLUME);
        master.connect(c.destination);
        // Un filo di compressione: dieci gole che partono insieme, senza, saturano.
        let bus = master;
        if (c.createDynamicsCompressor) {
            const comp = c.createDynamicsCompressor();
            comp.threshold.value = -18;
            comp.ratio.value = 4;
            comp.attack.value = 0.004;
            comp.release.value = 0.25;
            comp.connect(master);
            bus = comp;
        }

        horn(c, bus, t0, 1.1);
        drum(c, bus, t0, 0.6);
        drum(c, bus, t0 + 0.34, 0.42);

        // 3a) LA SALVA: le gole partono quasi insieme — e' questa che si
        // riconosce come "grido di guerra".
        const salva = 5 + Math.round(scala * 3);
        for (let i = 0; i < salva; i++) {
            shout(c, bus, t0 + 0.06 + Math.random() * 0.06,
                150 + Math.random() * 120, 0.85 + Math.random() * 0.3,
                0.21 + Math.random() * 0.07, (Math.random() * 2 - 1) * 0.85);
        }

        // 3b) LA FOLLA: continua sfasata, piu' piano. E' lo sfasamento a fare la
        // massa: se partissero tutte insieme sarebbe un coro, non un assalto.
        const folla = 5 + Math.round(scala * 5);
        for (let i = 0; i < folla; i++) {
            shout(c, bus, t0 + 0.5 + Math.random() * (0.8 + scala * 0.5),
                130 + Math.random() * 150, 0.6 + Math.random() * 0.5,
                0.11 + Math.random() * 0.06, (Math.random() * 2 - 1) * 0.9);
        }

        // 4) l'acciaio: dopo il grido, quando i due schieramenti si toccano
        const colpi = 4 + Math.round(scala * 4);
        for (let i = 0; i < colpi; i++) {
            clash(c, bus, t0 + 0.55 + Math.random() * (1.1 + scala * 0.5),
                (Math.random() * 2 - 1) * 0.75);
        }
    }

    function setMuted(v) {
        muted = !!v;
        try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* private mode */ }
        return muted;
    }

    window.RisikoAudio = {
        battleCry,
        isMuted: () => muted,
        setMuted,
        toggle: () => setMuted(!muted)
    };
})();

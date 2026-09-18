// ============================================================
// ARCHIVIO DI PARTITE — salva, carica, riparti da zero.
//
// Tre cose diverse, da non confondere:
//   • la MAPPA INIZIALE (js/start-map.js) è una posizione di partenza — una
//     mappa, non una partita: niente tesoro, turni o strategie.
//   • il BACKUP PER TURNO (in app.js/sync.js) tiene un decennio alla volta su
//     Firestore, per rimediare a un danno durante UNA partita.
//   • questo ARCHIVIO tiene PARTITE INTERE con un nome, in localStorage (il
//     browser dell'admin): più partite convivono senza che una sovrascriva
//     l'altra. È la cura all'interferenza fra salvataggi — prima esisteva un
//     solo slot (`antigravity_map_save`) e preparare una nuova partita
//     cancellava la precedente.
//
// Uno snapshot d'archivio è lo stato COMPLETO (Risiko.snapshot(), lo stesso
// dell'autosave): caricarlo (Risiko.loadSnapshot()) rimette la partita viva e
// la ripubblica sul cloud. Solo admin, come la mappa iniziale.
// ============================================================

(function (root, doc) {
    'use strict';

    const KEY = 'risiko_save_slots';

    const R = () => root.Risiko;

    function isAdmin() {
        const r = R();
        return !!(r && r.isAdmin && r.isAdmin());
    }

    function notice(msg) {
        const r = R();
        if (r && r.engine && r.engine.notice) r.engine.notice(msg);
        else console.log('[archivio] ' + msg);
    }

    // Tutto l'archivio è un unico oggetto { id: {name, savedAt, turno, regni, data} }.
    function readSlots() {
        try {
            const raw = localStorage.getItem(KEY);
            const obj = raw ? JSON.parse(raw) : null;
            return (obj && typeof obj === 'object') ? obj : {};
        } catch (e) { return {}; }
    }

    // Ritorna true se salvato; false su quota superata (localStorage pieno).
    function writeSlots(obj) {
        try {
            localStorage.setItem(KEY, JSON.stringify(obj));
            return true;
        } catch (e) {
            return false;
        }
    }

    // Elenco ordinato dal più recente, con l'anno se il calendario è disponibile.
    function list() {
        const slots = readSlots();
        return Object.keys(slots).map(id => {
            const s = slots[id];
            return { id, name: s.name, savedAt: s.savedAt, turno: s.turno, regni: s.regni };
        }).sort((a, b) => Number(b.id) - Number(a.id));
    }

    function anno(turno) {
        return (root.Chronicle && root.Chronicle.yearOfTurn && turno)
            ? (' — ' + root.Chronicle.yearOfTurn(turno)) : '';
    }

    function nowLabel() {
        try {
            return new Date().toLocaleString('it-IT',
                { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return new Date().toISOString().slice(0, 16).replace('T', ' ');
        }
    }

    // Salva la partita in corso. Se esiste già uno slot con lo stesso nome, lo
    // sovrascrive (previa conferma) invece di crearne un doppione.
    function save() {
        const r = R();
        if (!isAdmin() || !r || !r.snapshot) return;
        const input = doc.getElementById('save-slot-name');
        let name = (input && input.value || '').trim();
        if (!name) name = 'Partita del ' + nowLabel();

        const snap = r.snapshot();
        if (!snap) { notice('La partita non è ancora pronta per essere salvata.'); return; }

        const slots = readSlots();
        // Riuso l'id di uno slot omonimo (sovrascrittura), altrimenti id nuovo.
        const dup = Object.keys(slots).find(id => (slots[id].name || '').trim().toLowerCase() === name.toLowerCase());

        const commit = (id) => {
            slots[id] = {
                name: name,
                savedAt: nowLabel(),
                turno: snap.turn,
                regni: Array.isArray(snap.players) ? snap.players.length : 0,
                data: snap
            };
            const ok = writeSlots(slots);
            if (!ok) {
                notice('Spazio del browser esaurito: elimina qualche partita salvata e riprova.');
                return;
            }
            if (input) input.value = '';
            notice('Partita salvata come «' + name + '».');
            refreshUI();
        };

        if (dup) {
            r.confirm({
                title: 'Sovrascrivere «' + name + '»?',
                text: 'Esiste già una partita salvata con questo nome. Il salvataggio precedente ' +
                    'viene sostituito da quello attuale.',
                ok: '💾 Sovrascrivi',
                tone: 'danger'
            }, () => commit(dup));
        } else {
            commit(String(Date.now()));
        }
    }

    // Carica la partita scelta: diventa la partita VIVA (anche sul cloud).
    // Abbandona quella in corso, quindi chiede conferma.
    function load() {
        const r = R();
        if (!isAdmin() || !r || !r.loadSnapshot) return;
        const sel = doc.getElementById('save-slot-select');
        const id = sel && sel.value;
        if (!id) { notice('Scegli prima una partita salvata dall\'elenco.'); return; }
        const slots = readSlots();
        const slot = slots[id];
        if (!slot || !slot.data) { notice('Salvataggio non trovato.'); refreshUI(); return; }

        r.confirm({
            title: 'Caricare «' + slot.name + '»?',
            text: 'La partita in corso viene abbandonata e sostituita da quella salvata ' +
                '(turno ' + slot.turno + anno(slot.turno) + '). Il cambiamento vale anche per ' +
                'gli altri giocatori collegati.',
            ok: '📂 Carica',
            tone: 'danger'
        }, () => {
            const ok = r.loadSnapshot(slot.data);
            notice(ok
                ? 'Partita «' + slot.name + '» caricata.'
                : 'Caricamento fallito: la mappa non è pronta.');
        });
    }

    function remove() {
        const r = R();
        if (!isAdmin() || !r) return;
        const sel = doc.getElementById('save-slot-select');
        const id = sel && sel.value;
        if (!id) { notice('Scegli prima una partita salvata dall\'elenco.'); return; }
        const slots = readSlots();
        const slot = slots[id];
        if (!slot) { refreshUI(); return; }

        r.confirm({
            title: 'Eliminare «' + slot.name + '»?',
            text: 'Il salvataggio viene cancellato definitivamente da questo browser. ' +
                'La partita in corso non viene toccata.',
            ok: '🗑 Elimina',
            tone: 'danger'
        }, () => {
            delete slots[id];
            writeSlots(slots);
            notice('Partita «' + slot.name + '» eliminata.');
            refreshUI();
        });
    }

    // "Nuova partita da zero": rimette la mappa iniziale in stato "non avviata".
    // È la stessa strada di 🗺 Carica iniziale (che ha già la sua conferma), qui
    // esposta come inizio di una partita nuova. Chi vuole conservare quella in
    // corso la salva PRIMA con 💾.
    function newGame() {
        if (!isAdmin()) return;
        if (root.StartMap && root.StartMap.load) { root.StartMap.load(); return; }
        notice('Mappa iniziale non disponibile (start-map.js non caricato).');
    }

    function refreshUI() {
        const sel = doc.getElementById('save-slot-select');
        const info = doc.getElementById('save-slot-info');
        if (!sel) return;
        const prev = sel.value;
        const items = list();
        sel.innerHTML = '';
        if (!items.length) {
            const opt = doc.createElement('option');
            opt.value = '';
            opt.textContent = 'Nessuna partita salvata';
            opt.disabled = true;
            sel.appendChild(opt);
            if (info) info.textContent = 'Salva la partita in corso per non perderla.';
            return;
        }
        items.forEach(it => {
            const opt = doc.createElement('option');
            opt.value = it.id;
            opt.textContent = it.name + ' — turno ' + it.turno + anno(it.turno) +
                ' · ' + it.regni + ' regni · ' + (it.savedAt || '');
            sel.appendChild(opt);
        });
        // Tiene la selezione se ancora esiste, altrimenti la più recente.
        if (prev && items.some(it => it.id === prev)) sel.value = prev;
        if (info) info.textContent = items.length + ' partite salvate in questo browser.';
    }

    doc.addEventListener('DOMContentLoaded', () => {
        const saveBtn = doc.getElementById('save-slot-btn');
        const loadBtn = doc.getElementById('save-slot-load-btn');
        const delBtn = doc.getElementById('save-slot-delete-btn');
        const newBtn = doc.getElementById('save-slot-new-btn');
        const nameInput = doc.getElementById('save-slot-name');
        if (saveBtn) saveBtn.addEventListener('click', save);
        if (loadBtn) loadBtn.addEventListener('click', load);
        if (delBtn) delBtn.addEventListener('click', remove);
        if (newBtn) newBtn.addEventListener('click', newGame);
        // Invio nel campo nome = salva.
        if (nameInput) nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
        refreshUI();
    });

    root.SaveSlots = { save, load, remove, newGame, list, refreshUI, KEY };

})(typeof window !== 'undefined' ? window : globalThis, document);

// ============================================================
// MAPPA INIZIALE — la posizione di partenza della partita.
//
// La si dipinge UNA volta nell'editor (province, Capitali, Città, strade,
// risorse) e la si mette in cassaforte in `data/start_map.json`: da lì torna
// identica tutte le volte che serve. È il punto zero delle prove contro l'IA
// e — a prove finite — della partita vera col giocatore umano: stessa mappa,
// stesse condizioni, partite confrontabili.
//
// Cosa NON entra nel file: tesoro, scorte, reclute, fase, turno in corso,
// strategie dei bot. La mappa iniziale è una mappa, non una partita salvata.
// Chi la carica torna a "partita non avviata" e comincia da
// "⚔️ Gioca con l'IA (mappa attuale)", che è ciò che fissa l'economia del §11.
//
// COME CI ARRIVA IL FILE: il server locale (`scripts/serve.ps1`) accetta una
// POST su /_start-map e scrive lui `src/data/start_map.json` — un click solo, e
// la mappa finisce già dov'è versionata. Se il sito è servito da altro (GitHub
// Pages) la POST fallisce e si ripiega sul download del browser: il file va poi
// copiato a mano in `src/data/`. Il ripiego non è un errore, è l'altra strada.
// ============================================================

(function (root, doc) {
    'use strict';

    const FILE = 'data/start_map.json';
    const ENDPOINT = '/_start-map';

    const R = () => root.Risiko;

    function notice(msg) {
        const r = R();
        if (r && r.engine && r.engine.notice) r.engine.notice(msg);
        else console.log('[mappa iniziale] ' + msg);
    }

    // Lettura sempre fresca: appena salvata, la mappa iniziale dev'essere quella
    // nuova anche se il browser ha in cache la vecchia.
    function read() {
        return fetch(FILE + '?t=' + Date.now(), { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : null))
            .catch(() => null);
    }

    function describe(data) {
        if (!data || !data.provinces || !Object.keys(data.provinces).length) {
            return 'Nessuna mappa iniziale salvata.';
        }
        const regni = new Set(Object.keys(data.provinces).map(id => data.provinces[id]));
        const province = Object.keys(data.provinces).length;
        return 'Mappa iniziale: ' + regni.size + ' regni, ' + province + ' province' +
            (data.salvata ? ' · ' + data.salvata : '');
    }

    function refreshInfo() {
        const box = doc.getElementById('start-map-info');
        if (!box) return Promise.resolve(null);
        return read().then(data => {
            box.textContent = describe(data);
            box.classList.toggle('on', !!(data && data.provinces));
            return data;
        });
    }

    function download(testo) {
        const url = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
        const a = doc.createElement('a');
        a.href = url;
        a.download = 'start_map.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    // Salva la mappa DIPINTA ADESSO come posizione di partenza.
    function save() {
        const r = R();
        if (!r || !r.isAdmin || !r.isAdmin()) return Promise.resolve(false);
        const dati = r.scenario ? r.scenario.capture() : null;
        if (!dati) { notice('La mappa non è ancora pronta.'); return Promise.resolve(false); }
        if (!Object.keys(dati.provinces).length) {
            notice('Non c\'è nessun regno sulla mappa: dipingi i territori prima di salvare.');
            return Promise.resolve(false);
        }
        dati.salvata = new Date().toISOString().slice(0, 10);
        const testo = JSON.stringify(dati, null, 2);

        return fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: testo
        })
            .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return true; })
            .catch(() => { download(testo); return false; })
            .then(scritta => {
                notice(scritta
                    ? 'Mappa iniziale salvata in src/' + FILE + '.'
                    : 'Il server non può scrivere: ho scaricato start_map.json, copialo in src/data/.');
                refreshInfo();
                return scritta;
            });
    }

    // Rimette la posizione di partenza. Chiede conferma: butta via la partita
    // in corso, e non è una cosa che si fa per sbaglio.
    function load() {
        const r = R();
        if (!r || !r.isAdmin || !r.isAdmin()) return Promise.resolve(false);
        return read().then(data => {
            if (!data || !data.provinces) {
                notice('Nessuna mappa iniziale salvata: dipingi i regni e premi "📌 Salva iniziale".');
                return false;
            }
            r.confirm({
                title: 'Tornare alla mappa iniziale?',
                text: 'Province, pedine e strade attuali vengono sostituite da quelle salvate e la ' +
                    'partita in corso viene abbandonata. Il calendario torna al turno 1 (1000 AD).',
                ok: '🗺 Carica',
                tone: 'danger'
            }, () => {
                const ok = r.scenario.apply(data);
                notice(ok
                    ? 'Mappa iniziale caricata. Premi "⚔️ Gioca con l\'IA" per cominciare.'
                    : 'Caricamento fallito: la mappa non è pronta.');
            });
            return true;
        });
    }

    // Pagina bianca su cui dipingere: nessun proprietario, nessuna pedina,
    // nessuna strada, nessun turno in corso.
    function clear() {
        const r = R();
        if (!r || !r.isAdmin || !r.isAdmin()) return;
        if (!root.GameSetup) { notice('setup.js non caricato.'); return; }
        r.confirm({
            title: 'Svuotare la mappa?',
            text: 'Tolgo proprietari, pedine e strade da tutte le province e fermo la partita in ' +
                'corso. La mappa iniziale già salvata non viene toccata: si ricarica quando vuoi.',
            ok: '🧹 Svuota',
            tone: 'danger'
        }, () => {
            if (root.Bot) root.Bot.stop();
            root.GameSetup.clearMap();
            r.setTurnState(null, [], 0);
            r.engine.refresh();
            r.engine.save();
            notice('Mappa svuotata: dipingi i regni, poi "📌 Salva iniziale".');
        });
    }

    doc.addEventListener('DOMContentLoaded', () => {
        const saveBtn = doc.getElementById('start-map-save-btn');
        const loadBtn = doc.getElementById('start-map-load-btn');
        const clearBtn = doc.getElementById('start-map-clear-btn');
        if (saveBtn) saveBtn.addEventListener('click', save);
        if (loadBtn) loadBtn.addEventListener('click', load);
        if (clearBtn) clearBtn.addEventListener('click', clear);
        refreshInfo();
    });

    root.StartMap = { read, save, load, clear, refreshInfo, FILE };

})(typeof window !== 'undefined' ? window : globalThis, document);

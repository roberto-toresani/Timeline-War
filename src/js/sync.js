// Sincronizzazione multiplayer: un solo documento Firestore condiviso ("games/main")
// contiene l'intero stato di gioco. Chiunque puo' leggerlo in tempo reale (onSnapshot),
// ma solo l'utente con UID === ADMIN_UID puo' scriverlo (vedi firestore.rules per l'enforcement reale).
const MultiplayerSync = (function () {
    const isConfigured = typeof firebaseConfig !== 'undefined'
        && firebaseConfig.apiKey
        && firebaseConfig.apiKey.indexOf('INSERISCI') === -1;

    let isAdmin = false;
    let roleListeners = [];
    let stateListeners = [];
    let pushRejectListeners = [];   // avvisati quando una scrittura è rifiutata dal guard
    let pushTimer = null;
    let docRef = null;
    // Ultimo stato ricevuto da Firestore, per ri-emetterlo a chi si iscrive DOPO.
    // L'onSnapshot iniziale scatta appena la pagina si connette, spesso PRIMA che
    // app.js registri il suo applyCloudState (initMap gira su DOMContentLoaded, la
    // prima consegna di Firestore può arrivare prima o dopo — è una corsa). Senza
    // replay, un viewer che arriva "tardi" non vedeva mai la partita in corso:
    // restava su "Partita non avviata" coi regni di default finché l'admin non
    // toccava qualcosa (che faceva ri-scattare l'onSnapshot). Era il motivo per
    // cui il link d'invito, online, apriva la schermata vuota.
    let lastState = null;
    let hasState = false;
    // Guardia anti-sovrascrittura arretrata (§salvataggi robusti). Ogni scrittura
    // dello stato porta un `rev` che cresce di 1: è il numero di versione del
    // documento condiviso. `baseRev` è il rev dell'ULTIMO snapshot che questo
    // client ha ricevuto — cioè la versione su cui le sue mosse si appoggiano.
    // pushState scrive in TRANSAZIONE e RIFIUTA se il documento online è più
    // avanti di così (`remoteRev > baseRev`): vorrebbe dire che un altro browser
    // ha già scritto qualcosa che noi non abbiamo ancora visto, e sovrascriverlo
    // col nostro stato lo cancellerebbe. È esattamente il caso che ha azzerato la
    // partita: un tab rimasto indietro (turno 13) che stampa il suo stato sopra
    // quello vero (turno 25). Vedi anche il backstop sul `turn` in pushState.
    let baseRev = 0;
    // BACKUP PER TURNO (§salvataggi robusti, richiesta dell'utente): a ogni nuovo
    // decennio si salva l'intero stato in un documento a parte, così si può sempre
    // ricaricare la partita dall'inizio di un turno precedente. Sottocollezione
    // `games/main/turns/{turno}`: un documento per turno, scritto UNA volta (non si
    // sovrascrive un backup buono con uno stale). Se ne tengono gli ultimi
    // BACKUP_KEEP; i più vecchi si potano.
    let turnsCol = null;
    const BACKUP_KEEP = 25;
    // Presenza dei giocatori (collezione `presence`, un doc per codice d'invito):
    // NON è stato di gioco, solo "quale persona ha preso quale regno", così
    // l'editor dell'admin lo mostra. Scrivibile da chiunque (un player non è
    // admin), letta come mappa {codice: dato} con lo stesso replay dello stato.
    let presenceCol = null;
    let presenceListeners = [];
    let lastPresence = {};
    let hasPresence = false;
    // Chat fra i giocatori (collezione `chat`, un documento per messaggio): come la
    // presenza NON è stato di gioco autorevole — serve solo a chiacchierare durante
    // le lunghe attese. Stesso replay dello stato: chi si iscrive dopo la prima
    // consegna vede lo storico. I messaggi si tengono ordinati per `ts` (orologio
    // del mittente): basta per un ordinamento leggibile, e non dipende dal
    // serverTimestamp che arriva un istante dopo.
    let chatCol = null;
    let chatListeners = [];
    let lastChat = [];
    let hasChat = false;
    const CHAT_KEEP = 300;   // quanti messaggi si leggono/tengono: la coda più recente
    // LEASE DEL DRIVER DEI BOT (§multi-tab): quando più sessioni admin sono aperte
    // insieme (l'editor in un tab, la plancia in un altro, il telefono), ognuna
    // faceva girare Bot.run per conto suo e le loro scritture si accavallavano —
    // `turnoDi` rimbalzava avanti e indietro e il giro non arrivava mai pulito al
    // turno umano. Il lease fa sì che fra tutte le sessioni ne guidi UNA sola: chi
    // lo tiene lo rinfresca mentre guida, e se quel tab muore scade da sé dopo
    // DRIVER_TTL e un'altra sessione può riprenderlo. Vive in un documento riservato
    // della collezione `presence` (già aperta in lettura/scrittura: nessuna regola
    // Firestore nuova da ripubblicare), filtrato via dalla mappa di presenza.
    const DRIVER_DOC = '__driver_lease__';
    const DRIVER_TTL = 10000;   // ms: oltre questo un lease non rinfrescato è "morto"
    // Identità di QUESTA sessione (per tab): due tab dello stesso account admin sono
    // due client diversi, ed è proprio fra loro che serve distinguere il driver.
    const clientId = Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
    let authReadyResolve;
    const authReady = new Promise(res => { authReadyResolve = res; });

    if (isConfigured) {
        firebase.initializeApp(firebaseConfig);
        docRef = firebase.firestore().collection('games').doc('main');
        presenceCol = firebase.firestore().collection('presence');
        chatCol = firebase.firestore().collection('chat');
        turnsCol = docRef.collection('turns');

        firebase.auth().onAuthStateChanged(user => {
            isAdmin = !!(user && user.uid === ADMIN_UID);
            roleListeners.forEach(cb => cb(isAdmin));
            authReadyResolve();
        });

        docRef.onSnapshot(snap => {
            lastState = snap.exists ? snap.data() : null;
            hasState = true;
            // Le nostre mosse d'ora in poi si appoggiano su QUESTA versione: la
            // guardia di pushState confronterà con questo numero. Un documento
            // ancora senza `rev` (i salvataggi anteriori a questa modifica) vale 0.
            // baseRev può SOLO avanzare, mai regredire: un pushState riuscito lo
            // porta a `nextRev` (vedi sotto), ma lo snapshot di Firestore per QUELLA
            // scrittura arriva con centinaia di ms di ritardo — se nel frattempo
            // abbiamo già scritto la mossa successiva (i bot spingono a raffica),
            // quello snapshot è ARRETRATO rispetto a baseRev e rimetterlo indietro
            // farebbe scattare la guardia di pushState sul push seguente (remoteRev
            // vero > baseRev regredito): messaggio rosso e catena dei bot bloccata.
            if (lastState && typeof lastState.rev === 'number' && lastState.rev > baseRev)
                baseRev = lastState.rev;
            stateListeners.forEach(cb => cb(lastState));
        }, err => {
            console.error('Errore lettura stato condiviso:', err);
        });

        presenceCol.onSnapshot(snap => {
            const map = {};
            // Il doc del lease del driver vive in questa collezione ma NON è presenza:
            // si salta, o comparirebbe come un finto "regno preso".
            snap.forEach(d => { if (d.id !== DRIVER_DOC) map[d.id] = d.data(); });
            lastPresence = map;
            hasPresence = true;
            presenceListeners.forEach(cb => cb(map));
        }, err => {
            console.error('Errore lettura presenze:', err);
        });

        // Si leggono solo gli ultimi CHAT_KEEP messaggi (i più recenti): la chat di
        // una partita non deve crescere senza limite nel client. `desc` + limit dà
        // la coda, poi la si rovescia in ordine cronologico per mostrarla.
        chatCol.orderBy('ts', 'desc').limit(CHAT_KEEP).onSnapshot(snap => {
            const arr = [];
            snap.forEach(d => arr.push(Object.assign({ id: d.id }, d.data())));
            arr.reverse();
            lastChat = arr;
            hasChat = true;
            chatListeners.forEach(cb => cb(arr));
        }, err => {
            console.error('Errore lettura chat:', err);
        });
    } else {
        console.warn('MultiplayerSync: firebase-config.js non configurato. Modalita locale (nessuna sincronizzazione online).');
        setTimeout(authReadyResolve, 0);
    }

    function onRoleChange(cb) {
        roleListeners.push(cb);
        if (isConfigured) {
            authReady.then(() => cb(isAdmin));
        } else {
            cb(false);
        }
    }

    function onStateChange(cb) {
        stateListeners.push(cb);
        // Se lo snapshot è già arrivato, glielo diamo subito: chi si iscrive dopo
        // la prima consegna deve comunque vedere la partita in corso.
        if (hasState) cb(lastState);
    }

    function onPresenceChange(cb) {
        presenceListeners.push(cb);
        if (hasPresence) cb(lastPresence);
    }

    // Segna che un giocatore ha preso un regno (aprendo il suo link). A differenza
    // di pushState NON è protetto da isAdmin: lo chiama proprio il player, che
    // admin non è. Il gate "non l'admin" (che apre col 👁 per curiosare, non per
    // prendere) lo mette il chiamante.
    function setPresence(code, data) {
        if (!isConfigured || !presenceCol || !code) return;
        presenceCol.doc(code).set(Object.assign({}, data, {
            at: firebase.firestore.FieldValue.serverTimestamp()
        })).catch(err => console.error('Errore salvataggio presenza:', err));
    }

    function onChatChange(cb) {
        chatListeners.push(cb);
        // Come lo stato e la presenza: chi si iscrive dopo la prima consegna deve
        // comunque vedere lo storico già arrivato.
        if (hasChat) cb(lastChat);
    }

    // Invia un messaggio in chat. Come setPresence, NON è protetto da isAdmin: lo
    // scrive il player dal proprio browser. `data` porta almeno {testo}; di norma
    // anche {regno, colore, id, to}. Senza Firebase (modalità locale) fa l'eco in
    // memoria, così la chat funziona anche offline per le prove.
    function sendChat(data) {
        if (!data || !data.testo) return;
        const msg = Object.assign({}, data, { ts: Date.now() });
        if (!isConfigured || !chatCol) {
            lastChat = lastChat.concat(Object.assign({ id: 'local-' + msg.ts }, msg)).slice(-CHAT_KEEP);
            hasChat = true;
            chatListeners.forEach(cb => cb(lastChat));
            return;
        }
        msg.at = firebase.firestore.FieldValue.serverTimestamp();
        chatCol.add(msg).catch(err => console.error('Errore invio chat:', err));
    }

    // Svuota la chat: la partita nuova riparte senza i messaggi della precedente
    // (regola dell'utente). La chiama GameActions.startGame. I documenti possono
    // essere più di quanti un solo batch ne cancelli (limite 500), quindi si
    // cancellano a pagine finché la collezione non è vuota.
    function clearChat() {
        if (!isConfigured || !chatCol) {
            lastChat = [];
            hasChat = true;
            chatListeners.forEach(cb => cb([]));
            return;
        }
        const deletePage = () => chatCol.limit(400).get().then(snap => {
            if (snap.empty) return null;
            const batch = firebase.firestore().batch();
            snap.forEach(d => batch.delete(d.ref));
            return batch.commit().then(deletePage);
        });
        deletePage().catch(err => console.error('Errore pulizia chat:', err));
    }

    // Scrive lo stato condiviso. NON più protetto da isAdmin (regola dell'utente):
    // in multiplayer ogni giocatore scrive le sue mosse dal proprio browser (le
    // regole di turno/fase le impone game-actions.js lato client). I turni sono
    // sequenziali — agisce un giocatore per volta — quindi le scritture dell'intero
    // documento non si accavallano; l'admin durante la partita non deve però
    // modificare la mappa dall'editor, o il suo salvataggio sovrascriverebbe.
    // `opts.force === true` scavalca la guardia: lo usano SOLO le azioni che
    // regrediscono il calendario di proposito (partita nuova, ripristino di un
    // turno precedente). Ogni scrittura di gioco normale NON forza, così un tab
    // arretrato non può azzerare la partita.
    function pushState(stateObj, opts) {
        if (!isConfigured || !docRef) return;
        const force = !!(opts && opts.force);
        // Un push FORZATO (reset voluto: partita nuova via startGame, ripristino di
        // un backup) NON passa dal debounce. Restarci 600 ms lo esporrebbe a essere
        // ANNULLATO: la prima mossa di un bot parte subito dopo l'avvio (setTimeout
        // in bot.js), la sua saveAutoSave chiama pushState → clearTimeout(pushTimer)
        // e il reset non raggiungerebbe mai Firestore — la vecchia partita
        // continuerebbe a tornare via onSnapshot (è il bug "mi rivede la partita
        // vecchia"). Eseguendolo subito, niente lo può più cancellare.
        clearTimeout(pushTimer);
        pushTimer = null;
        if (force) { flushState(stateObj, true); return; }
        pushTimer = setTimeout(() => flushState(stateObj, false), 600);
    }

    function flushState(stateObj, force) {
            firebase.firestore().runTransaction(tx => tx.get(docRef).then(snap => {
                const remote = snap.exists ? (snap.data() || {}) : {};
                const remoteRev = (typeof remote.rev === 'number') ? remote.rev : 0;
                const remoteTurn = (typeof remote.turn === 'number') ? remote.turn : null;
                const newTurn = (typeof stateObj.turn === 'number') ? stateObj.turn : null;
                if (!force) {
                    // (1) Il documento online è più avanti di quello su cui ci
                    //     basiamo: un altro browser ha già scritto qualcosa che non
                    //     abbiamo ancora visto. Sovrascriverlo lo cancellerebbe.
                    if (remoteRev > baseRev)
                        throw { _guard: 'rev', remoteRev, baseRev, remoteTurn, newTurn };
                    // (2) Backstop sul turno: non si regredisce il calendario. Uno
                    //     stato con un turno PRECEDENTE a quello online è stantìo —
                    //     è il caso esatto che ha azzerato la partita (turno 13 sopra
                    //     il 25) — e si rifiuta anche se il rev combaciasse.
                    if (remoteTurn !== null && newTurn !== null && newTurn < remoteTurn)
                        throw { _guard: 'turn', remoteRev, baseRev, remoteTurn, newTurn };
                }
                const nextRev = Math.max(remoteRev, baseRev) + 1;
                tx.set(docRef, Object.assign({}, stateObj, {
                    rev: nextRev,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }));
                return nextRev;
            })).then(nextRev => { if (nextRev > baseRev) baseRev = nextRev; }).catch(err => {
                if (err && err._guard) {
                    console.warn('pushState RIFIUTATO (' + err._guard + '): lo stato online (turno '
                        + err.remoteTurn + ', rev ' + err.remoteRev + ') è più avanti del nostro (turno '
                        + err.newTurn + ', rev base ' + err.baseRev + '). Scrittura annullata per non azzerare la partita.');
                    pushRejectListeners.forEach(cb => cb(err));
                } else {
                    console.error('Errore salvataggio stato condiviso:', err);
                }
            });
    }

    function onPushReject(cb) { pushRejectListeners.push(cb); }

    // ---- LEASE DEL DRIVER DEI BOT ----
    // Prova a PRENDERE (o rinnovare) il diritto di guidare i bot. Torna una Promise
    // che risolve `true` se questa sessione può guidare, `false` se un'altra lo sta
    // già facendo (lease fresco di un altro client). La stessa funzione serve sia
    // per acquisire sia per il battito di rinnovo: se torna `false` durante la
    // guida, chi guidava ha perso il lease e deve fermarsi. Senza Firebase
    // (modalità locale) c'è una sola sessione: risolve sempre `true`.
    function acquireDriver() {
        if (!isConfigured || !presenceCol) return Promise.resolve(true);
        const ref = presenceCol.doc(DRIVER_DOC);
        return firebase.firestore().runTransaction(tx => tx.get(ref).then(snap => {
            const cur = snap.exists ? (snap.data() || {}) : null;
            const now = Date.now();
            const libero = !cur || !cur.id || cur.id === clientId
                || typeof cur.at !== 'number' || (now - cur.at) > DRIVER_TTL;
            if (libero) { tx.set(ref, { id: clientId, at: now }); return true; }
            return false;
        })).catch(err => { console.error('acquireDriver:', err); return false; });
    }

    // Rilascia il lease, ma SOLO se è ancora nostro (non si scippa quello di un
    // altro). Chiamata quando la catena dei bot finisce (torna il turno umano) o
    // quando la sessione perde il diritto di guidare.
    function releaseDriver() {
        if (!isConfigured || !presenceCol) return Promise.resolve();
        const ref = presenceCol.doc(DRIVER_DOC);
        return firebase.firestore().runTransaction(tx => tx.get(ref).then(snap => {
            const cur = snap.exists ? (snap.data() || {}) : null;
            if (cur && cur.id === clientId) tx.delete(ref);
        })).catch(err => console.error('releaseDriver:', err));
    }

    // ---- BACKUP PER TURNO (sottocollezione games/main/turns) ----
    // Salva l'intero stato all'inizio di un decennio, UNA volta per turno: se il
    // documento del turno esiste già non lo si tocca (un client stale non deve
    // poter sporcare un backup buono). Poi pota i backup troppo vecchi.
    function backupTurn(turnId, snapshot) {
        if (!isConfigured || !turnsCol || snapshot == null) return;
        const n = (typeof turnId === 'number') ? turnId : (Number(turnId) || 0);
        const ref = turnsCol.doc(String(n));
        firebase.firestore().runTransaction(tx => tx.get(ref).then(snap => {
            if (snap.exists) return null;
            tx.set(ref, { turn: n, state: snapshot, savedAt: firebase.firestore.FieldValue.serverTimestamp() });
            return n;
        })).then(written => { if (written !== null) pruneBackups(n); })
          .catch(err => console.error('Errore backup turno:', err));
    }

    function pruneBackups(currentTurn) {
        if (!isConfigured || !turnsCol) return;
        const cutoff = ((typeof currentTurn === 'number') ? currentTurn : (Number(currentTurn) || 0)) - BACKUP_KEEP;
        if (cutoff < 0) return;
        turnsCol.where('turn', '<', cutoff).get().then(snap => {
            if (snap.empty) return null;
            const batch = firebase.firestore().batch();
            snap.forEach(d => batch.delete(d.ref));
            return batch.commit();
        }).catch(err => console.error('Errore potatura backup:', err));
    }

    // Elenco dei backup disponibili, dal più recente: [{turn, savedAt}].
    function listBackups() {
        if (!isConfigured || !turnsCol) return Promise.resolve([]);
        return turnsCol.orderBy('turn', 'desc').get().then(snap => {
            const arr = [];
            snap.forEach(d => { const x = d.data() || {}; arr.push({ turn: x.turn, savedAt: x.savedAt || null }); });
            return arr;
        }).catch(err => { console.error('Errore lettura backup:', err); return []; });
    }

    // Lo stato salvato per un turno (o null se non c'è).
    function getBackup(turnId) {
        if (!isConfigured || !turnsCol) return Promise.resolve(null);
        return turnsCol.doc(String(turnId)).get()
            .then(d => (d.exists ? ((d.data() || {}).state || null) : null))
            .catch(err => { console.error('Errore lettura backup:', err); return null; });
    }

    // Cancella i backup dei turni SUCCESSIVI a `turnId`: serve dopo un ripristino,
    // così la vecchia linea temporale non lascia backup fantasma davanti a quella
    // nuova.
    function deleteBackupsAfter(turnId) {
        if (!isConfigured || !turnsCol) return Promise.resolve();
        const t = (typeof turnId === 'number') ? turnId : (Number(turnId) || 0);
        return turnsCol.where('turn', '>', t).get().then(snap => {
            if (snap.empty) return null;
            const batch = firebase.firestore().batch();
            snap.forEach(d => batch.delete(d.ref));
            return batch.commit();
        }).catch(err => console.error('Errore pulizia backup futuri:', err));
    }

    function login(email, password) {
        if (!isConfigured) return Promise.reject(new Error('Firebase non configurato.'));
        return firebase.auth().signInWithEmailAndPassword(email, password);
    }

    function logout() {
        if (!isConfigured) return Promise.resolve();
        return firebase.auth().signOut();
    }

    // Test-only hook: local development can call MultiplayerSync._devSetAdmin(true|false)
    // to exercise the admin UI without a real Firebase login. Ignored when Firebase is configured.
    function _devSetAdmin(v) {
        if (isConfigured) return;
        isAdmin = !!v;
        roleListeners.forEach(cb => cb(isAdmin));
    }

    return {
        isConfigured: isConfigured,
        get isAdmin() { return isAdmin; },
        authReady: authReady,
        onRoleChange: onRoleChange,
        onStateChange: onStateChange,
        onPresenceChange: onPresenceChange,
        setPresence: setPresence,
        onChatChange: onChatChange,
        sendChat: sendChat,
        clearChat: clearChat,
        pushState: pushState,
        onPushReject: onPushReject,
        acquireDriver: acquireDriver,
        releaseDriver: releaseDriver,
        backupTurn: backupTurn,
        listBackups: listBackups,
        getBackup: getBackup,
        deleteBackupsAfter: deleteBackupsAfter,
        login: login,
        logout: logout,
        _devSetAdmin: _devSetAdmin
    };
})();

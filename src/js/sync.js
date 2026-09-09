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
    let authReadyResolve;
    const authReady = new Promise(res => { authReadyResolve = res; });

    if (isConfigured) {
        firebase.initializeApp(firebaseConfig);
        docRef = firebase.firestore().collection('games').doc('main');
        presenceCol = firebase.firestore().collection('presence');
        chatCol = firebase.firestore().collection('chat');

        firebase.auth().onAuthStateChanged(user => {
            isAdmin = !!(user && user.uid === ADMIN_UID);
            roleListeners.forEach(cb => cb(isAdmin));
            authReadyResolve();
        });

        docRef.onSnapshot(snap => {
            lastState = snap.exists ? snap.data() : null;
            hasState = true;
            stateListeners.forEach(cb => cb(lastState));
        }, err => {
            console.error('Errore lettura stato condiviso:', err);
        });

        presenceCol.onSnapshot(snap => {
            const map = {};
            snap.forEach(d => { map[d.id] = d.data(); });
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
    function pushState(stateObj) {
        if (!isConfigured || !docRef) return;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
            docRef.set(Object.assign({}, stateObj, {
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            })).catch(err => console.error('Errore salvataggio stato condiviso:', err));
        }, 600);
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
        login: login,
        logout: logout,
        _devSetAdmin: _devSetAdmin
    };
})();

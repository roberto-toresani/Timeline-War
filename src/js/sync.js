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
    let authReadyResolve;
    const authReady = new Promise(res => { authReadyResolve = res; });

    if (isConfigured) {
        firebase.initializeApp(firebaseConfig);
        docRef = firebase.firestore().collection('games').doc('main');

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

    function pushState(stateObj) {
        if (!isConfigured || !docRef || !isAdmin) return;
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
        pushState: pushState,
        login: login,
        logout: logout,
        _devSetAdmin: _devSetAdmin
    };
})();

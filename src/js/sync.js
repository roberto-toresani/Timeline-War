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
            const data = snap.exists ? snap.data() : null;
            stateListeners.forEach(cb => cb(data));
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

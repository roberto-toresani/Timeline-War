// Configurazione del progetto Firebase.
// Questi valori si trovano in: Firebase Console -> Impostazioni progetto -> Le tue app -> SDK setup and configuration.
// NON sono segreti: la sicurezza vera e' data dalle regole di Firestore (vedi firestore.rules) e da Firebase Auth,
// non dal nascondere questi valori.
const firebaseConfig = {
    apiKey: "INSERISCI_API_KEY",
    authDomain: "INSERISCI_PROJECT_ID.firebaseapp.com",
    projectId: "INSERISCI_PROJECT_ID",
    storageBucket: "INSERISCI_PROJECT_ID.appspot.com",
    messagingSenderId: "INSERISCI_SENDER_ID",
    appId: "INSERISCI_APP_ID"
};

// UID dell'utente amministratore (unico account che puo' modificare la mappa).
// Si trova in: Firebase Console -> Authentication -> Users -> colonna "User UID", dopo aver creato l'utente admin.
const ADMIN_UID = "INSERISCI_ADMIN_UID";

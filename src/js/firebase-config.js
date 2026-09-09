// Configurazione del progetto Firebase.
// Questi valori si trovano in: Firebase Console -> Impostazioni progetto -> Le tue app -> SDK setup and configuration.
// NON sono segreti: la sicurezza vera e' data dalle regole di Firestore (vedi firestore.rules) e da Firebase Auth,
// non dal nascondere questi valori.
const firebaseConfig = {
    apiKey: "AIzaSyDMgCZVl5zHqQaIaeDxRVUhwGyE9j0JOtQ",
    authDomain: "timeline-war.firebaseapp.com",
    projectId: "timeline-war",
    storageBucket: "timeline-war.firebasestorage.app",
    messagingSenderId: "236570789002",
    appId: "1:236570789002:web:fa783628008e5397531973"
};

// UID dell'utente amministratore (unico account che puo' modificare la mappa).
// Si trova in: Firebase Console -> Authentication -> Users -> colonna "User UID", dopo aver creato l'utente admin.
const ADMIN_UID = "Tfe6wZkLlaZh35gRqhopmxkjCFv1";

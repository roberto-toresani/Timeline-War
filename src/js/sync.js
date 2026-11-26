// Sincronizzazione multiplayer: un solo documento Firestore condiviso ("games/main")
// contiene l'intero stato di gioco. Chiunque puo' leggerlo in tempo reale (onSnapshot),
// ma solo l'utente con UID === ADMIN_UID puo' scriverlo (vedi firestore.rules per l'enforcement reale).
const MultiplayerSync = (function () {
    // MODALITÀ SOLO-LOCALE (per lo sviluppo/test): quando è attiva, il layer NON si
    // connette a Firebase — lo stato vive solo in questa scheda (autosave in
    // localStorage), come quando Firebase non è configurato. Serve a provare la partita
    // senza toccare il database di PRODUZIONE (timeline-war), a cui il server locale è
    // altrimenti collegato. Si accende con `?local=1` nell'URL (e resta accesa per la
    // sessione, così sopravvive alla navigazione editor↔plancia); si spegne con
    // `?local=0`. È un interruttore da sviluppatore: sul deploy vero nessuno passa quei
    // parametri, quindi il multiplayer resta pieno.
    const forceLocal = (function () {
        try {
            const p = new URLSearchParams(location.search).get('local');
            const KEY = 'risiko_local_only';
            if (p === '1') { sessionStorage.setItem(KEY, '1'); return true; }
            if (p === '0') { sessionStorage.removeItem(KEY); return false; }
            return sessionStorage.getItem(KEY) === '1';
        } catch (e) { return false; }
    })();
    const isConfigured = !forceLocal
        && typeof firebaseConfig !== 'undefined'
        && firebaseConfig.apiKey
        && firebaseConfig.apiKey.indexOf('INSERISCI') === -1;
    if (forceLocal && typeof console !== 'undefined') {
        console.warn('[Risiko] MODALITÀ SOLO-LOCALE attiva (?local=1): nessuna connessione a Firebase, stato solo in questa scheda.');
    }

    // In solo-locale l'unico utente della sandbox è admin (nessun login vero possibile
    // senza Firebase): così i punti che leggono MultiplayerSync.isAdmin direttamente
    // (es. il gate di saveAutoSave) si comportano come col vero admin.
    let isAdmin = forceLocal;
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
    let stateError = null;
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
    // Rev dell'ULTIMA scrittura andata a buon fine di QUESTA sessione. Diverso da
    // baseRev (che cresce anche in RICEZIONE): serve a riconoscere il nostro stesso
    // ECHO. Firestore ci rimanda via onSnapshot ogni scrittura che facciamo; se la
    // ri-applichiamo mentre lo stato locale è già ANDATO OLTRE (i bot continuano a
    // muovere durante il giro di rete della scrittura), turnoDi/turnProgress
    // ARRETRANO al momento di quella scrittura e il progresso in memoria si perde —
    // poi la scrittura correttiva ha un turnProgress più basso e il guard la
    // rifiuta ("salvataggio annullato"): il progresso dei bot si cancella. app.js
    // salta l'applicazione di uno snapshot con rev ≤ a questo (è roba nostra, già
    // nostra o superata). Sale solo, mai scende.
    let lastPushedRev = 0;
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
    // QUOTA DI LETTURA (2026-11-26): ogni apertura della plancia (e ogni ripresa
    // del telefono dopo un po' in secondo piano) rilegge TUTTI i messaggi del
    // limite: con 300 erano 300 letture a colpo, e le 50.000 letture gratuite al
    // giorno di Firestore finivano verso sera — da lì ogni salvataggio falliva
    // con `resource-exhausted` fino alle 9 del mattino. 60 bastano a leggere la
    // conversazione recente.
    const CHAT_KEEP = 60;    // quanti messaggi si leggono/tengono: la coda più recente
    // LEASE DEL DRIVER DEI BOT (§multi-tab): quando più sessioni admin sono aperte
    // insieme (l'editor in un tab, la plancia in un altro, il telefono), ognuna
    // faceva girare Bot.run per conto suo e le loro scritture si accavallavano —
    // `turnoDi` rimbalzava avanti e indietro e il giro non arrivava mai pulito al
    // turno umano. Il lease fa sì che fra tutte le sessioni ne guidi UNA sola: chi
    // lo tiene lo rinfresca mentre guida, e se quel tab muore scade da sé dopo
    // DRIVER_TTL e un'altra sessione può riprenderlo. Vive in un documento dedicato
    // della collezione `presence` (già aperta in lettura/scrittura: nessuna regola
    // Firestore nuova da ripubblicare), filtrato via dalla mappa di presenza.
    // ATTENZIONE: l'id NON può avere doppio underscore ai bordi (`__x__`): Firestore
    // riserva quel pattern e RIFIUTA ogni read/write con invalid-argument — era il
    // motivo per cui, dopo il primo deploy, il lease falliva sempre e i bot non
    // partivano. Un trattino è sicuro e non collide con un codice d'invito.
    const DRIVER_DOC = 'driver-lease';
    // INTERVENTO ADMIN IN ATTESA: un doc a sé nella stessa collezione aperta, NON
    // dentro games/main. Un editor ?nodrive=1 non può scrivere games/main durante
    // il turno di un bot (lo scrive solo chi tiene il lease, cioè il motore), e lo
    // snapshot successivo del motore — col suo pendingDiff:null — cancellava
    // l'intervento in silenzio. Qui lo scrive chiunque sia admin e lo applica il
    // regista (app.js, isInterventionApplier), che poi lo cancella.
    const INTERVENTION_DOC = 'admin-intervention';
    // AGGIORNA TUTTI (regola dell'utente): dopo un deploy l'admin preme un bottone
    // e ogni pagina aperta si ricarica col codice nuovo. È un doc della collezione
    // `presence` (aperta a tutti: niente regole da ripubblicare) con { v, by }: `v`
    // è un timbro che cresce a ogni richiesta, `by` la sessione che l'ha mandata
    // (che non ricarica sé stessa). Il PRIMO valore che una pagina vede è la sua
    // base e non fa ricaricare — se no chi apre adesso ripartirebbe in un loop.
    // Le pagine col codice VECCHIO non conoscono questo canale: vale dal deploy
    // successivo a quello che l'ha introdotto.
    const RELOAD_DOC = 'app-reload';
    let reloadListeners = [];
    let reloadBase = null;        // il timbro visto al primo snapshot
    let reloadSeen = false;
    let interventionListeners = [];
    let lastIntervention = null;
    let hasIntervention = false;
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
            // La plancia lo mostra nel cartello "Sto caricando il tuo regno…":
            // un giocatore da telefono non ha la console.
            stateError = (err && (err.code || err.message)) || String(err);
        });

        presenceCol.onSnapshot(snap => {
            const map = {};
            // Il doc del lease del driver vive in questa collezione ma NON è presenza:
            // si salta, o comparirebbe come un finto "regno preso".
            let interv = null;
            let reloadSig = null;
            snap.forEach(d => {
                if (d.id === INTERVENTION_DOC) { interv = d.data() || null; return; }
                if (d.id === RELOAD_DOC) { reloadSig = d.data() || null; return; }
                // driver-lease e driver-mail (deduplica mail del motore): non presenza.
                if (d.id.indexOf('driver-') !== 0) map[d.id] = d.data();
            });
            // Il canale dell'intervento si notifica solo quando CAMBIA: il lease del
            // driver rinfresca questa collezione ogni pochi secondi.
            const ivKey = interv && interv.id ? String(interv.id) : null;
            const prevKey = lastIntervention && lastIntervention.id ? String(lastIntervention.id) : null;
            if (!hasIntervention || ivKey !== prevKey) {
                lastIntervention = interv;
                hasIntervention = true;
                interventionListeners.forEach(cb => cb(interv));
            }
            // Aggiorna tutti: il primo timbro è la base, uno più nuovo è l'ordine.
            const rv = reloadSig && typeof reloadSig.v === 'number' ? reloadSig.v : 0;
            if (!reloadSeen) { reloadSeen = true; reloadBase = rv; }
            else if (rv > (reloadBase || 0)) {
                reloadBase = rv;
                if (reloadSig.by !== clientId) reloadListeners.forEach(cb => cb(reloadSig));
            }
            lastPresence = map;
            hasPresence = true;
            presenceListeners.forEach(cb => cb(map));
        }, err => {
            console.error('Errore lettura presenze:', err);
        });

        // Si leggono solo gli ultimi CHAT_KEEP messaggi (i più recenti): la chat di
        // una partita non deve crescere senza limite nel client. `desc` + limit dà
        // la coda, poi la si rovescia in ordine cronologico per mostrarla.
        // I messaggi visti si ACCUMULANO in `chatAll` (per id): quando un messaggio
        // nuovo spinge il più vecchio fuori dalla finestra degli ultimi CHAT_KEEP,
        // chi lo stava leggendo non se lo vede sparire, e i messaggi caricati con
        // "Mostra messaggi precedenti" (loadOlderChat) restano in elenco. Una
        // finestra vuota = chat azzerata (partita nuova): si svuota tutto.
        chatCol.orderBy('ts', 'desc').limit(CHAT_KEEP).onSnapshot(snap => {
            if (snap.empty) { chatAll.clear(); chatOlderDone = true; }
            snap.forEach(d => chatAll.set(d.id, Object.assign({ id: d.id }, d.data())));
            if (snap.size < CHAT_KEEP) chatOlderDone = true;
            emitChat();
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
        // merge: non cancella la traccia diagnostica del salvataggio (syncErr).
        }), { merge: true }).catch(err => console.error('Errore salvataggio presenza:', err));
    }

    function onInterventionChange(cb) {
        interventionListeners.push(cb);
        if (hasIntervention) cb(lastIntervention);
    }

    // data = { id, diff, base } oppure null (= nessun intervento in attesa).
    function setIntervention(data) {
        if (!isConfigured || !presenceCol) return Promise.resolve(false);
        const ref = presenceCol.doc(INTERVENTION_DOC);
        const op = data ? ref.set(JSON.parse(JSON.stringify(data))) : ref.delete();
        return op.then(() => true).catch(err => {
            console.error('Errore salvataggio intervento:', err);
            return false;
        });
    }

    // AGGIORNA TUTTI: chi ascolta riceve { v, by } quando l'admin lo chiede.
    function onReloadSignal(cb) { reloadListeners.push(cb); }
    function requestReloadAll() {
        if (!isConfigured || !presenceCol) return Promise.resolve(false);
        return presenceCol.doc(RELOAD_DOC).set({ v: Date.now(), by: clientId })
            .then(() => true).catch(err => {
                console.error('Errore invio "aggiorna tutti":', err);
                return false;
            });
    }

    // ---- chat: tutto quel che si è visto + lo storico caricato a richiesta ----
    const chatAll = new Map();
    let chatOlderDone = false;       // non c'è più niente di più vecchio da caricare
    let chatOlderLoading = null;
    function emitChat() {
        lastChat = Array.from(chatAll.values()).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        hasChat = true;
        chatListeners.forEach(cb => cb(lastChat));
    }
    // STORICO A RICHIESTA (regola dell'utente, 2026-11-26): la chat si apre con
    // gli ultimi CHAT_KEEP messaggi per risparmiare letture (vedi CHAT_KEEP); i
    // più vecchi si caricano a blocchi solo quando qualcuno li chiede. Lettura una
    // tantum (get), non un ascolto: non rilegge nulla alle aperture successive.
    // Promise<{ added, more }>.
    function loadOlderChat() {
        if (!isConfigured || !chatCol || chatOlderDone) return Promise.resolve({ added: 0, more: false });
        if (chatOlderLoading) return chatOlderLoading;
        let oldest = Infinity;
        chatAll.forEach(m => { if (typeof m.ts === 'number' && m.ts < oldest) oldest = m.ts; });
        let q = chatCol.orderBy('ts', 'desc');
        if (oldest !== Infinity) q = q.startAfter(oldest);
        chatOlderLoading = q.limit(CHAT_KEEP).get().then(snap => {
            let added = 0;
            snap.forEach(d => { if (!chatAll.has(d.id)) { chatAll.set(d.id, Object.assign({ id: d.id }, d.data())); added++; } });
            if (snap.size < CHAT_KEEP) chatOlderDone = true;
            emitChat();
            return { added, more: !chatOlderDone };
        }).catch(err => {
            console.error('Errore lettura messaggi precedenti:', err);
            return { added: 0, more: !chatOlderDone, error: String((err && (err.code || err.message)) || err) };
        }).then(r => { chatOlderLoading = null; return r; });
        return chatOlderLoading;
    }
    function chatHasOlder() { return isConfigured && !!chatCol && !chatOlderDone; }

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
        // Il TURNO in cui è stato scritto (regola dell'utente: nei messaggi conta il
        // turno, non l'ora). Vale per tutti i mittenti: plancia, bot, Papa.
        if (msg.turno == null) {
            try { const t = window.Risiko && window.Risiko.turn && window.Risiko.turn(); if (typeof t === 'number') msg.turno = t; }
            catch (e) { /* senza turno: la plancia ripiega sulla data */ }
        }
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
    // ---- SALVATAGGIO AFFIDABILE (bug "turno chiuso di notte, la mattina non c'è",
    // 2026-11-26) ----
    // Prima: ogni push partiva da solo dopo 600 ms, e se falliva (rete del telefono,
    // transazione abortita, pagina chiusa subito dopo "Fine turno") l'errore finiva
    // in console e NESSUNO ritentava: il giocatore vedeva il turno chiuso sul suo
    // schermo, online restava fermo. Peggio: con la rete lenta due push si
    // accavallavano, il secondo leggeva il rev del primo prima che `baseRev` lo
    // registrasse e la guardia lo rifiutava come "partita più avanti" — se il
    // secondo era la fine turno, la fine turno spariva.
    // Ora: (1) un push alla volta, l'ultimo stato aspetta in coda; (2) un errore
    // NON di guardia si ritenta da solo (backoff), ricostruendo lo stato dal vivo
    // tramite `retryHook` (saveAutoSave di app.js); (3) `flushNow` spedisce subito
    // (fine turno, pagina in secondo piano); (4) chi vuole sa a che punto è
    // (onPushStatus: la plancia mostra "salvato" / "NON salvato"); (5) l'errore
    // lascia traccia nel doc di presenza del giocatore (`syncErr`), così la
    // prossima volta si sa perché.
    let pushInFlight = false;
    let pushQueued = null;          // { stateObj, force } in attesa del push in volo
    let pendingState = null;        // stato del timer di debounce (per flushNow)
    let pushFailed = false;         // l'ultimo tentativo è fallito e non è ancora riuscito
    let retryTimer = null;
    let retryCount = 0;
    let retryHook = null;
    let diagCode = null;            // codice d'invito del giocatore di questa pagina
    let pushStatus = { state: 'ok', at: 0, err: null };
    const pushStatusListeners = [];
    const RETRY_STEPS = [2000, 5000, 10000, 20000, 30000];

    function setPushStatus(state, err) {
        pushStatus = { state, at: Date.now(), err: err || null };
        pushStatusListeners.forEach(cb => { try { cb(pushStatus); } catch (e) { /* listener */ } });
    }
    function onPushStatus(cb) { pushStatusListeners.push(cb); cb(pushStatus); }
    function hasUnsaved() { return !!(pushTimer || pushInFlight || pushQueued || pushFailed); }
    function setRetryHook(fn) { retryHook = (typeof fn === 'function') ? fn : null; }
    function setDiagCode(code) { diagCode = code || null; }
    // Traccia diagnostica sul doc di presenza del giocatore (merge: non tocca il
    // resto). set() semplice, non transazione: Firestore la mette in coda anche
    // offline e la spedisce appena può.
    function reportDiag(fields) {
        if (!isConfigured || !presenceCol || !diagCode) return;
        try {
            presenceCol.doc(diagCode).set(Object.assign({}, fields, {
                syncUa: (typeof navigator !== 'undefined' && navigator.userAgent || '').slice(0, 160)
            }), { merge: true }).catch(() => {});
        } catch (e) { /* diagnostica: mai bloccante */ }
    }

    function pushState(stateObj, opts) {
        if (!isConfigured || !docRef) return;
        const force = !!(opts && opts.force);
        const now = !!(opts && opts.now);
        // Un push FORZATO (reset voluto: partita nuova via startGame, ripristino di
        // un backup) NON passa dal debounce. Restarci 600 ms lo esporrebbe a essere
        // ANNULLATO: la prima mossa di un bot parte subito dopo l'avvio (setTimeout
        // in bot.js), la sua saveAutoSave chiama pushState → clearTimeout(pushTimer)
        // e il reset non raggiungerebbe mai Firestore — la vecchia partita
        // continuerebbe a tornare via onSnapshot (è il bug "mi rivede la partita
        // vecchia"). Eseguendolo subito, niente lo può più cancellare.
        // Lo stesso vale per `now` (fine turno): parte subito, senza aspettare.
        clearTimeout(pushTimer);
        pushTimer = null;
        pendingState = null;
        clearTimeout(retryTimer);
        retryTimer = null;
        if (force || now) { flushState(stateObj, force); return; }
        pendingState = stateObj;
        setPushStatus('pending');
        pushTimer = setTimeout(() => {
            pushTimer = null;
            const s = pendingState;
            pendingState = null;
            if (s) flushState(s, false);
        }, 600);
    }

    // Spedisce SUBITO il push in attesa (debounce o ritentativo): la chiama la
    // pagina quando va in secondo piano o si chiude, perché un telefono bloccato
    // congela i timer e il push in attesa non partirebbe più.
    function flushNow() {
        if (!isConfigured || !docRef) return;
        if (pushTimer && pendingState) {
            clearTimeout(pushTimer);
            pushTimer = null;
            const s = pendingState;
            pendingState = null;
            flushState(s, false);
            return;
        }
        if (pushFailed && !pushInFlight) retryNow();
    }

    function retryNow() {
        clearTimeout(retryTimer);
        retryTimer = null;
        if (!pushFailed || pushInFlight) return;
        // Lo stato si RICOSTRUISCE dal vivo (saveAutoSave): un tentativo vecchio
        // non deve riportare indietro mosse fatte nel frattempo.
        if (retryHook) {
            try {
                retryHook();
                // La pagina non ha più niente da scrivere (non è più lo scrittore
                // del turno, intervento admin in corso…): niente da ritentare.
                if (!pushTimer && !pushInFlight) { pushFailed = false; lastFailedState = null; setPushStatus('ok'); }
                return;
            } catch (e) { /* ripiego sotto */ }
        }
        if (lastFailedState) flushState(lastFailedState, false);
    }
    let lastFailedState = null;

    function scheduleRetry() {
        clearTimeout(retryTimer);
        const wait = RETRY_STEPS[Math.min(retryCount, RETRY_STEPS.length - 1)];
        retryCount++;
        retryTimer = setTimeout(retryNow, wait);
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
        // Rete tornata: si ritenta subito.
        window.addEventListener('online', () => { if (pushFailed) retryNow(); });
        // Pagina in secondo piano / chiusa: si spedisce subito quel che resta.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushNow();
            else if (pushFailed) retryNow();
        });
        window.addEventListener('pagehide', flushNow);
    }

    function flushState(stateObj, force) {
            // Un push alla volta: se uno è in volo, l'ultimo stato aspetta il suo
            // esito (e prende il suo rev come base). Un reset forzato resta forzato.
            if (pushInFlight) {
                pushQueued = { stateObj, force: !!(force || (pushQueued && pushQueued.force)) };
                return;
            }
            pushInFlight = true;
            setPushStatus('saving');
            firebase.firestore().runTransaction(tx => tx.get(docRef).then(snap => {
                const remote = snap.exists ? (snap.data() || {}) : {};
                const remoteRev = (typeof remote.rev === 'number') ? remote.rev : 0;
                const remoteTurn = (typeof remote.turn === 'number') ? remote.turn : null;
                const newTurn = (typeof stateObj.turn === 'number') ? stateObj.turn : null;
                const remoteProg = (typeof remote.turnProgress === 'number') ? remote.turnProgress : null;
                const newProg = (typeof stateObj.turnProgress === 'number') ? stateObj.turnProgress : null;
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
                    // (3) Backstop sul PASSAGGIO DI TURNO (regola dell'utente: "da 1 a 2
                    //     non si torna indietro"). turnProgress cresce di 1 a ogni
                    //     cambio di turnoDi: un push con un valore INFERIORE a quello
                    //     online è lo stato di un driver in ritardo che riporterebbe il
                    //     turno alla posizione precedente del giro (rimbalzo
                    //     1→2→1→2). Più fine del backstop sul turno: intercetta anche i
                    //     salti DENTRO lo stesso decennio. I reset voluti (force) lo
                    //     scavalcano.
                    if (remoteProg !== null && newProg !== null && newProg < remoteProg)
                        throw { _guard: 'progress', remoteRev, baseRev, remoteTurn, newTurn };
                }
                const nextRev = Math.max(remoteRev, baseRev) + 1;
                tx.set(docRef, Object.assign({}, stateObj, {
                    rev: nextRev,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }));
                return nextRev;
            })).then(nextRev => {
                if (nextRev > baseRev) baseRev = nextRev;
                // Segna che QUESTO rev è nostro: il suo echo via onSnapshot non va
                // ri-applicato (ci farebbe arretrare — vedi lastPushedRev).
                if (nextRev > lastPushedRev) lastPushedRev = nextRev;
                const hadFailed = pushFailed;
                pushFailed = false;
                lastFailedState = null;
                retryCount = 0;
                if (hadFailed) reportDiag({ syncOkAt: Date.now(), syncRev: nextRev });
                return 'ok';
            }).catch(err => {
                if (err && err._guard) {
                    console.warn('pushState RIFIUTATO (' + err._guard + '): lo stato online (turno '
                        + err.remoteTurn + ', rev ' + err.remoteRev + ') è più avanti del nostro (turno '
                        + err.newTurn + ', rev base ' + err.baseRev + '). Scrittura annullata per non azzerare la partita.');
                    // Rifiuto VOLUTO: non si ritenta (sovrascriverebbe chi è più avanti).
                    pushFailed = false;
                    lastFailedState = null;
                    retryCount = 0;
                    reportDiag({ syncErr: 'guardia ' + err._guard + ' (online rev ' + err.remoteRev
                        + ', base ' + err.baseRev + ')', syncErrAt: Date.now() });
                    pushRejectListeners.forEach(cb => cb(err));
                    return 'rejected';
                }
                // Errore di RETE / transazione / dati: la mossa NON è online. Si
                // ritenta da soli finché non passa, e lo si dice al giocatore.
                console.error('Errore salvataggio stato condiviso:', err);
                pushFailed = true;
                lastFailedState = stateObj;
                const msg = String((err && (err.code || err.message)) || err).slice(0, 300);
                // Quota giornaliera di Firestore finita: lo si dice chiaro (la
                // plancia lo mostra), i ritentativi continuano da soli.
                if (/resource-exhausted/i.test(msg)) console.error('Firestore: QUOTA GIORNALIERA ESAURITA — i salvataggi riprenderanno quando si azzera (9:00 ora italiana).');
                reportDiag({ syncErr: msg, syncErrAt: Date.now() });
                return { error: msg };
            }).then(outcome => {
                pushInFlight = false;
                // In coda c'è uno stato più nuovo: parte adesso (sulla base aggiornata).
                if (pushQueued) {
                    const q = pushQueued;
                    pushQueued = null;
                    flushState(q.stateObj, q.force);
                    return;
                }
                if (outcome === 'ok') setPushStatus(pushTimer ? 'pending' : 'ok');
                else if (outcome === 'rejected') setPushStatus('rejected');
                else {
                    setPushStatus('error', outcome && outcome.error);
                    // Se nel frattempo è arrivato un nuovo push col debounce, ci
                    // pensa quello; se no si programma il ritentativo.
                    if (!pushTimer) scheduleRetry();
                }
            });
    }

    // RITOCCO MIRATO di un regno (bug: l'admin cambiava l'e-mail di un regno durante
    // il turno di un altro, saveAutoSave non poteva scrivere — non è lo scrittore del
    // turno — e il cambio restava sullo schermo dell'admin finché lo snapshot
    // successivo non lo cancellava: la mail partiva al vecchio indirizzo). Qui si
    // legge il documento VIVO in transazione e si cambiano SOLO i campi dati del
    // regno `id`: niente sovrascrittura dell'intero stato, quindi la mossa in corso
    // del giocatore di turno non si perde. Serve ai campi di regia (e-mail,
    // auto-turno) che non toccano la partita. Torna una Promise<boolean>.
    function patchPlayer(id, fields) {
        if (!isConfigured || !docRef) return Promise.resolve(false);
        return firebase.firestore().runTransaction(tx => tx.get(docRef).then(snap => {
            if (!snap.exists) return false;
            const remote = snap.data() || {};
            const players = Array.isArray(remote.players) ? remote.players.slice() : null;
            if (!players) return false;
            const i = players.findIndex(p => p && p.id === id);
            if (i < 0) return false;
            players[i] = Object.assign({}, players[i], fields);
            const remoteRev = (typeof remote.rev === 'number') ? remote.rev : 0;
            tx.update(docRef, {
                players: players,
                rev: remoteRev + 1,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return true;
        })).catch(err => { console.error('patchPlayer:', err); return false; });
    }

    // CODICE D'INVITO sul documento VIVO (bug del Portogallo, 2026-10-18): il 🔗
    // dell'editor creava il codice solo nel browser dell'admin e lo affidava a
    // saveAutoSave, che a partita in corso non scrive (l'editor non è lo scrittore
    // del turno); lo snapshot dopo lo cancellava e il link portava a un codice
    // che esisteva solo lì. Qui, in transazione: se il regno ha GIÀ un codice
    // online si restituisce quello (un link già mandato non deve smettere di
    // funzionare), altrimenti si salva `code`. Promise<codice | null>.
    function ensureInvite(id, code) {
        if (!isConfigured || !docRef) return Promise.resolve(code);
        return firebase.firestore().runTransaction(tx => tx.get(docRef).then(snap => {
            if (!snap.exists) return null;
            const remote = snap.data() || {};
            const players = Array.isArray(remote.players) ? remote.players.slice() : null;
            if (!players) return null;
            const i = players.findIndex(p => p && p.id === id);
            if (i < 0) return null;
            if (players[i].invite) return players[i].invite;
            players[i] = Object.assign({}, players[i], { invite: code });
            const remoteRev = (typeof remote.rev === 'number') ? remote.rev : 0;
            tx.update(docRef, {
                players: players,
                rev: remoteRev + 1,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return code;
        })).catch(err => { console.error('ensureInvite:', err); return null; });
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

    // ---- ARCHIVIO DEL REGISTRO DEL TURNO (educare i bot) ----
    // A giro finito si copia il registro del turno appena chiuso (player.registro,
    // game-actions.js) in un documento PERMANENTE: games/main/turns/registro-N.
    // Sta nella sottocollezione dei backup perché le sue regole Firestore ci sono
    // già, ma NON ha il campo `turn`: potatura, elenco e cancellazione dei backup
    // filtrano su `turn`, quindi l'archivio non lo toccano mai. Si scrive con
    // set (non "solo se manca"): un turno rigiocato dopo un ripristino deve
    // sostituire la sua copia vecchia.
    function archiveLog(turnId, regni) {
        if (!isConfigured || !turnsCol || !Array.isArray(regni)) return;
        const n = (typeof turnId === 'number') ? turnId : (Number(turnId) || 0);
        turnsCol.doc('registro-' + n).set({
            registroTurno: n, regni,
            savedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.error('Errore archivio registro:', err));
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
        // Vero quando l'interruttore ?local=1 ha forzato la modalità solo-locale: app.js
        // lo legge per concedere l'admin (sandbox a scheda singola, nessun login vero).
        localOnly: forceLocal,
        get isAdmin() { return isAdmin; },
        // Lo stato condiviso è arrivato almeno una volta? E se la lettura è
        // fallita, perché (codice Firestore)? Li legge l'attesa del link d'invito.
        get hasState() { return hasState; },
        get stateError() { return stateError; },
        authReady: authReady,
        onRoleChange: onRoleChange,
        onStateChange: onStateChange,
        onPresenceChange: onPresenceChange,
        setPresence: setPresence,
        onChatChange: onChatChange,
        loadOlderChat: loadOlderChat,
        chatHasOlder: chatHasOlder,
        sendChat: sendChat,
        clearChat: clearChat,
        pushState: pushState,
        // Salvataggio affidabile: spedisci subito, stato del salvataggio,
        // ritentativo dal vivo, codice per la diagnostica (vedi sopra pushState).
        flushNow: flushNow,
        hasUnsaved: hasUnsaved,
        onPushStatus: onPushStatus,
        setRetryHook: setRetryHook,
        setDiagCode: setDiagCode,
        patchPlayer: patchPlayer,
        ensureInvite: ensureInvite,
        onPushReject: onPushReject,
        // Rev dell'ultima scrittura riuscita di questa sessione: app.js scarta gli
        // echo dei propri stessi push (rev ≤ questo) per non arretrare.
        lastPushedRev: function () { return lastPushedRev; },
        acquireDriver: acquireDriver,
        releaseDriver: releaseDriver,
        onInterventionChange: onInterventionChange,
        setIntervention: setIntervention,
        onReloadSignal: onReloadSignal,
        requestReloadAll: requestReloadAll,
        backupTurn: backupTurn,
        archiveLog: archiveLog,
        listBackups: listBackups,
        getBackup: getBackup,
        deleteBackupsAfter: deleteBackupsAfter,
        login: login,
        logout: logout,
        _devSetAdmin: _devSetAdmin
    };
})();

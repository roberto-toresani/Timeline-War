# Resoconto check pre-partita — 2026-10-01

Tutto girato in **modalità solo-locale (`?local=1`)**: nessuna scrittura su Firestore di produzione.

## 1. Controlli statici
- **Sintassi**: tutti i file JS (`src/js`, `driver/`, `scripts/`) passano `node --check`.
- `DEV_ADMIN_BYPASS = false` ✅ (pronto per il rilascio).
- **Obiettivi**: tutti e 10 i regni di partenza hanno un binario di **8 capitoli**. Generate
  **2160 assegnazioni** (10 regni × 8 capitoli × 3 intensità × 3 andamenti × 3 momenti):
  sempre 3 voci (5/3/2 punti), nessun template mancante, nessun SET mancante, nessuna
  soglia non numerica, nessun testo vuoto o con segnaposto, nessuna eccezione in misura.
- Nomi dei regni della mappa iniziale = nomi dei binari ✅. Nomi dei regni d'evento = nomi
  delle dottrine ✅.

## 2. Partita di prova (2 umani + 8 bot, poi 15 regni)
- Prepara → link d'invito presenti → turni fermi → **🏁 Avvia** ✅
- **22 giri completi**, bot alla massima velocità, umani in auto-turno: **0 errori JS, 0 blocchi**.
- Eventi scattati al turno giusto: Selgiuchidi (9), Portogallo, Bulgaria, Prima Crociata
  (11), Invasione mongola + Crociata inglese (21). Mongoli nati e in marcia.
- **Chiusura cicli** al turno 10→11 e 20→21: capitolo avanzato, prestigio versato,
  obiettivi nuovi presenti per tutti e 10 i regni. I regni d'evento non hanno obiettivi (by design).
- **Ricaricamento** dell'editor a metà partita: stato identico (turno, turno di chi, regni) ✅.
- **Link d'invito** (`?p=CODICE`): apre il regno giusto, nessun "Editor"/"Cambia regno"/"🌍" ✅.

## 3. Interventi dell'admin
- **Prendere il controllo di un bot** (menu della scheda-regno → 🧑 Admin): la catena dei
  bot si ferma su quel regno e aspetta; la plancia senza codice entra in quel regno con
  "Tocca a te" ✅. Ridarlo all'IA (🤖 strategia) lo fa ripartire ✅.
- **Creare un regno** durante 🔧 *Intervieni*: + Aggiungi giocatore, provincia dipinta →
  ✅ *Applica al prossimo turno* → al cambio turno il regno compare, possiede la provincia
  ed entra nel giro dei turni ✅.

### Bug trovati e corretti
1. **Durante "Intervieni" i bot del browser admin continuavano a giocare** (sullo schermo
   congelato: al commit le loro mosse sparivano). Ora `beginIntervention` li ferma;
   ripartono da soli al commit/annullo.
2. **L'intervento restava "in attesa" se il turno passava dal browser admin stesso** (bot
   guidati lì): veniva applicato solo all'arrivo della mossa di un giocatore remoto. Ora
   si applica a ogni cambio turno, ma solo dal "regista" (editor admin o motore headless;
   non la plancia 👁, non un editor `?nodrive=1`) per evitare due scrittori in gara.
3. **Ricaricando l'editor admin durante il turno di un bot, i bot potevano restare fermi**
   (se il login admin arriva dopo il primo snapshot). Ora al login admin la catena riparte.
4. Un regno creato a partita in corso nasceva con `nato = 1` (niente grazia
   dell'insediamento §8): ora nasce al turno corrente.
5. `restoreTurn` ora ferma i bot in corsa e rifiuta di partire durante un intervento.

## 4. Salvataggio e ripresa dal turno X−1
- **Nuovo**: `⬇ Scarica file` / `⬆ Carica da file` nel pannello 🗄 Partite salvate, e `⬇`
  accanto a "🕰 Ripristina turno" per scaricare il backup Firestore di un turno.
- **Test**: foto al turno 14 → giocato fino al 16 → caricato il file → stato **identico**
  al turno 14 (turno, regno di turno, contatore di progresso, mappa) → la partita riparte ✅.
- **Backup Firestore per turno** (automatico, ultimi 25 turni, a inizio di ogni decennio):
  stesso test con il backup simulato → ripristino identico ✅.
- ⚠️ I vecchi `💾 Save / 📂 Load` in cima all'editor salvano solo mappa + regni (senza
  turno di chi, ordine, eventi): **non usarli** per salvare la partita.

## 5. Cose da sapere prima di partire
- **Mail e scadenza delle 6 ore funzionano SOLO col motore headless** (`driver/`, `npm start`).
  Con il solo editor aperto i bot giocano, ma nessuno riceve la mail e nessun turno scade.
- **Scheda admin in secondo piano**: Chrome rallenta pesantemente i timer delle schede
  minimizzate/nascoste (dopo 5 minuti, un'azione al minuto) → i bot strisciano. Se usi
  l'editor come motore, tienilo in una **finestra a sé, visibile** (non minimizzata).
  Meglio ancora: il motore headless.
- Regola d'oro col motore acceso: l'editor si apre con **`?nodrive=1`**, e niente login
  admin sulle plance dei giocatori.
- Routine consigliata: a fine di ogni giornata di gioco, `⬇ Scarica file`.
- `firestore.rules` va ripubblicata se non l'hai fatto dopo chat/presence.

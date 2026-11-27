# Analisi commerciale — punto di ripartenza

Analisi fatta il **2026-11-20**: quanto manca per vendere il gioco online o in app.
Da qui si riparte. Aggiornare le voci man mano che si chiudono.

## Verdetto
- **Il gioco** è vendibile: ~35.000 righe JS, una ventina di sottosistemi integrati, IA che
  gioca con le stesse azioni dell'umano, obiettivi adattivi su binari storici.
- **La piattaforma** è da partita fra amici: una sola partita al mondo, stato scrivibile da
  chiunque, motore che vive nel DOM di un browser, bot mossi da un cron di GitHub Actions,
  game master umano per i ritocchi.
- **Distanza**: ~3–4 mesi per un single player premium; ~9–12 mesi totali (1 persona full-time
  con AI) per il multiplayer online sugli store.

## Componenti di gioco (maturità 1–5)
| Area | Maturità | Cosa manca |
|---|---|---|
| Mappa (628 province, terreno, fedi, rotte navali) | 5 | Licenza MapChart CC BY-SA 4.0: attribuzione + share-alike sulla mappa derivata. 1,3 MB da provare su telefono |
| Turno a 4 fasi, sequenziale | 4 | Il sequenziale è il collo di bottiglia multiplayer |
| Battaglia | 5 | — |
| Invasioni e mare | 4 | L'IA non usa spie né corpi di spedizione |
| Conquiste | 4 | — |
| Economia | 3 → 4 | Magazzino e manutenzione **implementati il 2026-11-20** |
| Popolarità e politica | 4 | Difficile da capire per un nuovo giocatore |
| Mercato | 3 | Rotte inter-regno solo via terra |
| Diplomazia | 4 | — |
| Fede e scismi | 4 | Tema religioso: rating per età |
| Eventi storici | 4 | Date fisse: ogni partita uguale, poca rigiocabilità |
| Nebbia e spie | 2 | Solo grafica: lo stato intero è leggibile da Firestore; i bot leggono lo stato vero |
| Fine partita | 1 | Nessuna schermata di vittoria, classifica, eliminazione gestita |

## Sistemi automatici
- **Obiettivi §10** (vantaggio competitivo): 11 binari, 80+ capitoli, ~20 template, 3 intensità,
  ritmo 0,75–1,4, freno, traboccamento, leva. Limiti: binari scritti a mano (ok come DLC), ritmo
  misurato solo sulle province, tarati su una sola partita → servono simulazioni di massa.
- **Difficoltà crescente**: esistono intensità adattiva, presidi neutrali in crescita, grazia
  d'insediamento. Mancano livelli di difficoltà dell'IA, adattamento al giocatore, rating/ELO.
- **Bot**: stesse azioni dell'umano, 4 strategie + dottrine. Barano sull'informazione, non usano
  spie/corpi, girano solo dentro un browser.
- **Chat con i bot**: parole chiave → 4 intenti → frase a caso. Nessuna memoria né conseguenza.
  Opportunità: diplomatici guidati da un modello linguistico, collegati alle azioni vere.
- **Papa, interventi admin, ritocchi**: oggi sono un game master umano → da sostituire con sistemi.
- **Mail e turni automatici**: Gmail SMTP (limiti, spam) + GitHub Actions ogni 20 min da repo
  pubblico (ritardo, rischio termini d'uso). In app: notifiche push.

## Bloccanti, dal più grave
1. **Stato nel DOM** (attributi SVG; `game-actions.js` passa dal motore di `app.js` in 500+ punti).
   Refactor che sblocca server autorevole, bot economici, test. I moduli puri (battle, objectives,
   popularity, diplomacy, religions, events, terrain, sea-routes, spies, doctrines) sono già pronti.
   **Regola da ora: nessuna nuova dipendenza dal DOM in `game-actions.js`.**
2. **Nessuna protezione lato server**: `allow write: if true` su partita, chat, presenza.
3. **Una sola partita** (`games/main` fisso), nessun account (il link `?p=` è l'identità).
4. **Turni sequenziali + partite lunghe** (50+ turni, 6 h per umano).
5. **Mobile**: plancia completa solo desktop.
6. **Solo italiano**.
7. **Nessun test automatico**.
8. **Manca la fine partita** (il freno anti-valanga ora c'è: magazzino + manutenzione).
9. **Legale/brand**: "Risiko" è marchio di Editrice Giochi (titolo di `play.html`); repo pubblico;
   privacy/GDPR, cancellazione account, moderazione chat, acquisti tramite store.
10. **Nessuna telemetria**.

## Due strade
**A — Single player premium (~3–4 mesi, consigliata per partire)**
| Voce | Stima |
|---|---|
| IA a 3 livelli, fine partita | 3–4 sett. |
| Tutorial come prima partita guidata | 3 sett. |
| Inglese | 4–5 sett. |
| UI touch completa + prestazioni mappa su telefono | 5–6 sett. |
| Pacchetti store/Steam, nuovo nome, privacy, pagina store | 2–3 sett. |
| Test moduli puri + telemetria di base | 2 sett. |
Vendita: 5–10 € + scenari DLC di altre epoche.

**B — Multiplayer online (+5–8 mesi dopo A)**
| Voce | Stima |
|---|---|
| Stato in JSON puro + motore Node senza browser | 6–10 sett. |
| Server autorevole (azioni validate, nebbia sul server) | 6–8 sett. |
| Account, lobby, partite multiple, matchmaking | 4 sett. |
| Bot e timer sul server, notifiche push | 3 sett. |
| Moderazione, anti-abuso, abbandoni | 2–3 sett. |
| Chat con i bot via modello linguistico | 3–4 sett. |
| Turni a impulsi o partite corte (facoltativo) | 4–6 sett. |
Oggi ogni mossa riscrive l'intero stato (~84 KB): a scala passare alle sole differenze.

Costi fissi: Apple 99 $/anno, Google 25 $ una tantum, commissione store 15% sotto 1 M$/anno.

## Nome del prodotto — verifica "Timeline War" (2026-11-20, ricerca web, non legale)
- **Corrispondenza esatta**: nessun gioco né marchio trovato col nome "Timeline War".
- **Vicini pericolosi, stesso genere**:
  - *Timelines: War Kingdoms* — App Store, strategia di guerra a turni (rischio confusione alto).
  - *Time War* — Google Play, strategia, ~650K installazioni (Springcomes, 2024).
  - *Timeless War* — Steam, strategia per epoche (ritirato dallo store).
  - Marchi: TIME WARS (USA, classe 28, giocattoli); TIMELINE (gioco di carte Asmodee).
- **Conclusione**: formalmente libero, ma in uno spazio affollato e confondibile; parole generiche
  rendono difficile anche farsi trovare negli store. Prima di investire nel brand: ricerca
  professionale su EUIPO / UIBM / TMview (classi 9, 28, 41) e valutare un nome più distintivo.

## Fatto dopo l'analisi
- 2026-11-20 — Magazzino (tetto per tipo, livelli 1–3, vendita automatica dell'eccedenza) e
  Manutenzione: strutture ogni 4 turni (da lvl 2), truppe ogni 7 (sempre). Regole e scelte da confermare in
  `docs/regole/RISORSE_ECONOMIA.md`. Provato in locale (motore, plancia, mappa, 2 simulazioni
  bot da 16 turni senza errori). **Da tarare**: senza province di Grano i regni perdono ~6 uomini
  a testa in 16 turni; nessun bot amplia il magazzino prima del turno 16 (monete scarse).
  Non ancora committato né pubblicato.

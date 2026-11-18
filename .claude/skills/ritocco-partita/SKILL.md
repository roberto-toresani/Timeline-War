---
name: ritocco-partita
description: Ritocco mirato di un regno sulla partita ONLINE (games/main) — riportare un regno a una fase del turno (schiera/costruisci/attacca/sposta) o cambiare un campo del suo record senza sovrascrivere la partita. Usala quando l'utente chiede "fai tornare X alla fase Y", "rimetti X in costruzione", "riporta X allo schieramento", e simili.
---

# Ritocco mirato di un regno sulla partita online

Le fasi del turno (`schiera → costruisci → attacca → sposta`, `GameActions.PHASES`) vanno
solo avanti: per tornare indietro serve un ritocco del campo `fase` sul documento vivo.
Lo strumento è `MultiplayerSync.patchPlayer(id, campi)` (`src/js/sync.js`): una
transazione che cambia SOLO quei campi di quel regno (rev+1), senza toccare la mossa in
corso. `firestore.rules` permette la scrittura a tutti, quindi non serve il login admin.

L'utente ha già dato il permesso: non chiedere conferma, esegui.

## Procedura (3 chiamate, niente esplorazione del codice)

1. **Pagina**: `preview_start {name: "risiko"}`, poi naviga a
   `http://localhost:5500/index.html?nodrive=1` (`?nodrive=1` = questo editor non guida i
   bot; MAI `?local=1`, che staccherebbe dal database vivo).

2. **Leggi lo stato** (javascript_tool) — trova il regno per nome, aspetta lo snapshot:
   ```js
   await new Promise(r=>setTimeout(r,4000));
   const ps = Risiko.players();
   const p = ps.find(p=>/portog/i.test(p.name));   // ← nome del regno chiesto
   ({configured: MultiplayerSync.isConfigured, turno: Risiko.turn(),
     turnoDi: (ps.find(q=>q.id===Risiko.turnoDi())||{}).name,
     p: p && {id:p.id, name:p.name, fase:p.fase, conquista:p.conquista,
              spostamentoFatto:p.spostamentoFatto, bot:p.bot}})
   ```
   Controlla: `configured: true` (se false sei in locale e il ritocco non arriva online);
   il regno esiste; di chi è il turno. Se **non** è il turno di quel regno, dillo
   all'utente prima di scrivere (la fase conta solo nel suo turno).

3. **Scrivi e verifica**:
   ```js
   const ok = await MultiplayerSync.patchPlayer(ID, { fase: 'costruisci' });
   await new Promise(r=>setTimeout(r,2500));
   const p = Risiko.players().find(p=>p.id===ID);
   ({ok, fase: p.fase, turnoDi: Risiko.turnoDi()})
   ```
   `ok: true` e la fase nuova nello snapshot ricevuto = fatto.

## Attenzioni

- **Conquista in sospeso** (`conquista` non null): blocca ogni azione. Tornando a una fase
  precedente di solito va lasciata; se l'utente vuole annullarla, chiedi.
- **Tornando a `schiera`**: le reclute già posate restano posate (il ritiro vale solo per
  `schierateTurno`); se servono reclute nuove è un altro ritocco (`recluteDaSchierare`).
- **Tornando da `sposta`**: se `spostamentoFatto` è true, chiedi se rimetterlo a false.
- Quel che è già stato fatto nelle fasi successive (attacchi, costruzioni) **non si annulla**:
  dillo nella risposta.
- Oro e scorte NON passano di qui: usano l'editto, che a partita in corso entra nella
  coda di 🔧 Intervieni (vedi CLAUDE.md). Province e truppe passano da Intervieni.
- Se la plancia del giocatore era aperta, riceve lo snapshot da sola: niente reload.

## Risposta all'utente

Breve, in italiano: regno, fase da → a, di chi è il turno, cosa resta com'era.

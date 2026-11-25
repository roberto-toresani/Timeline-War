---
name: obiettivi-ciclo
description: Stesura degli obiettivi di prestigio (§10) del ciclo successivo della partita online — analisi dei regni a 2 turni dalla fine del ciclo, stima dei completamenti e dell'intensità (avanzare/equilibrato/difendere), ricerca storica online del secolo, proposta di Primario/Secondario/Terziario con titoli. Usala quando l'utente chiede "scrivi gli obiettivi del ciclo N", "prepara il ciclo nuovo", "obiettivi del 1400", e simili.
---

# Obiettivi del ciclo successivo

È un lavoro di **progettazione**: si consegna una proposta scritta in un documento. Il
codice si tocca solo dopo il via dell'utente. Il modello da seguire è
`docs/CICLO4_RICERCA.md`: stessa struttura, stesso livello di dettaglio.

## 1. Leggere la partita VIVA (mai `src/_live-copy.json`)
Usa Claude in Chrome sulla pagina
`https://roberto-toresani.github.io/Timeline-War/index.html?nodrive=1`. In console:
- `d = (await firebase.firestore().collection('games').doc('main').get()).data()` →
  `turn`, `turnoDi`, `ordine` (chi deve ancora giocare il turno corrente), `eventi`.
- `Risiko.players()` + `Risiko.objectivesFor(p)` → punti, `items[].completato`,
  `misura`/`n`, `intensita` del ciclo in corso.
- `Risiko.objectiveContext(p)` → `ownedIds`, `soldiersOn`, `monete` (numero, non
  funzione), `popularity`, `sicurezza`, `benessere`, `cityIds`, `shipIds`,
  `knightCount`, `politicaGrade`, `tradesThisCycle`, `scorteOf(res)`, `capitalId`.
- `Risiko.engine.landNeighbors(id)` → i confinanti; per sapere di chi è una provincia,
  confronta `d.pieces[id].c` con `p.color`.
- `p.patti` (`{tipo, con}`), `p.tassazione`, `p.cicliStorico` (l'ultima voce ha le
  province di fine ciclo precedente, che servono al controllo "province perse").
- Sanità per la Peste: `data-welfare` della Capitale (acquedotto, lebbrosario, ospedale,
  erboristeria, macelleria). `GameRules.plagueTier`: con 4 o più il regno è al riparo.
- L'output di javascript_tool si tronca verso i 1500 caratteri: salva i dati su
  `window.__X` e leggili a pezzi.

## 2. Stimare i completamenti (la parte difficile)
Per ogni voce NON compiuta scrivi **cosa manca in numeri** e **se ci si arriva nei turni
che restano**:
- conta i turni reali: chi ha già giocato il turno corrente ne ha uno in meno;
- entrate = (Città + Capitale) × 50/100/150 (tassa leggera/normale/dura). Reclute ≈
  province÷3 + effetto Popolarità + 1 per Città;
- costi (`GameRules.COSTS`): Città 800 + pietra 3, argilla 2, bestiame 2 · Fortezza 1500
  + 18 risorse · Nave 3 legno + 1 uomo · Cavaliere 50 + 1 bestiame · Mercenario 100;
- Popolarità = arrotonda((Sicurezza + Benessere + Tassa)/3), arrotondando per difetto
  salvo decimali sopra 0,8; la tassa vale 5/3/1. Spesso un obiettivo di Popolarità si
  chiude **cambiando tassa**: dillo;
- una conquista dipende da chi difende, da quanti uomini ha e dai patti (con una non
  belligeranza la conquista non si fa);
- dai una **probabilità** e una **stima dei punti**.

## 3. Intensità del ciclo nuovo (`Objectives.passo`)
eccedere = **AVANZARE**, avanzare = **EQUILIBRATO**, resistere = **DIFENDERE**.
- Primario + tutti e 3 → AVANZARE.
- Primario fatto → EQUILIBRATO.
- 2 su 3 senza province perse → resta dov'è (da DIFENDERE sale a EQUILIBRATO).
- 1 su 3 senza perdite → resta dov'è.
- 0 su 3, o province perse → scende di un gradino.
- Capitale persa o 2 province o meno → DIFENDERE.

"Province perse" vuol dire meno province di fine ciclo precedente (`cicliStorico`); il
Primario fatto le scavalca. L'intensità decide il **modello**: con AVANZARE il Primario
è una conquista, con EQUILIBRATO è una conquista vicina oppure la difesa di un
confine, con DIFENDERE si tengono le proprie province.

## 4. Ricerca storica
- Parti da `docs/BINARI_STORICI.md` (direzione del regno e legenda dell'utente) e dalla
  riga del secolo in `Obiettivi.xlsx`. Per leggerla: decomprimi lo zip e leggi
  `xl/sharedStrings.xml` e `xl/worksheets/sheet1.xml`. Le bozze di quella riga sono
  spesso deboli (troppo oro): servono come spunto.
- **WebSearch per OGNI regno sul secolo in arrivo**, più gli eventi di gioco datati nel
  ciclo (`docs/regole/EVENTI.md`, `js/events.js`: Peste 35-39, ritiro dell'Orda 31, ecc.).
  Fonti in fondo al documento.

## 5. Scrivere gli obiettivi — regole dell'utente
- **Primario (5) storico/militare quasi sempre**: conquistare o difendere province
  precise, con N uomini.
- **Secondario (3) e Terziario (2)**: da variare fra tesoro o scorte, edifici (Città,
  Fortezza, Mercato), Popolarità/Sicurezza/Benessere, politica (nobili/popolo), navi,
  fede, commerci, Sanità.
- **Un titolo storico per ogni voce**, più un tema per il capitolo.
- Ogni voce deve essere **misurabile come stato** con un template esistente
  (`objectives.js`, TEMPLATES) o con un template nuovo dichiarato nel §4 del documento.
- **Self-driven**: non deve dipendere dal successo di un evento. Il testo non nomina mai
  l'Orda o un invasore che potrebbe non arrivare. Conquistare province di un altro
  regno va bene; un fronte doppio voluto (Cent'Anni, Stretto) si dichiara.
- **Mai già compiuto alla nascita**, e mai un obiettivo vecchio rifatto: controlla lo
  stato di oggi (es. Sanità 4 già presente → niente obiettivo Sanità).
- **Calibra sul regno**: un regno povero non riceve un muro d'oro. Sfrutta quello che ha
  già in magazzino (es. la Polonia con legno e pietra → Fortezza).
- Segnala i **blocchi**: patti di non belligeranza, province che non esistono sulla
  mappa, obiettivi in conflitto con l'alleato.
- Soglie scritte come AVANZARE / EQUILIBRATO / DIFENDERE, con in grassetto quella prevista.

### Lezioni dalla revisione dell'utente (ciclo IV, 2026-11-22)
- **Titoli**: italiani, evocativi e comprensibili. Un luogo o un fatto noto del secolo
  («La Morte Nera a Parigi», «Kolomna, la piazza d'armi», «Le galee di Ceuta»), non
  un'istituzione straniera oscura («L'Hôtel-Dieu» è stato bocciato). Il titolo deve
  corrispondere a quel che chiede la voce: un titolo sul Cremlino non va bene per una
  Fortezza che non si può costruire a Mosca, che è Capitale.
- **Niente navi "a numero"** senza uno scopo: «possiedi 6 navi» non serve a nulla.
  Le navi vanno legate a una conquista (`conquisteNavali`) o a una costa precisa.
- **Niente scorte che competono con quel che il regno dovrà spendere**: il bestiame
  serve ai cavalieri (in guerra). Meglio chiedere direttamente i cavalieri, oppure una
  scorta che il regno non consuma per il Primario (es. legno alla Castiglia).
- **Stile che l'utente preferisce**:
  - elenchi di province precise da conquistare e difendere;
  - «nessuna provincia di fede X» (`regioneSenzaFede`: lascia libero chi tiene la
    provincia, purché sia della fede giusta);
  - Fortezze e Città come edifici-traguardo;
  - cavalieri (10-15);
  - N scambi commerciali (2-5);
  - politica forte da un lato;
  - Sicurezza 4-5;
  - collegare N tipi di risorsa.
- **Guarnigioni solo dove servono**: in un elenco lungo di conquiste, gli uomini minimi
  si chiedono solo sulle province di frontiera calda (Rus': solo Kuban e Stavropol;
  Ungheria: solo la Slovenia). Le altre basta possederle. Un Primario già complesso
  (Abbasidi: tutta l'Arabia) non porta guarnigioni imposte.
- L'utente accetta Primari contro **regni con cui c'è un patto** (vanno rotti) e i fronti
  doppi: vanno segnalati, non evitati.
- Con un'indicazione ambigua (es. «collega 2 risorse» quando il regno ne collega già 2)
  si sceglie l'interpretazione che non nasce già compiuta e la si chiede in chiaro.
- Verifica ogni id di provincia sulla mappa (`d.pieces[id]` esiste).

## 5b. I regni nati per evento
Svezia, Danimarca, Delhi e Giappone (e ogni regno futuro) non hanno il binario lungo dei
dieci grandi: hanno solo i capitoli scritti a mano. Se manca il capitolo del ciclo
nuovo, `chapter()` ripiega sull'ultimo scritto e il regno **riceve gli stessi obiettivi
di prima**. A ogni ciclo va quindi scritto anche il loro capitolo, accodato al loro
binario in `objectives.js`. Controlla anche `Events.EVENTS` per i regni che nascono
proprio a inizio ciclo.
Ogni capitolo porta il suo `ciclo`, e `Objectives.chapterForCycle` sceglie quello giusto.
Prima del fix del 2026-11-25 aggiungere un capitolo a metà ciclo spingeva la Svezia
avanti e le rigenerava gli obiettivi in corso. Dopo un'aggiunta, ricontrolla comunque
sulla partita viva `obiettiviCiclo` dei regni d'evento.

## 6. Consegna
- `docs/CICLO<N>_RICERCA.md` con: esito del ciclo in corso (tabella, probabilità,
  intensità), filo del secolo, una scheda per regno (storia, stato, tabella P/S/T con
  template e soglie), cosa serve nel codice, fonti.
- In chat: le intensità previste e i nodi da decidere, senza recap.
- Implementazione in `objectives.js` solo col via: capitolo `ciclo: N` per ogni regno, e
  deploy PRIMA del turno di `closeCycle`, che congela gli obiettivi in `obiettiviCiclo`
  (vedi la memoria ritocco-obiettivo-vivo).

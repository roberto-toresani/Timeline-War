// Pedine di gioco (figurine piazzate dai giocatori), in stile medievale
// dettagliato: soldato, generale, barca, vascello, citta', fortezza, mercato,
// strada. A differenza delle risorse (colore fisso, auto-piazzate), queste sono
// SAGOME tinte con il COLORE DEL GIOCATORE.
//
// COME SI TINGONO / COME SI SCONTORNANO:
//   la geometria di ogni pedina sta UNA VOLTA SOLA in un gruppo <g id="sh-...">
//   dentro i defs; il <symbol> la riusa con <use> due o tre volte, sovrapposte:
//     1) strato-CONTORNO  -> stesso disegno con stroke PC_INK spesso (PC_OUT):
//        essendo sotto, sborda tutt'intorno e diventa il bordo nero della sagoma.
//        E' quello che rende le pedine leggibili anche de-zoomando, e soprattutto
//        quando la provincia ha lo stesso colore della pedina.
//     2) strato-COLORE    -> fill="currentColor" (imposta `color: <colore giocatore>`
//        sull'elemento <use> o su un antenato) + sottile stroke bianco interno che
//        stacca i volumi fra loro;
//     3) strato-OMBRA     -> gradiente #pc-sh (luce in alto-sinistra, ombra in
//        basso-destra) che dà l'effetto "plastica scolpita" su qualsiasi colore.
//   I dettagli-buco (finestre, mezzeria strada, portale) restano fissi a #fff.
//   Chi tocca la geometria la modifica in un posto solo: i tre strati sono <use>.
//   Le decorazioni sottilissime (aste, croci, pennoni) portano stroke="none":
//   con un contorno spesso diventerebbero macchie nere.
//
// COME SI USANO (stessa meccanica dei simboli-risorsa):
//   1) iniettare PIECE_SYMBOLS dentro <defs> dell'SVG mappa (una volta sola);
//   2) per piazzare una pedina: <use href="#pc-soldato"
//        style="color:#e6194B" width=".." height=".." x=".." y=".."/>.
//   Valori validi per il tipo: le chiavi di PIECES qui sotto.
//
// NOTE SULLE FIGURE:
//   - citta'  = borgo CIVILE (cattedrale, case, torre civica) — niente merli.
//   - fortezza = castello MILITARE (mura, bastioni, mastio merlato, portale).

// max = quante se ne possono impilare nella STESSA provincia.
//   unita' mobili (soldato, barca, vascello) -> si impilano (mostrano il numero);
//   generale ed edifici (citta, fortezza, mercato, strada) -> una sola.
// Per rendere impilabile un altro tipo basta alzare il suo "max".
const PIECES = {
    soldato:  { nome: 'Soldato',  max: 30 },
    generale: { nome: 'Generale', max: 1  },
    barca:    { nome: 'Barca',    max: 15 },
    vascello: { nome: 'Vascello', max: 15 },
    capitale: { nome: 'Capitale', max: 1  },
    citta:    { nome: 'Città',    max: 1  },
    fortezza: { nome: 'Fortezza', max: 1  },
    mercato:  { nome: 'Mercato',  max: 1  },
    strada:   { nome: 'Strada',   max: 1  },
};

// Inchiostro del contorno e suo spessore (sul viewBox 0 0 100 100: metà sborda
// fuori dalla sagoma, quindi PC_OUT=9 -> alone nero di 4.5 unità su 100).
// Alzarlo rende le pedine più marcate da lontano e più "cartoon" da vicino.
// PC_LINE è il filetto bianco INTERNO che stacca i volumi: tenuto sottile
// apposta, perché da lontano un filetto grosso sbianca la pedina e ne uccide
// il colore del giocatore (che è l'informazione principale).
const PC_INK = '#14100b';
const PC_OUT = 9;
const PC_LINE = 1.4;

// Ogni pedina e' un <symbol> viewBox 0 0 100 100 che sovrappone gli strati
// descritti in testa al file, tutti <use> dello stesso gruppo di geometria.
const PIECE_SYMBOLS = `
<linearGradient id="pc-sh" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#fff" stop-opacity="0.6"/>
  <stop offset="0.4" stop-color="#fff" stop-opacity="0"/>
  <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000" stop-opacity="0.5"/>
</linearGradient>

<g id="sh-soldato" fill="currentColor" stroke-linejoin="round" stroke-linecap="round">
  <ellipse cx="48" cy="87" rx="18" ry="3.8" fill="#000" opacity="0.20" stroke="none"/>
  <ellipse cx="48" cy="80" rx="18" ry="5"/>
  <path d="M30 80 A18 5 0 0 0 66 80 L66 77 A18 5 0 0 1 30 77 Z" fill="#000" opacity="0.22" stroke="none"/>
  <ellipse cx="48" cy="77" rx="18" ry="5"/>
  <path d="M38 78 L38 50 C38 45 42 42 48 42 C54 42 58 45 58 50 L58 78 Z"/>
  <path d="M45.5 43 L50.5 43 L50 38 L46 38 Z"/>
  <circle cx="48" cy="32" r="9"/>
  <path d="M38 78 L38 50 C38 45 42 42 48 42 L48 78 Z" fill="#fff" opacity="0.12" stroke="none"/>
  <path d="M48 42 C54 42 58 45 58 50 L58 78 L48 78 Z" fill="#000" opacity="0.14" stroke="none"/>
  <line x1="42.5" y1="47" x2="42.5" y2="55" stroke="#000" stroke-opacity="0.14" stroke-width="1.4"/>
  <line x1="53.5" y1="47" x2="53.5" y2="55" stroke="#000" stroke-opacity="0.18" stroke-width="1.4"/>
  <ellipse cx="44.5" cy="29" rx="3.2" ry="3.8" fill="#fff" opacity="0.40" stroke="none"/>
  <ellipse cx="51.5" cy="33" rx="3" ry="4.2" fill="#000" opacity="0.13" stroke="none"/>
  <circle cx="42" cy="61" r="11"/>
  <circle cx="42" cy="61" r="11" fill="none" stroke="#000" stroke-opacity="0.18" stroke-width="1.6"/>
  <path d="M42 50 A11 11 0 0 0 31 61 Q36 52 42 50 Z" fill="#fff" opacity="0.18" stroke="none"/>
  <path d="M42 72 A11 11 0 0 0 53 61 Q48 70 42 72 Z" fill="#000" opacity="0.12" stroke="none"/>
  <circle cx="42" cy="61" r="2.6"/>
  <circle cx="42" cy="61" r="2.6" fill="none" stroke="#000" stroke-opacity="0.2" stroke-width="1"/>
  <ellipse cx="38.6" cy="57.6" rx="2.3" ry="2.7" fill="#fff" opacity="0.35" stroke="none"/>
</g>
<symbol id="pc-soldato" viewBox="0 0 100 100">
  <use href="#sh-soldato" xlink:href="#sh-soldato" stroke="${PC_INK}" stroke-width="${PC_OUT}"/>
  <use href="#sh-soldato" xlink:href="#sh-soldato"/>
</symbol>

<g id="sh-generale" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="M22 82 C22 58 28 50 33 50 C39 50 45 58 45 82 Z"/><circle cx="33" cy="40" r="6"/><path d="M27 40 a6 6 0 0 1 12 0 z"/><path d="M33 34 C31 27 36 25 38 25 C35 29 35 32 35 34 Z"/><path d="M43 16 C60 14 68 24 84 20 L84 42 C68 46 60 36 43 42 Z"/><path d="M60 24 h4 v5 h5 v4 h-5 v6 h-4 v-6 h-5 v-4 h5 z" fill="#fff" stroke="none"/><rect x="40" y="12" width="3" height="70" rx="1.5"/><path d="M41.5 8 l3.5 8 h-7 z"/></g>
<symbol id="pc-generale" viewBox="0 0 100 100">
  <use href="#sh-generale" xlink:href="#sh-generale" stroke="${PC_INK}" stroke-width="${PC_OUT}"/>
  <use href="#sh-generale" xlink:href="#sh-generale" stroke="#fff" stroke-width="${PC_LINE}"/>
  <g fill="url(#pc-sh)" stroke="none"><path d="M22 82 C22 58 28 50 33 50 C39 50 45 58 45 82 Z"/><circle cx="33" cy="40" r="6"/><path d="M27 40 a6 6 0 0 1 12 0 z"/><path d="M33 34 C31 27 36 25 38 25 C35 29 35 32 35 34 Z"/><path d="M43 16 C60 14 68 24 84 20 L84 42 C68 46 60 36 43 42 Z"/><rect x="40" y="12" width="3" height="70" rx="1.5"/><path d="M41.5 8 l3.5 8 h-7 z"/></g>
</symbol>

<g id="sh-barca" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="M18 60 Q50 78 82 60 L75 71 Q50 80 25 71 Z"/><rect x="48.5" y="24" width="3" height="36" rx="1.5"/><path d="M35 36 Q50 40 65 36 L65 54 Q50 58 35 54 Z"/><rect x="34" y="33" width="32" height="2.6" rx="1.3"/><path d="M50 24 l9 3 l-9 3 z"/></g>
<symbol id="pc-barca" viewBox="0 0 100 100">
  <use href="#sh-barca" xlink:href="#sh-barca" stroke="${PC_INK}" stroke-width="${PC_OUT}"/>
  <use href="#sh-barca" xlink:href="#sh-barca" stroke="#fff" stroke-width="${PC_LINE}"/>
  <g fill="url(#pc-sh)" stroke="none"><path d="M18 60 Q50 78 82 60 L75 71 Q50 80 25 71 Z"/><rect x="48.5" y="24" width="3" height="36" rx="1.5"/><path d="M35 36 Q50 40 65 36 L65 54 Q50 58 35 54 Z"/><rect x="34" y="33" width="32" height="2.6" rx="1.3"/><path d="M50 24 l9 3 l-9 3 z"/></g>
</symbol>

<g id="sh-vascello" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="M10 56 Q50 76 90 56 L83 70 Q50 82 17 70 Z"/><rect x="74" y="44" width="12" height="14" rx="1"/><rect x="14" y="48" width="11" height="10" rx="1"/><rect x="28" y="24" width="2.6" height="34" rx="1.3" stroke="none"/><rect x="49" y="16" width="2.8" height="42" rx="1.4" stroke="none"/><rect x="68" y="26" width="2.6" height="32" rx="1.3" stroke="none"/><path d="M21 29 Q28.5 32 36 29 L36 42 Q28.5 45 21 42 Z"/><rect x="20" y="28" width="17" height="2" rx="1" stroke="none"/><path d="M61 31 Q68 34 75 31 L75 43 Q68 46 61 43 Z"/><rect x="60" y="30" width="17" height="2" rx="1" stroke="none"/><path d="M37 30 Q50 34 63 30 L63 48 Q50 52 37 48 Z"/><rect x="36" y="28" width="28" height="2.4" rx="1.2" stroke="none"/><path d="M42 21 Q49.5 24 57 21 L57 30 Q49.5 33 42 30 Z"/><rect x="41" y="20" width="16" height="2" rx="1" stroke="none"/><path d="M49.5 16 l10 3 l-10 3 z" stroke="none"/><path d="M28 24 l8 2.5 l-8 2.5 z" stroke="none"/><path d="M68 26 l8 2.5 l-8 2.5 z" stroke="none"/></g>
<symbol id="pc-vascello" viewBox="0 0 100 100">
  <use href="#sh-vascello" xlink:href="#sh-vascello" stroke="${PC_INK}" stroke-width="${PC_OUT}"/>
  <use href="#sh-vascello" xlink:href="#sh-vascello" stroke="#fff" stroke-width="${PC_LINE}"/>
  <g fill="url(#pc-sh)" stroke="none"><path d="M10 56 Q50 76 90 56 L83 70 Q50 82 17 70 Z"/><rect x="74" y="44" width="12" height="14" rx="1"/><rect x="14" y="48" width="11" height="10" rx="1"/><path d="M21 29 Q28.5 32 36 29 L36 42 Q28.5 45 21 42 Z"/><path d="M61 31 Q68 34 75 31 L75 43 Q68 46 61 43 Z"/><path d="M37 30 Q50 34 63 30 L63 48 Q50 52 37 48 Z"/><path d="M42 21 Q49.5 24 57 21 L57 30 Q49.5 33 42 30 Z"/></g>
</symbol>

<g id="sh-citta" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"><rect x="16" y="56" width="16" height="26"/><path d="M14 56 L24 45 L34 56 Z"/><rect x="20" y="70" width="4" height="12" fill="#fff" stroke="none"/><rect x="26" y="61" width="3.5" height="3.5" fill="#fff" stroke="none"/><rect x="33" y="50" width="9" height="32"/><path d="M31.5 50 L37.5 41 L43 50 Z"/><rect x="35.5" y="56" width="3" height="3" fill="#fff" stroke="none"/><rect x="35.5" y="63" width="3" height="3" fill="#fff" stroke="none"/><rect x="42" y="40" width="18" height="42"/><path d="M40 40 L51 26 L62 40 Z"/><path d="M47 26 L51 6 L55 26 Z"/><rect x="50.2" y="0.5" width="1.6" height="6" stroke="none"/><rect x="48" y="2" width="6" height="1.6" stroke="none"/><circle cx="51" cy="49" r="3.4" fill="#fff" stroke="none"/><path d="M48 82 V70 a3.5 3.5 0 0 1 7 0 V82 Z" fill="#fff" stroke="none"/><rect x="64" y="50" width="12" height="32"/><path d="M62 50 L70 36 L78 50 Z"/><circle cx="70" cy="36" r="1.8" stroke="none"/><rect x="68" y="56" width="4" height="4" fill="#fff" stroke="none"/><rect x="76" y="60" width="12" height="22"/><path d="M74 60 L82 51 L90 60 Z"/><rect x="80" y="70" width="4" height="12" fill="#fff" stroke="none"/></g>
<symbol id="pc-citta" viewBox="0 0 100 100">
  <use href="#sh-citta" xlink:href="#sh-citta" stroke="${PC_INK}" stroke-width="${PC_OUT}"/>
  <use href="#sh-citta" xlink:href="#sh-citta" stroke="#fff" stroke-width="${PC_LINE}"/>
  <g fill="url(#pc-sh)" stroke="none"><rect x="16" y="56" width="16" height="26"/><path d="M14 56 L24 45 L34 56 Z"/><rect x="33" y="50" width="9" height="32"/><path d="M31.5 50 L37.5 41 L43 50 Z"/><rect x="42" y="40" width="18" height="42"/><path d="M40 40 L51 26 L62 40 Z"/><path d="M47 26 L51 6 L55 26 Z"/><rect x="64" y="50" width="12" height="32"/><path d="M62 50 L70 36 L78 50 Z"/><rect x="76" y="60" width="12" height="22"/><path d="M74 60 L82 51 L90 60 Z"/></g>
</symbol>

<g id="sh-capitale" fill="currentColor" stroke-linejoin="round" stroke-linecap="round">
  <rect x="22" y="50" width="20" height="32"/>
  <rect x="58" y="50" width="20" height="32"/>
  <rect x="40" y="30" width="20" height="52"/>
  <rect x="20" y="47.5" width="60" height="4"/>
  <rect x="39" y="26" width="22" height="5.5" rx="1"/>
  <path d="M39 26 L43 15 L47 22 L50 13 L53 22 L57 15 L61 26 Z"/>
  <circle cx="43" cy="15" r="1.6" fill="#fff" stroke="none"/>
  <circle cx="50" cy="13" r="1.8" fill="#fff" stroke="none"/>
  <circle cx="57" cy="15" r="1.6" fill="#fff" stroke="none"/>
  <path d="M45 82 V68 a5 5 0 0 1 10 0 V82 Z" fill="#fff" stroke="none"/>
  <rect x="26" y="58" width="4" height="7" fill="#fff" stroke="none"/>
  <rect x="33" y="58" width="4" height="7" fill="#fff" stroke="none"/>
  <rect x="63" y="58" width="4" height="7" fill="#fff" stroke="none"/>
  <rect x="70" y="58" width="4" height="7" fill="#fff" stroke="none"/>
  <rect x="43" y="40" width="4" height="7" fill="#fff" stroke="none"/>
  <rect x="53" y="40" width="4" height="7" fill="#fff" stroke="none"/>
</g>
<symbol id="pc-capitale" viewBox="0 0 100 100">
  <use href="#sh-capitale" xlink:href="#sh-capitale" stroke="${PC_INK}" stroke-width="${PC_OUT}"/>
  <use href="#sh-capitale" xlink:href="#sh-capitale" stroke="#fff" stroke-width="${PC_LINE}"/>
  <g fill="url(#pc-sh)" stroke="none"><rect x="22" y="50" width="20" height="32"/><rect x="58" y="50" width="20" height="32"/><rect x="40" y="30" width="20" height="52"/><rect x="20" y="47.5" width="60" height="4"/><rect x="39" y="26" width="22" height="5.5" rx="1"/><path d="M39 26 L43 15 L47 22 L50 13 L53 22 L57 15 L61 26 Z"/></g>
</symbol>

<g id="sh-fortezza" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="M14 46 L23.5 27 L33 46 Z"/><rect x="17" y="44" width="13" height="38"/><rect x="22.7" y="19" width="1.6" height="9" stroke="none"/><path d="M24.3 19 l7 2.4 l-7 2.4 z" stroke="none"/><path d="M60 48 L68.5 30 L77 48 Z"/><rect x="62" y="46" width="13" height="36"/><rect x="67.7" y="23" width="1.6" height="8" stroke="none"/><path d="M69.3 23 l6.5 2.3 l-6.5 2.3 z" stroke="none"/><rect x="40" y="34" width="20" height="48"/><rect x="40" y="29.5" width="4" height="5"/><rect x="48" y="29.5" width="4" height="5"/><rect x="56" y="29.5" width="4" height="5"/><rect x="49.2" y="14" width="1.8" height="16" stroke="none"/><path d="M51 14 l8 2.8 l-8 2.8 z" stroke="none"/><rect x="8" y="56" width="11" height="26" rx="1"/><rect x="8.2" y="52" width="3.2" height="4.5"/><rect x="12.4" y="52" width="3.2" height="4.5"/><rect x="16" y="52" width="3" height="4.5"/><rect x="81" y="56" width="11" height="26" rx="1"/><rect x="81.4" y="52" width="3.2" height="4.5"/><rect x="85.6" y="52" width="3.2" height="4.5"/><rect x="89.2" y="52" width="2.8" height="4.5"/><rect x="17" y="64" width="66" height="18"/><rect x="18" y="59.5" width="5" height="4.8"/><rect x="26" y="59.5" width="5" height="4.8"/><rect x="34" y="59.5" width="5" height="4.8"/><rect x="42" y="59.5" width="5" height="4.8"/><rect x="50" y="59.5" width="5" height="4.8"/><rect x="58" y="59.5" width="5" height="4.8"/><rect x="66" y="59.5" width="5" height="4.8"/><rect x="74" y="59.5" width="5" height="4.8"/><path d="M43.5 82 V72 a6.5 6.5 0 0 1 13 0 V82 Z" fill="#fff" stroke="none"/></g>
<symbol id="pc-fortezza" viewBox="0 0 100 100">
  <use href="#sh-fortezza" xlink:href="#sh-fortezza" stroke="${PC_INK}" stroke-width="${PC_OUT}"/>
  <use href="#sh-fortezza" xlink:href="#sh-fortezza" stroke="#fff" stroke-width="${PC_LINE}"/>
  <g fill="url(#pc-sh)" stroke="none"><path d="M14 46 L23.5 27 L33 46 Z"/><rect x="17" y="44" width="13" height="38"/><path d="M60 48 L68.5 30 L77 48 Z"/><rect x="62" y="46" width="13" height="36"/><rect x="40" y="34" width="20" height="48"/><rect x="8" y="56" width="11" height="26" rx="1"/><rect x="81" y="56" width="11" height="26" rx="1"/><rect x="17" y="64" width="66" height="18"/></g>
</symbol>

<g id="sh-mercato" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"><rect x="20" y="44" width="3" height="34" rx="1" stroke="none"/><rect x="77" y="44" width="3" height="34" rx="1" stroke="none"/><path d="M18 44 L30 32 H70 L82 44 Z"/><path d="M18 44 q4 5.5 8 0 q4 5.5 8 0 q4 5.5 8 0 q4 5.5 8 0 q4 5.5 8 0 q4 5.5 8 0 q4 5.5 8 0 q4 5.5 8 0 v-3 h-64 z"/><path d="M34 44 L40 32 L43 32 L37 44 Z" fill="#fff" stroke="none"/><path d="M50 44 L52 32 L55 32 L53 44 Z" fill="#fff" stroke="none"/><path d="M66 44 L60 32 L63 32 L69 44 Z" fill="#fff" stroke="none"/><ellipse cx="36" cy="53" rx="5" ry="6"/><ellipse cx="46" cy="53" rx="5" ry="6"/><circle cx="58" cy="54" r="5"/><circle cx="66" cy="54" r="4"/><rect x="26" y="58" width="48" height="6" rx="1"/><rect x="30" y="64" width="40" height="14"/><path d="M8 66 q6 -3 12 0 v12 q-6 3 -12 0 z"/><rect x="8" y="70.5" width="12" height="1.8" fill="#fff" stroke="none"/></g>
<symbol id="pc-mercato" viewBox="0 0 100 100">
  <use href="#sh-mercato" xlink:href="#sh-mercato" stroke="${PC_INK}" stroke-width="${PC_OUT}"/>
  <use href="#sh-mercato" xlink:href="#sh-mercato" stroke="#fff" stroke-width="${PC_LINE}"/>
  <g fill="url(#pc-sh)" stroke="none"><path d="M18 44 L30 32 H70 L82 44 Z"/><ellipse cx="36" cy="53" rx="5" ry="6"/><ellipse cx="46" cy="53" rx="5" ry="6"/><circle cx="58" cy="54" r="5"/><circle cx="66" cy="54" r="4"/><rect x="26" y="58" width="48" height="6" rx="1"/><rect x="30" y="64" width="40" height="14"/><path d="M8 66 q6 -3 12 0 v12 q-6 3 -12 0 z"/></g>
</symbol>

<!-- Strada = solo l'ICONA della palette (sulla mappa e' un cancello aperto — due
     trattini scuri di traverso al confine — disegnato da renderRoads fra le due
     province scelte dal giocatore, non questo simbolo). L'icona resta un listello
     di sampietrini nel colore del regno: nella palette deve dirsi "strada" a
     colpo d'occhio, sulla mappa deve solo agganciare due province. -->
<g id="sh-strada" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"><rect x="12" y="42" width="76" height="16" rx="6"/><rect x="26" y="42" width="2.6" height="16" fill="${PC_INK}" stroke="none"/><rect x="40" y="42" width="2.6" height="16" fill="${PC_INK}" stroke="none"/><rect x="54" y="42" width="2.6" height="16" fill="${PC_INK}" stroke="none"/><rect x="68" y="42" width="2.6" height="16" fill="${PC_INK}" stroke="none"/></g>
<symbol id="pc-strada" viewBox="0 0 100 100">
  <use href="#sh-strada" xlink:href="#sh-strada" stroke="${PC_INK}" stroke-width="${PC_OUT}"/>
  <use href="#sh-strada" xlink:href="#sh-strada" stroke="#fff" stroke-width="${PC_LINE}"/>
  <g fill="url(#pc-sh)" stroke="none"><rect x="12" y="42" width="76" height="16" rx="6"/></g>
</symbol>`;

// Risorse raccoglibili (stile "Coloni di Catan"): 5 tipi con i colori delle
// caselle di Catan. Ogni provincia produce al massimo 1 risorsa per turno.
//
// COME ASSEGNARE UNA RISORSA A UNA PROVINCIA:
//   in data/map_data.js aggiungi il campo "risorsa" alla provincia, es.
//     { "nome": "Kola", ..., "risorsa": "pietra" }
//   Valori validi: "pietra" | "legno" | "grano" | "bestiame" | "argilla".
//   L'icona compare da sola in un angolo del territorio (nessun posizionamento
//   manuale). Nessun campo "risorsa" = nessuna risorsa.

const RESOURCES = {
    pietra:   { nome: 'Pietra',   colore: '#6C7A89' },
    legno:    { nome: 'Legno',    colore: '#2F6B33' },
    grano:    { nome: 'Grano',    colore: '#DDA300' },
    bestiame: { nome: 'Bestiame', colore: '#9DBE3B' },
    argilla:  { nome: 'Argilla',  colore: '#C1440E' },
};

// Ogni simbolo e' un gettone autonomo (disco colore-risorsa + anello bianco +
// pittogramma): l'anello bianco lo rende leggibile sopra qualsiasi colore-giocatore.
// viewBox 0 0 100 100 -> un <use> con width/height lo scala mantenendo le proporzioni.
const RESOURCE_SYMBOLS = `
<symbol id="res-pietra" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#6C7A89" stroke="#fff" stroke-width="6"/>
  <circle cx="50" cy="50" r="48" fill="none" stroke="#00000022" stroke-width="2"/>
  <g transform="translate(50,50) scale(1.3)">
    <polygon points="-20,17 -2,-13 16,17" fill="#fff"/>
    <polygon points="-4,17 10,-3 22,17" fill="#E4E9ED"/>
  </g>
</symbol>
<symbol id="res-legno" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#2F6B33" stroke="#fff" stroke-width="6"/>
  <circle cx="50" cy="50" r="48" fill="none" stroke="#00000022" stroke-width="2"/>
  <g transform="translate(50,50) scale(1.3)">
    <rect x="-20" y="-8" width="34" height="16" rx="8" fill="#fff"/>
    <ellipse cx="13" cy="0" rx="6" ry="8" fill="#fff"/>
    <circle cx="13" cy="0" r="5" fill="none" stroke="#2F6B33" stroke-width="1.6"/>
    <circle cx="13" cy="0" r="2" fill="none" stroke="#2F6B33" stroke-width="1.6"/>
  </g>
</symbol>
<symbol id="res-grano" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#DDA300" stroke="#fff" stroke-width="6"/>
  <circle cx="50" cy="50" r="48" fill="none" stroke="#00000022" stroke-width="2"/>
  <g transform="translate(50,50) scale(1.3)">
    <path d="M0,20 L0,-2" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M0,18 Q-7,6 -8,-6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M0,18 Q7,6 8,-6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <ellipse cx="0" cy="-9" rx="2.6" ry="5" fill="#fff"/>
    <ellipse cx="-7" cy="-9" rx="2.4" ry="4.6" fill="#fff"/>
    <ellipse cx="7" cy="-9" rx="2.4" ry="4.6" fill="#fff"/>
    <ellipse cx="0" cy="1" rx="2.6" ry="5" fill="#fff"/>
    <ellipse cx="-6" cy="2" rx="2.4" ry="4.6" fill="#fff"/>
    <ellipse cx="6" cy="2" rx="2.4" ry="4.6" fill="#fff"/>
  </g>
</symbol>
<symbol id="res-bestiame" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#9DBE3B" stroke="#fff" stroke-width="6"/>
  <circle cx="50" cy="50" r="48" fill="none" stroke="#00000022" stroke-width="2"/>
  <g transform="translate(50,50) scale(1.3)">
    <rect x="-6" y="10" width="3.2" height="7" rx="1.4" fill="#6F7A44"/>
    <rect x="3" y="10" width="3.2" height="7" rx="1.4" fill="#6F7A44"/>
    <circle cx="-7" cy="4" r="7" fill="#fff"/>
    <circle cx="-1" cy="-2" r="9" fill="#fff"/>
    <circle cx="7" cy="2" r="8" fill="#fff"/>
    <circle cx="0" cy="7" r="7" fill="#fff"/>
    <circle cx="13" cy="-3" r="6" fill="#6F7A44"/>
    <circle cx="15" cy="-5" r="1.4" fill="#fff"/>
  </g>
</symbol>
<symbol id="res-argilla" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#C1440E" stroke="#fff" stroke-width="6"/>
  <circle cx="50" cy="50" r="48" fill="none" stroke="#00000022" stroke-width="2"/>
  <g transform="translate(50,50) scale(1.3)">
    <rect x="-12" y="-15" width="24" height="10" rx="2" fill="#fff"/>
    <rect x="-20" y="-3" width="18" height="10" rx="2" fill="#fff"/>
    <rect x="2" y="-3" width="18" height="10" rx="2" fill="#fff"/>
    <rect x="-12" y="9" width="24" height="10" rx="2" fill="#fff"/>
  </g>
</symbol>`;

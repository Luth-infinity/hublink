const fs = require('fs');
const path = require('path');
const store = require('./store');

// Page d'accueil du mode navigateur. Servie par un schéma dédié plutôt que par
// `file://` : la barre d'adresse reste lisible et la page n'obtient aucun
// privilège d'accès local.
const URL = 'hublink://start';

let html = null;

/**
 * Chaque partition Chromium a son propre registre de protocoles : enregistrer
 * le schéma sur la session par défaut ne suffit pas, il faut le poser sur la
 * session du navigateur, seule à en avoir besoin.
 */
/**
 * Reproduit la teinte du shell pour la page d'accueil.
 *
 * Le calcul est celui de `accountTints` cote renderer, transpose en CSS :
 * mélanger une couleur vive dans un fond sombre l'ECLAIRCIT au lieu de le
 * teinter, on rapproche donc la teinte du noir en sombre et du blanc en clair
 * avant de la mêler au fond. Les pourcentages sont ceux de `index.css`, pour
 * que la page et le panneau tombent sur la même nuance.
 */
function styleTeinte(accent) {
  if (!accent) return '';
  return `<style>
      :root {
        --accent: ${accent};
        --tint-surface: color-mix(in srgb, white 18%, var(--accent));
        --tint-line: color-mix(in srgb, white 58%, var(--accent));
        --bg: color-mix(in oklab, var(--tint-surface) 10%, oklch(0.991 0.001 265));
        --raised: color-mix(in oklab, var(--tint-surface) 6%, oklch(1 0 0));
        --border: color-mix(in oklab, var(--tint-line) 42%, oklch(0.935 0.003 265));
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --tint-surface: color-mix(in srgb, black 50%, var(--accent));
          --tint-line: color-mix(in srgb, black 18%, var(--accent));
          --bg: color-mix(in oklab, var(--tint-surface) 30%, oklch(0.155 0.004 265));
          --raised: color-mix(in oklab, var(--tint-surface) 24%, oklch(0.2 0.005 265));
          --border: color-mix(in oklab, var(--tint-line) 46%, oklch(0.29 0.008 265));
        }
      }
    </style>`;
}

function serveOn(session) {
  if (session.protocol.isProtocolHandled('hublink')) return;
  // Le gabarit est lu une fois ; seule la teinte change, et elle est relue a
  // chaque requete pour qu'un rechargement suffise a la refleter.
  if (html === null) html = fs.readFileSync(path.join(__dirname, 'start.html'), 'utf8');
  session.protocol.handle('hublink', () => {
    const page = html.replace('<!--TEINTE-->', styleTeinte(store.load().accentColor));
    return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
}

module.exports = { URL, serveOn };

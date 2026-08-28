const fs = require('fs');
const path = require('path');

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
function serveOn(session) {
  if (session.protocol.isProtocolHandled('hublink')) return;
  // Quelques kilo-octets, jamais modifiés en cours d'exécution : une lecture.
  if (html === null) html = fs.readFileSync(path.join(__dirname, 'start.html'), 'utf8');
  session.protocol.handle(
    'hublink',
    () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  );
}

module.exports = { URL, serveOn };

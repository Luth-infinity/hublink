const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');

/**
 * Le partage d'écran.
 *
 * Chromium demande normalement à l'utilisateur quoi partager. Electron, lui,
 * n'a pas ce sélecteur : sans `setDisplayMediaRequestHandler`, `getDisplayMedia`
 * reste sans réponse et la webapp n'affiche même pas son bouton. Teams se
 * contentait de ne rien proposer, sans dire pourquoi.
 *
 * C'est donc à nous de montrer les écrans et les fenêtres disponibles, et de
 * rendre celui qu'on a choisi.
 */

let fenetre = null;
let attente = null;
let reglages = { isDev: false, devServer: '', rendererDist: '' };

function configurer(r) {
  reglages = r;
}

/** Répond à la demande en cours, une seule fois. `choix` = { id, son } ou null. */
function repondre(choix) {
  const rendre = attente;
  attente = null;
  if (fenetre && !fenetre.isDestroyed()) fenetre.close();
  fenetre = null;
  if (rendre) rendre(choix);
}

async function choisirSource(parent, origine, sonDemande) {
  // Les sources sont relevées AVANT d'ouvrir le sélecteur : sinon il se
  // proposerait lui-même, ce qui n'aurait aucun sens.
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 400, height: 240 },
    fetchWindowIcons: true
  });

  // La définition de chaque écran : sur plusieurs moniteurs, une appli en plein
  // écran donne une vignette IDENTIQUE à celle de l'écran qui la porte. Le seul
  // moyen de les distinguer d'un coup d'oeil, c'est de l'écrire.
  const definitions = new Map(
    screen.getAllDisplays().map((d) => [String(d.id), `${d.size.width} × ${d.size.height}`])
  );

  const liste = sources
    .filter((s) => s.thumbnail && !s.thumbnail.isEmpty())
    .map((s) => ({
      id: s.id,
      nom: s.name,
      ecran: s.id.startsWith('screen:'),
      detail: s.id.startsWith('screen:') ? definitions.get(String(s.display_id)) || null : null,
      apercu: s.thumbnail.toDataURL(),
      icone: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
    }));

  if (!liste.length) return null;

  return new Promise((resoudre) => {
    attente = resoudre;

    fenetre = new BrowserWindow({
      parent,
      modal: Boolean(parent),
      width: 860,
      height: 620,
      minWidth: 640,
      minHeight: 480,
      frame: false,
      resizable: true,
      minimizable: false,
      maximizable: false,
      show: false,
      backgroundColor: '#00000000',
      transparent: true,
      title: 'Partager votre écran',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'shell.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    if (reglages.isDev && !reglages.rendererDist) {
      fenetre.loadURL(`${reglages.devServer}?partage=1`);
    } else {
      fenetre.loadFile(reglages.rendererDist, { search: 'partage=1' });
    }

    fenetre.webContents.on('did-finish-load', () => {
      if (fenetre && !fenetre.isDestroyed())
        fenetre.webContents.send('partage:sources', { liste, origine, sonDemande });
    });
    fenetre.once('ready-to-show', () => fenetre && fenetre.show());
    // Fermée d'une autre façon : c'est un refus, et la page attend une réponse.
    fenetre.on('closed', () => {
      fenetre = null;
      if (attente) repondre(null);
    });
  }).then((choix) => {
    const source = choix && sources.find((s) => s.id === choix.id);
    return source ? { source, son: Boolean(choix.son) } : null;
  });
}

/**
 * Branche la demande de partage sur une session.
 *
 * Appelé pour chaque compte : les sessions sont cloisonnées, et un
 * gestionnaire posé sur l'une ne vaut pas pour les autres.
 */
function brancher(session, fenetrePrincipale) {
  session.setDisplayMediaRequestHandler(
    async (requete, callback) => {
      let origine = '';
      try {
        origine = new URL(requete.securityOrigin || requete.frame?.url || '').host;
      } catch {
        origine = '';
      }

      const choix = await choisirSource(fenetrePrincipale(), origine, requete.audioRequested).catch(
        () => null
      );
      if (!choix) return callback({});

      // Le son n'est JAMAIS joint d'office : `loopback` capte tout le son de
      // l'ordinateur, pas celui de la fenêtre partagée — la musique de fond
      // partait dans la réunion. C'est donc une case à cocher, décochée.
      callback(
        choix.son && requete.audioRequested
          ? { video: choix.source, audio: 'loopback' }
          : { video: choix.source }
      );
    },
    // Le nôtre, toujours. `useSystemPicker: true` a été mesuré sur macOS 26.6.2
    // / Electron 41 : le sélecteur natif ne s'affiche sur AUCUN écran, le
    // gestionnaire n'est jamais appelé et la demande meurt en
    // « AbortError: Timeout starting video source ». Windows n'en a pas non plus.
    { useSystemPicker: false }
  );
}

function brancherIpc() {
  ipcMain.on('partage:choix', (_e, choix) => repondre(choix && choix.id ? choix : null));
}

module.exports = { configurer, brancher, brancherIpc };

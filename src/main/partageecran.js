const { BrowserWindow, desktopCapturer, ipcMain } = require('electron');
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

/** Répond à la demande en cours, une seule fois. */
function repondre(choix) {
  const rendre = attente;
  attente = null;
  if (fenetre && !fenetre.isDestroyed()) fenetre.close();
  fenetre = null;
  if (rendre) rendre(choix);
}

async function choisirSource(parent, origine) {
  // Les sources sont relevées AVANT d'ouvrir le sélecteur : sinon il se
  // proposerait lui-même, ce qui n'aurait aucun sens.
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 400, height: 240 },
    fetchWindowIcons: true
  });

  const liste = sources
    .filter((s) => s.thumbnail && !s.thumbnail.isEmpty())
    .map((s) => ({
      id: s.id,
      nom: s.name,
      ecran: s.id.startsWith('screen:'),
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
      if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send('partage:sources', { liste, origine });
    });
    fenetre.once('ready-to-show', () => fenetre && fenetre.show());
    // Fermée d'une autre façon : c'est un refus, et la page attend une réponse.
    fenetre.on('closed', () => {
      fenetre = null;
      if (attente) repondre(null);
    });
  }).then((id) => sources.find((s) => s.id === id) || null);
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

      const source = await choisirSource(fenetrePrincipale(), origine).catch(() => null);
      if (!source) return callback({});

      // Le son du système suit l'image quand la page le demande — une vidéo
      // partagée sans sa bande-son n'a pas d'intérêt.
      callback(requete.audioRequested ? { video: source, audio: 'loopback' } : { video: source });
    },
    // Windows n'a pas de sélecteur système : c'est le nôtre qui sert.
    { useSystemPicker: false }
  );
}

function brancherIpc() {
  ipcMain.on('partage:choix', (_e, id) => repondre(id || null));
}

module.exports = { configurer, brancher, brancherIpc };

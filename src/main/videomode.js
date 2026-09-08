const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const views = require('./views');

/**
 * Le mode vidéo : la page part dans une petite fenêtre qui reste au-dessus.
 *
 * L'incrustation de Chromium ne montre qu'une image et trois boutons imposés —
 * ni volume, ni le « Passer » du lecteur. Son équivalent pilotable, l'API
 * Document Picture-in-Picture, existe dans notre Chromium mais Electron ne
 * sait pas lui ouvrir de fenêtre (« Internal error: no window »).
 *
 * On fabrique donc la nôtre, composée comme la fenêtre principale : la vue web
 * native occupe le haut, notre bande de commandes le bas. La vue n'est pas
 * recréée mais déménagée — la lecture ne s'interrompt pas, la session reste la
 * sienne.
 */

// La bande de commandes, en points. Le reste est à la vidéo.
const BARRE = 46;
const LARGEUR = 480;

let fenetre = null;
let vue = null;
let idVue = null;
let reglages = { isDev: false, devServer: '', rendererDist: '' };

function configurer(r) {
  reglages = r;
  // Rappeler un service parti en vidéo, c'est vouloir le revoir en entier.
  views.ramenerVideo = fermer;
}

function placerVue() {
  if (!fenetre || fenetre.isDestroyed() || !vue) return;
  const { width, height } = fenetre.getContentBounds();
  vue.setBounds({ x: 0, y: 0, width, height: Math.max(0, height - BARRE) });
}

// En bas à droite de l'écran courant : là où l'on pose une vidéo qu'on garde
// d'un œil, sans recouvrir ce sur quoi on travaille.
function placerFenetre(largeur, hauteur) {
  const ecran = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return {
    x: Math.round(ecran.x + ecran.width - largeur - 24),
    y: Math.round(ecran.y + ecran.height - hauteur - 24)
  };
}

async function ouvrir() {
  if (fenetre) return 'deja-ouverte';
  if (!views.current) return 'aucune-vue';

  const combien = await views.current.webContents
    .executeJavaScript("document.querySelectorAll('video').length")
    .catch(() => 0);
  if (!combien) return 'aucune';

  const pris = views.detacherPourVideo();
  if (!pris) return 'aucune-vue';
  vue = pris.view;
  idVue = pris.id;

  const hauteur = Math.round((LARGEUR * 9) / 16) + BARRE;
  fenetre = new BrowserWindow({
    width: LARGEUR,
    height: hauteur,
    ...placerFenetre(LARGEUR, hauteur),
    minWidth: 320,
    minHeight: 180 + BARRE,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    backgroundColor: '#000000',
    show: false,
    title: 'Hublink — vidéo',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  // « floating » la maintient au-dessus des fenêtres ordinaires sans passer
  // par-dessus les menus du système.
  fenetre.setAlwaysOnTop(true, 'floating');
  fenetre.setAspectRatio(16 / 9, { width: 0, height: BARRE });

  if (reglages.isDev && !reglages.rendererDist) fenetre.loadURL(`${reglages.devServer}?video=1`);
  else fenetre.loadFile(reglages.rendererDist, { search: 'video=1' });

  fenetre.on('resize', placerVue);
  fenetre.on('closed', () => {
    if (fenetre) fermer();
  });
  fenetre.once('ready-to-show', () => fenetre && fenetre.show());

  fenetre.contentView.addChildView(vue);
  vue.setVisible(true);
  placerVue();

  // La page ne doit plus montrer qu'elle : le reste ne tiendrait pas dans
  // 480 points de large.
  vue.webContents.send('video:sortir');
  vue.webContents.once('destroyed', () => fermer());
  return 'ouvert';
}

async function fermer() {
  if (!fenetre) return 'fermee';
  const cadre = fenetre;
  const partante = vue;
  const id = idVue;
  fenetre = null;
  vue = null;
  idVue = null;

  if (partante && !partante.webContents.isDestroyed()) {
    partante.webContents.send('video:rentrer');
    try {
      cadre.contentView.removeChildView(partante);
    } catch {
      // La fenêtre est déjà partie : la vue est libre de toute façon.
    }
  }
  if (!cadre.isDestroyed()) cadre.close();
  if (id) await views.reprendreDeVideo(id);
  return 'ferme';
}

async function basculer() {
  return fenetre ? fermer() : ouvrir();
}

function brancherIpc() {
  // L'état vient de la page toutes les demi-secondes : lecture, volume, et le
  // bouton du lecteur s'il en propose un.
  ipcMain.on('video:etat', (_e, etat) => {
    if (!fenetre || fenetre.isDestroyed()) return;
    if (!etat || etat.absente) return void fermer();
    fenetre.webContents.send('video:barre', etat);
  });

  ipcMain.on('video:commande', (_e, commande) => {
    if (vue && !vue.webContents.isDestroyed()) vue.webContents.send('video:commande', commande);
  });

  ipcMain.on('video:fermer', () => fermer());
}

module.exports = { configurer, brancherIpc, basculer, fermer };

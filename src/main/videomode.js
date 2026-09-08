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
let ratioApplique = 0;
let ajustement = false;
let guetteur = null;
let survole = null;

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

/**
 * Donne à la fenêtre les proportions de l'image.
 *
 * Une vidéo verticale enfermée dans un cadre en seize neuvièmes n'occupe qu'un
 * tiers de la place. Les proportions ne sont connues qu'une fois la vidéo
 * décodée : on les applique dès qu'elles arrivent, et on garde la largeur.
 */
function epouserImage(ratio) {
  if (!ratio || !fenetre || fenetre.isDestroyed()) return;
  if (Math.abs(ratio - ratioApplique) < 0.01) return;
  ratioApplique = ratio;
  respecterProportions(true);
}

/**
 * Garde la hauteur accordée à la largeur.
 *
 * `setAspectRatio` d'Electron n'honore pas sa taille supplémentaire sur
 * Windows : la fenêtre grandissait de la hauteur de la bande à chaque fois. On
 * calcule donc nous-mêmes, ce qui vaut aussi sur les deux plateformes.
 */
function respecterProportions(force = false) {
  if (!fenetre || fenetre.isDestroyed() || !ratioApplique || (ajustement && !force)) return;
  const { width, height } = fenetre.getContentBounds();
  const voulue = Math.round(width / ratioApplique) + BARRE;
  if (Math.abs(voulue - height) <= 1) return;
  ajustement = true;
  fenetre.setContentSize(width, voulue);
  setTimeout(() => {
    ajustement = false;
  }, 60);
}

/**
 * Le pointeur est-il sur la fenêtre ?
 *
 * La vidéo est une vue native : la bande, en HTML, ne reçoit aucun événement
 * quand le pointeur passe sur l'image. On regarde donc où est le curseur,
 * plutôt que d'attendre qu'il se signale.
 */
function guetterLePointeur() {
  clearInterval(guetteur);
  survole = null;
  guetteur = setInterval(() => {
    if (!fenetre || fenetre.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = fenetre.getBounds();
    const dedans = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
    if (dedans === survole) return;
    survole = dedans;
    fenetre.webContents.send('video:survol', dedans);
  }, 200);
  if (guetteur.unref) guetteur.unref();
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
  // En attendant de connaître les proportions réelles de l'image.
  ratioApplique = 0;

  if (reglages.isDev && !reglages.rendererDist) fenetre.loadURL(`${reglages.devServer}?video=1`);
  else fenetre.loadFile(reglages.rendererDist, { search: 'video=1' });

  fenetre.on('resize', () => {
    respecterProportions();
    placerVue();
  });
  fenetre.on('closed', () => {
    if (fenetre) fermer();
  });
  fenetre.once('ready-to-show', () => fenetre && fenetre.show());
  guetterLePointeur();

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
  clearInterval(guetteur);
  guetteur = null;
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
    epouserImage(etat.ratio);
    fenetre.webContents.send('video:barre', etat);
  });

  ipcMain.on('video:commande', (_e, commande) => {
    if (vue && !vue.webContents.isDestroyed()) vue.webContents.send('video:commande', commande);
  });

  ipcMain.on('video:fermer', () => fermer());
}

module.exports = { configurer, brancherIpc, basculer, fermer };

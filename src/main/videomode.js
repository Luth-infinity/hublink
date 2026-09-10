const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const views = require('./views');
const store = require('./store');

/**
 * Le mode vidéo : la page part dans une petite fenêtre qui reste au-dessus.
 *
 * L'incrustation de Chromium ne montre qu'une image et trois boutons imposés —
 * ni volume, ni le « Passer » du lecteur. Son équivalent pilotable, l'API
 * Document Picture-in-Picture, existe dans notre Chromium mais Electron ne
 * sait pas lui ouvrir de fenêtre (« Internal error: no window »).
 *
 * On fabrique donc la nôtre. Deux fenêtres, en réalité : celle de l'image, que
 * la vue web native occupe entièrement, et un voile transparent posé dessus qui
 * porte les commandes. Une seule ne suffirait pas — une vue native se peint
 * TOUJOURS au-dessus du HTML de sa fenêtre, et réserver une bande sous l'image
 * bordait la vidéo d'un bandeau noir permanent.
 *
 * La vue n'est pas recréée mais déménagée : la lecture ne s'interrompt pas, et
 * la session reste la sienne.
 */

const LARGEUR = 480;

// Hauteur, sous le bas de la fenêtre, où le voile intercepte le pointeur : les
// commandes et le bouton du lecteur y tiennent. Ailleurs les clics traversent
// jusqu'à l'image.
const ZONE_COMMANDES = 132;

let fenetre = null;
let voile = null;
let vue = null;
let idVue = null;
let reglages = { isDev: false, devServer: '', rendererDist: '', prevenir: () => {} };
let ratioApplique = 0;
let ajustement = false;
let guetteur = null;
let survole = null;
let receptif = null;
let battements = 0;
let deplacement = null;

function configurer(r) {
  reglages = r;
  // Rappeler un service parti en vidéo, c'est vouloir le revoir en entier.
  views.ramenerVideo = fermer;
}

/** L'image occupe toute la fenêtre ; le voile la recouvre exactement. */
function placer() {
  if (!fenetre || fenetre.isDestroyed()) return;
  const cadre = fenetre.getContentBounds();
  if (vue) vue.setBounds({ x: 0, y: 0, width: cadre.width, height: cadre.height });
  // Les bornes de contenu, pas celles de la fenêtre : une fenêtre sans cadre
  // mais redimensionnable garde une bordure invisible de six points, qui
  // décalerait le voile d'autant.
  if (voile && !voile.isDestroyed()) voile.setBounds(cadre);
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
 * Windows : la fenêtre grandissait à chaque application. On calcule donc
 * nous-mêmes, ce qui vaut aussi sur les deux plateformes.
 */
function respecterProportions(force = false) {
  if (!fenetre || fenetre.isDestroyed() || !ratioApplique || (ajustement && !force)) return;
  const { width, height } = fenetre.getContentBounds();
  const voulue = Math.round(width / ratioApplique);
  if (Math.abs(voulue - height) <= 1) return;
  ajustement = true;
  fenetre.setContentSize(width, voulue);
  setTimeout(() => {
    ajustement = false;
  }, 60);
}

/**
 * Où est le pointeur ?
 *
 * L'image est une vue native : le voile, en HTML, ne reçoit rien tant qu'on
 * n'a pas décidé qu'il devait recevoir. On regarde donc où est le curseur
 * plutôt que d'attendre qu'il se signale — et on n'ouvre le voile aux clics
 * que sur la bande des commandes, pour que le reste de l'image reste
 * cliquable.
 */
function guetterLePointeur() {
  clearInterval(guetteur);
  survole = null;
  receptif = null;
  guetteur = setInterval(() => {
    if (!fenetre || fenetre.isDestroyed() || !voile || voile.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = fenetre.getContentBounds();
    const dedans = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

    // Une application passée en plein écran fait perdre son rang à une fenêtre
    // au-dessus des autres. Windows ne le signale pas : on le réaffirme, assez
    // rarement pour que ça ne coûte rien.
    battements = (battements + 1) % 10;
    if (battements === 0) rappelerLOrdre();

    // Le voile doit épouser l'image à tout instant. Un redimensionnement
    // signale sa nouvelle taille avant que Windows ne l'ait appliquée : la
    // mesure d'alors était fausse, et le voile restait décalé.
    const c = fenetre.getContentBounds();
    const bv = voile.getContentBounds();
    if (bv.x !== c.x || bv.y !== c.y || bv.width !== c.width || bv.height !== c.height) {
      voile.setBounds(c);
    }

    if (dedans !== survole) {
      survole = dedans;
      voile.webContents.send('video:survol', dedans);
    }

    // Pendant un déplacement, le voile garde la main quoi qu'il arrive : sans
    // cela il cesserait de suivre dès que la fenêtre glisse sous le pointeur.
    const doitRecevoir = Boolean(deplacement) || (dedans && p.y >= b.y + b.height - ZONE_COMMANDES);
    if (doitRecevoir !== receptif) {
      receptif = doitRecevoir;
      voile.setIgnoreMouseEvents(!doitRecevoir, { forward: true });
    }
  }, 120);
  if (guetteur.unref) guetteur.unref();
}

/**
 * Le déplacement à la main.
 *
 * Les commandes vivent dans le voile : une zone `-webkit-app-region: drag` y
 * déplacerait le voile seul, en le décollant de son image. On suit donc le
 * curseur nous-mêmes et on bouge la fenêtre, le voile venant avec.
 */
function suivreLeCurseur() {
  clearInterval(deplacement && deplacement.timer);
  if (!fenetre || fenetre.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  const b = fenetre.getBounds();
  deplacement = {
    ecartX: p.x - b.x,
    ecartY: p.y - b.y,
    // La taille est reportée telle quelle à chaque pas. `setPosition` seul
    // faisait grandir la fenêtre de deux points par appel : sans cadre, elle
    // garde une bordure de redimensionnement invisible qu'Electron rajoutait à
    // chaque fois. Vingt appels aux mêmes coordonnées la faisaient passer de
    // 486 à 526 points de large — et un glisser en fait soixante par seconde.
    largeur: b.width,
    hauteur: b.height,
    timer: setInterval(() => {
      if (!fenetre || fenetre.isDestroyed()) return void poserLaFenetre();
      const c = screen.getCursorScreenPoint();
      fenetre.setBounds({
        x: c.x - deplacement.ecartX,
        y: c.y - deplacement.ecartY,
        width: deplacement.largeur,
        height: deplacement.hauteur
      });
      if (voile && !voile.isDestroyed()) voile.setBounds(fenetre.getContentBounds());
    }, 16)
  };
}

function poserLaFenetre() {
  if (!deplacement) return;
  clearInterval(deplacement.timer);
  deplacement = null;
}

/**
 * Remet les deux fenêtres au-dessus, l'image d'abord et le voile ensuite.
 *
 * Une application passée en plein écran fait perdre son rang à une fenêtre au
 * sommet, et Windows ne le signale pas. L'ordre des deux appels compte : le
 * dernier posé est celui du dessus.
 */
function rappelerLOrdre() {
  if (fenetre && !fenetre.isDestroyed()) fenetre.setAlwaysOnTop(true, 'screen-saver');
  if (voile && !voile.isDestroyed()) {
    voile.setAlwaysOnTop(true, 'screen-saver');
    voile.moveTop();
  }
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

  const hauteur = Math.round((LARGEUR * 9) / 16);
  const commun = {
    // Elle ne prend jamais le premier plan. Sans cela, un clic sur la pause
    // pendant une partie sortait le jeu du plein écran, et la vidéo se
    // retrouvait derrière : il fallait aller la rechercher. Les clics lui
    // parviennent quand même, c'est le focus qu'elle décline — comme le fait
    // l'incrustation de Chromium.
    focusable: false,
    skipTaskbar: true,
    frame: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false
  };

  fenetre = new BrowserWindow({
    ...commun,
    width: LARGEUR,
    height: hauteur,
    ...placerFenetre(LARGEUR, hauteur),
    minWidth: 260,
    minHeight: 146,
    resizable: true,
    backgroundColor: '#000000',
    title: 'Hublink — vidéo'
  });
  // Sa page ne se voit jamais : la vue web la recouvre entièrement. Elle n'est
  // là que pour donner un fond à la fenêtre le temps d'un redimensionnement.
  fenetre.loadURL('data:text/html,%3Cstyle%3Ehtml%2Cbody%7Bmargin%3A0%3Bbackground%3A%23000%7D%3C%2Fstyle%3E');

  // Deux fenêtres indépendantes, et non un parent avec son enfant : Windows
  // impose qu'un propriétaire reste sous ce qu'il possède, et cette règle
  // faisait perdre son rang à la fenêtre de l'image. Un jeu venait alors
  // s'intercaler entre les deux — commandes flottant sur la partie, vidéo
  // enfouie dessous. On tient donc l'ordre nous-mêmes.
  voile = new BrowserWindow({
    ...commun,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    title: 'Hublink — commandes vidéo',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  voile.setIgnoreMouseEvents(true, { forward: true });
  voile.setBounds(fenetre.getBounds());

  if (reglages.isDev && !reglages.rendererDist) voile.loadURL(`${reglages.devServer}?video=1`);
  else voile.loadFile(reglages.rendererDist, { search: 'video=1' });

  rappelerLOrdre();
  // En attendant de connaître les proportions réelles de l'image.
  ratioApplique = 0;

  fenetre.on('resize', () => {
    respecterProportions();
    placer();
  });
  fenetre.on('move', placer);
  fenetre.on('show', rappelerLOrdre);
  fenetre.on('closed', () => {
    if (fenetre) fermer();
  });
  fenetre.once('ready-to-show', () => fenetre && fenetre.showInactive());
  voile.once('ready-to-show', () => voile && voile.showInactive());
  guetterLePointeur();

  fenetre.contentView.addChildView(vue);
  vue.setVisible(true);
  placer();

  // La page ne doit plus montrer qu'elle : le reste ne tiendrait pas dans
  // 480 points de large.
  // La zone principale se retrouve vide : sans un mot, on croirait la page
  // perdue. Le shell y met de quoi la faire revenir.
  const onglet = store.getTab(idVue);
  reglages.prevenir({
    titre: (onglet && onglet.title) || (store.getService(idVue) || {}).name || 'La page'
  });

  vue.webContents.send('video:sortir');
  vue.webContents.once('destroyed', () => fermer());
  return 'ouvert';
}

async function fermer() {
  if (!fenetre) return 'fermee';
  const cadre = fenetre;
  const dessus = voile;
  const partante = vue;
  const id = idVue;
  poserLaFenetre();
  clearInterval(guetteur);
  guetteur = null;
  fenetre = null;
  voile = null;
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
  reglages.prevenir(null);
  if (dessus && !dessus.isDestroyed()) dessus.close();
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
    if (!voile || voile.isDestroyed()) return;
    if (!etat || etat.absente) return void fermer();
    epouserImage(etat.ratio);
    voile.webContents.send('video:barre', etat);
  });

  ipcMain.on('video:commande', (_e, commande) => {
    if (vue && !vue.webContents.isDestroyed()) vue.webContents.send('video:commande', commande);
  });

  ipcMain.on('video:deplacer', (_e, encours) => (encours ? suivreLeCurseur() : poserLaFenetre()));

  // Le bouton du lecteur n'accepte qu'un vrai clic. La page a préparé
  // l'endroit ; on y envoie un clic que le moteur tient pour authentique, puis
  // on la laisse tout remettre en place. Seule la vue vidéo peut le demander :
  // une autre page n'a pas à faire cliquer à sa place.
  ipcMain.on('video:cliquer-ici', (e, lieu) => {
    if (!vue || vue.webContents.isDestroyed() || e.sender !== vue.webContents) return;
    const x = Math.round(Number(lieu && lieu.x));
    const y = Math.round(Number(lieu && lieu.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const wc = vue.webContents;
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    setTimeout(() => {
      if (vue && !vue.webContents.isDestroyed()) vue.webContents.send('video:clic-fait');
    }, 80);
  });

  ipcMain.on('video:fermer', () => fermer());
}

module.exports = { configurer, brancherIpc, basculer, fermer };

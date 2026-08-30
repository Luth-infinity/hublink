const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  nativeImage,
  nativeTheme,
  protocol,
  screen,
  clipboard
} = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const views = require('./views');
const extensions = require('./extensions');
const { isExternalUrl } = require('./urls');
const capture = require('./capture');
const secrets = require('./secrets');
const updates = require('./updates');
const downloadsMod = require('./downloads');

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const DEV_SERVER = process.env.HUBLINK_DEV_SERVER || 'http://localhost:5273';

// La page d'accueil du mode navigateur est servie par un schéma dédié plutôt
// que par `file://` : la barre d'adresse affiche `hublink://start` au lieu d'un
// chemin de disque, et la page n'obtient aucun privilège local.
const START_URL = 'hublink://start';

protocol.registerSchemesAsPrivileged([
  { scheme: 'hublink', privileges: { standard: true, secure: true } }
]);

let win = null;

// --- calque des messages ----------------------------------------------------

// Une WebContentsView est une vue native : elle se peint au-dessus du HTML du
// shell quoi qu'on fasse. Les messages de l'application, dessinés en bas de la
// fenêtre principale, se retrouvaient donc cachés derrière la page. On les
// sort dans une fenêtre enfant transparente, qui reste au-dessus de son parent.
let calque = null;
let calqueTimer = null;

// --- panneaux et téléchargements --------------------------------------------

// Tenus ici plutôt que dans un renderer : la barre d'outils et le panneau
// vivent désormais dans deux fenêtres, ils ne peuvent plus se partager un état
// local. Le principal est de toute façon la source de ces informations.
const MAX_TELECHARGEMENTS = 5;
let telechargements = [];

/**
 * Ne garde que les cinq derniers, sans jamais évincer un transfert en cours :
 * sa progression disparaîtrait sous les yeux de qui l'attend.
 */
function purgerTelechargements() {
  const encours = telechargements.filter((d) => d.state === 'progress');
  const finis = telechargements.filter((d) => d.state !== 'progress');
  telechargements = [...encours, ...finis].slice(0, Math.max(MAX_TELECHARGEMENTS, encours.length));
}

function pousserTelechargements() {
  send('downloads:list', telechargements);
}

// Panneau ouvert, et l'ancre sous laquelle le dessiner. L'ancre vient de la
// barre d'outils, dont les coordonnées sont celles du calque : les deux
// fenêtres partagent la même origine.
let panneau = null;

// Menus ouverts dans le calque : un identifiant par appel, et la promesse à
// tenir quand le choix revient. Plusieurs peuvent se succéder très vite (un
// clic droit pendant qu'un autre se ferme), d'où la table plutôt qu'une
// unique variable.
let dernierMenu = 0;
let menuEnCours = null;
const menuAttente = new Map();

function pousserPanneau() {
  send('panel:state', panneau);
  majReceptiviteCalque();
}

/**
 * Le calque laisse passer les clics par défaut. Un panneau ouvert doit au
 * contraire les recevoir — y compris le clic à côté, qui le referme.
 */
function majReceptiviteCalque() {
  if (!calque || calque.isDestroyed()) return;
  calque.setIgnoreMouseEvents(!panneau && !menuEnCours, { forward: true });
}

// Actions proposées dans un message. La fonction ne peut pas traverser l'IPC :
// le calque renvoie une description, le processus principal l'exécute.
function runToastAction(action) {
  if (!action || typeof action !== 'object') return;
  if (action.kind === 'reveal' && action.path) downloadsMod.reveal(action.path);
  if (action.kind === 'save-password') {
    const attente = motsDePasseEnAttente.get(action.jeton);
    motsDePasseEnAttente.delete(action.jeton);
    if (!attente) return;
    const ok = secrets.enregistrer(attente.accountId, attente.origin, attente.username, attente.password);
    toast(ok ? 'success' : 'error', ok ? 'Mot de passe enregistré' : 'Trousseau indisponible');
  }
}

// Mots de passe proposés mais pas encore acceptés. Ils ne vivent qu'ici, en
// mémoire, le temps que l'utilisateur réponde au message — et jamais dans
// l'état poussé au rendu, qui traverse l'IPC en clair.
const motsDePasseEnAttente = new Map();
let jetonMotDePasse = 0;

function syncCalque() {
  if (!calque || calque.isDestroyed() || !win || win.isDestroyed()) return;
  calque.setBounds(win.getContentBounds());
}

function ensureCalque() {
  if (calque && !calque.isDestroyed()) return calque;
  if (!win || win.isDestroyed()) return null;

  calque = new BrowserWindow({
    parent: win,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    // Sans cela, afficher un message volerait le focus à la page.
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Transparente aux clics : la page dessous doit rester utilisable. Les
  // mouvements sont tout de même transmis, ce qui permet au calque de savoir
  // quand le pointeur entre sur un message et de redevenir réceptif.
  calque.setIgnoreMouseEvents(true, { forward: true });
  calque.setBounds(win.getContentBounds());

  const rendererDist = path.join(__dirname, '..', 'renderer', 'dist', 'index.html');
  if (isDev && !fs.existsSync(rendererDist)) calque.loadURL(`${DEV_SERVER}?overlay=1`);
  else calque.loadFile(rendererDist, { search: 'overlay=1' });

  calque.webContents.on('did-finish-load', () => {
    calque.webContents.send('downloads:list', telechargements);
    calque.webContents.send('panel:state', panneau);
    majReceptiviteCalque();
  });
  calque.once('ready-to-show', () => {
    if (calque && !calque.isDestroyed()) calque.showInactive();
  });
  calque.on('closed', () => {
    calque = null;
    // Un menu meurt avec la fenêtre qui le dessine. Sans ce dénouement, son
    // appelant attendrait indéfiniment et `menuEnCours` resterait vrai — le
    // calque suivant naîtrait en avalant tous les clics.
    for (const [, resoudre] of menuAttente) resoudre(null);
    menuAttente.clear();
    menuEnCours = null;
  });
  return calque;
}

/** Referme le calque quand plus aucun message n'est attendu. */
function planifierFermetureCalque() {
  clearTimeout(calqueTimer);
  calqueTimer = setTimeout(() => {
    // Un panneau ou un menu ouvert vit dans cette fenêtre : la refermer le
    // ferait disparaître sous le doigt de l'utilisateur — et, pour un menu,
    // laisserait l'appelant attendre un choix qui ne viendrait jamais.
    if (panneau || menuEnCours) return planifierFermetureCalque();
    if (calque && !calque.isDestroyed()) calque.close();
  }, 15000);
  if (calqueTimer.unref) calqueTimer.unref();
}

// Les deux fenêtres doivent voir le même état : le calque porte désormais des
// panneaux, pas seulement des messages.
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  if (calque && !calque.isDestroyed()) calque.webContents.send(channel, payload);
}

const pushState = () => send('state:changed', store.load());
function toast(variant, message, action) {
  const c = ensureCalque();
  if (!c) return;
  const envoyer = () => c.webContents.send('app:toast', { variant, message, action });
  if (c.webContents.isLoading()) c.webContents.once('did-finish-load', envoyer);
  else envoyer();
  planifierFermetureCalque();
}

function createWindow() {
  const state = store.load();
  win = new BrowserWindow({
    width: state.window.width,
    height: state.window.height,
    x: state.window.x ?? undefined,
    y: state.window.y ?? undefined,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#20242c' : '#f5f6f8',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Windows et Linux dessinent le menu dans la fenêtre, juste sous la barre
    // de titre : autant de hauteur volée à la page, pour des entrées déjà
    // accessibles ailleurs. On le masque sans le supprimer — les accélérateurs
    // continuent de fonctionner, et Alt le fait réapparaître. Sur macOS le menu
    // vit dans la barre système : rien à masquer, et l'option y est sans effet.
    autoHideMenuBar: true,
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Le preload du shell n'utilise que ipcRenderer et contextBridge, tous
      // deux disponibles en bac à sable : autant l'activer.
      sandbox: true,
      webviewTag: false
    }
  });

  // Le shell n'affiche que sa propre page. Une navigation ou une ouverture de
  // fenêtre depuis celle-ci ne peut être qu'un accident ou une injection : on
  // renvoie systématiquement vers le navigateur du système.
  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return;
    event.preventDefault();
    if (isExternalUrl(url)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  for (const ev of ['move', 'resize', 'maximize', 'unmaximize', 'restore']) win.on(ev, syncCalque);
  win.on('minimize', () => calque && !calque.isDestroyed() && calque.hide());
  win.on('restore', () => calque && !calque.isDestroyed() && calque.showInactive());
  win.on('closed', () => {
    if (calque && !calque.isDestroyed()) calque.destroy();
  });

  if (state.window.maximized) win.maximize();
  views.attach(win);
  views.startSleepWatcher();
  views.onEvent = (type, payload) => {
    // Badge et favicon changent très souvent : on envoie le seul delta, pas
    // l'état complet (qui embarque les logos en base64 de tous les clients).
    if (type === 'service-meta') send('service:meta', payload);
    if (type === 'service-slept') send('service:slept', payload);
    if (type === 'tab-meta') send('tab:meta', payload);
    if (type === 'media-present') send('media:present', payload);
    if (type === 'download-started') {
      telechargements = [
        { id: payload.id, name: payload.name, path: payload.path, total: payload.total, received: 0, state: 'progress' },
        ...telechargements
      ];
      purgerTelechargements();
      pousserTelechargements();
    }
    if (type === 'download-progress') {
      telechargements = telechargements.map((d) =>
        d.id === payload.id ? { ...d, received: payload.received, total: payload.total || d.total } : d
      );
      pousserTelechargements();
    }
    if (type === 'download-done') {
      telechargements = telechargements.map((d) =>
        d.id === payload.id
          ? { ...d, state: payload.state, received: payload.total || d.received, total: payload.total || d.total }
          : d
      );
      purgerTelechargements();
      pousserTelechargements();
      if (payload.state === 'completed') {
        toast('success', `${payload.name} téléchargé`, { kind: 'reveal', label: 'Ouvrir le dossier', path: payload.path });
      } else {
        toast('error', `Téléchargement interrompu : ${payload.name}`);
      }
    }
    // Un lien `target="_blank"` : la vue demande un onglet, le shell le crée.
    if (type === 'tab-requested') openTab(payload.url);
    // Une vue en arrière-plan continue de naviguer (rechargement, SPA) : sans ce
    // filtre, elle écrase la barre d'URL du service réellement affiché.
    if (type === 'nav-state' && payload.serviceId === views.currentId) send('nav:state', payload);
    if (type === 'load-error') toast('error', `Chargement impossible : ${payload.desc}`);
  };

  const rendererDist = path.join(__dirname, '..', 'renderer', 'dist', 'index.html');
  if (isDev && !fs.existsSync(rendererDist)) win.loadURL(DEV_SERVER);
  else win.loadFile(rendererDist);

  let geometryTimer = null;
  const scheduleGeometry = () => {
    clearTimeout(geometryTimer);
    geometryTimer = setTimeout(persistWindow, 400);
  };
  win.on('resize', scheduleGeometry);
  win.on('move', scheduleGeometry);
  win.on('closed', () => {
    win = null;
  });

  win.once('ready-to-show', () => win.show());

  // On signale la mise à jour, on ne l'installe pas : l'installation silencieuse
  // exige une application signée sur macOS (contrainte de Squirrel.Mac). Le
  // signalement, lui, fonctionne sur les deux plateformes sans certificat.
  const checkUpdateOnFocus = updates.watch((update) => send('update:available', update));
  win.on('focus', checkUpdateOnFocus);
}

function persistWindow() {
  if (!win || win.isDestroyed()) return;
  const state = store.load();
  state.window.maximized = win.isMaximized();
  if (!win.isMaximized() && !win.isFullScreen()) {
    const [width, height] = win.getSize();
    const [x, y] = win.getPosition();
    Object.assign(state.window, { width, height, x, y });
  }
  store.save();
}

// Restaure le dernier service consulté.
async function restoreActive() {
  const state = store.load();
  // En mode navigateur, c'est l'onglet courant qui occupe la fenêtre : les
  // services restent chargés en arrière-plan, on ne les détruit pas.
  if (state.browserMode) {
    // Démarrer en mode navigateur sans onglet donnerait une fenêtre vide :
    // le toggle en crée un, le démarrage doit en faire autant.
    if (state.tabs.length === 0) store.addTab();
    const tabId = state.activeTabId || (state.tabs[0] && state.tabs[0].id);
    if (tabId) await views.showTab(tabId);
    else views.hide();
    return;
  }
  const serviceId = state.activeServiceId || (state.services[0] && state.services[0].id);
  if (serviceId) await views.show(serviceId);
  else views.hide();
}


// Ouvre un onglet et l'affiche. Utilisé par le bouton « Nouvel onglet » comme
// par les liens `target="_blank"` des pages.
// Une même adresse demandée deux fois de suite vient presque toujours d'un
// seul geste : un lien qui porte `target="_blank"` et dont le site rappelle
// `window.open()` par-dessus. On rouvre alors l'onglet déjà créé.
let derniereOuverture = { url: null, at: 0, id: null };
const DELAI_DOUBLON = 1500;

async function openTab(url) {
  const maintenant = Date.now();
  if (url && url === derniereOuverture.url && maintenant - derniereOuverture.at < DELAI_DOUBLON) {
    const existant = store.getTab(derniereOuverture.id);
    if (existant) {
      derniereOuverture.at = maintenant;
      store.load().activeTabId = existant.id;
      store.save();
      pushState();
      await views.showTab(existant.id);
      return existant;
    }
  }

  const tab = store.addTab(url);
  derniereOuverture = { url: url || null, at: maintenant, id: tab.id };
  store.load().browserMode = true;
  store.save();
  pushState();
  await views.showTab(tab.id);
  return tab;
}

// Ce que l'utilisateur tape dans la barre : une URL si ça y ressemble, une
// recherche sinon. Sans ce filtre, « meteo amiens » deviendrait une adresse.
function toNavigableUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw === START_URL || raw === 'hublink://start/') return START_URL;
  // Un schéma exotique (file:, javascript:, data:) n'a rien à faire ici.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  const looksLikeHost = /^[^\s/]+\.[^\s/]{2,}(\/|$)/.test(raw) || raw.startsWith('localhost');
  if (looksLikeHost) return `https://${raw}`;
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
}

// --- IPC -------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('state:get', () => store.load());

  // On pilote `nativeTheme` plutôt que d'imposer une classe côté renderer :
  // cela aligne aussi les menus natifs et les boîtes de dialogue système, et le
  // renderer n'a plus qu'à écouter `prefers-color-scheme`.
  ipcMain.handle('app:set-theme', (_e, theme) => {
    const value = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
    store.load().theme = value;
    nativeTheme.themeSource = value;
    store.save();
    pushState();
  });

  // Le logo est réduit à 128 px et stocké en data URI dans la config : cela
  // évite un chemin `file://` que la CSP du renderer refuserait, et garde les
  // comptes autonomes (pas de fichier externe à retrouver).
  ipcMain.handle('account:pick-avatar', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choisir un logo',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths[0]) return null;

    const image = nativeImage.createFromPath(filePaths[0]);
    if (image.isEmpty()) {
      toast('error', "Ce fichier n'est pas une image lisible");
      return null;
    }
    const { width, height } = image.getSize();
    const side = Math.min(128, Math.max(width, height));
    return image.resize({ width: side, height: side, quality: 'best' }).toDataURL();
  });

  // Le filtre porte sur le compte : « tous », ou un seul. Si le service affiché
  // sort du filtre, on bascule sur le premier du compte plutôt que de laisser
  // une page hors contexte.
  ipcMain.handle('account:filter', async (_e, id) => {
    const state = store.load();
    state.activeAccountId = store.getAccount(id) ? id : null;
    store.save();
    pushState();

    const visibles = store.visibleServices();
    if (!visibles.some((s) => s.id === state.activeServiceId)) {
      state.activeServiceId = visibles[0] ? visibles[0].id : null;
      store.save();
      pushState();
      await restoreActive();
    }
  });

  // Pastille de non-lus hors de l'app. Le dessin vient du renderer : le process
  // principal n'a pas de canvas, et Windows exige une vraie image (là où macOS
  // et Linux se contentent d'un nombre).
  let lastTotal = 0;
  // Emis par le preload invité quand une webapp appelle `navigator.setAppBadge`.
  ipcMain.on('badge:set', (event, count) => views.applyBadgeFromApi(event.sender, count));

  ipcMain.on('panel:toggle', (_e, { kind, anchor }) => {
    if (panneau && panneau.kind === kind) panneau = null;
    else {
      ensureCalque();
      panneau = { kind, anchor };
      planifierFermetureCalque();
    }
    pousserPanneau();
  });

  // Le calque ne peut pas ouvrir une modale de la fenêtre principale : il lui
  // demande de le faire.
  ipcMain.on('settings:accounts', () => send('app:shortcut', { type: 'accounts' }));

  ipcMain.on('panel:close', () => {
    if (!panneau) return;
    panneau = null;
    pousserPanneau();
  });

  ipcMain.on('downloads:clear', () => {
    telechargements = [];
    panneau = null;
    pousserPanneau();
    pousserTelechargements();
  });

  ipcMain.on('overlay:interactive', (_e, on) => {
    // Un panneau ou un menu ouvert impose sa réceptivité : le suivi du
    // pointeur, qui ne connaît que les messages, la lèverait sans le savoir et
    // rendrait le menu incliquable.
    if (panneau || menuEnCours) return;
    if (calque && !calque.isDestroyed()) calque.setIgnoreMouseEvents(!on, { forward: true });
  });

  ipcMain.on('overlay:action', (_e, action) => runToastAction(action));

  // Une page propose un mot de passe : on ne l'enregistre PAS, on demande.
  ipcMain.on('password:offer', (event, { origin, username, password }) => {
    if (!password) return;
    const serviceId = views.idDe(event.sender);
    const compte = serviceId ? store.accountOf(serviceId) : null;
    if (!compte) return console.warn('[secrets] proposition ignorée : vue inconnue');
    // Sans trousseau, on ne peut pas chiffrer — et on ne veut pas écrire en
    // clair. Le dire, plutôt que de laisser croire que la fonction n'existe pas.
    if (!secrets.disponible()) {
      return toast('error', "Trousseau du système indisponible : mot de passe non enregistrable");
    }

    // Déjà connu et inchangé : inutile de reposer la question à chaque
    // connexion.
    const connu = secrets.recuperer(compte.id, origin);
    if (connu && connu.username === username && connu.password === password) return;

    const jeton = String(++jetonMotDePasse);
    motsDePasseEnAttente.set(jeton, { accountId: compte.id, origin, username, password });
    // ponytail: pas d'expiration — la Map se vide au clic ou à la fermeture de
    // l'app. À revoir si on garde un jour l'application ouverte des semaines.
    const hote = origin.replace(/^https?:\/\//, '');
    toast('success', `Enregistrer le mot de passe pour ${hote} ?`, {
      kind: 'save-password',
      label: 'Enregistrer',
      jeton
    });
  });

  ipcMain.on('app:badge', (_e, { total, overlay }) => {
    if (typeof app.setBadgeCount === 'function') app.setBadgeCount(total > 0 ? total : 0);

    if (win && !win.isDestroyed() && process.platform === 'win32') {
      win.setOverlayIcon(
        overlay ? nativeImage.createFromDataURL(overlay) : null,
        total > 0 ? `${total} non-lus` : ''
      );
    }
    // Un signal supplémentaire quand l'app n'a pas le focus : sans cela, une
    // pastille de dock passe facilement inaperçue.
    if (win && !win.isDestroyed() && total > lastTotal && !win.isFocused()) win.flashFrame(true);
    if (total === 0 && win && !win.isDestroyed()) win.flashFrame(false);
    lastTotal = total;
  });

  ipcMain.handle('capture:page', async (_e, { fullPage, toClipboard }) => {
    if (!views.current) return null;
    const service = store.getService(store.load().activeServiceId);
    try {
      const image = await capture.capture(views.current.webContents, { fullPage });
      if (image.isEmpty()) throw new Error('capture vide');
      if (toClipboard) {
        capture.copyToClipboard(image);
        toast('success', 'Capture copiée dans le presse-papiers');
        return 'clipboard';
      }
      const saved = await capture.saveToFile(win, image, service && service.name);
      if (saved) toast('success', 'Capture enregistrée');
      return saved;
    } catch (err) {
      toast('error', `Capture impossible : ${err.message}`);
      return null;
    }
  });

  ipcMain.handle('app:set-sleep', (_e, minutes) => {
    const value = Number(minutes);
    store.load().sleepAfterMinutes = Number.isFinite(value) && value > 0 ? value : 0;
    store.save();
    pushState();
  });

  // Même traitement que les logos de compte : réduit et stocké en data URI,
  // donc pas de chemin `file://` que la CSP du renderer refuserait.
  ipcMain.handle('service:pick-icon', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choisir une icône',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths[0]) return null;

    const image = nativeImage.createFromPath(filePaths[0]);
    if (image.isEmpty()) {
      toast('error', "Ce fichier n'est pas une image lisible");
      return null;
    }
    const { width, height } = image.getSize();
    const side = Math.min(64, Math.max(width, height));
    return image.resize({ width: side, height: side, quality: 'best' }).toDataURL();
  });

  ipcMain.handle('account:add', (_e, data) => {
    const account = store.addAccount(data);
    pushState();
    return account;
  });

  ipcMain.handle('account:update', (_e, { id, patch }) => {
    store.updateAccount(id, patch);
    pushState();
  });

  ipcMain.handle('account:remove', async (_e, id) => {
    const account = store.getAccount(id);
    if (!account) return;
    if (store.load().accounts.length <= 1) {
      toast('error', 'Impossible de supprimer le dernier compte');
      return;
    }
    const attached = store.load().services.filter((s) => s.accountId === id);
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Annuler', 'Supprimer'],
      defaultId: 0,
      cancelId: 0,
      message: `Supprimer le compte « ${account.name} » ?`,
      detail: attached.length
        ? `${attached.length} service(s) rattaché(s) seront retirés, ainsi que la session (cookies, connexions).`
        : 'Sa session (cookies, connexions) sera perdue.'
    });
    if (response !== 1) return;

    const session = views.getSession(id);
    views.destroyAccount(id);
    if (session) await session.clearStorageData().catch(() => {});
    store.removeAccount(id);
    pushState();
    await restoreActive();
  });

  ipcMain.handle('service:add', async (_e, data) => {
    const service = store.addService(data);
    if (!service) return null;
    pushState();
    await views.show(service.id);
    return service;
  });

  ipcMain.handle('service:update', async (_e, { id, patch }) => {
    const before = store.getService(id);
    // L'URL, le compte et le user-agent ne s'appliquent qu'au chargement de la
    // page : la vue existante doit être recréée. `openLinks` est relu à chaud.
    const needsReload =
      before &&
      ((patch.url && patch.url !== before.url) ||
        (patch.accountId && patch.accountId !== before.accountId) ||
        (patch.spoofChrome !== undefined && patch.spoofChrome !== before.spoofChrome));
    store.updateService(id, patch);
    pushState();
    if (needsReload) {
      views.destroyService(id);
      if (store.load().activeServiceId === id) await views.show(id);
    }
  });

  ipcMain.handle('service:remove', async (_e, id) => {
    views.destroyService(id);
    store.removeService(id);
    pushState();
    await restoreActive();
  });

  ipcMain.handle('service:select', async (_e, id) => {
    if (!store.getService(id)) return;
    store.load().activeServiceId = id;
    store.save();
    pushState();
    await views.show(id);
  });

  // Mise en sommeil à la main : même chose que le balayage automatique, sans
  // attendre le délai ni se soucier de `keepAwake` — c'est un geste explicite.
  // Relecture : on copie, on ne remplit pas. Décider à quelle page confier un
  // mot de passe est le vrai risque, et ce n'est pas un bouton « copier » qui
  // doit le prendre.
  ipcMain.handle('password:copy', (_e, serviceId) => {
    const service = store.getService(serviceId);
    const compte = service && store.accountOf(serviceId);
    if (!service || !compte) return false;
    let origin;
    try {
      origin = new URL(service.url).origin;
    } catch {
      return false;
    }
    const trouve = secrets.recuperer(compte.id, origin);
    if (!trouve) {
      toast('error', `Aucun mot de passe enregistré pour ${service.name}`);
      return false;
    }
    clipboard.writeText(trouve.password);
    toast('success', `Mot de passe de ${service.name} copié`);
    return true;
  });

  ipcMain.handle('service:sleep', (_e, id) => {
    if (!store.getService(id) || !views.views.has(id)) return;
    views.destroyService(id);
    send('service:slept', { serviceId: id });
    // La vue courante venait de disparaître : il faut réafficher quelque chose.
    if (store.load().activeServiceId === id) return restoreActive();
  });

  ipcMain.handle('service:reorder', (_e, orderedIds) => {
    store.reorderServices(orderedIds);
    pushState();
  });

  ipcMain.handle('account:reorder', (_e, orderedIds) => {
    store.reorderAccounts(orderedIds);
    pushState();
  });

  ipcMain.handle('account:collapse', (_e, { id, collapsed }) => {
    store.setAccountCollapsed(id, collapsed);
    pushState();
  });

  // --- navigateur neutre ---------------------------------------------------

  ipcMain.handle('browser:toggle', async (_e, on) => {
    const state = store.load();
    const next = typeof on === 'boolean' ? on : !state.browserMode;
    store.setBrowserMode(next);
    pushState();
    await restoreActive();
    return next;
  });

  ipcMain.handle('tab:add', async (_e, url) => openTab(url));

  ipcMain.handle('browser:set-block-ads', (_e, on) => {
    store.load().blockAds = Boolean(on);
    store.save();
    pushState();
  });

  ipcMain.handle('tab:select', async (_e, id) => {
    if (!store.getTab(id)) return;
    store.load().activeTabId = id;
    store.save();
    pushState();
    await views.showTab(id);
  });

  ipcMain.handle('tab:close', async (_e, id) => {
    views.destroyTab(id);
    const nextId = store.removeTab(id);
    // Fermer le dernier onglet ne doit pas laisser une fenêtre vide : on en
    // rouvre un neuf, comme n'importe quel navigateur.
    if (!nextId) {
      await openTab();
      return;
    }
    store.load().activeTabId = nextId;
    store.save();
    pushState();
    await views.showTab(nextId);
  });

  ipcMain.handle('layout:toggle-sidebar', (_e, collapsed) => {
    const state = store.load();
    state.sidebarCollapsed = typeof collapsed === 'boolean' ? collapsed : !state.sidebarCollapsed;
    store.save();
    pushState();
  });

  ipcMain.on('layout:bounds', (_e, bounds) => views.setBounds(bounds));
  ipcMain.on('layout:overlay', (_e, active) => views.setOverlay(active));

  /**
   * Fige la page derrière une modale.
   *
   * Une modale doit masquer la vue web, sinon elle s'ouvre derrière elle. Mais
   * la masquer laissait un trou : la page disparaissait le temps du dialogue,
   * et revenait d'un coup — un clignotement d'une seconde, signalé comme un
   * bug. On rend donc une image de la page, que le shell affiche derrière la
   * modale : la vue peut disparaître sans que rien ne bouge à l'écran.
   *
   * Demi-résolution et JPEG : l'image est floutée à l'arrivée, sa finesse ne
   * sert à rien, et un PNG pleine taille ferait passer plusieurs mégaoctets
   * par l'IPC à chaque ouverture.
   */
  ipcMain.handle('view:still', async () => {
    if (!views.current) return null;
    try {
      const image = await views.current.webContents.capturePage();
      if (image.isEmpty()) return null;
      const { width } = image.getSize();
      const reduite = width > 900 ? image.resize({ width: 900 }) : image;
      return `data:image/jpeg;base64,${reduite.toJPEG(55).toString('base64')}`;
    } catch {
      // Une vue qui n'a pas encore peint refuse la capture : la modale
      // s'ouvrira sur le fond du shell, comme avant.
      return null;
    }
  });

  // Menus natifs : ils se dessinent au-dessus des WebContentsView, contrairement
  // à un menu HTML du shell qui serait masqué par la page.
  /**
   * Les menus étaient natifs faute de pouvoir dessiner au-dessus de la vue web.
   * La fenêtre de calque lève cette contrainte : ils sont désormais en HTML,
   * donc animés et cohérents avec le reste, au prix du rendu système.
   *
   * L'API ne change pas — on rend toujours une promesse portant l'identifiant
   * choisi — pour que les appelants n'aient rien à savoir de ce déménagement.
   */
  ipcMain.handle('menu:popup', async (_e, items) => {
    const c = ensureCalque();
    if (!c) return null;

    // Le menu s'ouvre là où est le pointeur, comme le faisait le menu natif.
    // `getCursorScreenPoint` est en coordonnées écran : le calque, lui, pense
    // en coordonnées de son contenu.
    const curseur = screen.getCursorScreenPoint();
    const zone = c.getContentBounds();
    const ancre = { x: curseur.x - zone.x, y: curseur.y - zone.y };

    const id = ++dernierMenu;
    menuEnCours = id;
    majReceptiviteCalque();

    const envoyer = () => c.webContents.send('menu:open', { id, items, ancre });
    if (c.webContents.isLoading()) c.webContents.once('did-finish-load', envoyer);
    else envoyer();

    return new Promise((resolve) => {
      menuAttente.set(id, resolve);
    });
  });

  ipcMain.on('menu:pick', (_e, { id, picked }) => {
    const resoudre = menuAttente.get(id);
    if (!resoudre) return;
    menuAttente.delete(id);
    if (menuEnCours === id) menuEnCours = null;
    majReceptiviteCalque();
    planifierFermetureCalque();
    resoudre(picked ?? null);
  });

  ipcMain.handle('nav:back', () => views.withCurrent((wc) => wc.navigationHistory.goBack()));
  ipcMain.handle('nav:forward', () => views.withCurrent((wc) => wc.navigationHistory.goForward()));
  ipcMain.handle('nav:reload', (_e, hard) =>
    views.withCurrent((wc) => (hard ? wc.reloadIgnoringCache() : wc.reload()))
  );
  ipcMain.handle('nav:stop', () => views.withCurrent((wc) => wc.stop()));
  ipcMain.handle('nav:devtools', () => views.withCurrent((wc) => wc.toggleDevTools()));
  ipcMain.handle('nav:home', () => {
    const state = store.load();
    if (state.browserMode) return views.withCurrent((wc) => wc.loadURL(store.BROWSER_HOME));
    const service = store.getService(state.activeServiceId);
    if (service) views.withCurrent((wc) => wc.loadURL(service.url));
  });

  // Saisie de la barre d'adresse : réservée au mode navigateur, pour qu'un
  // service reste bien ancré sur son domaine.
  ipcMain.handle('nav:go', (_e, input) => {
    if (!store.load().browserMode) return;
    const url = toNavigableUrl(input);
    if (url) views.withCurrent((wc) => wc.loadURL(url));
  });

  ipcMain.handle('media:pip', async () => {
    const r = await views.togglePictureInPicture();
    if (r === 'aucune') toast('error', 'Aucune vidéo sur cette page');
    else if (typeof r === 'string' && r.startsWith('erreur:')) {
      toast('error', `Incrustation impossible : ${r.slice(7)}`);
    }
    return r;
  });

  ipcMain.handle('update:check', () => updates.check());

  // --- favoris, apparence, telechargements, mise a jour --------------------

  ipcMain.handle('favorites:toggle', () => {
    const state = store.load();
    const tab = store.getTab(state.activeTabId);
    if (!tab || !tab.url || tab.url.startsWith('hublink://')) return false;
    const existant = state.favorites.some((f) => f.url === tab.url);
    if (existant) store.removeFavoriteByUrl(tab.url);
    else store.addFavorite({ title: tab.title, url: tab.url, favicon: tab.favicon });
    pushState();
    return !existant;
  });

  ipcMain.handle('favorites:remove', (_e, id) => {
    store.removeFavorite(id);
    pushState();
  });

  ipcMain.handle('favorites:open', async (_e, id) => {
    const favori = store.load().favorites.find((f) => f.id === id);
    if (favori) await openTab(favori.url);
  });

  ipcMain.handle('config:export', async () => {
    const defaut = `hublink-configuration-${new Date().toISOString().slice(0, 10)}.json`;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Exporter la configuration',
      defaultPath: defaut,
      filters: [{ name: 'Sauvegarde Hublink', extensions: ['json'] }]
    });
    if (canceled || !filePath) return null;
    try {
      fs.writeFileSync(filePath, JSON.stringify(store.exportConfig(), null, 2));
      toast('success', 'Configuration exportée');
      return filePath;
    } catch (err) {
      toast('error', `Export impossible : ${err.message}`);
      return null;
    }
  });

  ipcMain.handle('config:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Importer une configuration',
      properties: ['openFile'],
      filters: [{ name: 'Sauvegarde Hublink', extensions: ['json'] }]
    });
    if (canceled || !filePaths || !filePaths[0]) return false;

    let data = null;
    try {
      data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    } catch {
      toast('error', 'Fichier illisible');
      return false;
    }

    const state = store.load();
    // Remplacer sans prévenir effacerait le travail de quelqu'un : on annonce
    // ce qui part et ce qui arrive avant de toucher à quoi que ce soit.
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Annuler', 'Remplacer'],
      defaultId: 0,
      cancelId: 0,
      message: 'Remplacer la configuration actuelle ?',
      detail:
        `Vos ${state.accounts.length} compte(s) et ${state.services.length} service(s) seront ` +
        `remplacés par ceux du fichier (${(data.accounts || []).length} compte(s), ` +
        `${(data.services || []).length} service(s)).\n\n` +
        'Vos connexions restent sur cette machine : les services importés demanderont de se ' +
        "reconnecter. Une copie de la configuration actuelle est conservée à côté du fichier " +
        'de configuration.'
    });
    if (response !== 1) return false;

    const r = store.importConfig(data);
    if (!r.ok) {
      toast('error', r.erreur);
      return false;
    }
    views.destroyAll();
    pushState();
    await restoreActive();
    views.preloadKeepAwake();
    toast('success', `${r.comptes} compte(s) et ${r.services} service(s) importés`);
    return true;
  });

  ipcMain.handle('service:restore', async () => {
    const service = store.restoreRemoved();
    if (!service) return null;
    pushState();
    await views.show(service.id);
    return service;
  });

  ipcMain.handle('history:open', async (_e, url) => openTab(url));

  ipcMain.handle('history:remove', (_e, id) => {
    store.removeHistory(id);
    pushState();
  });

  ipcMain.handle('history:clear', () => {
    store.clearHistory();
    pushState();
  });

  ipcMain.handle('app:set-discreet', (_e, on) => {
    const state = store.load();
    state.discreet = typeof on === 'boolean' ? on : !state.discreet;
    store.save();
    pushState();
    return state.discreet;
  });

  ipcMain.handle('app:set-accent', (_e, color) => {
    store.setAccentColor(color);
    pushState();
    views.reloadStartPages();
  });

  ipcMain.handle('download:reveal', (_e, chemin) => downloadsMod.reveal(chemin));
  ipcMain.handle('download:open', (_e, chemin) => downloadsMod.open(chemin));

  ipcMain.handle('update:can-install', () => updates.canInstall());
  ipcMain.handle('update:download', () =>
    updates.download((percent) => send('update:progress', { percent }))
  );
  ipcMain.handle('update:install', () => updates.install());

  ipcMain.handle('app:about', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    userData: app.getPath('userData')
  }));

  ipcMain.handle('app:open-external', (_e, url) => {
    if (isExternalUrl(url)) shell.openExternal(url);
  });

  registerExtensionIpc();
}

function registerExtensionIpc() {
  const activeAccountId = () => {
    const service = store.getService(store.load().activeServiceId);
    return service ? service.accountId : null;
  };

  const afterInstall = async (record) => {
    pushState();
    const results = await views.refreshAllExtensions();
    const failure = results.find((r) => r.id === record.id && !r.ok);
    if (failure) toast('error', `${record.name} : ${failure.error}`);
    else toast('success', `${record.name} ${record.version} installée`);
    return record;
  };

  ipcMain.handle('ext:install-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Choisir le dossier de l'extension (décompressée)",
      properties: ['openDirectory']
    });
    if (canceled || !filePaths[0]) return null;
    try {
      return await afterInstall(extensions.installFromDirectory(filePaths[0]));
    } catch (err) {
      toast('error', err.message);
      return null;
    }
  });

  ipcMain.handle('ext:install-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choisir un fichier .crx ou .zip',
      filters: [{ name: 'Extension Chrome', extensions: ['crx', 'zip'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths[0]) return null;
    try {
      const buffer = fs.readFileSync(filePaths[0]);
      return await afterInstall(extensions.installFromArchive(buffer, { type: 'file', origin: filePaths[0] }));
    } catch (err) {
      toast('error', err.message);
      return null;
    }
  });

  ipcMain.handle('ext:install-store', async (_e, idOrUrl) => {
    try {
      return await afterInstall(await extensions.installFromStore(idOrUrl));
    } catch (err) {
      toast('error', err.message);
      return null;
    }
  });

  ipcMain.handle('ext:remove', async (_e, id) => {
    const record = store.load().extensions.find((x) => x.id === id);
    extensions.remove(id);
    pushState();
    await views.refreshAllExtensions();
    if (record) toast('success', `${record.name} désinstallée`);
  });

  ipcMain.handle('ext:toggle', async (_e, { id, accountId, enabled }) => {
    extensions.setEnabled(id, accountId, enabled);
    pushState();
    await views.refreshExtensions(accountId);
  });

  ipcMain.handle('ext:loaded', (_e, accountId) => {
    const session = views.getSession(accountId);
    if (!session) return [];
    return session.extensions.getAllExtensions().map((ext) => ({
      chromeId: ext.id,
      name: ext.name,
      version: ext.version,
      path: ext.path,
      hasPopup: Boolean((ext.manifest.action || ext.manifest.browser_action || {}).default_popup)
    }));
  });

  ipcMain.handle('ext:popup', (_e, chromeExtensionId) => {
    const session = views.getSession(activeAccountId());
    if (!session) return;
    try {
      extensions.openPopup(session, chromeExtensionId, win);
    } catch (err) {
      toast('error', err.message);
    }
  });

  ipcMain.on('guest:shortcut', (_e, payload) => send('app:shortcut', payload));
}

function buildMenu() {
  const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Fichier',
      submenu: [
        { label: 'Nouveau service', accelerator: `${mod}+N`, click: () => send('app:shortcut', { type: 'new-service' }) },
        { label: 'Nouveau compte', accelerator: `${mod}+Shift+N`, click: () => send('app:shortcut', { type: 'new-account' }) },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Recharger', accelerator: `${mod}+R`, click: () => views.withCurrent((wc) => wc.reload()) },
        {
          label: 'Recharger sans le cache',
          accelerator: `${mod}+Shift+R`,
          click: () => views.withCurrent((wc) => wc.reloadIgnoringCache())
        },
        {
          label: 'Capturer la page entière',
          accelerator: `${mod}+Shift+S`,
          click: () => send('app:shortcut', { type: 'capture-full' })
        },
        {
          label: 'Capturer la zone visible',
          click: () => send('app:shortcut', { type: 'capture-visible' })
        },
        { type: 'separator' },
        {
          label: 'Mettre en veille les services inactifs',
          submenu: [0, 5, 10, 15, 20, 30, 45, 60, 120].map((minutes) => ({
            label: minutes === 0 ? 'Jamais' : `Après ${minutes} min`,
            type: 'radio',
            checked: (store.load().sleepAfterMinutes || 0) === minutes,
            click: () => {
              store.load().sleepAfterMinutes = minutes;
              store.save();
              pushState();
            }
          }))
        },
        {
          label: 'Afficher / masquer le panneau',
          accelerator: `${mod}+B`,
          click: () => send('app:shortcut', { type: 'toggle-sidebar' })
        },
        { type: 'separator' },
        {
          label: 'Zoom avant',
          accelerator: `${mod}+Plus`,
          click: () => views.withCurrent((wc) => wc.setZoomLevel(wc.getZoomLevel() + 0.5))
        },
        {
          label: 'Zoom arrière',
          accelerator: `${mod}+-`,
          click: () => views.withCurrent((wc) => wc.setZoomLevel(wc.getZoomLevel() - 0.5))
        },
        { label: 'Zoom normal', accelerator: `${mod}+0`, click: () => views.withCurrent((wc) => wc.setZoomLevel(0)) },
        { type: 'separator' },
        {
          label: 'Outils de développement du service',
          accelerator: `${mod}+Alt+I`,
          click: () => views.withCurrent((wc) => wc.toggleDevTools())
        },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Extensions',
      submenu: [
        { label: 'Gérer les extensions', accelerator: `${mod}+Shift+E`, click: () => send('app:shortcut', { type: 'extensions' }) }
      ]
    },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Une seule instance : sinon deux process se disputent les sessions persistées.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    nativeTheme.themeSource = store.load().theme || 'system';
    registerIpc();
    buildMenu();
    createWindow();
    await restoreActive();
    // Après l'affichage : ces services occupent de la mémoire sans être vus,
    // ils ne doivent pas retarder l'apparition de la fenêtre.
    views.preloadKeepAwake();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => store.saveNow());
}

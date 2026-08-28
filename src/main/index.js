const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  nativeImage,
  nativeTheme,
  protocol
} = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const views = require('./views');
const extensions = require('./extensions');
const { isExternalUrl } = require('./urls');
const capture = require('./capture');
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

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const pushState = () => send('state:changed', store.load());
const toast = (variant, message) => send('app:toast', { variant, message });

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

  if (state.window.maximized) win.maximize();
  views.attach(win);
  views.startSleepWatcher();
  views.onEvent = (type, payload) => {
    // Badge et favicon changent très souvent : on envoie le seul delta, pas
    // l'état complet (qui embarque les logos en base64 de tous les clients).
    if (type === 'service-meta') send('service:meta', payload);
    if (type === 'service-slept') send('service:slept', payload);
    if (type === 'tab-meta') send('tab:meta', payload);
    if (type === 'download-started') send('download:started', payload);
    if (type === 'download-progress') send('download:progress', payload);
    if (type === 'download-done') send('download:done', payload);
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
async function openTab(url) {
  const tab = store.addTab(url);
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

  ipcMain.handle('service:reorder', (_e, orderedIds) => {
    store.reorderServices(orderedIds);
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

  // Menus natifs : ils se dessinent au-dessus des WebContentsView, contrairement
  // à un menu HTML du shell qui serait masqué par la page.
  ipcMain.handle('menu:popup', (_e, items) => {
    return new Promise((resolve) => {
      let picked = null;
      const menu = Menu.buildFromTemplate(
        items.map((item) =>
          item.type === 'separator'
            ? { type: 'separator' }
            : {
                label: item.label,
                enabled: item.enabled !== false,
                click: () => {
                  picked = item.id;
                }
              }
        )
      );
      menu.on('menu-will-close', () => setImmediate(() => resolve(picked)));
      menu.popup({ window: win });
    });
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

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => store.saveNow());
}

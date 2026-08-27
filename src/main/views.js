const { WebContentsView, dialog, shell, session: electronSession } = require('electron');
const path = require('path');
const store = require('./store');
const extensions = require('./extensions');
const { isExternalUrl, isUsableFavicon } = require('./urls');
const { uaFor } = require('./ua');
const favicon = require('./favicon');

// Domaines d'authentification qui exigent une vraie popup : on les ouvre dans
// une fenêtre enfant partageant la session, sinon le SSO casse.
const AUTH_HOSTS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'okta.com',
  'auth0.com',
  'signin.aws.amazon.com',
  'login.salesforce.com',
  'github.com',
  'slack.com'
];

// La partition est portée par le compte : les comptes migrés depuis l'ancien
// modèle gardent la leur, sinon leurs cookies deviendraient inaccessibles.
const partitionFor = (accountId) => {
  const account = store.getAccount(accountId);
  return (account && account.partition) || `persist:account-${accountId}`;
};

// La fenêtre enfant hérite déjà de la session de l'ouvreur : ne rien préciser
// ici, ni `session` ni `partition`, sous peine de la déplacer hors du
// cloisonnement par compte. On ne redit que les garde-fous.
const popupOptions = ({ width, height }) => ({
  width,
  height,
  autoHideMenuBar: true,
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
});

// Comparaison sur le hostname parsé, jamais sur la chaîne complète : un
// `url.includes('accounts.google.com')` laisserait passer
// `https://piege.example/?x=accounts.google.com`, qui hériterait alors de la
// session du compte dans une fenêtre applicative.
function isAuthUrl(rawUrl) {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    if (protocol !== 'https:') return false;
    return AUTH_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

// Accordées sans question : sans effet sur la vie privée et nécessaires aux
// webapps métier (Teams, Slack).
const AUTO_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock']);

// Caméra, micro et partage d'écran : jamais en silence, on demande à chaque
// nouvelle origine.
const CONFIRMED_PERMISSIONS = new Set(['media', 'display-capture', 'clipboard-read']);

const PERMISSION_LABELS = {
  media: 'utiliser votre caméra et votre microphone',
  'display-capture': 'partager votre écran',
  'clipboard-read': 'lire le contenu de votre presse-papiers'
};

class ViewManager {
  constructor() {
    this.window = null;
    this.views = new Map(); // serviceId -> WebContentsView
    this.sessions = new Map(); // accountId -> { session, ready }
    this.current = null;
    this.currentId = null;
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    // Une WebContentsView est une vue native : elle se peint TOUJOURS au-dessus
    // du HTML du shell. Une modale React serait donc invisible derrière la page.
    // On masque la vue tant qu'un calque du shell est ouvert.
    this.overlay = false;
    // Dernier passage au premier plan, par service : sert à endormir ceux
    // qu'on ne consulte plus.
    this.lastActiveAt = new Map();
    this.sleepTimer = null;
    this.onEvent = () => {};
  }

  attach(window) {
    this.window = window;
  }

  // Chaque service vivant est un process Chromium complet (~110 Mo). Les
  // laisser tous en mémoire fait swapper la machine bien avant que l'app
  // paraisse lourde. On libère ceux qu'on ne regarde plus ; ils se rechargent
  // au prochain clic, comme la mise en veille d'onglets d'un navigateur.
  startSleepWatcher() {
    clearInterval(this.sleepTimer);
    this.sleepTimer = setInterval(() => this.sweepIdleViews(), 60_000);
    if (this.sleepTimer.unref) this.sleepTimer.unref();
  }

  sweepIdleViews() {
    const minutes = store.load().sleepAfterMinutes;
    if (!minutes || minutes <= 0) return;
    const cutoff = Date.now() - minutes * 60_000;

    for (const [serviceId, view] of [...this.views]) {
      if (view === this.current) continue;
      if ((this.lastActiveAt.get(serviceId) ?? 0) > cutoff) continue;
      this.destroyService(serviceId);
      this.onEvent('service-slept', { serviceId });
    }
  }

  // --- sessions ------------------------------------------------------------

  ensureSession(accountId) {
    const cached = this.sessions.get(accountId);
    if (cached) return cached.ready.then(() => cached.session);

    const ses = electronSession.fromPartition(partitionFor(accountId));
    const entry = { session: ses, ready: null };
    this.sessions.set(accountId, entry);

    // Mémorise les accords donnés, par origine et par permission, pour ne pas
    // reposer la question à chaque appel visio.
    const granted = new Set();

    ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
      if (AUTO_PERMISSIONS.has(permission)) return callback(true);
      if (!CONFIRMED_PERMISSIONS.has(permission)) return callback(false);

      let origin = '';
      try {
        origin = new URL(details.requestingUrl || wc.getURL()).origin;
      } catch {
        return callback(false);
      }

      const key = `${origin}:${permission}`;
      if (granted.has(key)) return callback(true);

      const { response } = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Refuser', 'Autoriser'],
        defaultId: 0,
        cancelId: 0,
        message: `Autoriser ${origin} à ${PERMISSION_LABELS[permission] || permission} ?`,
        detail: "Cette autorisation ne vaut que pour ce compte, jusqu'à la fermeture de Hublink."
      });
      if (response === 1) granted.add(key);
      callback(response === 1);
    });

    // Le pendant synchrone : sans lui, Electron applique ses propres défauts.
    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
      AUTO_PERMISSIONS.has(permission) || granted.has(`${requestingOrigin}:${permission}`)
    );

    ses.setSpellCheckerLanguages(['fr', 'en-US']);

    entry.ready = extensions
      .applyToSession(ses, accountId)
      .then((results) => {
        const failed = results.filter((r) => !r.ok);
        if (failed.length) console.warn('[extensions] échecs de chargement', failed);
      })
      .catch((err) => console.error('[extensions]', err));

    return entry.ready.then(() => ses);
  }

  // Recharge les extensions d'un compte déjà ouvert. Les content scripts ne
  // s'injectent qu'au chargement : les vues concernées doivent être rechargées.
  async refreshExtensions(accountId) {
    const entry = this.sessions.get(accountId);
    if (!entry) return [];
    const results = await extensions.applyToSession(entry.session, accountId);
    for (const [serviceId, view] of this.views) {
      const service = store.getService(serviceId);
      if (service && service.accountId === accountId) view.webContents.reload();
    }
    return results;
  }

  // Une extension s'installe pour tous les comptes : les sessions des autres
  // comptes déjà ouverts doivent la recevoir sans attendre un redémarrage.
  async refreshAllExtensions() {
    const batches = await Promise.all([...this.sessions.keys()].map((id) => this.refreshExtensions(id)));
    return batches.flat();
  }

  getSession(accountId) {
    const entry = this.sessions.get(accountId);
    return entry ? entry.session : null;
  }

  // --- vues ----------------------------------------------------------------

  async ensureView(serviceId) {
    const existing = this.views.get(serviceId);
    if (existing) return existing;

    const service = store.getService(serviceId);
    if (!service) return null;

    const ses = await this.ensureSession(service.accountId);
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
        preload: path.join(__dirname, '..', 'preload', 'guest.js'),
        // Le preload lit ces drapeaux dans `process.argv` : c'est le seul canal
        // disponible avant que la page ne commence à s'exécuter.
        additionalArguments: [
          ...(service.blockPasskeys === false ? [] : ['--hublink-block-passkeys']),
          ...(service.notifications === false ? ['--hublink-mute'] : [])
        ]
      }
    });
    view.setBackgroundColor('#ffffff');
    view.webContents.setUserAgent(uaFor(service));
    this.views.set(serviceId, view);
    this.wire(view, serviceId);
    view.webContents.loadURL(service.url);
    return view;
  }

  // Rafraîchit la barre d'URL pour le service affiché. Indispensable au moment
  // d'un changement de service : une vue déjà chargée n'émet aucun événement de
  // navigation, la barre resterait donc sur l'URL du service précédent.
  emitNavState(serviceId) {
    const view = this.views.get(serviceId);
    if (!view || view.webContents.isDestroyed()) return;
    const wc = view.webContents;
    this.onEvent('nav-state', {
      serviceId,
      url: wc.getURL(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      loading: wc.isLoading()
    });
  }

  wire(view, serviceId) {
    const wc = view.webContents;
    const emit = (type, payload) => this.onEvent(type, { serviceId, ...payload });

    wc.on('page-title-updated', (_e, title) => {
      // Beaucoup de webapps (Gmail, Slack, Teams) mettent le compteur dans le titre.
      const m = /\((\d+)\)/.exec(title);
      const badge = m ? parseInt(m[1], 10) : 0;
      if (store.updateServiceIfChanged(serviceId, { badge })) emit('service-meta', { badge });
    });

    wc.on('page-favicon-updated', async (_e, favicons) => {
      const url = (favicons || []).find(isUsableFavicon);
      if (!url) return;
      const dataUrl = await favicon.toDataUrl(wc.session, url);
      if (!dataUrl) return;
      if (store.updateServiceIfChanged(serviceId, { favicon: dataUrl })) {
        emit('service-meta', { favicon: dataUrl });
      }
    });

    // Certains sites ne déclarent aucune icône : on tente l'emplacement
    // conventionnel une fois la page chargée, plutôt que de rester sur les
    // initiales.
    wc.once('did-finish-load', async () => {
      const service = store.getService(serviceId);
      if (!service || service.favicon) return;
      const fallback = favicon.defaultIconUrl(wc.getURL() || service.url);
      if (!fallback) return;
      const dataUrl = await favicon.toDataUrl(wc.session, fallback);
      if (!dataUrl) return;
      if (store.updateServiceIfChanged(serviceId, { favicon: dataUrl })) {
        emit('service-meta', { favicon: dataUrl });
      }
    });

    // Une SPA change d'URL à chaque interaction : on ne rafraîchit la barre
    // qu'au plus quatre fois par seconde, sans jamais perdre le dernier état.
    let navTimer = null;
    let navPending = false;
    const sendNav = () => {
      navPending = false;
      emit('nav-state', {
        url: wc.getURL(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        loading: wc.isLoading()
      });
    };
    const nav = () => {
      if (navTimer) {
        navPending = true;
        return;
      }
      sendNav();
      navTimer = setTimeout(() => {
        navTimer = null;
        if (navPending) nav();
      }, 250);
    };
    wc.once('destroyed', () => clearTimeout(navTimer));

    wc.on('did-start-loading', nav);
    wc.on('did-stop-loading', nav);
    wc.on('did-navigate', nav);
    wc.on('did-navigate-in-page', nav);

    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) emit('load-error', { code, desc, url });
    });

    wc.setWindowOpenHandler(({ url }) => {
      // Relu à chaque ouverture : changer la préférence prend effet aussitôt.
      const service = store.getService(serviceId);
      const inApp = service && service.openLinks === 'app';

      if (inApp && isExternalUrl(url)) {
        return { action: 'allow', overrideBrowserWindowOptions: popupOptions({ width: 1100, height: 800 }) };
      }
      if (isAuthUrl(url)) {
        return { action: 'allow', overrideBrowserWindowOptions: popupOptions({ width: 520, height: 720 }) };
      }
      if (isExternalUrl(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  async show(serviceId) {
    if (!this.window) return;
    const view = await this.ensureView(serviceId);

    if (this.current && this.current !== view) {
      this.current.setVisible(false);
      this.window.contentView.removeChildView(this.current);
    }
    this.current = view || null;
    this.currentId = view ? serviceId : null;
    if (!view) return;

    this.lastActiveAt.set(serviceId, Date.now());
    this.window.contentView.addChildView(view);
    view.setBounds(this.bounds);
    view.setVisible(!this.overlay);
    if (!this.overlay) view.webContents.focus();
    this.emitNavState(serviceId);
  }

  // Appelé quand une modale ou un menu du shell s'ouvre / se ferme.
  setOverlay(active) {
    this.overlay = Boolean(active);
    if (!this.current) return;
    this.current.setVisible(!this.overlay);
    if (!this.overlay) this.current.webContents.focus();
  }

  hide() {
    if (this.current && this.window) this.window.contentView.removeChildView(this.current);
    this.current = null;
    this.currentId = null;
  }

  setBounds(bounds) {
    const next = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height))
    };
    // Redimensionner une vue native force une recomposition : l'observateur du
    // renderer émet plusieurs fois la même géométrie, on filtre les doublons.
    const same =
      next.x === this.bounds.x &&
      next.y === this.bounds.y &&
      next.width === this.bounds.width &&
      next.height === this.bounds.height;
    this.bounds = next;
    if (same) return;
    if (this.current) this.current.setBounds(next);
  }

  destroyService(serviceId) {
    const view = this.views.get(serviceId);
    if (!view) return;
    if (this.current === view) this.hide();
    view.webContents.close();
    this.views.delete(serviceId);
    this.lastActiveAt.delete(serviceId);
  }

  destroyAccount(accountId) {
    for (const [serviceId] of [...this.views]) {
      const service = store.getService(serviceId);
      if (!service || service.accountId === accountId) this.destroyService(serviceId);
    }
    this.sessions.delete(accountId);
  }

  withCurrent(fn) {
    if (this.current) fn(this.current.webContents);
  }
}

module.exports = new ViewManager();

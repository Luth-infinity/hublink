const { WebContentsView, dialog, shell, session: electronSession } = require('electron');
const path = require('path');
const store = require('./store');
const extensions = require('./extensions');
const { isExternalUrl, isUsableFavicon } = require('./urls');
const { uaFor } = require('./ua');
const favicon = require('./favicon');
const startpage = require('./startpage');
const adblock = require('./adblock');
const downloads = require('./downloads');

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

// Le navigateur neutre n'appartient à aucun compte : sa session est à part,
// et n'hérite donc d'aucun cookie client. C'est tout l'intérêt du mode.
const BROWSER_ACCOUNT = '__browser__';
const BROWSER_PARTITION = 'persist:browser';

// La partition est portée par le compte : les comptes migrés depuis l'ancien
// modèle gardent la leur, sinon leurs cookies deviendraient inaccessibles.
const partitionFor = (accountId) => {
  if (accountId === BROWSER_ACCOUNT) return BROWSER_PARTITION;
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
    // Services qui pilotent leur pastille par l'API standard. Pour ceux-là on
    // cesse de lire le titre : les deux sources se contrediraient, et le titre
    // remettrait le compteur à zéro à chaque changement de page.
    this.pastilleParApi = new Set();
    // Vues dont la page a déjà joué une vidéo : l'incrustation n'a de sens que
    // pour celles-là, on n'encombre pas la barre pour les autres.
    this.avecMedia = new Set();
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
      // Un service endormi n'a plus de page : il ne peut donc plus signaler
      // ses non-lus. Ceux qu'on a marqués restent chargés pour cette raison.
      const service = store.getService(serviceId);
      if (service && service.keepAwake) continue;
      this.destroyService(serviceId);
      this.onEvent('service-slept', { serviceId });
    }
  }

  // --- sessions ------------------------------------------------------------

  ensureSession(accountId) {
    const cached = this.sessions.get(accountId);
    if (cached) return cached.ready.then(() => cached.session);

    const ses = electronSession.fromPartition(partitionFor(accountId));
    // La page d'accueil n'existe que pour le navigateur, et son schéma doit
    // être posé sur cette session : le registre est propre à chaque partition.
    if (accountId === BROWSER_ACCOUNT) {
      startpage.serveOn(ses);
      adblock.applyTo(ses);
    }
    // Les téléchargements sont suivis sur toutes les sessions : un intranet de
    // client sert des pièces jointes comme n'importe quel site.
    downloads.watch(ses, (type, payload) => this.onEvent(type, payload));
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
      // Les onglets du navigateur n'ont pas de service : ils dépendent tous de
      // la session du navigateur, et doivent donc se recharger avec elle.
      if (store.getTab(serviceId)) {
        if (accountId === BROWSER_ACCOUNT) view.webContents.reload();
        continue;
      }
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

  // --- navigateur neutre ---------------------------------------------------

  // Un onglet est une vue comme une autre : il vit dans la même Map, profite
  // donc de la mise en veille et du recyclage déjà en place. Seule sa session
  // change — et le fait qu'il n'écrit rien dans les services.
  async ensureTabView(tabId) {
    const existing = this.views.get(tabId);
    if (existing) return existing;

    const tab = store.getTab(tabId);
    if (!tab) return null;

    const ses = await this.ensureSession(BROWSER_ACCOUNT);
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true
        // Pas de preload « invité » : on ne neutralise ni les clés d'accès ni
        // les notifications ici. Le mode navigateur doit se comporter comme un
        // navigateur, y compris pour WebAuthn.
      }
    });
    view.setBackgroundColor('#ffffff');
    this.views.set(tabId, view);
    this.wireTab(view, tabId);
    // Un onglet dont l'URL a été perdue (vue détruite en cours d'écriture)
    // retombe sur l'accueil plutôt que sur une page blanche.
    view.webContents.loadURL(tab.url || store.BROWSER_HOME);
    return view;
  }

  wireTab(view, tabId) {
    const wc = view.webContents;
    const emit = (type, payload) => this.onEvent(type, { tabId, ...payload });

    wc.on('page-title-updated', (_e, title) => {
      if (store.updateTabIfChanged(tabId, { title })) emit('tab-meta', { title });
    });

    wc.on('page-favicon-updated', async (_e, favicons) => {
      const url = (favicons || []).find(isUsableFavicon);
      if (!url) return;
      const dataUrl = await favicon.toDataUrl(wc.session, url);
      if (!dataUrl) return;
      if (store.updateTabIfChanged(tabId, { favicon: dataUrl })) emit('tab-meta', { favicon: dataUrl });
    });

    let navTimer = null;
    let navPending = false;
    const sendNav = () => {
      navPending = false;
      const url = wc.getURL();
      // L'URL est persistée : rouvrir Hublink retrouve les onglets là où on
      // les avait laissés, sans les recharger tous au démarrage. Une chaîne
      // vide n'est pas une navigation : l'écrire effacerait l'adresse réelle.
      if (url && store.updateTabIfChanged(tabId, { url })) emit('tab-meta', { url });
      this.onEvent('nav-state', {
        serviceId: tabId,
        url,
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

    this.wireMedia(wc, tabId);

    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.onEvent('load-error', { serviceId: tabId, code, desc, url });
    });

    // `target="_blank"` ouvre un onglet, pas le navigateur système : c'est ce
    // qu'attend quelqu'un qui navigue vraiment. Les popups d'authentification
    // gardent leur fenêtre, sinon le SSO casse.
    wc.setWindowOpenHandler(({ url }) => {
      if (isAuthUrl(url)) {
        return { action: 'allow', overrideBrowserWindowOptions: popupOptions({ width: 520, height: 720 }) };
      }
      this.onEvent('tab-requested', { url });
      return { action: 'deny' };
    });
  }

  // La teinte est appliquée au moment où la page est servie : changer la
  // couleur ne bouge donc rien tant qu'on ne recharge pas.
  reloadStartPages() {
    for (const [id, view] of this.views) {
      if (!store.getTab(id) || view.webContents.isDestroyed()) continue;
      if (view.webContents.getURL().startsWith('hublink://')) view.webContents.reload();
    }
  }

  /**
   * Pastille annoncée par la page elle-même, via `navigator.setAppBadge()`.
   *
   * On remonte au service depuis le `webContents` émetteur plutôt que de faire
   * confiance à un identifiant transmis par la page : celle-ci ne doit pas
   * pouvoir écrire le compteur d'un autre compte.
   */
  applyBadgeFromApi(webContents, count) {
    const badge = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    for (const [id, view] of this.views) {
      if (view.webContents !== webContents) continue;
      if (!store.getService(id)) return;
      this.pastilleParApi.add(id);
      if (store.updateServiceIfChanged(id, { badge })) this.onEvent('service-meta', { serviceId: id, badge });
      return;
    }
  }

  /**
   * Charge les services exemptés de veille, sans les afficher.
   *
   * Les exempter du balayage ne suffit pas : au démarrage seul le service
   * actif a une page, les autres n'ont donc rien à signaler tant qu'on ne les
   * a pas ouverts une fois. On les monte en arrière-plan, ce qui est
   * précisément ce qu'on a accepté de payer en les marquant.
   */
  async preloadKeepAwake() {
    for (const service of store.load().services) {
      if (!service.keepAwake || this.views.has(service.id)) continue;
      try {
        await this.ensureView(service.id);
      } catch (err) {
        console.error('[views] préchargement impossible', service.name, err);
      }
    }
  }

  /**
   * Suit la présence d'une vidéo dans une vue.
   *
   * `media-started-playing` est un signal natif de Chromium : il évite
   * d'injecter un observateur dans chaque page, et il couvre aussi bien les
   * services que les onglets du navigateur, dont les vues n'ont pas de preload.
   */
  wireMedia(wc, id) {
    wc.on('media-started-playing', () => {
      if (this.avecMedia.has(id)) return;
      this.avecMedia.add(id);
      this.onEvent('media-present', { id, present: true });
    });
    // Une nouvelle page repart sans vidéo tant qu'elle n'en a pas joué.
    wc.on('did-navigate', () => {
      if (!this.avecMedia.delete(id)) return;
      this.onEvent('media-present', { id, present: false });
    });
  }

  /**
   * Ouvre ou ferme l'incrustation vidéo de la vue courante.
   *
   * L'appel doit passer pour un geste utilisateur, sinon Chromium le refuse —
   * d'où le second argument d'`executeJavaScript`. On parcourt aussi les
   * cadres enfants : un lecteur embarqué vit dans une iframe, invisible depuis
   * le cadre principal.
   */
  async togglePictureInPicture() {
    if (!this.current) return 'aucune-vue';
    const code = `(async () => {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return 'ferme';
      }
      const videos = [...document.querySelectorAll('video')];
      const jouee = videos.find((v) => !v.paused && !v.ended);
      const grande = videos
        .slice()
        .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
      const v = jouee || grande;
      if (!v) return 'aucune';
      // Certains sites posent l'attribut pour masquer le bouton du lecteur.
      // La demande vient ici de l'utilisateur, via la barre de l'app.
      if (v.disablePictureInPicture) v.disablePictureInPicture = false;
      try {
        await v.requestPictureInPicture();
        return 'ouvert';
      } catch (e) {
        return 'erreur:' + e.message;
      }
    })()`;

    const wc = this.current.webContents;
    const cadres = [wc.mainFrame, ...wc.mainFrame.framesInSubtree.filter((f) => f !== wc.mainFrame)];
    for (const cadre of cadres) {
      try {
        const r = await cadre.executeJavaScript(code, true);
        if (r && r !== 'aucune') return r;
      } catch {
        // Cadre d'origine tierce inaccessible : on passe au suivant.
      }
    }
    return 'aucune';
  }

  async showTab(tabId) {
    if (!this.window) return;
    const view = await this.ensureTabView(tabId);

    if (this.current && this.current !== view) {
      this.current.setVisible(false);
      this.window.contentView.removeChildView(this.current);
    }
    this.current = view || null;
    this.currentId = view ? tabId : null;
    if (!view) return;

    this.lastActiveAt.set(tabId, Date.now());
    this.window.contentView.addChildView(view);
    view.setBounds(this.bounds);
    view.setVisible(!this.overlay);
    if (!this.overlay) view.webContents.focus();

    const wc = view.webContents;
    this.onEvent('nav-state', {
      serviceId: tabId,
      url: wc.getURL(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      loading: wc.isLoading()
    });
  }

  // Ferme la vue d'un onglet sans toucher au store : l'appelant décide si
  // l'onglet disparaît de la liste ou s'il est seulement mis en veille.
  destroyTab(tabId) {
    const view = this.views.get(tabId);
    if (!view) return;
    if (this.current === view) this.hide();
    view.webContents.close();
    this.views.delete(tabId);
    this.lastActiveAt.delete(tabId);
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
      // Certaines webapps mettent encore le compteur dans le titre. Celles qui
      // utilisent l'API des pastilles font autorité : on ne lit plus le leur.
      if (this.pastilleParApi.has(serviceId)) return;
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

    this.wireMedia(wc, serviceId);

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
    this.pastilleParApi.delete(serviceId);
    if (this.current === view) this.hide();
    view.webContents.close();
    this.views.delete(serviceId);
    this.lastActiveAt.delete(serviceId);
  }

  destroyAccount(accountId) {
    for (const [serviceId] of [...this.views]) {
      // Les onglets du navigateur vivent dans la même Map : sans ce garde-fou,
      // supprimer un compte les fermerait tous.
      if (store.getTab(serviceId)) continue;
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

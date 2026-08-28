const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { isUsableFavicon } = require('./urls');

const FILE = path.join(app.getPath('userData'), 'hublink.config.json');

// La navigation est plate : on ajoute un service, point. Le « compte » n'est
// qu'une session Chromium nommée, choisie dans la fiche du service — deux
// services du même compte partagent leurs cookies (donc un seul login SSO),
// deux comptes différents ne se voient jamais.
const DEFAULT_ACCOUNTS = [
  { name: 'Perso', color: '#3b82f6' },
  { name: 'Travail', color: '#f97316' }
];

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function seed() {
  return {
    version: 2,
    theme: 'system',
    sidebarCollapsed: false,
    sleepAfterMinutes: 20,
    // null = tous les comptes ; sinon on ne voit que celui-ci.
    activeAccountId: null,
    accounts: DEFAULT_ACCOUNTS.map((a) => {
      const id = uid('a');
      return { id, name: a.name, color: a.color, avatar: null, partition: `persist:account-${id}` };
    }),
    services: [],
    activeServiceId: null,
    // Le navigateur neutre : aucun compte, sa propre session, ses onglets.
    browserMode: false,
    tabs: [],
    activeTabId: null,
    // Bloqueur de pub du mode navigateur : actif par défaut, sans réglage à
    // faire. Il ne touche jamais les sessions des comptes.
    blockAds: true,
    // Favoris du mode navigateur, et teinte choisie pour ce mode : sans compte
    // actif, le shell n'a aucune couleur d'où se teinter.
    favorites: [],
    accentColor: null,
    history: [],
    extensions: [],
    window: { width: 1440, height: 900, x: null, y: null, maximized: false }
  };
}

// Les versions précédentes groupaient les services sous des profils. On aplatit
// en conservant chaque session : un profil devient un compte, et ses services
// remontent au premier niveau en gardant leur rattachement.
function migrate(state) {
  if (state.version >= 2 || !Array.isArray(state.profiles)) return state;

  const accounts = [];
  const services = [];
  for (const profile of state.profiles) {
    accounts.push({
      id: profile.id,
      name: profile.name,
      color: profile.color || '#64748b',
      avatar: profile.avatar || null,
      // La partition reste celle d'origine : la renommer pointerait vers un
      // stockage vide et déconnecterait l'utilisateur de tous ses services.
      partition: `persist:profile-${profile.id}`
    });
    for (const service of profile.services || []) {
      services.push({ ...service, accountId: profile.id });
    }
  }

  const active = state.profiles.find((p) => p.id === state.activeProfileId);
  return {
    ...state,
    version: 2,
    accounts,
    services,
    activeServiceId: (active && active.activeServiceId) || (services[0] && services[0].id) || null,
    profiles: undefined,
    activeProfileId: undefined
  };
}

function normalize(state) {
  if (!Array.isArray(state.accounts) || state.accounts.length === 0) {
    state.accounts = seed().accounts;
  }
  if (!Array.isArray(state.services)) state.services = [];
  if (!Array.isArray(state.extensions)) state.extensions = [];
  if (!Array.isArray(state.tabs)) state.tabs = [];
  if (typeof state.browserMode !== 'boolean') state.browserMode = false;
  if (typeof state.blockAds !== 'boolean') state.blockAds = true;
  if (!Array.isArray(state.favorites)) state.favorites = [];
  if (!Array.isArray(state.history)) state.history = [];
  if (typeof state.accentColor !== 'string') state.accentColor = null;
  if (!state.theme) state.theme = 'system';
  if (typeof state.sidebarCollapsed !== 'boolean') state.sidebarCollapsed = false;
  if (typeof state.sleepAfterMinutes !== 'number') state.sleepAfterMinutes = 20;
  if (!state.window) state.window = seed().window;

  delete state.spaces;
  delete state.activeSpaceId;
  for (const account of state.accounts) {
    if (!account.partition) account.partition = `persist:account-${account.id}`;
    delete account.spaceId;
  }
  if (!state.accounts.some((a) => a.id === state.activeAccountId)) state.activeAccountId = null;

  const known = new Set(state.accounts.map((a) => a.id));
  for (const service of state.services) {
    if (!known.has(service.accountId)) service.accountId = state.accounts[0].id;
    if (service.openLinks !== 'app' && service.openLinks !== 'browser') service.openLinks = 'browser';
    if (typeof service.spoofChrome !== 'boolean') service.spoofChrome = true;
    if (typeof service.blockPasskeys !== 'boolean') service.blockPasskeys = true;
    if (typeof service.notifications !== 'boolean') service.notifications = true;
    if (typeof service.keepAwake !== 'boolean') service.keepAwake = false;
    if (service.icon === undefined) service.icon = null;
    if (service.emoji === undefined) service.emoji = null;
    if (typeof service.badge !== 'number') service.badge = 0;
    // Purge les favicons dégénérés enregistrés par les versions précédentes.
    if (service.favicon && !isUsableFavicon(service.favicon)) service.favicon = null;
  }
  if (!state.services.some((s) => s.id === state.activeServiceId)) {
    state.activeServiceId = state.services[0] ? state.services[0].id : null;
  }
  for (const tab of state.tabs) {
    if (typeof tab.title !== 'string') tab.title = '';
    if (tab.favicon && !isUsableFavicon(tab.favicon)) tab.favicon = null;
  }
  if (!state.tabs.some((t) => t.id === state.activeTabId)) {
    state.activeTabId = state.tabs[0] ? state.tabs[0].id : null;
  }
  return state;
}

let state = null;

function load() {
  if (state) return state;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    state = normalize(migrate(raw));
  } catch {
    state = seed();
  }
  save();
  return state;
}

let saveTimer = null;
// Une seconde : rien ici n'est urgent, et `saveNow()` au moment de quitter
// garantit qu'aucune modification ne se perd.
const SAVE_DELAY = 1000;

function write() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[store] écriture impossible', err);
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(write, SAVE_DELAY);
}

function saveNow() {
  clearTimeout(saveTimer);
  write();
}

const getAccount = (id) => load().accounts.find((a) => a.id === id) || null;
const getService = (id) => load().services.find((s) => s.id === id) || null;
const accountOf = (serviceId) => {
  const service = getService(serviceId);
  return service ? getAccount(service.accountId) : null;
};

// Services visibles selon le filtre de compte. `activeAccountId` à null = tout.
function visibleServices() {
  const s = load();
  if (!s.activeAccountId) return s.services;
  return s.services.filter((service) => service.accountId === s.activeAccountId);
}

// --- comptes ---------------------------------------------------------------

function addAccount({ name, color, avatar }) {
  const id = uid('a');
  const account = {
    id,
    name,
    color: color || '#64748b',
    avatar: avatar || null,
    partition: `persist:account-${id}`
  };
  load().accounts.push(account);
  save();
  return account;
}

function updateAccount(id, patch) {
  const account = getAccount(id);
  if (!account) return null;
  Object.assign(account, patch);
  save();
  return account;
}

function removeAccount(id) {
  const s = load();
  if (s.accounts.length <= 1) return [];
  const orphans = s.services.filter((service) => service.accountId === id).map((service) => service.id);
  if (s.activeAccountId === id) s.activeAccountId = null;
  s.accounts = s.accounts.filter((a) => a.id !== id);
  s.services = s.services.filter((service) => service.accountId !== id);
  if (!s.services.some((service) => service.id === s.activeServiceId)) {
    s.activeServiceId = s.services[0] ? s.services[0].id : null;
  }
  save();
  return orphans;
}

// --- services --------------------------------------------------------------

function addService({
  name,
  url,
  accountId,
  openLinks,
  spoofChrome,
  blockPasskeys,
  notifications,
  keepAwake,
  emoji
}) {
  const s = load();
  const service = {
    id: uid('s'),
    name,
    url,
    accountId: getAccount(accountId) ? accountId : s.accounts[0].id,
    favicon: null,
    badge: 0,
    // 'browser' : les liens sortants partent vers le navigateur système.
    // 'app'     : ils s'ouvrent dans Hublink, dans la session du compte.
    openLinks: openLinks === 'app' ? 'app' : 'browser',
    spoofChrome: spoofChrome !== false,
    // Icône choisie à la main ; prioritaire sur le favicon récupéré.
    icon: null,
    emoji: emoji || null,
    blockPasskeys: blockPasskeys !== false,
    notifications: notifications !== false,
    // Exempté de mise en veille : coûte sa mémoire en permanence, et c'est le
    // seul moyen de voir arriver ses non-lus sans ouvrir le service.
    keepAwake: keepAwake === true
  };
  s.services.push(service);
  s.activeServiceId = service.id;
  save();
  return service;
}

function updateService(id, patch) {
  const service = getService(id);
  if (!service) return null;
  Object.assign(service, patch);
  save();
  return service;
}

// Les webapps repeignent leur titre et leur favicon en continu. Écrire sur
// disque et prévenir l'interface à chaque fois coûte cher pour rien : on ne
// bouge que si la valeur diffère réellement.
function updateServiceIfChanged(id, patch) {
  const service = getService(id);
  if (!service) return false;
  const changed = Object.keys(patch).some((key) => service[key] !== patch[key]);
  if (!changed) return false;
  Object.assign(service, patch);
  save();
  return true;
}

function removeService(id) {
  const s = load();
  const index = s.services.findIndex((service) => service.id === id);
  if (index !== -1) rememberRemoved(s.services[index], index);
  s.services = s.services.filter((service) => service.id !== id);
  if (s.activeServiceId === id) s.activeServiceId = s.services[0] ? s.services[0].id : null;
  save();
}

function reorderServices(orderedIds) {
  const s = load();
  const byId = new Map(s.services.map((service) => [service.id, service]));
  const next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  for (const service of s.services) if (!next.includes(service)) next.push(service);
  s.services = next;
  save();
}


// --- navigateur ------------------------------------------------------------

// Page d'accueil du mode navigateur : une page locale aux couleurs de Hublink,
// servie par le schéma `hublink://`. Elle n'exécute aucun script et sa
// recherche n'est qu'un formulaire.
const BROWSER_HOME = 'hublink://start';

function setBrowserMode(on) {
  const s = load();
  s.browserMode = Boolean(on);
  // Entrer dans le navigateur sans onglet donnerait une page vide : on en
  // ouvre un, comme le ferait n'importe quel navigateur au démarrage.
  if (s.browserMode && s.tabs.length === 0) addTab();
  save();
  return s.browserMode;
}

function addTab(url) {
  const s = load();
  const tab = { id: uid('t'), url: url || BROWSER_HOME, title: '', favicon: null };
  s.tabs.push(tab);
  s.activeTabId = tab.id;
  save();
  return tab;
}

function updateTabIfChanged(id, patch) {
  const tab = load().tabs.find((t) => t.id === id);
  if (!tab) return false;
  const changed = Object.keys(patch).some((key) => tab[key] !== patch[key]);
  if (!changed) return false;
  Object.assign(tab, patch);
  save();
  return true;
}

function removeTab(id) {
  const s = load();
  const index = s.tabs.findIndex((t) => t.id === id);
  if (index === -1) return null;
  s.tabs.splice(index, 1);
  // On enchaîne sur le voisin de droite, à défaut celui de gauche : fermer un
  // onglet ne doit pas renvoyer à l'autre bout de la liste.
  if (s.activeTabId === id) {
    const next = s.tabs[index] || s.tabs[index - 1] || null;
    s.activeTabId = next ? next.id : null;
  }
  save();
  return s.activeTabId;
}

const getTab = (id) => load().tabs.find((t) => t.id === id) || null;


function addFavorite({ title, url, favicon }) {
  const s = load();
  // Un même site ne se met en favori qu'une fois : au deuxième clic sur
  // l'étoile, c'est un retrait qu'on attend, pas un doublon.
  const existant = s.favorites.find((f) => f.url === url);
  if (existant) return existant;
  const favori = { id: uid('f'), title: title || '', url, favicon: favicon || null };
  s.favorites.push(favori);
  save();
  return favori;
}

function removeFavoriteByUrl(url) {
  const s = load();
  const avant = s.favorites.length;
  s.favorites = s.favorites.filter((f) => f.url !== url);
  if (s.favorites.length !== avant) save();
}

function removeFavorite(id) {
  const s = load();
  s.favorites = s.favorites.filter((f) => f.id !== id);
  save();
}

function setAccentColor(color) {
  const s = load();
  s.accentColor = color || null;
  save();
}


// --- historique ------------------------------------------------------------

// Assez pour retrouver ce qu'on a vu la semaine dernière, pas assez pour que
// le fichier de configuration enfle — chaque entrée porte un favicon.
const MAX_HISTORIQUE = 300;

/**
 * Note une page visitée.
 *
 * Une même adresse ne s'empile pas : revenir dessus la remonte en tête plutôt
 * que de créer un doublon, sinon l'historique d'une seule session de travail
 * suffirait à noyer celui de la veille.
 */
function addHistory({ url, title, favicon }) {
  if (!url || url.startsWith('hublink://') || url === 'about:blank') return null;
  const s = load();
  const existant = s.history.find((h) => h.url === url);
  if (existant) {
    existant.at = Date.now();
    if (title) existant.title = title;
    if (favicon) existant.favicon = favicon;
    s.history.sort((a, b) => b.at - a.at);
    save();
    return existant;
  }
  const entree = { id: uid('h'), url, title: title || '', favicon: favicon || null, at: Date.now() };
  s.history.unshift(entree);
  if (s.history.length > MAX_HISTORIQUE) s.history.length = MAX_HISTORIQUE;
  save();
  return entree;
}

function removeHistory(id) {
  const s = load();
  s.history = s.history.filter((h) => h.id !== id);
  save();
}

function clearHistory() {
  load().history = [];
  save();
}


// --- sauvegarde de la configuration ----------------------------------------

// Ce qu'on emporte d'une machine à l'autre : les comptes, les services et les
// préférences. Ni cookies ni sessions — ils restent sur le poste, on se
// reconnecte simplement. Ni extensions : leurs fichiers vivent sur le disque
// local, une référence exportée ne pointerait sur rien.
const FORMAT_EXPORT = 1;

function exportConfig() {
  const s = load();
  return {
    format: FORMAT_EXPORT,
    app: 'hublink',
    exportedAt: new Date().toISOString(),
    theme: s.theme,
    sleepAfterMinutes: s.sleepAfterMinutes,
    accentColor: s.accentColor,
    blockAds: s.blockAds,
    accounts: s.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      avatar: a.avatar,
      partition: a.partition
    })),
    services: s.services.map((x) => ({
      id: x.id,
      name: x.name,
      url: x.url,
      accountId: x.accountId,
      icon: x.icon,
      emoji: x.emoji,
      openLinks: x.openLinks,
      spoofChrome: x.spoofChrome,
      blockPasskeys: x.blockPasskeys,
      notifications: x.notifications,
      keepAwake: x.keepAwake
    })),
    favorites: s.favorites
  };
}

/** Refuse un fichier qui n'est pas une sauvegarde Hublink exploitable. */
function validateConfig(data) {
  if (!data || typeof data !== 'object') return 'Fichier illisible';
  if (data.app !== 'hublink') return "Ce fichier n'est pas une sauvegarde Hublink";
  if (Number(data.format) > FORMAT_EXPORT) {
    return 'Sauvegarde créée par une version plus récente de Hublink';
  }
  if (!Array.isArray(data.accounts) || data.accounts.length === 0) return 'Aucun compte à importer';
  if (!Array.isArray(data.services)) return 'Liste de services illisible';
  return null;
}

/**
 * Remplace comptes, services et préférences par ceux d'une sauvegarde.
 *
 * L'ancienne configuration est copiée à côté avant d'être écrasée : importer
 * le mauvais fichier ne doit pas coûter des heures de reconstruction.
 */
function importConfig(data) {
  const erreur = validateConfig(data);
  if (erreur) return { ok: false, erreur };

  try {
    // L'écriture est différée d'une seconde : sans ce vidage, la copie de
    // secours reprendrait un état périmé, voire n'existerait pas du tout.
    saveNow();
    fs.copyFileSync(FILE, `${FILE}.avant-import`);
  } catch (err) {
    console.error('[store] sauvegarde préalable impossible', err);
  }

  const s = load();
  s.accounts = data.accounts.map((a) => ({
    id: a.id || uid('a'),
    name: String(a.name || 'Compte'),
    color: a.color || '#64748b',
    avatar: a.avatar || null,
    partition: a.partition || `persist:account-${a.id || uid('a')}`
  }));
  const connus = new Set(s.accounts.map((a) => a.id));
  s.services = data.services
    .filter((x) => x && x.url)
    .map((x) => ({
      id: x.id || uid('s'),
      name: String(x.name || ''),
      url: String(x.url),
      accountId: connus.has(x.accountId) ? x.accountId : s.accounts[0].id,
      favicon: null,
      badge: 0,
      icon: x.icon || null,
      emoji: x.emoji || null,
      openLinks: x.openLinks === 'app' ? 'app' : 'browser',
      spoofChrome: x.spoofChrome !== false,
      blockPasskeys: x.blockPasskeys !== false,
      notifications: x.notifications !== false,
      keepAwake: x.keepAwake === true
    }));
  s.favorites = Array.isArray(data.favorites) ? data.favorites : [];
  if (typeof data.theme === 'string') s.theme = data.theme;
  if (typeof data.sleepAfterMinutes === 'number') s.sleepAfterMinutes = data.sleepAfterMinutes;
  if (typeof data.accentColor === 'string' || data.accentColor === null) {
    s.accentColor = data.accentColor;
  }
  if (typeof data.blockAds === 'boolean') s.blockAds = data.blockAds;

  s.activeAccountId = null;
  s.activeServiceId = s.services[0] ? s.services[0].id : null;
  saveNow();
  return { ok: true, comptes: s.accounts.length, services: s.services.length };
}

// --- annulation d'une suppression ------------------------------------------

// Un seul niveau : on rattrape le clic malheureux qu'on vient de faire, pas
// une session de ménage.
let dernierSupprime = null;

function rememberRemoved(service, index) {
  dernierSupprime = { service, index };
}

function restoreRemoved() {
  if (!dernierSupprime) return null;
  const { service, index } = dernierSupprime;
  dernierSupprime = null;
  const s = load();
  if (s.services.some((x) => x.id === service.id)) return null;
  if (!s.accounts.some((a) => a.id === service.accountId)) {
    // Le compte a disparu entre-temps : on rattache plutôt que de perdre.
    service.accountId = s.accounts[0].id;
  }
  s.services.splice(Math.min(index, s.services.length), 0, service);
  s.activeServiceId = service.id;
  save();
  return service;
}

module.exports = {
  FILE,
  uid,
  load,
  save,
  saveNow,
  getAccount,
  getService,
  visibleServices,
  accountOf,
  addAccount,
  updateAccount,
  removeAccount,
  addService,
  updateService,
  updateServiceIfChanged,
  removeService,
  reorderServices,
  BROWSER_HOME,
  setBrowserMode,
  addTab,
  getTab,
  updateTabIfChanged,
  removeTab,
  addFavorite,
  removeFavorite,
  removeFavoriteByUrl,
  setAccentColor,
  addHistory,
  removeHistory,
  clearHistory,
  exportConfig,
  importConfig,
  rememberRemoved,
  restoreRemoved
};

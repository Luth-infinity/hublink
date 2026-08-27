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
  { name: 'Avanteam', color: '#3b82f6' },
  { name: "L'Oréal", color: '#c8a44d' },
  { name: 'Valiuz', color: '#8b5cf6' },
  { name: 'Posidea', color: '#f97316' }
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
    if (service.icon === undefined) service.icon = null;
    if (service.emoji === undefined) service.emoji = null;
    if (typeof service.badge !== 'number') service.badge = 0;
    // Purge les favicons dégénérés enregistrés par les versions précédentes.
    if (service.favicon && !isUsableFavicon(service.favicon)) service.favicon = null;
  }
  if (!state.services.some((s) => s.id === state.activeServiceId)) {
    state.activeServiceId = state.services[0] ? state.services[0].id : null;
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

function addService({ name, url, accountId, openLinks, spoofChrome, blockPasskeys, notifications, emoji }) {
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
    notifications: notifications !== false
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
  reorderServices
};

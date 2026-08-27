const { app, net, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const unzip = require('./unzip');

const EXT_ROOT = path.join(app.getPath('userData'), 'extensions');

// Point de mise à jour public du Chrome Web Store : renvoie le .crx d'une extension.
// `prodversion` doit refléter le Chromium reellement embarqué : le Store renvoie
// un 204 vide (et non une erreur) des qu'il juge la version trop ancienne.
const CWS_CRX = (id) =>
  'https://clients2.google.com/service/update2/crx' +
  '?response=redirect&prod=chromiumcrx&prodchannel=unknown&acceptformat=crx2,crx3' +
  `&prodversion=${process.versions.chrome}` +
  `&x=id%3D${id}%26installsource%3Dondemand%26uc`;

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'extension';

function extractCwsId(input) {
  const trimmed = input.trim();
  if (/^[a-p]{32}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/([a-p]{32})/);
  if (!m) throw new Error("Identifiant Chrome Web Store introuvable dans cette valeur");
  return m[1];
}

// Les extensions du Store utilisent souvent "__MSG_appName__" : il faut aller
// chercher la vraie chaine dans _locales/<default_locale>/messages.json.
function resolveI18n(value, dir, defaultLocale) {
  const m = /^__MSG_(.+)__$/.exec(value || '');
  if (!m || !defaultLocale) return value;
  try {
    const file = path.join(dir, '_locales', defaultLocale, 'messages.json');
    const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
    const key = Object.keys(messages).find((k) => k.toLowerCase() === m[1].toLowerCase());
    return key ? messages[key].message : value;
  } catch {
    return value;
  }
}

function readManifest(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  return {
    manifest,
    name: resolveI18n(manifest.name, dir, manifest.default_locale) || 'Extension',
    version: manifest.version || '0.0.0',
    manifestVersion: manifest.manifest_version || 2,
    // Conservées pour prévenir l'utilisateur quand l'extension dépend d'une API
    // qu'Electron n'implémente pas : elle se charge, mais reste inerte.
    permissions: Array.isArray(manifest.permissions) ? manifest.permissions : []
  };
}

function register(dir, source) {
  const info = readManifest(dir);
  const state = store.load();
  const existing = state.extensions.find((e) => e.dir === dir);
  const record = existing || { id: store.uid('x'), dir, enabled: {} };
  Object.assign(record, {
    name: info.name,
    version: info.version,
    manifestVersion: info.manifestVersion,
    permissions: info.permissions,
    source
  });
  if (!existing) state.extensions.push(record);
  store.save();
  return record;
}

function installFromDirectory(sourceDir) {
  if (!fs.existsSync(path.join(sourceDir, 'manifest.json'))) {
    throw new Error("Ce dossier ne contient pas de manifest.json");
  }
  const info = readManifest(sourceDir);
  const dest = path.join(EXT_ROOT, `${slugify(info.name)}-${Date.now().toString(36)}`);
  fs.mkdirSync(EXT_ROOT, { recursive: true });
  fs.cpSync(sourceDir, dest, { recursive: true });
  cleanup(dest);
  return register(dest, { type: 'folder', origin: sourceDir });
}

function installFromArchive(buffer, source) {
  const staging = path.join(EXT_ROOT, `.staging-${Date.now().toString(36)}`);
  fs.mkdirSync(staging, { recursive: true });
  try {
    unzip.extract(buffer, staging);
    // Certaines archives encapsulent l'extension dans un sous-dossier unique.
    let root = staging;
    if (!fs.existsSync(path.join(root, 'manifest.json'))) {
      const entries = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
      const nested = entries.find((e) => fs.existsSync(path.join(root, e.name, 'manifest.json')));
      if (!nested) throw new Error("Aucun manifest.json dans l'archive");
      root = path.join(root, nested.name);
    }
    cleanup(root);
    const info = readManifest(root);
    const dest = path.join(EXT_ROOT, `${slugify(info.name)}-${Date.now().toString(36)}`);
    fs.cpSync(root, dest, { recursive: true });
    fs.rmSync(staging, { recursive: true, force: true });
    return register(dest, source);
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
}

// Chrome refuse une extension unpacked qui garde ses signatures de Store ;
// on retire donc _metadata avant de la charger.
function cleanup(dir) {
  fs.rmSync(path.join(dir, '_metadata'), { recursive: true, force: true });
}

async function installFromStore(input) {
  const id = extractCwsId(input);
  const res = await net.fetch(CWS_CRX(id), { redirect: 'follow' });
  if (res.status === 204) {
    throw new Error(`Le Store ne propose aucune version compatible pour ${id}`);
  }
  if (!res.ok) throw new Error(`Téléchargement refusé par le Store (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 100) throw new Error('Extension introuvable sur le Chrome Web Store');
  return installFromArchive(buffer, { type: 'store', id });
}

function remove(extensionId) {
  const state = store.load();
  const record = state.extensions.find((e) => e.id === extensionId);
  if (!record) return;
  if (record.dir.startsWith(EXT_ROOT)) fs.rmSync(record.dir, { recursive: true, force: true });
  state.extensions = state.extensions.filter((e) => e.id !== extensionId);
  store.save();
}

const isEnabled = (record, accountId) => record.enabled[accountId] !== false;

function setEnabled(extensionId, accountId, enabled) {
  const record = store.load().extensions.find((e) => e.id === extensionId);
  if (!record) return;
  record.enabled[accountId] = enabled;
  store.save();
}

// Charge dans une session toutes les extensions activées pour ce compte.
// A appeler avant la premiere navigation de la session.
async function applyToSession(session, accountId) {
  const records = store.load().extensions;
  const loaded = new Map(session.extensions.getAllExtensions().map((e) => [e.path, e]));
  const results = [];

  for (const record of records) {
    const wanted = isEnabled(record, accountId);
    const already = loaded.get(record.dir);

    if (wanted && !already) {
      if (!fs.existsSync(path.join(record.dir, 'manifest.json'))) {
        results.push({ id: record.id, ok: false, error: 'Dossier introuvable' });
        continue;
      }
      try {
        // Pas d'`allowFileAccess` : cela ouvrirait les URL file:// du poste à
        // du code d'extension tiers, sans utilité pour des webapps.
        const ext = await session.extensions.loadExtension(record.dir);
        results.push({ id: record.id, ok: true, chromeId: ext.id });
      } catch (err) {
        results.push({ id: record.id, ok: false, error: err.message });
      }
    } else if (!wanted && already) {
      session.extensions.removeExtension(already.id);
    }
  }
  return results;
}

// Electron n'affiche pas de barre d'extensions : on ouvre le popup nous-memes.
function openPopup(session, chromeExtensionId, parent) {
  const ext = session.extensions.getAllExtensions().find((e) => e.id === chromeExtensionId);
  if (!ext) throw new Error('Extension non chargée dans ce profil');
  const action = ext.manifest.action || ext.manifest.browser_action || {};
  const popup = action.default_popup;
  if (!popup) throw new Error(`${ext.name} n'expose pas de popup`);

  const win = new BrowserWindow({
    parent,
    width: 420,
    height: 600,
    resizable: true,
    minimizable: false,
    maximizable: false,
    title: ext.name,
    webPreferences: { session, contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadURL(`chrome-extension://${ext.id}/${popup.replace(/^\//, '')}`);
  return win;
}

module.exports = {
  EXT_ROOT,
  installFromDirectory,
  installFromArchive,
  installFromStore,
  remove,
  setEnabled,
  isEnabled,
  applyToSession,
  openPopup
};

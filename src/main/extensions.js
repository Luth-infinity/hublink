const { app, net, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const store = require('./store');
const { t } = require('./i18n');
const unzip = require('./unzip');
const crx = require('./crx');
const stockage = require('./stockage-ext');
const { versChrome } = require('./webrequest-ext');

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
  if (!m) throw new Error(t("Identifiant Chrome Web Store introuvable dans cette valeur"));
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
    throw new Error(t("Ce dossier ne contient pas de manifest.json"));
  }
  const info = readManifest(sourceDir);
  const dest = path.join(EXT_ROOT, `${slugify(info.name)}-${Date.now().toString(36)}`);
  fs.mkdirSync(EXT_ROOT, { recursive: true });
  fs.cpSync(sourceDir, dest, { recursive: true });
  cleanup(dest);
  return register(dest, { type: 'folder', origin: sourceDir });
}

function installFromArchive(buffer, source) {
  // Un paquet du Store doit porter ses deux signatures : sans cela, une réponse
  // falsifiée sur le chemin installerait n'importe quel code avec les droits
  // d'une extension. Un .crx choisi à la main peut venir d'ailleurs.
  const estCrx = buffer.subarray(0, 4).toString('binary') === 'Cr24';
  const signe = estCrx ? crx.verifier(buffer, source.type === 'store' ? { id: source.id } : {}) : null;
  if (source.type === 'store' && !signe?.ok) {
    throw new Error(t("Paquet d'extension refusé : {raison}", { raison: signe ? signe.raison : 'pas un CRX' }));
  }
  const staging = path.join(EXT_ROOT, `.staging-${Date.now().toString(36)}`);
  fs.mkdirSync(staging, { recursive: true });
  try {
    unzip.extract(buffer, staging);
    // Certaines archives encapsulent l'extension dans un sous-dossier unique.
    let root = staging;
    if (!fs.existsSync(path.join(root, 'manifest.json'))) {
      const entries = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
      const nested = entries.find((e) => fs.existsSync(path.join(root, e.name, 'manifest.json')));
      if (!nested) throw new Error(t("Aucun manifest.json dans l'archive"));
      root = path.join(root, nested.name);
    }
    cleanup(root);
    if (signe?.ok) poserCle(root, signe.cle);
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

// Chargée depuis un dossier, une extension prend un identifiant tiré du chemin,
// pas celui du Store. Dashlane s'y perd : son application web et ses pages
// s'adressent à son identifiant officiel. La clé du développeur, posée dans le
// manifest, le lui rend — c'est ce que fait Chrome à l'installation.
function poserCle(dir, cle) {
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.key = cle.toString('base64');
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}

async function installFromStore(input) {
  const id = extractCwsId(input);
  const res = await net.fetch(CWS_CRX(id), { redirect: 'follow' });
  if (res.status === 204) {
    throw new Error(t('Le Store ne propose aucune version compatible pour {id}', { id }));
  }
  if (!res.ok) throw new Error(t('Téléchargement refusé par le Store (HTTP {code})', { code: res.status }));
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 100) throw new Error(t('Extension introuvable sur le Chrome Web Store'));
  return installFromArchive(buffer, { type: 'store', id });
}

/** L'icône d'une extension, lue dans son dossier, qu'elle soit chargée ou non. */
function icone(dir) {
  try {
    const icons = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).icons || {};
    const tailles = Object.keys(icons).map(Number).sort((a, b) => a - b);
    const taille = tailles.find((n) => n >= 32) ?? tailles[tailles.length - 1];
    if (!taille) return null;
    const image = nativeImage.createFromPath(path.join(dir, icons[taille]));
    return image.isEmpty() ? null : image.resize({ width: 32, height: 32 }).toDataURL();
  } catch {
    return null;
  }
}

/**
 * Les extensions du Store installées avant la 0.7.1 n'ont pas de clé : elles
 * tournent sous un identifiant tiré de leur dossier, ce qui casse Dashlane. On
 * les retélécharge une fois — signature vérifiée, clé posée — en gardant leurs
 * réglages par client. Rend vrai si quelque chose a changé.
 */
async function rattraperCles() {
  let change = false;
  for (const record of [...store.load().extensions]) {
    if (record.source?.type !== 'store') continue;
    try {
      if (JSON.parse(fs.readFileSync(path.join(record.dir, 'manifest.json'), 'utf8')).key) continue;
      const neuf = await installFromStore(record.source.id);
      neuf.enabled = record.enabled;
      remove(record.id);
      change = true;
    } catch (err) {
      console.warn('[extensions] rattrapage de clé', record.name, err.message);
    }
  }
  return change;
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

// --- API chrome.* (electron-chrome-extensions) ----------------------------
//
// Electron ne fournit qu'une poignée d'API d'extension : sans la lib, Dashlane
// se charge mais ne voit aucun onglet, n'ouvre pas son popup correctement et ne
// remplit rien. Chaque session (compte ou navigateur) a son instance.

const branchees = new Map(); // session → ElectronChromeExtensions
// La lib rappelle selectTab même quand c'est nous qui l'informons (addTab marque
// l'onglet ajouté comme actif). Seuls les appels venus d'une extension
// (chrome.tabs.update…) doivent remonter au pont.
let interne = false;
const enInterne = (f) => {
  interne = true;
  try {
    return f();
  } finally {
    interne = false;
  }
};
let pont = null;

/**
 * Le principal se présente ici, pour que les extensions puissent ouvrir,
 * activer et fermer des onglets.
 * { creerOnglet(details, session) → Promise<[WebContents, BaseWindow]>,
 *   activerOnglet(wc), fermerOnglet(wc), fenetre() → BaseWindow }
 */
function definirPont(p) {
  pont = p;
}

// Sous Windows avec un affichage mis à l'échelle (125 %…), la fenêtre du popup
// n'obtient pas la taille que la lib lui donne : Dashlane (350 × 561) s'ouvrait
// en 323 × 548, coupé à droite et en bas. On reprend le dimensionnement : la
// taille préférée de Chromium, corrigée d'après ce que la page voit vraiment,
// une passe à la fois.
const LIMITE_POPUP = { width: 800, height: 600 };

// Le placement de la lib (updatePosition) réapplique les dimensions extérieures,
// que Windows rogne de son cadre invisible : on place sans toucher à la taille.
function placer(popup) {
  const win = popup.browserWindow;
  const parent = popup.parent;
  if (!win || !parent || parent.isDestroyed()) return;
  const fen = parent.getBounds();
  const barre = fen.height - parent.getContentBounds().height;
  const vue = win.getBounds();
  const a = popup.anchorRect;
  let x = fen.x + a.x + a.width - vue.width;
  let y = fen.y + barre + a.y + a.height + 5;
  if (popup.alignment?.includes('right')) x = fen.x + a.x;
  if (popup.alignment?.includes('top')) y = fen.y + barre - vue.height + a.y - 5;
  win.setPosition(Math.floor(x), Math.floor(y));
}

function ajusterPopup(popup) {
  const win = popup.browserWindow;
  if (!win) return;
  win.webContents.off('preferred-size-changed', popup.updatePreferredSize);
  // Non redimensionnable, la fenêtre est bornée à sa taille (minimum = maximum)
  // et Windows la rogne de son cadre à chaque reverrouillage : on la laisse
  // libre. Elle se ferme de toute façon dès qu'elle perd le focus.
  win.setResizable(true);
  const lire = () =>
    win.webContents
      .executeJavaScript('[document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight]')
      .catch(() => null);
  let enCours = false;
  let encore = false;
  let prefere = { width: 0, height: 0 };
  const dimensionner = async (_e, taille) => {
    if (taille) prefere = taille;
    if (enCours) {
      encore = true;
      return;
    }
    enCours = true;
    try {
      for (let passe = 0; passe < 4; passe++) {
        if (popup.isDestroyed() || win.isDestroyed()) return;
        const m = await lire();
        if (!m || popup.isDestroyed() || win.isDestroyed()) return;
        const [w, h, vw, vh] = m;
        // La taille préférée de Chromium est juste ; la page la complète si elle
        // déborde encore (arrondis de l'échelle).
        const voulu = {
          width: Math.min(Math.max(prefere.width, w > vw ? w : 0, 1), LIMITE_POPUP.width),
          height: Math.min(Math.max(prefere.height, h > vh ? h : 0, 1), LIMITE_POPUP.height)
        };
        if (vw === voulu.width && vh === voulu.height) break;
        const [cw, ch] = win.getContentSize();
        win.setContentSize(Math.max(1, cw + voulu.width - vw), Math.max(1, ch + voulu.height - vh));
        await new Promise((r) => setTimeout(r, 30));
      }
      if (popup.isDestroyed() || win.isDestroyed()) return;
      placer(popup);
      if (popup.hidden) popup.show();
    } finally {
      enCours = false;
      if (encore) {
        encore = false;
        dimensionner();
      }
    }
  };
  win.webContents.on('preferred-size-changed', dimensionner);
  win.webContents.on('did-finish-load', dimensionner);

  // La lib ne ferme le popup que s'il perd le focus au profit d'une fenêtre de
  // Hublink. Parti vers une autre app, il restait ouvert, et n'ayant plus de
  // focus à perdre, plus rien ne le fermait. Revenir dans Hublink le ferme, Échap aussi.
  const parent = popup.parent;
  const fermer = () => popup.destroy();
  if (parent && !parent.isDestroyed()) {
    parent.on('focus', fermer);
    win.once('closed', () => !parent.isDestroyed() && parent.off('focus', fermer));
  }
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') fermer();
  });
}

/** À appeler avant de charger la moindre extension dans la session. */
function brancherSession(ses) {
  if (branchees.has(ses)) return;
  // Avant la lib : son preload fige `chrome` une fois ses API posées.
  ses.registerPreloadScript({
    id: 'hublink-webrequest',
    type: 'service-worker',
    filePath: path.join(__dirname, '..', 'preload', 'webrequest-ext.js')
  });
  const ece = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    createTab: (details) => pont.creerOnglet(details, ses),
    selectTab: (wc) => !interne && pont.activerOnglet(wc),
    removeTab: (wc) => pont.fermerOnglet(wc),
    createWindow: async (details) => {
      const url = [].concat(details.url || [])[0];
      if (url) {
        const [, fenetre] = await pont.creerOnglet({ url, active: true }, ses);
        return fenetre;
      }
      return pont.fenetre();
    }
  });
  ece.on('browser-action-popup-created', ajusterPopup);
  // Après celui de la lib : chrome.privacy qui répond (privacy-ext.js), et un
  // chrome.storage commun à tous les clients (stockage-ext.js) — Dashlane n'a
  // ainsi qu'une connexion pour tous.
  for (const type of ['frame', 'service-worker']) {
    for (const nom of ['privacy', 'stockage']) {
      ses.registerPreloadScript({
        id: `hublink-${nom}-${type}`,
        type,
        filePath: path.join(__dirname, '..', 'preload', `${nom}-ext.js`)
      });
    }
  }
  stockage.brancher(ses);
  branchees.set(ses, ece);
}

/**
 * Relaie une requête aux extensions qui écoutent webRequest.onBeforeRequest.
 *
 * chrome.webRequest n'émet rien dans Electron 41 : Dashlane s'en sert pour
 * savoir quel cadre contient quel autre, et sans lui n'en remplit aucun.
 */
function diffuserRequete(ses, details) {
  const router = branchees.get(ses)?.ctx.router;
  if (!router?.listeners.get('webRequest.onBeforeRequest')?.length) return;
  // Sans webContents, la requête vient d'un service worker : pas d'onglet (-1).
  router.broadcastEvent('webRequest.onBeforeRequest', versChrome(details, Boolean(details.webContents)));
}

const instanceDe = (wc) => branchees.get(wc.session);

function ajouterOnglet(wc, fenetre) {
  enInterne(() => instanceDe(wc)?.addTab(wc, fenetre));
}

function retirerOnglet(wc) {
  if (!wc.isDestroyed()) instanceDe(wc)?.removeTab(wc);
}

function activerOnglet(wc) {
  if (wc.isDestroyed()) return;
  enInterne(() => instanceDe(wc)?.selectTab(wc));
  surligner(wc);
}

/**
 * Dit aux extensions que l'onglet est celui qu'on regarde (tabs.onHighlighted).
 *
 * Electron remplit lui-même `sender.tab` des messages d'un script de contenu,
 * sans jamais le dire actif ni surligné. Dashlane en déduit que la page n'est
 * pas au premier plan et n'analyse pas ses champs : pas de remplissage. Il
 * reprend sur `tabs.onHighlighted`, que la lib n'émet pas. On l'émet donc à
 * l'activation et après chaque chargement de page ou de cadre — le script de
 * contenu d'un nouveau document repart chaque fois de « inactif ».
 */
function surligner(wc) {
  const ece = instanceDe(wc);
  if (!ece || wc.isDestroyed()) return;
  const fenetre = ece.ctx.store.tabToWindow.get(wc);
  ece.ctx.router.broadcastEvent('tabs.onHighlighted', {
    tabIds: [wc.id],
    windowId: fenetre && !fenetre.isDestroyed() ? fenetre.id : -1
  });
}

/** Les entrées que les extensions ont ajoutées (chrome.contextMenus). */
function menuContextuel(wc, params) {
  return instanceDe(wc)?.getContextMenuItems(wc, params) || [];
}

// Electron n'affiche pas de barre d'extensions : le bouton de la barre d'outils
// en tient lieu. La lib ouvre le popup sous `anchorRect` (coordonnées du shell),
// ou envoie action.onClicked à l'extension qui n'en a pas.
function openPopup(wc, chromeExtensionId, anchorRect, alignment) {
  const ece = instanceDe(wc);
  if (!ece || !wc.session.extensions.getExtension(chromeExtensionId)) {
    throw new Error(t('Extension non chargée dans ce profil'));
  }
  ece.api.browserAction.activateClick({
    eventType: 'click',
    extensionId: chromeExtensionId,
    tabId: wc.id,
    anchorRect,
    alignment
  });
}

module.exports = {
  EXT_ROOT,
  installFromDirectory,
  installFromArchive,
  installFromStore,
  rattraperCles,
  remove,
  setEnabled,
  isEnabled,
  icone,
  applyToSession,
  openPopup,
  definirPont,
  brancherSession,
  diffuserRequete,
  ajouterOnglet,
  retirerOnglet,
  activerOnglet,
  surligner,
  menuContextuel
};

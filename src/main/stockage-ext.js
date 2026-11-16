const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Un seul chrome.storage (local et session) par extension, pour tous les clients.
 *
 * Chaque client a sa partition, et Chromium y range le stockage des extensions :
 * Dashlane se connectait donc client par client. Son service worker garde tout
 * son état dans storage.local (appareil enregistré, clés) et storage.session
 * (état déverrouillé, qu'un service worker MV3 tué au bout de 30 s doit
 * retrouver). Partagés, le Dashlane d'un autre client démarre comme celui-ci
 * redémarrerait : connecté et déverrouillé.
 *
 * `preload/stockage-ext.js` remplace chrome.storage dans les pages et service
 * workers d'extension ; l'identifiant de l'extension se lit sur l'adresse de
 * l'appelant, jamais dans sa demande.
 */

const DOSSIER = () => path.join(app.getPath('userData'), 'extensions-stockage');
const fichier = (id) => path.join(DOSSIER(), `${id}.json`);

const zones = new Map(); // id → { local, session, amorce }
const abonnes = new Map(); // id → Set<{ send(canal, ...args) }>
const ecritures = new Map(); // id → minuteur

function donnees(id) {
  let d = zones.get(id);
  if (!d) {
    let local = null;
    try {
      local = JSON.parse(fs.readFileSync(fichier(id), 'utf8'));
    } catch {
      // Jamais enregistré : le premier client qui démarre l'amorcera.
    }
    d = { local: local || {}, session: {}, amorce: Boolean(local) };
    zones.set(id, d);
  }
  return d;
}

// Écrit à part puis renomme : une coupure en pleine écriture ne doit pas
// laisser un fichier tronqué, qui déconnecterait Dashlane partout.
function ecrire(id) {
  ecritures.delete(id);
  fs.mkdirSync(DOSSIER(), { recursive: true });
  const tmp = `${fichier(id)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(zones.get(id).local), { mode: 0o600 });
  fs.renameSync(tmp, fichier(id));
}

function enregistrer(id) {
  clearTimeout(ecritures.get(id));
  ecritures.set(id, setTimeout(() => ecrire(id), 300));
}

app.on('will-quit', () => {
  for (const [id, minuteur] of ecritures) {
    clearTimeout(minuteur);
    ecrire(id);
  }
});

function lire(zone, cles) {
  if (cles == null) return { ...zone };
  if (typeof cles === 'string') cles = [cles];
  if (Array.isArray(cles)) return Object.fromEntries(cles.filter((k) => k in zone).map((k) => [k, zone[k]]));
  return Object.fromEntries(Object.entries(cles).map(([k, defaut]) => [k, k in zone ? zone[k] : defaut]));
}

function diffuser(id, nom, changes) {
  for (const abonne of abonnes.get(id) || []) {
    // Un cadre fermé (popup refermé, page rechargée) ne reçoit plus rien.
    if (abonne.detached || abonne.isDestroyed?.()) {
      abonnes.get(id).delete(abonne);
      continue;
    }
    try {
      abonne.send('hublink-stockage-change', nom, changes);
    } catch {
      abonnes.get(id).delete(abonne);
    }
  }
}

function operer(id, { zone: nom, op, arg }, abonne) {
  const d = donnees(id);
  if (op === 'ecouter') {
    if (!abonnes.has(id)) abonnes.set(id, new Set());
    abonnes.get(id).add(abonne);
    return null;
  }
  // Le premier démarrage après la mise à jour reprend ce que la session de ce
  // client contenait déjà : une connexion existante n'est pas perdue.
  if (op === 'amorcer') {
    if (!d.amorce) {
      d.amorce = true;
      if (!Object.keys(d.local).length && arg && Object.keys(arg).length) {
        d.local = JSON.parse(JSON.stringify(arg));
        enregistrer(id);
      }
    }
    return { ...d.local };
  }
  if (nom !== 'local' && nom !== 'session') return null;
  const zone = d[nom];
  const changes = {};
  const changer = (k, v) => {
    const ancien = zone[k];
    if (v === undefined) {
      if (!(k in zone)) return;
      delete zone[k];
      changes[k] = { oldValue: ancien };
      return;
    }
    // chrome.storage sérialise en JSON, et ne signale pas une valeur inchangée.
    const texte = JSON.stringify(v);
    if (texte === undefined || texte === JSON.stringify(ancien)) return;
    zone[k] = JSON.parse(texte);
    changes[k] = ancien === undefined ? { newValue: zone[k] } : { oldValue: ancien, newValue: zone[k] };
  };
  switch (op) {
    case 'get':
      return lire(zone, arg);
    case 'getKeys':
      return Object.keys(zone);
    case 'getBytesInUse':
      return Buffer.byteLength(JSON.stringify(arg == null ? zone : lire(zone, arg)));
    case 'set':
      for (const [k, v] of Object.entries(arg || {})) changer(k, v);
      break;
    case 'remove':
      for (const k of [].concat(arg ?? [])) changer(k, undefined);
      break;
    case 'clear':
      for (const k of Object.keys(zone)) changer(k, undefined);
      break;
    default:
      return null;
  }
  if (Object.keys(changes).length) {
    if (nom === 'local') enregistrer(id);
    diffuser(id, nom, changes);
  }
  return null;
}

function idExtension(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'chrome-extension:' ? u.host : null;
  } catch {
    return null;
  }
}

// Pages et cadres d'extension (popup, menu de remplissage posé dans une page).
ipcMain.handle('hublink-stockage', (event, demande) => {
  const cadre = event.senderFrame;
  const id = cadre && idExtension(cadre.url);
  if (!id) throw new Error('stockage réservé aux extensions');
  return operer(id, demande, cadre);
});

// Les service workers parlent à leur propre canal, pas à ipcMain.
const workersVus = new WeakSet();
function brancher(ses) {
  ses.serviceWorkers.on('running-status-changed', ({ runningStatus, versionId }) => {
    if (runningStatus !== 'starting') return;
    const worker = ses.serviceWorkers.getWorkerFromVersionID(versionId);
    const id = worker && idExtension(worker.scope);
    if (!id || workersVus.has(worker)) return;
    workersVus.add(worker);
    worker.ipc.handle('hublink-stockage', (_e, demande) => operer(id, demande, worker));
  });
}

module.exports = { brancher, operer };

/**
 * Preload de session, dans les seules pages d'extension et leurs service
 * workers : chrome.storage.local et .session passent par le stockage commun à
 * tous les clients (src/main/stockage-ext.js).
 *
 * `chrome` est figé par la lib, pas `chrome.storage` : on remplace ses zones.
 * Les écritures de storage.local sont recopiées dans le stockage natif de la
 * session, que lisent les scripts de contenu posés dans les pages — ce preload
 * ne les atteint pas.
 */
const { contextBridge, ipcRenderer } = require('electron');

const estExtension =
  process.type === 'service-worker' ||
  (typeof location !== 'undefined' && location.href.startsWith('chrome-extension://'));

if (estExtension) {
  try {
    contextBridge.exposeInMainWorld('hublinkStockage', {
      appeler: (zone, op, arg) => ipcRenderer.invoke('hublink-stockage', { zone, op, arg }),
      ecouter: (fn) => {
        ipcRenderer.on('hublink-stockage-change', (_e, zone, changes) => fn(zone, changes));
        return ipcRenderer.invoke('hublink-stockage', { op: 'ecouter' });
      }
    });
    contextBridge.executeInMainWorld({
      func: () => {
        const pont = globalThis.hublinkStockage;
        delete globalThis.hublinkStockage;
        const storage = globalThis.chrome && globalThis.chrome.storage;
        if (!pont || !storage || !storage.local) return;
        const natif = storage.local;

        const ecouteurs = { local: new Set(), session: new Set(), tous: new Set() };
        const evenement = (fns) => ({
          addListener: (f) => fns.add(f),
          removeListener: (f) => fns.delete(f),
          hasListener: (f) => fns.has(f),
          hasListeners: () => fns.size > 0
        });
        const prevenir = (fns, ...args) => {
          for (const f of fns) {
            try {
              f(...args);
            } catch (e) {
              console.error(e);
            }
          }
        };
        pont.ecouter((zone, changes) => {
          prevenir(ecouteurs[zone] || [], changes);
          prevenir(ecouteurs.tous, changes, zone);
        });

        // Promesse sans rappel, rappel sinon : les deux formes de chrome.*.
        const zone = (nom) => {
          const appeler = (op, arg, rappel) => {
            const p = pont.appeler(nom, op, arg);
            if (typeof rappel !== 'function') return p;
            p.then(rappel, (e) => console.error('chrome.storage', e));
            return undefined;
          };
          const lecture = (op) => (cles, rappel) =>
            typeof cles === 'function' ? appeler(op, null, cles) : appeler(op, cles ?? null, rappel);
          const miroir = (f) => nom === 'local' && f().catch(() => {});
          return {
            get: lecture('get'),
            getBytesInUse: lecture('getBytesInUse'),
            getKeys: (rappel) => appeler('getKeys', null, rappel),
            set: (items, rappel) => {
              miroir(() => natif.set(items));
              return appeler('set', items, rappel);
            },
            remove: (cles, rappel) => {
              miroir(() => natif.remove(cles));
              return appeler('remove', cles, rappel);
            },
            clear: (rappel) => {
              miroir(() => natif.clear());
              return appeler('clear', null, rappel);
            },
            setAccessLevel: (_details, rappel) => appeler('setAccessLevel', null, rappel),
            onChanged: evenement(ecouteurs[nom]),
            QUOTA_BYTES: 10485760
          };
        };

        const poser = (cle, valeur) =>
          Object.defineProperty(storage, cle, { value: valeur, enumerable: true, configurable: true });
        poser('local', zone('local'));
        if (storage.session) poser('session', zone('session'));
        poser('onChanged', evenement(ecouteurs.tous));

        // Au démarrage du service worker : le stockage commun reprend celui de
        // la session s'il est vide, puis la session reçoit le commun.
        if (typeof ServiceWorkerGlobalScope !== 'undefined') {
          natif
            .get(null)
            .then(async (avant) => {
              const commun = await pont.appeler('local', 'amorcer', avant);
              await natif.set(commun);
              const enTrop = Object.keys(avant).filter((k) => !(k in commun));
              if (enTrop.length) await natif.remove(enTrop);
            })
            .catch((e) => console.error('chrome.storage', e));
        }
      }
    });
  } catch (e) {
    console.error('stockage-ext', e);
  }
}

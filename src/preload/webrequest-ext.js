/*
 * Preload des service workers d'extension : des événements que la lib
 * electron-chrome-extensions n'a pas, alimentés par le principal :
 * - chrome.webRequest.onBeforeRequest (src/main/webrequest-ext.js) ;
 * - chrome.tabs.onHighlighted (extensions.surligner) : sans lui, Dashlane
 *   croit l'onglet inactif et n'analyse pas les champs.
 * Enregistré AVANT celui de la lib, qui recopie l'objet existant
 * (`{ ...base }`) avant de figer `chrome`.
 */
const { contextBridge, ipcRenderer } = require('electron');

const EVENEMENT = 'webRequest.onBeforeRequest';

if (process.type === 'service-worker') {
  contextBridge.exposeInMainWorld('hublinkWebRequest', {
    ecouter(extensionId, fn, evenement = EVENEMENT) {
      ipcRenderer.on(`crx-${evenement}`, (_e, ...args) => fn(...args));
      ipcRenderer.send('crx-add-listener', extensionId, evenement);
    }
  });
  contextBridge.executeInMainWorld({
    func: () => {
      const pont = globalThis.hublinkWebRequest;
      delete globalThis.hublinkWebRequest;
      const chrome = globalThis.chrome;
      if (!chrome?.runtime?.id) return;

      // Un événement de Chrome minimal, relié au routeur de la lib au premier écouteur.
      const evenement = (nom) => {
        const fns = new Set();
        let branche = false;
        return {
          addListener(fn) {
            if (!branche && (branche = true)) pont.ecouter(chrome.runtime.id, (...a) => fns.forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }), nom);
            fns.add(fn);
          },
          removeListener: (fn) => fns.delete(fn),
          hasListener: (fn) => fns.has(fn),
          hasListeners: () => fns.size > 0
        };
      };
      if (chrome.tabs) {
        Object.defineProperty(chrome, 'tabs', {
          value: { ...chrome.tabs, onHighlighted: evenement('tabs.onHighlighted') },
          enumerable: true,
          configurable: true
        });
      }
      if (!chrome.webRequest) return;

      // Motifs d'URL de Chrome (« *://*.exemple.fr/* », « <all_urls> »), en
      // version simple : `*` vaut n'importe quelle suite de caractères.
      const correspond = (motif, url) =>
        motif === '<all_urls>' ||
        new RegExp(`^${motif.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(url);
      const accepte = (filtre, d) =>
        (!filtre.urls || filtre.urls.some((m) => correspond(m, d.url))) &&
        (!filtre.types || filtre.types.includes(d.type)) &&
        (filtre.tabId === undefined || filtre.tabId === d.tabId);

      const ecouteurs = new Map();
      let branche = false;
      const onBeforeRequest = {
        addListener(fn, filtre = {}) {
          ecouteurs.set(fn, filtre);
          if (branche) return;
          branche = true;
          pont.ecouter(chrome.runtime.id, (d) => {
            for (const [f, fl] of ecouteurs) {
              if (!accepte(fl, d)) continue;
              try {
                f(d);
              } catch (e) {
                console.error(e);
              }
            }
          });
        },
        removeListener: (fn) => ecouteurs.delete(fn),
        hasListener: (fn) => ecouteurs.has(fn),
        hasListeners: () => ecouteurs.size > 0
      };
      Object.defineProperty(chrome, 'webRequest', {
        value: { ...chrome.webRequest, onBeforeRequest },
        enumerable: true,
        configurable: true
      });
    }
  });
}

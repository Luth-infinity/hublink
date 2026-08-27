// Preload minimal des webapps invitées : aucune API Node exposée.
const { contextBridge, ipcRenderer } = require('electron');

const flag = (name) => process.argv.some((arg) => arg === `--hublink-${name}`);

/**
 * Neutralise les clés d'accès (WebAuthn) pour ce service.
 *
 * Sur un poste avec Windows Hello ou Touch ID, Microsoft propose d'emblée la
 * clé d'accès de la session système — qui n'est presque jamais le bon compte
 * quand on jongle entre plusieurs identités. On ne supprime pas
 * `PublicKeyCredential` (des sites plantent s'il disparaît) : on répond
 * simplement qu'aucun authentificateur n'est disponible, ce qui fait retomber
 * proprement sur le mot de passe.
 *
 * `executeInMainWorld` est indispensable : avec `contextIsolation`, le preload
 * vit dans un monde isolé et ne peut pas modifier le `navigator` de la page.
 */
if (flag('block-passkeys')) {
  try {
    contextBridge.executeInMainWorld({
      func: () => {
        const refuser = () =>
          Promise.reject(new DOMException('Clés d’accès désactivées par Hublink', 'NotAllowedError'));

        if (window.PublicKeyCredential) {
          window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () =>
            Promise.resolve(false);
          window.PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
        }

        const creds = navigator.credentials;
        if (!creds) return;
        const get = creds.get.bind(creds);
        const create = creds.create.bind(creds);
        creds.get = (options) => (options && options.publicKey ? refuser() : get(options));
        creds.create = (options) => (options && options.publicKey ? refuser() : create(options));
      }
    });
  } catch (err) {
    console.warn('[hublink] blocage des clés d’accès impossible', err);
  }
}

/**
 * Coupe les notifications système de ce service.
 *
 * Le handler de permissions d'Electron travaille par SESSION : deux services
 * d'un même compte la partagent, on ne pourrait donc pas les régler
 * séparément. Neutraliser l'API dans la page est le seul niveau réellement
 * per-service — et cela couvre aussi les permissions déjà accordées.
 */
if (flag('mute')) {
  try {
    contextBridge.executeInMainWorld({
      func: () => {
        const Muette = function Notification() {
          return { close() {}, onclick: null, onerror: null, addEventListener() {}, removeEventListener() {} };
        };
        Muette.permission = 'denied';
        Muette.requestPermission = () => Promise.resolve('denied');
        Object.defineProperty(window, 'Notification', { value: Muette, configurable: true, writable: true });

        // Les webapps modernes passent souvent par le service worker.
        if (window.ServiceWorkerRegistration) {
          ServiceWorkerRegistration.prototype.showNotification = () =>
            Promise.reject(new DOMException('Notifications désactivées par Hublink', 'NotAllowedError'));
        }
      }
    });
  } catch (err) {
    console.warn('[hublink] coupure des notifications impossible', err);
  }
}

// Le preload est injecté dans toutes les frames, publicités tierces comprises.
// Seule la frame principale a besoin d'écouter les raccourcis.
if (window.top === window) {
  window.addEventListener('keydown', (event) => {
    const mod = process.platform === 'darwin' ? event.metaKey : event.ctrlKey;
    if (!mod) return;
    if (/^[1-9]$/.test(event.key)) {
      ipcRenderer.send('guest:shortcut', { type: 'select-service', index: Number(event.key) - 1 });
    } else if (event.key.toLowerCase() === 'e' && event.shiftKey) {
      ipcRenderer.send('guest:shortcut', { type: 'extensions' });
    } else if (event.key.toLowerCase() === 'b' && !event.shiftKey) {
      ipcRenderer.send('guest:shortcut', { type: 'toggle-sidebar' });
    }
  });
}

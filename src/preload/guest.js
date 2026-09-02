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

/**
 * Relaie l'API standard des pastilles (Badging API).
 *
 * `navigator.setAppBadge()` existe dans Electron et ne lève aucune erreur,
 * mais n'est reliée à rien : une webapp qui l'appelle croit avoir signalé ses
 * non-lus, et l'app n'en sait jamais rien. C'est le cas de Slack, de Teams et
 * de la plupart des webapps installables, qui ont abandonné le compteur dans
 * le titre. On récupère donc l'appel et on le fait suivre.
 *
 * La fonction d'envoi est passée en argument plutôt qu'exposée en variable
 * globale : la page s'en sert sans qu'un objet Hublink traîne sur `window`.
 */
try {
  contextBridge.executeInMainWorld({
    func: (envoyer) => {
      if (typeof envoyer !== 'function') return;
      // Sans argument, la spécification demande une pastille sans nombre : on
      // affiche 1, faute de pouvoir dessiner un simple point.
      navigator.setAppBadge = (n) => {
        envoyer(typeof n === 'number' && n >= 0 ? Math.floor(n) : 1);
        return Promise.resolve();
      };
      navigator.clearAppBadge = () => {
        envoyer(0);
        return Promise.resolve();
      };
    },
    args: [(n) => ipcRenderer.send('badge:set', n)]
  });
} catch (err) {
  console.warn('[hublink] relais des pastilles impossible', err);
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

// --- Proposition d'enregistrement d'un mot de passe -------------------------
//
// On n'écoute pas seulement `submit` : les connexions modernes interceptent le
// clic en JavaScript et partent en `fetch`, l'événement ne part jamais. On
// relève donc aussi le champ au moment où la page s'en va, ce qui couvre les
// deux familles sans avoir à deviner laquelle on a en face.
//
// Rien ne quitte la page tant qu'il n'y a pas un mot de passe saisi, et c'est
// le processus principal qui demandera confirmation avant d'enregistrer quoi
// que ce soit.
if (window.top === window) {
  let dernierEnvoi = '';

  const releve = () => {
    const champ = document.querySelector('input[type="password"]');
    if (!champ || !champ.value) return null;
    // L'identifiant est le champ texte le plus proche avant le mot de passe :
    // heuristique, mais la seule qui marche sans connaître chaque site.
    const champs = [...document.querySelectorAll('input')];
    const avant = champs.slice(0, champs.indexOf(champ)).reverse();
    const identifiant = avant.find((c) => ['text', 'email', 'tel', ''].includes(c.type) && c.value);
    return { username: identifiant ? identifiant.value : '', password: champ.value };
  };

  const proposer = () => {
    const trouve = releve();
    if (!trouve) return;
    // Une même saisie peut déclencher submit ET pagehide : on ne propose
    // qu'une fois par valeur.
    const empreinte = `${location.origin}:${trouve.username}:${trouve.password.length}`;
    if (empreinte === dernierEnvoi) return;
    dernierEnvoi = empreinte;
    ipcRenderer.send('password:offer', { origin: location.origin, ...trouve });
  };

  window.addEventListener('submit', proposer, true);
  window.addEventListener('pagehide', proposer);
}

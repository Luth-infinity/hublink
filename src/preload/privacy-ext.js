/**
 * Preload de session, après celui d'electron-chrome-extensions, dans les seules
 * pages d'extension et leurs service workers.
 *
 * La lib déclare chrome.privacy mais ses réglages ne répondent jamais : get()
 * et set() n'appellent pas leur rappel et ne rendent pas de promesse. Une
 * extension qui attend la réponse reste bloquée — Dashlane attend ainsi
 * passwordSavingEnabled avant de poursuivre. Chromium n'a ici ni gestionnaire
 * de mots de passe ni remplissage intégrés : chaque réglage répond
 * « désactivé, hors de portée de l'extension ».
 *
 * La lib gèle l'objet chrome, pas ce qu'il contient : on remplace les méthodes
 * des réglages eux-mêmes.
 */
const { contextBridge } = require('electron');

function corrigerPrivacy() {
  const valeur = { value: false, levelOfControl: 'not_controllable' };
  const repondre = (resultat) =>
    function (_details, rappel) {
      if (typeof rappel === 'function') {
        rappel(resultat);
        return undefined;
      }
      return Promise.resolve(resultat);
    };
  let essais = 0;
  const corriger = () => {
    const privacy = globalThis.chrome && globalThis.chrome.privacy;
    // Le preload de la lib peut passer après nous : on réessaie un instant.
    if (!privacy || !privacy.services) {
      if (essais++ < 50) setTimeout(corriger, 20);
      return;
    }
    for (const groupe of ['network', 'services', 'websites']) {
      for (const reglage of Object.values(privacy[groupe] || {})) {
        if (!reglage || typeof reglage !== 'object') continue;
        reglage.get = repondre(valeur);
        reglage.set = repondre(undefined);
        reglage.clear = repondre(undefined);
      }
    }
  };
  corriger();
}

const estExtension = process.type === 'service-worker' || (typeof location !== 'undefined' && location.href.startsWith('chrome-extension://'));
if (estExtension) {
  try {
    contextBridge.executeInMainWorld({ func: corrigerPrivacy });
  } catch (e) {
    console.error('preload-extensions', e);
  }
}

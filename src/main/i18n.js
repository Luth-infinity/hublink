const { app } = require('electron');
const en = require('./en.json');

/**
 * Traduction de l'interface.
 *
 * La clé EST le texte français : le code reste lisible tel qu'il était, et un
 * libellé oublié dans `en.json` s'affiche en français au lieu de casser. Le
 * renderer lit le même dictionnaire (`src/renderer/src/lib/i18n.ts`).
 */
// Résolue à la première demande : le store peut créer les comptes par défaut
// avant que le réglage ne soit lu.
let lang = null;

/** « system » suit la langue du système ; ni français ni anglais → anglais. */
function resolve(pref) {
  const locale = !pref || pref === 'system' ? app.getLocale() : pref;
  return String(locale).toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function setLanguage(pref) {
  lang = resolve(pref);
}

const getLanguage = () => lang || (lang = resolve('system'));

/** `t('Après {n} min', { n: 5 })` */
function t(fr, vars) {
  // « Annuler|édition » : le suffixe distingue deux sens d'un même mot français.
  const texte = getLanguage() === 'en' && en[fr] ? en[fr] : fr.split('|')[0];
  return vars ? texte.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : texte;
}

module.exports = { t, setLanguage, getLanguage, resolve };

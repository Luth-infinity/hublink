import en from '../../../main/en.json';
import type { Language } from '@/types';

// Même dictionnaire et même règle que `src/main/i18n.js` : la clé est le texte
// français, un oubli retombe sur le français.
const dico = en as Record<string, string>;
let lang: 'fr' | 'en' = 'fr';

export function resolveLanguage(pref: Language | undefined): 'fr' | 'en' {
  const locale = !pref || pref === 'system' ? navigator.language : pref;
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** Appelé au rendu de chaque fenêtre, avant ses enfants. */
export function setLanguage(pref: Language | undefined) {
  lang = resolveLanguage(pref);
  document.documentElement.lang = lang;
  return lang;
}

export const getLanguage = () => lang;
export const locale = () => (lang === 'en' ? 'en-GB' : 'fr-FR');

export function t(fr: string, vars?: Record<string, string | number>) {
  // « Annuler|édition » : le suffixe distingue deux sens d'un même mot français.
  const texte = lang === 'en' && dico[fr] ? dico[fr] : fr.split('|')[0];
  return vars ? texte.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : texte;
}

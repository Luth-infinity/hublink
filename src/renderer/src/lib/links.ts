/**
 * Pseudo Buy Me a Coffee.
 *
 * Doit rester identique à `site/app/support.ts`. Tant qu'il est vide, aucun
 * bouton de don ne s'affiche — mieux vaut rien qu'un lien mort.
 */
export const BMC_USER = 'luthinfinity';

export const SUPPORT_URL = BMC_USER ? `https://buymeacoffee.com/${BMC_USER}` : null;
export const REPO_URL = 'https://github.com/Luth-infinity/hublink';
export const RELEASES_URL = `${REPO_URL}/releases`;
export const ISSUES_URL = `${REPO_URL}/issues`;

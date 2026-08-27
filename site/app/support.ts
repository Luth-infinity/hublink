/**
 * Pseudo Buy Me a Coffee.
 *
 * Unique endroit à modifier : le site, l'app et le bouton « Sponsor » du dépôt
 * lisent tous cette valeur. Tant qu'elle est vide, aucun bouton de don ne
 * s'affiche — mieux vaut rien qu'un lien mort.
 */
export const BMC_USER = '';

export const SUPPORT_URL = BMC_USER ? `https://www.buymeacoffee.com/${BMC_USER}` : null;

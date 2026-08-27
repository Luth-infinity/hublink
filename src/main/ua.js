const { app } = require('electron');

// L'UA par défaut d'Electron contient le jeton `Electron/41.x`. Les portails
// qui filtrent les navigateurs (Teams en tête) refusent tout ce qu'ils ne
// reconnaissent pas et renvoient vers le navigateur système. Retirer ce seul
// jeton laisse un UA Chrome authentique : même moteur, même version.
const APP_UA = app.userAgentFallback;
const CHROME_UA = APP_UA.replace(/ Electron\/[\d.]+/, '');

const uaFor = (service) => (service && service.spoofChrome === false ? APP_UA : CHROME_UA);

module.exports = { APP_UA, CHROME_UA, uaFor };

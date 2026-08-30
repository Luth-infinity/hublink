const { app } = require('electron');

// L'UA par défaut d'Electron glisse deux jetons avant `Chrome/` : celui
// d'Electron et celui de l'application elle-même — `Hublink/0.4.5`. Les
// portails qui filtrent les navigateurs (Teams, WhatsApp) refusent tout ce
// qu'ils ne reconnaissent pas et renvoient vers le navigateur système.
//
// On efface donc tout ce qui se trouve entre `(KHTML, like Gecko)` et
// `Chrome/`, sans nommer ces jetons : renommer l'application ou changer sa
// version ne doit pas réactiver le problème. Ce qui reste est un UA Chrome
// authentique — même moteur, même version.
const APP_UA = app.userAgentFallback;
const CHROME_UA = APP_UA
  // Le jeton de l'application, glissé avant `Chrome/`.
  .replace(/(\(KHTML, like Gecko\)\s*).*?(Chrome\/)/, '$1$2')
  // Celui d'Electron, qui se place après selon les versions.
  .replace(/ Electron\/[\d.]+/g, '');

const uaFor = (service) => (service && service.spoofChrome === false ? APP_UA : CHROME_UA);

module.exports = { APP_UA, CHROME_UA, uaFor };

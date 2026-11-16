/**
 * chrome.webRequest n'émet rien dans Electron 41, même sans écouteur de session
 * (mesuré, app vierge). Dashlane s'en sert pour savoir quel cadre contient quel
 * autre : sans lui, il ignore le cadre parent, envoie ses messages au cadre -1
 * et ne remplit jamais un champ. On relaie donc onBeforeRequest nous-mêmes,
 * depuis l'unique écouteur réseau de la session (adblock.js).
 *
 * Pur (pas d'electron) pour être testé sous Node.
 */
const TYPES = {
  mainFrame: 'main_frame',
  subFrame: 'sub_frame',
  xhr: 'xmlhttprequest',
  cspReport: 'csp_report',
  webSocket: 'websocket'
};

// Numérotation de Chrome : 0 pour le cadre principal, l'identifiant de nœud
// sinon (c'est celui que voit déjà runtime.onMessage dans sender.frameId).
const idCadre = (f) => (f.parent ? f.frameTreeNodeId : 0);

/** Les détails d'une requête Electron, au format de chrome.webRequest. */
function versChrome(d, estOnglet) {
  let frameId = -1;
  let parentFrameId = -1;
  try {
    if (d.resourceType === 'mainFrame') frameId = 0;
    else if (d.frame) {
      frameId = idCadre(d.frame);
      parentFrameId = d.frame.parent ? idCadre(d.frame.parent) : -1;
    }
  } catch {
    // Cadre déjà détruit : la requête part sans cadre, comme chez Chrome.
  }
  return {
    requestId: String(d.id),
    url: d.url,
    method: d.method,
    type: TYPES[d.resourceType] || d.resourceType,
    timeStamp: d.timestamp,
    tabId: estOnglet ? d.webContentsId : -1,
    frameId,
    parentFrameId,
    ...(d.referrer ? { initiator: originDe(d.referrer) } : {})
  };
}

function originDe(url) {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

module.exports = { versChrome };

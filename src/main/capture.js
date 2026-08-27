const { app, dialog, clipboard, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Capture d'écran d'un service.
 *
 * Les extensions de capture (FireShot et consorts) ne peuvent pas fonctionner :
 * elles reposent sur `chrome.tabs.captureVisibleTab` et `chrome.downloads`, que
 * Electron n'implémente pas. On passe donc par le protocole de débogage de
 * Chromium, seul moyen d'obtenir la page ENTIÈRE — `webContents.capturePage()`
 * s'arrête à la zone visible.
 */
async function capture(wc, { fullPage }) {
  if (!fullPage) return wc.capturePage();

  const attached = wc.debugger.isAttached();
  if (!attached) wc.debugger.attach('1.3');
  try {
    const { data } = await wc.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true
    });
    return nativeImage.createFromBuffer(Buffer.from(data, 'base64'));
  } finally {
    // On ne détache que si on avait attaché : les devtools peuvent être ouverts.
    if (!attached) wc.debugger.detach();
  }
}

const slug = (s) =>
  (s || 'capture').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

function defaultPath(serviceName) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0')
  ].join('');
  return path.join(app.getPath('downloads'), `hublink-${slug(serviceName)}-${stamp}.png`);
}

async function saveToFile(win, image, serviceName) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Enregistrer la capture',
    defaultPath: defaultPath(serviceName),
    filters: [{ name: 'Image PNG', extensions: ['png'] }]
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, image.toPNG());
  return filePath;
}

const copyToClipboard = (image) => clipboard.writeImage(image);

module.exports = { capture, saveToFile, copyToClipboard };

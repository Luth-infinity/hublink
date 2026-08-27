// Toute URL qui sort de l'app passe par ici. On parse au lieu de tester la
// chaîne : `shell.openExternal` accepte n'importe quel schéma enregistré par
// le système, y compris des schémas d'application, et une page distante ne doit
// pas pouvoir déclencher autre chose qu'une navigation web.
function isExternalUrl(rawUrl) {
  try {
    const { protocol } = new URL(rawUrl);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

// Chromium remonte parfois un favicon dégénéré comme `data:,` : une URL
// parfaitement valide, mais vide. L'image ne déclenche alors ni `load` ni
// `error`, et l'interface reste bloquée sur le glyphe « image cassée ». On
// filtre à la source plutôt que de rattraper côté rendu.
function isUsableFavicon(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  try {
    const { protocol } = new URL(rawUrl);
    if (protocol === 'http:' || protocol === 'https:') return true;
    // Une vraie image encodée fait bien plus que quelques octets.
    return protocol === 'data:' && rawUrl.length > 64;
  } catch {
    return false;
  }
}

module.exports = { isExternalUrl, isUsableFavicon };

const { nativeImage } = require('electron');
const { isUsableFavicon } = require('./urls');

// Un favicon reste minuscule une fois réduit : quelques kilo-octets en data URI,
// stockés dans la config plutôt que rechargés depuis le réseau à chaque rendu.
const MAX_BYTES = 512 * 1024;
const SIZE = 32;

/**
 * Télécharge un favicon et le renvoie en data URI.
 *
 * On passe par la session du compte, et non par `net.fetch` : les icônes
 * d'intranet sont souvent derrière la même authentification que le site, et
 * une requête anonyme renverrait une page de login au lieu d'une image.
 *
 * Stocker l'image plutôt que son URL évite trois écueils : une requête réseau
 * du shell à chaque rendu, une icône qui casse hors ligne, et une icône
 * invisible quand elle exige des cookies.
 */
async function toDataUrl(session, iconUrl) {
  if (!isUsableFavicon(iconUrl)) return null;
  if (iconUrl.startsWith('data:')) return iconUrl;

  try {
    const res = await session.fetch(iconUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_BYTES) return null;

    let image = nativeImage.createFromBuffer(buffer);
    // `.ico` multi-résolutions et `.svg` ne sont pas décodés par nativeImage :
    // on garde alors l'original tel quel, le renderer sait les afficher.
    if (image.isEmpty()) {
      const type = (res.headers.get('content-type') || '').toLowerCase();
      if (!/^image\//.test(type)) return null;
      return `data:${type.split(';')[0]};base64,${buffer.toString('base64')}`;
    }

    const { width, height } = image.getSize();
    if (Math.max(width, height) > SIZE) image = image.resize({ width: SIZE, height: SIZE, quality: 'best' });
    return image.toDataURL();
  } catch {
    return null;
  }
}

/** Emplacement conventionnel, pour les sites qui ne déclarent pas d'icône. */
function defaultIconUrl(pageUrl) {
  try {
    const { origin, protocol } = new URL(pageUrl);
    return protocol === 'https:' || protocol === 'http:' ? `${origin}/favicon.ico` : null;
  } catch {
    return null;
  }
}

module.exports = { toDataUrl, defaultIconUrl };

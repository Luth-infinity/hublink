const crypto = require('crypto');
const { net } = require('electron');

/**
 * Les séquences sponsorisées d'une vidéo YouTube, d'après SponsorBlock.
 *
 * SponsorBlock est une base tenue par ses utilisateurs : ils marquent le début
 * et la fin des passages sponsorisés, et votent sur ceux des autres. Elle vaut
 * pour tout le monde, là où le « Passer rapidement » de YouTube est réservé
 * aux abonnés Premium — et ce dernier désigne le passage le plus sauté, choisi
 * par un algorithme, qui n'est pas forcément une publicité. Sauter sans
 * demander exige de savoir ce qu'on saute.
 *
 * On ne donne pas au service la vidéo regardée : seulement les quatre premiers
 * caractères de son empreinte. Il répond pour toutes les vidéos qui partagent
 * ce préfixe, et c'est ici qu'on retrouve la nôtre.
 *
 * Données SponsorBlock (sponsor.ajay.app), sous licence CC BY-NC-SA 4.0.
 */

const API = 'https://sponsor.ajay.app/api/skipSegments/';
// Le sponsor et l'autopromotion. Les intros, les rappels « abonnez-vous » et
// les génériques existent aussi, mais les sauter d'office couperait ce que
// beaucoup veulent voir.
const CATEGORIES = ['sponsor', 'selfpromo'];
const DELAI = 4000;
const DUREE_CACHE = 30 * 60 * 1000;
const ID_VIDEO = /^[\w-]{11}$/;

const cache = new Map();

async function interroger(idVideo) {
  const prefixe = crypto.createHash('sha256').update(idVideo).digest('hex').slice(0, 4);
  const url =
    API +
    prefixe +
    '?categories=' +
    encodeURIComponent(JSON.stringify(CATEGORIES)) +
    '&actionTypes=' +
    encodeURIComponent(JSON.stringify(['skip']));
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI);
  try {
    const reponse = await net.fetch(url, { signal: controleur.signal });
    // 404 : aucune vidéo de ce préfixe n'a de passage marqué.
    if (reponse.status === 404) return [];
    if (!reponse.ok) return null;
    const lot = await reponse.json();
    const video = Array.isArray(lot) ? lot.find((v) => v && v.videoID === idVideo) : null;
    if (!video || !Array.isArray(video.segments)) return [];
    return video.segments
      .filter((s) => s && Array.isArray(s.segment) && CATEGORIES.includes(s.category) && s.actionType === 'skip')
      .map((s) => ({ id: String(s.UUID), debut: Number(s.segment[0]), fin: Number(s.segment[1]), categorie: s.category }))
      .filter((s) => Number.isFinite(s.debut) && Number.isFinite(s.fin) && s.fin - s.debut >= 1)
      .sort((a, b) => a.debut - b.debut);
  } catch {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

/** Les passages à sauter, ou une liste vide si on n'en sait rien. */
async function passages(idVideo) {
  if (!ID_VIDEO.test(String(idVideo || ''))) return [];
  const connu = cache.get(idVideo);
  if (connu && Date.now() - connu.quand < DUREE_CACHE) return connu.liste;
  const liste = await interroger(idVideo);
  // Un échec du réseau n'est pas gardé : la vidéo suivante réessaiera.
  if (liste === null) return [];
  cache.set(idVideo, { quand: Date.now(), liste });
  return liste;
}

module.exports = { passages };

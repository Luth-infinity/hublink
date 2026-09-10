const { net } = require('electron');
const store = require('./store');

/**
 * Les suggestions de la barre d'adresse.
 *
 * Deux sources, dans cet ordre : ce qu'on a déjà visité ou mis en favori, qui
 * répond aussitôt et sans rien envoyer à personne, puis les suggestions du
 * moteur de recherche, qui arrivent un instant plus tard. La liste s'affiche
 * avec les premières et se complète avec les secondes : attendre le réseau
 * pour montrer ce qu'on connaît déjà ferait paraître la barre lente.
 */

const MAX_LOCALES = 4;
const MAX_TOTAL = 8;
const DELAI_RESEAU = 1500;

// Ce qui ressemble à une adresse part tel quel : le proposer au moteur de
// recherche enverrait à Google chaque intranet qu'on tape.
const RESSEMBLE_A_UNE_ADRESSE = /^([a-z][a-z0-9+.-]*:|localhost\b|[^\s/]+\.[^\s/]{2,}(\/|$))/i;

/** Normalise pour comparer sans se soucier des accents ni de la casse. */
function plat(texte) {
  return String(texte || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function hote(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Ce qu'on connaît déjà : favoris d'abord, puis l'historique récent. Un mot
 * tapé doit se retrouver dans le titre, l'adresse ou le domaine.
 */
function locales(texte) {
  const q = plat(texte.trim());
  if (!q) return [];
  const etat = store.load();
  const vus = new Set();
  const trouves = [];

  const essayer = (entree, type) => {
    if (!entree || !entree.url || vus.has(entree.url)) return;
    const titre = entree.title || entree.name || '';
    const botte = plat(titre + ' ' + entree.url);
    if (!botte.includes(q)) return;
    vus.add(entree.url);
    trouves.push({ type, libelle: titre || hote(entree.url) || entree.url, detail: hote(entree.url), url: entree.url });
  };

  for (const f of etat.favorites || []) essayer(f, 'favori');
  for (const h of etat.history || []) {
    if (trouves.length >= MAX_LOCALES) break;
    essayer(h, 'historique');
  }
  return trouves.slice(0, MAX_LOCALES);
}

/** Les suggestions du moteur, ou rien si le réseau tarde ou refuse. */
async function distantes(texte, signal) {
  const q = texte.trim();
  if (!q || RESSEMBLE_A_UNE_ADRESSE.test(q)) return [];
  // `oe=utf-8` : sans lui la réponse arrive en Latin-1, et « météo » devenait
  // « m�t�o » une fois lue comme de l'UTF-8.
  const url =
    'https://suggestqueries.google.com/complete/search?client=firefox&hl=fr&ie=utf-8&oe=utf-8&q=' +
    encodeURIComponent(q);
  const reponse = await net.fetch(url, { signal });
  if (!reponse.ok) return [];
  // On décode selon ce que la réponse annonce, au cas où le paramètre serait
  // ignoré un jour : c'est l'en-tête qui fait foi, pas notre supposition.
  const annonce = /charset=([\w-]+)/i.exec(reponse.headers.get('content-type') || '');
  let texteBrut;
  try {
    texteBrut = new TextDecoder(annonce ? annonce[1] : 'utf-8').decode(await reponse.arrayBuffer());
  } catch {
    return [];
  }
  // Réponse du format OpenSearch : [requête, [suggestion, …]].
  const [, propositions] = JSON.parse(texteBrut);
  return (Array.isArray(propositions) ? propositions : [])
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => ({ type: 'recherche', libelle: p, detail: '', url: null }));
}

/**
 * Tient l'état des suggestions et le diffuse.
 *
 * Chaque frappe ouvre une nouvelle demande ; une réponse du réseau arrivée
 * après une frappe plus récente est jetée, sans quoi la liste reculerait vers
 * ce qu'on tapait il y a une seconde.
 */
function creer({ diffuser, naviguer }) {
  let etat = null;
  let numero = 0;
  let enCours = null;

  const pousser = () => diffuser(etat);

  const fermer = () => {
    if (enCours) enCours.abort();
    enCours = null;
    numero += 1;
    if (!etat) return;
    etat = null;
    pousser();
  };

  const demander = async ({ texte, ancre }) => {
    const brut = String(texte || '');
    if (!brut.trim()) return fermer();
    const mien = ++numero;
    if (enCours) enCours.abort();

    // Ce qu'on tape vient toujours en tête : Entrée sans rien choisir y mène.
    const tete = { type: RESSEMBLE_A_UNE_ADRESSE.test(brut.trim()) ? 'adresse' : 'recherche', libelle: brut.trim(), detail: '', url: null };
    const connues = locales(brut);
    // Ce que le moteur proposait à la frappe précédente reste tant que ça
    // concorde avec la saisie. Sans cela la liste perdait ses suggestions à
    // chaque lettre, puis les retrouvait un instant plus tard : elle battait
    // comme un cœur, et c'est ce qui la faisait clignoter.
    //
    // Même celles qui ne concordent plus restent, estompées, jusqu'à ce que
    // les nouvelles arrivent : passer de « i » à « ip » écartait presque tout,
    // et la liste tombait de huit lignes à deux avant de regrandir.
    const cle = plat(brut.trim());
    const anciennes = etat ? etat.items.slice(1).filter((i) => i.type === 'recherche') : [];
    const concordent = (i) => plat(i.libelle) !== cle && plat(i.libelle).startsWith(cle);
    const restes = [
      ...anciennes.filter(concordent).map((i) => ({ ...i, perime: false })),
      ...anciennes.filter((i) => !concordent(i) && plat(i.libelle) !== cle).map((i) => ({ ...i, perime: true }))
    ];
    etat = { ancre, texte: brut, items: [tete, ...connues, ...restes].slice(0, MAX_TOTAL), actif: 0 };
    pousser();

    const controleur = new AbortController();
    enCours = controleur;
    const minuterie = setTimeout(() => controleur.abort(), DELAI_RESEAU);
    let venues = [];
    try {
      venues = await distantes(brut, controleur.signal);
    } catch {
      venues = [];
    } finally {
      clearTimeout(minuterie);
    }
    if (mien !== numero || !etat) return;

    // Les suggestions fraîches remplacent celles qu'on avait gardées ; la
    // saisie et ce qu'on connaît déjà ne bougent pas.
    const gardees = etat.items.filter((i, n) => n === 0 || i.type !== 'recherche');
    // Sans réponse du moteur (hors ligne, délai dépassé), les lignes estompées
    // partent quand même : elles ne concernent plus ce qui est tapé.
    const deja = new Set(gardees.map((i) => plat(i.libelle)));
    const neuves = venues.filter((v) => !deja.has(plat(v.libelle)));
    const items = [...gardees, ...neuves].slice(0, MAX_TOTAL);
    etat = { ...etat, items, actif: Math.min(etat.actif, items.length - 1) };
    pousser();
  };

  const deplacer = (delta) => {
    if (!etat || !etat.items.length) return;
    const n = etat.items.length;
    etat = { ...etat, actif: (etat.actif + delta + n) % n };
    pousser();
  };

  const survoler = (index) => {
    if (!etat || index < 0 || index >= etat.items.length || etat.actif === index) return;
    etat = { ...etat, actif: index };
    pousser();
  };

  /** Mène à l'élément choisi — ou, faute de liste, à ce qui a été tapé. */
  const choisir = ({ index, texte } = {}) => {
    const item = etat && etat.items[Number.isInteger(index) ? index : etat.actif];
    const cible = item ? item.url || item.libelle : texte;
    fermer();
    if (cible) naviguer(cible);
  };

  return { demander, deplacer, survoler, choisir, fermer };
}

module.exports = { creer };

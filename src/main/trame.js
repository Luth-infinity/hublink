const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const i18n = require('./i18n');
const { t } = i18n;

/**
 * Trame : l'assistante qui lit les services ouverts d'un client et répond.
 *
 * L'IA est celle de Groq, gratuite avec une clé personnelle : chacun colle la
 * sienne dans Hublink, rien ne passe par un serveur à nous. La clé est chiffrée
 * par le trousseau du système, comme les mots de passe (`secrets.js`), et pour
 * la même raison on refuse de l'enregistrer s'il n'y en a pas.
 */

const FILE = path.join(app.getPath('userData'), 'hublink.trame.json');

const disponible = () => safeStorage.isEncryptionAvailable();

function lireFichier() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function cle() {
  const { chiffre } = lireFichier();
  if (!chiffre || !disponible()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(chiffre, 'base64'));
  } catch {
    return null;
  }
}

const aUneCle = () => Boolean(cle());

function enregistrerCle(valeur) {
  const propre = String(valeur || '').trim();
  if (!propre || !disponible()) return false;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(
    FILE,
    JSON.stringify({ chiffre: safeStorage.encryptString(propre).toString('base64') }),
    { mode: 0o600 }
  );
  return true;
}

function oublierCle() {
  fs.rmSync(FILE, { force: true });
}

// --- lecture des pages -------------------------------------------------------

/**
 * Le texte visible de la page, sans chercher à comprendre Slack ou Notion : un
 * extracteur par site casserait à chaque refonte. La zone `main` quand elle
 * existe, la page entière sinon.
 */
const EXTRAIRE = `(() => {
  const zone = document.querySelector('main, [role="main"]') || document.body;
  return {
    titre: document.title,
    url: location.href,
    texte: (zone ? zone.innerText : '').replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n')
  };
})()`;

/**
 * Le plan gratuit de Groq limite ce qu'on envoie par minute : chaque page n'a
 * droit qu'à une part. On en garde le début (titre, en-tête du document) et
 * surtout la fin, où une messagerie range ses messages les plus récents.
 */
const BUDGET_TOTAL = 14000;
function rogner(texte, part) {
  if (texte.length <= part) return texte;
  const tete = Math.min(1500, Math.floor(part / 4));
  return `${texte.slice(0, tete)}\n[…]\n${texte.slice(texte.length - (part - tete))}`;
}

async function lirePage(webContents) {
  if (!webContents || webContents.isDestroyed()) return null;
  try {
    return await webContents.executeJavaScript(EXTRAIRE, true);
  } catch {
    return null;
  }
}

// --- l'IA --------------------------------------------------------------------

// Du plus capable au plus disponible : un quota atteint sur l'un passe au suivant.
const MODELES = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];

const CONSIGNES = `Tu es Trame, l'assistante intégrée à Hublink, une application qui regroupe les outils de travail (messageries, documents, tickets) de plusieurs clients.
On te donne le texte des pages ouvertes pour un client, chacune avec un identifiant, puis la conversation et la question de l'utilisateur.
Règles :
- Réponds uniquement à partir des pages fournies. Si l'information n'y est pas, dis-le simplement en une phrase et propose quoi ouvrir.
- Tutoie l'utilisateur sans l'appeler par son prénom. Français soigné, ton direct, phrases courtes, aucune formule creuse.
- Va à l'essentiel : qui demande quoi, pour quand, ce qui attend une réponse. Cite les noms des personnes.
- Dans une messagerie, chaque message commence par le nom de son auteur, puis l'heure. N'attribue une phrase qu'à celui qui l'a écrite, et ne présente jamais comme décidé ce qui n'est pas écrit tel quel.
- Relève les questions posées à l'utilisateur qui n'ont pas encore de réponse.
- Réponds en JSON : {"blocs": [{"type": "p" | "li", "texte": "…"}], "sources": ["id de page", …]}.
- "p" est un paragraphe, "li" un élément de liste ; une liste se fait de "li" consécutifs. Au plus 8 blocs.
- "sources" ne contient que les identifiants des pages dont tu t'es réellement servi.`;

// Les consignes restent en français ; seule la langue de la réponse suit
// celle de l'application.
const enAnglais = () =>
  i18n.getLanguage() === 'en' ? "\n- Réponds en anglais, quelle que soit la langue des pages." : '';

class ErreurTrame extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function appeler(messages, cleGroq) {
  let derniere = null;
  for (const model of MODELES) {
    let res;
    try {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cleGroq}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model,
          temperature: 0.2,
          // « low » répondait vite mais confondait les auteurs d'un fil de discussion.
          ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'medium' } : {}),
          response_format: { type: 'json_object' },
          messages
        })
      });
    } catch {
      throw new ErreurTrame('reseau', 'Groq ne répond pas. Vérifie ta connexion.');
    }
    if (res.ok) {
      const data = await res.json();
      try {
        return JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
      } catch {
        derniere = new ErreurTrame('format', t('La réponse est arrivée illisible. Repose ta question.'));
        continue;
      }
    }
    if (res.status === 401) throw new ErreurTrame('cle', t('Groq refuse cette clé. Colle-en une nouvelle.'));
    // Quota, page trop longue pour ce modèle ou modèle indisponible : le suivant.
    if ([429, 413, 404, 503].includes(res.status)) {
      derniere = new ErreurTrame(
        res.status === 429 ? 'quota' : 'modele',
        res.status === 429
          ? t('La limite gratuite de Groq est atteinte. Réessaie dans une minute.')
          : t('Groq ne peut pas répondre pour le moment.')
      );
      continue;
    }
    throw new ErreurTrame('groq', t('Groq a répondu par une erreur ({code}).', { code: res.status }));
  }
  throw derniere || new ErreurTrame('groq', t('Groq ne peut pas répondre pour le moment.'));
}

async function lireToutes(pages, etape) {
  const lues = [];
  for (const page of pages) {
    etape({ type: 'lecture', id: page.id });
    const contenu = await lirePage(page.webContents);
    if (contenu && contenu.texte.trim()) lues.push({ ...page, ...contenu });
  }
  return lues;
}

function corpusDe(lues) {
  const part = Math.floor(BUDGET_TOTAL / lues.length);
  return lues
    .map((p) => `### Page ${p.id} — ${p.nom} — ${p.titre}\n${p.url}\n${rogner(p.texte, part)}`)
    .join('\n\n');
}

function cleOuErreur() {
  const cleGroq = cle();
  if (!cleGroq) throw new ErreurTrame('cle', t('Ajoute ta clé Groq pour que Trame puisse répondre.'));
  return cleGroq;
}

/**
 * Lit les pages, interroge l'IA, et rend une réponse propre.
 *
 * `pages` : [{ id, nom, webContents }] dans l'ordre d'affichage. `etape` est
 * appelé avant chaque lecture, pour que l'interface dise ce qui se passe.
 */
async function demander({ question, historique, pages, etape }) {
  const cleGroq = cleOuErreur();
  const lues = await lireToutes(pages, etape);
  if (!lues.length) {
    throw new ErreurTrame('vide', t('Aucune page lisible : ouvre au moins un service de ce client.'));
  }
  const passe = (historique || [])
    .slice(-6)
    .map((m) => `${m.role === 'q' ? 'Utilisateur' : 'Trame'} : ${m.texte}`)
    .join('\n');

  etape({ type: 'redaction' });
  const brut = await appeler(
    [
      { role: 'system', content: CONSIGNES + enAnglais() },
      {
        role: 'user',
        content: `Pages ouvertes :\n\n${corpusDe(lues)}\n\n${passe ? `Conversation :\n${passe}\n\n` : ''}Question : ${question}`
      }
    ],
    cleGroq
  );

  // On ne garde que ce qui a la bonne forme : la réponse finit dans l'interface.
  const blocs = (Array.isArray(brut.blocs) ? brut.blocs : [])
    .filter((b) => b && typeof b.texte === 'string' && b.texte.trim())
    .slice(0, 8)
    .map((b) => ({ type: b.type === 'li' ? 'li' : 'p', texte: b.texte.trim().slice(0, 800) }));
  if (!blocs.length) throw new ErreurTrame('format', t('La réponse est arrivée vide. Repose ta question.'));
  const ids = new Set(lues.map((p) => p.id));
  const sources = [...new Set((Array.isArray(brut.sources) ? brut.sources : []).filter((id) => ids.has(id)))];
  return { blocs, sources };
}

// --- le tour du matin ---------------------------------------------------------

const CONSIGNES_TOUR = `Tu es Trame, l'assistante intégrée à Hublink. C'est le tour du matin : on te donne le texte des services d'un client qui ont des messages non lus, chacun avec un identifiant.
Résume ce qui concerne l'utilisateur, en commençant par le plus important :
- ce qu'on lui demande, avec l'échéance s'il y en a une ;
- les questions qui lui sont posées et attendent une réponse ;
- une décision ou une nouvelle qui change son travail.
Règles :
- Au plus 4 points, de 25 mots au plus chacun, en tutoyant. Cite les personnes par leur prénom, mais n'interpelle jamais l'utilisateur par le sien : pas de « Lucas, … » en tête de point.
- Dans une messagerie, chaque message commence par le nom de son auteur, puis l'heure. N'attribue une phrase qu'à celui qui l'a écrite ; n'invente rien.
- Ignore ce qui ne concerne pas l'utilisateur. S'il n'y a rien d'utile, rends une liste vide.
- Réponds en JSON : {"points": [{"texte": "…", "source": "id de la page"}]}.`;

/**
 * Le tour d'un client : un appel par client plutôt qu'un seul pour tous, le
 * plan gratuit de Groq limitant ce qu'on envoie par minute — et le brief se
 * construit ainsi sous les yeux, client après client.
 */
async function resumerClient({ pages, etape }) {
  const cleGroq = cleOuErreur();
  const lues = await lireToutes(pages, etape);
  if (!lues.length) return { points: [] };
  etape({ type: 'redaction' });
  const brut = await appeler(
    [
      { role: 'system', content: CONSIGNES_TOUR + enAnglais() },
      { role: 'user', content: `Services :\n\n${corpusDe(lues)}` }
    ],
    cleGroq
  );
  const ids = new Set(lues.map((p) => p.id));
  const points = (Array.isArray(brut.points) ? brut.points : [])
    .filter((p) => p && typeof p.texte === 'string' && p.texte.trim())
    .slice(0, 4)
    .map((p) => ({ texte: p.texte.trim().slice(0, 400), source: ids.has(p.source) ? p.source : null }));
  return { points };
}

module.exports = { disponible, aUneCle, enregistrerCle, oublierCle, demander, resumerClient, ErreurTrame };

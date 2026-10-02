const { app, net } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const zlib = require('zlib');

// Téléchargement des vidéos YouTube, par yt-dlp. Ni yt-dlp ni ffmpeg ne sont
// embarqués : ils pèseraient une cinquantaine de mégaoctets dans l'installeur
// de tous ceux qui ne s'en serviront jamais. Ils arrivent au premier usage,
// dans le dossier de l'application.
//
// yt-dlp exige un moteur JavaScript pour lire YouTube. Hublink en a un :
// Electron lui-même, lancé avec `ELECTRON_RUN_AS_NODE`. Rien d'autre à
// installer.

const DOSSIER_OUTILS = () => path.join(app.getPath('userData'), 'outils');
const WIN = process.platform === 'win32';
const EXE = WIN ? '.exe' : '';

// La dernière version de yt-dlp, toujours : YouTube change souvent, et une
// version de quelques semaines suffit à ne plus rien lire.
function sourceYtDlp() {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
  if (WIN) return base + (process.arch === 'arm64' ? 'yt-dlp_arm64.exe' : 'yt-dlp.exe');
  if (process.platform === 'darwin') return base + 'yt-dlp_macos';
  return base + 'yt-dlp';
}

// ffmpeg, au contraire, est figé : il ne fait qu'assembler et convertir, et
// cette version-là est éprouvée. Les binaires de ffmpeg-static sont six fois
// plus légers que les archives complètes (pas de ffplay, ni ffprobe, ni doc).
// Pas de build Windows ARM : la version x64 y tourne en émulation.
function sourceFfmpeg() {
  const base = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/';
  if (WIN) return base + 'ffmpeg-win32-x64.gz';
  if (process.platform === 'darwin') return base + `ffmpeg-darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}.gz`;
  return base + `ffmpeg-linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}.gz`;
}

const cheminYtDlp = () => path.join(DOSSIER_OUTILS(), 'yt-dlp' + EXE);
const cheminFfmpeg = () => path.join(DOSSIER_OUTILS(), 'ffmpeg' + EXE);

/**
 * Les formats proposés. Le MP4 préfère le H.264 et l'AAC : c'est ce que lisent
 * sans histoire le lecteur de Windows, PowerPoint et les logiciels de montage.
 * Le VP9 ou l'AV1 que YouTube sert en premier en 1080p ne s'ouvrent pas
 * partout. « Qualité maximale » lâche cette contrainte pour aller au-delà du
 * 1080p, que le H.264 de YouTube ne dépasse pas.
 */
const FORMATS = {
  'mp4-1080': ['-S', 'res:1080,vcodec:h264,acodec:m4a', '--merge-output-format', 'mp4'],
  'mp4-720': ['-S', 'res:720,vcodec:h264,acodec:m4a', '--merge-output-format', 'mp4'],
  'mp4-max': ['-S', 'res,acodec:m4a', '--merge-output-format', 'mp4'],
  mp3: ['-x', '--audio-format', 'mp3', '--audio-quality', '0'],
  m4a: ['-f', 'ba[ext=m4a]/ba', '-x', '--audio-format', 'm4a'],
  wav: ['-x', '--audio-format', 'wav'],
  // Rien n'est téléchargé, donc rien n'est « déplacé » : le chemin de l'image
  // ne s'obtient qu'à la fin de la vidéo.
  miniature: [
    '--skip-download', '--write-thumbnail', '--convert-thumbnails', 'jpg',
    '--print', 'after_video:HUBLINK-FICHIER %(thumbnails.-1.filepath)s'
  ]
};

/** Accepte une page de vidéo YouTube, et rien d'autre. */
function estVideoYouTube(url) {
  try {
    const u = new URL(url);
    if (!/^(www\.|m\.|music\.)?youtube\.com$/.test(u.hostname)) return false;
    return (u.pathname === '/watch' && u.searchParams.has('v')) || u.pathname.startsWith('/shorts/');
  } catch {
    return false;
  }
}

async function telechargerFichier(url, cible, gz) {
  const rep = await net.fetch(url);
  if (!rep.ok) throw new Error(`${rep.status} sur ${url}`);
  let donnees = Buffer.from(await rep.arrayBuffer());
  if (gz) donnees = zlib.gunzipSync(donnees);
  // Écrit à côté puis renomme : un téléchargement coupé ne doit pas laisser
  // un exécutable tronqué qu'on prendrait ensuite pour le bon.
  const temp = cible + '.part';
  fs.writeFileSync(temp, donnees);
  fs.chmodSync(temp, 0o755);
  fs.renameSync(temp, cible);
}

let preparation = null;
let misAJour = false;

/**
 * Rend yt-dlp et ffmpeg prêts. Le premier appel de chaque lancement demande
 * aussi à yt-dlp de se mettre à jour : c'est ce qui le garde en état de lire
 * YouTube sans qu'il faille publier une version de Hublink.
 */
function preparer() {
  if (preparation) return preparation;
  preparation = (async () => {
    fs.mkdirSync(DOSSIER_OUTILS(), { recursive: true });
    const manquants = [];
    if (!fs.existsSync(cheminYtDlp())) manquants.push(telechargerFichier(sourceYtDlp(), cheminYtDlp(), false));
    if (!fs.existsSync(cheminFfmpeg())) manquants.push(telechargerFichier(sourceFfmpeg(), cheminFfmpeg(), true));
    const premiereFois = manquants.length > 0;
    await Promise.all(manquants);
    if (!premiereFois && !misAJour) {
      misAJour = true;
      // Une mise à jour ratée (hors ligne, GitHub lent) n'empêche rien : la
      // version en place sert encore.
      await new Promise((resolve) => {
        execFile(cheminYtDlp(), ['-U'], { timeout: 30000, windowsHide: true }, () => resolve());
      });
    }
  })();
  // Un échec ne doit pas rester en cache : le prochain essai recommence.
  preparation.catch(() => {
    preparation = null;
  });
  return preparation;
}

/**
 * Recopie les cookies YouTube et Google de la page dans un fichier que yt-dlp
 * sait lire. Sans eux, YouTube prend vite yt-dlp pour un robot (« Sign in to
 * confirm you're not a bot ») — mesuré après une dizaine de téléchargements
 * depuis la même connexion. Avec eux, yt-dlp se présente comme la session
 * que l'on regarde déjà, connectée ou non.
 *
 * Le fichier porte une session Google : il est lisible du seul utilisateur et
 * effacé dès que yt-dlp a fini.
 */
async function fichierCookies(ses, id) {
  if (!ses) return null;
  const domaine = /(^|\.)(youtube\.com|google\.com)$/;
  const cookies = (await ses.cookies.get({})).filter((c) => domaine.test(c.domain.replace(/^\./, '')));
  if (cookies.length === 0) return null;
  const lignes = cookies.map((c) => {
    const dom = c.hostOnly ? c.domain.replace(/^\./, '') : c.domain.startsWith('.') ? c.domain : `.${c.domain}`;
    return [
      dom,
      dom.startsWith('.') ? 'TRUE' : 'FALSE',
      c.path || '/',
      c.secure ? 'TRUE' : 'FALSE',
      c.session || !c.expirationDate ? 0 : Math.floor(c.expirationDate),
      c.name,
      c.value
    ].join('\t');
  });
  const chemin = path.join(os.tmpdir(), `hublink-cookies-${id}.txt`);
  fs.writeFileSync(chemin, ['# Netscape HTTP Cookie File', ...lignes, ''].join('\n'), { mode: 0o600 });
  return chemin;
}

const enCours = new Map();

/**
 * Télécharge la vidéo au format voulu dans `dossier`.
 *
 * `onEvent` reçoit les mêmes événements que les téléchargements du navigateur
 * ('download-started', 'download-progress', 'download-done'), pour que la
 * barre et le panneau n'aient rien à savoir de leur origine.
 */
async function telecharger({ url, format, dossier, titre, session }, onEvent) {
  if (!estVideoYouTube(url) || !FORMATS[format]) return;
  const id = `y_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  let nom = titre || 'Vidéo YouTube';
  onEvent('download-started', { id, name: nom, total: 0, path: '', annulable: true });

  const outilsAbsents = !fs.existsSync(cheminYtDlp()) || !fs.existsSync(cheminFfmpeg());
  if (outilsAbsents) {
    onEvent('download-progress', { id, received: 0, total: 0, detail: 'Première fois : installation de yt-dlp et ffmpeg…' });
  }
  try {
    await preparer();
  } catch (err) {
    console.warn('[videos] préparation impossible :', err);
    onEvent('download-done', { id, name: nom, path: '', state: 'interrupted', erreur: 'Outils introuvables, vérifiez la connexion' });
    return;
  }

  fs.mkdirSync(dossier, { recursive: true });
  let cookies = null;
  try {
    cookies = await fichierCookies(session, id);
  } catch (err) {
    console.warn('[videos] cookies illisibles :', err);
  }
  const args = [
    ...(cookies ? ['--cookies', cookies] : []),
    ...FORMATS[format],
    '--js-runtimes', `node:${process.execPath}`,
    '--ffmpeg-location', DOSSIER_OUTILS(),
    '--encoding', 'utf-8',
    // Une vidéo ouverte depuis une playlist porte `&list=` : on veut la vidéo.
    '--no-playlist',
    // Sinon le fichier prend la date de mise en ligne, et se range des années
    // en arrière dans un dossier trié par date.
    '--no-mtime',
    '--windows-filenames',
    '--newline',
    '--progress',
    '--progress-template', 'download:HUBLINK-PROGRES %(progress.downloaded_bytes)s %(progress.total_bytes,progress.total_bytes_estimate)s %(progress.tmpfilename)s',
    ...(format === 'miniature'
      ? []
      : [
          '--print', 'before_dl:HUBLINK-INFO %(filesize,filesize_approx)s %(title)s',
          '--print', 'after_move:HUBLINK-FICHIER %(filepath)s'
        ]),
    '-P', dossier,
    '-o', '%(title)s.%(ext)s',
    url
  ];

  const proc = spawn(cheminYtDlp(), args, {
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8' }
  });
  enCours.set(id, proc);

  // Une vidéo en MP4 se télécharge en deux flux, l'image puis le son : on
  // additionne, sans quoi la barre repartirait de zéro au milieu.
  let total = 0;
  let base = 0;
  let precedent = 0;
  let fichier = '';
  let dernierEnvoi = 0;
  const erreurs = [];
  // Fichiers temporaires vus passer, pour ne rien laisser derrière une
  // annulation : un `.part` de plusieurs centaines de mégaoctets dans le
  // dossier de l'utilisateur, c'est le genre de reste qu'on ne remarque pas.
  const temporaires = new Set();

  const lire = (ligne) => {
    if (ligne.startsWith('HUBLINK-INFO ')) {
      const [, taille, ...reste] = ligne.split(' ');
      total = Number(taille) || 0;
      if (reste.join(' ')) nom = reste.join(' ');
      onEvent('download-progress', { id, name: nom, received: base + precedent, total });
    } else if (ligne.startsWith('HUBLINK-PROGRES ')) {
      const [, recu, attendu, ...temp] = ligne.split(' ');
      if (temp.join(' ') && temp.join(' ') !== 'NA') temporaires.add(temp.join(' '));
      const n = Number(recu) || 0;
      if (n < precedent) base += precedent;
      precedent = n;
      if (!total) total = Number(attendu) || 0;
      const maintenant = Date.now();
      if (maintenant - dernierEnvoi < 250) return;
      dernierEnvoi = maintenant;
      onEvent('download-progress', { id, received: Math.min(base + n, total || Infinity), total });
    } else if (ligne.startsWith('HUBLINK-FICHIER ')) {
      fichier = ligne.slice('HUBLINK-FICHIER '.length).trim();
    } else if (ligne.startsWith('ERROR:')) {
      erreurs.push(ligne.slice(6).trim());
    }
  };

  const brancher = (flux) => {
    let reste = '';
    flux.setEncoding('utf8');
    flux.on('data', (morceau) => {
      const lignes = (reste + morceau).split(/\r?\n/);
      reste = lignes.pop();
      lignes.forEach(lire);
    });
    flux.on('end', () => reste && lire(reste));
  };
  brancher(proc.stdout);
  brancher(proc.stderr);

  proc.on('error', (err) => erreurs.push(err.message));
  proc.on('close', (code) => {
    if (cookies) fs.rmSync(cookies, { force: true });
    const annule = proc.hublinkAnnule;
    enCours.delete(id);
    if (code === 0 && !annule) {
      const taille = fichier && fs.existsSync(fichier) ? fs.statSync(fichier).size : total;
      onEvent('download-done', { id, name: fichier ? path.basename(fichier) : nom, path: fichier, state: 'completed', total: taille });
    } else {
      nettoyer(temporaires);
      if (!annule) console.warn('[videos] yt-dlp a échoué :', erreurs.join(' | ') || `code ${code}`);
      onEvent('download-done', {
        id,
        name: nom,
        path: '',
        state: annule ? 'cancelled' : 'interrupted',
        erreur: annule ? null : resumerErreur(erreurs)
      });
    }
  });
}

/**
 * Efface ce qu'un téléchargement inachevé laisse : le `.part` en cours, son
 * `.ytdl` de reprise, et le flux déjà complet (`.f137.mp4`) qui attendait
 * d'être assemblé avec l'autre.
 */
function nettoyer(temporaires) {
  for (const temp of temporaires) {
    const complet = temp.replace(/\.part$/, '');
    const candidats = [temp, `${temp}.ytdl`, `${complet}.ytdl`];
    if (/\.f[\w-]+\.\w+$/.test(complet)) candidats.push(complet);
    for (const f of candidats) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        // Encore verrouillé, ou déjà parti : rien de plus à faire.
      }
    }
  }
}

// Les erreurs de yt-dlp sont longues et techniques : on garde ce qui aide.
function resumerErreur(erreurs) {
  const texte = erreurs.join(' ');
  if (/not a bot/i.test(texte)) return 'YouTube bloque le téléchargement : connectez-vous à YouTube dans cette page, puis réessayez';
  if (/confirm your age|age-restricted|inappropriate for some users/i.test(texte)) return 'Vidéo soumise à une limite d’âge : connectez-vous à YouTube dans cette page';
  if (/members-only|join this channel/i.test(texte)) return 'Vidéo réservée aux membres de la chaîne';
  if (/Private video|Video unavailable|This video is unavailable/i.test(texte)) return 'Vidéo indisponible';
  if (/getaddrinfo|Unable to download|timed out/i.test(texte)) return 'Connexion impossible';
  return erreurs[0] ? erreurs[0].slice(0, 120) : null;
}

function annuler(id) {
  const proc = enCours.get(id);
  if (!proc) return;
  proc.hublinkAnnule = true;
  // Sous Windows, tuer yt-dlp laisse ffmpeg orphelin : on emporte l'arbre.
  if (WIN) execFile('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true }, () => {});
  else proc.kill();
}

module.exports = { telecharger, annuler, estVideoYouTube };

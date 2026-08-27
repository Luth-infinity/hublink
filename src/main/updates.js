const { app, net } = require('electron');

const REPO = 'Luth-infinity/hublink';
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

// Une application de ce genre reste ouverte des jours : une vérification par
// demi-journée laissait passer des versions publiées entre-temps. On repasse
// toutes les deux heures, et à chaque retour sur la fenêtre.
const INTERVAL = 2 * 60 * 60 * 1000;
const FIRST_DELAY = 15_000;
// Garde-fou sur le retour de focus : l'API GitHub anonyme plafonne à 60
// requêtes par heure, et on peut revenir sur la fenêtre vingt fois par minute.
const FOCUS_THROTTLE = 20 * 60 * 1000;

/** Compare deux versions « 0.3.10 » sans dépendance semver. */
function isNewer(candidate, current) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

/** L'installeur correspondant à la plateforme, à défaut la page de la version. */
function assetFor(release) {
  const names = (release.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url }));
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const ext = process.platform === 'darwin' ? '.dmg' : '.exe';
  const exact = names.find((a) => a.name.endsWith(ext) && a.name.includes(arch));
  const anyForOs = names.find((a) => a.name.endsWith(ext));
  return (exact || anyForOs || {}).url || release.html_url;
}

async function check() {
  try {
    const res = await net.fetch(LATEST, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const release = await res.json();
    if (release.draft || release.prerelease) return null;

    const version = String(release.tag_name || '').replace(/^v/, '');
    if (!version || !isNewer(version, app.getVersion())) return null;

    return {
      version,
      url: assetFor(release),
      page: release.html_url,
      notes: (release.body || '').split('\n').slice(0, 6).join('\n')
    };
  } catch {
    // Hors ligne ou GitHub indisponible : on retentera au prochain passage.
    return null;
  }
}

/**
 * Surveille les nouvelles versions.
 *
 * On notifie sans installer : la mise à jour silencieuse exige une application
 * signée sur macOS (contrainte de Squirrel.Mac). Un signalement suivi d'un
 * téléchargement manuel fonctionne sur les deux plateformes, sans certificat.
 */
function watch(onFound) {
  let timer = null;
  let lastRun = 0;

  const run = async () => {
    lastRun = Date.now();
    const update = await check();
    if (update) onFound(update);
  };

  const start = setTimeout(() => {
    run();
    timer = setInterval(run, INTERVAL);
    if (timer.unref) timer.unref();
  }, FIRST_DELAY);
  if (start.unref) start.unref();

  // À appeler au retour sur la fenêtre : c'est le moment où l'utilisateur
  // regarde, donc celui où la nouvelle doit être fraîche.
  return function checkOnFocus() {
    if (Date.now() - lastRun < FOCUS_THROTTLE) return;
    run();
  };
}

module.exports = { check, watch, isNewer };

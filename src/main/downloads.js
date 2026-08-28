const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Un navigateur ne demande pas où poser chaque fichier : il le dépose dans le
// dossier de téléchargements et le signale. On garde ce comportement, en
// résolvant les collisions de nom plutôt qu'en écrasant.
function chemLibre(dossier, nom) {
  const ext = path.extname(nom);
  const base = path.basename(nom, ext);
  let candidat = path.join(dossier, nom);
  let i = 1;
  while (fs.existsSync(candidat)) {
    candidat = path.join(dossier, `${base} (${i})${ext}`);
    i += 1;
  }
  return candidat;
}

/**
 * Suit les téléchargements d'une session et remonte leur avancement.
 *
 * `onEvent` reçoit 'download-started', 'download-progress' et
 * 'download-done'. La progression est limitée à quatre envois par seconde :
 * `updated` se déclenche à chaque bloc reçu, soit des centaines de fois par
 * seconde sur une connexion correcte.
 */
function watch(session, onEvent) {
  session.on('will-download', (_event, item) => {
    const dossier = app.getPath('downloads');
    const cible = chemLibre(dossier, item.getFilename());
    item.setSavePath(cible);

    const id = `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const nom = path.basename(cible);
    const total = item.getTotalBytes();
    onEvent('download-started', { id, name: nom, total, path: cible });

    let dernier = 0;
    item.on('updated', (__e, etat) => {
      if (etat === 'interrupted') return;
      const maintenant = Date.now();
      if (maintenant - dernier < 250) return;
      dernier = maintenant;
      onEvent('download-progress', {
        id,
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
        paused: item.isPaused()
      });
    });

    item.once('done', (__e, etat) => {
      onEvent('download-done', {
        id,
        name: nom,
        path: cible,
        state: etat,
        total: item.getTotalBytes()
      });
    });
  });
}

/** Ouvre le dossier contenant le fichier et l'y sélectionne. */
function reveal(chemin) {
  if (chemin && fs.existsSync(chemin)) shell.showItemInFolder(chemin);
}

/** Ouvre le fichier lui-même, avec l'application par défaut du système. */
async function open(chemin) {
  if (!chemin || !fs.existsSync(chemin)) return 'Fichier introuvable';
  // Renvoie une chaîne vide en cas de succès, un message d'erreur sinon.
  return shell.openPath(chemin);
}

module.exports = { watch, reveal, open };

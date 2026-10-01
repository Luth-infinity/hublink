// Preload minimal des webapps invitées : aucune API Node exposée.
const { contextBridge, ipcRenderer } = require('electron');

const flag = (name) => process.argv.some((arg) => arg === `--hublink-${name}`);

// Les onglets du navigateur reçoivent ce preload pour le mode vidéo et le
// congé de survol. Le reste — pastille de non-lus, mots de passe — n'a de sens
// que pour un service, qui a un nom et une place dans le panneau.
const estOnglet = flag('onglet');

/**
 * Neutralise les clés d'accès (WebAuthn) pour ce service.
 *
 * Sur un poste avec Windows Hello ou Touch ID, Microsoft propose d'emblée la
 * clé d'accès de la session système — qui n'est presque jamais le bon compte
 * quand on jongle entre plusieurs identités. On ne supprime pas
 * `PublicKeyCredential` (des sites plantent s'il disparaît) : on répond
 * simplement qu'aucun authentificateur n'est disponible, ce qui fait retomber
 * proprement sur le mot de passe.
 *
 * `executeInMainWorld` est indispensable : avec `contextIsolation`, le preload
 * vit dans un monde isolé et ne peut pas modifier le `navigator` de la page.
 */
if (flag('block-passkeys')) {
  try {
    contextBridge.executeInMainWorld({
      func: () => {
        const refuser = () =>
          Promise.reject(new DOMException('Clés d’accès désactivées par Hublink', 'NotAllowedError'));

        if (window.PublicKeyCredential) {
          window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () =>
            Promise.resolve(false);
          window.PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
        }

        const creds = navigator.credentials;
        if (!creds) return;
        const get = creds.get.bind(creds);
        const create = creds.create.bind(creds);
        creds.get = (options) => (options && options.publicKey ? refuser() : get(options));
        creds.create = (options) => (options && options.publicKey ? refuser() : create(options));
      }
    });
  } catch (err) {
    console.warn('[hublink] blocage des clés d’accès impossible', err);
  }
}

/**
 * Coupe les notifications système de ce service.
 *
 * Le handler de permissions d'Electron travaille par SESSION : deux services
 * d'un même compte la partagent, on ne pourrait donc pas les régler
 * séparément. Neutraliser l'API dans la page est le seul niveau réellement
 * per-service — et cela couvre aussi les permissions déjà accordées.
 */
if (flag('mute')) {
  try {
    contextBridge.executeInMainWorld({
      func: () => {
        const Muette = function Notification() {
          return { close() {}, onclick: null, onerror: null, addEventListener() {}, removeEventListener() {} };
        };
        Muette.permission = 'denied';
        Muette.requestPermission = () => Promise.resolve('denied');
        Object.defineProperty(window, 'Notification', { value: Muette, configurable: true, writable: true });

        // Les webapps modernes passent souvent par le service worker.
        if (window.ServiceWorkerRegistration) {
          ServiceWorkerRegistration.prototype.showNotification = () =>
            Promise.reject(new DOMException('Notifications désactivées par Hublink', 'NotAllowedError'));
        }
      }
    });
  } catch (err) {
    console.warn('[hublink] coupure des notifications impossible', err);
  }
}

/**
 * Relaie l'API standard des pastilles (Badging API).
 *
 * `navigator.setAppBadge()` existe dans Electron et ne lève aucune erreur,
 * mais n'est reliée à rien : une webapp qui l'appelle croit avoir signalé ses
 * non-lus, et l'app n'en sait jamais rien. C'est le cas de Slack, de Teams et
 * de la plupart des webapps installables, qui ont abandonné le compteur dans
 * le titre. On récupère donc l'appel et on le fait suivre.
 *
 * La fonction d'envoi est passée en argument plutôt qu'exposée en variable
 * globale : la page s'en sert sans qu'un objet Hublink traîne sur `window`.
 */
if (!estOnglet) try {
  contextBridge.executeInMainWorld({
    func: (envoyer) => {
      if (typeof envoyer !== 'function') return;
      // Sans argument, la spécification demande une pastille sans nombre : on
      // affiche 1, faute de pouvoir dessiner un simple point.
      navigator.setAppBadge = (n) => {
        envoyer(typeof n === 'number' && n >= 0 ? Math.floor(n) : 1);
        return Promise.resolve();
      };
      navigator.clearAppBadge = () => {
        envoyer(0);
        return Promise.resolve();
      };
    },
    args: [(n) => ipcRenderer.send('badge:set', n)]
  });
} catch (err) {
  console.warn('[hublink] relais des pastilles impossible', err);
}

// Le preload est injecté dans toutes les frames, publicités tierces comprises.
// Seule la frame principale a besoin d'écouter les raccourcis.
if (window.top === window) {
  window.addEventListener('keydown', (event) => {
    const mod = process.platform === 'darwin' ? event.metaKey : event.ctrlKey;
    if (!mod) return;
    if (/^[1-9]$/.test(event.key)) {
      ipcRenderer.send('guest:shortcut', { type: 'select-service', index: Number(event.key) - 1 });
    } else if (event.key.toLowerCase() === 'e' && event.shiftKey) {
      ipcRenderer.send('guest:shortcut', { type: 'extensions' });
    } else if (event.key.toLowerCase() === 'b' && !event.shiftKey) {
      ipcRenderer.send('guest:shortcut', { type: 'toggle-sidebar' });
    }
  });
}

// --- Le pointeur entre dans la page ----------------------------------------
//
// La page est une vue native, posée au-dessus du HTML du shell. Quand le
// pointeur passe de la barre latérale à la page, le shell ne reçoit aucun
// événement : pour lui, le bouton qu'on venait de survoler l'est encore, et
// le voilà éclairé jusqu'au prochain passage de souris. On le prévient.
if (window.top === window) {
  let signale = false;
  const oublier = () => {
    signale = false;
  };
  window.addEventListener(
    'mousemove',
    () => {
      if (signale) return;
      signale = true;
      ipcRenderer.send('guest:pointeur');
    },
    true
  );
  window.addEventListener('mouseleave', oublier, true);
  window.addEventListener('blur', oublier);
  document.addEventListener('visibilitychange', oublier);
}

// --- Proposition d'enregistrement d'un mot de passe -------------------------
//
// On n'écoute pas seulement `submit` : les connexions modernes interceptent le
// clic en JavaScript et partent en `fetch`, l'événement ne part jamais. On
// relève donc aussi le champ au moment où la page s'en va, ce qui couvre les
// deux familles sans avoir à deviner laquelle on a en face.
//
// Rien ne quitte la page tant qu'il n'y a pas un mot de passe saisi, et c'est
// le processus principal qui demandera confirmation avant d'enregistrer quoi
// que ce soit.
if (!estOnglet && window.top === window) {
  let dernierEnvoi = '';

  const releve = () => {
    const champ = document.querySelector('input[type="password"]');
    if (!champ || !champ.value) return null;
    // L'identifiant est le champ texte le plus proche avant le mot de passe :
    // heuristique, mais la seule qui marche sans connaître chaque site.
    const champs = [...document.querySelectorAll('input')];
    const avant = champs.slice(0, champs.indexOf(champ)).reverse();
    const identifiant = avant.find((c) => ['text', 'email', 'tel', ''].includes(c.type) && c.value);
    return { username: identifiant ? identifiant.value : '', password: champ.value };
  };

  const proposer = () => {
    const trouve = releve();
    if (!trouve) return;
    // Une même saisie peut déclencher submit ET pagehide : on ne propose
    // qu'une fois par valeur.
    const empreinte = `${location.origin}:${trouve.username}:${trouve.password.length}`;
    if (empreinte === dernierEnvoi) return;
    dernierEnvoi = empreinte;
    ipcRenderer.send('password:offer', { origin: location.origin, ...trouve });
  };

  window.addEventListener('submit', proposer, true);
  window.addEventListener('pagehide', proposer);
}

// --- Mode vidéo --------------------------------------------------------------
//
// La vidéo sort dans une petite fenêtre à part. Plutôt que de déplacer
// l'élément — les lecteurs le remettent en place aussitôt —, on le promeut :
// tout le reste de la page devient invisible, lui prend tout l'écran. La page
// continue de tourner sans savoir qu'on l'a réduite à sa vidéo.
if (window.top === window) {
  const STYLE = `
    html.hublink-sortie, html.hublink-sortie body {
      background: #000 !important;
      overflow: hidden !important;
    }
    html.hublink-sortie body * { visibility: hidden !important; }
    html.hublink-sortie [data-hublink-chemin] {
      transform: none !important;
      filter: none !important;
      perspective: none !important;
      contain: none !important;
    }
    html.hublink-sortie [data-hublink-video] {
      visibility: visible !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      object-fit: contain !important;
      background: #000 !important;
      z-index: 2147483647 !important;
    }
      /* Le temps d'un vrai clic sur le bouton du lecteur : l'image laisse passer
       le pointeur, et le bouton redevient atteignable. L'image reste peinte
       par-dessus, rien ne clignote. */
    html.hublink-clic [data-hublink-video] {
      pointer-events: none !important;
    }
    html.hublink-clic [data-hublink-cible] {
      visibility: visible !important;
      pointer-events: auto !important;
    }
  `;

  // Un libellé de bouton qui promet de sauter un passage, dans les deux
  // langues. « Passer au contenu principal » est un lien d'accessibilité, pas
  // une commande du lecteur : il est écarté.
  // Les boutons dont on sait déjà le nom. Ils passent avant le libellé, qui
  // change avec la langue et parfois en cours de décompte.
  const BOUTONS_CONNUS = [
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button',
    '.ytp-skip-ad-button',
    '.videoAdUiSkipButton',
    '[class*="skip" i]'
  ].join(', ');

  const PROMET_DE_PASSER = /^\s*(passer|skip|ignorer)\b/i;
  // Un lien d'accessibilité, un raccourci de navigation : ce ne sont pas des
  // commandes du lecteur, et « skip » y figure souvent.
  const ECARTES = /(navigation|nav-|skip-nav|contenu|content|principal|main menu|to video)/i;

  let video = null;
  let conteneur = null;
  let style = null;
  let veille = null;
  let dernierPasser = null;
  let bloqueur = null;

  const choisirVideo = () => {
    const videos = [...document.querySelectorAll('video')];
    const jouee = videos.find((v) => !v.paused && !v.ended && v.readyState > 0);
    if (jouee) return jouee;
    return (
      videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] ||
      null
    );
  };

  // Le cadre du lecteur : c'est là, et nulle part ailleurs dans la page, qu'on
  // cherchera le bouton à relayer.
  const cadreDuLecteur = (v) =>
    v.closest('[class*="player" i], [id*="player" i]') ||
    v.parentElement?.parentElement ||
    v.parentElement ||
    document.body;

  /**
   * L'élément est-il rendu ?
   *
   * Ni sa taille ni sa position ne peuvent en répondre : la vidéo sortie de
   * son flux effondre le lecteur, et son bouton se retrouve sans dimensions,
   * posé n'importe où. `checkVisibility` répond sur le rendu lui-même. On lui
   * fait ignorer `visibility`, que nous avons éteinte pour toute la page.
   */
  const seVoit = (el) => {
    if (!el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({
        opacityProperty: true,
        visibilityProperty: false,
        contentVisibilityAuto: true
      });
    }
    const s = getComputedStyle(el);
    return s.display !== 'none' && Number(s.opacity) > 0.05;
  };

  const etiquette = (el) =>
    (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();

  const estUnBouton = (e) => e.tagName === 'BUTTON' || e.getAttribute('role') === 'button';

  /**
   * Cherche dans un document donné : la page, ou un cadre publicitaire.
   *
   * Un bouton, et rien d'autre. YouTube empile autour du sien des conteneurs
   * qui portent le même nom et le même libellé, dont un de la taille du
   * lecteur : le prendre pour le bouton faisait paraître une pastille qui ne
   * faisait rien — et un vrai clic en son centre ouvrirait le site de
   * l'annonceur. Pour la même raison, un lien n'est jamais retenu.
   */
  const chercherDans = (racine) => {
    const connus = [...racine.querySelectorAll(BOUTONS_CONNUS)].filter(
      (e) => estUnBouton(e) && seVoit(e) && !ECARTES.test(String(e.className) + ' ' + etiquette(e))
    );
    if (connus.length) return { el: connus[0], texte: etiquette(connus[0]) || 'Passer' };

    for (const el of racine.querySelectorAll('button, [role="button"]')) {
      const texte = etiquette(el);
      if (!texte || texte.length > 48) continue;
      if (!PROMET_DE_PASSER.test(texte) || ECARTES.test(texte)) continue;
      if (!seVoit(el)) continue;
      return { el, texte };
    }
    return null;
  };

  const trouverPasser = () => {
    // Le cadre est cherché à chaque passage : un lecteur qui se redessine pour
    // une publicité laisserait sinon une référence morte derrière lui.
    const cadre = (video && video.isConnected && cadreDuLecteur(video)) || document.body;
    const ici = chercherDans(cadre);
    if (ici) return ici;

    // Certaines publicités arrivent dans leur propre cadre. On n'y entre que
    // s'il partage notre origine — sinon le navigateur nous le refuse, et
    // c'est très bien ainsi.
    for (const cadreInterne of cadre.querySelectorAll('iframe')) {
      let doc = null;
      try {
        doc = cadreInterne.contentDocument;
      } catch {
        continue;
      }
      if (!doc || !doc.body) continue;
      const dedans = chercherDans(doc);
      if (dedans) return dedans;
    }
    return null;
  };

  /**
   * Les passages que YouTube propose de sauter — « Passer rapidement », sur
   * une séquence sponsorisée que la plupart des spectateurs sautent.
   *
   * Chercher le bouton ne suffit pas : YouTube ne le dessine qu'après un geste
   * sur son lecteur (survol avec les commandes affichées, avance au clavier),
   * et il disparaît quelques secondes plus tard. Dans la fenêtre vidéo, ce
   * geste n'arrive jamais sur son lecteur, et le bouton n'existait donc pas.
   * On lit plutôt ce que la page a reçu : chaque passage, son début, sa fin, et
   * l'instant où le bouton mène.
   *
   * La réponse vit dans le monde de la page, hors de portée du preload isolé.
   */
  const INTERVALLE_MOMENTS = 2000;
  let moments = { lus: 0, liste: [] };

  const lireLesMoments = () => {
    try {
      return contextBridge.executeInMainWorld({
        func: () => {
          const lecteur = document.getElementById('movie_player');
          if (!lecteur || typeof lecteur.getWatchNextResponse !== 'function') return [];
          const idVideo = lecteur.getVideoData?.()?.video_id;
          const actions =
            lecteur.getWatchNextResponse()?.playerOverlays?.playerOverlayRenderer
              ?.timelyActionsOverlayViewModel?.timelyActionsOverlayViewModel?.timelyActions;
          if (!Array.isArray(actions)) return [];

          // Le bouton exécute une commande qui peut en envelopper d'autres :
          // on descend jusqu'au saut dans la vidéo.
          const saut = (noeud, profondeur) => {
            if (!noeud || typeof noeud !== 'object' || profondeur > 8) return null;
            const s = noeud.seekToVideoTimestampCommand;
            if (s && (!s.videoId || !idVideo || s.videoId === idVideo)) {
              const ms = Number(s.offsetFromVideoStartMilliseconds);
              if (Number.isFinite(ms) && ms >= 0) return ms;
            }
            for (const v of Object.values(noeud)) {
              const trouve = saut(v, profondeur + 1);
              if (trouve !== null) return trouve;
            }
            return null;
          };

          return actions
            .map((a) => a && a.timelyActionViewModel)
            .filter((vm) => vm && !vm.smartSkipMetadata?.loggingData?.isCounterfactual)
            .map((vm) => ({
              debut: Number(vm.startTimeMilliseconds),
              fin: Number(vm.endTimeMilliseconds),
              cible: saut(vm.rendererContext, 0) ?? Number(vm.smartSkipMetadata?.loggingData?.endMilliseconds),
              texte: String(vm.content?.buttonViewModel?.title || 'Passer rapidement')
            }))
            .filter((m) => [m.debut, m.fin, m.cible].every(Number.isFinite) && m.cible > m.debut);
        }
      });
    } catch {
      return [];
    }
  };

  const momentAPasser = () => {
    // Pendant une publicité, l'image est celle de l'annonce et son temps n'a
    // rien à voir avec celui de la vidéo : ses dix secondes tomberaient dans un
    // passage, et le bouton proposerait de sauter dans la publicité.
    if (document.querySelector('#movie_player.ad-showing')) return null;
    const maintenant = performance.now();
    if (maintenant - moments.lus > INTERVALLE_MOMENTS) {
      const liste = lireLesMoments();
      moments = { lus: maintenant, liste: Array.isArray(liste) ? liste : [] };
    }
    const t = video.currentTime * 1000;
    // Une seconde de marge : un saut qui ne ferait gagner qu'un instant
    // montrerait un bouton sans effet.
    const m = moments.liste.find((x) => t >= x.debut && t < x.fin && x.cible > t + 1000);
    return m ? { texte: m.texte, cible: m.cible } : null;
  };

  // --- Séquences sponsorisées ------------------------------------------------
  //
  // Sur YouTube, les passages sponsorisés que signale SponsorBlock sont sautés
  // d'eux-mêmes — dans la page comme dans la fenêtre vidéo, puisque c'est la
  // même page. Le processus principal interroge le service ; ici on regarde le
  // temps passer.
  const SUR_YOUTUBE = /^(www\.|m\.)?youtube\.com$/.test(location.hostname);
  // Le temps de lire « Sponsor passé » et de changer d'avis.
  const DUREE_REVENIR = 8000;
  let sponsorsActifs = true;
  let passages = { id: null, liste: [], faits: new Set() };
  let dernierSaut = null;

  const videoDeLaPage = () => new URLSearchParams(location.search).get('v') || null;

  const chargerPassages = async (id) => {
    passages = { id, liste: [], faits: new Set() };
    dernierSaut = null;
    if (!id || !sponsorsActifs) return;
    try {
      const liste = await ipcRenderer.invoke('sponsors:passages', id);
      // YouTube change de vidéo sans recharger la page : une réponse arrivée
      // après la suivante ne la concerne pas.
      if (passages.id === id && Array.isArray(liste)) passages.liste = liste;
    } catch {
      // Sans réponse, on regarde la vidéo en entier.
    }
  };

  const libelleDuSaut = (saut) => (saut.categorie === 'selfpromo' ? 'Autopromotion passée' : 'Sponsor passé');

  /**
   * Chaque passage n'est sauté qu'une fois : revenir en arrière pour le voir,
   * c'est l'avoir choisi. Jamais pendant une publicité, dont le temps n'est pas
   * celui de la vidéo, ni pendant la pause, où l'on cherche un instant à la main.
   */
  const surLeTemps = (e) => {
    const v = e.target;
    if (!sponsorsActifs || !passages.liste.length || !v || v.tagName !== 'VIDEO') return;
    if (v.paused || !v.closest('#movie_player')) return;
    if (document.querySelector('#movie_player.ad-showing')) return;
    const t = v.currentTime;
    // Une demi-seconde avant la fin, il ne reste rien à sauter.
    const saut = passages.liste.find((p) => !passages.faits.has(p.id) && t >= p.debut && t < p.fin - 0.5);
    if (!saut) return;
    passages.faits.add(saut.id);
    v.currentTime = Number.isFinite(v.duration) ? Math.min(saut.fin, v.duration) : saut.fin;
    dernierSaut = { ...saut, quand: performance.now() };
    // Dans la fenêtre vidéo, c'est sa barre qui le dit ; dans Hublink, un
    // message.
    if (video) ipcRenderer.send('video:etat', etat());
    else ipcRenderer.send('sponsors:passe', { debut: saut.debut, categorie: saut.categorie });
  };

  const revenir = (debut) => {
    const v = document.querySelector('#movie_player video');
    if (!v || !Number.isFinite(debut)) return;
    dernierSaut = null;
    v.currentTime = debut;
  };

  if (SUR_YOUTUBE) {
    // `timeupdate` ne remonte pas, mais se capture : on n'a pas à suivre les
    // lecteurs que YouTube remplace d'une vidéo à l'autre.
    window.addEventListener('timeupdate', surLeTemps, true);
    setInterval(() => {
      const id = videoDeLaPage();
      if (id !== passages.id) chargerPassages(id);
    }, 1000);
    ipcRenderer.on('sponsors:revenir', (_e, debut) => revenir(Number(debut)));
    ipcRenderer.on('sponsors:reglage', (_e, actif) => {
      sponsorsActifs = Boolean(actif);
      // Rallumé en cours de vidéo : on redemande ses passages.
      passages = { id: null, liste: [], faits: new Set() };
    });
  }

  // --- Ambiance --------------------------------------------------------------
  //
  // Pendant la lecture, la vidéo se prolonge derrière toute la page, agrandie
  // et adoucie, et la page devient translucide par-dessus. Coupé par défaut :
  // c'est un goût, pas un confort.
  //
  // Deux couches, toutes deux centrées sur le lecteur :
  // - un halo : la vidéo agrandie de 30 % autour du lecteur, fondue sur ses
  //   bords. Juste autour du cadre, c'est l'image qui continue ;
  // - au loin, les bords de l'image étirés jusqu'à ceux de la page, tirés
  //   d'une copie minuscule : chaque bande est large et lissée.
  // Une copie agrandie à toute la page faisait réapparaître les personnages
  // ailleurs, à une autre échelle ; des bords étirés depuis l'image pleine
  // traçaient de longues rayures.
  //
  // Recopiée à chaque image de la vidéo (`requestVideoFrameCallback`) dans une
  // toile de 384 points de large, au-dessus du seuil où Chromium confie la
  // toile à la carte graphique.
  const AMBIANCE_STYLE = `
    /* La couleur de fond de YouTube, qu'on vide plus bas : les tiroirs et les
       menus en ont encore besoin. Elle n'est pas lisible depuis html,
       YouTube ne la déclare que plus bas dans la page. */
    html.hublink-ambiance { --hublink-fond: #fff; }
    html.hublink-ambiance[dark] { --hublink-fond: #0f0f0f; }
    html.hublink-ambiance body { background: transparent !important; }
    html.hublink-ambiance ytd-app {
      --yt-spec-base-background: transparent;
      --yt-spec-general-background-a: transparent;
      background: transparent !important;
    }
    html.hublink-ambiance tp-yt-app-drawer,
    html.hublink-ambiance ytd-popup-container {
      --yt-spec-base-background: var(--hublink-fond);
      --yt-spec-general-background-a: var(--hublink-fond);
    }
    /* La page défile sous l'en-tête : sans flou, les deux textes se mêlent. */
    html.hublink-ambiance #masthead-container {
      background: color-mix(in srgb, var(--hublink-fond) 30%, transparent) !important;
      backdrop-filter: blur(24px);
    }
    html.hublink-ambiance ytd-watch-flexy[theater] #full-bleed-container,
    html.hublink-ambiance ytd-watch-flexy[fullscreen] #full-bleed-container {
      background: transparent !important;
    }
    /* L'ambiance de YouTube, plus timide, ferait double emploi. */
    html.hublink-ambiance #cinematics,
    html.hublink-ambiance #cinematics-container { display: none !important; }

    #hublink-ambiance {
      position: fixed;
      inset: 0;
      z-index: -1;
      overflow: hidden;
      pointer-events: none;
      display: none;
    }
    html.hublink-ambiance #hublink-ambiance { display: block; }
    html.hublink-sortie #hublink-ambiance { display: none !important; }
    #hublink-ambiance canvas {
      width: 100%;
      height: 100%;
      /* Sans agrandissement : le fond doit rester calé sous le lecteur. */
      filter: blur(24px) saturate(1.35) brightness(1.05);
    }
    html[dark] #hublink-ambiance canvas { filter: blur(24px) saturate(1.4) brightness(0.8); }
    /* Un voile léger : l'image doit franchement se voir. */
    #hublink-ambiance::after {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.3);
    }
    html[dark] #hublink-ambiance::after { background: rgba(15, 15, 15, 0.15); }
    /* La lisibilité est rendue au texte plutôt que prise à l'image : les gris
       de YouTube sont relevés, et chaque ligne se détache d'une ombre douce. */
    html.hublink-ambiance ytd-app {
      --yt-spec-text-secondary: rgba(0, 0, 0, 0.78);
      text-shadow: 0 1px 3px rgba(255, 255, 255, 0.55);
    }
    html.hublink-ambiance[dark] ytd-app {
      --yt-spec-text-primary: #fff;
      --yt-spec-text-secondary: rgba(255, 255, 255, 0.85);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    }
  `;
  const AMBIANCE_LARGEUR = 384;
  // La copie d'où partent les bords étirés : assez petite pour que chaque
  // bande couvre une large part de la page.
  const AMBIANCE_MINIATURE = 8;
  const HALO = 1.3;

  // `generation` arrête la boucle d'une vidéo qu'on ne suit plus : un rappel
  // déjà demandé arrive encore une fois, et doit se taire.
  const ambiance = {
    actif: false,
    boite: null,
    toile: null,
    ctx: null,
    // Toiles de travail, jamais affichées.
    miniature: null,
    halo: null,
    masque: null,
    cleMasque: '',
    analyse: null,
    // La partie de l'image hors bandes noires incrustées, en fractions.
    cadre: { x: 0, y: 0, l: 1, h: 1 },
    candidat: null,
    sourceCadre: '',
    releve: 0,
    video: null,
    generation: 0
  };

  const toileDeTravail = () => {
    const c = document.createElement('canvas');
    return { c, ctx: c.getContext('2d') };
  };

  const ajusterToile = () => {
    const { toile } = ambiance;
    if (!toile) return;
    toile.width = AMBIANCE_LARGEUR;
    toile.height = Math.max(1, Math.round((AMBIANCE_LARGEUR * innerHeight) / Math.max(1, innerWidth)));
    for (const t of [ambiance.halo, ambiance.masque]) {
      t.c.width = toile.width;
      t.c.height = toile.height;
    }
    ambiance.cleMasque = '';
    if (ambiance.video) peindre(ambiance.video);
  };

  /**
   * Le masque du halo : un rectangle aux bords fondus, recalculé seulement
   * quand le lecteur bouge. Le fondu va jusqu'à zéro avant le bord de l'image
   * agrandie, sans quoi son cadre se verrait.
   */
  const preparerMasque = (hx, hy, hw, hh) => {
    const cle = [hx, hy, hw, hh].map(Math.round).join(',');
    if (cle === ambiance.cleMasque) return;
    ambiance.cleMasque = cle;
    const { c, ctx } = ambiance.masque;
    const f = Math.max(2, Math.min(hw, hh) * 0.09);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.filter = `blur(${f}px)`;
    ctx.fillStyle = '#000';
    ctx.fillRect(hx + f * 1.6, hy + f * 1.6, hw - f * 3.2, hh - f * 3.2);
    ctx.filter = 'none';
  };

  /**
   * Les bandes noires incrustées dans l'image : un film au format cinéma
   * encodé en 16:9 porte du noir en haut et en bas, que le lecteur affiche
   * comme le reste. Prolonger ces bords-là donnait un fond noir. On cherche
   * donc, une fois par seconde, les rangées et colonnes entièrement sombres
   * sur une copie réduite, et l'ambiance part du bord de l'image réelle.
   *
   * Un cadrage n'est retenu qu'après deux relevés identiques, et jamais s'il
   * laisse moins d'un tiers de l'image : une scène sombre ou un fondu au noir
   * ne sont pas des bandes.
   */
  const ANALYSE_LARGEUR = 64;
  const SEUIL_NOIR = 26;

  const releverCadre = (v) => {
    const a = ambiance.analyse;
    const aw = ANALYSE_LARGEUR;
    const ah = Math.max(8, Math.round((aw * v.videoHeight) / v.videoWidth));
    if (a.c.width !== aw || a.c.height !== ah) {
      a.c.width = aw;
      a.c.height = ah;
    }
    a.ctx.drawImage(v, 0, 0, aw, ah);
    let px;
    try {
      px = a.ctx.getImageData(0, 0, aw, ah).data;
    } catch {
      // Image d'une autre origine : on la prend telle quelle.
      return null;
    }
    const sombre = (x, y) => {
      const i = (y * aw + x) * 4;
      return Math.max(px[i], px[i + 1], px[i + 2]) < SEUIL_NOIR;
    };
    const rangeeSombre = (y) => {
      for (let x = 0; x < aw; x++) if (!sombre(x, y)) return false;
      return true;
    };
    const colonneSombre = (x, haut, bas) => {
      for (let y = haut; y < bas; y++) if (!sombre(x, y)) return false;
      return true;
    };
    let haut = 0;
    while (haut < ah && rangeeSombre(haut)) haut++;
    let bas = ah;
    while (bas > haut && rangeeSombre(bas - 1)) bas--;
    let gauche = 0;
    while (gauche < aw && colonneSombre(gauche, haut, bas)) gauche++;
    let droite = aw;
    while (droite > gauche && colonneSombre(droite - 1, haut, bas)) droite--;
    // Une rangée de marge : la lisière d'une bande est souvent à demi sombre.
    if (haut > 0) haut++;
    if (bas < ah) bas--;
    if (gauche > 0) gauche++;
    if (droite < aw) droite--;
    if (bas - haut < ah / 3 || droite - gauche < aw / 3) return null;
    return { x: gauche / aw, y: haut / ah, l: (droite - gauche) / aw, h: (bas - haut) / ah };
  };

  const PLEIN_CADRE = { x: 0, y: 0, l: 1, h: 1 };
  const memeCadre = (a, b) => a && b && ['x', 'y', 'l', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.001);

  const suivreCadre = (v) => {
    // YouTube garde le même élément d'une vidéo à l'autre : la source dit si
    // on a changé de vidéo.
    if (v.currentSrc !== ambiance.sourceCadre) {
      ambiance.sourceCadre = v.currentSrc;
      ambiance.cadre = PLEIN_CADRE;
      ambiance.candidat = null;
      ambiance.releve = 0;
    }
    const maintenant = performance.now();
    if (maintenant - ambiance.releve < 1000) return;
    ambiance.releve = maintenant;
    const vu = releverCadre(v);
    if (!vu) return;
    if (memeCadre(vu, ambiance.candidat)) ambiance.cadre = vu;
    ambiance.candidat = vu;
  };

  const peindre = (v) => {
    if (!v.videoWidth || v.readyState < 2) return;
    if (document.fullscreenElement || document.documentElement.classList.contains('hublink-sortie')) return;
    const { toile, ctx } = ambiance;
    const L = toile.width;
    const H = toile.height;
    const k = L / innerWidth;
    const r = v.getBoundingClientRect();
    if (!r.width || !r.height) return;
    suivreCadre(v);
    const c = ambiance.cadre;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    // La partie utile de l'image, dans la vidéo…
    const sx = c.x * vw;
    const sy = c.y * vh;
    const sw = c.l * vw;
    const sh = c.h * vh;
    // … et là où elle s'affiche, bandes noires du lecteur exclues.
    const fit = Math.min(r.width / vw, r.height / vh);
    const ox = r.left + (r.width - vw * fit) / 2;
    const oy = r.top + (r.height - vh * fit) / 2;
    const x = (ox + sx * fit) * k;
    const y = (oy + sy * fit) * k;
    const w = sw * fit * k;
    const h = sh * fit * k;

    // Au loin : les bords de la miniature, étirés.
    const mini = ambiance.miniature;
    const mw = AMBIANCE_MINIATURE;
    const mh = Math.max(3, Math.round((mw * sh) / sw));
    if (mini.c.width !== mw || mini.c.height !== mh) {
      mini.c.width = mw;
      mini.c.height = mh;
    }
    mini.ctx.drawImage(v, sx, sy, sw, sh, 0, 0, mw, mh);
    ctx.imageSmoothingQuality = 'high';
    const bloc = (bx, by, bl, bh, dx, dy, dl, dh) => {
      if (dl > 0 && dh > 0) ctx.drawImage(mini.c, bx, by, bl, bh, dx, dy, dl, dh);
    };
    const droite = x + w;
    const bas = y + h;
    bloc(0, 0, 1, mh, 0, y, x, h);
    bloc(mw - 1, 0, 1, mh, droite, y, L - droite, h);
    bloc(0, 0, mw, 1, x, 0, w, y);
    bloc(0, mh - 1, mw, 1, x, bas, w, H - bas);
    bloc(0, 0, 1, 1, 0, 0, x, y);
    bloc(mw - 1, 0, 1, 1, droite, 0, L - droite, y);
    bloc(0, mh - 1, 1, 1, 0, bas, x, H - bas);
    bloc(mw - 1, mh - 1, 1, 1, droite, bas, L - droite, H - bas);
    ctx.drawImage(mini.c, x, y, w, h);

    // Autour de l'image : la vidéo agrandie depuis son centre, fondue.
    const hw = w * HALO;
    const hh = h * HALO;
    const hx = x - (hw - w) / 2;
    const hy = y - (hh - h) / 2;
    preparerMasque(hx, hy, hw, hh);
    const halo = ambiance.halo;
    halo.ctx.clearRect(0, 0, halo.c.width, halo.c.height);
    halo.ctx.drawImage(v, sx, sy, sw, sh, hx, hy, hw, hh);
    halo.ctx.globalCompositeOperation = 'destination-in';
    halo.ctx.drawImage(ambiance.masque.c, 0, 0);
    halo.ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(halo.c, 0, 0);
  };

  /**
   * Suit l'image du lecteur, au rythme de la vidéo et pas de l'écran : rien
   * n'est redessiné en pause, et une vidéo à 60 images le reste en fond. Un
   * saut dans la vidéo présente une image, et donc la redessine aussi.
   */
  const suivreImage = () => {
    const v = document.querySelector('#movie_player video');
    if (v === ambiance.video) return;
    ambiance.video = v;
    const generation = ++ambiance.generation;
    if (!v) return;
    const aChaqueImage = () => {
      if (generation !== ambiance.generation) return;
      peindre(v);
      v.requestVideoFrameCallback(aChaqueImage);
    };
    peindre(v);
    v.requestVideoFrameCallback(aChaqueImage);
  };

  const monterAmbiance = () => {
    if (!ambiance.boite) {
      const style = document.createElement('style');
      style.textContent = AMBIANCE_STYLE;
      const boite = document.createElement('div');
      boite.id = 'hublink-ambiance';
      const toile = document.createElement('canvas');
      boite.appendChild(toile);
      // Sous `html` et non sous `body` : YouTube ne touche pas à ce qu'il n'a
      // pas posé là.
      document.documentElement.append(style, boite);
      Object.assign(ambiance, {
        boite,
        toile,
        ctx: toile.getContext('2d', { alpha: false }),
        miniature: toileDeTravail(),
        halo: toileDeTravail(),
        masque: toileDeTravail(),
        analyse: (() => {
          const c = document.createElement('canvas');
          return { c, ctx: c.getContext('2d', { willReadFrequently: true }) };
        })()
      });
      ajusterToile();
      addEventListener('resize', ajusterToile);
      // Le lecteur défile avec la page : en pause, aucune image ne viendrait
      // recaler le fond.
      addEventListener('scroll', () => ambiance.video && peindre(ambiance.video), { passive: true });
    }
    document.documentElement.classList.add('hublink-ambiance');
  };

  const demonterAmbiance = () => {
    document.documentElement.classList.remove('hublink-ambiance');
    ambiance.video = null;
    ambiance.generation++;
  };

  // Seulement sur une page de lecture : l'accueil et les résultats n'ont pas
  // d'image à prolonger. YouTube change de page sans recharger, et remplace
  // parfois l'élément vidéo : on le revérifie chaque seconde.
  const suivreAmbiance = () => {
    const voulu = ambiance.actif && location.pathname === '/watch';
    const monte = document.documentElement.classList.contains('hublink-ambiance');
    if (voulu && !monte) monterAmbiance();
    else if (!voulu && monte) demonterAmbiance();
    if (voulu) suivreImage();
  };

  if (SUR_YOUTUBE) {
    setInterval(suivreAmbiance, 1000);
    ipcRenderer
      .invoke('ambiance:actif')
      .then((actif) => {
        ambiance.actif = Boolean(actif);
        suivreAmbiance();
      })
      .catch(() => {});
    ipcRenderer.on('ambiance:reglage', (_e, actif) => {
      ambiance.actif = Boolean(actif);
      suivreAmbiance();
    });
  }

  // --- Présence d'une vidéo --------------------------------------------------
  //
  // Le bouton du mode vidéo ne paraît que si la page montre vraiment une
  // vidéo : un élément assez grand pour être regardé, ou le lecteur d'un site
  // vidéo intégré dans un cadre, que ce preload ne voit pas de l'intérieur.
  // Un son de notification, un aperçu joué au survol d'une miniature ne
  // comptent pas.
  const APERCUS = 'ytd-video-preview, #video-preview, #inline-preview-player, ytd-thumbnail';
  const CADRES_VIDEO = /\/\/(www\.)?(youtube(-nocookie)?\.com\/embed|player\.vimeo\.com|(www\.)?dailymotion\.com\/embed|player\.twitch\.tv)/;
  const assezGrand = (el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 200 && r.height >= 110;
  };
  const montreUneVideo = () =>
    [...document.querySelectorAll('video')].some(
      (v) => (v.readyState > 0 || v.currentSrc) && !v.closest(APERCUS) && seVoit(v) && assezGrand(v)
    ) ||
    [...document.querySelectorAll('iframe')].some((f) => CADRES_VIDEO.test(f.src) && seVoit(f) && assezGrand(f));

  let presence = false;
  setInterval(() => {
    // Sortie dans la fenêtre vidéo, la page est masquée mais la vidéo y est
    // toujours : le bouton doit rester pour l'y ramener.
    const maintenant = Boolean(video) || montreUneVideo();
    if (maintenant === presence) return;
    presence = maintenant;
    ipcRenderer.send('media:presence', presence);
  }, 1000);

  /**
   * Sur YouTube, le son passe par le lecteur et non par l'élément vidéo.
   *
   * Le lecteur tient son propre niveau, et le réapplique à chaque publicité et
   * à chaque vidéo suivante. Réglé sur l'élément seul, le son montait dans la
   * fenêtre vidéo puis retombait à la première annonce. Mesuré : élément monté
   * à 100 %, lecteur resté à 50, 28 % pendant la publicité et 23 % sur la vidéo
   * d'après. C'était le son qui « baisse tout seul ».
   *
   * On lit aussi le niveau du lecteur, pas celui de l'élément : YouTube y
   * applique sa normalisation, et 100 % devient 0,46 sur un clip très fort.
   * Relire l'élément puis renvoyer sa valeur au lecteur ferait baisser le son
   * d'autant à chaque geste.
   *
   * `null` hors du lecteur de YouTube : l'élément reste alors la seule prise.
   */
  const sonYouTube = (quoi, valeur) => {
    if (!video || !video.closest('#movie_player')) return null;
    try {
      return contextBridge.executeInMainWorld({
        func: (quoi, valeur) => {
          const lecteur = document.getElementById('movie_player');
          if (!lecteur || typeof lecteur.setVolume !== 'function') return null;
          if (quoi === 'volume') {
            lecteur.setVolume(Math.round(valeur * 100));
            if (valeur > 0) lecteur.unMute();
          }
          if (quoi === 'muet') lecteur.isMuted() ? lecteur.unMute() : lecteur.mute();
          return { volume: lecteur.getVolume() / 100, muet: lecteur.isMuted() };
        },
        args: [quoi, valeur]
      });
    } catch {
      return null;
    }
  };

  const etat = () => {
    if (!video || !video.isConnected) return null;
    // Un bouton affiché passe en premier : c'est lui qui ignore une publicité.
    dernierPasser = trouverPasser() || momentAPasser();
    const son = sonYouTube('lire') || { volume: video.volume, muet: video.muted };
    return {
      pause: video.paused,
      volume: son.volume,
      muet: son.muet,
      duree: Number.isFinite(video.duration) ? video.duration : 0,
      position: video.currentTime || 0,
      passer: dernierPasser ? dernierPasser.texte : null,
      sponsorPasse:
        dernierSaut && performance.now() - dernierSaut.quand < DUREE_REVENIR ? libelleDuSaut(dernierSaut) : null,
      // Sans le titre, la fenêtre ne dit pas ce qu'elle joue.
      titre: (document.title || '').replace(/\s+/g, ' ').trim(),
      // Les proportions de l'image, pour que la fenêtre les épouse : une vidéo
      // verticale n'a rien à faire dans un cadre en seize neuvièmes.
      ratio: video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 0
    };
  };

  // Une vidéo sortie ne se fait pas défiler : la molette ferait glisser la
  // page derrière une image qui, elle, ne bouge pas.
  //
  // Elle ne règle pas non plus le son. Windows envoie la molette à la fenêtre
  // qui est sous le curseur, même quand on est ailleurs : la vidéo posée au
  // bord d'un jeu recevait chaque coup de molette de la partie dès que le
  // curseur passait dessus, et le son baissait « tout seul », petit à petit.
  // Le son ne se règle qu'au curseur et au clic, dans la barre.
  const molette = (e) => {
    e.preventDefault();
  };

  const arreter = () => {
    finirLeClic();
    clearInterval(veille);
    veille = null;
    if (bloqueur) window.removeEventListener('wheel', bloqueur, { capture: true });
    bloqueur = null;
    document.documentElement.classList.remove('hublink-sortie');
    if (video) video.removeAttribute('data-hublink-video');
    document
      .querySelectorAll('[data-hublink-chemin], [data-hublink-cadre]')
      .forEach((n) => {
        n.removeAttribute('data-hublink-chemin');
        n.removeAttribute('data-hublink-cadre');
      });
    if (style) style.remove();
    style = null;
    video = null;
    conteneur = null;
    dernierPasser = null;
    moments = { lus: 0, liste: [] };
  };

  // YouTube ignore un clic fabriqué par script sur son bouton : il n'accepte
  // que celui dont le moteur garantit qu'il vient de l'utilisateur. On prépare
  // donc l'endroit, et le processus principal y envoie un vrai clic.
  let clicEnCours = null;

  const finirLeClic = () => {
    if (!clicEnCours) return;
    clearTimeout(clicEnCours.garde);
    clicEnCours.bouton.removeAttribute('data-hublink-cible');
    document.documentElement.classList.remove('hublink-clic');
    scrollTo(clicEnCours.defilement.x, clicEnCours.defilement.y);
    clicEnCours = null;
  };

  const preparerLeClic = (bouton) => {
    finirLeClic();
    clicEnCours = { bouton, defilement: { x: scrollX, y: scrollY }, garde: setTimeout(finirLeClic, 900) };
    bouton.setAttribute('data-hublink-cible', '');
    document.documentElement.classList.add('hublink-clic');
    // La vidéo est fixée à l'écran : faire défiler la page ne se voit pas, et
    // amène le bouton là où un clic peut l'atteindre.
    bouton.scrollIntoView({ block: 'center', inline: 'center' });
    const r = bouton.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return void finirLeClic();
    ipcRenderer.send('video:cliquer-ici', { x, y });
  };

  ipcRenderer.on('video:clic-fait', finirLeClic);

  ipcRenderer.on('video:sortir', () => {
    arreter();
    video = choisirVideo();
    if (!video) return ipcRenderer.send('video:etat', { absente: true });
    conteneur = cadreDuLecteur(video);

    video.setAttribute('data-hublink-video', '');
    // Un ancêtre transformé redéfinit ce à quoi « fixé » se rapporte : la
    // vidéo se retrouverait calée sur lui, pas sur la fenêtre.
    for (let n = video.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      n.setAttribute('data-hublink-chemin', '');
    }
    style = document.createElement('style');
    style.textContent = STYLE;
    document.documentElement.appendChild(style);
    document.documentElement.classList.add('hublink-sortie');

    bloqueur = molette;
    window.addEventListener('wheel', bloqueur, { capture: true, passive: false });

    veille = setInterval(() => {
      const e = etat();
      if (e) ipcRenderer.send('video:etat', e);
      else ipcRenderer.send('video:etat', { absente: true });
    }, 500);
    ipcRenderer.send('video:etat', etat() || { absente: true });
  });

  ipcRenderer.on('video:rentrer', arreter);

  ipcRenderer.on('video:commande', (_e, { quoi, valeur }) => {
    if (!video) return;
    if (quoi === 'lecture') video.paused ? video.play() : video.pause();
    if (quoi === 'volume') {
      const niveau = Math.min(1, Math.max(0, Number(valeur) || 0));
      if (!sonYouTube('volume', niveau)) {
        video.volume = niveau;
        if (niveau > 0) video.muted = false;
      }
    }
    if (quoi === 'muet' && !sonYouTube('muet')) video.muted = !video.muted;
    if (quoi === 'avancer') video.currentTime += Number(valeur) || 10;
    if (quoi === 'aller') video.currentTime = Math.max(0, Number(valeur) || 0);
    if (quoi === 'passer' && dernierPasser) {
      if (dernierPasser.el) {
        if (dernierPasser.el.isConnected) preparerLeClic(dernierPasser.el);
      } else {
        video.currentTime = dernierPasser.cible / 1000;
      }
    }
    if (quoi === 'revenir' && dernierSaut) revenir(dernierSaut.debut);
    const e = etat();
    if (e) ipcRenderer.send('video:etat', e);
  });
}

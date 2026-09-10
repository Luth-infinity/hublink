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

  const etat = () => {
    if (!video || !video.isConnected) return null;
    dernierPasser = trouverPasser();
    return {
      pause: video.paused,
      volume: video.volume,
      muet: video.muted,
      duree: Number.isFinite(video.duration) ? video.duration : 0,
      position: video.currentTime || 0,
      passer: dernierPasser ? dernierPasser.texte : null,
      // Sans le titre, la fenêtre ne dit pas ce qu'elle joue.
      titre: (document.title || '').replace(/\s+/g, ' ').trim(),
      // Les proportions de l'image, pour que la fenêtre les épouse : une vidéo
      // verticale n'a rien à faire dans un cadre en seize neuvièmes.
      ratio: video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 0
    };
  };

  // Une vidéo sortie ne se fait pas défiler : la molette ferait glisser la
  // page derrière une image qui, elle, ne bouge pas. Elle règle le son, comme
  // dans n'importe quel lecteur.
  // Une molette à roue libre — la MX Master et ses cousines — envoie des
  // dizaines de crans minuscules par geste, et continue sur sa lancée une fois
  // lâchée. Compter cinq pour cent par événement vidait le son d'un seul
  // lancer, et le faisait « tout seul » pendant que la roue finissait de
  // tourner. On mesure donc la distance parcourue, et un même geste ne peut
  // déplacer le volume que d'un cinquième.
  const VOLUME_PAR_PIXEL = 0.0005;
  const MAX_PAR_GESTE = 0.2;
  const PAUSE_ENTRE_GESTES = 350;
  let geste = { depart: 0, cumul: 0, dernier: 0 };

  const molette = (e) => {
    e.preventDefault();
    if (!video) return;
    const pixels = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const maintenant = performance.now();
    if (maintenant - geste.dernier > PAUSE_ENTRE_GESTES) {
      geste = { depart: video.muted ? 0 : video.volume, cumul: 0, dernier: maintenant };
    }
    geste.dernier = maintenant;
    geste.cumul += pixels;
    const ecart = Math.max(-MAX_PAR_GESTE, Math.min(MAX_PAR_GESTE, -geste.cumul * VOLUME_PAR_PIXEL));
    video.volume = Math.min(1, Math.max(0, geste.depart + ecart));
    if (video.volume > 0) video.muted = false;
    ipcRenderer.send('video:etat', etat());
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
      video.volume = Math.min(1, Math.max(0, Number(valeur) || 0));
      if (video.volume > 0) video.muted = false;
    }
    if (quoi === 'muet') video.muted = !video.muted;
    if (quoi === 'avancer') video.currentTime += Number(valeur) || 10;
    if (quoi === 'aller') video.currentTime = Math.max(0, Number(valeur) || 0);
    if (quoi === 'passer' && dernierPasser && dernierPasser.el.isConnected) preparerLeClic(dernierPasser.el);
    const e = etat();
    if (e) ipcRenderer.send('video:etat', e);
  });
}

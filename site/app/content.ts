/**
 * Le texte du site, dans les deux langues.
 *
 * Tout est ici plutôt que dans la page : une seule mise en page à maintenir,
 * et une traduction qui ne peut pas oublier un paragraphe — le type impose que
 * les deux versions disent la même chose.
 */

export type Locale = 'en' | 'fr';

export type Contenu = {
  meta: { title: string; description: string };
  nav: { fonctions: string; versions: string; telecharger: string; autreLangue: string };
  hero: {
    badge: (win: string, mac: string) => string;
    titre: string;
    texte: string;
    telecharger: string;
    code: string;
  };
  shot: { alt: string };
  pourquoi: { titre: string; p1: string; p2: string; p3: string };
  fonctions: { titre: string; cartes: { titre: string; texte: string }[] };
  chiffres: {
    titre: string;
    sous: string;
    items: { valeur: string; legende: string }[];
  };
  discretion: { titre: string; p1: string; p2: string; alt: string };
  sombre: { titre: string; p1: string; p2: string; alt: string };
  aSavoir: { titre: string; intro: string; points: [string, string][] };
  telecharger: {
    titre: string;
    sous: (win: string, mac: string) => string;
    mac: string;
    win: string;
    noteAvant: string;
    noteLien: string;
    noteApres: (win: string) => string;
  };
  changelog: {
    titre: string;
    sous: (n: number) => string;
    actuelle: string;
    vide: string;
    detail: string;
  };
  soutenir: { titre: string; texte: string; cafe: string; etoile: string };
  footer: { signature: string; github: string; versions: string; bug: string; soutenir: string };
};

export const fr: Contenu = {
  meta: {
    title: 'Hublink — un client desktop pour vos comptes clients',
    description:
      "Regroupez les webapps de plusieurs comptes dans une seule fenêtre. Chaque compte garde sa session : deux Teams, deux Slack, deux Gmail cohabitent sans se déconnecter."
  },
  nav: {
    fonctions: 'Fonctionnalités',
    versions: 'Versions',
    telecharger: 'Télécharger',
    autreLangue: 'EN'
  },
  hero: {
    badge: (win, mac) => `Version ${win} sur Windows — ${mac} sur macOS`,
    titre: 'Un compte, une bulle.',
    texte:
      "Hublink range les webapps de vos différents comptes dans une seule fenêtre. Chacun garde sa propre session : deux Teams, deux Slack, deux Gmail cohabitent sans jamais se déconnecter l'un l'autre. Et d'un bouton, vous masquez vos autres clients le temps d'un partage d'écran.",
    telecharger: 'Télécharger gratuitement',
    code: 'Voir le code'
  },
  shot: {
    alt: "La fenêtre de Hublink : à gauche le panneau des services regroupés par compte, à droite la webapp affichée."
  },
  pourquoi: {
    titre: 'Le problème, très concrètement.',
    p1: "Vous travaillez pour trois clients. Chacun a son Microsoft 365, son Slack, son intranet. Dans un navigateur, ces comptes se marchent dessus : vous ouvrez Teams pour le client A, on vous connecte au client B, et il faut se déconnecter pour recommencer.",
    p2: "Les profils Chrome règlent le problème mais en créent un autre : trois fenêtres, trois docks, trois endroits où chercher. Et sur Windows, Teams propose obstinément la clé d'accès de la session — qui n'est jamais le bon compte.",
    p3: 'Hublink met tout dans une fenêtre, et garantit que les sessions ne se croisent jamais.'
  },
  fonctions: {
    titre: "Ce qu'il fait, sans le reste.",
    cartes: [
      {
        titre: 'Sessions cloisonnées',
        texte:
          "Chaque compte a sa propre partition Chromium. Les services d'un même compte partagent leurs cookies — un seul login SSO pour la messagerie, l'intranet et les outils. Ceux d'un autre compte ne voient rien."
      },
      {
        titre: 'Extensions Chrome',
        texte:
          "Installables depuis le Store, ou depuis un .crx. Activables compte par compte : uBlock partout, le correcteur seulement chez le client qui en a besoin."
      },
      {
        titre: 'Mise en veille',
        texte:
          "Un service ouvert coûte environ 110 Mo. Ceux qu'on ne consulte plus sont libérés après un délai réglable, et se rechargent au clic sans déconnexion."
      },
      {
        titre: 'Navigateur intégré',
        texte:
          "Un commutateur, et le panneau passe des services aux onglets. Une session à part, qui n'emporte aucun de vos comptes : pour chercher quelque chose sans quitter la fenêtre."
      },
      {
        titre: 'Sans publicité',
        texte:
          "Les régies connues sont bloquées d'emblée dans le navigateur, sans rien installer. Un réglage suffit à tout rétablir si un site en dépend."
      },
      {
        titre: 'Emporter sa configuration',
        texte:
          "Vos comptes et vos services dans un fichier, à relire sur une autre machine. Les connexions, elles, ne bougent pas : elles restent sur le poste."
      },
      {
        titre: 'WhatsApp à portée',
        texte:
          "Votre messagerie n'appartient à aucun client : elle a son bouton et sa propre session, et reste joignable quel que soit le compte affiché."
      },
      {
        titre: 'Capture intégrée',
        texte:
          "Page entière ou zone visible, vers un fichier ou le presse-papiers, en deux clics depuis la barre d'outils. Rien à installer."
      },
      {
        titre: 'Le bon compte du premier coup',
        texte:
          "Les portails Microsoft proposent d'emblée la clé d'accès de la session Windows ou macOS — rarement celle du client sur lequel vous travaillez. Hublink laisse la main au mot de passe du compte voulu."
      },
      {
        titre: 'Thème teinté',
        texte:
          "Clair, sombre ou système. Quand vous filtrez sur un compte, sa couleur voile légèrement l'interface — de quoi savoir chez qui vous êtes sans lire une étiquette."
      }
    ]
  },
  chiffres: {
    titre: 'Optimisé parce que mesuré.',
    sous: "Chaque chiffre vient d'un banc de test reproductible, pas d'une impression.",
    items: [
      { valeur: '842 → 525 Mo', legende: 'mémoire sur quatre services, une fois les inactifs mis en veille' },
      { valeur: '92 → 1 Ko/s', legende: 'trafic interne après refonte des mises à jour d’état' },
      { valeur: '0,6 %', legende: 'de processeur au repos, une webapp active à l’écran' }
    ]
  },
  discretion: {
    titre: 'Vos autres clients ne regardent pas.',
    p1: "Vous partagez votre écran en visio. À gauche, le nom et le logo des deux autres clients pour qui vous travaillez. Un bouton les floute, et ne laisse lisible que celui à qui vous parlez.",
    p2: 'Rien ne les trahit : ni les info-bulles, ni la liste des comptes.',
    alt: "Le panneau de Hublink : le client affiché reste lisible, les autres sont floutés."
  },
  sombre: {
    titre: 'Il sait où vous êtes.',
    p1: "Filtrez sur un compte : la liste ne montre plus que ses services, et sa couleur teinte discrètement le cadre. Assez pour ne pas envoyer le mauvais message au mauvais client, jamais assez pour vous distraire de la page.",
    p2: "Le panneau se réduit en rail d'icônes d'un raccourci, et rend 190 pixels à la page.",
    alt: 'Hublink en thème sombre, la teinte du compte actif habillant le panneau.'
  },
  aSavoir: {
    titre: 'Bon à savoir.',
    intro:
      "Quatre points à connaître avant d'installer. Rien de bloquant, mais autant les dire ici plutôt que vous laisser les découvrir.",
    points: [
      [
        'Mots de passe',
        "Les extensions de gestionnaires s'installent et s'ouvrent, mais ne vont pas au bout : il leur manque des API que le moteur n'expose pas. Le contournement qui marche : ajoutez le coffre web de votre gestionnaire comme service, et copiez-collez."
      ],
      [
        'Captures d’écran',
        "Hublink capture lui-même, page entière comprise, depuis la barre d'outils. Inutile d'installer une extension dédiée : elles s'appuient sur une API que le moteur n'expose pas."
      ],
      [
        'Tout reste sur votre machine',
        "Aucun serveur, aucun compte à créer, rien qui parte ailleurs. En contrepartie, vos services ne se synchronisent pas d'un poste à l'autre : on les rajoute une fois par machine."
      ],
      [
        'Premier lancement',
        "Les binaires ne sont pas encore signés : clic droit puis « Ouvrir » sur macOS, « Informations complémentaires » puis « Exécuter quand même » sur Windows. Une seule fois, puis on n'y revient plus."
      ]
    ]
  },
  telecharger: {
    titre: 'Prenez-le, il est libre.',
    sous: (win, mac) =>
      `Gratuit, sous licence MIT, sans compte à créer. Version ${win} sur Windows, ${mac} sur macOS.`,
    mac: 'macOS — Apple Silicon',
    win: 'Windows — 64 bits',
    noteAvant: 'Mac Intel, Windows ARM et les versions précédentes sont ',
    noteLien: 'sur la page des versions',
    noteApres: (win) => `. La ${win} arrive prochainement sur macOS.`
  },
  changelog: {
    titre: 'Ce qui a changé.',
    sous: (n) => `Les ${n} dernières versions, telles que publiées sur GitHub.`,
    actuelle: 'actuelle',
    vide: 'Corrections et ajustements.',
    detail: 'Détail et fichiers'
  },
  soutenir: {
    titre: "Hublink est gratuit. Il n'est pas gratuit à faire.",
    texte:
      "Pas de compte, pas d'abonnement, pas de collecte : l'app est libre et le restera. Si elle vous fait gagner du temps chaque jour, un café aide à payer les heures du soir.",
    cafe: 'Offrir un café',
    etoile: 'Ou juste une étoile sur GitHub'
  },
  footer: {
    signature: 'Hublink — un outil de Luth',
    github: 'GitHub',
    versions: 'Versions',
    bug: 'Signaler un bug',
    soutenir: 'Soutenir'
  }
};

export const en: Contenu = {
  meta: {
    title: 'Hublink — a desktop client for your client accounts',
    description:
      'Keep the web apps of several accounts in a single window. Each account keeps its own session: two Teams, two Slacks, two Gmails live side by side without signing each other out.'
  },
  nav: {
    fonctions: 'Features',
    versions: 'Releases',
    telecharger: 'Download',
    autreLangue: 'FR'
  },
  hero: {
    badge: (win, mac) => `Version ${win} on Windows — ${mac} on macOS`,
    titre: 'One account, one bubble.',
    texte:
      'Hublink keeps the web apps of your different accounts in a single window. Each one keeps its own session: two Teams, two Slacks, two Gmails live side by side without ever signing each other out. And one button hides your other clients while you share your screen.',
    telecharger: 'Download for free',
    code: 'View the code'
  },
  shot: {
    alt: 'The Hublink window: services grouped by account on the left, the selected web app on the right.'
  },
  pourquoi: {
    titre: 'The problem, plainly.',
    p1: 'You work for three clients. Each has its own Microsoft 365, its own Slack, its own intranet. In a browser those accounts collide: you open Teams for client A, you get signed in as client B, and you have to sign out to start over.',
    p2: 'Chrome profiles solve that but create another problem: three windows, three docks, three places to look. And on Windows, Teams keeps offering the passkey of your computer session — never the right account.',
    p3: 'Hublink puts everything in one window, and makes sure the sessions never cross.'
  },
  fonctions: {
    titre: 'What it does, and nothing else.',
    cartes: [
      {
        titre: 'Separate sessions',
        texte:
          'Every account gets its own Chromium partition. Services in the same account share their cookies — one SSO sign-in for mail, intranet and tools. Services from another account see none of it.'
      },
      {
        titre: 'Chrome extensions',
        texte:
          'Install them from the Store, or from a .crx file. Turn them on account by account: uBlock everywhere, the spell checker only for the client who needs it.'
      },
      {
        titre: 'Sleep when idle',
        texte:
          'An open service costs about 110 MB. The ones you stop looking at are freed after a delay you choose, and come back on a click without signing you out.'
      },
      {
        titre: 'Built-in browser',
        texte:
          'One switch, and the panel turns from services into tabs. A session of its own, carrying none of your accounts: for looking something up without leaving the window.'
      },
      {
        titre: 'No ads',
        texte:
          'Known ad networks are blocked in the browser from the start, with nothing to install. One setting brings them all back if a site depends on them.'
      },
      {
        titre: 'Take your setup with you',
        texte:
          'Your accounts and services in a file, to read back on another machine. Your sign-ins stay put: they never leave the computer.'
      },
      {
        titre: 'WhatsApp within reach',
        texte:
          'Your own messaging belongs to no client: it gets its own button and its own session, and stays reachable whatever account is on screen.'
      },
      {
        titre: 'Screenshots included',
        texte:
          'Full page or visible area, to a file or the clipboard, two clicks from the toolbar. Nothing to install.'
      },
      {
        titre: 'The right account, first try',
        texte:
          'Microsoft portals offer the passkey of your Windows or macOS session — rarely the client you are working for. Hublink hands control back to the password of the account you want.'
      },
      {
        titre: 'Tinted theme',
        texte:
          'Light, dark or system. When you filter on an account, its colour lightly washes over the interface — enough to know whose desk you are at without reading a label.'
      }
    ]
  },
  chiffres: {
    titre: 'Optimised because measured.',
    sous: 'Every figure comes from a repeatable benchmark, not from an impression.',
    items: [
      { valeur: '842 → 525 MB', legende: 'memory across four services, once the idle ones are asleep' },
      { valeur: '92 → 1 KB/s', legende: 'internal traffic after reworking how state updates are sent' },
      { valeur: '0.6 %', legende: 'of the processor at rest, with a web app on screen' }
    ]
  },
  discretion: {
    titre: 'Your other clients are not watching.',
    p1: 'You are sharing your screen on a call. On the left, the name and logo of the two other clients you work for. One button blurs them, and leaves readable only the one you are talking to.',
    p2: 'Nothing gives them away: not the tooltips, not the account list.',
    alt: 'The Hublink panel: the client on screen stays readable, the others are blurred.'
  },
  sombre: {
    titre: 'It knows where you are.',
    p1: 'Filter on an account: the list shows only its services, and its colour quietly tints the frame. Enough not to send the wrong message to the wrong client, never enough to pull you away from the page.',
    p2: 'The panel folds into a rail of icons with a shortcut, and gives 190 pixels back to the page.',
    alt: 'Hublink in dark theme, the active account colour washing over the panel.'
  },
  aSavoir: {
    titre: 'Worth knowing.',
    intro:
      'Four things to know before installing. Nothing blocking, but better said here than left for you to find out.',
    points: [
      [
        'Password managers',
        'Their extensions install and open, but do not go all the way: they rely on APIs the engine does not expose. The workaround that works: add your manager’s web vault as a service, and copy-paste.'
      ],
      [
        'Screenshots',
        'Hublink captures pages itself, full page included, from the toolbar. No need for a dedicated extension: those rely on an API the engine does not expose.'
      ],
      [
        'Everything stays on your machine',
        'No server, no account to create, nothing leaving your computer. In exchange, your services do not sync between machines: you add them once per computer.'
      ],
      [
        'First launch',
        'The binaries are not signed yet: right-click then “Open” on macOS, “More info” then “Run anyway” on Windows. Once, and never again.'
      ]
    ]
  },
  telecharger: {
    titre: 'Take it, it is free.',
    sous: (win, mac) =>
      `Free, MIT licensed, no account to create. Version ${win} on Windows, ${mac} on macOS.`,
    mac: 'macOS — Apple Silicon',
    win: 'Windows — 64-bit',
    noteAvant: 'Intel Macs, ARM Windows and earlier versions are ',
    noteLien: 'on the releases page',
    noteApres: (win) => `. ${win} is coming to macOS shortly.`
  },
  changelog: {
    titre: 'What changed.',
    sous: (n) => `The last ${n} releases, as published on GitHub.`,
    actuelle: 'current',
    vide: 'Fixes and adjustments.',
    detail: 'Details and files'
  },
  soutenir: {
    titre: 'Hublink is free. Making it is not.',
    texte:
      'No account, no subscription, no tracking: the app is free and will stay that way. If it saves you time every day, a coffee helps pay for the evenings.',
    cafe: 'Buy a coffee',
    etoile: 'Or just a star on GitHub'
  },
  footer: {
    signature: 'Hublink — a tool by Luth',
    github: 'GitHub',
    versions: 'Releases',
    bug: 'Report a bug',
    soutenir: 'Support'
  }
};

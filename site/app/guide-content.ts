/**
 * Le texte du guide d'installation, dans les deux langues.
 *
 * Les binaires ne sont pas signés : Windows et macOS les accueillent avec un
 * avertissement, et sur macOS le bouton par défaut de la boîte « endommagé »
 * met l'app à la corbeille. Le guide dit où cliquer, et répond aux questions
 * qu'un avertissement de sécurité fait naître à juste titre.
 *
 * Les libellés entre guillemets sont ceux qu'affiche le système dans la langue
 * de la page : un visiteur doit pouvoir les retrouver tels quels à l'écran.
 */

import type { Locale } from './content';

export type Etape = { titre: string; texte: string; commande?: string };

export type Question = {
  question: string;
  reponse: string;
  /** Commandes de vérification, une par plateforme. */
  commandes?: { libelle: string; commande: string }[];
  lien?: { libelle: string; href: 'release' | 'actions' | 'issues' | 'soutenir' };
};

export type Guide = {
  meta: { title: string; description: string };
  retour: string;
  telecharger: string;
  titre: string;
  intro: string;
  windows: {
    titre: string;
    etapes: Etape[];
    attention: { titre: string; texte: string };
  };
  macos: {
    titre: string;
    etapes: Etape[];
    attention: { titre: string; texte: string };
    autre: { titre: string; texte: string };
  };
  questions: { titre: string; items: (win: string, mac: string) => Question[] };
};

const fr: Guide = {
  meta: {
    title: 'Installer Hublink — guide pas à pas',
    description:
      "Hublink n'est pas encore signé : Windows et macOS affichent un avertissement au premier lancement. Où cliquer, et les réponses aux questions de sécurité."
  },
  retour: 'Hublink',
  telecharger: 'Télécharger',
  titre: 'Installer Hublink, avertissement compris.',
  intro:
    "Windows et macOS font confiance aux applications signées par un éditeur identifié. Cette signature est payante, chaque année, et Hublink n'a pas encore les moyens de l'acheter. Le système ne trouve donc pas d'éditeur et vous prévient : c'est ce message que ce guide vous aide à passer, une seule fois.",
  windows: {
    titre: 'Sur Windows',
    etapes: [
      {
        titre: 'Télécharger',
        texte:
          "Si le navigateur hésite — Edge écrit « n'est pas fréquemment téléchargé » —, ouvrez le menu « … » du téléchargement, choisissez « Conserver », puis « Afficher plus » et « Conserver quand même »."
      },
      {
        titre: "Ouvrir l'installeur",
        texte:
          "Une fenêtre bleue « Windows a protégé votre ordinateur » s'affiche. Cliquez sur « Informations complémentaires », puis sur le bouton « Exécuter quand même » qui apparaît."
      },
      {
        titre: "C'est installé",
        texte:
          "L'installation se fait d'un clic, sans droits administrateur, et Hublink s'ouvre. Les mises à jour suivantes s'installent d'elles-mêmes, sans repasser par cet avertissement."
      }
    ],
    attention: {
      titre: 'Pas de bouton « Exécuter quand même » ?',
      texte:
        "C'est le Contrôle intelligent des applications de Windows 11 : il bloque toute application non signée, sans exception possible. Le désactiver vaut pour tout le PC, et selon votre version de Windows le réactiver peut demander une réinstallation. Pour une seule app, ce n'est pas un bon échange : mieux vaut attendre la version signée."
    }
  },
  macos: {
    titre: 'Sur macOS',
    etapes: [
      {
        titre: 'Copier l’app',
        texte:
          'Ouvrez le fichier .dmg et faites glisser Hublink dans le dossier Applications. N’ouvrez pas encore l’app.'
      },
      {
        titre: 'Retirer la quarantaine',
        texte:
          "Ouvrez le Terminal (⌘ Espace, puis tapez « Terminal »), collez cette ligne et appuyez sur Entrée. Rien ne s'affiche : c'est normal. Elle retire la marque « téléchargé depuis Internet », pour Hublink seulement.",
        commande: 'xattr -dr com.apple.quarantine /Applications/Hublink.app'
      },
      {
        titre: 'Ouvrir Hublink',
        texte:
          "Depuis le Launchpad ou le dossier Applications, comme n'importe quelle app. À chaque nouvelle version, Hublink vous prévient : téléchargez-la et refaites ces deux étapes."
      }
    ],
    attention: {
      titre: '« Hublink est endommagé » : cliquez sur Annuler.',
      texte:
        "Si vous avez ouvert l'app avant l'étape 2, macOS peut la dire endommagée. Elle ne l'est pas : le système refuse simplement une app sans signature. Le bouton mis en avant dans cette boîte la place à la corbeille — choisissez « Annuler », puis passez la commande ci-dessus."
    },
    autre: {
      titre: 'Sans le Terminal',
      texte:
        "Si macOS écrit seulement qu'il « n'a pas pu vérifier » Hublink, ouvrez Réglages Système → Confidentialité et sécurité, descendez tout en bas et cliquez sur « Ouvrir quand même ». Ce chemin ne marche pas pour le message « endommagé ». Le clic droit → « Ouvrir » ne suffit plus depuis macOS 15."
    }
  },
  questions: {
    titre: 'Les questions qu’on a raison de se poser.',
    items: (win, mac) => [
      {
        question: 'L’avertissement veut-il dire que c’est un virus ?',
        reponse:
          "Non. Il dit qu'aucun éditeur payant n'a signé le fichier, pas que le fichier est dangereux. Aucun antivirus n'est en cause : c'est le système qui ne sait pas qui l'a fait."
      },
      {
        question: 'Comment savoir ce que fait l’app ?',
        reponse:
          "Tout son code est public sur GitHub, lisible avant d'installer. Hublink n'a ni serveur ni compte, et n'envoie aucune mesure d'audience. Il ne contacte que les services que vous ajoutez, GitHub pour vérifier les mises à jour, et — seulement si vous téléchargez une vidéo YouTube — les pages GitHub de yt-dlp et ffmpeg, au premier usage."
      },
      {
        question: 'Comment vérifier que le fichier n’a pas été modifié ?',
        reponse:
          "Téléchargez-le depuis ce site ou depuis la page des versions de GitHub, nulle part ailleurs. GitHub affiche l'empreinte SHA-256 de chaque fichier : calculez celle du vôtre et comparez. Les deux doivent être identiques au caractère près.",
        commandes: [
          { libelle: 'Windows (PowerShell)', commande: `Get-FileHash .\\Hublink-Setup-${win}-x64.exe` },
          { libelle: 'macOS (Terminal)', commande: `shasum -a 256 Hublink-${mac}-arm64.dmg` }
        ],
        lien: { libelle: 'Page des versions', href: 'release' }
      },
      {
        question: 'Qui fabrique les fichiers ?',
        reponse:
          "Les versions macOS sont construites par GitHub lui-même, à partir du code public, et le journal de chaque construction reste consultable. Les versions Windows sont construites sur le poste du développeur, à partir du même code.",
        lien: { libelle: 'Journaux de construction', href: 'actions' }
      },
      {
        question: 'Mon antivirus le signale.',
        reponse:
          "Un installeur récent et non signé déclenche parfois les analyses heuristiques, faute d'historique. Vérifiez l'empreinte ci-dessus ; si elle correspond et que l'alerte persiste, signalez-le — l'éditeur de l'antivirus peut être prévenu du faux positif.",
        lien: { libelle: 'Signaler un problème', href: 'issues' }
      },
      {
        question: 'Comment le désinstaller ?',
        reponse:
          "Sur Windows : Paramètres → Applications → Applications installées → Hublink → Désinstaller. Sur macOS : faites glisser Hublink du dossier Applications vers la corbeille."
      },
      {
        question: 'Quand sera-t-il signé ?',
        reponse:
          "Dès que le projet peut payer les certificats d'Apple et de Microsoft. Les avertissements disparaîtront alors d'eux-mêmes, et ce guide aussi.",
        lien: { libelle: 'Soutenir le projet', href: 'soutenir' }
      }
    ]
  }
};

const en: Guide = {
  meta: {
    title: 'Installing Hublink — step by step',
    description:
      'Hublink is not signed yet: Windows and macOS show a warning on first launch. Where to click, and answers to the security questions.'
  },
  retour: 'Hublink',
  telecharger: 'Download',
  titre: 'Installing Hublink, warning included.',
  intro:
    'Windows and macOS trust apps signed by an identified publisher. That signature costs money, every year, and Hublink cannot afford it yet. So the system finds no publisher and warns you: this guide helps you past that message, once.',
  windows: {
    titre: 'On Windows',
    etapes: [
      {
        titre: 'Download',
        texte:
          'If the browser hesitates — Edge says it “isn’t commonly downloaded” — open the “…” menu on the download, choose “Keep”, then “Show more” and “Keep anyway”.'
      },
      {
        titre: 'Open the installer',
        texte:
          'A blue “Windows protected your PC” window appears. Click “More info”, then the “Run anyway” button that shows up.'
      },
      {
        titre: 'Installed',
        texte:
          'It installs in one click, without admin rights, and Hublink opens. Later updates install themselves, without going through this warning again.'
      }
    ],
    attention: {
      titre: 'No “Run anyway” button?',
      texte:
        'That is Windows 11 Smart App Control: it blocks every unsigned app, with no exception. Turning it off applies to the whole PC, and depending on your Windows version turning it back on may require a reinstall. For a single app that is not a good trade: better wait for the signed version.'
    }
  },
  macos: {
    titre: 'On macOS',
    etapes: [
      {
        titre: 'Copy the app',
        texte: 'Open the .dmg file and drag Hublink into the Applications folder. Do not open the app yet.'
      },
      {
        titre: 'Remove the quarantine',
        texte:
          'Open Terminal (⌘ Space, then type “Terminal”), paste this line and press Return. Nothing is printed: that is expected. It removes the “downloaded from the internet” mark, for Hublink only.',
        commande: 'xattr -dr com.apple.quarantine /Applications/Hublink.app'
      },
      {
        titre: 'Open Hublink',
        texte:
          'From Launchpad or the Applications folder, like any other app. With each new release Hublink lets you know: download it and repeat these two steps.'
      }
    ],
    attention: {
      titre: '“Hublink is damaged”: click Cancel.',
      texte:
        'If you opened the app before step 2, macOS may call it damaged. It is not: the system simply refuses an app with no signature. The highlighted button in that dialog moves it to the Trash — choose “Cancel”, then run the command above.'
    },
    autre: {
      titre: 'Without Terminal',
      texte:
        'If macOS only says it “could not verify” Hublink, open System Settings → Privacy & Security, scroll to the bottom and click “Open Anyway”. This route does not work for the “damaged” message. Right-click → “Open” is no longer enough since macOS 15.'
    }
  },
  questions: {
    titre: 'The questions you are right to ask.',
    items: (win, mac) => [
      {
        question: 'Does the warning mean it is a virus?',
        reponse:
          'No. It says no paying publisher signed the file, not that the file is dangerous. No antivirus is involved: the system just does not know who made it.'
      },
      {
        question: 'How do I know what the app does?',
        reponse:
          'Its entire code is public on GitHub, readable before you install. Hublink has no server and no account, and sends no analytics. It only contacts the services you add, GitHub to check for updates, and — only if you download a YouTube video — the GitHub pages of yt-dlp and ffmpeg, on first use.'
      },
      {
        question: 'How do I check the file was not tampered with?',
        reponse:
          'Download it from this site or from the GitHub releases page, nowhere else. GitHub shows the SHA-256 fingerprint of every file: compute yours and compare. Both must match character for character.',
        commandes: [
          { libelle: 'Windows (PowerShell)', commande: `Get-FileHash .\\Hublink-Setup-${win}-x64.exe` },
          { libelle: 'macOS (Terminal)', commande: `shasum -a 256 Hublink-${mac}-arm64.dmg` }
        ],
        lien: { libelle: 'Releases page', href: 'release' }
      },
      {
        question: 'Who builds the files?',
        reponse:
          'The macOS builds are made by GitHub itself, from the public code, and the log of every build stays available. The Windows builds are made on the developer’s computer, from the same code.',
        lien: { libelle: 'Build logs', href: 'actions' }
      },
      {
        question: 'My antivirus flags it.',
        reponse:
          'A recent, unsigned installer sometimes trips heuristic scans, for lack of history. Check the fingerprint above; if it matches and the alert persists, report it — the antivirus vendor can be told about the false positive.',
        lien: { libelle: 'Report a problem', href: 'issues' }
      },
      {
        question: 'How do I uninstall it?',
        reponse:
          'On Windows: Settings → Apps → Installed apps → Hublink → Uninstall. On macOS: drag Hublink from the Applications folder to the Trash.'
      },
      {
        question: 'When will it be signed?',
        reponse:
          'As soon as the project can pay for Apple’s and Microsoft’s certificates. The warnings will then go away on their own, and so will this guide.',
        lien: { libelle: 'Support the project', href: 'soutenir' }
      }
    ]
  }
};

export const guides: Record<Locale, Guide> = { fr, en };

# Hublink

Client desktop léger pour regrouper les webapps de plusieurs comptes clients dans une seule
fenêtre — un « Ferdium allégé », sans compte, sans serveur, sans télémétrie.

La navigation est **plate**, comme Ferdium : on ajoute un service, il apparaît dans la liste, un
clic l'ouvre. Chaque service est rattaché à un **compte** — une session Chromium isolée. Deux
services d'un même compte partagent leurs cookies (donc un seul login SSO pour la messagerie,
l'intranet et les outils d'un même client) ; deux comptes différents ne se voient jamais.

## Fonctionnalités

- **Comptes isolés** — une session `persist:` par compte, avec ses propres cookies et son propre
  stockage local. Supprimer un compte efface sa session et ses services.
- **Logo par compte** — importable depuis un fichier image ; réduit à 128 px et stocké en data URI
  dans la config, donc rien à retrouver sur le disque. À défaut, les initiales sur la couleur du
  compte.
- **Services** — n'importe quelle URL, avec favicon récupéré depuis la page et compteur de
  non-lus déduit du titre de l'onglet (`Gmail (3)` → pastille « 3 »).
- **Extensions Chrome** — installables depuis le Chrome Web Store (par URL ou identifiant),
  depuis un `.crx` / `.zip`, ou depuis un dossier décompressé. Activables profil par profil.
- **SSO** — les popups d'authentification (Google, Microsoft, Okta, AWS…) s'ouvrent dans une
  fenêtre enfant partageant la session du compte.
- **Liens sortants, au choix par service** — dans le navigateur système (défaut) ou dans Hublink,
  dans la session du compte. Réglable dans la fiche du service ou par clic droit.
- **Identité de navigateur** — par défaut Hublink se présente comme Chrome. Sans cela, les
  portails qui filtrent les navigateurs (Teams, Meet…) répondent « version en ligne non
  disponible » et renvoient vers le navigateur. Désactivable par service.
- **Espaces** — un filtre « Perso / Pro / Tout » (renommable, extensible) posé sur le **compte** :
  tous ses services suivent. Sélecteur en menu déroulant, pas en onglets — le nombre d'espaces
  peut grandir. Chaque espace a une couleur qui **teinte discrètement le shell** : lavis en thème
  clair, teinte sourde en sombre, dérivée par `color-mix` pour rester lisible dans les deux.
  Les non-lus des espaces masqués restent affichés sur le sélecteur.
- **Ordre des services** — glisser-déposer dans le panneau, ou « Monter / Descendre » au clic
  droit (le seul moyen dans le rail réduit). L'ordre est calculé sur la liste complète, même
  quand un filtre de compte n'en affiche qu'une partie.
- **Icônes** — le favicon de chaque service est **téléchargé** et stocké en data URI, via la
  session du compte (donc les icônes d'intranet protégées passent). Une icône personnalisée peut
  être importée par service ; elle prime sur le favicon.
- **Clés d'accès refusées** — par défaut, Hublink répond qu'aucun authentificateur de plateforme
  n'est disponible. Sans cela, Teams et les portails Microsoft proposent d'emblée la clé d'accès
  de la session Windows ou macOS, qui n'est presque jamais le bon compte. Désactivable par
  service.
- **Délai de mise en veille réglable** — de 5 minutes à 2 heures, ou jamais, depuis le pied du
  panneau ou le menu Affichage.
- **Panneau rétractable** — `⌘/Ctrl + B` réduit le panneau à un rail d'icônes de 56 px : les
  services restent accessibles en un clic. L'état est mémorisé.
- **Thème clair / sombre / système** — piloté par `nativeTheme`, donc les menus et boîtes de
  dialogue natifs suivent aussi.
- **Windows et macOS** (et Linux via AppImage).

## Ce qui fonctionne — et ce qui ne fonctionne pas — côté extensions

Electron embarque le moteur de rendu de Chromium mais **réimplémente lui-même** un
sous-ensemble des API `chrome.*`. Ce n'est pas Chrome sans le logo.

| Statut | API |
| --- | --- |
| Complet | `devtools.*`, `scripting`, `webRequest` |
| Partiel | `runtime`, `tabs`, `extension`, `management` |
| Limité | `storage` → `local` uniquement (pas `sync`) |

Tout le reste est absent : `identity`, `alarms`, `notifications`, `contextMenus`, `windows`,
`cookies`, `idle`, et le *native messaging*.

- **Marche bien** : uBlock Origin (Lite), Dark Reader, correcteurs orthographiques,
  Wappalyzer, extensions de capture — tout ce qui vit dans les content scripts.
- **Ne marche pas** : les gestionnaires de mots de passe (Dashlane, 1Password, Bitwarden),
  qui dépendent de `identity` et du native messaging. Utilise l'app desktop du gestionnaire,
  dont l'autofill agit au niveau du système, et/ou son webmail (`app.dashlane.com`) comme
  service Hublink.

Seules les extensions **décompressées** sont chargeables : Hublink dézippe donc lui-même les
`.crx` (voir [`src/main/unzip.js`](src/main/unzip.js)) avant de les passer à Electron.

## Développement

```bash
npm install
npm run dev
```

`npm run dev` lance Vite (port 5273) et Electron en parallèle, avec HMR sur l'interface.
Pour lancer la version compilée : `npm start`.

```bash
npm run typecheck   # tsc --noEmit
npm run build       # bundle le renderer dans src/renderer/dist
```

## Packaging

```bash
npm run dist:mac
```

```bash
npm run dist:win
```

Les binaires arrivent dans `release/`.

> **Windows** : `dist:win` produit un installeur NSIS. Depuis macOS, electron-builder a besoin
> de Wine pour l'assembler — il est plus simple de lancer `npm run dist:win` **depuis une
> machine Windows** ou une CI (`windows-latest` sur GitHub Actions).

> **Signature** : les builds ne sont pas signés. Sur macOS, le premier lancement demande un
> clic droit → « Ouvrir » ; sur Windows, SmartScreen affiche un avertissement. Une signature
> demande un certificat Developer ID (Apple) ou un certificat de signature de code (Windows).

## Architecture

```
src/
├── main/                 process principal (Node)
│   ├── index.js          fenêtre, IPC, menu, cycle de vie
│   ├── views.js          une WebContentsView par service, une session par compte
│   ├── extensions.js     installation, activation par compte, popups
│   ├── unzip.js          dézippeur .crx / .zip sans dépendance
│   └── store.js          persistance JSON dans userData
├── preload/
│   ├── shell.js          API exposée à l'interface via contextBridge
│   └── guest.js          raccourcis clavier depuis les pages distantes
└── renderer/             React 19 + Tailwind v4 + shadcn/ui
```

Les pages distantes sont rendues par des `WebContentsView` natives positionnées par le process
principal — l'interface React lui transmet la géométrie de sa zone de contenu. Electron
[déconseille `<webview>`](https://www.electronjs.org/docs/latest/api/webview-tag), et les
extensions s'attachent proprement à une session.

**Conséquence à connaître** : une vue native se peint *toujours* au-dessus du HTML du shell.
Tout ce qui doit recouvrir la page web est donc traité autrement :

- les **modales** masquent la vue le temps de leur affichage (`views.setOverlay`) — sans cela
  elles s'ouvrent derrière la page, et l'overlay invisible bloque tous les clics ;
- les **menus** (clic droit, menu Extensions) sont des menus **natifs** (`Menu.popup`) ;
- les **infobulles** sont de simples attributs `title`.

Aucune dépendance runtime n'est embarquée : le renderer est bundlé par Vite et le process
principal n'utilise que des modules Electron.

## Raccourcis

| Raccourci | Action |
| --- | --- |
| `⌘/Ctrl + 1…9` | Basculer entre les services |
| `⌘/Ctrl + N` | Nouveau service |
| `⌘/Ctrl + ⇧ + N` | Nouveau compte |
| `⌘/Ctrl + B` | Afficher / masquer le panneau |
| `⌘/Ctrl + ⇧ + E` | Gérer les extensions |
| `⌘/Ctrl + R` | Recharger le service |
| `⌘/Ctrl + ⌥ + I` | DevTools du service |

## Performance

Un service ouvert = un process Chromium complet. Trois mesures gouvernent la fluidité.

**Trafic IPC.** Les webapps repeignent leur titre et leur favicon en continu ; envoyer l'état
complet à chaque fois (logos base64 compris) saturait le pont IPC et re-rendait toute
l'interface. Mesuré sur une page qui change de titre 8 fois par seconde :

| | Avant | Après |
| --- | --- | --- |
| Charge IPC | 92 Ko/s | **1 Ko/s** |
| Rafraîchissements d'état complets | 8,3/s | **0** |

Le badge et le favicon passent par un delta (`service:meta`), et rien n'est émis ni écrit sur
disque si la valeur n'a pas réellement changé. Le flux de navigation est limité à 4 messages par
seconde, sans jamais perdre le dernier état.

**Mémoire.** Les services non consultés depuis 20 minutes sont libérés et se rechargent au clic —
comme la mise en veille d'onglets d'un navigateur. Le service affiché n'est jamais endormi, et un
service en veille est signalé par une lune dans le panneau.

| 4 services | Sans veille | Avec veille |
| --- | --- | --- |
| Mémoire totale | 842 Mo | **525 Mo** |

Le délai se règle dans le pied du panneau (**Mise en veille**) ou via **Affichage → Mettre en
veille les services inactifs** : de 5 minutes à 2 heures, ou jamais.

**CPU.** Au repos avec une webapp active : ~0,6 % pour l'interface, ~0,5 % pour le GPU, ~0,1 %
pour le process principal.

## Posture de sécurité

L'app charge des sites tiers dans un conteneur natif : les garde-fous comptent plus qu'ailleurs.

**Isolation du code**

- `contextIsolation: true`, `nodeIntegration: false` et `sandbox: true` partout — shell compris.
  Aucune API Node n'est atteignable depuis une page distante ni depuis l'interface.
- Le preload invité n'expose **rien** via `contextBridge` ; il n'écoute que les raccourcis, et
  seulement dans la frame principale (pas dans les iframes publicitaires).
- CSP stricte sur l'interface (`script-src 'self'`), `webSecurity` laissé actif.
- La fenêtre du shell refuse toute navigation et toute ouverture de fenêtre : ce qui n'est pas sa
  propre page part vers le navigateur système.

**User-agent**

Le jeton `Electron/41.x` est retiré de l'user-agent : il ne reste que la vraie version de
Chromium embarquée, sans mensonge sur le moteur ni sur la plateforme. Ce n'est pas une
usurpation d'identité — le moteur de rendu *est* Chrome.

**URL**

Toute URL sortante est **parsée**, jamais comparée en sous-chaîne :

- `shell.openExternal` n'accepte que `http:` / `https:` — `file:`, `javascript:` et les schémas
  d'application (`ms-msdt:` et consorts) sont rejetés ;
- la liste des domaines SSO autorisés à ouvrir une popup **applicative** (donc partageant la
  session du compte) est comparée sur le `hostname`. Une comparaison naïve laisserait passer
  `https://piege.example/?x=accounts.google.com`.

**Permissions**

- Accordées d'office : notifications, plein écran, écriture presse-papiers.
- **Confirmation explicite** pour caméra/micro, partage d'écran et lecture du presse-papiers,
  avec l'origine affichée. L'accord est mémorisé par origine, jusqu'à la fermeture de l'app.
- `setPermissionCheckHandler` est défini en plus du handler asynchrone, sans quoi Electron
  applique ses propres défauts.

**Extensions**

- Chargées **sans** `allowFileAccess` : une extension tierce n'atteint pas les `file://` du poste.
- Le dézippage refuse toute entrée sortant du dossier cible (*zip slip*).
- Reste que **toute extension installée voit le contenu des pages du compte où elle est activée** :
  n'installe que ce que tu aurais installé dans Chrome, et laisse-la désactivée sur les comptes
  qui n'en ont pas besoin.

**Limites connues**

- **Builds non signés** : pas de vérification d'intégrité au lancement, et aucune mise à jour
  automatique. Les correctifs de sécurité de Chromium n'arrivent qu'en reconstruisant avec une
  version d'Electron plus récente — à faire périodiquement.
- Les sessions sont chiffrées par Chromium avec les clés du système, mais `hublink.config.json`
  est en clair. Il ne contient ni identifiant ni jeton — seulement des URL et des logos.

## Données

Tout est local :

- `~/Library/Application Support/Hublink/` (macOS) ou `%APPDATA%\Hublink\` (Windows)
  - `hublink.config.json` — espaces, comptes, services, logos, extensions
  - `extensions/` — extensions décompressées
  - `Partitions/` — une session Chromium par compte

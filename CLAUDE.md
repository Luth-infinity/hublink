# Hublink — repères pour travailler sur ce dépôt

Client desktop Electron qui range les webapps de plusieurs comptes dans une fenêtre,
avec une partition Chromium par compte. Monorepo : `src/` (application) et `site/`
(vitrine Next.js).

Le code et les commits sont **en français**, au présent, décrivant le comportement
plutôt que la modification (« Corrige l'import manquant qui cassait le démarrage »).
Les commentaires expliquent *pourquoi*, pas *quoi*.

## État au 2 septembre 2026

| | Version |
|---|---|
| Windows | **0.5.2** |
| macOS | **0.5.2** |

Les deux plateformes sont à parité, et **le restent sans rien faire** depuis la 0.5.2 :
publier une release déclenche la construction des `.dmg` sur un runner macOS de GitHub
(voir plus bas). Il n'y a plus de rattrapage à faire depuis un Mac.

## Les `.dmg` se construisent tout seuls

`.github/workflows/macos.yml` écoute la publication des releases : il construit les
deux `.dmg` sur un runner `macos-latest` et les joint à la release, quelques minutes
après la publication. Le dépôt étant public, ces minutes sont gratuites.

Il reste une chose à faire à la main : bumper `VERSION.mac` dans `site/app/vitrine.tsx`
une fois les `.dmg` en ligne. Le site annoncerait sinon une version dont les liens de
téléchargement n'existent pas encore.

`gh workflow run "Binaires macOS" -f tag=vX.Y.Z` rejoue une version déjà publiée.

Les binaires attendus par le site sont nommés `Hublink-<version>-arm64.dmg` et
`Hublink-<version>-x64.dmg`.

Depuis un Mac, `npm run dist:mac` reste évidemment possible — et `npm run dist:win`
fonctionne aussi de là (electron-builder embarque NSIS). L'inverse est impossible.

## Procédure de release

L'ordre compte : le site se redéploie automatiquement au push sur `main`, donc pousser
le bump de version avant que les binaires n'existent afficherait des liens morts.

1. Bump `package.json` + `VERSION` dans `site/app/vitrine.tsx`, commit.
2. `npm run dist:win` (et `dist:mac` sur un Mac).
3. Créer une branche, la pousser.
4. `gh release create vX.Y.Z --draft --target <sha>` avec les binaires **et
   `release/latest.yml`** — ce fichier est indispensable à la mise à jour automatique.
5. Fusionner sur `main`, pousser.
6. `gh release edit vX.Y.Z --draft=false`.
7. Vérifier : liens de téléchargement en 200, bandeau du site, changelog.
8. Attendre les `.dmg` du workflow macOS, puis bumper `VERSION.mac` et pousser.

Course à surveiller entre les étapes 5 et 6 : `releases.ts` écarte les brouillons.
Si le déploiement déclenché par le push interroge l'API avant la publication, le
changelog sort sans la nouvelle version et n'y revient qu'à la revalidation, une
heure plus tard. Publier au plus vite après le push, et vérifier le changelog en
ligne plutôt que de le supposer.

La seule CI est `.github/workflows/macos.yml`, décrit plus haut. Rien ne construit
Windows ni ne joue de tests : le reste passe par la machine de développement.

## Ce qu'il ne faut pas casser

**Le changelog du site est automatique.** `site/app/releases.ts` lit l'API des releases
GitHub — ne jamais l'écrire à la main. Le corps d'une release doit respecter
`summarize()` : lignes de plus de 25 caractères, pas de `#`, `**`, `>` ni backtick en
début de ligne, **4 puces retenues** (donc mettre les plus importantes en premier). Les
lignes d'installation commençant par `**macOS**` / `**Windows**` sont filtrées exprès.

**Piège du filtre** : dans `/^`|clic droit|Binaires/i`, le `^` ne porte que sur le
backtick. Toute ligne **contenant** « clic droit » ou « Binaires », n'importe où, est
donc jetée — le garde-fou visait les consignes d'installation, il avale aussi une phrase
qui mentionne le clic droit au milieu d'un paragraphe. C'est arrivé en 0.5.1 : les deux
puces les plus importantes ont disparu du site sans erreur ni avertissement. Écrire
« menu contextuel », et vérifier le rendu **en ligne** après publication, pas seulement
avec un vérificateur local — un équivalent Python avec `re.match` ancre tout le motif et
ne reproduit pas ce comportement.

**Les notes de version s'écrivent dans les deux langues**, le site étant bilingue : le
français d'abord, puis un titre `## English` et sa traduction, puis les lignes
d'installation. `section()` découpe sur ce titre. Sans section anglaise, la page anglaise
retombe sur le français — mieux vaut ça qu'un changelog vide, mais ça se voit.

**Les versions sont par plateforme.** `const VERSION = { win, mac }` dans
`site/app/vitrine.tsx` — pas `page.tsx`, qui n'est qu'une route depuis que le
site est bilingue —, à bumper à la main en plus de `package.json`. Les deux plateformes
n'avancent pas ensemble.

**`.dmg` ne se construit que sur macOS.** electron-builder refuse explicitement :
« Build for macOS is supported only on macOS ». `hdiutil` et `codesign` sont des
binaires Apple non redistribuables. Le contournement n'est pas technique : c'est un
runner `macos-latest`, qui est un Mac.

**La mise à jour automatique ne vaut que pour Windows.** `electron-updater` est embarqué
depuis la 0.4.1 ; `latest.yml` doit être joint à chaque release. Sur macOS, Squirrel.Mac
exige une application signée et notariée, donc un compte développeur Apple payant : on
s'y contente de signaler la version et de renvoyer vers la page de la release.

## Deux choses peuvent occuper la zone principale

Un service, ou un onglet du navigateur. Le code l'a oublié deux fois : le bouton
d'accueil ramenait à l'adresse de l'ancien service, et le panneau laissait deux éléments
surlignés en même temps.

En ajouter une troisième suppose de reprendre `restoreActive()`, le gestionnaire
`nav:home`, la sélection affichée dans le panneau, et les bascules qui doivent se fermer
l'une l'autre (`service:select`, `tab:select`, `browser:toggle`).

**Il y en a eu trois.** WhatsApp avait son mode dédié, sa session `persist:whatsapp` et
aucun compte : il échappait au filtre de compte, au balayage de mise en veille et à la
suppression d'un compte. Ces exceptions coûtaient plus que le confort d'un bouton — il
est redevenu un service ordinaire, migré dans le premier compte au premier démarrage.
La session `persist:whatsapp` n'est plus lue : ne pas la recâbler, l'utilisateur a
rescanné son code depuis. Ne pas réintroduire de zone « solo » en bas du panneau.

## Contrainte structurante : la vue web est native

Une `WebContentsView` **se peint au-dessus du HTML du shell**, quoi qu'on fasse. Tout ce
qui doit survoler la page ne peut donc pas être dessiné dans la fenêtre principale.

- Les menus ont été **natifs** (`Menu.popup`) pour cette raison, jusqu'à ce que la
  fenêtre de calque permette de les dessiner en HTML (0.5.0).
- Les modales masquent la vue le temps de s'afficher (`setOverlay`).
- Les **messages et les panneaux déroulants** vivent dans une fenêtre enfant
  transparente : `src/renderer/src/Overlay.tsx`, créée à la demande dans
  `src/main/index.js`. Elle laisse passer les clics
  (`setIgnoreMouseEvents(true, { forward: true })`) et ne devient réceptive que si un
  panneau est ouvert ou si le pointeur survole un message.
- Le **plein écran d'une vidéo** n'est traité qu'à moitié : Electron agrandit la
  fenêtre, et l'en sort, tout seul, mais la vue garde la place que le shell lui
  laisse. `wirePleinEcran` lui donne l'écran entier le temps de la vidéo
  (`src/main/views.js`).

Avant la 0.4.4, dix-neuf messages étaient invisibles sans que personne ne s'en aperçoive.
**Ne jamais ajouter de notification ou de panneau flottant dans la fenêtre principale.**

## Pièges rencontrés

- **En plein écran, mesurer l'écran, pas la fenêtre.** Quand `enter-html-full-screen`
  arrive, la fenêtre est déjà agrandie mais `getContentSize()` annonce 26 px de moins
  que sa taille définitive, et plus aucun `resize` ne suit : la vue gardait une bande
  vide en bas. Les bornes de son écran (`screen.getDisplayMatching`) sont la mesure
  sûre, une fenêtre en plein écran occupant tout.
- `app.requestSingleInstanceLock()` empêche une seconde instance : pour tester sans
  fermer l'app installée, passer `--user-data-dir` (voir `demo.bat`). **Tuer l'ancienne
  instance de test avant d'en relancer une**, sinon on croit tester la nouvelle build
  alors que le verrou a simplement remonté l'ancienne fenêtre.
- `npx electron` résout parfois mal et tente de télécharger une autre version depuis le
  registre. Appeler `./node_modules/.bin/electron` directement.
- `protocol.handle` ne vaut que pour la session par défaut : chaque partition a son
  propre registre. La page d'accueil du navigateur est servie sur la session
  `persist:browser` (`src/main/startpage.js`).
- **Les permissions ont deux gestionnaires, et le synchrone décide de tout.**
  `setPermissionCheckHandler` répond aussi à `navigator.permissions.query()`, que les
  webapps interrogent avant d'afficher leurs boutons. Y refuser une permission qu'on
  compte demander crée un cercle fermé : la page se croit bloquée, n'appelle jamais
  `getUserMedia`, et `setPermissionRequestHandler` — la boîte de dialogue — ne se
  déclenche jamais. Le contrôle doit annoncer ce qui est *possible*, la demande reste
  le verrou.
- **L'agent utilisateur ne doit contenir ni le nom de l'application ni Electron.**
  `app.userAgentFallback` glisse `Hublink/x.y.z` avant `Chrome/` et parfois `Electron/…`
  après : WhatsApp répond « fonctionne avec Google Chrome 100 ou version ultérieure », et
  les portails Microsoft filtrent de la même façon. `src/main/ua.js` efface les deux. Le
  défaut est invisible en développement, où l'application se nomme « Electron ».
- `navigator.setAppBadge()` existe dans Electron mais **n'est reliée à rien**. Le relais
  vers l'application se fait dans `src/preload/guest.js`. C'est par là que Slack et Teams
  signalent leurs non-lus, plus par le titre de la page.
- Le Chrome Web Store passe par une page `consent.google.com` avant d'afficher une
  fiche : détecter l'identifiant d'extension n'importe où dans l'URL décodée, pas
  seulement en tête.
- `site/.next/` est versionné à tort (128 fichiers qui changent à chaque build). Le
  retirer du suivi reste à faire. En attendant, ne mettre en scène que les fichiers
  voulus : un `git add -A` après un `next dev` noie le commit sous une centaine
  d'artefacts.
- **`npm run dist:mac` laisse deux `Hublink.app` homonymes** dans `release/` :
  `release/mac` est la build **Intel**, `release/mac-arm64` l'Apple Silicon. Spotlight
  les indexe, LaunchServices les met dans le même panier que l'app installée — et une
  session entière a été passée à chercher une régression de performance qui n'était que
  la build Intel lancée sous Rosetta (trois renderers à 90 % de CPU, contre 1 % en
  natif). Supprimer les deux dossiers après chaque release ; les `.dmg` suffisent.
  Vérifier en cas de doute : `lipo -archs` sur le binaire du process qui tourne.
- **Ne jamais lancer l'app par `open` juste après l'avoir copiée depuis un `.dmg`.**
  Le bundle porte l'attribut de quarantaine et n'est signé qu'en ad-hoc : Gatekeeper
  répond « code has no resources but signature indicates they must be present », macOS
  affiche « Hublink est endommagé » et **le bouton par défaut de cette boîte met l'app
  à la corbeille**. C'est le clic droit → « Ouvrir » que le site documente, ou
  `xattr -dr com.apple.quarantine` sur une build qu'on vient de produire soi-même.

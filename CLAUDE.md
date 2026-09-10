# Hublink — repères pour travailler sur ce dépôt

Client desktop Electron qui range les webapps de plusieurs comptes dans une fenêtre,
avec une partition Chromium par compte. Monorepo : `src/` (application) et `site/`
(vitrine Next.js).

Le code et les commits sont **en français**, au présent, décrivant le comportement
plutôt que la modification (« Corrige l'import manquant qui cassait le démarrage »).
Les commentaires expliquent *pourquoi*, pas *quoi*.

## État au 9 septembre 2026

| | Version |
|---|---|
| Windows | **0.5.4** |
| macOS | **0.5.4** |

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

## Le mode vidéo déménage la vue

`src/main/videomode.js` sort la page dans une petite fenêtre qui reste au-dessus.
Elle est composée comme la principale — vue native en haut, HTML en bas — parce que
**Document Picture-in-Picture ne marche pas dans Electron** : l'API est exposée par
Chromium mais `requestWindow()` répond « Internal error: no window », faute de
fenêtre côté navigateur. L'incrustation de Chromium, elle, ne se pilote pas : ni
volume, ni bouton à nous.

La vue est **déplacée**, pas recréée (`views.detacherPourVideo` / `reprendreDeVideo`) :
la lecture continue. Tant qu'elle est dehors, elle n'appartient plus à la fenêtre
principale — le balayage de mise en veille la saute, et `show()` la rappelle en
refermant la vidéo d'abord.

Ce sont **deux fenêtres** : celle de l'image, que la vue occupe entièrement, et un
voile transparent posé dessus qui porte les commandes. Une seule ne suffit pas — la
vue native se peint au-dessus du HTML de sa fenêtre, et lui réserver une bande en
dessous bordait la vidéo d'un bandeau noir permanent.

**Les deux fenêtres sont indépendantes, surtout pas parent et enfant.** Windows
impose qu'un propriétaire reste sous ce qu'il possède : marquer le voile « au-dessus
de tout » faisait perdre ce rang à la fenêtre de l'image, et un jeu en plein écran
venait s'intercaler entre les deux — commandes flottant sur la partie, vidéo enfouie
dessous. `rappelerLOrdre()` les repose toutes les 1,2 s, l'image d'abord, le voile
ensuite : le dernier posé est celui du dessus.

Le voile suit les **bornes de contenu** de l'image, pas ses bornes de fenêtre : une
fenêtre sans cadre mais redimensionnable garde une bordure invisible de six points,
qui décalait le voile d'autant.

Le déplacement se fait à la main (`video:deplacer`) : une zone
`-webkit-app-region: drag` dans le voile déplacerait le voile seul. **La boucle reporte la
taille à chaque pas** : `setPosition` seul faisait grandir la fenêtre de deux points
par appel — sans cadre mais redimensionnable, elle garde une bordure invisible
qu'Electron rajoutait à chaque fois. Vingt appels aux mêmes coordonnées la faisaient
passer de 486 à 526 points de large, et un glisser en fait soixante par seconde.

Au repos on ne voit que l'image, et le bouton du lecteur s'il y en a un ; les
commandes ne paraissent qu'au survol, avec un dégradé qui monte du bas. Comme rien ne peut survoler une vue native, le survol se devine en regardant
où est le curseur (`screen.getCursorScreenPoint`, toutes les 200 ms tant que la
fenêtre est ouverte) — la bande, en HTML, ne recevrait rien quand le pointeur est sur
l'image.

La molette ne fait pas défiler la page sortie, elle règle le son : une page qui
glisserait derrière une image fixe n'aurait aucun sens. Elle compte la **distance**, pas
les événements : une molette à roue libre (MX Master) envoie des dizaines de crans
minuscules par geste et continue sur sa lancée ; à cinq pour cent par événement, un
seul lancer vidait le son, « tout seul » pendant que la roue finissait de tourner. Un
même geste ne déplace le volume que d'un cinquième.

**La fenêtre décline le premier plan** (`focusable: false`). Sans cela, cliquer sur la
pause pendant une partie sortait le jeu du plein écran et la vidéo se retrouvait
derrière : il fallait aller la rechercher. Les clics lui parviennent quand même — elle
n'est pas `WS_EX_TRANSPARENT`, seulement `WS_EX_NOACTIVATE`, comme l'incrustation de
Chromium. En contrepartie elle n'a jamais le clavier : **pas de raccourcis dans la
barre**, tout passe par les boutons. Son rang de fenêtre au-dessus des autres est
réaffirmé toutes les deux secondes, une application passée en plein écran le lui faisant
perdre sans que Windows le signale.

La page n'est pas remaniée : tout devient `visibility: hidden`, et la vidéo repasse
visible. Déplacer l'élément dans le DOM serait plus simple, mais les lecteurs le
remettent aussitôt en place.

**Fixer le cadre du lecteur plutôt que la vidéo ne marche pas** : les lecteurs
dimensionnent leurs conteneurs eux-mêmes, et l'image devenait noire. C'est bien la
vidéo qu'on fixe.

En contrepartie, sortir la vidéo de son flux effondre le lecteur, et son bouton
« Passer » se retrouve sans dimensions ni position utilisables. **Ne jamais juger de
sa visibilité sur un rectangle** : `checkVisibility({ visibilityProperty: false })`
répond sur le rendu lui-même, et ignore le `visibility` que nous avons éteint pour
toute la page. Un bouton mesuré à 0 × 0 est ainsi relayé correctement — c'est ce qui
empêchait d'ignorer une publicité YouTube.

Le bouton « Passer » n'est pas inventé : on cherche dans le cadre du lecteur un
bouton visible qui promet de passer quelque chose, et on le relaie.

**YouTube ignore un clic fabriqué par script sur son bouton.** Mesuré pendant une
vraie publicité : `element.click()` laisse la publicité en place, un clic envoyé par
`webContents.sendInputEvent` à l'endroit du bouton la fait disparaître. Le relais
passe donc par un vrai clic : la page marque le bouton, rend l'image transparente au
pointeur (`html.hublink-clic`, l'image reste peinte — rien ne clignote), fait défiler
le bouton dans la vue, et envoie ses coordonnées (`video:cliquer-ici`) ; le principal
clique, puis la page remet tout en place. Seule la vue vidéo peut demander ce clic.

**Un bouton, jamais un conteneur ni un lien.** En français le bouton dit « Ignorer »
(`button.ytp-skip-ad-button`), et YouTube l'entoure de conteneurs qui portent le même
nom et le même texte — dont `…__skip-or-preview-container`, de la taille du lecteur.
Le retenir faisait paraître une pastille inerte ; un vrai clic en son centre ouvrirait
le site de l'annonceur. La recherche exige `button` ou `[role="button"]`.

Mes premiers essais « éprouvés sur youtube.com » posaient de **faux** boutons munis
d'un simple écouteur : ils acceptaient le clic synthétique, le vrai non. Un faux bouton
ne prouve rien s'il ne refuse pas, comme YouTube, les clics où `event.isTrusted` est
faux.

La chaîne est éprouvée sur un lecteur calqué sur la structure réelle (bouton dans un
`ytp-skip-ad` de hauteur nulle, lui-même dans le conteneur de la taille du lecteur),
posé sous un bandeau pour que le bouton tombe hors de la petite fenêtre, et dont le
bouton ne compte que les clics authentiques : un vrai clic lui parvient, aucun ne
tombe sur le conteneur, et le défilement est rendu. Obtenir une publicité désactivable
à la demande est une loterie — YouTube les espace pour un visiteur qui en a déjà vu,
et beaucoup ne sont pas désactivables.

**Les onglets du navigateur ont un preload depuis la 0.5.3** — le même que les
services, avec `--hublink-onglet`, qui écarte la pastille de non-lus et la
proposition d'enregistrer un mot de passe. Ni les clés d'accès ni les notifications
n'y sont neutralisées : un navigateur doit se comporter en navigateur.

## Les suggestions de la barre d'adresse

La liste vit dans le calque (elle doit passer par-dessus la page), le clavier reste
dans le champ, et **le principal tient la liste et la ligne active**
(`src/main/suggestions.js`) : le champ et la liste sont dans deux fenêtres, il faut
qu'elles désignent toujours la même ligne. Le champ n'envoie que le texte, les flèches
et Entrée ; le calque ne reçoit la souris que sur la liste, pour que le champ reste
cliquable.

Favoris et historique d'abord, instantanés et sans rien envoyer ; les suggestions du
moteur complètent ensuite, et une réponse arrivée après une frappe plus récente est
jetée. Ce qui ressemble à une adresse n'est jamais envoyé au moteur.

**Sans `oe=utf-8`, le service répond en Latin-1** (`charset=ISO-8859-1`) : lu comme de
l'UTF-8, « météo » devenait « m�t�o ». On décode aussi selon l'en-tête annoncé.

## Le partage d'écran est à nous aussi

Chromium demande normalement quoi partager. Electron n'a pas ce sélecteur : sans
`setDisplayMediaRequestHandler`, `getDisplayMedia` reste sans réponse et **la webapp
n'affiche même pas son bouton**. Teams se contentait de ne rien proposer, sans dire
pourquoi. `src/main/partageecran.js` relève les sources avec `desktopCapturer` et
ouvre `PartageEcran.tsx`, qui les montre avec leur aperçu.

Le gestionnaire vaut **par session** : il est posé dans `ensureSession`, un compte
branché ne fait rien pour les autres. Et `display-capture` est accordée sans question
dans le gestionnaire de permissions : le sélecteur est déjà la question, et mieux
posée puisqu'il montre ce qui sera visible.

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
- **Un élément qui laisse passer les clics est invisible à `elementFromPoint`.** Le
  calque s'en servait pour savoir si le pointeur était sur un message : la réponse était
  toujours non, il ne devenait donc jamais réceptif, et le bouton d'un message n'a
  jamais pu être cliqué. On mesure désormais les rectangles.
- **Le shell ne voit jamais le pointeur le quitter** quand celui-ci passe sur la page :
  la vue est native, aucun événement ne lui parvient, et son dernier bouton survolé le
  reste. `src/preload/guest.js` le prévient, `index.js` répond par un `mouseLeave`.
- **Un titre de page n'est pas une source stable.** Les messageries le font clignoter
  pour attirer l'œil, les traducteurs le réécrivent à chaque frappe. La pastille ne
  redescend donc qu'après un silence, et l'historique ne se consigne qu'au calme.
- **Une `WebContentsView` ne reprend pas le clavier quand la fenêtre redevient
  active.** Le curseur clignote encore dans le champ, `document.hasFocus()` répond non,
  et tout ce qui vient du clavier se perd. C'est ce qui empêchait le « Replace » des
  outils de traduction : ils prennent le premier plan, le rendent, puis envoient un
  Ctrl+V qui n'arrivait nulle part. `index.js` rend le focus à la vue sur `win.on('focus')`
  — sauf si c'est le shell qui écrit, pour ne pas lui arracher son champ.
- `navigator.clipboard.readText()` exige que la page ait le focus, en plus de la
  permission : sinon « Document is not focused », sans qu'aucune question ne soit posée.
- **`dialog.showMessageBox` sans fenêtre parente peut se poser derrière.** La page
  attend alors une réponse que personne ne voit.
- Le menu du clic droit est natif (`src/main/menucontextuel.js`), pour la même raison
  que les autres menus : une vue web se peint au-dessus du HTML du shell.
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

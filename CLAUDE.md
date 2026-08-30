# Hublink — repères pour travailler sur ce dépôt

Client desktop Electron qui range les webapps de plusieurs comptes dans une fenêtre,
avec une partition Chromium par compte. Monorepo : `src/` (application) et `site/`
(vitrine Next.js).

Le code et les commits sont **en français**, au présent, décrivant le comportement
plutôt que la modification (« Corrige l'import manquant qui cassait le démarrage »).
Les commentaires expliquent *pourquoi*, pas *quoi*.

## État au 29 août 2026

| | Version |
|---|---|
| Windows | **0.4.5** |
| macOS | **0.3.7** — cinq versions de retard |

macOS accuse ce retard parce que les binaires Apple ne se construisent que sur un Mac
(voir plus bas). **Si vous lisez ceci depuis un Mac, c'est probablement la tâche à
faire.**

## Rattraper macOS — la marche à suivre

```bash
git pull
npm install
npm run dist:mac
```

Puis, en une seule opération :

1. Bumper `"version"` dans `package.json` (`npm version --no-git-tag-version <x.y.z>`).
2. Bumper `VERSION.mac` **et** `VERSION.win` dans `site/app/page.tsx` si les deux
   plateformes sont livrées ensemble ; sinon ne toucher que celle qui avance.
3. Construire aussi Windows si possible : depuis un Mac, `npm run dist:win` fonctionne
   (electron-builder embarque NSIS). L'inverse est impossible.
4. Suivre la procédure de release ci-dessous.

Les binaires attendus par le site sont nommés `Hublink-<version>-arm64.dmg` et
`Hublink-<version>-x64.dmg`.

## Procédure de release

L'ordre compte : le site se redéploie automatiquement au push sur `main`, donc pousser
le bump de version avant que les binaires n'existent afficherait des liens morts.

1. Bump `package.json` + `VERSION` dans `site/app/page.tsx`, commit.
2. `npm run dist:win` (et `dist:mac` sur un Mac).
3. Créer une branche, la pousser.
4. `gh release create vX.Y.Z --draft --target <sha>` avec les binaires **et
   `release/latest.yml`** — ce fichier est indispensable à la mise à jour automatique.
5. Fusionner sur `main`, pousser.
6. `gh release edit vX.Y.Z --draft=false`.
7. Vérifier : liens de téléchargement en 200, bandeau du site, changelog.

Il n'y a **pas de CI** : `.github/` ne contient qu'un `FUNDING.yml`.

## Ce qu'il ne faut pas casser

**Le changelog du site est automatique.** `site/app/releases.ts` lit l'API des releases
GitHub — ne jamais l'écrire à la main. Le corps d'une release doit respecter
`summarize()` : lignes de plus de 25 caractères, pas de `#`, `**`, `>` ni backtick en
début de ligne, **4 puces retenues** (donc mettre les plus importantes en premier). Les
lignes d'installation commençant par `**macOS**` / `**Windows**` sont filtrées exprès.

**Les notes de version s'écrivent dans les deux langues**, le site étant bilingue : le
français d'abord, puis un titre `## English` et sa traduction, puis les lignes
d'installation. `section()` découpe sur ce titre. Sans section anglaise, la page anglaise
retombe sur le français — mieux vaut ça qu'un changelog vide, mais ça se voit.

**Les versions sont par plateforme.** `const VERSION = { win, mac }` dans
`site/app/page.tsx`, à bumper à la main en plus de `package.json`. Les deux plateformes
n'avancent pas ensemble.

**`.dmg` ne se construit que sur macOS.** electron-builder refuse explicitement :
« Build for macOS is supported only on macOS ». `hdiutil` et `codesign` sont des
binaires Apple non redistribuables. Aucun contournement.

**La mise à jour automatique ne vaut que pour Windows.** `electron-updater` est embarqué
depuis la 0.4.1 ; `latest.yml` doit être joint à chaque release. Sur macOS, Squirrel.Mac
exige une application signée et notariée, donc un compte développeur Apple payant : on
s'y contente de signaler la version et de renvoyer vers la page de la release.

## Contrainte structurante : la vue web est native

Une `WebContentsView` **se peint au-dessus du HTML du shell**, quoi qu'on fasse. Tout ce
qui doit survoler la page ne peut donc pas être dessiné dans la fenêtre principale.

- Les menus sont **natifs** (`Menu.popup`) pour cette raison.
- Les modales masquent la vue le temps de s'afficher (`setOverlay`).
- Les **messages et les panneaux déroulants** vivent dans une fenêtre enfant
  transparente : `src/renderer/src/Overlay.tsx`, créée à la demande dans
  `src/main/index.js`. Elle laisse passer les clics
  (`setIgnoreMouseEvents(true, { forward: true })`) et ne devient réceptive que si un
  panneau est ouvert ou si le pointeur survole un message.

Avant la 0.4.4, dix-neuf messages étaient invisibles sans que personne ne s'en aperçoive.
**Ne jamais ajouter de notification ou de panneau flottant dans la fenêtre principale.**

## Pièges rencontrés

- `app.requestSingleInstanceLock()` empêche une seconde instance : pour tester sans
  fermer l'app installée, passer `--user-data-dir` (voir `demo.bat`). **Tuer l'ancienne
  instance de test avant d'en relancer une**, sinon on croit tester la nouvelle build
  alors que le verrou a simplement remonté l'ancienne fenêtre.
- `npx electron` résout parfois mal et tente de télécharger une autre version depuis le
  registre. Appeler `./node_modules/.bin/electron` directement.
- `protocol.handle` ne vaut que pour la session par défaut : chaque partition a son
  propre registre. La page d'accueil du navigateur est servie sur la session
  `persist:browser` (`src/main/startpage.js`).
- `navigator.setAppBadge()` existe dans Electron mais **n'est reliée à rien**. Le relais
  vers l'application se fait dans `src/preload/guest.js`. C'est par là que Slack et Teams
  signalent leurs non-lus, plus par le titre de la page.
- Le Chrome Web Store passe par une page `consent.google.com` avant d'afficher une
  fiche : détecter l'identifiant d'extension n'importe où dans l'URL décodée, pas
  seulement en tête.
- `site/.next/` est versionné à tort (128 fichiers qui changent à chaque build). Le
  retirer du suivi reste à faire.

const { Menu, MenuItem, clipboard, shell } = require('electron');
const { t } = require('./i18n');

/**
 * Le menu du clic droit dans les pages.
 *
 * Il est natif, et pas dessiné dans le shell : une `WebContentsView` se peint
 * au-dessus du HTML de la fenêtre, un menu en HTML passerait donc dessous.
 */

// Assez pour reconnaître sa sélection, pas assez pour déformer le menu.
const MAX_EXTRAIT = 32;

function extrait(texte) {
  const net = String(texte || '').trim().replace(/\s+/g, ' ');
  return net.length > MAX_EXTRAIT ? `${net.slice(0, MAX_EXTRAIT)}…` : net;
}

function brancher(wc, { fenetre, onEvent, rechercher, dev = false }) {
  wc.on('context-menu', (_e, params) => {
    const items = [];
    const ajouter = (opts) => items.push(new MenuItem(opts));
    // Les sections se composent selon l'endroit cliqué : le séparateur ne se
    // pose que s'il y a quelque chose à séparer, sinon le menu s'ouvre sur un
    // trait ou en aligne deux.
    const separer = () => {
      const dernier = items[items.length - 1];
      if (dernier && dernier.type !== 'separator') ajouter({ type: 'separator' });
    };

    const flags = params.editFlags || {};

    if (params.misspelledWord) {
      const propositions = (params.dictionarySuggestions || []).slice(0, 5);
      for (const mot of propositions) ajouter({ label: mot, click: () => wc.replaceMisspelling(mot) });
      if (!propositions.length) ajouter({ label: t('Aucune correction'), enabled: false });
      separer();
      ajouter({
        label: t('Ajouter au dictionnaire'),
        click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      });
      separer();
    }

    if (params.linkURL) {
      ajouter({ label: t('Ouvrir dans un nouvel onglet'), click: () => onEvent('tab-requested', { url: params.linkURL }) });
      // Un lien reçu par courriel mène souvent vers un outil déjà ouvert
      // ailleurs, avec la bonne session : on laisse le choix de sortir.
      ajouter({ label: t('Ouvrir dans le navigateur du système'), click: () => shell.openExternal(params.linkURL) });
      ajouter({ label: t("Copier l'adresse du lien"), click: () => clipboard.writeText(params.linkURL) });
      separer();
    }

    if (params.mediaType === 'image' && params.srcURL) {
      ajouter({ label: t("Copier l'image"), click: () => wc.copyImageAt(params.x, params.y) });
      ajouter({ label: t("Copier l'adresse de l'image"), click: () => clipboard.writeText(params.srcURL) });
      ajouter({ label: t("Enregistrer l'image…"), click: () => wc.downloadURL(params.srcURL) });
      separer();
    }

    if (params.isEditable) {
      // C'est la raison d'être de ce menu : sans lui, coller dans un champ
      // exigeait de connaître le raccourci clavier.
      ajouter({ label: t('Annuler|édition'), enabled: Boolean(flags.canUndo), click: () => wc.undo() });
      ajouter({ label: t('Rétablir'), enabled: Boolean(flags.canRedo), click: () => wc.redo() });
      separer();
      ajouter({ label: t('Couper'), enabled: Boolean(flags.canCut), click: () => wc.cut() });
      ajouter({ label: t('Copier'), enabled: Boolean(flags.canCopy), click: () => wc.copy() });
      ajouter({ label: t('Coller'), enabled: Boolean(flags.canPaste), click: () => wc.paste() });
      ajouter({
        label: t('Coller sans mise en forme'),
        enabled: Boolean(flags.canPaste),
        click: () => wc.pasteAndMatchStyle()
      });
      ajouter({ label: t('Tout sélectionner'), enabled: Boolean(flags.canSelectAll), click: () => wc.selectAll() });
      separer();
    } else if (params.selectionText) {
      ajouter({ label: t('Copier'), enabled: Boolean(flags.canCopy), click: () => wc.copy() });
      ajouter({
        label: t('Rechercher « {texte} »', { texte: extrait(params.selectionText) }),
        click: () => onEvent('tab-requested', { url: rechercher(params.selectionText) })
      });
      separer();
    }

    // Le fond de la page : ce qu'on attend d'un clic droit dans le vide.
    if (!params.linkURL && !params.isEditable && !params.selectionText) {
      ajouter({
        label: t('Précédent'),
        enabled: wc.navigationHistory.canGoBack(),
        click: () => wc.navigationHistory.goBack()
      });
      ajouter({
        label: t('Suivant'),
        enabled: wc.navigationHistory.canGoForward(),
        click: () => wc.navigationHistory.goForward()
      });
      ajouter({ label: t('Recharger'), click: () => wc.reload() });
      separer();
      ajouter({ label: t("Copier l'adresse de la page"), click: () => clipboard.writeText(wc.getURL()) });
    }

    if (dev) {
      separer();
      ajouter({ label: t("Inspecter l'élément"), click: () => wc.inspectElement(params.x, params.y) });
    }

    // Une section vide laisserait un trait esseulé en fin de menu.
    while (items.length && items[items.length - 1].type === 'separator') items.pop();
    if (!items.length) return;

    const menu = new Menu();
    for (const item of items) menu.append(item);
    menu.popup({ window: fenetre });
  });
}

module.exports = { brancher };

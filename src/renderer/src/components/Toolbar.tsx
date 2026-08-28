import * as React from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Blocks, Camera, Download as DownloadIcon, ExternalLink, FileDown, FolderOpen, Home, PanelLeft, PanelLeftClose, PictureInPicture2, Puzzle, RotateCw, Star, X } from 'lucide-react';
import type { Download, LoadedExtension, MenuItem, NavState, Service, Update } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Props = {
  service: Service | null;
  nav: NavState | null;
  isMac: boolean;
  sidebarCollapsed: boolean;
  loadedExtensions: LoadedExtension[];
  update: Update | null;
  onToggleSidebar: () => void;
  onOpenExtensions: () => void;
  /** En mode navigateur, la barre d'adresse devient saisissable. */
  browserMode: boolean;
  /** L'URL affichée figure déjà dans les favoris. */
  isFavorite: boolean;
  onToggleFavorite: () => void;
  downloads: Download[];
  onClearDownloads: () => void;
  downloadsOpen: boolean;
  onToggleDownloads: (open: boolean) => void;
  /** La page courante a déjà joué une vidéo. */
  hasVideo: boolean;
};

/**
 * Barre d'adresse du mode navigateur. Elle suit la page tant qu'on n'y touche
 * pas : sans cela, une navigation en arrière-plan écraserait ce qu'on est en
 * train de taper.
 */
function AddressInput({ url }: { url: string }) {
  const api = window.hublink;
  // La page d'accueil est interne : afficher `hublink://start` n'apprendrait
  // rien, on laisse le champ vide et son invite visible.
  const shown = url.startsWith('hublink://') ? '' : url;
  const [value, setValue] = React.useState(shown);
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    if (!editing) setValue(shown);
  }, [shown, editing]);

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => {
        setEditing(true);
        e.currentTarget.select();
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          api.nav.go(value);
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setValue(url);
          e.currentTarget.blur();
        }
      }}
      spellCheck={false}
      placeholder="Rechercher ou saisir une adresse"
      aria-label="Adresse"
      className="min-w-0 flex-1 bg-transparent text-[11px] text-shell-foreground outline-none placeholder:text-shell-muted"
    />
  );
}

/**
 * Pastille de mise à jour.
 *
 * Sous Windows on télécharge et on installe sur place : le fichier ne passe
 * pas par le navigateur, donc ni SmartScreen ni UAC. Ailleurs — macOS exigeant
 * une app signée pour l'installation silencieuse — on ouvre la page de la
 * version, comme avant.
 */
function UpdateBadge({ update }: { update: Update }) {
  const api = window.hublink;
  const [auto, setAuto] = React.useState(false);
  const [percent, setPercent] = React.useState<number | null>(null);
  const [pret, setPret] = React.useState(false);

  React.useEffect(() => {
    api.updater.canInstall().then(setAuto);
  }, [api]);
  React.useEffect(() => api.updater.onProgress(({ percent: p }) => setPercent(p)), [api]);

  const libelle = pret
    ? 'Redémarrer pour installer'
    : percent !== null
      ? `${percent} %`
      : update.version;

  const cliquer = async () => {
    if (!auto) return api.openExternal(update.url);
    if (pret) return api.updater.install();
    if (percent !== null) return;
    setPercent(0);
    try {
      await api.updater.download();
      setPret(true);
    } catch {
      // Le téléchargement interne a échoué : la page de la version reste
      // toujours accessible, on y renvoie plutôt que de laisser sans issue.
      setPercent(null);
      api.openExternal(update.page);
    }
  };

  return (
    <button
      type="button"
      onClick={cliquer}
      title={
        pret
          ? `Hublink ${update.version} est prêt à s'installer`
          : `Hublink ${update.version} est disponible`
      }
      className="mr-1 flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/25 dark:text-emerald-300"
    >
      <ArrowDownToLine className={cn('size-3', percent !== null && !pret && 'animate-pulse')} />
      {libelle}
    </button>
  );
}

/** « 4,2 Mo », « 812 Ko » — la taille telle qu'on l'attend dans une liste. */
function poids(octets: number) {
  if (!octets) return '';
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * Indicateur de téléchargement.
 *
 * La progression vit dans la barre d'outils, pas dans un panneau : la vue web
 * est une vue native peinte au-dessus du HTML du shell, un menu déroulant
 * dessiné ici serait donc masqué par la page. La liste passe par un menu
 * natif, qui lui se dessine par-dessus.
 */
function DownloadsButton({
  downloads,
  onClear,
  open,
  onOpenChange
}: {
  downloads: Download[];
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = window.hublink;
  const actifs = downloads.filter((d) => d.state === 'progress');
  const recu = actifs.reduce((n, d) => n + d.received, 0);
  const attendu = actifs.reduce((n, d) => n + d.total, 0);
  // Certains serveurs n'annoncent pas la taille : sans total, la barre ne peut
  // pas dire où on en est, elle indique seulement que ça travaille.
  const pourcent = attendu > 0 ? Math.min(100, Math.round((recu / attendu) * 100)) : null;

  // Le dernier arrivé reste nommé quelques secondes, puis l'indicateur se
  // réduit à son icône : on montre que le téléchargement a démarré sans
  // encombrer la barre ensuite.
  const dernier = downloads[0];
  const [nomme, setNomme] = React.useState(false);
  React.useEffect(() => {
    if (!dernier) return;
    setNomme(true);
    const t = setTimeout(() => setNomme(false), 4000);
    return () => clearTimeout(t);
  }, [dernier?.id]);

  if (downloads.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        title={actifs.length > 0 ? `${actifs.length} téléchargement(s) en cours` : 'Téléchargements'}
        aria-label="Téléchargements"
        aria-expanded={open}
        className={cn(
          'relative mr-1 flex items-center gap-1.5 overflow-hidden rounded-md px-1.5 py-1 transition-colors',
          open
            ? 'bg-shell-active text-shell-foreground'
            : 'text-shell-muted hover:bg-shell-active hover:text-shell-foreground'
        )}
      >
        <DownloadIcon
          className={cn('size-4 shrink-0', actifs.length > 0 && 'animate-bounce text-shell-foreground')}
        />
        {nomme && dernier && (
          <span className="animate-in fade-in slide-in-from-right-2 max-w-[140px] truncate text-[11px] duration-300">
            {dernier.name}
            {pourcent !== null && actifs.length > 0 ? ` \u00b7 ${pourcent} %` : ''}
          </span>
        )}
        {actifs.length > 0 && (
          <span className="absolute inset-x-1 bottom-0 h-[2px] overflow-hidden rounded-full bg-shell-active">
            <span
              className={cn(
                'block h-full rounded-full bg-emerald-500 transition-[width] duration-200',
                pourcent === null && 'w-1/3 animate-pulse'
              )}
              style={pourcent !== null ? { width: `${pourcent}%` } : undefined}
            />
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Ferme au clic à côté, comme n'importe quel menu. */}
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Téléchargements"
            className="animate-in fade-in slide-in-from-top-1 absolute top-full right-0 z-50 mt-1.5 w-[320px] overflow-hidden rounded-lg border border-shell-border bg-shell-raised shadow-lg duration-150"
          >
            <div className="flex items-center justify-between border-b border-shell-border px-3 py-2">
              <span className="text-[12px] font-medium text-shell-foreground">Téléchargements</span>
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] text-shell-muted transition-colors hover:text-shell-foreground"
              >
                Effacer la liste
              </button>
            </div>

            <ul className="max-h-[320px] overflow-y-auto py-1">
              {downloads.map((d) => {
                const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : null;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      disabled={d.state !== 'completed'}
                      onClick={() => {
                        api.downloads.open(d.path);
                        onOpenChange(false);
                      }}
                      className="group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors enabled:hover:bg-shell-hover disabled:cursor-default"
                    >
                      <FileDown
                        className={cn(
                          'size-4 shrink-0',
                          d.state === 'completed' ? 'text-shell-muted' : 'text-shell-muted/60'
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-shell-foreground">{d.name}</span>
                        <span className="block truncate text-[11px] text-shell-muted">
                          {d.state === 'progress'
                            ? pct !== null
                              ? `${pct} % \u2014 ${poids(d.received)} sur ${poids(d.total)}`
                              : `${poids(d.received)} reçus`
                            : d.state === 'completed'
                              ? poids(d.total)
                              : 'Interrompu'}
                        </span>
                        {d.state === 'progress' && (
                          <span className="mt-1 block h-[2px] overflow-hidden rounded-full bg-shell-active">
                            <span
                              className={cn(
                                'block h-full rounded-full bg-emerald-500 transition-[width] duration-200',
                                pct === null && 'w-1/3 animate-pulse'
                              )}
                              style={pct !== null ? { width: `${pct}%` } : undefined}
                            />
                          </span>
                        )}
                      </span>
                      {d.state === 'completed' && (
                        <span
                          role="button"
                          tabIndex={0}
                          title="Ouvrir le dossier"
                          aria-label={`Ouvrir le dossier contenant ${d.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            api.downloads.reveal(d.path);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            e.stopPropagation();
                            api.downloads.reveal(d.path);
                          }}
                          className="shrink-0 rounded p-1 text-shell-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-shell-foreground focus-visible:opacity-100"
                        >
                          <FolderOpen className="size-3.5" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

          </div>
        </>
      )}
    </div>
  );
}

export function Toolbar({
  service,
  nav,
  isMac,
  sidebarCollapsed,
  loadedExtensions,
  update,
  onToggleSidebar,
  onOpenExtensions,
  browserMode,
  isFavorite,
  onToggleFavorite,
  downloads,
  onClearDownloads,
  downloadsOpen,
  onToggleDownloads,
  hasVideo
}: Props) {
  const api = window.hublink;

  // Le Chrome Web Store n'installe rien de lui-même dans Hublink : son bouton
  // « Ajouter à Chrome » s'appuie sur une API que le moteur n'expose pas. On
  // reconnaît la fiche d'une extension et on propose de l'installer nous-mêmes,
  // avec la mécanique qui existe déjà dans les réglages.
  const storeId = React.useMemo(() => {
    const url = nav?.url ?? '';
    if (!/^https:\/\/chromewebstore\.google\.com\/detail\//.test(url)) return null;
    const m = url.match(/([a-p]{32})/);
    return m ? m[1] : null;
  }, [nav?.url]);

  const [installing, setInstalling] = React.useState(false);
  const installerExtension = async () => {
    if (!storeId) return;
    setInstalling(true);
    try {
      await api.extensions.installFromStore(storeId);
    } finally {
      setInstalling(false);
    }
  };

  // Menu natif : un menu HTML serait masqué par la vue web, qui est une vue
  // native peinte au-dessus du shell.
  // Les extensions de capture ne peuvent pas fonctionner sous Electron
  // (`chrome.tabs.captureVisibleTab` n'existe pas) : la capture est native.
  const openCaptureMenu = async () => {
    const picked = await api.popupMenu([
      { id: 'full-save', label: 'Page entière — enregistrer…' },
      { id: 'full-copy', label: 'Page entière — copier' },
      { type: 'separator' },
      { id: 'visible-save', label: 'Zone visible — enregistrer…' },
      { id: 'visible-copy', label: 'Zone visible — copier' }
    ]);
    if (!picked) return;
    api.capturePage({ fullPage: picked.startsWith('full'), toClipboard: picked.endsWith('copy') });
  };

  const openExtensionsMenu = async () => {
    const items: MenuItem[] = loadedExtensions.length
      ? loadedExtensions.map((ext) => ({
          id: ext.chromeId,
          label: ext.hasPopup ? ext.name : `${ext.name} (pas de popup)`,
          enabled: ext.hasPopup
        }))
      : [{ id: 'none', label: 'Aucune extension chargée', enabled: false }];

    const picked = await api.popupMenu([
      ...items,
      { type: 'separator' },
      { id: '__manage', label: 'Gérer les extensions…' }
    ]);
    if (picked === '__manage') onOpenExtensions();
    else if (picked && picked !== 'none') api.extensions.openPopup(picked);
  };

  return (
    <div
      className={cn(
        'drag flex h-11 shrink-0 items-center gap-1 border-b-2 border-shell-border bg-shell-raised pr-2',
        // Réserve la zone des feux macOS (x 16 -> 70) : sans cela ils
        // chevauchent le premier contrôle.
        isMac ? 'pl-[86px]' : 'pl-2'
      )}
    >
      <div className="no-drag flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          className="text-shell-muted hover:bg-shell-active hover:text-shell-foreground"
          aria-label={sidebarCollapsed ? 'Afficher le panneau' : 'Masquer le panneau'}
          aria-pressed={!sidebarCollapsed}
          title={`${sidebarCollapsed ? 'Afficher' : 'Masquer'} le panneau (${isMac ? '⌘' : 'Ctrl+'}B)`}
        >
          {sidebarCollapsed ? <PanelLeft /> : <PanelLeftClose />}
        </Button>
        <span className="mx-1 h-5 w-px shrink-0 bg-shell-border" aria-hidden />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!nav?.canGoBack}
          onClick={() => api.nav.back()}
          className="text-shell-muted hover:bg-shell-active hover:text-shell-foreground"
          aria-label="Précédent"
          title="Précédent"
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!nav?.canGoForward}
          onClick={() => api.nav.forward()}
          className="text-shell-muted hover:bg-shell-active hover:text-shell-foreground"
          aria-label="Suivant"
          title="Suivant"
        >
          <ArrowRight />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!service && !browserMode}
          onClick={() => (nav?.loading ? api.nav.stop() : api.nav.reload())}
          className="text-shell-muted hover:bg-shell-active hover:text-shell-foreground"
          aria-label={nav?.loading ? 'Arrêter' : 'Recharger'}
          title={nav?.loading ? 'Arrêter' : 'Recharger'}
        >
          {nav?.loading ? <X /> : <RotateCw />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!service && !browserMode}
          onClick={() => api.nav.home()}
          className="text-shell-muted hover:bg-shell-active hover:text-shell-foreground"
          aria-label={browserMode ? "Page d'accueil" : "Revenir à l'URL du service"}
          title={browserMode ? "Page d'accueil" : "Revenir à l'URL du service"}
        >
          <Home />
        </Button>
      </div>

      <div className="no-drag mx-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-shell-input px-2.5">
        {browserMode ? (
          <AddressInput url={nav?.url ?? ''} />
        ) : (
          <span className="truncate text-[11px] text-shell-muted" title={nav?.url ?? service?.url ?? ''}>
            {nav?.url ?? service?.url ?? 'Aucun service sélectionné'}
          </span>
        )}
        {browserMode && nav?.url && !nav.url.startsWith('hublink://') && (
          <button
            type="button"
            onClick={onToggleFavorite}
            className={cn(
              'ml-auto shrink-0 transition-colors',
              isFavorite ? 'text-amber-500' : 'text-shell-muted hover:text-shell-foreground'
            )}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={isFavorite}
            title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Star className={cn('size-3.5', isFavorite && 'fill-current')} />
          </button>
        )}
        {nav?.url && (
          <button
            type="button"
            onClick={() => api.openExternal(nav.url)}
            className={cn(
              'shrink-0 text-shell-muted transition-colors hover:text-shell-foreground',
              !browserMode && 'ml-auto'
            )}
            aria-label="Ouvrir dans le navigateur"
            title="Ouvrir dans le navigateur"
          >
            <ExternalLink className="size-3.5" />
          </button>
        )}
      </div>

      <div className="no-drag flex items-center gap-0.5">
        {hasVideo && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => api.media.togglePictureInPicture()}
            className="text-shell-muted hover:bg-shell-active hover:text-shell-foreground"
            aria-label="Incrustation vidéo"
            title="Incrustation vidéo — détacher la vidéo dans une fenêtre flottante"
          >
            <PictureInPicture2 />
          </Button>
        )}
        {storeId && (
          <Button
            variant="ghost"
            size="sm"
            disabled={installing}
            onClick={installerExtension}
            className="mr-1 h-7 gap-1.5 px-2 text-[11px] text-shell-muted hover:bg-shell-active hover:text-shell-foreground"
            title="Installer cette extension dans Hublink"
          >
            <Blocks className="size-3.5" />
            {installing ? 'Installation…' : 'Installer'}
          </Button>
        )}
        <DownloadsButton
          downloads={downloads}
          onClear={onClearDownloads}
          open={downloadsOpen}
          onOpenChange={onToggleDownloads}
        />
        {update && <UpdateBadge update={update} />}
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!service && !browserMode}
          onClick={openCaptureMenu}
          className="text-shell-muted hover:bg-shell-active hover:text-shell-foreground"
          aria-label="Capturer la page"
          title="Capturer la page"
        >
          <Camera />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={openExtensionsMenu}
          className="relative text-shell-muted hover:bg-shell-active hover:text-shell-foreground"
          aria-label="Extensions de ce client"
          title="Extensions de ce client"
        >
          <Puzzle />
          {loadedExtensions.length > 0 && (
            <span className="absolute right-1 bottom-1 size-1.5 rounded-full bg-emerald-500" />
          )}
        </Button>
      </div>
    </div>
  );
}

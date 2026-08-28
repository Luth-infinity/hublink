import * as React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  ArrowDownToLine,
  Camera,
  Home,
  PanelLeft,
  PanelLeftClose,
  Puzzle,
  RotateCw,
  Star,
  X
} from 'lucide-react';
import type { LoadedExtension, MenuItem, NavState, Service, Update } from '@/types';
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
  onToggleFavorite
}: Props) {
  const api = window.hublink;

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

import * as React from 'react';
import { Toaster, toast } from 'sonner';
import { Plus } from 'lucide-react';
import type {
  Account,
  AppState,
  Download,
  LoadedExtension,
  NavState,
  Service,
  Theme,
  Update
} from '@/types';
import { Button } from '@/components/ui/button';
import { accountTints, useSyncedTheme } from '@/lib/theme';
import { drawOverlayBadge } from '@/lib/badge';
import { Sidebar } from '@/components/Sidebar';
import { Toolbar } from '@/components/Toolbar';
import { ServiceDialog } from '@/components/ServiceDialog';
import { AccountDialog } from '@/components/AccountDialog';
import { SettingsDialog } from '@/components/SettingsDialog';

const api = window.hublink;
const isMac = api.platform === 'darwin';

/**
 * La liste ne retient que les cinq derniers téléchargements : elle sert à
 * retrouver un fichier qu'on vient de prendre, pas à tenir un historique. Ce
 * qui sort de la liste reste évidemment sur le disque — on ne supprime jamais
 * un fichier de l'utilisateur. Un transfert en cours n'est jamais évincé,
 * sinon sa progression disparaîtrait sous les yeux de qui l'attend.
 */
const MAX_DOWNLOADS = 5;

function purge(liste: Download[]): Download[] {
  const encours = liste.filter((d) => d.state === 'progress');
  const finis = liste.filter((d) => d.state !== 'progress');
  return [...encours, ...finis].slice(0, Math.max(MAX_DOWNLOADS, encours.length));
}

export default function App() {
  const [state, setState] = React.useState<AppState | null>(null);
  const [nav, setNav] = React.useState<NavState | null>(null);
  const [loadedExtensions, setLoadedExtensions] = React.useState<LoadedExtension[]>([]);

  const [serviceDialog, setServiceDialog] = React.useState<{ open: boolean; service: Service | null }>({
    open: false,
    service: null
  });
  const [accountDialog, setAccountDialog] = React.useState<{ open: boolean; account: Account | null }>({
    open: false,
    account: null
  });
  // Un seul point d'entrée pour tous les réglages, plutôt que trois entrées
  // séparées en pied de panneau.
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState('general');
  // Services libérés de la mémoire : on le signale plutôt que de laisser
  // l'utilisateur se demander pourquoi la page s'est rechargée.
  const [sleeping, setSleeping] = React.useState<string[]>([]);
  const [update, setUpdate] = React.useState<Update | null>(null);
  // Téléchargements de la session. On n'en garde qu'une poignée : la liste
  // sert à retrouver un fichier qu'on vient de prendre, pas à tenir un
  // historique.
  const [downloads, setDownloads] = React.useState<Download[]>([]);
  const [downloadsOpen, setDownloadsOpen] = React.useState(false);
  // Vues ayant déjà joué une vidéo : l'incrustation ne s'affiche que là.
  const [avecMedia, setAvecMedia] = React.useState<string[]>([]);

  const contentRef = React.useRef<HTMLDivElement>(null);

  const isDark = useSyncedTheme();

  // La teinte du compte filtré habille le shell. Elle doit être posée sur
  // <html> : `--shell` est calculée sur `:root`, donc une variable définie sur
  // un descendant ne la ferait pas recalculer.
  const filteredAccount = state?.accounts.find((a) => a.id === state.activeAccountId) ?? null;
  // En mode navigateur il n'y a pas de compte d'où tirer une couleur : c'est
  // la teinte choisie dans les réglages qui habille le shell.
  const filteredColor = state?.browserMode
    ? (state.accentColor ?? null)
    : (filteredAccount?.color ?? null);
  React.useEffect(() => {
    const root = document.documentElement;
    const tints = filteredColor ? accountTints(filteredColor, isDark) : null;
    if (tints) {
      root.style.setProperty('--tint-surface', tints.surface);
      root.style.setProperty('--tint-line', tints.line);
    } else {
      root.style.removeProperty('--tint-surface');
      root.style.removeProperty('--tint-line');
    }
  }, [filteredColor, isDark]);

  const service = state?.services.find((s) => s.id === state.activeServiceId) ?? null;
  const account = state?.accounts.find((a) => a.id === service?.accountId) ?? null;

  React.useEffect(() => {
    api.getState().then(setState);
    return api.onStateChanged(setState);
  }, []);

  React.useEffect(() => api.nav.onState(setNav), []);

  React.useEffect(() => api.onUpdateAvailable(setUpdate), []);

  React.useEffect(
    () =>
      api.media.onPresent(({ id, present }) =>
        setAvecMedia((prev) =>
          present ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)
        )
      ),
    []
  );

  // Un téléchargement se signale à son terme, pas à chaque bloc reçu : un
  // fichier de quelques centaines de kilo-octets arrive avant qu'on ait lu la
  // moindre progression.
  React.useEffect(
    () =>
      api.downloads.onStarted(({ id, name, total, path }) =>
        setDownloads((prev) => purge([
          { id, name, path, total, received: 0, state: 'progress' as const },
          ...prev
        ]))
      ),
    []
  );

  React.useEffect(
    () =>
      api.downloads.onProgress(({ id, received, total }) =>
        setDownloads((prev) =>
          prev.map((d) => (d.id === id ? { ...d, received, total: total || d.total } : d))
        )
      ),
    []
  );

  React.useEffect(
    () =>
      api.downloads.onDone(({ id, name, path, state, total }) => {
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === id
              ? { ...d, state: state as Download['state'], received: total || d.received, total: total || d.total }
              : d
          )
        );
        if (state !== 'completed') {
          toast.error(`Téléchargement interrompu : ${name}`);
          return;
        }
        toast.success(name, {
          description: 'Téléchargé',
          action: { label: 'Ouvrir le dossier', onClick: () => api.downloads.reveal(path) }
        });
      }),
    []
  );

  const clearDownloads = React.useCallback(() => {
    setDownloads([]);
    setDownloadsOpen(false);
  }, []);

  // Titre, URL et favicon d'un onglet changent en continu : même traitement
  // que les services, on n'applique que le delta.
  React.useEffect(
    () =>
      api.browser.onTabMeta(({ tabId, ...patch }) =>
        setState((prev) => {
          if (!prev) return prev;
          const index = prev.tabs.findIndex((t) => t.id === tabId);
          if (index < 0) return prev;
          const tabs = [...prev.tabs];
          tabs[index] = { ...tabs[index], ...patch };
          return { ...prev, tabs };
        })
      ),
    []
  );

  React.useEffect(
    () => api.onToast(({ variant, message }) => (variant === 'error' ? toast.error(message) : toast.success(message))),
    []
  );

  // Applique le delta badge / favicon sans repasser par un état complet.
  React.useEffect(
    () =>
      api.onServiceMeta(({ serviceId, ...patch }) =>
        setState((prev) => {
          if (!prev) return prev;
          const index = prev.services.findIndex((s) => s.id === serviceId);
          if (index < 0) return prev;
          const services = [...prev.services];
          services[index] = { ...services[index], ...patch };
          return { ...prev, services };
        })
      ),
    []
  );

  React.useEffect(
    () =>
      api.onServiceSlept(({ serviceId }) =>
        setSleeping((prev) => (prev.includes(serviceId) ? prev : [...prev, serviceId]))
      ),
    []
  );

  // La vue web est une vue NATIVE : elle se peint au-dessus du HTML du shell.
  // Sans ce masquage, une modale s'ouvre derrière la page — on ne voit que
  // l'overlay sombre et plus aucun clic n'aboutit.
  const overlayOpen =
    serviceDialog.open || accountDialog.open || settingsOpen || downloadsOpen;
  React.useEffect(() => {
    api.setOverlay(overlayOpen);
  }, [overlayOpen]);

  // La vue native est positionnée par le process principal : on lui envoie la
  // géométrie réelle de la zone de contenu à chaque changement de layout.
  // `ready` est indispensable : tant que l'état n'est pas chargé on affiche
  // l'écran d'attente, contentRef est vide, et un effet sans dépendance ne
  // repasserait jamais — la vue resterait en 0 × 0.
  const ready = state !== null;
  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const report = () => {
      const rect = node.getBoundingClientRect();
      api.setContentBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [ready]);

  // La liste des extensions chargées dépend de la session du compte courant.
  // La clé est volontairement une chaîne : `state.extensions` est un nouveau
  // tableau à chaque rafraîchissement, ce qui relancerait l'effet en boucle.
  const extensionsKey = (state?.extensions ?? [])
    .map((ext) => `${ext.id}:${account ? ext.enabled[account.id] !== false : false}`)
    .join('|');

  React.useEffect(() => {
    if (!account) return setLoadedExtensions([]);
    let cancelled = false;
    api.extensions.loaded(account.id).then((list) => {
      if (!cancelled) setLoadedExtensions(list);
    });
    return () => {
      cancelled = true;
    };
  }, [account?.id, extensionsKey]);

  // Total des non-lus, tous comptes confondus : c'est ce qui doit remonter au
  // dock ou à la barre des tâches, même quand un filtre masque des services.
  const totalUnread = (state?.services ?? []).reduce((sum, s) => sum + (s.badge || 0), 0);
  React.useEffect(() => {
    api.setBadge({ total: totalUnread, overlay: drawOverlayBadge(totalUnread) });
  }, [totalUnread]);

  // Références stables : sans elles, `React.memo(Sidebar)` ne filtrerait rien.
  const openNewService = React.useCallback(() => setServiceDialog({ open: true, service: null }), []);
  const openNewAccount = React.useCallback(() => setAccountDialog({ open: true, account: null }), []);
  const selectService = React.useCallback((id: string) => {
    setSleeping((prev) => prev.filter((key) => key !== id));
    return api.services.select(id);
  }, []);
  const editService = React.useCallback((s: Service) => setServiceDialog({ open: true, service: s }), []);
  const removeService = React.useCallback((s: Service) => api.services.remove(s.id), []);
  const toggleLinkPolicy = React.useCallback(
    (s: Service) => api.services.update(s.id, { openLinks: s.openLinks === 'app' ? 'browser' : 'app' }),
    []
  );
  const activeId = state?.activeServiceId ?? null;
  const reloadService = React.useCallback(
    (s: Service) => (s.id === activeId ? api.nav.reload() : api.services.select(s.id)),
    [activeId]
  );
  // L'ordre se calcule toujours sur la liste COMPLÈTE : filtrer sur un compte
  // n'affiche qu'un sous-ensemble, et réordonner ce sous-ensemble seul
  // mélangerait les autres.
  const allIds = (state?.services ?? []).map((s) => s.id).join(',');
  const reorder = React.useCallback(
    (draggedId: string, targetId: string) => {
      const ids = allIds ? allIds.split(',') : [];
      const from = ids.indexOf(draggedId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      api.services.reorder(ids);
    },
    [allIds]
  );

  const openSettings = React.useCallback((tab = 'general') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);
  const openAccounts = React.useCallback(() => openSettings('general'), [openSettings]);
  const openExtensions = React.useCallback(() => openSettings('extensions'), [openSettings]);
  const setTheme = React.useCallback((theme: Theme) => api.setTheme(theme), []);
  const setSleepDelay = React.useCallback((minutes: number) => api.setSleepDelay(minutes), []);
  const captureFull = React.useCallback(() => api.capturePage({ fullPage: true, toClipboard: false }), []);
  const captureVisible = React.useCallback(
    () => api.capturePage({ fullPage: false, toClipboard: false }),
    []
  );
  const toggleSidebar = React.useCallback(() => api.toggleSidebar(), []);

  const filterAccount = React.useCallback((id: string | null) => api.accounts.filter(id), []);

  const toggleBrowser = React.useCallback((on: boolean) => api.browser.toggle(on), []);
  const toggleFavorite = React.useCallback(() => api.browser.toggleFavorite(), []);
  const openFavorite = React.useCallback((id: string) => api.browser.openFavorite(id), []);
  const removeFavorite = React.useCallback((id: string) => api.browser.removeFavorite(id), []);
  const selectTab = React.useCallback((id: string) => {
    // Réveiller un onglet endormi : on retire la marque avant même le
    // rechargement, sinon la lune resterait affichée sur l'onglet actif.
    setSleeping((prev) => prev.filter((key) => key !== id));
    return api.browser.selectTab(id);
  }, []);
  const closeTab = React.useCallback((id: string) => api.browser.closeTab(id), []);
  const addTab = React.useCallback(() => api.browser.addTab(), []);

  const services = React.useMemo(() => {
    const all = state?.services ?? [];
    const filter = state?.activeAccountId;
    return filter ? all.filter((s) => s.accountId === filter) : all;
  }, [state]);

  // Non-lus par compte : un compte masqué ne doit pas faire rater un message.
  const unreadByAccount = React.useMemo(() => {
    const totals: Record<string, number> = {};
    for (const service of state?.services ?? []) {
      totals[service.accountId] = (totals[service.accountId] || 0) + (service.badge || 0);
    }
    return totals;
  }, [state]);

  // Ctrl+1..9 : les onglets en mode navigateur, les services sinon. Sans ce
  // partage, le raccourci afficherait un service alors que le panneau montre
  // des onglets — la fenêtre et la liste ne diraient plus la même chose.
  const selectByIndex = React.useCallback(
    (index: number) => {
      if (state?.browserMode) {
        const tab = state.tabs[index];
        if (tab) selectTab(tab.id);
        return;
      }
      const target = services[index];
      if (target) selectService(target.id);
    },
    [state?.browserMode, state?.tabs, services, selectService, selectTab]
  );

  React.useEffect(
    () =>
      api.onShortcut((shortcut) => {
        if (shortcut.type === 'new-service') openNewService();
        else if (shortcut.type === 'new-account') openNewAccount();
        else if (shortcut.type === 'extensions') openExtensions();
        else if (shortcut.type === 'toggle-sidebar') toggleSidebar();
        else if (shortcut.type === 'capture-full') captureFull();
        else if (shortcut.type === 'capture-visible') captureVisible();
        else if (shortcut.type === 'select-service') selectByIndex(shortcut.index ?? -1);
      }),
    [openNewService, openNewAccount, toggleSidebar, selectByIndex, openExtensions, captureFull, captureVisible]
  );

  // Les mêmes raccourcis quand le focus est sur le shell et non sur la webapp.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod) return;
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        selectByIndex(Number(event.key) - 1);
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectByIndex, toggleSidebar]);

  if (!state) return <div className="grid h-full place-items-center text-shell-muted">Chargement…</div>;

  return (
    <>
      <div className="flex h-full flex-col">
        <Toolbar
          service={service}
          nav={nav}
          isMac={isMac}
          sidebarCollapsed={state.sidebarCollapsed}
          browserMode={state.browserMode}
          isFavorite={state.favorites.some((f) => f.url === (nav?.url ?? ''))}
          downloads={downloads}
          onClearDownloads={clearDownloads}
          downloadsOpen={downloadsOpen}
          onToggleDownloads={setDownloadsOpen}
          hasVideo={avecMedia.includes(
            (state.browserMode ? state.activeTabId : state.activeServiceId) ?? ''
          )}
          onToggleFavorite={toggleFavorite}
          loadedExtensions={loadedExtensions}
          update={update}
          onToggleSidebar={toggleSidebar}
          onOpenExtensions={openExtensions}
        />

        <div className="flex min-h-0 flex-1">
          <Sidebar
            services={services}
            accounts={state.accounts}
            activeServiceId={state.activeServiceId}
            activeAccountId={state.activeAccountId}
            unreadByAccount={unreadByAccount}
            onFilterAccount={filterAccount}
            collapsed={state.sidebarCollapsed}
            isDark={isDark}
            sleeping={sleeping}
            onSelectService={selectService}
            onAddService={openNewService}
            onEditService={editService}
            onRemoveService={removeService}
            onReloadService={reloadService}
            onToggleLinkPolicy={toggleLinkPolicy}
            onReorder={reorder}
            onOpenSettings={openAccounts}
            browserMode={state.browserMode}
            tabs={state.tabs}
            activeTabId={state.activeTabId}
            onToggleBrowser={toggleBrowser}
            onSelectTab={selectTab}
            onCloseTab={closeTab}
            onAddTab={addTab}
            favorites={state.favorites}
            onOpenFavorite={openFavorite}
            onRemoveFavorite={removeFavorite}
          />

          <main className="flex min-w-0 flex-1 flex-col">
            <div ref={contentRef} className="relative min-h-0 flex-1 bg-shell">
              {/* En mode navigateur, la vue de l'onglet occupe la zone : cet
                  écran d'accueil n'aurait rien à y faire. */}
              {!service && !state.browserMode && (
                <div className="grid h-full place-items-center px-8 text-center">
                  <div className="flex max-w-sm flex-col items-center gap-3">
                    <h2 className="text-base font-semibold">Aucun service</h2>
                    <p className="text-xs leading-relaxed text-shell-muted">
                      Ajoute une webapp — messagerie, intranet, outils. Chacune s'ouvre dans la session du
                      compte que tu lui attribues.
                    </p>
                    <Button size="sm" onClick={openNewService} className="mt-1 gap-2">
                      <Plus /> Ajouter un service
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      <ServiceDialog
        open={serviceDialog.open}
        service={serviceDialog.service}
        accounts={state.accounts}
        defaultAccountId={state.activeAccountId ?? service?.accountId ?? null}
        onOpenChange={(open) => setServiceDialog((prev) => ({ ...prev, open }))}
        onSubmit={(data) => {
          if (serviceDialog.service) api.services.update(serviceDialog.service.id, data);
          else api.services.add(data);
        }}
        onCreateAccount={openNewAccount}
      />

      <AccountDialog
        open={accountDialog.open}
        account={accountDialog.account}
        onOpenChange={(open) => setAccountDialog((prev) => ({ ...prev, open }))}
        onSubmit={(data) => {
          if (accountDialog.account) api.accounts.update(accountDialog.account.id, data);
          else api.accounts.add(data);
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        state={state}
        account={account}
        services={state.services}
        onOpenChange={setSettingsOpen}
        onCreateAccount={openNewAccount}
        onEditAccount={(a: Account) => setAccountDialog({ open: true, account: a })}
        onDeleteAccount={(a: Account) => api.accounts.remove(a.id)}
        onSetTheme={setTheme}
        onSetSleepDelay={setSleepDelay}
      />

      <Toaster theme="system" position="bottom-right" richColors />
    </>
  );
}

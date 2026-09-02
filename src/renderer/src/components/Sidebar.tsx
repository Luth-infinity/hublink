import * as React from 'react';
import { ChevronRight, Compass, EyeOff, Moon, Plus, Settings, Star, X } from 'lucide-react';
import type { Account, Favorite, MenuItem, Service, Tab, Update } from '@/types';
import { cn, hostOf } from '@/lib/utils';
import { useFlip } from '@/lib/flip';
import { useOptimiste } from '@/lib/optimiste';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { AccountAvatar } from '@/components/AccountAvatar';
import { ServiceIcon } from '@/components/ServiceIcon';
import { AccountSwitch } from '@/components/AccountSwitch';
import { ModeSwitch } from '@/components/ModeSwitch';
import { UpdateBadge } from '@/components/UpdateBadge';

type Props = {
  services: Service[];
  accounts: Account[];
  activeServiceId: string | null;
  activeAccountId: string | null;
  unreadByAccount: Record<string, number>;
  onFilterAccount: (id: string | null) => void;
  /** Mode rail : icônes seules, pour rendre de la largeur à la page web. */
  collapsed: boolean;
  /** Identifiants des services libérés de la mémoire. */
  sleeping: string[];
  isDark: boolean;
  onSelectService: (id: string) => void;
  onAddService: () => void;
  onEditService: (service: Service) => void;
  onRemoveService: (service: Service) => void;
  onReloadService: (service: Service) => void;
  onSleepService: (service: Service) => void;
  onToggleLinkPolicy: (service: Service) => void;
  /** Déplace `draggedId` à la place de `targetId` dans l'ordre global. */
  onReorder: (draggedId: string, targetId: string) => void;
  onOpenSettings: () => void;
  /** Navigateur neutre : les onglets remplacent les services. */
  browserMode: boolean;
  tabs: Tab[];
  activeTabId: string | null;
  onToggleBrowser: (on: boolean) => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;
  /** Masque les comptes autres que celui affiché, pour un partage d'écran. */
  discreet: boolean;
  onToggleDiscreet: (on: boolean) => void;
  /** Mise à jour disponible, proposée sous les onglets. */
  update: Update | null;
  /** Comptes repliés dans la vue « Tous ». */
  collapsedAccounts: string[];
  onToggleAccountCollapsed: (id: string, collapsed: boolean) => void;
  /** Déplace `draggedId` à la place de `targetId` dans l'ordre des comptes. */
  onReorderAccounts: (draggedId: string, targetId: string) => void;
  favorites: Favorite[];
  onOpenFavorite: (id: string) => void;
  onRemoveFavorite: (id: string) => void;
};

function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'grid min-w-[18px] shrink-0 animate-in zoom-in-50 place-items-center rounded-full bg-red-500 px-1 text-[10px] leading-[18px] font-bold text-white duration-200',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

// Les menus sont natifs : un menu HTML serait masqué par la vue web, qui est
// une vue native peinte au-dessus du shell.
async function popup(items: MenuItem[], actions: Record<string, () => void>) {
  const picked = await window.hublink.popupMenu(items);
  if (picked && actions[picked]) actions[picked]();
}

function SidebarImpl({
  services,
  accounts,
  activeServiceId,
  activeAccountId,
  unreadByAccount,
  onFilterAccount,
  collapsed,
  sleeping,
  isDark,
  onSelectService,
  onAddService,
  onEditService,
  onRemoveService,
  onReloadService,
  onSleepService,
  onToggleLinkPolicy,
  onReorder,
  onOpenSettings,
  browserMode,
  tabs,
  activeTabId,
  onToggleBrowser,
  onSelectTab,
  onCloseTab,
  onAddTab,
  discreet,
  onToggleDiscreet,
  update,
  collapsedAccounts,
  onToggleAccountCollapsed,
  onReorderAccounts,
  favorites,
  onOpenFavorite,
  onRemoveFavorite
}: Props) {
  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const [discret, changerDiscret] = useOptimiste(discreet, onToggleDiscreet);

  // Le compte qu'on est en train de montrer reste lisible, tous les autres sont
  // floutés. Le mode navigateur n'affiche aucun compte : l'interrupteur n'y est
  // donc pas proposé.
  const compteMontre =
    activeAccountId ??
    accountById.get(services.find((x) => x.id === activeServiceId)?.accountId ?? '')?.id ??
    null;

  // La valeur optimiste, pas celle du disque : le floutage doit tomber au clic,
  // pas au retour de l'IPC.
  const masque = React.useCallback(
    (accountId: string) => discret && accountId !== compteMontre,
    [discret, compteMontre]
  );

  // Le flou seul laisserait deviner la longueur d'un nom : on le double d'un
  // léger étirement des lettres.
  const FLOU = 'blur-[5px] tracking-tight select-none';
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  // Le glissé des comptes est tenu à part de celui des services : partager
  // l'état ferait accepter un service comme cible de section, et l'inverse.
  const [dragAccount, setDragAccount] = React.useState<string | null>(null);
  const [dropAccount, setDropAccount] = React.useState<string | null>(null);
  const estPlie = React.useCallback(
    (id: string) => collapsedAccounts.includes(id),
    [collapsedAccounts]
  );

  // L'ordre des sections ET celui des services : réordonner l'un ou l'autre
  // doit faire glisser les lignes plutôt que les téléporter.
  const ordre = `${accounts.map((a) => a.id).join(',')}|${services.map((x) => x.id).join(',')}`;
  const flip = useFlip(ordre);

  // En vue « Tous », les services sont regroupés par compte : l'en-tête dit à
  // qui ils appartiennent, ce qui rend inutile de le répéter sous chacun.
  const groups = React.useMemo(() => {
    if (activeAccountId) return null;
    return accounts
      .map((account) => ({ account, items: services.filter((s) => s.accountId === account.id) }))
      .filter((g) => g.items.length > 0);
  }, [accounts, services, activeAccountId]);

  const serviceMenu = (service: Service, index: number, total: number, siblings: Service[]) =>
    popup(
      [
        { id: 'up', label: 'Monter', enabled: index > 0 },
        { id: 'down', label: 'Descendre', enabled: index < total - 1 },
        { type: 'separator' },
        { id: 'reload', label: 'Recharger' },
        // Grisé s'il dort déjà : rien à libérer.
        { id: 'sleep', label: 'Mettre en sommeil', enabled: !sleeping.includes(service.id) },
        { id: 'external', label: 'Ouvrir cette page dans le navigateur' },
        { id: 'password', label: 'Copier le mot de passe' },
        { type: 'separator' },
        {
          id: 'links',
          label:
            service.openLinks === 'app'
              ? 'Envoyer les liens vers le navigateur'
              : 'Garder les liens dans Hublink'
        },
        { id: 'edit', label: 'Modifier…' },
        { id: 'remove', label: 'Retirer' }
      ],
      {
        // Le voisin VISIBLE, pas celui de la liste complète.
        up: () => index > 0 && onReorder(service.id, siblings[index - 1].id),
        down: () => index < total - 1 && onReorder(service.id, siblings[index + 1].id),
        reload: () => onReloadService(service),
        sleep: () => onSleepService(service),
        external: () => window.hublink.openExternal(service.url),
        password: () => window.hublink.services.copyPassword(service.id),
        links: () => onToggleLinkPolicy(service),
        edit: () => onEditService(service),
        remove: () => onRemoveService(service)
      }
    );

  /**
   * Menu de la section d'un compte. Comme pour les services, « Monter » et
   * « Descendre » visent le voisin VISIBLE : un compte sans service n'apparaît
   * pas, viser son index ne bougerait rien à l'écran.
   */
  const accountMenu = (account: Account, index: number, voisins: Account[]) => {
    const replie = estPlie(account.id);
    return popup(
      [
        { id: 'fold', label: replie ? 'Déplier' : 'Replier' },
        { type: 'separator' },
        { id: 'up', label: 'Monter', enabled: index > 0 },
        { id: 'down', label: 'Descendre', enabled: index < voisins.length - 1 },
        { type: 'separator' },
        { id: 'only', label: `N'afficher que ${account.name}` }
      ],
      {
        fold: () => onToggleAccountCollapsed(account.id, !replie),
        up: () => index > 0 && onReorderAccounts(account.id, voisins[index - 1].id),
        down: () =>
          index < voisins.length - 1 && onReorderAccounts(account.id, voisins[index + 1].id),
        only: () => onFilterAccount(account.id)
      }
    );
  };

  const titleOf = (service: Service, asleep: boolean) => {
    if (masque(service.accountId)) return 'Compte masqué';
    const account = accountById.get(service.accountId);
    const parts = [service.name, account ? account.name : null, hostOf(service.url)];
    if (asleep) parts.push('en veille');
    return parts.filter(Boolean).join(' — ');
  };

  /** Une ligne de service dans le panneau déployé. */
  const ServiceRow = ({
    service,
    index,
    siblings
  }: {
    service: Service;
    index: number;
    siblings: Service[];
  }) => {
    const active = service.id === activeServiceId;
    const asleep = sleeping.includes(service.id);
    const account = accountById.get(service.accountId);
    return (
      <li
        ref={flip(service.id)}
        onDragOver={(e) => {
          if (!dragging || dragging === service.id) return;
          // Réordonner ne change pas de compte : on refuse le dépôt entre groupes.
          const source = services.find((s) => s.id === dragging);
          if (source && source.accountId !== service.accountId) return;
          e.preventDefault();
          setDropTarget(service.id);
        }}
        onDragLeave={() => setDropTarget((prev) => (prev === service.id ? null : prev))}
        onDrop={(e) => {
          e.preventDefault();
          if (dragging && dragging !== service.id) onReorder(dragging, service.id);
          setDragging(null);
          setDropTarget(null);
        }}
        className={cn(
          'rounded-md transition-[box-shadow,opacity] duration-150',
          dropTarget === service.id && 'ring-2 ring-ring/60',
          dragging === service.id && 'opacity-40'
        )}
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', service.id);
            setDragging(service.id);
          }}
          onDragEnd={() => {
            setDragging(null);
            setDropTarget(null);
          }}
          onClick={() => onSelectService(service.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            serviceMenu(service, index, siblings.length, siblings);
          }}
          title={titleOf(service, asleep)}
          aria-current={active}
          className={cn(
            'group/ligne flex w-full cursor-grab items-center gap-2.5 rounded-md py-1.5 pr-2 pl-2 text-left transition-[background-color,color] duration-150 active:cursor-grabbing',
            active
              ? 'bg-shell-active text-shell-foreground'
              : 'text-shell-muted hover:bg-shell-hover hover:text-shell-foreground'
          )}
        >
          {/* Le repère du compte n'existe que sur la ligne active. Au survol
              d'une autre, il s'esquisse dans la couleur du client : on voit à
              qui appartient un service avant même de le sélectionner. */}
          <span
            className={cn(
              'w-0.5 shrink-0 rounded-full transition-[height,opacity] duration-200',
              active ? 'h-5 opacity-100' : 'h-2 opacity-0 group-hover/ligne:h-4 group-hover/ligne:opacity-60'
            )}
            style={{ backgroundColor: account ? account.color : 'transparent' }}
            aria-hidden
          />
          <ServiceIcon service={service} className="size-5" textClassName="text-[9px]" isDark={isDark} />
          <span className={cn('min-w-0 flex-1 truncate text-[13px]', masque(service.accountId) && FLOU)}>
            {service.name}
          </span>
          {asleep && <Moon className="size-3 shrink-0 text-shell-muted" aria-hidden />}
          <Badge count={service.badge} />
        </button>
      </li>
    );
  };

  // --- navigateur neutre ----------------------------------------------------

  /**
   * Le commutateur de mode se place TOUJOURS juste au-dessus des paramètres,
   * la discrétion au-dessus de lui. Le pied de page est ancré en bas et la
   * discrétion disparaît en mode navigateur — aucun compte à masquer : la
   * mettre en dessous ferait descendre le commutateur d'une ligne au moment
   * même où on le regarde basculer.
   */
  const BrowserToggle = () => (
    <ModeSwitch browserMode={browserMode} onToggle={onToggleBrowser} collapsed={collapsed} />
  );

  /** Bascule du mode discrétion, jumelle de celle du mode navigateur. */
  const DiscreetToggle = () =>
    collapsed ? (
      <button
        type="button"
        disabled={browserMode}
        onClick={() => changerDiscret(!discret)}
        title={
          browserMode
            ? "Le navigateur n'affiche aucun compte : rien à masquer"
            : discret
              ? 'Réafficher les autres comptes'
              : 'Masquer les autres comptes'
        }
        aria-label="Mode discrétion"
        aria-pressed={discret}
        className="flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-colors hover:bg-shell-hover disabled:pointer-events-none disabled:opacity-40"
      >
        <EyeOff
          className={cn('size-[18px]', discret ? 'text-shell-foreground' : 'text-shell-muted')}
          aria-hidden
        />
        <Switch checked={discret} className="pointer-events-none scale-75" tabIndex={-1} aria-hidden />
      </button>
    ) : (
      <button
        type="button"
        disabled={browserMode}
        onClick={() => changerDiscret(!discret)}
        aria-pressed={discret}
        title={
          browserMode
            ? "Le navigateur n'affiche aucun compte : il n'y a rien à masquer"
            : "Masque le nom et le logo des autres comptes, le temps d'un partage d'écran"
        }
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-shell-hover disabled:pointer-events-none disabled:opacity-40"
      >
        <EyeOff
          className={cn('size-4 shrink-0', discret ? 'text-shell-foreground' : 'text-shell-muted')}
          aria-hidden
        />
        <span className={cn('flex-1 text-left', discret ? 'text-shell-foreground' : 'text-shell-muted')}>
          Mode discrétion
        </span>
        <Switch checked={discret} className="pointer-events-none" tabIndex={-1} aria-hidden />
      </button>
    );

  if (browserMode) {
    // Onglets et favoris n'ont en commun que leur icône : c'est tout ce que
    // le composant demande.
    const TabIcon = ({ tab, className }: { tab: { favicon: string | null }; className?: string }) =>
      tab.favicon ? (
        <img src={tab.favicon} alt="" className={cn('shrink-0 rounded-sm', className)} />
      ) : (
        <Compass className={cn('shrink-0 text-shell-muted', className)} aria-hidden />
      );

    /** Un onglet endormi se recharge au clic : on le signale plutôt que de
        laisser croire à un rechargement inexpliqué. */
    const label = (tab: Tab) => tab.title || hostOf(tab.url);

    return (
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-shell-border bg-shell',
          collapsed ? 'w-14' : 'w-[248px]'
        )}
      >
        {/* Le mode navigateur n'a pas de carrousel de comptes : la liste
            démarrait 40 px plus haut qu'en Hub et remontait d'un bond au
            changement de mode, pendant qu'elle apparaissait. On occupe la même
            hauteur, avec ce qu'il y a à dire ici : cette session n'appartient
            à aucun client. */}
        {!collapsed && (
          <div className="p-2 pb-0">
            <div className="flex h-8 items-center justify-center gap-1.5 rounded-full bg-shell-hover px-2.5">
              <Compass className="size-3.5 shrink-0 text-shell-muted" aria-hidden />
              <span className="truncate text-[12px] font-medium text-shell-muted">Session neutre</span>
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex flex-1 animate-in flex-col overflow-y-auto fade-in duration-200 ease-out motion-reduce:animate-none',
            collapsed ? 'items-center gap-1 py-2' : 'gap-0.5 p-2'
          )}
        >
          {favorites.length > 0 && (
            <>
              {!collapsed && (
                <p className="px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-shell-muted uppercase">
                  Favoris
                </p>
              )}
              {favorites.map((favori) =>
                collapsed ? (
                  <button
                    key={favori.id}
                    type="button"
                    onClick={() => onOpenFavorite(favori.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onRemoveFavorite(favori.id);
                    }}
                    title={favori.title || hostOf(favori.url)}
                    className="grid size-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-shell-hover"
                  >
                    <TabIcon tab={favori} className="size-[18px]" />
                  </button>
                ) : (
                  <div
                    key={favori.id}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-shell-hover"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenFavorite(favori.id)}
                      title={favori.url}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <TabIcon tab={favori} className="size-4" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {favori.title || hostOf(favori.url)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveFavorite(favori.id)}
                      title="Retirer des favoris"
                      aria-label={`Retirer ${favori.title || hostOf(favori.url)} des favoris`}
                      className="shrink-0 rounded p-0.5 text-shell-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-shell-foreground focus-visible:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )
              )}
              <Separator className={cn('my-1.5 bg-shell-border', collapsed && 'mx-auto w-7')} />
            </>
          )}

          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            const asleep = sleeping.includes(tab.id);
            return collapsed ? (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                onAuxClick={(e) => e.button === 1 && onCloseTab(tab.id)}
                title={asleep ? `${label(tab)} — en veille` : label(tab)}
                aria-current={active}
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
                  active ? 'bg-shell-active' : 'hover:bg-shell-hover'
                )}
              >
                <TabIcon tab={tab} className={cn('size-[18px]', asleep && 'opacity-60')} />
              </button>
            ) : (
              <div
                key={tab.id}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                  active ? 'bg-shell-active' : 'hover:bg-shell-hover'
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  onAuxClick={(e) => e.button === 1 && onCloseTab(tab.id)}
                  title={label(tab)}
                  aria-current={active}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <TabIcon tab={tab} className={cn('size-4', asleep && 'opacity-60')} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{label(tab)}</span>
                  {asleep && <Moon className="size-3 shrink-0 text-shell-muted" aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => onCloseTab(tab.id)}
                  title="Fermer l'onglet"
                  aria-label={`Fermer ${label(tab)}`}
                  className="shrink-0 rounded p-0.5 text-shell-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-shell-foreground focus-visible:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}

          <Button
            variant="ghost"
            size={collapsed ? 'icon-sm' : 'sm'}
            onClick={onAddTab}
            title="Nouvel onglet"
            aria-label="Nouvel onglet"
            className={cn(
              'mt-1 shrink-0 text-shell-muted hover:bg-shell-hover hover:text-shell-foreground',
              !collapsed && 'w-full justify-start gap-2'
            )}
          >
            <Plus /> {!collapsed && 'Nouvel onglet'}
          </Button>
        </div>

        <Separator className={cn('bg-shell-border', collapsed && 'mx-auto w-7')} />
        <footer className={cn('flex flex-col', collapsed ? 'items-center gap-1 py-2' : 'gap-0.5 p-2')}>
          <DiscreetToggle />
          <BrowserToggle />
          {update && <UpdateBadge update={update} collapsed />}
          <Button
            variant="ghost"
            size={collapsed ? 'icon-sm' : 'sm'}
            onClick={onOpenSettings}
            title="Paramètres"
            aria-label="Paramètres"
            className={cn(
              'text-shell-muted hover:bg-shell-hover hover:text-shell-foreground',
              !collapsed && 'w-full justify-start gap-2'
            )}
          >
            <Settings /> {!collapsed && 'Paramètres'}
          </Button>
        </footer>
      </aside>
    );
  }

  // --- rail : icônes seules -------------------------------------------------

  if (collapsed) {
    /** Une icône de service dans le rail. */
    const RailService = ({ service, siblings }: { service: Service; siblings: Service[] }) => {
      const active = service.id === activeServiceId;
      const asleep = sleeping.includes(service.id);
      const account = accountById.get(service.accountId);
      return (
        <button
          type="button"
          ref={flip(service.id)}
          onClick={() => onSelectService(service.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            serviceMenu(service, siblings.indexOf(service), siblings.length, siblings);
          }}
          title={titleOf(service, asleep)}
          aria-label={service.name}
          aria-current={active}
          className={cn(
            'relative grid size-9 shrink-0 place-items-center rounded-lg transition-[background-color,transform] duration-150 hover:scale-105 active:scale-95 motion-reduce:hover:scale-100',
            active ? 'bg-shell-active' : 'hover:bg-shell-hover'
          )}
        >
          <span
            className="absolute top-1/2 -left-2 h-5 w-[3px] -translate-y-1/2 rounded-full"
            style={{ backgroundColor: active && account ? account.color : 'transparent' }}
            aria-hidden
          />
          <ServiceIcon
            service={service}
            className={cn('size-[18px]', !active && 'opacity-80', asleep && 'opacity-60')}
            textClassName="text-[9px]"
            isDark={isDark}
          />
          <Badge count={service.badge} className="absolute -top-0.5 -right-0.5 ring-2 ring-shell" />
        </button>
      );
    };

    return (
      <aside className="flex w-14 shrink-0 flex-col border-r border-shell-border bg-shell">
        <AccountSwitch
          accounts={accounts}
          activeAccountId={activeAccountId}
          unreadByAccount={unreadByAccount}
          collapsed
          onSelect={onFilterAccount}
          discreet={discreet}
          onManage={onOpenSettings}
        />
        <Separator className="mx-auto w-7 bg-shell-border" />

        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
          {/* En vue « Tous », le logo du compte coiffe ses services sans les
              remplacer : on garde l'accès direct à chaque webapp, et le logo
              reste cliquable pour entrer dans le compte. */}
          {groups
            ? groups.map(({ account, items }, index) => (
                <React.Fragment key={account.id}>
                  {index > 0 && <Separator className="my-1 w-7 bg-shell-border" />}
                  <button
                    type="button"
                    onClick={() => onFilterAccount(account.id)}
                    title={
                      masque(account.id)
                        ? 'Compte masqué'
                        : `${account.name} — n'afficher que ce compte`
                    }
                    aria-label={masque(account.id) ? 'Compte masqué' : account.name}
                    className="relative grid size-6 shrink-0 place-items-center rounded-md transition-opacity hover:opacity-100"
                  >
                    <AccountAvatar
                      account={account}
                      className={cn('size-[18px] rounded opacity-70', masque(account.id) && FLOU)}
                      textClassName="text-[8px]"
                    />
                  </button>
                  {items.map((service) => (
                    <RailService key={service.id} service={service} siblings={items} />
                  ))}
                </React.Fragment>
              ))
            : services.map((service) => (
                <RailService key={service.id} service={service} siblings={services} />
              ))}

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onAddService}
            title="Ajouter un service"
            aria-label="Ajouter un service"
            className="mt-1 shrink-0 text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"
          >
            <Plus />
          </Button>
        </div>

        <Separator className="bg-shell-border" />
        <footer className="flex flex-col items-center gap-1 py-2">
          <DiscreetToggle />
          <BrowserToggle />
          {update && <UpdateBadge update={update} collapsed={collapsed} />}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpenSettings}
            title="Paramètres"
            aria-label="Paramètres"
            className="text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"
          >
            <Settings />
          </Button>
        </footer>
      </aside>
    );
  }

  // --- panneau complet ------------------------------------------------------

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-shell-border bg-shell">
      {accounts.length > 0 && (
        <div className="p-2 pb-0">
          <AccountSwitch
            accounts={accounts}
            activeAccountId={activeAccountId}
            unreadByAccount={unreadByAccount}
            collapsed={false}
            onSelect={onFilterAccount}
            discreet={discreet}
          onManage={onOpenSettings}
          />
        </div>
      )}

      {/* La clé change avec le filtre : passer d'un client à « Tous » remonte
          une liste entièrement différente, qui gagne à apparaître plutôt qu'à
          se substituer d'un coup. */}
      <div
        key={activeAccountId ?? 'tous'}
        className="flex-1 animate-in fade-in overflow-y-auto p-2 duration-200 ease-out motion-reduce:animate-none"
      >
        {groups
          ? groups.map(({ account, items }, rang) => {
              const replie = estPlie(account.id);
              const voisins = groups.map((g) => g.account);
              return (
                <section key={account.id} ref={flip(`compte:${account.id}`)} className="mb-3">
                  {/* En-tête glissable : c'est par lui qu'on réordonne les
                      clients. Le chevron plie la section, le nom filtre dessus
                      — deux gestes distincts, donc deux boutons imbriqués dans
                      une ligne plutôt qu'un seul bouton pour tout. */}
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', account.id);
                      setDragAccount(account.id);
                    }}
                    onDragEnd={() => {
                      setDragAccount(null);
                      setDropAccount(null);
                    }}
                    onDragOver={(e) => {
                      if (!dragAccount || dragAccount === account.id) return;
                      e.preventDefault();
                      setDropAccount(account.id);
                    }}
                    onDragLeave={() =>
                      setDropAccount((prev) => (prev === account.id ? null : prev))
                    }
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragAccount && dragAccount !== account.id) {
                        onReorderAccounts(dragAccount, account.id);
                      }
                      setDragAccount(null);
                      setDropAccount(null);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      accountMenu(account, rang, voisins);
                    }}
                    className={cn(
                      'mb-1 flex cursor-grab items-center gap-1 rounded-md pr-2 transition-[background-color,opacity,box-shadow] duration-150 active:cursor-grabbing',
                      'hover:bg-shell-hover',
                      dropAccount === account.id && 'ring-2 ring-ring/60',
                      dragAccount === account.id && 'opacity-40'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleAccountCollapsed(account.id, !replie)}
                      title={replie ? `Déplier ${account.name}` : `Replier ${account.name}`}
                      aria-expanded={!replie}
                      className="grid size-6 shrink-0 place-items-center rounded text-shell-muted transition-colors hover:text-shell-foreground"
                    >
                      <ChevronRight
                        className={cn(
                          'size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none',
                          !replie && 'rotate-90'
                        )}
                        aria-hidden
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onFilterAccount(account.id)}
                      title={
                        masque(account.id) ? 'Afficher ce compte' : `N'afficher que ${account.name}`
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                    >
                      <AccountAvatar
                        account={account}
                        className={cn('size-4 rounded', masque(account.id) && FLOU)}
                        textClassName="text-[7px]"
                      />
                      <h2
                        className={cn(
                          'truncate text-[11px] font-semibold tracking-wide text-shell-muted uppercase',
                          masque(account.id) && FLOU
                        )}
                      >
                        {account.name}
                      </h2>
                    </button>
                    <Badge count={unreadByAccount[account.id] || 0} />
                  </div>
                  {/* `grid-rows` de 1fr à 0fr : la hauteur s'anime sans qu'on
                      ait à la mesurer, ce qu'un max-height fixe imposerait. */}
                  <div
                    className={cn(
                      'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
                      replie ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
                    )}
                  >
                    <ul className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                      {items.map((service, index) => (
                        <ServiceRow
                          key={service.id}
                          service={service}
                          index={index}
                          siblings={items}
                        />
                      ))}
                    </ul>
                  </div>
                </section>
              );
            })
          : (
              <ul className="flex flex-col gap-0.5">
                {services.map((service, index) => (
                  <ServiceRow key={service.id} service={service} index={index} siblings={services} />
                ))}
              </ul>
            )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onAddService}
          className="mt-1 w-full justify-start gap-2 text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"
        >
          <Plus /> Ajouter un service
        </Button>

        {services.length === 0 && (
          <p className="px-2 py-4 text-center text-xs leading-relaxed text-shell-muted/70">
            {activeAccountId ? 'Aucun service pour ce compte.' : "Aucun service pour l'instant."}
          </p>
        )}
      </div>

      <Separator className="bg-shell-border" />
      <footer className="flex flex-col gap-0.5 p-2">
        <DiscreetToggle />
        <BrowserToggle />
        {update && <UpdateBadge update={update} collapsed={false} />}
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSettings}
          className="w-full justify-start gap-2 text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"
        >
          <Settings /> Paramètres
        </Button>
      </footer>
    </aside>
  );
}

// Le panneau se redessine à chaque changement de badge. Il ne dépend que de
// props stables : on évite les rendus inutiles.
export const Sidebar = React.memo(SidebarImpl);

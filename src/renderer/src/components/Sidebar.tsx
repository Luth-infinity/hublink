import * as React from 'react';
import { Compass, EyeOff, Moon, Plus, Settings, Star, X } from 'lucide-react';
import type { Account, Favorite, MenuItem, Service, Tab } from '@/types';
import { cn, hostOf } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { AccountAvatar } from '@/components/AccountAvatar';
import { ServiceIcon } from '@/components/ServiceIcon';
import { AccountSwitch } from '@/components/AccountSwitch';

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
  favorites: Favorite[];
  onOpenFavorite: (id: string) => void;
  onRemoveFavorite: (id: string) => void;
};

function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'grid min-w-[18px] shrink-0 place-items-center rounded-full bg-red-500 px-1 text-[10px] leading-[18px] font-bold text-white',
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
  favorites,
  onOpenFavorite,
  onRemoveFavorite
}: Props) {
  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Le compte qu'on est en train de montrer reste lisible, tous les autres sont
  // floutés. Le mode navigateur n'affiche aucun compte : l'interrupteur n'y est
  // donc pas proposé.
  const compteMontre =
    activeAccountId ??
    accountById.get(services.find((x) => x.id === activeServiceId)?.accountId ?? '')?.id ??
    null;

  const masque = React.useCallback(
    (accountId: string) => discreet && accountId !== compteMontre,
    [discreet, compteMontre]
  );

  // Le flou seul laisserait deviner la longueur d'un nom : on le double d'un
  // léger étirement des lettres.
  const FLOU = 'blur-[5px] tracking-tight select-none';
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);

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
        { id: 'external', label: 'Ouvrir cette page dans le navigateur' },
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
        external: () => window.hublink.openExternal(service.url),
        links: () => onToggleLinkPolicy(service),
        edit: () => onEditService(service),
        remove: () => onRemoveService(service)
      }
    );

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
          'rounded-md',
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
            'flex w-full items-center gap-2.5 rounded-md py-1.5 pr-2 pl-2 text-left transition-colors',
            active
              ? 'bg-shell-active text-shell-foreground'
              : 'text-shell-muted hover:bg-shell-hover hover:text-shell-foreground'
          )}
        >
          <span
            className="h-5 w-0.5 shrink-0 rounded-full"
            style={{ backgroundColor: active && account ? account.color : 'transparent' }}
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

  /** Le commutateur de mode, toujours juste au-dessus des paramètres. */
  const BrowserToggle = () =>
    collapsed ? (
      <button
        type="button"
        onClick={() => onToggleBrowser(!browserMode)}
        title={browserMode ? 'Revenir aux comptes' : 'Passer en mode navigateur'}
        aria-label="Mode navigateur"
        aria-pressed={browserMode}
        className="flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-colors hover:bg-shell-hover"
      >
        <Compass
          className={cn('size-[18px]', browserMode ? 'text-shell-foreground' : 'text-shell-muted')}
          aria-hidden
        />
        {/* Le commutateur reste visible en rail : sans lui, l'icône seule ne
            dirait pas qu'il s'agit d'un mode qu'on active. */}
        <Switch checked={browserMode} className="pointer-events-none scale-75" tabIndex={-1} aria-hidden />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => onToggleBrowser(!browserMode)}
        aria-pressed={browserMode}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-shell-hover"
      >
        <Compass
          className={cn('size-4 shrink-0', browserMode ? 'text-shell-foreground' : 'text-shell-muted')}
          aria-hidden
        />
        <span className={cn('flex-1 text-left', browserMode ? 'text-shell-foreground' : 'text-shell-muted')}>
          Mode navigateur
        </span>
        <Switch checked={browserMode} className="pointer-events-none" tabIndex={-1} aria-hidden />
      </button>
    );

  /** Bascule du mode discrétion, jumelle de celle du mode navigateur. */
  const DiscreetToggle = () =>
    collapsed ? (
      <button
        type="button"
        onClick={() => onToggleDiscreet(!discreet)}
        title={discreet ? 'Réafficher les autres comptes' : 'Masquer les autres comptes'}
        aria-label="Mode discrétion"
        aria-pressed={discreet}
        className="flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-colors hover:bg-shell-hover"
      >
        <EyeOff
          className={cn('size-[18px]', discreet ? 'text-shell-foreground' : 'text-shell-muted')}
          aria-hidden
        />
        <Switch checked={discreet} className="pointer-events-none scale-75" tabIndex={-1} aria-hidden />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => onToggleDiscreet(!discreet)}
        aria-pressed={discreet}
        title="Masque le nom et le logo des autres comptes, le temps d'un partage d'écran"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-shell-hover"
      >
        <EyeOff
          className={cn('size-4 shrink-0', discreet ? 'text-shell-foreground' : 'text-shell-muted')}
          aria-hidden
        />
        <span className={cn('flex-1 text-left', discreet ? 'text-shell-foreground' : 'text-shell-muted')}>
          Mode discrétion
        </span>
        <Switch checked={discreet} className="pointer-events-none" tabIndex={-1} aria-hidden />
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
        <div
          className={cn(
            'flex flex-1 flex-col overflow-y-auto',
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
          <BrowserToggle />
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
          onClick={() => onSelectService(service.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            serviceMenu(service, siblings.indexOf(service), siblings.length, siblings);
          }}
          title={titleOf(service, asleep)}
          aria-label={service.name}
          aria-current={active}
          className={cn(
            'relative grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
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
          <BrowserToggle />
          <DiscreetToggle />
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

      <div className="flex-1 overflow-y-auto p-2">
        {groups
          ? groups.map(({ account, items }) => (
              <section key={account.id} className="mb-3">
                <button
                  type="button"
                  onClick={() => onFilterAccount(account.id)}
                  title={masque(account.id) ? 'Afficher ce compte' : `N'afficher que ${account.name}`}
                  className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-shell-hover"
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
                  <Badge count={unreadByAccount[account.id] || 0} className="ml-auto" />
                </button>
                <ul className="flex flex-col gap-0.5">
                  {items.map((service, index) => (
                    <ServiceRow key={service.id} service={service} index={index} siblings={items} />
                  ))}
                </ul>
              </section>
            ))
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
        <BrowserToggle />
        <DiscreetToggle />
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

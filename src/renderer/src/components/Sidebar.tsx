import * as React from 'react';
import { Moon, Plus, Settings } from 'lucide-react';
import type { Account, MenuItem, Service } from '@/types';
import { cn, hostOf } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
  onSelectService: (id: string) => void;
  onAddService: () => void;
  onEditService: (service: Service) => void;
  onRemoveService: (service: Service) => void;
  onReloadService: (service: Service) => void;
  onToggleLinkPolicy: (service: Service) => void;
  /** Déplace `draggedId` à la place de `targetId` dans l'ordre global. */
  onReorder: (draggedId: string, targetId: string) => void;
  onOpenSettings: () => void;
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
  onSelectService,
  onAddService,
  onEditService,
  onRemoveService,
  onReloadService,
  onToggleLinkPolicy,
  onReorder,
  onOpenSettings
}: Props) {
  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);

  // L'ordre se règle aussi au clavier / à la souris sans glisser : le
  // glisser-déposer n'est pas praticable dans le rail réduit.
  const serviceMenu = (service: Service, index: number, total: number) =>
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
        // Le voisin VISIBLE, pas le voisin dans la liste complète : filtré sur
        // un compte, viser l'index global ne bougerait rien à l'écran.
        up: () => index > 0 && onReorder(service.id, services[index - 1].id),
        down: () => index < total - 1 && onReorder(service.id, services[index + 1].id),
        reload: () => onReloadService(service),
        external: () => window.hublink.openExternal(service.url),
        links: () => onToggleLinkPolicy(service),
        edit: () => onEditService(service),
        remove: () => onRemoveService(service)
      }
    );


  const titleOf = (service: Service, asleep: boolean) => {
    const account = accountById.get(service.accountId);
    const parts = [
      service.name,
      account && !activeAccountId ? `compte ${account.name}` : null,
      hostOf(service.url)
    ];
    if (asleep) parts.push('en veille');
    return parts.filter(Boolean).join(' — ');
  };

  // --- rail : icônes seules -------------------------------------------------

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col border-r border-shell-border bg-shell">
        <AccountSwitch
          accounts={accounts}
          activeAccountId={activeAccountId}
          unreadByAccount={unreadByAccount}
          collapsed
          onSelect={onFilterAccount}
          onManage={onOpenSettings}
        />
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto pb-2">
          {services.map((service, index) => {
            const active = service.id === activeServiceId;
            const asleep = sleeping.includes(service.id);
            const account = accountById.get(service.accountId);
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => onSelectService(service.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  serviceMenu(service, index, services.length);
                }}
                title={titleOf(service, asleep)}
                aria-label={service.name}
                aria-current={active}
                className={cn(
                  'relative grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
                  active ? 'bg-shell-active' : 'hover:bg-shell-hover'
                )}
              >
                {/* Repère de compte : reste lisible même réduit. */}
                <span
                  className="absolute top-1/2 -left-2 h-5 w-[3px] -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: active && account ? account.color : 'transparent' }}
                  aria-hidden
                />
                <ServiceIcon
                  service={service}
                  className={cn('size-[18px]', !active && 'opacity-80', asleep && 'opacity-60')}
                  textClassName="text-[9px]"
                />
                <Badge count={service.badge} className="absolute -top-0.5 -right-0.5 ring-2 ring-shell" />
              </button>
            );
          })}

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
        <footer className="flex flex-col items-center py-2">
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
            onManage={onOpenSettings}
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {services.map((service, index) => {
            const active = service.id === activeServiceId;
            const asleep = sleeping.includes(service.id);
            const account = accountById.get(service.accountId);
            return (
              <li
                key={service.id}
                onDragOver={(e) => {
                  if (!dragging || dragging === service.id) return;
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
                    // Firefox et Chromium exigent une donnée pour amorcer le glisser.
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
                    serviceMenu(service, index, services.length);
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
                    className="h-6 w-0.5 shrink-0 rounded-full"
                    style={{ backgroundColor: active && account ? account.color : 'transparent' }}
                    aria-hidden
                  />
                  <ServiceIcon service={service} className="size-5" textClassName="text-[9px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-tight">{service.name}</span>
                    {/* Inutile de répéter le compte quand on est déjà dedans. */}
                    {account && !activeAccountId && (
                      <span className="flex items-center gap-1 text-[10px] leading-tight text-shell-muted">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: account.color }}
                          aria-hidden
                        />
                        <span className="truncate">{account.name}</span>
                      </span>
                    )}
                  </span>
                  {asleep && <Moon className="size-3 shrink-0 text-shell-muted" aria-hidden />}
                  <Badge count={service.badge} />
                </button>
              </li>
            );
          })}
        </ul>

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
      <footer className="p-2">
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

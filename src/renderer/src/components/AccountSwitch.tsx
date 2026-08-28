import * as React from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import type { Account, MenuItem } from '@/types';
import { Button } from '@/components/ui/button';
import { AccountAvatar } from '@/components/AccountAvatar';

type Props = {
  accounts: Account[];
  activeAccountId: string | null;
  /** Non-lus par compte, pour ne rien manquer d'un compte masqué. */
  unreadByAccount: Record<string, number>;
  collapsed: boolean;
  /** Mode discrétion : les comptes autres que l'affiché sont floutés. */
  discreet: boolean;
  onSelect: (id: string | null) => void;
  onManage: () => void;
};

/**
 * Carrousel de comptes : les flèches font défiler, le libellé central ouvre la
 * liste complète. Une barre d'onglets déborderait dès quelques comptes.
 *
 * La liste est un menu natif : un menu HTML serait masqué par la vue web, qui
 * est une vue native peinte au-dessus du shell.
 */
export function AccountSwitch({
  accounts,
  activeAccountId,
  unreadByAccount,
  collapsed,
  discreet,
  onSelect,
  onManage
}: Props) {
  if (accounts.length === 0) return null;

  // « Tous » fait partie du cycle, en première position.
  const cycle = React.useMemo<(string | null)[]>(() => [null, ...accounts.map((a) => a.id)], [accounts]);
  const index = cycle.indexOf(activeAccountId);
  const active = accounts.find((a) => a.id === activeAccountId) ?? null;

  const step = (delta: number) => onSelect(cycle[(index + delta + cycle.length) % cycle.length]);

  const hiddenUnread = accounts.reduce(
    (sum, account) => (account.id === activeAccountId ? sum : sum + (unreadByAccount[account.id] || 0)),
    0
  );

  const openMenu = async () => {
    const items: MenuItem[] = [
      { id: '__all', label: activeAccountId === null ? '✓  Tous les comptes' : 'Tous les comptes' },
      { type: 'separator' },
      ...accounts.map((account, i) => {
        const unread = unreadByAccount[account.id] || 0;
        const mark = account.id === activeAccountId ? '✓  ' : '';
        // Un menu natif ne se floute pas : en discrétion, les autres comptes
        // y perdent leur nom plutôt que de s'afficher en clair.
        const nom =
          discreet && account.id !== activeAccountId ? `Compte ${i + 1}` : account.name;
        return { id: account.id, label: unread ? `${mark}${nom}  (${unread})` : `${mark}${nom}` };
      }),
      { type: 'separator' },
      { id: '__manage', label: 'Gérer les comptes…' }
    ];
    const picked = await window.hublink.popupMenu(items);
    if (picked === '__manage') onManage();
    else if (picked === '__all') onSelect(null);
    else if (picked) onSelect(picked);
  };

  if (collapsed) {
    return (
      <div className="flex justify-center pt-1 pb-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={openMenu}
          title={active ? `Compte : ${active.name}` : 'Tous les comptes'}
          aria-label="Changer de compte"
          className="relative text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"
        >
          {active ? (
            <AccountAvatar account={active} className="size-[18px] rounded" textClassName="text-[8px]" />
          ) : (
            <Users />
          )}
          {hiddenUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-red-500 ring-2 ring-shell" />
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => step(-1)}
        aria-label="Compte précédent"
        title="Compte précédent"
        className="shrink-0 text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"
      >
        <ChevronLeft />
      </Button>

      <button
        type="button"
        onClick={openMenu}
        aria-haspopup="menu"
        title="Choisir un compte"
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-shell-hover px-2.5 py-1 transition-colors hover:bg-shell-active"
      >
        {active && (
          <AccountAvatar account={active} className="size-4 rounded" textClassName="text-[7px]" />
        )}
        <span className="truncate text-[12px] font-medium text-shell-foreground">
          {active ? active.name : 'Tous'}
        </span>
        {hiddenUnread > 0 && (
          <span
            className="shrink-0 rounded-full bg-red-500 px-1.5 text-[9px] leading-[15px] font-bold text-white"
            title={`${hiddenUnread} non-lus dans les autres comptes`}
          >
            {hiddenUnread > 99 ? '99+' : hiddenUnread}
          </span>
        )}
      </button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => step(1)}
        aria-label="Compte suivant"
        title="Compte suivant"
        className="shrink-0 text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

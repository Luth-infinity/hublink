import * as React from 'react';
import { ChevronLeft, ChevronRight, Layers2, Users } from 'lucide-react';
import type { Account, AccountView } from '@/types';
import { Button } from '@/components/ui/button';
import { AccountAvatar } from '@/components/AccountAvatar';
import { memeSelection, normaliser, vueCourante } from '@/lib/selection';

type Props = {
  accounts: Account[];
  /** Comptes affichés : vide = tous. */
  activeAccountIds: string[];
  views: AccountView[];
  /** Non-lus par compte, pour ne rien manquer d'un compte masqué. */
  unreadByAccount: Record<string, number>;
  collapsed: boolean;
  /** Mode discrétion : les comptes autres que l'affiché sont floutés. */
  discreet: boolean;
  onSelect: (ids: string[]) => void;
  onManage: () => void;
};

/**
 * Carrousel de comptes : les flèches font défiler, le libellé central ouvre la
 * liste complète. Une barre d'onglets déborderait dès quelques comptes.
 */
export function AccountSwitch({
  accounts,
  activeAccountIds,
  views,
  unreadByAccount,
  collapsed,
  discreet,
  onSelect
}: Props) {
  // Le cycle suit l'ordre du panneau : « Tous », les vues enregistrées, puis
  // chaque compte. Une vue qui ne recouvre qu'un compte, ou tous, y ferait
  // doublon.
  const cycle = React.useMemo(() => {
    const etapes: string[][] = [[]];
    for (const vue of views) {
      const ids = normaliser(accounts, vue.accountIds);
      if (ids.length >= 2 && !etapes.some((e) => memeSelection(e, ids))) etapes.push(ids);
    }
    for (const account of accounts) etapes.push([account.id]);
    return etapes;
  }, [accounts, views]);

  // Le sélecteur passait par un menu natif, faute de pouvoir dessiner au-dessus
  // de la page. Le calque lève cette contrainte : on ouvre désormais un panneau
  // aux couleurs de l'application, identique sur les deux systèmes.
  const bouton = React.useRef<HTMLButtonElement>(null);
  const openMenu = () => {
    const r = bouton.current?.getBoundingClientRect();
    window.hublink.panels.toggle(
      'accounts',
      r ? { x: r.x, y: r.y, width: r.width, height: r.height } : { x: 0, y: 0, width: 0, height: 0 }
    );
  };

  if (accounts.length === 0) return null;

  const index = cycle.findIndex((etape) => memeSelection(etape, activeAccountIds));
  // Une sélection cochée à la main n'a pas de place dans le cycle : les flèches
  // repartent de « Tous ».
  const step = (delta: number) => {
    const depart = Math.max(0, index);
    onSelect(cycle[(depart + delta + cycle.length) % cycle.length]);
  };

  const seul =
    activeAccountIds.length === 1 ? (accounts.find((a) => a.id === activeAccountIds[0]) ?? null) : null;
  const plusieurs = activeAccountIds.length > 1;
  const vue = vueCourante(accounts, views, activeAccountIds);
  // En mode discrétion, le nom d'une vue dirait quels clients elle regroupe.
  const libelle = seul
    ? seul.name
    : plusieurs
      ? vue && !discreet
        ? vue.name
        : `${activeAccountIds.length} comptes`
      : 'Tous';

  const hiddenUnread = accounts.reduce(
    (sum, account) =>
      activeAccountIds.includes(account.id) ? sum : sum + (unreadByAccount[account.id] || 0),
    0
  );

  if (collapsed) {
    return (
      <div className="flex justify-center pt-1 pb-2">
        <Button
          ref={bouton}
          variant="ghost"
          size="icon-sm"
          onClick={openMenu}
          title={seul ? `Compte : ${seul.name}` : plusieurs ? libelle : 'Tous les comptes'}
          aria-label="Changer de compte"
          className="relative text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"
        >
          {seul ? (
            <AccountAvatar account={seul} className="size-[18px] rounded" textClassName="text-[8px]" />
          ) : plusieurs ? (
            <Layers2 />
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
        ref={bouton}
        type="button"
        onClick={openMenu}
        aria-haspopup="menu"
        title="Choisir les comptes affichés"
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-shell-hover px-2.5 py-1 transition-colors hover:bg-shell-active"
      >
        {seul && <AccountAvatar account={seul} className="size-4 rounded" textClassName="text-[7px]" />}
        {plusieurs && <Layers2 className="size-3.5 shrink-0 text-shell-muted" aria-hidden />}
        <span className="truncate text-[12px] font-medium text-shell-foreground">{libelle}</span>
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

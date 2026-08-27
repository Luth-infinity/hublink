import { cn, initials } from '@/lib/utils';
import type { Account } from '@/types';

type Props = {
  account: Pick<Account, 'name' | 'color' | 'avatar'>;
  className?: string;
  /** Taille du texte de repli quand il n'y a pas de logo. */
  textClassName?: string;
};

/** Logo du compte s'il en a un, sinon ses initiales sur sa couleur. */
export function AccountAvatar({ account, className, textClassName }: Props) {
  if (account.avatar) {
    return (
      <img
        src={account.avatar}
        alt=""
        className={cn('shrink-0 rounded-md object-contain ring-1 ring-black/10 dark:ring-white/15', className)}
      />
    );
  }
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-md font-semibold text-white ring-1 ring-black/10 dark:ring-white/15',
        textClassName,
        className
      )}
      style={{ backgroundColor: account.color }}
      aria-hidden
    >
      {initials(account.name || '?')}
    </span>
  );
}

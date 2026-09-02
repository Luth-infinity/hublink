import * as React from 'react';
import { ArrowDownToLine } from 'lucide-react';
import type { Update } from '@/types';
import { cn } from '@/lib/utils';

/**
 * La mise à jour se propose sous les onglets, en pleine largeur.
 *
 * Elle vivait dans la barre du haut, coincée entre les icônes : un bandeau
 * qu'on ne remarquait pas. En bas du panneau, elle occupe toute la largeur et
 * se lit comme ce qu'elle est — une action à faire, pas un état.
 */
export function UpdateBadge({ update, collapsed }: { update: Update; collapsed: boolean }) {
  const api = window.hublink;
  const [auto, setAuto] = React.useState(false);
  const [percent, setPercent] = React.useState<number | null>(null);
  const [pret, setPret] = React.useState(false);

  React.useEffect(() => {
    api.updater.canInstall().then(setAuto);
  }, [api]);
  React.useEffect(() => api.updater.onProgress(({ percent: p }) => setPercent(p)), [api]);

  // Dans la barre du haut, le numéro seul suffisait — l'icône disait le reste.
  // En pleine largeur, il faut nommer l'action.
  const libelle = pret
    ? 'Redémarrer pour installer'
    : percent !== null
      ? `${percent} %`
      : `Mettre à jour · ${update.version}`;

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
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-md bg-emerald-500/15 font-medium text-emerald-700 transition-all duration-150 hover:bg-emerald-500/25 active:scale-[0.97] motion-reduce:active:scale-100 dark:text-emerald-300',
        collapsed ? 'size-9 shrink-0' : 'w-full px-2.5 py-1.5 text-[12px]'
      )}
    >
      <ArrowDownToLine className={cn('size-3.5 shrink-0', percent !== null && !pret && 'animate-pulse')} />
      {!collapsed && libelle}
    </button>
  );
}

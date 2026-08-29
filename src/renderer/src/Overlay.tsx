import * as React from 'react';
import { Toaster, toast } from 'sonner';
import type { AppState, Download } from '@/types';
import { useSyncedTheme } from '@/lib/theme';
import { AccountsPanel, DownloadsPanel, HistoryPanel } from '@/components/panels';

const api = window.hublink;

type Ancre = { x: number; y: number; width: number; height: number };
type Panneau = { kind: 'downloads' | 'history' | 'accounts'; anchor: Ancre } | null;

/**
 * Calque de l'application : messages et panneaux déroulants.
 *
 * Il vit dans une fenêtre à part, transparente et posée au-dessus de la
 * principale. C'est le seul moyen de dessiner par-dessus la page : une
 * WebContentsView est une vue NATIVE, elle se peint au-dessus du HTML du shell
 * quoi qu'on fasse. Tout ce qui devait survoler la page se retrouvait donc
 * caché derrière — ou forçait à masquer la page pour se montrer.
 *
 * La fenêtre laisse passer les clics. Le processus principal la rend réceptive
 * quand un panneau est ouvert ; pour un simple message, on ne bascule que
 * lorsque le pointeur le survole vraiment.
 */
export default function Overlay() {
  useSyncedTheme();
  const receptif = React.useRef(false);

  const [panneau, setPanneau] = React.useState<Panneau>(null);
  const [downloads, setDownloads] = React.useState<Download[]>([]);
  // L'état complet : les panneaux en lisent des parts différentes.
  const [etat, setEtat] = React.useState<AppState | null>(null);

  React.useEffect(() => {
    api.getState().then(setEtat);
    return api.onStateChanged(setEtat);
  }, []);

  const nonLusParCompte = React.useMemo(() => {
    const totaux: Record<string, number> = {};
    for (const service of etat?.services ?? []) {
      totaux[service.accountId] = (totaux[service.accountId] || 0) + (service.badge || 0);
    }
    return totaux;
  }, [etat]);

  React.useEffect(() => api.downloadsList.onList(setDownloads), []);
  React.useEffect(() => api.panels.onState(setPanneau), []);

  React.useEffect(
    () =>
      api.onToast(({ variant, message, action }) => {
        const options = action
          ? { action: { label: action.label, onClick: () => api.runToastAction(action) } }
          : undefined;
        if (variant === 'error') toast.error(message, options);
        else toast.success(message, options);
      }),
    []
  );

  // Le pointeur ne nous est signalé que parce que la fenêtre transmet ses
  // mouvements. Sans panneau ouvert, on ne devient réceptif que sur un message.
  React.useEffect(() => {
    const bouge = (e: MouseEvent) => {
      if (panneau) return;
      const sur = Boolean(
        document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-sonner-toast]')
      );
      if (sur === receptif.current) return;
      receptif.current = sur;
      api.overlay.setInteractive(sur);
    };
    window.addEventListener('mousemove', bouge);
    return () => window.removeEventListener('mousemove', bouge);
  }, [panneau]);

  // Échap referme, comme n'importe quel menu.
  React.useEffect(() => {
    if (!panneau) return;
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && api.panels.close();
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [panneau]);

  return (
    <div className="pointer-events-none h-full w-full">
      {panneau && (
        <>
          {/* Le clic à côté referme. Il ne traverse pas jusqu'à la page : c'est
              le comportement attendu d'un menu, on ne veut pas cliquer dedans
              par accident en le fermant. */}
          <div className="pointer-events-auto fixed inset-0" onClick={() => api.panels.close()} />
          <div
            className="animate-in fade-in slide-in-from-top-1 pointer-events-auto fixed duration-150"
            style={
              // Les boutons de la barre sont à droite, celui des comptes en
              // haut du panneau latéral : on aligne du côté le plus proche.
              panneau.kind === 'accounts'
                ? { top: panneau.anchor.y + panneau.anchor.height + 6, left: Math.max(6, panneau.anchor.x) }
                : {
                    top: panneau.anchor.y + panneau.anchor.height + 6,
                    right: Math.max(6, window.innerWidth - (panneau.anchor.x + panneau.anchor.width))
                  }
            }
          >
            {panneau.kind === 'downloads' && <DownloadsPanel downloads={downloads} />}
            {panneau.kind === 'history' && <HistoryPanel history={etat?.history ?? []} />}
            {panneau.kind === 'accounts' && etat && (
              <AccountsPanel
                accounts={etat.accounts}
                activeAccountId={etat.activeAccountId}
                unreadByAccount={nonLusParCompte}
                discreet={etat.discreet}
              />
            )}
          </div>
        </>
      )}

      <Toaster theme="system" position="bottom-right" richColors closeButton />
    </div>
  );
}

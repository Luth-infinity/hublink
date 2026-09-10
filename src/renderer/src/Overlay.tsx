import * as React from 'react';
import { cn } from '@/lib/utils';
import { Toaster, toast } from 'sonner';
import type { AppState, Download, EtatSuggestions } from '@/types';
import { useSyncedTheme } from '@/lib/theme';
import { AccountsPanel, DownloadsPanel, HistoryPanel } from '@/components/panels';
import { MenuFlottant, type DemandeMenu } from '@/components/MenuFlottant';
import { Suggestions } from '@/components/Suggestions';

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
/**
 * Le pointeur est-il sur un message ?
 *
 * Mesuré sur les rectangles, et non par `elementFromPoint` : le conteneur des
 * messages laisse passer les clics, et un élément qui les laisse passer est
 * invisible à ce test de position. La question restait donc sans réponse, le
 * calque ne devenait jamais réceptif, et le bouton d'un message — « Ouvrir le
 * dossier » après un téléchargement — ne pouvait pas être cliqué.
 */
function surUnMessage(x: number, y: number) {
  return Array.from(document.querySelectorAll('[data-sonner-toast], [data-suggestions]')).some((noeud) => {
    const r = noeud.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}

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

  const [menu, setMenu] = React.useState<DemandeMenu | null>(null);
  const choisir = React.useCallback(
    (picked: string | null) => {
      setMenu((courant) => {
        if (courant) api.menu.pick(courant.id, picked);
        return null;
      });
    },
    []
  );

  React.useEffect(() => api.downloadsList.onList(setDownloads), []);
  // La liste de la barre d'adresse. Elle n'est pas un panneau : le champ garde
  // le clavier et reste cliquable, le calque ne reçoit la souris que sur elle.
  const [suggestions, setSuggestions] = React.useState<EtatSuggestions | null>(null);
  React.useEffect(() => api.suggestions.onEtat(setSuggestions), []);
  React.useEffect(() => api.panels.onState(setPanneau), []);
  React.useEffect(() => api.menu.onOpen(setMenu), []);

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

  const dernierPoint = React.useRef({ x: -1, y: -1 });

  // Le pointeur ne nous est signalé que parce que la fenêtre transmet ses
  // mouvements. Sans panneau ouvert, on ne devient réceptif que sur un message.
  React.useEffect(() => {
    const evaluer = () => {
      if (panneau || menu) return;
      const { x, y } = dernierPoint.current;
      const sur = x >= 0 && surUnMessage(x, y);
      if (sur === receptif.current) return;
      receptif.current = sur;
      api.overlay.setInteractive(sur);
    };
    const bouge = (e: MouseEvent) => {
      dernierPoint.current = { x: e.clientX, y: e.clientY };
      evaluer();
    };
    window.addEventListener('mousemove', bouge);
    // Un message s'efface de lui-même au bout de quelques secondes. S'il
    // disparaît sous un pointeur immobile, aucun mouvement ne vient nous
    // rendre transparents à nouveau : le calque avalait alors le clic suivant,
    // et la page paraissait ne plus répondre à la souris alors que le clavier,
    // lui, marchait toujours.
    const observateur = new MutationObserver(evaluer);
    observateur.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('mousemove', bouge);
      observateur.disconnect();
    };
  }, [panneau, menu]);

  // Échap referme, comme n'importe quel menu.
  React.useEffect(() => {
    if (!panneau) return;
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && api.panels.close();
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [panneau]);

  return (
    <div className="pointer-events-none h-full w-full">
      {menu && <MenuFlottant demande={menu} onChoisir={choisir} />}
      {panneau && (
        <>
          {/* Le clic à côté referme. Il ne traverse pas jusqu'à la page : c'est
              le comportement attendu d'un menu, on ne veut pas cliquer dedans
              par accident en le fermant. */}
          <div className="pointer-events-auto fixed inset-0" onClick={() => api.panels.close()} />
          <div
            /* Le panneau se déplie depuis le bouton qui l'ouvre : il grandit
               et se dénoue du flou, au lieu de se poser tout formé à côté de
               son ancre. L'origine suit le côté d'accrochage, faute de quoi il
               semblerait sortir du mauvais bord. */
            className={cn(
              'ouvre-panneau pointer-events-auto fixed',
              panneau.kind === 'accounts' ? 'origin-top-left' : 'origin-top-right'
            )}
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

      {suggestions && <Suggestions etat={suggestions} />}

      <Toaster
        theme="system"
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ className: 'pointer-events-auto' }}
      />
    </div>
  );
}

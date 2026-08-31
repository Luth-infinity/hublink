import * as React from 'react';
import { cn } from '@/lib/utils';
import { ListeSurlignee } from '@/components/ListeSurlignee';
import type { MenuItem } from '@/types';

export type DemandeMenu = { id: number; items: MenuItem[]; ancre: { x: number; y: number } };

/**
 * Le menu contextuel, en HTML.
 *
 * Il était natif tant qu'on ne savait pas dessiner au-dessus de la vue web.
 * Rendu dans la fenêtre de calque, il n'a plus ce problème — et gagne au
 * passage l'animation et le surlignage glissant du reste de l'interface.
 *
 * Ce qu'un menu natif faisait seul et qu'il faut refaire ici : ne pas sortir
 * de l'écran. Un menu natif déborde de la fenêtre, pas celui-ci — il se replie
 * donc vers le haut ou vers la gauche quand la place manque.
 */
export function MenuFlottant({
  demande,
  onChoisir
}: {
  demande: DemandeMenu;
  onChoisir: (picked: string | null) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState<{ left: number; top: number } | null>(null);

  // On mesure après le premier rendu : la hauteur dépend du nombre d'items, et
  // on ne peut pas décider de se replier avant de la connaître.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const marge = 8;
    const { x, y } = demande.ancre;
    const left = x + width + marge > window.innerWidth ? Math.max(marge, x - width) : x;
    const top = y + height + marge > window.innerHeight ? Math.max(marge, y - height) : y;
    setPlace({ left, top });
  }, [demande]);

  React.useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onChoisir(null);
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onChoisir]);

  return (
    <>
      {/* Le clic à côté referme sans rien choisir, comme un menu système. */}
      <div className="pointer-events-auto fixed inset-0" onClick={() => onChoisir(null)} />
      <div
        ref={ref}
        role="menu"
        // Invisible tant qu'on ne sait pas où le poser : sans cela, il
        // apparaîtrait une frame à la position brute avant de se replier.
        style={place ? { left: place.left, top: place.top } : { left: -9999, top: -9999 }}
        className={cn(
          'ouvre-panneau pointer-events-auto fixed z-50 min-w-[200px] origin-top-left overflow-hidden rounded-lg border border-shell-border bg-shell py-1 shadow-lg',
          !place && 'invisible'
        )}
      >
        <ListeSurlignee>
          {demande.items.map((item, i) =>
            item.type === 'separator' ? (
              <div key={`sep-${i}`} className="my-1 h-px bg-shell-border" />
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.enabled === false}
                data-surlignable
                onClick={() => onChoisir(item.id ?? null)}
                className="relative z-10 flex w-full items-center px-3 py-1.5 text-left text-[13px] text-shell-foreground disabled:pointer-events-none disabled:text-shell-muted disabled:opacity-50"
              >
                {item.label}
              </button>
            )
          )}
        </ListeSurlignee>
      </div>
    </>
  );
}

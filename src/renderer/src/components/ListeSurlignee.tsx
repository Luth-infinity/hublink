import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Une liste dont le survol est marqué par une pastille unique, qui glisse d'un
 * item à l'autre au lieu de s'allumer sous chacun.
 *
 * L'effet ne s'obtient pas avec `hover:` : il faudrait autant de fonds que
 * d'items, et deux fonds ne peuvent pas se transformer l'un en l'autre. Un seul
 * élément positionné, qu'on déplace, le peut.
 *
 * On écoute `mouseover` et non `mousemove` : le premier ne se déclenche qu'au
 * changement d'élément survolé, le second à chaque pixel parcouru — pour un
 * résultat identique ici, et un coût sans commune mesure.
 */
export function ListeSurlignee({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const conteneur = React.useRef<HTMLDivElement>(null);
  const [zone, setZone] = React.useState<{ top: number; height: number } | null>(null);

  const suivre = (e: React.MouseEvent) => {
    const cible = (e.target as HTMLElement).closest('[data-surlignable]');
    if (!cible || !conteneur.current) return setZone(null);
    // Un item désactivé (un téléchargement fini, par exemple) ne se survole pas.
    if (cible.hasAttribute('disabled')) return setZone(null);
    const base = conteneur.current.getBoundingClientRect();
    const r = cible.getBoundingClientRect();
    setZone({ top: r.top - base.top + conteneur.current.scrollTop, height: r.height });
  };

  return (
    <div
      ref={conteneur}
      className={cn('relative', className)}
      onMouseOver={suivre}
      onMouseLeave={() => setZone(null)}
    >
      {/* Sans `zone`, la pastille reste à sa dernière place en s'effaçant :
          elle ne doit pas revenir en haut de liste en sortant. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-1 z-0 rounded-md bg-shell-hover transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none',
          zone ? 'opacity-100' : 'opacity-0'
        )}
        style={zone ? { top: zone.top, height: zone.height } : undefined}
      />
      {children}
    </div>
  );
}

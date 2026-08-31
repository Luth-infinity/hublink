import * as React from 'react';
import { Compass, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  browserMode: boolean;
  onToggle: (on: boolean) => void;
  /** Rail d'icônes : deux boutons empilés, sans libellé ni pastille glissante. */
  collapsed: boolean;
};

const MODES = [
  { id: 'hub', label: 'Hub', Icon: LayoutGrid, titre: 'Revenir aux services' },
  { id: 'web', label: 'Navigateur', Icon: Compass, titre: 'Passer au navigateur' }
] as const;

/**
 * Hub ou navigateur : deux états d'égale importance, pas une option qu'on
 * active. Un interrupteur disait « mode navigateur : oui / non » là où le
 * choix est symétrique — d'où deux segments nommés et une pastille qui glisse
 * de l'un à l'autre.
 *
 * La pastille est un seul élément positionné en pourcentage plutôt qu'un fond
 * par segment : c'est ce qui la fait voyager au lieu de s'allumer et s'éteindre.
 */
export function ModeSwitch({ browserMode, onToggle, collapsed }: Props) {
  // Basculer passe par le processus principal, qui doit charger la vue avant
  // de renvoyer l'état : la pastille restait immobile tout ce temps, puis
  // sautait à l'arrivée. On la déplace donc au clic, et l'état confirme.
  const [vise, setVise] = React.useState(browserMode);
  React.useEffect(() => setVise(browserMode), [browserMode]);
  const actif = vise ? 1 : 0;

  const choisir = (versNavigateur: boolean) => {
    setVise(versNavigateur);
    onToggle(versNavigateur);
  };

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        {MODES.map(({ id, label, Icon, titre }, i) => (
          <button
            key={id}
            type="button"
            onClick={() => choisir(i === 1)}
            title={titre}
            aria-label={label}
            aria-pressed={actif === i}
            className={cn(
              'grid size-9 place-items-center rounded-lg transition-colors duration-200',
              actif === i ? 'bg-shell-active' : 'hover:bg-shell-hover'
            )}
          >
            <Icon
              className={cn(
                'size-[18px] transition-colors duration-200',
                actif === i ? 'text-shell-foreground' : 'text-shell-muted'
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label="Zone principale"
      className="relative flex rounded-full bg-shell-input p-0.5"
    >
      {/* La pastille passe SOUS les libellés : ils changent de couleur pendant
          qu'elle les traverse, au lieu d'être poussés par elle. */}
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-full bg-shell shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        style={{ width: 'calc(50% - 2px)', transform: `translateX(${actif * 100}%)` }}
      />
      {/* Deux mots suffisent à nommer deux zones : une icône par segment
          n'ajoutait rien à « Hub » et « Navigateur », et chargeait une barre
          qui doit rester discrète. Le rail, lui, n'a que les icônes. */}
      {MODES.map(({ id, label }, i) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={actif === i}
          onClick={() => choisir(i === 1)}
          className={cn(
            'relative z-10 flex-1 rounded-full py-1 text-[13px] transition-colors duration-200',
            actif === i ? 'font-medium text-shell-foreground' : 'text-shell-muted hover:text-shell-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

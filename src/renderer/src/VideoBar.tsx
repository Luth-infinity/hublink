import * as React from 'react';
import { cn } from '@/lib/utils';
import { FastForward, Minimize2, Pause, Play, Rewind, SkipForward, Volume2, VolumeX } from 'lucide-react';
import type { EtatVideo } from '@/types';

const api = window.hublink;

/**
 * La bande de commandes de la fenêtre vidéo.
 *
 * La vidéo elle-même occupe le haut de la fenêtre : c'est une vue native, elle
 * se peint au-dessus du HTML. On ne dessine donc rien par-dessus l'image — tout
 * tient dans cette bande, sous elle.
 *
 * L'état arrive de la page deux fois par seconde. Le bouton « Passer » n'existe
 * que si le lecteur en propose un : on n'invente rien, on relaie le sien.
 */
export default function VideoBar() {
  const [etat, setEtat] = React.useState<EtatVideo | null>(null);
  React.useEffect(() => api.video.onEtat(setEtat), []);

  const commande = (quoi: string, valeur?: number) => api.video.commande(quoi, valeur);

  const avancement = etat && etat.duree > 0 ? (etat.position / etat.duree) * 100 : 0;
  const volume = etat?.muet ? 0 : (etat?.volume ?? 1);

  const allerA = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!etat || !etat.duree) return;
    const r = e.currentTarget.getBoundingClientRect();
    commande('aller', ((e.clientX - r.left) / r.width) * etat.duree);
  };

  return (
    // Collée en bas, sur exactement la hauteur que la fenêtre lui réserve
    // (`BARRE` dans `src/main/videomode.js`) : le reste appartient à la vue
    // native, qui se peint par-dessus ce HTML.
    <div className="deplacable fixed inset-x-0 bottom-0 flex h-[46px] flex-col bg-shell-raised text-shell-foreground">
      {/* La position dans la vidéo, en un trait. Cliquer dedans y emmène. */}
      <div
        className="cliquable group relative h-1.5 w-full shrink-0 cursor-pointer bg-shell-active"
        onClick={allerA}
        role="presentation"
      >
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${avancement}%` }}
        />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-0.5 px-1.5">
        <Bouton titre={etat?.pause ? 'Lire' : 'Mettre en pause'} onClick={() => commande('lecture')}>
          {etat?.pause ? <Play className="size-4" /> : <Pause className="size-4" />}
        </Bouton>
        <Bouton titre="Reculer de 10 secondes" onClick={() => commande('avancer', -10)}>
          <Rewind className="size-4" />
        </Bouton>
        <Bouton titre="Avancer de 10 secondes" onClick={() => commande('avancer', 10)}>
          <FastForward className="size-4" />
        </Bouton>

        <Bouton titre={etat?.muet ? 'Rétablir le son' : 'Couper le son'} onClick={() => commande('muet')}>
          {etat?.muet ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Bouton>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={volume}
          onChange={(e) => commande('volume', Number(e.target.value))}
          aria-label="Volume"
          className="cliquable h-1 w-16 shrink-0 cursor-pointer accent-[var(--accent)]"
        />

        {/* Le raccourci : le lecteur propose de passer un passage, on le monte
            ici pour qu'il reste à portée quand la fenêtre est réduite. */}
        {etat?.passer && (
          <button
            type="button"
            onClick={() => commande('passer')}
            title={etat.passer}
            className="cliquable ml-1 flex min-w-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground transition-transform hover:scale-[1.03] active:scale-95 motion-reduce:hover:scale-100"
          >
            <SkipForward className="size-3.5 shrink-0" />
            <span className="truncate">{etat.passer}</span>
          </button>
        )}

        <div className="min-w-0 flex-1" />

        <span className="shrink-0 pr-1 text-[11px] tabular-nums text-shell-muted">
          {duree(etat?.position)} / {duree(etat?.duree)}
        </span>
        <Bouton titre="Ramener dans Hublink" onClick={() => api.video.fermer()}>
          <Minimize2 className="size-4" />
        </Bouton>
      </div>
    </div>
  );
}

function Bouton({
  titre,
  onClick,
  children
}: {
  titre: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      className={cn(
        'cliquable grid size-7 shrink-0 place-items-center rounded-md text-shell-muted',
        'transition-colors hover:bg-shell-hover hover:text-shell-foreground'
      )}
    >
      {children}
    </button>
  );
}

/** `1:04:12` pour une conférence, `4:12` pour une vidéo courte. */
function duree(secondes?: number) {
  const t = Math.max(0, Math.floor(secondes || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const deux = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${m}:${deux(s)}`;
}

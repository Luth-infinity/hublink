import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react';
import type { EtatVideo } from '@/types';

const api = window.hublink;

// La hauteur que la fenêtre réserve à cette bande : `BARRE` dans
// `src/main/videomode.js`. Les désaccorder la cacherait sous la vue native.
const HAUTEUR = 46;
const SAUT = 10;

/**
 * La bande de commandes de la fenêtre vidéo.
 *
 * L'image occupe le haut de la fenêtre : c'est une vue native, elle se peint
 * au-dessus du HTML. Rien ne peut donc flotter par-dessus la vidéo — ni
 * commandes qui s'effacent sur l'image, ni voile au survol. Tout tient dans
 * cette bande, sous elle.
 *
 * Au repos elle ne montre que la progression, pour ne pas border une vidéo
 * d'une rangée de boutons dont personne n'a besoin pendant qu'il regarde. Les
 * commandes reviennent quand le pointeur approche. Le bouton du lecteur, lui,
 * ne se cache jamais : il ne dure que quelques secondes.
 *
 * L'état arrive de la page deux fois par seconde.
 */
export default function VideoBar() {
  const [etat, setEtat] = React.useState<EtatVideo | null>(null);
  // Instant survolé sur la barre de progression, montré à la place du titre :
  // une bulle au-dessus du rail passerait sous l'image.
  const [apercu, setApercu] = React.useState<number | null>(null);
  // Le pointeur est-il sur la fenêtre ? La question vient du processus
  // principal : l'image est une vue native, elle ne nous dirait rien.
  const [survole, setSurvole] = React.useState(false);

  React.useEffect(() => api.video.onEtat(setEtat), []);
  React.useEffect(() => api.video.onSurvol(setSurvole), []);

  // La fenêtre descend à 320 points de large. Passé un seuil, quelque chose
  // doit céder : ce sera l'heure, jamais le bouton du lecteur.
  const [largeur, setLargeur] = React.useState(() => window.innerWidth);
  React.useEffect(() => {
    const mesurer = () => setLargeur(window.innerWidth);
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, []);

  const commande = React.useCallback(
    (quoi: string, valeur?: number) => api.video.commande(quoi, valeur),
    []
  );

  // Les raccourcis d'un lecteur, quand la bande a le focus. La page garde les
  // siens le reste du temps : c'est elle qui a le clavier.
  React.useEffect(() => {
    const actions: Record<string, () => void> = {
      ' ': () => commande('lecture'),
      k: () => commande('lecture'),
      arrowleft: () => commande('avancer', -SAUT),
      arrowright: () => commande('avancer', SAUT),
      m: () => commande('muet'),
      s: () => etat?.passer && commande('passer'),
      escape: () => api.video.fermer()
    };
    const touche = (e: KeyboardEvent) => {
      const faire = actions[e.key === ' ' ? ' ' : e.key.toLowerCase()];
      if (!faire) return;
      e.preventDefault();
      faire();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [commande, etat?.passer]);

  const duree = etat?.duree ?? 0;
  const part = duree > 0 ? Math.min(1, (etat?.position ?? 0) / duree) : 0;
  const volume = etat?.muet ? 0 : (etat?.volume ?? 1);

  // En pause, les commandes restent : il faut bien pouvoir relancer.
  const montre = survole || Boolean(etat?.pause);
  // L'opacité seule, jamais l'affichage : ce qui s'efface garde sa place, et
  // rien ne se déplace quand la main s'approche.
  const fondu = montre ? 'opacity-100' : 'pointer-events-none opacity-0';
  const serre = largeur < 430 && Boolean(etat?.passer);

  const surLeRail = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duree) return null;
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(duree, Math.max(0, ((e.clientX - r.left) / r.width) * duree));
  };

  return (
    <div
      className="deplacable fixed inset-x-0 bottom-0 flex flex-col bg-shell-raised text-shell-foreground"
      style={{ height: HAUTEUR }}
    >
      {/* La progression, seule chose qui ne s'efface pas : elle se lit d'un
          coup d'œil sans rien réclamer. Le rail s'épaissit sous le pointeur,
          où il devient une cible. */}
      <div
        className="cliquable group relative flex h-2 shrink-0 cursor-pointer items-center"
        onClick={(e) => {
          const t = surLeRail(e);
          if (t !== null) commande('aller', t);
        }}
        onMouseMove={(e) => setApercu(surLeRail(e))}
        onMouseLeave={() => setApercu(null)}
        role="presentation"
      >
        <div className="h-[3px] w-full bg-shell-active transition-[height] duration-150 group-hover:h-[6px]">
          <div
            className="h-full bg-primary"
            style={{ width: `${part * 100}%`, transition: 'width 220ms linear' }}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-0.5 pl-1.5 pr-1">
        <div className={cn('flex shrink-0 items-center gap-0.5 transition-opacity duration-200', fondu)}>
          <Bouton
            titre={etat?.pause ? 'Lire (espace)' : 'Mettre en pause (espace)'}
            onClick={() => commande('lecture')}
            fort
          >
            {etat?.pause ? <Play className="size-[18px]" /> : <Pause className="size-[18px]" />}
          </Bouton>
          <Bouton
            titre="Reculer de 10 secondes (flèche gauche)"
            onClick={() => commande('avancer', -SAUT)}
          >
            <RotateCcw className="size-4" />
          </Bouton>
          <Bouton
            titre="Avancer de 10 secondes (flèche droite)"
            onClick={() => commande('avancer', SAUT)}
          >
            <RotateCw className="size-4" />
          </Bouton>

          {/* Le curseur ne se déplie qu'au besoin : dans 480 points de large,
              chaque élément permanent est pris sur le titre. La molette sur
              l'image règle le son elle aussi. */}
          <div className="group/son flex shrink-0 items-center">
            <Bouton
              titre={etat?.muet ? 'Rétablir le son (M)' : 'Couper le son (M)'}
              onClick={() => commande('muet')}
            >
              {etat?.muet ? (
                <VolumeX className="size-4" />
              ) : volume < 0.5 ? (
                <Volume1 className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </Bouton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              onChange={(e) => commande('volume', Number(e.target.value))}
              aria-label="Volume"
              style={{ ['--part' as string]: volume }}
              className={cn(
                'curseur cliquable w-0 cursor-pointer opacity-0 transition-[width,opacity] duration-200',
                'group-hover/son:w-16 group-hover/son:opacity-100',
                'focus-visible:w-16 focus-visible:opacity-100'
              )}
            />
          </div>
        </div>

        {/* Ce qui joue — ou, pendant qu'on cherche un passage, l'instant visé.
            C'est aussi la poignée : on déplace la fenêtre en l'attrapant. */}
        <div className={cn('min-w-0 flex-1 px-2 transition-opacity duration-200', fondu)}>
          <p
            className={cn(
              'truncate text-center text-[11px] leading-none',
              apercu !== null ? 'tabular-nums text-shell-foreground' : 'text-shell-muted'
            )}
            title={etat?.titre}
          >
            {apercu !== null ? `→ ${horloge(apercu)}` : etat?.titre}
          </p>
        </div>

        {etat?.passer && (
          <button
            type="button"
            onClick={() => commande('passer')}
            title={`${etat.passer} (S)`}
            className={cn(
              'monte-passer cliquable flex h-7 max-w-[60%] shrink-0 items-center gap-1',
              'rounded-full bg-primary pl-2 pr-2.5 text-xs font-medium text-primary-foreground',
              'transition-transform hover:scale-[1.04] active:scale-95 motion-reduce:hover:scale-100'
            )}
          >
            <SkipForward className="size-3.5 shrink-0" />
            <span className="truncate">{etat.passer}</span>
          </button>
        )}

        <div className={cn('flex shrink-0 items-center transition-opacity duration-200', fondu)}>
          {!serre && (
            <span className="px-1.5 text-[11px] tabular-nums text-shell-muted">
              {horloge(etat?.position)}
              {duree > 0 && <span className="opacity-50"> / {horloge(duree)}</span>}
            </span>
          )}
          <Bouton titre="Ramener dans Hublink (Échap)" onClick={() => api.video.fermer()}>
            <Minimize2 className="size-4" />
          </Bouton>
        </div>
      </div>
    </div>
  );
}

function Bouton({
  titre,
  onClick,
  fort = false,
  children
}: {
  titre: string;
  onClick: () => void;
  fort?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      className={cn(
        'cliquable grid size-7 shrink-0 place-items-center rounded-md transition-colors',
        'hover:bg-shell-hover focus-visible:bg-shell-hover',
        fort ? 'text-shell-foreground' : 'text-shell-muted hover:text-shell-foreground'
      )}
    >
      {children}
    </button>
  );
}

/** `1:04:12` pour une conférence, `4:12` pour une vidéo courte. */
function horloge(secondes?: number) {
  const t = Math.max(0, Math.floor(secondes || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const deux = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${m}:${deux(s)}`;
}

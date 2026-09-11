import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Undo2,
  Volume1,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { EtatVideo } from '@/types';

const api = window.hublink;

const SAUT = 10;

// Une molette à roue libre — la MX Master et ses cousines — envoie des dizaines
// de crans minuscules par geste, et continue sur sa lancée une fois lâchée.
// Compter cinq pour cent par événement vidait le son d'un seul lancer. On
// mesure donc la distance parcourue, et un même geste ne déplace le volume que
// d'un cinquième.
const VOLUME_PAR_PIXEL = 0.0005;
const MAX_PAR_GESTE = 0.2;
const PAUSE_ENTRE_GESTES = 350;

/**
 * Les commandes de la fenêtre vidéo.
 *
 * Elles vivent dans un voile transparent posé sur l'image, et non sous elle :
 * une vue web native se peint au-dessus du HTML de sa fenêtre, alors lui
 * réserver une bande bordait la vidéo d'un bandeau noir permanent.
 *
 * Au repos, rien. Le pointeur approche, un dégradé monte du bas et les
 * commandes paraissent avec lui. Le bouton du lecteur, lui, ne se cache
 * jamais : il ne dure que quelques secondes et c'est tout son intérêt.
 *
 * La fenêtre décline le premier plan — un clic sur la pause pendant une partie
 * en sortirait le jeu — donc elle n'a jamais le clavier : pas de raccourcis
 * ici, tout passe par ces boutons.
 */
export default function VideoBar() {
  const [etat, setEtat] = React.useState<EtatVideo | null>(null);
  // Instant survolé sur la barre de progression, montré à la place du titre :
  // une bulle au-dessus du rail sortirait de la zone qui reçoit les clics.
  const [apercu, setApercu] = React.useState<number | null>(null);
  // Le pointeur est-il sur la fenêtre ? La question vient du processus
  // principal : l'image est une vue native, elle ne nous dirait rien.
  const [survole, setSurvole] = React.useState(false);

  React.useEffect(() => api.video.onEtat(setEtat), []);
  React.useEffect(() => api.video.onSurvol(setSurvole), []);

  // Le déplacement se fait à la main : une zone `-webkit-app-region: drag`
  // déplacerait ce voile seul, en le décollant de son image.
  React.useEffect(() => {
    const relacher = () => api.video.deplacer(false);
    window.addEventListener('mouseup', relacher);
    window.addEventListener('blur', relacher);
    return () => {
      window.removeEventListener('mouseup', relacher);
      window.removeEventListener('blur', relacher);
    };
  }, []);

  const commande = React.useCallback(
    (quoi: string, valeur?: number) => api.video.commande(quoi, valeur),
    []
  );

  const duree = etat?.duree ?? 0;
  const part = duree > 0 ? Math.min(1, (etat?.position ?? 0) / duree) : 0;
  const volume = etat?.muet ? 0 : (etat?.volume ?? 1);

  // Sur le haut-parleur seulement : c'est là qu'on la tourne exprès. L'état
  // de la page n'arrive que toutes les demi-secondes, le geste part donc du
  // volume connu à son début et ne relit pas l'état en chemin.
  const geste = React.useRef({ depart: 0, cumul: 0, dernier: 0 });
  const molette = (e: React.WheelEvent) => {
    const pixels = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const maintenant = performance.now();
    if (maintenant - geste.current.dernier > PAUSE_ENTRE_GESTES) {
      geste.current = { depart: volume, cumul: 0, dernier: maintenant };
    }
    geste.current.dernier = maintenant;
    geste.current.cumul += pixels;
    const ecart = Math.max(-MAX_PAR_GESTE, Math.min(MAX_PAR_GESTE, -geste.current.cumul * VOLUME_PAR_PIXEL));
    commande('volume', Math.min(1, Math.max(0, geste.current.depart + ecart)));
  };

  // En pause, les commandes restent : il faut bien pouvoir relancer.
  const montre = survole || Boolean(etat?.pause);
  const fondu = montre ? 'opacity-100' : 'pointer-events-none opacity-0';

  const surLeRail = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duree) return null;
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(duree, Math.max(0, ((e.clientX - r.left) / r.width) * duree));
  };

  return (
    <div className="fixed inset-0 select-none text-white">
      {/* Le voile ne noircit que le bas, et se dissipe vers le haut : assez
          pour lire des commandes claires, jamais assez pour manger l'image. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-32 transition-opacity duration-200',
          'bg-gradient-to-t from-black/85 via-black/45 to-transparent',
          montre ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Le raccourci du lecteur. Il garde sa place, que les commandes soient
          là ou non, pour ne pas sauter d'un endroit à l'autre. */}
      {etat?.passer && (
        <button
          type="button"
          onClick={() => commande('passer')}
          title={etat.passer}
          className={cn(
            'monte-passer absolute bottom-[58px] right-3 flex h-8 max-w-[70%] items-center gap-1.5',
            'rounded-full bg-white pl-2.5 pr-3 text-xs font-medium text-black shadow-lg',
            'transition-transform hover:scale-[1.04] active:scale-95 motion-reduce:hover:scale-100'
          )}
        >
          <SkipForward className="size-3.5 shrink-0" />
          <span className="truncate">{etat.passer}</span>
        </button>
      )}

      {/* Un sponsor vient d'être sauté. Même place que le bouton du lecteur,
          mais sombre : ce n'est pas une invitation, c'est un compte rendu
          qu'on peut annuler. */}
      {!etat?.passer && etat?.sponsorPasse && (
        <button
          type="button"
          onClick={() => commande('revenir')}
          title="Revenir au début du passage"
          className={cn(
            'monte-passer absolute bottom-[58px] right-3 flex h-8 max-w-[70%] items-center gap-2',
            'rounded-full bg-black/70 pl-3 pr-1 text-xs text-white shadow-lg ring-1 ring-white/15 backdrop-blur',
            'transition-transform hover:scale-[1.04] active:scale-95 motion-reduce:hover:scale-100'
          )}
        >
          <span className="truncate text-white/80">{etat.sponsorPasse}</span>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-1 font-medium">
            <Undo2 className="size-3.5" /> Revenir
          </span>
        </button>
      )}

      <div className={cn('absolute inset-x-0 bottom-0 transition-opacity duration-200', fondu)}>
        {/* La progression. Le rail s'épaissit sous le pointeur, où il devient
            une cible. */}
        <div
          className="group relative flex h-2.5 cursor-pointer items-center px-2"
          onClick={(e) => {
            const t = surLeRail(e);
            if (t !== null) commande('aller', t);
          }}
          onMouseMove={(e) => setApercu(surLeRail(e))}
          onMouseLeave={() => setApercu(null)}
          role="presentation"
        >
          <div className="h-[3px] w-full rounded-full bg-white/25 transition-[height] duration-150 group-hover:h-[5px]">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${part * 100}%`, transition: 'width 220ms linear' }}
            />
          </div>
        </div>

        <div className="flex h-11 min-w-0 items-center gap-0.5 pb-1 pl-1.5 pr-1">
          <Bouton titre={etat?.pause ? 'Lire' : 'Mettre en pause'} onClick={() => commande('lecture')} fort>
            {etat?.pause ? <Play className="size-[18px]" /> : <Pause className="size-[18px]" />}
          </Bouton>
          <Bouton titre="Reculer de 10 secondes" onClick={() => commande('avancer', -SAUT)}>
            <RotateCcw className="size-4" />
          </Bouton>
          <Bouton titre="Avancer de 10 secondes" onClick={() => commande('avancer', SAUT)}>
            <RotateCw className="size-4" />
          </Bouton>

          {/* Le curseur ne se déplie qu'au besoin : dans 480 points de large,
              chaque élément permanent est pris sur le titre. La molette y
              règle le son — ici, et nulle part ailleurs sur la fenêtre. */}
          <div className="group/son flex shrink-0 items-center" onWheel={molette}>
            <Bouton
              titre={etat?.muet ? 'Rétablir le son' : 'Couper le son'}
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
                'curseur sur-image w-0 cursor-pointer opacity-0 transition-[width,opacity] duration-200',
                'group-hover/son:w-16 group-hover/son:opacity-100',
                'focus-visible:w-16 focus-visible:opacity-100'
              )}
            />
          </div>

          {/* Ce qui joue — ou, pendant qu'on cherche un passage, l'instant
              visé. C'est aussi la poignée : on déplace la fenêtre en
              l'attrapant. */}
          <div
            className="min-w-0 flex-1 cursor-move px-2"
            onMouseDown={() => api.video.deplacer(true)}
            role="presentation"
          >
            <p
              className={cn(
                'truncate text-center text-[11px] leading-none drop-shadow',
                apercu !== null ? 'tabular-nums text-white' : 'text-white/70'
              )}
              title={etat?.titre}
            >
              {apercu !== null ? `→ ${horloge(apercu)}` : etat?.titre}
            </p>
          </div>

          <span className="shrink-0 px-1.5 text-[11px] tabular-nums text-white/70 drop-shadow">
            {horloge(etat?.position)}
            {duree > 0 && <span className="opacity-60"> / {horloge(duree)}</span>}
          </span>
          {/* Une croix, parce que c'est ce qu'on cherche sur une fenêtre. Elle
              ne jette rien : la page retourne d'où elle vient. */}
          <Bouton titre="Fermer — la page revient dans Hublink" onClick={() => api.video.fermer()}>
            <X className="size-4" />
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
        'grid size-7 shrink-0 place-items-center rounded-md drop-shadow transition-colors',
        'hover:bg-white/15 focus-visible:bg-white/15',
        fort ? 'text-white' : 'text-white/75 hover:text-white'
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

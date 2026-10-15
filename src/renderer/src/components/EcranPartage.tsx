import * as React from 'react';
import { X } from 'lucide-react';
import type { Account, Cote, EcranPartage as Etat, Service } from '@/types';
import { cn } from '@/lib/utils';
import { repereLisible } from '@/lib/couleur';
import { ServiceIcon } from '@/components/ServiceIcon';
import { t } from '@/lib/i18n';

const api = window.hublink;

// La proportion choisie est une préférence de ce poste, pas une donnée à exporter.
const RATIO = 'hublink:ratio-partage';
const borne = (r: number) => Math.min(0.75, Math.max(0.25, r));
function ratioRetenu() {
  try {
    const r = Number(localStorage.getItem(RATIO));
    return r ? borne(r) : 0.5;
  } catch {
    return 0.5;
  }
}

type Props = {
  etat: NonNullable<Etat>;
  services: Service[];
  accounts: Account[];
  isDark: boolean;
  /** Images des deux pages, posées à leur place quand les vues sont masquées. */
  images: { gauche: string | null; droite: string | null } | null;
};

/**
 * L'écran partagé : deux services côte à côte, chacun sous un en-tête qui dit
 * ce qu'il montre et permet de le fermer. Le côté actif — celui où l'on a
 * cliqué en dernier, que suivent la barre d'adresse et le panneau — porte le
 * trait de couleur de son client.
 *
 * Les pages sont des vues natives posées par le processus principal : ce
 * composant ne dessine que leur cadre, et lui envoie la place de chacune.
 */
export function EcranPartage({ etat, services, accounts, isDark, images }: Props) {
  const zoneRef = React.useRef<HTMLDivElement>(null);
  const corps = { gauche: React.useRef<HTMLDivElement>(null), droite: React.useRef<HTMLDivElement>(null) };
  const [ratio, setRatio] = React.useState(ratioRetenu);
  // Pendant un glissement, les vues natives sont masquées et remplacées par
  // leur image : sans cela, le pointeur passerait sur une page et le shell ne
  // recevrait plus rien.
  const [glisse, setGlisse] = React.useState<{ gauche: string | null; droite: string | null } | null>(null);

  React.useEffect(() => {
    const signaler = () => {
      const g = corps.gauche.current?.getBoundingClientRect();
      const d = corps.droite.current?.getBoundingClientRect();
      if (!g || !d) return;
      const r = (b: DOMRect) => ({ x: b.x, y: b.y, width: b.width, height: b.height });
      api.split.setBounds({ gauche: r(g), droite: r(d) });
    };
    signaler();
    const obs = new ResizeObserver(signaler);
    if (corps.gauche.current) obs.observe(corps.gauche.current);
    if (corps.droite.current) obs.observe(corps.droite.current);
    window.addEventListener('resize', signaler);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', signaler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);

  const commencer = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const separateur = e.currentTarget;
    separateur.setPointerCapture(e.pointerId);
    const zone = zoneRef.current!.getBoundingClientRect();
    let dernier = ratio;
    const deplacer = (ev: PointerEvent) => {
      dernier = borne((ev.clientX - zone.left) / zone.width);
      setRatio(dernier);
    };
    const finir = () => {
      separateur.removeEventListener('pointermove', deplacer);
      separateur.removeEventListener('pointerup', finir);
      separateur.removeEventListener('pointercancel', finir);
      try {
        localStorage.setItem(RATIO, String(dernier));
      } catch {
        // Sans stockage, la proportion reviendra à moitié-moitié : sans gravité.
      }
      api.setOverlay(false);
      requestAnimationFrame(() => setGlisse(null));
    };
    separateur.addEventListener('pointermove', deplacer);
    separateur.addEventListener('pointerup', finir);
    separateur.addEventListener('pointercancel', finir);
    const prises = await api.viewStills();
    setGlisse(prises ?? { gauche: null, droite: null });
    requestAnimationFrame(() => api.setOverlay(true));
  };

  const vues = glisse ?? images;

  const cote = (c: Cote) => {
    const service = services.find((s) => s.id === etat[c]);
    const compte = accounts.find((a) => a.id === service?.accountId);
    const actif = etat.actif === c;
    return (
      <div
        className={cn('flex min-w-0 flex-col', c === 'droite' && 'flex-1')}
        style={c === 'gauche' ? { width: `calc(${ratio * 100}% - 3px)` } : undefined}
      >
        <div
          className={cn(
            'relative flex h-8 shrink-0 items-center gap-2 border-b border-shell-border px-2.5 text-xs transition-colors',
            actif ? 'bg-shell-raised text-shell-foreground' : 'bg-shell text-shell-muted'
          )}
          onClick={() => service && !actif && api.services.select(service.id)}
        >
          {/* Le côté actif porte le trait de son client, comme la ligne active du panneau. */}
          <span
            className={cn(
              'absolute inset-x-0 top-0 h-0.5 transition-opacity duration-200',
              actif ? 'opacity-100' : 'opacity-0'
            )}
            style={{ backgroundColor: compte ? repereLisible(compte.color, isDark) : 'transparent' }}
            aria-hidden
          />
          {service && <ServiceIcon service={service} className="size-4" textClassName="text-[8px]" isDark={isDark} />}
          <span className="truncate font-medium">{service?.name ?? '…'}</span>
          {compte && <span className="truncate text-shell-muted">{compte.name}</span>}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              api.split.fermer(c);
            }}
            className="ml-auto grid size-6 shrink-0 place-items-center rounded text-shell-muted transition-colors hover:bg-shell-active hover:text-shell-foreground"
            aria-label={t('Fermer {nom}', { nom: service?.name ?? t('ce côté') })}
            title={t("Fermer {nom} — l'autre côté reprend toute la place", { nom: service?.name ?? t('ce côté') })}
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div ref={corps[c]} className="relative min-h-0 flex-1 bg-shell">
          {vues?.[c] && (
            <img
              src={vues[c]!}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full object-cover object-left-top"
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div ref={zoneRef} className="absolute inset-0 flex">
      {cote('gauche')}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        title={t('Glisser pour changer les proportions — double-clic pour revenir à moitié-moitié')}
        onPointerDown={commencer}
        onDoubleClick={() => {
          setRatio(0.5);
          try {
            localStorage.setItem(RATIO, '0.5');
          } catch {
            // Rien à retenir sans stockage.
          }
        }}
        className="group relative w-1.5 shrink-0 cursor-col-resize bg-shell"
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-shell-border transition-colors group-hover:bg-shell-muted" />
      </div>
      {cote('droite')}
    </div>
  );
}

import * as React from 'react';
import { ArrowUp, SquarePen } from 'lucide-react';
import type { Account, Service, TrameBloc, TrameMessage, TramePoint, TrameService } from '@/types';
import { cn } from '@/lib/utils';
import { AccountAvatar } from '@/components/AccountAvatar';
import { ServiceIcon } from '@/components/ServiceIcon';
import { TrameLogo } from '@/components/TrameLogo';
import { BordVivant } from '@/lib/trame-bord';
import { t } from '@/lib/i18n';

const api = window.hublink;

const TOUR = 'Tour du matin';
const IDEES = [TOUR, "Qu'est-ce qu'on m'a demandé aujourd'hui ?", 'Résume ce qui est ouvert', 'Qui attend une réponse ?'];

// Le tour se lance seul à la première ouverture de la journée : la date du
// dernier tour est retenue dans ce navigateur, pas dans la configuration.
const JOUR = 'trame:dernier-tour';
const aujourdhui = () => new Date().toLocaleDateString('fr-CA');
function dernierTour() {
  try {
    return localStorage.getItem(JOUR);
  } catch {
    return null;
  }
}
function retenirTour() {
  try {
    localStorage.setItem(JOUR, aujourdhui());
  } catch {
    // Sans stockage, le tour se relancera à la prochaine ouverture : sans gravité.
  }
}

const reduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const attendre = (ms: number) => new Promise((r) => setTimeout(r, reduit() ? 0 : ms));

/** Le tour d'un client : il apparaît quand vient son tour, puis s'écrit. */
type TourClient = {
  accountId: string;
  points: TramePoint[];
  etat: 'attente' | 'lecture' | 'fait' | 'erreur';
  message?: string;
  ecrits?: number;
};

/** Une réponse en cours d'écriture connaît le nombre de mots déjà montrés. */
type Message = TrameMessage & {
  erreur?: boolean;
  ecrits?: number;
  /** La question « Tour du matin » et son brief, écartés de l'historique envoyé à l'IA. */
  tour?: boolean;
  clients?: TourClient[];
};

/** La transformation qui ramène la carte sur le bouton de la barre. */
function versBouton(carte: DOMRect) {
  const b = document.getElementById('trame-bouton')?.getBoundingClientRect();
  if (!b || !carte.width) return 'translateY(-12px) scale(.96)';
  return `translate(${b.left - carte.left}px, ${b.top - carte.top}px) scale(${b.width / carte.width}, ${b.height / carte.height})`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Le client du service affiché : Trame lit ses services, et seulement eux. */
  account: Account | null;
  accounts: Account[];
  services: Service[];
  isDark: boolean;
  onSelectService: (id: string) => void;
};

/**
 * Trame, l'assistante de Hublink.
 *
 * Elle s'ouvre par-dessus la fenêtre comme une modale — la vue web est masquée
 * et remplacée par son image (voir `overlayOpen` dans App), c'est ce qui lui
 * donne le clavier. Le bouton de la barre devient la carte, le bord de la
 * fenêtre s'allume ; à la fermeture, la carte retourne dans le bouton.
 *
 * Le calque reste monté fermé : le bord vivant garde son contexte WebGL, et la
 * conversation de chaque client survit d'une ouverture à l'autre.
 */
export function Trame({ open, onClose, account, accounts, services, isDark, onSelectService }: Props) {
  const [visible, setVisible] = React.useState(false);
  const [sortie, setSortie] = React.useState(false);
  const [eclat, setEclat] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const carteRef = React.useRef<HTMLDivElement>(null);
  const filRef = React.useRef<HTMLDivElement>(null);
  const champRef = React.useRef<HTMLInputElement>(null);
  const bordRef = React.useRef<BordVivant | null>(null);
  const morphRef = React.useRef<Animation | null>(null);

  const [cle, setCle] = React.useState<{ cle: boolean; chiffrement: boolean } | null>(null);
  const [saisieCle, setSaisieCle] = React.useState('');
  const [liste, setListe] = React.useState<TrameService[]>([]);
  const conversations = React.useRef<Record<string, Message[]>>({});
  const exclusPar = React.useRef<Record<string, Set<string>>>({});
  const [, rafraichir] = React.useReducer((x: number) => x + 1, 0);
  const [etat, setEtat] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const [reflechit, setReflechit] = React.useState(false);
  const [texte, setTexte] = React.useState('');
  const [efface, setEfface] = React.useState(false);
  const [ideesRevenues, setIdeesRevenues] = React.useState(false);

  const accountId = account?.id ?? null;
  const conv: Message[] = accountId ? (conversations.current[accountId] ??= []) : [];
  const exclus: Set<string> = accountId ? (exclusPar.current[accountId] ??= new Set()) : new Set();
  // Pendant le tour, le service seul ne suffit pas : on nomme aussi son client.
  const nomDe = React.useCallback(
    (id: string, avecClient = false) => {
      const s = services.find((x) => x.id === id);
      if (!s) return t('une page');
      const client = avecClient ? accounts.find((a) => a.id === s.accountId) : null;
      return client ? `${client.name} · ${s.name}` : s.name;
    },
    [services, accounts]
  );

  React.useEffect(() => {
    if (canvasRef.current) bordRef.current = new BordVivant(canvasRef.current);
    const redim = () => bordRef.current?.redimensionner();
    window.addEventListener('resize', redim);
    return () => {
      window.removeEventListener('resize', redim);
      bordRef.current?.detruire();
      bordRef.current = null;
    };
  }, []);

  // --- ouverture et fermeture ------------------------------------------------

  React.useEffect(() => {
    if (open) {
      setVisible(true);
      setSortie(false);
      api.trame.cleEtat().then(setCle);
      if (accountId) api.trame.services(accountId).then(setListe);
      return;
    }
    if (!visible || !carteRef.current) return;
    const carte = carteRef.current;
    setSortie(true);
    bordRef.current?.fermer();
    morphRef.current?.cancel();
    const anim = carte.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: versBouton(carte.getBoundingClientRect()), borderRadius: '8px', opacity: 0 }
      ],
      { duration: reduit() ? 1 : 420, delay: reduit() ? 0 : 120, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
    );
    morphRef.current = anim;
    anim.onfinish = () => {
      setVisible(false);
      setSortie(false);
      anim.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Le bouton devient la carte : elle part de sa place et de sa taille.
  React.useLayoutEffect(() => {
    if (!open || !visible || !carteRef.current) return;
    const carte = carteRef.current;
    const b = document.getElementById('trame-bouton')?.getBoundingClientRect();
    bordRef.current?.ouvrir(b ? b.left + b.width / 2 : innerWidth - 60, b ? b.top + b.height / 2 : 20);
    morphRef.current?.cancel();
    morphRef.current = carte.animate(
      [
        { transform: versBouton(carte.getBoundingClientRect()), borderRadius: '8px', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: 'none', borderRadius: '16px', opacity: 1 }
      ],
      { duration: reduit() ? 1 : 640, easing: 'cubic-bezier(.2,.9,.1,1)' }
    );
    setEclat(true);
    const t1 = setTimeout(() => setEclat(false), 1200);
    const t2 = setTimeout(() => champRef.current?.focus(), reduit() ? 0 : 380);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open, visible]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // La carte change de hauteur en douceur plutôt que de sauter.
  const hauteur = React.useRef(0);
  React.useLayoutEffect(() => {
    const carte = carteRef.current;
    if (!carte || !visible) return;
    const h = carte.offsetHeight;
    if (hauteur.current && h !== hauteur.current && !reduit()) {
      carte.animate([{ height: `${hauteur.current}px` }, { height: `${h}px` }], {
        duration: 220,
        easing: 'cubic-bezier(.2,.9,.1,1)'
      });
    }
    hauteur.current = h;
  });

  React.useEffect(
    () =>
      api.trame.onEtape((e) => {
        const tour = Boolean(e.accountId);
        if (e.type === 'redaction') setEtat(tour ? t('Résumé…') : t('Rédaction…'));
        else {
          const nom = nomDe(e.id, tour);
          // « Lecture d'Avanteam », pas « de Avanteam ».
          const de = /^[aeiouyhàâéèêëîïôûù]/i.test(nom) ? "d'" : 'de ';
          setEtat(t(e.type === 'reveil' ? 'Réveil {de}{nom}…' : 'Lecture {de}{nom}…', { de, nom }));
        }
      }),
    [nomDe]
  );

  const defiler = () => {
    const fil = filRef.current;
    if (fil) fil.scrollTop = fil.scrollHeight;
  };

  // --- conversation ------------------------------------------------------------

  const envoyer = async (question: string) => {
    question = question.trim();
    if (!question || occupe || !accountId || !cle?.cle) return;
    if (question === TOUR) return lancerTour();
    const historique = conv
      .filter((m) => !m.erreur && !m.tour)
      .map((m) => ({ role: m.role, texte: m.role === 'q' ? m.texte : (m.blocs ?? []).map((b) => b.texte).join(' ') }));
    conv.push({ role: 'q', texte: question });
    setTexte('');
    setOccupe(true);
    setReflechit(true);
    bordRef.current?.reflechir(true);
    setEtat(t('Lecture des pages…'));
    rafraichir();
    requestAnimationFrame(defiler);

    const rep = await api.trame.demander({ accountId, question, historique, exclus: [...exclus] });
    setEtat(null);
    setReflechit(false);
    bordRef.current?.reflechir(false);

    if (!rep.ok) {
      conv.push({ role: 'r', texte: rep.message, erreur: true });
      if (rep.code === 'cle') setCle((c) => (c ? { ...c, cle: false } : c));
    } else {
      // Écriture mot à mot : chaque mot s'ajoute, rien n'est réécrit.
      const message: Message = { role: 'r', texte: '', blocs: rep.blocs, sources: rep.sources, ecrits: 0 };
      conv.push(message);
      const total = rep.blocs.reduce((n, b) => n + b.texte.split(/\s+/).length, 0);
      for (let n = 1; n <= total; n++) {
        message.ecrits = n;
        rafraichir();
        defiler();
        await attendre(28 + Math.random() * 38);
      }
      message.ecrits = undefined;
    }
    setOccupe(false);
    rafraichir();
    requestAnimationFrame(defiler);
  };

  /**
   * Le tour du matin : les clients qui ont des non-lus, l'un après l'autre. Un
   * appel par client — le plan gratuit de Groq limite ce qu'on envoie par
   * minute —, et le brief se construit sous les yeux.
   */
  const lancerTour = async () => {
    if (occupe || !accountId) return;
    const avecNonLus = accounts.filter((a) => services.some((s) => s.accountId === a.id && s.badge > 0));
    retenirTour();
    conv.push({ role: 'q', texte: t(TOUR), tour: true });
    if (!avecNonLus.length) {
      conv.push({
        role: 'r',
        texte: '',
        tour: true,
        blocs: [{ type: 'p', texte: t('Aucun non-lu ce matin : rien à résumer.') }]
      });
      rafraichir();
      return;
    }
    const message: Message = {
      role: 'r',
      texte: '',
      tour: true,
      clients: avecNonLus.map((a) => ({ accountId: a.id, points: [], etat: 'attente' }))
    };
    conv.push(message);
    setOccupe(true);
    setReflechit(true);
    bordRef.current?.reflechir(true);
    rafraichir();
    for (const client of message.clients!) {
      client.etat = 'lecture';
      rafraichir();
      requestAnimationFrame(defiler);
      const rep = await api.trame.tour(client.accountId);
      if (!rep.ok) {
        client.etat = 'erreur';
        client.message = rep.message;
        if (rep.code === 'cle') {
          setCle((c) => (c ? { ...c, cle: false } : c));
          break;
        }
        continue;
      }
      client.points = rep.points;
      client.etat = 'fait';
      const total = rep.points.reduce((n, p) => n + p.texte.split(/\s+/).length, 0);
      for (let n = 1; n <= total; n++) {
        client.ecrits = n;
        rafraichir();
        defiler();
        await attendre(24 + Math.random() * 30);
      }
      client.ecrits = undefined;
    }
    setEtat(null);
    setReflechit(false);
    bordRef.current?.reflechir(false);
    setOccupe(false);
    rafraichir();
  };

  // Première ouverture de la journée : le tour part seul, une fois la carte posée.
  React.useEffect(() => {
    if (!open || !cle?.cle || !accountId || occupe || dernierTour() === aujourdhui()) return;
    const t = setTimeout(lancerTour, reduit() ? 0 : 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cle?.cle, accountId]);

  // Vider : les messages s'en vont un à un, puis les suggestions reviennent.
  const vider = () => {
    if (occupe || !accountId || !conv.length) return;
    setEfface(true);
    setTimeout(
      () => {
        conversations.current[accountId] = [];
        setEfface(false);
        setIdeesRevenues(true);
        rafraichir();
        champRef.current?.focus();
      },
      reduit() ? 0 : 260 + conv.length * 35
    );
  };

  const basculer = (s: TrameService) => {
    if (!s.charge) return;
    if (exclus.has(s.id)) exclus.delete(s.id);
    else exclus.add(s.id);
    rafraichir();
  };

  const enregistrerCle = async () => {
    if (!saisieCle.trim()) return;
    const ok = await api.trame.enregistrerCle(saisieCle.trim());
    setSaisieCle('');
    setCle(await api.trame.cleEtat());
    if (ok) setTimeout(() => champRef.current?.focus(), 50);
  };

  const pret = Boolean(accountId && cle?.cle);
  const entree = (i: number) => ({ className: open && !sortie ? 'trame-entre' : sortie ? 'trame-part' : '', style: { '--i': i } as React.CSSProperties });

  return (
    <div
      className={cn('fixed inset-0 z-50', visible ? 'visible' : 'pointer-events-none invisible')}
      role="dialog"
      aria-label="Trame"
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-black/45 backdrop-blur-[3px] transition-opacity duration-500',
          open && !sortie ? 'opacity-100' : 'opacity-0'
        )}
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />

      <button
        type="button"
        onClick={onClose}
        className={cn(
          'absolute top-3.5 right-4 flex h-7 items-center gap-2 rounded-md px-2.5 text-xs text-white/70 transition-opacity duration-300 hover:bg-white/10 hover:text-white',
          open && !sortie ? 'opacity-100' : 'opacity-0'
        )}
      >
        {t('Fermer')}{' '}<kbd className="rounded border border-white/25 px-1.5 py-px text-[10px]">{t('Échap')}</kbd>
      </button>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center px-6 pt-[15vh]">
        <div
          ref={carteRef}
          data-reflechit={reflechit || undefined}
          data-eclat={eclat || undefined}
          className="trame-carte pointer-events-auto relative flex max-h-[64vh] w-[min(680px,100%)] origin-top-left flex-col gap-3 rounded-2xl border border-shell-border bg-shell-raised p-3.5 text-shell-foreground shadow-2xl"
        >
          <div {...entree(0)} className={cn('flex items-center gap-2.5', entree(0).className)}>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold">
              <TrameLogo className="size-4" />
              Trame
            </span>
            {account && liste.length > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs text-shell-muted">
                {t('Lit')}
                {liste.map((s) => {
                  const service = services.find((x) => x.id === s.id);
                  const off = !s.charge || exclus.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => basculer(s)}
                      aria-pressed={!off}
                      title={
                        !s.charge
                          ? t('{nom} est en veille : ouvre-le pour que Trame le lise', { nom: s.nom })
                          : exclus.has(s.id)
                            ? t('Lire {nom}', { nom: s.nom })
                            : t('Ne plus lire {nom}', { nom: s.nom })
                      }
                      className={cn(
                        'flex h-6 items-center gap-1.5 rounded-full border border-shell-border pr-2 pl-1 text-xs text-shell-foreground transition-opacity',
                        off && 'opacity-40',
                        exclus.has(s.id) && 'line-through',
                        !s.charge && 'cursor-default'
                      )}
                    >
                      {service && <ServiceIcon service={service} isDark={isDark} className="size-4 rounded" />}
                      {s.nom}
                    </button>
                  );
                })}
              </div>
            )}
            {conv.length > 0 && (
              <button
                type="button"
                onClick={vider}
                disabled={occupe}
                title={t('Nouvelle conversation')}
                className={cn(
                  'flex h-6 items-center gap-1.5 rounded-md px-2 text-xs text-shell-muted transition-colors hover:bg-shell-hover hover:text-shell-foreground disabled:opacity-40',
                  !(account && liste.length > 0) && 'ml-auto'
                )}
              >
                <SquarePen className="size-3.5" />
                {t('Nouvelle')}
              </button>
            )}
          </div>

          {!account ? (
            <p {...entree(1)} className={cn('text-sm text-shell-muted', entree(1).className)}>
              {t("Trame lit les services d'un client. Ouvres-en un pour commencer.")}
            </p>
          ) : cle && !cle.cle ? (
            <div {...entree(1)} className={cn('grid gap-2.5', entree(1).className)}>
              <p className="text-sm leading-relaxed text-shell-muted">
                {t('Trame répond avec Groq, une IA gratuite. Crée une clé sur')}{' '}
                <button
                  type="button"
                  onClick={() => api.openExternal('https://console.groq.com/keys')}
                  className="text-shell-foreground underline underline-offset-2"
                >
                  console.groq.com/keys
                </button>{' '}
                {t('et colle-la ici : elle reste chiffrée sur cet ordinateur.')}
              </p>
              {cle.chiffrement ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    enregistrerCle();
                  }}
                  className="flex h-11 items-center gap-2 rounded-xl border border-shell-border bg-shell-input pr-1.5 pl-3.5"
                >
                  <input
                    type="password"
                    value={saisieCle}
                    onChange={(e) => setSaisieCle(e.target.value)}
                    placeholder="gsk_…"
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-shell-muted"
                  />
                  <button
                    type="submit"
                    disabled={!saisieCle.trim()}
                    className="h-8 rounded-lg bg-shell-foreground px-3 text-xs font-medium text-shell transition-opacity disabled:opacity-30"
                  >
                    {t('Enregistrer')}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-shell-muted">
                  {t('Le trousseau du système est indisponible : Trame ne peut pas garder ta clé.')}
                </p>
              )}
            </div>
          ) : (
            <form
              {...entree(1)}
              onSubmit={(e) => {
                e.preventDefault();
                envoyer(texte);
              }}
              className={cn(
                'flex h-12 shrink-0 items-center gap-2 rounded-xl border border-shell-border bg-shell-input pr-1.5 pl-3.5 transition-colors focus-within:border-shell-muted/60',
                entree(1).className
              )}
            >
              <input
                ref={champRef}
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                placeholder={t('Demande à Trame…')}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-shell-muted"
              />
              <button
                type="submit"
                disabled={!texte.trim() || occupe || !pret}
                aria-label={t('Envoyer')}
                className="grid size-9 place-items-center rounded-lg bg-shell-foreground text-shell transition-[opacity,transform] hover:-translate-y-px disabled:translate-y-0 disabled:opacity-25"
              >
                <ArrowUp className="size-4" />
              </button>
            </form>
          )}

          {conv.length > 0 && (
            <div
              ref={filRef}
              aria-live="polite"
              className="trame-fil flex min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto p-0.5"
            >
              {conv.map((m, i) => (
                <div
                  key={i}
                  className={efface ? 'trame-part' : undefined}
                  style={{ '--i': conv.length - 1 - i } as React.CSSProperties}
                >
                  {m.role === 'q' ? (
                    <div className="trame-question ml-auto w-fit max-w-[80%] rounded-[14px_14px_4px_14px] bg-shell-active px-3 py-2 text-[13px] leading-snug">
                      {m.texte}
                    </div>
                  ) : m.clients ? (
                    <Tour
                      clients={m.clients}
                      accounts={accounts}
                      services={services}
                      onSource={(id) => {
                        onClose();
                        onSelectService(id);
                      }}
                    />
                  ) : m.erreur ? (
                    <p className="trame-entre text-sm text-shell-muted" style={{ '--i': 0 } as React.CSSProperties}>
                      {m.texte}
                    </p>
                  ) : (
                    <Reponse
                      message={m}
                      services={services}
                      isDark={isDark}
                      onSource={(id) => {
                        onClose();
                        onSelectService(id);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {etat && (
            <div role="status" className="flex items-center gap-2.5 text-[13px]">
              <span className="trame-orbe size-2.5 shrink-0 rounded-full" />
              <span className="trame-reflet">{etat}</span>
            </div>
          )}

          {pret && !conv.length && (
            <div className="flex flex-wrap gap-1.5">
              {IDEES.map((idee, i) => (
                <button
                  key={idee}
                  type="button"
                  onClick={() => envoyer(idee === TOUR ? TOUR : t(idee))}
                  className={cn(
                    'h-[30px] rounded-full bg-shell-hover px-3 text-xs text-shell-muted transition-colors hover:bg-shell-active hover:text-shell-foreground',
                    ideesRevenues ? 'trame-entre' : entree(2 + i).className
                  )}
                  style={{ '--i': ideesRevenues ? i : 2 + i } as React.CSSProperties}
                  onAnimationEnd={() => setIdeesRevenues(false)}
                >
                  {idee === TOUR && <TrameLogo className="mr-1.5 -ml-0.5 inline size-3.5 align-[-2px]" />}
                  {t(idee)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Une réponse : paragraphes et listes, écrits mot à mot, puis ses sources. */
function Reponse({
  message,
  services,
  isDark,
  onSource
}: {
  message: Message;
  services: Service[];
  isDark: boolean;
  onSource: (id: string) => void;
}) {
  const limite = message.ecrits ?? Infinity;
  const enCours = message.ecrits !== undefined;
  let rang = 0;

  const mots = (b: TrameBloc) =>
    b.texte.split(/\s+/).map((mot, i) => {
      const n = rang++;
      if (n >= limite) return null;
      return (
        <span key={i} className={enCours ? 'trame-mot' : undefined}>
          {(i ? ' ' : '') + mot}
        </span>
      );
    });

  // Des « li » consécutifs forment une liste.
  const groupes: { type: 'p' | 'li'; blocs: TrameBloc[] }[] = [];
  for (const b of message.blocs ?? []) {
    const dernier = groupes[groupes.length - 1];
    if (b.type === 'li' && dernier?.type === 'li') dernier.blocs.push(b);
    else groupes.push({ type: b.type, blocs: [b] });
  }

  return (
    <div className="text-sm leading-relaxed">
      {groupes.map((g, gi) =>
        g.type === 'li' ? (
          <ul key={gi} className="mb-2 grid gap-1">
            {g.blocs.map((b, bi) => (
              <li key={bi} className="trame-puce relative pl-4">
                {mots(b)}
              </li>
            ))}
          </ul>
        ) : (
          <p key={gi} className="mb-2">
            {mots(g.blocs[0])}
          </p>
        )
      )}
      {!enCours && (message.sources ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(message.sources ?? []).map((id, i) => {
            const service = services.find((s) => s.id === id);
            if (!service) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSource(id)}
                className="trame-entre flex h-[26px] items-center gap-1.5 rounded-md bg-shell-hover pr-2.5 pl-1.5 text-xs text-shell-muted transition-colors hover:bg-shell-active hover:text-shell-foreground"
                style={{ '--i': i - 2 } as React.CSSProperties}
              >
                <ServiceIcon service={service} isDark={isDark} className="size-4 rounded" />
                {service.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Le brief du matin : un bloc par client, à sa couleur, qui s'écrit à son tour. */
function Tour({
  clients,
  accounts,
  services,
  onSource
}: {
  clients: TourClient[];
  accounts: Account[];
  services: Service[];
  onSource: (id: string) => void;
}) {
  return (
    <div className="grid gap-4">
      {clients
        .filter((c) => c.etat !== 'attente')
        .map((c) => {
          const compte = accounts.find((a) => a.id === c.accountId);
          if (!compte) return null;
          const nonLus = services
            .filter((s) => s.accountId === c.accountId)
            .reduce((n, s) => n + (s.badge || 0), 0);
          const limite = c.ecrits ?? Infinity;
          let rang = 0;
          return (
            <section key={c.accountId} className="trame-entre relative pl-4" style={{ '--i': -2 } as React.CSSProperties}>
              <span
                className="trame-trait absolute top-0.5 bottom-0.5 left-0 w-0.5 rounded-full"
                style={{ background: compte.color }}
                aria-hidden
              />
              <header className="mb-1.5 flex items-center gap-2 text-[13px]">
                <AccountAvatar account={compte} className="size-4 rounded" textClassName="text-[7px]" />
                <span className="font-semibold">{compte.name}</span>
                <span className="text-shell-muted">
                  {nonLus} non-lu{nonLus > 1 ? 's' : ''}
                </span>
              </header>
              {c.etat === 'erreur' ? (
                <p className="text-sm text-shell-muted">{c.message}</p>
              ) : c.etat === 'fait' && !c.points.length ? (
                <p className="text-sm text-shell-muted">{t('Rien qui te concerne.')}</p>
              ) : (
                <ul className="grid gap-0.5">
                  {c.points.map((p, pi) => {
                    const mots = p.texte.split(/\s+/).map((mot, i) => {
                      const n = rang++;
                      if (n >= limite) return null;
                      return (
                        <span key={i} className={c.ecrits !== undefined ? 'trame-mot' : undefined}>
                          {(i ? ' ' : '') + mot}
                        </span>
                      );
                    });
                    const source = p.source ? services.find((s) => s.id === p.source) : null;
                    return (
                      <li key={pi}>
                        <button
                          type="button"
                          disabled={!source}
                          onClick={() => source && onSource(source.id)}
                          title={source ? t('Ouvrir {nom}', { nom: source.name }) : undefined}
                          className="trame-puce relative w-full rounded-md py-1 pr-1.5 pl-[22px] text-left text-sm leading-relaxed transition-colors enabled:hover:bg-shell-hover before:!top-[calc(0.25rem+0.7em)] before:!left-2"
                        >
                          {mots}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
    </div>
  );
}

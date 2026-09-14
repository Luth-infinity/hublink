import * as React from 'react';
import {
  BookmarkPlus,
  Check,
  FileDown,
  FolderOpen,
  Layers2,
  Search,
  Settings,
  Trash2,
  Users,
  X
} from 'lucide-react';
import type { Account, AccountView, Download, HistoryEntry } from '@/types';
import { cn, hostOf } from '@/lib/utils';
import { useOptimiste } from '@/lib/optimiste';
import { normaliser, vueCourante } from '@/lib/selection';
import { ListeSurlignee } from '@/components/ListeSurlignee';
import { AccountAvatar } from '@/components/AccountAvatar';

/**
 * Les panneaux déroulants de la barre d'outils.
 *
 * Ils sont dessinés par la fenêtre transparente, pas par la principale : une
 * WebContentsView est native et se peint au-dessus du HTML du shell, un
 * panneau rendu là masquait donc la page au lieu de la survoler.
 */

const api = window.hublink;

/** « 4,2 Mo », « 812 Ko » — la taille telle qu'on l'attend dans une liste. */
function poids(octets: number) {
  if (!octets) return '';
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** « Aujourd'hui », « Hier », puis la date — comme on cherche de tête. */
function jour(at: number) {
  const d = new Date(at);
  const aujourdhui = new Date();
  const hier = new Date(aujourdhui);
  hier.setDate(hier.getDate() - 1);
  const memeJour = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (memeJour(d, aujourdhui)) return "Aujourd'hui";
  if (memeJour(d, hier)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

const heure = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const CADRE =
  'flex flex-col overflow-hidden rounded-lg border border-shell-border bg-shell-raised shadow-xl';

export function DownloadsPanel({ downloads }: { downloads: Download[] }) {
  return (
    <div role="dialog" aria-label="Téléchargements" className={cn(CADRE, 'max-h-[380px] w-[320px]')}>
      <div className="flex items-center justify-between border-b border-shell-border px-3 py-2">
        <span className="text-[12px] font-medium text-shell-foreground">Téléchargements</span>
        <button
          type="button"
          onClick={() => api.downloadsList.clear()}
          className="text-[11px] text-shell-muted transition-colors hover:text-shell-foreground"
        >
          Effacer la liste
        </button>
      </div>

      <ListeSurlignee className="min-h-0 flex-1 overflow-y-auto py-1">
        <ul>
        {downloads.map((d) => {
          const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : null;
          return (
            <li key={d.id}>
              <button
                type="button"
                disabled={d.state !== 'completed'}
                onClick={() => {
                  api.downloads.open(d.path);
                  api.panels.close();
                }}
                data-surlignable
                className="group relative z-10 flex w-full items-center gap-2.5 px-3 py-2 text-left disabled:cursor-default"
              >
                <FileDown
                  className={cn(
                    'size-4 shrink-0',
                    d.state === 'completed' ? 'text-shell-muted' : 'text-shell-muted/60'
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-shell-foreground">{d.name}</span>
                  <span className="block truncate text-[11px] text-shell-muted">
                    {d.state === 'progress'
                      ? pct !== null
                        ? `${pct} % — ${poids(d.received)} sur ${poids(d.total)}`
                        : `${poids(d.received)} reçus`
                      : d.state === 'completed'
                        ? poids(d.total)
                        : 'Interrompu'}
                  </span>
                  {d.state === 'progress' && (
                    <span className="mt-1 block h-[2px] overflow-hidden rounded-full bg-shell-active">
                      <span
                        className={cn(
                          'block h-full rounded-full bg-emerald-500 transition-[width] duration-200',
                          pct === null && 'w-1/3 animate-pulse'
                        )}
                        style={pct !== null ? { width: `${pct}%` } : undefined}
                      />
                    </span>
                  )}
                </span>
                {d.state === 'completed' && (
                  <span
                    role="button"
                    tabIndex={0}
                    title="Ouvrir le dossier"
                    aria-label={`Ouvrir le dossier contenant ${d.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      api.downloads.reveal(d.path);
                    }}
                    className="shrink-0 rounded p-1 text-shell-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-shell-foreground focus-visible:opacity-100"
                  >
                    <FolderOpen className="size-3.5" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
        </ul>
      </ListeSurlignee>
    </div>
  );
}

export function HistoryPanel({ history }: { history: HistoryEntry[] }) {
  const [filtre, setFiltre] = React.useState('');

  const resultats = React.useMemo(() => {
    const q = filtre.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (h) => h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)
    );
  }, [history, filtre]);

  // Regroupé par journée, dans l'ordre où la liste arrive : la plus récente
  // d'abord, comme le store la tient.
  const groupes = React.useMemo(() => {
    const out: { jour: string; entrees: HistoryEntry[] }[] = [];
    for (const e of resultats) {
      const j = jour(e.at);
      const dernier = out[out.length - 1];
      if (dernier && dernier.jour === j) dernier.entrees.push(e);
      else out.push({ jour: j, entrees: [e] });
    }
    return out;
  }, [resultats]);

  return (
    <div role="dialog" aria-label="Historique" className={cn(CADRE, 'max-h-[420px] w-[360px]')}>
      <div className="flex items-center justify-between border-b border-shell-border px-3 py-2">
        <span className="text-[12px] font-medium text-shell-foreground">Historique</span>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => api.browser.clearHistory()}
            className="flex items-center gap-1 text-[11px] text-shell-muted transition-colors hover:text-shell-foreground"
          >
            <Trash2 className="size-3" /> Tout effacer
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-shell-border px-3 py-2">
        <Search className="size-3.5 shrink-0 text-shell-muted" aria-hidden />
        <input
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          placeholder="Rechercher une page vue"
          aria-label="Rechercher dans l'historique"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[12px] text-shell-foreground outline-none placeholder:text-shell-muted"
        />
      </div>

      <ListeSurlignee className="min-h-0 flex-1 overflow-y-auto py-1">
        {groupes.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-shell-muted">
            {history.length === 0
              ? 'Rien pour le moment. Les pages visitées en mode navigateur apparaîtront ici.'
              : 'Aucune page ne correspond.'}
          </p>
        )}

        {groupes.map((groupe) => (
          <div key={groupe.jour}>
            <p className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wide text-shell-muted uppercase">
              {groupe.jour}
            </p>
            <ul>
              {groupe.entrees.map((e) => (
                <li
                  key={e.id}
                  data-surlignable
                  className="group relative z-10 flex items-center gap-2 px-3 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      api.browser.openHistory(e.url);
                      api.panels.close();
                    }}
                    title={e.url}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    {e.favicon ? (
                      <img src={e.favicon} alt="" className="size-4 shrink-0 rounded-sm" />
                    ) : (
                      <span className="size-4 shrink-0 rounded-sm bg-shell-active" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-shell-foreground">
                        {e.title || hostOf(e.url)}
                      </span>
                      <span className="block truncate text-[11px] text-shell-muted">
                        {hostOf(e.url)} · {heure(e.at)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => api.browser.removeHistory(e.id)}
                    aria-label={`Oublier ${e.title || hostOf(e.url)}`}
                    title="Oublier cette page"
                    className="shrink-0 rounded p-0.5 text-shell-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-shell-foreground focus-visible:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </ListeSurlignee>
    </div>
  );
}

/**
 * Sélecteur de comptes.
 *
 * En haut, ce qui se choisit d'un clic : « Tous » et les vues enregistrées.
 * Dessous, les comptes, avec deux gestes par ligne : cliquer le nom n'affiche
 * que ce compte et referme ; cocher la case l'ajoute à ce qu'on voit ou l'en
 * retire, et laisse le panneau ouvert pour continuer. Une sélection de
 * plusieurs comptes peut ensuite se garder sous un nom.
 *
 * Il passait par un menu natif, faute de pouvoir dessiner au-dessus de la
 * page. Le calque lève cette contrainte : le menu suit désormais l'habillage
 * de l'application, et se comporte pareil sur les deux systèmes.
 */
export function AccountsPanel({
  accounts,
  activeAccountIds,
  views,
  unreadByAccount,
  discreet
}: {
  accounts: Account[];
  activeAccountIds: string[];
  views: AccountView[];
  unreadByAccount: Record<string, number>;
  discreet: boolean;
}) {
  // La case bascule dès le clic, sans attendre l'aller-retour par le processus
  // principal. La valeur suivie est une chaîne : le tableau reçu est neuf à
  // chaque état poussé, et s'y réaligner à chaque fois ferait sauter une case
  // qu'on vient de cocher.
  const appliquer = React.useCallback(
    (cle: string) => api.accounts.filter(cle ? cle.split(',') : []),
    []
  );
  const [cle, changer] = useOptimiste(activeAccountIds.join(','), appliquer);
  const selection = cle ? cle.split(',') : [];
  const tous = selection.length === 0;
  const seul = selection.length === 1 ? selection[0] : null;
  const vue = vueCourante(accounts, views, selection);

  const basculer = (id: string) => {
    const base = tous ? accounts.map((a) => a.id) : selection;
    const suivante = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    // Tout décocher n'afficherait plus rien.
    if (suivante.length > 0) changer(normaliser(accounts, suivante).join(','));
  };
  const montrer = (ids: string[]) => {
    api.accounts.filter(ids);
    api.panels.close();
  };
  const nonLus = (ids: string[]) => ids.reduce((n, id) => n + (unreadByAccount[id] || 0), 0);

  return (
    <div role="dialog" aria-label="Comptes" className={cn(CADRE, 'max-h-[460px] w-[260px]')}>
      <ListeSurlignee className="min-h-0 flex-1 overflow-y-auto py-1">
        <ul>
          <li data-surlignable className={cn(LIGNE, tous && 'bg-shell-active')}>
            <button type="button" onClick={() => montrer([])} className={ZONE}>
              <Users className="size-4 shrink-0 text-shell-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-shell-foreground">Tous les comptes</span>
              {nonLus(accounts.map((a) => a.id)) > 0 && <Pastille n={nonLus(accounts.map((a) => a.id))} />}
            </button>
            <span className="grid w-[38px] shrink-0 place-items-center" aria-hidden>
              {tous && <Check className="size-3.5 text-shell-foreground" />}
            </span>
          </li>

          {views.map((v) => {
            const actif = vue?.id === v.id;
            // Le nom d'une vue dit quels clients elle regroupe : flouté comme
            // eux en mode discrétion, sauf celle qu'on affiche.
            const masquee = discreet && !actif;
            const n = nonLus(v.accountIds);
            const noms = v.accountIds
              .map((id) => accounts.find((a) => a.id === id)?.name)
              .filter(Boolean)
              .join(', ');
            return (
              <li key={v.id} data-surlignable className={cn('group', LIGNE, actif && 'bg-shell-active')}>
                <button
                  type="button"
                  onClick={() => montrer(v.accountIds)}
                  title={masquee ? undefined : noms}
                  className={ZONE}
                >
                  <Layers2 className="size-4 shrink-0 text-shell-muted" aria-hidden />
                  <span className={cn('min-w-0 flex-1 truncate text-shell-foreground', masquee && FLOU)}>
                    {v.name}
                  </span>
                  {n > 0 && <Pastille n={n} />}
                </button>
                <button
                  type="button"
                  onClick={() => api.views.remove(v.id)}
                  aria-label={masquee ? 'Supprimer cette vue' : `Supprimer la vue ${v.name}`}
                  title="Supprimer cette vue"
                  className="grid w-[38px] shrink-0 place-items-center self-stretch text-shell-muted transition-colors hover:text-shell-foreground"
                >
                  {actif && <Check className="size-3.5 text-shell-foreground group-hover:hidden" aria-hidden />}
                  <X
                    className={cn(
                      'size-3.5 transition-opacity',
                      actif ? 'hidden group-hover:block' : 'opacity-0 group-hover:opacity-100'
                    )}
                  />
                </button>
              </li>
            );
          })}

          <li aria-hidden className="my-1 border-t border-shell-border" />

          {accounts.map((compte) => {
            // En mode discrétion, les comptes autres que celui affiché sont
            // floutés ici aussi : les révéler dans le sélecteur viderait la
            // fonction de son sens.
            const masque = discreet && compte.id !== seul;
            const coche = tous || selection.includes(compte.id);
            // La dernière case cochée ne se décoche pas : il faut bien afficher
            // quelque chose.
            const derniere = seul === compte.id || accounts.length === 1;
            const n = unreadByAccount[compte.id] || 0;
            return (
              <li key={compte.id} data-surlignable className={cn(LIGNE, seul === compte.id && 'bg-shell-active')}>
                <button
                  type="button"
                  onClick={() => montrer([compte.id])}
                  title={masque ? undefined : `N'afficher que ${compte.name}`}
                  className={ZONE}
                >
                  <AccountAvatar
                    account={compte}
                    className={cn('size-4 rounded', masque && 'blur-[4px]')}
                    textClassName="text-[7px]"
                  />
                  <span className={cn('min-w-0 flex-1 truncate text-shell-foreground', masque && FLOU)}>
                    {compte.name}
                  </span>
                  {n > 0 && <Pastille n={n} />}
                </button>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={coche}
                  aria-label={masque ? 'Afficher ce compte' : `Afficher ${compte.name}`}
                  disabled={derniere}
                  onClick={() => basculer(compte.id)}
                  title={
                    derniere ? 'Au moins un compte reste affiché' : coche ? 'Retirer de l’affichage' : 'Ajouter à l’affichage'
                  }
                  className="grid w-[38px] shrink-0 place-items-center self-stretch disabled:cursor-default"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-3.5 place-items-center rounded-[4px] border transition-colors duration-150',
                      coche
                        ? 'border-shell-foreground bg-shell-foreground text-shell-raised'
                        : 'border-shell-muted/60 hover:border-shell-foreground'
                    )}
                  >
                    {coche && <Check className="size-2.5" strokeWidth={3.5} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </ListeSurlignee>

      {/* Hors de la liste surlignée — le pied du panneau, que la pastille ne
          peut pas atteindre. Ses boutons gardent donc leur propre fond, sans
          quoi ils seraient les seuls items du panneau sans retour au survol. */}
      <div className="border-t border-shell-border">
        {selection.length >= 2 && !vue && (
          <button
            type="button"
            onClick={() => {
              api.views.nommer();
              api.panels.close();
            }}
            className={cn(PIED, 'animate-in fade-in duration-150')}
          >
            <BookmarkPlus className="size-4 shrink-0" aria-hidden />
            Enregistrer cette vue…
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            api.openAccountsSettings();
            api.panels.close();
          }}
          className={PIED}
        >
          <Settings className="size-4 shrink-0" aria-hidden />
          Gérer les comptes…
        </button>
      </div>
    </div>
  );
}

const LIGNE = 'relative z-10 flex items-center';
const ZONE = 'flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left text-[12px]';
const PIED =
  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] text-shell-muted transition-colors hover:bg-shell-hover hover:text-shell-foreground';
// Le flou seul laisserait deviner la longueur d'un nom : on le double d'un
// léger resserrement des lettres.
const FLOU = 'blur-[5px] tracking-tight select-none';

function Pastille({ n }: { n: number }) {
  return (
    <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[9px] leading-[15px] font-bold text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

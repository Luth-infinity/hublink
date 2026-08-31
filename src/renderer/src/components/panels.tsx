import * as React from 'react';
import { Check, FileDown, FolderOpen, Search, Settings, Trash2, Users, X } from 'lucide-react';
import type { Account, Download, HistoryEntry } from '@/types';
import { cn, hostOf } from '@/lib/utils';
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
 * Sélecteur de compte.
 *
 * Il passait par un menu natif, faute de pouvoir dessiner au-dessus de la
 * page. Le calque lève cette contrainte : le menu suit désormais l'habillage
 * de l'application, et se comporte pareil sur les deux systèmes.
 */
export function AccountsPanel({
  accounts,
  activeAccountId,
  unreadByAccount,
  discreet
}: {
  accounts: Account[];
  activeAccountId: string | null;
  unreadByAccount: Record<string, number>;
  discreet: boolean;
}) {
  const total = accounts.reduce((n, a) => n + (unreadByAccount[a.id] || 0), 0);

  const Ligne = ({
    actif,
    children,
    onClick
  }: {
    actif: boolean;
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      data-surlignable
      className={cn(
        'relative z-10 flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors',
        actif && 'bg-shell-active'
      )}
    >
      {children}
      {actif && <Check className="size-3.5 shrink-0 text-shell-foreground" aria-hidden />}
    </button>
  );

  return (
    <div role="dialog" aria-label="Comptes" className={cn(CADRE, 'max-h-[420px] w-[260px]')}>
      <ListeSurlignee className="min-h-0 flex-1 overflow-y-auto py-1">
        <ul>
        <li>
          <Ligne
            actif={activeAccountId === null}
            onClick={() => {
              api.accounts.filter(null);
              api.panels.close();
            }}
          >
            <Users className="size-4 shrink-0 text-shell-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-shell-foreground">Tous les comptes</span>
            {total > 0 && <Pastille n={total} />}
          </Ligne>
        </li>

        <li aria-hidden className="my-1 border-t border-shell-border" />

        {accounts.map((compte) => {
          // En mode discrétion, les comptes autres que celui affiché sont
          // floutés ici aussi : les révéler dans le sélecteur viderait la
          // fonction de son sens.
          const masque = discreet && compte.id !== activeAccountId;
          const nonLus = unreadByAccount[compte.id] || 0;
          return (
            <li key={compte.id}>
              <Ligne
                actif={compte.id === activeAccountId}
                onClick={() => {
                  api.accounts.filter(compte.id);
                  api.panels.close();
                }}
              >
                <AccountAvatar
                  account={compte}
                  className={cn('size-4 rounded', masque && 'blur-[4px]')}
                  textClassName="text-[7px]"
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-shell-foreground',
                    masque && 'blur-[5px] tracking-tight select-none'
                  )}
                >
                  {compte.name}
                </span>
                {nonLus > 0 && <Pastille n={nonLus} />}
              </Ligne>
            </li>
          );
        })}
        </ul>
      </ListeSurlignee>

      <div className="border-t border-shell-border">
        <button
          type="button"
          onClick={() => {
            api.openAccountsSettings();
            api.panels.close();
          }}
          /* Hors de la liste surlignée — il est dans le pied du panneau, que la
             pastille ne peut pas atteindre. Il garde donc son propre fond, sans
             quoi il serait le seul item du panneau sans retour au survol. */
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] text-shell-muted transition-colors hover:bg-shell-hover hover:text-shell-foreground"
        >
          <Settings className="size-4 shrink-0" aria-hidden />
          Gérer les comptes…
        </button>
      </div>
    </div>
  );
}

function Pastille({ n }: { n: number }) {
  return (
    <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[9px] leading-[15px] font-bold text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

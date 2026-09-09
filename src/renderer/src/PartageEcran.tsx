import * as React from 'react';
import { cn } from '@/lib/utils';
import { AppWindow, Monitor, X } from 'lucide-react';
import { useSyncedTheme } from '@/lib/theme';
import type { SourcePartage } from '@/types';

const api = window.hublink;

/**
 * Le choix de ce qu'on partage.
 *
 * Chromium montrerait sa propre liste ; Electron n'en a pas, et sans elle une
 * webapp de visioconférence ne propose même pas le partage. Celle-ci la
 * remplace : les écrans d'abord, les fenêtres ensuite, avec leur aperçu — on
 * reconnaît une fenêtre à ce qu'elle affiche, pas à son titre.
 */
export default function PartageEcran() {
  const [liste, setListe] = React.useState<SourcePartage[]>([]);
  const [origine, setOrigine] = React.useState('');
  const [choisi, setChoisi] = React.useState<string | null>(null);
  useSyncedTheme();

  React.useEffect(
    () =>
      api.partage.onSources(({ liste: l, origine: o }) => {
        setListe(l);
        setOrigine(o);
        setChoisi(l.find((s) => s.ecran)?.id ?? l[0]?.id ?? null);
      }),
    []
  );

  const partager = React.useCallback((id: string | null) => api.partage.choisir(id), []);

  React.useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') partager(null);
      if (e.key === 'Enter' && choisi) partager(choisi);
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [choisi, partager]);

  const ecrans = liste.filter((s) => s.ecran);
  const fenetres = liste.filter((s) => !s.ecran);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-shell-border bg-shell text-shell-foreground shadow-2xl">
      <header className="deplacable flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight">Partager votre écran</h1>
          <p className="mt-0.5 truncate text-xs text-shell-muted">
            {origine ? `${origine} demande à voir ce que vous choisirez.` : 'Choisissez ce qui sera visible.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => partager(null)}
          aria-label="Annuler"
          className="cliquable grid size-7 shrink-0 place-items-center rounded-md text-shell-muted transition-colors hover:bg-shell-hover hover:text-shell-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
        <Groupe titre="Votre écran" icone={<Monitor className="size-3.5" />} sources={ecrans}>
          {(s) => <Vignette key={s.id} source={s} actif={s.id === choisi} onChoisir={setChoisi} onValider={partager} />}
        </Groupe>
        <Groupe titre="Une fenêtre" icone={<AppWindow className="size-3.5" />} sources={fenetres}>
          {(s) => <Vignette key={s.id} source={s} actif={s.id === choisi} onChoisir={setChoisi} onValider={partager} />}
        </Groupe>
        {!liste.length && (
          <p className="py-16 text-center text-sm text-shell-muted">Rien à partager pour le moment.</p>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-shell-border px-5 py-3">
        <button
          type="button"
          onClick={() => partager(null)}
          className="rounded-md px-3 py-1.5 text-sm text-shell-muted transition-colors hover:bg-shell-hover hover:text-shell-foreground"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={!choisi}
          onClick={() => partager(choisi)}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:pointer-events-none disabled:opacity-40"
        >
          Partager
        </button>
      </footer>
    </div>
  );
}

function Groupe({
  titre,
  icone,
  sources,
  children
}: {
  titre: string;
  icone: React.ReactNode;
  sources: SourcePartage[];
  children: (s: SourcePartage) => React.ReactNode;
}) {
  if (!sources.length) return null;
  return (
    <section className="pt-3">
      <h2 className="flex items-center gap-1.5 px-0.5 pb-2 text-[11px] font-medium uppercase tracking-wide text-shell-muted">
        {icone}
        {titre}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">{sources.map(children)}</div>
    </section>
  );
}

function Vignette({
  source,
  actif,
  onChoisir,
  onValider
}: {
  source: SourcePartage;
  actif: boolean;
  onChoisir: (id: string) => void;
  onValider: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChoisir(source.id)}
      onDoubleClick={() => onValider(source.id)}
      title={source.nom}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
        actif ? 'border-primary bg-shell-active' : 'border-shell-border hover:bg-shell-hover'
      )}
    >
      {/* L'aperçu porte le choix : un titre de fenêtre ne dit pas grand-chose,
          et deux fenêtres du même logiciel portent souvent le même. */}
      <span className="grid aspect-video place-items-center overflow-hidden bg-black/40">
        <img src={source.apercu} alt="" className="max-h-full max-w-full object-contain" />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 px-2.5 py-2">
        {source.icone ? (
          <img src={source.icone} alt="" className="size-4 shrink-0" />
        ) : (
          <Monitor className="size-4 shrink-0 text-shell-muted" />
        )}
        <span className="truncate text-xs">{source.nom}</span>
      </span>
    </button>
  );
}

import * as React from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const api = window.hublink;
const bouton = 'text-shell-muted hover:bg-shell-active hover:text-shell-foreground';

/**
 * Recherche dans la page, en bas de la zone comme dans Firefox : rien ne peut
 * flotter au-dessus de la vue native, et une barre en bas ne fait que raccourcir
 * la page au lieu de la décaler. `appel` change à chaque Ctrl+F, pour reprendre
 * le champ si la barre était déjà ouverte.
 */
export function Recherche({ appel, onClose }: { appel: number; onClose: () => void }) {
  const champ = React.useRef<HTMLInputElement>(null);
  const [texte, setTexte] = React.useState('');
  const [resultat, setResultat] = React.useState({ actif: 0, total: 0 });

  React.useEffect(() => api.find.onResultat(setResultat), []);
  React.useEffect(() => {
    champ.current?.focus();
    champ.current?.select();
  }, [appel]);

  const aller = (arriere: boolean) => texte && api.find.chercher(texte, { arriere });
  const fermer = () => {
    api.find.arreter();
    onClose();
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-t border-shell-border bg-shell-raised px-2">
      <div className="flex h-7 w-72 items-center gap-2 rounded-md bg-shell-input px-2.5">
        <Search className="size-3.5 shrink-0 text-shell-muted" />
        <input
          ref={champ}
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            api.find.chercher(e.target.value, { nouvelle: true });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') aller(e.shiftKey);
            if (e.key === 'Escape') fermer();
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder={t('Rechercher dans la page')}
          aria-label={t('Rechercher dans la page')}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-shell-foreground outline-none placeholder:text-shell-muted"
        />
        {texte && (
          <span className="shrink-0 text-[11px] tabular-nums text-shell-muted" aria-live="polite">
            {resultat.total ? `${resultat.actif}/${resultat.total}` : t('Aucun résultat')}
          </span>
        )}
      </div>
      <Button variant="ghost" size="icon-sm" disabled={!resultat.total} onClick={() => aller(true)} className={bouton} aria-label={t('Résultat précédent')} title={t('Résultat précédent')}>
        <ChevronUp />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={!resultat.total} onClick={() => aller(false)} className={bouton} aria-label={t('Résultat suivant')} title={t('Résultat suivant')}>
        <ChevronDown />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={fermer} className={`ml-auto ${bouton}`} aria-label={t('Fermer la recherche')} title={t('Fermer la recherche')}>
        <X />
      </Button>
    </div>
  );
}

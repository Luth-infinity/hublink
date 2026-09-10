import * as React from 'react';
import { Clock, Globe, Search, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EtatSuggestions, Suggestion } from '@/types';

const api = window.hublink;

const ICONES = {
  recherche: Search,
  adresse: Globe,
  historique: Clock,
  favori: Star
} as const;

// Hauteur fixe des lignes : la hauteur de la liste s'en déduit, ce qui permet
// de l'animer — une hauteur « automatique » ne se transitionne pas.
const LIGNE = 32;
const MARGE = 4;
const DUREE_FERMETURE = 130;

/**
 * La clé d'une ligne, qui décide si elle est gardée ou recréée.
 *
 * La saisie garde la même alors que son texte change. Les suggestions du
 * moteur sont tenues par leur rang : leur texte change à chaque lettre, et les
 * recréer rejouait leur apparition sur six lignes à la fois — c'est ce qui
 * clignotait. Mises à jour sur place, elles changent de mot sans bouger. Les
 * favoris et l'historique, eux, désignent une page précise.
 */
function clesDes(items: Suggestion[]) {
  let rang = 0;
  return items.map((item, index) => {
    if (index === 0) return 'saisie';
    if (item.type === 'recherche') return `moteur-${rang++}`;
    return `${item.type}|${item.url ?? item.libelle}`;
  });
}

/**
 * La liste des suggestions, dessinée sous la barre d'adresse.
 *
 * Elle vit dans le calque et non dans la fenêtre principale : elle doit passer
 * par-dessus la page, qui est une vue native. Le clavier reste dans le champ —
 * les flèches et Entrée sont relayées au processus principal, qui tient la
 * liste. Ici on la montre, on l'anime, et on répond à la souris.
 */
export function Suggestions({ etat }: { etat: EtatSuggestions | null }) {
  // La dernière liste montrée survit un instant à sa fermeture, le temps de
  // s'effacer : disparaître d'un coup se lit comme un clignotement.
  const [montree, setMontree] = React.useState<EtatSuggestions | null>(etat);
  const [seFerme, setSeFerme] = React.useState(false);

  React.useEffect(() => {
    if (etat && etat.items.length) {
      setMontree(etat);
      setSeFerme(false);
      return;
    }
    setSeFerme(true);
    const t = setTimeout(() => setMontree(null), DUREE_FERMETURE);
    return () => clearTimeout(t);
  }, [etat]);

  if (!montree) return null;
  const { ancre, items, actif, texte } = montree;
  const cles = clesDes(items);

  return (
    <div
      // Pendant qu'elle s'efface, la liste ne compte plus pour le pointeur : le
      // calque ne doit pas avaler un clic destiné à la page.
      data-suggestions={seFerme ? undefined : ''}
      role="listbox"
      aria-label="Suggestions"
      className={cn(
        'liste-suggestions fixed overflow-hidden rounded-lg border border-shell-border bg-shell-raised text-shell-foreground shadow-xl',
        seFerme ? 'se-ferme pointer-events-none' : 'pointer-events-auto'
      )}
      style={{
        top: ancre.y + ancre.height + 4,
        left: ancre.x,
        width: ancre.width,
        height: MARGE * 2 + items.length * LIGNE
      }}
    >
      <div
        aria-hidden
        className="surligne-suggestion absolute inset-x-1 rounded-md bg-shell-active"
        style={{ top: MARGE, height: LIGNE, transform: `translateY(${actif * LIGNE}px)` }}
      />
      <div className="relative" style={{ paddingTop: MARGE }}>
        {items.map((item, i) => {
          const Icone = ICONES[item.type] ?? Search;
          return (
            <button
              key={cles[i]}
              type="button"
              role="option"
              aria-selected={i === actif}
              // La souris déplace la sélection comme les flèches : les deux
              // désignent toujours la même ligne, et le fond glisse jusqu'à elle.
              onMouseEnter={() => api.suggestions.survoler(i)}
              // `mousedown` et non `click` : le champ perdrait le focus entre
              // les deux, et la liste se refermerait avant d'avoir été choisie.
              onMouseDown={(e) => {
                e.preventDefault();
                api.suggestions.choisir(i);
              }}
              className={cn(
                'ligne-suggestion flex w-full min-w-0 items-center gap-2.5 px-3.5 text-left text-xs',
                'transition-[opacity,transform] duration-150 active:scale-[0.99]',
                // Une suggestion de la frappe d'avant reste lisible, mais en
                // retrait : elle attend d'être remplacée.
                item.perime ? 'opacity-45' : 'opacity-100'
              )}
              style={{ height: LIGNE }}
            >
              <Icone
                className={cn('size-3.5 shrink-0', item.type === 'favori' ? 'text-amber-500' : 'text-shell-muted')}
              />
              <span className="min-w-0 flex-1 truncate">
                <Surligne texte={item.libelle} motif={texte} />
              </span>
              {item.detail && <span className="shrink-0 truncate pl-3 text-[11px] text-shell-muted">{item.detail}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Met en valeur ce qui complète la frappe, et non ce qu'on a déjà tapé : c'est
 * la suite qu'on cherche des yeux en parcourant la liste.
 */
function Surligne({ texte, motif }: { texte: string; motif: string }) {
  const debut = texte.toLowerCase().indexOf(motif.trim().toLowerCase());
  if (!motif.trim() || debut !== 0) return <>{texte}</>;
  const n = motif.trim().length;
  return (
    <>
      <span className="text-shell-muted">{texte.slice(0, n)}</span>
      <span className="font-medium">{texte.slice(n)}</span>
    </>
  );
}

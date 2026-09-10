import * as React from 'react';
import { Clock, Globe, Search, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EtatSuggestions } from '@/types';

const api = window.hublink;

const ICONES = {
  recherche: Search,
  adresse: Globe,
  historique: Clock,
  favori: Star
} as const;

/**
 * La liste des suggestions, dessinée sous la barre d'adresse.
 *
 * Elle vit dans le calque et non dans la fenêtre principale : elle doit passer
 * par-dessus la page, qui est une vue native. Le clavier, lui, reste dans le
 * champ — les flèches et Entrée sont relayées au processus principal, qui tient
 * la liste. Ici on ne fait que la montrer et répondre à la souris.
 */
export function Suggestions({ etat }: { etat: EtatSuggestions }) {
  const { ancre, items, actif, texte } = etat;
  if (!items.length) return null;

  return (
    <div
      data-suggestions
      role="listbox"
      aria-label="Suggestions"
      className="ouvre-panneau pointer-events-auto fixed origin-top overflow-hidden rounded-lg border border-shell-border bg-shell-raised py-1 text-shell-foreground shadow-xl"
      style={{
        top: ancre.y + ancre.height + 6,
        left: Math.max(6, ancre.x - 8),
        width: Math.max(320, Math.min(640, ancre.width + 16))
      }}
    >
      {items.map((item, i) => {
        const Icone = ICONES[item.type] ?? Search;
        return (
          <button
            key={`${item.type}:${item.url ?? item.libelle}:${i}`}
            type="button"
            role="option"
            aria-selected={i === actif}
            // La souris déplace la sélection comme les flèches : les deux
            // doivent toujours désigner la même ligne.
            onMouseEnter={() => api.suggestions.survoler(i)}
            // `mousedown` et non `click` : le champ perdrait le focus entre les
            // deux, et la liste se refermerait avant d'avoir été choisie.
            onMouseDown={(e) => {
              e.preventDefault();
              api.suggestions.choisir(i);
            }}
            className={cn(
              'flex w-full min-w-0 items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors',
              i === actif ? 'bg-shell-active' : 'hover:bg-shell-hover'
            )}
          >
            <Icone
              className={cn(
                'size-3.5 shrink-0',
                item.type === 'favori' ? 'text-amber-500' : 'text-shell-muted'
              )}
            />
            <span className="min-w-0 flex-1 truncate">
              <Surligne texte={item.libelle} motif={texte} />
            </span>
            {item.detail && <span className="shrink-0 truncate text-[11px] text-shell-muted">{item.detail}</span>}
          </button>
        );
      })}
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

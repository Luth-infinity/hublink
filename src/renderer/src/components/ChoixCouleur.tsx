import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { parseHex, repereLisible, teinteDe, teinteVive, useThemeSombre } from '@/lib/couleur';

export const COULEURS = [
  '#3b82f6',
  '#c8a44d',
  '#8b5cf6',
  '#f97316',
  '#10b981',
  '#ef4444',
  '#eab308',
  '#ec4899',
  '#06b6d4',
  '#64748b',
  // Seconde rangée, plus soutenue : au-delà de dix clients, deux comptes
  // finissaient par partager une couleur. Pas de noir : il ne teinterait
  // rien en thème sombre.
  '#1e40af',
  '#b45309',
  '#7e22ce',
  '#16a34a',
  '#0f766e',
  '#9f1239',
  '#65a30d',
  '#d946ef',
  '#0369a1',
  '#78716c'
];

// Le rail du curseur de teinte : les teintes vives, à luminosité égale.
const ARC_EN_CIEL = `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => teinteVive(i * 30)).join(', ')})`;

/** Ce que devient le repère du compte dans le panneau, s'il doit changer. */
function ajustement(couleur: string, sombre: boolean) {
  const enClair = repereLisible(couleur, false) !== couleur;
  const enSombre = repereLisible(couleur, true) !== couleur;
  const phrase = (theme: 'clair' | 'sombre') =>
    theme === 'sombre'
      ? 'En thème sombre, son repère dans le panneau sera un peu plus clair pour rester visible.'
      : 'En thème clair, son repère dans le panneau sera un peu plus foncé pour rester visible.';
  // Le thème courant d'abord : c'est celui que l'utilisateur a sous les yeux.
  if (sombre && enSombre) return phrase('sombre');
  if (!sombre && enClair) return phrase('clair');
  if (enClair) return phrase('clair');
  if (enSombre) return phrase('sombre');
  return null;
}

type Props = {
  /** `null` : aucune couleur choisie (le neutre du mode navigateur). */
  valeur: string | null;
  onChange: (couleur: string) => void;
  /** Les comptes ont un repère dans le panneau ; le mode navigateur, non. */
  avecRepere?: boolean;
  /** Une pastille à placer devant les autres, comme le neutre des réglages. */
  avant?: React.ReactNode;
};

/** Les pastilles, un curseur de teinte et le code : n'importe quelle couleur. */
export function ChoixCouleur({ valeur, onChange, avecRepere = false, avant }: Props) {
  // Le champ garde ce qu'on tape, même incomplet ; la couleur ne suit qu'une
  // valeur valide.
  const [saisie, setSaisie] = React.useState(valeur ?? '');
  const sombre = useThemeSombre();
  React.useEffect(() => setSaisie(valeur ?? ''), [valeur]);

  const note = avecRepere && valeur ? ajustement(valeur, sombre) : null;

  return (
    <div className="grid gap-2">
      <div className="flex items-start gap-2">
        {avant}
        <div className="grid w-fit grid-cols-10 gap-2">
          {COULEURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={`Couleur ${c}`}
              aria-pressed={valeur === c}
              className={cn(
                'size-7 rounded-full transition-transform',
                valeur === c
                  ? 'scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background'
                  : 'hover:scale-105'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={359}
          value={valeur ? teinteDe(valeur) : 0}
          onChange={(e) => onChange(teinteVive(Number(e.target.value)))}
          aria-label="Teinte personnalisée"
          className="teinte min-w-0 flex-1"
          style={{ background: ARC_EN_CIEL, ['--teinte' as string]: valeur ?? 'transparent' }}
        />
        <Input
          value={saisie}
          onChange={(e) => {
            const brut = e.target.value.trim();
            setSaisie(brut);
            const hex = brut.startsWith('#') ? brut : `#${brut}`;
            if (parseHex(hex)) onChange(hex.toLowerCase());
          }}
          onBlur={() => setSaisie(valeur ?? '')}
          placeholder="#rrggbb"
          aria-label="Code de la couleur"
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          className="h-8 w-24 font-mono text-xs"
        />
      </div>
      {/* La place de la note est toujours réservée : qu'elle paraisse ou non,
          la fenêtre ne change pas de hauteur sous le curseur. */}
      {avecRepere && (
        <p className="min-h-8 text-xs text-muted-foreground" aria-live="polite">
          {note}
        </p>
      )}
    </div>
  );
}

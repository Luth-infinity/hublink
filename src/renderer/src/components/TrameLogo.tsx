import * as React from 'react';

/**
 * Le logo de Trame : quatre carrés de fils, tour à tour horizontaux et
 * verticaux — le motif de la vannerie. Il porte toujours le dégradé de l'IA,
 * c'est ce qui le distingue des autres icônes de la barre.
 *
 * Le dégradé est calé sur la grille de l'icône (`userSpaceOnUse`) : réglé sur
 * la boîte de chaque trait, il ne se dessinerait pas, un trait droit n'ayant
 * ni hauteur ni largeur.
 */
export function TrameLogo({ className }: { className?: string }) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset=".5" stopColor="#3fa9ff" />
          <stop offset="1" stopColor="#3ee6c4" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${id})`} strokeWidth="2.3" strokeLinecap="round">
        <path d="M3.5 5H10.5M3.5 9.5H10.5" />
        <path d="M14.5 3.5V10.5M19 3.5V10.5" />
        <path d="M5 13.5V20.5M9.5 13.5V20.5" />
        <path d="M13.5 14.5H20.5M13.5 19H20.5" />
      </g>
    </svg>
  );
}

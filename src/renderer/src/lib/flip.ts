import * as React from 'react';

/**
 * Anime le déplacement des éléments d'une liste — technique FLIP : on retient
 * la position d'avant, on laisse le DOM se replacer, puis on rejoue l'écart à
 * l'envers pour que l'œil suive la ligne au lieu de la voir sauter.
 *
 * Une transition CSS ne suffirait pas : l'ordre ne change pas au moment du
 * clic, mais au retour de l'aller-retour IPC, et les lignes ne bougent pas
 * elles-mêmes — c'est le flux du document qui les repositionne.
 */
export function useFlip(orderKey: string) {
  const elements = React.useRef(new Map<string, HTMLElement>());
  const positions = React.useRef(new Map<string, DOMRect>());
  const derniereCle = React.useRef(orderKey);

  const register = React.useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) elements.current.set(id, el);
      else elements.current.delete(id);
    },
    []
  );

  // Sans tableau de dépendances : les positions doivent rester fraîches à
  // chaque rendu, sinon un repli suivi d'un déplacement animerait depuis des
  // coordonnées périmées. Seul le changement d'ordre déclenche l'animation.
  React.useLayoutEffect(() => {
    const bouge = derniereCle.current !== orderKey;
    derniereCle.current = orderKey;

    const anime =
      bouge && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const suivantes = new Map<string, DOMRect>();
    for (const [id, el] of elements.current) {
      const apres = el.getBoundingClientRect();
      suivantes.set(id, apres);
      if (!anime) continue;
      const avant = positions.current.get(id);
      if (!avant) continue;
      const dx = avant.left - apres.left;
      const dy = avant.top - apres.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
      );
    }
    positions.current = suivantes;
  });

  return register;
}

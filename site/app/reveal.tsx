'use client';

import { useEffect } from 'react';

/**
 * Révèle les sections au défilement.
 *
 * Deux garde-fous, parce qu'une page vitrine ne doit jamais rester vide :
 * l'état visible est le défaut en CSS tant que `.js` n'est pas posée, et un
 * délai de sécurité affiche tout si l'observateur n'a rien signalé.
 */
export function Reveal() {
  useEffect(() => {
    const targets = [...document.querySelectorAll<HTMLElement>('.reveal')];
    const show = (el: HTMLElement) => {
      el.dataset.visible = 'true';
    };

    // Ce qui est déjà à l'écran au chargement s'affiche sans attendre un
    // événement de défilement qui pourrait ne jamais venir.
    targets.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) show(el);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );
    targets.forEach((el) => observer.observe(el));

    const failsafe = window.setTimeout(() => targets.forEach(show), 4000);
    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return null;
}

'use client';

import * as React from 'react';

/** Dans l'ordre de la page : la dernière franchie est celle qu'on lit. */
const SECTIONS = [
  'pourquoi',
  'fonctions',
  'chiffres',
  'discretion',
  'sombre',
  'a-savoir',
  'versions',
  'telecharger',
  'soutenir'
];

type Props = {
  href: string;
  hrefLang: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Lien vers l'autre langue, qui retombe où l'on était.
 *
 * Changer de langue change de page : sans cela, quelqu'un arrivé au bas du
 * site se retrouvait renvoyé tout en haut. On repère la section en cours de
 * lecture et on la vise dans l'autre version — plutôt qu'un décalage en
 * pixels, qui ne vaudrait rien puisque les textes n'ont pas la même longueur
 * d'une langue à l'autre.
 */
export function LangLink({ href, hrefLang, className, children }: Props) {
  // Le saut d'ancre natif se perd à l'arrivée : `scroll-behavior: smooth` en
  // fait une animation que le chargement interrompt, et la mise en page bouge
  // encore pendant que les images et les polices se posent. Plutôt que de
  // rejouer le même saut à l'aveugle, on mesure l'écart restant et on le
  // corrige jusqu'à ce qu'il se referme.
  React.useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;

    let arrete = false;
    // Si la personne prend la main, on cesse de la contrarier.
    const rendreLaMain = () => {
      arrete = true;
    };
    window.addEventListener('wheel', rendreLaMain, { passive: true, once: true });
    window.addEventListener('touchstart', rendreLaMain, { passive: true, once: true });
    window.addEventListener('keydown', rendreLaMain, { once: true });

    const debut = Date.now();
    const tic = window.setInterval(() => {
      const cible = document.getElementById(id);
      const ecart = cible ? cible.getBoundingClientRect().top : 0;
      const arrive = !cible || Math.abs(ecart) < 4;
      if (arrete || arrive || Date.now() - debut > 3000) {
        window.clearInterval(tic);
        return;
      }
      window.scrollBy({ top: ecart, behavior: 'instant' as ScrollBehavior });
    }, 100);

    return () => {
      window.clearInterval(tic);
      window.removeEventListener('wheel', rendreLaMain);
      window.removeEventListener('touchstart', rendreLaMain);
      window.removeEventListener('keydown', rendreLaMain);
    };
  }, []);

  const suivre = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // On ignore le clic milieu et les ouvertures dans un nouvel onglet.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    let courante = '';
    for (const id of SECTIONS) {
      const el = document.getElementById(id);
      if (!el) continue;
      // Une section compte comme atteinte dès que son haut passe le premier
      // tiers de l'écran : c'est ce qu'on a sous les yeux, pas ce qui arrive.
      if (el.getBoundingClientRect().top <= window.innerHeight * 0.3) courante = id;
    }

    if (!courante) return;
    e.preventDefault();
    window.location.href = `${href}#${courante}`;
  };

  return (
    <a href={href} hrefLang={hrefLang} onClick={suivre} className={className}>
      {children}
    </a>
  );
}

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

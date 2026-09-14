'use client';

import * as React from 'react';

type Langue = { code: string; libelle: string; href: string };

type Props = {
  langues: Langue[];
  locale: string;
  label: string;
  /** Classes du contour, qui porte le fond. */
  fond: string;
  /** Classes de la pastille qui marque la langue lue. */
  pastille: string;
  /**
   * Identifiants des sections de la page, dans l'ordre. Donnés, on retombe
   * dans l'autre langue sur la section qu'on était en train de lire.
   */
  sections?: string[];
};

// Le temps que la pastille glisse. On ne part qu'ensuite : la nouvelle page
// arrive avec la pastille déjà à sa place, rien ne saute.
const GLISSEMENT = 280;
// Au-delà, on part quand même : une transition qui ne se termine jamais (onglet
// en arrière-plan, pastille déjà en place) ne doit pas bloquer le lien.
const SECOURS = GLISSEMENT + 320;

/**
 * Bascule entre les langues du site.
 *
 * Chaque langue est une page à part : changer de langue recharge. La pastille
 * passait donc d'un côté à l'autre d'un coup, au moment où la page arrivait.
 * Elle glisse désormais d'abord, et la navigation suit.
 */
export function BasculeLangue({ langues, locale, label, fond, pastille, sections }: Props) {
  const [active, setActive] = React.useState(locale);
  const marque = React.useRef<HTMLSpanElement>(null);

  // Revenir en arrière rend la page telle qu'on l'a quittée, pastille comprise :
  // on la remet sur la langue de la page.
  React.useEffect(() => {
    const retour = (e: PageTransitionEvent) => e.persisted && setActive(locale);
    window.addEventListener('pageshow', retour);
    return () => window.removeEventListener('pageshow', retour);
  }, [locale]);

  // À l'arrivée, le saut vers la section visée se perd : `scroll-behavior:
  // smooth` en fait une animation que le chargement interrompt, et la mise en
  // page bouge encore pendant que les images et les polices se posent. On
  // mesure l'écart restant et on le corrige jusqu'à ce qu'il se referme.
  React.useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!sections || !id) return;

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
  }, [sections]);

  /** La section sous les yeux : son haut a passé le premier tiers de l'écran. */
  const sectionLue = () => {
    let courante = '';
    for (const id of sections ?? []) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.3) courante = id;
    }
    return courante;
  };

  const rang = Math.max(0, langues.findIndex((l) => l.code === active));

  const choisir = (e: React.MouseEvent<HTMLAnchorElement>, langue: Langue) => {
    // Clic milieu, ouverture dans un nouvel onglet : le lien fait son travail.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (langue.code === active) return;
    setActive(langue.code);
    // Mesurée au clic, pas au départ : pendant le glissement, on peut encore
    // faire défiler.
    const section = sectionLue();
    const adresse = section ? `${langue.href}#${section}` : langue.href;

    let parti = false;
    const partir = () => {
      if (parti) return;
      parti = true;
      window.location.href = adresse;
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return partir();
    // On part à la fin réelle du glissement, pas après un délai compté depuis le
    // clic : si la page est occupée au moment du clic, la pastille démarre en
    // retard, et un délai fixe coupait son mouvement en plein milieu.
    marque.current?.addEventListener('transitionend', partir, { once: true });
    window.setTimeout(partir, SECOURS);
  };

  return (
    <div className={`relative grid grid-cols-2 rounded-full p-0.5 ${fond}`} role="group" aria-label={label}>
      <span
        ref={marque}
        aria-hidden
        className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-full transition-transform duration-[280ms] ease-[cubic-bezier(0.3,0.7,0.2,1)] motion-reduce:transition-none ${pastille}`}
        style={{ transform: `translateX(${rang * 100}%)` }}
      />
      {langues.map((langue) => (
        <a
          key={langue.code}
          href={langue.href}
          hrefLang={langue.code}
          onClick={(e) => choisir(e, langue)}
          aria-current={langue.code === locale ? 'true' : undefined}
          className={`relative rounded-full px-2.5 py-1 text-center text-[13px] font-medium transition-colors duration-[280ms] motion-reduce:transition-none ${
            langue.code === active ? 'text-ink' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {langue.libelle}
        </a>
      ))}
    </div>
  );
}

import * as React from 'react';

/**
 * Un état qui bascule tout de suite, et que le vrai état vient confirmer.
 *
 * Presque toutes les bascules de l'interface passent par le processus
 * principal : l'état ne revient qu'après l'aller-retour IPC, parfois après le
 * chargement d'une vue. Un interrupteur branché directement dessus reste donc
 * immobile un instant, puis saute — on croit l'animation ratée alors qu'elle
 * n'a simplement pas eu de quoi s'exécuter.
 *
 * On affiche donc la valeur voulue dès le clic, et on se réaligne dès que la
 * valeur réelle arrive — y compris quand elle contredit le clic, si le
 * processus principal a refusé.
 */
export function useOptimiste<T>(valeurReelle: T, appliquer: (v: T) => void) {
  const [affichee, setAffichee] = React.useState(valeurReelle);
  React.useEffect(() => setAffichee(valeurReelle), [valeurReelle]);

  const changer = React.useCallback(
    (v: T) => {
      setAffichee(v);
      appliquer(v);
    },
    [appliquer]
  );

  return [affichee, changer] as const;
}

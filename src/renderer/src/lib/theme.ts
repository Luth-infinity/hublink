import * as React from 'react';

/**
 * Le process principal pilote `nativeTheme.themeSource`, ce qui fait basculer
 * `prefers-color-scheme` dans le renderer. On n'a donc qu'à suivre le media
 * query — le réglage « système » marche sans code supplémentaire.
 *
 * Retourne `true` en thème sombre : la teinte de compte se prépare différemment
 * selon le fond.
 */
export function useSyncedTheme() {
  const [isDark, setIsDark] = React.useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.classList.toggle('dark', query.matches);
      setIsDark(query.matches);
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return isDark;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toward = (rgb: [number, number, number], target: number, amount: number) =>
  `rgb(${rgb.map((c) => clamp(c + (target - c) * amount)).join(' ')})`;

/**
 * Prépare la couleur du compte pour le thème courant.
 *
 * Mélanger une couleur vive dans un fond sombre l'ÉCLAIRCIT au lieu de le
 * teinter : un vert à L≈0.70 remonte un charbon à L≈0.16. On rapproche donc la
 * teinte du noir avant le mélange en sombre, et du blanc en clair.
 *
 * Deux versions, car surfaces et filets n'ont pas le même besoin :
 * - `surface` doit rester quasi blanche / quasi noire ;
 * - `line` doit rester *visible* sans jamais devenir un trait foncé en clair,
 *   d'où un éclaircissement bien plus marqué de ce côté.
 */
export function accountTints(hex: string, isDark: boolean) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const target = isDark ? 0 : 255;
  return {
    surface: toward(rgb, target, isDark ? 0.5 : 0.18),
    line: toward(rgb, target, isDark ? 0.18 : 0.58)
  };
}

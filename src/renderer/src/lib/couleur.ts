import * as React from 'react';

/**
 * Une couleur de compte est choisie librement : on l'enregistre telle quelle,
 * et c'est à l'affichage qu'on la rend lisible. Deux besoins distincts :
 *
 * - la vignette garde la couleur exacte, ce sont ses initiales qui passent du
 *   blanc au sombre — un jaune vif sous des lettres blanches tombait à 1,9:1 ;
 * - les repères du panneau (fins traits sur le fond du shell) gardent leur
 *   teinte mais changent de luminosité jusqu'à 3:1, seuil WCAG des éléments
 *   graphiques. Un bleu marine disparaissait sur le fond sombre, un jaune sur
 *   le fond clair.
 *
 * La luminosité se règle en OKLCH, pas en HSL : à « 50 % » HSL, un jaune et un
 * bleu n'ont rien de commun à l'œil ; en OKLCH, L suit ce qu'on perçoit.
 */

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: Rgb) =>
  '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

const versLineaire = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const versSrgb = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function luminance(rgb: Rgb) {
  const [r, g, b] = rgb.map(versLineaire);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: Rgb, b: Rgb) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function versOklch(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(versLineaire);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** Hors de l'espace sRGB, `null` : c'est à l'appelant de réduire la chroma. */
function depuisOklch(L: number, C: number, h: number): Rgb | null {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  if (lin.some((v) => v < -1e-4 || v > 1 + 1e-4)) return null;
  return lin.map((v) => versSrgb(Math.max(0, Math.min(1, v)))) as Rgb;
}

/** La couleur la plus vive de cette teinte à cette luminosité. */
function dansLeGamut(L: number, C: number, h: number): Rgb {
  let c = C;
  for (let i = 0; i < 40; i++) {
    const rgb = depuisOklch(L, c, h);
    if (rgb) return rgb;
    c *= 0.9;
  }
  return depuisOklch(L, 0, h) ?? [0, 0, 0];
}

/** Une teinte vive, pour le curseur de la couleur personnalisée. */
export function teinteVive(degres: number) {
  return toHex(dansLeGamut(0.66, 0.2, (degres * Math.PI) / 180));
}

export function teinteDe(hex: string) {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [, , h] = versOklch(rgb);
  return Math.round(((h * 180) / Math.PI + 360) % 360);
}

// Le fond du panneau (`--shell-base` dans index.css), en clair et en sombre.
const FOND_CLAIR: Rgb = [252, 252, 253];
const FOND_SOMBRE: Rgb = [15, 16, 18];
const INITIALES_SOMBRES = '#18181b';
// Un peu au-dessus de 3:1 : le fond du shell se teinte quand on filtre un compte.
const SEUIL_REPERE = 3.2;

/** Les initiales à poser sur cette couleur : blanches tant qu'elles se lisent. */
export function initialesSur(hex: string) {
  const rgb = parseHex(hex);
  if (!rgb) return '#fff';
  return contraste(rgb, [255, 255, 255]) >= 3 ? '#fff' : INITIALES_SOMBRES;
}

const cache = new Map<string, string>();

/**
 * La couleur telle qu'on la montre en repère sur le panneau : inchangée si
 * elle s'y voit déjà, sinon éclaircie ou foncée juste ce qu'il faut, teinte
 * conservée.
 */
export function repereLisible(hex: string, isDark: boolean) {
  const cle = `${hex}|${isDark}`;
  const connu = cache.get(cle);
  if (connu) return connu;

  const rgb = parseHex(hex);
  const fond = isDark ? FOND_SOMBRE : FOND_CLAIR;
  let resultat = hex;
  if (rgb && contraste(rgb, fond) < SEUIL_REPERE) {
    const [L0, C, h] = versOklch(rgb);
    // En sombre on éclaircit, en clair on fonce : on cherche la luminosité la
    // plus proche de l'originale qui passe le seuil.
    let lo = isDark ? L0 : 0;
    let hi = isDark ? 1 : L0;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const passe = contraste(dansLeGamut(mid, C, h), fond) >= SEUIL_REPERE;
      if (isDark === passe) hi = mid;
      else lo = mid;
    }
    resultat = toHex(dansLeGamut(isDark ? hi : lo, C, h));
  }
  cache.set(cle, resultat);
  return resultat;
}

/** Suit le thème sans rien toucher au document, contrairement à `useSyncedTheme`. */
export function useThemeSombre() {
  const [sombre, setSombre] = React.useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const suivre = () => setSombre(query.matches);
    query.addEventListener('change', suivre);
    return () => query.removeEventListener('change', suivre);
  }, []);
  return sombre;
}

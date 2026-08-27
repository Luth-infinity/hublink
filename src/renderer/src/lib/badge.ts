/**
 * Dessine la pastille de non-lus pour la barre des tâches Windows.
 *
 * Le process principal n'a pas de canvas, et `setOverlayIcon` exige une vraie
 * image — là où macOS et Linux se contentent d'un nombre via `setBadgeCount`.
 */
export function drawOverlayBadge(total: number): string | null {
  if (total <= 0) return null;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  const label = total > 99 ? '99+' : String(total);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${label.length > 2 ? 13 : 18}px -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + 1);

  return canvas.toDataURL('image/png');
}

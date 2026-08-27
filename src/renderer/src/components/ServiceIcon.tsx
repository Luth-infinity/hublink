import * as React from 'react';
import { cn, initials } from '@/lib/utils';
import type { Service } from '@/types';

type Props = {
  service: Pick<Service, 'name' | 'favicon' | 'icon' | 'emoji'>;
  className?: string;
  textClassName?: string;
  /** Adapte le contraste de l'icône au thème. */
  isDark?: boolean;
};

// La luminance d'une icône ne change pas : on la calcule une fois par source.
const luminanceCache = new Map<string, number>();

/**
 * Luminance moyenne des pixels opaques, pour savoir si l'icône se noie dans le
 * fond. On ignore le transparent : un logo noir sur fond transparent doit être
 * jugé sur son trait, pas sur son vide.
 */
function measureLuminance(img: HTMLImageElement, key: string) {
  const known = luminanceCache.get(key);
  if (known !== undefined) return known;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0.5;
    ctx.drawImage(img, 0, 0, 16, 16);
    const { data } = ctx.getImageData(0, 0, 16, 16);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) continue;
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      count++;
    }
    const value = count ? sum / count : 0.5;
    luminanceCache.set(key, value);
    return value;
  } catch {
    return 0.5;
  }
}

/**
 * Icône du service : image choisie à la main, sinon emoji, sinon favicon,
 * sinon les initiales.
 *
 * `onError` seul ne suffit pas pour le repli : quand l'échec est déjà en cache,
 * l'image est `complete` avant que React n'attache l'écouteur, aucun événement
 * ne part et on garde le glyphe « image cassée ». On vérifie donc à l'attache.
 */
export function ServiceIcon({ service, className, textClassName, isDark = false }: Props) {
  const source = service.icon || service.favicon;
  const [failed, setFailed] = React.useState(false);
  const [filter, setFilter] = React.useState<string | undefined>();

  React.useEffect(() => {
    setFailed(false);
    setFilter(undefined);
  }, [source]);

  // Adaptation DOUCE : on ne retouche que le contraste, jamais la teinte — un
  // LinkedIn reste bleu, il cesse juste de disparaître ou de brûler.
  const adapt = React.useCallback(
    (img: HTMLImageElement) => {
      if (!source) return;
      const lum = measureLuminance(img, source);
      if (isDark && lum < 0.28) setFilter('brightness(1.85) contrast(1.05)');
      else if (!isDark && lum > 0.86) setFilter('brightness(0.82) contrast(1.12)');
      else setFilter(undefined);
    },
    [source, isDark]
  );

  if (service.emoji) {
    return (
      <span
        className={cn('grid shrink-0 place-items-center leading-none', className)}
        style={{ fontSize: 'min(72%, 1.1rem)' }}
        role="img"
        aria-label={service.name}
      >
        {service.emoji}
      </span>
    );
  }

  if (source && !failed) {
    return (
      <img
        ref={(node) => {
          if (!node) return;
          if (node.complete && node.naturalWidth === 0) setFailed(true);
          else if (node.complete) adapt(node);
        }}
        src={source}
        alt=""
        className={cn('shrink-0 rounded-sm object-contain', className)}
        style={filter ? { filter } : undefined}
        onError={() => setFailed(true)}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (img.naturalWidth === 0) setFailed(true);
          else adapt(img);
        }}
      />
    );
  }

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-sm bg-shell-active font-bold text-shell-foreground',
        textClassName,
        className
      )}
      aria-hidden
    >
      {initials(service.name)}
    </span>
  );
}

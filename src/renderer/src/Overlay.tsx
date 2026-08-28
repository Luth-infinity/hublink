import * as React from 'react';
import { Toaster, toast } from 'sonner';
import { useSyncedTheme } from '@/lib/theme';

const api = window.hublink;

/**
 * Calque des messages de l'application.
 *
 * Il vit dans une fenêtre à part, transparente et posée au-dessus de la
 * principale. C'est le seul moyen de dessiner par-dessus la page : une
 * WebContentsView est une vue NATIVE, elle se peint au-dessus du HTML du shell
 * quoi qu'on fasse. Un message affiché dans la fenêtre principale se retrouvait
 * donc systématiquement caché derrière la page.
 *
 * La fenêtre laisse passer les clics. On ne la rend réceptive que lorsque le
 * pointeur survole réellement un message : sans quoi elle intercepterait tous
 * les clics destinés à la page.
 */
export default function Overlay() {
  useSyncedTheme();
  const zone = React.useRef<HTMLDivElement>(null);
  const receptif = React.useRef(false);

  React.useEffect(
    () =>
      api.onToast(({ variant, message, action }) => {
        const options = action
          ? {
              action: {
                label: action.label,
                onClick: () => api.runToastAction(action)
              }
            }
          : undefined;
        if (variant === 'error') toast.error(message, options);
        else toast.success(message, options);
      }),
    []
  );

  // Le pointeur ne nous est signalé que parce que la fenêtre transmet ses
  // mouvements ; on bascule dès qu'il entre ou sort d'un message.
  React.useEffect(() => {
    const bouge = (e: MouseEvent) => {
      const sur = Boolean(
        zone.current && document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-sonner-toast]')
      );
      if (sur === receptif.current) return;
      receptif.current = sur;
      api.overlay.setInteractive(sur);
    };
    window.addEventListener('mousemove', bouge);
    return () => window.removeEventListener('mousemove', bouge);
  }, []);

  return (
    <div ref={zone} className="pointer-events-none h-full w-full">
      <Toaster theme="system" position="bottom-right" richColors closeButton />
    </div>
  );
}

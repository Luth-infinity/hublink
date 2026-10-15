import { Sparkles } from 'lucide-react';
import type { WhatsNew } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { locale, t } from '@/lib/i18n';

type Props = { notes: WhatsNew | null; onClose: () => void };

/** Les nouveautés de la version qu'on vient d'installer, montrées une fois. */
export function WhatsNewDialog({ notes, onClose }: Props) {
  const date = notes
    ? new Date(notes.date).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <Dialog open={notes !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> {t('Nouveautés de la {version}', { version: notes?.version ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('Publiée le {date}', { date })}</DialogDescription>
        </DialogHeader>

        <ul className="grid max-h-[50vh] gap-3 overflow-y-auto text-sm leading-relaxed">
          {notes?.points.map((point) => (
            <li key={point} className="border-l-2 border-border pl-3">
              {point}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => notes && window.hublink.openExternal(notes.page)}>
            {t('Voir sur GitHub')}
          </Button>
          <Button onClick={onClose}>{t("C'est noté")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

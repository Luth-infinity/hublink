import * as React from 'react';
import type { Account } from '@/types';
import { nomPropose } from '@/lib/selection';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AccountAvatar } from '@/components/AccountAvatar';

type Props = {
  open: boolean;
  /** Les comptes affichés au moment d'enregistrer. */
  comptes: Account[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
};

/**
 * Nommer la sélection de comptes affichée.
 *
 * Elle vit dans la fenêtre principale et non dans le panneau des comptes : le
 * calque qui dessine ce panneau ne prend jamais le clavier.
 */
export function ViewDialog({ open, comptes, onOpenChange, onSubmit }: Props) {
  const [name, setName] = React.useState('');

  // Pré-rempli avec les noms des comptes, et sélectionné : on garde la
  // proposition d'un Entrée, ou on la remplace en tapant.
  const propose = nomPropose(comptes);
  React.useEffect(() => {
    if (open) setName(propose);
  }, [open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Enregistrer la vue</DialogTitle>
            <DialogDescription>
              Elle rejoint le sélecteur de comptes, et se rouvre d'un clic ou avec ses flèches.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="view-name">Nom de la vue</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>Comptes affichés</Label>
            <ul className="flex flex-wrap gap-1.5">
              {comptes.map((compte) => (
                <li
                  key={compte.id}
                  className="flex items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2.5 pl-1 text-xs"
                >
                  <AccountAvatar account={compte} className="size-4 rounded-full" textClassName="text-[7px]" />
                  {compte.name}
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

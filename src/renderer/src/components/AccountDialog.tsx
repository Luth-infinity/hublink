import * as React from 'react';
import { ImagePlus, X } from 'lucide-react';
import type { Account } from '@/types';
import { cn } from '@/lib/utils';
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
import { parseHex, repereLisible, teinteDe, teinteVive, useThemeSombre } from '@/lib/couleur';

const COLORS = [
  '#3b82f6',
  '#c8a44d',
  '#8b5cf6',
  '#f97316',
  '#10b981',
  '#ef4444',
  '#eab308',
  '#ec4899',
  '#06b6d4',
  '#64748b',
  // Seconde rangée, plus soutenue : au-delà de dix clients, deux comptes
  // finissaient par partager une couleur. Pas de noir : il ne teinterait
  // rien en thème sombre.
  '#1e40af',
  '#b45309',
  '#7e22ce',
  '#16a34a',
  '#0f766e',
  '#9f1239',
  '#65a30d',
  '#d946ef',
  '#0369a1',
  '#78716c'
];

// Le rail du curseur de teinte : les teintes vives, à luminosité égale.
const ARC_EN_CIEL = `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => teinteVive(i * 30)).join(', ')})`;

/** Ce que devient le repère du compte dans le panneau, s'il doit changer. */
function ajustement(color: string, sombre: boolean) {
  const clair = repereLisible(color, false) !== color;
  const fonce = repereLisible(color, true) !== color;
  // Le thème courant d'abord : c'est celui que l'utilisateur a sous les yeux.
  if (sombre ? fonce : clair)
    return sombre
      ? 'En thème sombre, son repère dans le panneau sera un peu plus clair pour rester visible.'
      : 'En thème clair, son repère dans le panneau sera un peu plus foncé pour rester visible.';
  if (clair) return 'En thème clair, son repère dans le panneau sera un peu plus foncé pour rester visible.';
  if (fonce) return 'En thème sombre, son repère dans le panneau sera un peu plus clair pour rester visible.';
  return null;
}

type Props = {
  open: boolean;
  account: Account | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; color: string; avatar: string | null }) => void;
};

export function AccountDialog({ open, account, onOpenChange, onSubmit }: Props) {
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState(COLORS[0]);
  const [avatar, setAvatar] = React.useState<string | null>(null);
  // Le champ garde ce qu'on tape, même incomplet ; la couleur ne suit qu'une
  // valeur valide.
  const [saisie, setSaisie] = React.useState('');
  const sombre = useThemeSombre();

  React.useEffect(() => setSaisie(color), [color]);

  React.useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setColor(account?.color ?? COLORS[0]);
    setAvatar(account?.avatar ?? null);
  }, [open, account]);

  const pickAvatar = async () => {
    const picked = await window.hublink.accounts.pickAvatar();
    if (picked) setAvatar(picked);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), color, avatar });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{account ? 'Modifier le compte' : 'Nouveau compte'}</DialogTitle>
            <DialogDescription>
              Un compte est une session isolée. Les services qui le partagent restent connectés
              ensemble ; ceux d'un autre compte ne voient rien.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={pickAvatar}
                className="group relative block rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-label={avatar ? 'Remplacer le logo' : 'Ajouter un logo'}
              >
                <AccountAvatar
                  account={{ name, color, avatar }}
                  className="size-14 rounded-lg"
                  textClassName="text-lg"
                />
                <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <ImagePlus className="size-5 text-white" />
                </span>
              </button>
              {avatar && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  onClick={() => setAvatar(null)}
                  aria-label="Retirer le logo"
                  className="absolute -top-1.5 -right-1.5 rounded-full shadow"
                >
                  <X />
                </Button>
              )}
            </div>

            <div className="grid flex-1 gap-2">
              <Label htmlFor="account-name">Nom du compte</Label>
              <Input
                id="account-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Client A"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Clique sur la vignette pour importer un logo.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Couleur</Label>
            <div className="grid w-fit grid-cols-10 gap-2">
              {COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  aria-label={`Couleur ${value}`}
                  aria-pressed={color === value}
                  className={cn(
                    'size-7 rounded-full transition-transform',
                    color === value
                      ? 'scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background'
                      : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: value }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={359}
                value={teinteDe(color)}
                onChange={(e) => setColor(teinteVive(Number(e.target.value)))}
                aria-label="Teinte personnalisée"
                className="teinte min-w-0 flex-1"
                style={{ background: ARC_EN_CIEL, ['--teinte' as string]: color }}
              />
              <Input
                value={saisie}
                onChange={(e) => {
                  const brut = e.target.value.trim();
                  setSaisie(brut);
                  const hex = brut.startsWith('#') ? brut : `#${brut}`;
                  if (parseHex(hex)) setColor(hex.toLowerCase());
                }}
                onBlur={() => setSaisie(color)}
                aria-label="Code de la couleur"
                spellCheck={false}
                autoComplete="off"
                maxLength={7}
                className="h-8 w-24 font-mono text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sert d'avatar à défaut de logo, et donne sa teinte à l'interface quand tu filtres sur ce compte.
            </p>
            {ajustement(color, sombre) && (
              <p className="text-xs text-muted-foreground">{ajustement(color, sombre)}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {account ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

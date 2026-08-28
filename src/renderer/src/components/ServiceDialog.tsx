import * as React from 'react';
import { ImagePlus, Info, Plus, Smile, X } from 'lucide-react';
import type { Account, Service, ServiceInput } from '@/types';
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
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EMOJI_GROUPS } from '@/lib/emoji';
import { AccountAvatar } from '@/components/AccountAvatar';
import { ServiceIcon } from '@/components/ServiceIcon';

// Raccourcis pour les webapps qu'on ajoute le plus souvent.
const PRESETS = [
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: 'Outlook', url: 'https://outlook.office.com/mail/' },
  { name: 'Teams', url: 'https://teams.microsoft.com' },
  { name: 'Slack', url: 'https://app.slack.com/client' },
  { name: 'Drive', url: 'https://drive.google.com' },
  { name: 'SharePoint', url: 'https://www.office.com' },
  { name: 'Notion', url: 'https://www.notion.so' },
  { name: 'Jira', url: 'https://www.atlassian.com/software/jira' },
  { name: 'Figma', url: 'https://www.figma.com/files' },
  { name: 'Dashlane', url: 'https://app.dashlane.com' }
];

type Props = {
  open: boolean;
  service: Service | null;
  accounts: Account[];
  defaultAccountId: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ServiceInput) => void;
  onCreateAccount: () => void;
};

function normalizeUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function ServiceDialog({
  open,
  service,
  accounts,
  defaultAccountId,
  onOpenChange,
  onSubmit,
  onCreateAccount
}: Props) {
  const [name, setName] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [openLinks, setOpenLinks] = React.useState<'browser' | 'app'>('browser');
  const [spoofChrome, setSpoofChrome] = React.useState(true);
  const [blockPasskeys, setBlockPasskeys] = React.useState(true);
  const [icon, setIcon] = React.useState<string | null>(null);
  const [emoji, setEmoji] = React.useState<string | null>(null);
  const [notifications, setNotifications] = React.useState(true);
  const [keepAwake, setKeepAwake] = React.useState(false);
  const [pickingEmoji, setPickingEmoji] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(service?.name ?? '');
    setUrl(service?.url ?? '');
    setAccountId(service?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? '');
    setOpenLinks(service?.openLinks ?? 'browser');
    setSpoofChrome(service?.spoofChrome ?? true);
    setBlockPasskeys(service?.blockPasskeys ?? true);
    setIcon(service?.icon ?? null);
    setEmoji(service?.emoji ?? null);
    setNotifications(service?.notifications ?? true);
    setKeepAwake(service?.keepAwake ?? false);
    setPickingEmoji(false);
    setError(null);
  }, [open, service, defaultAccountId, accounts]);

  // Un compte créé pendant la saisie doit être sélectionné d'office.
  React.useEffect(() => {
    if (open && accounts.length && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[accounts.length - 1].id);
    }
  }, [accounts, accountId, open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const finalUrl = normalizeUrl(url);
    try {
      new URL(finalUrl);
    } catch {
      setError("Cette URL n'est pas valide.");
      return;
    }
    onSubmit({
      name: name.trim() || new URL(finalUrl).host,
      url: finalUrl,
      accountId,
      openLinks,
      spoofChrome,
      blockPasskeys,
      keepAwake,
      notifications,
      icon,
      emoji
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{service ? 'Modifier le service' : 'Ajouter un service'}</DialogTitle>
            <DialogDescription>
              Deux services d'un même compte partagent leur connexion, deux comptes ne se voient jamais.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="service-url">Adresse</Label>
              <Input
                id="service-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="mail.google.com"
                autoFocus
                aria-invalid={Boolean(error)}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="flex items-end gap-3">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    const picked = await window.hublink.services.pickIcon();
                    if (picked) {
                      setIcon(picked);
                      setEmoji(null);
                    }
                  }}
                  className="group relative block rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-label={icon ? "Remplacer l'icône" : "Choisir une icône"}
                  title={icon ? "Remplacer l'icône" : "Choisir une icône"}
                >
                  <ServiceIcon
                    service={{ name: name || '?', icon, emoji, favicon: service?.favicon ?? null }}
                    className="size-9 rounded-md"
                    textClassName="text-sm"
                  />
                  <span className="absolute inset-0 grid place-items-center rounded-md bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <ImagePlus className="size-4 text-white" />
                  </span>
                </button>
                {(icon || emoji) && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-xs"
                    onClick={() => {
                      setIcon(null);
                      setEmoji(null);
                    }}
                    aria-label="Revenir au favicon"
                    title="Revenir au favicon du site"
                    className="absolute -top-1.5 -right-1.5 rounded-full shadow"
                  >
                    <X />
                  </Button>
                )}
              </div>

              <div className="grid flex-1 gap-2">
                <Label htmlFor="service-name">Nom</Label>
                <Input
                  id="service-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Déduit du domaine si vide"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-expanded={pickingEmoji}
                onClick={() => setPickingEmoji((v) => !v)}
                title="Choisir un symbole"
                aria-label="Choisir un symbole"
              >
                <Smile />
              </Button>
            </div>

            {pickingEmoji && (
              <div className="grid gap-2 rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Pratique quand le site n'expose pas de favicon lisible.
                </p>
                {EMOJI_GROUPS.map((group) => (
                  <div key={group.label} className="grid gap-1">
                    <span className="text-[11px] font-medium text-muted-foreground">{group.label}</span>
                    <div className="flex flex-wrap gap-1">
                      {group.emojis.map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setEmoji(value);
                            setIcon(null);
                            setPickingEmoji(false);
                          }}
                          aria-pressed={emoji === value}
                          className={cn(
                            'grid size-8 place-items-center rounded-md text-lg transition-colors hover:bg-accent',
                            emoji === value && 'bg-accent ring-2 ring-ring'
                          )}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!service && (
              <div className="grid gap-2">
                <Label>Raccourcis</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.name}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => {
                        setName(preset.name);
                        setUrl(preset.url);
                        setError(null);
                      }}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Compte</Label>
              <div className="flex flex-wrap gap-1.5">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => setAccountId(account.id)}
                    aria-pressed={accountId === account.id}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                      accountId === account.id
                        ? 'border-ring bg-accent text-accent-foreground'
                        : 'border-border hover:bg-accent/50'
                    )}
                  >
                    <AccountAvatar account={account} className="size-4 rounded" textClassName="text-[7px]" />
                    {account.name}
                  </button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={onCreateAccount}
                >
                  <Plus /> Nouveau compte
                </Button>
              </div>
            </div>
          </div>

          {/* Une ligne par réglage, libellé à gauche et interrupteur à droite.
              Le détail passe en infobulle : quatre paragraphes empilés se
              lisaient moins bien qu'un intitulé qui se suffit à lui-même. */}
          <TooltipProvider>
          <div className="grid rounded-lg border border-border px-3">
            {(
              [
                {
                  id: 'open-in-app',
                  libelle: 'Ouvrir les liens dans Hublink',
                  aide: "Sinon les liens sortants partent vers votre navigateur habituel. Dans Hublink, ils s'ouvrent dans la session de ce compte.",
                  valeur: openLinks === 'app',
                  set: (v: boolean) => setOpenLinks(v ? 'app' : 'browser')
                },
                {
                  id: 'notifications',
                  libelle: 'Notifications système',
                  aide: "Coupé, ce service n'affiche plus de bulle hors de l'app. Le compteur de non-lus, lui, reste actif.",
                  valeur: notifications,
                  set: setNotifications
                },
                {
                  id: 'keep-awake',
                  libelle: 'Ne jamais mettre en veille',
                  suffixe: '≈ 110 Mo',
                  aide: "Un service en veille n'a plus de page ouverte : il ne peut plus signaler ses messages. Coché, celui-ci reste chargé en permanence et continue de compter.",
                  valeur: keepAwake,
                  set: setKeepAwake
                },
                {
                  id: 'block-passkeys',
                  libelle: "Refuser les clés d'accès",
                  aide: "Empêche Microsoft et consorts de proposer la clé d'accès de la session Windows ou macOS, qui n'est presque jamais le bon compte. Le site retombe sur le mot de passe.",
                  valeur: blockPasskeys,
                  set: setBlockPasskeys
                },
                {
                  id: 'spoof-chrome',
                  libelle: 'Se présenter comme Chrome',
                  aide: 'Nécessaire pour Teams, Meet et les portails qui refusent les navigateurs inconnus. À laisser activé sauf problème.',
                  valeur: spoofChrome,
                  set: setSpoofChrome
                }
              ] as const
            ).map((reglage, index) => (
              <div
                key={reglage.id}
                className={cn(
                  'flex items-center justify-between gap-4 py-2.5',
                  index > 0 && 'border-t border-border'
                )}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <Label htmlFor={reglage.id} className="cursor-pointer font-normal">
                    {reglage.libelle}
                  </Label>
                  {'suffixe' in reglage && (
                    <span className="text-xs text-muted-foreground">{reglage.suffixe}</span>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`À propos de « ${reglage.libelle} »`}
                        className="shrink-0 rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground"
                      >
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{reglage.aide}</TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  id={reglage.id}
                  checked={reglage.valeur}
                  onCheckedChange={reglage.set}
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
          </TooltipProvider>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!accountId}>
              {service ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

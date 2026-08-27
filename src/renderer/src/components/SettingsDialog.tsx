import * as React from 'react';
import { Monitor, Moon, Pencil, Plus, Sun, Timer, Trash2, TriangleAlert } from 'lucide-react';
import type { Account, AppState, Service, Theme } from '@/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountAvatar } from '@/components/AccountAvatar';
import { ExtensionsPanel } from '@/components/ExtensionsPanel';

const SLEEP_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60, 120];

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Système', icon: Monitor },
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon }
];

type Props = {
  open: boolean;
  /** Onglet ouvert : le pied de panneau amène directement à la bonne section. */
  tab: string;
  onTabChange: (tab: string) => void;
  state: AppState;
  account: Account | null;
  services: Service[];
  onOpenChange: (open: boolean) => void;
  onCreateAccount: () => void;
  onEditAccount: (account: Account) => void;
  onDeleteAccount: (account: Account) => void;
  onSetTheme: (theme: Theme) => void;
  onSetSleepDelay: (minutes: number) => void;
};

export function SettingsDialog({
  open,
  tab,
  onTabChange,
  state,
  account,
  services,
  onOpenChange,
  onCreateAccount,
  onEditAccount,
  onDeleteAccount,
  onSetTheme,
  onSetSleepDelay
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Paramètres</DialogTitle>
          <DialogDescription>Comptes, extensions et comportement de l'application.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={onTabChange} className="min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="comptes">Comptes</TabsTrigger>
            <TabsTrigger value="extensions">Extensions</TabsTrigger>
            <TabsTrigger value="apparence">Apparence</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="comptes" className="max-h-[54vh] overflow-y-auto pr-1">
            <p className="mb-3 text-sm text-muted-foreground">
              Un compte = une session isolée. Les services qui le partagent restent connectés ensemble —
              un seul login SSO pour la messagerie, l'intranet et les outils d'un même client. Sa couleur
              teinte l'interface quand on filtre dessus.
            </p>
            <ul className="flex flex-col gap-2">
              {state.accounts.map((item) => {
                const attached = state.services.filter((s) => s.accountId === item.id).length;
                return (
                  <li key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <AccountAvatar account={item} className="size-9 rounded-lg" textClassName="text-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {attached === 0 ? 'Aucun service' : `${attached} service${attached > 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Modifier ${item.name}`}
                      onClick={() => onEditAccount(item)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Supprimer ${item.name}`}
                      disabled={state.accounts.length <= 1}
                      onClick={() => onDeleteAccount(item)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button variant="outline" className="mt-3 w-full gap-2" onClick={onCreateAccount}>
              <Plus /> Nouveau compte
            </Button>
          </TabsContent>

          <TabsContent value="extensions" className="max-h-[54vh] overflow-y-auto pr-1">
            <ExtensionsPanel state={state} account={account} />
          </TabsContent>

          <TabsContent value="apparence" className="max-h-[54vh] overflow-y-auto pr-1">
            <div className="grid gap-2">
              <p className="text-sm font-medium">Thème</p>
              <div className="flex gap-2">
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    variant={state.theme === value ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2"
                    aria-pressed={state.theme === value}
                    onClick={() => onSetTheme(value)}
                  >
                    <Icon /> {label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                « Système » suit le réglage de macOS ou de Windows. La couleur du compte filtré teinte
                légèrement l'interface, dans les deux thèmes.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="max-h-[54vh] overflow-y-auto pr-1">
            <div className="grid gap-3">
              <div className="grid gap-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Timer className="size-4" /> Mise en veille des services inactifs
                </p>
                <p className="text-xs text-muted-foreground">
                  Chaque service ouvert est un processus complet, autour de 110 Mo. Les libérer quand on
                  ne les consulte plus évite de faire ramer la machine ; ils se rechargent au clic, sans
                  déconnexion.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SLEEP_CHOICES.map((minutes) => (
                  <Button
                    key={minutes}
                    variant={state.sleepAfterMinutes === minutes ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-3 text-xs"
                    aria-pressed={state.sleepAfterMinutes === minutes}
                    onClick={() => onSetSleepDelay(minutes)}
                  >
                    {minutes === 0 ? 'Jamais' : `${minutes} min`}
                  </Button>
                ))}
              </div>

              {state.sleepAfterMinutes === 0 && services.length > 4 && (
                <p className="flex items-start gap-2 rounded-md border border-border p-2 text-xs text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Avec {services.length} services et aucune mise en veille, l'app peut dépasser
                    {' '}{services.length * 110} Mo.
                  </span>
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}


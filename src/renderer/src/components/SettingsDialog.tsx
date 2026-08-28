import { Ban, Monitor, Moon, Pencil, Plus, Sun, Timer, Trash2, TriangleAlert } from 'lucide-react';
import type { Account, AppState, Service, Theme } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountAvatar } from '@/components/AccountAvatar';
import { ExtensionsPanel } from '@/components/ExtensionsPanel';
import { AboutPanel } from '@/components/AboutPanel';

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

// Les mêmes teintes que celles proposées pour les comptes, plus le neutre.
const ACCENTS: { nom: string; valeur: string | null }[] = [
  { nom: 'Neutre', valeur: null },
  { nom: 'Bleu', valeur: '#3b82f6' },
  { nom: 'Violet', valeur: '#8b5cf6' },
  { nom: 'Rose', valeur: '#ec4899' },
  { nom: 'Orange', valeur: '#f97316' },
  { nom: 'Ambre', valeur: '#f59e0b' },
  { nom: 'Vert', valeur: '#10b981' },
  { nom: 'Cyan', valeur: '#06b6d4' },
  { nom: 'Ardoise', valeur: '#64748b' }
];

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
      {/* Hauteur figée : sans elle, la fenêtre bondissait à chaque changement
          d'onglet, le contenu n'ayant pas la même longueur. Seule la zone de
          contenu défile. */}
      <DialogContent className="flex h-[min(620px,86vh)] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Paramètres</DialogTitle>
          <DialogDescription>Comptes, extensions et comportement de l'application.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={onTabChange} className="min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="general">Général</TabsTrigger>
            <TabsTrigger value="extensions">Extensions</TabsTrigger>
            <TabsTrigger value="apropos">À propos</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="min-h-0 overflow-y-auto pr-1 data-[state=inactive]:hidden">
            <section className="grid gap-3">
              <div className="grid gap-1">
                <h3 className="text-sm font-medium">Comptes</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Un compte = une session isolée. Les services qui le partagent restent connectés
                  ensemble — un seul login SSO pour la messagerie, l'intranet et les outils d'un même
                  client. Sa couleur teinte l'interface quand on filtre dessus.
                </p>
              </div>

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
              <Button variant="outline" className="w-full gap-2" onClick={onCreateAccount}>
                <Plus /> Nouveau compte
              </Button>
            </section>

            <Separator className="my-6" />

            <section className="grid gap-2">
              <h3 className="text-sm font-medium">Thème</h3>
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
              <p className="text-xs leading-relaxed text-muted-foreground">
                « Système » suit le réglage de macOS ou de Windows. La couleur du compte filtré teinte
                légèrement l'interface, dans les deux thèmes.
              </p>
            </section>

            <Separator className="my-6" />

            <section className="grid gap-3">
              <div className="grid gap-1">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Timer className="size-4" /> Mise en veille des services inactifs
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
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

              <Separator />

              <div className="grid gap-2">
                <h3 className="text-sm font-medium">Teinte du mode navigateur</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Le mode navigateur n'appartient à aucun compte : il n'a donc pas de couleur d'où
                  se teinter. Choisissez la sienne, ou laissez-le neutre.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENTS.map(({ nom, valeur }) => {
                    const actif = state.accentColor === valeur;
                    return (
                      <button
                        key={nom}
                        type="button"
                        onClick={() => window.hublink.setAccent(valeur)}
                        title={nom}
                        aria-label={nom}
                        aria-pressed={actif}
                        className={cn(
                          'size-6 rounded-full border transition-transform hover:scale-110',
                          actif ? 'border-foreground ring-2 ring-foreground/25' : 'border-border'
                        )}
                        style={valeur ? { backgroundColor: valeur } : undefined}
                      >
                        {!valeur && <Ban className="mx-auto size-3.5 text-muted-foreground" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div className="grid gap-1">
                  <h3 className="text-sm font-medium">Bloquer les publicités</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    En mode navigateur uniquement. Les requêtes vers les régies publicitaires et les
                    traceurs connus ne partent pas. Vos comptes et leurs services ne sont pas
                    concernés.
                  </p>
                </div>
                <Switch
                  checked={state.blockAds}
                  onCheckedChange={(on) => window.hublink.browser.setBlockAds(on)}
                  aria-label="Bloquer les publicités en mode navigateur"
                  className="mt-0.5 shrink-0"
                />
              </div>

              {state.sleepAfterMinutes === 0 && services.length > 4 && (
                <p className="flex items-start gap-2 rounded-md border border-border p-2 text-xs text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Avec {services.length} services et aucune mise en veille, l'app peut dépasser{' '}
                    {services.length * 110} Mo.
                  </span>
                </p>
              )}
            </section>
          </TabsContent>

          <TabsContent value="extensions" className="min-h-0 overflow-y-auto pr-1 data-[state=inactive]:hidden">
            {/* Le navigateur n'est pas un compte, mais il a sa propre session :
                on lui prête une fiche pour que les extensions s'y activent
                comme ailleurs. */}
            <ExtensionsPanel
              state={state}
              account={
                state.browserMode
                  ? { id: '__browser__', name: 'Mode navigateur', color: '#64748b' }
                  : account
              }
            />
          </TabsContent>

          <TabsContent value="apropos" className="min-h-0 overflow-y-auto pr-1 data-[state=inactive]:hidden">
            <AboutPanel />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

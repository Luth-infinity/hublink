import * as React from 'react';
import { FileArchive, FolderOpen, Loader2, Puzzle, Store, Trash2, TriangleAlert } from 'lucide-react';
import type { Account, AppState } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

/**
 * Permissions qu'Electron n'implémente pas. Une extension qui en dépend se
 * charge sans erreur mais reste inerte — mieux vaut le dire que laisser
 * l'utilisateur chercher pourquoi son bouton ne fait rien.
 */
const UNSUPPORTED: Record<string, string> = {
  nativeMessaging: 'dialogue avec une application native',
  downloads: 'téléchargements',
  contextMenus: 'menus contextuels',
  notifications: 'notifications',
  identity: 'connexion OAuth',
  alarms: 'minuteries',
  idle: 'détection d’inactivité',
  cookies: 'lecture des cookies',
  windows: 'gestion des fenêtres',
  desktopCapture: 'capture d’écran',
  tabCapture: 'capture d’onglet',
  offscreen: 'documents hors écran',
  sidePanel: 'panneau latéral',
  bookmarks: 'favoris',
  history: 'historique',
  proxy: 'proxy',
  webNavigation: 'suivi de navigation'
};

type Props = { state: AppState; account: Account | null };

export function ExtensionsPanel({ state, account }: Props) {
  const api = window.hublink;
  const [storeInput, setStoreInput] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);

  const run = async (label: string, task: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  };

  const install = () =>
    run('store', async () => {
      const record = await api.extensions.installFromStore(storeInput);
      if (record) setStoreInput('');
    });

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Installées pour tous les comptes, activables compte par compte. Electron ne reprend qu'une
        partie des API de Chrome : les extensions de contenu (bloqueurs, thèmes, correcteurs)
        fonctionnent, celles qui capturent l'écran, téléchargent des fichiers ou dialoguent avec une
        application native ne peuvent pas.
      </p>

      <div className="grid gap-2">
        <Label htmlFor="cws">Depuis le Chrome Web Store</Label>
        <div className="flex gap-2">
          <Input
            id="cws"
            value={storeInput}
            onChange={(e) => setStoreInput(e.target.value)}
            placeholder="URL du Store ou identifiant (32 lettres)"
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !storeInput.trim()) return;
              e.preventDefault();
              install();
            }}
          />
          <Button disabled={!storeInput.trim() || busy !== null} onClick={install}>
            {busy === 'store' ? <Loader2 className="animate-spin" /> : <Store />}
            Installer
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => run('folder', () => api.extensions.installFromFolder())}
        >
          {busy === 'folder' ? <Loader2 className="animate-spin" /> : <FolderOpen />}
          Dossier décompressé
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => run('file', () => api.extensions.installFromFile())}
        >
          {busy === 'file' ? <Loader2 className="animate-spin" /> : <FileArchive />}
          Fichier .crx / .zip
        </Button>
      </div>

      <Separator />

      {state.extensions.length === 0 ? (
        <div className="grid place-items-center gap-2 py-8 text-center">
          <Puzzle className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aucune extension installée.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {state.extensions.map((ext) => {
            const enabled = account ? ext.enabled[account.id] !== false : false;
            const blocking = (ext.permissions ?? []).filter((p: string) => UNSUPPORTED[p]);
            return (
              <li key={ext.id} className="grid gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <Puzzle className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{ext.name}</span>
                      <Badge variant="outline" className="shrink-0">
                        v{ext.version}
                      </Badge>
                      {ext.manifestVersion === 2 && (
                        <Badge variant="secondary" className="shrink-0">
                          MV2
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {ext.source.type === 'store' ? 'Chrome Web Store' : ext.dir}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`ext-${ext.id}`}
                        checked={enabled}
                        disabled={!account}
                        onCheckedChange={(checked) =>
                          account && api.extensions.toggle(ext.id, account.id, checked)
                        }
                      />
                      <Label htmlFor={`ext-${ext.id}`} className="text-xs text-muted-foreground">
                        {account?.name ?? '—'}
                      </Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Désinstaller ${ext.name}`}
                      onClick={() => api.extensions.remove(ext.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {blocking.length > 0 && (
                  <p className="flex items-start gap-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Cette extension a besoin de{' '}
                      <strong className="font-medium text-foreground">
                        {blocking.map((p: string) => UNSUPPORTED[p]).join(', ')}
                      </strong>
                      , qu'Electron n'implémente pas. Elle se charge mais restera sans effet.
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

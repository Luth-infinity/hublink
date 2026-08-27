import * as React from 'react';
import { Bug, Coffee, Star } from 'lucide-react';
import { ISSUES_URL, REPO_URL, SUPPORT_URL } from '@/lib/links';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type About = { version: string; electron: string; chrome: string; userData: string };

// lucide-react a retiré les icônes de marque : celle-ci est inline.
function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="size-4">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function AboutPanel() {
  const [about, setAbout] = React.useState<About | null>(null);

  React.useEffect(() => {
    window.hublink.about().then(setAbout);
  }, []);

  const open = (url: string) => window.hublink.openExternal(url);
  // Copie locale : le rétrécissement de type se perd dans la closure du JSX.
  const support = SUPPORT_URL;

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="text-sm font-medium">Hublink {about?.version ?? ''}</p>
        <p className="text-xs text-muted-foreground">
          Libre, sous licence MIT. Vos comptes et services restent sur cette machine : il n'y a pas de
          serveur.
        </p>
      </div>

      {/* Rien plutôt qu'un lien mort : le bloc disparaît tant que le pseudo
          n'est pas renseigné dans lib/links.ts. */}
      {support && (
        <>
          <Separator />
          <div className="grid gap-2 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Soutenir le projet</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Hublink est gratuit et le restera. Si l'app vous fait gagner du temps, un café aide à
              payer les heures du soir et les certificats de signature.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button size="sm" className="gap-2" onClick={() => open(support)}>
                <Coffee /> Offrir un café
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => open(`${REPO_URL}/stargazers`)}
              >
                <Star /> Mettre une étoile
              </Button>
            </div>
          </div>
        </>
      )}

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => open(REPO_URL)}>
          <GithubMark /> Code source
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => open(ISSUES_URL)}>
          <Bug /> Signaler un bug
        </Button>
      </div>

      {about && (
        <dl className="grid gap-1 text-xs text-muted-foreground">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0">Chromium</dt>
            <dd>{about.chrome}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0">Electron</dt>
            <dd>{about.electron}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0">Données</dt>
            <dd className="truncate" title={about.userData}>
              {about.userData}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

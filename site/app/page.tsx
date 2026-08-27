import Image from 'next/image';
import { Reveal } from './reveal';
import { getReleases } from './releases';
import { SUPPORT_URL } from './support';

const REPO = 'https://github.com/Luth-infinity/hublink';
const RELEASE = `${REPO}/releases/latest`;
const VERSION = '0.3.3';

const DOWNLOADS = {
  mac: `${REPO}/releases/download/v${VERSION}/Hublink-${VERSION}-arm64.dmg`,
  win: `${REPO}/releases/download/v${VERSION}/Hublink-Setup-${VERSION}-x64.exe`
};

function Logo({ className = 'size-7' }: { className?: string }) {
  return <Image src="/icon.png" alt="" width={64} height={64} className={`${className} rounded-[22%]`} />;
}

function Nav() {
  return (
    <div className="sticky top-4 z-50 flex justify-center px-4">
      <nav className="flex items-center gap-1 rounded-full bg-card/90 p-1.5 pl-4 shadow-[0_1px_2px_rgba(11,12,14,.06),0_8px_24px_-8px_rgba(11,12,14,.18)] ring-1 ring-line/60 backdrop-blur">
        <a href="#top" className="mr-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Logo className="size-6" />
          Hublink
        </a>
        <a href="#pourquoi" className="hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink sm:block">
          Pourquoi
        </a>
        <a href="#fonctions" className="hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink sm:block">
          Fonctionnalités
        </a>
        <a href="#a-savoir" className="hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink md:block">
          Bon à savoir
        </a>
        <a href="#versions" className="hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink md:block">
          Versions
        </a>
        <a
          href={REPO}
          className="hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink sm:block"
        >
          GitHub
        </a>
        {SUPPORT_URL && (
          <a
            href="#soutenir"
            className="hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink sm:block"
          >
            Soutenir
          </a>
        )}
        <a
          href="#telecharger"
          className="ml-1 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
        >
          Télécharger
        </a>
      </nav>
    </div>
  );
}

function Hero() {
  return (
    <header id="top" className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center sm:pt-24">
      <p className="reveal mb-5 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-[13px] text-ink-soft ring-1 ring-line">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Version {VERSION} — macOS et Windows
      </p>
      <h1 className="reveal headline mx-auto max-w-[16ch] text-[13vw] sm:text-[76px] lg:text-[92px]">
        Un compte, une bulle.
      </h1>
      <p className="reveal mx-auto mt-6 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">
        Hublink range les webapps de vos différents comptes dans une seule fenêtre. Chacun garde sa
        propre session : deux Teams, deux Slack, deux Gmail cohabitent sans jamais se déconnecter
        l'un l'autre.
      </p>
      <div className="reveal mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href="#telecharger"
          className="rounded-full bg-ink px-6 py-3 text-[15px] font-medium text-white transition-transform hover:scale-[1.02]"
        >
          Télécharger gratuitement
        </a>
        <a
          href={REPO}
          className="rounded-full bg-card px-6 py-3 text-[15px] font-medium ring-1 ring-line transition-colors hover:bg-canvas"
        >
          Voir le code
        </a>
      </div>
    </header>
  );
}

function Shot() {
  return (
    <div className="reveal px-4 pb-4">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[20px] bg-card p-2 shadow-[0_2px_4px_rgba(11,12,14,.04),0_24px_64px_-24px_rgba(11,12,14,.28)] ring-1 ring-line/70">
        <Image
          src="/app-clair.png"
          alt="La fenêtre de Hublink : à gauche le panneau des services regroupés par compte, à droite la webapp affichée."
          width={1440}
          height={900}
          priority
          className="w-full rounded-[13px]"
        />
      </div>
    </div>
  );
}

function Pourquoi() {
  return (
    <section id="pourquoi" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal headline text-[40px] sm:text-[54px]">Le problème, très concrètement.</h2>
        <div className="reveal mt-8 grid gap-x-12 gap-y-5 text-[17px] leading-relaxed text-ink-soft lg:grid-cols-2">
          <p>
            Vous travaillez pour trois clients. Chacun a son Microsoft 365, son Slack, son intranet.
            Dans un navigateur, ces comptes se marchent dessus : vous ouvrez Teams pour le client A,
            on vous connecte au client B, et il faut se déconnecter pour recommencer.
          </p>
          <p>
            Les profils Chrome règlent le problème mais en créent un autre : trois fenêtres, trois
            docks, trois endroits où chercher. Et sur Windows, Teams propose obstinément la clé
            d'accès de la session — qui n'est jamais le bon compte.
          </p>
          <p className="font-medium text-ink lg:col-span-2">
            Hublink met tout dans une fenêtre, et garantit que les sessions ne se croisent jamais.
          </p>
        </div>
      </div>
    </section>
  );
}

const FONCTIONS = [
  {
    titre: 'Sessions cloisonnées',
    texte:
      "Chaque compte a sa propre partition Chromium. Les services d'un même compte partagent leurs cookies — un seul login SSO pour la messagerie, l'intranet et les outils. Ceux d'un autre compte ne voient rien."
  },
  {
    titre: 'Extensions Chrome',
    texte:
      "Installables depuis le Store par identifiant, ou depuis un .crx. Activables compte par compte : uBlock partout, le correcteur seulement chez le client qui en a besoin."
  },
  {
    titre: 'Mise en veille',
    texte:
      "Un service ouvert coûte environ 110 Mo. Ceux qu'on ne consulte plus sont libérés après un délai réglable, et se rechargent au clic sans déconnexion."
  },
  {
    titre: 'Capture intégrée',
    texte:
      "Page entière ou zone visible, vers un fichier ou le presse-papiers, en deux clics depuis la barre d'outils. Rien à installer."
  },
  {
    titre: 'Le bon compte du premier coup',
    texte:
      "Les portails Microsoft proposent d'emblée la clé d'accès de la session Windows ou macOS — rarement celle du client sur lequel vous travaillez. Hublink laisse la main au mot de passe du compte voulu."
  },
  {
    titre: 'Thème teinté',
    texte:
      "Clair, sombre ou système. Quand vous filtrez sur un compte, sa couleur voile légèrement l'interface — de quoi savoir chez qui vous êtes sans lire une étiquette."
  }
];

function Fonctions() {
  return (
    <section id="fonctions" className="px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal headline max-w-[14ch] text-[40px] sm:text-[54px]">
          Ce qu'il fait, sans le reste.
        </h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FONCTIONS.map((f) => (
            <article
              key={f.titre}
              className="reveal rounded-2xl bg-card p-6 shadow-[0_1px_2px_rgba(11,12,14,.05),0_12px_32px_-16px_rgba(11,12,14,.16)] ring-1 ring-line/60"
            >
              <h3 className="text-[17px] font-semibold tracking-tight">{f.titre}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{f.texte}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const CHIFFRES = [
  { valeur: '842 → 525 Mo', legende: 'mémoire sur quatre services, une fois les inactifs mis en veille' },
  { valeur: '92 → 1 Ko/s', legende: 'trafic interne après refonte des mises à jour d’état' },
  { valeur: '0,6 %', legende: 'de processeur au repos, une webapp active à l’écran' }
];

function Chiffres() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="reveal rounded-[24px] bg-ink px-6 py-14 text-center text-white sm:px-12">
          <h2 className="headline mx-auto max-w-[18ch] text-[34px] sm:text-[46px]">
            Optimisé parce que mesuré.
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-relaxed text-white/60">
            Chaque chiffre vient d'un banc de test reproductible, pas d'une impression.
          </p>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {CHIFFRES.map((c) => (
              <div key={c.valeur}>
                <p className="headline text-[30px] sm:text-[36px]">{c.valeur}</p>
                <p className="mx-auto mt-3 max-w-[26ch] text-[14px] leading-relaxed text-white/55">
                  {c.legende}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Sombre() {
  return (
    <section className="px-4 pb-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
        <div className="reveal">
          <h2 className="headline text-[40px] sm:text-[52px]">Il sait où vous êtes.</h2>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">
            Filtrez sur un compte : la liste ne montre plus que ses services, et sa couleur teinte
            discrètement le cadre. Assez pour ne pas envoyer le mauvais message au mauvais client,
            jamais assez pour vous distraire de la page.
          </p>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">
            Le panneau se réduit en rail d'icônes d'un raccourci, et rend 190 pixels à la page.
          </p>
        </div>
        <div className="reveal overflow-hidden rounded-[20px] bg-card p-2 shadow-[0_2px_4px_rgba(11,12,14,.04),0_24px_64px_-24px_rgba(11,12,14,.28)] ring-1 ring-line/70">
          <Image
            src="/app-sombre.png"
            alt="Hublink en thème sombre, la teinte du compte actif habillant le panneau."
            width={1440}
            height={900}
            className="w-full rounded-[13px]"
          />
        </div>
      </div>
    </section>
  );
}

function ASavoir() {
  return (
    <section id="a-savoir" className="px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal headline text-[40px] sm:text-[54px]">Bon à savoir.</h2>
        <p className="reveal mt-6 text-[17px] leading-relaxed text-ink-soft">
          Quatre points à connaître avant d'installer. Rien de bloquant, mais autant les dire ici
          plutôt que vous laisser les découvrir.
        </p>
        <ul className="reveal mt-8 grid gap-4 sm:grid-cols-2">
          {[
            [
              'Mots de passe',
              "Les extensions de gestionnaires s'installent et s'ouvrent, mais ne vont pas au bout : il leur manque des API que le moteur n'expose pas. Le contournement qui marche : ajoutez le coffre web de votre gestionnaire comme service, et copiez-collez."
            ],
            [
              'Captures d’écran',
              "Hublink capture lui-même, page entière comprise, depuis la barre d'outils. Inutile d'installer une extension dédiée : elles s'appuient sur une API que le moteur n'expose pas."
            ],
            [
              'Tout reste sur votre machine',
              "Aucun serveur, aucun compte à créer, rien qui parte ailleurs. En contrepartie, vos services ne se synchronisent pas d'un poste à l'autre : on les rajoute une fois par machine."
            ],
            [
              'Premier lancement',
              "Les binaires ne sont pas encore signés : clic droit puis « Ouvrir » sur macOS, « Informations complémentaires » puis « Exécuter quand même » sur Windows. Une seule fois, puis on n'y revient plus."
            ]
          ].map(([titre, texte]) => (
            <li key={titre} className="rounded-2xl bg-card p-5 ring-1 ring-line/60">
              <p className="text-[15px] font-semibold tracking-tight">{titre}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{texte}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Telecharger() {
  return (
    <section id="telecharger" className="px-4 py-24">
      <div className="mx-auto max-w-6xl text-center">
        <Logo className="mx-auto size-14" />
        <h2 className="reveal headline mt-6 text-[40px] sm:text-[54px]">Prenez-le, il est libre.</h2>
        <p className="reveal mx-auto mt-5 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
          Gratuit, sous licence MIT, sans compte à créer. Version {VERSION}.
        </p>
        <div className="reveal mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={DOWNLOADS.mac}
            className="w-full rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white transition-transform hover:scale-[1.02] sm:w-auto"
          >
            macOS — Apple Silicon
          </a>
          <a
            href={DOWNLOADS.win}
            className="w-full rounded-full bg-card px-6 py-3.5 text-[15px] font-medium ring-1 ring-line transition-colors hover:bg-canvas sm:w-auto"
          >
            Windows — 64 bits
          </a>
        </div>
        <p className="reveal mt-5 text-[13px] text-ink-soft">
          Mac Intel, Windows ARM et les versions précédentes sont{' '}
          <a href={RELEASE} className="underline underline-offset-4 hover:text-ink">
            sur la page des versions
          </a>
          .
        </p>
      </div>
    </section>
  );
}

async function Changelog() {
  const releases = await getReleases();
  // Rien plutôt qu'une section vide si l'API GitHub n'a pas répondu.
  if (releases.length === 0) return null;

  return (
    <section id="versions" className="px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal headline text-[40px] sm:text-[54px]">Ce qui a changé.</h2>
        <p className="reveal mt-6 text-[17px] leading-relaxed text-ink-soft">
          Les {releases.length} dernières versions, telles que publiées sur GitHub.
        </p>

        <ol className="reveal mt-10 space-y-px overflow-hidden rounded-2xl bg-card ring-1 ring-line/60">
          {releases.map((release, index) => (
            <li
              key={release.version}
              className="grid gap-4 border-line/70 p-6 sm:grid-cols-[160px_1fr] sm:gap-8"
              style={index > 0 ? { borderTopWidth: 1 } : undefined}
            >
              <div>
                <p className="flex items-baseline gap-2 text-[17px] font-semibold tracking-tight">
                  {release.version}
                  {index === 0 && (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium text-white">
                      actuelle
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[13px] text-ink-soft">{release.date}</p>
              </div>
              <div>
                {release.points.length > 0 ? (
                  <ul className="space-y-2 text-[15px] leading-relaxed text-ink-soft">
                    {release.points.map((point) => (
                      <li key={point} className="flex gap-2.5">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-soft/50" />
                        {point}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] text-ink-soft">Corrections et ajustements.</p>
                )}
                <a
                  href={release.page}
                  className="mt-3 inline-block text-[13px] text-ink-soft underline underline-offset-4 hover:text-ink"
                >
                  Détail et fichiers
                </a>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Soutenir() {
  // Rien plutôt qu'un lien mort : la section disparaît tant que le pseudo n'est
  // pas renseigné dans support.ts.
  if (!SUPPORT_URL) return null;

  return (
    <section id="soutenir" className="px-4 pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="reveal rounded-[24px] bg-card p-8 shadow-[0_1px_2px_rgba(11,12,14,.05),0_16px_40px_-20px_rgba(11,12,14,.18)] ring-1 ring-line/60 sm:p-12">
          <h2 className="headline max-w-[20ch] text-[32px] sm:text-[42px]">
            Hublink est gratuit. Il n'est pas gratuit à faire.
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-soft">
            Pas de compte, pas d'abonnement, pas de collecte : l'app est libre et le restera. Si elle
            vous fait gagner du temps chaque jour, un café aide à payer les heures du soir.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full bg-ink px-6 py-3 text-[15px] font-medium text-white transition-transform hover:scale-[1.02]"
            >
              Offrir un café
            </a>
            <a
              href={`${REPO}/stargazers`}
              className="rounded-full px-5 py-3 text-[15px] font-medium text-ink-soft ring-1 ring-line transition-colors hover:text-ink"
            >
              Ou juste une étoile sur GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-4 pb-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-line pt-8 sm:flex-row">
        <p className="flex items-center gap-2 text-[14px] text-ink-soft">
          <Logo className="size-5" />
          Hublink — un outil de Luth
        </p>
        <div className="flex items-center gap-5 text-[14px] text-ink-soft">
          <a href={REPO} className="hover:text-ink">
            GitHub
          </a>
          <a href={RELEASE} className="hover:text-ink">
            Versions
          </a>
          <a href={`${REPO}/issues`} className="hover:text-ink">
            Signaler un bug
          </a>
          {SUPPORT_URL && (
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
              Soutenir
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}

export default function Page() {
  return (
    <>
      <Reveal />
      <Nav />
      <main className="mx-auto max-w-[1600px] pb-px">
        <div className="mt-4 rounded-[28px] bg-canvas pt-2 pb-px">
          <Hero />
          <Shot />
          <Pourquoi />
          <Fonctions />
          <Chiffres />
          <Sombre />
          <ASavoir />
          <Changelog />
          <Telecharger />
          <Soutenir />
          <Footer />
        </div>
      </main>
    </>
  );
}

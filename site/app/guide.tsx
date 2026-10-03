import Image from 'next/image';
import { Reveal } from './reveal';
import { BasculeLangue } from './bascule-langue';
import { SUPPORT_URL } from './support';
import type { Locale } from './content';
import { guides, type Etape } from './guide-content';
import { REPO, RELEASE, VERSION } from './vitrine';

/**
 * Le guide d'installation : les deux systèmes, puis les questions de sécurité.
 *
 * Les deux systèmes restent affichés quelle que soit la plateforme détectée :
 * on arrive souvent ici depuis le mauvais poste — le PC du bureau pour
 * préparer le Mac de la maison.
 */

const ACCUEIL: Record<Locale, string> = { en: '/', fr: '/fr' };

const LANGUES = [
  { code: 'fr', libelle: 'FR', href: '/fr/installer' },
  { code: 'en', libelle: 'EN', href: '/install' }
];

const LIENS = {
  release: RELEASE,
  actions: `${REPO}/actions`,
  issues: `${REPO}/issues`,
  soutenir: SUPPORT_URL
};

const CARTE = 'rounded-2xl bg-card p-6 ring-1 ring-line/60';

function Commande({ children }: { children: string }) {
  // `select-all` : un clic sélectionne la ligne entière, prête à copier.
  return (
    <code className="mt-4 block overflow-x-auto rounded-xl bg-ink px-4 py-3 font-mono text-[13px] break-all whitespace-pre-wrap text-white select-all">
      {children}
    </code>
  );
}

function Etapes({ etapes }: { etapes: Etape[] }) {
  return (
    <ol className="mt-8 grid gap-4 lg:grid-cols-3">
      {etapes.map((etape, i) => (
        <li key={etape.titre} className={`reveal ${CARTE}`}>
          <p className="text-[13px] font-medium text-ink-soft">{i + 1}</p>
          <p className="mt-2 text-[17px] font-semibold tracking-tight">{etape.titre}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{etape.texte}</p>
          {etape.commande && <Commande>{etape.commande}</Commande>}
        </li>
      ))}
    </ol>
  );
}

function Remarque({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className={`reveal ${CARTE}`}>
      <p className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
        {titre}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{texte}</p>
    </div>
  );
}

export default function GuideInstallation({ locale }: { locale: Locale }) {
  const g = guides[locale];
  const questions = g.questions.items(VERSION.win, VERSION.mac);

  return (
    <>
      <Reveal />
      <div className="sticky top-4 z-50 flex justify-center px-4">
        <nav className="flex items-center gap-1 rounded-full bg-card/90 p-1.5 pl-4 shadow-[0_1px_2px_rgba(11,12,14,.06),0_8px_24px_-8px_rgba(11,12,14,.18)] ring-1 ring-line/60 backdrop-blur">
          <a href={ACCUEIL[locale]} className="mr-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Image src="/icon.png" alt="" width={64} height={64} className="size-6 rounded-[22%]" />
            {g.retour}
          </a>
          <a href="#windows" className="hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink sm:block">
            Windows
          </a>
          <a href="#macos" className="hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink sm:block">
            macOS
          </a>
          <BasculeLangue
            langues={LANGUES}
            locale={locale}
            label={locale === 'fr' ? 'Langue' : 'Language'}
            sections={['windows', 'macos', 'questions']}
            fond="mx-1 bg-canvas ring-1 ring-line/60"
            pastille="bg-card shadow-[0_1px_2px_rgba(11,12,14,.08)] ring-1 ring-line/70"
          />
          <a
            href={`${ACCUEIL[locale]}#telecharger`}
            className="ml-1 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
          >
            {g.telecharger}
          </a>
        </nav>
      </div>

      <main lang={locale} className="mx-auto max-w-[1600px] pb-px">
        <div className="mt-4 rounded-[28px] bg-canvas pt-2 pb-px">
          <header className="mx-auto max-w-6xl px-4 pt-16 pb-8 sm:pt-24">
            <h1 className="reveal headline max-w-[18ch] text-[44px] sm:text-[64px]">{g.titre}</h1>
            <p className="reveal mt-6 max-w-[64ch] text-[17px] leading-relaxed text-ink-soft">{g.intro}</p>
          </header>

          <section id="windows" className="scroll-mt-24 px-4 py-12">
            <div className="mx-auto max-w-6xl">
              <h2 className="reveal headline text-[34px] sm:text-[44px]">{g.windows.titre}</h2>
              <Etapes etapes={g.windows.etapes} />
              <div className="mt-4">
                <Remarque {...g.windows.attention} />
              </div>
            </div>
          </section>

          <section id="macos" className="scroll-mt-24 px-4 py-12">
            <div className="mx-auto max-w-6xl">
              <h2 className="reveal headline text-[34px] sm:text-[44px]">{g.macos.titre}</h2>
              <Etapes etapes={g.macos.etapes} />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Remarque {...g.macos.attention} />
                <Remarque {...g.macos.autre} />
              </div>
            </div>
          </section>

          <section id="questions" className="scroll-mt-24 px-4 pt-12 pb-24">
            <div className="mx-auto max-w-6xl">
              <h2 className="reveal headline max-w-[20ch] text-[34px] sm:text-[44px]">{g.questions.titre}</h2>
              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {questions.map((q) => {
                  const href = q.lien && LIENS[q.lien.href];
                  return (
                    <li key={q.question} className={`reveal ${CARTE} ${q.commandes ? 'sm:col-span-2' : ''}`}>
                      <p className="text-[15px] font-semibold tracking-tight">{q.question}</p>
                      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{q.reponse}</p>
                      {q.commandes && (
                        <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
                          {q.commandes.map((c) => (
                            <div key={c.libelle}>
                              <p className="mt-4 text-[13px] text-ink-soft">{c.libelle}</p>
                              <Commande>{c.commande}</Commande>
                            </div>
                          ))}
                        </div>
                      )}
                      {q.lien && href && (
                        <a
                          href={href}
                          className="mt-3 inline-block text-[13px] text-ink-soft underline underline-offset-4 hover:text-ink"
                        >
                          {q.lien.libelle}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

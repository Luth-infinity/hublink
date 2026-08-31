import Image from 'next/image';
import { Reveal } from './reveal';
import { getReleases } from './releases';
import { SUPPORT_URL } from './support';
import type { Contenu, Locale } from './content';
import { LangLink } from './lang-link';

/**
 * La page, une seule fois, alimentée par le dictionnaire de la langue.
 *
 * Le fichier ne s'appelle pas `Page.tsx` : sous Windows, ce serait le même
 * fichier que la route `page.tsx`.
 */

const REPO = 'https://github.com/Luth-infinity/hublink';
const RELEASE = `${REPO}/releases/latest`;
// Les deux plateformes n'avancent pas au même rythme : les binaires macOS se
// construisent sur un Mac, ceux de Windows sur un PC. Annoncer un numéro unique
// enverrait la moitié des visiteurs vers un fichier qui n'existe pas.
const VERSION = { win: '0.5.0', mac: '0.5.0' };

const DOWNLOADS = {
  mac: `${REPO}/releases/download/v${VERSION.mac}/Hublink-${VERSION.mac}-arm64.dmg`,
  win: `${REPO}/releases/download/v${VERSION.win}/Hublink-Setup-${VERSION.win}-x64.exe`
};

type Props = { t: Contenu; locale: Locale };

// L'anglais est servi à la racine, le français sous /fr.
const autreLangue = (locale: Locale) => (locale === 'en' ? '/fr' : '/');

function Logo({ className = 'size-7' }: { className?: string }) {
  return <Image src="/icon.png" alt="" width={64} height={64} className={`${className} rounded-[22%]`} />;
}

const LIEN_NAV =
  'hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink sm:block';

const CADRE_IMAGE =
  'reveal overflow-hidden rounded-[20px] bg-card p-2 shadow-[0_2px_4px_rgba(11,12,14,.04),0_24px_64px_-24px_rgba(11,12,14,.28)] ring-1 ring-line/70';

function Nav({ t, locale }: Props) {
  return (
    <div className="sticky top-4 z-50 flex justify-center px-4">
      <nav className="flex items-center gap-1 rounded-full bg-card/90 p-1.5 pl-4 shadow-[0_1px_2px_rgba(11,12,14,.06),0_8px_24px_-8px_rgba(11,12,14,.18)] ring-1 ring-line/60 backdrop-blur">
        <a href="#top" className="mr-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Logo className="size-6" />
          Hublink
        </a>
        <a href="#fonctions" className={LIEN_NAV}>
          {t.nav.fonctions}
        </a>
        <a href="#versions" className={LIEN_NAV}>
          {t.nav.versions}
        </a>
        <a href={REPO} className={LIEN_NAV}>
          GitHub
        </a>
        <LangLink
          href={autreLangue(locale)}
          hrefLang={locale === 'en' ? 'fr' : 'en'}
          className="rounded-full px-2.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          {t.nav.autreLangue}
        </LangLink>
        <a
          href="#telecharger"
          className="ml-1 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
        >
          {t.nav.telecharger}
        </a>
      </nav>
    </div>
  );
}

function Hero({ t }: { t: Contenu }) {
  return (
    <header id="top" className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center sm:pt-24">
      <p className="reveal mb-5 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-[13px] text-ink-soft ring-1 ring-line">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {t.hero.badge(VERSION.win, VERSION.mac)}
      </p>
      <h1 className="reveal headline mx-auto max-w-[16ch] text-[13vw] sm:text-[76px] lg:text-[92px]">
        {t.hero.titre}
      </h1>
      <p className="reveal mx-auto mt-6 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">
        {t.hero.texte}
      </p>
      <div className="reveal mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href="#telecharger"
          className="rounded-full bg-ink px-6 py-3 text-[15px] font-medium text-white transition-transform hover:scale-[1.02]"
        >
          {t.hero.telecharger}
        </a>
        <a
          href={REPO}
          className="rounded-full bg-card px-6 py-3 text-[15px] font-medium ring-1 ring-line transition-colors hover:bg-canvas"
        >
          {t.hero.code}
        </a>
      </div>
    </header>
  );
}

function Shot({ t }: { t: Contenu }) {
  return (
    <div className="reveal px-4 pb-4">
      <div className={`mx-auto max-w-6xl ${CADRE_IMAGE}`}>
        <Image
          src="/app-clair.png"
          alt={t.shot.alt}
          width={1783}
          height={1083}
          priority
          className="w-full rounded-[13px]"
        />
      </div>
    </div>
  );
}

function Pourquoi({ t }: { t: Contenu }) {
  return (
    <section id="pourquoi" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal headline text-[40px] sm:text-[54px]">{t.pourquoi.titre}</h2>
        <div className="reveal mt-8 grid gap-x-12 gap-y-5 text-[17px] leading-relaxed text-ink-soft lg:grid-cols-2">
          <p>{t.pourquoi.p1}</p>
          <p>{t.pourquoi.p2}</p>
          <p className="font-medium text-ink lg:col-span-2">{t.pourquoi.p3}</p>
        </div>
      </div>
    </section>
  );
}

function Fonctions({ t }: { t: Contenu }) {
  return (
    <section id="fonctions" className="px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal headline max-w-[14ch] text-[40px] sm:text-[54px]">{t.fonctions.titre}</h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.fonctions.cartes.map((f) => (
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

function Chiffres({ t }: { t: Contenu }) {
  return (
    <section id="chiffres" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="reveal rounded-[24px] bg-ink px-6 py-14 text-center text-white sm:px-12">
          <h2 className="headline mx-auto max-w-[18ch] text-[34px] sm:text-[46px]">
            {t.chiffres.titre}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-relaxed text-white/60">
            {t.chiffres.sous}
          </p>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {t.chiffres.items.map((c) => (
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

function Discretion({ t }: { t: Contenu }) {
  return (
    <section id="discretion" className="px-4 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
        <div className={`order-2 lg:order-1 ${CADRE_IMAGE}`}>
          <Image
            src="/app-discretion.png"
            alt={t.discretion.alt}
            width={1783}
            height={1083}
            className="w-full rounded-[13px]"
          />
        </div>
        <div className="reveal order-1 lg:order-2">
          <h2 className="headline text-[40px] sm:text-[52px]">{t.discretion.titre}</h2>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">
            {t.discretion.p1}
          </p>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">
            {t.discretion.p2}
          </p>
        </div>
      </div>
    </section>
  );
}

function Sombre({ t }: { t: Contenu }) {
  return (
    <section id="sombre" className="px-4 pb-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
        <div className="reveal">
          <h2 className="headline text-[40px] sm:text-[52px]">{t.sombre.titre}</h2>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">{t.sombre.p1}</p>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">{t.sombre.p2}</p>
        </div>
        <div className={CADRE_IMAGE}>
          <Image
            src="/app-sombre.png"
            alt={t.sombre.alt}
            width={1783}
            height={1083}
            className="w-full rounded-[13px]"
          />
        </div>
      </div>
    </section>
  );
}

function ASavoir({ t }: { t: Contenu }) {
  return (
    <section id="a-savoir" className="px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal headline text-[40px] sm:text-[54px]">{t.aSavoir.titre}</h2>
        <p className="reveal mt-6 text-[17px] leading-relaxed text-ink-soft">{t.aSavoir.intro}</p>
        <ul className="reveal mt-8 grid gap-4 sm:grid-cols-2">
          {t.aSavoir.points.map(([titre, texte]) => (
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

function Telecharger({ t }: { t: Contenu }) {
  return (
    <section id="telecharger" className="px-4 py-24">
      <div className="mx-auto max-w-6xl text-center">
        <Logo className="mx-auto size-14" />
        <h2 className="reveal headline mt-6 text-[40px] sm:text-[54px]">{t.telecharger.titre}</h2>
        <p className="reveal mx-auto mt-5 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
          {t.telecharger.sous(VERSION.win, VERSION.mac)}
        </p>
        {/* Un seul bouton survit au CSS : celui de la plateforme du visiteur. Les
            deux portent donc le style principal — quand la détection échoue,
            ils s'affichent côte à côte et aucun des deux n'a à passer devant
            l'autre. */}
        <div className="reveal mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            data-cta="mac"
            href={DOWNLOADS.mac}
            className="w-full rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white transition-transform hover:scale-[1.02] sm:w-auto"
          >
            {t.telecharger.mac} · {VERSION.mac}
          </a>
          <a
            data-cta="win"
            href={DOWNLOADS.win}
            className="w-full rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white transition-transform hover:scale-[1.02] sm:w-auto"
          >
            {t.telecharger.win} · {VERSION.win}
          </a>
        </div>
        {/* L'attribut porte la plateforme DÉTECTÉE, le lien mène à l'autre. */}
        <p className="reveal mt-4 text-[13px] text-ink-soft">
          <span data-cta-autre="mac">
            <a href={DOWNLOADS.win} className="underline underline-offset-4 hover:text-ink">
              {t.telecharger.autre('Windows')}
            </a>
          </span>
          <span data-cta-autre="win">
            <a href={DOWNLOADS.mac} className="underline underline-offset-4 hover:text-ink">
              {t.telecharger.autre('macOS')}
            </a>
          </span>
        </p>
        <p className="reveal mt-5 text-[13px] text-ink-soft">
          {t.telecharger.noteAvant}
          <a href={RELEASE} className="underline underline-offset-4 hover:text-ink">
            {t.telecharger.noteLien}
          </a>
          {t.telecharger.noteApres(VERSION.win, VERSION.mac)}
        </p>
      </div>
    </section>
  );
}

async function Changelog({ t, locale }: Props) {
  const releases = await getReleases(locale);
  // Rien plutôt qu'une section vide si l'API GitHub n'a pas répondu.
  if (releases.length === 0) return null;

  return (
    <section id="versions" className="px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal headline text-[40px] sm:text-[54px]">{t.changelog.titre}</h2>
        <p className="reveal mt-6 text-[17px] leading-relaxed text-ink-soft">
          {t.changelog.sous(releases.length)}
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
                      {t.changelog.actuelle}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[13px] text-ink-soft">{release.date}</p>
              </div>
              {/* Les notes de version sont rédigées en français sur GitHub : on
                  le signale au navigateur plutôt que de laisser croire à de
                  l'anglais mal écrit. */}
              <div lang="fr">
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
                  <p className="text-[15px] text-ink-soft">{t.changelog.vide}</p>
                )}
                <a
                  href={release.page}
                  lang={locale}
                  className="mt-3 inline-block text-[13px] text-ink-soft underline underline-offset-4 hover:text-ink"
                >
                  {t.changelog.detail}
                </a>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Soutenir({ t }: { t: Contenu }) {
  // Rien plutôt qu'un lien mort : la section disparaît tant que le pseudo n'est
  // pas renseigné dans support.ts.
  if (!SUPPORT_URL) return null;

  return (
    <section id="soutenir" className="px-4 pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="reveal rounded-[24px] bg-card p-8 shadow-[0_1px_2px_rgba(11,12,14,.05),0_16px_40px_-20px_rgba(11,12,14,.18)] ring-1 ring-line/60 sm:p-12">
          <h2 className="headline max-w-[20ch] text-[32px] sm:text-[42px]">{t.soutenir.titre}</h2>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-soft">{t.soutenir.texte}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full bg-ink px-6 py-3 text-[15px] font-medium text-white transition-transform hover:scale-[1.02]"
            >
              {t.soutenir.cafe}
            </a>
            <a
              href={`${REPO}/stargazers`}
              className="rounded-full px-5 py-3 text-[15px] font-medium text-ink-soft ring-1 ring-line transition-colors hover:text-ink"
            >
              {t.soutenir.etoile}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ t }: { t: Contenu }) {
  return (
    <footer className="px-4 pb-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-line pt-8 sm:flex-row">
        <p className="flex items-center gap-2 text-[14px] text-ink-soft">
          <Logo className="size-5" />
          {t.footer.signature}
        </p>
        <div className="flex items-center gap-5 text-[14px] text-ink-soft">
          <a href={REPO} className="hover:text-ink">
            {t.footer.github}
          </a>
          <a href={RELEASE} className="hover:text-ink">
            {t.footer.versions}
          </a>
          <a href={`${REPO}/issues`} className="hover:text-ink">
            {t.footer.bug}
          </a>
          {SUPPORT_URL && (
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
              {t.footer.soutenir}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}

export default function Vitrine({ t, locale }: Props) {
  return (
    <>
      <Reveal />
      <Nav t={t} locale={locale} />
      <main lang={locale} className="mx-auto max-w-[1600px] pb-px">
        <div className="mt-4 rounded-[28px] bg-canvas pt-2 pb-px">
          <Hero t={t} />
          <Shot t={t} />
          <Pourquoi t={t} />
          <Fonctions t={t} />
          <Chiffres t={t} />
          <Discretion t={t} />
          <Sombre t={t} />
          <ASavoir t={t} />
          <Changelog t={t} locale={locale} />
          <Telecharger t={t} />
          <Soutenir t={t} />
          <Footer t={t} />
        </div>
      </main>
    </>
  );
}

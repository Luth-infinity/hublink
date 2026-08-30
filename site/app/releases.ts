export type Release = {
  version: string;
  date: string;
  page: string;
  points: string[];
};

const API = 'https://api.github.com/repos/Luth-infinity/hublink/releases';

/** Garde les puces et les phrases courtes, écarte les blocs d'installation. */
function summarize(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('**') && !l.startsWith('>'))
    .map((l) => l.replace(/^[-*]\s*/, ''))
    .filter((l) => l.length > 25 && !/^`|clic droit|Binaires/i.test(l))
    .slice(0, 4);
}

/**
 * Les versions viennent des releases GitHub : le changelog du site se met à
 * jour tout seul à chaque publication, sans double saisie qui finirait par
 * diverger. Revalidé toutes les heures.
 */
export async function getReleases(locale: 'en' | 'fr' = 'fr'): Promise<Release[]> {
  try {
    const res = await fetch(API, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 }
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      tag_name: string;
      published_at: string;
      html_url: string;
      body: string;
      draft: boolean;
      prerelease: boolean;
    }[];

    return data
      .filter((r) => !r.draft && !r.prerelease)
      .slice(0, 5)
      .map((r) => ({
        version: r.tag_name.replace(/^v/, ''),
        date: new Date(r.published_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        page: r.html_url,
        points: summarize(r.body || '')
      }));
  } catch {
    // Le site doit se construire même si l'API GitHub est indisponible.
    return [];
  }
}

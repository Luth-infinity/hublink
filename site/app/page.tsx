import type { Metadata } from 'next';
import Vitrine from './vitrine';
import { en } from './content';

// L'anglais est servi à la racine : c'est la langue par défaut du site.
export const metadata: Metadata = {
  title: en.meta.title,
  description: en.meta.description,
  alternates: { canonical: '/', languages: { en: '/', fr: '/fr' } },
  openGraph: {
    title: 'Hublink',
    description: en.meta.description,
    images: ['/app-clair.png'],
    locale: 'en',
    type: 'website'
  }
};

export default function EnglishPage() {
  return <Vitrine t={en} locale="en" />;
}

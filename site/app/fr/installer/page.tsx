import type { Metadata } from 'next';
import GuideInstallation from '../../guide';
import { guides } from '../../guide-content';

export const metadata: Metadata = {
  title: guides.fr.meta.title,
  description: guides.fr.meta.description,
  alternates: { canonical: '/fr/installer', languages: { en: '/install', fr: '/fr/installer' } }
};

export default function PageInstaller() {
  return <GuideInstallation locale="fr" />;
}

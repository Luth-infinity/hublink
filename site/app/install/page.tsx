import type { Metadata } from 'next';
import GuideInstallation from '../guide';
import { guides } from '../guide-content';

export const metadata: Metadata = {
  title: guides.en.meta.title,
  description: guides.en.meta.description,
  alternates: { canonical: '/install', languages: { en: '/install', fr: '/fr/installer' } }
};

export default function InstallPage() {
  return <GuideInstallation locale="en" />;
}

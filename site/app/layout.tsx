import type { Metadata } from 'next';
import './globals.css';

const description =
  "Regroupez les webapps de plusieurs comptes dans une seule fenêtre. Chaque compte garde sa session : deux Teams, deux Slack, deux Gmail cohabitent sans se déconnecter.";

export const metadata: Metadata = {
  title: 'Hublink — un client desktop pour vos comptes clients',
  description,
  icons: { icon: '/favicon.png' },
  openGraph: {
    title: 'Hublink',
    description,
    images: ['/app-clair.png'],
    type: 'website'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* `suppressHydrationWarning` : le script plus bas ajoute une classe à
       <html> avant l'hydratation, ce que React signalerait sinon comme une
       divergence serveur / client. */
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Marque la page comme animable seulement si JS tourne : sans cela, un
            échec de script laisserait tout le contenu invisible. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('js')`
          }}
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}

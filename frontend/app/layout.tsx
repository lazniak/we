import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import BackgroundVideo from '@/components/BackgroundVideo';

const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-outfit',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://transfer.hexart.io';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // The tab reads "hexart.io" on purpose - the domain is the advertisement,
  // so anyone who glances at the tab or a shared link sees the studio name.
  title: 'hexart.io',
  description:
    'Wyślij do 5 GB bez zakładania konta. Katalogi zachowują strukturę, link wygasa po 3–7 dniach, a pliki kasują się same. Od HEXART Studio — automatyzacja AI, produkcja wideo i XR.',
  applicationName: 'hexart.io',
  openGraph: {
    title: 'hexart.io — szybki transfer plików od HEXART Studio',
    description:
      'Wyślij do 5 GB bez zakładania konta. Katalogi zachowują strukturę, a pliki kasują się same po wygaśnięciu linku.',
    type: 'website',
    locale: 'pl_PL',
    siteName: 'hexart.io',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={outfit.variable}>
      <body className="min-h-screen antialiased">
        <BackgroundVideo />
        <div className="min-h-screen flex flex-col">{children}</div>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-outfit',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://transfer.hexart.io';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'HEXART Transfer — szybkie przesyłanie plików',
  description:
    'Wyślij do 5 GB bez zakładania konta. Katalogi zachowują strukturę, link wygasa po 3–7 dniach, a pliki kasują się same.',
  openGraph: {
    title: 'HEXART Transfer — szybkie przesyłanie plików',
    description:
      'Wyślij do 5 GB bez zakładania konta. Katalogi zachowują strukturę, a pliki kasują się same po wygaśnięciu linku.',
    type: 'website',
    locale: 'pl_PL',
    siteName: 'HEXART Transfer',
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
        <div className="min-h-screen flex flex-col">{children}</div>
      </body>
    </html>
  );
}

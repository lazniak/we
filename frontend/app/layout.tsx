import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import BackgroundVideo from '@/components/BackgroundVideo';
import PwaProvider from '@/components/PwaProvider';

const outfit = localFont({
  src: [
    { path: '../public/fonts/outfit-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: '../public/fonts/outfit-latin-ext-wght-normal.woff2', weight: '100 900', style: 'normal' },
  ],
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
    'Wyślij do 5 GB bez zakładania konta. Katalogi zachowują strukturę, link wygasa po 3–7 dniach, a pliki kasują się same. Od HEXART Studio: film, XR i systemy AI.',
  applicationName: 'HEXART Transfer',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icons/favicon.svg', type: 'image/svg+xml' }, { url: '/icons/favicon.ico' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, title: 'HEXART Transfer', statusBarStyle: 'black-translucent' },
  openGraph: {
    title: 'hexart.io. Szybki transfer plików od HEXART Studio',
    description:
      'Wyślij do 5 GB bez zakładania konta. Katalogi zachowują strukturę, a pliki kasują się same po wygaśnięciu linku.',
    type: 'website',
    locale: 'pl_PL',
    siteName: 'hexart.io',
  },
  // Kept out of search indexes on purpose - the site travels only through the
  // links people share, not through crawlers.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
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
        <PwaProvider><div className="relative z-10 min-h-screen flex flex-col">{children}</div></PwaProvider>
      </body>
    </html>
  );
}

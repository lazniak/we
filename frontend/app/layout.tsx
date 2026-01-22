import type { Metadata, Viewport } from 'next';
import { Saira, Roboto_Condensed } from 'next/font/google';
import './globals.css';

const saira = Saira({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-saira',
});

const robotoCondensed = Roboto_Condensed({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto-condensed',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://we.pablogfx.com'),
  title: 'we.pablogfx.com - Simple File Transfer',
  description: 'Transfer files up to 5GB with a simple drag and drop. No signup required.',
  openGraph: {
    title: 'we.pablogfx.com - Simple File Transfer',
    description: 'Transfer files up to 5GB with a simple drag and drop. No signup required.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${saira.variable} ${robotoCondensed.variable}`}>
      <body className="min-h-screen bg-bg-primary antialiased">
        <div className="min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}

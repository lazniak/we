import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://transfer.hexart.io';

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Lets a browser tab ask whether this app is already installed
    // (navigator.getInstalledRelatedApps), so it stops offering installation.
    related_applications: [{ platform: 'webapp', url: `${SITE_URL}/manifest.webmanifest` }],
    prefer_related_applications: false,
    id: '/',
    name: 'HEXART Transfer',
    short_name: 'HEXART Transfer',
    description: 'Wysyłaj i odbieraj pliki z HEXART. Do 5 GB bez zakładania konta.',
    lang: 'pl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0c',
    theme_color: '#0a0a0c',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

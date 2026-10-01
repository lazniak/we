/* Only public interface assets are cached. Transfer requests bypass this worker. */
const PREFIX = 'hexart-transfer-';
const VERSION = '20261001-1';
const SHELL = `${PREFIX}shell-${VERSION}`;
const ASSETS = `${PREFIX}assets-${VERSION}`;
const OFFLINE = '/offline.html';
const PUBLIC_SHELL = [OFFLINE, '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PUBLIC_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== SHELL && key !== ASSETS).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function remember(cacheName, request, response, limit) {
  if (!response.ok || response.status !== 200 || response.type === 'opaque') return;
  const copy = response.clone();
  const cache = await caches.open(cacheName);
  await cache.put(request, copy);
  if (limit) {
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.headers.has('range') || request.headers.has('authorization') || request.headers.has('x-owner-token')) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;

  if (request.mode === 'navigate') {
    // Only the public home page can be remembered. Recipient pages, passwords,
    // download links and transfer status never enter Cache Storage.
    const home = url.pathname === '/' && !url.search;
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (home && response.ok && response.headers.get('content-type')?.includes('text/html')) {
          event.waitUntil(remember(SHELL, '/', response).catch(() => {}));
        }
        return response;
      } catch {
        const shell = await caches.open(SHELL);
        return (home && await shell.match('/')) || await shell.match(OFFLINE) || Response.error();
      }
    })());
    return;
  }

  // RSC responses, mutable API responses, previews and background video are
  // deliberately outside this allowlist, including requests with query tokens.
  const publicAsset = /^\/_next\/static\//.test(url.pathname)
    || /^\/(fonts|icons)\/[^/]+\.(woff2|png|svg|ico)$/.test(url.pathname)
    || /^\/promo\/[^/]+\.webp$/.test(url.pathname);
  if (!publicAsset || [...url.searchParams.keys()].some((key) => key !== 'v')) return;
  event.respondWith((async () => {
    const cache = await caches.open(ASSETS);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    event.waitUntil(remember(ASSETS, request, response, 120).catch(() => {}));
    return response;
  })());
});

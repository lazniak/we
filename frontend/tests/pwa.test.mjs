import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { detectInstallPlatform, installInstructions } from '../lib/pwa.ts';
import { promptInstallation } from '../lib/pwa-install.ts';

describe('direct browser installation', () => {
  test('opens the deferred browser prompt from the click and respects dismissal', async () => {
    let prompts = 0;
    let alternativePrompts = 0;
    for (const outcome of ['accepted', 'dismissed']) {
      const result = promptInstallation({ prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome }) }, { install: async () => { alternativePrompts++; } });
      expect(prompts).toBe(outcome === 'accepted' ? 1 : 2); // Invoked before the first await.
      expect(await result).toBe(true);
    }
    expect(alternativePrompts).toBe(0);
  });
  test('uses the current-page Web Install API when there is no deferred prompt', async () => {
    let prompts = 0;
    const browser = { install: async function () { expect(this).toBe(browser); prompts++; } };
    const result = promptInstallation(null, browser);
    expect(prompts).toBe(1);
    expect(await result).toBe(true);
    expect(await promptInstallation(null, { install: async () => { throw new DOMException('Cancelled', 'AbortError'); } })).toBe(true);
  });
  test('shows guidance only for missing or unavailable installation APIs', async () => {
    expect(await promptInstallation(null, {})).toBe(false);
    expect(await promptInstallation(null, { install: async () => { throw new DOMException('Unavailable', 'NotAllowedError'); } })).toBe(false);
    expect(await promptInstallation({ prompt: async () => { throw new Error('Unavailable'); }, userChoice: Promise.resolve({ outcome: 'accepted' }) }, {})).toBe(false);
  });
});

describe('installation instructions', () => {
  test('recognizes iPhone, desktop-mode iPad, Android and desktop Mac', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)')).toBe('ios');
    expect(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605', 5)).toBe('ios');
    expect(detectInstallPlatform('Mozilla/5.0 (Linux; Android 16) Chrome/140')).toBe('android');
    expect(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605', 0)).toBe('mac');
    expect(detectInstallPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop');
  });
  test('Mac Chromium uses browser installation, Safari uses Add to Dock', () => {
    expect(installInstructions('mac', 'Macintosh Safari/605').steps.join(' ')).toContain('Docka');
    expect(installInstructions('mac', 'Macintosh Chrome/140 Safari/537').steps.join(' ')).toContain('Chrome lub Edge');
    expect(installInstructions('ios', 'Macintosh Safari/605').device).toBe('iPad');
  });
});

function worker() {
  const origin = 'https://transfer.hexart.io';
  const listeners = {};
  const stores = new Map();
  let online = true;
  let networkVersion = 'fresh';
  const normalize = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
    async open(key) {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return {
        async addAll(paths) { for (const path of paths) store.set(normalize(path), new Response(path)); },
        async put(request, response) { store.set(normalize(request), response.clone()); },
        async match(request) { return store.get(normalize(request))?.clone(); },
        async keys() { return [...store.keys()]; },
        async delete(request) { return store.delete(normalize(request)); },
      };
    },
  };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin }, addEventListener: (type, listener) => { listeners[type] = listener; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, URL, Response,
    fetch: async () => {
      if (!online) throw new Error('offline');
      return new Response(networkVersion, { headers: { 'content-type': 'text/html' } });
    },
  });
  return {
    stores,
    setOnline(value) { online = value; },
    setVersion(value) { networkVersion = value; },
    async lifecycle(type) { let promise; listeners[type]({ waitUntil: (value) => { promise = value; } }); await promise; },
    async request(path, { method = 'GET', headers = {}, mode = 'cors' } = {}) {
      let response;
      const background = [];
      listeners.fetch({
        request: { url: new URL(path, origin).href, method, headers: new Headers(headers), mode },
        respondWith(value) { response = value; },
        waitUntil(value) { background.push(value); },
      });
      const result = response ? await response : undefined;
      await Promise.all(background);
      return result;
    },
  };
}

describe('public-only service worker cache', () => {
  test('bypasses uploads, unlocks, downloads, owner thumbnails, ranges and cross-origin traffic', async () => {
    const sw = worker();
    await sw.lifecycle('install');
    for (const path of ['/api/transfer/123', '/api/transfer/123/unlock', '/api/transfer/123/download', '/ws/123', '/_next/static/app.js?token=secret', '/promo/test.webp?owner=secret', 'https://hexart.pl/promo/test.webp']) {
      expect(await sw.request(path)).toBeUndefined();
    }
    expect(await sw.request('/api/upload', { method: 'POST' })).toBeUndefined();
    expect(await sw.request('/promo/test.webp', { headers: { 'X-Owner-Token': 'secret' } })).toBeUndefined();
    expect(await sw.request('/_next/static/app.js', { headers: { Range: 'bytes=0-9' } })).toBeUndefined();
    expect(await sw.request('/_next/static/app.js', { headers: { Authorization: 'Bearer secret' } })).toBeUndefined();
  });
  test('keeps home fresh online, provides offline fallback and never caches recipient pages or RSC', async () => {
    const sw = worker();
    await sw.lifecycle('install');
    expect(await (await sw.request('/', { mode: 'navigate' })).text()).toBe('fresh');
    sw.setVersion('new-build');
    expect(await (await sw.request('/', { mode: 'navigate' })).text()).toBe('new-build');
    expect(await (await sw.request('/transfer-id', { mode: 'navigate' })).text()).toBe('new-build');
    expect(await sw.request('/?_rsc=abc')).toBeUndefined();
    sw.setOnline(false);
    expect(await (await sw.request('/', { mode: 'navigate' })).text()).toBe('new-build');
    expect(await (await sw.request('/transfer-id', { mode: 'navigate' })).text()).toBe('/offline.html');
    expect([...sw.stores.values()].some((cache) => [...cache.keys()].some((key) => key.includes('transfer-id')))).toBe(false);
  });
  test('public assets remain available offline and updates remove only our old cache', async () => {
    const sw = worker();
    await sw.lifecycle('install');
    sw.stores.set('another-app-cache', new Map());
    sw.stores.set('hexart-transfer-assets-old', new Map());
    expect(await (await sw.request('/promo/test.webp?v=20261001')).text()).toBe('fresh');
    sw.setOnline(false);
    expect(await (await sw.request('/promo/test.webp?v=20261001')).text()).toBe('fresh');
    await sw.lifecycle('activate');
    expect(sw.stores.has('another-app-cache')).toBe(true);
    expect(sw.stores.has('hexart-transfer-assets-old')).toBe(false);
  });
  test('keeps film posters offline but never stores the films', async () => {
    const sw = worker();
    await sw.lifecycle('install');
    expect(await (await sw.request('/promo/video/film.webp?v=abc')).text()).toBe('fresh');
    expect(await sw.request('/promo/video/film-720.mp4?v=abc')).toBeUndefined();
    expect(await sw.request('/promo/video/film-1080.webm?v=abc')).toBeUndefined();
    expect(await sw.request('/promo/video/film-720.mp4?v=abc', { headers: { Range: 'bytes=0-' } })).toBeUndefined();
    expect(await sw.request('/promo/video/nested/film.webp')).toBeUndefined();
  });
});

/*
 * Samaroh service worker — read-only offline cache (spec §1.2/§8).
 *
 * Approach (documented in docs/decisions.md): hand-rolled SW instead of
 * next-pwa/Workbox — next-pwa is not maintained for the App Router and
 * Workbox would be a build-time dependency for ~60 lines of logic. Writes
 * are NOT handled here: they go through the Dexie outbox in the app
 * (src/lib/outbox), which replays FIFO on reconnect.
 *
 * Strategy:
 *  - Navigations (HTML): network-first, falling back to the last cached copy
 *    of the same URL, then to the section root, then to any cached shell.
 *  - Hashed build assets (/_next/static), icons and fonts: cache-first
 *    (immutable by construction).
 *  - Supabase/API requests are never cached (auth-sensitive, and reads must
 *    be as fresh as the network allows).
 */
const VERSION = 'v1';
const PAGE_CACHE = `samaroh-pages-${VERSION}`;
const ASSET_CACHE = `samaroh-assets-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('samaroh-') && n !== PAGE_CACHE && n !== ASSET_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

async function handleNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }
    // Fall back to the locale's booking home (the app's start section),
    // then to any cached page at all — a stale shell beats a browser error.
    const url = new URL(request.url);
    const locale = url.pathname.split('/')[1] || 'en';
    const home = await cache.match(new URL(`/${locale}/booking`, url.origin).toString());
    if (home) {
      return home;
    }
    const all = await cache.keys();
    if (all.length > 0) {
      const any = await cache.match(all[0]);
      if (any) {
        return any;
      }
    }
    throw err;
  }
}

async function handleAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return; // writes are the outbox's job, never the SW's
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return; // never intercept Supabase or other cross-origin calls
  }
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isCacheableAsset(url)) {
    event.respondWith(handleAsset(request));
  }
});

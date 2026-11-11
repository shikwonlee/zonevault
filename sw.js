// ==========================================
// ZONE VAULT — Service Worker (sw.js)
// Offline capability & fast repeat loads for Landing Page assets
// ==========================================

const CACHE_VERSION = 'v2.1.0';
const LANDING_CACHE = `zv-landing-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `zv-runtime-assets-${CACHE_VERSION}`;

// Core landing page assets precached on install for instant load on slow/offline networks
const LANDING_PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/index.css',
  '/js/index.js',
  '/js/firebase-init.js',
  '/manifest.json',
  '/new_logo.png',
  '/favicon-new.png'
];

const LANDING_ASSET_PATHS = new Set(LANDING_PRECACHE_ASSETS);

// 1. INSTALL: Precache landing page assets resiliently and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(LANDING_CACHE).then(async (cache) => {
      await Promise.allSettled(
        LANDING_PRECACHE_ASSETS.map(async (assetUrl) => {
          try {
            const response = await fetch(new Request(assetUrl, { cache: 'reload' }));
            if (response && response.ok) {
              await cache.put(assetUrl, response.clone());
            }
          } catch (err) {
            // Ignore individual precache failures on flaky connections
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVATE: Clean up obsolete caches and claim active clients
self.addEventListener('activate', (event) => {
  const validCaches = new Set([LANDING_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (!validCaches.has(cacheName)) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Helper: Determine if a request must strictly bypass the Service Worker cache
function shouldBypassCache(url) {
  const pathname = url.pathname.toLowerCase();

  // Never cache API endpoints, encrypted media configs, stream tokens, or video segments
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/zv-') ||
    pathname.startsWith('/stream') ||
    pathname.endsWith('_config.js') ||
    pathname.endsWith('.m3u8') ||
    pathname.endsWith('.ts') ||
    pathname.endsWith('.mp4') ||
    pathname.endsWith('.mkv')
  ) {
    return true;
  }

  // Never cache Firebase Auth / Realtime Database live endpoints or Google Analytics
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('google-analytics.com')
  ) {
    return true;
  }

  return false;
}

// Helper: Fetch with timeout so slow networks fall back to cache quickly
function fetchWithTimeout(request, timeoutMs = 2200) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Network timeout'));
    }, timeoutMs);

    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// 3. FETCH: Serve landing page assets with Stale-While-Revalidate & fast offline fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests over http/https
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  if (shouldBypassCache(url)) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isLandingNavigation =
    request.mode === 'navigate' &&
    isSameOrigin &&
    (url.pathname === '/' || url.pathname === '/index.html');

  // Strategy A: Landing Page Navigation (/ or /index.html)
  // Stale-While-Revalidate / Fast Network Timeout with guaranteed offline fallback
  if (isLandingNavigation) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(LANDING_CACHE);
        const cachedPage =
          (await cache.match('/index.html')) ||
          (await cache.match('/')) ||
          (await cache.match(request));

        const networkFetch = fetchWithTimeout(request, 2200)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              cache.put('/index.html', networkResponse.clone());
              cache.put('/', networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        // If cached copy exists, serve immediately on slow/offline networks while revalidating
        if (cachedPage) {
          event.waitUntil(networkFetch);
          return cachedPage;
        }

        const freshResponse = await networkFetch;
        if (freshResponse) return freshResponse;

        return new Response(
          '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zone Vault — Offline</title><style>body{background:#050505;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}h1{font-size:1.5rem;margin-bottom:8px}p{color:#a1a1aa;font-size:0.95rem}</style></head><body><div><h1>You are currently offline</h1><p>Please check your connection and reload Zone Vault.</p></div></body></html>',
          {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          }
        );
      })()
    );
    return;
  }

  // Strategy B: Core Landing Page Assets (CSS, JS, Manifest, Logos)
  // Stale-While-Revalidate for instant load on slower networks + background update
  if (isSameOrigin && LANDING_ASSET_PATHS.has(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(LANDING_CACHE);
        const cachedResponse = (await cache.match(url.pathname)) || (await cache.match(request));

        const networkPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              cache.put(url.pathname, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        if (cachedResponse) {
          event.waitUntil(networkPromise);
          return cachedResponse;
        }

        const freshResponse = await networkPromise;
        if (freshResponse) return freshResponse;

        return new Response('', { status: 504, statusText: 'Offline' });
      })()
    );
    return;
  }

  // Strategy C: Landing Page External Assets (Google Fonts, FontAwesome, Cloudinary Brand Logos, Firebase SDK modules)
  const isLandingExternalAsset =
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('res.cloudinary.com') ||
    url.hostname.includes('gstatic.com');

  if (isLandingExternalAsset) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cachedResponse = await cache.match(request);

        const networkPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        if (cachedResponse) {
          event.waitUntil(networkPromise);
          return cachedResponse;
        }

        const freshResponse = await networkPromise;
        return freshResponse || new Response('', { status: 504, statusText: 'Offline' });
      })()
    );
  }
});

// Allow immediate activation when triggered by client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

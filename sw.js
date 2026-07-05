// ==========================================
// 1. CONFIGURATION & CACHING
// ==========================================
const CACHE_NAME = 'zonevault-v250'; // BUMPED VERSION TO FORCE REFRESH (v207 -> v208)
const urlsToCache = [
  './',
  './index.html',
  './home.html',
  './profile.html',
  './maintenance.html',
  './login.js',
  './profile.js'
];

// INSTALL: Cache essential files
self.addEventListener('install', event => {
  console.log('[sw.js] Installing version:', CACHE_NAME);
  self.skipWaiting(); // Force activation immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// ACTIVATE: Clean up old caches completely
self.addEventListener('activate', event => {
  console.log('[sw.js] Activating and Purging old versions...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[sw.js] Deleting obsolete cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim()) // Immediate control of all tabs
  );
});

// ==========================================
// 2. SMART FETCH STRATEGY
// ==========================================
self.addEventListener('fetch', event => {
  const request = event.request;

  // Skip non-GET and non-HTTP requests
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;

  // STRATEGY: Network-Only for Live Streams and Video Files
  // Para hindi mag-loop sa 10 seconds ang live stream (Bypass Cache)
  if (
    request.url.includes('.m3u8') || 
    request.url.includes('.ts') || 
    request.url.includes('.mp4') || 
    request.destination === 'video' ||
    request.url.includes('artplayer')
  ) {
    event.respondWith(fetch(request));
    return; // Stop here para hindi na bumaba sa Cache-First
  }

  // STRATEGY: Network-First for JS and HTML
  // Para siguradong laging bago ang login.js at profile.js
  if (request.url.includes('.js') || request.url.includes('.html') || request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          // Update cache with the fresh version
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          return networkResponse;
        })
        .catch(() => caches.match(request)) // Fallback to cache only if offline
    );
  } else {
    // STRATEGY: Cache-First for Images/CSS (Para mabilis ang load)
    event.respondWith(
      caches.match(request).then(response => {
        return response || fetch(request).then(networkResponse => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          return networkResponse;
        });
      }).catch(() => {
        if (request.destination === 'image') {
           return new Response('Offline', { status: 404 });
        }
      })
    );
  }
});

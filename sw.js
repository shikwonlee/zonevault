// ==========================================
// sw.js — SELF-DESTRUCT / KILL SWITCH
// ==========================================
// Purpose: fully remove the old caching service worker so the site
// always loads fresh files straight from the network, no more
// "old code keeps showing up" issues, no more version bumping or
// filename renaming needed on every update.
//
// What it does:
// 1. Activates immediately (skipWaiting)
// 2. Deletes every existing cache this SW owns
// 3. Unregisters itself so it won't run again
// 4. Reloads any open tabs once so they detach from the SW cleanly
// ==========================================

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(cacheNames.map(name => caches.delete(name))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then(clientsList => {
        clientsList.forEach(client => client.navigate(client.url));
      })
  );
});

// No fetch handler at all — once this finishes activating and
// unregistering, the browser stops routing requests through any
// service worker for this site, and everything just goes straight
// to the network/normal browser cache like a site with no SW.

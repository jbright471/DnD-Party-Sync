// Arcane Ally — Service Worker
// Strategy: network-first for API, cache-first for static assets

const CACHE_NAME = 'dnd-offline-v2';

// On install — skip waiting to activate immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

// On activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and same-origin check
  if (request.method !== 'GET') return;

  // R1-E: authenticated API responses must never enter the shared offline cache.
  if (url.pathname.startsWith('/api/')) return;

  // Static assets — cache-first (Vite handles hashed filenames)
  if (url.pathname.startsWith('/assets/') || url.pathname === '/') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});

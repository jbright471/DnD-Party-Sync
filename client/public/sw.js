// DnD Party Sync — Service Worker
// Strategy: network-first for API, cache-first for static assets

const CACHE_NAME = 'dnd-offline-v1';
const API_CACHE_PATTERNS = [
  /\/api\/characters\/\d+/,
  /\/api\/offline-bundle/,
  /\/api\/effect-timeline/,
];

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

  // Never cache DM-only endpoints
  if (url.pathname.startsWith('/api/dm-notes')) return;
  // Never cache write/mutation endpoints
  if (url.pathname.startsWith('/api/auth')) return;

  const isApiCacheable = API_CACHE_PATTERNS.some(p => p.test(url.pathname));

  if (isApiCacheable) {
    // Network-first: try network, fall back to cache
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

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

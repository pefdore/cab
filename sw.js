const CACHE_NAME = 'cotation-v202610292100';
const ASSETS = [
  '/',
  '/index.html',
  '/app.v5.js?v=202610292100',
  '/secretariat.js?v=202611024000',
  '/secretaire-space.js?v=202611024000',
  '/urgence.js?v=202611024000',
  '/urgence-orders.js?v=202611024000',
  '/style.css?v=202610292100',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS).catch(() => {}))  // ne bloque pas l'install si un asset CDN est indisponible
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);  // purge TOUS les anciens caches
          }
        })
      )
    )
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Jamais de cache pour l'API
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Auth Supabase / API externes : reseau direct (pas de cache)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // 3. Static assets: cache-first avec update en arriere-plan
  if (request.method === 'GET' && url.origin === location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request, { ignoreSearch: true });
        const fetchPromise = fetch(request).then(response => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
  }
});

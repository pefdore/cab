const CACHE_NAME = 'cotation-v202610261800';
const ASSETS = [
  '/',
  '/index.html',
  '/app.v5.js?v=202610261800',
  '/style.css?v=202610261800',
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
    ).then(() => self.clients.claim())  // prend le contrôle immédiatement des onglets ouverts
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // N'intercepter que les requêtes same-origin (app, JS, CSS)
  if (url.origin !== self.location.origin) return;

  // Stratégie network-first : reseau d'abord, cache en secours.
  // Evite de servir indefiniment une vieille version, et evite la page blanche
  // quand l'URL versionnee n'est pas encore en cache.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() =>
        // secours hors-ligne : cache, sinon la page d'accueil
        caches.match(event.request).then(cached =>
          cached || caches.match('/index.html')
        )
      )
  );
});

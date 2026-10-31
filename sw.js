const CACHE_NAME = 'cotation-v2026110113000';
const ASSETS = [
  '/',
  '/index.html',
  '/app.v5.js?v=2026103024000',
  '/secretariat.js?v=2026103024000',
  '/secretaire-space.js?v=2026103024000',
  '/urgence.js?v=2026103024000',
  '/urgence-orders.js?v=2026103024000',
  '/style.css?v=2026103024000',
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

  // 3. Static assets: NETWORK-FIRST (reseau d'abord, cache seulement hors ligne).
  // Guarantit que chaque deploiement est immediatement servi apres un simple
  // rechargement - le cache-first faisait tourner de vieux code pendant des heures.
  if (request.method === 'GET' && url.origin === location.origin) {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() =>
        caches.match(request).then(cached => cached || caches.match('/index.html'))
      )
    );
  }
});

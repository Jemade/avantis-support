// Avantis PC Assist — Lightweight Service Worker
const CACHE_NAME = 'avantis-assist-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/src/app.js',
  '/manifest.json',
  '/assets/avantis-brand.css',
  '/assets/avantis_logo.png',
  '/assets/Avantis-logo-prl.png',
  '/assets/avantis-icon.svg',
  '/assets/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[Avantis SW] Cache prefetch error:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass API calls to background agent (port 9140) and platform backend (port 9141)
  if (url.port === '9140' || url.port === '9141' || url.pathname.startsWith('/api')) {
    return;
  }

  // Network first with cache fallback for static app assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('/index.html');
        });
      })
  );
});

const CACHE_NAME = 'farmconnect-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/verify',
  '/marketplace',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-fatal — some assets may not be available offline
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first strategy with cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET and non-HTTP(S) requests
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // Skip API calls and external services — always direct network
  const url = event.request.url;
  if (url.includes('/api/') || 
      url.includes(':3001') || 
      url.includes(':8000') || 
      url.includes(':8001') ||
      url.includes('open-meteo.com') ||
      url.includes('openweathermap.org') ||
      url.includes('@vite') ||
      url.includes('/@fs/') ||
      url.includes('/src/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful static responses
        if (response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Fallback to index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html').then(html => html || fetch('/index.html'));
          }
          return new Response('', { status: 404, statusText: 'Not Found' });
        });
      })
  );
});

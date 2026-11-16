const CACHE_NAME = 'saill-static-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - pre-cache essential static assets only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // console.log('[SAILL SW] Pre-caching static offline assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SAILL SW] Pre-cache warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches and purge any accidental API entries
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            // console.log('[SAILL SW] Purging old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(async () => {
      // Ensure no /api/ responses exist in the active cache
      try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        await Promise.all(
          keys.map((request) => {
            const url = new URL(request.url);
            if (url.pathname.startsWith('/api/')) {
              return cache.delete(request);
            }
          })
        );
      } catch (err) {
        console.warn('[SAILL SW] Error sanitizing active cache:', err);
      }
    })
  );
  self.clients.claim();
});

// Fetch event - STRICT STATIC ASSET ONLY caching.
// Dynamic /api/* responses are NEVER intercepted or cached.
self.addEventListener('fetch', (event) => {
  // 1. Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // 2. Never intercept non-HTTP/HTTPS schemes (e.g. chrome-extension:, blob:)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 3. CRITICAL: NEVER cache or intercept /api/* requests.
  // All student, faculty, admin, authentication, progress, evaluation, batch,
  // report, and system APIs must ALWAYS fetch live data directly from the server.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 4. Prevent session/user data leakage: bypass any request carrying authentication headers
  if (
    event.request.headers.has('Authorization') ||
    event.request.headers.has('x-auth-token') ||
    event.request.headers.has('x-user-role') ||
    event.request.headers.has('x-student-roll') ||
    event.request.headers.has('x-faculty-id')
  ) {
    return;
  }

  // 5. ONLY static assets may use service-worker caching:
  // - HTML document navigations (to load the SPA shell offline)
  // - Known static asset extensions (JS, CSS, images, fonts, audio, manifest)
  const isNavigation = event.request.mode === 'navigate';
  const isStaticFile = /\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|mp3|wav|ogg|json)$/i.test(url.pathname);
  const isRootOrShell = url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.json';

  if (!isNavigation && !isStaticFile && !isRootOrShell) {
    // Non-static asset: bypass service worker, let browser fetch directly
    return;
  }

  // 6. Navigation handling: Network-First with offline fallback to cached index.html
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone).catch(() => {}));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('/index.html') || caches.match('/');
        })
    );
    return;
  }

  // 7. Static asset handling (JS, CSS, fonts, images, audio): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors') &&
            !url.pathname.startsWith('/api/')
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone).catch(() => {}));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Message event listener
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


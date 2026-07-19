const STATIC_CACHE = 'pkb-static-v242';
const API_CACHE = 'pkb-api-v242';

const SHELL_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/badge.svg',
  '/passports/manifest.json'
];

function cacheMatchAny(cache, request) {
  return cache.match(request, { ignoreSearch: true }).then(function(hit) {
    if (hit) return hit;
    return cache.match(new URL(request.url).pathname, { ignoreSearch: true });
  });
}

function putCache(cache, request, response) {
  if (response && response.ok) {
    return cache.put(request, response.clone()).then(function() { return response; });
  }
  return response;
}

function cacheFirst(request, revalidate) {
  return caches.open(STATIC_CACHE).then(function(cache) {
    return cacheMatchAny(cache, request).then(function(cached) {
      if (cached) {
        if (revalidate) {
          fetch(request).then(function(res) {
            putCache(cache, request, res);
          }).catch(function() {});
        }
        return cached;
      }
      return fetch(request).then(function(res) {
        return putCache(cache, request, res);
      });
    });
  });
}

function networkFirstApi(request) {
  return caches.open(API_CACHE).then(function(cache) {
    return fetch(request).then(function(res) {
      return putCache(cache, request, res);
    }).catch(function() {
      return cacheMatchAny(cache, request).then(function(cached) {
        if (cached) return cached;
        throw new Error('offline');
      });
    });
  });
}

function precacheUrls(cache, urls) {
  return Promise.all(urls.map(function(url) {
    return cache.add(url).catch(function(err) {
      console.warn('[sw] precache failed:', url, err);
    });
  }));
}

function precacheFromManifest(cache) {
  return fetch('/passports/manifest.json', { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(m) {
      if (!m || !Array.isArray(m.assets)) return;
      return precacheUrls(cache, m.assets);
    })
    .catch(function(err) {
      console.warn('[sw] manifest precache failed:', err);
    });
}

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return precacheUrls(cache, SHELL_PRECACHE).then(function() {
        return precacheFromManifest(cache);
      });
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) {
        return k !== STATIC_CACHE && k !== API_CACHE;
      }).map(function(k) { return caches.delete(k); }));
    }).then(function() {
      return caches.open(STATIC_CACHE).then(precacheFromManifest);
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('message', function(e) {
  var data = e.data || {};
  if (data.type === 'PRECACHE_PASSPORTS') {
    e.waitUntil(caches.open(STATIC_CACHE).then(precacheFromManifest));
  }
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', function(e) {
  var data = { title: '⚠ Нарушение КБ', body: '', tag: 'violation' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge.svg',
      tag: data.tag || 'violation',
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      data: { url: '/' },
    }).then(function() {
      return self.registration.getNotifications().then(function(ns) {
        if (navigator.setAppBadge) navigator.setAppBadge(ns.length).catch(function() {});
      }).catch(function() {
        if (navigator.setAppBadge) navigator.setAppBadge(1).catch(function() {});
      });
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url === '/' || c.url.indexOf(self.location.origin) === 0) {
          return c.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirstApi(e.request));
    return;
  }

  if (url.pathname.startsWith('/passports/')) {
    e.respondWith(cacheFirst(e.request, true));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/sw.js') {
    e.respondWith(cacheFirst(e.request, true));
    return;
  }

  e.respondWith(cacheFirst(e.request, true));
});

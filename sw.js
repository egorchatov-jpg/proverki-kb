const CACHE = 'pkb-v202';
const PASSPORT_PRECACHE = [
  "/passports/dtp-01.json",
  "/passports/dtp-01/img/appendix-41.jpg",
  "/passports/dtp-01/img/appendix-71.jpg",
  "/passports/dtp-01/img/appendix-81.jpg",
  "/passports/elb-01.json",
  "/passports/elb-01/img/appendix-161.jpg",
  "/passports/gaz-01.json",
  "/passports/gruz-01.json",
  "/passports/gruz-01/img/appendix-11.jpg",
  "/passports/gruz-01/img/appendix-12.jpg",
  "/passports/gruz-01/img/appendix-21.jpg",
  "/passports/gruz-01/img/appendix-51.jpg",
  "/passports/gruz-01/img/appendix-52.jpg",
  "/passports/rv-01.json",
  "/passports/rv-01/img/appendix-11.jpg",
  "/passports/rv-01/img/appendix-12.jpg"
];

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/badge.svg'
];

function precacheAll(cache) {
  const urls = PRECACHE.concat(PASSPORT_PRECACHE);
  return Promise.all(urls.map(function(url) {
    return cache.add(url).catch(function(err) {
      console.warn('[sw] precache failed:', url, err);
    });
  }));
}

function cacheMatch(cache, request) {
  return cache.match(request, { ignoreSearch: true }).then(function(hit) {
    if (hit) return hit;
    var pathOnly = new URL(request.url).pathname;
    return cache.match(pathOnly, { ignoreSearch: true });
  });
}

function cacheFirst(request, revalidate) {
  return caches.open(CACHE).then(function(cache) {
    return cacheMatch(cache, request).then(function(cached) {
      if (cached) {
        if (revalidate) {
          fetch(request).then(function(res) {
            if (res.ok) cache.put(request, res.clone());
          }).catch(function() {});
        }
        return cached;
      }
      return fetch(request).then(function(res) {
        if (res.ok) cache.put(request, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(precacheAll));
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) {
          return caches.delete(k);
        }));
      })
      .then(function() { return self.clients.claim(); })
  );
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
  if (url.pathname.startsWith('/api/')) return;

  var isAppShell = url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/sw.js';
  var isPassport = url.pathname.startsWith('/passports/');

  if (isPassport) {
    e.respondWith(cacheFirst(e.request, true));
    return;
  }

  if (isAppShell) {
    e.respondWith(cacheFirst(e.request, true));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var net = fetch(e.request).then(function(res) {
        if (res.ok) caches.open(CACHE).then(function(c) { c.put(e.request, res.clone()); });
        return res;
      });
      return cached || net;
    })
  );
});

const STATIC_CACHE = 'pkb-static-v396';
const API_CACHE = 'pkb-api-v396';

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

function networkOnlyApi(request) {
  return fetch(request, { cache: 'no-store' });
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
  if (data.type === 'CLEAR_API_CACHE') {
    e.waitUntil(caches.delete(API_CACHE));
  }
  if (data.type === 'CLEAR_ALL_CACHES') {
    e.waitUntil(caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }));
  }
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', function(e) {
  var data = { title: 'Проверки КБ', body: '', tag: 'violation' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (_) {}

  function notifyClients() {
    return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      list.forEach(function(c) {
        try { c.postMessage({ type: 'RECORDS_CHANGED' }); } catch (_) {}
      });
    }).catch(function() {});
  }

  if (data.type === 'sync' || data.silent) {
    e.waitUntil(notifyClients());
    return;
  }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge.svg',
      image: '/og-image.jpg',
      tag: data.tag || 'violation',
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { url: '/?nc=1' },
    }).then(function() {
      return notifyClients();
    }).then(function() {
      return self.registration.getNotifications().then(function(ns) {
        if (navigator.setAppBadge) navigator.setAppBadge(ns.length).catch(function() {});
      }).catch(function() {
        if (navigator.setAppBadge) navigator.setAppBadge(1).catch(function() {});
      });
    })
  );
});

self.addEventListener('pushsubscriptionchange', function(e) {
  e.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: e.oldSubscription ? e.oldSubscription.options.applicationServerKey : undefined
    }).then(function(sub) {
      return fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });
    }).catch(function(err) {
      console.warn('[push] subscription change re-subscribe failed:', err.message);
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(self.location.origin) === 0) {
          c.postMessage({ type: 'NOTIFICATION_CLICK' });
          return c.focus();
        }
      }
      return clients.openWindow('/?nc=1');
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  if (url.pathname === '/api/records' || url.pathname === '/api/checklists' || url.pathname === '/api/backups' || url.pathname.startsWith('/api/photos/list/')) {
    e.respondWith(networkOnlyApi(e.request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirstApi(e.request));
    return;
  }

  if (url.pathname.startsWith('/passports/')) {
    e.respondWith(cacheFirst(e.request, true));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (url.search.indexOf('v=') >= 0) {
      e.respondWith(fetch(e.request, { cache: 'no-store' }).then(function(res) {
        if (!res || !res.ok) return res;
        return caches.open(STATIC_CACHE).then(function(cache) {
          return cache.put(new Request(url.pathname), res.clone()).then(function() { return res; });
        });
      }));
      return;
    }
    e.respondWith(cacheFirst(e.request, true));
    return;
  }

  if (url.pathname === '/sw.js') {
    e.respondWith(cacheFirst(e.request, true));
    return;
  }

  e.respondWith(cacheFirst(e.request, true));
});

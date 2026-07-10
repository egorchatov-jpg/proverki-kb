const CACHE = 'pkb-v35';
const PRECACHE = ['/', '/manifest.json', '/apple-touch-icon.png', '/favicon.png', '/icon-192.png', '/icon-512.png', '/badge.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', e => {
  let data = { title: '⚠ Нарушение КБ', body: '', tag: 'violation' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (_) {}
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
    }).then(() => {
      // Count existing notifications and set badge to the total (iOS requires a number, not a dot)
      return self.registration.getNotifications().then(ns => {
        if (navigator.setAppBadge) navigator.setAppBadge(ns.length).catch(() => {});
      }).catch(() => {
        if (navigator.setAppBadge) navigator.setAppBadge(1).catch(() => {});
      });
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url === '/' || c.url.startsWith(self.location.origin)) {
          return c.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Never cache API routes — always pass through to network
  if (url.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
      return cached || net;
    })
  );
});

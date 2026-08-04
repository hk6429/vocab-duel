/* 字鬥英雄 PWA：離線殼層、Web Push 與今日任務深連結 */
const CACHE = 'vocab-duel-shell-20260804a';
const SHELL = [
  '/', '/index.html', '/css/style.css', '/manifest.webmanifest',
  '/js/store.js', '/js/game.js', '/js/quiz.js', '/js/dailyquest.js', '/js/app.js',
  '/js/speak.js', '/js/report.js',
  '/data/words.json', '/img/ui/h_avatar.webp', '/img/ui/h_daily.webp'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('vocab-duel-shell-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request)
      .then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put('/index.html', response.clone()));
        return response;
      })
      .catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data && event.data.text() }; }
  const title = payload.title || '字鬥英雄・今日 10 題';
  const options = {
    body: payload.body || '用 5–8 分鐘完成今天的學習章回。',
    icon: '/img/ui/h_avatar.webp',
    badge: '/img/ui/h_avatar.webp',
    tag: 'vocab-duel-daily',
    renotify: false,
    data: { url: payload.url || '/?daily=1' },
    actions: [{ action: 'start', title: '開始今日 10 題' }]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/?daily=1', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) {
        if ('navigate' in client) await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});

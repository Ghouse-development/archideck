// ArchiDeck Service Worker v2.0 - 2025-12-13
const CACHE_NAME = 'archideck-v2';
const urlsToCache = [
  '/archideck/index.html',
  '/archideck/manifest.json'
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ時の処理（ネットワーク優先、失敗時はキャッシュ）
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // http/https以外のスキーム（chrome-extension://等）はキャッシュ不可
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  // APIリクエストはキャッシュしない
  if (url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 成功時はキャッシュを更新
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // オフライン時はキャッシュから返す
        return caches.match(event.request);
      })
  );
});

// プッシュ通知受信
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'ArchiDeck';
  const options = {
    body: data.body || '新しい通知があります',
    icon: data.icon || '/archideck/icon-192.png',
    badge: '/archideck/badge.png',
    data: data.url || '/archideck/index.html'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 通知クリック時
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});

// SKIP_WAITINGメッセージを受信したら即座にアクティベート
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

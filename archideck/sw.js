// ArchiDeck Service Worker v4.0 - 2026-01-10
// キャッシュ無効化版（プッシュ通知のみ対応）

// インストール時 - キャッシュなし、即座にアクティベート
self.addEventListener('install', event => {
  self.skipWaiting();
});

// アクティベート時 - 全キャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ時 - キャッシュせず常にネットワークから取得
self.addEventListener('fetch', event => {
  // 何もしない（ブラウザのデフォルト動作に任せる）
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

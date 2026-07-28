const CACHE_NAME = 'pw-v1';

// 需要缓存的资源
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 安装时预缓存核心资源
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    })
  );
  self.clients.claim();
});

// 缓存策略：优先缓存，网络更新后台静默刷新
self.addEventListener('fetch', (e) => {
  // 跳过 GitHub API 请求（不缓存数据请求）
  if (e.request.url.includes('api.github.com') || e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      // 后台更新缓存
      const fetchPromise = fetch(e.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(() => {});

      // 有缓存就用缓存，没有就等网络
      return cached || fetchPromise;
    })
  );
});

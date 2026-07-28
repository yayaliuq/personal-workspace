const CACHE_NAME = 'pw-v3';

// 需要缓存的静态资源
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

// 激活时清理旧缓存，并通知所有页面刷新
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    }).then(() => {
      // SW 更新后通知所有客户端刷新
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
  self.clients.claim();
});

// 网络优先策略：在线时始终拉最新版本，离线时用缓存兜底
self.addEventListener('fetch', (e) => {
  // 跳过 GitHub API 和本地 API 请求（不缓存数据）
  if (e.request.url.includes('api.github.com') || e.request.url.includes('/api/')) {
    return;
  }

  // 只处理 GET 请求
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).then((response) => {
      // 网络成功 → 更新缓存
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(() => {
      // 网络失败 → 返回缓存
      return caches.match(e.request);
    })
  );
});

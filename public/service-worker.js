const CACHE_NAME = 'offline-cache-v4.3.2';
const urlsToCache = [
  '/',
  '/index.html',
  '/ico.png',
  '/ico.png?v=5',
  '/manifest.json',
  '/qr.min.js',
];

// ── 自动更新检测：通过 ETag/Last-Modified 感知 HTML 变化 ─────────────────────
// 无需每次修改 CACHE_NAME，部署后自动触发，离线时静默跳过
let _checkingVersion = false;

async function checkVersion() {
  if (_checkingVersion) return;
  _checkingVersion = true;
  try {
    // HEAD 请求：只取响应头，不下载正文
    const headRes = await fetch('/', { method: 'HEAD', cache: 'no-store' });
    const newMarker = headRes.headers.get('ETag') || headRes.headers.get('Last-Modified');
    if (!newMarker) return;

    const cache = await caches.open(CACHE_NAME);
    const stored = await cache.match('/__sw_version');
    const storedMarker = stored ? await stored.text() : null;

    if (!storedMarker) {
      // 首次运行：记录当前版本，不触发刷新
      await cache.put('/__sw_version', new Response(newMarker));
      return;
    }

    if (storedMarker === newMarker) return; // 无变化

    // 版本已更新：先预取新 HTML 写入缓存（避免 reload 时正好断网）
    const freshRes = await fetch('/', { cache: 'no-store' });
    if (!freshRes.ok) return;

    await cache.put('/', freshRes.clone());
    await cache.put('/__sw_version', new Response(newMarker));

    // 通知所有已打开的窗口刷新
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage({ type: 'SW_UPDATE_AVAILABLE' }));
  } catch {
    // 网络不可用 → 静默失败，离线缓存完好
  } finally {
    _checkingVersion = false;
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 逐条缓存本地资源，单个失败不影响整体安装（弱网容错）
      return Promise.all(
        urlsToCache.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      checkVersion(); // 激活后立即检查是否有新版本
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CHECK_VERSION') {
    checkVersion(); // 客户端切回前台时触发
  }
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // HEAD 请求直接走网络，确保 checkVersion() 能拿到真实 ETag
  if (event.request.method === 'HEAD') {
    event.respondWith(fetch(event.request));
    return;
  }

  // API 请求始终走网络
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML 文件：缓存优先（秒开），checkVersion() 后台检测更新并自动刷新页面
  if (requestUrl.pathname.endsWith('.html') || requestUrl.pathname === '/') {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      // 首次访问（无缓存）：从网络获取
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return cached; // 离线且无缓存时返回 undefined（浏览器显示离线提示）
      }
    })());
    return;
  }

  // 静态资源：缓存优先
  if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/.test(requestUrl.pathname) ||
      requestUrl.hostname === 'cdn.jsdelivr.net' ||
      requestUrl.hostname === 'unpkg.com' ||
      requestUrl.hostname === 'fonts.googleapis.com' ||
      requestUrl.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 其他请求走网络
  event.respondWith(fetch(event.request));
});

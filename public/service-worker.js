// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const CACHE_NAME = 'offline-cache-v6.0.0';
const VERSION_MARKER = '/__hht_lite_version';
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.css?v=v6.0.0',
  '/app.js?v=v6.0.0',
  '/ico.png',
  '/ico.png?v=5',
  '/manifest.json',
  '/qr.min.js?v=v6.0.0',
  '/videos/hdr-primer.mp4'
];

let versionCheck = null;

async function cacheShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(APP_SHELL.map(asset => cache.add(asset)));
}

async function removeSupersededCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
}

async function readDeploymentMarker() {
  const response = await fetch('/', { method: 'HEAD', cache: 'no-store' });
  if (!response.ok) return null;
  return response.headers.get('ETag') || response.headers.get('Last-Modified');
}

async function refreshDocumentIfChanged() {
  if (versionCheck) return versionCheck;
  versionCheck = (async () => {
    try {
      const marker = await readDeploymentMarker();
      if (!marker) return;

      const cache = await caches.open(CACHE_NAME);
      const previousResponse = await cache.match(VERSION_MARKER);
      const previous = previousResponse ? await previousResponse.text() : null;

      if (previous === marker) return;
      if (previous === null) {
        await cache.put(VERSION_MARKER, new Response(marker));
        return;
      }

      const documentResponse = await fetch('/', { cache: 'no-store' });
      if (!documentResponse.ok) return;
      await Promise.all([
        cache.put('/', documentResponse.clone()),
        cache.put(VERSION_MARKER, new Response(marker))
      ]);

      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      windows.forEach(client => client.postMessage({ type: 'SW_UPDATE_AVAILABLE' }));
    } catch {
      // Offline checks are expected to fail quietly.
    }
  })().finally(() => {
    versionCheck = null;
  });
  return versionCheck;
}

async function cachedDocument(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function cachedAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(cacheShell());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await removeSupersededCaches();
    await self.clients.claim();
    await refreshDocumentIfChanged();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data?.type === 'CHECK_VERSION') event.waitUntil(refreshDocumentIfChanged());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === 'HEAD' || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  const documentRequest = request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  if (documentRequest) {
    event.respondWith(cachedDocument(request));
    return;
  }

  const cacheable = url.origin === self.location.origin || [
    'cdn.jsdelivr.net',
    'unpkg.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ].includes(url.hostname);

  event.respondWith(cacheable ? cachedAsset(request) : fetch(request));
});

/* 컨택싱어 서비스 워커: 인터넷이 끊겼을 때만 안내 화면을 보여 준다 (화면을 따로 저장해 두지 않아 항상 최신 화면이 열린다) */
var CACHE = 'cs-offline-v1';
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['offline.html']); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(function () { return caches.match('offline.html'); }));
});

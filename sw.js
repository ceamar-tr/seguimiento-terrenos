// Guarda la página en el equipo para que abra aunque no haya señal.
// Siempre intenta traer la versión nueva primero; si no hay señal, usa la guardada.
var CACHE = 'terrenos-v1';
var BASE = ['./', 'index.html', 'data/matriz.js', 'logos/CEAMAR.jpg', 'logos/ceamar-favicon.png', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(BASE.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;                       // los envíos al servidor (Apps Script) no se tocan
  if (url.hostname.indexOf('script.google') >= 0 || url.hostname.indexOf('googleusercontent') >= 0) return;
  var propio = url.origin === self.location.origin, fuente = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!propio && !fuente) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) { var copia = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copia); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || (req.mode === 'navigate' ? caches.match('index.html') : undefined); });
  }));
});

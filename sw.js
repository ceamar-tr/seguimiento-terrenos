// Guarda la página en el equipo: abre al tiro con la copia guardada (también sin señal)
// y por detrás revisa si hay una versión nueva; si la hay, avisa a la página para actualizar.
var CACHE = 'terrenos-v2';
var BASE = ['./', 'index.html', 'data/matriz.js', 'logos/CEAMAR.jpg', 'logos/ceamar-favicon.png', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(BASE.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
var nueva = false;  // hay una versión nueva guardada que la página abierta aún no muestra
function avisar() { nueva = true; setTimeout(function () { self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ tipo: 'nueva-version' }); }); }); }, 1500); }
self.addEventListener('message', function (e) { if (e.data === 'pregunta' && nueva && e.source) e.source.postMessage({ tipo: 'nueva-version' }); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;                       // los envíos al servidor (Apps Script) no se tocan
  if (url.hostname.indexOf('script.google') >= 0 || url.hostname.indexOf('googleusercontent') >= 0) return;
  var propio = url.origin === self.location.origin, fuente = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!propio && !fuente) return;
  var clave = req.mode === 'navigate' ? (url.origin + (/\/$/.test(url.pathname) ? url.pathname + 'index.html' : url.pathname)) : req;  // la página se guarda como index.html
  if (req.mode === 'navigate') nueva = false;
  var vigilar = req.mode === 'navigate' || /\/(index\.html|data\/matriz\.js)$/.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(clave, { ignoreSearch: true }).then(function (guardada) {
      var previo = guardada && vigilar ? guardada.clone() : null;  // copia para comparar después (la original se entrega a la página)
      var red = fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          var copia = res.clone();
          if (previo) {
            Promise.all([previo.text(), res.clone().text()]).then(function (t) { if (t[0] !== t[1]) { cache.put(clave, copia).then(avisar); } });
          } else cache.put(clave, copia);
        }
        return res;
      }).catch(function () { return guardada; });
      if (guardada) { e.waitUntil(red.catch(function () {})); return guardada; }   // abre al tiro con lo guardado
      return red;
    });
  }));
});

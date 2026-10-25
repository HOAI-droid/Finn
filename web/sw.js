// Service Worker: liefert alle App-Dateien aus dem lokalen Cache (Offline-Betrieb).
// Befüllt und aktualisiert werden die Caches ausschließlich vom Updater (updater.js) – so ändert sich nichts mitten in einer Sitzung.
const CACHES = ['finn-code', 'finn-data'];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    let path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const key = new Request(url.origin + path);
    for (const n of CACHES) { const c = await caches.open(n); const hit = await c.match(key); if (hit) return hit; }
    return fetch(req);
  })());
});

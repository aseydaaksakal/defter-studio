// Çevrimdışı çalışma: önce ağ (her zaman en güncel sürüm), ağ yoksa önbellek.
// Modüller HTTP önbelleğinden değil, sunucuya sorularak (ETag ile, ucuz) alınır: yeni sürümde eski/yeni dosya karışmaz.
const CACHE = 'defter-studio-v4';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // model/API isteklerine dokunma
  const net = e.request.mode === 'navigate' ? fetch(e.request) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(net.then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});

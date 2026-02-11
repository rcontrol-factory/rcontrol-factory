/* RControl Factory - SW (SAFE) */
const CACHE = "rcf-cache-v1";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const net = await fetch(req);
      const url = new URL(req.url);

      // só cacheia coisas do mesmo domínio
      if (url.origin === location.origin) {
        const c = await caches.open(CACHE);
        c.put(req, net.clone()).catch(() => {});
      }
      return net;
    } catch (err) {
      return cached || new Response("Offline", { status: 200 });
    }
  })());
});

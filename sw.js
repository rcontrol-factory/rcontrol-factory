/* RControl Factory - SW (ROOT)
   - Scope "/" (cobre / e /app)
   - Cache simples + fácil de quebrar por version
*/
const SW_VERSION = "rcf-sw-v1";
const CORE_ASSETS = [
  "/",                 // raiz
  "/index.html",
  "/app/styles.css",
  "/app/app.js",
  "/app/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SW_VERSION);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === SW_VERSION ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // só same-origin
  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(SW_VERSION);

    // HTML: network-first (pra evitar “tela velha”)
    if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await cache.match(req);
        return cached || cache.match("/index.html");
      }
    }

    // assets: cache-first
    const cached = await cache.match(req);
    if (cached) return cached;

    const res = await fetch(req);
    // só cacheia se ok
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  })());
});

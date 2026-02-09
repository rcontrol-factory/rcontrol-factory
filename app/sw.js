// app/sw.js  (FORÇA UPDATE)
const CACHE = "rcontrol-factory-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)));
    self.clients.claim();
  })());
});

// network-first pra atualizar mais fácil no Safari
self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const url = new URL(req.url);
      // só cacheia arquivos do próprio site
      if (url.origin === location.origin) {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      return cached || caches.match("./index.html");
    }
  })());
});

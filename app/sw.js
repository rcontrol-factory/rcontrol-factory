/* RControl Factory — SW único (app/sw.js) */
const VERSION = "rcf-sw-v1";
const CACHE = `${VERSION}-cache`;

const ASSETS = [
  "/app/",
  "/app/index.html",
  "/app/styles.css",
  "/app/app.js",
  "/app/manifest.json",

  // JS (se existir, ok — se não existir, o fetch vai falhar e ignora)
  "/app/js/router.js",
  "/app/js/admin.js",
  "/app/js/ui.topbar.js",
  "/app/js/ui.gear.js",

  "/app/js/core/thompson.js",
  "/app/js/core/mother_selfupdate.js",
  "/app/js/core/github_sync.js",
  "/app/js/core/publish_queue.js",

  "/app/js/agent.router.js",
  "/app/js/agent.nlp.js",

  // imports (bundle)
  "/app/import/mother_bundle.json",
  "/app/import/mother_index.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(CACHE);
    // cache “best effort”
    await Promise.all(ASSETS.map(async (url) => {
      try { await cache.add(url); } catch (_) {}
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só GET
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const url = new URL(req.url);

    // Só cuida do escopo /app/
    if (!url.pathname.startsWith("/app/")) {
      return fetch(req);
    }

    // cache-first para estáticos
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone()).catch(()=>{});
      return res;
    } catch (e) {
      // fallback mínimo
      if (url.pathname.endsWith(".html")) {
        const fallback = await caches.match("/app/index.html");
        if (fallback) return fallback;
      }
      return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" }});
    }
  })());
});

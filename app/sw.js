/* RControl Factory SW (único) — /app/sw.js */
const VERSION = "rcf-sw-2026-02-11-v3";
const STATIC_CACHE = `rcf-static-${VERSION}`;
const HTML_CACHE   = `rcf-html-${VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(STATIC_CACHE);
    await c.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k.startsWith("rcf-") && k !== STATIC_CACHE && k !== HTML_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

function isHTML(req) {
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // só controla /app/
  if (!url.pathname.startsWith("/app/")) return;

  // HTML: network-first (pra evitar “tela velha”)
  if (req.method === "GET" && isHTML(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(HTML_CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  // Assets: cache-first + revalida
  if (req.method === "GET") {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) {
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(req);
            const c = await caches.open(STATIC_CACHE);
            c.put(req, fresh.clone());
          } catch (_) {}
        })());
        return cached;
      }

      try {
        const fresh = await fetch(req);
        const c = await caches.open(STATIC_CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return cached || Response.error();
      }
    })());
  }
});

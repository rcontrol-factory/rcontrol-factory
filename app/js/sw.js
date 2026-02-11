/* RControl Factory - Service Worker (SAFE)
   - NÃO intercepta CSS/JS com fallback HTML
   - Fallback só para navegação (HTML)
   - Cache simples e seguro
*/

const CACHE = "rcf-cache-v1";
const CORE_ASSETS = [
  "/app/",
  "/app/index.html",
  "/app/styles.css",
  "/app/app.js",
  "/app/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try { await cache.addAll(CORE_ASSETS); } catch (_) {}
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

function isHTMLNavigation(request) {
  // Navegação mesmo (document)
  if (request.mode === "navigate") return true;

  // Alguns iOS/Safari podem não marcar mode corretamente
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só queremos controlar GET
  if (req.method !== "GET") return;

  // ✅ Se for CSS/JS/IMG/etc -> NÃO devolve index.html nunca
  if (!isHTMLNavigation(req)) {
    event.respondWith(
      (async () => {
        try {
          // Network first para assets (evita “HTML no CSS”)
          const net = await fetch(req);
          // opcional: cachear respostas OK
          if (net && net.ok) {
            const cache = await caches.open(CACHE);
            cache.put(req, net.clone()).catch(() => {});
          }
          return net;
        } catch (e) {
          // Offline: tenta cache
          const cached = await caches.match(req);
          if (cached) return cached;
          throw e;
        }
      })()
    );
    return;
  }

  // ✅ Navegação (HTML): tenta rede, senão cache, senão fallback /app/index.html
  event.respondWith(
    (async () => {
      try {
        const net = await fetch(req);
        // cacheia navegação OK
        if (net && net.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone()).catch(() => {});
        }
        return net;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fallback = await caches.match("/app/index.html");
        if (fallback) return fallback;
        throw e;
      }
    })()
  );
});

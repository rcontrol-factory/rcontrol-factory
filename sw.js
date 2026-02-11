/* RControl Factory — Service Worker (ROOT)
   Scope: "/"
   - Offline cache básico
   - Overrides via postMessage:
       RCF_OVERRIDE_PUT  { path, content, contentType }
       RCF_OVERRIDE_CLEAR
*/

"use strict";

const CORE_CACHE = "rcf-core-v3";        // <- bump
const OVERRIDE_CACHE = "rcf-overrides-v3";

const CORE_ASSETS = [
  "/index.html",
  "/app/index.html",
  "/app/styles.css",
  "/app/app.js",

  "/app/js/ui.touchfix.js",
  "/app/js/router.js",
  "/app/js/admin.js",

  "/app/js/core/vfs_overrides.js",
  "/app/js/core/thompson.js",
  "/app/js/core/github_sync.js",
  "/app/js/core/mother_selfupdate.js",

  "/app/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(CORE_CACHE);
    await Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (k !== CORE_CACHE && k !== OVERRIDE_CACHE) return caches.delete(k);
      })
    );
  })());
});

/* Helpers */
function normalizePath(p) {
  let path = String(p || "").trim();
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}
function urlFromPath(path) {
  return new URL(normalizePath(path), self.registration.scope).toString();
}

/* Overrides: PUT/CLEAR */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  const src = event.source;

  event.waitUntil((async () => {
    try {
      if (data.type === "RCF_OVERRIDE_PUT") {
        const path = normalizePath(data.path);
        const content = String(data.content ?? "");
        const contentType = String(data.contentType || "text/plain; charset=utf-8");

        const cache = await caches.open(OVERRIDE_CACHE);
        const headers = new Headers({
          "Content-Type": contentType,
          "Cache-Control": "no-store"
        });

        const resp = new Response(content, { status: 200, headers });
        await cache.put(urlFromPath(path), resp);

        if (src) src.postMessage({ type: "RCF_OVERRIDE_PUT_OK", path });
        return;
      }

      if (data.type === "RCF_OVERRIDE_CLEAR") {
        await caches.delete(OVERRIDE_CACHE);
        if (src) src.postMessage({ type: "RCF_OVERRIDE_CLEAR_OK" });
        return;
      }
    } catch (e) {
      if (src) src.postMessage({ type: "RCF_OVERRIDE_ERR", error: String(e?.message || e) });
    }
  })());
});

/* Fetch:
   - Navegação (HTML): sempre usa /app/index.html como shell (offline fallback)
   - Override > cache core > rede
*/
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = (url.origin === self.location.origin);

  // Navegação/HTML: network-first, fallback pro shell
  if (req.mode === "navigate" && sameOrigin) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        // Atualiza cache do index raiz e do /app/index.html quando vier HTML
        if (net && net.ok) {
          const cache = await caches.open(CORE_CACHE);
          cache.put(req, net.clone()).catch(() => {});
        }
        return net;
      } catch {
        const cache = await caches.open(CORE_CACHE);

        // Se estiver offline, sempre devolve o shell do app
        const shell = await cache.match("/app/index.html");
        if (shell) return shell;

        // última tentativa
        const root = await cache.match("/index.html");
        if (root) return root;

        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // Demais requests: override > cache > rede
  event.respondWith((async () => {
    // 1) Overrides
    const oCache = await caches.open(OVERRIDE_CACHE);
    const oHit = await oCache.match(req.url);
    if (oHit) return oHit;

    // 2) Core cache
    const cCache = await caches.open(CORE_CACHE);
    const cHit = await cCache.match(req);
    if (cHit) return cHit;

    // 3) Rede (+ runtime cache leve)
    try {
      const net = await fetch(req);

      if (sameOrigin) {
        const isStatic =
          url.pathname.startsWith("/app/") ||
          url.pathname.endsWith(".js") ||
          url.pathname.endsWith(".css") ||
          url.pathname.endsWith(".html") ||
          url.pathname.endsWith(".json");

        if (isStatic && net && net.ok) {
          cCache.put(req, net.clone()).catch(() => {});
        }
      }

      return net;
    } catch {
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

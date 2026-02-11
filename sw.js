/* RControl Factory — Service Worker (ROOT)
   Scope: "/"
   Estratégia:
   - cache-first pro core
   - network-first com fallback pro /app/index.html em navegação
   - overrides via postMessage (opcional)
*/

"use strict";

const CORE_CACHE = "rcf-core-v3";
const OVERRIDE_CACHE = "rcf-overrides-v1";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/app/",
  "/app/index.html",
  "/app/styles.css",
  "/app/app.js",

  // módulos (se existirem)
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
    await Promise.allSettled(CORE_ASSETS.map((u) => cache.add(u)));
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

function normalizePath(p) {
  let path = String(p || "").trim();
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}
function urlFromPath(path) {
  return new URL(normalizePath(path), self.registration.scope).toString();
}

/* Overrides (opcional) */
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

        await cache.put(urlFromPath(path), new Response(content, { status: 200, headers }));
        src && src.postMessage({ type: "RCF_OVERRIDE_PUT_OK", path });
        return;
      }

      if (data.type === "RCF_OVERRIDE_CLEAR") {
        await caches.delete(OVERRIDE_CACHE);
        src && src.postMessage({ type: "RCF_OVERRIDE_CLEAR_OK" });
        return;
      }
    } catch (e) {
      src && src.postMessage({ type: "RCF_OVERRIDE_ERR", error: String(e?.message || e) });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  event.respondWith((async () => {
    // 1) override cache
    const oCache = await caches.open(OVERRIDE_CACHE);
    const oHit = await oCache.match(req.url);
    if (oHit) return oHit;

    // 2) navegação: network-first, fallback pro app
    if (req.mode === "navigate") {
      try {
        const net = await fetch(req);
        if (net && net.ok) return net;
        throw new Error("net not ok");
      } catch {
        const cCache = await caches.open(CORE_CACHE);
        const fallback = await cCache.match("/app/index.html");
        return fallback || new Response("Offline", { status: 503 });
      }
    }

    // 3) arquivos: cache-first, senão rede + runtime cache
    const cCache = await caches.open(CORE_CACHE);
    const cHit = await cCache.match(req);
    if (cHit) return cHit;

    try {
      const net = await fetch(req);
      if (url.origin === self.location.origin && net && net.ok) {
        const isStatic =
          url.pathname.startsWith("/app/") ||
          url.pathname.endsWith(".js") ||
          url.pathname.endsWith(".css") ||
          url.pathname.endsWith(".html") ||
          url.pathname.endsWith(".json");
        if (isStatic) cCache.put(req, net.clone()).catch(() => {});
      }
      return net;
    } catch {
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

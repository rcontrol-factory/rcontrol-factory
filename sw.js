/* RControl Factory — Service Worker (ROOT)
   Scope: "/"
   Cache v3 (quebra cache velho)
   Estratégia:
   - HTML (navigate): network-first com fallback /app/index.html
   - Assets: cache-first + atualiza em background
   - Overrides (opcional): postMessage PUT/CLEAR
*/

"use strict";

const CORE_CACHE = "rcf-core-v3";
const OVERRIDE_CACHE = "rcf-overrides-v3";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/app/",
  "/app/index.html",
  "/app/styles.css",
  "/app/app.js",
  "/app/manifest.json",

  // scripts (se existirem)
  "/app/js/ui.touchfix.js",
  "/app/js/router.js",
  "/app/js/admin.js",

  // core (se existirem)
  "/app/js/core/vfs_overrides.js",
  "/app/js/core/thompson.js",
  "/app/js/core/github_sync.js",
  "/app/js/core/mother_selfupdate.js"
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
    await Promise.all(keys.map((k) => {
      if (k !== CORE_CACHE && k !== OVERRIDE_CACHE) return caches.delete(k);
    }));
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

/* Fetch */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  event.respondWith((async () => {
    // 1) Overrides
    const oCache = await caches.open(OVERRIDE_CACHE);
    const oHit = await oCache.match(req.url);
    if (oHit) return oHit;

    // 2) Navegação (HTML): network-first (evita “HTML velho”)
    if (req.mode === "navigate") {
      try {
        const net = await fetch(req);
        const cCache = await caches.open(CORE_CACHE);
        cCache.put(req, net.clone()).catch(() => {});
        return net;
      } catch (e) {
        const cCache = await caches.open(CORE_CACHE);
        const fallback = await cCache.match("/app/index.html");
        if (fallback) return fallback;
        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    }

    // 3) Assets: cache-first
    const cCache = await caches.open(CORE_CACHE);
    const cHit = await cCache.match(req);
    if (cHit) {
      // atualiza em background
      if (sameOrigin) {
        fetch(req).then((net) => {
          if (net && net.ok) cCache.put(req, net.clone()).catch(() => {});
        }).catch(() => {});
      }
      return cHit;
    }

    // 4) Network fallback + guarda
    try {
      const net = await fetch(req);
      if (sameOrigin && net && net.ok) cCache.put(req, net.clone()).catch(() => {});
      return net;
    } catch (e) {
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

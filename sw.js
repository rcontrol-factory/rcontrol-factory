"use strict";

/**
 * RControl Factory — Service Worker (ROOT)
 * Scope: "/"
 * Navegação sempre cai em /app/index.html
 */

// MUDE A VERSÃO SEMPRE QUE ALTERAR (pra matar cache velho)
const VERSION = "v3";
const CORE_CACHE = `rcf-core-${VERSION}`;
const OVERRIDE_CACHE = `rcf-overrides-${VERSION}`;

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/app/",
  "/app/index.html",
  "/app/styles.css",
  "/app/app.js",

  // opcionais (se existir, cacheia; se não existir, não quebra)
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
    await Promise.all(keys.map((k) => {
      if (k !== CORE_CACHE && k !== OVERRIDE_CACHE) return caches.delete(k);
    }));
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

// Overrides
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
  const sameOrigin = url.origin === self.location.origin;

  event.respondWith((async () => {
    // 1) Overrides
    const oCache = await caches.open(OVERRIDE_CACHE);
    const oHit = await oCache.match(req.url);
    if (oHit) return oHit;

    // 2) Core
    const cCache = await caches.open(CORE_CACHE);
    const cHit = await cCache.match(req);
    if (cHit) return cHit;

    // 3) Network
    try {
      const net = await fetch(req);

      if (sameOrigin && net && net.ok) {
        const isStatic =
          url.pathname.startsWith("/app/") ||
          url.pathname.endsWith(".js") ||
          url.pathname.endsWith(".css") ||
          url.pathname.endsWith(".html") ||
          url.pathname.endsWith(".json");

        if (isStatic) cCache.put(req, net.clone()).catch(() => {});
      }

      return net;
    } catch (e) {
      // OFFLINE: navegação cai em /app/index.html
      if (req.mode === "navigate") {
        const fallback = await cCache.match("/app/index.html");
        if (fallback) return fallback;
      }
      return new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});

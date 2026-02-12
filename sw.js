"use strict";

/* RControl Factory — Service Worker
   Cloudflare Pages: Build output = "app"
   repo /app/*  -> publicado na raiz /
*/

const CORE_CACHE = "ercf-core-v5";
const OVERRIDE_CACHE = "ercf-overrides-v5";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/styles.css",
  "/manifest.json",
  "/sw.js",

  // JS base
  "/js/router.js",
  "/js/admin.js",
  "/js/settings.js",
  "/js/templates.js",
  "/js/templates.catalog.js",
  "/js/agent.router.js",
  "/js/agent.nlp.js",
  "/js/ai.js",
  "/js/ai.v2.js",
  "/js/ai.builder.js",
  "/js/mother_boot.js",

  // Core
  "/js/core/github_sync.js",
  "/js/core/mother_selfupdate.js",
  "/js/core/logger.js",
  "/js/core/errors.js",
  "/js/core/patch.js",
  "/js/core/core.guard.js",
  "/js/core/injector.js",
  "/js/core/commands.js",

  // compat diagnostics shims
  "/js/core/diagnostics.js",
  "/js/core/diagnostic.js",

  // diagnostics folder (novo)
  "/js/diagnostics/idb.js",
  "/js/diagnostics/error_guard.js",
  "/js/diagnostics/click_guard.js",
  "/js/diagnostics/overlay_scanner.js",
  "/js/diagnostics/microtests.js",
  "/js/diagnostics/index.js",

  // Overrides API (se existir no seu repo)
  "/js/core/vfs_overrides.js",
];

function normalizePath(p) {
  let path = String(p || "").trim();
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}
function urlFromPath(path) {
  return new URL(normalizePath(path), self.registration.scope).toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await self.skipWaiting();

    const cache = await caches.open(CORE_CACHE);

    await Promise.allSettled(
      CORE_ASSETS.map(async (url) => {
        try {
          const req = new Request(url, { cache: "no-store" });
          const res = await fetch(req);
          if (res && res.ok) await cache.put(url, res);
        } catch {}
      })
    );
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();

    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (k !== CORE_CACHE && k !== OVERRIDE_CACHE) return caches.delete(k);
        return Promise.resolve();
      })
    );
  })());
});

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
          "Cache-Control": "no-store",
        });

        const key = urlFromPath(path);
        await cache.put(key, new Response(content, { status: 200, headers }));
        src?.postMessage({ type: "RCF_OVERRIDE_PUT_OK", path });
        return;
      }

      if (data.type === "RCF_OVERRIDE_CLEAR") {
        await caches.delete(OVERRIDE_CACHE);
        src?.postMessage({ type: "RCF_OVERRIDE_CLEAR_OK" });
        return;
      }
    } catch (e) {
      src?.postMessage({ type: "RCF_OVERRIDE_ERR", error: String(e?.message || e) });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return fetch(req);

    // overrides
    try {
      const oCache = await caches.open(OVERRIDE_CACHE);
      const oHit = await oCache.match(req.url, { ignoreSearch: true });
      if (oHit) return oHit;
    } catch {}

    // core cache
    try {
      const cCache = await caches.open(CORE_CACHE);

      if (req.mode === "navigate") {
        const cached = await cCache.match("/index.html");
        if (cached) {
          fetch(req).then((res) => {
            if (res && res.ok) cCache.put("/index.html", res.clone()).catch(() => {});
          }).catch(() => {});
          return cached;
        }
      }

      const cHit = await cCache.match(req, { ignoreSearch: true });
      if (cHit) return cHit;
    } catch {}

    // network
    try {
      const res = await fetch(req);

      const isStatic =
        url.pathname === "/" ||
        url.pathname.endsWith(".js") ||
        url.pathname.endsWith(".css") ||
        url.pathname.endsWith(".html") ||
        url.pathname.endsWith(".json") ||
        url.pathname.startsWith("/js/");

      if (isStatic && res && res.ok) {
        const cCache = await caches.open(CORE_CACHE);
        cCache.put(req, res.clone()).catch(() => {});
      }

      return res;
    } catch {
      try {
        const cCache = await caches.open(CORE_CACHE);
        if (req.mode === "navigate") {
          const fallback = await cCache.match("/index.html");
          if (fallback) return fallback;
        }
      } catch {}

      return new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  })());
});

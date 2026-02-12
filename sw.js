"use strict";

/*
 RControl Factory — Service Worker
 Cloudflare Pages (build output = app)
 Tudo é servido na raiz:
   /index.html
   /app.js
   /js/*
*/

const CORE_CACHE = "rcf-core-v4";        // ↑ versão nova (força limpar cache antigo)
const OVERRIDE_CACHE = "rcf-overrides-v4";

/* ===============================
   Arquivos core que devem estar cacheados
================================= */
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",

  // módulos (se existirem)
  "/js/ui.touchfix.js",
  "/js/router.js",
  "/js/admin.js",
  "/js/templates.js",
  "/js/templates.catalog.js",
  "/js/settings.js",
  "/js/ui.topbar.js",
  "/js/ui.gear.js",
  "/js/agent.router.js",
  "/js/agent.nlp.js",
  "/js/ai.js",
  "/js/ai.v2.js",

  // core
  "/js/core/vfs_overrides.js",
  "/js/core/github_sync.js",
  "/js/core/mother_selfupdate.js",
  "/js/core/thompson.js",
  "/js/core/policy.js",
  "/js/core/registry.js",
];

/* ===============================
   INSTALL
================================= */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await self.skipWaiting();
    const cache = await caches.open(CORE_CACHE);
    await Promise.allSettled(
      CORE_ASSETS.map((url) => cache.add(url).catch(() => {}))
    );
  })());
});

/* ===============================
   ACTIVATE
================================= */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();

    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (k !== CORE_CACHE && k !== OVERRIDE_CACHE) {
          return caches.delete(k);
        }
      })
    );
  })());
});

/* ===============================
   Helpers
================================= */
function normalizePath(p) {
  let path = String(p || "").trim();
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}

function urlFromPath(path) {
  return new URL(normalizePath(path), self.registration.scope).toString();
}

/* ===============================
   MESSAGE (Overrides via postMessage)
================================= */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  const src = event.source;

  // ✅ Se veio MessageChannel, responde por ele
  const port = (event.ports && event.ports[0]) ? event.ports[0] : null;
  const reply = (payload) => {
    try {
      if (port) port.postMessage(payload);
      else src?.postMessage(payload);
    } catch {}
  };

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

        await cache.put(
          urlFromPath(path),
          new Response(content, { status: 200, headers })
        );

        reply({ type: "RCF_OVERRIDE_PUT_OK", path });
      }

      if (data.type === "RCF_OVERRIDE_CLEAR") {
        await caches.delete(OVERRIDE_CACHE);
        reply({ type: "RCF_OVERRIDE_CLEAR_OK" });
      }

    } catch (e) {
      reply({
        type: "RCF_OVERRIDE_ERR",
        error: String(e?.message || e),
      });
    }
  })());
});

/* ===============================
   FETCH
   Ordem:
   1) Overrides
   2) Core cache
   3) Network + runtime cache
================================= */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {

    // 1️⃣ Overrides
    const oCache = await caches.open(OVERRIDE_CACHE);
    const oHit = await oCache.match(req);
    if (oHit) return oHit;

    // 2️⃣ Core cache
    const cCache = await caches.open(CORE_CACHE);
    const cHit = await cCache.match(req);
    if (cHit) return cHit;

    // 3️⃣ Network
    try {
      const net = await fetch(req);

      const url = new URL(req.url);

      // runtime cache leve para estáticos locais
      if (url.origin === self.location.origin) {
        const isStatic =
          url.pathname.startsWith("/js/") ||
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

      // fallback offline
      if (req.mode === "navigate") {
        const fallback = await cCache.match("/index.html");
        if (fallback) return fallback;
      }

      return new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

  })());
});

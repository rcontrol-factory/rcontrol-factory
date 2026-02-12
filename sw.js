"use strict";

/* ERCtrl / RControl Factory — Service Worker
   Cloudflare Pages: Build output = "app"
   => tudo dentro de /app no repo é publicado na raiz do site:
      repo:   /app/js/...   -> site: /js/...
      repo:   /app/app.js   -> site: /app.js
*/

const CORE_CACHE = "ercf-core-v4";
const OVERRIDE_CACHE = "ercf-overrides-v4";

// Lista de arquivos-base (se algum não existir, tudo bem: usamos add + allSettled)
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
  "/js/core/diagnostics.js",
  "/js/core/diagnostic.js",
  "/js/core/core.guard.js",
  "/js/core/injector.js",
  "/js/core/commands.js",

  // Overrides API (se existir no seu repo)
  "/js/core/vfs_overrides.js",
];

/* helpers */
function normalizePath(p) {
  let path = String(p || "").trim();
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}
function urlFromPath(path) {
  // usa o escopo atual do SW
  return new URL(normalizePath(path), self.registration.scope).toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await self.skipWaiting();

    const cache = await caches.open(CORE_CACHE);

    // Precache tolerante: não falha se algum arquivo não existir
    await Promise.allSettled(
      CORE_ASSETS.map(async (url) => {
        try {
          // no-store pra evitar pegar algo “travado” por proxy intermediário
          const req = new Request(url, { cache: "no-store" });
          const res = await fetch(req);
          if (res && res.ok) await cache.put(url, res);
        } catch {
          // ignora
        }
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

/* Overrides via postMessage */
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

        // salva usando URL absoluta do escopo
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

/* Fetch strategy:
   1) Overrides (ignora querystring pra não quebrar)
   2) Core cache
   3) Network (e re-cache leve de estáticos)
*/
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const url = new URL(req.url);

    // só interfere no nosso origin
    if (url.origin !== self.location.origin) return fetch(req);

    // 1) OVERRIDES (match por URL absoluta)
    try {
      const oCache = await caches.open(OVERRIDE_CACHE);
      const oHit = await oCache.match(req.url, { ignoreSearch: true });
      if (oHit) return oHit;
    } catch {
      // segue
    }

    // 2) CORE CACHE
    try {
      const cCache = await caches.open(CORE_CACHE);

      // navegação: sempre tenta cair no index.html do cache se precisar
      if (req.mode === "navigate") {
        const cached = await cCache.match("/index.html");
        if (cached) {
          // tenta atualizar em background (sem travar a navegação)
          fetch(req).then((res) => {
            if (res && res.ok) cCache.put("/index.html", res.clone()).catch(() => {});
          }).catch(() => {});
          return cached;
        }
      }

      const cHit = await cCache.match(req, { ignoreSearch: true });
      if (cHit) return cHit;
    } catch {
      // segue
    }

    // 3) NETWORK + runtime recache leve
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
      // OFFLINE fallback
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

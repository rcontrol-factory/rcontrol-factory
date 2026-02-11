/* RControl Factory — Service Worker (ROOT)
   - Scope: "/"
   - Offline cache básico
   - Overrides via postMessage:
       RCF_OVERRIDE_PUT  { path, content, contentType }
       RCF_OVERRIDE_CLEAR
*/

"use strict";

const CORE_CACHE = "rcf-core-v1";
const OVERRIDE_CACHE = "rcf-overrides-v1";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/app/",
  "/app/index.html",
  "/app/styles.css",
  "/app/app.js",

  // Se existirem no seu repo, ótimo. Se não existirem, não quebra: fetch vai cair no runtime.
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
    // Tenta cachear o máximo possível sem travar instalação
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
  // Gera URL absoluta dentro do escopo do SW
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
      // (se quiser, dá pra responder erro também)
      if (src) src.postMessage({ type: "RCF_OVERRIDE_ERR", error: String(e?.message || e) });
    }
  })());
});

/* Fetch: prioridade = override > cache core > network (+runtime cache leve) */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  event.respondWith((async () => {
    // 1) Overrides (se existir para esse path)
    const oCache = await caches.open(OVERRIDE_CACHE);
    const oHit = await oCache.match(req.url);
    if (oHit) return oHit;

    // 2) Core cache
    const cCache = await caches.open(CORE_CACHE);
    const cHit = await cCache.match(req);
    if (cHit) return cHit;

    // 3) Network + runtime cache (somente same-origin)
    try {
      const net = await fetch(req);

      if (url.origin === self.location.origin) {
        // cacheia só arquivos estáticos comuns
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
    } catch (e) {
      // Offline fallback
      // Se for navegação, devolve o app
      if (req.mode === "navigate") {
        const fallback = await cCache.match("/app/index.html");
        if (fallback) return fallback;
      }
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

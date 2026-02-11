/* RControl Factory — sw.js (FULL)
   - Cache básico de assets do Factory
   - Override VFS: RCF_OVERRIDE_PUT / RCF_OVERRIDE_CLEAR
   - Scope recomendado: "/" (registrado pelo /index.html)
*/

"use strict";

const CORE_CACHE = "rcf-core-v1";
const OVERRIDE_CACHE = "rcf-overrides-v1";

// Lista mínima (adicione mais se quiser, mas não é obrigatório)
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/app/styles.css",
  "/app/app.js",

  "/app/js/router.js",
  "/app/js/admin.js",

  "/app/js/core/vfs_overrides.js",
  "/app/js/core/thompson.js",
  "/app/js/core/github_sync.js",
  "/app/js/core/mother_selfupdate.js",

  "/app/index.html",
  "/app/sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    try {
      await cache.addAll(CORE_ASSETS);
    } catch (e) {
      // Se algum asset não existir, não mata o install.
      // Isso evita “tela branca” por erro bobo de 404 em arquivo opcional.
      console.warn("SW install cache warning:", e);
    }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // limpa caches antigos
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== CORE_CACHE && k !== OVERRIDE_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

// Recebe overrides do window.RCF_VFS.put / clearAll()
self.addEventListener("message", (event) => {
  const d = event.data || {};
  event.waitUntil((async () => {
    try {
      if (d.type === "RCF_OVERRIDE_PUT") {
        const path = String(d.path || "").trim();
        const content = String(d.content ?? "");
        const contentType = String(d.contentType || "text/plain; charset=utf-8");

        if (!path.startsWith("/")) throw new Error("override path deve começar com /");

        const cache = await caches.open(OVERRIDE_CACHE);
        await cache.put(path, new Response(content, {
          status: 200,
          headers: { "Content-Type": contentType }
        }));

        event.source?.postMessage({ type: "RCF_OVERRIDE_PUT_OK", path });
        return;
      }

      if (d.type === "RCF_OVERRIDE_CLEAR") {
        await caches.delete(OVERRIDE_CACHE);
        event.source?.postMessage({ type: "RCF_OVERRIDE_CLEAR_OK" });
        return;
      }
    } catch (e) {
      console.warn("SW msg error:", e);
      // não trava
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Só controla mesmo domínio
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    // 1) Overrides têm prioridade
    const ovCache = await caches.open(OVERRIDE_CACHE);
    const ovHit = await ovCache.match(url.pathname);
    if (ovHit) return ovHit;

    // 2) Cache core
    const core = await caches.open(CORE_CACHE);
    const coreHit = await core.match(req);
    if (coreHit) return coreHit;

    // 3) Network + cache (best effort)
    try {
      const fresh = await fetch(req);
      // cacheia só se for ok
      if (fresh && fresh.ok) {
        try { core.put(req, fresh.clone()); } catch {}
      }
      return fresh;
    } catch (e) {
      // fallback final
      const fallback = await core.match("/index.html");
      return fallback || new Response("Offline", { status: 503 });
    }
  })());
});

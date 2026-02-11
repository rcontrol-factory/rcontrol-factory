/* /app/sw.js — RControl Factory Service Worker (FULL)
   - Controla o site inteiro (scope "/")
   - Suporta overrides via postMessage (RCF_OVERRIDE_PUT / CLEAR)
   - Serve overrides primeiro, depois rede, depois cache básico
*/

(() => {
  "use strict";

  const SW_VERSION = "rcf-sw-v1.0.0";
  const OVERRIDE_CACHE = "rcf-overrides-v1";
  const CORE_CACHE = "rcf-core-v1";

  // Cache mínimo (não inventa muita coisa pra não dar tela branca)
  const CORE_ASSETS = [
    "/",                 // raiz
    "/index.html",
    "/app/styles.css",
    "/app/app.js",
    "/app/js/router.js",
    "/app/js/admin.js",
    "/app/js/ui.touchfix.js",
    "/app/js/core/vfs_overrides.js",
    "/app/js/core/thompson.js",
    "/app/js/core/github_sync.js",
    "/app/js/core/mother_selfupdate.js",
  ];

  self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CORE_CACHE);
        // addAll pode falhar se algum caminho não existir.
        // então fazemos “best effort”:
        for (const url of CORE_ASSETS) {
          try { await cache.add(url); } catch (e) {}
        }
      } finally {
        await self.skipWaiting();
      }
    })());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      // limpa caches antigos (se futuramente mudar versão)
      const keys = await caches.keys();
      for (const k of keys) {
        if (k !== CORE_CACHE && k !== OVERRIDE_CACHE) {
          try { await caches.delete(k); } catch (e) {}
        }
      }
      await self.clients.claim();
    })());
  });

  function isGET(req) { return (req && req.method === "GET"); }

  // ---------------------------
  // Overrides API via postMessage
  // ---------------------------
  self.addEventListener("message", (event) => {
    const msg = event.data || {};
    const src = event.source;

    const reply = (data) => {
      try { src && src.postMessage(data); } catch (e) {}
    };

    event.waitUntil((async () => {
      try {
        if (msg.type === "RCF_OVERRIDE_PUT") {
          const path = String(msg.path || "").trim();
          const content = String(msg.content ?? "");
          const contentType = String(msg.contentType || "text/plain; charset=utf-8");

          if (!path.startsWith("/")) throw new Error("path deve começar com '/'");

          const cache = await caches.open(OVERRIDE_CACHE);
          const res = new Response(content, {
            status: 200,
            headers: { "Content-Type": contentType, "X-RCF-Override": "1" }
          });

          // chave do cache = URL absoluta do site (SW entende melhor assim)
          const url = new URL(path, self.location.origin).toString();
          await cache.put(url, res);

          reply({ type: "RCF_OVERRIDE_PUT_OK", path, ok: true });
          return;
        }

        if (msg.type === "RCF_OVERRIDE_CLEAR") {
          await caches.delete(OVERRIDE_CACHE);
          reply({ type: "RCF_OVERRIDE_CLEAR_OK", ok: true });
          return;
        }
      } catch (e) {
        reply({ type: "RCF_OVERRIDE_ERR", ok: false, error: String(e?.message || e) });
      }
    })());
  });

  // ---------------------------
  // Fetch: override > cache core > network
  // ---------------------------
  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (!isGET(req)) return;

    const url = new URL(req.url);

    // só controla o mesmo origin
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
      // 1) overrides primeiro
      try {
        const oCache = await caches.open(OVERRIDE_CACHE);
        const over = await oCache.match(req.url);
        if (over) return over;
      } catch (e) {}

      // 2) cache core (rápido)
      try {
        const cCache = await caches.open(CORE_CACHE);
        const cached = await cCache.match(req);
        if (cached) {
          // atualiza em background (stale-while-revalidate)
          event.waitUntil((async () => {
            try {
              const fresh = await fetch(req);
              if (fresh && fresh.ok) await cCache.put(req, fresh.clone());
            } catch (e) {}
          })());
          return cached;
        }
      } catch (e) {}

      // 3) rede
      try {
        const fresh = await fetch(req);
        // guarda alguns GET no core cache (sem exagero)
        try {
          const cCache = await caches.open(CORE_CACHE);
          if (fresh && fresh.ok) await cCache.put(req, fresh.clone());
        } catch (e) {}
        return fresh;
      } catch (e) {
        // 4) fallback básico
        if (url.pathname === "/" || url.pathname === "/index.html") {
          const cCache = await caches.open(CORE_CACHE);
          const fallback = await cCache.match("/index.html");
          if (fallback) return fallback;
        }
        return new Response("Offline / erro de rede.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
  });

})();

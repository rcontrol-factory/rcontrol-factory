/* =========================================================
   RControl Factory — Service Worker (ANTI-CACHE-TRAVA)
   - Network-first para HTML (sempre atualiza)
   - Cache-first para assets (rápido/offline)
   - Limpa caches antigos automaticamente
   - Endpoint /rcf-sw-reset para “zerar” cache quando precisar
   ========================================================= */

const VERSION = "v3"; // <-- quando publicar mudança grande, troque pra v4, v5...
const CACHE = `rcontrol-factory-${VERSION}`;

// Ajuste aqui se seu site roda na raiz "/" ou dentro de "/app/"
// Se seu index.html fica em /app/index.html no Pages/Cloudflare, use: const BASE = "/app/";
const BASE = "./";

const ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}styles.css`,
  `${BASE}app.js`,
  `${BASE}manifest.json`,
  `${BASE}sw.js`,
];

// --- install ---
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(ASSETS);
    } catch (e) {
      // Se algum asset falhar (path diferente), não quebra instalação
      // (a navegação online ainda funciona)
    }
    self.skipWaiting();
  })());
});

// --- activate ---
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k !== CACHE ? caches.delete(k) : Promise.resolve()))
    );
    await self.clients.claim();
  })());
});

// Helpers
function isHTML(req) {
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}
function isGet(req) {
  return req.method === "GET";
}
function urlPath(req) {
  try { return new URL(req.url).pathname; } catch { return ""; }
}

// --- fetch ---
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só GET
  if (!isGet(req)) return;

  const path = urlPath(req);

  // “Reset total” de cache por URL:
  // Abra no navegador: https://SEUSITE/rcf-sw-reset
  if (path.endsWith("/rcf-sw-reset")) {
    event.respondWith((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      return new Response(
        "RCF cache limpo ✅ Agora feche o Safari e abra de novo.\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    })());
    return;
  }

  // 1) HTML / navegação: NETWORK FIRST (sempre pega atualização)
  if (isHTML(req) || req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        // Atualiza cache do HTML
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        // Offline: cai pro cache
        const cached = await caches.match(req);
        if (cached) return cached;

        // Fallback pro index
        const fallback = await caches.match(`${BASE}index.html`);
        return fallback || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // 2) Assets: CACHE FIRST (rápido), com atualização em background
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      // Atualiza em background (não bloqueia)
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          await cache.put(req, fresh);
        } catch {}
      })());
      return cached;
    }

    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      await cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return new Response("", { status: 504 });
    }
  })());
});

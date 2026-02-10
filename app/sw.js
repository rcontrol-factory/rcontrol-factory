/* RControl Factory — sw.js (FULL) — v2026.02.10-3
   Fix: iPhone preso em HTML antigo + scripts antigos (Admin não atualiza)
   - Cache versionado (força limpar)
   - skipWaiting + clientsClaim
   - Network-first para navegação (HTML)
   - Cache-first para assets
*/

const SW_VERSION = "v2026.02.10-3";
const CACHE_NAME = `rcf-cache-${SW_VERSION}`;

// Ajuste se seu app NÃO estiver na raiz:
const APP_SCOPE = self.registration.scope; // auto

// Lista mínima de arquivos essenciais
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
];

// Se seus scripts ficam em /core/... (como no seu index.html), adiciona também:
const CORE_SCRIPTS = [
  "./core/logger.js",
  "./core/storage.js",
  "./core/errors.js",
  "./core/policy.js",
  "./core/risk.js",
  "./core/snapshot.js",
  "./core/patch.js",
  "./core/patchset.js",
  "./core/diagnostics.js",
  "./core/commands.js",
  "./core/ui_safety.js",
  "./core/ui_bindings.js",
  "./core/selfheal.js",
  "./core/autofix.js",
  "./core/admin.js",
  "./core/ai.builder.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([...CORE_ASSETS, ...CORE_SCRIPTS]);
    } catch (e) {
      // se algum asset falhar, não impede instalação
    }
    self.skipWaiting(); // ✅ ativa rápido
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // ✅ remove caches antigos
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim(); // ✅ assume as abas já abertas
  })());
});

// helpers
function isNavigationRequest(req) {
  return req.mode === "navigate" || (req.destination === "document");
}

function isAssetRequest(req) {
  return ["script", "style", "image", "font"].includes(req.destination);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // só cuida do mesmo origin
  if (url.origin !== self.location.origin) return;

  // ✅ NAVIGATION (HTML): network-first
  if (isNavigationRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("./index.html") || new Response("Offline", { status: 200 });
      }
    })());
    return;
  }

  // ✅ ASSETS: cache-first (offline-first)
  if (isAssetRequest(req) || req.method === "GET") {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return cached || new Response("", { status: 504 });
      }
    })());
  }
});

// (opcional) receber mensagens (se você usar)
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SW_PING") {
    event.source?.postMessage({ type: "SW_PONG", version: SW_VERSION, cache: CACHE_NAME });
  }
});

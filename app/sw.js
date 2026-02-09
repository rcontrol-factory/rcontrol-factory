/* RControl Factory — sw.js (v3)
   - Cache versionado pra forçar update
   - Cache inclui /js/*.js (ai/templates/router)
*/

const CACHE = "rcontrol-factory-v3-20260209";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./js/ai.js",
  "./js/templates.js",
  "./js/router.js",
];

// instala e baixa tudo
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    self.skipWaiting();
  })());
});

// ativa e apaga caches antigos
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)));
    self.clients.claim();
  })());
});

// estratégia: HTML tenta rede primeiro (pra atualizar mais fácil), resto cache-first
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // só trata mesma origem
  if (url.origin !== location.origin) return;

  const isHtml =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html") ||
    url.pathname.endsWith("/index.html");

  if (isHtml) {
    // network-first (pra não travar em versão velha)
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  // cache-first (rápido/offline)
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const c = await caches.open(CACHE);
      c.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});

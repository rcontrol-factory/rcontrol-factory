/* RControl Factory — SW (cache-buster)
   Objetivo: não travar atualização quando você muda app.js/styles.css no Pages
*/
const VERSION = "v2026-02-09-01";
const CACHE = `rcf-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    // instala rápido
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // apaga caches antigos sempre que ativa
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// Estratégia: NETWORK FIRST (sempre tenta pegar do servidor)
// Se estiver offline, cai pro cache ou pro index.html
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Só controla o mesmo domínio (evita bug com coisas externas)
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: "no-store" });
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;

      // fallback pro index
      const fallback = await caches.match("./index.html");
      return fallback || new Response("Offline", { status: 200 });
    }
  })());
});

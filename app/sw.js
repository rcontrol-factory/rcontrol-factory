/* RCF — sw.js (SAFE MINIMAL)
   - evita quebrar o app
   - cacheia assets estáticos com estratégia simples
   - navegação: network-first (pra não prender build velho)
*/

"use strict";

const SW_VERSION = "rcf-sw-v1";
const CORE_ASSETS = [
  "/",              // shell
  "/index.html",
  "/styles.css",
  "/app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SW_VERSION);
      await cache.addAll(CORE_ASSETS);
    } catch (e) {
      // Se falhar, não trava instalação
    } finally {
      self.skipWaiting();
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== SW_VERSION ? caches.delete(k) : null)));
    } catch {}
    self.clients.claim();
  })());
});

function isNavigation(req) {
  return req.mode === "navigate" || (req.destination === "document");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só controla mesmo origin
  if (url.origin !== self.location.origin) return;

  // Navegação: NETWORK FIRST (pra não prender build velho)
  if (isNavigation(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // atualiza index no cache
        const cache = await caches.open(SW_VERSION);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("/index.html") || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Assets: CACHE FIRST com fallback pra network
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      const cache = await caches.open(SW_VERSION);
      cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch {
      return new Response("", { status: 504 });
    }
  })());
});

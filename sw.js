"use strict";

/**
 * SW OFF (Recovery)
 * - Não faz cache
 * - Não intercepta navegação
 * - Serve só pra parar loops/bug de cache antigo
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    self.clients.claim();
    // apaga qualquer cache antigo
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  })());
});

// não intercepta nada
self.addEventListener("fetch", () => {});

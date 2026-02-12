/* RCF — sw.js (SAFE MINIMAL / iOS friendly)
   - não trava instalação se cache falhar
   - navegação: network-first (não prende build velho)
   - assets: cache-first com fallback network
*/

"use strict";

const SW_VERSION = "rcf-sw-v2"; // <-- MUDE a cada deploy importante

const CORE_ASSETS = [
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/privacy.html",
  "/terms.html",
  "/recovery.html",
];

// -------- install
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SW_VERSION);
      await cache.addAll(CORE_ASSETS);
    } catch (e) {
      // não trava instalação
    } finally {
      self.skipWaiting();
    }
  })());
});

// -------- activate
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
  return req.mode === "navigate" || req.destination === "document";
}

// -------- fetch
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // só mesmo origin
  if (url.origin !== self.location.origin) return;

  // NAV: network-first
  if (isNavigation(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // (opcional) atualiza o index no cache para fallback offline
        const cache = await caches.open(SW_VERSION);
        cache.put("/index.html", fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cachedNav = await caches.match(req, { ignoreSearch: true });
        return cachedNav || (await caches.match("/index.html")) || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // ASSETS: cache-first -> network
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
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

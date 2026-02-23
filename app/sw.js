/* FILE: /app/sw.js
   RCF — SW KILL SWITCH (2026-02-22)
   - Não cacheia nada
   - Fetch passthrough
   - No activate: limpa caches e tenta unregister
*/
"use strict";

const LOG = (...a) => { try { console.log("[RCF/SW:KILL]", ...a); } catch {} };

self.addEventListener("install", () => {
  LOG("install");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    LOG("activate");
    try { await self.clients.claim(); } catch {}

    try {
      const keys = await caches.keys();
      for (const k of keys) { try { await caches.delete(k); } catch {} }
      LOG("caches cleared", keys.length);
    } catch (e) {
      LOG("caches clear fail", e && e.message ? e.message : e);
    }

    try {
      const ok = await self.registration.unregister();
      LOG("unregister", ok);
    } catch (e) {
      LOG("unregister fail", e && e.message ? e.message : e);
    }
  })());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

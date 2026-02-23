/* FILE: /app/sw.js
   RCF — SW KILL SWITCH (2026-02-22)
   Objetivo: parar tela preta causada por SW quebrado.
   - Não faz cache.
   - Faz passthrough no fetch.
   - No activate: limpa caches e tenta se auto-desregistrar.
*/

"use strict";

const LOG = (...a) => { try { console.log("[RCF/SW:KILL]", ...a); } catch {} };

self.addEventListener("install", (event) => {
  LOG("install");
  // ativa já
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    LOG("activate -> claim clients");
    try { await self.clients.claim(); } catch (e) {}

    // limpa caches
    try {
      const keys = await caches.keys();
      for (const k of keys) {
        try { await caches.delete(k); } catch {}
      }
      LOG("caches cleared", keys.length);
    } catch (e) {
      LOG("caches clear fail", e && e.message ? e.message : e);
    }

    // tenta se auto-desregistrar (libera o site depois de 1 reload)
    try {
      const ok = await self.registration.unregister();
      LOG("unregister", ok);
    } catch (e) {
      LOG("unregister fail", e && e.message ? e.message : e);
    }

    // tenta avisar os clients pra darem reload
    try {
      const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of cs) {
        try { c.postMessage({ type: "RCF_SW_KILLED", ts: Date.now() }); } catch {}
      }
      LOG("clients notified", cs.length);
    } catch {}
  })());
});

// ✅ IMPORTANTE: fetch SEMPRE passthrough (nunca devolve vazio)
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

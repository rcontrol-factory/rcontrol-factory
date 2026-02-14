/* RControl Factory — Service Worker (PADRÃO) — v1.0
   - Overrides via CacheStorage (rápido e simples)
   - Suporta mensagens:
     - RCF_OVERRIDE_PUT   {path, content, contentType}
     - RCF_OVERRIDE_CLEAR {}
   - Fetch: se existir override, serve ele antes do network
   - Normaliza paths: aceita /app/... e converte para /...
*/

(() => {
  "use strict";

  const OVERRIDE_CACHE = "rcf_overrides_v1";

  const log = (...a) => { try { /* console.log */ } catch {} };

  function normPath(input) {
    let p = String(input || "").trim();
    if (!p) return "/";
    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    // ✅ compat: se vier /app/... (repo), strip pra runtime /
    if (p === "/app/index.html") p = "/index.html";
    if (p.startsWith("/app/")) p = p.slice(4); // remove "/app"
    if (!p.startsWith("/")) p = "/" + p;

    return p;
  }

  function makeKeyUrl(path) {
    // Guarda o override com uma URL absoluta (CacheStorage funciona melhor assim)
    const p = normPath(path);
    return new URL(p, self.location.origin).toString();
  }

  async function putOverride(path, content, contentType) {
    const url = makeKeyUrl(path);
    const ct = contentType || guessType(path);

    const headers = new Headers();
    headers.set("Content-Type", ct);
    headers.set("Cache-Control", "no-store");

    const res = new Response(String(content ?? ""), { status: 200, headers });
    const cache = await caches.open(OVERRIDE_CACHE);
    await cache.put(url, res);
    return { ok: true, url };
  }

  async function clearOverrides() {
    const keys = await caches.keys();
    const toDel = keys.filter(k => k === OVERRIDE_CACHE);
    for (const k of toDel) await caches.delete(k);
    return { ok: true, deleted: toDel.length };
  }

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
      try { await self.skipWaiting(); } catch {}
    })());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      try { await self.clients.claim(); } catch {}
    })());
  });

  // ✅ responder overrides primeiro
  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (!req || req.method !== "GET") return;

    const url = new URL(req.url);

    // só no mesmo origin
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
      try {
        const cache = await caches.open(OVERRIDE_CACHE);

        // tenta match direto
        let hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;

        // tenta match pela chave normalizada (pra quando veio /app/...)
        const keyUrl = makeKeyUrl(url.pathname);
        hit = await cache.match(keyUrl, { ignoreSearch: true });
        if (hit) return hit;
      } catch {}

      // fallback: network normal
      return fetch(req);
    })());
  });

  // ✅ RPC por postMessage (MessageChannel)
  self.addEventListener("message", (event) => {
    const msg = event.data || {};
    const port = event.ports && event.ports[0];

    function reply(payload) {
      try { port && port.postMessage(payload); } catch {}
    }

    (async () => {
      try {
        if (msg.type === "RCF_OVERRIDE_PUT") {
          const path = msg.path;
          const content = msg.content;
          const contentType = msg.contentType;
          const r = await putOverride(path, content, contentType);
          reply({ type: "RCF_OVERRIDE_PUT_OK", ...r, path: normPath(path) });
          return;
        }

        if (msg.type === "RCF_OVERRIDE_CLEAR") {
          const r = await clearOverrides();
          reply({ type: "RCF_OVERRIDE_CLEAR_OK", ...r });
          return;
        }

        reply({ type: "RCF_SW_NOP", ok: true });
      } catch (e) {
        reply({ type: (msg.type || "RCF_SW") + "_ERR", error: String(e?.message || e) });
      }
    })();
  });
})();

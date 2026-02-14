/* RControl Factory — /app/sw.js (PADRÃO) — v1.1
   - Overrides via CacheStorage
   - Mensagens:
     - RCF_OVERRIDE_PUT   {path, content, contentType}
     - RCF_OVERRIDE_CLEAR {}
   - Fetch: serve override antes do network
   - Normaliza paths para funcionar com:
       /app/index.html  <->  /index.html
*/

(() => {
  "use strict";

  const OVERRIDE_CACHE = "rcf_overrides_v1";

  function normPath(input) {
    let p = String(input || "").trim();
    if (!p) return "/";

    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    // ✅ compat repo/runtime:
    // a fábrica às vezes salva como /app/...
    if (p === "/app/index.html") p = "/index.html";
    if (p.startsWith("/app/")) p = p.slice(4); // remove "/app"
    if (!p.startsWith("/")) p = "/" + p;

    return p;
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

  function makeKeyUrl(path) {
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
    return { ok: true, url, path: normPath(path) };
  }

  async function clearOverrides() {
    const keys = await caches.keys();
    const toDel = keys.filter(k => k === OVERRIDE_CACHE);
    for (const k of toDel) await caches.delete(k);
    return { ok: true, deleted: toDel.length };
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

  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (!req || req.method !== "GET") return;

    const url = new URL(req.url);

    // só no mesmo origin
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
      try {
        const cache = await caches.open(OVERRIDE_CACHE);

        // 1) match direto
        let hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;

        // 2) match por key normalizada
        const keyUrl = makeKeyUrl(url.pathname);
        hit = await cache.match(keyUrl, { ignoreSearch: true });
        if (hit) return hit;
      } catch {}

      return fetch(req);
    })());
  });

  self.addEventListener("message", (event) => {
    const msg = event.data || {};
    const port = event.ports && event.ports[0];

    const reply = (payload) => {
      try { port && port.postMessage(payload); } catch {}
    };

    (async () => {
      try {
        if (msg.type === "RCF_OVERRIDE_PUT") {
          const r = await putOverride(msg.path, msg.content, msg.contentType);
          reply({ type: "RCF_OVERRIDE_PUT_OK", ...r });
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

/* RControl Factory — Service Worker (PADRÃO) — v1.1
   - Overrides via CacheStorage (rápido e simples)
   - Mensagens:
     - RCF_OVERRIDE_PUT    {path, content, contentType}
     - RCF_OVERRIDE_CLEAR  {}
     - RCF_OVERRIDE_LIST   {}
     - RCF_OVERRIDE_DEL    {path}
   - Fetch: se existir override, serve ele antes do network
   - Normaliza paths: aceita /app/... e converte para /...
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

    // compat: se vier /app/... (repo), strip pra runtime /
    if (p === "/app/index.html") p = "/index.html";
    if (p.startsWith("/app/")) p = p.slice(4); // remove "/app"
    if (!p.startsWith("/")) p = "/" + p;

    return p;
  }

  function makeKeyUrl(path) {
    const p = normPath(path);
    return new URL(p, self.location.origin).toString();
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
    return { ok: true, deletedCaches: toDel.length };
  }

  async function listOverrides() {
    const cache = await caches.open(OVERRIDE_CACHE);
    const reqs = await cache.keys();
    // devolve paths relativos
    const paths = reqs.map(r => {
      try {
        const u = new URL(r.url);
        return u.pathname;
      } catch {
        return "";
      }
    }).filter(Boolean);
    return { ok: true, count: paths.length, paths };
  }

  async function deleteOverride(path) {
    const cache = await caches.open(OVERRIDE_CACHE);

    // tenta por chave normalizada
    const keyUrl = makeKeyUrl(path);
    let ok = await cache.delete(keyUrl, { ignoreSearch: true });

    // tenta também pelo pathname direto (caso tenha sido salvo diferente)
    if (!ok) {
      const p = normPath(path);
      ok = await cache.delete(new URL(p, self.location.origin).toString(), { ignoreSearch: true });
    }

    return { ok: true, deleted: !!ok, path: normPath(path) };
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

  // responder overrides primeiro
  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (!req || req.method !== "GET") return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
      try {
        const cache = await caches.open(OVERRIDE_CACHE);

        let hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;

        const keyUrl = makeKeyUrl(url.pathname);
        hit = await cache.match(keyUrl, { ignoreSearch: true });
        if (hit) return hit;
      } catch {}

      return fetch(req);
    })());
  });

  // RPC por postMessage (MessageChannel)
  self.addEventListener("message", (event) => {
    const msg = event.data || {};
    const port = event.ports && event.ports[0];

    function reply(payload) {
      try { port && port.postMessage(payload); } catch {}
    }

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

        if (msg.type === "RCF_OVERRIDE_LIST") {
          const r = await listOverrides();
          reply({ type: "RCF_OVERRIDE_LIST_OK", ...r });
          return;
        }

        if (msg.type === "RCF_OVERRIDE_DEL") {
          const r = await deleteOverride(msg.path);
          reply({ type: "RCF_OVERRIDE_DEL_OK", ...r });
          return;
        }

        reply({ type: "RCF_SW_NOP", ok: true });
      } catch (e) {
        reply({ type: (msg.type || "RCF_SW") + "_ERR", error: String(e?.message || e) });
      }
    })();
  });
})();

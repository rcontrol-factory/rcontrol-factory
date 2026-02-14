/* RControl Factory — /app/sw.js (PADRÃO) — v1.1
   - Overrides via CacheStorage (rápido e simples)
   - RPC (MessageChannel):
     - RCF_OVERRIDE_PUT   {path, content, contentType}
     - RCF_OVERRIDE_CLEAR {}
     - RCF_OVERRIDE_LIST  {}
     - RCF_OVERRIDE_DEL   {path}
   - Fetch: se existir override, serve ele antes do network
   - Normaliza paths: aceita /app/... e converte para /...
   - Clear robusto (iOS): tenta delete do cache + fallback por entries (batch)
*/
(() => {
  "use strict";

  const OVERRIDE_CACHE = "rcf_overrides_v1";
  const VERSION = "v1.1";

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
    return { ok: true, url };
  }

  async function delOverride(path) {
    const url = makeKeyUrl(path);
    const cache = await caches.open(OVERRIDE_CACHE);
    const ok = await cache.delete(url, { ignoreSearch: true });
    return { ok: true, deleted: !!ok, url, path: normPath(path) };
  }

  async function listOverrides() {
    const cache = await caches.open(OVERRIDE_CACHE);
    const reqs = await cache.keys();
    const out = (reqs || []).map(r => {
      try {
        const u = new URL(r.url);
        return u.pathname || "/";
      } catch {
        return "/unknown";
      }
    });
    return { ok: true, count: out.length, paths: out };
  }

  async function clearOverrides() {
    // ✅ caminho rápido
    try {
      const ok = await caches.delete(OVERRIDE_CACHE);
      if (ok) return { ok: true, mode: "caches.delete", deleted: 1 };
    } catch {}

    // ✅ fallback (iOS): limpa por entries em lotes
    try {
      const cache = await caches.open(OVERRIDE_CACHE);
      const reqs = await cache.keys();
      let n = 0;

      const list = reqs || [];
      for (let i = 0; i < list.length; i++) {
        try {
          const r = list[i];
          const ok = await cache.delete(r, { ignoreSearch: true });
          if (ok) n++;
        } catch {}
      }

      return { ok: true, mode: "cache.delete(entries)", deleted: n };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
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
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
      try {
        const cache = await caches.open(OVERRIDE_CACHE);

        const keyUrl = makeKeyUrl(url.pathname);
        let hit = await cache.match(keyUrl, { ignoreSearch: true });
        if (hit) return hit;

        hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
      } catch {}

      return fetch(req);
    })());
  });

  self.addEventListener("message", (event) => {
    const msg = event.data || {};
    const port = event.ports && event.ports[0];

    function reply(payload) {
      try {
        if (port) port.postMessage(payload);
        else if (event.source && typeof event.source.postMessage === "function") event.source.postMessage(payload);
      } catch {}
    }

    (async () => {
      try {
        if (msg.type === "RCF_OVERRIDE_PUT") {
          const r = await putOverride(msg.path, msg.content, msg.contentType);
          reply({ type: "RCF_OVERRIDE_PUT_OK", ...r, path: normPath(msg.path), v: VERSION });
          return;
        }

        if (msg.type === "RCF_OVERRIDE_DEL") {
          const r = await delOverride(msg.path);
          reply({ type: "RCF_OVERRIDE_DEL_OK", ...r, v: VERSION });
          return;
        }

        if (msg.type === "RCF_OVERRIDE_LIST") {
          const r = await listOverrides();
          reply({ type: "RCF_OVERRIDE_LIST_OK", ...r, v: VERSION });
          return;
        }

        if (msg.type === "RCF_OVERRIDE_CLEAR") {
          const r = await clearOverrides();
          if (!r.ok) throw new Error(r.error || "clear failed");
          reply({ type: "RCF_OVERRIDE_CLEAR_OK", ...r, v: VERSION });
          return;
        }

        reply({ type: "RCF_SW_NOP", ok: true, v: VERSION });
      } catch (e) {
        reply({ type: (msg.type || "RCF_SW") + "_ERR", error: String(e?.message || e), v: VERSION });
      }
    })();
  });


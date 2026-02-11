/* RControl Factory — /app/sw.js (FULL)
   - Offline-first simples
   - Cache versionado (mata cache velho)
   - skipWaiting + clients.claim
   - Suporte a overrides via postMessage:
       RCF_OVERRIDE_PUT {path, content, contentType}
       RCF_OVERRIDE_CLEAR
   - Intercepta fetch e, se tiver override, responde com ele.
*/

const CACHE_VERSION = "rcf-cache-v20260210_3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",

  "./js/admin.js",
  "./js/ai.builder.js",

  "./js/core/logger.js",
  "./js/core/storage.js",
  "./js/core/errors.js",
  "./js/core/policy.js",
  "./js/core/risk.js",
  "./js/core/snapshot.js",
  "./js/core/patch.js",
  "./js/core/patchset.js",
  "./js/core/diagnostics.js",
  "./js/core/commands.js",
  "./js/core/ui_safety.js",
  "./js/core/ui_bindings.js",
  "./js/core/selfheal.js",
  "./js/core/autofix.js",
  "./js/core/vfs_overrides.js",
  "./js/core/thompson.js",
  "./js/core/mother_selfupdate.js",

  "./manifest.json",
  "./privacy.html",
  "./terms.html"
];

// overrides no SW (memória + persistência em cache separado)
const OV_CACHE = "rcf-overrides-v1";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(CACHE_VERSION);
    // tenta pré-cache, mas não quebra se algum não existir
    try { await cache.addAll(ASSETS); } catch {}
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // limpa caches antigos
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== CACHE_VERSION && k !== OV_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

async function getOverride(url) {
  const ov = await caches.open(OV_CACHE);
  const key = new Request(url, { method: "GET" });
  const hit = await ov.match(key);
  return hit || null;
}

async function putOverride(path, content, contentType) {
  const ov = await caches.open(OV_CACHE);
  const absUrl = new URL(path, self.location.origin).toString();
  const res = new Response(content, {
    headers: { "Content-Type": contentType || "text/plain; charset=utf-8" }
  });
  await ov.put(absUrl, res);
  return absUrl;
}

async function clearOverrides() {
  await caches.delete(OV_CACHE);
  await caches.open(OV_CACHE);
}

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  (async () => {
    try {
      if (msg.type === "RCF_OVERRIDE_PUT") {
        const abs = await putOverride(msg.path, msg.content, msg.contentType);
        event.source?.postMessage({ type: "RCF_OVERRIDE_PUT_OK", ok: true, path: msg.path, abs });
      }

      if (msg.type === "RCF_OVERRIDE_CLEAR") {
        await clearOverrides();
        event.source?.postMessage({ type: "RCF_OVERRIDE_CLEAR_OK", ok: true });
      }
    } catch (e) {
      event.source?.postMessage({ type: "RCF_OVERRIDE_ERR", ok: false, msg: e?.message || String(e) });
    }
  })();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // só controla o escopo /app/ (evita pegar coisa fora)
  if (!url.pathname.includes("/app/") && url.pathname !== "/app") {
    return;
  }

  event.respondWith((async () => {
    // 1) override tem prioridade
    const ov = await getOverride(req.url);
    if (ov) return ov;

    // 2) cache-first para assets
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    if (cached) return cached;

    // 3) rede e depois cache
    try {
      const fresh = await fetch(req);
      // cache só se ok
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      // fallback: tenta index
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
      throw e;
    }
  })());
});

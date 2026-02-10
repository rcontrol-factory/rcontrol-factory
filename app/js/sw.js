/* sw.js — RControl Factory (OVERRIDES)
   Intercepta arquivos e serve versões “override” do Cache Storage.
*/

const OVERRIDE_CACHE = "rcf-overrides-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Decide se um URL é “asset da Factory” que pode ser sobrescrito
function isFactoryAsset(url) {
  // ajuste se seu app não estiver na raiz
  const p = url.pathname || "";
  return (
    p === "/" ||
    p.endsWith("/index.html") ||
    p.endsWith("/styles.css") ||
    p.endsWith("/app.js") ||
    p.includes("/core/") ||
    p.includes("/import/") ||
    p.endsWith("/manifest.json")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // só GET e mesma origem
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (!isFactoryAsset(url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(OVERRIDE_CACHE);

    // tenta override primeiro
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;

    // fallback normal
    return fetch(req);
  })());
});

// Canal de mensagens para “escrever override” e “limpar override”
self.addEventListener("message", (event) => {
  const data = event.data || {};
  const type = data.type;

  if (type === "RCF_OVERRIDE_PUT") {
    event.waitUntil((async () => {
      const { path, content, contentType } = data;
      const cache = await caches.open(OVERRIDE_CACHE);

      const url = new URL(path, self.location.origin).toString();
      const resp = new Response(String(content || ""), {
        headers: { "Content-Type": contentType || "text/plain; charset=utf-8" }
      });

      await cache.put(url, resp);
      event.source?.postMessage({ ok: true, type: "RCF_OVERRIDE_PUT_OK", path });
    })());
  }

  if (type === "RCF_OVERRIDE_CLEAR") {
    event.waitUntil((async () => {
      await caches.delete(OVERRIDE_CACHE);
      event.source?.postMessage({ ok: true, type: "RCF_OVERRIDE_CLEAR_OK" });
    })());
  }
});

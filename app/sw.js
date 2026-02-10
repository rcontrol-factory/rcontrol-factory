/* RControl Factory — sw.js (FULL) — Mother Overrides
   - Cache básico offline-first
   - Override via localStorage (bundle salvo pela Mãe)
   - Quando existir override para uma URL, SW responde por cima
*/

const CACHE_NAME = "rcf-cache-v1.3"; // se mudar algo, incremente aqui

// arquivos básicos do app (ajuste se quiser adicionar mais)
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",

  // js (seu layout atual)
  "/js/core/logger.js",
  "/js/core/storage.js",
  "/js/core/errors.js",
  "/js/core/policy.js",
  "/js/core/risk.js",
  "/js/core/snapshot.js",
  "/js/core/patch.js",
  "/js/core/patchset.js",
  "/js/core/diagnostics.js",
  "/js/core/commands.js",
  "/js/core/ui_safety.js",
  "/js/core/ui_bindings.js",
  "/js/core/selfheal.js",
  "/js/core/autofix.js",

  "/js/admin.js",
  "/js/ai.builder.js"
];

// ===== Helpers =====
function normalizePath(url) {
  // transforma https://site/app/js/x.js -> /js/x.js
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return "/";
  }
}

// Lê overrides do bundle via localStorage **usando clients** (SW não acessa localStorage direto)
// Então a gente pede pra página responder com o bundle.
async function getBundleFromClient() {
  const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (!allClients || !allClients.length) return null;

  // pergunta para o primeiro client
  const client = allClients[0];
  const channel = new MessageChannel();

  const p = new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 650);
    channel.port1.onmessage = (ev) => {
      clearTimeout(t);
      resolve(ev.data || null);
    };
  });

  client.postMessage({ type: "RCF_GET_MOTHER_BUNDLE" }, [channel.port2]);
  return await p;
}

async function tryOverrideResponse(req) {
  // Só aplica override em GET
  if (req.method !== "GET") return null;

  const path = normalizePath(req.url);

  // Não sobrescrever sw.js por segurança
  if (path === "/sw.js") return null;

  const bundle = await getBundleFromClient();
  if (!bundle || !bundle.files || typeof bundle.files !== "object") return null;

  const text = bundle.files[path];
  if (typeof text !== "string") return null;

  // content-type simples
  let contentType = "text/plain; charset=utf-8";
  if (path.endsWith(".js")) contentType = "application/javascript; charset=utf-8";
  if (path.endsWith(".css")) contentType = "text/css; charset=utf-8";
  if (path.endsWith(".html")) contentType = "text/html; charset=utf-8";
  if (path.endsWith(".json")) contentType = "application/json; charset=utf-8";

  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "X-RCF-Override": "1"
    }
  });
}

// ===== SW lifecycle =====
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      self.clients.claim();
    })()
  );
});

// ===== Fetch: override > cache > network =====
self.addEventListener("fetch", (event) => {
  const req = event.request;

  event.respondWith(
    (async () => {
      // 1) Override primeiro (Mãe manda)
      const overridden = await tryOverrideResponse(req);
      if (overridden) return overridden;

      // 2) Cache
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      // 3) Network (e guarda no cache se for GET)
      try {
        const res = await fetch(req);
        if (req.method === "GET" && res && res.status === 200) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        // fallback simples
        return cached || new Response("Offline", { status: 503 });
      }
    })()
  );
});

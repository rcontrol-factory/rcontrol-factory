/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.2
   - Ponte do app -> SW (CacheStorage overrides)
   - Exige SW com RPC:
     RCF_OVERRIDE_PUT, CLEAR, LIST, DEL
   - API pública:
     - put(path, content, contentType)
     - clearOverrides()
     - listOverrides()
     - delOverride(path)
     - status()
*/
(() => {
  "use strict";

  if (window.RCF_VFS_OVERRIDES && window.RCF_VFS_OVERRIDES.__v12) return;

  const VERSION = "v1.2";
  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[VFS_OVR]", lvl, msg); } catch {}
  };

  function normPath(input) {
    let p = String(input || "").trim();
    if (!p) return "/";
    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    // compat repo -> runtime
    if (p === "/app/index.html") p = "/index.html";
    if (p.startsWith("/app/")) p = p.slice(4);
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

  async function waitForController(timeoutMs = 2500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ctrl = navigator.serviceWorker?.controller;
      if (ctrl) return ctrl;
      await new Promise(r => setTimeout(r, 50));
    }
    return null;
  }

  async function rpc(msg, timeoutMs = 6000) {
    const ctrl = await waitForController();
    if (!ctrl) throw new Error("SW controller ausente (recarregue a página)");
    const ch = new MessageChannel();

    const p = new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("RPC timeout"));
      }, timeoutMs);

      ch.port1.onmessage = (ev) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(ev.data);
      };
    });

    ctrl.postMessage(msg, [ch.port2]);
    return p;
  }

  async function put(path, content, contentType) {
    const p = normPath(path);
    const ct = contentType || guessType(p);
    const res = await rpc({ type: "RCF_OVERRIDE_PUT", path: p, content: String(content ?? ""), contentType: ct });
    if (!res || (res.type || "").endsWith("_ERR")) throw new Error(res?.error || "PUT falhou");
    return res;
  }

  async function clearOverrides() {
    const res = await rpc({ type: "RCF_OVERRIDE_CLEAR" }, 12000);
    if (!res || (res.type || "").endsWith("_ERR")) throw new Error(res?.error || "CLEAR falhou");
    return res;
  }

  async function listOverrides() {
    const res = await rpc({ type: "RCF_OVERRIDE_LIST" }, 8000);
    if (!res || (res.type || "").endsWith("_ERR")) throw new Error(res?.error || "LIST falhou");
    return res;
  }

  async function delOverride(path) {
    const p = normPath(path);
    const res = await rpc({ type: "RCF_OVERRIDE_DEL", path: p }, 8000);
    if (!res || (res.type || "").endsWith("_ERR")) throw new Error(res?.error || "DEL falhou");
    return res;
  }

  function status() {
    const ctrl = !!navigator.serviceWorker?.controller;
    return {
      ok: true,
      v: VERSION,
      scope: (navigator.serviceWorker?.controller?.scriptURL ? "./" : "/"),
      base: document.baseURI || location.href,
      sw_controller: ctrl
    };
  }

  const api = {
    __v12: true,
    VERSION,
    normPath,
    guessType,
    rpc,
    put,
    clearOverrides,
    listOverrides,
    delOverride,
    status,
  };

  window.RCF_VFS_OVERRIDES = api;

  // compat aliases (se alguém chamar por nomes diferentes)
  window.RCF_VFS = window.RCF_VFS || {};
  window.RCF_VFS.put = put;
  window.RCF_VFS.clearOverrides = clearOverrides;

  log("ok", `vfs_overrides ready ✅ ${VERSION} scope=/ base=${(document.baseURI || "").split("?")[0]}`);
})();

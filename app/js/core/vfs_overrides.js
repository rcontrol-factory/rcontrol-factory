/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.3b
   Patch mínimo (anti "files=0" falso + anti sumiço do objeto global):
   - Loga INFO: loaded v1.3b logo no início
   - Garante window.RCF_VFS_OVERRIDES sempre definido (mesmo se ocorrer erro)
   - listOverridesSafe(): nunca throw (retorna [] + motivo)
   - cache da última LIST ok (evita 0 intermitente)
   - status() mais informativo (can_rpc, last_list_count)
   - rpc/put/clear/del continuam STRICT (throw) como antes
*/
(() => {
  "use strict";

  const VERSION = "v1.3b";

  // ✅ log super cedo (antes de qualquer coisa) pra provar que ESTE arquivo rodou
  try { console.log("[VFS_OVR] INFO: loaded", VERSION); } catch {}

  // ✅ garante objeto global mesmo se houver erro depois (shim/probe nunca mais vê "has_overrides:false" sem motivo)
  if (!window.RCF_VFS_OVERRIDES) window.RCF_VFS_OVERRIDES = { __stub: true, VERSION };

  // evita double init
  if (window.RCF_VFS_OVERRIDES && window.RCF_VFS_OVERRIDES.__v13b) return;

  const log = (lvl, msg, obj) => {
    try {
      if (obj !== undefined) window.RCF_LOGGER?.push?.(lvl, String(msg) + " " + JSON.stringify(obj));
      else window.RCF_LOGGER?.push?.(lvl, String(msg));
    } catch {}
    try {
      if (obj !== undefined) console.log("[VFS_OVR]", lvl, msg, obj);
      else console.log("[VFS_OVR]", lvl, msg);
    } catch {}
  };

  try {
    // ---- last good LIST cache (pra não cair em 0 do nada) ----
    let _lastList = null; // {ts:number, res:any}
    let _lastListCount = 0;

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

      // cache do último ok
      try {
        _lastList = { ts: Date.now(), res };
        const items = Array.isArray(res?.items) ? res.items
          : Array.isArray(res?.list) ? res.list
          : Array.isArray(res?.paths) ? res.paths
          : Array.isArray(res?.keys) ? res.keys
          : null;
        _lastListCount = Array.isArray(items) ? items.length : (_lastListCount || 0);
      } catch {}

      return res;
    }

    // ✅ SAFE para scanner: nunca quebra, nunca throw
    async function listOverridesSafe(opts = {}) {
      const maxAgeMs = Number(opts.maxAgeMs || 25_000);
      const allowStale = (opts.allowStale !== false);

      try {
        const res = await listOverrides();
        return { ok: true, res, itemsCount: _lastListCount, from: "rpc" };
      } catch (e) {
        const reason = (e && e.message) ? e.message : String(e);

        if (allowStale && _lastList && (Date.now() - _lastList.ts) <= maxAgeMs) {
          return { ok: true, res: _lastList.res, itemsCount: _lastListCount, from: "cache", warn: reason };
        }

        return { ok: false, res: null, itemsCount: 0, from: "none", warn: reason };
      }
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
        sw_controller: ctrl,
        can_rpc: ctrl,
        base: document.baseURI || location.href,
        last_list_count: _lastListCount || 0,
        last_list_at: _lastList?.ts || 0
      };
    }

    const api = {
      __v13b: true,
      VERSION,
      normPath,
      guessType,
      rpc,
      put,
      clearOverrides,
      clear: clearOverrides, // ✅ alias pra compat (MAE/shim)
      listOverrides,
      listOverridesSafe,
      delOverride,
      status,
    };

    window.RCF_VFS_OVERRIDES = api;

    // compat aliases (se alguém chamar por nomes diferentes)
    window.RCF_VFS = window.RCF_VFS || {};
    if (typeof window.RCF_VFS.put !== "function") window.RCF_VFS.put = put;
    if (typeof window.RCF_VFS.clearOverrides !== "function") window.RCF_VFS.clearOverrides = clearOverrides;
    if (typeof window.RCF_VFS.clearAll !== "function") window.RCF_VFS.clearAll = clearOverrides;

    log("ok", `vfs_overrides ready ✅ ${VERSION} base=${(document.baseURI || "").split("?")[0]}`);
  } catch (e) {
    // ✅ se algo deu errado, registra e mantém stub (pra gente ver o motivo)
    const err = (e && e.stack) ? e.stack : String(e);
    try { window.RCF_VFS_OVERRIDES.__boot_err = err; } catch {}
    log("err", "vfs_overrides BOOT FAIL", { v: VERSION, err });
  }
})();

/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.3b
   Patch mínimo (anti "files=0" falso + anti "OVERRIDES sumiu"):
   - LOG "loaded" no começo (prova de versão)
   - try/catch global com log de erro e fallback stub (pra não ficar has_overrides=false)
   - Mantém v1.3: listOverridesSafe() nunca throw + cache de última LIST ok
   - status() mais informativo
   - rpc/put/clear/del continuam STRICT (throw) como antes
*/
(() => {
  "use strict";

  const VERSION = "v1.3b";
  const TAG = "[VFS_OVR]";

  // anti double init
  if (window.RCF_VFS_OVERRIDES && window.RCF_VFS_OVERRIDES.__v13b) return;

  const pushLog = (lvl, msg, obj) => {
    try {
      const line = obj !== undefined ? `${msg} ${JSON.stringify(obj)}` : String(msg);
      window.RCF_LOGGER?.push?.(lvl, line);
    } catch {}
    try {
      if (obj !== undefined) console.log(TAG, lvl, msg, obj);
      else console.log(TAG, lvl, msg);
    } catch {}
  };

  // ✅ prova que esse arquivo executou
  pushLog("info", `loaded ${VERSION}`);

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
      const maxAgeMs = Number(opts.maxAgeMs || 25_000); // usa cache recente (25s)
      const allowStale = (opts.allowStale !== false);   // padrão: true

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
        last_list_at: _lastList?.ts || 0,
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

    pushLog("ok", `ready ✅ ${VERSION} base=${(document.baseURI || "").split("?")[0]}`);
  } catch (err) {
    // ✅ nunca deixar "sumir" sem log
    pushLog("err", `fatal init error ${VERSION}`, { message: err?.message || String(err), stack: String(err?.stack || "") });

    // stub mínimo (pra shim/probe não ficar has_overrides=false)
    window.RCF_VFS_OVERRIDES = {
      __v13b: true,
      VERSION,
      status: () => ({ ok: false, v: VERSION, err: err?.message || String(err) }),
      normPath: (p) => {
        let s = String(p || "").trim();
        if (!s) return "/";
        if (!s.startsWith("/")) s = "/" + s;
        return s.replace(/\/{2,}/g, "/");
      }
    };
  }
})();

/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.2
   Patch cirúrgico:
   - Garante API esperada pelo MAE:
       - status()
       - clearOverrides()
   - Mantém o comportamento atual (MessageChannel -> SW).
   - Não muda SW, não muda estrutura, só completa os nomes faltando.
*/

(() => {
  "use strict";

  if (window.RCF_VFS && window.RCF_VFS.__v12) return;

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[VFS]", lvl, msg); } catch {}
  };

  const SW_PUT   = "RCF_OVERRIDE_PUT";
  const SW_CLEAR = "RCF_OVERRIDE_CLEAR";

  // ====== Helpers ======
  function normalizePath(p) {
    let x = String(p || "").trim();
    if (!x) return "/";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");

    // compat repo/runtime
    if (x === "/app/index.html") x = "/index.html";
    if (x.startsWith("/app/")) x = x.slice(4);
    if (!x.startsWith("/")) x = "/" + x;

    return x;
  }

  function swController() {
    return navigator?.serviceWorker?.controller || null;
  }

  async function postToSW(message, timeoutMs = 8000) {
    const ctrl = swController();
    if (!ctrl) throw new Error("SW controller ausente");

    return await new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => {
        try { ch.port1.onmessage = null; } catch {}
        reject(new Error("TIMEOUT " + timeoutMs + "ms (postToSW)"));
      }, timeoutMs);

      ch.port1.onmessage = (ev) => {
        clearTimeout(t);
        resolve(ev.data);
      };

      try {
        ctrl.postMessage(message, [ch.port2]);
      } catch (e) {
        clearTimeout(t);
        reject(e);
      }
    });
  }

  // ====== API real ======
  async function put(path, content, contentType) {
    const p = normalizePath(path);
    const res = await postToSW({ type: SW_PUT, path: p, content, contentType }, 12000);

    // aceitamos OK em vários formatos
    if (res?.type && String(res.type).includes("_ERR")) {
      throw new Error(res.error || "SW put err");
    }
    return { ok: true, path: p, res };
  }

  async function clearOverrides() {
    const res = await postToSW({ type: SW_CLEAR }, 9000);
    if (res?.type && String(res.type).includes("_ERR")) {
      throw new Error(res.error || "SW clear err");
    }
    return { ok: true, res };
  }

  // ====== SHIMS (o que o MAE espera) ======
  function status() {
    const ctrl = !!swController();
    return {
      ok: true,
      controller: ctrl,
      hasPut: true,
      hasClearOverrides: true,
      version: "v1.2",
      scope: (navigator?.serviceWorker?.controller?.scriptURL || "").includes("/app/") ? "/app" : "/",
    };
  }

  // objeto público — com compat para nomes antigos/novos
  const api = {
    __v12: true,
    normalizePath,

    // nomes base
    put,
    clearOverrides,
    status,

    // compat: se algum código usa "clear"
    clear: clearOverrides,

    // compat: se algum código usa "putOverride"
    putOverride: put,
  };

  window.RCF_VFS = api;

  // log de boot igual você já vê
  try {
    // tenta descobrir base (sem forçar nada)
    const base = document?.baseURI || location.href;
    log("ok", `vfs_overrides ready ✅ v1.2 scope=/ base=${base}`);
  } catch {
    log("ok", "vfs_overrides ready ✅ v1.2 scope=/");
  }
})();

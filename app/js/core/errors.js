/* =========================================================
  RControl Factory — /app/js/core/errors.js (FULL) — v1.0 (PADRÃO)
  - Error helpers (normalize + report)
  - Integra com RCF_LOGGER + RCF_STABILITY (se existir)
  API: window.RCF_ERRORS
========================================================= */
(() => {
  "use strict";

  if (window.RCF_ERRORS && window.RCF_ERRORS.__v10) return;

  function safeStr(x){
    try { return typeof x === "string" ? x : JSON.stringify(x); }
    catch { return String(x); }
  }

  function normalize(errLike){
    const e = errLike || {};
    const msg = safeStr(e.message || e.msg || e);
    const stack = safeStr(e.stack || "");
    const name = safeStr(e.name || "Error");
    return { name, message: msg, stack };
  }

  function pushLog(level, msg, obj){
    const line = obj ? (msg + " " + safeStr(obj)) : msg;
    try { window.RCF_LOGGER?.push?.(level, line); } catch {}
    try { console.log("[RCF_ERRORS]", level, line); } catch {}
  }

  function report(kind, errLike, meta){
    const n = normalize(errLike);
    const payload = {
      kind: String(kind || "error"),
      ts: new Date().toISOString(),
      message: n.message,
      name: n.name,
      stack: n.stack,
      meta: meta || null,
      href: location.href,
      ua: navigator.userAgent
    };

    pushLog("err", `${payload.kind}: ${payload.message}`, meta || null);

    // se tiver stability_guard, grava fatal e/ou mostra tela
    try {
      // se o guard existir, ele já escuta eventos globais; aqui é “manual report”
      if (window.RCF_STABILITY && typeof window.RCF_STABILITY.showLastFatal === "function") {
        // não força tela; só mantém registro via localStorage (quando guard estiver ativo)
        localStorage.setItem("rcf:fatal:last", JSON.stringify(payload));
      }
    } catch {}

    return payload;
  }

  window.RCF_ERRORS = { __v10:true, normalize, report };
  pushLog("ok", "core/errors.js ready ✅ (v1.0)");
})();

/* =========================================================
  RControl Factory — /app/js/core/errors.js (PADRÃO) — v1.0
  - Catálogo de erros + helpers
  - Não depende de Editor
  - iOS-safe / não quebra se faltar Logger
  API: window.RCF_ERRORS
========================================================= */
(() => {
  "use strict";

  if (window.RCF_ERRORS && window.RCF_ERRORS.__v10) return;

  function log(level, msg, obj) {
    try {
      const txt = obj !== undefined ? `${msg} ${JSON.stringify(obj)}` : String(msg);
      window.RCF_LOGGER?.push?.(level, txt);
    } catch {}
    try { console.log("[RCF_ERRORS]", level, msg, obj ?? ""); } catch {}
  }

  // Catálogo (você pode ir adicionando)
  const CODES = {
    UNKNOWN: "UNKNOWN",
    STORAGE_FULL: "STORAGE_FULL",
    JSON_PARSE: "JSON_PARSE",
    VFS_MISSING: "VFS_MISSING",
    VFS_PUT_FAIL: "VFS_PUT_FAIL",
    GH_CFG_MISSING: "GH_CFG_MISSING",
    GH_PULL_FAIL: "GH_PULL_FAIL",
    GH_PUSH_FAIL: "GH_PUSH_FAIL",
    POLICY_BLOCKED: "POLICY_BLOCKED",
    PATCH_MISMATCH: "PATCH_MISMATCH",
    SW_UNAVAILABLE: "SW_UNAVAILABLE",
  };

  function make(code, message, meta) {
    const e = new Error(String(message || "Erro"));
    e.code = String(code || CODES.UNKNOWN);
    if (meta !== undefined) e.meta = meta;
    return e;
  }

  function wrap(err, code, message, meta) {
    const src = err instanceof Error ? err : new Error(String(err || "Erro"));
    const e = make(code || src.code || CODES.UNKNOWN, message || src.message, meta ?? src.meta);
    // encadeia, mas sem depender de "cause" (compat)
    try { e.cause = src; } catch {}
    // preserva stack se possível
    try { if (src.stack && !e.stack) e.stack = src.stack; } catch {}
    return e;
  }

  function toPublic(err) {
    const e = err || {};
    return {
      ok: false,
      code: String(e.code || CODES.UNKNOWN),
      message: String(e.message || "Erro"),
      meta: e.meta ?? null,
    };
  }

  function guard(fn, fallbackValue) {
    try {
      const r = fn();
      return r;
    } catch (e) {
      log("err", "guard() captured", { code: e?.code, msg: e?.message });
      return fallbackValue;
    }
  }

  async function guardAsync(fn, fallbackValue) {
    try {
      return await fn();
    } catch (e) {
      log("err", "guardAsync() captured", { code: e?.code, msg: e?.message });
      return fallbackValue;
    }
  }

  // helper comum: detecta storage full (QuotaExceededError)
  function isStorageFullError(e) {
    const msg = String(e?.message || e || "").toLowerCase();
    return (
      e?.name === "QuotaExceededError" ||
      msg.includes("quota") ||
      msg.includes("storage") && msg.includes("exceed")
    );
  }

  window.RCF_ERRORS = {
    __v10: true,
    CODES,
    make,
    wrap,
    toPublic,
    guard,
    guardAsync,
    isStorageFullError,
  };

  log("ok", "core/errors.js ready ✅ (v1.0)");
})();

(() => {
  "use strict";

  const safeStr = (x) => {
    try {
      if (typeof x === "string") return x;
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  };

  function log(level, msg, extra) {
    try {
      window.RCF_LOGGER?.push?.(level, msg + (extra ? " " + safeStr(extra) : ""));
    } catch {}
  }

  function installAll() {
    try { window.RCF_ERROR_GUARD?.install?.(); } catch (e) { log("warn", "installAll: error_guard falhou", e); }
    try { window.RCF_CLICK_GUARD?.install?.(); } catch (e) { log("warn", "installAll: click_guard falhou", e); }
    log("ok", "Diagnostics: installAll ✅");
    return true;
  }

  function scanAll() {
    const overlays = (window.RCF_OVERLAY_SCANNER?.scan?.() || []);
    return { overlays };
  }

  function runMicroTests() {
    return window.RCF_MICROTESTS?.runAll?.() || [];
  }

  function runStateDiagnostic() {
    try {
      const st = window.RCF?.state;
      if (!st) return { ok: false, error: "window.RCF.state não existe" };

      if (!window.RCF_RUN_DIAGNOSTIC) {
        return { ok: false, error: "RCF_RUN_DIAGNOSTIC ausente (carregue /js/diagnostics/run_diagnostic.js)" };
      }

      const result = window.RCF_RUN_DIAGNOSTIC(st);
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  async function dumpErrors(limit = 120) {
    try {
      if (!window.RCF_IDB?.listErrors) return { ok: false, error: "RCF_IDB.listErrors ausente (carregue idb.js)" };
      const list = await window.RCF_IDB.listErrors(limit);
      return { ok: true, list };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  async function clearErrors() {
    try {
      if (!window.RCF_IDB?.clearErrors) return { ok: false, error: "RCF_IDB.clearErrors ausente (carregue idb.js)" };
      await window.RCF_IDB.clearErrors();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  function status() {
    const flags = {
      RCF_LOGGER: !!window.RCF_LOGGER,
      RCF_IDB: !!window.RCF_IDB,
      RCF_ERROR_GUARD: !!window.RCF_ERROR_GUARD,
      RCF_CLICK_GUARD: !!window.RCF_CLICK_GUARD,
      RCF_OVERLAY_SCANNER: !!window.RCF_OVERLAY_SCANNER,
      RCF_MICROTESTS: !!window.RCF_MICROTESTS,
      RCF_RUN_DIAGNOSTIC: !!window.RCF_RUN_DIAGNOSTIC,
      RCF_STATE: !!window.RCF?.state
    };
    return flags;
  }

  window.RCF_DIAGNOSTICS = window.RCF_DIAGNOSTICS || {
    installAll,
    scanAll,
    runMicroTests,
    runStateDiagnostic,
    dumpErrors,
    clearErrors,
    status
  };

  log("ok", "diagnostics/index.js loaded ✅");
})();

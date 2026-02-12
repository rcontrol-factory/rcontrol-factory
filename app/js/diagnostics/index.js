(() => {
  "use strict";

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  function installAll() {
    try { window.RCF_ERROR_GUARD?.install?.(); } catch {}
    try { window.RCF_CLICK_GUARD?.install?.(); } catch {}
    log("ok", "Diagnostics: installAll ✅");
  }

  function scanAll() {
    const overlays = (window.RCF_OVERLAY_SCANNER?.scan?.() || []);
    return { overlays };
  }

  function runMicroTests() {
    return window.RCF_MICROTESTS?.runAll?.() || [];
  }

  function runStateDiagnostic(state) {
    try {
      const fn = window.RCF_RUN_DIAGNOSTIC?.runDiagnostic;
      if (!fn) return { ok: false, error: "RCF_RUN_DIAGNOSTIC.runDiagnostic não carregado" };
      return { ok: true, result: fn(state) };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  async function listStoredErrors(limit = 200) {
    try {
      const rows = await window.RCF_IDB?.listErrors?.(limit);
      return rows || [];
    } catch (e) {
      log("warn", "Diagnostics: listStoredErrors falhou " + (e?.message || e));
      return [];
    }
  }

  async function clearStoredErrors() {
    try {
      await window.RCF_IDB?.clearErrors?.();
      log("ok", "Diagnostics: clearStoredErrors ✅");
      return true;
    } catch (e) {
      log("warn", "Diagnostics: clearStoredErrors falhou " + (e?.message || e));
      return false;
    }
  }

  window.RCF_DIAGNOSTICS = window.RCF_DIAGNOSTICS || {
    installAll,
    scanAll,
    runMicroTests,
    runStateDiagnostic,
    listStoredErrors,
    clearStoredErrors
  };

  log("ok", "diagnostics/index.js loaded ✅");
})();

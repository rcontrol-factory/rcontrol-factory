/* =========================================================
  RControl Factory — /app/js/core/selfheal.js (FULL) — v1.0 (PADRÃO)
  - Rotinas simples de auto-ajuda (sem agressividade)
  API: window.RCF_SELFHEAL
========================================================= */
(() => {
  "use strict";

  if (window.RCF_SELFHEAL && window.RCF_SELFHEAL.__v10) return;

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[SELFHEAL]", lvl, msg); } catch {}
  };

  async function clearOverridesSafe(){
    try {
      if (window.RCF_MAE?.clear) { await window.RCF_MAE.clear(); return { ok:true, via:"RCF_MAE.clear" }; }
      if (window.RCF_VFS_OVERRIDES?.clearOverrides) { await window.RCF_VFS_OVERRIDES.clearOverrides(); return { ok:true, via:"RCF_VFS_OVERRIDES.clearOverrides" }; }
      if (window.RCF_VFS_OVERRIDES?.clear) { await window.RCF_VFS_OVERRIDES.clear(); return { ok:true, via:"RCF_VFS_OVERRIDES.clear" }; }
    } catch (e) {
      return { ok:false, err: e?.message || String(e) };
    }
    return { ok:false, err:"clear não disponível" };
  }

  async function runDiag(){
    try {
      if (window.RCF_DIAGNOSTICS?.installAll) window.RCF_DIAGNOSTICS.installAll();
      if (window.RCF_DIAGNOSTICS?.runStabilityCheck) return await window.RCF_DIAGNOSTICS.runStabilityCheck();
    } catch (e) {
      return { ok:false, err:e?.message || String(e) };
    }
    return { ok:false, err:"diagnostics não disponível" };
  }

  function showLastFatal(){
    try {
      if (window.RCF_STABILITY?.showLastFatal) { window.RCF_STABILITY.showLastFatal(); return true; }
    } catch {}
    return false;
  }

  window.RCF_SELFHEAL = { __v10:true, clearOverridesSafe, runDiag, showLastFatal };

  log("ok", "core/selfheal.js ready ✅ (v1.0)");
})();

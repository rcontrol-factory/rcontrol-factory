/* =========================================================
  RControl Factory — /app/js/core/selfheal.js (PADRÃO) — v1.0
  - Rotinas rápidas de recuperação
  - API: window.RCF_SELFHEAL
========================================================= */
(() => {
  "use strict";

  if (window.RCF_SELFHEAL && window.RCF_SELFHEAL.__v10) return;

  const KEY_EXTRA = "rcf:logs:extra";

  function log(lvl, msg){
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[SELFHEAL]", lvl, msg); } catch {}
  }

  async function clearOverridesAndReload(){
    try { await window.RCF_VFS_OVERRIDES?.clear?.(); } catch {}
    try { await window.RCF_VFS?.clearAll?.(); } catch {}
    location.reload();
  }

  function showLastFatal(){
    try { window.RCF_STABILITY?.showLastFatal?.(); return true; } catch {}
    return false;
  }

  function clearFatal(){
    try { window.RCF_STABILITY?.clearFatal?.(); } catch {}
    try { localStorage.removeItem("rcf:fatal:last"); } catch {}
    return true;
  }

  function clearExtraLogs(){
    try { localStorage.removeItem(KEY_EXTRA); } catch {}
    return true;
  }

  window.RCF_SELFHEAL = {
    __v10:true,
    clearOverridesAndReload,
    showLastFatal,
    clearFatal,
    clearExtraLogs
  };

  log("ok", "core/selfheal.js ready ✅ (v1.0)");
})();

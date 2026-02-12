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

  window.RCF_DIAGNOSTICS = window.RCF_DIAGNOSTICS || {
    installAll,
    scanAll,
    runMicroTests
  };

  log("ok", "diagnostics/index.js loaded ✅");
})();

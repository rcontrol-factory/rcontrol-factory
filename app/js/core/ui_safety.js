/* =========================================================
  RControl Factory — /app/js/core/ui_safety.js (PADRÃO) — v1.0
  - Liga proteções UI (compact outputs, anti overflow)
  - API: window.RCF_UI_SAFETY
========================================================= */
(() => {
  "use strict";

  if (window.RCF_UI_SAFETY && window.RCF_UI_SAFETY.__v10) return;

  function log(lvl, msg){
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[UI_SAFETY]", lvl, msg); } catch {}
  }

  function applyBaseSafety(){
    // evita seleção/cópia travar scroll (leve)
    try {
      document.body.style.webkitTextSizeAdjust = "100%";
      document.body.style.overflowX = "hidden";
    } catch {}

    // se ui_compact_outputs existir, garante init
    try {
      if (window.RCF_UI_COMPACT && typeof window.RCF_UI_COMPACT.compactLogsOut === "function") {
        window.RCF_UI_COMPACT.compactLogsOut();
      }
    } catch {}
  }

  function install(){
    applyBaseSafety();

    // observa para reaplicar (views mudando)
    try {
      const obs = new MutationObserver(() => applyBaseSafety());
      obs.observe(document.documentElement, { childList:true, subtree:true });
    } catch {}

    log("ok", "ui_safety installed ✅ (v1.0)");
    return true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once:true });
  } else {
    install();
  }

  window.RCF_UI_SAFETY = { __v10:true, install };
})();

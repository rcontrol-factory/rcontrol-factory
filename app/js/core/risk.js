/* =========================================================
  RControl Factory — /app/js/core/risk.js (PADRÃO) — v1.0
  - Classifica risco de path (usa RCF_POLICY se existir)
  - API: window.RCF_RISK
========================================================= */
(() => {
  "use strict";

  if (window.RCF_RISK && window.RCF_RISK.__v10) return;

  const safeStr = (v) => {
    try { return typeof v === "string" ? v : JSON.stringify(v); }
    catch { return String(v); }
  };

  function classify(path){
    try {
      if (window.RCF_POLICY && typeof window.RCF_POLICY.classify === "function") {
        return window.RCF_POLICY.classify(path);
      }
    } catch (e) {
      try { window.RCF_ERRORS?.push?.({ kind:"risk.classify", message: safeStr(e?.message || e) }); } catch {}
    }

    // fallback simples
    const p = String(path || "");
    if (!p) return { ok:false, path:null, mode:"BLOCKED", reason:"path vazio" };
    if (p.includes("..")) return { ok:false, path:null, mode:"BLOCKED", reason:"path traversal" };
    return { ok:true, path: p.startsWith("/") ? p : ("/" + p), mode:"CONDITIONAL", rule:null };
  }

  function explain(mode){
    try {
      if (window.RCF_POLICY && typeof window.RCF_POLICY.explainMode === "function") {
        return window.RCF_POLICY.explainMode(mode);
      }
    } catch {}
    if (mode === "FREE") return "LIVRE (auto)";
    if (mode === "CONDITIONAL") return "CONDICIONAL (pede aprovação)";
    return "BLOQUEADO (nunca aplica)";
  }

  window.RCF_RISK = { __v10:true, classify, explain };

  try { window.RCF_LOGGER?.push?.("ok", "core/risk.js ready ✅ (v1.0)"); } catch {}
})();

/* =========================================================
  RControl Factory — /app/js/core/risk.js (FULL) — v1.0 (PADRÃO)
  - Classifica risco de paths antes de aplicar bundle/overrides
  - Usa RCF_POLICY se existir, senão fallback seguro
  API: window.RCF_RISK
========================================================= */
(() => {
  "use strict";

  if (window.RCF_RISK && window.RCF_RISK.__v10) return;

  const FALLBACK_BLOCKED = ["/sw.js", "/manifest.json", "/index.html"];
  const FALLBACK_COND = ["/app/app.js", "/app/index.html"];

  function normPath(p){
    try {
      if (window.RCF_POLICY?.normPath) return window.RCF_POLICY.normPath(p);
    } catch {}
    let s = String(p||"").trim();
    if (!s.startsWith("/")) s = "/" + s;
    s = s.split("?")[0].split("#")[0].replace(/\/{2,}/g,"/");
    if (s.includes("..")) return null;
    return s;
  }

  function classify(path){
    const n = normPath(path);
    if (!n) return { ok:false, path:null, mode:"BLOCKED", reason:"Path inválido" };

    try {
      if (window.RCF_POLICY?.classify) return window.RCF_POLICY.classify(n);
    } catch {}

    if (FALLBACK_BLOCKED.includes(n)) return { ok:true, path:n, mode:"BLOCKED", reason:"fallback blocked" };
    if (FALLBACK_COND.includes(n)) return { ok:true, path:n, mode:"CONDITIONAL", reason:"fallback conditional" };

    if (n.startsWith("/app/js/") || n.startsWith("/core/")) return { ok:true, path:n, mode:"FREE", reason:"fallback free" };
    return { ok:true, path:n, mode:"CONDITIONAL", reason:"fallback default" };
  }

  function explain(mode){
    if (window.RCF_POLICY?.explainMode) return window.RCF_POLICY.explainMode(mode);
    if (mode === "FREE") return "LIVRE (auto)";
    if (mode === "CONDITIONAL") return "CONDICIONAL (pede ok)";
    return "BLOQUEADO (nunca)";
  }

  window.RCF_RISK = { __v10:true, normPath, classify, explain };
  try { window.RCF_LOGGER?.push?.("ok", "core/risk.js ready ✅ (v1.0)"); } catch {}
})();

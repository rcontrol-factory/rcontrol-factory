/* =========================================================
  RControl Factory — core/thompson.js (FULL) v1.0
  "THOMPSON" = Validador + Diff + Dedupe para Mother Bundles
  - Valida formato { meta, files }
  - Normaliza paths (usa RCF_POLICY.normPath se existir)
  - Filtra inválidos/bloqueados
  - Diff: compara com overrides atuais e ignora "sem mudança"
========================================================= */

(function () {
  "use strict";

  const KEY_OVERRIDES = "rcf:mother_overrides_v2";

  function safeParseJSON(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
  function safeString(v) { return (v === undefined || v === null) ? "" : String(v); }

  function getPolicy() {
    const P = window.RCF_POLICY;
    return (P && typeof P.classify === "function" && typeof P.normPath === "function") ? P : null;
  }

  function normPath(path) {
    const P = getPolicy();
    if (P) return P.normPath(path);
    // fallback simples
    let s = String(path || "").trim();
    if (/^https?:\/\//i.test(s)) return null;
    if (!s.startsWith("/")) s = "/" + s;
    s = s.split("?")[0].split("#")[0].replace(/\/{2,}/g, "/");
    if (s.includes("..")) return null;
    return s;
  }

  function classify(path) {
    const P = getPolicy();
    if (P) return P.classify(path);
    // sem policy => condicional (mais seguro)
    const n = normPath(path);
    if (!n) return { ok:false, path:null, mode:"BLOCKED", reason:"Path inválido" };
    return { ok:true, path:n, mode:"CONDITIONAL" };
  }

  function normalizeBundle(obj) {
    const b = obj && typeof obj === "object" ? obj : {};
    const out = {
      meta: (b.meta && typeof b.meta === "object") ? b.meta : {},
      files: (b.files && typeof b.files === "object") ? b.files : {}
    };
    out.meta.name = safeString(out.meta.name || "mother-bundle");
    out.meta.version = safeString(out.meta.version || "1.0");
    out.meta.createdAt = safeString(out.meta.createdAt || "{{DATE}}");
    return out;
  }

  function loadCurrentOverrides() {
    const cur = safeParseJSON(localStorage.getItem(KEY_OVERRIDES) || "null", null);
    if (!cur || typeof cur !== "object") return { meta:{}, files:{} };
    if (!cur.files || typeof cur.files !== "object") cur.files = {};
    return cur;
  }

  function validateAndPlan(bundleObj) {
    const b = normalizeBundle(bundleObj);
    const keys = Object.keys(b.files || {});

    const plan = {
      ok: true,
      meta: b.meta,
      total: keys.length,
      free: [],
      conditional: [],
      blocked: [],
      invalid: [],
      normalizedFiles: {} // path normalizado -> content string
    };

    for (const k of keys) {
      const c = classify(k);
      if (!c.ok || !c.path) {
        plan.invalid.push({ path: k, reason: c.reason || "inválido" });
        continue;
      }

      const content = safeString(b.files[k]);
      plan.normalizedFiles[c.path] = content;

      if (c.mode === "FREE") plan.free.push(c.path);
      else if (c.mode === "CONDITIONAL") plan.conditional.push(c.path);
      else plan.blocked.push(c.path);
    }

    return plan;
  }

  function diffAgainstCurrent(plan) {
    const cur = loadCurrentOverrides();
    const curFiles = cur.files || {};
    const incoming = plan.normalizedFiles || {};

    const changed = [];
    const same = [];

    for (const [path, content] of Object.entries(incoming)) {
      const prev = safeString(curFiles[path]);
      if (prev === safeString(content)) same.push(path);
      else changed.push(path);
    }

    return { changed, same, currentCount: Object.keys(curFiles).length };
  }

  // API
  window.RCF_THOMPSON = {
    normalizeBundle,
    validateAndPlan,
    diffAgainstCurrent,
    loadCurrentOverrides
  };
})();

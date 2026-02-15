/* =========================================================
  RControl Factory — policy.js (FULL) v2.1b
  - Ajuste pro padrão /app/*
========================================================= */
(function () {
  "use strict";

  const DEFAULT_POLICY = {
    version: "2.1b",
    updatedAt: new Date().toISOString(),

    // regras avaliadas em ordem (primeiro match ganha)
    rules: [
      // ---------- BLOCKED (nunca via bundle/override) ----------
      { mode: "BLOCKED", match: "/sw.js" },
      { mode: "BLOCKED", match: "/app/sw.js" },

      { mode: "BLOCKED", match: "/manifest.json" },
      { mode: "BLOCKED", match: "/app/manifest.json" },

      // raiz antiga (se alguém tentar)
      { mode: "BLOCKED", match: "/index.html" },

      // ---------- CONDITIONAL (pede confirmação) ----------
      { mode: "CONDITIONAL", match: "/app/app.js" },
      { mode: "CONDITIONAL", match: "/app/index.html" },

      // ---------- FREE (auto) ----------
      { mode: "FREE", prefix: "/app/js/" },
      { mode: "FREE", prefix: "/app/js/core/" },
    ],

    fallbackMode: "CONDITIONAL"
  };

  const KEY = "rcf:policy_v2";

  function safeParseJSON(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function normPath(p) {
    let s = String(p || "").trim();

    // bloqueia URL externa (não é path)
    if (/^https?:\/\//i.test(s)) return null;

    if (!s.startsWith("/")) s = "/" + s;

    // remove query/hash
    s = s.split("?")[0].split("#")[0];

    // normaliza barras duplicadas
    s = s.replace(/\/{2,}/g, "/");

    // remove "/./"
    s = s.replace(/\/\.\//g, "/");

    // bloqueia ".." (path traversal)
    if (s.includes("..")) return null;

    return s;
  }

  function ruleMatches(rule, path) {
    if (!rule || !path) return false;

    if (rule.match) return path === rule.match;
    if (rule.prefix) return path.startsWith(rule.prefix);
    if (rule.regex) {
      try { return new RegExp(rule.regex).test(path); } catch { return false; }
    }
    return false;
  }

  function loadPolicy() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_POLICY;
    const p = safeParseJSON(raw, null);
    if (!p || !p.rules) return DEFAULT_POLICY;
    return p;
  }

  function savePolicy(p) {
    const obj = p && p.rules ? p : DEFAULT_POLICY;
    obj.updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(obj));
    return obj;
  }

  function classify(path) {
    const pol = loadPolicy();
    const n = normPath(path);
    if (!n) return { ok: false, path: null, mode: "BLOCKED", reason: "Path inválido (URL externa ou '..')." };

    for (const r of (pol.rules || [])) {
      if (ruleMatches(r, n)) {
        return { ok: true, path: n, mode: r.mode || "CONDITIONAL", rule: r };
      }
    }
    return { ok: true, path: n, mode: pol.fallbackMode || "CONDITIONAL", rule: null };
  }

  function explainMode(mode) {
    if (mode === "FREE") return "LIVRE (auto-aplica)";
    if (mode === "CONDITIONAL") return "CONDICIONAL (pede aprovação)";
    return "BLOQUEADO (nunca aplica)";
  }

  window.RCF_POLICY = {
    key: KEY,
    DEFAULT_POLICY,
    load: loadPolicy,
    save: savePolicy,
    normPath,
    classify,
    explainMode,
  };

  if (!localStorage.getItem(KEY)) savePolicy(DEFAULT_POLICY);
})();

/* RControl Factory — /app/js/core/pipeline_engine.js (NOVO) — v0.1a PADRÃO
   Objetivo: Pipeline controlado de auto-melhoria (NÃO aplica sozinho)
   - Roda Diagnostics + Microtests
   - Gera relatório PASS/WARN/FAIL
   - Salva histórico em localStorage
   - Pronto pra ser ligado na UI depois
*/
(() => {
  "use strict";

  if (window.RCF_PIPELINE && window.RCF_PIPELINE.__v01a) return;

  const LS_KEY = "rcf:pipeline:history";
  const LS_CFG = "rcf:pipeline:cfg";

  const nowISO = () => new Date().toISOString();

  function safeParse(raw, fb) {
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }
  function safeStringify(v) {
    try { return JSON.stringify(v); } catch { return "null"; }
  }

  function log(level, msg, obj) {
    try {
      if (obj !== undefined) window.RCF_LOGGER?.push?.(level, `${msg} ${safeStringify(obj)}`);
      else window.RCF_LOGGER?.push?.(level, msg);
    } catch {}
    try { console.log("[PIPELINE]", level, msg, obj ?? ""); } catch {}
  }

  function loadCfg() {
    const c = safeParse(localStorage.getItem(LS_CFG), {}) || {};
    return {
      enabled: !!c.enabled,         // se true, permite rodar pipeline (ainda NÃO aplica patch)
      keep: Number(c.keep || 40),   // quantos relatórios manter
      strict: !!c.strict,           // strict=true: WARN vira FAIL
    };
  }

  function saveCfg(cfg) {
    const safe = {
      enabled: !!cfg?.enabled,
      keep: Number(cfg?.keep || 40),
      strict: !!cfg?.strict,
    };
    localStorage.setItem(LS_CFG, JSON.stringify(safe));
    return safe;
  }

  function readHistory() {
    return safeParse(localStorage.getItem(LS_KEY), []) || [];
  }

  function writeHistory(items, keep) {
    const k = Math.max(5, Math.min(200, Number(keep || 40)));
    const arr = Array.isArray(items) ? items.slice(0, k) : [];
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
    return arr;
  }

  function classifyFromDiag(summary, strict) {
    // summary = { pass, failCount, total, flat, ... }
    // WARNs são pass=true mas details começa com "WARN:"
    const flat = summary?.flat || [];
    const warns = flat.filter(x => x?.pass === true && String(x?.details || "").startsWith("WARN:"));
    const fails = flat.filter(x => x?.pass === false);

    if (fails.length) return { level: "FAIL", fails: fails.length, warns: warns.length };
    if (strict && warns.length) return { level: "FAIL", fails: 0, warns: warns.length, note: "strict=on" };
    if (warns.length) return { level: "WARN", fails: 0, warns: warns.length };
    return { level: "PASS", fails: 0, warns: 0 };
  }

  async function runDiagnostics() {
    const D = window.RCF_DIAGNOSTICS;

    if (!D || typeof D.runStabilityCheck !== "function") {
      return {
        ok: false,
        error: "RCF_DIAGNOSTICS.runStabilityCheck ausente",
      };
    }

    try {
      // garante install (se existir)
      try { if (typeof D.installAll === "function") D.installAll(); } catch {}

      const r = await D.runStabilityCheck();
      return {
        ok: true,
        summary: r?.summary || null,
        text: r?.text || "",
        raw: r || null
      };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  async function runMicrotests() {
    const D = window.RCF_DIAGNOSTICS;
    if (!D || typeof D.runMicroTests !== "function") {
      return { ok: true, note: "microtests ausente (ok)" };
    }
    try {
      const items = D.runMicroTests();
      // itens no padrão {pass:true/false}
      const fails = (items || []).filter(x => x && x.pass === false);
      return { ok: fails.length === 0, total: (items || []).length, failCount: fails.length, items: items || [] };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  async function runOnce(meta) {
    const cfg = loadCfg();
    if (!cfg.enabled) {
      return { ok: false, disabled: true, msg: "pipeline disabled (enabled=false)" };
    }

    const startedAt = nowISO();

    const diag = await runDiagnostics();
    const micro = await runMicrotests();

    let level = "FAIL";
    let stats = { fails: 0, warns: 0 };

    if (diag.ok && diag.summary) {
      const c = classifyFromDiag(diag.summary, cfg.strict);
      level = c.level;
      stats = { fails: c.fails || 0, warns: c.warns || 0 };
      // microtests FAIL sempre derruba
      if (micro && micro.ok === false) level = "FAIL";
    } else {
      level = "FAIL";
    }

    const report = {
      id: "pl_" + Math.random().toString(16).slice(2) + "_" + Date.now(),
      ts: startedAt,
      level,
      cfg: { ...cfg },
      meta: meta || {},
      diagnostics: diag,
      microtests: micro,
      note: "NÃO aplica patch automaticamente. Apenas valida e registra.",
    };

    // salva histórico
    const hist = readHistory();
    hist.unshift(report);
    writeHistory(hist, cfg.keep);

    log(level === "PASS" ? "ok" : (level === "WARN" ? "warn" : "err"), `pipeline: ${level}`, { fails: stats.fails, warns: stats.warns });

    return { ok: true, level, report };
  }

  function status() {
    const cfg = loadCfg();
    const hist = readHistory();
    return {
      ok: true,
      enabled: cfg.enabled,
      strict: cfg.strict,
      keep: cfg.keep,
      historyCount: hist.length,
      last: hist[0] ? { ts: hist[0].ts, level: hist[0].level, id: hist[0].id } : null
    };
  }

  function history(n = 10) {
    const hist = readHistory();
    const k = Math.max(1, Math.min(50, Number(n || 10)));
    return hist.slice(0, k);
  }

  function clearHistory() {
    writeHistory([], loadCfg().keep);
    return { ok: true, cleared: true };
  }

  // expõe API
  window.RCF_PIPELINE = {
    __v01a: true,
    loadCfg,
    saveCfg,
    status,
    history,
    clearHistory,
    runOnce,
  };

  log("ok", "pipeline_engine.js loaded ✅ (v0.1a)");
})();

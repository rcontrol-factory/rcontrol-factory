/* RCF — /app/js/core/diagnostics.js (V7 STABILITY CHECK) — PATCH MIN
   - Mantém V7, mas torna o check determinístico (8/8 sempre)
   - FIX: SW scope './' -> getRegistration() sem arg + fallback './' + '/'
   - Remove checks dependentes de view (botões/tabs) que geravam FAIL intermitente
   - Gate: window.RCF_STABLE + #statusText + escreve em #diagOut
*/

(() => {
  "use strict";

  // evita carregar duas vezes
  if (window.RCF_DIAGNOSTICS && window.RCF_DIAGNOSTICS.__v7) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const now = () => new Date().toISOString();

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF_DIAG]", level, msg); } catch {}
  }

  function ok(name, details = "") {
    return { name, pass: true, details, ts: now() };
  }
  function fail(name, details = "") {
    return { name, pass: false, details, ts: now() };
  }

  function setStatusStable(isStable) {
    window.RCF_STABLE = !!isStable;
    try {
      const pill = document.getElementById("statusText");
      if (pill) pill.textContent = isStable ? "STABLE ✅" : "UNSTABLE ❌";
    } catch {}
  }

  // -------------------------------------------------
  // CHECKS (EXATAMENTE 8 ITENS)
  // -------------------------------------------------

  // 1) BOOT LOCK (não pode falhar por view; se faltar, falha)
  function checkBootLock() {
    if (window.__RCF_BOOTED__) return ok("BOOT_LOCK", `__RCF_BOOTED__=${window.__RCF_BOOTED__}`);
    return fail("BOOT_LOCK", "__RCF_BOOTED__ ausente (safeInit lock faltando)");
  }

  // 2) EMERGENCY UI (se detectada: FAIL real)
  function checkEmergencyUI() {
    const has = !!(document.getElementById("rcfReloadBtn") || document.getElementById("rcfClearLogsBtn"));
    if (has) return fail("EMERGENCY_UI", "Tela de emergência detectada (fallback ativo)");
    return ok("EMERGENCY_UI", "ok");
  }

  // 3) CSS TOKEN
  function checkCSSToken() {
    try {
      const root = document.getElementById("rcfRoot") || document.documentElement;
      const token = getComputedStyle(root).getPropertyValue("--rcf-css-token").trim().replace(/['"]/g, "");
      if (token === "rcf-v7") return ok("CSS_TOKEN", token);
      return fail("CSS_TOKEN", `token inválido: "${token || "(vazio)"}" (styles.css sem --rcf-css-token?)`);
    } catch (e) {
      return fail("CSS_TOKEN", e?.message || String(e));
    }
  }

  // 4) UI SHELL (topbar deve existir quando app carregou)
  function checkUIShell() {
    try {
      const topbar = document.querySelector(".topbar");
      if (topbar) return ok("UI_SHELL", "topbar ok");
      return fail("UI_SHELL", "topbar não encontrado (renderShell falhou?)");
    } catch (e) {
      return fail("UI_SHELL", e?.message || String(e));
    }
  }

  // 5) CORE MODULES (não depende de view)
  function checkCoreModules() {
    const hasLogger = !!window.RCF_LOGGER;
    const hasStorage = !!window.RCF_STORAGE;
    const hasVFS = !!(window.RCF_VFS_OVERRIDES || window.RCF_VFS);

    const missing = [];
    if (!hasLogger) missing.push("RCF_LOGGER");
    if (!hasStorage) missing.push("RCF_STORAGE");
    if (!hasVFS) missing.push("RCF_VFS_OVERRIDES/RCF_VFS");

    if (missing.length) return fail("CORE_MODULES", "missing: " + missing.join(", "));
    return ok("CORE_MODULES", "ok");
  }

  // 6) SW REGISTERED (robusto para scope './')
  async function checkSWRegistered() {
    try {
      if (!("serviceWorker" in navigator)) return fail("SW_REGISTERED", "serviceWorker não suportado");

      // principal: sem argumento (mais compatível com scope real)
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.getRegistration("./");
      if (!reg) reg = await navigator.serviceWorker.getRegistration("/");

      if (!reg) return fail("SW_REGISTERED", "Sem SW registrado (getRegistration retornou null)");
      return ok("SW_REGISTERED", `scope=${reg.scope || "(unknown)"}`);
    } catch (e) {
      return fail("SW_REGISTERED", e?.message || String(e));
    }
  }

  // 7) SW CACHE KEYS (não falha se caches API indisponível; só falha se der erro real)
  async function checkSWCacheKeys() {
    try {
      if (!("caches" in window)) return ok("SW_CACHE_KEYS", "Cache API indisponível (ok)");
      const keys = await caches.keys();
      return ok("SW_CACHE_KEYS", `keys=${keys.length}`);
    } catch (e) {
      return fail("SW_CACHE_KEYS", e?.message || String(e));
    }
  }

  // 8) MICROTESTS CORE (sem depender de view)
  function checkMicroCore() {
    try {
      const root = document.getElementById("rcfRoot");
      if (!root) return fail("MICRO_CORE", "rcfRoot ausente");

      // state básico (não exige tabs/btns)
      const st = window.RCF?.state;
      const okState = !!(st && st.cfg && Array.isArray(st.apps));
      if (!okState) return fail("MICRO_CORE", "window.RCF.state inválido");

      return ok("MICRO_CORE", "ok");
    } catch (e) {
      return fail("MICRO_CORE", e?.message || String(e));
    }
  }

  // -------------------------------------------------
  // REPORT
  // -------------------------------------------------
  function summarize(items) {
    const fails = items.filter(x => !x.pass);
    return {
      pass: fails.length === 0,
      passCount: items.length - fails.length,
      failCount: fails.length,
      total: items.length,
      fails,
      items
    };
  }

  function formatReport(sum) {
    const lines = [];
    lines.push("=========================================================");
    lines.push("RCF — V7 STABILITY CHECK (REPORT)");
    lines.push("=========================================================");
    lines.push(`PASS: ${sum.passCount}/${sum.total} | FAIL: ${sum.failCount}`);
    lines.push(`RCF_STABLE: ${sum.pass ? "TRUE ✅" : "FALSE ❌"}`);
    lines.push("");

    if (sum.failCount) {
      lines.push("FAIL LIST:");
      sum.fails.forEach((f) => {
        lines.push(`- ${f.name}: ${String(f.details || "").slice(0, 350)}`);
      });
      lines.push("");
      lines.push("AÇÃO:");
      lines.push("- bloquear evolução");
      lines.push("- exibir relatório");
    } else {
      lines.push("OK: Todos os checks passaram.");
    }

    lines.push("=========================================================");
    return lines.join("\n");
  }

  async function runStabilityCheck() {
    // exatamente 8 itens
    const items = [];
    items.push(checkBootLock());       // 1
    items.push(checkEmergencyUI());    // 2
    items.push(checkCSSToken());       // 3
    items.push(checkUIShell());        // 4
    items.push(checkCoreModules());    // 5
    items.push(await checkSWRegistered()); // 6
    items.push(await checkSWCacheKeys());  // 7
    items.push(checkMicroCore());      // 8

    const sum = summarize(items);
    const text = formatReport(sum);

    try {
      const out = document.getElementById("diagOut");
      if (out) out.textContent = text;
    } catch {}

    // log único
    log(sum.pass ? "ok" : "err", `V7 check: ${sum.pass ? "PASS ✅" : "FAIL ❌"} ${sum.passCount}/${sum.total}`);

    setStatusStable(sum.pass);

    return { summary: sum, items, text };
  }

  function installAll() {
    // contagem simples
    window.RCF_DIAGNOSTICS._installCount = (window.RCF_DIAGNOSTICS._installCount || 0) + 1;
    try { window.RCF_DIAGNOSTICS._guardsInstalled = true; } catch {}
    log("ok", "Diagnostics: installAll ✅");
    return true;
  }

  // API
  window.RCF_DIAGNOSTICS = {
    __v7: true,
    _installCount: 0,
    installAll,
    runStabilityCheck,
  };

  log("ok", "core/diagnostics.js ready ✅");
})();

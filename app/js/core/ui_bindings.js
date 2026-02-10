/* =========================================================
  RControl Factory — core/ui_bindings.js (BASE v1.3)
  - NÃO conflita com app.js (Agent/Admin já são bindados lá)
  - Liga apenas: DIAG view + LOGS view + Tools Drawer logs
  - iOS-safe: click + touchend (anti double fire)
  - Fonte dos logs: localStorage "rcf:logs" (mesmo do app.js)
========================================================= */

(function () {
  "use strict";

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function safeText(v) { return (v === undefined || v === null) ? "" : String(v); }

  // anti double-fire iOS (touchend + click)
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;
    const handler = async (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { await fn(e); } catch (err) {
        // fallback silencioso
        try { console.log("[RCF ui_bindings]", err); } catch {}
      }
    };
    el.addEventListener("touchend", handler, { passive: false });
    el.addEventListener("click", handler, { passive: false });
  }

  // ---------- LOGS: read/write same storage as app.js ----------
  function readLogsArray() {
    // 1) se existir logger do core, tenta usar
    const L = window.RCF_LOGGER;
    if (L) {
      if (typeof L.getText === "function") return String(L.getText()).split("\n");
      if (typeof L.dump === "function") return String(L.dump()).split("\n");
      if (Array.isArray(L.lines)) return L.lines.map(safeText);
      if (Array.isArray(L.buffer)) return L.buffer.map(safeText);
    }

    // 2) fallback: localStorage do app.js (prefix rcf:)
    try {
      const raw = localStorage.getItem("rcf:logs");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(safeText) : [];
    } catch {
      return [];
    }
  }

  function writeLogsArray(arr) {
    // tenta limpar via logger do core se existir
    const L = window.RCF_LOGGER;
    if (L && typeof L.clear === "function" && (!arr || !arr.length)) {
      try { L.clear(); return; } catch {}
    }

    try {
      localStorage.setItem("rcf:logs", JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {}
  }

  function getLogsText() {
    const lines = readLogsArray();
    return lines.length ? lines.join("\n") : "Logs...";
  }

  function refreshLogsUI() {
    const text = getLogsText();

    // view LOGS (seu HTML usa logsOut)
    const logsOut = $("logsOut") || $("logsViewBox");
    if (logsOut) logsOut.textContent = text;

    // drawer Ferramentas
    const logsBox = $("logsBox");
    if (logsBox) logsBox.textContent = text;
  }

  async function copyLogs() {
    const text = getLogsText();
    try {
      await navigator.clipboard.writeText(text);
      alert("Logs copiados ✅");
    } catch {
      alert("iOS bloqueou copiar. Abra ⚙️ Ferramentas e copie manual.");
    }
  }

  function clearLogs() {
    writeLogsArray([]);
    refreshLogsUI();
  }

  // ---------- DIAG ----------
  async function buildDiagReport() {
    // 1) se tiver diagnostics do core
    const D = window.RCF_DIAGNOSTICS;
    if (D && typeof D.buildReport === "function") return await D.buildReport();
    if (D && typeof D.run === "function") return await D.run();

    // 2) se teu app.js estiver carregado, usa o Admin.diagnostics “nativo”
    // (não está exposto direto, então fazemos um fallback informativo)
    const info = [];
    info.push("RCF DIAGNÓSTICO (fallback) ✅");
    info.push("—");
    try {
      const cfg = (window.RCF && window.RCF.state && window.RCF.state.cfg) ? window.RCF.state.cfg : null;
      const active = (window.RCF && window.RCF.state && window.RCF.state.active) ? window.RCF.state.active : null;
      const apps = (window.RCF && window.RCF.state && Array.isArray(window.RCF.state.apps)) ? window.RCF.state.apps.length : null;

      info.push("cfg: " + (cfg ? JSON.stringify(cfg) : "n/a"));
      info.push("apps: " + (apps !== null ? apps : "n/a"));
      info.push("active: " + (active ? JSON.stringify(active) : "n/a"));
    } catch {}

    info.push("navigator.onLine: " + (typeof navigator !== "undefined" ? navigator.onLine : "n/a"));
    info.push("ua: " + (typeof navigator !== "undefined" ? navigator.userAgent : "n/a"));
    info.push("—");
    info.push("DICA: se LOGS da tela estiver vazio, toque em Atualizar.");
    return info.join("\n");
  }

  function bindDiagView() {
    const out = $("diagOut");
    const btnRun = $("btnDiagRun");
    const btnClear = $("btnDiagClear");

    if (btnRun) {
      bindTap(btnRun, async () => {
        const rep = await buildDiagReport();
        if (out) out.textContent = safeText(rep);
      });
    }

    if (btnClear) {
      bindTap(btnClear, () => {
        if (out) out.textContent = "Pronto.";
      });
    }
  }

  function bindLogsViewAndTools() {
    // LOGS view buttons
    bindTap($("btnLogsRefresh"), () => refreshLogsUI());
    bindTap($("btnLogsCopy"), () => copyLogs());
    bindTap($("btnLogsClear"), () => clearLogs());

    // Tools drawer buttons
    bindTap($("btnCopyLogs"), () => copyLogs());
    bindTap($("btnClearLogs"), () => clearLogs());

    // Quando o usuário navega pra logs, atualiza automaticamente
    document.querySelectorAll('[data-view="logs"]').forEach((el) => {
      bindTap(el, () => setTimeout(refreshLogsUI, 60));
    });

    // primeira carga
    refreshLogsUI();
  }

  function init() {
    // iOS: registra toque sem travar scroll
    document.body.addEventListener("touchstart", () => {}, { passive: true });

    bindDiagView();
    bindLogsViewAndTools();

    // logzinho opcional
    try { console.log("[RCF] ui_bindings BASE v1.3 carregado"); } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* =========================================================
  RControl Factory — core/ui_bindings.js (BASE / NO-CONFLICT)
  - Liga apenas: DIAG + LOGS + Ferramentas (drawer)
  - NÃO faz bind em Agent/Admin (isso já é do app.js)
  - iOS-safe: click + touchend (com tap guard)
  - Fonte de logs: localStorage "rcf:logs" (mesmo do app.js)
========================================================= */

(function () {
  "use strict";

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function safeText(v) { return (v === undefined || v === null) ? "" : String(v); }

  // Evita "duplo fire" (touch + click) no iOS
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;

    // evita bind duplicado
    if (el.__rcfTapBound) return;
    el.__rcfTapBound = true;

    const handler = (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { fn(e); } catch (err) {
        try { console.log("[RCF] tap err:", err); } catch {}
      }
    };

    el.addEventListener("click", handler, { passive: false });
    el.addEventListener("touchend", handler, { passive: false });
  }

  // ---------- LOGS (mesma fonte do app.js) ----------
  function getLogsTextFromLocalStorage() {
    // app.js usa prefix "rcf:" e key "logs" => localStorage["rcf:logs"] = JSON string array
    try {
      const raw = localStorage.getItem("rcf:logs");
      if (!raw) return "";
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(safeText).join("\n");
      return safeText(arr);
    } catch {
      return "";
    }
  }

  function clearLogsLocalStorage() {
    try { localStorage.setItem("rcf:logs", JSON.stringify([])); } catch {}
  }

  // ---------- DIAG (usa Admin.diagnostics do app.js se existir) ----------
  async function buildDiagReport() {
    // app.js define Admin.diagnostics() dentro do closure (não expõe).
    // Então aqui fazemos fallback simples e confiável:
    const info = [];
    info.push("RCF DIAGNÓSTICO");
    info.push("{");
    try {
      const state = (window.RCF && window.RCF.state) ? window.RCF.state : null;
      if (state) {
        info.push('  "cfg": ' + JSON.stringify(state.cfg || {}, null, 2).split("\n").join("\n  "));
        info.push('  , "apps": ' + safeText((state.apps || []).length));
        info.push('  , "active": ' + JSON.stringify(state.active?.appSlug || "_"));
        info.push('  , "file": ' + JSON.stringify(state.active?.file || "_"));
        info.push('  , "view": ' + JSON.stringify(state.active?.view || "_"));
      } else {
        info.push('  "state": "window.RCF.state não disponível"');
      }
    } catch {
      info.push('  "state": "erro ao ler state"');
    }
    info.push('  , "ua": ' + JSON.stringify(navigator.userAgent));
    info.push('  , "hint": "Se botão não clica: provável overlay com pointer-events. Veja logs e teste Diag."');
    info.push("}");
    return info.join("\n");
  }

  // ---------- bindings ----------
  function bindDiagnosticsView() {
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
    // IDs reais do seu index.html:
    const logsViewBox = $("logsOut");  // ✅ view logs
    const toolsLogsBox = $("logsBox"); // ✅ drawer ferramentas

    const btnRefresh = $("btnLogsRefresh");
    const btnCopy = $("btnLogsCopy");
    const btnClear = $("btnLogsClear");

    // tools drawer
    const btnClearLogs = $("btnClearLogs");
    const btnCopyLogs = $("btnCopyLogs");

    const refresh = () => {
      const text = getLogsTextFromLocalStorage() || "Logs...";
      if (logsViewBox) logsViewBox.textContent = text;
      if (toolsLogsBox) toolsLogsBox.textContent = text;
    };

    const copy = async () => {
      const text = getLogsTextFromLocalStorage() || "";
      try {
        await navigator.clipboard.writeText(text);
        alert("Logs copiados ✅");
      } catch {
        alert("iOS bloqueou copiar. Abra Ferramentas (⚙️) e copie manual.");
      }
    };

    const clear = () => {
      clearLogsLocalStorage();
      refresh();
    };

    if (btnRefresh) bindTap(btnRefresh, refresh);
    if (btnCopy) bindTap(btnCopy, copy);
    if (btnClear) bindTap(btnClear, clear);

    if (btnClearLogs) bindTap(btnClearLogs, clear);
    if (btnCopyLogs) bindTap(btnCopyLogs, copy);

    // inicial
    refresh();
  }

  function init() {
    // iOS: garante que a página registra toque (sem travar scroll)
    document.body.addEventListener("touchstart", () => {}, { passive: true });

    bindDiagnosticsView();
    bindLogsViewAndTools();

    try { console.log("[RCF] ui_bindings base loaded ✅"); } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

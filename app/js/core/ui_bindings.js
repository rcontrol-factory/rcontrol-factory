/* =========================================================
  RControl Factory — core/ui_bindings.js (v1.1 / LOGS FIX)
  - Foco: DIAG + LOGS + Ferramentas (drawer)
  - iOS-safe: click + touchend (tap guard)
  - LOGS: tenta 3 fontes (localStorage rcf:logs, RCF_LOGGER, fallback DOM)
========================================================= */

(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function safeText(v) { return (v === undefined || v === null) ? "" : String(v); }

  // Evita double fire (touch+click)
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;
    if (el.__rcfTapBound) return; // evita bind duplicado
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

  // ---------- LOG SOURCES ----------
  function getLogsFromLocalStorage() {
    // app.js: localStorage["rcf:logs"] = JSON.stringify(array)
    try {
      const raw = localStorage.getItem("rcf:logs");
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(safeText).join("\n");
      return safeText(parsed);
    } catch {
      return "";
    }
  }

  function getLogsFromRCFLogger() {
    const L = window.RCF_LOGGER;
    if (!L) return "";
    try {
      if (typeof L.getText === "function") return safeText(L.getText());
      if (typeof L.dump === "function") return safeText(L.dump());
      if (Array.isArray(L.lines)) return L.lines.map(safeText).join("\n");
      if (Array.isArray(L.buffer)) return L.buffer.map(safeText).join("\n");
      return "";
    } catch {
      return "";
    }
  }

  function clearLogs() {
    // limpa o mesmo lugar do app.js
    try { localStorage.setItem("rcf:logs", JSON.stringify([])); } catch {}
    // se existir logger separado, limpa também
    try {
      const L = window.RCF_LOGGER;
      if (L && typeof L.clear === "function") L.clear();
      if (L && Array.isArray(L.lines)) L.lines.length = 0;
      if (L && Array.isArray(L.buffer)) L.buffer.length = 0;
    } catch {}
  }

  function setStatus(text) {
    const el = $("statusText");
    if (el) el.textContent = safeText(text);
  }

  // ---------- DIAG ----------
  async function buildDiagReport() {
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

  // ---------- BINDINGS ----------
  function bindDiagnosticsView() {
    const out = $("diagOut");
    const btnRun = $("btnDiagRun");
    const btnClear = $("btnDiagClear");

    if (btnRun) {
      bindTap(btnRun, async () => {
        const rep = await buildDiagReport();
        if (out) out.textContent = safeText(rep);
        setStatus("Diag atualizado ✅");
        setTimeout(() => setStatus("OK ✅"), 900);
      });
    }

    if (btnClear) {
      bindTap(btnClear, () => {
        if (out) out.textContent = "Pronto.";
        setStatus("OK ✅");
      });
    }
  }

  function bindLogsViewAndTools() {
    // IDs reais do seu index.html:
    const logsViewBox = $("logsOut");  // <pre id="logsOut">
    const toolsLogsBox = $("logsBox"); // <pre id="logsBox">

    const btnRefresh = $("btnLogsRefresh");
    const btnCopy = $("btnLogsCopy");
    const btnClear = $("btnLogsClear");

    // tools drawer
    const btnClearLogs = $("btnClearLogs");
    const btnCopyLogs = $("btnCopyLogs");

    function resolveLogsText() {
      // 1) localStorage (fonte do app.js)
      let t = getLogsFromLocalStorage();
      if (t && t.trim()) return t;

      // 2) RCF_LOGGER (se houver)
      t = getLogsFromRCFLogger();
      if (t && t.trim()) return t;

      // 3) fallback DOM (se drawer já tiver algo)
      t = toolsLogsBox ? safeText(toolsLogsBox.textContent) : "";
      if (t && t.trim() && t.trim() !== "Logs...") return t;

      return "";
    }

    const refresh = () => {
      const text = resolveLogsText();
      const finalText = (text && text.trim()) ? text : "(sem logs ainda)";

      if (logsViewBox) logsViewBox.textContent = finalText;
      if (toolsLogsBox) toolsLogsBox.textContent = finalText;

      setStatus("Logs atualizados ✅");
      setTimeout(() => setStatus("OK ✅"), 900);
    };

    const copy = async () => {
      const text = resolveLogsText() || "";
      try {
        await navigator.clipboard.writeText(text);
        alert("Logs copiados ✅");
      } catch {
        alert("iOS bloqueou copiar. Abra Ferramentas (⚙️) e copie manual.");
      }
    };

    const clear = () => {
      clearLogs();
      refresh();
    };

    if (btnRefresh) bindTap(btnRefresh, refresh);
    if (btnCopy) bindTap(btnCopy, copy);
    if (btnClear) bindTap(btnClear, clear);

    if (btnClearLogs) bindTap(btnClearLogs, clear);
    if (btnCopyLogs) bindTap(btnCopyLogs, copy);

    // primeira carga
    refresh();
  }

  function init() {
    document.body.addEventListener("touchstart", () => {}, { passive: true });
    bindDiagnosticsView();
    bindLogsViewAndTools();
    try { console.log("[RCF] ui_bindings v1.1 loaded ✅"); } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

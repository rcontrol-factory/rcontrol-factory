/* =========================================================
  RControl Factory — core/ui_bindings.js (LOGS FIX v1.2.1+) — PATCH DIAG v1.2.2
  - Liga UI (Agent/Admin/Diag/Logs/Tools) ao core
  - iOS-safe: click + touchend (evita double fire)
  - Logs: lê de múltiplas fontes + múltiplas keys no localStorage
  - Logs: escreve no elemento certo (pre/textarea) mesmo se ID variar
  - DIAG: chama installAll() + runStabilityCheck() automaticamente (evita FAIL falso)
  - ✅ Compat com core/commands.js (window.CoreCommands/RCFCommands/Commands.exec)
  - ✅ Compat com pipeline de patch (Patchset/Patch/App)
========================================================= */

(function () {
  "use strict";

  if (window.__RCF_UI_BINDINGS_V122) return;
  window.__RCF_UI_BINDINGS_V122 = true;

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function safeText(v) {
    return (v === undefined || v === null) ? "" : String(v);
  }

  function setBoxText(el, text) {
    if (!el) return;
    const t = safeText(text);
    const tag = (el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "INPUT") el.value = t;
    else el.textContent = t;
  }

  // Top status (se existir)
  function setTopStatus(msg) {
    const el = $("statusText") || $("rcfStatusText") || document.querySelector("[data-rcf-status]");
    if (el) el.textContent = safeText(msg);
  }

  // Evita "duplo clique" (touch + click) no iOS
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
      try { await fn(e); } catch {}
    };

    // capture=true ajuda em overlays
    el.addEventListener("click", handler, { passive: false, capture: true });
    el.addEventListener("touchend", handler, { passive: false, capture: true });

    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
    } catch {}
  }

  function loggerPush(level, msg) {
    const L = window.RCF_LOGGER;
    if (L && typeof L.push === "function") {
      try { L.push(level || "log", msg); } catch {}
    } else {
      try { console.log("[RCF]", msg); } catch {}
    }
  }

  // ---------- commands bridge (PADRÃO REAL) ----------
  function getCommandsAPI() {
    // core/commands.js expõe exec()
    const c1 = window.CoreCommands;
    const c2 = window.RCFCommands;
    const c3 = window.Commands;
    const api = c1 || c2 || c3 || null;
    if (api && typeof api.exec === "function") return api;
    return null;
  }

  function runCommand(cmd, outEl) {
    const api = getCommandsAPI();
    let res = "";

    if (!api) {
      res = "ERRO: core/commands.js não carregou (CoreCommands/RCFCommands/Commands.exec não existe).";
    } else {
      try {
        const r = api.exec(String(cmd || ""));
        // r é {ok,out}
        res = (r && typeof r === "object") ? (r.out ?? JSON.stringify(r, null, 2)) : String(r ?? "");
      } catch (err) {
        res = "ERRO ao executar comando: " + (err && err.message ? err.message : String(err));
      }
    }

    if (outEl) setBoxText(outEl, res);
    return res;
  }

  // ---------- patch pipeline (compat com commands.js) ----------
  function patchApplyAll(outEl) {
    let rep = "";

    try {
      if (window.Patchset && typeof window.Patchset.apply === "function") {
        const r = window.Patchset.apply();
        rep = (r && typeof r === "object") ? (r.out || "OK ✅") : (r || "OK ✅");
      } else if (window.Patch && typeof window.Patch.apply === "function") {
        const r = window.Patch.apply();
        rep = (r && typeof r === "object") ? (r.out || "OK ✅") : (r || "OK ✅");
      } else if (window.App && typeof window.App.applyPatch === "function") {
        const r = window.App.applyPatch();
        rep = (r && typeof r === "object") ? (r.out || "OK ✅") : (r || "OK ✅");
      } else {
        rep = "Patch pipeline não disponível (Patchset/Patch/App.applyPatch).";
      }
    } catch (e) {
      rep = "ERRO apply: " + safeText(e && e.message ? e.message : e);
    }

    if (outEl) setBoxText(outEl, rep);
    return rep;
  }

  function patchClear(outEl) {
    let rep = "";
    try {
      if (window.Patchset && typeof window.Patchset.clear === "function") {
        window.Patchset.clear(); rep = "Patches descartados ✅";
      } else if (window.Patch && typeof window.Patch.clear === "function") {
        window.Patch.clear(); rep = "Patches descartados ✅";
      } else if (window.App && typeof window.App.discardPatch === "function") {
        window.App.discardPatch(); rep = "Patches descartados ✅";
      } else {
        // fallback: remove pending patch em memória
        try { window.__RCF_PENDING_PATCH = null; } catch {}
        rep = "Patch pipeline não disponível (clear). Pendente limpo (fallback).";
      }
    } catch (e) {
      rep = "ERRO discard: " + safeText(e && e.message ? e.message : e);
    }

    if (outEl) setBoxText(outEl, rep);
    return rep;
  }

  // ---------- logger integration ----------
  function tryReadLS(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return "";
      if (raw[0] === "[" || raw[0] === "{") {
        try {
          const v = JSON.parse(raw);
          if (Array.isArray(v)) return v.map(safeText).join("\n");
          if (typeof v === "string") return v;
          return raw;
        } catch {
          return raw;
        }
      }
      return raw;
    } catch {
      return "";
    }
  }

  function readLogsFromLocalStorageFallback() {
    // chaves reais do teu projeto + compat
    const keys = [
      "rcf:logs",
      "rcf:logs:extra",
      "rcf:fatal:last",
      "logs",
      "factory:logs",
      "RCF_LOGS",
      "rcontrol:logs"
    ];

    let best = "";
    for (const k of keys) {
      const t = tryReadLS(k);
      if (t && t.length > best.length) best = t;
    }
    return best;
  }

  function loggerGetText() {
    const L = window.RCF_LOGGER;

    if (L) {
      if (typeof L.getText === "function") return safeText(L.getText());
      if (typeof L.dump === "function") return safeText(L.dump());
      if (Array.isArray(L.lines)) return L.lines.map(safeText).join("\n");
      if (Array.isArray(L.buffer)) return L.buffer.map(safeText).join("\n");
    }

    return readLogsFromLocalStorageFallback();
  }

  function loggerClear() {
    const L = window.RCF_LOGGER;
    if (L) {
      if (typeof L.clear === "function") { try { L.clear(); } catch {} }
      if (Array.isArray(L.lines)) L.lines.length = 0;
      if (Array.isArray(L.buffer)) L.buffer.length = 0;
    }

    // limpa chaves principais
    try { localStorage.setItem("rcf:logs", JSON.stringify([])); } catch {}
    try { localStorage.setItem("rcf:logs:extra", JSON.stringify([])); } catch {}
    try { localStorage.removeItem("rcf:fatal:last"); } catch {}
    try { localStorage.setItem("logs", JSON.stringify([])); } catch {}
    try { localStorage.setItem("factory:logs", JSON.stringify([])); } catch {}
  }

  // ---------- DIAG report ----------
  async function runStabilityAndGetText() {
    const D = window.RCF_DIAGNOSTICS;

    if (D && typeof D.installAll === "function" && typeof D.runStabilityCheck === "function") {
      try { D.installAll(); } catch {}
      try {
        const r = await D.runStabilityCheck();
        return safeText(r && (r.text || r.reportText || r.summaryText || "")) || "(sem texto do relatório)";
      } catch (e) {
        return "ERRO: runStabilityCheck falhou: " + safeText(e && e.message ? e.message : e);
      }
    }

    if (D && typeof D.run === "function") {
      try {
        const r = await D.run();
        return (typeof r === "string") ? r : JSON.stringify(r, null, 2);
      } catch (e) {
        return "ERRO: diag.run falhou: " + safeText(e && e.message ? e.message : e);
      }
    }

    // fallback simples
    const info = [];
    info.push("DIAG (fallback) ✅");
    info.push("—");
    info.push("RCF_DIAGNOSTICS: " + (!!window.RCF_DIAGNOSTICS));
    info.push("CoreCommands: " + (!!getCommandsAPI()));
    info.push("Patchset/Patch/App: " + (!!window.Patchset || !!window.Patch || !!window.App));
    info.push("RCF_LOGGER: " + (!!window.RCF_LOGGER));
    const t = loggerGetText();
    info.push("loggerGetText(): " + (t && t.trim().length ? ("OK (" + t.length + " chars)") : "VAZIO"));
    info.push("navigator.onLine: " + (typeof navigator !== "undefined" ? navigator.onLine : "n/a"));
    info.push("ua: " + (typeof navigator !== "undefined" ? navigator.userAgent : "n/a"));
    return info.join("\n");
  }

  async function buildDiagReport() {
    return await runStabilityAndGetText();
  }

  // ---------- bindings ----------
  function bindAgent() {
    const input = $("agentCmd");
    const out = $("agentOut");
    const btnRun = $("btnAgentRun");
    const btnClear = $("btnAgentClear");
    const btnApprove = $("btnAgentApprove");
    const btnDiscard = $("btnAgentDiscard");

    if (btnRun && input) bindTap(btnRun, () => runCommand(input.value, out));

    if (btnClear && input) {
      bindTap(btnClear, () => {
        input.value = "";
        if (out) setBoxText(out, "Limpo.");
      });
    }

    if (btnApprove) bindTap(btnApprove, () => patchApplyAll(out));
    if (btnDiscard) bindTap(btnDiscard, () => patchClear(out));

    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          runCommand(input.value, out);
        }
      });
    }
  }

  function bindAdmin() {
    const out = $("adminOut");
    const btnDiag = $("btnAdminDiag");
    const btnClear = $("btnAdminClear");
    const btnApply = $("btnAdminApply");
    const btnDiscard = $("btnAdminDiscard");

    if (btnDiag) {
      bindTap(btnDiag, async () => {
        const rep = await buildDiagReport();
        if (out) setBoxText(out, rep);
      });
    }

    if (btnClear) bindTap(btnClear, () => { if (out) setBoxText(out, "Limpo."); });
    if (btnApply) bindTap(btnApply, () => patchApplyAll(out));
    if (btnDiscard) bindTap(btnDiscard, () => patchClear(out));
  }

  function bindDiagnosticsView() {
    const out = $("diagOut");
    const btnRun = $("btnDiagRun");
    const btnClear = $("btnDiagClear");

    const run = async () => {
      setTopStatus("Diagnostics: rodando...");
      const rep = await buildDiagReport();
      if (out) setBoxText(out, rep);
      setTopStatus("Diagnostics: pronto ✅");
      setTimeout(() => setTopStatus("OK ✅"), 900);
    };

    if (btnRun) bindTap(btnRun, run);

    if (btnClear) bindTap(btnClear, () => {
      if (out) setBoxText(out, "Pronto.");
      setTopStatus("OK ✅");
    });

    // ✅ auto-run quando a VIEW diagnostics ficar ativa (não confundir com tab)
    let ranOnce = false;
    const obs = new MutationObserver(() => {
      try {
        const view =
          document.getElementById("view-diagnostics") ||
          document.querySelector('.view[data-view="diagnostics"]') ||
          document.querySelector('.view[data-view="diag"]') ||
          null;

        const active = view && (view.classList.contains("active") || view.style.display === "block");
        if (active && !ranOnce) {
          ranOnce = true;
          setTimeout(run, 60);
        }
      } catch {}
    });
    try { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true }); } catch {}
  }

  function bindLogsViewAndTools() {
    const logsViewBox =
      $("logsOut") ||
      $("logsViewBox") ||
      $("logsView") ||
      $("logsPre") ||
      $("logsArea");

    const toolsLogsBox =
      $("logsBox") ||
      $("toolsLogsBox") ||
      $("drawerLogsBox");

    const btnRefresh = $("btnLogsRefresh");
    const btnCopy = $("btnLogsCopy");
    const btnClear = $("btnLogsClear");

    const btnClearLogs = $("btnClearLogs");
    const btnCopyLogs = $("btnCopyLogs");

    const refresh = () => {
      const text = loggerGetText();
      const out = (text && text.trim().length) ? text : "(sem logs ainda)";
      setBoxText(logsViewBox, out);
      setBoxText(toolsLogsBox, out);

      setTopStatus("Logs atualizados ✅");
      setTimeout(() => setTopStatus("OK ✅"), 900);
    };

    const copy = async () => {
      const text = loggerGetText() || "";
      try {
        await navigator.clipboard.writeText(text);
        setTopStatus("Logs copiados ✅");
        setTimeout(() => setTopStatus("OK ✅"), 900);
      } catch {
        alert("iOS bloqueou copiar. Selecione e copie manual.");
      }
    };

    const clear = () => {
      loggerClear();
      refresh();
    };

    if (btnRefresh) bindTap(btnRefresh, refresh);
    if (btnCopy) bindTap(btnCopy, copy);
    if (btnClear) bindTap(btnClear, clear);

    if (btnClearLogs) bindTap(btnClearLogs, clear);
    if (btnCopyLogs) bindTap(btnCopyLogs, copy);

    // auto refresh ao abrir a view logs (via view.active)
    let ranOnce = false;
    const obs = new MutationObserver(() => {
      try {
        const view =
          document.getElementById("view-logs") ||
          document.querySelector('.view[data-view="logs"]') ||
          null;

        const active = view && (view.classList.contains("active") || view.style.display === "block");
        if (active && !ranOnce) {
          ranOnce = true;
          setTimeout(refresh, 50);
        }
      } catch {}
    });
    try { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true }); } catch {}

    refresh();
  }

  function init() {
    // iOS fix: garante gesto "ativou" touch pipeline
    try { document.body.addEventListener("touchstart", () => {}, { passive: true }); } catch {}

    bindAgent();
    bindAdmin();
    bindDiagnosticsView();
    bindLogsViewAndTools();

    loggerPush("log", "core/ui_bindings.js carregado ✅ (LOGS FIX v1.2.2 + DIAG AUTOINSTALL + COMMANDS/PATCH PIPELINE COMPAT)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

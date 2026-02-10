/* =========================================================
  RControl Factory — core/ui_bindings.js (FULL / BASE FIX)
  - Liga UI (Agent/Admin/Diag/Logs/Tools) ao core
  - iOS-safe tap guard (touchend + click)
  - LOGS FIX:
      -> escreve em #logsOut (tela Logs) e #logsBox (drawer)
      -> se RCF_LOGGER não existir, lê direto localStorage rcf:logs
========================================================= */

(function () {
  "use strict";

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  function safeText(v) {
    return (v === undefined || v === null) ? "" : String(v);
  }

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  // Evita "duplo clique" (touch + click) no iOS
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;

    const handler = (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { fn(e); } catch (err) { try { console.log("[RCF] tap err", err); } catch {} }
    };

    el.addEventListener("click", handler, { passive: false });
    el.addEventListener("touchend", handler, { passive: false });
  }

  // ---------- context / commands ----------
  function getCtx() {
    return window.RCF_STATE || (window.RCF_STATE = {
      autoMode: false,
      safeMode: true,
      currentFile: "index.html"
    });
  }

  function runCommand(cmd, outEl) {
    const ctx = getCtx();
    const handler = window.RCF_COMMANDS && typeof window.RCF_COMMANDS.handle === "function"
      ? window.RCF_COMMANDS.handle
      : null;

    let res = "";
    if (!handler) {
      res = "ERRO: core/commands.js não carregou (RCF_COMMANDS.handle não existe).";
    } else {
      try {
        res = handler(String(cmd || "").trim(), ctx);
      } catch (err) {
        res = "ERRO ao executar comando: " + (err && err.message ? err.message : String(err));
      }
    }

    if (outEl) outEl.textContent = safeText(res);
    return res;
  }

  // ---------- Logger (pega de onde tiver) ----------
  function getLogsText() {
    // 1) Preferir logger oficial
    const L = window.RCF_LOGGER;
    if (L) {
      if (typeof L.getText === "function") return safeText(L.getText());
      if (typeof L.dump === "function") return safeText(L.dump());
      if (Array.isArray(L.lines)) return L.lines.map(safeText).join("\n");
      if (Array.isArray(L.buffer)) return L.buffer.map(safeText).join("\n");
    }

    // 2) Fallback: o app.js grava em localStorage "rcf:logs" como JSON array
    try {
      const raw = localStorage.getItem("rcf:logs");
      const arr = safeJsonParse(raw, []);
      if (Array.isArray(arr)) return arr.map(safeText).join("\n");
      if (typeof raw === "string") return raw;
    } catch {}

    return "";
  }

  function clearLogsEverywhere() {
    // limpa logger se existir
    const L = window.RCF_LOGGER;
    if (L && typeof L.clear === "function") {
      try { L.clear(); } catch {}
    }

    // limpa fallback do app.js
    try { localStorage.setItem("rcf:logs", JSON.stringify([])); } catch {}
  }

  function loggerPush(level, msg) {
    const L = window.RCF_LOGGER;
    if (L && typeof L.push === "function") {
      try { L.push(level || "log", msg); } catch {}
    } else {
      try { console.log("[RCF]", msg); } catch {}
    }
  }

  // ---------- Patchset integration ----------
  function patchApplyAll(outEl) {
    const P = window.RCF_PATCHSET;
    let rep = "";
    if (P && typeof P.applyAll === "function") {
      try { rep = P.applyAll(); }
      catch (e) { rep = "ERRO applyAll: " + safeText(e && e.message ? e.message : e); }
    } else {
      rep = "Patchset não disponível (RCF_PATCHSET.applyAll não existe).";
    }
    if (outEl) outEl.textContent = safeText(rep || "OK ✅");
    return rep;
  }

  function patchClear(outEl) {
    const P = window.RCF_PATCHSET;
    let rep = "";
    if (P && typeof P.clear === "function") {
      try { P.clear(); rep = "Patches descartados ✅"; }
      catch (e) { rep = "ERRO clear: " + safeText(e && e.message ? e.message : e); }
    } else {
      rep = "Patchset não disponível (RCF_PATCHSET.clear não existe).";
    }
    if (outEl) outEl.textContent = safeText(rep);
    return rep;
  }

  // ---------- DIAG report ----------
  async function buildDiagReport() {
    const D = window.RCF_DIAGNOSTICS;
    if (D && typeof D.buildReport === "function") return await D.buildReport();
    if (D && typeof D.run === "function") return await D.run();

    const F = window.RCF && window.RCF.factory;
    if (F && typeof F.buildDiagnosisReport === "function") return await F.buildDiagnosisReport();

    const info = [];
    info.push("DIAG (fallback) ✅");
    info.push("—");
    info.push("RCF_COMMANDS: " + (!!window.RCF_COMMANDS));
    info.push("RCF_PATCHSET: " + (!!window.RCF_PATCHSET));
    info.push("RCF_LOGGER: " + (!!window.RCF_LOGGER));
    info.push("localStorage rcf:logs: " + (localStorage.getItem("rcf:logs") ? "OK" : "vazio"));
    info.push("navigator.onLine: " + (typeof navigator !== "undefined" ? navigator.onLine : "n/a"));
    info.push("ua: " + (typeof navigator !== "undefined" ? navigator.userAgent : "n/a"));
    return info.join("\n");
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
    if (btnClear && input) bindTap(btnClear, () => { input.value = ""; if (out) out.textContent = "Limpo."; });

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
        if (out) out.textContent = safeText(rep);
      });
    }
    if (btnClear) bindTap(btnClear, () => { if (out) out.textContent = "Limpo."; });
    if (btnApply) bindTap(btnApply, () => patchApplyAll(out));
    if (btnDiscard) bindTap(btnDiscard, () => patchClear(out));
  }

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
    if (btnClear) bindTap(btnClear, () => { if (out) out.textContent = "Pronto."; });
  }

  function bindLogsViewAndTools() {
    // ✅ IDs reais do seu HTML:
    const logsViewBox = $("logsOut"); // tela Logs
    const toolsLogsBox = $("logsBox"); // drawer Ferramentas

    const btnRefresh = $("btnLogsRefresh");
    const btnCopy = $("btnLogsCopy");
    const btnClear = $("btnLogsClear");

    const btnClearLogs = $("btnClearLogs"); // drawer
    const btnCopyLogs = $("btnCopyLogs");   // drawer

    const refresh = () => {
      const text = getLogsText();
      const show = text ? text : "Logs...";
      if (logsViewBox) logsViewBox.textContent = show;
      if (toolsLogsBox) toolsLogsBox.textContent = show;

      // opcional: mostrar feedback no pill do topo se existir
      const pill = $("statusText");
      if (pill) pill.textContent = "Logs atualizados ✅";
      setTimeout(() => {
        const p = $("statusText");
        if (p) p.textContent = "OK ✅";
      }, 900);
    };

    const copy = async () => {
      const text = getLogsText() || "";
      try {
        await navigator.clipboard.writeText(text);
        alert("Logs copiados ✅");
      } catch {
        alert("iOS bloqueou copiar. Selecione o texto e copie manual.");
      }
    };

    const clear = () => {
      clearLogsEverywhere();
      refresh();
    };

    if (btnRefresh) bindTap(btnRefresh, refresh);
    if (btnCopy) bindTap(btnCopy, copy);
    if (btnClear) bindTap(btnClear, clear);

    if (btnClearLogs) bindTap(btnClearLogs, clear);
    if (btnCopyLogs) bindTap(btnCopyLogs, copy);

    // Atualiza uma vez ao iniciar
    refresh();
  }

  function init() {
    document.body.addEventListener("touchstart", () => {}, { passive: true });

    bindAgent();
    bindAdmin();
    bindDiagnosticsView();
    bindLogsViewAndTools();

    loggerPush("log", "core/ui_bindings.js carregado ✅ (logs fix)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

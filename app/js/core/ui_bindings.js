/* =========================================================
  RControl Factory — core/ui_bindings.js (FULL / FIXED)
  - Liga UI (Agent/Admin/Diag/Logs/Tools) ao core
  - iOS-safe: click + touchend (evita double fire)
  - Não depende de "AgroControl" nem exemplos
========================================================= */

(function () {
  "use strict";

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  function safeText(v) {
    return (v === undefined || v === null) ? "" : String(v);
  }

  // Evita "duplo clique" (touch + click) no iOS
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;

    const handler = (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        // ignora o segundo evento (double fire)
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      fn(e);
    };

    // click + touchend (touchstart pode bloquear scroll/inputs)
    el.addEventListener("click", handler, { passive: false });
    el.addEventListener("touchend", handler, { passive: false });
  }

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

  // ---------- logger integration ----------
  function loggerGetText() {
    // tenta vários formatos possíveis
    const L = window.RCF_LOGGER;

    if (!L) return "";
    if (typeof L.getText === "function") return safeText(L.getText());
    if (typeof L.dump === "function") return safeText(L.dump());
    if (Array.isArray(L.lines)) return L.lines.map(safeText).join("\n");
    if (Array.isArray(L.buffer)) return L.buffer.map(safeText).join("\n");
    return "";
  }

  function loggerClear() {
    const L = window.RCF_LOGGER;
    if (!L) return;
    if (typeof L.clear === "function") return L.clear();
    if (Array.isArray(L.lines)) L.lines.length = 0;
    if (Array.isArray(L.buffer)) L.buffer.length = 0;
  }

  function loggerPush(level, msg) {
    const L = window.RCF_LOGGER;
    if (L && typeof L.push === "function") {
      try { L.push(level || "log", msg); } catch {}
    } else {
      // fallback silencioso
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
    // tenta o core/diagnostics.js primeiro
    const D = window.RCF_DIAGNOSTICS;
    if (D && typeof D.buildReport === "function") {
      return await D.buildReport();
    }
    if (D && typeof D.run === "function") {
      return await D.run();
    }

    // fallback: factory diagnosis (se existir)
    const F = window.RCF && window.RCF.factory;
    if (F && typeof F.buildDiagnosisReport === "function") {
      return await F.buildDiagnosisReport();
    }

    // fallback simples
    const info = [];
    info.push("DIAG (fallback) ✅");
    info.push("—");
    info.push("RCF_COMMANDS: " + (!!window.RCF_COMMANDS));
    info.push("RCF_PATCHSET: " + (!!window.RCF_PATCHSET));
    info.push("RCF_LOGGER: " + (!!window.RCF_LOGGER));
    info.push("navigator.onLine: " + (typeof navigator !== "undefined" ? navigator.onLine : "n/a"));
    info.push("ua: " + (typeof navigator !== "undefined" ? navigator.userAgent : "n/a"));
    return info.join("\n");
  }

  // ---------- bindings ----------
  function bindAgent() {
    const input = $("agentCmd");      // ✅ ID real do seu HTML
    const out = $("agentOut");

    const btnRun = $("btnAgentRun");
    const btnClear = $("btnAgentClear");
    const btnApprove = $("btnAgentApprove");
    const btnDiscard = $("btnAgentDiscard");

    if (btnRun && input) {
      bindTap(btnRun, () => runCommand(input.value, out));
    }

    if (btnClear && input) {
      bindTap(btnClear, () => {
        input.value = "";
        if (out) out.textContent = "Limpo.";
      });
    }

    // Aprovar/Descartar (patchset)
    if (btnApprove) {
      bindTap(btnApprove, () => patchApplyAll(out));
    }
    if (btnDiscard) {
      bindTap(btnDiscard, () => patchClear(out));
    }

    // Enter executa (sem shift) — e não quebra colagem grande
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

    const btnDiag = $("btnAdminDiag");       // ✅ ID real
    const btnClear = $("btnAdminClear");     // ✅ ID real
    const btnApply = $("btnAdminApply");     // ✅ ID real
    const btnDiscard = $("btnAdminDiscard"); // ✅ ID real (ANTES estava errado)

    if (btnDiag) {
      bindTap(btnDiag, async () => {
        const rep = await buildDiagReport();
        if (out) out.textContent = safeText(rep);
      });
    }

    if (btnClear) {
      bindTap(btnClear, () => {
        if (out) out.textContent = "Limpo.";
      });
    }

    if (btnApply) {
      bindTap(btnApply, () => patchApplyAll(out));
    }

    if (btnDiscard) {
      bindTap(btnDiscard, () => patchClear(out));
    }
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

    if (btnClear) {
      bindTap(btnClear, () => {
        if (out) out.textContent = "Pronto.";
      });
    }
  }

  function bindLogsViewAndTools() {
    const logsViewBox = $("logsViewBox"); // view logs
    const toolsLogsBox = $("logsBox");    // drawer ferramentas

    const btnRefresh = $("btnLogsRefresh");
    const btnCopy = $("btnLogsCopy");
    const btnClear = $("btnLogsClear");

    // tools drawer
    const btnClearLogs = $("btnClearLogs");
    const btnCopyLogs = $("btnCopyLogs");

    const refresh = () => {
      const text = loggerGetText() || "Logs...";
      if (logsViewBox) logsViewBox.textContent = text;
      if (toolsLogsBox) toolsLogsBox.textContent = text;
    };

    const copy = async () => {
      const text = loggerGetText() || "";
      try {
        await navigator.clipboard.writeText(text);
        alert("Logs copiados ✅");
      } catch {
        alert("iOS bloqueou copiar. Abra Ferramentas (⚙️) e copie manual.");
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

    // Atualiza uma vez ao iniciar (pra não ficar “Logs...”)
    refresh();
  }

  function init() {
    // iOS: garante que a página registra toque (sem travar scroll)
    document.body.addEventListener("touchstart", () => {}, { passive: true });

    bindAgent();
    bindAdmin();
    bindDiagnosticsView();
    bindLogsViewAndTools();

    loggerPush("log", "core/ui_bindings.js carregado ✅ (fixed)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

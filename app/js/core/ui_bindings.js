/* =========================================================
  RControl Factory — core/ui_bindings.js (LOGS FIX v1.2) — PATCH DIAG v1.2.1
  - Liga UI (Agent/Admin/Diag/Logs/Tools) ao core
  - iOS-safe: click + touchend (evita double fire)
  - Logs: lê de múltiplas fontes + múltiplas keys no localStorage
  - Logs: escreve no elemento certo (pre/textarea) mesmo se ID variar
  - DIAG: chama installAll() + runStabilityCheck() automaticamente (evita FAIL falso)
========================================================= */

(function () {
  "use strict";

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
    const el = $("statusText");
    if (el) el.textContent = safeText(msg);
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
      try { fn(e); } catch {}
    };

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
      try { res = handler(String(cmd || "").trim(), ctx); }
      catch (err) { res = "ERRO ao executar comando: " + (err && err.message ? err.message : String(err)); }
    }

    if (outEl) setBoxText(outEl, res);
    return res;
  }

  // ---------- logger integration ----------
  function tryReadLS(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return "";
      // pode ser string pura ou JSON array
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
    // tenta várias chaves possíveis (porque teu storage.js NÃO tem prefix)
    const keys = [
      "logs",
      "rcf:logs",
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

    // fallback localStorage
    return readLogsFromLocalStorageFallback();
  }

  function loggerClear() {
    const L = window.RCF_LOGGER;
    if (L) {
      if (typeof L.clear === "function") { try { return L.clear(); } catch {} }
      if (Array.isArray(L.lines)) L.lines.length = 0;
      if (Array.isArray(L.buffer)) L.buffer.length = 0;
    }

    // limpa as principais chaves
    try { localStorage.setItem("logs", JSON.stringify([])); } catch {}
    try { localStorage.setItem("rcf:logs", JSON.stringify([])); } catch {}
    try { localStorage.setItem("factory:logs", JSON.stringify([])); } catch {}
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
    if (outEl) setBoxText(outEl, rep || "OK ✅");
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
    if (outEl) setBoxText(outEl, rep);
    return rep;
  }

  // ---------- DIAG report (PATCH) ----------
  async function runStabilityAndGetText() {
    const D = window.RCF_DIAGNOSTICS;

    // ✅ novo padrão: installAll 1x e roda runStabilityCheck
    if (D && typeof D.installAll === "function" && typeof D.runStabilityCheck === "function") {
      try {
        // instala uma vez (evita FAIL falso e mantém installCount)
        D.installAll();
      } catch {}

      try {
        const r = await D.runStabilityCheck();
        return safeText(r && (r.text || r.reportText || r.summaryText || "")) || "(sem texto do relatório)";
      } catch (e) {
        return "ERRO: runStabilityCheck falhou: " + safeText(e && e.message ? e.message : e);
      }
    }

    // compat legacy (se existir)
    if (D && typeof D.buildReport === "function") {
      try { return await D.buildReport(); } catch (e) {
        return "ERRO: buildReport falhou: " + safeText(e && e.message ? e.message : e);
      }
    }
    if (D && typeof D.run === "function") {
      try { return await D.run(); } catch (e) {
        return "ERRO: diag.run falhou: " + safeText(e && e.message ? e.message : e);
      }
    }

    // fallback simples
    const info = [];
    info.push("DIAG (fallback) ✅");
    info.push("—");
    info.push("RCF_DIAGNOSTICS: " + (!!window.RCF_DIAGNOSTICS));
    info.push("RCF_COMMANDS: " + (!!window.RCF_COMMANDS));
    info.push("RCF_PATCHSET: " + (!!window.RCF_PATCHSET));
    info.push("RCF_LOGGER: " + (!!window.RCF_LOGGER));
    const t = loggerGetText();
    info.push("loggerGetText(): " + (t && t.trim().length ? ("OK (" + t.length + " chars)") : "VAZIO"));
    info.push("navigator.onLine: " + (typeof navigator !== "undefined" ? navigator.onLine : "n/a"));
    info.push("ua: " + (typeof navigator !== "undefined" ? navigator.userAgent : "n/a"));
    return info.join("\n");
  }

  async function buildDiagReport() {
    // mantém nome antigo (usado em outros lugares), mas agora aponta pro V7.1
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

    // ✅ auto-run ao entrar na view diagnostics (evita FAIL falso de primeira)
    $$('[data-view="diagnostics"]').forEach(b => bindTap(b, () => setTimeout(run, 60)));
    // fallback: qualquer botão com texto "Diagnostics"
    $$("button").filter(b => (b.textContent || "").trim().toLowerCase() === "diagnostics")
      .forEach(b => bindTap(b, () => setTimeout(run, 60)));
  }

  function bindLogsViewAndTools() {
    // ✅ robusto: tenta vários IDs possíveis
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
      const out = text && text.trim().length ? text : "(sem logs ainda)";
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

    // Auto refresh ao entrar em Logs (se os botões tiverem data-view)
    $$('[data-view="logs"]').forEach(b => bindTap(b, () => setTimeout(refresh, 50)));
    // Fallback: se tiver botões com texto "Logs"
    $$("button").filter(b => (b.textContent || "").trim().toLowerCase() === "logs")
      .forEach(b => bindTap(b, () => setTimeout(refresh, 50)));

    refresh();
  }

  function init() {
    document.body.addEventListener("touchstart", () => {}, { passive: true });

    bindAgent();
    bindAdmin();
    bindDiagnosticsView();
    bindLogsViewAndTools();

    loggerPush("log", "core/ui_bindings.js carregado ✅ (LOGS FIX v1.2.1 + DIAG AUTOINSTALL)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

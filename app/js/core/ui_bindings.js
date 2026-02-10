/* =========================================================
  RControl Factory — core/ui_bindings.js (FULL / SAFE)
  - Complementa o app.js atual:
    * DIAG view (btnDiagRun / diagOut)
    * LOGS view (btnLogsRefresh / logsOut)
    * Tools drawer logs espelhado (logsBox)
  - iOS-safe: click + touchend com guarda anti-double-fire
  - NÃO mexe em Agent/Admin comandos (app.js já controla isso)
========================================================= */

(function () {
  "use strict";

  if (window.__RCF_UI_BINDINGS_SAFE__) return;
  window.__RCF_UI_BINDINGS_SAFE__ = true;

  const $id = (id) => document.getElementById(id);

  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;
    if (el.dataset && el.dataset.rcfBound === "1") return; // evita double bind
    if (el.dataset) el.dataset.rcfBound = "1";

    const handler = async (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { await fn(e); } catch (err) {
        // log silencioso
        try { console.log("[RCF ui_bindings] err:", err); } catch {}
      }
    };

    el.addEventListener("click", handler, { passive: false });
    el.addEventListener("touchend", handler, { passive: false });
  }

  // -----------------------------
  // Logs: lê direto do localStorage do app.js
  // app.js usa prefix "rcf:" e key "logs"
  // -----------------------------
  function readLogsArray() {
    try {
      const raw = localStorage.getItem("rcf:logs");
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function writeLogsArray(arr) {
    try {
      localStorage.setItem("rcf:logs", JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {}
  }

  function logsText() {
    const arr = readLogsArray();
    return arr.length ? arr.join("\n") : "Logs...";
  }

  function refreshLogsUI() {
    const text = logsText();
    const logsOut = $id("logsOut"); // ✅ ID real do seu index.html
    const logsBox = $id("logsBox"); // drawer
    if (logsOut) logsOut.textContent = text;
    if (logsBox) logsBox.textContent = text;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------
  // Diag: usa window.RCF.state (do seu app.js)
  // -----------------------------
  function buildDiagFallback() {
    const st = (window.RCF && window.RCF.state) ? window.RCF.state : null;

    const info = {
      cfg: st?.cfg || {},
      apps: Array.isArray(st?.apps) ? st.apps.length : 0,
      active: st?.active?.appSlug || "_",
      file: st?.active?.file || "_",
      view: st?.active?.view || "_",
      ua: (navigator && navigator.userAgent) ? navigator.userAgent : "n/a",
      hint: "Se algo não clicar: pode ser overlay. Veja LOGS e teste DIAG."
    };

    return "RCF DIAGNÓSTICO\n" + JSON.stringify(info, null, 2);
  }

  async function runDiag() {
    // se existir um diagnostics do core, tenta antes (sem depender dele)
    const D = window.RCF_DIAGNOSTICS;
    if (D && typeof D.buildReport === "function") {
      try { return await D.buildReport(); } catch {}
    }
    if (D && typeof D.run === "function") {
      try { return await D.run(); } catch {}
    }
    return buildDiagFallback();
  }

  // -----------------------------
  // Bindings
  // -----------------------------
  function bindLogsViewAndTools() {
    const btnRefresh = $id("btnLogsRefresh");
    const btnCopy = $id("btnLogsCopy");
    const btnClear = $id("btnLogsClear");

    const btnClearLogs = $id("btnClearLogs"); // drawer
    const btnCopyLogs = $id("btnCopyLogs");   // drawer

    bindTap(btnRefresh, () => refreshLogsUI());

    bindTap(btnClear, () => {
      writeLogsArray([]);
      refreshLogsUI();
    });

    bindTap(btnClearLogs, () => {
      writeLogsArray([]);
      refreshLogsUI();
    });

    bindTap(btnCopy, async () => {
      const ok = await copyText(logsText());
      if (!ok) alert("iOS bloqueou copiar. Abra Ferramentas (⚙️) e copie manual.");
      else alert("Logs copiados ✅");
    });

    bindTap(btnCopyLogs, async () => {
      const ok = await copyText(logsText());
      if (!ok) alert("iOS bloqueou copiar. Abra Ferramentas (⚙️) e copie manual.");
      else alert("Logs copiados ✅");
    });

    // primeiro paint
    refreshLogsUI();
  }

  function bindDiagView() {
    const btnRun = $id("btnDiagRun");
    const btnClear = $id("btnDiagClear");
    const out = $id("diagOut");

    bindTap(btnRun, async () => {
      const rep = await runDiag();
      if (out) out.textContent = String(rep || "Pronto.");
    });

    bindTap(btnClear, () => {
      if (out) out.textContent = "Pronto.";
    });
  }

  function init() {
    // iOS: registra toque sem travar scroll
    document.body.addEventListener("touchstart", () => {}, { passive: true });

    bindLogsViewAndTools();
    bindDiagView();

    // logzinho leve (não depende do logger do core)
    try { console.log("[RCF] ui_bindings SAFE loaded"); } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

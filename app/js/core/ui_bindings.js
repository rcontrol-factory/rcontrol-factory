/* =========================================================
  RControl Factory — core/ui_bindings.js (FULL)
  Liga Agent/Admin UI a core/commands.js
  iOS-safe: click + touchstart
========================================================= */

(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn, { passive: false }); }

  function runWith(inputEl, outEl) {
    const cmd = String(inputEl?.value || "").trim();
    if (!cmd) return;

    const ctx = window.RCF_STATE || (window.RCF_STATE = { autoMode:false, safeMode:true, currentFile:"index.html" });

    const res = window.RCF_COMMANDS?.handle(cmd, ctx);
    if (outEl && typeof res === "string") outEl.textContent = res;
  }

  function bindAgentPanels() {
    // --- Painel Agent (se existir)
    const agentInput =
      $("agentInput") || $("aiInput") || $("rcf-admin-cmd");
    const agentOut =
      $("agentOut") || $("aiOut") || $("rcf-admin-chat-out");

    // Botões possíveis (vários layouts)
    const btnRun =
      $("btnAgentRun") || $("aiRunBtn") || $("runBtn") || $("adminRunBtn");
    const btnClear =
      $("btnAgentClear") || $("aiClearBtn") || $("clearBtn");

    if (btnRun && agentInput) {
      on(btnRun, "click", (e) => { e.preventDefault(); runWith(agentInput, agentOut); });
      on(btnRun, "touchstart", (e) => { e.preventDefault(); runWith(agentInput, agentOut); });
    }

    if (btnClear && agentInput) {
      on(btnClear, "click", (e) => { e.preventDefault(); agentInput.value = ""; });
      on(btnClear, "touchstart", (e) => { e.preventDefault(); agentInput.value = ""; });
    }

    // Enter pra executar (sem quebrar colagem grande)
    if (agentInput) {
      agentInput.addEventListener("keydown", (e) => {
        // Enter sem shift executa, com shift quebra linha
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          runWith(agentInput, agentOut);
        }
      });
    }
  }

  function bindAdminDiagButtons() {
    // “diagnóstico / copiar / limpar cache” (se existirem)
    const diagBtn = $("diagBtn");
    const copyDiagBtn = $("copyDiagBtn");
    const clearPwaBtn = $("clearPwaBtn");
    const adminOut = $("adminOut");

    if (diagBtn && adminOut) {
      on(diagBtn, "click", async (e) => {
        e.preventDefault();
        const rep = window.RCF?.factory?.buildDiagnosisReport
          ? await window.RCF.factory.buildDiagnosisReport()
          : "Diagnóstico não disponível (buildDiagnosisReport não encontrado).";
        adminOut.textContent = rep;
      });
      on(diagBtn, "touchstart", async (e) => {
        e.preventDefault();
        const rep = window.RCF?.factory?.buildDiagnosisReport
          ? await window.RCF.factory.buildDiagnosisReport()
          : "Diagnóstico não disponível (buildDiagnosisReport não encontrado).";
        adminOut.textContent = rep;
      });
    }

    if (copyDiagBtn && adminOut) {
      const fn = async (e) => {
        e.preventDefault();
        try { await navigator.clipboard.writeText(String(adminOut.textContent || "")); alert("Diagnóstico copiado ✅"); }
        catch { alert("iOS bloqueou copiar. Selecione o texto e copie manual."); }
      };
      on(copyDiagBtn, "click", fn);
      on(copyDiagBtn, "touchstart", fn);
    }

    if (clearPwaBtn) {
      const fn = async (e) => {
        e.preventDefault();
        if (!confirm("Limpar Cache PWA + desregistrar SW e recarregar?")) return;
        if (window.RCF?.factory?.nukePwaCache) {
          await window.RCF.factory.nukePwaCache();
        } else {
          // fallback
          try {
            if ("caches" in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(k => caches.delete(k)));
            }
          } catch {}
          try {
            if ("serviceWorker" in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r => r.unregister()));
            }
          } catch {}
        }
        alert("Cache limpo ✅");
        location.reload();
      };
      on(clearPwaBtn, "click", fn);
      on(clearPwaBtn, "touchstart", fn);
    }
  }

  function bindApplyPatchIfExists() {
    // Botão apply de patch (se existir em algum layout)
    const applyBtn = $("aiApplyBtn") || $("btnAdminApply") || $("applyBtn");
    const discardBtn = $("aiDiscardBtn") || $("btnAdminClear") || $("discardBtn");
    const out = $("aiOut") || $("adminOut") || $("agentOut");

    if (applyBtn) {
      const fn = (e) => {
        e.preventDefault();
        const rep = window.RCF_PATCHSET?.applyAll ? window.RCF_PATCHSET.applyAll() : "(patchset não existe)";
        if (out) out.textContent = String(rep || "OK");
      };
      on(applyBtn, "click", fn);
      on(applyBtn, "touchstart", fn);
    }

    if (discardBtn) {
      const fn = (e) => {
        e.preventDefault();
        if (window.RCF_PATCHSET?.clear) window.RCF_PATCHSET.clear();
        if (out) out.textContent = "(patches descartados)";
      };
      on(discardBtn, "click", fn);
      on(discardBtn, "touchstart", fn);
    }
  }

  function init() {
    // garante que click funciona no iOS mesmo quando tem scroll
    document.body.addEventListener("touchstart", () => {}, { passive: true });

    bindAgentPanels();
    bindAdminDiagButtons();
    bindApplyPatchIfExists();

    if (window.RCF_LOGGER?.push) window.RCF_LOGGER.push("log", "core/ui_bindings.js carregado ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

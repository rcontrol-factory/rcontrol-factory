/* =========================================================
  RControl Factory — /app/js/settings.js (FULL)
  Centraliza configurações no tab Settings (sem engrenagem)
========================================================= */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const LS_GH = "RCF_GH_CFG";
  const LS_PIN = "RCF_ADMIN_PIN";

  const safeJSON = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

  function setOut(id, msg) {
    const el = $(id);
    if (el) el.textContent = msg;
  }

  // -------- GitHub config (localStorage) --------
  function loadGh() {
    const cfg = safeJSON(localStorage.getItem(LS_GH) || "null", null) || {};
    if ($("ghOwner")) $("ghOwner").value = cfg.owner || "";
    if ($("ghRepo")) $("ghRepo").value = cfg.repo || "";
    if ($("ghBranch")) $("ghBranch").value = cfg.branch || "main";
    if ($("ghPath")) $("ghPath").value = cfg.path || "app/import/mother_bundle.json";
    if ($("ghToken")) $("ghToken").value = cfg.token ? "********" : "";
  }

  function saveGh() {
    const old = safeJSON(localStorage.getItem(LS_GH) || "null", null) || {};
    const tokenRaw = ($("ghToken")?.value || "").trim();

    const cfg = {
      owner: ($("ghOwner")?.value || "").trim(),
      repo: ($("ghRepo")?.value || "").trim(),
      branch: ($("ghBranch")?.value || "main").trim(),
      path: ($("ghPath")?.value || "app/import/mother_bundle.json").trim(),
      token: (tokenRaw && tokenRaw !== "********") ? tokenRaw : (old.token || "")
    };

    localStorage.setItem(LS_GH, JSON.stringify(cfg));
    setOut("ghOut", "✅ Config salva.");
  }

  // -------- PIN (simples) --------
  function setPin() {
    const pin = ($("adminPin")?.value || "").trim();
    if (!/^\d{4,8}$/.test(pin)) {
      setOut("secOut", "❌ PIN inválido. Use 4 a 8 dígitos.");
      return;
    }
    localStorage.setItem(LS_PIN, pin);
    $("adminPin").value = "";
    setOut("secOut", "✅ PIN salvo. (Ações críticas no Admin podem exigir esse PIN.)");
  }

  function clearPin() {
    localStorage.removeItem(LS_PIN);
    setOut("secOut", "✅ PIN removido.");
  }

  // -------- Integração com módulos existentes --------
  async function ghPull() {
    // se você já tem window.RCF_GH_SYNC, usa. Senão, só orienta.
    if (window.RCF_GH_SYNC?.pull) {
      setOut("ghOut", "⏳ Pull...");
      const r = await window.RCF_GH_SYNC.pull();
      setOut("ghOut", "✅ Pull OK.\n" + (r ? JSON.stringify(r, null, 2) : ""));
      return;
    }
    setOut("ghOut", "⚠️ Módulo GitHub Sync não encontrado (window.RCF_GH_SYNC ausente).");
  }

  async function ghPush() {
    if (window.RCF_GH_SYNC?.push) {
      setOut("ghOut", "⏳ Push...");
      const r = await window.RCF_GH_SYNC.push();
      setOut("ghOut", "✅ Push OK.\n" + (r ? JSON.stringify(r, null, 2) : ""));
      return;
    }
    setOut("ghOut", "⚠️ Módulo GitHub Sync não encontrado (window.RCF_GH_SYNC ausente).");
  }

  async function ghUpdateNow() {
    // tenta usar self-update, se existir
    if (window.RCF_MOTHER?.applyFromImport) {
      setOut("ghOut", "⏳ Atualizando agora...");
      await window.RCF_MOTHER.applyFromImport();
      setOut("ghOut", "✅ Atualização aplicada.");
      return;
    }
    setOut("ghOut", "⚠️ Self-update (Mãe) não encontrado (window.RCF_MOTHER ausente).");
  }

  function runDiag() {
    if (window.RCF_DIAG?.run) {
      const r = window.RCF_DIAG.run();
      setOut("diagOut", "✅ Diagnóstico:\n" + JSON.stringify(r, null, 2));
      return;
    }
    setOut("diagOut", "⚠️ Diagnóstico não disponível (window.RCF_DIAG ausente).");
  }

  function openAdmin() {
    // se seu router tem método, chama; se não, só clica no tab
    const tab = document.querySelector('.tab[data-view="admin"]');
    tab?.click?.();
  }

  function clearLogs() {
    if (window.RCF_LOGGER?.clear) window.RCF_LOGGER.clear();
    setOut("diagOut", "✅ Logs limpos.");
  }

  // -------- Bind seguro (touch/click) --------
  function bindTap(id, fn) {
    const el = $(id);
    if (!el) return;
    const handler = (e) => { try { e.preventDefault(); e.stopPropagation(); } catch {} fn(); };
    el.style.touchAction = "manipulation";
    el.addEventListener("touchend", handler, { passive: false });
    el.addEventListener("click", handler, { passive: false });
  }

  function init() {
    loadGh();

    bindTap("btnGhSave", saveGh);
    bindTap("btnGhPull", ghPull);
    bindTap("btnGhPush", ghPush);
    bindTap("btnGhUpdateNow", ghUpdateNow);

    bindTap("btnSetPin", setPin);
    bindTap("btnClearPin", clearPin);

    bindTap("btnRunDiag", runDiag);
    bindTap("btnOpenAdmin", openAdmin);
    bindTap("btnClearLogs2", clearLogs);

    setOut("settingsOut", "✅ Settings carregado.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

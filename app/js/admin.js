/* =========================================================
   RControl Factory — app/js/admin.js
   - Painel ADMIN (modal) com PIN
   - Auto-check / reparos rápidos (cache/storage/export/import)
   - Chat tipo Replit (comandos do engine)
   - NÃO depende de HTML (auto-injeta UI)
   ========================================================= */

(function () {
  "use strict";

  const PIN_KEY = "rcf_admin_pin_v1";
  const UNLOCK_KEY = "rcf_admin_unlock_until_v1"; // timestamp ms
  const DEFAULT_PIN = "1122"; // você troca no próprio painel

  function now() { return Date.now(); }

  function getPin() {
    return localStorage.getItem(PIN_KEY) || DEFAULT_PIN;
  }
  function setPin(pin) {
    localStorage.setItem(PIN_KEY, String(pin || "").trim());
  }

  function isUnlocked() {
    const until = Number(localStorage.getItem(UNLOCK_KEY) || "0");
    return until && until > now();
  }
  function unlock(minutes) {
    const ms = (Number(minutes || 15) * 60 * 1000);
    localStorage.setItem(UNLOCK_KEY, String(now() + ms));
  }
  function lock() {
    localStorage.setItem(UNLOCK_KEY, "0");
  }

  function el(tag, props) {
    const n = document.createElement(tag);
    if (props) Object.assign(n, props);
    return n;
  }

  function cssTextBaseBtn() {
    return "padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font-weight:900;";
  }

  function ensureAdminButtonInTabs() {
    // se existir uma área de tabs, tenta criar um botão "Admin 🔒"
    const tabs = document.querySelector(".tabs") || document.querySelector(".topTabs") || document.body;
    if (!tabs) return;

    if (document.getElementById("rcf-admin-tabbtn")) return;

    const b = el("button", { id: "rcf-admin-tabbtn" });
    b.className = "tab";
    b.textContent = "Admin 🔒";
    b.style.marginLeft = "8px";
    b.onclick = () => openAdmin();
    try { tabs.appendChild(b); } catch {}
  }

  function ensureFloatingButtons() {
    if (!document.getElementById("rcf-admin-fab")) {
      const b = el("button", { id: "rcf-admin-fab", textContent: "Admin" });
      b.style.cssText = `
        position:fixed; right:132px; bottom:12px; z-index:99999;
        padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
        background:rgba(0,0,0,.55); color:white; font-weight:900;
      `;
      b.onclick = () => openAdmin();
      document.body.appendChild(b);
    }

    // Se seu app.js já criou Diag/Logs, beleza. Se não, cria também.
    if (!document.getElementById("rcf-diag-btn")) {
      const d = el("button", { id: "rcf-diag-btn", textContent: "Diag" });
      d.style.cssText = `
        position:fixed; right:72px; bottom:12px; z-index:99999;
        padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
        background:rgba(0,0,0,.55); color:white; font-weight:900;
      `;
      d.onclick = async () => {
        const rep = await safeDiag();
        alert("Diagnóstico pronto ✅ (use Admin > Rodar diagnóstico pra ver completo)");
        // tenta abrir admin e mostrar
        openAdmin();
        const out = document.getElementById("rcf-admin-diag-out");
        if (out) out.textContent = rep;
      };
      document.body.appendChild(d);
    }

    if (!document.getElementById("rcf-debug-btn")) {
      const l = el("button", { id: "rcf-debug-btn", textContent: "Logs" });
      l.style.cssText = `
        position:fixed; right:12px; bottom:12px; z-index:99999;
        padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
        background:rgba(0,0,0,.55); color:white; font-weight:900;
      `;
      l.onclick = () => openAdmin(true);
      document.body.appendChild(l);
    }
  }

  function ensureModal() {
    if (document.getElementById("rcf-admin-modal")) return;

    const modal = el("div", { id: "rcf-admin-modal" });
    modal.style.cssText = `
      position:fixed; inset:12px; z-index:100000;
      display:none; border-radius:16px;
      background:rgba(10,10,10,.92);
      border:1px solid rgba(255,255,255,.14);
      color:#fff; font-family:-apple-system,system-ui,Segoe UI,Roboto,Arial;
      overflow:auto;
    `;

    const header = el("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:12px 12px;border-bottom:1px solid rgba(255,255,255,.10);";
    const title = el("div", { innerHTML: "<strong>ADMIN • RControl Factory</strong>" });

    const hBtns = el("div");
    hBtns.style.cssText = "display:flex;gap:8px;align-items:center;";

    const lockBtn = el("button", { textContent: "Lock" });
    lockBtn.style.cssText = cssTextBaseBtn();
    lockBtn.onclick = () => { lock(); renderLockState(); };

    const closeBtn = el("button", { textContent: "Fechar" });
    closeBtn.style.cssText = cssTextBaseBtn();
    closeBtn.onclick = () => closeAdmin();

    hBtns.append(lockBtn, closeBtn);
    header.append(title, hBtns);

    const body = el("div");
    body.style.cssText = "padding:12px;";

    // PIN area
    const pinBox = el("div");
    pinBox.id = "rcf-admin-pinbox";
    pinBox.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;";

    const pinInput = el("input");
    pinInput.id = "rcf-admin-pin";
    pinInput.placeholder = "PIN";
    pinInput.type = "password";
    pinInput.style.cssText = "flex:0 0 120px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-weight:900;";

    const unlockBtn = el("button", { textContent: "Unlock (15min)" });
    unlockBtn.style.cssText = cssTextBaseBtn();
    unlockBtn.onclick = () => {
      const ok = (pinInput.value || "") === getPin();
      if (!ok) return alert("PIN errado ❌");
      unlock(15);
      pinInput.value = "";
      renderLockState();
    };

    const changePinBtn = el("button", { textContent: "Trocar PIN" });
    changePinBtn.style.cssText = cssTextBaseBtn();
    changePinBtn.onclick = () => {
      const ok = prompt("Digite o NOVO PIN (4+ dígitos):", "");
      if (!ok || ok.trim().length < 4) return alert("PIN inválido.");
      setPin(ok.trim());
      alert("PIN atualizado ✅");
    };

    const lockState = el("span");
    lockState.id = "rcf-admin-lockstate";
    lockState.style.cssText = "padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);font-weight:900;";

    pinBox.append(pinInput, unlockBtn, changePinBtn, lockState);

    // ACTIONS
    const actionsTitle = el("div", { innerHTML: "<h3 style='margin:10px 0 8px'>Auto-check / Reparos rápidos</h3>" });

    const actions = el("div");
    actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;";

    const btnDiag = mkAction("Rodar diagnóstico", async () => {
      const rep = await safeDiag();
      const out = document.getElementById("rcf-admin-diag-out");
      if (out) out.textContent = rep;
    });

    const btnCache = mkAction("Limpar Cache PWA", async () => {
      if (!guardUnlocked()) return;
      if (!confirm("Vai limpar caches + desregistrar SW e recarregar. Continuar?")) return;
      await safeNukeCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

    const btnReset = mkAction("Reset Storage RCF", async () => {
      if (!guardUnlocked()) return;
      if (!confirm("Vai apagar apps/settings locais. Continuar?")) return;
      safeResetStorage();
      alert("Storage resetado ✅ Recarregando…");
      location.reload();
    });

    const btnExport = mkAction("Export (JSON)", async () => {
      if (!guardUnlocked()) return;
      const json = safeExportJson();
      downloadText("rcf-backup.json", json);
    });

    const btnImport = mkAction("Import (JSON)", async () => {
      if (!guardUnlocked()) return;
      const file = await pickFile();
      if (!file) return;
      const text = await file.text();
      safeImportJson(text);
      alert("Import OK ✅ Recarregando…");
      location.reload();
    });

    actions.append(btnDiag, btnCache, btnReset, btnExport, btnImport);

    const hint = el("div");
    hint.style.cssText = "opacity:.8;margin:6px 0 12px;font-size:12px;";
    hint.textContent = "“Auto-corrigir” aqui = ações seguras (cache/storage) + diagnóstico. A IA real a gente liga depois.";

    // DIAG OUTPUT
    const diagOut = el("pre");
    diagOut.id = "rcf-admin-diag-out";
    diagOut.style.cssText = `
      white-space:pre-wrap; background:rgba(255,255,255,.05);
      border:1px solid rgba(255,255,255,.12); border-radius:12px;
      padding:10px; min-height:120px;
    `;

    // CHAT
    const chatTitle = el("div", { innerHTML: "<h3 style='margin:14px 0 6px'>Chat (tipo Replit) — comandos do engine</h3>" });
    const chatHint = el("div");
    chatHint.style.cssText = "opacity:.8;margin:0 0 10px;font-size:12px;";
    chatHint.innerHTML = `Exemplos: <code>help</code> • <code>status</code> • <code>list</code> • <code>create app RQuotas</code> • <code>select &lt;id&gt;</code>`;

    const chatRow = el("div");
    chatRow.style.cssText = "display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;";

    const cmd = el("textarea");
    cmd.id = "rcf-admin-cmd";
    cmd.placeholder = "Digite um comando e toque em Executar…";
    cmd.rows = 2;
    cmd.style.cssText = `
      flex:1 1 240px; min-width:220px;
      padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);
      background:rgba(255,255,255,.06);color:#fff;font-weight:900;
    `;

    const runBtn = el("button", { textContent: "Executar" });
    runBtn.style.cssText = cssTextBaseBtn();
    runBtn.onclick = () => {
      if (!guardUnlocked()) return;
      const out = runEngine(String(cmd.value || ""));
      const box = document.getElementById("rcf-admin-chat-out");
      if (!box) return;
      if (out === "__CLEAR__") box.textContent = "";
      else box.textContent = (box.textContent ? box.textContent + "\n\n" : "") + out;
      cmd.value = "";
    };

    chatRow.append(cmd, runBtn);

    const chatOut = el("pre");
    chatOut.id = "rcf-admin-chat-out";
    chatOut.style.cssText = `
      white-space:pre-wrap; background:rgba(255,255,255,.05);
      border:1px solid rgba(255,255,255,.12); border-radius:12px;
      padding:10px; min-height:160px; margin-top:10px;
    `;

    body.append(
      pinBox,
      actionsTitle,
      actions,
      hint,
      diagOut,
      chatTitle,
      chatHint,
      chatRow,
      chatOut
    );

    modal.append(header, body);
    document.body.appendChild(modal);

    renderLockState();
  }

  function mkAction(label, fn) {
    const b = el("button", { textContent: label });
    b.style.cssText = cssTextBaseBtn();
    b.onclick = fn;
    return b;
  }

  function renderLockState() {
    const st = document.getElementById("rcf-admin-lockstate");
    if (!st) return;
    st.textContent = isUnlocked() ? "UNLOCK ✅" : "LOCKED 🔒";
  }

  function guardUnlocked() {
    if (isUnlocked()) return true;
    alert("Admin está bloqueado 🔒 (digite PIN e Unlock).");
    return false;
  }

  function openAdmin(forceLogs) {
    ensureModal();
    const modal = document.getElementById("rcf-admin-modal");
    if (!modal) return;
    modal.style.display = "block";
    renderLockState();

    if (forceLogs) {
      // mostra logs no chatOut pra facilitar
      const out = document.getElementById("rcf-admin-chat-out");
      const logs = (window.RCF?.debug?.getLogs?.() || []).slice(-60)
        .map(l => `[${l.time}] ${String(l.level || "").toUpperCase()} ${l.msg}`)
        .join("\n");
      if (out) out.textContent = logs || "(sem logs)";
    }
  }

  function closeAdmin() {
    const modal = document.getElementById("rcf-admin-modal");
    if (modal) modal.style.display = "none";
  }

  async function safeDiag() {
    try {
      if (window.RCF?.debug?.buildDiagnosisReport) {
        return await window.RCF.debug.buildDiagnosisReport();
      }
    } catch {}
    return "Diagnóstico indisponível (RCF.debug não encontrado).";
  }

  async function safeNukeCache() {
    try {
      if (window.RCF?.debug?.nukePwaCache) {
        await window.RCF.debug.nukePwaCache();
        return;
      }
    } catch {}
  }

  function safeResetStorage() {
    const core = window.RCF?.core;
    if (!core || !core.LS) return;

    try {
      localStorage.removeItem(core.LS.settings);
      localStorage.removeItem(core.LS.apps);
      localStorage.removeItem(core.LS.activeAppId);
    } catch {}
  }

  function safeExportJson() {
    const core = window.RCF?.core;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: null,
      apps: null,
      activeAppId: null,
    };

    try { payload.settings = core ? core.loadSettings() : null; } catch {}
    try { payload.apps = core ? core.loadApps() : []; } catch {}
    try { payload.activeAppId = core ? core.getActiveAppId() : ""; } catch {}

    return JSON.stringify(payload, null, 2);
  }

  function safeImportJson(text) {
    const core = window.RCF?.core;
    if (!core || !core.LS) return alert("Core API não encontrado.");

    let data = null;
    try { data = JSON.parse(String(text || "")); }
    catch { return alert("JSON inválido."); }

    try {
      if (data.settings) localStorage.setItem(core.LS.settings, JSON.stringify(data.settings));
      if (Array.isArray(data.apps)) localStorage.setItem(core.LS.apps, JSON.stringify(data.apps));
      if (typeof data.activeAppId === "string") localStorage.setItem(core.LS.activeAppId, data.activeAppId);
    } catch (e) {
      alert("Falha import: " + e.message);
    }
  }

  function runEngine(cmd) {
    const engine = window.RCF?.engine;
    const templates = window.RCF?.templates;
    if (!engine || typeof engine.run !== "function") return "ERRO: engine não disponível.";
    if (!templates) return "ERRO: templates não disponível.";
    return engine.run(cmd, templates);
  }

  function downloadText(filename, text) {
    const blob = new Blob([String(text || "")], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }

  function init() {
    ensureAdminButtonInTabs();
    ensureFloatingButtons();
    ensureModal();
    renderLockState();
  }

  // Public API
  window.RCF = window.RCF || {};
  window.RCF.admin = { init, openAdmin, closeAdmin };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

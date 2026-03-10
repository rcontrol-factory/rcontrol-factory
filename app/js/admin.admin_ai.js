/* FILE: /app/js/admin.admin_ai.js
   RControl Factory — Admin AI (Fase IA-1)
   - monta no slot admin.integrations
   - chat-lite com prompt manual + ações rápidas
   - usa /api/admin-ai
   - não executa patch automático
   - patch mínimo / não mexe no boot
*/

(() => {
  "use strict";

  if (window.RCF_ADMIN_AI && window.RCF_ADMIN_AI.__v1) return;

  const VERSION = "v1.0";
  const BOX_ID = "rcfAdminAIBox";

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, "[ADMIN_AI] " + msg); } catch {}
    try { console.log("[ADMIN_AI]", level, msg); } catch {}
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
    }[c]));
  }

  function getSlot() {
    try {
      const ui = window.RCF_UI;
      if (ui && typeof ui.getSlot === "function") {
        const slot = ui.getSlot("admin.integrations");
        if (slot) return slot;
      }
    } catch {}

    return (
      document.getElementById("rcfAdminSlotIntegrations") ||
      document.querySelector('[data-rcf-slot="admin.integrations"]') ||
      document.getElementById("view-admin") ||
      document.body
    );
  }

  function collectFactoryInfo() {
    const info = {
      href: location.href,
      runtimeVFS: window.__RCF_VFS_RUNTIME || "unknown",
      hasLogger: !!window.RCF_LOGGER,
      hasDoctor: !!window.RCF_DOCTOR_SCAN,
      hasGitHub: !!window.RCF_GH_SYNC,
      hasVault: !!window.RCF_ZIP_VAULT,
      hasBridge: !!window.RCF_AGENT_ZIP_BRIDGE,
      userAgent: navigator.userAgent,
      ts: new Date().toISOString()
    };
    return info;
  }

  function collectLogs(limit = 120) {
    try {
      const logger = window.RCF_LOGGER;
      if (logger && Array.isArray(logger.items)) {
        return logger.items.slice(-limit);
      }
    } catch {}
    return [];
  }

  function setStatus(txt) {
    const el = document.getElementById("rcfAdminAIStatus");
    if (el) el.textContent = String(txt || "");
  }

  function setResult(txt) {
    const el = document.getElementById("rcfAdminAIResult");
    if (el) el.textContent = String(txt || "");
  }

  async function callAdminAI(action, payload, prompt) {
    setStatus("carregando...");
    setResult("");

    try {
      const res = await fetch("/api/admin-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          payload,
          prompt
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setStatus("erro");
        setResult(JSON.stringify(data, null, 2) || "Erro ao chamar /api/admin-ai");
        log("ERR", "falha em /api/admin-ai");
        return;
      }

      setStatus("concluído");
      setResult(data.analysis || JSON.stringify(data, null, 2));
      log("OK", "resposta recebida action=" + action);
    } catch (e) {
      setStatus("erro");
      setResult(String(e?.message || e || "Erro de rede"));
      log("ERR", "erro de rede /api/admin-ai");
    }
  }

  function bindBox() {
    const btnFactory = document.getElementById("rcfAdminAIAnalyzeFactory");
    const btnLogs = document.getElementById("rcfAdminAIAnalyzeLogs");
    const btnSuggest = document.getElementById("rcfAdminAISuggest");
    const btnSend = document.getElementById("rcfAdminAISend");
    const promptEl = document.getElementById("rcfAdminAIPrompt");

    if (btnFactory && !btnFactory.__bound) {
      btnFactory.__bound = true;
      btnFactory.addEventListener("click", () => {
        callAdminAI("analyze-architecture", collectFactoryInfo(), "");
      }, { passive: true });
    }

    if (btnLogs && !btnLogs.__bound) {
      btnLogs.__bound = true;
      btnLogs.addEventListener("click", () => {
        callAdminAI("analyze-logs", collectLogs(), "");
      }, { passive: true });
    }

    if (btnSuggest && !btnSuggest.__bound) {
      btnSuggest.__bound = true;
      btnSuggest.addEventListener("click", () => {
        callAdminAI("suggest-improvement", collectFactoryInfo(), "");
      }, { passive: true });
    }

    if (btnSend && !btnSend.__bound) {
      btnSend.__bound = true;
      btnSend.addEventListener("click", () => {
        const prompt = String(promptEl?.value || "").trim();
        if (!prompt) {
          setStatus("aguardando");
          setResult("Digite uma instrução primeiro.");
          return;
        }
        callAdminAI("summarize-structure", collectFactoryInfo(), prompt);
      }, { passive: true });
    }
  }

  function mount() {
    if (document.getElementById(BOX_ID)) return true;

    const slot = getSlot();
    if (!slot) return false;

    const box = document.createElement("div");
    box.id = BOX_ID;
    box.className = "card";
    box.style.marginTop = "12px";
    box.innerHTML = `
      <h2 style="margin-top:0">Admin AI</h2>
      <div class="hint">IA administrativa da Factory. Analisa e sugere. Não executa patch automaticamente.</div>

      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
        <button class="btn ghost" id="rcfAdminAIAnalyzeFactory" type="button">Analisar Factory</button>
        <button class="btn ghost" id="rcfAdminAIAnalyzeLogs" type="button">Analisar Logs</button>
        <button class="btn ghost" id="rcfAdminAISuggest" type="button">Sugerir melhoria</button>
      </div>

      <div style="margin-top:12px">
        <label class="hint" for="rcfAdminAIPrompt">Prompt manual</label>
        <textarea id="rcfAdminAIPrompt"
          placeholder="Ex.: revise a arquitetura da Factory e diga o próximo passo mais seguro"
          style="width:100%;min-height:100px;margin-top:6px;background:#0c1020;color:#eaf0ff;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;box-sizing:border-box"></textarea>
      </div>

      <div class="row" style="margin-top:10px;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn ok" id="rcfAdminAISend" type="button">Enviar</button>
        <div class="badge" id="rcfAdminAIStatus">aguardando</div>
      </div>

      <pre class="mono small" id="rcfAdminAIResult" style="margin-top:10px;max-height:36vh;overflow:auto">Pronto.</pre>
    `;

    slot.appendChild(box);
    bindBox();

    log("OK", "Admin AI mount ✅ " + VERSION);
    return true;
  }

  function mountLoop() {
    if (mount()) return true;
    setTimeout(() => { try { mount(); } catch {} }, 700);
    setTimeout(() => { try { mount(); } catch {} }, 1600);
    return false;
  }

  window.RCF_ADMIN_AI = {
    __v1: true,
    version: VERSION,
    mount
  };

  try {
    window.addEventListener("RCF:UI_READY", () => { try { mountLoop(); } catch {} }, { passive: true });
  } catch {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { try { mountLoop(); } catch {} }, { once: true });
  } else {
    mountLoop();
  }

  log("OK", "admin.admin_ai.js ready ✅ " + VERSION);
})();

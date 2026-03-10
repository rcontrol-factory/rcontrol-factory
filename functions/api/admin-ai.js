/* FILE: /app/js/admin.admin_ai.js
   RControl Factory — Admin AI (Fase IA-1)
   v1.1 CHAT-LITE / PATCH MÍNIMO

   - mantém mount no slot admin.integrations
   - mantém ações rápidas
   - adiciona histórico visual estilo chat-lite
   - permite múltiplas perguntas sem recarregar
   - adiciona botão "Analisar Doctor"
   - usa /api/admin-ai
   - não executa patch automático
   - não mexe no boot
*/

(() => {
  "use strict";

  if (window.RCF_ADMIN_AI && window.RCF_ADMIN_AI.__v11) return;

  const VERSION = "v1.1";
  const BOX_ID = "rcfAdminAIBox";
  const CHAT_ID = "rcfAdminAIChat";
  const STATE = {
    busy: false,
    history: []
  };

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
    let doctorVersion = "unknown";
    let doctorLast = null;
    try {
      doctorVersion = window.RCF_DOCTOR_SCAN?.version || "unknown";
      doctorLast = window.RCF_DOCTOR_SCAN?.lastReport || null;
    } catch {}

    const info = {
      href: location.href,
      runtimeVFS: window.__RCF_VFS_RUNTIME || window.RCF_RUNTIME || "unknown",
      version: window.RCF_VERSION || "unknown",
      hasLogger: !!window.RCF_LOGGER,
      hasDoctor: !!window.RCF_DOCTOR_SCAN,
      hasGitHub: !!window.RCF_GH_SYNC,
      hasVault: !!window.RCF_ZIP_VAULT,
      hasBridge: !!window.RCF_AGENT_ZIP_BRIDGE,
      hasDiagnostics: !!window.RCF_DIAGNOSTICS,
      hasAdminAIBackend: true,
      doctorVersion,
      doctorLast,
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

  function collectDoctorReport() {
    try {
      if (window.RCF_DOCTOR_SCAN?.lastReport) {
        return window.RCF_DOCTOR_SCAN.lastReport;
      }
    } catch {}
    return {
      note: "Doctor report não encontrado ainda. Rode o Doctor antes.",
      ts: new Date().toISOString()
    };
  }

  function setStatus(txt) {
    const el = document.getElementById("rcfAdminAIStatus");
    if (el) el.textContent = String(txt || "");
  }

  function setResult(txt) {
    const el = document.getElementById("rcfAdminAIResult");
    if (el) el.textContent = String(txt || "");
  }

  function setButtonsBusy(busy) {
    STATE.busy = !!busy;

    const ids = [
      "rcfAdminAIAnalyzeFactory",
      "rcfAdminAIAnalyzeLogs",
      "rcfAdminAISuggest",
      "rcfAdminAIAnalyzeDoctor",
      "rcfAdminAISend",
      "rcfAdminAIClear"
    ];

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !!busy && id !== "rcfAdminAIClear";
    });
  }

  function pushChat(role, text, meta) {
    STATE.history.push({
      role: String(role || "system"),
      text: String(text || ""),
      meta: meta || null,
      ts: new Date().toISOString()
    });
    renderChat();
  }

  function renderChat() {
    const box = document.getElementById(CHAT_ID);
    if (!box) return;

    if (!STATE.history.length) {
      box.innerHTML = `
        <div class="hint">
          Conversa vazia. Faça uma pergunta ou use uma ação rápida.
        </div>
      `;
      return;
    }

    box.innerHTML = STATE.history.map(item => {
      const isUser = item.role === "user";
      const bg = isUser ? "rgba(88,166,255,.12)" : "rgba(255,255,255,.05)";
      const border = isUser ? "rgba(88,166,255,.28)" : "rgba(255,255,255,.10)";
      const tag = isUser ? "Você" : "Admin AI";

      return `
        <div style="
          margin-top:10px;
          padding:10px;
          border:1px solid ${border};
          border-radius:10px;
          background:${bg};
        ">
          <div style="font-weight:700;margin-bottom:6px">${esc(tag)}</div>
          <div style="white-space:pre-wrap;word-break:break-word">${esc(item.text)}</div>
          <div class="hint" style="margin-top:6px">${esc(item.ts)}</div>
        </div>
      `;
    }).join("");

    try { box.scrollTop = box.scrollHeight; } catch {}
  }

  function clearChat() {
    STATE.history = [];
    renderChat();
    setStatus("aguardando");
    setResult("Pronto.");
  }

  function getMode() {
    const el = document.getElementById("rcfAdminAIMode");
    return String(el?.value || "summarize-structure");
  }

  function buildPromptFromMode(mode, prompt) {
    const p = String(prompt || "").trim();

    if (p) return p;

    if (mode === "analyze-architecture") {
      return "Analise a arquitetura atual da RControl Factory e diga o próximo passo mais seguro com patch mínimo.";
    }

    if (mode === "analyze-logs") {
      return "Analise os logs recentes da RControl Factory e identifique riscos estruturais ou instabilidades.";
    }

    if (mode === "factory_diagnosis") {
      return "Analise este relatório do Doctor da RControl Factory e proponha o próximo passo mais seguro.";
    }

    if (mode === "suggest-improvement") {
      return "Sugira a próxima melhoria mais segura para a RControl Factory sem quebrar o boot.";
    }

    return "Resuma a estrutura atual da RControl Factory e explique o próximo passo mais seguro.";
  }

  async function callAdminAI(action, payload, prompt) {
    const btnSend = document.getElementById("rcfAdminAISend");

    if (STATE.busy) return;

    setButtonsBusy(true);
    if (btnSend) btnSend.disabled = true;

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
        pushChat("assistant", JSON.stringify(data, null, 2) || "Erro ao chamar /api/admin-ai");
        log("ERR", "falha em /api/admin-ai");
        return;
      }

      setStatus("concluído");
      setResult(data.analysis || JSON.stringify(data, null, 2));
      pushChat("assistant", data.analysis || JSON.stringify(data, null, 2));
      log("OK", "resposta recebida action=" + action);
    } catch (e) {
      const msg = String(e?.message || e || "Erro de rede");
      setStatus("erro");
      setResult(msg);
      pushChat("assistant", msg);
      log("ERR", "erro de rede /api/admin-ai");
    } finally {
      setButtonsBusy(false);
      if (btnSend) btnSend.disabled = false;
    }
  }

  function handleModeAction(mode, customPrompt) {
    const prompt = buildPromptFromMode(mode, customPrompt);

    let payload = collectFactoryInfo();

    if (mode === "analyze-logs") {
      payload = {
        factory: collectFactoryInfo(),
        logs: collectLogs()
      };
    }

    if (mode === "factory_diagnosis") {
      payload = {
        factory: collectFactoryInfo(),
        doctor: collectDoctorReport()
      };
    }

    pushChat("user", prompt);
    callAdminAI(mode, payload, prompt);
  }

  function bindBox() {
    const btnFactory = document.getElementById("rcfAdminAIAnalyzeFactory");
    const btnLogs = document.getElementById("rcfAdminAIAnalyzeLogs");
    const btnSuggest = document.getElementById("rcfAdminAISuggest");
    const btnDoctor = document.getElementById("rcfAdminAIAnalyzeDoctor");
    const btnSend = document.getElementById("rcfAdminAISend");
    const btnClear = document.getElementById("rcfAdminAIClear");
    const promptEl = document.getElementById("rcfAdminAIPrompt");

    if (btnFactory && !btnFactory.__bound) {
      btnFactory.__bound = true;
      btnFactory.addEventListener("click", () => {
        handleModeAction("analyze-architecture", "");
      }, { passive: true });
    }

    if (btnLogs && !btnLogs.__bound) {
      btnLogs.__bound = true;
      btnLogs.addEventListener("click", () => {
        handleModeAction("analyze-logs", "");
      }, { passive: true });
    }

    if (btnSuggest && !btnSuggest.__bound) {
      btnSuggest.__bound = true;
      btnSuggest.addEventListener("click", () => {
        handleModeAction("suggest-improvement", "");
      }, { passive: true });
    }

    if (btnDoctor && !btnDoctor.__bound) {
      btnDoctor.__bound = true;
      btnDoctor.addEventListener("click", () => {
        handleModeAction("factory_diagnosis", "");
      }, { passive: true });
    }

    if (btnSend && !btnSend.__bound) {
      btnSend.__bound = true;
      btnSend.addEventListener("click", () => {
        const mode = getMode();
        const prompt = String(promptEl?.value || "").trim();

        if (!prompt) {
          setStatus("aguardando");
          setResult("Digite uma instrução primeiro.");
          return;
        }

        handleModeAction(mode, prompt);
      }, { passive: true });
    }

    if (btnClear && !btnClear.__bound) {
      btnClear.__bound = true;
      btnClear.addEventListener("click", () => {
        clearChat();
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

      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:center">
        <label class="hint" for="rcfAdminAIMode">Modo</label>
        <select id="rcfAdminAIMode" style="min-width:220px">
          <option value="summarize-structure">Estrutura</option>
          <option value="analyze-architecture">Arquitetura</option>
          <option value="analyze-logs">Logs</option>
          <option value="factory_diagnosis">Doctor</option>
          <option value="suggest-improvement">Melhoria</option>
        </select>
        <button class="btn ghost" id="rcfAdminAIClear" type="button">Limpar conversa</button>
      </div>

      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
        <button class="btn ghost" id="rcfAdminAIAnalyzeFactory" type="button">Analisar Factory</button>
        <button class="btn ghost" id="rcfAdminAIAnalyzeLogs" type="button">Analisar Logs</button>
        <button class="btn ghost" id="rcfAdminAIAnalyzeDoctor" type="button">Analisar Doctor</button>
        <button class="btn ghost" id="rcfAdminAISuggest" type="button">Sugerir melhoria</button>
      </div>

      <div id="${CHAT_ID}" style="
        margin-top:12px;
        max-height:34vh;
        overflow:auto;
        padding:8px;
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.10);
        border-radius:10px;
      "></div>

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

      <pre class="mono small" id="rcfAdminAIResult" style="margin-top:10px;max-height:24vh;overflow:auto">Pronto.</pre>
    `;

    slot.appendChild(box);
    bindBox();
    renderChat();

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
    __v11: true,
    version: VERSION,
    mount,
    clearChat
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

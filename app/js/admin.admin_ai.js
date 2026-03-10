/* FILE: /app/js/admin.admin_ai.js
   RControl Factory — Admin AI (Fase IA-1)
   v1.3 ADMIN-FIXED + CHAT-LITE + CONTEXT-RICH

   - fixo no Admin
   - não aparece solto em outras views
   - histórico visual tipo chat-lite
   - múltiplas perguntas sem reload
   - ações rápidas + doctor + patch + gerar código
   - usa /api/admin-ai
   - consome melhor RCF_CONTEXT
   - não executa patch automático
*/

(() => {
  "use strict";

  if (window.RCF_ADMIN_AI && window.RCF_ADMIN_AI.__v13) return;

  const VERSION = "v1.3";
  const BOX_ID = "rcfAdminAIBox";
  const CHAT_ID = "rcfAdminAIChat";

  const STATE = {
    busy: false,
    history: []
  };

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, "[ADMIN_AI] " + msg); } catch (_) {}
    try { console.log("[ADMIN_AI]", level, msg); } catch (_) {}
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
    }[c]));
  }

  function isAdminViewVisible() {
    try {
      const activeView =
        document.querySelector(".view.active") ||
        document.querySelector("[data-rcf-view].active");

      if (!activeView) return false;

      const id =
        activeView.id ||
        activeView.getAttribute("data-rcf-view") ||
        "";

      return /admin/i.test(id);
    } catch (_) {}

    return false;
  }

  function getSlot() {
    try {
      const ui = window.RCF_UI;
      if (ui && typeof ui.getSlot === "function") {
        const slot = ui.getSlot("admin.integrations");
        if (slot) return slot;
      }
    } catch (_) {}

    return (
      document.getElementById("rcfAdminSlotIntegrations") ||
      document.querySelector('[data-rcf-slot="admin.integrations"]') ||
      document.querySelector('#view-admin .integrations') ||
      document.querySelector('#view-admin') ||
      document.querySelector('[data-rcf-view="admin"]')
    );
  }

  function syncVisibility() {
    const box = document.getElementById(BOX_ID);
    if (!box) return;
    box.style.display = isAdminViewVisible() ? "" : "none";
  }

  function collectLogs(limit = 120) {
    try {
      const logger = window.RCF_LOGGER;
      if (logger && Array.isArray(logger.items)) {
        return logger.items.slice(-limit);
      }
    } catch (_) {}
    return [];
  }

  function collectDoctorReport() {
    try {
      if (window.RCF_FACTORY_STATE?.getState?.().doctorLastRun) {
        return window.RCF_FACTORY_STATE.getState().doctorLastRun;
      }
    } catch (_) {}

    try {
      if (window.RCF_DOCTOR_SCAN?.lastReport) {
        return window.RCF_DOCTOR_SCAN.lastReport;
      }
    } catch (_) {}

    return {
      note: "Doctor report não encontrado ainda. Rode o Doctor antes.",
      ts: new Date().toISOString()
    };
  }

  function collectContext() {
    try {
      if (window.RCF_CONTEXT && typeof window.RCF_CONTEXT.getContext === "function") {
        return window.RCF_CONTEXT.getContext();
      }
    } catch (_) {}
    return {
      fallback: true,
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
      "rcfAdminAIAnalyzeDoctor",
      "rcfAdminAISuggest",
      "rcfAdminAIProposePatch",
      "rcfAdminAIGenerateCode",
      "rcfAdminAISend",
      "rcfAdminAIClear"
    ];

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !!busy && id !== "rcfAdminAIClear";
    });
  }

  function pushChat(role, text) {
    STATE.history.push({
      role: String(role || "system"),
      text: String(text || ""),
      ts: new Date().toISOString()
    });
    renderChat();
  }

  function renderChat() {
    const box = document.getElementById(CHAT_ID);
    if (!box) return;

    if (!STATE.history.length) {
      box.innerHTML = `<div class="hint">Conversa vazia. Faça uma pergunta ou use uma ação rápida.</div>`;
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

    try { box.scrollTop = box.scrollHeight; } catch (_) {}
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
      return "Analise os logs recentes da RControl Factory e identifique riscos estruturais, erros ou instabilidades.";
    }
    if (mode === "factory_diagnosis") {
      return "Analise este relatório do Doctor da RControl Factory e proponha o próximo passo mais seguro.";
    }
    if (mode === "suggest-improvement") {
      return "Sugira a próxima melhoria mais segura para a RControl Factory sem quebrar o boot.";
    }
    if (mode === "propose-patch") {
      return "Proponha um patch mínimo e seguro para a RControl Factory, preservando o que já está estável.";
    }
    if (mode === "generate-code") {
      return "Gere código com patch mínimo para a RControl Factory, sem reescrever a plataforma do zero.";
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
        const msg = JSON.stringify(data, null, 2) || "Erro ao chamar /api/admin-ai";
        setStatus("erro");
        setResult(msg);
        pushChat("assistant", msg);
        log("ERR", "falha em /api/admin-ai");
        return;
      }

      const text = data.analysis || JSON.stringify(data, null, 2);

      setStatus("concluído");
      setResult(text);
      pushChat("assistant", text);
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

    let payload = {
      context: collectContext()
    };

    if (mode === "analyze-logs") {
      payload = {
        context: collectContext(),
        logs: collectLogs()
      };
    }

    if (mode === "factory_diagnosis") {
      payload = {
        context: collectContext(),
        doctor: collectDoctorReport()
      };
    }

    if (mode === "propose-patch" || mode === "generate-code") {
      payload = {
        context: collectContext(),
        logs: collectLogs(80),
        doctor: collectDoctorReport()
      };
    }

    pushChat("user", prompt);
    callAdminAI(mode, payload, prompt);
  }

  function bindBox() {
    const btnFactory = document.getElementById("rcfAdminAIAnalyzeFactory");
    const btnLogs = document.getElementById("rcfAdminAIAnalyzeLogs");
    const btnDoctor = document.getElementById("rcfAdminAIAnalyzeDoctor");
    const btnSuggest = document.getElementById("rcfAdminAISuggest");
    const btnPatch = document.getElementById("rcfAdminAIProposePatch");
    const btnCode = document.getElementById("rcfAdminAIGenerateCode");
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

    if (btnDoctor && !btnDoctor.__bound) {
      btnDoctor.__bound = true;
      btnDoctor.addEventListener("click", () => {
        handleModeAction("factory_diagnosis", "");
      }, { passive: true });
    }

    if (btnSuggest && !btnSuggest.__bound) {
      btnSuggest.__bound = true;
      btnSuggest.addEventListener("click", () => {
        handleModeAction("suggest-improvement", "");
      }, { passive: true });
    }

    if (btnPatch && !btnPatch.__bound) {
      btnPatch.__bound = true;
      btnPatch.addEventListener("click", () => {
        handleModeAction("propose-patch", "");
      }, { passive: true });
    }

    if (btnCode && !btnCode.__bound) {
      btnCode.__bound = true;
      btnCode.addEventListener("click", () => {
        handleModeAction("generate-code", "");
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
    if (document.getElementById(BOX_ID)) {
      syncVisibility();
      return true;
    }

    const slot = getSlot();
    if (!slot) return false;

    const box = document.createElement("div");
    box.id = BOX_ID;
    box.className = "card";
    box.style.marginTop = "12px";
    box.innerHTML = `
      <h2 style="margin-top:0">Admin AI</h2>
      <div class="hint">IA administrativa da Factory. Analisa, sugere, propõe patch e pode gerar código. Não executa nada automaticamente.</div>

      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:center">
        <label class="hint" for="rcfAdminAIMode">Modo</label>
        <select id="rcfAdminAIMode" style="min-width:220px">
          <option value="summarize-structure">Estrutura</option>
          <option value="analyze-architecture">Arquitetura</option>
          <option value="analyze-logs">Logs</option>
          <option value="factory_diagnosis">Doctor</option>
          <option value="suggest-improvement">Melhoria</option>
          <option value="propose-patch">Propor patch</option>
          <option value="generate-code">Gerar código</option>
        </select>
        <button class="btn ghost" id="rcfAdminAIClear" type="button">Limpar conversa</button>
      </div>

      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
        <button class="btn ghost" id="rcfAdminAIAnalyzeFactory" type="button">Analisar Factory</button>
        <button class="btn ghost" id="rcfAdminAIAnalyzeLogs" type="button">Analisar Logs</button>
        <button class="btn ghost" id="rcfAdminAIAnalyzeDoctor" type="button">Analisar Doctor</button>
        <button class="btn ghost" id="rcfAdminAISuggest" type="button">Sugerir melhoria</button>
        <button class="btn ghost" id="rcfAdminAIProposePatch" type="button">Propor Patch</button>
        <button class="btn ghost" id="rcfAdminAIGenerateCode" type="button">Gerar Código</button>
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
          placeholder="Ex.: proponha um patch mínimo para corrigir X sem quebrar o boot"
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
    syncVisibility();

    log("OK", "Admin AI mount ✅ " + VERSION);
    return true;
  }

  function mountLoop() {
    if (mount()) return true;
    setTimeout(() => { try { mount(); } catch (_) {} }, 700);
    setTimeout(() => { try { mount(); } catch (_) {} }, 1600);
    return false;
  }

  function startVisibilitySync() {
    setInterval(syncVisibility, 500);
    try {
      document.addEventListener("click", () => {
        setTimeout(syncVisibility, 50);
        setTimeout(syncVisibility, 250);
      }, { passive: true });
    } catch (_) {}
  }

  window.RCF_ADMIN_AI = {
    __v1: true,
    __v11: true,
    __v12: true,
    __v13: true,
    version: VERSION,
    mount,
    clearChat
  };

  try {
    window.addEventListener("RCF:UI_READY", () => { try { mountLoop(); } catch (_) {} }, { passive: true });
  } catch (_) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try { mountLoop(); } catch (_) {}
      try { startVisibilitySync(); } catch (_) {}
    }, { once: true });
  } else {
    mountLoop();
    startVisibilitySync();
  }

  log("OK", "admin.admin_ai.js ready ✅ " + VERSION);
})();

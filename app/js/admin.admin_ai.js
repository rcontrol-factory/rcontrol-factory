/* FILE: /app/js/admin.admin_ai.js
   RControl Factory — Factory AI
   v2.2 FACTORY-IA HARD MOUNT + VISIBLE CHAT

   - evolui Admin AI antigo para Factory AI
   - força mount no slot oficial factoryai.tools
   - move a box automaticamente do fallback para o slot oficial
   - visibilidade baseada na view real visível, não só em .active
   - fallback seguro para Admin se a view nova ainda não estiver pronta
   - histórico visual tipo chat-lite
   - múltiplas perguntas sem reload
   - ações rápidas + doctor + patch + gerar código
   - tenta /api/factory-ai com fallback para /api/admin-ai
   - consome snapshot estrutural refinado
   - mostra preview do snapshot enviado
   - não executa patch automático
*/
(() => {
  "use strict";

  if (window.RCF_FACTORY_AI && window.RCF_FACTORY_AI.__v22) return;

  const VERSION = "v2.2";
  const BOX_ID = "rcfFactoryAIBox";
  const CHAT_ID = "rcfFactoryAIChat";
  const ACTIONS_ID = "rcfFactoryAIQuickActions";

  const STATE = {
    busy: false,
    history: [],
    mountedIn: "",
    lastEndpoint: ""
  };

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, "[FACTORY_AI] " + msg); } catch (_) {}
    try { console.log("[FACTORY_AI]", level, msg); } catch (_) {}
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
    }[c]));
  }

  function pretty(obj) {
    try { return JSON.stringify(obj, null, 2); }
    catch (_) { return String(obj || ""); }
  }

  function normalizeViewId(id) {
    return String(id || "").trim().toLowerCase();
  }

  function isElementVisible(el) {
    try {
      if (!el) return false;
      if (el.hidden) return false;
      const cs = window.getComputedStyle(el);
      if (!cs) return false;
      if (cs.display === "none") return false;
      if (cs.visibility === "hidden") return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function getFactoryAIView() {
    return (
      document.getElementById("view-factory-ai") ||
      document.querySelector('[data-rcf-view="factory-ai"]') ||
      document.querySelector("#rcfFactoryAIView") ||
      document.querySelector("[data-rcf-factory-ai-view]")
    );
  }

  function getAdminView() {
    return (
      document.getElementById("view-admin") ||
      document.querySelector('[data-rcf-view="admin"]')
    );
  }

  function isFactoryAIViewVisible() {
    try {
      const view = getFactoryAIView();
      if (!view) return false;

      if (view.classList.contains("active")) return true;
      if (view.getAttribute("data-rcf-visible") === "1") return true;
      return isElementVisible(view);
    } catch (_) {
      return false;
    }
  }

  function isAdminViewVisible() {
    try {
      const view = getAdminView();
      if (!view) return false;

      if (view.classList.contains("active")) return true;
      if (view.getAttribute("data-rcf-visible") === "1") return true;
      return isElementVisible(view);
    } catch (_) {
      return false;
    }
  }

  function getPreferredSlots() {
    const out = {
      tools: null,
      actions: null,
      fallback: null
    };

    try {
      const ui = window.RCF_UI;
      if (ui && typeof ui.getSlot === "function") {
        out.tools = ui.getSlot("factoryai.tools") || null;
        out.actions = ui.getSlot("factoryai.actions") || null;
        out.fallback =
          ui.getSlot("admin.integrations") ||
          ui.getSlot("admin.top") ||
          null;
      }
    } catch (_) {}

    if (!out.tools) {
      out.tools =
        document.getElementById("rcfFactoryAISlotTools") ||
        document.querySelector('[data-rcf-slot="factoryai.tools"]') ||
        null;
    }

    if (!out.actions) {
      out.actions =
        document.getElementById("rcfFactoryAISlotActions") ||
        document.querySelector('[data-rcf-slot="factoryai.actions"]') ||
        null;
    }

    if (!out.fallback) {
      out.fallback =
        document.getElementById("rcfAdminSlotIntegrations") ||
        document.querySelector('[data-rcf-slot="admin.integrations"]') ||
        document.querySelector("#view-admin .integrations") ||
        document.querySelector("#view-admin") ||
        document.querySelector('[data-rcf-view="admin"]') ||
        null;
    }

    return out;
  }

  function getPrimarySlot() {
    const slots = getPreferredSlots();

    if (slots.tools) {
      STATE.mountedIn = "factoryai.tools";
      return slots.tools;
    }

    if (slots.actions) {
      STATE.mountedIn = "factoryai.actions";
      return slots.actions;
    }

    if (slots.fallback) {
      STATE.mountedIn = "admin.fallback";
      return slots.fallback;
    }

    STATE.mountedIn = "";
    return null;
  }

  function syncVisibility() {
    const box = document.getElementById(BOX_ID);
    const quick = document.getElementById(ACTIONS_ID);

    const showFactory = isFactoryAIViewVisible();
    const showAdminFallback = !showFactory && isAdminViewVisible() && /^admin/.test(STATE.mountedIn || "");

    const visible = !!(showFactory || showAdminFallback);

    try {
      if (box) {
        box.style.display = visible ? "" : "none";
        box.hidden = !visible;
      }
    } catch (_) {}

    try {
      if (quick) {
        quick.style.display = visible ? "" : "none";
        quick.hidden = !visible;
      }
    } catch (_) {}
  }

  function collectLogs(limit = 30) {
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

  function getSnapshotRaw() {
    try {
      if (window.RCF_FACTORY_IA && typeof window.RCF_FACTORY_IA.getContext === "function") {
        return { factoryIA: window.RCF_FACTORY_IA.getContext() };
      }
    } catch (_) {}

    try {
      if (window.RCF_CONTEXT && typeof window.RCF_CONTEXT.getSnapshot === "function") {
        return window.RCF_CONTEXT.getSnapshot();
      }
      if (window.RCF_CONTEXT && typeof window.RCF_CONTEXT.getContext === "function") {
        return window.RCF_CONTEXT.getContext();
      }
    } catch (_) {}

    return null;
  }

  function buildLeanSnapshot() {
    const raw = getSnapshotRaw() || {};
    const factory = raw.factory || {};
    const modules = raw.modules || {};
    const doctor = raw.doctor || {};
    const environment = raw.environment || {};
    const tree = raw.tree || {};
    const state = window.RCF?.state || {};

    return {
      factory: {
        version: factory.version || "unknown",
        bootStatus: factory.bootStatus || "unknown",
        runtimeVFS: factory.runtimeVFS || "unknown",
        loggerReady: !!factory.loggerReady,
        doctorReady: !!factory.doctorReady,
        environment: factory.environment || "unknown",
        lastUpdate: factory.lastUpdate || null,
        mountedAs: "Factory AI",
        activeView: state?.active?.view || "",
        activeAppSlug: state?.active?.appSlug || ""
      },
      doctor: {
        version: doctor.version || "unknown",
        lastRun: doctor.lastRun || null
      },
      modules: {
        active: Array.isArray(modules.active) ? modules.active : [],
        status: {
          logger: !!modules.logger,
          doctor: !!modules.doctor,
          github: !!modules.github,
          vault: !!modules.vault,
          bridge: !!modules.bridge,
          adminAI: !!modules.adminAI,
          factoryAI: true,
          factoryState: !!modules.factoryState,
          moduleRegistry: !!modules.moduleRegistry,
          contextEngine: !!modules.contextEngine
        }
      },
      tree: {
        pathsCount: Number(tree.pathsCount || 0),
        summary: tree.summary || {},
        samples: Array.isArray(tree.samples) ? tree.samples.slice(0, 12) : []
      },
      flags: {
        hasLogger: !!factory.flags?.hasLogger,
        hasDoctor: !!factory.flags?.hasDoctor,
        hasGitHub: !!factory.flags?.hasGitHub,
        hasFactoryAI: true,
        hasFactoryState: !!factory.flags?.hasFactoryState,
        hasModuleRegistry: !!factory.flags?.hasModuleRegistry,
        hasContextEngine: !!factory.flags?.hasContextEngine,
        hasFactoryTree: !!factory.flags?.hasFactoryTree
      },
      environment: {
        platform: environment.platform || navigator.platform || "",
        language: environment.language || navigator.language || "",
        ts: environment.ts || new Date().toISOString()
      }
    };
  }

  function setStatus(txt) {
    const el = document.getElementById("rcfFactoryAIStatus");
    if (el) el.textContent = String(txt || "");
  }

  function setResult(txt) {
    const el = document.getElementById("rcfFactoryAIResult");
    if (el) el.textContent = String(txt || "");
  }

  function setSnapshotPreview(obj) {
    const el = document.getElementById("rcfFactoryAISnapshot");
    if (!el) return;
    el.textContent = pretty(obj || {});
  }

  function setButtonsBusy(busy) {
    STATE.busy = !!busy;

    const ids = [
      "rcfFactoryAIAnalyzeFactory",
      "rcfFactoryAIAnalyzeLogs",
      "rcfFactoryAIAnalyzeDoctor",
      "rcfFactoryAISuggest",
      "rcfFactoryAIProposePatch",
      "rcfFactoryAIGenerateCode",
      "rcfFactoryAISend",
      "rcfFactoryAIClear",
      "rcfFactoryAIQuickAnalyze",
      "rcfFactoryAIQuickPatch",
      "rcfFactoryAIQuickCode"
    ];

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !!busy && !/Clear/.test(id);
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
      const tag = isUser ? "Você" : "Factory IA";

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
    setSnapshotPreview({});
  }

  function getMode() {
    const el = document.getElementById("rcfFactoryAIMode");
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
    if (mode === "zip-readiness") {
      return "Explique como a Factory deve estruturar leitura de ZIP de forma segura e modular sem quebrar a arquitetura atual.";
    }

    return "Resuma a estrutura atual da RControl Factory e explique o próximo passo mais seguro.";
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function callFactoryAI(action, payload, prompt) {
    const btnSend = document.getElementById("rcfFactoryAISend");

    if (STATE.busy) return;

    setButtonsBusy(true);
    if (btnSend) btnSend.disabled = true;

    setStatus("carregando...");
    setResult("");

    const body = {
      action,
      payload,
      prompt,
      source: "factory-ai",
      version: VERSION
    };

    try {
      let result = null;
      let endpoint = "";

      try {
        result = await postJSON("/api/factory-ai", body);
        endpoint = "/api/factory-ai";
      } catch (_) {
        result = null;
      }

      if (!result || !result.res || (!result.res.ok && !result.data?.ok)) {
        result = await postJSON("/api/admin-ai", body);
        endpoint = "/api/admin-ai";
      }

      STATE.lastEndpoint = endpoint;

      const { res, data } = result;

      if (!res.ok || !data.ok) {
        const msg = pretty(data || { error: "Erro ao chamar endpoint IA" });
        setStatus("erro");
        setResult(msg);
        pushChat("assistant", msg);
        log("ERR", "falha IA endpoint=" + endpoint);
        return;
      }

      const text =
        data.analysis ||
        data.answer ||
        data.result ||
        pretty(data);

      setStatus("concluído");
      setResult(text);
      pushChat("assistant", text);
      log("OK", "resposta recebida action=" + action + " endpoint=" + endpoint);
    } catch (e) {
      const msg = String(e?.message || e || "Erro de rede");
      setStatus("erro");
      setResult(msg);
      pushChat("assistant", msg);
      log("ERR", "erro de rede IA");
    } finally {
      setButtonsBusy(false);
      if (btnSend) btnSend.disabled = false;
    }
  }

  function buildPayload(mode) {
    const snapshot = buildLeanSnapshot();
    setSnapshotPreview(snapshot);

    if (mode === "analyze-logs") {
      return {
        snapshot,
        logs: collectLogs()
      };
    }

    if (mode === "factory_diagnosis") {
      return {
        snapshot,
        doctor: collectDoctorReport()
      };
    }

    if (mode === "propose-patch" || mode === "generate-code") {
      return {
        snapshot,
        doctor: collectDoctorReport(),
        logs: collectLogs(25)
      };
    }

    if (mode === "zip-readiness") {
      return {
        snapshot,
        doctor: collectDoctorReport(),
        capability: {
          wantsZipFlow: true,
          currentPhase: "factory-ia-structure"
        }
      };
    }

    return { snapshot };
  }

  function handleModeAction(mode, customPrompt) {
    const prompt = buildPromptFromMode(mode, customPrompt);
    const payload = buildPayload(mode);

    pushChat("user", prompt);
    callFactoryAI(mode, payload, prompt);
  }

  function bindBox() {
    const btnFactory = document.getElementById("rcfFactoryAIAnalyzeFactory");
    const btnLogs = document.getElementById("rcfFactoryAIAnalyzeLogs");
    const btnDoctor = document.getElementById("rcfFactoryAIAnalyzeDoctor");
    const btnSuggest = document.getElementById("rcfFactoryAISuggest");
    const btnPatch = document.getElementById("rcfFactoryAIProposePatch");
    const btnCode = document.getElementById("rcfFactoryAIGenerateCode");
    const btnSend = document.getElementById("rcfFactoryAISend");
    const btnClear = document.getElementById("rcfFactoryAIClear");
    const btnQuickAnalyze = document.getElementById("rcfFactoryAIQuickAnalyze");
    const btnQuickPatch = document.getElementById("rcfFactoryAIQuickPatch");
    const btnQuickCode = document.getElementById("rcfFactoryAIQuickCode");
    const promptEl = document.getElementById("rcfFactoryAIPrompt");

    if (btnFactory && !btnFactory.__bound) {
      btnFactory.__bound = true;
      btnFactory.addEventListener("click", () => handleModeAction("analyze-architecture", ""), { passive: true });
    }

    if (btnLogs && !btnLogs.__bound) {
      btnLogs.__bound = true;
      btnLogs.addEventListener("click", () => handleModeAction("analyze-logs", ""), { passive: true });
    }

    if (btnDoctor && !btnDoctor.__bound) {
      btnDoctor.__bound = true;
      btnDoctor.addEventListener("click", () => handleModeAction("factory_diagnosis", ""), { passive: true });
    }

    if (btnSuggest && !btnSuggest.__bound) {
      btnSuggest.__bound = true;
      btnSuggest.addEventListener("click", () => handleModeAction("suggest-improvement", ""), { passive: true });
    }

    if (btnPatch && !btnPatch.__bound) {
      btnPatch.__bound = true;
      btnPatch.addEventListener("click", () => handleModeAction("propose-patch", ""), { passive: true });
    }

    if (btnCode && !btnCode.__bound) {
      btnCode.__bound = true;
      btnCode.addEventListener("click", () => handleModeAction("generate-code", ""), { passive: true });
    }

    if (btnQuickAnalyze && !btnQuickAnalyze.__bound) {
      btnQuickAnalyze.__bound = true;
      btnQuickAnalyze.addEventListener("click", () => handleModeAction("analyze-architecture", ""), { passive: true });
    }

    if (btnQuickPatch && !btnQuickPatch.__bound) {
      btnQuickPatch.__bound = true;
      btnQuickPatch.addEventListener("click", () => handleModeAction("propose-patch", ""), { passive: true });
    }

    if (btnQuickCode && !btnQuickCode.__bound) {
      btnQuickCode.__bound = true;
      btnQuickCode.addEventListener("click", () => handleModeAction("generate-code", ""), { passive: true });
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
      btnClear.addEventListener("click", () => clearChat(), { passive: true });
    }
  }

  function buildQuickActionsHtml() {
    return `
      <div style="display:grid;gap:10px">
        <div class="hint">Ações rápidas da Factory IA</div>
        <div style="display:grid;grid-template-columns:1fr;gap:8px">
          <button class="btn ghost" id="rcfFactoryAIQuickAnalyze" type="button">Analisar estrutura</button>
          <button class="btn ghost" id="rcfFactoryAIQuickPatch" type="button">Propor patch</button>
          <button class="btn ghost" id="rcfFactoryAIQuickCode" type="button">Gerar código</button>
        </div>
      </div>
    `;
  }

  function buildBoxHtml() {
    return `
      <h2 style="margin-top:0">Factory IA</h2>
      <div class="hint">IA oficial da Factory. Analisa, sugere, propõe patch e pode gerar código. Não executa nada automaticamente.</div>

      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:center">
        <label class="hint" for="rcfFactoryAIMode">Modo</label>
        <select id="rcfFactoryAIMode" style="min-width:220px">
          <option value="summarize-structure">Estrutura</option>
          <option value="analyze-architecture">Arquitetura</option>
          <option value="analyze-logs">Logs</option>
          <option value="factory_diagnosis">Doctor</option>
          <option value="suggest-improvement">Melhoria</option>
          <option value="propose-patch">Propor patch</option>
          <option value="generate-code">Gerar código</option>
          <option value="zip-readiness">Preparar ZIP</option>
        </select>
        <button class="btn ghost" id="rcfFactoryAIClear" type="button">Limpar conversa</button>
      </div>

      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
        <button class="btn ghost" id="rcfFactoryAIAnalyzeFactory" type="button">Analisar Factory</button>
        <button class="btn ghost" id="rcfFactoryAIAnalyzeLogs" type="button">Analisar Logs</button>
        <button class="btn ghost" id="rcfFactoryAIAnalyzeDoctor" type="button">Analisar Doctor</button>
        <button class="btn ghost" id="rcfFactoryAISuggest" type="button">Sugerir melhoria</button>
        <button class="btn ghost" id="rcfFactoryAIProposePatch" type="button">Propor Patch</button>
        <button class="btn ghost" id="rcfFactoryAIGenerateCode" type="button">Gerar Código</button>
      </div>

      <div id="${CHAT_ID}" style="
        margin-top:12px;
        max-height:30vh;
        overflow:auto;
        padding:8px;
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.10);
        border-radius:10px;
      "></div>

      <div style="margin-top:12px">
        <label class="hint">Snapshot Preview enviado</label>
        <pre class="mono small" id="rcfFactoryAISnapshot" style="margin-top:6px;max-height:18vh;overflow:auto">{"status":"aguardando"}</pre>
      </div>

      <div style="margin-top:12px">
        <label class="hint" for="rcfFactoryAIPrompt">Prompt manual</label>
        <textarea id="rcfFactoryAIPrompt"
          placeholder="Ex.: proponha um patch mínimo para corrigir X sem quebrar o boot"
          style="width:100%;min-height:100px;margin-top:6px;background:#0c1020;color:#eaf0ff;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;box-sizing:border-box"></textarea>
      </div>

      <div class="row" style="margin-top:10px;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn ok" id="rcfFactoryAISend" type="button">Enviar</button>
        <div class="badge" id="rcfFactoryAIStatus">aguardando</div>
      </div>

      <pre class="mono small" id="rcfFactoryAIResult" style="margin-top:10px;max-height:24vh;overflow:auto">Pronto.</pre>
    `;
  }

  function ensureQuickActionsBox(actionsSlot) {
    if (!actionsSlot) return null;

    let box = document.getElementById(ACTIONS_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = ACTIONS_ID;
      box.className = "card";
      box.style.marginTop = "12px";
      box.innerHTML = buildQuickActionsHtml();
      actionsSlot.appendChild(box);
    } else if (box.parentNode !== actionsSlot) {
      actionsSlot.appendChild(box);
    }

    return box;
  }

  function ensureMainBox(primarySlot) {
    let box = document.getElementById(BOX_ID);
    if (!primarySlot) return null;

    if (!box) {
      box = document.createElement("div");
      box.id = BOX_ID;
      box.className = "card";
      box.style.marginTop = "12px";
      box.setAttribute("data-rcf-factory-ai", "1");
      box.innerHTML = buildBoxHtml();
      primarySlot.appendChild(box);
      bindBox();
      renderChat();
    } else if (box.parentNode !== primarySlot) {
      primarySlot.appendChild(box);
      bindBox();
      renderChat();
    }

    return box;
  }

  function mount() {
    const slots = getPreferredSlots();
    const primary = slots.tools || slots.actions || slots.fallback || null;
    if (!primary) return false;

    if (slots.tools) STATE.mountedIn = "factoryai.tools";
    else if (slots.actions) STATE.mountedIn = "factoryai.actions";
    else STATE.mountedIn = "admin.fallback";

    const mainBox = ensureMainBox(primary);
    if (!mainBox) return false;

    if (slots.actions) {
      ensureQuickActionsBox(slots.actions);
    }

    bindBox();
    renderChat();
    syncVisibility();

    log("OK", "Factory IA mount ✅ " + VERSION + " @ " + (STATE.mountedIn || "unknown"));
    return true;
  }

  function mountLoop() {
    if (mount()) return true;
    setTimeout(() => { try { mount(); } catch (_) {} }, 700);
    setTimeout(() => { try { mount(); } catch (_) {} }, 1600);
    setTimeout(() => { try { mount(); } catch (_) {} }, 2800);
    return false;
  }

  function startVisibilitySync() {
    setInterval(() => {
      try { mount(); } catch (_) {}
      try { syncVisibility(); } catch (_) {}
    }, 900);

    try {
      document.addEventListener("click", () => {
        setTimeout(() => { try { mount(); } catch (_) {} }, 50);
        setTimeout(() => { try { syncVisibility(); } catch (_) {} }, 50);
        setTimeout(() => { try { mount(); } catch (_) {} }, 250);
        setTimeout(() => { try { syncVisibility(); } catch (_) {} }, 250);
      }, { passive: true });
    } catch (_) {}
  }

  window.RCF_FACTORY_AI = {
    __v22: true,
    version: VERSION,
    mount,
    clearChat,
    getHistory() { return Array.isArray(STATE.history) ? STATE.history.slice() : []; },
    getLastEndpoint() { return STATE.lastEndpoint || ""; }
  };

  window.RCF_ADMIN_AI = Object.assign(window.RCF_ADMIN_AI || {}, {
    __v22_bridge: true,
    version: VERSION,
    mount,
    clearChat
  });

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

  log("OK", "admin.admin_ai.js -> Factory IA ready ✅ " + VERSION);
})();

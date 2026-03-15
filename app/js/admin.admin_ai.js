/* FILE: /app/js/admin.admin_ai.js
   RControl Factory — Factory AI
   v3.1 CHAT-ONLY CLEAN

   - Factory AI em modo chat-only real
   - remove cards internos duplicados
   - remove sugestões visuais e painel técnico da interface principal
   - mantém inferência automática por linguagem natural
   - tenta /api/factory-ai com fallback para /api/admin-ai
   - mantém snapshot estrutural interno/discreto
   - mantém mount oficial em factoryai.tools
   - fallback seguro para admin se necessário
   - preparado para crescer depois para ZIP / PDF / imagem / arquivos
   - não executa patch automático
*/

(() => {
  "use strict";

  if (window.RCF_FACTORY_AI && window.RCF_FACTORY_AI.__v31) return;

  const VERSION = "v3.1";
  const BOX_ID = "rcfFactoryAIBox";
  const CHAT_ID = "rcfFactoryAIChat";

  const STATE = {
    busy: false,
    history: [],
    mountedIn: "",
    lastEndpoint: "",
    bootedAt: new Date().toISOString(),
    lastSnapshot: null,
    lastTechResult: "Pronto."
  };

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, "[FACTORY_AI] " + msg); } catch (_) {}
    try { console.log("[FACTORY_AI]", level, msg); } catch (_) {}
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[c]));
  }

  function pretty(obj) {
    try { return JSON.stringify(obj, null, 2); }
    catch (_) { return String(obj || ""); }
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
      fallback: null
    };

    try {
      const ui = window.RCF_UI;
      if (ui && typeof ui.getSlot === "function") {
        out.tools = ui.getSlot("factoryai.tools") || null;
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

  function syncVisibility() {
    const box = document.getElementById(BOX_ID);
    if (!box) return;

    const showFactory = isFactoryAIViewVisible();
    const showAdminFallback = !showFactory && isAdminViewVisible() && /^admin/.test(STATE.mountedIn || "");
    const visible = !!(showFactory || showAdminFallback);

    try {
      box.style.display = visible ? "" : "none";
      box.hidden = !visible;
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
        activeAppSlug: state?.active?.appSlug || "",
        bootedAt: STATE.bootedAt
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
    const el = document.getElementById("rcfFactoryAIComposerStatus");
    if (el) el.textContent = String(txt || "");
  }

  function setTechResult(txt) {
    STATE.lastTechResult = String(txt || "");
  }

  function pushChat(role, text, meta = {}) {
    STATE.history.push({
      role: String(role || "system"),
      text: String(text || ""),
      ts: new Date().toISOString(),
      meta: meta || {}
    });
    renderChat();
  }

  function ensureSeedMessage() {
    if (STATE.history.length) return;
    pushChat(
      "assistant",
      "Factory AI online. Pode falar normalmente comigo sobre arquitetura, bugs, patch, código, logs, doctor, layout, design, ZIP, PDF, imagem e contexto da Factory.",
      { seed: true }
    );
  }

  function renderChat() {
    const box = document.getElementById(CHAT_ID);
    if (!box) return;

    ensureSeedMessage();

    box.innerHTML = STATE.history.map(item => {
      const isUser = item.role === "user";
      const wrapAlign = isUser ? "justify-content:flex-end;" : "justify-content:flex-start;";
      const bg = isUser ? "rgba(88,166,255,.12)" : "rgba(255,255,255,.78)";
      const border = isUser ? "rgba(88,166,255,.18)" : "rgba(31,41,55,.08)";
      const tag = isUser ? "Você" : "Factory AI";

      return `
        <div style="display:flex;${wrapAlign}margin-top:10px;">
          <div style="
            width:min(100%, 620px);
            padding:14px;
            border:1px solid ${border};
            border-radius:18px;
            background:${bg};
            box-shadow:0 2px 10px rgba(15,23,42,.04);
          ">
            <div style="font-weight:800;margin-bottom:6px">${esc(tag)}</div>
            <div style="white-space:pre-wrap;word-break:break-word;line-height:1.48">${esc(item.text)}</div>
            <div style="margin-top:8px;font-size:11px;opacity:.60">${esc(item.ts)}</div>
          </div>
        </div>
      `;
    }).join("");

    try { box.scrollTop = box.scrollHeight; } catch (_) {}
  }

  function clearChat() {
    STATE.history = [];
    ensureSeedMessage();
    renderChat();
    setStatus("aguardando");
    setTechResult("Pronto.");
  }

  function inferActionFromPrompt(prompt) {
    const p = String(prompt || "").trim().toLowerCase();

    if (!p) return { action: "summarize-structure", label: "Estrutura" };

    if (
      p.includes("log") ||
      p.includes("erro") ||
      p.includes("error") ||
      p.includes("falha") ||
      p.includes("crash")
    ) {
      return { action: "analyze-logs", label: "Logs" };
    }

    if (
      p.includes("doctor") ||
      p.includes("diagnóstico") ||
      p.includes("diagnostico") ||
      p.includes("estabilidade") ||
      p.includes("stability")
    ) {
      return { action: "factory_diagnosis", label: "Doctor" };
    }

    if (
      p.includes("patch") ||
      p.includes("corrig") ||
      p.includes("fix") ||
      p.includes("ajust") ||
      p.includes("consert")
    ) {
      return { action: "propose-patch", label: "Patch" };
    }

    if (
      p.includes("gerar código") ||
      p.includes("gerar codigo") ||
      p.includes("gere código") ||
      p.includes("gere codigo") ||
      p.includes("código completo") ||
      p.includes("codigo completo") ||
      p.includes("arquivo completo") ||
      p.includes("code")
    ) {
      return { action: "generate-code", label: "Código" };
    }

    if (
      p.includes("zip") ||
      p.includes("pdf") ||
      p.includes("imagem") ||
      p.includes("foto") ||
      p.includes("arquivo") ||
      p.includes("anexo") ||
      p.includes("vídeo") ||
      p.includes("video")
    ) {
      return { action: "zip-readiness", label: "Arquivos" };
    }

    if (
      p.includes("arquitetura") ||
      p.includes("estrutura") ||
      p.includes("módulo") ||
      p.includes("modulo") ||
      p.includes("organiza") ||
      p.includes("orquestra")
    ) {
      return { action: "analyze-architecture", label: "Arquitetura" };
    }

    return { action: "summarize-structure", label: "Estrutura" };
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

  function buildPayload(action) {
    const snapshot = buildLeanSnapshot();
    STATE.lastSnapshot = snapshot;

    if (action === "analyze-logs") {
      return {
        snapshot,
        logs: collectLogs()
      };
    }

    if (action === "factory_diagnosis") {
      return {
        snapshot,
        doctor: collectDoctorReport()
      };
    }

    if (action === "propose-patch" || action === "generate-code") {
      return {
        snapshot,
        doctor: collectDoctorReport(),
        logs: collectLogs(25)
      };
    }

    if (action === "zip-readiness") {
      return {
        snapshot,
        doctor: collectDoctorReport(),
        capability: {
          wantsZipFlow: true,
          wantsPdfFlow: true,
          wantsImageFlow: true,
          wantsFileFlow: true,
          currentPhase: "factory-ai-chat-only"
        }
      };
    }

    return { snapshot };
  }

  function setButtonsBusy(busy) {
    STATE.busy = !!busy;

    [
      "rcfFactoryAISend",
      "rcfFactoryAIClear"
    ].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === "rcfFactoryAIClear") el.disabled = false;
      else el.disabled = !!busy;
    });

    const input = document.getElementById("rcfFactoryAIPrompt");
    if (input) input.disabled = !!busy;
  }

  async function callFactoryAI(action, payload, prompt) {
    if (STATE.busy) return;

    setButtonsBusy(true);
    setStatus("carregando...");
    setTechResult("");

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
        setTechResult(msg);
        pushChat("assistant", msg, { actionLabel: endpoint || "erro" });
        log("ERR", "falha IA endpoint=" + endpoint);
        return;
      }

      const text =
        data.analysis ||
        data.answer ||
        data.result ||
        pretty(data);

      setStatus("concluído");
      setTechResult(text);
      pushChat("assistant", text, { actionLabel: endpoint || action });
      log("OK", "resposta recebida action=" + action + " endpoint=" + endpoint);
    } catch (e) {
      const msg = String(e?.message || e || "Erro de rede");
      setStatus("erro");
      setTechResult(msg);
      pushChat("assistant", msg, { actionLabel: "rede" });
      log("ERR", "erro de rede IA");
    } finally {
      setButtonsBusy(false);
    }
  }

  function sendPrompt(rawPrompt, forcedAction = "") {
    const prompt = String(rawPrompt || "").trim();
    const input = document.getElementById("rcfFactoryAIPrompt");

    if (!prompt) {
      setStatus("aguardando");
      setTechResult("Digite uma instrução primeiro.");
      return;
    }

    const route = forcedAction
      ? { action: forcedAction, label: forcedAction }
      : inferActionFromPrompt(prompt);

    pushChat("user", prompt, { actionLabel: route.label });
    if (input) input.value = "";
    callFactoryAI(route.action, buildPayload(route.action), prompt);
  }

  function bindBox() {
    const sendBtn = document.getElementById("rcfFactoryAISend");
    const clearBtn = document.getElementById("rcfFactoryAIClear");
    const promptEl = document.getElementById("rcfFactoryAIPrompt");

    if (sendBtn && !sendBtn.__bound) {
      sendBtn.__bound = true;
      sendBtn.addEventListener("click", () => {
        sendPrompt(String(promptEl?.value || "").trim(), "");
      }, { passive: true });
    }

    if (clearBtn && !clearBtn.__bound) {
      clearBtn.__bound = true;
      clearBtn.addEventListener("click", () => clearChat(), { passive: true });
    }

    if (promptEl && !promptEl.__boundEnter) {
      promptEl.__boundEnter = true;
      promptEl.addEventListener("keydown", (ev) => {
        try {
          if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            sendPrompt(String(promptEl.value || "").trim(), "");
          }
        } catch (_) {}
      });
    }
  }

  function buildBoxHtml() {
    return `
      <div style="display:grid;gap:14px">
        <div>
          <h2 style="margin:0">Factory AI</h2>
          <div class="hint" style="margin-top:4px">
            Chat oficial da Factory. Fale normalmente sobre arquitetura, bugs, patch, código, layout, logs, doctor, ZIP, PDF, imagens e contexto.
          </div>
        </div>

        <div id="${CHAT_ID}" style="
          min-height:280px;
          max-height:48vh;
          overflow:auto;
          padding:12px;
          border:1px solid rgba(31,41,55,.08);
          border-radius:18px;
          background:rgba(255,255,255,.56);
        "></div>

        <div style="
          display:grid;
          gap:10px;
          padding:12px;
          border:1px solid rgba(31,41,55,.08);
          border-radius:18px;
          background:rgba(255,255,255,.70);
        ">
          <textarea id="rcfFactoryAIPrompt"
            placeholder="Fale com a Factory AI. Ex.: corrige o módulo da view, gera o arquivo completo, analisa os logs, lê esse contexto, organiza essa arquitetura..."
            style="width:100%;min-height:120px;resize:vertical;padding:12px;border-radius:14px;border:1px solid rgba(31,41,55,.10);box-sizing:border-box;background:#fff;color:#18233f;"></textarea>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div id="rcfFactoryAIComposerStatus" class="hint">aguardando</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn ghost" id="rcfFactoryAIClear" type="button">Limpar</button>
              <button class="btn ok" id="rcfFactoryAISend" type="button">Enviar</button>
            </div>
          </div>

          <div class="hint" style="font-size:12px;opacity:.78">
            Em breve: imagem, ZIP, PDF e arquivos direto no chat.
          </div>
        </div>
      </div>
    `;
  }

  function removeWrongFactoryAICards(slot) {
    try {
      if (!slot) return;

      [
        "#rcfFactoryAIStateMini",
        "#rcfFactoryAIQuickActions",
        '[data-rcf-factory-ai-fallback="actions"]',
        '[data-rcf-factory-ai-fallback="tools"]'
      ].forEach(sel => {
        slot.querySelectorAll(sel).forEach(el => {
          try { el.remove(); } catch (_) {}
        });
      });
    } catch (_) {}
  }

  function ensureMainBox(primarySlot) {
    let box = document.getElementById(BOX_ID);
    if (!primarySlot) return null;

    removeWrongFactoryAICards(primarySlot);

    if (!box) {
      box = document.createElement("div");
      box.id = BOX_ID;
      box.className = "card";
      box.style.marginTop = "12px";
      box.setAttribute("data-rcf-factory-ai", "1");
      box.innerHTML = buildBoxHtml();
      primarySlot.innerHTML = "";
      primarySlot.appendChild(box);
      bindBox();
      renderChat();
    } else if (box.parentNode !== primarySlot) {
      primarySlot.innerHTML = "";
      primarySlot.appendChild(box);
      bindBox();
      renderChat();
    }

    return box;
  }

  function mount() {
    const slots = getPreferredSlots();
    const primary = slots.tools || slots.fallback || null;
    if (!primary) return false;

    if (slots.tools) STATE.mountedIn = "factoryai.tools";
    else STATE.mountedIn = "admin.fallback";

    const mainBox = ensureMainBox(primary);
    if (!mainBox) return false;

    bindBox();
    renderChat();
    syncVisibility();

    log("OK", "Factory AI mount ✅ " + VERSION + " @ " + (STATE.mountedIn || "unknown"));
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
    __v31: true,
    version: VERSION,
    mount,
    clearChat,
    sendPrompt,
    getHistory() { return Array.isArray(STATE.history) ? STATE.history.slice() : []; },
    getLastEndpoint() { return STATE.lastEndpoint || ""; },
    getLastSnapshot() { return STATE.lastSnapshot; },
    getLastTechResult() { return STATE.lastTechResult || ""; }
  };

  window.RCF_ADMIN_AI = Object.assign(window.RCF_ADMIN_AI || {}, {
    __v31_bridge: true,
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

  log("OK", "admin.admin_ai.js -> Factory AI ready ✅ " + VERSION);
})();

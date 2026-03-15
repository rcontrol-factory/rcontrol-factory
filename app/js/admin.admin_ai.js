/* FILE: /app/js/admin.admin_ai.js
   RControl Factory — Factory AI
   v3.4 CHAT CORE OFFICIAL CLEAN

   - Factory AI em modo chat-first real
   - nome oficial padronizado: Factory AI
   - mount preferencial no slot oficial factoryai.tools
   - fallback seguro para admin apenas se necessário
   - remove duplicação visual pesada da tela
   - visual clean mobile-first
   - inferência automática de ação por linguagem natural
   - usa somente actions compatíveis com backend atual
   - tenta /api/factory-ai com fallback para /api/admin-ai
   - contexto técnico discreto em details
   - não executa patch automático
*/

(() => {
  "use strict";

  if (window.RCF_FACTORY_AI && window.RCF_FACTORY_AI.__v34) return;

  const VERSION = "v3.4";
  const BOX_ID = "rcfFactoryAIBox";
  const CHAT_ID = "rcfFactoryAIChat";
  const STYLE_ID = "rcfFactoryAIStyleV34";

  const STATE = {
    busy: false,
    history: [],
    mountedIn: "",
    lastEndpoint: "",
    bootedAt: new Date().toISOString(),
    syncTimer: null
  };

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, "[FACTORY_AI] " + msg); } catch {}
    try { console.log("[FACTORY_AI]", level, msg); } catch {}
  }

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;"
    }[c]));
  }

  function pretty(obj) {
    try { return JSON.stringify(obj, null, 2); }
    catch { return String(obj || ""); }
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {}

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

  function collectLogs(limit = 30) {
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
      if (window.RCF_FACTORY_STATE?.getState?.().doctorLastRun) {
        return window.RCF_FACTORY_STATE.getState().doctorLastRun;
      }
    } catch {}

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

  function getSnapshotRaw() {
    try {
      if (window.RCF_FACTORY_IA && typeof window.RCF_FACTORY_IA.getContext === "function") {
        return { factoryAI: window.RCF_FACTORY_IA.getContext() };
      }
    } catch {}

    try {
      if (window.RCF_CONTEXT && typeof window.RCF_CONTEXT.getSnapshot === "function") {
        return window.RCF_CONTEXT.getSnapshot();
      }
      if (window.RCF_CONTEXT && typeof window.RCF_CONTEXT.getContext === "function") {
        return window.RCF_CONTEXT.getContext();
      }
    } catch {}

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

  function setComposerStatus(txt) {
    const el = document.getElementById("rcfFactoryAIComposerStatus");
    if (el) el.textContent = String(txt || "");
  }

  function setTechResult(txt) {
    const el = document.getElementById("rcfFactoryAITechResult");
    if (el) el.textContent = String(txt || "");
  }

  function setSnapshotPreview(obj) {
    const el = document.getElementById("rcfFactoryAISnapshot");
    if (el) el.textContent = pretty(obj || {});
  }

  function setButtonsBusy(busy) {
    STATE.busy = !!busy;

    const sendBtn = document.getElementById("rcfFactoryAISend");
    const clearBtn = document.getElementById("rcfFactoryAIClear");
    const input = document.getElementById("rcfFactoryAIPrompt");

    if (sendBtn) sendBtn.disabled = !!busy;
    if (clearBtn) clearBtn.disabled = false;
    if (input) input.disabled = !!busy;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
#${BOX_ID}{
  margin-top:12px;
  border:1px solid rgba(31,41,55,.08);
  border-radius:26px;
  background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(248,250,255,.90));
  box-shadow:0 10px 26px rgba(15,23,42,.05);
  overflow:hidden;
}
#${BOX_ID}.card{padding:0;}

#${BOX_ID} .rcfAiShell{
  display:grid;
  grid-template-rows:auto 1fr auto;
  min-height:620px;
}

#${BOX_ID} .rcfAiHead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:18px 18px 14px;
  border-bottom:1px solid rgba(31,41,55,.06);
  background:rgba(255,255,255,.72);
}

#${BOX_ID} .rcfAiHeadLeft{
  min-width:0;
  display:flex;
  align-items:center;
  gap:12px;
}

#${BOX_ID} .rcfAiAvatar{
  width:44px;
  height:44px;
  min-width:44px;
  border-radius:16px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:20px;
  border:1px solid rgba(95,115,155,.12);
  background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(239,244,252,.92));
}

#${BOX_ID} .rcfAiHeadText{
  min-width:0;
}

#${BOX_ID} .rcfAiHeadTitle{
  margin:0;
  font-size:20px;
  line-height:1.05;
  font-weight:900;
  color:#202d4d;
}

#${BOX_ID} .rcfAiHeadSub{
  margin:4px 0 0;
  font-size:13px;
  line-height:1.35;
  color:rgba(32,45,77,.72);
}

#${BOX_ID} .rcfAiPill{
  display:inline-flex;
  align-items:center;
  min-height:32px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid rgba(90,110,150,.12);
  background:rgba(255,255,255,.82);
  font-size:12px;
  font-weight:800;
  color:rgba(32,45,77,.76);
  white-space:nowrap;
}

#${CHAT_ID}{
  min-height:320px;
  max-height:52vh;
  overflow:auto;
  padding:16px;
  background:linear-gradient(180deg,rgba(246,248,252,.72),rgba(250,251,255,.62));
}

#${BOX_ID} .rcfAiMsgRow{
  display:flex;
  gap:10px;
  margin-bottom:12px;
}
#${BOX_ID} .rcfAiMsgRow.user{
  justify-content:flex-end;
}
#${BOX_ID} .rcfAiMsgRow.assistant{
  justify-content:flex-start;
}

#${BOX_ID} .rcfAiBubble{
  width:min(100%, 690px);
  padding:14px 16px;
  border-radius:20px;
  border:1px solid rgba(31,41,55,.08);
  background:rgba(255,255,255,.92);
  box-shadow:0 2px 10px rgba(15,23,42,.04);
}

#${BOX_ID} .rcfAiBubble.userBubble{
  background:linear-gradient(180deg,rgba(112,152,255,.16),rgba(112,152,255,.09));
  border-color:rgba(112,152,255,.20);
}

#${BOX_ID} .rcfAiMsgLabel{
  font-size:12px;
  font-weight:900;
  letter-spacing:.08em;
  text-transform:uppercase;
  opacity:.60;
  margin-bottom:8px;
}

#${BOX_ID} .rcfAiMsgText{
  white-space:pre-wrap;
  word-break:break-word;
  line-height:1.54;
  color:#202d4d;
  font-size:15px;
}

#${BOX_ID} .rcfAiMsgTime{
  margin-top:8px;
  font-size:11px;
  opacity:.56;
}

#${BOX_ID} .rcfAiComposer{
  display:grid;
  gap:10px;
  padding:14px 16px 16px;
  border-top:1px solid rgba(31,41,55,.06);
  background:rgba(255,255,255,.82);
}

#${BOX_ID} .rcfAiInputWrap{
  display:grid;
  grid-template-columns:1fr auto;
  gap:10px;
  align-items:end;
}

#${BOX_ID} .rcfAiPrompt{
  width:100%;
  min-height:86px;
  max-height:180px;
  resize:vertical;
  padding:14px 14px;
  border-radius:18px;
  border:1px solid rgba(31,41,55,.10);
  box-sizing:border-box;
  background:#fff;
  color:#18233f;
  font:inherit;
  line-height:1.45;
}

#${BOX_ID} .rcfAiPrompt:focus{
  outline:none;
  border-color:rgba(112,152,255,.42);
  box-shadow:0 0 0 3px rgba(112,152,255,.10);
}

#${BOX_ID} .rcfAiRightBtns{
  display:grid;
  gap:8px;
}

#${BOX_ID} .rcfAiBtn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:116px;
  min-height:46px;
  padding:10px 14px;
  border-radius:16px;
  border:1px solid rgba(31,41,55,.08);
  background:rgba(255,255,255,.88);
  color:#26407a;
  font-size:15px;
  font-weight:900;
  cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}

#${BOX_ID} .rcfAiBtn.primary{
  background:linear-gradient(180deg, rgba(112,152,255,.18), rgba(112,152,255,.10));
  border-color:rgba(112,152,255,.20);
}

#${BOX_ID} .rcfAiBottom{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}

#${BOX_ID} .rcfAiStatus{
  font-size:13px;
  font-weight:800;
  color:rgba(32,45,77,.80);
}

#${BOX_ID} .rcfAiHint{
  font-size:12px;
  color:rgba(32,45,77,.64);
}

#${BOX_ID} details.rcfAiDetails{
  border:1px solid rgba(31,41,55,.08);
  border-radius:18px;
  background:rgba(255,255,255,.72);
  padding:10px 12px;
}

#${BOX_ID} details.rcfAiDetails summary{
  cursor:pointer;
  font-weight:900;
  color:#202d4d;
}

#${BOX_ID} .rcfAiPre{
  margin-top:6px;
  max-height:18vh;
  overflow:auto;
  white-space:pre-wrap;
  word-break:break-word;
}

@media (max-width: 720px){
  #${BOX_ID} .rcfAiShell{
    min-height:560px;
  }
  #${BOX_ID} .rcfAiHead{
    padding:16px 16px 12px;
  }
  #${BOX_ID} .rcfAiHeadTitle{
    font-size:18px;
  }
  #${BOX_ID} .rcfAiInputWrap{
    grid-template-columns:1fr;
  }
  #${BOX_ID} .rcfAiRightBtns{
    grid-template-columns:1fr 1fr;
  }
  #${BOX_ID} .rcfAiBtn{
    min-width:0;
    width:100%;
  }
}
    `.trim();

    document.head.appendChild(st);
  }

  function pushChat(role, text) {
    STATE.history.push({
      role: String(role || "system"),
      text: String(text || ""),
      ts: new Date().toISOString()
    });
    renderChat();
  }

  function ensureSeedMessage() {
    if (STATE.history.length) return;

    pushChat(
      "assistant",
      "Factory AI online. Pode falar normalmente comigo sobre arquitetura, bugs, patch, código, logs, doctor, layout, design, ZIP, PDF, imagem e contexto da Factory."
    );
  }

  function renderChat() {
    const box = document.getElementById(CHAT_ID);
    if (!box) return;

    ensureSeedMessage();

    box.innerHTML = STATE.history.map((item) => {
      const isUser = item.role === "user";
      return `
        <div class="rcfAiMsgRow ${isUser ? "user" : "assistant"}">
          <div class="rcfAiBubble ${isUser ? "userBubble" : ""}">
            <div class="rcfAiMsgLabel">${isUser ? "Você" : "Factory AI"}</div>
            <div class="rcfAiMsgText">${esc(item.text)}</div>
            <div class="rcfAiMsgTime">${esc(item.ts)}</div>
          </div>
        </div>
      `;
    }).join("");

    try { box.scrollTop = box.scrollHeight; } catch {}
  }

  function clearChat() {
    STATE.history = [];
    ensureSeedMessage();
    renderChat();
    setComposerStatus("aguardando");
    setTechResult("Pronto.");
    setSnapshotPreview({});
  }

  function inferActionFromPrompt(prompt) {
    const p = String(prompt || "").trim().toLowerCase();

    if (!p) return "summarize-structure";

    if (
      p.includes("log") ||
      p.includes("erro") ||
      p.includes("error") ||
      p.includes("falha") ||
      p.includes("crash")
    ) return "analyze-logs";

    if (
      p.includes("doctor") ||
      p.includes("diagnóstico") ||
      p.includes("diagnostico") ||
      p.includes("estabilidade") ||
      p.includes("stability")
    ) return "factory_diagnosis";

    if (
      p.includes("patch") ||
      p.includes("corrig") ||
      p.includes("fix") ||
      p.includes("ajust") ||
      p.includes("consert")
    ) return "propose-patch";

    if (
      p.includes("gerar código") ||
      p.includes("gerar codigo") ||
      p.includes("gere código") ||
      p.includes("gere codigo") ||
      p.includes("código completo") ||
      p.includes("codigo completo") ||
      p.includes("arquivo completo") ||
      p.includes("code")
    ) return "generate-code";

    if (
      p.includes("módulo") ||
      p.includes("modulo") ||
      p.includes("arquivo") ||
      p.includes("file") ||
      p.includes("review")
    ) return "review-module";

    if (
      p.includes("melhoria") ||
      p.includes("melhorar") ||
      p.includes("improve") ||
      p.includes("sugest")
    ) return "suggest-improvement";

    if (
      p.includes("arquitetura") ||
      p.includes("estrutura") ||
      p.includes("organiza") ||
      p.includes("orquestra") ||
      p.includes("layout") ||
      p.includes("design")
    ) return "analyze-architecture";

    return "summarize-structure";
  }

  function buildPayload(action) {
    const snapshot = buildLeanSnapshot();
    setSnapshotPreview(snapshot);

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

    if (action === "review-module") {
      return {
        snapshot,
        doctor: collectDoctorReport(),
        logs: collectLogs(12)
      };
    }

    return { snapshot };
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
    if (STATE.busy) return;

    setButtonsBusy(true);
    setComposerStatus("carregando...");
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
      } catch {
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
        setComposerStatus("erro");
        setTechResult(msg);
        pushChat("assistant", msg);
        log("ERR", "falha IA endpoint=" + endpoint);
        return;
      }

      const text =
        data.analysis ||
        data.answer ||
        data.result ||
        pretty(data);

      setComposerStatus("concluído");
      setTechResult(text);
      pushChat("assistant", text);
      log("OK", "resposta recebida action=" + action + " endpoint=" + endpoint);
    } catch (e) {
      const msg = String(e?.message || e || "Erro de rede");
      setComposerStatus("erro");
      setTechResult(msg);
      pushChat("assistant", msg);
      log("ERR", "erro de rede IA");
    } finally {
      setButtonsBusy(false);
    }
  }

  function sendPrompt(rawPrompt, forcedAction = "") {
    const prompt = String(rawPrompt || "").trim();
    if (!prompt) {
      setComposerStatus("aguardando");
      setTechResult("Digite uma instrução primeiro.");
      return;
    }

    const action = forcedAction || inferActionFromPrompt(prompt);

    pushChat("user", prompt);
    callFactoryAI(action, buildPayload(action), prompt);

    const input = document.getElementById("rcfFactoryAIPrompt");
    if (input) {
      try { input.value = ""; } catch {}
    }
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
      clearBtn.addEventListener("click", () => {
        clearChat();
      }, { passive: true });
    }

    if (promptEl && !promptEl.__boundEnter) {
      promptEl.__boundEnter = true;
      promptEl.addEventListener("keydown", (ev) => {
        try {
          if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            sendPrompt(String(promptEl.value || "").trim(), "");
          }
        } catch {}
      });
    }
  }

  function buildBoxHtml() {
    return `
      <div class="rcfAiShell">
        <section class="rcfAiHead">
          <div class="rcfAiHeadLeft">
            <div class="rcfAiAvatar">🤖</div>
            <div class="rcfAiHeadText">
              <h2 class="rcfAiHeadTitle">Factory AI</h2>
              <p class="rcfAiHeadSub">Chat central da Factory para conversar, analisar, organizar e evoluir a estrutura.</p>
            </div>
          </div>
          <div class="rcfAiPill">OpenAI conectada</div>
        </section>

        <section id="${CHAT_ID}"></section>

        <section class="rcfAiComposer">
          <div class="rcfAiInputWrap">
            <textarea
              id="rcfFactoryAIPrompt"
              class="rcfAiPrompt"
              placeholder="Fale com a Factory AI. Ex.: corrige o módulo da view, gera o arquivo completo, analisa os logs, lê esse contexto, organiza essa arquitetura..."
            ></textarea>

            <div class="rcfAiRightBtns">
              <button class="rcfAiBtn" id="rcfFactoryAIClear" type="button">Limpar</button>
              <button class="rcfAiBtn primary" id="rcfFactoryAISend" type="button">Enviar</button>
            </div>
          </div>

          <div class="rcfAiBottom">
            <div id="rcfFactoryAIComposerStatus" class="rcfAiStatus">aguardando</div>
            <div class="rcfAiHint">Em breve: imagem, ZIP, PDF e arquivos direto no chat.</div>
          </div>

          <details class="rcfAiDetails">
            <summary>Contexto técnico</summary>
            <div style="margin-top:10px;display:grid;gap:10px">
              <div>
                <label class="hint">Snapshot Preview enviado</label>
                <pre class="mono small rcfAiPre" id="rcfFactoryAISnapshot">{"status":"aguardando"}</pre>
              </div>
              <div>
                <label class="hint">Último resultado técnico</label>
                <pre class="mono small rcfAiPre" id="rcfFactoryAITechResult">Pronto.</pre>
              </div>
            </div>
          </details>
        </section>
      </div>
    `;
  }

  function cleanupFactoryAIHost() {
    const view = getFactoryAIView();
    if (!view) return false;

    try {
      const hero = qs(".rcfUiFactoryHero", view);
      if (hero) hero.style.display = "none";
    } catch {}

    try {
      const actionsBlock = qs('[data-rcf-factory-block="factory-ai-actions"]', view);
      if (actionsBlock) actionsBlock.style.display = "none";
    } catch {}

    try {
      const contextBlock = qs('[data-rcf-factory-block="factory-ai-context"]', view);
      if (contextBlock) contextBlock.style.display = "none";
    } catch {}

    try {
      const blockHead = qs('[data-rcf-factory-block="factory-ai-tools"] .rcfUiFactoryBlockHead', view);
      if (blockHead) blockHead.style.display = "none";
    } catch {}

    try {
      const toolsBlock = qs('[data-rcf-factory-block="factory-ai-tools"]', view);
      if (toolsBlock) {
        toolsBlock.style.marginTop = "0";
        toolsBlock.style.paddingTop = "0";
        toolsBlock.style.border = "0";
        toolsBlock.style.background = "transparent";
        toolsBlock.style.boxShadow = "none";
      }
    } catch {}

    try {
      const wrong = qsa('#rcfFactoryAIQuickActions, #rcfFactoryAIStateMini, [data-rcf-factory-ai-fallback]', view);
      wrong.forEach((el) => {
        try { el.remove(); } catch {}
      });
    } catch {}

    return true;
  }

  function syncVisibility() {
    const box = document.getElementById(BOX_ID);
    const showFactory = isFactoryAIViewVisible();
    const showAdminFallback = !showFactory && isAdminViewVisible() && /^admin/.test(STATE.mountedIn || "");
    const visible = !!(showFactory || showAdminFallback);

    try {
      if (box) {
        box.style.display = visible ? "" : "none";
        box.hidden = !visible;
      }
    } catch {}

    try { cleanupFactoryAIHost(); } catch {}
  }

  function ensureMainBox(primarySlot) {
    let box = document.getElementById(BOX_ID);
    if (!primarySlot) return null;

    ensureStyle();

    if (!box) {
      box = document.createElement("div");
      box.id = BOX_ID;
      box.className = "card";
      box.setAttribute("data-rcf-factory-ai", "1");
      box.innerHTML = buildBoxHtml();
      primarySlot.appendChild(box);
    } else if (box.parentNode !== primarySlot) {
      primarySlot.appendChild(box);
    }

    bindBox();
    renderChat();
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

    try { cleanupFactoryAIHost(); } catch {}
    try { syncVisibility(); } catch {}

    log("OK", "Factory AI mount ✅ " + VERSION + " @ " + (STATE.mountedIn || "unknown"));
    return true;
  }

  function mountLoop() {
    if (mount()) return true;
    setTimeout(() => { try { mount(); } catch {} }, 700);
    setTimeout(() => { try { mount(); } catch {} }, 1600);
    setTimeout(() => { try { mount(); } catch {} }, 2800);
    return false;
  }

  function startSync() {
    try {
      if (STATE.syncTimer) clearInterval(STATE.syncTimer);
    } catch {}

    STATE.syncTimer = setInterval(() => {
      try { mount(); } catch {}
      try { syncVisibility(); } catch {}
    }, 1200);

    try {
      document.addEventListener("click", () => {
        setTimeout(() => { try { mount(); } catch {} }, 60);
        setTimeout(() => { try { syncVisibility(); } catch {} }, 60);
        setTimeout(() => { try { mount(); } catch {} }, 260);
        setTimeout(() => { try { syncVisibility(); } catch {} }, 260);
      }, { passive: true });
    } catch {}
  }

  window.RCF_FACTORY_AI = {
    __v34: true,
    version: VERSION,
    mount,
    clearChat,
    sendPrompt,
    getHistory() {
      return Array.isArray(STATE.history) ? STATE.history.slice() : [];
    },
    getLastEndpoint() {
      return STATE.lastEndpoint || "";
    }
  };

  window.RCF_ADMIN_AI = Object.assign(window.RCF_ADMIN_AI || {}, {
    __v34_bridge: true,
    version: VERSION,
    mount,
    clearChat,
    sendPrompt
  });

  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { mountLoop(); } catch {}
    }, { passive: true });
  } catch {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try { mountLoop(); } catch {}
      try { startSync(); } catch {}
    }, { once: true });
  } else {
    mountLoop();
    startSync();
  }

  log("OK", "admin.admin_ai.js -> Factory AI ready ✅ " + VERSION);
})();

/* FILE: /app/js/admin.admin_ai.js
   RControl Factory — Factory AI
   v3.9 CHAT CORE AUDIO READY

   - Factory AI em modo chat-first real
   - nome oficial padronizado: Factory AI
   - mount preferencial no slot oficial factoryai.tools
   - fallback seguro para admin apenas se necessário
   - remove duplicação visual pesada da tela
   - visual clean mobile-first
   - composer refinado no estilo de chat moderno
   - botão "+" fora da cápsula do input
   - botão enviar compacto
   - textarea com auto-grow leve
   - suporte visual a anexos
   - leitura em voz (speechSynthesis) pronta
   - captura por voz preparada com fallback seguro
   - inferência automática de ação por linguagem natural
   - usa actions compatíveis com backend atual
   - tenta /api/factory-ai com fallback para /api/admin-ai
   - contexto técnico discreto em details
   - não executa patch automático
*/

(() => {
  "use strict";

  if (window.RCF_FACTORY_AI && window.RCF_FACTORY_AI.__v39) return;

  const VERSION = "v3.9";
  const BOX_ID = "rcfFactoryAIBox";
  const CHAT_ID = "rcfFactoryAIChat";
  const STYLE_ID = "rcfFactoryAIStyleV39";

  const SpeechRecognitionCtor =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    null;

  const STATE = {
    busy: false,
    history: [],
    mountedIn: "",
    lastEndpoint: "",
    bootedAt: new Date().toISOString(),
    syncTimer: null,
    attachments: [],
    isListening: false,
    currentUtterance: null
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
    const attachBtn = document.getElementById("rcfFactoryAIAttachBtn");
    const voiceBtn = document.getElementById("rcfFactoryAIVoiceBtn");
    const input = document.getElementById("rcfFactoryAIPrompt");

    if (sendBtn) sendBtn.disabled = !!busy;
    if (attachBtn) attachBtn.disabled = !!busy;
    if (voiceBtn) voiceBtn.disabled = !!busy;
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

#${BOX_ID} .rcfAiEmpty{
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:260px;
  text-align:center;
  color:rgba(32,45,77,.42);
  font-size:14px;
  line-height:1.45;
  padding:18px;
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

#${BOX_ID} .rcfAiMsgTools{
  display:flex;
  justify-content:flex-end;
  gap:8px;
  margin-top:8px;
}

#${BOX_ID} .rcfAiMiniBtn{
  min-width:34px;
  height:34px;
  border-radius:12px;
  border:1px solid rgba(31,41,55,.08);
  background:rgba(255,255,255,.94);
  color:#5a6b98;
  font-size:16px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}

#${BOX_ID} .rcfAiComposer{
  display:grid;
  gap:10px;
  padding:14px 16px 16px;
  border-top:1px solid rgba(31,41,55,.06);
  background:rgba(255,255,255,.82);
}

#${BOX_ID} .rcfAiAttachRow{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}

#${BOX_ID} .rcfAiAttachmentChip{
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-height:32px;
  padding:0 10px;
  border-radius:999px;
  border:1px solid rgba(31,41,55,.08);
  background:rgba(245,248,255,.95);
  color:#22345e;
  font-size:12px;
  font-weight:800;
  max-width:100%;
}

#${BOX_ID} .rcfAiAttachmentName{
  max-width:140px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

#${BOX_ID} .rcfAiAttachmentRemove{
  width:20px;
  height:20px;
  border-radius:999px;
  border:none;
  background:rgba(112,152,255,.12);
  color:#26407a;
  font-weight:900;
  cursor:pointer;
}

#${BOX_ID} .rcfAiInputShell{
  display:grid;
  grid-template-columns:auto 1fr;
  gap:10px;
  align-items:end;
}

#${BOX_ID} .rcfAiAttachWrap{
  position:relative;
  display:flex;
  align-items:flex-end;
  justify-content:center;
  width:32px;
  min-width:32px;
  padding-bottom:8px;
}

#${BOX_ID} .rcfAiAttachBtn{
  width:28px;
  height:28px;
  min-width:28px;
  border:none;
  background:transparent;
  color:#7088c8;
  font-size:34px;
  line-height:1;
  font-weight:700;
  cursor:pointer;
  padding:0;
  display:flex;
  align-items:center;
  justify-content:center;
}

#${BOX_ID} .rcfAiInputCard{
  display:grid;
  grid-template-columns:1fr auto auto;
  align-items:end;
  gap:8px;
  min-height:54px;
  padding:6px 8px;
  border-radius:18px;
  border:1px solid rgba(31,41,55,.10);
  background:#fff;
  box-shadow:0 1px 0 rgba(255,255,255,.65) inset;
}

#${BOX_ID} .rcfAiPrompt{
  width:100%;
  min-height:28px;
  max-height:88px;
  resize:none;
  padding:10px 6px;
  border:none;
  outline:none;
  background:transparent;
  color:#18233f;
  font:inherit;
  line-height:1.4;
}

#${BOX_ID} .rcfAiPrompt::placeholder{
  color:rgba(24,35,63,.38);
}

#${BOX_ID} .rcfAiVoiceBtn{
  width:34px;
  height:34px;
  min-width:34px;
  border:none;
  background:transparent;
  color:#7b8ab7;
  font-size:19px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:12px;
}

#${BOX_ID} .rcfAiVoiceBtn.listening{
  background:rgba(112,152,255,.12);
  color:#26407a;
}

#${BOX_ID} .rcfAiSendBtn{
  min-width:34px;
  width:34px;
  height:34px;
  padding:0;
  border-radius:999px;
  border:1px solid rgba(112,152,255,.20);
  background:linear-gradient(180deg, rgba(223,232,255,.98), rgba(212,224,255,.92));
  color:#26407a;
  font-size:16px;
  font-weight:900;
  cursor:pointer;
  -webkit-tap-highlight-color:transparent;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}

#${BOX_ID} .rcfAiMenu{
  position:absolute;
  left:-4px;
  bottom:34px;
  min-width:190px;
  display:none;
  z-index:30;
  padding:8px;
  border-radius:16px;
  border:1px solid rgba(31,41,55,.08);
  background:rgba(255,255,255,.98);
  box-shadow:0 12px 26px rgba(15,23,42,.10);
}

#${BOX_ID} .rcfAiMenu.open{
  display:grid;
  gap:6px;
}

#${BOX_ID} .rcfAiMenuItem{
  display:flex;
  align-items:center;
  gap:8px;
  min-height:40px;
  padding:0 12px;
  border-radius:12px;
  border:1px solid transparent;
  background:rgba(247,249,253,.9);
  color:#22345e;
  font-size:13px;
  font-weight:800;
  cursor:pointer;
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

#${BOX_ID} .rcfAiHiddenInput{
  display:none;
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
  #${BOX_ID} .rcfAiAttachmentName{
    max-width:110px;
  }
}
    `.trim();

    document.head.appendChild(st);
  }

  function renderChat() {
    const box = document.getElementById(CHAT_ID);
    if (!box) return;

    if (!Array.isArray(STATE.history) || !STATE.history.length) {
      box.innerHTML = `
        <div class="rcfAiEmpty">
          Converse com a Factory AI para analisar arquitetura, corrigir módulos, revisar contexto e estruturar a própria Factory.
        </div>
      `;
      return;
    }

    box.innerHTML = STATE.history.map((item, idx) => {
      const isUser = item.role === "user";
      const canSpeak = !isUser;
      return `
        <div class="rcfAiMsgRow ${isUser ? "user" : "assistant"}">
          <div class="rcfAiBubble ${isUser ? "userBubble" : ""}">
            <div class="rcfAiMsgLabel">${isUser ? "Você" : "Factory AI"}</div>
            <div class="rcfAiMsgText">${esc(item.text)}</div>
            <div class="rcfAiMsgTime">${esc(item.ts)}</div>
            ${canSpeak ? `
              <div class="rcfAiMsgTools">
                <button class="rcfAiMiniBtn" type="button" data-rcf-speak-idx="${idx}" title="Ler resposta">🔊</button>
              </div>
            ` : ``}
          </div>
        </div>
      `;
    }).join("");

    qsa("[data-rcf-speak-idx]", box).forEach((btn) => {
      if (btn.__boundSpeak) return;
      btn.__boundSpeak = true;
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-rcf-speak-idx"));
        const item = Array.isArray(STATE.history) ? STATE.history[idx] : null;
        if (item && item.text) speakText(item.text);
      }, { passive: true });
    });

    try { box.scrollTop = box.scrollHeight; } catch {}
  }

  function clearChat() {
    STATE.history = [];
    renderChat();
    setComposerStatus("aguardando");
    setTechResult("Pronto.");
    setSnapshotPreview({});
  }

  function inferActionFromPrompt(prompt) {
    const p = String(prompt || "").trim().toLowerCase();

    if (!p) return "chat";

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
      p.includes("zip") ||
      p.includes("pdf") ||
      p.includes("imagem") ||
      p.includes("foto") ||
      p.includes("arquivo") ||
      p.includes("vídeo") ||
      p.includes("video")
    ) return "zip-readiness";

    if (
      p.includes("arquitetura") ||
      p.includes("estrutura") ||
      p.includes("organiza") ||
      p.includes("orquestra") ||
      p.includes("layout") ||
      p.includes("design")
    ) return "analyze-architecture";

    return "chat";
  }

  function buildPayload(action) {
    const snapshot = buildLeanSnapshot();
    setSnapshotPreview(snapshot);
    const attachments = getAttachmentPayload();

    if (action === "analyze-logs") {
      return { snapshot, logs: collectLogs(), attachments };
    }

    if (action === "factory_diagnosis") {
      return { snapshot, doctor: collectDoctorReport(), attachments };
    }

    if (action === "propose-patch" || action === "generate-code") {
      return {
        snapshot,
        doctor: collectDoctorReport(),
        logs: collectLogs(25),
        attachments
      };
    }

    if (action === "review-module") {
      return {
        snapshot,
        doctor: collectDoctorReport(),
        logs: collectLogs(12),
        attachments
      };
    }

    if (action === "zip-readiness") {
      return {
        snapshot,
        attachments,
        capability: {
          wantsZipFlow: true,
          wantsPdfFlow: true,
          wantsImageFlow: true,
          wantsVideoFlow: true,
          wantsAudioFlow: true
        }
      };
    }

    return { snapshot, attachments };
  }

  function getAttachmentPayload() {
    return (STATE.attachments || []).map((item) => ({
      name: item.name || "",
      kind: item.kind || "unknown",
      mime: item.mime || "",
      size: item.size || 0,
      summary: item.summary || ""
    }));
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
      history: STATE.history.slice(-12).map((m) => ({
        role: m.role,
        text: m.text
      })),
      attachments: getAttachmentPayload(),
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
        STATE.history.push({
          role: "assistant",
          text: msg,
          ts: new Date().toISOString()
        });
        renderChat();
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
      STATE.history.push({
        role: "assistant",
        text,
        ts: new Date().toISOString()
      });
      renderChat();
      log("OK", "resposta recebida action=" + action + " endpoint=" + endpoint);
    } catch (e) {
      const msg = String(e?.message || e || "Erro de rede");
      setComposerStatus("erro");
      setTechResult(msg);
      STATE.history.push({
        role: "assistant",
        text: msg,
        ts: new Date().toISOString()
      });
      renderChat();
      log("ERR", "erro de rede IA");
    } finally {
      setButtonsBusy(false);
    }
  }

  function sendPrompt(rawPrompt, forcedAction = "") {
    const prompt = String(rawPrompt || "").trim();

    if (!prompt && !(STATE.attachments && STATE.attachments.length)) {
      setComposerStatus("aguardando");
      setTechResult("Digite uma instrução ou selecione um arquivo primeiro.");
      return;
    }

    const finalPrompt = prompt || "Analise os anexos enviados e diga o próximo passo mais seguro.";
    const action = forcedAction || inferActionFromPrompt(finalPrompt);

    let userText = finalPrompt;
    if (STATE.attachments && STATE.attachments.length) {
      const list = STATE.attachments.map((a) => a.name).join(", ");
      userText += `\n\n[anexos: ${list}]`;
    }

    STATE.history.push({
      role: "user",
      text: userText,
      ts: new Date().toISOString()
    });
    renderChat();

    callFactoryAI(action, buildPayload(action), finalPrompt);

    const input = document.getElementById("rcfFactoryAIPrompt");
    if (input) {
      try {
        input.value = "";
        autoResizePrompt(input);
      } catch {}
    }

    clearAttachments();
    closeAttachMenus();
    stopListening();
  }

  function normalizePickedFiles(fileList, forcedKind = "") {
    const files = Array.from(fileList || []);
    if (!files.length) return [];

    return files.slice(0, 10).map((file) => {
      const mime = String(file.type || "").trim();
      const name = String(file.name || "arquivo").trim();
      const size = Number(file.size || 0) || 0;

      let kind = forcedKind || "file";

      if (!forcedKind) {
        if (mime.startsWith("image/")) kind = "image";
        else if (mime.startsWith("video/")) kind = "video";
        else if (mime === "application/pdf") kind = "pdf";
        else if (/zip|compressed|x-zip/i.test(mime) || /\.zip$/i.test(name)) kind = "zip";
        else if (mime.startsWith("audio/")) kind = "audio";
      }

      return {
        id: "att_" + Math.random().toString(36).slice(2, 10),
        name,
        mime,
        size,
        kind,
        summary: `${kind.toUpperCase()} • ${formatBytes(size)}`
      };
    });
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!value) return "0 B";
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
    if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
    return (value / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }

  function addAttachments(items) {
    if (!Array.isArray(items) || !items.length) return;

    const current = Array.isArray(STATE.attachments) ? STATE.attachments.slice() : [];
    const merged = current.concat(items).slice(0, 12);

    const dedup = [];
    const seen = new Set();

    merged.forEach((item) => {
      const key = `${item.name}::${item.size}::${item.kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      dedup.push(item);
    });

    STATE.attachments = dedup;
    renderAttachments();
    setComposerStatus("anexos prontos");
  }

  function removeAttachment(id) {
    STATE.attachments = (STATE.attachments || []).filter((item) => item.id !== id);
    renderAttachments();
    if (!STATE.attachments.length) setComposerStatus("aguardando");
  }

  function clearAttachments() {
    STATE.attachments = [];
    renderAttachments();

    [
      "rcfFactoryAIInputImage",
      "rcfFactoryAIInputPdf",
      "rcfFactoryAIInputZip",
      "rcfFactoryAIInputFile",
      "rcfFactoryAIInputVideo",
      "rcfFactoryAIInputAudio"
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        try { el.value = ""; } catch {}
      }
    });
  }

  function renderAttachments() {
    const wrap = document.getElementById("rcfFactoryAIAttachments");
    if (!wrap) return;

    const list = Array.isArray(STATE.attachments) ? STATE.attachments : [];
    if (!list.length) {
      wrap.innerHTML = "";
      wrap.style.display = "none";
      return;
    }

    wrap.style.display = "flex";
    wrap.innerHTML = list.map((item) => {
      const icon =
        item.kind === "image" ? "🖼️" :
        item.kind === "pdf" ? "📄" :
        item.kind === "zip" ? "🗜️" :
        item.kind === "video" ? "🎬" :
        item.kind === "audio" ? "🎤" : "📎";

      return `
        <div class="rcfAiAttachmentChip">
          <span>${icon}</span>
          <span class="rcfAiAttachmentName" title="${esc(item.name)}">${esc(item.name)}</span>
          <button class="rcfAiAttachmentRemove" type="button" data-rcf-attach-remove="${esc(item.id)}">×</button>
        </div>
      `;
    }).join("");

    qsa("[data-rcf-attach-remove]", wrap).forEach((btn) => {
      if (btn.__boundRemove) return;
      btn.__boundRemove = true;
      btn.addEventListener("click", () => {
        removeAttachment(btn.getAttribute("data-rcf-attach-remove") || "");
      }, { passive: true });
    });
  }

  function toggleAttachMenu(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;

    const isOpen = menu.classList.contains("open");
    closeAttachMenus();
    if (!isOpen) menu.classList.add("open");
  }

  function closeAttachMenus() {
    ["rcfFactoryAIClipMenuMain"].forEach((id) => {
      const menu = document.getElementById(id);
      if (menu) menu.classList.remove("open");
    });
  }

  function openFileInput(id) {
    const el = document.getElementById(id);
    if (!el) return;
    closeAttachMenus();
    try { el.click(); } catch {}
  }

  function autoResizePrompt(el) {
    try {
      if (!el) return;
      el.style.height = "28px";
      const next = Math.min(Math.max(el.scrollHeight, 28), 88);
      el.style.height = next + "px";
    } catch {}
  }

  function stopSpeaking() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {}
    STATE.currentUtterance = null;
  }

  function speakText(text) {
    try {
      stopSpeaking();
      if (!("speechSynthesis" in window)) {
        setComposerStatus("leitura por voz indisponível");
        return;
      }
      const utter = new SpeechSynthesisUtterance(String(text || ""));
      utter.lang = "pt-BR";
      utter.rate = 1;
      utter.pitch = 1;
      utter.onend = () => {
        STATE.currentUtterance = null;
      };
      STATE.currentUtterance = utter;
      window.speechSynthesis.speak(utter);
      setComposerStatus("lendo resposta");
    } catch {
      setComposerStatus("leitura por voz indisponível");
    }
  }

  function setVoiceBtnState() {
    const btn = document.getElementById("rcfFactoryAIVoiceBtn");
    if (!btn) return;

    if (STATE.isListening) {
      btn.classList.add("listening");
      btn.setAttribute("title", "Parar gravação");
      btn.setAttribute("aria-label", "Parar gravação");
      btn.textContent = "⏺";
    } else {
      btn.classList.remove("listening");
      btn.setAttribute("title", SpeechRecognitionCtor ? "Falar por áudio" : "Áudio indisponível");
      btn.setAttribute("aria-label", SpeechRecognitionCtor ? "Falar por áudio" : "Áudio indisponível");
      btn.textContent = "🎤";
    }
  }

  function stopListening() {
    try {
      const rec = window.__RCF_FACTORY_AI_REC__;
      if (rec && typeof rec.stop === "function") rec.stop();
    } catch {}
    STATE.isListening = false;
    setVoiceBtnState();
  }

  function startListening() {
    if (!SpeechRecognitionCtor) {
      setComposerStatus("áudio não suportado neste navegador");
      return;
    }

    try {
      stopListening();

      const rec = new SpeechRecognitionCtor();
      window.__RCF_FACTORY_AI_REC__ = rec;
      rec.lang = "pt-BR";
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;

      const input = document.getElementById("rcfFactoryAIPrompt");
      if (!input) return;

      let finalText = String(input.value || "");

      rec.onstart = () => {
        STATE.isListening = true;
        setVoiceBtnState();
        setComposerStatus("ouvindo...");
      };

      rec.onresult = (event) => {
        let interim = "";
        let complete = finalText;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const txt = String(event.results[i][0]?.transcript || "");
          if (event.results[i].isFinal) {
            complete += (complete ? " " : "") + txt.trim();
          } else {
            interim += " " + txt.trim();
          }
        }

        input.value = (complete + interim).trim();
        autoResizePrompt(input);
      };

      rec.onerror = () => {
        STATE.isListening = false;
        setVoiceBtnState();
        setComposerStatus("falha no áudio");
      };

      rec.onend = () => {
        STATE.isListening = false;
        setVoiceBtnState();
        setComposerStatus("aguardando");
      };

      rec.start();
    } catch {
      STATE.isListening = false;
      setVoiceBtnState();
      setComposerStatus("áudio não suportado neste navegador");
    }
  }

  function toggleListening() {
    if (STATE.isListening) stopListening();
    else startListening();
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

  function bindAttachmentInputs() {
    const map = [
      ["rcfFactoryAIInputImage", "image"],
      ["rcfFactoryAIInputPdf", "pdf"],
      ["rcfFactoryAIInputZip", "zip"],
      ["rcfFactoryAIInputFile", "file"],
      ["rcfFactoryAIInputVideo", "video"],
      ["rcfFactoryAIInputAudio", "audio"]
    ];

    map.forEach(([id, kind]) => {
      const input = document.getElementById(id);
      if (!input || input.__boundFileInput) return;

      input.__boundFileInput = true;
      input.addEventListener("change", () => {
        const items = normalizePickedFiles(input.files, kind);
        addAttachments(items);
      });
    });
  }

  function bindMenuItems() {
    [
      ["rcfFactoryAIChooseImage", "rcfFactoryAIInputImage"],
      ["rcfFactoryAIChoosePdf", "rcfFactoryAIInputPdf"],
      ["rcfFactoryAIChooseZip", "rcfFactoryAIInputZip"],
      ["rcfFactoryAIChooseFile", "rcfFactoryAIInputFile"],
      ["rcfFactoryAIChooseVideo", "rcfFactoryAIInputVideo"],
      ["rcfFactoryAIChooseAudio", "rcfFactoryAIInputAudio"]
    ].forEach(([btnId, inputId]) => {
      const btn = document.getElementById(btnId);
      if (!btn || btn.__boundPick) return;
      btn.__boundPick = true;
      btn.addEventListener("click", () => {
        openFileInput(inputId);
      }, { passive: true });
    });
  }

  function bindBox() {
    const sendBtn = document.getElementById("rcfFactoryAISend");
    const promptEl = document.getElementById("rcfFactoryAIPrompt");
    const attachBtn = document.getElementById("rcfFactoryAIAttachBtn");
    const voiceBtn = document.getElementById("rcfFactoryAIVoiceBtn");

    if (sendBtn && !sendBtn.__bound) {
      sendBtn.__bound = true;
      sendBtn.addEventListener("click", () => {
        sendPrompt(String(promptEl?.value || "").trim(), "");
      }, { passive: true });
    }

    if (promptEl && !promptEl.__boundInput) {
      promptEl.__boundInput = true;
      autoResizePrompt(promptEl);

      promptEl.addEventListener("input", () => {
        autoResizePrompt(promptEl);
      });

      promptEl.addEventListener("keydown", (ev) => {
        try {
          if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            sendPrompt(String(promptEl.value || "").trim(), "");
          }
        } catch {}
      });
    }

    if (attachBtn && !attachBtn.__bound) {
      attachBtn.__bound = true;
      attachBtn.addEventListener("click", () => {
        toggleAttachMenu("rcfFactoryAIClipMenuMain");
      }, { passive: true });
    }

    if (voiceBtn && !voiceBtn.__bound) {
      voiceBtn.__bound = true;
      voiceBtn.addEventListener("click", () => {
        toggleListening();
      }, { passive: true });
    }

    bindMenuItems();
    bindAttachmentInputs();
    renderAttachments();
    setVoiceBtnState();

    if (!document.__rcfFactoryAIOutsideClickV39) {
      document.__rcfFactoryAIOutsideClickV39 = true;
      document.addEventListener("click", (ev) => {
        try {
          const wrap = document.getElementById("rcfFactoryAIAttachWrap");
          if (wrap && wrap.contains(ev.target)) return;
          closeAttachMenus();
        } catch {}
      }, { passive: true });
    }
  }

  function buildAttachMenu() {
    return `
      <div id="rcfFactoryAIClipMenuMain" class="rcfAiMenu">
        <button class="rcfAiMenuItem" id="rcfFactoryAIChooseImage" type="button">🖼️ Imagem</button>
        <button class="rcfAiMenuItem" id="rcfFactoryAIChoosePdf" type="button">📄 PDF</button>
        <button class="rcfAiMenuItem" id="rcfFactoryAIChooseZip" type="button">🗜️ ZIP</button>
        <button class="rcfAiMenuItem" id="rcfFactoryAIChooseFile" type="button">📎 Arquivo</button>
        <button class="rcfAiMenuItem" id="rcfFactoryAIChooseVideo" type="button">🎬 Vídeo</button>
        <button class="rcfAiMenuItem" id="rcfFactoryAIChooseAudio" type="button">🎤 Áudio</button>
      </div>
    `;
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
          <div id="rcfFactoryAIAttachments" class="rcfAiAttachRow" style="display:none"></div>

          <div class="rcfAiInputShell">
            <div class="rcfAiAttachWrap" id="rcfFactoryAIAttachWrap">
              <button
                class="rcfAiAttachBtn"
                id="rcfFactoryAIAttachBtn"
                type="button"
                aria-label="Adicionar anexo"
                title="Adicionar anexo"
              >＋</button>
              ${buildAttachMenu()}
            </div>

            <div class="rcfAiInputCard">
              <textarea
                id="rcfFactoryAIPrompt"
                class="rcfAiPrompt"
                placeholder="Digite sua mensagem..."
              ></textarea>

              <button
                class="rcfAiVoiceBtn"
                id="rcfFactoryAIVoiceBtn"
                type="button"
                aria-label="Falar por áudio"
                title="Falar por áudio"
              >🎤</button>

              <button class="rcfAiSendBtn" id="rcfFactoryAISend" type="button" aria-label="Enviar" title="Enviar">➤</button>
            </div>
          </div>

          <input id="rcfFactoryAIInputImage" class="rcfAiHiddenInput" type="file" accept="image/*" multiple>
          <input id="rcfFactoryAIInputPdf" class="rcfAiHiddenInput" type="file" accept="application/pdf,.pdf" multiple>
          <input id="rcfFactoryAIInputZip" class="rcfAiHiddenInput" type="file" accept=".zip,application/zip,application/x-zip-compressed" multiple>
          <input id="rcfFactoryAIInputFile" class="rcfAiHiddenInput" type="file" multiple>
          <input id="rcfFactoryAIInputVideo" class="rcfAiHiddenInput" type="file" accept="video/*" multiple>
          <input id="rcfFactoryAIInputAudio" class="rcfAiHiddenInput" type="file" accept="audio/*" multiple>

          <div class="rcfAiBottom">
            <div id="rcfFactoryAIComposerStatus" class="rcfAiStatus">aguardando</div>
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
    __v39: true,
    version: VERSION,
    mount,
    clearChat,
    sendPrompt,
    stopListening,
    speakText,
    getHistory() {
      return Array.isArray(STATE.history) ? STATE.history.slice() : [];
    },
    getLastEndpoint() {
      return STATE.lastEndpoint || "";
    },
    getAttachments() {
      return Array.isArray(STATE.attachments) ? STATE.attachments.slice() : [];
    }
  };

  window.RCF_ADMIN_AI = Object.assign(window.RCF_ADMIN_AI || {}, {
    __v39_bridge: true,
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

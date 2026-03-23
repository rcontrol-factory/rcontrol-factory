/* FILE: /app/js/admin.admin_ai.js
   RControl Factory — Factory AI
   v4.3.6 HYBRID CHAT ROUTE FIX + RUNTIME TEXT RESCUE + OPENAI STATUS ROUTE

   - mantém visual chat-first aprovado
   - mantém botão + fora da cápsula
   - mantém anexos e voz local com fallback seguro
   - melhora renderização das respostas
   - adiciona copiar resposta
   - adiciona copiar bloco de código
   - renderiza blocos ```code``` de forma legível
   - mantém leitura por voz da resposta
   - evita reaproveitar HTML antigo ao trocar de versão
   - FIX: prioriza RCF_CONTEXT/RCF_FACTORY_STATE/RCF_MODULE_REGISTRY/RCF_FACTORY_TREE
   - FIX: evita usar contexto conversável da Factory IA como snapshot principal
   - FIX: coleta logs com fallback quando logger não usa .items
   - FIX: melhora fallback de activeView/activeAppSlug/modules ativos/doctor
   - FIX CRÍTICO: não força scroll para o final quando o usuário sobe o chat
   - ADD: histórico persistido em localStorage
   - ADD: botão limpar histórico
   - FIX NOVO: corta loop de mount/log repetido
   - FIX NOVO: reduz sync agressivo
   - ADD NOVO: usa camada supervisionada local (planner/bridge/actions/patch supervisor)
   - ADD NOVO: sobe para runtime antes de brain/orchestrator quando não for ação local direta
   - ADD v4.3.3: header compacto mobile, sem estourar largura
   - ADD v4.3.3: composer reforçado para manter botão enviar visível
   - ADD v4.3.3: overflow lateral bloqueado no card/chat/composer
   - FIX v4.3.4: runRuntimePrompt envia payload lean completo para runtime.ask()
   - FIX v4.3.5: perguntas normais sobre OpenAI/runtime/backend NÃO caem mais em ação local
   - FIX v4.3.5: ação local fica só para fluxo supervisionado explícito
   - FIX v4.3.6: prompts de OpenAI/runtime/backend sobem como openai_status
   - FIX v4.3.6: resgata response.analysis mesmo em falha do runtime
   - FIX v4.3.6: reduz sequestro indevido da ação local snapshot
   - não executa patch automático sem fluxo supervisionado
*/

(() => {
  "use strict";

  if (window.RCF_FACTORY_AI && window.RCF_FACTORY_AI.__v438) return;

  const VERSION = "v4.4.9";
  const BOX_ID = "rcfFactoryAIBox";
  const CHAT_ID = "rcfFactoryAIChat";
  const STYLE_ID = "rcfFactoryAIStyleV449";
  const HISTORY_KEY = "rcf:factory_ai_history_v449";
  const HISTORY_MAX = 80;

  const SYNC_INTERVAL_MS = 2200;
  const MOUNT_LOG_THROTTLE_MS = 4000;

  const SpeechRecognitionCtor =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    null;

  const STATE = {
    busy: false,
    history: [],
    mountedIn: "",
    lastEndpoint: "",
    lastFrontEndpoint: "",
    lastFrontAction: "",
    lastFrontResponseAt: "",
    lastFrontResponseOk: false,
    lastFrontRouting: null,
    bootedAt: new Date().toISOString(),
    syncTimer: null,
    attachments: [],
    isListening: false,
    currentUtterance: null,
    chatBound: false,
    pinnedToBottom: true,
    lastRenderSignature: "",
    renderedOnce: false,
    lastMountSignature: "",
    lastMountLoggedAt: 0,
    mounted: false,
    visibilityBound: false,
    syncStarted: false
  };

  function nowMs() {
    try { return Date.now(); } catch { return 0; }
  }

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, "[FACTORY_AI] " + msg); } catch {}
    try { console.log("[FACTORY_AI]", level, msg); } catch {}
  }

  function logMountOnce(signature, force = false) {
    const now = nowMs();
    if (!force && STATE.lastMountSignature === signature && (now - STATE.lastMountLoggedAt) < MOUNT_LOG_THROTTLE_MS) {
      return;
    }
    STATE.lastMountSignature = signature;
    STATE.lastMountLoggedAt = now;
    log("OK", "Factory AI mount ✅ " + VERSION + " @ " + signature);
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

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch { return obj || {}; }
  }

  function trim(v) {
    return String(v == null ? "" : v).trim();
  }

  function safeHistoryItem(item) {
    if (!item || typeof item !== "object") return null;
    const role = item.role === "assistant" ? "assistant" : "user";
    const text = String(item.text || "").trim();
    const ts = String(item.ts || new Date().toISOString());
    if (!text) return null;
    return { role, text, ts };
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(safeHistoryItem).filter(Boolean).slice(-HISTORY_MAX);
    } catch {
      return [];
    }
  }

  function persistHistory() {
    try {
      const data = Array.isArray(STATE.history) ? STATE.history.slice(-HISTORY_MAX) : [];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
    } catch {}
  }

  function pushHistory(item) {
    const safe = safeHistoryItem(item);
    if (!safe) return false;
    if (!Array.isArray(STATE.history)) STATE.history = [];
    STATE.history.push(safe);
    if (STATE.history.length > HISTORY_MAX) {
      STATE.history = STATE.history.slice(-HISTORY_MAX);
    }
    persistHistory();
    return true;
  }

  function getChatEl() {
    return document.getElementById(CHAT_ID);
  }

  function isNearBottom(el, threshold = 56) {
    try {
      if (!el) return true;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      return distance <= threshold;
    } catch {
      return true;
    }
  }

  function bindChatScroll() {
    const chat = getChatEl();
    if (!chat || chat.__rcfBoundScrollV436) return;

    chat.__rcfBoundScrollV436 = true;
    STATE.pinnedToBottom = true;

    chat.addEventListener("scroll", () => {
      STATE.pinnedToBottom = isNearBottom(chat, 56);
    }, { passive: true });

    chat.addEventListener("touchmove", () => {
      STATE.pinnedToBottom = isNearBottom(chat, 56);
    }, { passive: true });
  }

  function scrollChatToBottom(force = false) {
    const chat = getChatEl();
    if (!chat) return;

    if (!force && !STATE.pinnedToBottom) return;

    try {
      chat.scrollTop = chat.scrollHeight;
      STATE.pinnedToBottom = true;
    } catch {}
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

      if (logger && Array.isArray(logger.lines)) {
        return logger.lines.slice(-limit);
      }

      if (logger && typeof logger.getAll === "function") {
        const arr = logger.getAll();
        if (Array.isArray(arr)) return arr.slice(-limit);
      }

      if (logger && typeof logger.getText === "function") {
        const text = String(logger.getText() || "").trim();
        if (text) return text.split("\n").slice(-limit);
      }

      if (logger && typeof logger.dump === "function") {
        const text = String(logger.dump() || "").trim();
        if (text) return text.split("\n").slice(-limit);
      }
    } catch {}

    try {
      const raw = localStorage.getItem("rcf:logs");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(-limit);
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

    try {
      if (window.RCF_DOCTOR?.lastReport) {
        return window.RCF_DOCTOR.lastReport;
      }
    } catch {}

    try {
      if (window.RCF_DOCTOR?.lastRun) {
        return window.RCF_DOCTOR.lastRun;
      }
    } catch {}

    return {
      note: "Doctor report não encontrado ainda. Rode o Doctor antes.",
      ts: new Date().toISOString()
    };
  }

  function buildActiveModuleFallback(moduleSummary) {
    try {
      if (Array.isArray(moduleSummary?.active) && moduleSummary.active.length) {
        return clone(moduleSummary.active);
      }

      const map = moduleSummary?.modules || {};
      const active = Object.keys(map).filter((k) => !!map[k]);
      return active;
    } catch {
      return [];
    }
  }

  function buildRawFromCoreModules() {
    const factoryState = (() => {
      try {
        if (window.RCF_FACTORY_STATE && typeof window.RCF_FACTORY_STATE.getState === "function") {
          return clone(window.RCF_FACTORY_STATE.getState() || {});
        }
      } catch {}
      return {};
    })();

    const moduleSummary = (() => {
      try {
        if (window.RCF_MODULE_REGISTRY && typeof window.RCF_MODULE_REGISTRY.summary === "function") {
          return clone(window.RCF_MODULE_REGISTRY.summary() || {});
        }
      } catch {}
      return {};
    })();

    const treeSummary = (() => {
      try {
        if (window.RCF_FACTORY_TREE && typeof window.RCF_FACTORY_TREE.summary === "function") {
          return clone(window.RCF_FACTORY_TREE.summary() || {});
        }
      } catch {}
      return {};
    })();

    const treeAllPaths = (() => {
      try {
        if (window.RCF_FACTORY_TREE && typeof window.RCF_FACTORY_TREE.getAllPaths === "function") {
          return clone(window.RCF_FACTORY_TREE.getAllPaths() || []);
        }
      } catch {}
      return [];
    })();

    const treeGrouped = (() => {
      try {
        if (window.RCF_FACTORY_TREE && typeof window.RCF_FACTORY_TREE.getTree === "function") {
          return clone(window.RCF_FACTORY_TREE.getTree() || {});
        }
      } catch {}
      return {};
    })();

    const doctorApi = window.RCF_DOCTOR_SCAN || window.RCF_DOCTOR || null;

    const doctorReport = (() => {
      try {
        if (doctorApi?.lastReport) return clone(doctorApi.lastReport);
      } catch {}
      try {
        if (doctorApi?.lastRun) return clone(doctorApi.lastRun);
      } catch {}
      return null;
    })();

    const plannerStatus = (() => {
      try {
        return window.RCF_FACTORY_AI_PLANNER?.status?.() || {};
      } catch {}
      return {};
    })();

    const bridgeStatus = (() => {
      try {
        return window.RCF_FACTORY_AI_BRIDGE?.status?.() || {};
      } catch {}
      return {};
    })();

    const actionsStatus = (() => {
      try {
        return window.RCF_FACTORY_AI_ACTIONS?.status?.() || {};
      } catch {}
      return {};
    })();

    const brainStatus = (() => {
      try {
        return window.RCF_FACTORY_AI_BRAIN?.status?.() || {};
      } catch {}
      return {};
    })();

    const runtimeStatus = (() => {
      try {
        return window.RCF_FACTORY_AI_RUNTIME?.status?.() || {};
      } catch {}
      return {};
    })();

    const patchSupervisorStatus = (() => {
      try {
        return window.RCF_PATCH_SUPERVISOR?.status?.() || {};
      } catch {}
      return {};
    })();

    const identitySummary = (() => {
      try {
        return window.RCF_FACTORY_AI_IDENTITY?.summary?.() || {};
      } catch {}
      return {};
    })();

    return {
      factory: {
        version:
          factoryState.factoryVersion ||
          window.RCF_VERSION ||
          "unknown",
        engineVersion: factoryState.engineVersion || "unknown",
        bootStatus: factoryState.bootStatus || "unknown",
        bootTime: factoryState.bootTime || null,
        lastUpdate: factoryState.lastUpdate || null,
        runtimeVFS: factoryState.runtimeVFS || "unknown",
        environment: factoryState.environment || "unknown",
        userAgent: factoryState.userAgent || navigator.userAgent || "",
        activeView: factoryState.activeView || "",
        activeAppSlug: factoryState.activeAppSlug || "",
        loggerReady: !!factoryState.loggerReady || !!moduleSummary.logger || !!window.RCF_LOGGER,
        doctorReady: !!factoryState.doctorReady || !!moduleSummary.doctor || !!doctorApi,
        modules: clone(factoryState.modules || {}),
        flags: {
          hasLogger: !!window.RCF_LOGGER,
          hasDoctor: !!doctorApi,
          hasGitHub: !!window.RCF_GH_SYNC,
          hasVault: !!window.RCF_ZIP_VAULT,
          hasBridge: !!window.RCF_AGENT_ZIP_BRIDGE,
          hasAdminAI: !!window.RCF_ADMIN_AI,
          hasFactoryState: !!window.RCF_FACTORY_STATE,
          hasModuleRegistry: !!window.RCF_MODULE_REGISTRY,
          hasContextEngine: !!window.RCF_CONTEXT,
          hasFactoryTree: !!window.RCF_FACTORY_TREE,
          hasFactoryAI: !!window.RCF_FACTORY_AI || !!window.RCF_FACTORY_IA,
          hasFactoryAIPlanner: !!window.RCF_FACTORY_AI_PLANNER,
          hasFactoryAIBridge: !!window.RCF_FACTORY_AI_BRIDGE,
          hasFactoryAIActions: !!window.RCF_FACTORY_AI_ACTIONS,
          hasFactoryAIRuntime: !!window.RCF_FACTORY_AI_RUNTIME,
          hasPatchSupervisor: !!window.RCF_PATCH_SUPERVISOR,
          hasFactoryAIBrain: !!window.RCF_FACTORY_AI_BRAIN,
          hasFactoryAIIdentity: !!window.RCF_FACTORY_AI_IDENTITY
        }
      },
      doctor: {
        ready: !!doctorApi,
        version: doctorApi?.version || "unknown",
        lastRun: factoryState.doctorLastRun || doctorReport || null
      },
      modules: {
        version: moduleSummary.version || "unknown",
        total: Number(moduleSummary.total || 0),
        active: buildActiveModuleFallback(moduleSummary),
        logger: !!moduleSummary.logger,
        doctor: !!moduleSummary.doctor,
        github: !!moduleSummary.github,
        vault: !!moduleSummary.vault,
        bridge: !!moduleSummary.bridge,
        adminAI: !!moduleSummary.adminAI,
        factoryAI: !!moduleSummary.factoryAI,
        factoryState: !!moduleSummary.factoryState,
        moduleRegistry: !!moduleSummary.moduleRegistry,
        contextEngine: !!moduleSummary.contextEngine,
        factoryTree: !!moduleSummary.factoryTree,
        factoryAIPlanner: !!moduleSummary?.modules?.factoryAIPlanner,
        factoryAIBridge: !!moduleSummary?.modules?.factoryAIBridge,
        factoryAIActions: !!moduleSummary?.modules?.factoryAIActions,
        factoryAIRuntime: !!moduleSummary?.modules?.factoryAIRuntime,
        patchSupervisor: !!moduleSummary?.modules?.patchSupervisor,
        factoryAIBrain: !!moduleSummary?.modules?.factoryAIBrain,
        modules: clone(moduleSummary.modules || {})
      },
      planner: {
        ready: !!window.RCF_FACTORY_AI_PLANNER,
        version: window.RCF_FACTORY_AI_PLANNER?.version || "unknown",
        lastGoal: plannerStatus.lastGoal || "",
        lastPriority: plannerStatus.lastPriority || "",
        lastNextFile: plannerStatus.lastNextFile || ""
      },
      runtimeLayer: {
        ready: !!window.RCF_FACTORY_AI_RUNTIME,
        version: window.RCF_FACTORY_AI_RUNTIME?.version || "unknown",
        lastEndpoint: runtimeStatus.lastEndpoint || "",
        lastAction: runtimeStatus.lastAction || "",
        lastOk: !!runtimeStatus.lastOk,
        connectionStatus: runtimeStatus.connectionStatus || "unknown",
        connectionProvider: runtimeStatus.connectionProvider || "",
        connectionConfigured: !!runtimeStatus.connectionConfigured,
        connectionAttempted: !!runtimeStatus.connectionAttempted,
        connectionModel: runtimeStatus.connectionModel || "",
        connectionUpstreamStatus: Number(runtimeStatus.connectionUpstreamStatus || 0) || 0
      },
      bridgeLayer: {
        ready: !!window.RCF_FACTORY_AI_BRIDGE,
        version: window.RCF_FACTORY_AI_BRIDGE?.version || "unknown",
        approvalStatus: bridgeStatus.approvalStatus || "",
        targetFile: bridgeStatus.targetFile || "",
        risk: bridgeStatus.risk || "unknown"
      },
      actionsLayer: {
        ready: !!window.RCF_FACTORY_AI_ACTIONS,
        version: window.RCF_FACTORY_AI_ACTIONS?.version || "unknown",
        plannerReady: !!actionsStatus.plannerReady,
        bridgeReady: !!actionsStatus.bridgeReady,
        patchSupervisorReady: !!actionsStatus.patchSupervisorReady,
        runtimeReady: !!actionsStatus.runtimeReady,
        lastRuntimeCall: clone(actionsStatus.lastRuntimeCall || null)
      },
      brainLayer: {
        ready: !!window.RCF_FACTORY_AI_BRAIN,
        version: window.RCF_FACTORY_AI_BRAIN?.version || "unknown",
        lastIntent: brainStatus.lastIntent || "",
        lastRoute: brainStatus.lastRoute || "",
        lastTargetFile: brainStatus.lastTargetFile || "",
        identityName: identitySummary.name || "",
        identityRole: identitySummary.role || ""
      },
      patchSupervisor: {
        ready: !!window.RCF_PATCH_SUPERVISOR,
        version: window.RCF_PATCH_SUPERVISOR?.version || "unknown",
        hasStagedPatch: !!patchSupervisorStatus.hasStagedPatch,
        stagedTargetFile: patchSupervisorStatus.stagedTargetFile || "",
        lastApplyOk: !!patchSupervisorStatus.lastApplyOk
      },
      tree: {
        summary: clone(treeSummary.counts || treeSummary.summary || {}),
        pathsCount: Array.isArray(treeAllPaths) ? treeAllPaths.length : 0,
        samples: Array.isArray(treeAllPaths) ? treeAllPaths.slice(0, 20) : [],
        grouped: clone(treeGrouped || {})
      },
      environment: {
        href: location.href,
        userAgent: navigator.userAgent || "",
        platform: navigator.platform || "",
        language: navigator.language || "",
        ts: new Date().toISOString()
      }
    };
  }

  function getSnapshotRaw() {
    try {
      if (window.RCF_CONTEXT && typeof window.RCF_CONTEXT.getSnapshot === "function") {
        const ctx = window.RCF_CONTEXT.getSnapshot();
        if (ctx && typeof ctx === "object" && (ctx.factory || ctx.modules || ctx.tree)) {
          return ctx;
        }
      }
    } catch {}

    try {
      if (window.RCF_CONTEXT && typeof window.RCF_CONTEXT.getContext === "function") {
        const ctx = window.RCF_CONTEXT.getContext();
        if (ctx && typeof ctx === "object" && (ctx.factory || ctx.modules || ctx.tree)) {
          return ctx;
        }
      }
    } catch {}

    try {
      const raw = buildRawFromCoreModules();
      if (raw && (raw.factory || raw.modules || raw.tree)) {
        return raw;
      }
    } catch {}

    try {
      if (window.RCF_FACTORY_IA && typeof window.RCF_FACTORY_IA.getContext === "function") {
        const ctx = window.RCF_FACTORY_IA.getContext();
        if (ctx && typeof ctx === "object" && (ctx.factory || ctx.modules || ctx.tree)) {
          return ctx;
        }
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
    const planner = raw.factoryAIPlanner || raw.planner || {};
    const runtimeLayer = raw.factoryAIRuntime || raw.runtimeLayer || {};
    const bridgeLayer = raw.factoryAIBridge || raw.bridgeLayer || {};
    const actionsLayer = raw.factoryAIActions || raw.actionsLayer || {};
    const brainLayer = raw.factoryAIBrain || raw.brainLayer || {};
    const patchSupervisor = raw.patchSupervisor || {};
    const state = window.RCF?.state || {};
    const identitySummary = (() => {
      try { return window.RCF_FACTORY_AI_IDENTITY?.summary?.() || {}; } catch { return {}; }
    })();

    const activeModules = (() => {
      try {
        if (Array.isArray(modules.active) && modules.active.length) return modules.active;
        const map = modules.modules || {};
        return Object.keys(map).filter((k) => !!map[k]);
      } catch {
        return [];
      }
    })();

    return {
      factory: {
        version: factory.version || "unknown",
        engineVersion: factory.engineVersion || "unknown",
        bootStatus: factory.bootStatus || "unknown",
        bootTime: factory.bootTime || null,
        runtimeVFS: factory.runtimeVFS || "unknown",
        loggerReady: !!factory.loggerReady,
        doctorReady: !!factory.doctorReady,
        environment: factory.environment || "unknown",
        lastUpdate: factory.lastUpdate || null,
        mountedAs: "Factory AI",
        activeView: state?.active?.view || factory.activeView || "",
        activeAppSlug: state?.active?.appSlug || factory.activeAppSlug || "",
        bootedAt: STATE.bootedAt
      },
      doctor: {
        version: doctor.version || "unknown",
        lastRun: doctor.lastRun || null
      },
      modules: {
        active: activeModules,
        status: {
          logger: !!modules.logger,
          doctor: !!modules.doctor,
          github: !!modules.github,
          vault: !!modules.vault,
          bridge: !!modules.bridge,
          adminAI: !!modules.adminAI,
          factoryAI: !!modules.factoryAI || true,
          factoryState: !!modules.factoryState,
          moduleRegistry: !!modules.moduleRegistry,
          contextEngine: !!modules.contextEngine,
          factoryTree: !!modules.factoryTree,
          factoryAIPlanner: !!modules.factoryAIPlanner,
          factoryAIBridge: !!modules.factoryAIBridge,
          factoryAIActions: !!modules.factoryAIActions,
          factoryAIRuntime: !!modules.factoryAIRuntime,
          patchSupervisor: !!modules.patchSupervisor,
          factoryAIBrain: !!modules.factoryAIBrain
        },
        total: Number(modules.total || 0)
      },
      planner: {
        ready: !!planner.ready,
        version: planner.version || "unknown",
        lastGoal: planner.lastGoal || "",
        lastPriority: planner.lastPriority || "",
        lastNextFile: planner.lastNextFile || ""
      },
      runtimeLayer: {
        ready: !!runtimeLayer.ready || !!window.RCF_FACTORY_AI_RUNTIME,
        version: runtimeLayer.version || window.RCF_FACTORY_AI_RUNTIME?.version || "unknown",
        lastEndpoint: runtimeLayer.lastEndpoint || STATE.lastEndpoint || "",
        lastAction: runtimeLayer.lastAction || "",
        lastOk: !!runtimeLayer.lastOk,
        connectionStatus: runtimeLayer.connectionStatus || "",
        connectionProvider: runtimeLayer.connectionProvider || "",
        connectionConfigured: !!runtimeLayer.connectionConfigured,
        connectionAttempted: !!runtimeLayer.connectionAttempted,
        connectionModel: runtimeLayer.connectionModel || "",
        connectionUpstreamStatus: Number(runtimeLayer.connectionUpstreamStatus || 0) || 0
      },
      bridgeLayer: {
        ready: !!bridgeLayer.ready,
        version: bridgeLayer.version || "unknown",
        approvalStatus: bridgeLayer.approvalStatus || "",
        targetFile: bridgeLayer.targetFile || "",
        risk: bridgeLayer.risk || "unknown"
      },
      actionsLayer: {
        ready: !!actionsLayer.ready,
        version: actionsLayer.version || "unknown",
        plannerReady: !!actionsLayer.plannerReady,
        bridgeReady: !!actionsLayer.bridgeReady,
        patchSupervisorReady: !!actionsLayer.patchSupervisorReady,
        runtimeReady: !!actionsLayer.runtimeReady,
        lastRuntimeCall: clone(actionsLayer.lastRuntimeCall || null)
      },
      brainLayer: {
        ready: !!brainLayer.ready || !!window.RCF_FACTORY_AI_BRAIN,
        version: brainLayer.version || window.RCF_FACTORY_AI_BRAIN?.version || "unknown",
        lastIntent: brainLayer.lastIntent || "",
        lastRoute: brainLayer.lastRoute || "",
        lastTargetFile: brainLayer.lastTargetFile || "",
        identityName: identitySummary.name || "",
        identityRole: identitySummary.role || ""
      },
      patchSupervisor: {
        ready: !!patchSupervisor.ready,
        version: patchSupervisor.version || "unknown",
        hasStagedPatch: !!patchSupervisor.hasStagedPatch,
        stagedTargetFile: patchSupervisor.stagedTargetFile || "",
        lastApplyOk: !!patchSupervisor.lastApplyOk
      },
      tree: {
        pathsCount: Number(tree.pathsCount || 0),
        summary: tree.summary || {},
        samples: Array.isArray(tree.samples) ? tree.samples.slice(0, 12) : [],
        grouped: tree.grouped || {}
      },
      flags: {
        hasLogger: !!factory.flags?.hasLogger,
        hasDoctor: !!factory.flags?.hasDoctor,
        hasGitHub: !!factory.flags?.hasGitHub,
        hasFactoryAI: !!factory.flags?.hasFactoryAI || true,
        hasFactoryState: !!factory.flags?.hasFactoryState,
        hasModuleRegistry: !!factory.flags?.hasModuleRegistry,
        hasContextEngine: !!factory.flags?.hasContextEngine,
        hasFactoryTree: !!factory.flags?.hasFactoryTree,
        hasAdminAI: !!factory.flags?.hasAdminAI,
        hasVault: !!factory.flags?.hasVault,
        hasBridge: !!factory.flags?.hasBridge,
        hasFactoryAIPlanner: !!factory.flags?.hasFactoryAIPlanner,
        hasFactoryAIBridge: !!factory.flags?.hasFactoryAIBridge,
        hasFactoryAIActions: !!factory.flags?.hasFactoryAIActions,
        hasFactoryAIRuntime: !!factory.flags?.hasFactoryAIRuntime || !!window.RCF_FACTORY_AI_RUNTIME,
        hasPatchSupervisor: !!factory.flags?.hasPatchSupervisor,
        hasFactoryAIBrain: !!factory.flags?.hasFactoryAIBrain || !!window.RCF_FACTORY_AI_BRAIN,
        hasFactoryAIIdentity: !!factory.flags?.hasFactoryAIIdentity || !!window.RCF_FACTORY_AI_IDENTITY
      },
      identity: {
        name: identitySummary.name || "",
        role: identitySummary.role || "",
        mission: identitySummary.mission || ""
      },
      environment: {
        platform: environment.platform || navigator.platform || "",
        language: environment.language || navigator.language || "",
        href: environment.href || location.href || "",
        ts: environment.ts || new Date().toISOString()
      },
      frontTelemetry: {
        lastEndpoint: STATE.lastFrontEndpoint || STATE.lastEndpoint || "",
        lastAction: STATE.lastFrontAction || "",
        lastResponseAt: STATE.lastFrontResponseAt || "",
        lastResponseOk: !!STATE.lastFrontResponseOk,
        lastRouting: clone(STATE.lastFrontRouting || null)
      }
    };
  }


  function touchFrontTelemetry(ok, routing, endpoint, action) {
    try {
      const patch = {
        lastEndpoint: endpoint || STATE.lastFrontEndpoint || STATE.lastEndpoint || "/api/admin-ai",
        lastAction: action || STATE.lastFrontAction || "",
        lastResponseAt: new Date().toISOString(),
        lastResponseOk: !!ok,
        lastRouting: routing || STATE.lastFrontRouting || "runtime"
      };

      STATE.lastFrontEndpoint = String(patch.lastEndpoint || "");
      STATE.lastFrontAction = String(patch.lastAction || "");
      STATE.lastFrontResponseAt = String(patch.lastResponseAt || "");
      STATE.lastFrontResponseOk = !!patch.lastResponseOk;
      STATE.lastFrontRouting = clone(patch.lastRouting || null);

      window.__RCF_FRONT_TELEMETRY__ = Object.assign({}, window.__RCF_FRONT_TELEMETRY__ || {}, clone(patch));
    } catch {}
  }

  function buildFrontTelemetrySnapshot() {
    try {
      const t = window.__RCF_FRONT_TELEMETRY__ || {};
      return {
        lastEndpoint: STATE.lastFrontEndpoint || t.lastEndpoint || STATE.lastEndpoint || "/api/admin-ai",
        lastAction: STATE.lastFrontAction || t.lastAction || "",
        lastResponseAt: STATE.lastFrontResponseAt || t.lastResponseAt || "",
        lastResponseOk: (typeof STATE.lastFrontResponseOk === "boolean") ? !!STATE.lastFrontResponseOk : !!t.lastResponseOk,
        lastRouting: clone(STATE.lastFrontRouting || t.lastRouting || "runtime")
      };
    } catch {
      return {
        lastEndpoint: "/api/admin-ai",
        lastAction: "",
        lastResponseAt: "",
        lastResponseOk: false,
        lastRouting: "runtime"
      };
    }
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
  overflow-x:hidden;
  width:100%;
  max-width:100%;
}
#${BOX_ID},
#${BOX_ID} *,
#${CHAT_ID}{
  box-sizing:border-box;
}
#${BOX_ID}.card{
  padding:0;
  max-width:100%;
}
#${BOX_ID} .rcfAiShell{
  display:grid;
  grid-template-rows:auto 1fr auto;
  min-height:620px;
  width:100%;
  max-width:100%;
  min-width:0;
  overflow:hidden;
}
#${BOX_ID} .rcfAiHead{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  padding:14px 16px 12px;
  border-bottom:1px solid rgba(31,41,55,.06);
  background:rgba(255,255,255,.72);
  min-width:0;
  overflow:hidden;
}
#${BOX_ID} .rcfAiHeadLeft{
  min-width:0;
  display:flex;
  align-items:center;
  gap:10px;
  overflow:hidden;
}
#${BOX_ID} .rcfAiHeadActions{
  min-width:0;
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  flex-wrap:nowrap;
  overflow:hidden;
}
#${BOX_ID} .rcfAiAvatar{
  width:36px;
  height:36px;
  min-width:36px;
  border-radius:14px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:18px;
  border:1px solid rgba(95,115,155,.12);
  background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(239,244,252,.92));
}
#${BOX_ID} .rcfAiHeadText{
  min-width:0;
  overflow:hidden;
}
#${BOX_ID} .rcfAiHeadTitle{
  margin:0;
  font-size:18px;
  line-height:1.05;
  font-weight:900;
  color:#202d4d;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
#${BOX_ID} .rcfAiHeadSub{
  display:none;
}
#${BOX_ID} .rcfAiPill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:30px;
  max-width:160px;
  padding:0 10px;
  border-radius:999px;
  border:1px solid rgba(90,110,150,.12);
  background:rgba(255,255,255,.82);
  font-size:11px;
  font-weight:800;
  color:rgba(32,45,77,.76);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
#${BOX_ID} .rcfAiHeadBtn{
  min-height:30px;
  height:30px;
  padding:0 10px;
  border-radius:999px;
  border:1px solid rgba(31,41,55,.08);
  background:rgba(255,255,255,.94);
  color:#5a6b98;
  font-size:12px;
  font-weight:800;
  cursor:pointer;
  flex:0 0 auto;
}
#${CHAT_ID}{
  min-height:320px;
  max-height:52vh;
  overflow:auto;
  overflow-x:hidden;
  padding:14px;
  background:linear-gradient(180deg,rgba(246,248,252,.72),rgba(250,251,255,.62));
  overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
  touch-action:pan-y;
  min-width:0;
  width:100%;
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
  min-width:0;
}
#${BOX_ID} .rcfAiMsgRow.user{
  justify-content:flex-end;
}
#${BOX_ID} .rcfAiMsgRow.assistant{
  justify-content:flex-start;
}
#${BOX_ID} .rcfAiBubble{
  width:min(100%, 720px);
  max-width:100%;
  min-width:0;
  padding:14px 16px;
  border-radius:20px;
  border:1px solid rgba(31,41,55,.08);
  background:rgba(255,255,255,.92);
  box-shadow:0 2px 10px rgba(15,23,42,.04);
  overflow:hidden;
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
  line-height:1.54;
  color:#202d4d;
  font-size:15px;
  min-width:0;
}
#${BOX_ID} .rcfAiParagraph{
  white-space:pre-wrap;
  word-break:break-word;
  overflow-wrap:anywhere;
  margin:0 0 10px 0;
}
#${BOX_ID} .rcfAiParagraph:last-child{
  margin-bottom:0;
}
#${BOX_ID} .rcfAiCodeWrap{
  margin:10px 0;
  border:1px solid rgba(31,41,55,.08);
  border-radius:16px;
  overflow:hidden;
  background:#0f172a;
  max-width:100%;
}
#${BOX_ID} .rcfAiCodeHead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:8px 10px;
  background:rgba(255,255,255,.06);
  color:#dbe7ff;
  font-size:12px;
  font-weight:800;
}
#${BOX_ID} .rcfAiCodeBtn{
  min-width:70px;
  height:28px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.08);
  color:#eef4ff;
  font-size:12px;
  font-weight:800;
  cursor:pointer;
}
#${BOX_ID} .rcfAiCodePre{
  margin:0;
  padding:12px;
  overflow:auto;
  font-size:12px;
  line-height:1.5;
  color:#eef4ff;
  white-space:pre;
  max-width:100%;
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
  flex-wrap:wrap;
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
  padding:0 10px;
  font-weight:800;
}
#${BOX_ID} .rcfAiComposer{
  display:grid;
  gap:10px;
  padding:12px 14px 14px;
  border-top:1px solid rgba(31,41,55,.06);
  background:rgba(255,255,255,.82);
  min-width:0;
  width:100%;
  max-width:100%;
  overflow:hidden;
}
#${BOX_ID} .rcfAiAttachRow{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  min-width:0;
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
  grid-template-columns:30px minmax(0,1fr);
  gap:10px;
  align-items:end;
  min-width:0;
  width:100%;
}
#${BOX_ID} .rcfAiAttachWrap{
  position:relative;
  display:flex;
  align-items:flex-end;
  justify-content:center;
  width:30px;
  min-width:30px;
  padding-bottom:8px;
  flex:0 0 30px;
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
  grid-template-columns:minmax(0,1fr) 38px 38px;
  align-items:end;
  gap:6px;
  min-height:54px;
  min-width:0;
  width:100%;
  max-width:100%;
  padding:6px 8px;
  border-radius:18px;
  border:1px solid rgba(31,41,55,.10);
  background:#fff;
  box-shadow:0 1px 0 rgba(255,255,255,.65) inset;
  overflow:hidden;
}
#${BOX_ID} .rcfAiPrompt{
  width:100%;
  min-width:0;
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
  overflow:auto;
}
#${BOX_ID} .rcfAiPrompt::placeholder{
  color:rgba(24,35,63,.38);
}
#${BOX_ID} .rcfAiVoiceBtn{
  width:38px;
  height:38px;
  min-width:38px;
  border:none;
  background:transparent;
  color:#7b8ab7;
  font-size:19px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:12px;
  flex:0 0 38px;
}
#${BOX_ID} .rcfAiVoiceBtn.listening{
  background:rgba(112,152,255,.12);
  color:#26407a;
}
#${BOX_ID} .rcfAiSendBtn{
  width:38px;
  height:38px;
  min-width:38px;
  min-height:38px;
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
  flex:0 0 38px;
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
  min-width:0;
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
  min-width:0;
  overflow:hidden;
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
  overflow-wrap:anywhere;
}
#${BOX_ID} .rcfAiHiddenInput{
  display:none;
}
@media (max-width: 720px){
  #${BOX_ID}{ border-radius:22px; }
  #${BOX_ID} .rcfAiShell{ min-height:560px; }
  #${BOX_ID} .rcfAiHead{
    grid-template-columns:minmax(0,1fr);
    align-items:start;
    gap:8px;
    padding:12px 14px 10px;
  }
  #${BOX_ID} .rcfAiHeadLeft{ gap:8px; }
  #${BOX_ID} .rcfAiAvatar{
    width:32px;height:32px;min-width:32px;font-size:16px;border-radius:12px;
  }
  #${BOX_ID} .rcfAiHeadTitle{ font-size:16px; }
  #${BOX_ID} .rcfAiHeadActions{
    width:100%;
    justify-content:space-between;
    gap:8px;
  }
  #${BOX_ID} .rcfAiPill{
    max-width:calc(100% - 84px);
    font-size:10px;
    min-height:28px;
    padding:0 8px;
  }
  #${CHAT_ID}{
    padding:12px;
    max-height:48vh;
  }
  #${BOX_ID} .rcfAiComposer{
    padding:10px 12px 12px;
    gap:8px;
  }
  #${BOX_ID} .rcfAiInputShell{
    grid-template-columns:28px minmax(0,1fr);
    gap:8px;
  }
  #${BOX_ID} .rcfAiAttachWrap{
    width:28px;
    min-width:28px;
    flex-basis:28px;
    padding-bottom:7px;
  }
  #${BOX_ID} .rcfAiAttachBtn{
    width:26px;
    height:26px;
    min-width:26px;
    font-size:30px;
  }
  #${BOX_ID} .rcfAiInputCard{
    grid-template-columns:minmax(0,1fr) 36px 36px;
    gap:4px;
    padding:6px 6px;
    min-height:52px;
  }
  #${BOX_ID} .rcfAiPrompt{
    padding:9px 4px;
    font-size:16px;
  }
  #${BOX_ID} .rcfAiVoiceBtn{
    width:36px;
    height:36px;
    min-width:36px;
    font-size:18px;
  }
  #${BOX_ID} .rcfAiSendBtn{
    width:36px;
    height:36px;
    min-width:36px;
    min-height:36px;
    font-size:15px;
  }
  #${BOX_ID} .rcfAiAttachmentName{
    max-width:100px;
  }
}
@media (max-width: 420px){
  #${BOX_ID} .rcfAiHeadBtn{
    min-width:72px;
    padding:0 8px;
    font-size:11px;
  }
  #${BOX_ID} .rcfAiPill{
    max-width:calc(100% - 78px);
  }
}`.trim();

    document.head.appendChild(st);
  }

  function parseMessageToBlocks(text) {
    const src = String(text || "");
    const regex = /```([\w-]*)\n?([\s\S]*?)```/g;
    const blocks = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(src))) {
      const before = src.slice(lastIndex, match.index);
      if (before) blocks.push({ type: "text", value: before });

      blocks.push({
        type: "code",
        lang: String(match[1] || "").trim(),
        value: String(match[2] || "")
      });

      lastIndex = regex.lastIndex;
    }

    const tail = src.slice(lastIndex);
    if (tail) blocks.push({ type: "text", value: tail });
    if (!blocks.length) blocks.push({ type: "text", value: src });

    return blocks;
  }

  function renderTextBlock(text) {
    const parts = String(text || "").split(/\n{2,}/);
    return parts.map(part => `<p class="rcfAiParagraph">${esc(part)}</p>`).join("");
  }

  function renderCodeBlock(code, lang, idx, codeIdx) {
    const safeLang = esc(lang || "code");
    const safeCode = esc(code || "");
    const codeId = `rcfFactoryAICode_${idx}_${codeIdx}`;
    return `
      <div class="rcfAiCodeWrap">
        <div class="rcfAiCodeHead">
          <span>${safeLang || "code"}</span>
          <button class="rcfAiCodeBtn" type="button" data-rcf-copy-code="${codeId}">Copiar</button>
        </div>
        <pre class="rcfAiCodePre" id="${codeId}"><code>${safeCode}</code></pre>
      </div>
    `;
  }

  function renderMessageText(text, idx) {
    const blocks = parseMessageToBlocks(text);
    let codeIdx = 0;

    return blocks.map((block) => {
      if (block.type === "code") {
        const html = renderCodeBlock(block.value, block.lang, idx, codeIdx);
        codeIdx += 1;
        return html;
      }
      return renderTextBlock(block.value);
    }).join("");
  }

  async function copyText(text) {
    const value = String(text || "");
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
        setComposerStatus("copiado");
        return true;
      }
    } catch {}

    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setComposerStatus("copiado");
      return true;
    } catch {}

    setComposerStatus("falha ao copiar");
    return false;
  }

  function bindCopyButtons(root) {
    qsa("[data-rcf-copy-msg]", root).forEach((btn) => {
      if (btn.__boundCopyMsg) return;
      btn.__boundCopyMsg = true;
      btn.addEventListener("click", async () => {
        const idx = Number(btn.getAttribute("data-rcf-copy-msg"));
        const item = Array.isArray(STATE.history) ? STATE.history[idx] : null;
        if (item && item.text) await copyText(item.text);
      });
    });

    qsa("[data-rcf-copy-code]", root).forEach((btn) => {
      if (btn.__boundCopyCode) return;
      btn.__boundCopyCode = true;
      btn.addEventListener("click", async () => {
        const targetId = btn.getAttribute("data-rcf-copy-code");
        const el = targetId ? document.getElementById(targetId) : null;
        const txt = el ? String(el.textContent || "") : "";
        await copyText(txt);
      });
    });
  }

  function getHistorySignature() {
    try {
      const last = STATE.history.slice(-6);
      return JSON.stringify(last);
    } catch {
      return String((STATE.history || []).length);
    }
  }

  function renderChat(options = {}) {
    const box = document.getElementById(CHAT_ID);
    if (!box) return;

    const forceBottom = !!options.forceBottom;
    const signature = getHistorySignature();

    bindChatScroll();

    if (!Array.isArray(STATE.history) || !STATE.history.length) {
      if (STATE.lastRenderSignature !== "__empty__") {
        box.innerHTML = `
          <div class="rcfAiEmpty">
            Converse com a Factory AI para analisar arquitetura, corrigir módulos, revisar contexto e estruturar a própria Factory.
          </div>
        `;
        STATE.lastRenderSignature = "__empty__";
      }
      if (forceBottom) scrollChatToBottom(true);
      return;
    }

    const shouldReuse = STATE.renderedOnce && STATE.lastRenderSignature === signature && !forceBottom;
    if (shouldReuse) return;

    const wasNearBottom = isNearBottom(box, 56);
    if (wasNearBottom) STATE.pinnedToBottom = true;

    box.innerHTML = STATE.history.map((item, idx) => {
      const isUser = item.role === "user";
      const canSpeak = !isUser;
      const canCopy = !isUser;
      return `
        <div class="rcfAiMsgRow ${isUser ? "user" : "assistant"}">
          <div class="rcfAiBubble ${isUser ? "userBubble" : ""}">
            <div class="rcfAiMsgLabel">${isUser ? "Você" : "Factory AI"}</div>
            <div class="rcfAiMsgText">${renderMessageText(item.text, idx)}</div>
            <div class="rcfAiMsgTime">${esc(item.ts)}</div>
            ${!isUser ? `
              <div class="rcfAiMsgTools">
                ${canCopy ? `<button class="rcfAiMiniBtn" type="button" data-rcf-copy-msg="${idx}" title="Copiar resposta">Copiar</button>` : ``}
                ${canSpeak ? `<button class="rcfAiMiniBtn" type="button" data-rcf-speak-idx="${idx}" title="Ler resposta">🔊</button>` : ``}
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

    bindCopyButtons(box);

    STATE.lastRenderSignature = signature;
    STATE.renderedOnce = true;

    if (forceBottom || STATE.pinnedToBottom || wasNearBottom) {
      scrollChatToBottom(true);
    }
  }

  function clearChat() {
    STATE.history = [];
    persistHistory();
    STATE.lastRenderSignature = "";
    STATE.renderedOnce = false;
    renderChat();
    setComposerStatus("aguardando");
    setTechResult("Pronto.");
    setSnapshotPreview({});
  }

  function inferActionFromPrompt(prompt) {
    const p = String(prompt || "").trim().toLowerCase();

    if (!p) return "chat";

    if (
      p.includes("openai") ||
      p.includes("api key") ||
      p.includes("status real") ||
      p.includes("teste real") ||
      p.includes("runtime") ||
      p.includes("backend") ||
      p.includes("endpoint") ||
      p.includes("conexão") ||
      p.includes("conexao") ||
      p.includes("/api/admin-ai")
    ) return "openai_status";

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
      p.includes("video") ||
      p.includes("áudio") ||
      p.includes("audio")
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

  function inferLocalActionFromPrompt(prompt) {

// --------------------------------------------------
// SAFETY: structured / long prompts must NOT become local actions
// prevents validate_patch hijacking diagnostic reports
// --------------------------------------------------
try {
  const txt = String(prompt || "").trim();

  const structured =
    txt.includes("Fatos confirmados") ||
    txt.includes("Dados ausentes") ||
    txt.includes("Estado real") ||
    txt.includes("Próximo passo mínimo") ||
    txt.includes("runtimeLayer");

  if (txt.length > 600 || structured) {
    return null;
  }
} catch {}

    const p = String(prompt || "").trim().toLowerCase();

    if (!p) return "";

    if (
      (p.includes("aprovar") || p.includes("aprova")) &&
      p.includes("patch")
    ) return "approve_patch";

    if (
      (p.includes("validar") || p.includes("valida")) &&
      p.includes("patch")
    ) return "validate_patch";

    if (
      p.includes("stage") &&
      p.includes("patch")
    ) return "stage_patch";

    if (
      (p.includes("aplicar") || p.includes("aplica")) &&
      p.includes("patch")
    ) return "apply_patch";

    if (
      p.includes("planejar") ||
      p.includes("gerar plano") ||
      p.includes("montar plano") ||
      (p.includes("plano") && p.includes("próximo"))
    ) return "plan";

    if (
      p.includes("próximo arquivo") ||
      p.includes("proximo arquivo")
    ) return "next_file";

    if (
      p.includes("snapshot local") ||
      p.includes("snapshot do runtime") ||
      p.includes("mostrar snapshot") ||
      p.includes("estado local")
    ) return "snapshot";

    if (
      p.includes("rodar doctor") ||
      p.includes("executar doctor") ||
      p.includes("run doctor")
    ) return "run_doctor";

    if (
      p.includes("coletar logs") ||
      p.includes("mostrar logs locais")
    ) return "collect_logs";

    return "";
  }

  function buildPayload(action) {
    const snapshot = buildLeanSnapshot();

    try {
      snapshot.frontTelemetry = buildFrontTelemetrySnapshot();
    } catch {}

    let runtimeLayer = {};
    let moduleRegistry = {};
    let factoryState = {};
    let doctor = {};

    try {
      runtimeLayer = clone(window.RCF_FACTORY_AI_RUNTIME?.status?.() || {});
    } catch {}

    try {
      moduleRegistry = clone(window.RCF_MODULE_REGISTRY?.summary?.() || {});
    } catch {}

    try {
      const st = window.RCF_FACTORY_STATE?.getState?.() || {};
      factoryState = {
        activeModulesCount: Number(st.activeModulesCount || 0) || 0,
        activeList: Array.isArray(st.activeList) ? clone(st.activeList).slice(0, 60) : [],
        frontTelemetry: clone(st.frontTelemetry || {}),
        runtimeLayer: clone(st.runtimeLayer || {})
      };
    } catch {}

    try {
      doctor = {
        lastRun: clone(window.RCF_DOCTOR_SCAN?.lastRun || window.RCF_DOCTOR?.lastRun || null),
        lastReport: clone(window.RCF_DOCTOR_SCAN?.lastReport || window.RCF_DOCTOR?.lastReport || null),
        version: String(window.RCF_DOCTOR_SCAN?.version || window.RCF_DOCTOR?.version || "")
      };
    } catch {}

    setSnapshotPreview(snapshot);
    const attachments = getAttachmentPayload();

    if (action === "analyze-logs") {
      return {
        snapshot,
        runtimeLayer,
        frontTelemetry: buildFrontTelemetrySnapshot(),
        moduleRegistry,
        factoryState,
        doctor,
        logs: collectLogs(),
        attachments
      };
    }

    if (action === "factory_diagnosis") {
      return {
        snapshot,
        runtimeLayer,
        frontTelemetry: buildFrontTelemetrySnapshot(),
        moduleRegistry,
        factoryState,
        doctor: Object.assign({}, doctor, collectDoctorReport() || {}),
        attachments
      };
    }

    if (action === "propose-patch" || action === "generate-code") {
      return {
        snapshot,
        runtimeLayer,
        frontTelemetry: buildFrontTelemetrySnapshot(),
        moduleRegistry,
        factoryState,
        doctor: Object.assign({}, doctor, collectDoctorReport() || {}),
        logs: collectLogs(25),
        attachments
      };
    }

    if (action === "review-module") {
      return {
        snapshot,
        runtimeLayer,
        frontTelemetry: buildFrontTelemetrySnapshot(),
        moduleRegistry,
        factoryState,
        doctor: Object.assign({}, doctor, collectDoctorReport() || {}),
        logs: collectLogs(12),
        attachments
      };
    }

    if (action === "zip-readiness") {
      return {
        snapshot,
        runtimeLayer,
        frontTelemetry: buildFrontTelemetrySnapshot(),
        moduleRegistry,
        factoryState,
        doctor,
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

    return {
      snapshot,
      runtimeLayer,
      frontTelemetry: buildFrontTelemetrySnapshot(),
      moduleRegistry,
      factoryState,
      doctor,
      attachments
    };
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

  function appendRuntimeMetaNote(text, result) {
    const base = trim(text);
    const hints = result?.response?.hints || result?.hints || {};
    const connection = result?.connection || result?.response?.connection || {};
    const incomplete = !!hints.incomplete;
    const responseStatus = trim(hints.responseStatus || "");
    const incompleteReason = trim(hints.incompleteReason || "");
    const connStatus = trim(connection.status || "");

    if (!base) return "";

    if (!incomplete && responseStatus !== "incomplete" && connStatus !== "partial") {
      return base;
    }

    const noteParts = [];
    if (responseStatus) noteParts.push(`responseStatus=${responseStatus}`);
    if (incompleteReason) noteParts.push(`motivo=${incompleteReason}`);
    if (connStatus) noteParts.push(`connection=${connStatus}`);

    if (!noteParts.length) return base;

    return [
      base,
      "",
      "Observação do runtime:",
      `- saída parcial detectada (${noteParts.join(" | ")})`
    ].join("\n");
  }

  function extractRuntimeMessage(result) {
    const direct =
      trim(result?.analysis) ||
      trim(result?.answer) ||
      trim(result?.result);

    if (direct) return appendRuntimeMetaNote(direct, result);

    const responseAnalysis =
      trim(result?.response?.analysis) ||
      trim(result?.response?.answer) ||
      trim(result?.response?.result);

    if (responseAnalysis) return appendRuntimeMetaNote(responseAnalysis, result);

    const nestedError =
      trim(result?.error) ||
      trim(result?.response?.error);

    if (nestedError) {
      const analysisFallback =
        trim(result?.response?.details?.analysis) ||
        trim(result?.response?.details?.answer) ||
        trim(result?.response?.details?.result);

      if (analysisFallback) return appendRuntimeMetaNote(analysisFallback, result);

      return nestedError;
    }

    return pretty(result || { ok: false, msg: "sem resposta do runtime" });
  }

  function formatPlanResult(planResult) {
    const plan = planResult?.plan || {};
    const summary = planResult?.summary?.plan || {};

    const targetFile = plan.nextFile || plan.targetFile || summary.targetFile || "";
    const executionLine = Array.isArray(plan.executionLine) ? plan.executionLine : [];
    const ranking = Array.isArray(plan.ranking) ? plan.ranking.slice(0, 5) : [];
    const notes = Array.isArray(plan.notes) ? plan.notes : [];

    return [
      "1. Fatos confirmados",
      `- Planner local executado: ${!!planResult?.ok}`,
      `- Próximo arquivo calculado: ${targetFile || "dado ausente"}`,
      `- Prioridade: ${plan.priority || "dado ausente"}`,
      "",
      "2. Dados ausentes ou mal consolidados",
      "- O plano depende do snapshot atual do runtime; se algum módulo não apareceu no snapshot, ele pode estar fora da árvore/contexto atual.",
      "",
      "3. Inferências prováveis",
      executionLine.length
        ? `- Linha provável de execução: ${executionLine.join(" -> ")}`
        : "- Linha de execução ainda não consolidada.",
      notes.length
        ? `- Nota principal: ${notes[0]}`
        : "- O planner aponta que a próxima etapa deve continuar a camada supervisionada.",
      "",
      "4. Próximo passo mínimo recomendado",
      targetFile
        ? `- Trabalhar o arquivo ${targetFile}`
        : "- Revisar snapshot e recalcular plano.",
      "",
      "5. Arquivos mais prováveis de ajuste",
      ranking.length
        ? ranking.map((item) => `- ${item.file} (${item.score})`).join("\n")
        : "- dado ausente"
    ].join("\n");
  }

  function formatNextFileResult(result) {
    const suggestion = result?.suggestion || result?.nextFile || {};
    return [
      "1. Fatos confirmados",
      `- Sugestão local calculada: ${!!result?.ok}`,
      `- Próximo arquivo: ${suggestion.nextFile || "dado ausente"}`,
      "",
      "2. Dados ausentes ou mal consolidados",
      "- A sugestão depende do plano e do snapshot disponíveis no runtime atual.",
      "",
      "3. Inferências prováveis",
      `- Origem da sugestão: ${suggestion.source || "desconhecida"}`,
      `- Risco estimado: ${suggestion.risk || "unknown"}`,
      "",
      "4. Próximo passo mínimo recomendado",
      `- ${suggestion.reason || "Usar o próximo arquivo sugerido como base."}`,
      "",
      "5. Arquivos mais prováveis de ajuste",
      `- ${suggestion.nextFile || "dado ausente"}`
    ].join("\n");
  }

  function formatValidationResult(result) {
    const validation = result?.validation || {};
    const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
    const errors = Array.isArray(validation.errors) ? validation.errors : [];

    return [
      "1. Fatos confirmados",
      `- Validação executada: ${!!result?.ok}`,
      `- PlanId: ${result?.planId || validation?.planId || "dado ausente"}`,
      "",
      "2. Dados ausentes ou mal consolidados",
      errors.length ? errors.map((x) => `- ${x}`).join("\n") : "- Nenhum erro estrutural retornado pela validação.",
      "",
      "3. Inferências prováveis",
      warnings.length ? warnings.map((x) => `- ${x}`).join("\n") : "- O plano parece coerente para seguir no fluxo supervisionado.",
      "",
      "4. Próximo passo mínimo recomendado",
      result?.ok ? "- Seguir para stage do patch." : "- Corrigir o plano antes de stage/apply.",
      "",
      "5. Arquivos mais prováveis de ajuste",
      `- ${validation?.normalized?.targetFile || "dado ausente"}`
    ].join("\n");
  }

  function formatStageOrApplyResult(title, result) {
    const staged = result?.stagedPatch || {};
    return [
      "1. Fatos confirmados",
      `- ${title}: ${!!result?.ok}`,
      `- Arquivo alvo: ${result?.targetFile || staged?.targetFile || "dado ausente"}`,
      `- PlanId: ${result?.planId || staged?.planId || "dado ausente"}`,
      "",
      "2. Dados ausentes ou mal consolidados",
      result?.ok ? "- Sem ausência crítica reportada nesta etapa." : `- ${result?.msg || "falha não detalhada"}`,
      "",
      "3. Inferências prováveis",
      `- Risco: ${result?.risk || staged?.risk || "unknown"}`,
      `- Modo: ${result?.mode || staged?.mode || "dado ausente"}`,
      "",
      "4. Próximo passo mínimo recomendado",
      title === "Stage"
        ? (result?.ok ? "- Seguir para apply supervisionado quando aprovado." : "- Corrigir o plano antes de repetir o stage.")
        : (result?.ok ? "- Revalidar runtime e revisar o resultado aplicado." : "- Revisar writer/runtime antes de tentar novo apply."),
      "",
      "5. Arquivos mais prováveis de ajuste",
      `- ${result?.targetFile || staged?.targetFile || "dado ausente"}`
    ].join("\n");
  }

  function formatSnapshotResult(result) {
    const runtime = result?.runtime || {};
    const nextFile = result?.nextFile || {};
    const bridge = result?.bridge || {};
    const planner = result?.planner || {};
    const supervisor = result?.patchSupervisor || {};
    const runtimeLayer = result?.runtimeLayer || {};
    const adminFront = result?.adminFront || {};

    return [
      "1. Fatos confirmados",
      `- Snapshot local consolidado: ${!!result?.ok}`,
      `- Planner ready: ${!!planner.ready}`,
      `- Bridge ready: ${!!bridge.ready}`,
      `- Patch Supervisor ready: ${!!supervisor.ready}`,
      `- Runtime ready: ${!!runtimeLayer.ready}`,
      "",
      "2. Dados ausentes ou mal consolidados",
      `- bootStatus: ${runtime?.factoryState?.bootStatus || "dado ausente"}`,
      `- activeView: ${runtime?.factoryState?.activeView || "dado ausente"}`,
      `- lastEndpoint front: ${adminFront?.lastEndpoint || "dado ausente"}`,
      "",
      "3. Inferências prováveis",
      `- Próximo arquivo provável: ${nextFile?.nextFile || "dado ausente"}`,
      `- Motivo: ${nextFile?.reason || "dado ausente"}`,
      `- Runtime status: ${runtimeLayer?.connectionStatus || "unknown"}`,
      "",
      "4. Próximo passo mínimo recomendado",
      nextFile?.nextFile
        ? `- Trabalhar ${nextFile.nextFile}`
        : "- Rodar planner local para consolidar o próximo alvo.",
      "",
      "5. Arquivos mais prováveis de ajuste",
      `- ${nextFile?.nextFile || "dado ausente"}`
    ].join("\n");
  }

  function formatDoctorResult(result) {
    return [
      "1. Fatos confirmados",
      `- Doctor executado: ${!!result?.ok}`,
      `- Modo: ${result?.mode || "dado ausente"}`,
      "",
      "2. Dados ausentes ou mal consolidados",
      result?.ok ? "- O relatório completo fica no próprio Doctor/local state." : `- ${result?.msg || "falha não detalhada"}`,
      "",
      "3. Inferências prováveis",
      `- lastRun: ${pretty(result?.lastRun || result?.data || {})}`,
      "",
      "4. Próximo passo mínimo recomendado",
      result?.ok ? "- Ler o doctorLastRun no snapshot e seguir com o arquivo indicado." : "- Restaurar Doctor antes de nova execução.",
      "",
      "5. Arquivos mais prováveis de ajuste",
      "- /app/js/core/doctor_scan.js",
      "- /app/js/core/factory_state.js"
    ].join("\n");
  }

  function formatLogsResult(result) {
    const logs = Array.isArray(result?.logs) ? result.logs : [];
    return [
      "1. Fatos confirmados",
      `- Coleta local de logs: ${!!result?.ok}`,
      `- Quantidade retornada: ${logs.length}`,
      "",
      "2. Dados ausentes ou mal consolidados",
      logs.length ? "- Os logs refletem só o tail atual disponível no runtime." : "- Nenhum log disponível no tail atual.",
      "",
      "3. Inferências prováveis",
      logs.length ? `- Última linha: ${String(logs[logs.length - 1])}` : "- Sem inferência útil sem logs.",
      "",
      "4. Próximo passo mínimo recomendado",
      "- Usar esses logs junto com snapshot ou doctor para decidir o próximo patch.",
      "",
      "5. Arquivos mais prováveis de ajuste",
      "- /app/js/core/logger.js",
      "- /app/js/core/context_engine.js"
    ].join("\n");
  }

  function formatLocalActionResult(action, result) {
    if (action === "plan") return formatPlanResult(result);
    if (action === "next_file") return formatNextFileResult(result);
    if (action === "validate_patch") return formatValidationResult(result);
    if (action === "stage_patch") return formatStageOrApplyResult("Stage", result);
    if (action === "apply_patch") return formatStageOrApplyResult("Apply", result);
    if (action === "approve_patch") return [
      "1. Fatos confirmados",
      `- Aprovação executada: ${!!result?.ok}`,
      `- PlanId: ${result?.planId || "dado ausente"}`,
      "",
      "2. Dados ausentes ou mal consolidados",
      result?.ok ? "- Nenhuma ausência crítica retornada na aprovação." : `- ${result?.msg || "falha não detalhada"}`,
      "",
      "3. Inferências prováveis",
      "- O plano pode seguir para validação/stage se a aprovação foi aceita.",
      "",
      "4. Próximo passo mínimo recomendado",
      result?.ok ? "- Rodar validar patch." : "- Recalcular plano antes de nova aprovação.",
      "",
      "5. Arquivos mais prováveis de ajuste",
      `- ${result?.summary?.targetFile || "dado ausente"}`
    ].join("\n");
    if (action === "snapshot") return formatSnapshotResult(result);
    if (action === "run_doctor") return formatDoctorResult(result);
    if (action === "collect_logs") return formatLogsResult(result);
    return pretty(result || {});
  }

  async function runLocalAction(localAction, prompt) {
    const api = window.RCF_FACTORY_AI_ACTIONS;
    if (!api || typeof api.dispatch !== "function") {
      return {
        ok: false,
        msg: "RCF_FACTORY_AI_ACTIONS indisponível no runtime atual."
      };
    }

    const map = {
      plan: { action: "plan", prompt },
      approve_patch: { action: "approve_patch", prompt },
      validate_patch: { action: "validate_patch", prompt },
      stage_patch: { action: "stage_patch", prompt },
      apply_patch: { action: "apply_patch", prompt },
      run_doctor: { action: "run_doctor", prompt },
      collect_logs: { action: "collect_logs", prompt, limit: 40 },
      snapshot: { action: "snapshot", prompt },
      next_file: { action: "next_file", prompt }
    };

    const req = map[localAction];
    if (!req) {
      return { ok: false, msg: "Ação local não mapeada." };
    }

    STATE.lastEndpoint = "local:factory_ai_actions";
    touchFrontTelemetry(true, "local_action", "local:factory_ai_actions", localAction || "");
    setButtonsBusy(true);
    setComposerStatus("executando local...");
    setTechResult("");

    try {
      const result = await api.dispatch(req);
      touchFrontTelemetry(!!(result && result.ok !== false), "local_action", "local:factory_ai_actions", localAction || "");
      const text = formatLocalActionResult(localAction, result);

      setComposerStatus(result?.ok ? "concluído local" : "falha local");
      setTechResult(text);

      pushHistory({
        role: "assistant",
        text,
        ts: new Date().toISOString()
      });

      renderChat({ forceBottom: true });

      try {
        window.dispatchEvent(new CustomEvent("RCF:FACTORY_AI_LOCAL_ACTION", {
          detail: {
            localAction,
            request: req,
            result: clone(result || {})
          }
        }));
      } catch {}

      log(result?.ok ? "OK" : "WARN", "ação local executada: " + localAction);
      return result;
    } catch (e) {
      const msg = String(e?.message || e || "Erro local");
      touchFrontTelemetry(false, "local_action", "local:factory_ai_actions", localAction || "");
      setComposerStatus("erro local");
      setTechResult(msg);

      pushHistory({
        role: "assistant",
        text: msg,
        ts: new Date().toISOString()
      });

      renderChat({ forceBottom: true });
      log("ERR", "erro ação local: " + localAction);
      return { ok: false, msg };
    } finally {
      setButtonsBusy(false);
    }
  }

  async function runRuntimePrompt(action, prompt) {
    const runtime = window.RCF_FACTORY_AI_RUNTIME;

    if (!runtime || typeof runtime.ask !== "function") {
      return { ok: false, msg: "RCF_FACTORY_AI_RUNTIME indisponível." };
    }

    STATE.lastEndpoint = "runtime:/api/admin-ai";
    touchFrontTelemetry(true, "runtime", "/api/admin-ai", action || "");
    setButtonsBusy(true);
    setComposerStatus("consultando runtime...");
    setTechResult("");

    try {
      const result = await runtime.ask({
        action,
        prompt,
        payload: buildPayload(action),
        history: STATE.history.slice(-12).map((m) => ({
          role: m.role,
          text: m.text
        })),
        attachments: getAttachmentPayload()
      });

      touchFrontTelemetry(
        !!(result && result.ok !== false),
        clone(result?.request?.routing || result?.routing || "runtime"),
        "/api/admin-ai",
        action || ""
      );
      const text = extractRuntimeMessage(result);

      if (!result || result.ok === false) {
        setComposerStatus("falha runtime");
        setTechResult(text);

        pushHistory({
          role: "assistant",
          text,
          ts: new Date().toISOString()
        });

        renderChat({ forceBottom: true });
        log("WARN", "runtime falhou");
        return result || { ok: false, msg: text };
      }

      setComposerStatus("concluído runtime");
      setTechResult(text);

      pushHistory({
        role: "assistant",
        text,
        ts: new Date().toISOString()
      });

      renderChat({ forceBottom: true });

      try {
        window.dispatchEvent(new CustomEvent("RCF:FACTORY_AI_RUNTIME_RESPONSE", {
          detail: { action, prompt, result: clone(result || {}) }
        }));
      } catch {}

      log("OK", "runtime executado");
      return result;
    } catch (e) {
      const msg = String(e?.message || e || "Erro no runtime");
      touchFrontTelemetry(false, "runtime", "/api/admin-ai", action || "");
      setComposerStatus("erro runtime");
      setTechResult(msg);

      pushHistory({
        role: "assistant",
        text: msg,
        ts: new Date().toISOString()
      });

      renderChat({ forceBottom: true });
      log("ERR", "erro no runtime");
      return { ok: false, msg };
    } finally {
      setButtonsBusy(false);
    }
  }

  async function runBrainPrompt(prompt) {
    const brain = window.RCF_FACTORY_AI_BRAIN;

    if (!brain || typeof brain.think !== "function") {
      return { ok: false, msg: "RCF_FACTORY_AI_BRAIN indisponível." };
    }

    STATE.lastEndpoint = "local:factory_ai_brain";
    setButtonsBusy(true);
    setComposerStatus("pensando...");
    setTechResult("");

    try {
      const result = await brain.think({ prompt });
      const text =
        (typeof result?.answer === "string" && result.answer.trim())
          ? result.answer
          : (typeof result?.analysis === "string" && result.analysis.trim())
            ? result.analysis
            : pretty(result || { ok: false, msg: "sem resposta do brain" });

      setComposerStatus(result?.ok === false ? "falha local" : "concluído local");
      setTechResult(text);

      pushHistory({
        role: "assistant",
        text,
        ts: new Date().toISOString()
      });

      renderChat({ forceBottom: true });

      try {
        window.dispatchEvent(new CustomEvent("RCF:FACTORY_AI_BRAIN_RESPONSE", {
          detail: { prompt, result: clone(result || {}) }
        }));
      } catch {}

      log(result?.ok === false ? "WARN" : "OK", "brain executado");
      return result;
    } catch (e) {
      const msg = String(e?.message || e || "Erro no brain");
      setComposerStatus("erro local");
      setTechResult(msg);

      pushHistory({
        role: "assistant",
        text: msg,
        ts: new Date().toISOString()
      });

      renderChat({ forceBottom: true });
      log("ERR", "erro no brain");
      return { ok: false, msg };
    } finally {
      setButtonsBusy(false);
    }
  }

  async function runOrchestratorPrompt(prompt) {
    const orch = window.RCF_FACTORY_AI_ORCHESTRATOR;

    if (!orch || typeof orch.orchestrate !== "function") {
      return { ok: false, msg: "RCF_FACTORY_AI_ORCHESTRATOR indisponível." };
    }

    STATE.lastEndpoint = "local:factory_ai_orchestrator";
    setButtonsBusy(true);
    setComposerStatus("orquestrando...");
    setTechResult("");

    try {
      const result = await orch.orchestrate({ prompt });
      const text =
        (typeof result?.analysis === "string" && result.analysis.trim())
          ? result.analysis
          : pretty(result || { ok: false, msg: "sem resposta do orchestrator" });

      setComposerStatus(result?.ok === false ? "falha local" : "concluído local");
      setTechResult(text);

      pushHistory({
        role: "assistant",
        text,
        ts: new Date().toISOString()
      });

      renderChat({ forceBottom: true });

      try {
        window.dispatchEvent(new CustomEvent("RCF:FACTORY_AI_ORCHESTRATED", {
          detail: { prompt, result: clone(result || {}) }
        }));
      } catch {}

      log(result?.ok === false ? "WARN" : "OK", "orchestrator executado");
      return result;
    } catch (e) {
      const msg = String(e?.message || e || "Erro no orchestrator");
      setComposerStatus("erro local");
      setTechResult(msg);

      pushHistory({
        role: "assistant",
        text: msg,
        ts: new Date().toISOString()
      });

      renderChat({ forceBottom: true });
      log("ERR", "erro no orchestrator");
      return { ok: false, msg };
    } finally {
      setButtonsBusy(false);
    }
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
      touchFrontTelemetry(true, endpoint === "/api/admin-ai" ? "admin_ai" : "factory_ai", endpoint, action || "");

      const { res, data } = result;

      if (!res.ok || !data.ok) {
        touchFrontTelemetry(false, endpoint === "/api/admin-ai" ? "admin_ai" : "factory_ai", endpoint, action || "");
        const text =
          trim(data?.analysis) ||
          trim(data?.answer) ||
          trim(data?.result) ||
          pretty(data || { error: "Erro ao chamar endpoint IA" });

        setComposerStatus("erro");
        setTechResult(text);
        pushHistory({
          role: "assistant",
          text,
          ts: new Date().toISOString()
        });
        renderChat({ forceBottom: true });
        log("ERR", "falha IA endpoint=" + endpoint);
        return;
      }

      const text =
        data.analysis ||
        data.answer ||
        data.result ||
        pretty(data);

      try {
        window.dispatchEvent(new CustomEvent("RCF:FACTORY_AI_RESPONSE", {
          detail: {
            action,
            source: endpoint,
            analysis: text,
            raw: data
          }
        }));
      } catch {}

      touchFrontTelemetry(true, endpoint === "/api/admin-ai" ? "admin_ai" : "factory_ai", endpoint, action || "");
      setComposerStatus("concluído");
      setTechResult(text);
      pushHistory({
        role: "assistant",
        text,
        ts: new Date().toISOString()
      });
      renderChat({ forceBottom: true });
      log("OK", "resposta recebida action=" + action + " endpoint=" + endpoint);
    } catch (e) {
      const msg = String(e?.message || e || "Erro de rede");
      touchFrontTelemetry(false, "admin_ai", "/api/admin-ai", action || "");
      setComposerStatus("erro");
      setTechResult(msg);
      pushHistory({
        role: "assistant",
        text: msg,
        ts: new Date().toISOString()
      });
      renderChat({ forceBottom: true });
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
    const localAction = inferLocalActionFromPrompt(finalPrompt);

    let userText = finalPrompt;
    if (STATE.attachments && STATE.attachments.length) {
      const list = STATE.attachments.map((a) => a.name).join(", ");
      userText += `\n\n[anexos: ${list}]`;
    }

    pushHistory({
      role: "user",
      text: userText,
      ts: new Date().toISOString()
    });
    renderChat({ forceBottom: true });

    if (localAction) {
      runLocalAction(localAction, finalPrompt);
    } else if (window.RCF_FACTORY_AI_RUNTIME?.ask) {
      runRuntimePrompt(action, finalPrompt);
    } else if (window.RCF_FACTORY_AI_BRAIN?.think) {
      runBrainPrompt(finalPrompt);
    } else if (window.RCF_FACTORY_AI_ORCHESTRATOR?.orchestrate) {
      runOrchestratorPrompt(finalPrompt);
    } else {
      callFactoryAI(action, buildPayload(action), finalPrompt);
    }

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
        setComposerStatus("aguardando");
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

  function bindHeaderButtons() {
    const btnClear = document.getElementById("rcfFactoryAIClearHistory");
    if (btnClear && !btnClear.__boundClearV436) {
      btnClear.__boundClearV436 = true;
      btnClear.addEventListener("click", () => {
        try {
          const ok = window.confirm("Limpar histórico desta conversa da Factory AI?");
          if (!ok) return;
        } catch {}
        clearChat();
      });
    }
  }

  function bindBox() {
    const sendBtn = document.getElementById("rcfFactoryAISend");
    const promptEl = document.getElementById("rcfFactoryAIPrompt");
    const attachBtn = document.getElementById("rcfFactoryAIAttachBtn");
    const voiceBtn = document.getElementById("rcfFactoryAIVoiceBtn");

    if (sendBtn && !sendBtn.__boundV436) {
      sendBtn.__boundV436 = true;
      sendBtn.addEventListener("click", () => {
        sendPrompt(String(promptEl?.value || "").trim(), "");
      }, { passive: true });
    }

    if (promptEl && !promptEl.__boundInputV436) {
      promptEl.__boundInputV436 = true;
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

    if (attachBtn && !attachBtn.__boundV436) {
      attachBtn.__boundV436 = true;
      attachBtn.addEventListener("click", () => {
        toggleAttachMenu("rcfFactoryAIClipMenuMain");
      }, { passive: true });
    }

    if (voiceBtn && !voiceBtn.__boundV436) {
      voiceBtn.__boundV436 = true;
      voiceBtn.addEventListener("click", () => {
        toggleListening();
      }, { passive: true });
    }

    bindMenuItems();
    bindAttachmentInputs();
    bindHeaderButtons();
    bindChatScroll();
    renderAttachments();
    setVoiceBtnState();

    if (!document.__rcfFactoryAIOutsideClickV436) {
      document.__rcfFactoryAIOutsideClickV436 = true;
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
              <p class="rcfAiHeadSub"></p>
            </div>
          </div>
          <div class="rcfAiHeadActions">
            <div class="rcfAiPill" title="Runtime + OpenAI + bridge supervisionada">Runtime + OpenAI</div>
            <button class="rcfAiHeadBtn" id="rcfFactoryAIClearHistory" type="button">Limpar</button>
          </div>
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

    let needsFreshRender = false;
    let moved = false;

    if (!box) {
      box = document.createElement("div");
      box.id = BOX_ID;
      box.className = "card";
      box.setAttribute("data-rcf-factory-ai", "1");
      box.setAttribute("data-rcf-build", VERSION);
      box.innerHTML = buildBoxHtml();
      primarySlot.appendChild(box);
      needsFreshRender = true;
      moved = true;
    } else {
      const currentBuild = String(box.getAttribute("data-rcf-build") || "");
      if (currentBuild !== VERSION) {
        box.setAttribute("data-rcf-build", VERSION);
        box.innerHTML = buildBoxHtml();
        needsFreshRender = true;
      }
      if (box.parentNode !== primarySlot) {
        primarySlot.appendChild(box);
        moved = true;
      }
    }

    bindBox();

    if (needsFreshRender) {
      renderChat();
    }

    return { box, needsFreshRender, moved };
  }

  function mount() {
    const slots = getPreferredSlots();
    const primary = slots.tools || slots.fallback || null;
    if (!primary) return false;

    const nextMountedIn = slots.tools ? "factoryai.tools" : "admin.fallback";
    const prevMountedIn = STATE.mountedIn || "";
    STATE.mountedIn = nextMountedIn;

    const ensured = ensureMainBox(primary);
    if (!ensured || !ensured.box) return false;

    try { cleanupFactoryAIHost(); } catch {}
    try { syncVisibility(); } catch {}

    const signature = `${STATE.mountedIn || "unknown"}|build=${VERSION}|slot=${primary.id || primary.getAttribute("data-rcf-slot") || primary.className || "unknown"}`;
    const firstMount = !STATE.mounted;
    const changedMount = prevMountedIn !== STATE.mountedIn || !!ensured.needsFreshRender || !!ensured.moved;

    STATE.mounted = true;

    if (firstMount || changedMount) {
      logMountOnce(signature, true);
    }

    return true;
  }

  function mountLoop() {
    if (mount()) return true;
    setTimeout(() => { try { mount(); } catch {} }, 700);
    setTimeout(() => { try { mount(); } catch {} }, 1600);
    setTimeout(() => { try { mount(); } catch {} }, 2800);
    return false;
  }

  function bindVisibilityHooksOnce() {
    if (STATE.visibilityBound) return;
    STATE.visibilityBound = true;

    try {
      document.addEventListener("visibilitychange", () => {
        try {
          if (document.visibilityState === "visible") {
            mount();
            syncVisibility();
          }
        } catch {}
      }, { passive: true });
    } catch {}

    try {
      window.addEventListener("pageshow", () => {
        try {
          mount();
          syncVisibility();
        } catch {}
      }, { passive: true });
    } catch {}

    try {
      window.addEventListener("resize", () => {
        try { syncVisibility(); } catch {}
      }, { passive: true });
    } catch {}
  }

  function startSync() {
    if (STATE.syncStarted) return;
    STATE.syncStarted = true;

    try {
      if (STATE.syncTimer) clearInterval(STATE.syncTimer);
    } catch {}

    STATE.syncTimer = setInterval(() => {
      try { mount(); } catch {}
      try { syncVisibility(); } catch {}
    }, SYNC_INTERVAL_MS);

    bindVisibilityHooksOnce();

    try {
      if (!document.__rcfFactoryAIClickSyncV436) {
        document.__rcfFactoryAIClickSyncV436 = true;
        document.addEventListener("click", () => {
          setTimeout(() => {
            try { syncVisibility(); } catch {}
          }, 80);
        }, { passive: true });
      }
    } catch {}
  }

  STATE.history = loadHistory();

  window.RCF_FACTORY_AI = {
    __v41: true,
    __v411: true,
    __v42: true,
    __v421: true,
    __v430: true,
    __v431: true,
    __v432: true,
    __v433: true,
    __v434: true,
    __v435: true,
    __v438: true,
    version: VERSION,
    mount,
    clearChat,
    sendPrompt,
    getFrontTelemetry,
    stopListening,
    speakText,
    getHistory() {
      return Array.isArray(STATE.history) ? STATE.history.slice() : [];
    },
    getLastEndpoint() {
      return STATE.lastEndpoint || "";
    },
    getFrontTelemetry() {
      return buildFrontTelemetrySnapshot();
    },
    getAttachments() {
      return Array.isArray(STATE.attachments) ? STATE.attachments.slice() : [];
    }
  };

  window.RCF_ADMIN_AI = Object.assign(window.RCF_ADMIN_AI || {}, {
    __v41_bridge: true,
    __v411_bridge: true,
    __v42_bridge: true,
    __v421_bridge: true,
    __v430_bridge: true,
    __v431_bridge: true,
    __v432_bridge: true,
    __v433_bridge: true,
    __v434_bridge: true,
    __v435_bridge: true,
    __v438_bridge: true,
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


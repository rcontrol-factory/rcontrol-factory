/* FILE: /app/js/core/factory_ai_controller.js
   RControl Factory — Factory AI Controller
   v1.1.1 CORE ORCHESTRATOR + SAFE SUPERVISION HUB + EXECUTION GATE AWARE

   Objetivo:
   - centralizar o comando operacional da Factory AI
   - integrar orchestrator + runtime + bridge + planner + patch supervisor + policy + phase engine
   - evitar lógica solta espalhada em múltiplos módulos
   - expor ações seguras para evolução supervisionada da Factory
   - manter a Factory AI focada no núcleo da própria Factory
   - não aplicar patch automático sem aprovação
   - funcionar como script clássico

   PATCH v1.1.1:
   - FIX: adiciona integração com execution gate quando existir
   - FIX: snapshot inclui focus/intelligence e memoryContext útil
   - FIX: apply usa guarda mais robusta da fase ativa
   - FIX: getNextFile respeita focus/intelligence/planner como fallback real
   - FIX: evita depender de APIs ausentes sem quebrar o fluxo
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_CONTROLLER && global.RCF_FACTORY_AI_CONTROLLER.__v111) return;

  var VERSION = "v1.1.1";
  var STORAGE_KEY = "rcf:factory_ai_controller";
  var MAX_HISTORY = 80;

  var state = {
    version: VERSION,
    ready: false,
    busy: false,
    lastUpdate: null,
    lastAction: "",
    lastPlanId: "",
    lastAnalysis: null,
    lastPrompt: "",
    history: []
  };

  function nowISO() {
    try { return new Date().toISOString(); }
    catch (_) { return ""; }
  }

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function trimText(v) {
    return String(v == null ? "" : v).trim();
  }

  function normalizePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        busy: !!state.busy,
        lastUpdate: state.lastUpdate,
        lastAction: state.lastAction,
        lastPlanId: state.lastPlanId,
        lastAnalysis: clone(state.lastAnalysis || null),
        lastPrompt: state.lastPrompt,
        history: clone(state.history || [])
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;

      state.version = VERSION;
      state.ready = !!parsed.ready;
      state.busy = !!parsed.busy;
      state.lastUpdate = parsed.lastUpdate || null;
      state.lastAction = trimText(parsed.lastAction || "");
      state.lastPlanId = trimText(parsed.lastPlanId || "");
      state.lastAnalysis = clone(parsed.lastAnalysis || null);
      state.lastPrompt = trimText(parsed.lastPrompt || "");
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];
      state.busy = false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_CONTROLLER] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_CONTROLLER] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_CONTROLLER]", level, msg, extra || ""); } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function getRuntime() {
    return global.RCF_FACTORY_AI_RUNTIME || null;
  }

  function getBridge() {
    return global.RCF_FACTORY_AI_BRIDGE || null;
  }

  function getPlanner() {
    return global.RCF_FACTORY_AI_PLANNER || null;
  }

  function getPatchSupervisor() {
    return global.RCF_PATCH_SUPERVISOR || null;
  }

  function getOrchestrator() {
    return global.RCF_FACTORY_AI_ORCHESTRATOR || null;
  }

  function getPolicy() {
    return global.RCF_FACTORY_AI_POLICY || null;
  }

  function getPhaseEngine() {
    return global.RCF_FACTORY_PHASE_ENGINE || null;
  }

  function getAutoLoop() {
    return global.RCF_FACTORY_AI_AUTOLOOP || null;
  }

  function getMemory() {
    return global.RCF_FACTORY_AI_MEMORY || null;
  }

  function getExecutionGate() {
    return global.RCF_FACTORY_AI_EXECUTION_GATE || null;
  }

  function getFocusEngine() {
    return global.RCF_FACTORY_AI_FOCUS_ENGINE || null;
  }

  function getIntelligence() {
    return global.RCF_FACTORY_AI_INTELLIGENCE || null;
  }

  function getFactoryState() {
    return safe(function () {
      if (global.RCF_FACTORY_STATE?.getState) return global.RCF_FACTORY_STATE.getState();
      if (global.RCF_FACTORY_STATE?.status) return global.RCF_FACTORY_STATE.status();
      return {};
    }, {});
  }

  function getMemoryContext() {
    var memory = getMemory();
    return safe(function () {
      if (memory && typeof memory.buildMemoryContext === "function") {
        return memory.buildMemoryContext(20);
      }
      return {};
    }, {});
  }

  function getFocusContext() {
    var focus = getFocusEngine();
    return safe(function () {
      if (focus && typeof focus.buildCompactContext === "function") {
        return focus.buildCompactContext();
      }
      if (focus && typeof focus.getLastFocus === "function") {
        return { ok: true, focus: focus.getLastFocus() || null };
      }
      return {};
    }, {});
  }

  function getIntelligenceContext() {
    var intelligence = getIntelligence();
    return safe(function () {
      if (intelligence && typeof intelligence.buildCompactContext === "function") {
        return intelligence.buildCompactContext();
      }
      if (intelligence && typeof intelligence.summary === "function") {
        return intelligence.summary();
      }
      return {};
    }, {});
  }

  function markBusy(action, prompt) {
    state.busy = true;
    state.lastAction = trimText(action || "");
    state.lastPrompt = trimText(prompt || "");
    persist();
  }

  function clearBusy() {
    state.busy = false;
    persist();
  }

  function saveResult(action, result, prompt) {
    var planId =
      trimText(safe(function () { return result.plan.id; }, "")) ||
      trimText(safe(function () { return result.response.plan.id; }, "")) ||
      trimText(safe(function () { return result.result.plan.id; }, "")) ||
      trimText(safe(function () { return result.planId; }, "")) ||
      trimText(state.lastPlanId || "");

    if (planId) state.lastPlanId = planId;

    state.lastAnalysis = {
      ts: nowISO(),
      action: trimText(action || ""),
      prompt: trimText(prompt || ""),
      result: clone(result || {})
    };

    pushHistory({
      ts: nowISO(),
      action: trimText(action || ""),
      prompt: trimText(prompt || ""),
      planId: planId,
      ok: !!safe(function () { return result.ok; }, false)
    });

    persist();
  }

  function buildControllerSnapshot() {
    var factoryState = getFactoryState();
    var bridge = getBridge();
    var planner = getPlanner();
    var runtime = getRuntime();
    var patchSupervisor = getPatchSupervisor();
    var orchestrator = getOrchestrator();
    var policy = getPolicy();
    var phaseEngine = getPhaseEngine();
    var autoLoop = getAutoLoop();
    var memory = getMemory();
    var executionGate = getExecutionGate();
    var focus = getFocusEngine();
    var intelligence = getIntelligence();

    return {
      ts: nowISO(),
      factoryState: clone(factoryState || {}),
      planner: clone(safe(function () { return planner.status(); }, {})),
      bridge: clone(safe(function () { return bridge.status(); }, {})),
      runtime: clone(safe(function () { return runtime.status(); }, {})),
      patchSupervisor: clone(safe(function () { return patchSupervisor.status(); }, {})),
      orchestrator: clone(safe(function () { return orchestrator.status(); }, {})),
      policy: clone(safe(function () { return policy.status(); }, {})),
      phase: clone(safe(function () { return phaseEngine.buildPhaseContext(); }, {})),
      autoloop: clone(safe(function () { return autoLoop.status(); }, {})),
      memory: clone(safe(function () { return memory.status(); }, {})),
      memoryContext: clone(getMemoryContext() || {}),
      executionGate: clone(safe(function () { return executionGate.status(); }, {})),
      focus: clone(safe(function () { return focus.status(); }, {})),
      focusContext: clone(getFocusContext() || {}),
      intelligence: clone(safe(function () { return intelligence.status(); }, {})),
      intelligenceContext: clone(getIntelligenceContext() || {})
    };
  }

  async function analyzeFactory(prompt) {
    var text = trimText(prompt || "Analise a arquitetura atual da RControl Factory e sugira melhorias estruturais supervisionadas.");
    var orchestrator = getOrchestrator();
    var runtime = getRuntime();

    if (state.busy) {
      return { ok: false, msg: "controller ocupado" };
    }

    markBusy("analyzeFactory", text);

    try {
      var result = null;

      if (orchestrator && typeof orchestrator.orchestrate === "function") {
        result = await orchestrator.orchestrate({
          prompt: text
        });
      } else if (runtime && typeof runtime.ask === "function") {
        result = await runtime.ask({
          action: "analyze-architecture",
          prompt: text
        });
      } else {
        result = { ok: false, msg: "orchestrator/runtime indisponível" };
      }

      saveResult("analyzeFactory", result, text);
      return clone(result);
    } finally {
      clearBusy();
    }
  }

  async function planNextEvolution(prompt) {
    var text = trimText(prompt || "Planeje a próxima evolução supervisionada da Factory AI e indique o próximo arquivo mais estratégico.");
    var orchestrator = getOrchestrator();
    var planner = getPlanner();

    if (state.busy) {
      return { ok: false, msg: "controller ocupado" };
    }

    markBusy("planNextEvolution", text);

    try {
      var result = null;

      if (orchestrator && typeof orchestrator.orchestrate === "function") {
        result = await orchestrator.orchestrate({
          prompt: text
        });
      } else if (planner && typeof planner.planFromRuntime === "function") {
        result = {
          ok: true,
          plan: planner.planFromRuntime({
            prompt: text,
            goal: text,
            reason: text
          })
        };
      } else if (planner && typeof planner.buildPlan === "function") {
        result = {
          ok: true,
          plan: planner.buildPlan({
            prompt: text,
            goal: text,
            reason: text
          })
        };
      } else {
        result = { ok: false, msg: "planner/orchestrator indisponível" };
      }

      saveResult("planNextEvolution", result, text);
      return clone(result);
    } finally {
      clearBusy();
    }
  }

  async function approveLastPlan(meta) {
    var gate = getExecutionGate();
    var runtime = getRuntime();
    var bridge = getBridge();
    var payload = clone(meta || {});

    if (gate && typeof gate.approvePlan === "function") {
      var resultGate = await gate.approvePlan(payload.planId || "", payload);
      saveResult("approveLastPlan", resultGate, "approveLastPlan");
      return clone(resultGate);
    }

    if (runtime && typeof runtime.approvePlan === "function") {
      var resultRuntime = await runtime.approvePlan(payload.planId || "", payload);
      saveResult("approveLastPlan", resultRuntime, "approveLastPlan");
      return clone(resultRuntime);
    }

    if (bridge && typeof bridge.approveLastPlan === "function") {
      var resultBridge = bridge.approveLastPlan(payload);
      saveResult("approveLastPlan", resultBridge, "approveLastPlan");
      return clone(resultBridge);
    }

    return { ok: false, msg: "runtime/bridge/execution gate ausente para aprovação" };
  }

  async function validatePlan(planId) {
    var gate = getExecutionGate();
    var runtime = getRuntime();
    var supervisor = getPatchSupervisor();

    if (gate && typeof gate.validateApprovedPlan === "function") {
      var resultGate = await gate.validateApprovedPlan(planId || "");
      saveResult("validatePlan", resultGate, "validatePlan");
      return clone(resultGate);
    }

    if (runtime && typeof runtime.validateApprovedPlan === "function") {
      var resultRuntime = await runtime.validateApprovedPlan(planId || "");
      saveResult("validatePlan", resultRuntime, "validatePlan");
      return clone(resultRuntime);
    }

    if (supervisor && typeof supervisor.validateApprovedPlan === "function") {
      var resultSup = supervisor.validateApprovedPlan(planId || "");
      saveResult("validatePlan", resultSup, "validatePlan");
      return clone(resultSup);
    }

    return { ok: false, msg: "patch supervisor/execution gate ausente" };
  }

  async function stagePlan(planId) {
    var gate = getExecutionGate();
    var runtime = getRuntime();
    var supervisor = getPatchSupervisor();

    if (gate && typeof gate.stageApprovedPlan === "function") {
      var resultGate = await gate.stageApprovedPlan(planId || "");
      saveResult("stagePlan", resultGate, "stagePlan");
      return clone(resultGate);
    }

    if (runtime && typeof runtime.stageApprovedPlan === "function") {
      var resultRuntime = await runtime.stageApprovedPlan(planId || "");
      saveResult("stagePlan", resultRuntime, "stagePlan");
      return clone(resultRuntime);
    }

    if (supervisor && typeof supervisor.stageApprovedPlan === "function") {
      var resultSup = await supervisor.stageApprovedPlan(planId || "");
      saveResult("stagePlan", resultSup, "stagePlan");
      return clone(resultSup);
    }

    return { ok: false, msg: "patch supervisor/execution gate ausente" };
  }

  function isApplyAllowed() {
    var phaseEngine = getPhaseEngine();
    var phase = safe(function () { return phaseEngine.buildPhaseContext(); }, {}) || {};
    var allowApply =
      !!safe(function () { return phase.activePhase.allow.apply; }, false) ||
      !!safe(function () { return phase.runtime.patchSupervisor.applyReady; }, false) && !!safe(function () { return phase.activePhase.allow.apply; }, false);

    return {
      ok: !!allowApply,
      phase: clone(phase || {})
    };
  }

  async function applyPlan(planId, opts) {
    var gate = getExecutionGate();
    var runtime = getRuntime();
    var supervisor = getPatchSupervisor();
    var applyGuard = isApplyAllowed();

    if (!applyGuard.ok) {
      return {
        ok: false,
        msg: "apply bloqueado pela fase ativa da Factory"
      };
    }

    if (gate && typeof gate.applyApprovedPlan === "function") {
      var resultGate = await gate.applyApprovedPlan(planId || "", opts || {});
      saveResult("applyPlan", resultGate, "applyPlan");
      return clone(resultGate);
    }

    if (runtime && typeof runtime.applyApprovedPlan === "function") {
      var resultRuntime = await runtime.applyApprovedPlan(planId || "", opts || {});
      saveResult("applyPlan", resultRuntime, "applyPlan");
      return clone(resultRuntime);
    }

    if (supervisor && typeof supervisor.applyApprovedPlan === "function") {
      var resultSup = await supervisor.applyApprovedPlan(planId || "", opts || {});
      saveResult("applyPlan", resultSup, "applyPlan");
      return clone(resultSup);
    }

    return { ok: false, msg: "patch supervisor/execution gate ausente" };
  }

  async function approveValidateStage(planId, meta) {
    var gate = getExecutionGate();
    var runtime = getRuntime();

    if (gate && typeof gate.approveValidateStage === "function") {
      var resultGate = await gate.approveValidateStage(planId || "", meta || {});
      saveResult("approveValidateStage", resultGate, "approveValidateStage");
      return clone(resultGate);
    }

    if (runtime && typeof runtime.approveValidateStage === "function") {
      var resultRuntime = await runtime.approveValidateStage(planId || "", meta || {});
      saveResult("approveValidateStage", resultRuntime, "approveValidateStage");
      return clone(resultRuntime);
    }

    var approved = await approveLastPlan(meta || { planId: planId || "" });
    if (!approved || !approved.ok) return approved;

    var validated = await validatePlan(planId || "");
    if (!validated || !validated.ok) return validated;

    return stagePlan(planId || "");
  }

  async function runEvolutionStep() {
    if (state.busy) {
      return { ok: false, msg: "controller ocupado" };
    }

    pushLog("OK", "executando evolução supervisionada da Factory");

    var result = await planNextEvolution("Planeje a próxima evolução supervisionada da Factory AI com foco no núcleo da própria Factory.");
    if (!result || result.ok === false) {
      return clone(result || { ok: false, msg: "falha ao planejar evolução" });
    }

    return {
      ok: true,
      msg: "Evolução supervisionada planejada",
      planId:
        trimText(safe(function () { return result.plan.id; }, "")) ||
        trimText(state.lastPlanId || ""),
      result: clone(result)
    };
  }

  async function getNextFile() {
    var orchestrator = getOrchestrator();
    var focus = getFocusEngine();
    var intelligence = getIntelligence();

    if (orchestrator && typeof orchestrator.orchestrate === "function") {
      var result = await orchestrator.orchestrate({
        prompt: "Qual é o próximo arquivo mais estratégico da Factory AI agora?"
      });
      saveResult("getNextFile", result, "next_file");
      return clone(result);
    }

    if (focus && typeof focus.getLastFocus === "function") {
      var focusData = focus.getLastFocus();
      var focusFile = normalizePath(safe(function () { return focusData.targetFile; }, ""));
      if (focusFile) {
        var focusResult = {
          ok: true,
          nextFile: focusFile,
          focus: clone(focusData || null)
        };
        saveResult("getNextFile", focusResult, "next_file");
        return focusResult;
      }
    }

    if (intelligence && typeof intelligence.getNextTarget === "function") {
      var intelResult = intelligence.getNextTarget();
      var intelFile = normalizePath(safe(function () { return intelResult.nextFile; }, ""));
      if (intelFile) {
        var merged = {
          ok: true,
          nextFile: intelFile,
          intelligence: clone(intelResult || null)
        };
        saveResult("getNextFile", merged, "next_file");
        return merged;
      }
    }

    var planner = getPlanner();
    if (planner && typeof planner.getLastPlan === "function") {
      var plan = planner.getLastPlan();
      var plannerFile = normalizePath(safe(function () { return plan.targetFile || plan.nextFile; }, ""));
      return {
        ok: true,
        nextFile: plannerFile,
        plan: clone(plan || null)
      };
    }

    return { ok: false, msg: "orchestrator/planner/focus/intelligence indisponível" };
  }

  function explainRoles() {
    var policy = getPolicy();
    if (!policy || typeof policy.buildPolicyContext !== "function") {
      return {
        ok: false,
        msg: "factory_ai_policy indisponível"
      };
    }

    var ctx = policy.buildPolicyContext();
    return {
      ok: true,
      policy: clone(ctx),
      text: [
        "Factory AI: estrutura e evolui o núcleo da própria Factory.",
        "Agent AI: cria aplicativos.",
        "Opportunity Scan: encontra oportunidades.",
        "Test AI: testa no Preview.",
        "Validation AI: valida com rigor antes da decisão final."
      ].join("\n")
    };
  }

  async function setAutoLoopEnabled(enabled, opts) {
    var autoLoop = getAutoLoop();
    if (!autoLoop) {
      return { ok: false, msg: "autoloop ausente" };
    }

    var result = enabled
      ? autoLoop.enable(opts || {})
      : autoLoop.disable();

    saveResult(enabled ? "enableAutoLoop" : "disableAutoLoop", result, enabled ? "enable autoloop" : "disable autoloop");
    return clone(result);
  }

  async function runAutoLoopNow() {
    var autoLoop = getAutoLoop();
    if (!autoLoop || typeof autoLoop.runNow !== "function") {
      return { ok: false, msg: "autoloop ausente" };
    }

    var result = await autoLoop.runNow();
    saveResult("runAutoLoopNow", result, "run autoloop now");
    return clone(result);
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      lastAction: state.lastAction || "",
      lastPlanId: state.lastPlanId || "",
      lastPrompt: state.lastPrompt || "",
      historyCount: Array.isArray(state.history) ? state.history.length : 0,
      runtimeReady: !!getRuntime(),
      plannerReady: !!getPlanner(),
      bridgeReady: !!getBridge(),
      patchSupervisorReady: !!getPatchSupervisor(),
      orchestratorReady: !!getOrchestrator(),
      policyReady: !!getPolicy(),
      phaseEngineReady: !!getPhaseEngine(),
      autoLoopReady: !!getAutoLoop(),
      executionGateReady: !!getExecutionGate(),
      focusReady: !!getFocusEngine(),
      intelligenceReady: !!getIntelligence()
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIController");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIController", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIController");
      }
    } catch (_) {}
  }

  function init() {
    load();
    state.version = VERSION;
    state.ready = true;
    state.busy = false;
    persist();
    syncPresence();

    emit("RCF:FACTORY_AI_CONTROLLER_READY", {
      version: VERSION
    });

    pushLog("OK", "Factory AI Controller iniciado ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_CONTROLLER = {
    __v100: true,
    __v110: true,
    __v111: true,
    version: VERSION,
    init: init,
    status: status,
    buildControllerSnapshot: buildControllerSnapshot,
    analyzeFactory: analyzeFactory,
    planNextEvolution: planNextEvolution,
    approveLastPlan: approveLastPlan,
    validatePlan: validatePlan,
    stagePlan: stagePlan,
    applyPlan: applyPlan,
    approveValidateStage: approveValidateStage,
    runEvolutionStep: runEvolutionStep,
    getNextFile: getNextFile,
    explainRoles: explainRoles,
    setAutoLoopEnabled: setAutoLoopEnabled,
    runAutoLoopNow: runAutoLoopNow,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

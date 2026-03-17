/* FILE: /app/js/core/factory_ai_controller.js
   RControl Factory — Factory AI Controller
   v1.0.1 CORE ORCHESTRATOR + SAFE SUPERVISED FLOW

   Responsável por:
   - orquestrar comportamento da Factory AI
   - integrar runtime, planner, bridge, actions, patch supervisor e phase engine
   - escolher próximos passos da evolução da Factory
   - centralizar helpers seguros approve -> validate -> stage -> apply
   - respeitar fase ativa da Factory
   - NÃO aplicar patch automático sem fluxo supervisionado
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_CONTROLLER && global.RCF_FACTORY_AI_CONTROLLER.__v101) return;

  var VERSION = "1.0.1";
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

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function merge(base, patch) {
    if (!patch || typeof patch !== "object") return base;

    Object.keys(patch).forEach(function (key) {
      var a = base[key];
      var b = patch[key];

      if (
        a && typeof a === "object" && !Array.isArray(a) &&
        b && typeof b === "object" && !Array.isArray(b)
      ) {
        base[key] = merge(clone(a), b);
      } else {
        base[key] = b;
      }
    });

    return base;
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
      state = merge(clone(state), parsed);
      if (!Array.isArray(state.history)) state.history = [];
      if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function log(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_CONTROLLER] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_CONTROLLER] " + msg);
      }
    } catch (_) {}

    try {
      console.log("[FACTORY_AI_CONTROLLER]", level, msg, extra || "");
    } catch (_) {}
  }

  function getRuntime() {
    return safe(function () { return global.RCF_FACTORY_AI_RUNTIME || null; }, null);
  }

  function getBridge() {
    return safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
  }

  function getPlanner() {
    return safe(function () { return global.RCF_FACTORY_AI_PLANNER || null; }, null);
  }

  function getActions() {
    return safe(function () { return global.RCF_FACTORY_AI_ACTIONS || null; }, null);
  }

  function getPatchSupervisor() {
    return safe(function () { return global.RCF_PATCH_SUPERVISOR || null; }, null);
  }

  function getPhaseEngine() {
    return safe(function () { return global.RCF_FACTORY_PHASE_ENGINE || null; }, null);
  }

  function getMemory() {
    return safe(function () { return global.RCF_FACTORY_AI_MEMORY || null; }, null);
  }

  function getCurrentPlanId() {
    var runtime = getRuntime();
    if (runtime && typeof runtime.getApprovedPlan === "function") {
      var approved = runtime.getApprovedPlan();
      if (approved && approved.id) return trimText(approved.id);
    }

    if (runtime && typeof runtime.getPendingPlan === "function") {
      var pending = runtime.getPendingPlan();
      if (pending && pending.id) return trimText(pending.id);
    }

    var bridge = getBridge();
    if (bridge && typeof bridge.getLastPlan === "function") {
      var last = bridge.getLastPlan();
      if (last && last.id) return trimText(last.id);
    }

    return "";
  }

  function getPhaseContext() {
    var phase = getPhaseEngine();
    if (!phase || typeof phase.buildPhaseContext !== "function") {
      return {
        activePhaseId: "",
        activePhaseTitle: "",
        activePhase: null,
        recommendedTargets: []
      };
    }

    var ctx = safe(function () { return phase.buildPhaseContext(); }, {}) || {};
    return {
      activePhaseId:
        trimText(safe(function () { return ctx.activePhaseId; }, "")) ||
        trimText(safe(function () { return ctx.phaseId; }, "")) ||
        trimText(safe(function () { return ctx.activePhase.id; }, "")),
      activePhaseTitle:
        trimText(safe(function () { return ctx.activePhaseTitle; }, "")) ||
        trimText(safe(function () { return ctx.activePhase.title; }, "")),
      activePhase: clone(safe(function () { return ctx.activePhase; }, null)),
      recommendedTargets: clone(safe(function () { return ctx.recommendedTargets; }, []))
    };
  }

  function getControllerSnapshot() {
    var planner = getPlanner();
    var bridge = getBridge();
    var actions = getActions();
    var runtime = getRuntime();
    var supervisor = getPatchSupervisor();
    var memory = getMemory();

    return {
      ts: nowISO(),
      phase: clone(getPhaseContext()),
      planner: clone(safe(function () { return planner.status(); }, {})),
      bridge: clone(safe(function () { return bridge.status(); }, {})),
      actions: clone(safe(function () { return actions.status(); }, {})),
      runtime: clone(safe(function () { return runtime.status(); }, {})),
      patchSupervisor: clone(safe(function () { return supervisor.status(); }, {})),
      memory: clone(safe(function () { return memory.status(); }, {})),
      currentPlanId: getCurrentPlanId()
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

    try {
      if (global.RCF_FACTORY_STATE?.refreshRuntime) {
        global.RCF_FACTORY_STATE.refreshRuntime();
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.refresh) {
        global.RCF_MODULE_REGISTRY.refresh();
      }
    } catch (_) {}
  }

  async function analyzeFactory(promptOverride) {
    var runtime = getRuntime();
    if (!runtime || typeof runtime.ask !== "function") {
      return { ok: false, msg: "Factory AI Runtime não encontrado" };
    }

    var prompt = trimText(promptOverride || "Analise a arquitetura atual da RControl Factory e sugira melhorias estruturais.");
    state.busy = true;
    state.lastAction = "analyzeFactory";
    persist();

    try {
      var result = await runtime.ask({
        action: "analyze-architecture",
        prompt: prompt
      });

      state.lastAnalysis = clone(result || null);

      if (result && result.plan && result.plan.id) {
        state.lastPlanId = trimText(result.plan.id);
      } else {
        state.lastPlanId = getCurrentPlanId();
      }

      pushHistory({
        ts: nowISO(),
        type: "analyze",
        ok: !!(result && result.ok),
        planId: trimText(safe(function () { return result.plan.id; }, "")) || state.lastPlanId,
        targetFile: normalizePath(safe(function () { return result.plan.targetFile || result.plan.nextFile; }, "")),
        prompt: prompt
      });

      persist();
      emit("RCF:FACTORY_AI_CONTROLLER_ANALYSIS", {
        result: clone(result || null),
        snapshot: clone(getControllerSnapshot())
      });

      return result;
    } catch (e) {
      var fail = { ok: false, msg: String(e && e.message || e || "falha na análise") };
      state.lastAnalysis = clone(fail);
      pushHistory({
        ts: nowISO(),
        type: "analyze-fail",
        ok: false,
        msg: fail.msg
      });
      persist();
      return fail;
    } finally {
      state.busy = false;
      persist();
    }
  }

  async function approveLastPlan(planId, meta) {
    var runtime = getRuntime();
    if (!runtime || typeof runtime.approvePlan !== "function") {
      return { ok: false, msg: "runtime ausente" };
    }

    var targetPlanId = trimText(planId || state.lastPlanId || getCurrentPlanId());
    if (!targetPlanId) {
      return { ok: false, msg: "nenhum plano disponível para aprovação" };
    }

    state.lastAction = "approveLastPlan";
    persist();

    var result = await runtime.approvePlan(targetPlanId, meta || {});
    if (result && result.ok) {
      state.lastPlanId = targetPlanId;
      pushHistory({
        ts: nowISO(),
        type: "approve",
        ok: true,
        planId: targetPlanId
      });
    } else {
      pushHistory({
        ts: nowISO(),
        type: "approve-fail",
        ok: false,
        planId: targetPlanId,
        msg: trimText(safe(function () { return result.error || result.msg; }, ""))
      });
    }

    persist();
    return result;
  }

  async function validatePlan(planId) {
    var runtime = getRuntime();
    if (!runtime || typeof runtime.validateApprovedPlan !== "function") {
      return { ok: false, msg: "runtime ausente" };
    }

    var targetPlanId = trimText(planId || state.lastPlanId || getCurrentPlanId());
    if (!targetPlanId) {
      return { ok: false, msg: "nenhum plano aprovado disponível para validação" };
    }

    state.lastAction = "validatePlan";
    persist();

    var result = await runtime.validateApprovedPlan(targetPlanId);

    pushHistory({
      ts: nowISO(),
      type: result && result.ok ? "validate" : "validate-fail",
      ok: !!(result && result.ok),
      planId: targetPlanId,
      targetFile: normalizePath(safe(function () { return result.normalized.targetFile; }, "")),
      msg: trimText(safe(function () { return result.error || result.msg; }, ""))
    });

    persist();
    return result;
  }

  async function stagePlan(planId) {
    var runtime = getRuntime();
    if (!runtime || typeof runtime.stageApprovedPlan !== "function") {
      return { ok: false, msg: "runtime ausente" };
    }

    var targetPlanId = trimText(planId || state.lastPlanId || getCurrentPlanId());
    if (!targetPlanId) {
      return { ok: false, msg: "nenhum plano aprovado disponível para stage" };
    }

    state.lastAction = "stagePlan";
    persist();

    var result = await runtime.stageApprovedPlan(targetPlanId);

    pushHistory({
      ts: nowISO(),
      type: result && result.ok ? "stage" : "stage-fail",
      ok: !!(result && result.ok),
      planId: targetPlanId,
      targetFile: normalizePath(safe(function () { return result.targetFile || result.stagedPatch.targetFile; }, "")),
      msg: trimText(safe(function () { return result.error || result.msg; }, ""))
    });

    persist();
    return result;
  }

  async function applyPlan(planId, opts) {
    var runtime = getRuntime();
    if (!runtime || typeof runtime.applyApprovedPlan !== "function") {
      return { ok: false, msg: "runtime ausente" };
    }

    var targetPlanId = trimText(planId || state.lastPlanId || getCurrentPlanId());
    if (!targetPlanId) {
      return { ok: false, msg: "nenhum plano aprovado disponível para apply" };
    }

    state.lastAction = "applyPlan";
    persist();

    var result = await runtime.applyApprovedPlan(targetPlanId, opts || {});

    pushHistory({
      ts: nowISO(),
      type: result && result.ok ? "apply" : "apply-fail",
      ok: !!(result && result.ok),
      planId: targetPlanId,
      targetFile: normalizePath(safe(function () { return result.targetFile; }, "")),
      msg: trimText(safe(function () { return result.error || result.msg; }, ""))
    });

    persist();
    return result;
  }

  async function approveValidateStage(planId, meta) {
    var runtime = getRuntime();
    if (!runtime || typeof runtime.approveValidateStage !== "function") {
      return { ok: false, msg: "runtime ausente" };
    }

    var targetPlanId = trimText(planId || state.lastPlanId || getCurrentPlanId());
    if (!targetPlanId) {
      return { ok: false, msg: "nenhum plano disponível" };
    }

    state.lastAction = "approveValidateStage";
    persist();

    var result = await runtime.approveValidateStage(targetPlanId, meta || {});

    pushHistory({
      ts: nowISO(),
      type: result && result.ok ? "approve-validate-stage" : "approve-validate-stage-fail",
      ok: !!(result && result.ok),
      planId: targetPlanId,
      msg: trimText(safe(function () { return result.error || result.msg; }, ""))
    });

    persist();
    return result;
  }

  async function runPlannerStep(promptOverride) {
    var actions = getActions();
    if (!actions || typeof actions.planFromCurrentRuntime !== "function") {
      return { ok: false, msg: "Factory AI Actions indisponível" };
    }

    if (state.busy) {
      return { ok: false, msg: "controller ocupado" };
    }

    state.busy = true;
    state.lastAction = "runPlannerStep";
    persist();

    try {
      var result = await actions.planFromCurrentRuntime({
        prompt: trimText(promptOverride || "Planeje a próxima evolução supervisionada da Factory AI."),
        reason: "factory_ai_controller.runPlannerStep"
      });

      if (result && result.ok && result.plan && result.plan.id) {
        state.lastPlanId = trimText(result.plan.id);
      }

      pushHistory({
        ts: nowISO(),
        type: result && result.ok ? "planner-step" : "planner-step-fail",
        ok: !!(result && result.ok),
        planId: trimText(safe(function () { return result.plan.id; }, "")),
        targetFile: normalizePath(safe(function () { return result.plan.targetFile || result.plan.nextFile; }, "")),
        msg: trimText(safe(function () { return result.msg; }, ""))
      });

      persist();
      return result;
    } catch (e) {
      var fail = { ok: false, msg: String(e && e.message || e || "falha no planner step") };
      pushHistory({
        ts: nowISO(),
        type: "planner-step-fail",
        ok: false,
        msg: fail.msg
      });
      persist();
      return fail;
    } finally {
      state.busy = false;
      persist();
    }
  }

  async function runEvolutionStep() {
    if (state.busy) {
      return { ok: false, msg: "controller ocupado" };
    }

    log("INFO", "executando evolução da Factory", {
      phase: getPhaseContext().activePhaseId
    });

    var analysis = await analyzeFactory(
      "Analise a arquitetura atual da RControl Factory, priorize a evolução da própria Factory AI e sugira o próximo avanço estrutural supervisionado."
    );

    if (!analysis || !analysis.ok) {
      return analysis || { ok: false, msg: "falha na análise" };
    }

    return {
      ok: true,
      msg: "Análise concluída",
      planId: state.lastPlanId || getCurrentPlanId(),
      snapshot: clone(getControllerSnapshot())
    };
  }

  function getLastPlanSummary() {
    var bridge = getBridge();
    if (!bridge || typeof bridge.getLastSummary !== "function") {
      return {
        planId: state.lastPlanId || "",
        targetFile: "",
        risk: "unknown"
      };
    }

    return clone(bridge.getLastSummary() || {});
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      lastUpdate: state.lastUpdate || null,
      lastAction: state.lastAction || "",
      lastPlanId: state.lastPlanId || "",
      phaseId: trimText(getPhaseContext().activePhaseId || ""),
      runtimeReady: !!getRuntime(),
      plannerReady: !!getPlanner(),
      bridgeReady: !!getBridge(),
      actionsReady: !!getActions(),
      patchSupervisorReady: !!getPatchSupervisor(),
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function getState() {
    return clone(state);
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    syncPresence();

    log("OK", "Factory AI Controller iniciado", {
      version: VERSION,
      phase: trimText(getPhaseContext().activePhaseId || "")
    });

    return status();
  }

  global.RCF_FACTORY_AI_CONTROLLER = {
    __v100: true,
    __v101: true,
    version: VERSION,
    init: init,
    status: status,
    getState: getState,
    getControllerSnapshot: getControllerSnapshot,
    getLastPlanSummary: getLastPlanSummary,
    analyzeFactory: analyzeFactory,
    runPlannerStep: runPlannerStep,
    approveLastPlan: approveLastPlan,
    validatePlan: validatePlan,
    stagePlan: stagePlan,
    applyPlan: applyPlan,
    approveValidateStage: approveValidateStage,
    runEvolutionStep: runEvolutionStep
  };

  try { init(); } catch (_) {}

})(window);

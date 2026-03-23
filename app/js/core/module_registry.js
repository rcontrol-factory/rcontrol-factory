function schedulePresenceResync(syncFn){
  try{
    [120,900,2200].forEach(function(ms){
      setTimeout(function(){
        try{ syncFn(); }catch(_){}
      },ms);
    });
  }catch(_){}
}

/* FILE: /app/js/core/module_registry.js
   RControl Factory — Module Registry
   v1.0.1 CURRENT STACK REGISTRY / SAFE LOOP GUARD

   Objetivo:
   - detectar módulos globais realmente carregados
   - manter lista coerente de módulos ativos no runtime atual
   - sincronizar com RCF_FACTORY_STATE sem depender rigidamente dele
   - expor summary confiável para Context Engine / Factory AI
   - reduzir snapshot vazio/inconsistente em Safari / PWA / pageshow / restore
   - evitar loop indireto entre summary -> refresh -> factory_state -> registry
   - funcionar como script clássico

   PATCH v1.4.4:
   - FIX: inclui stack completa atual da Factory AI
   - FIX: diagnostics agora aponta para RCF_FACTORY_AI_DIAGNOSTICS
   - FIX: adiciona memory/phase/autoloop/runtime/orchestrator/proposalUI/selfEvolution/autoheal/evolutionMode/governor/controller
   - FIX: summary expõe módulos atuais completos
*/

(function (global) {
  "use strict";

  if (global.RCF_MODULE_REGISTRY && global.RCF_MODULE_REGISTRY.__v148) return;

  var VERSION = "v1.4.8";

  var MODULE_KEYS = [
    "logger",
    "doctor",
    "github",
    "vault",
    "bridge",
    "adminAI",
    "factoryAI",
    "factoryState",
    "moduleRegistry",
    "contextEngine",
    "factoryTree",
    "diagnostics",
    "injector",
    "ui",
    "runtime",

    "factoryAIBridge",
    "factoryAIActions",
    "factoryAIPlanner",
    "patchSupervisor",
    "factoryAIDiagnostics",
    "factoryAIMemory",
    "factoryPhaseEngine",
    "factoryAIAutoLoop",
    "factoryAIRuntime",
    "factoryAIOrchestrator",
    "factoryAIProposalUI",
    "factoryAISelfEvolution",
    "factoryAIAutoHeal",
    "factoryAIEvolutionMode",
    "factoryAIGovernor",
    "factoryAIController"
  ];

  var modules = {
    logger: false,
    doctor: false,
    github: false,
    vault: false,
    bridge: false,
    adminAI: false,
    factoryAI: false,
    factoryState: false,
    moduleRegistry: true,
    contextEngine: false,
    factoryTree: false,
    diagnostics: false,
    injector: false,
    ui: false,
    runtime: false,

    factoryAIBridge: false,
    factoryAIActions: false,
    factoryAIPlanner: false,
    patchSupervisor: false,
    factoryAIDiagnostics: false,
    factoryAIMemory: false,
    factoryPhaseEngine: false,
    factoryAIAutoLoop: false,
    factoryAIRuntime: false,
    factoryAIOrchestrator: false,
    factoryAIProposalUI: false,
    factoryAISelfEvolution: false,
    factoryAIAutoHeal: false,
    factoryAIEvolutionMode: false,
    factoryAIGovernor: false,
    factoryAIController: false
  };

  var meta = {
    version: VERSION,
    lastRefresh: null,
    lastChange: null,
    bootedAt: nowISO()
  };

  var __refreshing = false;
  var __syncingState = false;

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

  function hasFn(obj, name) {
    try { return !!obj && typeof obj[name] === "function"; }
    catch (_) { return false; }
  }

  function sameModules(a, b) {
    try {
      var keys = uniqKeys(a, b);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!!safe(function () { return a[k]; }, false) !== !!safe(function () { return b[k]; }, false)) {
          return false;
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function uniqKeys(a, b) {
    var out = {};
    var arrA = Object.keys(a || {});
    var arrB = Object.keys(b || {});
    var arrC = MODULE_KEYS.slice();

    arrA.concat(arrB).concat(arrC).forEach(function (k) {
      if (!k) return;
      out[k] = true;
    });

    return Object.keys(out);
  }

  function ensureModuleKey(name) {
    var key = String(name || "").trim();
    if (!key) return "";
    if (MODULE_KEYS.indexOf(key) < 0) MODULE_KEYS.push(key);
    if (!Object.prototype.hasOwnProperty.call(modules, key)) {
      modules[key] = false;
    }
    return key;
  }

  function looksReady(obj) {
    try {
      if (!obj) return false;
      if (obj.ready === true) return true;
      if (hasFn(obj, "status")) {
        var s = obj.status() || {};
        if (s.ready === true) return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function forceLiveActive(next) {
    try {
      if (global.RCF_FACTORY_AI || global.RCF_FACTORY_IA) next.factoryAI = true;
      if (global.RCF_CONTEXT) next.contextEngine = true;
      if (global.RCF_FACTORY_TREE && (hasFn(global.RCF_FACTORY_TREE, "summary") || hasFn(global.RCF_FACTORY_TREE, "getTree"))) next.factoryTree = true;
      if (global.RCF_FACTORY_AI_PLANNER && (looksReady(global.RCF_FACTORY_AI_PLANNER) || hasFn(global.RCF_FACTORY_AI_PLANNER, "status"))) next.factoryAIPlanner = true;
      if (global.RCF_FACTORY_AI_BRIDGE && (looksReady(global.RCF_FACTORY_AI_BRIDGE) || hasFn(global.RCF_FACTORY_AI_BRIDGE, "status"))) next.factoryAIBridge = true;
      if (global.RCF_FACTORY_AI_ACTIONS && (looksReady(global.RCF_FACTORY_AI_ACTIONS) || hasFn(global.RCF_FACTORY_AI_ACTIONS, "status") || hasFn(global.RCF_FACTORY_AI_ACTIONS, "dispatch"))) next.factoryAIActions = true;
      if (global.RCF_FACTORY_AI_RUNTIME && (looksReady(global.RCF_FACTORY_AI_RUNTIME) || hasFn(global.RCF_FACTORY_AI_RUNTIME, "status") || hasFn(global.RCF_FACTORY_AI_RUNTIME, "ask"))) next.factoryAIRuntime = true;
      if (global.RCF_PATCH_SUPERVISOR && (looksReady(global.RCF_PATCH_SUPERVISOR) || hasFn(global.RCF_PATCH_SUPERVISOR, "status"))) next.patchSupervisor = true;
      if (global.RCF_LOGGER) next.logger = true;
      if (global.RCF_DOCTOR_SCAN || global.RCF_DOCTOR) next.doctor = true;
      if (global.RCF_FACTORY_STATE) next.factoryState = true;
      next.moduleRegistry = true;
    } catch (_) {}
    return next;
  }

  function detectLogger() {
    try {
      return !!global.RCF_LOGGER &&
        (
          Array.isArray(global.RCF_LOGGER.items) ||
          Array.isArray(global.RCF_LOGGER.lines) ||
          hasFn(global.RCF_LOGGER, "push") ||
          hasFn(global.RCF_LOGGER, "write") ||
          hasFn(global.RCF_LOGGER, "dump") ||
          hasFn(global.RCF_LOGGER, "getText") ||
          hasFn(global.RCF_LOGGER, "getAll")
        );
    } catch (_) {
      return false;
    }
  }

  function detectDoctor() {
    try {
      return !!global.RCF_DOCTOR_SCAN || !!global.RCF_DOCTOR;
    } catch (_) {
      return false;
    }
  }

  function detectGitHub() {
    try {
      return !!global.RCF_GH_SYNC &&
        (
          hasFn(global.RCF_GH_SYNC, "pull") ||
          hasFn(global.RCF_GH_SYNC, "push") ||
          hasFn(global.RCF_GH_SYNC, "pushMotherBundle") ||
          hasFn(global.RCF_GH_SYNC, "buildFactoryBundle")
        );
    } catch (_) {
      return false;
    }
  }

  function detectVault() {
    try {
      return !!global.RCF_ZIP_VAULT;
    } catch (_) {
      return false;
    }
  }

  function detectBridge() {
    try {
      return !!global.RCF_AGENT_ZIP_BRIDGE || !!global.RCF_FACTORY_AI_BRIDGE;
    } catch (_) {
      return false;
    }
  }

  function detectAdminAI() {
    try {
      return !!global.RCF_ADMIN_AI &&
        (
          hasFn(global.RCF_ADMIN_AI, "mount") ||
          hasFn(global.RCF_ADMIN_AI, "sendPrompt") ||
          !!global.RCF_ADMIN_AI.__v41_bridge ||
          !!global.RCF_ADMIN_AI.__v411_bridge ||
          !!global.RCF_ADMIN_AI.__v42_bridge ||
          !!global.RCF_ADMIN_AI.__v421_bridge
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAI() {
    try {
      var api = global.RCF_FACTORY_AI || global.RCF_FACTORY_IA;
      return !!api &&
        (
          hasFn(api, "mount") ||
          hasFn(api, "sendPrompt") ||
          hasFn(api, "getHistory") ||
          !!api.__v41 ||
          !!api.__v411 ||
          !!api.__v42 ||
          !!api.__v421
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryState() {
    try {
      return !!global.RCF_FACTORY_STATE &&
        (
          hasFn(global.RCF_FACTORY_STATE, "getState") ||
          hasFn(global.RCF_FACTORY_STATE, "status") ||
          hasFn(global.RCF_FACTORY_STATE, "refreshRuntime")
        );
    } catch (_) {
      return false;
    }
  }

  function detectContextEngine() {
    try {
      return !!global.RCF_CONTEXT &&
        (
          hasFn(global.RCF_CONTEXT, "getSnapshot") ||
          hasFn(global.RCF_CONTEXT, "getContext") ||
          hasFn(global.RCF_CONTEXT, "summary")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryTree() {
    try {
      return !!global.RCF_FACTORY_TREE &&
        (
          hasFn(global.RCF_FACTORY_TREE, "summary") ||
          hasFn(global.RCF_FACTORY_TREE, "getAllPaths") ||
          hasFn(global.RCF_FACTORY_TREE, "getTree")
        );
    } catch (_) {
      return false;
    }
  }

  function detectDiagnostics() {
    try {
      return !!global.RCF_FACTORY_AI_DIAGNOSTICS &&
        (
          hasFn(global.RCF_FACTORY_AI_DIAGNOSTICS, "scan") ||
          hasFn(global.RCF_FACTORY_AI_DIAGNOSTICS, "getLastReport") ||
          hasFn(global.RCF_FACTORY_AI_DIAGNOSTICS, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function detectInjector() {
    try {
      return !!global.RCF_INJECTOR_SAFE ||
        !!global.RCF_INJECTOR ||
        !!global.RCF_INJECTOR_SAFE_UI ||
        !!global.RCF_AGENT_INJECTOR ||
        !!global.RCF_PREVIEW_INJECTOR;
    } catch (_) {
      return false;
    }
  }

  function detectUI() {
    try {
      return !!global.RCF_UI ||
        !!global.RCF_UI_RUNTIME ||
        !!global.RCF_UI_BOOTSTRAP ||
        !!global.RCF_UI_VIEWS ||
        !!global.RCF_UI_ROUTER ||
        !!global.RCF_UI_EVENTS ||
        !!global.RCF_UI_STATE ||
        !!global.RCF_UI_DASHBOARD;
    } catch (_) {
      return false;
    }
  }

  function detectRuntime() {
    try {
      return !!global.__RCF_VFS_RUNTIME ||
        !!global.RCF_RUNTIME ||
        !!safe(function () { return global.RCF && global.RCF.state; }, null) ||
        !!safe(function () { return global.RCF_OVERRIDES_VFS; }, null);
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIBridge() {
    try {
      return !!global.RCF_FACTORY_AI_BRIDGE &&
        (
          hasFn(global.RCF_FACTORY_AI_BRIDGE, "ingestResponse") ||
          hasFn(global.RCF_FACTORY_AI_BRIDGE, "getLastPlan")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIActions() {
    try {
      return !!global.RCF_FACTORY_AI_ACTIONS &&
        (
          hasFn(global.RCF_FACTORY_AI_ACTIONS, "dispatch") ||
          hasFn(global.RCF_FACTORY_AI_ACTIONS, "getAutonomySnapshot")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIPlanner() {
    try {
      return !!global.RCF_FACTORY_AI_PLANNER &&
        (
          hasFn(global.RCF_FACTORY_AI_PLANNER, "buildPlan") ||
          hasFn(global.RCF_FACTORY_AI_PLANNER, "getLastPlan")
        );
    } catch (_) {
      return false;
    }
  }

  function detectPatchSupervisor() {
    try {
      return !!global.RCF_PATCH_SUPERVISOR &&
        (
          hasFn(global.RCF_PATCH_SUPERVISOR, "validateApprovedPlan") ||
          hasFn(global.RCF_PATCH_SUPERVISOR, "stageApprovedPlan") ||
          hasFn(global.RCF_PATCH_SUPERVISOR, "applyApprovedPlan")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIMemory() {
    try {
      return !!global.RCF_FACTORY_AI_MEMORY &&
        (
          hasFn(global.RCF_FACTORY_AI_MEMORY, "buildMemoryContext") ||
          hasFn(global.RCF_FACTORY_AI_MEMORY, "rememberDecision") ||
          hasFn(global.RCF_FACTORY_AI_MEMORY, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryPhaseEngine() {
    try {
      return !!global.RCF_FACTORY_PHASE_ENGINE &&
        (
          hasFn(global.RCF_FACTORY_PHASE_ENGINE, "buildPhaseContext") ||
          hasFn(global.RCF_FACTORY_PHASE_ENGINE, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIAutoLoop() {
    try {
      return !!global.RCF_FACTORY_AI_AUTOLOOP &&
        (
          hasFn(global.RCF_FACTORY_AI_AUTOLOOP, "runNow") ||
          hasFn(global.RCF_FACTORY_AI_AUTOLOOP, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIRuntime() {
    try {
      return !!global.RCF_FACTORY_AI_RUNTIME &&
        (
          hasFn(global.RCF_FACTORY_AI_RUNTIME, "ask") ||
          hasFn(global.RCF_FACTORY_AI_RUNTIME, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIOrchestrator() {
    try {
      return !!global.RCF_FACTORY_AI_ORCHESTRATOR &&
        (
          hasFn(global.RCF_FACTORY_AI_ORCHESTRATOR, "orchestrate") ||
          hasFn(global.RCF_FACTORY_AI_ORCHESTRATOR, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIProposalUI() {
    try {
      return !!global.RCF_FACTORY_AI_PROPOSAL_UI &&
        (
          hasFn(global.RCF_FACTORY_AI_PROPOSAL_UI, "status") ||
          hasFn(global.RCF_FACTORY_AI_PROPOSAL_UI, "show") ||
          hasFn(global.RCF_FACTORY_AI_PROPOSAL_UI, "mount")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAISelfEvolution() {
    try {
      return !!global.RCF_FACTORY_AI_SELF_EVOLUTION &&
        (
          hasFn(global.RCF_FACTORY_AI_SELF_EVOLUTION, "status") ||
          hasFn(global.RCF_FACTORY_AI_SELF_EVOLUTION, "runNow")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIAutoHeal() {
    try {
      return !!global.RCF_FACTORY_AI_AUTOHEAL &&
        (
          hasFn(global.RCF_FACTORY_AI_AUTOHEAL, "scan") ||
          hasFn(global.RCF_FACTORY_AI_AUTOHEAL, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIEvolutionMode() {
    try {
      return !!global.RCF_FACTORY_AI_EVOLUTION_MODE &&
        (
          hasFn(global.RCF_FACTORY_AI_EVOLUTION_MODE, "getMode") ||
          hasFn(global.RCF_FACTORY_AI_EVOLUTION_MODE, "setMode") ||
          hasFn(global.RCF_FACTORY_AI_EVOLUTION_MODE, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIGovernor() {
    try {
      return !!global.RCF_FACTORY_AI_GOVERNOR &&
        (
          hasFn(global.RCF_FACTORY_AI_GOVERNOR, "tick") ||
          hasFn(global.RCF_FACTORY_AI_GOVERNOR, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAIController() {
    try {
      return !!global.RCF_FACTORY_AI_CONTROLLER &&
        (
          hasFn(global.RCF_FACTORY_AI_CONTROLLER, "runEvolutionStep") ||
          hasFn(global.RCF_FACTORY_AI_CONTROLLER, "status")
        );
    } catch (_) {
      return false;
    }
  }

  function computeModules() {
    var next = {
      logger: detectLogger(),
      doctor: detectDoctor(),
      github: detectGitHub(),
      vault: detectVault(),
      bridge: detectBridge(),
      adminAI: detectAdminAI(),
      factoryAI: detectFactoryAI(),
      factoryState: detectFactoryState(),
      moduleRegistry: true,
      contextEngine: detectContextEngine(),
      factoryTree: detectFactoryTree(),
      diagnostics: detectDiagnostics(),
      injector: detectInjector(),
      ui: detectUI(),
      runtime: detectRuntime(),

      factoryAIBridge: detectFactoryAIBridge(),
      factoryAIActions: detectFactoryAIActions(),
      factoryAIPlanner: detectFactoryAIPlanner(),
      patchSupervisor: detectPatchSupervisor(),
      factoryAIDiagnostics: detectDiagnostics(),
      factoryAIMemory: detectFactoryAIMemory(),
      factoryPhaseEngine: detectFactoryPhaseEngine(),
      factoryAIAutoLoop: detectFactoryAIAutoLoop(),
      factoryAIRuntime: detectFactoryAIRuntime(),
      factoryAIOrchestrator: detectFactoryAIOrchestrator(),
      factoryAIProposalUI: detectFactoryAIProposalUI(),
      factoryAISelfEvolution: detectFactoryAISelfEvolution(),
      factoryAIAutoHeal: detectFactoryAIAutoHeal(),
      factoryAIEvolutionMode: detectFactoryAIEvolutionMode(),
      factoryAIGovernor: detectFactoryAIGovernor(),
      factoryAIController: detectFactoryAIController()
    };

    return forceLiveActive(next);
  }

  function syncToFactoryState() {
    if (__syncingState) return;

    try {
      if (!global.RCF_FACTORY_STATE) return;

      __syncingState = true;

      if (hasFn(global.RCF_FACTORY_STATE, "setModules")) {
        global.RCF_FACTORY_STATE.setModules(clone(modules));
      }

      if (hasFn(global.RCF_FACTORY_STATE, "setLoggerReady")) {
        global.RCF_FACTORY_STATE.setLoggerReady(!!modules.logger);
      }

      if (hasFn(global.RCF_FACTORY_STATE, "setDoctorReady")) {
        global.RCF_FACTORY_STATE.setDoctorReady(!!modules.doctor);
      }

      if (hasFn(global.RCF_FACTORY_STATE, "registerModule")) {
        global.RCF_FACTORY_STATE.registerModule("moduleRegistry");
      } else if (hasFn(global.RCF_FACTORY_STATE, "setModule")) {
        global.RCF_FACTORY_STATE.setModule("moduleRegistry", true);
      }
    } catch (_) {
    } finally {
      __syncingState = false;
    }
  }

  function logRefresh(before, after) {
    try {
      if (!sameModules(before, after) && global.RCF_LOGGER && hasFn(global.RCF_LOGGER, "push")) {
        global.RCF_LOGGER.push("INFO", "[MODULE_REGISTRY] refresh -> " + JSON.stringify(after));
      }
    } catch (_) {}
  }

  function refresh() {
    if (__refreshing) return getModules();

    __refreshing = true;

    try {
      var before = clone(modules);
      var next = computeModules();

      Object.keys(next).forEach(function (k) {
        ensureModuleKey(k);
      });

      modules = clone(next);
      meta.lastRefresh = nowISO();

      if (!sameModules(before, next)) {
        meta.lastChange = meta.lastRefresh;
      }

      syncToFactoryState();
      logRefresh(before, next);

      return getModules();
    } finally {
      __refreshing = false;
    }
  }

  function register(name) {
    var key = ensureModuleKey(name);
    if (!key) return false;

    if (modules[key] === true) return true;

    modules[key] = true;
    meta.lastChange = nowISO();
    meta.lastRefresh = meta.lastChange;
    syncToFactoryState();
    return true;
  }

  function unregister(name) {
    var key = String(name || "").trim();
    if (!key) return false;
    if (key === "moduleRegistry") return false;
    if (!Object.prototype.hasOwnProperty.call(modules, key)) return false;
    if (modules[key] === false) return true;

    modules[key] = false;
    meta.lastChange = nowISO();
    meta.lastRefresh = meta.lastChange;
    syncToFactoryState();
    return true;
  }

  function getModules() {
    return clone(modules);
  }

  function getActiveModules() {
    return Object.keys(modules).filter(function (k) {
      return !!modules[k];
    });
  }

  function getActiveModuleNames() {
    return getActiveModules();
  }

  function counts() {
    var total = Object.keys(modules).length;
    var active = getActiveModules().length;
    return {
      total: total,
      active: active,
      inactive: Math.max(0, total - active)
    };
  }

  function summary() {
    var c = counts();
    var active = getActiveModules();
    var current = getModules();

    if (!active.length) {
      try {
        var computed = computeModules();
        current = clone(computed || current);
        active = Object.keys(current).filter(function (k) { return !!current[k]; });
        c = {
          total: Object.keys(current).length,
          active: active.length,
          inactive: Math.max(0, Object.keys(current).length - active.length)
        };
      } catch (_) {}
    }

    if (!active.length) {
      try {
        var computed = computeModules();
        current = clone(computed || current);
        active = Object.keys(current).filter(function (k) { return !!current[k]; });
        c = {
          total: Object.keys(current).length,
          active: active.length,
          inactive: Math.max(0, Object.keys(current).length - active.length)
        };
      } catch (_) {}
    }

    return {
      version: VERSION,
      total: c.total,
      activeCount: c.active,
      inactiveCount: c.inactive,
      active: active,
      modules: clone(current),

      logger: !!current.logger,
      doctor: !!current.doctor,
      github: !!current.github,
      vault: !!current.vault,
      bridge: !!current.bridge,
      adminAI: !!current.adminAI,
      factoryAI: !!current.factoryAI,
      factoryState: !!current.factoryState,
      moduleRegistry: !!current.moduleRegistry,
      contextEngine: !!current.contextEngine,
      factoryTree: !!current.factoryTree,
      diagnostics: !!current.diagnostics,
      injector: !!current.injector,
      ui: !!current.ui,
      runtime: !!current.runtime,

      factoryAIBridge: !!current.factoryAIBridge,
      factoryAIActions: !!current.factoryAIActions,
      factoryAIPlanner: !!current.factoryAIPlanner,
      patchSupervisor: !!current.patchSupervisor,
      factoryAIDiagnostics: !!current.factoryAIDiagnostics,
      factoryAIMemory: !!current.factoryAIMemory,
      factoryPhaseEngine: !!current.factoryPhaseEngine,
      factoryAIAutoLoop: !!current.factoryAIAutoLoop,
      factoryAIRuntime: !!current.factoryAIRuntime,
      factoryAIOrchestrator: !!current.factoryAIOrchestrator,
      factoryAIProposalUI: !!current.factoryAIProposalUI,
      factoryAISelfEvolution: !!current.factoryAISelfEvolution,
      factoryAIAutoHeal: !!current.factoryAIAutoHeal,
      factoryAIEvolutionMode: !!current.factoryAIEvolutionMode,
      factoryAIGovernor: !!current.factoryAIGovernor,
      factoryAIController: !!current.factoryAIController,

      lastRefresh: meta.lastRefresh || nowISO(),
      lastChange: meta.lastChange || null,
      ts: nowISO()
    };
  }

  global.RCF_MODULE_REGISTRY = {
    __v1: true,
    __v11: true,
    __v12: true,
    __v13: true,
    __v14: true,
    __v141: true,
    __v142: true,
    __v143: true,
    __v148: true,
    version: VERSION,
    register: register,
    unregister: unregister,
    refresh: refresh,
    getModules: getModules,
    getActiveModules: getActiveModules,
    getActiveModuleNames: getActiveModuleNames,
    counts: counts,
    summary: summary
  };

  try {
    refresh();
    console.log("[RCF] module_registry ready", VERSION);
  } catch (_) {}

  try {
    global.addEventListener("DOMContentLoaded", function () {
      try { refresh(); } catch (_) {}
    }, { once: true });
  } catch (_) {}

  try {
    global.addEventListener("load", function () {
      try { refresh(); } catch (_) {}
    }, { once: true });
  } catch (_) {}

  try {
    global.addEventListener("pageshow", function () {
      try { refresh(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    global.addEventListener("focus", function () {
      try { refresh(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener("visibilitychange", function () {
        try {
          if (global.document.visibilityState === "visible") {
            refresh();
          }
        } catch (_) {}
      }, { passive: true });
    }
  } catch (_) {}

  try {
    global.addEventListener("RCF:UI_READY", function () {
      try { refresh(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    global.addEventListener("RCF:FACTORY_AI_RESPONSE", function () {
      try { refresh(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    setTimeout(function () {
      try { refresh(); } catch (_) {}
    }, 250);

    setTimeout(function () {
      try { refresh(); } catch (_) {}
    }, 900);

    setTimeout(function () {
      try { refresh(); } catch (_) {}
    }, 1800);

    setTimeout(function () {
      try { refresh(); } catch (_) {}
    }, 3200);
  } catch (_) {}

})(window);

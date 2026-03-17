/* FILE: /app/js/core/factory_ai_diagnostics.js
   RControl Factory — Factory AI Diagnostics
   v1.0.0 SUPERVISED DIAGNOSTICS CORE

   Objetivo:
   - centralizar diagnóstico operacional da Factory AI
   - consolidar presença, prontidão e ativação dos módulos principais
   - medir saúde da camada supervisionada da Factory
   - detectar gargalos e bloqueios antes de patch/apply
   - alimentar planner / autoloop / self-evolution / proposal ui
   - evitar repetição burra de sugestões sem contexto
   - NÃO aplicar patch automaticamente
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_DIAGNOSTICS && global.RCF_FACTORY_AI_DIAGNOSTICS.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_diagnostics";
  var MAX_HISTORY = 80;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastScanAt: null,
    lastReport: null,
    history: []
  };

  var MODULE_KEYS = [
    "contextEngine",
    "factoryState",
    "moduleRegistry",
    "factoryTree",
    "planner",
    "bridge",
    "actions",
    "patchSupervisor",
    "memory",
    "phaseEngine",
    "autoLoop",
    "runtime",
    "orchestrator",
    "proposalUI",
    "selfEvolution",
    "controller",
    "factoryAI",
    "doctor",
    "logger"
  ];

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

  function lower(v) {
    return trimText(v).toLowerCase();
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function uniq(arr) {
    var out = [];
    var seen = {};
    asArray(arr).forEach(function (item) {
      var key = String(item || "");
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
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
      state.version = VERSION;
      state.ready = !!parsed.ready;
      state.lastUpdate = parsed.lastUpdate || null;
      state.lastScanAt = parsed.lastScanAt || null;
      state.lastReport = parsed.lastReport || null;
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];
      return true;
    } catch (_) {
      return false;
    }
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_DIAGNOSTICS] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_DIAGNOSTICS] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_DIAGNOSTICS]", level, msg, extra || ""); } catch (_) {}
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function getFactoryState() {
    return safe(function () {
      if (global.RCF_FACTORY_STATE?.getState) return global.RCF_FACTORY_STATE.getState();
      if (global.RCF_FACTORY_STATE?.status) return global.RCF_FACTORY_STATE.status();
      return {};
    }, {});
  }

  function getModuleRegistrySummary() {
    return safe(function () {
      if (global.RCF_MODULE_REGISTRY?.summary) return global.RCF_MODULE_REGISTRY.summary();
      return {};
    }, {});
  }

  function getContextSnapshot() {
    return safe(function () {
      if (global.RCF_CONTEXT?.getSnapshot) return global.RCF_CONTEXT.getSnapshot();
      if (global.RCF_CONTEXT?.getContext) return global.RCF_CONTEXT.getContext();
      return {};
    }, {});
  }

  function getTreeSummary() {
    return safe(function () {
      if (global.RCF_FACTORY_TREE?.summary) return global.RCF_FACTORY_TREE.summary();
      return {};
    }, {});
  }

  function getPlannerStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_PLANNER?.status) return global.RCF_FACTORY_AI_PLANNER.status();
      return {};
    }, {});
  }

  function getBridgeStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_BRIDGE?.status) return global.RCF_FACTORY_AI_BRIDGE.status();
      return {};
    }, {});
  }

  function getActionsStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_ACTIONS?.status) return global.RCF_FACTORY_AI_ACTIONS.status();
      return {};
    }, {});
  }

  function getPatchSupervisorStatus() {
    return safe(function () {
      if (global.RCF_PATCH_SUPERVISOR?.status) return global.RCF_PATCH_SUPERVISOR.status();
      return {};
    }, {});
  }

  function getMemoryStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_MEMORY?.status) return global.RCF_FACTORY_AI_MEMORY.status();
      return {};
    }, {});
  }

  function getPhaseStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_PHASE_ENGINE?.status) return global.RCF_FACTORY_PHASE_ENGINE.status();
      return {};
    }, {});
  }

  function getPhaseContext() {
    return safe(function () {
      if (global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext) return global.RCF_FACTORY_PHASE_ENGINE.buildPhaseContext();
      return {};
    }, {});
  }

  function getAutoLoopStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_AUTOLOOP?.status) return global.RCF_FACTORY_AI_AUTOLOOP.status();
      return {};
    }, {});
  }

  function getRuntimeStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_RUNTIME?.status) return global.RCF_FACTORY_AI_RUNTIME.status();
      return {};
    }, {});
  }

  function getOrchestratorStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_ORCHESTRATOR?.status) return global.RCF_FACTORY_AI_ORCHESTRATOR.status();
      return {};
    }, {});
  }

  function getProposalUIStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_PROPOSAL_UI?.status) return global.RCF_FACTORY_AI_PROPOSAL_UI.status();
      return {};
    }, {});
  }

  function getSelfEvolutionStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_SELF_EVOLUTION?.status) return global.RCF_FACTORY_AI_SELF_EVOLUTION.status();
      return {};
    }, {});
  }

  function getControllerStatus() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_CONTROLLER?.status) return global.RCF_FACTORY_AI_CONTROLLER.status();
      return {};
    }, {});
  }

  function getDoctorState() {
    return safe(function () {
      if (global.RCF_DOCTOR_SCAN) {
        return {
          ready: true,
          version: global.RCF_DOCTOR_SCAN.version || "unknown",
          lastRun: global.RCF_DOCTOR_SCAN.lastRun || null,
          lastReport: global.RCF_DOCTOR_SCAN.lastReport || null
        };
      }

      return {
        ready: !!global.RCF_DOCTOR,
        version: safe(function () { return global.RCF_DOCTOR.version; }, "unknown"),
        lastRun: safe(function () { return global.RCF_DOCTOR.lastRun; }, null),
        lastReport: safe(function () { return global.RCF_DOCTOR.lastReport; }, null)
      };
    }, {});
  }

  function getLoggerState() {
    return safe(function () {
      var logger = global.RCF_LOGGER;
      if (!logger) {
        return {
          ready: false,
          itemsCount: 0
        };
      }

      var itemsCount = 0;

      if (Array.isArray(logger.items)) itemsCount = logger.items.length;
      else if (Array.isArray(logger.lines)) itemsCount = logger.lines.length;
      else if (typeof logger.getAll === "function") {
        var arr = logger.getAll();
        itemsCount = Array.isArray(arr) ? arr.length : 0;
      }

      return {
        ready: true,
        itemsCount: Number(itemsCount || 0)
      };
    }, {
      ready: false,
      itemsCount: 0
    });
  }

  function getFactoryAIState() {
    return safe(function () {
      var api = global.RCF_FACTORY_AI || global.RCF_FACTORY_IA || null;
      if (!api) return {};
      return {
        ready: true,
        version: api.version || "unknown",
        lastEndpoint: safe(function () { return api.getLastEndpoint ? api.getLastEndpoint() : ""; }, ""),
        historyCount: safe(function () {
          var hist = api.getHistory ? api.getHistory() : [];
          return Array.isArray(hist) ? hist.length : 0;
        }, 0),
        attachmentsCount: safe(function () {
          var att = api.getAttachments ? api.getAttachments() : [];
          return Array.isArray(att) ? att.length : 0;
        }, 0)
      };
    }, {});
  }

  function getKnownFiles(snapshot, tree) {
    var out = [];
    var candidateFiles = safe(function () { return snapshot.candidateFiles; }, []);
    var samples = safe(function () { return snapshot.tree.samples; }, []);
    var grouped = safe(function () { return snapshot.tree.pathGroups; }, {});
    var treeSamples = safe(function () { return tree.samples; }, {});

    out = out
      .concat(asArray(candidateFiles))
      .concat(asArray(samples))
      .concat(asArray(grouped.core))
      .concat(asArray(grouped.ui))
      .concat(asArray(grouped.admin))
      .concat(asArray(grouped.engine))
      .concat(asArray(grouped.functions))
      .concat(asArray(treeSamples.core))
      .concat(asArray(treeSamples.ui))
      .concat(asArray(treeSamples.admin))
      .concat(asArray(treeSamples.engine))
      .concat(asArray(treeSamples.functions));

    return uniq(out.map(normalizePath).filter(Boolean));
  }

  function getModuleActiveList(moduleSummary) {
    return safe(function () {
      if (Array.isArray(moduleSummary.active)) return moduleSummary.active.slice();
      var map = moduleSummary.modules || {};
      return Object.keys(map).filter(function (k) { return !!map[k]; });
    }, []);
  }

  function hasActive(activeList, name) {
    return asArray(activeList).indexOf(String(name || "")) >= 0;
  }

  function buildModuleDiagnostic(name, cfg) {
    var presence = !!cfg.presence;
    var ready = !!cfg.ready;
    var active = !!cfg.active;
    var file = normalizePath(cfg.file || "");
    var note = "";
    var score = 0;

    if (presence) score += 35;
    if (ready) score += 35;
    if (active) score += 30;

    if (presence && ready && active) {
      note = "presente, pronto e ativo";
    } else if (presence && ready && !active) {
      note = "presente e pronto, mas não marcado como ativo no snapshot atual";
    } else if (presence && !ready && active) {
      note = "presente e ativo, mas sem prontidão clara";
    } else if (presence && !ready && !active) {
      note = "presente, mas sem prontidão clara e sem ativação confirmada";
    } else if (!presence && ready) {
      note = "possível inconsistência: pronto sem presença explícita";
    } else if (!presence && active) {
      note = "possível inconsistência: ativo sem presença explícita";
    } else {
      note = "sem evidência suficiente no runtime atual";
    }

    return {
      name: name,
      file: file,
      presence: presence,
      ready: ready,
      active: active,
      score: score,
      note: note,
      meta: clone(cfg.meta || {})
    };
  }

  function buildModulesReport() {
    var factoryState = getFactoryState();
    var moduleSummary = getModuleRegistrySummary();
    var snapshot = getContextSnapshot();
    var tree = getTreeSummary();
    var planner = getPlannerStatus();
    var bridge = getBridgeStatus();
    var actions = getActionsStatus();
    var patch = getPatchSupervisorStatus();
    var memory = getMemoryStatus();
    var phase = getPhaseStatus();
    var autoloop = getAutoLoopStatus();
    var runtime = getRuntimeStatus();
    var orchestrator = getOrchestratorStatus();
    var proposalUI = getProposalUIStatus();
    var selfEvolution = getSelfEvolutionStatus();
    var controller = getControllerStatus();
    var doctor = getDoctorState();
    var logger = getLoggerState();
    var factoryAI = getFactoryAIState();

    var activeList = getModuleActiveList(moduleSummary);
    var flags = safe(function () { return snapshot.factory.flags; }, {}) || {};
    var knownFiles = getKnownFiles(snapshot, tree);

    function hasFlag(name) {
      return !!safe(function () { return flags[name]; }, false);
    }

    function fileKnown(path) {
      return knownFiles.indexOf(normalizePath(path)) >= 0;
    }

    var report = {};

    report.contextEngine = buildModuleDiagnostic("contextEngine", {
      file: "/app/js/core/context_engine.js",
      presence: hasFlag("hasContextEngine") || !!global.RCF_CONTEXT || fileKnown("/app/js/core/context_engine.js"),
      ready: !!global.RCF_CONTEXT,
      active: hasActive(activeList, "contextEngine"),
      meta: {}
    });

    report.factoryState = buildModuleDiagnostic("factoryState", {
      file: "/app/js/core/factory_state.js",
      presence: hasFlag("hasFactoryState") || !!global.RCF_FACTORY_STATE || fileKnown("/app/js/core/factory_state.js"),
      ready: !!global.RCF_FACTORY_STATE,
      active: hasActive(activeList, "factoryState"),
      meta: {
        bootStatus: trimText(factoryState.bootStatus || ""),
        activeView: trimText(factoryState.activeView || "")
      }
    });

    report.moduleRegistry = buildModuleDiagnostic("moduleRegistry", {
      file: "/app/js/core/module_registry.js",
      presence: hasFlag("hasModuleRegistry") || !!global.RCF_MODULE_REGISTRY || fileKnown("/app/js/core/module_registry.js"),
      ready: !!global.RCF_MODULE_REGISTRY,
      active: hasActive(activeList, "moduleRegistry"),
      meta: {
        total: Number(moduleSummary.total || 0)
      }
    });

    report.factoryTree = buildModuleDiagnostic("factoryTree", {
      file: "/app/js/core/factory_tree.js",
      presence: hasFlag("hasFactoryTree") || !!global.RCF_FACTORY_TREE || fileKnown("/app/js/core/factory_tree.js"),
      ready: !!global.RCF_FACTORY_TREE,
      active: hasActive(activeList, "factoryTree"),
      meta: {
        pathsCount: Number(safe(function () { return snapshot.tree.pathsCount; }, 0) || 0)
      }
    });

    report.planner = buildModuleDiagnostic("planner", {
      file: "/app/js/core/factory_ai_planner.js",
      presence: hasFlag("hasFactoryAIPlanner") || !!global.RCF_FACTORY_AI_PLANNER || fileKnown("/app/js/core/factory_ai_planner.js"),
      ready: !!planner.ready || !!global.RCF_FACTORY_AI_PLANNER,
      active: hasActive(activeList, "factoryAIPlanner"),
      meta: {
        lastGoal: trimText(planner.lastGoal || ""),
        lastPriority: trimText(planner.lastPriority || ""),
        lastNextFile: trimText(planner.lastNextFile || "")
      }
    });

    report.bridge = buildModuleDiagnostic("bridge", {
      file: "/app/js/core/factory_ai_bridge.js",
      presence: hasFlag("hasFactoryAIBridge") || !!global.RCF_FACTORY_AI_BRIDGE || fileKnown("/app/js/core/factory_ai_bridge.js"),
      ready: !!bridge.ready || !!global.RCF_FACTORY_AI_BRIDGE,
      active: hasActive(activeList, "factoryAIBridge"),
      meta: {
        approvalStatus: trimText(bridge.approvalStatus || ""),
        targetFile: trimText(bridge.targetFile || ""),
        source: trimText(bridge.source || "")
      }
    });

    report.actions = buildModuleDiagnostic("actions", {
      file: "/app/js/core/factory_ai_actions.js",
      presence: hasFlag("hasFactoryAIActions") || !!global.RCF_FACTORY_AI_ACTIONS || fileKnown("/app/js/core/factory_ai_actions.js"),
      ready: !!actions.ready || !!global.RCF_FACTORY_AI_ACTIONS,
      active: hasActive(activeList, "factoryAIActions"),
      meta: {
        plannerReady: !!actions.plannerReady,
        bridgeReady: !!actions.bridgeReady,
        patchSupervisorReady: !!actions.patchSupervisorReady
      }
    });

    report.patchSupervisor = buildModuleDiagnostic("patchSupervisor", {
      file: "/app/js/core/patch_supervisor.js",
      presence: hasFlag("hasPatchSupervisor") || !!global.RCF_PATCH_SUPERVISOR || fileKnown("/app/js/core/patch_supervisor.js"),
      ready: !!patch.ready || !!global.RCF_PATCH_SUPERVISOR,
      active: hasActive(activeList, "patchSupervisor"),
      meta: {
        hasStagedPatch: !!patch.hasStagedPatch,
        stagedTargetFile: trimText(patch.stagedTargetFile || ""),
        lastApplyOk: !!patch.lastApplyOk
      }
    });

    report.memory = buildModuleDiagnostic("memory", {
      file: "/app/js/core/factory_ai_memory.js",
      presence: !!global.RCF_FACTORY_AI_MEMORY || fileKnown("/app/js/core/factory_ai_memory.js"),
      ready: !!memory.ready || !!global.RCF_FACTORY_AI_MEMORY,
      active: hasActive(activeList, "factoryAIMemory"),
      meta: {
        historyCount: Number(memory.historyCount || 0)
      }
    });

    report.phaseEngine = buildModuleDiagnostic("phaseEngine", {
      file: "/app/js/core/factory_phase_engine.js",
      presence: !!global.RCF_FACTORY_PHASE_ENGINE || fileKnown("/app/js/core/factory_phase_engine.js"),
      ready: !!phase.ready || !!global.RCF_FACTORY_PHASE_ENGINE,
      active: hasActive(activeList, "factoryPhaseEngine"),
      meta: {
        currentPhaseId: trimText(phase.currentPhaseId || "")
      }
    });

    report.autoLoop = buildModuleDiagnostic("autoLoop", {
      file: "/app/js/core/factory_ai_autoloop.js",
      presence: !!global.RCF_FACTORY_AI_AUTOLOOP || fileKnown("/app/js/core/factory_ai_autoloop.js"),
      ready: !!autoloop.ready || !!global.RCF_FACTORY_AI_AUTOLOOP,
      active: hasActive(activeList, "factoryAIAutoLoop"),
      meta: {
        enabled: !!autoloop.enabled,
        running: !!autoloop.running,
        lastStatus: trimText(autoloop.lastStatus || "")
      }
    });

    report.runtime = buildModuleDiagnostic("runtime", {
      file: "/app/js/core/factory_ai_runtime.js",
      presence: !!global.RCF_FACTORY_AI_RUNTIME || fileKnown("/app/js/core/factory_ai_runtime.js"),
      ready: !!runtime.ready || !!global.RCF_FACTORY_AI_RUNTIME,
      active: hasActive(activeList, "factoryAIRuntime"),
      meta: {
        busy: !!runtime.busy,
        lastPlanId: trimText(runtime.lastPlanId || "")
      }
    });

    report.orchestrator = buildModuleDiagnostic("orchestrator", {
      file: "/app/js/core/factory_ai_orchestrator.js",
      presence: !!global.RCF_FACTORY_AI_ORCHESTRATOR || fileKnown("/app/js/core/factory_ai_orchestrator.js"),
      ready: !!orchestrator.contextReady || !!global.RCF_FACTORY_AI_ORCHESTRATOR,
      active: hasActive(activeList, "factoryAIOrchestrator"),
      meta: {
        plannerReady: !!orchestrator.plannerReady,
        actionsReady: !!orchestrator.actionsReady
      }
    });

    report.proposalUI = buildModuleDiagnostic("proposalUI", {
      file: "/app/js/core/factory_ai_proposal_ui.js",
      presence: !!global.RCF_FACTORY_AI_PROPOSAL_UI || fileKnown("/app/js/core/factory_ai_proposal_ui.js"),
      ready: !!proposalUI.ready || !!global.RCF_FACTORY_AI_PROPOSAL_UI,
      active: hasActive(activeList, "factoryAIProposalUI"),
      meta: {}
    });

    report.selfEvolution = buildModuleDiagnostic("selfEvolution", {
      file: "/app/js/core/factory_ai_self_evolution.js",
      presence: !!global.RCF_FACTORY_AI_SELF_EVOLUTION || fileKnown("/app/js/core/factory_ai_self_evolution.js"),
      ready: !!selfEvolution.ready || !!global.RCF_FACTORY_AI_SELF_EVOLUTION,
      active: hasActive(activeList, "factoryAISelfEvolution"),
      meta: {
        enabled: !!selfEvolution.enabled,
        running: !!selfEvolution.running,
        lastStatus: trimText(selfEvolution.lastStatus || "")
      }
    });

    report.controller = buildModuleDiagnostic("controller", {
      file: "/app/js/core/factory_ai_controller.js",
      presence: !!global.RCF_FACTORY_AI_CONTROLLER || fileKnown("/app/js/core/factory_ai_controller.js"),
      ready: !!controller.ready || !!global.RCF_FACTORY_AI_CONTROLLER,
      active: hasActive(activeList, "factoryAIController"),
      meta: {
        busy: !!controller.busy,
        lastPlanId: trimText(controller.lastPlanId || "")
      }
    });

    report.factoryAI = buildModuleDiagnostic("factoryAI", {
      file: "/app/js/admin.admin_ai.js",
      presence: hasFlag("hasFactoryAI") || !!global.RCF_FACTORY_AI || !!global.RCF_FACTORY_IA || fileKnown("/app/js/admin.admin_ai.js"),
      ready: !!factoryAI.ready,
      active: hasActive(activeList, "factoryAI"),
      meta: {
        historyCount: Number(factoryAI.historyCount || 0),
        lastEndpoint: trimText(factoryAI.lastEndpoint || "")
      }
    });

    report.doctor = buildModuleDiagnostic("doctor", {
      file: "/app/js/core/doctor_scan.js",
      presence: hasFlag("hasDoctor") || !!global.RCF_DOCTOR || !!global.RCF_DOCTOR_SCAN || fileKnown("/app/js/core/doctor_scan.js"),
      ready: !!doctor.ready,
      active: hasActive(activeList, "doctor"),
      meta: {
        lastRun: doctor.lastRun || null
      }
    });

    report.logger = buildModuleDiagnostic("logger", {
      file: "/app/js/core/logger.js",
      presence: hasFlag("hasLogger") || !!global.RCF_LOGGER || fileKnown("/app/js/core/logger.js"),
      ready: !!logger.ready,
      active: hasActive(activeList, "logger"),
      meta: {
        itemsCount: Number(logger.itemsCount || 0)
      }
    });

    return report;
  }

  function calculateHealth(modulesReport, phaseCtx, patchStatus, plannerStatus, runtimeStatus) {
    var total = 0;
    var count = 0;
    var blockers = [];
    var warnings = [];
    var positives = [];

    MODULE_KEYS.forEach(function (key) {
      var mod = modulesReport[key];
      if (!mod) return;
      total += Number(mod.score || 0);
      count += 1;

      if (!mod.presence) blockers.push(mod.name + " sem presença confirmada");
      else if (!mod.ready) warnings.push(mod.name + " presente sem prontidão clara");
      else if (!mod.active) warnings.push(mod.name + " pronto, mas não ativo no snapshot atual");
      else positives.push(mod.name + " operacional");
    });

    var baseScore = count ? Math.round(total / count) : 0;

    if (!!patchStatus.hasStagedPatch) {
      baseScore += 4;
      positives.push("patch supervisor com staged patch");
    }

    if (!!plannerStatus.lastNextFile) {
      baseScore += 4;
      positives.push("planner com próximo arquivo consolidado");
    } else {
      warnings.push("planner sem nextFile consolidado");
    }

    if (!!runtimeStatus.lastPlanId) {
      baseScore += 3;
      positives.push("runtime já integrou pelo menos um plano");
    }

    var activePhase = safe(function () { return phaseCtx.activePhase; }, null);
    var allow = safe(function () { return activePhase.allow; }, {}) || {};
    if (!allow.apply) {
      positives.push("fase atual mantém apply bloqueado por segurança");
    }

    if (!!allow.autoloop && !safe(function () { return modulesReport.autoLoop.ready; }, false)) {
      warnings.push("fase já admite autoloop, mas autoloop ainda não está pronto");
    }

    if (baseScore > 100) baseScore = 100;
    if (baseScore < 0) baseScore = 0;

    var grade = "fragile";
    if (baseScore >= 85) grade = "strong";
    else if (baseScore >= 70) grade = "good";
    else if (baseScore >= 55) grade = "medium";

    return {
      score: baseScore,
      grade: grade,
      blockers: uniq(blockers).slice(0, 12),
      warnings: uniq(warnings).slice(0, 20),
      positives: uniq(positives).slice(0, 20)
    };
  }

  function chooseNextFocus(report, health, phaseCtx) {
    var planner = report.planner || {};
    var bridge = report.bridge || {};
    var actions = report.actions || {};
    var memory = report.memory || {};
    var runtime = report.runtime || {};
    var autoLoop = report.autoLoop || {};
    var selfEvolution = report.selfEvolution || {};
    var proposalUI = report.proposalUI || {};
    var patchSupervisor = report.patchSupervisor || {};

    var recommended = asArray(safe(function () { return phaseCtx.recommendedTargets; }, []));
    var activePhaseId = trimText(safe(function () { return phaseCtx.activePhase.id; }, ""));

    if (!planner.ready) {
      return {
        targetFile: "/app/js/core/factory_ai_planner.js",
        reason: "planner ainda não está pronto e continua sendo o centro da priorização cognitiva"
      };
    }

    if (!bridge.ready) {
      return {
        targetFile: "/app/js/core/factory_ai_bridge.js",
        reason: "bridge ainda não está pronto e bloqueia a transformação de resposta em plano supervisionado"
      };
    }

    if (!actions.ready) {
      return {
        targetFile: "/app/js/core/factory_ai_actions.js",
        reason: "actions ainda não está pronto e impede o fluxo local supervisionado"
      };
    }

    if (!runtime.ready) {
      return {
        targetFile: "/app/js/core/factory_ai_runtime.js",
        reason: "runtime ainda não está pronto e enfraquece a integração Factory AI → backend → bridge"
      };
    }

    if (!memory.ready) {
      return {
        targetFile: "/app/js/core/factory_ai_memory.js",
        reason: "memory ainda não está pronta e a Factory continua sem memória operacional confiável"
      };
    }

    if (!proposalUI.ready) {
      return {
        targetFile: "/app/js/core/factory_ai_proposal_ui.js",
        reason: "proposal ui ainda não está pronta para exibir aprovação humana do plano"
      };
    }

    if (activePhaseId === "factory-ai-autoloop-supervised" && !autoLoop.ready) {
      return {
        targetFile: "/app/js/core/factory_ai_autoloop.js",
        reason: "fase atual já pede autoloop supervisionado, mas o módulo ainda não está pronto"
      };
    }

    if (activePhaseId === "factory-ai-autoloop-supervised" && !selfEvolution.ready) {
      return {
        targetFile: "/app/js/core/factory_ai_self_evolution.js",
        reason: "fase atual já pede self evolution supervisionado, mas o módulo ainda não está pronto"
      };
    }

    if (!patchSupervisor.ready) {
      return {
        targetFile: "/app/js/core/patch_supervisor.js",
        reason: "patch supervisor ainda não está pronto e o fluxo approve → validate → stage → apply fica incompleto"
      };
    }

    if (recommended.length) {
      return {
        targetFile: normalizePath(recommended[0]),
        reason: "fase atual recomenda esse alvo como próximo arquivo estratégico"
      };
    }

    return {
      targetFile: "/app/js/core/factory_ai_diagnostics.js",
      reason: health.score >= 70
        ? "manter camada de diagnóstico forte para alimentar planner, autoloop e self evolution"
        : "sem foco consolidado suficiente; fortalecer diagnóstico continua sendo o caminho mais seguro"
    };
  }

  function buildRecommendations(report, health, phaseCtx, nextFocus) {
    var out = [];

    if (!report.factoryTree.ready) {
      out.push("consolidar /app/js/core/factory_tree.js para melhorar visibilidade estrutural do runtime");
    }

    if (!report.factoryState.ready) {
      out.push("consolidar /app/js/core/factory_state.js para fortalecer leitura do runtime");
    }

    if (!report.bridge.ready) {
      out.push("consolidar /app/js/core/factory_ai_bridge.js antes de ampliar automação");
    }

    if (!report.actions.ready) {
      out.push("consolidar /app/js/core/factory_ai_actions.js para fechar o fluxo local supervisionado");
    }

    if (!report.memory.ready) {
      out.push("consolidar /app/js/core/factory_ai_memory.js para evitar repetição sem aprendizado");
    }

    if (!report.proposalUI.ready) {
      out.push("consolidar /app/js/core/factory_ai_proposal_ui.js para aprovar propostas com clareza");
    }

    if (safe(function () { return phaseCtx.activePhase.allow.autoloop; }, false) && !report.autoLoop.ready) {
      out.push("consolidar /app/js/core/factory_ai_autoloop.js porque a fase atual já admite autoloop");
    }

    if (safe(function () { return phaseCtx.activePhase.allow.autoloop; }, false) && !report.selfEvolution.ready) {
      out.push("consolidar /app/js/core/factory_ai_self_evolution.js para subir autoevolução supervisionada");
    }

    if (health.score >= 75) {
      out.push("seguir pelo próximo alvo estratégico sem voltar ao ciclo genérico doctor/state/registry/tree");
    }

    if (nextFocus && nextFocus.targetFile) {
      out.unshift("próximo foco recomendado: " + nextFocus.targetFile + " — " + trimText(nextFocus.reason || ""));
    }

    return uniq(out).slice(0, 10);
  }

  function buildReport() {
    var factoryState = getFactoryState();
    var moduleSummary = getModuleRegistrySummary();
    var snapshot = getContextSnapshot();
    var tree = getTreeSummary();
    var phaseCtx = getPhaseContext();
    var plannerStatus = getPlannerStatus();
    var bridgeStatus = getBridgeStatus();
    var actionsStatus = getActionsStatus();
    var patchStatus = getPatchSupervisorStatus();
    var memoryStatus = getMemoryStatus();
    var autoLoopStatus = getAutoLoopStatus();
    var runtimeStatus = getRuntimeStatus();
    var selfEvolutionStatus = getSelfEvolutionStatus();

    var modulesReport = buildModulesReport();
    var health = calculateHealth(modulesReport, phaseCtx, patchStatus, plannerStatus, runtimeStatus);
    var nextFocus = chooseNextFocus(modulesReport, health, phaseCtx);
    var recommendations = buildRecommendations(modulesReport, health, phaseCtx, nextFocus);

    return {
      version: VERSION,
      ts: nowISO(),
      runtime: {
        bootStatus: trimText(factoryState.bootStatus || ""),
        activeView: trimText(factoryState.activeView || ""),
        activeAppSlug: trimText(factoryState.activeAppSlug || ""),
        engineVersion: trimText(factoryState.engineVersion || ""),
        environment: trimText(factoryState.environment || ""),
        pathsCount: Number(safe(function () { return snapshot.tree.pathsCount; }, 0) || 0),
        activeModules: getModuleActiveList(moduleSummary)
      },
      phase: {
        activePhaseId: trimText(safe(function () { return phaseCtx.activePhase.id; }, "")),
        activePhaseTitle: trimText(safe(function () { return phaseCtx.activePhase.title; }, "")),
        recommendedTargets: clone(safe(function () { return phaseCtx.recommendedTargets; }, [])),
        allow: clone(safe(function () { return phaseCtx.activePhase.allow; }, {}))
      },
      health: clone(health),
      nextFocus: clone(nextFocus),
      planner: {
        lastGoal: trimText(plannerStatus.lastGoal || ""),
        lastPriority: trimText(plannerStatus.lastPriority || ""),
        lastNextFile: trimText(plannerStatus.lastNextFile || "")
      },
      bridge: {
        approvalStatus: trimText(bridgeStatus.approvalStatus || ""),
        targetFile: trimText(bridgeStatus.targetFile || ""),
        source: trimText(bridgeStatus.source || "")
      },
      actions: {
        plannerReady: !!actionsStatus.plannerReady,
        bridgeReady: !!actionsStatus.bridgeReady,
        patchSupervisorReady: !!actionsStatus.patchSupervisorReady
      },
      patchSupervisor: {
        hasStagedPatch: !!patchStatus.hasStagedPatch,
        stagedTargetFile: trimText(patchStatus.stagedTargetFile || ""),
        lastApplyOk: !!patchStatus.lastApplyOk
      },
      memory: {
        ready: !!memoryStatus.ready,
        historyCount: Number(memoryStatus.historyCount || 0)
      },
      autoloop: {
        ready: !!autoLoopStatus.ready,
        enabled: !!autoLoopStatus.enabled,
        running: !!autoLoopStatus.running,
        lastStatus: trimText(autoLoopStatus.lastStatus || "")
      },
      runtimeLayer: {
        ready: !!runtimeStatus.ready,
        busy: !!runtimeStatus.busy,
        lastPlanId: trimText(runtimeStatus.lastPlanId || "")
      },
      selfEvolution: {
        ready: !!selfEvolutionStatus.ready,
        enabled: !!selfEvolutionStatus.enabled,
        running: !!selfEvolutionStatus.running,
        lastStatus: trimText(selfEvolutionStatus.lastStatus || "")
      },
      modules: clone(modulesReport),
      recommendations: clone(recommendations)
    };
  }

  function rememberReport(report) {
    state.lastScanAt = nowISO();
    state.lastReport = clone(report || null);
    persist();

    pushHistory({
      type: "diagnostics-report",
      ts: state.lastScanAt,
      nextFocus: trimText(safe(function () { return report.nextFocus.targetFile; }, "")),
      score: Number(safe(function () { return report.health.score; }, 0) || 0),
      grade: trimText(safe(function () { return report.health.grade; }, ""))
    });
  }

  function scan() {
    var report = buildReport();
    rememberReport(report);

    emit("RCF:FACTORY_AI_DIAGNOSTICS_REPORT", {
      report: clone(report)
    });

    pushLog("OK", "diagnostics scan ✅", {
      score: safe(function () { return report.health.score; }, 0),
      grade: safe(function () { return report.health.grade; }, ""),
      nextFocus: safe(function () { return report.nextFocus.targetFile; }, "")
    });

    return clone(report);
  }

  function getLastReport() {
    return clone(state.lastReport || null);
  }

  function explainLastReport() {
    var report = getLastReport();
    if (!report) {
      return {
        ok: false,
        msg: "Nenhum relatório calculado ainda."
      };
    }

    return {
      ok: true,
      report: clone(report),
      text: [
        "Saúde geral: " + trimText(safe(function () { return report.health.grade; }, "")) + " (" + String(safe(function () { return report.health.score; }, 0)) + ")",
        "Fase ativa: " + trimText(safe(function () { return report.phase.activePhaseTitle; }, "")),
        "Próximo foco: " + trimText(safe(function () { return report.nextFocus.targetFile; }, "")),
        "Motivo: " + trimText(safe(function () { return report.nextFocus.reason; }, "")),
        "Planner lastNextFile: " + trimText(safe(function () { return report.planner.lastNextFile; }, "")),
        "Bridge approvalStatus: " + trimText(safe(function () { return report.bridge.approvalStatus; }, "")),
        "Patch staged: " + String(!!safe(function () { return report.patchSupervisor.hasStagedPatch; }, false))
      ].join("\n")
    };
  }

  function getHealth() {
    var report = getLastReport() || scan();
    return clone(report.health || {});
  }

  function getNextFocus() {
    var report = getLastReport() || scan();
    return clone(report.nextFocus || {
      targetFile: "",
      reason: ""
    });
  }

  function getRecommendations() {
    var report = getLastReport() || scan();
    return clone(report.recommendations || []);
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      lastScanAt: state.lastScanAt || null,
      hasReport: !!state.lastReport,
      lastScore: safe(function () { return state.lastReport.health.score; }, 0),
      lastGrade: safe(function () { return state.lastReport.health.grade; }, ""),
      lastNextFocus: safe(function () { return state.lastReport.nextFocus.targetFile; }, ""),
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIDiagnostics");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIDiagnostics", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIDiagnostics");
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

  function bindEvents() {
    try {
      global.addEventListener("RCF:UI_READY", function () {
        try { scan(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:FACTORY_PHASE_CHANGED", function () {
        try { scan(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:FACTORY_AI_PLAN_READY", function () {
        try { scan(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_STAGED", function () {
        try { scan(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_APPLIED", function () {
        try { scan(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_APPLY_FAILED", function () {
        try { scan(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    persist();
    syncPresence();
    bindEvents();

    try { scan(); } catch (_) {}

    pushLog("OK", "factory_ai_diagnostics ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_DIAGNOSTICS = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    scan: scan,
    getLastReport: getLastReport,
    explainLastReport: explainLastReport,
    getHealth: getHealth,
    getNextFocus: getNextFocus,
    getRecommendations: getRecommendations,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

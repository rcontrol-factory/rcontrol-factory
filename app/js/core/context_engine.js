/* FILE: /app/js/core/context_engine.js
   RControl Factory — Context Engine
   v1.6.5 SNAPSHOT CONSOLIDATED / FULL CURRENT STACK + SUPERVISOR + RUNTIME CONNECTION

   Objetivo:
   - consolidar snapshot estrutural mais confiável
   - integrar melhor factory_state + module_registry + doctor + factory_tree
   - expor contexto mais útil para Factory AI decidir próximo arquivo
   - incluir bloco de injector/admin sem criar dependência rígida
   - reduzir respostas genéricas da Admin AI / Factory AI
   - separar melhor presença / prontidão / ativação
   - incluir camada supervisionada completa da Factory AI
   - funcionar como script clássico

   PATCH v1.6.5:
   - KEEP: stack atual completa da Factory AI no snapshot
   - KEEP: diagnostics em RCF_FACTORY_AI_DIAGNOSTICS
   - KEEP: memory/phase/autoloop/runtime/orchestrator/proposalUI/selfEvolution/autoheal/evolutionMode/governor/controller
   - ADD: factoryAISupervisor no snapshot/flags/semantics/candidateFiles/summary
   - ADD: runtime connection fields completos vindos do runtime v1.0.5+
   - ADD: actions expõe runtimeReady e lastRuntimeCall
   - FIX: snapshot fica mais alinhado com a trilha real backend/runtime/front
*/

(function (global) {
  "use strict";

  if (global.RCF_CONTEXT && global.RCF_CONTEXT.__v165) return;

  var VERSION = "v1.6.5";

  function safe(fn, fallback) {
    try {
      var v = fn();
      return (v === undefined ? fallback : v);
    } catch (_) {
      return fallback;
    }
  }

  function nowISO() {
    try { return new Date().toISOString(); }
    catch (_) { return ""; }
  }

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniq(arr) {
    var out = [];
    var seen = {};
    asArray(arr).forEach(function (item) {
      var key = String(item || "");
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function pickTruthy(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      if (obj[k]) out[k] = obj[k];
    });
    return out;
  }

  function firstDefined() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  function numberOrNull(v) {
    return (typeof v === "number" && isFinite(v)) ? v : null;
  }

  function safeObj(v) {
    return (v && typeof v === "object") ? v : {};
  }

  function getFactoryState() {
    return safe(function () {
      if (!global.RCF_FACTORY_STATE || typeof global.RCF_FACTORY_STATE.getState !== "function") {
        return {};
      }
      return global.RCF_FACTORY_STATE.getState() || {};
    }, {});
  }

  function getModuleSummary() {
    return safe(function () {
      if (!global.RCF_MODULE_REGISTRY) return {};
      if (typeof global.RCF_MODULE_REGISTRY.summary === "function") {
        return global.RCF_MODULE_REGISTRY.summary() || {};
      }
      return {};
    }, {});
  }

  function getDoctorInfo() {
    var lastFromState = safe(function () {
      return global.RCF_FACTORY_STATE.getState().doctorLastRun;
    }, null);

    var doctorApi =
      global.RCF_DOCTOR_SCAN ||
      global.RCF_DOCTOR ||
      null;

    var lastFromDoctor = safe(function () {
      return doctorApi && (doctorApi.lastReport || doctorApi.lastRun || null);
    }, null);

    return {
      ready: !!doctorApi,
      version: safe(function () { return doctorApi && doctorApi.version; }, "unknown"),
      lastRun: lastFromState || lastFromDoctor || null
    };
  }

  function getTreeInfo() {
    return safe(function () {
      if (!global.RCF_FACTORY_TREE) return {};
      return {
        summary: typeof global.RCF_FACTORY_TREE.summary === "function"
          ? global.RCF_FACTORY_TREE.summary()
          : {},
        tree: typeof global.RCF_FACTORY_TREE.getTree === "function"
          ? global.RCF_FACTORY_TREE.getTree()
          : {},
        allPaths: typeof global.RCF_FACTORY_TREE.getAllPaths === "function"
          ? global.RCF_FACTORY_TREE.getAllPaths()
          : []
      };
    }, {});
  }

  function getLoggerInfo() {
    var items = safe(function () {
      if (!global.RCF_LOGGER) return [];
      if (Array.isArray(global.RCF_LOGGER.items)) return global.RCF_LOGGER.items;
      if (Array.isArray(global.RCF_LOGGER.lines)) return global.RCF_LOGGER.lines;
      if (typeof global.RCF_LOGGER.getAll === "function") return global.RCF_LOGGER.getAll();
      if (typeof global.RCF_LOGGER.dump === "function") {
        var raw = String(global.RCF_LOGGER.dump() || "");
        return raw ? raw.split("\n") : [];
      }
      if (typeof global.RCF_LOGGER.getText === "function") {
        var txt = String(global.RCF_LOGGER.getText() || "");
        return txt ? txt.split("\n") : [];
      }
      return [];
    }, []);

    return {
      ready: !!global.RCF_LOGGER,
      itemsCount: asArray(items).length,
      tail: asArray(items).slice(-20)
    };
  }

  function getGitHubInfo() {
    var rawCfg = safe(function () {
      return global.localStorage.getItem("rcf:ghcfg");
    }, null);

    var cfg = safe(function () {
      return rawCfg ? JSON.parse(rawCfg) : null;
    }, null);

    return {
      ready: !!global.RCF_GH_SYNC,
      version: safe(function () { return global.RCF_GH_SYNC.version; }, "unknown"),
      repo: safe(function () { return (cfg && cfg.repo) || global.RCF_GH_SYNC.repo || ""; }, ""),
      branch: safe(function () { return (cfg && cfg.branch) || global.RCF_GH_SYNC.branch || ""; }, ""),
      cfgRaw: rawCfg || "",
      cfg: cfg
    };
  }

  function getAdminInfo() {
    return {
      ready: !!global.RCF_ADMIN_AI,
      version: safe(function () { return global.RCF_ADMIN_AI.version; }, "unknown"),
      mounted: !!safe(function () { return global.RCF_ADMIN_AI.mount; }, false)
    };
  }

  function getFactoryAIInfo() {
    var api = global.RCF_FACTORY_AI || global.RCF_FACTORY_IA || null;

    return {
      ready: !!api,
      version: safe(function () { return api.version; }, "unknown"),
      mounted: !!safe(function () { return api.mount; }, false),
      lastEndpoint: safe(function () {
        return api && typeof api.getLastEndpoint === "function" ? api.getLastEndpoint() : "";
      }, ""),
      historyCount: safe(function () {
        if (!api || typeof api.getHistory !== "function") return 0;
        return asArray(api.getHistory()).length;
      }, 0)
    };
  }

  function getPlannerInfo() {
    var api = global.RCF_FACTORY_AI_PLANNER || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});
    var lastPlan = safe(function () {
      return api && typeof api.getLastPlan === "function" ? api.getLastPlan() : null;
    }, null);

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      lastGoal: st.lastGoal || "",
      lastPriority: st.lastPriority || "",
      lastNextFile: st.lastNextFile || "",
      hasPlan: !!lastPlan
    };
  }

  function getFactoryAIBridgeInfo() {
    var api = global.RCF_FACTORY_AI_BRIDGE || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});
    var lastPlan = safe(function () {
      return api && typeof api.getLastPlan === "function" ? api.getLastPlan() : null;
    }, null);

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      hasPlan: !!st.hasPlan || !!lastPlan,
      targetFile: st.targetFile || safe(function () { return lastPlan.targetFile; }, "") || "",
      approvalStatus: st.approvalStatus || safe(function () { return lastPlan.approvalStatus; }, "") || "",
      risk: st.risk || safe(function () { return lastPlan.risk; }, "") || "unknown"
    };
  }

  function getFactoryAIActionsInfo() {
    var api = global.RCF_FACTORY_AI_ACTIONS || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      lastAction: safe(function () { return st.lastAction && st.lastAction.name; }, "") || "",
      plannerReady: !!st.plannerReady,
      bridgeReady: !!st.bridgeReady,
      patchSupervisorReady: !!st.patchSupervisorReady,
      runtimeReady: !!st.runtimeReady,
      lastRuntimeCall: clone(st.lastRuntimeCall || null)
    };
  }

  function getPatchSupervisorInfo() {
    var api = global.RCF_PATCH_SUPERVISOR || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      hasStagedPatch: !!st.hasStagedPatch,
      stagedPlanId: st.stagedPlanId || "",
      stagedTargetFile: st.stagedTargetFile || "",
      lastApplyOk: !!st.lastApplyOk
    };
  }

  function getSupervisorInfo() {
    var api = global.RCF_FACTORY_AI_SUPERVISOR || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      busy: !!st.busy,
      lastRun: st.lastRun || null,
      lastAction: st.lastAction || "",
      lastPlanId: st.lastPlanId || "",
      lastTargetFile: st.lastTargetFile || ""
    };
  }

  function getMemoryInfo() {
    var api = global.RCF_FACTORY_AI_MEMORY || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      historyCount: Number(st.historyCount || 0),
      counters: clone(st.counters || {})
    };
  }

  function getPhaseInfo() {
    var api = global.RCF_FACTORY_PHASE_ENGINE || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});
    var ctx = safe(function () {
      return api && typeof api.buildPhaseContext === "function" ? api.buildPhaseContext() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      currentPhaseId: st.currentPhaseId || "",
      activePhaseId: safe(function () { return ctx.activePhase.id; }, "") || "",
      activePhaseTitle: safe(function () { return ctx.activePhase.title; }, "") || "",
      recommendedTargets: clone(safe(function () { return ctx.recommendedTargets; }, []))
    };
  }

  function getAutoLoopInfo() {
    var api = global.RCF_FACTORY_AI_AUTOLOOP || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      enabled: !!st.enabled,
      running: !!st.running,
      lastStatus: st.lastStatus || "",
      lastTargetFile: st.lastTargetFile || ""
    };
  }

  function getRuntimeInfo() {
    var api = global.RCF_FACTORY_AI_RUNTIME || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      busy: !!st.busy,
      lastAction: st.lastAction || "",
      lastPlanId: st.lastPlanId || "",
      lastApprovedPlanId: st.lastApprovedPlanId || "",
      lastEndpoint: st.lastEndpoint || "",
      lastOk: !!st.lastOk,
      connectionStatus: st.connectionStatus || "unknown",
      connectionProvider: st.connectionProvider || "",
      connectionConfigured: !!st.connectionConfigured,
      connectionAttempted: !!st.connectionAttempted,
      connectionModel: st.connectionModel || "",
      connectionUpstreamStatus: Number(st.connectionUpstreamStatus || 0) || 0,
      connectionEndpoint: st.connectionEndpoint || "",
      connectionResponseStatus: st.connectionResponseStatus || "",
      connectionIncomplete: !!st.connectionIncomplete,
      connectionIncompleteReason: st.connectionIncompleteReason || ""
    };
  }

  function getOrchestratorInfo() {
    var api = global.RCF_FACTORY_AI_ORCHESTRATOR || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      contextReady: !!st.contextReady,
      plannerReady: !!st.plannerReady,
      actionsReady: !!st.actionsReady,
      bridgeReady: !!st.bridgeReady,
      patchSupervisorReady: !!st.patchSupervisorReady
    };
  }

  function getProposalUIInfo() {
    var api = global.RCF_FACTORY_AI_PROPOSAL_UI || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      visible: !!st.visible,
      hasPlan: !!st.hasPlan
    };
  }

  function getSelfEvolutionInfo() {
    var api = global.RCF_FACTORY_AI_SELF_EVOLUTION || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      enabled: !!st.enabled,
      running: !!st.running,
      lastStatus: st.lastStatus || "",
      lastTargetFile: st.lastTargetFile || ""
    };
  }

  function getAutoHealInfo() {
    var api = global.RCF_FACTORY_AI_AUTOHEAL || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});
    var proposal = safe(function () {
      return api && typeof api.getLastProposal === "function" ? api.getLastProposal() : null;
    }, null);

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      hasProposal: !!st.hasProposal || !!proposal,
      lastTargetFile: st.lastTargetFile || safe(function () { return proposal.targetFile; }, "") || "",
      lastRisk: st.lastRisk || safe(function () { return proposal.risk; }, "") || "unknown",
      lastBlocked: !!st.lastBlocked || !!safe(function () { return proposal.blocked; }, false)
    };
  }

  function getEvolutionModeInfo() {
    var api = global.RCF_FACTORY_AI_EVOLUTION_MODE || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});
    var mode = safe(function () {
      return api && typeof api.getMode === "function" ? api.getMode() : "";
    }, "");

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      mode: mode || st.mode || "",
      lastChange: st.lastChange || null
    };
  }

  function getGovernorInfo() {
    var api = global.RCF_FACTORY_AI_GOVERNOR || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      status: st.status || "",
      lastDecision: st.lastDecision || "",
      lastProposalId: st.lastProposalId || "",
      lastTargetFile: st.lastTargetFile || ""
    };
  }

  function getControllerInfo() {
    var api = global.RCF_FACTORY_AI_CONTROLLER || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      busy: !!st.busy,
      lastPlanId: st.lastPlanId || ""
    };
  }

  function getDiagnosticsInfo() {
    var api = global.RCF_FACTORY_AI_DIAGNOSTICS || null;
    var st = safe(function () {
      return api && typeof api.status === "function" ? api.status() : {};
    }, {});
    var lastReport = safe(function () {
      return api && typeof api.getLastReport === "function" ? api.getLastReport() : null;
    }, null);

    return {
      ready: !!api,
      version: safe(function () { return api && api.version; }, "unknown"),
      hasReport: !!st.hasReport || !!lastReport,
      lastScore: Number(st.lastScore || 0),
      lastGrade: st.lastGrade || "",
      lastNextFocus: st.lastNextFocus || safe(function () { return lastReport.nextFocus.targetFile; }, "") || ""
    };
  }

  function getInjectorInfo() {
    var injector =
      global.RCF_INJECTOR_SAFE ||
      global.RCF_INJECTOR ||
      global.RCF_INJECTOR_SAFE_UI ||
      null;

    var logItems = safe(function () {
      if (!injector) return [];
      if (Array.isArray(injector.log)) return injector.log.slice(-30);
      if (Array.isArray(injector.logs)) return injector.logs.slice(-30);
      if (typeof injector.getLog === "function") return asArray(injector.getLog()).slice(-30);
      return [];
    }, []);

    var targetMap = safe(function () {
      if (!injector) return {};
      if (typeof injector.getTargetMap === "function") return injector.getTargetMap() || {};
      return injector.targetMap || {};
    }, {});

    var scan = safe(function () {
      if (!injector) return {};
      if (typeof injector.getScanSummary === "function") return injector.getScanSummary() || {};
      return injector.scanSummary || {};
    }, {});

    var preview = safe(function () {
      if (!injector) return {};
      if (typeof injector.getPreview === "function") return injector.getPreview() || {};
      return injector.preview || {};
    }, {});

    var hostSlot = safe(function () {
      return injector.hostSlot || injector.slot || "";
    }, "");

    return {
      ready: !!injector,
      version: safe(function () { return injector.version; }, "unknown"),
      hostSlot: hostSlot || "unknown",
      targetMapKeys: Object.keys(targetMap || {}),
      targetMapCount: Object.keys(targetMap || {}).length,
      scanSummary: clone(scan || {}),
      preview: clone(preview || {}),
      logTail: clone(logItems || [])
    };
  }

  function getFlags() {
    return {
      hasLogger: !!global.RCF_LOGGER,
      hasDoctor: !!global.RCF_DOCTOR_SCAN || !!global.RCF_DOCTOR,
      hasGitHub: !!global.RCF_GH_SYNC,
      hasVault: !!global.RCF_ZIP_VAULT,
      hasBridge: !!global.RCF_AGENT_ZIP_BRIDGE || !!global.RCF_FACTORY_AI_BRIDGE,
      hasAdminAI: !!global.RCF_ADMIN_AI,
      hasFactoryAI: !!global.RCF_FACTORY_AI || !!global.RCF_FACTORY_IA,
      hasFactoryState: !!global.RCF_FACTORY_STATE,
      hasModuleRegistry: !!global.RCF_MODULE_REGISTRY,
      hasContextEngine: true,
      hasFactoryTree: !!global.RCF_FACTORY_TREE,
      hasDiagnostics: !!global.RCF_FACTORY_AI_DIAGNOSTICS,
      hasInjectorSafe: !!global.RCF_INJECTOR_SAFE || !!global.RCF_INJECTOR || !!global.RCF_INJECTOR_SAFE_UI,
      hasPreviewRunner: !!global.RCF_PREVIEW_RUNNER,
      hasBuilder: !!global.RCF_BUILDER,
      hasFactoryAIPlanner: !!global.RCF_FACTORY_AI_PLANNER,
      hasFactoryAIBridge: !!global.RCF_FACTORY_AI_BRIDGE,
      hasFactoryAIActions: !!global.RCF_FACTORY_AI_ACTIONS,
      hasPatchSupervisor: !!global.RCF_PATCH_SUPERVISOR,
      hasFactoryAISupervisor: !!global.RCF_FACTORY_AI_SUPERVISOR,
      hasFactoryAIMemory: !!global.RCF_FACTORY_AI_MEMORY,
      hasFactoryPhaseEngine: !!global.RCF_FACTORY_PHASE_ENGINE,
      hasFactoryAIAutoLoop: !!global.RCF_FACTORY_AI_AUTOLOOP,
      hasFactoryAIRuntime: !!global.RCF_FACTORY_AI_RUNTIME,
      hasFactoryAIOrchestrator: !!global.RCF_FACTORY_AI_ORCHESTRATOR,
      hasFactoryAIProposalUI: !!global.RCF_FACTORY_AI_PROPOSAL_UI,
      hasFactoryAISelfEvolution: !!global.RCF_FACTORY_AI_SELF_EVOLUTION,
      hasFactoryAIAutoHeal: !!global.RCF_FACTORY_AI_AUTOHEAL,
      hasFactoryAIEvolutionMode: !!global.RCF_FACTORY_AI_EVOLUTION_MODE,
      hasFactoryAIGovernor: !!global.RCF_FACTORY_AI_GOVERNOR,
      hasFactoryAIController: !!global.RCF_FACTORY_AI_CONTROLLER
    };
  }

  function getEnvironment() {
    return {
      href: safe(function () { return global.location.href; }, ""),
      userAgent: safe(function () { return global.navigator.userAgent; }, ""),
      platform: safe(function () { return global.navigator.platform; }, ""),
      language: safe(function () { return global.navigator.language; }, ""),
      ts: nowISO()
    };
  }

  function groupPaths(allPaths) {
    var grouped = {
      app: [],
      js: [],
      core: [],
      ui: [],
      admin: [],
      engine: [],
      assets: [],
      functions: [],
      other: []
    };

    asArray(allPaths).forEach(function (p) {
      var path = String(p || "");
      if (!path) return;

      if (path.indexOf("/functions/") === 0 || path.indexOf("functions/") === 0) {
        grouped.functions.push(path);
      } else if (path.indexOf("/app/js/core/") === 0 || path.indexOf("app/js/core/") === 0) {
        grouped.core.push(path);
        grouped.js.push(path);
        grouped.app.push(path);
      } else if (path.indexOf("/app/js/ui/") === 0 || path.indexOf("app/js/ui/") === 0) {
        grouped.ui.push(path);
        grouped.js.push(path);
        grouped.app.push(path);
      } else if (
        path.indexOf("/app/js/admin/") === 0 ||
        path.indexOf("app/js/admin/") === 0 ||
        path.indexOf("/app/js/admin.") === 0 ||
        path.indexOf("app/js/admin.") === 0
      ) {
        grouped.admin.push(path);
        grouped.js.push(path);
        grouped.app.push(path);
      } else if (path.indexOf("/app/js/engine/") === 0 || path.indexOf("app/js/engine/") === 0) {
        grouped.engine.push(path);
        grouped.js.push(path);
        grouped.app.push(path);
      } else if (path.indexOf("/app/js/") === 0 || path.indexOf("app/js/") === 0) {
        grouped.js.push(path);
        grouped.app.push(path);
      } else if (path.indexOf("/app/assets/") === 0 || path.indexOf("app/assets/") === 0) {
        grouped.assets.push(path);
        grouped.app.push(path);
      } else if (path.indexOf("/app/") === 0 || path.indexOf("app/") === 0) {
        grouped.app.push(path);
      } else {
        grouped.other.push(path);
      }
    });

    Object.keys(grouped).forEach(function (k) {
      grouped[k] = grouped[k].slice(0, 40);
    });

    return grouped;
  }

  function buildModuleSemantic(name, info) {
    var presence = !!(info && info.presence);
    var ready = !!(info && info.ready);
    var active = !!(info && info.active);
    var extra = (info && info.extra && typeof info.extra === "object") ? info.extra : {};

    var interpretation = "dado ausente";

    if (presence && ready && active) {
      interpretation = "presente, pronto e ativo";
    } else if (presence && ready && !active) {
      interpretation = "presente e pronto, mas não marcado como ativo no snapshot atual";
    } else if (presence && !ready && active) {
      interpretation = "presente e marcado como ativo, mas sem prontidão clara no snapshot";
    } else if (presence && !ready && !active) {
      interpretation = "presente, mas sem prontidão clara e sem ativação confirmada no snapshot";
    } else if (!presence && ready) {
      interpretation = "possível inconsistência do snapshot: pronto sem presença explícita";
    } else if (!presence && active) {
      interpretation = "possível inconsistência do snapshot: ativo sem presença explícita";
    } else if (!presence && !ready && !active) {
      interpretation = "sem evidência de presença, prontidão ou ativação";
    }

    return {
      name: name,
      presence: presence,
      ready: ready,
      active: active,
      interpretation: interpretation,
      extra: clone(extra || {})
    };
  }

  function buildSemantics(snapshot) {
    var factory = safeObj(snapshot && snapshot.factory);
    var flags = safeObj(factory.flags);
    var modules = safeObj(snapshot && snapshot.modules);
    var logger = safeObj(snapshot && snapshot.logger);
    var doctor = safeObj(snapshot && snapshot.doctor);
    var github = safeObj(snapshot && snapshot.github);
    var admin = safeObj(snapshot && snapshot.admin);
    var factoryAI = safeObj(snapshot && snapshot.factoryAI);
    var planner = safeObj(snapshot && snapshot.factoryAIPlanner);
    var bridge = safeObj(snapshot && snapshot.factoryAIBridge);
    var actions = safeObj(snapshot && snapshot.factoryAIActions);
    var patchSupervisor = safeObj(snapshot && snapshot.patchSupervisor);
    var supervisor = safeObj(snapshot && snapshot.factoryAISupervisor);
    var memory = safeObj(snapshot && snapshot.factoryAIMemory);
    var phase = safeObj(snapshot && snapshot.factoryPhaseEngine);
    var autoloop = safeObj(snapshot && snapshot.factoryAIAutoLoop);
    var runtime = safeObj(snapshot && snapshot.factoryAIRuntime);
    var orchestrator = safeObj(snapshot && snapshot.factoryAIOrchestrator);
    var proposalUI = safeObj(snapshot && snapshot.factoryAIProposalUI);
    var selfEvolution = safeObj(snapshot && snapshot.factoryAISelfEvolution);
    var autoheal = safeObj(snapshot && snapshot.factoryAIAutoHeal);
    var evolutionMode = safeObj(snapshot && snapshot.factoryAIEvolutionMode);
    var governor = safeObj(snapshot && snapshot.factoryAIGovernor);
    var controller = safeObj(snapshot && snapshot.factoryAIController);
    var diagnostics = safeObj(snapshot && snapshot.factoryAIDiagnostics);
    var injector = safeObj(snapshot && snapshot.injector);
    var activeList = asArray(modules.active);
    var moduleMap = safeObj(modules.modules);

    return {
      note: "presence=detectado no ambiente/flags; ready=API disponível no runtime; active=marcado como ativo no status/registry atual. Presence, ready e active não são sinônimos.",
      activeList: clone(activeList),
      modules: {
        logger: buildModuleSemantic("logger", {
          presence: !!flags.hasLogger,
          ready: !!firstDefined(factory.loggerReady, logger.ready),
          active: !!firstDefined(modules.logger, moduleMap.logger),
          extra: { itemsCount: numberOrNull(logger.itemsCount) }
        }),
        doctor: buildModuleSemantic("doctor", {
          presence: !!flags.hasDoctor,
          ready: !!firstDefined(factory.doctorReady, doctor.ready),
          active: !!firstDefined(modules.doctor, moduleMap.doctor),
          extra: { lastRun: doctor.lastRun || null }
        }),
        github: buildModuleSemantic("github", {
          presence: !!flags.hasGitHub,
          ready: !!github.ready,
          active: !!firstDefined(modules.github, moduleMap.github)
        }),
        vault: buildModuleSemantic("vault", {
          presence: !!flags.hasVault,
          ready: !!flags.hasVault,
          active: !!firstDefined(modules.vault, moduleMap.vault)
        }),
        bridge: buildModuleSemantic("bridge", {
          presence: !!flags.hasBridge,
          ready: !!(flags.hasBridge || flags.hasFactoryAIBridge),
          active: !!firstDefined(modules.bridge, moduleMap.bridge)
        }),
        adminAI: buildModuleSemantic("adminAI", {
          presence: !!flags.hasAdminAI,
          ready: !!firstDefined(admin.ready, admin.mounted),
          active: !!firstDefined(modules.adminAI, moduleMap.adminAI)
        }),
        factoryAI: buildModuleSemantic("factoryAI", {
          presence: !!flags.hasFactoryAI,
          ready: !!firstDefined(factoryAI.ready, factoryAI.mounted),
          active: !!firstDefined(modules.factoryAI, moduleMap.factoryAI, true),
          extra: {
            historyCount: numberOrNull(factoryAI.historyCount),
            lastEndpoint: factoryAI.lastEndpoint || ""
          }
        }),
        factoryState: buildModuleSemantic("factoryState", {
          presence: !!flags.hasFactoryState,
          ready: !!flags.hasFactoryState,
          active: !!firstDefined(modules.factoryState, moduleMap.factoryState),
          extra: { bootStatus: factory.bootStatus || "" }
        }),
        moduleRegistry: buildModuleSemantic("moduleRegistry", {
          presence: !!flags.hasModuleRegistry,
          ready: !!flags.hasModuleRegistry,
          active: !!firstDefined(modules.moduleRegistry, moduleMap.moduleRegistry),
          extra: { activeCount: numberOrNull(modules.activeCount) }
        }),
        contextEngine: buildModuleSemantic("contextEngine", {
          presence: !!flags.hasContextEngine,
          ready: true,
          active: true
        }),
        factoryTree: buildModuleSemantic("factoryTree", {
          presence: !!flags.hasFactoryTree,
          ready: !!flags.hasFactoryTree || numberOrNull(snapshot && snapshot.tree && snapshot.tree.pathsCount) !== null,
          active: !!firstDefined(modules.factoryTree, moduleMap.factoryTree),
          extra: { pathsCount: numberOrNull(snapshot && snapshot.tree && snapshot.tree.pathsCount) }
        }),
        diagnostics: buildModuleSemantic("diagnostics", {
          presence: !!flags.hasDiagnostics,
          ready: !!diagnostics.ready,
          active: !!firstDefined(modules.factoryAIDiagnostics, moduleMap.factoryAIDiagnostics, activeList.indexOf("factoryAIDiagnostics") >= 0),
          extra: {
            hasReport: !!diagnostics.hasReport,
            lastScore: numberOrNull(diagnostics.lastScore),
            lastGrade: diagnostics.lastGrade || ""
          }
        }),
        injector: buildModuleSemantic("injector", {
          presence: !!flags.hasInjectorSafe,
          ready: !!injector.ready,
          active: !!firstDefined(moduleMap.injector, injector.ready)
        }),
        factoryAIPlanner: buildModuleSemantic("factoryAIPlanner", {
          presence: !!flags.hasFactoryAIPlanner,
          ready: !!planner.ready,
          active: !!firstDefined(moduleMap.factoryAIPlanner, activeList.indexOf("factoryAIPlanner") >= 0),
          extra: {
            lastGoal: planner.lastGoal || "",
            lastPriority: planner.lastPriority || "",
            lastNextFile: planner.lastNextFile || "",
            hasPlan: !!planner.hasPlan
          }
        }),
        factoryAIBridge: buildModuleSemantic("factoryAIBridge", {
          presence: !!flags.hasFactoryAIBridge,
          ready: !!bridge.ready,
          active: !!firstDefined(moduleMap.factoryAIBridge, activeList.indexOf("factoryAIBridge") >= 0),
          extra: {
            hasPlan: !!bridge.hasPlan,
            targetFile: bridge.targetFile || "",
            approvalStatus: bridge.approvalStatus || ""
          }
        }),
        factoryAIActions: buildModuleSemantic("factoryAIActions", {
          presence: !!flags.hasFactoryAIActions,
          ready: !!actions.ready,
          active: !!firstDefined(moduleMap.factoryAIActions, activeList.indexOf("factoryAIActions") >= 0),
          extra: {
            lastAction: actions.lastAction || "",
            plannerReady: !!actions.plannerReady,
            bridgeReady: !!actions.bridgeReady,
            patchSupervisorReady: !!actions.patchSupervisorReady,
            runtimeReady: !!actions.runtimeReady
          }
        }),
        patchSupervisor: buildModuleSemantic("patchSupervisor", {
          presence: !!flags.hasPatchSupervisor,
          ready: !!patchSupervisor.ready,
          active: !!firstDefined(moduleMap.patchSupervisor, activeList.indexOf("patchSupervisor") >= 0),
          extra: {
            hasStagedPatch: !!patchSupervisor.hasStagedPatch,
            stagedTargetFile: patchSupervisor.stagedTargetFile || "",
            lastApplyOk: !!patchSupervisor.lastApplyOk
          }
        }),
        factoryAISupervisor: buildModuleSemantic("factoryAISupervisor", {
          presence: !!flags.hasFactoryAISupervisor,
          ready: !!supervisor.ready,
          active: !!firstDefined(moduleMap.factoryAISupervisor, activeList.indexOf("factoryAISupervisor") >= 0),
          extra: {
            busy: !!supervisor.busy,
            lastAction: supervisor.lastAction || "",
            lastPlanId: supervisor.lastPlanId || "",
            lastTargetFile: supervisor.lastTargetFile || ""
          }
        }),
        factoryAIMemory: buildModuleSemantic("factoryAIMemory", {
          presence: !!flags.hasFactoryAIMemory,
          ready: !!memory.ready,
          active: !!firstDefined(moduleMap.factoryAIMemory, activeList.indexOf("factoryAIMemory") >= 0),
          extra: {
            historyCount: numberOrNull(memory.historyCount)
          }
        }),
        factoryPhaseEngine: buildModuleSemantic("factoryPhaseEngine", {
          presence: !!flags.hasFactoryPhaseEngine,
          ready: !!phase.ready,
          active: !!firstDefined(moduleMap.factoryPhaseEngine, activeList.indexOf("factoryPhaseEngine") >= 0),
          extra: {
            currentPhaseId: phase.currentPhaseId || "",
            activePhaseId: phase.activePhaseId || ""
          }
        }),
        factoryAIAutoLoop: buildModuleSemantic("factoryAIAutoLoop", {
          presence: !!flags.hasFactoryAIAutoLoop,
          ready: !!autoloop.ready,
          active: !!firstDefined(moduleMap.factoryAIAutoLoop, activeList.indexOf("factoryAIAutoLoop") >= 0),
          extra: {
            enabled: !!autoloop.enabled,
            running: !!autoloop.running,
            lastStatus: autoloop.lastStatus || ""
          }
        }),
        factoryAIRuntime: buildModuleSemantic("factoryAIRuntime", {
          presence: !!flags.hasFactoryAIRuntime,
          ready: !!runtime.ready,
          active: !!firstDefined(moduleMap.factoryAIRuntime, activeList.indexOf("factoryAIRuntime") >= 0),
          extra: {
            busy: !!runtime.busy,
            lastPlanId: runtime.lastPlanId || "",
            lastOk: !!runtime.lastOk,
            connectionStatus: runtime.connectionStatus || "",
            connectionConfigured: !!runtime.connectionConfigured,
            connectionAttempted: !!runtime.connectionAttempted,
            connectionModel: runtime.connectionModel || ""
          }
        }),
        factoryAIOrchestrator: buildModuleSemantic("factoryAIOrchestrator", {
          presence: !!flags.hasFactoryAIOrchestrator,
          ready: !!orchestrator.ready || !!orchestrator.contextReady,
          active: !!firstDefined(moduleMap.factoryAIOrchestrator, activeList.indexOf("factoryAIOrchestrator") >= 0),
          extra: {
            plannerReady: !!orchestrator.plannerReady,
            actionsReady: !!orchestrator.actionsReady
          }
        }),
        factoryAIProposalUI: buildModuleSemantic("factoryAIProposalUI", {
          presence: !!flags.hasFactoryAIProposalUI,
          ready: !!proposalUI.ready,
          active: !!firstDefined(moduleMap.factoryAIProposalUI, activeList.indexOf("factoryAIProposalUI") >= 0),
          extra: {
            visible: !!proposalUI.visible,
            hasPlan: !!proposalUI.hasPlan
          }
        }),
        factoryAISelfEvolution: buildModuleSemantic("factoryAISelfEvolution", {
          presence: !!flags.hasFactoryAISelfEvolution,
          ready: !!selfEvolution.ready,
          active: !!firstDefined(moduleMap.factoryAISelfEvolution, activeList.indexOf("factoryAISelfEvolution") >= 0),
          extra: {
            enabled: !!selfEvolution.enabled,
            running: !!selfEvolution.running,
            lastStatus: selfEvolution.lastStatus || ""
          }
        }),
        factoryAIAutoHeal: buildModuleSemantic("factoryAIAutoHeal", {
          presence: !!flags.hasFactoryAIAutoHeal,
          ready: !!autoheal.ready,
          active: !!firstDefined(moduleMap.factoryAIAutoHeal, activeList.indexOf("factoryAIAutoHeal") >= 0),
          extra: {
            hasProposal: !!autoheal.hasProposal,
            lastTargetFile: autoheal.lastTargetFile || "",
            lastBlocked: !!autoheal.lastBlocked
          }
        }),
        factoryAIEvolutionMode: buildModuleSemantic("factoryAIEvolutionMode", {
          presence: !!flags.hasFactoryAIEvolutionMode,
          ready: !!evolutionMode.ready,
          active: !!firstDefined(moduleMap.factoryAIEvolutionMode, activeList.indexOf("factoryAIEvolutionMode") >= 0),
          extra: {
            mode: evolutionMode.mode || "",
            lastChange: evolutionMode.lastChange || null
          }
        }),
        factoryAIGovernor: buildModuleSemantic("factoryAIGovernor", {
          presence: !!flags.hasFactoryAIGovernor,
          ready: !!governor.ready,
          active: !!firstDefined(moduleMap.factoryAIGovernor, activeList.indexOf("factoryAIGovernor") >= 0),
          extra: {
            status: governor.status || "",
            lastDecision: governor.lastDecision || "",
            lastTargetFile: governor.lastTargetFile || ""
          }
        }),
        factoryAIController: buildModuleSemantic("factoryAIController", {
          presence: !!flags.hasFactoryAIController,
          ready: !!controller.ready,
          active: !!firstDefined(moduleMap.factoryAIController, activeList.indexOf("factoryAIController") >= 0),
          extra: {
            busy: !!controller.busy,
            lastPlanId: controller.lastPlanId || ""
          }
        })
      }
    };
  }

  function buildCandidateFiles(snapshot) {
    var out = [];
    var push = function (v) {
      if (!v) return;
      out.push(String(v));
    };

    var active = asArray(snapshot && snapshot.modules && snapshot.modules.active);
    var planner = safeObj(snapshot && snapshot.factoryAIPlanner);
    var bridge = safeObj(snapshot && snapshot.factoryAIBridge);
    var actions = safeObj(snapshot && snapshot.factoryAIActions);
    var supervisor = safeObj(snapshot && snapshot.factoryAISupervisor);
    var patchSupervisor = safeObj(snapshot && snapshot.patchSupervisor);
    var diagnostics = safeObj(snapshot && snapshot.factoryAIDiagnostics);
    var memory = safeObj(snapshot && snapshot.factoryAIMemory);
    var phase = safeObj(snapshot && snapshot.factoryPhaseEngine);
    var autoLoop = safeObj(snapshot && snapshot.factoryAIAutoLoop);
    var runtime = safeObj(snapshot && snapshot.factoryAIRuntime);
    var orchestrator = safeObj(snapshot && snapshot.factoryAIOrchestrator);
    var selfEvolution = safeObj(snapshot && snapshot.factoryAISelfEvolution);
    var autoheal = safeObj(snapshot && snapshot.factoryAIAutoHeal);
    var governor = safeObj(snapshot && snapshot.factoryAIGovernor);

    push("/app/app.js");
    push("/app/index.html");
    push("/app/js/core/context_engine.js");
    push("/app/js/core/factory_state.js");
    push("/app/js/core/module_registry.js");
    push("/app/js/core/factory_tree.js");
    push("/app/js/core/logger.js");
    push("/app/js/core/doctor_scan.js");
    push("/app/js/core/factory_ai_planner.js");
    push("/app/js/core/factory_ai_bridge.js");
    push("/app/js/core/factory_ai_actions.js");
    push("/app/js/core/factory_ai_supervisor.js");
    push("/app/js/core/patch_supervisor.js");
    push("/app/js/core/factory_ai_diagnostics.js");
    push("/app/js/core/factory_ai_memory.js");
    push("/app/js/core/factory_phase_engine.js");
    push("/app/js/core/factory_ai_autoloop.js");
    push("/app/js/core/factory_ai_runtime.js");
    push("/app/js/core/factory_ai_orchestrator.js");
    push("/app/js/core/factory_ai_proposal_ui.js");
    push("/app/js/core/factory_ai_self_evolution.js");
    push("/app/js/core/factory_ai_autoheal.js");
    push("/app/js/core/factory_ai_evolution_mode.js");
    push("/app/js/core/factory_ai_governor.js");
    push("/app/js/core/factory_ai_controller.js");
    push("/app/js/admin.admin_ai.js");
    push("/functions/api/admin-ai.js");

    if (planner.lastNextFile) push(planner.lastNextFile);
    if (bridge.targetFile) push(bridge.targetFile);
    if (supervisor.lastTargetFile) push(supervisor.lastTargetFile);
    if (patchSupervisor.stagedTargetFile) push(patchSupervisor.stagedTargetFile);
    if (diagnostics.lastNextFocus) push(diagnostics.lastNextFocus);
    if (autoLoop.lastTargetFile) push(autoLoop.lastTargetFile);
    if (selfEvolution.lastTargetFile) push(selfEvolution.lastTargetFile);
    if (autoheal.lastTargetFile) push(autoheal.lastTargetFile);
    if (governor.lastTargetFile) push(governor.lastTargetFile);

    if (active.indexOf("factoryState") >= 0 || active.indexOf("factory_state") >= 0) push("/app/js/core/factory_state.js");
    if (active.indexOf("moduleRegistry") >= 0 || active.indexOf("module_registry") >= 0) push("/app/js/core/module_registry.js");
    if (active.indexOf("factoryTree") >= 0 || active.indexOf("factory_tree") >= 0) push("/app/js/core/factory_tree.js");
    if (active.indexOf("github") >= 0) {
      push("/app/js/core/github_sync.js");
      push("/app/js/admin.github.js");
    }
    if (active.indexOf("doctor") >= 0 || snapshot.doctor.ready) {
      push("/app/js/core/doctor_scan.js");
      push("/app/js/core/diagnostics.js");
    }
    if (active.indexOf("logger") >= 0 || snapshot.logger.ready) push("/app/js/core/logger.js");
    if (active.indexOf("factoryAIPlanner") >= 0 || planner.ready) push("/app/js/core/factory_ai_planner.js");
    if (active.indexOf("factoryAIBridge") >= 0 || bridge.ready) push("/app/js/core/factory_ai_bridge.js");
    if (active.indexOf("factoryAIActions") >= 0 || actions.ready) push("/app/js/core/factory_ai_actions.js");
    if (active.indexOf("factoryAISupervisor") >= 0 || supervisor.ready) push("/app/js/core/factory_ai_supervisor.js");
    if (active.indexOf("patchSupervisor") >= 0 || patchSupervisor.ready) push("/app/js/core/patch_supervisor.js");
    if (active.indexOf("factoryAIDiagnostics") >= 0 || diagnostics.ready) push("/app/js/core/factory_ai_diagnostics.js");
    if (active.indexOf("factoryAIMemory") >= 0 || memory.ready) push("/app/js/core/factory_ai_memory.js");
    if (active.indexOf("factoryPhaseEngine") >= 0 || phase.ready) push("/app/js/core/factory_phase_engine.js");
    if (active.indexOf("factoryAIAutoLoop") >= 0 || autoLoop.ready) push("/app/js/core/factory_ai_autoloop.js");
    if (active.indexOf("factoryAIRuntime") >= 0 || runtime.ready) push("/app/js/core/factory_ai_runtime.js");
    if (active.indexOf("factoryAIOrchestrator") >= 0 || orchestrator.ready) push("/app/js/core/factory_ai_orchestrator.js");
    if (active.indexOf("factoryAISelfEvolution") >= 0 || selfEvolution.ready) push("/app/js/core/factory_ai_self_evolution.js");
    if (active.indexOf("factoryAIAutoHeal") >= 0 || autoheal.ready) push("/app/js/core/factory_ai_autoheal.js");
    if (active.indexOf("factoryAIGovernor") >= 0 || governor.ready) push("/app/js/core/factory_ai_governor.js");

    var grouped = safe(function () {
      return snapshot.tree.pathGroups;
    }, {}) || {};

    asArray(grouped.core).slice(0, 12).forEach(push);
    asArray(grouped.ui).slice(0, 10).forEach(push);
    asArray(grouped.admin).slice(0, 8).forEach(push);
    asArray(grouped.engine).slice(0, 8).forEach(push);
    asArray(grouped.functions).slice(0, 6).forEach(push);

    return uniq(out).slice(0, 60);
  }

  function buildFactoryBlock() {
    var fs = getFactoryState();
    var env = getEnvironment();
    var flags = getFlags();
    var mods = getModuleSummary();
    var appState = safe(function () { return global.RCF && global.RCF.state; }, {}) || {};

    var activeModules = asArray(mods.active);
    var bootStatus = fs.bootStatus || "unknown";

    if (bootStatus === "booting" && activeModules.length > 0) {
      bootStatus = "ready";
    }

    return {
      version: fs.factoryVersion || safe(function () { return global.RCF_VERSION; }, null) || "1.0.0",
      engineVersion: fs.engineVersion || safe(function () { return global.RCF_ENGINE_VERSION; }, null) || "unknown",
      bootStatus: bootStatus,
      bootTime: fs.bootTime || null,
      lastUpdate: fs.lastUpdate || null,
      runtimeVFS:
        fs.runtimeVFS ||
        safe(function () { return global.__RCF_VFS_RUNTIME; }, null) ||
        safe(function () { return global.RCF_RUNTIME; }, null) ||
        "browser",
      environment: fs.environment || "Browser",
      userAgent: fs.userAgent || env.userAgent || "",
      loggerReady: !!fs.loggerReady || !!mods.logger,
      doctorReady: !!fs.doctorReady || !!mods.doctor,
      modules: clone(fs.modules || {}),
      activeView:
        fs.activeView ||
        safe(function () { return fs.active.view; }, "") ||
        safe(function () { return appState.active.view; }, "") ||
        "",
      activeAppSlug:
        fs.activeAppSlug ||
        safe(function () { return fs.active.appSlug; }, "") ||
        safe(function () { return appState.active.appSlug; }, "") ||
        "",
      ts: env.ts,
      flags: flags
    };
  }

  function buildSnapshot() {
    var factory = buildFactoryBlock();
    var doctor = getDoctorInfo();
    var modules = getModuleSummary();
    var environment = getEnvironment();
    var tree = getTreeInfo();
    var logger = getLoggerInfo();
    var github = getGitHubInfo();
    var admin = getAdminInfo();
    var factoryAI = getFactoryAIInfo();
    var planner = getPlannerInfo();
    var bridge = getFactoryAIBridgeInfo();
    var actions = getFactoryAIActionsInfo();
    var supervisor = getSupervisorInfo();
    var patchSupervisor = getPatchSupervisorInfo();
    var diagnostics = getDiagnosticsInfo();
    var memory = getMemoryInfo();
    var phase = getPhaseInfo();
    var autoLoop = getAutoLoopInfo();
    var runtime = getRuntimeInfo();
    var orchestrator = getOrchestratorInfo();
    var proposalUI = getProposalUIInfo();
    var selfEvolution = getSelfEvolutionInfo();
    var autoheal = getAutoHealInfo();
    var evolutionMode = getEvolutionModeInfo();
    var governor = getGovernorInfo();
    var controller = getControllerInfo();
    var injector = getInjectorInfo();

    var snapshot = {
      version: VERSION,
      factory: factory,
      doctor: {
        ready: doctor.ready,
        version: doctor.version || "unknown",
        lastRun: doctor.lastRun || null
      },
      modules: {
        version: modules.version || "unknown",
        total: Number(modules.total || 0),
        activeCount: Number(modules.activeCount || 0),
        inactiveCount: Number(modules.inactiveCount || 0),
        active: Array.isArray(modules.active) ? clone(modules.active) : [],
        logger: !!modules.logger,
        doctor: !!modules.doctor,
        github: !!modules.github,
        vault: !!modules.vault,
        bridge: !!modules.bridge,
        adminAI: !!modules.adminAI,
        factoryAI: !!global.RCF_FACTORY_AI || !!global.RCF_FACTORY_IA,
        factoryState: !!modules.factoryState,
        moduleRegistry: !!modules.moduleRegistry,
        contextEngine: true,
        factoryTree: !!modules.factoryTree,
        diagnostics: !!safe(function () { return modules.modules.factoryAIDiagnostics; }, false),
        factoryAIPlanner: !!safe(function () { return modules.modules.factoryAIPlanner; }, false),
        factoryAIBridge: !!safe(function () { return modules.modules.factoryAIBridge; }, false),
        factoryAIActions: !!safe(function () { return modules.modules.factoryAIActions; }, false),
        factoryAISupervisor: !!safe(function () { return modules.modules.factoryAISupervisor; }, false),
        patchSupervisor: !!safe(function () { return modules.modules.patchSupervisor; }, false),
        factoryAIMemory: !!safe(function () { return modules.modules.factoryAIMemory; }, false),
        factoryPhaseEngine: !!safe(function () { return modules.modules.factoryPhaseEngine; }, false),
        factoryAIAutoLoop: !!safe(function () { return modules.modules.factoryAIAutoLoop; }, false),
        factoryAIRuntime: !!safe(function () { return modules.modules.factoryAIRuntime; }, false),
        factoryAIOrchestrator: !!safe(function () { return modules.modules.factoryAIOrchestrator; }, false),
        factoryAIProposalUI: !!safe(function () { return modules.modules.factoryAIProposalUI; }, false),
        factoryAISelfEvolution: !!safe(function () { return modules.modules.factoryAISelfEvolution; }, false),
        factoryAIAutoHeal: !!safe(function () { return modules.modules.factoryAIAutoHeal; }, false),
        factoryAIEvolutionMode: !!safe(function () { return modules.modules.factoryAIEvolutionMode; }, false),
        factoryAIGovernor: !!safe(function () { return modules.modules.factoryAIGovernor; }, false),
        factoryAIController: !!safe(function () { return modules.modules.factoryAIController; }, false),
        modules: clone(modules.modules || {})
      },
      tree: {
        summary: clone(tree.summary || {}),
        pathsCount: Array.isArray(tree.allPaths) ? tree.allPaths.length : 0,
        samples: Array.isArray(tree.allPaths) ? tree.allPaths.slice(0, 30) : [],
        pathGroups: groupPaths(asArray(tree.allPaths)),
        grouped: clone(tree.tree || {})
      },
      logger: logger,
      github: github,
      admin: admin,
      factoryAI: factoryAI,
      factoryAIPlanner: planner,
      factoryAIBridge: bridge,
      factoryAIActions: actions,
      factoryAISupervisor: supervisor,
      patchSupervisor: patchSupervisor,
      factoryAIDiagnostics: diagnostics,
      factoryAIMemory: memory,
      factoryPhaseEngine: phase,
      factoryAIAutoLoop: autoLoop,
      factoryAIRuntime: runtime,
      factoryAIOrchestrator: orchestrator,
      factoryAIProposalUI: proposalUI,
      factoryAISelfEvolution: selfEvolution,
      factoryAIAutoHeal: autoheal,
      factoryAIEvolutionMode: evolutionMode,
      factoryAIGovernor: governor,
      factoryAIController: controller,
      injector: injector,
      environment: environment
    };

    snapshot.flagsTruthy = pickTruthy(snapshot.factory.flags || {});
    snapshot.semantics = buildSemantics(snapshot);
    snapshot.candidateFiles = buildCandidateFiles(snapshot);

    return snapshot;
  }

  function getSnapshot() {
    return buildSnapshot();
  }

  function getContext() {
    return buildSnapshot();
  }

  function summary() {
    var ctx = buildSnapshot();

    return {
      version: VERSION,
      factoryVersion: ctx.factory.version,
      engineVersion: ctx.factory.engineVersion,
      bootStatus: ctx.factory.bootStatus,
      runtimeVFS: ctx.factory.runtimeVFS,
      doctorVersion: ctx.doctor.version,
      doctorLast: ctx.doctor.lastRun,
      activeModules: clone(ctx.modules.active || []),
      treeCount: ctx.tree.pathsCount || 0,
      candidateFiles: clone(ctx.candidateFiles || []).slice(0, 18),
      injectorReady: !!safe(function () { return ctx.injector.ready; }, false),
      injectorTargetMapCount: Number(safe(function () { return ctx.injector.targetMapCount; }, 0) || 0),
      loggerReady: !!safe(function () { return ctx.logger.ready; }, false),
      loggerItemsCount: Number(safe(function () { return ctx.logger.itemsCount; }, 0) || 0),
      githubReady: !!safe(function () { return ctx.github.ready; }, false),
      factoryAIReady: !!safe(function () { return ctx.factoryAI.ready; }, false),
      factoryAIHistoryCount: Number(safe(function () { return ctx.factoryAI.historyCount; }, 0) || 0),
      plannerReady: !!safe(function () { return ctx.factoryAIPlanner.ready; }, false),
      plannerLastNextFile: safe(function () { return ctx.factoryAIPlanner.lastNextFile; }, "") || "",
      bridgeReady: !!safe(function () { return ctx.factoryAIBridge.ready; }, false),
      bridgeTargetFile: safe(function () { return ctx.factoryAIBridge.targetFile; }, "") || "",
      actionsReady: !!safe(function () { return ctx.factoryAIActions.ready; }, false),
      supervisorReady: !!safe(function () { return ctx.factoryAISupervisor.ready; }, false),
      patchSupervisorReady: !!safe(function () { return ctx.patchSupervisor.ready; }, false),
      stagedTargetFile: safe(function () { return ctx.patchSupervisor.stagedTargetFile; }, "") || "",
      diagnosticsReady: !!safe(function () { return ctx.factoryAIDiagnostics.ready; }, false),
      diagnosticsLastNextFocus: safe(function () { return ctx.factoryAIDiagnostics.lastNextFocus; }, "") || "",
      memoryReady: !!safe(function () { return ctx.factoryAIMemory.ready; }, false),
      phaseReady: !!safe(function () { return ctx.factoryPhaseEngine.ready; }, false),
      autoLoopReady: !!safe(function () { return ctx.factoryAIAutoLoop.ready; }, false),
      runtimeReady: !!safe(function () { return ctx.factoryAIRuntime.ready; }, false),
      runtimeLastOk: !!safe(function () { return ctx.factoryAIRuntime.lastOk; }, false),
      runtimeConnectionStatus: safe(function () { return ctx.factoryAIRuntime.connectionStatus; }, "") || "",
      runtimeConnectionConfigured: !!safe(function () { return ctx.factoryAIRuntime.connectionConfigured; }, false),
      runtimeConnectionAttempted: !!safe(function () { return ctx.factoryAIRuntime.connectionAttempted; }, false),
      runtimeConnectionModel: safe(function () { return ctx.factoryAIRuntime.connectionModel; }, "") || "",
      orchestratorReady: !!safe(function () { return ctx.factoryAIOrchestrator.ready; }, false),
      selfEvolutionReady: !!safe(function () { return ctx.factoryAISelfEvolution.ready; }, false),
      autohealReady: !!safe(function () { return ctx.factoryAIAutoHeal.ready; }, false),
      evolutionModeReady: !!safe(function () { return ctx.factoryAIEvolutionMode.ready; }, false),
      governorReady: !!safe(function () { return ctx.factoryAIGovernor.ready; }, false),
      flags: ctx.factory.flags,
      ts: ctx.environment.ts
    };
  }

  global.RCF_CONTEXT = {
    __v1: true,
    __v11: true,
    __v12: true,
    __v13: true,
    __v14: true,
    __v15: true,
    __v16: true,
    __v161: true,
    __v162: true,
    __v163: true,
    __v164: true,
    __v165: true,
    version: VERSION,
    getContext: getContext,
    getSnapshot: getSnapshot,
    summary: summary
  };

  try {
    console.log("[RCF] context_engine ready", VERSION);
  } catch (_) {}

})(window);

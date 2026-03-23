/* FILE: /app/js/core/factory_ai_planner.js
   RControl Factory — Factory AI Planner
   v1.0.7 SUPERVISED EVOLUTION PLANNER + LATE PRESENCE RE-SYNC

   Objetivo:
   - transformar snapshot/contexto em plano operacional supervisionado
   - impedir ciclo repetitivo de respostas genéricas (doctor/state/registry/tree)
   - priorizar próximo arquivo estratégico com base na fase atual da Factory
   - integrar Context Engine + Factory AI Bridge + Factory AI Actions
   - preparar sequência: analisar -> priorizar -> planejar -> aprovar -> stage -> apply
   - NÃO aplicar patch automaticamente
   - funcionar como script clássico

   PATCH v1.0.7:
   - KEEP: leitura de runtime status real para saber se OpenAI já está conectada
   - KEEP: anti self-loop do planner
   - KEEP: buildPlan/status sem reescrever fluxo
   - FIX: presença do planner agora re-sincroniza quando factoryState/moduleRegistry sobem depois
   - FIX: planner volta a se registrar em DOMContentLoaded / RCF:UI_READY / pageshow
   - ADD: status() expõe presenceSyncedAt para diagnóstico
   - mantém estrutura anterior com patch mínimo
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_PLANNER && global.RCF_FACTORY_AI_PLANNER.__v106) return;

  var VERSION = "v1.0.8";
  var STORAGE_KEY = "rcf:factory_ai_planner";
  var MAX_HISTORY = 80;
  var PRESENCE_RETRY_DELAY_MS = 900;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastPlan: null,
    lastPriority: null,
    lastGoal: "",
    history: [],
    presenceSyncedAt: null,
    presenceSyncAttempts: 0,
    presenceRetryTimer: null,
    visibilityHooksBound: false
  };

  var STRATEGIC_FILES = {
    planner: "/app/js/core/factory_ai_planner.js",
    bridge: "/app/js/core/factory_ai_bridge.js",
    actions: "/app/js/core/factory_ai_actions.js",
    runtime: "/app/js/core/factory_ai_runtime.js",
    patchSupervisor: "/app/js/core/patch_supervisor.js",
    backend: "/functions/api/admin-ai.js",
    factoryAI: "/app/js/admin.admin_ai.js",
    context: "/app/js/core/context_engine.js",
    state: "/app/js/core/factory_state.js",
    registry: "/app/js/core/module_registry.js",
    tree: "/app/js/core/factory_tree.js",
    doctor: "/app/js/core/doctor_scan.js",
    diagnostics: "/app/js/core/factory_ai_diagnostics.js",
    autoheal: "/app/js/core/factory_ai_autoheal.js",
    proposalUI: "/app/js/core/factory_ai_proposal_ui.js",
    autoLoop: "/app/js/core/factory_ai_autoloop.js",
    selfEvolution: "/app/js/core/factory_ai_self_evolution.js",
    evolutionMode: "/app/js/core/factory_ai_evolution_mode.js",
    executionGate: "/app/js/core/factory_ai_execution_gate.js",
    focusEngine: "/app/js/core/factory_ai_focus_engine.js",
    app: "/app/app.js"
  };

  function nowISO() {
    try { return new Date().toISOString(); }
    catch (_) { return ""; }
  }

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }


  function normalizePlannerSnapshot(snapshot) {
    try {
      var out = clone(snapshot || {});
      if (!out.lastGoal) out.lastGoal = "stabilize_factory_ai";
      if (!out.lastPriority) out.lastPriority = "openai_runtime";
      if (!out.lastNextFile) out.lastNextFile = "/app/js/core/factory_ai_planner.js";
      return out;
    } catch (_) {
      return snapshot || {};
    }
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

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;
      state = merge(clone(state), parsed);
      if (!Array.isArray(state.history)) state.history = [];
      if (state.history.length > MAX_HISTORY) {
        state.history = state.history.slice(-MAX_HISTORY);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_PLANNER] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_PLANNER] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_PLANNER]", level, msg, extra || ""); } catch (_) {}
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

  function getContextSnapshot() {
    return safe(function () {
      if (global.RCF_CONTEXT?.getSnapshot) return global.RCF_CONTEXT.getSnapshot();
      if (global.RCF_CONTEXT?.getContext) return global.RCF_CONTEXT.getContext();
      return {};
    }, {});
  }

  function getFactoryState() {
    return safe(function () {
      if (global.RCF_FACTORY_STATE?.getState) return global.RCF_FACTORY_STATE.getState();
      if (global.RCF_FACTORY_STATE?.status) return global.RCF_FACTORY_STATE.status();
      return {};
    }, {});
  }

  function getModuleSummary() {
    return safe(function () {
      if (global.RCF_MODULE_REGISTRY?.summary) return global.RCF_MODULE_REGISTRY.summary();
      return {};
    }, {});
  }

  function getTreeSummary() {
    return safe(function () {
      if (global.RCF_FACTORY_TREE?.summary) return global.RCF_FACTORY_TREE.summary();
      return {};
    }, {});
  }

  function getBridgeStatus() {
    return safe(function () {
      if (!global.RCF_FACTORY_AI_BRIDGE) return {};
      if (global.RCF_FACTORY_AI_BRIDGE.status) return global.RCF_FACTORY_AI_BRIDGE.status();
      return {};
    }, {});
  }

  function getActionsStatus() {
    return safe(function () {
      if (!global.RCF_FACTORY_AI_ACTIONS) return {};
      if (global.RCF_FACTORY_AI_ACTIONS.status) return global.RCF_FACTORY_AI_ACTIONS.status();
      return {};
    }, {});
  }

  function getPatchSupervisorStatus() {
    return safe(function () {
      if (!global.RCF_PATCH_SUPERVISOR) return {};
      if (global.RCF_PATCH_SUPERVISOR.status) return global.RCF_PATCH_SUPERVISOR.status();
      return {};
    }, {});
  }

  function getRuntimeStatus() {
    return safe(function () {
      if (!global.RCF_FACTORY_AI_RUNTIME) {
        return {
          available: false,
          ready: false,
          lastEndpoint: "",
          lastOk: false,
          connectionStatus: "unknown",
          connectionProvider: "",
          connectionConfigured: false,
          connectionAttempted: false,
          connectionModel: "",
          connectionUpstreamStatus: 0,
          connectionEndpoint: "",
          connectionResponseStatus: "",
          connectionIncomplete: false,
          connectionIncompleteReason: ""
        };
      }

      var st = typeof global.RCF_FACTORY_AI_RUNTIME.status === "function"
        ? (global.RCF_FACTORY_AI_RUNTIME.status() || {})
        : {};

      return {
        available: true,
        ready: !!st.ready,
        lastEndpoint: trimText(st.lastEndpoint || ""),
        lastOk: !!st.lastOk,
        connectionStatus: trimText(st.connectionStatus || "unknown"),
        connectionProvider: trimText(st.connectionProvider || ""),
        connectionConfigured: !!st.connectionConfigured,
        connectionAttempted: !!st.connectionAttempted,
        connectionModel: trimText(st.connectionModel || ""),
        connectionUpstreamStatus: Number(st.connectionUpstreamStatus || 0) || 0,
        connectionEndpoint: trimText(st.connectionEndpoint || ""),
        connectionResponseStatus: trimText(st.connectionResponseStatus || ""),
        connectionIncomplete: !!st.connectionIncomplete,
        connectionIncompleteReason: trimText(st.connectionIncompleteReason || "")
      };
    }, {
      available: false,
      ready: false,
      lastEndpoint: "",
      lastOk: false,
      connectionStatus: "unknown",
      connectionProvider: "",
      connectionConfigured: false,
      connectionAttempted: false,
      connectionModel: "",
      connectionUpstreamStatus: 0,
      connectionEndpoint: "",
      connectionResponseStatus: "",
      connectionIncomplete: false,
      connectionIncompleteReason: ""
    });
  }

  function getDoctorState() {
    return safe(function () {
      if (global.RCF_DOCTOR_SCAN) {
        return {
          ready: true,
          version: global.RCF_DOCTOR_SCAN.version || "unknown",
          lastRun: global.RCF_DOCTOR_SCAN.lastRun || null
        };
      }
      return {
        ready: !!global.RCF_DOCTOR,
        version: safe(function () { return global.RCF_DOCTOR.version; }, "unknown"),
        lastRun: safe(function () { return global.RCF_DOCTOR.lastRun; }, null)
      };
    }, {});
  }

  function getPhaseContext() {
    return safe(function () {
      if (global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext) {
        return global.RCF_FACTORY_PHASE_ENGINE.buildPhaseContext();
      }
      return {};
    }, {});
  }

  function getMemoryContext() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_MEMORY?.buildMemoryContext) {
        return global.RCF_FACTORY_AI_MEMORY.buildMemoryContext(20);
      }
      return {
        ok: false,
        items: [],
        avoidFiles: [],
        phase: null
      };
    }, {
      ok: false,
      items: [],
      avoidFiles: [],
      phase: null
    });
  }

  function getDiagnosticsReport() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_DIAGNOSTICS?.getLastReport) {
        var last = global.RCF_FACTORY_AI_DIAGNOSTICS.getLastReport();
        if (last) return last;
      }
      return {};
    }, {});
  }

  function hasFile(list, file) {
    return asArray(list).indexOf(String(file || "")) >= 0;
  }

  function collectKnownFiles(snapshot, tree) {
    var out = [];
    var candidateFiles = safe(function () { return snapshot.candidateFiles; }, []);
    var groups = safe(function () { return snapshot.tree.pathGroups; }, {});
    var samples = safe(function () { return snapshot.tree.samples; }, []);

    out = out
      .concat(asArray(candidateFiles))
      .concat(asArray(samples))
      .concat(asArray(groups.core))
      .concat(asArray(groups.ui))
      .concat(asArray(groups.admin))
      .concat(asArray(groups.engine))
      .concat(asArray(groups.functions));

    return uniq(out.map(normalizePath).filter(Boolean));
  }

  function runtimeConnected(runtimeStatus) {
    return !!(
      runtimeStatus &&
      runtimeStatus.available &&
      runtimeStatus.ready &&
      runtimeStatus.lastOk &&
      lower(runtimeStatus.connectionStatus) === "connected"
    );
  }

  function detectGoal(input, phaseCtx, diagnostics, runtimeStatus) {
    var rawGoal = trimText(
      safe(function () { return input.goal; }, "") ||
      safe(function () { return input.prompt; }, "") ||
      safe(function () { return input.userGoal; }, "") ||
      safe(function () { return input.reason; }, "")
    );

    var text = lower(rawGoal);
    var phaseId = lower(safe(function () { return phaseCtx.activePhase.id; }, "") || safe(function () { return phaseCtx.activePhaseId; }, ""));
    var diagFocus = lower(safe(function () { return diagnostics.nextFocus.targetFile; }, ""));
    var isRuntimeConnected = runtimeConnected(runtimeStatus);

    if (!text) {
      if (phaseId.indexOf("autoloop") >= 0) {
        return {
          id: "evolve-factory-ai",
          label: "Evoluir a Factory AI com supervisão",
          sourceText: rawGoal
        };
      }
      return {
        id: "evolve-factory-ai",
        label: "Evoluir a Factory AI com supervisão",
        sourceText: rawGoal
      };
    }

    if (
      text.indexOf("openai") >= 0 ||
      text.indexOf("conexão") >= 0 ||
      text.indexOf("conexao") >= 0 ||
      text.indexOf("endpoint") >= 0 ||
      text.indexOf("backend") >= 0 ||
      text.indexOf("runtime") >= 0 ||
      text.indexOf("api key") >= 0
    ) {
      if (isRuntimeConnected) {
        return {
          id: "evolve-factory-ai",
          label: "Evoluir a Factory AI com supervisão",
          sourceText: rawGoal
        };
      }
      return {
        id: "openai-connectivity",
        label: "Conectividade OpenAI / runtime",
        sourceText: rawGoal
      };
    }

    if (
      text.indexOf("autonomia") >= 0 ||
      text.indexOf("autônoma") >= 0 ||
      text.indexOf("autonoma") >= 0 ||
      text.indexOf("inteligente") >= 0 ||
      text.indexOf("esperta") >= 0 ||
      text.indexOf("evoluir a factory ai") >= 0 ||
      text.indexOf("factory ai") >= 0 ||
      text.indexOf("próximo arquivo") >= 0 ||
      text.indexOf("proximo arquivo") >= 0 ||
      text.indexOf("próxima etapa") >= 0 ||
      text.indexOf("proxima etapa") >= 0 ||
      text.indexOf("planejar") >= 0 ||
      text.indexOf("montar plano") >= 0 ||
      text.indexOf("gerar plano") >= 0
    ) {
      return {
        id: "evolve-factory-ai",
        label: "Evoluir a Factory AI com supervisão",
        sourceText: rawGoal
      };
    }

    if (
      text.indexOf("patch") >= 0 ||
      text.indexOf("aprovar") >= 0 ||
      text.indexOf("aplicar") >= 0
    ) {
      return {
        id: "supervised-patch-flow",
        label: "Fluxo supervisionado de patch",
        sourceText: rawGoal
      };
    }

    if (
      text.indexOf("diagnóstico") >= 0 ||
      text.indexOf("diagnostico") >= 0 ||
      text.indexOf("doctor") >= 0
    ) {
      return {
        id: "diagnostics",
        label: "Diagnóstico operacional",
        sourceText: rawGoal
      };
    }

    if (diagFocus) {
      return {
        id: "evolve-factory-ai",
        label: "Evoluir a Factory AI com supervisão",
        sourceText: rawGoal
      };
    }

    return {
      id: "general-supervision",
      label: "Supervisão técnica geral",
      sourceText: rawGoal
    });
  }

  function getAvoidMap(memoryCtx) {
    var map = {};
    asArray(memoryCtx && memoryCtx.avoidFiles).forEach(function (item) {
      var file = normalizePath(item && item.file || "");
      if (!file) return;
      map[file] = trimText(item && item.reason || "arquivo em cooldown");
    });
    return map;
  }

  function fileMatchesRecommendedPhase(file, phaseCtx) {
    var recommended = asArray(safe(function () { return phaseCtx.recommendedTargets; }, []))
      .map(normalizePath);
    return recommended.indexOf(normalizePath(file)) >= 0;
  }

  function wasRecentlyPicked(file) {
    var target = normalizePath(file);
    var lastPlanFile = normalizePath(
      safe(function () { return state.lastPlan.targetFile; }, "") ||
      safe(function () { return state.lastPlan.nextFile; }, "")
    );

    if (target && lastPlanFile && target === lastPlanFile) return true;

    var recent = asArray(state.history).slice(-4);
    for (var i = 0; i < recent.length; i++) {
      var item = recent[i] || {};
      var nextFile = normalizePath(item.nextFile || "");
      if (nextFile && nextFile === target) return true;
    }

    return false;
  }

  function scoreCandidate(file, ctx) {
    var score = 0;
    var reasons = [];
    var f = String(file || "");
    var goalId = safe(function () { return ctx.goal.id; }, "");
    var knownFiles = safe(function () { return ctx.knownFiles; }, []);
    var doctor = safe(function () { return ctx.doctor; }, {});
    var bridge = safe(function () { return ctx.bridge; }, {});
    var actions = safe(function () { return ctx.actions; }, {});
    var patchSupervisor = safe(function () { return ctx.patchSupervisor; }, {});
    var runtime = safe(function () { return ctx.runtimeStatus; }, {});
    var activeModules = asArray(safe(function () { return ctx.moduleSummary.active; }, []));
    var pathsCount = Number(safe(function () { return ctx.snapshot.tree.pathsCount; }, 0) || 0);
    var phaseCtx = safe(function () { return ctx.phaseCtx; }, {});
    var diagnostics = safe(function () { return ctx.diagnostics; }, {});
    var memoryCtx = safe(function () { return ctx.memoryCtx; }, {});
    var avoidMap = getAvoidMap(memoryCtx);
    var diagNextFocus = normalizePath(safe(function () { return diagnostics.nextFocus.targetFile; }, ""));
    var diagScore = Number(safe(function () { return diagnostics.health.score; }, 0) || 0);
    var isRuntimeConnected = runtimeConnected(runtime);
    var recentlyPicked = wasRecentlyPicked(f);

    if (avoidMap[f]) {
      score -= 120;
      reasons.push("arquivo em cooldown pela memória: " + avoidMap[f]);
    }

    if (diagNextFocus && diagNextFocus === normalizePath(f)) {
      score += 110;
      reasons.push("diagnostics já consolidou esse alvo como nextFocus");
    }

    if (fileMatchesRecommendedPhase(f, phaseCtx)) {
      score += 55;
      reasons.push("arquivo recomendado explicitamente pela fase ativa");
    }

    if (goalId === "openai-connectivity") {
      if (f === STRATEGIC_FILES.backend) {
        score += 120;
        reasons.push("backend real da conexão com OpenAI");
      }
      if (f === STRATEGIC_FILES.runtime) {
        score += 98;
        reasons.push("runtime expõe status real da conexão");
      }
      if (f === STRATEGIC_FILES.factoryAI) {
        score += 72;
        reasons.push("front precisa refletir status/runtime");
      }
      if (f === STRATEGIC_FILES.planner) {
        score -= 26;
        reasons.push("planner não é o primeiro gargalo da conectividade");
      }

      if (isRuntimeConnected) {
        if (f === STRATEGIC_FILES.backend || f === STRATEGIC_FILES.runtime || f === STRATEGIC_FILES.factoryAI) {
          score -= 140;
          reasons.push("trilha OpenAI já conectada; não vale repetir alvo resolvido");
        }
        if (
          f === STRATEGIC_FILES.actions ||
          f === STRATEGIC_FILES.bridge ||
          f === STRATEGIC_FILES.executionGate ||
          f === STRATEGIC_FILES.autoheal ||
          f === STRATEGIC_FILES.proposalUI
        ) {
          score += 46;
          reasons.push("com OpenAI já conectada, a próxima etapa é estruturar a camada cognitiva e supervisionada");
        }
      }
    }

    if (goalId === "evolve-factory-ai") {
      if (f === STRATEGIC_FILES.planner) {
        score += 120;
        reasons.push("camada central de decisão da Factory AI");
      }
      if (f === STRATEGIC_FILES.actions) {
        score += 82;
        reasons.push("orquestra execução supervisionada");
      }
      if (f === STRATEGIC_FILES.bridge) {
        score += 76;
        reasons.push("transforma resposta em plano operacional");
      }
      if (f === STRATEGIC_FILES.autoheal) {
        score += 68;
        reasons.push("converte diagnóstico em proposta concreta");
      }
      if (f === STRATEGIC_FILES.proposalUI) {
        score += 60;
        reasons.push("fecha a etapa humana de aprovação supervisionada");
      }
      if (f === STRATEGIC_FILES.executionGate) {
        score += 58;
        reasons.push("protege a passagem approve -> validate -> stage -> apply");
      }
      if (f === STRATEGIC_FILES.patchSupervisor) {
        score += 54;
        reasons.push("fecha fluxo approve -> stage -> apply");
      }
      if (f === STRATEGIC_FILES.backend) {
        score += 44;
        reasons.push("qualidade da inteligência do backend");
      }
      if (f === STRATEGIC_FILES.factoryAI) {
        score += 38;
        reasons.push("chat e integração do front");
      }
      if (f === STRATEGIC_FILES.context) {
        score += 30;
        reasons.push("qualidade do snapshot e contexto");
      }
      if (f === STRATEGIC_FILES.tree) {
        score -= 20;
        reasons.push("tree já não deve ser prioridade padrão nesta fase");
      }
      if (f === STRATEGIC_FILES.state) {
        score -= 14;
        reasons.push("state já não deve sequestrar a prioridade cognitiva");
      }
      if (f === STRATEGIC_FILES.doctor) {
        score -= 48;
        reasons.push("doctor não deve sequestrar a prioridade da evolução cognitiva");
      }

      if (isRuntimeConnected) {
        if (f === STRATEGIC_FILES.backend || f === STRATEGIC_FILES.runtime || f === STRATEGIC_FILES.factoryAI) {
          score -= 80;
          reasons.push("OpenAI/runtime já conectados nesta fase");
        }
        if (
          f === STRATEGIC_FILES.actions ||
          f === STRATEGIC_FILES.bridge ||
          f === STRATEGIC_FILES.autoheal ||
          f === STRATEGIC_FILES.executionGate ||
          f === STRATEGIC_FILES.proposalUI
        ) {
          score += 24;
          reasons.push("agora a prioridade é estruturar a inteligência supervisionada");
        }
      }
    }

    if (goalId === "supervised-patch-flow") {
      if (f === STRATEGIC_FILES.patchSupervisor) {
        score += 90;
        reasons.push("fluxo de patch supervisionado");
      }
      if (f === STRATEGIC_FILES.executionGate) {
        score += 82;
        reasons.push("controle de aprovação/validação/stage/apply");
      }
      if (f === STRATEGIC_FILES.actions) {
        score += 74;
        reasons.push("ações seguras da Factory AI");
      }
      if (f === STRATEGIC_FILES.bridge) {
        score += 60;
        reasons.push("ponte entre resposta e operação");
      }
      if (f === STRATEGIC_FILES.doctor) {
        score -= 20;
        reasons.push("doctor não é o foco do fluxo de patch supervisionado");
      }
    }

    if (goalId === "diagnostics") {
      if (f === STRATEGIC_FILES.diagnostics) {
        score += 92;
        reasons.push("diagnóstico consolidado da Factory AI");
      }
      if (f === STRATEGIC_FILES.doctor) {
        score += 80;
        reasons.push("diagnóstico interno");
      }
      if (f === STRATEGIC_FILES.state) {
        score += 40;
        reasons.push("persistência de diagnóstico");
      }
    }

    if (goalId === "general-supervision") {
      if (f === STRATEGIC_FILES.planner) {
        score += 30;
        reasons.push("planejamento ainda é prioridade estrutural");
      }
      if (f === STRATEGIC_FILES.actions) {
        score += 18;
        reasons.push("camada de ações supervisionadas continua prioritária");
      }
      if (f === STRATEGIC_FILES.bridge) {
        score += 16;
        reasons.push("ponte supervisionada ainda precisa amadurecer");
      }
      if (f === STRATEGIC_FILES.doctor) {
        score -= 18;
        reasons.push("doctor não deve assumir prioridade padrão nesta fase");
      }
    }

    if (f === STRATEGIC_FILES.tree && pathsCount < 20) {
      score += 25;
      reasons.push("árvore ainda rasa");
    }

    if (f === STRATEGIC_FILES.doctor && !doctor.lastRun && goalId === "diagnostics") {
      score += 18;
      reasons.push("doctor nunca executado");
    }

    if (f === STRATEGIC_FILES.bridge && !bridge.ready) {
      score += 20;
      reasons.push("bridge ainda não operacional");
    }

    if (f === STRATEGIC_FILES.actions && !actions.ready) {
      score += 20;
      reasons.push("actions ainda não operacional");
    }

    if (f === STRATEGIC_FILES.patchSupervisor && !patchSupervisor.ready) {
      score += 24;
      reasons.push("patch supervisor ainda não operacional");
    }

    if (activeModules.indexOf("factoryAI") >= 0 && activeModules.indexOf("contextEngine") >= 0) {
      if (
        f === STRATEGIC_FILES.planner ||
        f === STRATEGIC_FILES.actions ||
        f === STRATEGIC_FILES.bridge ||
        f === STRATEGIC_FILES.autoheal
      ) {
        score += 14;
        reasons.push("núcleo já permite subir para camada cognitiva");
      }
    }

    if (diagScore >= 70 && (
      f === STRATEGIC_FILES.tree ||
      f === STRATEGIC_FILES.state ||
      f === STRATEGIC_FILES.registry
    )) {
      score -= 22;
      reasons.push("com saúde já razoável, não vale regredir para infraestrutura genérica");
    }

    if (!hasFile(knownFiles, f)) {
      score += 8;
      reasons.push("arquivo ainda não visível na árvore atual");
    } else {
      score += 2;
      reasons.push("arquivo já conhecido na estrutura");
    }

    if (recentlyPicked) {
      if (f === STRATEGIC_FILES.planner) {
        score -= 65;
        reasons.push("evita self-loop do planner como próximo alvo repetido");
      } else {
        score -= 24;
        reasons.push("arquivo acabou de ser priorizado recentemente");
      }
    }

    return {
      file: f,
      score: score,
      reasons: uniq(reasons)
    };
  }

  function chooseNextFile(ctx) {
    var candidates = [
      STRATEGIC_FILES.planner,
      STRATEGIC_FILES.actions,
      STRATEGIC_FILES.bridge,
      STRATEGIC_FILES.runtime,
      STRATEGIC_FILES.autoheal,
      STRATEGIC_FILES.proposalUI,
      STRATEGIC_FILES.executionGate,
      STRATEGIC_FILES.patchSupervisor,
      STRATEGIC_FILES.backend,
      STRATEGIC_FILES.factoryAI,
      STRATEGIC_FILES.context,
      STRATEGIC_FILES.state,
      STRATEGIC_FILES.registry,
      STRATEGIC_FILES.tree,
      STRATEGIC_FILES.doctor,
      STRATEGIC_FILES.diagnostics,
      STRATEGIC_FILES.autoLoop,
      STRATEGIC_FILES.selfEvolution,
      STRATEGIC_FILES.focusEngine,
      STRATEGIC_FILES.app
    ];

    var scored = candidates.map(function (file) {
      return scoreCandidate(file, ctx);
    });

    scored.sort(function (a, b) {
      return b.score - a.score;
    });

    return {
      nextFile: scored[0] ? scored[0].file : STRATEGIC_FILES.actions,
      ranking: scored
    };
  }

  function buildExecutionLine(nextFile, ctx) {
    var line = [];
    var goalId = safe(function () { return ctx.goal.id; }, "");
    var phaseCtx = safe(function () { return ctx.phaseCtx; }, {});
    var recommended = asArray(safe(function () { return phaseCtx.recommendedTargets; }, []));

    if (goalId === "evolve-factory-ai") {
      line.push(nextFile);
      line.push(STRATEGIC_FILES.actions);
      line.push(STRATEGIC_FILES.bridge);
      line.push(STRATEGIC_FILES.autoheal);
      line.push(STRATEGIC_FILES.proposalUI);
      line.push(STRATEGIC_FILES.executionGate);
    } else if (goalId === "supervised-patch-flow") {
      line.push(nextFile);
      line.push(STRATEGIC_FILES.executionGate);
      line.push(STRATEGIC_FILES.patchSupervisor);
      line.push(STRATEGIC_FILES.bridge);
      line.push(STRATEGIC_FILES.actions);
    } else if (goalId === "diagnostics") {
      line.push(nextFile);
      line.push(STRATEGIC_FILES.diagnostics);
      line.push(STRATEGIC_FILES.doctor);
      line.push(STRATEGIC_FILES.state);
    } else if (goalId === "openai-connectivity") {
      line.push(nextFile);
      line.push(STRATEGIC_FILES.runtime);
      line.push(STRATEGIC_FILES.factoryAI);
      line.push(STRATEGIC_FILES.actions);
    } else {
      line.push(nextFile);
      line.push(STRATEGIC_FILES.actions);
      line.push(STRATEGIC_FILES.bridge);
      line.push(STRATEGIC_FILES.autoheal);
    }

    line = uniq(line.concat(recommended.map(normalizePath)));
    return line.slice(0, 8);
  }

  function buildPriorityLabel(score) {
    if (score >= 110) return "critical-now";
    if (score >= 80) return "high";
    if (score >= 50) return "medium";
    return "low";
  }

  function buildReasonText(top) {
    var reasons = asArray(top.reasons);
    if (!reasons.length) return "prioridade calculada pela fase atual da Factory";
    return reasons.join("; ");
  }

  function buildNotes(ctx, nextFile) {
    var notes = [];
    var goalId = safe(function () { return ctx.goal.id; }, "");
    var doctorLastRun = safe(function () { return ctx.doctor.lastRun; }, null);
    var bridgeReady = !!safe(function () { return ctx.bridge.ready; }, false);
    var actionsReady = !!safe(function () { return ctx.actions.ready; }, false);
    var patchReady = !!safe(function () { return ctx.patchSupervisor.ready; }, false);
    var runtime = safe(function () { return ctx.runtimeStatus; }, {});
    var activeModules = asArray(safe(function () { return ctx.moduleSummary.active; }, []));
    var phaseTitle = trimText(safe(function () { return ctx.phaseCtx.activePhase.title; }, "") || safe(function () { return ctx.phaseCtx.activePhaseTitle; }, ""));
    var diagNextFocus = trimText(safe(function () { return ctx.diagnostics.nextFocus.targetFile; }, ""));
    var diagScore = Number(safe(function () { return ctx.diagnostics.health.score; }, 0) || 0);
    var memoryAvoid = asArray(safe(function () { return ctx.memoryCtx.avoidFiles; }, []));
    var isRuntimeConnected = runtimeConnected(runtime);

    if (phaseTitle) {
      notes.push("Fase ativa considerada: " + phaseTitle + ".");
    }

    if (goalId === "evolve-factory-ai") {
      notes.push("A fase atual pede evolução cognitiva da Factory AI, não retorno ao ciclo genérico de doctor/state/registry/tree.");
      notes.push("O próximo arquivo deve aumentar capacidade de planejamento, decisão e sequência supervisionada.");
    }

    if (goalId === "openai-connectivity" && isRuntimeConnected) {
      notes.push("A trilha runtime -> backend -> OpenAI já está conectada; a prioridade agora é subir a inteligência supervisionada.");
    }

    if (!doctorLastRun) {
      notes.push("Doctor ainda não rodou, mas isso não deve sequestrar a prioridade estratégica se a meta atual for inteligência e supervisão.");
    }

    if (!bridgeReady) {
      notes.push("Factory AI Bridge ainda não está consolidado no runtime atual.");
    }

    if (!actionsReady) {
      notes.push("Factory AI Actions ainda não está consolidado no runtime atual.");
    }

    if (!patchReady) {
      notes.push("Patch Supervisor ainda não está consolidado no runtime atual.");
    }

    if (isRuntimeConnected) {
      notes.push("Runtime/OpenAI já confirmados como conectados.");
    }

    if (activeModules.indexOf("factoryAI") >= 0 && activeModules.indexOf("contextEngine") >= 0) {
      notes.push("Factory AI + Context Engine já ativos permitem subir para camada de planner/orquestração.");
    }

    if (nextFile === STRATEGIC_FILES.planner) {
      notes.push("Planner é a peça que transforma snapshot em prioridade real e evita repetição de respostas rasas.");
    }

    if (nextFile === STRATEGIC_FILES.actions) {
      notes.push("Actions é a próxima camada lógica para transformar inteligência conectada em execução supervisionada real.");
    }

    if (diagNextFocus) {
      notes.push("Diagnostics já apontou foco consolidado em " + diagNextFocus + ".");
    }

    if (diagScore >= 70) {
      notes.push("A saúde atual já permite evitar regressão para infraestrutura genérica.");
    }

    if (memoryAvoid.length) {
      notes.push("Memory está bloqueando alvos recentes para evitar repetição burra.");
    }

    return uniq(notes);
  }

  function buildObjective(goal, nextFile) {
    var label = trimText(safe(function () { return goal.label; }, ""));
    if (!label) label = "Evoluir a Factory com supervisão";
    return label + " focando em " + nextFile;
  }

  function buildNextStep(nextFile, executionLine) {
    var line = asArray(executionLine).slice(0, 4);
    return "Consolidar " + nextFile + " e manter a sequência supervisionada: " + line.join(" -> ");
  }

  function buildPatchSummary(nextFile, reason, notes) {
    var parts = [];
    if (reason) parts.push("Priorizar " + nextFile + " porque " + reason + ".");
    if (asArray(notes).length) parts.push(asArray(notes).slice(0, 2).join(" "));
    return parts.join(" ").trim();
  }

  function buildPlan(input) {
    var snapshot = getContextSnapshot();
    var factoryState = getFactoryState();
    var moduleSummary = getModuleSummary();
    var treeSummary = getTreeSummary();
    var bridge = getBridgeStatus();
    var actions = getActionsStatus();
    var runtimeStatus = getRuntimeStatus();
    var patchSupervisor = getPatchSupervisorStatus();
    var doctor = getDoctorState();
    var phaseCtx = getPhaseContext();
    var memoryCtx = getMemoryContext();
    var diagnostics = getDiagnosticsReport();
    var goal = detectGoal(input || {}, phaseCtx, diagnostics, runtimeStatus);
    var knownFiles = collectKnownFiles(snapshot, treeSummary);

    var ctx = {
      input: clone(input || {}),
      snapshot: clone(snapshot || {}),
      factoryState: clone(factoryState || {}),
      moduleSummary: clone(moduleSummary || {}),
      treeSummary: clone(treeSummary || {}),
      bridge: clone(bridge || {}),
      actions: clone(actions || {}),
      runtimeStatus: clone(runtimeStatus || {}),
      patchSupervisor: clone(patchSupervisor || {}),
      doctor: clone(doctor || {}),
      goal: clone(goal || {}),
      knownFiles: clone(knownFiles || []),
      phaseCtx: clone(phaseCtx || {}),
      memoryCtx: clone(memoryCtx || {}),
      diagnostics: clone(diagnostics || {})
    };

    var choice = chooseNextFile(ctx);
    var top = choice.ranking[0] || { file: STRATEGIC_FILES.actions, score: 0, reasons: [] };
    var executionLine = buildExecutionLine(top.file, ctx);
    var notes = buildNotes(ctx, top.file);
    var reason = buildReasonText(top);

    var plan = {
      id: "planner_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now(),
      version: VERSION,
      createdAt: nowISO(),

      goal: goal,
      priority: buildPriorityLabel(top.score),

      targetFile: normalizePath(top.file),
      nextFile: normalizePath(top.file),

      mode: "patch",
      risk: top.score >= 110 ? "medium" : "low",
      approvalRequired: true,
      approvalStatus: "pending",

      objective: buildObjective(goal, top.file),
      reason: reason,
      nextStep: buildNextStep(top.file, executionLine),
      patchSummary: buildPatchSummary(top.file, reason, notes),
      suggestedFiles: executionLine.slice(0, 8),

      executionLine: executionLine,
      ranking: choice.ranking.slice(0, 10),
      notes: notes,

      proposedCode: "",
      proposedLang: "",

      runtime: {
        bootStatus: trimText(safe(function () { return factoryState.bootStatus; }, "")),
        activeView: trimText(safe(function () { return factoryState.activeView; }, "")),
        engineVersion: trimText(safe(function () { return factoryState.engineVersion; }, "")),
        pathsCount: Number(safe(function () { return snapshot.tree.pathsCount; }, 0) || 0),
        activeModules: asArray(safe(function () { return moduleSummary.active; }, [])),
        runtimeReady: !!runtimeStatus.ready,
        runtimeConnected: runtimeConnected(runtimeStatus),
        runtimeEndpoint: trimText(runtimeStatus.lastEndpoint || ""),
        connectionStatus: trimText(runtimeStatus.connectionStatus || "unknown"),
        connectionProvider: trimText(runtimeStatus.connectionProvider || ""),
        connectionModel: trimText(runtimeStatus.connectionModel || ""),
        connectionResponseStatus: trimText(runtimeStatus.connectionResponseStatus || ""),
        connectionIncomplete: !!runtimeStatus.connectionIncomplete,
        connectionIncompleteReason: trimText(runtimeStatus.connectionIncompleteReason || "")
      },

      phase: {
        activePhaseId: trimText(safe(function () { return phaseCtx.activePhase.id; }, "") || safe(function () { return phaseCtx.activePhaseId; }, "")),
        activePhaseTitle: trimText(safe(function () { return phaseCtx.activePhase.title; }, "") || safe(function () { return phaseCtx.activePhaseTitle; }, "")),
        recommendedTargets: asArray(safe(function () { return phaseCtx.recommendedTargets; }, [])).map(normalizePath)
      },

      diagnostics: {
        nextFocus: normalizePath(safe(function () { return diagnostics.nextFocus.targetFile; }, "")),
        healthScore: Number(safe(function () { return diagnostics.health.score; }, 0) || 0),
        healthGrade: trimText(safe(function () { return diagnostics.health.grade; }, ""))
      },

      memory: {
        avoidFiles: asArray(safe(function () { return memoryCtx.avoidFiles; }, []))
      }
    };

    state.lastGoal = goal.label || "";
    state.lastPriority = plan.priority;
    state.lastPlan = clone(plan);
    persist();

    pushHistory({
      type: "plan",
      id: plan.id,
      goal: goal.id,
      nextFile: plan.targetFile,
      priority: plan.priority,
      ts: plan.createdAt
    });

    emit("RCF:FACTORY_AI_PLAN_READY", {
      plan: clone(plan)
    });

    pushLog("OK", "plan built ✅", {
      goal: goal.id,
      targetFile: plan.targetFile,
      priority: plan.priority,
      runtimeConnected: runtimeConnected(runtimeStatus)
    });

    return clone(plan);
  }

  function planFromRuntime(input) {
    return buildPlan(input || {});
  }

  function explainLastPlan() {
    var plan = clone(state.lastPlan || null);
    if (!plan) {
      return {
        ok: false,
        msg: "Nenhum plano calculado ainda."
      };
    }

    return {
      ok: true,
      plan: plan,
      text: [
        "Objetivo: " + trimText(safe(function () { return plan.goal.label; }, "")),
        "Próximo arquivo: " + trimText(plan.targetFile || plan.nextFile || ""),
        "Prioridade: " + trimText(plan.priority || ""),
        "Razão: " + trimText(plan.reason || ""),
        "Linha de execução: " + asArray(plan.executionLine).join(" -> ")
      ].join("\n")
    };
  }

  function getState() {
    return clone(state);
  }

  function getLastPlan() {
    return clone(state.lastPlan || null);
  }

  function status() {
    var runtimeStatus = getRuntimeStatus();
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      lastGoal: state.lastGoal || "",
      lastPriority: state.lastPriority || "",
      hasPlan: !!state.lastPlan,
      lastNextFile: safe(function () { return state.lastPlan.targetFile || state.lastPlan.nextFile; }, ""),
      runtimeConnected: runtimeConnected(runtimeStatus),
      historyCount: Array.isArray(state.history) ? state.history.length : 0,
      presenceSyncedAt: state.presenceSyncedAt || null,
      presenceSyncAttempts: Number(state.presenceSyncAttempts || 0) || 0
    };
  }

  function clearPresenceRetryTimer() {
    try {
      if (state.presenceRetryTimer) {
        clearTimeout(state.presenceRetryTimer);
      }
    } catch (_) {}
    state.presenceRetryTimer = null;
  }

  function schedulePresenceResync() {
    clearPresenceRetryTimer();

    state.presenceRetryTimer = setTimeout(function () {
      try { syncPresence(); } catch (_) {}
    }, PRESENCE_RETRY_DELAY_MS);
  }

  function bindPresenceVisibilityHooks() {
    if (state.visibilityHooksBound) return;
    state.visibilityHooksBound = true;

    try {
      global.addEventListener("pageshow", function () {
        try { syncPresence(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:UI_READY", function () {
        try { syncPresence(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      if (global.document) {
        global.document.addEventListener("DOMContentLoaded", function () {
          try { syncPresence(); } catch (_) {}
        }, { once: true });
      }
    } catch (_) {}
  }

  function syncPresence() {
    var hasFactoryState = false;
    var hasRegistry = false;

    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIPlanner");
        hasFactoryState = true;
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIPlanner", true);
        hasFactoryState = true;
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIPlanner");
        hasRegistry = true;
      }
    } catch (_) {}

    try {
      if (hasRegistry && global.RCF_MODULE_REGISTRY?.refresh) {
        global.RCF_MODULE_REGISTRY.refresh();
      }
    } catch (_) {}

    state.presenceSyncAttempts = Number(state.presenceSyncAttempts || 0) + 1;

    if (hasFactoryState || hasRegistry) {
      state.presenceSyncedAt = nowISO();
      persist();
      clearPresenceRetryTimer();
      return true;
    }

    schedulePresenceResync();
    return false;
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    bindPresenceVisibilityHooks();
    syncPresence();
    pushLog("OK", "factory_ai_planner ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_PLANNER = {
    __v100: true,
    __v101: true,
    __v103: true,
    __v104: true,
    __v105: true,
    __v106: true,
    version: VERSION,
    init: init,
    status: status,
    getState: getState,
    getLastPlan: getLastPlan,
    explainLastPlan: explainLastPlan,
    buildPlan: buildPlan,
    planFromRuntime: planFromRuntime,
    syncPresence: syncPresence
  };

  try { init(); } catch (_) {}

})(window);

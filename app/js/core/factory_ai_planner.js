/* FILE: /app/js/core/factory_ai_planner.js
   RControl Factory — Factory AI Planner
   v1.0.3 SUPERVISED EVOLUTION PLANNER

   Objetivo:
   - transformar snapshot/contexto em plano operacional supervisionado
   - impedir ciclo repetitivo de respostas genéricas (doctor/state/registry/tree)
   - priorizar próximo arquivo estratégico com base na fase atual da Factory
   - integrar Context Engine + Factory AI Bridge + Factory AI Actions
   - preparar sequência: analisar -> priorizar -> planejar -> aprovar -> stage -> apply
   - NÃO aplicar patch automaticamente
   - funcionar como script clássico

   PATCH v1.0.3:
   - corrige goal detection para prompts genéricos de evolução/próximo passo
   - evita doctor_scan sequestrando prioridade em general-supervision
   - mantém doctor forte só quando a meta for realmente diagnostics
   - preserva a estrutura existente com patch mínimo
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_PLANNER && global.RCF_FACTORY_AI_PLANNER.__v103) return;

  var VERSION = "v1.0.3";
  var STORAGE_KEY = "rcf:factory_ai_planner";
  var MAX_HISTORY = 80;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastPlan: null,
    lastPriority: null,
    lastGoal: "",
    history: []
  };

  var STRATEGIC_FILES = {
    planner: "/app/js/core/factory_ai_planner.js",
    bridge: "/app/js/core/factory_ai_bridge.js",
    actions: "/app/js/core/factory_ai_actions.js",
    patchSupervisor: "/app/js/core/patch_supervisor.js",
    backend: "/functions/api/admin-ai.js",
    factoryAI: "/app/js/admin.admin_ai.js",
    context: "/app/js/core/context_engine.js",
    state: "/app/js/core/factory_state.js",
    registry: "/app/js/core/module_registry.js",
    tree: "/app/js/core/factory_tree.js",
    doctor: "/app/js/core/doctor_scan.js",
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

  function hasFile(list, file) {
    return asArray(list).indexOf(String(file || "")) >= 0;
  }

  function normalizePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function collectKnownFiles(snapshot, tree) {
    var out = [];
    var candidateFiles = safe(function () { return snapshot.candidateFiles; }, []);
    var groups = safe(function () { return snapshot.tree.pathGroups; }, {});
    var samples = safe(function () { return snapshot.tree.samples; }, []);
    var treeSamples = safe(function () { return tree.samples; }, {});

    out = out
      .concat(asArray(candidateFiles))
      .concat(asArray(samples))
      .concat(asArray(groups.core))
      .concat(asArray(groups.ui))
      .concat(asArray(groups.admin))
      .concat(asArray(groups.engine))
      .concat(asArray(treeSamples.core))
      .concat(asArray(treeSamples.ui))
      .concat(asArray(treeSamples.admin))
      .concat(asArray(treeSamples.engine));

    return uniq(out.map(normalizePath).filter(Boolean));
  }

  function detectGoal(input) {
    var rawGoal = trimText(
      safe(function () { return input.goal; }, "") ||
      safe(function () { return input.prompt; }, "") ||
      safe(function () { return input.userGoal; }, "") ||
      safe(function () { return input.reason; }, "")
    );

    var text = lower(rawGoal);

    if (!text) {
      return {
        id: "evolve-factory-ai",
        label: "Evoluir a Factory AI com supervisão",
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

    return {
      id: "general-supervision",
      label: "Supervisão técnica geral",
      sourceText: rawGoal
    };
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
    var activeModules = asArray(safe(function () { return ctx.moduleSummary.active; }, []));
    var pathsCount = Number(safe(function () { return ctx.snapshot.tree.pathsCount; }, 0) || 0);

    if (goalId === "evolve-factory-ai") {
      if (f === STRATEGIC_FILES.planner) {
        score += 100;
        reasons.push("camada de planejamento estratégico da IA");
      }
      if (f === STRATEGIC_FILES.actions) {
        score += 70;
        reasons.push("orquestra execução supervisionada");
      }
      if (f === STRATEGIC_FILES.bridge) {
        score += 60;
        reasons.push("transforma resposta em plano operacional");
      }
      if (f === STRATEGIC_FILES.patchSupervisor) {
        score += 55;
        reasons.push("fecha fluxo approve -> stage -> apply");
      }
      if (f === STRATEGIC_FILES.backend) {
        score += 48;
        reasons.push("qualidade da inteligência do backend");
      }
      if (f === STRATEGIC_FILES.factoryAI) {
        score += 42;
        reasons.push("chat e integração do front");
      }
      if (f === STRATEGIC_FILES.context) {
        score += 35;
        reasons.push("qualidade do snapshot e contexto");
      }
      if (f === STRATEGIC_FILES.doctor) {
        score -= 40;
        reasons.push("doctor não deve sequestrar a prioridade da evolução cognitiva");
      }
    }

    if (goalId === "supervised-patch-flow") {
      if (f === STRATEGIC_FILES.patchSupervisor) {
        score += 90;
        reasons.push("fluxo de patch supervisionado");
      }
      if (f === STRATEGIC_FILES.actions) {
        score += 75;
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
      if (f === STRATEGIC_FILES.doctor) {
        score += 85;
        reasons.push("diagnóstico interno");
      }
      if (f === STRATEGIC_FILES.state) {
        score += 45;
        reasons.push("persistência de diagnóstico");
      }
    }

    if (goalId === "general-supervision") {
      if (f === STRATEGIC_FILES.planner) {
        score += 20;
        reasons.push("planejamento ainda é prioridade estrutural");
      }
      if (f === STRATEGIC_FILES.actions) {
        score += 16;
        reasons.push("camada de ações supervisionadas continua prioritária");
      }
      if (f === STRATEGIC_FILES.bridge) {
        score += 14;
        reasons.push("ponte supervisionada ainda precisa amadurecer");
      }
      if (f === STRATEGIC_FILES.doctor) {
        score -= 18;
        reasons.push("doctor não deve assumir prioridade padrão nesta fase");
      }
    }

    if (f === STRATEGIC_FILES.state && !hasFile(knownFiles, STRATEGIC_FILES.planner)) {
      score += 8;
      reasons.push("estado ainda ajuda quando planner não existe");
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
        f === STRATEGIC_FILES.bridge
      ) {
        score += 14;
        reasons.push("núcleo já permite subir para camada cognitiva");
      }
    }

    if (!hasFile(knownFiles, f)) {
      score += 12;
      reasons.push("arquivo ainda não visível na árvore atual");
    } else {
      score += 2;
      reasons.push("arquivo já conhecido na estrutura");
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
      STRATEGIC_FILES.patchSupervisor,
      STRATEGIC_FILES.backend,
      STRATEGIC_FILES.factoryAI,
      STRATEGIC_FILES.context,
      STRATEGIC_FILES.state,
      STRATEGIC_FILES.registry,
      STRATEGIC_FILES.tree,
      STRATEGIC_FILES.doctor,
      STRATEGIC_FILES.app
    ];

    var scored = candidates.map(function (file) {
      return scoreCandidate(file, ctx);
    });

    scored.sort(function (a, b) {
      return b.score - a.score;
    });

    return {
      nextFile: scored[0] ? scored[0].file : STRATEGIC_FILES.planner,
      ranking: scored
    };
  }

  function buildExecutionLine(nextFile, ctx) {
    var line = [];
    var goalId = safe(function () { return ctx.goal.id; }, "");

    if (goalId === "evolve-factory-ai") {
      line.push(STRATEGIC_FILES.planner);
      line.push(STRATEGIC_FILES.actions);
      line.push(STRATEGIC_FILES.backend);
      line.push(STRATEGIC_FILES.factoryAI);
      line.push(STRATEGIC_FILES.patchSupervisor);
    } else if (goalId === "supervised-patch-flow") {
      line.push(STRATEGIC_FILES.patchSupervisor);
      line.push(STRATEGIC_FILES.actions);
      line.push(STRATEGIC_FILES.bridge);
      line.push(STRATEGIC_FILES.backend);
    } else if (goalId === "diagnostics") {
      line.push(STRATEGIC_FILES.doctor);
      line.push(STRATEGIC_FILES.state);
      line.push(STRATEGIC_FILES.registry);
      line.push(STRATEGIC_FILES.tree);
    } else {
      line.push(nextFile);
      line.push(STRATEGIC_FILES.actions);
      line.push(STRATEGIC_FILES.backend);
    }

    line = uniq([nextFile].concat(line));
    return line.slice(0, 8);
  }

  function buildPriorityLabel(score) {
    if (score >= 90) return "critical-now";
    if (score >= 70) return "high";
    if (score >= 45) return "medium";
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
    var activeModules = asArray(safe(function () { return ctx.moduleSummary.active; }, []));

    if (goalId === "evolve-factory-ai") {
      notes.push("A fase atual pede evolução cognitiva da Factory AI, não retorno ao ciclo genérico de doctor/state/registry/tree.");
      notes.push("O próximo arquivo deve aumentar capacidade de planejamento, decisão e sequência supervisionada.");
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

    if (activeModules.indexOf("factoryAI") >= 0 && activeModules.indexOf("contextEngine") >= 0) {
      notes.push("Factory AI + Context Engine já ativos permitem subir para camada de planner/orquestração.");
    }

    if (nextFile === STRATEGIC_FILES.planner) {
      notes.push("Planner é a peça que transforma snapshot em prioridade real e evita repetição de respostas rasas.");
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
    var patchSupervisor = getPatchSupervisorStatus();
    var doctor = getDoctorState();
    var goal = detectGoal(input || {});
    var knownFiles = collectKnownFiles(snapshot, treeSummary);

    var ctx = {
      input: clone(input || {}),
      snapshot: clone(snapshot || {}),
      factoryState: clone(factoryState || {}),
      moduleSummary: clone(moduleSummary || {}),
      treeSummary: clone(treeSummary || {}),
      bridge: clone(bridge || {}),
      actions: clone(actions || {}),
      patchSupervisor: clone(patchSupervisor || {}),
      doctor: clone(doctor || {}),
      goal: clone(goal || {}),
      knownFiles: clone(knownFiles || [])
    };

    var choice = chooseNextFile(ctx);
    var top = choice.ranking[0] || { file: STRATEGIC_FILES.planner, score: 0, reasons: [] };
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
      risk: top.score >= 90 ? "medium" : "low",
      approvalRequired: true,
      approvalStatus: "pending",

      objective: buildObjective(goal, top.file),
      reason: reason,
      nextStep: buildNextStep(top.file, executionLine),
      patchSummary: buildPatchSummary(top.file, reason, notes),
      suggestedFiles: executionLine.slice(0, 8),

      executionLine: executionLine,
      ranking: choice.ranking.slice(0, 8),
      notes: notes,

      proposedCode: "",
      proposedLang: "",

      runtime: {
        bootStatus: trimText(safe(function () { return factoryState.bootStatus; }, "")),
        activeView: trimText(safe(function () { return factoryState.activeView; }, "")),
        engineVersion: trimText(safe(function () { return factoryState.engineVersion; }, "")),
        pathsCount: Number(safe(function () { return snapshot.tree.pathsCount; }, 0) || 0),
        activeModules: asArray(safe(function () { return moduleSummary.active; }, []))
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
      priority: plan.priority
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
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      lastGoal: state.lastGoal || "",
      lastPriority: state.lastPriority || "",
      hasPlan: !!state.lastPlan,
      lastNextFile: safe(function () { return state.lastPlan.targetFile || state.lastPlan.nextFile; }, ""),
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIPlanner");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIPlanner", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIPlanner");
      }
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    syncPresence();
    pushLog("OK", "factory_ai_planner ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_PLANNER = {
    __v100: true,
    __v101: true,
    __v103: true,
    version: VERSION,
    init: init,
    status: status,
    getState: getState,
    getLastPlan: getLastPlan,
    explainLastPlan: explainLastPlan,
    buildPlan: buildPlan,
    planFromRuntime: planFromRuntime
  };

  try { init(); } catch (_) {}

})(window);

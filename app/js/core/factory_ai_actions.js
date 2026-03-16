/* FILE: /app/js/core/factory_ai_actions.js
   RControl Factory — Factory AI Actions
   v1.1.0 ACTION ORCHESTRATOR + PLANNER FLOW

   Objetivo:
   - centralizar ações inteligentes da Factory AI
   - ligar Factory AI Planner + Factory AI Bridge + Patch Supervisor + módulos core
   - evitar lógica solta espalhada no admin.admin_ai.js
   - permitir fluxo supervisionado:
       analisar -> planejar -> aprovar -> validar -> stage -> apply
   - expor ações seguras e reutilizáveis via window.RCF_FACTORY_AI_ACTIONS
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_ACTIONS && global.RCF_FACTORY_AI_ACTIONS.__v110) return;

  var VERSION = "v1.1.0";
  var STORAGE_KEY = "rcf:factory_ai_actions";
  var MAX_HISTORY = 100;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastAction: null,
    lastResult: null,
    lastPlanSummary: null,
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
      state = merge(clone(state), clone(parsed));
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
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_ACTIONS] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_ACTIONS] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_ACTIONS]", level, msg, extra || ""); } catch (_) {}
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

  function markAction(name, input, result) {
    state.lastAction = {
      name: trimText(name || ""),
      input: clone(input || {}),
      ts: nowISO()
    };

    state.lastResult = clone(result || null);

    pushHistory({
      type: "action",
      name: trimText(name || ""),
      input: clone(input || {}),
      result: clone(result || {}),
      ts: nowISO()
    });

    persist();
  }

  function getPlanner() {
    return safe(function () { return global.RCF_FACTORY_AI_PLANNER || null; }, null);
  }

  function getBridge() {
    return safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
  }

  function getPatchSupervisor() {
    return safe(function () { return global.RCF_PATCH_SUPERVISOR || null; }, null);
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

  function getLoggerTail(limit) {
    var max = Math.max(1, Number(limit || 30));

    return safe(function () {
      var logger = global.RCF_LOGGER;
      if (!logger) return [];

      if (Array.isArray(logger.items)) return logger.items.slice(-max);
      if (Array.isArray(logger.lines)) return logger.lines.slice(-max);

      if (typeof logger.getAll === "function") {
        var arr = logger.getAll();
        return Array.isArray(arr) ? arr.slice(-max) : [];
      }

      if (typeof logger.getText === "function") {
        var txt = String(logger.getText() || "").trim();
        return txt ? txt.split("\n").slice(-max) : [];
      }

      if (typeof logger.dump === "function") {
        var raw = String(logger.dump() || "").trim();
        return raw ? raw.split("\n").slice(-max) : [];
      }

      return [];
    }, []);
  }

  function normalizeFilePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.indexOf("/") !== 0) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function detectIntent(prompt) {
    var p = trimText(prompt || "").toLowerCase();

    if (!p) return "chat";
    if (p.indexOf("aprovar") >= 0 && p.indexOf("patch") >= 0) return "approve_patch";
    if (p.indexOf("validar") >= 0 && p.indexOf("patch") >= 0) return "validate_patch";
    if (p.indexOf("stage") >= 0 && p.indexOf("patch") >= 0) return "stage_patch";
    if (p.indexOf("aplicar") >= 0 && p.indexOf("patch") >= 0) return "apply_patch";
    if (p.indexOf("doctor") >= 0 || p.indexOf("diagnóstico") >= 0 || p.indexOf("diagnostico") >= 0) return "run_doctor";
    if (p.indexOf("logs") >= 0 || p.indexOf("erros") >= 0 || p.indexOf("erro") >= 0) return "collect_logs";
    if (p.indexOf("snapshot") >= 0 || p.indexOf("estado") >= 0 || p.indexOf("contexto") >= 0) return "snapshot";
    if (p.indexOf("planejar") >= 0 || p.indexOf("plano") >= 0) return "plan";
    if (p.indexOf("próximo arquivo") >= 0 || p.indexOf("proximo arquivo") >= 0) return "next_file";
    if (p.indexOf("autonomia") >= 0) return "autonomy";
    return "chat";
  }

  function buildRuntimeSnapshot() {
    return {
      ts: nowISO(),
      factoryState: clone(getFactoryState() || {}),
      moduleRegistry: clone(getModuleRegistrySummary() || {}),
      context: clone(getContextSnapshot() || {}),
      doctor: clone(getDoctorState() || {}),
      tree: clone(getTreeSummary() || {}),
      loggerTail: getLoggerTail(20)
    };
  }

  function getCandidateFilesFromContext() {
    var snap = getContextSnapshot();
    var out = [];

    try {
      if (Array.isArray(snap.candidateFiles)) out = out.concat(snap.candidateFiles);
    } catch (_) {}

    try {
      var tree = snap.tree || {};
      if (Array.isArray(tree.samples)) out = out.concat(tree.samples);
      if (tree.pathGroups && typeof tree.pathGroups === "object") {
        Object.keys(tree.pathGroups).forEach(function (k) {
          var arr = tree.pathGroups[k];
          if (Array.isArray(arr)) out = out.concat(arr);
        });
      }
    } catch (_) {}

    out = out
      .map(function (p) { return normalizeFilePath(p); })
      .filter(Boolean);

    var uniq = [];
    var seen = {};
    out.forEach(function (p) {
      if (seen[p]) return;
      seen[p] = true;
      uniq.push(p);
    });

    return uniq;
  }

  function buildDefaultPlanInput(meta) {
    var snapshot = buildRuntimeSnapshot();
    return {
      ts: nowISO(),
      source: "factory_ai_actions",
      reason: trimText(meta && meta.reason || "planner.dispatch"),
      prompt: trimText(meta && meta.prompt || ""),
      snapshot: clone(snapshot),
      candidateFiles: getCandidateFilesFromContext()
    };
  }

  function normalizePlanSummary(plan) {
    var p = clone(plan || {});
    return {
      id: trimText(p.id || ""),
      targetFile: normalizeFilePath(p.targetFile || ""),
      mode: trimText(p.mode || ""),
      risk: trimText(p.risk || "unknown"),
      approvalRequired: !!p.approvalRequired,
      approvalStatus: trimText(p.approvalStatus || "pending"),
      objective: trimText(p.objective || ""),
      nextStep: trimText(p.nextStep || ""),
      suggestedFiles: Array.isArray(p.suggestedFiles) ? p.suggestedFiles.slice(0, 20) : []
    };
  }

  function rememberPlan(plan, source) {
    state.lastPlanSummary = {
      source: trimText(source || "unknown"),
      ts: nowISO(),
      plan: normalizePlanSummary(plan || {})
    };
    persist();
    return clone(state.lastPlanSummary);
  }

  function buildNextFileSuggestionFromPlan() {
    var bridge = getBridge();
    var planner = getPlanner();
    var plan = null;

    if (bridge && typeof bridge.getLastPlan === "function") {
      plan = bridge.getLastPlan();
    }

    if (plan && trimText(plan.targetFile)) {
      return {
        nextFile: normalizeFilePath(plan.targetFile),
        reason: trimText(plan.nextStep || plan.objective || "Arquivo alvo vindo do plano supervisionado atual."),
        source: "bridge.lastPlan",
        risk: trimText(plan.risk || "unknown")
      };
    }

    if (planner && typeof planner.getLastPlan === "function") {
      plan = planner.getLastPlan();
      if (plan && trimText(plan.targetFile)) {
        return {
          nextFile: normalizeFilePath(plan.targetFile),
          reason: trimText(plan.nextStep || plan.objective || "Arquivo alvo vindo do planner atual."),
          source: "planner.lastPlan",
          risk: trimText(plan.risk || "unknown")
        };
      }
    }

    return {
      nextFile: "/app/js/core/factory_tree.js",
      reason: "Sem plano consolidado ainda. O próximo passo seguro continua sendo consolidar árvore, estado e fluxo supervisionado.",
      source: "fallback",
      risk: "low"
    };
  }

  async function planFromCurrentRuntime(meta) {
    var planner = getPlanner();
    var bridge = getBridge();

    if (!planner || typeof planner.planFromRuntime !== "function") {
      var fail = { ok: false, msg: "Factory AI Planner indisponível." };
      markAction("planFromCurrentRuntime", meta, fail);
      pushLog("WARN", "planner indisponível", fail);
      return fail;
    }

    var plannerInput = buildDefaultPlanInput(meta);
    var plan = planner.planFromRuntime(plannerInput);

    if (!plan || !plan.id) {
      var failPlan = { ok: false, msg: "Planner não retornou plano válido." };
      markAction("planFromCurrentRuntime", meta, failPlan);
      pushLog("WARN", "planner sem plano válido", failPlan);
      return failPlan;
    }

    if (bridge && typeof bridge.fromText === "function") {
      var text = [
        "1. Objetivo",
        plan.objective || "",
        "",
        "2. Arquivo alvo",
        plan.targetFile || "",
        "",
        "3. Risco",
        plan.risk || "unknown",
        "",
        "4. Próximo passo mínimo recomendado",
        plan.nextStep || "",
        "",
        "5. Arquivos mais prováveis de ajuste",
        (Array.isArray(plan.suggestedFiles) ? plan.suggestedFiles : []).map(function (x) { return "- " + x; }).join("\n"),
        "",
        "6. Patch mínimo sugerido",
        plan.patchSummary || ""
      ].join("\n");

      try {
        bridge.fromText(text, {
          source: "factory_ai_actions.planFromCurrentRuntime",
          plannerPlan: clone(plan)
        });
      } catch (_) {}
    }

    var result = {
      ok: true,
      msg: "Plano consolidado ✅",
      plan: clone(plan),
      summary: rememberPlan(plan, "planner.planFromRuntime")
    };

    markAction("planFromCurrentRuntime", meta, result);
    emit("RCF:FACTORY_AI_PLAN_READY", clone(result));
    pushLog("OK", "planFromCurrentRuntime ✅", {
      targetFile: plan.targetFile,
      risk: plan.risk
    });

    return result;
  }

  async function approveLastPlan(meta) {
    var bridge = getBridge();
    if (!bridge || typeof bridge.approvePlan !== "function") {
      var fail = { ok: false, msg: "Factory AI Bridge indisponível para aprovação." };
      markAction("approveLastPlan", meta, fail);
      return fail;
    }

    var last = typeof bridge.getLastPlan === "function" ? bridge.getLastPlan() : null;
    if (!last || !last.id) {
      var failLast = { ok: false, msg: "Nenhum plano pendente para aprovar." };
      markAction("approveLastPlan", meta, failLast);
      return failLast;
    }

    var result = bridge.approvePlan(last.id, meta || {});
    markAction("approveLastPlan", { planId: last.id, meta: clone(meta || {}) }, result);

    if (result && result.ok) {
      emit("RCF:FACTORY_AI_ACTION_APPROVED", {
        ts: nowISO(),
        result: clone(result)
      });
      pushLog("OK", "approveLastPlan ✅", result);
    } else {
      pushLog("WARN", "approveLastPlan falhou", result);
    }

    return result;
  }

  async function validateLastApprovedPlan() {
    var bridge = getBridge();
    var supervisor = getPatchSupervisor();

    if (!bridge || typeof bridge.getLastPlan !== "function") {
      var failBridge = { ok: false, msg: "Factory AI Bridge indisponível." };
      markAction("validateLastApprovedPlan", {}, failBridge);
      return failBridge;
    }

    if (!supervisor || typeof supervisor.validateApprovedPlan !== "function") {
      var failSup = { ok: false, msg: "Patch Supervisor indisponível." };
      markAction("validateLastApprovedPlan", {}, failSup);
      return failSup;
    }

    var plan = bridge.getLastPlan();
    if (!plan || !plan.id) {
      var failPlan = { ok: false, msg: "Nenhum plano atual para validar." };
      markAction("validateLastApprovedPlan", {}, failPlan);
      return failPlan;
    }

    var validation = supervisor.validateApprovedPlan(plan.id);
    var result = {
      ok: !!validation.ok,
      planId: String(plan.id || ""),
      validation: clone(validation)
    };

    markAction("validateLastApprovedPlan", { planId: plan.id }, result);
    pushLog(result.ok ? "OK" : "WARN", "validateLastApprovedPlan", result);
    return result;
  }

  async function stageLastApprovedPlan() {
    var bridge = getBridge();
    var supervisor = getPatchSupervisor();

    if (!bridge || typeof bridge.getLastPlan !== "function") {
      var failBridge = { ok: false, msg: "Factory AI Bridge indisponível." };
      markAction("stageLastApprovedPlan", {}, failBridge);
      return failBridge;
    }

    if (!supervisor || typeof supervisor.stageApprovedPlan !== "function") {
      var failSup = { ok: false, msg: "Patch Supervisor indisponível." };
      markAction("stageLastApprovedPlan", {}, failSup);
      return failSup;
    }

    var plan = bridge.getLastPlan();
    if (!plan || !plan.id) {
      var failPlan = { ok: false, msg: "Nenhum plano atual para stage." };
      markAction("stageLastApprovedPlan", {}, failPlan);
      return failPlan;
    }

    var result = await supervisor.stageApprovedPlan(plan.id);
    markAction("stageLastApprovedPlan", { planId: plan.id }, result);
    pushLog(result.ok ? "OK" : "WARN", "stageLastApprovedPlan", result);
    return result;
  }

  async function applyLastApprovedPlan(opts) {
    var bridge = getBridge();
    var supervisor = getPatchSupervisor();

    if (!bridge || typeof bridge.getLastPlan !== "function") {
      var failBridge = { ok: false, msg: "Factory AI Bridge indisponível." };
      markAction("applyLastApprovedPlan", opts, failBridge);
      return failBridge;
    }

    if (!supervisor || typeof supervisor.applyApprovedPlan !== "function") {
      var failSup = { ok: false, msg: "Patch Supervisor indisponível." };
      markAction("applyLastApprovedPlan", opts, failSup);
      return failSup;
    }

    var plan = bridge.getLastPlan();
    if (!plan || !plan.id) {
      var failPlan = { ok: false, msg: "Nenhum plano atual para apply." };
      markAction("applyLastApprovedPlan", opts, failPlan);
      return failPlan;
    }

    var result = await supervisor.applyApprovedPlan(plan.id, opts || {});
    markAction("applyLastApprovedPlan", { planId: plan.id, opts: clone(opts || {}) }, result);
    pushLog(result.ok ? "OK" : "WARN", "applyLastApprovedPlan", result);
    return result;
  }

  async function runDoctor() {
    var result = { ok: false, msg: "Doctor indisponível." };

    try {
      if (global.RCF_DOCTOR_SCAN?.open) {
        await global.RCF_DOCTOR_SCAN.open();
        result = {
          ok: true,
          mode: "doctor_scan.open",
          lastRun: clone(global.RCF_DOCTOR_SCAN.lastRun || null)
        };
      } else if (global.RCF_DOCTOR_SCAN?.scan) {
        var report = await global.RCF_DOCTOR_SCAN.scan();
        result = {
          ok: true,
          mode: "doctor_scan.scan",
          reportLength: String(report || "").length,
          lastRun: clone(global.RCF_DOCTOR_SCAN.lastRun || null)
        };
      } else if (global.RCF_DOCTOR?.open) {
        await global.RCF_DOCTOR.open();
        result = { ok: true, mode: "doctor.open" };
      } else if (global.RCF_DOCTOR?.run) {
        var data = await global.RCF_DOCTOR.run();
        result = {
          ok: true,
          mode: "doctor.run",
          data: clone(data || {})
        };
      }
    } catch (e) {
      result = {
        ok: false,
        msg: String(e && e.message || e || "Falha ao rodar doctor.")
      };
    }

    markAction("runDoctor", {}, result);
    pushLog(result.ok ? "OK" : "WARN", "runDoctor", result);
    return result;
  }

  function collectLogs(limit) {
    var result = {
      ok: true,
      limit: Math.max(1, Number(limit || 30)),
      logs: getLoggerTail(limit || 30)
    };

    markAction("collectLogs", { limit: result.limit }, result);
    pushLog("OK", "collectLogs", { count: result.logs.length });
    return result;
  }

  function getAutonomySnapshot() {
    var snapshot = buildRuntimeSnapshot();
    var bridge = getBridge();
    var supervisor = getPatchSupervisor();
    var planner = getPlanner();

    var result = {
      ok: true,
      ts: nowISO(),
      runtime: snapshot,
      planner: {
        ready: !!planner,
        version: safe(function () { return planner.version; }, "unknown"),
        lastPlan: safe(function () { return planner.getLastPlan ? planner.getLastPlan() : null; }, null)
      },
      bridge: {
        ready: !!bridge,
        version: safe(function () { return bridge.version; }, "unknown"),
        lastPlan: safe(function () { return bridge.getLastPlan ? bridge.getLastPlan() : null; }, null)
      },
      patchSupervisor: {
        ready: !!supervisor,
        version: safe(function () { return supervisor.version; }, "unknown"),
        status: safe(function () { return supervisor.status ? supervisor.status() : {}; }, {})
      },
      nextFile: buildNextFileSuggestionFromPlan()
    };

    markAction("getAutonomySnapshot", {}, result);
    pushLog("OK", "getAutonomySnapshot", {
      plannerReady: result.planner.ready,
      bridgeReady: result.bridge.ready,
      supervisorReady: result.patchSupervisor.ready
    });

    return result;
  }

  function getNextFileSuggestion() {
    var result = {
      ok: true,
      suggestion: buildNextFileSuggestionFromPlan()
    };

    markAction("getNextFileSuggestion", {}, result);
    pushLog("OK", "getNextFileSuggestion", result.suggestion);
    return result;
  }

  async function dispatch(input) {
    var req = (input && typeof input === "object")
      ? clone(input)
      : { prompt: String(input || "") };

    var action = trimText(req.action || "");
    var prompt = trimText(req.prompt || "");
    var intent = action || detectIntent(prompt);

    if (intent === "plan") return planFromCurrentRuntime(req);
    if (intent === "approve_patch") return approveLastPlan(req.meta || {});
    if (intent === "validate_patch") return validateLastApprovedPlan();
    if (intent === "stage_patch") return stageLastApprovedPlan();
    if (intent === "apply_patch") return applyLastApprovedPlan(req.opts || {});
    if (intent === "run_doctor") return runDoctor();
    if (intent === "collect_logs") return collectLogs(req.limit || 30);
    if (intent === "snapshot" || intent === "autonomy") return getAutonomySnapshot();
    if (intent === "next_file") return getNextFileSuggestion();

    var fallback = {
      ok: true,
      mode: "chat",
      intent: intent,
      snapshot: getAutonomySnapshot()
    };

    markAction("dispatch", req, fallback);
    pushLog("INFO", "dispatch chat/fallback", { intent: intent });
    return fallback;
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIActions");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIActions", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIActions");
      }
    } catch (_) {}
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      lastAction: clone(state.lastAction || null),
      historyCount: Array.isArray(state.history) ? state.history.length : 0,
      plannerReady: !!getPlanner(),
      bridgeReady: !!getBridge(),
      patchSupervisorReady: !!getPatchSupervisor(),
      lastPlanSummary: clone(state.lastPlanSummary || null)
    };
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    syncPresence();
    pushLog("OK", "factory_ai_actions ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_ACTIONS = {
    __v100: true,
    __v110: true,
    version: VERSION,
    init: init,
    status: status,
    dispatch: dispatch,
    planFromCurrentRuntime: planFromCurrentRuntime,
    approveLastPlan: approveLastPlan,
    validateLastApprovedPlan: validateLastApprovedPlan,
    stageLastApprovedPlan: stageLastApprovedPlan,
    applyLastApprovedPlan: applyLastApprovedPlan,
    runDoctor: runDoctor,
    collectLogs: collectLogs,
    getAutonomySnapshot: getAutonomySnapshot,
    getNextFileSuggestion: getNextFileSuggestion,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

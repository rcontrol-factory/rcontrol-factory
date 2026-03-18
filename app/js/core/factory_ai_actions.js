/* FILE: /app/js/core/factory_ai_actions.js
   RControl Factory — Factory AI Actions
   v1.1.2 ACTION ORCHESTRATOR + SAFE PLAN PICK

   Objetivo:
   - centralizar ações inteligentes da Factory AI
   - ligar Factory AI Planner + Factory AI Bridge + Patch Supervisor + módulos core
   - evitar lógica solta espalhada no admin.admin_ai.js
   - permitir fluxo supervisionado:
       analisar -> planejar -> aprovar -> validar -> stage -> apply
   - expor ações seguras e reutilizáveis via window.RCF_FACTORY_AI_ACTIONS
   - funcionar como script clássico

   PATCH v1.1.2:
   - FIX: approveLastPlan prioriza pendingPlan antes de lastPlan
   - FIX: aceita meta.planId explicitamente
   - FIX: validate/stage/apply usam resolved current plan id com fallback seguro
   - FIX: evita atuar em plano stale/rejeitado/consumido quando houver pendingPlan melhor
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_ACTIONS && global.RCF_FACTORY_AI_ACTIONS.__v112) return;

  var VERSION = "v1.1.2";
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

  function nowMS() {
    try { return Date.now(); }
    catch (_) { return 0; }
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
      targetFile: normalizeFilePath(p.targetFile || p.nextFile || ""),
      mode: trimText(p.mode || ""),
      risk: trimText(p.risk || p.priority || "unknown"),
      approvalRequired: !!p.approvalRequired,
      approvalStatus: trimText(p.approvalStatus || "pending"),
      objective: trimText(p.objective || p.reason || ""),
      nextStep: trimText(p.nextStep || p.reason || ""),
      suggestedFiles: Array.isArray(p.suggestedFiles)
        ? p.suggestedFiles.slice(0, 20)
        : (Array.isArray(p.executionLine) ? p.executionLine.slice(0, 20) : [])
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

  function parsePlanTime(plan) {
    var raw =
      trimText(safe(function () { return plan.createdAt; }, "")) ||
      trimText(safe(function () { return plan.ts; }, "")) ||
      trimText(safe(function () { return plan.updatedAt; }, "")) ||
      trimText(safe(function () { return plan.lastUpdate; }, ""));

    if (!raw) return 0;

    var ms = Date.parse(raw);
    return isFinite(ms) ? ms : 0;
  }

  function normalizePlannerPlan(plan) {
    if (!plan || typeof plan !== "object") return null;

    var nextFile =
      normalizeFilePath(plan.nextFile || plan.targetFile || "");

    if (!nextFile) return null;

    return {
      id: trimText(plan.id || ""),
      targetFile: nextFile,
      reason: trimText(plan.reason || ""),
      objective: trimText(plan.objective || plan.reason || ""),
      nextStep: trimText(plan.nextStep || plan.reason || ""),
      risk: trimText(plan.risk || plan.priority || "unknown"),
      priority: trimText(plan.priority || ""),
      createdAt: trimText(plan.createdAt || plan.ts || ""),
      source: "planner.lastPlan",
      raw: clone(plan)
    };
  }

  function normalizeBridgePlan(plan) {
    if (!plan || typeof plan !== "object") return null;

    var targetFile = normalizeFilePath(plan.targetFile || plan.nextFile || "");
    if (!targetFile) return null;

    return {
      id: trimText(plan.id || ""),
      targetFile: targetFile,
      reason: trimText(plan.nextStep || plan.objective || ""),
      objective: trimText(plan.objective || ""),
      nextStep: trimText(plan.nextStep || ""),
      risk: trimText(plan.risk || "unknown"),
      priority: trimText(plan.priority || ""),
      createdAt: trimText(plan.createdAt || plan.ts || ""),
      source: "bridge.lastPlan",
      raw: clone(plan)
    };
  }

  function getLastPlannerPlanNormalized() {
    var planner = getPlanner();
    if (!planner || typeof planner.getLastPlan !== "function") return null;
    return normalizePlannerPlan(planner.getLastPlan());
  }

  function getLastBridgePlanNormalized() {
    var bridge = getBridge();
    if (!bridge || typeof bridge.getLastPlan !== "function") return null;
    return normalizeBridgePlan(bridge.getLastPlan());
  }

  function shouldPreferPlannerPlan(plannerPlan, bridgePlan) {
    if (plannerPlan && !bridgePlan) return true;
    if (!plannerPlan) return false;
    if (!bridgePlan) return true;

    var plannerTs = parsePlanTime(plannerPlan);
    var bridgeTs = parsePlanTime(bridgePlan);

    if (plannerTs && bridgeTs) {
      if (plannerTs >= bridgeTs) return true;
      if ((bridgeTs - plannerTs) > 15000) return false;
      return true;
    }

    return true;
  }

  function getPendingBridgePlanNormalized() {
    var bridge = getBridge();
    if (!bridge || typeof bridge.getPendingPlan !== "function") return null;
    return normalizeBridgePlan(bridge.getPendingPlan());
  }

  function resolveCurrentBridgePlanId(preferredPlanId) {
    var wanted = trimText(preferredPlanId || "");
    var pending = getPendingBridgePlanNormalized();
    var last = getLastBridgePlanNormalized();

    if (wanted) {
      if (pending && pending.id === wanted) return wanted;
      if (last && last.id === wanted) return wanted;
      return wanted;
    }

    if (pending && pending.id) return pending.id;
    if (last && last.id) return last.id;
    return "";
  }

  function buildNextFileSuggestionFromPlan() {
    var plannerPlan = getLastPlannerPlanNormalized();
    var bridgePlan = getLastBridgePlanNormalized();

    if (shouldPreferPlannerPlan(plannerPlan, bridgePlan) && plannerPlan) {
      return {
        nextFile: normalizeFilePath(plannerPlan.targetFile),
        reason: trimText(plannerPlan.nextStep || plannerPlan.objective || plannerPlan.reason || "Arquivo alvo vindo do planner atual."),
        source: "planner.lastPlan",
        risk: trimText(plannerPlan.risk || "unknown")
      };
    }

    if (bridgePlan) {
      return {
        nextFile: normalizeFilePath(bridgePlan.targetFile),
        reason: trimText(bridgePlan.nextStep || bridgePlan.objective || bridgePlan.reason || "Arquivo alvo vindo do plano supervisionado atual."),
        source: "bridge.lastPlan",
        risk: trimText(bridgePlan.risk || "unknown")
      };
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

    if (!planner || (typeof planner.planFromRuntime !== "function" && typeof planner.buildPlan !== "function")) {
      var fail = { ok: false, msg: "Factory AI Planner indisponível." };
      markAction("planFromCurrentRuntime", meta, fail);
      pushLog("WARN", "planner indisponível", fail);
      return fail;
    }

    var plannerInput = buildDefaultPlanInput(meta);
    var plan = null;

    if (typeof planner.planFromRuntime === "function") {
      plan = planner.planFromRuntime(plannerInput);
    } else if (typeof planner.buildPlan === "function") {
      plan = planner.buildPlan(plannerInput);
    }

    if (!plan || !plan.id) {
      var failPlan = { ok: false, msg: "Planner não retornou plano válido." };
      markAction("planFromCurrentRuntime", meta, failPlan);
      pushLog("WARN", "planner sem plano válido", failPlan);
      return failPlan;
    }

    if (bridge && typeof bridge.fromText === "function") {
      var text = [
        "1. Objetivo",
        plan.objective || plan.reason || "",
        "",
        "2. Arquivo alvo",
        plan.targetFile || plan.nextFile || "",
        "",
        "3. Risco",
        plan.risk || plan.priority || "unknown",
        "",
        "4. Próximo passo mínimo recomendado",
        plan.nextStep || plan.reason || "",
        "",
        "5. Arquivos mais prováveis de ajuste",
        (Array.isArray(plan.suggestedFiles)
          ? plan.suggestedFiles
          : (Array.isArray(plan.executionLine) ? plan.executionLine : [])
        ).map(function (x) { return "- " + x; }).join("\n"),
        "",
        "6. Patch mínimo sugerido",
        plan.patchSummary || ""
      ].join("\n");

      try {
        bridge.fromText(text, {
          source: "factory_ai_actions.planFromCurrentRuntime",
          plannerPlan: clone(plan),
          plannerTs: nowISO()
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
      targetFile: plan.targetFile || plan.nextFile || "",
      risk: plan.risk || plan.priority || "unknown"
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

    var requestedPlanId = trimText(safe(function () { return meta.planId; }, ""));
    var targetPlanId = resolveCurrentBridgePlanId(requestedPlanId);

    if (!targetPlanId) {
      var failLast = { ok: false, msg: "Nenhum plano pendente para aprovar." };
      markAction("approveLastPlan", meta, failLast);
      return failLast;
    }

    var result = bridge.approvePlan(targetPlanId, meta || {});
    markAction("approveLastPlan", { planId: targetPlanId, meta: clone(meta || {}) }, result);

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

  async function validateLastApprovedPlan(meta) {
    var supervisor = getPatchSupervisor();
    var planId = resolveCurrentBridgePlanId(trimText(safe(function () { return meta.planId; }, "")));

    if (!supervisor || typeof supervisor.validateApprovedPlan !== "function") {
      var failSup = { ok: false, msg: "Patch Supervisor indisponível." };
      markAction("validateLastApprovedPlan", meta || {}, failSup);
      return failSup;
    }

    if (!planId) {
      var failPlan = { ok: false, msg: "Nenhum plano atual para validar." };
      markAction("validateLastApprovedPlan", meta || {}, failPlan);
      return failPlan;
    }

    var validation = supervisor.validateApprovedPlan(planId);
    var result = {
      ok: !!validation.ok,
      planId: String(planId || ""),
      validation: clone(validation)
    };

    markAction("validateLastApprovedPlan", { planId: planId, meta: clone(meta || {}) }, result);
    pushLog(result.ok ? "OK" : "WARN", "validateLastApprovedPlan", result);
    return result;
  }

  async function stageLastApprovedPlan(meta) {
    var supervisor = getPatchSupervisor();
    var planId = resolveCurrentBridgePlanId(trimText(safe(function () { return meta.planId; }, "")));

    if (!supervisor || typeof supervisor.stageApprovedPlan !== "function") {
      var failSup = { ok: false, msg: "Patch Supervisor indisponível." };
      markAction("stageLastApprovedPlan", meta || {}, failSup);
      return failSup;
    }

    if (!planId) {
      var failPlan = { ok: false, msg: "Nenhum plano atual para stage." };
      markAction("stageLastApprovedPlan", meta || {}, failPlan);
      return failPlan;
    }

    var result = await supervisor.stageApprovedPlan(planId);
    markAction("stageLastApprovedPlan", { planId: planId, meta: clone(meta || {}) }, result);
    pushLog(result.ok ? "OK" : "WARN", "stageLastApprovedPlan", result);
    return result;
  }

  async function applyLastApprovedPlan(opts) {
    var supervisor = getPatchSupervisor();
    var requestedPlanId = trimText(safe(function () { return opts.planId; }, ""));
    var planId = resolveCurrentBridgePlanId(requestedPlanId);

    if (!supervisor || typeof supervisor.applyApprovedPlan !== "function") {
      var failSup = { ok: false, msg: "Patch Supervisor indisponível." };
      markAction("applyLastApprovedPlan", opts, failSup);
      return failSup;
    }

    if (!planId) {
      var failPlan = { ok: false, msg: "Nenhum plano atual para apply." };
      markAction("applyLastApprovedPlan", opts, failPlan);
      return failPlan;
    }

    var cleanOpts = clone(opts || {});
    if (cleanOpts && typeof cleanOpts === "object" && Object.prototype.hasOwnProperty.call(cleanOpts, "planId")) {
      delete cleanOpts.planId;
    }

    var result = await supervisor.applyApprovedPlan(planId, cleanOpts || {});
    markAction("applyLastApprovedPlan", { planId: planId, opts: clone(cleanOpts || {}) }, result);
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
        lastPlan: safe(function () { return bridge.getLastPlan ? bridge.getLastPlan() : null; }, null),
        pendingPlan: safe(function () { return bridge.getPendingPlan ? bridge.getPendingPlan() : null; }, null)
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
    if (intent === "validate_patch") return validateLastApprovedPlan(req.meta || {});
    if (intent === "stage_patch") return stageLastApprovedPlan(req.meta || {});
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
    __v111: true,
    __v112: true,
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

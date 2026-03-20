/* FILE: /app/js/core/factory_ai_actions.js
   RControl Factory — Factory AI Actions
   v1.2.0 ACTION ORCHESTRATOR + READER INTEGRATION + CORRUPTION FIX

   Objetivo:
   - centralizar ações inteligentes da Factory AI
   - ligar Factory AI Planner + Factory AI Bridge + Patch Supervisor + Reader + módulos core
   - evitar lógica solta espalhada no admin.admin_ai.js
   - permitir fluxo supervisionado:
       analisar -> planejar -> aprovar -> validar -> stage -> apply
   - expor ações seguras e reutilizáveis via window.RCF_FACTORY_AI_ACTIONS
   - adicionar leitura interna real read-only para a Factory AI
   - funcionar como script clássico

   PATCH v1.2.0:
   - FIX: remove corrupção/duplicação no final do arquivo
   - FIX: mantém suporte real à action local openai_status
   - ADD: integração com RCF_FACTORY_AI_READER
   - ADD: actions locais list_files / file_exists / read_file / summarize_file / inspect_file / summarize_many
   - ADD: status expõe readerReady
   - mantém compatibilidade com planner / bridge / patch_supervisor / runtime
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_ACTIONS && global.RCF_FACTORY_AI_ACTIONS.__v120) return;

  var VERSION = "v1.2.0";
  var STORAGE_KEY = "rcf:factory_ai_actions";
  var MAX_HISTORY = 100;

  var OPENAI_FLOW_FILES = [
    "/functions/api/admin-ai.js",
    "/app/js/core/factory_ai_runtime.js",
    "/app/js/admin.admin_ai.js"
  ];

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastAction: null,
    lastResult: null,
    lastPlanSummary: null,
    lastRuntimeCall: null,
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

  function normalizeFilePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.indexOf("/") !== 0) p = "/" + p;
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
      state = merge(clone(state), clone(parsed));
      if (!Array.isArray(state.history)) state.history = [];
      if (state.history.length > MAX_HISTORY) {
        state.history = state.history.slice(-MAX_HISTORY);
      }
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

  function getRuntime() {
    return safe(function () { return global.RCF_FACTORY_AI_RUNTIME || null; }, null);
  }

  function getReader() {
    return safe(function () { return global.RCF_FACTORY_AI_READER || null; }, null);
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

  function getRuntimeStatus() {
    return safe(function () {
      var api = getRuntime();
      if (!api || typeof api.status !== "function") {
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
          connectionUpstreamStatus: 0
        };
      }

      var st = api.status() || {};
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
        connectionUpstreamStatus: Number(st.connectionUpstreamStatus || 0) || 0
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
      connectionUpstreamStatus: 0
    });
  }

  function isRuntimeConnected(runtimeStatus) {
    var rt = runtimeStatus || getRuntimeStatus();
    return !!(
      rt.available &&
      rt.ready &&
      rt.lastOk &&
      lower(rt.connectionStatus) === "connected"
    );
  }

  function detectIntent(prompt) {
    var p = trimText(prompt || "").toLowerCase();

    if (!p) return "chat";
    if (p.indexOf("openai") >= 0 || p.indexOf("runtime") >= 0 || p.indexOf("backend") >= 0 || p.indexOf("endpoint") >= 0 || p.indexOf("conexão") >= 0 || p.indexOf("conexao") >= 0 || p.indexOf("status real") >= 0) return "openai_status";
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
    if (p.indexOf("listar arquivos") >= 0 || p.indexOf("list files") >= 0) return "list_files";
    if (p.indexOf("arquivo existe") >= 0 || p.indexOf("file exists") >= 0 || p.indexOf("exists ") >= 0) return "file_exists";
    if (p.indexOf("ler arquivo") >= 0 || p.indexOf("read file") >= 0) return "read_file";
    if (p.indexOf("resumir arquivo") >= 0 || p.indexOf("summarize file") >= 0) return "summarize_file";
    if (p.indexOf("inspecionar arquivo") >= 0 || p.indexOf("inspect file") >= 0) return "inspect_file";
    if (p.indexOf("resumir vários") >= 0 || p.indexOf("resumir varios") >= 0 || p.indexOf("summarize many") >= 0) return "summarize_many";
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
      runtime: clone(getRuntimeStatus() || {}),
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

    return uniq(out);
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

    var nextFile = normalizeFilePath(plan.nextFile || plan.targetFile || "");
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

  function resolveRequestedPlanId(input) {
    var req = input && typeof input === "object" ? input : {};
    return trimText(
      safe(function () { return req.planId; }, "") ||
      safe(function () { return req.meta.planId; }, "") ||
      safe(function () { return req.opts.planId; }, "")
    );
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

  function isOpenAIFlowFile(file) {
    var target = normalizeFilePath(file);
    return OPENAI_FLOW_FILES.indexOf(target) >= 0;
  }

  function isStaleBridgePlanForCurrentPhase(plan) {
    if (!plan || !plan.targetFile) return false;

    var runtime = getRuntimeStatus();
    var connected = isRuntimeConnected(runtime);
    var target = normalizeFilePath(plan.targetFile);

    if (connected && isOpenAIFlowFile(target)) return true;
    return false;
  }

  function recalcPlannerNextFile(reasonText) {
    var planner = getPlanner();
    if (!planner) return null;

    try {
      var input = buildDefaultPlanInput({
        reason: reasonText || "actions.recalc",
        prompt: "calcular próximo arquivo real após status atual do runtime/openai"
      });

      var plan = null;

      if (typeof planner.planFromRuntime === "function") {
        plan = planner.planFromRuntime(input);
      } else if (typeof planner.buildPlan === "function") {
        plan = planner.buildPlan(input);
      }

      if (!plan || !plan.targetFile) return null;
      return normalizePlannerPlan(plan);
    } catch (_) {
      return null;
    }
  }

  function buildNextFileSuggestionFromPlan() {
    var runtime = getRuntimeStatus();
    var connected = isRuntimeConnected(runtime);

    var freshPlannerPlan = recalcPlannerNextFile("actions.getNextFileSuggestion");
    var plannerPlan = freshPlannerPlan || getLastPlannerPlanNormalized();
    var bridgePlan = getLastBridgePlanNormalized();

    if (bridgePlan && isStaleBridgePlanForCurrentPhase(bridgePlan)) {
      bridgePlan = null;
    }

    if (plannerPlan && shouldPreferPlannerPlan(plannerPlan, bridgePlan)) {
      return {
        nextFile: normalizeFilePath(plannerPlan.targetFile),
        reason: trimText(plannerPlan.nextStep || plannerPlan.objective || plannerPlan.reason || "Arquivo alvo vindo do planner atual."),
        source: freshPlannerPlan ? "planner.recalculated" : "planner.lastPlan",
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

    if (connected) {
      return {
        nextFile: "/app/js/core/factory_ai_actions.js",
        reason: "OpenAI/runtime já estão conectados; o próximo passo seguro é fortalecer a camada de ações supervisionadas e parar de depender de plano stale do bridge.",
        source: "runtime.connected.fallback",
        risk: "low"
      };
    }

    return {
      nextFile: "/functions/api/admin-ai.js",
      reason: "Sem plano consolidado ainda e sem conexão confirmada; o próximo passo seguro continua sendo consolidar a trilha real do backend OpenAI.",
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

    var requestedPlanId = resolveRequestedPlanId({ meta: clone(meta || {}) });
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
    var requestedPlanId = resolveRequestedPlanId({ meta: clone(meta || {}) });
    var planId = resolveCurrentBridgePlanId(requestedPlanId);

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
    var requestedPlanId = resolveRequestedPlanId({ meta: clone(meta || {}) });
    var planId = resolveCurrentBridgePlanId(requestedPlanId);

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
    var requestedPlanId = resolveRequestedPlanId({ opts: clone(opts || {}) });
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
    var runtime = getRuntime();
    var reader = getReader();

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
      runtimeLayer: {
        ready: !!runtime,
        status: safe(function () { return runtime.status ? runtime.status() : {}; }, {})
      },
      readerLayer: {
        ready: !!reader,
        status: safe(function () { return reader.status ? reader.status() : {}; }, {})
      },
      patchSupervisor: {
        ready: !!supervisor,
        version: safe(function () { return supervisor.version; }, "unknown"),
        status: safe(function () { return supervisor.status ? supervisor.status() : {}; }, {})
      },
      adminFront: {
        lastEndpoint: trimText(safe(function () {
          return global.RCF_FACTORY_AI?.getLastEndpoint?.() || "";
        }, ""))
      },
      nextFile: buildNextFileSuggestionFromPlan()
    };

    markAction("getAutonomySnapshot", {}, result);
    pushLog("OK", "getAutonomySnapshot", {
      plannerReady: result.planner.ready,
      bridgeReady: result.bridge.ready,
      supervisorReady: result.patchSupervisor.ready,
      runtimeReady: result.runtimeLayer.ready,
      readerReady: result.readerLayer.ready
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

  async function getOpenAIStatus(req) {
    var runtimeStatus = getRuntimeStatus();
    var runtime = runtimeStatus;
    var probe = {};
    var connected = isRuntimeConnected(runtimeStatus);

    state.lastRuntimeCall = {
      ts: nowISO(),
      action: "openai_status",
      endpoint: trimText(runtimeStatus.lastEndpoint || ""),
      connected: !!connected
    };
    persist();

    if (!connected && req && req.probe) {
      var runtimeApi = getRuntime();
      if (runtimeApi && typeof runtimeApi.ask === "function") {
        try {
          probe = await runtimeApi.ask({
            action: "chat",
            prompt: "Faça um teste mínimo de conectividade e responda apenas confirmando status de conexão.",
            payload: {
              snapshot: buildRuntimeSnapshot()
            },
            history: [],
            attachments: [],
            source: "factory_ai_actions.openai_status",
            version: VERSION
          }) || {};

          runtime = getRuntimeStatus();
          connected = isRuntimeConnected(runtime);

          state.lastRuntimeCall = {
            ts: nowISO(),
            action: "openai_status_probe",
            endpoint: trimText(runtime.lastEndpoint || ""),
            connected: !!connected
          };
          persist();
        } catch (_) {}
      }
    }

    var result = {
      ok: true,
      runtime: {
        available: !!runtime.available,
        ready: !!runtime.ready,
        lastEndpoint: runtime.lastEndpoint || "",
        lastOk: !!runtime.lastOk,
        connectionStatus: runtime.connectionStatus || "unknown",
        connectionProvider: runtime.connectionProvider || "",
        connectionConfigured: !!runtime.connectionConfigured,
        connectionAttempted: !!runtime.connectionAttempted,
        connectionModel: runtime.connectionModel || "",
        connectionUpstreamStatus: Number(runtime.connectionUpstreamStatus || 0) || 0
      },
      diagnosis: {
        connected: !!connected,
        provider: runtime.connectionProvider || "",
        model: runtime.connectionModel || ""
      },
      probe: clone(probe || {}),
      adminFront: {
        lastEndpoint: safe(function () { return global.RCF_FACTORY_AI.getLastEndpoint(); }, "")
      }
    };

    markAction("getOpenAIStatus", req || {}, result);
    pushLog("OK", "getOpenAIStatus", {
      connected: connected,
      endpoint: runtime.lastEndpoint || ""
    });

    return result;
  }

  async function listFilesAction(req) {
    var reader = getReader();
    if (!reader || typeof reader.listFiles !== "function") {
      var fail = { ok: false, msg: "RCF_FACTORY_AI_READER indisponível." };
      markAction("listFilesAction", req, fail);
      return fail;
    }

    var result = reader.listFiles({
      prefix: trimText(req.prefix || ""),
      contains: trimText(req.contains || ""),
      limit: Math.max(1, Number(req.limit || 120) || 120)
    });

    markAction("listFilesAction", req, result);
    pushLog(result.ok ? "OK" : "WARN", "listFilesAction", { count: result.count || 0 });
    return result;
  }

  async function fileExistsAction(req) {
    var reader = getReader();
    if (!reader || typeof reader.exists !== "function") {
      var fail = { ok: false, msg: "RCF_FACTORY_AI_READER indisponível." };
      markAction("fileExistsAction", req, fail);
      return fail;
    }

    var path = normalizeFilePath(req.path || req.targetFile || req.file || "");
    var result = await reader.exists(path);

    markAction("fileExistsAction", { path: path }, result);
    pushLog(result.ok ? "OK" : "WARN", "fileExistsAction", result);
    return result;
  }

  async function readFileAction(req) {
    var reader = getReader();
    if (!reader || typeof reader.readFile !== "function") {
      var fail = { ok: false, msg: "RCF_FACTORY_AI_READER indisponível." };
      markAction("readFileAction", req, fail);
      return fail;
    }

    var path = normalizeFilePath(req.path || req.targetFile || req.file || "");
    var result = await reader.readFile(path, {
      cache: req.cache !== false,
      limit: Math.max(0, Number(req.limit || 120000) || 120000)
    });

    markAction("readFileAction", { path: path }, result);
    pushLog(result.ok ? "OK" : "WARN", "readFileAction", {
      path: path,
      source: result.source || ""
    });
    return result;
  }

  async function summarizeFileAction(req) {
    var reader = getReader();
    if (!reader || typeof reader.summarizeFile !== "function") {
      var fail = { ok: false, msg: "RCF_FACTORY_AI_READER indisponível." };
      markAction("summarizeFileAction", req, fail);
      return fail;
    }

    var path = normalizeFilePath(req.path || req.targetFile || req.file || "");
    var result = await reader.summarizeFile(path, {
      cache: req.cache !== false
    });

    markAction("summarizeFileAction", { path: path }, result);
    pushLog(result.ok ? "OK" : "WARN", "summarizeFileAction", {
      path: path,
      lines: safe(function () { return result.summary.lines; }, 0)
    });
    return result;
  }

  async function inspectFileAction(req) {
    var reader = getReader();
    if (!reader || typeof reader.inspectTarget !== "function") {
      var fail = { ok: false, msg: "RCF_FACTORY_AI_READER indisponível." };
      markAction("inspectFileAction", req, fail);
      return fail;
    }

    var path = normalizeFilePath(req.path || req.targetFile || req.file || "");
    var result = await reader.inspectTarget(path, {
      cache: req.cache !== false
    });

    markAction("inspectFileAction", { path: path }, result);
    pushLog(result.ok ? "OK" : "WARN", "inspectFileAction", {
      path: path,
      apiSurfaceCount: safe(function () { return result.summary.apiSurface.length; }, 0)
    });
    return result;
  }

  async function summarizeManyAction(req) {
    var reader = getReader();
    if (!reader || typeof reader.summarizeMany !== "function") {
      var fail = { ok: false, msg: "RCF_FACTORY_AI_READER indisponível." };
      markAction("summarizeManyAction", req, fail);
      return fail;
    }

    var paths = asArray(req.paths)
      .concat(asArray(req.files))
      .map(normalizeFilePath)
      .filter(Boolean);

    if (!paths.length) {
      paths = getCandidateFilesFromContext().slice(0, 6);
    }

    var result = await reader.summarizeMany(paths, {
      limit: Math.max(1, Number(req.limit || 6) || 6),
      cache: req.cache !== false
    });

    markAction("summarizeManyAction", { paths: paths.slice(0, 12) }, result);
    pushLog(result.ok ? "OK" : "WARN", "summarizeManyAction", {
      count: result.count || 0
    });
    return result;
  }

  async function dispatch(input) {
    var req = (input && typeof input === "object")
      ? clone(input)
      : { prompt: String(input || "") };

    var action = trimText(req.action || "");
    var prompt = trimText(req.prompt || "");
    var intent = action || detectIntent(prompt);
    var requestedPlanId = resolveRequestedPlanId(req);

    if (intent === "plan") return planFromCurrentRuntime(req);
    if (intent === "openai_status") return getOpenAIStatus(req);
    if (intent === "approve_patch") {
      return approveLastPlan(merge(clone(req.meta || {}), requestedPlanId ? { planId: requestedPlanId } : {}));
    }
    if (intent === "validate_patch") {
      return validateLastApprovedPlan(merge(clone(req.meta || {}), requestedPlanId ? { planId: requestedPlanId } : {}));
    }
    if (intent === "stage_patch") {
      return stageLastApprovedPlan(merge(clone(req.meta || {}), requestedPlanId ? { planId: requestedPlanId } : {}));
    }
    if (intent === "apply_patch") {
      return applyLastApprovedPlan(merge(clone(req.opts || {}), requestedPlanId ? { planId: requestedPlanId } : {}));
    }
    if (intent === "run_doctor") return runDoctor();
    if (intent === "collect_logs") return collectLogs(req.limit || 30);
    if (intent === "snapshot" || intent === "autonomy") return getAutonomySnapshot();
    if (intent === "next_file") return getNextFileSuggestion();
    if (intent === "list_files") return listFilesAction(req);
    if (intent === "file_exists") return fileExistsAction(req);
    if (intent === "read_file") return readFileAction(req);
    if (intent === "summarize_file") return summarizeFileAction(req);
    if (intent === "inspect_file") return inspectFileAction(req);
    if (intent === "summarize_many") return summarizeManyAction(req);

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

    try {
      if (global.RCF_FACTORY_STATE?.refreshRuntime) {
        global.RCF_FACTORY_STATE.refreshRuntime();
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
      runtimeReady: !!(getRuntimeStatus().ready),
      readerReady: !!getReader(),
      lastRuntimeCall: clone(state.lastRuntimeCall || null),
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
    __v113: true,
    __v114: true,
    __v120: true,
    version: VERSION,
    init: init,
    status: status,
    dispatch: dispatch,
    planFromCurrentRuntime: planFromCurrentRuntime,
    getOpenAIStatus: getOpenAIStatus,
    approveLastPlan: approveLastPlan,
    validateLastApprovedPlan: validateLastApprovedPlan,
    stageLastApprovedPlan: stageLastApprovedPlan,
    applyLastApprovedPlan: applyLastApprovedPlan,
    runDoctor: runDoctor,
    collectLogs: collectLogs,
    getAutonomySnapshot: getAutonomySnapshot,
    getNextFileSuggestion: getNextFileSuggestion,
    listFilesAction: listFilesAction,
    fileExistsAction: fileExistsAction,
    readFileAction: readFileAction,
    summarizeFileAction: summarizeFileAction,
    inspectFileAction: inspectFileAction,
    summarizeManyAction: summarizeManyAction,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

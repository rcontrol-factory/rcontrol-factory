/* FILE: /app/js/core/factory_ai_runtime.js
   RControl Factory — Factory AI Runtime
   v1.0.1 SUPERVISED RUNTIME + SAFE FLOW

   Objetivo:
   - ligar Factory AI -> API -> bridge -> actions -> patch_supervisor
   - centralizar o fluxo supervisionado da IA dentro da Factory
   - receber resposta da IA e publicar eventos operacionais
   - transformar resposta textual em plano via factory_ai_bridge
   - permitir execução SOMENTE após aprovação humana
   - não aplicar patch automaticamente sem aprovação
   - funcionar como script clássico

   PATCH v1.0.1:
   - FIX: remove dependência de APIs inexistentes (ingestPlan/setPlan/executePlan/queuePlan)
   - FIX: usa bridge.fromText() como caminho principal de ingestão
   - FIX: não consome plano antes da hora
   - FIX: expõe wrappers seguros approve -> validate -> stage -> apply
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_RUNTIME && global.RCF_FACTORY_AI_RUNTIME.__v101) return;

  var VERSION = "v1.0.1";
  var STORAGE_KEY = "rcf:factory_ai_runtime";
  var LAST_RESPONSE_KEY = "rcf:factory_ai_runtime_last_response";
  var MAX_HISTORY = 60;

  var state = {
    version: VERSION,
    ready: false,
    busy: false,
    lastUpdate: null,
    lastAction: "",
    lastPrompt: "",
    lastResponse: null,
    lastPlanId: "",
    lastApprovedPlanId: "",
    lastExecution: null,
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

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
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

  function log(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_RUNTIME] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_RUNTIME] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_RUNTIME]", level, msg, extra || ""); } catch (_) {}
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

  function rememberHistory(entry) {
    if (!entry || typeof entry !== "object") return;
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function normalizeAction(value, prompt) {
    var raw = trimText(value).toLowerCase();
    var p = trimText(prompt).toLowerCase();

    if (raw) return raw;

    if (!p) return "chat";
    if (p.indexOf("diagnóstico") >= 0 || p.indexOf("diagnostico") >= 0 || p.indexOf("doctor") >= 0) return "factory_diagnosis";
    if (p.indexOf("log") >= 0 || p.indexOf("erro") >= 0 || p.indexOf("falha") >= 0) return "analyze-logs";
    if (p.indexOf("arquitetura") >= 0 || p.indexOf("estrutura") >= 0) return "analyze-architecture";
    if (p.indexOf("patch") >= 0 || p.indexOf("corrig") >= 0 || p.indexOf("ajust") >= 0) return "propose-patch";
    if (p.indexOf("código completo") >= 0 || p.indexOf("codigo completo") >= 0 || p.indexOf("arquivo completo") >= 0) return "generate-code";
    return "chat";
  }

  function getFactorySnapshot() {
    try {
      if (global.RCF_CONTEXT?.getSnapshot) {
        var snap = global.RCF_CONTEXT.getSnapshot();
        if (snap && typeof snap === "object") return clone(snap);
      }
    } catch (_) {}

    try {
      if (global.RCF_CONTEXT?.getContext) {
        var ctx = global.RCF_CONTEXT.getContext();
        if (ctx && typeof ctx === "object") return clone(ctx);
      }
    } catch (_) {}

    return {};
  }

  function getHistoryFromFactoryAI() {
    try {
      var api = global.RCF_FACTORY_AI || global.RCF_FACTORY_IA || null;
      if (api && typeof api.getHistory === "function") {
        var hist = api.getHistory();
        if (Array.isArray(hist)) return clone(hist).slice(-12);
      }
    } catch (_) {}
    return [];
  }

  function getAttachmentsFromFactoryAI() {
    try {
      var api = global.RCF_FACTORY_AI || global.RCF_FACTORY_IA || null;
      if (api && typeof api.getAttachments === "function") {
        var at = api.getAttachments();
        if (Array.isArray(at)) return clone(at).slice(0, 12);
      }
    } catch (_) {}
    return [];
  }

  function getBackendUrl() {
    return "/api/admin-ai";
  }

  function getBridge() {
    return safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
  }

  function getActions() {
    return safe(function () { return global.RCF_FACTORY_AI_ACTIONS || null; }, null);
  }

  function getPatchSupervisor() {
    return safe(function () { return global.RCF_PATCH_SUPERVISOR || null; }, null);
  }

  function buildRequest(input) {
    var prompt = trimText(safe(function () { return input.prompt; }, ""));
    var action = normalizeAction(safe(function () { return input.action; }, ""), prompt);

    return {
      action: action,
      prompt: prompt,
      payload: safe(function () { return input.payload; }, null) || {
        snapshot: getFactorySnapshot()
      },
      history: Array.isArray(input.history) ? clone(input.history).slice(-12) : getHistoryFromFactoryAI(),
      attachments: Array.isArray(input.attachments) ? clone(input.attachments).slice(0, 12) : getAttachmentsFromFactoryAI(),
      source: trimText(safe(function () { return input.source; }, "")) || "factory-ai-runtime",
      version: VERSION
    };
  }

  async function postJSON(url, body) {
    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    var data = await res.json().catch(function () { return {}; });
    return { res: res, data: data };
  }

  function saveLastResponse(responseObj) {
    try {
      localStorage.setItem(LAST_RESPONSE_KEY, JSON.stringify(responseObj || {}));
    } catch (_) {}
  }

  function syncRuntimeModules() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIRuntime");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIRuntime", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIRuntime");
      } else if (global.RCF_MODULE_REGISTRY?.refresh) {
        global.RCF_MODULE_REGISTRY.refresh();
      }
    } catch (_) {}

    try {
      if (global.RCF_FACTORY_STATE?.refreshRuntime) {
        global.RCF_FACTORY_STATE.refreshRuntime();
      }
    } catch (_) {}
  }

  function ingestToBridge(responseObj) {
    var bridge = getBridge();
    if (!bridge) return null;

    try {
      if (typeof bridge.ingestResponse === "function") {
        var planA = bridge.ingestResponse(responseObj || {});
        state.lastPlanId = trimText(safe(function () { return planA.id; }, ""));
        persist();
        return planA || null;
      }

      if (typeof bridge.fromText === "function") {
        var analysisText = trimText(safe(function () { return responseObj.analysis; }, ""));
        if (!analysisText) return null;

        var planB = bridge.fromText(analysisText, {
          source: "factory_ai_runtime.ask",
          response: clone(responseObj || {})
        });

        state.lastPlanId = trimText(safe(function () { return planB.id; }, ""));
        persist();
        return planB || null;
      }
    } catch (e) {
      log("ERR", "bridge ingest error", String(e && e.message || e));
    }

    return null;
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      lastUpdate: state.lastUpdate || null,
      lastAction: state.lastAction || "",
      lastPrompt: state.lastPrompt || "",
      lastPlanId: state.lastPlanId || "",
      lastApprovedPlanId: state.lastApprovedPlanId || "",
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  async function ask(input) {
    if (state.busy) {
      return {
        ok: false,
        error: "Factory AI Runtime busy."
      };
    }

    var req = buildRequest(input || {});
    if (!req.prompt) {
      return {
        ok: false,
        error: "Prompt vazio."
      };
    }

    state.busy = true;
    state.lastAction = req.action;
    state.lastPrompt = req.prompt;
    persist();

    emit("RCF:FACTORY_AI_RUNTIME_START", {
      action: req.action,
      prompt: req.prompt
    });

    try {
      var result = await postJSON(getBackendUrl(), req);
      var res = result.res;
      var data = result.data || {};

      if (!res.ok || !data.ok) {
        var errPayload = {
          ok: false,
          action: req.action,
          prompt: req.prompt,
          response: clone(data || {}),
          status: safe(function () { return res.status; }, 0) || 0
        };

        state.lastResponse = clone(errPayload);
        rememberHistory({
          ts: nowISO(),
          kind: "error",
          action: req.action,
          prompt: req.prompt,
          status: errPayload.status
        });
        persist();

        emit("RCF:FACTORY_AI_RUNTIME_ERROR", errPayload);
        log("ERR", "ask fail", { action: req.action, status: errPayload.status });

        return errPayload;
      }

      var responseObj = {
        ok: true,
        action: req.action,
        prompt: req.prompt,
        analysis: trimText(data.analysis || data.answer || data.result || ""),
        raw: clone(data.raw || data),
        source: trimText(data.source || req.source),
        version: trimText(data.version || VERSION),
        ts: nowISO()
      };

      state.lastResponse = clone(responseObj);
      saveLastResponse(responseObj);

      emit("RCF:FACTORY_AI_RESPONSE", clone(responseObj));

      var plan = ingestToBridge(responseObj);

      rememberHistory({
        ts: nowISO(),
        kind: "response",
        action: req.action,
        prompt: req.prompt,
        planId: trimText(safe(function () { return plan.id; }, "")),
        targetFile: trimText(safe(function () { return plan.targetFile; }, "")),
        risk: trimText(safe(function () { return plan.risk; }, "unknown"))
      });

      persist();
      emit("RCF:FACTORY_AI_RUNTIME_DONE", {
        action: req.action,
        prompt: req.prompt,
        planId: trimText(safe(function () { return plan.id; }, "")),
        response: clone(responseObj)
      });

      log("OK", "ask ok", {
        action: req.action,
        planId: trimText(safe(function () { return plan.id; }, ""))
      });

      return {
        ok: true,
        action: req.action,
        response: clone(responseObj),
        plan: clone(plan || null)
      };
    } catch (e) {
      var msg = String(e && e.message || e || "Erro interno");
      state.lastResponse = {
        ok: false,
        error: msg,
        action: req.action,
        prompt: req.prompt,
        ts: nowISO()
      };

      rememberHistory({
        ts: nowISO(),
        kind: "exception",
        action: req.action,
        prompt: req.prompt,
        error: msg
      });

      persist();
      emit("RCF:FACTORY_AI_RUNTIME_ERROR", clone(state.lastResponse));
      log("ERR", "ask exception", msg);

      return clone(state.lastResponse);
    } finally {
      state.busy = false;
      persist();
    }
  }

  function getLastResponse() {
    if (state.lastResponse) return clone(state.lastResponse);
    return safeParse(localStorage.getItem(LAST_RESPONSE_KEY), null);
  }

  function getPendingPlan() {
    try {
      var bridge = getBridge();
      if (!bridge) return null;

      if (typeof bridge.getPendingPlan === "function") {
        return clone(bridge.getPendingPlan() || null);
      }

      if (typeof bridge.getLastPlan === "function") {
        var plan = bridge.getLastPlan();
        if (plan && typeof plan === "object" && trimText(plan.approvalStatus || "") !== "approved") {
          return clone(plan);
        }
      }
    } catch (_) {}

    return null;
  }

  function getApprovedPlan() {
    try {
      var bridge = getBridge();
      if (!bridge || typeof bridge.getLastPlan !== "function") return null;
      var plan = bridge.getLastPlan();
      if (!plan || typeof plan !== "object") return null;
      if (trimText(plan.approvalStatus || "") !== "approved") return null;
      return clone(plan);
    } catch (_) {
      return null;
    }
  }

  function getCurrentPlanId() {
    var approved = getApprovedPlan();
    if (approved && approved.id) return trimText(approved.id);

    var pending = getPendingPlan();
    if (pending && pending.id) return trimText(pending.id);

    return "";
  }

  async function approvePlan(planId, meta) {
    var bridge = getBridge();
    if (!bridge || typeof bridge.approvePlan !== "function") {
      return { ok: false, error: "RCF_FACTORY_AI_BRIDGE indisponível." };
    }

    var targetPlanId = trimText(planId || getCurrentPlanId());
    if (!targetPlanId) {
      return { ok: false, error: "Nenhum plano disponível para aprovação." };
    }

    try {
      var result = bridge.approvePlan(targetPlanId, meta || {});
      if (result && result.ok) {
        state.lastApprovedPlanId = targetPlanId;
        persist();
      }
      return clone(result || { ok: false, error: "Falha ao aprovar plano." });
    } catch (e) {
      return { ok: false, error: String(e && e.message || e || "erro ao aprovar plano") };
    }
  }

  async function validateApprovedPlan(planId) {
    var supervisor = getPatchSupervisor();
    var targetPlanId = trimText(planId || state.lastApprovedPlanId || getCurrentPlanId());

    if (!supervisor || typeof supervisor.validateApprovedPlan !== "function") {
      return { ok: false, error: "RCF_PATCH_SUPERVISOR indisponível." };
    }

    if (!targetPlanId) {
      return { ok: false, error: "Nenhum plano aprovado disponível para validação." };
    }

    try {
      return clone(supervisor.validateApprovedPlan(targetPlanId) || { ok: false, error: "Falha ao validar plano." });
    } catch (e) {
      return { ok: false, error: String(e && e.message || e || "erro ao validar plano") };
    }
  }

  async function stageApprovedPlan(planId) {
    var supervisor = getPatchSupervisor();
    var targetPlanId = trimText(planId || state.lastApprovedPlanId || getCurrentPlanId());

    if (!supervisor || typeof supervisor.stageApprovedPlan !== "function") {
      return { ok: false, error: "RCF_PATCH_SUPERVISOR indisponível." };
    }

    if (!targetPlanId) {
      return { ok: false, error: "Nenhum plano aprovado disponível para stage." };
    }

    try {
      return clone(await supervisor.stageApprovedPlan(targetPlanId));
    } catch (e) {
      return { ok: false, error: String(e && e.message || e || "erro ao fazer stage do plano") };
    }
  }

  async function applyApprovedPlan(planId, opts) {
    var supervisor = getPatchSupervisor();
    var targetPlanId = trimText(planId || state.lastApprovedPlanId || getCurrentPlanId());

    if (!supervisor || typeof supervisor.applyApprovedPlan !== "function") {
      return { ok: false, error: "RCF_PATCH_SUPERVISOR indisponível." };
    }

    if (!targetPlanId) {
      return { ok: false, error: "Nenhum plano aprovado disponível para apply." };
    }

    try {
      var result = await supervisor.applyApprovedPlan(targetPlanId, opts || {});
      if (result && result.ok) {
        state.lastExecution = {
          ts: nowISO(),
          planId: targetPlanId,
          targetFile: trimText(result.targetFile || ""),
          mode: trimText(result.mode || ""),
          risk: trimText(result.risk || "unknown")
        };
        persist();
      }
      return clone(result || { ok: false, error: "Falha ao aplicar plano." });
    } catch (e) {
      return { ok: false, error: String(e && e.message || e || "erro ao aplicar plano") };
    }
  }

  async function approveValidateStage(planId, meta) {
    var approved = await approvePlan(planId, meta || {});
    if (!approved || !approved.ok) return approved;

    var validated = await validateApprovedPlan(planId);
    if (!validated || !validated.ok) return validated;

    return stageApprovedPlan(planId);
  }

  function bindEvents() {
    try {
      global.addEventListener("RCF:FACTORY_AI_APPROVED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          state.lastApprovedPlanId = trimText(detail.planId || "");
          persist();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:UI_READY", function () {
        try { syncRuntimeModules(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.version = VERSION;
    state.ready = true;
    state.lastUpdate = nowISO();
    persist();
    syncRuntimeModules();
    bindEvents();
    log("OK", "factory_ai_runtime ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_RUNTIME = {
    __v100: true,
    __v101: true,
    version: VERSION,
    init: init,
    status: status,
    ask: ask,
    getLastResponse: getLastResponse,
    getPendingPlan: getPendingPlan,
    getApprovedPlan: getApprovedPlan,
    approvePlan: approvePlan,
    validateApprovedPlan: validateApprovedPlan,
    stageApprovedPlan: stageApprovedPlan,
    applyApprovedPlan: applyApprovedPlan,
    approveValidateStage: approveValidateStage
  };

  try { init(); } catch (_) {}

})(window);

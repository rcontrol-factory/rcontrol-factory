/* FILE: /app/js/core/factory_ai_runtime.js
   RControl Factory — Factory AI Runtime
   v1.0.0 SUPERVISED RUNTIME

   Objetivo:
   - ligar Factory AI -> API -> bridge -> actions -> patch_supervisor
   - centralizar o fluxo supervisionado da IA dentro da Factory
   - receber resposta da IA e publicar eventos operacionais
   - transformar resposta textual em plano via factory_ai_bridge
   - permitir execução SOMENTE após aprovação humana
   - não aplicar patch automaticamente sem aprovação
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_RUNTIME && global.RCF_FACTORY_AI_RUNTIME.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_runtime";
  var LAST_RESPONSE_KEY = "rcf:factory_ai_runtime_last_response";

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
      return true;
    } catch (_) {
      return false;
    }
  }

  function rememberHistory(entry) {
    if (!entry || typeof entry !== "object") return;
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry));
    if (state.history.length > 60) {
      state.history = state.history.slice(-60);
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
    try {
      if (global.RCF_FACTORY_AI_BRIDGE?.ingestResponse) {
        var plan = global.RCF_FACTORY_AI_BRIDGE.ingestResponse(responseObj || {});
        state.lastPlanId = trimText(safe(function () { return plan.id; }, ""));
        persist();
        return plan || null;
      }
    } catch (e) {
      log("ERR", "bridge ingest error", String(e && e.message || e));
    }
    return null;
  }

  function sendToActions(plan) {
    try {
      if (global.RCF_FACTORY_AI_ACTIONS?.ingestPlan) {
        return global.RCF_FACTORY_AI_ACTIONS.ingestPlan(plan || null);
      }
      if (global.RCF_FACTORY_AI_ACTIONS?.setPlan) {
        return global.RCF_FACTORY_AI_ACTIONS.setPlan(plan || null);
      }
    } catch (e) {
      log("ERR", "actions ingest error", String(e && e.message || e));
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
      if (plan) {
        sendToActions(plan);
      }

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
      if (global.RCF_FACTORY_AI_BRIDGE?.getPendingPlan) {
        return clone(global.RCF_FACTORY_AI_BRIDGE.getPendingPlan() || null);
      }
    } catch (_) {}
    return null;
  }

  function getApprovedPlan() {
    try {
      var bridge = global.RCF_FACTORY_AI_BRIDGE;
      if (!bridge || !bridge.getLastPlan) return null;
      var plan = bridge.getLastPlan();
      if (!plan || typeof plan !== "object") return null;
      if (plan.approvalStatus !== "approved") return null;
      return clone(plan);
    } catch (_) {
      return null;
    }
  }

  async function executeApprovedPlan(planId) {
    var bridge = global.RCF_FACTORY_AI_BRIDGE || null;
    if (!bridge || typeof bridge.consumeApprovedPlan !== "function") {
      return { ok: false, error: "RCF_FACTORY_AI_BRIDGE indisponível." };
    }

    var consumed = bridge.consumeApprovedPlan(planId);
    if (!consumed || !consumed.ok || !consumed.plan) {
      return { ok: false, error: trimText(safe(function () { return consumed.msg; }, "")) || "Plano não aprovado." };
    }

    var plan = clone(consumed.plan);
    state.lastApprovedPlanId = trimText(plan.id || "");
    state.lastExecution = {
      ts: nowISO(),
      planId: trimText(plan.id || ""),
      targetFile: trimText(plan.targetFile || ""),
      mode: trimText(plan.mode || ""),
      risk: trimText(plan.risk || "unknown")
    };
    persist();

    emit("RCF:FACTORY_AI_EXECUTION_REQUEST", {
      plan: clone(plan)
    });

    try {
      if (global.RCF_PATCH_SUPERVISOR?.queuePlan) {
        var queued = global.RCF_PATCH_SUPERVISOR.queuePlan(plan);
        emit("RCF:FACTORY_AI_EXECUTION_QUEUED", {
          planId: trimText(plan.id || ""),
          targetFile: trimText(plan.targetFile || ""),
          result: clone(queued || {})
        });
        log("OK", "plan queued to patch_supervisor", {
          planId: trimText(plan.id || ""),
          targetFile: trimText(plan.targetFile || "")
        });
        return { ok: true, mode: "queuePlan", plan: plan, result: clone(queued || {}) };
      }

      if (global.RCF_FACTORY_AI_ACTIONS?.executePlan) {
        var executed = await global.RCF_FACTORY_AI_ACTIONS.executePlan(plan);
        emit("RCF:FACTORY_AI_EXECUTION_DONE", {
          planId: trimText(plan.id || ""),
          targetFile: trimText(plan.targetFile || ""),
          result: clone(executed || {})
        });
        log("OK", "plan executed by actions", {
          planId: trimText(plan.id || ""),
          targetFile: trimText(plan.targetFile || "")
        });
        return { ok: true, mode: "actions.executePlan", plan: plan, result: clone(executed || {}) };
      }

      emit("RCF:FACTORY_AI_EXECUTION_PENDING", {
        planId: trimText(plan.id || ""),
        targetFile: trimText(plan.targetFile || "")
      });

      log("WARN", "approved plan ready but no executor found", {
        planId: trimText(plan.id || ""),
        targetFile: trimText(plan.targetFile || "")
      });

      return { ok: true, mode: "pending", plan: plan };
    } catch (e) {
      var msg = String(e && e.message || e || "erro ao executar plano");
      emit("RCF:FACTORY_AI_EXECUTION_ERROR", {
        planId: trimText(plan.id || ""),
        error: msg
      });
      log("ERR", "executeApprovedPlan error", msg);
      return { ok: false, error: msg, plan: plan };
    }
  }

  function approveAndExecute(planId) {
    try {
      var bridge = global.RCF_FACTORY_AI_BRIDGE || null;
      if (!bridge || typeof bridge.approvePlan !== "function") {
        return Promise.resolve({ ok: false, error: "RCF_FACTORY_AI_BRIDGE indisponível." });
      }

      var approved = bridge.approvePlan(planId);
      if (!approved || !approved.ok) {
        return Promise.resolve({
          ok: false,
          error: trimText(safe(function () { return approved.msg; }, "")) || "Falha ao aprovar plano."
        });
      }

      return executeApprovedPlan(planId);
    } catch (e) {
      return Promise.resolve({ ok: false, error: String(e && e.message || e || "erro") });
    }
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
    version: VERSION,
    init: init,
    status: status,
    ask: ask,
    getLastResponse: getLastResponse,
    getPendingPlan: getPendingPlan,
    getApprovedPlan: getApprovedPlan,
    executeApprovedPlan: executeApprovedPlan,
    approveAndExecute: approveAndExecute
  };

  try { init(); } catch (_) {}

})(window);

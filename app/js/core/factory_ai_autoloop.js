/* FILE: /app/js/core/factory_ai_autoloop.js
   RControl Factory — Factory AI AutoLoop
   v1.0.0 SUPERVISED AUTO EVOLUTION LOOP

   Objetivo:
   - criar laço supervisionado de autoevolução da Factory AI
   - rodar análise periódica local
   - gerar proposta de plano automático em intervalo controlado
   - registrar memória operacional da autoevolução
   - respeitar fase ativa da Factory
   - NUNCA aplicar patch automático sem aprovação explícita
   - preparar base para futuro fluxo approve -> validate -> stage -> apply
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_AUTOLOOP && global.RCF_FACTORY_AI_AUTOLOOP.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_autoloop";
  var DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
  var MIN_INTERVAL_MS = 60 * 1000;
  var MAX_HISTORY = 80;

  var state = {
    version: VERSION,
    ready: false,
    enabled: false,
    running: false,
    intervalMs: DEFAULT_INTERVAL_MS,
    timerId: null,
    lastUpdate: null,
    lastRunAt: null,
    lastPlanId: "",
    lastTargetFile: "",
    lastReason: "",
    lastStatus: "idle",
    lastError: "",
    lastPhaseId: "",
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

  function normalizePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function normalizeInterval(ms) {
    var n = Number(ms || DEFAULT_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
    if (n < MIN_INTERVAL_MS) n = MIN_INTERVAL_MS;
    return n;
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        enabled: !!state.enabled,
        intervalMs: state.intervalMs,
        lastUpdate: state.lastUpdate,
        lastRunAt: state.lastRunAt,
        lastPlanId: state.lastPlanId,
        lastTargetFile: state.lastTargetFile,
        lastReason: state.lastReason,
        lastStatus: state.lastStatus,
        lastError: state.lastError,
        lastPhaseId: state.lastPhaseId,
        history: clone(state.history || [])
      }));
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
      state.enabled = !!parsed.enabled;
      state.intervalMs = normalizeInterval(parsed.intervalMs);
      state.lastUpdate = parsed.lastUpdate || null;
      state.lastRunAt = parsed.lastRunAt || null;
      state.lastPlanId = trimText(parsed.lastPlanId || "");
      state.lastTargetFile = normalizePath(parsed.lastTargetFile || "");
      state.lastReason = trimText(parsed.lastReason || "");
      state.lastStatus = trimText(parsed.lastStatus || "idle");
      state.lastError = trimText(parsed.lastError || "");
      state.lastPhaseId = trimText(parsed.lastPhaseId || "");
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];
      state.timerId = null;
      state.running = false;

      return true;
    } catch (_) {
      return false;
    }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_AUTOLOOP] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_AUTOLOOP] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_AUTOLOOP]", level, msg, extra || ""); } catch (_) {}
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

  function getPlanner() {
    return safe(function () { return global.RCF_FACTORY_AI_PLANNER || null; }, null);
  }

  function getActions() {
    return safe(function () { return global.RCF_FACTORY_AI_ACTIONS || null; }, null);
  }

  function getMemory() {
    return safe(function () { return global.RCF_FACTORY_AI_MEMORY || null; }, null);
  }

  function getPhaseEngine() {
    return safe(function () { return global.RCF_FACTORY_PHASE_ENGINE || null; }, null);
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

  function getPhaseContext() {
    var phase = getPhaseEngine();
    if (!phase || typeof phase.buildPhaseContext !== "function") {
      return {
        activePhaseId: "",
        activePhaseTitle: "",
        activePhase: null,
        recommendedTargets: []
      };
    }

    var ctx = safe(function () { return phase.buildPhaseContext(); }, {}) || {};
    return {
      activePhaseId: trimText(safe(function () { return ctx.activePhase.id; }, "")),
      activePhaseTitle: trimText(safe(function () { return ctx.activePhase.title; }, "")),
      activePhase: clone(safe(function () { return ctx.activePhase; }, null)),
      recommendedTargets: clone(safe(function () { return ctx.recommendedTargets; }, []))
    };
  }

  function getMemoryContext() {
    var memory = getMemory();
    if (!memory || typeof memory.buildMemoryContext !== "function") {
      return {
        ok: false,
        msg: "memory indisponível",
        items: [],
        avoidFiles: [],
        phase: null
      };
    }

    return clone(memory.buildMemoryContext(20) || {});
  }

  function buildAutoPrompt() {
    var phase = getPhaseContext();
    var memory = getMemoryContext();
    var factoryState = getFactoryState();
    var modules = getModuleSummary();

    var activeView = trimText(safe(function () { return factoryState.activeView; }, ""));
    var bootStatus = trimText(safe(function () { return factoryState.bootStatus; }, ""));
    var activeModules = Array.isArray(modules.active) ? modules.active.slice(0, 20) : [];

    return [
      "Autoevolução supervisionada da Factory AI.",
      "Objetivo atual: priorizar evolução da própria Factory AI sem quebrar a Factory.",
      phase.activePhaseTitle ? ("Fase ativa: " + phase.activePhaseTitle + " (" + phase.activePhaseId + ").") : "Fase ativa: dado ausente.",
      bootStatus ? ("Boot status: " + bootStatus + ".") : "Boot status: dado ausente.",
      activeView ? ("View ativa: " + activeView + ".") : "View ativa: dado ausente.",
      activeModules.length ? ("Módulos ativos: " + activeModules.join(", ") + ".") : "Módulos ativos: dado ausente.",
      Array.isArray(phase.recommendedTargets) && phase.recommendedTargets.length
        ? ("Arquivos recomendados pela fase: " + phase.recommendedTargets.join(", ") + ".")
        : "Arquivos recomendados pela fase: dado ausente.",
      Array.isArray(memory.avoidFiles) && memory.avoidFiles.length
        ? ("Evitar por agora: " + memory.avoidFiles.map(function (x) { return x.file; }).join(", ") + ".")
        : "Evitar por agora: nenhum arquivo bloqueado pela memória.",
      "Gerar próximo plano supervisionado com patch mínimo e seguro.",
      "Não retornar doctor/state/registry/tree como padrão se a meta for evolução cognitiva da Factory AI."
    ].join(" ");
  }

  function rememberRun(result) {
    var plan = clone(result && result.plan || {});
    var targetFile = normalizePath(plan.targetFile || plan.nextFile || "");
    var planId = trimText(plan.id || "");
    var reason = trimText(plan.nextStep || plan.reason || "");
    var phase = getPhaseContext();

    state.lastRunAt = nowISO();
    state.lastPlanId = planId;
    state.lastTargetFile = targetFile;
    state.lastReason = reason;
    state.lastStatus = result && result.ok ? "planned" : "failed";
    state.lastError = result && result.ok ? "" : trimText(result && result.msg || "falha");
    state.lastPhaseId = trimText(phase.activePhaseId || "");
    persist();

    pushHistory({
      type: result && result.ok ? "autoloop-plan" : "autoloop-fail",
      ts: nowISO(),
      planId: planId,
      targetFile: targetFile,
      phaseId: state.lastPhaseId,
      ok: !!(result && result.ok),
      reason: reason || state.lastError
    });
  }

  function rememberIntoMemory(result) {
    var memory = getMemory();
    if (!memory) return false;

    var plan = clone(result && result.plan || {});
    var phase = getPhaseContext();

    try {
      if (result && result.ok && typeof memory.rememberDecision === "function") {
        memory.rememberDecision({
          title: "AutoLoop gerou novo plano",
          summary: trimText(plan.nextStep || plan.reason || "Autoevolução supervisionada gerou novo plano."),
          targetFile: normalizePath(plan.targetFile || plan.nextFile || ""),
          risk: trimText(plan.risk || plan.priority || ""),
          tags: [
            "autoloop",
            "self-evolution",
            trimText(phase.activePhaseId || "")
          ].filter(Boolean),
          source: "factory_ai_autoloop",
          planId: trimText(plan.id || ""),
          approvalStatus: trimText(plan.approvalStatus || "pending"),
          meta: {
            phase: clone(phase),
            suggestedFiles: clone(plan.suggestedFiles || plan.executionLine || []),
            priority: trimText(plan.priority || ""),
            objective: trimText(plan.objective || "")
          }
        });
        return true;
      }

      if (!result || !result.ok) {
        if (typeof memory.rememberError === "function") {
          memory.rememberError({
            title: "Falha no AutoLoop",
            summary: trimText(result && result.msg || "Falha ao gerar autoevolução supervisionada."),
            tags: ["autoloop", "error"],
            source: "factory_ai_autoloop",
            meta: {
              phase: clone(phase),
              raw: clone(result || {})
            }
          });
          return true;
        }
      }
    } catch (_) {}

    return false;
  }

  async function runCycle(meta) {
    if (state.running) {
      return { ok: false, msg: "autoloop já em execução" };
    }

    state.running = true;
    state.lastStatus = "running";
    state.lastError = "";
    persist();

    emit("RCF:FACTORY_AI_AUTOLOOP_RUN_START", {
      ts: nowISO(),
      meta: clone(meta || {})
    });

    var actions = getActions();
    var planner = getPlanner();

    try {
      if (!actions || typeof actions.planFromCurrentRuntime !== "function") {
        if (!planner || (typeof planner.planFromRuntime !== "function" && typeof planner.buildPlan !== "function")) {
          var failNoApi = { ok: false, msg: "planner/actions indisponíveis para autoloop" };
          rememberRun(failNoApi);
          rememberIntoMemory(failNoApi);
          emit("RCF:FACTORY_AI_AUTOLOOP_RUN_END", {
            ok: false,
            result: clone(failNoApi)
          });
          return failNoApi;
        }
      }

      var req = {
        prompt: buildAutoPrompt(),
        reason: trimText(safe(function () { return meta.reason; }, "")) || "factory_ai_autoloop.interval",
        source: "factory_ai_autoloop",
        autoLoop: true,
        phase: clone(getPhaseContext()),
        memory: clone(getMemoryContext())
      };

      var result = null;

      if (actions && typeof actions.planFromCurrentRuntime === "function") {
        result = await actions.planFromCurrentRuntime(req);
      } else if (planner && typeof planner.planFromRuntime === "function") {
        result = {
          ok: true,
          plan: planner.planFromRuntime(req)
        };
      } else if (planner && typeof planner.buildPlan === "function") {
        result = {
          ok: true,
          plan: planner.buildPlan(req)
        };
      }

      if (!result || !result.ok) {
        var fail = clone(result || { ok: false, msg: "autoloop sem resultado válido" });
        rememberRun(fail);
        rememberIntoMemory(fail);
        emit("RCF:FACTORY_AI_AUTOLOOP_RUN_END", {
          ok: false,
          result: clone(fail)
        });
        pushLog("WARN", "runCycle falhou", fail);
        return fail;
      }

      rememberRun(result);
      rememberIntoMemory(result);

      emit("RCF:FACTORY_AI_AUTOLOOP_RUN_END", {
        ok: true,
        result: clone(result)
      });

      pushLog("OK", "runCycle ✅", {
        planId: trimText(safe(function () { return result.plan.id; }, "")),
        targetFile: normalizePath(safe(function () { return result.plan.targetFile || result.plan.nextFile; }, "")),
        phaseId: state.lastPhaseId
      });

      return clone(result);
    } catch (e) {
      var failErr = {
        ok: false,
        msg: String(e && e.message || e || "falha no autoloop")
      };

      rememberRun(failErr);
      rememberIntoMemory(failErr);

      emit("RCF:FACTORY_AI_AUTOLOOP_RUN_END", {
        ok: false,
        result: clone(failErr)
      });

      pushLog("ERR", "runCycle exception", failErr);
      return failErr;
    } finally {
      state.running = false;
      if (state.lastStatus === "running") state.lastStatus = "idle";
      persist();
    }
  }

  function clearTimer() {
    try {
      if (state.timerId) {
        clearInterval(state.timerId);
      }
    } catch (_) {}
    state.timerId = null;
  }

  function schedule() {
    clearTimer();

    if (!state.enabled) {
      persist();
      return false;
    }

    state.timerId = setInterval(function () {
      runCycle({
        reason: "factory_ai_autoloop.interval"
      });
    }, normalizeInterval(state.intervalMs));

    persist();
    return true;
  }

  function enable(opts) {
    var options = opts && typeof opts === "object" ? opts : {};
    state.enabled = true;

    if (options.intervalMs != null) {
      state.intervalMs = normalizeInterval(options.intervalMs);
    }

    schedule();

    pushHistory({
      type: "autoloop-enabled",
      ts: nowISO(),
      intervalMs: state.intervalMs
    });

    emit("RCF:FACTORY_AI_AUTOLOOP_ENABLED", {
      intervalMs: state.intervalMs
    });

    pushLog("OK", "autoloop enabled ✅", {
      intervalMs: state.intervalMs
    });

    return {
      ok: true,
      enabled: true,
      intervalMs: state.intervalMs
    };
  }

  function disable() {
    state.enabled = false;
    clearTimer();
    persist();

    pushHistory({
      type: "autoloop-disabled",
      ts: nowISO()
    });

    emit("RCF:FACTORY_AI_AUTOLOOP_DISABLED", {
      ok: true
    });

    pushLog("WARN", "autoloop disabled");

    return {
      ok: true,
      enabled: false
    };
  }

  function setIntervalMs(ms) {
    state.intervalMs = normalizeInterval(ms);
    if (state.enabled) schedule();
    persist();

    pushHistory({
      type: "autoloop-interval",
      ts: nowISO(),
      intervalMs: state.intervalMs
    });

    emit("RCF:FACTORY_AI_AUTOLOOP_INTERVAL", {
      intervalMs: state.intervalMs
    });

    pushLog("OK", "autoloop interval updated ✅", {
      intervalMs: state.intervalMs
    });

    return {
      ok: true,
      intervalMs: state.intervalMs
    };
  }

  function runNow() {
    return runCycle({
      reason: "factory_ai_autoloop.manual"
    });
  }

  function getLastSummary() {
    return {
      lastRunAt: state.lastRunAt || null,
      lastPlanId: state.lastPlanId || "",
      lastTargetFile: state.lastTargetFile || "",
      lastReason: state.lastReason || "",
      lastStatus: state.lastStatus || "idle",
      lastError: state.lastError || "",
      lastPhaseId: state.lastPhaseId || ""
    };
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      enabled: !!state.enabled,
      running: !!state.running,
      intervalMs: state.intervalMs,
      lastUpdate: state.lastUpdate || null,
      lastRunAt: state.lastRunAt || null,
      lastPlanId: state.lastPlanId || "",
      lastTargetFile: state.lastTargetFile || "",
      lastReason: state.lastReason || "",
      lastStatus: state.lastStatus || "idle",
      lastError: state.lastError || "",
      lastPhaseId: state.lastPhaseId || "",
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIAutoLoop");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIAutoLoop", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIAutoLoop");
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
      global.addEventListener("RCF:FACTORY_PHASE_CHANGED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          var phaseId = trimText(safe(function () { return detail.activePhase.id; }, ""));
          state.lastPhaseId = phaseId;
          persist();

          pushHistory({
            type: "autoloop-phase-sync",
            ts: nowISO(),
            phaseId: phaseId
          });
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.intervalMs = normalizeInterval(state.intervalMs);
    state.lastUpdate = nowISO();
    syncPresence();
    bindEvents();
    persist();

    if (state.enabled) {
      schedule();
    }

    pushLog("OK", "factory_ai_autoloop ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_AUTOLOOP = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    enable: enable,
    disable: disable,
    setIntervalMs: setIntervalMs,
    runNow: runNow,
    getLastSummary: getLastSummary,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

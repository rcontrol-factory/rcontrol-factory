/* FILE: /app/js/core/factory_ai_self_evolution.js
   RControl Factory — Factory AI Self Evolution
   v1.0.0 SUPERVISED SELF EVOLUTION LOOP

   Objetivo:
   - rodar ciclo supervisionado de autoevolução da Factory AI
   - usar planner + backend + bridge + patch supervisor + memory
   - gerar proposta periódica sem apply automático
   - respeitar patch pendente e não sobrescrever proposta aberta
   - aprender com memória recente para evitar repetição burra
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_SELF_EVOLUTION && global.RCF_FACTORY_AI_SELF_EVOLUTION.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_self_evolution";
  var DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
  var MIN_INTERVAL_MS = 5 * 60 * 1000;

  var state = {
    version: VERSION,
    ready: false,
    enabled: false,
    running: false,
    timer: null,
    intervalMs: DEFAULT_INTERVAL_MS,
    lastUpdate: null,
    lastRunAt: null,
    nextRunAt: null,
    lastCycleId: "",
    lastPlanId: "",
    lastTargetFile: "",
    lastStatus: "",
    lastReason: "",
    lastResult: null
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

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_SELF_EVOLUTION] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_SELF_EVOLUTION] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_SELF_EVOLUTION]", level, msg, extra || ""); } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        enabled: !!state.enabled,
        intervalMs: Number(state.intervalMs || DEFAULT_INTERVAL_MS),
        lastUpdate: state.lastUpdate,
        lastRunAt: state.lastRunAt,
        nextRunAt: state.nextRunAt,
        lastCycleId: state.lastCycleId,
        lastPlanId: state.lastPlanId,
        lastTargetFile: state.lastTargetFile,
        lastStatus: state.lastStatus,
        lastReason: state.lastReason,
        lastResult: state.lastResult
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

      if (typeof parsed.enabled === "boolean") state.enabled = parsed.enabled;
      if (typeof parsed.intervalMs === "number" && parsed.intervalMs >= MIN_INTERVAL_MS) {
        state.intervalMs = parsed.intervalMs;
      }

      state.lastUpdate = parsed.lastUpdate || null;
      state.lastRunAt = parsed.lastRunAt || null;
      state.nextRunAt = parsed.nextRunAt || null;
      state.lastCycleId = parsed.lastCycleId || "";
      state.lastPlanId = parsed.lastPlanId || "";
      state.lastTargetFile = parsed.lastTargetFile || "";
      state.lastStatus = parsed.lastStatus || "";
      state.lastReason = parsed.lastReason || "";
      state.lastResult = clone(parsed.lastResult || null);

      return true;
    } catch (_) {
      return false;
    }
  }

  function getPlanner() {
    return safe(function () { return global.RCF_FACTORY_AI_PLANNER || null; }, null);
  }

  function getBridge() {
    return safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
  }

  function getActions() {
    return safe(function () { return global.RCF_FACTORY_AI_ACTIONS || null; }, null);
  }

  function getSupervisor() {
    return safe(function () { return global.RCF_PATCH_SUPERVISOR || null; }, null);
  }

  function getMemory() {
    return safe(function () { return global.RCF_FACTORY_AI_MEMORY || null; }, null);
  }

  function getPendingPlan() {
    var bridge = getBridge();
    if (!bridge || typeof bridge.getPendingPlan !== "function") return null;
    return bridge.getPendingPlan();
  }

  function hasStagedPatch() {
    var sup = getSupervisor();
    if (!sup || typeof sup.status !== "function") return false;
    var status = sup.status();
    return !!safe(function () { return status.hasStagedPatch; }, false);
  }

  function getFactoryState() {
    return safe(function () {
      if (global.RCF_FACTORY_STATE?.getState) return global.RCF_FACTORY_STATE.getState();
      if (global.RCF_FACTORY_STATE?.status) return global.RCF_FACTORY_STATE.status();
      return {};
    }, {});
  }

  function buildPrompt(extra) {
    var add = trimText(extra || "");
    var base = [
      "Planeje a próxima autoevolução supervisionada da Factory AI.",
      "Priorize a própria Factory AI antes de outros fluxos.",
      "Evite repetir o mesmo alvo sem avanço real.",
      "Use patch mínimo e seguro.",
      "Nunca aplicar patch automaticamente.",
      "Indique o próximo arquivo mais estratégico e um patch mínimo sugerido."
    ].join(" ");

    return add ? (base + " " + add) : base;
  }

  function buildBackendPayload(plan, cycleId) {
    var factoryState = getFactoryState();
    var memory = getMemory();
    var summary = memory && typeof memory.getSummary === "function"
      ? memory.getSummary()
      : {};

    return {
      snapshot: safe(function () {
        if (global.RCF_CONTEXT?.getSnapshot) return global.RCF_CONTEXT.getSnapshot();
        if (global.RCF_CONTEXT?.getContext) return global.RCF_CONTEXT.getContext();
        return {};
      }, {}),
      plannerPlan: clone(plan || {}),
      selfEvolution: {
        cycleId: cycleId,
        activeView: trimText(factoryState.activeView || ""),
        bootStatus: trimText(factoryState.bootStatus || ""),
        lastTargetFile: trimText(state.lastTargetFile || ""),
        memorySummary: clone(summary || {})
      }
    };
  }

  function shouldSkipByMemory(targetFile) {
    var memory = getMemory();
    if (!memory || typeof memory.getAvoidList !== "function") return null;

    var list = memory.getAvoidList({
      cooldownMs: 45 * 60 * 1000,
      maxFailed: 2
    });

    var want = normalizePath(targetFile);
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (normalizePath(item.file) === want) return item;
    }
    return null;
  }

  async function callBackendForProposal(plan, cycleId) {
    try {
      var res = await fetch("/api/admin-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose-patch",
          prompt: buildPrompt(
            "Arquivo priorizado pelo planner: " + trimText(plan.targetFile || plan.nextFile || "")
          ),
          payload: buildBackendPayload(plan, cycleId),
          history: [],
          attachments: [],
          source: "factory-ai-self-evolution",
          version: VERSION
        })
      });

      var data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        return {
          ok: false,
          msg: "Falha HTTP no backend.",
          status: res.status,
          data: data
        };
      }

      return data;
    } catch (e) {
      return {
        ok: false,
        msg: String(e && e.message || e || "falha backend self evolution")
      };
    }
  }

  function scheduleNext() {
    try {
      if (state.timer) clearTimeout(state.timer);
    } catch (_) {}

    if (!state.enabled) {
      state.nextRunAt = null;
      persist();
      return;
    }

    var delay = Math.max(MIN_INTERVAL_MS, Number(state.intervalMs || DEFAULT_INTERVAL_MS));
    var nextMs = nowMS() + delay;
    state.nextRunAt = new Date(nextMs).toISOString();
    persist();

    state.timer = setTimeout(function () {
      try { runCycle({ source: "timer" }); }
      catch (_) {}
    }, delay);
  }

  async function runCycle(meta) {
    var info = clone(meta || {});
    if (!state.enabled) {
      return {
        ok: false,
        msg: "self evolution desabilitado"
      };
    }

    if (state.running) {
      return {
        ok: false,
        msg: "self evolution já está em execução"
      };
    }

    state.running = true;

    var cycleId = "se_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now();
    state.lastCycleId = cycleId;
    state.lastRunAt = nowISO();
    state.lastStatus = "running";
    state.lastReason = "";
    persist();

    var memory = getMemory();
    if (memory && typeof memory.recordCycle === "function") {
      memory.recordCycle({
        cycleId: cycleId,
        source: trimText(info.source || "manual")
      });
    }

    emit("RCF:FACTORY_AI_SELF_EVOLUTION_STARTED", {
      cycleId: cycleId,
      source: trimText(info.source || "manual")
    });

    try {
      if (getPendingPlan()) {
        state.lastStatus = "waiting-approval";
        state.lastReason = "já existe plano pendente aguardando aprovação";
        persist();
        scheduleNext();

        pushLog("INFO", "cycle skipped: pending plan", {
          cycleId: cycleId
        });

        return {
          ok: true,
          skipped: true,
          reason: state.lastReason
        };
      }

      if (hasStagedPatch()) {
        state.lastStatus = "waiting-stage-resolution";
        state.lastReason = "já existe staged patch aguardando resolução";
        persist();
        scheduleNext();

        pushLog("INFO", "cycle skipped: staged patch", {
          cycleId: cycleId
        });

        return {
          ok: true,
          skipped: true,
          reason: state.lastReason
        };
      }

      var actions = getActions();
      if (!actions || typeof actions.planFromCurrentRuntime !== "function") {
        throw new Error("RCF_FACTORY_AI_ACTIONS.planFromCurrentRuntime indisponível.");
      }

      var planResult = await actions.planFromCurrentRuntime({
        prompt: buildPrompt(),
        reason: "self-evolution-cycle",
        cycleId: cycleId
      });

      if (!planResult || !planResult.ok || !planResult.plan) {
        throw new Error(trimText(safe(function () { return planResult.msg; }, "")) || "Planner não retornou plano válido.");
      }

      var plan = clone(planResult.plan || {});
      var targetFile = normalizePath(plan.targetFile || plan.nextFile || "");
      state.lastPlanId = trimText(plan.id || "");
      state.lastTargetFile = targetFile;

      var avoid = shouldSkipByMemory(targetFile);
      if (avoid) {
        state.lastStatus = "cooldown";
        state.lastReason = trimText(avoid.reason || "arquivo em cooldown");
        persist();
        scheduleNext();

        pushLog("INFO", "cycle skipped by memory cooldown", {
          cycleId: cycleId,
          targetFile: targetFile
        });

        return {
          ok: true,
          skipped: true,
          reason: state.lastReason,
          targetFile: targetFile
        };
      }

      var backendResult = await callBackendForProposal(plan, cycleId);
      if (!backendResult || !backendResult.ok) {
        if (memory && typeof memory.recordFailure === "function") {
          memory.recordFailure({
            cycleId: cycleId,
            planId: trimText(plan.id || ""),
            targetFile: targetFile,
            reason: trimText(safe(function () { return backendResult.msg; }, "")) || "falha backend"
          });
        }

        throw new Error(trimText(safe(function () { return backendResult.msg; }, "")) || "Backend não retornou proposta válida.");
      }

      var bridge = getBridge();
      if (!bridge || typeof bridge.fromApiResponse !== "function") {
        throw new Error("RCF_FACTORY_AI_BRIDGE.fromApiResponse indisponível.");
      }

      var proposalPlan = bridge.fromApiResponse({
        analysis: trimText(backendResult.analysis || ""),
        answer: trimText(backendResult.analysis || ""),
        raw: clone(backendResult || {}),
        cycleId: cycleId,
        plannerPlan: clone(plan)
      });

      if (!proposalPlan || !proposalPlan.id) {
        throw new Error("Bridge não conseguiu consolidar o plano supervisionado.");
      }

      state.lastPlanId = trimText(proposalPlan.id || state.lastPlanId || "");
      state.lastTargetFile = normalizePath(proposalPlan.targetFile || targetFile || "");
      state.lastStatus = "proposal-ready";
      state.lastReason = "proposta supervisionada pronta para aprovação";
      state.lastResult = {
        cycleId: cycleId,
        plannerPlanId: trimText(plan.id || ""),
        proposalPlanId: trimText(proposalPlan.id || ""),
        targetFile: state.lastTargetFile
      };
      persist();

      if (memory && typeof memory.recordProposal === "function") {
        memory.recordProposal({
          cycleId: cycleId,
          planId: trimText(proposalPlan.id || ""),
          targetFile: state.lastTargetFile,
          reason: trimText(proposalPlan.nextStep || proposalPlan.objective || "proposta pronta")
        });
      }

      emit("RCF:FACTORY_AI_SELF_EVOLUTION_PROPOSAL_READY", {
        cycleId: cycleId,
        plannerPlan: clone(plan),
        proposalPlan: clone(proposalPlan)
      });

      pushLog("OK", "self evolution proposal ready ✅", {
        cycleId: cycleId,
        targetFile: state.lastTargetFile,
        planId: state.lastPlanId
      });

      scheduleNext();

      return {
        ok: true,
        cycleId: cycleId,
        plannerPlan: clone(plan),
        proposalPlan: clone(proposalPlan)
      };
    } catch (e) {
      var msg = String(e && e.message || e || "falha no ciclo");
      state.lastStatus = "failed";
      state.lastReason = msg;
      state.lastResult = {
        ok: false,
        cycleId: cycleId,
        msg: msg
      };
      persist();

      var mem = getMemory();
      if (mem && typeof mem.recordFailure === "function") {
        mem.recordFailure({
          cycleId: cycleId,
          planId: trimText(state.lastPlanId || ""),
          targetFile: trimText(state.lastTargetFile || ""),
          reason: msg
        });
      }

      emit("RCF:FACTORY_AI_SELF_EVOLUTION_FAILED", {
        cycleId: cycleId,
        msg: msg
      });

      pushLog("ERR", "self evolution cycle failed", {
        cycleId: cycleId,
        msg: msg
      });

      scheduleNext();

      return {
        ok: false,
        cycleId: cycleId,
        msg: msg
      };
    } finally {
      state.running = false;
      persist();
    }
  }

  function enable(opts) {
    var options = clone(opts || {});
    var intervalMs = Number(options.intervalMs || state.intervalMs || DEFAULT_INTERVAL_MS);

    state.enabled = true;
    state.intervalMs = Math.max(MIN_INTERVAL_MS, intervalMs);
    persist();
    scheduleNext();

    pushLog("OK", "self evolution enabled ✅", {
      intervalMs: state.intervalMs
    });

    emit("RCF:FACTORY_AI_SELF_EVOLUTION_ENABLED", {
      intervalMs: state.intervalMs
    });

    return status();
  }

  function disable() {
    state.enabled = false;
    try {
      if (state.timer) clearTimeout(state.timer);
    } catch (_) {}
    state.timer = null;
    state.nextRunAt = null;
    persist();

    pushLog("OK", "self evolution disabled ✅");
    emit("RCF:FACTORY_AI_SELF_EVOLUTION_DISABLED", { ok: true });

    return status();
  }

  function triggerNow(reason) {
    return runCycle({
      source: trimText(reason || "manual-trigger")
    });
  }

  function setIntervalMs(ms) {
    var value = Math.max(MIN_INTERVAL_MS, Number(ms || DEFAULT_INTERVAL_MS));
    state.intervalMs = value;
    persist();
    if (state.enabled) scheduleNext();
    return status();
  }

  function bindApprovalEvents() {
    try {
      if (global.__RCF_FACTORY_AI_SELF_EVOLUTION_EVENTS_V100) return;
      global.__RCF_FACTORY_AI_SELF_EVOLUTION_EVENTS_V100 = true;

      global.addEventListener("RCF:FACTORY_AI_ACTION_APPROVED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          var result = detail.result || {};
          var memory = getMemory();
          if (memory && typeof memory.recordApproval === "function") {
            memory.recordApproval({
              planId: trimText(result.planId || ""),
              targetFile: normalizePath(safe(function () { return result.summary.targetFile; }, "")),
              reason: "aprovação supervisionada"
            });
          }
        } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_STAGED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          var patch = detail.stagedPatch || {};
          var memory = getMemory();
          if (memory && typeof memory.recordStage === "function") {
            memory.recordStage({
              planId: trimText(detail.planId || patch.planId || ""),
              targetFile: normalizePath(patch.targetFile || ""),
              reason: "patch staged"
            });
          }
        } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_APPLIED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          var memory = getMemory();
          if (memory && typeof memory.recordApply === "function") {
            memory.recordApply({
              planId: trimText(detail.planId || ""),
              targetFile: normalizePath(detail.targetFile || ""),
              reason: "patch aplicado"
            });
          }
        } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_APPLY_FAILED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          var memory = getMemory();
          if (memory && typeof memory.recordFailure === "function") {
            memory.recordFailure({
              planId: trimText(detail.planId || ""),
              targetFile: normalizePath(detail.targetFile || ""),
              reason: trimText(detail.msg || "patch apply failed")
            });
          }
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      enabled: !!state.enabled,
      running: !!state.running,
      intervalMs: Number(state.intervalMs || DEFAULT_INTERVAL_MS),
      lastUpdate: state.lastUpdate || null,
      lastRunAt: state.lastRunAt || null,
      nextRunAt: state.nextRunAt || null,
      lastCycleId: state.lastCycleId || "",
      lastPlanId: state.lastPlanId || "",
      lastTargetFile: state.lastTargetFile || "",
      lastStatus: state.lastStatus || "",
      lastReason: state.lastReason || "",
      plannerReady: !!getPlanner(),
      actionsReady: !!getActions(),
      bridgeReady: !!getBridge(),
      patchSupervisorReady: !!getSupervisor(),
      memoryReady: !!getMemory()
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAISelfEvolution");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAISelfEvolution", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAISelfEvolution");
      }
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    persist();
    syncPresence();
    bindApprovalEvents();

    if (state.enabled) {
      scheduleNext();
    }

    pushLog("OK", "factory_ai_self_evolution ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_SELF_EVOLUTION = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    enable: enable,
    disable: disable,
    triggerNow: triggerNow,
    runCycle: runCycle,
    setIntervalMs: setIntervalMs,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

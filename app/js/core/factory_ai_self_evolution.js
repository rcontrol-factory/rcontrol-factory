/* FILE: /app/js/core/factory_ai_self_evolution.js
   RControl Factory — Factory AI Self Evolution
   v1.0.1 SUPERVISED SELF EVOLUTION LOOP + SAFE MEMORY COMPAT

   Objetivo:
   - rodar ciclo supervisionado de autoevolução da Factory AI
   - usar planner + actions + bridge + patch supervisor + memory
   - gerar proposta periódica sem apply automático
   - respeitar patch pendente e não sobrescrever proposta aberta
   - aprender com memória recente para evitar repetição burra
   - funcionar como script clássico

   PATCH v1.0.1:
   - FIX: remove dependência de APIs inexistentes do memory
   - FIX: remove dependência de fromApiResponse/getPendingPlan do bridge
   - FIX: usa actions.planFromCurrentRuntime como fluxo principal
   - FIX: usa memory.latest/buildMemoryContext/rememberDecision/rememberNote/rememberError
   - FIX: usa bridge.getLastPlan como fallback seguro
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_SELF_EVOLUTION && global.RCF_FACTORY_AI_SELF_EVOLUTION.__v101) return;

  var VERSION = "v1.0.1";
  var STORAGE_KEY = "rcf:factory_ai_self_evolution";
  var DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
  var MIN_INTERVAL_MS = 5 * 60 * 1000;
  var MAX_HISTORY = 80;
  var RECENT_FILE_COOLDOWN_MS = 45 * 60 * 1000;

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
    lastResult: null,
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
        lastResult: state.lastResult,
        history: Array.isArray(state.history) ? state.history.slice(-MAX_HISTORY) : []
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
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];

      return true;
    } catch (_) {
      return false;
    }
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

  function getFactoryState() {
    return safe(function () {
      if (global.RCF_FACTORY_STATE?.getState) return global.RCF_FACTORY_STATE.getState();
      if (global.RCF_FACTORY_STATE?.status) return global.RCF_FACTORY_STATE.status();
      return {};
    }, {});
  }

  function getCurrentPlan() {
    var bridge = getBridge();
    if (!bridge || typeof bridge.getLastPlan !== "function") return null;
    var plan = bridge.getLastPlan();
    return (plan && typeof plan === "object") ? clone(plan) : null;
  }

  function hasPendingPlan() {
    var plan = getCurrentPlan();
    if (!plan) return false;
    return trimText(plan.approvalStatus || "") !== "approved";
  }

  function hasStagedPatch() {
    var sup = getSupervisor();
    if (!sup || typeof sup.status !== "function") return false;
    var st = sup.status() || {};
    return !!safe(function () { return st.hasStagedPatch; }, false);
  }

  function getRecentMemoryItems() {
    var memory = getMemory();
    if (!memory || typeof memory.latest !== "function") return [];
    var res = memory.latest(20);
    if (!res || !res.ok || !Array.isArray(res.items)) return [];
    return clone(res.items);
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

  function isRecentTargetBlocked(targetFile) {
    var want = normalizePath(targetFile);
    if (!want) return null;

    var items = getRecentMemoryItems();
    var now = nowMS();

    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      var file = normalizePath(item.targetFile || item.file || "");
      if (file !== want) continue;

      var createdAt = trimText(item.createdAt || item.updatedAt || "");
      var ts = createdAt ? Date.parse(createdAt) : 0;
      if (!ts || !isFinite(ts)) continue;

      if ((now - ts) <= RECENT_FILE_COOLDOWN_MS) {
        return {
          blocked: true,
          file: want,
          reason: "arquivo recente na memória operacional",
          memoryItem: clone(item)
        };
      }
    }

    return null;
  }

  function rememberDecision(title, summary, targetFile, meta) {
    var memory = getMemory();
    if (!memory || typeof memory.rememberDecision !== "function") return false;

    try {
      memory.rememberDecision({
        title: trimText(title || "Decisão registrada"),
        summary: trimText(summary || ""),
        targetFile: normalizePath(targetFile || ""),
        tags: ["self-evolution", "decision"],
        source: "factory_ai_self_evolution",
        meta: clone(meta || {})
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function rememberNote(title, summary, targetFile, meta) {
    var memory = getMemory();
    if (!memory || typeof memory.rememberNote !== "function") return false;

    try {
      memory.rememberNote({
        title: trimText(title || "Nota registrada"),
        summary: trimText(summary || ""),
        targetFile: normalizePath(targetFile || ""),
        tags: ["self-evolution", "note"],
        source: "factory_ai_self_evolution",
        meta: clone(meta || {})
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function rememberError(summary, targetFile, meta) {
    var memory = getMemory();
    if (!memory || typeof memory.rememberError !== "function") return false;

    try {
      memory.rememberError({
        title: "Falha no self evolution",
        summary: trimText(summary || ""),
        targetFile: normalizePath(targetFile || ""),
        tags: ["self-evolution", "error"],
        source: "factory_ai_self_evolution",
        meta: clone(meta || {})
      });
      return true;
    } catch (_) {
      return false;
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
    if (!state.enabled && trimText(info.source || "") !== "manual-trigger") {
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

    emit("RCF:FACTORY_AI_SELF_EVOLUTION_STARTED", {
      cycleId: cycleId,
      source: trimText(info.source || "manual")
    });

    try {
      if (hasPendingPlan()) {
        state.lastStatus = "waiting-approval";
        state.lastReason = "já existe plano pendente aguardando aprovação";
        persist();
        rememberNote("Self evolution aguardando aprovação", state.lastReason, "", {
          cycleId: cycleId
        });
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
        rememberNote("Self evolution aguardando resolução", state.lastReason, "", {
          cycleId: cycleId
        });
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
      var planner = getPlanner();

      if (!actions || typeof actions.planFromCurrentRuntime !== "function") {
        if (!planner || (typeof planner.planFromRuntime !== "function" && typeof planner.buildPlan !== "function")) {
          throw new Error("planner/actions indisponíveis para self evolution");
        }
      }

      var factoryState = getFactoryState();
      var activeView = trimText(factoryState.activeView || "");
      var bootStatus = trimText(factoryState.bootStatus || "");

      var req = {
        prompt: buildPrompt(
          [
            activeView ? ("View ativa: " + activeView + ".") : "",
            bootStatus ? ("Boot status: " + bootStatus + ".") : "",
            state.lastTargetFile ? ("Último alvo recente: " + state.lastTargetFile + ".") : ""
          ].join(" ")
        ),
        reason: "self-evolution-cycle",
        cycleId: cycleId,
        source: "factory_ai_self_evolution"
      };

      var planResult = null;

      if (actions && typeof actions.planFromCurrentRuntime === "function") {
        planResult = await actions.planFromCurrentRuntime(req);
      } else if (planner && typeof planner.planFromRuntime === "function") {
        planResult = { ok: true, plan: planner.planFromRuntime(req) };
      } else if (planner && typeof planner.buildPlan === "function") {
        planResult = { ok: true, plan: planner.buildPlan(req) };
      }

      if (!planResult || !planResult.ok || !planResult.plan) {
        throw new Error(trimText(safe(function () { return planResult.msg; }, "")) || "planner não retornou plano válido");
      }

      var plan = clone(planResult.plan || {});
      var targetFile = normalizePath(plan.targetFile || plan.nextFile || "");
      var block = isRecentTargetBlocked(targetFile);

      state.lastPlanId = trimText(plan.id || "");
      state.lastTargetFile = targetFile;

      if (block) {
        state.lastStatus = "cooldown";
        state.lastReason = trimText(block.reason || "arquivo recente na memória");
        state.lastResult = {
          ok: true,
          skipped: true,
          cycleId: cycleId,
          targetFile: targetFile,
          reason: state.lastReason
        };
        persist();

        rememberNote("Self evolution em cooldown", state.lastReason, targetFile, {
          cycleId: cycleId,
          memoryItem: clone(block.memoryItem || {})
        });

        scheduleNext();

        pushLog("INFO", "cycle skipped by memory cooldown", {
          cycleId: cycleId,
          targetFile: targetFile
        });

        return clone(state.lastResult);
      }

      state.lastStatus = "proposal-ready";
      state.lastReason = trimText(plan.nextStep || plan.reason || "proposta supervisionada pronta para aprovação");
      state.lastResult = {
        ok: true,
        cycleId: cycleId,
        planId: trimText(plan.id || ""),
        targetFile: targetFile,
        priority: trimText(plan.priority || ""),
        reason: state.lastReason
      };
      persist();

      rememberDecision(
        "Self evolution gerou novo plano",
        state.lastReason,
        targetFile,
        {
          cycleId: cycleId,
          planId: trimText(plan.id || ""),
          priority: trimText(plan.priority || ""),
          objective: trimText(plan.objective || ""),
          suggestedFiles: clone(plan.suggestedFiles || plan.executionLine || [])
        }
      );

      emit("RCF:FACTORY_AI_SELF_EVOLUTION_PROPOSAL_READY", {
        cycleId: cycleId,
        plannerPlan: clone(plan)
      });

      pushLog("OK", "self evolution proposal ready ✅", {
        cycleId: cycleId,
        targetFile: targetFile,
        planId: trimText(plan.id || "")
      });

      scheduleNext();

      return {
        ok: true,
        cycleId: cycleId,
        plannerPlan: clone(plan)
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

      rememberError(msg, state.lastTargetFile || "", {
        cycleId: cycleId,
        planId: trimText(state.lastPlanId || "")
      });

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

    pushHistory({
      type: "self-evolution-enabled",
      ts: nowISO(),
      intervalMs: state.intervalMs
    });

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

    pushHistory({
      type: "self-evolution-disabled",
      ts: nowISO()
    });

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

    pushHistory({
      type: "self-evolution-interval",
      ts: nowISO(),
      intervalMs: value
    });

    return status();
  }

  function bindApprovalEvents() {
    try {
      if (global.__RCF_FACTORY_AI_SELF_EVOLUTION_EVENTS_V101) return;
      global.__RCF_FACTORY_AI_SELF_EVOLUTION_EVENTS_V101 = true;

      global.addEventListener("RCF:FACTORY_AI_ACTION_APPROVED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          var result = detail.result || {};
          rememberDecision(
            "Plano aprovado",
            "Plano supervisionado aprovado para seguir no fluxo.",
            normalizePath(safe(function () { return result.summary.targetFile; }, "")),
            {
              planId: trimText(result.planId || ""),
              sourceEvent: "RCF:FACTORY_AI_ACTION_APPROVED"
            }
          );
        } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_SUPERVISOR_STAGE_OK", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          rememberNote(
            "Patch staged",
            "Patch preparado com sucesso no supervisor.",
            normalizePath(safe(function () { return detail.stagedPatch.targetFile; }, "")),
            {
              planId: trimText(detail.planId || ""),
              sourceEvent: "RCF:PATCH_SUPERVISOR_STAGE_OK"
            }
          );
        } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_SUPERVISOR_APPLY_OK", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          rememberDecision(
            "Patch aplicado",
            "Patch aplicado com sucesso no supervisor.",
            normalizePath(detail.targetFile || ""),
            {
              planId: trimText(detail.planId || ""),
              sourceEvent: "RCF:PATCH_SUPERVISOR_APPLY_OK"
            }
          );
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
    __v101: true,
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

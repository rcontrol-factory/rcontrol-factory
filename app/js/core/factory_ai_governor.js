/* FILE: /app/js/core/factory_ai_governor.js
   RControl Factory — Factory AI Governor
   v1.1.0 SUPERVISION ENGINE + CURRENT STACK ORCHESTRATION

   Objetivo:
   - coordenar fluxo global da Factory AI
   - evitar conflitos entre módulos
   - decidir quando rodar diagnostics / autoheal / runtime / actions
   - impedir apply automático
   - respeitar fase atual e modo de evolução
   - funcionar como script clássico

   PATCH v1.1.0:
   - FIX: remove dependência do architect antigo/inexistente
   - FIX: usa diagnostics + autoheal como base de decisão atual
   - FIX: integra evolution_mode e phase_engine
   - FIX: approve/validate/stage/apply usam runtime com fallback seguro
   - FIX: status mais rico para leitura operacional
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_GOVERNOR && global.RCF_FACTORY_AI_GOVERNOR.__v110) return;

  var VERSION = "1.1.0";
  var STORAGE_KEY = "rcf:factory_ai_governor";
  var MAX_HISTORY = 80;

  var state = {
    version: VERSION,
    ready: false,
    status: "idle",
    lastDecision: "",
    lastProposalId: "",
    lastTargetFile: "",
    lastMode: "",
    lastPhaseId: "",
    lastUpdate: null,
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        status: state.status,
        lastDecision: state.lastDecision,
        lastProposalId: state.lastProposalId,
        lastTargetFile: state.lastTargetFile,
        lastMode: state.lastMode,
        lastPhaseId: state.lastPhaseId,
        lastUpdate: state.lastUpdate,
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
      state.status = trimText(parsed.status || "idle") || "idle";
      state.lastDecision = trimText(parsed.lastDecision || "");
      state.lastProposalId = trimText(parsed.lastProposalId || "");
      state.lastTargetFile = normalizePath(parsed.lastTargetFile || "");
      state.lastMode = trimText(parsed.lastMode || "");
      state.lastPhaseId = trimText(parsed.lastPhaseId || "");
      state.lastUpdate = parsed.lastUpdate || null;
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

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function log(msg, extra) {
    try {
      global.RCF_LOGGER?.push?.(
        "INFO",
        "[FACTORY_AI_GOVERNOR] " + msg + " " + JSON.stringify(extra || {})
      );
    } catch (_) {}

    try { console.log("[FACTORY_AI_GOVERNOR]", msg, extra || ""); } catch (_) {}
  }

  function getPhaseEngine() {
    return safe(function () { return global.RCF_FACTORY_PHASE_ENGINE || null; }, null);
  }

  function getPhase() {
    return safe(function () {
      if (global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext) {
        return global.RCF_FACTORY_PHASE_ENGINE.buildPhaseContext();
      }
      return {};
    }, {});
  }

  function getEvolutionMode() {
    return safe(function () { return global.RCF_FACTORY_AI_EVOLUTION_MODE || null; }, null);
  }

  function getDiagnostics() {
    return safe(function () { return global.RCF_FACTORY_AI_DIAGNOSTICS || null; }, null);
  }

  function getAutoHeal() {
    return safe(function () { return global.RCF_FACTORY_AI_AUTOHEAL || null; }, null);
  }

  function getRuntime() {
    return safe(function () { return global.RCF_FACTORY_AI_RUNTIME || null; }, null);
  }

  function getActions() {
    return safe(function () { return global.RCF_FACTORY_AI_ACTIONS || null; }, null);
  }

  function getSupervisor() {
    return safe(function () { return global.RCF_PATCH_SUPERVISOR || null; }, null);
  }

  function getBridge() {
    return safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
  }

  function getPendingPlan() {
    var bridge = getBridge();
    if (!bridge || typeof bridge.getPendingPlan !== "function") return null;
    return safe(function () { return bridge.getPendingPlan(); }, null);
  }

  function getStagedPatch() {
    var sup = getSupervisor();
    if (!sup || typeof sup.getStagedPatch !== "function") return null;
    return safe(function () { return sup.getStagedPatch(); }, null);
  }

  function getCurrentMode() {
    var modeApi = getEvolutionMode();
    if (!modeApi || typeof modeApi.getMode !== "function") return "";
    return trimText(safe(function () { return modeApi.getMode(); }, ""));
  }

  function getPhaseId(ctx) {
    return trimText(
      safe(function () { return ctx.activePhase.id; }, "") ||
      safe(function () { return ctx.activePhaseId; }, "")
    );
  }

  function phaseAllowsAutoLoop(ctx) {
    return !!safe(function () { return ctx.activePhase.allow.autoloop; }, false);
  }

  function phaseAllowsApply(ctx) {
    return !!safe(function () { return ctx.activePhase.allow.apply; }, false);
  }

  function hasPendingProposal() {
    var proposal = safe(function () {
      return getAutoHeal()?.getLastProposal?.();
    }, null);

    if (!proposal || typeof proposal !== "object") return false;
    if (trimText(proposal.approvalStatus || "pending") !== "pending") return false;
    return true;
  }

  function readLastProposal() {
    return safe(function () {
      return getAutoHeal()?.getLastProposal?.() || null;
    }, null);
  }

  function syncStateMarkers(ctx) {
    state.lastMode = getCurrentMode();
    state.lastPhaseId = getPhaseId(ctx || {});
  }

  function decide() {
    var phase = getPhase();
    var phaseId = getPhaseId(phase);
    var mode = getCurrentMode();
    var pendingPlan = getPendingPlan();
    var stagedPatch = getStagedPatch();
    var proposal = readLastProposal();

    syncStateMarkers(phase);

    if (stagedPatch && stagedPatch.planId) {
      state.status = "waiting-stage-resolution";
      state.lastDecision = "aguardando resolução de staged patch";
      state.lastProposalId = trimText(stagedPatch.planId || "");
      state.lastTargetFile = normalizePath(stagedPatch.targetFile || "");
      return state.status;
    }

    if (pendingPlan && pendingPlan.id) {
      state.status = "waiting-approval";
      state.lastDecision = "aguardando aprovação de plano pendente";
      state.lastProposalId = trimText(pendingPlan.id || "");
      state.lastTargetFile = normalizePath(pendingPlan.targetFile || pendingPlan.nextFile || "");
      return state.status;
    }

    if (proposal && proposal.id && proposal.blocked) {
      state.status = "blocked-human-step";
      state.lastDecision = trimText(proposal.blockedReason || "etapa humana pendente");
      state.lastProposalId = trimText(proposal.id || "");
      state.lastTargetFile = normalizePath(proposal.targetFile || "");
      return state.status;
    }

    if (mode === "diagnostic") {
      state.status = "diagnostics";
      state.lastDecision = "rodar diagnostics";
      state.lastProposalId = "";
      state.lastTargetFile = "";
      return state.status;
    }

    if (mode === "autoheal" || mode === "proposal" || mode === "structure") {
      state.status = "autoheal";
      state.lastDecision = "rodar autoheal supervisionado";
      state.lastProposalId = trimText(safe(function () { return proposal.id; }, ""));
      state.lastTargetFile = normalizePath(safe(function () { return proposal.targetFile; }, ""));
      return state.status;
    }

    if (
      phaseId === "factory-ai-supervised" ||
      phaseId === "factory-ai-assisted-apply" ||
      phaseId === "factory-ai-autoloop-supervised"
    ) {
      state.status = phaseAllowsAutoLoop(phase) ? "autoheal" : "diagnostics";
      state.lastDecision = phaseAllowsAutoLoop(phase)
        ? "fase atual favorece autoheal supervisionado"
        : "fase atual favorece diagnóstico supervisionado";
      state.lastProposalId = trimText(safe(function () { return proposal.id; }, ""));
      state.lastTargetFile = normalizePath(safe(function () { return proposal.targetFile; }, ""));
      return state.status;
    }

    state.status = "idle";
    state.lastDecision = "nenhuma ação necessária";
    state.lastProposalId = "";
    state.lastTargetFile = "";
    return state.status;
  }

  async function runDiagnostics() {
    var diagnostics = getDiagnostics();

    if (!diagnostics || typeof diagnostics.scan !== "function") {
      return { ok: false, msg: "diagnostics ausente" };
    }

    var report = diagnostics.scan();
    var nextFocus = safe(function () { return report.nextFocus.targetFile; }, "");

    state.status = "diagnostics-ready";
    state.lastProposalId = "";
    state.lastTargetFile = normalizePath(nextFocus || "");

    return {
      ok: true,
      status: state.status,
      report: clone(report || {}),
      nextFocus: normalizePath(nextFocus || "")
    };
  }

  async function runAutoHeal() {
    var autoheal = getAutoHeal();

    if (!autoheal || typeof autoheal.scan !== "function") {
      return { ok: false, msg: "autoheal ausente" };
    }

    var result = autoheal.scan();
    var proposal = safe(function () { return result.proposal; }, null);

    state.lastProposalId = trimText(safe(function () { return proposal.id; }, ""));
    state.lastTargetFile = normalizePath(safe(function () { return proposal.targetFile; }, ""));

    if (proposal && proposal.id) {
      state.status = proposal.blocked ? "blocked-human-step" : "proposal-ready";
    } else {
      state.status = "autoheal-ready";
    }

    return {
      ok: !!safe(function () { return result.ok; }, false),
      status: state.status,
      proposal: clone(proposal || {}),
      report: clone(safe(function () { return result.report; }, {}) || {})
    };
  }

  async function tick(meta) {
    var decision = decide();
    var phase = getPhase();

    state.lastUpdate = nowISO();
    persist();

    pushHistory({
      type: "tick",
      ts: state.lastUpdate,
      decision: decision,
      mode: state.lastMode,
      phaseId: state.lastPhaseId,
      meta: clone(meta || {})
    });

    if (decision === "diagnostics") {
      var diag = await runDiagnostics();
      state.lastUpdate = nowISO();
      persist();

      emit("RCF:FACTORY_AI_GOVERNOR_TICK", {
        decision: decision,
        result: clone(diag)
      });

      return diag;
    }

    if (decision === "autoheal") {
      var heal = await runAutoHeal();
      state.lastUpdate = nowISO();
      persist();

      emit("RCF:FACTORY_AI_GOVERNOR_TICK", {
        decision: decision,
        result: clone(heal)
      });

      return heal;
    }

    var idle = {
      ok: true,
      status: state.status,
      decision: state.lastDecision,
      mode: state.lastMode,
      phaseId: getPhaseId(phase)
    };

    emit("RCF:FACTORY_AI_GOVERNOR_TICK", {
      decision: decision,
      result: clone(idle)
    });

    return idle;
  }

  function approve(meta) {
    var runtime = getRuntime();
    var actions = getActions();

    if (runtime && typeof runtime.approvePlan === "function") {
      var rr = runtime.approvePlan(trimText(safe(function () { return meta.planId; }, "")), meta || {});
      state.status = rr && rr.ok ? "approved" : "waiting-approval";
      state.lastUpdate = nowISO();
      persist();
      return rr;
    }

    if (actions && typeof actions.approveLastPlan === "function") {
      state.status = "approved";
      state.lastUpdate = nowISO();
      persist();
      return actions.approveLastPlan(meta || {});
    }

    return { ok: false, msg: "runtime/actions ausente para approve" };
  }

  function validate(meta) {
    var runtime = getRuntime();
    var actions = getActions();
    var sup = getSupervisor();
    var planId = trimText(safe(function () { return meta.planId; }, ""));

    if (runtime && typeof runtime.validateApprovedPlan === "function") {
      state.status = "validated";
      state.lastUpdate = nowISO();
      persist();
      return runtime.validateApprovedPlan(planId);
    }

    if (actions && typeof actions.validateLastApprovedPlan === "function") {
      state.status = "validated";
      state.lastUpdate = nowISO();
      persist();
      return actions.validateLastApprovedPlan(meta || {});
    }

    if (sup && typeof sup.validateApprovedPlan === "function") {
      state.status = "validated";
      state.lastUpdate = nowISO();
      persist();
      return sup.validateApprovedPlan(planId);
    }

    return { ok: false, msg: "patch supervisor/runtime/actions ausente" };
  }

  function stage(meta) {
    var runtime = getRuntime();
    var actions = getActions();
    var sup = getSupervisor();
    var planId = trimText(safe(function () { return meta.planId; }, ""));

    if (runtime && typeof runtime.stageApprovedPlan === "function") {
      state.status = "staged";
      state.lastUpdate = nowISO();
      persist();
      return runtime.stageApprovedPlan(planId);
    }

    if (actions && typeof actions.stageLastApprovedPlan === "function") {
      state.status = "staged";
      state.lastUpdate = nowISO();
      persist();
      return actions.stageLastApprovedPlan(meta || {});
    }

    if (sup && typeof sup.stageApprovedPlan === "function") {
      state.status = "staged";
      state.lastUpdate = nowISO();
      persist();
      return sup.stageApprovedPlan(planId);
    }

    return { ok: false, msg: "patch supervisor/runtime/actions ausente" };
  }

  function apply(meta) {
    var phase = getPhase();
    var runtime = getRuntime();
    var actions = getActions();
    var sup = getSupervisor();
    var planId = trimText(safe(function () { return meta.planId; }, ""));

    if (!phaseAllowsApply(phase)) {
      return { ok: false, msg: "apply bloqueado pela fase ativa" };
    }

    if (runtime && typeof runtime.applyApprovedPlan === "function") {
      state.status = "applied";
      state.lastUpdate = nowISO();
      persist();
      return runtime.applyApprovedPlan(planId, meta || {});
    }

    if (actions && typeof actions.applyLastApprovedPlan === "function") {
      state.status = "applied";
      state.lastUpdate = nowISO();
      persist();
      return actions.applyLastApprovedPlan(meta || {});
    }

    if (sup && typeof sup.applyApprovedPlan === "function") {
      state.status = "applied";
      state.lastUpdate = nowISO();
      persist();
      return sup.applyApprovedPlan(planId, meta || {});
    }

    return { ok: false, msg: "patch supervisor/runtime/actions ausente" };
  }

  function status() {
    return clone({
      version: VERSION,
      ready: !!state.ready,
      status: state.status,
      lastDecision: state.lastDecision,
      lastProposalId: state.lastProposalId,
      lastTargetFile: state.lastTargetFile,
      lastMode: state.lastMode,
      lastPhaseId: state.lastPhaseId,
      lastUpdate: state.lastUpdate,
      historyCount: Array.isArray(state.history) ? state.history.length : 0,
      diagnosticsReady: !!getDiagnostics(),
      autohealReady: !!getAutoHeal(),
      runtimeReady: !!getRuntime(),
      actionsReady: !!getActions(),
      patchSupervisorReady: !!getSupervisor()
    });
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIGovernor");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIGovernor", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIGovernor");
      }
    } catch (_) {}
  }

  function bindEvents() {
    try {
      global.addEventListener("RCF:FACTORY_PHASE_CHANGED", function () {
        try {
          syncStateMarkers(getPhase());
          persist();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:FACTORY_AI_MODE_CHANGED", function () {
        try {
          state.lastMode = getCurrentMode();
          persist();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    syncStateMarkers(getPhase());
    persist();
    syncPresence();
    bindEvents();
    log("Factory AI Governor iniciado", {
      version: VERSION,
      phaseId: state.lastPhaseId,
      mode: state.lastMode
    });
    return status();
  }

  global.RCF_FACTORY_AI_GOVERNOR = {
    __v100: true,
    __v110: true,
    version: VERSION,
    init: init,
    tick: tick,
    status: status,
    approve: approve,
    validate: validate,
    stage: stage,
    apply: apply,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

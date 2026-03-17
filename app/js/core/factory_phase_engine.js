/* FILE: /app/js/core/factory_phase_engine.js
   RControl Factory — Factory Phase Engine
   v1.0.0 SUPERVISED PHASE ORCHESTRATOR

   Objetivo:
   - organizar a evolução da Factory por fases supervisionadas
   - registrar em que etapa a Factory está
   - decidir avanço seguro sem quebrar a base
   - servir de referência para planner / memory / autoloop / admin ui
   - manter autonomia gradual, nunca brusca
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_PHASE_ENGINE && global.RCF_FACTORY_PHASE_ENGINE.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_phase_engine";

  var DEFAULT_PHASE = "factory-ai-supervised";

  var PHASES = [
    {
      id: "factory-ai-supervised",
      order: 1,
      title: "Factory AI Supervisionada",
      summary: "Fase atual: fortalecer a Factory AI para conversar, analisar, planejar e supervisionar evolução da própria Factory.",
      goals: [
        "consolidar planner",
        "consolidar bridge",
        "consolidar actions",
        "consolidar patch supervisor",
        "manter apply supervisionado",
        "estabilizar memória operacional"
      ],
      allow: {
        chat: true,
        planning: true,
        memory: true,
        approvals: true,
        stage: true,
        apply: false,
        autoloop: false,
        autonomousPatch: false,
        autonomousAppBuild: false
      }
    },
    {
      id: "factory-ai-assisted-apply",
      order: 2,
      title: "Factory AI com Apply Assistido",
      summary: "Factory AI já consegue preparar e aplicar patch com autorização humana explícita e validação forte.",
      goals: [
        "apply assistido seguro",
        "aprimorar injector",
        "confirmar alvo correto antes de write",
        "melhorar rollback e logs"
      ],
      allow: {
        chat: true,
        planning: true,
        memory: true,
        approvals: true,
        stage: true,
        apply: true,
        autoloop: false,
        autonomousPatch: false,
        autonomousAppBuild: false
      }
    },
    {
      id: "factory-ai-autoloop-supervised",
      order: 3,
      title: "Factory AI AutoLoop Supervisionado",
      summary: "Factory AI pode rodar ciclos periódicos de análise e plano, mas sem apply automático.",
      goals: [
        "rodar análise periódica",
        "gerar plano automaticamente",
        "registrar memória",
        "mostrar proposta para aprovação humana"
      ],
      allow: {
        chat: true,
        planning: true,
        memory: true,
        approvals: true,
        stage: true,
        apply: true,
        autoloop: true,
        autonomousPatch: false,
        autonomousAppBuild: false
      }
    },
    {
      id: "agent-ai-bootstrap",
      order: 4,
      title: "Bootstrap do Agent AI",
      summary: "Depois da Factory AI estabilizada, começar a subir o Agent AI para criação assistida de aplicativos.",
      goals: [
        "subir motor do agent ai",
        "ligar agent ao app selecionado",
        "usar preview como destino de validação",
        "separar criação de app do núcleo da factory"
      ],
      allow: {
        chat: true,
        planning: true,
        memory: true,
        approvals: true,
        stage: true,
        apply: true,
        autoloop: true,
        autonomousPatch: false,
        autonomousAppBuild: false
      }
    },
    {
      id: "preview-validation-pipeline",
      order: 5,
      title: "Preview + Validation Pipeline",
      summary: "Troca do Generator por Preview com esteira de teste IA + validação IA + aprovação humana.",
      goals: [
        "renomear generator para preview",
        "agrupar preview, test ai e validation ai",
        "criar pipeline de revisão",
        "melhorar qualidade antes de publicação"
      ],
      allow: {
        chat: true,
        planning: true,
        memory: true,
        approvals: true,
        stage: true,
        apply: true,
        autoloop: true,
        autonomousPatch: false,
        autonomousAppBuild: false
      }
    },
    {
      id: "opportunity-scan-expansion",
      order: 6,
      title: "Opportunity Scan Expansion",
      summary: "Subir a camada separada de varredura de oportunidades de apps rentáveis, sem misturar com o núcleo da Factory AI.",
      goals: [
        "separar opportunity scan",
        "varrer nichos",
        "priorizar oportunidades aprováveis",
        "alimentar factory com ideias supervisionadas"
      ],
      allow: {
        chat: true,
        planning: true,
        memory: true,
        approvals: true,
        stage: true,
        apply: true,
        autoloop: true,
        autonomousPatch: false,
        autonomousAppBuild: true
      }
    }
  ];

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    currentPhaseId: DEFAULT_PHASE,
    history: [],
    lastRecommendation: null
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

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_PHASE_ENGINE] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_PHASE_ENGINE] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_PHASE_ENGINE]", level, msg, extra || ""); } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
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

      state.version = VERSION;
      state.ready = !!parsed.ready;
      state.lastUpdate = parsed.lastUpdate || null;
      state.currentPhaseId = trimText(parsed.currentPhaseId || DEFAULT_PHASE) || DEFAULT_PHASE;
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-80) : [];
      state.lastRecommendation = parsed.lastRecommendation || null;
      return true;
    } catch (_) {
      return false;
    }
  }

  function getPhaseById(id) {
    var want = trimText(id || "");
    for (var i = 0; i < PHASES.length; i++) {
      if (PHASES[i].id === want) return clone(PHASES[i]);
    }
    return null;
  }

  function getCurrentPhase() {
    return getPhaseById(state.currentPhaseId) || getPhaseById(DEFAULT_PHASE);
  }

  function getPhaseIndex(id) {
    var want = trimText(id || "");
    for (var i = 0; i < PHASES.length; i++) {
      if (PHASES[i].id === want) return i;
    }
    return -1;
  }

  function rememberHistory(type, detail) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push({
      type: trimText(type || "event"),
      ts: nowISO(),
      detail: clone(detail || {})
    });
    if (state.history.length > 80) {
      state.history = state.history.slice(-80);
    }
    persist();
  }

  function getPlannerStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_PLANNER?.status?.() || {};
    }, {});
  }

  function getBridgeStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_BRIDGE?.status?.() || {};
    }, {});
  }

  function getActionsStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_ACTIONS?.status?.() || {};
    }, {});
  }

  function getPatchSupervisorStatus() {
    return safe(function () {
      return global.RCF_PATCH_SUPERVISOR?.status?.() || {};
    }, {});
  }

  function getMemoryStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_MEMORY?.status?.() || {};
    }, {});
  }

  function getAutoLoopStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_AUTOLOOP?.status?.() || {};
    }, {});
  }

  function getFactoryState() {
    return safe(function () {
      if (global.RCF_FACTORY_STATE?.getState) return global.RCF_FACTORY_STATE.getState();
      if (global.RCF_FACTORY_STATE?.status) return global.RCF_FACTORY_STATE.status();
      return {};
    }, {});
  }

  function buildRuntimeSnapshot() {
    return {
      ts: nowISO(),
      factoryState: clone(getFactoryState() || {}),
      planner: clone(getPlannerStatus() || {}),
      bridge: clone(getBridgeStatus() || {}),
      actions: clone(getActionsStatus() || {}),
      patchSupervisor: clone(getPatchSupervisorStatus() || {}),
      memory: clone(getMemoryStatus() || {}),
      autoloop: clone(getAutoLoopStatus() || {})
    };
  }

  function evaluateReadiness() {
    var planner = getPlannerStatus();
    var bridge = getBridgeStatus();
    var actions = getActionsStatus();
    var patchSupervisor = getPatchSupervisorStatus();
    var memory = getMemoryStatus();
    var autoloop = getAutoLoopStatus();

    return {
      plannerReady: !!planner.ready,
      bridgeReady: !!bridge.ready,
      actionsReady: !!actions.ready,
      patchSupervisorReady: !!patchSupervisor.ready,
      memoryReady: !!memory.ready,
      autoloopReady: !!autoloop.ready,
      stagedPatch: !!patchSupervisor.hasStagedPatch,
      applyReady: !!patchSupervisor.ready
    };
  }

  function canMoveTo(phaseId) {
    var phase = getPhaseById(phaseId);
    if (!phase) {
      return {
        ok: false,
        msg: "fase inexistente"
      };
    }

    var rr = evaluateReadiness();
    var reasons = [];

    if (phase.id === "factory-ai-supervised") {
      return { ok: true, reasons: ["fase base sempre permitida"] };
    }

    if (phase.id === "factory-ai-assisted-apply") {
      if (!rr.plannerReady) reasons.push("planner não pronto");
      if (!rr.bridgeReady) reasons.push("bridge não pronto");
      if (!rr.actionsReady) reasons.push("actions não pronto");
      if (!rr.patchSupervisorReady) reasons.push("patch supervisor não pronto");
    }

    if (phase.id === "factory-ai-autoloop-supervised") {
      if (!rr.plannerReady) reasons.push("planner não pronto");
      if (!rr.bridgeReady) reasons.push("bridge não pronto");
      if (!rr.actionsReady) reasons.push("actions não pronto");
      if (!rr.patchSupervisorReady) reasons.push("patch supervisor não pronto");
      if (!rr.memoryReady) reasons.push("memory não pronta");
      if (!rr.autoloopReady) reasons.push("autoloop não pronto");
    }

    if (phase.id === "agent-ai-bootstrap") {
      if (!rr.plannerReady) reasons.push("planner não pronto");
      if (!rr.bridgeReady) reasons.push("bridge não pronto");
      if (!rr.actionsReady) reasons.push("actions não pronto");
      if (!rr.memoryReady) reasons.push("memory não pronta");
    }

    if (phase.id === "preview-validation-pipeline") {
      if (!rr.plannerReady) reasons.push("planner não pronto");
      if (!rr.bridgeReady) reasons.push("bridge não pronto");
      if (!rr.actionsReady) reasons.push("actions não pronto");
      if (!rr.memoryReady) reasons.push("memory não pronta");
    }

    if (phase.id === "opportunity-scan-expansion") {
      if (!rr.plannerReady) reasons.push("planner não pronto");
      if (!rr.bridgeReady) reasons.push("bridge não pronto");
      if (!rr.actionsReady) reasons.push("actions não pronto");
      if (!rr.memoryReady) reasons.push("memory não pronta");
      if (!rr.autoloopReady) reasons.push("autoloop não pronto");
    }

    return {
      ok: reasons.length === 0,
      reasons: reasons
    };
  }

  function recommendNextPhase() {
    var current = getCurrentPhase();
    var currentIdx = getPhaseIndex(current && current.id);
    var rec = {
      from: current ? current.id : DEFAULT_PHASE,
      to: current ? current.id : DEFAULT_PHASE,
      ok: true,
      reason: "Manter fase atual por enquanto.",
      runtime: evaluateReadiness()
    };

    if (currentIdx < 0) {
      rec.to = DEFAULT_PHASE;
      rec.reason = "Fase atual inválida; voltar para fase base supervisionada.";
      state.lastRecommendation = clone(rec);
      persist();
      return rec;
    }

    for (var i = currentIdx + 1; i < PHASES.length; i++) {
      var target = PHASES[i];
      var check = canMoveTo(target.id);
      if (check.ok) {
        rec.to = target.id;
        rec.reason = "Próxima fase liberada com base na prontidão atual dos módulos.";
        rec.check = check;
        state.lastRecommendation = clone(rec);
        persist();
        return rec;
      }
    }

    rec.check = canMoveTo(current.id);
    state.lastRecommendation = clone(rec);
    persist();
    return rec;
  }

  function setPhase(phaseId, meta) {
    var phase = getPhaseById(phaseId);
    if (!phase) {
      return {
        ok: false,
        msg: "fase inexistente"
      };
    }

    var check = canMoveTo(phase.id);
    if (!check.ok && phase.id !== DEFAULT_PHASE) {
      return {
        ok: false,
        msg: "fase bloqueada",
        reasons: clone(check.reasons || [])
      };
    }

    state.currentPhaseId = phase.id;
    persist();
    rememberHistory("phase:set", {
      phaseId: phase.id,
      meta: clone(meta || {})
    });

    pushLog("OK", "phase set ✅", {
      phaseId: phase.id
    });

    emit("RCF:FACTORY_PHASE_CHANGED", {
      phase: clone(phase),
      meta: clone(meta || {})
    });

    return {
      ok: true,
      phase: clone(phase),
      runtime: evaluateReadiness()
    };
  }

  function nextPhase(meta) {
    var current = getCurrentPhase();
    var idx = getPhaseIndex(current && current.id);
    if (idx < 0) return setPhase(DEFAULT_PHASE, meta);

    if (idx >= PHASES.length - 1) {
      return {
        ok: false,
        msg: "já está na última fase"
      };
    }

    return setPhase(PHASES[idx + 1].id, meta);
  }

  function previousPhase(meta) {
    var current = getCurrentPhase();
    var idx = getPhaseIndex(current && current.id);
    if (idx <= 0) {
      return {
        ok: false,
        msg: "já está na primeira fase"
      };
    }

    return setPhase(PHASES[idx - 1].id, meta);
  }

  function explainCurrentPhase() {
    var phase = getCurrentPhase();
    var rec = recommendNextPhase();

    return {
      ok: true,
      phase: clone(phase),
      recommendation: clone(rec),
      text: [
        "Fase atual: " + trimText(phase && phase.title || ""),
        "Resumo: " + trimText(phase && phase.summary || ""),
        "Próxima fase recomendada: " + trimText(rec.to || ""),
        "Motivo: " + trimText(rec.reason || "")
      ].join("\n")
    };
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      currentPhaseId: state.currentPhaseId || DEFAULT_PHASE,
      currentPhase: clone(getCurrentPhase() || null),
      lastUpdate: state.lastUpdate || null,
      historyCount: Array.isArray(state.history) ? state.history.length : 0,
      lastRecommendation: clone(state.lastRecommendation || null)
    };
  }

  function getCatalog() {
    return clone(PHASES);
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryPhaseEngine");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryPhaseEngine", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryPhaseEngine");
      }
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;

    if (!getPhaseById(state.currentPhaseId)) {
      state.currentPhaseId = DEFAULT_PHASE;
    }

    persist();
    syncPresence();

    pushLog("OK", "factory_phase_engine ready ✅ " + VERSION, {
      phase: state.currentPhaseId
    });

    return status();
  }

  global.RCF_FACTORY_PHASE_ENGINE = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    getState: function () { return clone(state); },
    getCatalog: getCatalog,
    getCurrentPhase: getCurrentPhase,
    explainCurrentPhase: explainCurrentPhase,
    recommendNextPhase: recommendNextPhase,
    canMoveTo: canMoveTo,
    setPhase: setPhase,
    nextPhase: nextPhase,
    previousPhase: previousPhase,
    buildRuntimeSnapshot: buildRuntimeSnapshot
  };

  try { init(); } catch (_) {}

})(window);

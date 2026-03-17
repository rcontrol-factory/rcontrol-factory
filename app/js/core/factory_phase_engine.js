/* FILE: /app/js/core/factory_phase_engine.js
   RControl Factory — Factory Phase Engine
   v1.0.0 SUPERVISED PHASE ENGINE

   Objetivo:
   - definir e manter a fase atual oficial da Factory
   - impedir desvio de foco estratégico
   - ajudar planner/orchestrator/memory a saber o estágio atual
   - priorizar Factory AI antes de Agent AI / Opportunity Scan / Preview expansion
   - preparar evolução gradual e supervisionada
   - NÃO aplicar patch automaticamente
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_PHASE_ENGINE && global.RCF_FACTORY_PHASE_ENGINE.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_phase_engine";
  var MAX_HISTORY = 80;

  var DEFAULT_PHASES = [
    {
      id: "factory-ai-core",
      title: "Factory AI Core",
      description: "Fortalecer a Factory AI como chat técnico central, copiloto da Factory e núcleo de organização/evolução supervisionada.",
      status: "active",
      order: 1,
      priority: "critical-now",
      goals: [
        "Consolidar planner, actions, bridge, memory, orchestrator e patch supervisor",
        "Evitar respostas rasas e ciclo repetitivo doctor/state/registry/tree",
        "Transformar a Factory AI em chat útil, focado e supervisionado",
        "Preparar autoevolução supervisionada"
      ],
      allowedScopes: [
        "factory-ai",
        "planner",
        "actions",
        "bridge",
        "memory",
        "orchestrator",
        "patch-supervisor",
        "backend",
        "context"
      ],
      blockedScopes: [
        "agent-ai-full-build",
        "opportunity-scan-full-build",
        "mass-app-generation",
        "preview-expansion-heavy"
      ],
      nextTargets: [
        "/app/js/core/factory_ai_planner.js",
        "/app/js/core/factory_ai_actions.js",
        "/functions/api/admin-ai.js",
        "/app/js/admin.admin_ai.js",
        "/app/js/core/patch_supervisor.js",
        "/app/js/core/factory_ai_memory.js",
        "/app/js/core/factory_phase_engine.js"
      ]
    },
    {
      id: "preview-rename-and-qa",
      title: "Preview + Test AI + Validation AI",
      description: "Depois da Factory AI estabilizada, reorganizar a área hoje chamada Generator para Preview e encaixar teste/validação supervisionados.",
      status: "queued",
      order: 2,
      priority: "high",
      goals: [
        "Renomear Generator para Preview",
        "Colocar Test AI e Validation AI dentro da área Preview",
        "Preparar fluxo de visualização e aprovação"
      ],
      allowedScopes: [
        "preview",
        "test-ai",
        "validation-ai",
        "ui-preview"
      ],
      blockedScopes: [
        "autonomous-publish"
      ],
      nextTargets: [
        "/app/app.js",
        "/app/js/core/ui_router.js",
        "/app/js/core/ui_runtime.js",
        "/app/js/core/ui_views.js"
      ]
    },
    {
      id: "agent-ai-foundation",
      title: "Agent AI Foundation",
      description: "Criar a base do agente de geração de aplicativos, separado da Factory AI.",
      status: "queued",
      order: 3,
      priority: "high",
      goals: [
        "Separar Factory AI de Agent AI",
        "Definir fluxo de criação supervisionada de app",
        "Usar Preview como área de visualização"
      ],
      allowedScopes: [
        "agent-ai",
        "builder",
        "preview"
      ],
      blockedScopes: [
        "autonomous-publish",
        "mass-production"
      ],
      nextTargets: [
        "/app/app.js",
        "/app/js/core/builder.js",
        "/app/js/core/preview_runner.js"
      ]
    },
    {
      id: "opportunity-scan-foundation",
      title: "Opportunity Scan Foundation",
      description: "Criar a base separada da varredura de oportunidades de aplicativos rentáveis.",
      status: "queued",
      order: 4,
      priority: "medium",
      goals: [
        "Separar Opportunity Scan da Factory AI",
        "Permitir pesquisa de oportunidades",
        "Manter aprovação humana antes de build"
      ],
      allowedScopes: [
        "opportunity-scan",
        "research",
        "ranking"
      ],
      blockedScopes: [
        "auto-build-without-approval"
      ],
      nextTargets: [
        "/app/app.js"
      ]
    }
  ];

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    activePhaseId: "factory-ai-core",
    manualLock: true,
    phases: clone(DEFAULT_PHASES),
    history: [],
    notes: []
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;

      state = merge(clone(state), parsed);

      if (!Array.isArray(state.phases) || !state.phases.length) {
        state.phases = clone(DEFAULT_PHASES);
      }

      if (!Array.isArray(state.history)) state.history = [];
      if (!Array.isArray(state.notes)) state.notes = [];

      normalizePhases();
      return true;
    } catch (_) {
      return false;
    }
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

  function normalizePhase(input) {
    if (!input || typeof input !== "object") return null;

    var id = trimText(input.id || "");
    if (!id) return null;

    var phase = {
      id: id,
      title: trimText(input.title || id),
      description: trimText(input.description || ""),
      status: trimText(input.status || "queued"),
      order: Number(input.order || 999) || 999,
      priority: trimText(input.priority || "medium"),
      goals: asArray(input.goals).map(function (x) { return trimText(x); }).filter(Boolean),
      allowedScopes: uniq(asArray(input.allowedScopes).map(function (x) { return trimText(x); }).filter(Boolean)),
      blockedScopes: uniq(asArray(input.blockedScopes).map(function (x) { return trimText(x); }).filter(Boolean)),
      nextTargets: uniq(asArray(input.nextTargets).map(function (x) { return normalizePath(x); }).filter(Boolean))
    };

    return phase;
  }

  function normalizePhases() {
    state.phases = asArray(state.phases)
      .map(normalizePhase)
      .filter(Boolean)
      .sort(function (a, b) { return a.order - b.order; });

    if (!findPhase(state.activePhaseId)) {
      state.activePhaseId = "factory-ai-core";
    }

    state.phases.forEach(function (phase) {
      if (phase.id === state.activePhaseId) {
        phase.status = "active";
      } else if (phase.status === "active") {
        phase.status = "queued";
      }
    });
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function findPhase(id) {
    var want = trimText(id || "");
    for (var i = 0; i < state.phases.length; i++) {
      if (String(state.phases[i].id || "") === want) {
        return state.phases[i];
      }
    }
    return null;
  }

  function getCurrentPhase() {
    return clone(findPhase(state.activePhaseId) || null);
  }

  function getQueuedPhases() {
    return clone(state.phases.filter(function (phase) {
      return phase.id !== state.activePhaseId;
    }));
  }

  function setActivePhase(phaseId, meta) {
    var want = trimText(phaseId || "");
    var phase = findPhase(want);

    if (!phase) {
      return { ok: false, msg: "fase não encontrada" };
    }

    state.activePhaseId = phase.id;
    normalizePhases();
    persist();

    pushHistory({
      type: "phase-switch",
      phaseId: phase.id,
      title: phase.title,
      ts: nowISO(),
      meta: clone(meta || {})
    });

    emit("RCF:FACTORY_PHASE_CHANGED", {
      activePhase: clone(phase),
      meta: clone(meta || {})
    });

    pushLog("OK", "active phase updated ✅", {
      phaseId: phase.id,
      title: phase.title
    });

    return {
      ok: true,
      activePhase: clone(phase)
    };
  }

  function addNote(note) {
    var text = trimText(note || "");
    if (!text) return { ok: false, msg: "nota vazia" };

    var item = {
      id: "phase_note_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now(),
      text: text,
      ts: nowISO()
    };

    state.notes.push(item);
    if (state.notes.length > MAX_HISTORY) {
      state.notes = state.notes.slice(-MAX_HISTORY);
    }

    persist();

    emit("RCF:FACTORY_PHASE_NOTE", { note: clone(item) });
    return { ok: true, note: clone(item) };
  }

  function getMemorySignals() {
    var memory = safe(function () { return global.RCF_FACTORY_AI_MEMORY || null; }, null);
    if (!memory) {
      return {
        ready: false,
        counters: {},
        latest: []
      };
    }

    return {
      ready: true,
      counters: safe(function () { return memory.status().counters || {}; }, {}),
      latest: safe(function () {
        var data = memory.latest(8);
        return data && data.ok ? data.items : [];
      }, [])
    };
  }

  function getPlannerSignals() {
    var planner = safe(function () { return global.RCF_FACTORY_AI_PLANNER || null; }, null);
    return {
      ready: !!planner,
      status: safe(function () { return planner.status ? planner.status() : {}; }, {}),
      lastPlan: safe(function () { return planner.getLastPlan ? planner.getLastPlan() : null; }, null)
    };
  }

  function inferScopeFromFile(path) {
    var p = lower(normalizePath(path));

    if (!p) return "";
    if (p.indexOf("/app/js/core/factory_ai_") === 0) return "factory-ai";
    if (p.indexOf("/app/js/admin.admin_ai.js") === 0) return "factory-ai";
    if (p.indexOf("/functions/api/admin-ai.js") === 0) return "backend";
    if (p.indexOf("/app/js/core/patch_supervisor.js") === 0) return "patch-supervisor";
    if (p.indexOf("/app/js/core/context_engine.js") === 0) return "context";
    if (p.indexOf("/app/js/core/builder") >= 0) return "builder";
    if (p.indexOf("/preview") >= 0) return "preview";
    if (p.indexOf("/agent") >= 0) return "agent-ai";
    if (p.indexOf("/opportunity") >= 0) return "opportunity-scan";
    if (p.indexOf("/ui_") >= 0) return "ui-preview";

    return "general";
  }

  function isFileAllowedInCurrentPhase(path) {
    var phase = getCurrentPhase();
    var file = normalizePath(path);
    var scope = inferScopeFromFile(file);

    if (!phase) {
      return {
        ok: false,
        allowed: false,
        reason: "fase atual ausente",
        scope: scope
      };
    }

    if (phase.blockedScopes.indexOf(scope) >= 0) {
      return {
        ok: true,
        allowed: false,
        reason: "escopo bloqueado na fase atual",
        scope: scope,
        phase: phase.id
      };
    }

    if (phase.allowedScopes.length && phase.allowedScopes.indexOf(scope) < 0 && scope !== "general") {
      return {
        ok: true,
        allowed: false,
        reason: "escopo fora do foco principal da fase atual",
        scope: scope,
        phase: phase.id
      };
    }

    return {
      ok: true,
      allowed: true,
      reason: "arquivo compatível com a fase atual",
      scope: scope,
      phase: phase.id
    };
  }

  function getRecommendedTargets(limit) {
    var phase = getCurrentPhase();
    var max = Math.max(1, Number(limit || 8));

    if (!phase) {
      return { ok: false, msg: "fase atual ausente", items: [] };
    }

    var memory = safe(function () { return global.RCF_FACTORY_AI_MEMORY || null; }, null);
    var avoidMap = {};

    if (memory && typeof memory.getAvoidFiles === "function") {
      safe(function () {
        asArray(memory.getAvoidFiles()).forEach(function (item) {
          var file = normalizePath(item.file || "");
          if (!file) return;
          avoidMap[file] = trimText(item.reason || "avoid");
        });
      }, null);
    }

    var items = asArray(phase.nextTargets).filter(function (file) {
      return !avoidMap[normalizePath(file)];
    }).slice(0, max);

    return {
      ok: true,
      phaseId: phase.id,
      items: clone(items),
      avoided: clone(avoidMap)
    };
  }

  function evaluateNextStep(input) {
    var phase = getCurrentPhase();
    var plannerSignals = getPlannerSignals();
    var memorySignals = getMemorySignals();
    var targetFile = normalizePath(
      safe(function () { return input.targetFile; }, "") ||
      safe(function () { return plannerSignals.lastPlan.targetFile; }, "") ||
      safe(function () { return plannerSignals.lastPlan.nextFile; }, "")
    );

    var fileCheck = targetFile
      ? isFileAllowedInCurrentPhase(targetFile)
      : {
          ok: true,
          allowed: true,
          reason: "sem targetFile explícito",
          scope: "general"
        };

    var recommended = getRecommendedTargets(5);

    return {
      ok: true,
      phase: clone(phase),
      plannerReady: !!plannerSignals.ready,
      memoryReady: !!memorySignals.ready,
      targetFile: targetFile,
      fileCheck: clone(fileCheck),
      recommendedTargets: clone(recommended.items || []),
      memoryCounters: clone(memorySignals.counters || {}),
      lastPlan: clone(plannerSignals.lastPlan || null),
      note: phase
        ? "A fase atual ainda prioriza a evolução da Factory AI antes das expansões posteriores."
        : "dado ausente"
    };
  }

  function suggestPhaseByContext(input) {
    var prompt = lower(
      safe(function () { return input.prompt; }, "") ||
      safe(function () { return input.goal; }, "") ||
      safe(function () { return input.reason; }, "")
    );

    if (!prompt) {
      return {
        ok: true,
        suggestedPhaseId: state.activePhaseId,
        reason: "sem contexto adicional; manter fase atual"
      };
    }

    if (
      prompt.indexOf("preview") >= 0 ||
      prompt.indexOf("generator") >= 0 ||
      prompt.indexOf("test ai") >= 0 ||
      prompt.indexOf("validation ai") >= 0
    ) {
      return {
        ok: true,
        suggestedPhaseId: "preview-rename-and-qa",
        reason: "pedido ligado a preview/qa"
      };
    }

    if (
      prompt.indexOf("agent ai") >= 0 ||
      prompt.indexOf("agente ai") >= 0 ||
      prompt.indexOf("builder") >= 0
    ) {
      return {
        ok: true,
        suggestedPhaseId: "agent-ai-foundation",
        reason: "pedido ligado a agent ai"
      };
    }

    if (
      prompt.indexOf("opportunity") >= 0 ||
      prompt.indexOf("scan") >= 0 ||
      prompt.indexOf("oportunidade") >= 0
    ) {
      return {
        ok: true,
        suggestedPhaseId: "opportunity-scan-foundation",
        reason: "pedido ligado a opportunity scan"
      };
    }

    return {
      ok: true,
      suggestedPhaseId: "factory-ai-core",
      reason: "pedido ainda está no foco da evolução da Factory AI"
    };
  }

  function buildPhaseContext() {
    var current = getCurrentPhase();
    var recommended = getRecommendedTargets(6);
    var memorySignals = getMemorySignals();
    var plannerSignals = getPlannerSignals();

    return {
      ok: true,
      version: VERSION,
      activePhase: clone(current),
      queuedPhases: getQueuedPhases(),
      recommendedTargets: clone(recommended.items || []),
      plannerReady: !!plannerSignals.ready,
      plannerStatus: clone(plannerSignals.status || {}),
      memoryReady: !!memorySignals.ready,
      memoryCounters: clone(memorySignals.counters || {}),
      notes: clone(state.notes.slice(-12))
    };
  }

  function status() {
    var current = getCurrentPhase();

    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      activePhaseId: state.activePhaseId || "",
      activePhaseTitle: safe(function () { return current.title; }, ""),
      manualLock: !!state.manualLock,
      phasesCount: asArray(state.phases).length,
      historyCount: asArray(state.history).length,
      notesCount: asArray(state.notes).length
    };
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
      global.addEventListener("RCF:FACTORY_AI_PLAN_READY", function (ev) {
        try {
          var plan = ev && ev.detail ? ev.detail.plan || ev.detail : null;
          var targetFile = normalizePath(safe(function () { return plan.targetFile || plan.nextFile; }, ""));
          if (!targetFile) return;

          var check = isFileAllowedInCurrentPhase(targetFile);

          pushHistory({
            type: "plan-evaluated",
            targetFile: targetFile,
            allowed: !!check.allowed,
            reason: check.reason || "",
            phaseId: state.activePhaseId,
            ts: nowISO()
          });
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    normalizePhases();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    syncPresence();
    bindEvents();

    pushLog("OK", "factory_phase_engine ready ✅ " + VERSION, {
      activePhaseId: state.activePhaseId
    });

    return status();
  }

  global.RCF_FACTORY_PHASE_ENGINE = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    getState: function () { return clone(state); },
    getCurrentPhase: getCurrentPhase,
    getQueuedPhases: getQueuedPhases,
    getRoadmap: function () { return clone(state.phases); },
    setActivePhase: setActivePhase,
    addNote: addNote,
    evaluateNextStep: evaluateNextStep,
    suggestPhaseByContext: suggestPhaseByContext,
    isFileAllowedInCurrentPhase: isFileAllowedInCurrentPhase,
    getRecommendedTargets: getRecommendedTargets,
    buildPhaseContext: buildPhaseContext
  };

  try { init(); } catch (_) {}

})(window);

/* FILE: /app/js/core/factory_ai_focus_engine.js
   RControl Factory — Factory AI Focus Engine
   v1.0.1 SUPERVISED FOCUS ORCHESTRATOR

   Objetivo:
   - manter a Factory AI focada no alvo certo da fase atual
   - evitar rodízio burro de arquivos já mexidos
   - consolidar foco entre phase_engine + planner + bridge + runtime + memory + patch supervisor
   - priorizar próximo alvo com base no estado real do runtime
   - expor contexto curto e útil para UI / orchestrator / autoloop / diagnostics
   - funcionar como script clássico

   PATCH v1.0.1:
   - FIX: adiciona scheduleFocus para evitar tempestade de rebuild em cascata
   - FIX: getPhaseContext mais robusto com fallback para phaseId/phaseTitle
   - FIX: readiness de actions aceita ready/plannerReady
   - FIX: persist limita history corretamente
   - FIX: bindEvents usa guarda própria da versão atual
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_FOCUS_ENGINE && global.RCF_FACTORY_AI_FOCUS_ENGINE.__v101) return;

  var VERSION = "v1.0.1";
  var STORAGE_KEY = "rcf:factory_ai_focus_engine";
  var MAX_HISTORY = 80;
  var FOCUS_DEBOUNCE_MS = 180;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastFocus: null,
    history: []
  };

  var __focusTimer = null;

  var FOCUS_PRESETS = {
    "factory-ai-supervised": {
      primary: "factory-ai-core",
      labels: [
        "factory-ai-core",
        "planner-bridge-actions",
        "proposal-flow",
        "supervised-runtime"
      ],
      preferredTargets: [
        "/app/js/core/factory_ai_diagnostics.js",
        "/app/js/core/factory_ai_autoheal.js",
        "/app/js/core/factory_ai_focus_engine.js",
        "/app/js/core/factory_ai_orchestrator.js",
        "/app/js/core/factory_ai_runtime.js"
      ]
    },
    "factory-ai-assisted-apply": {
      primary: "assisted-apply",
      labels: [
        "assisted-apply",
        "patch-safety",
        "writer-fallback",
        "approval-flow"
      ],
      preferredTargets: [
        "/app/js/core/patch_supervisor.js",
        "/app/js/core/factory_ai_runtime.js",
        "/app/js/core/factory_ai_proposal_ui.js",
        "/app/js/core/factory_ai_actions.js"
      ]
    },
    "factory-ai-autoloop-supervised": {
      primary: "autoloop-supervised",
      labels: [
        "autoloop-supervised",
        "scheduled-planning",
        "memory-loop",
        "proposal-cycle"
      ],
      preferredTargets: [
        "/app/js/core/factory_ai_autoloop.js",
        "/app/js/core/factory_ai_self_evolution.js",
        "/app/js/core/factory_ai_memory.js",
        "/app/js/core/factory_ai_runtime.js"
      ]
    },
    "agent-ai-bootstrap": {
      primary: "agent-bootstrap",
      labels: [
        "agent-bootstrap",
        "agent-runtime",
        "preview-link",
        "app-build-handoff"
      ],
      preferredTargets: [
        "/app/js/core/factory_ai_runtime.js",
        "/app/js/core/factory_ai_orchestrator.js",
        "/app/js/admin.admin_ai.js"
      ]
    },
    "preview-validation-pipeline": {
      primary: "preview-pipeline",
      labels: [
        "preview-pipeline",
        "test-ai",
        "validation-ai",
        "preview-runtime"
      ],
      preferredTargets: [
        "/app/js/ui/ui_views.js",
        "/app/js/core/ui_router.js",
        "/app/js/core/ui_bindings.js",
        "/app/app.js"
      ]
    },
    "opportunity-scan-expansion": {
      primary: "opportunity-expansion",
      labels: [
        "opportunity-expansion",
        "scanner-structure",
        "separate-domain"
      ],
      preferredTargets: [
        "/app/js/core/factory_ai_runtime.js",
        "/app/js/core/factory_ai_orchestrator.js",
        "/functions/api/admin-ai.js"
      ]
    }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        lastUpdate: state.lastUpdate,
        lastFocus: clone(state.lastFocus || null),
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

      state.version = VERSION;
      state.ready = !!parsed.ready;
      state.lastUpdate = parsed.lastUpdate || null;
      state.lastFocus = clone(parsed.lastFocus || null);
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];
      return true;
    } catch (_) {
      return false;
    }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_FOCUS_ENGINE] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_FOCUS_ENGINE] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_FOCUS_ENGINE]", level, msg, extra || ""); } catch (_) {}
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

  function getPhaseContext() {
    var api = safe(function () { return global.RCF_FACTORY_PHASE_ENGINE || null; }, null);

    if (!api || typeof api.buildPhaseContext !== "function") {
      return {
        activePhaseId: "",
        activePhaseTitle: "",
        activePhase: null,
        recommendedTargets: []
      };
    }

    var ctx = safe(function () { return api.buildPhaseContext(); }, {}) || {};
    var activePhase = clone(safe(function () { return ctx.activePhase; }, null));

    return {
      activePhaseId:
        trimText(ctx.activePhaseId || "") ||
        trimText(ctx.phaseId || "") ||
        trimText(safe(function () { return activePhase.id; }, "")),
      activePhaseTitle:
        trimText(ctx.activePhaseTitle || "") ||
        trimText(ctx.phaseTitle || "") ||
        trimText(safe(function () { return activePhase.title; }, "")),
      activePhase: activePhase,
      recommendedTargets: clone(ctx.recommendedTargets || [])
    };
  }

  function getPlannerStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_PLANNER?.status?.() || {};
    }, {});
  }

  function getPlannerPlan() {
    return safe(function () {
      return global.RCF_FACTORY_AI_PLANNER?.getLastPlan?.() || null;
    }, null);
  }

  function getBridgeStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_BRIDGE?.status?.() || {};
    }, {});
  }

  function getBridgePlan() {
    return safe(function () {
      return global.RCF_FACTORY_AI_BRIDGE?.getLastPlan?.() || null;
    }, null);
  }

  function getRuntimeStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_RUNTIME?.status?.() || {};
    }, {});
  }

  function getActionsStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_ACTIONS?.status?.() || {};
    }, {});
  }

  function isActionsReady(actionsStatus) {
    var st = actionsStatus || {};
    return !!(st.ready || st.plannerReady);
  }

  function getPatchSupervisorStatus() {
    return safe(function () {
      return global.RCF_PATCH_SUPERVISOR?.status?.() || {};
    }, {});
  }

  function getMemoryContext() {
    return safe(function () {
      return global.RCF_FACTORY_AI_MEMORY?.buildMemoryContext?.(20) || {};
    }, {});
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
      return global.RCF_MODULE_REGISTRY?.summary?.() || {};
    }, {});
  }

  function getTreeSummary() {
    return safe(function () {
      return global.RCF_FACTORY_TREE?.summary?.() || {};
    }, {});
  }

  function getPreset(phaseId) {
    return clone(FOCUS_PRESETS[trimText(phaseId || "")] || FOCUS_PRESETS["factory-ai-supervised"]);
  }

  function fileFromPlannerFirst() {
    var plannerPlan = getPlannerPlan();
    if (plannerPlan && (plannerPlan.targetFile || plannerPlan.nextFile)) {
      return normalizePath(plannerPlan.targetFile || plannerPlan.nextFile || "");
    }

    var bridgePlan = getBridgePlan();
    if (bridgePlan && (bridgePlan.targetFile || bridgePlan.nextFile)) {
      return normalizePath(bridgePlan.targetFile || bridgePlan.nextFile || "");
    }

    return "";
  }

  function getAvoidFiles() {
    var memory = getMemoryContext();
    var list = asArray(memory.avoidFiles);
    return list.map(function (item) {
      return {
        file: normalizePath(item.file || ""),
        reason: trimText(item.reason || "")
      };
    }).filter(function (item) {
      return !!item.file;
    });
  }

  function isAvoided(path, avoidFiles) {
    var want = normalizePath(path);
    var found = null;

    asArray(avoidFiles).forEach(function (item) {
      if (found) return;
      if (normalizePath(item.file || "") === want) {
        found = item;
      }
    });

    return found;
  }

  function buildCandidateTargets() {
    var phase = getPhaseContext();
    var preset = getPreset(phase.activePhaseId);
    var plannerPlan = getPlannerPlan();
    var bridgePlan = getBridgePlan();
    var tree = getTreeSummary();
    var runtime = getRuntimeStatus();

    var out = [];

    out = out
      .concat(asArray(preset.preferredTargets))
      .concat(asArray(phase.recommendedTargets))
      .concat(asArray(safe(function () { return plannerPlan.suggestedFiles; }, [])))
      .concat(asArray(safe(function () { return plannerPlan.executionLine; }, [])))
      .concat(asArray(safe(function () { return bridgePlan.suggestedFiles; }, [])))
      .concat(asArray(safe(function () { return tree.samples.core; }, [])))
      .concat(asArray(safe(function () { return tree.samples.admin; }, [])));

    if (runtime.lastPlanId) {
      var plannerTarget = fileFromPlannerFirst();
      if (plannerTarget) out.unshift(plannerTarget);
    }

    return uniq(out.map(normalizePath).filter(Boolean));
  }

  function scoreTarget(path, ctx) {
    var file = normalizePath(path);
    var score = 0;
    var reasons = [];

    if (!file) {
      return { file: "", score: -999, reasons: ["arquivo inválido"] };
    }

    var phaseId = trimText(safe(function () { return ctx.phase.activePhaseId; }, ""));
    var preset = getPreset(phaseId);
    var plannerTarget = normalizePath(safe(function () {
      return ctx.plannerPlan.targetFile || ctx.plannerPlan.nextFile;
    }, ""));
    var bridgeTarget = normalizePath(safe(function () {
      return ctx.bridgePlan.targetFile || ctx.bridgePlan.nextFile;
    }, ""));
    var stagedTarget = normalizePath(safe(function () { return ctx.patchSupervisor.stagedTargetFile; }, ""));
    var avoid = isAvoided(file, ctx.avoidFiles);
    var activeView = trimText(safe(function () { return ctx.factoryState.activeView; }, ""));
    var patchReady = !!safe(function () { return ctx.patchSupervisor.ready; }, false);
    var actionsReady = !!isActionsReady(ctx.actions);
    var bridgeReady = !!safe(function () { return ctx.bridge.ready; }, false);
    var plannerReady = !!safe(function () { return ctx.planner.ready; }, false);

    if (asArray(preset.preferredTargets).indexOf(file) >= 0) {
      score += 70;
      reasons.push("alvo preferido da fase ativa");
    }

    if (asArray(safe(function () { return ctx.phase.recommendedTargets; }, [])).indexOf(file) >= 0) {
      score += 55;
      reasons.push("recomendado pelo phase engine");
    }

    if (plannerTarget && plannerTarget === file) {
      score += 85;
      reasons.push("alvo atual do planner");
    }

    if (bridgeTarget && bridgeTarget === file) {
      score += 72;
      reasons.push("alvo atual do bridge");
    }

    if (stagedTarget && stagedTarget === file) {
      score += 40;
      reasons.push("há staged patch neste arquivo");
    }

    if (file.indexOf("/app/js/core/factory_ai_") === 0) {
      score += 24;
      reasons.push("núcleo direto da Factory AI");
    }

    if (file === "/app/js/core/factory_ai_diagnostics.js") {
      score += 36;
      reasons.push("diagnóstico vira base para foco e autoheal");
    }

    if (file === "/app/js/core/factory_ai_autoheal.js") {
      score += 34;
      reasons.push("autoheal fecha ciclo de evolução supervisionada");
    }

    if (file === "/app/js/core/factory_ai_focus_engine.js") {
      score += 18;
      reasons.push("engine de foco reduz rodízio burro");
    }

    if (phaseId === "factory-ai-supervised") {
      if (file.indexOf("/app/js/core/factory_ai_") === 0) {
        score += 16;
        reasons.push("fase atual prioriza evolução da própria Factory AI");
      }
      if (file === "/app/js/core/factory_tree.js") {
        score -= 20;
        reasons.push("tree não deve voltar ao centro sem motivo novo");
      }
      if (file === "/app/js/core/doctor_scan.js") {
        score -= 10;
        reasons.push("doctor não é foco central nesta fase");
      }
    }

    if (plannerReady && bridgeReady && actionsReady && patchReady) {
      if (file === "/app/js/core/factory_ai_diagnostics.js" || file === "/app/js/core/factory_ai_autoheal.js") {
        score += 28;
        reasons.push("base já pronta para subir camada de inteligência operacional");
      }
    }

    if (activeView === "factory-ai" && file.indexOf("/app/js/core/factory_ai_") === 0) {
      score += 10;
      reasons.push("view ativa favorece evolução da Factory AI");
    }

    if (avoid) {
      score -= 80;
      reasons.push("arquivo em cooldown pela memória: " + trimText(avoid.reason || "erro recente"));
    }

    return {
      file: file,
      score: score,
      reasons: uniq(reasons)
    };
  }

  function classifyFocusCategory(targetFile, phaseId) {
    var file = normalizePath(targetFile);

    if (file === "/app/js/core/factory_ai_diagnostics.js") return "diagnostics-layer";
    if (file === "/app/js/core/factory_ai_autoheal.js") return "autoheal-layer";
    if (file === "/app/js/core/factory_ai_focus_engine.js") return "focus-layer";
    if (file.indexOf("/app/js/core/factory_ai_") === 0) return "factory-ai-core";
    if (file.indexOf("/app/js/core/") === 0) return "core-integration";
    if (file.indexOf("/app/js/ui/") === 0) return "ui-pipeline";
    if (file.indexOf("/functions/") === 0) return "backend-support";

    if (trimText(phaseId || "") === "preview-validation-pipeline") return "preview-pipeline";
    return "general-supervision";
  }

  function buildReasonText(top, ctx) {
    var reasons = asArray(top.reasons);
    var phaseTitle = trimText(safe(function () { return ctx.phase.activePhaseTitle; }, ""));

    if (!reasons.length) {
      return "foco calculado com base na fase atual da Factory";
    }

    var text = reasons.slice(0, 3).join("; ");
    if (phaseTitle) {
      text += "; fase ativa: " + phaseTitle;
    }
    return text;
  }

  function buildNotes(ctx, top) {
    var notes = [];
    var plannerReady = !!safe(function () { return ctx.planner.ready; }, false);
    var bridgeReady = !!safe(function () { return ctx.bridge.ready; }, false);
    var actionsReady = !!isActionsReady(ctx.actions);
    var patchReady = !!safe(function () { return ctx.patchSupervisor.ready; }, false);
    var activeView = trimText(safe(function () { return ctx.factoryState.activeView; }, ""));
    var phaseTitle = trimText(safe(function () { return ctx.phase.activePhaseTitle; }, ""));
    var avoidFiles = asArray(ctx.avoidFiles);

    if (phaseTitle) {
      notes.push("Fase ativa: " + phaseTitle + ".");
    }

    if (activeView) {
      notes.push("View ativa atual: " + activeView + ".");
    }

    if (plannerReady && bridgeReady && actionsReady && patchReady) {
      notes.push("Planner + bridge + actions + patch supervisor já permitem subir para camada operacional nova.");
    }

    if (top.file === "/app/js/core/factory_ai_diagnostics.js") {
      notes.push("Diagnostics ajuda a transformar snapshot raso em leitura acionável.");
    }

    if (top.file === "/app/js/core/factory_ai_autoheal.js") {
      notes.push("Autoheal fecha o ciclo diagnosticar -> propor -> aprovar -> stage/apply.");
    }

    if (avoidFiles.length) {
      notes.push("Memória trouxe arquivos em cooldown para evitar repetição burra.");
    }

    return uniq(notes);
  }

  function buildFocus() {
    var phase = getPhaseContext();
    var planner = getPlannerStatus();
    var plannerPlan = getPlannerPlan();
    var bridge = getBridgeStatus();
    var bridgePlan = getBridgePlan();
    var runtime = getRuntimeStatus();
    var actions = getActionsStatus();
    var patchSupervisor = getPatchSupervisorStatus();
    var memory = getMemoryContext();
    var factoryState = getFactoryState();
    var modules = getModuleSummary();
    var tree = getTreeSummary();
    var avoidFiles = getAvoidFiles();
    var preset = getPreset(phase.activePhaseId);

    var ctx = {
      phase: clone(phase || {}),
      planner: clone(planner || {}),
      plannerPlan: clone(plannerPlan || {}),
      bridge: clone(bridge || {}),
      bridgePlan: clone(bridgePlan || {}),
      runtime: clone(runtime || {}),
      actions: clone(actions || {}),
      patchSupervisor: clone(patchSupervisor || {}),
      memory: clone(memory || {}),
      factoryState: clone(factoryState || {}),
      modules: clone(modules || {}),
      tree: clone(tree || {}),
      avoidFiles: clone(avoidFiles || [])
    };

    var candidates = buildCandidateTargets();
    var ranking = candidates.map(function (file) {
      return scoreTarget(file, ctx);
    }).sort(function (a, b) {
      return b.score - a.score;
    });

    var top = ranking[0] || {
      file: normalizePath(asArray(preset.preferredTargets)[0] || "/app/js/core/factory_ai_diagnostics.js"),
      score: 0,
      reasons: ["fallback da fase ativa"]
    };

    var category = classifyFocusCategory(top.file, phase.activePhaseId);
    var notes = buildNotes(ctx, top);
    var reason = buildReasonText(top, ctx);

    var focus = {
      id: "focus_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now(),
      version: VERSION,
      createdAt: nowISO(),

      phaseId: trimText(phase.activePhaseId || ""),
      phaseTitle: trimText(phase.activePhaseTitle || ""),
      focusCategory: category,
      focusLabel: trimText(preset.primary || "factory-ai-core"),

      targetFile: normalizePath(top.file),
      nextFile: normalizePath(top.file),
      reason: reason,
      notes: notes,

      preferredTargets: uniq(asArray(preset.preferredTargets).map(normalizePath).filter(Boolean)),
      suggestedTargets: ranking.slice(0, 8).map(function (item) { return item.file; }),
      ranking: ranking.slice(0, 8),

      avoidFiles: clone(avoidFiles || []),

      runtime: {
        activeView: trimText(factoryState.activeView || ""),
        bootStatus: trimText(factoryState.bootStatus || ""),
        plannerReady: !!planner.ready,
        bridgeReady: !!bridge.ready,
        actionsReady: !!isActionsReady(actions),
        patchSupervisorReady: !!patchSupervisor.ready,
        hasStagedPatch: !!patchSupervisor.hasStagedPatch,
        historyCount: Number(safe(function () { return runtime.historyCount; }, 0) || 0),
        treePathsCount: Number(safe(function () { return tree.counts.total; }, 0) || 0)
      }
    };

    state.lastFocus = clone(focus);
    persist();

    pushHistory({
      type: "focus",
      ts: focus.createdAt,
      phaseId: focus.phaseId,
      focusCategory: focus.focusCategory,
      targetFile: focus.targetFile
    });

    emit("RCF:FACTORY_AI_FOCUS_UPDATED", {
      focus: clone(focus)
    });

    pushLog("OK", "focus updated ✅", {
      phaseId: focus.phaseId,
      focusCategory: focus.focusCategory,
      targetFile: focus.targetFile
    });

    return clone(focus);
  }

  function scheduleFocus(reason) {
    try {
      if (__focusTimer) clearTimeout(__focusTimer);
    } catch (_) {}

    __focusTimer = setTimeout(function () {
      __focusTimer = null;
      try {
        pushLog("INFO", "scheduled focus rebuild", { reason: trimText(reason || "") });
        buildFocus();
      } catch (_) {}
    }, FOCUS_DEBOUNCE_MS);

    return true;
  }

  function getLastFocus() {
    return clone(state.lastFocus || null);
  }

  function refreshFocus() {
    return buildFocus();
  }

  function explainFocus() {
    var focus = state.lastFocus || buildFocus();

    return {
      ok: true,
      focus: clone(focus),
      text: [
        "Fase: " + trimText(focus.phaseTitle || focus.phaseId || ""),
        "Categoria de foco: " + trimText(focus.focusCategory || ""),
        "Arquivo alvo: " + trimText(focus.targetFile || ""),
        "Motivo: " + trimText(focus.reason || ""),
        "Notas: " + asArray(focus.notes).join(" ")
      ].join("\n")
    };
  }

  function buildCompactContext() {
    var focus = state.lastFocus || buildFocus();

    return {
      ok: true,
      version: VERSION,
      focus: {
        phaseId: trimText(focus.phaseId || ""),
        phaseTitle: trimText(focus.phaseTitle || ""),
        focusCategory: trimText(focus.focusCategory || ""),
        focusLabel: trimText(focus.focusLabel || ""),
        targetFile: trimText(focus.targetFile || ""),
        nextFile: trimText(focus.nextFile || ""),
        reason: trimText(focus.reason || "")
      },
      avoidFiles: clone(focus.avoidFiles || []),
      suggestedTargets: clone(focus.suggestedTargets || [])
    };
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      hasFocus: !!state.lastFocus,
      focusCategory: safe(function () { return state.lastFocus.focusCategory; }, ""),
      targetFile: safe(function () { return state.lastFocus.targetFile; }, ""),
      phaseId: safe(function () { return state.lastFocus.phaseId; }, ""),
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIFocusEngine");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIFocusEngine", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIFocusEngine");
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
      if (global.__RCF_FACTORY_AI_FOCUS_ENGINE_EVENTS_V101) return;
      global.__RCF_FACTORY_AI_FOCUS_ENGINE_EVENTS_V101 = true;

      global.addEventListener("RCF:FACTORY_PHASE_CHANGED", function () {
        try { scheduleFocus("RCF:FACTORY_PHASE_CHANGED"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:FACTORY_AI_PLAN_READY", function () {
        try { scheduleFocus("RCF:FACTORY_AI_PLAN_READY"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:FACTORY_AI_APPROVED", function () {
        try { scheduleFocus("RCF:FACTORY_AI_APPROVED"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_STAGED", function () {
        try { scheduleFocus("RCF:PATCH_STAGED"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_APPLIED", function () {
        try { scheduleFocus("RCF:PATCH_APPLIED"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_APPLY_FAILED", function () {
        try { scheduleFocus("RCF:PATCH_APPLY_FAILED"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:UI_READY", function () {
        try { scheduleFocus("RCF:UI_READY"); } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    syncPresence();
    bindEvents();
    buildFocus();
    pushLog("OK", "factory_ai_focus_engine ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_FOCUS_ENGINE = {
    __v100: true,
    __v101: true,
    version: VERSION,
    init: init,
    status: status,
    refreshFocus: refreshFocus,
    scheduleFocus: scheduleFocus,
    getLastFocus: getLastFocus,
    explainFocus: explainFocus,
    buildCompactContext: buildCompactContext,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

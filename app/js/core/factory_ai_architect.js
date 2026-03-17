/* FILE: /app/js/core/factory_ai_architect.js
   RControl Factory — Factory AI Architect
   v1.0.0 SUPERVISED SELF-STRUCTURE ARCHITECT

   Objetivo:
   - atuar como camada de arquitetura supervisionada da Factory AI
   - decidir o próximo tipo de evolução estrutural da própria Factory
   - usar phase_engine + memory + tree + planner + orchestrator
   - evitar repetição burra de alvos já trabalhados
   - propor criação/expansão de módulos internos da Factory
   - NÃO aplicar patch automaticamente
   - produzir proposta pronta para aprovação humana
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_ARCHITECT && global.RCF_FACTORY_AI_ARCHITECT.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_architect";
  var MAX_HISTORY = 80;

  var state = {
    version: VERSION,
    ready: false,
    busy: false,
    lastUpdate: null,
    lastProposal: null,
    lastDecision: null,
    lastTargetFile: "",
    history: []
  };

  var CATALOG = [
    {
      id: "factory-core-self-structure",
      title: "Autoestruturação do núcleo da Factory AI",
      description: "Fortalecer a própria Factory AI para propor, organizar e supervisionar mudanças internas.",
      preferredFiles: [
        "/app/js/core/factory_ai_architect.js",
        "/app/js/core/factory_ai_controller.js",
        "/app/js/core/factory_ai_orchestrator.js",
        "/app/js/core/factory_ai_runtime.js",
        "/app/js/core/factory_ai_memory.js"
      ],
      phaseIds: [
        "factory-ai-supervised",
        "factory-ai-assisted-apply",
        "factory-ai-autoloop-supervised"
      ],
      tags: ["factory-ai", "self-structure", "core"]
    },
    {
      id: "approval-ux-strengthening",
      title: "Fortalecer fluxo de aprovação supervisionada",
      description: "Melhorar a forma como a Factory AI mostra proposta, aprovação, validação e stage para o usuário.",
      preferredFiles: [
        "/app/js/admin.admin_ai.js",
        "/app/js/core/factory_ai_runtime.js",
        "/app/js/core/factory_ai_actions.js",
        "/app/js/core/patch_supervisor.js"
      ],
      phaseIds: [
        "factory-ai-supervised",
        "factory-ai-assisted-apply",
        "factory-ai-autoloop-supervised"
      ],
      tags: ["approval", "ux", "supervision"]
    },
    {
      id: "memory-and-learning-strengthening",
      title: "Fortalecer memória e aprendizado operacional",
      description: "Registrar melhor decisões, falhas, propostas, ciclos e cooldowns para a Factory não repetir erro.",
      preferredFiles: [
        "/app/js/core/factory_ai_memory.js",
        "/app/js/core/factory_ai_autoloop.js",
        "/app/js/core/factory_ai_self_evolution.js",
        "/app/js/core/factory_phase_engine.js"
      ],
      phaseIds: [
        "factory-ai-supervised",
        "factory-ai-autoloop-supervised"
      ],
      tags: ["memory", "learning", "cooldown"]
    },
    {
      id: "preview-pipeline-prep",
      title: "Preparar pipeline Preview/Test/Validation",
      description: "Organizar a futura área Preview com testes e validação sem ainda trocar o foco principal da Factory AI.",
      preferredFiles: [
        "/app/app.js",
        "/app/js/ui/ui_views.js",
        "/app/js/core/ui_router.js",
        "/app/js/core/ui_bindings.js"
      ],
      phaseIds: [
        "preview-validation-pipeline"
      ],
      tags: ["preview", "validation", "pipeline"]
    },
    {
      id: "agent-bootstrap-prep",
      title: "Preparar bootstrap do Agent AI",
      description: "Depois da Factory AI estabilizada, apoiar a separação do fluxo de criação de apps pelo Agent AI.",
      preferredFiles: [
        "/app/js/core/factory_ai_runtime.js",
        "/app/js/core/factory_ai_orchestrator.js",
        "/functions/api/admin-ai.js",
        "/app/js/admin.admin_ai.js"
      ],
      phaseIds: [
        "agent-ai-bootstrap",
        "opportunity-scan-expansion"
      ],
      tags: ["agent-ai", "bootstrap", "apps"]
    }
  ];

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        lastUpdate: state.lastUpdate,
        lastProposal: clone(state.lastProposal || null),
        lastDecision: clone(state.lastDecision || null),
        lastTargetFile: state.lastTargetFile || "",
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
      state.lastUpdate = parsed.lastUpdate || null;
      state.lastProposal = clone(parsed.lastProposal || null);
      state.lastDecision = clone(parsed.lastDecision || null);
      state.lastTargetFile = normalizePath(parsed.lastTargetFile || "");
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];
      state.busy = false;

      return true;
    } catch (_) {
      return false;
    }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_ARCHITECT] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_ARCHITECT] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_ARCHITECT]", level, msg, extra || ""); } catch (_) {}
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
    return safe(function () {
      if (global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext) {
        return global.RCF_FACTORY_PHASE_ENGINE.buildPhaseContext();
      }
      return {};
    }, {});
  }

  function getMemoryContext() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_MEMORY?.buildMemoryContext) {
        return global.RCF_FACTORY_AI_MEMORY.buildMemoryContext(24);
      }
      return {
        ok: false,
        items: [],
        avoidFiles: [],
        phase: null
      };
    }, {
      ok: false,
      items: [],
      avoidFiles: [],
      phase: null
    });
  }

  function getTreeSummary() {
    return safe(function () {
      if (global.RCF_FACTORY_TREE?.summary) {
        return global.RCF_FACTORY_TREE.summary();
      }
      return {};
    }, {});
  }

  function getKnownFiles() {
    return safe(function () {
      if (global.RCF_FACTORY_TREE?.getKnownPaths) {
        return global.RCF_FACTORY_TREE.getKnownPaths();
      }
      return [];
    }, []);
  }

  function getPlannerStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_PLANNER?.status?.() || {};
    }, {});
  }

  function getRuntimeStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_RUNTIME?.status?.() || {};
    }, {});
  }

  function getOrchestratorStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_ORCHESTRATOR?.status?.() || {};
    }, {});
  }

  function getActionsStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_ACTIONS?.status?.() || {};
    }, {});
  }

  function fileExists(path, knownFiles) {
    var want = normalizePath(path);
    var list = asArray(knownFiles).map(normalizePath);
    return list.indexOf(want) >= 0;
  }

  function wasRecentlyTargeted(path) {
    var want = normalizePath(path);
    if (!want) return false;

    var list = asArray(state.history).slice(-12);
    for (var i = list.length - 1; i >= 0; i--) {
      var candidate =
        normalizePath(safe(function () { return list[i].targetFile; }, "")) ||
        normalizePath(safe(function () { return list[i].proposal.targetFile; }, ""));
      if (candidate === want) return true;
    }

    return false;
  }

  function isAvoidedByMemory(path, memoryCtx) {
    var want = normalizePath(path);
    var avoid = asArray(safe(function () { return memoryCtx.avoidFiles; }, []));
    for (var i = 0; i < avoid.length; i++) {
      if (normalizePath(avoid[i].file) === want) {
        return {
          blocked: true,
          reason: trimText(avoid[i].reason || "arquivo em cooldown")
        };
      }
    }
    return {
      blocked: false,
      reason: ""
    };
  }

  function scoreCandidate(file, moduleDef, ctx) {
    var score = 0;
    var reasons = [];

    var f = normalizePath(file);
    var activePhaseId = trimText(safe(function () { return ctx.phase.activePhase.id; }, "")) ||
      trimText(safe(function () { return ctx.phase.activePhaseId; }, ""));
    var knownFiles = asArray(ctx.knownFiles);
    var plannerStatus = ctx.plannerStatus || {};
    var runtimeStatus = ctx.runtimeStatus || {};
    var orchStatus = ctx.orchestratorStatus || {};
    var actionsStatus = ctx.actionsStatus || {};
    var memoryCtx = ctx.memory || {};
    var avoid = isAvoidedByMemory(f, memoryCtx);

    if (!f) return { file: f, score: -999, reasons: ["arquivo inválido"] };

    if (asArray(moduleDef.phaseIds).indexOf(activePhaseId) >= 0) {
      score += 35;
      reasons.push("alinhado com a fase ativa");
    } else if (!activePhaseId) {
      score += 8;
      reasons.push("fase ativa ausente, mantendo avanço conservador");
    } else {
      score -= 10;
      reasons.push("fora do foco principal da fase atual");
    }

    if (moduleDef.id === "factory-core-self-structure") {
      score += 20;
      reasons.push("prioridade estrutural do núcleo da Factory AI");
    }

    if (f === "/app/js/core/factory_ai_architect.js") {
      score += 30;
      reasons.push("camada nova de autoestruturação ainda precisa consolidar");
    }

    if (f === "/app/js/core/factory_ai_controller.js") {
      score += 18;
      reasons.push("controller precisa virar porta de entrada da evolução supervisionada");
    }

    if (f === "/app/js/core/factory_ai_orchestrator.js") {
      score += 16;
      reasons.push("orchestrator ainda é peça central da inteligência conversável");
    }

    if (f === "/app/js/core/factory_ai_runtime.js") {
      score += 14;
      reasons.push("runtime fecha a ponte entre IA, plano e execução supervisionada");
    }

    if (!fileExists(f, knownFiles)) {
      score += 12;
      reasons.push("arquivo ainda não aparece claramente na árvore");
    } else {
      score += 4;
      reasons.push("arquivo já conhecido pela árvore");
    }

    if (trimText(plannerStatus.lastNextFile || "") === f) {
      score += 10;
      reasons.push("planner já apontou esse alvo recentemente");
    }

    if (!runtimeStatus.ready && f === "/app/js/core/factory_ai_runtime.js") {
      score += 18;
      reasons.push("runtime ainda não consolidado");
    }

    if (!orchStatus.contextReady && f === "/app/js/core/factory_ai_orchestrator.js") {
      score += 8;
      reasons.push("orchestrator ainda sem contexto consolidado");
    }

    if (!actionsStatus.ready && f === "/app/js/core/factory_ai_actions.js") {
      score += 10;
      reasons.push("actions ainda não consolidado");
    }

    if (avoid.blocked) {
      score -= 40;
      reasons.push("evitado pela memória: " + avoid.reason);
    }

    if (wasRecentlyTargeted(f)) {
      score -= 25;
      reasons.push("alvo recente, evitar repetição burra");
    }

    return {
      file: f,
      score: score,
      reasons: uniq(reasons)
    };
  }

  function chooseArchitectureTarget(ctx) {
    var phaseId =
      trimText(safe(function () { return ctx.phase.activePhase.id; }, "")) ||
      trimText(safe(function () { return ctx.phase.activePhaseId; }, ""));

    var pool = [];

    CATALOG.forEach(function (moduleDef) {
      if (!phaseId || asArray(moduleDef.phaseIds).indexOf(phaseId) >= 0) {
        asArray(moduleDef.preferredFiles).forEach(function (file) {
          pool.push({
            moduleId: moduleDef.id,
            moduleTitle: moduleDef.title,
            file: normalizePath(file)
          });
        });
      }
    });

    if (!pool.length) {
      CATALOG.forEach(function (moduleDef) {
        asArray(moduleDef.preferredFiles).forEach(function (file) {
          pool.push({
            moduleId: moduleDef.id,
            moduleTitle: moduleDef.title,
            file: normalizePath(file)
          });
        });
      });
    }

    var ranked = pool.map(function (item) {
      var mod = null;
      for (var i = 0; i < CATALOG.length; i++) {
        if (CATALOG[i].id === item.moduleId) {
          mod = CATALOG[i];
          break;
        }
      }

      var scored = scoreCandidate(item.file, mod || {}, ctx);
      return {
        moduleId: item.moduleId,
        moduleTitle: item.moduleTitle,
        file: item.file,
        score: scored.score,
        reasons: scored.reasons
      };
    });

    ranked.sort(function (a, b) {
      return b.score - a.score;
    });

    return {
      next: ranked[0] || null,
      ranking: ranked.slice(0, 8)
    };
  }

  function buildProposal(ctx) {
    var choice = chooseArchitectureTarget(ctx);
    var top = choice.next;
    var phaseTitle =
      trimText(safe(function () { return ctx.phase.activePhase.title; }, "")) ||
      trimText(safe(function () { return ctx.phase.activePhaseTitle; }, "")) ||
      "Fase não definida";

    if (!top) {
      return {
        ok: false,
        msg: "Nenhum alvo estrutural calculado."
      };
    }

    var proposal = {
      id: "architect_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now(),
      createdAt: nowISO(),
      source: "factory_ai_architect",
      type: "self-structure-proposal",
      priority: top.score >= 70 ? "critical-now" : (top.score >= 45 ? "high" : "medium"),
      moduleId: top.moduleId,
      moduleTitle: top.moduleTitle,
      targetFile: normalizePath(top.file),
      nextFile: normalizePath(top.file),
      objective: "Evoluir a própria Factory AI com foco em " + top.moduleTitle,
      nextStep: "Preparar proposta supervisionada para " + normalizePath(top.file),
      patchSummary: "Consolidar " + normalizePath(top.file) + " como próxima camada de evolução estrutural da Factory AI.",
      rationale: uniq(top.reasons).join("; "),
      phase: {
        id: trimText(safe(function () { return ctx.phase.activePhase.id; }, "")) ||
          trimText(safe(function () { return ctx.phase.activePhaseId; }, "")),
        title: phaseTitle
      },
      suggestedFiles: uniq(
        [top.file]
          .concat(asArray(safe(function () { return ctx.phase.recommendedTargets; }, [])))
          .slice(0, 8)
          .map(normalizePath)
          .filter(Boolean)
      ),
      ranking: clone(choice.ranking || []),
      approvalRequired: true,
      approvalStatus: "pending",
      runtime: {
        plannerReady: !!safe(function () { return ctx.plannerStatus.ready; }, false),
        runtimeReady: !!safe(function () { return ctx.runtimeStatus.ready; }, false),
        orchestratorReady: !!safe(function () { return ctx.orchestratorStatus.contextReady; }, false),
        actionsReady: !!safe(function () { return ctx.actionsStatus.ready; }, false),
        knownFilesCount: asArray(ctx.knownFiles).length,
        treeCounts: clone(safe(function () { return ctx.tree.counts; }, {}))
      }
    };

    state.lastProposal = clone(proposal);
    state.lastDecision = {
      ts: nowISO(),
      targetFile: proposal.targetFile,
      moduleId: proposal.moduleId,
      priority: proposal.priority
    };
    state.lastTargetFile = proposal.targetFile;
    persist();

    pushHistory({
      type: "proposal",
      ts: nowISO(),
      targetFile: proposal.targetFile,
      moduleId: proposal.moduleId,
      priority: proposal.priority,
      proposal: {
        id: proposal.id,
        targetFile: proposal.targetFile,
        moduleId: proposal.moduleId
      }
    });

    emit("RCF:FACTORY_AI_ARCHITECT_PROPOSAL", {
      proposal: clone(proposal)
    });

    pushLog("OK", "architect proposal ready ✅", {
      targetFile: proposal.targetFile,
      moduleId: proposal.moduleId,
      priority: proposal.priority
    });

    return {
      ok: true,
      proposal: clone(proposal)
    };
  }

  function buildContext() {
    return {
      ts: nowISO(),
      phase: clone(getPhaseContext() || {}),
      memory: clone(getMemoryContext() || {}),
      tree: clone(getTreeSummary() || {}),
      knownFiles: clone(getKnownFiles() || []),
      plannerStatus: clone(getPlannerStatus() || {}),
      runtimeStatus: clone(getRuntimeStatus() || {}),
      orchestratorStatus: clone(getOrchestratorStatus() || {}),
      actionsStatus: clone(getActionsStatus() || {})
    };
  }

  function analyze() {
    var ctx = buildContext();
    var result = buildProposal(ctx);
    return {
      ok: !!result.ok,
      context: ctx,
      proposal: clone(result.proposal || null),
      msg: result.msg || ""
    };
  }

  function explainLastProposal() {
    var proposal = clone(state.lastProposal || null);
    if (!proposal) {
      return {
        ok: false,
        msg: "Nenhuma proposta arquitetural calculada ainda."
      };
    }

    return {
      ok: true,
      proposal: proposal,
      text: [
        "Objetivo: " + trimText(proposal.objective || ""),
        "Arquivo alvo: " + trimText(proposal.targetFile || ""),
        "Módulo: " + trimText(proposal.moduleTitle || ""),
        "Prioridade: " + trimText(proposal.priority || ""),
        "Razão: " + trimText(proposal.rationale || ""),
        "Próximo passo: " + trimText(proposal.nextStep || "")
      ].join("\n")
    };
  }

  function getLastProposal() {
    return clone(state.lastProposal || null);
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      lastUpdate: state.lastUpdate || null,
      hasProposal: !!state.lastProposal,
      lastTargetFile: state.lastTargetFile || "",
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIArchitect");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIArchitect", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIArchitect");
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

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    syncPresence();

    pushLog("OK", "factory_ai_architect ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_ARCHITECT = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    analyze: analyze,
    buildContext: buildContext,
    getLastProposal: getLastProposal,
    explainLastProposal: explainLastProposal,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

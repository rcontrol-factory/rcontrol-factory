/* FILE: /app/js/core/factory_ai_architect.js
   RControl Factory — Factory AI Architect
   v1.0.1 SUPERVISED SELF-STRUCTURE ARCHITECT

   PATCH v1.0.1
   - FIX: acesso seguro a phase.activePhase
   - FIX: fallback getKnownFiles / getAllPaths
   - FIX: evitar quebra se planner/runtime/orchestrator status ausentes
   - FIX: normalizePath aplicado cedo
   - PERF: fileExists otimizado
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_ARCHITECT && global.RCF_FACTORY_AI_ARCHITECT.__v101) return;

  var VERSION = "v1.0.1";
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

  /* ====================================================== */
  /* CATALOG */
  /* ====================================================== */

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
    }
  ];

  /* ====================================================== */
  /* UTILS */
  /* ====================================================== */

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
      var k = String(item || "");
      if (!k || seen[k]) return;
      seen[k] = true;
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

  /* ====================================================== */
  /* STORAGE */
  /* ====================================================== */

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

      Object.assign(state, parsed);
      state.version = VERSION;
      state.busy = false;

      return true;
    } catch (_) {
      return false;
    }
  }

  /* ====================================================== */
  /* TREE + MEMORY + PHASE */
  /* ====================================================== */

  function getPhaseContext() {
    return safe(function () {
      return global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext?.() || {};
    }, {});
  }

  function getMemoryContext() {
    return safe(function () {
      return global.RCF_FACTORY_AI_MEMORY?.buildMemoryContext?.(24) || {};
    }, {});
  }

  function getTreeSummary() {
    return safe(function () {
      return global.RCF_FACTORY_TREE?.summary?.() || {};
    }, {});
  }

  function getKnownFiles() {
    return safe(function () {

      if (global.RCF_FACTORY_TREE?.getKnownPaths)
        return global.RCF_FACTORY_TREE.getKnownPaths();

      if (global.RCF_FACTORY_TREE?.getAllPaths)
        return global.RCF_FACTORY_TREE.getAllPaths();

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

  /* ====================================================== */
  /* FILE CHECK */
  /* ====================================================== */

  function fileExists(path, knownFiles) {

    var want = normalizePath(path);

    if (!want) return false;

    var map = {};

    asArray(knownFiles).forEach(function (p) {
      map[normalizePath(p)] = true;
    });

    return !!map[want];
  }

  /* ====================================================== */
  /* MEMORY COOLDOWN */
  /* ====================================================== */

  function isAvoidedByMemory(path, memoryCtx) {

    var want = normalizePath(path);

    var avoid = asArray(memoryCtx.avoidFiles);

    for (var i = 0; i < avoid.length; i++) {

      if (normalizePath(avoid[i].file) === want) {

        return {
          blocked: true,
          reason: trimText(avoid[i].reason || "arquivo em cooldown")
        };

      }
    }

    return { blocked: false, reason: "" };
  }

  /* ====================================================== */
  /* SCORE */
  /* ====================================================== */

  function scoreCandidate(file, moduleDef, ctx) {

    var score = 0;
    var reasons = [];

    var f = normalizePath(file);

    var activePhaseId =
      trimText(ctx.phase?.activePhase?.id) ||
      trimText(ctx.phase?.activePhaseId);

    var knownFiles = asArray(ctx.knownFiles);

    var avoid = isAvoidedByMemory(f, ctx.memory);

    if (!f) return { file: f, score: -999, reasons: ["arquivo inválido"] };

    if (asArray(moduleDef.phaseIds).indexOf(activePhaseId) >= 0) {
      score += 35;
      reasons.push("alinhado com fase ativa");
    }

    if (f.indexOf("factory_ai_") >= 0) {
      score += 10;
      reasons.push("núcleo da Factory AI");
    }

    if (!fileExists(f, knownFiles)) {
      score += 12;
      reasons.push("arquivo ainda não na árvore");
    } else {
      score += 4;
      reasons.push("arquivo conhecido");
    }

    if (avoid.blocked) {
      score -= 40;
      reasons.push("cooldown memória: " + avoid.reason);
    }

    return {
      file: f,
      score: score,
      reasons: uniq(reasons)
    };
  }

  /* ====================================================== */
  /* ARCHITECT DECISION */
  /* ====================================================== */

  function chooseArchitectureTarget(ctx) {

    var pool = [];

    CATALOG.forEach(function (moduleDef) {

      asArray(moduleDef.preferredFiles).forEach(function (file) {

        pool.push({
          moduleId: moduleDef.id,
          moduleTitle: moduleDef.title,
          file: normalizePath(file)
        });

      });

    });

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

  /* ====================================================== */
  /* PROPOSAL */
  /* ====================================================== */

  function buildProposal(ctx) {

    var choice = chooseArchitectureTarget(ctx);
    var top = choice.next;

    if (!top) {
      return { ok: false, msg: "Nenhum alvo estrutural calculado." };
    }

    var proposal = {
      id: "architect_" + Math.random().toString(36).slice(2, 10),
      createdAt: nowISO(),
      source: "factory_ai_architect",
      targetFile: top.file,
      moduleId: top.moduleId,
      moduleTitle: top.moduleTitle,
      rationale: top.reasons.join("; "),
      priority: top.score > 60 ? "high" : "medium",
      approvalRequired: true
    };

    state.lastProposal = clone(proposal);
    state.lastTargetFile = proposal.targetFile;

    persist();

    return {
      ok: true,
      proposal: proposal
    };
  }

  /* ====================================================== */
  /* CONTEXT */
  /* ====================================================== */

  function buildContext() {

    return {
      ts: nowISO(),
      phase: clone(getPhaseContext()),
      memory: clone(getMemoryContext()),
      tree: clone(getTreeSummary()),
      knownFiles: clone(getKnownFiles()),
      plannerStatus: clone(getPlannerStatus()),
      runtimeStatus: clone(getRuntimeStatus()),
      orchestratorStatus: clone(getOrchestratorStatus()),
      actionsStatus: clone(getActionsStatus())
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

  /* ====================================================== */
  /* STATUS */
  /* ====================================================== */

  function status() {

    return {
      version: VERSION,
      ready: !!state.ready,
      lastTargetFile: state.lastTargetFile || "",
      hasProposal: !!state.lastProposal,
      historyCount: asArray(state.history).length
    };

  }

  /* ====================================================== */
  /* INIT */
  /* ====================================================== */

  function init() {

    load();

    state.ready = true;
    state.version = VERSION;

    persist();

    try {
      console.log("[RCF] factory_ai_architect ready", VERSION);
    } catch (_) {}

    return status();

  }

  global.RCF_FACTORY_AI_ARCHITECT = {
    __v100: true,
    __v101: true,
    version: VERSION,
    init: init,
    status: status,
    analyze: analyze,
    buildContext: buildContext,
    getLastProposal: function () { return clone(state.lastProposal); },
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

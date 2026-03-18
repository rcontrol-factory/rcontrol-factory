/* FILE: /app/js/core/factory_ai_intelligence.js
   RControl Factory — Factory AI Intelligence Engine
   v1.0.1 SUPERVISED TARGET INTELLIGENCE + MEMORY/PHASE AWARE

   Objetivo:
   - fornecer camada estratégica de decisão da Factory AI
   - evitar repetição de arquivos já trabalhados
   - usar árvore da Factory + memória + fase atual
   - sugerir próximos alvos de evolução
   - apoiar planner / orchestrator / focus flow
   - respeitar cooldown operacional e arquivos a evitar
   - funcionar como script clássico

   PATCH v1.0.1:
   - FIX: remove dependência de memory.summary inexistente
   - FIX: usa memory.buildMemoryContext() como fonte principal
   - ADD: persistência local do estado
   - ADD: integração com factory_state / module_registry
   - ADD: ranking real com phase + memory + tree + histórico local
   - ADD: buildCompactContext() para planner/orchestrator
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_INTELLIGENCE && global.RCF_FACTORY_AI_INTELLIGENCE.__v101) return;

  var VERSION = "v1.0.1";
  var STORAGE_KEY = "rcf:factory_ai_intelligence";
  var MAX_HISTORY = 80;
  var RECENT_WINDOW = 12;
  var RECENT_COOLDOWN_MS = 10 * 60 * 60 * 1000; // 10 horas

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    history: [],
    lastTarget: "",
    lastAnalysis: null
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

  function lower(v) {
    return trimText(v).toLowerCase();
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        lastUpdate: state.lastUpdate,
        history: clone(state.history || []),
        lastTarget: state.lastTarget || "",
        lastAnalysis: clone(state.lastAnalysis || null)
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
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];
      state.lastTarget = normalizePath(parsed.lastTarget || "");
      state.lastAnalysis = clone(parsed.lastAnalysis || null);
      return true;
    } catch (_) {
      return false;
    }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_INTELLIGENCE] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_INTELLIGENCE] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_INTELLIGENCE]", level, msg, extra || ""); } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function pushHistory(file, meta) {
    var target = normalizePath(file || "");
    if (!target) return false;

    if (!Array.isArray(state.history)) state.history = [];

    state.history.push({
      file: target,
      ts: nowISO(),
      meta: clone(meta || {})
    });

    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }

    persist();
    return true;
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
      if (global.RCF_FACTORY_TREE?.getAllPaths) {
        return global.RCF_FACTORY_TREE.getAllPaths();
      }
      return [];
    }, []);
  }

  function getPhaseContext() {
    return safe(function () {
      if (global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext) {
        return global.RCF_FACTORY_PHASE_ENGINE.buildPhaseContext();
      }
      return {
        activePhaseId: "",
        activePhaseTitle: "",
        activePhase: null,
        recommendedTargets: []
      };
    }, {
      activePhaseId: "",
      activePhaseTitle: "",
      activePhase: null,
      recommendedTargets: []
    });
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

  function getPlannerStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_PLANNER?.status?.() || {};
    }, {});
  }

  function getOrchestratorStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_ORCHESTRATOR?.status?.() || {};
    }, {});
  }

  function getRuntimeStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_RUNTIME?.status?.() || {};
    }, {});
  }

  function getBridgeStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_BRIDGE?.status?.() || {};
    }, {});
  }

  function getFocusStatus() {
    return safe(function () {
      return global.RCF_FACTORY_AI_FOCUS_ENGINE?.status?.() || {};
    }, {});
  }

  function getAvoidFiles(memoryCtx) {
    var avoid = asArray(safe(function () { return memoryCtx.avoidFiles; }, []));
    return avoid.map(function (item) {
      return {
        file: normalizePath(item.file || ""),
        reason: trimText(item.reason || "")
      };
    }).filter(function (item) {
      return !!item.file;
    });
  }

  function findAvoidReason(file, avoidFiles) {
    var want = normalizePath(file);
    var found = "";

    asArray(avoidFiles).forEach(function (item) {
      if (found) return;
      if (normalizePath(item.file || "") === want) {
        found = trimText(item.reason || "arquivo em cooldown");
      }
    });

    return found;
  }

  function wasRecentlyUsed(file) {
    var want = normalizePath(file);
    if (!want) return false;

    var items = asArray(state.history).slice(-RECENT_WINDOW);
    for (var i = items.length - 1; i >= 0; i--) {
      var entry = items[i] || {};
      var candidate = normalizePath(entry.file || "");
      if (candidate !== want) continue;

      var ts = Date.parse(trimText(entry.ts || ""));
      if (!ts || !isFinite(ts)) return true;

      if ((nowMS() - ts) <= RECENT_COOLDOWN_MS) {
        return true;
      }
    }

    return false;
  }

  function buildCandidateFiles(ctx) {
    var out = [];
    var phase = ctx.phase || {};
    var tree = ctx.tree || {};
    var planner = ctx.planner || {};
    var focus = ctx.focus || {};

    out = out
      .concat(asArray(phase.recommendedTargets))
      .concat(asArray(safe(function () { return tree.samples.core; }, [])))
      .concat(asArray(safe(function () { return tree.samples.admin; }, [])))
      .concat(asArray(safe(function () { return tree.samples.ui; }, [])))
      .concat(asArray(ctx.knownFiles || []));

    if (trimText(planner.lastNextFile || "")) out.unshift(planner.lastNextFile);
    if (trimText(focus.targetFile || "")) out.unshift(focus.targetFile);

    return uniq(out.map(normalizePath).filter(Boolean));
  }

  function scoreFile(file, ctx) {
    var f = normalizePath(file);
    if (!f) return { file: "", score: -999, reasons: ["arquivo inválido"] };

    var score = 0;
    var reasons = [];

    var phaseId = trimText(safe(function () { return ctx.phase.activePhaseId; }, ""));
    var avoidReason = findAvoidReason(f, ctx.avoidFiles || []);
    var plannerLast = normalizePath(safe(function () { return ctx.planner.lastNextFile; }, ""));
    var focusTarget = normalizePath(safe(function () { return ctx.focus.targetFile; }, ""));
    var runtimeReady = !!safe(function () { return ctx.runtime.ready; }, false);
    var orchContextReady = !!safe(function () { return ctx.orchestrator.contextReady; }, false);

    if (f.indexOf("/app/js/core/factory_ai_") === 0) {
      score += 40;
      reasons.push("núcleo direto da Factory AI");
    }

    if (f.indexOf("/app/js/core/") === 0) {
      score += 16;
      reasons.push("arquivo central do core");
    }

    if (f === "/app/js/core/factory_ai_intelligence.js") {
      score -= 24;
      reasons.push("evitar ficar rodando no próprio intelligence sem necessidade");
    }

    if (f === "/app/js/core/factory_ai_runtime.js") {
      score += 20;
      reasons.push("runtime continua sendo eixo da execução supervisionada");
    }

    if (f === "/app/js/core/factory_ai_orchestrator.js") {
      score += 18;
      reasons.push("orchestrator centraliza decisão cognitiva");
    }

    if (f === "/app/js/core/factory_ai_actions.js") {
      score += 18;
      reasons.push("actions conecta plano com execução supervisionada");
    }

    if (f === "/app/js/core/patch_supervisor.js") {
      score += 16;
      reasons.push("patch supervisor fecha validate/stage/apply");
    }

    if (f === "/app/js/core/factory_ai_planner.js") {
      score += 18;
      reasons.push("planner continua importante para próximo alvo real");
    }

    if (asArray(safe(function () { return ctx.phase.recommendedTargets; }, [])).indexOf(f) >= 0) {
      score += 34;
      reasons.push("recomendado pela fase ativa");
    }

    if (plannerLast && plannerLast === f) {
      score += 22;
      reasons.push("planner já vinha apontando esse alvo");
    }

    if (focusTarget && focusTarget === f) {
      score += 18;
      reasons.push("focus engine já aponta esse arquivo");
    }

    if (phaseId === "factory-ai-supervised" && f.indexOf("/app/js/core/factory_ai_") === 0) {
      score += 10;
      reasons.push("fase atual prioriza a própria Factory AI");
    }

    if (!runtimeReady && f === "/app/js/core/factory_ai_runtime.js") {
      score += 10;
      reasons.push("runtime ainda não consolidado");
    }

    if (!orchContextReady && f === "/app/js/core/factory_ai_orchestrator.js") {
      score += 8;
      reasons.push("orchestrator ainda sem contexto consolidado");
    }

    if (avoidReason) {
      score -= 80;
      reasons.push("bloqueado pela memória: " + avoidReason);
    }

    if (wasRecentlyUsed(f)) {
      score -= 55;
      reasons.push("arquivo mexido recentemente no histórico local");
    }

    return {
      file: f,
      score: score,
      reasons: uniq(reasons)
    };
  }

  function chooseNextFile(ctx) {
    var ranking = buildCandidateFiles(ctx).map(function (file) {
      return scoreFile(file, ctx);
    }).sort(function (a, b) {
      return b.score - a.score;
    });

    return {
      next: ranking[0] || {
        file: "",
        score: -999,
        reasons: ["sem candidatos"]
      },
      ranking: ranking.slice(0, 12)
    };
  }

  function analyzeFactory() {
    var tree = getTreeSummary();
    var phase = getPhaseContext();
    var memory = getMemoryContext();
    var planner = getPlannerStatus();
    var orchestrator = getOrchestratorStatus();
    var runtime = getRuntimeStatus();
    var bridge = getBridgeStatus();
    var focus = getFocusStatus();
    var knownFiles = getKnownFiles();
    var avoidFiles = getAvoidFiles(memory);

    var ctx = {
      ts: nowISO(),
      tree: clone(tree || {}),
      phase: clone(phase || {}),
      memory: clone(memory || {}),
      planner: clone(planner || {}),
      orchestrator: clone(orchestrator || {}),
      runtime: clone(runtime || {}),
      bridge: clone(bridge || {}),
      focus: clone(focus || {}),
      knownFiles: clone(knownFiles || []),
      avoidFiles: clone(avoidFiles || [])
    };

    var choice = chooseNextFile(ctx);
    var nextFile = normalizePath(safe(function () { return choice.next.file; }, ""));

    state.lastTarget = nextFile;
    state.lastAnalysis = {
      ts: nowISO(),
      version: VERSION,
      phaseId: trimText(safe(function () { return phase.activePhaseId; }, "")),
      phaseTitle: trimText(safe(function () { return phase.activePhaseTitle; }, "")),
      treeCounts: clone(safe(function () { return tree.counts; }, {})),
      memoryCounters: clone(safe(function () { return memory.counters; }, {})),
      avoidFiles: clone(avoidFiles || []),
      nextFile: nextFile,
      reasons: clone(safe(function () { return choice.next.reasons; }, [])),
      ranking: clone(choice.ranking || [])
    };

    if (nextFile) {
      pushHistory(nextFile, {
        source: "factory_ai_intelligence.analyzeFactory",
        phaseId: trimText(safe(function () { return phase.activePhaseId; }, ""))
      });
    } else {
      persist();
    }

    emit("RCF:FACTORY_AI_INTELLIGENCE_ANALYSIS", {
      analysis: clone(state.lastAnalysis)
    });

    pushLog("OK", "analysis ready ✅", {
      nextFile: nextFile,
      phaseId: trimText(safe(function () { return phase.activePhaseId; }, ""))
    });

    return clone(state.lastAnalysis);
  }

  function getNextTarget() {
    var analysis = analyzeFactory();

    return {
      ok: true,
      nextFile: trimText(analysis.nextFile || ""),
      analysis: clone(analysis)
    };
  }

  function explainNextTarget() {
    var analysis = state.lastAnalysis || analyzeFactory();
    var reasons = asArray(analysis.reasons).slice(0, 4);

    return {
      ok: true,
      nextFile: trimText(analysis.nextFile || ""),
      analysis: clone(analysis),
      text: [
        "Fase ativa: " + trimText(analysis.phaseTitle || analysis.phaseId || ""),
        "Próximo alvo: " + trimText(analysis.nextFile || ""),
        "Motivos: " + (reasons.length ? reasons.join("; ") : "sem motivo consolidado")
      ].join("\n")
    };
  }

  function buildCompactContext() {
    var analysis = state.lastAnalysis || analyzeFactory();

    return {
      ok: true,
      version: VERSION,
      phaseId: trimText(analysis.phaseId || ""),
      phaseTitle: trimText(analysis.phaseTitle || ""),
      nextFile: trimText(analysis.nextFile || ""),
      reasons: clone(asArray(analysis.reasons).slice(0, 6)),
      avoidFiles: clone(asArray(analysis.avoidFiles || []).slice(0, 12)),
      ranking: clone(asArray(analysis.ranking || []).slice(0, 8))
    };
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      lastTarget: state.lastTarget || "",
      hasAnalysis: !!state.lastAnalysis,
      historySize: asArray(state.history).length
    };
  }

  function summary() {
    return {
      version: VERSION,
      lastTarget: state.lastTarget || "",
      historySize: asArray(state.history).length,
      lastAnalysis: clone(state.lastAnalysis || null)
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIIntelligence");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIIntelligence", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIIntelligence");
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
    persist();
    syncPresence();

    pushLog("OK", "factory_ai_intelligence ready ✅ " + VERSION);
    return summary();
  }

  global.RCF_FACTORY_AI_INTELLIGENCE = {
    __v100: true,
    __v101: true,
    version: VERSION,
    init: init,
    status: status,
    summary: summary,
    analyzeFactory: analyzeFactory,
    getNextTarget: getNextTarget,
    explainNextTarget: explainNextTarget,
    buildCompactContext: buildCompactContext,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);

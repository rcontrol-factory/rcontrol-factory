/* FILE: /app/js/core/factory_ai_intelligence.js
   RControl Factory — Factory AI Intelligence Engine
   v1.0.0

   Objetivo:
   - fornecer camada estratégica de decisão da Factory AI
   - evitar repetição de arquivos já trabalhados
   - usar árvore da Factory + memória + fase atual
   - sugerir próximos alvos de evolução
   - apoiar planner / orchestrator
   - funcionar como script clássico
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_INTELLIGENCE && global.RCF_FACTORY_AI_INTELLIGENCE.__v100) return;

  var VERSION = "1.0.0";

  var MAX_HISTORY = 50;

  var state = {
    version: VERSION,
    history: [],
    lastTarget: "",
    lastAnalysis: null
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

  function pushHistory(file) {
    if (!file) return;

    state.history.push({
      file: file,
      ts: nowISO()
    });

    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
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

  function getPhaseContext() {
    return safe(function () {
      if (global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext) {
        return global.RCF_FACTORY_PHASE_ENGINE.buildPhaseContext();
      }
      return {};
    }, {});
  }

  function getMemory() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_MEMORY?.summary) {
        return global.RCF_FACTORY_AI_MEMORY.summary();
      }
      return {};
    }, {});
  }

  function wasRecentlyUsed(file) {
    var list = state.history || [];
    var limit = 10;

    for (var i = list.length - 1; i >= 0 && limit > 0; i--) {
      if (list[i].file === file) return true;
      limit--;
    }

    return false;
  }

  function scoreFile(file) {
    var score = 0;

    if (!file) return -999;

    if (file.indexOf("factory_ai_") >= 0) score += 5;
    if (file.indexOf("/core/") >= 0) score += 4;
    if (file.indexOf("preview") >= 0) score += 2;

    if (wasRecentlyUsed(file)) score -= 10;

    return score;
  }

  function chooseNextFile() {

    var files = getKnownFiles();

    if (!files || !files.length) {
      return "";
    }

    var best = "";
    var bestScore = -999;

    files.forEach(function (file) {

      var s = scoreFile(file);

      if (s > bestScore) {
        bestScore = s;
        best = file;
      }

    });

    return best;
  }

  function analyzeFactory() {

    var tree = getTreeSummary();
    var phase = getPhaseContext();
    var memory = getMemory();

    var nextFile = chooseNextFile();

    state.lastTarget = nextFile;

    state.lastAnalysis = {
      ts: nowISO(),
      treeCounts: safe(function () { return tree.counts; }, {}),
      phase: safe(function () { return phase.activePhase?.id; }, ""),
      memory: memory,
      nextFile: nextFile
    };

    pushHistory(nextFile);

    return clone(state.lastAnalysis);
  }

  function getNextTarget() {

    var analysis = analyzeFactory();

    return {
      ok: true,
      nextFile: analysis.nextFile,
      analysis: analysis
    };
  }

  function summary() {
    return {
      version: VERSION,
      lastTarget: state.lastTarget,
      historySize: (state.history || []).length,
      lastAnalysis: clone(state.lastAnalysis)
    };
  }

  function init() {

    try {
      console.log("[RCF] factory_ai_intelligence ready", VERSION);
    } catch (_) {}

    return summary();
  }

  global.RCF_FACTORY_AI_INTELLIGENCE = {
    __v100: true,
    version: VERSION,
    init: init,
    analyzeFactory: analyzeFactory,
    getNextTarget: getNextTarget,
    summary: summary
  };

  try { init(); } catch (_) {}

})(window);

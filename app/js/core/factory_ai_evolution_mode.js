/* FILE: /app/js/core/factory_ai_evolution_mode.js
   RControl Factory — Factory AI Evolution Mode
   v1.0.0 EVOLUTION MODE CONTROLLER

   Objetivo:
   - controlar o modo operacional da Factory AI
   - evitar conflito entre diagnostics / autoheal / planner / autoloop
   - permitir mudança segura de modo
   - registrar histórico de modos
   - servir de referência para planner, runtime e orchestrator
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_EVOLUTION_MODE && global.RCF_FACTORY_AI_EVOLUTION_MODE.__v100) return;

  var VERSION = "1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_evolution_mode";

  var MODES = {
    DIAGNOSTIC: "diagnostic",
    STRUCTURE: "structure",
    AUTOHEAL: "autoheal",
    PROPOSAL: "proposal",
    SUPERVISED_LOOP: "supervised_loop",
    SELF_EVOLUTION: "self_evolution",
    IDLE: "idle"
  };

  var state = {
    version: VERSION,
    ready: false,
    mode: MODES.DIAGNOSTIC,
    lastChange: null,
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

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed) return;

      state.mode = parsed.mode || state.mode;
      state.history = parsed.history || [];
      state.lastChange = parsed.lastChange || null;

    } catch (_) {}
  }

  function log(msg, extra) {
    try {
      global.RCF_LOGGER?.push?.("INFO", "[FACTORY_AI_EVOLUTION_MODE] " + msg + " " + JSON.stringify(extra || {}));
    } catch (_) {}

    try {
      console.log("[FACTORY_AI_EVOLUTION_MODE]", msg, extra || "");
    } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function setMode(newMode, reason) {

    if (!newMode) return false;

    if (state.mode === newMode) {
      return true;
    }

    var previous = state.mode;

    state.mode = newMode;
    state.lastChange = nowISO();

    state.history.push({
      ts: state.lastChange,
      from: previous,
      to: newMode,
      reason: reason || ""
    });

    if (state.history.length > 60) {
      state.history = state.history.slice(-60);
    }

    persist();

    emit("RCF:FACTORY_AI_MODE_CHANGED", {
      from: previous,
      to: newMode,
      reason: reason || ""
    });

    log("mode changed", {
      from: previous,
      to: newMode,
      reason: reason || ""
    });

    return true;
  }

  function getMode() {
    return state.mode;
  }

  function getHistory() {
    return clone(state.history || []);
  }

  function suggestModeFromContext() {

    try {

      if (global.RCF_FACTORY_AI_AUTOHEAL?.status?.().ready) {
        return MODES.AUTOHEAL;
      }

      if (global.RCF_FACTORY_AI_DIAGNOSTICS?.status?.().ready) {
        return MODES.DIAGNOSTIC;
      }

      if (global.RCF_FACTORY_AI_RUNTIME?.status?.().busy) {
        return MODES.PROPOSAL;
      }

      if (global.RCF_FACTORY_AI_AUTOLOOP?.status?.().running) {
        return MODES.SUPERVISED_LOOP;
      }

    } catch (_) {}

    return MODES.IDLE;
  }

  function autoAdjust() {

    var suggested = suggestModeFromContext();

    if (suggested && suggested !== state.mode) {
      setMode(suggested, "auto-context-adjust");
    }

    return state.mode;
  }

  function status() {
    return {
      version: VERSION,
      ready: state.ready,
      mode: state.mode,
      lastChange: state.lastChange,
      historyCount: state.history.length
    };
  }

  function init() {

    load();

    state.ready = true;

    persist();

    log("factory_ai_evolution_mode ready");

    return status();
  }

  global.RCF_FACTORY_AI_EVOLUTION_MODE = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    getMode: getMode,
    setMode: setMode,
    autoAdjust: autoAdjust,
    getHistory: getHistory,
    MODES: MODES
  };

  try { init(); } catch (_) {}

})(window);

/* FILE: /app/js/core/factory_state.js
   RControl Factory — Factory State Engine
   v1.1 SAFE / PATCH MÍNIMO

   Objetivo:
   - registrar estado operacional mínimo da Factory
   - não usar Vault para metadados operacionais
   - expor API global via window.RCF_FACTORY_STATE
   - funcionar como script clássico
   - integrar de forma leve com boot/logger/doctor/module registry
*/

;(function(global){
  "use strict";

  if (global.RCF_FACTORY_STATE && global.RCF_FACTORY_STATE.__v11) return;

  var STORAGE_KEY = "rcf:factory_state";
  var VERSION = "v1.1";

  var state = {
    factoryVersion: null,
    engineVersion: VERSION,
    bootStatus: "not-started",
    bootTime: null,
    lastUpdate: null,
    runtimeVFS: null,
    loggerReady: false,
    doctorReady: false,
    doctorLastRun: null,
    userAgent: null,
    environment: null,
    modules: {},
    health: {
      lastRefresh: null
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

  function detectEnvironment() {
    try {
      var standalone = false;

      try {
        standalone =
          !!(global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) ||
          !!(global.navigator && global.navigator.standalone);
      } catch (_) {}

      if (standalone) return "PWA";
      return "Browser";
    } catch (_) {
      return "unknown";
    }
  }

  function log(level, msg) {
    try { global.RCF_LOGGER?.push?.(level, "[FACTORY_STATE] " + msg); } catch (_) {}
    try { console.log("[FACTORY_STATE]", level, msg); } catch (_) {}
  }

  function safeMerge(target, patch) {
    if (!patch || typeof patch !== "object") return target;

    Object.keys(patch).forEach(function(key){
      var val = patch[key];

      if (
        val &&
        typeof val === "object" &&
        !Array.isArray(val) &&
        target[key] &&
        typeof target[key] === "object" &&
        !Array.isArray(target[key])
      ) {
        target[key] = safeMerge(clone(target[key]), val);
      } else {
        target[key] = val;
      }
    });

    return target;
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      log("WARN", "persist falhou");
      return false;
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;

      state = safeMerge(clone(state), parsed);
      return true;
    } catch (e) {
      log("WARN", "load falhou");
      return false;
    }
  }

  function init(initConfig) {
    load();

    var base = {
      factoryVersion: global.RCF_VERSION || state.factoryVersion || null,
      bootStatus: "booting",
      bootTime: state.bootTime || nowISO(),
      runtimeVFS: global.__RCF_VFS_RUNTIME || global.RCF_RUNTIME || state.runtimeVFS || "unknown",
      loggerReady: !!global.RCF_LOGGER,
      doctorReady: !!global.RCF_DOCTOR_SCAN,
      userAgent: (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : null,
      environment: detectEnvironment(),
      health: {
        lastRefresh: nowISO()
      }
    };

    state = safeMerge(clone(state), base);
    state = safeMerge(clone(state), initConfig || {});
    state.lastUpdate = nowISO();

    persist();
    log("OK", "Factory State init ✅ " + VERSION);
    return status();
  }

  function getState() {
    return clone(state);
  }

  function setState(partial) {
    if (!partial || typeof partial !== "object") return false;
    state = safeMerge(clone(state), partial);
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setModule(name, value) {
    if (!name) return false;
    state.modules[String(name)] = !!value;
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setModules(mods) {
    if (!mods || typeof mods !== "object") return false;
    Object.keys(mods).forEach(function(name){
      state.modules[String(name)] = !!mods[name];
    });
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function markBoot(status) {
    state.bootStatus = String(status || "unknown");
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function markDoctorRun(meta) {
    state.doctorReady = !!global.RCF_DOCTOR_SCAN;
    state.doctorLastRun = {
      ts: nowISO(),
      meta: clone(meta || {})
    };
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function refreshRuntime() {
    state.factoryVersion = global.RCF_VERSION || state.factoryVersion || null;
    state.runtimeVFS = global.__RCF_VFS_RUNTIME || global.RCF_RUNTIME || state.runtimeVFS || "unknown";
    state.loggerReady = !!global.RCF_LOGGER;
    state.doctorReady = !!global.RCF_DOCTOR_SCAN;
    state.environment = detectEnvironment();
    state.userAgent = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : null;
    state.health.lastRefresh = nowISO();
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function status() {
    return {
      factoryVersion: state.factoryVersion,
      engineVersion: state.engineVersion,
      bootStatus: state.bootStatus,
      bootTime: state.bootTime,
      lastUpdate: state.lastUpdate,
      runtimeVFS: state.runtimeVFS,
      loggerReady: state.loggerReady,
      doctorReady: state.doctorReady,
      doctorLastRun: state.doctorLastRun,
      environment: state.environment,
      modules: clone(state.modules)
    };
  }

  global.RCF_FACTORY_STATE = {
    __v10: true,
    __v11: true,
    version: VERSION,
    init: init,
    getState: getState,
    setState: setState,
    setModule: setModule,
    setModules: setModules,
    markBoot: markBoot,
    markDoctorRun: markDoctorRun,
    refreshRuntime: refreshRuntime,
    persistState: persist,
    loadState: load,
    status: status
  };

  try {
    init();
  } catch (_) {}

})(window);

/* FILE: /app/js/core/factory_state.js
   RControl Factory — Factory State Engine
   v1.3 STABLE / PATCH MÍNIMO

   Objetivo:
   - registrar estado operacional mínimo da Factory
   - refletir melhor o boot real
   - consolidar runtimeVFS
   - registrar módulos ativos
   - expor API global via window.RCF_FACTORY_STATE
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_STATE && global.RCF_FACTORY_STATE.__v13) return;

  var STORAGE_KEY = "rcf:factory_state";
  var VERSION = "v1.3";

  var state = {
    factoryVersion: "1.0.0",
    engineVersion: VERSION,
    bootStatus: "booting",
    bootTime: null,
    lastUpdate: null,
    runtimeVFS: "browser",
    loggerReady: false,
    doctorReady: false,
    doctorLastRun: null,
    userAgent: null,
    environment: "Browser",
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

  function detectRuntimeVFS() {
    try {
      if (global.__RCF_VFS_RUNTIME) return String(global.__RCF_VFS_RUNTIME);
    } catch (_) {}

    try {
      if (global.RCF_RUNTIME) return String(global.RCF_RUNTIME);
    } catch (_) {}

    return "browser";
  }

  function log(level, msg) {
    try { global.RCF_LOGGER?.push?.(level, "[FACTORY_STATE] " + msg); } catch (_) {}
    try { console.log("[FACTORY_STATE]", level, msg); } catch (_) {}
  }

  function safeMerge(target, patch) {
    if (!patch || typeof patch !== "object") return target;

    Object.keys(patch).forEach(function (key) {
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
      factoryVersion: global.RCF_VERSION || state.factoryVersion || "1.0.0",
      bootStatus: state.bootStatus || "booting",
      bootTime: state.bootTime || nowISO(),
      runtimeVFS: detectRuntimeVFS(),
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
    Object.keys(mods).forEach(function (name) {
      state.modules[String(name)] = !!mods[name];
    });
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function registerModule(name) {
    return setModule(name, true);
  }

  function markBoot(status) {
    state.bootStatus = String(status || "unknown");
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setBootStatus(status) {
    return markBoot(status);
  }

  function setRuntime(runtime) {
    state.runtimeVFS = String(runtime || "browser");
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setLoggerReady(flag) {
    state.loggerReady = !!flag;
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setDoctorReady(flag) {
    state.doctorReady = !!flag;
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
    state.factoryVersion = global.RCF_VERSION || state.factoryVersion || "1.0.0";
    state.runtimeVFS = detectRuntimeVFS();
    state.loggerReady = !!global.RCF_LOGGER;
    state.doctorReady = !!global.RCF_DOCTOR_SCAN;
    state.environment = detectEnvironment();
    state.userAgent = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : null;
    state.health.lastRefresh = nowISO();

    if (state.bootStatus === "booting" && state.loggerReady) {
      state.bootStatus = "ready";
    }

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
    __v1: true,
    __v10: true,
    __v11: true,
    __v12: true,
    __v13: true,
    version: VERSION,
    init: init,
    getState: getState,
    setState: setState,
    setModule: setModule,
    setModules: setModules,
    registerModule: registerModule,
    markBoot: markBoot,
    setBootStatus: setBootStatus,
    setRuntime: setRuntime,
    setLoggerReady: setLoggerReady,
    setDoctorReady: setDoctorReady,
    markDoctorRun: markDoctorRun,
    refreshRuntime: refreshRuntime,
    persistState: persist,
    loadState: load,
    status: status
  };

  try {
    init();
    setLoggerReady(!!global.RCF_LOGGER);
    setDoctorReady(!!global.RCF_DOCTOR_SCAN);
    refreshRuntime();
  } catch (_) {}

  try {
    global.addEventListener("load", function () {
      try {
        refreshRuntime();
        markBoot("ready");
      } catch (_) {}
    }, { once: true });
  } catch (_) {}

})(window);

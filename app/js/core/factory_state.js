/* FILE: /app/js/core/factory_state.js
   RControl Factory — Factory State Engine
   v1.4.1 STABLE / PATCH MÍNIMO

   Objetivo:
   - registrar estado operacional mínimo da Factory
   - refletir melhor o boot real
   - consolidar runtimeVFS
   - registrar módulos ativos
   - expor API global via window.RCF_FACTORY_STATE
   - funcionar como script clássico
   - melhorar snapshot para Factory AI
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_STATE && global.RCF_FACTORY_STATE.__v141) return;

  var STORAGE_KEY = "rcf:factory_state";
  var VERSION = "v1.4.1";

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
    activeView: "",
    activeAppSlug: "",
    modules: {
      factoryState: true
    },
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

  function detectKnownModules() {
    var out = {
      logger: false,
      doctor: false,
      github: false,
      vault: false,
      bridge: false,
      adminAI: false,
      factoryAI: false,
      factoryState: true,
      moduleRegistry: false,
      contextEngine: false,
      factoryTree: false,
      diagnostics: false
    };

    try { out.logger = !!global.RCF_LOGGER; } catch (_) {}
    try { out.doctor = !!global.RCF_DOCTOR_SCAN || !!global.RCF_DOCTOR; } catch (_) {}
    try { out.github = !!global.RCF_GH_SYNC; } catch (_) {}
    try { out.vault = !!global.RCF_ZIP_VAULT; } catch (_) {}
    try { out.bridge = !!global.RCF_AGENT_ZIP_BRIDGE; } catch (_) {}
    try { out.adminAI = !!global.RCF_ADMIN_AI; } catch (_) {}
    try { out.factoryAI = !!global.RCF_FACTORY_AI || !!global.RCF_FACTORY_IA; } catch (_) {}
    try { out.moduleRegistry = !!global.RCF_MODULE_REGISTRY; } catch (_) {}
    try { out.contextEngine = !!global.RCF_CONTEXT; } catch (_) {}
    try { out.factoryTree = !!global.RCF_FACTORY_TREE; } catch (_) {}
    try { out.diagnostics = !!global.RCF_DIAGNOSTICS; } catch (_) {}

    return out;
  }

  function detectActiveContext() {
    var out = {
      activeView: "",
      activeAppSlug: ""
    };

    try {
      var rcfState = global.RCF && global.RCF.state ? global.RCF.state : null;
      var active = rcfState && rcfState.active ? rcfState.active : null;

      out.activeView = active && active.view ? String(active.view) : "";
      out.activeAppSlug = active && active.appSlug ? String(active.appSlug) : "";
    } catch (_) {}

    return out;
  }

  function detectBootStatus() {
    try {
      var current = String(state.bootStatus || "").trim().toLowerCase();
      var mods = detectKnownModules();

      if (current === "error") return "error";
      if (current === "ready") return "ready";

      if (
        mods.logger ||
        mods.doctor ||
        mods.moduleRegistry ||
        mods.contextEngine ||
        mods.factoryTree ||
        mods.factoryAI
      ) {
        return "ready";
      }

      if (global.document && (global.document.readyState === "interactive" || global.document.readyState === "complete")) {
        return "booting";
      }

      return current || "booting";
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

    var activeCtx = detectActiveContext();
    var knownModules = detectKnownModules();

    var base = {
      factoryVersion: global.RCF_VERSION || state.factoryVersion || "1.0.0",
      engineVersion: VERSION,
      bootStatus: detectBootStatus(),
      bootTime: state.bootTime || nowISO(),
      runtimeVFS: detectRuntimeVFS(),
      loggerReady: !!knownModules.logger,
      doctorReady: !!knownModules.doctor,
      userAgent: (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : null,
      environment: detectEnvironment(),
      activeView: activeCtx.activeView,
      activeAppSlug: activeCtx.activeAppSlug,
      modules: knownModules,
      health: {
        lastRefresh: nowISO()
      }
    };

    state = safeMerge(clone(state), base);
    state = safeMerge(clone(state), initConfig || {});
    state.modules = state.modules || {};
    state.modules.factoryState = true;
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
    state.modules = state.modules || {};
    state.modules.factoryState = true;
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setModule(name, value) {
    if (!name) return false;
    state.modules = state.modules || {};
    state.modules[String(name)] = !!value;
    state.modules.factoryState = true;
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setModules(mods) {
    if (!mods || typeof mods !== "object") return false;
    state.modules = state.modules || {};
    Object.keys(mods).forEach(function (name) {
      state.modules[String(name)] = !!mods[name];
    });
    state.modules.factoryState = true;
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
    state.modules = state.modules || {};
    state.modules.logger = !!flag;
    state.modules.factoryState = true;

    if (state.bootStatus === "booting" && flag) {
      state.bootStatus = "ready";
    }

    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setDoctorReady(flag) {
    state.doctorReady = !!flag;
    state.modules = state.modules || {};
    state.modules.doctor = !!flag;
    state.modules.factoryState = true;
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function markDoctorRun(meta) {
    var doctorReady = false;
    try { doctorReady = !!global.RCF_DOCTOR_SCAN || !!global.RCF_DOCTOR; } catch (_) {}

    state.doctorReady = doctorReady;
    state.modules = state.modules || {};
    state.modules.doctor = doctorReady;
    state.modules.factoryState = true;
    state.doctorLastRun = {
      ts: nowISO(),
      meta: clone(meta || {})
    };
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function refreshRuntime() {
    var activeCtx = detectActiveContext();
    var knownModules = detectKnownModules();

    state.factoryVersion = global.RCF_VERSION || state.factoryVersion || "1.0.0";
    state.engineVersion = VERSION;
    state.runtimeVFS = detectRuntimeVFS();
    state.loggerReady = !!knownModules.logger;
    state.doctorReady = !!knownModules.doctor;
    state.environment = detectEnvironment();
    state.userAgent = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : null;
    state.activeView = activeCtx.activeView;
    state.activeAppSlug = activeCtx.activeAppSlug;
    state.modules = safeMerge(clone(state.modules || {}), knownModules);
    state.modules.factoryState = true;
    state.health = state.health || {};
    state.health.lastRefresh = nowISO();

    if (state.bootStatus === "booting" || state.bootStatus === "unknown") {
      state.bootStatus = detectBootStatus();
    }

    if (
      state.bootStatus !== "ready" &&
      (
        state.loggerReady ||
        state.doctorReady ||
        state.modules.moduleRegistry ||
        state.modules.contextEngine ||
        state.modules.factoryTree ||
        state.modules.factoryAI
      )
    ) {
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
      activeView: state.activeView || "",
      activeAppSlug: state.activeAppSlug || "",
      modules: clone(state.modules)
    };
  }

  global.RCF_FACTORY_STATE = {
    __v1: true,
    __v10: true,
    __v11: true,
    __v12: true,
    __v13: true,
    __v14: true,
    __v141: true,
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
    registerModule("factoryState");
    setLoggerReady(!!global.RCF_LOGGER);
    setDoctorReady(!!global.RCF_DOCTOR_SCAN || !!global.RCF_DOCTOR);
    refreshRuntime();
  } catch (_) {}

  try {
    global.addEventListener("DOMContentLoaded", function () {
      try { refreshRuntime(); } catch (_) {}
    }, { once: true });
  } catch (_) {}

  try {
    global.addEventListener("load", function () {
      try {
        refreshRuntime();
        markBoot("ready");
      } catch (_) {}
    }, { once: true });
  } catch (_) {}

  try {
    global.addEventListener("pageshow", function () {
      try { refreshRuntime(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener("visibilitychange", function () {
        try {
          if (global.document.visibilityState === "visible") {
            refreshRuntime();
          }
        } catch (_) {}
      }, { passive: true });
    }
  } catch (_) {}

  try {
    global.addEventListener("RCF:UI_READY", function () {
      try {
        refreshRuntime();
        if (state.bootStatus === "booting" || state.bootStatus === "unknown") {
          markBoot("ready");
        }
      } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    setTimeout(function () {
      try { refreshRuntime(); } catch (_) {}
    }, 300);

    setTimeout(function () {
      try { refreshRuntime(); } catch (_) {}
    }, 1200);

    setTimeout(function () {
      try { refreshRuntime(); } catch (_) {}
    }, 2600);
  } catch (_) {}

})(window);

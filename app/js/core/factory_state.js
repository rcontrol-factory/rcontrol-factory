/* FILE: /app/js/core/factory_state.js
   RControl Factory — Factory State Engine
   v1.5.0 STABLE / REBUILD COMPLETO

   Objetivo:
   - registrar estado operacional real da Factory
   - consolidar runtimeVFS / environment / boot
   - sincronizar melhor com module_registry / doctor / logger / tree
   - refletir activeView / activeAppSlug / módulos ativos
   - expor API global estável via window.RCF_FACTORY_STATE
   - funcionar como script clássico
   - melhorar snapshot para Factory AI / Context Engine
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_STATE && global.RCF_FACTORY_STATE.__v150) return;

  var STORAGE_KEY = "rcf:factory_state";
  var VERSION = "v1.5.0";

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
    userAgent: "",
    environment: "Browser",
    activeView: "",
    activeAppSlug: "",
    activeModules: [],
    modules: {
      factoryState: true
    },
    flags: {
      hasLogger: false,
      hasDoctor: false,
      hasGitHub: false,
      hasVault: false,
      hasBridge: false,
      hasAdminAI: false,
      hasFactoryAI: false,
      hasFactoryState: true,
      hasModuleRegistry: false,
      hasContextEngine: false,
      hasFactoryTree: false,
      hasDiagnostics: false,
      hasInjectorSafe: false
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

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniq(list) {
    var out = [];
    var seen = {};
    asArray(list).forEach(function (item) {
      var key = String(item || "");
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function safe(fn, fallback) {
    try {
      var v = fn();
      return (v === undefined ? fallback : v);
    } catch (_) {
      return fallback;
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

  function detectEnvironment() {
    try {
      var standalone = false;

      try {
        standalone =
          !!(global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) ||
          !!(global.navigator && global.navigator.standalone);
      } catch (_) {}

      return standalone ? "PWA" : "Browser";
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

    try {
      if (global.RCF && global.RCF.runtime) return String(global.RCF.runtime);
    } catch (_) {}

    return "browser";
  }

  function detectFlags() {
    return {
      hasLogger: !!safe(function () { return global.RCF_LOGGER; }, null),
      hasDoctor: !!safe(function () { return global.RCF_DOCTOR_SCAN || global.RCF_DOCTOR; }, null),
      hasGitHub: !!safe(function () { return global.RCF_GH_SYNC; }, null),
      hasVault: !!safe(function () { return global.RCF_ZIP_VAULT; }, null),
      hasBridge: !!safe(function () { return global.RCF_AGENT_ZIP_BRIDGE; }, null),
      hasAdminAI: !!safe(function () { return global.RCF_ADMIN_AI; }, null),
      hasFactoryAI: !!safe(function () { return global.RCF_FACTORY_AI || global.RCF_FACTORY_IA; }, null),
      hasFactoryState: true,
      hasModuleRegistry: !!safe(function () { return global.RCF_MODULE_REGISTRY; }, null),
      hasContextEngine: !!safe(function () { return global.RCF_CONTEXT; }, null),
      hasFactoryTree: !!safe(function () { return global.RCF_FACTORY_TREE; }, null),
      hasDiagnostics: !!safe(function () { return global.RCF_DIAGNOSTICS; }, null),
      hasInjectorSafe: !!safe(function () {
        return global.RCF_INJECTOR_SAFE || global.RCF_INJECTOR || global.RCF_AGENT_INJECTOR || global.RCF_PREVIEW_INJECTOR;
      }, null)
    };
  }

  function detectKnownModulesFromGlobals() {
    var flags = detectFlags();

    return {
      logger: !!flags.hasLogger,
      doctor: !!flags.hasDoctor,
      github: !!flags.hasGitHub,
      vault: !!flags.hasVault,
      bridge: !!flags.hasBridge,
      adminAI: !!flags.hasAdminAI,
      factoryAI: !!flags.hasFactoryAI,
      factoryState: true,
      moduleRegistry: !!flags.hasModuleRegistry,
      contextEngine: !!flags.hasContextEngine,
      factoryTree: !!flags.hasFactoryTree,
      diagnostics: !!flags.hasDiagnostics,
      injector: !!flags.hasInjectorSafe
    };
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

  function getRegistrySummary() {
    return safe(function () {
      if (!global.RCF_MODULE_REGISTRY || typeof global.RCF_MODULE_REGISTRY.summary !== "function") {
        return {};
      }
      return global.RCF_MODULE_REGISTRY.summary() || {};
    }, {});
  }

  function getRegistryModules() {
    var summary = getRegistrySummary();
    if (summary && summary.modules && typeof summary.modules === "object") {
      return clone(summary.modules);
    }
    return {};
  }

  function getRegistryActiveList() {
    var summary = getRegistrySummary();

    if (Array.isArray(summary.active) && summary.active.length) {
      return uniq(summary.active);
    }

    var map = summary.modules || {};
    var active = [];

    Object.keys(map || {}).forEach(function (k) {
      if (map[k]) active.push(k);
    });

    return uniq(active);
  }

  function getDoctorLastRun() {
    var existing = safe(function () { return state.doctorLastRun; }, null);
    if (existing) return clone(existing);

    var fromScan = safe(function () { return global.RCF_DOCTOR_SCAN && global.RCF_DOCTOR_SCAN.lastRun; }, null);
    if (fromScan) return clone(fromScan);

    var fromDoctor = safe(function () { return global.RCF_DOCTOR && global.RCF_DOCTOR.lastRun; }, null);
    if (fromDoctor) return clone(fromDoctor);

    var fromScanReport = safe(function () { return global.RCF_DOCTOR_SCAN && global.RCF_DOCTOR_SCAN.lastReport; }, null);
    if (fromScanReport) {
      return {
        ts: nowISO(),
        source: "RCF_DOCTOR_SCAN.lastReport",
        report: fromScanReport
      };
    }

    return null;
  }

  function detectBootStatus() {
    try {
      var current = String(state.bootStatus || "").trim().toLowerCase();
      var active = getRegistryActiveList();
      var mods = detectKnownModulesFromGlobals();

      if (current === "error") return "error";
      if (current === "ready") return "ready";

      if (
        active.length ||
        mods.factoryAI ||
        mods.contextEngine ||
        mods.moduleRegistry ||
        mods.logger ||
        mods.doctor ||
        mods.factoryTree
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

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) {
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
    } catch (_) {
      log("WARN", "load falhou");
      return false;
    }
  }

  function buildRuntimePatch(initConfig) {
    var activeCtx = detectActiveContext();
    var globalsModules = detectKnownModulesFromGlobals();
    var registrySummary = getRegistrySummary();
    var registryModules = getRegistryModules();
    var activeModules = getRegistryActiveList();
    var flags = detectFlags();

    var mergedModules = safeMerge(clone(globalsModules), registryModules || {});
    mergedModules.factoryState = true;

    return safeMerge({
      factoryVersion: global.RCF_VERSION || state.factoryVersion || "1.0.0",
      engineVersion: VERSION,
      bootStatus: detectBootStatus(),
      bootTime: state.bootTime || nowISO(),
      runtimeVFS: detectRuntimeVFS(),
      loggerReady: !!mergedModules.logger || !!flags.hasLogger,
      doctorReady: !!mergedModules.doctor || !!flags.hasDoctor,
      doctorLastRun: getDoctorLastRun(),
      userAgent: safe(function () { return global.navigator.userAgent; }, "") || "",
      environment: detectEnvironment(),
      activeView: activeCtx.activeView,
      activeAppSlug: activeCtx.activeAppSlug,
      activeModules: activeModules,
      modules: mergedModules,
      flags: flags,
      health: {
        lastRefresh: nowISO(),
        registryVersion: safe(function () { return registrySummary.version; }, "") || "",
        activeCount: activeModules.length
      }
    }, initConfig || {});
  }

  function init(initConfig) {
    load();

    state = safeMerge(clone(state), buildRuntimePatch(initConfig));
    state.modules = state.modules || {};
    state.modules.factoryState = true;
    state.flags = safeMerge(clone(state.flags || {}), detectFlags());
    state.activeModules = uniq(state.activeModules || []);
    state.lastUpdate = nowISO();

    if (!state.bootTime) state.bootTime = nowISO();
    if (state.bootStatus === "unknown" || state.bootStatus === "booting") {
      state.bootStatus = detectBootStatus();
    }

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
    state.activeModules = uniq(state.activeModules || []);
    state.flags = safeMerge(clone(state.flags || {}), detectFlags());
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setModule(name, value) {
    if (!name) return false;

    var key = String(name);
    state.modules = state.modules || {};
    state.modules[key] = !!value;
    state.modules.factoryState = true;

    var active = uniq(state.activeModules || []);
    var idx = active.indexOf(key);

    if (value && idx < 0) active.push(key);
    if (!value && idx >= 0) active.splice(idx, 1);

    state.activeModules = uniq(active);
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

    var active = [];
    Object.keys(state.modules).forEach(function (name) {
      if (state.modules[name]) active.push(name);
    });

    state.activeModules = uniq(active);
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setActiveModules(list) {
    var active = uniq(list || []);
    state.activeModules = active;
    state.modules = state.modules || {};

    active.forEach(function (name) {
      state.modules[String(name)] = true;
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

    if (flag) {
      state.flags = state.flags || {};
      state.flags.hasLogger = true;
    }

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

    if (flag) {
      state.flags = state.flags || {};
      state.flags.hasDoctor = true;
    }

    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setActiveView(viewName) {
    state.activeView = String(viewName || "");
    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function setActiveAppSlug(appSlug) {
    state.activeAppSlug = String(appSlug || "");
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

    if (doctorReady) {
      state.flags = state.flags || {};
      state.flags.hasDoctor = true;
    }

    state.lastUpdate = nowISO();
    persist();
    return true;
  }

  function refreshRuntime() {
    var patch = buildRuntimePatch();
    state = safeMerge(clone(state), patch);

    state.modules = state.modules || {};
    state.modules.factoryState = true;
    state.flags = safeMerge(clone(state.flags || {}), detectFlags());
    state.activeModules = uniq(
      (state.activeModules || []).concat(getRegistryActiveList())
    );

    if (!state.bootTime) state.bootTime = nowISO();

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
        state.modules.factoryAI ||
        (state.activeModules || []).length
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
      doctorLastRun: clone(state.doctorLastRun),
      environment: state.environment,
      activeView: state.activeView || "",
      activeAppSlug: state.activeAppSlug || "",
      activeModules: clone(state.activeModules || []),
      modules: clone(state.modules),
      flags: clone(state.flags || {}),
      health: clone(state.health || {})
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
    __v150: true,
    version: VERSION,
    init: init,
    getState: getState,
    setState: setState,
    setModule: setModule,
    setModules: setModules,
    setActiveModules: setActiveModules,
    registerModule: registerModule,
    markBoot: markBoot,
    setBootStatus: setBootStatus,
    setRuntime: setRuntime,
    setLoggerReady: setLoggerReady,
    setDoctorReady: setDoctorReady,
    setActiveView: setActiveView,
    setActiveAppSlug: setActiveAppSlug,
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
    global.addEventListener("focus", function () {
      try { refreshRuntime(); } catch (_) {}
    }, { passive: true });
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

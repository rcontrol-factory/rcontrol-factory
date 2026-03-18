/* FILE: /app/js/core/factory_state.js
   RControl Factory — Factory State Engine
   v1.4.4 SAFE PERSIST GUARD / PATCH MÍNIMO

   Objetivo:
   - registrar estado operacional mínimo da Factory
   - refletir melhor o boot real
   - consolidar runtimeVFS
   - registrar módulos detectados sem travar a UI
   - expor API global via window.RCF_FACTORY_STATE
   - funcionar como script clássico
   - manter compatibilidade máxima com Safari / PWA
   - reduzir escrita excessiva em localStorage
   - evitar flood de WARN persist falhou

   PATCH v1.4.4:
   - ADD: detecta módulos novos da camada Factory AI
   - FIX: boot heurístico fica mais coerente com a fase atual da Factory
   - FIX: refreshRuntime sincroniza melhor presença de módulos recentes
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_STATE && global.RCF_FACTORY_STATE.__v144) return;

  var STORAGE_KEY = "rcf:factory_state";
  var VERSION = "v1.4.4";

  var PERSIST_DEBOUNCE_MS = 220;
  var WARN_THROTTLE_MS = 10000;

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
    activeModules: [],
    modules: {
      factoryState: true
    },
    health: {
      lastRefresh: null
    }
  };

  var __persistTimer = null;
  var __lastPersistSnapshot = "";
  var __memorySnapshot = "";
  var __persistQueued = false;
  var __warnAt = {
    persist: 0,
    load: 0
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

  function log(level, msg) {
    try {
      if (global.RCF_LOGGER && typeof global.RCF_LOGGER.push === "function") {
        global.RCF_LOGGER.push(level, "[FACTORY_STATE] " + msg);
      }
    } catch (_) {}
    try { console.log("[FACTORY_STATE]", level, msg); } catch (_) {}
  }

  function throttledWarn(kind, msg) {
    var t = nowMS();
    var last = __warnAt[kind] || 0;
    if ((t - last) < WARN_THROTTLE_MS) return;
    __warnAt[kind] = t;
    log("WARN", msg);
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
      diagnostics: false,

      factoryAIPlanner: false,
      factoryAIBridge: false,
      factoryAIActions: false,
      patchSupervisor: false,
      factoryAIMemory: false,
      factoryAIAutoLoop: false,
      factoryAISelfEvolution: false,
      factoryAIExecutionGate: false,
      factoryAIProposalUI: false,
      factoryAIController: false,
      factoryAIPolicy: false,
      factoryAIArchitect: false,
      factoryAIFocusEngine: false,
      factoryPhaseEngine: false
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

    try { out.factoryAIPlanner = !!global.RCF_FACTORY_AI_PLANNER; } catch (_) {}
    try { out.factoryAIBridge = !!global.RCF_FACTORY_AI_BRIDGE; } catch (_) {}
    try { out.factoryAIActions = !!global.RCF_FACTORY_AI_ACTIONS; } catch (_) {}
    try { out.patchSupervisor = !!global.RCF_PATCH_SUPERVISOR; } catch (_) {}
    try { out.factoryAIMemory = !!global.RCF_FACTORY_AI_MEMORY; } catch (_) {}
    try { out.factoryAIAutoLoop = !!global.RCF_FACTORY_AI_AUTOLOOP; } catch (_) {}
    try { out.factoryAISelfEvolution = !!global.RCF_FACTORY_AI_SELF_EVOLUTION; } catch (_) {}
    try { out.factoryAIExecutionGate = !!global.RCF_FACTORY_AI_EXECUTION_GATE; } catch (_) {}
    try { out.factoryAIProposalUI = !!global.RCF_FACTORY_AI_PROPOSAL_UI; } catch (_) {}
    try { out.factoryAIController = !!global.RCF_FACTORY_AI_CONTROLLER; } catch (_) {}
    try { out.factoryAIPolicy = !!global.RCF_FACTORY_AI_POLICY; } catch (_) {}
    try { out.factoryAIArchitect = !!global.RCF_FACTORY_AI_ARCHITECT; } catch (_) {}
    try { out.factoryAIFocusEngine = !!global.RCF_FACTORY_AI_FOCUS_ENGINE; } catch (_) {}
    try { out.factoryPhaseEngine = !!global.RCF_FACTORY_PHASE_ENGINE; } catch (_) {}

    return out;
  }

  function detectRegistryActiveModules() {
    try {
      if (!global.RCF_MODULE_REGISTRY || typeof global.RCF_MODULE_REGISTRY.summary !== "function") {
        return [];
      }

      var summary = global.RCF_MODULE_REGISTRY.summary() || {};

      if (Array.isArray(summary.active)) {
        return uniq(summary.active);
      }

      if (summary.modules && typeof summary.modules === "object") {
        var active = [];
        Object.keys(summary.modules).forEach(function (k) {
          if (summary.modules[k]) active.push(k);
        });
        return uniq(active);
      }
    } catch (_) {}

    return [];
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
      var active = detectRegistryActiveModules();

      if (current === "error") return "error";
      if (current === "ready") return "ready";

      if (
        active.length > 0 ||
        mods.logger ||
        mods.doctor ||
        mods.contextEngine ||
        mods.factoryTree ||
        mods.factoryAI ||
        mods.factoryAIPlanner ||
        mods.factoryAIBridge ||
        mods.factoryAIActions ||
        mods.patchSupervisor ||
        mods.factoryAIMemory ||
        mods.factoryAIController ||
        mods.factoryAIPolicy ||
        mods.factoryPhaseEngine
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

  function serializeForPersist() {
    try {
      return JSON.stringify(state);
    } catch (_) {
      return "";
    }
  }

  function touchState() {
    state.lastUpdate = nowISO();
  }

  function writeSnapshot(serialized) {
    if (!serialized) return false;

    __memorySnapshot = serialized;

    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      __lastPersistSnapshot = serialized;
      return true;
    } catch (_) {
      throttledWarn("persist", "persist falhou");
      return false;
    }
  }

  function flushPersist() {
    __persistQueued = false;

    if (__persistTimer) {
      try { clearTimeout(__persistTimer); } catch (_) {}
      __persistTimer = null;
    }

    touchState();

    var serialized = serializeForPersist();
    if (!serialized) return false;

    if (serialized === __lastPersistSnapshot) {
      __memorySnapshot = serialized;
      return true;
    }

    return writeSnapshot(serialized);
  }

  function schedulePersist(forceNow) {
    if (forceNow) return flushPersist();

    __persistQueued = true;

    if (__persistTimer) return true;

    __persistTimer = setTimeout(function () {
      flushPersist();
    }, PERSIST_DEBOUNCE_MS);

    return true;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);

      if (!raw && __memorySnapshot) {
        raw = __memorySnapshot;
      }

      if (!raw) return false;

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;

      state = safeMerge(clone(state), parsed);
      __lastPersistSnapshot = raw;
      __memorySnapshot = raw;
      return true;
    } catch (_) {
      throttledWarn("load", "load falhou");
      return false;
    }
  }

  function init(initConfig) {
    load();

    var activeCtx = detectActiveContext();
    var knownModules = detectKnownModules();
    var activeModules = detectRegistryActiveModules();

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
      activeModules: activeModules,
      modules: knownModules,
      health: {
        lastRefresh: nowISO()
      }
    };

    state = safeMerge(clone(state), base);
    state = safeMerge(clone(state), initConfig || {});
    state.modules = state.modules || {};
    state.modules.factoryState = true;
    state.activeModules = uniq(state.activeModules || []);
    touchState();

    schedulePersist(false);
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
    schedulePersist(false);
    return true;
  }

  function setModule(name, value) {
    if (!name) return false;

    var key = String(name);
    var next = !!value;

    state.modules = state.modules || {};

    if (state.modules[key] === next) return true;

    state.modules[key] = next;
    state.modules.factoryState = true;
    schedulePersist(false);
    return true;
  }

  function setModules(mods) {
    if (!mods || typeof mods !== "object") return false;

    var changed = false;
    state.modules = state.modules || {};

    Object.keys(mods).forEach(function (name) {
      var next = !!mods[name];
      if (state.modules[String(name)] !== next) {
        state.modules[String(name)] = next;
        changed = true;
      }
    });

    state.modules.factoryState = true;

    if (!changed) return true;

    schedulePersist(false);
    return true;
  }

  function setActiveModules(list) {
    var next = uniq(list || []);
    var prev = JSON.stringify(state.activeModules || []);
    var curr = JSON.stringify(next);

    if (prev === curr) return true;

    state.activeModules = next;
    schedulePersist(false);
    return true;
  }

  function registerModule(name) {
    return setModule(name, true);
  }

  function markBoot(status) {
    var next = String(status || "unknown");
    if (state.bootStatus === next) return true;
    state.bootStatus = next;
    schedulePersist(false);
    return true;
  }

  function setBootStatus(status) {
    return markBoot(status);
  }

  function setRuntime(runtime) {
    var next = String(runtime || "browser");
    if (state.runtimeVFS === next) return true;
    state.runtimeVFS = next;
    schedulePersist(false);
    return true;
  }

  function setLoggerReady(flag) {
    var next = !!flag;
    var changed = false;

    if (state.loggerReady !== next) {
      state.loggerReady = next;
      changed = true;
    }

    state.modules = state.modules || {};
    if (state.modules.logger !== next) {
      state.modules.logger = next;
      changed = true;
    }

    state.modules.factoryState = true;

    if (state.bootStatus === "booting" && next) {
      state.bootStatus = "ready";
      changed = true;
    }

    if (!changed) return true;

    schedulePersist(false);
    return true;
  }

  function setDoctorReady(flag) {
    var next = !!flag;
    var changed = false;

    if (state.doctorReady !== next) {
      state.doctorReady = next;
      changed = true;
    }

    state.modules = state.modules || {};
    if (state.modules.doctor !== next) {
      state.modules.doctor = next;
      changed = true;
    }

    state.modules.factoryState = true;

    if (!changed) return true;

    schedulePersist(false);
    return true;
  }

  function setActiveView(viewName) {
    var next = String(viewName || "");
    if (state.activeView === next) return true;
    state.activeView = next;
    schedulePersist(false);
    return true;
  }

  function setActiveAppSlug(appSlug) {
    var next = String(appSlug || "");
    if (state.activeAppSlug === next) return true;
    state.activeAppSlug = next;
    schedulePersist(false);
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

    schedulePersist(false);
    return true;
  }

  function refreshRuntime() {
    var activeCtx = detectActiveContext();
    var knownModules = detectKnownModules();
    var activeModules = detectRegistryActiveModules();

    var changed = false;
    var nextFactoryVersion = global.RCF_VERSION || state.factoryVersion || "1.0.0";
    var nextRuntimeVFS = detectRuntimeVFS();
    var nextEnvironment = detectEnvironment();
    var nextUserAgent = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : null;
    var nextActiveModules = uniq(activeModules);
    var nextBoot = state.bootStatus;

    if (state.factoryVersion !== nextFactoryVersion) {
      state.factoryVersion = nextFactoryVersion;
      changed = true;
    }

    if (state.engineVersion !== VERSION) {
      state.engineVersion = VERSION;
      changed = true;
    }

    if (state.runtimeVFS !== nextRuntimeVFS) {
      state.runtimeVFS = nextRuntimeVFS;
      changed = true;
    }

    if (state.loggerReady !== !!knownModules.logger) {
      state.loggerReady = !!knownModules.logger;
      changed = true;
    }

    if (state.doctorReady !== !!knownModules.doctor) {
      state.doctorReady = !!knownModules.doctor;
      changed = true;
    }

    if (state.environment !== nextEnvironment) {
      state.environment = nextEnvironment;
      changed = true;
    }

    if (state.userAgent !== nextUserAgent) {
      state.userAgent = nextUserAgent;
      changed = true;
    }

    if (state.activeView !== activeCtx.activeView) {
      state.activeView = activeCtx.activeView;
      changed = true;
    }

    if (state.activeAppSlug !== activeCtx.activeAppSlug) {
      state.activeAppSlug = activeCtx.activeAppSlug;
      changed = true;
    }

    if (JSON.stringify(state.activeModules || []) !== JSON.stringify(nextActiveModules)) {
      state.activeModules = nextActiveModules;
      changed = true;
    }

    var beforeModules = JSON.stringify(state.modules || {});
    state.modules = safeMerge(clone(state.modules || {}), knownModules);
    state.modules.factoryState = true;
    if (JSON.stringify(state.modules || {}) !== beforeModules) {
      changed = true;
    }

    state.health = state.health || {};
    var nextRefresh = nowISO();
    if (state.health.lastRefresh !== nextRefresh) {
      state.health.lastRefresh = nextRefresh;
      changed = true;
    }

    if (state.bootStatus === "booting" || state.bootStatus === "unknown") {
      nextBoot = detectBootStatus();
    }

    if (
      nextBoot !== "ready" &&
      (
        state.loggerReady ||
        state.doctorReady ||
        state.modules.contextEngine ||
        state.modules.factoryTree ||
        state.modules.factoryAI ||
        state.modules.factoryAIPlanner ||
        state.modules.factoryAIBridge ||
        state.modules.factoryAIActions ||
        state.modules.patchSupervisor ||
        state.modules.factoryAIMemory ||
        state.modules.factoryAIController ||
        state.modules.factoryAIPolicy ||
        state.modules.factoryPhaseEngine ||
        state.activeModules.length > 0
      )
    ) {
      nextBoot = "ready";
    }

    if (state.bootStatus !== nextBoot) {
      state.bootStatus = nextBoot;
      changed = true;
    }

    if (!changed) return true;

    schedulePersist(false);
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
      activeModules: clone(state.activeModules || []),
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
    __v142: true,
    __v143: true,
    __v144: true,
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
    persistState: function () { return flushPersist(); },
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

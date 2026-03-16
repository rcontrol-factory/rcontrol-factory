/* FILE: /app/js/core/module_registry.js
   RControl Factory — Module Registry
   v1.4.2 STABLE / REBUILD FROM ZERO

   Objetivo:
   - detectar módulos globais realmente carregados
   - manter lista coerente de módulos ativos no runtime atual
   - sincronizar com RCF_FACTORY_STATE sem depender rigidamente dele
   - expor summary confiável para Context Engine / Factory AI
   - reduzir snapshot vazio/inconsistente em Safari / PWA / pageshow / restore
   - funcionar como script clássico
*/

(function (global) {
  "use strict";

  if (global.RCF_MODULE_REGISTRY && global.RCF_MODULE_REGISTRY.__v142) return;

  var VERSION = "v1.4.2";

  var MODULE_KEYS = [
    "logger",
    "doctor",
    "github",
    "vault",
    "bridge",
    "adminAI",
    "factoryAI",
    "factoryState",
    "moduleRegistry",
    "contextEngine",
    "factoryTree",
    "diagnostics",
    "injector",
    "ui",
    "runtime"
  ];

  var modules = {
    logger: false,
    doctor: false,
    github: false,
    vault: false,
    bridge: false,
    adminAI: false,
    factoryAI: false,
    factoryState: false,
    moduleRegistry: true,
    contextEngine: false,
    factoryTree: false,
    diagnostics: false,
    injector: false,
    ui: false,
    runtime: false
  };

  var meta = {
    version: VERSION,
    lastRefresh: null,
    lastChange: null,
    bootedAt: nowISO()
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

  function hasFn(obj, name) {
    try { return !!obj && typeof obj[name] === "function"; }
    catch (_) { return false; }
  }

  function sameModules(a, b) {
    try {
      for (var i = 0; i < MODULE_KEYS.length; i++) {
        var k = MODULE_KEYS[i];
        if (!!safe(function () { return a[k]; }, false) !== !!safe(function () { return b[k]; }, false)) {
          return false;
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function detectLogger() {
    try {
      return !!global.RCF_LOGGER &&
        (
          Array.isArray(global.RCF_LOGGER.items) ||
          Array.isArray(global.RCF_LOGGER.lines) ||
          hasFn(global.RCF_LOGGER, "push") ||
          hasFn(global.RCF_LOGGER, "write") ||
          hasFn(global.RCF_LOGGER, "dump") ||
          hasFn(global.RCF_LOGGER, "getText") ||
          hasFn(global.RCF_LOGGER, "getAll")
        );
    } catch (_) {
      return false;
    }
  }

  function detectDoctor() {
    try {
      return !!global.RCF_DOCTOR_SCAN || !!global.RCF_DOCTOR;
    } catch (_) {
      return false;
    }
  }

  function detectGitHub() {
    try {
      return !!global.RCF_GH_SYNC &&
        (
          hasFn(global.RCF_GH_SYNC, "pull") ||
          hasFn(global.RCF_GH_SYNC, "push") ||
          hasFn(global.RCF_GH_SYNC, "pushMotherBundle") ||
          hasFn(global.RCF_GH_SYNC, "buildFactoryBundle")
        );
    } catch (_) {
      return false;
    }
  }

  function detectVault() {
    try {
      return !!global.RCF_ZIP_VAULT;
    } catch (_) {
      return false;
    }
  }

  function detectBridge() {
    try {
      return !!global.RCF_AGENT_ZIP_BRIDGE;
    } catch (_) {
      return false;
    }
  }

  function detectAdminAI() {
    try {
      return !!global.RCF_ADMIN_AI &&
        (
          hasFn(global.RCF_ADMIN_AI, "mount") ||
          hasFn(global.RCF_ADMIN_AI, "sendPrompt") ||
          !!global.RCF_ADMIN_AI.__v41_bridge ||
          !!global.RCF_ADMIN_AI.__v411_bridge ||
          !!global.RCF_ADMIN_AI.__v42_bridge
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryAI() {
    try {
      var api = global.RCF_FACTORY_AI || global.RCF_FACTORY_IA;
      return !!api &&
        (
          hasFn(api, "mount") ||
          hasFn(api, "sendPrompt") ||
          hasFn(api, "getHistory") ||
          !!api.__v41 ||
          !!api.__v411 ||
          !!api.__v42
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryState() {
    try {
      return !!global.RCF_FACTORY_STATE &&
        (
          hasFn(global.RCF_FACTORY_STATE, "getState") ||
          hasFn(global.RCF_FACTORY_STATE, "status") ||
          hasFn(global.RCF_FACTORY_STATE, "refreshRuntime")
        );
    } catch (_) {
      return false;
    }
  }

  function detectContextEngine() {
    try {
      return !!global.RCF_CONTEXT &&
        (
          hasFn(global.RCF_CONTEXT, "getSnapshot") ||
          hasFn(global.RCF_CONTEXT, "getContext") ||
          hasFn(global.RCF_CONTEXT, "summary")
        );
    } catch (_) {
      return false;
    }
  }

  function detectFactoryTree() {
    try {
      return !!global.RCF_FACTORY_TREE &&
        (
          hasFn(global.RCF_FACTORY_TREE, "summary") ||
          hasFn(global.RCF_FACTORY_TREE, "getAllPaths") ||
          hasFn(global.RCF_FACTORY_TREE, "getTree")
        );
    } catch (_) {
      return false;
    }
  }

  function detectDiagnostics() {
    try {
      return !!global.RCF_DIAGNOSTICS;
    } catch (_) {
      return false;
    }
  }

  function detectInjector() {
    try {
      return !!global.RCF_INJECTOR_SAFE ||
        !!global.RCF_INJECTOR ||
        !!global.RCF_INJECTOR_SAFE_UI ||
        !!global.RCF_AGENT_INJECTOR ||
        !!global.RCF_PREVIEW_INJECTOR;
    } catch (_) {
      return false;
    }
  }

  function detectUI() {
    try {
      return !!global.RCF_UI ||
        !!global.RCF_UI_RUNTIME ||
        !!global.RCF_UI_BOOTSTRAP ||
        !!global.RCF_UI_VIEWS ||
        !!global.RCF_UI_ROUTER ||
        !!global.RCF_UI_EVENTS ||
        !!global.RCF_UI_STATE ||
        !!global.RCF_UI_DASHBOARD;
    } catch (_) {
      return false;
    }
  }

  function detectRuntime() {
    try {
      return !!global.__RCF_VFS_RUNTIME ||
        !!global.RCF_RUNTIME ||
        !!safe(function () { return global.RCF && global.RCF.state; }, null) ||
        !!safe(function () { return global.RCF_OVERRIDES_VFS; }, null);
    } catch (_) {
      return false;
    }
  }

  function computeModules() {
    return {
      logger: detectLogger(),
      doctor: detectDoctor(),
      github: detectGitHub(),
      vault: detectVault(),
      bridge: detectBridge(),
      adminAI: detectAdminAI(),
      factoryAI: detectFactoryAI(),
      factoryState: detectFactoryState(),
      moduleRegistry: true,
      contextEngine: detectContextEngine(),
      factoryTree: detectFactoryTree(),
      diagnostics: detectDiagnostics(),
      injector: detectInjector(),
      ui: detectUI(),
      runtime: detectRuntime()
    };
  }

  function syncToFactoryState() {
    try {
      if (!global.RCF_FACTORY_STATE) return;

      if (hasFn(global.RCF_FACTORY_STATE, "setModules")) {
        global.RCF_FACTORY_STATE.setModules(clone(modules));
      }

      if (hasFn(global.RCF_FACTORY_STATE, "setLoggerReady")) {
        global.RCF_FACTORY_STATE.setLoggerReady(!!modules.logger);
      }

      if (hasFn(global.RCF_FACTORY_STATE, "setDoctorReady")) {
        global.RCF_FACTORY_STATE.setDoctorReady(!!modules.doctor);
      }

      if (hasFn(global.RCF_FACTORY_STATE, "registerModule")) {
        global.RCF_FACTORY_STATE.registerModule("moduleRegistry");
      } else if (hasFn(global.RCF_FACTORY_STATE, "setModule")) {
        global.RCF_FACTORY_STATE.setModule("moduleRegistry", true);
      }

      if (hasFn(global.RCF_FACTORY_STATE, "refreshRuntime")) {
        global.RCF_FACTORY_STATE.refreshRuntime();
      }
    } catch (_) {}
  }

  function logRefresh(before, after) {
    try {
      if (!sameModules(before, after) && global.RCF_LOGGER && hasFn(global.RCF_LOGGER, "push")) {
        global.RCF_LOGGER.push("INFO", "[MODULE_REGISTRY] refresh -> " + JSON.stringify(after));
      }
    } catch (_) {}
  }

  function refresh() {
    var before = clone(modules);
    var next = computeModules();

    modules = clone(next);
    meta.lastRefresh = nowISO();

    if (!sameModules(before, next)) {
      meta.lastChange = meta.lastRefresh;
    }

    syncToFactoryState();
    logRefresh(before, next);

    return getModules();
  }

  function register(name) {
    var key = String(name || "").trim();
    if (!key) return false;

    if (!Object.prototype.hasOwnProperty.call(modules, key)) {
      modules[key] = true;
      if (MODULE_KEYS.indexOf(key) < 0) MODULE_KEYS.push(key);
    } else {
      modules[key] = true;
    }

    meta.lastChange = nowISO();
    meta.lastRefresh = meta.lastChange;
    syncToFactoryState();
    return true;
  }

  function unregister(name) {
    var key = String(name || "").trim();
    if (!key) return false;
    if (key === "moduleRegistry") return false;
    if (!Object.prototype.hasOwnProperty.call(modules, key)) return false;

    modules[key] = false;
    meta.lastChange = nowISO();
    meta.lastRefresh = meta.lastChange;
    syncToFactoryState();
    return true;
  }

  function getModules() {
    return clone(modules);
  }

  function getActiveModules() {
    return Object.keys(modules).filter(function (k) {
      return !!modules[k];
    });
  }

  function getActiveModuleNames() {
    return getActiveModules();
  }

  function counts() {
    var total = Object.keys(modules).length;
    var active = getActiveModules().length;
    return {
      total: total,
      active: active,
      inactive: Math.max(0, total - active)
    };
  }

  function summary() {
    refresh();

    var c = counts();
    var active = getActiveModules();
    var current = getModules();

    return {
      version: VERSION,
      total: c.total,
      activeCount: c.active,
      inactiveCount: c.inactive,
      active: active,
      modules: clone(current),

      logger: !!current.logger,
      doctor: !!current.doctor,
      github: !!current.github,
      vault: !!current.vault,
      bridge: !!current.bridge,
      adminAI: !!current.adminAI,
      factoryAI: !!current.factoryAI,
      factoryState: !!current.factoryState,
      moduleRegistry: !!current.moduleRegistry,
      contextEngine: !!current.contextEngine,
      factoryTree: !!current.factoryTree,
      diagnostics: !!current.diagnostics,
      injector: !!current.injector,
      ui: !!current.ui,
      runtime: !!current.runtime,

      lastRefresh: meta.lastRefresh || nowISO(),
      lastChange: meta.lastChange || null,
      ts: nowISO()
    };
  }

  global.RCF_MODULE_REGISTRY = {
    __v1: true,
    __v11: true,
    __v12: true,
    __v13: true,
    __v14: true,
    __v141: true,
    __v142: true,
    version: VERSION,
    register: register,
    unregister: unregister,
    refresh: refresh,
    getModules: getModules,
    getActiveModules: getActiveModules,
    getActiveModuleNames: getActiveModuleNames,
    counts: counts,
    summary: summary
  };

  try {
    refresh();
    console.log("[RCF] module_registry ready", VERSION);
  } catch (_) {}

  try {
    global.addEventListener("DOMContentLoaded", function () {
      try { refresh(); } catch (_) {}
    }, { once: true });
  } catch (_) {}

  try {
    global.addEventListener("load", function () {
      try { refresh(); } catch (_) {}
    }, { once: true });
  } catch (_) {}

  try {
    global.addEventListener("pageshow", function () {
      try { refresh(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    global.addEventListener("focus", function () {
      try { refresh(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener("visibilitychange", function () {
        try {
          if (global.document.visibilityState === "visible") {
            refresh();
          }
        } catch (_) {}
      }, { passive: true });
    }
  } catch (_) {}

  try {
    global.addEventListener("RCF:UI_READY", function () {
      try { refresh(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    setTimeout(function () {
      try { refresh(); } catch (_) {}
    }, 250);

    setTimeout(function () {
      try { refresh(); } catch (_) {}
    }, 900);

    setTimeout(function () {
      try { refresh(); } catch (_) {}
    }, 1800);

    setTimeout(function () {
      try { refresh(); } catch (_) {}
    }, 3200);
  } catch (_) {}

})(window);

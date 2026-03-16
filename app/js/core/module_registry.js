/* FILE: /app/js/core/module_registry.js
   RControl Factory — Module Registry
   v1.4.1 STABLE / PATCH MÍNIMO

   Objetivo:
   - detectar automaticamente módulos globais já carregados
   - registrar módulos ativos reais
   - sincronizar com RCF_FACTORY_STATE
   - expor snapshot mais confiável para o Context Engine
   - ampliar visibilidade da Factory AI sem reescrever a estrutura
   - melhorar estabilidade no Safari / PWA / pageshow / restore
*/

(function (global) {
  "use strict";

  if (global.RCF_MODULE_REGISTRY && global.RCF_MODULE_REGISTRY.__v141) return;

  var VERSION = "v1.4.1";

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

  var lastSummaryTs = null;

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function safe(fn, fallback) {
    try {
      var v = fn();
      return (v === undefined ? fallback : v);
    } catch (_) {
      return fallback;
    }
  }

  function nowISO() {
    try { return new Date().toISOString(); }
    catch (_) { return ""; }
  }

  function sameModules(a, b) {
    try {
      var ak = Object.keys(a || {}).sort();
      var bk = Object.keys(b || {}).sort();
      if (ak.length !== bk.length) return false;

      for (var i = 0; i < ak.length; i++) {
        if (ak[i] !== bk[i]) return false;
        if (!!a[ak[i]] !== !!b[bk[i]]) return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function syncToFactoryState() {
    try {
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.setModules === "function") {
        global.RCF_FACTORY_STATE.setModules(clone(modules));
      }
    } catch (_) {}

    try {
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.setLoggerReady === "function") {
        global.RCF_FACTORY_STATE.setLoggerReady(!!modules.logger);
      }
    } catch (_) {}

    try {
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.setDoctorReady === "function") {
        global.RCF_FACTORY_STATE.setDoctorReady(!!modules.doctor);
      }
    } catch (_) {}

    try {
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.refreshRuntime === "function") {
        global.RCF_FACTORY_STATE.refreshRuntime();
      }
    } catch (_) {}
  }

  function detectModules() {
    var before = clone(modules);

    try { modules.logger = !!global.RCF_LOGGER; } catch (_) {}
    try { modules.doctor = !!global.RCF_DOCTOR_SCAN || !!global.RCF_DOCTOR; } catch (_) {}
    try { modules.github = !!global.RCF_GH_SYNC; } catch (_) {}
    try { modules.vault = !!global.RCF_ZIP_VAULT; } catch (_) {}
    try { modules.bridge = !!global.RCF_AGENT_ZIP_BRIDGE; } catch (_) {}
    try { modules.adminAI = !!global.RCF_ADMIN_AI; } catch (_) {}
    try { modules.factoryAI = !!global.RCF_FACTORY_AI || !!global.RCF_FACTORY_IA; } catch (_) {}
    try { modules.factoryState = !!global.RCF_FACTORY_STATE; } catch (_) {}
    try { modules.contextEngine = !!global.RCF_CONTEXT; } catch (_) {}
    try { modules.factoryTree = !!global.RCF_FACTORY_TREE; } catch (_) {}
    try { modules.diagnostics = !!global.RCF_DIAGNOSTICS; } catch (_) {}
    try { modules.injector = !!global.RCF_INJECTOR || !!global.RCF_AGENT_INJECTOR || !!global.RCF_PREVIEW_INJECTOR; } catch (_) {}
    try { modules.ui = !!global.RCF_UI || !!global.RCF_UI_RUNTIME || !!global.RCF_UI_BOOTSTRAP || !!global.RCF_UI_VIEWS; } catch (_) {}
    try {
      modules.runtime =
        !!global.__RCF_VFS_RUNTIME ||
        !!global.RCF_RUNTIME ||
        !!safe(function () { return global.RCF && global.RCF.runtime; }, null);
    } catch (_) {}

    syncToFactoryState();

    try {
      if (!sameModules(before, modules)) {
        lastSummaryTs = nowISO();
        if (global.RCF_LOGGER && typeof global.RCF_LOGGER.push === "function") {
          global.RCF_LOGGER.push("INFO", "[MODULE_REGISTRY] refresh -> " + JSON.stringify(modules));
        }
      }
    } catch (_) {}

    return modules;
  }

  function register(name) {
    if (!name) return false;
    modules[String(name)] = true;
    lastSummaryTs = nowISO();
    syncToFactoryState();
    return true;
  }

  function unregister(name) {
    if (!name) return false;
    if (name === "moduleRegistry") return false;
    if (!Object.prototype.hasOwnProperty.call(modules, String(name))) return false;
    modules[String(name)] = false;
    lastSummaryTs = nowISO();
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
    var keys = Object.keys(modules);
    var active = getActiveModules();
    return {
      total: keys.length,
      active: active.length,
      inactive: keys.length - active.length
    };
  }

  function refresh() {
    detectModules();
    return getModules();
  }

  function summary() {
    var current = refresh();
    var c = counts();

    return {
      version: VERSION,
      total: c.total,
      activeCount: c.active,
      inactiveCount: c.inactive,
      active: getActiveModules(),
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

      lastRefresh: lastSummaryTs || nowISO(),
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
    detectModules();
    console.log("[RCF] module_registry ready", VERSION);
  } catch (_) {}

  try {
    global.addEventListener("load", function () {
      try { detectModules(); } catch (_) {}
    }, { once: true });
  } catch (_) {}

  try {
    global.addEventListener("DOMContentLoaded", function () {
      try { detectModules(); } catch (_) {}
    }, { once: true });
  } catch (_) {}

  try {
    global.addEventListener("pageshow", function () {
      try { detectModules(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener("visibilitychange", function () {
        try {
          if (global.document.visibilityState === "visible") detectModules();
        } catch (_) {}
      }, { passive: true });
    }
  } catch (_) {}

  try {
    global.addEventListener("focus", function () {
      try { detectModules(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    global.addEventListener("RCF:UI_READY", function () {
      try { detectModules(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    setTimeout(function () {
      try { detectModules(); } catch (_) {}
    }, 300);

    setTimeout(function () {
      try { detectModules(); } catch (_) {}
    }, 900);

    setTimeout(function () {
      try { detectModules(); } catch (_) {}
    }, 1800);

    setTimeout(function () {
      try { detectModules(); } catch (_) {}
    }, 3200);
  } catch (_) {}

})(window);

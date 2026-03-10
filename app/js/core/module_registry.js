/* FILE: /app/js/core/module_registry.js
   RControl Factory — Module Registry
   v1.2 STABLE / PATCH MÍNIMO

   Objetivo:
   - detectar automaticamente módulos globais já carregados
   - registrar módulos ativos reais
   - sincronizar com RCF_FACTORY_STATE
   - expor snapshot mais confiável para o Context Engine
*/

(function (global) {
  "use strict";

  if (global.RCF_MODULE_REGISTRY && global.RCF_MODULE_REGISTRY.__v12) return;

  var VERSION = "v1.2";

  var modules = {
    logger: false,
    doctor: false,
    github: false,
    vault: false,
    bridge: false,
    adminAI: false,
    factoryState: false,
    moduleRegistry: true,
    contextEngine: false,
    factoryTree: false
  };

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function syncToFactoryState() {
    try {
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.setModules === "function") {
        global.RCF_FACTORY_STATE.setModules(modules);
      }
    } catch (_) {}
  }

  function detectModules() {
    try { modules.logger = !!global.RCF_LOGGER; } catch (_) {}
    try { modules.doctor = !!global.RCF_DOCTOR_SCAN; } catch (_) {}
    try { modules.github = !!global.RCF_GH_SYNC; } catch (_) {}
    try { modules.vault = !!global.RCF_ZIP_VAULT; } catch (_) {}
    try { modules.bridge = !!global.RCF_AGENT_ZIP_BRIDGE; } catch (_) {}
    try { modules.adminAI = !!global.RCF_ADMIN_AI; } catch (_) {}
    try { modules.factoryState = !!global.RCF_FACTORY_STATE; } catch (_) {}
    try { modules.contextEngine = !!global.RCF_CONTEXT; } catch (_) {}
    try { modules.factoryTree = !!global.RCF_FACTORY_TREE; } catch (_) {}

    syncToFactoryState();

    try {
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.setLoggerReady === "function") {
        global.RCF_FACTORY_STATE.setLoggerReady(!!modules.logger);
      }
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.setDoctorReady === "function") {
        global.RCF_FACTORY_STATE.setDoctorReady(!!modules.doctor);
      }
    } catch (_) {}

    return modules;
  }

  function register(name) {
    if (!name) return false;
    modules[String(name)] = true;
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

  function refresh() {
    detectModules();
    return getModules();
  }

  function summary() {
    var current = refresh();

    return {
      version: VERSION,
      total: Object.keys(current).length,
      active: getActiveModules(),
      modules: clone(current),
      logger: !!current.logger,
      doctor: !!current.doctor,
      github: !!current.github,
      vault: !!current.vault,
      bridge: !!current.bridge,
      adminAI: !!current.adminAI,
      factoryState: !!current.factoryState,
      moduleRegistry: !!current.moduleRegistry,
      contextEngine: !!current.contextEngine,
      factoryTree: !!current.factoryTree,
      ts: new Date().toISOString()
    };
  }

  global.RCF_MODULE_REGISTRY = {
    __v1: true,
    __v11: true,
    __v12: true,
    version: VERSION,
    register: register,
    refresh: refresh,
    getModules: getModules,
    getActiveModules: getActiveModules,
    getActiveModuleNames: getActiveModuleNames,
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
    global.addEventListener("RCF:UI_READY", function () {
      try { detectModules(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    setTimeout(function () {
      try { detectModules(); } catch (_) {}
    }, 600);
    setTimeout(function () {
      try { detectModules(); } catch (_) {}
    }, 1800);
  } catch (_) {}

})(window);

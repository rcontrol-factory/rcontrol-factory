/* FILE: /app/js/core/module_registry.js
   RControl Factory — Module Registry
   v1.1 SAFE / PATCH MÍNIMO

   - detecção automática de módulos globais
   - não altera módulos existentes
   - sincroniza de forma leve com RCF_FACTORY_STATE
*/

(function (global) {
  "use strict";

  if (global.RCF_MODULE_REGISTRY && global.RCF_MODULE_REGISTRY.__v11) return;

  var VERSION = "v1.1";

  var modules = {
    logger: false,
    doctor: false,
    github: false,
    vault: false,
    bridge: false,
    adminAI: false,
    factoryState: false,
    moduleRegistry: true,
    contextEngine: false
  };

  function syncToFactoryState() {
    try {
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.setModules === "function") {
        global.RCF_FACTORY_STATE.setModules(modules);
      } else if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.setModule === "function") {
        Object.keys(modules).forEach(function (k) {
          global.RCF_FACTORY_STATE.setModule(k, modules[k]);
        });
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

    syncToFactoryState();
    return modules;
  }

  function getModules() {
    return Object.assign({}, modules);
  }

  function refresh() {
    detectModules();
    return getModules();
  }

  function getActiveModuleNames() {
    var out = [];
    Object.keys(modules).forEach(function (k) {
      if (modules[k]) out.push(k);
    });
    return out;
  }

  function summary() {
    var m = refresh();

    return {
      logger: m.logger,
      doctor: m.doctor,
      github: m.github,
      vault: m.vault,
      bridge: m.bridge,
      adminAI: m.adminAI,
      factoryState: m.factoryState,
      moduleRegistry: m.moduleRegistry,
      contextEngine: m.contextEngine,
      active: getActiveModuleNames(),
      ts: new Date().toISOString()
    };
  }

  global.RCF_MODULE_REGISTRY = {
    __v1: true,
    __v11: true,
    version: VERSION,
    refresh: refresh,
    getModules: getModules,
    getActiveModuleNames: getActiveModuleNames,
    summary: summary
  };

  setTimeout(function () {
    try { detectModules(); } catch (_) {}
  }, 0);

  try {
    window.addEventListener("RCF:UI_READY", function () {
      try { detectModules(); } catch (_) {}
    }, { passive: true });
  } catch (_) {}

  try {
    console.log("[RCF] module_registry ready", VERSION);
  } catch (_) {}

})(window);

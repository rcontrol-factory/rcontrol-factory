/* FILE: /app/js/core/module_registry.js
   RControl Factory — Module Registry
   - detecção automática de módulos globais
   - patch mínimo
   - não altera boot
   - não altera módulos existentes
*/

(function (global) {
  "use strict";

  if (global.RCF_MODULE_REGISTRY && global.RCF_MODULE_REGISTRY.__v1) return;

  const VERSION = "v1.0";

  const modules = {
    logger: false,
    doctor: false,
    github: false,
    vault: false,
    bridge: false,
    adminAI: false,
    factoryState: false
  };

  function detectModules() {

    try { modules.logger = !!global.RCF_LOGGER; } catch {}
    try { modules.doctor = !!global.RCF_DOCTOR_SCAN; } catch {}
    try { modules.github = !!global.RCF_GH_SYNC; } catch {}
    try { modules.vault = !!global.RCF_ZIP_VAULT; } catch {}
    try { modules.bridge = !!global.RCF_AGENT_ZIP_BRIDGE; } catch {}
    try { modules.adminAI = !!global.RCF_ADMIN_AI; } catch {}
    try { modules.factoryState = !!global.RCF_FACTORY_STATE; } catch {}

    return modules;
  }

  function getModules() {
    return Object.assign({}, modules);
  }

  function refresh() {
    detectModules();
    return getModules();
  }

  function summary() {
    const m = refresh();

    return {
      logger: m.logger,
      doctor: m.doctor,
      github: m.github,
      vault: m.vault,
      bridge: m.bridge,
      adminAI: m.adminAI,
      factoryState: m.factoryState,
      ts: new Date().toISOString()
    };
  }

  global.RCF_MODULE_REGISTRY = {
    __v1: true,
    version: VERSION,
    refresh,
    getModules,
    summary
  };

  // detecção inicial
  setTimeout(function () {
    try { detectModules(); } catch {}
  }, 0);

  try {
    console.log("[RCF] module_registry ready", VERSION);
  } catch {}

})(window);

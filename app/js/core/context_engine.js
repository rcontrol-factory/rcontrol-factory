/* FILE: /app/js/core/context_engine.js
   RControl Factory — Context Engine
   - memória estrutural da Factory
   - coleta informações de estado e módulos
   - usado pela Admin AI
   - patch mínimo
*/

(function (global) {

  "use strict";

  if (global.RCF_CONTEXT && global.RCF_CONTEXT.__v1) return;

  const VERSION = "v1.0";

  function safe(fn) {
    try { return fn(); } catch { return null; }
  }

  function getModules() {
    return safe(() =>
      global.RCF_MODULE_REGISTRY
        ? global.RCF_MODULE_REGISTRY.summary()
        : {}
    ) || {};
  }

  function getState() {
    return safe(() =>
      global.RCF_FACTORY_STATE
        ? global.RCF_FACTORY_STATE.getState()
        : {}
    ) || {};
  }

  function getEnvironment() {

    return {
      href: safe(() => location.href),
      userAgent: safe(() => navigator.userAgent),
      platform: safe(() => navigator.platform),
      ts: new Date().toISOString()
    };

  }

  function buildContext() {

    return {
      version: VERSION,
      modules: getModules(),
      state: getState(),
      environment: getEnvironment()
    };

  }

  global.RCF_CONTEXT = {

    __v1: true,

    version: VERSION,

    getContext: buildContext,

    summary: function () {

      const ctx = buildContext();

      return {
        modules: ctx.modules,
        env: ctx.environment,
        ts: ctx.environment.ts
      };

    }

  };

  try {
    console.log("[RCF] context_engine ready", VERSION);
  } catch {}

})(window);

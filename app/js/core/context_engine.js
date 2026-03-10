/* FILE: /app/js/core/context_engine.js
   RControl Factory — Context Engine
   v1.1 SAFE / PATCH MÍNIMO

   Objetivo:
   - consolidar contexto estrutural da Factory
   - servir a Admin AI com contexto melhor
   - não mexer em boot, MAE, Injector SAFE, Vault ou Bridge
   - funcionar como script clássico
*/

(function (global) {
  "use strict";

  if (global.RCF_CONTEXT && global.RCF_CONTEXT.__v11) return;

  var VERSION = "v1.1";

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

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function getFactoryState() {
    return safe(function () {
      if (!global.RCF_FACTORY_STATE || typeof global.RCF_FACTORY_STATE.getState !== "function") {
        return {};
      }
      return global.RCF_FACTORY_STATE.getState() || {};
    }, {});
  }

  function getModuleSummary() {
    return safe(function () {
      if (!global.RCF_MODULE_REGISTRY) return {};
      if (typeof global.RCF_MODULE_REGISTRY.summary === "function") {
        return global.RCF_MODULE_REGISTRY.summary() || {};
      }
      if (typeof global.RCF_MODULE_REGISTRY.getModules === "function") {
        return global.RCF_MODULE_REGISTRY.getModules() || {};
      }
      return {};
    }, {});
  }

  function getDoctorInfo() {
    var info = {
      ready: !!global.RCF_DOCTOR_SCAN,
      version: safe(function () { return global.RCF_DOCTOR_SCAN.version; }, "unknown"),
      lastRun: safe(function () { return global.RCF_DOCTOR_SCAN.lastReport; }, null)
    };

    return info;
  }

  function getFlags() {
    return {
      hasLogger: !!global.RCF_LOGGER,
      hasDoctor: !!global.RCF_DOCTOR_SCAN,
      hasGitHub: !!global.RCF_GH_SYNC,
      hasVault: !!global.RCF_ZIP_VAULT,
      hasBridge: !!global.RCF_AGENT_ZIP_BRIDGE,
      hasAdminAI: !!global.RCF_ADMIN_AI,
      hasFactoryState: !!global.RCF_FACTORY_STATE,
      hasModuleRegistry: !!global.RCF_MODULE_REGISTRY,
      hasDiagnostics: !!global.RCF_DIAGNOSTICS
    };
  }

  function getEnvironment() {
    return {
      href: safe(function () { return global.location.href; }, ""),
      userAgent: safe(function () { return global.navigator.userAgent; }, ""),
      platform: safe(function () { return global.navigator.platform; }, ""),
      language: safe(function () { return global.navigator.language; }, ""),
      ts: nowISO()
    };
  }

  function buildFactoryBlock() {
    var fs = getFactoryState();
    var env = getEnvironment();
    var flags = getFlags();

    return {
      version: fs.factoryVersion || safe(function () { return global.RCF_VERSION; }, null) || "unknown",
      engineVersion: fs.engineVersion || "unknown",
      bootStatus: fs.bootStatus || "unknown",
      bootTime: fs.bootTime || null,
      lastUpdate: fs.lastUpdate || null,
      runtimeVFS: fs.runtimeVFS || safe(function () { return global.__RCF_VFS_RUNTIME; }, null) || safe(function () { return global.RCF_RUNTIME; }, null) || "unknown",
      environment: fs.environment || "unknown",
      userAgent: fs.userAgent || env.userAgent || "",
      loggerReady: !!fs.loggerReady,
      doctorReady: !!fs.doctorReady,
      ts: env.ts,
      flags: flags
    };
  }

  function buildContext() {
    var factory = buildFactoryBlock();
    var doctor = getDoctorInfo();
    var modules = getModuleSummary();
    var environment = getEnvironment();

    return {
      version: VERSION,
      factory: factory,
      doctor: {
        ready: doctor.ready,
        version: doctor.version || "unknown",
        lastRun: doctor.lastRun || null
      },
      modules: clone(modules),
      environment: environment
    };
  }

  function summary() {
    var ctx = buildContext();

    return {
      version: VERSION,
      factoryVersion: ctx.factory.version,
      bootStatus: ctx.factory.bootStatus,
      runtimeVFS: ctx.factory.runtimeVFS,
      doctorVersion: ctx.doctor.version,
      doctorLast: ctx.doctor.lastRun,
      flags: ctx.factory.flags,
      ts: ctx.environment.ts
    };
  }

  global.RCF_CONTEXT = {
    __v1: true,
    __v11: true,
    version: VERSION,
    getContext: buildContext,
    summary: summary
  };

  try {
    console.log("[RCF] context_engine ready", VERSION);
  } catch (_) {}

})(window);

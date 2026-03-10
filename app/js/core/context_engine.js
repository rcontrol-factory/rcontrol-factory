/* FILE: /app/js/core/context_engine.js
   RControl Factory — Context Engine
   v1.3 SAFE / PATCH MÍNIMO

   Objetivo:
   - consolidar contexto estrutural da Factory
   - entregar snapshot mais explícito para Admin AI
   - integrar melhor factory_state + module_registry + factory_tree + doctor
   - funcionar como script clássico
*/

(function (global) {
  "use strict";

  if (global.RCF_CONTEXT && global.RCF_CONTEXT.__v13) return;

  var VERSION = "v1.3";

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
    var lastFromState = safe(function () {
      return global.RCF_FACTORY_STATE.getState().doctorLastRun;
    }, null);

    var lastFromDoctor = safe(function () {
      return global.RCF_DOCTOR_SCAN.lastReport;
    }, null);

    return {
      ready: !!global.RCF_DOCTOR_SCAN,
      version: safe(function () { return global.RCF_DOCTOR_SCAN.version; }, "unknown"),
      lastRun: lastFromState || lastFromDoctor || null
    };
  }

  function getTreeInfo() {
    return safe(function () {
      if (!global.RCF_FACTORY_TREE) return {};
      return {
        summary: typeof global.RCF_FACTORY_TREE.summary === "function"
          ? global.RCF_FACTORY_TREE.summary()
          : {},
        tree: typeof global.RCF_FACTORY_TREE.getTree === "function"
          ? global.RCF_FACTORY_TREE.getTree()
          : {},
        allPaths: typeof global.RCF_FACTORY_TREE.getAllPaths === "function"
          ? global.RCF_FACTORY_TREE.getAllPaths()
          : []
      };
    }, {});
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
      hasContextEngine: true,
      hasFactoryTree: !!global.RCF_FACTORY_TREE,
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
      modules: clone(fs.modules || {}),
      ts: env.ts,
      flags: flags
    };
  }

  function buildSnapshot() {
    var factory = buildFactoryBlock();
    var doctor = getDoctorInfo();
    var modules = getModuleSummary();
    var environment = getEnvironment();
    var tree = getTreeInfo();

    return {
      version: VERSION,
      factory: factory,
      doctor: {
        ready: doctor.ready,
        version: doctor.version || "unknown",
        lastRun: doctor.lastRun || null
      },
      modules: clone(modules),
      tree: {
        summary: clone(tree.summary || {}),
        pathsCount: Array.isArray(tree.allPaths) ? tree.allPaths.length : 0,
        samples: Array.isArray(tree.allPaths) ? tree.allPaths.slice(0, 20) : [],
        grouped: clone(tree.tree || {})
      },
      environment: environment
    };
  }

  function summary() {
    var ctx = buildSnapshot();

    return {
      version: VERSION,
      factoryVersion: ctx.factory.version,
      bootStatus: ctx.factory.bootStatus,
      runtimeVFS: ctx.factory.runtimeVFS,
      doctorVersion: ctx.doctor.version,
      doctorLast: ctx.doctor.lastRun,
      activeModules: clone(ctx.modules.active || []),
      treeCount: ctx.tree.pathsCount || 0,
      flags: ctx.factory.flags,
      ts: ctx.environment.ts
    };
  }

  global.RCF_CONTEXT = {
    __v1: true,
    __v11: true,
    __v12: true,
    __v13: true,
    version: VERSION,
    getContext: buildSnapshot,
    getSnapshot: buildSnapshot,
    summary: summary
  };

  try {
    console.log("[RCF] context_engine ready", VERSION);
  } catch (_) {}

})(window);

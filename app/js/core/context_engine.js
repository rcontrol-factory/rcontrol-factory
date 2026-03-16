/* FILE: /app/js/core/context_engine.js
   RControl Factory — Context Engine
   v1.5 SNAPSHOT EXPANDED / PATCH MÍNIMO

   Objetivo:
   - consolidar snapshot estrutural mais confiável
   - integrar melhor factory_state + module_registry + doctor + factory_tree
   - expor contexto mais útil para Factory AI decidir próximo arquivo
   - incluir bloco de injector/admin sem criar dependência rígida
   - reduzir respostas genéricas da Admin AI / Factory AI
   - funcionar como script clássico
*/

(function (global) {
  "use strict";

  if (global.RCF_CONTEXT && global.RCF_CONTEXT.__v15) return;

  var VERSION = "v1.5";

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

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniq(arr) {
    var out = [];
    var seen = {};
    asArray(arr).forEach(function (item) {
      var key = String(item || "");
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function pickTruthy(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      if (obj[k]) out[k] = obj[k];
    });
    return out;
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
      hasFactoryAI: !!global.RCF_FACTORY_AI,
      hasFactoryState: !!global.RCF_FACTORY_STATE,
      hasModuleRegistry: !!global.RCF_MODULE_REGISTRY,
      hasContextEngine: true,
      hasFactoryTree: !!global.RCF_FACTORY_TREE,
      hasDiagnostics: !!global.RCF_DIAGNOSTICS,
      hasInjectorSafe: !!global.RCF_INJECTOR_SAFE || !!global.RCF_INJECTOR || !!global.RCF_INJECTOR_SAFE_UI,
      hasPreviewRunner: !!global.RCF_PREVIEW_RUNNER,
      hasBuilder: !!global.RCF_BUILDER
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

  function getLoggerInfo() {
    var items = safe(function () {
      return asArray(global.RCF_LOGGER.items);
    }, []);

    return {
      ready: !!global.RCF_LOGGER,
      itemsCount: items.length,
      tail: items.slice(-20)
    };
  }

  function getGitHubInfo() {
    return {
      ready: !!global.RCF_GH_SYNC,
      version: safe(function () { return global.RCF_GH_SYNC.version; }, "unknown"),
      repo: safe(function () { return global.RCF_GH_SYNC.repo; }, ""),
      branch: safe(function () { return global.RCF_GH_SYNC.branch; }, ""),
      cfg: clone(safe(function () { return global.localStorage.getItem("rcf:ghcfg"); }, null) || null)
    };
  }

  function getAdminInfo() {
    return {
      ready: !!global.RCF_ADMIN_AI,
      version: safe(function () { return global.RCF_ADMIN_AI.version; }, "unknown"),
      mounted: !!safe(function () { return global.RCF_ADMIN_AI.mount; }, false)
    };
  }

  function getFactoryAIInfo() {
    return {
      ready: !!global.RCF_FACTORY_AI,
      version: safe(function () { return global.RCF_FACTORY_AI.version; }, "unknown"),
      mounted: !!safe(function () { return global.RCF_FACTORY_AI.mount; }, false),
      lastEndpoint: safe(function () { return global.RCF_FACTORY_AI.getLastEndpoint(); }, ""),
      historyCount: safe(function () {
        if (!global.RCF_FACTORY_AI || typeof global.RCF_FACTORY_AI.getHistory !== "function") return 0;
        return asArray(global.RCF_FACTORY_AI.getHistory()).length;
      }, 0)
    };
  }

  function getInjectorInfo() {
    var injector =
      global.RCF_INJECTOR_SAFE ||
      global.RCF_INJECTOR ||
      global.RCF_INJECTOR_SAFE_UI ||
      null;

    var logItems = safe(function () {
      if (!injector) return [];
      if (Array.isArray(injector.log)) return injector.log.slice(-30);
      if (Array.isArray(injector.logs)) return injector.logs.slice(-30);
      if (typeof injector.getLog === "function") return asArray(injector.getLog()).slice(-30);
      return [];
    }, []);

    var targetMap = safe(function () {
      if (!injector) return {};
      if (typeof injector.getTargetMap === "function") return injector.getTargetMap() || {};
      return injector.targetMap || {};
    }, {});

    var scan = safe(function () {
      if (!injector) return {};
      if (typeof injector.getScanSummary === "function") return injector.getScanSummary() || {};
      return injector.scanSummary || {};
    }, {});

    var preview = safe(function () {
      if (!injector) return {};
      if (typeof injector.getPreview === "function") return injector.getPreview() || {};
      return injector.preview || {};
    }, {});

    var hostSlot = safe(function () {
      return injector.hostSlot || injector.slot || "";
    }, "");

    return {
      ready: !!injector,
      version: safe(function () { return injector.version; }, "unknown"),
      hostSlot: hostSlot || "unknown",
      targetMapKeys: Object.keys(targetMap || {}),
      targetMapCount: Object.keys(targetMap || {}).length,
      scanSummary: clone(scan || {}),
      preview: clone(preview || {}),
      logTail: clone(logItems || [])
    };
  }

  function groupPaths(allPaths) {
    var grouped = {
      app: [],
      js: [],
      core: [],
      ui: [],
      assets: [],
      functions: [],
      other: []
    };

    asArray(allPaths).forEach(function (p) {
      var path = String(p || "");
      if (!path) return;

      if (path.indexOf("/functions/") === 0 || path.indexOf("functions/") === 0) {
        grouped.functions.push(path);
      } else if (path.indexOf("/app/js/core/") === 0 || path.indexOf("app/js/core/") === 0) {
        grouped.core.push(path);
        grouped.js.push(path);
        grouped.app.push(path);
      } else if (path.indexOf("/app/js/ui/") === 0 || path.indexOf("app/js/ui/") === 0) {
        grouped.ui.push(path);
        grouped.js.push(path);
        grouped.app.push(path);
      } else if (path.indexOf("/app/js/") === 0 || path.indexOf("app/js/") === 0) {
        grouped.js.push(path);
        grouped.app.push(path);
      } else if (path.indexOf("/app/assets/") === 0 || path.indexOf("app/assets/") === 0) {
        grouped.assets.push(path);
        grouped.app.push(path);
      } else if (path.indexOf("/app/") === 0 || path.indexOf("app/") === 0) {
        grouped.app.push(path);
      } else {
        grouped.other.push(path);
      }
    });

    Object.keys(grouped).forEach(function (k) {
      grouped[k] = grouped[k].slice(0, 40);
    });

    return grouped;
  }

  function buildCandidateFiles(snapshot) {
    var out = [];
    var push = function (v) {
      if (!v) return;
      out.push(String(v));
    };

    var active = asArray(snapshot && snapshot.modules && snapshot.modules.active);

    push("/app/app.js");
    push("/app/index.html");
    push("/app/js/core/context_engine.js");
    push("/app/js/core/ui_runtime.js");
    push("/app/js/core/ui_shell.js");
    push("/app/js/ui/ui_bootstrap.js");
    push("/app/js/ui/ui_views.js");
    push("/app/js/admin.admin_ai.js");
    push("/functions/api/admin-ai.js");

    if (active.indexOf("factory_state") >= 0 || active.indexOf("factoryState") >= 0) {
      push("/app/js/core/factory_state.js");
    }
    if (active.indexOf("module_registry") >= 0 || active.indexOf("moduleRegistry") >= 0) {
      push("/app/js/core/module_registry.js");
    }
    if (active.indexOf("factory_tree") >= 0 || active.indexOf("factoryTree") >= 0) {
      push("/app/js/core/factory_tree.js");
    }
    if (active.indexOf("github") >= 0) {
      push("/app/js/core/github_sync.js");
      push("/app/js/admin.github.js");
    }
    if (active.indexOf("doctor") >= 0) {
      push("/app/js/core/diagnostics.js");
    }

    var grouped = safe(function () {
      return snapshot.tree.pathGroups;
    }, {}) || {};

    asArray(grouped.core).slice(0, 12).forEach(push);
    asArray(grouped.ui).slice(0, 10).forEach(push);
    asArray(grouped.functions).slice(0, 6).forEach(push);

    return uniq(out).slice(0, 40);
  }

  function buildFactoryBlock() {
    var fs = getFactoryState();
    var env = getEnvironment();
    var flags = getFlags();
    var mods = getModuleSummary();

    var activeModules = asArray(mods.active);
    var bootStatus = fs.bootStatus || "unknown";

    if (bootStatus === "booting" && activeModules.length > 0) {
      bootStatus = "ready";
    }

    return {
      version: fs.factoryVersion || safe(function () { return global.RCF_VERSION; }, null) || "1.0.0",
      engineVersion: fs.engineVersion || safe(function () { return global.RCF_ENGINE_VERSION; }, null) || "unknown",
      bootStatus: bootStatus,
      bootTime: fs.bootTime || null,
      lastUpdate: fs.lastUpdate || null,
      runtimeVFS:
        fs.runtimeVFS ||
        safe(function () { return global.__RCF_VFS_RUNTIME; }, null) ||
        safe(function () { return global.RCF_RUNTIME; }, null) ||
        "browser",
      environment: fs.environment || "Browser",
      userAgent: fs.userAgent || env.userAgent || "",
      loggerReady: !!fs.loggerReady || !!mods.logger,
      doctorReady: !!fs.doctorReady || !!mods.doctor,
      modules: clone(fs.modules || {}),
      activeView: safe(function () { return fs.active.view; }, "") || "",
      activeAppSlug: safe(function () { return fs.active.appSlug; }, "") || "",
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
    var logger = getLoggerInfo();
    var github = getGitHubInfo();
    var admin = getAdminInfo();
    var factoryAI = getFactoryAIInfo();
    var injector = getInjectorInfo();

    var snapshot = {
      version: VERSION,
      factory: factory,
      doctor: {
        ready: doctor.ready,
        version: doctor.version || "unknown",
        lastRun: doctor.lastRun || null
      },
      modules: {
        version: modules.version || "unknown",
        total: Number(modules.total || 0),
        active: Array.isArray(modules.active) ? clone(modules.active) : [],
        logger: !!modules.logger,
        doctor: !!modules.doctor,
        github: !!modules.github,
        vault: !!modules.vault,
        bridge: !!modules.bridge,
        adminAI: !!modules.adminAI,
        factoryAI: !!global.RCF_FACTORY_AI,
        factoryState: !!modules.factoryState,
        moduleRegistry: !!modules.moduleRegistry,
        contextEngine: true,
        factoryTree: !!modules.factoryTree,
        diagnostics: !!modules.diagnostics,
        modules: clone(modules.modules || {})
      },
      tree: {
        summary: clone(tree.summary || {}),
        pathsCount: Array.isArray(tree.allPaths) ? tree.allPaths.length : 0,
        samples: Array.isArray(tree.allPaths) ? tree.allPaths.slice(0, 30) : [],
        pathGroups: groupPaths(asArray(tree.allPaths)),
        grouped: clone(tree.tree || {})
      },
      logger: logger,
      github: github,
      admin: admin,
      factoryAI: factoryAI,
      injector: injector,
      environment: environment
    };

    snapshot.candidateFiles = buildCandidateFiles(snapshot);

    return snapshot;
  }

  function getSnapshot() {
    return buildSnapshot();
  }

  function getContext() {
    return buildSnapshot();
  }

  function summary() {
    var ctx = buildSnapshot();

    return {
      version: VERSION,
      factoryVersion: ctx.factory.version,
      engineVersion: ctx.factory.engineVersion,
      bootStatus: ctx.factory.bootStatus,
      runtimeVFS: ctx.factory.runtimeVFS,
      doctorVersion: ctx.doctor.version,
      doctorLast: ctx.doctor.lastRun,
      activeModules: clone(ctx.modules.active || []),
      treeCount: ctx.tree.pathsCount || 0,
      candidateFiles: clone(ctx.candidateFiles || []).slice(0, 12),
      injectorReady: !!safe(function () { return ctx.injector.ready; }, false),
      injectorTargetMapCount: Number(safe(function () { return ctx.injector.targetMapCount; }, 0) || 0),
      loggerReady: !!safe(function () { return ctx.logger.ready; }, false),
      githubReady: !!safe(function () { return ctx.github.ready; }, false),
      flags: ctx.factory.flags,
      ts: ctx.environment.ts
    };
  }

  global.RCF_CONTEXT = {
    __v1: true,
    __v11: true,
    __v12: true,
    __v13: true,
    __v14: true,
    __v15: true,
    version: VERSION,
    getContext: getContext,
    getSnapshot: getSnapshot,
    summary: summary
  };

  try {
    console.log("[RCF] context_engine ready", VERSION);
  } catch (_) {}

})(window);

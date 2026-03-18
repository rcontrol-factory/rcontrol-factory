/* FILE: /app/js/core/factory_tree.js
   RControl Factory — Factory Tree Engine
   v1.3.1 STABLE / REBUILD MINIMAL

   Objetivo:
   - registrar estrutura visível da Factory
   - mapear scripts, styles, assets e arquivos conhecidos
   - separar por grupos lógicos coerentes
   - ajudar Context Engine / Factory AI / Patch Supervisor
   - manter snapshot mais útil no Safari / PWA
   - sincronizar presença com factory_state / module_registry sem dependência rígida
   - funcionar como script clássico

   PATCH v1.3.1:
   - FIX: detectFromContext agora lê tree.samples por bucket corretamente
   - FIX: detectFromContext também lê grouped/pathGroups com fallback seguro
   - ADD: amplia arquivos conhecidos da fase atual da Factory AI
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_TREE && global.RCF_FACTORY_TREE.__v131) return;

  var VERSION = "v1.3.1";

  var BUCKETS = [
    "core",
    "ui",
    "admin",
    "engine",
    "modules",
    "functions",
    "assets",
    "root",
    "other"
  ];

  var tree = emptyTree();
  var meta = {
    version: VERSION,
    bootedAt: nowISO(),
    lastRefresh: null,
    lastChange: null
  };

  function emptyTree() {
    return {
      core: [],
      ui: [],
      admin: [],
      engine: [],
      modules: [],
      functions: [],
      assets: [],
      root: [],
      other: []
    };
  }

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

  function normalizePath(src) {
    try {
      if (!src) return "";

      var s = String(src).trim();
      if (!s) return "";

      if (s.indexOf("blob:") === 0) return "";
      if (s.indexOf("data:") === 0) return "";
      if (s.indexOf("javascript:") === 0) return "";

      if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0) {
        try {
          var u = new URL(s);
          s = u.pathname || s;
        } catch (_) {}
      }

      s = s.replace(/\\/g, "/");

      if (s.indexOf("?") >= 0) s = s.split("?")[0];
      if (s.indexOf("#") >= 0) s = s.split("#")[0];

      s = s.replace(/^\.\/+/, "/");
      s = s.replace(/^\/+/, "/");
      s = s.replace(/\/{2,}/g, "/");

      if (!s) return "";
      if (s.charAt(0) !== "/") s = "/" + s;

      // normalização de paths runtime -> repo/app
      if (s === "/index.html") return "/app/index.html";
      if (s === "/app.js") return "/app/app.js";
      if (s === "/styles.css") return "/app/styles.css";
      if (s.indexOf("/js/") === 0) return "/app" + s;
      if (s.indexOf("/assets/") === 0) return "/app" + s;

      return s;
    } catch (_) {
      return "";
    }
  }

  function classify(path) {
    if (!path) return "other";

    if (path.indexOf("/functions/") === 0) return "functions";
    if (path.indexOf("/app/js/core/") === 0) return "core";
    if (path.indexOf("/app/js/ui/") === 0) return "ui";

    if (
      path.indexOf("/app/js/admin/") === 0 ||
      path.indexOf("/app/js/admin.") === 0
    ) {
      return "admin";
    }

    if (path.indexOf("/app/js/engine/") === 0) return "engine";
    if (path.indexOf("/app/js/modules/") === 0) return "modules";
    if (path.indexOf("/app/assets/") === 0) return "assets";

    if (
      path === "/app/index.html" ||
      path === "/app/app.js" ||
      path === "/app/styles.css" ||
      path === "/manifest.json" ||
      path === "/sw.js" ||
      path.indexOf("/service-worker") >= 0
    ) {
      return "root";
    }

    if (path.indexOf("/app/") === 0) return "other";

    return "other";
  }

  function hasPath(list, path) {
    return Array.isArray(list) && list.indexOf(path) >= 0;
  }

  function pushUnique(bucket, path) {
    if (!bucket || !path) return false;
    if (!Array.isArray(tree[bucket])) return false;
    if (hasPath(tree[bucket], path)) return false;
    tree[bucket].push(path);
    meta.lastChange = nowISO();
    return true;
  }

  function register(path) {
    var p = normalizePath(path);
    if (!p) return false;
    return pushUnique(classify(p), p);
  }

  function registerMany(list) {
    var changed = false;
    asArray(list).forEach(function (item) {
      if (register(item)) changed = true;
    });
    return changed;
  }

  function sortBuckets() {
    BUCKETS.forEach(function (bucket) {
      if (!Array.isArray(tree[bucket])) tree[bucket] = [];
      tree[bucket] = uniq(tree[bucket]).sort();
    });
  }

  function getTree() {
    return clone(tree);
  }

  function getAllPaths() {
    var out = [];
    BUCKETS.forEach(function (bucket) {
      asArray(tree[bucket]).forEach(function (p) {
        if (out.indexOf(p) < 0) out.push(p);
      });
    });
    return out;
  }

  function getKnownPaths() {
    return getAllPaths();
  }

  function counts() {
    return {
      core: asArray(tree.core).length,
      ui: asArray(tree.ui).length,
      admin: asArray(tree.admin).length,
      engine: asArray(tree.engine).length,
      modules: asArray(tree.modules).length,
      functions: asArray(tree.functions).length,
      assets: asArray(tree.assets).length,
      root: asArray(tree.root).length,
      other: asArray(tree.other).length,
      total: getAllPaths().length
    };
  }

  function summary() {
    return {
      version: VERSION,
      counts: counts(),
      samples: {
        core: tree.core.slice(0, 10),
        ui: tree.ui.slice(0, 10),
        admin: tree.admin.slice(0, 10),
        engine: tree.engine.slice(0, 10),
        modules: tree.modules.slice(0, 10),
        functions: tree.functions.slice(0, 10),
        assets: tree.assets.slice(0, 10),
        root: tree.root.slice(0, 10),
        other: tree.other.slice(0, 10)
      },
      lastRefresh: meta.lastRefresh,
      lastChange: meta.lastChange,
      bootedAt: meta.bootedAt,
      ts: nowISO()
    };
  }

  function detectLoadedScripts() {
    try {
      var scripts = document.querySelectorAll("script[src]");
      scripts.forEach(function (s) {
        register(s.getAttribute("src") || "");
      });
    } catch (_) {}
  }

  function detectLoadedStyles() {
    try {
      var links = document.querySelectorAll('link[href]');
      links.forEach(function (l) {
        var href = l.getAttribute("href") || "";
        if (!href) return;
        if (href.indexOf(".css") >= 0 || href.indexOf("/assets/") >= 0) {
          register(href);
        }
      });
    } catch (_) {}
  }

  function detectAssets() {
    try {
      var imgs = document.querySelectorAll("img[src], source[src], video[src], audio[src]");
      imgs.forEach(function (el) {
        register(el.getAttribute("src") || "");
      });
    } catch (_) {}
  }

  function detectRootFiles() {
    registerMany([
      "/app/index.html",
      "/app/app.js",
      "/app/styles.css",
      "/manifest.json",
      "/sw.js"
    ]);
  }

  function detectKnownFactoryFiles() {
    registerMany([
      "/app/js/core/context_engine.js",
      "/app/js/core/factory_state.js",
      "/app/js/core/module_registry.js",
      "/app/js/core/factory_tree.js",
      "/app/js/core/doctor_scan.js",
      "/app/js/core/github_sync.js",
      "/app/js/core/diagnostics.js",
      "/app/js/core/factory_ai_bridge.js",
      "/app/js/core/factory_ai_actions.js",
      "/app/js/core/factory_ai_orchestrator.js",
      "/app/js/core/factory_ai_controller.js",
      "/app/js/core/factory_ai_memory.js",
      "/app/js/core/factory_ai_policy.js",
      "/app/js/core/factory_ai_architect.js",
      "/app/js/core/factory_ai_autoloop.js",
      "/app/js/core/factory_ai_self_evolution.js",
      "/app/js/core/factory_ai_execution_gate.js",
      "/app/js/core/factory_ai_proposal_ui.js",
      "/app/js/core/factory_ai_focus_engine.js",
      "/app/js/core/factory_ai_governor.js",
      "/app/js/core/factory_phase_engine.js",
      "/app/js/core/patch_supervisor.js",
      "/app/js/admin.admin_ai.js",
      "/functions/api/admin-ai.js"
    ]);
  }

  function detectFromFactoryState() {
    try {
      if (!global.RCF_FACTORY_STATE?.getState) return;
      var st = global.RCF_FACTORY_STATE.getState() || {};

      registerMany(asArray(st.loadedFiles));
      registerMany(asArray(st.paths));
      registerMany(asArray(st.runtimePaths));
    } catch (_) {}
  }

  function detectFromModuleRegistry() {
    try {
      if (!global.RCF_MODULE_REGISTRY?.summary) return;
      var sm = global.RCF_MODULE_REGISTRY.summary() || {};
      var mods = sm.modules || {};

      if (mods.contextEngine) register("/app/js/core/context_engine.js");
      if (mods.factoryState) register("/app/js/core/factory_state.js");
      if (mods.moduleRegistry) register("/app/js/core/module_registry.js");
      if (mods.factoryTree) register("/app/js/core/factory_tree.js");
      if (mods.factoryAI) register("/app/js/admin.admin_ai.js");
      if (mods.github) register("/app/js/core/github_sync.js");
      if (mods.doctor) register("/app/js/core/doctor_scan.js");
      if (mods.factoryAIBridge) register("/app/js/core/factory_ai_bridge.js");
      if (mods.factoryAIActions) register("/app/js/core/factory_ai_actions.js");
      if (mods.factoryAIPlanner) register("/app/js/core/factory_ai_planner.js");
      if (mods.patchSupervisor) register("/app/js/core/patch_supervisor.js");
    } catch (_) {}
  }

  function detectFromContext() {
    try {
      if (!global.RCF_CONTEXT) return;

      var snap = null;
      if (typeof global.RCF_CONTEXT.getSnapshot === "function") {
        snap = global.RCF_CONTEXT.getSnapshot();
      } else if (typeof global.RCF_CONTEXT.getContext === "function") {
        snap = global.RCF_CONTEXT.getContext();
      }

      if (!snap || typeof snap !== "object") return;

      var treeBlock = snap.tree || {};
      var samples = treeBlock.samples || {};
      var grouped = treeBlock.grouped || {};
      var pathGroups = treeBlock.pathGroups || {};
      var candidateFiles = asArray(snap.candidateFiles);

      Object.keys(samples).forEach(function (k) {
        registerMany(asArray(samples[k]));
      });

      Object.keys(grouped).forEach(function (k) {
        registerMany(asArray(grouped[k]));
      });

      Object.keys(pathGroups).forEach(function (k) {
        registerMany(asArray(pathGroups[k]));
      });

      registerMany(candidateFiles);
    } catch (_) {}
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryTree");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryTree", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryTree");
      }
    } catch (_) {}
  }

  function refresh() {
    detectRootFiles();
    detectKnownFactoryFiles();
    detectLoadedScripts();
    detectLoadedStyles();
    detectAssets();
    detectFromFactoryState();
    detectFromModuleRegistry();
    detectFromContext();

    sortBuckets();
    meta.lastRefresh = nowISO();
    syncPresence();

    return summary();
  }

  function init() {
    refresh();
    return summary();
  }

  global.RCF_FACTORY_TREE = {
    __v1: true,
    __v11: true,
    __v12: true,
    __v13: true,
    __v131: true,
    version: VERSION,
    register: register,
    registerMany: registerMany,
    getTree: getTree,
    getAllPaths: getAllPaths,
    getKnownPaths: getKnownPaths,
    counts: counts,
    summary: summary,
    refresh: refresh,
    init: init
  };

  try {
    init();
    console.log("[RCF] factory_tree ready", VERSION);
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

})(window);

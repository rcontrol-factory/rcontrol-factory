/* FILE: /app/js/core/factory_tree.js
   RControl Factory — Factory Tree Engine
   v1.2 SAFE / PATCH MÍNIMO

   Objetivo:
   - registrar estrutura visível da Factory
   - mapear scripts carregados
   - separar por grupos lógicos
   - ajudar Admin AI / Factory AI a enxergar arquivos reais
   - ampliar detecção sem depender de backend
   - funcionar como script clássico
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_TREE && global.RCF_FACTORY_TREE.__v12) return;

  var VERSION = "v1.2";

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

  var tree = {
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

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
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
      s = s.replace(/^\.\/+/, "/");
      s = s.replace(/^\.\.\//, "/");
      s = s.replace(/\/{2,}/g, "/");

      if (s.indexOf("?") >= 0) s = s.split("?")[0];
      if (s.indexOf("#") >= 0) s = s.split("#")[0];

      if (!s) return "";
      if (s.charAt(0) !== "/") s = "/" + s;

      return s;
    } catch (_) {
      return "";
    }
  }

  function hasPath(list, path) {
    return Array.isArray(list) && list.indexOf(path) >= 0;
  }

  function pushUnique(bucket, path) {
    if (!path) return false;
    if (!Array.isArray(tree[bucket])) return false;
    if (hasPath(tree[bucket], path)) return false;
    tree[bucket].push(path);
    return true;
  }

  function classify(path) {
    if (!path) return "other";

    if (path.indexOf("/functions/") === 0) return "functions";
    if (path.indexOf("/app/js/core/") === 0 || path.indexOf("/js/core/") >= 0) return "core";
    if (path.indexOf("/app/js/ui/") === 0 || path.indexOf("/js/ui/") >= 0) return "ui";
    if (path.indexOf("/app/js/admin") === 0 || path.indexOf("/js/admin") >= 0) return "admin";
    if (path.indexOf("/app/js/engine/") === 0 || path.indexOf("/js/engine/") >= 0) return "engine";
    if (path.indexOf("/app/js/modules/") === 0 || path.indexOf("/js/modules/") >= 0) return "modules";
    if (path.indexOf("/app/assets/") === 0 || path.indexOf("/assets/") >= 0) return "assets";

    if (
      path === "/index.html" ||
      path === "/app.js" ||
      path.indexOf("/manifest.json") >= 0 ||
      path.indexOf("/styles.css") >= 0 ||
      path.indexOf("/sw.js") >= 0 ||
      path.indexOf("/service-worker") >= 0
    ) {
      return "root";
    }

    if (path.indexOf("/app/") === 0) return "other";

    return "other";
  }

  function register(path) {
    var p = normalizePath(path);
    if (!p) return false;
    return pushUnique(classify(p), p);
  }

  function registerMany(list) {
    if (!Array.isArray(list)) return;
    list.forEach(function (item) {
      register(item);
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

  function summary() {
    return {
      version: VERSION,
      counts: {
        core: tree.core.length,
        ui: tree.ui.length,
        admin: tree.admin.length,
        engine: tree.engine.length,
        modules: tree.modules.length,
        functions: tree.functions.length,
        assets: tree.assets.length,
        root: tree.root.length,
        other: tree.other.length,
        total: getAllPaths().length
      },
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
      ts: new Date().toISOString()
    };
  }

  function detectLoadedScripts() {
    try {
      var scripts = document.querySelectorAll("script[src]");
      scripts.forEach(function (s) {
        var src = s.getAttribute("src") || "";
        if (!src) return;
        register(src);
      });
    } catch (_) {}
  }

  function detectLoadedStyles() {
    try {
      var links = document.querySelectorAll('link[rel="stylesheet"][href], link[href*=".css"]');
      links.forEach(function (l) {
        var href = l.getAttribute("href") || "";
        if (!href) return;
        register(href);
      });
    } catch (_) {}
  }

  function detectAssets() {
    try {
      var imgs = document.querySelectorAll("img[src]");
      imgs.forEach(function (img) {
        var src = img.getAttribute("src") || "";
        if (!src) return;
        register(src);
      });
    } catch (_) {}
  }

  function detectRootFiles() {
    try { register("/index.html"); } catch (_) {}
    try { register("/app.js"); } catch (_) {}
    try { register("/styles.css"); } catch (_) {}
    try { register("/manifest.json"); } catch (_) {}
    try { register("/sw.js"); } catch (_) {}
  }

  function detectFromContext() {
    try {
      if (!global.RCF_CONTEXT || typeof global.RCF_CONTEXT.getSnapshot !== "function") return;
      var snap = global.RCF_CONTEXT.getSnapshot();
      var paths = (((snap || {}).tree || {}).samples || []);
      registerMany(paths);
    } catch (_) {}
  }

  function detectFromState() {
    try {
      if (!global.RCF_FACTORY_STATE || typeof global.RCF_FACTORY_STATE.getState !== "function") return;
      var st = global.RCF_FACTORY_STATE.getState() || {};

      registerMany(asArray(st.loadedFiles));
      registerMany(asArray(st.paths));
      registerMany(asArray(st.runtimePaths));
    } catch (_) {}
  }

  function detectKnownFactoryFiles() {
    registerMany([
      "/app/index.html",
      "/app/app.js",
      "/app/js/core/context_engine.js",
      "/app/js/core/factory_tree.js",
      "/app/js/admin.admin_ai.js",
      "/functions/api/admin-ai.js"
    ]);
  }

  function refresh() {
    detectRootFiles();
    detectKnownFactoryFiles();
    detectLoadedScripts();
    detectLoadedStyles();
    detectAssets();
    detectFromState();
    detectFromContext();
    return summary();
  }

  function init() {
    refresh();
  }

  global.RCF_FACTORY_TREE = {
    __v1: true,
    __v11: true,
    __v12: true,
    version: VERSION,
    register: register,
    registerMany: registerMany,
    getTree: getTree,
    getAllPaths: getAllPaths,
    getKnownPaths: getKnownPaths,
    summary: summary,
    refresh: refresh,
    init: init
  };

  try {
    init();
    console.log("[RCF] factory_tree ready", VERSION);
  } catch (_) {}

})(window);

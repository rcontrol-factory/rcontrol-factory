/* FILE: /app/js/core/factory_tree.js
   RControl Factory — Factory Tree Engine
   v1.1 SAFE / PATCH MÍNIMO

   Objetivo:
   - registrar estrutura visível da Factory
   - mapear scripts carregados
   - separar por grupos lógicos
   - ajudar Admin AI a enxergar arquivos reais
   - funcionar como script clássico
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_TREE && global.RCF_FACTORY_TREE.__v11) return;

  var VERSION = "v1.1";

  var tree = {
    core: [],
    admin: [],
    engine: [],
    modules: [],
    root: [],
    other: []
  };

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function normalizePath(src) {
    try {
      if (!src) return "";
      var s = String(src);

      if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0) {
        try {
          var u = new URL(s);
          s = u.pathname || s;
        } catch (_) {}
      }

      s = s.replace(/^\.\/+/, "/");
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

    if (path.indexOf("/js/core/") >= 0) return "core";
    if (path.indexOf("/js/admin") >= 0) return "admin";
    if (path.indexOf("/js/engine/") >= 0) return "engine";
    if (path.indexOf("/js/modules/") >= 0) return "modules";

    if (
      path === "/app.js" ||
      path === "/index.html" ||
      path.indexOf("/manifest.json") >= 0 ||
      path.indexOf("/styles.css") >= 0
    ) {
      return "root";
    }

    return "other";
  }

  function register(path) {
    var p = normalizePath(path);
    if (!p) return false;
    return pushUnique(classify(p), p);
  }

  function registerMany(list) {
    if (!Array.isArray(list)) return;
    list.forEach(register);
  }

  function getTree() {
    return clone(tree);
  }

  function getAllPaths() {
    var out = [];
    ["core", "admin", "engine", "modules", "root", "other"].forEach(function (bucket) {
      (tree[bucket] || []).forEach(function (p) {
        if (out.indexOf(p) < 0) out.push(p);
      });
    });
    return out;
  }

  function summary() {
    return {
      version: VERSION,
      counts: {
        core: tree.core.length,
        admin: tree.admin.length,
        engine: tree.engine.length,
        modules: tree.modules.length,
        root: tree.root.length,
        other: tree.other.length,
        total: getAllPaths().length
      },
      samples: {
        core: tree.core.slice(0, 8),
        admin: tree.admin.slice(0, 8),
        engine: tree.engine.slice(0, 8),
        modules: tree.modules.slice(0, 8),
        root: tree.root.slice(0, 8),
        other: tree.other.slice(0, 8)
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

  function detectRootFiles() {
    try { register("/index.html"); } catch (_) {}
    try { register("/app.js"); } catch (_) {}
    try { register("/styles.css"); } catch (_) {}
    try { register("/manifest.json"); } catch (_) {}
  }

  function refresh() {
    detectRootFiles();
    detectLoadedScripts();
    return summary();
  }

  function init() {
    refresh();
  }

  global.RCF_FACTORY_TREE = {
    __v1: true,
    __v11: true,
    version: VERSION,
    register: register,
    registerMany: registerMany,
    getTree: getTree,
    getAllPaths: getAllPaths,
    summary: summary,
    refresh: refresh,
    init: init
  };

  try {
    init();
    console.log("[RCF] factory_tree ready", VERSION);
  } catch (_) {}

})(window);

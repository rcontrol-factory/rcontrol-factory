/* FILE: /app/js/core/factory_tree.js
   RControl Factory — Factory Tree Engine
   v1.0 SAFE

   Função:
   - registrar estrutura da Factory
   - permitir leitura da árvore de módulos
   - fornecer visão estrutural para Admin AI
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_TREE) return;

  const VERSION = "1.0";

  const tree = {
    core: [],
    admin: [],
    modules: [],
    other: []
  };

  function register(path) {
    if (!path || typeof path !== "string") return;

    if (path.includes("/core/")) {
      tree.core.push(path);
      return;
    }

    if (path.includes("/admin")) {
      tree.admin.push(path);
      return;
    }

    if (path.includes("/modules/")) {
      tree.modules.push(path);
      return;
    }

    tree.other.push(path);
  }

  function registerMany(list) {
    if (!Array.isArray(list)) return;
    list.forEach(register);
  }

  function getTree() {
    return JSON.parse(JSON.stringify(tree));
  }

  function summary() {
    return {
      core: tree.core.length,
      admin: tree.admin.length,
      modules: tree.modules.length,
      other: tree.other.length,
      version: VERSION
    };
  }

  function detectLoadedScripts() {
    try {
      const scripts = document.querySelectorAll("script[src]");
      scripts.forEach(s => {
        const src = s.getAttribute("src") || "";
        if (src.includes("/app/")) register(src);
      });
    } catch (_) {}
  }

  function init() {
    detectLoadedScripts();
  }

  global.RCF_FACTORY_TREE = {
    version: VERSION,
    register,
    registerMany,
    getTree,
    summary,
    init
  };

  try {
    init();
    console.log("[RCF] factory_tree ready", VERSION);
  } catch (_) {}

})(window);

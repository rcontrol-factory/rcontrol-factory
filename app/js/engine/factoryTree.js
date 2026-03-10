/* FILE: /app/js/engine/factoryTree.js
   RControl Factory — Factory Tree Engine
   v1.0

   Função:
   - mapear estrutura da Factory
   - listar paths conhecidos
   - gerar resumo da árvore
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_TREE) return;

  var VERSION = "v1.0";

  var paths = [
    "/index.html",
    "/app.js",
    "/styles.css",
    "/manifest.json",

    "/app/js/core/logger.js",
    "/app/js/core/stability_guard.js",
    "/app/js/core/factory_state.js",
    "/app/js/core/context_engine.js",
    "/app/js/core/module_registry.js",
    "/app/js/core/github_sync.js",

    "/app/js/admin.admin_ai.js",
    "/app/js/admin.github.js",

    "/app/js/engine/applyPipeline.js",
    "/app/js/engine/builder.js",
    "/app/js/engine/builderEngine.js",
    "/app/js/engine/engine.js",
    "/app/js/engine/module_registry.js",
    "/app/js/engine/organizerEngine.js",
    "/app/js/engine/patchQueue.js",
    "/app/js/engine/template_registry.js"
  ];

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function getPaths() {
    return clone(paths);
  }

  function countByFolder() {

    var result = {
      core: 0,
      admin: 0,
      engine: 0,
      root: 0
    };

    paths.forEach(function (p) {

      if (p.indexOf("/app/js/core/") === 0) {
        result.core++;

      } else if (p.indexOf("/app/js/admin") === 0) {
        result.admin++;

      } else if (p.indexOf("/app/js/engine/") === 0) {
        result.engine++;

      } else {
        result.root++;
      }

    });

    return result;
  }

  function summary() {

    var folders = countByFolder();

    return {
      version: VERSION,
      total: paths.length,
      core: folders.core,
      admin: folders.admin,
      engine: folders.engine,
      root: folders.root,
      ts: new Date().toISOString()
    };
  }

  function refresh() {
    return summary();
  }

  global.RCF_FACTORY_TREE = {
    version: VERSION,
    getPaths: getPaths,
    summary: summary,
    refresh: refresh
  };

  try {
    console.log("[RCF] factoryTree ready", VERSION);
  } catch (_) {}

})(window);

(() => {
  "use strict";

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  function ok(name, extra) {
    return { name, ok: true, extra: extra || "" };
  }
  function fail(name, error) {
    return { name, ok: false, error: String(error?.message || error) };
  }

  function TEST_RENDER() {
    try {
      const app = document.getElementById("app");
      const rcf = document.getElementById("rcfRoot");
      if (!app) return fail("TEST_RENDER", "#app não existe");
      if (!rcf) return fail("TEST_RENDER", "#rcfRoot não existe (UI não renderizou)");
      return ok("TEST_RENDER");
    } catch (e) {
      return fail("TEST_RENDER", e);
    }
  }

  function TEST_IMPORTS() {
    try {
      // não é import de ESModules, é “API global” existindo
      const need = [
        "RCF_LOGGER",
        "RCF_ERROR_GUARD",
        "RCF_CLICK_GUARD",
        "RCF_OVERLAY_SCANNER"
      ];
      const missing = need.filter(k => !(k in window));
      if (missing.length) return fail("TEST_IMPORTS", "Faltando: " + missing.join(", "));
      return ok("TEST_IMPORTS");
    } catch (e) {
      return fail("TEST_IMPORTS", e);
    }
  }

  function TEST_STATE_INIT() {
    try {
      if (!window.RCF || !window.RCF.state) return fail("TEST_STATE_INIT", "window.RCF.state não existe");
      return ok("TEST_STATE_INIT", "apps=" + (window.RCF.state.apps?.length ?? "-"));
    } catch (e) {
      return fail("TEST_STATE_INIT", e);
    }
  }

  function TEST_EVENT_BIND() {
    try {
      // verifica botões principais existem
      const must = ["btnOpenTools", "btnCloseTools"];
      const missing = must.filter(id => !document.getElementById(id));
      if (missing.length) return fail("TEST_EVENT_BIND", "IDs faltando: " + missing.join(", "));
      return ok("TEST_EVENT_BIND");
    } catch (e) {
      return fail("TEST_EVENT_BIND", e);
    }
  }

  function runAll() {
    const results = [
      TEST_RENDER(),
      TEST_IMPORTS(),
      TEST_STATE_INIT(),
      TEST_EVENT_BIND()
    ];
    const bad = results.filter(r => !r.ok);
    if (bad.length) log("warn", "MicroTests falhou:\n" + JSON.stringify(results, null, 2));
    else log("ok", "MicroTests OK ✅");
    return results;
  }

  window.RCF_MICROTESTS = window.RCF_MICROTESTS || {
    runAll,
    TEST_RENDER,
    TEST_IMPORTS,
    TEST_STATE_INIT,
    TEST_EVENT_BIND
  };
})();

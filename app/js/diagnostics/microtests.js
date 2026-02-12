(() => {
  "use strict";

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  function ok(name, extra) {
    return { name, ok: true, level: "ok", extra: extra || "" };
  }
  function warn(name, extra) {
    return { name, ok: true, level: "warn", extra: extra || "" };
  }
  function fail(name, error) {
    return { name, ok: false, level: "fail", error: String(error?.message || error) };
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
      // Logger é obrigatório (base)
      if (!window.RCF_LOGGER) return fail("TEST_IMPORTS", "RCF_LOGGER ausente");

      // Guards podem ser carregados/instalados depois -> vira WARN, não FAIL
      const optional = [
        "RCF_ERROR_GUARD",
        "RCF_CLICK_GUARD",
        "RCF_OVERLAY_SCANNER",
        "RCF_IDB"
      ];
      const missing = optional.filter(k => !(k in window));

      if (missing.length) {
        return warn("TEST_IMPORTS", "Opcional ainda ausente (ok se ainda não instalou): " + missing.join(", "));
      }
      return ok("TEST_IMPORTS");
    } catch (e) {
      return fail("TEST_IMPORTS", e);
    }
  }

  function TEST_STATE_INIT() {
    try {
      if (!window.RCF || !window.RCF.state) return fail("TEST_STATE_INIT", "window.RCF.state não existe");
      const n = window.RCF.state.apps?.length ?? "-";
      return ok("TEST_STATE_INIT", "apps=" + n);
    } catch (e) {
      return fail("TEST_STATE_INIT", e);
    }
  }

  function TEST_EVENT_BIND() {
    try {
      const must = ["btnOpenTools", "btnCloseTools"];
      const missing = must.filter(id => !document.getElementById(id));
      if (missing.length) return fail("TEST_EVENT_BIND", "IDs faltando: " + missing.join(", "));
      return ok("TEST_EVENT_BIND");
    } catch (e) {
      return fail("TEST_EVENT_BIND", e);
    }
  }

  // Detecta overlay invisível bloqueando clique (principal causa do “botão não clica”)
  function TEST_OVERLAY_BLOCK() {
    try {
      const root = document.getElementById("rcfRoot");
      if (!root) return fail("TEST_OVERLAY_BLOCK", "#rcfRoot ausente");

      const x = Math.floor(window.innerWidth / 2);
      const y = Math.floor(window.innerHeight / 2);
      const top = document.elementFromPoint(x, y);

      if (!top) return warn("TEST_OVERLAY_BLOCK", "elementFromPoint retornou null (raro)");

      // Se o top não estiver dentro do rcfRoot, alguém tá por cima do app
      const inside = root.contains(top) || top === root;
      if (!inside) {
        const st = getComputedStyle(top);
        const desc =
          `${top.tagName.toLowerCase()}#${top.id || ""}.${String(top.className || "").split(" ").filter(Boolean).slice(0,4).join(".")} ` +
          `[pos=${st.position} z=${st.zIndex} pe=${st.pointerEvents} op=${st.opacity}]`;
        return fail("TEST_OVERLAY_BLOCK", "Elemento fora do app cobrindo viewport: " + desc);
      }

      return ok("TEST_OVERLAY_BLOCK");
    } catch (e) {
      return fail("TEST_OVERLAY_BLOCK", e);
    }
  }

  function runAll() {
    const results = [
      TEST_RENDER(),
      TEST_IMPORTS(),
      TEST_STATE_INIT(),
      TEST_EVENT_BIND(),
      TEST_OVERLAY_BLOCK()
    ];

    const fails = results.filter(r => !r.ok);
    const warns = results.filter(r => r.ok && r.level === "warn");

    if (fails.length) {
      log("warn", "MicroTests FALHOU ❌\n" + JSON.stringify(results, null, 2));
    } else if (warns.length) {
      log("warn", "MicroTests OK com avisos ⚠️\n" + JSON.stringify(results, null, 2));
    } else {
      log("ok", "MicroTests OK ✅");
    }

    return results;
  }

  window.RCF_MICROTESTS = window.RCF_MICROTESTS || {
    runAll,
    TEST_RENDER,
    TEST_IMPORTS,
    TEST_STATE_INIT,
    TEST_EVENT_BIND,
    TEST_OVERLAY_BLOCK
  };

  log("ok", "diagnostics/microtests.js loaded ✅");
})();

(() => {
  "use strict";

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  function load(src) {
    return new Promise((resolve, reject) => {
      try {
        const exists = Array.from(document.scripts).some(s => (s.getAttribute("src") || "") === src);
        if (exists) return resolve(true);

        const s = document.createElement("script");
        s.src = src;
        s.defer = true;
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error("Falhou carregar: " + src));
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function boot() {
    try {
      // Ordem: storage primeiro, depois guards, depois scanners/tests, depois index
      await load("/js/diagnostics/idb.js");
      await load("/js/diagnostics/error_guard.js");
      await load("/js/diagnostics/click_guard.js");
      await load("/js/diagnostics/overlay_scanner.js");
      await load("/js/diagnostics/microtests.js");
      await load("/js/diagnostics/runDiagnostic.module.js"); // ⚠️ ESTE NÃO PODE TER "export"
      await load("/js/diagnostics/index.js");

      try { window.RCF_DIAGNOSTICS?.installAll?.(); } catch {}

      log("ok", "core/diagnostics.js boot ok ✅");
    } catch (e) {
      log("err", "core/diagnostics.js boot FAIL: " + (e?.message || e));
    }
  }

  boot();
})();

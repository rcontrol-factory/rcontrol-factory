/* =========================================================
  RControl Factory — /app/js/core/vendor_loader.js (v1.0)
  - Carrega vendors via CDN (iOS safe)
  - Evita duplicar load
  - Hoje: JSZip (para Zip Vault)
========================================================= */
(function () {
  "use strict";

  if (window.RCF_VENDOR && window.RCF_VENDOR.__v10) return;

  const log = (level, msg) => {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF/VENDOR]", level, msg); } catch {}
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      try {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.crossOrigin = "anonymous";
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error("vendor load failed: " + src));
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function ensureJSZip() {
    // já existe
    if (window.JSZip && typeof window.JSZip.loadAsync === "function") {
      log("OK", "JSZip já presente ✅");
      return true;
    }

    // tenta CDN (jsDelivr / unpkg)
    const cdns = [
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"
    ];

    for (const url of cdns) {
      try {
        log("INFO", "Carregando JSZip: " + url);
        await loadScript(url);
        if (window.JSZip && typeof window.JSZip.loadAsync === "function") {
          log("OK", "JSZip carregado ✅");
          return true;
        }
      } catch (e) {
        log("WARN", "JSZip CDN falhou: " + (e?.message || e));
      }
    }

    log("ERR", "JSZip indisponível ❌");
    return false;
  }

  window.RCF_VENDOR = {
    __v10: true,
    ensureJSZip
  };

  log("OK", "vendor_loader.js pronto ✅ (v1.0)");
})();

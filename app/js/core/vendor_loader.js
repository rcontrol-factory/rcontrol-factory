/* FILE: /app/js/core/vendor_loader.js
   RControl Factory — VENDOR LOADER (v1.0 SAFE)
   - Garante dependências de vendor (JSZip) sem quebrar offline
   - 1) se window.JSZip já existe -> OK
   - 2) tenta carregar de /vendor/jszip.min.js (se você criar depois)
   - 3) fallback CDN (jsDelivr / unpkg)
*/
(function () {
  "use strict";

  if (window.RCF_VENDOR && window.RCF_VENDOR.__v10) return;

  const log = (lvl, msg) => { try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {} };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      try {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve(src);
        s.onerror = () => reject(new Error("load failed: " + src));
        document.head.appendChild(s);
      } catch (e) { reject(e); }
    });
  }

  async function ensureJSZip(opts = {}) {
    try {
      if (window.JSZip) {
        log("OK", "VENDOR: JSZip já presente ✅");
        return { ok: true, via: "already" };
      }

      // (A) tenta local (se você quiser colocar depois)
      const local = "./vendor/jszip.min.js";
      try {
        await loadScript(local);
        if (window.JSZip) {
          log("OK", "VENDOR: JSZip carregado local ✅ (" + local + ")");
          return { ok: true, via: "local", src: local };
        }
      } catch (e) {
        log("WARN", "VENDOR: JSZip local não encontrado (" + local + ")");
      }

      // (B) fallback CDN
      const cdns = [
        // jsDelivr
        "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
        // unpkg
        "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"
      ];

      for (const src of cdns) {
        try {
          await loadScript(src);
          if (window.JSZip) {
            log("OK", "VENDOR: JSZip carregado via CDN ✅ (" + src + ")");
            return { ok: true, via: "cdn", src };
          }
        } catch (e) {
          log("WARN", "VENDOR: falhou CDN: " + src);
        }
      }

      log("ERR", "VENDOR: JSZip indisponível ❌ (offline + sem /vendor)");
      return { ok: false, err: "JSZip_missing" };
    } catch (e) {
      log("ERR", "VENDOR: ensureJSZip crash ❌ " + (e?.message || e));
      return { ok: false, err: String(e?.message || e) };
    }
  }

  window.RCF_VENDOR = {
    __v10: true,
    ensureJSZip
  };

  log("OK", "vendor_loader.js pronto ✅ (v1.0)");
})();

/* FILE: /app/js/core/sw_runtime.js
   RControl Factory — SW Runtime
   - Extrai helpers de Service Worker / Cache do app.js
   - Seguro para Safari / PWA
*/
(() => {
  "use strict";

  function getLogger() {
    try {
      if (window.RCF_LOGGER_RUNTIME && typeof window.RCF_LOGGER_RUNTIME.write === "function") {
        return window.RCF_LOGGER_RUNTIME;
      }
    } catch {}
    return null;
  }

  function writeLog(...args) {
    try {
      const L = getLogger();
      if (L) return L.write(...args);
    } catch {}
    try { console.log("[RCF][SW]", ...args); } catch {}
    return null;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const API = {
    async register() {
      try {
        if (!("serviceWorker" in navigator)) {
          writeLog("sw:", "serviceWorker não suportado");
          return { ok: false, msg: "SW não suportado" };
        }

        const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
        writeLog("sw register:", "ok");
        return { ok: true, msg: "SW registrado ✅", reg };
      } catch (e) {
        writeLog("sw register fail:", e?.message || e);
        return { ok: false, msg: "Falhou registrar SW: " + (e?.message || e) };
      }
    },

    async unregisterAll() {
      try {
        if (!("serviceWorker" in navigator)) return { ok: true, count: 0 };

        const regs = await navigator.serviceWorker.getRegistrations();
        let n = 0;

        for (const r of regs) {
          try {
            if (await r.unregister()) n++;
          } catch {}
        }

        writeLog("sw unregister:", n, "ok");
        return { ok: true, count: n };
      } catch (e) {
        writeLog("sw unregister err:", e?.message || e);
        return { ok: false, count: 0, err: e?.message || e };
      }
    },

    async clearCaches() {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        writeLog("cache clear:", keys.length, "caches");
        return { ok: true, count: keys.length };
      } catch (e) {
        writeLog("cache clear err:", e?.message || e);
        return { ok: false, count: 0, err: e?.message || e };
      }
    },

    async checkAutoFix() {
      const out = { ok: false, status: "missing", detail: "", attempts: 0, err: "" };

      if (!("serviceWorker" in navigator)) {
        out.status = "unsupported";
        out.detail = "serviceWorker não suportado neste browser";
        return out;
      }

      const tryGet = async () => {
        try {
          const a = await navigator.serviceWorker.getRegistration("./");
          if (a) return a;

          const b = await navigator.serviceWorker.getRegistration();
          return b || null;
        } catch (e) {
          out.err = String(e?.message || e);
          return null;
        }
      };

      let reg = await tryGet();
      if (reg) {
        out.ok = true;
        out.status = "registered";
        out.detail = "já estava registrado";
        return out;
      }

      out.attempts++;
      try {
        const r = await this.register();
        out.detail = r?.msg || "tentou registrar";
      } catch (e) {
        out.err = String(e?.message || e);
      }

      await sleep(350);

      reg = await tryGet();
      if (reg) {
        out.ok = true;
        out.status = "registered";
        out.detail = "registrou após auto-fix";
        return out;
      }

      out.status = "missing";
      out.detail =
        (location.protocol !== "https:" && location.hostname !== "localhost")
          ? "SW exige HTTPS (ou localhost)."
          : "sw.js não registrou (pode ser path/scope/privacidade).";

      return out;
    },

    init() {
      try { window.RCF_SW_RUNTIME = API; } catch {}
      writeLog("sw_runtime:", "init ok ✅");
      return true;
    }
  };

  try { window.RCF_SW_RUNTIME = API; } catch {}

  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { API.init(); } catch {}
    }, { passive: true });
  } catch {}
})();

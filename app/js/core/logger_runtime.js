/* FILE: /app/js/core/logger_runtime.js
   RControl Factory — Logger Runtime
   - Extrai runtime de logs do app.js
   - Seguro / tolerante / sem depender de módulos externos
*/
(() => {
  "use strict";

  function safeJsonStringify(obj) {
    try { return JSON.stringify(obj); } catch { return String(obj); }
  }

  function getStorage() {
    try {
      if (window.RCF_STORAGE && typeof window.RCF_STORAGE.get === "function") return window.RCF_STORAGE;
    } catch {}
    return null;
  }

  function fallbackGet(key, fallback) {
    try {
      const raw = localStorage.getItem("rcf:" + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function fallbackSet(key, value) {
    try { localStorage.setItem("rcf:" + key, JSON.stringify(value)); } catch {}
  }

  function $(sel) {
    try { return document.querySelector(sel); } catch { return null; }
  }

  const API = {
    bufKey: "logs",
    max: 900,

    getAll() {
      try {
        const S = getStorage();
        if (S) return S.get(this.bufKey, []);
      } catch {}
      return fallbackGet(this.bufKey, []);
    },

    setAll(logs) {
      try {
        const S = getStorage();
        if (S && typeof S.set === "function") {
          S.set(this.bufKey, logs || []);
          return;
        }
      } catch {}
      fallbackSet(this.bufKey, logs || []);
    },

    mirrorUI(logs) {
      const txt = (logs || []).join("\n");

      const boxDrawer = $("#logsBox");
      if (boxDrawer) boxDrawer.textContent = txt;

      const boxLogsOut = $("#logsOut");
      if (boxLogsOut) boxLogsOut.textContent = txt;

      const boxView = $("#logsViewBox");
      if (boxView) boxView.textContent = txt;

      const injLog = $("#injLog");
      if (injLog) injLog.textContent = txt.slice(-8000);
    },

    write(...args) {
      const msg = args.map(a => (typeof a === "string" ? a : safeJsonStringify(a))).join(" ");
      const line = `[${new Date().toLocaleString()}] ${msg}`;

      const logs = this.getAll();
      logs.push(line);

      while (logs.length > this.max) logs.shift();

      this.setAll(logs);
      this.mirrorUI(logs);

      try { console.log("[RCF]", ...args); } catch {}
      return line;
    },

    clear() {
      this.setAll([]);
      this.mirrorUI([]);
      return true;
    },

    copyToClipboard: async function () {
      const txt = this.getAll().join("\n");
      try {
        await navigator.clipboard.writeText(txt);
        return { ok: true, text: txt };
      } catch (e) {
        return { ok: false, text: txt, err: e?.message || e };
      }
    },

    refreshViews() {
      this.mirrorUI(this.getAll());
      return true;
    },

    installGlobalCompat() {
      try {
        window.RCF_LOGGER_RUNTIME = API;
      } catch {}

      try {
        window.RCF_LOGGER = window.RCF_LOGGER || {
          push(level, msg) { API.write(String(level || "log") + ":", msg); },
          clear() { API.clear(); },
          getText() { return API.getAll().join("\n"); },
          dump() { return API.getAll().join("\n"); }
        };
      } catch {}

      try {
        if (typeof window.log !== "function") {
          window.log = (...a) => {
            try { API.write(...a); }
            catch { try { console.log("[RCF.log]", ...a); } catch {} }
          };
        }
      } catch {}

      return true;
    },

    init() {
      try { this.installGlobalCompat(); } catch {}
      try { this.refreshViews(); } catch {}
      try { this.write("logger_runtime:", "init ok ✅"); } catch {}
      return true;
    }
  };

  try { window.RCF_LOGGER_RUNTIME = API; } catch {}

  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { API.init(); } catch {}
    }, { passive: true });
  } catch {}
})();

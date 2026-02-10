/* =========================================================
  RControl Factory — app/js/core/storage.js (FULL)
  - Sem "export" (compatível com <script> normal)
  - Wrapper simples localStorage
  - Prefixo padrão: rcf:
========================================================= */
(function () {
  "use strict";

  const Storage = {
    prefix: "rcf:",

    get(key, fallback) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        if (v == null) return fallback;
        return JSON.parse(v);
      } catch {
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
      } catch {}
    },

    del(key) {
      try { localStorage.removeItem(this.prefix + key); } catch {}
    },

    rawGet(fullKey, fallback) {
      try {
        const v = localStorage.getItem(fullKey);
        return v == null ? fallback : v;
      } catch {
        return fallback;
      }
    },

    rawSet(fullKey, value) {
      try { localStorage.setItem(fullKey, String(value)); } catch {}
    }
  };

  // expõe global
  window.RCF_STORAGE = Storage;
})();

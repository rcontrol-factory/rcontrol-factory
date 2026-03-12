/* FILE: /app/js/ui/ui_bootstrap.js
   RControl Factory — UI Bootstrap
   - Orquestra módulos visuais leves
   - Sem núcleo crítico
*/
(() => {
  "use strict";

  function callSafe(obj, fn, ...args) {
    try {
      if (!obj || typeof obj[fn] !== "function") return null;
      return obj[fn](...args);
    } catch {
      return null;
    }
  }

  const API = {
    mount() {
      try {
        callSafe(window.RCF_UI_SHELL, "mount");
        callSafe(window.RCF_UI_HEADER, "mount");
        callSafe(window.RCF_UI_VIEWS, "mount");
        return true;
      } catch {
        return false;
      }
    },

    remountSoft() {
      try {
        setTimeout(() => this.mount(), 20);
        setTimeout(() => this.mount(), 120);
        setTimeout(() => this.mount(), 360);
      } catch {}
    }
  };

  try { window.RCF_UI_BOOTSTRAP = API; } catch {}

  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { API.remountSoft(); } catch {}
    }, { passive: true });
  } catch {}

  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { API.remountSoft(); } catch {}
    });
  } catch {}
})();

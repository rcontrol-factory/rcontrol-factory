/* FILE: /app/js/core/ui_shell.js
   RControl Factory — UI Shell loader
   - Carrega CSSs visuais extras da Factory
   - Seguro / tolerante
*/
(() => {
  "use strict";

  const FILES = [
    "./css/factory_shell.css",
    "./css/factory_components.css",
    "./css/factory_icons.css"
  ];

  function ensureCss(href) {
    try {
      const abs = new URL(href, document.baseURI).toString();
      const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .some(el => {
          try { return new URL(el.href, document.baseURI).toString() === abs; }
          catch { return false; }
        });

      if (exists) return true;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-rcf-ui-shell", "1");
      document.head.appendChild(link);
      return true;
    } catch {
      return false;
    }
  }

  const API = {
    mount() {
      let count = 0;
      for (const href of FILES) {
        try {
          if (ensureCss(href)) count++;
        } catch {}
      }
      return { ok: true, count };
    }
  };

  try { window.RCF_UI_SHELL = API; } catch {}

  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { API.mount(); } catch {}
    }, { passive: true });
  } catch {}
})();

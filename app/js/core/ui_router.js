/* FILE: /app/js/core/ui_router.js
   RControl Factory — UI Router
   - Centraliza troca de views
   - Compatível com a estrutura atual
   - Usa RCF_UI_STATE quando disponível
*/
(() => {
  "use strict";

  function safeViewName(name) {
    try {
      return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");
    } catch {
      return "";
    }
  }

  function getStateApi() {
    try {
      return window.RCF_UI_STATE || null;
    } catch {
      return null;
    }
  }

  const API = {
    __deps: null,

    init(deps) {
      this.__deps = deps || this.__deps || {};
      return this;
    },

    get d() {
      return this.__deps || {};
    },

    listAvailableViews(root = document) {
      try {
        return Array.from(root.querySelectorAll(".view[id^='view-']"))
          .map(el => String(el.id || "").replace(/^view-/, ""))
          .filter(Boolean);
      } catch {
        return [];
      }
    },

    exists(name, root = document) {
      try {
        const view = safeViewName(name);
        if (!view) return false;
        return !!root.getElementById?.(`view-${view}`) || !!root.querySelector?.(`#view-${view}`);
      } catch {
        return false;
      }
    },

    setView(name, opts = {}) {
      const viewName = safeViewName(name);
      if (!viewName) return false;

      try {
        const d = this.d;
        const StateApi = getStateApi();

        const prevView =
          StateApi?.get?.("view", null) ??
          d.State?.active?.view ??
          null;

        if (prevView === viewName && !opts.force) return true;

        if (prevView === "generator" && viewName !== "generator") {
          try { d.teardownPreviewHard?.(); } catch {}
        }

        const views = d.$$ ? d.$$(".view") : Array.from(document.querySelectorAll(".view"));
        const tabs = d.$$ ? d.$$('[data-view]') : Array.from(document.querySelectorAll('[data-view]'));

        views.forEach(v => {
          try {
            v.classList.remove("active");
            v.hidden = true;
            v.style.display = "none";
            v.setAttribute("aria-hidden", "true");
            v.removeAttribute("data-rcf-visible");
          } catch {}
        });

        tabs.forEach(btn => {
          try {
            btn.classList.remove("active");
            btn.removeAttribute("aria-current");
          } catch {}
        });

        const target =
          (d.$ && d.$(`#view-${viewName}`)) ||
          document.querySelector(`#view-${viewName}`);

        if (!target) return false;

        try {
          target.hidden = false;
          target.style.display = "";
          target.classList.add("active");
          target.setAttribute("aria-hidden", "false");
          target.setAttribute("data-rcf-visible", "1");
        } catch {}

        tabs
          .filter(btn => {
            try { return String(btn.getAttribute("data-view") || "") === viewName; }
            catch { return false; }
          })
          .forEach(btn => {
            try {
              btn.classList.add("active");
              btn.setAttribute("aria-current", "page");
            } catch {}
          });

        try {
          StateApi?.patch?.({
            previousView: prevView,
            view: viewName
          }, { save: false });
        } catch {}

        try {
          if (d.State?.active) d.State.active.view = viewName;
        } catch {}

        try { d.saveAll?.(); } catch {}

        if (["logs", "settings", "admin", "github", "updates", "deploy"].includes(viewName)) {
          try { d.refreshLogsViews?.(); } catch {}
        }

        try { d.Logger?.write?.("view:", viewName); } catch {}

        return true;
      } catch {
        return false;
      }
    },

    bindGlobalCompat() {
      try {
        window.RCF = window.RCF || {};
        window.RCF.setView = (name, opts) => this.setView(name, opts);
        return true;
      } catch {
        return false;
      }
    }
  };

  try {
    window.RCF_UI_ROUTER = API;
  } catch {}
})();

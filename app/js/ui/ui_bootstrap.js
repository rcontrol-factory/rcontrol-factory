/* FILE: /app/js/ui/ui_bootstrap.js
   RControl Factory — UI Bootstrap
   - Orquestra módulos visuais leves
   - Inicializa dependências da nova UI
   - Pluga a Factory View nova em slot seguro
   - Sem quebrar fluxo antigo
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

  function $(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function $$(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;"
    }[c]));
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function textContentSafe(el, txt) {
    try { if (el) el.textContent = String(txt ?? ""); } catch {}
  }

  function slugify(str) {
    try {
      return String(str || "")
        .trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    } catch {
      return "";
    }
  }

  function nowISO() {
    try { return new Date().toISOString(); } catch { return ""; }
  }

  function getLoggerCompat() {
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
        return {
          write(...args) {
            try {
              const msg = args.map(a => {
                try { return typeof a === "string" ? a : JSON.stringify(a); }
                catch { return String(a); }
              }).join(" ");
              window.RCF_LOGGER.push("UI", msg);
            } catch {}
          },
          getAll() {
            try {
              if (typeof window.RCF_LOGGER.getText === "function") {
                return String(window.RCF_LOGGER.getText() || "").split("\n").filter(Boolean);
              }
            } catch {}
            return [];
          }
        };
      }
    } catch {}

    return {
      write() {},
      getAll() { return []; }
    };
  }

  function getSaveAll() {
    return function saveAllCompat() {
      try {
        const State = window.RCF?.state;
        if (!State) return;

        try { localStorage.setItem("rcf:cfg", JSON.stringify(State.cfg ?? {})); } catch {}
        try { localStorage.setItem("rcf:apps", JSON.stringify(State.apps ?? [])); } catch {}
        try { localStorage.setItem("rcf:active", JSON.stringify(State.active ?? {})); } catch {}
        try { localStorage.setItem("rcf:pending", JSON.stringify(State.pending ?? {})); } catch {}
      } catch {}
    };
  }

  function getHelpersCompat() {
    return {
      getActiveApp() {
        try {
          const State = window.RCF?.state;
          if (!State?.active?.appSlug) return null;
          return (State.apps || []).find(a => a.slug === State.active.appSlug) || null;
        } catch {
          return null;
        }
      },

      ensureAppFiles(app) {
        try {
          if (!app.files || typeof app.files !== "object") app.files = {};
          return app.files;
        } catch {
          return {};
        }
      },

      deleteApp(slug) {
        try {
          if (window.RCF_UI_RUNTIME && typeof window.RCF_UI_RUNTIME.deleteApp === "function") {
            return window.RCF_UI_RUNTIME.deleteApp(slug);
          }
        } catch {}

        try {
          const State = window.RCF?.state;
          if (!State) return false;

          const s = slugify(slug);
          if (!s) return false;

          State.apps = (State.apps || []).filter(a => a.slug !== s);

          if (State.active?.appSlug === s) {
            State.active.appSlug = null;
            State.active.file = null;
          }

          getSaveAll()();
          return true;
        } catch {
          return false;
        }
      }
    };
  }

  function buildDeps() {
    return {
      $,
      $$,
      State: window.RCF?.state || { apps: [], active: {}, cfg: {}, pending: {} },
      Logger: getLoggerCompat(),
      escapeHtml,
      escapeAttr,
      textContentSafe,
      slugify,
      nowISO,
      saveAll: getSaveAll(),
      bindTap: typeof window.bindTap === "function" ? window.bindTap : function(el, fn) {
        try {
          if (!el || el.__rcf_bound__) return;
          el.__rcf_bound__ = true;
          el.addEventListener("click", fn, { passive: false });
        } catch {}
      },
      uiMsg(sel, text) {
        try {
          const el = $(sel);
          if (el) el.textContent = String(text ?? "");
        } catch {}
      },
      safeSetStatus(txt) {
        try {
          const a = $("#statusText");
          const b = $("#statusTextTop");
          if (a) a.textContent = String(txt ?? "");
          if (b) b.textContent = String(txt ?? "");
        } catch {}
      },
      helpers: getHelpersCompat()
    };
  }

  function ensureFactorySlot() {
    try {
      const dashboard = $("#view-dashboard");
      if (!dashboard) return null;

      let slot = $("#rcfFactoryUiRoot", dashboard);
      if (slot) return slot;

      slot = document.createElement("div");
      slot.id = "rcfFactoryUiRoot";
      slot.setAttribute("data-rcf-ui-slot", "factory-view");
      slot.style.marginTop = "14px";

      dashboard.appendChild(slot);
      return slot;
    } catch {
      return null;
    }
  }

  const API = {
    __deps: null,
    __inited: false,
    __mountCount: 0,

    getDeps() {
      if (!this.__deps) this.__deps = buildDeps();
      return this.__deps;
    },

    initModules() {
      const deps = this.getDeps();

      const mods = [
        window.RCF_UI_CONFIG,
        window.RCF_UI_TOKENS,
        window.RCF_UI_CARDS,
        window.RCF_UI_NAV,
        window.RCF_UI_DASHBOARD,
        window.RCF_UI_APPS_WIDGETS,
        window.RCF_UI_CODE_PANEL,
        window.RCF_UI_PROJECTS,
        window.RCF_UI_FACTORY_VIEW,
        window.RCF_UI_HEADER,
        window.RCF_UI_VIEWS,
        window.RCF_UI_RUNTIME,
        window.RCF_UI_SHELL
      ].filter(Boolean);

      mods.forEach(mod => callSafe(mod, "init", deps));

      this.__inited = true;
      return true;
    },

    mountLegacy() {
      callSafe(window.RCF_UI_SHELL, "mount");
      callSafe(window.RCF_UI_HEADER, "mount");
      callSafe(window.RCF_UI_VIEWS, "mount");
    },

    mountFactoryView() {
      try {
        const slot = ensureFactorySlot();
        if (!slot) return false;

        if (window.RCF_UI_FACTORY_VIEW && typeof window.RCF_UI_FACTORY_VIEW.render === "function") {
          return !!window.RCF_UI_FACTORY_VIEW.render("#rcfFactoryUiRoot");
        }

        return false;
      } catch {
        return false;
      }
    },

    mount() {
      try {
        this.initModules();
        this.mountLegacy();
        this.mountFactoryView();
        this.__mountCount++;
        return true;
      } catch {
        return false;
      }
    },

    remountSoft() {
      try {
        if (this.__remountBusy__) return;
        this.__remountBusy__ = true;

        const run = () => {
          try { this.mount(); } catch {}
        };

        setTimeout(run, 20);
        setTimeout(run, 120);
        setTimeout(run, 360);
        setTimeout(() => { this.__remountBusy__ = false; }, 500);
      } catch {
        this.__remountBusy__ = false;
      }
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

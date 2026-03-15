/* FILE: /app/js/ui/ui_bootstrap.js
   RControl Factory — UI Bootstrap
   V2.1 FACTORY-AI SCRIPT LOADER + OFFICIAL VIEW MOUNT
   - Orquestra módulos visuais leves
   - Inicializa dependências da nova UI
   - Monta em ordem segura
   - Sem quebrar fluxo antigo
   - CARREGA ./js/admin.admin_ai.js quando necessário
   - Factory View monta na view oficial, não no dashboard
   - Remount curto e seguro para encaixar Factory IA
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

  function ensureHeaderRoot() {
    try {
      let root = $("#rcfHeader");
      if (root) return root;

      const topbar = $(".topbar");
      if (!topbar) return null;

      root = document.createElement("div");
      root.id = "rcfHeader";
      root.setAttribute("data-rcf-ui-slot", "header");

      topbar.insertAdjacentElement("afterbegin", root);
      return root;
    } catch {
      return null;
    }
  }

  function loadScriptOnce(src, marker) {
    return new Promise(resolve => {
      try {
        const hit = document.querySelector(`script[${marker}="1"]`);
        if (hit) return resolve(true);

        const sc = document.createElement("script");
        sc.src = src;
        sc.defer = true;
        sc.async = false;
        sc.setAttribute(marker, "1");
        sc.onload = () => resolve(true);
        sc.onerror = () => resolve(false);

        (document.head || document.documentElement).appendChild(sc);
        setTimeout(() => resolve(false), 1800);
      } catch {
        resolve(false);
      }
    });
  }

  function getFactoryAIView() {
    return (
      $("#view-factory-ai") ||
      $('[data-rcf-view="factory-ai"]') ||
      $("#rcfFactoryAIView") ||
      $("[data-rcf-factory-ai-view]")
    );
  }

  const API = {
    __deps: null,
    __inited: false,
    __mountCount: 0,
    __remountBusy__: false,
    __bootstrappedOnce__: false,
    __factoryAIScriptPromise__: null,

    getDeps() {
      if (!this.__deps) this.__deps = buildDeps();
      return this.__deps;
    },

    async ensureFactoryAIScript() {
      try {
        if (
          (window.RCF_FACTORY_AI && typeof window.RCF_FACTORY_AI.mount === "function") ||
          (window.RCF_ADMIN_AI && typeof window.RCF_ADMIN_AI.mount === "function")
        ) {
          return true;
        }

        if (this.__factoryAIScriptPromise__) {
          return await this.__factoryAIScriptPromise__;
        }

        this.__factoryAIScriptPromise__ = loadScriptOnce("./js/admin.admin_ai.js", "data-rcf-factory-ai-script")
          .then(ok => {
            try {
              this.getDeps().Logger.write("factory_ai script:", ok ? "load requested ✅" : "load failed ❌");
            } catch {}
            return ok;
          })
          .catch(() => false);

        return await this.__factoryAIScriptPromise__;
      } catch {
        return false;
      }
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

    mountShell() {
      callSafe(window.RCF_UI_SHELL, "mount");
      return true;
    },

    mountHeader() {
      try { ensureHeaderRoot(); } catch {}
      callSafe(window.RCF_UI_HEADER, "mount");
      return true;
    },

    mountLegacyViews() {
      callSafe(window.RCF_UI_VIEWS, "mount");
      return true;
    },

    mountFactoryView() {
      try {
        const view = getFactoryAIView();

        if (window.RCF_UI_FACTORY_VIEW && typeof window.RCF_UI_FACTORY_VIEW.mount === "function") {
          return !!window.RCF_UI_FACTORY_VIEW.mount(Object.assign({}, this.getDeps(), {
            root: view || null,
            viewEl: view || null
          }));
        }

        if (window.RCF_UI_FACTORY_VIEW && typeof window.RCF_UI_FACTORY_VIEW.refresh === "function") {
          return !!window.RCF_UI_FACTORY_VIEW.refresh(Object.assign({}, this.getDeps(), {
            root: view || null,
            viewEl: view || null
          }));
        }

        return false;
      } catch {
        return false;
      }
    },

    mountFactoryAIEngine() {
      try {
        let ok = false;

        if (window.RCF_FACTORY_AI && typeof window.RCF_FACTORY_AI.mount === "function") {
          ok = window.RCF_FACTORY_AI.mount() !== false || ok;
        }

        if (!ok && window.RCF_ADMIN_AI && typeof window.RCF_ADMIN_AI.mount === "function") {
          ok = window.RCF_ADMIN_AI.mount() !== false || ok;
        }

        return ok;
      } catch {
        return false;
      }
    },

    refreshUi() {
      try { callSafe(window.RCF_UI_DASHBOARD, "refresh"); } catch {}
      try { callSafe(window.RCF_UI_RUNTIME, "refreshDashboardUI"); } catch {}
      try { callSafe(window.RCF_UI_RUNTIME, "renderAppsList"); } catch {}
      try { callSafe(window.RCF_UI_RUNTIME, "renderFilesList"); } catch {}
      try { callSafe(window.RCF_UI_RUNTIME, "syncFabStatusText"); } catch {}
      try { callSafe(window.RCF_UI_VIEWS, "mount"); } catch {}
      try { callSafe(window.RCF_UI_FACTORY_VIEW, "refresh", Object.assign({}, this.getDeps(), {
        root: getFactoryAIView(),
        viewEl: getFactoryAIView()
      })); } catch {}
      return true;
    },

    async mount() {
      try {
        this.initModules();

        this.mountShell();
        this.mountHeader();
        this.mountLegacyViews();
        this.mountFactoryView();

        await this.ensureFactoryAIScript();
        this.mountFactoryAIEngine();

        this.refreshUi();

        setTimeout(() => {
          try { this.mountFactoryView(); } catch {}
          try { this.mountFactoryAIEngine(); } catch {}
          try { this.refreshUi(); } catch {}
        }, 120);

        setTimeout(() => {
          try { this.mountFactoryView(); } catch {}
          try { this.mountFactoryAIEngine(); } catch {}
        }, 420);

        setTimeout(() => {
          try { this.mountFactoryAIEngine(); } catch {}
        }, 900);

        this.__mountCount++;
        this.__bootstrappedOnce__ = true;
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

        if (!this.__bootstrappedOnce__) {
          setTimeout(run, 120);
          setTimeout(run, 320);
        }

        setTimeout(run, 760);
        setTimeout(() => { this.__remountBusy__ = false; }, 980);
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

/* FILE: /app/js/ui/ui_bootstrap.js
   RControl Factory — UI Bootstrap
   V2.3 FACTORY-AI OFFICIAL LOADER REMOUNT GUARD

   - Orquestra módulos visuais leves
   - Inicializa dependências da nova UI
   - Monta em ordem segura
   - Sem quebrar fluxo antigo
   - Carrega ./js/admin.admin_ai.js quando necessário
   - Factory View monta somente na view oficial
   - Evita remount excessivo e encaixe torto da Factory IA
   - Mantém retries curtos e controlados
   - Guarda remount para evitar mount duplicado
   - Prefere refresh ao invés de remontar a view oficial já montada
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
    return function saveAllCompat(reason = "ui_bootstrap") {
      try {
        const State = window.RCF?.state;
        if (!State) return;

        try { localStorage.setItem("rcf:cfg", JSON.stringify(State.cfg ?? {})); } catch {}
        try { localStorage.setItem("rcf:apps", JSON.stringify(State.apps ?? [])); } catch {}
        try { localStorage.setItem("rcf:active", JSON.stringify(State.active ?? {})); } catch {}
        try { localStorage.setItem("rcf:pending", JSON.stringify(State.pending ?? {})); } catch {}

        try {
          if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
            window.RCF_LOGGER.push("UI", "[ui_bootstrap] saveAll " + String(reason || ""));
          }
        } catch {}
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

          getSaveAll()("deleteApp");
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

  function normalizePath(src) {
    try {
      return new URL(src, location.href).href;
    } catch {
      return String(src || "");
    }
  }

  function loadScriptOnce(src, marker) {
    return new Promise(resolve => {
      try {
        const fullSrc = normalizePath(src);

        const existingByMarker = document.querySelector(`script[${marker}="1"]`);
        if (existingByMarker) {
          return resolve(true);
        }

        const existingBySrc = Array.from(document.querySelectorAll("script[src]")).find(sc => {
          try { return normalizePath(sc.getAttribute("src")) === fullSrc; } catch { return false; }
        });

        if (existingBySrc) {
          existingBySrc.setAttribute(marker, "1");
          return resolve(true);
        }

        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          resolve(!!ok);
        };

        const sc = document.createElement("script");
        sc.src = src;
        sc.defer = true;
        sc.async = false;
        sc.setAttribute(marker, "1");

        sc.onload = () => done(true);
        sc.onerror = () => done(false);

        (document.head || document.documentElement).appendChild(sc);
        setTimeout(() => done(false), 1800);
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

  function isFactoryAIViewVisible() {
    try {
      const view = getFactoryAIView();
      if (!view) return false;
      if (view.classList.contains("active")) return true;
      if (view.getAttribute("data-rcf-visible") === "1") return true;
      if (view.hidden) return false;

      const cs = window.getComputedStyle(view);
      if (!cs) return false;
      if (cs.display === "none") return false;
      if (cs.visibility === "hidden") return false;
      return true;
    } catch {
      return false;
    }
  }

  const API = {
    __deps: null,
    __inited: false,
    __mountCount: 0,
    __remountBusy__: false,
    __bootstrappedOnce__: false,
    __factoryAIScriptPromise__: null,
    __retryTimers__: [],
    __mountPromise__: null,
    __lastRemountAt__: 0,
    __lastMountAt__: 0,
    __lastRefreshAt__: 0,

    getDeps() {
      if (!this.__deps) this.__deps = buildDeps();
      return this.__deps;
    },

    _log(...args) {
      try { this.getDeps().Logger.write("[ui_bootstrap]", ...args); } catch {}
    },

    _clearRetryTimers() {
      try {
        (this.__retryTimers__ || []).forEach(id => clearTimeout(id));
      } catch {}
      this.__retryTimers__ = [];
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

        this.__factoryAIScriptPromise__ = loadScriptOnce(
          "./js/admin.admin_ai.js",
          "data-rcf-factory-ai-script"
        ).then(ok => {
          this._log("factory_ai script", ok ? "load ok" : "load fail");
          return !!ok;
        }).catch(() => false);

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
        if (!view) {
          this._log("mountFactoryView skip", "official view missing");
          return false;
        }

        const deps = Object.assign({}, this.getDeps(), {
          root: view,
          viewEl: view,
          officialViewOnly: true
        });

        const alreadyMounted = view.getAttribute("data-rcf-ui-factory-mounted") === "1";

        if (alreadyMounted && window.RCF_UI_FACTORY_VIEW && typeof window.RCF_UI_FACTORY_VIEW.refresh === "function") {
          return !!window.RCF_UI_FACTORY_VIEW.refresh(deps);
        }

        if (window.RCF_UI_FACTORY_VIEW && typeof window.RCF_UI_FACTORY_VIEW.mount === "function") {
          return !!window.RCF_UI_FACTORY_VIEW.mount(deps);
        }

        if (window.RCF_UI_FACTORY_VIEW && typeof window.RCF_UI_FACTORY_VIEW.refresh === "function") {
          return !!window.RCF_UI_FACTORY_VIEW.refresh(deps);
        }

        return false;
      } catch {
        return false;
      }
    },

    mountFactoryAIEngine() {
      try {
        const view = getFactoryAIView();
        if (!view) return false;

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
      try { callSafe(window.RCF_UI_DASHBOARD, "refresh", this.getDeps()); } catch {}
      try { callSafe(window.RCF_UI_RUNTIME, "refreshDashboardUI"); } catch {}
      try { callSafe(window.RCF_UI_RUNTIME, "renderAppsList"); } catch {}
      try { callSafe(window.RCF_UI_RUNTIME, "renderFilesList"); } catch {}
      try { callSafe(window.RCF_UI_RUNTIME, "syncFabStatusText"); } catch {}
      try { callSafe(window.RCF_UI_VIEWS, "refresh", this.getDeps()); } catch {}

      try {
        const view = getFactoryAIView();
        if (view) {
          callSafe(window.RCF_UI_FACTORY_VIEW, "refresh", Object.assign({}, this.getDeps(), {
            root: view,
            viewEl: view,
            officialViewOnly: true
          }));
        }
      } catch {}

      this.__lastRefreshAt__ = Date.now();
      return true;
    },

    refreshOnly() {
      try {
        this.initModules();
        this.mountShell();
        this.mountHeader();
        this.mountLegacyViews();
        this.mountFactoryView();
        this.mountFactoryAIEngine();
        this.refreshUi();
        this._log("refresh only", "bootstrapped=1");
        return true;
      } catch {
        return false;
      }
    },

    scheduleFactoryAIRetries() {
      this._clearRetryTimers();

      const steps = this.__bootstrappedOnce__ ? [180, 620] : [120, 420, 900];
      steps.forEach(ms => {
        const id = setTimeout(() => {
          try { this.mountFactoryView(); } catch {}
          try { this.mountFactoryAIEngine(); } catch {}
          try { this.refreshUi(); } catch {}
        }, ms);
        this.__retryTimers__.push(id);
      });
    },

    async mount() {
      try {
        if (this.__mountPromise__) {
          return await this.__mountPromise__;
        }

        this.__mountPromise__ = (async () => {
          this.initModules();

          this.mountShell();
          this.mountHeader();
          this.mountLegacyViews();

          await this.ensureFactoryAIScript();

          const alreadyMounted = (() => {
            try {
              const view = getFactoryAIView();
              return !!(view && view.getAttribute("data-rcf-ui-factory-mounted") === "1");
            } catch {
              return false;
            }
          })();

          if (this.__bootstrappedOnce__ && alreadyMounted) {
            this.refreshOnly();
            this.__lastMountAt__ = Date.now();
            return true;
          }

          this.mountFactoryView();
          this.mountFactoryAIEngine();
          this.refreshUi();
          this.scheduleFactoryAIRetries();

          this.__mountCount += 1;
          this.__bootstrappedOnce__ = true;
          this.__lastMountAt__ = Date.now();

          this._log("mount ok", "count=" + this.__mountCount);
          return true;
        })();

        return await this.__mountPromise__;
      } catch {
        return false;
      } finally {
        this.__mountPromise__ = null;
      }
    },

    remountSoft(reason = "soft") {
      try {
        const nowTs = Date.now();
        if (this.__remountBusy__) return;
        if (this.__lastRemountAt__ && (nowTs - this.__lastRemountAt__) < 1200) {
          this._log("remount skip", "reason=" + reason + " throttled");
          return;
        }

        this.__remountBusy__ = true;
        this.__lastRemountAt__ = nowTs;

        const run = () => {
          try {
            if (this.__bootstrappedOnce__) this.refreshOnly();
            else this.mount();
          } catch {}
        };

        setTimeout(run, 20);

        if (!this.__bootstrappedOnce__) {
          setTimeout(run, 180);
        }

        setTimeout(() => {
          this.__remountBusy__ = false;
        }, 760);
      } catch {
        this.__remountBusy__ = false;
      }
    }
  };

  try { window.RCF_UI_BOOTSTRAP = API; } catch {}

  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { API.remountSoft("domcontentloaded"); } catch {}
    }, { passive: true });
  } catch {}

  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { API.remountSoft("ui_ready"); } catch {}
    });
  } catch {}

  try {
    document.addEventListener("visibilitychange", () => {
      try {
        if (!document.hidden && isFactoryAIViewVisible()) {
          API.remountSoft("visibility");
        }
      } catch {}
    }, { passive: true });
  } catch {}

})();

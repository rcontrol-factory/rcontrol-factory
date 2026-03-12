/* FILE: /app/js/core/ui_state.js
   RControl Factory — UI State
   - Fonte central de estado visual
   - Compatível com window.RCF.state
   - Não quebra a estrutura atual
*/
(() => {
  "use strict";

  function cloneSafe(obj, fallback = null) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return fallback;
    }
  }

  function getRootState() {
    try {
      window.RCF = window.RCF || {};
      window.RCF.state = window.RCF.state || {};
      return window.RCF.state;
    } catch {
      return {};
    }
  }

  const DEFAULT_UI = {
    view: "dashboard",
    previousView: null,
    activeAppSlug: null,
    activeFile: null,
    activeProjectTab: "projects",
    toolsOpen: false,
    fabOpen: false,
    injectorLogCollapsed: true,
    statusText: "OK ✅",
    ready: false,
    lastHydratedAt: null
  };

  const API = {
    __deps: null,

    init(deps) {
      this.__deps = deps || this.__deps || {};
      this.ensure();
      return this;
    },

    get d() {
      return this.__deps || {};
    },

    ensure() {
      try {
        const root = getRootState();

        if (!root.ui || typeof root.ui !== "object") {
          root.ui = cloneSafe(DEFAULT_UI, {}) || {};
        }

        for (const [k, v] of Object.entries(DEFAULT_UI)) {
          if (!(k in root.ui)) root.ui[k] = cloneSafe(v, v);
        }

        if (!root.active || typeof root.active !== "object") {
          root.active = { appSlug: null, file: null, view: "dashboard" };
        }

        if (typeof root.active.view !== "string" || !root.active.view) {
          root.active.view = root.ui.view || "dashboard";
        }

        if (!("appSlug" in root.active)) root.active.appSlug = null;
        if (!("file" in root.active)) root.active.file = null;

        if (!root.cfg || typeof root.cfg !== "object") {
          root.cfg = {};
        }

        return root.ui;
      } catch {
        return cloneSafe(DEFAULT_UI, {}) || {};
      }
    },

    getAll() {
      try {
        return this.ensure();
      } catch {
        return cloneSafe(DEFAULT_UI, {}) || {};
      }
    },

    get(key, fallback = null) {
      try {
        const ui = this.ensure();
        return (key in ui) ? ui[key] : fallback;
      } catch {
        return fallback;
      }
    },

    set(key, value, opts = {}) {
      try {
        const ui = this.ensure();
        ui[key] = value;

        if (opts.mirrorActive !== false) {
          this.syncToActive(key, value);
        }

        if (opts.save !== false) {
          this.save();
        }

        return true;
      } catch {
        return false;
      }
    },

    patch(obj, opts = {}) {
      try {
        const ui = this.ensure();
        const patch = obj && typeof obj === "object" ? obj : {};

        Object.entries(patch).forEach(([k, v]) => {
          ui[k] = v;
          if (opts.mirrorActive !== false) this.syncToActive(k, v);
        });

        if (opts.save !== false) this.save();
        return true;
      } catch {
        return false;
      }
    },

    syncFromActive() {
      try {
        const root = getRootState();
        const ui = this.ensure();

        ui.view = root.active?.view || ui.view || "dashboard";
        ui.activeAppSlug = root.active?.appSlug ?? ui.activeAppSlug ?? null;
        ui.activeFile = root.active?.file ?? ui.activeFile ?? null;

        return true;
      } catch {
        return false;
      }
    },

    syncToActive(key, value) {
      try {
        const root = getRootState();
        root.active = root.active || {};

        if (key === "view") root.active.view = value;
        if (key === "activeAppSlug") root.active.appSlug = value;
        if (key === "activeFile") root.active.file = value;

        return true;
      } catch {
        return false;
      }
    },

    markReady(flag = true) {
      try {
        this.patch({
          ready: !!flag,
          lastHydratedAt: new Date().toISOString()
        });
        return true;
      } catch {
        return false;
      }
    },

    save() {
      try {
        const d = this.d;
        if (typeof d.saveAll === "function") {
          d.saveAll();
          return true;
        }

        const root = getRootState();
        try { localStorage.setItem("rcf:active", JSON.stringify(root.active || {})); } catch {}
        try { localStorage.setItem("rcf:cfg", JSON.stringify(root.cfg || {})); } catch {}
        return true;
      } catch {
        return false;
      }
    },

    resetUi(save = true) {
      try {
        const root = getRootState();
        root.ui = cloneSafe(DEFAULT_UI, {}) || {};
        this.syncToActive("view", root.ui.view);
        this.syncToActive("activeAppSlug", root.ui.activeAppSlug);
        this.syncToActive("activeFile", root.ui.activeFile);
        if (save) this.save();
        return true;
      } catch {
        return false;
      }
    }
  };

  try {
    window.RCF_UI_STATE = API;
  } catch {}
})(); 

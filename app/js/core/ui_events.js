/* FILE: /app/js/core/ui_events.js
   RControl Factory — UI Events
   V1.1 SAFE SCOPED BINDS
   - Centraliza binds básicos da interface
   - Compatível com estrutura atual
   - Não substitui a lógica do app.js
   - Não assume papel de router principal
   - Evita bind genérico demais em qualquer [data-view]
   - Prioriza window.RCF.setView quando disponível
   - Expõe bind() compatível com o app.js atual
*/
(() => {
  "use strict";

  function getRouter() {
    try { return window.RCF_UI_ROUTER || null; } catch { return null; }
  }

  function getStateApi() {
    try { return window.RCF_UI_STATE || null; } catch { return null; }
  }

  function getRCF() {
    try { return window.RCF || null; } catch { return null; }
  }

  function normalizeViewName(name) {
    try {
      if (window.RCF && typeof window.RCF.normalizeViewName === "function") {
        return window.RCF.normalizeViewName(name);
      }
    } catch {}
    try {
      return String(name || "").trim().toLowerCase();
    } catch {
      return "";
    }
  }

  const API = {
    __deps: null,

    init(deps) {
      this.__deps = deps || this.__deps || {};
      return this;
    },

    bind(deps) {
      this.__deps = deps || this.__deps || {};
      return this.bindAll(document);
    },

    get d() {
      return this.__deps || {};
    },

    _$(sel, root = document) {
      const d = this.d;
      try {
        if (typeof d.$ === "function") return d.$(sel, root);
      } catch {}
      try {
        return root.querySelector(sel);
      } catch {
        return null;
      }
    },

    _$$(sel, root = document) {
      const d = this.d;
      try {
        if (typeof d.$$ === "function") return d.$$(sel, root);
      } catch {}
      try {
        return Array.from(root.querySelectorAll(sel));
      } catch {
        return [];
      }
    },

    _bindTap(el, handler) {
      const d = this.d;
      try {
        if (typeof d.bindTap === "function") {
          d.bindTap(el, handler);
          return true;
        }
      } catch {}
      try {
        el.addEventListener("click", handler, { passive: false });
        return true;
      } catch {
        return false;
      }
    },

    _setView(view) {
      const next = normalizeViewName(view);
      if (!next) return false;

      try {
        const rcf = getRCF();
        if (rcf && typeof rcf.setView === "function") {
          return rcf.setView(next) !== false;
        }
      } catch {}

      try {
        const router = getRouter();
        if (router && typeof router.setView === "function") {
          return router.setView(next) !== false;
        }
      } catch {}

      return false;
    },

    _openTools(open, root = document) {
      const d = this.d;
      const st = getStateApi();

      try {
        if (typeof d.openTools === "function") {
          d.openTools(!!open);
          try { st?.set?.("toolsOpen", !!open); } catch {}
          return true;
        }
      } catch {}

      try {
        const drawer = this._$("#toolsDrawer", root) || document.querySelector("#toolsDrawer");
        if (!drawer) return false;

        if (open) {
          drawer.classList.add("open");
          drawer.hidden = false;
          drawer.style.display = "";
        } else {
          drawer.classList.remove("open");
          drawer.hidden = true;
          drawer.style.display = "none";
        }

        try { st?.set?.("toolsOpen", !!open); } catch {}
        return true;
      } catch {
        return false;
      }
    },

    _toggleFab(root = document) {
      const d = this.d;
      const st = getStateApi();

      try {
        if (typeof d.toggleFabPanel === "function") {
          d.toggleFabPanel();
          const panel = this._$("#rcfFabPanel", root) || document.querySelector("#rcfFabPanel");
          const isOpen = !!(panel && !panel.hidden && panel.classList.contains("open"));
          try { st?.set?.("fabOpen", isOpen); } catch {}
          return true;
        }
      } catch {}

      try {
        const panel = this._$("#rcfFabPanel", root) || document.querySelector("#rcfFabPanel");
        if (!panel) return false;

        const willOpen = panel.hidden || !panel.classList.contains("open");
        if (willOpen) {
          panel.hidden = false;
          panel.style.display = "";
          panel.classList.add("open");
        } else {
          panel.classList.remove("open");
          panel.hidden = true;
          panel.style.display = "none";
        }

        try { st?.set?.("fabOpen", willOpen); } catch {}
        return true;
      } catch {
        return false;
      }
    },

    _openFab(open, root = document) {
      const d = this.d;
      const st = getStateApi();

      try {
        if (typeof d.openFabPanel === "function") {
          d.openFabPanel(!!open);
          try { st?.set?.("fabOpen", !!open); } catch {}
          return true;
        }
      } catch {}

      try {
        const panel = this._$("#rcfFabPanel", root) || document.querySelector("#rcfFabPanel");
        if (!panel) return false;

        if (open) {
          panel.hidden = false;
          panel.style.display = "";
          panel.classList.add("open");
        } else {
          panel.classList.remove("open");
          panel.hidden = true;
          panel.style.display = "none";
        }

        try { st?.set?.("fabOpen", !!open); } catch {}
        return true;
      } catch {
        return false;
      }
    },

    bindViewButtons(root = document) {
      try {
        const selectors = [
          ".rcfBottomNav [data-view]",
          ".tabs [data-view]",
          "[data-rcf-nav] [data-view]",
          "button.tab[data-view]"
        ];

        const buttons = this._$$(selectors.join(","), root);
        buttons.forEach(btn => {
          if (!btn || btn.__rcf_ui_events_view_bound__) return;
          btn.__rcf_ui_events_view_bound__ = true;

          const handler = (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            try {
              const target = btn.getAttribute("data-view");
              if (!target) return;
              this._setView(target);
            } catch {}
          };

          this._bindTap(btn, handler);
        });

        return true;
      } catch {
        return false;
      }
    },

    bindTools(root = document) {
      try {
        const openBtn = this._$("#btnOpenTools", root);
        const closeBtn = this._$("#btnCloseTools", root);

        if (openBtn && !openBtn.__rcf_ui_events_bound__) {
          openBtn.__rcf_ui_events_bound__ = true;
          this._bindTap(openBtn, (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            this._openFab(false, root);
            this._openTools(true, root);
          });
        }

        if (closeBtn && !closeBtn.__rcf_ui_events_bound__) {
          closeBtn.__rcf_ui_events_bound__ = true;
          this._bindTap(closeBtn, (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            this._openTools(false, root);
          });
        }

        return true;
      } catch {
        return false;
      }
    },

    bindFab(root = document) {
      try {
        const fab = this._$("#rcfFab", root);
        const btnClose = this._$("#btnFabClose", root);
        const btnTools = this._$("#btnFabTools", root);
        const btnAdmin = this._$("#btnFabAdmin", root);
        const btnDoctor = this._$("#btnFabDoctor", root);
        const btnLogs = this._$("#btnFabLogs", root);

        if (fab && !fab.__rcf_ui_events_bound__) {
          fab.__rcf_ui_events_bound__ = true;
          this._bindTap(fab, (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            this._toggleFab(root);
            try { this.d.syncFabStatusText?.(); } catch {}
          });
        }

        if (btnClose && !btnClose.__rcf_ui_events_bound__) {
          btnClose.__rcf_ui_events_bound__ = true;
          this._bindTap(btnClose, (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            this._openFab(false, root);
          });
        }

        if (btnTools && !btnTools.__rcf_ui_events_bound__) {
          btnTools.__rcf_ui_events_bound__ = true;
          this._bindTap(btnTools, (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            this._openFab(false, root);
            this._openTools(true, root);
          });
        }

        if (btnAdmin && !btnAdmin.__rcf_ui_events_bound__) {
          btnAdmin.__rcf_ui_events_bound__ = true;
          this._bindTap(btnAdmin, (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            this._openFab(false, root);
            this._setView("admin");
          });
        }

        if (btnDoctor && !btnDoctor.__rcf_ui_events_bound__) {
          btnDoctor.__rcf_ui_events_bound__ = true;
          this._bindTap(btnDoctor, (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            this._openFab(false, root);
            try { window.RCF_DOCTOR?.run?.(); } catch {}
          });
        }

        if (btnLogs && !btnLogs.__rcf_ui_events_bound__) {
          btnLogs.__rcf_ui_events_bound__ = true;
          this._bindTap(btnLogs, (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            this._openFab(false, root);
            this._setView("logs");
          });
        }

        return true;
      } catch {
        return false;
      }
    },

    bindDashboardShortcuts(root = document) {
      try {
        const entries = [
          ["#btnCreateNewApp", "newapp"],
          ["#btnOpenEditor", "editor"]
        ];

        entries.forEach(([sel, view]) => {
          const el = this._$(sel, root);
          if (!el || el.__rcf_ui_events_bound__) return;
          el.__rcf_ui_events_bound__ = true;

          this._bindTap(el, (ev) => {
            try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
            this._setView(view);
          });
        });

        return true;
      } catch {
        return false;
      }
    },

    bindAll(root = document) {
      try {
        this.bindViewButtons(root);
        this.bindTools(root);
        this.bindFab(root);
        this.bindDashboardShortcuts(root);
        return true;
      } catch {
        return false;
      }
    }
  };

  try {
    window.RCF_UI_EVENTS = API;
  } catch {}
})();

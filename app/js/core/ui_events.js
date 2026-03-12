/* FILE: /app/js/core/ui_events.js
   RControl Factory — UI Events
   - Centraliza binds básicos da interface
   - Compatível com estrutura atual
   - Não substitui toda a lógica do app.js ainda
*/
(() => {
  "use strict";

  function getRouter() {
    try { return window.RCF_UI_ROUTER || null; } catch { return null; }
  }

  function getState() {
    try { return window.RCF_UI_STATE || null; } catch { return null; }
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

    bindViewButtons(root = document) {
      const d = this.d;
      try {
        const buttons = d.$$ ? d.$$("[data-view]", root) : Array.from(root.querySelectorAll("[data-view]"));
        const router = getRouter();

        buttons.forEach(btn => {
          if (btn.__rcf_ui_events_view_bound__) return;
          btn.__rcf_ui_events_view_bound__ = true;

          const handler = () => {
            try {
              const target = btn.getAttribute("data-view");
              if (!target) return;
              if (router?.setView) router.setView(target);
            } catch {}
          };

          if (typeof d.bindTap === "function") d.bindTap(btn, handler);
          else btn.addEventListener("click", handler, { passive: false });
        });

        return true;
      } catch {
        return false;
      }
    },

    bindTools(root = document) {
      const d = this.d;
      const st = getState();

      try {
        const openBtn = (d.$ && d.$("#btnOpenTools", root)) || root.querySelector?.("#btnOpenTools");
        const closeBtn = (d.$ && d.$("#btnCloseTools", root)) || root.querySelector?.("#btnCloseTools");
        const drawer = (d.$ && d.$("#toolsDrawer", root)) || root.querySelector?.("#toolsDrawer");

        if (openBtn && !openBtn.__rcf_ui_events_bound__) {
          openBtn.__rcf_ui_events_bound__ = true;
          const handler = () => {
            try { drawer?.classList.add("open"); } catch {}
            try { st?.set?.("toolsOpen", true); } catch {}
          };
          if (typeof d.bindTap === "function") d.bindTap(openBtn, handler);
          else openBtn.addEventListener("click", handler, { passive: false });
        }

        if (closeBtn && !closeBtn.__rcf_ui_events_bound__) {
          closeBtn.__rcf_ui_events_bound__ = true;
          const handler = () => {
            try { drawer?.classList.remove("open"); } catch {}
            try { st?.set?.("toolsOpen", false); } catch {}
          };
          if (typeof d.bindTap === "function") d.bindTap(closeBtn, handler);
          else closeBtn.addEventListener("click", handler, { passive: false });
        }

        return true;
      } catch {
        return false;
      }
    },

    bindFab(root = document) {
      const d = this.d;
      const st = getState();
      const router = getRouter();

      try {
        const fab = (d.$ && d.$("#rcfFab", root)) || root.querySelector?.("#rcfFab");
        const panel = (d.$ && d.$("#rcfFabPanel", root)) || root.querySelector?.("#rcfFabPanel");
        const btnClose = (d.$ && d.$("#btnFabClose", root)) || root.querySelector?.("#btnFabClose");
        const btnTools = (d.$ && d.$("#btnFabTools", root)) || root.querySelector?.("#btnFabTools");
        const btnAdmin = (d.$ && d.$("#btnFabAdmin", root)) || root.querySelector?.("#btnFabAdmin");
        const btnDoctor = (d.$ && d.$("#btnFabDoctor", root)) || root.querySelector?.("#btnFabDoctor");
        const btnLogs = (d.$ && d.$("#btnFabLogs", root)) || root.querySelector?.("#btnFabLogs");

        if (fab && !fab.__rcf_ui_events_bound__) {
          fab.__rcf_ui_events_bound__ = true;
          const handler = () => {
            try { panel?.classList.toggle("open"); } catch {}
            try {
              const isOpen = !!panel?.classList.contains("open");
              st?.set?.("fabOpen", isOpen);
            } catch {}
          };
          if (typeof d.bindTap === "function") d.bindTap(fab, handler);
          else fab.addEventListener("click", handler, { passive: false });
        }

        if (btnClose && !btnClose.__rcf_ui_events_bound__) {
          btnClose.__rcf_ui_events_bound__ = true;
          const handler = () => {
            try { panel?.classList.remove("open"); } catch {}
            try { st?.set?.("fabOpen", false); } catch {}
          };
          if (typeof d.bindTap === "function") d.bindTap(btnClose, handler);
          else btnClose.addEventListener("click", handler, { passive: false });
        }

        if (btnTools && !btnTools.__rcf_ui_events_bound__) {
          btnTools.__rcf_ui_events_bound__ = true;
          const handler = () => {
            try { panel?.classList.remove("open"); } catch {}
            try { st?.set?.("fabOpen", false); } catch {}
            try {
              const drawer = root.querySelector?.("#toolsDrawer") || document.querySelector("#toolsDrawer");
              drawer?.classList.add("open");
              st?.set?.("toolsOpen", true);
            } catch {}
          };
          if (typeof d.bindTap === "function") d.bindTap(btnTools, handler);
          else btnTools.addEventListener("click", handler, { passive: false });
        }

        if (btnAdmin && !btnAdmin.__rcf_ui_events_bound__) {
          btnAdmin.__rcf_ui_events_bound__ = true;
          const handler = () => {
            try { panel?.classList.remove("open"); } catch {}
            try { st?.set?.("fabOpen", false); } catch {}
            try { router?.setView?.("admin"); } catch {}
          };
          if (typeof d.bindTap === "function") d.bindTap(btnAdmin, handler);
          else btnAdmin.addEventListener("click", handler, { passive: false });
        }

        if (btnDoctor && !btnDoctor.__rcf_ui_events_bound__) {
          btnDoctor.__rcf_ui_events_bound__ = true;
          const handler = () => {
            try { panel?.classList.remove("open"); } catch {}
            try { st?.set?.("fabOpen", false); } catch {}
            try { window.RCF_DOCTOR?.run?.(); } catch {}
          };
          if (typeof d.bindTap === "function") d.bindTap(btnDoctor, handler);
          else btnDoctor.addEventListener("click", handler, { passive: false });
        }

        if (btnLogs && !btnLogs.__rcf_ui_events_bound__) {
          btnLogs.__rcf_ui_events_bound__ = true;
          const handler = () => {
            try { panel?.classList.remove("open"); } catch {}
            try { st?.set?.("fabOpen", false); } catch {}
            try { router?.setView?.("logs"); } catch {}
          };
          if (typeof d.bindTap === "function") d.bindTap(btnLogs, handler);
          else btnLogs.addEventListener("click", handler, { passive: false });
        }

        return true;
      } catch {
        return false;
      }
    },

    bindDashboardShortcuts(root = document) {
      const d = this.d;
      const router = getRouter();

      try {
        const entries = [
          ["#btnCreateNewApp", "newapp"],
          ["#btnOpenEditor", "editor"]
        ];

        entries.forEach(([sel, view]) => {
          const el = (d.$ && d.$(sel, root)) || root.querySelector?.(sel);
          if (!el || el.__rcf_ui_events_bound__) return;
          el.__rcf_ui_events_bound__ = true;

          const handler = () => {
            try { router?.setView?.(view); } catch {}
          };

          if (typeof d.bindTap === "function") d.bindTap(el, handler);
          else el.addEventListener("click", handler, { passive: false });
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

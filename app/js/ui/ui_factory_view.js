/* FILE: /app/js/ui/ui_factory_view.js
   RControl Factory — Factory View Module
   V2.6 FACTORY-AI CHAT HOST ONLY

   FECHADO:
   - Factory AI monta somente na view oficial
   - host da Factory AI fica CHAT-FIRST de verdade
   - remove hero, actions e context antigos da tela
   - mantém apenas o slot oficial factoryai.tools
   - não cai em Admin
   - evita duplicação visual
   - retries curtos e seguros para encaixar o módulo vivo
   - compatível com app.js V8.x
*/

(() => {
  "use strict";

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  const API = {
    __deps: null,
    __mounted: false,
    __mountCount: 0,
    __retryTimers: [],

    init(deps) {
      this.__deps = Object.assign({}, this.__deps || {}, deps || {});
      return this;
    },

    get d() {
      return this.__deps || {};
    },

    log(...args) {
      try {
        const L = this.d.Logger;
        if (L && typeof L.write === "function") {
          L.write("[ui_factory_view]", ...args);
          return;
        }
      } catch {}

      try {
        const LG = window.RCF_LOGGER;
        if (LG && typeof LG.push === "function") {
          LG.push("INFO", ["[ui_factory_view]", ...args].join(" "));
          return;
        }
      } catch {}

      try { console.log("[ui_factory_view]", ...args); } catch {}
    },

    resolveFactoryView() {
      const tries = [
        "#view-factory-ai",
        '[data-rcf-view="factory-ai"]',
        "#rcfFactoryAIView",
        "[data-rcf-factory-ai-view]"
      ];

      for (const sel of tries) {
        const el = qs(sel);
        if (!el) continue;

        const id = String(el.id || el.getAttribute("data-rcf-view") || "").toLowerCase();
        if (!/factory-ai/.test(id) && !/view-factory-ai/.test(id)) continue;

        return el;
      }

      return null;
    },

    ensureHost(viewEl) {
      if (!viewEl) return null;

      let host = qs(':scope > [data-rcf-ui-factory-root="1"]', viewEl);
      if (host) return host;

      host = document.createElement("div");
      host.setAttribute("data-rcf-ui-factory-root", "1");

      viewEl.innerHTML = "";
      viewEl.appendChild(host);

      return host;
    },

    buildView() {
      return `
        <section class="rcfUiSection rcfUiFactorySection" data-rcf-ui="factory-view">
          <div
            class="rcfUiFactoryView rcfUiFactoryViewChatOnly"
            data-rcf-ui-factory-view="1"
            data-rcf-ui-factory-clean="1"
            data-rcf-ui-factory-chat-only="1"
          >
            <div
              id="rcfFactoryAISlotTools"
              data-rcf-slot="factoryai.tools"
              data-rcf-factory-slot="tools"
            ></div>
          </div>
        </section>
      `;
    },

    ensureFactoryAISlots(hostRoot = null) {
      const root =
        hostRoot ||
        qs('[data-rcf-ui-factory-view="1"]') ||
        qs('[data-rcf-ui-factory-root="1"]');

      if (!root) return false;

      let tools = qs("#rcfFactoryAISlotTools", root);

      if (!tools) {
        tools = document.createElement("div");
        tools.id = "rcfFactoryAISlotTools";
        tools.setAttribute("data-rcf-slot", "factoryai.tools");
        tools.setAttribute("data-rcf-factory-slot", "tools");
        root.appendChild(tools);
      }

      return true;
    },

    cleanupWrongContent(hostRoot = null) {
      const root =
        hostRoot ||
        qs('[data-rcf-ui-factory-view="1"]') ||
        qs('[data-rcf-ui-factory-root="1"]');

      if (!root) return false;

      const wrongSelectors = [
        "#rcfFactoryAISlotActions",
        "#rcfFactoryAIQuickActions",
        "#rcfFactoryAIStateMini",
        "#rcfFactoryAppsWidgetsSlot",
        "#rcfFactoryGatewaysSlot",
        "#rcfFactoryProjectsSlot",
        '[data-rcf-slot="factoryai.actions"]',
        '[data-rcf-factory-block="hero"]',
        '[data-rcf-factory-block="factory-ai-actions"]',
        '[data-rcf-factory-block="factory-ai-context"]',
        '[data-rcf-factory-block="apps-widgets"]',
        '[data-rcf-factory-block="gateways"]',
        '[data-rcf-factory-block="projects"]',
        '[data-rcf-ui-factory-fallback]',
        ".rcfActivityList",
        ".rcfUiTabs",
        ".rcfUiProjectsList",
        ".rcfUiProjectItem",
        ".rcfUiCodePanel",
        ".rcfUiListGroup"
      ];

      wrongSelectors.forEach((sel) => {
        qsa(sel, root).forEach((el) => {
          try {
            if (el && el.id === "rcfFactoryAISlotTools") return;
            el.remove();
          } catch {}
        });
      });

      return true;
    },

    ensureChatOnlyHost(hostRoot = null) {
      const root =
        hostRoot ||
        qs('[data-rcf-ui-factory-view="1"]') ||
        qs('[data-rcf-ui-factory-root="1"]');

      if (!root) return false;

      const clean = qs('[data-rcf-ui-factory-chat-only="1"]', root);
      if (!clean) {
        root.innerHTML = this.buildView();
      }

      this.ensureFactoryAISlots(root);
      this.cleanupWrongContent(root);

      return true;
    },

    hasRealIAMount() {
      try {
        const tools = qs("#rcfFactoryAISlotTools");
        const mainBox = qs("#rcfFactoryAIBox");

        if (mainBox) return true;
        if (tools && tools.querySelector("#rcfFactoryAIBox")) return true;
      } catch {}

      return false;
    },

    _clearRetryTimers() {
      try {
        (this.__retryTimers || []).forEach((t) => clearTimeout(t));
      } catch {}
      this.__retryTimers = [];
    },

    requestIAMountWithRetries() {
      this._clearRetryTimers();

      const tryMount = () => {
        let ok = false;

        try {
          this.ensureChatOnlyHost();
        } catch {}

        try {
          if (window.RCF_FACTORY_AI && typeof window.RCF_FACTORY_AI.mount === "function") {
            ok = window.RCF_FACTORY_AI.mount() !== false || ok;
          }
        } catch {}

        try {
          this.cleanupWrongContent();
        } catch {}

        return ok;
      };

      tryMount();

      [120, 420, 900, 1600].forEach((ms) => {
        const id = setTimeout(() => {
          try {
            tryMount();
          } catch {}
        }, ms);
        this.__retryTimers.push(id);
      });

      return true;
    },

    refreshChildren() {
      try { this.requestIAMountWithRetries(); } catch {}
      return true;
    },

    mount(ctx = {}) {
      this.init(ctx);

      try {
        const view = this.resolveFactoryView();
        if (!view) {
          this.log("mount skip: factory-ai view ausente");
          return false;
        }

        const host = this.ensureHost(view);
        if (!host) {
          this.log("mount skip: host ausente");
          return false;
        }

        host.innerHTML = this.buildView();
        view.setAttribute("data-rcf-ui-factory-mounted", "1");
        view.setAttribute("data-rcf-ui-factory-ai-ready", "1");

        this.ensureChatOnlyHost(host);
        this.refreshChildren();

        this.__mounted = true;
        this.__mountCount += 1;

        this.log("mount ok", "count=" + this.__mountCount);
        return true;
      } catch (e) {
        this.log("mount err:", e?.message || e);
        return false;
      }
    },

    render(targetSelector) {
      try {
        if (targetSelector) {
          const el = this.d.$ ? this.d.$(targetSelector) : qs(targetSelector);
          if (!el) return false;

          el.innerHTML = this.buildView();
          el.setAttribute("data-rcf-factory-mounted", "1");

          this.ensureChatOnlyHost(el);
          this.refreshChildren();

          this.__mounted = true;
          return true;
        }
      } catch {}

      return this.mount(this.__deps || {});
    },

    refresh(ctx = {}) {
      this.init(ctx);

      try {
        const view = this.resolveFactoryView();
        const mounted = view && view.getAttribute("data-rcf-ui-factory-mounted") === "1";
        const host = view ? qs('[data-rcf-ui-factory-root="1"]', view) : null;

        if (!mounted || !host) {
          return this.mount(this.__deps || {});
        }

        this.ensureChatOnlyHost(host);
        this.refreshChildren();

        return true;
      } catch (e) {
        this.log("refresh err:", e?.message || e);
        return false;
      }
    }
  };

  try {
    window.RCF_UI_FACTORY_VIEW = API;
  } catch {}

})();

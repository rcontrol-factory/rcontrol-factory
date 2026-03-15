/* FILE: /app/js/ui/ui_factory_view.js
   RControl Factory — Factory View Module
   V2.6 FACTORY-AI OFFICIAL HOST STABLE

   OBJETIVO:
   - manter o tamanho/estrutura visual da tela
   - não encolher a view
   - Factory AI monta somente na view oficial
   - remove blocos duplicados/errados
   - preserva apenas Hero + bloco principal do chat
   - não cai mais em Admin
   - ignora target externo errado
   - mantém retries seguros para encaixar o módulo vivo
   - fallback visual apenas dentro do slot principal
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

    escHtml(v) {
      try {
        if (typeof this.d.escapeHtml === "function") return this.d.escapeHtml(v);
      } catch {}

      return String(v ?? "").replace(/[&<>"]/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
      }[c]));
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

    isOfficialFactoryTarget(el) {
      try {
        if (!el) return false;
        if (el.id === "view-factory-ai") return true;
        if (el.id === "rcfFactoryAIView") return true;
        if (String(el.getAttribute("data-rcf-view") || "").toLowerCase() === "factory-ai") return true;
        if (el.hasAttribute("data-rcf-factory-ai-view")) return true;
        return false;
      } catch {
        return false;
      }
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

    buildHero() {
      return `
        <section class="rcfUiFactoryHero" data-rcf-factory-block="hero">
          <div class="rcfUiFactoryHeroInner">
            <div class="rcfUiFactoryHeroEyebrow">Factory IA</div>
            <h2 class="rcfUiFactoryHeroTitle">Núcleo inteligente da Factory</h2>
            <p class="hint">
              Espaço oficial da IA da Factory para leitura de prompt, análise estrutural,
              proposta de patch, geração guiada e evolução assistida do sistema.
            </p>
          </div>
        </section>
      `;
    },

    buildMainChatBlock() {
      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="factory-ai-main">
          <div class="rcfUiFactoryBlockHead">
            <h2>Factory IA</h2>
            <p class="hint">Chat inteligente, sugestões e análise estrutural</p>
          </div>

          <div id="rcfFactoryAISlotTools" data-rcf-slot="factoryai.tools"></div>
        </section>
      `;
    },

    buildView() {
      return `
        <section class="rcfUiSection rcfUiFactorySection" data-rcf-ui="factory-view">
          <div
            class="rcfUiFactoryView"
            data-rcf-ui-factory-view="1"
            data-rcf-ui-factory-clean="1"
          >
            ${this.buildHero()}
            ${this.buildMainChatBlock()}
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
        const block = qs('[data-rcf-factory-block="factory-ai-main"]', root) || root;
        tools = document.createElement("div");
        tools.id = "rcfFactoryAISlotTools";
        tools.setAttribute("data-rcf-slot", "factoryai.tools");
        block.appendChild(tools);
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
        "#rcfFactoryAppsWidgetsSlot",
        "#rcfFactoryGatewaysSlot",
        "#rcfFactoryProjectsSlot",
        '[data-rcf-slot="factoryai.actions"]',
        '[data-rcf-factory-block="factory-ai-actions"]',
        '[data-rcf-factory-block="factory-ai-context"]',
        '[data-rcf-factory-block="apps-widgets"]',
        '[data-rcf-factory-block="gateways"]',
        '[data-rcf-factory-block="projects"]',
        '[data-rcf-ui-factory-fallback="gateways"]',
        '[data-rcf-factory-ai-fallback="actions"]',
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

    buildToolsFallback() {
      return `
        <div data-rcf-factory-ai-fallback="tools" class="card" style="margin-top:10px">
          <div style="font-weight:800;margin-bottom:6px">Factory AI</div>
          <div class="hint">
            O host oficial foi montado. Falta encaixar o módulo vivo do chat da Factory IA.
          </div>
        </div>
      `;
    },

    ensureVisibleFallbacks() {
      const tools = qs("#rcfFactoryAISlotTools");

      if (tools && !tools.firstElementChild) {
        tools.innerHTML = this.buildToolsFallback();
      }

      return true;
    },

    clearFallbacksIfRealContentMounted() {
      const tools = qs("#rcfFactoryAISlotTools");
      if (!tools) return true;

      const fallback = qs('[data-rcf-factory-ai-fallback="tools"]', tools);
      const mainBox = qs("#rcfFactoryAIBox", tools);

      if (fallback && mainBox) {
        try { fallback.remove(); } catch {}
      }

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
          if (window.RCF_FACTORY_AI && typeof window.RCF_FACTORY_AI.mount === "function") {
            ok = window.RCF_FACTORY_AI.mount() !== false || ok;
          }
        } catch {}

        try { this.clearFallbacksIfRealContentMounted(); } catch {}
        return ok;
      };

      tryMount();

      [120, 420, 900, 1600].forEach((ms) => {
        const id = setTimeout(() => {
          try {
            tryMount();
            if (!this.hasRealIAMount()) this.ensureVisibleFallbacks();
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

        this.ensureFactoryAISlots(host);
        this.cleanupWrongContent(host);
        this.ensureVisibleFallbacks();
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

          if (el && this.isOfficialFactoryTarget(el)) {
            const host = this.ensureHost(el);
            if (!host) return false;

            host.innerHTML = this.buildView();
            el.setAttribute("data-rcf-ui-factory-mounted", "1");
            el.setAttribute("data-rcf-ui-factory-ai-ready", "1");

            this.ensureFactoryAISlots(host);
            this.cleanupWrongContent(host);
            this.ensureVisibleFallbacks();
            this.refreshChildren();

            this.__mounted = true;
            return true;
          }
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

        const cleanRoot = qs('[data-rcf-ui-factory-clean="1"]', host);
        if (!cleanRoot) {
          return this.mount(this.__deps || {});
        }

        this.ensureFactoryAISlots(host);
        this.cleanupWrongContent(host);
        this.ensureVisibleFallbacks();
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

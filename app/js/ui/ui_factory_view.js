/* FILE: /app/js/ui/ui_factory_view.js
   RControl Factory — Factory View Module
   V2.3 FACTORY-AI CLEAN SCREEN
   PATCH MÍNIMO:
   - prioriza Factory AI como view oficial
   - cria slots reais para Factory IA
   - remove blocos errados da Factory geral dentro da tela da IA
   - evita duplicação visual e botões mortos
   - mantém fallback seguro para admin apenas se necessário
   - adiciona init + mount + refresh compatíveis com app.js V8.x
   - resolve host/view automaticamente
   - FIX: não monta mais Apps/Gateways/Projects dentro da Factory AI
   - FIX: chama apenas o módulo de IA
*/

(() => {
  "use strict";

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  const API = {
    __deps: null,
    __mounted: false,
    __mountCount: 0,

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
        "[data-rcf-factory-ai-view]",
        "#view-admin"
      ];

      for (const sel of tries) {
        const el = qs(sel);
        if (!el) continue;

        const id = String(el.id || el.getAttribute("data-rcf-view") || "").toLowerCase();
        if (/agent/.test(id)) continue;

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

    buildActionsSlot() {
      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="factory-ai-actions">
          <div class="rcfUiFactoryBlockHead">
            <h2>Factory IA</h2>
            <p class="hint">Estado, contexto e entrada principal</p>
          </div>
          <div id="rcfFactoryAISlotActions" data-rcf-slot="factoryai.actions"></div>
        </section>
      `;
    },

    buildToolsSlot() {
      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="factory-ai-tools">
          <div class="rcfUiFactoryBlockHead">
            <h2>Chat & Tools</h2>
            <p class="hint">Chat inteligente, sugestões e análise estrutural</p>
          </div>
          <div id="rcfFactoryAISlotTools" data-rcf-slot="factoryai.tools"></div>
        </section>
      `;
    },

    buildContextBlock() {
      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="factory-ai-context">
          <div class="rcfUiFactoryBlockHead">
            <h2>Contexto</h2>
            <p class="hint">Base oficial para evolução futura da IA da Factory</p>
          </div>
          <div class="hint">
            Esta tela é reservada para a Factory IA. Aqui entram o chat, ações inteligentes,
            leitura de contexto, análise estrutural e evolução guiada do sistema.
          </div>
        </section>
      `;
    },

    buildView() {
      return `
        <section class="rcfUiSection rcfUiFactorySection" data-rcf-ui="factory-view">
          <div class="rcfUiFactoryView" data-rcf-ui-factory-view="1" data-rcf-ui-factory-clean="1">
            ${this.buildHero()}
            ${this.buildActionsSlot()}
            ${this.buildToolsSlot()}
            ${this.buildContextBlock()}
          </div>
        </section>
      `;
    },

    ensureFactoryAISlots() {
      const root = qs('[data-rcf-ui-factory-view="1"]') || qs('[data-rcf-ui-factory-root="1"]');
      if (!root) return false;

      let actions = qs("#rcfFactoryAISlotActions", root);
      let tools = qs("#rcfFactoryAISlotTools", root);

      if (!actions) {
        actions = document.createElement("div");
        actions.id = "rcfFactoryAISlotActions";
        actions.setAttribute("data-rcf-slot", "factoryai.actions");
        root.appendChild(actions);
      }

      if (!tools) {
        tools = document.createElement("div");
        tools.id = "rcfFactoryAISlotTools";
        tools.setAttribute("data-rcf-slot", "factoryai.tools");
        root.appendChild(tools);
      }

      return true;
    },

    cleanupWrongContent() {
      const root = qs('[data-rcf-ui-factory-view="1"]');
      if (!root) return false;

      const wrongSelectors = [
        "#rcfFactoryAppsWidgetsSlot",
        "#rcfFactoryGatewaysSlot",
        "#rcfFactoryProjectsSlot",
        '[data-rcf-factory-block="apps-widgets"]',
        '[data-rcf-factory-block="gateways"]',
        '[data-rcf-factory-block="projects"]',
        '[data-rcf-ui-factory-fallback="gateways"]',
        ".rcfActivityList",
        ".rcfUiTabs"
      ];

      wrongSelectors.forEach((sel) => {
        root.querySelectorAll(sel).forEach((el) => {
          try { el.remove(); } catch {}
        });
      });

      return true;
    },

    refreshChildren() {
      try { window.RCF_FACTORY_AI?.mount?.(); } catch {}
      try { window.RCF_ADMIN_AI?.mount?.(); } catch {}
      return true;
    },

    mount(ctx = {}) {
      this.init(ctx);

      try {
        const view = this.resolveFactoryView();
        if (!view) {
          this.log("mount skip: factory-ai/admin view ausente");
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

        this.ensureFactoryAISlots();
        this.cleanupWrongContent();
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

          const alreadyMounted =
            el.getAttribute("data-rcf-factory-mounted") === "1" &&
            qs('[data-rcf-ui-factory-view="1"]', el);

          if (!alreadyMounted) {
            el.innerHTML = this.buildView();
            el.setAttribute("data-rcf-factory-mounted", "1");
          }

          this.ensureFactoryAISlots();
          this.cleanupWrongContent();
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

        const cleanRoot = qs('[data-rcf-ui-factory-clean="1"]', host);
        if (!cleanRoot) {
          return this.mount(this.__deps || {});
        }

        this.ensureFactoryAISlots();
        this.cleanupWrongContent();
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

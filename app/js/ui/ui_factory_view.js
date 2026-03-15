/* FILE: /app/js/ui/ui_factory_view.js
   RControl Factory — Factory View Module
   V2.4 FACTORY-AI OFFICIAL HOST CLOSED

   PATCH FECHADO:
   - Factory AI monta somente na view oficial
   - não cai mais em Admin
   - cria e preserva slots reais da Factory IA
   - remove blocos errados da Factory geral dentro da tela da IA
   - evita duplicação visual e botões mortos
   - chama o módulo de IA com retries curtos e seguros
   - mostra fallback visível nos slots se a IA ainda não entrar
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

    ensureFactoryAISlots(hostRoot = null) {
      const root =
        hostRoot ||
        qs('[data-rcf-ui-factory-view="1"]') ||
        qs('[data-rcf-ui-factory-root="1"]');

      if (!root) return false;

      let actions = qs("#rcfFactoryAISlotActions", root);
      let tools = qs("#rcfFactoryAISlotTools", root);

      if (!actions) {
        const block = qs('[data-rcf-factory-block="factory-ai-actions"]', root) || root;
        actions = document.createElement("div");
        actions.id = "rcfFactoryAISlotActions";
        actions.setAttribute("data-rcf-slot", "factoryai.actions");
        block.appendChild(actions);
      }

      if (!tools) {
        const block = qs('[data-rcf-factory-block="factory-ai-tools"]', root) || root;
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
        qsa(sel, root).forEach((el) => {
          try { el.remove(); } catch {}
        });
      });

      return true;
    },

    buildActionsFallback() {
      return `
        <div data-rcf-factory-ai-fallback="actions" class="card" style="margin-top:10px">
          <div style="font-weight:800;margin-bottom:6px">Ações rápidas</div>
          <div class="hint">A Factory IA ainda está preparando o módulo principal.</div>
        </div>
      `;
    },

    buildToolsFallback() {
      return `
        <div data-rcf-factory-ai-fallback="tools" class="card" style="margin-top:10px">
          <div style="font-weight:800;margin-bottom:6px">Chat em preparação</div>
          <div class="hint">O host oficial foi montado. Falta encaixar o módulo vivo da Factory IA.</div>
        </div>
      `;
    },

    ensureVisibleFallbacks() {
      const actions = qs("#rcfFactoryAISlotActions");
      const tools = qs("#rcfFactoryAISlotTools");

      if (actions && !actions.firstElementChild) {
        actions.innerHTML = this.buildActionsFallback();
      }

      if (tools && !tools.firstElementChild) {
        tools.innerHTML = this.buildToolsFallback();
      }

      return true;
    },

    clearFallbacksIfRealContentMounted() {
      const actions = qs("#rcfFactoryAISlotActions");
      const tools = qs("#rcfFactoryAISlotTools");

      if (actions) {
        const fallback = qs('[data-rcf-factory-ai-fallback="actions"]', actions);
        if (fallback && actions.children.length > 1) {
          try { fallback.remove(); } catch {}
        }
      }

      if (tools) {
        const fallback = qs('[data-rcf-factory-ai-fallback="tools"]', tools);
        if (fallback && tools.children.length > 1) {
          try { fallback.remove(); } catch {}
        }
      }

      return true;
    },

    hasRealIAMount() {
      try {
        const tools = qs("#rcfFactoryAISlotTools");
        const actions = qs("#rcfFactoryAISlotActions");
        const mainBox = qs("#rcfFactoryAIBox");
        const quickBox = qs("#rcfFactoryAIQuickActions");

        if (mainBox) return true;
        if (quickBox) return true;
        if (tools && tools.querySelector("#rcfFactoryAIBox")) return true;
        if (actions && actions.querySelector("#rcfFactoryAIQuickActions")) return true;
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

        try {
          if (!ok && window.RCF_ADMIN_AI && typeof window.RCF_ADMIN_AI.mount === "function") {
            ok = window.RCF_ADMIN_AI.mount() !== false || ok;
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
          if (!el) return false;

          const alreadyMounted =
            el.getAttribute("data-rcf-factory-mounted") === "1" &&
            qs('[data-rcf-ui-factory-view="1"]', el);

          if (!alreadyMounted) {
            el.innerHTML = this.buildView();
            el.setAttribute("data-rcf-factory-mounted", "1");
          }

          this.ensureFactoryAISlots(el);
          this.cleanupWrongContent(el);
          this.ensureVisibleFallbacks();
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

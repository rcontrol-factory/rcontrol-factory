/* FILE: /app/js/ui/ui_factory_view.js
   RControl Factory — Factory View Module
   V2.1 SAFE MOUNT
   PATCH MÍNIMO:
   - remove Dashboard da composição da Factory
   - mantém Factory focada em módulos/sistema/integrações/projetos
   - preserva fallback seguro
   - evita duplicação visual da Home dentro da Factory
   - adiciona init + mount + refresh compatíveis com app.js V8.1.1
   - resolve host/view automaticamente
   - FIX: não monta mais dentro do Agent
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
        "#view-factory",
        '[data-rcf-view="factory"]',
        "#rcfFactoryView",
        "[data-rcf-factory-view]"
      ];

      for (const sel of tries) {
        const el = qs(sel);
        if (el) return el;
      }

      return null;
    },

    ensureHost(viewEl) {
      if (!viewEl) return null;

      let host = qs('[data-rcf-ui-factory-root="1"]', viewEl);
      if (host) return host;

      host = document.createElement("div");
      host.setAttribute("data-rcf-ui-factory-root", "1");

      viewEl.innerHTML = "";
      viewEl.appendChild(host);

      return host;
    },

    buildAppsWidgetsSlot() {
      const cfg = window.RCF_UI_CONFIG;
      const title =
        cfg?.get?.("sections.appsWidgets.title", "Apps & Widgets") ??
        "Apps & Widgets";
      const subtitle =
        cfg?.get?.("sections.appsWidgets.subtitle", "Módulos e integrações da Factory") ??
        "Módulos e integrações da Factory";

      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="apps-widgets">
          <div class="rcfUiFactoryBlockHead">
            <h2>${this.escHtml(title)}</h2>
            <p class="hint">${this.escHtml(subtitle)}</p>
          </div>
          <div id="rcfFactoryAppsWidgetsSlot"></div>
        </section>
      `;
    },

    buildGatewaysSlot() {
      const cfg = window.RCF_UI_CONFIG;
      const title =
        cfg?.get?.("sections.gateways.title", "APIs & Gateways") ??
        "APIs & Gateways";
      const subtitle =
        cfg?.get?.("sections.gateways.subtitle", "Conexões, mensagens e integrações") ??
        "Conexões, mensagens e integrações";

      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="gateways">
          <div class="rcfUiFactoryBlockHead">
            <h2>${this.escHtml(title)}</h2>
            <p class="hint">${this.escHtml(subtitle)}</p>
          </div>
          <div id="rcfFactoryGatewaysSlot"></div>
        </section>
      `;
    },

    buildProjectsSlot() {
      const cfg = window.RCF_UI_CONFIG;
      const title =
        cfg?.get?.("sections.projects.title", "Projects") ??
        "Projects";
      const subtitle =
        cfg?.get?.("sections.projects.subtitle", "Projetos, código e deploy") ??
        "Projetos, código e deploy";

      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="projects">
          <div class="rcfUiFactoryBlockHead">
            <h2>${this.escHtml(title)}</h2>
            <p class="hint">${this.escHtml(subtitle)}</p>
          </div>
          <div id="rcfFactoryProjectsSlot"></div>
        </section>
      `;
    },

    buildFallbackGateways() {
      return `
        <div class="rcfDashPanel rcfDashPanelWide" data-rcf-ui-factory-fallback="gateways">
          <h3>APIs & Gateways</h3>
          <p class="hint">Conexões, mensagens e integrações</p>

          <div class="rcfActivityList">
            <div class="rcfActivityItem">
              <strong>Messages</strong><br>
              Mensageria e eventos
            </div>

            <div class="rcfActivityItem">
              <strong>Webhooks</strong><br>
              Integrações e disparos
            </div>

            <div class="rcfActivityItem">
              <strong>Gateway</strong><br>
              Conector modular da Factory
            </div>
          </div>
        </div>
      `;
    },

    buildView() {
      return `
        <section class="rcfUiSection rcfUiFactorySection" data-rcf-ui="factory-view">
          <div class="rcfUiFactoryView" data-rcf-ui-factory-view="1">
            ${this.buildAppsWidgetsSlot()}
            ${this.buildGatewaysSlot()}
            ${this.buildProjectsSlot()}
          </div>
        </section>
      `;
    },

    renderAppsWidgets() {
      try {
        if (window.RCF_UI_APPS_WIDGETS && typeof window.RCF_UI_APPS_WIDGETS.render === "function") {
          return !!window.RCF_UI_APPS_WIDGETS.render("#rcfFactoryAppsWidgetsSlot");
        }
      } catch {}
      return false;
    },

    renderGateways() {
      try {
        const slot = qs("#rcfFactoryGatewaysSlot");
        if (!slot) return false;

        if (window.RCF_UI_GATEWAYS && typeof window.RCF_UI_GATEWAYS.render === "function") {
          return !!window.RCF_UI_GATEWAYS.render("#rcfFactoryGatewaysSlot");
        }

        slot.innerHTML = this.buildFallbackGateways();
        return true;
      } catch {
        return false;
      }
    },

    renderProjects() {
      try {
        if (window.RCF_UI_PROJECTS && typeof window.RCF_UI_PROJECTS.render === "function") {
          return !!window.RCF_UI_PROJECTS.render("#rcfFactoryProjectsSlot");
        }
      } catch {}
      return false;
    },

    refreshChildren() {
      try { window.RCF_UI_APPS_WIDGETS?.refresh?.(); } catch {}
      try { window.RCF_UI_PROJECTS?.refresh?.(); } catch {}
      try { window.RCF_UI_GATEWAYS?.refresh?.(); } catch {}
      return true;
    },

    mount(ctx = {}) {
      this.init(ctx);

      try {
        const view = this.resolveFactoryView();
        if (!view) {
          this.log("mount skip: factory view ausente");
          return false;
        }

        const host = this.ensureHost(view);
        if (!host) {
          this.log("mount skip: host ausente");
          return false;
        }

        host.innerHTML = this.buildView();
        view.setAttribute("data-rcf-ui-factory-mounted", "1");

        this.renderAppsWidgets();
        this.renderGateways();
        this.renderProjects();
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

          this.renderAppsWidgets();
          this.renderGateways();
          this.renderProjects();
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

        this.renderAppsWidgets();
        this.renderGateways();
        this.renderProjects();
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

/* FILE: /app/js/ui/ui_factory_view.js
   RControl Factory — Factory View Module
   PATCH MÍNIMO:
   - remove Dashboard da composição da Factory
   - mantém Factory focada em módulos/sistema/integrações/projetos
   - preserva fallback seguro
   - evita duplicação visual da Home dentro da Factory
*/

(() => {
  "use strict";

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
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
            <h2>${title}</h2>
            <p class="hint">${subtitle}</p>
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
            <h2>${title}</h2>
            <p class="hint">${subtitle}</p>
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
            <h2>${title}</h2>
            <p class="hint">${subtitle}</p>
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
              <strong>Mensagens</strong><br>
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
        <div class="rcfUiFactoryView" data-rcf-ui="factory-view">
          ${this.buildAppsWidgetsSlot()}
          ${this.buildGatewaysSlot()}
          ${this.buildProjectsSlot()}
        </div>
      `;
    },

    renderAppsWidgets() {
      try {
        if (window.RCF_UI_APPS_WIDGETS?.render) {
          return !!window.RCF_UI_APPS_WIDGETS.render("#rcfFactoryAppsWidgetsSlot");
        }
      } catch {}
      return false;
    },

    renderGateways() {
      try {
        const slot = qs("#rcfFactoryGatewaysSlot");
        if (!slot) return false;

        if (window.RCF_UI_GATEWAYS?.render) {
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
        if (window.RCF_UI_PROJECTS?.render) {
          return !!window.RCF_UI_PROJECTS.render("#rcfFactoryProjectsSlot");
        }
      } catch {}
      return false;
    },

    refreshChildren() {
      try { window.RCF_UI_APPS_WIDGETS?.refresh?.(); } catch {}
      try { window.RCF_UI_PROJECTS?.refresh?.(); } catch {}
      return true;
    },

    render(targetSelector) {
      const d = this.d;

      try {
        const el = d.$ ? d.$(targetSelector) : qs(targetSelector);
        if (!el) return false;

        const alreadyMounted =
          el.getAttribute("data-rcf-factory-mounted") === "1" &&
          qs(".rcfUiFactoryView", el);

        if (!alreadyMounted) {
          el.innerHTML = this.buildView();
          el.setAttribute("data-rcf-factory-mounted", "1");
        }

        this.renderAppsWidgets();
        this.renderGateways();
        this.renderProjects();
        this.refreshChildren();

        return true;
      } catch {
        return false;
      }
    },

    refresh() {
      try {
        this.renderAppsWidgets();
        this.renderGateways();
        this.renderProjects();
        this.refreshChildren();
        return true;
      } catch {
        return false;
      }
    }
  };

  try {
    window.RCF_UI_FACTORY_VIEW = API;
  } catch {}

})();

/* FILE: /app/js/ui/ui_factory_view.js
   RControl Factory — Factory View Module
   - Composição principal da Factory UI
   - Agora monta dashboard, apps/widgets e projects reais
   - Mantém fallback seguro
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

    buildDashboardSlot() {
      const cfg = window.RCF_UI_CONFIG;
      const title = cfg?.get?.("sections.dashboard.title", "Dashboard") ?? "Dashboard";
      const subtitle = cfg?.get?.("sections.dashboard.subtitle", "Visão principal da Factory") ?? "Visão principal da Factory";

      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="dashboard">
          <div class="rcfUiFactoryBlockHead">
            <h2>${title}</h2>
            <p class="hint">${subtitle}</p>
          </div>
          <div id="rcfFactoryDashboardSlot"></div>
        </section>
      `;
    },

    buildAppsWidgetsSlot() {
      const cfg = window.RCF_UI_CONFIG;
      const title = cfg?.get?.("sections.appsWidgets.title", "Apps & Widgets") ?? "Apps & Widgets";
      const subtitle = cfg?.get?.("sections.appsWidgets.subtitle", "Módulos e integrações da Factory") ?? "Módulos e integrações da Factory";

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

    buildProjectsSlot() {
      const cfg = window.RCF_UI_CONFIG;
      const title = cfg?.get?.("sections.projects.title", "Projects") ?? "Projects";
      const subtitle = cfg?.get?.("sections.projects.subtitle", "Projetos, código e deploy") ?? "Projetos, código e deploy";

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

    buildView() {
      return `
        <div class="rcfUiFactoryView" data-rcf-ui="factory-view">
          ${this.buildDashboardSlot()}
          ${this.buildAppsWidgetsSlot()}
          ${this.buildProjectsSlot()}
        </div>
      `;
    },

    renderDashboard() {
      try {
        if (window.RCF_UI_DASHBOARD?.render) {
          return !!window.RCF_UI_DASHBOARD.render("#rcfFactoryDashboardSlot");
        }
      } catch {}
      return false;
    },

    renderAppsWidgets() {
      try {
        if (window.RCF_UI_APPS_WIDGETS?.render) {
          return !!window.RCF_UI_APPS_WIDGETS.render("#rcfFactoryAppsWidgetsSlot");
        }
      } catch {}
      return false;
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
      try { window.RCF_UI_DASHBOARD?.refresh?.(); } catch {}
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

        this.renderDashboard();
        this.renderAppsWidgets();
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

/* FILE: /app/js/ui/ui_factory_view.js
   RControl Factory — Factory View Module
   Estrutura inicial da composição principal da Factory UI
*/

(() => {
  "use strict";

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
      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="dashboard">
          <div class="rcfUiFactoryBlockHead">
            <h2>Dashboard</h2>
            <p class="hint">Visão principal da Factory</p>
          </div>
          <div id="rcfFactoryDashboardSlot"></div>
        </section>
      `;
    },

    buildAppsWidgetsSlot() {
      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="apps-widgets">
          <div class="rcfUiFactoryBlockHead">
            <h2>Apps & Widgets</h2>
            <p class="hint">Módulos e integrações da Factory</p>
          </div>
          <div id="rcfFactoryAppsWidgetsSlot"></div>
        </section>
      `;
    },

    buildProjectsSlot() {
      return `
        <section class="rcfUiFactoryBlock" data-rcf-factory-block="projects">
          <div class="rcfUiFactoryBlockHead">
            <h2>Projects</h2>
            <p class="hint">Projetos, código e deploy</p>
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

    render(targetSelector) {
      const d = this.d;

      try {
        const el = d.$ ? d.$(targetSelector) : null;
        if (!el) return false;

        el.innerHTML = this.buildView();

        try {
          window.RCF_UI_DASHBOARD?.render?.("#rcfFactoryDashboardSlot");
        } catch {}

        try {
          if (window.RCF_UI_APPS_WIDGETS?.render) {
            window.RCF_UI_APPS_WIDGETS.render("#rcfFactoryAppsWidgetsSlot");
          }
        } catch {}

        try {
          if (window.RCF_UI_PROJECTS?.render) {
            window.RCF_UI_PROJECTS.render("#rcfFactoryProjectsSlot");
          }
        } catch {}

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

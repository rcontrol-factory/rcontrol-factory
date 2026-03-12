/* FILE: /app/js/ui/ui_dashboard.js
   RControl Factory — UI Dashboard
   - Montagem visual do dashboard novo
   - Usa tokens + cards
   - Não interfere no core crítico
*/
(() => {
  "use strict";

  const API = {
    mounted: false,

    mount() {
      try {
        const tokens = window.RCF_UI_TOKENS;
        const cards = window.RCF_UI_CARDS;
        if (!tokens || !cards) return false;

        this.mountMenu(tokens, cards);
        this.mountAppsWidgets(tokens, cards);
        this.mountProjects(tokens, cards);

        this.mounted = true;
        return true;
      } catch {
        return false;
      }
    },

    mountMenu(tokens, cards) {
      const host = document.querySelector(".rcfMobileModules");
      if (!host) return false;

      host.innerHTML = tokens.dashboardMenu.map((item) => cards.menuCard(item)).join("");

      host.querySelectorAll("[data-view]").forEach((btn) => {
        if (btn.__rcf_ui_dashboard_bound__) return;
        btn.__rcf_ui_dashboard_bound__ = true;

        btn.addEventListener("click", () => {
          try { window.RCF?.setView?.(btn.getAttribute("data-view")); } catch {}
        }, { passive: true });
      });

      return true;
    },

    mountAppsWidgets(tokens, cards) {
      const dashPanels = document.querySelector(".rcfDashPanels");
      if (!dashPanels) return false;

      let panel = document.querySelector("#rcfUiAppsWidgetsPanel");
      if (!panel) {
        panel = document.createElement("section");
        panel.className = "rcfDashPanel";
        panel.id = "rcfUiAppsWidgetsPanel";
        dashPanels.appendChild(panel);
      }

      panel.innerHTML = `
        <h2>${tokens.sections.appsWidgets.title}</h2>
        <p class="hint">${tokens.sections.appsWidgets.subtitle}</p>

        <div class="rcfUiListGroup">
          ${tokens.appsWidgets.map((item) => cards.listCard(item)).join("")}
        </div>

        <div class="rcfUiSectionDivider">
          <span>APIs & Gateways</span>
        </div>

        <div class="rcfUiListGroup">
          ${tokens.gateways.map((item) => cards.listCard(item)).join("")}
        </div>
      `;

      return true;
    },

    mountProjects(tokens, cards) {
      const dashPanels = document.querySelector(".rcfDashPanels");
      if (!dashPanels) return false;

      let panel = document.querySelector("#rcfUiProjectsPanel");
      if (!panel) {
        panel = document.createElement("section");
        panel.className = "rcfDashPanel";
        panel.id = "rcfUiProjectsPanel";
        dashPanels.appendChild(panel);
      }

      panel.innerHTML = `
        <div class="rcfUiProjectsHead">
          <h2>${tokens.sections.projects.title}</h2>
          <div class="rcfUiTabs" aria-label="Projects Tabs">
            <button class="rcfUiTab is-active" type="button">Projects</button>
            <button class="rcfUiTab" type="button">Código</button>
          </div>
        </div>

        <div class="rcfUiCodePanel">
          <pre>${tokens.codePreview}</pre>
        </div>

        <div class="rcfUiProjectsList">
          ${tokens.projects.map((item) => cards.projectCard(item)).join("")}
        </div>
      `;

      return true;
    },

    remountLater() {
      try {
        setTimeout(() => { this.mount(); }, 60);
        setTimeout(() => { this.mount(); }, 220);
        setTimeout(() => { this.mount(); }, 600);
      } catch {}
    }
  };

  try {
    window.RCF_UI_DASHBOARD = API;
  } catch {}

  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { API.remountLater(); } catch {}
    }, { passive: true });
  } catch {}

  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { API.remountLater(); } catch {}
    });
  } catch {}
})();

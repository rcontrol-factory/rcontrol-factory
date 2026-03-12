/* FILE: /app/js/ui/ui_apps_widgets.js
   RControl Factory — Apps & Widgets Module
   Estrutura inicial da seção Apps & Widgets
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

    getItems() {
      return {
        apps: [
          { key: "app_store", title: "App Store", description: "Biblioteca interna de apps", icon: "◈" },
          { key: "chat_ai", title: "Chat IA", description: "Assistente e automação", icon: "✦" },
          { key: "site_builder", title: "Site Builder", description: "Criação visual de páginas", icon: "▣" }
        ],
        gateways: [
          { key: "messages", title: "Messages", description: "Mensageria e eventos", icon: "◉" },
          { key: "webhooks", title: "Webhooks", description: "Integrações e disparos", icon: "↗" },
          { key: "gateway_extra", title: "Gateway", description: "Conector modular da Factory", icon: "◎" }
        ]
      };
    },

    buildSection() {
      const d = this.d;
      const cards = window.RCF_UI_CARDS;
      const data = this.getItems();

      const buildList = (items = []) => {
        return items.map(item => {
          if (cards && typeof cards.buildListItem === "function") {
            return cards.buildListItem({
              title: item.title,
              description: item.description,
              icon: item.icon
            });
          }

          return `
            <div class="rcfUiListItem">
              <div class="rcfUiListItemIcon" aria-hidden="true">${d.escapeHtml ? d.escapeHtml(item.icon) : item.icon}</div>
              <div class="rcfUiListItemBody">
                <div class="rcfUiListItemTitle">${d.escapeHtml ? d.escapeHtml(item.title) : item.title}</div>
                <div class="rcfUiListItemDesc">${d.escapeHtml ? d.escapeHtml(item.description) : item.description}</div>
              </div>
              <div class="rcfUiListItemActions">
                <span class="rcfUiCardArrow" aria-hidden="true">›</span>
              </div>
            </div>
          `;
        }).join("");
      };

      return `
        <section class="rcfUiSection rcfUiAppsWidgetsSection" data-rcf-ui="apps-widgets">
          <div class="rcfUiSectionBlock">
            <div class="rcfUiSectionHead">
              <h2>Apps & Widgets</h2>
              <p class="hint">Componentes principais da Factory</p>
            </div>
            <div class="rcfUiSectionList">
              ${buildList(data.apps)}
            </div>
          </div>

          <div class="rcfUiSectionBlock">
            <div class="rcfUiSectionHead">
              <h2>APIs & Gateways</h2>
              <p class="hint">Conexões, mensagens e integrações</p>
            </div>
            <div class="rcfUiSectionList">
              ${buildList(data.gateways)}
            </div>
          </div>
        </section>
      `;
    },

    render(targetSelector) {
      const d = this.d;
      try {
        const el = d.$ ? d.$(targetSelector) : null;
        if (!el) return false;
        el.innerHTML = this.buildSection();
        return true;
      } catch {
        return false;
      }
    }
  };

  try {
    window.RCF_UI_APPS_WIDGETS = API;
  } catch {}
})();

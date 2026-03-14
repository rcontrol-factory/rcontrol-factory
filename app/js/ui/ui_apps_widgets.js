/* FILE: /app/js/ui/ui_apps_widgets.js
   RControl Factory — Apps & Widgets Module
   PATCH MÍNIMO:
   - mantém somente Apps & Widgets
   - remove APIs & Gateways deste módulo
   - separa Factory AI de Agent
   - adiciona navegação via data-view quando aplicável
   - preserva estrutura estável
   - FIX: Factory AI usa fallback seguro para admin se view factory não existir
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

    escHtml(v) {
      try {
        if (this.d.escapeHtml) return this.d.escapeHtml(v);
      } catch {}
      return String(v ?? "");
    },

    escAttr(v) {
      try {
        if (this.d.escapeAttr) return this.d.escapeAttr(v);
      } catch {}
      return String(v ?? "");
    },

    hasView(view) {
      const v = String(view || "").trim();
      if (!v) return false;

      const tries = [
        `#view-${v}`,
        `[data-rcf-view="${v}"]`,
        `[data-view="${v}"]`
      ];

      for (const sel of tries) {
        if (qs(sel)) return true;
      }

      return false;
    },

    resolveView(item) {
      const raw = String(item?.view || "").trim();
      if (!raw) return "";

      if (raw === "factory") {
        if (this.hasView("factory")) return "factory";
        return "admin";
      }

      return raw;
    },

    goToView(view) {
      const target = String(view || "").trim();
      if (!target) return false;

      try {
        if (window.RCF && typeof window.RCF.setView === "function") {
          window.RCF.setView(target);
          return true;
        }
      } catch {}

      try {
        document.dispatchEvent(new CustomEvent("rcf:view", {
          detail: { view: target }
        }));
        return true;
      } catch {}

      return false;
    },

    getItems() {
      return [
        {
          key: "app_store",
          title: "App Store",
          description: "Biblioteca interna de apps",
          icon: "◈",
          view: "newapp"
        },
        {
          key: "factory_ai",
          title: "Factory AI",
          description: "IA da Factory e automação do núcleo",
          icon: "✦",
          view: "factory"
        },
        {
          key: "site_builder",
          title: "Site Builder",
          description: "Criação visual de páginas",
          icon: "▣",
          view: "editor"
        }
      ];
    },

    buildList(items = []) {
      const cards = window.RCF_UI_CARDS;

      return items.map(item => {
        const resolvedView = this.resolveView(item);

        if (cards && typeof cards.buildListItem === "function") {
          return cards.buildListItem({
            title: item.title,
            description: item.description,
            icon: item.icon,
            className: item.key ? `rcfItem-${item.key}` : "",
            actionAttr: resolvedView ? `data-view="${this.escAttr(resolvedView)}"` : "",
            actionLabel: resolvedView ? "Abrir" : ""
          });
        }

        return `
          <div class="rcfUiListItem ${item.key ? this.escAttr(`rcfItem-${item.key}`) : ""}">
            <div class="rcfUiListItemIcon" aria-hidden="true">${this.escHtml(item.icon)}</div>

            <div class="rcfUiListItemBody">
              <div class="rcfUiListItemTitle">${this.escHtml(item.title)}</div>
              <div class="rcfUiListItemDesc">${this.escHtml(item.description)}</div>
            </div>

            <div class="rcfUiListItemActions">
              ${
                resolvedView
                  ? `<button class="btn small ghost" type="button" data-view="${this.escAttr(resolvedView)}">Abrir</button>`
                  : `<span class="rcfUiCardArrow" aria-hidden="true">›</span>`
              }
            </div>
          </div>
        `;
      }).join("");
    },

    buildSection() {
      const items = this.getItems();

      return `
        <section class="rcfUiSection rcfUiAppsWidgetsSection" data-rcf-ui="apps-widgets">

          <div class="rcfUiSectionBlock">

            <div class="rcfUiSectionHead">
              <h2>Apps & Widgets</h2>
              <p class="hint">Componentes principais da Factory</p>
            </div>

            <div class="rcfUiSectionList">
              ${this.buildList(items)}
            </div>

          </div>

        </section>
      `;
    },

    bindNav(host) {
      try {
        const cards = window.RCF_UI_CARDS;
        if (cards && typeof cards.bindNav === "function") {
          cards.bindNav(host);
        }
      } catch {}

      try {
        const nodes = Array.from(host.querySelectorAll("[data-view]"));
        nodes.forEach(node => {
          if (node.__rcf_nav_bound__) return;
          node.__rcf_nav_bound__ = true;

          node.addEventListener("click", () => {
            const view = node.getAttribute("data-view");
            if (!view) return;
            this.goToView(view);
          }, { passive: true });
        });

        return true;
      } catch {
        return false;
      }
    },

    render(targetSelector) {
      try {
        const el =
          this.d.$
            ? this.d.$(targetSelector)
            : qs(targetSelector);

        if (!el) return false;

        el.innerHTML = this.buildSection();
        this.bindNav(el);

        return true;
      } catch {
        return false;
      }
    },

    refresh() {
      try {
        const section = document.querySelector('[data-rcf-ui="apps-widgets"]');
        if (!section) return false;

        this.bindNav(section);
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

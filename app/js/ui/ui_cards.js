/* FILE: /app/js/ui/ui_cards.js
   RControl Factory — Cards Module
   Estrutura base para cards e list items da UI
   PATCH MÍNIMO:
   - mantém builders originais
   - reforça escaping
   - bind seguro para data-view e data-rcf-action
   - evita duplo bind
   - permite cards reutilizáveis sem acoplar regra da Home aqui
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
      return String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },

    escAttr(v) {
      try {
        if (this.d.escapeAttr) return this.d.escapeAttr(v);
      } catch {}
      return String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    },

    safeView(view) {
      return String(view || "")
        .trim()
        .replace(/[^a-z0-9_-]/gi, "");
    },

    goToView(view) {
      const clean = this.safeView(view);
      if (!clean) return false;

      try {
        if (window.RCF && typeof window.RCF.setView === "function") {
          window.RCF.setView(clean);
          return true;
        }
      } catch {}

      try {
        document.dispatchEvent(new CustomEvent("rcf:view", {
          detail: { view: clean }
        }));
        return true;
      } catch {}

      return false;
    },

    runAction(action, el = null) {
      const act = String(action || "").trim().toLowerCase();
      if (!act) return false;

      try {
        switch (act) {
          case "newapp":
          case "new-app":
          case "create-app":
            return this.goToView("newapp");

          case "editor":
            return this.goToView("editor");

          case "agent":
          case "factory-ai":
          case "ai":
            return this.goToView("agent");

          case "factory":
            return this.goToView("factory");

          case "admin":
            return this.goToView("admin");

          case "logs":
            return this.goToView("logs");

          case "diagnostics":
          case "diag":
            return this.goToView("diagnostics");

          case "settings":
            return this.goToView("settings");

          case "dashboard":
          case "home":
            return this.goToView("dashboard");

          default:
            break;
        }
      } catch {}

      try {
        document.dispatchEvent(new CustomEvent("rcf:action", {
          detail: { action: act, el: el || null }
        }));
        return true;
      } catch {}

      return false;
    },

    /* =========================================
       BUILD MAIN CARD
    ========================================= */
    buildMainCard(opts = {}) {
      const title = String(opts.title || "").trim();
      const subtitle = String(opts.subtitle || "").trim();
      const icon = String(opts.icon || "").trim();
      const view = this.safeView(opts.view || "");
      const action = String(opts.action || "").trim();
      const extraClass = String(opts.className || "").trim();
      const cardAttrs = String(opts.attrs || "").trim();

      return `
        <button
          class="rcfUiCard rcfUiCardMain ${this.escAttr(extraClass)}"
          type="button"
          ${view ? `data-view="${this.escAttr(view)}"` : ""}
          ${action ? `data-rcf-action="${this.escAttr(action)}"` : ""}
          ${cardAttrs}
        >
          <span class="rcfUiCardIcon" aria-hidden="true">${this.escHtml(icon)}</span>
          <span class="rcfUiCardBody">
            <span class="rcfUiCardTitle">${this.escHtml(title)}</span>
            <span class="rcfUiCardSubtitle">${this.escHtml(subtitle)}</span>
          </span>
          <span class="rcfUiCardArrow" aria-hidden="true">›</span>
        </button>
      `;
    },

    /* =========================================
       BUILD LIST ITEM
    ========================================= */
    buildListItem(opts = {}) {
      const title = String(opts.title || "").trim();
      const description = String(opts.description || "").trim();
      const icon = String(opts.icon || "").trim();
      const actionLabel = String(opts.actionLabel || "").trim();
      const actionAttr = String(opts.actionAttr || "").trim();
      const action = String(opts.action || "").trim();
      const view = this.safeView(opts.view || "");
      const extraClass = String(opts.className || "").trim();

      return `
        <div
          class="rcfUiListItem ${this.escAttr(extraClass)}"
          ${view ? `data-view="${this.escAttr(view)}"` : ""}
          ${action ? `data-rcf-action="${this.escAttr(action)}"` : ""}
        >
          <div class="rcfUiListItemIcon" aria-hidden="true">${this.escHtml(icon)}</div>

          <div class="rcfUiListItemBody">
            <div class="rcfUiListItemTitle">${this.escHtml(title)}</div>
            <div class="rcfUiListItemDesc">${this.escHtml(description)}</div>
          </div>

          <div class="rcfUiListItemActions">
            ${
              actionLabel
                ? `<button class="btn small ghost" type="button" ${actionAttr}>${this.escHtml(actionLabel)}</button>`
                : `<span class="rcfUiCardArrow" aria-hidden="true">›</span>`
            }
          </div>
        </div>
      `;
    },

    /* =========================================
       BIND NAVIGATION / ACTIONS
    ========================================= */
    bindNav(host) {
      try {
        const items = Array.from(host.querySelectorAll("[data-view], [data-rcf-action]"));

        items.forEach(card => {
          if (card.__rcf_nav__) return;
          card.__rcf_nav__ = true;

          card.addEventListener("click", (ev) => {
            try {
              const actionBtn = ev.target && ev.target.closest
                ? ev.target.closest("[data-rcf-action]")
                : null;

              const node = actionBtn || card;
              const action = node.getAttribute("data-rcf-action");
              const view = node.getAttribute("data-view");

              if (action) {
                this.runAction(action, node);
                return;
              }

              if (view) {
                this.goToView(view);
              }
            } catch {}
          }, { passive: true });
        });

      } catch {}
    },

    /* =========================================
       RENDER INTO TARGET
    ========================================= */
    render(targetSelector, html) {
      try {
        const el = this.d.$
          ? this.d.$(targetSelector)
          : qs(targetSelector);

        if (!el) return false;

        el.innerHTML = String(html || "");
        this.bindNav(el);

        return true;
      } catch {
        return false;
      }
    }
  };

  try {
    window.RCF_UI_CARDS = API;
  } catch {}

})();

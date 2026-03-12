/* FILE: /app/js/ui/ui_cards.js
   RControl Factory — Cards Module
   Estrutura inicial para cards e list items da UI
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

    /* =========================================
       BUILD MAIN CARD
    ========================================= */
    buildMainCard(opts = {}) {
      const d = this.d;

      const title = String(opts.title || "").trim();
      const subtitle = String(opts.subtitle || "").trim();
      const icon = String(opts.icon || "").trim();
      const view = String(opts.view || "").trim();
      const extraClass = String(opts.className || "").trim();

      return `
        <button
          class="rcfUiCard rcfUiCardMain ${d.escapeAttr ? d.escapeAttr(extraClass) : extraClass}"
          type="button"
          ${view ? `data-view="${d.escapeAttr ? d.escapeAttr(view) : view}"` : ""}
        >
          <span class="rcfUiCardIcon" aria-hidden="true">${d.escapeHtml ? d.escapeHtml(icon) : icon}</span>
          <span class="rcfUiCardBody">
            <span class="rcfUiCardTitle">${d.escapeHtml ? d.escapeHtml(title) : title}</span>
            <span class="rcfUiCardSubtitle">${d.escapeHtml ? d.escapeHtml(subtitle) : subtitle}</span>
          </span>
          <span class="rcfUiCardArrow" aria-hidden="true">›</span>
        </button>
      `;
    },

    /* =========================================
       BUILD LIST ITEM
    ========================================= */
    buildListItem(opts = {}) {
      const d = this.d;

      const title = String(opts.title || "").trim();
      const description = String(opts.description || "").trim();
      const icon = String(opts.icon || "").trim();
      const actionLabel = String(opts.actionLabel || "").trim();
      const actionAttr = String(opts.actionAttr || "").trim();
      const extraClass = String(opts.className || "").trim();

      return `
        <div class="rcfUiListItem ${d.escapeAttr ? d.escapeAttr(extraClass) : extraClass}">
          <div class="rcfUiListItemIcon" aria-hidden="true">${d.escapeHtml ? d.escapeHtml(icon) : icon}</div>
          <div class="rcfUiListItemBody">
            <div class="rcfUiListItemTitle">${d.escapeHtml ? d.escapeHtml(title) : title}</div>
            <div class="rcfUiListItemDesc">${d.escapeHtml ? d.escapeHtml(description) : description}</div>
          </div>
          <div class="rcfUiListItemActions">
            ${
              actionLabel
                ? `<button class="btn small ghost" type="button" ${actionAttr}>${d.escapeHtml ? d.escapeHtml(actionLabel) : actionLabel}</button>`
                : `<span class="rcfUiCardArrow" aria-hidden="true">›</span>`
            }
          </div>
        </div>
      `;
    },

    /* =========================================
       RENDER INTO TARGET
    ========================================= */
    render(targetSelector, html) {
      const d = this.d;
      try {
        const el = d.$ ? d.$(targetSelector) : null;
        if (!el) return false;
        el.innerHTML = String(html || "");
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

/* FILE: /app/js/ui/ui_cards.js
   RControl Factory — Cards Module
   Estrutura inicial para cards e list items da UI
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

    escHtml(v){
      try{
        if(this.d.escapeHtml) return this.d.escapeHtml(v);
      }catch{}
      return String(v ?? "");
    },

    escAttr(v){
      try{
        if(this.d.escapeAttr) return this.d.escapeAttr(v);
      }catch{}
      return String(v ?? "");
    },

    /* =========================================
       BUILD MAIN CARD
    ========================================= */
    buildMainCard(opts = {}) {

      const title = String(opts.title || "").trim();
      const subtitle = String(opts.subtitle || "").trim();
      const icon = String(opts.icon || "").trim();
      const view = String(opts.view || "").trim();
      const extraClass = String(opts.className || "").trim();

      return `
        <button
          class="rcfUiCard rcfUiCardMain ${this.escAttr(extraClass)}"
          type="button"
          ${view ? `data-view="${this.escAttr(view)}"` : ""}
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
      const extraClass = String(opts.className || "").trim();

      return `
        <div class="rcfUiListItem ${this.escAttr(extraClass)}">
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
       BIND NAVIGATION
    ========================================= */

    bindNav(host){

      try{

        const cards =
          Array.from(host.querySelectorAll("[data-view]"));

        cards.forEach(card => {

          if(card.__rcf_nav__) return;
          card.__rcf_nav__ = true;

          card.addEventListener("click", () => {

            const view = card.getAttribute("data-view");
            if(!view) return;

            try{
              window.RCF?.setView?.(view);
            }catch{}

          }, { passive:true });

        });

      }catch{}

    },

    /* =========================================
       RENDER INTO TARGET
    ========================================= */

    render(targetSelector, html) {

      try {

        const el =
          this.d.$
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

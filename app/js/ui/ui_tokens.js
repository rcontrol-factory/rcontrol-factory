/* FILE: /app/js/ui/ui_tokens.js
   RControl Factory — UI Tokens Module
   Tokens leves para composição e padronização da UI
*/

(() => {
  "use strict";

  const TOKENS = {
    classes: {
      factoryView: "rcfUiFactoryView",
      factoryBlock: "rcfUiFactoryBlock",
      section: "rcfUiSection",
      tabs: "rcfUiTabs",
      tab: "rcfUiTab",
      codePanel: "rcfUiCodePanel",
      codeBlock: "rcfUiCodeBlock",
      cardMain: "rcfUiCard rcfUiCardMain",
      listItem: "rcfUiListItem",
      listItemIcon: "rcfUiListItemIcon",
      listItemBody: "rcfUiListItemBody",
      listItemTitle: "rcfUiListItemTitle",
      listItemDesc: "rcfUiListItemDesc",
      listItemActions: "rcfUiListItemActions"
    },

    attrs: {
      nav: "data-nav",
      view: "data-view",
      tab: "data-tab",
      ui: "data-rcf-ui"
    },

    states: {
      active: "active",
      open: "open",
      hidden: "hidden"
    },

    icons: {
      arrow: "›",
      dashboard: "◈",
      apps: "▣",
      agent: "✦",
      messages: "◉",
      webhook: "↗",
      project: "◆",
      gateway: "◎"
    }
  };

  const API = {
    getAll() {
      return TOKENS;
    },

    get(path, fallback = null) {
      try {
        const parts = String(path || "").split(".").filter(Boolean);
        let ref = TOKENS;

        for (const part of parts) {
          if (ref && typeof ref === "object" && part in ref) {
            ref = ref[part];
          } else {
            return fallback;
          }
        }

        return ref;
      } catch {
        return fallback;
      }
    }
  };

  try {
    window.RCF_UI_TOKENS = API;
  } catch {}
})();

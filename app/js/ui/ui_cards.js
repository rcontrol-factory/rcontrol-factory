/* FILE: /app/js/ui/ui_cards.js
   RControl Factory — UI Cards
   - Componentes visuais reutilizáveis
   - Sem dependência do core crítico
*/
(() => {
  "use strict";

  function esc(v) {
    return String(v ?? "").replace(/[&<>"]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;"
    }[c]));
  }

  function renderIcon(iconKey) {
    const cls = `rcfUiIcon rcfUiIcon--${esc(iconKey || "dashboard")}`;
    return `<span class="${cls}" aria-hidden="true"></span>`;
  }

  function menuCard(item = {}) {
    return `
      <button class="rcfUiCard rcfUiCard--menu" type="button"
        data-rcf-ui-card="menu"
        data-key="${esc(item.key)}"
        data-view="${esc(item.view || "")}">
        <span class="rcfUiCard__iconWrap">
          ${renderIcon(item.icon)}
        </span>
        <span class="rcfUiCard__body">
          <span class="rcfUiCard__title">${esc(item.title)}</span>
          <span class="rcfUiCard__subtitle">${esc(item.subtitle)}</span>
        </span>
        <span class="rcfUiCard__arrow" aria-hidden="true">›</span>
      </button>
    `.trim();
  }

  function listCard(item = {}) {
    return `
      <div class="rcfUiCard rcfUiCard--list"
        data-rcf-ui-card="list"
        data-key="${esc(item.key)}">
        <span class="rcfUiCard__iconWrap">
          ${renderIcon(item.icon)}
        </span>
        <span class="rcfUiCard__body">
          <span class="rcfUiCard__title">${esc(item.title)}</span>
          <span class="rcfUiCard__subtitle">${esc(item.subtitle)}</span>
        </span>
        <span class="rcfUiCard__arrow" aria-hidden="true">›</span>
      </div>
    `.trim();
  }

  function projectCard(item = {}) {
    return `
      <div class="rcfUiProjectItem" data-rcf-ui-project="${esc(item.key)}">
        <div class="rcfUiProjectItem__left">
          <span class="rcfUiProjectItem__dot" aria-hidden="true"></span>
          <div class="rcfUiProjectItem__meta">
            <div class="rcfUiProjectItem__title">${esc(item.title)}</div>
            <div class="rcfUiProjectItem__subtitle">${esc(item.subtitle)}</div>
          </div>
        </div>
        <div class="rcfUiProjectItem__actions">
          <button class="btn small ghost" type="button">Abrir</button>
        </div>
      </div>
    `.trim();
  }

  try {
    window.RCF_UI_CARDS = {
      menuCard,
      listCard,
      projectCard
    };
  } catch {}
})();

/* FILE: /app/js/ui/ui_views.js
   RControl Factory — UI Views enhancer
   - Compatível com a nova arquitetura modular
   - Mantém fallback leve
   - Evita reinjeções duplicadas
   - Não quebra fluxo antigo
*/
(() => {
  "use strict";

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;"
    }[c]));
  }

  function callSafe(obj, fn, ...args) {
    try {
      if (!obj || typeof obj[fn] !== "function") return null;
      return obj[fn](...args);
    } catch {
      return null;
    }
  }

  function hasNewFactoryMounted() {
    return !!qs("#rcfFactoryUiRoot [data-rcf-ui='factory-view'], #rcfFactoryUiRoot .rcfUiFactoryView");
  }

  function makeMenuCard(iconClass, title, subtitle, view) {
    return `
      <button class="rcfUiCard rcfUiCard--menu" type="button" data-rcf-nav-view="${escapeHtml(view)}">
        <span class="rcfUiCard__iconWrap">
          <span class="rcfUiIcon ${escapeHtml(iconClass)}"></span>
        </span>
        <span class="rcfUiCard__body">
          <span class="rcfUiCard__title">${escapeHtml(title)}</span>
          <span class="rcfUiCard__subtitle">${escapeHtml(subtitle)}</span>
        </span>
        <span class="rcfUiCard__arrow">›</span>
      </button>
    `;
  }

  function makeListCard(iconClass, title, subtitle) {
    return `
      <div class="rcfUiCard rcfUiCard--list">
        <span class="rcfUiCard__iconWrap">
          <span class="rcfUiIcon ${escapeHtml(iconClass)}"></span>
        </span>
        <span class="rcfUiCard__body">
          <span class="rcfUiCard__title">${escapeHtml(title)}</span>
          <span class="rcfUiCard__subtitle">${escapeHtml(subtitle)}</span>
        </span>
        <span class="rcfUiCard__arrow">›</span>
      </div>
    `;
  }

  function bindNavCards(host) {
    qsa("[data-rcf-nav-view]", host).forEach(btn => {
      if (btn.__rcf_nav_bound__) return;
      btn.__rcf_nav_bound__ = true;

      btn.addEventListener("click", () => {
        try { window.RCF?.setView?.(btn.getAttribute("data-rcf-nav-view")); } catch {}
      }, { passive: true });
    });
  }

  function ensureDashboardCardsFallback() {
    const host = qs("#appsList");
    if (!host) return false;

    // se a Factory nova já montou, não força o fallback antigo
    if (hasNewFactoryMounted()) {
      host.setAttribute("data-rcf-ui-enhanced", "factory-view");
      return true;
    }

    if (host.getAttribute("data-rcf-ui-enhanced") === "1") {
      bindNavCards(host);
      return true;
    }

    // se runtime novo souber renderizar lista real, não sobrescreve
    try {
      const rt = window.RCF_UI_RUNTIME;
      if (rt && typeof rt.renderAppsList === "function") {
        rt.renderAppsList();
        host.setAttribute("data-rcf-ui-enhanced", "runtime");
        return true;
      }
    } catch {}

    host.innerHTML = [
      makeMenuCard("rcfUiIcon--dashboard", "Dashboard", "Visão central da Factory", "dashboard"),
      makeMenuCard("rcfUiIcon--apps", "Apps", "Criar e organizar aplicativos", "newapp"),
      makeMenuCard("rcfUiIcon--editor", "Editor", "Arquivos, estrutura e ajustes", "editor"),
      makeMenuCard("rcfUiIcon--agent", "Agent", "Automação e IA operacional", "agent"),
      makeMenuCard("rcfUiIcon--factory", "Factory", "Sistema, sync e ferramentas", "admin")
    ].join("");

    host.setAttribute("data-rcf-ui-enhanced", "1");
    bindNavCards(host);
    return true;
  }

  function ensureAgentCardsFallback() {
    const view = qs("#view-agent");
    if (!view) return false;

    // se a nova Factory view estiver ativa no dashboard, não precisamos poluir outras views
    if (hasNewFactoryMounted()) return true;

    if (qs('[data-rcf-ui-agent-block="1"]', view)) return true;

    const ref = qs("#agentOut", view);
    if (!ref || !ref.parentNode) return false;

    const block = document.createElement("section");
    block.setAttribute("data-rcf-ui-agent-block", "1");
    block.innerHTML = `
      <div class="rcfUiSectionDivider">Apps & Widgets</div>
      <div class="rcfUiListGroup">
        ${makeListCard("rcfUiIcon--apps", "App Store", "Base de apps e módulos visuais")}
        ${makeListCard("rcfUiIcon--agent", "Chat IA", "Comandos naturais e assistência")}
        ${makeListCard("rcfUiIcon--editor", "Site Builder", "Estrutura visual e páginas")}
      </div>

      <div class="rcfUiSectionDivider">APIs & Gateways</div>
      <div class="rcfUiListGroup">
        ${makeListCard("rcfUiIcon--dashboard", "Messages", "Eventos, filas e saídas")}
        ${makeListCard("rcfUiIcon--factory", "Webhooks", "Integrações externas e gatilhos")}
        ${makeListCard("rcfUiIcon--apps", "Endpoints", "Conexões modulares da Factory")}
      </div>
    `;

    ref.parentNode.insertBefore(block, ref);
    return true;
  }

  function ensureProjectsPanelFallback() {
    const view = qs("#view-editor");
    if (!view) return false;

    // se a nova Factory view está montada, evita duplicar painel visual antigo
    if (hasNewFactoryMounted()) return true;

    if (qs('[data-rcf-ui-projects-block="1"]', view)) return true;

    const ref = qs("#editorOut", view);
    if (!ref || !ref.parentNode) return false;

    const block = document.createElement("section");
    block.setAttribute("data-rcf-ui-projects-block", "1");
    block.innerHTML = `
      <div class="rcfUiProjectsHead">
        <div class="rcfUiTabs">
          <button class="rcfUiTab is-active" type="button">Projects</button>
          <button class="rcfUiTab" type="button">Código</button>
        </div>
      </div>

      <div class="rcfUiCodePanel">
        <pre>var AUTO_TRIGGER = true;
var WAIT_TIME = "1h";

startFactoryDeploy();</pre>
      </div>

      <div class="rcfUiProjectsList">
        <div class="rcfUiProjectItem">
          <div class="rcfUiProjectItem__left">
            <span class="rcfUiProjectItem__dot"></span>
            <div class="rcfUiProjectItem__meta">
              <div class="rcfUiProjectItem__title">Painel Central</div>
              <div class="rcfUiProjectItem__subtitle">Controle principal da operação</div>
            </div>
          </div>
          <div class="rcfUiProjectItem__actions">
            <button class="btn small" type="button">Abrir</button>
          </div>
        </div>

        <div class="rcfUiProjectItem">
          <div class="rcfUiProjectItem__left">
            <span class="rcfUiProjectItem__dot"></span>
            <div class="rcfUiProjectItem__meta">
              <div class="rcfUiProjectItem__title">Chat IA</div>
              <div class="rcfUiProjectItem__subtitle">Assistente interno da Factory</div>
            </div>
          </div>
          <div class="rcfUiProjectItem__actions">
            <button class="btn small" type="button">Abrir</button>
          </div>
        </div>

        <div class="rcfUiProjectItem">
          <div class="rcfUiProjectItem__left">
            <span class="rcfUiProjectItem__dot"></span>
            <div class="rcfUiProjectItem__meta">
              <div class="rcfUiProjectItem__title">App Booking</div>
              <div class="rcfUiProjectItem__subtitle">Fluxo de app com agenda e deploy</div>
            </div>
          </div>
          <div class="rcfUiProjectItem__actions">
            <button class="btn small" type="button">Abrir</button>
          </div>
        </div>
      </div>
    `;

    ref.parentNode.insertBefore(block, ref);
    return true;
  }

  function syncProjectsWithCodePanel() {
    try {
      const panelMod = window.RCF_UI_CODE_PANEL;
      const projectsMod = window.RCF_UI_PROJECTS;

      if (!panelMod || !projectsMod) return false;
      if (!hasNewFactoryMounted()) return false;

      const host = qs("#rcfFactoryProjectsSlot");
      if (!host) return false;

      const codeHost = qs("[data-rcf-projects-code-slot]", host);
      if (!codeHost) return false;

      callSafe(panelMod, "render", "[data-rcf-projects-code-slot]");
      return true;
    } catch {
      return false;
    }
  }

  const API = {
    __mounted: false,

    mount() {
      try {
        // nova arquitetura primeiro
        if (hasNewFactoryMounted()) {
          syncProjectsWithCodePanel();
          this.__mounted = true;
          return true;
        }

        // fallbacks antigos
        ensureDashboardCardsFallback();
        ensureAgentCardsFallback();
        ensureProjectsPanelFallback();

        this.__mounted = true;
        return true;
      } catch {
        return false;
      }
    }
  };

  try { window.RCF_UI_VIEWS = API; } catch {}

  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { API.mount(); } catch {}
    }, { passive: true });
  } catch {}

  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { API.mount(); } catch {}
    });
  } catch {}

})();

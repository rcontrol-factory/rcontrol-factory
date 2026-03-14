/* FILE: /app/js/ui/ui_views.js
   RControl Factory — UI Views enhancer
   - Compatível com a nova arquitetura modular
   - Mantém fallback leve
   - Evita reinjeções duplicadas
   - Não quebra fluxo antigo
   - PATCH: corrige mapeamento dos cards principais
   - PATCH: separa Admin de Factory AI
   - PATCH: evita sobrescrever #appsList do dashboard novo
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
    return !!qs(
      "#rcfFactoryUiRoot, #rcfRoot .rcfMobileModules, #rcfRoot .rcfBottomNav, [data-rcf-ui-dashboard-root='1'], [data-rcf-ui-factory-root='1']"
    );
  }

  function hasDashboardSafeMounted() {
    return !!qs('[data-rcf-ui-dashboard-root="1"], #view-dashboard [data-rcf-ui="dashboard-section"]');
  }

  function makeMenuCard(iconClass, title, subtitle, view, extraAttrs = "") {
    return `
      <button class="rcfUiCard rcfUiCard--menu" type="button" data-rcf-nav-view="${escapeHtml(view)}" ${extraAttrs}>
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

  function openFactoryAI() {
    try {
      if (window.RCF_FACTORY_IA && typeof window.RCF_FACTORY_IA.open === "function") {
        window.RCF_FACTORY_IA.open();
        return true;
      }
    } catch {}

    try {
      document.dispatchEvent(new CustomEvent("rcf:factory-ai", {
        detail: { source: "ui_views", target: "factoryai" }
      }));
      return true;
    } catch {}

    return false;
  }

  function navTo(view) {
    const v = String(view || "").trim().toLowerCase();

    if (v === "factoryai") {
      if (openFactoryAI()) return true;

      try {
        if (window.RCF && typeof window.RCF.setView === "function") {
          window.RCF.setView("admin");
          return true;
        }
      } catch {}

      try {
        document.dispatchEvent(new CustomEvent("rcf:view", {
          detail: { view: "admin", source: "factoryai-fallback" }
        }));
        return true;
      } catch {}

      return false;
    }

    try {
      if (window.RCF && typeof window.RCF.setView === "function") {
        window.RCF.setView(v);
        return true;
      }
    } catch {}

    try {
      document.dispatchEvent(new CustomEvent("rcf:view", { detail: { view: v } }));
      return true;
    } catch {}

    return false;
  }

  function bindNavCards(host) {
    qsa("[data-rcf-nav-view]", host).forEach(btn => {
      if (btn.__rcf_nav_bound__) return;
      btn.__rcf_nav_bound__ = true;

      btn.addEventListener("click", () => {
        navTo(btn.getAttribute("data-rcf-nav-view"));
      }, { passive: true });
    });
  }

  function bindShellMobileCards(root = document) {
    qsa(".rcfMobileModuleCard[data-view]", root).forEach(btn => {
      if (btn.__rcf_mobile_nav_bound__) return;
      btn.__rcf_mobile_nav_bound__ = true;

      btn.addEventListener("click", () => {
        navTo(btn.getAttribute("data-view"));
      }, { passive: true });
    });

    qsa(".rcfBottomNav .tab[data-view]", root).forEach(btn => {
      if (btn.__rcf_bottom_nav_bound__) return;
      btn.__rcf_bottom_nav_bound__ = true;

      btn.addEventListener("click", () => {
        navTo(btn.getAttribute("data-view"));
      }, { passive: true });
    });
  }

  function buildDashboardCards() {
    return [
      makeMenuCard("rcfUiIcon--dashboard", "Dashboard", "Visão central da Factory", "dashboard"),
      makeMenuCard("rcfUiIcon--apps", "Apps", "Criar e organizar aplicativos", "newapp"),
      makeMenuCard("rcfUiIcon--editor", "Editor", "Arquivos, estrutura e ajustes", "editor"),
      makeMenuCard("rcfUiIcon--agent", "Agent", "Automação e comandos operacionais", "agent"),
      makeMenuCard("rcfUiIcon--generator", "Generator", "Testes, execução e validação", "generator"),
      makeMenuCard("rcfUiIcon--factory", "Admin", "Sistema, injector e manutenção", "admin"),
      makeMenuCard("rcfUiIcon--factoryai", "Factory AI", "IA interna do núcleo da Factory", "factoryai")
    ].join("");
  }

  function ensureDashboardCardsFallback() {
    if (hasNewFactoryMounted() || hasDashboardSafeMounted()) {
      bindShellMobileCards(document);
      return true;
    }

    const view = qs("#view-dashboard");
    if (!view) return false;

    let host = qs('[data-rcf-ui-dashboard-fallback-menu="1"]', view);

    if (!host) {
      const appsList = qs("#appsList", view);

      if (appsList && appsList.closest('[data-rcf-ui="dashboard-section"]')) {
        return true;
      }

      host = document.createElement("div");
      host.setAttribute("data-rcf-ui-dashboard-fallback-menu", "1");
      host.className = "rcfUiDashboardFallbackMenu";

      if (appsList && appsList.parentNode) {
        appsList.parentNode.insertBefore(host, appsList);
      } else {
        view.appendChild(host);
      }
    }

    if (host.getAttribute("data-rcf-ui-enhanced") === "1") {
      bindNavCards(host);
      return true;
    }

    host.innerHTML = buildDashboardCards();
    host.setAttribute("data-rcf-ui-enhanced", "1");
    bindNavCards(host);
    return true;
  }

  function ensureAgentCardsFallback() {
    const view = qs("#view-agent");
    if (!view) return false;

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
        ${makeListCard("rcfUiIcon--factoryai", "Factory AI", "IA interna e automação do núcleo")}
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
              <div class="rcfUiProjectItem__title">Factory AI</div>
              <div class="rcfUiProjectItem__subtitle">IA interna da Factory</div>
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
        if (hasNewFactoryMounted()) {
          bindShellMobileCards(document);
          syncProjectsWithCodePanel();
          this.__mounted = true;
          return true;
        }

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

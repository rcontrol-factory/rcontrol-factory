/* FILE: /app/js/ui/ui_views.js
   RControl Factory — UI Views enhancer
   V2.2 SAFE NAV MAP
   - Compatível com a arquitetura modular atual
   - Mantém fallback leve
   - Evita reinjeções duplicadas
   - Corrige mapeamento dos cards/top nav/bottom nav
   - Separa Admin de Factory AI
   - Normaliza views legadas: factory/system -> admin
   - Mantém Factory AI como ação própria
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

  function normalizeViewName(raw) {
    const v = String(raw || "").trim().toLowerCase();

    if (!v) return "";

    if (v === "home") return "dashboard";
    if (v === "dashboard") return "dashboard";

    if (v === "apps") return "newapp";
    if (v === "newapp") return "newapp";
    if (v === "new-app") return "newapp";
    if (v === "new app") return "newapp";

    if (v === "editor") return "editor";
    if (v === "agent") return "agent";
    if (v === "generator") return "generator";

    if (v === "factory") return "admin";
    if (v === "system") return "admin";
    if (v === "admin") return "admin";

    if (v === "factoryai") return "factoryai";
    if (v === "factory-ai") return "factoryai";
    if (v === "factory ai") return "factoryai";

    if (v === "logs") return "logs";
    if (v === "settings") return "settings";
    if (v === "diagnostics") return "diagnostics";
    if (v === "diag") return "diagnostics";
    if (v === "doctor") return "diagnostics";

    return v;
  }

  function hasNewFactoryMounted() {
    return !!qs("#rcfFactoryUiRoot, #rcfRoot .rcfMobileModules, #rcfRoot .rcfBottomNav");
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

    try {
      document.dispatchEvent(new CustomEvent("RCF:FACTORY_AI", {
        detail: { source: "ui_views", target: "factoryai" }
      }));
      return true;
    } catch {}

    return false;
  }

  function navTo(view) {
    const v = normalizeViewName(view);

    if (!v) return false;

    if (v === "factoryai") {
      if (openFactoryAI()) return true;

      try {
        if (window.RCF && typeof window.RCF.setView === "function") {
          window.RCF.setView("agent");
          return true;
        }
      } catch {}

      try {
        document.dispatchEvent(new CustomEvent("rcf:view", {
          detail: { view: "agent", source: "factoryai-fallback" }
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

  function normalizeNodeView(node) {
    if (!node || typeof node.getAttribute !== "function") return "";
    const raw = node.getAttribute("data-view") || node.getAttribute("data-rcf-nav-view") || "";
    const norm = normalizeViewName(raw);

    try {
      if (norm && raw !== norm && node.hasAttribute("data-view")) node.setAttribute("data-view", norm);
    } catch {}

    try {
      if (norm && raw !== norm && node.hasAttribute("data-rcf-nav-view")) node.setAttribute("data-rcf-nav-view", norm);
    } catch {}

    return norm;
  }

  function relabelBottomNav(root = document) {
    const map = {
      dashboard: "Home",
      newapp: "Apps",
      editor: "Editor",
      agent: "Agent",
      generator: "Generator",
      admin: "Admin",
      logs: "Logs"
    };

    qsa(".rcfBottomNav .tab[data-view]", root).forEach(tab => {
      const norm = normalizeNodeView(tab);
      if (!norm) return;

      const label = map[norm];
      if (!label) return;

      try { tab.textContent = label; } catch {}
    });
  }

  function relabelTopNav(root = document) {
    const map = {
      dashboard: "Dashboard",
      newapp: "New App",
      editor: "Editor",
      agent: "Agent",
      generator: "Generator",
      admin: "Admin",
      logs: "Logs",
      settings: "Settings",
      diagnostics: "Diagnostics"
    };

    qsa("#rcfRoot [data-view]", root).forEach(btn => {
      if (btn.closest(".rcfBottomNav")) return;
      if (btn.classList.contains("rcfMobileModuleCard")) return;

      const norm = normalizeNodeView(btn);
      if (!norm) return;

      const label = map[norm];
      if (!label) return;

      const txt = (btn.textContent || "").trim().toLowerCase();
      const isSimplePill =
        txt === "factory" ||
        txt === "system" ||
        txt === "dashboard" ||
        txt === "editor" ||
        txt === "agent" ||
        txt === "logs" ||
        txt === "new app" ||
        txt === "apps" ||
        txt === "generator" ||
        txt === "admin";

      if (!isSimplePill) return;

      try { btn.textContent = label; } catch {}
    });
  }

  function relabelLegacyHeroButtons(root = document) {
    const buttons = qsa("#rcfRoot button", root);

    buttons.forEach(btn => {
      const txt = String(btn.textContent || "").trim().toLowerCase();

      if (txt === "factory") {
        const norm = normalizeNodeView(btn);
        if (norm === "admin") {
          try { btn.textContent = "Admin"; } catch {}
        }
      }

      if (txt === "system") {
        try {
          btn.setAttribute("data-view", "admin");
          btn.textContent = "Admin";
        } catch {}
      }
    });
  }

  function bindNavCards(host) {
    qsa("[data-rcf-nav-view]", host).forEach(btn => {
      if (btn.__rcf_nav_bound__) return;
      btn.__rcf_nav_bound__ = true;

      normalizeNodeView(btn);

      btn.addEventListener("click", () => {
        navTo(btn.getAttribute("data-rcf-nav-view"));
      }, { passive: true });
    });
  }

  function bindShellMobileCards(root = document) {
    qsa(".rcfMobileModuleCard[data-view]", root).forEach(btn => {
      if (btn.__rcf_mobile_nav_bound__) return;
      btn.__rcf_mobile_nav_bound__ = true;

      normalizeNodeView(btn);

      btn.addEventListener("click", () => {
        navTo(btn.getAttribute("data-view"));
      }, { passive: true });
    });

    qsa(".rcfBottomNav .tab[data-view]", root).forEach(btn => {
      if (btn.__rcf_bottom_nav_bound__) return;
      btn.__rcf_bottom_nav_bound__ = true;

      normalizeNodeView(btn);

      btn.addEventListener("click", () => {
        navTo(btn.getAttribute("data-view"));
      }, { passive: true });
    });

    relabelBottomNav(root);
    relabelTopNav(root);
    relabelLegacyHeroButtons(root);
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
    const host = qs("#appsList");
    if (!host) return false;

    if (hasNewFactoryMounted()) {
      host.setAttribute("data-rcf-ui-enhanced", "factory-view");
      bindShellMobileCards(document);
      return true;
    }

    if (host.getAttribute("data-rcf-ui-enhanced") === "1") {
      bindNavCards(host);
      return true;
    }

    try {
      const rt = window.RCF_UI_RUNTIME;
      if (rt && typeof rt.renderAppsList === "function") {
        rt.renderAppsList();
      }
    } catch {}

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

  function normalizeLegacyButtons(root = document) {
    qsa("#rcfRoot [data-view], #rcfRoot [data-rcf-nav-view]", root).forEach(node => {
      normalizeNodeView(node);
    });
  }

  const API = {
    __mounted: false,

    init() {
      return this;
    },

    mount() {
      try {
        normalizeLegacyButtons(document);

        if (hasNewFactoryMounted()) {
          bindShellMobileCards(document);
          syncProjectsWithCodePanel();
          this.__mounted = true;
          return true;
        }

        ensureDashboardCardsFallback();
        ensureAgentCardsFallback();
        ensureProjectsPanelFallback();
        relabelBottomNav(document);
        relabelTopNav(document);
        relabelLegacyHeroButtons(document);

        this.__mounted = true;
        return true;
      } catch {
        return false;
      }
    },

    refresh() {
      try {
        normalizeLegacyButtons(document);
        bindShellMobileCards(document);
        relabelBottomNav(document);
        relabelTopNav(document);
        relabelLegacyHeroButtons(document);
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

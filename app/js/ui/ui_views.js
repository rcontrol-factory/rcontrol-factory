/* FILE: /app/js/ui/ui_views.js
   RControl Factory — UI Views
   V3.0 SAFE SINGLE-VIEW ISOLATION
   - Isola uma view por vez de forma real
   - Esconde legado visual fora da Home
   - Remove vazamento de Tools/legacy shell nas views internas
   - Corrige bottom nav: Home / Agent IA / Opportunity / Settings / Factory AI
   - Mantém Generator separado de Opportunity Scan
   - Factory AI fica como view própria
   - Admin continua separado
   - Compatível com Safari / iPhone / PWA
*/
(() => {
  "use strict";

  const VIEW_MAP = {
    home: "dashboard",
    dashboard: "dashboard",

    apps: "newapp",
    newapp: "newapp",
    "new-app": "newapp",
    "new app": "newapp",

    editor: "editor",

    agent: "agent",
    "agent-ia": "agent-ia",
    agentia: "agent-ia",
    "agent ia": "agent-ia",
    "agent-ai": "agent-ia",

    opportunity: "opportunity-scan",
    "opportunity-scan": "opportunity-scan",
    opportunityscan: "opportunity-scan",
    scan: "opportunity-scan",

    generator: "generator",

    settings: "settings",

    factory: "admin",
    system: "admin",
    admin: "admin",

    factoryai: "factory-ai",
    "factory-ai": "factory-ai",
    "factory ai": "factory-ai",

    logs: "logs",
    diagnostics: "diagnostics",
    diag: "diagnostics",
    doctor: "diagnostics"
  };

  const ALL_VIEWS = [
    "dashboard",
    "newapp",
    "editor",
    "agent",
    "agent-ia",
    "opportunity-scan",
    "generator",
    "settings",
    "factory-ai",
    "admin",
    "logs",
    "diagnostics"
  ];

  const BOTTOM_NAV_ITEMS = [
    { view: "dashboard", label: "Home" },
    { view: "agent-ia", label: "Agent IA" },
    { view: "opportunity-scan", label: "Opportunity" },
    { view: "settings", label: "Settings" },
    { view: "factory-ai", label: "Factory AI" }
  ];

  const MOD = {
    _ctx: null,
    _mounted: false,
    _styleId: "rcfUiViewsStyleV30",
    _globalBound: false,

    init(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureViewsExist();
      this._ensureBottomNav();
      this._bindGlobal();
      return true;
    },

    mount(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureViewsExist();
      this._ensureBottomNav();
      this._syncInitialState();
      this._mounted = true;
      return true;
    },

    remountSoft(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureViewsExist();
      this._ensureBottomNav();
      this._syncInitialState();
      return true;
    },

    refresh(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureViewsExist();
      this._ensureBottomNav();
      this._syncInitialState();
      return true;
    },

    normalizeViewName(name) {
      const raw = String(name || "").trim().toLowerCase();
      return VIEW_MAP[raw] || raw || "dashboard";
    },

    setView(name, opts = {}) {
      const next = this.normalizeViewName(name || "dashboard");
      if (!next) return false;

      const state = this._getState();
      const prev = this.normalizeViewName(state?.active?.view || "dashboard");

      if (prev === "generator" && next !== "generator") {
        try {
          if (opts && typeof opts.teardownPreviewHard === "function") {
            opts.teardownPreviewHard();
          } else if (this._ctx && typeof this._ctx.teardownPreviewHard === "function") {
            this._ctx.teardownPreviewHard();
          }
        } catch {}
      }

      this._hideAllViews();
      this._cleanupLegacyBleed(next);

      const target = this._getViewEl(next);
      if (target) {
        target.hidden = false;
        target.style.display = "";
        target.classList.add("active");
        target.setAttribute("data-rcf-visible", "1");
      }

      try {
        if (state) {
          state.active = state.active || {};
          state.active.view = next;
        }
      } catch {}

      this._markActiveButtons(next);
      this._markBottomNav(next);
      this._markDashboardMode(next);
      this._syncShellVisibility(next);
      this._syncSpecialModules(next);

      try {
        if (opts && typeof opts.saveAll === "function") opts.saveAll("ui_views.setView");
        else if (this._ctx && typeof this._ctx.saveAll === "function") this._ctx.saveAll("ui_views.setView");
      } catch {}

      return true;
    },

    show(name, opts = {}) {
      return this.setView(name, opts);
    },

    _syncInitialState() {
      const state = this._getState();
      const wanted = this.normalizeViewName(state?.active?.view || "dashboard");
      this.setView(wanted);
    },

    _getState() {
      return (this._ctx && this._ctx.State) || (window.RCF && window.RCF.state) || null;
    },

    _getRoot() {
      return document.querySelector("#rcfRoot") || document.querySelector("#app") || document.body;
    },

    _getViewsRoot() {
      return document.querySelector("#views") || this._getRoot();
    },

    _getViewEl(view) {
      return document.getElementById(`view-${view}`);
    },

    _hideAllViews() {
      ALL_VIEWS.forEach((view) => {
        const el = this._getViewEl(view);
        if (!el) return;
        el.classList.remove("active");
        el.hidden = true;
        el.style.display = "none";
        el.removeAttribute("data-rcf-visible");
        el.setAttribute("aria-hidden", "true");
      });
    },

    _ensureViewsExist() {
      const root = this._getViewsRoot();
      if (!root) return false;

      ALL_VIEWS.forEach((view) => {
        if (this._getViewEl(view)) return;

        const section = document.createElement("section");
        section.id = `view-${view}`;
        section.className = "view card";
        section.hidden = true;
        section.style.display = "none";
        section.setAttribute("data-rcf-view", view);
        section.setAttribute("aria-hidden", "true");

        const title = this._titleFor(view);
        section.innerHTML = `
          <div class="rcfViewPlaceholder" data-rcf-view-placeholder="${this._escAttr(view)}">
            <button class="rcfViewBackBtn" type="button" data-rcf-back-home="1">← Home</button>
            <h1>${this._esc(title)}</h1>
            <p>${this._esc(this._subtitleFor(view))}</p>
            ${this._slotsFor(view)}
          </div>
        `.trim();

        root.appendChild(section);
      });

      return true;
    },

    _ensureBottomNav() {
      const root = this._getRoot();
      if (!root) return false;

      let nav = root.querySelector(".rcfBottomNav");
      if (!nav) {
        nav = document.createElement("nav");
        nav.className = "rcfBottomNav";
        nav.setAttribute("aria-label", "Navegação mobile");
        root.appendChild(nav);
      }

      const current = Array.from(nav.querySelectorAll("[data-view]"))
        .map(btn => String(btn.getAttribute("data-view") || "").trim());
      const expected = BOTTOM_NAV_ITEMS.map(item => item.view).join("|");

      if (current.join("|") !== expected) {
        nav.innerHTML = BOTTOM_NAV_ITEMS.map(item => `
          <button class="tab" data-view="${this._escAttr(item.view)}" type="button">${this._esc(item.label)}</button>
        `).join("");
      }

      this._markBottomNav(this.normalizeViewName(this._getState()?.active?.view || "dashboard"));
      return true;
    },

    _markActiveButtons(view) {
      const normalized = this.normalizeViewName(view);

      document.querySelectorAll("[data-view]").forEach((el) => {
        const target = this.normalizeViewName(el.getAttribute("data-view") || "");
        if (target === normalized) el.classList.add("active");
        else el.classList.remove("active");
      });
    },

    _markBottomNav(view) {
      const normalized = this.normalizeViewName(view);
      const nav = document.querySelector(".rcfBottomNav");
      if (!nav) return;

      nav.querySelectorAll("[data-view]").forEach((btn) => {
        const target = this.normalizeViewName(btn.getAttribute("data-view") || "");
        if (target === normalized) btn.classList.add("active");
        else btn.classList.remove("active");
      });
    },

    _markDashboardMode(view) {
      const root = this._getRoot();
      if (!root) return;

      if (this.normalizeViewName(view) === "dashboard") {
        root.setAttribute("data-rcf-dashboard-mode", "cards");
      } else {
        root.removeAttribute("data-rcf-dashboard-mode");
      }
    },

    _syncShellVisibility(view) {
      const root = this._getRoot();
      if (!root) return;

      const inDashboard = this.normalizeViewName(view) === "dashboard";

      const legacySelectors = [
        ".rcfLegacyShell",
        ".rcfLegacyHeader",
        ".rcfLegacyTop",
        ".rcfDashLegacy",
        ".rcfDashLegacyNav",
        ".rcfDashTopNav",
        ".rcfDashHorizontalNav",
        ".tabs:not(.rcfBottomNav)",
        ".topbar",
        '[data-rcf-legacy="1"]'
      ];

      legacySelectors.forEach((sel) => {
        root.querySelectorAll(sel).forEach((el) => {
          try {
            if (inDashboard) {
              el.style.display = "";
              el.hidden = false;
            } else {
              el.style.display = "none";
              el.hidden = true;
            }
          } catch {}
        });
      });

      const drawer = root.querySelector("#toolsDrawer");
      if (drawer && !inDashboard) {
        try {
          drawer.classList.remove("open");
          drawer.hidden = true;
          drawer.style.display = "none";
        } catch {}
      }
    },

    _cleanupLegacyBleed(view) {
      const normalized = this.normalizeViewName(view);
      const root = this._getRoot();
      if (!root) return;

      if (normalized === "dashboard") return;

      const junkSelectors = [
        "#app > img",
        "#app > picture",
        "#app > .hero-image",
        "#app > .factory-hero",
        "#app > .legacy-hero",
        "#app > .legacy-header",
        "#app > .legacy-shell-top",
        "#app > .legacy-tools-panel"
      ];

      junkSelectors.forEach((sel) => {
        root.querySelectorAll(sel).forEach((el) => {
          try {
            if (el.closest("#rcfRoot")) return;
            el.remove();
          } catch {}
        });
      });
    },

    _clearViewBody(viewName) {
      const view = this._getViewEl(viewName);
      if (!view) return false;

      const placeholder = view.querySelector(".rcfViewPlaceholder");
      const keepIds = new Set([
        "pinOut",
        "agentOut",
        "editorOut",
        "diagOut",
        "logsOut",
        "logsViewBox",
        "filesList",
        "appsList",
        "editorHead",
        "fileContent"
      ]);

      Array.from(view.children).forEach((node) => {
        try {
          if (placeholder && node === placeholder) return;
          node.remove();
        } catch {}
      });

      Array.from(view.querySelectorAll("*")).forEach((node) => {
        try {
          if (!node.id) return;
          if (keepIds.has(node.id)) return;
          if (placeholder && placeholder.contains(node) && !node.hasAttribute("data-rcf-slot")) return;
        } catch {}
      });

      return true;
    },

    _syncSpecialModules(view) {
      const normalized = this.normalizeViewName(view);

      const dashboardOnly = [
        ".rcfDashMobileHome",
        ".rcfDashSurface",
        ".rcfDashHero",
        ".rcfDashCards"
      ];

      dashboardOnly.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          try {
            const insideDash = !!el.closest("#view-dashboard");
            if (!insideDash) return;
            el.style.display = normalized === "dashboard" ? "" : "none";
          } catch {}
        });
      });

      if (normalized !== "admin") {
        this._removeFallbackAdminBlocks();
      }

      if (!["agent"].includes(normalized)) {
        this._removeFallbackAgentBlocks();
      }

      if (!["editor"].includes(normalized)) {
        this._removeFallbackProjectsBlocks();
      }

      if (normalized === "dashboard") {
        try {
          if (window.RCF_UI_DASHBOARD && typeof window.RCF_UI_DASHBOARD.refresh === "function") {
            window.RCF_UI_DASHBOARD.refresh(this._ctx || {});
          }
        } catch {}
      }

      if (normalized === "factory-ai") {
        this._tryMountFactoryAI();
      }
    },

    _removeFallbackAdminBlocks() {
      [
        '[data-rcf-ui-agent-block="1"]',
        '[data-rcf-ui-projects-block="1"]',
        '.rcfUiSectionDivider',
        '.rcfUiListGroup',
        '.rcfUiProjectsHead',
        '.rcfUiCodePanel',
        '.rcfUiProjectsList'
      ].forEach((sel) => {
        document.querySelectorAll(`#view-admin ${sel}, #view-settings ${sel}, #view-factory-ai ${sel}, #view-opportunity-scan ${sel}, #view-generator ${sel}`).forEach((el) => {
          try { el.remove(); } catch {}
        });
      });
    },

    _removeFallbackAgentBlocks() {
      document.querySelectorAll('#view-agent-ia [data-rcf-ui-agent-block="1"], #view-factory-ai [data-rcf-ui-agent-block="1"], #view-settings [data-rcf-ui-agent-block="1"]').forEach((el) => {
        try { el.remove(); } catch {}
      });
    },

    _removeFallbackProjectsBlocks() {
      document.querySelectorAll('#view-settings [data-rcf-ui-projects-block="1"], #view-factory-ai [data-rcf-ui-projects-block="1"], #view-opportunity-scan [data-rcf-ui-projects-block="1"], #view-generator [data-rcf-ui-projects-block="1"]').forEach((el) => {
        try { el.remove(); } catch {}
      });
    },

    _tryMountFactoryAI() {
      const view = this._getViewEl("factory-ai");
      if (!view) return false;

      const hasRealFactoryAI =
        !!window.RCF_FACTORY_IA ||
        !!window.RCF_ADMIN_IA ||
        !!window.ADMIN_IA ||
        !!window.RCF_FACTORY_AI;

      if (hasRealFactoryAI) {
        try {
          document.dispatchEvent(new CustomEvent("rcf:factory-ai", {
            detail: { source: "ui_views", view: "factory-ai" }
          }));
        } catch {}
        try {
          document.dispatchEvent(new CustomEvent("RCF:FACTORY_AI", {
            detail: { source: "ui_views", view: "factory-ai" }
          }));
        } catch {}
        return true;
      }

      return false;
    },

    _bindGlobal() {
      if (this._globalBound) return;
      this._globalBound = true;

      document.addEventListener("click", (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest("[data-view]") : null;
        if (btn) {
          const next = this.normalizeViewName(btn.getAttribute("data-view") || "");
          if (!next) return;
          ev.preventDefault();
          this.setView(next);
          return;
        }

        const back = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-back-home]") : null;
        if (back) {
          ev.preventDefault();
          this.setView("dashboard");
        }
      }, { passive: false });

      window.addEventListener("RCF:UI_READY", () => {
        try {
          this._ensureViewsExist();
          this._ensureBottomNav();
          this._syncInitialState();
        } catch {}
      });
    },

    _titleFor(view) {
      const map = {
        dashboard: "Home",
        newapp: "Apps",
        editor: "Editor",
        agent: "Agent",
        "agent-ia": "Agent IA",
        "opportunity-scan": "Opportunity Scan",
        generator: "Generator",
        settings: "Settings",
        "factory-ai": "Factory AI",
        admin: "Admin",
        logs: "Logs",
        diagnostics: "Diagnostics"
      };
      return map[view] || view;
    },

    _subtitleFor(view) {
      const map = {
        dashboard: "Entrada principal da Factory.",
        newapp: "Criação de novos apps.",
        editor: "Área de edição de arquivos e conteúdo.",
        agent: "Operação do agente bruto.",
        "agent-ia": "Camada própria do Agent IA.",
        "opportunity-scan": "Scanner de oportunidades rentáveis.",
        generator: "Build, teste e validação de apps.",
        settings: "Configurações da Factory.",
        "factory-ai": "Supervisão e evolução da Factory.",
        admin: "Ferramentas administrativas e manutenção.",
        logs: "Visualização de logs.",
        diagnostics: "Diagnóstico e estabilidade."
      };
      return map[view] || "Área interna da Factory.";
    },

    _slotsFor(view) {
      if (view === "agent-ia") {
        return `
          <div id="rcfAgentIASlotActions" data-rcf-slot="agentia.actions"></div>
          <div id="rcfAgentIASlotTools" data-rcf-slot="agentia.tools"></div>
        `;
      }

      if (view === "opportunity-scan") {
        return `
          <div id="rcfOpportunitySlotActions" data-rcf-slot="opportunity.actions"></div>
          <div id="rcfOpportunitySlotTools" data-rcf-slot="opportunity.tools"></div>
        `;
      }

      if (view === "factory-ai") {
        return `
          <div id="rcfFactoryAISlotActions" data-rcf-slot="factoryai.actions"></div>
          <div id="rcfFactoryAISlotTools" data-rcf-slot="factoryai.tools"></div>
        `;
      }

      if (view === "admin") {
        return `
          <div id="rcfAdminSlotTop" data-rcf-slot="admin.top"></div>
          <div id="rcfAdminSlotIntegrations" data-rcf-slot="admin.integrations"></div>
          <div id="rcfAdminSlotLogs" data-rcf-slot="admin.logs"></div>
          <div id="admin-injector" data-rcf-slot="admin.injector"></div>
        `;
      }

      return "";
    },

    _ensureStyle() {
      if (document.getElementById(this._styleId)) return;

      const st = document.createElement("style");
      st.id = this._styleId;
      st.textContent = `
#views > .view[hidden]{
  display:none !important;
}

#views > .view.active{
  display:block !important;
}

#views .rcfViewPlaceholder{
  display:grid;
  gap:10px;
}

#views .rcfViewPlaceholder h1{
  margin:0;
}

#views .rcfViewPlaceholder p{
  margin:0;
  opacity:.78;
  line-height:1.42;
}

#views .rcfViewBackBtn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:42px;
  padding:10px 14px;
  border-radius:14px;
  border:1px solid rgba(88,106,141,.10);
  background:rgba(255,255,255,.72);
  color:#243150;
  font-size:13px;
  font-weight:800;
}

#rcfRoot:not([data-rcf-dashboard-mode="cards"]) #toolsDrawer{
  display:none !important;
  opacity:0 !important;
  pointer-events:none !important;
}

#rcfRoot:not([data-rcf-dashboard-mode="cards"]) .rcfLegacyShell,
#rcfRoot:not([data-rcf-dashboard-mode="cards"]) .rcfLegacyHeader,
#rcfRoot:not([data-rcf-dashboard-mode="cards"]) .rcfLegacyTop,
#rcfRoot:not([data-rcf-dashboard-mode="cards"]) .rcfDashLegacy,
#rcfRoot:not([data-rcf-dashboard-mode="cards"]) .rcfDashLegacyNav,
#rcfRoot:not([data-rcf-dashboard-mode="cards"]) .rcfDashTopNav,
#rcfRoot:not([data-rcf-dashboard-mode="cards"]) .rcfDashHorizontalNav,
#rcfRoot:not([data-rcf-dashboard-mode="cards"]) .topbar{
  display:none !important;
}
      `.trim();

      document.head.appendChild(st);
    },

    _esc(v) {
      return String(v == null ? "" : v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },

    _escAttr(v) {
      return this._esc(v).replace(/'/g, "&#39;");
    }
  };

  window.RCF_UI_VIEWS = Object.assign(window.RCF_UI_VIEWS || {}, MOD);
})();

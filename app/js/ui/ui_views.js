/* FILE: /app/js/ui/ui_views.js
   RControl Factory — UI Views
   V3.1 SAFE SCREEN NAV
   - navegação por tela única
   - bottom nav primária limpa
   - Agent IA no atalho inferior
   - Agent bruto separado
   - Opportunity separado de Generator
   - esconde barra inferior nas telas internas
   - remove interferência de navegação/topo legado
*/
(() => {
  "use strict";

  const VIEW_MAP = {
    home: "dashboard",
    dash: "dashboard",
    dashboard: "dashboard",

    apps: "newapp",
    newapp: "newapp",
    "new-app": "newapp",
    "new app": "newapp",

    editor: "editor",

    agent: "agent",
    "agent-ia": "agent-ia",
    "agent-ai": "agent-ia",
    agentia: "agent-ia",
    agent_ai: "agent-ia",

    opportunity: "opportunity-scan",
    opportunityscan: "opportunity-scan",
    "opportunity-scan": "opportunity-scan",
    scan: "opportunity-scan",

    settings: "settings",

    factory: "admin",
    system: "admin",
    admin: "admin",

    factoryai: "factory-ai",
    "factory-ai": "factory-ai",
    "factory ai": "factory-ai",
    factory_ai: "factory-ai",

    generator: "generator",
    logs: "logs",
    diagnostics: "diagnostics",
    diag: "diagnostics",
    doctor: "diagnostics"
  };

  const INTERNAL_VIEWS = [
    "dashboard",
    "newapp",
    "editor",
    "agent",
    "agent-ia",
    "opportunity-scan",
    "settings",
    "factory-ai",
    "generator",
    "admin",
    "logs",
    "diagnostics"
  ];

  const PRIMARY_BOTTOM_VIEWS = [
    "dashboard",
    "agent-ia",
    "opportunity-scan",
    "settings",
    "factory-ai"
  ];

  const BOTTOM_NAV_ITEMS = [
    { view: "dashboard", label: "Home" },
    { view: "agent-ia", label: "Agent IA" },
    { view: "opportunity-scan", label: "Opportunity" },
    { view: "settings", label: "Settings" },
    { view: "factory-ai", label: "Factory AI" }
  ];

  const TITLES = {
    dashboard: "Home",
    newapp: "Novo App",
    editor: "Editor",
    agent: "Agent",
    "agent-ia": "Agent IA",
    "opportunity-scan": "Opportunity Scan",
    settings: "Settings",
    "factory-ai": "Factory AI",
    generator: "Generator",
    admin: "Admin",
    logs: "Logs",
    diagnostics: "Diagnostics"
  };

  const SUBTITLES = {
    dashboard: "Entrada principal da Factory.",
    newapp: "Criação de novos apps.",
    editor: "Projetos & código.",
    agent: "Agente bruto de operação.",
    "agent-ia": "Camada dedicada do Agent IA.",
    "opportunity-scan": "Scanner de oportunidades rentáveis.",
    settings: "Parâmetros e preferências.",
    "factory-ai": "Núcleo supervisionado da Factory.",
    generator: "Build, teste e validação.",
    admin: "Ferramentas internas e manutenção.",
    logs: "Histórico e acompanhamento.",
    diagnostics: "Verificação e estabilidade."
  };

  const MOD = {
    _ctx: null,
    _mounted: false,
    _styleId: "rcfUiViewsStyleV31",
    _navSel: ".rcfBottomNav",

    init(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureViewsExist();
      this._ensureBottomNav(true);
      this._bindGlobal();
      this._cleanupLegacyChrome();
      return true;
    },

    mount(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureViewsExist();
      this._ensureBottomNav(true);
      this._normalizeLegacyNodes();
      this._cleanupLegacyChrome();
      this._syncInitialState();
      this._mounted = true;
      return true;
    },

    remountSoft(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureViewsExist();
      this._ensureBottomNav(true);
      this._normalizeLegacyNodes();
      this._cleanupLegacyChrome();
      this._syncInitialState();
      return true;
    },

    refresh(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureViewsExist();
      this._ensureBottomNav(true);
      this._normalizeLegacyNodes();
      this._cleanupLegacyChrome();
      this._syncInitialState();
      return true;
    },

    normalizeViewName(name) {
      const raw = String(name || "").trim().toLowerCase();
      return VIEW_MAP[raw] || raw || "dashboard";
    },

    setView(name, opts = {}) {
      const normalized = this.normalizeViewName(name);
      const state = this._getState();
      const prev = state?.active?.view ? this.normalizeViewName(state.active.view) : "dashboard";

      if (prev === "generator" && normalized !== "generator") {
        try {
          if (opts && typeof opts.teardownPreviewHard === "function") {
            opts.teardownPreviewHard();
          } else if (this._ctx && typeof this._ctx.teardownPreviewHard === "function") {
            this._ctx.teardownPreviewHard();
          }
        } catch {}
      }

      this._hideAllViews();

      const target = this._getViewEl(normalized);
      if (target) {
        target.hidden = false;
        target.style.display = "";
        target.classList.add("active");
        target.setAttribute("data-rcf-visible", "1");
      }

      this._markActiveButtons(normalized);
      this._markBottomNav(normalized);
      this._markDashboardMode(normalized);
      this._updateBottomNavVisibility(normalized);
      this._cleanupLegacyChrome(normalized);

      try {
        const root = this._getRoot();
        if (root) root.setAttribute("data-rcf-current-view", normalized);
      } catch {}

      try {
        if (state) {
          state.active = state.active || {};
          state.active.view = normalized;
        }
      } catch {}

      try {
        if (opts && typeof opts.saveAll === "function") opts.saveAll("ui_views.setView");
        else if (this._ctx && typeof this._ctx.saveAll === "function") this._ctx.saveAll("ui_views.setView");
      } catch {}

      try {
        if (normalized === "dashboard" && window.RCF_UI_DASHBOARD && typeof window.RCF_UI_DASHBOARD.refresh === "function") {
          window.RCF_UI_DASHBOARD.refresh(this._ctx || {});
        }
      } catch {}

      try {
        if (window.RCF_UI_RUNTIME && typeof window.RCF_UI_RUNTIME.syncFabStatusText === "function") {
          window.RCF_UI_RUNTIME.syncFabStatusText();
        }
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
      INTERNAL_VIEWS.forEach((view) => {
        const el = this._getViewEl(view);
        if (!el) return;
        el.classList.remove("active");
        el.hidden = true;
        el.style.display = "none";
        el.removeAttribute("data-rcf-visible");
      });
    },

    _ensureViewsExist() {
      const root = this._getViewsRoot();
      if (!root) return false;

      INTERNAL_VIEWS.forEach((view) => {
        if (this._getViewEl(view)) return;

        const section = document.createElement("section");
        section.id = `view-${view}`;
        section.className = "view card";
        section.hidden = true;
        section.style.display = "none";
        section.setAttribute("data-rcf-view", view);

        const title = this._titleFor(view);
        const subtitle = this._subtitleFor(view);

        section.innerHTML = `
          <div class="rcfViewScreen">
            ${view !== "dashboard" ? `
              <div class="rcfViewTopBack">
                <button class="btn small ghost" data-view="dashboard" type="button">← Home</button>
              </div>
            ` : ""}
            <div class="rcfViewPlaceholder">
              <h1>${this._esc(title)}</h1>
              <p>${this._esc(subtitle)}</p>
              ${this._slotsFor(view)}
            </div>
          </div>
        `.trim();

        root.appendChild(section);
      });

      return true;
    },

    _ensureBottomNav(forceRebuild = false) {
      const root = this._getRoot();
      if (!root) return false;

      let nav = root.querySelector(this._navSel);
      if (!nav) {
        nav = document.createElement("nav");
        nav.className = "rcfBottomNav";
        nav.setAttribute("aria-label", "Navegação mobile");
        root.appendChild(nav);
        forceRebuild = true;
      }

      const expected = BOTTOM_NAV_ITEMS.map(item => item.view).join("|");
      const current = Array.from(nav.querySelectorAll("[data-view]"))
        .map(btn => String(btn.getAttribute("data-view") || "").trim())
        .join("|");

      if (forceRebuild || current !== expected) {
        nav.innerHTML = BOTTOM_NAV_ITEMS.map(item => `
          <button class="tab" data-view="${this._escAttr(item.view)}" type="button">${this._esc(item.label)}</button>
        `).join("");
      }

      this._markBottomNav(this.normalizeViewName(this._getState()?.active?.view || "dashboard"));
      this._updateBottomNavVisibility(this.normalizeViewName(this._getState()?.active?.view || "dashboard"));
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
      const nav = document.querySelector(this._navSel);
      if (!nav) return;

      nav.querySelectorAll("[data-view]").forEach((btn) => {
        const target = this.normalizeViewName(btn.getAttribute("data-view") || "");
        if (target === normalized) btn.classList.add("active");
        else btn.classList.remove("active");
      });
    },

    _updateBottomNavVisibility(view) {
      const normalized = this.normalizeViewName(view);
      const nav = document.querySelector(this._navSel);
      const root = this._getRoot();
      if (!nav || !root) return;

      const show = PRIMARY_BOTTOM_VIEWS.includes(normalized);

      if (show) {
        nav.removeAttribute("hidden");
        nav.style.display = "";
        root.removeAttribute("data-rcf-bottom-nav-hidden");
      } else {
        nav.setAttribute("hidden", "hidden");
        nav.style.display = "none";
        root.setAttribute("data-rcf-bottom-nav-hidden", "1");
      }
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

    _cleanupLegacyChrome(currentView = "") {
      const root = this._getRoot();
      if (!root) return;

      document.querySelectorAll(".tabs").forEach((el) => {
        try {
          el.setAttribute("hidden", "hidden");
          el.style.display = "none";
        } catch {}
      });

      document.querySelectorAll(".rcfMobileModules").forEach((el) => {
        try {
          if (this.normalizeViewName(currentView || this._getState()?.active?.view || "dashboard") !== "dashboard") {
            el.setAttribute("hidden", "hidden");
            el.style.display = "none";
          }
        } catch {}
      });

      const factoryRoot = document.getElementById("rcfFactoryUiRoot");
      if (factoryRoot) {
        try {
          const view = this.normalizeViewName(currentView || this._getState()?.active?.view || "dashboard");
          if (view !== "dashboard") {
            factoryRoot.setAttribute("hidden", "hidden");
            factoryRoot.style.display = "none";
          } else {
            factoryRoot.removeAttribute("hidden");
            factoryRoot.style.display = "";
          }
        } catch {}
      }
    },

    _normalizeLegacyNodes() {
      document.querySelectorAll("[data-view]").forEach((node) => {
        try {
          const raw = node.getAttribute("data-view") || "";
          const norm = this.normalizeViewName(raw);
          if (norm && raw !== norm) node.setAttribute("data-view", norm);
        } catch {}
      });

      const nav = document.querySelector(this._navSel);
      if (nav) {
        const buttons = Array.from(nav.querySelectorAll("[data-view]"));
        const wrong = buttons.some((btn, idx) => {
          const item = BOTTOM_NAV_ITEMS[idx];
          if (!item) return true;
          return String(btn.getAttribute("data-view") || "").trim() !== item.view;
        });
        if (wrong) this._ensureBottomNav(true);
      }
    },

    _bindGlobal() {
      if (this._globalBound) return;
      this._globalBound = true;

      document.addEventListener("click", (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest("[data-view]") : null;
        if (!btn) return;

        const next = this.normalizeViewName(btn.getAttribute("data-view") || "");
        if (!next) return;

        ev.preventDefault();
        this.setView(next);
      }, { passive: false });

      document.addEventListener("click", (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-open-view]") : null;
        if (!btn) return;

        const next = this.normalizeViewName(btn.getAttribute("data-rcf-open-view") || "");
        if (!next) return;

        ev.preventDefault();
        this.setView(next);
      }, { passive: false });

      window.addEventListener("RCF:UI_READY", () => {
        try {
          this._ensureViewsExist();
          this._ensureBottomNav(true);
          this._cleanupLegacyChrome();
          this._syncInitialState();
        } catch {}
      });
    },

    _titleFor(view) {
      return TITLES[view] || view;
    },

    _subtitleFor(view) {
      return SUBTITLES[view] || "Área interna da Factory.";
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

      if (view === "generator") {
        return `
          <div id="rcfGenSlotActions" data-rcf-slot="generator.actions"></div>
          <div id="rcfGenSlotTools" data-rcf-slot="generator.tools"></div>
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

#views .rcfViewScreen{
  display:grid;
  gap:12px;
}

#views .rcfViewTopBack{
  display:flex;
  align-items:center;
  justify-content:flex-start;
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

#rcfRoot[data-rcf-bottom-nav-hidden="1"] .rcfBottomNav{
  display:none !important;
}

#rcfRoot[data-rcf-current-view="dashboard"] #view-dashboard{
  padding-bottom:110px;
}

.tabs{
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

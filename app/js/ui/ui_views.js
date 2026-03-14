/* FILE: /app/js/ui/ui_views.js
   RControl Factory — UI Views
   V3.0 SAFE NAV FIX
   - Corrige bottom nav de forma estrutural
   - Remove Generator da barra inferior
   - Coloca Opportunity Scan no lugar correto
   - Mantém Factory AI separado de Admin
   - Não empilha views
   - Compatível com arquitetura modular atual
   - Mantém fallback leve e seguro
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

  // BOTTOM NAV OFICIAL MOBILE
  // Generator NÃO entra aqui.
  const BOTTOM_NAV_ITEMS = [
    { view: "dashboard", label: "Home" },
    { view: "agent", label: "Agent" },
    { view: "opportunity-scan", label: "Opportunity" },
    { view: "settings", label: "Settings" },
    { view: "factory-ai", label: "Factory AI" }
  ];

  const TOP_LABELS = {
    dashboard: "Dashboard",
    newapp: "New App",
    editor: "Editor",
    agent: "Agent",
    "agent-ia": "Agent IA",
    "opportunity-scan": "Opportunity",
    settings: "Settings",
    "factory-ai": "Factory AI",
    generator: "Generator",
    admin: "Admin",
    logs: "Logs",
    diagnostics: "Diagnostics"
  };

  const MOD = {
    _ctx: null,
    _mounted: false,
    _styleId: "rcfUiViewsStyleV30",
    _navSel: ".rcfBottomNav",

    init(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureViewsExist();
      this._ensureBottomNav(true);
      this._bindGlobal();
      return true;
    },

    mount(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureViewsExist();
      this._ensureBottomNav(true);
      this._normalizeLegacyNodes();
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
      this._syncInitialState();
      return true;
    },

    refresh(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureViewsExist();
      this._ensureBottomNav(true);
      this._normalizeLegacyNodes();
      this._syncInitialState();
      return true;
    },

    normalizeViewName(name) {
      const raw = String(name || "").trim().toLowerCase();
      return VIEW_MAP[raw] || raw || "dashboard";
    },

    setView(name, opts = {}) {
      const normalized = this.normalizeViewName(name);
      if (!normalized) return false;

      const state = this._getState();
      const prev = state?.active?.view ? this.normalizeViewName(state.active.view) : "dashboard";

      if ((prev === "generator" || prev === "opportunity-scan") && normalized !== prev) {
        try {
          const td = opts?.teardownPreviewHard || this._ctx?.teardownPreviewHard;
          if (typeof td === "function") td();
        } catch {}
      }

      this._hideAllViews();

      const target = this._getViewEl(normalized);
      if (target) {
        target.hidden = false;
        target.style.display = "";
        target.classList.add("active");
        target.setAttribute("data-rcf-visible", "1");
        target.setAttribute("aria-hidden", "false");
      }

      this._markActiveButtons(normalized);
      this._markBottomNav(normalized);
      this._markDashboardMode(normalized);

      try {
        if (state) {
          state.active = state.active || {};
          state.active.view = normalized;
        }
      } catch {}

      try {
        const saveAll = opts?.saveAll || this._ctx?.saveAll;
        if (typeof saveAll === "function") saveAll("ui_views.setView");
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
        el.setAttribute("aria-hidden", "true");
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
        section.setAttribute("aria-hidden", "true");

        section.innerHTML = `
          <div class="rcfViewPlaceholder">
            <h1>${this._esc(this._titleFor(view))}</h1>
            <p>${this._esc(this._subtitleFor(view))}</p>
            ${this._slotsFor(view)}
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
      }

      const expected = BOTTOM_NAV_ITEMS.map(item => item.view).join("|");
      const current = Array.from(nav.querySelectorAll("[data-view]"))
        .map(btn => this.normalizeViewName(btn.getAttribute("data-view") || ""))
        .join("|");

      if (forceRebuild || current !== expected) {
        nav.innerHTML = BOTTOM_NAV_ITEMS.map(item => `
          <button class="tab" data-view="${this._escAttr(item.view)}" type="button">${this._esc(item.label)}</button>
        `).join("");
      }

      nav.querySelectorAll("[data-view]").forEach(btn => {
        if (btn.__rcf_bottom_bound__) return;
        btn.__rcf_bottom_bound__ = true;
        btn.addEventListener("click", (ev) => {
          try { if (ev.cancelable) ev.preventDefault(); } catch {}
          const next = this.normalizeViewName(btn.getAttribute("data-view") || "");
          if (!next) return;
          this.setView(next);
        }, { passive: false });
      });

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

      document.querySelectorAll("[data-rcf-nav-view]").forEach((el) => {
        const target = this.normalizeViewName(el.getAttribute("data-rcf-nav-view") || "");
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

    _markDashboardMode(view) {
      const root = this._getRoot();
      if (!root) return;

      if (this.normalizeViewName(view) === "dashboard") {
        root.setAttribute("data-rcf-dashboard-mode", "cards");
      } else {
        root.removeAttribute("data-rcf-dashboard-mode");
      }
    },

    _normalizeLegacyNodes(root = document) {
      // Corrige qualquer botão antigo que ainda vier com mappings errados.
      root.querySelectorAll("[data-view], [data-rcf-nav-view]").forEach((node) => {
        const attr = node.hasAttribute("data-rcf-nav-view") ? "data-rcf-nav-view" : "data-view";
        const raw = node.getAttribute(attr) || "";
        const norm = this.normalizeViewName(raw);
        if (norm && raw !== norm) node.setAttribute(attr, norm);
      });

      // Corrige labels simples legadas fora do bottom nav.
      root.querySelectorAll("#rcfRoot [data-view]").forEach((btn) => {
        if (btn.closest(".rcfBottomNav")) return;

        const norm = this.normalizeViewName(btn.getAttribute("data-view") || "");
        const txt = String(btn.textContent || "").trim().toLowerCase();

        const isSimple =
          txt === "factory" ||
          txt === "system" ||
          txt === "dashboard" ||
          txt === "editor" ||
          txt === "agent" ||
          txt === "apps" ||
          txt === "new app" ||
          txt === "logs" ||
          txt === "generator" ||
          txt === "settings" ||
          txt === "factory ai";

        if (!isSimple) return;
        if (!TOP_LABELS[norm]) return;

        try { btn.textContent = TOP_LABELS[norm]; } catch {}
      });

      // Cards mobile shell antigos.
      root.querySelectorAll(".rcfMobileModuleCard[data-view]").forEach((btn) => {
        const norm = this.normalizeViewName(btn.getAttribute("data-view") || "");
        btn.setAttribute("data-view", norm);

        if (btn.__rcf_mobile_card_bound__) return;
        btn.__rcf_mobile_card_bound__ = true;
        btn.addEventListener("click", (ev) => {
          try { if (ev.cancelable) ev.preventDefault(); } catch {}
          this.setView(norm);
        }, { passive: false });
      });
    },

    _bindGlobal() {
      if (this._globalBound) return;
      this._globalBound = true;

      document.addEventListener("click", (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest("[data-view], [data-rcf-nav-view]") : null;
        if (!btn) return;

        // Bottom nav já tem bind próprio e não precisa duplicar.
        if (btn.closest(".rcfBottomNav")) return;

        const next = this.normalizeViewName(
          btn.getAttribute("data-rcf-nav-view") ||
          btn.getAttribute("data-view") ||
          ""
        );
        if (!next) return;

        try { if (ev.cancelable) ev.preventDefault(); } catch {}
        this.setView(next);
      }, { passive: false });

      window.addEventListener("RCF:UI_READY", () => {
        try {
          this._ensureViewsExist();
          this._ensureBottomNav(true);
          this._normalizeLegacyNodes();
          this._syncInitialState();
        } catch {}
      });
    },

    _titleFor(view) {
      const map = {
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
      return map[view] || view;
    },

    _subtitleFor(view) {
      const map = {
        dashboard: "Entrada principal da Factory.",
        newapp: "Criação de novos apps.",
        editor: "Área de edição de arquivos e conteúdo.",
        agent: "Operação do agente principal.",
        "agent-ia": "Camada de IA do agente.",
        "opportunity-scan": "Scanner de oportunidades rentáveis.",
        settings: "Configurações da Factory.",
        "factory-ai": "Núcleo de IA supervisionada da Factory.",
        generator: "Build, teste e validação de apps.",
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

/* Remove qualquer herança visual errada de tabs horizontais antigas na Home */
#rcfRoot[data-rcf-dashboard-mode="cards"] .tabs,
#rcfRoot[data-rcf-dashboard-mode="cards"] .top-tabs,
#rcfRoot[data-rcf-dashboard-mode="cards"] .horizontal-tabs,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashTopNav,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashHorizontalNav{
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

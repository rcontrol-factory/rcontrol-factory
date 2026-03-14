/* FILE: /app/js/ui/ui_dashboard.js
   RControl Factory — UI Dashboard
   - Home mobile leve e direta
   - Cards principais com navegação imediata
   - Apenas RCF Factory permanece expansível
   - Menos custo visual para Safari / iPhone / PWA
   - Corrige sensação de travamento ao entrar nos módulos
*/
(() => {
  "use strict";

  const MOD = {
    _ctx: null,
    _booted: false,
    _expanded: null,
    _styleId: "rcfUiDashboardStyle",
    _rootSel: "#rcfRoot",
    _viewSel: "#view-dashboard",
    _gridSel: "#rcfDashboardCards",

    init(ctx = {}) {
      this._ctx = ctx || {};
      this._expanded = null;
      this._ensureStyle();
      this._bindGlobal();
      return true;
    },

    mount(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._expanded = null;
      this._ensureStyle();
      this._ensureDashboardShell();
      this.render();
      this._bindWithinDashboard();
      this._markDashboardMode();
      this._booted = true;
      return true;
    },

    remountSoft(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._expanded = null;
      this._ensureStyle();
      this._ensureDashboardShell();
      this.render();
      this._bindWithinDashboard();
      this._markDashboardMode();
      return true;
    },

    refresh(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureDashboardShell();
      this.render();
      this._markDashboardMode();
      return true;
    },

    destroy() {
      try {
        const root = document.querySelector(this._rootSel);
        if (root) root.removeAttribute("data-rcf-dashboard-mode");
      } catch {}
      return true;
    },

    _getState() {
      const ctxState = this._ctx && this._ctx.State;
      const rootState = window.RCF && window.RCF.state;
      return ctxState || rootState || { apps: [], active: { view: "dashboard" } };
    },

    _normalizeView(view) {
      const raw = String(view || "").trim().toLowerCase();
      const aliases = {
        home: "dashboard",
        dashboard: "dashboard",
        apps: "newapp",
        newapp: "newapp",
        "new-app": "newapp",
        editor: "editor",
        agent: "agent",
        "agent-ia": "agent-ia",
        agentia: "agent-ia",
        factoryai: "factory-ai",
        "factory-ai": "factory-ai",
        opportunity: "opportunity-scan",
        "opportunity-scan": "opportunity-scan",
        generator: "generator",
        admin: "admin",
        github: "github",
        updates: "updates",
        deploy: "deploy",
        settings: "settings",
        logs: "logs",
        diagnostics: "diagnostics"
      };
      return aliases[raw] || raw;
    },

    _setView(view) {
      const normalized = this._normalizeView(view);

      try {
        if (this._ctx && typeof this._ctx.setView === "function") return this._ctx.setView(normalized);
      } catch {}

      try {
        if (window.RCF && typeof window.RCF.setView === "function") return window.RCF.setView(normalized);
      } catch {}

      try {
        if (window.RCF_UI_ROUTER && typeof window.RCF_UI_ROUTER.setView === "function") {
          return window.RCF_UI_ROUTER.setView(normalized);
        }
      } catch {}

      return false;
    },

    _setActiveApp(slug) {
      try {
        if (this._ctx && typeof this._ctx.setActiveApp === "function") return this._ctx.setActiveApp(slug);
      } catch {}

      try {
        if (window.RCF_UI_RUNTIME && typeof window.RCF_UI_RUNTIME.setActiveApp === "function") {
          return window.RCF_UI_RUNTIME.setActiveApp(slug);
        }
      } catch {}

      try {
        if (window.RCF && window.RCF.state && Array.isArray(window.RCF.state.apps)) {
          const app = window.RCF.state.apps.find(a => a && a.slug === slug);
          if (!app) return false;
          window.RCF.state.active = window.RCF.state.active || {};
          window.RCF.state.active.appSlug = slug;
          window.RCF.state.active.file = window.RCF.state.active.file || null;
          return true;
        }
      } catch {}

      return false;
    },

    _openTools() {
      try {
        if (this._ctx && typeof this._ctx.openTools === "function") {
          this._ctx.openTools(true);
          return true;
        }
      } catch {}

      try {
        const drawer = document.querySelector("#toolsDrawer");
        if (drawer) {
          drawer.classList.add("open");
          drawer.hidden = false;
          drawer.style.display = "";
          return true;
        }
      } catch {}

      return false;
    },

    _runDoctor() {
      try {
        if (window.RCF_DOCTOR && typeof window.RCF_DOCTOR.run === "function") {
          window.RCF_DOCTOR.run();
          return true;
        }
      } catch {}

      try {
        document.dispatchEvent(new CustomEvent("RCF:DOCTOR", { detail: { source: "ui_dashboard" } }));
        return true;
      } catch {}

      return false;
    },

    _fastNavigate(view) {
      const v = this._normalizeView(view);
      if (!v) return false;

      try {
        document.body.style.pointerEvents = "none";
      } catch {}

      requestAnimationFrame(() => {
        try {
          this._setView(v);
        } finally {
          setTimeout(() => {
            try { document.body.style.pointerEvents = ""; } catch {}
          }, 60);
        }
      });

      return true;
    },

    _ensureStyle() {
      if (document.getElementById(this._styleId)) return;

      const st = document.createElement("style");
      st.id = this._styleId;
      st.textContent = `
#rcfRoot[data-rcf-dashboard-mode="cards"] .tabs,
#rcfRoot[data-rcf-dashboard-mode="cards"] .topbar,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashLegacy,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashLegacyNav,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashTopNav,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashHorizontalNav{
  display:none !important;
}

#view-dashboard{
  position:relative;
}

#view-dashboard .rcfDashMobileHome{
  display:block;
  width:100%;
  min-height:100%;
  padding:12px 0 26px;
}

#view-dashboard .rcfDashSurface{
  display:grid;
  gap:12px;
}

#view-dashboard .rcfDashHero{
  position:relative;
  overflow:hidden;
  border-radius:24px;
  border:1px solid rgba(112,128,162,.14);
  background:linear-gradient(180deg, rgba(255,255,255,.92), rgba(246,248,252,.82));
  box-shadow:0 12px 26px rgba(29,42,72,.06), inset 0 1px 0 rgba(255,255,255,.92);
  padding:15px;
  content-visibility:auto;
  contain:layout paint style;
}

#view-dashboard .rcfDashBrand{
  display:flex;
  align-items:center;
  gap:12px;
  min-width:0;
}

#view-dashboard .rcfDashBrandLogo{
  width:62px;
  height:62px;
  min-width:62px;
  border-radius:18px;
  object-fit:cover;
  background:#fff;
  border:1px solid rgba(100,116,145,.10);
  box-shadow:0 8px 18px rgba(26,39,68,.06);
}

#view-dashboard .rcfDashBrandFallback{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:62px;
  height:62px;
  min-width:62px;
  border-radius:18px;
  font-size:22px;
  font-weight:900;
  color:#1d2b4d;
  background:#fff;
  border:1px solid rgba(100,116,145,.10);
  box-shadow:0 8px 18px rgba(26,39,68,.06);
}

#view-dashboard .rcfDashBrandText{
  min-width:0;
  flex:1 1 auto;
}

#view-dashboard .rcfDashEyebrow{
  margin:0 0 4px;
  font-size:11px;
  font-weight:900;
  letter-spacing:.14em;
  text-transform:uppercase;
  opacity:.68;
}

#view-dashboard .rcfDashTitle{
  margin:0;
  font-size:clamp(24px, 4.4vw, 34px);
  line-height:1.02;
  font-weight:900;
  color:#243150;
}

#view-dashboard .rcfDashText{
  margin:6px 0 0;
  font-size:14px;
  line-height:1.42;
  color:rgba(38,52,82,.78);
}

#view-dashboard .rcfDashMetaRow{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:14px;
}

#view-dashboard .rcfDashChip{
  display:inline-flex;
  align-items:center;
  min-height:32px;
  padding:6px 11px;
  border-radius:999px;
  border:1px solid rgba(92,110,145,.10);
  background:rgba(255,255,255,.82);
  color:rgba(36,49,80,.88);
  font-size:12px;
  font-weight:800;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.72);
}

#view-dashboard .rcfDashCards{
  display:grid;
  grid-template-columns:1fr;
  gap:12px;
  align-items:start;
}

#view-dashboard .rcfDashCard{
  position:relative;
  overflow:hidden;
  border-radius:24px;
  border:1px solid rgba(108,125,160,.12);
  background:linear-gradient(180deg, rgba(255,255,255,.92), rgba(246,248,252,.84));
  box-shadow:0 12px 24px rgba(28,40,69,.06), inset 0 1px 0 rgba(255,255,255,.92);
  content-visibility:auto;
  contain:layout paint style;
}

#view-dashboard .rcfDashCardHead{
  display:flex;
  align-items:center;
  gap:14px;
  width:100%;
  padding:16px;
  text-align:left;
  background:transparent;
  border:0;
  color:inherit;
  cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}

#view-dashboard .rcfDashCardHead:focus{
  outline:none;
}

#view-dashboard .rcfDashCardIconWrap{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:68px;
  height:68px;
  min-width:68px;
  border-radius:20px;
  border:1px solid rgba(106,124,159,.10);
  background:linear-gradient(180deg, rgba(255,255,255,.98), rgba(239,243,249,.92));
  box-shadow:0 8px 18px rgba(28,40,68,.06), inset 0 1px 0 rgba(255,255,255,.94);
}

#view-dashboard .rcfDashCardIcon{
  width:46px;
  height:46px;
  object-fit:cover;
  border-radius:14px;
}

#view-dashboard .rcfDashCardIconFallback{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:46px;
  height:46px;
  border-radius:14px;
  font-size:24px;
  font-weight:900;
}

#view-dashboard .rcfDashCardText{
  min-width:0;
  flex:1 1 auto;
}

#view-dashboard .rcfDashCardKicker{
  display:block;
  margin:0 0 4px;
  font-size:11px;
  font-weight:900;
  letter-spacing:.14em;
  text-transform:uppercase;
  opacity:.66;
}

#view-dashboard .rcfDashCardTitle{
  display:block;
  margin:0;
  font-size:18px;
  line-height:1.06;
  font-weight:900;
  color:#243150;
}

#view-dashboard .rcfDashCardSub{
  display:block;
  margin:5px 0 0;
  font-size:13px;
  line-height:1.4;
  color:rgba(40,53,81,.78);
}

#view-dashboard .rcfDashCardArrow{
  flex:0 0 auto;
  font-size:24px;
  line-height:1;
  opacity:.36;
  transform:translateY(-1px) rotate(0deg);
  transition:transform .16s ease, opacity .16s ease;
}

#view-dashboard .rcfDashCard.is-open .rcfDashCardArrow{
  transform:translateY(-1px) rotate(90deg);
  opacity:.72;
}

#view-dashboard .rcfDashCardBody{
  display:none;
  padding:0 16px 16px;
}

#view-dashboard .rcfDashCard.is-open .rcfDashCardBody{
  display:grid;
  gap:12px;
}

#view-dashboard .rcfDashCardBody p{
  margin:0;
  font-size:13px;
  line-height:1.46;
  color:rgba(37,50,78,.84);
}

#view-dashboard .rcfDashMeta{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}

#view-dashboard .rcfDashMetaChip{
  display:inline-flex;
  align-items:center;
  min-height:30px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid rgba(92,110,145,.10);
  background:rgba(255,255,255,.78);
  font-size:12px;
  font-weight:800;
  color:rgba(37,50,78,.84);
}

#view-dashboard .rcfDashActions{
  display:grid;
  grid-template-columns:1fr;
  gap:8px;
}

#view-dashboard .rcfDashActionBtn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:44px;
  padding:10px 14px;
  border-radius:14px;
  border:1px solid rgba(88,106,141,.10);
  background:rgba(255,255,255,.82);
  color:#243150;
  font-size:13px;
  font-weight:900;
  text-decoration:none;
  cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}

#view-dashboard .rcfDashActionBtn.primary{
  background:linear-gradient(180deg, rgba(112,152,255,.18), rgba(112,152,255,.08));
  border-color:rgba(112,152,255,.18);
}

#view-dashboard .rcfDashActionBtn.ghost{
  background:rgba(255,255,255,.74);
}

#view-dashboard .rcfDashActionBtn:focus{
  outline:none;
}

#view-dashboard .rcfDashEmpty{
  padding:16px;
  border-radius:18px;
  border:1px dashed rgba(84,105,145,.18);
  background:rgba(255,255,255,.52);
  text-align:center;
  font-size:13px;
  color:rgba(37,50,78,.78);
}

#view-dashboard .rcfDashAppsList{
  display:grid;
  gap:8px;
}

#view-dashboard .rcfDashAppItem{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:10px 12px;
  border-radius:14px;
  border:1px solid rgba(84,105,145,.08);
  background:rgba(255,255,255,.66);
}

#view-dashboard .rcfDashAppMeta{
  min-width:0;
  flex:1 1 auto;
}

#view-dashboard .rcfDashAppName,
#view-dashboard .rcfDashAppSlug{
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

#view-dashboard .rcfDashAppName{
  font-size:13px;
  font-weight:900;
  color:#243150;
}

#view-dashboard .rcfDashAppSlug{
  font-size:11px;
  color:rgba(37,50,78,.64);
  margin-top:2px;
}

#view-dashboard .rcfDashAppGo{
  flex:0 0 auto;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:40px;
  min-height:40px;
  padding:8px 10px;
  border-radius:12px;
  border:1px solid rgba(84,105,145,.08);
  background:rgba(255,255,255,.82);
  color:#243150;
  font-weight:900;
}

@media (max-width: 720px){
  #view-dashboard .rcfDashMobileHome{
    padding-top:10px;
  }
  #view-dashboard .rcfDashHero{
    border-radius:24px;
    padding:15px;
  }
  #view-dashboard .rcfDashCard{
    border-radius:24px;
  }
  #view-dashboard .rcfDashCardHead{
    padding:16px;
  }
  #view-dashboard .rcfDashCardIconWrap{
    width:66px;
    height:66px;
    min-width:66px;
    border-radius:20px;
  }
  #view-dashboard .rcfDashCardTitle{
    font-size:19px;
  }
}

@media (prefers-reduced-motion: reduce){
  #view-dashboard .rcfDashCardArrow{
    transition:none;
  }
}
      `.trim();
      document.head.appendChild(st);
    },

    _moduleAsset(name) {
      return `./assets/icons/modules/${name}.jpeg`;
    },

    _ensureDashboardShell() {
      const view = document.querySelector(this._viewSel);
      if (!view) return false;

      let host = view.querySelector(".rcfDashMobileHome");
      if (!host) {
        host = document.createElement("div");
        host.className = "rcfDashMobileHome";
        view.innerHTML = "";
        view.appendChild(host);
      }

      if (!host.querySelector(".rcfDashSurface")) {
        const surface = document.createElement("div");
        surface.className = "rcfDashSurface";
        host.appendChild(surface);
      }

      const surface = host.querySelector(".rcfDashSurface");
      if (!surface) return false;

      if (!surface.querySelector(".rcfDashHero")) {
        const hero = document.createElement("section");
        hero.className = "rcfDashHero";
        hero.innerHTML = `
          <div class="rcfDashBrand">
            <img
              class="rcfDashBrandLogo"
              src="./assets/icons/app/app-icon.png"
              alt="RCF"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"
            />
            <span class="rcfDashBrandFallback" style="display:none;">RCF</span>
            <div class="rcfDashBrandText">
              <div class="rcfDashEyebrow">RControl Factory</div>
              <h1 class="rcfDashTitle">Home</h1>
              <p class="rcfDashText">Fluxo mobile limpo com cards verticais organizados.</p>
            </div>
          </div>
          <div class="rcfDashMetaRow">
            <span class="rcfDashChip">Home</span>
            <span class="rcfDashChip">Cards verticais</span>
            <span class="rcfDashChip">Sem sobreposição</span>
          </div>
        `;
        surface.appendChild(hero);
      }

      if (!surface.querySelector(this._gridSel)) {
        const grid = document.createElement("div");
        grid.id = this._gridSel.replace("#", "");
        grid.className = "rcfDashCards";
        surface.appendChild(grid);
      }

      return true;
    },

    _cards() {
      const state = this._getState();
      const appsCount = Array.isArray(state.apps) ? state.apps.length : 0;
      const activeSlug = state && state.active && state.active.appSlug ? state.active.appSlug : null;

      return [
        {
          id: "dashboard",
          iconAsset: "dashboard",
          iconFallback: "🏠",
          kicker: "Painel",
          title: "Dashboard",
          sub: "Visão central da Factory",
          body: "Entrada principal da Factory com visão geral e atalhos do fluxo.",
          chips: ["Dashboard", "Home", "Central"],
          actions: [{ label: "Abrir Dashboard", view: "dashboard", kind: "primary" }],
          expandable: false,
          headView: "dashboard"
        },
        {
          id: "apps",
          iconAsset: "apps",
          iconFallback: "📦",
          kicker: "Criação",
          title: "Apps",
          sub: appsCount ? `${appsCount} app(s) salvo(s)` : "Criar & gerenciar",
          body: "Área para criação e organização de apps dentro da Factory.",
          chips: ["Apps", "Criação", appsCount ? `${appsCount} salvos` : "Sem apps"],
          actions: [
            { label: "Abrir Apps", view: "newapp", kind: "primary" },
            { label: "Abrir Editor", view: "editor", kind: "ghost" }
          ],
          expandable: false,
          headView: "newapp"
        },
        {
          id: "editor",
          iconAsset: "editor",
          iconFallback: "✏️",
          kicker: "Código",
          title: "Editor",
          sub: activeSlug ? `App ativo: ${activeSlug}` : "Projetos & código",
          body: "Área de edição de arquivos e conteúdo dos apps ativos.",
          chips: ["Arquivos", "Código", activeSlug ? activeSlug : "Sem ativo"],
          actions: [{ label: "Abrir Editor", view: "editor", kind: "primary" }],
          expandable: false,
          headView: "editor"
        },
        {
          id: "agent",
          iconAsset: "agent-ai",
          iconFallback: "🤖",
          kicker: "Operação",
          title: "Agent",
          sub: "Comandos naturais e execução guiada",
          body: "Camada operacional do agente principal para fluxo assistido e ações dentro da Factory.",
          chips: ["Agent", "Execução", "CLI"],
          actions: [
            { label: "Abrir Agent", view: "agent", kind: "primary" },
            { label: "Abrir Agent IA", view: "agent-ia", kind: "ghost" }
          ],
          expandable: false,
          headView: "agent"
        },
        {
          id: "opportunity-scan",
          iconAsset: "opportunity-scanner",
          iconFallback: "📡",
          kicker: "Pesquisa",
          title: "Opportunity Scan",
          sub: "Procurar oportunidades rentáveis",
          body: "Scanner de oportunidades de apps com foco em viabilidade e lucro. Esta área é separada do Generator.",
          chips: ["Scanner", "Pesquisa", "Rentável"],
          actions: [{ label: "Abrir Opportunity Scan", view: "opportunity-scan", kind: "primary" }],
          expandable: false,
          headView: "opportunity-scan"
        },
        {
          id: "generator",
          iconAsset: "generator",
          iconFallback: "🧪",
          kicker: "Validação",
          title: "Generator",
          sub: "Gerar, testar e validar apps",
          body: "Área de build, preview, geração e validação técnica. Não compartilha função com Opportunity Scan.",
          chips: ["Build", "Teste", "Preview"],
          actions: [{ label: "Abrir Generator", view: "generator", kind: "primary" }],
          expandable: false,
          headView: "generator"
        },
        {
          id: "factory-ai",
          iconAsset: "factory-ai",
          iconFallback: "🏭",
          kicker: "Núcleo IA",
          title: "Factory AI",
          sub: "Supervisão e evolução da Factory",
          body: "Camada reservada para a IA da própria Factory, separada de Admin e de Agent.",
          chips: ["Core", "IA", "Supervisão"],
          actions: [{ label: "Abrir Factory AI", view: "factory-ai", kind: "primary" }],
          expandable: false,
          headView: "factory-ai"
        },
        {
          id: "admin",
          iconAsset: "admin",
          iconFallback: "⚙️",
          kicker: "Sistema",
          title: "Admin",
          sub: "Ferramentas internas e manutenção",
          body: "Área administrativa, ferramentas internas, manutenção e controle técnico do ambiente.",
          chips: ["Admin", "Sistema", "Tools"],
          actions: [
            { label: "Abrir Admin", view: "admin", kind: "primary" },
            { label: "Abrir Logs", view: "logs", kind: "ghost" }
          ],
          expandable: false,
          headView: "admin"
        },
        {
          id: "github",
          iconAsset: "github",
          iconFallback: "🐙",
          kicker: "Integração",
          title: "Github",
          sub: "Sync e versionamento",
          body: "Integração com sincronização, versionamento e operação de atualização vinda do núcleo.",
          chips: ["Github", "Sync", "Versionamento"],
          actions: [{ label: "Abrir Github", view: "github", kind: "primary" }],
          expandable: false,
          headView: "github"
        },
        {
          id: "updates",
          iconAsset: "updates",
          iconFallback: "🔄",
          kicker: "Atualização",
          title: "Updates",
          sub: "Fluxo de atualização e hotfix",
          body: "Área voltada a atualizações, hotfix e revisão do estado atual da Factory.",
          chips: ["Updates", "Hotfix", "Sync"],
          actions: [{ label: "Abrir Updates", view: "updates", kind: "primary" }],
          expandable: false,
          headView: "updates"
        },
        {
          id: "deploy",
          iconAsset: "deploy",
          iconFallback: "🚀",
          kicker: "Entrega",
          title: "Deploy",
          sub: "Preparar publicação e entrega",
          body: "Fluxo de deploy, entrega e revisão final antes de publicação dos apps.",
          chips: ["Deploy", "Entrega", "Build"],
          actions: [{ label: "Abrir Deploy", view: "deploy", kind: "primary" }],
          expandable: false,
          headView: "deploy"
        },
        {
          id: "settings",
          iconAsset: "settings",
          iconFallback: "🛠️",
          kicker: "Configuração",
          title: "Settings",
          sub: "Parâmetros e preferências",
          body: "Configurações gerais da Factory, preferências e ajustes do ambiente interno.",
          chips: ["Settings", "Config", "Sistema"],
          actions: [{ label: "Abrir Settings", view: "settings", kind: "primary" }],
          expandable: false,
          headView: "settings"
        },
        {
          id: "logs",
          iconAsset: "logs",
          iconFallback: "📜",
          kicker: "Monitoramento",
          title: "Logs",
          sub: "Histórico e acompanhamento",
          body: "Visualização de logs, rastros e registro de atividade do sistema.",
          chips: ["Logs", "Histórico", "Monitoramento"],
          actions: [{ label: "Abrir Logs", view: "logs", kind: "primary" }],
          expandable: false,
          headView: "logs"
        },
        {
          id: "diagnostics",
          iconAsset: "diagnostics",
          iconFallback: "🩺",
          kicker: "Diagnóstico",
          title: "Diagnostics",
          sub: "Verificação e estabilidade",
          body: "Área de diagnóstico e estabilidade para validar integridade e comportamento da Factory.",
          chips: ["Diag", "Check", "Stability"],
          actions: [{ label: "Abrir Diagnostics", view: "diagnostics", kind: "primary" }],
          expandable: false,
          headView: "diagnostics"
        },
        {
          id: "rcf-factory-special",
          iconAsset: "rcf-factory-special",
          iconFallback: "🏗️",
          kicker: "Factory",
          title: "RCF Factory",
          sub: "Core, tools e manutenção especial",
          body: "Card especial do núcleo da Factory. Aqui ficam os acessos de ferramentas, doctor e manutenção central, sem misturar com Factory AI.",
          chips: ["Factory", "Core", "Doctor"],
          actions: [
            { label: "Abrir Tools", action: "open-tools", kind: "primary" },
            { label: "Abrir Doctor", action: "open-doctor", kind: "ghost" },
            { label: "Abrir Admin", view: "admin", kind: "ghost" }
          ],
          expandable: true
        }
      ];
    },

    _renderAppsSnapshot() {
      const state = this._getState();
      const apps = Array.isArray(state.apps) ? state.apps.slice(0, 4) : [];
      if (!apps.length) return `<div class="rcfDashEmpty">Nenhum app salvo ainda.</div>`;

      return `
        <div class="rcfDashAppsList">
          ${apps.map(app => `
            <div class="rcfDashAppItem">
              <div class="rcfDashAppMeta">
                <div class="rcfDashAppName">${this._esc(app.name || app.slug || "App")}</div>
                <div class="rcfDashAppSlug">${this._esc(app.slug || "-")}</div>
              </div>
              <button class="rcfDashAppGo" type="button" data-rcf-open-view="editor" data-rcf-app-slug="${this._escAttr(app.slug || "")}">Abrir</button>
            </div>
          `).join("")}
        </div>
      `;
    },

    render() {
      const view = document.querySelector(this._viewSel);
      const grid = view && view.querySelector(this._gridSel);
      if (!view || !grid) return false;

      const cards = this._cards();
      this._expanded = null;

      grid.innerHTML = cards.map(card => {
        const open = !!(card.expandable && this._expanded === card.id);
        const extraApps = card.id === "apps" ? this._renderAppsSnapshot() : "";
        const iconSrc = this._moduleAsset(card.iconAsset);
        const hasBody = !!card.expandable;

        return `
          <article class="rcfDashCard${open ? " is-open" : ""}" data-rcf-card="${this._escAttr(card.id)}">
            <button
              class="rcfDashCardHead"
              type="button"
              aria-expanded="${open ? "true" : "false"}"
              data-rcf-toggle-card="${this._escAttr(card.id)}"
              data-rcf-expandable="${card.expandable ? "1" : "0"}"
              ${card.headView ? `data-rcf-head-view="${this._escAttr(card.headView)}"` : ""}
            >
              <span class="rcfDashCardIconWrap" aria-hidden="true">
                <img
                  class="rcfDashCardIcon"
                  src="${this._escAttr(iconSrc)}"
                  alt="${this._escAttr(card.title)}"
                  loading="lazy"
                  decoding="async"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"
                />
                <span class="rcfDashCardIconFallback" style="display:none;">${this._esc(card.iconFallback || "•")}</span>
              </span>
              <span class="rcfDashCardText">
                <span class="rcfDashCardKicker">${this._esc(card.kicker)}</span>
                <span class="rcfDashCardTitle">${this._esc(card.title)}</span>
                <span class="rcfDashCardSub">${this._esc(card.sub)}</span>
              </span>
              <span class="rcfDashCardArrow" aria-hidden="true">›</span>
            </button>
            ${hasBody ? `
              <div class="rcfDashCardBody">
                <p>${this._esc(card.body)}</p>
                <div class="rcfDashMeta">
                  ${(card.chips || []).map(ch => `<span class="rcfDashMetaChip">${this._esc(ch)}</span>`).join("")}
                </div>
                ${extraApps}
                <div class="rcfDashActions">
                  ${(card.actions || []).map(action => `
                    <button
                      class="rcfDashActionBtn ${this._escAttr(action.kind || "ghost")}"
                      type="button"
                      ${action.view ? `data-rcf-open-view="${this._escAttr(action.view)}"` : ""}
                      ${action.action ? `data-rcf-action="${this._escAttr(action.action)}"` : ""}
                    >${this._esc(action.label || "Abrir")}</button>
                  `).join("")}
                </div>
              </div>
            ` : ""}
          </article>
        `;
      }).join("");

      return true;
    },

    _bindGlobal() {
      if (this._globalBound) return;
      this._globalBound = true;

      document.addEventListener("click", (ev) => {
        const toggle = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-toggle-card]") : null;
        if (toggle) {
          ev.preventDefault();

          const expandable = String(toggle.getAttribute("data-rcf-expandable") || "0") === "1";
          const headView = String(toggle.getAttribute("data-rcf-head-view") || "").trim();
          const id = String(toggle.getAttribute("data-rcf-toggle-card") || "").trim();

          if (!expandable && headView) {
            this._fastNavigate(headView);
            return;
          }

          if (expandable) {
            this.toggleCard(id);
            return;
          }
        }

        const openBtn = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-open-view], [data-rcf-action]") : null;
        if (openBtn) {
          ev.preventDefault();

          const slug = String(openBtn.getAttribute("data-rcf-app-slug") || "").trim();
          if (slug) this._setActiveApp(slug);

          const action = String(openBtn.getAttribute("data-rcf-action") || "").trim();
          if (action === "open-tools") {
            this._openTools();
            return;
          }
          if (action === "open-doctor") {
            this._runDoctor();
            return;
          }

          const view = String(openBtn.getAttribute("data-rcf-open-view") || "").trim();
          if (view) this._fastNavigate(view);
        }
      }, { passive: false });

      window.addEventListener("RCF:UI_READY", () => {
        try { this.refresh(this._ctx || {}); } catch {}
      });
    },

    _bindWithinDashboard() {
      const view = document.querySelector(this._viewSel);
      if (!view || view.__rcf_dashboard_bound__) return;
      view.__rcf_dashboard_bound__ = true;
    },

    toggleCard(id) {
      const next = String(id || "").trim();
      if (!next) return false;

      const cards = this._cards();
      const meta = cards.find(c => c.id === next);
      if (!meta || !meta.expandable) return false;

      this._expanded = (this._expanded === next) ? null : next;

      const grid = document.querySelector(this._gridSel);
      if (!grid) return false;

      grid.querySelectorAll(".rcfDashCard").forEach(card => {
        const cardId = card.getAttribute("data-rcf-card");
        const willOpen = (cardId === next && this._expanded === next);
        card.classList.toggle("is-open", willOpen);
        const btn = card.querySelector("[data-rcf-toggle-card]");
        if (btn) btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });

      this._markDashboardMode();
      return true;
    },

    _markDashboardMode() {
      try {
        const root = document.querySelector(this._rootSel);
        const state = this._getState();
        const current = state && state.active ? String(state.active.view || "dashboard") : "dashboard";
        if (!root) return;
        if (current === "dashboard") root.setAttribute("data-rcf-dashboard-mode", "cards");
        else root.removeAttribute("data-rcf-dashboard-mode");
      } catch {}
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

  window.RCF_UI_DASHBOARD = Object.assign(window.RCF_UI_DASHBOARD || {}, MOD);
})();

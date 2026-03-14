/* FILE: /app/js/ui/ui_dashboard.js
   RControl Factory — UI Dashboard
   - Home mobile com cards verticais expansíveis
   - Remove dashboard tradicional aberto da Home
   - Cards começam fechados
   - Generator separado de Opportunity Scan
   - Compatível com Safari / iPhone / PWA
   - Seguro para init + mount + refresh
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
    _stateKey: "rcf:dashboard:expandedCard",
    _boundGlobal: false,

    init(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._expanded = this._readExpanded();
      this._ensureStyle();
      this._bindGlobal();
      return true;
    },

    mount(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._expanded = this._readExpanded();
      this._ensureStyle();
      this._ensureDashboardShell();
      this.render();
      this._markDashboardMode();
      this._booted = true;
      return true;
    },

    remountSoft(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      this._ensureDashboardShell();
      this.render();
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

    _ensureStyle() {
      if (document.getElementById(this._styleId)) return;

      const st = document.createElement("style");
      st.id = this._styleId;
      st.textContent = `
#rcfRoot[data-rcf-dashboard-mode="cards"] .tabs{
  display:none !important;
}

#view-dashboard .rcfDashLegacy,
#view-dashboard .rcfDashLegacyNav,
#view-dashboard .rcfDashTopNav,
#view-dashboard .rcfDashHorizontalNav,
#view-dashboard .rcfDashHero,
#view-dashboard .rcfDashMetrics,
#view-dashboard .rcfDashPanels,
#view-dashboard .rcfUiSection,
#view-dashboard .rcfUiDashboardSection{
  display:none !important;
}

#view-dashboard{
  padding:0 !important;
  background:transparent !important;
  border:0 !important;
  box-shadow:none !important;
}

#view-dashboard .rcfDashMobileHome{
  display:block;
  width:100%;
}

#view-dashboard .rcfDashIntro{
  display:grid;
  gap:8px;
  margin:0 0 14px 0;
  padding:0 2px;
}

#view-dashboard .rcfDashEyebrow{
  font-size:11px;
  font-weight:800;
  letter-spacing:.12em;
  text-transform:uppercase;
  opacity:.72;
}

#view-dashboard .rcfDashTitle{
  margin:0;
  font-size:clamp(22px,3vw,30px);
  line-height:1.02;
  font-weight:900;
}

#view-dashboard .rcfDashText{
  margin:0;
  opacity:.78;
  line-height:1.4;
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
  border-radius:22px;
  border:1px solid rgba(78,104,154,.10);
  background:linear-gradient(180deg,rgba(255,255,255,.88),rgba(245,248,253,.74));
  box-shadow:0 14px 32px rgba(24,40,73,.08), inset 0 1px 0 rgba(255,255,255,.88);
  backdrop-filter:blur(10px);
  -webkit-backdrop-filter:blur(10px);
}

#view-dashboard .rcfDashCard::before{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  background:
    radial-gradient(circle at 10% 10%, rgba(255,255,255,.65), rgba(255,255,255,0) 20%),
    linear-gradient(135deg, rgba(95,145,255,.05), rgba(95,145,255,0) 32%, rgba(255,181,110,.04) 100%, rgba(255,181,110,0));
}

#view-dashboard .rcfDashCard > *{
  position:relative;
  z-index:1;
}

#view-dashboard .rcfDashCardHead{
  display:flex;
  align-items:center;
  gap:14px;
  width:100%;
  padding:16px 16px 15px;
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

#view-dashboard .rcfDashCardIcon{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:54px;
  height:54px;
  min-width:54px;
  border-radius:18px;
  font-size:24px;
  font-weight:900;
  background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(232,238,248,.92));
  border:1px solid rgba(86,112,155,.10);
  box-shadow:0 10px 20px rgba(25,38,66,.08), inset 0 1px 0 rgba(255,255,255,.9);
}

#view-dashboard .rcfDashCardText{
  min-width:0;
  flex:1 1 auto;
}

#view-dashboard .rcfDashCardKicker{
  display:block;
  font-size:11px;
  font-weight:800;
  letter-spacing:.12em;
  text-transform:uppercase;
  opacity:.66;
  margin:0 0 4px;
}

#view-dashboard .rcfDashCardTitle{
  display:block;
  margin:0;
  font-size:18px;
  line-height:1.05;
  font-weight:900;
}

#view-dashboard .rcfDashCardSub{
  display:block;
  margin:5px 0 0;
  font-size:12px;
  line-height:1.35;
  opacity:.78;
}

#view-dashboard .rcfDashCardArrow{
  flex:0 0 auto;
  font-size:22px;
  line-height:1;
  opacity:.42;
  transform:translateY(-1px) rotate(0deg);
  transition:transform .18s ease, opacity .18s ease;
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
  line-height:1.42;
  opacity:.84;
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
  border:1px solid rgba(74,98,138,.10);
  background:rgba(255,255,255,.56);
  font-size:12px;
  font-weight:700;
  opacity:.84;
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
  min-height:42px;
  padding:10px 14px;
  border-radius:14px;
  border:1px solid rgba(74,98,138,.10);
  background:rgba(255,255,255,.72);
  color:inherit;
  font-size:13px;
  font-weight:800;
  text-decoration:none;
  cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}

#view-dashboard .rcfDashActionBtn.primary{
  background:linear-gradient(180deg,rgba(95,145,255,.16),rgba(95,145,255,.08));
  border-color:rgba(95,145,255,.16);
}

#view-dashboard .rcfDashActionBtn.ghost{
  background:rgba(255,255,255,.58);
}

#view-dashboard .rcfDashActionBtn:focus{
  outline:none;
}

#view-dashboard .rcfDashEmpty{
  padding:16px;
  border-radius:18px;
  border:1px dashed rgba(84,105,145,.18);
  background:rgba(255,255,255,.42);
  text-align:center;
  font-size:13px;
  opacity:.8;
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
  border:1px solid rgba(74,98,138,.08);
  background:rgba(255,255,255,.54);
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
  font-weight:800;
}

#view-dashboard .rcfDashAppSlug{
  font-size:11px;
  opacity:.66;
  margin-top:2px;
}

#view-dashboard .rcfDashAppGo{
  flex:0 0 auto;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:38px;
  min-height:38px;
  padding:8px 10px;
  border-radius:12px;
  border:1px solid rgba(74,98,138,.08);
  background:rgba(255,255,255,.72);
  font-weight:800;
  cursor:pointer;
}

@media (min-width: 721px){
  #view-dashboard .rcfDashCards{
    gap:14px;
  }
}

@media (max-width: 720px){
  #view-dashboard .rcfDashIntro{
    margin-bottom:12px;
  }

  #view-dashboard .rcfDashCard{
    border-radius:24px;
  }

  #view-dashboard .rcfDashCardHead{
    padding:17px 16px 16px;
  }

  #view-dashboard .rcfDashCardIcon{
    width:58px;
    height:58px;
    min-width:58px;
    border-radius:19px;
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

    _readExpanded() {
      try {
        const raw = localStorage.getItem(this._stateKey);
        return raw ? String(raw) : null;
      } catch {
        return null;
      }
    },

    _writeExpanded(id) {
      try {
        if (!id) localStorage.removeItem(this._stateKey);
        else localStorage.setItem(this._stateKey, String(id));
      } catch {}
    },

    _getState() {
      const ctxState = this._ctx && this._ctx.State;
      const rootState = window.RCF && window.RCF.state;
      return ctxState || rootState || { apps: [], active: { view: "dashboard" } };
    },

    _setView(view) {
      try {
        if (this._ctx && typeof this._ctx.setView === "function") return this._ctx.setView(view);
      } catch {}

      try {
        if (window.RCF && typeof window.RCF.setView === "function") return window.RCF.setView(view);
      } catch {}

      try {
        if (window.RCF_UI_VIEWS && typeof window.RCF_UI_VIEWS.setView === "function") {
          return window.RCF_UI_VIEWS.setView(view);
        }
      } catch {}

      try {
        if (window.RCF_UI_ROUTER && typeof window.RCF_UI_ROUTER.setView === "function") {
          return window.RCF_UI_ROUTER.setView(view);
        }
      } catch {}

      return false;
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

      if (!host.querySelector(".rcfDashIntro")) {
        const intro = document.createElement("div");
        intro.className = "rcfDashIntro";
        intro.innerHTML = `
          <div class="rcfDashEyebrow">RControl Factory</div>
          <h1 class="rcfDashTitle">Home</h1>
          <p class="rcfDashText">Fluxo mobile limpo com cards verticais expansíveis.</p>
        `;
        host.appendChild(intro);
      }

      if (!host.querySelector(this._gridSel)) {
        const grid = document.createElement("div");
        grid.id = this._gridSel.replace("#", "");
        grid.className = "rcfDashCards";
        host.appendChild(grid);
      }

      return true;
    },

    _cards() {
      const state = this._getState();
      const appsCount = Array.isArray(state.apps) ? state.apps.length : 0;
      const activeSlug = state && state.active && state.active.appSlug ? state.active.appSlug : null;

      return [
        {
          id: "apps",
          icon: "📦",
          kicker: "Criação",
          title: "Novo App",
          sub: appsCount ? `${appsCount} app(s) salvo(s)` : "Criar e organizar novos apps",
          body: "Crie um novo app dentro da Factory sem poluir a Home. A seção só abre quando você tocar no card.",
          chips: ["Apps", "Criação", appsCount ? `${appsCount} salvos` : "Sem apps"],
          actions: [
            { label: "Abrir Apps", view: "newapp", kind: "primary" }
          ]
        },
        {
          id: "editor",
          icon: "✏️",
          kicker: "Código",
          title: "Editor",
          sub: activeSlug ? `App ativo: ${activeSlug}` : "Abrir arquivos e editar conteúdo",
          body: "Use o Editor apenas quando quiser entrar no arquivo. Na Home ele aparece como resumo, não aberto por padrão.",
          chips: ["Arquivos", "Estado", activeSlug ? activeSlug : "Sem ativo"],
          actions: [
            { label: "Abrir Editor", view: "editor", kind: "primary" }
          ]
        },
        {
          id: "agent",
          icon: "🤖",
          kicker: "Operação",
          title: "Agente",
          sub: "Comandos naturais e execução guiada",
          body: "Área do agente principal para operação e comandos. Mantida separada da camada Agent IA para evitar mistura.",
          chips: ["CLI", "Ações", "Factory"],
          actions: [
            { label: "Abrir Agente", view: "agent", kind: "primary" },
            { label: "Abrir Agent IA", view: "agent-ia", kind: "ghost" }
          ]
        },
        {
          id: "opportunity-scan",
          icon: "📡",
          kicker: "Pesquisa",
          title: "Opportunity Scan",
          sub: "Encontrar oportunidades rentáveis de apps",
          body: "Esta área é exclusivamente para scanner de oportunidades. Não compartilha bloco visual nem semântica com Generator.",
          chips: ["Scanner", "Pesquisa", "Rentável"],
          actions: [
            { label: "Abrir Opportunity Scan", view: "opportunity-scan", kind: "primary" }
          ]
        },
        {
          id: "generator",
          icon: "🧪",
          kicker: "Validação",
          title: "Generator",
          sub: "Gerar, testar e validar apps",
          body: "Generator permanece separado do Opportunity Scan. Ele existe para build, testes e validação técnica.",
          chips: ["Build", "Teste", "Preview"],
          actions: [
            { label: "Abrir Generator", view: "generator", kind: "primary" }
          ]
        },
        {
          id: "factory-ai",
          icon: "🏭",
          kicker: "Núcleo IA",
          title: "Factory AI",
          sub: "Supervisão e evolução da Factory",
          body: "Camada reservada para a IA da própria Factory. Separada de Admin para não misturar sistema interno com visão evolutiva.",
          chips: ["Core", "IA", "Supervisão"],
          actions: [
            { label: "Abrir Factory AI", view: "factory-ai", kind: "primary" },
            { label: "Abrir Admin", view: "admin", kind: "ghost" }
          ]
        }
      ];
    },

    _renderAppsSnapshot() {
      const state = this._getState();
      const apps = Array.isArray(state.apps) ? state.apps.slice(0, 4) : [];
      if (!apps.length) {
        return `<div class="rcfDashEmpty">Nenhum app salvo ainda.</div>`;
      }

      return `
        <div class="rcfDashAppsList">
          ${apps.map(app => `
            <div class="rcfDashAppItem">
              <div class="rcfDashAppMeta">
                <div class="rcfDashAppName">${this._esc(app.name || app.slug || "App")}</div>
                <div class="rcfDashAppSlug">${this._esc(app.slug || "-")}</div>
              </div>
              <button
                class="rcfDashAppGo"
                type="button"
                data-rcf-open-view="editor"
                data-rcf-app-slug="${this._escAttr(app.slug || "")}"
              >Abrir</button>
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

      if (!this._expanded || !cards.some(c => c.id === this._expanded)) {
        this._expanded = null;
        this._writeExpanded(null);
      }

      grid.innerHTML = cards.map(card => {
        const open = this._expanded === card.id;
        const extraApps = card.id === "apps" ? this._renderAppsSnapshot() : "";

        return `
          <article class="rcfDashCard${open ? " is-open" : ""}" data-rcf-card="${this._escAttr(card.id)}">
            <button
              class="rcfDashCardHead"
              type="button"
              aria-expanded="${open ? "true" : "false"}"
              data-rcf-toggle-card="${this._escAttr(card.id)}"
            >
              <span class="rcfDashCardIcon" aria-hidden="true">${this._esc(card.icon)}</span>
              <span class="rcfDashCardText">
                <span class="rcfDashCardKicker">${this._esc(card.kicker)}</span>
                <span class="rcfDashCardTitle">${this._esc(card.title)}</span>
                <span class="rcfDashCardSub">${this._esc(card.sub)}</span>
              </span>
              <span class="rcfDashCardArrow" aria-hidden="true">›</span>
            </button>

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
                    data-rcf-open-view="${this._escAttr(action.view || "")}"
                  >${this._esc(action.label || "Abrir")}</button>
                `).join("")}
              </div>
            </div>
          </article>
        `;
      }).join("");

      return true;
    },

    _bindGlobal() {
      if (this._boundGlobal) return;
      this._boundGlobal = true;

      document.addEventListener("click", (ev) => {
        const toggle = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-toggle-card]") : null;
        if (toggle) {
          ev.preventDefault();
          const id = String(toggle.getAttribute("data-rcf-toggle-card") || "").trim();
          this.toggleCard(id);
          return;
        }

        const openBtn = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-open-view]") : null;
        if (openBtn) {
          ev.preventDefault();

          const slug = String(openBtn.getAttribute("data-rcf-app-slug") || "").trim();
          if (slug) {
            try {
              if (window.RCF_UI_RUNTIME && typeof window.RCF_UI_RUNTIME.setActiveApp === "function") {
                window.RCF_UI_RUNTIME.setActiveApp(slug);
              } else if (window.RCF && window.RCF.state && Array.isArray(window.RCF.state.apps)) {
                window.RCF.state.active = window.RCF.state.active || {};
                window.RCF.state.active.appSlug = slug;
              }
            } catch {}
          }

          const view = String(openBtn.getAttribute("data-rcf-open-view") || "").trim();
          if (view) this._setView(view);
          return;
        }
      }, { passive: false });

      window.addEventListener("RCF:UI_READY", () => {
        try { this.refresh(this._ctx || {}); } catch {}
      });

      window.addEventListener("resize", () => {
        try { this._markDashboardMode(); } catch {}
      }, { passive: true });
    },

    toggleCard(id) {
      const next = String(id || "").trim();
      if (!next) return false;

      this._expanded = (this._expanded === next) ? null : next;
      this._writeExpanded(this._expanded);
      this.render();
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

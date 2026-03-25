/* FILE: /app/js/ui/ui_dashboard.js
   RControl Factory — UI Dashboard
   V3.7 HOME CLICK + HARD ISOLATION FIX
   - Home leve e rápida para Safari / iPhone / PWA
   - Card normal abre tela direto pelo head
   - Dashboard e RCF Factory abrem painel próprio
   - Painel especial e grid nunca ficam conflitantes
   - Ícones não ficam vazios
   - Menos re-render pesado
   - Esconde shell/cabeçalho legado na Home
   - Mantém Dashboard card presente
   - Mantém RCF Factory como card especial
   - Rebiding seguro do click no #view-dashboard
   - Card normal publica data-view padrão
   - Fallback real de navegação caso o handler local falhe
   - Limpeza de estado visual ao sair da Home
   - Sincroniza aria-expanded e painéis especiais
   - HARD FIX: remove vazamento visual estranho dentro da Home
   - HARD FIX: bind direto dos cards/botões para Safari/iPhone
*/
(() => {
  "use strict";

  const MOD = {
    _ctx: null,
    _booted: false,
    _styleId: "rcfUiDashboardStyleV37",
    _rootSel: "#rcfRoot",
    _viewSel: "#view-dashboard",
    _surfaceSel: "#rcfDashboardSurface",
    _gridSel: "#rcfDashboardCards",
    _detailSel: "#rcfDashboardDetailPanel",
    _expandedCardId: null,
    _bindVersion: "v3.7",
    _openSpecialPanel: null,
    __uiReadyBound__: false,

    init(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      return true;
    },

    mount(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      if (!this._ensureDashboardShell()) return false;
      this._renderCards(true);
      this._bindWithinDashboard();
      this._markDashboardMode();
      this._syncDynamicBits();
      this._applySpecialPanelState();
      this._bindInteractiveElements();
      this._booted = true;
      return true;
    },

    remountSoft(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();
      if (!this._ensureDashboardShell()) return false;
      this._renderCards(true);
      this._bindWithinDashboard();
      this._markDashboardMode();
      this._syncDynamicBits();
      this._applySpecialPanelState();
      this._bindInteractiveElements();
      return true;
    },

    refresh(ctx = {}) {
      this._ctx = Object.assign({}, this._ctx || {}, ctx || {});
      this._ensureStyle();

      if (!this._ensureDashboardShell()) return false;

      this._markDashboardMode();

      const currentView = this._getCurrentView();
      if (currentView !== "dashboard" && !this._isDashboardActuallyVisible()) {
        this._closeTransientState();
        return true;
      }

      const grid = this._grid();
      if (!grid || !grid.children.length) {
        this._renderCards(true);
      } else {
        this._renderCards(false);
      }

      this._syncDynamicBits();
      this._applySpecialPanelState();
      this._bindInteractiveElements();
      return true;
    },

    destroy() {
      try {
        const root = document.querySelector(this._rootSel);
        if (root) root.removeAttribute("data-rcf-dashboard-mode");
      } catch {}

      try {
        this._expandedCardId = null;
        this._openSpecialPanel = null;
      } catch {}

      try {
        const view = this._view();
        if (view && view.__rcf_dashboard_click_handler__) {
          view.removeEventListener("click", view.__rcf_dashboard_click_handler__, false);
          view.__rcf_dashboard_click_handler__ = null;
        }
        if (view) {
          view.__rcf_dashboard_bind_version__ = "";
          view.__rcf_dashboard_bound__ = false;
        }
      } catch {}

      return true;
    },

    _view() {
      try { return document.querySelector(this._viewSel); } catch { return null; }
    },

    _surface() {
      try { return document.querySelector(this._surfaceSel); } catch { return null; }
    },

    _grid() {
      try { return document.querySelector(this._gridSel); } catch { return null; }
    },

    _detailPanel() {
      try { return document.querySelector(this._detailSel); } catch { return null; }
    },

    _normalizeView(view) {
      try {
        if (window.RCF && typeof window.RCF.normalizeViewName === "function") {
          return window.RCF.normalizeViewName(view);
        }
      } catch {}
      return String(view || "").trim().toLowerCase() || "dashboard";
    },

    _getCurrentView() {
      try {
        const state = this._getState();
        return this._normalizeView(state && state.active ? state.active.view : "dashboard");
      } catch {
        return "dashboard";
      }
    },

    _isDashboardActuallyVisible() {
      try {
        const view = this._view();
        if (!view) return false;
        if (view.classList.contains("active")) return true;
        if (view.getAttribute("data-rcf-visible") === "1") return true;
        if (view.hidden) return false;
        const cs = window.getComputedStyle(view);
        return cs.display !== "none" && cs.visibility !== "hidden";
      } catch {
        return false;
      }
    },

    _getState() {
      const ctxState = this._ctx && this._ctx.State;
      const rootState = window.RCF && window.RCF.state;
      return ctxState || rootState || { apps: [], active: { view: "dashboard", appSlug: null } };
    },

    _getApps() {
      const state = this._getState();
      return Array.isArray(state && state.apps) ? state.apps : [];
    },

    _getActiveSlug() {
      try {
        const state = this._getState();
        return state && state.active && state.active.appSlug ? String(state.active.appSlug) : "";
      } catch {
        return "";
      }
    },

    _getActiveApp() {
      try {
        if (this._ctx && typeof this._ctx.getActiveApp === "function") {
          return this._ctx.getActiveApp() || null;
        }
      } catch {}

      try {
        const slug = this._getActiveSlug();
        if (!slug) return null;
        return this._getApps().find(a => a && a.slug === slug) || null;
      } catch {}

      return null;
    },

    _setView(view) {
      try {
        if (this._ctx && typeof this._ctx.setView === "function") {
          return this._ctx.setView(view);
        }
      } catch {}

      try {
        if (window.RCF && typeof window.RCF.setView === "function") {
          return window.RCF.setView(view);
        }
      } catch {}

      try {
        if (window.RCF_UI_ROUTER && typeof window.RCF_UI_ROUTER.setView === "function") {
          return window.RCF_UI_ROUTER.setView(view);
        }
      } catch {}

      return false;
    },

    _setActiveApp(slug) {
      try {
        if (this._ctx && typeof this._ctx.setActiveApp === "function") {
          return this._ctx.setActiveApp(slug);
        }
      } catch {}

      try {
        if (window.RCF_UI_RUNTIME && typeof window.RCF_UI_RUNTIME.setActiveApp === "function") {
          return window.RCF_UI_RUNTIME.setActiveApp(slug);
        }
      } catch {}

      try {
        const state = this._getState();
        const apps = this._getApps();
        const app = apps.find(a => a && a.slug === slug);
        if (!app) return false;
        state.active = state.active || {};
        state.active.appSlug = slug;
        state.active.file = state.active.file || null;
        this._saveAll("dashboard.setActiveApp");
        return true;
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
        if (window.RCF_UI_RUNTIME && typeof window.RCF_UI_RUNTIME.openTools === "function") {
          window.RCF_UI_RUNTIME.openTools(true);
          return true;
        }
      } catch {}

      try {
        const d = document.getElementById("toolsDrawer");
        if (d) {
          d.classList.add("open");
          d.hidden = false;
          d.style.display = "";
          return true;
        }
      } catch {}

      return false;
    },

    _runDoctor() {
      try {
        if (window.RCF_DOCTOR_SCAN && typeof window.RCF_DOCTOR_SCAN.open === "function") {
          window.RCF_DOCTOR_SCAN.open();
          return true;
        }
      } catch {}

      try {
        if (window.RCF_DOCTOR_SCAN && typeof window.RCF_DOCTOR_SCAN.scan === "function") {
          window.RCF_DOCTOR_SCAN.scan();
          return true;
        }
      } catch {}

      try {
        if (window.RCF_DOCTOR && typeof window.RCF_DOCTOR.open === "function") {
          window.RCF_DOCTOR.open();
          return true;
        }
      } catch {}

      try {
        if (window.RCF_DOCTOR && typeof window.RCF_DOCTOR.scan === "function") {
          window.RCF_DOCTOR.scan();
          return true;
        }
      } catch {}

      try {
        if (window.RCF_DOCTOR && typeof window.RCF_DOCTOR.run === "function") {
          window.RCF_DOCTOR.run();
          return true;
        }
      } catch {}

      try {
        document.dispatchEvent(new CustomEvent("RCF:DOCTOR", { detail: { source: "ui_dashboard" } }));
      } catch {}

      try {
        const ok = this._openViewSafe("diagnostics");
        if (ok !== false) return true;
      } catch {}

      return false;
    },

    _saveAll(reason = "dashboard") {
      try {
        if (this._ctx && typeof this._ctx.saveAll === "function") {
          this._ctx.saveAll(reason);
          return true;
        }
      } catch {}
      return false;
    },

    _closeTransientState() {
      this._expandedCardId = null;
      this._openSpecialPanel = null;
      this._applyExpandedState();
      this._applySpecialPanelState();
    },

    _openViewSafe(view, slug = "") {
      const next = this._normalizeView(view);
      if (!next) return false;

      this._closeTransientState();

      try {
        if (slug) this._setActiveApp(slug);
      } catch {}

      try {
        const ok = this._setView(next);
        if (ok !== false) return true;
      } catch {}

      try {
        document.dispatchEvent(new CustomEvent("rcf:view", {
          detail: { view: next, source: "ui_dashboard" }
        }));
      } catch {}

      try {
        const btn = document.querySelector(`.rcfBottomNav [data-view="${next}"], .tabs [data-view="${next}"], [data-rcf-nav] [data-view="${next}"], button.tab[data-view="${next}"]`);
        if (btn && typeof btn.click === "function") {
          btn.click();
          return true;
        }
      } catch {}

      return false;
    },

    _openSpecial(name) {
      const panel = String(name || "").trim();
      if (!panel) return false;
      this._expandedCardId = null;
      this._openSpecialPanel = panel;
      this._applyExpandedState();
      this._applySpecialPanelState();
      return true;
    },

    _closeSpecial() {
      this._openSpecialPanel = null;
      this._applySpecialPanelState();
      return true;
    },

    _ensureStyle() {
      if (document.getElementById(this._styleId)) return;

      const st = document.createElement("style");
      st.id = this._styleId;
      st.textContent = `
#rcfRoot[data-rcf-dashboard-mode="cards"] > :not(#views):not(.rcfBottomNav):not(#rcfFab):not(#rcfFabPanel):not(#toolsDrawer){
  display:none !important;
}

#rcfRoot[data-rcf-dashboard-mode="cards"] #toolsDrawer:not(.open){
  display:none !important;
}

#rcfRoot[data-rcf-dashboard-mode="cards"] .tabs,
#rcfRoot[data-rcf-dashboard-mode="cards"] .topbar,
#rcfRoot[data-rcf-dashboard-mode="cards"] .header,
#rcfRoot[data-rcf-dashboard-mode="cards"] .brand,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashLegacy,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashLegacyNav,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashTopNav,
#rcfRoot[data-rcf-dashboard-mode="cards"] .rcfDashHorizontalNav,
#rcfRoot[data-rcf-dashboard-mode="cards"] .shell-header,
#rcfRoot[data-rcf-dashboard-mode="cards"] .shell-hero,
#rcfRoot[data-rcf-dashboard-mode="cards"] .shell-top,
#rcfRoot[data-rcf-dashboard-mode="cards"] .legacy-header,
#rcfRoot[data-rcf-dashboard-mode="cards"] .legacy-shell,
#rcfRoot[data-rcf-dashboard-mode="cards"] .legacy-topbar{
  display:none !important;
}

#view-dashboard{
  position:relative;
  overflow-anchor:none;
}

#view-dashboard > :not(.rcfDashMobileHome){
  display:none !important;
}

#view-dashboard .rcfDashMobileHome{
  display:block;
  width:100%;
  min-height:100%;
  padding:12px 0 28px;
}

#view-dashboard .rcfDashSurface{
  display:grid;
  gap:14px;
}

#view-dashboard .rcfDashHero{
  position:relative;
  overflow:hidden;
  border-radius:24px;
  border:1px solid rgba(112,128,162,.10);
  background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(246,248,252,.82));
  box-shadow:0 8px 18px rgba(29,42,72,.05);
  padding:16px;
}

#view-dashboard .rcfDashBrand{
  display:flex;
  align-items:center;
  gap:12px;
  min-width:0;
}

#view-dashboard .rcfDashBrandLogo,
#view-dashboard .rcfDashBrandFallback{
  width:62px;
  height:62px;
  min-width:62px;
  border-radius:18px;
  background:rgba(255,255,255,.92);
  border:1px solid rgba(100,116,145,.08);
}

#view-dashboard .rcfDashBrandLogo{
  object-fit:cover;
}

#view-dashboard .rcfDashBrandFallback{
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:22px;
  font-weight:900;
  color:#1d2b4d;
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
  background:rgba(255,255,255,.70);
  color:rgba(36,49,80,.88);
  font-size:12px;
  font-weight:800;
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
  border:1px solid rgba(108,125,160,.09);
  background:linear-gradient(180deg,rgba(255,255,255,.93),rgba(246,248,252,.80));
  box-shadow:0 8px 18px rgba(28,40,69,.05);
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
  touch-action:manipulation;
  position:relative;
  z-index:2;
}

#view-dashboard .rcfDashCardHead:focus,
#view-dashboard .rcfDashActionBtn:focus,
#view-dashboard .rcfDashAppGo:focus,
#view-dashboard .rcfDashDetailBack:focus{
  outline:none;
}

#view-dashboard .rcfDashCardIconWrap{
  position:relative;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:68px;
  height:68px;
  min-width:68px;
  border-radius:20px;
  border:1px solid rgba(106,124,159,.08);
  background:linear-gradient(180deg, rgba(255,255,255,.98), rgba(238,242,248,.92));
  overflow:hidden;
}

#view-dashboard .rcfDashCardIcon{
  position:relative;
  z-index:2;
  width:46px;
  height:46px;
  object-fit:cover;
  border-radius:14px;
  background:transparent;
}

#view-dashboard .rcfDashCardIconFallback{
  position:absolute;
  inset:0;
  z-index:1;
  display:flex;
  align-items:center;
  justify-content:center;
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
  transition:transform .16s ease, opacity .16s ease;
}

#view-dashboard .rcfDashCard.is-open .rcfDashCardArrow{
  transform:rotate(90deg);
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
  background:rgba(255,255,255,.68);
  font-size:12px;
  font-weight:800;
  color:rgba(37,50,78,.84);
}

#view-dashboard .rcfDashActions{
  display:grid;
  grid-template-columns:1fr;
  gap:8px;
}

#view-dashboard .rcfDashActionBtn,
#view-dashboard .rcfDashDetailBtn,
#view-dashboard .rcfDashAppGo{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:44px;
  padding:10px 14px;
  border-radius:14px;
  border:1px solid rgba(88,106,141,.09);
  background:rgba(255,255,255,.78);
  color:#243150;
  font-size:13px;
  font-weight:900;
  text-decoration:none;
  cursor:pointer;
  -webkit-tap-highlight-color:transparent;
  touch-action:manipulation;
  position:relative;
  z-index:2;
}

#view-dashboard .rcfDashActionBtn.primary,
#view-dashboard .rcfDashDetailBtn.primary{
  background:linear-gradient(180deg, rgba(112,152,255,.16), rgba(112,152,255,.08));
  border-color:rgba(112,152,255,.16);
}

#view-dashboard .rcfDashActionBtn.ghost,
#view-dashboard .rcfDashDetailBtn.ghost{
  background:rgba(255,255,255,.70);
}

#view-dashboard .rcfDashStats{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:8px;
}

#view-dashboard .rcfDashStat{
  padding:10px 12px;
  border-radius:14px;
  border:1px solid rgba(88,106,141,.08);
  background:rgba(255,255,255,.66);
}

#view-dashboard .rcfDashStatLabel{
  font-size:11px;
  font-weight:800;
  letter-spacing:.10em;
  text-transform:uppercase;
  opacity:.62;
  margin-bottom:4px;
}

#view-dashboard .rcfDashStatValue{
  font-size:18px;
  line-height:1.05;
  font-weight:900;
  color:#243150;
}

#view-dashboard .rcfDashEmpty{
  padding:16px;
  border-radius:18px;
  border:1px dashed rgba(84,105,145,.18);
  background:rgba(255,255,255,.50);
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
  background:rgba(255,255,255,.62);
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

#view-dashboard .rcfDashDetailPanel{
  display:none;
  position:relative;
  border-radius:22px;
  border:1px solid rgba(108,125,160,.10);
  background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(246,248,252,.86));
  box-shadow:0 10px 24px rgba(28,40,69,.06);
  padding:16px;
}

#view-dashboard .rcfDashDetailPanel.is-open{
  display:grid;
  gap:12px;
}

#view-dashboard .rcfDashDetailTop{
  display:flex;
  align-items:center;
  gap:10px;
}

#view-dashboard .rcfDashDetailBack{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:42px;
  padding:10px 14px;
  border-radius:14px;
  border:1px solid rgba(88,106,141,.09);
  background:rgba(255,255,255,.78);
  color:#243150;
  font-size:13px;
  font-weight:900;
  cursor:pointer;
}

#view-dashboard .rcfDashDetailTitle{
  margin:0;
  font-size:20px;
  line-height:1.08;
  font-weight:900;
  color:#243150;
}

#view-dashboard .rcfDashDetailText{
  margin:0;
  font-size:13px;
  line-height:1.46;
  color:rgba(37,50,78,.84);
}

#view-dashboard .rcfDashDetailActions{
  display:grid;
  grid-template-columns:1fr;
  gap:8px;
}

@media (max-width: 720px){
  #view-dashboard .rcfDashMobileHome{
    padding-top:10px;
  }
  #view-dashboard .rcfDashHero{
    border-radius:22px;
    padding:15px;
  }
  #view-dashboard .rcfDashCard{
    border-radius:22px;
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
      `.trim();

      document.head.appendChild(st);
    },

    _moduleAsset(name) {
      return `./assets/icons/modules/${name}.jpeg`;
    },

    _brandAsset() {
      return "./assets/icons/app/app-icon.png";
    },

    _purgeForeignChildren(view) {
      try {
        Array.from(view.children || []).forEach((child) => {
          if (child.classList && child.classList.contains("rcfDashMobileHome")) return;
          try { child.remove(); } catch {}
        });
      } catch {}
    },

    _purgeSurfaceForeign(surface, hero, grid, detail) {
      try {
        Array.from(surface.children || []).forEach((child) => {
          if (child === hero || child === grid || child === detail) return;
          try { child.remove(); } catch {}
        });
      } catch {}
    },

    _ensureDashboardShell() {
      const view = this._view();
      if (!view) return false;

      let host = view.querySelector(":scope > .rcfDashMobileHome");
      if (!host) {
        host = document.createElement("div");
        host.className = "rcfDashMobileHome";
      }

      this._purgeForeignChildren(view);

      if (!host.parentNode) {
        view.innerHTML = "";
        view.appendChild(host);
      }

      let surface = host.querySelector(":scope > " + this._surfaceSel);
      if (!surface) {
        surface = document.createElement("div");
        surface.id = this._surfaceSel.replace("#", "");
        surface.className = "rcfDashSurface";
        host.innerHTML = "";
        host.appendChild(surface);
      } else {
        Array.from(host.children || []).forEach((child) => {
          if (child !== surface) {
            try { child.remove(); } catch {}
          }
        });
      }

      let hero = surface.querySelector(":scope > .rcfDashHero");
      if (!hero) {
        hero = document.createElement("section");
        hero.className = "rcfDashHero";
        hero.innerHTML = `
          <div class="rcfDashBrand">
            <img
              class="rcfDashBrandLogo"
              src="${this._escAttr(this._brandAsset())}"
              alt="RCF"
              onerror="this.style.display='none';"
            />
            <span class="rcfDashBrandFallback">RCF</span>
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

      let grid = surface.querySelector(":scope > " + this._gridSel);
      if (!grid) {
        grid = document.createElement("div");
        grid.id = this._gridSel.replace("#", "");
        grid.className = "rcfDashCards";
        surface.appendChild(grid);
      }

      let detail = surface.querySelector(":scope > " + this._detailSel);
      if (!detail) {
        detail = document.createElement("section");
        detail.id = this._detailSel.replace("#", "");
        detail.className = "rcfDashDetailPanel";
        surface.appendChild(detail);
      }

      this._purgeSurfaceForeign(surface, hero, grid, detail);
      return true;
    },

    _cards() {
      const appsCount = this._getApps().length;
      const activeApp = this._getActiveApp();
      const activeSlug = activeApp && activeApp.slug ? activeApp.slug : "";

      return [
        {
          id: "dashboard-panel",
          iconAsset: "dashboard",
          iconFallback: "📊",
          kicker: "Painel",
          title: "Dashboard",
          sub: "Visão central da Factory",
          body: "Painel principal com leitura rápida do estado da Factory, apps ativos e operação geral.",
          chips: ["Painel", "Resumo", "Métricas"],
          specialPanel: "dashboard-panel",
          stats: [
            { label: "Apps", value: String(appsCount) },
            { label: "Ativo", value: activeSlug || "—" },
            { label: "Modo", value: "SAFE" },
            { label: "UI", value: "ON" }
          ],
          actions: [
            { label: "Atualizar painel", action: "refresh-dashboard", kind: "primary" },
            { label: "Abrir Logs", view: "logs", kind: "ghost" }
          ]
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
          extra: "apps",
          route: "newapp",
          actions: [
            { label: "Abrir Apps", view: "newapp", kind: "primary" },
            { label: "Abrir Editor", view: "editor", kind: "ghost" }
          ]
        },
        {
          id: "editor",
          iconAsset: "editor",
          iconFallback: "✏️",
          kicker: "Código",
          title: "Editor",
          sub: "Projetos & código",
          body: "Área de edição de arquivos e conteúdo dos apps ativos.",
          chips: ["Arquivos", "Código", activeSlug || "Sem ativo"],
          route: "editor",
          actions: [
            { label: "Abrir Editor", view: "editor", kind: "primary" }
          ]
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
          route: "agent",
          actions: [
            { label: "Abrir Agent", view: "agent", kind: "primary" },
            { label: "Abrir Agent IA", view: "agent-ia", kind: "ghost" }
          ]
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
          route: "opportunity-scan",
          actions: [
            { label: "Abrir Opportunity Scan", view: "opportunity-scan", kind: "primary" }
          ]
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
          route: "generator",
          actions: [
            { label: "Abrir Generator", view: "generator", kind: "primary" }
          ]
        },
        {
          id: "factory-ai",
          iconAsset: "factory-ai",
          iconFallback: "🏭",
          kicker: "Núcleo IA",
          title: "Factory AI",
          sub: "Supervisão e evolução da Factory",
          body: "Camada reservada para a IA da própria Factory, separada de Admin e Agent.",
          chips: ["Core", "IA", "Supervisão"],
          route: "factory-ai",
          actions: [
            { label: "Abrir Factory AI", view: "factory-ai", kind: "primary" }
          ]
        },
        {
          id: "admin",
          iconAsset: "admin",
          iconFallback: "⚙️",
          kicker: "Sistema",
          title: "Admin",
          sub: "Ferramentas internas e manutenção",
          body: "Área administrativa, manutenção e controle técnico do ambiente.",
          chips: ["Admin", "Sistema", "Tools"],
          route: "admin",
          actions: [
            { label: "Abrir Admin", view: "admin", kind: "primary" }
          ]
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
          route: "github",
          actions: [
            { label: "Abrir Github", view: "github", kind: "primary" }
          ]
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
          route: "updates",
          actions: [
            { label: "Abrir Updates", view: "updates", kind: "primary" }
          ]
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
          route: "deploy",
          actions: [
            { label: "Abrir Deploy", view: "deploy", kind: "primary" }
          ]
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
          route: "settings",
          actions: [
            { label: "Abrir Settings", view: "settings", kind: "primary" }
          ]
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
          route: "logs",
          actions: [
            { label: "Abrir Logs", view: "logs", kind: "primary" }
          ]
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
          route: "diagnostics",
          actions: [
            { label: "Abrir Diagnostics", view: "diagnostics", kind: "primary" }
          ]
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
          specialPanel: "rcf-factory-special",
          actions: [
            { label: "Abrir Tools", action: "open-tools", kind: "primary" },
            { label: "Abrir Doctor", action: "open-doctor", kind: "ghost" },
            { label: "Abrir Admin", view: "admin", kind: "ghost" }
          ]
        }
      ];
    },

    _renderAppsSnapshot() {
      const apps = this._getApps().slice(0, 4);
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
                data-view="editor"
                data-rcf-open-view="editor"
                data-rcf-app-slug="${this._escAttr(app.slug || "")}"
              >Abrir</button>
            </div>
          `).join("")}
        </div>
      `;
    },

    _renderStats(stats) {
      const arr = Array.isArray(stats) ? stats : [];
      if (!arr.length) return "";
      return `
        <div class="rcfDashStats">
          ${arr.map(item => `
            <div class="rcfDashStat">
              <div class="rcfDashStatLabel">${this._esc(item.label || "")}</div>
              <div class="rcfDashStatValue">${this._esc(item.value || "—")}</div>
            </div>
          `).join("")}
        </div>
      `;
    },

    _buildSpecialPanelHtml(name) {
      const appsCount = this._getApps().length;
      const activeApp = this._getActiveApp();
      const activeSlug = activeApp && activeApp.slug ? activeApp.slug : "—";

      if (name === "dashboard-panel") {
        return `
          <div class="rcfDashDetailTop">
            <button class="rcfDashDetailBack" type="button" data-rcf-close-special="1">← Voltar</button>
            <div>
              <h2 class="rcfDashDetailTitle">Dashboard</h2>
            </div>
          </div>
          <p class="rcfDashDetailText">Painel principal da Factory com leitura rápida do estado atual.</p>
          <div class="rcfDashStats">
            <div class="rcfDashStat"><div class="rcfDashStatLabel">Apps</div><div class="rcfDashStatValue">${this._esc(String(appsCount))}</div></div>
            <div class="rcfDashStat"><div class="rcfDashStatLabel">Ativo</div><div class="rcfDashStatValue">${this._esc(activeSlug)}</div></div>
            <div class="rcfDashStat"><div class="rcfDashStatLabel">Modo</div><div class="rcfDashStatValue">SAFE</div></div>
            <div class="rcfDashStat"><div class="rcfDashStatLabel">UI</div><div class="rcfDashStatValue">ON</div></div>
          </div>
          <div class="rcfDashDetailActions">
            <button class="rcfDashDetailBtn primary" type="button" data-rcf-action="refresh-dashboard">Atualizar painel</button>
            <button class="rcfDashDetailBtn ghost" type="button" data-view="logs" data-rcf-open-view="logs">Abrir Logs</button>
            <button class="rcfDashDetailBtn ghost" type="button" data-view="diagnostics" data-rcf-open-view="diagnostics">Abrir Diagnostics</button>
          </div>
        `;
      }

      if (name === "rcf-factory-special") {
        return `
          <div class="rcfDashDetailTop">
            <button class="rcfDashDetailBack" type="button" data-rcf-close-special="1">← Voltar</button>
            <div>
              <h2 class="rcfDashDetailTitle">RCF Factory</h2>
            </div>
          </div>
          <p class="rcfDashDetailText">Núcleo central da Factory com ferramentas, doctor e manutenção especial.</p>
          <div class="rcfDashMeta">
            <span class="rcfDashMetaChip">Factory</span>
            <span class="rcfDashMetaChip">Core</span>
            <span class="rcfDashMetaChip">Doctor</span>
          </div>
          <div class="rcfDashDetailActions">
            <button class="rcfDashDetailBtn primary" type="button" data-rcf-action="open-tools">Abrir Tools</button>
            <button class="rcfDashDetailBtn ghost" type="button" data-rcf-action="open-doctor">Abrir Doctor</button>
            <button class="rcfDashDetailBtn ghost" type="button" data-view="admin" data-rcf-open-view="admin">Abrir Admin</button>
          </div>
        `;
      }

      return "";
    },

    _applySpecialPanelState() {
      try {
        const panel = this._detailPanel();
        const grid = this._grid();
        if (!panel || !grid) return;

        if (!this._openSpecialPanel) {
          panel.classList.remove("is-open");
          panel.innerHTML = "";
          grid.style.display = "";
          return;
        }

        panel.innerHTML = this._buildSpecialPanelHtml(this._openSpecialPanel);
        panel.classList.add("is-open");
        grid.style.display = "none";
      } catch {}
    },

    _renderCards(force) {
      const grid = this._grid();
      if (!grid) return false;

      const cards = this._cards();
      const currentIds = Array.from(grid.querySelectorAll(".rcfDashCard[data-rcf-card]"))
        .map(el => String(el.getAttribute("data-rcf-card") || "")).join("|");
      const wantedIds = cards.map(c => c.id).join("|");

      if (!force && currentIds === wantedIds) {
        this._syncDynamicBits();
        this._applyExpandedState();
        this._bindInteractiveElements();
        return true;
      }

      grid.innerHTML = cards.map(card => {
        const iconSrc = this._moduleAsset(card.iconAsset);
        const extraApps = card.extra === "apps" ? this._renderAppsSnapshot() : "";
        const statsHtml = this._renderStats(card.stats);

        let headAttrs = "";
        if (card.route) {
          headAttrs = `data-view="${this._escAttr(card.route)}" data-rcf-route-view="${this._escAttr(card.route)}"`;
        } else if (card.specialPanel) {
          headAttrs = `data-rcf-special-panel="${this._escAttr(card.specialPanel)}"`;
        }

        return `
          <article class="rcfDashCard" data-rcf-card="${this._escAttr(card.id)}">
            <button
              class="rcfDashCardHead"
              type="button"
              aria-expanded="false"
              ${headAttrs}
            >
              <span class="rcfDashCardIconWrap" aria-hidden="true">
                <span class="rcfDashCardIconFallback">${this._esc(card.iconFallback || "•")}</span>
                <img
                  class="rcfDashCardIcon"
                  src="${this._escAttr(iconSrc)}"
                  alt="${this._escAttr(card.title)}"
                  loading="lazy"
                  decoding="async"
                  onerror="this.style.display='none';"
                />
              </span>
              <span class="rcfDashCardText">
                <span class="rcfDashCardKicker">${this._esc(card.kicker)}</span>
                <span class="rcfDashCardTitle">${this._esc(card.title)}</span>
                <span class="rcfDashCardSub">${this._esc(card.sub)}</span>
              </span>
              <span class="rcfDashCardArrow" aria-hidden="true">›</span>
            </button>
            <div class="rcfDashCardBody">
              <p>${this._esc(card.body)}</p>
              ${statsHtml}
              <div class="rcfDashMeta">
                ${(card.chips || []).map(ch => `<span class="rcfDashMetaChip">${this._esc(ch)}</span>`).join("")}
              </div>
              ${extraApps}
              <div class="rcfDashActions">
                ${(card.actions || []).map(action => `
                  <button
                    class="rcfDashActionBtn ${this._escAttr(action.kind || "ghost")}"
                    type="button"
                    ${action.view ? `data-view="${this._escAttr(action.view)}" data-rcf-open-view="${this._escAttr(action.view)}"` : ""}
                    ${action.action ? `data-rcf-action="${this._escAttr(action.action)}"` : ""}
                  >${this._esc(action.label || "Abrir")}</button>
                `).join("")}
              </div>
            </div>
          </article>
        `;
      }).join("");

      this._syncDynamicBits();
      this._applyExpandedState();
      this._bindInteractiveElements();
      return true;
    },

    _syncDynamicBits() {
      try {
        const appsCount = this._getApps().length;

        const appsCard = document.querySelector('[data-rcf-card="apps"] .rcfDashCardSub');
        if (appsCard) {
          appsCard.textContent = appsCount ? `${appsCount} app(s) salvo(s)` : "Criar & gerenciar";
        }

        const appsBody = document.querySelector('[data-rcf-card="apps"] .rcfDashCardBody');
        if (appsBody) {
          const existing = appsBody.querySelector(".rcfDashAppsList, .rcfDashEmpty");
          const html = this._renderAppsSnapshot();
          if (existing) existing.outerHTML = html;
        }

        if (this._openSpecialPanel) {
          this._applySpecialPanelState();
        }
      } catch {}
    },

    _applyExpandedState() {
      try {
        const grid = this._grid();
        if (!grid) return;

        grid.querySelectorAll(".rcfDashCard").forEach(card => {
          const id = String(card.getAttribute("data-rcf-card") || "");
          const open = !!this._expandedCardId && this._expandedCardId === id;
          card.classList.toggle("is-open", open);

          const head = card.querySelector(".rcfDashCardHead");
          if (head) {
            try { head.setAttribute("aria-expanded", open ? "true" : "false"); } catch {}
          }
        });
      } catch {}
    },

    _bindTap(el, fn) {
      if (!el || !fn) return;
      if (el.__rcf_dash_bound_v37) return;
      el.__rcf_dash_bound_v37 = true;

      const ctxBindTap = this._ctx && typeof this._ctx.bindTap === "function" ? this._ctx.bindTap : null;
      if (ctxBindTap) {
        try {
          ctxBindTap(el, fn);
          return;
        } catch {}
      }

      let last = 0;
      const handler = (ev) => {
        const now = Date.now();
        if (now - last < 240) return;
        last = now;
        try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
        try { ev?.stopPropagation?.(); } catch {}
        try { fn(ev); } catch {}
      };

      try {
        if (window.PointerEvent) el.addEventListener("pointerup", handler, { passive: false });
        else {
          el.addEventListener("touchend", handler, { passive: false });
          el.addEventListener("click", handler, { passive: false });
        }
      } catch {}
    },

    _bindInteractiveElements() {
      const view = this._view();
      if (!view) return false;

      try {
        view.querySelectorAll(".rcfDashCardHead[data-rcf-route-view], .rcfDashCardHead[data-view]").forEach((head) => {
          this._bindTap(head, () => {
            const next = String(head.getAttribute("data-rcf-route-view") || head.getAttribute("data-view") || "").trim();
            if (next) this._openViewSafe(next);
          });
        });

        view.querySelectorAll(".rcfDashCardHead[data-rcf-special-panel]").forEach((head) => {
          this._bindTap(head, () => {
            const panel = String(head.getAttribute("data-rcf-special-panel") || "").trim();
            if (panel) this._openSpecial(panel);
          });
        });

        view.querySelectorAll("[data-rcf-open-view]").forEach((btn) => {
          this._bindTap(btn, () => {
            const slug = String(btn.getAttribute("data-rcf-app-slug") || "").trim();
            const next = String(btn.getAttribute("data-rcf-open-view") || btn.getAttribute("data-view") || "").trim();
            if (next) this._openViewSafe(next, slug);
          });
        });

        view.querySelectorAll("[data-rcf-action]").forEach((btn) => {
          this._bindTap(btn, () => {
            const act = String(btn.getAttribute("data-rcf-action") || "").trim();
            if (act === "open-tools") {
              this._closeSpecial();
              this._openTools();
            } else if (act === "open-doctor") {
              this._closeSpecial();
              this._runDoctor();
            } else if (act === "refresh-dashboard") {
              this._syncDynamicBits();
              this._saveAll("dashboard.refresh");
            }
          });
        });

        view.querySelectorAll("[data-rcf-close-special]").forEach((btn) => {
          this._bindTap(btn, () => this._closeSpecial());
        });

        return true;
      } catch {
        return false;
      }
    },

    _bindWithinDashboard() {
      const view = this._view();
      if (!view) return;

      try {
        if (view.__rcf_dashboard_click_handler__) {
          view.removeEventListener("click", view.__rcf_dashboard_click_handler__, false);
        }
      } catch {}

      const handler = (ev) => {
        if (!this._isDashboardActuallyVisible()) return;

        const specialBtn = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-special-panel]") : null;
        if (specialBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          const panel = String(specialBtn.getAttribute("data-rcf-special-panel") || "").trim();
          if (panel) this._openSpecial(panel);
          return;
        }

        const closeSpecial = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-close-special]") : null;
        if (closeSpecial) {
          ev.preventDefault();
          ev.stopPropagation();
          this._closeSpecial();
          return;
        }

        const routeBtn = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-route-view]") : null;
        if (routeBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          const next = String(routeBtn.getAttribute("data-rcf-route-view") || routeBtn.getAttribute("data-view") || "").trim();
          if (next) this._openViewSafe(next);
          return;
        }

        const openBtn = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-open-view]") : null;
        if (openBtn) {
          ev.preventDefault();
          ev.stopPropagation();

          const slug = String(openBtn.getAttribute("data-rcf-app-slug") || "").trim();
          const next = String(openBtn.getAttribute("data-rcf-open-view") || openBtn.getAttribute("data-view") || "").trim();
          if (next) this._openViewSafe(next, slug);
          return;
        }

        const actionBtn = ev.target && ev.target.closest ? ev.target.closest("[data-rcf-action]") : null;
        if (actionBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          const act = String(actionBtn.getAttribute("data-rcf-action") || "").trim();

          if (act === "open-tools") {
            this._closeSpecial();
            this._openTools();
          } else if (act === "open-doctor") {
            this._closeSpecial();
            this._runDoctor();
          } else if (act === "refresh-dashboard") {
            this._syncDynamicBits();
            this._saveAll("dashboard.refresh");
          }
          return;
        }

        const head = ev.target && ev.target.closest ? ev.target.closest(".rcfDashCardHead") : null;
        if (head) {
          ev.preventDefault();
          ev.stopPropagation();

          const next = String(head.getAttribute("data-rcf-route-view") || head.getAttribute("data-view") || "").trim();
          const panel = String(head.getAttribute("data-rcf-special-panel") || "").trim();

          if (panel) {
            this._openSpecial(panel);
            return;
          }

          if (next) {
            this._openViewSafe(next);
            return;
          }
        }
      };

      view.addEventListener("click", handler, { passive: false });
      view.__rcf_dashboard_click_handler__ = handler;
      view.__rcf_dashboard_bind_version__ = this._bindVersion;
      view.__rcf_dashboard_bound__ = true;

      if (!this.__uiReadyBound__) {
        this.__uiReadyBound__ = true;
        window.addEventListener("RCF:UI_READY", () => {
          try { this.refresh(this._ctx || {}); } catch {}
        });
      }
    },

    _markDashboardMode() {
      try {
        const root = document.querySelector(this._rootSel);
        const current = this._getCurrentView();
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

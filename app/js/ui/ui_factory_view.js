/* FILE: /app/js/ui/ui_factory_view.js
   RControl Factory — Factory View Module
   V2.9 FACTORY-AI VISIBILITY GUARD + REAL MOUNT THROTTLE

   FECHADO:
   - Factory AI monta somente na view oficial
   - host visual estável para evitar tela branca
   - mantém apenas a casca mínima necessária
   - preserva somente slot oficial factoryai.tools
   - não cai em Admin
   - retries curtos e seguros para encaixar o módulo vivo
   - fallback visível se o chat ainda não entrar
   - compatível com app.js V8.x

   HARD FIX v2.9:
   - só tenta mount real da Factory AI quando a view oficial está visível/ativa
   - throttle real de mount do engine para evitar cascata 1..9
   - refresh leve fora da view oficial, sem reinjetar chat
   - não recria host à toa quando já existe host estável
   - limpa retries antigos antes de novos ciclos
*/
(() => {
  "use strict";

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  function nowMs() {
    try { return Date.now(); } catch { return 0; }
  }

  const API = {
    __deps: null,
    __mounted: false,
    __mountCount: 0,
    __retryTimers: [],
    __mountBusy: false,
    __retryQueued: false,
    __lastViewKey: "",
    __lastEngineMountAt: 0,
    __engineMountCooldownMs: 1600,
    __lastLightRefreshAt: 0,

    init(deps) {
      this.__deps = Object.assign({}, this.__deps || {}, deps || {});
      return this;
    },

    get d() {
      return this.__deps || {};
    },

    log(...args) {
      try {
        const L = this.d.Logger;
        if (L && typeof L.write === "function") {
          L.write("[ui_factory_view]", ...args);
          return;
        }
      } catch {}

      try {
        const LG = window.RCF_LOGGER;
        if (LG && typeof LG.push === "function") {
          LG.push("INFO", ["[ui_factory_view]", ...args].join(" "));
          return;
        }
      } catch {}

      try { console.log("[ui_factory_view]", ...args); } catch {}
    },

    resolveFactoryView() {
      const tries = [
        "#view-factory-ai",
        '[data-rcf-view="factory-ai"]',
        "#rcfFactoryAIView",
        "[data-rcf-factory-ai-view]"
      ];

      for (const sel of tries) {
        const el = qs(sel);
        if (!el) continue;

        const id = String(el.id || el.getAttribute("data-rcf-view") || el.getAttribute("data-rcf-factory-ai-view") || "").toLowerCase();
        if (!/factory-ai/.test(id) && !/view-factory-ai/.test(id)) continue;

        return el;
      }

      return null;
    },

    getViewKey(viewEl) {
      try {
        if (!viewEl) return "";
        return String(viewEl.id || viewEl.getAttribute("data-rcf-view") || viewEl.getAttribute("data-rcf-factory-ai-view") || "");
      } catch {
        return "";
      }
    },

    isOfficialViewVisible(viewEl = null) {
      try {
        const view = viewEl || this.resolveFactoryView();
        if (!view) return false;
        if (view.classList.contains("active")) return true;
        if (view.getAttribute("data-rcf-visible") === "1") return true;
        if (view.hidden) return false;

        const cs = window.getComputedStyle(view);
        if (!cs) return false;
        if (cs.display === "none" || cs.visibility === "hidden") return false;

        const st = window.RCF?.state?.active?.view;
        if (String(st || "").trim().toLowerCase() === "factory-ai") return true;

        return false;
      } catch {
        return false;
      }
    },

    isStableHostMounted(viewEl) {
      try {
        if (!viewEl) return false;
        const host = qs(':scope > [data-rcf-ui-factory-root="1"]', viewEl);
        if (!host) return false;
        const cleanRoot = qs('[data-rcf-ui-factory-chat-only="1"]', host);
        const tools = qs('#rcfFactoryAISlotTools', host);
        return !!(cleanRoot && tools);
      } catch {
        return false;
      }
    },

    ensureHost(viewEl) {
      if (!viewEl) return null;

      let host = qs(':scope > [data-rcf-ui-factory-root="1"]', viewEl);
      if (host) return host;

      host = document.createElement("div");
      host.setAttribute("data-rcf-ui-factory-root", "1");

      viewEl.innerHTML = "";
      viewEl.appendChild(host);

      return host;
    },

    buildView() {
      return `
        <section class="rcfUiSection rcfUiFactorySection" data-rcf-ui="factory-view">
          <div
            class="rcfUiFactoryView"
            data-rcf-ui-factory-view="1"
            data-rcf-ui-factory-clean="1"
            data-rcf-ui-factory-chat-only="1"
          >
            <section class="rcfUiFactoryBlock" data-rcf-factory-block="factory-ai-tools">
              <div class="rcfUiFactoryBlockHead">
                <h2>Factory AI</h2>
                <p class="hint">Chat oficial da Factory</p>
              </div>
              <div
                id="rcfFactoryAISlotTools"
                data-rcf-slot="factoryai.tools"
                data-rcf-factory-slot="tools"
              ></div>
            </section>
          </div>
        </section>
      `;
    },

    ensureFactoryAISlots(hostRoot = null) {
      const root =
        hostRoot ||
        qs('[data-rcf-ui-factory-view="1"]') ||
        qs('[data-rcf-ui-factory-root="1"]');

      if (!root) return false;

      let tools = qs("#rcfFactoryAISlotTools", root);

      if (!tools) {
        const block = qs('[data-rcf-factory-block="factory-ai-tools"]', root) || root;
        tools = document.createElement("div");
        tools.id = "rcfFactoryAISlotTools";
        tools.setAttribute("data-rcf-slot", "factoryai.tools");
        tools.setAttribute("data-rcf-factory-slot", "tools");
        block.appendChild(tools);
      }

      return true;
    },

    cleanupWrongContent(hostRoot = null) {
      const root =
        hostRoot ||
        qs('[data-rcf-ui-factory-view="1"]') ||
        qs('[data-rcf-ui-factory-root="1"]');

      if (!root) return false;

      const wrongSelectors = [
        "#rcfFactoryAISlotActions",
        "#rcfFactoryAIQuickActions",
        "#rcfFactoryAIStateMini",
        "#rcfFactoryAppsWidgetsSlot",
        "#rcfFactoryGatewaysSlot",
        "#rcfFactoryProjectsSlot",
        '[data-rcf-slot="factoryai.actions"]',
        '[data-rcf-factory-block="hero"]',
        '[data-rcf-factory-block="factory-ai-actions"]',
        '[data-rcf-factory-block="factory-ai-context"]',
        '[data-rcf-factory-block="apps-widgets"]',
        '[data-rcf-factory-block="gateways"]',
        '[data-rcf-factory-block="projects"]',
        '[data-rcf-ui-factory-fallback="gateways"]',
        ".rcfActivityList",
        ".rcfUiTabs",
        ".rcfUiProjectsList",
        ".rcfUiProjectItem",
        ".rcfUiCodePanel",
        ".rcfUiListGroup"
      ];

      wrongSelectors.forEach((sel) => {
        qsa(sel, root).forEach((el) => {
          try {
            if (el && el.id === "rcfFactoryAISlotTools") return;
            el.remove();
          } catch {}
        });
      });

      return true;
    },

    buildToolsFallback() {
      return `
        <div data-rcf-factory-ai-fallback="tools" class="card" style="margin-top:10px">
          <div style="font-weight:800;margin-bottom:6px">Factory AI</div>
          <div class="hint">Preparando chat oficial da Factory...</div>
        </div>
      `;
    },

    ensureVisibleFallbacks() {
      const tools = qs("#rcfFactoryAISlotTools");
      if (tools && !tools.firstElementChild) {
        tools.innerHTML = this.buildToolsFallback();
      }
      return true;
    },

    clearFallbacksIfRealContentMounted() {
      const tools = qs("#rcfFactoryAISlotTools");
      if (!tools) return true;

      const fallback = qs('[data-rcf-factory-ai-fallback="tools"]', tools);
      const mainBox = qs("#rcfFactoryAIBox", tools);

      if (fallback && mainBox) {
        try { fallback.remove(); } catch {}
      }

      return true;
    },

    hasRealIAMount() {
      try {
        const tools = qs("#rcfFactoryAISlotTools");
        const mainBox = qs("#rcfFactoryAIBox");
        if (mainBox) return true;
        if (tools && tools.querySelector("#rcfFactoryAIBox")) return true;
      } catch {}

      return false;
    },

    ensureStableHost(hostRoot = null) {
      const root =
        hostRoot ||
        qs('[data-rcf-ui-factory-root="1"]') ||
        qs('[data-rcf-ui-factory-view="1"]');

      if (!root) return false;

      const cleanRoot = qs('[data-rcf-ui-factory-chat-only="1"]', root);
      if (!cleanRoot) {
        root.innerHTML = this.buildView();
      }

      this.ensureFactoryAISlots(root);
      this.cleanupWrongContent(root);
      this.ensureVisibleFallbacks();

      return true;
    },

    _clearRetryTimers() {
      try {
        (this.__retryTimers || []).forEach((t) => clearTimeout(t));
      } catch {}
      this.__retryTimers = [];
    },

    _canRequestRealEngineMount() {
      try {
        if (!this.isOfficialViewVisible()) return false;
        const dt = nowMs() - Number(this.__lastEngineMountAt || 0);
        if (dt >= 0 && dt < this.__engineMountCooldownMs) return false;
        return true;
      } catch {
        return false;
      }
    },

    _requestRealEngineMountOnce() {
      let ok = false;

      if (!this._canRequestRealEngineMount()) {
        return false;
      }

      try { this.__lastEngineMountAt = nowMs(); } catch {}

      try { this.ensureStableHost(); } catch {}

      try {
        if (window.RCF_FACTORY_AI && typeof window.RCF_FACTORY_AI.mount === "function") {
          ok = window.RCF_FACTORY_AI.mount() !== false || ok;
        }
      } catch {}

      try {
        if (!ok && window.RCF_ADMIN_AI && typeof window.RCF_ADMIN_AI.mount === "function") {
          ok = window.RCF_ADMIN_AI.mount() !== false || ok;
        }
      } catch {}

      try { this.clearFallbacksIfRealContentMounted(); } catch {}
      return ok;
    },

    requestIAMountWithRetries() {
      if (!this.isOfficialViewVisible()) {
        this._clearRetryTimers();
        this.__retryQueued = false;
        return false;
      }

      if (this.hasRealIAMount()) {
        this.clearFallbacksIfRealContentMounted();
        this._clearRetryTimers();
        this.__retryQueued = false;
        return true;
      }

      if (this.__retryQueued) return true;
      this.__retryQueued = true;
      this._clearRetryTimers();

      try { this.ensureStableHost(); } catch {}
      try { this.ensureVisibleFallbacks(); } catch {}
      try { this._requestRealEngineMountOnce(); } catch {}

      [220, 700, 1400].forEach((ms) => {
        const id = setTimeout(() => {
          try {
            if (!this.isOfficialViewVisible()) return;
            if (this.hasRealIAMount()) {
              this.clearFallbacksIfRealContentMounted();
              return;
            }
            this._requestRealEngineMountOnce();
            if (!this.hasRealIAMount()) this.ensureVisibleFallbacks();
          } catch {}
        }, ms);
        this.__retryTimers.push(id);
      });

      const resetId = setTimeout(() => {
        this.__retryQueued = false;
      }, 1800);
      this.__retryTimers.push(resetId);

      return true;
    },

    refreshChildren() {
      try {
        if (!this.isOfficialViewVisible()) {
          const now = nowMs();
          if ((now - this.__lastLightRefreshAt) < 250) return true;
          this.__lastLightRefreshAt = now;
          return true;
        }

        if (this.hasRealIAMount()) {
          this.clearFallbacksIfRealContentMounted();
          try {
            if (window.RCF_FACTORY_AI && typeof window.RCF_FACTORY_AI.refresh === "function") {
              window.RCF_FACTORY_AI.refresh();
            } else if (window.RCF_ADMIN_AI && typeof window.RCF_ADMIN_AI.refresh === "function") {
              window.RCF_ADMIN_AI.refresh();
            }
          } catch {}
          return true;
        }
      } catch {}

      try { this.requestIAMountWithRetries(); } catch {}
      return true;
    },

    mount(ctx = {}) {
      this.init(ctx);

      try {
        if (this.__mountBusy) {
          this.log("mount skip: busy");
          return true;
        }
        this.__mountBusy = true;

        const view = this.resolveFactoryView();
        if (!view) {
          this.log("mount skip: factory-ai view ausente");
          return false;
        }

        const viewKey = this.getViewKey(view);
        const alreadyMounted = view.getAttribute("data-rcf-ui-factory-mounted") === "1" && this.isStableHostMounted(view);

        if (alreadyMounted && this.__lastViewKey === viewKey) {
          this.ensureStableHost(qs(':scope > [data-rcf-ui-factory-root="1"]', view) || view);
          this.refreshChildren();
          return true;
        }

        const host = this.ensureHost(view);
        if (!host) {
          this.log("mount skip: host ausente");
          return false;
        }

        if (!this.isStableHostMounted(view)) {
          host.innerHTML = this.buildView();
        }

        view.setAttribute("data-rcf-ui-factory-mounted", "1");
        view.setAttribute("data-rcf-ui-factory-ai-ready", "1");

        this.ensureStableHost(host);
        this.refreshChildren();

        this.__mounted = true;
        this.__lastViewKey = viewKey;
        this.__mountCount += 1;

        this.log("mount ok", "count=" + this.__mountCount);
        return true;
      } catch (e) {
        this.log("mount err:", e?.message || e);
        return false;
      } finally {
        this.__mountBusy = false;
      }
    },

    render(targetSelector) {
      try {
        if (targetSelector) {
          const el = this.d.$ ? this.d.$(targetSelector) : qs(targetSelector);
          if (!el) return false;

          el.innerHTML = this.buildView();
          el.setAttribute("data-rcf-factory-mounted", "1");

          this.ensureStableHost(el);
          this.refreshChildren();

          this.__mounted = true;
          return true;
        }
      } catch {}

      return this.mount(this.__deps || {});
    },

    refresh(ctx = {}) {
      this.init(ctx);

      try {
        const view = this.resolveFactoryView();
        const mounted = view && view.getAttribute("data-rcf-ui-factory-mounted") === "1";
        const host = view ? qs('[data-rcf-ui-factory-root="1"]', view) : null;

        if (!view) return false;

        if (!mounted || !host || !this.isStableHostMounted(view)) {
          return this.mount(this.__deps || {});
        }

        this.ensureStableHost(host);
        this.refreshChildren();
        return true;
      } catch (e) {
        this.log("refresh err:", e?.message || e);
        return false;
      }
    }
  };

  try {
    window.RCF_UI_FACTORY_VIEW = API;
  } catch {}

})();

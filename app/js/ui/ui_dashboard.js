/* FILE: /app/js/ui/ui_dashboard.js
   RControl Factory — Dashboard Module — V2 SAFE MOUNT
   - Compatível com app.js V8.1.1
   - Suporta init + mount + refresh
   - Evita dupla montagem
   - Resolve a view oficial/fallback automaticamente
   - Mantém dashboard leve e operacional
*/

(() => {
  "use strict";

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  const API = {
    __deps: null,
    __mounted: false,
    __mountCount: 0,

    init(deps) {
      this.__deps = Object.assign({}, this.__deps || {}, deps || {});
      return this;
    },

    get d() {
      return this.__deps || {};
    },

    log(...args) {
      try {
        const L = this.d.Logger || window.RCF_LOGGER;
        if (L && typeof L.write === "function") {
          L.write("[ui_dashboard]", ...args);
          return;
        }
      } catch {}
      try { console.log("[ui_dashboard]", ...args); } catch {}
    },

    escHtml(v) {
      try {
        if (typeof this.d.escapeHtml === "function") return this.d.escapeHtml(v);
      } catch {}
      return String(v ?? "").replace(/[&<>"]/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
      }[c]));
    },

    bind(el, fn) {
      if (!el || typeof fn !== "function") return;
      try {
        if (typeof this.d.bindTap === "function") {
          this.d.bindTap(el, fn);
          return;
        }
      } catch {}
      if (el.__rcf_dash_bound__) return;
      el.__rcf_dash_bound__ = true;
      try {
        el.addEventListener("click", fn, { passive: true });
      } catch {}
    },

    navTo(view) {
      try {
        if (typeof this.d.setView === "function") {
          this.d.setView(view);
          return true;
        }
      } catch {}

      try {
        if (window.RCF && typeof window.RCF.setView === "function") {
          window.RCF.setView(view);
          return true;
        }
      } catch {}

      try {
        document.dispatchEvent(new CustomEvent("rcf:view", { detail: { view } }));
        return true;
      } catch {}

      return false;
    },

    getState() {
      try { return this.d.State || window.RCF?.state || null; } catch { return null; }
    },

    getApps() {
      try {
        const State = this.getState();
        return Array.isArray(State?.apps) ? State.apps : [];
      } catch {
        return [];
      }
    },

    getAppsCount() {
      try { return this.getApps().length; } catch { return 0; }
    },

    getActiveApp() {
      try {
        if (typeof this.d.getActiveApp === "function") return this.d.getActiveApp();
      } catch {}

      try {
        const State = this.getState();
        const slug = State?.active?.appSlug;
        if (!slug) return null;
        const apps = this.getApps();
        return apps.find(a => a && a.slug === slug) || null;
      } catch {}

      return null;
    },

    getActiveAppLabel() {
      try {
        const app = this.getActiveApp();
        if (!app) return "Sem app ativo ✅";
        return `App ativo: ${app.name} (${app.slug}) ✅`;
      } catch {
        return "Sem app ativo ✅";
      }
    },

    getRecentLogs(limit = 4) {
      try {
        const Logger = this.d.Logger || null;
        const logs = Logger && typeof Logger.getAll === "function"
          ? Logger.getAll()
          : (window.RCF_LOGGER && typeof window.RCF_LOGGER.dump === "function"
              ? String(window.RCF_LOGGER.dump() || "").split("\n").filter(Boolean)
              : []);
        return Array.isArray(logs) ? logs.slice(-Math.max(1, limit)).reverse() : [];
      } catch {
        return [];
      }
    },

    resolveDashboardView() {
      const tries = [
        "#view-dashboard",
        '[data-rcf-view="dashboard"]',
        "#rcfRoot #view-dashboard"
      ];
      for (const sel of tries) {
        const el = qs(sel);
        if (el) return el;
      }
      return null;
    },

    ensureHost(viewEl) {
      if (!viewEl) return null;
      let host = qs('[data-rcf-ui-dashboard-root="1"]', viewEl);
      if (host) return host;

      host = document.createElement("div");
      host.setAttribute("data-rcf-ui-dashboard-root", "1");
      viewEl.innerHTML = "";
      viewEl.appendChild(host);
      return host;
    },

    buildHero() {
      const activeText = this.getActiveAppLabel();

      return `
        <div class="rcfDashHero" data-rcf-ui-dashboard-hero="1">
          <div class="rcfDashHeroHead">
            <div>
              <h1>Dashboard</h1>
              <p>Visão principal da Factory</p>
            </div>

            <div class="status-box">
              <div class="badge" id="dashActiveAppText">${this.escHtml(activeText)}</div>
              <div class="rcfDashQuickActions">
                <button class="btn small" type="button" data-rcf-dash-action="newapp">Criar App</button>
                <button class="btn small" type="button" data-rcf-dash-action="editor">Abrir Editor</button>
                <button class="btn small ghost" type="button" data-rcf-dash-action="agent">Agent</button>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    buildMetrics() {
      const count = this.getAppsCount();

      return `
        <div class="rcfDashMetrics" data-rcf-ui-dashboard-metrics="1">
          <div class="rcfMetricCard">
            <div class="rcfMetricLabel">Apps Ativos</div>
            <div class="rcfMetricValue" id="dashAppsCount">${String(count).padStart(2, "0")}</div>
          </div>

          <div class="rcfMetricCard">
            <div class="rcfMetricLabel">Projetos</div>
            <div class="rcfMetricValue" id="dashProjectsCount">${String(count).padStart(2, "0")}</div>
          </div>

          <div class="rcfMetricCard">
            <div class="rcfMetricLabel">IA Online</div>
            <div class="rcfMetricValue" id="dashAiStatus">--</div>
          </div>

          <div class="rcfMetricCard">
            <div class="rcfMetricLabel">Builds</div>
            <div class="rcfMetricValue" id="dashBuildsCount">${String(count).padStart(2, "0")}</div>
          </div>
        </div>
      `;
    },

    buildAppsSlot() {
      return `
        <div class="rcfDashPanel rcfDashPanelWide" data-rcf-ui-dashboard-apps="1">
          <h2>Projetos Recentes</h2>
          <div id="appsList" class="apps" data-rcf-slot="apps.list"></div>
        </div>
      `;
    },

    buildActivity() {
      const recent = this.getRecentLogs(
        window.RCF_UI_CONFIG?.get?.("dashboard.activityLimit", 4) ?? 4
      );

      const body = !recent.length
        ? `<div class="hint">Aguardando atividade...</div>`
        : recent.map(line => `<div class="rcfActivityItem">${this.escHtml(String(line))}</div>`).join("");

      return `
        <div class="rcfDashPanel" data-rcf-ui-dashboard-activity="1">
          <h2>Logs & Atividades</h2>
          <div id="dashActivityList" class="rcfActivityList">
            ${body}
          </div>
        </div>
      `;
    },

    buildAiPanel() {
      return `
        <div class="rcfDashPanel" data-rcf-ui-dashboard-ai="1">
          <h2>Factory AI</h2>
          <p class="hint">Acesse o agente da Factory para automação, comandos naturais e assistência no fluxo.</p>
          <div class="rcfAiPanel">
            <div class="badge" id="dashAiBadge">Sistema pronto ✅</div>
            <button class="btn ok" type="button" data-rcf-dash-action="agent">Iniciar IA</button>
          </div>
        </div>
      `;
    },

    buildPanels() {
      return `
        <div class="rcfDashPanels" data-rcf-ui-dashboard-panels="1">
          ${this.buildAppsSlot()}
          ${this.buildActivity()}
          ${this.buildAiPanel()}
        </div>
      `;
    },

    buildView() {
      return `
        <section class="rcfUiSection rcfUiDashboardSection" data-rcf-ui="dashboard-section">
          ${this.buildHero()}
          ${this.buildMetrics()}
          ${this.buildPanels()}
        </section>
      `;
    },

    bindActions(root) {
      try {
        const buttons = qsa("[data-rcf-dash-action]", root);
        buttons.forEach(btn => {
          if (btn.__rcf_dash_action_bound__) return;
          btn.__rcf_dash_action_bound__ = true;

          this.bind(btn, () => {
            const act = btn.getAttribute("data-rcf-dash-action");
            if (act === "newapp") this.navTo("newapp");
            else if (act === "editor") this.navTo("editor");
            else if (act === "agent") this.navTo("agent");
          });
        });
      } catch {}
    },

    renderAppsSlot() {
      try {
        if (typeof this.d.renderAppsList === "function") {
          this.d.renderAppsList();
          return true;
        }
      } catch {}

      try {
        const rt = window.RCF_UI_RUNTIME;
        if (rt && typeof rt.renderAppsList === "function") {
          rt.renderAppsList();
          return true;
        }
      } catch {}

      return false;
    },

    refreshNumbers(root = document) {
      try {
        const count = this.getAppsCount();
        const aiOnline = !!(window.RCF_ENGINE || window.RCF_AGENT_ZIP_BRIDGE || window.RCF_AI);

        const elApps = root.querySelector("#dashAppsCount");
        if (elApps) elApps.textContent = String(count).padStart(2, "0");

        const elProjects = root.querySelector("#dashProjectsCount");
        if (elProjects) elProjects.textContent = String(count).padStart(2, "0");

        const elBuilds = root.querySelector("#dashBuildsCount");
        if (elBuilds) elBuilds.textContent = String(count).padStart(2, "0");

        const elAi = root.querySelector("#dashAiStatus");
        if (elAi) elAi.textContent = aiOnline ? "ON" : "--";

        const aiBadge = root.querySelector("#dashAiBadge");
        if (aiBadge) aiBadge.textContent = aiOnline ? "IA online ✅" : "IA aguardando…";

        const activeText = root.querySelector("#dashActiveAppText");
        if (activeText) activeText.textContent = this.getActiveAppLabel();
      } catch {}
    },

    refreshActivity(root = document) {
      try {
        const box = root.querySelector("#dashActivityList");
        if (!box) return false;

        const recent = this.getRecentLogs(
          window.RCF_UI_CONFIG?.get?.("dashboard.activityLimit", 4) ?? 4
        );

        box.innerHTML = !recent.length
          ? `<div class="hint">Aguardando atividade...</div>`
          : recent.map(line => `<div class="rcfActivityItem">${this.escHtml(String(line))}</div>`).join("");

        return true;
      } catch {
        return false;
      }
    },

    mount(ctx = {}) {
      this.init(ctx);

      try {
        const view = this.resolveDashboardView();
        if (!view) {
          this.log("mount skip: view-dashboard ausente");
          return false;
        }

        const host = this.ensureHost(view);
        if (!host) {
          this.log("mount skip: host ausente");
          return false;
        }

        host.innerHTML = this.buildView();
        view.setAttribute("data-rcf-ui-dashboard-mounted", "1");

        this.bindActions(host);
        this.refreshNumbers(host);
        this.refreshActivity(host);
        this.renderAppsSlot();

        this.__mounted = true;
        this.__mountCount += 1;

        this.log("mount ok", "count=" + this.__mountCount);
        return true;
      } catch (e) {
        this.log("mount err:", e?.message || e);
        return false;
      }
    },

    render(target) {
      try {
        if (target) {
          const el = this.d.$ ? this.d.$(target) : qs(target);
          if (!el) return false;
          el.innerHTML = this.buildView();
          this.bindActions(el);
          this.refreshNumbers(el);
          this.refreshActivity(el);
          this.renderAppsSlot();
          this.__mounted = true;
          return true;
        }
      } catch {}
      return this.mount(this.__deps || {});
    },

    refresh(ctx = {}) {
      this.init(ctx);

      try {
        const view = this.resolveDashboardView();
        const mounted = view && view.getAttribute("data-rcf-ui-dashboard-mounted") === "1";
        const host = view ? qs('[data-rcf-ui-dashboard-root="1"]', view) : null;

        if (!mounted || !host) {
          return this.mount(this.__deps || {});
        }

        this.refreshNumbers(host);
        this.refreshActivity(host);
        this.renderAppsSlot();
        return true;
      } catch (e) {
        this.log("refresh err:", e?.message || e);
        return false;
      }
    }
  };

  try {
    window.RCF_UI_DASHBOARD = API;
  } catch {}

})();

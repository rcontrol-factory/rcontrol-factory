/* FILE: /app/js/ui/ui_dashboard.js
   RControl Factory — Dashboard Module
   - Estrutura inicial do dashboard UI
   - Agora com view própria
   - Contadores, atividade e ações rápidas
*/

(() => {

  "use strict";

  const API = {

    __deps: null,

    init(deps){
      this.__deps = deps || this.__deps || {};
      return this;
    },

    get d(){
      return this.__deps || {};
    },

    getAppsCount(){
      try{
        const State = this.d.State;
        return Array.isArray(State?.apps) ? State.apps.length : 0;
      }catch{
        return 0;
      }
    },

    getActiveAppLabel(){
      try{
        const app = this.d.helpers?.getActiveApp?.();
        if(!app) return "Sem app ativo ✅";
        return `App ativo: ${app.name} (${app.slug}) ✅`;
      }catch{
        return "Sem app ativo ✅";
      }
    },

    getRecentLogs(limit = 4){
      try{
        const Logger = this.d.Logger;
        const logs = Logger?.getAll ? Logger.getAll() : [];
        return logs.slice(-Math.max(1, limit)).reverse();
      }catch{
        return [];
      }
    },

    buildHero(){
      const d = this.d;
      const activeText = this.getActiveAppLabel();

      return `
        <div class="rcfDashHero" data-rcf-ui-dashboard-hero="1">

          <div class="rcfDashHeroHead">
            <div>
              <h1>Factory Dashboard</h1>
              <p>Painel principal da RControl Factory com visão rápida dos apps, atividade e operação.</p>
            </div>

            <div class="status-box">
              <div class="badge" id="activeAppText">${d.escapeHtml ? d.escapeHtml(activeText) : activeText}</div>
              <button class="btn small" type="button" data-rcf-dash-action="newapp">Criar App</button>
              <button class="btn small" type="button" data-rcf-dash-action="editor">Abrir Editor</button>
              <button class="btn small ghost" type="button" data-rcf-dash-action="agent">Agent</button>
            </div>
          </div>

        </div>
      `;
    },

    buildMetrics(){
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

    buildActivity(){
      const d = this.d;
      const recent = this.getRecentLogs(
        window.RCF_UI_CONFIG?.get?.("dashboard.activityLimit", 4) ?? 4
      );

      const body = !recent.length
        ? `<div class="hint">Aguardando atividade...</div>`
        : recent.map(line => `<div class="rcfActivityItem">${d.escapeHtml ? d.escapeHtml(String(line)) : String(line)}</div>`).join("");

      return `
        <div class="rcfDashPanel" data-rcf-ui-dashboard-activity="1">
          <h2>Logs & Atividades</h2>
          <div id="dashActivityList" class="rcfActivityList">
            ${body}
          </div>
        </div>
      `;
    },

    buildAiPanel(){
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

    buildAppsSlot(){
      return `
        <div class="rcfDashPanel rcfDashPanelWide" data-rcf-ui-dashboard-apps="1">
          <h2>Projetos Recentes</h2>
          <div id="appsList" class="apps" data-rcf-slot="apps.list"></div>
        </div>
      `;
    },

    buildPanels(){
      return `
        <div class="rcfDashPanels" data-rcf-ui-dashboard-panels="1">
          ${this.buildAppsSlot()}
          ${this.buildActivity()}
          ${this.buildAiPanel()}
        </div>
      `;
    },

    buildView(){
      return `
        <section class="rcfUiSection rcfUiDashboardSection" data-rcf-ui="dashboard-section">
          ${this.buildHero()}
          ${this.buildMetrics()}
          ${this.buildPanels()}
        </section>
      `;
    },

    bindActions(root){
      try{
        const buttons = Array.from(root.querySelectorAll("[data-rcf-dash-action]"));
        buttons.forEach(btn => {
          if(btn.__rcf_dash_bound__) return;
          btn.__rcf_dash_bound__ = true;

          btn.addEventListener("click", () => {
            const act = btn.getAttribute("data-rcf-dash-action");
            if(act === "newapp") window.RCF?.setView?.("newapp");
            else if(act === "editor") window.RCF?.setView?.("editor");
            else if(act === "agent") window.RCF?.setView?.("agent");
          }, { passive: true });
        });
      }catch{}
    },

    refreshNumbers(root = document){
      try{
        const count = this.getAppsCount();
        const aiOnline = !!(window.RCF_ENGINE || window.RCF_AGENT_ZIP_BRIDGE || window.RCF_AI);

        const elApps = root.querySelector("#dashAppsCount");
        if(elApps) elApps.textContent = String(count).padStart(2, "0");

        const elProjects = root.querySelector("#dashProjectsCount");
        if(elProjects) elProjects.textContent = String(count).padStart(2, "0");

        const elBuilds = root.querySelector("#dashBuildsCount");
        if(elBuilds) elBuilds.textContent = String(count).padStart(2, "0");

        const elAi = root.querySelector("#dashAiStatus");
        if(elAi) elAi.textContent = aiOnline ? "ON" : "--";

        const aiBadge = root.querySelector("#dashAiBadge");
        if(aiBadge) aiBadge.textContent = aiOnline ? "IA online ✅" : "IA aguardando…";

        const activeText = root.querySelector("#activeAppText");
        if(activeText) activeText.textContent = this.getActiveAppLabel();
      }catch{}
    },

    render(target){
      const d = this.d;

      try{
        const el = d.$ ? d.$(target) : null;
        if(!el) return false;

        el.innerHTML = this.buildView();
        this.bindActions(el);
        this.refreshNumbers(el);

        try{
          const rt = window.RCF_UI_RUNTIME;
          if(rt && typeof rt.renderAppsList === "function"){
            rt.renderAppsList();
          }
        }catch{}

        return true;
      }catch{
        return false;
      }
    },

    refresh(){
      try{
        this.refreshNumbers(document);

        const Logger = this.d.Logger;
        const box = document.querySelector("#dashActivityList");
        if(box){
          const recent = this.getRecentLogs(
            window.RCF_UI_CONFIG?.get?.("dashboard.activityLimit", 4) ?? 4
          );

          box.innerHTML = !recent.length
            ? `<div class="hint">Aguardando atividade...</div>`
            : recent.map(line => `<div class="rcfActivityItem">${this.d.escapeHtml ? this.d.escapeHtml(String(line)) : String(line)}</div>`).join("");
        }

        try{
          const rt = window.RCF_UI_RUNTIME;
          if(rt && typeof rt.renderAppsList === "function"){
            rt.renderAppsList();
          }
        }catch{}

        return true;
      }catch{
        return false;
      }
    }

  };

  try{
    window.RCF_UI_DASHBOARD = API;
  }catch{}

})();

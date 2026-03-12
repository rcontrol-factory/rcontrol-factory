/* FILE: /app/js/ui/ui_shell.js
   RControl Factory - UI Shell Module
   - Responsável apenas pela casca estrutural da Factory
   - Não faz boot
   - Não controla estado global pesado
   - Não executa regras de negócio
   - Apenas renderiza blocos base da interface
*/
(() => {
  "use strict";

  const NS = (window.RCF_UI = window.RCF_UI || {});

  function esc(v) {
    try {
      return String(v ?? "").replace(/[&<>"]/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
      ));
    } catch {
      return "";
    }
  }

  function getBrand(ctx = {}) {
    const ui = ctx.UI || {};
    return {
      title: esc(ui.brandTitle || "RCF"),
      subtitle: esc(ui.brandSubtitle || "Factory interna • PWA • Offline-first")
    };
  }

  function renderTopbar(ctx = {}) {
    const brand = getBrand(ctx);

    return `
      <header class="topbar" data-rcf-panel="topbar">
        <div class="brand" data-rcf-panel="brand">
          <div class="dot" aria-hidden="true"></div>

          <div class="brand-text">
            <div class="title">${brand.title}</div>
            <div class="subtitle">${brand.subtitle}</div>
          </div>

          <div class="spacer"></div>

          <button
            class="btn small"
            id="btnOpenTools"
            type="button"
            aria-label="Ferramentas"
            data-rcf-action="tools.open"
          >⚙️</button>

          <div
            class="status-pill"
            id="statusPill"
            style="margin-left:10px"
            data-rcf="status.pill.top"
          >
            <span class="ok" id="statusTextTop" data-rcf="status.text.top">OK ✅</span>
          </div>
        </div>

        <nav class="tabs" aria-label="Navegação" data-rcf-panel="tabs">
          <button class="tab" data-view="dashboard" data-rcf-tab="dashboard" type="button">Dashboard</button>
          <button class="tab" data-view="newapp" data-rcf-tab="newapp" type="button">New App</button>
          <button class="tab" data-view="editor" data-rcf-tab="editor" type="button">Editor</button>
          <button class="tab" data-view="generator" data-rcf-tab="generator" type="button">Generator</button>
          <button class="tab" data-view="agent" data-rcf-tab="agent" type="button">Agente</button>
          <button class="tab" data-view="settings" data-rcf-tab="settings" type="button">Settings</button>
          <button class="tab" data-view="admin" data-rcf-tab="admin" type="button">Admin</button>
          <button class="tab" data-view="diagnostics" data-rcf-tab="diagnostics" type="button">Diagnostics</button>
          <button class="tab" data-view="logs" data-rcf-tab="logs" type="button">Logs</button>
        </nav>
      </header>
    `;
  }

  function renderViewsContainer() {
    return `
      <main class="container views" id="views" data-rcf-panel="views"></main>
    `;
  }

  function renderToolsDrawer() {
    return `
      <div class="tools" id="toolsDrawer" data-rcf-panel="tools.drawer">
        <div class="tools-head">
          <div style="font-weight:800">Ferramentas</div>

          <div
            id="statusText"
            data-rcf="status.text"
            style="margin-left:auto;margin-right:10px;opacity:.85;font-size:12px;white-space:nowrap"
          >OK ✅</div>

          <button class="btn small" id="btnCloseTools" type="button" data-rcf-action="tools.close">
            Fechar
          </button>
        </div>

        <div class="tools-body">
          <div class="row">
            <button class="btn ghost" id="btnDrawerLogsRefresh" type="button" data-rcf-action="logs.refresh">
              Atualizar logs
            </button>
            <button class="btn ok" id="btnDrawerLogsCopy" type="button" data-rcf-action="logs.copy">
              Copiar logs
            </button>
            <button class="btn danger" id="btnDrawerLogsClear" type="button" data-rcf-action="logs.clear">
              Limpar logs
            </button>
          </div>

          <div class="row" style="margin-top:10px">
            <button class="btn ghost" id="btnSwClearCache" type="button" data-rcf-action="sw.clearCache">
              Clear SW Cache
            </button>
            <button class="btn ghost" id="btnSwUnregister" type="button" data-rcf-action="sw.unregister">
              Unregister SW
            </button>
            <button class="btn ok" id="btnSwRegister" type="button" data-rcf-action="sw.register">
              Register SW
            </button>
          </div>

          <pre class="mono small" id="logsBox">Pronto.</pre>
        </div>
      </div>
    `;
  }

  function renderFab() {
    return `
      <button id="rcfFab" type="button" aria-label="Ações rápidas" data-rcf-action="fab.toggle">⚡</button>

      <div id="rcfFabPanel" role="dialog" aria-label="Ações rápidas" data-rcf-panel="fab.panel">
        <div class="fab-title">
          <div>RCF</div>
          <div class="fab-status" id="fabStatus">OK ✅</div>
        </div>

        <div class="fab-row">
          <button class="btn ghost" id="btnFabTools" type="button" data-rcf-action="fab.tools">Ferramentas</button>
          <button class="btn ghost" id="btnFabAdmin" type="button" data-rcf-action="fab.admin">Admin</button>
        </div>

        <div class="fab-row" style="margin-top:8px">
          <button class="btn ghost" id="btnFabDoctor" type="button" data-rcf-action="fab.doctor">Doctor</button>
          <button class="btn ghost" id="btnFabLogs" type="button" data-rcf-action="fab.logs">Logs</button>
        </div>

        <div class="fab-row" style="margin-top:8px">
          <button class="btn danger" id="btnFabClose" type="button" data-rcf-action="fab.close">Fechar</button>
        </div>
      </div>
    `;
  }

  function renderBottomNav() {
    return `
      <nav class="rcfBottomNav" aria-label="Navegação mobile">
        <button class="tab" data-view="dashboard" type="button">Home</button>
        <button class="tab" data-view="newapp" type="button">Apps</button>
        <button class="tab" data-view="editor" type="button">Editor</button>
        <button class="tab" data-view="agent" type="button">Agent</button>
        <button class="tab" data-view="admin" type="button">Factory</button>
      </nav>
    `;
  }

  function render(ctx = {}) {
    return `
      <div id="rcfRoot" data-rcf-app="rcf.factory">
        ${renderTopbar(ctx)}
        ${renderViewsContainer()}
        ${renderToolsDrawer()}
        ${renderFab()}
        ${renderBottomNav()}
      </div>
    `;
  }

  function mount(root, ctx = {}) {
    try {
      if (!root) return false;
      root.innerHTML = render(ctx);
      return true;
    } catch (e) {
      try { console.error("[RCF_UI.shell.mount]", e); } catch {}
      return false;
    }
  }

  NS.shell = Object.assign({}, NS.shell, {
    render,
    mount,
    renderTopbar,
    renderViewsContainer,
    renderToolsDrawer,
    renderFab,
    renderBottomNav
  });
})();

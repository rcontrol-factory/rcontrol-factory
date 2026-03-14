/* FILE: /app/js/core/ui_shell.js
   RControl Factory — UI Shell mount (safe extraction)
   V2.1 PADRÃO
   - Responsável apenas pelo HTML base da shell
   - Sem boot crítico
   - Sem lógica de agent/injector
   - Mantém IDs/classes compatíveis com app atual
   - Idempotente / seguro para remount
   - PATCH: padroniza visual entre abas
   - PATCH: separa Admin de Factory AI
   - PATCH: adiciona Opportunity como view própria
   - PATCH: barra inferior nova
*/
(() => {
  "use strict";

  function esc(v) {
    return String(v ?? "").replace(/[&<>"]/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[ch] || ch));
  }

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function ensureRoot() {
    let root = document.getElementById("app");
    if (root) return root;

    try {
      root = document.createElement("div");
      root.id = "app";
      (document.body || document.documentElement).appendChild(root);
      return root;
    } catch {
      return null;
    }
  }

  function brandHeaderHTML(ctx = {}) {
    const brandTitle = esc(ctx.brandTitle || "RControl Factory");
    const brandSubtitle = esc(ctx.brandSubtitle || "FACTORY INTERNA • PWA • OFFLINE-FIRST");

    return `
      <div class="brand-mark" aria-hidden="true">
        <img src="./assets/icons/app/app-icon.png" class="factory-mark-img" alt="">
      </div>
      <div class="brand-text">
        <img src="./assets/branding/header-logo.jpeg" class="factory-logo-header" alt="Factory by RCONTROL">
        <div class="title rcf-visually-hidden">${brandTitle}</div>
        <div class="subtitle">${brandSubtitle}</div>
      </div>
    `;
  }

  function buildTopTabs() {
    return `
      <nav class="tabs" aria-label="Navegação" data-rcf-panel="tabs">
        <button class="tab active" data-view="dashboard" type="button">Home</button>
        <button class="tab" data-view="newapp" type="button">Apps</button>
        <button class="tab" data-view="editor" type="button">Editor</button>
        <button class="tab" data-view="generator" type="button">Generator</button>
        <button class="tab" data-view="agent" type="button">Agent</button>
        <button class="tab" data-view="opportunity" type="button">Opportunity</button>
        <button class="tab" data-view="admin" type="button">Admin</button>
        <button class="tab" data-view="settings" type="button">Settings</button>
        <button class="tab" data-view="factoryai" type="button">Factory AI</button>
        <button class="tab" data-view="logs" type="button">Logs</button>
      </nav>
    `;
  }

  function buildHomeCards() {
    return `
      <div class="rcfMobileModules" aria-label="Módulos principais">
        <button class="rcfMobileModuleCard" data-view="dashboard" type="button">
          <span class="rcfMobileModuleIcon mod-dashboard" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Dashboard</span>
            <span class="rcfMobileModuleSub">Status & Controle</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>

        <button class="rcfMobileModuleCard" data-view="newapp" type="button">
          <span class="rcfMobileModuleIcon mod-apps" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Apps</span>
            <span class="rcfMobileModuleSub">Criar & Gerenciar</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>

        <button class="rcfMobileModuleCard" data-view="editor" type="button">
          <span class="rcfMobileModuleIcon mod-editor" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Editor</span>
            <span class="rcfMobileModuleSub">Projetos & Código</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>

        <button class="rcfMobileModuleCard" data-view="agent" type="button">
          <span class="rcfMobileModuleIcon mod-agent" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Agent</span>
            <span class="rcfMobileModuleSub">Criação & Automação</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>

        <button class="rcfMobileModuleCard" data-view="opportunity" type="button">
          <span class="rcfMobileModuleIcon mod-generator" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Opportunity</span>
            <span class="rcfMobileModuleSub">Scanner & Oportunidades</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>

        <button class="rcfMobileModuleCard" data-view="admin" type="button">
          <span class="rcfMobileModuleIcon mod-factory" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Admin</span>
            <span class="rcfMobileModuleSub">Sistema & Tools</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>

        <button class="rcfMobileModuleCard" data-view="settings" type="button">
          <span class="rcfMobileModuleIcon mod-dashboard" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Settings</span>
            <span class="rcfMobileModuleSub">Conta & Configurações</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>

        <button class="rcfMobileModuleCard" data-view="factoryai" type="button">
          <span class="rcfMobileModuleIcon mod-agent" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Factory AI</span>
            <span class="rcfMobileModuleSub">IA do núcleo da Factory</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>

        <button class="rcfMobileModuleCard" data-view="logs" type="button">
          <span class="rcfMobileModuleIcon mod-editor" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Logs</span>
            <span class="rcfMobileModuleSub">Registro & Auditoria</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>

        <button class="rcfMobileModuleCard" data-view="diagnostics" type="button">
          <span class="rcfMobileModuleIcon mod-factory" aria-hidden="true"></span>
          <span class="rcfMobileModuleText">
            <span class="rcfMobileModuleTitle">Diagnostics</span>
            <span class="rcfMobileModuleSub">Check & Estabilidade</span>
          </span>
          <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
        </button>
      </div>
    `;
  }

  function buildShellHTML(ctx = {}) {
    return `
      <div id="rcfRoot" data-rcf-app="rcf.factory">
        <header class="topbar" data-rcf-panel="topbar">
          <div class="brand" data-rcf-panel="brand">
            ${brandHeaderHTML(ctx)}
            <div class="spacer"></div>
            <button class="btn small ghost" id="btnOpenTools" type="button" aria-label="Ferramentas">Tools</button>
            <div class="status-pill" id="statusPill" data-rcf="status.pill.top">
              <span class="ok" id="statusTextTop" data-rcf="status.text.top">OK ✅</span>
            </div>
          </div>

          ${buildTopTabs()}
        </header>

        <main class="container views" id="views" data-rcf-panel="views">
          <section class="view card hero active" id="view-dashboard" data-rcf-view="dashboard">
            <div class="rcfDashHero">
              <div class="rcfDashHeroHead">
                <div>
                  <h1>Home</h1>
                  <p>Central principal da Factory com acesso rápido a todos os módulos.</p>
                </div>
                <div class="status-box">
                  <div class="badge" id="activeAppText">Sem app ativo ✅</div>
                  <button class="btn small" id="btnCreateNewApp" type="button">Criar App</button>
                  <button class="btn small" id="btnOpenEditor" type="button">Abrir Editor</button>
                  <button class="btn small ghost" id="btnExportBackup" type="button">Backup (JSON)</button>
                </div>
              </div>

              ${buildHomeCards()}

              <div class="rcfDashPanels">
                <div class="rcfDashPanel rcfDashPanelWide">
                  <h2>Apps</h2>
                  <div id="appsList" class="apps" data-rcf-slot="apps.list"></div>
                </div>
              </div>
            </div>
          </section>

          <section class="view card" id="view-newapp" data-rcf-view="newapp">
            <h1>Apps</h1>
            <p class="hint">Crie e organize aplicativos mantendo o mesmo padrão visual da Factory.</p>
            <div class="row form">
              <input id="newAppName" placeholder="Nome do app" />
              <input id="newAppSlug" placeholder="slug (opcional)" />
              <button class="btn small" id="btnAutoSlug" type="button">Auto-slug</button>
              <button class="btn ok" id="btnDoCreateApp" type="button">Criar</button>
            </div>
            <pre class="mono" id="newAppOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-editor" data-rcf-view="editor">
            <h1>Editor</h1>
            <p class="hint">Arquivos, estrutura e ajustes do app ativo, no mesmo padrão da shell.</p>
            <div class="row">
              <div class="badge" id="editorHead">Arquivo atual: -</div>
              <div class="spacer"></div>
              <button class="btn ok" id="btnSaveFile" type="button">Salvar</button>
              <button class="btn danger" id="btnResetFile" type="button">Reset</button>
            </div>
            <div class="row">
              <div style="flex:1;min-width:240px">
                <div class="hint">Arquivos</div>
                <div id="filesList" class="files" data-rcf-slot="files.list"></div>
              </div>
              <div style="flex:2;min-width:280px">
                <div class="editor">
                  <div class="editor-head">Conteúdo</div>
                  <textarea id="fileContent" spellcheck="false"></textarea>
                </div>
              </div>
            </div>
            <pre class="mono" id="editorOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-generator" data-rcf-view="generator">
            <h1>Generator</h1>
            <p class="hint">Geração, teste e validação de builds.</p>
            <div id="rcfGenSlotActions" data-rcf-slot="generator.actions">
              <div class="row">
                <button class="btn ok" id="btnGenZip" type="button">Build ZIP</button>
                <button class="btn ghost" id="btnGenPreview" type="button">Preview</button>
              </div>
            </div>
            <div id="rcfGenSlotTools" data-rcf-slot="generator.tools"></div>
            <pre class="mono" id="genOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-agent" data-rcf-view="agent">
            <h1>Agent</h1>
            <p class="hint">Agente de criação e operação de aplicativos.</p>
            <div class="row cmd">
              <input id="agentCmd" placeholder='Ex: create "Meu App" meu-app' />
              <button class="btn ok" id="btnAgentRun" type="button">Executar</button>
              <button class="btn ghost" id="btnAgentHelp" type="button">Ajuda</button>
            </div>
            <div id="rcfAgentSlotActions" data-rcf-slot="agent.actions"></div>
            <div id="rcfAgentSlotTools" data-rcf-slot="agent.tools"></div>
            <pre class="mono" id="agentOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-opportunity" data-rcf-view="opportunity">
            <h1>Opportunity Scanner</h1>
            <p class="hint">Centro de oportunidades, ideias rentáveis e priorização de apps.</p>
            <div class="card">
              <h2>Top oportunidades</h2>
              <div class="hint">Aqui vão entrar as melhores oportunidades fixadas no topo.</div>
            </div>
            <div class="card">
              <h2>Fila de análise</h2>
              <div class="hint">Aqui entram oportunidades em observação, triagem e validação.</div>
            </div>
            <pre class="mono" id="opportunityOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-settings" data-rcf-view="settings">
            <h1>Settings</h1>
            <p class="hint">Conta, acesso, segurança e preferências gerais.</p>
            <div class="card" id="settings-security">
              <h2>Segurança</h2>
              <div id="rcfSettingsSecurityActions" data-rcf-slot="settings.security.actions"></div>
              <div class="row">
                <input id="pinInput" placeholder="Definir PIN (4-8 dígitos)" inputmode="numeric" />
                <button class="btn ok" id="btnPinSave" type="button">Salvar PIN</button>
                <button class="btn danger" id="btnPinRemove" type="button">Remover PIN</button>
              </div>
              <pre class="mono" id="pinOut">Pronto.</pre>
            </div>
            <div class="card" id="settings-logs">
              <h2>Logs</h2>
              <div class="row">
                <button class="btn ghost" id="btnLogsRefresh" type="button">Atualizar</button>
                <button class="btn ok" id="btnLogsCopy" type="button">Exportar .txt</button>
                <button class="btn danger" id="btnLogsClear" type="button">Limpar logs</button>
              </div>
              <pre class="mono small" id="logsOut">Pronto.</pre>
            </div>
          </section>

          <section class="view card" id="view-factoryai" data-rcf-view="factoryai">
            <h1>Factory AI</h1>
            <p class="hint">IA interna do núcleo da Factory, separada do Admin operacional.</p>
            <div class="card">
              <h2>Diagnóstico do núcleo</h2>
              <div class="hint">Análise, manutenção guiada e evolução do núcleo da Factory.</div>
            </div>
            <div class="card">
              <h2>Sugestões internas</h2>
              <div class="hint">Espaço para recomendações, correções e melhorias da própria Factory.</div>
            </div>
            <pre class="mono" id="factoryAiOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-logs" data-rcf-view="logs">
            <h1>Logs</h1>
            <p class="hint">Registro operacional e auditoria.</p>
            <div class="row">
              <button class="btn ghost" id="btnLogsRefresh2" type="button">Atualizar</button>
              <button class="btn ok" id="btnCopyLogs" type="button">Copiar</button>
              <button class="btn danger" id="btnClearLogs2" type="button">Limpar</button>
            </div>
            <pre class="mono small" id="logsViewBox">Pronto.</pre>
          </section>

          <section class="view card" id="view-admin" data-rcf-view="admin">
            <h1>Admin</h1>
            <p class="hint">Controles administrativos, maintenance, integrations e injector.</p>
            <div id="rcfAdminSlotTop" data-rcf-slot="admin.top">
              <div class="row">
                <button class="btn ghost" id="btnAdminDiag" type="button">Diagnosticar (local)</button>
                <button class="btn danger" id="btnAdminZero" type="button">Zerar (safe)</button>
              </div>
              <pre class="mono" id="adminOut">Pronto.</pre>
            </div>

            <div class="card" id="admin-maint">
              <h2>Maintenance</h2>
              <div class="row">
                <button class="btn ghost" id="btnMaeLoad" type="button">Carregar Mãe</button>
                <button class="btn ok" id="btnMaeCheck" type="button">Rodar Check</button>
              </div>
              <div class="row">
                <button class="btn ok" id="btnMaeUpdate" type="button">Update From GitHub</button>
                <button class="btn danger" id="btnMaeClear" type="button">Clear Overrides</button>
              </div>
              <pre class="mono" id="maintOut">Pronto.</pre>
            </div>

            <div class="card" id="rcfAdminSlotIntegrations" data-rcf-slot="admin.integrations">
              <h2>Integrations</h2>
              <div class="hint">Pronto.</div>
            </div>

            <div class="card" id="admin-injector" data-rcf-slot="admin.injector">
              <h2>Injector SAFE</h2>
              <div class="row" style="flex-wrap:wrap;">
                <button class="btn ok" id="btnScanIndex" type="button">Scan & Index</button>
                <button class="btn ghost" id="btnGenTargets" type="button">Generate Target Map</button>
                <button class="btn ghost" id="btnRefreshTargets" type="button">Refresh Dropdown</button>
              </div>
              <pre class="mono small" id="scanOut">Pronto.</pre>

              <div class="row form" style="margin-top:10px">
                <select id="injMode">
                  <option value="INSERT">INSERT</option>
                  <option value="REPLACE">REPLACE</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <select id="injTarget"></select>
                <button class="btn ghost" id="btnPreviewDiff" type="button">Preview diff</button>
                <button class="btn ok" id="btnApplyInject" type="button">Apply</button>
                <button class="btn danger" id="btnRollbackInject" type="button">Rollback</button>
              </div>

              <div class="hint" style="margin-top:10px">Payload:</div>
              <textarea id="injPayload" class="textarea" rows="8" spellcheck="false"></textarea>

              <div class="hint" style="margin-top:10px">Preview / Diff:</div>
              <pre class="mono small" id="diffOut">Pronto.</pre>

              <div id="rcfAdminSlotLogs" data-rcf-slot="admin.logs">
                <div class="row" style="margin-top:10px;align-items:center">
                  <div class="hint" style="margin:0">Log (Injector):</div>
                  <div class="spacer"></div>
                  <button class="btn small ghost" id="btnToggleInjectorLog" type="button">Mostrar log</button>
                </div>
                <pre class="mono small rcf-collapsed" id="injLog">Pronto.</pre>
              </div>
            </div>
          </section>

          <section class="view card" id="view-diagnostics" data-rcf-view="diagnostics">
            <h1>Diagnostics</h1>
            <p class="hint">Checks de estabilidade e leitura técnica da Factory.</p>
            <div class="row">
              <button class="btn ok" id="btnDiagRun" type="button">Rodar V8 Stability Check</button>
              <button class="btn ghost" id="btnDiagScan" type="button">Scan overlays</button>
              <button class="btn ghost" id="btnDiagTests" type="button">Run micro-tests</button>
              <button class="btn danger" id="btnDiagClear" type="button">Limpar</button>
            </div>
            <pre class="mono" id="diagOut">Pronto.</pre>
          </section>
        </main>

        <nav class="rcfBottomNav" aria-label="Navegação mobile">
          <button class="tab active" data-view="dashboard" type="button">Home</button>
          <button class="tab" data-view="agent" type="button">Agent</button>
          <button class="tab" data-view="opportunity" type="button">Opportunity</button>
          <button class="tab" data-view="settings" type="button">Settings</button>
          <button class="tab" data-view="factoryai" type="button">Factory AI</button>
        </nav>

        <div class="tools" id="toolsDrawer" data-rcf-panel="tools.drawer">
          <div class="tools-head">
            <div style="font-weight:800">Ferramentas</div>
            <div id="statusText" data-rcf="status.text" style="margin-left:auto;margin-right:10px;opacity:.85;font-size:12px;white-space:nowrap">OK ✅</div>
            <button class="btn small" id="btnCloseTools" type="button">Fechar</button>
          </div>
          <div class="tools-body">
            <div class="row">
              <button class="btn ghost" id="btnDrawerLogsRefresh" type="button">Atualizar logs</button>
              <button class="btn ok" id="btnDrawerLogsCopy" type="button">Copiar logs</button>
              <button class="btn danger" id="btnDrawerLogsClear" type="button">Limpar logs</button>
            </div>
            <div class="row" style="margin-top:10px">
              <button class="btn ghost" id="btnSwClearCache" type="button">Clear SW Cache</button>
              <button class="btn ghost" id="btnSwUnregister" type="button">Unregister SW</button>
              <button class="btn ok" id="btnSwRegister" type="button">Register SW</button>
            </div>
            <pre class="mono small" id="logsBox">Pronto.</pre>
          </div>
        </div>

        <button id="rcfFab" type="button" aria-label="Ações rápidas">⚡</button>
        <div id="rcfFabPanel" role="dialog" aria-label="Ações rápidas">
          <div class="fab-title">
            <div>RCF</div>
            <div class="fab-status" id="fabStatus">OK ✅</div>
          </div>
          <div class="fab-row">
            <button class="btn ghost" id="btnFabTools" type="button">Ferramentas</button>
            <button class="btn ghost" id="btnFabAdmin" type="button">Admin</button>
          </div>
          <div class="fab-row" style="margin-top:8px">
            <button class="btn ghost" id="btnFabDoctor" type="button">Doctor</button>
            <button class="btn ghost" id="btnFabLogs" type="button">Logs</button>
          </div>
          <div class="fab-row" style="margin-top:8px">
            <button class="btn danger" id="btnFabClose" type="button">Fechar</button>
          </div>
        </div>
      </div>
    `;
  }

  function ensureStructuralSlots(root) {
    try {
      if (!root) return false;

      const dashboard = qs("#view-dashboard", root);
      if (dashboard && !qs("#rcfFactoryUiRoot", dashboard)) {
        const slot = document.createElement("div");
        slot.id = "rcfFactoryUiRoot";
        slot.setAttribute("data-rcf-ui-slot", "factory-view");
        slot.style.marginTop = "14px";
        dashboard.appendChild(slot);
      }

      const topbar = qs(".topbar", root);
      if (topbar && !qs("#rcfHeader", topbar)) {
        const hdr = document.createElement("div");
        hdr.id = "rcfHeader";
        hdr.setAttribute("data-rcf-ui-slot", "header");
        topbar.insertAdjacentElement("afterbegin", hdr);
      }

      return true;
    } catch {
      return false;
    }
  }

  const API = {
    mount(ctx = {}) {
      const root = ctx.root || ensureRoot();
      if (!root) return false;

      const existing = document.getElementById("rcfRoot");
      if (existing) {
        ensureStructuralSlots(existing);
        return true;
      }

      root.innerHTML = buildShellHTML(ctx);
      ensureStructuralSlots(root);
      return true;
    }
  };

  try { window.RCF_UI_SHELL = API; } catch {}
})();

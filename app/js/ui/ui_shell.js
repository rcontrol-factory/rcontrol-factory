/* FILE: app/js/ui/ui_shell.js
   RControl Factory — UI Shell mount (safe extraction)
   - Responsável apenas pelo HTML base da shell
   - Sem boot crítico
   - Sem lógica de agent/injector
   - Mantém IDs/classes compatíveis com app atual
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

  const API = {
    mount(ctx = {}) {
      const root = ctx.root || document.getElementById("app");
      if (!root) return false;
      if (document.getElementById("rcfRoot")) return true;

      const brandTitle = esc(ctx.brandTitle || "RCF");
      const brandSubtitle = esc(ctx.brandSubtitle || "FACTORY INTERNA • PWA • OFFLINE-FIRST");

      root.innerHTML = `
        <div id="rcfRoot" data-rcf-app="rcf.factory">
          <header class="topbar" data-rcf-panel="topbar">
            <div class="brand" data-rcf-panel="brand">
              <div class="brand-mark" aria-hidden="true">
                <img src="./assets/factory-icon-master.jpeg" class="factory-mark-img" alt="">
              </div>
              <div class="brand-text">
                <div class="title">${brandTitle}</div>
                <div class="subtitle">${brandSubtitle}</div>
              </div>
              <div class="spacer"></div>
              <button class="btn small ghost" id="btnOpenTools" type="button" aria-label="Ferramentas">Tools</button>
              <div class="status-pill" id="statusPill" data-rcf="status.pill.top">
                <span class="ok" id="statusTextTop" data-rcf="status.text.top">OK ✅</span>
              </div>
            </div>

            <nav class="tabs" aria-label="Navegação" data-rcf-panel="tabs">
              <button class="tab active" data-view="dashboard" type="button">Dashboard</button>
              <button class="tab" data-view="newapp" type="button">New App</button>
              <button class="tab" data-view="editor" type="button">Editor</button>
              <button class="tab" data-view="generator" type="button">Generator</button>
              <button class="tab" data-view="agent" type="button">Agent</button>
              <button class="tab" data-view="admin" type="button">Factory</button>
              <button class="tab" data-view="settings" type="button">System</button>
              <button class="tab" data-view="logs" type="button">Logs</button>
            </nav>
          </header>

          <main class="container views" id="views" data-rcf-panel="views">
            <section class="view card hero active" id="view-dashboard" data-rcf-view="dashboard">
              <div class="rcfDashHero">
                <div class="rcfDashHeroHead">
                  <div>
                    <h1>Dashboard</h1>
                    <p>Central do projeto. Selecione um app e comece a editar.</p>
                  </div>
                  <div class="status-box">
                    <div class="badge" id="activeAppText">Sem app ativo ✅</div>
                    <button class="btn small" id="btnCreateNewApp" type="button">Criar App</button>
                    <button class="btn small" id="btnOpenEditor" type="button">Abrir Editor</button>
                    <button class="btn small ghost" id="btnExportBackup" type="button">Backup (JSON)</button>
                  </div>
                </div>

                <div class="rcfMobileModules" aria-label="Módulos principais">
                  <button class="rcfMobileModuleCard" data-view="dashboard" type="button">
                    <span class="rcfMobileModuleIcon mod-dashboard" aria-hidden="true"></span>
                    <span class="rcfMobileModuleText">
                      <span class="rcfMobileModuleTitle">Dashboard</span>
                      <span class="rcfMobileModuleSub">Status &amp; Controle</span>
                    </span>
                    <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                  </button>
                  <button class="rcfMobileModuleCard" data-view="newapp" type="button">
                    <span class="rcfMobileModuleIcon mod-apps" aria-hidden="true"></span>
                    <span class="rcfMobileModuleText">
                      <span class="rcfMobileModuleTitle">Apps</span>
                      <span class="rcfMobileModuleSub">Criar &amp; Gerenciar</span>
                    </span>
                    <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                  </button>
                  <button class="rcfMobileModuleCard" data-view="editor" type="button">
                    <span class="rcfMobileModuleIcon mod-editor" aria-hidden="true"></span>
                    <span class="rcfMobileModuleText">
                      <span class="rcfMobileModuleTitle">Editor</span>
                      <span class="rcfMobileModuleSub">Projetos &amp; Código</span>
                    </span>
                    <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                  </button>
                  <button class="rcfMobileModuleCard" data-view="agent" type="button">
                    <span class="rcfMobileModuleIcon mod-agent" aria-hidden="true"></span>
                    <span class="rcfMobileModuleText">
                      <span class="rcfMobileModuleTitle">Agent</span>
                      <span class="rcfMobileModuleSub">IA + Automação</span>
                    </span>
                    <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                  </button>
                  <button class="rcfMobileModuleCard" data-view="admin" type="button">
                    <span class="rcfMobileModuleIcon mod-factory" aria-hidden="true"></span>
                    <span class="rcfMobileModuleText">
                      <span class="rcfMobileModuleTitle">Factory</span>
                      <span class="rcfMobileModuleSub">Sistema &amp; Tools</span>
                    </span>
                    <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                  </button>
                </div>

                <div class="rcfDashPanels">
                  <div class="rcfDashPanel rcfDashPanelWide">
                    <h2>Apps</h2>
                    <div id="appsList" class="apps" data-rcf-slot="apps.list"></div>
                  </div>
                </div>
              </div>
            </section>

            <section class="view card" id="view-newapp" data-rcf-view="newapp">
              <h1>Novo App</h1>
              <p class="hint">Cria um mini-app dentro da Factory.</p>
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
              <p class="hint">Escolha um arquivo e edite.</p>
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
              <p class="hint">Gera ZIP do app selecionado.</p>
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
              <h1>Agente</h1>
              <div class="row cmd">
                <input id="agentCmd" placeholder='Ex: create "Meu App" meu-app' />
                <button class="btn ok" id="btnAgentRun" type="button">Executar</button>
                <button class="btn ghost" id="btnAgentHelp" type="button">Ajuda</button>
              </div>
              <div id="rcfAgentSlotActions" data-rcf-slot="agent.actions"></div>
              <div id="rcfAgentSlotTools" data-rcf-slot="agent.tools"></div>
              <pre class="mono" id="agentOut">Pronto.</pre>
            </section>

            <section class="view card" id="view-settings" data-rcf-view="settings">
              <h1>Settings</h1>
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

            <section class="view card" id="view-logs" data-rcf-view="logs">
              <h1>Logs</h1>
              <div class="row">
                <button class="btn ghost" id="btnLogsRefresh2" type="button">Atualizar</button>
                <button class="btn ok" id="btnCopyLogs" type="button">Copiar</button>
                <button class="btn danger" id="btnClearLogs2" type="button">Limpar</button>
              </div>
              <pre class="mono small" id="logsViewBox">Pronto.</pre>
            </section>

            <section class="view card" id="view-admin" data-rcf-view="admin">
              <h1>Admin</h1>
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
            <button class="tab" data-view="newapp" type="button">Apps</button>
            <button class="tab" data-view="editor" type="button">Editor</button>
            <button class="tab" data-view="agent" type="button">Agent</button>
            <button class="tab" data-view="admin" type="button">Factory</button>
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

      return true;
    }
  };

  try { window.RCF_UI_SHELL = API; } catch {}
})();

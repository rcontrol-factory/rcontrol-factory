/* FILE: /app/js/core/ui_shell.js
   RControl Factory — UI Shell mount (SAFE CLEAN V3.1)
   - Shell base limpa
   - Remove navegação superior antiga
   - Remove dashboard antigo embutido na shell
   - Corrige bottom nav oficial
   - Opportunity Scan separado de Generator
   - Factory AI separado de Admin
   - Rebuild seguro sem destruir dashboard novo
   - FIX: não confundir .rcfDashHero com shell velha
   - FIX: bottom nav alinhada com Agent IA
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

  function qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
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

  function sectionHeader(title, subtitle, back = true) {
    return `
      <div class="row" style="align-items:center;margin-bottom:10px;gap:10px;">
        ${back ? `<button class="btn small ghost" data-view="dashboard" type="button">← Home</button>` : ``}
        <div>
          <h1 style="margin:0">${esc(title)}</h1>
          ${subtitle ? `<p class="hint" style="margin:4px 0 0">${esc(subtitle)}</p>` : ``}
        </div>
      </div>
    `;
  }

  function brandHeaderHTML(ctx = {}) {
    const brandTitle = esc(ctx.brandTitle || "RCF");
    const brandSubtitle = esc(ctx.brandSubtitle || "Factory interna • PWA • Offline-first");

    return `
      <div class="brand-mark" aria-hidden="true">
        <img
          src="./assets/icon-192.png"
          class="factory-mark-img"
          alt=""
          onerror="this.style.display='none';this.setAttribute('aria-hidden','true');"
        >
      </div>

      <div class="brand-text">
        <img
          src="./assets/logo_factory_header 2.png"
          class="factory-logo-header"
          alt="Factory by RCONTROL"
          onerror="this.style.display='none';this.setAttribute('aria-hidden','true');"
        >
        <div class="title">${brandTitle}</div>
        <div class="subtitle">${brandSubtitle}</div>
      </div>
    `;
  }

  function buildShellHTML(ctx = {}) {
    return `
      <div id="rcfRoot" data-rcf-app="rcf.factory" data-rcf-shell-version="3.1">
        <header class="topbar" data-rcf-panel="topbar">
          <div class="brand" data-rcf-panel="brand">
            ${brandHeaderHTML(ctx)}
            <div class="spacer"></div>
            <div class="badge" id="activeAppText">Sem app ativo ✅</div>
            <button class="btn small ghost" id="btnOpenTools" type="button" aria-label="Ferramentas">Tools</button>
            <div class="status-pill" id="statusPill" data-rcf="status.pill.top">
              <span class="ok" id="statusTextTop" data-rcf="status.text.top">OK ✅</span>
            </div>
          </div>

          <div id="rcfHeader" data-rcf-ui-slot="header"></div>
        </header>

        <main class="container views" id="views" data-rcf-panel="views">
          <section class="view card hero active" id="view-dashboard" data-rcf-view="dashboard">
            <div data-rcf-dashboard-host="1"></div>
          </section>

          <section class="view card" id="view-newapp" data-rcf-view="newapp" hidden>
            ${sectionHeader("Novo App", "Criação de novos apps.", true)}
            <div class="row form">
              <input id="newAppName" placeholder="Nome do app" />
              <input id="newAppSlug" placeholder="slug (opcional)" />
              <button class="btn small" id="btnAutoSlug" type="button">Auto-slug</button>
              <button class="btn ok" id="btnDoCreateApp" type="button">Criar</button>
            </div>
            <pre class="mono" id="newAppOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-editor" data-rcf-view="editor" hidden>
            ${sectionHeader("Editor", "Projetos & código.", true)}
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

          <section class="view card" id="view-agent" data-rcf-view="agent" hidden>
            ${sectionHeader("Agent", "Comandos naturais e execução guiada.", true)}
            <div class="row cmd">
              <input id="agentCmd" placeholder='Ex: create "Meu App" meu-app' />
              <button class="btn ok" id="btnAgentRun" type="button">Executar</button>
              <button class="btn ghost" id="btnAgentHelp" type="button">Ajuda</button>
            </div>
            <div id="rcfAgentSlotActions" data-rcf-slot="agent.actions"></div>
            <div id="rcfAgentSlotTools" data-rcf-slot="agent.tools"></div>
            <pre class="mono" id="agentOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-agent-ia" data-rcf-view="agent-ia" hidden>
            ${sectionHeader("Agent IA", "Camada de IA do agente.", true)}
            <div id="rcfAgentIASlotActions" data-rcf-slot="agentia.actions"></div>
            <div id="rcfAgentIASlotTools" data-rcf-slot="agentia.tools"></div>
            <pre class="mono" id="agentIaOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-opportunity-scan" data-rcf-view="opportunity-scan" hidden>
            ${sectionHeader("Opportunity Scan", "Scanner de oportunidades rentáveis.", true)}
            <div id="rcfOpportunitySlotActions" data-rcf-slot="opportunity.actions"></div>
            <div id="rcfOpportunitySlotTools" data-rcf-slot="opportunity.tools"></div>
            <pre class="mono" id="opportunityOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-generator" data-rcf-view="generator" hidden>
            ${sectionHeader("Generator", "Build, preview, geração e validação.", true)}
            <div id="rcfGenSlotActions" data-rcf-slot="generator.actions">
              <div class="row">
                <button class="btn ok" id="btnGenZip" type="button">Build ZIP</button>
                <button class="btn ghost" id="btnGenPreview" type="button">Preview</button>
              </div>
            </div>
            <div id="rcfGenSlotTools" data-rcf-slot="generator.tools"></div>
            <pre class="mono" id="genOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-factory-ai" data-rcf-view="factory-ai" hidden>
            ${sectionHeader("Factory AI", "Supervisão e evolução da Factory.", true)}
            <div id="rcfFactoryAISlotActions" data-rcf-slot="factoryai.actions"></div>
            <div id="rcfFactoryAISlotTools" data-rcf-slot="factoryai.tools"></div>
            <pre class="mono" id="factoryAiOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-settings" data-rcf-view="settings" hidden>
            ${sectionHeader("Settings", "Parâmetros e preferências.", true)}
            <div class="card" id="settings-security">
              <h2>Segurança</h2>
              <div class="row form">
                <input id="pinInput" placeholder="PIN admin" />
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

          <section class="view card" id="view-logs" data-rcf-view="logs" hidden>
            ${sectionHeader("Logs", "Histórico e acompanhamento.", true)}
            <div class="row">
              <button class="btn ghost" id="btnLogsRefresh2" type="button">Atualizar</button>
              <button class="btn ok" id="btnCopyLogs" type="button">Copiar</button>
              <button class="btn danger" id="btnClearLogs2" type="button">Limpar</button>
            </div>
            <pre class="mono small" id="logsViewBox">Pronto.</pre>
          </section>

          <section class="view card" id="view-diagnostics" data-rcf-view="diagnostics" hidden>
            ${sectionHeader("Diagnostics", "Verificação e estabilidade.", true)}
            <div class="row">
              <button class="btn ghost" id="btnRunV8Check" type="button">Run V8 Check</button>
              <button class="btn ghost" id="btnScanOverlays" type="button">Scan Overlays</button>
              <button class="btn ghost" id="btnMicroTests" type="button">Microtests</button>
            </div>
            <pre class="mono" id="diagOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-admin" data-rcf-view="admin" hidden>
            ${sectionHeader("Admin", "Ferramentas internas e manutenção.", true)}

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
        </main>

        <nav class="rcfBottomNav" aria-label="Navegação mobile">
          <button class="tab active" data-view="dashboard" data-label="home" type="button">Home</button>
          <button class="tab" data-view="agent-ia" data-label="agentia" type="button">Agent IA</button>
          <button class="tab" data-view="opportunity-scan" data-label="opportunity" type="button">Opportunity</button>
          <button class="tab" data-view="settings" data-label="settings" type="button">Settings</button>
          <button class="tab" data-view="factory-ai" data-label="factoryai" type="button">Factory AI</button>
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

        <div
          id="rcfFabCompat"
          hidden
          aria-hidden="true"
          style="display:none !important; visibility:hidden !important; pointer-events:none !important;"
        >
          <button id="rcfFab" type="button" tabindex="-1" aria-hidden="true">⚡</button>

          <div id="rcfFabPanel" role="dialog" aria-label="Ações rápidas" hidden>
            <div class="fab-title">
              <div>RCF</div>
              <div class="fab-status" id="fabStatus">OK ✅</div>
            </div>

            <div class="fab-row">
              <button class="btn ghost" id="btnFabTools" type="button" tabindex="-1">Ferramentas</button>
              <button class="btn ghost" id="btnFabAdmin" type="button" tabindex="-1">Admin</button>
            </div>

            <div class="fab-row" style="margin-top:8px">
              <button class="btn ghost" id="btnFabDoctor" type="button" tabindex="-1">Doctor</button>
              <button class="btn ghost" id="btnFabLogs" type="button" tabindex="-1">Logs</button>
            </div>

            <div class="fab-row" style="margin-top:8px">
              <button class="btn danger" id="btnFabClose" type="button" tabindex="-1">Fechar</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function shouldRebuild(existing) {
    try {
      if (!existing) return true;

      const ver = String(existing.getAttribute("data-rcf-shell-version") || "").trim();
      if (!ver) return true;

      if (ver !== "3.1" && ver !== "3.0") return true;

      if (qs(".tabs", existing)) return true;
      if (qs(".rcfMobileModules", existing)) return true;

      const bottomOpp = qs('.rcfBottomNav [data-label="opportunity"]', existing);
      if (!bottomOpp) return true;
      if ((bottomOpp.getAttribute("data-view") || "").trim() !== "opportunity-scan") return true;

      const bottomFactory = qs('.rcfBottomNav [data-label="factoryai"]', existing);
      if (!bottomFactory) return true;
      if ((bottomFactory.getAttribute("data-view") || "").trim() !== "factory-ai") return true;

      if (!qs("#view-opportunity-scan", existing)) return true;
      if (!qs("#view-factory-ai", existing)) return true;
      if (!qs("#view-generator", existing)) return true;
      if (!qs("#view-agent-ia", existing)) return true;

      return false;
    } catch {
      return true;
    }
  }

  function ensureStructuralSlots(root) {
    try {
      if (!root) return false;

      const views = qs("#views", root);
      if (!views) return false;

      const mustViews = [
        ["view-dashboard", "dashboard"],
        ["view-newapp", "newapp"],
        ["view-editor", "editor"],
        ["view-agent", "agent"],
        ["view-agent-ia", "agent-ia"],
        ["view-opportunity-scan", "opportunity-scan"],
        ["view-generator", "generator"],
        ["view-factory-ai", "factory-ai"],
        ["view-settings", "settings"],
        ["view-logs", "logs"],
        ["view-diagnostics", "diagnostics"],
        ["view-admin", "admin"]
      ];

      mustViews.forEach(([id, name]) => {
        if (qs(`#${id}`, root)) return;
        const sec = document.createElement("section");
        sec.id = id;
        sec.className = "view card";
        sec.hidden = true;
        sec.setAttribute("data-rcf-view", name);
        sec.innerHTML = sectionHeader(name, "Área interna da Factory.", true);
        views.appendChild(sec);
      });

      if (!qs("#rcfHeader", root)) {
        const topbar = qs(".topbar", root);
        if (topbar) {
          const hdr = document.createElement("div");
          hdr.id = "rcfHeader";
          hdr.setAttribute("data-rcf-ui-slot", "header");
          topbar.appendChild(hdr);
        }
      }

      const compat = qs("#rcfFabCompat", root);
      if (compat) {
        compat.hidden = true;
        compat.setAttribute("aria-hidden", "true");
        compat.style.display = "none";
        compat.style.visibility = "hidden";
        compat.style.pointerEvents = "none";
      }

      const bottom = qs(".rcfBottomNav", root);
      if (bottom) {
        const expected = [
          ["home", "dashboard", "Home"],
          ["agentia", "agent-ia", "Agent IA"],
          ["opportunity", "opportunity-scan", "Opportunity"],
          ["settings", "settings", "Settings"],
          ["factoryai", "factory-ai", "Factory AI"]
        ];

        expected.forEach(([label, view, text]) => {
          let btn = qs(`[data-label="${label}"]`, bottom);
          if (!btn) {
            btn = document.createElement("button");
            btn.className = "tab";
            btn.type = "button";
            btn.setAttribute("data-label", label);
            bottom.appendChild(btn);
          }
          btn.setAttribute("data-view", view);
          btn.textContent = text;
        });
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
      if (existing && !shouldRebuild(existing)) {
        existing.setAttribute("data-rcf-shell-version", "3.1");
        ensureStructuralSlots(existing);
        return true;
      }

      root.innerHTML = buildShellHTML(ctx);
      const fresh = document.getElementById("rcfRoot");
      ensureStructuralSlots(fresh);
      return true;
    }
  };

  try { window.RCF_UI_SHELL = API; } catch {}
})();

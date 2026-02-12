/* RControl Factory — app.js (RESTORE UI BASE)
   - Recria a UI completa (tabs + views) dentro de #app
   - Mantém teu Agent/Editor/Apps/Logs
   - Corrige “só aparece Admin / sumiu tudo”
   - Settings: Segurança (PIN) + Logs (com botões funcionando)
   - Maintenance: carrega mother_selfupdate.js (compatível com CF Pages build output = app)
*/

(() => {
  "use strict";

  // -----------------------------
  // Utils
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const nowISO = () => new Date().toISOString();

  const slugify = (str) => {
    return String(str || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const safeJsonParse = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  function safeJsonStringify(obj) {
    try { return JSON.stringify(obj); } catch { return String(obj); }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  // -----------------------------
  // Storage
  // -----------------------------
  const Storage = {
    prefix: "rcf:",
    get(key, fallback) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        if (v == null) return fallback;
        return safeJsonParse(v, fallback);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch {}
    },
    del(key) {
      try { localStorage.removeItem(this.prefix + key); } catch {}
    }
  };

  // -----------------------------
  // Logger
  // -----------------------------
  const Logger = {
    bufKey: "logs",
    max: 400,

    _mirrorUI(logs) {
      const txt = (logs || []).join("\n");

      const boxDrawer = $("#logsBox");
      if (boxDrawer) boxDrawer.textContent = txt;

      const boxLogsOut = $("#logsOut");
      if (boxLogsOut) boxLogsOut.textContent = txt;

      const boxView = $("#logsViewBox");
      if (boxView) boxView.textContent = txt;
    },

    write(...args) {
      const msg = args
        .map(a => (typeof a === "string" ? a : safeJsonStringify(a)))
        .join(" ");

      const line = `[${new Date().toLocaleString()}] ${msg}`;
      const logs = Storage.get(this.bufKey, []);
      logs.push(line);
      while (logs.length > this.max) logs.shift();
      Storage.set(this.bufKey, logs);

      this._mirrorUI(logs);

      try { console.log("[RCF]", ...args); } catch {}
    },

    clear() {
      Storage.set(this.bufKey, []);
      this._mirrorUI([]);
    },

    getAll() {
      return Storage.get(this.bufKey, []);
    }
  };

  window.RCF_LOGGER = window.RCF_LOGGER || {
    push(level, msg) { Logger.write(String(level || "log") + ":", msg); },
    clear() { Logger.clear(); },
    getText() { return Logger.getAll().join("\n"); },
    dump() { return Logger.getAll().join("\n"); }
  };

  // -----------------------------
  // Touch / Tap bind (iOS safe)
  // -----------------------------
  function bindTap(el, fn) {
    if (!el) return;

    let last = 0;
    const handler = (ev) => {
      const t = Date.now();
      if (ev.type === "click" && (t - last) < 250) return;
      last = t;

      if (ev.type === "touchend") ev.preventDefault();

      try { fn(ev); }
      catch (e) { Logger.write("tap err:", e?.message || e); }
    };

    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    el.addEventListener("pointerup", handler, { passive: true });
    el.addEventListener("touchend", handler, { passive: false });
    el.addEventListener("click", handler, { passive: true });
  }

  // -----------------------------
  // Dynamic script loader
  // -----------------------------
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      try {
        const exists = $$("script").some(s => (s.getAttribute("src") || "") === src);
        if (exists) return resolve({ ok: true, cached: true });

        const s = document.createElement("script");
        s.src = src;
        s.defer = true;
        s.onload = () => resolve({ ok: true, cached: false });
        s.onerror = () => reject(new Error("Falhou carregar: " + src));
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  // -----------------------------
  // State
  // -----------------------------
  const State = {
    cfg: Storage.get("cfg", {
      mode: "safe",
      autoApplySafe: true,
      writeMode: "modal"
    }),

    apps: Storage.get("apps", []),

    active: Storage.get("active", {
      appSlug: null,
      file: null,
      view: "dashboard"
    }),

    pending: Storage.get("pending", {
      patch: null,
      source: null
    })
  };

  function saveAll() {
    Storage.set("cfg", State.cfg);
    Storage.set("apps", State.apps);
    Storage.set("active", State.active);
    Storage.set("pending", State.pending);
  }

  // -----------------------------
  // UI Shell
  // -----------------------------
  function renderShell() {
    const root = $("#app");
    if (!root) return;
    if ($("#rcfRoot")) return;

    root.innerHTML = `
      <div id="rcfRoot">
        <header class="topbar">
          <div class="brand">
            <div class="dot"></div>
            <div class="brand-text">
              <div class="title">RControl Factory</div>
              <div class="subtitle">Factory interna • PWA • Offline-first</div>
            </div>
            <div class="spacer"></div>
            <button class="btn small" id="btnOpenTools" type="button">⚙️</button>
            <div class="status-pill" id="statusPill" style="margin-left:10px">
              <span class="ok" id="statusText">OK ✅</span>
            </div>
          </div>

          <nav class="tabs">
            <button class="tab" data-view="dashboard" type="button">Dashboard</button>
            <button class="tab" data-view="newapp" type="button">New App</button>
            <button class="tab" data-view="editor" type="button">Editor</button>
            <button class="tab" data-view="generator" type="button">Generator</button>
            <button class="tab" data-view="agent" type="button">Agente</button>
            <button class="tab" data-view="settings" type="button">Settings</button>
            <button class="tab" data-view="admin" type="button">Admin</button>
          </nav>
        </header>

        <main class="container views" id="views">

          <section class="view card hero" id="view-dashboard">
            <h1>Dashboard</h1>
            <p>Central do projeto. Selecione um app e comece a editar.</p>
            <div class="status-box">
              <div class="badge" id="activeAppText">Sem app ativo ✅</div>
              <div class="spacer"></div>
              <button class="btn small" id="btnCreateNewApp" type="button">Criar App</button>
              <button class="btn small" id="btnOpenEditor" type="button">Abrir Editor</button>
              <button class="btn small ghost" id="btnExportBackup" type="button">Backup (JSON)</button>
            </div>

            <h2 style="margin-top:14px">Apps</h2>
            <div id="appsList" class="apps"></div>
          </section>

          <section class="view card" id="view-newapp">
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

          <section class="view card" id="view-editor">
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
                <div id="filesList" class="files"></div>
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

          <section class="view card" id="view-generator">
            <h1>Generator</h1>
            <p class="hint">Gera ZIP do app selecionado (stub por enquanto).</p>
            <div class="row">
              <button class="btn ok" id="btnGenZip" type="button">Build ZIP</button>
              <button class="btn ghost" id="btnGenPreview" type="button">Preview</button>
            </div>
            <pre class="mono" id="genOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-agent">
            <h1>Agente</h1>
            <p class="hint">Comandos naturais + patchset.</p>

            <div class="row cmd">
              <input id="agentCmd" placeholder='Ex: create "Meu App" meu-app' />
              <button class="btn ok" id="btnAgentRun" type="button">Executar</button>
              <button class="btn ghost" id="btnAgentClear" type="button">Ajuda</button>
            </div>

            <pre class="mono" id="agentOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-settings">
            <h1>Settings</h1>
            <p class="hint">Central de configurações.</p>

            <div class="status-box" id="settingsMount">
              <div class="badge">✅ Settings carregado.</div>
              <div class="hint">Central de configurações (sem GitHub aqui). GitHub fica no Admin.</div>
            </div>

            <div class="card" id="settings-security">
              <h2>Segurança</h2>
              <p class="hint">Define um PIN para liberar ações críticas no Admin (recomendado).</p>
              <div class="row">
                <input id="pinInput" placeholder="Definir PIN (4-8 dígitos)" inputmode="numeric" />
                <button class="btn ok" id="btnPinSave" type="button">Salvar PIN</button>
                <button class="btn danger" id="btnPinRemove" type="button">Remover PIN</button>
              </div>
              <pre class="mono" id="pinOut">Pronto.</pre>
            </div>

            <div class="card" id="settings-logs">
              <h2>Logs</h2>
              <p class="hint">Ver, exportar e limpar logs locais.</p>
              <div class="row">
                <button class="btn ghost" id="btnLogsRefresh" type="button">Atualizar</button>
                <button class="btn ok" id="btnLogsCopy" type="button">Exportar .txt</button>
                <button class="btn danger" id="btnLogsClear" type="button">Limpar logs</button>
              </div>
              <pre class="mono small" id="logsOut">Pronto.</pre>
            </div>

            <div class="card" id="settings-diag">
              <h2>Diag / Atalhos</h2>
              <p class="hint">Atalhos rápidos.</p>
              <div class="row">
                <button class="btn ghost" id="btnGoDiagnose" type="button">Diagnosticar</button>
                <button class="btn ghost" id="btnGoAdmin" type="button">Abrir Admin</button>
                <button class="btn danger" id="btnClearLogs2" type="button">Limpar logs</button>
              </div>
              <pre class="mono" id="diagShortcutOut">Pronto.</pre>
            </div>
          </section>

          <section class="view card" id="view-logs">
            <h1>Logs</h1>
            <div class="row">
              <button class="btn ghost" id="btnLogsRefresh2" type="button">Atualizar</button>
              <button class="btn ok" id="btnCopyLogs" type="button">Copiar</button>
              <button class="btn danger" id="btnClearLogs" type="button">Limpar</button>
            </div>
            <pre class="mono small" id="logsViewBox">Pronto.</pre>
          </section>

          <section class="view card" id="view-diagnostics">
            <h1>Diagnostics</h1>
            <div class="row">
              <button class="btn ok" id="btnDiagRun" type="button">Rodar</button>
              <button class="btn ghost" id="btnDiagClear" type="button">Limpar</button>
            </div>
            <pre class="mono" id="diagOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-admin">
            <h1>Admin</h1>
            <p class="hint">Diagnóstico / manutenção / self-update.</p>

            <div class="row">
              <button class="btn ghost" id="btnAdminDiag" type="button">Diagnosticar</button>
              <button class="btn danger" id="btnAdminZero" type="button">Zerar (safe)</button>
            </div>

            <pre class="mono" id="adminOut">Pronto.</pre>

            <div class="card" id="admin-github">
              <h2>GitHub Sync (Privado) — SAFE</h2>
              <p class="hint">Puxa/Empurra o bundle no seu repo.</p>

              <div class="row form">
                <input id="ghOwner" placeholder="owner (ex: rcontrol-factory)" />
                <input id="ghRepo" placeholder="repo (ex: rcontrol-factory)" />
              </div>

              <div class="row form">
                <input id="ghBranch" placeholder="branch (ex: main)" value="main" />
                <input id="ghPath" placeholder="path (ex: app/import/mother_bundle.json)" value="app/import/mother_bundle.json" />
              </div>

              <div class="row form">
                <input id="ghToken" placeholder="TOKEN (PAT) — contents:read/write" />
                <button class="btn ghost" id="btnGhSave" type="button">Salvar config</button>
              </div>

              <div class="row">
                <button class="btn ghost" id="btnGhPull" type="button">⬇️ Pull (baixar do GitHub)</button>
                <button class="btn ok" id="btnGhPush" type="button">⬆️ Push (enviar p/ GitHub)</button>
                <button class="btn ghost" id="btnGhRefresh" type="button">⚡ Atualizar agora</button>
              </div>

              <pre class="mono" id="ghOut">GitHub: pronto.</pre>
            </div>

            <div class="card" id="admin-maint">
              <h2>MAINTENANCE • Self-Update (Mãe)</h2>
              <p class="hint">Carrega mother_selfupdate.js (Cloudflare Build output = app → caminho real começa em /js/...)</p>
              <div class="row">
                <button class="btn ghost" id="btnMaeLoad" type="button">Carregar Mãe</button>
                <button class="btn ok" id="btnMaeRun" type="button">Rodar Check</button>
              </div>
              <pre class="mono" id="maintOut">Pronto.</pre>
            </div>
          </section>

        </main>

        <!-- Tools Drawer (IDs SEM CONFLITO) -->
        <div class="tools" id="toolsDrawer">
          <div class="tools-head">
            <div style="font-weight:800">Ferramentas</div>
            <button class="btn small" id="btnCloseTools" type="button">Fechar</button>
          </div>
          <div class="tools-body">
            <div class="row">
              <button class="btn ghost" id="btnDrawerLogsRefresh" type="button">Atualizar logs</button>
              <button class="btn ok" id="btnDrawerLogsCopy" type="button">Copiar logs</button>
              <button class="btn danger" id="btnDrawerLogsClear" type="button">Limpar logs</button>
            </div>
            <pre class="mono small" id="logsBox">Pronto.</pre>
          </div>
        </div>

      </div>
    `;
  }

  // -----------------------------
  // Views + Status
  // -----------------------------
  function setStatusPill(text) {
    const el = $("#statusText");
    if (el) el.textContent = text;
  }

  function refreshLogsViews() {
    Logger._mirrorUI(Logger.getAll());
  }

  function setView(name) {
    if (!name) return;

    State.active.view = name;
    saveAll();

    $$(".view").forEach(v => v.classList.remove("active"));
    $$("[data-view]").forEach(b => b.classList.remove("active"));

    const view = $(`#view-${CSS.escape(name)}`);
    if (view) view.classList.add("active");

    $$(`[data-view="${name}"]`).forEach(b => b.classList.add("active"));

    if (name === "logs" || name === "settings") refreshLogsViews();

    Logger.write("view:", name);
  }

  function openTools(open) {
    const d = $("#toolsDrawer");
    if (!d) return;
    if (open) d.classList.add("open");
    else d.classList.remove("open");
  }

  // -----------------------------
  // Apps / Editor
  // -----------------------------
  function getActiveApp() {
    if (!State.active.appSlug) return null;
    return State.apps.find(a => a.slug === State.active.appSlug) || null;
  }

  function ensureAppFiles(app) {
    if (!app.files) app.files = {};
    if (typeof app.files !== "object") app.files = {};
  }

  function renderAppsList() {
    const box = $("#appsList");
    if (!box) return;

    if (!State.apps.length) {
      box.innerHTML = `<div class="hint">Nenhum app salvo ainda.</div>`;
      return;
    }

    box.innerHTML = "";
    State.apps.forEach(app => {
      const row = document.createElement("div");
      row.className = "app-item";
      row.innerHTML = `
        <div>
          <div style="font-weight:800">${escapeHtml(app.name)}</div>
          <div class="hint">${escapeHtml(app.slug)}</div>
        </div>
        <div class="row">
          <button class="btn small" data-act="select" data-slug="${escapeAttr(app.slug)}" type="button">Selecionar</button>
          <button class="btn small" data-act="edit" data-slug="${escapeAttr(app.slug)}" type="button">Editor</button>
        </div>
      `;
      box.appendChild(row);
    });

    $$('[data-act="select"]', box).forEach(btn => {
      bindTap(btn, () => setActiveApp(btn.getAttribute("data-slug")));
    });
    $$('[data-act="edit"]', box).forEach(btn => {
      bindTap(btn, () => {
        setActiveApp(btn.getAttribute("data-slug"));
        setView("editor");
      });
    });
  }

  function renderFilesList() {
    const box = $("#filesList");
    if (!box) return;

    const app = getActiveApp();
    if (!app) {
      box.innerHTML = `<div class="hint">Selecione um app para ver arquivos.</div>`;
      return;
    }

    ensureAppFiles(app);
    const files = Object.keys(app.files);
    if (!files.length) {
      box.innerHTML = `<div class="hint">App sem arquivos.</div>`;
      return;
    }

    box.innerHTML = "";
    files.forEach(fname => {
      const item = document.createElement("div");
      item.className = "file-item" + (State.active.file === fname ? " active" : "");
      item.textContent = fname;
      bindTap(item, () => openFile(fname));
      box.appendChild(item);
    });
  }

  function openFile(fname) {
    const app = getActiveApp();
    if (!app) return false;

    ensureAppFiles(app);
    if (!(fname in app.files)) return false;

    State.active.file = fname;
    saveAll();

    const head = $("#editorHead");
    if (head) head.textContent = `Arquivo atual: ${fname}`;

    const ta = $("#fileContent");
    if (ta) ta.value = String(app.files[fname] ?? "");

    renderFilesList();
    return true;
  }

  function setActiveApp(slug) {
    const app = State.apps.find(a => a.slug === slug);
    if (!app) return false;

    State.active.appSlug = slug;
    State.active.file = State.active.file || Object.keys(app.files || {})[0] || null;
    saveAll();

    const text = $("#activeAppText");
    if (text) text.textContent = `App ativo: ${app.name} (${app.slug}) ✅`;

    renderAppsList();
    renderFilesList();
    if (State.active.file) openFile(State.active.file);

    Logger.write("app selected:", slug);
    return true;
  }

  function createApp(name, slugMaybe) {
    const nameClean = String(name || "").trim();
    if (!nameClean) return { ok: false, msg: "Nome inválido" };

    let slug = slugify(slugMaybe || nameClean);
    if (!slug) return { ok: false, msg: "Slug inválido" };
    if (State.apps.some(a => a.slug === slug)) return { ok: false, msg: "Slug já existe" };

    const app = {
      name: nameClean,
      slug,
      createdAt: nowISO(),
      files: {
        "index.html": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nameClean}</title></head><body><h1>${nameClean}</h1><script src="app.js"></script></body></html>`,
        "styles.css": `body{font-family:system-ui;margin:0;padding:24px;background:#0b1220;color:#fff}`,
        "app.js": `console.log("${nameClean}");`
      }
    };

    State.apps.push(app);
    saveAll();
    renderAppsList();
    setActiveApp(slug);

    return { ok: true, msg: `✅ App criado: ${nameClean} (${slug})` };
  }

  function uiMsg(sel, text) {
    const el = $(sel);
    if (el) el.textContent = String(text ?? "");
  }

  function saveFile() {
    const app = getActiveApp();
    if (!app) return uiMsg("#editorOut", "⚠️ Sem app ativo.");

    const fname = State.active.file;
    if (!fname) return uiMsg("#editorOut", "⚠️ Sem arquivo ativo.");

    const ta = $("#fileContent");
    ensureAppFiles(app);
    app.files[fname] = ta ? String(ta.value || "") : "";

    saveAll();
    uiMsg("#editorOut", "✅ Arquivo salvo.");
    Logger.write("file saved:", app.slug, fname);
  }

  // -----------------------------
  // Agent
  // -----------------------------
  const Agent = {
    help() {
      return [
        "AGENT HELP",
        "",
        "Comandos:",
        "- help",
        "- list",
        "- create NOME [SLUG]",
        "- create \"NOME COM ESPAÇO\" [SLUG]",
        "- select SLUG",
        "- open dashboard | open newapp | open editor | open generator | open agent | open settings | open admin | open logs | open diagnostics",
        "- show",
      ].join("\n");
    },

    list() {
      if (!State.apps.length) return "(vazio)";
      return State.apps.map(a => `${a.slug} — ${a.name}`).join("\n");
    },

    show() {
      const app = getActiveApp();
      return [
        `mode: ${State.cfg.mode}`,
        `apps: ${State.apps.length}`,
        `active app: ${app ? `${app.name} (${app.slug})` : "-"}`,
        `active file: ${State.active.file || "-"}`,
        `view: ${State.active.view}`
      ].join("\n");
    },

    route(cmdRaw) {
      const cmd = String(cmdRaw || "").trim();
      const out = $("#agentOut");
      if (!cmd) { out && (out.textContent = "Comando vazio."); return; }

      const lower = cmd.toLowerCase();

      if (lower === "help") { out && (out.textContent = this.help()); return; }
      if (lower === "list") { out && (out.textContent = this.list()); return; }
      if (lower === "show") { out && (out.textContent = this.show()); return; }

      if (lower.startsWith("open ")) {
        const target = lower.replace("open ", "").trim();
        const map = {
          dashboard: "dashboard",
          newapp: "newapp",
          "new app": "newapp",
          editor: "editor",
          generator: "generator",
          agent: "agent",
          settings: "settings",
          admin: "admin",
          logs: "logs",
          diagnostics: "diagnostics",
          diag: "diagnostics"
        };
        const v = map[target] || target;
        setView(v);
        out && (out.textContent = `OK. view=${v}`);
        return;
      }

      if (lower.startsWith("create ")) {
        const rest = cmd.replace(/^create\s+/i, "").trim();
        const qm = rest.match(/^"([^"]+)"\s*([a-z0-9-]+)?/i);
        let name = "", slug = "";
        if (qm) {
          name = qm[1].trim();
          slug = (qm[2] || "").trim();
        } else {
          name = rest;
        }
        const r = createApp(name, slug);
        out && (out.textContent = r.msg);
        return;
      }

      if (lower.startsWith("select ")) {
        const slug = slugify(cmd.replace(/^select\s+/i, "").trim());
        const ok = setActiveApp(slug);
        out && (out.textContent = ok ? `OK. selecionado: ${slug}` : `Falhou: ${slug}`);
        return;
      }

      out && (out.textContent = "Comando não reconhecido. Use: help");
    }
  };

  // -----------------------------
  // Admin Diagnostics
  // -----------------------------
  const Admin = {
    diagnostics() {
      const info = {
        cfg: State.cfg,
        apps: State.apps.length,
        active: State.active.appSlug || "-",
        file: State.active.file || "-",
        view: State.active.view || "-",
        ua: navigator.userAgent
      };
      return "RCF DIAGNÓSTICO\n" + JSON.stringify(info, null, 2);
    }
  };

  // -----------------------------
  // Settings PIN
  // -----------------------------
  const Pin = {
    key: "admin_pin",
    get() { return Storage.get(this.key, ""); },
    set(pin) { Storage.set(this.key, String(pin || "")); },
    clear() { Storage.del(this.key); }
  };

  // -----------------------------
  // MAE (Maintenance / Self-update)
  // -----------------------------
  async function maeLoad() {
    uiMsg("#maintOut", "Carregando mãe...");

    // Cloudflare Pages com Build output = app:
    // repo: app/js/core/mother_selfupdate.js
    // url:  /js/core/mother_selfupdate.js
    const candidates = [
      "/js/core/mother_selfupdate.js",      // ✅ correto no seu setup atual
      "/app/js/core/mother_selfupdate.js"   // fallback se um dia mudar build output
    ];

    let lastErr = null;

    for (const src of candidates) {
      try {
        await loadScriptOnce(src);
        const ok = !!(window.RCF_MAE || window.RCF_MOTHER || window.MOTHER_SELFUPDATE);
        if (ok) {
          uiMsg("#maintOut", `✅ Mãe carregada. (${src})`);
          Logger.write("mae load ok:", src);
          refreshAdminStatus();
          return;
        }
        // script carregou mas não expôs API
        uiMsg("#maintOut", `⚠️ Script carregou (${src}), mas não expôs API global.`);
        Logger.write("mae load:", "no api", src);
        refreshAdminStatus();
        return;
      } catch (e) {
        lastErr = e;
        Logger.write("mae load fail:", src, e?.message || e);
      }
    }

    uiMsg("#maintOut", "❌ " + (lastErr?.message || lastErr || "Falhou carregar mãe."));
  }

  function maeCheck() {
    const api = window.RCF_MAE || window.RCF_MOTHER || window.MOTHER_SELFUPDATE;
    if (!api) {
      uiMsg("#maintOut", "❌ Mãe não está disponível. Clique em 'Carregar Mãe' primeiro.");
      return;
    }
    try {
      if (typeof api.status === "function") {
        uiMsg("#maintOut", "MAE STATUS:\n" + safeJsonStringify(api.status()));
      } else {
        uiMsg("#maintOut", "✅ Mãe presente. API keys:\n" + Object.keys(api).join(", "));
      }
      Logger.write("mae check ok");
      refreshAdminStatus();
    } catch (e) {
      uiMsg("#maintOut", "❌ Erro no check: " + (e?.message || e));
      Logger.write("mae check err:", e?.message || e);
    }
  }

  // -----------------------------
  // GitHub Sync status + config hydrate
  // -----------------------------
  function hydrateGhInputs() {
    const cfg = Storage.get("ghcfg", null);
    if (!cfg) return;
    if ($("#ghOwner")) $("#ghOwner").value = cfg.owner || "";
    if ($("#ghRepo")) $("#ghRepo").value = cfg.repo || "";
    if ($("#ghBranch")) $("#ghBranch").value = cfg.branch || "main";
    if ($("#ghPath")) $("#ghPath").value = cfg.path || "app/import/mother_bundle.json";
    if ($("#ghToken")) $("#ghToken").value = cfg.token || "";
  }

  function refreshAdminStatus() {
    const out = $("#adminOut");
    if (!out) return;

    const ghOk = !!window.RCF_GH_SYNC;
    const maeOk = !!(window.RCF_MAE || window.RCF_MOTHER || window.MOTHER_SELFUPDATE);

    out.textContent =
`Pronto.
MAE: ${maeOk ? "carregada ✅" : "ausente ❌ (Carregar Mãe)"}
GitHub Sync: ${ghOk ? "carregado ✅" : "ausente ❌ (github_sync.js)"}
`;
  }

  // -----------------------------
  // Bind UI
  // -----------------------------
  function bindUI() {
    $$("[data-view]").forEach(btn => bindTap(btn, () => setView(btn.getAttribute("data-view"))));

    bindTap($("#btnOpenTools"), () => openTools(true));
    bindTap($("#btnCloseTools"), () => openTools(false));

    bindTap($("#btnCreateNewApp"), () => setView("newapp"));
    bindTap($("#btnOpenEditor"), () => setView("editor"));
    bindTap($("#btnExportBackup"), () => {
      const payload = JSON.stringify({ apps: State.apps, cfg: State.cfg, active: State.active }, null, 2);
      try { navigator.clipboard.writeText(payload); } catch {}
      setStatusPill("Backup copiado ✅");
      setTimeout(() => setStatusPill("OK ✅"), 800);
      Logger.write("backup copied");
    });

    bindTap($("#btnAutoSlug"), () => {
      const n = ($("#newAppName")?.value || "");
      const s = slugify(n);
      const inSlug = $("#newAppSlug");
      if (inSlug) inSlug.value = s;
    });

    bindTap($("#btnDoCreateApp"), () => {
      const name = ($("#newAppName")?.value || "");
      const slug = ($("#newAppSlug")?.value || "");
      const r = createApp(name, slug);
      uiMsg("#newAppOut", r.msg);
      if (r.ok) { setView("editor"); setStatusPill("OK ✅"); }
      else setStatusPill("ERRO ❌");
    });

    bindTap($("#btnSaveFile"), () => saveFile());
    bindTap($("#btnResetFile"), () => {
      const app = getActiveApp();
      if (!app || !State.active.file) return uiMsg("#editorOut", "⚠️ Selecione app e arquivo.");
      ensureAppFiles(app);
      app.files[State.active.file] = "";
      saveAll();
      openFile(State.active.file);
      uiMsg("#editorOut", "⚠️ Arquivo resetado (limpo).");
    });

    bindTap($("#btnGenZip"), () => uiMsg("#genOut", "ZIP (stub)."));
    bindTap($("#btnGenPreview"), () => uiMsg("#genOut", "Preview (stub)."));

    bindTap($("#btnAgentRun"), () => Agent.route($("#agentCmd")?.value || ""));
    bindTap($("#btnAgentClear"), () => { uiMsg("#agentOut", Agent.help()); });

    const doLogsRefresh = () => {
      refreshLogsViews();
      setStatusPill("Logs ✅");
      setTimeout(() => setStatusPill("OK ✅"), 600);
    };
    const doLogsClear = () => {
      Logger.clear();
      doLogsRefresh();
      setStatusPill("Logs limpos ✅");
      setTimeout(() => setStatusPill("OK ✅"), 600);
    };
    const doLogsCopy = async () => {
      const txt = Logger.getAll().join("\n");
      try { await navigator.clipboard.writeText(txt); } catch {}
      setStatusPill("Logs copiados ✅");
      setTimeout(() => setStatusPill("OK ✅"), 800);
    };

    bindTap($("#btnLogsRefresh"), doLogsRefresh);
    bindTap($("#btnLogsClear"), doLogsClear);
    bindTap($("#btnLogsCopy"), doLogsCopy);

    bindTap($("#btnLogsRefresh2"), doLogsRefresh);
    bindTap($("#btnClearLogs"), doLogsClear);
    bindTap($("#btnCopyLogs"), doLogsCopy);

    bindTap($("#btnDrawerLogsRefresh"), doLogsRefresh);
    bindTap($("#btnDrawerLogsClear"), doLogsClear);
    bindTap($("#btnDrawerLogsCopy"), doLogsCopy);

    bindTap($("#btnDiagRun"), () => {
      uiMsg("#diagOut", Admin.diagnostics());
      setStatusPill("Diag ✅");
      setTimeout(() => setStatusPill("OK ✅"), 700);
    });
    bindTap($("#btnDiagClear"), () => {
      uiMsg("#diagOut", "Pronto.");
      setStatusPill("OK ✅");
    });

    bindTap($("#btnGoDiagnose"), () => { setView("diagnostics"); uiMsg("#diagShortcutOut", "Abrindo diagnostics..."); });
    bindTap($("#btnGoAdmin"), () => { setView("admin"); uiMsg("#diagShortcutOut", "Abrindo admin..."); });

    bindTap($("#btnPinSave"), () => {
      const raw = String($("#pinInput")?.value || "").trim();
      if (!/^\d{4,8}$/.test(raw)) return uiMsg("#pinOut", "⚠️ PIN inválido. Use 4 a 8 dígitos.");
      Pin.set(raw);
      uiMsg("#pinOut", "✅ PIN salvo.");
      Logger.write("pin saved");
    });

    bindTap($("#btnPinRemove"), () => {
      Pin.clear();
      uiMsg("#pinOut", "✅ PIN removido.");
      Logger.write("pin removed");
    });

    bindTap($("#btnAdminDiag"), () => { uiMsg("#adminOut", Admin.diagnostics()); });
    bindTap($("#btnAdminZero"), () => {
      Logger.clear();
      setStatusPill("Zerado ✅");
      setTimeout(() => setStatusPill("OK ✅"), 800);
      uiMsg("#adminOut", "✅ Zerado (safe). Logs limpos.");
      Logger.write("admin zero safe");
      refreshAdminStatus();
    });

    bindTap($("#btnGhSave"), () => {
      const cfg = {
        owner: ($("#ghOwner")?.value || "").trim(),
        repo: ($("#ghRepo")?.value || "").trim(),
        branch: ($("#ghBranch")?.value || "main").trim(),
        path: ($("#ghPath")?.value || "app/import/mother_bundle.json").trim(),
        token: ($("#ghToken")?.value || "").trim()
      };
      Storage.set("ghcfg", cfg);
      uiMsg("#ghOut", "✅ Config salva (local).");
      Logger.write("gh cfg saved");
    });

    bindTap($("#btnGhPull"), () => {
      if (!window.RCF_GH_SYNC) return uiMsg("#ghOut", "❌ GitHub Sync ausente. Corrija github_sync.js");
      window.RCF_GH_SYNC.pull().then(m => uiMsg("#ghOut", m)).catch(e => uiMsg("#ghOut", "❌ " + (e.message||e)));
    });

    bindTap($("#btnGhPush"), () => {
      if (!window.RCF_GH_SYNC) return uiMsg("#ghOut", "❌ GitHub Sync ausente. Corrija github_sync.js");
      window.RCF_GH_SYNC.push().then(m => uiMsg("#ghOut", m)).catch(e => uiMsg("#ghOut", "❌ " + (e.message||e)));
    });

    bindTap($("#btnGhRefresh"), () => {
      refreshAdminStatus();
      uiMsg("#ghOut", window.RCF_GH_SYNC ? "GitHub: módulo carregado ✅" : "GitHub Sync ausente ❌");
    });

    bindTap($("#btnMaeLoad"), maeLoad);
    bindTap($("#btnMaeRun"), maeCheck);

    bindTap($("#statusPill"), () => Logger.write("touch:", "TOP=" + (document.activeElement?.tagName || "-")));
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function hydrateUIFromState() {
    refreshLogsViews();
    renderAppsList();

    const app = getActiveApp();
    if (app) {
      setActiveApp(app.slug);
      if (State.active.file) openFile(State.active.file);
    } else {
      const text = $("#activeAppText");
      if (text) text.textContent = "Sem app ativo ✅";
    }

    setView(State.active.view || "dashboard");

    const pin = Pin.get();
    if (pin) uiMsg("#pinOut", "PIN definido ✅");
  }

  function init() {
    renderShell();
    bindUI();
    hydrateGhInputs();
    hydrateUIFromState();
    refreshAdminStatus();

    Logger.write("RCF app.js init ok — mode:", State.cfg.mode);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { passive: true });
  } else {
    init();
  }

  window.RCF = window.RCF || {};
  window.RCF.state = State;
  window.RCF.log = (...a) => Logger.write(...a);

})();

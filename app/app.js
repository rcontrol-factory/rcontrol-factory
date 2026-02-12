/* RControl Factory — app.js (STABILITY CORE + RESTORE UI BASE) — UPDATED (V7)
   - UI completa (tabs + views) dentro de #app
   - Agent/Editor/Apps/Logs
   - Settings: PIN + Logs
   - Admin: GitHub + Maintenance (Mãe)
   - STABILITY CORE: ErrorGuard + SafeInit + FallbackScreen
   - Auto-load core modules when needed (vfs_overrides, github_sync)
   - Auto-boot Diagnostics (core/diagnostics.js) no init
   - V7: BOOT LOCK + SW Tools + Diagnostics V7 runner
   - Cloudflare Pages build output = app (site na raiz /)
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

  function uiMsg(sel, text) {
    const el = $(sel);
    if (el) el.textContent = String(text ?? "");
  }

  function textContentSafe(el, txt) {
    try { el.textContent = txt; } catch {}
  }

  function safeSetStatus(txt) {
    try {
      const el = $("#statusText");
      if (el) el.textContent = String(txt || "");
    } catch {}
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
    max: 700,

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
      const msg = args.map(a => (typeof a === "string" ? a : safeJsonStringify(a))).join(" ");
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
  // STABILITY CORE — Global Error Guard + Fallback UI
  // -----------------------------
  const Stability = (() => {
    let installed = false;
    let originalConsoleError = null;

    function normalizeErr(e) {
      try {
        if (!e) return { message: "unknown", stack: "" };
        if (typeof e === "string") return { message: e, stack: "" };
        return { message: String(e.message || e), stack: String(e.stack || "") };
      } catch {
        return { message: "unknown", stack: "" };
      }
    }

    function showErrorScreen(title, details) {
      try {
        const root = $("#app");
        if (!root) return;

        root.innerHTML = `
          <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:18px;background:#070b12;color:#fff;font-family:system-ui">
            <div style="max-width:780px;width:100%;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px;background:rgba(255,255,255,.04)">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <div style="font-size:20px">⚠️</div>
                <div style="font-weight:900;font-size:18px">${escapeHtml(title || "Erro")}</div>
              </div>
              <div style="opacity:.9;margin-bottom:10px">
                A Factory detectou um erro e abriu esta tela controlada para evitar “tela branca”.
              </div>
              <pre style="white-space:pre-wrap;word-break:break-word;padding:12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);max-height:45vh;overflow:auto">${escapeHtml(String(details || ""))}</pre>
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
                <button id="rcfReloadBtn" style="padding:10px 14px;border-radius:10px;border:0;background:#2dd4bf;color:#022; font-weight:800">Recarregar</button>
                <button id="rcfClearLogsBtn" style="padding:10px 14px;border-radius:10px;border:0;background:#ef4444;color:#fff;font-weight:800">Limpar logs</button>
              </div>
            </div>
          </div>
        `;

        const r = $("#rcfReloadBtn");
        r && r.addEventListener("click", () => location.reload(), { passive: true });

        const c = $("#rcfClearLogsBtn");
        c && c.addEventListener("click", () => {
          try { Logger.clear(); } catch {}
          try { localStorage.removeItem("rcf:logs"); } catch {}
          alert("Logs limpos.");
        });
      } catch {}
    }

    function install() {
      if (installed) return;
      installed = true;

      window.addEventListener("error", (ev) => {
        try {
          const msg = ev?.message || "window.error";
          const src = ev?.filename ? ` @ ${ev.filename}:${ev.lineno || 0}:${ev.colno || 0}` : "";
          Logger.write("ERR:", msg + src);
          if (ev?.error) {
            const ne = normalizeErr(ev.error);
            Logger.write("ERR.stack:", ne.stack || "(no stack)");
          }
        } catch {}
      });

      window.addEventListener("unhandledrejection", (ev) => {
        try {
          const ne = normalizeErr(ev?.reason);
          Logger.write("UNHANDLED:", ne.message);
          if (ne.stack) Logger.write("UNHANDLED.stack:", ne.stack);
        } catch {}
      });

      try {
        if (!originalConsoleError) originalConsoleError = console.error.bind(console);
        console.error = (...args) => {
          try { Logger.write("console.error:", ...args); } catch {}
          try { originalConsoleError(...args); } catch {}
        };
      } catch {}

      Logger.write("stability:", "ErrorGuard installed ✅");
    }

    return { install, showErrorScreen };
  })();

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

      try { if (ev.cancelable) ev.preventDefault(); } catch {}

      try { fn(ev); }
      catch (e) { Logger.write("tap err:", e?.message || e); }
    };

    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    el.addEventListener("pointerup", handler, { passive: false });
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
            <button class="tab" data-view="diagnostics" type="button">Diagnostics</button>
            <button class="tab" data-view="logs" type="button">Logs</button>
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

            <div class="card" id="settings-security">
              <h2>Segurança</h2>
              <p class="hint">Define um PIN para liberar ações críticas no Admin.</p>
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

          <section class="view card" id="view-diagnostics">
            <h1>Diagnostics</h1>
            <div class="row">
              <button class="btn ok" id="btnDiagRun" type="button">Rodar V7 Stability Check</button>
              <button class="btn ghost" id="btnDiagInstall" type="button">Instalar Guards</button>
              <button class="btn ghost" id="btnDiagScan" type="button">Scan overlays</button>
              <button class="btn ghost" id="btnDiagTests" type="button">Run micro-tests</button>
              <button class="btn danger" id="btnDiagClear" type="button">Limpar</button>
            </div>
            <pre class="mono" id="diagOut">Pronto.</pre>
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

          <section class="view card" id="view-admin">
            <h1>Admin</h1>

            <div class="row">
              <button class="btn ghost" id="btnAdminDiag" type="button">Diagnosticar (local)</button>
              <button class="btn danger" id="btnAdminZero" type="button">Zerar (safe)</button>
            </div>

            <pre class="mono" id="adminOut">Pronto.</pre>

            <div class="card" id="admin-github">
              <h2>GitHub Sync (Privado) — SAFE</h2>

              <div class="row form">
                <input id="ghOwner" placeholder="owner" />
                <input id="ghRepo" placeholder="repo" />
              </div>

              <div class="row form">
                <input id="ghBranch" placeholder="branch" value="main" />
                <input id="ghPath" placeholder="path" value="app/import/mother_bundle.json" />
              </div>

              <div class="row form">
                <input id="ghToken" placeholder="TOKEN (PAT)" />
                <button class="btn ghost" id="btnGhSave" type="button">Salvar config</button>
              </div>

              <div class="row">
                <button class="btn ghost" id="btnGhPull" type="button">⬇️ Pull</button>
                <button class="btn ok" id="btnGhPush" type="button">⬆️ Push</button>
                <button class="btn ghost" id="btnGhRefresh" type="button">⚡ Status</button>
              </div>

              <pre class="mono" id="ghOut">GitHub: pronto.</pre>
            </div>

            <div class="card" id="admin-maint">
              <h2>MAINTENANCE • Self-Update (Mãe)</h2>
              <div class="row">
                <button class="btn ghost" id="btnMaeLoad" type="button">Carregar Mãe</button>
                <button class="btn ok" id="btnMaeCheck" type="button">Rodar Check</button>
              </div>
              <div class="row">
                <button class="btn ok" id="btnMaeUpdate" type="button">⬇️ Update From GitHub</button>
                <button class="btn danger" id="btnMaeClear" type="button">🧹 Clear Overrides</button>
              </div>
              <pre class="mono" id="maintOut">Pronto.</pre>
            </div>
          </section>

        </main>

        <!-- Tools Drawer -->
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

            <div class="row" style="margin-top:10px">
              <button class="btn ghost" id="btnClearSWCache" type="button">Clear SW Cache</button>
              <button class="btn ghost" id="btnUnregisterSW" type="button">Unregister SW</button>
            </div>

            <pre class="mono small" id="logsBox">Pronto.</pre>
          </div>
        </div>

      </div>
    `;
  }

  // -----------------------------
  // Views
  // -----------------------------
  function refreshLogsViews() {
    Logger._mirrorUI(Logger.getAll());
  }

  function setView(name) {
    if (!name) return;

    State.active.view = name;
    saveAll();

    $$(".view").forEach(v => v.classList.remove("active"));
    $$("[data-view]").forEach(b => b.classList.remove("active"));

    const id = "view-" + String(name).replace(/[^a-z0-9_-]/gi, "");
    const view = document.getElementById(id);
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
    if (text) textContentSafe(text, `App ativo: ${app.name} (${app.slug}) ✅`);

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
  // PIN
  // -----------------------------
  const Pin = {
    key: "admin_pin",
    get() { return Storage.get(this.key, ""); },
    set(pin) { Storage.set(this.key, String(pin || "")); },
    clear() { Storage.del(this.key); }
  };

  // -----------------------------
  // Core modules auto-load
  // -----------------------------
  async function ensureCoreModules() {
    const tasks = [];
    if (!window.RCF_VFS_OVERRIDES) tasks.push(loadScriptOnce("/js/core/vfs_overrides.js").catch(() => null));
    if (!window.RCF_GH_SYNC) tasks.push(loadScriptOnce("/js/core/github_sync.js").catch(() => null));
    await Promise.allSettled(tasks);
  }

  // -----------------------------
  // Diagnostics boot (AUTO)
  // -----------------------------
  async function bootDiagnosticsCore() {
    try {
      await loadScriptOnce("/js/core/diagnostics.js");
      Logger.write("diagnostics core boot: ok ✅");
    } catch (e) {
      Logger.write("diagnostics core boot FAIL:", e?.message || e);
    }
  }

  // -----------------------------
  // Service Worker helpers
  // -----------------------------
  async function ensureSWRegistered() {
    try {
      if (!("serviceWorker" in navigator)) return false;

      // tenta obter registro
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (reg) return true;

      // tenta registrar
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      return true;
    } catch (e) {
      Logger.write("sw register fail:", e?.message || e);
      return false;
    }
  }

  async function unregisterSW() {
    try {
      if (!("serviceWorker" in navigator)) return { ok: false, msg: "serviceWorker não suportado" };

      const regs = await navigator.serviceWorker.getRegistrations();
      if (!regs || !regs.length) return { ok: true, count: 0 };

      let okCount = 0;
      for (const r of regs) {
        try {
          const ok = await r.unregister();
          if (ok) okCount++;
        } catch {}
      }
      return { ok: true, count: okCount };
    } catch (e) {
      return { ok: false, msg: e?.message || String(e) };
    }
  }

  async function clearAllCaches() {
    try {
      if (!("caches" in window)) return { ok: false, msg: "Cache API não suportada" };
      const keys = await caches.keys();
      let n = 0;
      for (const k of keys) {
        try {
          const ok = await caches.delete(k);
          if (ok) n++;
        } catch {}
      }
      return { ok: true, count: n };
    } catch (e) {
      return { ok: false, msg: e?.message || String(e) };
    }
  }

  // -----------------------------
  // GitHub inputs hydrate
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
      safeSetStatus("Backup copiado ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 800);
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
      if (r.ok) { setView("editor"); safeSetStatus("OK ✅"); }
      else safeSetStatus("ERRO ❌");
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
    bindTap($("#btnAgentClear"), () => uiMsg("#agentOut", Agent.help()));

    // Logs helpers
    const doLogsRefresh = () => {
      refreshLogsViews();
      safeSetStatus("Logs ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 600);
    };
    const doLogsClear = () => {
      Logger.clear();
      doLogsRefresh();
      safeSetStatus("Logs limpos ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 600);
    };
    const doLogsCopy = async () => {
      const txt = Logger.getAll().join("\n");
      try { await navigator.clipboard.writeText(txt); } catch {}
      safeSetStatus("Logs copiados ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 800);
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

    // SW tools (drawer)
    bindTap($("#btnUnregisterSW"), async () => {
      safeSetStatus("SW…");
      const r = await unregisterSW();
      if (r.ok) {
        Logger.write("sw unregister:", r.count, "ok");
        safeSetStatus(`SW unreg: ${r.count} ✅`);
      } else {
        Logger.write("sw unregister FAIL:", r.msg);
        safeSetStatus("SW unreg ❌");
      }
      setTimeout(() => safeSetStatus("OK ✅"), 900);
      refreshLogsViews();
    });

    bindTap($("#btnClearSWCache"), async () => {
      safeSetStatus("Cache…");
      const r = await clearAllCaches();
      if (r.ok) {
        Logger.write("cache clear:", r.count, "caches");
        safeSetStatus(`Cache: ${r.count} ✅`);
      } else {
        Logger.write("cache clear FAIL:", r.msg);
        safeSetStatus("Cache ❌");
      }
      setTimeout(() => safeSetStatus("OK ✅"), 900);
      refreshLogsViews();
    });

    // Diagnostics actions (V7)
    bindTap($("#btnDiagRun"), async () => {
      try {
        safeSetStatus("V7…");
        const r = await window.RCF_DIAGNOSTICS?.runStabilityCheck?.();
        uiMsg("#diagOut", r?.text || "Sem relatório.");
        safeSetStatus(window.RCF_STABLE ? "STABLE ✅" : "UNSTABLE ❌");
        setTimeout(() => safeSetStatus("OK ✅"), 900);
      } catch (e) {
        uiMsg("#diagOut", "❌ " + (e?.message || e));
        safeSetStatus("ERRO ❌");
      }
    });

    bindTap($("#btnDiagInstall"), () => {
      try { window.RCF_DIAGNOSTICS?.installAll?.(); uiMsg("#diagOut", "✅ installAll OK"); }
      catch (e) { uiMsg("#diagOut", "❌ " + (e?.message || e)); }
    });

    bindTap($("#btnDiagScan"), () => {
      try {
        const r = window.RCF_DIAGNOSTICS?.scanAll?.();
        uiMsg("#diagOut", JSON.stringify(r, null, 2));
      } catch (e) {
        uiMsg("#diagOut", "❌ " + (e?.message || e));
      }
    });

    bindTap($("#btnDiagTests"), () => {
      try {
        const r = window.RCF_DIAGNOSTICS?.runMicroTests?.();
        uiMsg("#diagOut", JSON.stringify(r, null, 2));
      } catch (e) {
        uiMsg("#diagOut", "❌ " + (e?.message || e));
      }
    });

    bindTap($("#btnDiagClear"), () => uiMsg("#diagOut", "Pronto."));

    // PIN
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

    // Admin quick
    bindTap($("#btnAdminDiag"), () => uiMsg("#adminOut", "Admin OK."));
    bindTap($("#btnAdminZero"), () => {
      Logger.clear();
      safeSetStatus("Zerado ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 800);
      uiMsg("#adminOut", "✅ Zerado (safe). Logs limpos.");
    });

    // Admin GitHub (config only)
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
    });

    bindTap($("#btnGhRefresh"), () => uiMsg("#ghOut", window.RCF_GH_SYNC ? "GitHub: módulo carregado ✅" : "GitHub Sync ausente ❌"));

    // NOTE: Pull/Push/Mãe ainda stub aqui (sem executar ações perigosas no core)
    bindTap($("#btnGhPull"), () => uiMsg("#ghOut", "Pull: (stub)"));
    bindTap($("#btnGhPush"), () => uiMsg("#ghOut", "Push: (stub)"));
    bindTap($("#btnMaeLoad"), async () => {
      uiMsg("#maintOut", "Carregar Mãe: (stub)");
      await ensureCoreModules();
    });
    bindTap($("#btnMaeCheck"), () => uiMsg("#maintOut", "Check: (stub)"));
    bindTap($("#btnMaeUpdate"), () => uiMsg("#maintOut", "Update: (stub)"));
    bindTap($("#btnMaeClear"), () => uiMsg("#maintOut", "Clear overrides: (stub)"));
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
      if (text) textContentSafe(text, "Sem app ativo ✅");
    }

    setView(State.active.view || "dashboard");

    const pin = Pin.get();
    if (pin) uiMsg("#pinOut", "PIN definido ✅");
  }

  async function safeInit() {
    try {
      // -----------------------------
      // V7 BOOT LOCK (impede init duplicado / bug iOS / reload parcial)
      // -----------------------------
      if (window.__RCF_BOOTED__) {
        try { window.RCF_LOGGER?.push?.("warn", "BOOT: safeInit chamado 2x (bloqueado)"); } catch {}
        return;
      }
      window.__RCF_BOOTED__ = Date.now();

      Stability.install();
      renderShell();
      bindUI();
      hydrateGhInputs();
      hydrateUIFromState();

      // ✅ sobe Diagnostics automaticamente no boot
      await bootDiagnosticsCore();

      // SW cedo pro offline-first (não pode travar o app se falhar)
      await ensureSWRegistered();

      Logger.write("RCF app.js init ok — mode:", State.cfg.mode);

      // opcional: marca stable/unstable depois do boot (sem forçar)
      // (o botão "Rodar V7 Stability Check" faz o check completo)
      safeSetStatus("OK ✅");
    } catch (e) {
      const msg = (e?.message || e);
      Logger.write("FATAL init:", msg);
      Stability.showErrorScreen("Falha ao iniciar (safeInit)", String(msg));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { safeInit(); }, { passive: true });
  } else {
    safeInit();
  }

  window.RCF = window.RCF || {};
  window.RCF.state = State;
  window.RCF.log = (...a) => Logger.write(...a);

})();

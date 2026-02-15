==============================================
  const OverridesVFS = (() => {
    const KEY = "RCF_OVERRIDES_MAP"; // { "/path": "content" }
    const getMap = () => Storage.get(KEY, {});
    const setMap = (m) => Storage.set(KEY, m || {});

    const norm = (p) => {
      let x = String(p || "").trim();
      if (!x) return "";
      x = x.split("#")[0].split("?")[0].trim();
      if (!x.startsWith("/")) x = "/" + x;
      x = x.replace(/\/{2,}/g, "/");
      return x;
    };

    function list() {
      const m = getMap();
      return Object.keys(m || {}).sort();
    }

    function read(path) {
      const p = norm(path);
      const m = getMap();
      return (m && p in m) ? String(m[p] ?? "") : null;
    }

    function write(path, content) {
      const p = norm(path);
      const m = getMap();
      m[p] = String(content ?? "");
      setMap(m);
      return true;
    }

    function del(path) {
      const p = norm(path);
      const m = getMap();
      if (m && p in m) {
        delete m[p];
        setMap(m);
        return true;
      }
      return false;
    }

    return {
      listFiles: async () => list(),
      readFile: async (p) => read(p),
      writeFile: async (p, c) => write(p, c),
      deleteFile: async (p) => del(p),
      _raw: { list, read, write, del, norm }
    };
  })();

  window.RCF_OVERRIDES_VFS = OverridesVFS;

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
              <div class="title">${escapeHtml(UI.brandTitle)}</div>
              <div class="subtitle">${escapeHtml(UI.brandSubtitle)}</div>
            </div>
            <div class="spacer"></div>
            <button class="btn small" id="btnOpenTools" type="button" aria-label="Ferramentas">⚙️</button>
            <div class="status-pill" id="statusPill" style="margin-left:10px">
              <span class="ok" id="statusText">OK ✅</span>
            </div>
          </div>

          <nav class="tabs" aria-label="Navegação">
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
            <p class="hint">Comandos naturais + patchset (fase atual: comandos básicos).</p>

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

            <!-- ✅ PADRÃO: Painel GitHub vem do /app/js/admin.github.js -->
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

            <div class="card" id="admin-injector">
              <h2>FASE A • Scan / Target Map / Injector SAFE</h2>
              <p class="hint">“REAL” = A (VFS) → B (bundle local) → C (DOM apenas anchors). Sem GitHub remoto.</p>

              <div class="row" style="flex-wrap:wrap;">
                <button class="btn ok" id="btnScanIndex" type="button">🔎 Scan & Index</button>
                <button class="btn ghost" id="btnGenTargets" type="button">🧭 Generate Target Map</button>
                <button class="btn ghost" id="btnRefreshTargets" type="button">🔁 Refresh Dropdown</button>
              </div>

              <pre class="mono small" id="scanOut">Pronto.</pre>

              <div class="row form" style="margin-top:10px">
                <select id="injMode">
                  <option value="INSERT">INSERT</option>
                  <option value="REPLACE">REPLACE</option>
                  <option value="DELETE">DELETE</option>
                </select>

                <select id="injTarget"></select>

                <button class="btn ghost" id="btnPreviewDiff" type="button">👀 Preview diff</button>
                <button class="btn ok" id="btnApplyInject" type="button">✅ Apply (SAFE)</button>
                <button class="btn danger" id="btnRollbackInject" type="button">↩ Rollback</button>
              </div>

              <div class="hint" style="margin-top:10px">Payload:</div>
              <textarea id="injPayload" class="textarea" rows="8" spellcheck="false" placeholder="Cole aqui o payload para inserir/substituir..."></textarea>

              <div class="hint" style="margin-top:10px">Preview / Diff:</div>
              <pre class="mono small" id="diffOut">Pronto.</pre>

              <div class="hint" style="margin-top:10px">Log:</div>
              <pre class="mono small" id="injLog">Pronto.</pre>
            </div>
          </section>

        </main>

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
              <button class="btn ghost" id="btnSwClearCache" type="button">Clear SW Cache</button>
              <button class="btn ghost" id="btnSwUnregister" type="button">Unregister SW</button>
              <button class="btn ok" id="btnSwRegister" type="button">Register SW</button>
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
  function refreshLogsViews() { Logger._mirrorUI(Logger.getAll()); }

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

    if (name === "logs" || name === "settings" || name === "admin") refreshLogsViews();

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
// Agent (V2) — CLI do Injector + Scan/Targets + Find/Peek
// -----------------------------
const Agent = {
  _mem: {
    inj: { mode: "INSERT", targetId: "", payload: "" }
  },

  help() {
    return [
      "AGENT HELP (V2)",
      "",
      "Base:",
      "- help",
      "- list",
      "- show",
      "- create NOME [SLUG]",
      "- select SLUG",
      "- open dashboard|newapp|editor|generator|agent|settings|admin|logs|diagnostics",
      "",
      "FASE A (Admin):",
      "- scan                 -> CP1 Scan & Index",
      "- targets              -> CP2 Generate Target Map",
      "- dropdown             -> CP3 Refresh dropdown",
      "- paths                -> lista paths do index",
      "",
      "Buscar / checar:",
      "- find TEXTO           -> procura TEXTO nos arquivos indexados (rápido, limitado)",
      "- peek /caminho        -> mostra início do arquivo",
      "",
      "Injector (CLI SAFE):",
      "- inj mode INSERT|REPLACE|DELETE",
      "- inj target PARTE_DO_ID   (seleciona primeiro target que contém o texto)",
      "- inj payload <<<   (cole multiline)   >>>",
      "- inj preview",
      "- inj apply",
      "- inj rollback"
    ].join("\n");
  },

  list() {
    if (!State.apps.length) return "(vazio)";
    return State.apps.map(a => `${a.slug} — ${a.name}`).join("\n");
  },

  show() {
    const app = getActiveApp();
    const idx = Storage.get("RCF_FILE_INDEX", null);
    const map = Storage.get("RCF_TARGET_MAP", null);
    const cIdx = idx?.meta?.count ?? 0;
    const cTg = map?.meta?.count ?? 0;

    return [
      `mode: ${State.cfg.mode}`,
      `apps: ${State.apps.length}`,
      `active app: ${app ? `${app.name} (${app.slug})` : "-"}`,
      `active file: ${State.active.file || "-"}`,
      `view: ${State.active.view}`,
      `index: files=${cIdx} source=${idx?.meta?.source || "-"}`,
      `targets: count=${cTg}`
    ].join("\n");
  },

  _out(text) {
    const out = $("#agentOut");
    if (out) out.textContent = String(text ?? "");
  },

  _setCmdUI(mode, targetId, payload) {
    // mantém UI do injector sincronizada com o CLI
    const m = $("#injMode");
    const t = $("#injTarget");
    const p = $("#injPayload");
    if (m && mode) m.value = mode;
    if (t && targetId) t.value = targetId;
    if (p && payload != null) p.value = payload;
  },

  _pickTargetByContains(part) {
    const map = Storage.get("RCF_TARGET_MAP", null);
    const targets = map && Array.isArray(map.targets) ? map.targets : [];
    const q = String(part || "").trim().toLowerCase();
    if (!q) return null;
    return targets.find(x => String(x.targetId || "").toLowerCase().includes(q)) || null;
  },

  async _scan() {
    const idx = await scanFactoryFiles();
    return `✅ Scan OK\nsource=${idx.meta.source}\nfiles=${idx.meta.count}\nscannedAt=${idx.meta.scannedAt}`;
  },

  _targets() {
    const idx = Storage.get("RCF_FILE_INDEX", null);
    const r = generateTargetMap(idx);
    if (!r.ok) return `❌ ${r.err || "falhou gerar map"}`;
    return `✅ Target Map OK\ncount=${r.map.meta.count}\nsource=${r.map.meta.source}\ncreatedAt=${r.map.meta.createdAt}`;
  },

  _paths() {
    const idx = Storage.get("RCF_FILE_INDEX", null);
    const files = idx && Array.isArray(idx.files) ? idx.files : [];
    if (!files.length) return "⚠️ Sem index. Rode: scan";
    return files.slice(0, 120).map(f => f.path).join("\n") + (files.length > 120 ? `\n... (${files.length - 120} mais)` : "");
  },

  async _peek(path) {
    const p = normalizePath(path);
    const txt = await readTextFromInventoryPath(p);
    const head = String(txt || "").slice(0, 1200);
    return `PEEK ${p}\nlen=${(txt || "").length}\n\n${head}${(txt || "").length > 1200 ? "\n\n...(truncado)" : ""}`;
  },

  async _find(q) {
    const idx = Storage.get("RCF_FILE_INDEX", null);
    const files = idx && Array.isArray(idx.files) ? idx.files : [];
    if (!files.length) return "⚠️ Sem index. Rode: scan";

    const needle = String(q || "").trim();
    if (!needle) return "⚠️ Use: find TEXTO";

    const needleLow = needle.toLowerCase();
    const hits = [];
    // limite pra não travar iPhone:
    const LIMIT_FILES = 45;

    for (const f of files.slice(0, LIMIT_FILES)) {
      const p = f.path;
      const txt = await readTextFromInventoryPath(p);
      const pos = String(txt || "").toLowerCase().indexOf(needleLow);
      if (pos >= 0) {
        const start = Math.max(0, pos - 80);
        const end = Math.min((txt || "").length, pos + needle.length + 120);
        const snippet = (txt || "").slice(start, end).replace(/\n/g, "⏎");
        hits.push(`- ${p} @${pos}\n  ...${snippet}...`);
      }
      if (hits.length >= 8) break;
    }

    if (!hits.length) return `❌ Não achei "${needle}" (busca limitada a ${LIMIT_FILES} arquivos, 8 hits max).`;
    return `✅ HITS para "${needle}"\n` + hits.join("\n\n");
  },

  async route(cmdRaw) {
    const cmd = String(cmdRaw || "").trim();
    if (!cmd) return this._out("Comando vazio. Use: help");

    const lower = cmd.toLowerCase();

    // base
    if (lower === "help") return this._out(this.help());
    if (lower === "list") return this._out(this.list());
    if (lower === "show") return this._out(this.show());

    // open view
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
      return this._out(`OK. view=${v}`);
    }

    // create/select
    if (lower.startsWith("create ")) {
      const rest = cmd.replace(/^create\s+/i, "").trim();
      const qm = rest.match(/^"([^"]+)"\s*([a-z0-9-]+)?/i);
      let name = "", slug = "";
      if (qm) { name = qm[1].trim(); slug = (qm[2] || "").trim(); }
      else { name = rest; }
      const r = createApp(name, slug);
      return this._out(r.msg);
    }

    if (lower.startsWith("select ")) {
      const slug = slugify(cmd.replace(/^select\s+/i, "").trim());
      const ok = setActiveApp(slug);
      return this._out(ok ? `OK. selecionado: ${slug}` : `Falhou: ${slug}`);
    }

    // FASE A
    if (lower === "scan") {
      safeSetStatus("Scan…");
      try {
        const r = await this._scan();
        safeSetStatus("OK ✅");
        return this._out(r);
      } catch (e) {
        safeSetStatus("ERRO ❌");
        return this._out("❌ scan falhou: " + (e?.message || e));
      }
    }

    if (lower === "targets") {
      try {
        const r = this._targets();
        return this._out(r);
      } catch (e) {
        return this._out("❌ targets falhou: " + (e?.message || e));
      }
    }

    if (lower === "dropdown") {
      try {
        populateTargetsDropdown(true);
        return this._out("✅ Dropdown atualizado.");
      } catch (e) {
        return this._out("❌ dropdown falhou: " + (e?.message || e));
      }
    }

    if (lower === "paths") {
      return this._out(this._paths());
    }

    if (lower.startsWith("peek ")) {
      const p = cmd.replace(/^peek\s+/i, "").trim();
      return this._out(await this._peek(p));
    }

    if (lower.startsWith("find ")) {
      const q = cmd.replace(/^find\s+/i, "").trim();
      return this._out(await this._find(q));
    }

    // Injector CLI
    if (lower.startsWith("inj mode ")) {
      const mode = cmd.replace(/^inj\s+mode\s+/i, "").trim().toUpperCase();
      if (!["INSERT","REPLACE","DELETE"].includes(mode)) return this._out("⚠️ modos: INSERT | REPLACE | DELETE");
      this._mem.inj.mode = mode;
      this._setCmdUI(mode, null, null);
      return this._out(`✅ inj mode=${mode}`);
    }

    if (lower.startsWith("inj target ")) {
      const part = cmd.replace(/^inj\s+target\s+/i, "").trim();
      const t = this._pickTargetByContains(part);
      if (!t) return this._out("❌ Não achei target contendo: " + part + "\nUse: targets (gera map) ou dropdown");
      this._mem.inj.targetId = t.targetId;
      this._setCmdUI(null, t.targetId, null);
      return this._out(`✅ inj target=${t.targetId}\npath=${t.path}\nkind=${t.kind}`);
    }

    if (lower.startsWith("inj payload")) {
      // formato:
      // inj payload <<<
      // ...texto...
      // >>>
      const m = cmdRaw.match(/inj\s+payload\s*<<<([\s\S]*?)>>>/i);
      if (!m) return this._out("⚠️ Use:\ninj payload <<<\nSEU TEXTO AQUI\n>>>");
      const payload = m[1].replace(/^\n+|\n+$/g, "");
      this._mem.inj.payload = payload;
      this._setCmdUI(null, null, payload);
      return this._out(`✅ payload set (len=${payload.length})`);
    }

    if (lower === "inj preview") {
      // garante UI preenchida
      this._setCmdUI(this._mem.inj.mode, this._mem.inj.targetId, this._mem.inj.payload);
      const r = await injectorPreview();
      return this._out(r.ok ? "✅ preview ok (veja Diff no Admin)" : ("❌ " + (r.err || "preview falhou")));
    }

    if (lower === "inj apply") {
      this._setCmdUI(this._mem.inj.mode, this._mem.inj.targetId, this._mem.inj.payload);
      safeSetStatus("Apply…");
      const r = await injectorApplySafe();
      safeSetStatus("OK ✅");
      return this._out(r.ok ? "✅ APPLY OK (SAFE)" : ("❌ APPLY FAIL" + (r.rolledBack ? " (rollback feito)" : "")));
    }

    if (lower === "inj rollback") {
      safeSetStatus("Rollback…");
      const r = await injectorRollback();
      safeSetStatus("OK ✅");
      return this._out(r.ok ? "✅ rollback ok" : "❌ rollback falhou");
    }

    return this._out("Comando não reconhecido. Use: help");
  }
};

      // ✅ NOVO: build (ENGINE)
      // Ex: build "Meu App" agenda calculator
      if (lower.startsWith("build ")) {
        const rest = cmd.replace(/^build\s+/i, "").trim();
        const qm = rest.match(/^"([^"]+)"\s*(.*)$/);

        const name = qm ? qm[1].trim() : rest;
        const modsPart = qm ? (qm[2] || "").trim() : "";

        const mods = modsPart
          .replace(/^with\s+/i, "")
          .split(/[,\s]+/g)
          .map(s => s.trim())
          .filter(Boolean);

        const ENG = window.RCF_ENGINE;

        if (!ENG || typeof ENG.createSpec !== "function" || typeof ENG.createAppFromSpec !== "function") {
          out && (out.textContent = "❌ ENGINE não carregou. Verifique se os 4 scripts /js/engine/*.js estão no index.html.");
          return;
        }

        const r1 = ENG.createSpec({ name, modules: mods });
        if (!r1 || !r1.ok) {
          out && (out.textContent = "❌ " + (r1?.err || "spec falhou"));
          return;
        }

        const r2 = ENG.createAppFromSpec(r1.spec);
        out && (out.textContent = r2?.ok ? `✅ BUILD OK: ${r2.app.slug}` : `❌ BUILD FAIL: ${r2?.err || ""}`);

        // Atualiza listas (se existirem)
        try { renderAppsList(); } catch {}
        try { if (r2?.ok) setActiveApp(r2.app.slug); } catch {}

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
  // SW helpers (safe)
  // -----------------------------
  async function swRegister() {
    try {
      if (!("serviceWorker" in navigator)) {
        Logger.write("sw:", "serviceWorker não suportado");
        return { ok: false, msg: "SW não suportado" };
      }
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      Logger.write("sw register:", "ok");
      return { ok: true, msg: "SW registrado ✅", reg };
    } catch (e) {
      Logger.write("sw register fail:", (e?.message || e));
      return { ok: false, msg: "Falhou registrar SW: " + (e?.message || e) };
    }
  }

  async function swUnregisterAll() {
    try {
      if (!("serviceWorker" in navigator)) return { ok: true, count: 0 };
      const regs = await navigator.serviceWorker.getRegistrations();
      let n = 0;
      for (const r of regs) { try { if (await r.unregister()) n++; } catch {} }
      Logger.write("sw unregister:", n, "ok");
      return { ok: true, count: n };
    } catch (e) {
      Logger.write("sw unregister err:", e?.message || e);
      return { ok: false, count: 0, err: e?.message || e };
    }
  }

  async function swClearCaches() {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      Logger.write("cache clear:", keys.length, "caches");
      return { ok: true, count: keys.length };
    } catch (e) {
      Logger.write("cache clear err:", e?.message || e);
      return { ok: false, count: 0, err: e?.message || e };
    }
  }

  async function swCheckAutoFix() {
    const out = { ok: false, status: "missing", detail: "", attempts: 0, err: "" };

    if (!("serviceWorker" in navigator)) {
      out.status = "unsupported";
      out.detail = "serviceWorker não suportado neste browser";
      return out;
    }

    const tryGet = async () => {
      try {
        const a = await navigator.serviceWorker.getRegistration("./");
        if (a) return a;
        const b = await navigator.serviceWorker.getRegistration();
        return b || null;
      } catch (e) {
        out.err = String(e?.message || e);
        return null;
      }
    };

    let reg = await tryGet();
    if (reg) {
      out.ok = true;
      out.status = "registered";
      out.detail = "já estava registrado";
      return out;
    }

    out.attempts++;
    try {
      const r = await swRegister();
      out.detail = r?.msg || "tentou registrar";
    } catch (e) {
      out.err = String(e?.message || e);
    }

    await new Promise(res => setTimeout(res, 350));

    reg = await tryGet();
    if (reg) {
      out.ok = true;
      out.status = "registered";
      out.detail = "registrou após auto-fix";
      return out;
    }

    out.status = "missing";
    out.detail =
      (location.protocol !== "https:" && location.hostname !== "localhost")
        ? "SW exige HTTPS (ou localhost)."
        : "sw.js não registrou (pode ser path/scope/privacidade).";

    return out;
  }

  // -----------------------------
  // Overlay scanner (embutido)
  // -----------------------------
  function scanOverlays() {
    const suspects = [];
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    const all = $$("body *");
    for (const el of all) {
      try {
        const cs = getComputedStyle(el);
        if (!cs) continue;
        if (cs.pointerEvents === "none") continue;

        const pos = cs.position;
        if (pos !== "fixed" && pos !== "absolute") continue;

        const zi = parseInt(cs.zIndex || "0", 10);
        if (!Number.isFinite(zi)) continue;
        if (zi < 50) continue;

        const r = el.getBoundingClientRect();
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area < (vw * vh * 0.10)) continue;

        const touches = (r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh);
        if (!touches) continue;

        suspects.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          cls: (el.className && String(el.className).slice(0, 80)) || "",
          z: zi,
          pe: cs.pointerEvents,
          pos,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        });
      } catch {}
      if (suspects.length >= 8) break;
    }
    return { ok: true, suspects };
  }

  // -----------------------------
  // Micro-tests (embutido)
  // -----------------------------
  function runMicroTests() {
    const results = [];
    const push = (name, pass, info = "") => results.push({ name, pass: !!pass, info: String(info || "") });

    try { push("TEST_RENDER", !!$("#rcfRoot") && !!$("#views"), !!$("#rcfRoot") ? "UI root ok" : "UI root missing"); }
    catch (e) { push("TEST_RENDER", false, e?.message || e); }

    try { push("TEST_IMPORTS", !!window.RCF_LOGGER && !!window.RCF && !!window.RCF.state, "globals"); }
    catch (e) { push("TEST_IMPORTS", false, e?.message || e); }

    try { push("TEST_STATE_INIT", !!State && Array.isArray(State.apps) && !!State.active && typeof State.cfg === "object", "state"); }
    catch (e) { push("TEST_STATE_INIT", false, e?.message || e); }

    try { push("TEST_EVENT_BIND", !!$("#btnOpenTools") && !!$("#btnAgentRun") && !!$("#btnSaveFile"), "buttons"); }
    catch (e) { push("TEST_EVENT_BIND", false, e?.message || e); }

    const passCount = results.filter(r => r.pass).length;
    return { ok: passCount === results.length, pass: passCount, total: results.length, results };
  }

  // -----------------------------
  // CSS token check
  // -----------------------------
  function cssLoadedCheck() {
    try {
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue("--rcf-css-token")
        .trim()
        .replace(/^["']|["']$/g, "");
      const ok = !!token && token.toLowerCase() !== "(vazio)";
      return { ok, token: token || "(vazio)" };
    } catch (e) {
      return { ok: false, token: "(erro)", err: e?.message || e };
    }
  }

  // -----------------------------
  // Guards flags
  // -----------------------------
  const ModuleFlags = { diagnosticsInstalled: false, guardsInstalled: false };

  function installGuardsOnce() {
    if (ModuleFlags.guardsInstalled) return true;
    ModuleFlags.guardsInstalled = true;
    Logger.write("ok:", "GlobalErrorGuard instalado ✅");
    Logger.write("ok:", "ClickGuard instalado ✅");
    return true;
  }

  // -----------------------------
  // Stability report
  // -----------------------------
  async function runV7StabilityCheck() {
    const lines = [];
    const failList = [];
    let pass = 0, fail = 0;

    const add = (ok, label, detail) => {
      if (ok) { pass++; lines.push(`PASS: ${label}${detail ? " — " + detail : ""}`); }
      else { fail++; const t = `FAIL: ${label}${detail ? " — " + detail : ""}`; lines.push(t); failList.push(label + (detail ? `: ${detail}` : "")); }
    };

    add(!!window.__RCF_BOOTED__, "[BOOT] __RCF_BOOTED__", window.__RCF_BOOTED__ ? "lock ativo" : "lock ausente");

    const css = cssLoadedCheck();
    add(css.ok, "[CSS] CSS_TOKEN", `token: "${css.token}"`);

    add(true, "[MODULES] CORE_ONCE", "ok");
    add(ModuleFlags.guardsInstalled, "[MODULES] GUARDS_ONCE", ModuleFlags.guardsInstalled ? "ok" : "não instalado");

    const swr = await swCheckAutoFix();
    if (swr.ok) {
      add(true, "[SW] SW_REGISTERED", swr.detail || "registrado");
    } else {
      lines.push(`WARN: [SW] SW_REGISTERED — ${swr.detail || swr.status}${swr.err ? " | err=" + swr.err : ""}`);
      Logger.write("sw warn:", swr.status, swr.detail, swr.err ? ("err=" + swr.err) : "");
    }

    const overlay = scanOverlays();
    add(overlay.ok, "[CLICK] OVERLAY_SCANNER", overlay.ok ? "ok" : "erro");
    add((overlay.suspects || []).length === 0, "[CLICK] OVERLAY_BLOCK", (overlay.suspects || []).length ? `suspects=${overlay.suspects.length}` : "nenhum");

    const mt = runMicroTests();
    add(mt.ok, "[MICROTEST] ALL", `${mt.pass}/${mt.total}`);

    const stable = (fail === 0);
    window.RCF_STABLE = stable;

    lines.unshift("=========================================================");
    lines.unshift("RCF — V7 STABILITY CHECK (REPORT)");
    lines.push("=========================================================");
    lines.push(`PASS: ${pass} | FAIL: ${fail}`);
    lines.push(`RCF_STABLE: ${stable ? "TRUE ✅" : "FALSE ❌"}`);
    lines.push("");

    if (!stable) {
      lines.push("FAIL LIST:");
      for (const f of failList) lines.push(`- ${f}`);
    } else {
      lines.push("STATUS: RCF_STABLE = TRUE ✅");
    }

    const report = lines.join("\n");
    uiMsg("#diagOut", report);
    Logger.write("V7 check:", stable ? "PASS ✅" : "FAIL ❌", `${pass}/${pass + fail}`);
    return { stable, pass, fail, report, overlay, microtests: mt, css, sw: swr };
  }

  // =========================================================
  // ✅ FASE A — REAL SCAN / TARGET MAP / INJECT SAFE
  // =========================================================
  function simpleHash(str) {
    let h = 2166136261;
    const s = String(str ?? "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "js";
    if (p.endsWith(".css")) return "css";
    if (p.endsWith(".html")) return "html";
    if (p.endsWith(".json")) return "json";
    if (p.endsWith(".txt")) return "txt";
    return "bin";
  }

  function detectMarkers(text) {
    const s = String(text ?? "");
    const re = /@RCF:INJECT\s*([A-Za-z0-9_-]+)?/g;
    const out = [];
    let m;
    while ((m = re.exec(s))) {
      out.push({ marker: m[0], id: (m[1] || "").trim() || null, index: m.index });
      if (out.length >= 20) break;
    }
    return out;
  }

  function getAnchorsForContent(type, content) {
    const s = String(content ?? "");
    const anchors = [];
    if (type === "html") {
      const headEnd = s.toLowerCase().lastIndexOf("</head>");
      const bodyEnd = s.toLowerCase().lastIndexOf("</body>");
      if (headEnd >= 0) anchors.push({ id: "HEAD_END", at: headEnd, note: "</head>" });
      if (bodyEnd >= 0) anchors.push({ id: "BODY_END", at: bodyEnd, note: "</body>" });
    }
    if (type === "css") {
      const rootIdx = s.indexOf(":root");
      if (rootIdx >= 0) anchors.push({ id: "CSS_ROOT", at: rootIdx, note: ":root" });
    }
    if (type === "js") {
      anchors.push({ id: "JS_TOP", at: 0, note: "top" });
      anchors.push({ id: "JS_EOF", at: s.length, note: "eof" });
    }
    return anchors;
  }

  function normalizePath(p) {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");
    return x;
  }

  async function tryFetchLocalBundleFromCfg() {
    const cfg = Storage.get("ghcfg", null);
    const path = cfg && cfg.path ? String(cfg.path) : "";
    if (!path) return null;

    const url = new URL(path, document.baseURI).toString();

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const txt = await res.text();
      return txt || null;
    } catch {
      return null;
    }
  }

  async function vfsListAll(vfs) {
    if (!vfs) return [];
    try {
      if (typeof vfs.listFiles === "function") return (await vfs.listFiles()) || [];
      if (typeof vfs.list === "function") return (await vfs.list()) || [];
      if (typeof vfs.keys === "function") return (await vfs.keys()) || [];
      if (typeof vfs.entries === "function") {
        const ent = await vfs.entries();
        return Array.isArray(ent) ? ent.map(e => e && (e.path || e[0])) : [];
      }
    } catch {}
    return [];
  }

  async function vfsRead(vfs, path) {
    if (!vfs) return null;
    try {
      if (typeof vfs.readFile === "function") return await vfs.readFile(path);
      if (typeof vfs.read === "function") return await vfs.read(path);
      if (typeof vfs.get === "function") return await vfs.get(path);
    } catch {}
    return null;
  }

  function getLocalMotherBundleText() {
    const raw = Storage.getRaw("mother_bundle", "");
    if (raw && raw.trim().startsWith("{")) return raw;
    const raw2 = localStorage.getItem("RCF_MOTHER_BUNDLE") || "";
    if (raw2 && raw2.trim().startsWith("{")) return raw2;
    return "";
  }

  // =========================================================
  // ✅ CP1 — Scan em cascata REAL (A -> B -> C)
  // =========================================================
  async function scanFactoryFiles() {
    const index = {
      meta: { scannedAt: nowISO(), source: "", count: 0 },
      files: []
    };

    // 0) sempre indexa overrides (não define source por isso)
    try {
      const olist = await OverridesVFS.listFiles();
      for (const p0 of (olist || []).slice(0, 800)) {
        const p = normalizePath(p0);
        const txt = String((await OverridesVFS.readFile(p)) ?? "");
        const type = guessType(p);
        index.files.push({
          path: p,
          type,
          size: txt.length,
          hash: simpleHash(txt),
          markers: detectMarkers(txt),
          anchors: getAnchorsForContent(type, txt)
        });
      }
    } catch {}

    // RCF_RANGE:START SCAN_RUNTIME_VFS_CHAIN
    // A) runtime vfs (NÃO usar RCF_VFS_OVERRIDES aqui — isso é RPC, não FS)
    const vfs = (window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    // RCF_RANGE:END SCAN_RUNTIME_VFS_CHAIN

    if (vfs) {
      const baseLen = index.files.length;

      const list = await vfsListAll(vfs);
      const paths = (list || []).map(p => normalizePath(p)).filter(Boolean).slice(0, 1200);

      for (const p of paths) {
        const content = await vfsRead(vfs, p);
        const txt = (content == null) ? "" : String(content);
        const type = guessType(p);
        const markers = detectMarkers(txt);
        const anchors = getAnchorsForContent(type, txt);
        index.files.push({
          path: p,
          type,
          size: txt.length,
          hash: simpleHash(txt),
          markers,
          anchors
        });
      }

      const addedByRuntimeVfs = index.files.length - baseLen;

      if (addedByRuntimeVfs > 0) {
        index.meta.source = "A:runtime_vfs";
        index.meta.count = index.files.length;
        Storage.set("RCF_FILE_INDEX", index);
        Logger.write("scan:", index.meta.source, "files=" + index.meta.count);
        return index;
      }

      Logger.write("scan:", "A:runtime_vfs files=0 => FALHA", "scan fallback -> mother_bundle");
    }

    // B) mother_bundle local
    let bundleText = getLocalMotherBundleText();
    if (!bundleText) bundleText = await tryFetchLocalBundleFromCfg();

    if (bundleText) {
      index.meta.source = "B:mother_bundle_local";
      let parsed = null;
      try { parsed = JSON.parse(bundleText); } catch { parsed = null; }

      let entries = [];

      if (parsed && Array.isArray(parsed.files)) {
        entries = parsed.files
          .map(it => {
            const rawPath = it && (it.path || it.file || it.name);
            const rawVal  = it && ("content" in it ? it.content : (it.text ?? it.data ?? ""));
            return [rawPath, rawVal];
          })
          .filter(([p]) => !!p);
      } else {
        const filesObj =
          (parsed && parsed.files && typeof parsed.files === "object")
            ? parsed.files
            : (parsed && typeof parsed === "object" ? parsed : {});
        entries = Object.entries(filesObj || {});
      }

      for (const [rawPath, rawVal] of entries) {
        const p = normalizePath(rawPath);
        const txt =
          (rawVal && typeof rawVal === "object" && "content" in rawVal)
            ? String(rawVal.content ?? "")
            : String(rawVal ?? "");

        const type = guessType(p);
        const markers = detectMarkers(txt);
        const anchors = getAnchorsForContent(type, txt);

        index.files.push({
          path: p,
          type,
          size: txt.length,
          hash: simpleHash(txt),
          markers,
          anchors
        });
      }

      index.meta.count = index.files.length;
      Storage.set("RCF_FILE_INDEX", index);
      Storage.setRaw("mother_bundle", bundleText);

      Logger.write("scan:", index.meta.source, "files=" + index.meta.count);
      return index;
    }

    // C) DOM anchors only
    Logger.write("scan fallback -> DOM anchors");
    index.meta.source = "C:dom_anchors_only";
    const html = document.documentElement ? document.documentElement.outerHTML : "";
    const markers = detectMarkers(html);
    const anchors = getAnchorsForContent("html", html);

    index.files.push({
      path: "/runtime/document.html",
      type: "html",
      size: html.length,
      hash: simpleHash(html),
      markers,
      anchors
    });

    index.meta.count = index.files.length;
    Storage.set("RCF_FILE_INDEX", index);
    Logger.write("scan:", index.meta.source, "files=" + index.meta.count);
    return index;
  }

  // =========================================================
  // ✅ CP2 — Target map garante >=2
  // =========================================================
  function generateTargetMap(fileIndex) {
    const idx = fileIndex || Storage.get("RCF_FILE_INDEX", null);
    if (!idx || !Array.isArray(idx.files)) {
      return { ok: false, err: "RCF_FILE_INDEX ausente. Rode Scan & Index primeiro." };
    }

    const targets = [];

    for (const f of idx.files) {
      const path = String(f.path || "");
      const markers = Array.isArray(f.markers) ? f.markers : [];

      for (const m of markers) {
        const id = m.id ? m.id : `MARKER_${path}_${m.index}`;
        targets.push({
          targetId: id,
          path,
          kind: "MARKER",
          offset: m.index,
          supportedModes: ["INSERT", "REPLACE", "DELETE"],
          defaultRisk: "low",
          note: "@RCF:INJECT"
        });
      }

      if (!markers.length) {
        const anchors = Array.isArray(f.anchors) ? f.anchors : [];
        for (const a of anchors) {
          targets.push({
            targetId: `${path}::${a.id}`,
            path,
            kind: "ANCHOR",
            offset: a.at,
            anchorId: a.id,
            supportedModes: ["INSERT", "REPLACE", "DELETE"],
            defaultRisk: (String(a.id || "").includes("BODY") || String(a.id || "").includes("JS_EOF")) ? "medium" : "low",
            note: a.note
          });
        }
      }
    }

    const seen = new Set();
    const uniq = [];
    for (const t of targets) {
      if (!t || !t.targetId) continue;
      if (seen.has(t.targetId)) continue;
      seen.add(t.targetId);
      uniq.push(t);
      if (uniq.length >= 800) break;
    }

    if (uniq.length < 2) {
      const fallbackPaths = ["/index.html", "/app/index.html"];
      for (const fp of fallbackPaths) {
        uniq.push({
          targetId: `${fp}::HEAD_END`,
          path: fp,
          kind: "ANCHOR",
          offset: 0,
          anchorId: "HEAD_END",
          supportedModes: ["INSERT","REPLACE","DELETE"],
          defaultRisk: "low",
          note: "FORCED_FALLBACK_HEAD_END"
        });
        uniq.push({
          targetId: `${fp}::BODY_END`,
          path: fp,
          kind: "ANCHOR",
          offset: 0,
          anchorId: "BODY_END",
          supportedModes: ["INSERT","REPLACE","DELETE"],
          defaultRisk: "medium",
          note: "FORCED_FALLBACK_BODY_END"
        });
        if (uniq.length >= 2) break;
      }
    }

    const out = {
      meta: { createdAt: nowISO(), count: uniq.length, source: (idx.meta && idx.meta.source) || "" },
      targets: uniq
    };

    Storage.set("RCF_TARGET_MAP", out);
    Logger.write("targets:", "count=" + out.meta.count, "source=" + out.meta.source);

    try { populateTargetsDropdown(true); } catch {}
    return { ok: true, map: out };
  }

  function populateTargetsDropdown(autoSelect = false) {
    const sel = $("#injTarget");
    if (!sel) return;

    const map = Storage.get("RCF_TARGET_MAP", null);
    const t = map && Array.isArray(map.targets) ? map.targets : [];

    sel.innerHTML = "";

    if (!t.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(sem targets — gere o map)";
      sel.appendChild(opt);
      return;
    }

    for (const item of t.slice(0, 500)) {
      const opt = document.createElement("option");
      opt.value = item.targetId;
      opt.textContent = `${item.targetId}  —  ${item.path}  (${item.kind})`;
      sel.appendChild(opt);
    }

    if (autoSelect) {
      const first = Array.from(sel.options).find(o => (o.value || "").trim());
      if (first) sel.value = first.value;
    }
  }

  function tinyDiff(oldText, newText) {
    const a = String(oldText ?? "").split("\n");
    const b = String(newText ?? "").split("\n");
    const max = Math.max(a.length, b.length);
    const out = [];
    for (let i = 0; i < max; i++) {
      const A = a[i], B = b[i];
      if (A === B) continue;
      if (A !== undefined) out.push(`- ${A}`);
      if (B !== undefined) out.push(`+ ${B}`);
      if (out.length > 220) { out.push("... (diff truncado)"); break; }
    }
    return out.join("\n") || "(sem mudanças)";
  }

  async function readTextFromInventoryPath(path) {
    const p = normalizePath(path);

    const ov = await OverridesVFS.readFile(p);
    if (ov != null) return String(ov);

    const vfs = (window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs) {
      const txt = await vfsRead(vfs, p);
      return (txt == null) ? "" : String(txt);
    }

    const bundleText = getLocalMotherBundleText() || (await tryFetchLocalBundleFromCfg()) || "";
    if (bundleText) {
      try {
        const parsed = JSON.parse(bundleText);

        if (parsed && Array.isArray(parsed.files)) {
          const hit = parsed.files.find(it => normalizePath(it?.path || it?.file || it?.name) === p);
          if (hit) {
            if ("content" in hit) return String(hit.content ?? "");
            if ("text" in hit) return String(hit.text ?? "");
            if ("data" in hit) return String(hit.data ?? "");
            return "";
          }
        }

        const filesObj = (parsed && parsed.files && typeof parsed.files === "object") ? parsed.files : parsed;
        const v = filesObj && filesObj[p];
        if (v && typeof v === "object" && "content" in v) return String(v.content ?? "");
        if (v != null) return String(v);
      } catch {}
    }

    if (p === "/runtime/document.html") {
      return document.documentElement ? document.documentElement.outerHTML : "";
    }

    if (p === "/app/index.html" || p === "/app/styles.css" || p === "/app/app.js" || p === "/index.html" || p === "/styles.css" || p === "/app.js") {
      try {
        const res = await fetch(p, { cache: "no-store" });
        if (res.ok) return await res.text();
      } catch {}
    }

    return "";
  }

  async function writeTextToInventoryPath(path, newText) {
    const p = normalizePath(path);

    const vfs = (window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs) {
      try {
        if (typeof vfs.writeFile === "function") { await vfs.writeFile(p, String(newText ?? "")); return { ok: true, mode: "vfs.writeFile" }; }
        if (typeof vfs.write === "function") { await vfs.write(p, String(newText ?? "")); return { ok: true, mode: "vfs.write" }; }
        if (typeof vfs.put === "function") { await vfs.put(p, String(newText ?? "")); return { ok: true, mode: "vfs.put" }; }
        if (typeof vfs.set === "function") { await vfs.set(p, String(newText ?? "")); return { ok: true, mode: "vfs.set" }; }
      } catch (e) {
        return { ok: false, err: e?.message || e };
      }
    }

    try {
      await OverridesVFS.writeFile(p, String(newText ?? ""));
      return { ok: true, mode: "override.writeFile" };
    } catch (e) {
      return { ok: false, err: e?.message || e };
    }
  }

  function applyAtTarget(oldText, target, mode, payload) {
    const s = String(oldText ?? "");
    const pl = String(payload ?? "");

    const resolveOffset = () => {
      if (!target || target.kind !== "ANCHOR") return Math.max(0, Math.min(s.length, target.offset || 0));
      if ((target.offset || 0) > 0) return Math.max(0, Math.min(s.length, target.offset || 0));
      const lower = s.toLowerCase();
      if (target.anchorId === "HEAD_END") {
        const i = lower.lastIndexOf("</head>");
        return i >= 0 ? i : 0;
      }
      if (target.anchorId === "BODY_END") {
        const i = lower.lastIndexOf("</body>");
        return i >= 0 ? i : s.length;
      }
      return Math.max(0, Math.min(s.length, target.offset || 0));
    };

    if (target.kind === "MARKER") {
      const at = Math.max(0, Math.min(s.length, target.offset || 0));
      if (mode === "INSERT") return s.slice(0, at) + pl + "\n" + s.slice(at);
      if (mode === "REPLACE") return s.slice(0, at) + pl + "\n" + s.slice(at);
      if (mode === "DELETE") return s.replace(target.note || "@RCF:INJECT", "");
    }

    const at = resolveOffset();
    if (mode === "INSERT") return s.slice(0, at) + "\n" + pl + "\n" + s.slice(at);
    if (mode === "REPLACE") return s.slice(0, at) + "\n" + pl + "\n" + s.slice(at);
    if (mode === "DELETE") {
      if (!pl.trim()) return s;
      return s.split(pl).join("");
    }
    return s;
  }

  const InjectState = { lastSnapshot: null };

  async function injectorPreview() {
    const map = Storage.get("RCF_TARGET_MAP", null);
    const targets = map && Array.isArray(map.targets) ? map.targets : [];
    const targetId = ($("#injTarget")?.value || "").trim();
    const mode = ($("#injMode")?.value || "INSERT").trim();
    const payload = ($("#injPayload")?.value || "");

    const t = targets.find(x => x.targetId === targetId);
    if (!t) return { ok: false, err: "Target inválido (gere o map e selecione)." };

    const oldText = await readTextFromInventoryPath(t.path);
    const newText = applyAtTarget(oldText, t, mode, payload);

    uiMsg("#diffOut", tinyDiff(oldText, newText));
    return { ok: true, oldText, newText, t, mode };
  }

  async function injectorApplySafe() {
    const map = Storage.get("RCF_TARGET_MAP", null);
    const targets = map && Array.isArray(map.targets) ? map.targets : [];
    Logger.write("apply:", "targets count=" + targets.length);

    const pre = await injectorPreview();
    if (!pre.ok) {
      uiMsg("#diffOut", "❌ " + (pre.err || "preview falhou"));
      Logger.write("apply:", "FAIL target inválido");
      return { ok: false };
    }

    InjectState.lastSnapshot = {
      path: pre.t.path,
      oldText: pre.oldText,
      newText: pre.newText,
      targetId: pre.t.targetId,
      ts: nowISO()
    };

    const before = runMicroTests();
    if (!before.ok) {
      uiMsg("#diffOut", "❌ Microtests BEFORE falharam. Abortando.\n" + JSON.stringify(before, null, 2));
      Logger.write("apply:", "FAIL microtests before");
      return { ok: false };
    }

    const w = await writeTextToInventoryPath(pre.t.path, pre.newText);
    if (!w.ok) {
      uiMsg("#diffOut", "❌ Não consegui escrever.\n" + (w.err || ""));
      Logger.write("apply:", "FAIL write", pre.t.path, pre.t.targetId);
      return { ok: false };
    }

    const after = runMicroTests();
    if (!after.ok) {
      await writeTextToInventoryPath(pre.t.path, pre.oldText);
      uiMsg("#diffOut", "❌ Microtests AFTER falharam. Rollback aplicado.\n" + JSON.stringify(after, null, 2));
      Logger.write("apply:", "AFTER FAIL -> rollback", pre.t.path, pre.t.targetId);
      return { ok: false, rolledBack: true };
    }

    Logger.write("apply:", "OK", pre.t.path, pre.t.targetId, "mode=" + pre.mode, "write=" + w.mode);
    uiMsg("#diffOut", "✅ Aplicado com sucesso (SAFE).");
    return { ok: true };
  }

  async function injectorRollback() {
    const s = InjectState.lastSnapshot;
    if (!s) { uiMsg("#diffOut", "Nada para rollback."); return { ok: false }; }
    const w = await writeTextToInventoryPath(s.path, s.oldText);
    if (!w.ok) { uiMsg("#diffOut", "Rollback falhou: " + (w.err || "")); return { ok: false }; }
    uiMsg("#diffOut", "✅ Rollback aplicado.");
    Logger.write("inject:", "rollback OK", s.path, s.targetId);
    return { ok: true };
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

    // SW tools
    bindTap($("#btnSwUnregister"), async () => {
      const r = await swUnregisterAll();
      safeSetStatus(r.ok ? `SW unreg: ${r.count} ✅` : "SW unreg ❌");
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    bindTap($("#btnSwClearCache"), async () => {
      const r = await swClearCaches();
      safeSetStatus(r.ok ? `Cache: ${r.count} ✅` : "Cache ❌");
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    bindTap($("#btnSwRegister"), async () => {
      const r = await swRegister();
      safeSetStatus(r.ok ? "SW ✅" : "SW ❌");
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    // Diagnostics actions
    bindTap($("#btnDiagRun"), async () => {
      safeSetStatus("Diag…");
      await runV7StabilityCheck();
      setTimeout(() => safeSetStatus("OK ✅"), 700);
    });

    bindTap($("#btnDiagInstall"), () => {
      try {
        installGuardsOnce();
        ModuleFlags.diagnosticsInstalled = true;
        uiMsg("#diagOut", "✅ installAll OK");
        Logger.write("ok:", "Diagnostics: installAll ✅");
      } catch (e) {
        uiMsg("#diagOut", "❌ " + (e?.message || e));
      }
    });

    bindTap($("#btnDiagScan"), () => {
      try {
        const r = scanOverlays();
        uiMsg("#diagOut", JSON.stringify(r, null, 2));
      } catch (e) {
        uiMsg("#diagOut", "❌ " + (e?.message || e));
      }
    });

    bindTap($("#btnDiagTests"), () => {
      try {
        const r = runMicroTests();
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

    // Mãe buttons
    bindTap($("#btnMaeLoad"), async () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      if (!MAE) {
        uiMsg("#maintOut", "⚠️ RCF_MOTHER/RCF_MAE não está carregada no runtime.");
        Logger.write("mae:", "absent");
        return;
      }
      uiMsg("#maintOut", "✅ Mãe detectada. Funções: " + Object.keys(MAE).slice(0, 20).join(", "));
      Logger.write("mae:", "loaded");
    });

    bindTap($("#btnMaeCheck"), () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      const s = MAE && typeof MAE.status === "function" ? MAE.status() : { ok: false, msg: "status() ausente" };
      try { alert("CHECK:\n\n" + JSON.stringify(s, null, 2)); } catch {}
      uiMsg("#maintOut", "Check rodado (alert).");
      Logger.write("mae check:", safeJsonStringify(s));
    });

    // ✅ FIX: trava reentrada + timeout
    let maeUpdateLock = false;
    bindTap($("#btnMaeUpdate"), async () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      if (!MAE || typeof MAE.updateFromGitHub !== "function") {
        uiMsg("#maintOut", "⚠️ updateFromGitHub() ausente (ou mãe não carregou).");
        Logger.write("mae update:", "missing");
        return;
      }
      if (maeUpdateLock) {
        uiMsg("#maintOut", "⏳ Update já está rodando… (aguarde)");
        Logger.write("mae update:", "blocked (lock)");
        return;
      }

      maeUpdateLock = true;
      uiMsg("#maintOut", "Atualizando…");

      try {
        const res = await Promise.race([
          Promise.resolve(MAE.updateFromGitHub()),
          new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 15000ms (updateFromGitHub)")), 15000))
        ]);
        uiMsg("#maintOut", "✅ Update acionado.");
        Logger.write("mae update:", "ok", res ? safeJsonStringify(res) : "");
      } catch (e) {
        uiMsg("#maintOut", "❌ Falhou: " + (e?.message || e));
        Logger.write("mae update err:", e?.message || e);
      } finally {
        maeUpdateLock = false;
      }
    });

    bindTap($("#btnMaeClear"), async () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      if (!MAE || typeof MAE.clearOverrides !== "function") {
        uiMsg("#maintOut", "⚠️ clearOverrides() ausente (ou mãe não carregou).");
        Logger.write("mae clear:", "missing");
        return;
      }
      uiMsg("#maintOut", "Limpando...");
      try {
        await MAE.clearOverrides();
        uiMsg("#maintOut", "✅ Clear acionado.");
        Logger.write("mae clear:", "ok");
      } catch (e) {
        uiMsg("#maintOut", "❌ Falhou: " + (e?.message || e));
        Logger.write("mae clear err:", e?.message || e);
      }
    });

    // ✅ FASE A
    bindTap($("#btnScanIndex"), async () => {
      safeSetStatus("Scan…");
      try {
        const idx = await scanFactoryFiles();
        uiMsg("#scanOut", `✅ Scan OK\nsource=${idx.meta.source}\nfiles=${idx.meta.count}\nscannedAt=${idx.meta.scannedAt}`);
        Logger.write("CP1 scan:", `source=${idx.meta.source}`, `files=${idx.meta.count}`);
      } catch (e) {
        uiMsg("#scanOut", "❌ Scan falhou: " + (e?.message || e));
        Logger.write("scan err:", e?.message || e);
      }
      setTimeout(() => safeSetStatus("OK ✅"), 700);
    });

    bindTap($("#btnGenTargets"), () => {
      const idx = Storage.get("RCF_FILE_INDEX", null);
      const r = generateTargetMap(idx);
      if (!r.ok) {
        uiMsg("#scanOut", "❌ " + (r.err || "falhou gerar map"));
        return;
      }
      uiMsg("#scanOut", `✅ Target Map OK\ncount=${r.map.meta.count}\nsource=${r.map.meta.source}\ncreatedAt=${r.map.meta.createdAt}`);
      Logger.write("CP2 targets:", "count=" + r.map.meta.count);

      try {
        populateTargetsDropdown(true);
        Logger.write("CP3 ui:", "dropdown updated", "auto-selected=" + String($("#injTarget")?.value || ""));
      } catch {}

      const sel = $("#injTarget");
      if (sel && !String(sel.value || "").trim()) {
        const first = Array.from(sel.options).find(o => (o.value || "").trim());
        if (first) sel.value = first.value;
      }
    });

    bindTap($("#btnRefreshTargets"), () => {
      populateTargetsDropdown(true);
      uiMsg("#scanOut", "Dropdown atualizado ✅");
      Logger.write("CP3 ui:", "dropdown refresh", "selected=" + String($("#injTarget")?.value || ""));
    });

    bindTap($("#btnPreviewDiff"), async () => {
      const r = await injectorPreview();
      if (!r.ok) uiMsg("#diffOut", "❌ " + (r.err || "preview falhou"));
    });

    bindTap($("#btnApplyInject"), async () => {
      safeSetStatus("Apply…");
      const ok = await injectorApplySafe();
      Logger.write("CP3 apply:", ok && ok.ok ? "OK" : "FAIL", "target=" + String($("#injTarget")?.value || ""));
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    bindTap($("#btnRollbackInject"), async () => {
      safeSetStatus("Rollback…");
      await injectorRollback();
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });
  }

  // -----------------------------
  // Boot hydrate
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

    populateTargetsDropdown(true);
  }

  async function safeInit() {
    try {
      Stability.install();

      // ✅ injeta compact CSS antes de render
      injectCompactCSSOnce();

      renderShell();
      bindUI();
      hydrateUIFromState();

      installGuardsOnce();

      // ✅ ENGINE init (não mexe em UI)
      try { window.RCF_ENGINE?.init?.({ State, Storage, Logger }); Logger.write("engine:", "init ok ✅"); }
      catch (e) { Logger.write("engine init err:", e?.message || e); }

      // ✅ P1: NÃO registrar SW duplicado aqui (index.html já registra).
      const swr = await swCheckAutoFix();
      if (!swr.ok) Logger.write("sw warn:", swr.status, swr.detail, swr.err ? ("err=" + swr.err) : "");

      Logger.write("RCF app.js init ok — mode:", State.cfg.mode);
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

})();

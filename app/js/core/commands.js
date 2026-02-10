/* =========================================================
  RControl Factory — core/commands.js (FULL)
  Replit-like Agent commands + Safe/Auto + Write Mode
  iOS-safe (no weird overlays)
========================================================= */

(function () {
  "use strict";

  // ---------- LocalStorage keys (compat with v3 if existir) ----------
  const LS = {
    apps: "rcf_apps_v3",
    active: "rcf_active_app_id_v3",
    settings: "rcf_settings_v3",
    pin: "rcf_admin_pin_v1",
  };

  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];

  // ---------- Tiny logger ----------
  const LOGGER = (function () {
    const max = 250;
    const logs = [];
    function push(level, msg) {
      const time = new Date().toISOString().slice(11, 19);
      logs.push(`[${time}] ${String(level || "LOG").toUpperCase()} ${String(msg || "")}`);
      while (logs.length > max) logs.shift();
      try {
        // se existir algum painel externo
        const el = document.getElementById("rcf-debug-body");
        if (el) el.textContent = logs.join("\n");
      } catch {}
    }
    return {
      push,
      clear() { logs.length = 0; push("log", "logs limpos"); },
      dump() { return logs.join("\n"); },
      list() { return logs.slice(); }
    };
  })();

  // expõe logger (se seu app.js usar)
  window.RCF_LOGGER = window.RCF_LOGGER || LOGGER;

  // ---------- Patch queue (safe mode) ----------
  const PATCHSET = (function () {
    let pending = [];
    function add(patch) {
      pending.push(patch);
      LOGGER.push("log", `PATCH queued: ${patch?.type || "UNKNOWN"}`);
      renderPendingCount();
    }
    function clear() {
      pending = [];
      renderPendingCount();
    }
    function count() { return pending.length; }

    function renderPendingCount() {
      const el = document.getElementById("pendingCount");
      if (el) el.textContent = String(pending.length);
    }

    function applyAll() {
      const list = pending.slice();
      pending = [];
      renderPendingCount();

      let report = [];
      for (const p of list) {
        try {
          const r = applyOne(p);
          report.push(`✅ ${p.type}: ${r || "OK"}`);
        } catch (e) {
          report.push(`❌ ${p.type}: ${e?.message || e}`);
        }
      }
      return report.join("\n");
    }

    function applyOne(p) {
      if (!p || !p.type) throw new Error("Patch inválido.");

      if (p.type === "APP_CREATE") {
        createApp(p.payload?.name, p.payload?.id, p.payload?.template || "pwa-base");
        return `criado ${p.payload?.id}`;
      }

      if (p.type === "APP_SELECT") {
        selectApp(p.payload?.id);
        return `selecionado ${p.payload?.id}`;
      }

      if (p.type === "FILE_WRITE") {
        const { appId, file, content } = p.payload || {};
        writeFile(appId, file, content);
        return `write ${appId}/${file}`;
      }

      if (p.type === "FILE_SET_CURRENT") {
        const { file } = p.payload || {};
        setCurrentFile(file);
        return `file atual ${file}`;
      }

      throw new Error("Patch desconhecido: " + p.type);
    }

    return { add, clear, count, applyAll };
  })();

  window.RCF_PATCHSET = window.RCF_PATCHSET || PATCHSET;

  // ---------- Storage ----------
  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function loadApps() {
    const raw = localStorage.getItem(LS.apps);
    return raw ? safeJsonParse(raw, []) : [];
  }
  function saveApps(apps) {
    localStorage.setItem(LS.apps, JSON.stringify(apps || []));
  }
  function getActiveId() {
    return localStorage.getItem(LS.active) || "";
  }
  function setActiveId(id) {
    localStorage.setItem(LS.active, String(id || ""));
  }

  function slugify(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function ensureAppExists(appId) {
    const apps = loadApps();
    const app = apps.find(a => a && a.id === appId);
    if (!app) throw new Error("App não existe: " + appId);
    return app;
  }

  // ---------- Templates ----------
  function templateFiles(name, id) {
    const index = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="theme-color" content="#0b1220"/>
  <title>${escapeHtml(name)}</title>
  <link rel="manifest" href="manifest.json"/>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body>
  <header style="padding:14px;border-bottom:1px solid rgba(0,0,0,.12)">
    <h1 style="margin:0;font-family:system-ui">${escapeHtml(name)}</h1>
    <div style="opacity:.7;font-family:system-ui;font-size:12px">ID: ${escapeHtml(id)}</div>
  </header>

  <main style="padding:14px;font-family:system-ui">
    <div style="padding:14px;border:1px solid rgba(0,0,0,.12);border-radius:14px">
      <b>App rodando ✅</b>
      <p>Edite <code>app.js</code> e <code>styles.css</code>.</p>
      <button id="btn">Clique</button>
      <div id="out" style="margin-top:10px;padding:10px;border:1px dashed rgba(0,0,0,.25);border-radius:12px"></div>
    </div>
  </main>

  <script src="app.js"></script>
  <script>
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
    }
  </script>
</body>
</html>`;

    const js = `// ${name} — ${id}
const btn = document.getElementById("btn");
const out = document.getElementById("out");
btn?.addEventListener("click", ()=>{
  out.textContent = "Funcionando! " + new Date().toLocaleString();
});`;

    const css = `:root{--bg:#0b1220;--text:#eaf1ff}
body{margin:0;background:var(--bg);color:var(--text)}`;

    const manifest = `{
  "name": "${name}",
  "short_name": "${name}",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#0b1220",
  "theme_color": "#0b1220",
  "icons": []
}`;

    const sw = `const CACHE="${id}-v1";
const ASSETS=["./","./index.html","./styles.css","./app.js","./manifest.json"];
self.addEventListener("install",(e)=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(ASSETS);self.skipWaiting();})()));
self.addEventListener("activate",(e)=>e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null));self.clients.claim();})()));
self.addEventListener("fetch",(e)=>e.respondWith((async()=>{const cached=await caches.match(e.request);if(cached) return cached;try{return await fetch(e.request);}catch{return caches.match("./index.html");}})()));`;

    return {
      "index.html": index,
      "app.js": js,
      "styles.css": css,
      "manifest.json": manifest,
      "sw.js": sw
    };
  }

  // ---------- App operations ----------
  function createApp(name, idMaybe, template) {
    const apps = loadApps();

    const cleanName = String(name || "").trim();
    if (cleanName.length < 2) throw new Error("Nome inválido.");

    const id = slugify(idMaybe || cleanName);
    if (!id || id.length < 2) throw new Error("ID inválido.");

    if (apps.some(a => a && a.id === id)) throw new Error("Já existe app com esse id: " + id);

    const files = templateFiles(cleanName, id);

    const app = {
      name: cleanName,
      id,
      template: template || "pwa-base",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files,
      baseFiles: { ...files }
    };

    apps.unshift(app);
    saveApps(apps);
    setActiveId(id);

    LOGGER.push("log", `App criado: ${cleanName} (${id})`);
    return app;
  }

  function selectApp(id) {
    const appId = String(id || "").trim();
    ensureAppExists(appId);
    setActiveId(appId);
    LOGGER.push("log", "App ativo: " + appId);
    return appId;
  }

  function listApps() {
    const apps = loadApps();
    if (!apps.length) return "(nenhum app ainda)";
    const active = getActiveId();
    return apps
      .map(a => `${a.id === active ? "👉" : "  "} ${a.name} (${a.id})`)
      .join("\n");
  }

  function getCurrentFile(ctx) {
    // tenta usar ctx (se seu app.js tiver)
    const file = ctx?.currentFile;
    if (file && FILE_ORDER.includes(file)) return file;

    // fallback: tenta label do editor
    const label = document.getElementById("currentFileLabel");
    const fromLabel = label ? String(label.textContent || "").trim() : "";
    if (FILE_ORDER.includes(fromLabel)) return fromLabel;

    // default
    return "index.html";
  }

  function setCurrentFile(file, ctx) {
    const f = String(file || "").trim();
    if (!FILE_ORDER.includes(f)) throw new Error("Arquivo inválido. Use: " + FILE_ORDER.join(", "));
    if (ctx) ctx.currentFile = f;
    LOGGER.push("log", "Arquivo atual: " + f);
    return f;
  }

  function writeFile(appId, file, content) {
    const apps = loadApps();
    const app = apps.find(a => a && a.id === appId);
    if (!app) throw new Error("App não encontrado: " + appId);

    const f = String(file || "").trim();
    if (!f) throw new Error("Arquivo vazio.");
    if (!app.files) app.files = {};
    app.files[f] = String(content ?? "");
    app.updatedAt = Date.now();

    saveApps(apps);
    LOGGER.push("log", `write: ${appId}/${f} (${String(content ?? "").length} chars)`);
    return true;
  }

  function showFile(appId, file) {
    const app = ensureAppExists(appId);
    const f = String(file || "").trim();
    const text = app.files?.[f];
    if (typeof text !== "string") throw new Error("Arquivo não existe no app: " + f);
    return text;
  }

  // ---------- Command parsing ----------
  function normalize(s) {
    return String(s || "").trim();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function helpText() {
    return [
      "RCF Agent — comandos:",
      "",
      "help",
      "status",
      "list",
      "create <Nome do App>    (id auto por slug)",
      "create <Nome> | <id>    (id manual)",
      "select <id>",
      "file <nome-do-arquivo>  (index.html, app.js, styles.css, manifest.json, sw.js)",
      "show [arquivo]          (mostra conteúdo do arquivo do app ativo)",
      "write [arquivo]         (entra em WRITE MODE: cole texto e finalize com /end)",
      "mode auto on/off        (auto aplica comandos seguros)",
      "mode safe on/off        (safe = vira patch pendente)",
      "apply                   (aplica patches pendentes)",
      "clear patches",
      "",
      "Atalho: se você digitar só um ID existente, ele faz auto-select.",
      ""
    ].join("\n");
  }

  // Write mode state (persistente enquanto a página estiver aberta)
  const WRITE = { on: false, targetFile: "", buffer: "" };

  function handleWriteMode(line, ctx) {
    // se usuário enviar /end, fecha
    if (line === "/end") {
      const appId = getActiveId();
      if (!appId) return "Sem app ativo. Use: create / select";

      const file = WRITE.targetFile || getCurrentFile(ctx);

      const patch = {
        type: "FILE_WRITE",
        payload: { appId, file, content: WRITE.buffer }
      };

      WRITE.on = false;
      WRITE.targetFile = "";
      const size = WRITE.buffer.length;
      WRITE.buffer = "";

      if (ctx?.autoMode && !ctx?.safeMode) {
        PATCHSET.clear();
        PATCHSET.add(patch);
        const rep = PATCHSET.applyAll();
        return `WRITE aplicado ✅ (${size} chars) em ${appId}/${file}\n\n${rep}`;
      }

      if (ctx?.autoMode && ctx?.safeMode) {
        PATCHSET.add(patch);
        return `WRITE pendente (SAFE) 🟡 (${size} chars) em ${appId}/${file}\nUse: apply`;
      }

      // default safe behavior
      PATCHSET.add(patch);
      return `WRITE pendente 🟡 (${size} chars) em ${appId}/${file}\nUse: apply`;
    }

    // acumula (NÃO TRUNCA)
    WRITE.buffer += (WRITE.buffer ? "\n" : "") + line;
    return "(write mode…) continue colando… finalize com /end";
  }

  function parseCreateArgs(rest) {
    // "Nome | id"
    const parts = rest.split("|").map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return { name: parts[0], id: "" };
    return { name: parts[0], id: parts[1] };
  }

  function handle(input, ctx) {
    const raw = normalize(input);

    if (!raw) return "Digite um comando. Ex: help";

    // se está em write mode, tudo vira buffer até /end
    if (WRITE.on) {
      return handleWriteMode(raw, ctx);
    }

    // atalhos: se digitar um id existente -> select
    const apps = loadApps();
    const maybeId = slugify(raw);
    if (maybeId && apps.some(a => a && a.id === maybeId)) {
      const patch = { type: "APP_SELECT", payload: { id: maybeId } };
      if (ctx?.autoMode && !ctx?.safeMode) {
        PATCHSET.clear();
        PATCHSET.add(patch);
        return PATCHSET.applyAll();
      }
      PATCHSET.add(patch);
      return `Select pendente 🟡 (${maybeId})\nUse: apply`;
    }

    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = raw.slice(parts[0].length).trim();

    // -------- basic
    if (cmd === "help" || cmd === "?") return helpText();

    if (cmd === "status") {
      const active = getActiveId();
      return [
        `apps: ${apps.length}`,
        `active: ${active || "(nenhum)"}`,
        `auto: ${ctx?.autoMode ? "ON" : "OFF"}`,
        `safe: ${ctx?.safeMode ? "ON" : "OFF"}`,
        `patches: ${PATCHSET.count()}`
      ].join("\n");
    }

    if (cmd === "list") return listApps();

    // -------- modes
    if (cmd === "mode") {
      const a = (parts[1] || "").toLowerCase();
      const b = (parts[2] || "").toLowerCase();
      const on = (b === "on" || b === "true" || b === "1");

      if (!a) return "Use: mode auto on/off | mode safe on/off";

      if (a === "auto") {
        if (ctx) ctx.autoMode = on;
        return "auto mode: " + (on ? "ON ✅" : "OFF");
      }
      if (a === "safe") {
        if (ctx) ctx.safeMode = on;
        return "safe mode: " + (on ? "ON ✅ (patch pendente)" : "OFF (aplica direto se auto ON)");
      }
      return "Modo inválido. Use: auto | safe";
    }

    // -------- apply/clear
    if (cmd === "apply") {
      if (!PATCHSET.count()) return "(sem patches)";
      const rep = PATCHSET.applyAll();
      return rep || "OK";
    }

    if (cmd === "clear" && (parts[1] || "").toLowerCase() === "patches") {
      PATCHSET.clear();
      return "patches limpos ✅";
    }

    // -------- create
    if (cmd === "create") {
      const args = parseCreateArgs(rest);
      if (!args) return "Use: create <Nome>  ou  create <Nome> | <id>";

      const payload = { name: args.name, id: slugify(args.id || args.name), template: "pwa-base" };
      const patch = { type: "APP_CREATE", payload };

      if (ctx?.autoMode && !ctx?.safeMode) {
        PATCHSET.clear();
        PATCHSET.add(patch);
        return PATCHSET.applyAll();
      }

      PATCHSET.add(patch);
      return `Create pendente 🟡 (${payload.name} / ${payload.id})\nUse: apply`;
    }

    // -------- select
    if (cmd === "select") {
      const id = slugify(rest);
      if (!id) return "Use: select <id>";
      const patch = { type: "APP_SELECT", payload: { id } };

      if (ctx?.autoMode && !ctx?.safeMode) {
        PATCHSET.clear();
        PATCHSET.add(patch);
        return PATCHSET.applyAll();
      }

      PATCHSET.add(patch);
      return `Select pendente 🟡 (${id})\nUse: apply`;
    }

    // -------- file (set current)
    if (cmd === "file") {
      const f = String(rest || "").trim();
      if (!f) return "Use: file <index.html|app.js|styles.css|manifest.json|sw.js>";
      const patch = { type: "FILE_SET_CURRENT", payload: { file: f } };

      if (ctx?.autoMode && !ctx?.safeMode) {
        PATCHSET.clear();
        PATCHSET.add(patch);
        return PATCHSET.applyAll();
      }

      PATCHSET.add(patch);
      return `File pendente 🟡 (${f})\nUse: apply`;
    }

    // -------- show
    if (cmd === "show") {
      const active = getActiveId();
      if (!active) return "Sem app ativo. Use: create / select";
      const f = String(rest || "").trim() || getCurrentFile(ctx);
      try {
        const text = showFile(active, f);
        return `--- ${active}/${f} ---\n` + text;
      } catch (e) {
        return "ERRO: " + (e?.message || e);
      }
    }

    // -------- write (enter write mode)
    if (cmd === "write") {
      const f = String(rest || "").trim();
      WRITE.on = true;
      WRITE.targetFile = f || "";
      WRITE.buffer = "";
      return [
        "WRITE MODE ✅",
        `Arquivo: ${f || "(arquivo atual)"}`,
        "Cole o texto/código agora (quantas linhas quiser).",
        "Finalize com: /end"
      ].join("\n");
    }

    // -------- natural language quick heuristics
    // “cria um app chamado X”
    if (/^cria(r)?\s+um\s+app\s+chamado\s+/i.test(raw) || /^create\s+app\s+/i.test(raw)) {
      const name = raw.replace(/^cria(r)?\s+um\s+app\s+chamado\s+/i, "").replace(/^create\s+app\s+/i, "").trim();
      if (!name) return "Diga o nome. Ex: cria um app chamado AgroControl";
      const payload = { name, id: slugify(name), template: "pwa-base" };
      const patch = { type: "APP_CREATE", payload };
      if (ctx?.autoMode && !ctx?.safeMode) {
        PATCHSET.clear();
        PATCHSET.add(patch);
        return PATCHSET.applyAll();
      }
      PATCHSET.add(patch);
      return `Create pendente 🟡 (${payload.name} / ${payload.id})\nUse: apply`;
    }

    return "Comando não reconhecido. Digite: help";
  }

  // ---------- Export API ----------
  window.RCF_COMMANDS = {
    handle,
    helpText,
    logger: LOGGER,
    patchset: PATCHSET
  };

  LOGGER.push("log", "core/commands.js carregado ✅");
})();

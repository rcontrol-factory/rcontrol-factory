/* =========================================================
   RControl Factory — app/app.js (RECOVERY V2 - NO-BUTTON-DEAD)
   Objetivo:
   - Nunca travar os botões (fail-safe init)
   - Bater com o index.html que você mandou (IDs e tabs)
   - Offline-first (localStorage)
   - Editor + Preview + Generator ZIP
   - Admin: PIN + Diagnóstico + Backup + IA Offline (com aprovação)
   ========================================================= */

(() => {
  "use strict";

  // --------------------- Storage Keys ---------------------
  const LS = {
    settings: "rcf_settings_v4",
    apps: "rcf_apps_v4",
    activeAppId: "rcf_active_app_id_v4",
    adminPin: "rcf_admin_pin_v1",
    adminUnlockUntil: "rcf_admin_unlock_until_v1",
    aiDraft: "rcf_ai_draft_v1",
  };

  const DEFAULT_SETTINGS = {
    ghUser: "",
    ghToken: "",
    repoPrefix: "rapp-",
    pagesBase: "",
  };

  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];

  // --------------------- DOM Helpers ---------------------
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  // --------------------- Logs (não quebra UI) ---------------------
  const __LOG_MAX = 300;
  const __logs = [];
  function pushLog(level, ...parts) {
    const time = new Date().toISOString().slice(11, 19);
    const msg = parts.map(p => {
      try { return typeof p === "string" ? p : JSON.stringify(p); }
      catch { return String(p); }
    }).join(" ");
    __logs.push({ time, level, msg });
    while (__logs.length > __LOG_MAX) __logs.shift();
    // não mexe no DOM aqui (pra não travar)
  }
  const logInfo = (...a) => pushLog("log", ...a);
  const logWarn = (...a) => pushLog("warn", ...a);
  const logError = (...a) => pushLog("error", ...a);

  window.addEventListener("error", (e) => {
    logError("JS ERROR:", e.message || "Erro", e.filename, e.lineno, e.colno);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logError("PROMISE REJECT:", e.reason);
  });

  // --------------------- State ---------------------
  let settings = loadSettings();
  let apps = loadApps();
  let activeAppId = getActiveAppId();
  let currentFile = "index.html";

  // --------------------- Load / Save ---------------------
  function loadSettings() {
    const raw = localStorage.getItem(LS.settings);
    const data = raw ? safeJsonParse(raw, {}) : {};
    return { ...DEFAULT_SETTINGS, ...(data || {}) };
  }
  function saveSettings() {
    localStorage.setItem(LS.settings, JSON.stringify(settings));
  }

  function loadApps() {
    const raw = localStorage.getItem(LS.apps);
    return raw ? safeJsonParse(raw, []) : [];
  }
  function saveApps() {
    localStorage.setItem(LS.apps, JSON.stringify(apps));
  }

  function setActiveAppId(id) {
    activeAppId = id || "";
    localStorage.setItem(LS.activeAppId, activeAppId);
  }
  function getActiveAppId() {
    return localStorage.getItem(LS.activeAppId) || "";
  }

  // --------------------- UI Status ---------------------
  function setStatus(msg) {
    const el = $("statusBox");
    if (el) el.textContent = msg;
    logInfo("STATUS:", msg);
  }
  function setGenStatus(msg) {
    const el = $("genStatus");
    if (el) el.textContent = msg;
    logInfo("GEN:", msg);
  }

  // --------------------- Tabs (FAIL-SAFE) ---------------------
  const TAB_IDS = ["dashboard", "newapp", "editor", "generator", "settings", "admin"];

  function showTab(tab) {
    // FAIL-SAFE: mesmo se algo falhar, os botões de tab continuam vivos
    try {
      TAB_IDS.forEach((t) => {
        const sec = $(`tab-${t}`);
        if (sec) sec.classList.toggle("hidden", t !== tab);
      });
      // marca active nos botões
      qsa(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    } catch (e) {
      logError("showTab falhou:", e);
    }
  }

  function wireTabsFailSafe() {
    // tabs topo
    qsa(".tab").forEach((b) => {
      b.addEventListener("click", () => {
        const t = b.dataset.tab;
        if (t) showTab(t);
      });
    });

    // botões do dashboard (se existirem)
    $("goNewApp")?.addEventListener("click", () => showTab("newapp"));
    $("goEditor")?.addEventListener("click", () => showTab("editor"));
    $("goGenerator")?.addEventListener("click", () => showTab("generator"));
  }

  // --------------------- Validation ---------------------
  function sanitizeId(raw) {
    return (raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function validateApp(name, id) {
    const errors = [];
    if (!name || name.trim().length < 2) errors.push("Nome do app muito curto.");
    if (!id || id.length < 2) errors.push("ID do app muito curto.");
    if (/[A-Z]/.test(id)) errors.push("ID não pode ter letra maiúscula.");
    if (!/^[a-z0-9-]+$/.test(id)) errors.push("ID só pode ter a-z, 0-9 e hífen.");
    return errors;
  }

  // --------------------- Templates ---------------------
  function applyVars(text, app) {
    return String(text).replaceAll("{{APP_NAME}}", app.name).replaceAll("{{APP_ID}}", app.id);
  }

  function makePwaBaseTemplateFiles() {
    const index = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{APP_NAME}}</title>
  <meta name="theme-color" content="#0b1220" />
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="top">
    <h1>{{APP_NAME}}</h1>
    <div class="muted">Gerado pelo RControl Factory • ID: {{APP_ID}}</div>
  </header>

  <main class="wrap">
    <div class="card">
      <h2>App rodando ✅</h2>
      <p>Agora edite <code>app.js</code> e <code>styles.css</code>.</p>
      <button id="btn">Clique aqui</button>
      <div id="out" class="out"></div>
    </div>
  </main>

  <script src="app.js"></script>
  <script>
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
    }
  </script>
</body>
</html>`;

    const appjs = `// {{APP_NAME}} - {{APP_ID}}
const btn = document.getElementById("btn");
const out = document.getElementById("out");

btn?.addEventListener("click", () => {
  const now = new Date().toLocaleString();
  out.textContent = "Funcionando! " + now;
});`;

    const css = `:root{--bg:#0b1220;--card:#0f1a2e;--border:rgba(255,255,255,.1);--text:rgba(255,255,255,.92);--muted:rgba(255,255,255,.65);--green:#19c37d}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}
.top{padding:16px 14px;border-bottom:1px solid var(--border)}
.wrap{max-width:900px;margin:16px auto;padding:0 14px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px}
.muted{color:var(--muted);font-size:12px}
button{background:rgba(25,195,125,.2);border:1px solid rgba(25,195,125,.35);color:var(--text);padding:10px 12px;border-radius:12px;font-weight:700}
.out{margin-top:10px;padding:10px;border:1px dashed rgba(255,255,255,.2);border-radius:12px;min-height:24px}`;

    const manifest = `{
  "name": "{{APP_NAME}}",
  "short_name": "{{APP_NAME}}",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#0b1220",
  "theme_color": "#0b1220",
  "icons": []
}`;

    const sw = `const CACHE = "{{APP_ID}}-v1";
const ASSETS = ["./","./index.html","./styles.css","./app.js","./manifest.json"];

self.addEventListener("install",(e)=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await c.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate",(e)=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null));
    self.clients.claim();
  })());
});

self.addEventListener("fetch",(e)=>{
  e.respondWith((async()=>{
    const cached=await caches.match(e.request);
    if(cached) return cached;
    try{
      const fresh=await fetch(e.request);
      return fresh;
    }catch{
      return caches.match("./index.html");
    }
  })());
});`;

    return { "index.html": index, "app.js": appjs, "styles.css": css, "manifest.json": manifest, "sw.js": sw };
  }

  function makePwaEmptyTemplateFiles() {
    return {
      "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{{APP_NAME}}</title></head><body><h1>{{APP_NAME}}</h1><p>ID: {{APP_ID}}</p></body></html>`,
      "app.js": `// {{APP_NAME}}`,
      "styles.css": `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}`,
      "manifest.json": `{"name":"{{APP_NAME}}","short_name":"{{APP_NAME}}","start_url":"./","display":"standalone","background_color":"#0b1220","theme_color":"#0b1220","icons":[]}`,
      "sw.js": `self.addEventListener("fetch",()=>{});`,
    };
  }

  function getTemplates() {
    return [
      { id: "pwa-base", name: "PWA Base (com app.js + styles.css)", files: makePwaBaseTemplateFiles() },
      { id: "pwa-empty", name: "PWA Vazia (minimal)", files: makePwaEmptyTemplateFiles() },
    ];
  }

  // --------------------- App CRUD ---------------------
  function pickAppById(id) {
    return apps.find((a) => a && a.id === id) || null;
  }

  function ensureActiveApp() {
    if (activeAppId && pickAppById(activeAppId)) return;
    if (apps.length) setActiveAppId(apps[0].id);
    else setActiveAppId("");
  }

  function createApp({ name, id, type, templateId }) {
    const tpl = getTemplates().find((t) => t.id === templateId) || getTemplates()[0];

    const files = {};
    Object.keys(tpl.files).forEach((k) => {
      files[k] = applyVars(tpl.files[k], { name, id });
    });

    const app = {
      name,
      id,
      type,
      templateId,
      createdAt: Date.now(),
      files,
      baseFiles: { ...files },
    };

    apps.unshift(app);
    saveApps();
    setActiveAppId(id);
    return app;
  }

  // --------------------- Render: Apps List ---------------------
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderTemplatesSelect() {
    const sel = $("newTemplate");
    if (!sel) return;
    sel.innerHTML = "";
    getTemplates().forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
  }

  function renderAppsList() {
    ensureActiveApp();
    const root = $("appsList");
    if (!root) return;
    root.innerHTML = "";

    if (!apps.length) {
      root.innerHTML = `<div class="muted">Nenhum app salvo ainda.</div>`;
      return;
    }

    apps.forEach((a) => {
      const item = document.createElement("div");
      item.className = "item";
      const isOn = a.id === activeAppId;

      item.innerHTML = `
        <div>
          <strong>${escapeHtml(a.name)}</strong>
          <div class="meta">${escapeHtml(a.id)} • ${escapeHtml(a.type || "pwa")}</div>
        </div>
        <span class="badge ${isOn ? "on" : ""}">${isOn ? "ativo" : "selecionar"}</span>
      `;

      item.addEventListener("click", () => {
        setActiveAppId(a.id);
        setStatus(`App ativo: ${a.name} (${a.id}) ✅`);
        renderAppsList();
        renderEditor();
        renderGeneratorSelect();
        showTab("editor");
      });

      root.appendChild(item);
    });
  }

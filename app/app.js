/* =========================================================
   RControl Factory — app.js (Standalone v4)
   - Offline-first (localStorage)
   - Dashboard / New App / Editor / Generator / Settings
   - Admin (PIN + aba escondida)
   - Diagnóstico + Logs flutuantes (iPhone-friendly)
   - Auto-repair determinístico (sem IA ainda)
   ========================================================= */

(function () {
  "use strict";

  // ---------- Storage keys (versão) ----------
  const LS = {
    settings: "rcf_settings_v4",
    apps: "rcf_apps_v4",
    activeAppId: "rcf_active_app_id_v4",
    backup: "rcf_backup_v4",
  };

  const DEFAULT_SETTINGS = {
    ghUser: "",
    ghToken: "",
    repoPrefix: "rapp-",
    pagesBase: "",
    openaiKey: "",
    openaiModel: "gpt-4.1",
    adminPin: "", // 6 dígitos
  };

  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- Debug/Logs flutuantes ----------
  const __LOG_MAX = 250;
  const __logs = [];
  function __pushLog(level, args) {
    const time = new Date().toISOString().slice(11, 19);
    const msg = (args || []).map((a) => {
      try { return typeof a === "string" ? a : JSON.stringify(a); }
      catch { return String(a); }
    }).join(" ");
    __logs.push({ time, level, msg });
    while (__logs.length > __LOG_MAX) __logs.shift();
    __renderDebug();
  }
  const __origConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...a) => { __origConsole.log(...a); __pushLog("log", a); };
  console.warn = (...a) => { __origConsole.warn(...a); __pushLog("warn", a); };
  console.error = (...a) => { __origConsole.error(...a); __pushLog("error", a); };

  window.addEventListener("error", (e) => {
    __pushLog("error", [e.message || "Erro", e.filename, e.lineno, e.colno]);
  });
  window.addEventListener("unhandledrejection", (e) => {
    __pushLog("error", ["Promise rejeitada:", e.reason]);
  });

  function __ensureDebugUI() {
    if (document.getElementById("rcf-debug-btn")) return;

    const btnLogs = document.createElement("button");
    btnLogs.id = "rcf-debug-btn";
    btnLogs.textContent = "Logs";
    btnLogs.style.cssText = `
      position:fixed; right:12px; bottom:12px; z-index:99999;
      padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
      background:rgba(0,0,0,.55); color:white; font-weight:900;
    `;

    const btnDiag = document.createElement("button");
    btnDiag.id = "rcf-diag-btn";
    btnDiag.textContent = "Diag";
    btnDiag.style.cssText = `
      position:fixed; right:72px; bottom:12px; z-index:99999;
      padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
      background:rgba(0,0,0,.55); color:white; font-weight:900;
    `;

    const panel = document.createElement("div");
    panel.id = "rcf-debug-panel";
    panel.style.display = "none";
    panel.style.cssText = `
      position:fixed; left:12px; right:12px; bottom:64px; z-index:99999;
      max-height:58vh; overflow:auto; padding:10px;
      border-radius:14px; border:1px solid rgba(255,255,255,.15);
      background:rgba(10,10,10,.92); color:#eaeaea; font:12px/1.35 -apple-system,system-ui,Segoe UI,Roboto,Arial;
      white-space:pre-wrap;
    `;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;";

    const clear = document.createElement("button");
    clear.textContent = "Limpar logs";
    clear.style.cssText = "padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900;";
    clear.onclick = () => { __logs.length = 0; __renderDebug(); };

    const copy = document.createElement("button");
    copy.textContent = "Copiar logs";
    copy.style.cssText = clear.style.cssText;
    copy.onclick = async () => {
      const text = __logs.map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n");
      try { await navigator.clipboard.writeText(text); alert("Logs copiados ✅"); }
      catch { alert("iOS bloqueou copiar. Segura no texto e copia manual."); }
    };

    const copyDiag = document.createElement("button");
    copyDiag.textContent = "Copiar diagnóstico";
    copyDiag.style.cssText = clear.style.cssText;
    copyDiag.onclick = async () => {
      const diag = await buildDiagnosisReport();
      try { await navigator.clipboard.writeText(diag); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Vou mostrar na tela; copie manual."); }
      const body = document.getElementById("rcf-debug-body");
      if (body) body.textContent = diag;
      panel.style.display = "block";
    };

    const nuke = document.createElement("button");
    nuke.textContent = "Limpar Cache PWA";
    nuke.style.cssText = clear.style.cssText;
    nuke.onclick = async () => {
      const ok = confirm("Vai limpar caches + desregistrar Service Worker e recarregar. Continuar?");
      if (!ok) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    };

    actions.append(clear, copy, copyDiag, nuke);
    panel.append(actions);

    const body = document.createElement("div");
    body.id = "rcf-debug-body";
    panel.append(body);

    btnLogs.onclick = () => {
      panel.style.display = (panel.style.display === "none") ? "block" : "none";
      __renderDebug();
    };

    btnDiag.onclick = async () => {
      const diag = await buildDiagnosisReport();
      const body = document.getElementById("rcf-debug-body");
      if (body) body.textContent = diag;
      panel.style.display = "block";
    };

    document.body.append(btnDiag, btnLogs, panel);
  }

  function __renderDebug() {
    const body = document.getElementById("rcf-debug-body");
    if (!body) return;
    body.textContent = __logs.map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n");
  }

  async function nukePwaCache() {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) { console.warn("Falha ao limpar caches:", e); }

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) { console.warn("Falha ao desregistrar SW:", e); }
  }

  // ---------- Load State ----------
  let settings = loadSettings();
  let apps = loadApps();
  let activeAppId = getActiveAppId();
  let currentFile = "index.html";

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
    // snapshot backup
    try {
      localStorage.setItem(LS.backup, JSON.stringify({ ts: Date.now(), apps, settings }));
    } catch {}
  }
  function setActiveAppId(id) {
    activeAppId = id || "";
    localStorage.setItem(LS.activeAppId, activeAppId);
  }
  function getActiveAppId() {
    return localStorage.getItem(LS.activeAppId) || "";
  }

  // ---------- UI status/log ----------
  function setStatus(msg) {
    const el = $("statusBox");
    if (el) el.textContent = msg;
    console.log("STATUS:", msg);
  }
  function setGenStatus(msg) {
    const el = $("genStatus");
    if (el) el.textContent = msg;
    console.log("GEN:", msg);
  }
  function log(msg) {
    const el = $("logs");
    if (!el) return;
    const t = new Date().toLocaleTimeString();
    el.textContent += `[${t}] ${msg}\n`;
    el.scrollTop = el.scrollHeight;
    console.log("LOG:", msg);
  }
  function clearLogs() {
    const el = $("logs");
    if (el) el.textContent = "";
  }

  // ---------- Tabs ----------
  const TAB_IDS = ["dashboard", "newapp", "editor", "generator", "settings", "admin"];
  function showTab(tab) {
    TAB_IDS.forEach((t) => {
      const sec = $(`tab-${t}`);
      if (sec) sec.classList.toggle("hidden", t !== tab);
    });
    qsa(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  }

  // ---------- Validation ----------
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

  // ---------- Templates (built-in) ----------
  function getTemplates() {
    return [
      { id: "pwa-base", name: "PWA Base", files: makePwaBaseTemplateFiles() },
      { id: "pwa-empty", name: "PWA Vazia (minimal)", files: makePwaEmptyTemplateFiles() },
    ];
  }

  function applyVars(text, app) {
    return String(text)
      .replaceAll("{{APP_NAME}}", app.name)
      .replaceAll("{{APP_ID}}", app.id);
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

    const css = `:root{--bg:#0b1220;--card:#0f1a2e;--border:rgba(255,255,255,.1);--text:rgba(255,255,255,.92);--muted:rgba(255,255,255,.65)}
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
self.addEventListener("install",(e)=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(ASSETS);self.skipWaiting();})());});
self.addEventListener("activate",(e)=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null));self.clients.claim();})());});
self.addEventListener("fetch",(e)=>{e.respondWith((async()=>{const cached=await caches.match(e.request);if(cached)return cached;try{return await fetch(e.request);}catch{return caches.match("./index.html");}})());});`;

    return { "index.html": index, "app.js": appjs, "styles.css": css, "manifest.json": manifest, "sw.js": sw };
  }

  function makePwaEmptyTemplateFiles() {
    return {
      "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{{APP_NAME}}</title></head><body><h1>{{APP_NAME}}</h1><p>ID: {{APP_ID}}</p><script src="app.js"></script></body></html>`,
      "app.js": `// {{APP_NAME}}`,
      "styles.css": `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}`,
      "manifest.json": `{"name":"{{APP_NAME}}","short_name":"{{APP_NAME}}","start_url":"./","display":"standalone","background_color":"#0b1220","theme_color":"#0b1220","icons":[]}`,
      "sw.js": `self.addEventListener("fetch",()=>{});`,
    };
  }

  // ---------- App CRUD ----------
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
      type: type || "pwa",
      templateId: templateId || tpl.id,
      createdAt: Date.now(),
      files,
      baseFiles: { ...files },
    };

    apps.unshift(app);
    saveApps();
    setActiveAppId(id);
  }

  // ---------- Preview ----------
  function injectIntoFullHtml(fullHtml, css, js) {
    let out = String(fullHtml);

    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `<style>${css}</style>\n</head>`);
    else out = `<style>${css}</style>\n` + out;

    // evita quebrar se já tiver <script src="app.js">
    if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `<script>${js}<\/script>\n</body>`);
    else out = out + `\n<script>${js}<\/script>\n`;

    return out;
  }

  function refreshPreview(app) {
    const frame = $("previewFrame");
    if (!frame) return;

    const html = app.files["index.html"] || "<h1>Sem index.html</h1>";
    const css = app.files["styles.css"] || "";
    const js = app.files["app.js"] || "";

    const looksLikeFullDoc = /<!doctype\s+html>/i.test(html) || /<html[\s>]/i.test(html);

    const doc = looksLikeFullDoc
      ? injectIntoFullHtml(html, css, js)
      : `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;

    frame.srcdoc = doc;
  }

  // ---------- ZIP ----------
  async function downloadZip(app) {
    if (typeof JSZip === "undefined") {
      alert("JSZip não carregou. Verifique o index.html.");
      return;
    }

    const zip = new JSZip();
    Object.entries(app.files).forEach(([path, content]) => {
      zip.file(path, String(content ?? ""));
    });
    zip.file("README.md", `# ${app.name}\n\nGerado pelo RControl Factory.\n`);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${app.id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  // ---------- Diagnóstico ----------
  async function buildDiagnosisReport() {
    const lines = [];
    const add = (k, v) => lines.push(`${k}: ${v}`);

    add("=== RCF DIAGNÓSTICO ===", "");
    add("URL", location.href);
    add("UA", navigator.userAgent);
    add("Hora", new Date().toString());

    // localStorage resumo
    try {
      const s = localStorage.getItem(LS.settings) || "";
      const a = localStorage.getItem(LS.apps) || "";
      const act = localStorage.getItem(LS.activeAppId) || "";
      add("LS.settings bytes", s.length);
      add("LS.apps bytes", a.length);
      add("LS.activeAppId", act || "(vazio)");
    } catch (e) { add("localStorage", "ERRO: " + e.message); }

    // apps
    try {
      const _apps = loadApps();
      add("Apps count", _apps.length);
      const _active = getActiveAppId();
      const found = _apps.find(x => x && x.id === _active);
      add("Active exists", found ? "SIM" : "NÃO");
      if (found) add("Active name/id", `${found.name} / ${found.id}`);
    } catch (e) { add("Apps parse", "ERRO: " + e.message); }

    // service worker
    try {
      add("SW supported", ("serviceWorker" in navigator) ? "SIM" : "NÃO");
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        add("SW registrations", regs.length);
      }
    } catch (e) { add("SW", "ERRO: " + e.message); }

    // caches
    try {
      add("Cache API", ("caches" in window) ? "SIM" : "NÃO");
      if ("caches" in window) {
        const keys = await caches.keys();
        add("Caches", keys.join(", ") || "(nenhum)");
      }
    } catch (e) { add("Caches", "ERRO: " + e.message); }

    // DOM check
    const must = [
      "appsList","statusBox","newName","newId","newTemplate","createAppBtn",
      "activeAppLabel","filesList","codeArea","previewFrame","genAppSelect",
      "downloadZipBtn","genStatus","logs","ghUser","ghToken","repoPrefix","pagesBase","adminPin"
    ];
    const missing = must.filter(id => !document.getElementById(id));
    add("DOM missing IDs", missing.length ? missing.join(", ") : "OK");

    add("---- últimos logs ----", "");
    const tail = __logs.slice(-40).map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`);
    lines.push(tail.join("\n") || "(sem logs)");

    return lines.join("\n");
  }

  // ---------- Auto-repair ----------
  function autoRepair() {
    const out = [];
    const say = (m) => out.push(m);

    // tenta restaurar backup se apps corromper
    if (!Array.isArray(apps)) {
      say("Apps estava corrompido (não-array). Tentando restaurar backup…");
      const b = safeJsonParse(localStorage.getItem(LS.backup) || "null", null);
      if (b && Array.isArray(b.apps)) {
        apps = b.apps;
        settings = { ...DEFAULT_SETTINGS, ...(b.settings || {}) };
        saveSettings();
        saveApps();
        say("Backup restaurado ✅");
      } else {
        apps = [];
        saveApps();
        say("Sem backup válido. Zerei apps ✅");
      }
    }

    // garante estrutura de cada app
    for (const a of apps) {
      if (!a || typeof a !== "object") continue;
      if (!a.files || typeof a.files !== "object") {
        a.files = {};
        say(`App ${a.id || "(sem id)"}: files faltando → criei vazio`);
      }
      // garante arquivos do template base
      const tpl = getTemplates().find(t => t.id === (a.templateId || "pwa-base")) || getTemplates()[0];
      for (const f of Object.keys(tpl.files)) {
        if (typeof a.files[f] !== "string") {
          a.files[f] = applyVars(tpl.files[f], { name: a.name || "App", id: a.id || "app" });
          say(`App ${a.id}: recriei arquivo ${f}`);
        }
      }
      if (!a.baseFiles || typeof a.baseFiles !== "object") {
        a.baseFiles = { ...a.files };
        say(`App ${a.id}: baseFiles faltando → recriei`);
      }
    }

    ensureActiveApp();
    saveApps();
    say("Auto-repair finalizado ✅");
    return out.join("\n");
  }

  // === PARTE 2 VEM NO PRÓXIMO BLOCO ===
 // === PARTE 2 ===

  // ---------- Render ----------
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
      });

      root.appendChild(item);
    });
  }

  function renderEditor() {
    ensureActiveApp();
    const app = pickAppById(activeAppId);

    const label = $("activeAppLabel");
    if (label) label.textContent = app ? `${app.name} (${app.id})` : "—";

    const fl = $("filesList");
    const area = $("codeArea");
    const cur = $("currentFileLabel");
    const frame = $("previewFrame");
    if (!fl || !area || !cur

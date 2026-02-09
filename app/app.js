/* =========================================================
   RControl Factory — app/app.js (ROTA 2 / STABLE + AGENT)
   - Offline-first (localStorage)
   - Dashboard / New App / Editor / Generator / Settings
   - Admin PIN + Diag + Backup + Cache reset
   - AGENT (fora do Admin) via modal flutuante (sem mexer no index.html)
   - Vault (upload de arquivos) + injetar assets no app ativo
   - "Absorver código" (patch) com Aprovar/Descartar
   - Não trava botões: overlays só com display:none quando fechados
   ========================================================= */

(function () {
  "use strict";

  // ===================== Storage keys =====================
  const LS = {
    settings: "rcf_settings_v4",
    apps: "rcf_apps_v4",
    activeAppId: "rcf_active_app_id_v4",
    adminPin: "rcf_admin_pin_v2",
    adminUnlockUntil: "rcf_admin_unlock_until_v2",
    vault: "rcf_vault_v1",          // arquivos anexados (base64)
    pendingPatch: "rcf_pending_patch_v1" // sugestão/patch pendente
  };

  const DEFAULT_SETTINGS = {
    ghUser: "",
    ghToken: "",
    repoPrefix: "rapp-",
    pagesBase: "",
    openaiKey: "",
    openaiModel: "gpt-4.1"
  };

  const FILE_ORDER = [
    "index.html",
    "app.js",
    "styles.css",
    "manifest.json",
    "sw.js",
    "terms.html",
    "privacy.html",
    "README.md"
  ];

  // ===================== DOM helpers =====================
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  // ===================== State =====================
  let settings = loadSettings();
  let apps = loadApps();
  let activeAppId = getActiveAppId();
  let currentFile = "index.html";

  // ===================== Logs (iPhone friendly) =====================
  const __LOG_MAX = 400;
  const __logs = [];

  function pushLog(level, parts) {
    const time = new Date().toISOString().slice(11, 19);
    const msg = (parts || [])
      .map((p) => {
        try {
          if (typeof p === "string") return p;
          return JSON.stringify(p);
        } catch {
          return String(p);
        }
      })
      .join(" ");
    __logs.push({ time, level, msg });
    while (__logs.length > __LOG_MAX) __logs.shift();
    renderDebugPanel();
  }

  function logInfo(...a) { pushLog("log", a); }
  function logWarn(...a) { pushLog("warn", a); }
  function logError(...a) { pushLog("error", a); }

  window.addEventListener("error", (e) => {
    logError("JS ERROR:", e.message || "Erro", e.filename, e.lineno, e.colno);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logError("PROMISE REJECT:", e.reason);
  });

  // ===================== Load/Save =====================
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

  function loadVault() {
    const raw = localStorage.getItem(LS.vault);
    return raw ? safeJsonParse(raw, []) : [];
  }
  function saveVault(v) {
    localStorage.setItem(LS.vault, JSON.stringify(v || []));
  }

  function getPendingPatch() {
    const raw = localStorage.getItem(LS.pendingPatch);
    return raw ? safeJsonParse(raw, null) : null;
  }
  function setPendingPatch(obj) {
    if (!obj) localStorage.removeItem(LS.pendingPatch);
    else localStorage.setItem(LS.pendingPatch, JSON.stringify(obj));
  }

  // ===================== UI status =====================
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

  // ===================== Tabs =====================
  const TAB_IDS = ["dashboard", "newapp", "editor", "generator", "settings", "admin"];

  function showTab(tab) {
    TAB_IDS.forEach((t) => {
      const sec = $(`tab-${t}`);
      if (sec) sec.classList.toggle("hidden", t !== tab);
    });
    qsa(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  }

  // ===================== Validation =====================
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

  // ===================== Templates =====================
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
      <p>Edite <code>app.js</code> e <code>styles.css</code>.</p>
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

    // termos/privacidade básicos (para a Factory e para apps gerados, se quiser)
    const terms = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Termos</title></head><body style="font-family:system-ui;padding:16px;max-width:820px;margin:auto">
<h1>Termos de Uso</h1>
<p>Este app foi gerado pelo RControl Factory. Uso por sua conta e risco. Sem garantias.</p>
</body></html>`;

    const privacy = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Privacidade</title></head><body style="font-family:system-ui;padding:16px;max-width:820px;margin:auto">
<h1>Política de Privacidade</h1>
<p>Por padrão, este app pode usar armazenamento local do navegador (localStorage) para funcionar offline.</p>
<p>Nenhum dado é enviado para servidores a menos que você conecte serviços externos.</p>
</body></html>`;

    const readme = `# {{APP_NAME}}

Gerado pelo **RControl Factory**.

## Rodar
Abra o \`index.html\` em um servidor estático (ou GitHub Pages).

## Offline
Service Worker faz cache básico (PWA).
`;

    return {
      "index.html": index,
      "app.js": appjs,
      "styles.css": css,
      "manifest.json": manifest,
      "sw.js": sw,
      "terms.html": terms,
      "privacy.html": privacy,
      "README.md": readme
    };
  }

  function makePwaEmptyTemplateFiles() {
    return {
      "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{{APP_NAME}}</title></head><body><h1>{{APP_NAME}}</h1><p>ID: {{APP_ID}}</p></body></html>`,
      "app.js": `// {{APP_NAME}}`,
      "styles.css": `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}`,
      "manifest.json": `{"name":"{{APP_NAME}}","short_name":"{{APP_NAME}}","start_url":"./","display":"standalone","background_color":"#0b1220","theme_color":"#0b1220","icons":[]}`,
      "sw.js": `self.addEventListener("fetch",()=>{});`,
      "terms.html": `<!doctype html><html><body><h1>Termos</h1></body></html>`,
      "privacy.html": `<!doctype html><html><body><h1>Privacidade</h1></body></html>`,
      "README.md": `# {{APP_NAME}}\n`
    };
  }

  function getTemplates() {
    // Se existir catálogo modular, usa ele. Senão usa os básicos.
    try {
      const ext = window.RCF?.templates?.getTemplates?.();
      if (Array.isArray(ext) && ext.length) return ext;
    } catch {}
    return [
      { id: "pwa-base", name: "PWA Base (com app.js + styles.css)", files: makePwaBaseTemplateFiles() },
      { id: "pwa-empty", name: "PWA Vazia (minimal)", files: makePwaEmptyTemplateFiles() }
    ];
  }

  // ===================== App CRUD =====================
  function pickAppById(id) {
    return apps.find((a) => a && a.id === id) || null;
  }

  function ensureActiveApp() {
    if (activeAppId && pickAppById(activeAppId)) return;
    if (apps.length) setActiveAppId(apps[0].id);
    else setActiveAppId("");
  }

  function createApp({ name, id, type, templateId }) {
    const templates = getTemplates();
    const tpl = templates.find((t) => t.id === templateId) || templates[0];

    const files = {};
    Object.keys(tpl.files).forEach((k) => {
      files[k] = applyVars(tpl.files[k], { name, id });
    });

    const app = {
      name,
      id,
      type: type || "pwa",
      templateId: tpl.id,
      createdAt: Date.now(),
      files,
      baseFiles: { ...files }
    };

    apps.unshift(app);
    saveApps();
    setActiveAppId(id);
    return app;
  }

  // ===================== Render =====================
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
    if (!fl || !area || !cur || !frame) return;

    fl.innerHTML = "";

    if (!app) {
      area.value = "";
      cur.textContent = "—";
      frame.srcdoc = `<p style="font-family:system-ui;padding:12px">Sem app ativo</p>`;
      return;
    }

    if (!FILE_ORDER.includes(currentFile)) currentFile = "index.html";

    // mostra os arquivos que existirem no app (ordem fixa + extras)
    const keys = Array.from(new Set([...FILE_ORDER, ...Object.keys(app.files || {})]));
    keys.forEach((f) => {
      if (!(f in app.files)) return;
      const b = document.createElement("button");
      b.className = "fileBtn" + (f === currentFile ? " active" : "");
      b.textContent = f;
      b.addEventListener("click", () => {
        currentFile = f;
        renderEditor();
      });
      fl.appendChild(b);
    });

    cur.textContent = currentFile;
    area.value = app.files[currentFile] ?? "";
    refreshPreview(app);
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
      : `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${css}</style>
</head><body>
${html}
<script>${js}<\/script>
</body></html>`;

    frame.srcdoc = doc;
  }

  function injectIntoFullHtml(fullHtml, css, js) {
    let out = String(fullHtml);

    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `<style>${css}</style>\n</head>`);
    else out = `<style>${css}</style>\n` + out;

    if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `<script>${js}<\/script>\n</body>`);
    else out = out + `\n<script>${js}<\/script>\n`;

    return out;
  }

  function renderGeneratorSelect() {
    ensureActiveApp();
    const sel = $("genAppSelect");
    if (!sel) return;

    sel.innerHTML = "";
    apps.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = `${a.name} (${a.id})`;
      sel.appendChild(opt);
    });

    if (activeAppId) sel.value = activeAppId;
  }

  function renderSettings() {
    if ($("ghUser")) $("ghUser").value = settings.ghUser || "";
    if ($("ghToken")) $("ghToken").value = settings.ghToken || "";
    if ($("repoPrefix")) $("repoPrefix").value = settings.repoPrefix || "rapp-";
    if ($("pagesBase")) $("pagesBase").value =
      settings.pagesBase || (settings.ghUser ? `https://${settings.ghUser}.github.io` : "");
  }

  // ===================== ZIP =====================
  async function downloadZip(app) {
    if (typeof JSZip === "undefined") {
      alert("JSZip não carregou. Verifique o index.html (script do jszip).");
      return;
    }

    const zip = new JSZip();
    Object.entries(app.files || {}).forEach(([path, content]) => {
      zip.file(path, String(content ?? ""));
    });

    // inclui assets “injetados” (base64) se existirem
    const assets = (app.assets && typeof app.assets === "object") ? app.assets : {};
    Object.entries(assets).forEach(([path, dataUrl]) => {
      // dataUrl -> Blob
      try {
        const m = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
        if (!m) return;
        const b64 = m[2];
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        zip.file(path, arr);
      } catch {}
    });

    zip.file("README_FACTORY.md", `# ${app.name}\nGerado pelo RControl Factory.\n`);

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

  function hasGitHubConfigured() {
    return !!(settings.ghUser && settings.ghToken);
  }

  // ===================== PWA cache nuke =====================
  async function nukePwaCache() {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) { logWarn("Falha ao limpar caches:", e); }

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) { logWarn("Falha ao desregistrar SW:", e); }
  }

  async function buildDiagnosisReport() {
    const lines = [];
    const add = (k, v) => lines.push(`${k}: ${v}`);

    add("=== RCF DIAGNÓSTICO ===", "");
    add("URL", location.href);
    add("UA", navigator.userAgent);
    add("Hora", new Date().toString());

    try {
      const s = localStorage.getItem(LS.settings) || "";
      const a = localStorage.getItem(LS.apps) || "";
      const act = localStorage.getItem(LS.activeAppId) || "";
      add("LS.settings bytes", s.length);
      add("LS.apps bytes", a.length);
      add("LS.activeAppId", act || "(vazio)");
    } catch (e) { add("localStorage", "ERRO: " + e.message); }

    try {
      const _apps = loadApps();
      add("Apps count", _apps.length);
      const _active = getActiveAppId();
      const found = _apps.find(x => x && x.id === _active);
      add("Active exists", found ? "SIM" : "NÃO");
      if (found) add("Active name/id", `${found.name} / ${found.id}`);
    } catch (e) { add("Apps parse", "ERRO: " + e.message); }

    try {
      add("SW supported", ("serviceWorker" in navigator) ? "SIM" : "NÃO");
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        add("SW registrations", regs.length);
      }
    } catch (e) { add("SW", "ERRO: " + e.message); }

    try {
      add("Cache API", ("caches" in window) ? "SIM" : "NÃO");
      if ("caches" in window) {
        const keys = await caches.keys();
        add("Caches", keys.join(", ") || "(nenhum)");
      }
    } catch (e) { add("Caches", "ERRO: " + e.message); }

    const must = [
      "appsList","statusBox","newName","newId","newTemplate","createAppBtn",
      "activeAppLabel","filesList","codeArea","previewFrame","genAppSelect",
      "downloadZipBtn","genStatus","ghUser","ghToken","repoPrefix","pagesBase",
      // admin tab ids
      "adminPinInput","adminUnlockBtn","adminState","diagBtn","copyDiagBtn","clearPwaBtn",
      "exportBtn","importBtn","adminOut","aiInput","aiRunBtn","aiClearBtn","aiApplyBtn","aiDiscardBtn","aiOut"
    ];
    const missing = must.filter(id => !document.getElementById(id));
    add("DOM missing IDs", missing.length ? missing.join(", ") : "OK");

    add("---- últimos logs ----", "");
    const tail = __logs.slice(-80).map(l => `[${l.time}] ${String(l.level).toUpperCase()} ${l.msg}`);
    lines.push(tail.join("\n") || "(sem logs)");

    add("---- módulos externos ----", "");
    add("window.RCF", window.RCF ? "SIM" : "NÃO");
    add("engine", window.RCF?.engine ? "SIM" : "NÃO");
    add("templates", window.RCF?.templates ? "SIM" : "NÃO");
    add("router", window.RCF?.router ? "SIM" : "NÃO");

    return lines.join("\n");
  }

  // ===================== Debug floating UI =====================
  function ensureFloatingDebugButtons() {
    if (document.getElementById("rcf-fab-logs")) return;

    const mkBtn = (id, text, rightPx) => {
      const b = document.createElement("button");
      b.id = id;
      b.textContent = text;
      b.style.cssText = `
        position:fixed; right:${rightPx}px; bottom:12px; z-index:99999;
        padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
        background:rgba(0,0,0,.55); color:white; font-weight:900;
        -webkit-tap-highlight-color: transparent;
      `;
      return b;
    };

    const btnAgent = mkBtn("rcf-fab-agent", "Agent", 192);
    const btnAdmin = mkBtn("rcf-fab-admin", "Admin", 132);
    const btnDiag  = mkBtn("rcf-fab-diag",  "Diag", 72);
    const btnLogs  = mkBtn("rcf-fab-logs",  "Logs", 12);

    btnLogs.onclick = () => toggleDebugPanel();
    btnDiag.onclick = async () => {
      const rep = await buildDiagnosisReport();
      showDebugPanel(rep);
    };
    btnAdmin.onclick = () => openAdminModal();
    btnAgent.onclick = () => openAgentModal();

    document.body.append(btnAgent, btnAdmin, btnDiag, btnLogs);
    ensureDebugPanel();
    ensureAdminModal();
    ensureAgentModal();
  }

  function ensureDebugPanel() {
    if (document.getElementById("rcf-debug-panel")) return;

    const panel = document.createElement("div");
    panel.id = "rcf-debug-panel";
    panel.style.display = "none";
    panel.style.cssText = `
      position:fixed; left:12px; right:12px; bottom:64px; z-index:99999;
      max-height:55vh; overflow:auto; padding:10px;
      border-radius:14px; border:1px solid rgba(255,255,255,.15);
      background:rgba(10,10,10,.92); color:#eaeaea; font:12px/1.35 -apple-system,system-ui,Segoe UI,Roboto,Arial;
      white-space:pre-wrap;
    `;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;";

    const btnClear = mkMiniBtn("Limpar logs", () => { __logs.length = 0; renderDebugPanel(); });
    const btnCopy  = mkMiniBtn("Copiar logs", async () => {
      const text = __logs.map(l => `[${l.time}] ${String(l.level).toUpperCase()} ${l.msg}`).join("\n");
      try { await navigator.clipboard.writeText(text); alert("Logs copiados ✅"); }
      catch { alert("iOS bloqueou copiar. Segura no texto e copia manual."); }
    });
    const btnCopyDiag = mkMiniBtn("Copiar diagnóstico", async () => {
      const diag = await buildDiagnosisReport();
      try { await navigator.clipboard.writeText(diag); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Vou mostrar na tela; copie manual."); }
      showDebugPanel(diag);
    });
    const btnCache = mkMiniBtn("Limpar Cache PWA", async () => {
      const ok = confirm("Vai limpar caches + desregistrar Service Worker e recarregar. Continuar?");
      if (!ok) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

    actions.append(btnClear, btnCopy, btnCopyDiag, btnCache);

    const body = document.createElement("div");
    body.id = "rcf-debug-body";

    panel.append(actions, body);
    document.body.appendChild(panel);
  }

  function mkMiniBtn(text, onClick) {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = "padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900;";
    b.onclick = onClick;
    return b;
  }

  function renderDebugPanel() {
    const body = document.getElementById("rcf-debug-body");
    if (!body) return;
    body.textContent = __logs.map(l => `[${l.time}] ${String(l.level).toUpperCase()} ${l.msg}`).join("\n");
  }

  function showDebugPanel(text) {
    ensureDebugPanel();
    const panel = document.getElementById("rcf-debug-panel");
    const body = document.getElementById("rcf-debug-body");
    if (body && typeof text === "string") body.textContent = text;
    if (panel) panel.style.display = "block";
  }

  function toggleDebugPanel() {
    ensureDebugPanel();
    const panel = document.getElementById("rcf-debug-panel");
    if (!panel) return;
    panel.style.display = (panel.style.display === "none") ? "block" : "none";
    renderDebugPanel();
  }

  // ===================== Admin PIN =====================
  // Você disse que 000 funcionou aí — então o padrão agora é 000.
  const DEFAULT_PIN = "000";

  function getPin() {
    const p = localStorage.getItem(LS.adminPin);
    return (p && String(p).trim()) ? String(p).trim() : DEFAULT_PIN;
  }
  function setPin(pin) {
    localStorage.setItem(LS.adminPin, String(pin || "").trim());
  }
  function isUnlocked() {
    const until = Number(localStorage.getItem(LS.adminUnlockUntil) || "0");
    return until && until > Date.now();
  }
  function unlock(minutes) {
    const ms = (Number(minutes || 15) * 60 * 1000);
    localStorage.setItem(LS.adminUnlockUntil, String(Date.now() + ms));
  }
  function lockAdmin() {
    localStorage.setItem(LS.adminUnlockUntil, "0");
  }

  // ===================== Admin UI (tab-admin + modal fallback) =====================
  // Tab-admin (seu index já tem) — vamos só wire.
  function renderAdminStateTab() {
    const st = $("adminState");
    if (!st) return;
    st.textContent = isUnlocked() ? "UNLOCK ✅" : "LOCKED 🔒";
  }

  function guardUnlocked() {
    if (isUnlocked()) return true;
    alert("Admin está bloqueado 🔒 (digite PIN e Unlock).");
    return false;
  }

  // Modal admin extra (pra não depender do Tab funcionar)
  function ensureAdminModal() {
    if (document.getElementById("rcf-admin-modal")) return;

    const modal = document.createElement("div");
    modal.id = "rcf-admin-modal";
    modal.style.cssText = `
      position:fixed; inset:12px; z-index:100000;
      display:none; border-radius:16px;
      background:rgba(10,10,10,.92);
      border:1px solid rgba(255,255,255,.14);
      color:#fff; font-family:-apple-system,system-ui,Segoe UI,Roboto,Arial;
      overflow:auto;
    `;

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,.10);";

    const title = document.createElement("div");
    title.innerHTML = "<strong>ADMIN • RControl Factory</strong> <span style='opacity:.7;font-size:12px'>(PIN padrão: 000)</span>";

    const hBtns = document.createElement("div");
    hBtns.style.cssText = "display:flex;gap:8px;align-items:center;";

    const btnLock = document.createElement("button");
    btnLock.textContent = "Lock";
    btnLock.style.cssText = adminBtnCss();
    btnLock.onclick = () => { lockAdmin(); renderAdminStateModal(); };

    const btnClose = document.createElement("button");
    btnClose.textContent = "Fechar";
    btnClose.style.cssText = adminBtnCss();
    btnClose.onclick = () => closeAdminModal();

    hBtns.append(btnLock, btnClose);
    header.append(title, hBtns);

    const body = document.createElement("div");
    body.style.cssText = "padding:12px;";

    const pinRow = document.createElement("div");
    pinRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;";

    const pinInput = document.createElement("input");
    pinInput.id = "rcf-admin-pin";
    pinInput.type = "password";
    pinInput.placeholder = "PIN";
    pinInput.style.cssText = "width:120px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-weight:900;";

    const btnUnlock = document.createElement("button");
    btnUnlock.textContent = "Unlock (15min)";
    btnUnlock.style.cssText = adminBtnCss();
    btnUnlock.onclick = () => {
      const ok = (pinInput.value || "") === getPin();
      if (!ok) return alert("PIN errado ❌");
      unlock(15);
      pinInput.value = "";
      renderAdminStateModal();
    };

    const btnChangePin = document.createElement("button");
    btnChangePin.textContent = "Trocar PIN";
    btnChangePin.style.cssText = adminBtnCss();
    btnChangePin.onclick = () => {
      if (!guardUnlocked()) return;
      const v = prompt("Digite o NOVO PIN (4+ dígitos):", "");
      if (!v || v.trim().length < 4) return alert("PIN inválido.");
      setPin(v.trim());
      alert("PIN atualizado ✅");
    };

    const st = document.createElement("span");
    st.id = "rcf-admin-state";
    st.style.cssText = "padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);font-weight:900;";

    pinRow.append(pinInput, btnUnlock, btnChangePin, st);

    const h3 = document.createElement("h3");
    h3.style.margin = "10px 0 8px";
    h3.textContent = "Reparos / Backup";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;";

    const aDiag = mkAdminAction("Rodar diagnóstico", async () => {
      const rep = await buildDiagnosisReport();
      diagOut.textContent = rep;
    });

    const aCache = mkAdminAction("Limpar Cache PWA", async () => {
      if (!guardUnlocked()) return;
      if (!confirm("Vai limpar caches + desregistrar SW e recarregar. Continuar?")) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

    const aReset = mkAdminAction("Reset Storage RCF", () => {
      if (!guardUnlocked()) return;
      if (!confirm("Vai apagar apps/settings/vault locais. Continuar?")) return;
      localStorage.removeItem(LS.settings);
      localStorage.removeItem(LS.apps);
      localStorage.removeItem(LS.activeAppId);
      localStorage.removeItem(LS.vault);
      localStorage.removeItem(LS.pendingPatch);
      alert("Storage resetado ✅ Recarregando…");
      location.reload();
    });

    const aExport = mkAdminAction("Export (JSON)", () => {
      if (!guardUnlocked()) return;
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        settings: loadSettings(),
        apps: loadApps(),
        activeAppId: getActiveAppId(),
        vault: loadVault()
      };
      downloadText("rcf-backup.json", JSON.stringify(payload, null, 2));
    });

    const aImport = mkAdminAction("Import (JSON)", async () => {
      if (!guardUnlocked()) return;
      const file = await pickFile(".json,application/json");
      if (!file) return;
      const text = await file.text();
      let data = null;
      try { data = JSON.parse(text); } catch { return alert("JSON inválido."); }
      try {
        if (data.settings) localStorage.setItem(LS.settings, JSON.stringify(data.settings));
        if (Array.isArray(data.apps)) localStorage.setItem(LS.apps, JSON.stringify(data.apps));
        if (typeof data.activeAppId === "string") localStorage.setItem(LS.activeAppId, data.activeAppId);
        if (Array.isArray(data.vault)) localStorage.setItem(LS.vault, JSON.stringify(data.vault));
      } catch (e) { return alert("Falha import: " + e.message); }
      alert("Import OK ✅ Recarregando…");
      location.reload();
    });

    actions.append(aDiag, aCache, aReset, aExport, aImport);

    const hint = document.createElement("div");
    hint.style.cssText = "opacity:.8;margin:6px 0 12px;font-size:12px;";
    hint.textContent = "Admin é para manutenção da Factory. Agent (fora do admin) é para criar apps.";

    const diagOut = document.createElement("pre");
    diagOut.style.cssText = "white-space:pre-wrap;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;min-height:120px;";

    // Absorver código (patch)
    const patchH = document.createElement("h3");
    patchH.style.margin = "14px 0 6px";
    patchH.textContent = "Absorver código (Factory patch) — com aprovação";

    const patchHint = document.createElement("div");
    patchHint.style.cssText = "opacity:.8;margin:0 0 10px;font-size:12px;";
    patchHint.textContent = "Cole um patch (JSON) ou comandos; a Factory guarda como sugestão e só aplica se você aprovar.";

    const patchBox = document.createElement("textarea");
    patchBox.rows = 6;
    patchBox.placeholder = "Cole aqui um PATCH em JSON (ex.: {\"type\":\"patch\",\"changes\":[...]} ) ou um texto de comando...";
    patchBox.style.cssText = "width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-weight:900;";

    const patchRow = document.createElement("div");
    patchRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;";

    const btnQueue = mkAdminAction("Guardar sugestão", () => {
      if (!guardUnlocked()) return;
      const text = String(patchBox.value || "").trim();
      if (!text) return alert("Nada pra guardar.");
      const p = normalizePatchFromText(text);
      setPendingPatch(p);
      patchBox.value = "";
      alert("Sugestão guardada ✅ (use Aprovar/Descartar no Agent ou Admin)");
      renderPendingBadge();
    });

    const btnApply = mkAdminAction("Aprovar patch agora", () => {
      if (!guardUnlocked()) return;
      const p = getPendingPatch();
      if (!p) return alert("Sem patch pendente.");
      const res = applyPatch(p);
      setPendingPatch(null);
      alert(res.ok ? "Patch aplicado ✅" : ("Falhou: " + res.msg));
      renderAll();
      renderPendingBadge();
    });

    const btnDiscard = mkAdminAction("Descartar patch", () => {
      if (!guardUnlocked()) return;
      setPendingPatch(null);
      alert("Patch descartado ✅");
      renderPendingBadge();
    });

    patchRow.append(btnQueue, btnApply, btnDiscard);

    body.append(pinRow, h3, actions, hint, diagOut, patchH, patchHint, patchBox, patchRow);
    modal.append(header, body);
    document.body.appendChild(modal);

    renderAdminStateModal();
  }

  function adminBtnCss() {
    return "padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font-weight:900;";
  }

  function mkAdminAction(label, fn) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = adminBtnCss();
    b.onclick = () => {
      try { fn(); } catch (e) { alert("Erro: " + (e?.message || e)); logError(e); }
    };
    return b;
  }

  function renderAdminStateModal() {
    const st = $("rcf-admin-state");
    if (!st) return;
    st.textContent = isUnlocked() ? "UNLOCK ✅" : "LOCKED 🔒";
  }

  function openAdminModal() {
    ensureAdminModal();
    const modal = $("rcf-admin-modal");
    if (modal) modal.style.display = "block";
    renderAdminStateModal();
  }
  function closeAdminModal() {
    const modal = $("rcf-admin-modal");
    if (modal) modal.style.display = "none";
  }

  // ===================== AGENT (fora do Admin) =====================
  function ensureAgentModal() {
    if (document.getElementById("rcf-agent-modal")) return;

    const modal = document.createElement("div");
    modal.id = "rcf-agent-modal";
    modal.style.cssText = `
      position:fixed; inset:12px; z-index:100000;
      display:none; border-radius:16px;
      background:rgba(10,10,10,.92);
      border:1px solid rgba(255,255,255,.14);
      color:#fff; font-family:-apple-system,system-ui,Segoe UI,Roboto,Arial;
      overflow:auto;
    `;

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,.10);";

    const title = document.createElement("div");
    title.innerHTML = "<strong>AGENT • Criador de Apps</strong> <span id='rcf-pending-badge' style='margin-left:8px;opacity:.8;font-size:12px'></span>";

    const btnClose = document.createElement("button");
    btnClose.textContent = "Fechar";
    btnClose.style.cssText = adminBtnCss();
    btnClose.onclick = () => closeAgentModal();

    header.append(title, btnClose);

    const body = document.createElement("div");
    body.style.cssText = "padding:12px;";

    const hint = document.createElement("div");
    hint.style.cssText = "opacity:.85;margin-bottom:10px;font-size:12px;";
    hint.innerHTML =
      `Comandos rápidos: <code>help</code> • <code>list</code> • <code>create RQuotas rquotas</code> • <code>select rquotas</code> •
       <code>open editor</code> • <code>set file app.js</code> • <code>write</code> • <code>inject asset</code>`;

    const cmd = document.createElement("textarea");
    cmd.id = "rcf-agent-cmd";
    cmd.rows = 4;
    cmd.placeholder = "Digite um comando… (ex: create AgroControl agrocontrol)";
    cmd.style.cssText = "width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-weight:900;";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;";

    const runBtn = mkAdminAction("Executar", () => {
      const text = String(cmd.value || "").trim();
      const out = runAgent(text);
      outBox.textContent = (outBox.textContent ? outBox.textContent + "\n\n" : "") + out;
      cmd.value = "";
      renderAll();
    });

    const clearBtn = mkAdminAction("Limpar", () => { outBox.textContent = ""; });

    const approveBtn = mkAdminAction("Aprovar sugestão", () => {
      const p = getPendingPatch();
      if (!p) return alert("Sem sugestão pendente.");
      const res = applyPatch(p);
      setPendingPatch(null);
      alert(res.ok ? "Sugestão aplicada ✅" : ("Falhou: " + res.msg));
      renderAll();
      renderPendingBadge();
    });

    const discardBtn = mkAdminAction("Descartar sugestão", () => {
      setPendingPatch(null);
      alert("Sugestão descartada ✅");
      renderPendingBadge();
    });

    const uploadBtn = mkAdminAction("Upload arquivo", async () => {
      const file = await pickFile("*/*");
      if (!file) return;
      const item = await fileToVaultItem(file);
      const v = loadVault();
      v.unshift(item);
      saveVault(v);
      alert("Arquivo guardado no Vault ✅");
      renderVaultList(vaultBox);
    });

    row.append(runBtn, clearBtn, approveBtn, discardBtn, uploadBtn);

    const outBox = document.createElement("pre");
    outBox.id = "rcf-agent-out";
    outBox.style.cssText = "white-space:pre-wrap;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;min-height:140px;margin-top:10px;";

    const vaultTitle = document.createElement("h3");
    vaultTitle.style.margin = "14px 0 6px";
    vaultTitle.textContent = "Vault (arquivos guardados)";

    const vaultHint = document.createElement("div");
    vaultHint.style.cssText = "opacity:.8;margin:0 0 10px;font-size:12px;";
    vaultHint.textContent = "Você pode guardar PDF/foto e depois injetar no app ativo como asset.";

    const vaultBox = document.createElement("div");
    vaultBox.id = "rcf-vault-box";
    vaultBox.style.cssText = "display:flex;flex-direction:column;gap:8px;";

    body.append(hint, cmd, row, outBox, vaultTitle, vaultHint, vaultBox);
    modal.append(header, body);
    document.body.appendChild(modal);

    renderPendingBadge();
    renderVaultList(vaultBox);
  }

  function renderPendingBadge() {
    const el = document.getElementById("rcf-pending-badge");
    if (!el) return;
    const p = getPendingPatch();
    el.textContent = p ? "• sugestão pendente ✅" : "";
  }

  function renderVaultList(root) {
    if (!root) return;
    const v = loadVault();
    root.innerHTML = "";
    if (!v.length) {
      root.innerHTML = `<div style="opacity:.75;font-size:12px;">Nenhum arquivo no Vault.</div>`;
      return;
    }

    v.slice(0, 12).forEach((it) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.04)";

      const meta = document.createElement("div");
      meta.style.cssText = "flex:1 1 auto;min-width:200px;";
      meta.innerHTML = `<strong>${escapeHtml(it.name || "arquivo")}</strong><div style="opacity:.75;font-size:12px;">${escapeHtml(it.type || "unknown")} • ${escapeHtml(String(Math.round((it.size||0)/1024)))} KB</div>`;

      const btnDL = mkAdminAction("Baixar", () => {
        downloadDataUrl(it.name || "file", it.dataUrl || "");
      });

      const btnInject = mkAdminAction("Injetar no app ativo", () => {
        const app = pickAppById(activeAppId);
        if (!app) return alert("Nenhum app ativo.");
        app.assets = app.assets || {};
        const safeName = String(it.name || "file").replace(/[^\w.\-]+/g, "_");
        const path = `assets/${safeName}`;
        app.assets[path] = it.dataUrl;
        saveApps();
        alert(`Asset injetado ✅ em ${path}\nAgora você pode referenciar no index.html (ex: <img src="${path}">).`);
      });

      const btnDel = mkAdminAction("Apagar", () => {
        const ok = confirm("Apagar do Vault?");
        if (!ok) return;
        const v2 = loadVault().filter(x => x && x.id !== it.id);
        saveVault(v2);
        renderVaultList(root);
      });

      row.append(meta, btnDL, btnInject, btnDel);

      // preview rápido (imagem)
      if (String(it.type || "").startsWith("image/") && it.dataUrl) {
        const img = document.createElement("img");
        img.src = it.dataUrl;
        img.alt = it.name || "img";
        img.style.cssText = "max-width:100%;border-radius:10px;border:1px solid rgba(255,255,255,.12);margin-top:8px;";
        const wrap = document.createElement("div");
        wrap.style.cssText = "width:100%";
        wrap.appendChild(img);
        root.appendChild(row);
        root.appendChild(wrap);
      } else {
        root.appendChild(row);
      }
    });
  }

  function openAgentModal() {
    ensureAgentModal();
    const modal = $("rcf-agent-modal");
    if (modal) modal.style.display = "block";
    renderPendingBadge();
    const box = document.getElementById("rcf-vault-box");
    renderVaultList(box);
  }
  function closeAgentModal() {
    const modal = $("rcf-agent-modal");
    if (modal) modal.style.display = "none";
  }

  // ===================== Agent engine (local / offline) =====================
  function runAgent(text) {
    try {
      if (!text) return "Nada para executar.";
      const t = text.trim();

      // Se existir um engine externo (modular), usa ele.
      const ext = window.RCF?.engine?.run;
      const templates = window.RCF?.templates;
      if (typeof ext === "function" && templates) {
        return String(ext(t, templates));
      }

      // Engine local simples (comandos principais)
      const parts = t.split(/\s+/);
      const cmd = (parts[0] || "").toLowerCase();

      if (cmd === "help") {
        return [
          "COMANDOS (Agent):",
          "- list",
          "- create <Nome> <id> [templateId]",
          "- select <id>",
          "- status",
          "- open <dashboard|newapp|editor|generator|settings|admin>",
          "- set file <nomeArquivo>   (ex: set file app.js)",
          "- write  (cola texto grande na próxima execução: use 'patch json' ao invés)",
          "- patch (cole JSON de patch no Admin e aprove aqui no Agent)",
          "",
          "DICA: use o botão Upload arquivo para guardar PDF/foto no Vault."
        ].join("\n");
      }

      if (cmd === "list") {
        if (!apps.length) return "Nenhum app salvo.";
        return apps.map(a => `${a.id} • ${a.name}${a.id===activeAppId?" (ativo)":""}`).join("\n");
      }

      if (cmd === "status") {
        ensureActiveApp();
        const a = pickAppById(activeAppId);
        return a ? `Ativo: ${a.name} (${a.id})` : "Sem app ativo.";
      }

      if (cmd === "create") {
        const name = parts[1] || "";
        const idRaw = parts[2] || "";
        const templateId = parts[3] || "pwa-base";
        const id = sanitizeId(idRaw);
        const errors = validateApp(name, id);
        if (errors.length) return "Erros:\n" + errors.map(e => "- " + e).join("\n");
        if (pickAppById(id)) return "Já existe um app com esse ID.";
        createApp({ name, id, type: "pwa", templateId });
        setStatus(`App criado: ${name} (${id}) ✅`);
        return `OK ✅ Criado ${name} (${id}) usando template ${templateId}`;
      }

      if (cmd === "select") {
        const id = sanitizeId(parts[1] || "");
        if (!id) return "Use: select <id>";
        const a = pickAppById(id);
        if (!a) return "Não achei esse app.";
        setActiveAppId(a.id);
        setStatus(`App ativo: ${a.name} (${a.id}) ✅`);
        renderAll();
        return `OK ✅ Selecionado ${a.name} (${a.id})`;
      }

      if (cmd === "open") {
        const tab = String(parts[1] || "").toLowerCase();
        if (!TAB_IDS.includes(tab)) return "Use: open dashboard|newapp|editor|generator|settings|admin";
        showTab(tab);
        return `OK ✅ Abriu ${tab}`;
      }

      if (cmd === "set" && (parts[1] || "").toLowerCase() === "file") {
        const f = parts.slice(2).join(" ").trim();
        if (!f) return "Use: set file <nomeArquivo>";
        currentFile = f;
        renderEditor();
        return `OK ✅ Arquivo atual: ${currentFile}`;
      }

      // qualquer texto vira "sugestão" (patch pendente) para você aprovar
      const p = normalizePatchFromText(t);
      setPendingPatch(p);
      renderPendingBadge();
      return "Entendi como SUGESTÃO ✅\nGuardei como patch pendente. Use: 'Aprovar sugestão' (no Agent) ou 'Aprovar patch agora' (no Admin).";

    } catch (e) {
      logError("Agent error:", e);
      return "ERRO: " + (e?.message || e);
    }
  }

  // Patch format:
  // { type:"patch", changes:[ {op:"setFile", appId:"...", file:"index.html", content:"..."}, {op:"mergeSettings", ...}, {op:"createApp", ...} ] }
  function normalizePatchFromText(text) {
    // tenta JSON primeiro
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === "object") {
        if (obj.type === "patch" && Array.isArray(obj.changes)) return obj;
        // se for outro objeto, embrulha
        return { type: "patch", createdAt: Date.now(), note: "auto-wrap", changes: [{ op: "note", text: JSON.stringify(obj) }] };
      }
    } catch {}

    // texto normal vira note
    return { type: "patch", createdAt: Date.now(), note: "fromText", changes: [{ op: "note", text: String(text) }] };
  }

  function applyPatch(patch) {
    try {
      if (!patch || patch.type !== "patch") return { ok: false, msg: "Patch inválido." };
      const changes = Array.isArray(patch.changes) ? patch.changes : [];
      let made = 0;

      changes.forEach((c) => {
        const op = String(c?.op || "").toLowerCase();

        if (op === "createapp") {
          const name = String(c.name || "App");
          const id = sanitizeId(String(c.id || ""));
          const templateId = String(c.templateId || "pwa-base");
          if (!id || pickAppById(id)) return;
          createApp({ name, id, type: "pwa", templateId });
          made++;
          return;
        }

        if (op === "setfile") {
          const appId = sanitizeId(String(c.appId || activeAppId || ""));
          const file = String(c.file || "");
          const content = String(c.content ?? "");
          const a = pickAppById(appId);
          if (!a || !file) return;
          a.files = a.files || {};
          a.files[file] = content;
          made++;
          return;
        }

        if (op === "mergesettings") {
          const data = c.data && typeof c.data === "object" ? c.data : {};
          settings = { ...settings, ...data };
          saveSettings();
          made++;
          return;
        }

        if (op === "note") {
          // só loga
          logInfo("PATCH NOTE:", c.text || "");
          made++;
          return;
        }
      });

      saveApps();
      renderAll();
      return { ok: true, msg: `OK (${made} mudanças)` };
    } catch (e) {
      logError("applyPatch:", e);
      return { ok: false, msg: e?.message || String(e) };
    }
  }

  // ===================== File helpers =====================
  function downloadText(filename, text) {
    const blob = new Blob([String(text || "")], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadDataUrl(filename, dataUrl) {
    try {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert("Não consegui baixar no iOS. Tente abrir e salvar manualmente.");
    }
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      if (accept) input.accept = accept;
      input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }

  async function fileToVaultItem(file) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      id: "v_" + Math.random().toString(16).slice(2) + "_" + Date.now(),
      name: file.name || "file",
      type: file.type || "application/octet-stream",
      size: file.size || 0,
      addedAt: Date.now(),
      dataUrl
    };
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("Falha ao ler arquivo."));
      fr.readAsDataURL(file);
    });
  }

  // ===================== Wire Events (tabs) =====================
  function wireTabs() {
    qsa(".tab").forEach((b) => {
      b.addEventListener("click", () => {
        const t = b.dataset.tab;
        if (t) showTab(t);
      });
    });

    $("goNewApp")?.addEventListener("click", () => showTab("newapp"));
    $("goEditor")?.addEventListener("click", () => showTab("editor"));
    $("goGenerator")?.addEventListener("click", () => showTab("generator"));
  }

  function wireNewApp() {
    const nameEl = $("newName");
    const idEl = $("newId");
    const valEl = $("newAppValidation");
    if (!nameEl || !idEl) return;

    function updateValidation() {
      const name = nameEl.value;
      const id = sanitizeId(idEl.value);
      const errors = validateApp(name, id);
      if (valEl) valEl.textContent = errors.length ? errors.map((e) => `- ${e}`).join("\n") : "OK ✅";
    }

    idEl.addEventListener("input", () => {
      const s = sanitizeId(idEl.value);
      if (s !== idEl.value) idEl.value = s;
      updateValidation();
    });
    nameEl.addEventListener("input", updateValidation);

    $("createAppBtn")?.addEventListener("click", () => {
      const name = (nameEl.value || "").trim();
      const id = sanitizeId(idEl.value);
      const errors = validateApp(name, id);

      if (errors.length) return alert("Corrija antes de salvar:\n\n" + errors.join("\n"));
      if (pickAppById(id)) return alert("Já existe um app com esse ID.");

      createApp({
        name,
        id,
        type: $("newType")?.value || "pwa",
        templateId: $("newTemplate")?.value || "pwa-base"
      });

      nameEl.value = "";
      idEl.value = "";
      if (valEl) valEl.textContent = "OK ✅";

      setStatus(`App criado: ${name} (${id}) ✅`);
      renderAppsList();
      renderEditor();
      renderGeneratorSelect();
      showTab("editor");
    });

    $("cancelNew")?.addEventListener("click", () => showTab("dashboard"));
  }

  function wireEditor() {
    $("saveFileBtn")?.addEventListener("click", () => {
      const app = pickAppById(activeAppId);
      if (!app) return alert("Nenhum app ativo.");

      app.files[currentFile] = $("codeArea")?.value ?? "";
      saveApps();

      setStatus(`Salvo: ${currentFile} ✅`);
      renderEditor();
    });

    $("resetFileBtn")?.addEventListener("click", () => {
      const app = pickAppById(activeAppId);
      if (!app) return alert("Nenhum app ativo.");

      if (!confirm(`Resetar ${currentFile} para o padrão do template?`)) return;

      app.files[currentFile] = app.baseFiles?.[currentFile] ?? "";
      saveApps();

      setStatus(`Reset: ${currentFile} ✅`);
      renderEditor();
    });

    $("openPreviewBtn")?.addEventListener("click", () => {
      const app = pickAppById(activeAppId);
      if (!app) return;
      refreshPreview(app);
      setStatus("Preview atualizado ✅");
    });
  }

  function wireGenerator() {
    $("genAppSelect")?.addEventListener("change", () => {
      setActiveAppId($("genAppSelect").value);
      renderAppsList();
      renderEditor();
    });

    $("downloadZipBtn")?.addEventListener("click", async () => {
      const app = pickAppById($("genAppSelect")?.value || activeAppId);
      if (!app) return alert("Selecione um app.");

      setGenStatus("Status: gerando ZIP…");
      await downloadZip(app);
      setGenStatus("Status: ZIP pronto ✅");
    });

    $("publishBtn")?.addEventListener("click", async () => {
      if (!hasGitHubConfigured()) {
        alert("Configure GitHub username + token em Settings primeiro.");
        showTab("settings");
        return;
      }
      alert("Publish ainda não está ligado nesta rota. Primeiro 100% liso; depois ligamos publish.");
    });

    $("copyLinkBtn")?.addEventListener("click", async () => {
      const linkEl = $("publishedLink");
      const link = linkEl?.href || "";
      if (!link || link === location.href) return alert("Ainda não tem link.");

      try { await navigator.clipboard.writeText(link); alert("Link copiado ✅"); }
      catch { alert("Não consegui copiar. Copie manualmente:\n" + link); }
    });
  }

  function wireSettings() {
    $("saveSettingsBtn")?.addEventListener("click", () => {
      settings.ghUser = ($("ghUser")?.value || "").trim();
      settings.ghToken = ($("ghToken")?.value || "").trim();
      settings.repoPrefix = ($("repoPrefix")?.value || "rapp-").trim() || "rapp-";
      settings.pagesBase = ($("pagesBase")?.value || "").trim() || (settings.ghUser ? `https://${settings.ghUser}.github.io` : "");

      saveSettings();
      setStatus("Settings salvas ✅");
      alert("Settings salvas ✅");
    });

    $("resetFactoryBtn")?.addEventListener("click", () => {
      if (!confirm("Tem certeza? Vai apagar apps/settings/vault locais.")) return;
      localStorage.removeItem(LS.settings);
      localStorage.removeItem(LS.apps);
      localStorage.removeItem(LS.activeAppId);
      localStorage.removeItem(LS.vault);
      localStorage.removeItem(LS.pendingPatch);

      settings = loadSettings();
      apps = [];
      setActiveAppId("");

      renderAll();
      alert("Factory resetado ✅");
    });
  }

  // ===================== Admin TAB wiring (seu index tem os IDs) =====================
  function wireAdminTab() {
    $("adminUnlockBtn")?.addEventListener("click", () => {
      const pin = String($("adminPinInput")?.value || "");
      if (pin !== getPin()) return alert("PIN errado ❌");
      unlock(15);
      if ($("adminPinInput")) $("adminPinInput").value = "";
      renderAdminStateTab();
      alert("Admin UNLOCK ✅ (15min)");
    });

    $("diagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      if ($("adminOut")) $("adminOut").textContent = rep;
    });

    $("copyDiagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      try { await navigator.clipboard.writeText(rep); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Copie manualmente do campo."); }
      if ($("adminOut")) $("adminOut").textContent = rep;
    });

    $("clearPwaBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      if (!confirm("Vai limpar caches + desregistrar SW e recarregar. Continuar?")) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

    $("exportBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        settings: loadSettings(),
        apps: loadApps(),
        activeAppId: getActiveAppId(),
        vault: loadVault()
      };
      downloadText("rcf-backup.json", JSON.stringify(payload, null, 2));
    });

    $("importBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      const file = await pickFile(".json,application/json");
      if (!file) return;
      const text = await file.text();
      let data = null;
      try { data = JSON.parse(text); } catch { return alert("JSON inválido."); }
      try {
        if (data.settings) localStorage.setItem(LS.settings, JSON.stringify(data.settings));
        if (Array.isArray(data.apps)) localStorage.setItem(LS.apps, JSON.stringify(data.apps));
        if (typeof data.activeAppId === "string") localStorage.setItem(LS.activeAppId, data.activeAppId);
        if (Array.isArray(data.vault)) localStorage.setItem(LS.vault, JSON.stringify(data.vault));
      } catch (e) { return alert("Falha import: " + e.message); }
      alert("Import OK ✅ Recarregando…");
      location.reload();
    });

    $("aiRunBtn")?.addEventListener("click", () => {
      // aqui o "ai" do tab-admin vira só comando/sugestão (igual agent)
      if (!guardUnlocked()) return;
      const text = String($("aiInput")?.value || "").trim();
      const out = runAgent(text);
      if ($("aiOut")) $("aiOut").textContent = out;
      if ($("aiInput")) $("aiInput").value = "";
      renderPendingBadge();
    });

    $("aiClearBtn")?.addEventListener("click", () => {
      if ($("aiOut")) $("aiOut").textContent = "—";
      if ($("aiInput")) $("aiInput").value = "";
    });

    $("aiApplyBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      const p = getPendingPatch();
      if (!p) return alert("Sem sugestão pendente.");
      const res = applyPatch(p);
      setPendingPatch(null);
      alert(res.ok ? "Sugestão aplicada ✅" : ("Falhou: " + res.msg));
      renderAll();
      renderPendingBadge();
    });

    $("aiDiscardBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      setPendingPatch(null);
      alert("Sugestão descartada ✅");
      renderPendingBadge();
    });

    renderAdminStateTab();
  }

  // ===================== Render all =====================
  function renderAll() {
    renderTemplatesSelect();
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    renderSettings();
    renderAdminStateTab();
  }

  // ===================== Utils =====================
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ===================== Expor API pública (pra módulos/engine futuros) =====================
  function exposeApi() {
    window.RCF = window.RCF || {};
    window.RCF.factory = {
      LS,
      loadSettings, saveSettings,
      loadApps, saveApps,
      getActiveAppId, setActiveAppId,
      buildDiagnosisReport,
      nukePwaCache,
      openAdminModal,
      openAgentModal,
      applyPatch,
      getPendingPatch,
      setPendingPatch
    };
  }

  // ===================== Init =====================
  function init() {
    logInfo("RCF init…");

    // Botões flutuantes (não dependem do Tab)
    ensureFloatingDebugButtons();

    // wires + render
    wireTabs();
    wireNewApp();
    wireEditor();
    wireGenerator();
    wireSettings();
    wireAdminTab();

    renderAll();
    showTab("dashboard");

    exposeApi();

    setStatus("Pronto ✅");
    logInfo("RCF pronto ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();

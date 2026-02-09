// ===== RCF Debug Console (iPhone-friendly) =====
(function setupRCFDebugConsole(){
  const MAX = 200;
  const logs = [];

  function pushLog(level, args) {
    const time = new Date().toISOString().slice(11,19);
    const msg = args.map(a => {
      try {
        if (typeof a === "string") return a;
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }).join(" ");
    logs.push({ time, level, msg });
    while (logs.length > MAX) logs.shift();
    render();
  }

  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...a) => { orig.log(...a); pushLog("log", a); };
  console.warn = (...a) => { orig.warn(...a); pushLog("warn", a); };
  console.error = (...a) => { orig.error(...a); pushLog("error", a); };

  window.addEventListener("error", (e) => {
    pushLog("error", [e.message || "Erro", e.filename, e.lineno, e.colno]);
  });

  window.addEventListener("unhandledrejection", (e) => {
    pushLog("error", ["Promise rejeitada:", e.reason]);
  });

  function ensureUI(){
    if (document.getElementById("rcf-debug-btn")) return;

    const btn = document.createElement("button");
    btn.id = "rcf-debug-btn";
    btn.textContent = "Logs";
    btn.style.cssText = `
      position:fixed; right:12px; bottom:12px; z-index:99999;
      padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
      background:rgba(0,0,0,.55); color:white; font-weight:600;
    `;
    btn.onclick = () => {
      const p = document.getElementById("rcf-debug-panel");
      p.style.display = (p.style.display === "none") ? "block" : "none";
      render();
    };

    const panel = document.createElement("div");
    panel.id = "rcf-debug-panel";
    panel.style.display = "none";
    panel.style.cssText = `
      position:fixed; left:12px; right:12px; bottom:64px; z-index:99999;
      max-height:45vh; overflow:auto; padding:10px;
      border-radius:14px; border:1px solid rgba(255,255,255,.15);
      background:rgba(10,10,10,.92); color:#eaeaea; font:12px/1.35 -apple-system,system-ui,Segoe UI,Roboto,Arial;
      white-space:pre-wrap;
    `;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:8px; margin-bottom:8px;";
    const clear = document.createElement("button");
    clear.textContent = "Limpar";
    clear.style.cssText = "padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;";
    clear.onclick = () => { logs.length = 0; render(); };

    const copy = document.createElement("button");
    copy.textContent = "Copiar";
    copy.style.cssText = clear.style.cssText;
    copy.onclick = async () => {
      const text = logs.map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n");
      try { await navigator.clipboard.writeText(text); console.log("Logs copiados ✅"); }
      catch { console.error("Não consegui copiar (iOS às vezes bloqueia)."); }
    };

    actions.append(clear, copy);
    panel.append(actions);

    const body = document.createElement("div");
    body.id = "rcf-debug-body";
    panel.append(body);

    document.body.append(btn, panel);
  }

  function render(){
    const body = document.getElementById("rcf-debug-body");
    if (!body) return;
    body.textContent = logs.map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n");
  }

  // garante UI quando DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { ensureUI(); render(); });
  } else {
    ensureUI(); render();
  }
})();
import { callOpenAI } from "./js/ai.js";
import { routes } from "./js/router.js";
import { templates } from "./js/templates.js";
/* RControl Factory v2 - Offline, Editor, ZIP, Publish (GitHub Pages)
   Sem build. Tudo roda no browser.
*/

const LS_KEYS = {
  settings: "rcf_settings_v2",
  apps: "rcf_apps_v2",
  activeAppId: "rcf_active_app_id_v2",
};

const DEFAULT_SETTINGS = {openaiKey: "",
openaiModel: "gpt-4.1",}
  ghUser: "",
  ghToken: "",
  repoPrefix: "rapp-",
  pagesBase: "", // ex: https://SEUUSER.github.io
};

const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];

// Templates
function getTemplates() {
  return [
    {
      id: "pwa-base",
      name: "PWA Base (com app.js + styles.css)",
      files: makePwaBaseTemplateFiles(),
    },
    {
      id: "pwa-empty",
      name: "PWA Vazia (minimal)",
      files: makePwaEmptyTemplateFiles(),
    },
  ];
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

btn.addEventListener("click", () => {
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

  return {
    "index.html": index,
    "app.js": appjs,
    "styles.css": css,
    "manifest.json": manifest,
    "sw.js": sw,
  };
}

function makePwaEmptyTemplateFiles() {
  return {
    "index.html": `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{{APP_NAME}}</title></head><body><h1>{{APP_NAME}}</h1><p>ID: {{APP_ID}}</p></body></html>`,
    "app.js": `// {{APP_NAME}}`,
    "styles.css": `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}`,
    "manifest.json": `{"name":"{{APP_NAME}}","short_name":"{{APP_NAME}}","start_url":"./","display":"standalone","background_color":"#0b1220","theme_color":"#0b1220","icons":[]}`,
    "sw.js": `self.addEventListener("fetch",()=>{});`,
  };
}

// ---------- State ----------
function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(LS_KEYS.settings)) || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(s) {
  localStorage.setItem(LS_KEYS.settings, JSON.stringify(s));
}
function loadApps() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.apps)) || [];
  } catch {
    return [];
  }
}
function saveApps(apps) {
  localStorage.setItem(LS_KEYS.apps, JSON.stringify(apps));
}
function setActiveAppId(id) {
  localStorage.setItem(LS_KEYS.activeAppId, id);
}
function getActiveAppId() {
  return localStorage.getItem(LS_KEYS.activeAppId) || "";
}

let settings = loadSettings();
let apps = loadApps();
let activeAppId = getActiveAppId();

let currentFile = "index.html";

// ---------- UI Helpers ----------
const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  $("statusBox").textContent = msg;
}
function log(msg) {
  const el = $("logs");
  const t = new Date().toLocaleTimeString();
  el.textContent += `[${t}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}
function clearLogs() {
  $("logs").textContent = "";
}

function showTab(tab) {
  const tabs = ["dashboard", "newapp", "editor", "generator", "settings"];
  tabs.forEach((t) => {
    $(`tab-${t}`).classList.toggle("hidden", t !== tab);
  });
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
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

// ---------- App CRUD ----------
function pickAppById(id) {
  return apps.find((a) => a.id === id) || null;
}
function ensureActiveApp() {
  if (activeAppId && pickAppById(activeAppId)) return;
  if (apps.length) {
    activeAppId = apps[0].id;
    setActiveAppId(activeAppId);
  } else {
    activeAppId = "";
    setActiveAppId("");
  }
}

function applyVars(text, app) {
  return String(text)
    .replaceAll("{{APP_NAME}}", app.name)
    .replaceAll("{{APP_ID}}", app.id);
}

function createApp({ name, id, type, templateId }) {
  const tpl = getTemplates().find((t) => t.id === templateId) || getTemplates()[0];
  const files = {};
  for (const k of Object.keys(tpl.files)) {
    files[k] = applyVars(tpl.files[k], { name, id });
  }
  const app = {
    name,
    id,
    type,
    templateId,
    createdAt: Date.now(),
    files,
    baseFiles: { ...files } // para reset por arquivo
  };
  apps.unshift(app);
  saveApps(apps);
  activeAppId = id;
  setActiveAppId(id);
}

// ---------- Render ----------
function renderAppsList() {
  ensureActiveApp();
  const root = $("appsList");
  root.innerHTML = "";
  if (!apps.length) {
    root.innerHTML = `<div class="muted">Nenhum app salvo ainda.</div>`;
    return;
  }

  apps.forEach((a) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${a.name}</strong>
        <div class="meta">${a.id} • ${a.type}</div>
      </div>
      <span class="badge ${a.id === activeAppId ? "on" : ""}">${a.id === activeAppId ? "ativo" : "selecionar"}</span>
    `;
    div.addEventListener("click", () => {
      activeAppId = a.id;
      setActiveAppId(a.id);
      setStatus(`App ativo: ${a.name} (${a.id}) ✅`);
      renderAppsList();
      renderEditor();
      renderGeneratorSelect();
    });
    root.appendChild(div);
  });
}

function renderTemplatesSelect() {
  const sel = $("newTemplate");
  sel.innerHTML = "";
  getTemplates().forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });
}

function renderEditor() {
  ensureActiveApp();
  const app = pickAppById(activeAppId);
  $("activeAppLabel").textContent = app ? `${app.name} (${app.id})` : "—";

  const fl = $("filesList");
  fl.innerHTML = "";
  if (!app) {
    $("codeArea").value = "";
    $("currentFileLabel").textContent = "—";
    $("previewFrame").srcdoc = "<p style='font-family:system-ui'>Sem app ativo</p>";
    return;
  }

  FILE_ORDER.forEach((f) => {
    const btn = document.createElement("button");
    btn.className = "fileBtn" + (f === currentFile ? " active" : "");
    btn.textContent = f;
    btn.addEventListener("click", () => {
      currentFile = f;
      renderEditor();
    });
    fl.appendChild(btn);
  });

  $("currentFileLabel").textContent = currentFile;
  $("codeArea").value = app.files[currentFile] ?? "";
  refreshPreview(app);
}

function refreshPreview(app) {
  const html = app.files["index.html"] || "<h1>Sem index.html</h1>";
  const css = app.files["styles.css"] || "";
  const js = app.files["app.js"] || "";

  // Inline preview (não precisa publicar)
  const doc = `
<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${css}</style>
</head>
<body>
${html}
<script>
try{
  // remove service worker em preview
  if(navigator.serviceWorker){ /* noop */ }
}catch(e){}
</script>
<script>${js}</script>
</body></html>`;

  $("previewFrame").srcdoc = doc;
}

function renderGeneratorSelect() {
  ensureActiveApp();
  const sel = $("genAppSelect");
  sel.innerHTML = "";
  apps.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.name} (${a.id})`;
    sel.appendChild(opt);
  });
  if (activeAppId) sel.value = activeAppId;

  sel.addEventListener("change", () => {
    activeAppId = sel.value;
    setActiveAppId(activeAppId);
    renderAppsList();
    renderEditor();
  });
}

function renderSettings() {
  $("ghUser").value = settings.ghUser || "";
  $("ghToken").value = settings.ghToken || "";
  $("repoPrefix").value = settings.repoPrefix || "rapp-";
  $("pagesBase").value = settings.pagesBase || (settings.ghUser ? `https://${settings.ghUser}.github.io` : "");
}

// ---------- ZIP ----------
async function downloadZip(app) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(app.files)) {
    zip.file(path, content);
  }
  // readme
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

// ---------- GitHub API ----------
function ghHeaders() {
  if (!settings.ghToken) throw new Error("Token do GitHub não configurado.");
  return {
    "Authorization": `Bearer ${settings.ghToken}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghRequest(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...ghHeaders() } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
    throw new Error(`${msg} (status ${res.status})`);
  }
  return data;
}

async function ensureRepo(owner, repo) {
  // try get repo
  try {
    await ghRequest(`https://api.github.com/repos/${owner}/${repo}`);
    log(`Repo existe: ${owner}/${repo}`);
    return;
  } catch (e) {
    log(`Repo não existe ainda. Criando...`);
  }
  // create
  const body = {
    name: repo,
    private: true,
    auto_init: true,
    description: "Gerado pelo RControl Factory",
  };
  const created = await ghRequest(`https://api.github.com/user/repos`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  log(`Repo criado: ${created.full_name}`);
}

function toBase64(str) {
  // btoa unicode safe
  return btoa(unescape(encodeURIComponent(str)));
}

async function putFile(owner, repo, path, content, message) {
  // check if exists -> get sha
  let sha = undefined;
  try {
    const existing = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`);
    sha = existing.sha;
  } catch (_) {}

  const body = {
    message,
    content: toBase64(content),
    branch: "main",
    ...(sha ? { sha } : {}),
  };

  await ghRequest(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

async function enablePages(owner, repo) {
  // Try create pages site
  // Some repos already have it -> then update
  const payload = { source: { branch: "main", path: "/" } };

  try {
    await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pages`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    log("GitHub Pages: criado ✅");
    return;
  } catch (e) {
    log(`Pages POST falhou (normal se já existir): ${e.message}`);
  }

  try {
    await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pages`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    log("GitHub Pages: atualizado ✅");
    return;
  } catch (e) {
    log(`Pages PUT falhou: ${e.message}`);
    throw e;
  }
}

async function publishApp(app) {
  clearLogs();
  $("genStatus").textContent = "Status: publicando…";
  log(`Publicando app: ${app.name} (${app.id})`);

  const owner = settings.ghUser?.trim();
  if (!owner) throw new Error("GitHub username não configurado.");
  const repoPrefix = (settings.repoPrefix || "rapp-").trim();
  const repo = `${repoPrefix}${app.id}`.replace(/\s+/g, "");

  await ensureRepo(owner, repo);

  // Upload files
  const entries = Object.entries(app.files);
  for (const [path, content] of entries) {
    $("genStatus").textContent = `Status: enviando ${path}…`;
    log(`Enviando ${path}…`);
    await putFile(owner, repo, path, content, `Publish ${app.id}: ${path}`);
  }

  // minimal README
  await putFile(owner, repo, "README.md", `# ${app.name}\n\nGerado pelo RControl Factory.\n`, `Publish ${app.id}: README`);

  // Try enable pages (requires Pages permission)
  try {
    $("genStatus").textContent = "Status: ativando GitHub Pages…";
    log("Tentando ativar Pages automaticamente…");
    await enablePages(owner, repo);
  } catch (e) {
    log("Não consegui ativar Pages via API. Se der 404: repo → Settings → Pages → main / root.");
  }

  const base = settings.pagesBase?.trim() || `https://${owner}.github.io`;
  const link = `${base}/${repo}/`;

  $("publishedLink").textContent = link;
  $("publishedLink").href = link;
  $("genStatus").textContent = "Status: publicado ✅";
  log(`Link: ${link}`);

  return link;
}

// ---------- Events ----------
function wireTabs() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
  });

  $("goNewApp").addEventListener("click", () => showTab("newapp"));
  $("goEditor").addEventListener("click", () => showTab("editor"));
  $("goGenerator").addEventListener("click", () => showTab("generator"));
}

function wireNewApp() {
  const nameEl = $("newName");
  const idEl = $("newId");

  function updateValidation() {
    const name = nameEl.value;
    const id = sanitizeId(idEl.value);
    const errors = validateApp(name, id);
    $("newAppValidation").textContent = errors.length ? errors.map(e => `- ${e}`).join("\n") : "OK ✅";
  }

  idEl.addEventListener("input", () => {
    const s = sanitizeId(idEl.value);
    if (s !== idEl.value) idEl.value = s;
    updateValidation();
  });
  nameEl.addEventListener("input", updateValidation);

  $("createAppBtn").addEventListener("click", () => {
    const name = nameEl.value.trim();
    const id = sanitizeId(idEl.value);
    const errors = validateApp(name, id);
    if (errors.length) {
      alert("Corrija antes de salvar:\n\n" + errors.join("\n"));
      return;
    }
    if (pickAppById(id)) {
      alert("Já existe um app com esse ID.");
      return;
    }
    createApp({
      name,
      id,
      type: $("newType").value,
      templateId: $("newTemplate").value,
    });

    nameEl.value = "";
    idEl.value = "";
    $("newAppValidation").textContent = "OK ✅";
    setStatus(`App criado: ${name} (${id}) ✅`);
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    showTab("editor");
  });

  $("cancelNew").addEventListener("click", () => showTab("dashboard"));
}

function wireEditor() {
  $("saveFileBtn").addEventListener("click", () => {
    const app = pickAppById(activeAppId);
    if (!app) return alert("Nenhum app ativo.");
    app.files[currentFile] = $("codeArea").value;
    saveApps(apps);
    setStatus(`Salvo: ${currentFile} ✅`);
    renderEditor();
  });

  $("resetFileBtn").addEventListener("click", () => {
    const app = pickAppById(activeAppId);
    if (!app) return alert("Nenhum app ativo.");
    if (!confirm(`Resetar ${currentFile} para o padrão do template?`)) return;
    app.files[currentFile] = app.baseFiles[currentFile] ?? "";
    saveApps(apps);
    setStatus(`Reset: ${currentFile} ✅`);
    renderEditor();
  });

  $("openPreviewBtn").addEventListener("click", () => {
    const app = pickAppById(activeAppId);
    if (!app) return;
    refreshPreview(app);
    setStatus("Preview atualizado ✅");
  });
}

function wireGenerator() {
  $("downloadZipBtn").addEventListener("click", async () => {
    const app = pickAppById($("genAppSelect").value);
    if (!app) return alert("Selecione um app.");
    await downloadZip(app);
    $("genStatus").textContent = "Status: ZIP pronto ✅";
  });

  $("publishBtn").addEventListener("click", async () => {
    const app = pickAppById($("genAppSelect").value);
    if (!app) return alert("Selecione um app.");
    try {
      const link = await publishApp(app);
      alert("Publicado ✅\n\nSe der 404 na primeira vez:\nrepo → Settings → Pages → main / root\n\nLink:\n" + link);
    } catch (e) {
      $("genStatus").textContent = "Status: erro ao publicar ❌";
      log("ERRO: " + e.message);
      alert("Erro ao publicar:\n\n" + e.message);
    }
  });

  $("copyLinkBtn").addEventListener("click", async () => {
    const link = $("publishedLink").href;
    if (!link || link === location.href) return alert("Ainda não tem link.");
    try {
      await navigator.clipboard.writeText(link);
      alert("Link copiado ✅");
    } catch {
      alert("Não consegui copiar. Copie manualmente:\n" + link);
    }
  });
}

function wireSettings() {
  $("saveSettingsBtn").addEventListener("click", () => {
    settings.ghUser = $("ghUser").value.trim();
    settings.ghToken = $("ghToken").value.trim();
    settings.repoPrefix = $("repoPrefix").value.trim() || "rapp-";
    settings.pagesBase = $("pagesBase").value.trim() || (settings.ghUser ? `https://${settings.ghUser}.github.io` : "");
    saveSettings(settings);
    setStatus("Settings salvas ✅");
    alert("Settings salvas ✅");
  });

  $("resetFactoryBtn").addEventListener("click", () => {
    if (!confirm("Tem certeza? Vai apagar apps e settings locais.")) return;
    localStorage.removeItem(LS_KEYS.settings);
    localStorage.removeItem(LS_KEYS.apps);
    localStorage.removeItem(LS_KEYS.activeAppId);
    settings = loadSettings();
    apps = [];
    activeAppId = "";
    renderAll();
    alert("Factory resetado ✅");
  });
}

function renderAll() {
  renderTemplatesSelect();
  renderAppsList();
  renderEditor();
  renderGeneratorSelect();
  renderSettings();
}

// ---------- Init ----------
function init() {
  wireTabs();
  wireNewApp();
  wireEditor();
  wireGenerator();
  wireSettings();

  renderAll();
  showTab("dashboard");
  setStatus("Pronto ✅");
}

init();
window.__rcf_ai_test = async function () {
  const s = loadSettings(); // usa sua função existente de settings
  const prompt = "Crie um arquivo index.html simples com um botão e um contador.";
  const text = await callOpenAI({
    apiKey: s.openaiKey,
    model: s.openaiModel,
    prompt,
  });
  console.log("AI RESULT:\n", text);
  return text;
};
// ===== OpenAI Test Button (NO CONSOLE, NO F12) =====
async function testOpenAIFromUI() {
  try {
    const settings = loadSettings();

    if (!settings.openaiKey) {
      alert("❌ OpenAI Key não configurada em Settings");
      return;
    }

    const result = await callOpenAI({
      apiKey: settings.openaiKey,
      model: settings.openaiModel || "gpt-4.1",
      prompt: "Crie um index.html simples com um botão e um contador em JavaScript."
    });

    alert("✅ OpenAI respondeu! Veja o resultado na tela.");
    showAITestResult(result);

  } catch (err) {
    alert("❌ Erro na OpenAI: " + err.message);
  }
}

function showAITestResult(text) {
  let box = document.getElementById("ai-test-result");
  if (!box) {
    box = document.createElement("pre");
    box.id = "ai-test-result";
    box.style.whiteSpace = "pre-wrap";
    box.style.background = "#0b1220";
    box.style.color = "#9ef0c3";
    box.style.padding = "12px";
    box.style.borderRadius = "8px";
    box.style.marginTop = "12px";
    document.body.appendChild(box);
  }
  box.textContent = text;
}
/* =========================================================
   RControl Factory - AI Engine v0 (offline, grátis)
   - Painel flutuante no Editor
   - Aplica comandos no app ativo (index.html / app.js / styles.css)
   ========================================================= */

(function () {
  // --------- util ----------
  const safeJsonParse = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  function _getLSKeys() {
    // tenta reaproveitar LS_KEYS se existir
    if (typeof LS_KEYS !== "undefined") return LS_KEYS;
    // fallback (caso seu arquivo mude)
    return {
      settings: "rcf_settings_v2",
      apps: "rcf_apps_v2",
      activeAppId: "rcf_active_app_id_v2",
    };
  }

  function _loadAppsState() {
    const K = _getLSKeys();
    const apps = safeJsonParse(localStorage.getItem(K.apps) || "[]", []);
    const activeId = localStorage.getItem(K.activeAppId) || "";
    return { K, apps, activeId };
  }

  function _saveAppsState(apps) {
    const K = _getLSKeys();
    localStorage.setItem(K.apps, JSON.stringify(apps));
  }

  function _findActiveApp() {
    const { apps, activeId } = _loadAppsState();
    if (!activeId) return null;
    const idx = apps.findIndex(a => a && a.id === activeId);
    if (idx < 0) return null;
    return { apps, idx, app: apps[idx] };
  }

  function _ensureFilesMap(app) {
    // suportar modelos diferentes
    // esperado: app.files = { "index.html": "...", "app.js": "...", ... }
    if (!app.files || typeof app.files !== "object") app.files = {};
    return app.files;
  }

  function _inferTarget(cmd, payload) {
    const c = (cmd || "").trim().toLowerCase();

    // Se usuário explicitou tipo:
    // "html: <div>..." | "css: ..." | "js: ..."
    if (c.startsWith("html:")) return { file: "index.html", mode: "inject_html", data: cmd.slice(5).trim() };
    if (c.startsWith("css:"))  return { file: "styles.css", mode: "append",     data: cmd.slice(4).trim() };
    if (c.startsWith("js:"))   return { file: "app.js",     mode: "append",     data: cmd.slice(3).trim() };

    // Heurística por “cara” do conteúdo
    const p = (payload || "").trim();
    if (p.startsWith("<") || c.includes("html") || c.includes("div") || c.includes("button")) {
      return { file: "index.html", mode: "inject_html", data: payload };
    }
    if (c.includes("css") || p.includes("{") && p.includes("}") && (p.includes(":") || p.includes(";"))) {
      return { file: "styles.css", mode: "append", data: payload };
    }
    return { file: "app.js", mode: "append", data: payload };
  }

  function _injectHtmlAtEnd(html, snippet) {
    const s = snippet || "";
    if (!s.trim()) return html;

    // injeta antes do </body> se existir, senão no fim
    const tag = /<\/body\s*>/i;
    if (tag.test(html)) return html.replace(tag, `${s}\n</body>`);
    return `${html}\n${s}\n`;
  }

  function _appendWithSpacer(text, snippet) {
    const s = (snippet || "").trim();
    if (!s) return text;
    const t = text || "";
    return `${t}\n\n/* --- rcf_ai_append --- */\n${s}\n`;
  }

  // --------- templates de comandos (v0) ----------
  function _templateFromCommand(cmdRaw) {
    const cmd = (cmdRaw || "").trim();
    const c = cmd.toLowerCase();

    // 1) add button <texto>
    // ex: "add button Salvar"
    if (c.startsWith("add button ")) {
      const label = cmd.slice("add button ".length).trim() || "Clique aqui";
      const id = "btn_" + Math.random().toString(16).slice(2, 8);

      const html = `<button id="${id}" class="rcf-btn">${label}</button>`;
      const css = `.rcf-btn{padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(0,200,120,.18);color:#eafff6;font-weight:700}`;
      const js  = `document.getElementById("${id}")?.addEventListener("click", ()=>{ alert("OK: ${label}"); });`;

      return [
        { file: "index.html", mode: "inject_html", data: html },
        { file: "styles.css", mode: "append", data: css },
        { file: "app.js", mode: "append", data: js },
      ];
    }

    // 2) add input <placeholder>
    if (c.startsWith("add input ")) {
      const ph = cmd.slice("add input ".length).trim() || "Digite...";
      const id = "inp_" + Math.random().toString(16).slice(2, 8);
      const html = `<input id="${id}" class="rcf-input" placeholder="${ph}" />`;
      const css = `.rcf-input{width:100%;max-width:420px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:#fff;outline:none}`;
      return [
        { file: "index.html", mode: "inject_html", data: html },
        { file: "styles.css", mode: "append", data: css },
      ];
    }

    // 3) fallback: se não bater template, trata como "js:" por padrão
    // (você pode mandar "html:" ou "css:" pra forçar)
    return null;
  }

  // --------- engine principal ----------
  function rcf_ai_applyCommand(cmdRaw) {
    const active = _findActiveApp();
    if (!active) {
      return { ok: false, error: "Sem app ativo. Vá em New App e selecione/crie um app." };
    }

    const { apps, idx, app } = active;
    const files = _ensureFilesMap(app);

    const cmd = (cmdRaw || "").trim();
    if (!cmd) return { ok: false, error: "Comando vazio." };

    // tenta template
    const templ = _templateFromCommand(cmd);
    const patches = templ ? templ : [ _inferTarget(cmd, cmd) ];

    // aplica patches
    for (const p of patches) {
      const file = p.file;
      const mode = p.mode;
      const data = p.data || "";

      const current = files[file] || "";

      if (file === "index.html" && mode === "inject_html") {
        files[file] = _injectHtmlAtEnd(current, data);
      } else {
        files[file] = _appendWithSpacer(current, data);
      }
    }

    apps[idx] = app;
    _saveAppsState(apps);

    return { ok: true, patches: patches.map(p => ({ file: p.file, mode: p.mode })) };
  }

  // --------- UI flutuante (não precisa mexer no HTML) ----------
  function rcf_ai_mountPanel() {
    // evita duplicar
    if (document.getElementById("rcf-ai-panel")) return;

    const panel = document.createElement("div");
    panel.id = "rcf-ai-panel";
    panel.style.cssText = `
      position: fixed;
      right: 14px;
      bottom: 14px;
      z-index: 99999;
      width: min(420px, calc(100vw - 28px));
      background: rgba(10,14,20,.92);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,.45);
      backdrop-filter: blur(10px);
      color: #eaf2ff;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <div style="font-weight:800">AI Engine (offline)</div>
        <button id="rcf-ai-close" style="border:none;background:transparent;color:#9fb3c8;font-weight:800;font-size:16px;">✕</button>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <span style="font-size:12px;opacity:.8">Comandos:</span>
        <code style="font-size:12px;opacity:.9">add button Salvar</code>
        <code style="font-size:12px;opacity:.9">html:&lt;div&gt;...&lt;/div&gt;</code>
        <code style="font-size:12px;opacity:.9">css: .x{...}</code>
        <code style="font-size:12px;opacity:.9">js: console.log(...)</code>
      </div>

      <textarea id="rcf-ai-cmd" rows="3" placeholder="Digite o comando aqui..." 
        style="width:100%;resize:none;border-radius:12px;border:1px solid rgba(255,255,255,.12);
               background:rgba(0,0,0,.25);color:#fff;padding:10px 12px;outline:none;"></textarea>

      <div style="display:flex;gap:10px;margin-top:10px;">
        <button id="rcf-ai-run" style="
          flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);
          background:rgba(0,200,120,.18);color:#eafff6;font-weight:900;">
          Aplicar no app ativo
        </button>
        <button id="rcf-ai-help" style="
          padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);
          background:rgba(255,255,255,.06);color:#eaf2ff;font-weight:800;">
          ?
        </button>
      </div>

      <div id="rcf-ai-out" style="margin-top:10px;font-size:12px;opacity:.9"></div>
    `;

    document.body.appendChild(panel);

    const out = panel.querySelector("#rcf-ai-out");
    const ta = panel.querySelector("#rcf-ai-cmd");

    panel.querySelector("#rcf-ai-close").onclick = () => panel.remove();

    panel.querySelector("#rcf-ai-help").onclick = () => {
      out.textContent =
        "Dica: use 'add button Texto' pra testar. Se quiser forçar arquivo: 'html:' / 'css:' / 'js:'.";
    };

    panel.querySelector("#rcf-ai-run").onclick = () => {
      const cmd = ta.value.trim();
      const res = rcf_ai_applyCommand(cmd);
      if (!res.ok) {
        out.textContent = "❌ " + res.error;
        return;
      }
      out.textContent = "✅ Aplicado: " + res.patches.map(p => p.file).join(", ")
        + " | Agora vá em Editor e clique em Preview/Salvar arquivo se necessário.";
      ta.value = "";
    };

    out.textContent = "Pronto. Crie/seleciona um app e rode um comando.";
  }

  // deixa disponível global (pra debug)
  window.__rcf_ai_apply = rcf_ai_applyCommand;
  window.__rcf_ai_panel = rcf_ai_mountPanel;

  // monta sozinho quando a página carregar
  window.addEventListener("load", () => {
    try { rcf_ai_mountPanel(); } catch {}
  });
})();
// FORÇAR ABERTURA DO PAINEL AI (Safari/PWA fix)
setTimeout(() => {
  if (window.__rcf_ai_panel) {
    window.__rcf_ai_panel();
    console.log("AI Engine montada manualmente");
  } else {
    console.log("AI Engine não encontrada");
  }
}, 800);

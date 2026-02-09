/* RControl Factory v2 - Offline, Editor, ZIP, Publish (GitHub Pages)
   Sem build. Tudo roda no browser.
*/

const LS_KEYS = {
  settings: "rcf_settings_v2",
  apps: "rcf_apps_v2",
  activeAppId: "rcf_active_app_id_v2",
};

const DEFAULT_SETTINGS = {
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

import { navigate } from "./router.js";

/** STORAGE **/
const KEY_APPS = "rcf_apps_v1";
const KEY_SETTINGS = "rcf_settings_v1";

function loadApps() {
  try { return JSON.parse(localStorage.getItem(KEY_APPS) || "[]"); }
  catch { return []; }
}
function saveApps(apps) {
  localStorage.setItem(KEY_APPS, JSON.stringify(apps));
}
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY_SETTINGS) || "{}");
  } catch {
    return {};
  }
}
function saveSettings(s) {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
}

function nowId() {
  return Date.now().toString(36);
}

function normalizeAppId(id) {
  return (id || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function validateAppId(id) {
  if (!id) return "ID vazio.";
  if (id !== id.toLowerCase()) return "Não pode ter letra maiúscula.";
  if (!/^[a-z0-9-]+$/.test(id)) return "Use só letras minúsculas, números e hífen.";
  return "";
}

/** UI HELPERS **/
function setStatus(text) {
  const el = document.getElementById("genStatus");
  if (el) el.innerHTML = `<b>Status:</b> ${text}`;
}

function showPublishLink(url) {
  const wrap = document.getElementById("publishResult");
  const p = document.getElementById("publishLinkWrap");
  if (!wrap || !p) return;
  wrap.style.display = "block";
  p.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Abrir app publicado</a><br/><small>${url}</small>`;
}

/** CLICK ROUTING **/
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-route]");
  if (!btn) return;
  const route = btn.getAttribute("data-route");
  navigate(route);
});

/** HOME: LIST **/
function renderAppsList() {
  const list = document.getElementById("appsList");
  if (!list) return;

  const apps = loadApps();
  if (!apps.length) {
    list.innerHTML = `<div class="empty">Nenhum app salvo ainda.</div>`;
    return;
  }

  list.innerHTML = apps
    .slice()
    .reverse()
    .map(a => `
      <button class="list-item" data-open-app="${a.id}">
        <div class="title">${a.name}</div>
        <div class="sub">${a.id} • ${a.type}</div>
      </button>
    `).join("");

  list.querySelectorAll("[data-open-app]").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-open-app");
      navigate("generator", { selectedId: id });
    });
  });
}

/** NEW APP FORM **/
function wireNewAppForm() {
  const form = document.getElementById("newAppForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const name = (fd.get("name") || "").toString().trim();
    const rawId = (fd.get("id") || "").toString();
    const type = (fd.get("type") || "pwa").toString();

    const id = normalizeAppId(rawId);
    const err = validateAppId(id);
    if (!name) return alert("Nome do app é obrigatório.");
    if (err) return alert(err);

    const apps = loadApps();
    const exists = apps.some(a => a.id === id);
    if (exists) return alert("Esse ID já existe. Use outro.");

    apps.push({ name, id, type, createdAt: Date.now() });
    saveApps(apps);

    alert("App salvo! Agora vá em Generator para baixar ZIP ou publicar.");
    navigate("home");
  });
}

/** SETTINGS **/
function wireSettingsForm() {
  const form = document.getElementById("settingsForm");
  if (!form) return;

  const s = loadSettings();
  form.ghUser.value = s.ghUser || "";
  form.ghToken.value = s.ghToken || "";
  form.repoPrefix.value = s.repoPrefix || "rapp-";

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const ghUser = (fd.get("ghUser") || "").toString().trim();
    const ghToken = (fd.get("ghToken") || "").toString().trim();
    const repoPrefix = (fd.get("repoPrefix") || "rapp-").toString().trim();

    saveSettings({ ghUser, ghToken, repoPrefix });
    alert("Settings salvas!");
    navigate("home");
  });
}

/** GENERATOR **/
function fillGenSelect(selectedId) {
  const sel = document.getElementById("genSelect");
  if (!sel) return;

  const apps = loadApps();
  sel.innerHTML = apps.map(a => `<option value="${a.id}">${a.name} (${a.id})</option>`).join("");

  if (!apps.length) {
    sel.innerHTML = `<option value="">(Nenhum app salvo)</option>`;
    return;
  }

  sel.value = selectedId && apps.some(a => a.id === selectedId) ? selectedId : apps[0].id;
}

function getSelectedApp() {
  const sel = document.getElementById("genSelect");
  const id = sel?.value;
  const apps = loadApps();
  return apps.find(a => a.id === id);
}

/** ZIP (só estrutura simples agora) **/
async function downloadZip(app) {
  // zip “mínimo” com index.html + manifest + sw (pra provar o fluxo)
  // (A gente melhora o template depois pra virar seu “starter” de verdade)
  const files = buildAppFiles(app);

  // ZIP sem lib externa: vamos mandar como “download de arquivos” simples por enquanto
  // Se você quiser ZIP real, eu adiciono JSZip (fica top).
  const blob = new Blob([JSON.stringify(files, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${app.id}.files.json`; // por enquanto JSON (rápido e sem dependência)
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Build dos arquivos do app gerado **/
function buildAppFiles(app) {
  const appName = app.name;
  const theme = "#0b1220";

  const indexHtml = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="theme-color" content="${theme}" />
  <title>${appName}</title>
  <link rel="manifest" href="./manifest.json" />
  <style>
    body{font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial; margin:0; background:#0b1220; color:#e5e7eb;}
    header{padding:16px; border-bottom:1px solid rgba(255,255,255,.08);}
    main{padding:16px;}
    .card{background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:16px;}
  </style>
</head>
<body>
  <header>
    <b>${appName}</b>
    <div style="opacity:.7;font-size:12px">Gerado pelo RControl Factory</div>
  </header>
  <main>
    <div class="card">
      <h2 style="margin:0 0 8px 0;">App rodando ✅</h2>
      <p style="margin:0;">ID: <b>${app.id}</b> • Tipo: <b>${app.type}</b></p>
    </div>
  </main>

  <script>
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    }
  </script>
</body>
</html>`;

  const manifest = {
    name: appName,
    short_name: appName,
    start_url: "./",
    display: "standalone",
    background_color: theme,
    theme_color: theme,
    icons: []
  };

  const sw = `self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("app-cache-v1").then(cache => cache.addAll(["./","./index.html","./manifest.json"])));
});
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});`;

  return {
    "index.html": indexHtml,
    "manifest.json": JSON.stringify(manifest, null, 2),
    "sw.js": sw
  };
}

/** GITHUB PUBLISH (cria repo e envia index.html / manifest.json / sw.js) **/
async function publishToGitHub(app) {
  const s = loadSettings();
  if (!s.ghUser || !s.ghToken) {
    alert("Vá em Settings e preencha GitHub username e Token.");
    navigate("settings");
    return;
  }

  const repoName = `${s.repoPrefix || "rapp-"}${app.id}`;
  const apiBase = "https://api.github.com";

  const headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${s.ghToken}`
  };

  setStatus(`Criando/checando repo "${repoName}"...`);

  // 1) criar repo (se já existir, ignora erro)
  await fetch(`${apiBase}/user/repos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: repoName,
      private: false,
      auto_init: false,
      description: `App gerado pelo RControl Factory (${app.id})`
    })
  }).catch(()=>{});

  // 2) subir arquivos via Contents API no branch main
  const files = buildAppFiles(app);

  for (const [path, content] of Object.entries(files)) {
    setStatus(`Enviando ${path}...`);

    // pegar sha se existir (update)
    const getResp = await fetch(`${apiBase}/repos/${s.ghUser}/${repoName}/contents/${encodeURIComponent(path)}`, { headers });
    let sha = null;
    if (getResp.ok) {
      const j = await getResp.json();
      sha = j.sha;
    }

    const putBody = {
      message: `build: ${app.id} (${path})`,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: "main",
      ...(sha ? { sha } : {})
    };

    const putResp = await fetch(`${apiBase}/repos/${s.ghUser}/${repoName}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(putBody)
    });

    if (!putResp.ok) {
      const t = await putResp.text();
      throw new Error(`Falha ao enviar ${path}: ${t}`);
    }
  }

  setStatus("Arquivos enviados ✅");

  // Link padrão do Pages (pode precisar habilitar 1x no repo)
  const url = `https://${s.ghUser}.github.io/${repoName}/`;

  setStatus("Agora: se for a primeira vez, habilite GitHub Pages (1 clique).");
  showPublishLink(url);

  alert(
    "Publicado! Se o link não abrir ainda, entre no repo > Settings > Pages e ative 'Deploy from branch: main / root'. " +
    "Depois disso fica automático pra sempre."
  );
}

function wireGeneratorButtons(selectedIdFromRoute) {
  fillGenSelect(selectedIdFromRoute);

  const btnZip = document.getElementById("btnZip");
  const btnPublish = document.getElementById("btnPublish");

  if (btnZip) {
    btnZip.addEventListener("click", async () => {
      const app = getSelectedApp();
      if (!app) return alert("Nenhum app selecionado.");
      setStatus("Gerando arquivo para download...");
      await downloadZip(app);
      setStatus("Download iniciado ✅");
    });
  }

  if (btnPublish) {
    btnPublish.addEventListener("click", async () => {
      const app = getSelectedApp();
      if (!app) return alert("Nenhum app selecionado.");

      try {
        setStatus("Publicando no GitHub...");
        await publishToGitHub(app);
        setStatus("Publicado ✅");
      } catch (err) {
        console.error(err);
        alert("Erro ao publicar. Veja console. " + (err?.message || ""));
        setStatus("Erro ao publicar ❌");
      }
    });
  }
}

/** ROUTE CHANGED **/
window.addEventListener("route:changed", (e) => {
  const { route, data } = e.detail || {};

  if (route === "home") renderAppsList();
  if (route === "newapp") wireNewAppForm();
  if (route === "settings") wireSettingsForm();
  if (route === "generator") wireGeneratorButtons(data?.selectedId);
});

/** START **/
navigate("home");
async function ghRequest(path, token, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = (data && data.message) ? data.message : `${res.status} ${res.statusText}`;
    throw new Error(`[GitHub ${res.status}] ${msg}`);
  }
  return data;
}

function b64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function ensureRepoExists({ owner, repo, token, isPrivate = false }) {
  try {
    await ghRequest(`/repos/${owner}/${repo}`, token);
    return;
  } catch (e) {
    if (!String(e.message).includes("[GitHub 404]")) throw e;
  }

  // cria repo no owner do token (precisa ser o mesmo usuário)
  await ghRequest(`/user/repos`, token, {
    method: "POST",
    body: JSON.stringify({
      name: repo,
      private: isPrivate,
      auto_init: true,
      description: "Generated by RControl Factory"
    })
  });
}

async function putFile({ owner, repo, token, path, content, message, branch = "main" }) {
  let sha;
  try {
    const existing = await ghRequest(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`, token);
    sha = existing.sha;
  } catch (e) {
    if (!String(e.message).includes("[GitHub 404]")) throw e;
  }

  return ghRequest(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, token, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: b64(content),
      branch,
      ...(sha ? { sha } : {})
    })
  });
}

async function enablePages({ owner, repo, token, branch = "main" }) {
  try {
    await ghRequest(`/repos/${owner}/${repo}/pages`, token, {
      method: "POST",
      body: JSON.stringify({
        source: { branch, path: "/" }
      })
    });
  } catch (e) {
    // se já existir pages, pode dar 409 (ignora)
    if (!String(e.message).includes("[GitHub 409]")) throw e;
  }
}

async function publishToPages({ owner, prefix, appId, token, indexHtml }) {
  const repo = `${prefix}${appId}`; // ex: rapp-rquotas
  const branch = "main";

  await ensureRepoExists({ owner, repo, token, isPrivate: false });

  await putFile({
    owner, repo, token,
    path: "index.html",
    content: indexHtml,
    message: "Publish app (index.html)",
    branch
  });

  await putFile({
    owner, repo, token,
    path: "404.html",
    content: indexHtml,
    message: "Add 404 fallback",
    branch
  });

  await enablePages({ owner, repo, token, branch });

  return `https://${owner}.github.io/${repo}/`;
}
async function onClickPublish(app) {
  const s = getSettings();
  const owner = s.githubUsername;  // rcontrol-factory
  const token = s.githubToken;     // PAT
  const prefix = s.repoPrefix;     // rapp-
  const appId = app.id;            // rquotas

  const indexHtml = buildIndexHtml(app);

  try {
    setStatus("Publicando...");
    const url = await publishToPages({ owner, prefix, appId, token, indexHtml });
    setStatus(`Publicado! Link: ${url}`);
    alert(`Publicado! Link: ${url}`);
  } catch (err) {
    console.error(err);
    alert(`Erro ao publicar: ${err.message}`);
    setStatus("Erro ao publicar (veja console).");
  }
}

import { navigate } from "./router.js";

const STORAGE_KEY = "rcontrol_factory_apps_v1";

function loadApps() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveApps(apps) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}

function sanitizeId(raw) {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function renderAppsList() {
  const list = document.getElementById("appsList");
  if (!list) return;

  const apps = loadApps();

  if (!apps.length) {
    list.innerHTML = `<div class="hint">Nenhum app salvo ainda.</div>`;
    return;
  }

  list.innerHTML = apps
    .map(
      (a) => `
      <div class="item">
        <div><b>${a.name}</b></div>
        <div class="hint">${a.id} • ${a.type}</div>
      </div>
    `
    )
    .join("");
}

function setupNewAppForm() {
  const form = document.getElementById("newAppForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const rawId = String(fd.get("id") || "");
    const type = String(fd.get("type") || "pwa");

    const id = sanitizeId(rawId);

    if (!name) return alert("Preencha o nome do app.");
    if (!id) return alert("ID inválido. Use letras minúsculas, números e hífen.");

    if (id !== rawId.trim()) {
      alert(`Ajustei o ID para: ${id}`);
      const appIdInput = document.getElementById("appId");
      if (appIdInput) appIdInput.value = id;
    }

    const apps = loadApps();
    const exists = apps.some((a) => a.id === id);
    if (exists) return alert("Já existe um app com esse ID. Escolha outro.");

    apps.unshift({
      name,
      id,
      type,
      createdAt: new Date().toISOString(),
    });

    saveApps(apps);
    alert("App salvo! Agora vá em Generator para baixar o ZIP.");
    navigate("home");
  });
}

function fillGeneratorSelect() {
  const select = document.getElementById("genSelect");
  if (!select) return;

  const apps = loadApps();

  if (!apps.length) {
    select.innerHTML = `<option value="">(Nenhum app salvo)</option>`;
    return;
  }

  select.innerHTML = apps
    .map((a) => `<option value="${a.id}">${a.name} (${a.id})</option>`)
    .join("");
}

function getSelectedApp() {
  const select = document.getElementById("genSelect");
  if (!select) return null;

  const id = select.value;
  const apps = loadApps();
  return apps.find((a) => a.id === id) || null;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function makeAppFiles(app) {
  const appTitle = app.name;
  const appId = app.id;

  const indexHtml = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0b1220" />
  <title>${appTitle}</title>
  <link rel="manifest" href="./manifest.json" />
  <link rel="stylesheet" href="./css/app.css" />
</head>
<body>
  <main class="wrap">
    <h1>${appTitle}</h1>
    <p>App gerado pela RControl Factory.</p>

    <div class="card">
      <b>ID:</b> ${appId}<br/>
      <b>Tipo:</b> ${app.type}
    </div>
  </main>

  <script src="./js/app.js"></script>
</body>
</html>`;

  const manifest = JSON.stringify(
    {
      name: appTitle,
      short_name: appTitle,
      start_url: "./index.html",
      display: "standalone",
      background_color: "#0b1220",
      theme_color: "#0b1220",
      icons: []
    },
    null,
    2
  );

  const css = `
:root { color-scheme: dark; }
body { margin: 0; font-family: -apple-system, system-ui, Arial; background:#07101f; color:#e6eefc; }
.wrap { padding: 18px; }
.card { margin-top: 12px; padding: 12px; border-radius: 12px; background: rgba(255,255,255,.06); }
`;

  const js = `// ${appTitle} (${appId})
console.log("App iniciado:", "${appId}");
`;

  return { indexHtml, manifest, css, js };
}

async function generateZip() {
  const msg = document.getElementById("genMsg");
  const app = getSelectedApp();
  if (!app) {
    if (msg) msg.textContent = "Nenhum app selecionado.";
    return;
  }

  if (!window.JSZip) {
    alert("JSZip não carregou. Verifique o index.html do Factory (script do JSZip).");
    return;
  }

  if (msg) msg.textContent = "Gerando ZIP...";

  const zip = new JSZip();
  const root = zip.folder(app.id);

  const files = makeAppFiles(app);

  root.file("index.html", files.indexHtml);
  root.file("manifest.json", files.manifest);
  root.folder("css").file("app.css", files.css);
  root.folder("js").file("app.js", files.js);

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${app.id}.zip`);

  if (msg) msg.textContent = "ZIP pronto ✅";
}

function setupGenerator() {
  fillGeneratorSelect();

  const btn = document.getElementById("btnZip");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      generateZip();
    });
  }
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-route]");
  if (!btn) return;
  const route = btn.getAttribute("data-route");
  navigate(route);
});

document.addEventListener("route:changed", (e) => {
  const route = e.detail?.route;

  if (route === "home" || route === "dashboard") renderAppsList();
  if (route === "newapp") setupNewAppForm();
  if (route === "generator") setupGenerator();
});

// start
navigate("home");

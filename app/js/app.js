import { navigate } from "./router.js";

const APPS_KEY = "rcontrol_factory_apps";

function toast(msg, type = "warn") {
  // tipo simples: warn/ok/error
  alert(msg);
}

function isValidId(id) {
  // minúsculas, números e hífen
  return /^[a-z0-9-]+$/.test(id);
}

function getApps() {
  return JSON.parse(localStorage.getItem(APPS_KEY) || "[]");
}

function saveApps(list) {
  localStorage.setItem(APPS_KEY, JSON.stringify(list));
}

function addApp(app) {
  const list = getApps();

  // evita duplicar ID
  if (list.some((x) => x.id === app.id)) {
    toast("Já existe um app com esse ID. Troque o ID e tente de novo.", "error");
    return false;
  }

  list.unshift(app);
  saveApps(list);
  return true;
}

function renderAppsList() {
  const el = document.getElementById("appsList");
  if (!el) return;

  const list = getApps();

  if (!list.length) {
    el.innerHTML = `<p style="opacity:.8">Nenhum app salvo ainda.</p>`;
    return;
  }

  el.innerHTML = list
    .map(
      (a) => `
      <div class="item" style="padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;margin:8px 0;">
        <div>
          <strong>${a.name}</strong><br/>
          <small style="opacity:.8">${a.id} • ${a.type}</small>
        </div>
      </div>
    `
    )
    .join("");
}

window.renderAppsList = renderAppsList;

// clique para navegar (tabs e botões com data-route)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-route]");
  if (!btn) return;

  const route = btn.getAttribute("data-route");
  navigate(route);
});

// clique no botão salvar (New App)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#saveNewApp");
  if (!btn) return;

  const name = (document.getElementById("appName")?.value || "").trim();
  const id = (document.getElementById("appId")?.value || "").trim();
  const type = document.getElementById("appType")?.value || "pwa";

  if (!name || !id) {
    toast("Preencha Nome do app e ID do app.", "warn");
    return;
  }

  if (!isValidId(id)) {
    toast("ID inválido. Use apenas letras minúsculas, números e hífen (ex: rcontrol-orders).", "warn");
    return;
  }

  const ok = addApp({
    name,
    id,
    type,
    createdAt: Date.now(),
  });

  if (!ok) return;

  toast("App salvo com sucesso ✅", "ok");

  // volta pro Home e renderiza lista
  navigate("home");
  renderAppsList();
});

// inicia no Home
navigate("home");
renderAppsList();

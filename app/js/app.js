import { navigate } from "./router.js";

// Helpers
function $(id) {
  return document.getElementById(id);
}

function toast(msg, type = "info") {
  // Mostra mensagem dentro da tela (na área #app), sem alert chato.
  const app = $("app");
  if (!app) return;

  const box = document.createElement("div");
  box.className = `toast toast-${type}`;
  box.textContent = msg;

  app.prepend(box);

  setTimeout(() => box.remove(), 3500);
}

function getNewAppData() {
  const nameEl = $("appName");
  const idEl = $("appId");
  const typeEl = $("appType");

  if (!nameEl || !idEl || !typeEl) {
    toast("Erro: campos do formulário não encontrados. Confira os IDs no templates.js.", "error");
    return null;
  }

  const name = nameEl.value.trim();
  const id = idEl.value.trim();
  const type = typeEl.value;

  // Validações simples (pra evitar BO)
  if (!name) {
    toast("Preencha o Nome do app.", "warn");
    nameEl.focus();
    return null;
  }

  if (!id) {
    toast("Preencha o ID do app.", "warn");
    idEl.focus();
    return null;
  }

  // só letras minúsculas, números e hífen
  const ok = /^[a-z0-9-]+$/.test(id);
  if (!ok) {
    toast("ID inválido. Use só letras minúsculas, números e hífen (ex: rcontrol-orders).", "error");
    idEl.focus();
    return null;
  }

  return { name, id, type };
}

function saveApp(appData) {
  // Armazena local (offline-first)
  const key = "rcontrol_factory_apps";
  const list = JSON.parse(localStorage.getItem(key) || "[]");

  // não deixa duplicar ID
  const exists = list.some((a) => a.id === appData.id);
  if (exists) {
    toast(`Já existe um app com o ID "${appData.id}". Troque o ID.`, "error");
    return false;
  }

  list.push({
    ...appData,
    createdAt: new Date().toISOString(),
  });

  localStorage.setItem(key, JSON.stringify(list));
  return true;
}

// Clique nos botões de navegação (Dashboard/New App/Generator/Settings)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-route]");
  if (!btn) return;

  const route = btn.getAttribute("data-route");
  navigate(route);
});

// Clique no botão "Salvar" do New App
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#saveNewApp");
  if (!btn) return;

  const data = getNewAppData();
  if (!data) return;

  const ok = saveApp(data);
  if (!ok) return;

  toast(`App salvo: ${data.name} (${data.id})`, "success");

  // Opcional: ir pro Generator ou voltar pro Dashboard
  // navigate("generator");
  navigate("home");
});

// Carrega tela inicial
navigate("home");

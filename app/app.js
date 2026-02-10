/* RControl Factory - reset limpo (offline-first) */

const LS_KEY = "rcf_factory_v3";

const state = loadState() || {
  settings: { mode: "private", adminPin: "000" },
  apps: {},
  activeAppId: null,
  vault: [],
  logs: []
};

let editor = {
  currentFile: "index.html",
  original: ""
};

let agentPatch = null;
let adminPatch = null;

/* ---------- Boot ---------- */
init();
registerSW();

/* ---------- UI ---------- */
function init() {
  bindNav();
  bindDashboard();
  bindNewApp();
  bindEditor();
  bindGenerator();
  bindAgent();
  bindAdmin();
  bindTools();

  ensureDemoIfEmpty();
  renderAll();
  log("RCF init… ✅");
}

function bindNav() {
  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => navTo(btn.dataset.nav));
  });

  // Close modals
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
}

function navTo(page) {
  // pages: dashboard, newapp, editor, generator, agent, settings, admin
  if (page === "agent") return openModal("agentModal");
  if (page === "admin") {
    // optional: ask pin
    const pin = prompt("PIN do Admin (local):");
    if (pin !== (state.settings.adminPin || "000")) {
      alert("PIN incorreto.");
      return;
    }
    return openModal("adminModal");
  }

  document.querySelectorAll("[data-page]").forEach(sec => {
    sec.classList.toggle("hidden", sec.dataset.page !== page);
  });
}

function bindDashboard() {
  $("#btnCreateApp").addEventListener("click", () => navTo("newapp"));
  $("#btnOpenEditor").addEventListener("click", () => navTo("editor"));
  $("#btnZip").addEventListener("click", exportBackupJson);
}

function bindNewApp() {
  $("#newAppName").addEventListener("input", syncSlugFromName);
  $("#createNow").addEventListener("click", () => {
    const name = $("#newAppName").value.trim();
    const slug = normalizeSlug($("#newAppSlug").value.trim());
    if (!name || !slug) return alert("Preencha nome e slug.");
    if (state.apps[slug]) return alert("Esse slug já existe.");
    createApp(name, slug);
    navTo("editor");
  });
}

function bindEditor() {
  $("#btnSaveFile").addEventListener("click", saveCurrentFile);
  $("#btnResetFile").addEventListener("click", resetCurrentFile);
  $("#btnPreview").addEventListener("click", () => previewActiveApp());
}

function bindGenerator() {
  $("#exportBackup").addEventListener("click", exportBackupJson);
  $("#importBackup").addEventListener("click", () => $("#importBackupFile").click());
  $("#importBackupFile").addEventListener("change", importBackupJson);
}

function bindTools() {
  $("#toolsBtn").addEventListener("click", () => toggleTools(true));
  $("#toolsClose").addEventListener("click", () => toggleTools(false));

  $("#btnClearLogs").addEventListener("click", () => { state.logs = []; saveState(); renderLogs(); });
  $("#btnCopyLogs").addEventListener("click", () => copyText(state.logs.join("\n")));
  $("#btnCopyDiag").addEventListener("click", () => copyText(makeDiag()));
  $("#btnClearCache").addEventListener("click", clearPwaCache);

  $("#btnOpenAgent").addEventListener("click", () => openModal("agentModal"));
  $("#btnOpenAdmin").addEventListener("click", () => {
    const pin = prompt("PIN do Admin (local):");
    if (pin !== (state.settings.adminPin || "000")) return alert("PIN incorreto.");
    openModal("adminModal");
  });
}

function bindAgent() {
  $("#agentRun").addEventListener("click", runAgent);
  $("#agentClear").addEventListener("click", () => { $("#agentInput").value=""; $("#agentOutput").textContent=""; });
  $("#agentApprove").addEventListener("click", approveAgentPatch);
  $("#agentDiscard").addEventListener("click", () => { agentPatch=null; toast("Sugestão descartada."); });

  $("#agentUpload").addEventListener("click", () => $("#agentUploadInput").click());
  $("#agentUploadInput").addEventListener("change", onVaultUpload);
}

function bindAdmin() {
  $("#adminRun").addEventListener("click", runAdmin);
  $("#adminClear").addEventListener("click", () => { $("#adminInput").value=""; $("#adminOutput").textContent=""; });
  $("#adminApply").addEventListener("click", applyAdminPatch);
  $("#adminDiscard").addEventListener("click", () => { adminPatch=null; toast("Sugestão descartada."); });
}

function renderAll() {
  renderApps();
  renderEditor();
  renderVault();
  renderLogs();
  saveState();
}

/* ---------- Data ---------- */
function ensureDemoIfEmpty() {
  // Se não tiver apps, deixa vazio mesmo (você tá testando Factory)
  // mas se quiser sempre um demo, descomenta:
  // if (Object.keys(state.apps).length === 0) createApp("RControl Demo", "rcontrol-demo");
}

function createApp(name, slug) {
  const files = makeBaseAppFiles(name, slug);
  state.apps[slug] = { id: slug, name, files, createdAt: Date.now(), updatedAt: Date.now() };
  state.activeAppId = slug;
  saveState();
  toast(`App criado: ${name} (${slug})`);
  renderAll();
}

function makeBaseAppFiles(name, slug) {
  const index = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(name)}</title>
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="styles.css" />
  <meta name="theme-color" content="#0b1220" />
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(name)}</h1>
    <p>App gerado pela RControl Factory.</p>
    <button id="btn">Testar</button>
    <pre id="out"></pre>
  </div>
  <script src="app.js"></script>
</body>
</html>`;

  const css = `body{margin:0;font-family:system-ui;background:#0b1220;color:#e8eefc}
.wrap{max-width:760px;margin:0 auto;padding:18px}
button{padding:12px 14px;border-radius:12px;border:1px solid #1e2b44;background:#132744;color:#e8eefc;font-weight:800}
pre{margin-top:14px;padding:12px;border:1px solid #1e2b44;border-radius:12px;background:#0f1a2c;white-space:pre-wrap}
`;

  const js = `document.getElementById("btn").onclick=()=>{
  document.getElementById("out").textContent="Rodando ✅ " + new Date().toLocaleString();
};`;

  const manifest = `{
  "name": "${escapeJson(name)}",
  "short_name": "${escapeJson(name)}",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#0b1220",
  "theme_color": "#0b1220",
  "icons": []
}`;

  const sw = `self.addEventListener("install", (e)=>{ self.skipWaiting(); });
self.addEventListener("activate", (e)=>{ self.clients.claim(); });
self.addEventListener("fetch", (e)=>{ /* simples */ });`;

  const readme = `# ${name}
Gerado pela RControl Factory.

## Rodar
Abra o index.html em um host estático (Cloudflare Pages).
`;

  return {
    "index.html": index,
    "styles.css": css,
    "app.js": js,
    "manifest.json": manifest,
    "sw.js": sw,
    "README.md": readme
  };
}

/* ---------- Render ---------- */
function renderApps() {
  const list = $("#appsList");
  list.innerHTML = "";

  const ids = Object.keys(state.apps);
  if (ids.length === 0) {
    list.innerHTML = `<div class="muted">Nenhum app salvo ainda.</div>`;
    $("#activeAppLabel").textContent = "—";
    return;
  }

  ids.sort((a,b)=> (state.apps[b].updatedAt||0) - (state.apps[a].updatedAt||0));

  ids.forEach(id => {
    const app = state.apps[id];
    const item = document.createElement("div");
    item.className = "listItem";
    const left = document.createElement("div");
    left.innerHTML = `<strong>${escapeHtml(app.name)}</strong><div class="muted small">${escapeHtml(app.id)} • pwa</div>`;
    const right = document.createElement("div");
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = (state.activeAppId === id) ? "ativo" : "abrir";
    right.appendChild(tag);

    item.appendChild(left);
    item.appendChild(right);

    item.addEventListener("click", () => {
      state.activeAppId = id;
      saveState();
      renderAll();
      navTo("editor");
    });

    list.appendChild(item);
  });

  const active = state.apps[state.activeAppId];
  $("#activeAppLabel").textContent = active ? `${active.name} (${active.id})` : "—";
}

function renderEditor() {
  const active = state.apps[state.activeAppId];
  const filesList = $("#filesList");
  const fileEditor = $("#fileEditor");
  const fileNameLabel = $("#fileNameLabel");

  filesList.innerHTML = "";
  if (!active) {
    $("#activeAppLabel").textContent = "—";
    fileNameLabel.textContent = "—";
    fileEditor.value = "";
    return;
  }

  $("#activeAppLabel").textContent = `${active.name} (${active.id})`;

  const names = Object.keys(active.files);
  names.forEach(fn => {
    const item = document.createElement("div");
    item.className = "listItem";
    item.innerHTML = `<strong>${escapeHtml(fn)}</strong>`;
    item.addEventListener("click", () => {
      editor.currentFile = fn;
      editor.original = active.files[fn] || "";
      fileNameLabel.textContent = fn;
      fileEditor.value = editor.original;
      highlightSelectedFile(fn);
    });
    filesList.appendChild(item);
  });

  // abrir primeiro arquivo se não existir
  if (!active.files[editor.currentFile]) editor.currentFile = names[0] || "index.html";

  fileNameLabel.textContent = editor.currentFile;
  fileEditor.value = active.files[editor.currentFile] || "";
  editor.original = fileEditor.value;
  highlightSelectedFile(editor.currentFile);
}

function highlightSelectedFile(filename) {
  const items = Array.from($("#filesList").children);
  items.forEach(el => {
    el.style.outline = el.textContent.includes(filename) ? "2px solid rgba(31,146,120,.55)" : "none";
  });
}

function renderVault() {
  const list = $("#vaultList");
  list.innerHTML = "";
  if (!state.vault.length) {
    list.innerHTML = `<div class="muted">Nenhum arquivo no Vault.</div>`;
    return;
  }

  state.vault.forEach(v => {
    const item = document.createElement("div");
    item.className = "listItem";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(v.name)}</strong>
        <div class="muted small">${escapeHtml(v.type)} • ${(v.size/1024).toFixed(1)} KB</div>
      </div>
      <div class="row" style="margin:0">
        <button class="btn sm" data-act="inject">Injetar</button>
        <button class="btn sm danger" data-act="del">Apagar</button>
      </div>
    `;

    item.querySelector('[data-act="inject"]').addEventListener("click", (e) => {
      e.stopPropagation();
      injectAssetToActiveApp(v);
    });
    item.querySelector('[data-act="del"]').addEventListener("click", (e) => {
      e.stopPropagation();
      state.vault = state.vault.filter(x => x.id !== v.id);
      saveState();
      renderVault();
      toast("Removido do Vault.");
    });

    list.appendChild(item);
  });
}

function renderLogs() {
  $("#logsBox").textContent = state.logs.slice(-120).join("\n");
}

/* ---------- Editor Actions ---------- */
function saveCurrentFile() {
  const active = state.apps[state.activeAppId];
  if (!active) return alert("Selecione um app.");
  const fn = editor.currentFile;
  active.files[fn] = $("#fileEditor").value;
  active.updatedAt = Date.now();
  saveState();
  toast(`Salvo: ${fn}`);
}

function resetCurrentFile() {
  const active = state.apps[state.activeAppId];
  if (!active) return;
  $("#fileEditor").value = editor.original || active.files[editor.currentFile] || "";
  toast("Reset feito.");
}

function previewActiveApp() {
  const active = state.apps[state.activeAppId];
  if (!active) return alert("Selecione um app.");

  const html = active.files["index.html"] || "<h1>Sem index.html</h1>";
  const win = window.open("", "_blank");
  if (!win) return alert("Bloqueado pelo navegador.");
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ---------- Generator/Backup ---------- */
function exportBackupJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rcf-backup-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Backup exportado.");
}

function importBackupJson(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj || typeof obj !== "object") throw new Error("Inválido");
      Object.assign(state, obj);
      saveState();
      renderAll();
      toast("Backup importado.");
    } catch (err) {
      alert("Erro ao importar backup.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

/* ---------- Agent Logic (simples/offline) ---------- */
function runAgent() {
  const cmd = ($("#agentInput").value || "").trim();
  if (!cmd) return;

  const out = [];
  const parts = cmd.split(/\s+/);
  const action = (parts[0] || "").toLowerCase();

  if (action === "help") {
    out.push("Comandos:");
    out.push("- list");
    out.push("- create <Nome> <slug>");
    out.push("- select <slug>");
    out.push("- open editor");
    out.push("- set file <nomeArquivo>");
    out.push("- write <conteudo...>  (substitui arquivo atual)");
    out.push("- inject asset <vaultId>  (injeta assets/ no app ativo)");
  } else if (action === "list") {
    out.push("Apps:");
    Object.keys(state.apps).forEach(id => out.push(`- ${id} (${state.apps[id].name})`));
  } else if (action === "create") {
    const name = parts[1] || "";
    const slug = normalizeSlug(parts[2] || "");
    if (!name || !slug) out.push("Uso: create <Nome> <slug>");
    else {
      agentPatch = { type: "createApp", name, slug };
      out.push("Entendi como SUGESTÃO ✅");
      out.push(`Vou criar app: ${name} (${slug})`);
      out.push("Clique em: Aprovar sugestão");
    }
  } else if (action === "select") {
    const slug = normalizeSlug(parts[1] || "");
    if (!state.apps[slug]) out.push("App não existe.");
    else {
      state.activeAppId = slug;
      saveState();
      renderAll();
      out.push(`Selecionado: ${slug}`);
    }
  } else if (action === "open" && parts[1] === "editor") {
    navTo("editor");
    out.push("Abrindo Editor…");
  } else if (action === "set" && parts[1] === "file") {
    const fn = parts.slice(2).join(" ");
    if (!fn) out.push("Uso: set file <arquivo>");
    else {
      editor.currentFile = fn;
      renderEditor();
      out.push(`Arquivo selecionado: ${fn}`);
    }
  } else if (action === "write") {
    const content = cmd.replace(/^write\s+/i, "");
    if (!content) out.push("Uso: write <conteúdo>");
    else {
      agentPatch = { type: "writeFile", file: editor.currentFile, content };
      out.push("Sugestão criada ✅ (writeFile)");
      out.push(`Arquivo: ${editor.currentFile}`);
      out.push("Clique em: Aprovar sugestão");
    }
  } else if (action === "inject" && parts[1] === "asset") {
    const vaultId = parts[2];
    if (!vaultId) out.push("Uso: inject asset <vaultId>");
    else {
      agentPatch = { type: "injectAsset", vaultId };
      out.push("Sugestão criada ✅ (injectAsset)");
      out.push("Clique em: Aprovar sugestão");
    }
  } else {
    out.push("Comando não reconhecido. Use: help");
  }

  $("#agentOutput").textContent = out.join("\n");
  log("AGENT cmd: " + cmd);
}

function approveAgentPatch() {
  if (!agentPatch) return toast("Nenhuma sugestão pendente.");
  const p = agentPatch;
  agentPatch = null;

  if (p.type === "createApp") {
    if (state.apps[p.slug]) return alert("Slug já existe.");
    createApp(p.name, p.slug);
    renderAll();
    toast("Sugestão aplicada ✅");
    return;
  }

  if (p.type === "writeFile") {
    const active = state.apps[state.activeAppId];
    if (!active) return alert("Selecione um app.");
    active.files[p.file] = p.content;
    active.updatedAt = Date.now();
    saveState();
    renderAll();
    toast("Arquivo escrito ✅");
    return;
  }

  if (p.type === "injectAsset") {
    const v = state.vault.find(x => x.id === p.vaultId);
    if (!v) return alert("VaultId não encontrado.");
    injectAssetToActiveApp(v);
    toast("Asset injetado ✅");
    return;
  }
}

/* ---------- Admin (patches de Factory) ---------- */
function runAdmin() {
  const txt = ($("#adminInput").value || "").trim();
  if (!txt) return;

  // Admin aqui só gera “plano” e “sugestão”
  // (A parte poderosa online/OpenAI entra depois)
  const plan = [];
  plan.push("PLANO (offline):");
  plan.push("1) Entender pedido.");
  plan.push("2) Gerar patch mínimo e seguro.");
  plan.push("3) Você aprova manualmente.");

  const suggestion = [];
  suggestion.push("\nSUGESTÃO:");
  suggestion.push("- Esse admin offline ainda não altera arquivos sozinho.");
  suggestion.push("- Use o Editor para aplicar mudanças.");
  suggestion.push("- Ou use Agent: write / set file / etc.");

  adminPatch = { type: "note", text: txt, ts: Date.now() };

  $("#adminOutput").textContent = plan.join("\n") + "\n" + suggestion.join("\n") + "\n\nPedido: " + txt;
  log("ADMIN note: " + txt);
}

function applyAdminPatch() {
  if (!adminPatch) return toast("Nenhuma sugestão pendente.");
  toast("Aplicado ✅ (modo offline: só registrou).");
  adminPatch = null;
}

function openModal(id) {
  const el = document.getElementById(id);
  el.classList.remove("hidden");
  el.setAttribute("aria-hidden","false");
}
function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.add("hidden");
  el.setAttribute("aria-hidden","true");
}

/* ---------- Vault Upload ---------- */
function onVaultUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const id = "v_" + Math.random().toString(36).slice(2,10);
    state.vault.unshift({
      id,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size || 0,
      dataUrl: reader.result, // base64 data url
      createdAt: Date.now()
    });
    saveState();
    renderVault();
    toast("Arquivo guardado no Vault ✅");
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

function injectAssetToActiveApp(v) {
  const active = state.apps[state.activeAppId];
  if (!active) return alert("Selecione um app ativo.");

  // garante pasta assets/ (virtual)
  const assetPath = `assets/${sanitizeFilename(v.name)}`;
  active.files[assetPath] = v.dataUrl; // para host real, isso viraria arquivo binário; aqui é base64 (OK pra testes)
  active.updatedAt = Date.now();

  // adiciona um README de assets se não tiver
  if (!active.files["ASSETS.md"]) {
    active.files["ASSETS.md"] = `# Assets\nArquivos em base64 para testes (Vault).\n`;
  }

  saveState();
  renderAll();
  toast(`Injetado: ${assetPath}`);
}

/* ---------- Tools ---------- */
function toggleTools(show) {
  const p = $("#toolsPanel");
  p.classList.toggle("hidden", !show);
  p.setAttribute("aria-hidden", show ? "false" : "true");
}
function clearPwaCache() {
  if (!("caches" in window)) return alert("Cache API não disponível.");
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => toast("Cache PWA limpo ✅"))
    .catch(() => alert("Erro limpando cache."));
}

/* ---------- Logs/Diag ---------- */
function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  state.logs.push(line);
  saveState();
  renderLogs();
}
function makeDiag() {
  const active = state.apps[state.activeAppId];
  return [
    "RCF DIAGNÓSTICO",
    `mode: ${state.settings.mode}`,
    `apps: ${Object.keys(state.apps).length}`,
    `active: ${active ? active.id : "—"}`,
    `vault: ${state.vault.length}`,
    `ua: ${navigator.userAgent}`
  ].join("\n");
}

/* ---------- Settings ---------- */
$("#saveSettings").addEventListener("click", () => {
  state.settings.mode = $("#modeSelect").value;
  const pin = ($("#adminPin").value || "").trim() || "000";
  state.settings.adminPin = pin;
  saveState();
  toast("Settings salvos ✅");
});

function syncSlugFromName() {
  const n = $("#newAppName").value || "";
  $("#newAppSlug").value = normalizeSlug(n);
}

/* ---------- Persistence ---------- */
function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e){}
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/* ---------- Helpers ---------- */
function $(sel){ return document.querySelector(sel); }

function toast(t){
  $("#statusText").textContent = t;
  setTimeout(()=> $("#statusText").textContent="Pronto ✅", 1200);
}

function copyText(text){
  navigator.clipboard?.writeText(text).then(()=>toast("Copiado ✅")).catch(()=>alert("Não deu pra copiar."));
}

function normalizeSlug(s){
  return (s||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"")
    .slice(0,40);
}
function sanitizeFilename(name){
  return (name||"file")
    .replace(/[^a-zA-Z0-9._-]/g,"_")
    .slice(0,90);
}
function escapeHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function escapeJson(s){
  return String(s||"").replaceAll('"','\\"');
}

/* ---------- SW ---------- */
function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

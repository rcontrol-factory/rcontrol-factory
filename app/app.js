/* RControl Factory - PWA Offline-first
   - Apps ficam no localStorage
   - Editor simples
   - Agent com comandos básicos
   - Admin: gera "Plano + Sugestão" (manual)
*/

const LS_KEY = "rcf_factory_v3";
const LS_LOGS = "rcf_logs_v3";
const LS_PATCH = "rcf_patch_v3";
const LS_SETTINGS = "rcf_settings_v3";

const DEFAULT_FILES = () => ({
  "index.html": `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Meu App</title>
  <meta name="theme-color" content="#0b1220" />
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="wrap">
    <h1>Meu App</h1>
    <p>Base criada pela Factory ✅</p>
    <button id="btn">Testar</button>
  </main>
  <script src="app.js"></script>
</body>
</html>`,
  "styles.css": `:root{--bg:#0b1220;--fg:#fff;--muted:rgba(255,255,255,.7);--acc:#16c784;}
body{margin:0;font-family:-apple-system,system-ui;background:var(--bg);color:var(--fg);}
.wrap{max-width:680px;margin:40px auto;padding:0 14px;}
button{padding:12px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:var(--fg);cursor:pointer;}
button:hover{border-color:rgba(22,199,132,.45);box-shadow:0 0 0 6px rgba(22,199,132,.10);}
p{color:var(--muted);}`,
  "app.js": `document.getElementById("btn")?.addEventListener("click", () => {
  alert("Rodando ✅");
});`,
  "manifest.json": `{
  "name": "Meu App",
  "short_name": "App",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#0b1220",
  "theme_color": "#0b1220",
  "icons": []
}`,
  "sw.js": `self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("app-v1").then(cache => cache.addAll([
    "./", "./index.html", "./styles.css", "./app.js", "./manifest.json"
  ])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});`
});

function now() {
  return new Date().toISOString().replace("T"," ").slice(0,19);
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; }
  catch { return null; }
}
function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_SETTINGS)) || { dock: true }; }
  catch { return { dock: true }; }
}
function saveSettings(s) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
}

function log(msg) {
  const line = `[${now()}] ${msg}`;
  const logs = (localStorage.getItem(LS_LOGS) || "").split("\n").filter(Boolean);
  logs.unshift(line);
  localStorage.setItem(LS_LOGS, logs.slice(0,400).join("\n"));
  renderLogs();
}

function getLogs() {
  return localStorage.getItem(LS_LOGS) || "";
}

function defaultFactoryState() {
  return {
    version: 3,
    mode: "private",
    active: null,
    apps: {}
  };
}

let state = loadState() || defaultFactoryState();
let settings = loadSettings();

const $ = (id) => document.getElementById(id);

function setStatus(text, ok=true) {
  $("statusText").textContent = text;
  $("statusPill").style.borderColor = ok ? "rgba(22,199,132,.45)" : "rgba(211,90,90,.55)";
  $("statusPill").style.boxShadow = ok ? "0 0 0 6px rgba(22,199,132,.10)" : "0 0 0 6px rgba(211,90,90,.10)";
}

function ensureActive() {
  if (!state.active) {
    const slugs = Object.keys(state.apps);
    if (slugs.length) state.active = slugs[0];
  }
}

function viewId(name) {
  return `view-${name}`;
}

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const el = $(viewId(name));
  if (el) el.classList.add("active");

  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`.tab[data-view="${name}"]`).forEach(b => b.classList.add("active"));

  renderAll();
  log(`view -> ${name}`);
}

function wireTabs() {
  // TOP TABS
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const v = btn.getAttribute("data-view");
      if (v) showView(v);
    }, { passive: false });
  });

  // DOCK
  document.querySelectorAll(".dockbtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const v = btn.getAttribute("data-view");
      if (v) showView(v);
    }, { passive: false });
  });

  // GEAR / TOOLS
  $("btnTools").addEventListener("click", () => openTools(true));
  $("btnOpenTools").addEventListener("click", () => openTools(true));
  $("btnCloseTools").addEventListener("click", () => openTools(false));

  // Dashboard shortcuts
  $("btnOpenAgent").addEventListener("click", () => showView("agente"));
  $("btnOpenAdmin").addEventListener("click", () => showView("admin"));

  $("btnGoDashboard").addEventListener("click", () => showView("dashboard"));
  $("btnOpenEditor").addEventListener("click", () => showView("editor"));

  $("btnCreate").addEventListener("click", () => showView("newapp"));
  $("btnDoCreate").addEventListener("click", () => createFromForm());

  $("btnExport").addEventListener("click", () => downloadBackup());

  // Editor actions
  $("btnSaveFile").addEventListener("click", saveCurrentFile);
  $("btnResetFile").addEventListener("click", resetCurrentFile);
  $("btnPreview").addEventListener("click", previewActive);

  // Generator
  $("btnGenBackup").addEventListener("click", downloadBackup);
  $("btnGenAppJson").addEventListener("click", downloadActiveApp);

  // Settings
  $("toggleDock").addEventListener("change", (e) => {
    settings.dock = !!e.target.checked;
    saveSettings(settings);
    applyDockSetting();
  });
  $("btnClearCache").addEventListener("click", clearPWACache);
  $("btnCopyDiag").addEventListener("click", () => {
    navigator.clipboard?.writeText(buildDiagnostic()).then(() => log("diagnóstico copiado"));
  });

  // Logs tools
  $("btnClearLogs").addEventListener("click", () => {
    localStorage.setItem(LS_LOGS, "");
    renderLogs();
    log("logs limpos");
  });
  $("btnCopyLogs").addEventListener("click", () => {
    navigator.clipboard?.writeText(getLogs()).then(() => log("logs copiados"));
  });

  // Agent
  $("btnAgentRun").addEventListener("click", runAgent);
  $("btnAgentClear").addEventListener("click", () => { $("agentOut").textContent = "—"; $("agentInput").value = ""; });
  $("btnAgentApprove").addEventListener("click", approvePatch);
  $("btnAgentDiscard").addEventListener("click", discardPatch);

  // Admin
  $("btnAdminRun").addEventListener("click", runAdmin);
  $("btnAdminClear").addEventListener("click", () => { $("adminPrompt").value=""; $("adminOut").textContent="—"; });
  $("btnAdminApply").addEventListener("click", approvePatch);
  $("btnAdminDiscard").addEventListener("click", discardPatch);
}

function openTools(open) {
  const d = $("toolsDrawer");
  d.classList.toggle("open", !!open);
  d.setAttribute("aria-hidden", open ? "false" : "true");
  renderLogs();
}

function applyDockSetting() {
  const dock = $("dock");
  dock.classList.toggle("hidden", !settings.dock);
  $("toggleDock").checked = !!settings.dock;
}

function renderAppsList() {
  const box = $("appsList");
  box.innerHTML = "";
  const slugs = Object.keys(state.apps);
  if (!slugs.length) {
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = "Nenhum app salvo ainda.";
    box.appendChild(div);
    return;
  }

  slugs.sort().forEach(slug => {
    const app = state.apps[slug];
    const row = document.createElement("div");
    row.className = "app-item";

    const left = document.createElement("div");
    left.innerHTML = `<b>${app.name}</b><div class="hint">${slug} • pwa</div>`;

    const right = document.createElement("div");
    if (state.active === slug) {
      right.innerHTML = `<span class="badge">ativo</span>`;
    } else {
      const btn = document.createElement("button");
      btn.className = "btn small";
      btn.textContent = "Ativar";
      btn.addEventListener("click", () => {
        state.active = slug;
        saveState(state);
        renderAll();
        log(`active -> ${slug}`);
      });
      right.appendChild(btn);
    }

    row.appendChild(left);
    row.appendChild(right);
    box.appendChild(row);
  });
}

let currentFile = "index.html";

function renderEditor() {
  ensureActive();

  const label = $("activeAppLabel");
  if (!state.active || !state.apps[state.active]) {
    label.textContent = "— (crie um app primeiro)";
    $("filesList").innerHTML = "";
    $("currentFileLabel").textContent = "—";
    $("fileContent").value = "";
    return;
  }

  const app = state.apps[state.active];
  label.textContent = `${app.name} (${app.slug})`;

  const filesList = $("filesList");
  filesList.innerHTML = "";

  const files = Object.keys(app.files);
  if (!files.includes(currentFile)) currentFile = files[0];

  files.forEach(fn => {
    const item = document.createElement("div");
    item.className = "file-item" + (fn === currentFile ? " active" : "");
    item.textContent = fn;
    item.addEventListener("click", () => {
      currentFile = fn;
      renderEditor();
    });
    filesList.appendChild(item);
  });

  $("currentFileLabel").textContent = currentFile;
  $("fileContent").value = app.files[currentFile] ?? "";
}

function saveCurrentFile() {
  if (!state.active) return;
  const app = state.apps[state.active];
  if (!app) return;

  app.files[currentFile] = $("fileContent").value;
  app.updatedAt = now();
  saveState(state);
  setStatus("Salvo", true);
  log(`file saved: ${state.active}/${currentFile}`);
}

function resetCurrentFile() {
  if (!state.active) return;
  const app = state.apps[state.active];
  if (!app) return;

  const base = DEFAULT_FILES();
  if (base[currentFile] != null) {
    app.files[currentFile] = base[currentFile];
    $("fileContent").value = base[currentFile];
    app.updatedAt = now();
    saveState(state);
    log(`file reset: ${state.active}/${currentFile}`);
  } else {
    log(`reset ignorado: arquivo sem base ${currentFile}`);
  }
}

function createApp(name, slug) {
  slug = (slug || "").trim().toLowerCase().replace(/[^a-z0-9-_]/g,"-");
  name = (name || "").trim();

  if (!slug || !name) {
    setStatus("Nome/slug inválidos", false);
    return { ok:false, msg:"Nome/slug inválidos" };
  }
  if (state.apps[slug]) {
    setStatus("Slug já existe", false);
    return { ok:false, msg:"Slug já existe" };
  }

  const files = DEFAULT_FILES();
  // personaliza
  files["index.html"] = files["index.html"].replace("<title>Meu App</title>", `<title>${name}</title>`);
  files["manifest.json"] = files["manifest.json"].replace(`"name": "Meu App"`, `"name": "${name}"`)
                                               .replace(`"short_name": "App"`, `"short_name": "${name.slice(0,12)}"`);

  state.apps[slug] = { name, slug, files, createdAt: now(), updatedAt: now() };
  state.active = slug;
  saveState(state);
  log(`app created: ${name} (${slug})`);
  setStatus("Criado", true);
  return { ok:true, msg:`Criado: ${name} (${slug})` };
}

function createFromForm() {
  const name = $("newName").value;
  const slug = $("newSlug").value;
  const r = createApp(name, slug);
  if (r.ok) showView("editor");
}

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBackup() {
  const payload = {
    exportedAt: now(),
    state,
    settings,
    logs: getLogs()
  };
  downloadJSON(`rcf-backup-${Date.now()}.json`, payload);
  log("backup exportado");
}

function downloadActiveApp() {
  ensureActive();
  if (!state.active || !state.apps[state.active]) return;
  const app = state.apps[state.active];
  downloadJSON(`${app.slug}-${Date.now()}.json`, app);
  log("app ativo exportado");
}

function buildDiagnostic() {
  const ua = navigator.userAgent;
  const slugs = Object.keys(state.apps);
  return [
    "RCF DIAGNÓSTICO",
    `mode: ${state.mode}`,
    `apps: ${slugs.length}`,
    `active: ${state.active || "-"}`,
    `ua: ${ua}`,
    `dock: ${settings.dock ? "on" : "off"}`
  ].join("\n");
}

function renderSettings() {
  $("diagBox").textContent = buildDiagnostic();
  applyDockSetting();
}

function renderLogs() {
  $("logsBox").textContent = getLogs() || "—";
}

function clearPWACache() {
  if (!("caches" in window)) {
    log("cache API indisponível");
    return;
  }
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => {
    log("cache PWA limpo");
    setStatus("Cache limpo", true);
  });
}

function previewActive() {
  ensureActive();
  if (!state.active || !state.apps[state.active]) return;
  const app = state.apps[state.active];

  // monta preview em uma nova aba usando Blob URL (offline)
  const html = app.files["index.html"] || "<h1>Sem index.html</h1>";
  const css = app.files["styles.css"] || "";
  const js = app.files["app.js"] || "";

  const preview = html
    .replace(`<link rel="stylesheet" href="styles.css" />`, `<style>${css}</style>`)
    .replace(`<script src="app.js"></script>`, `<script>${js}<\/script>`);

  const blob = new Blob([preview], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  log("preview aberto");
}

/* ---------------------------
   PATCH / SUGESTÃO (manual)
----------------------------*/
function setPatch(patch) {
  localStorage.setItem(LS_PATCH, JSON.stringify(patch || null));
}
function getPatch() {
  try { return JSON.parse(localStorage.getItem(LS_PATCH) || "null"); }
  catch { return null; }
}
function discardPatch() {
  setPatch(null);
  $("agentOut").textContent = "—";
  $("adminOut").textContent = "—";
  log("patch descartado");
}
function approvePatch() {
  const patch = getPatch();
  if (!patch) {
    log("sem patch para aplicar");
    return;
  }
  // patch: {type:'write_file', slug, filename, content}
  if (patch.type === "write_file") {
    const app = state.apps[patch.slug];
    if (!app) return log("patch: app não existe");
    app.files[patch.filename] = patch.content;
    app.updatedAt = now();
    state.active = patch.slug;
    saveState(state);
    log(`patch aplicado: ${patch.slug}/${patch.filename}`);
    setPatch(null);
    setStatus("Patch aplicado", true);
    renderAll();
  } else {
    log("patch: tipo não suportado");
  }
}

/* ---------------------------
   AGENT (comandos)
----------------------------*/
function runAgent() {
  const raw = ($("agentInput").value || "").trim();
  if (!raw) return;
  const out = agentHandle(raw);
  $("agentOut").textContent = out;
}

function agentHandle(cmd) {
  const parts = cmd.split(" ");
  const head = (parts[0] || "").toLowerCase();

  if (head === "help") {
    return [
      "AGENT HELP",
      "- help",
      "- list",
      "- create NOME SLUG",
      "- select SLUG",
      "- open editor | open dashboard",
      "- set file NOMEARQ (ex: app.js)",
      "- write (depois cole o conteúdo no campo, usando: write <<< ... >>>)",
      "- show (mostra arquivo atual)",
      "- apply (aplica patch pendente)"
    ].join("\n");
  }

  if (head === "list") {
    const slugs = Object.keys(state.apps);
    return slugs.length ? ("Apps:\n- " + slugs.join("\n- ")) : "Nenhum app salvo.";
  }

  if (head === "create") {
    const name = parts.slice(1, -1).join(" ");
    const slug = parts[parts.length - 1];
    const r = createApp(name, slug);
    return r.msg;
  }

  if (head === "select") {
    const slug = (parts[1] || "").trim();
    if (!state.apps[slug]) return "App não encontrado.";
    state.active = slug;
    saveState(state);
    return `Ativo: ${slug}`;
  }

  if (head === "open") {
    const where = (parts[1] || "").toLowerCase();
    if (where === "editor") showView("editor");
    else showView("dashboard");
    return `Abrindo: ${where || "dashboard"}`;
  }

  // set file
  if (head === "set" && (parts[1] || "").toLowerCase() === "file") {
    const fn = parts.slice(2).join(" ").trim();
    if (!fn) return "Use: set file app.js";
    currentFile = fn;
    renderEditor();
    return `Arquivo atual: ${currentFile}`;
  }

  // show file
  if (head === "show") {
    ensureActive();
    if (!state.active) return "Sem app ativo.";
    const app = state.apps[state.active];
    return app.files[currentFile] ?? "(vazio)";
  }

  // write <<< ... >>>
  if (head === "write") {
    const m = cmd.match(/write\s+<<<([\s\S]*?)>>>/);
    if (!m) {
      return "Formato: write <<< (cole aqui o conteúdo do arquivo) >>>";
    }
    ensureActive();
    if (!state.active) return "Sem app ativo.";
    const app = state.apps[state.active];
    const content = m[1].replace(/^\n/, "");

    // gera patch (você aprova)
    const patch = { type:"write_file", slug: state.active, filename: currentFile, content };
    setPatch(patch);
    return [
      "Sugestão criada ✅",
      `- app: ${state.active}`,
      `- file: ${currentFile}`,
      "Aperte: Aprovar sugestão"
    ].join("\n");
  }

  if (head === "apply") {
    approvePatch();
    return "Aplicando patch (se existir)...";
  }

  return "Comando não reconhecido. Use: help";
}

/* ---------------------------
   ADMIN (simples, manual)
----------------------------*/
function runAdmin() {
  const text = ($("adminPrompt").value || "").trim();
  if (!text) return;

  // Admin aqui não é “IA real”; ele só monta plano + sugere patch quando fizer sentido
  // Você pode depois conectar com OpenAI ou outro motor.
  let plan = [
    "PLANO (offline):",
    "1) Entender pedido.",
    "2) Gerar patch mínimo e seguro.",
    "3) Você aprova manualmente.",
    "",
    "SUGESTÃO:"
  ];

  // Regras básicas
  if (/remover|sumir|tirar.*dock|bot(ã|a)o.*baixo/i.test(text)) {
    plan.push("- Desligar dock inferior (Settings > Dock OFF).");
    settings.dock = false;
    saveSettings(settings);
  } else {
    plan.push("- Sem patch automático (por enquanto).");
  }

  plan.push("", `Pedido: ${text}`);

  $("adminOut").textContent = plan.join("\n");
  log("admin gerou plano/sugestão");
  renderAll();
}

/* ---------------------------
   RENDER
----------------------------*/
function renderAll() {
  ensureActive();
  renderAppsList();
  renderEditor();
  renderSettings();
  renderLogs();

  // ativo label no editor
  if (state.active && state.apps[state.active]) {
    setStatus("OK", true);
  } else {
    setStatus("Sem app ativo", false);
  }
}

function initSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js")
    .then(() => log("SW registrado"))
    .catch(() => log("Falha SW"));
}

function boot() {
  saveState(state);
  applyDockSetting();
  wireTabs();
  initSW();

  // Primeira renderização
  renderAll();
  log("RCF init");
}

boot();
// ===== RCF Agent Router (WRITE MODE) — integração mínima =====
(function () {
  if (!window.RCF_AgentRouter || !window.RCF_AgentRouter.createRouter) {
    console.warn("RCF_AgentRouter não carregou. Verifique /app/js/agent.router.js no index.html.");
    return;
  }

  // Contexto mínimo (adapte se você já tem patch queue/apply):
  const agentCtx = {
    getCurrentFilePath() {
      // Tenta pegar um "arquivo atual" se existir no app.
      // Ajuste esses nomes se o seu app usa outra variável.
      return (window.RCF_CURRENT_FILE || window.currentFile || "").toString();
    },
    getFlags() {
      // Ajuste se você tem toggles reais:
      return {
        auto: !!window.RCF_AGENT_AUTO, // true => aplica direto quando seguro
        safe: !!window.RCF_AGENT_SAFE  // true => sempre pendente
      };
    },
    queuePatch(patch) {
      window.RCF_PATCH_QUEUE = window.RCF_PATCH_QUEUE || [];
      window.RCF_PATCH_QUEUE.push(patch);
      // Se você tiver UI de patch, aqui pode atualizar.
      console.log("PATCH pendente:", patch);
    },
    async applyPatch(patch) {
      // Se você já tem função de aplicar patch, conecte aqui:
      if (typeof window.RCF_applyPatch === "function") {
        return await window.RCF_applyPatch(patch);
      }
      // Sem applyPatch real -> força pendente
      throw new Error("applyPatch não disponível");
    },
    log(msg) {
      console.log("[AGENT]", msg);
    }
  };

  const router = window.RCF_AgentRouter.createRouter(agentCtx);
  window.RCF_AGENT_ROUTER = router; // debug

  // Helper para escrever resultado no painel "Resultado"
  function setAgentResult(text) {
    // Você pode adaptar para seu componente real.
    const el = document.querySelector("#agentResult, [data-agent-result], .agentResult");
    if (el) el.textContent = String(text || "");
  }

  // Executar (botão)
  async function onAgentExecute() {
    const inputEl =
      document.querySelector("#agentInput") ||
      document.querySelector("[data-agent-input]") ||
      document.querySelector("textarea[name='agentInput']") ||
      document.querySelector("input[name='agentInput']");

    const cmd = inputEl ? inputEl.value : "";
    const res = await router.handleInput(cmd);

    if (res && res.ok) setAgentResult(res.result || "OK");
    else setAgentResult((res && res.error) ? res.error : "Erro");

    // Se quiser limpar input quando não estiver em WRITE:
    const st = router.getState();
    if (inputEl && st.mode !== "WRITE") inputEl.value = "";
  }

  // Tenta bindar no botão existente
  const execBtn =
    document.querySelector("#agentExecuteBtn") ||
    document.querySelector("[data-agent-execute]");

  if (execBtn) {
    execBtn.addEventListener("click", function (e) {
      e.preventDefault();
      onAgentExecute();
    }, { passive: false });
  } else {
    // fallback: expõe função global
    window.RCF_AGENT_EXECUTE = onAgentExecute;
  }

  // Botão opcional “Colar/Inserir no arquivo atual”
  // Se existir um botão com id agentPasteBtn, ele vai abrir prompt e inserir.
  const pasteBtn = document.querySelector("#agentPasteBtn") || document.querySelector("[data-agent-paste]");
  if (pasteBtn) {
    pasteBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      const big = prompt("Cole aqui o texto/código (grande). Depois OK.");
      if (big == null) return;
      const res = await router.pasteIntoCurrentFile(big);
      if (res && res.ok) setAgentResult(res.result || "OK");
      else setAgentResult((res && res.error) ? res.error : "Erro");
    }, { passive: false });
  }
})();

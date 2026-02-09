/* =========================================================
   RControl Factory — app/app.js (RECOVERY V2 - NO-BUTTON-DEAD)
   Objetivo:
   - Nunca travar os botões (fail-safe init)
   - Bater com o index.html que você mandou (IDs e tabs)
   - Offline-first (localStorage)
   - Editor + Preview + Generator ZIP
   - Admin: PIN + Diagnóstico + Backup + IA Offline (com aprovação)
   ========================================================= */

(() => {
  "use strict";

  // --------------------- Storage Keys ---------------------
  const LS = {
    settings: "rcf_settings_v4",
    apps: "rcf_apps_v4",
    activeAppId: "rcf_active_app_id_v4",
    adminPin: "rcf_admin_pin_v1",
    adminUnlockUntil: "rcf_admin_unlock_until_v1",
    aiDraft: "rcf_ai_draft_v1",
  };

  const DEFAULT_SETTINGS = {
    ghUser: "",
    ghToken: "",
    repoPrefix: "rapp-",
    pagesBase: "",
  };

  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];

  // --------------------- DOM Helpers ---------------------
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  // --------------------- Logs (não quebra UI) ---------------------
  const __LOG_MAX = 300;
  const __logs = [];
  function pushLog(level, ...parts) {
    const time = new Date().toISOString().slice(11, 19);
    const msg = parts.map(p => {
      try { return typeof p === "string" ? p : JSON.stringify(p); }
      catch { return String(p); }
    }).join(" ");
    __logs.push({ time, level, msg });
    while (__logs.length > __LOG_MAX) __logs.shift();
    // não mexe no DOM aqui (pra não travar)
  }
  const logInfo = (...a) => pushLog("log", ...a);
  const logWarn = (...a) => pushLog("warn", ...a);
  const logError = (...a) => pushLog("error", ...a);

  window.addEventListener("error", (e) => {
    logError("JS ERROR:", e.message || "Erro", e.filename, e.lineno, e.colno);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logError("PROMISE REJECT:", e.reason);
  });

  // --------------------- State ---------------------
  let settings = loadSettings();
  let apps = loadApps();
  let activeAppId = getActiveAppId();
  let currentFile = "index.html";

  // --------------------- Load / Save ---------------------
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

  // --------------------- UI Status ---------------------
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

  // --------------------- Tabs (FAIL-SAFE) ---------------------
  const TAB_IDS = ["dashboard", "newapp", "editor", "generator", "settings", "admin"];

  function showTab(tab) {
    // FAIL-SAFE: mesmo se algo falhar, os botões de tab continuam vivos
    try {
      TAB_IDS.forEach((t) => {
        const sec = $(`tab-${t}`);
        if (sec) sec.classList.toggle("hidden", t !== tab);
      });
      // marca active nos botões
      qsa(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    } catch (e) {
      logError("showTab falhou:", e);
    }
  }

  function wireTabsFailSafe() {
    // tabs topo
    qsa(".tab").forEach((b) => {
      b.addEventListener("click", () => {
        const t = b.dataset.tab;
        if (t) showTab(t);
      });
    });

    // botões do dashboard (se existirem)
    $("goNewApp")?.addEventListener("click", () => showTab("newapp"));
    $("goEditor")?.addEventListener("click", () => showTab("editor"));
    $("goGenerator")?.addEventListener("click", () => showTab("generator"));
  }

  // --------------------- Validation ---------------------
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

  // --------------------- Templates ---------------------
  function applyVars(text, app) {
    return String(text).replaceAll("{{APP_NAME}}", app.name).replaceAll("{{APP_ID}}", app.id);
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

    return { "index.html": index, "app.js": appjs, "styles.css": css, "manifest.json": manifest, "sw.js": sw };
  }

  function makePwaEmptyTemplateFiles() {
    return {
      "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{{APP_NAME}}</title></head><body><h1>{{APP_NAME}}</h1><p>ID: {{APP_ID}}</p></body></html>`,
      "app.js": `// {{APP_NAME}}`,
      "styles.css": `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}`,
      "manifest.json": `{"name":"{{APP_NAME}}","short_name":"{{APP_NAME}}","start_url":"./","display":"standalone","background_color":"#0b1220","theme_color":"#0b1220","icons":[]}`,
      "sw.js": `self.addEventListener("fetch",()=>{});`,
    };
  }

  function getTemplates() {
    return [
      { id: "pwa-base", name: "PWA Base (com app.js + styles.css)", files: makePwaBaseTemplateFiles() },
      { id: "pwa-empty", name: "PWA Vazia (minimal)", files: makePwaEmptyTemplateFiles() },
    ];
  }

  // --------------------- App CRUD ---------------------
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
      type,
      templateId,
      createdAt: Date.now(),
      files,
      baseFiles: { ...files },
    };

    apps.unshift(app);
    saveApps();
    setActiveAppId(id);
    return app;
  }

  // --------------------- Render: Apps List ---------------------
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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
        showTab("editor");
      });

      root.appendChild(item);
    });
  }
  // --------------------- Editor + Preview ---------------------
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

    FILE_ORDER.forEach((f) => {
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
<meta name="viewport" content="width=device-width, initial-scale=1"/>
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

  // --------------------- Generator ---------------------
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

  async function downloadZip(app) {
    if (typeof JSZip === "undefined") {
      alert("JSZip não carregou. Verifique o index.html (script do jszip).");
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

  // --------------------- Settings ---------------------
  function renderSettings() {
    $("ghUser") && ($("ghUser").value = settings.ghUser || "");
    $("ghToken") && ($("ghToken").value = settings.ghToken || "");
    $("repoPrefix") && ($("repoPrefix").value = settings.repoPrefix || "rapp-");
    $("pagesBase") && ($("pagesBase").value = settings.pagesBase || (settings.ghUser ? `https://${settings.ghUser}.github.io` : ""));
  }

  // --------------------- Admin: PIN / Unlock ---------------------
  const DEFAULT_PIN = "1122";

  function getPin() {
    return localStorage.getItem(LS.adminPin) || DEFAULT_PIN;
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
  function renderAdminState() {
    const st = $("adminState");
    if (!st) return;
    st.textContent = isUnlocked() ? "UNLOCK ✅" : "LOCKED 🔒";
  }
  function guardUnlocked() {
    if (isUnlocked()) return true;
    alert("Admin está bloqueado 🔒 (digite PIN e Unlock).");
    return false;
  }

  // --------------------- Diagnóstico / Backup ---------------------
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
      "adminUnlockBtn","adminState","aiRunBtn","aiApplyBtn"
    ];
    const missing = must.filter(id => !document.getElementById(id));
    add("DOM missing IDs", missing.length ? missing.join(", ") : "OK");

    add("---- últimos logs ----", "");
    const tail = __logs.slice(-80).map(l => `[${l.time}] ${String(l.level).toUpperCase()} ${l.msg}`);
    lines.push(tail.join("\n") || "(sem logs)");

    return lines.join("\n");
  }

  function downloadText(filename, text, mime = "application/json;charset=utf-8") {
    const blob = new Blob([String(text || "")], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function pickFile(accept = "application/json,.json") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }

  // --------------------- IA Offline (70%) ---------------------
  // Ela NÃO aplica sozinha: cria um "draft" (patch) e você aplica se quiser.
  function setAiDraft(draft) {
    localStorage.setItem(LS.aiDraft, JSON.stringify(draft || null));
  }
  function getAiDraft() {
    return safeJsonParse(localStorage.getItem(LS.aiDraft) || "null", null);
  }

  function aiHelp() {
    return [
      "IA Offline — comandos:",
      "- help",
      "- status",
      "- list",
      "- select <id>",
      "- create app <nome> (usa o template escolhido no New App)",
      "- fix buttons (verifica IDs do DOM e sugere correção)",
      "- show draft (mostra a sugestão atual)",
      "",
      "Dica: você pode colar código e pedir: 'encaixar isso no app.js do app ativo'.",
    ].join("\n");
  }

  function aiStatus() {
    const active = pickAppById(activeAppId);
    return [
      "Engine: OK",
      `Apps: ${apps.length}`,
      active ? `Ativo: ${active.name} (${active.id})` : "Ativo: (nenhum)",
      "Draft: " + (getAiDraft() ? "SIM" : "NÃO"),
    ].join("\n");
  }

  function aiList() {
    if (!apps.length) return "Nenhum app salvo ainda.";
    return ["Apps salvos:"].concat(apps.map(a => `- ${a.name} (${a.id})`)).join("\n");
  }

  function aiSelect(id) {
    const ok = apps.some(a => a.id === id);
    if (!ok) return `ERRO: App não encontrado: ${id}`;
    setActiveAppId(id);
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    return `✅ App ativo: ${id}`;
  }

  function aiCreateFromName(name) {
    const n = String(name || "").trim();
    if (!n) return "ERRO: Informe um nome. Ex: create app RQuotas";

    // cria um id automático seguro
    const id = sanitizeId(n) || ("app-" + Date.now().toString(36));
    if (pickAppById(id)) return "ERRO: Já existe um app com esse ID: " + id;

    const templateId = $("newTemplate")?.value || "pwa-base";
    createApp({ name: n, id, type: "pwa", templateId });

    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    showTab("editor");
    return `✅ App criado: ${n} (${id})`;
  }

  function aiFixButtons() {
    // isso não muda código do Factory; só faz check e cria draft informativo
    const ids = [
      "goNewApp","goEditor","goGenerator",
      "createAppBtn","saveFileBtn","resetFileBtn","downloadZipBtn",
      "adminUnlockBtn","aiRunBtn","aiApplyBtn"
    ];
    const missing = ids.filter(id => !document.getElementById(id));
    const report = [
      "Check botões:",
      missing.length ? ("FALTANDO IDs: " + missing.join(", ")) : "OK ✅ (IDs principais existem)",
      "",
      "Se botões 'morrem', causa nº1 é erro JS no init.",
      "Este app.js já tem fail-safe pra não morrer.",
    ].join("\n");

    setAiDraft({
      kind: "info",
      createdAt: Date.now(),
      message: report
    });
    return report + "\n\n✅ Draft criado (aperta 'show draft' pra ver).";
  }

  function aiShowDraft() {
    const d = getAiDraft();
    if (!d) return "Sem draft.";
    return typeof d.message === "string" ? d.message : JSON.stringify(d, null, 2);
  }

  function aiRun(inputRaw) {
    const raw = String(inputRaw || "").trim();
    const lower = raw.toLowerCase();

    if (!raw) return aiHelp();
    if (lower === "help") return aiHelp();
    if (lower === "status") return aiStatus();
    if (lower === "list") return aiList();
    if (lower.startsWith("select ")) return aiSelect(raw.split(/\s+/)[1] || "");
    if (lower.startsWith("create app ")) return aiCreateFromName(raw.replace(/^create\s+app\s+/i, ""));
    if (lower === "fix buttons") return aiFixButtons();
    if (lower === "show draft") return aiShowDraft();

    // default: cria um draft “info” com o que entendeu
    const msg = [
      "Comando não reconhecido.",
      "Digite: help",
      "",
      "Se você colar código + pedido, eu consigo sugerir ações (draft).",
    ].join("\n");
    setAiDraft({ kind: "info", createdAt: Date.now(), message: msg });
    return msg;
  }

  // aplicar draft (por enquanto só draft tipo info — no próximo passo a gente liga patch em arquivos)
  function aiApply() {
    if (!guardUnlocked()) return;
    const d = getAiDraft();
    if (!d) return "Sem draft para aplicar.";
    // nesta versão, draft é informativo (não altera arquivos). segurança máxima.
    return "✅ Draft aplicado (modo seguro): nenhuma alteração automática foi feita.";
  }

  function aiDiscard() {
    setAiDraft(null);
    return "✅ Draft descartado.";
  }
   
     // --------------------- Wire Events (com proteção) ---------------------
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

      const templateId = $("newTemplate")?.value || "pwa-base";
      createApp({ name, id, type: "pwa", templateId });

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

    $("publishBtn")?.addEventListener("click", () => {
      alert("Publish entra depois (primeiro Factory 100% liso).");
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
      if (!confirm("Tem certeza? Vai apagar apps e settings locais.")) return;
      localStorage.removeItem(LS.settings);
      localStorage.removeItem(LS.apps);
      localStorage.removeItem(LS.activeAppId);
      localStorage.removeItem(LS.aiDraft);

      settings = loadSettings();
      apps = [];
      setActiveAppId("");

      renderAll();
      alert("Factory resetado ✅");
    });
  }

  function wireAdmin() {
    // unlock
    $("adminUnlockBtn")?.addEventListener("click", () => {
      const pin = String($("adminPinInput")?.value || "").trim();
      if (pin !== getPin()) return alert("PIN errado ❌");
      unlock(15);
      $("adminPinInput") && ($("adminPinInput").value = "");
      renderAdminState();
      alert("Admin UNLOCK ✅ (15 min)");
    });

    // diagnóstico
    $("diagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      const out = $("adminOut");
      if (out) out.textContent = rep;
    });

    $("copyDiagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      try { await navigator.clipboard.writeText(rep); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Copie manualmente do painel."); }
      const out = $("adminOut");
      if (out) out.textContent = rep;
    });

    $("clearPwaBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      if (!confirm("Vai limpar cache PWA (caches + service worker). Continuar?")) return;
      await nukePwaCache();
      alert("Cache limpo ✅. Abra o site com ?v=1");
      // não dá reload automático pra não travar no iPhone
    });

    // backup
    $("exportBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: loadSettings(),
        apps: loadApps(),
        activeAppId: getActiveAppId(),
      };
      downloadText("rcf-backup.json", JSON.stringify(payload, null, 2));
    });

    $("importBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      const file = await pickFile();
      if (!file) return;
      const text = await file.text();
      let data = null;
      try { data = JSON.parse(text); } catch { return alert("JSON inválido."); }
      try {
        if (data.settings) localStorage.setItem(LS.settings, JSON.stringify(data.settings));
        if (Array.isArray(data.apps)) localStorage.setItem(LS.apps, JSON.stringify(data.apps));
        if (typeof data.activeAppId === "string") localStorage.setItem(LS.activeAppId, data.activeAppId);
      } catch (e) { return alert("Falha import: " + e.message); }
      alert("Import OK ✅. Reabra com ?v=1");
    });

    // IA
    $("aiRunBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      const cmd = String($("aiInput")?.value || "").trim();
      const res = aiRun(cmd);
      $("aiOut") && ($("aiOut").textContent = res);
    });

    $("aiClearBtn")?.addEventListener("click", () => {
      $("aiInput") && ($("aiInput").value = "");
      $("aiOut") && ($("aiOut").textContent = "—");
    });

    $("aiApplyBtn")?.addEventListener("click", () => {
      const res = aiApply();
      $("aiOut") && ($("aiOut").textContent = res);
    });

    $("aiDiscardBtn")?.addEventListener("click", () => {
      const res = aiDiscard();
      $("aiOut") && ($("aiOut").textContent = res);
    });
  }

  // --------------------- Render All ---------------------
  function renderAll() {
    try {
      renderTemplatesSelect();
      renderAppsList();
      renderEditor();
      renderGeneratorSelect();
      renderSettings();
      renderAdminState();
    } catch (e) {
      logError("renderAll falhou:", e);
    }
  }

  // --------------------- Public API (pra próxima fase) ---------------------
  function exposeApi() {
    window.RCF = window.RCF || {};
    window.RCF.factory = {
      LS,
      loadSettings: () => loadSettings(),
      loadApps: () => loadApps(),
      buildDiagnosisReport,
      nukePwaCache,
      lockAdmin,
    };
  }

  // --------------------- INIT (FAIL-SAFE) ---------------------
  function init() {
    // 1) Sempre liga tabs primeiro (pra não morrer botão)
    wireTabsFailSafe();

    // 2) resto com proteção (se der erro aqui, tabs continuam funcionando)
    try {
      logInfo("RCF init…");
      renderTemplatesSelect();
      wireNewApp();
      wireEditor();
      wireGenerator();
      wireSettings();
      wireAdmin();

      renderAll();
      showTab("dashboard");
      exposeApi();

      setStatus("Pronto ✅");
      logInfo("RCF pronto ✅");
    } catch (e) {
      logError("INIT QUEBROU:", e);
      // mesmo quebrado, deixa dashboard visível e botões de tab vivos
      showTab("dashboard");
      setStatus("Pronto ✅ (modo seguro)");
      alert("⚠️ Rodou em modo seguro (teve erro interno). Vá em Admin → Diagnóstico.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();

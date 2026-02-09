/* =========================================================
   RControl Factory — app/app.js (STABLE / OFFLINE-FIRST)
   - Sem mexer no core: só este arquivo.
   - Admin PIN: padrão 1122
   - Emergência: digitar 0000 no Unlock => reseta PIN pra 1122 e destrava
   - Seed: cria "RControl Demo" se apps estiver vazio
   - IA Offline (70%): sugestões + aplicar manual
   ========================================================= */

(function () {
  "use strict";

  // ===================== Storage keys =====================
  const LS = {
    settings: "rcf_settings_v3",
    apps: "rcf_apps_v3",
    activeAppId: "rcf_active_app_id_v3",
    adminPin: "rcf_admin_pin_v1",
    adminUnlockUntil: "rcf_admin_unlock_until_v1",
  };

  const DEFAULT_PIN = "1122";

  const DEFAULT_SETTINGS = {
    ghUser: "",
    ghToken: "",
    repoPrefix: "rapp-",
    pagesBase: "",
    openaiKey: "",
    openaiModel: "gpt-4.1",
  };

  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];

  // ===================== DOM helpers =====================
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ===================== Logs (iPhone friendly) =====================
  const __LOG_MAX = 300;
  const __logs = [];
  function pushLog(level, parts) {
    const time = new Date().toISOString().slice(11, 19);
    const msg = (parts || []).map((p) => {
      try { return typeof p === "string" ? p : JSON.stringify(p); }
      catch { return String(p); }
    }).join(" ");
    __logs.push({ time, level, msg });
    while (__logs.length > __LOG_MAX) __logs.shift();
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
    localStorage.setItem(LS.settings, JSON.stringify(state.settings));
  }

  function loadApps() {
    const raw = localStorage.getItem(LS.apps);
    return raw ? safeJsonParse(raw, []) : [];
  }
  function saveApps() {
    localStorage.setItem(LS.apps, JSON.stringify(state.apps));
  }

  function setActiveAppId(id) {
    state.activeAppId = id || "";
    localStorage.setItem(LS.activeAppId, state.activeAppId);
  }
  function getActiveAppId() {
    return localStorage.getItem(LS.activeAppId) || "";
  }

  // ===================== Admin PIN =====================
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

  // ===================== State =====================
  const state = {
    settings: loadSettings(),
    apps: loadApps(),
    activeAppId: getActiveAppId(),
    currentFile: "index.html",
    aiSuggestion: null, // {type, payload}
  };

  // ===================== UI status =====================
  function setStatus(msg) {
    const el = $("statusBox");
    if (el) el.textContent = msg;
    logInfo("STATUS:", msg);
  }
  function setAdminOut(msg) {
    const el = $("adminOut");
    if (el) el.textContent = msg || "—";
  }
  function setAiOut(msg) {
    const el = $("aiOut");
    if (el) el.textContent = msg || "—";
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
      .trim().toLowerCase()
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

  // ===================== Templates (base) =====================
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
  out.textContent = "Funcionando! " + new Date().toLocaleString();
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
    try{ return await fetch(e.request); }
    catch{ return caches.match("./index.html"); }
  })());
});`;

    return { "index.html": index, "app.js": appjs, "styles.css": css, "manifest.json": manifest, "sw.js": sw };
  }

  function getTemplates() {
    return [{ id: "pwa-base", name: "PWA Base (com app.js + styles.css)", files: makePwaBaseTemplateFiles() }];
  }
     // ===================== App CRUD =====================
  function pickAppById(id) {
    return state.apps.find((a) => a && a.id === id) || null;
  }

  function ensureActiveApp() {
    if (state.activeAppId && pickAppById(state.activeAppId)) return;
    if (state.apps.length) setActiveAppId(state.apps[0].id);
    else setActiveAppId("");
  }

  function createApp({ name, id, type, templateId }) {
    const tpl = getTemplates().find((t) => t.id === templateId) || getTemplates()[0];
    const files = {};
    Object.keys(tpl.files).forEach((k) => { files[k] = applyVars(tpl.files[k], { name, id }); });

    const app = {
      name, id, type: type || "pwa", templateId,
      createdAt: Date.now(),
      files,
      baseFiles: { ...files },
    };

    state.apps.unshift(app);
    saveApps();
    setActiveAppId(id);
    return app;
  }

  function seedIfEmpty() {
    const list = loadApps();
    if (Array.isArray(list) && list.length) return;
    // cria demo pra você ver tudo funcionando sempre
    state.apps = [];
    createApp({ name: "RControl Demo", id: "rcontrol-demo", type: "pwa", templateId: "pwa-base" });
    setStatus("Demo criado automaticamente ✅");
  }

  // ===================== Preview =====================
  function injectIntoFullHtml(fullHtml, css, js) {
    let out = String(fullHtml);
    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `<style>${css}</style>\n</head>`);
    else out = `<style>${css}</style>\n` + out;
    if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `<script>${js}<\/script>\n</body>`);
    else out = out + `\n<script>${js}<\/script>\n`;
    return out;
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
      : `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;

    frame.srcdoc = doc;
  }

  // ===================== Render =====================
  function renderAppsList() {
    ensureActiveApp();
    const root = $("appsList");
    if (!root) return;

    root.innerHTML = "";
    if (!state.apps.length) {
      root.innerHTML = `<div class="muted">Nenhum app salvo ainda.</div>`;
      return;
    }

    state.apps.forEach((a) => {
      const item = document.createElement("div");
      item.className = "item";
      const isOn = a.id === state.activeAppId;

      item.innerHTML = `
        <div>
          <strong>${escapeHtml(a.name)}</strong>
          <div class="meta">${escapeHtml(a.id)} • ${escapeHtml(a.type || "pwa")}</div>
        </div>
        <span class="badge ${isOn ? "on" : ""}">${isOn ? "ativo" : "selecionar"}</span>
      `;

      item.addEventListener("click", () => {
        setActiveAppId(a.id);
        setStatus(\`App ativo: ${a.name} (${a.id}) ✅\`);
        renderAll();
      });

      root.appendChild(item);
    });
  }

  function renderEditor() {
    ensureActiveApp();
    const app = pickAppById(state.activeAppId);

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

    if (!FILE_ORDER.includes(state.currentFile)) state.currentFile = "index.html";

    FILE_ORDER.forEach((f) => {
      const b = document.createElement("button");
      b.className = "fileBtn" + (f === state.currentFile ? " active" : "");
      b.textContent = f;
      b.addEventListener("click", () => {
        state.currentFile = f;
        renderEditor();
      });
      fl.appendChild(b);
    });

    cur.textContent = state.currentFile;
    area.value = app.files[state.currentFile] ?? "";
    refreshPreview(app);
  }

  function renderGeneratorSelect() {
    ensureActiveApp();
    const sel = $("genAppSelect");
    if (!sel) return;

    sel.innerHTML = "";
    state.apps.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = `${a.name} (${a.id})`;
      sel.appendChild(opt);
    });

    if (state.activeAppId) sel.value = state.activeAppId;
  }

  function renderSettings() {
    if ($("ghUser")) $("ghUser").value = state.settings.ghUser || "";
    if ($("ghToken")) $("ghToken").value = state.settings.ghToken || "";
    if ($("repoPrefix")) $("repoPrefix").value = state.settings.repoPrefix || "rapp-";
    if ($("pagesBase")) $("pagesBase").value = state.settings.pagesBase || (state.settings.ghUser ? `https://${state.settings.ghUser}.github.io` : "");
  }

  function renderAdminState() {
    const st = $("adminState");
    if (st) st.textContent = isUnlocked() ? "UNLOCK ✅" : "LOCKED 🔒";
  }

  // ===================== ZIP =====================
  async function downloadZip(app) {
    if (typeof JSZip === "undefined") {
      alert("JSZip não carregou. Verifique o index.html (script do jszip).");
      return;
    }
    const zip = new JSZip();
    Object.entries(app.files).forEach(([path, content]) => zip.file(path, String(content ?? "")));
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

  // ===================== PWA cache nuke (CUIDADO) =====================
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

    add("---- últimos logs ----", "");
    const tail = __logs.slice(-80).map(l => `[${l.time}] ${String(l.level).toUpperCase()} ${l.msg}`);
    lines.push(tail.join("\n") || "(sem logs)");

    return lines.join("\n");
  }

  // ===================== IA Offline (70%) =====================
  function aiSuggest(inputRaw) {
    const input = String(inputRaw || "").trim();
    if (!input) return { text: "Digite um comando. Ex: help | list | create app AgroControl | select agrocontrol", suggestion: null };

    const low = input.toLowerCase();

    if (low === "help") {
      return {
        text:
`Comandos:
- help
- status
- list
- create app <Nome>   (cria id automático)
- select <id>
- export
- diag`,
        suggestion: null
      };
    }

    if (low === "status") {
      ensureActiveApp();
      const app = pickAppById(state.activeAppId);
      return { text: `Apps: ${state.apps.length} | Ativo: ${app ? app.name + " (" + app.id + ")" : "—"} | Admin: ${isUnlocked() ? "UNLOCK" : "LOCKED"}`, suggestion: null };
    }

    if (low === "list") {
      const list = state.apps.map(a => `- ${a.name} (${a.id})`).join("\n") || "(vazio)";
      return { text: list, suggestion: null };
    }

    if (low.startsWith("create app ")) {
      const name = input.slice("create app ".length).trim();
      if (!name) return { text: "Faltou o nome. Ex: create app AgroControl", suggestion: null };
      const id = sanitizeId(name);
      if (!id) return { text: "Nome inválido.", suggestion: null };
      if (pickAppById(id)) return { text: `Já existe app com id ${id}.`, suggestion: null };

      return {
        text: `Sugestão pronta: criar app "${name}" com id "${id}". (Toque em "Aplicar sugestão")`,
        suggestion: { type: "createApp", payload: { name, id, type: "pwa", templateId: "pwa-base" } }
      };
    }

    if (low.startsWith("select ")) {
      const id = sanitizeId(input.slice("select ".length));
      if (!id) return { text: "Faltou o id. Ex: select agrocontrol", suggestion: null };
      if (!pickAppById(id)) return { text: `Não achei esse id: ${id}`, suggestion: null };

      return {
        text: `Sugestão pronta: selecionar app ativo "${id}". (Toque em "Aplicar sugestão")`,
        suggestion: { type: "selectApp", payload: { id } }
      };
    }

    if (low === "export") {
      return {
        text: `Sugestão pronta: exportar backup JSON. (Toque em "Aplicar sugestão")`,
        suggestion: { type: "exportBackup", payload: {} }
      };
    }

    if (low === "diag") {
      return {
        text: `Sugestão pronta: rodar diagnóstico. (Toque em "Aplicar sugestão")`,
        suggestion: { type: "diag", payload: {} }
      };
    }

    return { text: "Não entendi. Digite: help", suggestion: null };
  }

  async function aiApply(suggestion) {
    if (!suggestion) return;

    if (suggestion.type === "createApp") {
      createApp(suggestion.payload);
      renderAll();
      showTab("editor");
      setStatus(`App criado: ${suggestion.payload.name} (${suggestion.payload.id}) ✅`);
      return;
    }

    if (suggestion.type === "selectApp") {
      setActiveAppId(suggestion.payload.id);
      renderAll();
      showTab("editor");
      setStatus(`App ativo: ${suggestion.payload.id} ✅`);
      return;
    }

    if (suggestion.type === "exportBackup") {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: loadSettings(),
        apps: loadApps(),
        activeAppId: getActiveAppId(),
      };
      downloadText("rcf-backup.json", JSON.stringify(payload, null, 2));
      return;
    }

    if (suggestion.type === "diag") {
      const rep = await buildDiagnosisReport();
      setAdminOut(rep);
      return;
    }
  }

  // ===================== download utils =====================
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

  function pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }

  // ===================== Wire Events =====================
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
        name, id,
        type: $("newType")?.value || "pwa",
        templateId: $("newTemplate")?.value || "pwa-base",
      });

      nameEl.value = "";
      idEl.value = "";
      if (valEl) valEl.textContent = "OK ✅";

      setStatus(`App criado: ${name} (${id}) ✅`);
      renderAll();
      showTab("editor");
    });

    $("cancelNew")?.addEventListener("click", () => showTab("dashboard"));
  }

  function wireEditor() {
    $("saveFileBtn")?.addEventListener("click", () => {
      const app = pickAppById(state.activeAppId);
      if (!app) return alert("Nenhum app ativo.");

      app.files[state.currentFile] = $("codeArea")?.value ?? "";
      saveApps();

      setStatus(`Salvo: ${state.currentFile} ✅`);
      renderEditor();
    });

    $("resetFileBtn")?.addEventListener("click", () => {
      const app = pickAppById(state.activeAppId);
      if (!app) return alert("Nenhum app ativo.");
      if (!confirm(`Resetar ${state.currentFile} para o padrão do template?`)) return;

      app.files[state.currentFile] = app.baseFiles?.[state.currentFile] ?? "";
      saveApps();

      setStatus(`Reset: ${state.currentFile} ✅`);
      renderEditor();
    });

    $("openPreviewBtn")?.addEventListener("click", () => {
      const app = pickAppById(state.activeAppId);
      if (!app) return;
      refreshPreview(app);
      setStatus("Preview atualizado ✅");
    });
  }

  function wireGenerator() {
    $("genAppSelect")?.addEventListener("change", () => {
      setActiveAppId($("genAppSelect").value);
      renderAll();
    });

    $("downloadZipBtn")?.addEventListener("click", async () => {
      const app = pickAppById($("genAppSelect")?.value || state.activeAppId);
      if (!app) return alert("Selecione um app.");

      setGenStatus("Status: gerando ZIP…");
      await downloadZip(app);
      setGenStatus("Status: ZIP pronto ✅");
    });

    $("publishBtn")?.addEventListener("click", () => {
      alert("Publish fica pra etapa 2. Agora é Factory estável + templates + comandos.");
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
      state.settings.ghUser = ($("ghUser")?.value || "").trim();
      state.settings.ghToken = ($("ghToken")?.value || "").trim();
      state.settings.repoPrefix = ($("repoPrefix")?.value || "rapp-").trim() || "rapp-";
      state.settings.pagesBase = ($("pagesBase")?.value || "").trim() || (state.settings.ghUser ? `https://${state.settings.ghUser}.github.io` : "");

      saveSettings();
      setStatus("Settings salvas ✅");
      alert("Settings salvas ✅");
    });

    $("resetFactoryBtn")?.addEventListener("click", () => {
      if (!confirm("Tem certeza? Vai apagar apps e settings locais.")) return;
      localStorage.removeItem(LS.settings);
      localStorage.removeItem(LS.apps);
      localStorage.removeItem(LS.activeAppId);
      localStorage.removeItem(LS.adminPin);
      localStorage.removeItem(LS.adminUnlockUntil);

      state.settings = loadSettings();
      state.apps = [];
      setActiveAppId("");

      seedIfEmpty();
      renderAll();
      alert("Factory resetado ✅");
    });
  }

  function wireAdmin() {
    $("adminUnlockBtn")?.addEventListener("click", () => {
      const pin = String($("adminPinInput")?.value || "").trim();

      // emergência: 0000 reseta PIN pra 1122 e destrava
      if (pin === "0000") {
        setPin(DEFAULT_PIN);
        unlock(15);
        renderAdminState();
        alert("PIN resetado para 1122 ✅ (Admin destravado 15min)");
        $("adminPinInput").value = "";
        return;
      }

      const ok = pin === getPin();
      if (!ok) {
        renderAdminState();
        return alert("PIN errado ❌\nDica: digite 0000 pra resetar o PIN pra 1122.");
      }

      unlock(15);
      $("adminPinInput").value = "";
      renderAdminState();
      alert("Admin destravado ✅ (15min)");
    });

    $("diagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      setAdminOut(rep);
    });

    $("copyDiagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      try { await navigator.clipboard.writeText(rep); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Copie manual."); }
      setAdminOut(rep);
    });

    $("clearPwaBtn")?.addEventListener("click", async () => {
      if (!isUnlocked()) return alert("Admin bloqueado 🔒 (Unlock primeiro).");
      if (!confirm("Vai limpar caches + desregistrar SW e recarregar. Continuar?")) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

    $("exportBtn")?.addEventListener("click", () => {
      if (!isUnlocked()) return alert("Admin bloqueado 🔒 (Unlock primeiro).");
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
      if (!isUnlocked()) return alert("Admin bloqueado 🔒 (Unlock primeiro).");
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

      alert("Import OK ✅ Recarregando…");
      location.reload();
    });

    // IA offline
    $("aiRunBtn")?.addEventListener("click", () => {
      if (!isUnlocked()) return alert("Admin bloqueado 🔒 (Unlock primeiro).");
      const input = $("aiInput")?.value || "";
      const res = aiSuggest(input);
      state.aiSuggestion = res.suggestion || null;
      setAiOut(res.text);
    });

    $("aiClearBtn")?.addEventListener("click", () => {
      $("aiInput").value = "";
      state.aiSuggestion = null;
      setAiOut("—");
    });

    $("aiApplyBtn")?.addEventListener("click", async () => {
      if (!isUnlocked()) return alert("Admin bloqueado 🔒 (Unlock primeiro).");
      if (!state.aiSuggestion) return alert("Não tem sugestão pra aplicar.");
      await aiApply(state.aiSuggestion);
      state.aiSuggestion = null;
      setAiOut("Aplicado ✅");
    });

    $("aiDiscardBtn")?.addEventListener("click", () => {
      state.aiSuggestion = null;
      setAiOut("Descartado ✅");
    });
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

  function renderAll() {
    state.apps = loadApps();
    state.settings = loadSettings();
    state.activeAppId = getActiveAppId();

    renderTemplatesSelect();
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    renderSettings();
    renderAdminState();
  }

  // ===================== Init =====================
  function init() {
    logInfo("RCF init…");

    seedIfEmpty();

    wireTabs();
    wireNewApp();
    wireEditor();
    wireGenerator();
    wireSettings();
    wireAdmin();

    renderAll();
    showTab("dashboard");

    setStatus("Pronto ✅");
    logInfo("RCF pronto ✅");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();

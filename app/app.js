/* =========================================================
   RControl Factory — app.js (RECOVERY FULL / STABLE)
   - Offline-first (localStorage)
   - Dashboard / New App / Editor / Generator / Settings / Admin(tab)
   - Preview via iframe srcdoc
   - ZIP via JSZip (lib no index.html)
   - Diagnóstico + Cache PWA + Backup
   - Integra core/commands.js + core/ui_bindings.js (Replit-like Agent)
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

  // ===================== State =====================
  let settings = loadSettings();
  let apps = loadApps();
  let activeAppId = getActiveAppId();
  let currentFile = "index.html";

  // Agent shared state (usado pelo core/commands.js)
  window.RCF_STATE = window.RCF_STATE || { autoMode: false, safeMode: true, currentFile: "index.html" };

  // ===================== Logs (iPhone friendly) =====================
  const __LOG_MAX = 300;
  const __logs = [];

  function pushLog(level, parts) {
    const time = new Date().toISOString().slice(11, 19);
    const msg = (parts || []).map((p) => {
      try { return (typeof p === "string") ? p : JSON.stringify(p); }
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

  // ===================== UI status =====================
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

  // ===================== Tabs =====================
  // ⚠️ inclui ADMIN porque seu index.html tem essa aba
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

  // ===================== Templates =====================
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

  // ===================== App CRUD =====================
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

  // ===================== Render =====================
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
        setStatus(\`App ativo: ${a.name} (${a.id}) ✅\`);
        renderAppsList();
        renderEditor();
        renderGeneratorSelect();
      });

      root.appendChild(item);
    });
  }

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
    window.RCF_STATE.currentFile = currentFile;

    FILE_ORDER.forEach((f) => {
      const b = document.createElement("button");
      b.className = "fileBtn" + (f === currentFile ? " active" : "");
      b.textContent = f;
      b.addEventListener("click", () => {
        currentFile = f;
        window.RCF_STATE.currentFile = currentFile;
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
<meta name="viewport" content="width=device-width,initial-scale=1"/>
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

  function renderSettings() {
    if ($("ghUser")) $("ghUser").value = settings.ghUser || "";
    if ($("ghToken")) $("ghToken").value = settings.ghToken || "";
    if ($("repoPrefix")) $("repoPrefix").value = settings.repoPrefix || "rapp-";
    if ($("pagesBase")) $("pagesBase").value = settings.pagesBase || (settings.ghUser ? `https://${settings.ghUser}.github.io` : "");
  }

  // ===================== ZIP =====================
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

  function hasGitHubConfigured() {
    return !!(settings.ghUser && settings.ghToken);
  }

  // ===================== PWA cache nuke =====================
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
    const tail = __logs.slice(-60).map(l => `[${l.time}] ${String(l.level).toUpperCase()} ${l.msg}`);
    lines.push(tail.join("\n") || "(sem logs)");

    // módulos externos
    add("---- core modules ----", "");
    add("RCF_COMMANDS", window.RCF_COMMANDS ? "SIM" : "NÃO");
    add("RCF_PATCHSET", window.RCF_PATCHSET ? "SIM" : "NÃO");

    return lines.join("\n");
  }

  // ===================== Admin (tab) =====================
  const DEFAULT_PIN = "000"; // você disse que 000 funcionou
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
  function renderAdminState() {
    const el = $("adminState");
    if (!el) return;
    el.textContent = isUnlocked() ? "UNLOCK ✅" : "LOCKED 🔒";
  }

  function guardAdmin() {
    if (isUnlocked()) return true;
    alert("Admin bloqueado 🔒 (digite o PIN e desbloqueie)");
    return false;
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
        name,
        id,
        type: $("newType")?.value || "pwa",
        templateId: $("newTemplate")?.value || "pwa-base",
      });

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

    $("publishBtn")?.addEventListener("click", async () => {
      if (!hasGitHubConfigured()) {
        alert("Configure GitHub username + token em Settings primeiro.");
        showTab("settings");
        return;
      }
      alert("Publish ainda não está ligado nesta versão. Primeiro estabilizar 100%.");
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

      settings = loadSettings();
      apps = [];
      setActiveAppId("");

      renderAll();
      alert("Factory resetado ✅");
    });
  }

  function wireAdminTab() {
    // unlock
    $("adminUnlockBtn")?.addEventListener("click", () => {
      const v = String($("adminPinInput")?.value || "");
      if (v !== getPin()) return alert("PIN errado ❌");
      unlock(15);
      if ($("adminPinInput")) $("adminPinInput").value = "";
      renderAdminState();
      alert("Admin UNLOCK ✅ (15min)");
    });

    // diagnóstico
    $("diagBtn")?.addEventListener("click", async () => {
      const out = $("adminOut");
      if (!out) return;
      out.textContent = await buildDiagnosisReport();
    });

    $("copyDiagBtn")?.addEventListener("click", async () => {
      const out = $("adminOut");
      const txt = String(out?.textContent || "");
      try { await navigator.clipboard.writeText(txt); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Selecione e copie manual."); }
    });

    $("clearPwaBtn")?.addEventListener("click", async () => {
      if (!guardAdmin()) return;
      if (!confirm("Vai limpar caches + desregistrar SW e recarregar. Continuar?")) return;
      await nukePwaCache();
      alert("Cache limpo ✅");
      location.reload();
    });

    // backup export/import (simplão)
    $("exportBtn")?.addEventListener("click", () => {
      if (!guardAdmin()) return;
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
      if (!guardAdmin()) return;
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

    // agent buttons (se core/ui_bindings.js existir ele também liga, mas aqui garante)
    $("aiRunBtn")?.addEventListener("click", () => {
      const inp = $("aiInput");
      const out = $("aiOut");
      const cmd = String(inp?.value || "").trim();
      if (!cmd) return;
      const res = window.RCF_COMMANDS?.handle ? window.RCF_COMMANDS.handle(cmd, window.RCF_STATE) : "ERRO: core/commands.js não carregou.";
      if (out) out.textContent = String(res || "");
    });

    $("aiClearBtn")?.addEventListener("click", () => {
      if ($("aiInput")) $("aiInput").value = "";
    });

    $("aiApplyBtn")?.addEventListener("click", () => {
      const out = $("aiOut");
      const rep = window.RCF_PATCHSET?.applyAll ? window.RCF_PATCHSET.applyAll() : "Sem patchset.";
      if (out) out.textContent = String(rep || "");
      // atualiza tela
      apps = loadApps();
      activeAppId = getActiveAppId();
      renderAppsList();
      renderEditor();
      renderGeneratorSelect();
    });

    $("aiDiscardBtn")?.addEventListener("click", () => {
      window.RCF_PATCHSET?.clear?.();
      const out = $("aiOut");
      if (out) out.textContent = "(patches descartados)";
    });
  }

  // ===================== Render all =====================
  function renderAll() {
    renderTemplatesSelect();
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    renderSettings();
    renderAdminState();
  }

  // ===================== Utils =====================
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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

  // ===================== Init =====================
  function init() {
    logInfo("RCF init…");
    wireTabs();
    wireNewApp();
    wireEditor();
    wireGenerator();
    wireSettings();
    wireAdminTab();

    renderAll();
    showTab("dashboard");

    setStatus("Pronto ✅");
    logInfo("RCF pronto ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
// (fim do arquivo) — Parte 2 vazia de propósito.
// Se você colou a Parte 1 inteira, já está completo.
// Esta Parte 2 existe só pra garantir que o chat não cortou o final do arquivo.

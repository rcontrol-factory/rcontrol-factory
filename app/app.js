/* =========================================================
   RControl Factory — app/app.js (NO imports)
   - Offline-first (localStorage)
   - Dashboard / New App / Editor / Generator / Settings
   - Preview via iframe srcdoc
   - ZIP via JSZip (já incluso no index.html)
   ========================================================= */

(function () {
  "use strict";

  // ---------- Storage keys ----------
  const LS = {
    settings: "rcf_settings_v3",
    apps: "rcf_apps_v3",
    activeAppId: "rcf_active_app_id_v3",
  };

  const DEFAULT_SETTINGS = {
    ghUser: "",
    ghToken: "",
    repoPrefix: "rapp-",
    pagesBase: "", // ex: https://SEUUSER.github.io
    // OpenAI (opcional, se for usar depois)
    openaiKey: "",
    openaiModel: "gpt-4.1",
  };

  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function safeJsonParse(s, fallback) {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }

  // ---------- State ----------
  let settings = loadSettings();
  let apps = loadApps();
  let activeAppId = getActiveAppId();
  let currentFile = "index.html";

  // ---------- Load/Save ----------
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

  // ---------- UI status/log ----------
  function setStatus(msg) {
    const el = $("statusBox");
    if (el) el.textContent = msg;
  }
  function setGenStatus(msg) {
    const el = $("genStatus");
    if (el) el.textContent = msg;
  }
  function log(msg) {
    const el = $("logs");
    if (!el) return;
    const t = new Date().toLocaleTimeString();
    el.textContent += `[${t}] ${msg}\n`;
    el.scrollTop = el.scrollHeight;
  }
  function clearLogs() {
    const el = $("logs");
    if (el) el.textContent = "";
  }

  // ---------- Tabs ----------
  const TAB_IDS = ["dashboard", "newapp", "editor", "generator", "settings"];

  function showTab(tab) {
    TAB_IDS.forEach((t) => {
      const sec = $(`tab-${t}`);
      if (sec) sec.classList.toggle("hidden", t !== tab);
    });
    qsa(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
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

  // ---------- Templates ----------
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

  function applyVars(text, app) {
    return String(text)
      .replaceAll("{{APP_NAME}}", app.name)
      .replaceAll("{{APP_ID}}", app.id);
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

  // ---------- App CRUD ----------
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
  }

  // ---------- Render ----------
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

    // garante arquivo válido
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

    // Aqui a gente NÃO “injeta” <html> dentro de <body> (isso quebrava seu preview)
    // Então vamos montar um documento completo, usando os arquivos do app.
    const html = app.files["index.html"] || "<h1>Sem index.html</h1>";
    const css = app.files["styles.css"] || "";
    const js = app.files["app.js"] || "";

    // Se o index.html já for um documento completo, a gente mantém, mas injeta CSS/JS no final.
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

    // injeta CSS antes de </head>
    if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `<style>${css}</style>\n</head>`);
    } else {
      out = `<style>${css}</style>\n` + out;
    }

    // injeta JS antes de </body>
    if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, `<script>${js}<\/script>\n</body>`);
    } else {
      out = out + `\n<script>${js}<\/script>\n`;
    }

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
    if ($("pagesBase")) {
      $("pagesBase").value =
        settings.pagesBase ||
        (settings.ghUser ? `https://${settings.ghUser}.github.io` : "");
    }
  }

  // ---------- ZIP ----------
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

  // ---------- GitHub publish (esqueleto seguro) ----------
  // (deixa preparado, mas não quebra seu fluxo agora)
  function hasGitHubConfigured() {
    return !!(settings.ghUser && settings.ghToken);
  }

  // ---------- Wire Events ----------
  function wireTabs() {
    qsa(".tab").forEach((b) => {
      b.addEventListener("click", () => showTab(b.dataset.tab));
    });

    // botões rápidos do dashboard
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
      alert("Publish ainda não está ligado nesta versão limpa. Primeiro vamos estabilizar Factory 100%.");
    });

    $("copyLinkBtn")?.addEventListener("click", async () => {
      const linkEl = $("publishedLink");
      const link = linkEl?.href || "";
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
    $("saveSettingsBtn")?.addEventListener("click", () => {
      settings.ghUser = ($("ghUser")?.value || "").trim();
      settings.ghToken = ($("ghToken")?.value || "").trim();
      settings.repoPrefix = ($("repoPrefix")?.value || "rapp-").trim() || "rapp-";
      settings.pagesBase =
        ($("pagesBase")?.value || "").trim() ||
        (settings.ghUser ? `https://${settings.ghUser}.github.io` : "");

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

  // ---------- Render all ----------
  function renderAll() {
    renderTemplatesSelect();
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    renderSettings();
  }

  // ---------- Utils ----------
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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

  // garante depois do DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

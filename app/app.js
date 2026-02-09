/* =========================================================
   RControl Factory — app/app.js (ROTA 2 / BOOT + GUARD)
   - Core estável + módulos opcionais em /app/js
   - Não deixa UI travar (fallback se módulo falhar)
   - Admin PIN: "0000" reseta para "1122"
   - Unlock 15min + ações protegidas
   - Templates: usa catalog.js se existir; senão fallback interno
   ========================================================= */

(function () {
  "use strict";

  // ===================== Storage keys =====================
  const LS = {
    settings: "rcf_settings_v3",
    apps: "rcf_apps_v3",
    activeAppId: "rcf_active_app_id_v3",
    adminPin: "rcf_admin_pin_v2",
    adminUnlockUntil: "rcf_admin_unlock_until_v2",
  };

  const DEFAULT_SETTINGS = {
    ghUser: "",
    ghToken: "",
    repoPrefix: "rapp-",
    pagesBase: "",
    openaiKey: "",
    openaiModel: "gpt-4.1",
  };

  const FILE_ORDER = [
    "index.html",
    "app.js",
    "styles.css",
    "manifest.json",
    "sw.js",
    // extras (pwa-pro): terms/privacy/README entram no ZIP mesmo sem aparecer na lista
    "terms.html",
    "privacy.html",
    "README.md",
  ];

  // ===================== DOM helpers =====================
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  // ===================== Logs (iPhone friendly) =====================
  const __LOG_MAX = 300;
  const __logs = [];

  function pushLog(level, parts) {
    const time = new Date().toISOString().slice(11, 19);
    const msg = (parts || [])
      .map((p) => {
        try {
          if (typeof p === "string") return p;
          return JSON.stringify(p);
        } catch {
          return String(p);
        }
      })
      .join(" ");
    __logs.push({ time, level, msg });
    while (__logs.length > __LOG_MAX) __logs.shift();
  }

  function logInfo(...a) { pushLog("log", a); }
  function logWarn(...a) { pushLog("warn", a); }
  function logError(...a) { pushLog("error", a); }

  window.addEventListener("error", (e) => {
    logError("JS ERROR:", e.message || "Erro", e.filename, e.lineno, e.colno);
    showToast("Erro JS. Abra Admin > Diagnóstico.");
  });
  window.addEventListener("unhandledrejection", (e) => {
    logError("PROMISE REJECT:", e.reason);
    showToast("Erro em promessa. Abra Admin > Diagnóstico.");
  });

  // ===================== State =====================
  let settings = loadSettings();
  let apps = loadApps();
  let activeAppId = getActiveAppId();
  let currentFile = "index.html";

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

  // ===================== Toast =====================
  function showToast(text) {
    try {
      let t = document.getElementById("rcf-toast");
      if (!t) {
        t = document.createElement("div");
        t.id = "rcf-toast";
        t.style.cssText = `
          position:fixed; left:12px; right:12px; bottom:12px; z-index:999999;
          padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.18);
          background:rgba(0,0,0,.75); color:#fff; font:13px/1.3 -apple-system,system-ui,Segoe UI,Roboto,Arial;
          display:none;
        `;
        document.body.appendChild(t);
      }
      t.textContent = String(text || "");
      t.style.display = "block";
      clearTimeout(showToast._tm);
      showToast._tm = setTimeout(() => (t.style.display = "none"), 2800);
    } catch {}
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

  // ===================== Templates (fallback interno) =====================
  function applyVars(text, app) {
    return String(text)
      .replaceAll("{{APP_NAME}}", app.name)
      .replaceAll("{{APP_ID}}", app.id);
  }

  function makePwaProTemplateFiles() {
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
    <div class="muted">ID: {{APP_ID}}</div>
    <nav class="miniNav">
      <a href="./">Home</a>
      <a href="./privacy.html">Privacidade</a>
      <a href="./terms.html">Termos</a>
    </nav>
  </header>

  <main class="wrap">
    <div class="card">
      <h2>App rodando ✅</h2>
      <p>Base pronta (pwa-pro). Agora você só evolui por telas e templates.</p>
      <button id="btn">Teste</button>
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
.out{margin-top:10px;padding:10px;border:1px dashed rgba(255,255,255,.2);border-radius:12px;min-height:24px}
.miniNav{display:flex;gap:10px;margin-top:8px;font-size:12px}
.miniNav a{color:rgba(255,255,255,.85);text-decoration:none;border:1px solid rgba(255,255,255,.14);padding:6px 10px;border-radius:999px}
`;

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
const ASSETS = ["./","./index.html","./styles.css","./app.js","./manifest.json","./terms.html","./privacy.html"];

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

    const terms = `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Termos — {{APP_NAME}}</title><link rel="stylesheet" href="styles.css"/></head>
<body><div class="wrap"><div class="card">
<h2>Termos de Uso — {{APP_NAME}}</h2>
<p class="muted">Versão inicial. Ajuste depois conforme seu produto evoluir.</p>
<ul>
<li>Uso por sua conta e risco.</li>
<li>Sem garantia de disponibilidade contínua.</li>
<li>Dados podem ficar salvos no dispositivo (offline-first).</li>
</ul>
<p><a href="./">Voltar</a></p>
</div></div></body></html>`;

    const privacy = `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Privacidade — {{APP_NAME}}</title><link rel="stylesheet" href="styles.css"/></head>
<body><div class="wrap"><div class="card">
<h2>Política de Privacidade — {{APP_NAME}}</h2>
<p class="muted">Offline-first: por padrão os dados ficam no seu dispositivo.</p>
<ul>
<li>Este app pode armazenar dados localmente (cache/localStorage) para funcionar offline.</li>
<li>Quando recursos online forem ativados, você verá claramente antes de enviar dados.</li>
</ul>
<p><a href="./">Voltar</a></p>
</div></div></body></html>`;

    const readme = `# {{APP_NAME}}

Gerado pelo RControl Factory (template pwa-pro).

## Arquivos
- index.html
- app.js
- styles.css
- manifest.json
- sw.js
- terms.html
- privacy.html
`;

    return {
      "index.html": index,
      "app.js": appjs,
      "styles.css": css,
      "manifest.json": manifest,
      "sw.js": sw,
      "terms.html": terms,
      "privacy.html": privacy,
      "README.md": readme,
    };
  }

  function getFallbackTemplates() {
    return [
      { id: "pwa-pro", name: "PWA PRO (Terms + Privacy + SW)", files: makePwaProTemplateFiles() },
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
    const templates = window.RCF?.templates?.getTemplates?.() || getFallbackTemplates();
    const tpl = templates.find((t) => t.id === templateId) || templates[0];

    const files = {};
    Object.keys(tpl.files).forEach((k) => {
      files[k] = applyVars(tpl.files[k], { name, id });
    });

    const app = {
      name,
      id,
      type,
      templateId: tpl.id,
      createdAt: Date.now(),
      files,
      baseFiles: { ...files },
    };

    apps.unshift(app);
    saveApps();
    setActiveAppId(id);
    return app;
  }

  // ===================== Preview =====================
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

  // ===================== ZIP =====================
  async function downloadZip(app) {
    if (typeof JSZip === "undefined") {
      alert("JSZip não carregou. Verifique o index.html (script do jszip).");
      return;
    }
    const zip = new JSZip();

    // garante que termos/privacidade entram mesmo se não existirem
    const ensureExtras = () => {
      if (!app.files["terms.html"] || !app.files["privacy.html"]) {
        const t = makePwaProTemplateFiles();
        app.files["terms.html"] = app.files["terms.html"] || applyVars(t["terms.html"], app);
        app.files["privacy.html"] = app.files["privacy.html"] || applyVars(t["privacy.html"], app);
        app.files["README.md"] = app.files["README.md"] || applyVars(t["README.md"], app);
      }
    };

    ensureExtras();

    Object.entries(app.files).forEach(([path, content]) => {
      zip.file(path, String(content ?? ""));
    });

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
    const tail = __logs.slice(-80).map(l => `[${l.time}] ${String(l.level).toUpperCase()} ${l.msg}`);
    lines.push(tail.join("\n") || "(sem logs)");

    add("---- módulos ----", "");
    add("window.RCF", window.RCF ? "SIM" : "NÃO");
    add("templates", window.RCF?.templates ? "SIM" : "NÃO");
    add("ai", window.RCF?.ai ? "SIM" : "NÃO");
    add("guard", window.RCF?.guard ? "SIM" : "NÃO");

    return lines.join("\n");
  }

  // ===================== Admin PIN =====================
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

  function guardUnlocked() {
    if (isUnlocked()) return true;
    alert("Admin está bloqueado 🔒 (digite PIN e Unlock).");
    return false;
  }

  // ===================== Render =====================
  function renderTemplatesSelect() {
    const sel = $("newTemplate");
    if (!sel) return;
    sel.innerHTML = "";

    const templates = window.RCF?.templates?.getTemplates?.() || getFallbackTemplates();
    templates.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });

    // default sempre PRO
    if ([...sel.options].some(o => o.value === "pwa-pro")) sel.value = "pwa-pro";
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

    if (!FILE_ORDER.includes(currentFile)) currentFile = "index.html";

    FILE_ORDER
      .filter(f => (app.files[f] !== undefined) || ["terms.html","privacy.html","README.md"].includes(f))
      .forEach((f) => {
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

  function renderAdminState() {
    const st = $("adminState");
    if (st) st.textContent = isUnlocked() ? "UNLOCK ✅" : "LOCKED 🔒";
  }

  // ===================== Wires =====================
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

      const templateId = ($("newTemplate")?.value || "pwa-pro");
      createApp({
        name,
        id,
        type: $("newType")?.value || "pwa",
        templateId,
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
      alert("Publish vai entrar como módulo online (depois). Offline-first continua.");
      showTab("settings");
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

  function wireAdmin() {
    // Unlock
    $("adminUnlockBtn")?.addEventListener("click", () => {
      const raw = String($("adminPinInput")?.value || "").trim();

      // regra de resgate: 0000 reseta pin pra 1122 e destrava
      if (raw === "0000") {
        setPin(DEFAULT_PIN);
        unlock(15);
        if ($("adminPinInput")) $("adminPinInput").value = "";
        renderAdminState();
        alert("PIN resetado para 1122 ✅ (Unlock 15min)");
        return;
      }

      if (raw !== getPin()) return alert("PIN errado ❌");

      unlock(15);
      if ($("adminPinInput")) $("adminPinInput").value = "";
      renderAdminState();
      alert("Admin liberado ✅ (15 min)");
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
      catch { alert("iOS bloqueou copiar. Copie manual."); }
      const out = $("adminOut");
      if (out) out.textContent = rep;
    });

    $("clearPwaBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      if (!confirm("Vai limpar caches + desregistrar SW e recarregar. Continuar?")) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

    // export/import (protegidos)
    $("exportBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      const payload = {
        version: 2,
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
      alert("Import OK ✅ Recarregando…");
      location.reload();
    });

    // IA offline (somente se existir módulo)
    $("aiRunBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      const txt = String($("aiInput")?.value || "");
      const ai = window.RCF?.ai;
      const out = $("aiOut");
      if (!ai || typeof ai.run !== "function") {
        if (out) out.textContent = "IA offline ainda não ligada (módulo /app/js/ai.v2.js).";
        return;
      }
      const res = ai.run(txt, { apps, settings, activeAppId });
      if (out) out.textContent = String(res?.text || res || "—");
      window.__rcf_last_ai_suggestion = res?.suggestion || null;
    });

    $("aiClearBtn")?.addEventListener("click", () => {
      const out = $("aiOut");
      if (out) out.textContent = "—";
      if ($("aiInput")) $("aiInput").value = "";
      window.__rcf_last_ai_suggestion = null;
    });

    $("aiDiscardBtn")?.addEventListener("click", () => {
      window.__rcf_last_ai_suggestion = null;
      const out = $("aiOut");
      if (out) out.textContent = "Descartado ✅";
    });

    $("aiApplyBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      const sug = window.__rcf_last_ai_suggestion;
      if (!sug) return alert("Sem sugestão pendente.");
      // sugestão padrão: { type, payload }
      // aqui aplica só ações seguras (create/select/update file)
      try {
        if (sug.type === "create_app") {
          const { name, id, templateId } = sug.payload || {};
          if (!name || !id) throw new Error("Sugestão inválida.");
          if (pickAppById(id)) throw new Error("Já existe app com esse ID.");
          createApp({ name, id, type: "pwa", templateId: templateId || "pwa-pro" });
          saveApps();
          renderAll();
          showTab("editor");
          alert("Aplicado ✅ (app criado)");
        } else if (sug.type === "select_app") {
          const { id } = sug.payload || {};
          if (!pickAppById(id)) throw new Error("App não encontrado.");
          setActiveAppId(id);
          renderAll();
          alert("Aplicado ✅ (app selecionado)");
        } else if (sug.type === "write_file") {
          const { id, file, content } = sug.payload || {};
          const app = pickAppById(id || activeAppId);
          if (!app) throw new Error("Sem app ativo.");
          if (!file) throw new Error("Arquivo não informado.");
          app.files[file] = String(content ?? "");
          saveApps();
          renderEditor();
          alert("Aplicado ✅ (arquivo escrito)");
        } else {
          alert("Tipo de sugestão não suportado ainda.");
        }
      } catch (e) {
        alert("Falha ao aplicar: " + (e?.message || e));
      }
    });

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

  // ===================== Módulos /app/js (carregamento seguro) =====================
  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function bootModules() {
    window.RCF = window.RCF || {};

    // tenta carregar módulos — se falhar, segue com fallback
    const base = "./js/";
    const files = [
      "core.guard.js",
      "templates.catalog.js",
      "templates.js",
      "router.js",
      "ai.v2.js",
      "admin.js",
    ];

    for (const f of files) {
      const ok = await loadScript(base + f);
      logInfo("module", f, ok ? "OK" : "SKIP");
    }

    // se templates não existe, cria API mínima
    if (!window.RCF.templates) {
      window.RCF.templates = {
        getTemplates: () => getFallbackTemplates(),
      };
    }

    // se guard não existe, cria guard mínima
    if (!window.RCF.guard) {
      window.RCF.guard = {
        isUnlocked,
        guardUnlocked,
      };
    }
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

  // ===================== Init =====================
  async function init() {
    logInfo("RCF init…");

    // evita travas por overlay/acessórios
    try {
      document.documentElement.style.webkitTapHighlightColor = "transparent";
    } catch {}

    await bootModules();

    wireTabs();
    wireNewApp();
    wireEditor();
    wireGenerator();
    wireSettings();
    wireAdmin();

    // Se estiver vazio, cria 1 demo automaticamente (igual seu print)
    if (!apps.length) {
      createApp({ name: "RControl Demo", id: "rcontrol-demo", type: "pwa", templateId: "pwa-pro" });
      saveApps();
    }

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

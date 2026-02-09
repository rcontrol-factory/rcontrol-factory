/* =========================================================
   RControl Factory — app/app.js (ROTA 2 • v2)
   - Core Factory (apps/localStorage/editor/zip/preview)
   - Admin tab (PIN + diagnóstico + backup + cache PWA)
   - IA Offline v2 (70%): PLANO -> SUGESTÃO -> APLICAR (com aprovação)
   - Enviar em 2 partes pra não cortar no iPhone
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
    aiDraft: "rcf_ai_draft_v2",
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

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ===================== Logs (iPhone-friendly) =====================
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

  window.addEventListener("error", (e) => logError("JS ERROR:", e.message, e.filename, e.lineno, e.colno));
  window.addEventListener("unhandledrejection", (e) => logError("PROMISE REJECT:", e.reason));

  // ===================== State =====================
  let settings = loadSettings();
  let apps = loadApps();
  let activeAppId = getActiveAppId();
  let currentFile = "index.html";

  // AI state
  let aiDraft = loadAiDraft(); // pending suggestion

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

  function loadAiDraft() {
    const raw = localStorage.getItem(LS.aiDraft);
    return raw ? safeJsonParse(raw, null) : null;
  }
  function saveAiDraft(draft) {
    aiDraft = draft || null;
    if (!aiDraft) localStorage.removeItem(LS.aiDraft);
    else localStorage.setItem(LS.aiDraft, JSON.stringify(aiDraft));
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

  function aiSetOut(text) {
    const el = $("aiOut");
    if (el) el.textContent = text || "—";
  }

  function adminSetOut(text) {
    const el = $("adminOut");
    if (el) el.textContent = text || "—";
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

  // ===================== Templates (Catálogo) =====================
  function applyVars(text, app) {
    return String(text).replaceAll("{{APP_NAME}}", app.name).replaceAll("{{APP_ID}}", app.id);
  }

  function tplPwaBase(name, id) {
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

      <div class="row">
        <button id="btn">Clique aqui</button>
        <button id="btn2" class="ghost">Offline?</button>
      </div>

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
const btn2 = document.getElementById("btn2");
const out = document.getElementById("out");

btn?.addEventListener("click", () => {
  const now = new Date().toLocaleString();
  out.textContent = "Funcionando! " + now;
});

btn2?.addEventListener("click", () => {
  out.textContent = navigator.onLine ? "Online ✅" : "Offline ✅ (PWA)";
});`;

    const css = `:root{--bg:#0b1220;--card:#0f1a2e;--border:rgba(255,255,255,.1);--text:rgba(255,255,255,.92);--muted:rgba(255,255,255,.65);--green:#19c37d}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}
.top{padding:16px 14px;border-bottom:1px solid var(--border)}
.wrap{max-width:900px;margin:16px auto;padding:0 14px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px}
.muted{color:var(--muted);font-size:12px}
button{background:rgba(25,195,125,.2);border:1px solid rgba(25,195,125,.35);color:var(--text);padding:10px 12px;border-radius:12px;font-weight:800}
button.ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}
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

    return {
      "index.html": applyVars(index, { name, id }),
      "app.js": applyVars(appjs, { name, id }),
      "styles.css": applyVars(css, { name, id }),
      "manifest.json": applyVars(manifest, { name, id }),
      "sw.js": applyVars(sw, { name, id }),
    };
  }

  function tplPwaEmpty(name, id) {
    return {
      "index.html": applyVars(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{{APP_NAME}}</title></head><body><h1>{{APP_NAME}}</h1><p>ID: {{APP_ID}}</p></body></html>`, { name, id }),
      "app.js": applyVars(`// {{APP_NAME}} - {{APP_ID}}`, { name, id }),
      "styles.css": `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}`,
      "manifest.json": applyVars(`{"name":"{{APP_NAME}}","short_name":"{{APP_NAME}}","start_url":"./","display":"standalone","background_color":"#0b1220","theme_color":"#0b1220","icons":[]}`, { name, id }),
      "sw.js": `self.addEventListener("fetch",()=>{});`,
    };
  }

  function getTemplates() {
    return [
      { id: "pwa-base", name: "PWA Base (com app.js + styles.css)", build: tplPwaBase },
      { id: "pwa-empty", name: "PWA Vazia (minimal)", build: tplPwaEmpty },
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
    const files = tpl.build(name, id);

    const app = {
      name,
      id,
      type: type || "pwa",
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

    add("=== RCF DIAGNÓSTICO (ROTA 2) ===", "");
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

    add("---- IA Draft ----", "");
    add("aiDraft", aiDraft ? "SIM (pendente)" : "NÃO");

    return lines.join("\n");
  }

  // ===================== Admin (PIN) =====================
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

  // ===================== IA Offline v2 (Planner + Suggestion + Apply) =====================
  function normalizeSpaces(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function listAppsText() {
    if (!apps.length) return "Nenhum app salvo.";
    const lines = apps.map((a, i) => {
      const on = (a.id === activeAppId) ? " (ativo)" : "";
      return `${i + 1}. ${a.name} [${a.id}]${on}`;
    });
    return lines.join("\n");
  }

  function makeAiHelp() {
    return [
      "IA Offline v2 (70%) — comandos:",
      "",
      "• help",
      "• status",
      "• listar apps",
      "• selecionar <id>",
      "• criar app <Nome> (id automático)",
      "• criar app <Nome> id <id>",
      "• template <pwa-base|pwa-empty>",
      "• reset file <index.html|app.js|styles.css|manifest.json|sw.js>",
      "• corrigir preview (recarrega iframe)",
      "",
      "Fluxo:",
      "1) Executar -> ela gera PLANO + SUGESTÃO",
      "2) Aplicar sugestão -> ela aplica (somente se Admin UNLOCK)",
      "3) Descartar -> apaga sugestão pendente",
    ].join("\n");
  }

  function aiPlanFromText(raw) {
    const text = normalizeSpaces(raw).toLowerCase();

    // 1) help/status
    if (text === "help" || text === "ajuda") {
      return { kind: "info", title: "Ajuda", plan: "Mostrar lista de comandos.", actions: [{ type: "ai_show_help" }] };
    }
    if (text === "status") {
      return { kind: "info", title: "Status", plan: "Mostrar status do sistema e app ativo.", actions: [{ type: "ai_show_status" }] };
    }

    // 2) listar apps
    if (text.includes("listar apps") || text === "list" || text === "listar") {
      return { kind: "info", title: "Listar apps", plan: "Listar apps do localStorage.", actions: [{ type: "ai_list_apps" }] };
    }

    // 3) selecionar <id>
    {
      const m = text.match(/^(selecionar|select)\s+([a-z0-9-]+)$/i);
      if (m) {
        const id = m[2];
        return { kind: "change", title: "Selecionar app", plan: `Definir app ativo = ${id}`, actions: [{ type: "select_app", id }] };
      }
    }

    // 4) template
    {
      const m = text.match(/^(template)\s+(pwa-base|pwa-empty)$/i);
      if (m) {
        const templateId = m[2];
        return { kind: "change", title: "Template padrão", plan: `Definir template padrão do New App = ${templateId}`, actions: [{ type: "set_new_template", templateId }] };
      }
    }

    // 5) criar app Nome id id
    {
      let m = raw.match(/criar\s+app\s+(.+?)\s+id\s+([a-zA-Z0-9-]+)/i);
      if (m) {
        const name = String(m[1] || "").trim();
        const id = sanitizeId(m[2]);
        return {
          kind: "create",
          title: "Criar app",
          plan: `Criar app "${name}" com id "${id}" usando template atual do New App.`,
          actions: [{ type: "create_app", name, id }]
        };
      }
      m = raw.match(/criar\s+app\s+(.+)/i);
      if (m) {
        const name = String(m[1] || "").trim();
        const id = sanitizeId(name);
        return {
          kind: "create",
          title: "Criar app",
          plan: `Criar app "${name}" com id automático "${id}" usando template atual do New App.`,
          actions: [{ type: "create_app", name, id }]
        };
      }
    }

    // 6) reset file
    {
      const m = text.match(/^reset\s+file\s+(index\.html|app\.js|styles\.css|manifest\.json|sw\.js)$/i);
      if (m) {
        const file = m[1];
        return { kind: "change", title: "Reset arquivo", plan: `Resetar ${file} para baseFiles do app ativo.`, actions: [{ type: "reset_file", file }] };
      }
    }

    // 7) corrigir preview
    if (text.includes("corrigir preview") || text.includes("recarregar preview")) {
      return { kind: "change", title: "Atualizar preview", plan: "Recarregar iframe de preview do app ativo.", actions: [{ type: "refresh_preview" }] };
    }

    // 8) fallback: orientação
    return {
      kind: "info",
      title: "Entendi (parcial)",
      plan: "Eu não identifiquei um comando exato. Use 'help' para ver comandos.",
      actions: [{ type: "ai_show_help" }]
    };
  }

  function aiRenderDraft(draft) {
    if (!draft) {
      aiSetOut("—");
      return;
    }
    const lines = [];
    lines.push(`PLANO: ${draft.title}`);
    lines.push(draft.plan ? `\n${draft.plan}` : "");
    lines.push("\nSUGESTÃO:");
    (draft.actions || []).forEach((a, i) => {
      lines.push(`  ${i + 1}) ${a.type} ${a.id ? "(" + a.id + ")" : ""}${a.file ? "(" + a.file + ")" : ""}`);
    });
    lines.push("\nPróximo passo:");
    lines.push("• Toque em 'Aplicar sugestão' (precisa Admin UNLOCK) OU 'Descartar'.");
    aiSetOut(lines.join("\n").replace(/\n\n\n+/g, "\n\n"));
  }

  function aiRun() {
    const input = $("aiInput")?.value || "";
    const trimmed = String(input).trim();
    if (!trimmed) return aiSetOut("Digite um comando (ex: help | listar apps | criar app RQuotas).");

    const draft = aiPlanFromText(trimmed);
    saveAiDraft(draft);
    aiRenderDraft(draft);
  }

  function aiDiscard() {
    saveAiDraft(null);
    aiSetOut("Sugestão descartada ✅");
  }

  function aiApply() {
    if (!aiDraft) return aiSetOut("Não tem sugestão pendente. Toque em Executar primeiro.");
    if (!guardUnlocked()) return;

    const draft = aiDraft;
    const results = [];
    const fail = (msg) => results.push("❌ " + msg);
    const ok = (msg) => results.push("✅ " + msg);

    try {
      for (const act of (draft.actions || [])) {
        if (act.type === "ai_show_help") {
          aiSetOut(makeAiHelp());
          ok("Ajuda exibida.");
          continue;
        }

        if (act.type === "ai_show_status") {
          ensureActiveApp();
          const app = pickAppById(activeAppId);
          const text = [
            "STATUS:",
            `• Apps: ${apps.length}`,
            `• Ativo: ${app ? `${app.name} (${app.id})` : "—"}`,
            `• Online: ${navigator.onLine ? "SIM" : "NÃO"}`,
          ].join("\n");
          aiSetOut(text);
          ok("Status exibido.");
          continue;
        }

        if (act.type === "ai_list_apps") {
          aiSetOut(listAppsText());
          ok("Lista exibida.");
          continue;
        }

        if (act.type === "set_new_template") {
          const sel = $("newTemplate");
          if (!sel) { fail("newTemplate não existe no DOM."); continue; }
          sel.value = act.templateId;
          ok(`Template do New App setado: ${act.templateId}`);
          continue;
        }

        if (act.type === "select_app") {
          const found = pickAppById(act.id);
          if (!found) { fail(`App "${act.id}" não existe.`); continue; }
          setActiveAppId(found.id);
          renderAppsList();
          renderEditor();
          renderGeneratorSelect();
          ok(`App ativo agora: ${found.name} (${found.id})`);
          continue;
        }

        if (act.type === "create_app") {
          const name = String(act.name || "").trim();
          const id = sanitizeId(act.id || "");
          const errors = validateApp(name, id);
          if (errors.length) { fail("Não criou: " + errors.join(" | ")); continue; }
          if (pickAppById(id)) { fail(`Já existe app com id "${id}".`); continue; }

          const templateId = $("newTemplate")?.value || "pwa-base";
          createApp({ name, id, type: "pwa", templateId });
          renderAppsList();
          renderEditor();
          renderGeneratorSelect();
          showTab("editor");
          ok(`Criado: ${name} (${id})`);
          continue;
        }

        if (act.type === "reset_file") {
          const app = pickAppById(activeAppId);
          if (!app) { fail("Sem app ativo."); continue; }
          const file = act.file;
          app.files[file] = app.baseFiles?.[file] ?? "";
          saveApps();
          renderEditor();
          ok(`Resetou: ${file}`);
          continue;
        }

        if (act.type === "refresh_preview") {
          const app = pickAppById(activeAppId);
          if (!app) { fail("Sem app ativo."); continue; }
          refreshPreview(app);
          ok("Preview atualizado.");
          continue;
        }

        fail(`Ação desconhecida: ${act.type}`);
      }
    } catch (e) {
      fail("Falha ao aplicar: " + (e?.message || String(e)));
    }

    saveAiDraft(null);
    aiSetOut(results.join("\n") + "\n\n(Dica: rode 'help' pra ver comandos.)");
  }  // ===================== Wire Events =====================
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
      alert("Publish continua desligado nessa fase. Primeiro 100% estável.");
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
      saveAiDraft(null);

      renderAll();
      alert("Factory resetado ✅");
    });
  }

  function wireAdmin() {
    $("adminUnlockBtn")?.addEventListener("click", () => {
      const pin = String($("adminPinInput")?.value || "");
      const ok = pin === getPin();
      if (!ok) return alert("PIN errado ❌");
      unlock(15);
      if ($("adminPinInput")) $("adminPinInput").value = "";
      renderAdminState();
      alert("Admin UNLOCK ✅ (15 min)");
    });

    $("diagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      adminSetOut(rep);
    });

    $("copyDiagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      try {
        await navigator.clipboard.writeText(rep);
        alert("Diagnóstico copiado ✅");
      } catch {
        adminSetOut(rep);
        alert("iOS bloqueou copiar. Copie manualmente do campo.");
      }
    });

    $("clearPwaBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      const ok = confirm("Vai limpar caches + desregistrar Service Worker e recarregar. Continuar?");
      if (!ok) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

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
      } catch (e) {
        return alert("Falha import: " + e.message);
      }
      alert("Import OK ✅ Recarregando…");
      location.reload();
    });

    $("aiRunBtn")?.addEventListener("click", () => aiRun());
    $("aiClearBtn")?.addEventListener("click", () => {
      if ($("aiInput")) $("aiInput").value = "";
      aiSetOut("—");
    });
    $("aiDiscardBtn")?.addEventListener("click", () => aiDiscard());
    $("aiApplyBtn")?.addEventListener("click", () => aiApply());

    if (aiDraft) aiRenderDraft(aiDraft);
    else aiSetOut("—");

    renderAdminState();
  }

  // ===================== Utils: download/pick file =====================
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

  // ===================== Render all =====================
  function renderAll() {
    renderTemplatesSelect();
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    renderSettings();
    renderAdminState();
    if (aiDraft) aiRenderDraft(aiDraft);
  }

  // ===================== Init =====================
  function init() {
    logInfo("RCF init (ROTA 2)…");
    wireTabs();
    wireNewApp();
    wireEditor();
    wireGenerator();
    wireSettings();
    wireAdmin();

    renderAll();
    showTab("dashboard");

    setStatus("Pronto ✅ (ROTA 2)");
    logInfo("RCF pronto ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

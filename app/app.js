/* =========================================================
   RControl Factory — app.js (V2 / FULL / STABLE)
   - Monolítico (sem módulos externos) => evita duplicar Admin
   - Offline-first (localStorage) + PWA cache
   - Dashboard / New App / Editor / Generator / Settings / Admin
   - Preview via iframe srcdoc
   - ZIP via JSZip (CDN no index.html)
   - Diagnóstico + Export/Import + Limpar Cache PWA
   - IA Offline (70%): sugestões + plano + aplicar com aprovação
   ========================================================= */

(function () {
  "use strict";

  // ===================== Anti double-init (evita duplicar UI) =====================
  if (window.__RCF_V2_INIT__) return;
  window.__RCF_V2_INIT__ = true;

  // ===================== Storage keys =====================
  const LS = {
    settings: "rcf_settings_v4",
    apps: "rcf_apps_v4",
    activeAppId: "rcf_active_app_id_v4",
    adminPin: "rcf_admin_pin_v2"
  };

  const DEFAULT_SETTINGS = {
    ghUser: "",
    ghToken: "",
    repoPrefix: "rapp-",
    pagesBase: "",
    adminPin: "112233"
  };

  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];

  // ===================== DOM helpers =====================
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  // ===================== Logs =====================
  const LOG_MAX = 240;
  const logs = [];
  function pushLog(level, msg) {
    const time = new Date().toISOString().slice(11, 19);
    logs.push({ time, level, msg: String(msg || "") });
    while (logs.length > LOG_MAX) logs.shift();
    const el = $("logs");
    if (el) el.textContent = logs.map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n");
  }
  function logInfo(...a) { pushLog("log", a.join(" ")); }
  function logWarn(...a) { pushLog("warn", a.join(" ")); }
  function logError(...a) { pushLog("error", a.join(" ")); }

  window.addEventListener("error", (e) => {
    logError("JS ERROR:", e.message || "Erro", e.filename || "", `${e.lineno || ""}:${e.colno || ""}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logError("PROMISE REJECT:", String(e.reason || e));
  });

  // ===================== JSON safe =====================
  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

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

  function getActiveAppId() {
    return localStorage.getItem(LS.activeAppId) || "";
  }
  function setActiveAppId(id) {
    state.activeAppId = id || "";
    localStorage.setItem(LS.activeAppId, state.activeAppId);
  }

  // ===================== State =====================
  const state = {
    settings: loadSettings(),
    apps: loadApps(),
    activeAppId: getActiveAppId(),
    currentFile: "index.html",
    lastAiPatch: null
  };

  // ===================== UI helpers =====================
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

  function templatePwaBaseFiles() {
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
  <header style="padding:14px;border-bottom:1px solid rgba(255,255,255,.12);background:#0b1220;color:rgba(255,255,255,.92);font-family:system-ui">
    <h1 style="margin:0">{{APP_NAME}}</h1>
    <div style="opacity:.7;font-size:12px">Gerado pelo RControl Factory • ID: {{APP_ID}}</div>
  </header>

  <main style="padding:14px;font-family:system-ui">
    <div style="max-width:900px;margin:0 auto;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px;color:rgba(255,255,255,.92)">
      <h2 style="margin:0 0 8px">App rodando ✅</h2>
      <p style="opacity:.75;margin:0 0 10px">Edite <code>app.js</code> e <code>styles.css</code>.</p>
      <button id="btn" style="padding:10px 12px;border-radius:12px;border:1px solid rgba(25,195,125,.35);background:rgba(25,195,125,.18);color:#fff;font-weight:800">Clique aqui</button>
      <div id="out" style="margin-top:10px;padding:10px;border:1px dashed rgba(255,255,255,.22);border-radius:12px;min-height:24px"></div>
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
code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:8px}
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
const ASSETS = ["./","./index.html","./styles.css","./app.js","./manifest.json"];
self.addEventListener("install",(e)=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(ASSETS);self.skipWaiting();})());});
self.addEventListener("activate",(e)=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null));self.clients.claim();})());});
self.addEventListener("fetch",(e)=>{e.respondWith((async()=>{const cached=await caches.match(e.request);if(cached) return cached;try{return await fetch(e.request);}catch{return caches.match("./index.html");}})());});`;

    return { "index.html": index, "app.js": appjs, "styles.css": css, "manifest.json": manifest, "sw.js": sw };
  }

  function templatePwaEmptyFiles() {
    return {
      "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{{APP_NAME}}</title></head><body style="font-family:system-ui"><h1>{{APP_NAME}}</h1><p>ID: {{APP_ID}}</p></body></html>`,
      "app.js": `// {{APP_NAME}}`,
      "styles.css": `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}`,
      "manifest.json": `{"name":"{{APP_NAME}}","short_name":"{{APP_NAME}}","start_url":"./","display":"standalone","background_color":"#0b1220","theme_color":"#0b1220","icons":[]}`,
      "sw.js": `self.addEventListener("fetch",()=>{});`
    };
  }

  function getTemplates() {
    return [
      { id: "pwa-base", name: "PWA Base (com app.js + styles.css)", files: templatePwaBaseFiles() },
      { id: "pwa-empty", name: "PWA Vazia (minimal)", files: templatePwaEmptyFiles() }
    ];
  }

  // ===================== Apps CRUD =====================
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
      baseFiles: { ...files }
    };

    state.apps.unshift(app);
    saveApps();
    setActiveAppId(id);
    return app;
  }

  // ===================== Editor/Preview =====================
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
    if ($("adminPin")) $("adminPin").value = (localStorage.getItem(LS.adminPin) || state.settings.adminPin || "112233");
  }

  function renderAll() {
    renderTemplatesSelect();
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    renderSettings();
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
    } catch (e) { logWarn("Falha ao limpar caches:", e.message || e); }

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) { logWarn("Falha ao desregistrar SW:", e.message || e); }
  }

  // ===================== Diagnosis =====================
  async function buildDiagnosisReport() {
    const lines = [];
    const add = (k, v) => lines.push(`${k}: ${v}`);

    add("=== RCF DIAGNÓSTICO (V2) ===", "");
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
      "adminDiagBtn","adminClearPwaBtn","aiInput","aiRunBtn","aiOut"
    ];
    const missing = must.filter(id => !document.getElementById(id));
    add("DOM missing IDs", missing.length ? missing.join(", ") : "OK");

    add("---- últimos logs ----", "");
    const tail = logs.slice(-80).map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`);
    lines.push(tail.join("\n") || "(sem logs)");

    // Duplicação detectável
    const adminTabs = document.querySelectorAll('#tab-admin').length;
    add("Admin panels in DOM", String(adminTabs));
    add("Note", adminTabs > 1 ? "⚠️ DUPLICADO (provável HTML duplicado em index antigo)" : "OK");

    return lines.join("\n");
  }

  // ===================== Admin PIN =====================
  function getPin() {
    return localStorage.getItem(LS.adminPin) || state.settings.adminPin || "112233";
  }
  function setPin(pin) {
    const p = String(pin || "").trim();
    localStorage.setItem(LS.adminPin, p);
    state.settings.adminPin = p;
    saveSettings();
  }

  function showAdminTabIfUnlocked() {
    const btn = $("adminTabBtn");
    if (!btn) return;
    btn.classList.remove("hidden");
  }

  // ===================== IA Offline (70%) =====================
  // Ideia: ela gera "patch" estruturado. Você aprova => aplica.
  function aiAnalyze(text) {
    const t = String(text || "").trim();
    const lower = t.toLowerCase();

    // comandos rápidos
    const mCreate = lower.match(/^(criar|create)\s+app\s+(.+)$/i);
    if (mCreate) {
      const name = String(mCreate[2] || "").trim();
      const id = sanitizeId(name);
      return {
        title: "Criar novo app",
        explanation: `Vou criar um app local chamado "${name}" com ID "${id}".`,
        patch: { type: "createApp", payload: { name, id, templateId: "pwa-base" } }
      };
    }

    const mSelect = lower.match(/^(selecionar|select)\s+(.+)$/i);
    if (mSelect) {
      const id = String(mSelect[2] || "").trim();
      return {
        title: "Selecionar app",
        explanation: `Vou selecionar o app ativo: ${id}`,
        patch: { type: "selectApp", payload: { id } }
      };
    }

    if (lower === "status") {
      const a = pickAppById(state.activeAppId);
      return {
        title: "Status",
        explanation: [
          `Apps: ${state.apps.length}`,
          a ? `Ativo: ${a.name} (${a.id})` : "Ativo: (nenhum)",
          `Arquivo atual: ${state.currentFile}`
        ].join("\n"),
        patch: null
      };
    }

    if (lower === "list" || lower === "listar") {
      const lines = state.apps.length
        ? state.apps.map(a => `- ${a.name} (${a.id})`).join("\n")
        : "Nenhum app salvo ainda.";
      return { title: "Lista de apps", explanation: lines, patch: null };
    }

    // Se colou código: tenta sugerir encaixe em arquivo atual
    const looksLikeCode =
      /<\/html>/i.test(t) ||
      /function\s*\(|const\s+|let\s+|var\s+|=>/i.test(t) ||
      /<script|<style|<!doctype/i.test(t);

    if (looksLikeCode) {
      return {
        title: "Encaixar código no Editor",
        explanation:
          "Detectei código. Posso inserir isso no arquivo atual do app ativo.\n\n" +
          "✅ Se você aprovar, eu vou colar exatamente esse conteúdo no arquivo selecionado no Editor.\n" +
          "Dica: antes selecione o arquivo correto (index.html / app.js / styles.css).",
        patch: { type: "replaceCurrentFile", payload: { content: t } }
      };
    }

    // pedido genérico: gera plano
    return {
      title: "Plano (offline)",
      explanation:
        "Entendi sua ideia. Offline eu faço 70% assim:\n" +
        "1) Criar estrutura do app (telas/arquivos)\n" +
        "2) Montar checklist de features\n" +
        "3) Diagnóstico e correções locais\n" +
        "4) Quando tiver internet: você cola o erro e usa IA online pra ajuste fino\n\n" +
        "Me diga assim: 'create app RQuotas' ou 'colar código' ou 'select <id>'.",
      patch: null
    };
  }

  function aiRenderResult(result) {
    const out = $("aiOut");
    if (!out) return;
    if (!result) { out.textContent = "—"; return; }

    const lines = [];
    lines.push(`✅ ${result.title}`);
    lines.push("");
    lines.push(result.explanation || "—");
    if (result.patch) {
      lines.push("");
      lines.push("Sugestão pronta para aplicar (precisa aprovação).");
    }
    out.textContent = lines.join("\n");
  }

  function aiSetPatch(patch) {
    state.lastAiPatch = patch || null;
    const applyBtn = $("aiApplyBtn");
    const discBtn = $("aiDiscardBtn");
    if (applyBtn) applyBtn.disabled = !state.lastAiPatch;
    if (discBtn) discBtn.disabled = !state.lastAiPatch;
  }

  function aiApplyPatch() {
    const patch = state.lastAiPatch;
    if (!patch) return;

    // sempre pede aprovação
    const ok = confirm("Aplicar a sugestão agora? (isso altera seu armazenamento local)");
    if (!ok) return;

    try {
      if (patch.type === "createApp") {
        const { name, id, templateId } = patch.payload || {};
        if (!name || !id) throw new Error("createApp inválido.");
        if (pickAppById(id)) throw new Error("Já existe um app com esse ID.");
        createApp({ name: String(name), id: String(id), type: "pwa", templateId: templateId || "pwa-base" });
        renderAll();
        showTab("editor");
        setStatus(`App criado: ${name} (${id}) ✅`);
      }

      if (patch.type === "selectApp") {
        const { id } = patch.payload || {};
        if (!id) throw new Error("selectApp inválido.");
        if (!pickAppById(id)) throw new Error("App não encontrado: " + id);
        setActiveAppId(id);
        renderAll();
        showTab("editor");
        setStatus(`App ativo: ${id} ✅`);
      }

      if (patch.type === "replaceCurrentFile") {
        const app = pickAppById(state.activeAppId);
        if (!app) throw new Error("Nenhum app ativo.");
        const content = String(patch.payload?.content || "");
        const area = $("codeArea");
        const current = state.currentFile;
        // aplica no arquivo atual
        app.files[current] = content;
        saveApps();
        if (area) area.value = content;
        refreshPreview(app);
        setStatus(`IA aplicou no arquivo: ${current} ✅`);
      }

      aiSetPatch(null);
      const out = $("aiOut");
      if (out) out.textContent = out.textContent + "\n\n✅ Aplicado com sucesso.";
    } catch (e) {
      alert("Falha ao aplicar: " + (e.message || e));
      logError("AI APPLY FAIL:", e.message || e);
    }
  }

  // ===================== Wire Events =====================
  function wireTabs() {
    qsa(".tab").forEach((b) => {
      b.addEventListener("click", () => {
        const t = b.dataset.tab;
        if (!t) return;
        showTab(t);
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
        templateId: $("newTemplate")?.value || "pwa-base"
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
      renderAppsList();
      renderEditor();
    });

    $("downloadZipBtn")?.addEventListener("click", async () => {
      const app = pickAppById($("genAppSelect")?.value || state.activeAppId);
      if (!app) return alert("Selecione um app.");

      setGenStatus("Status: gerando ZIP…");
      await downloadZip(app);
      setGenStatus("Status: ZIP pronto ✅");
    });

    $("publishBtn")?.addEventListener("click", async () => {
      alert("Publish online entra depois. Agora é estabilidade + geração ZIP.");
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

      const pin = ($("adminPin")?.value || "").trim();
      if (pin && pin.length >= 4) setPin(pin);

      saveSettings();
      setStatus("Settings salvas ✅");
      alert("Settings salvas ✅");
    });

    $("resetFactoryBtn")?.addEventListener("click", () => {
      if (!confirm("Tem certeza? Vai apagar apps e settings locais.")) return;
      localStorage.removeItem(LS.settings);
      localStorage.removeItem(LS.apps);
      localStorage.removeItem(LS.activeAppId);

      state.settings = loadSettings();
      state.apps = [];
      setActiveAppId("");

      renderAll();
      alert("Factory resetado ✅");
    });

    // habilita aba Admin quando você tocar no brand e digitar PIN
    $("brandTap")?.addEventListener("click", () => {
      const pin = prompt("PIN Admin:", "");
      if (!pin) return;
      if (String(pin) !== String(getPin())) return alert("PIN errado ❌");
      showAdminTabIfUnlocked();
      showTab("admin");
      setStatus("Admin desbloqueado ✅");
    });
  }

  function wireAdmin() {
    $("adminDiagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      const out = $("adminOut");
      if (out) out.textContent = rep;
    });

    $("adminCopyDiagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      try { await navigator.clipboard.writeText(rep); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Copie manual."); }
      const out = $("adminOut");
      if (out) out.textContent = rep;
    });

    $("adminClearPwaBtn")?.addEventListener("click", async () => {
      if (!confirm("Vai limpar caches + desregistrar Service Worker e recarregar. Continuar?")) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

    $("adminExportBtn")?.addEventListener("click", () => {
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        settings: loadSettings(),
        apps: loadApps(),
        activeAppId: getActiveAppId()
      };
      downloadText("rcf-backup.json", JSON.stringify(payload, null, 2));
    });

    $("adminImportBtn")?.addEventListener("click", () => {
      const input = $("adminImportFile");
      if (!input) return;
      input.value = "";
      input.click();
    });

    $("adminImportFile")?.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const text = await f.text();
      let data = null;
      try { data = JSON.parse(text); } catch { return alert("JSON inválido."); }
      try {
        if (data.settings) localStorage.setItem(LS.settings, JSON.stringify(data.settings));
        if (Array.isArray(data.apps)) localStorage.setItem(LS.apps, JSON.stringify(data.apps));
        if (typeof data.activeAppId === "string") localStorage.setItem(LS.activeAppId, data.activeAppId);
      } catch (err) {
        return alert("Falha import: " + (err.message || err));
      }
      alert("Import OK ✅ Recarregando…");
      location.reload();
    });

    // IA
    $("aiRunBtn")?.addEventListener("click", () => {
      const txt = ($("aiInput")?.value || "").trim();
      if (!txt) return;
      const res = aiAnalyze(txt);
      aiRenderResult(res);
      aiSetPatch(res.patch || null);
    });

    $("aiClearBtn")?.addEventListener("click", () => {
      const out = $("aiOut");
      if (out) out.textContent = "—";
      const inp = $("aiInput");
      if (inp) inp.value = "";
      aiSetPatch(null);
    });

    $("aiApplyBtn")?.addEventListener("click", aiApplyPatch);

    $("aiDiscardBtn")?.addEventListener("click", () => {
      aiSetPatch(null);
      const out = $("aiOut");
      if (out) out.textContent = (out.textContent || "") + "\n\n❌ Sugestão descartada.";
    });
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

  // ===================== Init =====================
  function init() {
    logInfo("RCF V2 init…");

    wireTabs();
    wireNewApp();
    wireEditor();
    wireGenerator();
    wireSettings();
    wireAdmin();

    renderAll();
    showTab("dashboard");

    setStatus("Pronto ✅");
    logInfo("RCF V2 pronto ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* =========================================================
   RControl Factory — app/app.js (ROTA 2 / CORE ESTÁVEL)
   - Offline-first (localStorage)
   - Tabs: Dashboard / New App / Editor / Generator / Settings / Admin
   - Preview via iframe srcdoc
   - ZIP via JSZip (index.html já carrega)
   - Admin: PIN + Diagnóstico + Backup + Limpar Cache PWA
   - IA Offline (70%): sugestão -> aplicar -> descartar (NUNCA auto-aplica)
   - Carrega módulos opcionais em /app/js/* sem quebrar se faltar
   ========================================================= */

(function () {
  "use strict";

  // ========= Anti duplo-init (evita bug de botões duplicados / travar) =========
  if (window.__RCF_INITED__) return;
  window.__RCF_INITED__ = true;

  // ===================== Storage keys =====================
  const LS = {
    settings: "rcf_settings_v3",
    apps: "rcf_apps_v3",
    activeAppId: "rcf_active_app_id_v3",
    adminPin: "rcf_admin_pin_v1",
    adminUnlockUntil: "rcf_admin_unlock_until_v1",
    pendingAction: "rcf_pending_action_v1",
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
  function saveSettings() { localStorage.setItem(LS.settings, JSON.stringify(state.settings)); }

  function loadApps() {
    const raw = localStorage.getItem(LS.apps);
    return raw ? safeJsonParse(raw, []) : [];
  }
  function saveApps() { localStorage.setItem(LS.apps, JSON.stringify(state.apps)); }

  function setActiveAppId(id) {
    state.activeAppId = id || "";
    localStorage.setItem(LS.activeAppId, state.activeAppId);
  }
  function getActiveAppId() {
    return localStorage.getItem(LS.activeAppId) || "";
  }

  // ===================== State =====================
  const state = {
    settings: loadSettings(),
    apps: loadApps(),
    activeAppId: getActiveAppId(),
    currentFile: "index.html",
    pendingAction: safeJsonParse(localStorage.getItem(LS.pendingAction) || "null", null),
  };

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
  function setAdminOut(text) {
    const el = $("adminOut");
    if (el) el.textContent = text || "—";
  }
  function setAiOut(text) {
    const el = $("aiOut");
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

  // ===================== Templates (core) =====================
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

  function getTemplatesCore() {
    return [
      { id: "pwa-base", name: "PWA Base (com app.js + styles.css)", files: makePwaBaseTemplateFiles() },
    ];
  }

  // ============ Módulos externos (se existirem) ============
  // Se você criou /app/js/templates.catalog.js etc, o core tenta usar,
  // mas NÃO quebra se não tiver.
  function getTemplates() {
    const ext = window.RCF?.templates?.getTemplates;
    if (typeof ext === "function") {
      try {
        const list = ext();
        if (Array.isArray(list) && list.length) return list;
      } catch (e) {
        logWarn("templates externo falhou:", e);
      }
    }
    return getTemplatesCore();
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

    state.apps.unshift(app);
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
      "adminPinInput","adminUnlockBtn","adminState","diagBtn","copyDiagBtn",
      "clearPwaBtn","adminOut","exportBtn","importBtn",
      "aiInput","aiRunBtn","aiClearBtn","aiApplyBtn","aiDiscardBtn","aiOut"
    ];
    const missing = must.filter(id => !document.getElementById(id));
    add("DOM missing IDs", missing.length ? missing.join(", ") : "OK");

    add("---- últimos logs ----", "");
    const tail = __logs.slice(-60).map(l => `[${l.time}] ${String(l.level).toUpperCase()} ${l.msg}`);
    lines.push(tail.join("\n") || "(sem logs)");

    add("---- módulos externos ----", "");
    add("window.RCF", window.RCF ? "SIM" : "NÃO");
    add("templates.getTemplates", typeof window.RCF?.templates?.getTemplates === "function" ? "SIM" : "NÃO");

    return lines.join("\n");
  }

  // ===================== Admin (PIN) =====================
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
    })

  // ===================== Backup =====================
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

  // ===================== IA Offline (70%) =====================
  function setPendingAction(actionObjOrNull) {
    state.pendingAction = actionObjOrNull;
    if (actionObjOrNull) localStorage.setItem(LS.pendingAction, JSON.stringify(actionObjOrNull));
    else localStorage.removeItem(LS.pendingAction);
  }

  function aiHelpText() {
    return [
      "IA Offline (70%) — exemplos:",
      "• help",
      "• status",
      "• list",
      "• create app RQuotas",
      "• select rquotas",
      "• fix sw (só sugestão, você aplica)",
      "",
      "Regra: ela SEMPRE gera uma sugestão. Só aplica quando você aperta 'Aplicar sugestão'."
    ].join("\n");
  }

  function aiPlanFromText(inputRaw) {
    const input = String(inputRaw || "").trim();
    if (!input) return { ok:false, msg:"Digite um comando." };

    const lower = input.toLowerCase();

    if (lower === "help" || lower === "ajuda") {
      return { ok:true, plan:{ title:"Ajuda", steps:[aiHelpText()], apply:null } };
    }

    if (lower === "status") {
      const active = pickAppById(state.activeAppId);
      const s = [
        `Apps: ${state.apps.length}`,
        `Ativo: ${active ? (active.name + " (" + active.id + ")") : "—"}`,
        `Admin: ${isUnlocked() ? "UNLOCK" : "LOCKED"}`
      ].join("\n");
      return { ok:true, plan:{ title:"Status", steps:[s], apply:null } };
    }

    if (lower === "list" || lower === "listar" || lower === "listar apps") {
      const list = state.apps.map(a => `- ${a.name} (${a.id})`).join("\n") || "(nenhum app salvo)";
      return { ok:true, plan:{ title:"Lista de apps", steps:[list], apply:null } };
    }

    // create app <name>
    if (lower.startsWith("create app ") || lower.startsWith("criar app ")) {
      const name = input.replace(/^create app\s+/i, "").replace(/^criar app\s+/i, "").trim();
      const id = sanitizeId(name);
      const errors = validateApp(name, id);
      if (errors.length) return { ok:false, msg:"Erro:\n" + errors.join("\n") };

      const plan = {
        title: "Criar app",
        steps: [
          `Vou criar: ${name} (${id})`,
          "Template: pwa-base",
          "Depois você pode editar no Editor e gerar ZIP."
        ],
        apply: { type:"CREATE_APP", payload:{ name, id, type:"pwa", templateId:"pwa-base" } }
      };
      return { ok:true, plan };
    }

    // select <id>
    if (lower.startsWith("select ") || lower.startsWith("selecionar ")) {
      const id = sanitizeId(input.replace(/^select\s+/i, "").replace(/^selecionar\s+/i, "").trim());
      const found = pickAppById(id);
      if (!found) return { ok:false, msg:`Não achei app com id: ${id}` };
      return {
        ok:true,
        plan:{
          title:"Selecionar app",
          steps:[`Vou selecionar: ${found.name} (${found.id})`],
          apply:{ type:"SELECT_APP", payload:{ id: found.id } }
        }
      };
    }

    // fix sw (apenas sugestão)
    if (lower === "fix sw" || lower === "corrigir sw") {
      return {
        ok:true,
        plan:{
          title:"Sugestão SW",
          steps:[
            "Sugestão: quando publicar mudança grande, troque a versão do SW no index.html (v=DATA) e/ou mude CACHE no sw.js.",
            "Se ainda travar: Admin → Limpar Cache PWA e recarregar."
          ],
          apply:null
        }
      };
    }

    // fallback
    return {
      ok:true,
      plan:{
        title:"Entendi (modo offline)",
        steps:[
          "Ainda não reconheço esse comando no modo offline.",
          "Tente: help | status | list | create app NOME | select ID | fix sw"
        ],
        apply:null
      }
    };
  }

  function aiRun() {
    const input = $("aiInput")?.value || "";
    const res = aiPlanFromText(input);

    if (!res.ok) {
      setPendingAction(null);
      setAiOut(res.msg || "Erro.");
      return;
    }

    const plan = res.plan;
    setPendingAction(plan.apply ? { planTitle: plan.title, apply: plan.apply, createdAt: Date.now() } : null);

    const text = [
      `✅ ${plan.title}`,
      "",
      ...(plan.steps || []),
      "",
      plan.apply ? "⚠️ Existe uma sugestão pronta. Aperte 'Aplicar sugestão' pra executar." : "ℹ️ Sem ação para aplicar."
    ].join("\n");

    setAiOut(text);
  }

  function aiApply() {
    if (!state.pendingAction || !state.pendingAction.apply) {
      alert("Não tem sugestão pendente.");
      return;
    }

    const a = state.pendingAction.apply;

    try {
      if (a.type === "CREATE_APP") {
        const { name, id, type, templateId } = a.payload || {};
        if (pickAppById(id)) throw new Error("Já existe um app com esse ID.");
        createApp({ name, id, type, templateId });
        renderAppsList();
        renderEditor();
        renderGeneratorSelect();
        setStatus(`App criado: ${name} (${id}) ✅`);
      }

      if (a.type === "SELECT_APP") {
        const { id } = a.payload || {};
        if (!pickAppById(id)) throw new Error("App não encontrado.");
        setActiveAppId(id);
        renderAppsList();
        renderEditor();
        renderGeneratorSelect();
        setStatus(`App ativo: ${id} ✅`);
      }

      setPendingAction(null);
      setAiOut("✅ Sugestão aplicada com sucesso.");
    } catch (e) {
      setAiOut("❌ Falha ao aplicar: " + (e?.message || String(e)));
    }
  }

  function aiDiscard() {
    setPendingAction(null);
    setAiOut("Descartado ✅");
  }

  // ===================== Wire Events =====================
  function wireTabs() {
    qsa(".tab").forEach((b) => {
      b.addEventListener("click", () => {
        const t = b.dataset.tab;
        if (!t) return;
        showTab(t);
        // Admin state sempre atualiza quando entra
        if (t === "admin") renderAdminState();
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
      alert("Publish ainda não está ligado nesta versão (core estável primeiro).");
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
      localStorage.removeItem(LS.pendingAction);

      state.settings = loadSettings();
      state.apps = [];
      setActiveAppId("");
      setPendingAction(null);

      renderAll();
      alert("Factory resetado ✅");
    });
  }

  function wireAdmin() {
    $("adminUnlockBtn")?.addEventListener("click", () => {
      const pin = String($("adminPinInput")?.value || "").trim();
      if (pin !== getPin()) return alert("PIN errado ❌");
      unlock(15);
      $("adminPinInput").value = "";
      renderAdminState();
      alert("Admin UNLOCK ✅ (15min)");
    });

    $("diagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      setAdminOut(rep);
    });

    $("copyDiagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosisReport();
      try { await navigator.clipboard.writeText(rep); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Copie manual do texto."); }
      setAdminOut(rep);
    });

    $("clearPwaBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      if (!confirm("Vai limpar cache + desregistrar SW e recarregar. Continuar?")) return;
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
      } catch (e) { return alert("Falha import: " + e.message); }
      alert("Import OK ✅ Recarregando…");
      location.reload();
    });

    $("aiRunBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      aiRun();
    });
    $("aiClearBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      if ($("aiInput")) $("aiInput").value = "";
      setAiOut("—");
      setPendingAction(null);
    });
    $("aiApplyBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      aiApply();
    });
    $("aiDiscardBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      aiDiscard();
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

  // ===================== Loader de módulos externos =====================
  async function loadOptionalModules() {
    // Se você tem esses arquivos, o core tenta carregar.
    // Se não tiver, segue sem erro.
    const files = [
      "./js/core.guard.js",
      "./js/templates.catalog.js",
      "./js/templates.js",
      "./js/router.js",
      "./js/ai.v2.js",
      "./js/admin.js",
    ];

    function loadScript(src) {
      return new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = false; // mantém ordem
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      });
    }

    for (const f of files) {
      try { await loadScript(f); } catch {}
    }
  }

  // ===================== API pública =====================
  function exposeApi() {
    window.RCF = window.RCF || {};
    window.RCF.core = {
      LS,
      loadSettings, saveSettings,
      loadApps, saveApps,
      getActiveAppId, setActiveAppId,
      buildDiagnosisReport,
      nukePwaCache,
      createApp,
      pickAppById,
    };
  }

  // ===================== Init =====================
  async function init() {
    logInfo("RCF init…");

    // (1) carrega módulos (se tiver)
    await loadOptionalModules();

    // (2) wires + render
    wireTabs();
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

    // se tiver ação pendente, deixa avisado no painel IA
    if (state.pendingAction?.apply) {
      setAiOut("⚠️ Existe sugestão pendente. Aperte 'Aplicar sugestão' ou 'Descartar'.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

})();

(function () {
  "use strict";

  const LS = {
    settings: "rcf_settings_v3",
    apps: "rcf_apps_v3",
    activeAppId: "rcf_active_app_id_v3",
    adminPin: "rcf_admin_pin_v1",
    adminUnlockUntil: "rcf_admin_unlock_until_v1",
  };

  const DEFAULT_PIN = "1122";
  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];
  const DEFAULT_SETTINGS = { ghUser:"", ghToken:"", repoPrefix:"rapp-", pagesBase:"" };

  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function safeJsonParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

  function loadSettings() {
    const raw = localStorage.getItem(LS.settings);
    const data = raw ? safeJsonParse(raw, {}) : {};
    return { ...DEFAULT_SETTINGS, ...(data || {}) };
  }
  function saveSettings(settings) { localStorage.setItem(LS.settings, JSON.stringify(settings)); }

  function loadApps() {
    const raw = localStorage.getItem(LS.apps);
    return raw ? safeJsonParse(raw, []) : [];
  }
  function saveApps(apps) { localStorage.setItem(LS.apps, JSON.stringify(apps)); }

  function getActiveAppId() { return localStorage.getItem(LS.activeAppId) || ""; }
  function setActiveAppId(id) { localStorage.setItem(LS.activeAppId, id || ""); }

  function getPin() { return localStorage.getItem(LS.adminPin) || DEFAULT_PIN; }
  function setPin(pin) { localStorage.setItem(LS.adminPin, String(pin || "").trim()); }

  function isUnlocked() {
    const until = Number(localStorage.getItem(LS.adminUnlockUntil) || "0");
    return until && until > Date.now();
  }
  function unlock(minutes) {
    const ms = (Number(minutes || 15) * 60 * 1000);
    localStorage.setItem(LS.adminUnlockUntil, String(Date.now() + ms));
  }
  function lockAdmin() { localStorage.setItem(LS.adminUnlockUntil, "0"); }

  const state = {
    settings: loadSettings(),
    apps: loadApps(),
    activeAppId: getActiveAppId(),
    currentFile: "index.html",
    adminSuggestion: null,
    agentSuggestion: null,
  };

  function setStatus(msg) {
    const el = $("statusBox");
    if (el) el.textContent = msg;
  }
  function setGenStatus(msg) { const el = $("genStatus"); if (el) el.textContent = msg; }
  function setAdminOut(msg) { const el = $("adminOut"); if (el) el.textContent = msg || "—"; }
  function setAiOut(msg) { const el = $("aiOut"); if (el) el.textContent = msg || "—"; }
  function setAgentOut(msg) { const el = $("agentOut"); if (el) el.textContent = msg || "—"; }

  // Tabs
  const TAB_IDS = ["dashboard","newapp","editor","generator","agent","settings","admin"];
  function showTab(tab) {
    TAB_IDS.forEach((t) => {
      const sec = $(`tab-${t}`);
      if (sec) sec.classList.toggle("hidden", t !== tab);
    });
    qsa(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  }

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
    if (!/^[a-z0-9-]+$/.test(id)) errors.push("ID só pode ter a-z, 0-9 e hífen.");
    return errors;
  }

  // Template base
  function applyVars(text, app) {
    return String(text).replaceAll("{{APP_NAME}}", app.name).replaceAll("{{APP_ID}}", app.id);
  }

  function makePwaBaseTemplateFiles() {
    const index = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{{APP_NAME}}</title>
<meta name="theme-color" content="#0b1220"/>
<link rel="manifest" href="manifest.json"/>
<link rel="stylesheet" href="styles.css"/>
</head><body>
<header class="top"><h1>{{APP_NAME}}</h1><div class="muted">Gerado pelo RControl Factory • ID: {{APP_ID}}</div></header>
<main class="wrap"><div class="card">
<h2>App rodando ✅</h2><p>Agora edite <code>app.js</code> e <code>styles.css</code>.</p>
<button id="btn">Clique aqui</button><div id="out" class="out"></div>
</div></main>
<script src="app.js"></script>
<script>if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}</script>
</body></html>`;

    const appjs = `// {{APP_NAME}} - {{APP_ID}}
const btn=document.getElementById("btn");
const out=document.getElementById("out");
btn?.addEventListener("click",()=>{out.textContent="Funcionando! "+new Date().toLocaleString();});`;

    const css = `:root{--bg:#0b1220;--card:#0f1a2e;--border:rgba(255,255,255,.1);--text:rgba(255,255,255,.92);--muted:rgba(255,255,255,.65)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}
.top{padding:16px 14px;border-bottom:1px solid var(--border)}
.wrap{max-width:900px;margin:16px auto;padding:0 14px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px}
.muted{color:var(--muted);font-size:12px}
button{background:rgba(25,195,125,.2);border:1px solid rgba(25,195,125,.35);color:var(--text);padding:10px 12px;border-radius:12px;font-weight:700}
.out{margin-top:10px;padding:10px;border:1px dashed rgba(255,255,255,.2);border-radius:12px;min-height:24px}`;

    const manifest = `{"name":"{{APP_NAME}}","short_name":"{{APP_NAME}}","start_url":"./","display":"standalone","background_color":"#0b1220","theme_color":"#0b1220","icons":[]}`;

    const sw = `const CACHE="{{APP_ID}}-v1";
const ASSETS=["./","./index.html","./styles.css","./app.js","./manifest.json"];
self.addEventListener("install",(e)=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(ASSETS);self.skipWaiting();})());});
self.addEventListener("activate",(e)=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null));self.clients.claim();})());});
self.addEventListener("fetch",(e)=>{e.respondWith((async()=>{const cached=await caches.match(e.request);if(cached)return cached;try{return await fetch(e.request);}catch{return caches.match("./index.html");}})());});`;

    return { "index.html": index, "app.js": appjs, "styles.css": css, "manifest.json": manifest, "sw.js": sw };
  }

  function getTemplates() {
    return [{ id:"pwa-base", name:"PWA Base (com app.js + styles.css)", files: makePwaBaseTemplateFiles() }];
  }

  function pickAppById(id) { return state.apps.find(a => a && a.id === id) || null; }
  function ensureActiveApp() {
    if (state.activeAppId && pickAppById(state.activeAppId)) return;
    if (state.apps.length) { state.activeAppId = state.apps[0].id; setActiveAppId(state.activeAppId); }
    else { state.activeAppId = ""; setActiveAppId(""); }
  }

  function createApp({ name, id, type, templateId }) {
    const tpl = getTemplates().find(t => t.id === templateId) || getTemplates()[0];
    const files = {};
    Object.keys(tpl.files).forEach((k) => { files[k] = applyVars(tpl.files[k], { name, id }); });

    const app = { name, id, type: type || "pwa", templateId, createdAt: Date.now(), files, baseFiles: { ...files } };
    state.apps.unshift(app);
    saveApps(state.apps);
    state.activeAppId = id;
    setActiveAppId(id);
    return app;
  }

  function seedIfEmpty() {
    const list = loadApps();
    if (Array.isArray(list) && list.length) return;
    state.apps = [];
    createApp({ name:"RControl Demo", id:"rcontrol-demo", type:"pwa", templateId:"pwa-base" });
    setStatus("Demo criado automaticamente ✅");
  }

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

    const looks = /<!doctype\s+html>/i.test(html) || /<html[\s>]/i.test(html);
    frame.srcdoc = looks ? injectIntoFullHtml(html, css, js) : `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;
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
          <strong>${a.name}</strong>
          <div class="meta">${a.id} • ${a.type || "pwa"}</div>
        </div>
        <span class="badge ${isOn ? "on" : ""}">${isOn ? "ativo" : "selecionar"}</span>
      `;

      item.addEventListener("click", () => {
        state.activeAppId = a.id;
        setActiveAppId(a.id);
        setStatus(`App ativo: ${a.name} (${a.id}) ✅`);
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
      b.addEventListener("click", () => { state.currentFile = f; renderEditor(); });
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

  async function downloadZip(app) {
    if (typeof JSZip === "undefined") return alert("JSZip não carregou.");
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

    add("Apps count", loadApps().length);
    add("Admin unlocked", isUnlocked() ? "SIM" : "NÃO");

    return lines.join("\n");
  }

  // Admin AI (simples)
  function adminSuggest(inputRaw) {
    const input = String(inputRaw || "").trim().toLowerCase();
    if (!input) return { text: "Digite: help | status | list | diag", suggestion: null };

    if (input === "help") {
      return { text: "Admin AI: help | status | list | diag\n(Admin é manutenção do core.)", suggestion: null };
    }
    if (input === "status") {
      ensureActiveApp();
      const app = pickAppById(state.activeAppId);
      return { text: `Apps: ${state.apps.length} | Ativo: ${app ? app.id : "—"} | Admin: ${isUnlocked() ? "UNLOCK" : "LOCKED"}`, suggestion: null };
    }
    if (input === "list") {
      const list = state.apps.map(a => `- ${a.name} (${a.id})`).join("\n") || "(vazio)";
      return { text: list, suggestion: null };
    }
    if (input === "diag") {
      return { text: "Sugestão pronta: rodar diagnóstico (Aplicar sugestão).", suggestion: { type:"diag" } };
    }
    return { text: "Não entendi. Digite: help", suggestion: null };
  }

  async function adminApply(s) {
    if (!s) return;
    if (s.type === "diag") {
      const rep = await buildDiagnosisReport();
      setAdminOut(rep);
    }
  }

  // Agent AI (fora do admin) — usa window.RCF.builderAI
  function agentSuggest(cmd) {
    const ai = window.RCF?.builderAI;
    if (!ai) return { text: "ERRO: ai.builder.js não carregou.", suggestion: null };
    return ai.suggest(cmd, { apps: state.apps });
  }

  async function agentApply(s) {
    if (!s) return;
    if (s.type === "createApp") {
      createApp(s.payload);
      renderAll();
      showTab("editor");
      setStatus(`App criado: ${s.payload.name} (${s.payload.id}) ✅`);
      return;
    }
    if (s.type === "selectApp") {
      state.activeAppId = s.payload.id;
      setActiveAppId(s.payload.id);
      renderAll();
      showTab("editor");
      setStatus(`App ativo: ${s.payload.id} ✅`);
      return;
    }
  }

  // Wires
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
    $("goAgent")?.addEventListener("click", () => showTab("agent"));
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
      saveApps(state.apps);
      setStatus(`Salvo: ${state.currentFile} ✅`);
      renderEditor();
    });

    $("resetFileBtn")?.addEventListener("click", () => {
      const app = pickAppById(state.activeAppId);
      if (!app) return alert("Nenhum app ativo.");
      if (!confirm(`Resetar ${state.currentFile} para o padrão do template?`)) return;
      app.files[state.currentFile] = app.baseFiles?.[state.currentFile] ?? "";
      saveApps(state.apps);
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
      state.activeAppId = $("genAppSelect").value;
      setActiveAppId(state.activeAppId);
      renderAll();
    });

    $("downloadZipBtn")?.addEventListener("click", async () => {
      const app = pickAppById($("genAppSelect")?.value || state.activeAppId);
      if (!app) return alert("Selecione um app.");
      setGenStatus("Status: gerando ZIP…");
      await downloadZip(app);
      setGenStatus("Status: ZIP pronto ✅");
    });

    $("publishBtn")?.addEventListener("click", () => alert("Publish entra depois. Agora é estabilidade + templates."));
  }

  function wireSettings() {
    $("saveSettingsBtn")?.addEventListener("click", () => {
      state.settings.ghUser = ($("ghUser")?.value || "").trim();
      state.settings.ghToken = ($("ghToken")?.value || "").trim();
      state.settings.repoPrefix = ($("repoPrefix")?.value || "rapp-").trim() || "rapp-";
      state.settings.pagesBase = ($("pagesBase")?.value || "").trim() || (state.settings.ghUser ? `https://${state.settings.ghUser}.github.io` : "");
      saveSettings(state.settings);
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
      location.reload();
    });
  }

  function wireAdmin() {
    $("adminUnlockBtn")?.addEventListener("click", () => {
      const pin = String($("adminPinInput")?.value || "").trim();

      if (pin === "0000") {
        setPin(DEFAULT_PIN);
        unlock(15);
        renderAdminState();
        alert("PIN resetado para 1122 ✅ (Admin destravado 15min)");
        $("adminPinInput").value = "";
        return;
      }

      const ok = pin === getPin();
      if (!ok) { renderAdminState(); return alert("PIN errado ❌\nDica: use 0000 pra resetar."); }

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
      alert("Por enquanto, evitar limpar cache durante testes pesados.\nSe precisar, use e recarregue.");
    });

    $("exportBtn")?.addEventListener("click", () => {
      if (!isUnlocked()) return alert("Admin bloqueado 🔒 (Unlock primeiro).");
      const payload = { version:1, exportedAt:new Date().toISOString(), settings: loadSettings(), apps: loadApps(), activeAppId: getActiveAppId() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "rcf-backup.json";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });

    $("importBtn")?.addEventListener("click", () => alert("Import fica igual estava (sem mexer agora)."));

    // Admin AI
    $("aiRunBtn")?.addEventListener("click", () => {
      if (!isUnlocked()) return alert("Admin bloqueado 🔒 (Unlock primeiro).");
      const res = adminSuggest($("aiInput")?.value || "");
      state.adminSuggestion = res.suggestion || null;
      setAiOut(res.text);
    });
    $("aiClearBtn")?.addEventListener("click", () => { $("aiInput").value=""; state.adminSuggestion=null; setAiOut("—"); });
    $("aiApplyBtn")?.addEventListener("click", async () => {
      if (!isUnlocked()) return alert("Admin bloqueado 🔒 (Unlock primeiro).");
      if (!state.adminSuggestion) return alert("Não tem sugestão.");
      await adminApply(state.adminSuggestion);
      state.adminSuggestion = null;
      setAiOut("Aplicado ✅");
    });
    $("aiDiscardBtn")?.addEventListener("click", () => { state.adminSuggestion=null; setAiOut("Descartado ✅"); });
  }

  function wireAgent() {
    $("agentRunBtn")?.addEventListener("click", () => {
      if (!isUnlocked()) return alert("Pra usar o Agente, destrave o Admin primeiro (PIN).");
      const res = agentSuggest($("agentInput")?.value || "");
      state.agentSuggestion = res.suggestion || null;
      setAgentOut(res.text);
    });
    $("agentClearBtn")?.addEventListener("click", () => { $("agentInput").value=""; state.agentSuggestion=null; setAgentOut("—"); });
    $("agentApplyBtn")?.addEventListener("click", async () => {
      if (!isUnlocked()) return alert("Pra aplicar, destrave o Admin primeiro (PIN).");
      if (!state.agentSuggestion) return alert("Não tem sugestão.");
      await agentApply(state.agentSuggestion);
      state.agentSuggestion = null;
      setAgentOut("Aplicado ✅");
    });
    $("agentDiscardBtn")?.addEventListener("click", () => { state.agentSuggestion=null; setAgentOut("Descartado ✅"); });
  }

  function renderAll() {
    state.settings = loadSettings();
    state.apps = loadApps();
    state.activeAppId = getActiveAppId();

    renderTemplatesSelect();
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    renderSettings();
    renderAdminState();
  }

  function init() {
    seedIfEmpty();
    wireTabs();
    wireNewApp();
    wireEditor();
    wireGenerator();
    wireSettings();
    wireAdmin();
    wireAgent();

    renderAll();
    showTab("dashboard");
    setStatus("Pronto ✅");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();

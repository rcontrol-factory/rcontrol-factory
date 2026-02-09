(function () {
  "use strict";

  // ========= Storage =========
  const LS = {
    settings: "rcf_settings_v4",
    apps: "rcf_apps_v4",
    active: "rcf_active_v4",
    adminPin: "rcf_admin_pin_v1",
    adminUntil: "rcf_admin_until_v1",
    aiDraft: "rcf_ai_draft_v1"
  };

  const DEFAULT_PIN = "1122";

  const DEFAULT_SETTINGS = {
    ghUser: "",
    ghToken: "",
    repoPrefix: "rapp-",
    pagesBase: ""
  };

  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];

  // ========= Helpers =========
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function safeParse(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

  function sanitizeId(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setStatus(msg) {
    const el = $("statusBox");
    if (el) el.textContent = msg;
  }

  function setGenStatus(msg) {
    const el = $("genStatus");
    if (el) el.textContent = msg;
  }

  // ========= State =========
  let settings = loadSettings();
  let apps = loadApps();
  let activeId = loadActive();
  let currentFile = "index.html";

  // ========= Load/Save =========
  function loadSettings() {
    const raw = localStorage.getItem(LS.settings);
    const data = raw ? safeParse(raw, {}) : {};
    return { ...DEFAULT_SETTINGS, ...(data || {}) };
  }
  function saveSettings() {
    localStorage.setItem(LS.settings, JSON.stringify(settings));
  }

  function loadApps() {
    const raw = localStorage.getItem(LS.apps);
    return raw ? safeParse(raw, []) : [];
  }
  function saveApps() {
    localStorage.setItem(LS.apps, JSON.stringify(apps));
  }

  function loadActive() {
    return localStorage.getItem(LS.active) || "";
  }
  function saveActive(id) {
    activeId = id || "";
    localStorage.setItem(LS.active, activeId);
  }

  function getActiveApp() {
    if (activeId) {
      const a = apps.find(x => x && x.id === activeId);
      if (a) return a;
    }
    return apps[0] || null;
  }

  // ========= Templates =========
  function applyVars(text, app) {
    return String(text).replaceAll("{{APP_NAME}}", app.name).replaceAll("{{APP_ID}}", app.id);
  }

  function templatePwaBase(name, id) {
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
    <h1 style="margin:0">📌 {{APP_NAME}}</h1>
    <div style="opacity:.7;font-size:12px">Gerado pelo RControl Factory • ID: {{APP_ID}}</div>
  </header>

  <main style="max-width:900px;margin:16px auto;padding:0 14px">
    <div style="background:#0f1a2e;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px;color:rgba(255,255,255,.92);font-family:system-ui">
      <h2>App rodando ✅</h2>
      <p>Agora edite <code>app.js</code> e <code>styles.css</code>.</p>
      <button id="btn">Clique aqui</button>
      <div id="out" style="margin-top:10px;padding:10px;border:1px dashed rgba(255,255,255,.2);border-radius:12px;min-height:24px"></div>
    </div>
  </main>

  <script src="app.js"></script>
  <script>
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(()=>{}));
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

    const css = `:root{--bg:#0b1220;--card:#0f1a2e;--border:rgba(255,255,255,.1);--text:rgba(255,255,255,.92)}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui}
button{background:rgba(25,195,125,.2);border:1px solid rgba(25,195,125,.35);color:var(--text);padding:10px 12px;border-radius:12px;font-weight:800}`;

    const manifest = `{
  "name":"{{APP_NAME}}",
  "short_name":"{{APP_NAME}}",
  "start_url":"./",
  "display":"standalone",
  "background_color":"#0b1220",
  "theme_color":"#0b1220",
  "icons":[]
}`;

    const sw = `const CACHE="{{APP_ID}}-v1";
const ASSETS=["./","./index.html","./styles.css","./app.js","./manifest.json"];

self.addEventListener("install",(e)=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(ASSETS);self.skipWaiting();})())});
self.addEventListener("activate",(e)=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null));self.clients.claim();})())});
self.addEventListener("fetch",(e)=>{e.respondWith((async()=>{const cached=await caches.match(e.request);if(cached)return cached;try{return await fetch(e.request)}catch{return caches.match("./index.html")}})())});`;

    const files = {
      "index.html": applyVars(index, { name, id }),
      "app.js": applyVars(appjs, { name, id }),
      "styles.css": applyVars(css, { name, id }),
      "manifest.json": applyVars(manifest, { name, id }),
      "sw.js": applyVars(sw, { name, id })
    };

    return files;
  }

  function getTemplates() {
    return [
      { id: "pwa-base", name: "PWA Base (com app.js + styles.css)", build: templatePwaBase }
    ];
  }

  // ========= UI Tabs =========
  const TABS = ["dashboard", "newapp", "editor", "generator", "settings", "admin"];

  function showTab(tab) {
    TABS.forEach(t => {
      const sec = $("tab-" + t);
      if (sec) sec.classList.toggle("hidden", t !== tab);
    });
    qsa(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  }

  // ========= Render =========
  function renderTemplatesSelect() {
    const sel = $("newTemplate");
    if (!sel) return;
    sel.innerHTML = "";
    getTemplates().forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
  }

  function renderAppsList() {
    const root = $("appsList");
    if (!root) return;

    const active = getActiveApp();
    if (active && active.id !== activeId) saveActive(active.id);

    if (!apps.length) {
      root.innerHTML = `<div class="muted">Nenhum app salvo ainda.</div>`;
      return;
    }

    root.innerHTML = apps.map(a => {
      const on = (a.id === (active ? active.id : ""));
      return `
        <div class="item" data-pick="${escapeHtml(a.id)}">
          <div>
            <strong>${escapeHtml(a.name)}</strong>
            <div class="meta">${escapeHtml(a.id)} • ${escapeHtml(a.type || "pwa")}</div>
          </div>
          <span class="badge ${on ? "on" : ""}">${on ? "ativo" : "selecionar"}</span>
        </div>
      `;
    }).join("");

    qsa("[data-pick]").forEach(el => {
      el.addEventListener("click", () => {
        saveActive(el.getAttribute("data-pick"));
        setStatus("App ativo: " + getActiveApp().name + " ✅");
        renderAppsList();
        renderEditor();
        renderGeneratorSelect();
      });
    });
  }

  function renderEditor() {
    const app = getActiveApp();

    const label = $("activeAppLabel");
    if (label) label.textContent = app ? `${app.name} (${app.id})` : "—";

    const fl = $("filesList");
    const area = $("codeArea");
    const cur = $("currentFileLabel");
    const frame = $("previewFrame");
    if (!fl || !area || !cur || !frame) return;

    if (!app) {
      fl.innerHTML = "";
      area.value = "";
      cur.textContent = "—";
      frame.srcdoc = `<p style="font-family:system-ui;padding:12px">Sem app ativo</p>`;
      return;
    }

    if (!FILE_ORDER.includes(currentFile)) currentFile = "index.html";

    fl.innerHTML = "";
    FILE_ORDER.forEach(f => {
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

    const looksFull = /<!doctype\s+html>/i.test(html) || /<html[\s>]/i.test(html);

    const doc = looksFull
      ? injectIntoFullHtml(html, css, js)
      : `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;

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
    const sel = $("genAppSelect");
    if (!sel) return;

    sel.innerHTML = "";
    apps.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = `${a.name} (${a.id})`;
      sel.appendChild(opt);
    });

    const active = getActiveApp();
    if (active) sel.value = active.id;
  }

  function renderSettings() {
    $("ghUser").value = settings.ghUser || "";
    $("ghToken").value = settings.ghToken || "";
    $("repoPrefix").value = settings.repoPrefix || "rapp-";
    $("pagesBase").value = settings.pagesBase || (settings.ghUser ? `https://${settings.ghUser}.github.io` : "");
  }

  // ========= ZIP =========
  async function downloadZip(app) {
    if (typeof JSZip === "undefined") {
      alert("JSZip não carregou.");
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

  // ========= Admin lock =========
  function getPin() {
    return localStorage.getItem(LS.adminPin) || DEFAULT_PIN;
  }
  function isUnlocked() {
    const until = Number(localStorage.getItem(LS.adminUntil) || "0");
    return until > Date.now();
  }
  function setUnlocked(minutes) {
    localStorage.setItem(LS.adminUntil, String(Date.now() + minutes * 60 * 1000));
  }
  function renderAdminState() {
    const st = $("adminState");
    if (!st) return;
    st.textContent = isUnlocked() ? "UNLOCK ✅" : "LOCKED 🔒";
    st.classList.toggle("on", isUnlocked());
  }
  function guardUnlocked() {
    if (isUnlocked()) return true;
    alert("Admin bloqueado 🔒 (digite PIN e Unlock).");
    return false;
  }

  // ========= PWA cache nuke =========
  async function nukePwaCache() {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {}
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {}
  }

  // ========= Diagnosis =========
  async function buildDiagnosis() {
    const lines = [];
    const add = (k, v) => lines.push(`${k}: ${v}`);

    add("=== RCF DIAGNÓSTICO (V2) ===", "");
    add("URL", location.href);
    add("UA", navigator.userAgent);
    add("Hora", new Date().toString());
    add("Apps", apps.length);
    add("Active", (getActiveApp() ? `${getActiveApp().name} / ${getActiveApp().id}` : "(nenhum)"));

    try {
      add("SW supported", ("serviceWorker" in navigator) ? "SIM" : "NÃO");
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        add("SW registrations", regs.length);
      }
    } catch { add("SW", "ERRO"); }

    try {
      add("Cache API", ("caches" in window) ? "SIM" : "NÃO");
      if ("caches" in window) {
        const keys = await caches.keys();
        add("Caches", keys.join(", ") || "(nenhum)");
      }
    } catch { add("Caches", "ERRO"); }

    add("Admin unlocked", isUnlocked() ? "SIM" : "NÃO");
    return lines.join("\n");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copiado ✅");
    } catch {
      alert("iOS bloqueou copiar automático. Copie manual.");
    }
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

  // ========= Mini IA Offline (70%) =========
  // Ela gera um "plano/sugestão" e salva no LS.aiDraft.
  // Só aplica se você clicar "Aplicar sugestão".
  function aiSuggest(text) {
    const raw = String(text || "").trim();
    const lower = raw.toLowerCase();

    const active = getActiveApp();
    const out = [];

    const draft = {
      action: null,
      payload: null,
      preview: ""
    };

    if (!raw) {
      return { out: "Digite algo. Ex: criar app RQuotas | listar apps | selecionar rquotas", draft: null };
    }

    if (lower.startsWith("listar") || lower === "list") {
      if (!apps.length) return { out: "Nenhum app salvo ainda.", draft: null };
      return { out: "Apps:\n" + apps.map(a => `- ${a.name} (${a.id})`).join("\n"), draft: null };
    }

    if (lower.startsWith("selecionar ")) {
      const id = sanitizeId(raw.replace(/^selecionar\s+/i, "").trim());
      const exists = apps.some(a => a.id === id);
      if (!exists) return { out: "ERRO: app não encontrado: " + id, draft: null };
      draft.action = "select_app";
      draft.payload = { id };
      draft.preview = `Vai selecionar o app: ${id}`;
      return { out: "Sugestão pronta ✅\n" + draft.preview + "\nClique: Aplicar sugestão", draft };
    }

    if (lower.startsWith("criar app ") || lower.startsWith("create app ")) {
      const name = raw.replace(/^criar\s+app\s+/i, "").replace(/^create\s+app\s+/i, "").trim() || "Novo App";
      const id = sanitizeId(name);
      if (apps.some(a => a.id === id)) {
        return { out: `Já existe app com ID ${id}. Use: selecionar ${id}`, draft: null };
      }
      draft.action = "create_app";
      draft.payload = { name, id, templateId: "pwa-base" };
      draft.preview = `Vai criar app:\nNome: ${name}\nID: ${id}\nTemplate: PWA Base`;
      return { out: "Sugestão pronta ✅\n" + draft.preview + "\nClique: Aplicar sugestão", draft };
    }

    if (lower.includes("corrigir sw") || lower.includes("service worker")) {
      draft.action = "fix_factory_sw";
      draft.payload = {};
      draft.preview = `Vai limpar Cache PWA + forçar recarregar.`;
      return { out: "Sugestão pronta ✅\n" + draft.preview + "\nClique: Aplicar sugestão", draft };
    }

    // fallback: orientação
    out.push("Entendi, mas preciso de comando claro.");
    out.push("Exemplos:");
    out.push("- criar app RQuotas");
    out.push("- listar apps");
    out.push("- selecionar rquotas");
    out.push("- corrigir sw");
    return { out: out.join("\n"), draft: null };
  }

  async function aiApplyDraft() {
    const raw = localStorage.getItem(LS.aiDraft) || "";
    const draft = raw ? safeParse(raw, null) : null;
    if (!draft || !draft.action) return "Nenhuma sugestão para aplicar.";

    if (!guardUnlocked()) return "Admin bloqueado.";

    if (draft.action === "select_app") {
      saveActive(draft.payload.id);
      renderAppsList();
      renderEditor();
      renderGeneratorSelect();
      return "✅ App selecionado: " + draft.payload.id;
    }

    if (draft.action === "create_app") {
      const { name, id, templateId } = draft.payload;
      const tpl = getTemplates().find(t => t.id === templateId) || getTemplates()[0];
      const files = tpl.build(name, id);

      const app = {
        name,
        id,
        type: "pwa",
        templateId,
        createdAt: Date.now(),
        files,
        baseFiles: { ...files }
      };

      apps.unshift(app);
      saveApps();
      saveActive(id);

      renderAppsList();
      renderEditor();
      renderGeneratorSelect();
      showTab("editor");
      return `✅ App criado: ${name} (${id})`;
    }

    if (draft.action === "fix_factory_sw") {
      await nukePwaCache();
      location.reload();
      return "Recarregando…";
    }

    return "Ação desconhecida.";
  }

  function aiSetDraft(draft) {
    if (!draft) {
      localStorage.removeItem(LS.aiDraft);
      return;
    }
    localStorage.setItem(LS.aiDraft, JSON.stringify(draft));
  }

  // ========= Wire events =========
  function wireTabs() {
    qsa(".tab").forEach(b => {
      b.addEventListener("click", () => {
        showTab(b.dataset.tab);
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

    const validate = () => {
      const name = (nameEl.value || "").trim();
      const id = sanitizeId(idEl.value || "");
      if (idEl.value !== id) idEl.value = id;

      const errors = [];
      if (name.length < 2) errors.push("Nome muito curto.");
      if (id.length < 2) errors.push("ID muito curto.");
      if (!/^[a-z0-9-]+$/.test(id)) errors.push("ID só pode a-z 0-9 e hífen.");
      if (apps.some(a => a.id === id)) errors.push("Já existe app com esse ID.");

      valEl.textContent = errors.length ? errors.map(e => "- " + e).join("\n") : "OK ✅";
      return errors;
    };

    nameEl?.addEventListener("input", validate);
    idEl?.addEventListener("input", validate);

    $("createAppBtn")?.addEventListener("click", () => {
      const errors = validate();
      if (errors.length) return alert("Corrija:\n\n" + errors.join("\n"));

      const name = (nameEl.value || "").trim();
      const id = sanitizeId(idEl.value || "");
      const tplId = $("newTemplate")?.value || "pwa-base";

      const tpl = getTemplates().find(t => t.id === tplId) || getTemplates()[0];
      const files = tpl.build(name, id);

      const app = {
        name, id, type: "pwa", templateId: tplId,
        createdAt: Date.now(),
        files,
        baseFiles: { ...files }
      };

      apps.unshift(app);
      saveApps();
      saveActive(id);

      nameEl.value = "";
      idEl.value = "";
      $("newAppValidation").textContent = "OK ✅";

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
      const app = getActiveApp();
      if (!app) return alert("Nenhum app ativo.");

      app.files[currentFile] = $("codeArea").value || "";
      saveApps();
      setStatus("Salvo: " + currentFile + " ✅");
      renderEditor();
    });

    $("resetFileBtn")?.addEventListener("click", () => {
      const app = getActiveApp();
      if (!app) return alert("Nenhum app ativo.");
      if (!confirm("Resetar " + currentFile + " para o padrão?")) return;

      app.files[currentFile] = app.baseFiles?.[currentFile] ?? "";
      saveApps();
      setStatus("Reset: " + currentFile + " ✅");
      renderEditor();
    });

    $("openPreviewBtn")?.addEventListener("click", () => {
      const app = getActiveApp();
      if (!app) return;
      refreshPreview(app);
      setStatus("Preview atualizado ✅");
    });
  }

  function wireGenerator() {
    $("genAppSelect")?.addEventListener("change", () => {
      saveActive($("genAppSelect").value);
      renderAppsList();
      renderEditor();
    });

    $("downloadZipBtn")?.addEventListener("click", async () => {
      const id = $("genAppSelect")?.value || (getActiveApp() ? getActiveApp().id : "");
      const app = apps.find(a => a.id === id);
      if (!app) return alert("Selecione um app.");

      setGenStatus("Status: gerando ZIP…");
      await downloadZip(app);
      setGenStatus("Status: ZIP pronto ✅");
    });

    $("publishBtn")?.addEventListener("click", () => {
      alert("Publish entra depois. Agora é estabilidade + templates + comandos.");
    });

    $("copyLinkBtn")?.addEventListener("click", async () => {
      const link = $("publishedLink")?.href || "";
      if (!link || link === location.href) return alert("Ainda não tem link.");
      await copyText(link);
    });
  }

  function wireSettings() {
    $("saveSettingsBtn")?.addEventListener("click", () => {
      settings.ghUser = ($("ghUser").value || "").trim();
      settings.ghToken = ($("ghToken").value || "").trim();
      settings.repoPrefix = ($("repoPrefix").value || "rapp-").trim() || "rapp-";
      settings.pagesBase = ($("pagesBase").value || "").trim() || (settings.ghUser ? `https://${settings.ghUser}.github.io` : "");
      saveSettings();
      setStatus("Settings salvas ✅");
      alert("Settings salvas ✅");
    });

    $("resetFactoryBtn")?.addEventListener("click", () => {
      if (!confirm("Vai apagar apps + settings locais. Continuar?")) return;
      localStorage.removeItem(LS.settings);
      localStorage.removeItem(LS.apps);
      localStorage.removeItem(LS.active);
      localStorage.removeItem(LS.aiDraft);
      settings = loadSettings();
      apps = [];
      saveActive("");
      initRender();
      alert("Factory resetado ✅");
    });
  }

  function wireAdmin() {
    $("adminUnlockBtn")?.addEventListener("click", () => {
      const pin = ($("adminPinInput").value || "").trim();
      if (pin !== getPin()) return alert("PIN errado ❌");
      setUnlocked(15);
      $("adminPinInput").value = "";
      renderAdminState();
      alert("Admin liberado por 15 min ✅");
    });

    $("diagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosis();
      $("adminOut").textContent = rep;
    });

    $("copyDiagBtn")?.addEventListener("click", async () => {
      const rep = await buildDiagnosis();
      $("adminOut").textContent = rep;
      await copyText(rep);
    });

    $("clearPwaBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      if (!confirm("Vai limpar caches + desregistrar SW e recarregar. Continuar?")) return;
      await nukePwaCache();
      location.reload();
    });

    $("exportBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        settings,
        apps,
        activeId: (getActiveApp() ? getActiveApp().id : "")
      };
      downloadText("rcf-backup-v2.json", JSON.stringify(payload, null, 2));
    });

    $("importBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      const file = await pickFile();
      if (!file) return;
      const text = await file.text();
      const data = safeParse(text, null);
      if (!data) return alert("JSON inválido.");
      if (data.settings) settings = { ...DEFAULT_SETTINGS, ...data.settings };
      if (Array.isArray(data.apps)) apps = data.apps;
      saveSettings();
      saveApps();
      saveActive(data.activeId || "");
      alert("Import OK ✅ Recarregando…");
      location.reload();
    });

    // IA offline
    $("aiRunBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      const text = $("aiInput").value || "";
      const r = aiSuggest(text);
      $("aiOut").textContent = r.out;
      aiSetDraft(r.draft);
    });

    $("aiClearBtn")?.addEventListener("click", () => {
      $("aiInput").value = "";
      $("aiOut").textContent = "—";
      aiSetDraft(null);
    });

    $("aiDiscardBtn")?.addEventListener("click", () => {
      if (!guardUnlocked()) return;
      aiSetDraft(null);
      $("aiOut").textContent = "Sugestão descartada ✅";
    });

    $("aiApplyBtn")?.addEventListener("click", async () => {
      if (!guardUnlocked()) return;
      const msg = await aiApplyDraft();
      $("aiOut").textContent = msg;
      aiSetDraft(null);
    });
  }

  function initRender() {
    renderTemplatesSelect();
    renderAppsList();
    renderEditor();
    renderGeneratorSelect();
    renderSettings();
    renderAdminState();
    setGenStatus("Status: pronto ✅");
  }

  function init() {
    // garante active
    const a = getActiveApp();
    if (a) saveActive(a.id);

    wireTabs();
    wireNewApp();
    wireEditor();
    wireGenerator();
    wireSettings();
    wireAdmin();

    initRender();
    showTab("dashboard");
    setStatus("Pronto ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

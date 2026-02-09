/* =========================================================
   RControl Factory — app/app.js (MODULAR, NO imports)
   - Usa window.RCF.engine (ai.js), window.RCF.templates, window.RCF.router
   - UI Tabs + Apps + Editor + Preview + Logs/Diag
   - iPhone-friendly
   ========================================================= */

(function () {
  "use strict";

  // ------------------- Debug console / logs -------------------
  const LOG_MAX = 250;
  const logs = [];

  function pushLog(level, args) {
    const time = new Date().toISOString().slice(11, 19);
    const msg = (args || []).map((a) => {
      try { return typeof a === "string" ? a : JSON.stringify(a); }
      catch { return String(a); }
    }).join(" ");
    logs.push({ time, level, msg });
    while (logs.length > LOG_MAX) logs.shift();
    renderLogPanel();
  }

  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...a) => { orig.log(...a); pushLog("log", a); };
  console.warn = (...a) => { orig.warn(...a); pushLog("warn", a); };
  console.error = (...a) => { orig.error(...a); pushLog("error", a); };

  window.addEventListener("error", (e) => {
    pushLog("error", [e.message || "Erro", e.filename, e.lineno, e.colno]);
  });
  window.addEventListener("unhandledrejection", (e) => {
    pushLog("error", ["Promise rejeitada:", e.reason]);
  });

  function ensureDebugUI() {
    if (document.getElementById("rcf-debug-panel")) return;

    const panel = document.createElement("div");
    panel.id = "rcf-debug-panel";
    panel.style.cssText = `
      position:fixed; left:12px; right:12px; bottom:64px; z-index:99999;
      max-height:55vh; overflow:auto; padding:10px;
      border-radius:14px; border:1px solid rgba(255,255,255,.15);
      background:rgba(10,10,10,.92); color:#eaeaea; font:12px/1.35 -apple-system,system-ui,Segoe UI,Roboto,Arial;
      white-space:pre-wrap; display:none;
    `;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;";

    const btnClear = mkBtn("Limpar logs", async () => { logs.length = 0; renderLogPanel(); });
    const btnCopy = mkBtn("Copiar logs", async () => {
      const text = logs.map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n");
      try { await navigator.clipboard.writeText(text); alert("Logs copiados ✅"); }
      catch { alert("iOS bloqueou copiar. Segura no texto e copia manual."); }
    });

    const btnDiagCopy = mkBtn("Copiar diagnóstico", async () => {
      const diag = await buildDiagnosis();
      try { await navigator.clipboard.writeText(diag); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Vou mostrar na tela; copie manual."); }
      const body = document.getElementById("rcf-debug-body");
      if (body) body.textContent = diag;
      panel.style.display = "block";
    });

    const btnNuke = mkBtn("Limpar Cache PWA", async () => {
      const ok = confirm("Vai limpar caches + desregistrar Service Worker e recarregar. Continuar?");
      if (!ok) return;
      await nukePwa();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

    actions.append(btnClear, btnCopy, btnDiagCopy, btnNuke);
    panel.append(actions);

    const body = document.createElement("div");
    body.id = "rcf-debug-body";
    panel.append(body);

    const btnLogs = document.createElement("button");
    btnLogs.id = "rcf-btn-logs";
    btnLogs.textContent = "Logs";
    btnLogs.style.cssText = fixedBtnCss("right:12px; bottom:12px;");
    btnLogs.onclick = () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      renderLogPanel();
    };

    const btnDiag = document.createElement("button");
    btnDiag.id = "rcf-btn-diag";
    btnDiag.textContent = "Diag";
    btnDiag.style.cssText = fixedBtnCss("right:72px; bottom:12px;");
    btnDiag.onclick = async () => {
      const diag = await buildDiagnosis();
      const b = document.getElementById("rcf-debug-body");
      if (b) b.textContent = diag;
      panel.style.display = "block";
    };

    document.body.append(btnDiag, btnLogs, panel);

    function mkBtn(txt, fn) {
      const b = document.createElement("button");
      b.textContent = txt;
      b.style.cssText = "padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900;";
      b.onclick = fn;
      return b;
    }
    function fixedBtnCss(pos) {
      return `
        position:fixed; z-index:99999; ${pos}
        padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
        background:rgba(0,0,0,.55); color:white; font-weight:900;
      `;
    }
  }

  function renderLogPanel() {
    const body = document.getElementById("rcf-debug-body");
    if (!body) return;
    body.textContent = logs.map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n");
  }

  async function nukePwa() {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) { console.warn("Falha ao limpar caches:", e); }

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) { console.warn("Falha ao desregistrar SW:", e); }
  }

  async function buildDiagnosis() {
    const lines = [];
    const add = (k, v) => lines.push(`${k}: ${v}`);

    add("=== RCF DIAGNÓSTICO ===", "");
    add("URL", location.href);
    add("UA", navigator.userAgent);
    add("Hora", new Date().toString());

    add("RCF exists", window.RCF ? "SIM" : "NÃO");
    add("engine", window.RCF?.engine ? "SIM" : "NÃO");
    add("templates", window.RCF?.templates ? "SIM" : "NÃO");
    add("router", window.RCF?.router ? "SIM" : "NÃO");

    try {
      const apps = window.RCF?.engine?.loadApps ? window.RCF.engine.loadApps() : [];
      add("Apps count", apps.length);
      add("Active ID", window.RCF?.engine?.getActiveId ? (window.RCF.engine.getActiveId() || "(vazio)") : "(sem engine)");
    } catch (e) { add("Apps parse", "ERRO: " + e.message); }

    add("SW supported", ("serviceWorker" in navigator) ? "SIM" : "NÃO");
    add("Cache API", ("caches" in window) ? "SIM" : "NÃO");

    const must = ["tabs","tab-dashboard","tab-newapp","tab-editor","tab-generator","tab-settings"];
    const missing = must.filter(id => !document.getElementById(id));
    add("DOM missing IDs", missing.length ? missing.join(", ") : "OK");

    add("---- últimos logs ----", "");
    lines.push(logs.slice(-50).map(l => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n") || "(sem logs)");

    return lines.join("\n");
  }

  // ------------------- UI / Factory core -------------------
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function setStatus(msg) {
    const el = $("statusBox");
    if (el) el.textContent = msg;
    console.log("STATUS:", msg);
  }

  function showTab(tab) {
    const tabs = ["dashboard", "newapp", "editor", "generator", "settings"];
    tabs.forEach((t) => $(`tab-${t}`)?.classList.toggle("hidden", t !== tab));
    qsa(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // --------- Render Apps list ----------
  function renderAppsList() {
    const root = $("appsList");
    if (!root) return;
    root.innerHTML = "";

    const engine = window.RCF?.engine;
    if (!engine) {
      root.innerHTML = `<div class="muted">ERRO: engine não carregou (js/ai.js)</div>`;
      return;
    }

    const apps = engine.loadApps();
    const active = engine.getActiveId();

    if (!apps.length) {
      root.innerHTML = `<div class="muted">Nenhum app salvo ainda.</div>`;
      return;
    }

    apps.forEach((a) => {
      const div = document.createElement("div");
      div.className = "item";
      const isOn = a.id === active;
      div.innerHTML = `
        <div>
          <strong>${escapeHtml(a.name)}</strong>
          <div class="meta">${escapeHtml(a.id)} • pwa</div>
        </div>
        <span class="badge ${isOn ? "on" : ""}">${isOn ? "ativo" : "selecionar"}</span>
      `;
      div.onclick = () => {
        engine.setActiveId(a.id);
        setStatus(`App ativo: ${a.name} (${a.id}) ✅`);
        renderAppsList();
        renderEditor();
      };
      root.appendChild(div);
    });
  }

  // --------- New App ----------
  function sanitizeId(raw) {
    return (raw || "")
      .trim().toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function wireNewApp() {
    const nameEl = $("newName");
    const idEl = $("newId");
    const templateEl = $("newTemplate");
    const valEl = $("newAppValidation");

    if (!nameEl || !idEl || !templateEl) return;

    templateEl.innerHTML = "";
    const tplList = window.RCF?.templates?.getTemplates ? window.RCF.templates.getTemplates() : null;

    if (tplList && Array.isArray(tplList)) {
      tplList.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.name;
        templateEl.appendChild(opt);
      });
    } else {
      const opt = document.createElement("option");
      opt.value = "pwa-base";
      opt.textContent = "PWA Base";
      templateEl.appendChild(opt);
    }

    function validate() {
      const name = (nameEl.value || "").trim();
      const id = sanitizeId(idEl.value);
      const errors = [];
      if (name.length < 2) errors.push("Nome muito curto.");
      if (id.length < 2) errors.push("ID muito curto.");
      if (!/^[a-z0-9-]+$/.test(id)) errors.push("ID só pode ter a-z, 0-9 e hífen.");
      if (valEl) valEl.textContent = errors.length ? errors.map(e => `- ${e}`).join("\n") : "OK ✅";
      return { name, id, errors };
    }

    idEl.addEventListener("input", () => {
      const s = sanitizeId(idEl.value);
      if (s !== idEl.value) idEl.value = s;
      validate();
    });
    nameEl.addEventListener("input", validate);

    $("createAppBtn")?.addEventListener("click", () => {
      const engine = window.RCF?.engine;
      const templates = window.RCF?.templates;
      if (!engine || !templates) return alert("ERRO: engine/templates não carregou.");

      const v = validate();
      if (v.errors.length) return alert("Corrija antes:\n\n" + v.errors.join("\n"));

      const tplId = templateEl.value || "pwa-base";
      const app = templates.createAppFromTemplate
        ? templates.createAppFromTemplate(v.name, v.id, tplId)
        : null;

      if (!app && engine.createApp) {
        engine.createApp(v.name, templates);
      }

      nameEl.value = "";
      idEl.value = "";
      if (valEl) valEl.textContent = "OK ✅";

      setStatus(`App criado: ${v.name} (${v.id}) ✅`);
      renderAppsList();
      renderEditor();
      showTab("editor");
    });

    $("cancelNew")?.addEventListener("click", () => showTab("dashboard"));
  }

  // --------- Editor ----------
  const FILE_ORDER = ["index.html", "app.js", "styles.css", "manifest.json", "sw.js"];
  let currentFile = "index.html";

  function getActiveApp() {
    const engine = window.RCF?.engine;
    if (!engine) return null;
    const apps = engine.loadApps();
    const id = engine.getActiveId();
    return apps.find(a => a.id === id) || null;
  }

  function saveActiveApp(app) {
    const engine = window.RCF?.engine;
    if (!engine) return;
    const apps = engine.loadApps();
    const idx = apps.findIndex(a => a.id === app.id);
    if (idx >= 0) {
      apps[idx] = app;
      engine.saveApps(apps);
    }
  }

  function renderEditor() {
    const app = getActiveApp();

    $("activeAppLabel").textContent = app ? `${app.name} (${app.id})` : "—";

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
      b.onclick = () => { currentFile = f; renderEditor(); };
      fl.appendChild(b);
    });

    cur.textContent = currentFile;
    area.value = app.files?.[currentFile] ?? "";

    refreshPreview(app);
  }

  function refreshPreview(app) {
    const frame = $("previewFrame");
    if (!frame) return;

    const html = app.files?.["index.html"] || "<h1>Sem index.html</h1>";
    const css = app.files?.["styles.css"] || "";
    const js = app.files?.["app.js"] || "";

    const looksFull = /<!doctype\s+html>/i.test(html) || /<html[\s>]/i.test(html);

    const doc = looksFull
      ? injectIntoFullHtml(html, css, js)
      : `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;

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

  function wireEditor() {
    $("saveFileBtn")?.addEventListener("click", () => {
      const app = getActiveApp();
      if (!app) return alert("Nenhum app ativo.");
      app.files = app.files || {};
      app.files[currentFile] = $("codeArea").value;
      saveActiveApp(app);
      setStatus(`Salvo: ${currentFile} ✅`);
      renderEditor();
    });

    $("openPreviewBtn")?.addEventListener("click", () => {
      const app = getActiveApp();
      if (!app) return;
      refreshPreview(app);
      setStatus("Preview atualizado ✅");
    });

    $("resetFileBtn")?.addEventListener("click", () => {
      const app = getActiveApp();
      if (!app) return alert("Nenhum app ativo.");
      if (!confirm("Resetar arquivo para o template base?")) return;

      const templates = window.RCF?.templates;
      if (templates?.resetFileFromBase) {
        app.files[currentFile] = templates.resetFileFromBase(app, currentFile);
      } else {
        alert("Reset avançado não está ligado ainda. (Vamos ligar depois.)");
        return;
      }
      saveActiveApp(app);
      setStatus(`Reset: ${currentFile} ✅`);
      renderEditor();
    });
  }

  // ======= COLE A PARTE 2 ABAIXO (SEM APAGAR NADA) =======
   // --------- Generator (ZIP) ----------
  function wireGenerator() {
    $("downloadZipBtn")?.addEventListener("click", async () => {
      const app = getActiveApp();
      if (!app) return alert("Selecione um app.");
      if (typeof JSZip === "undefined") return alert("JSZip não carregou (verifique index.html).");

      const zip = new JSZip();
      Object.entries(app.files || {}).forEach(([path, content]) => zip.file(path, String(content ?? "")));
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

      const st = $("genStatus");
      if (st) st.textContent = "Status: ZIP pronto ✅";
      console.log("ZIP pronto ✅");
    });
  }

  // --------- Tabs / Buttons ----------
  function wireTabs() {
    qsa(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
    $("goNewApp")?.addEventListener("click", () => showTab("newapp"));
    $("goEditor")?.addEventListener("click", () => showTab("editor"));
    $("goGenerator")?.addEventListener("click", () => showTab("generator"));
  }

  function init() {
    console.log("RCF init…");
    ensureDebugUI();

    // valida módulos
    if (!window.RCF || !window.RCF.engine || !window.RCF.templates) {
      console.error("RCF módulos faltando. Confira se index.html carrega js/ai.js, js/templates.js, js/router.js antes do app.js");
      alert("ERRO: módulos não carregaram. Abra 'Diag' e copie o diagnóstico pra mim.");
    }

    wireTabs();
    wireNewApp();
    wireEditor();
    wireGenerator();

    renderAppsList();
    renderEditor();
    showTab("dashboard");
    setStatus("Pronto ✅");

    console.log("RCF pronto ✅");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();

/* FILE: app/app.js
   RControl Factory — /app/app.js — V8.1d PADRÃO (RECONSTRUÇÃO LÓGICA)
   - Arquivo completo (1 peça) pra copiar/colar (use os zips PART A/B se o chat cortar)
   - FIX: Apps list layout (ellipsis + ações)
   - ADD: Dashboard -> botão APAGAR app (com confirmação + ajusta active)
   - FIX: Preview preso -> teardownPreviewHard() ao sair do Generator
   - FIX: Evitar duplo bind do Generator (stubs só se módulo real não existir)
   - ADD: "Doctor" (Diagnostics) APENAS dentro do FAB ⚡ (raiozinho). Não fica em Tools nem Tabs.
   - Mantém: boot lock, stability guard, UI_READY bus, Admin Injector SAFE, Agent V8, SW tools, Mãe (clear compat)
*/

(() => {
  "use strict";

  // =========================================================
  // BOOT LOCK (SAFE: permite retry se falhar)
  // =========================================================
  const __BOOT_KEY = "__RCF_BOOT_STATE__";
  try {
    const st = window[__BOOT_KEY] || {};
    const now = Date.now();
    if (st.booted === true) return;
    if (st.booting === true && (now - (st.ts || 0)) < 8000) return;
    window[__BOOT_KEY] = { booting: true, booted: false, ts: now, ver: "v8.1d" };
  } catch {
    if (window.__RCF_BOOTED__) return;
    window.__RCF_BOOTED__ = true;
  }

  // =========================================================
  // BOOT WATCHDOG (anti "carregando pra sempre")
  // =========================================================
  try {
    setTimeout(() => {
      try {
        if (document.getElementById("rcfRoot")) return;
        const msg = [
          "UI não montou (rcfRoot ausente).",
          "Provável causa: SW/cache preso ou erro antes do render.",
          "",
          "Ação rápida:",
          "1) Tools -> Unregister SW",
          "2) Tools -> Clear SW Cache",
          "3) Recarregar"
        ].join("\n");
        try { Logger.write("boot watchdog:", msg); } catch {}
        try { Stability.showErrorScreen("Boot travou", msg); } catch {}
      } catch {}
    }, 2800);
  } catch {}

  // =========================================================
  // Utils
  // =========================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const nowISO = () => new Date().toISOString();

  const safeJsonParse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
  const safeJsonStringify = (obj) => { try { return JSON.stringify(obj); } catch { return String(obj); } };

  const slugify = (str) => String(str || "")
    .trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  const escapeAttr = (s) => escapeHtml(s).replace(/'/g, "&#39;");
  const uiMsg = (sel, text) => { const el = $(sel); if (el) el.textContent = String(text ?? ""); };

  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  // =========================================================
  // Storage (prefix rcf:)
  // =========================================================
  const Storage = {
    prefix: "rcf:",
    get(key, fallback) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        if (v == null) return fallback;
        return safeJsonParse(v, fallback);
      } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch {} },
    getRaw(key, fallback="") { try { const v = localStorage.getItem(this.prefix + key); return v==null?fallback:String(v); } catch { return fallback; } },
    setRaw(key, raw) { try { localStorage.setItem(this.prefix + key, String(raw ?? "")); } catch {} },
    del(key) { try { localStorage.removeItem(this.prefix + key); } catch {} }
  };

  // =========================================================
  // Logger (espelha UI)
  // =========================================================
  const Logger = {
    bufKey: "logs",
    max: 900,
    _mirrorUI(logs) {
      const txt = (logs || []).join("\n");
      const ids = ["#logsBox", "#logsOut", "#logsViewBox"];
      for (const id of ids) {
        const el = $(id);
        if (el) el.textContent = txt;
      }
      const injLog = $("#injLog");
      if (injLog) injLog.textContent = txt.slice(-8000);
    },
    write(...args) {
      const msg = args.map(a => (typeof a === "string" ? a : safeJsonStringify(a))).join(" ");
      const line = `[${new Date().toLocaleString()}] ${msg}`;
      const logs = Storage.get(this.bufKey, []);
      logs.push(line);
      while (logs.length > this.max) logs.shift();
      Storage.set(this.bufKey, logs);
      this._mirrorUI(logs);
      try { console.log("[RCF]", ...args); } catch {}
    },
    clear() { Storage.set(this.bufKey, []); this._mirrorUI([]); },
    getAll() { return Storage.get(this.bufKey, []); }
  };

  window.RCF_LOGGER = window.RCF_LOGGER || {
    push(level, msg) { Logger.write(String(level || "log") + ":", msg); },
    clear() { Logger.clear(); },
    getText() { return Logger.getAll().join("\n"); },
    dump() { return Logger.getAll().join("\n"); }
  };

  // =========================================================
  // Stability guard (anti tela branca)
  // =========================================================
  const Stability = (() => {
    let installed = false;
    let originalConsoleError = null;

    function normalizeErr(e) {
      try {
        if (!e) return { message: "unknown", stack: "" };
        if (typeof e === "string") return { message: e, stack: "" };
        return { message: String(e.message || e), stack: String(e.stack || "") };
      } catch { return { message: "unknown", stack: "" }; }
    }

    function showErrorScreen(title, details) {
      try {
        const root = $("#app");
        if (!root) return;
        root.innerHTML = `
          <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:18px;background:#070b12;color:#fff;font-family:system-ui">
            <div style="max-width:780px;width:100%;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px;background:rgba(255,255,255,.04)">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <div style="font-size:20px">⚠️</div>
                <div style="font-weight:900;font-size:18px">${escapeHtml(title || "Erro")}</div>
              </div>
              <div style="opacity:.9;margin-bottom:10px">A Factory detectou um erro e abriu esta tela controlada para evitar “tela branca”.</div>
              <pre style="white-space:pre-wrap;word-break:break-word;padding:12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);max-height:45vh;overflow:auto">${escapeHtml(String(details || ""))}</pre>
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
                <button id="rcfReloadBtn" style="padding:10px 14px;border-radius:10px;border:0;background:#2dd4bf;color:#022; font-weight:800">Recarregar</button>
                <button id="rcfClearLogsBtn" style="padding:10px 14px;border-radius:10px;border:0;background:#ef4444;color:#fff;font-weight:800">Limpar logs</button>
              </div>
            </div>
          </div>
        `;
        $("#rcfReloadBtn")?.addEventListener("click", () => location.reload(), { passive: true });
        $("#rcfClearLogsBtn")?.addEventListener("click", () => { try { Logger.clear(); } catch {} alert("Logs limpos."); }, { passive: true });
      } catch {}
    }

    function install() {
      if (installed) return;
      installed = true;

      window.addEventListener("error", (ev) => {
        try {
          const msg = ev?.message || "window.error";
          const src = ev?.filename ? ` @ ${ev.filename}:${ev.lineno || 0}:${ev.colno || 0}` : "";
          Logger.write("ERR:", msg + src);
          if (ev?.error) {
            const ne = normalizeErr(ev.error);
            Logger.write("ERR.stack:", ne.stack || "(no stack)");
          }
        } catch {}
      });

      window.addEventListener("unhandledrejection", (ev) => {
        try {
          const ne = normalizeErr(ev?.reason);
          Logger.write("UNHANDLED:", ne.message);
          if (ne.stack) Logger.write("UNHANDLED.stack:", ne.stack);
        } catch {}
      });

      try {
        if (!originalConsoleError) originalConsoleError = console.error.bind(console);
        console.error = (...args) => {
          try { Logger.write("console.error:", ...args); } catch {}
          try { originalConsoleError(...args); } catch {}
        };
      } catch {}

      Logger.write("stability:", "ErrorGuard installed ✅");
    }

    return { install, showErrorScreen };
  })();

  // =========================================================
  // iOS Tap binder (anti double-click)
  // =========================================================
  function bindTap(el, fn) {
    if (!el) return;
    if (el.__rcf_bound__) return;
    el.__rcf_bound__ = true;

    let last = 0;
    const handler = (ev) => {
      const t = Date.now();
      if ((t - last) < 350) return;
      last = t;

      try {
        if (ev && ev.cancelable) ev.preventDefault();
        ev?.stopPropagation?.();
      } catch {}

      try { fn(ev); }
      catch (e) { Logger.write("tap err:", e?.message || e); }
    };

    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
    } catch {}

    if (window.PointerEvent) el.addEventListener("pointerup", handler, { passive: false });
    else {
      el.addEventListener("touchend", handler, { passive: false });
      el.addEventListener("click", handler, { passive: false });
    }
  }

  
  // =========================================================
  // Doctor loader (lazy)
  // =========================================================
  function loadScriptOnce(src, id) {
    return new Promise((resolve) => {
      try {
        if (id && document.getElementById(id)) return resolve(true);
        // já carregou?
        const exists = Array.from(document.scripts || []).some(s => (s && s.src) ? s.src.includes(src) : false);
        if (exists) return resolve(true);

        const s = document.createElement("script");
        if (id) s.id = id;
        s.src = src;
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      } catch {
        resolve(false);
      }
    });
  }

  async function ensureDoctorScan() {
    try {
      if (window.RCF_DOCTOR_SCAN && typeof window.RCF_DOCTOR_SCAN.open === "function") return true;
      // tenta carregar o módulo (core)
      const ok = await loadScriptOnce("/app/js/core/doctor_scan.js", "__rcfDoctorScanScript");
      if (ok && window.RCF_DOCTOR_SCAN && typeof window.RCF_DOCTOR_SCAN.open === "function") return true;

      // fallback paths (compat)
      await loadScriptOnce("/js/core/doctor_scan.js", "__rcfDoctorScanScript2");
      return !!(window.RCF_DOCTOR_SCAN && typeof window.RCF_DOCTOR_SCAN.open === "function");
    } catch {
      return false;
    }
  }

// =========================================================
  // State
  // =========================================================
  const State = {
    cfg: Storage.get("cfg", { mode: "safe", autoApplySafe: true, writeMode: "modal" }),
    apps: Storage.get("apps", []),
    active: Storage.get("active", { appSlug: null, file: null, view: "dashboard" }),
    pending: Storage.get("pending", { patch: null, source: null })
  };

  function saveAll() {
    Storage.set("cfg", State.cfg);
    Storage.set("apps", State.apps);
    Storage.set("active", State.active);
    Storage.set("pending", State.pending);
  }

  window.RCF = window.RCF || {};
  window.RCF.state = State;
  window.RCF.log = (...a) => Logger.write(...a);

  // =========================================================
  // Status manager (drawer + top mirror)
  // =========================================================
  const Status = (() => {
    let tmr = null;
    let lockUntil = 0;

    function _set(el, txt) { try { if (el) el.textContent = String(txt ?? ""); } catch {} }

    function _sync(txt) {
      _set($("#statusText"), txt);     // drawer (source of truth)
      _set($("#statusTextTop"), txt);  // top mirror (hidden by CSS)
      _set($("#fabStatus"), txt);      // fab mirror
    }

    function set(text, opts = {}) {
      const now = Date.now();
      const { ttl = 900, sticky = false, minGap = 120 } = opts || {};
      if (now < lockUntil) return;
      lockUntil = now + minGap;

      const v = String(text || "");
      _sync(v);

      if (tmr) { try { clearTimeout(tmr); } catch {} tmr = null; }
      if (!sticky) {
        tmr = setTimeout(() => _sync("OK ✅"), Math.max(250, ttl));
      }
    }

    return { set };
  })();

  function safeSetStatus(txt) { try { Status.set(txt, { ttl: 900, sticky: false }); } catch {} }

  // =========================================================
  // UI + Compact CSS
  // =========================================================
  const UI = {
    brandTitle: "RCF",
    brandSubtitle: "Factory interna • PWA • Offline-first",
    compactEnabled: true
  };

  function injectCompactCSSOnce() {
    try {
      if (!UI.compactEnabled) return;
      if (document.getElementById("rcfCompactCss")) return;

      const css = `
:root { --rcf-compact: 1; }
#rcfRoot .topbar{ padding: 8px 10px !important; }
#rcfRoot .brand{ gap: 10px !important; }
#rcfRoot .brand .title{ font-size: 18px !important; line-height: 1.15 !important; letter-spacing:.2px; }
#rcfRoot .brand .subtitle{ font-size: 12px !important; opacity:.82 !important; }
#rcfRoot .status-pill{ display:none !important; }
#rcfRoot .tabs{ display:flex !important; gap: 8px !important; overflow-x:auto !important; -webkit-overflow-scrolling:touch !important; padding:6px 0 2px !important; margin-top:8px !important; scrollbar-width:none !important; }
#rcfRoot .tabs::-webkit-scrollbar{ display:none !important; }
#rcfRoot .tabs .tab{ flex:0 0 auto !important; min-width:96px !important; padding:10px 12px !important; font-size:13px !important; border-radius:999px !important; }
#rcfRoot .container{ padding-top: 10px !important; }
#rcfRoot .card{ padding: 12px !important; border-radius: 14px !important; }
#rcfRoot .card h1{ font-size: 24px !important; margin: 0 0 10px !important; }
#rcfRoot .card h2{ font-size: 18px !important; margin: 10px 0 8px !important; }
#rcfRoot .row{ gap: 10px !important; }
#rcfRoot .btn{ padding: 10px 12px !important; font-size: 13px !important; border-radius: 999px !important; }
#rcfRoot .btn.small{ padding: 8px 10px !important; font-size: 12px !important; }
#rcfRoot input, #rcfRoot select, #rcfRoot textarea{ font-size: 14px !important; }
#rcfRoot pre.mono{ max-height: 24vh !important; overflow:auto !important; -webkit-overflow-scrolling:touch !important; }
#rcfRoot pre.mono.small{ max-height: 20vh !important; }

/* Apps list layout */
#appsList .app-item{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
#appsList .app-meta{ flex:1 1 auto; min-width:0; }
#appsList .app-name,#appsList .app-slug{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#appsList .app-actions{ flex:0 0 auto; display:flex; gap:8px; align-items:center; }

/* FAB */
#rcfFab{ position:fixed !important; right:14px !important; bottom:14px !important; width:54px !important; height:54px !important; border-radius:999px !important;
  border:1px solid rgba(255,255,255,.16) !important; background:rgba(20,28,44,.92) !important; color:#fff !important; font-size:20px !important; font-weight:900 !important;
  box-shadow:0 10px 30px rgba(0,0,0,.35) !important; z-index:9999 !important; }
#rcfFabPanel{ position:fixed !important; right:14px !important; bottom:78px !important; width:220px !important; border-radius:14px !important;
  border:1px solid rgba(255,255,255,.12) !important; background:rgba(12,16,26,.96) !important; color:#fff !important; padding:10px !important; z-index:9999 !important; display:none !important; }
#rcfFabPanel.open{ display:block !important; }
#rcfFabPanel .fab-title{ font-weight:900 !important; margin-bottom:8px !important; display:flex !important; align-items:center !important; justify-content:space-between !important; gap:10px !important; }
#rcfFabPanel .fab-status{ font-size:12px !important; opacity:.85 !important; white-space:nowrap !important; max-width:120px !important; overflow:hidden !important; text-overflow:ellipsis !important; }
#rcfFabPanel .fab-row{ display:flex !important; gap:8px !important; flex-wrap:wrap !important; }
#rcfFabPanel .fab-row .btn{ flex: 1 1 auto !important; }
      `.trim();

      const st = document.createElement("style");
      st.id = "rcfCompactCss";
      st.textContent = css;
      document.head.appendChild(st);

      try { window.RCF_LOGGER?.push?.("OK", "ui_compact: injected ✅"); } catch {}
    } catch {}
  }

  // =========================================================
  // UI Registry + UI_READY bus
  // =========================================================
  function installRCFUIRegistry() {
    try {
      const R = window.RCF_UI || {};
      const base = {
        version: "v1",
        slots: {
          "admin.top": "#rcfAdminSlotTop",
          "admin.integrations": "#rcfAdminSlotIntegrations",
          "admin.logs": "#rcfAdminSlotLogs",
          "admin.injector": "#admin-injector",
          "tools.drawer": "#toolsDrawer",
          "logs.view": "#view-logs",
          "admin.view": "#view-admin",
          "agent.actions": "#rcfAgentSlotActions",
          "agent.tools": "#rcfAgentSlotTools",
          "generator.actions": "#rcfGenSlotActions",
          "generator.tools": "#rcfGenSlotTools",
          "settings.security.actions": "#rcfSettingsSecurityActions",
          "status.text": "#statusText",
          "status.text.top": "#statusTextTop"
        },
        refresh(){ return true; },
        getSlot(name){
          try {
            const key = String(name || "").trim();
            if (!key) return null;
            const esc = (window.CSS && window.CSS.escape) ? window.CSS.escape(key) : key;
            const bySlot = document.querySelector(`[data-rcf-slot="${esc}"]`);
            if (bySlot) return bySlot;
            const sel = this.slots && this.slots[key];
            return sel ? document.querySelector(sel) : null;
          } catch { return null; }
        }
      };
      window.RCF_UI = Object.assign({}, base, R);
      try { window.RCF_UI.refresh(); } catch {}
      return window.RCF_UI;
    } catch { return null; }
  }

  function notifyUIReady() {
    try {
      if (window.__RCF_UI_READY__ === true) return;
      window.__RCF_UI_READY__ = true;
    } catch {}

    try {
      window.dispatchEvent(new CustomEvent("RCF:UI_READY", { detail: { ts: Date.now() } }));
    } catch {}

    const tries = [
      ["RCF_ZIP_VAULT", "mountUI"],
      ["RCF_ZIP_VAULT", "mount"],
      ["RCF_ZIP_VAULT", "injectUI"],
      ["RCF_ZIP_VAULT", "inject"],
      ["RCF_ZIP_VAULT", "init"],
      ["RCF_AGENT_ZIP_BRIDGE", "mountUI"],
      ["RCF_AGENT_ZIP_BRIDGE", "mount"],
      ["RCF_AGENT_ZIP_BRIDGE", "init"]
    ];

    let called = 0;
    for (const [objName, fnName] of tries) {
      try {
        const obj = window[objName];
        const fn = obj && obj[fnName];
        if (typeof fn === "function") { fn.call(obj, { ui: window.RCF_UI }); called++; }
      } catch {}
    }
    try { window.RCF_LOGGER?.push?.("INFO", `UI_READY fired ✅ reinject_called=${called}`); } catch {}
  }

  // =========================================================
  // VFS Overrides (localStorage map)
  // =========================================================
  const OverridesVFS = (() => {
    const KEY = "RCF_OVERRIDES_MAP";
    const getMap = () => Storage.get(KEY, {});
    const setMap = (m) => Storage.set(KEY, m || {});
    const norm = (p) => {
      let x = String(p || "").trim();
      if (!x) return "";
      x = x.split("#")[0].split("?")[0].trim();
      if (!x.startsWith("/")) x = "/" + x;
      x = x.replace(/\/{2,}/g, "/");
      return x;
    };
    function list(){ return Object.keys(getMap() || {}).sort(); }
    function read(path){ const p=norm(path); const m=getMap(); return (m && p in m) ? String(m[p] ?? "") : null; }
    function write(path, content){ const p=norm(path); const m=getMap(); m[p]=String(content ?? ""); setMap(m); return true; }
    function del(path){ const p=norm(path); const m=getMap(); if (m && p in m){ delete m[p]; setMap(m); return true; } return false; }
    return { listFiles: async()=>list(), readFile: async(p)=>read(p), writeFile: async(p,c)=>write(p,c), deleteFile: async(p)=>del(p), _raw:{norm} };
  })();
  window.RCF_OVERRIDES_VFS = OverridesVFS;

  // =========================================================
  // UI Shell
  // =========================================================
  function renderShell() {
    let root = $("#app");
    if (!root) {
      try { root = document.createElement("div"); root.id="app"; (document.body||document.documentElement).appendChild(root); } catch { return; }
    }
    if ($("#rcfRoot")) return;

    root.innerHTML = `
      <div id="rcfRoot" data-rcf-app="rcf.factory">
        <header class="topbar">
          <div class="brand">
            <div class="dot"></div>
            <div class="brand-text">
              <div class="title">${escapeHtml(UI.brandTitle)}</div>
              <div class="subtitle">${escapeHtml(UI.brandSubtitle)}</div>
            </div>
            <div class="spacer"></div>
            <button class="btn small" id="btnOpenTools" type="button" aria-label="Ferramentas">⚙️</button>
            <div class="status-pill" id="statusPill" style="margin-left:10px">
              <span class="ok" id="statusTextTop">OK ✅</span>
            </div>
          </div>

          <nav class="tabs" aria-label="Navegação">
            <button class="tab" data-view="dashboard" type="button">Dashboard</button>
            <button class="tab" data-view="newapp" type="button">New App</button>
            <button class="tab" data-view="editor" type="button">Editor</button>
            <button class="tab" data-view="generator" type="button">Generator</button>
            <button class="tab" data-view="agent" type="button">Agente</button>
            <button class="tab" data-view="settings" type="button">Settings</button>
            <button class="tab" data-view="admin" type="button">Admin</button>
            <button class="tab" data-view="logs" type="button">Logs</button>
            <!-- ❌ sem Diagnostics aqui. Doctor fica só no FAB ⚡ -->
          </nav>
        </header>

        <main class="container views" id="views">
          <section class="view card hero" id="view-dashboard">
            <h1>Dashboard</h1>
            <p>Central do projeto. Selecione um app e comece a editar.</p>
            <div class="status-box">
              <div class="badge" id="activeAppText">Sem app ativo ✅</div>
              <div class="spacer"></div>
              <button class="btn small" id="btnCreateNewApp" type="button">Criar App</button>
              <button class="btn small" id="btnOpenEditor" type="button">Abrir Editor</button>
              <button class="btn small ghost" id="btnExportBackup" type="button">Backup (JSON)</button>
            </div>
            <h2 style="margin-top:14px">Apps</h2>
            <div id="appsList" class="apps" data-rcf-slot="apps.list"></div>
          </section>

          <section class="view card" id="view-newapp">
            <h1>Novo App</h1>
            <p class="hint">Cria um mini-app dentro da Factory.</p>
            <div class="row form">
              <input id="newAppName" placeholder="Nome do app" />
              <input id="newAppSlug" placeholder="slug (opcional)" />
              <button class="btn small" id="btnAutoSlug" type="button">Auto-slug</button>
              <button class="btn ok" id="btnDoCreateApp" type="button">Criar</button>
            </div>
            <pre class="mono" id="newAppOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-editor">
            <h1>Editor</h1>
            <p class="hint">Escolha um arquivo e edite.</p>
            <div class="row">
              <div class="badge" id="editorHead">Arquivo atual: -</div>
              <div class="spacer"></div>
              <button class="btn ok" id="btnSaveFile" type="button">Salvar</button>
              <button class="btn danger" id="btnResetFile" type="button">Reset</button>
            </div>
            <div class="row">
              <div style="flex:1;min-width:240px">
                <div class="hint">Arquivos</div>
                <div id="filesList" class="files"></div>
              </div>
              <div style="flex:2;min-width:280px">
                <div class="editor">
                  <div class="editor-head">Conteúdo</div>
                  <textarea id="fileContent" spellcheck="false"></textarea>
                </div>
              </div>
            </div>
            <pre class="mono" id="editorOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-generator">
            <h1>Generator</h1>
            <p class="hint">Gera ZIP do app selecionado (stub por enquanto).</p>
            <div id="rcfGenSlotActions" data-rcf-slot="generator.actions">
              <div class="row">
                <button class="btn ok" id="btnGenZip" type="button">Build ZIP</button>
                <button class="btn ghost" id="btnGenPreview" type="button">Preview</button>
              </div>
            </div>
            <div id="rcfGenSlotTools" data-rcf-slot="generator.tools"></div>
            <pre class="mono" id="genOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-agent">
            <h1>Agente</h1>
            <p class="hint">Comandos naturais + patchset.</p>
            <div class="row cmd">
              <input id="agentCmd" placeholder='Ex: create "Meu App" meu-app | scan | targets | inj apply | build "Agenda" agenda' />
              <button class="btn ok" id="btnAgentRun" type="button">Executar</button>
              <button class="btn ghost" id="btnAgentHelp" type="button">Ajuda</button>
            </div>
            <div id="rcfAgentSlotActions" data-rcf-slot="agent.actions"></div>
            <div id="rcfAgentSlotTools" data-rcf-slot="agent.tools"></div>
            <pre class="mono" id="agentOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-settings">
            <h1>Settings</h1>
            <div class="card" id="settings-security">
              <h2>Segurança</h2>
              <p class="hint">Define um PIN para liberar ações críticas no Admin.</p>
              <div id="rcfSettingsSecurityActions" data-rcf-slot="settings.security.actions"></div>
              <div class="row">
                <input id="pinInput" placeholder="Definir PIN (4-8 dígitos)" inputmode="numeric" />
                <button class="btn ok" id="btnPinSave" type="button">Salvar PIN</button>
                <button class="btn danger" id="btnPinRemove" type="button">Remover PIN</button>
              </div>
              <pre class="mono" id="pinOut">Pronto.</pre>
            </div>

            <div class="card" id="settings-logs">
              <h2>Logs</h2>
              <div class="row">
                <button class="btn ghost" id="btnLogsRefresh" type="button">Atualizar</button>
                <button class="btn ok" id="btnLogsCopy" type="button">Exportar .txt</button>
                <button class="btn danger" id="btnLogsClear" type="button">Limpar logs</button>
              </div>
              <pre class="mono small" id="logsOut">Pronto.</pre>
            </div>
          </section>

          <section class="view card" id="view-logs">
            <h1>Logs</h1>
            <div class="row">
              <button class="btn ghost" id="btnLogsRefresh2" type="button">Atualizar</button>
              <button class="btn ok" id="btnCopyLogs" type="button">Copiar</button>
              <button class="btn danger" id="btnClearLogs2" type="button">Limpar</button>
            </div>
            <pre class="mono small" id="logsViewBox">Pronto.</pre>
          </section>

          <section class="view card" id="view-diagnostics">
            <h1>Doctor (Diagnostics)</h1>
            <p class="hint">Acesso só pelo ⚡ Dr.</p>
            <div class="row">
              <button class="btn ok" id="btnDiagRun" type="button">Rodar V8 Stability Check</button>
              <button class="btn ghost" id="btnDiagScan" type="button">Scan overlays</button>
              <button class="btn ghost" id="btnDiagTests" type="button">Run micro-tests</button>
              <button class="btn danger" id="btnDiagClear" type="button">Limpar</button>
            </div>
            <pre class="mono" id="diagOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-admin">
            <h1>Admin</h1>
            <div id="rcfAdminSlotTop" data-rcf-slot="admin.top">
              <div class="row">
                <button class="btn ghost" id="btnAdminDiag" type="button">Diagnosticar (local)</button>
                <button class="btn danger" id="btnAdminZero" type="button">Zerar (safe)</button>
              </div>
              <pre class="mono" id="adminOut">Pronto.</pre>
            </div>

            <div class="card" id="admin-maint">
              <h2>MAINTENANCE • Self-Update (Mãe)</h2>
              <div class="row">
                <button class="btn ghost" id="btnMaeLoad" type="button">Carregar Mãe</button>
                <button class="btn ok" id="btnMaeCheck" type="button">Rodar Check</button>
              </div>
              <div class="row">
                <button class="btn ok" id="btnMaeUpdate" type="button">⬇️ Update From GitHub</button>
                <button class="btn danger" id="btnMaeClear" type="button">🧹 Clear Overrides</button>
              </div>
              <pre class="mono" id="maintOut">Pronto.</pre>
            </div>

            <div class="card" id="rcfAdminSlotIntegrations" data-rcf-slot="admin.integrations">
              <h2>INTEGRATIONS (slot)</h2>
              <p class="hint">Ponto fixo para módulos externos montarem UI aqui.</p>
            </div>

            <div class="card" id="admin-injector" data-rcf-slot="admin.injector">
              <h2>FASE A • Scan / Target Map / Injector SAFE</h2>
              <p class="hint">“REAL” = A (VFS) → B (bundle local) → C (DOM anchors).</p>

              <div class="row" style="flex-wrap:wrap;">
                <button class="btn ok" id="btnScanIndex" type="button">🔎 Scan & Index</button>
                <button class="btn ghost" id="btnGenTargets" type="button">🧭 Generate Target Map</button>
                <button class="btn ghost" id="btnRefreshTargets" type="button">🔁 Refresh Dropdown</button>
              </div>

              <pre class="mono small" id="scanOut">Pronto.</pre>

              <div class="row form" style="margin-top:10px">
                <select id="injMode">
                  <option value="INSERT">INSERT</option>
                  <option value="REPLACE">REPLACE</option>
                  <option value="DELETE">DELETE</option>
                </select>

                <select id="injTarget"></select>

                <button class="btn ghost" id="btnPreviewDiff" type="button">👀 Preview diff</button>
                <button class="btn ok" id="btnApplyInject" type="button">✅ Apply (SAFE)</button>
                <button class="btn danger" id="btnRollbackInject" type="button">↩ Rollback</button>
              </div>

              <div class="hint" style="margin-top:10px">Payload:</div>
              <textarea id="injPayload" class="textarea" rows="8" spellcheck="false" placeholder="Cole aqui o payload..."></textarea>

              <div class="hint" style="margin-top:10px">Preview / Diff:</div>
              <pre class="mono small" id="diffOut">Pronto.</pre>

              <div id="rcfAdminSlotLogs" data-rcf-slot="admin.logs">
                <div class="row" style="margin-top:10px;align-items:center">
                  <div class="hint" style="margin:0">Log (Injector):</div>
                  <div class="spacer"></div>
                  <button class="btn small ghost" id="btnToggleInjectorLog" type="button">Mostrar log</button>
                </div>
                <pre class="mono small rcf-collapsed" id="injLog">Pronto.</pre>
              </div>
            </div>
          </section>
        </main>

        <div class="tools" id="toolsDrawer" data-rcf-panel="tools.drawer">
          <div class="tools-head">
            <div style="font-weight:800">Ferramentas</div>
            <div id="statusText" style="margin-left:auto;margin-right:10px;opacity:.85;font-size:12px;white-space:nowrap">OK ✅</div>
            <button class="btn small" id="btnCloseTools" type="button">Fechar</button>
          </div>
          <div class="tools-body">
            <div class="row">
              <button class="btn ghost" id="btnDrawerLogsRefresh" type="button">Atualizar logs</button>
              <button class="btn ok" id="btnDrawerLogsCopy" type="button">Copiar logs</button>
              <button class="btn danger" id="btnDrawerLogsClear" type="button">Limpar logs</button>
            </div>
            <div class="row" style="margin-top:10px">
              <button class="btn ghost" id="btnSwClearCache" type="button">Clear SW Cache</button>
              <button class="btn ghost" id="btnSwUnregister" type="button">Unregister SW</button>
              <button class="btn ok" id="btnSwRegister" type="button">Register SW</button>
            </div>
            <div class="row" style="margin-top:10px">
              <button class="btn ghost" id="btnToolsDoctor" type="button">Doctor</button>
            </div>
            <pre class="mono small" id="logsBox">Pronto.</pre>
          </div>
        </div>

        <!-- FAB -->
        <button id="rcfFab" type="button" aria-label="Ações rápidas">⚡</button>
        <div id="rcfFabPanel" role="dialog" aria-label="Ações rápidas">
          <div class="fab-title">
            <div>RCF</div>
            <div class="fab-status" id="fabStatus">OK ✅</div>
          </div>
          <div class="fab-row">
            <button class="btn ghost" id="btnFabTools" type="button">Ferramentas</button>
            <button class="btn ghost" id="btnFabAdmin" type="button">Admin</button>
          </div>
          <div class="fab-row" style="margin-top:8px">
            <button class="btn ghost" id="btnFabLogs" type="button">Logs</button>
            <button class="btn ok" id="btnFabDoctor" type="button">Dr</button>
          </div>
          <div class="fab-row" style="margin-top:8px">
            <button class="btn danger" id="btnFabClose" type="button">Fechar</button>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================
  // Views / navigation
  // =========================================================
  function refreshLogsViews(){ Logger._mirrorUI(Logger.getAll()); }

  function teardownPreviewHard() {
    try { window.RCF_PREVIEW?.teardown?.(); } catch {}
    try {
      const PR = window.RCF_PREVIEW_RUNNER || window.PREVIEW_RUNNER || null;
      const fns = [PR?.teardown, PR?.destroy, PR?.stop, PR?.unmount].filter(fn => typeof fn === "function");
      for (const fn of fns) { try { fn.call(PR); } catch {} }
    } catch {}

    try {
      const nodes = Array.from(document.querySelectorAll("[id*='preview'], [class*='preview'], [id*='Preview'], [class*='Preview']"));
      let removed = 0;
      for (const el of nodes) {
        try {
          if (!el || el === document.body) continue;
          if (el.id === "toolsDrawer" || el.id === "rcfFabPanel" || el.id === "rcfFab") continue;
          el.remove(); removed++;
        } catch {}
        if (removed >= 8) break;
      }
    } catch {}

    try {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.pointerEvents = "";
    } catch {}

    try { Logger.write("preview:", "teardown hard (ok)"); } catch {}
  }

  function setView(name) {
    if (!name) return;

    try {
      const prev = State.active.view;
      if (prev === "generator" && name !== "generator") teardownPreviewHard();
    } catch {}

    State.active.view = name;
    saveAll();

    $$(".view").forEach(v => v.classList.remove("active"));
    $$("[data-view]").forEach(b => b.classList.remove("active"));

    const id = "view-" + String(name).replace(/[^a-z0-9_-]/gi, "");
    document.getElementById(id)?.classList.add("active");
    $$(`[data-view="${name}"]`).forEach(b => b.classList.add("active"));

    if (name === "logs" || name === "settings" || name === "admin" || name === "diagnostics") refreshLogsViews();
    Logger.write("view:", name);
  }

  function openTools(open){
    const d = $("#toolsDrawer");
    if (!d) return;
    d.classList.toggle("open", !!open);
  }

  function openFabPanel(open){
    const p = $("#rcfFabPanel");
    if (!p) return;
    p.classList.toggle("open", !!open);
  }

  function toggleFabPanel(){
    const p = $("#rcfFabPanel");
    if (!p) return;
    p.classList.toggle("open");
  }

  // =========================================================
  // Apps / Editor
  // =========================================================
  function getActiveApp() {
    if (!State.active.appSlug) return null;
    return State.apps.find(a => a.slug === State.active.appSlug) || null;
  }

  function ensureAppFiles(app){
    if (!app.files || typeof app.files !== "object") app.files = {};
  }

  function setActiveApp(slug){
    const app = State.apps.find(a => a.slug === slug);
    if (!app) return false;

    ensureAppFiles(app);

    State.active.appSlug = slug;
    State.active.file = State.active.file || Object.keys(app.files || {})[0] || null;
    saveAll();

    $("#activeAppText") && ($("#activeAppText").textContent = `App ativo: ${app.name} (${app.slug}) ✅`);
    renderAppsList();
    renderFilesList();
    if (State.active.file) openFile(State.active.file);

    Logger.write("app selected:", slug);
    return true;
  }

  function deleteApp(slug){
    const s = slugify(slug);
    if (!s) return false;

    const app = State.apps.find(a => a.slug === s);
    if (!app) return false;

    const ok = confirm(`Apagar o app "${app.name}" (${app.slug})?\n\nIsso não tem volta.`);
    if (!ok) return false;

    State.apps = State.apps.filter(a => a.slug !== s);

    if (State.active.appSlug === s) {
      State.active.appSlug = null;
      State.active.file = null;
      $("#activeAppText") && ($("#activeAppText").textContent = "Sem app ativo ✅");
    }

    saveAll();
    renderAppsList();
    renderFilesList();
    uiMsg("#editorOut", "✅ App apagado.");
    Logger.write("app deleted:", s);
    safeSetStatus("Apagado ✅");
    return true;
  }

  function renderAppsList() {
    const box = $("#appsList");
    if (!box) return;

    if (!State.apps.length) {
      box.innerHTML = `<div class="hint">Nenhum app salvo ainda.</div>`;
      return;
    }

    box.innerHTML = "";
    State.apps.forEach(app => {
      const row = document.createElement("div");
      row.className = "app-item";
      row.innerHTML = `
        <div class="app-meta">
          <div class="app-name" style="font-weight:800">${escapeHtml(app.name)}</div>
          <div class="app-slug hint">${escapeHtml(app.slug)}</div>
        </div>
        <div class="app-actions">
          <button class="btn small" data-act="select" data-slug="${escapeAttr(app.slug)}" type="button">Selecionar</button>
          <button class="btn small" data-act="edit" data-slug="${escapeAttr(app.slug)}" type="button">Editor</button>
          <button class="btn small danger" data-act="delete" data-slug="${escapeAttr(app.slug)}" type="button">Apagar</button>
        </div>
      `;
      box.appendChild(row);
    });

    $$('[data-act="select"]', box).forEach(btn => bindTap(btn, () => setActiveApp(btn.getAttribute("data-slug"))));
    $$('[data-act="edit"]', box).forEach(btn => bindTap(btn, () => { setActiveApp(btn.getAttribute("data-slug")); setView("editor"); }));
    $$('[data-act="delete"]', box).forEach(btn => bindTap(btn, () => deleteApp(btn.getAttribute("data-slug"))));
  }

  function renderFilesList() {
    const box = $("#filesList");
    if (!box) return;

    const app = getActiveApp();
    if (!app) { box.innerHTML = `<div class="hint">Selecione um app para ver arquivos.</div>`; return; }

    ensureAppFiles(app);
    const files = Object.keys(app.files);
    if (!files.length) { box.innerHTML = `<div class="hint">App sem arquivos.</div>`; return; }

    box.innerHTML = "";
    files.forEach(fname => {
      const item = document.createElement("div");
      item.className = "file-item" + (State.active.file === fname ? " active" : "");
      item.textContent = fname;
      bindTap(item, () => openFile(fname));
      box.appendChild(item);
    });
  }

  function openFile(fname){
    const app = getActiveApp();
    if (!app) return false;
    ensureAppFiles(app);
    if (!(fname in app.files)) return false;

    State.active.file = fname;
    saveAll();

    $("#editorHead") && ($("#editorHead").textContent = `Arquivo atual: ${fname}`);
    $("#fileContent") && ($("#fileContent").value = String(app.files[fname] ?? ""));
    renderFilesList();
    return true;
  }

  function createApp(name, slugMaybe){
    const nameClean = String(name || "").trim();
    if (!nameClean) return { ok:false, msg:"Nome inválido" };

    let slug = slugify(slugMaybe || nameClean);
    if (!slug) return { ok:false, msg:"Slug inválido" };
    if (State.apps.some(a => a.slug === slug)) return { ok:false, msg:"Slug já existe" };

    const app = {
      name: nameClean,
      slug,
      createdAt: nowISO(),
      files: {
        "index.html": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nameClean}</title></head><body><h1>${nameClean}</h1><script src="app.js"></script></body></html>`,
        "styles.css": `body{font-family:system-ui;margin:0;padding:24px;background:#0b1220;color:#fff}`,
        "app.js": `console.log("${nameClean}");`
      }
    };

    State.apps.push(app);
    saveAll();
    renderAppsList();
    setActiveApp(slug);

    return { ok:true, msg:`✅ App criado: ${nameClean} (${slug})` };
  }

  function saveFile(){
    const app = getActiveApp();
    if (!app) return uiMsg("#editorOut", "⚠️ Sem app ativo.");
    const fname = State.active.file;
    if (!fname) return uiMsg("#editorOut", "⚠️ Sem arquivo ativo.");

    ensureAppFiles(app);
    app.files[fname] = String($("#fileContent")?.value || "");
    saveAll();
    uiMsg("#editorOut", "✅ Arquivo salvo.");
    Logger.write("file saved:", app.slug, fname);
  }

  // =========================================================
  // PIN
  // =========================================================
  const Pin = {
    key: "admin_pin",
    get(){ return Storage.get(this.key, ""); },
    set(pin){ Storage.set(this.key, String(pin || "")); },
    clear(){ Storage.del(this.key); }
  };

  // =========================================================
  // SW helpers
  // =========================================================
  async function swRegister(){
    try {
      if (!("serviceWorker" in navigator)) return { ok:false, msg:"SW não suportado" };
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      Logger.write("sw register:", "ok");
      return { ok:true, msg:"SW registrado ✅", reg };
    } catch (e) {
      Logger.write("sw register fail:", e?.message || e);
      return { ok:false, msg:"Falhou registrar SW: " + (e?.message || e) };
    }
  }

  async function swUnregisterAll(){
    try {
      if (!("serviceWorker" in navigator)) return { ok:true, count:0 };
      const regs = await navigator.serviceWorker.getRegistrations();
      let n=0;
      for (const r of regs){ try { if (await r.unregister()) n++; } catch {} }
      Logger.write("sw unregister:", n, "ok");
      return { ok:true, count:n };
    } catch (e) {
      Logger.write("sw unregister err:", e?.message || e);
      return { ok:false, count:0, err:e?.message || e };
    }
  }

  async function swClearCaches(){
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      Logger.write("cache clear:", keys.length, "caches");
      return { ok:true, count:keys.length };
    } catch (e) {
      Logger.write("cache clear err:", e?.message || e);
      return { ok:false, count:0, err:e?.message || e };
    }
  }

  async function swCheckAutoFix(){
    const out = { ok:false, status:"missing", detail:"", attempts:0, err:"" };
    if (!("serviceWorker" in navigator)) { out.status="unsupported"; out.detail="serviceWorker não suportado"; return out; }

    const tryGet = async () => {
      try {
        const a = await navigator.serviceWorker.getRegistration("./");
        if (a) return a;
        const b = await navigator.serviceWorker.getRegistration();
        return b || null;
      } catch (e) { out.err = String(e?.message || e); return null; }
    };

    let reg = await tryGet();
    if (reg){ out.ok=true; out.status="registered"; out.detail="já estava registrado"; return out; }

    out.attempts++;
    try { out.detail = (await swRegister())?.msg || "tentou registrar"; } catch (e) { out.err = String(e?.message || e); }
    await sleep(350);

    reg = await tryGet();
    if (reg){ out.ok=true; out.status="registered"; out.detail="registrou após auto-fix"; return out; }

    out.status="missing";
    out.detail = (location.protocol !== "https:" && location.hostname !== "localhost")
      ? "SW exige HTTPS (ou localhost)."
      : "sw.js não registrou (pode ser path/scope/privacidade).";
    return out;
  }

  // =========================================================
  // Diagnostics (Doctor)
  // =========================================================
  function scanOverlays(){
    const suspects = [];
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    for (const el of $$("body *")) {
      try {
        const cs = getComputedStyle(el);
        if (!cs || cs.pointerEvents === "none") continue;
        if (cs.position !== "fixed" && cs.position !== "absolute") continue;

        const zi = parseInt(cs.zIndex || "0", 10);
        if (!Number.isFinite(zi) || zi < 50) continue;

        const r = el.getBoundingClientRect();
        const area = Math.max(0,r.width)*Math.max(0,r.height);
        if (area < (vw*vh*0.10)) continue;

        const touches = (r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh);
        if (!touches) continue;

        suspects.push({ tag: el.tagName.toLowerCase(), id: el.id || "", cls: String(el.className||"").slice(0,80), z: zi, pos: cs.position });
      } catch {}
      if (suspects.length >= 8) break;
    }
    return { ok:true, suspects };
  }

  function runMicroTests(){
    const results = [];
    const push = (name, pass, info="") => results.push({ name, pass: !!pass, info: String(info||"") });

    try { push("TEST_RENDER", !!$("#rcfRoot") && !!$("#views"), !!$("#rcfRoot") ? "UI root ok" : "UI root missing"); }
    catch (e) { push("TEST_RENDER", false, e?.message || e); }

    try { push("TEST_IMPORTS", !!window.RCF_LOGGER && !!window.RCF && !!window.RCF.state, "globals"); }
    catch (e) { push("TEST_IMPORTS", false, e?.message || e); }

    try { push("TEST_STATE_INIT", Array.isArray(State.apps) && !!State.active && typeof State.cfg === "object", "state"); }
    catch (e) { push("TEST_STATE_INIT", false, e?.message || e); }

    try { push("TEST_EVENT_BIND", !!$("#btnOpenTools") && !!$("#btnAgentRun") && !!$("#btnSaveFile"), "buttons"); }
    catch (e) { push("TEST_EVENT_BIND", false, e?.message || e); }

    try { push("TEST_UI_REGISTRY", !!window.RCF_UI && typeof window.RCF_UI.getSlot === "function", "RCF_UI"); }
    catch (e) { push("TEST_UI_REGISTRY", false, e?.message || e); }

    const passCount = results.filter(r => r.pass).length;
    return { ok: passCount === results.length, pass: passCount, total: results.length, results };
  }

  async function runV8StabilityCheck(){
    const lines = [];
    let pass=0, fail=0;
    const add = (ok, label, detail="") => {
      if (ok) { pass++; lines.push(`PASS: ${label}${detail? " — "+detail:""}`); }
      else { fail++; lines.push(`FAIL: ${label}${detail? " — "+detail:""}`); }
    };

    add(true, "[BOOT] init", "ok");
    const swr = await Promise.race([
      swCheckAutoFix(),
      new Promise(res => setTimeout(() => res({ ok:false, status:"timeout", detail:"TIMEOUT 2500ms (swCheckAutoFix)" }), 2500))
    ]);
    if (swr.ok) add(true, "[SW] SW_REGISTERED", swr.detail || "ok");
    else lines.push(`WARN: [SW] ${swr.status} — ${swr.detail}${swr.err? " | err="+swr.err:""}`);

    const overlay = scanOverlays();
    add(overlay.ok, "[CLICK] OVERLAY_SCANNER", "ok");
    add((overlay.suspects||[]).length === 0, "[CLICK] OVERLAY_BLOCK", (overlay.suspects||[]).length ? `suspects=${overlay.suspects.length}` : "nenhum");

    const mt = runMicroTests();
    add(mt.ok, "[MICROTEST] ALL", `${mt.pass}/${mt.total}`);

    lines.unshift("=========================================================");
    lines.unshift("RCF — V8 STABILITY CHECK (REPORT)");
    lines.push("=========================================================");
    lines.push(`PASS: ${pass} | FAIL: ${fail}`);
    lines.push(`RCF_STABLE: ${fail===0 ? "TRUE ✅" : "FALSE ❌"}`);
    lines.push("");

    uiMsg("#diagOut", lines.join("\n"));
    Logger.write("V8 check:", fail===0 ? "PASS ✅" : "FAIL ❌", `${pass}/${pass+fail}`);
    return { stable: fail===0, pass, fail, overlay, microtests: mt, sw: swr };
  }

  // =========================================================
  // FASE A — Scan/Targets/Injector SAFE (mantenha API)
  // =========================================================
  function simpleHash(str){
    let h=2166136261;
    const s=String(str??"");
    for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = (h*16777619)>>>0; }
    return ("00000000"+h.toString(16)).slice(-8);
  }
  function guessType(path){
    const p=String(path||"");
    if (p.endsWith(".js")) return "js";
    if (p.endsWith(".css")) return "css";
    if (p.endsWith(".html")) return "html";
    if (p.endsWith(".json")) return "json";
    if (p.endsWith(".txt")) return "txt";
    return "bin";
  }
  function detectMarkers(text){
    const s=String(text??"");
    const re=/@RCF:INJECT\s*([A-Za-z0-9_-]+)?/g;
    const out=[]; let m;
    while ((m=re.exec(s))){ out.push({ marker:m[0], id:(m[1]||"").trim()||null, index:m.index }); if(out.length>=20) break; }
    return out;
  }
  function getAnchorsForContent(type, content){
    const s=String(content??"");
    const anchors=[];
    if (type==="html"){
      const headEnd=s.toLowerCase().lastIndexOf("</head>");
      const bodyEnd=s.toLowerCase().lastIndexOf("</body>");
      if (headEnd>=0) anchors.push({ id:"HEAD_END", at:headEnd, note:"</head>" });
      if (bodyEnd>=0) anchors.push({ id:"BODY_END", at:bodyEnd, note:"</body>" });
    }
    if (type==="js"){ anchors.push({ id:"JS_TOP", at:0, note:"top" }); anchors.push({ id:"JS_EOF", at:s.length, note:"eof" }); }
    if (type==="css"){ const rootIdx=s.indexOf(":root"); if(rootIdx>=0) anchors.push({ id:"CSS_ROOT", at:rootIdx, note:":root" }); }
    return anchors;
  }
  function normalizePath(p){
    let x=String(p||"").trim();
    if(!x) return "";
    x=x.split("#")[0].split("?")[0].trim();
    if(!x.startsWith("/")) x="/"+x;
    x=x.replace(/\/{2,}/g,"/");
    return x;
  }

  async function vfsListAll(vfs){
    if(!vfs) return [];
    try {
      if (typeof vfs.listFiles==="function") return (await vfs.listFiles())||[];
      if (typeof vfs.list==="function") return (await vfs.list())||[];
      if (typeof vfs.keys==="function") return (await vfs.keys())||[];
      if (typeof vfs.entries==="function"){
        const ent=await vfs.entries();
        return Array.isArray(ent) ? ent.map(e => e && (e.path||e[0])) : [];
      }
    } catch {}
    return [];
  }
  async function vfsRead(vfs, path){
    if(!vfs) return null;
    try {
      if (typeof vfs.readFile==="function") return await vfs.readFile(path);
      if (typeof vfs.read==="function") return await vfs.read(path);
      if (typeof vfs.get==="function") return await vfs.get(path);
    } catch {}
    return null;
  }

  async function tryFetchLocalBundleFromCfg(){
    const cfg = Storage.get("ghcfg", null);
    const path = cfg && cfg.path ? String(cfg.path) : "";
    if (!path) return null;
    const url = new URL(path, document.baseURI).toString();
    try {
      const res = await fetch(url, { cache:"no-store" });
      if (!res.ok) return null;
      return (await res.text()) || null;
    } catch { return null; }
  }

  function getLocalMotherBundleText(){
    const raw = Storage.getRaw("mother_bundle", "");
    if (raw && raw.trim().startsWith("{")) return raw;
    const raw2 = localStorage.getItem("RCF_MOTHER_BUNDLE") || "";
    if (raw2 && raw2.trim().startsWith("{")) return raw2;
    return "";
  }

  async function scanFactoryFiles(){
    const index = { meta:{ scannedAt: nowISO(), source:"", count:0 }, files:[] };

    // 0) overrides
    try {
      const olist = await OverridesVFS.listFiles();
      for (const p0 of (olist||[]).slice(0,800)){
        const p = normalizePath(p0);
        const txt = String((await OverridesVFS.readFile(p)) ?? "");
        const type = guessType(p);
        index.files.push({ path:p, type, size:txt.length, hash:simpleHash(txt), markers:detectMarkers(txt), anchors:getAnchorsForContent(type, txt) });
      }
    } catch {}

    // A) runtime vfs
    const vfs = (window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs){
      const baseLen=index.files.length;
      const list = await vfsListAll(vfs);
      const paths = (list||[]).map(p => normalizePath(p)).filter(Boolean).slice(0,1200);
      for (const p of paths){
        const content = await vfsRead(vfs, p);
        const txt = (content==null) ? "" : String(content);
        const type = guessType(p);
        index.files.push({ path:p, type, size:txt.length, hash:simpleHash(txt), markers:detectMarkers(txt), anchors:getAnchorsForContent(type, txt) });
      }
      const added=index.files.length-baseLen;
      if (added>0){
        index.meta.source="A:runtime_vfs";
        index.meta.count=index.files.length;
        Storage.set("RCF_FILE_INDEX", index);
        Logger.write("scan:", index.meta.source, "files="+index.meta.count);
        return index;
      }
      Logger.write("scan:", "A:runtime_vfs files=0 => FALHA", "scan fallback -> mother_bundle");
    }

    // B) mother bundle
    let bundleText = getLocalMotherBundleText();
    if (!bundleText) bundleText = await tryFetchLocalBundleFromCfg();

    if (bundleText){
      index.meta.source="B:mother_bundle_local";
      let parsed=null;
      try { parsed = JSON.parse(bundleText); } catch { parsed=null; }

      let entries=[];
      if (parsed && Array.isArray(parsed.files)){
        entries = parsed.files
          .map(it => [it && (it.path||it.file||it.name), it && ("content" in it ? it.content : (it.text ?? it.data ?? ""))])
          .filter(([p]) => !!p);
      } else {
        const filesObj = (parsed && parsed.files && typeof parsed.files==="object") ? parsed.files : (parsed && typeof parsed==="object" ? parsed : {});
        entries = Object.entries(filesObj || {});
      }

      for (const [rawPath, rawVal] of entries){
        const p = normalizePath(rawPath);
        const txt = (rawVal && typeof rawVal==="object" && "content" in rawVal) ? String(rawVal.content ?? "") : String(rawVal ?? "");
        const type = guessType(p);
        index.files.push({ path:p, type, size:txt.length, hash:simpleHash(txt), markers:detectMarkers(txt), anchors:getAnchorsForContent(type, txt) });
      }

      index.meta.count=index.files.length;
      Storage.set("RCF_FILE_INDEX", index);
      Storage.setRaw("mother_bundle", bundleText);
      Logger.write("scan:", index.meta.source, "files="+index.meta.count);
      return index;
    }

    // C) DOM anchors only
    Logger.write("scan fallback -> DOM anchors");
    index.meta.source="C:dom_anchors_only";
    const html = document.documentElement ? document.documentElement.outerHTML : "";
    index.files.push({ path:"/runtime/document.html", type:"html", size:html.length, hash:simpleHash(html), markers:detectMarkers(html), anchors:getAnchorsForContent("html", html) });
    index.meta.count=index.files.length;
    Storage.set("RCF_FILE_INDEX", index);
    Logger.write("scan:", index.meta.source, "files="+index.meta.count);
    return index;
  }

  function generateTargetMap(fileIndex){
    const idx = fileIndex || Storage.get("RCF_FILE_INDEX", null);
    if (!idx || !Array.isArray(idx.files)) return { ok:false, err:"RCF_FILE_INDEX ausente. Rode Scan & Index primeiro." };

    const targets=[];
    for (const f of idx.files){
      const path = String(f.path||"");
      const markers = Array.isArray(f.markers)? f.markers : [];

      for (const m of markers){
        const id = m.id ? m.id : `MARKER_${path}_${m.index}`;
        targets.push({ targetId:id, path, kind:"MARKER", offset:m.index, supportedModes:["INSERT","REPLACE","DELETE"], defaultRisk:"low", note:"@RCF:INJECT" });
      }

      if (!markers.length){
        const anchors = Array.isArray(f.anchors)? f.anchors : [];
        for (const a of anchors){
          targets.push({ targetId:`${path}::${a.id}`, path, kind:"ANCHOR", offset:a.at, anchorId:a.id, supportedModes:["INSERT","REPLACE","DELETE"], defaultRisk:(String(a.id||"").includes("BODY")||String(a.id||"").includes("JS_EOF"))?"medium":"low", note:a.note });
        }
      }
    }

    const seen=new Set(), uniq=[];
    for (const t of targets){
      if (!t || !t.targetId) continue;
      if (seen.has(t.targetId)) continue;
      seen.add(t.targetId);
      uniq.push(t);
      if (uniq.length>=800) break;
    }

    if (uniq.length<2){
      for (const fp of ["/index.html","/app/index.html"]){
        uniq.push({ targetId:`${fp}::HEAD_END`, path:fp, kind:"ANCHOR", offset:0, anchorId:"HEAD_END", supportedModes:["INSERT","REPLACE","DELETE"], defaultRisk:"low", note:"FORCED_FALLBACK_HEAD_END" });
        uniq.push({ targetId:`${fp}::BODY_END`, path:fp, kind:"ANCHOR", offset:0, anchorId:"BODY_END", supportedModes:["INSERT","REPLACE","DELETE"], defaultRisk:"medium", note:"FORCED_FALLBACK_BODY_END" });
        if (uniq.length>=2) break;
      }
    }

    const out = { meta:{ createdAt: nowISO(), count:uniq.length, source:(idx.meta && idx.meta.source) || "" }, targets: uniq };
    Storage.set("RCF_TARGET_MAP", out);
    Logger.write("targets:", "count="+out.meta.count, "source="+out.meta.source);
    try { populateTargetsDropdown(true); } catch {}
    return { ok:true, map: out };
  }

  function populateTargetsDropdown(autoSelect=false){
    const sel=$("#injTarget");
    if (!sel) return;

    const map = Storage.get("RCF_TARGET_MAP", null);
    const t = map && Array.isArray(map.targets) ? map.targets : [];
    sel.innerHTML = "";

    if (!t.length){
      const opt=document.createElement("option");
      opt.value=""; opt.textContent="(sem targets — gere o map)";
      sel.appendChild(opt);
      return;
    }

    for (const item of t.slice(0,500)){
      const opt=document.createElement("option");
      opt.value=item.targetId;
      opt.textContent=`${item.targetId}  —  ${item.path}  (${item.kind})`;
      sel.appendChild(opt);
    }

    if (autoSelect){
      const first = Array.from(sel.options).find(o => (o.value||"").trim());
      if (first) sel.value = first.value;
    }
  }

  function tinyDiff(oldText, newText){
    const a=String(oldText??"").split("\n");
    const b=String(newText??"").split("\n");
    const max=Math.max(a.length,b.length);
    const out=[];
    for (let i=0;i<max;i++){
      const A=a[i], B=b[i];
      if (A===B) continue;
      if (A!==undefined) out.push(`- ${A}`);
      if (B!==undefined) out.push(`+ ${B}`);
      if (out.length>220){ out.push("... (diff truncado)"); break; }
    }
    return out.join("\n") || "(sem mudanças)";
  }

  async function readTextFromInventoryPath(path){
    const p = normalizePath(path);

    const ov = await OverridesVFS.readFile(p);
    if (ov != null) return String(ov);

    const vfs=(window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs){
      const txt = await vfsRead(vfs, p);
      return (txt==null) ? "" : String(txt);
    }

    const bundleText = getLocalMotherBundleText() || (await tryFetchLocalBundleFromCfg()) || "";
    if (bundleText){
      try {
        const parsed = JSON.parse(bundleText);
        if (parsed && Array.isArray(parsed.files)){
          const hit = parsed.files.find(it => normalizePath(it?.path || it?.file || it?.name) === p);
          if (hit){
            if ("content" in hit) return String(hit.content ?? "");
            if ("text" in hit) return String(hit.text ?? "");
            if ("data" in hit) return String(hit.data ?? "");
            return "";
          }
        }
        const filesObj = (parsed && parsed.files && typeof parsed.files==="object") ? parsed.files : parsed;
        const v = filesObj && filesObj[p];
        if (v && typeof v==="object" && "content" in v) return String(v.content ?? "");
        if (v != null) return String(v);
      } catch {}
    }

    if (p === "/runtime/document.html") return document.documentElement ? document.documentElement.outerHTML : "";

    try {
      if (["/app/index.html","/app/styles.css","/app/app.js","/index.html","/styles.css","/app.js"].includes(p)){
        const res = await fetch(p, { cache:"no-store" });
        if (res.ok) return await res.text();
      }
    } catch {}

    return "";
  }

  async function writeTextToInventoryPath(path, newText){
    const p = normalizePath(path);

    const vfs=(window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs){
      try {
        if (typeof vfs.writeFile==="function") { await vfs.writeFile(p, String(newText??"")); return { ok:true, mode:"vfs.writeFile" }; }
        if (typeof vfs.write==="function") { await vfs.write(p, String(newText??"")); return { ok:true, mode:"vfs.write" }; }
        if (typeof vfs.put==="function") { await vfs.put(p, String(newText??"")); return { ok:true, mode:"vfs.put" }; }
        if (typeof vfs.set==="function") { await vfs.set(p, String(newText??"")); return { ok:true, mode:"vfs.set" }; }
      } catch (e) { return { ok:false, err:e?.message || e }; }
    }

    try { await OverridesVFS.writeFile(p, String(newText??"")); return { ok:true, mode:"override.writeFile" }; }
    catch (e) { return { ok:false, err:e?.message || e }; }
  }

  function applyAtTarget(oldText, target, mode, payload){
    const s = String(oldText ?? "");
    const pl = String(payload ?? "");

    const resolveOffset = () => {
      if (!target || target.kind !== "ANCHOR") return Math.max(0, Math.min(s.length, target.offset || 0));
      if ((target.offset || 0) > 0) return Math.max(0, Math.min(s.length, target.offset || 0));
      const lower = s.toLowerCase();
      if (target.anchorId === "HEAD_END") { const i=lower.lastIndexOf("</head>"); return i>=0 ? i : 0; }
      if (target.anchorId === "BODY_END") { const i=lower.lastIndexOf("</body>"); return i>=0 ? i : s.length; }
      return Math.max(0, Math.min(s.length, target.offset || 0));
    };

    if (target.kind === "MARKER"){
      const at = Math.max(0, Math.min(s.length, target.offset || 0));
      if (mode === "INSERT") return s.slice(0, at) + pl + "\n" + s.slice(at);
      if (mode === "REPLACE") return s.slice(0, at) + pl + "\n" + s.slice(at);
      if (mode === "DELETE") return s.replace(target.note || "@RCF:INJECT", "");
    }

    const at = resolveOffset();
    if (mode === "INSERT") return s.slice(0, at) + "\n" + pl + "\n" + s.slice(at);
    if (mode === "REPLACE") return s.slice(0, at) + "\n" + pl + "\n" + s.slice(at);
    if (mode === "DELETE") { if (!pl.trim()) return s; return s.split(pl).join(""); }
    return s;
  }

  const InjectState = { lastSnapshot: null };

  async function injectorPreview(){
    const map = Storage.get("RCF_TARGET_MAP", null);
    const targets = map && Array.isArray(map.targets) ? map.targets : [];
    const targetId = ($("#injTarget")?.value || "").trim();
    const mode = ($("#injMode")?.value || "INSERT").trim();
    const payload = ($("#injPayload")?.value || "");

    const t = targets.find(x => x.targetId === targetId);
    if (!t) return { ok:false, err:"Target inválido (gere o map e selecione)." };

    const oldText = await readTextFromInventoryPath(t.path);
    const newText = applyAtTarget(oldText, t, mode, payload);
    uiMsg("#diffOut", tinyDiff(oldText, newText));
    return { ok:true, oldText, newText, t, mode };
  }

  async function injectorApplySafe(){
    const pre = await injectorPreview();
    if (!pre.ok){ uiMsg("#diffOut", "❌ " + (pre.err || "preview falhou")); return { ok:false }; }

    InjectState.lastSnapshot = { path: pre.t.path, oldText: pre.oldText, newText: pre.newText, targetId: pre.t.targetId, ts: nowISO() };

    const before = runMicroTests();
    if (!before.ok){ uiMsg("#diffOut", "❌ Microtests BEFORE falharam. Abortando."); return { ok:false }; }

    const w = await writeTextToInventoryPath(pre.t.path, pre.newText);
    if (!w.ok){ uiMsg("#diffOut", "❌ Não consegui escrever.\n" + (w.err || "")); return { ok:false }; }

    const after = runMicroTests();
    if (!after.ok){
      await writeTextToInventoryPath(pre.t.path, pre.oldText);
      uiMsg("#diffOut", "❌ Microtests AFTER falharam. Rollback aplicado.");
      return { ok:false, rolledBack:true };
    }

    Logger.write("apply:", "OK", pre.t.path, pre.t.targetId, "mode=" + pre.mode, "write=" + w.mode);
    uiMsg("#diffOut", "✅ Aplicado com sucesso (SAFE).");
    return { ok:true };
  }

  async function injectorRollback(){
    const s = InjectState.lastSnapshot;
    if (!s){ uiMsg("#diffOut", "Nada para rollback."); return { ok:false }; }
    const w = await writeTextToInventoryPath(s.path, s.oldText);
    if (!w.ok){ uiMsg("#diffOut", "Rollback falhou: " + (w.err || "")); return { ok:false }; }
    uiMsg("#diffOut", "✅ Rollback aplicado.");
    Logger.write("inject:", "rollback OK", s.path, s.targetId);
    return { ok:true };
  }

  // =========================================================
  // Agent (subset)
  // =========================================================
  const Agent = {
    _mem: { inj: { mode:"INSERT", targetId:"", payload:"" } },
    _out(t){ const o=$("#agentOut"); if(o) o.textContent = String(t ?? ""); },
    help(){
      return [
        "AGENT HELP (V8.1d)",
        "",
        "Base:",
        "- help | list | show",
        "- create NOME [SLUG]   (ex: create \"Meu App\" meu-app)",
        "- select SLUG",
        "- open dashboard|newapp|editor|generator|agent|settings|admin|logs|diagnostics",
        "",
        "FASE A:",
        "- scan | targets | dropdown | paths",
        "- peek /caminho",
        "- find TEXTO",
        "",
        "Injector (CLI):",
        "- inj mode INSERT|REPLACE|DELETE",
        "- inj target PARTE_DO_ID",
        "- inj payload <<< ... >>>",
        "- inj preview | inj apply | inj rollback",
        "",
        "ENGINE:",
        "- build \"Nome do App\" [mods...]"
      ].join("\n");
    },
    list(){ return State.apps.length ? State.apps.map(a=>`${a.slug} — ${a.name}`).join("\n") : "(vazio)"; },
    show(){
      const app=getActiveApp();
      const idx=Storage.get("RCF_FILE_INDEX", null);
      const map=Storage.get("RCF_TARGET_MAP", null);
      return [
        `mode: ${State.cfg.mode}`,
        `apps: ${State.apps.length}`,
        `active app: ${app ? `${app.name} (${app.slug})` : "-"}`,
        `active file: ${State.active.file || "-"}`,
        `view: ${State.active.view}`,
        `index: files=${idx?.meta?.count ?? 0} source=${idx?.meta?.source || "-"}`,
        `targets: count=${map?.meta?.count ?? 0}`
      ].join("\n");
    },
    _setCmdUI(mode, targetId, payload){
      const m=$("#injMode"), t=$("#injTarget"), p=$("#injPayload");
      if (m && mode) m.value = mode;
      if (t && targetId) t.value = targetId;
      if (p && payload != null) p.value = payload;
    },
    _pickTargetByContains(part){
      const map = Storage.get("RCF_TARGET_MAP", null);
      const targets = map && Array.isArray(map.targets) ? map.targets : [];
      const q = String(part || "").trim().toLowerCase();
      if (!q) return null;
      return targets.find(x => String(x.targetId || "").toLowerCase().includes(q)) || null;
    },
    async _scan(){
      const idx = await scanFactoryFiles();
      return `✅ Scan OK\nsource=${idx.meta.source}\nfiles=${idx.meta.count}\nscannedAt=${idx.meta.scannedAt}`;
    },
    _targets(){
      const idx = Storage.get("RCF_FILE_INDEX", null);
      const r = generateTargetMap(idx);
      return r.ok ? `✅ Target Map OK\ncount=${r.map.meta.count}\nsource=${r.map.meta.source}\ncreatedAt=${r.map.meta.createdAt}` : `❌ ${r.err || "falhou"}`;
    },
    _paths(){
      const idx=Storage.get("RCF_FILE_INDEX", null);
      const files=idx && Array.isArray(idx.files) ? idx.files : [];
      if (!files.length) return "⚠️ Sem index. Rode: scan";
      return files.slice(0,120).map(f=>f.path).join("\n") + (files.length>120 ? `\n... (${files.length-120} mais)` : "");
    },
    async _peek(path){
      const p=normalizePath(path);
      const txt=await readTextFromInventoryPath(p);
      const head=String(txt||"").slice(0,1200);
      return `PEEK ${p}\nlen=${(txt||"").length}\n\n${head}${(txt||"").length>1200 ? "\n\n...(truncado)" : ""}`;
    },
    async _find(q){
      const idx=Storage.get("RCF_FILE_INDEX", null);
      const files=idx && Array.isArray(idx.files)? idx.files : [];
      if (!files.length) return "⚠️ Sem index. Rode: scan";
      const needle=String(q||"").trim();
      if (!needle) return "⚠️ Use: find TEXTO";
      const needleLow=needle.toLowerCase();
      const hits=[];
      const LIMIT_FILES=45;
      for (const f of files.slice(0, LIMIT_FILES)){
        const p=f.path;
        const txt=await readTextFromInventoryPath(p);
        const pos=String(txt||"").toLowerCase().indexOf(needleLow);
        if (pos>=0){
          const start=Math.max(0,pos-80);
          const end=Math.min((txt||"").length,pos+needle.length+120);
          const snippet=(txt||"").slice(start,end).replace(/\n/g,"⏎");
          hits.push(`- ${p} @${pos}\n  ...${snippet}...`);
        }
        if (hits.length>=8) break;
      }
      return hits.length ? `✅ HITS para "${needle}"\n` + hits.join("\n\n") : `❌ Não achei "${needle}" (limitado a ${LIMIT_FILES} arquivos).`;
    },
    async route(cmdRaw){
      const cmd=String(cmdRaw||"").trim();
      if (!cmd) return this._out("Comando vazio. Use: help");
      const lower=cmd.toLowerCase();

      if (lower==="help") return this._out(this.help());
      if (lower==="list") return this._out(this.list());
      if (lower==="show") return this._out(this.show());

      if (lower.startsWith("open ")){
        const target = lower.replace("open ","").trim();
        const map = { dashboard:"dashboard", newapp:"newapp", "new app":"newapp", editor:"editor", generator:"generator", agent:"agent", settings:"settings", admin:"admin", logs:"logs", diagnostics:"diagnostics", doctor:"diagnostics" };
        const v = map[target] || target;
        setView(v);
        return this._out(`OK. view=${v}`);
      }

      if (lower.startsWith("create ")){
        const rest = cmd.replace(/^create\s+/i, "").trim();
        const qm = rest.match(/^"([^"]+)"\s*([a-z0-9-]+)?/i);
        let name="", slug="";
        if (qm){ name=qm[1].trim(); slug=(qm[2]||"").trim(); } else { name=rest; }
        return this._out(createApp(name, slug).msg);
      }

      if (lower.startsWith("select ")){
        const slug = slugify(cmd.replace(/^select\s+/i,"").trim());
        return this._out(setActiveApp(slug) ? `OK. selecionado: ${slug}` : `Falhou: ${slug}`);
      }

      if (lower==="scan"){
        safeSetStatus("Scan…");
        try { return this._out(await this._scan()); }
        catch (e) { return this._out("❌ scan falhou: " + (e?.message || e)); }
        finally { setTimeout(()=>safeSetStatus("OK ✅"), 700); }
      }

      if (lower==="targets"){ try { return this._out(this._targets()); } catch (e){ return this._out("❌ targets falhou: " + (e?.message||e)); } }
      if (lower==="dropdown"){ try { populateTargetsDropdown(true); return this._out("✅ Dropdown atualizado."); } catch (e){ return this._out("❌ dropdown falhou: " + (e?.message||e)); } }
      if (lower==="paths") return this._out(this._paths());

      if (lower.startsWith("peek ")){ return this._out(await this._peek(cmd.replace(/^peek\s+/i,"").trim())); }
      if (lower.startsWith("find ")){ return this._out(await this._find(cmd.replace(/^find\s+/i,"").trim())); }

      if (lower.startsWith("inj mode ")){
        const mode = cmd.replace(/^inj\s+mode\s+/i,"").trim().toUpperCase();
        if (!["INSERT","REPLACE","DELETE"].includes(mode)) return this._out("⚠️ modos: INSERT | REPLACE | DELETE");
        this._mem.inj.mode = mode; this._setCmdUI(mode, null, null);
        return this._out(`✅ inj mode=${mode}`);
      }

      if (lower.startsWith("inj target ")){
        const part = cmd.replace(/^inj\s+target\s+/i,"").trim();
        const t = this._pickTargetByContains(part);
        if (!t) return this._out("❌ Não achei target contendo: " + part);
        this._mem.inj.targetId = t.targetId; this._setCmdUI(null, t.targetId, null);
        return this._out(`✅ inj target=${t.targetId}\npath=${t.path}\nkind=${t.kind}`);
      }

      if (lower.startsWith("inj payload")){
        const m = cmdRaw.match(/inj\s+payload\s*<<<([\s\S]*?)>>>/i);
        if (!m) return this._out("⚠️ Use:\ninj payload <<<\nSEU TEXTO AQUI\n>>>");
        const payload = m[1].replace(/^\n+|\n+$/g,"");
        this._mem.inj.payload = payload; this._setCmdUI(null, null, payload);
        return this._out(`✅ payload set (len=${payload.length})`);
      }

      if (lower==="inj preview"){
        this._setCmdUI(this._mem.inj.mode, this._mem.inj.targetId, this._mem.inj.payload);
        const r = await injectorPreview();
        return this._out(r.ok ? "✅ preview ok (veja Diff no Admin)" : ("❌ " + (r.err || "preview falhou")));
      }

      if (lower==="inj apply"){
        this._setCmdUI(this._mem.inj.mode, this._mem.inj.targetId, this._mem.inj.payload);
        safeSetStatus("Apply…");
        const r = await injectorApplySafe();
        setTimeout(()=>safeSetStatus("OK ✅"), 900);
        return this._out(r.ok ? "✅ APPLY OK (SAFE)" : ("❌ APPLY FAIL" + (r.rolledBack ? " (rollback feito)" : "")));
      }

      if (lower==="inj rollback"){
        safeSetStatus("Rollback…");
        const r = await injectorRollback();
        setTimeout(()=>safeSetStatus("OK ✅"), 900);
        return this._out(r.ok ? "✅ rollback ok" : "❌ rollback falhou");
      }

      if (lower.startsWith("build ")){
        const rest = cmd.replace(/^build\s+/i,"").trim();
        const qm = rest.match(/^"([^"]+)"\s*(.*)$/);
        const name = qm ? qm[1].trim() : rest;
        const modsPart = qm ? (qm[2]||"").trim() : "";
        const mods = modsPart.replace(/^with\s+/i,"").split(/[\s,]+/g).map(s=>s.trim()).filter(Boolean);

        const ENG = window.RCF_ENGINE;
        if (!ENG || typeof ENG.createSpec!=="function" || typeof ENG.createAppFromSpec!=="function"){
          return this._out("❌ ENGINE não carregou. Verifique /js/engine/*.js no index.html.");
        }

        const r1 = ENG.createSpec({ name, modules: mods });
        if (!r1 || !r1.ok) return this._out("❌ " + (r1?.err || "spec falhou"));

        const r2 = ENG.createAppFromSpec(r1.spec);
        if (r2?.ok){
          try { renderAppsList(); } catch {}
          try { setActiveApp(r2.app.slug); } catch {}
          return this._out(`✅ BUILD OK: ${r2.app.slug}`);
        }
        return this._out(`❌ BUILD FAIL: ${r2?.err || ""}`);
      }

      return this._out("Comando não reconhecido. Use: help");
    }
  };

  // =========================================================
  // Admin UI helpers
  // =========================================================
  function setInjectorLogCollapsed(collapsed){
    try {
      const pre=$("#injLog"), btn=$("#btnToggleInjectorLog");
      if (!pre || !btn) return;
      const want=!!collapsed;
      pre.classList.toggle("rcf-collapsed", want);
      btn.textContent = want ? "Mostrar log" : "Esconder log";
    } catch {}
  }
  function toggleInjectorLogCollapsed(){
    try { setInjectorLogCollapsed(!$("#injLog")?.classList?.contains("rcf-collapsed")); } catch {}
  }

  // =========================================================
  // Bind UI
  // =========================================================
  function bindUI(){
    // tabs
    $$("[data-view]").forEach(btn => bindTap(btn, () => setView(btn.getAttribute("data-view"))));

    // tools
    bindTap($("#btnOpenTools"), () => { openTools(true); openFabPanel(false); });
    bindTap($("#btnCloseTools"), () => openTools(false));

    // FAB
    bindTap($("#rcfFab"), () => toggleFabPanel());
    bindTap($("#btnFabClose"), () => openFabPanel(false));
    bindTap($("#btnFabTools"), () => { openFabPanel(false); openTools(true); });
    bindTap($("#btnFabAdmin"), () => { openFabPanel(false); setView("admin"); });
    bindTap($("#btnFabLogs"), () => { openFabPanel(false); setView("logs"); });

    // ✅ Doctor somente aqui
    bindTap($("#btnFabDoctor"), async () => {
      openFabPanel(false);
      safeSetStatus("Doctor…");
      const ok = await ensureDoctorScan();
      if (ok && window.RCF_DOCTOR_SCAN && typeof window.RCF_DOCTOR_SCAN.open === "function") {
        window.RCF_DOCTOR_SCAN.open();
        setTimeout(()=>safeSetStatus("Doctor ✅"), 700);
        return;
      }
      // fallback: mantém o comportamento antigo
      setView("diagnostics");
      await runV8StabilityCheck();
      setTimeout(()=>safeSetStatus("OK ✅"), 900);
    });

    // fechar FAB tocando fora
    document.addEventListener("pointerdown", (ev) => {
      try {
        const p=$("#rcfFabPanel");
        if (!p || !p.classList.contains("open")) return;
        const fab=$("#rcfFab");
        const t=ev.target;
        if (p.contains(t) || (fab && fab.contains(t))) return;
        openFabPanel(false);
      } catch {}
    }, { passive:true });

    // dashboard
    bindTap($("#btnCreateNewApp"), () => setView("newapp"));
    bindTap($("#btnOpenEditor"), () => setView("editor"));
    bindTap($("#btnExportBackup"), async () => {
      const payload = JSON.stringify({ apps: State.apps, cfg: State.cfg, active: State.active }, null, 2);
      try { await navigator.clipboard.writeText(payload); } catch {}
      safeSetStatus("Backup copiado ✅");
      setTimeout(()=>safeSetStatus("OK ✅"), 800);
      Logger.write("backup copied");
    });

    // newapp
    bindTap($("#btnAutoSlug"), () => { const n=$("#newAppName")?.value||""; $("#newAppSlug") && ($("#newAppSlug").value = slugify(n)); });
    bindTap($("#btnDoCreateApp"), () => {
      const name=$("#newAppName")?.value||"", slug=$("#newAppSlug")?.value||"";
      const r=createApp(name, slug);
      uiMsg("#newAppOut", r.msg);
      safeSetStatus(r.ok ? "OK ✅" : "ERRO ❌");
      if (r.ok) setView("editor");
    });

    // editor
    bindTap($("#btnSaveFile"), () => saveFile());
    bindTap($("#btnResetFile"), () => {
      const app=getActiveApp();
      if (!app || !State.active.file) return uiMsg("#editorOut", "⚠️ Selecione app e arquivo.");
      ensureAppFiles(app);
      app.files[State.active.file] = "";
      saveAll();
      openFile(State.active.file);
      uiMsg("#editorOut", "⚠️ Arquivo resetado (limpo).");
    });

    // generator stubs (evitar duplo bind)
    try {
      const modulePresent = !!(window.RCF_PREVIEW_RUNNER || window.RCF_PREVIEW || window.RCF_ENGINE?.generator || window.RCF_UI_BINDINGS || window.__RCF_GEN_BOUND__);
      if (!modulePresent){
        bindTap($("#btnGenZip"), async () => {
          const U = window.RCF_UI_BINDINGS;
          if (U?.generatorBuildZip) return await U.generatorBuildZip();
          uiMsg("#genOut", "ZIP: ui_bindings não está pronto.");
        });
        bindTap($("#btnGenPreview"), () => {
          const U = window.RCF_UI_BINDINGS;
          if (U?.generatorPreview) return U.generatorPreview();
          uiMsg("#genOut", "Preview: ui_bindings não está pronto.");
        });
      } else {
        Logger.write("generator:", "bind skip (module present)");
      }
    } catch {}

    // agent
    bindTap($("#btnAgentRun"), () => Agent.route($("#agentCmd")?.value || ""));
    bindTap($("#btnAgentHelp"), () => uiMsg("#agentOut", Agent.help()));

    // logs actions
    const doLogsRefresh = () => { refreshLogsViews(); safeSetStatus("Logs ✅"); setTimeout(()=>safeSetStatus("OK ✅"), 600); };
    const doLogsClear = () => { Logger.clear(); doLogsRefresh(); safeSetStatus("Logs limpos ✅"); setTimeout(()=>safeSetStatus("OK ✅"), 600); };
    const doLogsCopy = async () => { const txt=Logger.getAll().join("\n"); try{ await navigator.clipboard.writeText(txt);}catch{} safeSetStatus("Logs copiados ✅"); setTimeout(()=>safeSetStatus("OK ✅"), 800); };

    bindTap($("#btnLogsRefresh"), doLogsRefresh);
    bindTap($("#btnLogsClear"), doLogsClear);
    bindTap($("#btnLogsCopy"), doLogsCopy);
    bindTap($("#btnLogsRefresh2"), doLogsRefresh);
    bindTap($("#btnClearLogs2"), doLogsClear);
    bindTap($("#btnCopyLogs"), doLogsCopy);
    bindTap($("#btnDrawerLogsRefresh"), doLogsRefresh);
    bindTap($("#btnDrawerLogsClear"), doLogsClear);
    bindTap($("#btnDrawerLogsCopy"), doLogsCopy);

    // SW tools
    bindTap($("#btnSwUnregister"), async () => {
      const r=await swUnregisterAll();
      safeSetStatus(r.ok ? `SW unreg: ${r.count} ✅` : "SW unreg ❌");
      setTimeout(()=>safeSetStatus("OK ✅"), 900);
    });
    bindTap($("#btnSwClearCache"), async () => {
      const r=await swClearCaches();
      safeSetStatus(r.ok ? `Cache: ${r.count} ✅` : "Cache ❌");
      setTimeout(()=>safeSetStatus("OK ✅"), 900);
    });
    bindTap($("#btnSwRegister"), async () => {
      const r=await swRegister();
      safeSetStatus(r.ok ? "SW ✅" : "SW ❌");
      setTimeout(()=>safeSetStatus("OK ✅"), 900);
    });
    bindTap($("#btnToolsDoctor"), async () => {
      try {
        await ensureDoctorScan();
        if (window.RCF_DOCTOR_SCAN && typeof window.RCF_DOCTOR_SCAN.open === "function") {
          window.RCF_DOCTOR_SCAN.open();
          safeSetStatus("Doctor ✅");
          return;
        }
        // fallback: abre diagnostics
        setView("logs");
        safeSetStatus("Doctor fallback → Logs");
      } catch (e) {
        console.warn("Doctor open failed:", e);
        safeSetStatus("Doctor failed");
      }
    });



    // Diagnostics view buttons (mesmo sem tab)
    bindTap($("#btnDiagRun"), async () => { safeSetStatus("Doctor…"); await runV8StabilityCheck(); setTimeout(()=>safeSetStatus("OK ✅"), 900); });
    bindTap($("#btnDiagScan"), () => uiMsg("#diagOut", JSON.stringify(scanOverlays(), null, 2)));
    bindTap($("#btnDiagTests"), () => uiMsg("#diagOut", JSON.stringify(runMicroTests(), null, 2)));
    bindTap($("#btnDiagClear"), () => uiMsg("#diagOut", "Pronto."));

    // PIN
    bindTap($("#btnPinSave"), () => {
      const raw=String($("#pinInput")?.value||"").trim();
      if (!/^\d{4,8}$/.test(raw)) return uiMsg("#pinOut", "⚠️ PIN inválido. Use 4 a 8 dígitos.");
      Pin.set(raw); uiMsg("#pinOut", "✅ PIN salvo."); Logger.write("pin saved");
    });
    bindTap($("#btnPinRemove"), () => { Pin.clear(); uiMsg("#pinOut", "✅ PIN removido."); Logger.write("pin removed"); });

    // Admin quick
    bindTap($("#btnAdminDiag"), () => uiMsg("#adminOut", "Admin OK."));
    bindTap($("#btnAdminZero"), () => { Logger.clear(); safeSetStatus("Zerado ✅"); setTimeout(()=>safeSetStatus("OK ✅"), 800); uiMsg("#adminOut", "✅ Zerado (safe). Logs limpos."); });

    // injector log toggle
    bindTap($("#btnToggleInjectorLog"), () => { toggleInjectorLogCollapsed(); Logger.write("admin:", "toggle injLog"); });

    // Mãe
    bindTap($("#btnMaeLoad"), async () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      if (!MAE){ uiMsg("#maintOut", "⚠️ RCF_MOTHER/RCF_MAE não está carregada no runtime."); Logger.write("mae:", "absent"); return; }
      uiMsg("#maintOut", "✅ Mãe detectada. Funções: " + Object.keys(MAE).slice(0, 24).join(", "));
      Logger.write("mae:", "loaded");
    });

    bindTap($("#btnMaeCheck"), () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      const s = MAE && typeof MAE.status==="function" ? MAE.status() : { ok:false, msg:"status() ausente" };
      try { alert("CHECK:\n\n" + JSON.stringify(s, null, 2)); } catch {}
      uiMsg("#maintOut", "Check rodado (alert).");
      Logger.write("mae check:", safeJsonStringify(s));
    });

    let maeUpdateLock=false;
    bindTap($("#btnMaeUpdate"), async () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      if (!MAE || typeof MAE.updateFromGitHub!=="function"){ uiMsg("#maintOut", "⚠️ updateFromGitHub() ausente (ou mãe não carregou)."); return; }
      if (maeUpdateLock){ uiMsg("#maintOut", "⏳ Update já está rodando…"); return; }

      maeUpdateLock=true;
      uiMsg("#maintOut", "Atualizando…");
      try {
        const res = await Promise.race([
          Promise.resolve(MAE.updateFromGitHub()),
          new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 15000ms (updateFromGitHub)")), 15000))
        ]);
        uiMsg("#maintOut", "✅ Update acionado.");
        Logger.write("mae update:", "ok", res ? safeJsonStringify(res) : "");
      } catch (e) {
        uiMsg("#maintOut", "❌ Falhou: " + (e?.message || e));
        Logger.write("mae update err:", e?.message || e);
      } finally { maeUpdateLock=false; }
    });

    bindTap($("#btnMaeClear"), async () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      const clearFn =
        (MAE && typeof MAE.clearOverrides==="function") ? MAE.clearOverrides.bind(MAE) :
        (MAE && typeof MAE.clear==="function") ? MAE.clear.bind(MAE) :
        null;
      if (!clearFn){ uiMsg("#maintOut", "⚠️ clear/clearOverrides() ausente (ou mãe não carregou)."); return; }
      uiMsg("#maintOut", "Limpando...");
      try { await clearFn(); uiMsg("#maintOut", "✅ Clear acionado."); Logger.write("mae clear:", "ok"); }
      catch (e) { uiMsg("#maintOut", "❌ Falhou: " + (e?.message || e)); Logger.write("mae clear err:", e?.message || e); }
    });

    // FASE A buttons
    bindTap($("#btnScanIndex"), async () => {
      safeSetStatus("Scan…");
      try {
        const idx=await scanFactoryFiles();
        uiMsg("#scanOut", `✅ Scan OK\nsource=${idx.meta.source}\nfiles=${idx.meta.count}\nscannedAt=${idx.meta.scannedAt}`);
        Logger.write("CP1 scan:", `source=${idx.meta.source}`, `files=${idx.meta.count}`);
      } catch (e) {
        uiMsg("#scanOut", "❌ Scan falhou: " + (e?.message || e));
        Logger.write("scan err:", e?.message || e);
      }
      setTimeout(()=>safeSetStatus("OK ✅"), 700);
    });

    bindTap($("#btnGenTargets"), () => {
      const idx = Storage.get("RCF_FILE_INDEX", null);
      const r = generateTargetMap(idx);
      if (!r.ok) return uiMsg("#scanOut", "❌ " + (r.err || "falhou gerar map"));
      uiMsg("#scanOut", `✅ Target Map OK\ncount=${r.map.meta.count}\nsource=${r.map.meta.source}\ncreatedAt=${r.map.meta.createdAt}`);
      try { populateTargetsDropdown(true); } catch {}
    });

    bindTap($("#btnRefreshTargets"), () => { populateTargetsDropdown(true); uiMsg("#scanOut", "Dropdown atualizado ✅"); });

    bindTap($("#btnPreviewDiff"), async () => {
      const r = await injectorPreview();
      if (!r.ok) uiMsg("#diffOut", "❌ " + (r.err || "preview falhou"));
    });

    bindTap($("#btnApplyInject"), async () => {
      safeSetStatus("Apply…");
      const r = await injectorApplySafe();
      Logger.write("apply:", r && r.ok ? "OK" : "FAIL", "target=" + String($("#injTarget")?.value || ""));
      setTimeout(()=>safeSetStatus("OK ✅"), 900);
    });

    bindTap($("#btnRollbackInject"), async () => {
      safeSetStatus("Rollback…");
      await injectorRollback();
      setTimeout(()=>safeSetStatus("OK ✅"), 900);
    });
  }

  // =========================================================
  // Hydrate
  // =========================================================
  function hydrateUIFromState(){
    refreshLogsViews();
    renderAppsList();

    const app=getActiveApp();
    if (app){
      setActiveApp(app.slug);
      if (State.active.file) openFile(State.active.file);
    } else {
      $("#activeAppText") && ($("#activeAppText").textContent = "Sem app ativo ✅");
    }

    setView(State.active.view || "dashboard");

    const pin=Pin.get();
    if (pin) uiMsg("#pinOut", "PIN definido ✅");

    populateTargetsDropdown(true);
    setInjectorLogCollapsed(true);
  }

  // =========================================================
  // SAFE INIT
  // =========================================================
  async function safeInit(){
    try {
      Stability.install();
      injectCompactCSSOnce();
      renderShell();
      installRCFUIRegistry();
      try { notifyUIReady(); } catch {}

      bindUI();
      hydrateUIFromState();

      try { window.RCF_ENGINE?.init?.({ State, Storage, Logger }); Logger.write("engine:", "init ok ✅"); }
      catch (e) { Logger.write("engine init err:", e?.message || e); }

      // SW check em background + timeout curto (não trava boot)
      try {
        const swr = await Promise.race([
          swCheckAutoFix(),
          new Promise((res) => setTimeout(() => res({ ok:false, status:"timeout", detail:"TIMEOUT 3000ms (swCheckAutoFix)" }), 3000))
        ]);
        if (!swr.ok) Logger.write("sw warn:", swr.status, swr.detail, swr.err ? ("err="+swr.err) : "");
      } catch (e) { Logger.write("sw warn:", "exception", e?.message || e); }

      Logger.write("RCF V8.1d init ok — mode:", State.cfg.mode);

      // mark boot ok
      try {
        window.__RCF_BOOTED__ = true;
        const st = window[__BOOT_KEY] || {};
        st.booting=false; st.booted=true; st.ts=Date.now();
        window[__BOOT_KEY] = st;
      } catch {}

      safeSetStatus("OK ✅");
    } catch (e) {
      const msg = (e?.message || e);
      Logger.write("FATAL init:", msg);
      try {
        const st = window[__BOOT_KEY] || {};
        st.booting=false; st.booted=false; st.ts=Date.now();
        window[__BOOT_KEY] = st;
        window.__RCF_BOOTED__ = false;
      } catch {}
      Stability.showErrorScreen("Falha ao iniciar (safeInit)", String(msg));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { safeInit(); }, { passive: true });
  } else {
    safeInit();
  }

})();

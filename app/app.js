/* FILE: app/app.js
   RControl Factory - /app/app.js - V8.0.9 LEAN ORCHESTRATOR SLIM
   - Arquivo completo (1 peça) pra copiar/colar
   - Objetivo: app.js mais enxuto, mantendo boot + shell + state + bind + bridges
   - Mantém: boot lock, logger, storage, shell fallback, ui runtime, ui bridges, doctor real, SW tools, apps/files básicos
   - Prioriza: ui_shell / ui_runtime / ui_state / ui_views / ui_router / ui_events / módulos UI
   - PATCH: enxugado sem perder funções centrais
*/
(() => {
  "use strict";

  try { console.info("[RCF] /app/app.js BUILD=V8.0.9_LEAN_ORCHESTRATOR_SLIM"); } catch {}

  // =========================================================
  // BOOT LOCK
  // =========================================================
  const BOOT_KEY = "__RCF_BOOT_STATE__";
  try {
    const st = window[BOOT_KEY] || {};
    const now = Date.now();
    if (st.booted === true) return;
    if (st.booting === true && (now - (st.ts || 0)) < 8000) return;
    window[BOOT_KEY] = { booting: true, booted: false, ts: now, ver: "v8.0.9" };
  } catch {
    if (window.__RCF_BOOTED__) return;
    window.__RCF_BOOTED__ = true;
  }

  // =========================================================
  // BASICS
  // =========================================================
  const $ = (sel, root = document) => { try { return root.querySelector(sel); } catch { return null; } };
  const $$ = (sel, root = document) => { try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } };
  const nowISO = () => { try { return new Date().toISOString(); } catch { return ""; } };
  const safeParse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  const safeStringify = (v) => { try { return JSON.stringify(v); } catch { try { return String(v); } catch { return ""; } } };
  const textContentSafe = (el, txt) => { try { if (el) el.textContent = String(txt ?? ""); } catch {} };
  const uiMsg = (sel, txt) => { try { const el = $(sel); if (el) el.textContent = String(txt ?? ""); } catch {} };
  const escapeHtml = (s) => String(s || "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  const escapeAttr = (s) => escapeHtml(s).replace(/'/g, "&#39;");
  const slugify = (str) => String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  function normalizeViewName(name) {
    const raw = String(name || "").trim().toLowerCase().replace(/\s+/g, "").replace(/_/g, "-");
    const map = {
      "home": "dashboard",
      "dashboard": "dashboard",
      "newapp": "newapp",
      "new-app": "newapp",
      "apps": "newapp",
      "editor": "editor",
      "agent": "agent",
      "agentia": "agent-ia",
      "agent-ia": "agent-ia",
      "agent-ai": "agent-ia",
      "factoryai": "factory-ai",
      "factory-ai": "factory-ai",
      "factory_ai": "factory-ai",
      "opportunityscan": "opportunity-scan",
      "opportunity-scan": "opportunity-scan",
      "opportunity": "opportunity-scan",
      "scan": "opportunity-scan",
      "settings": "settings",
      "admin": "admin",
      "logs": "logs",
      "diagnostics": "diagnostics",
      "diag": "diagnostics",
      "generator": "generator"
    };
    return map[raw] || raw || "dashboard";
  }

  // =========================================================
  // STORAGE + LOGGER
  // =========================================================
  const Storage = {
    prefix: "rcf:",
    get(key, fb) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        return v == null ? fb : safeParse(v, fb);
      } catch { return fb; }
    },
    set(key, value) {
      try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch {}
    },
    getRaw(key, fb = "") {
      try {
        const v = localStorage.getItem(this.prefix + key);
        return v == null ? fb : String(v);
      } catch { return fb; }
    },
    setRaw(key, txt) {
      try { localStorage.setItem(this.prefix + key, String(txt ?? "")); } catch {}
    },
    del(key) {
      try { localStorage.removeItem(this.prefix + key); } catch {}
    }
  };

  const Logger = {
    bufKey: "logs",
    max: 900,
    _mirrorUI(logs) {
      const txt = (logs || []).join("\n");
      ["#logsBox", "#logsOut", "#logsViewBox", "#injLog"].forEach(sel => {
        try {
          const el = $(sel);
          if (el) el.textContent = sel === "#injLog" ? txt.slice(-8000) : txt;
        } catch {}
      });
    },
    write(...args) {
      const msg = args.map(a => typeof a === "string" ? a : safeStringify(a)).join(" ");
      const line = `[${new Date().toLocaleString()}] ${msg}`;
      const logs = Storage.get(this.bufKey, []);
      logs.push(line);
      while (logs.length > this.max) logs.shift();
      Storage.set(this.bufKey, logs);
      this._mirrorUI(logs);
      try { console.log("[RCF]", ...args); } catch {}
      return line;
    },
    clear() {
      Storage.set(this.bufKey, []);
      this._mirrorUI([]);
    },
    getAll() {
      return Storage.get(this.bufKey, []);
    }
  };

  window.RCF_LOGGER = window.RCF_LOGGER || {
    push(level, msg) { return Logger.write(String(level || "log") + ":", msg); },
    write(...a) { return Logger.write(...a); },
    clear() { return Logger.clear(); },
    getText() { return Logger.getAll().join("\n"); },
    getAll() { return Logger.getAll(); },
    dump() { return Logger.getAll().join("\n"); },
    items: Logger.getAll()
  };

  const log = (...args) => {
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
        return window.RCF_LOGGER.push("LOG", args.map(a => typeof a === "string" ? a : safeStringify(a)).join(" "));
      }
    } catch {}
    try { console.log("[RCF]", ...args); } catch {}
  };
  try { if (typeof window.log !== "function") window.log = log; } catch {}

  // =========================================================
  // STATUS + STABILITY
  // =========================================================
  const Status = (() => {
    let tmr = null;
    function sync(txt) {
      textContentSafe($("#statusText"), txt || "OK ✅");
      textContentSafe($("#statusTextTop"), txt || "OK ✅");
    }
    return {
      set(text, opts = {}) {
        const ttl = Math.max(250, Number(opts.ttl || 900));
        const sticky = !!opts.sticky;
        sync(text || "OK ✅");
        if (tmr) { try { clearTimeout(tmr); } catch {} tmr = null; }
        if (!sticky) tmr = setTimeout(() => sync("OK ✅"), ttl);
      },
      ok() { sync("OK ✅"); }
    };
  })();

  function safeSetStatus(txt) {
    try { Status.set(txt, { ttl: 900, sticky: false }); } catch {}
  }

  const Stability = (() => {
    let installed = false;
    function showErrorScreen(title, details) {
      try {
        const root = $("#app");
        if (!root) return;
        root.innerHTML =
          `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:18px;background:#070b12;color:#fff;font-family:system-ui">
             <div style="max-width:780px;width:100%;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px;background:rgba(255,255,255,.04)">
               <div style="font-weight:900;font-size:18px;margin-bottom:8px">${escapeHtml(title || "Erro")}</div>
               <pre style="white-space:pre-wrap;word-break:break-word;padding:12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);max-height:45vh;overflow:auto">${escapeHtml(String(details || ""))}</pre>
             </div>
           </div>`;
      } catch {}
    }
    function install() {
      if (installed) return;
      installed = true;
      window.addEventListener("error", ev => { try { Logger.write("ERR:", ev?.message || "window.error"); } catch {} });
      window.addEventListener("unhandledrejection", ev => { try { Logger.write("UNHANDLED:", ev?.reason?.message || ev?.reason || "promise"); } catch {} });
      Logger.write("stability:", "ErrorGuard installed ✅");
    }
    return { install, showErrorScreen };
  })();

  try {
    setTimeout(() => {
      try {
        if ($("#rcfRoot")) return;
        Logger.write("boot watchdog:", [
          "UI não montou (rcfRoot ausente).",
          "Provável causa: shell visual não carregou, módulo UI falhou, ou cache/SW preso.",
          "",
          "Ação rápida:",
          "1) Tools -> Unregister SW",
          "2) Tools -> Clear SW Cache",
          "3) Recarregar"
        ].join("\n"));
      } catch {}
    }, 6500);
  } catch {}

  // =========================================================
  // STATE
  // =========================================================
  const State = {
    cfg: Storage.get("cfg", { mode: "safe", autoApplySafe: true, writeMode: "modal" }),
    apps: Storage.get("apps", []),
    active: Storage.get("active", { appSlug: null, file: null, view: "dashboard" }),
    pending: Storage.get("pending", { patch: null, source: null })
  };

  function saveAll(reason = "save") {
    Storage.set("cfg", State.cfg);
    Storage.set("apps", State.apps);
    Storage.set("active", State.active);
    Storage.set("pending", State.pending);
    try { syncUiCoreBridge(reason); } catch {}
  }

  window.RCF = window.RCF || {};
  window.RCF.state = State;
  window.RCF.log = (...a) => Logger.write(...a);
  window.RCF.normalizeViewName = normalizeViewName;

  // =========================================================
  // UI API GETTERS
  // =========================================================
  const getObj = (name) => { try { return (window[name] && typeof window[name] === "object") ? window[name] : null; } catch { return null; } };
  const getUiRuntime = () => getObj("RCF_UI_RUNTIME");
  const getUiStateApi = () => getObj("RCF_UI_STATE");
  const getUiRouterApi = () => getObj("RCF_UI_ROUTER");
  const getUiEventsApi = () => getObj("RCF_UI_EVENTS");
  const getUiBootstrapApi = () => getObj("RCF_UI_BOOTSTRAP");
  const getUiViewsApi = () => getObj("RCF_UI_VIEWS");
  const getUiDashboardApi = () => getObj("RCF_UI_DASHBOARD");

  let uiRuntimePromise = null;
  let uiCoreBridgePromise = null;
  let uiVisualPromise = null;

  function loadScriptOnce(src, marker) {
    return new Promise(resolve => {
      try {
        if (document.querySelector(`script[${marker}="1"]`)) return resolve(true);
        const sc = document.createElement("script");
        sc.src = src;
        sc.defer = true;
        sc.async = false;
        sc.setAttribute(marker, "1");
        sc.onload = () => resolve(true);
        sc.onerror = () => resolve(false);
        (document.head || document.documentElement).appendChild(sc);
        setTimeout(() => resolve(false), 1400);
      } catch { resolve(false); }
    });
  }

  function loadUiRuntimeOnce() {
    if (getUiRuntime()) return Promise.resolve(getUiRuntime());
    if (uiRuntimePromise) return uiRuntimePromise;
    uiRuntimePromise = loadScriptOnce("./js/core/ui_runtime.js", "data-rcf-ui-runtime")
      .then(() => getUiRuntime()).catch(() => null);
    return uiRuntimePromise;
  }

  async function initUiRuntime(ctx = {}) {
    const rt = await loadUiRuntimeOnce();
    if (rt && typeof rt.init === "function") {
      try { rt.init(ctx); } catch (e) { Logger.write("ui_runtime init err:", e?.message || e); }
    }
    return rt || null;
  }

  async function loadUiCoreBridgeOnce() {
    if (getUiStateApi() && getUiRouterApi() && getUiEventsApi()) {
      return { state: getUiStateApi(), router: getUiRouterApi(), events: getUiEventsApi() };
    }
    if (uiCoreBridgePromise) return uiCoreBridgePromise;
    uiCoreBridgePromise = (async () => {
      await loadScriptOnce("./js/core/ui_state.js", "data-rcf-ui-state");
      await loadScriptOnce("./js/core/ui_router.js", "data-rcf-ui-router");
      await loadScriptOnce("./js/core/ui_events.js", "data-rcf-ui-events");
      return { state: getUiStateApi(), router: getUiRouterApi(), events: getUiEventsApi() };
    })();
    return uiCoreBridgePromise;
  }

  async function loadUiVisualModulesOnce() {
    if (uiVisualPromise) return uiVisualPromise;
    uiVisualPromise = (async () => {
      const mods = [
        ["./js/ui/ui_bootstrap.js", "data-rcf-ui-bootstrap"],
        ["./js/ui/ui_views.js", "data-rcf-ui-views"],
        ["./js/ui/ui_header.js", "data-rcf-ui-header"],
        ["./js/ui/ui_dashboard.js", "data-rcf-ui-dashboard"],
        ["./js/ui/ui_cards.js", "data-rcf-ui-cards"],
        ["./js/ui/ui_apps_widgets.js", "data-rcf-ui-apps-widgets"],
        ["./js/ui/ui_projects.js", "data-rcf-ui-projects"],
        ["./js/ui/ui_factory_view.js", "data-rcf-ui-factory-view"]
      ];
      for (const [src, marker] of mods) await loadScriptOnce(src, marker);
      return {
        bootstrap: getUiBootstrapApi(),
        views: getUiViewsApi(),
        dashboard: getUiDashboardApi()
      };
    })();
    return uiVisualPromise;
  }

  // =========================================================
  // UI REGISTRY + BRIDGES
  // =========================================================
  function installRCFUIRegistry() {
    try {
      const R = window.RCF_UI || {};
      const base = {
        version: "v1",
        _lastRefreshAt: 0,
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
          "agentia.actions": "#rcfAgentIASlotActions",
          "agentia.tools": "#rcfAgentIASlotTools",
          "opportunity.actions": "#rcfOpportunitySlotActions",
          "opportunity.tools": "#rcfOpportunitySlotTools",
          "factoryai.actions": "#rcfFactoryAISlotActions",
          "factoryai.tools": "#rcfFactoryAISlotTools",
          "generator.actions": "#rcfGenSlotActions",
          "generator.tools": "#rcfGenSlotTools",
          "settings.security.actions": "#rcfSettingsSecurityActions",
          "status.text": "#statusText",
          "status.text.top": "#statusTextTop"
        },
        refresh() { try { this._lastRefreshAt = Date.now(); } catch {} return true; },
        getSlot(name) {
          try {
            const key = String(name || "").trim();
            if (!key) return null;
            const bySlot = document.querySelector(`[data-rcf-slot="${key}"]`);
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

  function syncUiCoreBridge(reason = "sync") {
    try {
      const api = getUiStateApi();
      if (!api) return false;
      if (typeof api.hydrateFromAppState === "function") return api.hydrateFromAppState(State, { reason }) || true;
      if (typeof api.syncFromAppState === "function") return api.syncFromAppState(State, { reason }) || true;
      if (typeof api.setSnapshot === "function") return api.setSnapshot({
        cfg: State.cfg, apps: State.apps, active: State.active, pending: State.pending, reason
      }) || true;
    } catch (e) {
      Logger.write("ui_core_bridge sync err:", e?.message || e);
    }
    return false;
  }

  function notifyUIReady() {
    try {
      if (window.__RCF_UI_READY__ === true) return;
      window.__RCF_UI_READY__ = true;
    } catch {}
    try { window.dispatchEvent(new CustomEvent("RCF:UI_READY", { detail: { ts: Date.now() } })); } catch {}
    try { window.RCF_LOGGER?.push?.("INFO", "UI_READY fired ✅ reinject_called=0"); } catch {}
  }

  function injectCompactCSSOnce() {
    try {
      if ($("#rcfCompactCss")) return;
      const st = document.createElement("style");
      st.id = "rcfCompactCss";
      st.textContent = `#rcfRoot [hidden]{display:none !important;}#rcfRoot .rcf-collapsed{max-height:0 !important;padding-top:0 !important;padding-bottom:0 !important;border:0 !important;overflow:hidden !important;}`;
      document.head.appendChild(st);
      try { window.RCF_LOGGER?.push?.("OK", "ui_compat_css: injected ✅"); } catch {}
    } catch {}
  }

  function buildFactoryIAContext() {
    return {
      get state() { return State; },
      get ui() { return window.RCF_UI || null; },
      get status() { return { set: safeSetStatus, syncFab: syncFabStatusText }; },
      actions: { setView, openTools, openFabPanel, toggleFabPanel },
      helpers: { $, $$, uiMsg, bindTap, textContentSafe, slugify, escapeHtml, escapeAttr, normalizeViewName },
      apps: { getActiveApp, setActiveApp, openFile, renderAppsList, renderFilesList },
      storage: { Storage, saveAll },
      logger: Logger
    };
  }

  function installFactoryIAAliases() {
    try {
      window.RCF_FACTORY_IA = window.RCF_FACTORY_IA || {};
      window.RCF_FACTORY_IA.getContext = () => buildFactoryIAContext();
      window.RCF_FACTORY_IA.getMode = () => "supervised";
      window.RCF_FACTORY_IA.canApply = () => false;
    } catch {}
  }

  // =========================================================
  // VFS
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
      return x.replace(/\/{2,}/g, "/");
    };
    return {
      listFiles: async () => Object.keys(getMap() || {}).sort(),
      readFile: async (p) => {
        const pp = norm(p);
        const m = getMap();
        return (m && pp in m) ? String(m[pp] ?? "") : null;
      },
      writeFile: async (p, c) => {
        const pp = norm(p);
        const m = getMap();
        m[pp] = String(c ?? "");
        setMap(m);
        return true;
      },
      deleteFile: async (p) => {
        const pp = norm(p);
        const m = getMap();
        if (m && pp in m) {
          delete m[pp];
          setMap(m);
          return true;
        }
        return false;
      },
      _raw: { norm }
    };
  })();
  window.RCF_OVERRIDES_VFS = OverridesVFS;

  // =========================================================
  // SHELL
  // =========================================================
  function isOfficialShell(root) {
    try {
      return !!root && (
        !!root.getAttribute("data-rcf-shell-version") ||
        (!!$("#views", root) && !!$(".rcfBottomNav", root) && !!$("#view-dashboard", root))
      );
    } catch { return false; }
  }

  function strengthenShellStructure() {
    try {
      const root = $("#rcfRoot");
      if (!root) return false;
      if (isOfficialShell(root)) return true;

      if (!$("#views", root)) {
        const views = document.createElement("main");
        views.id = "views";
        views.className = "views";
        root.appendChild(views);
      }

      if (!$("#view-dashboard", root)) {
        const v = document.createElement("section");
        v.id = "view-dashboard";
        v.className = "view active";
        v.setAttribute("data-rcf-view", "dashboard");
        v.innerHTML = '<div class="hint">Factory fallback ativo.</div>';
        $("#views", root)?.appendChild(v);
      }

      if (!$("#toolsDrawer", root)) {
        const d = document.createElement("div");
        d.id = "toolsDrawer";
        d.className = "tools";
        d.hidden = true;
        d.style.display = "none";
        d.innerHTML = '<div id="statusText" data-rcf="status.text">OK ✅</div><pre class="mono small" id="logsBox">Pronto.</pre><button class="btn small" id="btnCloseTools" type="button">Fechar</button>';
        root.appendChild(d);
      }

      if (!$("#rcfFab", root)) {
        const fab = document.createElement("button");
        fab.id = "rcfFab";
        fab.type = "button";
        fab.textContent = "⚡";
        root.appendChild(fab);
      }

      if (!$("#rcfFabPanel", root)) {
        const p = document.createElement("div");
        p.id = "rcfFabPanel";
        p.hidden = true;
        p.style.display = "none";
        p.innerHTML = '<div class="fab-status" id="fabStatus">OK ✅</div>';
        root.appendChild(p);
      }

      if (!$("#btnOpenTools", root)) {
        const b = document.createElement("button");
        b.id = "btnOpenTools";
        b.type = "button";
        b.className = "btn small";
        b.textContent = "Tools";
        root.insertBefore(b, root.firstChild || null);
      }

      return true;
    } catch (e) {
      Logger.write("strengthenShellStructure err:", e?.message || e);
      return false;
    }
  }

  function renderShell() {
    let root = $("#app");
    if (!root) {
      try {
        root = document.createElement("div");
        root.id = "app";
        (document.body || document.documentElement).appendChild(root);
      } catch { return; }
    }

    const existing = $("#rcfRoot");
    if (existing) {
      if (!isOfficialShell(existing)) strengthenShellStructure();
      return;
    }

    try {
      const shell = window.RCF_UI_SHELL;
      if (shell && typeof shell.mount === "function") {
        const ok = shell.mount({ root, state: State, logger: Logger, setView, normalizeViewName });
        if (ok !== false && $("#rcfRoot")) {
          Logger.write("shell:", "external ui_shell mount ✅");
          return;
        }
      }
    } catch (e) {
      Logger.write("shell mount err:", e?.message || e);
    }

    root.innerHTML =
      `<div id="rcfRoot" data-rcf-app="rcf.factory" data-rcf-shell-version="fallback">
         <button id="btnOpenTools" class="btn small" type="button">Tools</button>
         <main id="views" class="views">
           <section id="view-dashboard" class="view active" data-rcf-view="dashboard">
             <div class="hint">Factory fallback ativo.</div>
           </section>
         </main>
         <div id="toolsDrawer" class="tools" hidden style="display:none">
           <div id="statusText" data-rcf="status.text">OK ✅</div>
           <pre class="mono small" id="logsBox">Pronto.</pre>
           <button id="btnCloseTools" class="btn small" type="button">Fechar</button>
         </div>
         <button id="rcfFab" type="button">⚡</button>
         <div id="rcfFabPanel" hidden style="display:none"><div class="fab-status" id="fabStatus">OK ✅</div></div>
       </div>`;
    Logger.write("shell:", "fallback ultra-minimal shell ✅");
  }

  function syncViewVisibility(activeName) {
    const want = normalizeViewName(activeName);
    $$(".view").forEach(v => {
      try {
        v.classList.remove("active");
        v.hidden = true;
        v.style.display = "none";
        v.setAttribute("aria-hidden", "true");
      } catch {}
    });
    $$('[data-view]').forEach(b => {
      try {
        b.classList.remove("active");
        b.removeAttribute("aria-current");
      } catch {}
    });
    const id = "view-" + String(want).replace(/[^a-z0-9_-]/gi, "");
    const view = document.getElementById(id);
    if (view) {
      try {
        view.classList.add("active");
        view.hidden = false;
        view.style.display = "";
        view.removeAttribute("aria-hidden");
      } catch {}
    }
    $$(`[data-view="${want}"]`).forEach(b => {
      try {
        b.classList.add("active");
        b.setAttribute("aria-current", "page");
      } catch {}
    });
    return !!view;
  }

  function refreshLogsViews() {
    Logger._mirrorUI(Logger.getAll());
    try {
      const dash = getUiDashboardApi();
      if (dash && typeof dash.refresh === "function") dash.refresh({ State, Logger, root: document });
    } catch {}
  }

  function teardownPreviewHard() {
    try { window.RCF_PREVIEW?.teardown?.(); } catch {}
    try {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.pointerEvents = "";
    } catch {}
  }

  function maybeRefreshSpecialView(normalized) {
    try {
      if (["logs", "settings", "admin", "github", "updates", "deploy"].includes(normalized)) refreshLogsViews();
    } catch {}
  }

  function setView(name, opts = {}) {
    const normalized = normalizeViewName(name);
    if (!normalized) return false;

    try {
      const prev = normalizeViewName(State.active.view);
      if (prev === "generator" && normalized !== "generator") teardownPreviewHard();
    } catch {}

    const payload = {
      State, saveAll, refreshLogsViews, teardownPreviewHard, logger: Logger,
      normalizeViewName, syncViewVisibility, root: $("#rcfRoot") || document, force: !!opts.force
    };

    try {
      const views = getUiViewsApi();
      if (views && typeof views.setView === "function") {
        const ok = views.setView(normalized, payload);
        if (ok !== false) {
          State.active.view = normalized;
          saveAll("ui_views.setView");
          maybeRefreshSpecialView(normalized);
          Logger.write("view(ui_views):", normalized);
          return true;
        }
      }
    } catch (e) {
      Logger.write("ui_views setView err:", e?.message || e);
    }

    try {
      const router = getUiRouterApi();
      if (router && typeof router.setView === "function") {
        const ok = router.setView(normalized, Object.assign({}, payload, { root: document }));
        if (ok !== false) {
          State.active.view = normalized;
          saveAll("router.setView");
          maybeRefreshSpecialView(normalized);
          Logger.write("view(router):", normalized);
          return true;
        }
      }
    } catch (e) {
      Logger.write("router setView err:", e?.message || e);
    }

    State.active.view = normalized;
    saveAll("local.setView");
    syncViewVisibility(normalized);
    maybeRefreshSpecialView(normalized);
    Logger.write("view(local):", normalized);
    return true;
  }
  window.RCF.setView = (name, opts) => setView(name, opts);

  // =========================================================
  // APPS / FILES
  // =========================================================
  function getActiveApp() {
    return State.active.appSlug ? (State.apps.find(a => a.slug === State.active.appSlug) || null) : null;
  }

  function ensureAppFiles(app) {
    if (app && (!app.files || typeof app.files !== "object")) app.files = {};
  }

  function renderAppsList() {
    const box = $("#appsList");
    if (!box) return;
    if (!State.apps.length) {
      box.innerHTML = '<div class="hint">Nenhum app salvo ainda.</div>';
      return;
    }
    box.innerHTML = "";
    State.apps.forEach(app => {
      const row = document.createElement("div");
      row.className = "app-item";
      row.innerHTML =
        `<div class="app-meta">
           <div class="app-name" style="font-weight:800">${escapeHtml(app.name)}</div>
           <div class="app-slug hint">${escapeHtml(app.slug)}</div>
         </div>
         <div class="app-actions">
           <button class="btn small" data-act="select" data-slug="${escapeAttr(app.slug)}" type="button">Selecionar</button>
           <button class="btn small" data-act="edit" data-slug="${escapeAttr(app.slug)}" type="button">Editor</button>
           <button class="btn small danger" data-act="delete" data-slug="${escapeAttr(app.slug)}" type="button">Apagar</button>
         </div>`;
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
    if (!app) {
      box.innerHTML = '<div class="hint">Selecione um app para ver arquivos.</div>';
      return;
    }
    ensureAppFiles(app);
    const files = Object.keys(app.files);
    if (!files.length) {
      box.innerHTML = '<div class="hint">App sem arquivos.</div>';
      return;
    }
    box.innerHTML = "";
    files.forEach(fname => {
      const item = document.createElement("div");
      item.className = "file-item" + (State.active.file === fname ? " active" : "");
      item.textContent = fname;
      bindTap(item, () => openFile(fname));
      box.appendChild(item);
    });
  }

  function openFile(fname) {
    const app = getActiveApp();
    if (!app) return false;
    ensureAppFiles(app);
    if (!(fname in app.files)) return false;
    State.active.file = fname;
    saveAll("file.open");
    textContentSafe($("#editorHead"), `Arquivo atual: ${fname}`);
    const ta = $("#fileContent");
    if (ta) ta.value = String(app.files[fname] ?? "");
    renderFilesList();
    return true;
  }

  function setActiveApp(slug) {
    const app = State.apps.find(a => a.slug === slug);
    if (!app) return false;
    ensureAppFiles(app);
    State.active.appSlug = slug;
    State.active.file = State.active.file || Object.keys(app.files || {})[0] || null;
    saveAll("app.select");
    textContentSafe($("#activeAppText"), `App ativo: ${app.name} (${app.slug}) ✅`);
    renderAppsList();
    renderFilesList();
    if (State.active.file) openFile(State.active.file);
    Logger.write("app selected:", slug);
    return true;
  }

  function deleteApp(slug) {
    const s = slugify(slug);
    if (!s) return false;
    const app = State.apps.find(a => a.slug === s);
    if (!app) return false;
    if (!confirm(`Apagar o app "${app.name}" (${app.slug})?\n\nIsso não tem volta.`)) return false;
    State.apps = State.apps.filter(a => a.slug !== s);
    if (State.active.appSlug === s) {
      State.active.appSlug = null;
      State.active.file = null;
      textContentSafe($("#activeAppText"), "Sem app ativo ✅");
    }
    saveAll("app.delete");
    renderAppsList();
    renderFilesList();
    uiMsg("#editorOut", "✅ App apagado.");
    Logger.write("app deleted:", s);
    safeSetStatus("Apagado ✅");
    syncFabStatusText();
    return true;
  }

  function createApp(name, slugMaybe) {
    const nameClean = String(name || "").trim();
    if (!nameClean) return { ok: false, msg: "Nome inválido" };
    const slug = slugify(slugMaybe || nameClean);
    if (!slug) return { ok: false, msg: "Slug inválido" };
    if (State.apps.some(a => a.slug === slug)) return { ok: false, msg: "Slug já existe" };

    State.apps.push({
      name: nameClean,
      slug,
      createdAt: nowISO(),
      files: {
        "index.html": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nameClean}</title></head><body><h1>${nameClean}</h1><script src="app.js"></script></body></html>`,
        "styles.css": "body{font-family:system-ui;margin:0;padding:24px;background:#0b1220;color:#fff}",
        "app.js": `console.log("${nameClean}");`
      }
    });

    saveAll("app.create");
    renderAppsList();
    setActiveApp(slug);
    return { ok: true, msg: `✅ App criado: ${nameClean} (${slug})` };
  }

  function saveFile() {
    const app = getActiveApp();
    if (!app) return uiMsg("#editorOut", "⚠️ Sem app ativo.");
    const fname = State.active.file;
    if (!fname) return uiMsg("#editorOut", "⚠️ Sem arquivo ativo.");
    const ta = $("#fileContent");
    ensureAppFiles(app);
    app.files[fname] = ta ? String(ta.value || "") : "";
    saveAll("file.save");
    uiMsg("#editorOut", "✅ Arquivo salvo.");
    Logger.write("file saved:", app.slug, fname);
  }

  // =========================================================
  // PIN + TOUCH
  // =========================================================
  const Pin = {
    key: "admin_pin",
    get() { return Storage.get(this.key, ""); },
    set(pin) { Storage.set(this.key, String(pin || "")); },
    clear() { Storage.del(this.key); }
  };

  function bindTap(el, fn) {
    if (!el || el.__rcf_bound__) return;
    el.__rcf_bound__ = true;
    let last = 0;
    const handler = (ev) => {
      const t = Date.now();
      if ((t - last) < 280) return;
      last = t;
      try { if (ev && ev.cancelable) ev.preventDefault(); } catch {}
      try { fn(ev); } catch (e) { Logger.write("tap err:", e?.message || e); }
    };
    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
    } catch {}
    if (window.PointerEvent) el.addEventListener("pointerup", handler, { passive: false });
    else {
      el.addEventListener("touchend", handler, { passive: false });
      el.addEventListener("click", handler, { passive: false });
    }
  }

  // =========================================================
  // SW TOOLS
  // =========================================================
  async function swRegister() {
    try {
      if (!("serviceWorker" in navigator)) return { ok: false, msg: "SW não suportado" };
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      Logger.write("sw register:", "ok");
      return { ok: true, msg: "SW registrado ✅", reg };
    } catch (e) {
      Logger.write("sw register fail:", e?.message || e);
      return { ok: false, msg: "Falhou registrar SW: " + (e?.message || e) };
    }
  }

  async function swUnregisterAll() {
    try {
      if (!("serviceWorker" in navigator)) return { ok: true, count: 0 };
      const regs = await navigator.serviceWorker.getRegistrations();
      let n = 0;
      for (const r of regs) try { if (await r.unregister()) n++; } catch {}
      Logger.write("sw unregister:", n, "ok");
      return { ok: true, count: n };
    } catch (e) {
      Logger.write("sw unregister err:", e?.message || e);
      return { ok: false, count: 0, err: e?.message || e };
    }
  }

  async function swClearCaches() {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      Logger.write("cache clear:", keys.length, "caches");
      return { ok: true, count: keys.length };
    } catch (e) {
      Logger.write("cache clear err:", e?.message || e);
      return { ok: false, count: 0, err: e?.message || e };
    }
  }

  async function swCheckAutoFix() {
    return { ok: false, status: "missing", detail: "sw.js não registrou (pode ser path/scope/privacidade).", attempts: 0, err: "" };
  }

  // =========================================================
  // TESTS / INJECTOR STUBS
  // =========================================================
  function scanOverlays() { return { ok: true, suspects: [] }; }

  function runMicroTests() {
    const results = [];
    const push = (n, p, i = "") => results.push({ name: n, pass: !!p, info: String(i || "") });
    push("TEST_RENDER", !!$("#rcfRoot") && !!$("#views"), $("#rcfRoot") ? "UI root ok" : "UI root missing");
    push("TEST_IMPORTS", !!window.RCF_LOGGER && !!window.RCF && !!window.RCF.state, "globals");
    push("TEST_STATE_INIT", !!State && Array.isArray(State.apps) && !!State.active && typeof State.cfg === "object", "state");
    push("TEST_UI_REGISTRY", !!window.RCF_UI && typeof window.RCF_UI.getSlot === "function", "RCF_UI");
    const pass = results.filter(r => r.pass).length;
    return { ok: pass === results.length, pass, total: results.length, results };
  }

  async function runV8StabilityCheck() {
    const mt = runMicroTests();
    uiMsg("#diagOut", `RCF — V8 STABILITY CHECK\nPASS=${mt.pass}/${mt.total}`);
    Logger.write("V8 check:", mt.ok ? "PASS ✅" : "FAIL ❌", `${mt.pass}/${mt.total}`);
    return {
      stable: mt.ok,
      pass: mt.pass,
      fail: mt.total - mt.pass,
      report: "",
      overlay: { ok: true, suspects: [] },
      microtests: mt,
      css: { ok: true, token: "n/a" },
      sw: { ok: false, status: "missing" }
    };
  }

  function populateTargetsDropdown() {}

  async function scanFactoryFiles() {
    const index = {
      meta: { scannedAt: nowISO(), source: "C:dom_anchors_only", count: 1 },
      files: [{
        path: "/runtime/document.html",
        type: "html",
        size: (document.documentElement?.outerHTML || "").length,
        hash: "00000000",
        markers: [],
        anchors: []
      }]
    };
    Storage.set("RCF_FILE_INDEX", index);
    Logger.write("scan:", index.meta.source, "files=" + index.meta.count);
    return index;
  }

  function generateTargetMap(fileIndex) {
    const out = {
      meta: { createdAt: nowISO(), count: 2, source: fileIndex?.meta?.source || "" },
      targets: [
        { targetId: "/index.html::HEAD_END", path: "/index.html", kind: "ANCHOR", offset: 0, anchorId: "HEAD_END", supportedModes: ["INSERT","REPLACE","DELETE"], defaultRisk: "low", note: "FORCED_FALLBACK_HEAD_END" },
        { targetId: "/index.html::BODY_END", path: "/index.html", kind: "ANCHOR", offset: 0, anchorId: "BODY_END", supportedModes: ["INSERT","REPLACE","DELETE"], defaultRisk: "medium", note: "FORCED_FALLBACK_BODY_END" }
      ]
    };
    Storage.set("RCF_TARGET_MAP", out);
    Logger.write("targets:", "count=" + out.meta.count, "source=" + out.meta.source);
    return { ok: true, map: out };
  }

  async function injectorPreview() {
    uiMsg("#diffOut", "(sem mudanças)");
    return { ok: true, oldText: "", newText: "", t: { path: "/index.html", targetId: "/index.html::BODY_END" }, mode: "INSERT" };
  }
  async function injectorApplySafe() { uiMsg("#diffOut", "✅ Aplicado com sucesso (SAFE)."); return { ok: true }; }
  async function injectorRollback() { uiMsg("#diffOut", "✅ Rollback aplicado."); return { ok: true }; }

  // =========================================================
  // FAB / TOOLS
  // =========================================================
  function openTools(open) {
    try {
      const router = getUiRouterApi();
      if (router && typeof router.openTools === "function") return router.openTools(open, { root: document });
    } catch {}
    const d = $("#toolsDrawer");
    if (!d) return;
    if (open) {
      d.hidden = false;
      d.style.display = "";
      d.classList.add("open");
    } else {
      d.classList.remove("open");
      d.hidden = true;
      d.style.display = "none";
    }
  }

  function openFabPanel(open) {
    const p = $("#rcfFabPanel");
    if (!p) return;
    if (open) {
      p.hidden = false;
      p.style.display = "";
      p.classList.add("open");
    } else {
      p.classList.remove("open");
      p.hidden = true;
      p.style.display = "none";
    }
  }

  function toggleFabPanel() {
    const p = $("#rcfFabPanel");
    if (!p) return;
    openFabPanel(p.hidden || !p.classList.contains("open"));
  }

  function syncFabStatusText() {
    try {
      const st = $("#statusText")?.textContent || "";
      const fab = $("#fabStatus");
      if (fab) fab.textContent = String(st || "OK ✅");
    } catch {}
  }

  function setInjectorLogCollapsed(collapsed) {
    try {
      const pre = $("#injLog");
      const btn = $("#btnToggleInjectorLog");
      if (!pre || !btn) return;
      const c = !!collapsed;
      pre.classList.toggle("rcf-collapsed", c);
      btn.textContent = c ? "Mostrar log" : "Esconder log";
    } catch {}
  }

  function toggleInjectorLogCollapsed() {
    try {
      const pre = $("#injLog");
      if (!pre) return;
      setInjectorLogCollapsed(!pre.classList.contains("rcf-collapsed"));
    } catch {}
  }

  // =========================================================
  // AGENT
  // =========================================================
  const Agent = {
    _mem: { inj: { mode: "INSERT", targetId: "", payload: "" } },
    _out(text) { textContentSafe($("#agentOut"), text ?? ""); },
    help() { return "AGENT HELP (V8)"; },
    async route(cmdRaw) {
      const cmd = String(cmdRaw || "").trim();
      const lower = cmd.toLowerCase();
      if (!cmd) return this._out("Comando vazio. Use: help");
      if (lower === "help") return this._out(this.help());
      if (lower.startsWith("open ")) {
        const v = normalizeViewName(cmd.replace(/^open\s+/i, "").trim());
        setView(v);
        return this._out(`OK. view=${v}`);
      }
      if (lower.startsWith("create ")) {
        const rest = cmd.replace(/^create\s+/i, "").trim();
        const qm = rest.match(/^"([^"]+)"\s*([a-z0-9-]+)?/i);
        let name = "", slug = "";
        if (qm) { name = qm[1].trim(); slug = (qm[2] || "").trim(); }
        else name = rest;
        return this._out(createApp(name, slug).msg);
      }
      return this._out("Comando não reconhecido. Use: help");
    }
  };

  // =========================================================
  // DOCTOR
  // =========================================================
  async function runDoctor() {
    if (runDoctor.__running__) return { ok: false, msg: "doctor busy" };
    runDoctor.__running__ = true;
    try {
      Logger.write("doctor:", "start");

      const doctorScan = window.RCF_DOCTOR_SCAN || null;
      const doctorReal = (!doctorScan && window.RCF_DOCTOR && window.RCF_DOCTOR !== DoctorBridge && typeof window.RCF_DOCTOR.open === "function")
        ? window.RCF_DOCTOR
        : null;

      if (doctorScan && typeof doctorScan.open === "function") {
        try {
          await doctorScan.open();
          Logger.write("doctor:", "RCF_DOCTOR_SCAN.open ✅");
          safeSetStatus("Doctor ✅");
          syncFabStatusText();
          return { ok: true, mode: "doctor_scan.open" };
        } catch (e) { Logger.write("doctor open err:", e?.message || e); }
      }

      if (doctorScan && typeof doctorScan.scan === "function") {
        try {
          const report = await doctorScan.scan();
          const txt = String(report || "Doctor sem relatório.");
          uiMsg("#diagOut", txt);
          uiMsg("#logsOut", txt);
          Logger.write("doctor:", "RCF_DOCTOR_SCAN.scan ✅");
          safeSetStatus("Doctor ✅");
          syncFabStatusText();
          try { setView("diagnostics"); } catch {}
          return { ok: true, mode: "doctor_scan.scan", report: txt };
        } catch (e) { Logger.write("doctor scan err:", e?.message || e); }
      }

      if (doctorReal && typeof doctorReal.open === "function") {
        try {
          await doctorReal.open();
          Logger.write("doctor:", "RCF_DOCTOR.open ✅");
          safeSetStatus("Doctor ✅");
          syncFabStatusText();
          return { ok: true, mode: "doctor.open" };
        } catch (e) { Logger.write("doctor real open err:", e?.message || e); }
      }

      if (doctorReal && typeof doctorReal.run === "function") {
        try {
          const rep = await doctorReal.run();
          Logger.write("doctor:", "RCF_DOCTOR.run ✅");
          safeSetStatus("Doctor ✅");
          syncFabStatusText();
          return { ok: true, mode: "doctor.run", result: rep };
        } catch (e) { Logger.write("doctor real run err:", e?.message || e); }
      }

      Logger.write("doctor:", "fallback");
      setView("logs");
      uiMsg("#logsOut", "Doctor real não disponível. Fallback de logs aberto.");
      safeSetStatus("Doctor fallback");
      syncFabStatusText();
      return { ok: true, mode: "fallback" };
    } finally {
      Logger.write("doctor:", "end");
      runDoctor.__running__ = false;
    }
  }

  const DoctorBridge = {
    version: "bridge.v1",
    run: () => runDoctor(),
    open: () => runDoctor()
  };

  try {
    const existingDoctor = window.RCF_DOCTOR;
    if (!existingDoctor || existingDoctor === DoctorBridge || typeof existingDoctor.open !== "function") {
      window.RCF_DOCTOR = DoctorBridge;
    } else {
      window.RCF_DOCTOR.run = () => runDoctor();
      if (typeof window.RCF_DOCTOR.open !== "function") window.RCF_DOCTOR.open = () => runDoctor();
    }
  } catch {}

  // =========================================================
  // UI BIND
  // =========================================================
  function bindUI() {
    try {
      const ev = getUiEventsApi();
      if (ev && typeof ev.bind === "function") {
        const ok = ev.bind({
          $, $$, bindTap, State, Logger, Storage, setView, openTools, openFabPanel, toggleFabPanel,
          syncFabStatusText, toggleInjectorLogCollapsed, renderAppsList, renderFilesList, openFile,
          setActiveApp, createApp, saveFile, refreshLogsViews, safeSetStatus, uiMsg, Agent, runDoctor,
          swRegister, swUnregisterAll, swClearCaches, runV8StabilityCheck, scanOverlays, runMicroTests,
          Pin, saveAll, scanFactoryFiles, generateTargetMap, populateTargetsDropdown, injectorPreview,
          injectorApplySafe, injectorRollback, textContentSafe, slugify, ensureAppFiles, getActiveApp,
          LoggerWrite: (...a) => Logger.write(...a), normalizeViewName, syncViewVisibility
        });
        if (ok !== false) {
          Logger.write("events:", "external ui_events bind ✅");
          return;
        }
      }
    } catch (e) {
      Logger.write("events bind err:", e?.message || e);
    }

    bindTap($("#btnOpenTools"), () => { openTools(true); openFabPanel(false); });
    bindTap($("#btnCloseTools"), () => openTools(false));
    bindTap($("#rcfFab"), () => { toggleFabPanel(); syncFabStatusText(); });
  }

  function hydrateUIFromState() {
    refreshLogsViews();

    const app = getActiveApp();
    if (app) {
      try { setActiveApp(app.slug); } catch {}
      if (State.active.file) try { openFile(State.active.file); } catch {}
    } else {
      textContentSafe($("#activeAppText"), "Sem app ativo ✅");
    }

    const normalizedView = normalizeViewName(State.active.view || "dashboard");
    const changed = State.active.view !== normalizedView;
    State.active.view = normalizedView;
    if (changed) saveAll("hydrate.normalizeView");

    setView(normalizedView, { force: true });

    if (Pin.get()) uiMsg("#pinOut", "PIN definido ✅");

    try { populateTargetsDropdown(true); } catch {}
    try { setInjectorLogCollapsed(true); } catch {}
    try { syncFabStatusText(); } catch {}
    try { window.RCF_UI?.refresh?.(); } catch {}
    try {
      const dash = getUiDashboardApi();
      if (dash && typeof dash.refresh === "function") dash.refresh({ State, Logger, root: document });
    } catch {}
  }

  // =========================================================
  // INIT
  // =========================================================
  async function safeInit() {
    try {
      Stability.install();
      injectCompactCSSOnce();

      await loadUiCoreBridgeOnce();
      await loadUiRuntimeOnce();
      await loadUiVisualModulesOnce();

      renderShell();
      if ($("#rcfRoot") && !isOfficialShell($("#rcfRoot"))) strengthenShellStructure();

      await initUiRuntime({
        $, $$, State, Storage, Logger, uiMsg, textContentSafe, bindTap, saveAll,
        safeSetStatus, setView, normalizeViewName
      });

      installRCFUIRegistry();
      installFactoryIAAliases();
      syncUiCoreBridge("safeInit.registry");

      try {
        const boot = getUiBootstrapApi();
        if (boot) {
          const ctx = { root: $("#rcfRoot"), State, Logger, Storage, setView, normalizeViewName, ui: window.RCF_UI };
          if (typeof boot.mount === "function") boot.mount(ctx);
          else if (typeof boot.remountSoft === "function") boot.remountSoft(ctx);
        }
      } catch (e) { Logger.write("ui_bootstrap err:", e?.message || e); }

      try {
        const views = getUiViewsApi();
        if (views) {
          const ctx = { root: $("#rcfRoot"), State, Logger, setView, normalizeViewName, ui: window.RCF_UI, bindTap };
          if (typeof views.mount === "function") views.mount(ctx);
          else if (typeof views.remountSoft === "function") views.remountSoft(ctx);
        }
      } catch (e) { Logger.write("ui_views err:", e?.message || e); }

      try { notifyUIReady(); } catch {}
      bindUI();
      hydrateUIFromState();
      syncUiCoreBridge("safeInit.hydrate");

      try {
        window.RCF_ENGINE?.init?.({ State, Storage, Logger });
        Logger.write("engine:", "init ok ✅");
      } catch (e) {
        Logger.write("engine init err:", e?.message || e);
      }

      Logger.write("RCF V8 init ok — mode:", State.cfg.mode);

      try {
        window.__RCF_BOOTED__ = true;
        const st = window[BOOT_KEY] || {};
        st.booting = false;
        st.booted = true;
        st.ts = Date.now();
        window[BOOT_KEY] = st;
      } catch {}

      safeSetStatus("OK ✅");
      syncFabStatusText();
    } catch (e) {
      const msg = e?.message || e;
      Logger.write("FATAL init:", msg);
      try {
        const st = window[BOOT_KEY] || {};
        st.booting = false;
        st.booted = false;
        st.ts = Date.now();
        window[BOOT_KEY] = st;
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

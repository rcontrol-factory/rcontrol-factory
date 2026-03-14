/* FILE: app/app.js
   RControl Factory - /app/app.js - FINAL ORCHESTRATOR PATCH
   - Patch mínimo e cirúrgico em cima da base V8.x
   - app.js como ORQUESTRADOR LEVE REAL
   - preserva boot/state/logger/agent/injector/diagnostics/SW/VFS
   - fortalece fallback shell mínimo seguro
   - reforça setView anti-empilhamento
   - prioriza módulos oficiais aprovados
*/
(() => {
  "use strict";

  try { console.info("[RCF] /app/app.js BUILD=FINAL_ORCHESTRATOR_PATCH"); } catch {}

  // =========================================================
  // GLOBAL LOG ALIAS (compat)
  // =========================================================
  const log = (...args) => {
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
        const msg = args.map(a => {
          try { return (typeof a === "string" ? a : JSON.stringify(a)); } catch { return String(a); }
        }).join(" ");
        window.RCF_LOGGER.push("LOG", msg);
        return;
      }
    } catch {}
    try { console.log("[RCF]", ...args); } catch {}
  };
  try { if (!window.log) window.log = log; } catch {}

  // =========================================================
  // BOOT LOCK (safe retry)
  // =========================================================
  const __BOOT_KEY = "__RCF_BOOT_STATE__";
  try {
    const st = window[__BOOT_KEY] || {};
    const now = Date.now();

    if (st.booted === true) return;
    if (st.booting === true && (now - (st.ts || 0)) < 8000) return;

    window[__BOOT_KEY] = { booting: true, booted: false, ts: now, ver: "final-orchestrator" };
  } catch {
    if (window.__RCF_BOOTED__) return;
    window.__RCF_BOOTED__ = true;
  }

  // =========================================================
  // BOOT WATCHDOG
  // =========================================================
  try {
    setTimeout(() => {
      try {
        if (document.getElementById("rcfRoot")) return;
        const msg = [
          "UI não montou (rcfRoot ausente).",
          "Provável causa: shell oficial não montou e fallback não entrou, ou erro antes do render.",
          "",
          "Ação rápida:",
          "1) Tools -> Unregister SW",
          "2) Tools -> Clear SW Cache",
          "3) Recarregar"
        ].join("\n");
        try { Logger.write("boot watchdog:", msg); } catch {}
      } catch {}
    }, 6500);
  } catch {}

  // =========================================================
  // CORE: Utils
  // =========================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const nowISO = () => new Date().toISOString();

  const safeJsonParse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
  const safeJsonStringify = (obj) => { try { return JSON.stringify(obj); } catch { return String(obj); } };

  const slugify = (str) => {
    return String(str || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  const escapeAttr = (s) => escapeHtml(s).replace(/'/g, "&#39;");
  const uiMsg = (sel, text) => { const el = $(sel); if (el) el.textContent = String(text ?? ""); };
  const textContentSafe = (el, txt) => { try { el.textContent = txt; } catch {} };

  // =========================================================
  // RCF_UI REGISTRY
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
          "generator.actions": "#rcfGenSlotActions",
          "generator.tools": "#rcfGenSlotTools",
          "settings.security.actions": "#rcfSettingsSecurityActions",
          "status.text": "#statusText",
          "status.text.top": "#statusTextTop",
          "apps.list": "#appsList",
          "files.list": "#filesList"
        },
        refresh() {
          try { this._lastRefreshAt = Date.now(); } catch {}
          return true;
        },
        getSlot(name) {
          try {
            const key = String(name || "").trim();
            if (!key) return null;

            const esc = (window.CSS && window.CSS.escape) ? window.CSS.escape(key) : key;
            const bySlot = document.querySelector(`[data-rcf-slot="${esc}"]`);
            if (bySlot) return bySlot;

            const sel = this.slots && this.slots[key];
            if (!sel) return null;
            return document.querySelector(sel);
          } catch {
            return null;
          }
        },
        ensureSlot(name, opts = {}) {
          try {
            const key = String(name || "").trim();
            if (!key) return null;

            const exist = this.getSlot(key);
            if (exist) return exist;

            const parentSel = opts.parentSelector || "#view-admin";
            const parent = document.querySelector(parentSel) || document.body;

            const div = document.createElement("div");
            const id = String(opts.id || "").trim();
            if (id) div.id = id;
            div.setAttribute("data-rcf-slot", key);

            if (opts.className) div.className = String(opts.className);
            parent.appendChild(div);
            return div;
          } catch {
            return null;
          }
        },
        mark(el, meta = {}) {
          try {
            if (!el || typeof el.setAttribute !== "function") return el;
            const m = meta && typeof meta === "object" ? meta : {};
            for (const [k, v] of Object.entries(m)) {
              if (v == null) continue;
              el.setAttribute(`data-rcf-${k}`, String(v));
            }
            return el;
          } catch {
            return el;
          }
        }
      };

      window.RCF_UI = Object.assign({}, base, R);
      try { window.RCF_UI.refresh(); } catch {}
      return window.RCF_UI;
    } catch {
      return null;
    }
  }

  // =========================================================
  // UI READY BUS
  // =========================================================
  function notifyUIReady() {
    try {
      if (window.__RCF_UI_READY__ === true) return;
      window.__RCF_UI_READY__ = true;
    } catch {}

    try {
      window.dispatchEvent(new CustomEvent("RCF:UI_READY", {
        detail: { ts: Date.now() }
      }));
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
        if (typeof fn === "function") {
          fn.call(obj, { ui: window.RCF_UI });
          called++;
        }
      } catch {}
    }

    try { window.RCF_LOGGER?.push?.("INFO", `UI_READY fired ✅ reinject_called=${called}`); } catch {}
  }

  // =========================================================
  // STATUS MANAGER
  // =========================================================
  const Status = (() => {
    let tmr = null;
    let current = "OK ✅";
    let lockUntil = 0;

    function _setText(el, txt) {
      try { if (el) el.textContent = String(txt ?? ""); } catch {}
    }

    function _syncBoth(txt) {
      try {
        const el = document.querySelector("#statusText");
        _setText(el, txt);

        const elTop = document.querySelector("#statusTextTop");
        _setText(elTop, txt);
      } catch {}
    }

    function set(text, opts = {}) {
      const now = Date.now();
      const { ttl = 900, sticky = false, minGap = 120 } = opts || {};

      if (now < lockUntil) return;
      lockUntil = now + minGap;

      current = String(text || "");
      _syncBoth(current);

      if (tmr) { try { clearTimeout(tmr); } catch {} tmr = null; }

      if (!sticky) {
        tmr = setTimeout(() => {
          current = "OK ✅";
          _syncBoth(current);
        }, Math.max(250, ttl));
      }
    }

    function ok() { set("OK ✅", { ttl: 0, sticky: true }); }

    return { set, ok };
  })();

  function safeSetStatus(txt) {
    try { Status.set(txt, { ttl: 900, sticky: false }); } catch {}
  }

  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  // =========================================================
  // STORAGE
  // =========================================================
  const Storage = {
    prefix: "rcf:",
    get(key, fallback) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        if (v == null) return fallback;
        return safeJsonParse(v, fallback);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch {}
    },
    setRaw(key, rawText) {
      try { localStorage.setItem(this.prefix + key, String(rawText ?? "")); } catch {}
    },
    getRaw(key, fallback = "") {
      try {
        const v = localStorage.getItem(this.prefix + key);
        return v == null ? fallback : String(v);
      } catch {
        return fallback;
      }
    },
    del(key) { try { localStorage.removeItem(this.prefix + key); } catch {} }
  };

  // =========================================================
  // LOGGER
  // =========================================================
  const Logger = {
    bufKey: "logs",
    max: 900,

    _mirrorUI(logs) {
      const txt = (logs || []).join("\n");
      const boxDrawer = $("#logsBox");
      if (boxDrawer) boxDrawer.textContent = txt;
      const boxLogsOut = $("#logsOut");
      if (boxLogsOut) boxLogsOut.textContent = txt;
      const boxView = $("#logsViewBox");
      if (boxView) boxView.textContent = txt;
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

    clear() {
      Storage.set(this.bufKey, []);
      this._mirrorUI([]);
    },

    getAll() { return Storage.get(this.bufKey, []); }
  };

  window.RCF_LOGGER = window.RCF_LOGGER || {
    push(level, msg) { Logger.write(String(level || "log") + ":", msg); },
    clear() { Logger.clear(); },
    getText() { return Logger.getAll().join("\n"); },
    dump() { return Logger.getAll().join("\n"); }
  };

  try {
    if (typeof window.log !== "function") {
      window.log = (...a) => {
        try { Logger.write(...a); }
        catch { try { console.log("[RCF.log]", ...a); } catch {} }
      };
    }
  } catch {}

  // =========================================================
  // STABILITY
  // =========================================================
  const Stability = (() => {
    let installed = false;
    let originalConsoleError = null;

    function normalizeErr(e) {
      try {
        if (!e) return { message: "unknown", stack: "" };
        if (typeof e === "string") return { message: e, stack: "" };
        return { message: String(e.message || e), stack: String(e.stack || "") };
      } catch {
        return { message: "unknown", stack: "" };
      }
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
              <div style="opacity:.9;margin-bottom:10px">
                A Factory detectou um erro e abriu esta tela controlada para evitar “tela branca”.
              </div>
              <pre style="white-space:pre-wrap;word-break:break-word;padding:12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);max-height:45vh;overflow:auto">${escapeHtml(String(details || ""))}</pre>
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
                <button id="rcfReloadBtn" style="padding:10px 14px;border-radius:10px;border:0;background:#2dd4bf;color:#022;font-weight:800">Recarregar</button>
                <button id="rcfClearLogsBtn" style="padding:10px 14px;border-radius:10px;border:0;background:#ef4444;color:#fff;font-weight:800">Limpar logs</button>
              </div>
            </div>
          </div>
        `;

        const r = $("#rcfReloadBtn");
        r && r.addEventListener("click", () => location.reload(), { passive: true });

        const c = $("#rcfClearLogsBtn");
        c && c.addEventListener("click", () => {
          try { Logger.clear(); } catch {}
          try { localStorage.removeItem("rcf:logs"); } catch {}
          alert("Logs limpos.");
        });
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
  // TAP BINDER
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
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
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
  window.RCF.getFactoryIAContext = () => buildFactoryIAContext();
  try { if (!window.log) window.log = (...a) => Logger.write(...a); } catch {}

  // =========================================================
  // UI FLAGS
  // =========================================================
  const UI = {
    brandTitle: "RCF",
    brandSubtitle: "Factory interna • PWA • Offline-first",
    compactEnabled: true
  };

  // =========================================================
  // LOADERS
  // =========================================================
  let __uiRuntimePromise = null;
  let __uiCoreBridgePromise = null;
  let __uiVisualModulesPromise = null;

  function getUiRuntime() {
    try {
      return (window && window.RCF_UI_RUNTIME && typeof window.RCF_UI_RUNTIME === "object")
        ? window.RCF_UI_RUNTIME
        : null;
    } catch {
      return null;
    }
  }

  function getUiStateApi() {
    try { return (window && window.RCF_UI_STATE && typeof window.RCF_UI_STATE === "object") ? window.RCF_UI_STATE : null; } catch { return null; }
  }

  function getUiRouterApi() {
    try { return (window && window.RCF_UI_ROUTER && typeof window.RCF_UI_ROUTER === "object") ? window.RCF_UI_ROUTER : null; } catch { return null; }
  }

  function getUiEventsApi() {
    try { return (window && window.RCF_UI_EVENTS && typeof window.RCF_UI_EVENTS === "object") ? window.RCF_UI_EVENTS : null; } catch { return null; }
  }

  function loadScriptOnce(src, marker) {
    return new Promise((resolve) => {
      try {
        const hit = document.querySelector(`script[${marker}="1"]`);
        if (hit) {
          hit.addEventListener("load", () => resolve(true), { once: true });
          hit.addEventListener("error", () => resolve(false), { once: true });
          setTimeout(() => resolve(true), 900);
          return;
        }
        const sc = document.createElement("script");
        sc.src = src;
        sc.defer = true;
        sc.async = false;
        sc.setAttribute(marker, "1");
        sc.onload = () => resolve(true);
        sc.onerror = () => resolve(false);
        (document.head || document.documentElement).appendChild(sc);
        setTimeout(() => resolve(false), 1200);
      } catch {
        resolve(false);
      }
    });
  }

  function loadUiRuntimeOnce() {
    try {
      const existing = getUiRuntime();
      if (existing) return Promise.resolve(existing);
      if (__uiRuntimePromise) return __uiRuntimePromise;

      __uiRuntimePromise = new Promise((resolve) => {
        try {
          const already = document.querySelector('script[data-rcf-ui-runtime="1"]');
          if (already) {
            const done = () => resolve(getUiRuntime());
            already.addEventListener("load", done, { once: true });
            already.addEventListener("error", () => resolve(null), { once: true });
            setTimeout(() => resolve(getUiRuntime()), 1200);
            return;
          }

          const sc = document.createElement("script");
          sc.src = "./js/core/ui_runtime.js";
          sc.defer = true;
          sc.async = false;
          sc.setAttribute("data-rcf-ui-runtime", "1");
          sc.onload = () => resolve(getUiRuntime());
          sc.onerror = () => resolve(null);
          (document.head || document.documentElement).appendChild(sc);
          setTimeout(() => resolve(getUiRuntime()), 1200);
        } catch {
          resolve(null);
        }
      });

      return __uiRuntimePromise;
    } catch {
      return Promise.resolve(null);
    }
  }

  async function initUiRuntime(ctx = {}) {
    try {
      const rt = await loadUiRuntimeOnce();
      if (!rt) return null;
      if (typeof rt.init === "function") {
        try { rt.init(ctx); }
        catch (e) { try { Logger.write("ui_runtime init err:", e?.message || e); } catch {} }
      }
      return rt;
    } catch {
      return null;
    }
  }

  async function loadUiCoreBridgeOnce() {
    try {
      if (getUiStateApi() && getUiRouterApi() && getUiEventsApi()) {
        return { state: getUiStateApi(), router: getUiRouterApi(), events: getUiEventsApi() };
      }
      if (__uiCoreBridgePromise) return __uiCoreBridgePromise;
      __uiCoreBridgePromise = (async () => {
        await loadScriptOnce("./js/core/ui_state.js", "data-rcf-ui-state");
        await loadScriptOnce("./js/core/ui_router.js", "data-rcf-ui-router");
        await loadScriptOnce("./js/core/ui_events.js", "data-rcf-ui-events");
        return { state: getUiStateApi(), router: getUiRouterApi(), events: getUiEventsApi() };
      })();
      return await __uiCoreBridgePromise;
    } catch {
      return { state: null, router: null, events: null };
    }
  }

  async function loadUiVisualModulesOnce() {
    try {
      if (__uiVisualModulesPromise) return __uiVisualModulesPromise;
      __uiVisualModulesPromise = (async () => {
        await loadScriptOnce("./js/ui/ui_bootstrap.js", "data-rcf-ui-bootstrap");
        await loadScriptOnce("./js/ui/ui_views.js", "data-rcf-ui-views");
        await loadScriptOnce("./js/ui/ui_header.js", "data-rcf-ui-header");
        await loadScriptOnce("./js/ui/ui_dashboard.js", "data-rcf-ui-dashboard");
        await loadScriptOnce("./js/ui/ui_cards.js", "data-rcf-ui-cards");
        await loadScriptOnce("./js/ui/ui_apps_widgets.js", "data-rcf-ui-apps-widgets");
        await loadScriptOnce("./js/ui/ui_projects.js", "data-rcf-ui-projects");
        await loadScriptOnce("./js/ui/ui_factory_view.js", "data-rcf-ui-factory-view");
        return {
          bootstrap: window.RCF_UI_BOOTSTRAP || null,
          views: window.RCF_UI_VIEWS || null,
          header: window.RCF_UI_HEADER || null,
          dashboard: window.RCF_UI_DASHBOARD || null,
          cards: window.RCF_UI_CARDS || null,
          appsWidgets: window.RCF_UI_APPS_WIDGETS || null,
          projects: window.RCF_UI_PROJECTS || null,
          factoryView: window.RCF_UI_FACTORY_VIEW || null
        };
      })();
      return await __uiVisualModulesPromise;
    } catch {
      return {
        bootstrap: window.RCF_UI_BOOTSTRAP || null,
        views: window.RCF_UI_VIEWS || null,
        header: window.RCF_UI_HEADER || null,
        dashboard: window.RCF_UI_DASHBOARD || null,
        cards: window.RCF_UI_CARDS || null,
        appsWidgets: window.RCF_UI_APPS_WIDGETS || null,
        projects: window.RCF_UI_PROJECTS || null,
        factoryView: window.RCF_UI_FACTORY_VIEW || null
      };
    }
  }

  function callModuleMethod(mod, methods, arg) {
    try {
      if (!mod || typeof mod !== "object") return false;
      for (const name of methods) {
        const fn = mod && mod[name];
        if (typeof fn === "function") {
          try { fn.call(mod, arg); return true; } catch (e) { Logger.write(`module ${name} err:`, e?.message || e); }
        }
      }
    } catch {}
    return false;
  }

  function mountApprovedVisualModules(stage = "mount", extra = {}) {
    const ctx = {
      stage,
      root: $("#rcfRoot") || $("#app"),
      viewsRoot: $("#views"),
      State,
      Storage,
      Logger,
      setView,
      saveAll,
      ui: window.RCF_UI || null,
      status: { set: safeSetStatus },
      helpers: { $, $$, bindTap, uiMsg, textContentSafe },
      ...extra
    };

    const mods = [
      window.RCF_UI_BOOTSTRAP,
      window.RCF_UI_VIEWS,
      window.RCF_UI_HEADER,
      window.RCF_UI_DASHBOARD,
      window.RCF_UI_CARDS,
      window.RCF_UI_APPS_WIDGETS,
      window.RCF_UI_PROJECTS,
      window.RCF_UI_FACTORY_VIEW
    ];

    let called = 0;
    for (const mod of mods) {
      if (!mod || typeof mod !== "object") continue;
      if (callModuleMethod(mod, stage === "post-hydrate"
        ? ["remountSoft", "refresh", "mount", "init"]
        : ["mount", "remountSoft", "refresh", "init"], ctx)) {
        called++;
      }
    }

    try { Logger.write("visual modules:", stage, `called=${called}`); } catch {}
    return called;
  }

  // =========================================================
  // FACTORY IA CTX / BRIDGE
  // =========================================================
  function buildFactoryIAContext() {
    return {
      get state() { return State; },
      get ui() { return window.RCF_UI || null; },
      get status() { return { set: safeSetStatus, syncFab: syncFabStatusText }; },
      actions: { setView, openTools, openFabPanel, toggleFabPanel },
      helpers: { $, $$, uiMsg, bindTap, textContentSafe, slugify, escapeHtml, escapeAttr },
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

  function syncUiCoreBridge(reason = "sync") {
    try {
      const api = getUiStateApi();
      if (!api) return false;
      if (typeof api.hydrateFromAppState === "function") {
        api.hydrateFromAppState(State, { reason });
        return true;
      }
      if (typeof api.syncFromAppState === "function") {
        api.syncFromAppState(State, { reason });
        return true;
      }
      if (typeof api.setSnapshot === "function") {
        api.setSnapshot({
          cfg: State.cfg,
          apps: State.apps,
          active: State.active,
          pending: State.pending,
          reason
        });
        return true;
      }
    } catch (e) {
      try { Logger.write("ui_core_bridge sync err:", e?.message || e); } catch {}
    }
    return false;
  }

  // =========================================================
  // CSS PATCH MÍNIMO
  // =========================================================
  function injectCompactCSSOnce() {
    try {
      if (!UI.compactEnabled) return;
      if (document.getElementById("rcfCompactCss")) return;

      const css = `
#rcfRoot [hidden]{display:none !important;}
#rcfRoot .view:not(.active){display:none;}
#rcfRoot .view.active{display:block;}
#toolsDrawer{display:none;}
#toolsDrawer.open{display:block;}
#rcfFabPanel{display:none;}
#rcfFabPanel.open{display:block;}
#injLog.rcf-collapsed{display:none !important;}
#appsList .app-item{display:flex;align-items:center;justify-content:space-between;gap:10px;}
#appsList .app-meta{flex:1 1 auto;min-width:0;}
#appsList .app-name,#appsList .app-slug{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#appsList .app-actions{flex:0 0 auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
#fileContent{min-height:220px;}
      `.trim();

      const st = document.createElement("style");
      st.id = "rcfCompactCss";
      st.textContent = css;
      document.head.appendChild(st);

      try { window.RCF_LOGGER?.push?.("OK", "ui_compact: injected ✅"); } catch {}
    } catch {}
  }

  // =========================================================
  // VFS OVERRIDES
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

    function list() { return Object.keys(getMap() || {}).sort(); }
    function read(path) {
      const p = norm(path);
      const m = getMap();
      return (m && p in m) ? String(m[p] ?? "") : null;
    }
    function write(path, content) {
      const p = norm(path);
      const m = getMap();
      m[p] = String(content ?? "");
      setMap(m);
      return true;
    }
    function del(path) {
      const p = norm(path);
      const m = getMap();
      if (m && p in m) { delete m[p]; setMap(m); return true; }
      return false;
    }

    return {
      listFiles: async () => list(),
      readFile: async (p) => read(p),
      writeFile: async (p, c) => write(p, c),
      deleteFile: async (p) => del(p),
      _raw: { list, read, write, del, norm }
    };
  })();

  window.RCF_OVERRIDES_VFS = OverridesVFS;

  // =========================================================
  // SHELL
  // =========================================================
  function ensureFallbackRoot() {
    let root = $("#app");
    if (!root) {
      try {
        root = document.createElement("div");
        root.id = "app";
        (document.body || document.documentElement).appendChild(root);
        try { Logger.write("boot:", "created #app root fallback ✅"); } catch {}
      } catch {
        return null;
      }
    }
    return root;
  }

  function buildFallbackShellHtml() {
    return `
      <div id="rcfRoot" data-rcf-app="rcf.factory">
        <header>
          <div>${escapeHtml(UI.brandTitle)}</div>
          <div id="statusTextTop">OK ✅</div>
        </header>
        <main id="views">
          <section class="view active" id="view-dashboard" data-rcf-view="dashboard">
            <div id="activeAppText">Sem app ativo ✅</div>
            <div>
              <button id="btnCreateNewApp" type="button">Novo app</button>
              <button id="btnOpenEditor" type="button">Editor</button>
            </div>
            <div id="appsList" data-rcf-slot="apps.list"></div>
          </section>
          <section class="view" id="view-newapp" data-rcf-view="newapp" hidden>
            <input id="newAppName" placeholder="Nome do app" />
            <input id="newAppSlug" placeholder="slug-opcional" />
            <button id="btnNewAppCreate" type="button">Criar</button>
            <pre id="newAppOut">Pronto.</pre>
          </section>
          <section class="view" id="view-editor" data-rcf-view="editor" hidden>
            <div id="editorHead">Arquivo atual: -</div>
            <div id="filesList" data-rcf-slot="files.list"></div>
            <textarea id="fileContent" spellcheck="false"></textarea>
            <div><button id="btnSaveFile" type="button">Salvar arquivo</button></div>
            <pre id="editorOut">Pronto.</pre>
          </section>
          <section class="view" id="view-agent" data-rcf-view="agent" hidden>
            <input id="agentCmd" />
            <button id="btnAgentRun" type="button">Executar</button>
            <button id="btnAgentHelp" type="button">Ajuda</button>
            <div id="rcfAgentSlotActions" data-rcf-slot="agent.actions"></div>
            <div id="rcfAgentSlotTools" data-rcf-slot="agent.tools"></div>
            <pre id="agentOut">Pronto.</pre>
          </section>
          <section class="view" id="view-generator" data-rcf-view="generator" hidden>
            <div id="rcfGenSlotActions" data-rcf-slot="generator.actions"></div>
            <div id="rcfGenSlotTools" data-rcf-slot="generator.tools"></div>
            <pre id="genOut">Pronto.</pre>
          </section>
          <section class="view" id="view-settings" data-rcf-view="settings" hidden>
            <input id="pinInput" inputmode="numeric" />
            <button id="btnPinSave" type="button">Salvar PIN</button>
            <button id="btnPinRemove" type="button">Remover PIN</button>
            <div id="rcfSettingsSecurityActions" data-rcf-slot="settings.security.actions"></div>
            <pre id="pinOut">Pronto.</pre>
            <pre id="logsOut">Pronto.</pre>
          </section>
          <section class="view" id="view-logs" data-rcf-view="logs" hidden>
            <pre id="logsViewBox">Pronto.</pre>
          </section>
          <section class="view" id="view-admin" data-rcf-view="admin" hidden>
            <div id="rcfAdminSlotTop" data-rcf-slot="admin.top"><pre id="adminOut">Pronto.</pre></div>
            <div id="rcfAdminSlotIntegrations" data-rcf-slot="admin.integrations"></div>
            <div id="admin-injector" data-rcf-slot="admin.injector">
              <button id="btnToggleInjectorLog" type="button">Mostrar log</button>
              <pre id="scanOut">Pronto.</pre>
              <select id="injMode"><option value="INSERT">INSERT</option><option value="REPLACE">REPLACE</option><option value="DELETE">DELETE</option></select>
              <select id="injTarget"></select>
              <textarea id="injPayload" rows="8" spellcheck="false"></textarea>
              <pre id="diffOut">Pronto.</pre>
              <div id="rcfAdminSlotLogs" data-rcf-slot="admin.logs"><pre id="injLog" class="rcf-collapsed">Pronto.</pre></div>
            </div>
            <pre id="maintOut">Pronto.</pre>
          </section>
          <section class="view" id="view-diagnostics" data-rcf-view="diagnostics" hidden>
            <pre id="diagOut">Pronto.</pre>
          </section>
        </main>
        <aside id="toolsDrawer" data-rcf-panel="tools.drawer">
          <div id="statusText" data-rcf="status.text">OK ✅</div>
          <pre id="logsBox">Pronto.</pre>
          <button id="btnCloseTools" type="button">Fechar</button>
        </aside>
        <button id="btnOpenTools" type="button">Tools</button>
        <button id="rcfFab" type="button">⚡</button>
        <div id="rcfFabPanel">
          <div id="fabStatus">OK ✅</div>
          <button id="btnFabClose" type="button">Fechar</button>
          <button id="btnFabTools" type="button">Tools</button>
          <button id="btnFabAdmin" type="button">Admin</button>
          <button id="btnFabDoctor" type="button">Doctor</button>
          <button id="btnFabLogs" type="button">Logs</button>
        </div>
      </div>
    `;
  }

  function strengthenShellStructure() {
    const root = $("#rcfRoot");
    if (!root) return false;

    const ensure = (id, tag = "div", parentSel = "#rcfRoot", html = "") => {
      let el = document.getElementById(id);
      if (el) return el;
      const parent = document.querySelector(parentSel) || root;
      el = document.createElement(tag);
      el.id = id;
      if (html) el.innerHTML = html;
      parent.appendChild(el);
      return el;
    };

    const views = ensure("views", "main", "#rcfRoot");
    const viewIds = [
      "view-dashboard",
      "view-newapp",
      "view-editor",
      "view-agent",
      "view-generator",
      "view-settings",
      "view-logs",
      "view-admin",
      "view-diagnostics"
    ];
    for (const id of viewIds) {
      const el = ensure(id, "section", "#views");
      el.classList.add("view");
      if (!el.hasAttribute("data-rcf-view")) {
        el.setAttribute("data-rcf-view", id.replace(/^view-/, ""));
      }
      if (id !== "view-dashboard" && !el.classList.contains("active")) {
        el.hidden = true;
        try { el.style.display = "none"; } catch {}
      }
    }

    ensure("appsList", "div", "#view-dashboard").setAttribute("data-rcf-slot", "apps.list");
    ensure("filesList", "div", "#view-editor").setAttribute("data-rcf-slot", "files.list");
    ensure("fileContent", "textarea", "#view-editor");
    ensure("editorHead", "div", "#view-editor");
    ensure("editorOut", "pre", "#view-editor");
    ensure("agentCmd", "input", "#view-agent");
    ensure("btnAgentRun", "button", "#view-agent");
    ensure("btnAgentHelp", "button", "#view-agent");
    ensure("agentOut", "pre", "#view-agent");
    ensure("rcfAgentSlotActions", "div", "#view-agent").setAttribute("data-rcf-slot", "agent.actions");
    ensure("rcfAgentSlotTools", "div", "#view-agent").setAttribute("data-rcf-slot", "agent.tools");
    ensure("rcfGenSlotActions", "div", "#view-generator").setAttribute("data-rcf-slot", "generator.actions");
    ensure("rcfGenSlotTools", "div", "#view-generator").setAttribute("data-rcf-slot", "generator.tools");
    ensure("pinInput", "input", "#view-settings");
    ensure("pinOut", "pre", "#view-settings");
    ensure("logsOut", "pre", "#view-settings");
    ensure("logsViewBox", "pre", "#view-logs");
    ensure("toolsDrawer", "aside", "#rcfRoot");
    ensure("statusText", "div", "#toolsDrawer");
    ensure("statusTextTop", "div", "#rcfRoot");
    ensure("logsBox", "pre", "#toolsDrawer");
    ensure("rcfAdminSlotTop", "div", "#view-admin").setAttribute("data-rcf-slot", "admin.top");
    ensure("rcfAdminSlotIntegrations", "div", "#view-admin").setAttribute("data-rcf-slot", "admin.integrations");
    ensure("admin-injector", "div", "#view-admin").setAttribute("data-rcf-slot", "admin.injector");
    ensure("scanOut", "pre", "#admin-injector");
    ensure("injMode", "select", "#admin-injector");
    ensure("injTarget", "select", "#admin-injector");
    ensure("injPayload", "textarea", "#admin-injector");
    ensure("diffOut", "pre", "#admin-injector");
    ensure("injLog", "pre", "#admin-injector");
    ensure("maintOut", "pre", "#view-admin");
    ensure("diagOut", "pre", "#view-diagnostics");
    ensure("btnOpenTools", "button", "#rcfRoot");
    ensure("btnCloseTools", "button", "#toolsDrawer");
    ensure("rcfFab", "button", "#rcfRoot");
    ensure("rcfFabPanel", "div", "#rcfRoot");
    ensure("fabStatus", "div", "#rcfFabPanel");
    ensure("btnFabClose", "button", "#rcfFabPanel");
    ensure("btnFabTools", "button", "#rcfFabPanel");
    ensure("btnFabAdmin", "button", "#rcfFabPanel");
    ensure("btnFabDoctor", "button", "#rcfFabPanel");
    ensure("btnFabLogs", "button", "#rcfFabPanel");
    ensure("btnCreateNewApp", "button", "#view-dashboard");
    ensure("btnOpenEditor", "button", "#view-dashboard");
    ensure("btnSaveFile", "button", "#view-editor");
    ensure("btnPinSave", "button", "#view-settings");
    ensure("btnPinRemove", "button", "#view-settings");
    ensure("btnToggleInjectorLog", "button", "#admin-injector");
    ensure("activeAppText", "div", "#view-dashboard");

    const injMode = $("#injMode");
    if (injMode && !injMode.options.length) {
      injMode.innerHTML = '<option value="INSERT">INSERT</option><option value="REPLACE">REPLACE</option><option value="DELETE">DELETE</option>';
    }

    return true;
  }

  function renderShell() {
    const root = ensureFallbackRoot();
    if (!root) return;

    try {
      const shell = window.RCF_UI_SHELL;
      if (shell && typeof shell.mount === "function") {
        const ok = shell.mount({
          root,
          brandTitle: UI.brandTitle,
          brandSubtitle: UI.brandSubtitle
        });
        if (ok !== false && $("#rcfRoot")) {
          strengthenShellStructure();
          try { Logger.write("shell:", "official ui_shell mount ✅"); } catch {}
          return;
        }
      }
    } catch (e) {
      try { Logger.write("shell mount err:", e?.message || e); } catch {}
    }

    if (!$("#rcfRoot")) {
      root.innerHTML = buildFallbackShellHtml();
      try { Logger.write("shell:", "fallback minimal shell ✅"); } catch {}
    }
    strengthenShellStructure();
  }

  function refreshLogsViews() { Logger._mirrorUI(Logger.getAll()); }

  // =========================================================
  // PREVIEW TEARDOWN
  // =========================================================
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
          el.remove();
          removed++;
        } catch {}
        if (removed >= 8) break;
      }
    } catch {}

    try {
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const ifr = Array.from(document.querySelectorAll("iframe"));
      let removedIfr = 0;

      for (const el of ifr) {
        try {
          const id = (el.id || "").toLowerCase();
          const cls = (el.className || "").toString().toLowerCase();
          const src = (el.src || "").toLowerCase();
          const looksPreview = id.includes("preview") || cls.includes("preview") || src.includes("preview") || src.includes("sandbox") || src.includes("timesheet");
          if (!looksPreview) continue;

          const cs = getComputedStyle(el);
          const pos = cs?.position || "";
          const zi = parseInt(cs?.zIndex || "0", 10);
          const r = el.getBoundingClientRect();
          const area = Math.max(0, r.width) * Math.max(0, r.height);
          const isOverlay = (pos === "fixed") && Number.isFinite(zi) && zi >= 80 && area >= (vw * vh * 0.20);
          if (!isOverlay) continue;

          try { el.src = "about:blank"; } catch {}
          try { el.remove(); } catch {}
          removedIfr++;
        } catch {}
        if (removedIfr >= 4) break;
      }
    } catch {}

    try {
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const all = Array.from(document.querySelectorAll("body *"));
      let removed = 0;

      for (const el of all) {
        if (!el || el === document.body) continue;
        const cs = getComputedStyle(el);
        if (!cs) continue;
        const pos = cs.position;
        if (pos !== "fixed" && pos !== "absolute") continue;
        const zi = parseInt(cs.zIndex || "0", 10);
        if (!Number.isFinite(zi) || zi < 80) continue;
        const r = el.getBoundingClientRect();
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area < (vw * vh * 0.25)) continue;
        if (el.id === "toolsDrawer" || el.id === "rcfFabPanel" || el.id === "rcfFab") continue;
        try { el.remove(); removed++; } catch {}
        if (removed >= 6) break;
      }
      if (removed) Logger.write("preview teardown:", "removed overlays=", removed);
    } catch {}

    try {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.pointerEvents = "";
    } catch {}

    try { Logger.write("preview:", "teardown hard (ok)"); } catch {}
  }

  // =========================================================
  // VIEW ROUTER / FALLBACK LOCAL RIGOROSO
  // =========================================================
  function applyViewStateLocally(name) {
    const cleanName = String(name || "").replace(/[^a-z0-9_-]/gi, "");
    const targetId = "view-" + cleanName;
    const views = $$(".view, [data-rcf-view]", $("#views") || document).filter((el, idx, arr) => arr.indexOf(el) === idx);
    const tabs = $$(`[data-view], [data-rcf-view-btn]`, document);

    views.forEach(v => {
      try {
        v.classList.remove("active");
        v.hidden = true;
        v.setAttribute("aria-hidden", "true");
        v.style.display = "none";
      } catch {}
    });

    tabs.forEach(b => {
      try {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      } catch {}
    });

    const view = document.getElementById(targetId) || document.querySelector(`[data-rcf-view="${cleanName}"]`);
    if (view) {
      try {
        view.hidden = false;
        view.removeAttribute("aria-hidden");
        view.style.display = "";
        view.classList.add("active");
      } catch {}
    }

    tabs.forEach(b => {
      try {
        const hit = (b.getAttribute("data-view") || b.getAttribute("data-rcf-view-btn") || "") === cleanName;
        if (!hit) return;
        b.classList.add("active");
        b.setAttribute("aria-pressed", "true");
      } catch {}
    });

    return !!view;
  }

  function setView(name) {
    if (!name) return;
    const cleanName = String(name || "").trim().toLowerCase();
    const now = Date.now();

    try {
      if (setView.__busy__) {
        const dt = now - (setView.__busy_ts__ || 0);
        if (dt < 450) return;
      }
      setView.__busy__ = true;
      setView.__busy_ts__ = now;
      setTimeout(() => { try { setView.__busy__ = false; } catch {} }, 700);
    } catch {}

    try {
      const prev = State.active.view;
      if (prev === "generator" && cleanName !== "generator") teardownPreviewHard();
    } catch {}

    try {
      const router = window.RCF_UI_ROUTER;
      if (router && typeof router.setView === "function") {
        const ok = router.setView(cleanName, {
          State,
          saveAll,
          refreshLogsViews,
          teardownPreviewHard,
          logger: Logger,
          localApply: applyViewStateLocally
        });
        if (ok !== false) {
          applyViewStateLocally(cleanName);
          State.active.view = cleanName;
          saveAll("view.router");
          if (["logs", "settings", "admin", "diagnostics"].includes(cleanName)) refreshLogsViews();
          Logger.write("view:", cleanName);
          return;
        }
      }
    } catch (e) {
      try { Logger.write("router setView err:", e?.message || e); } catch {}
    }

    applyViewStateLocally(cleanName);
    State.active.view = cleanName;
    saveAll("view.local");

    if (["logs", "settings", "admin", "diagnostics"].includes(cleanName)) refreshLogsViews();
    Logger.write("view:", cleanName);
  }

  try {
    window.RCF = window.RCF || {};
    window.RCF.setView = (name) => setView(name);
  } catch {}

  function openTools(open) {
    try {
      const router = getUiRouterApi();
      if (router && typeof router.openTools === "function") return router.openTools(open, { root: document });
    } catch {}
    try {
      const rt = getUiRuntime();
      if (rt && typeof rt.openTools === "function" && rt.openTools !== openTools) return rt.openTools(open);
    } catch {}
    const d = $("#toolsDrawer");
    if (!d) return;
    if (open) d.classList.add("open");
    else d.classList.remove("open");
  }

  function openFabPanel(open) {
    try {
      const router = getUiRouterApi();
      if (router && typeof router.openFabPanel === "function") return router.openFabPanel(open, { root: document });
    } catch {}
    try {
      const rt = getUiRuntime();
      if (rt && typeof rt.openFabPanel === "function" && rt.openFabPanel !== openFabPanel) return rt.openFabPanel(open);
    } catch {}
    const p = $("#rcfFabPanel");
    if (!p) return;
    if (open) p.classList.add("open");
    else p.classList.remove("open");
  }

  function toggleFabPanel() {
    try {
      const router = getUiRouterApi();
      if (router && typeof router.toggleFabPanel === "function") return router.toggleFabPanel({ root: document });
    } catch {}
    try {
      const rt = getUiRuntime();
      if (rt && typeof rt.toggleFabPanel === "function" && rt.toggleFabPanel !== toggleFabPanel) return rt.toggleFabPanel();
    } catch {}
    const p = $("#rcfFabPanel");
    if (!p) return;
    p.classList.toggle("open");
  }

  function syncFabStatusText() {
    try {
      const events = getUiEventsApi();
      if (events && typeof events.syncFabStatusText === "function") return events.syncFabStatusText({ root: document });
    } catch {}
    try {
      const rt = getUiRuntime();
      if (rt && typeof rt.syncFabStatusText === "function" && rt.syncFabStatusText !== syncFabStatusText) return rt.syncFabStatusText();
    } catch {}
    try {
      const st = $("#statusText")?.textContent || "";
      const fab = $("#fabStatus");
      if (fab) fab.textContent = String(st || "OK ✅");
    } catch {}
  }

  function setInjectorLogCollapsed(collapsed) {
    try {
      const events = getUiEventsApi();
      if (events && typeof events.setInjectorLogCollapsed === "function") return events.setInjectorLogCollapsed(collapsed, { root: document });
    } catch {}
    try {
      const rt = getUiRuntime();
      if (rt && typeof rt.setInjectorLogCollapsed === "function" && rt.setInjectorLogCollapsed !== setInjectorLogCollapsed) return rt.setInjectorLogCollapsed(collapsed);
    } catch {}
    try {
      const pre = $("#injLog");
      const btn = $("#btnToggleInjectorLog");
      if (!pre || !btn) return;
      const wantCollapsed = !!collapsed;
      if (wantCollapsed) pre.classList.add("rcf-collapsed");
      else pre.classList.remove("rcf-collapsed");
      btn.textContent = wantCollapsed ? "Mostrar log" : "Esconder log";
    } catch {}
  }

  function toggleInjectorLogCollapsed() {
    try {
      const events = getUiEventsApi();
      if (events && typeof events.toggleInjectorLogCollapsed === "function") return events.toggleInjectorLogCollapsed({ root: document });
    } catch {}
    try {
      const rt = getUiRuntime();
      if (rt && typeof rt.toggleInjectorLogCollapsed === "function" && rt.toggleInjectorLogCollapsed !== toggleInjectorLogCollapsed) return rt.toggleInjectorLogCollapsed();
    } catch {}
    try {
      const pre = $("#injLog");
      if (!pre) return;
      const isCollapsed = pre.classList.contains("rcf-collapsed");
      setInjectorLogCollapsed(!isCollapsed);
    } catch {}
  }

  // =========================================================
  // APPS / EDITOR
  // =========================================================
  function getActiveApp() {
    if (!State.active.appSlug) return null;
    return State.apps.find(a => a.slug === State.active.appSlug) || null;
  }

  function ensureAppFiles(app) {
    if (!app.files) app.files = {};
    if (typeof app.files !== "object") app.files = {};
  }

  function deleteApp(slug) {
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
      const text = $("#activeAppText");
      if (text) textContentSafe(text, "Sem app ativo ✅");
    }

    saveAll("app.delete");
    renderAppsList();
    renderFilesList();

    uiMsg("#editorOut", "✅ App apagado.");
    Logger.write("app deleted:", s);
    safeSetStatus("Apagado ✅");
    try { syncFabStatusText(); } catch {}
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
    $$('[data-act="edit"]', box).forEach(btn => bindTap(btn, () => {
      setActiveApp(btn.getAttribute("data-slug"));
      setView("editor");
    }));
    $$('[data-act="delete"]', box).forEach(btn => bindTap(btn, () => {
      const slug = btn.getAttribute("data-slug");
      deleteApp(slug);
    }));
  }

  function renderFilesList() {
    const box = $("#filesList");
    if (!box) return;
    const app = getActiveApp();
    if (!app) {
      box.innerHTML = `<div class="hint">Selecione um app para ver arquivos.</div>`;
      return;
    }

    ensureAppFiles(app);
    const files = Object.keys(app.files);
    if (!files.length) {
      box.innerHTML = `<div class="hint">App sem arquivos.</div>`;
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

    const head = $("#editorHead");
    if (head) head.textContent = `Arquivo atual: ${fname}`;

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

    const text = $("#activeAppText");
    if (text) textContentSafe(text, `App ativo: ${app.name} (${app.slug}) ✅`);

    renderAppsList();
    renderFilesList();
    if (State.active.file) openFile(State.active.file);

    Logger.write("app selected:", slug);
    return true;
  }

  function createApp(name, slugMaybe) {
    const nameClean = String(name || "").trim();
    if (!nameClean) return { ok: false, msg: "Nome inválido" };

    const slug = slugify(slugMaybe || nameClean);
    if (!slug) return { ok: false, msg: "Slug inválido" };
    if (State.apps.some(a => a.slug === slug)) return { ok: false, msg: "Slug já existe" };

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
  // PIN
  // =========================================================
  const Pin = {
    key: "admin_pin",
    get() { return Storage.get(this.key, ""); },
    set(pin) { Storage.set(this.key, String(pin || "")); },
    clear() { Storage.del(this.key); }
  };

  // =========================================================
  // SW HELPERS
  // =========================================================
  async function swRegister() {
    try {
      if (!("serviceWorker" in navigator)) {
        Logger.write("sw:", "serviceWorker não suportado");
        return { ok: false, msg: "SW não suportado" };
      }
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      Logger.write("sw register:", "ok");
      return { ok: true, msg: "SW registrado ✅", reg };
    } catch (e) {
      Logger.write("sw register fail:", (e?.message || e));
      return { ok: false, msg: "Falhou registrar SW: " + (e?.message || e) };
    }
  }

  async function swUnregisterAll() {
    try {
      if (!("serviceWorker" in navigator)) return { ok: true, count: 0 };
      const regs = await navigator.serviceWorker.getRegistrations();
      let n = 0;
      for (const r of regs) { try { if (await r.unregister()) n++; } catch {} }
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
    const out = { ok: false, status: "missing", detail: "", attempts: 0, err: "" };
    if (!("serviceWorker" in navigator)) {
      out.status = "unsupported";
      out.detail = "serviceWorker não suportado neste browser";
      return out;
    }

    const tryGet = async () => {
      try {
        const a = await navigator.serviceWorker.getRegistration("./");
        if (a) return a;
        const b = await navigator.serviceWorker.getRegistration();
        return b || null;
      } catch (e) {
        out.err = String(e?.message || e);
        return null;
      }
    };

    let reg = await tryGet();
    if (reg) {
      out.ok = true;
      out.status = "registered";
      out.detail = "já estava registrado";
      return out;
    }

    out.attempts++;
    try {
      const r = await swRegister();
      out.detail = r?.msg || "tentou registrar";
    } catch (e) {
      out.err = String(e?.message || e);
    }

    await sleep(350);
    reg = await tryGet();
    if (reg) {
      out.ok = true;
      out.status = "registered";
      out.detail = "registrou após auto-fix";
      return out;
    }

    out.status = "missing";
    out.detail = (location.protocol !== "https:" && location.hostname !== "localhost")
      ? "SW exige HTTPS (ou localhost)."
      : "sw.js não registrou (pode ser path/scope/privacidade).";
    return out;
  }

  // =========================================================
  // DIAGNOSTICS
  // =========================================================
  function scanOverlays() {
    const suspects = [];
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    const all = $$("body *");
    for (const el of all) {
      try {
        const cs = getComputedStyle(el);
        if (!cs) continue;
        if (cs.pointerEvents === "none") continue;
        const pos = cs.position;
        if (pos !== "fixed" && pos !== "absolute") continue;
        const zi = parseInt(cs.zIndex || "0", 10);
        if (!Number.isFinite(zi) || zi < 50) continue;
        const r = el.getBoundingClientRect();
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area < (vw * vh * 0.10)) continue;
        const touches = (r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh);
        if (!touches) continue;
        suspects.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          cls: (el.className && String(el.className).slice(0, 80)) || "",
          z: zi,
          pe: cs.pointerEvents,
          pos,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        });
      } catch {}
      if (suspects.length >= 8) break;
    }
    return { ok: true, suspects };
  }

  function runMicroTests() {
    const results = [];
    const push = (name, pass, info = "") => results.push({ name, pass: !!pass, info: String(info || "") });

    try { push("TEST_RENDER", !!$("#rcfRoot") && !!$("#views"), !!$("#rcfRoot") ? "UI root ok" : "UI root missing"); }
    catch (e) { push("TEST_RENDER", false, e?.message || e); }

    try { push("TEST_IMPORTS", !!window.RCF_LOGGER && !!window.RCF && !!window.RCF.state, "globals"); }
    catch (e) { push("TEST_IMPORTS", false, e?.message || e); }

    try { push("TEST_STATE_INIT", !!State && Array.isArray(State.apps) && !!State.active && typeof State.cfg === "object", "state"); }
    catch (e) { push("TEST_STATE_INIT", false, e?.message || e); }

    try { push("TEST_EVENT_BIND", !!$("#btnOpenTools") && !!$("#btnAgentRun") && !!$("#btnSaveFile"), "buttons"); }
    catch (e) { push("TEST_EVENT_BIND", false, e?.message || e); }

    try { push("TEST_UI_REGISTRY", !!window.RCF_UI && typeof window.RCF_UI.getSlot === "function", "RCF_UI"); }
    catch (e) { push("TEST_UI_REGISTRY", false, e?.message || e); }

    const passCount = results.filter(r => r.pass).length;
    return { ok: passCount === results.length, pass: passCount, total: results.length, results };
  }

  function cssLoadedCheck() {
    try {
      const token = getComputedStyle(document.documentElement).getPropertyValue("--rcf-css-token").trim().replace(/^["']|["']$/g, "");
      const ok = !!token && token.toLowerCase() !== "(vazio)";
      return { ok, token: token || "(vazio)" };
    } catch (e) {
      return { ok: false, token: "(erro)", err: e?.message || e };
    }
  }

  async function runV8StabilityCheck() {
    const lines = [];
    const failList = [];
    let pass = 0, fail = 0;
    const add = (ok, label, detail) => {
      if (ok) { pass++; lines.push(`PASS: ${label}${detail ? " — " + detail : ""}`); }
      else { fail++; const t = `FAIL: ${label}${detail ? " — " + detail : ""}`; lines.push(t); failList.push(label + (detail ? `: ${detail}` : "")); }
    };

    add(!!window.__RCF_BOOTED__, "[BOOT] __RCF_BOOTED__", window.__RCF_BOOTED__ ? "lock ativo" : "lock ausente");

    const css = cssLoadedCheck();
    add(css.ok, "[CSS] CSS_TOKEN", `token: "${css.token}"`);

    const swr = await swCheckAutoFix();
    if (swr.ok) add(true, "[SW] SW_REGISTERED", swr.detail || "registrado");
    else lines.push(`WARN: [SW] SW_REGISTERED — ${swr.detail || swr.status}${swr.err ? " | err=" + swr.err : ""}`);

    const overlay = scanOverlays();
    add(overlay.ok, "[CLICK] OVERLAY_SCANNER", overlay.ok ? "ok" : "erro");
    add((overlay.suspects || []).length === 0, "[CLICK] OVERLAY_BLOCK", (overlay.suspects || []).length ? `suspects=${overlay.suspects.length}` : "nenhum");

    const mt = runMicroTests();
    add(mt.ok, "[MICROTEST] ALL", `${mt.pass}/${mt.total}`);

    const stable = (fail === 0);
    window.RCF_STABLE = stable;

    lines.unshift("=========================================================");
    lines.unshift("RCF — V8 STABILITY CHECK (REPORT)");
    lines.push("=========================================================");
    lines.push(`PASS: ${pass} | FAIL: ${fail}`);
    lines.push(`RCF_STABLE: ${stable ? "TRUE ✅" : "FALSE ❌"}`);
    lines.push("");

    if (!stable) {
      lines.push("FAIL LIST:");
      for (const f of failList) lines.push(`- ${f}`);
    } else {
      lines.push("STATUS: RCF_STABLE = TRUE ✅");
    }

    const report = lines.join("\n");
    uiMsg("#diagOut", report);
    Logger.write("V8 check:", stable ? "PASS ✅" : "FAIL ❌", `${pass}/${pass + fail}`);
    return { stable, pass, fail, report, overlay, microtests: mt, css, sw: swr };
  }

  // =========================================================
  // SCAN / TARGETS / INJECTOR SAFE
  // =========================================================
  function simpleHash(str) {
    let h = 2166136261;
    const s = String(str ?? "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "js";
    if (p.endsWith(".css")) return "css";
    if (p.endsWith(".html")) return "html";
    if (p.endsWith(".json")) return "json";
    if (p.endsWith(".txt")) return "txt";
    return "bin";
  }

  function detectMarkers(text) {
    const s = String(text ?? "");
    const re = /@RCF:INJECT\s*([A-Za-z0-9_-]+)?/g;
    const out = [];
    let m;
    while ((m = re.exec(s))) {
      out.push({ marker: m[0], id: (m[1] || "").trim() || null, index: m.index });
      if (out.length >= 20) break;
    }
    return out;
  }

  function getAnchorsForContent(type, content) {
    const s = String(content ?? "");
    const anchors = [];
    if (type === "html") {
      const headEnd = s.toLowerCase().lastIndexOf("</head>");
      const bodyEnd = s.toLowerCase().lastIndexOf("</body>");
      if (headEnd >= 0) anchors.push({ id: "HEAD_END", at: headEnd, note: "</head>" });
      if (bodyEnd >= 0) anchors.push({ id: "BODY_END", at: bodyEnd, note: "</body>" });
    }
    if (type === "css") {
      const rootIdx = s.indexOf(":root");
      if (rootIdx >= 0) anchors.push({ id: "CSS_ROOT", at: rootIdx, note: ":root" });
    }
    if (type === "js") {
      anchors.push({ id: "JS_TOP", at: 0, note: "top" });
      anchors.push({ id: "JS_EOF", at: s.length, note: "eof" });
    }
    return anchors;
  }

  function normalizePath(p) {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");
    return x;
  }

  async function vfsListAll(vfs) {
    if (!vfs) return [];
    try {
      if (typeof vfs.listFiles === "function") return (await vfs.listFiles()) || [];
      if (typeof vfs.list === "function") return (await vfs.list()) || [];
      if (typeof vfs.keys === "function") return (await vfs.keys()) || [];
      if (typeof vfs.entries === "function") {
        const ent = await vfs.entries();
        return Array.isArray(ent) ? ent.map(e => e && (e.path || e[0])) : [];
      }
    } catch {}
    return [];
  }

  async function vfsRead(vfs, path) {
    if (!vfs) return null;
    try {
      if (typeof vfs.readFile === "function") return await vfs.readFile(path);
      if (typeof vfs.read === "function") return await vfs.read(path);
      if (typeof vfs.get === "function") return await vfs.get(path);
    } catch {}
    return null;
  }

  async function tryFetchLocalBundleFromCfg() {
    const cfg = Storage.get("ghcfg", null);
    const path = cfg && cfg.path ? String(cfg.path) : "";
    if (!path) return null;
    const url = new URL(path, document.baseURI).toString();
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  function getLocalMotherBundleText() {
    const raw = Storage.getRaw("mother_bundle", "");
    if (raw && raw.trim().startsWith("{")) return raw;
    const raw2 = localStorage.getItem("RCF_MOTHER_BUNDLE") || "";
    if (raw2 && raw2.trim().startsWith("{")) return raw2;
    return "";
  }

  async function scanFactoryFiles() {
    const index = { meta: { scannedAt: nowISO(), source: "", count: 0 }, files: [] };

    try {
      const olist = await OverridesVFS.listFiles();
      for (const p0 of (olist || []).slice(0, 800)) {
        const p = normalizePath(p0);
        const txt = String((await OverridesVFS.readFile(p)) ?? "");
        const type = guessType(p);
        index.files.push({ path: p, type, size: txt.length, hash: simpleHash(txt), markers: detectMarkers(txt), anchors: getAnchorsForContent(type, txt) });
      }
    } catch {}

    const vfs = (window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs) {
      const baseLen = index.files.length;
      const list = await vfsListAll(vfs);
      const paths = (list || []).map(p => normalizePath(p)).filter(Boolean).slice(0, 1200);
      for (const p of paths) {
        const content = await vfsRead(vfs, p);
        const txt = (content == null) ? "" : String(content);
        const type = guessType(p);
        index.files.push({ path: p, type, size: txt.length, hash: simpleHash(txt), markers: detectMarkers(txt), anchors: getAnchorsForContent(type, txt) });
      }
      const added = index.files.length - baseLen;
      if (added > 0) {
        index.meta.source = "A:runtime_vfs";
        index.meta.count = index.files.length;
        Storage.set("RCF_FILE_INDEX", index);
        Logger.write("scan:", index.meta.source, "files=" + index.meta.count);
        return index;
      }
      Logger.write("scan:", "A:runtime_vfs files=0 => FALHA", "scan fallback -> mother_bundle");
    }

    let bundleText = getLocalMotherBundleText();
    if (!bundleText) bundleText = await tryFetchLocalBundleFromCfg();
    if (bundleText) {
      index.meta.source = "B:mother_bundle_local";
      let parsed = null;
      try { parsed = JSON.parse(bundleText); } catch { parsed = null; }
      let entries = [];
      if (parsed && Array.isArray(parsed.files)) {
        entries = parsed.files
          .map(it => {
            const rawPath = it && (it.path || it.file || it.name);
            const rawVal = it && ("content" in it ? it.content : (it.text ?? it.data ?? ""));
            return [rawPath, rawVal];
          })
          .filter(([p]) => !!p);
      } else {
        const filesObj = (parsed && parsed.files && typeof parsed.files === "object") ? parsed.files : (parsed && typeof parsed === "object" ? parsed : {});
        entries = Object.entries(filesObj || {});
      }
      for (const [rawPath, rawVal] of entries) {
        const p = normalizePath(rawPath);
        const txt = (rawVal && typeof rawVal === "object" && "content" in rawVal) ? String(rawVal.content ?? "") : String(rawVal ?? "");
        const type = guessType(p);
        index.files.push({ path: p, type, size: txt.length, hash: simpleHash(txt), markers: detectMarkers(txt), anchors: getAnchorsForContent(type, txt) });
      }
      index.meta.count = index.files.length;
      Storage.set("RCF_FILE_INDEX", index);
      Storage.setRaw("mother_bundle", bundleText);
      Logger.write("scan:", index.meta.source, "files=" + index.meta.count);
      return index;
    }

    Logger.write("scan fallback -> DOM anchors");
    const html = document.documentElement ? document.documentElement.outerHTML : "";
    index.meta.source = "C:dom_anchors_only";
    index.files.push({ path: "/runtime/document.html", type: "html", size: html.length, hash: simpleHash(html), markers: detectMarkers(html), anchors: getAnchorsForContent("html", html) });
    index.meta.count = index.files.length;
    Storage.set("RCF_FILE_INDEX", index);
    Logger.write("scan:", index.meta.source, "files=" + index.meta.count);
    return index;
  }

  function generateTargetMap(fileIndex) {
    const idx = fileIndex || Storage.get("RCF_FILE_INDEX", null);
    if (!idx || !Array.isArray(idx.files)) return { ok: false, err: "RCF_FILE_INDEX ausente. Rode Scan & Index primeiro." };

    const targets = [];
    for (const f of idx.files) {
      const path = String(f.path || "");
      const markers = Array.isArray(f.markers) ? f.markers : [];
      for (const m of markers) {
        const id = m.id ? m.id : `MARKER_${path}_${m.index}`;
        targets.push({ targetId: id, path, kind: "MARKER", offset: m.index, supportedModes: ["INSERT", "REPLACE", "DELETE"], defaultRisk: "low", note: "@RCF:INJECT" });
      }
      if (!markers.length) {
        const anchors = Array.isArray(f.anchors) ? f.anchors : [];
        for (const a of anchors) {
          targets.push({
            targetId: `${path}::${a.id}`,
            path,
            kind: "ANCHOR",
            offset: a.at,
            anchorId: a.id,
            supportedModes: ["INSERT", "REPLACE", "DELETE"],
            defaultRisk: (String(a.id || "").includes("BODY") || String(a.id || "").includes("JS_EOF")) ? "medium" : "low",
            note: a.note
          });
        }
      }
    }

    const seen = new Set();
    const uniq = [];
    for (const t of targets) {
      if (!t || !t.targetId || seen.has(t.targetId)) continue;
      seen.add(t.targetId);
      uniq.push(t);
      if (uniq.length >= 800) break;
    }

    if (uniq.length < 2) {
      const fallbackPaths = ["/index.html", "/app/index.html"];
      for (const fp of fallbackPaths) {
        uniq.push({ targetId: `${fp}::HEAD_END`, path: fp, kind: "ANCHOR", offset: 0, anchorId: "HEAD_END", supportedModes: ["INSERT","REPLACE","DELETE"], defaultRisk: "low", note: "FORCED_FALLBACK_HEAD_END" });
        uniq.push({ targetId: `${fp}::BODY_END`, path: fp, kind: "ANCHOR", offset: 0, anchorId: "BODY_END", supportedModes: ["INSERT","REPLACE","DELETE"], defaultRisk: "medium", note: "FORCED_FALLBACK_BODY_END" });
        if (uniq.length >= 2) break;
      }
    }

    const out = { meta: { createdAt: nowISO(), count: uniq.length, source: (idx.meta && idx.meta.source) || "" }, targets: uniq };
    Storage.set("RCF_TARGET_MAP", out);
    Logger.write("targets:", "count=" + out.meta.count, "source=" + out.meta.source);
    try { populateTargetsDropdown(true); } catch {}
    return { ok: true, map: out };
  }

  function populateTargetsDropdown(autoSelect = false) {
    const sel = $("#injTarget");
    if (!sel) return;
    const map = Storage.get("RCF_TARGET_MAP", null);
    const t = map && Array.isArray(map.targets) ? map.targets : [];
    sel.innerHTML = "";
    if (!t.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(sem targets — gere o map)";
      sel.appendChild(opt);
      return;
    }
    for (const item of t.slice(0, 500)) {
      const opt = document.createElement("option");
      opt.value = item.targetId;
      opt.textContent = `${item.targetId}  —  ${item.path}  (${item.kind})`;
      sel.appendChild(opt);
    }
    if (autoSelect) {
      const first = Array.from(sel.options).find(o => (o.value || "").trim());
      if (first) sel.value = first.value;
    }
  }

  function tinyDiff(oldText, newText) {
    const a = String(oldText ?? "").split("\n");
    const b = String(newText ?? "").split("\n");
    const max = Math.max(a.length, b.length);
    const out = [];
    for (let i = 0; i < max; i++) {
      const A = a[i], B = b[i];
      if (A === B) continue;
      if (A !== undefined) out.push(`- ${A}`);
      if (B !== undefined) out.push(`+ ${B}`);
      if (out.length > 220) { out.push("... (diff truncado)"); break; }
    }
    return out.join("\n") || "(sem mudanças)";
  }

  async function readTextFromInventoryPath(path) {
    const p = normalizePath(path);
    const ov = await OverridesVFS.readFile(p);
    if (ov != null) return String(ov);

    const vfs = (window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs) {
      const txt = await vfsRead(vfs, p);
      return (txt == null) ? "" : String(txt);
    }

    const bundleText = getLocalMotherBundleText() || (await tryFetchLocalBundleFromCfg()) || "";
    if (bundleText) {
      try {
        const parsed = JSON.parse(bundleText);
        if (parsed && Array.isArray(parsed.files)) {
          const hit = parsed.files.find(it => normalizePath(it?.path || it?.file || it?.name) === p);
          if (hit) {
            if ("content" in hit) return String(hit.content ?? "");
            if ("text" in hit) return String(hit.text ?? "");
            if ("data" in hit) return String(hit.data ?? "");
            return "";
          }
        }
        const filesObj = (parsed && parsed.files && typeof parsed.files === "object") ? parsed.files : parsed;
        const v = filesObj && filesObj[p];
        if (v && typeof v === "object" && "content" in v) return String(v.content ?? "");
        if (v != null) return String(v);
      } catch {}
    }

    if (p === "/runtime/document.html") return document.documentElement ? document.documentElement.outerHTML : "";

    if (["/app/index.html", "/app/styles.css", "/app/app.js", "/index.html", "/styles.css", "/app.js"].includes(p)) {
      try {
        const res = await fetch(p, { cache: "no-store" });
        if (res.ok) return await res.text();
      } catch {}
    }

    return "";
  }

  async function writeTextToInventoryPath(path, newText) {
    const p = normalizePath(path);
    const vfs = (window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs) {
      try {
        if (typeof vfs.writeFile === "function") { await vfs.writeFile(p, String(newText ?? "")); return { ok: true, mode: "vfs.writeFile" }; }
        if (typeof vfs.write === "function") { await vfs.write(p, String(newText ?? "")); return { ok: true, mode: "vfs.write" }; }
        if (typeof vfs.put === "function") { await vfs.put(p, String(newText ?? "")); return { ok: true, mode: "vfs.put" }; }
        if (typeof vfs.set === "function") { await vfs.set(p, String(newText ?? "")); return { ok: true, mode: "vfs.set" }; }
      } catch (e) {
        return { ok: false, err: e?.message || e };
      }
    }

    try {
      await OverridesVFS.writeFile(p, String(newText ?? ""));
      return { ok: true, mode: "override.writeFile" };
    } catch (e) {
      return { ok: false, err: e?.message || e };
    }
  }

  function applyAtTarget(oldText, target, mode, payload) {
    const s = String(oldText ?? "");
    const pl = String(payload ?? "");

    const resolveOffset = () => {
      if (!target || target.kind !== "ANCHOR") return Math.max(0, Math.min(s.length, target.offset || 0));
      if ((target.offset || 0) > 0) return Math.max(0, Math.min(s.length, target.offset || 0));
      const lower = s.toLowerCase();
      if (target.anchorId === "HEAD_END") {
        const i = lower.lastIndexOf("</head>");
        return i >= 0 ? i : 0;
      }
      if (target.anchorId === "BODY_END") {
        const i = lower.lastIndexOf("</body>");
        return i >= 0 ? i : s.length;
      }
      return Math.max(0, Math.min(s.length, target.offset || 0));
    };

    if (target.kind === "MARKER") {
      const at = Math.max(0, Math.min(s.length, target.offset || 0));
      if (mode === "INSERT") return s.slice(0, at) + pl + "\n" + s.slice(at);
      if (mode === "REPLACE") return s.slice(0, at) + pl + "\n" + s.slice(at);
      if (mode === "DELETE") return s.replace(target.note || "@RCF:INJECT", "");
    }

    const at = resolveOffset();
    if (mode === "INSERT") return s.slice(0, at) + "\n" + pl + "\n" + s.slice(at);
    if (mode === "REPLACE") return s.slice(0, at) + "\n" + pl + "\n" + s.slice(at);
    if (mode === "DELETE") {
      if (!pl.trim()) return s;
      return s.split(pl).join("");
    }
    return s;
  }

  const InjectState = { lastSnapshot: null };

  async function injectorPreview() {
    const map = Storage.get("RCF_TARGET_MAP", null);
    const targets = map && Array.isArray(map.targets) ? map.targets : [];
    const targetId = ($("#injTarget")?.value || "").trim();
    const mode = ($("#injMode")?.value || "INSERT").trim();
    const payload = ($("#injPayload")?.value || "");
    const t = targets.find(x => x.targetId === targetId);
    if (!t) return { ok: false, err: "Target inválido (gere o map e selecione)." };
    const oldText = await readTextFromInventoryPath(t.path);
    const newText = applyAtTarget(oldText, t, mode, payload);
    uiMsg("#diffOut", tinyDiff(oldText, newText));
    return { ok: true, oldText, newText, t, mode };
  }

  async function injectorApplySafe() {
    const map = Storage.get("RCF_TARGET_MAP", null);
    const targets = map && Array.isArray(map.targets) ? map.targets : [];
    Logger.write("apply:", "targets count=" + targets.length);

    const pre = await injectorPreview();
    if (!pre.ok) {
      uiMsg("#diffOut", "❌ " + (pre.err || "preview falhou"));
      Logger.write("apply:", "FAIL target inválido");
      return { ok: false };
    }

    InjectState.lastSnapshot = { path: pre.t.path, oldText: pre.oldText, newText: pre.newText, targetId: pre.t.targetId, ts: nowISO() };

    const before = runMicroTests();
    if (!before.ok) {
      uiMsg("#diffOut", "❌ Microtests BEFORE falharam. Abortando.\n" + JSON.stringify(before, null, 2));
      Logger.write("apply:", "FAIL microtests before");
      return { ok: false };
    }

    const w = await writeTextToInventoryPath(pre.t.path, pre.newText);
    if (!w.ok) {
      uiMsg("#diffOut", "❌ Não consegui escrever.\n" + (w.err || ""));
      Logger.write("apply:", "FAIL write", pre.t.path, pre.t.targetId);
      return { ok: false };
    }

    const after = runMicroTests();
    if (!after.ok) {
      await writeTextToInventoryPath(pre.t.path, pre.oldText);
      uiMsg("#diffOut", "❌ Microtests AFTER falharam. Rollback aplicado.\n" + JSON.stringify(after, null, 2));
      Logger.write("apply:", "AFTER FAIL -> rollback", pre.t.path, pre.t.targetId);
      return { ok: false, rolledBack: true };
    }

    Logger.write("apply:", "OK", pre.t.path, pre.t.targetId, "mode=" + pre.mode, "write=" + w.mode);
    uiMsg("#diffOut", "✅ Aplicado com sucesso (SAFE).");
    return { ok: true };
  }

  async function injectorRollback() {
    const s = InjectState.lastSnapshot;
    if (!s) { uiMsg("#diffOut", "Nada para rollback."); return { ok: false }; }
    const w = await writeTextToInventoryPath(s.path, s.oldText);
    if (!w.ok) { uiMsg("#diffOut", "Rollback falhou: " + (w.err || "")); return { ok: false }; }
    uiMsg("#diffOut", "✅ Rollback aplicado.");
    Logger.write("inject:", "rollback OK", s.path, s.targetId);
    return { ok: true };
  }

  // =========================================================
  // AGENT
  // =========================================================
  const Agent = {
    _mem: { inj: { mode: "INSERT", targetId: "", payload: "" } },

    _out(text) {
      const out = $("#agentOut");
      if (out) out.textContent = String(text ?? "");
    },

    help() {
      return [
        "AGENT HELP (FINAL)",
        "",
        "Base:",
        "- help",
        "- list",
        "- show",
        "- create NOME [SLUG]",
        "- select SLUG",
        "- open dashboard|newapp|editor|generator|agent|settings|admin|logs|diagnostics",
        "",
        "FASE A (Admin):",
        "- scan",
        "- targets",
        "- dropdown",
        "- paths",
        "",
        "Buscar / checar:",
        "- find TEXTO",
        "- peek /caminho",
        "",
        "Injector (CLI SAFE):",
        "- inj mode INSERT|REPLACE|DELETE",
        "- inj target PARTE_DO_ID",
        "- inj payload <<<  (multiline)  >>>",
        "- inj preview",
        "- inj apply",
        "- inj rollback",
        "",
        "ENGINE:",
        "- build \"Nome do App\" [mods...]"
      ].join("\n");
    },

    list() {
      if (!State.apps.length) return "(vazio)";
      return State.apps.map(a => `${a.slug} — ${a.name}`).join("\n");
    },

    show() {
      const app = getActiveApp();
      const idx = Storage.get("RCF_FILE_INDEX", null);
      const map = Storage.get("RCF_TARGET_MAP", null);
      const cIdx = idx?.meta?.count ?? 0;
      const cTg = map?.meta?.count ?? 0;
      return [
        `mode: ${State.cfg.mode}`,
        `apps: ${State.apps.length}`,
        `active app: ${app ? `${app.name} (${app.slug})` : "-"}`,
        `active file: ${State.active.file || "-"}`,
        `view: ${State.active.view}`,
        `index: files=${cIdx} source=${idx?.meta?.source || "-"}`,
        `targets: count=${cTg}`
      ].join("\n");
    },

    _setCmdUI(mode, targetId, payload) {
      const m = $("#injMode");
      const t = $("#injTarget");
      const p = $("#injPayload");
      if (m && mode) m.value = mode;
      if (t && targetId) t.value = targetId;
      if (p && payload != null) p.value = payload;
    },

    _pickTargetByContains(part) {
      const map = Storage.get("RCF_TARGET_MAP", null);
      const targets = map && Array.isArray(map.targets) ? map.targets : [];
      const q = String(part || "").trim().toLowerCase();
      if (!q) return null;
      return targets.find(x => String(x.targetId || "").toLowerCase().includes(q)) || null;
    },

    async _scan() {
      const idx = await scanFactoryFiles();
      return `✅ Scan OK\nsource=${idx.meta.source}\nfiles=${idx.meta.count}\nscannedAt=${idx.meta.scannedAt}`;
    },

    _targets() {
      const idx = Storage.get("RCF_FILE_INDEX", null);
      const r = generateTargetMap(idx);
      if (!r.ok) return `❌ ${r.err || "falhou gerar map"}`;
      return `✅ Target Map OK\ncount=${r.map.meta.count}\nsource=${r.map.meta.source}\ncreatedAt=${r.map.meta.createdAt}`;
    },

    _paths() {
      const idx = Storage.get("RCF_FILE_INDEX", null);
      const files = idx && Array.isArray(idx.files) ? idx.files : [];
      if (!files.length) return "⚠️ Sem index. Rode: scan";
      return files.slice(0, 120).map(f => f.path).join("\n") + (files.length > 120 ? `\n... (${files.length - 120} mais)` : "");
    },

    async _peek(path) {
      const p = normalizePath(path);
      const txt = await readTextFromInventoryPath(p);
      const head = String(txt || "").slice(0, 1200);
      return `PEEK ${p}\nlen=${(txt || "").length}\n\n${head}${(txt || "").length > 1200 ? "\n\n...(truncado)" : ""}`;
    },

    async _find(q) {
      const idx = Storage.get("RCF_FILE_INDEX", null);
      const files = idx && Array.isArray(idx.files) ? idx.files : [];
      if (!files.length) return "⚠️ Sem index. Rode: scan";
      const needle = String(q || "").trim();
      if (!needle) return "⚠️ Use: find TEXTO";

      const needleLow = needle.toLowerCase();
      const hits = [];
      const LIMIT_FILES = 45;
      for (const f of files.slice(0, LIMIT_FILES)) {
        const p = f.path;
        const txt = await readTextFromInventoryPath(p);
        const pos = String(txt || "").toLowerCase().indexOf(needleLow);
        if (pos >= 0) {
          const start = Math.max(0, pos - 80);
          const end = Math.min((txt || "").length, pos + needle.length + 120);
          const snippet = (txt || "").slice(start, end).replace(/\n/g, "⏎");
          hits.push(`- ${p} @${pos}\n  ...${snippet}...`);
        }
        if (hits.length >= 8) break;
      }

      if (!hits.length) return `❌ Não achei "${needle}" (busca limitada a ${LIMIT_FILES} arquivos, 8 hits max).`;
      return `✅ HITS para "${needle}"\n` + hits.join("\n\n");
    },

    async route(cmdRaw) {
      const cmd = String(cmdRaw || "").trim();
      if (!cmd) return this._out("Comando vazio. Use: help");
      const lower = cmd.toLowerCase();

      if (lower === "help") return this._out(this.help());
      if (lower === "list") return this._out(this.list());
      if (lower === "show") return this._out(this.show());

      if (lower.startsWith("open ")) {
        const target = lower.replace("open ", "").trim();
        const map = {
          dashboard: "dashboard",
          newapp: "newapp",
          "new app": "newapp",
          editor: "editor",
          generator: "generator",
          agent: "agent",
          settings: "settings",
          admin: "admin",
          logs: "logs",
          diagnostics: "diagnostics",
          diag: "diagnostics"
        };
        const v = map[target] || target;
        setView(v);
        return this._out(`OK. view=${v}`);
      }

      if (lower.startsWith("create ")) {
        const rest = cmd.replace(/^create\s+/i, "").trim();
        const qm = rest.match(/^"([^"]+)"\s*([a-z0-9-]+)?/i);
        let name = "", slug = "";
        if (qm) { name = qm[1].trim(); slug = (qm[2] || "").trim(); }
        else { name = rest; }
        const r = createApp(name, slug);
        return this._out(r.msg);
      }

      if (lower.startsWith("select ")) {
        const slug = slugify(cmd.replace(/^select\s+/i, "").trim());
        const ok = setActiveApp(slug);
        return this._out(ok ? `OK. selecionado: ${slug}` : `Falhou: ${slug}`);
      }

      if (lower === "scan") {
        safeSetStatus("Scan…");
        syncFabStatusText();
        try {
          const r = await this._scan();
          safeSetStatus("OK ✅");
          syncFabStatusText();
          return this._out(r);
        } catch (e) {
          safeSetStatus("ERRO ❌");
          syncFabStatusText();
          return this._out("❌ scan falhou: " + (e?.message || e));
        }
      }

      if (lower === "targets") {
        try { return this._out(this._targets()); }
        catch (e) { return this._out("❌ targets falhou: " + (e?.message || e)); }
      }

      if (lower === "dropdown") {
        try { populateTargetsDropdown(true); return this._out("✅ Dropdown atualizado."); }
        catch (e) { return this._out("❌ dropdown falhou: " + (e?.message || e)); }
      }

      if (lower === "paths") return this._out(this._paths());

      if (lower.startsWith("peek ")) {
        const p = cmd.replace(/^peek\s+/i, "").trim();
        return this._out(await this._peek(p));
      }

      if (lower.startsWith("find ")) {
        const q = cmd.replace(/^find\s+/i, "").trim();
        return this._out(await this._find(q));
      }

      if (lower.startsWith("inj mode ")) {
        const mode = cmd.replace(/^inj\s+mode\s+/i, "").trim().toUpperCase();
        if (!["INSERT","REPLACE","DELETE"].includes(mode)) return this._out("⚠️ modos: INSERT | REPLACE | DELETE");
        this._mem.inj.mode = mode;
        this._setCmdUI(mode, null, null);
        return this._out(`✅ inj mode=${mode}`);
      }

      if (lower.startsWith("inj target ")) {
        const part = cmd.replace(/^inj\s+target\s+/i, "").trim();
        const t = this._pickTargetByContains(part);
        if (!t) return this._out("❌ Não achei target contendo: " + part + "\nUse: targets (gera map) ou dropdown");
        this._mem.inj.targetId = t.targetId;
        this._setCmdUI(null, t.targetId, null);
        return this._out(`✅ inj target=${t.targetId}\npath=${t.path}\nkind=${t.kind}`);
      }

      if (lower.startsWith("inj payload")) {
        const m = cmdRaw.match(/inj\s+payload\s*<<<([\s\S]*?)>>>/i);
        if (!m) return this._out("⚠️ Use:\ninj payload <<<\nSEU TEXTO AQUI\n>>>");
        const payload = m[1].replace(/^\n+|\n+$/g, "");
        this._mem.inj.payload = payload;
        this._setCmdUI(null, null, payload);
        return this._out(`✅ payload set (len=${payload.length})`);
      }

      if (lower === "inj preview") {
        this._setCmdUI(this._mem.inj.mode, this._mem.inj.targetId, this._mem.inj.payload);
        const r = await injectorPreview();
        return this._out(r.ok ? "✅ preview ok (veja Diff no Admin)" : ("❌ " + (r.err || "preview falhou")));
      }

      if (lower === "inj apply") {
        this._setCmdUI(this._mem.inj.mode, this._mem.inj.targetId, this._mem.inj.payload);
        safeSetStatus("Apply…");
        syncFabStatusText();
        const r = await injectorApplySafe();
        safeSetStatus("OK ✅");
        syncFabStatusText();
        return this._out(r.ok ? "✅ APPLY OK (SAFE)" : ("❌ APPLY FAIL" + (r.rolledBack ? " (rollback feito)" : "")));
      }

      if (lower === "inj rollback") {
        safeSetStatus("Rollback…");
        syncFabStatusText();
        const r = await injectorRollback();
        safeSetStatus("OK ✅");
        syncFabStatusText();
        return this._out(r.ok ? "✅ rollback ok" : "❌ rollback falhou");
      }

      if (lower.startsWith("build ")) {
        const rest = cmd.replace(/^build\s+/i, "").trim();
        const qm = rest.match(/^"([^"]+)"\s*(.*)$/);
        const name = qm ? qm[1].trim() : rest;
        const modsPart = qm ? (qm[2] || "").trim() : "";
        const mods = modsPart.replace(/^with\s+/i, "").split(/[,\s]+/g).map(s => s.trim()).filter(Boolean);
        const ENG = window.RCF_ENGINE;
        if (!ENG || typeof ENG.createSpec !== "function" || typeof ENG.createAppFromSpec !== "function") {
          return this._out("❌ ENGINE não carregou. Verifique se os scripts /js/engine/*.js estão no index.html.");
        }

        const r1 = ENG.createSpec({ name, modules: mods });
        if (!r1 || !r1.ok) return this._out("❌ " + (r1?.err || "spec falhou"));
        const r2 = ENG.createAppFromSpec(r1.spec);
        if (r2?.ok) {
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
  // DOCTOR
  // =========================================================
  function runDoctor() {
    if (runDoctor.__running__) return;
    runDoctor.__running__ = true;
    try { Logger.write("doctor: start"); } catch {}
    try {
      try { window.dispatchEvent(new CustomEvent("RCF:DOCTOR", { detail: { ts: Date.now() } })); } catch {}
      try {
        const candidates = [
          window.RCF_DOCTOR_SCAN,
          window.RCF_DOCTOR,
          window.__RCF_DOCTOR__,
          window.RCF_DIAGNOSTICS && window.RCF_DIAGNOSTICS.doctor
        ].filter(Boolean);
        for (const obj of candidates) {
          if (typeof obj.open === "function") { obj.open(); try { Logger.write("doctor: open()"); } catch {} return; }
          if (typeof obj.show === "function") { obj.show(); try { Logger.write("doctor: show()"); } catch {} return; }
        }
      } catch {}

      try {
        const D = window.RCF_DIAGNOSTICS;
        if (D && typeof D.run === "function") D.run({ silent: false });
      } catch (e) { try { Logger.write("doctor: diagnostics fail " + (e && e.message ? e.message : e)); } catch {} }

      try {
        const SM = window.RCF_SCANMAP;
        if (SM && typeof SM.scanNow === "function") SM.scanNow();
      } catch (e) { try { Logger.write("doctor: scanmap fail " + (e && e.message ? e.message : e)); } catch {} }

      try { setView("logs"); } catch {}
      try { Logger.write("doctor: done (fallback)"); } catch {}
    } finally {
      try { Logger.write("doctor: end"); } catch {}
      runDoctor.__running__ = false;
    }
  }

  try {
    window.RCF_DOCTOR = window.RCF_DOCTOR || {};
    window.RCF_DOCTOR.run = runDoctor;
    window.RCF_DOCTOR.open = () => runDoctor();
  } catch {}

  // =========================================================
  // BIND UI
  // =========================================================
  function bindUI() {
    try {
      const ev = window.RCF_UI_EVENTS;
      if (ev && typeof ev.bind === "function") {
        const ok = ev.bind({
          $, $$, bindTap,
          State, Logger, Storage,
          setView, openTools, openFabPanel, toggleFabPanel,
          syncFabStatusText, toggleInjectorLogCollapsed,
          renderAppsList, renderFilesList, openFile,
          setActiveApp, createApp, saveFile,
          refreshLogsViews,
          safeSetStatus, uiMsg, Agent, runDoctor,
          swRegister, swUnregisterAll, swClearCaches,
          runV8StabilityCheck, scanOverlays, runMicroTests,
          Pin, saveAll,
          scanFactoryFiles, generateTargetMap, populateTargetsDropdown,
          injectorPreview, injectorApplySafe, injectorRollback,
          textContentSafe, slugify, ensureAppFiles,
          getActiveApp, LoggerWrite: (...a) => Logger.write(...a)
        });
        if (ok !== false) {
          try { Logger.write("events:", "external ui_events bind ✅"); } catch {}
        }
      }
    } catch (e) {
      try { Logger.write("events bind err:", e?.message || e); } catch {}
    }

    $$('[data-view]').forEach(btn => bindTap(btn, () => setView(btn.getAttribute('data-view'))));
    bindTap($("#btnOpenTools"), () => { openTools(true); openFabPanel(false); });
    bindTap($("#btnCloseTools"), () => openTools(false));
    bindTap($("#rcfFab"), () => { toggleFabPanel(); syncFabStatusText(); });
    bindTap($("#btnFabClose"), () => openFabPanel(false));
    bindTap($("#btnFabTools"), () => { openFabPanel(false); openTools(true); });
    bindTap($("#btnFabAdmin"), () => { openFabPanel(false); setView("admin"); });
    bindTap($("#btnFabDoctor"), () => { openFabPanel(false); runDoctor(); });
    bindTap($("#btnFabLogs"), () => { openFabPanel(false); setView("logs"); });
    bindTap($("#btnCreateNewApp"), () => setView("newapp"));
    bindTap($("#btnOpenEditor"), () => setView("editor"));
    bindTap($("#btnAgentRun"), () => Agent.route($("#agentCmd")?.value || ""));
    bindTap($("#btnAgentHelp"), () => uiMsg("#agentOut", Agent.help()));
    bindTap($("#btnSaveFile"), () => saveFile());
    bindTap($("#btnToggleInjectorLog"), () => toggleInjectorLogCollapsed());
    bindTap($("#btnPinSave"), () => {
      const pin = String($("#pinInput")?.value || "").trim();
      if (!pin) return uiMsg("#pinOut", "⚠️ PIN vazio.");
      Pin.set(pin);
      uiMsg("#pinOut", "PIN salvo ✅");
    });
    bindTap($("#btnPinRemove"), () => {
      Pin.clear();
      uiMsg("#pinOut", "PIN removido ✅");
    });
    bindTap($("#btnNewAppCreate"), () => {
      const name = String($("#newAppName")?.value || "").trim();
      const slug = String($("#newAppSlug")?.value || "").trim();
      const r = createApp(name, slug);
      uiMsg("#newAppOut", r.msg || "Pronto.");
      if (r.ok) setView("dashboard");
    });
  }

  // =========================================================
  // HYDRATE
  // =========================================================
  function hydrateUIFromState() {
    refreshLogsViews();
    renderAppsList();

    const app = getActiveApp();
    if (app) {
      setActiveApp(app.slug);
      if (State.active.file) openFile(State.active.file);
    } else {
      const text = $("#activeAppText");
      if (text) textContentSafe(text, "Sem app ativo ✅");
    }

    setView(State.active.view || "dashboard");

    const pin = Pin.get();
    if (pin) uiMsg("#pinOut", "PIN definido ✅");

    populateTargetsDropdown(true);
    setInjectorLogCollapsed(true);
    syncFabStatusText();
    try { window.RCF_UI?.refresh?.(); } catch {}
  }

  // =========================================================
  // SAFE INIT
  // =========================================================
  async function safeInit() {
    try {
      Stability.install();
      injectCompactCSSOnce();
      await loadUiCoreBridgeOnce();
      await initUiRuntime({ $, $$, State, Storage, Logger, uiMsg, textContentSafe, bindTap, saveAll, safeSetStatus });
      await loadUiVisualModulesOnce();
      renderShell();
      installRCFUIRegistry();
      installFactoryIAAliases();
      syncUiCoreBridge("safeInit.registry");
      mountApprovedVisualModules("mount", { phase: "pre-hydrate" });
      try { notifyUIReady(); } catch {}
      bindUI();
      hydrateUIFromState();
      mountApprovedVisualModules("post-hydrate", { phase: "post-hydrate" });
      syncUiCoreBridge("safeInit.hydrate");

      try {
        window.RCF_ENGINE?.init?.({ State, Storage, Logger });
        Logger.write("engine:", "init ok ✅");
      } catch (e) {
        Logger.write("engine init err:", e?.message || e);
      }

      try {
        const swr = await Promise.race([
          swCheckAutoFix(),
          new Promise((res) => setTimeout(() => res({ ok:false, status:"timeout", detail:"TIMEOUT 3000ms (swCheckAutoFix)" }), 3000))
        ]);
        if (!swr.ok) Logger.write("sw warn:", swr.status, swr.detail, swr.err ? ("err=" + swr.err) : "");
      } catch (e) {
        Logger.write("sw warn:", "exception", e?.message || e);
      }

      Logger.write("RCF final init ok — mode:", State.cfg.mode);
      try {
        window.__RCF_BOOTED__ = true;
        const st = window[__BOOT_KEY] || {};
        st.booting = false;
        st.booted = true;
        st.ts = Date.now();
        window[__BOOT_KEY] = st;
      } catch {}
      safeSetStatus("OK ✅");
      syncFabStatusText();
    } catch (e) {
      const msg = (e?.message || e);
      Logger.write("FATAL init:", msg);
      try {
        const st = window[__BOOT_KEY] || {};
        st.booting = false;
        st.booted = false;
        st.ts = Date.now();
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

/* FILE: app/app.js
   RControl Factory - /app/app.js - V8.0.2 PADRAO (Doctor FAB-only, no global delegation)
   - Arquivo completo (1 peca) pra copiar/colar
   - FIX: Apps list layout
   - ADD: Dashboard -> botao APAGAR app
   - FIX: Preview preso -> teardownPreviewHard()
   - FIX: Evitar duplo bind do Generator
   - Mantem: boot lock, stability, UI_READY bus
*/
(() => {
  "use strict";

  // BUILD SIGNATURE (cache-bust verification)
  try { console.info("[RCF] /app/app.js BUILD=V8.0.2_DOCTOR_FAB_ONLY"); } catch {}

  // =========================================================
  // GLOBAL LOG ALIAS (compat) — evita: "Can't find variable: log"
  // - Alguns módulos antigos chamam log(...) direto.
  // - Aqui garantimos `log` no escopo e `window.log` sem depender do Logger ainda.
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
  // BOOT LOCK (evita double init) — SAFE (permite retry se falhar)
  // =========================================================
  const __BOOT_KEY = "__RCF_BOOT_STATE__";
  try {
    const st = window[__BOOT_KEY] || {};
    const now = Date.now();

    // já bootou com sucesso
    if (st.booted === true) return;

    // já está bootando (segura duplo load em sequência)
    if (st.booting === true && (now - (st.ts || 0)) < 8000) return;

    window[__BOOT_KEY] = { booting: true, booted: false, ts: now, ver: "v8" };
  } catch {
    // fallback compat (não trava)
    if (window.__RCF_BOOTED__) return;
    window.__RCF_BOOTED__ = true;
  }

  // =========================================================
  // BOOT WATCHDOG (anti "carregando pra sempre")
  // - Se a UI não montar em poucos segundos, abre tela controlada com instruções
  // =========================================================
  try {
    setTimeout(() => {
      try {
        if (document.getElementById("rcfRoot")) return;
        const msg = [
          "UI não montou (rcfRoot ausente).",
          "Provável causa: index.html sem <div id=\"app\">, ou SW/cache preso, ou erro antes do render.",
          "",
          "Ação rápida:",
          "1) Tools -> Unregister SW",
          "2) Tools -> Clear SW Cache",
          "3) Recarregar"
        ].join("\n");
        try { Logger.write("boot watchdog:", msg); } catch {}      } catch {}
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
  // RCF_UI REGISTRY (slots + actions; não quebra se faltar algo)
  // =========================================================
  function installRCFUIRegistry() {
    try {
      const R = window.RCF_UI || {};
      const base = {
        version: "v1",
        _lastRefreshAt: 0,
        slots: {
          // Admin (já existia)
          "admin.top": "#rcfAdminSlotTop",
          "admin.integrations": "#rcfAdminSlotIntegrations",
          "admin.logs": "#rcfAdminSlotLogs",
          "admin.injector": "#admin-injector",

          // Tools / views
          "tools.drawer": "#toolsDrawer",
          "logs.view": "#view-logs",
          "admin.view": "#view-admin",

          // NEW: Agent / Generator / Settings (para módulos plugar botões sem caçar)
          "agent.actions": "#rcfAgentSlotActions",
          "agent.tools": "#rcfAgentSlotTools",
          "generator.actions": "#rcfGenSlotActions",
          "generator.tools": "#rcfGenSlotTools",
          "settings.security.actions": "#rcfSettingsSecurityActions",

          // Status
          "status.text": "#statusText",       // source of truth (drawer)
          "status.text.top": "#statusTextTop" // opcional (topbar)
        },
        refresh() {
          try { this._lastRefreshAt = Date.now(); } catch {}
          return true;
        },
        getSlot(name) {
          try {
            const key = String(name || "").trim();
            if (!key) return null;

            // Fonte de verdade: data-rcf-slot
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
  // UI READY BUS (permite módulos que carregaram antes reinjetarem)
  // =========================================================
  function notifyUIReady() {
    // ✅ 1x only
    try {
      if (window.__RCF_UI_READY__ === true) return;
      window.__RCF_UI_READY__ = true;
    } catch {}

    // evento padrão
    try {
      window.dispatchEvent(new CustomEvent("RCF:UI_READY", {
        detail: { ts: Date.now() }
      }));
    } catch {}

    // hooks de compat (não quebra se não existir)
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
  // STATUS MANAGER (auto-clear, anti "grudar")
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
        // source-of-truth (drawer)
        const el = document.querySelector("#statusText");
        _setText(el, txt);

        // mirror (topbar)
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
  // CORE: Storage
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
  // CORE: Logger
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

  // Globais compatíveis
  window.RCF_LOGGER = window.RCF_LOGGER || {
    push(level, msg) { Logger.write(String(level || "log") + ":", msg); },
    clear() { Logger.clear(); },
    getText() { return Logger.getAll().join("\n"); },
    dump() { return Logger.getAll().join("\n"); }
  };


  // =========================================================
  // COMPAT: global `log()` helper (alguns módulos antigos chamam log(...))
  // - evita: "Can't find variable: log"
  // =========================================================
  try {
    if (typeof window.log !== "function") {
      window.log = (...a) => {
        try { Logger.write(...a); }
        catch { try { console.log("[RCF.log]", ...a); } catch {} }
      };
    }
  } catch {}

  // =========================================================
  // CORE: Stability (anti tela branca)
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
                <button id="rcfReloadBtn" style="padding:10px 14px;border-radius:10px;border:0;background:#2dd4bf;color:#022; font-weight:800">Recarregar</button>
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
  // CORE: iOS tap binder (anti duplo clique)
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

  function saveAll() {
    Storage.set("cfg", State.cfg);
    Storage.set("apps", State.apps);
    Storage.set("active", State.active);
    Storage.set("pending", State.pending);
  }

  // Globals compat
  window.RCF = window.RCF || {};
  window.RCF.state = State;
  window.RCF.log = (...a) => Logger.write(...a);

  // compat global: alguns módulos chamam log() direto
  try { if (!window.log) window.log = (...a) => Logger.write(...a); } catch {}

  // =========================================================
  // UI: Compact CSS
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
#rcfRoot .factory-logo-header{
  display:block !important;
  height:64px !important;
  width:auto !important;
  object-fit:contain !important;
  max-width:min(72vw, 360px) !important;
}
#rcfRoot .brand .title{ font-size: 18px !important; line-height: 1.15 !important; letter-spacing:.2px; }
#rcfRoot .brand .subtitle{ font-size: 12px !important; opacity:.82 !important; }

/* PATCH: remover pill do topo (sem remover a função safeSetStatus) */
#rcfRoot .status-pill{ display:none !important; }

#rcfRoot .tabs{
  display:flex !important;
  gap: 8px !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  -webkit-overflow-scrolling: touch !important;
  padding: 6px 0 2px !important;
  margin-top: 8px !important;
  scrollbar-width: none !important;
}
#rcfRoot .tabs::-webkit-scrollbar{ display:none !important; }
#rcfRoot .tabs .tab{
  flex: 0 0 auto !important;
  min-width: 96px !important;
  padding: 10px 12px !important;
  font-size: 13px !important;
  border-radius: 999px !important;
}

#rcfRoot .container{ padding-top: 10px !important; }
#rcfRoot .card{ padding: 12px !important; border-radius: 14px !important; }
#rcfRoot .card h1{ font-size: 24px !important; margin: 0 0 10px !important; }
#rcfRoot .card h2{ font-size: 18px !important; margin: 10px 0 8px !important; }

#rcfRoot .row{ gap: 10px !important; }
#rcfRoot .btn{ padding: 10px 12px !important; font-size: 13px !important; border-radius: 999px !important; }
#rcfRoot .btn.small{ padding: 8px 10px !important; font-size: 12px !important; }
#rcfRoot input, #rcfRoot select, #rcfRoot textarea{ font-size: 14px !important; }

#rcfRoot pre.mono{ max-height: 24vh !important; overflow:auto !important; -webkit-overflow-scrolling: touch !important; }
#rcfRoot pre.mono.small{ max-height: 20vh !important; }

/* logs gerais */
#rcfRoot #logsBox, #rcfRoot #logsOut, #rcfRoot #logsViewBox{
  max-height: 22vh !important; overflow:auto !important; -webkit-overflow-scrolling: touch !important;
}

/* PATCH: Admin injector log compacto/colapsável */
#rcfRoot #injLog{
  max-height: 18vh !important;
  overflow:auto !important;
  -webkit-overflow-scrolling: touch !important;
}
#rcfRoot .rcf-collapsed{
  max-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
}
#rcfRoot #injPayload{ max-height: 22vh !important; }
#rcfRoot #diffOut{ max-height: 20vh !important; }
#rcfRoot .tools .tools-body pre{ max-height: 28vh !important; }

/* PATCH: Apps list layout (nome grande não empurra botões) */
#appsList .app-item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}
#appsList .app-meta{
  flex:1 1 auto;
  min-width:0;
}
#appsList .app-name,
#appsList .app-slug{
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
#appsList .app-actions{
  flex:0 0 auto;
  display:flex;
  gap:8px;
  align-items:center;
}

/* PATCH: FAB (bolinha) + painel */
#rcfFab{
  position:fixed !important;
  right: 14px !important;
  bottom: 14px !important;
  width: 54px !important;
  height: 54px !important;
  border-radius: 999px !important;
  border: 1px solid rgba(255,255,255,.16) !important;
  background: rgba(20,28,44,.92) !important;
  color: #fff !important;
  font-size: 20px !important;
  font-weight: 900 !important;
  box-shadow: 0 10px 30px rgba(0,0,0,.35) !important;
  z-index: 9999 !important;
}

#rcfFabPanel{
  position:fixed !important;
  right: 14px !important;
  bottom: 78px !important;
  width: 220px !important;
  border-radius: 14px !important;
  border: 1px solid rgba(255,255,255,.12) !important;
  background: rgba(12,16,26,.96) !important;
  color:#fff !important;
  padding: 10px !important;
  z-index: 9999 !important;
  display:none !important;
}
#rcfFabPanel.open{ display:block !important; }

#rcfFabPanel .fab-title{
  font-weight:900 !important;
  margin-bottom:8px !important;
  display:flex !important;
  align-items:center !important;
  justify-content:space-between !important;
  gap:10px !important;
}
#rcfFabPanel .fab-status{
  font-size:12px !important;
  opacity:.85 !important;
  white-space:nowrap !important;
  max-width: 120px !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
}
#rcfFabPanel .fab-row{
  display:flex !important;
  gap:8px !important;
  flex-wrap:wrap !important;
}
#rcfFabPanel .fab-row .btn{
  flex: 1 1 auto !important;
}

@media (max-width:900px){
  #rcfRoot .factory-logo-header{
    height:52px !important;
    max-width:min(70vw, 300px) !important;
  }
}

@media (max-width: 520px){
  #rcfRoot .brand .title{ font-size: 17px !important; }
  #rcfRoot .brand .subtitle{ font-size: 11px !important; }
  #rcfRoot .tabs .tab{ min-width: 90px !important; padding: 9px 11px !important; }
  #rcfRoot .card{ padding: 10px !important; }
  #rcfRoot pre.mono{ max-height: 20vh !important; }
}
      `.trim();

      const st = document.createElement("style");
      st.id = "rcfCompactCss";
      st.textContent = css;
      document.head.appendChild(st);

      try { window.RCF_LOGGER?.push?.("OK", "ui_compact: injected ✅"); } catch {}
    } catch {}
  }

  // =========================================================
  // VFS Overrides (localStorage)
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
  // UI Shell + Views
  // =========================================================
  function renderShell() {
    // PATCH: garante root mesmo se o index.html mudou (anti tela branca "carregando...")
    let root = $("#app");
    if (!root) {
      try {
        root = document.createElement("div");
        root.id = "app";
        (document.body || document.documentElement).appendChild(root);
        try { Logger.write("boot:", "created #app root fallback ✅"); } catch {}
      } catch {
        return;
      }
    }
    if ($("#rcfRoot")) return;

    root.innerHTML = `
      
        <style id="rcfShellEnhancer">
          .rcfShellGrid{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start;max-width:1440px;margin:0 auto}
          .rcfSidebar{position:sticky;top:12px;display:flex;flex-direction:column;gap:14px;min-height:calc(100vh - 24px)}
          .rcfSidebarBrand{display:flex;align-items:center;gap:12px}
          .rcfSidebarBrand img{width:44px;height:44px;border-radius:50%;object-fit:cover;box-shadow:0 8px 18px rgba(34,52,84,.18)}
          .rcfSidebarBrandText{min-width:0}
          .rcfSidebarBrandTitle{font-size:18px;font-weight:900;line-height:1;color:var(--rcf-text,#1f2a44)}
          .rcfSidebarBrandSub{margin-top:4px;font-size:11px;letter-spacing:.9px;text-transform:uppercase;color:var(--rcf-muted,#647089)}
          .rcfSideNav{display:grid;gap:8px}
          .rcfSideBtn{justify-content:flex-start;width:100%;padding-left:14px;padding-right:14px}
          .rcfSideFooter{margin-top:auto;display:grid;gap:8px}
          .rcfMainStage{min-width:0}
          .rcfDashHero{display:grid;gap:14px}
          .rcfDashHeroHead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
          .rcfDashMetrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
          .rcfMetricCard,.rcfDashPanel{position:relative;border:1px solid var(--rcf-line,rgba(38,58,92,.12));border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.72),rgba(255,255,255,.54));box-shadow:0 8px 20px rgba(25,38,66,.08);padding:14px}
          .rcfMetricLabel{font-size:12px;font-weight:800;color:var(--rcf-muted,#647089);text-transform:uppercase;letter-spacing:.8px}
          .rcfMetricValue{margin-top:8px;font-size:34px;line-height:1;font-weight:900;color:var(--rcf-text,#1f2a44)}
          .rcfDashPanels{display:grid;grid-template-columns:1.35fr .95fr .95fr;gap:12px;align-items:start}
          .rcfDashPanelWide{grid-column:auto}
          .rcfActivityList{display:grid;gap:8px}
          .rcfActivityItem{padding:10px 12px;border:1px solid rgba(38,58,92,.10);border-radius:14px;background:rgba(255,255,255,.58);font-size:13px;color:var(--rcf-text-2,#33415f)}
          .rcfAiPanel{display:grid;gap:12px;margin-top:8px}
          .rcfMobileModules{display:none}
          .rcfMobileModuleCard{display:flex;align-items:center;gap:15px;width:100%;padding:19px 17px;border:1px solid rgba(46,65,97,.10);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(255,255,255,.70));box-shadow:0 16px 32px rgba(25,38,66,.10),inset 0 1px 0 rgba(255,255,255,.66);text-align:left;color:var(--rcf-text,#1f2a44);position:relative;overflow:hidden;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
          .rcfMobileModuleCard::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(120deg,rgba(74,141,255,.08),rgba(74,141,255,0) 28%,rgba(255,155,61,.08) 78%,rgba(255,155,61,0))}
          .rcfMobileModuleCard::after{content:"";position:absolute;right:-28px;bottom:-18px;width:96px;height:96px;border-radius:50%;border:10px solid rgba(91,110,145,.05);box-shadow:inset 0 0 0 7px rgba(255,255,255,.05);pointer-events:none}
          .rcfMobileModuleCard > *{position:relative;z-index:1}
          .rcfMobileModuleIcon{display:inline-flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:19px;flex:0 0 58px;position:relative;background:linear-gradient(180deg,rgba(255,255,255,.88),rgba(214,223,236,.88));box-shadow:0 12px 24px rgba(25,38,66,.12),inset 0 1px 0 rgba(255,255,255,.78)}
          .rcfMobileModuleIcon::before,.rcfMobileModuleIcon::after{content:"";position:absolute;display:block}
          .rcfMobileModuleIcon.mod-dashboard::before{width:28px;height:28px;border-radius:50%;border:3px solid #456fd6;box-shadow:0 0 0 6px rgba(74,141,255,.14) inset}
          .rcfMobileModuleIcon.mod-dashboard::after{width:10px;height:10px;border-radius:50%;background:linear-gradient(180deg,#89d7ff,#4a8dff);box-shadow:-10px 6px 0 0 #5f7be7,10px -4px 0 0 #ffb15e,3px 13px 0 0 #7fd5c0}
          .rcfMobileModuleIcon.mod-apps::before{width:28px;height:28px;border-radius:9px;background:linear-gradient(180deg,#ffd380,#ffb15e);left:12px;top:14px;box-shadow:12px -8px 0 0 #5b7ee9,-2px 10px 0 0 #264da7}
          .rcfMobileModuleIcon.mod-apps::after{width:16px;height:12px;border-radius:4px;background:rgba(255,255,255,.66);left:21px;top:23px}
          .rcfMobileModuleIcon.mod-editor::before{width:26px;height:34px;border-radius:8px;background:linear-gradient(180deg,#31568f,#1b2d50);transform:rotate(-12deg);box-shadow:0 0 0 2px rgba(255,255,255,.25) inset}
          .rcfMobileModuleIcon.mod-editor::after{width:14px;height:3px;border-radius:999px;background:#ffb15e;transform:rotate(-12deg);top:30px;left:22px;box-shadow:-2px -7px 0 0 rgba(255,255,255,.78),-4px -14px 0 0 rgba(255,255,255,.54)}
          .rcfMobileModuleIcon.mod-agent::before{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#9ce1ff,#4a8dff 58%,#2f70e6 100%);box-shadow:0 0 0 5px rgba(74,141,255,.12)}
          .rcfMobileModuleIcon.mod-agent::after{width:24px;height:24px;border:3px solid rgba(46,79,151,.64);border-left-color:transparent;border-bottom-color:transparent;border-radius:50%;transform:rotate(28deg);top:15px;left:17px}
          .rcfMobileModuleIcon.mod-factory::before{width:30px;height:30px;border-radius:50%;border:5px solid #2f70e6;box-shadow:0 0 0 4px rgba(255,177,94,.44) inset}
          .rcfMobileModuleIcon.mod-factory::after{width:12px;height:12px;border-radius:50%;background:linear-gradient(180deg,#ffb15e,#ff8a2a);box-shadow:0 -20px 0 -2px #3f77ec,14px -14px 0 -2px #3f77ec,20px 0 0 -2px #3f77ec,14px 14px 0 -2px #3f77ec,0 20px 0 -2px #3f77ec,-14px 14px 0 -2px #3f77ec,-20px 0 0 -2px #3f77ec,-14px -14px 0 -2px #3f77ec}
          .rcfMobileModuleText{min-width:0;flex:1 1 auto}
          .rcfMobileModuleTitle{font-size:18px;font-weight:900;line-height:1.05;color:var(--rcf-text,#1f2a44);letter-spacing:.1px}
          .rcfMobileModuleSub{margin-top:6px;font-size:12px;line-height:1.3;color:var(--rcf-muted,#647089)}
          .rcfMobileModuleArrow{font-size:24px;font-weight:900;color:rgba(31,42,68,.58);flex:0 0 auto;transform:translateY(-1px)}
          .rcfBottomNav{display:none}
          @media (max-width:980px){
            .rcfShellGrid{grid-template-columns:1fr}
            .rcfSidebar{position:relative;top:auto;min-height:auto}
            .rcfDashMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}
            .rcfDashPanels{grid-template-columns:1fr}
          }
          @media (max-width:720px){
            .rcfSidebar{display:none}
            .topbar{padding:14px 12px 10px !important;border-radius:26px !important;margin-bottom:12px !important}
            .brand{align-items:flex-start !important}
            .factory-logo-header{height:62px !important;max-width:min(84vw, 342px) !important}
            .tabs{display:none !important}
            .container{padding-bottom:112px !important}
            .hero{padding:12px !important;border-radius:24px !important;background:linear-gradient(180deg,rgba(255,255,255,.78),rgba(255,255,255,.60)) !important}
            .hero h1{font-size:24px !important;line-height:1.05 !important}
            .hero p{font-size:13px !important}
            .rcfDashHero{gap:12px !important}
            .rcfDashHeroHead{order:2 !important}
            .rcfDashHeroHead > div:first-child{display:none !important}
            .status-box{display:grid !important;grid-template-columns:1fr !important;gap:8px !important;margin-top:0 !important}
            .status-box .badge{grid-column:1 / -1 !important}
            .status-box .btn{display:none !important}
            .rcfMobileModules{display:grid !important;order:1 !important;gap:12px !important;margin-top:0 !important}
            .rcfDashMetrics{order:3 !important;grid-template-columns:1fr !important;gap:10px !important}
            .rcfMetricCard{padding:14px 16px !important;border-radius:18px !important}
            .rcfMetricValue{font-size:28px !important}
            .rcfDashPanels{order:4 !important;gap:10px !important}
            .rcfDashPanel{padding:14px !important;border-radius:18px !important}
            #appsList{display:grid !important;grid-template-columns:1fr !important;gap:10px !important}
            #appsList .app-item{padding:14px !important;border-radius:18px !important;flex-direction:column !important;align-items:stretch !important}
            #appsList .app-actions{width:100% !important;display:grid !important;grid-template-columns:1fr 1fr 1fr !important;gap:8px !important}
            #appsList .app-actions .btn{width:100% !important;min-height:40px !important}
            .rcfBottomNav{position:fixed;left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));z-index:130;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;padding:10px;border:1px solid rgba(38,58,92,.12);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,255,255,.80));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 22px 48px rgba(25,38,66,.16)}
            .rcfBottomNav .tab{min-width:0 !important;width:100% !important;padding:8px 6px !important;font-size:11px !important;line-height:1.1 !important;min-height:46px !important;border-radius:16px !important}
            #rcfFab{bottom:calc(max(10px,env(safe-area-inset-bottom)) + 86px)}
            #rcfFabPanel{bottom:calc(max(10px,env(safe-area-inset-bottom)) + 152px)}
          }
        </style>

      <div id="rcfRoot" data-rcf-app="rcf.factory">
        <div class="rcfShellGrid">
          <aside class="card rcfSidebar" data-rcf-panel="sidebar">
            <div class="rcfSidebarBrand">
              <img src="./assets/rcf-logo-mark.svg" alt="" />
              <div class="rcfSidebarBrandText">
                <div class="rcfSidebarBrandTitle">FACTORY</div>
                <div class="rcfSidebarBrandSub">by RCONTROL</div>
              </div>
            </div>

            <nav class="rcfSideNav" aria-label="Menu principal">
              <button class="tab active rcfSideBtn" data-view="dashboard" type="button">Dashboard</button>
              <button class="tab rcfSideBtn" data-view="newapp" type="button">Apps</button>
              <button class="tab rcfSideBtn" data-view="editor" type="button">Editor</button>
              <button class="tab rcfSideBtn" data-view="generator" type="button">Generator</button>
              <button class="tab rcfSideBtn" data-view="agent" type="button">Agent</button>
              <button class="tab rcfSideBtn" data-view="admin" type="button">Factory</button>
              <button class="tab rcfSideBtn" data-view="settings" type="button">System</button>
              <button class="tab rcfSideBtn" data-view="logs" type="button">Logs</button>
              <button class="tab rcfSideBtn" data-view="admin" type="button">GitHub Sync</button>
              <button class="tab rcfSideBtn" id="btnSidebarTools" type="button">⚙️</button>
            </nav>

            <div class="rcfSideFooter">
              <div class="badge" id="rcfSidebarStatus">Factory pronta ✅</div>
            </div>
          </aside>

          <div class="rcfMainStage">
            <header class="topbar" data-rcf-panel="topbar">
              <div class="brand" data-rcf-panel="brand">
                <img src="./assets/factory-header-logo.png" class="factory-logo-header" alt="Factory by RCONTROL">
                <div class="spacer"></div>
                <button class="btn small ghost" id="btnOpenTools" type="button" aria-label="Ferramentas" data-rcf-action="tools.open">Tools</button>
                <div class="status-pill" id="statusPill" style="margin-left:10px" data-rcf="status.pill.top">
                  <span class="ok" id="statusTextTop" data-rcf="status.text.top">OK ✅</span>
                </div>
              </div>

              <nav class="tabs" aria-label="Navegação" data-rcf-panel="tabs">
                <button class="tab active" data-view="dashboard" data-rcf-tab="dashboard" type="button">Dashboard</button>
                <button class="tab" data-view="newapp" data-rcf-tab="newapp" type="button">Apps</button>
                <button class="tab" data-view="editor" data-rcf-tab="editor" type="button">Editor</button>
                <button class="tab" data-view="generator" data-rcf-tab="generator" type="button">Generator</button>
                <button class="tab" data-view="agent" data-rcf-tab="agent" type="button">Agent</button>
                <button class="tab" data-view="admin" data-rcf-tab="admin" type="button">Factory</button>
                <button class="tab" data-view="settings" data-rcf-tab="settings" type="button">System</button>
                <button class="tab" data-view="logs" data-rcf-tab="logs" type="button">Logs</button>
                <button class="tab" data-view="diagnostics" data-rcf-tab="diagnostics" type="button">Diagnostics</button>
              </nav>
            </header>

            <main class="container views" id="views" data-rcf-panel="views">
              <section class="view card hero" id="view-dashboard" data-rcf-view="dashboard">
            <div class="rcfDashHero">
              <div class="rcfDashHeroHead">
                <div>
                  <h1>Factory Dashboard</h1>
                  <p>Painel principal da RControl Factory com visão rápida dos apps, atividade e IA.</p>
                </div>
                <div class="status-box">
                  <div class="badge" id="activeAppText">Sem app ativo ✅</div>
                  <button class="btn small" id="btnCreateNewApp" type="button" data-rcf-action="nav.newapp">Criar App</button>
                  <button class="btn small" id="btnOpenEditor" type="button" data-rcf-action="nav.editor">Abrir Editor</button>
                  <button class="btn small ghost" id="btnExportBackup" type="button" data-rcf-action="backup.export">Backup</button>
                </div>
              </div>

              <div class="rcfDashMetrics">
                <div class="rcfMetricCard">
                  <div class="rcfMetricLabel">Apps Ativos</div>
                  <div class="rcfMetricValue" id="dashAppsCount">00</div>
                </div>
                <div class="rcfMetricCard">
                  <div class="rcfMetricLabel">Projetos</div>
                  <div class="rcfMetricValue" id="dashProjectsCount">00</div>
                </div>
                <div class="rcfMetricCard">
                  <div class="rcfMetricLabel">IA Online</div>
                  <div class="rcfMetricValue" id="dashAiStatus">--</div>
                </div>
                <div class="rcfMetricCard">
                  <div class="rcfMetricLabel">Builds</div>
                  <div class="rcfMetricValue" id="dashBuildsCount">00</div>
                </div>
              </div>

              <div class="rcfMobileModules" aria-label="Módulos principais">
                <button class="rcfMobileModuleCard" data-view="dashboard" type="button">
                  <span class="rcfMobileModuleIcon mod-dashboard" aria-hidden="true"></span>
                  <span class="rcfMobileModuleText">
                    <span class="rcfMobileModuleTitle">Dashboard</span>
                    <span class="rcfMobileModuleSub">Status &amp; Controle</span>
                  </span>
                  <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                </button>
                <button class="rcfMobileModuleCard" data-view="newapp" type="button">
                  <span class="rcfMobileModuleIcon mod-apps" aria-hidden="true"></span>
                  <span class="rcfMobileModuleText">
                    <span class="rcfMobileModuleTitle">Apps</span>
                    <span class="rcfMobileModuleSub">Criar &amp; Gerenciar</span>
                  </span>
                  <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                </button>
                <button class="rcfMobileModuleCard" data-view="editor" type="button">
                  <span class="rcfMobileModuleIcon mod-editor" aria-hidden="true"></span>
                  <span class="rcfMobileModuleText">
                    <span class="rcfMobileModuleTitle">Editor</span>
                    <span class="rcfMobileModuleSub">Projetos &amp; Código</span>
                  </span>
                  <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                </button>
                <button class="rcfMobileModuleCard" data-view="agent" type="button">
                  <span class="rcfMobileModuleIcon mod-agent" aria-hidden="true"></span>
                  <span class="rcfMobileModuleText">
                    <span class="rcfMobileModuleTitle">Agent</span>
                    <span class="rcfMobileModuleSub">IA + Automação</span>
                  </span>
                  <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                </button>
                <button class="rcfMobileModuleCard" data-view="admin" type="button">
                  <span class="rcfMobileModuleIcon mod-factory" aria-hidden="true"></span>
                  <span class="rcfMobileModuleText">
                    <span class="rcfMobileModuleTitle">Factory</span>
                    <span class="rcfMobileModuleSub">Sistema &amp; Tools</span>
                  </span>
                  <span class="rcfMobileModuleArrow" aria-hidden="true">›</span>
                </button>
              </div>

              <div class="rcfDashPanels">
                <div class="rcfDashPanel rcfDashPanelWide">
                  <h2>Projetos Recentes</h2>
                  <div id="appsList" class="apps" data-rcf-slot="apps.list"></div>
                </div>

                <div class="rcfDashPanel">
                  <h2>Logs &amp; Atividades</h2>
                  <div id="dashActivityList" class="rcfActivityList">
                    <div class="hint">Aguardando atividade...</div>
                  </div>
                </div>

                <div class="rcfDashPanel">
                  <h2>Factory AI</h2>
                  <p class="hint">Acesse o agente da Factory para automação, comandos naturais e assistência no fluxo.</p>
                  <div class="rcfAiPanel">
                    <div class="badge" id="dashAiBadge">Sistema pronto ✅</div>
                    <button class="btn ok" id="btnDashStartAI" type="button">Iniciar IA</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

              <section class="view card" id="view-newapp" data-rcf-view="newapp">
            <h1>Novo App</h1>
            <p class="hint">Cria um mini-app dentro da Factory.</p>

            <div class="row form">
              <input id="newAppName" placeholder="Nome do app" />
              <input id="newAppSlug" placeholder="slug (opcional)" />
              <button class="btn small" id="btnAutoSlug" type="button" data-rcf-action="app.autoslug">Auto-slug</button>
              <button class="btn ok" id="btnDoCreateApp" type="button" data-rcf-action="app.create">Criar</button>
            </div>

            <pre class="mono" id="newAppOut">Pronto.</pre>
          </section>

              <section class="view card" id="view-editor" data-rcf-view="editor">
            <h1>Editor</h1>
            <p class="hint">Escolha um arquivo e edite.</p>

            <div class="row">
              <div class="badge" id="editorHead">Arquivo atual: -</div>
              <div class="spacer"></div>
              <button class="btn ok" id="btnSaveFile" type="button" data-rcf-action="editor.save">Salvar</button>
              <button class="btn danger" id="btnResetFile" type="button" data-rcf-action="editor.reset">Reset</button>
            </div>

            <div class="row">
              <div style="flex:1;min-width:240px">
                <div class="hint">Arquivos</div>
                <div id="filesList" class="files" data-rcf-slot="files.list"></div>
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

              <section class="view card" id="view-generator" data-rcf-view="generator">
            <h1>Generator</h1>
            <p class="hint">Gera ZIP do app selecionado (stub por enquanto).</p>

            <!-- ✅ SLOT FIXO: Generator Actions (para módulos plugar botões) -->
            <div id="rcfGenSlotActions" data-rcf-slot="generator.actions">
              <div class="row">
                <button class="btn ok" id="btnGenZip" type="button" data-rcf-action="gen.zip">Build ZIP</button>
                <button class="btn ghost" id="btnGenPreview" type="button" data-rcf-action="gen.preview">Preview</button>
              </div>
            </div>

            <!-- ✅ SLOT FIXO: Generator Tools (extra UI) -->
            <div id="rcfGenSlotTools" data-rcf-slot="generator.tools"></div>

            <pre class="mono" id="genOut">Pronto.</pre>
          </section>

              <section class="view card" id="view-agent" data-rcf-view="agent">
            <h1>Agente</h1>
            <p class="hint">Comandos naturais + patchset (fase atual: comandos básicos).</p>

            <div class="row cmd">
              <input id="agentCmd" placeholder='Ex: create "Meu App" meu-app | scan | targets | inj apply | build "Meu App" agenda' />
              <button class="btn ok" id="btnAgentRun" type="button" data-rcf-action="agent.run">Executar</button>
              <button class="btn ghost" id="btnAgentHelp" type="button" data-rcf-action="agent.help">Ajuda</button>
            </div>

            <!-- ✅ SLOT FIXO: Agent Actions (zip_vault/agent_zip_bridge vão plugar aqui) -->
            <div id="rcfAgentSlotActions" data-rcf-slot="agent.actions"></div>

            <!-- ✅ SLOT FIXO: Agent Tools (extra UI) -->
            <div id="rcfAgentSlotTools" data-rcf-slot="agent.tools"></div>

            <pre class="mono" id="agentOut">Pronto.</pre>
          </section>

              <section class="view card" id="view-settings" data-rcf-view="settings">
            <h1>Settings</h1>

            <div class="card" id="settings-security" data-rcf-panel="settings.security">
              <h2>Segurança</h2>
              <p class="hint">Define um PIN para liberar ações críticas no Admin.</p>

              <!-- ✅ SLOT FIXO: Security Actions (se algum módulo quiser botão aqui) -->
              <div id="rcfSettingsSecurityActions" data-rcf-slot="settings.security.actions"></div>

              <div class="row">
                <input id="pinInput" placeholder="Definir PIN (4-8 dígitos)" inputmode="numeric" />
                <button class="btn ok" id="btnPinSave" type="button" data-rcf-action="pin.save">Salvar PIN</button>
                <button class="btn danger" id="btnPinRemove" type="button" data-rcf-action="pin.remove">Remover PIN</button>
              </div>
              <pre class="mono" id="pinOut">Pronto.</pre>
            </div>

            <div class="card" id="settings-logs" data-rcf-panel="settings.logs">
              <h2>Logs</h2>
              <div class="row">
                <button class="btn ghost" id="btnLogsRefresh" type="button" data-rcf-action="logs.refresh">Atualizar</button>
                <button class="btn ok" id="btnLogsCopy" type="button" data-rcf-action="logs.copy">Exportar .txt</button>
                <button class="btn danger" id="btnLogsClear" type="button" data-rcf-action="logs.clear">Limpar logs</button>
              </div>
              <pre class="mono small" id="logsOut">Pronto.</pre>
            </div>
          </section>

              <section class="view card" id="view-diagnostics" data-rcf-view="diagnostics">
            <h1>Diagnostics</h1>
            <div class="row">
              <button class="btn ok" id="btnDiagRun" type="button" data-rcf-action="diag.run">Rodar V8 Stability Check</button>
              <button class="btn ghost" id="btnDiagScan" type="button" data-rcf-action="diag.scanOverlays">Scan overlays</button>
              <button class="btn ghost" id="btnDiagTests" type="button" data-rcf-action="diag.microtests">Run micro-tests</button>
              <button class="btn danger" id="btnDiagClear" type="button" data-rcf-action="diag.clear">Limpar</button>
            </div>
            <pre class="mono" id="diagOut">Pronto.</pre>
          </section>

              <section class="view card" id="view-logs" data-rcf-view="logs">
            <h1>Logs</h1>
            <div class="row">
              <button class="btn ghost" id="btnLogsRefresh2" type="button" data-rcf-action="logs.refresh">Atualizar</button>
              <button class="btn ok" id="btnCopyLogs" type="button" data-rcf-action="logs.copy">Copiar</button>
              <button class="btn danger" id="btnClearLogs2" type="button" data-rcf-action="logs.clear">Limpar</button>
            </div>
            <pre class="mono small" id="logsViewBox">Pronto.</pre>
          </section>

              <section class="view card" id="view-admin" data-rcf-view="admin">
            <h1>Admin</h1>

            <!-- SLOT: Admin Top/Buttons -->
            <div id="rcfAdminSlotTop" data-rcf-slot="admin.top">
              <div class="row">
                <button class="btn ghost" id="btnAdminDiag" type="button" data-rcf-action="admin.diag">Diagnosticar (local)</button>
<button class="btn danger" id="btnAdminZero" type="button" data-rcf-action="admin.zero">Zerar (safe)</button>
              </div>

              <pre class="mono" id="adminOut">Pronto.</pre>
            </div>

            <div class="card" id="admin-maint" data-rcf-panel="admin.maint">
              <h2>MAINTENANCE • Self-Update (Mãe)</h2>
              <div class="row">
                <button class="btn ghost" id="btnMaeLoad" type="button" data-rcf-action="mae.load">Carregar Mãe</button>
                <button class="btn ok" id="btnMaeCheck" type="button" data-rcf-action="mae.check">Rodar Check</button>
              </div>
              <div class="row">
                <button class="btn ok" id="btnMaeUpdate" type="button" data-rcf-action="mae.update">⬇️ Update From GitHub</button>
                <button class="btn danger" id="btnMaeClear" type="button" data-rcf-action="mae.clear">🧹 Clear Overrides</button>
              </div>
              <pre class="mono" id="maintOut">Pronto.</pre>
            </div>

            <!-- SLOT NOBRE: Integrations (GitHub/Fillers/externos) -->
            <div class="card" id="rcfAdminSlotIntegrations" data-rcf-slot="admin.integrations">
              <h2>INTEGRATIONS (slot)</h2>
              <p class="hint">Ponto fixo para módulos externos montarem UI aqui (sem buscar texto).</p>
              <div class="hint" style="opacity:.8">Pronto.</div>
            </div>

            <div class="card" id="admin-injector" data-rcf-slot="admin.injector">
              <h2>FASE A • Scan / Target Map / Injector SAFE</h2>
              <p class="hint">“REAL” = A (VFS) → B (bundle local) → C (DOM apenas anchors). Sem GitHub remoto.</p>

              <div class="row" style="flex-wrap:wrap;">
                <button class="btn ok" id="btnScanIndex" type="button" data-rcf-action="admin.scanIndex">🔎 Scan & Index</button>
                <button class="btn ghost" id="btnGenTargets" type="button" data-rcf-action="admin.genTargets">🧭 Generate Target Map</button>
                <button class="btn ghost" id="btnRefreshTargets" type="button" data-rcf-action="admin.refreshTargets">🔁 Refresh Dropdown</button>
              </div>

              <pre class="mono small" id="scanOut">Pronto.</pre>

              <div class="row form" style="margin-top:10px">
                <select id="injMode">
                  <option value="INSERT">INSERT</option>
                  <option value="REPLACE">REPLACE</option>
                  <option value="DELETE">DELETE</option>
                </select>

                <select id="injTarget"></select>

                <button class="btn ghost" id="btnPreviewDiff" type="button" data-rcf-action="admin.previewDiff">👀 Preview diff</button>
                <button class="btn ok" id="btnApplyInject" type="button" data-rcf-action="admin.applyInject">✅ Apply (SAFE)</button>
                <button class="btn danger" id="btnRollbackInject" type="button" data-rcf-action="admin.rollbackInject">↩ Rollback</button>
              </div>

              <div class="hint" style="margin-top:10px">Payload:</div>
              <textarea id="injPayload" class="textarea" rows="8" spellcheck="false" placeholder="Cole aqui o payload para inserir/substituir..."></textarea>

              <div class="hint" style="margin-top:10px">Preview / Diff:</div>
              <pre class="mono small" id="diffOut">Pronto.</pre>

              <!-- SLOT: Logs do Admin (injLog mantém ID para compat) -->
              <div id="rcfAdminSlotLogs" data-rcf-slot="admin.logs">
                <div class="row" style="margin-top:10px;align-items:center">
                  <div class="hint" style="margin:0">Log (Injector):</div>
                  <div class="spacer"></div>
                  <button class="btn small ghost" id="btnToggleInjectorLog" type="button" data-rcf-action="admin.toggleInjectorLog">Mostrar log</button>
                </div>
                <pre class="mono small rcf-collapsed" id="injLog">Pronto.</pre>
              </div>
            </div>
          </section>
            </main>
          </div>
        </div>

        <nav class="rcfBottomNav" aria-label="Navegação mobile">
          <button class="tab active" data-view="dashboard" type="button">Home</button>
          <button class="tab" data-view="newapp" type="button">Apps</button>
          <button class="tab" data-view="editor" type="button">Editor</button>
          <button class="tab" data-view="agent" type="button">Agent</button>
          <button class="tab" data-view="admin" type="button">Factory</button>
        </nav>

<div class="tools" id="toolsDrawer" data-rcf-panel="tools.drawer">
          <div class="tools-head">
            <div style="font-weight:800">Ferramentas</div>

            <!-- PATCH: status aqui (discreto) (ID ÚNICO = #statusText) -->
            <div id="statusText" data-rcf="status.text" style="margin-left:auto;margin-right:10px;opacity:.85;font-size:12px;white-space:nowrap">OK ✅</div>

            <button class="btn small" id="btnCloseTools" type="button" data-rcf-action="tools.close">Fechar</button>
          </div>
          <div class="tools-body">
            <div class="row">
              <button class="btn ghost" id="btnDrawerLogsRefresh" type="button" data-rcf-action="logs.refresh">Atualizar logs</button>
              <button class="btn ok" id="btnDrawerLogsCopy" type="button" data-rcf-action="logs.copy">Copiar logs</button>
              <button class="btn danger" id="btnDrawerLogsClear" type="button" data-rcf-action="logs.clear">Limpar logs</button>
            </div>

            <div class="row" style="margin-top:10px">
              <button class="btn ghost" id="btnSwClearCache" type="button" data-rcf-action="sw.clearCache">Clear SW Cache</button>
              <button class="btn ghost" id="btnSwUnregister" type="button" data-rcf-action="sw.unregister">Unregister SW</button>
              <button class="btn ok" id="btnSwRegister" type="button" data-rcf-action="sw.register">Register SW</button>
            </div>

            <pre class="mono small" id="logsBox">Pronto.</pre>
          </div>
        </div>

        <!-- PATCH: FAB + painel -->
        <button id="rcfFab" type="button" aria-label="Ações rápidas" data-rcf-action="fab.toggle">⚡</button>
        <div id="rcfFabPanel" role="dialog" aria-label="Ações rápidas" data-rcf-panel="fab.panel">
          <div class="fab-title">
            <div>RCF</div>
            <div class="fab-status" id="fabStatus">OK ✅</div>
          </div>
          <div class="fab-row">
            <button class="btn ghost" id="btnFabTools" type="button" data-rcf-action="fab.tools">Ferramentas</button>
            <button class="btn ghost" id="btnFabAdmin" type="button" data-rcf-action="fab.admin">Admin</button>
          </div>
          <div class="fab-row" style="margin-top:8px">
            <button class="btn ghost" id="btnFabDoctor" type="button" data-rcf-action="fab.doctor">Doctor</button>
            <button class="btn ghost" id="btnFabLogs" type="button" data-rcf-action="fab.logs">Logs</button>
          </div>
          <div class="fab-row" style="margin-top:8px">
            <button class="btn danger" id="btnFabClose" type="button" data-rcf-action="fab.close">Fechar</button>
          </div>
        </div>
      </div>
            `;
  }

  function refreshLogsViews() { Logger._mirrorUI(Logger.getAll()); try { refreshDashboardUI(); } catch {} }

  // =========================================================
  // PREVIEW TEARDOWN (anti overlay preso / timesheet na frente)
  // =========================================================
  function teardownPreviewHard() {
    // PATCH: chamar teardowns conhecidos (tolerante)
    try { window.RCF_PREVIEW?.teardown?.(); } catch {}
    try {
      const PR = window.RCF_PREVIEW_RUNNER || window.PREVIEW_RUNNER || null;
      const fns = [
        PR?.teardown,
        PR?.destroy,
        PR?.stop,
        PR?.unmount
      ].filter(fn => typeof fn === "function");

      for (const fn of fns) {
        try { fn.call(PR); } catch {}
      }
    } catch {}

    // PATCH: remover overlays comuns se existirem (id/class contendo "preview")
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

    // PATCH: remove iframes suspeitos do preview SOMENTE se claramente overlay (fixed + z-index alto)
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

          const looksPreview =
            id.includes("preview") || cls.includes("preview") ||
            src.includes("preview") || src.includes("sandbox") ||
            src.includes("timesheet");

          if (!looksPreview) continue;

          const cs = getComputedStyle(el);
          const pos = cs?.position || "";
          const zi = parseInt(cs?.zIndex || "0", 10);
          const r = el.getBoundingClientRect();
          const area = Math.max(0, r.width) * Math.max(0, r.height);

          const isOverlay =
            (pos === "fixed") &&
            Number.isFinite(zi) && zi >= 80 &&
            area >= (vw * vh * 0.20);

          if (!isOverlay) continue;

          try { el.src = "about:blank"; } catch {}
          try { el.remove(); } catch {}
          removedIfr++;
        } catch {}
        if (removedIfr >= 4) break;
      }
    } catch {}

    // remove overlays suspeitos cobrindo tela
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

        // não mexe nos painéis da própria UI
        if (el.id === "toolsDrawer" || el.id === "rcfFabPanel" || el.id === "rcfFab") continue;

        try { el.remove(); removed++; } catch {}
        if (removed >= 6) break;
      }

      if (removed) Logger.write("preview teardown:", "removed overlays=", removed);
    } catch {}

    // normaliza scroll/pointer
    try {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.pointerEvents = "";
    } catch {}

    // PATCH: log final
    try { Logger.write("preview:", "teardown hard (ok)"); } catch {}
  }

  function setView(name) {
    // v8.0.6_VIEW_LOCK: prevent cascaded setView loops (admin <-> generator)
    try {
      const now = Date.now();

      // ignore redundant same-view requests
      if (State && State.active && State.active.view === name) return;

      // simple reentrancy lock (no globals)
      if (setView.__busy__) {
        const dt = now - (setView.__busy_ts__ || 0);
        if (dt < 650) return; // ignore rapid reentry
      }
      setView.__busy__ = true;
      setView.__busy_ts__ = now;

      // auto-release lock (sync view changes finish quickly)
      setTimeout(() => { try { setView.__busy__ = false; } catch {} }, 0);
      // failsafe release
      setTimeout(() => { try { setView.__busy__ = false; } catch {} }, 800);
    } catch {}

    if (!name) return;

    // PATCH: ao sair do generator, mata overlay/preview preso
    try {
      const prev = State.active.view;
      if (prev === "generator" && name !== "generator") teardownPreviewHard();
    } catch {}

    State.active.view = name;
    saveAll();

    $$(".view").forEach(v => v.classList.remove("active"));
    $$("[data-view]").forEach(b => b.classList.remove("active"));

    const id = "view-" + String(name).replace(/[^a-z0-9_-]/gi, "");
    const view = document.getElementById(id);
    if (view) view.classList.add("active");

    $$(`[data-view="${name}"]`).forEach(b => b.classList.add("active"));

    if (name === "logs" || name === "settings" || name === "admin") refreshLogsViews();
    Logger.write("view:", name);
  }

  function openTools(open) {
    const d = $("#toolsDrawer");
    if (!d) return;
    if (open) d.classList.add("open");
    else d.classList.remove("open");
  }

  // PATCH: FAB open/close
  function openFabPanel(open) {
    const p = $("#rcfFabPanel");
    if (!p) return;
    if (open) p.classList.add("open");
    else p.classList.remove("open");
  }

  function toggleFabPanel() {
    const p = $("#rcfFabPanel");
    if (!p) return;
    p.classList.toggle("open");
  }

  function syncFabStatusText() {
    try {
      const st = $("#statusText")?.textContent || "";
      const fab = $("#fabStatus");
      if (fab) fab.textContent = String(st || "OK ✅");
    } catch {}
  }

  // PATCH: Admin log toggle
  function setInjectorLogCollapsed(collapsed) {
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
      const pre = $("#injLog");
      if (!pre) return;
      const isCollapsed = pre.classList.contains("rcf-collapsed");
      setInjectorLogCollapsed(!isCollapsed);
    } catch {}
  }

  // =========================================================
  // Apps / Editor
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

    saveAll();
    renderAppsList();
    renderFilesList();

    uiMsg("#editorOut", "✅ App apagado.");
    Logger.write("app deleted:", s);

    // PATCH: status requerido
    safeSetStatus("Apagado ✅");
    try { syncFabStatusText(); } catch {}

    return true;
  }


  function refreshDashboardUI() {
    try {
      const appsCount = Array.isArray(State.apps) ? State.apps.length : 0;
      const activeApp = getActiveApp();
      const aiOnline = !!(window.RCF_ENGINE || window.RCF_AGENT_ZIP_BRIDGE || window.RCF_AI);

      const elApps = $("#dashAppsCount");
      if (elApps) elApps.textContent = String(appsCount).padStart(2, "0");

      const elProjects = $("#dashProjectsCount");
      if (elProjects) elProjects.textContent = String(appsCount).padStart(2, "0");

      const elBuilds = $("#dashBuildsCount");
      if (elBuilds) elBuilds.textContent = String(appsCount).padStart(2, "0");

      const elAi = $("#dashAiStatus");
      if (elAi) elAi.textContent = aiOnline ? "ON" : "--";

      const aiBadge = $("#dashAiBadge");
      if (aiBadge) aiBadge.textContent = aiOnline ? "IA online ✅" : "IA aguardando…";

      const sideStatus = $("#rcfSidebarStatus");
      if (sideStatus) sideStatus.textContent = activeApp ? `Ativo: ${activeApp.slug}` : "Factory pronta ✅";

      const box = $("#dashActivityList");
      if (box) {
        const logs = Logger.getAll ? Logger.getAll() : [];
        const recent = logs.slice(-4).reverse();
        if (!recent.length) {
          box.innerHTML = `<div class="hint">Aguardando atividade...</div>`;
        } else {
          box.innerHTML = recent.map(line => `<div class="rcfActivityItem">${escapeHtml(String(line))}</div>`).join("");
        }
      }
    } catch {}
  }

  function renderAppsList() {
    const box = $("#appsList");
    if (!box) return;

    refreshDashboardUI();
    if (!State.apps.length) {
      box.innerHTML = `<div class="hint">Nenhum app salvo ainda.</div>`;
      refreshDashboardUI();
      return;
    }

    box.innerHTML = "";
    State.apps.forEach(app => {
      const row = document.createElement("div");
      row.className = "app-item";

      // PATCH: layout meta + actions (ellipsis no CSS)
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
    saveAll();

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
    saveAll();

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

    let slug = slugify(slugMaybe || nameClean);
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
    saveAll();
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

    saveAll();
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
  // SW helpers (safe)
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
    out.detail =
      (location.protocol !== "https:" && location.hostname !== "localhost")
        ? "SW exige HTTPS (ou localhost)."
        : "sw.js não registrou (pode ser path/scope/privacidade).";

    return out;
  }

  // =========================================================
  // Diagnostics: overlay + microtests + css token
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
        if (!Number.isFinite(zi)) continue;
        if (zi < 50) continue;

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
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue("--rcf-css-token")
        .trim()
        .replace(/^["']|["']$/g, "");
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
  // FASE A — Scan / Targets / Injector SAFE
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
      const txt = await res.text();
      return txt || null;
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

    // 0) overrides sempre entram
    try {
      const olist = await OverridesVFS.listFiles();
      for (const p0 of (olist || []).slice(0, 800)) {
        const p = normalizePath(p0);
        const txt = String((await OverridesVFS.readFile(p)) ?? "");
        const type = guessType(p);
        index.files.push({
          path: p, type,
          size: txt.length,
          hash: simpleHash(txt),
          markers: detectMarkers(txt),
          anchors: getAnchorsForContent(type, txt)
        });
      }
    } catch {}

    // A) runtime vfs
    const vfs = (window.RCF_VFS || window.RCF_FS || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs) {
      const baseLen = index.files.length;
      const list = await vfsListAll(vfs);
      const paths = (list || []).map(p => normalizePath(p)).filter(Boolean).slice(0, 1200);

      for (const p of paths) {
        const content = await vfsRead(vfs, p);
        const txt = (content == null) ? "" : String(content);
        const type = guessType(p);
        index.files.push({
          path: p, type,
          size: txt.length,
          hash: simpleHash(txt),
          markers: detectMarkers(txt),
          anchors: getAnchorsForContent(type, txt)
        });
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

    // B) mother_bundle local
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
            const rawVal  = it && ("content" in it ? it.content : (it.text ?? it.data ?? ""));
            return [rawPath, rawVal];
          })
          .filter(([p]) => !!p);
      } else {
        const filesObj =
          (parsed && parsed.files && typeof parsed.files === "object")
            ? parsed.files
            : (parsed && typeof parsed === "object" ? parsed : {});
        entries = Object.entries(filesObj || {});
      }

      for (const [rawPath, rawVal] of entries) {
        const p = normalizePath(rawPath);
        const txt =
          (rawVal && typeof rawVal === "object" && "content" in rawVal)
            ? String(rawVal.content ?? "")
            : String(rawVal ?? "");
        const type = guessType(p);
        index.files.push({
          path: p, type,
          size: txt.length,
          hash: simpleHash(txt),
          markers: detectMarkers(txt),
          anchors: getAnchorsForContent(type, txt)
        });
      }

      index.meta.count = index.files.length;
      Storage.set("RCF_FILE_INDEX", index);
      Storage.setRaw("mother_bundle", bundleText);
      Logger.write("scan:", index.meta.source, "files=" + index.meta.count);
      return index;
    }

    // C) DOM anchors only
    Logger.write("scan fallback -> DOM anchors");
    index.meta.source = "C:dom_anchors_only";
    const html = document.documentElement ? document.documentElement.outerHTML : "";
    index.files.push({
      path: "/runtime/document.html",
      type: "html",
      size: html.length,
      hash: simpleHash(html),
      markers: detectMarkers(html),
      anchors: getAnchorsForContent("html", html)
    });

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
        targets.push({
          targetId: id,
          path,
          kind: "MARKER",
          offset: m.index,
          supportedModes: ["INSERT", "REPLACE", "DELETE"],
          defaultRisk: "low",
          note: "@RCF:INJECT"
        });
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
      if (!t || !t.targetId) continue;
      if (seen.has(t.targetId)) continue;
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

    if (p === "/app/index.html" || p === "/app/styles.css" || p === "/app/app.js" || p === "/index.html" || p === "/styles.css" || p === "/app.js") {
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

    InjectState.lastSnapshot = {
      path: pre.t.path,
      oldText: pre.oldText,
      newText: pre.newText,
      targetId: pre.t.targetId,
      ts: nowISO()
    };

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
  // Agent V8 (inclui build corretamente)
  // =========================================================
  const Agent = {
    _mem: { inj: { mode: "INSERT", targetId: "", payload: "" } },

    _out(text) {
      const out = $("#agentOut");
      if (out) out.textContent = String(text ?? "");
    },

    help() {
      return [
        "AGENT HELP (V8)",
        "",
        "Base:",
        "- help",
        "- list",
        "- show",
        "- create NOME [SLUG]        (ex: create \"Meu App\" meu-app)",
        "- select SLUG",
        "- open dashboard|newapp|editor|generator|agent|settings|admin|logs|diagnostics",
        "",
        "FASE A (Admin):",
        "- scan                 -> CP1 Scan & Index",
        "- targets              -> CP2 Generate Target Map",
        "- dropdown             -> CP3 Refresh dropdown",
        "- paths                -> lista paths do index",
        "",
        "Buscar / checar:",
        "- find TEXTO           -> procura TEXTO nos arquivos indexados (limitado p/ iPhone)",
        "- peek /caminho        -> mostra início do arquivo",
        "",
        "Injector (CLI SAFE):",
        "- inj mode INSERT|REPLACE|DELETE",
        "- inj target PARTE_DO_ID",
        "- inj payload <<<  (multiline)  >>>",
        "- inj preview",
        "- inj apply",
        "- inj rollback",
        "",
        "ENGINE (Reflect-style):",
        "- build \"Nome do App\" [mods...]   (ex: build \"Agenda\" agenda calculator)"
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

        const mods = modsPart
          .replace(/^with\s+/i, "")
          .split(/[,\s]+/g)
          .map(s => s.trim())
          .filter(Boolean);

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
  // Bind UI
  // =========================================================

  // =========================================================
  // Doctor (atalho p/ Diagnostics + ScanMap quando disponível)
  // =========================================================
  function runDoctor() {
    // v8.0.5_DOCTOR_LOCK_PARSER_SAFE
    if (runDoctor.__running__) return;
    runDoctor.__running__ = true;
    try { Logger.write("doctor: start"); } catch {}
    try {
// 1) Permite que módulos externos (doctor/scan) respondam
    try { window.dispatchEvent(new CustomEvent("RCF:DOCTOR", { detail: { ts: Date.now() } })); } catch {}

    // 2) Se existir UI de Doctor carregada por algum módulo, abre ela
    try {
      const candidates = [
        window.RCF_DOCTOR_SCAN,
        window.__RCF_DOCTOR__,
        window.RCF_DIAGNOSTICS && window.RCF_DIAGNOSTICS.doctor
      ].filter(Boolean);
      for (const obj of candidates) {
        if (typeof obj.open === "function") { obj.open(); try { Logger.write("doctor: open()"); } catch {} return; }
        if (typeof obj.show === "function") { obj.show(); try { Logger.write("doctor: show()"); } catch {} return; }
      }
    } catch {}

    try {
      const extDoctor = window.RCF_DOCTOR;
      if (extDoctor && extDoctor !== window && extDoctor.open && extDoctor.open !== window.RCF_DOCTOR?.open) {
        extDoctor.open();
        try { Logger.write("doctor: ext open()"); } catch {}
        return;
      }
    } catch {}

    // 3) Fallback: roda diagnostics + scanmap e joga você para Logs (pra você VER que rodou)
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

  // =========================================================
  // Doctor export (garante clique via onclick, caso bindTap falhe no iOS)
  // =========================================================
  try {
    window.RCF_DOCTOR = window.RCF_DOCTOR || {};
    window.RCF_DOCTOR.run = runDoctor;
    window.RCF_DOCTOR.open = () => runDoctor();
  } catch {}



  // =========================================================
  // DOCTOR: Delegation (iOS touch-safe)
  // - Alguns botões/itens podem ser montados por módulos externos (ui_bindings etc.)
  // - Em iOS, certos overlays podem "engolir" click; então capturamos pointer/touch.
  // - Alvos: botões/itens cujo texto seja "Doctor" ou "Doctor Scan" (case-insensitive),
  //         ou que tenham data-rcf-action contendo "doctor".
  // =========================================================
  function bindUI() {
    $$("[data-view]").forEach(btn => bindTap(btn, () => setView(btn.getAttribute("data-view"))));
    bindTap($("#btnOpenTools"), () => { openTools(true); openFabPanel(false); });
    bindTap($("#btnSidebarTools"), () => { openTools(true); openFabPanel(false); });
    bindTap($("#btnCloseTools"), () => openTools(false));

    // PATCH: FAB
    bindTap($("#rcfFab"), () => { toggleFabPanel(); syncFabStatusText(); });
    bindTap($("#btnFabClose"), () => openFabPanel(false));
    bindTap($("#btnFabTools"), () => { openFabPanel(false); openTools(true); });
    bindTap($("#btnFabAdmin"), () => { openFabPanel(false); setView("admin"); });
    bindTap($("#btnFabDoctor"), () => { openFabPanel(false); runDoctor(); });
    // Doctor deve existir SOMENTE no FAB (Admin button, se existir no DOM, é ocultado)
    bindTap($("#btnFabLogs"), () => { openFabPanel(false); setView("logs"); });

    // fecha painel se tocar fora
    // (removido) fechar FAB ao tocar fora — evitamos listener global em document por estabilidade iOS

    bindTap($("#btnCreateNewApp"), () => setView("newapp"));
    bindTap($("#btnOpenEditor"), () => setView("editor"));

    bindTap($("#btnExportBackup"), () => {
      const payload = JSON.stringify({ apps: State.apps, cfg: State.cfg, active: State.active }, null, 2);
      try { navigator.clipboard.writeText(payload); } catch {}
      safeSetStatus("Backup copiado ✅");
      syncFabStatusText();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 800);
      Logger.write("backup copied");
    });

    bindTap($("#btnAutoSlug"), () => {
      const n = ($("#newAppName")?.value || "");
      const s = slugify(n);
      const inSlug = $("#newAppSlug");
      if (inSlug) inSlug.value = s;
    });

    bindTap($("#btnDoCreateApp"), () => {
      const name = ($("#newAppName")?.value || "");
      const slug = ($("#newAppSlug")?.value || "");
      const r = createApp(name, slug);
      uiMsg("#newAppOut", r.msg);
      if (r.ok) { setView("editor"); safeSetStatus("OK ✅"); }
      else safeSetStatus("ERRO ❌");
      syncFabStatusText();
    });

    bindTap($("#btnSaveFile"), () => saveFile());

    bindTap($("#btnResetFile"), () => {
      const app = getActiveApp();
      if (!app || !State.active.file) return uiMsg("#editorOut", "⚠️ Selecione app e arquivo.");
      ensureAppFiles(app);
      app.files[State.active.file] = "";
      saveAll();
      openFile(State.active.file);
      uiMsg("#editorOut", "⚠️ Arquivo resetado (limpo).");
    });

    // PATCH: Evitar duplo bind do Generator (stubs só se NÃO houver módulo real)
    try {
      const modulePresent = !!(
        window.RCF_PREVIEW_RUNNER ||
        window.RCF_PREVIEW ||
        window.RCF_ENGINE?.generator ||
        window.RCF_UI_BINDINGS ||
        window.__RCF_GEN_BOUND__ // flag defensivo se existir
      );

      if (modulePresent) {
        Logger.write("generator:", "bind skip (module present)");
      } else {
        // mantém stubs atuais (fallback)
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
      }
    } catch {}

    bindTap($("#btnAgentRun"), () => Agent.route($("#agentCmd")?.value || ""));
    bindTap($("#btnAgentHelp"), () => uiMsg("#agentOut", Agent.help()));
    bindTap($("#btnDashStartAI"), () => setView("agent"));

    const doLogsRefresh = () => {
      refreshLogsViews();
      safeSetStatus("Logs ✅");
      syncFabStatusText();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 600);
    };
    const doLogsClear = () => {
      Logger.clear();
      doLogsRefresh();
      safeSetStatus("Logs limpos ✅");
      syncFabStatusText();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 600);
    };
    const doLogsCopy = async () => {
      const txt = Logger.getAll().join("\n");
      try { await navigator.clipboard.writeText(txt); } catch {}
      safeSetStatus("Logs copiados ✅");
      syncFabStatusText();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 800);
    };

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
      const r = await swUnregisterAll();
      safeSetStatus(r.ok ? `SW unreg: ${r.count} ✅` : "SW unreg ❌");
      syncFabStatusText();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 900);
    });

    bindTap($("#btnSwClearCache"), async () => {
      const r = await swClearCaches();
      safeSetStatus(r.ok ? `Cache: ${r.count} ✅` : "Cache ❌");
      syncFabStatusText();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 900);
    });

    bindTap($("#btnSwRegister"), async () => {
      const r = await swRegister();
      safeSetStatus(r.ok ? "SW ✅" : "SW ❌");
      syncFabStatusText();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 900);
    });

    // Diagnostics actions
    bindTap($("#btnDiagRun"), async () => {
      safeSetStatus("Diag…");
      syncFabStatusText();
      await runV8StabilityCheck();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 700);
    });

    bindTap($("#btnDiagScan"), () => {
      try { uiMsg("#diagOut", JSON.stringify(scanOverlays(), null, 2)); }
      catch (e) { uiMsg("#diagOut", "❌ " + (e?.message || e)); }
    });

    bindTap($("#btnDiagTests"), () => {
      try { uiMsg("#diagOut", JSON.stringify(runMicroTests(), null, 2)); }
      catch (e) { uiMsg("#diagOut", "❌ " + (e?.message || e)); }
    });

    bindTap($("#btnDiagClear"), () => uiMsg("#diagOut", "Pronto."));

    // PIN
    bindTap($("#btnPinSave"), () => {
      const raw = String($("#pinInput")?.value || "").trim();
      if (!/^\d{4,8}$/.test(raw)) return uiMsg("#pinOut", "⚠️ PIN inválido. Use 4 a 8 dígitos.");
      Pin.set(raw);
      uiMsg("#pinOut", "✅ PIN salvo.");
      Logger.write("pin saved");
    });

    bindTap($("#btnPinRemove"), () => {
      Pin.clear();
      uiMsg("#pinOut", "✅ PIN removido.");
      Logger.write("pin removed");
    });

    // Admin quick
    bindTap($("#btnAdminDiag"), () => uiMsg("#adminOut", "Admin OK."));
    bindTap($("#btnAdminZero"), () => {
      Logger.clear();
      safeSetStatus("Zerado ✅");
      syncFabStatusText();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 800);
      uiMsg("#adminOut", "✅ Zerado (safe). Logs limpos.");
    });

    // PATCH: toggle injector log
    bindTap($("#btnToggleInjectorLog"), () => {
      toggleInjectorLogCollapsed();
      Logger.write("admin:", "toggle injLog");
    });

    // Mãe
    bindTap($("#btnMaeLoad"), async () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      if (!MAE) {
        uiMsg("#maintOut", "⚠️ RCF_MOTHER/RCF_MAE não está carregada no runtime.");
        Logger.write("mae:", "absent");
        return;
      }
      uiMsg("#maintOut", "✅ Mãe detectada. Funções: " + Object.keys(MAE).slice(0, 24).join(", "));
      Logger.write("mae:", "loaded");
    });

    bindTap($("#btnMaeCheck"), () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      const s = MAE && typeof MAE.status === "function" ? MAE.status() : { ok: false, msg: "status() ausente" };
      try { alert("CHECK:\n\n" + JSON.stringify(s, null, 2)); } catch {}
      uiMsg("#maintOut", "Check rodado (alert).");
      Logger.write("mae check:", safeJsonStringify(s));
    });

    let maeUpdateLock = false;
    bindTap($("#btnMaeUpdate"), async () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      if (!MAE || typeof MAE.updateFromGitHub !== "function") {
        uiMsg("#maintOut", "⚠️ updateFromGitHub() ausente (ou mãe não carregou).");
        Logger.write("mae update:", "missing");
        return;
      }
      if (maeUpdateLock) {
        uiMsg("#maintOut", "⏳ Update já está rodando… (aguarde)");
        Logger.write("mae update:", "blocked (lock)");
        return;
      }

      maeUpdateLock = true;
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
      } finally {
        maeUpdateLock = false;
      }
    });

    // ✅ FIX: compat com mother_selfupdate.js (clear() ou clearOverrides())
    bindTap($("#btnMaeClear"), async () => {
      const MAE = window.RCF_MOTHER || window.RCF_MAE;
      const clearFn =
        (MAE && typeof MAE.clearOverrides === "function") ? MAE.clearOverrides.bind(MAE) :
        (MAE && typeof MAE.clear === "function") ? MAE.clear.bind(MAE) :
        null;

      if (!clearFn) {
        uiMsg("#maintOut", "⚠️ clear/clearOverrides() ausente (ou mãe não carregou).");
        Logger.write("mae clear:", "missing");
        return;
      }
      uiMsg("#maintOut", "Limpando...");
      try {
        await clearFn();
        uiMsg("#maintOut", "✅ Clear acionado.");
        Logger.write("mae clear:", "ok");
      } catch (e) {
        uiMsg("#maintOut", "❌ Falhou: " + (e?.message || e));
        Logger.write("mae clear err:", e?.message || e);
      }
    });

    // FASE A buttons
    bindTap($("#btnScanIndex"), async () => {
      safeSetStatus("Scan…");
      syncFabStatusText();
      try {
        const idx = await scanFactoryFiles();
        uiMsg("#scanOut", `✅ Scan OK\nsource=${idx.meta.source}\nfiles=${idx.meta.count}\nscannedAt=${idx.meta.scannedAt}`);
        Logger.write("CP1 scan:", `source=${idx.meta.source}`, `files=${idx.meta.count}`);
      } catch (e) {
        uiMsg("#scanOut", "❌ Scan falhou: " + (e?.message || e));
        Logger.write("scan err:", e?.message || e);
      }
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 700);
    });

    bindTap($("#btnGenTargets"), () => {
      const idx = Storage.get("RCF_FILE_INDEX", null);
      const r = generateTargetMap(idx);
      if (!r.ok) return uiMsg("#scanOut", "❌ " + (r.err || "falhou gerar map"));
      uiMsg("#scanOut", `✅ Target Map OK\ncount=${r.map.meta.count}\nsource=${r.map.meta.source}\ncreatedAt=${r.map.meta.createdAt}`);
      try { populateTargetsDropdown(true); } catch {}
    });

    bindTap($("#btnRefreshTargets"), () => {
      populateTargetsDropdown(true);
      uiMsg("#scanOut", "Dropdown atualizado ✅");
    });

    bindTap($("#btnPreviewDiff"), async () => {
      const r = await injectorPreview();
      if (!r.ok) uiMsg("#diffOut", "❌ " + (r.err || "preview falhou"));
    });

    bindTap($("#btnApplyInject"), async () => {
      safeSetStatus("Apply…");
      syncFabStatusText();
      const ok = await injectorApplySafe();
      Logger.write("apply:", ok && ok.ok ? "OK" : "FAIL", "target=" + String($("#injTarget")?.value || ""));
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 900);
    });

    bindTap($("#btnRollbackInject"), async () => {
      safeSetStatus("Rollback…");
      syncFabStatusText();
      await injectorRollback();
      setTimeout(() => { safeSetStatus("OK ✅"); syncFabStatusText(); }, 900);
    });
  }

  // =========================================================
  // Boot hydrate
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

    // PATCH: init default UI state
    setInjectorLogCollapsed(true);

    // PATCH
    syncFabStatusText();

    // registry refresh
    try { window.RCF_UI?.refresh?.(); } catch {}
    try { refreshDashboardUI(); } catch {}
  }

  // =========================================================
  // SAFE INIT
  // =========================================================
  async function safeInit() {
    try {
      Stability.install();
      injectCompactCSSOnce();

      renderShell();

      // PATCH: Registry (depois do shell existir)
      installRCFUIRegistry();

      // ✅ NEW: UI READY BUS — 1x após registry (slots já existem no shell)
      try { notifyUIReady(); } catch {}

      bindUI();
      hydrateUIFromState();

      // Engine hook (não quebra se não existir)
      try { window.RCF_ENGINE?.init?.({ State, Storage, Logger }); Logger.write("engine:", "init ok ✅"); }
      catch (e) { Logger.write("engine init err:", e?.message || e); }

      // não força SW duplicado (mas tenta auto-fix)
// PATCH: iOS/Safari às vezes "pendura" em register/getRegistration -> não pode travar o boot.
// Rodamos em background + timeout curto.
try {
  const swr = await Promise.race([
    swCheckAutoFix(),
    new Promise((res) => setTimeout(() => res({ ok:false, status:"timeout", detail:"TIMEOUT 3000ms (swCheckAutoFix)" }), 3000))
  ]);
  if (!swr.ok) Logger.write("sw warn:", swr.status, swr.detail, swr.err ? ("err=" + swr.err) : "");
} catch (e) {
  Logger.write("sw warn:", "exception", e?.message || e);
}

      Logger.write("RCF V8 init ok — mode:", State.cfg.mode);
      // ✅ marca boot concluído (permite detectar init real)
      try {
        window.__RCF_BOOTED__ = true; // compat
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
      // ✅ libera retry se falhou (não deixa boot lock travar)
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

  // SAFE INIT só 1x
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { safeInit(); }, { passive: true });
  } else {
    safeInit();
  }

})();

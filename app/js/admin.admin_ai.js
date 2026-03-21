/* FILE: /app/js/admin.admin_ai.js
   RControl Factory
   /app/js/admin.admin_ai.js
   v4.3.6-r2 SAFE HOT-RELOAD + CSS REFRESH PATCH
   - minimal hot-reload patch over v4.3.6-r1
   - preserves tolerant mount behavior
   - rebootstrap-safe on runtime file replace
*/
(() => {
  "use strict";

  // =========================================================
  // 0) HOT-RELOAD SAFE PRE-CLEANUP
  // =========================================================
  try {
    const prevRuntime = window.__RCF_ADMIN_AI_RUNTIME__;
    if (prevRuntime && typeof prevRuntime.destroy === "function") {
      try { prevRuntime.destroy("hot-reload"); } catch (_) {}
    } else {
      try {
        if (window.RCF_FACTORY_AI && typeof window.RCF_FACTORY_AI.unmount === "function") {
          window.RCF_FACTORY_AI.unmount();
        }
      } catch (_) {}
      try {
        if (window.RCF_ADMIN_AI && typeof window.RCF_ADMIN_AI.unmount === "function") {
          window.RCF_ADMIN_AI.unmount();
        }
      } catch (_) {}
    }
  } catch (_) {}

  // do not hard-abort on hot reload; convert guard to reentry-safe mark
  window.__RCF_ADMIN_AI_BOOTED__ = true;

  // =========================================================
  // 1) GUARDS / VERSION / CONSTANTS
  // =========================================================
  const VERSION = "v4.3.6-r2 SAFE HOT-RELOAD + CSS REFRESH PATCH";
  const BUILD = "[ADMIN_AI]";
  const API_NAME = "RCF_FACTORY_AI";
  const LEGACY_API_NAME = "RCF_ADMIN_AI";
  const CSS_ID = "rcf-admin-ai-css";
  const ROOT_ATTR = "data-rcf-admin-ai-root";
  const DEFAULT_ENDPOINT = "/api/admin-ai";
  const MAX_HISTORY = 120;
  const MAX_RENDERED_HISTORY = 120;
  const MAX_ATTACHMENTS = 8;
  const MAX_FILE_SIZE = 8 * 1024 * 1024;
  const MAX_INLINE_PREVIEW = 350 * 1024;
  const MAX_VOICE_TEXT = 3200;
  const MAX_RUNTIME_TEXT = 32000;
  const MOUNT_RETRY_MS = 1200;
  const SYNC_INTERVAL_MS = 1800;
  const SCROLL_BOTTOM_THRESHOLD = 120;

  const STORAGE_KEYS = {
    history: "rcf:factory_ai:history",
    draft: "rcf:factory_ai:draft",
    lastEndpoint: "rcf:factory_ai:last_endpoint",
    ui: "rcf:factory_ai:ui",
    attachmentsMeta: "rcf:factory_ai:attachments_meta"
  };

  // =========================================================
  // 2) INTERNAL STATE
  // =========================================================
  const state = {
    bootedAt: Date.now(),
    mounted: false,
    mounting: false,
    host: null,
    ui: null,
    syncTimer: null,
    mountTimer: null,
    history: [],
    attachments: [],
    busy: false,
    isSyncing: false,
    mountCount: 0,
    lastEndpoint: readStorage(STORAGE_KEYS.lastEndpoint, ""),
    lastRoute: "",
    lastSnapshotAt: 0,
    pendingMessageId: "",
    recognition: null,
    voiceListening: false,
    speaking: false,
    autoRead: false,
    shouldAutoStick: true,
    lastKnownScrollTop: 0,
    boundDocClick: null,
    boundVisibility: null,
    boundResize: null,
    lastHostSignature: "",
    composerStatusText: "",
    menuOpen: false
  };

  // =========================================================
  // 3) UTIL HELPERS
  // =========================================================
  function safeLoggerPush(level, message) {
    try {
      const logger = window.RCF_LOGGER;
      if (!logger || typeof logger.push !== "function") return false;

      try {
        logger.push(level, message);
        return true;
      } catch (_) {}

      try {
        logger.push(message);
        return true;
      } catch (_) {}

      return false;
    } catch (_) {
      return false;
    }
  }

  function argsToText(argsLike) {
    const args = Array.prototype.slice.call(argsLike || []);
    return args.map((v) => {
      if (typeof v === "string") return v;
      try { return JSON.stringify(v); } catch (_) {}
      try { return String(v); } catch (_) { return "[unserializable]"; }
    }).join(" ");
  }

  function log() {
    const msg = BUILD + " " + argsToText(arguments);
    try { console.log(msg); } catch (_) {}
    safeLoggerPush("INFO", msg);
  }

  function warn() {
    const msg = BUILD + " " + argsToText(arguments);
    try { console.warn(msg); } catch (_) {}
    safeLoggerPush("WARN", msg);
  }

  function errLog() {
    const msg = BUILD + " " + argsToText(arguments);
    try { console.error(msg); } catch (_) {}
    safeLoggerPush("ERROR", msg);
  }

  function isFn(v) { return typeof v === "function"; }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function isArr(v) { return Array.isArray(v); }

  function nowIso() {
    try { return new Date().toISOString(); } catch (_) { return ""; }
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
  }

  function clampText(text, max) {
    text = String(text == null ? "" : text);
    max = Number(max || 0) || MAX_RUNTIME_TEXT;
    if (text.length <= max) return text;
    return text.slice(0, max) + "\n\n[truncated]";
  }

  function toArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function safeJsonParse(text, fallback) {
    try { return JSON.parse(text); } catch (_) { return fallback; }
  }

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : raw;
    } catch (_) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function deepGet(obj, path, fallback) {
    try {
      const parts = String(path || "").split(".");
      let ref = obj;
      for (let i = 0; i < parts.length; i += 1) {
        if (!parts[i]) continue;
        ref = ref ? ref[parts[i]] : undefined;
      }
      return ref == null ? fallback : ref;
    } catch (_) {
      return fallback;
    }
  }

  function bytesLabel(bytes) {
    bytes = Number(bytes || 0);
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function normalizeText(text) {
    return String(text == null ? "" : text).replace(/\r\n/g, "\n");
  }

  function ensureHistoryShape(list) {
    list = toArray(list).filter(Boolean).map((item) => {
      const msg = isObj(item) ? item : {};
      return {
        id: msg.id || uid("msg"),
        role: msg.role || "assistant",
        content: normalizeText(msg.content || ""),
        createdAt: msg.createdAt || nowIso(),
        route: msg.route || "",
        endpoint: msg.endpoint || "",
        error: !!msg.error,
        pending: !!msg.pending,
        attachments: toArray(msg.attachments).map(minifyAttachmentMeta)
      };
    });
    if (list.length > MAX_HISTORY) list = list.slice(-MAX_HISTORY);
    return list;
  }

  function normalizeRole(role) {
    role = String(role || "").toLowerCase();
    if (role === "user" || role === "assistant" || role === "system") return role;
    return "assistant";
  }

  function hasClipboard() {
    try { return !!(navigator && navigator.clipboard && navigator.clipboard.writeText); } catch (_) { return false; }
  }

  function copyText(text) {
    text = String(text == null ? "" : text);
    if (!text) return Promise.resolve(false);

    if (hasClipboard()) {
      try {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => Promise.resolve(legacyCopyText(text)));
      } catch (_) {}
    }

    return Promise.resolve(legacyCopyText(text));
  }

  function legacyCopyText(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  function scrollInfo(el) {
    if (!el) return { top: 0, height: 0, client: 0, distanceToBottom: 0, anchored: true };
    const top = el.scrollTop || 0;
    const height = el.scrollHeight || 0;
    const client = el.clientHeight || 0;
    const distanceToBottom = Math.max(0, height - client - top);
    const anchored = distanceToBottom <= SCROLL_BOTTOM_THRESHOLD;
    return { top, height, client, distanceToBottom, anchored };
  }

  function createEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = String(text);
    return el;
  }

  function requestAnimation(fn) {
    try { return window.requestAnimationFrame(fn); } catch (_) { return setTimeout(fn, 16); }
  }

  function resolveFactoryState() {
    return isObj(window.RCF_FACTORY_STATE) ? window.RCF_FACTORY_STATE : {};
  }

  function resolveContext() {
    return isObj(window.RCF_CONTEXT) ? window.RCF_CONTEXT : {};
  }

  function resolveRegistry() {
    return isObj(window.RCF_MODULE_REGISTRY) ? window.RCF_MODULE_REGISTRY : {};
  }

  function resolveFactoryTree() {
    return window.RCF_FACTORY_TREE || null;
  }

  function safeModuleKeys(obj, max) {
    try {
      return Object.keys(isObj(obj) ? obj : {}).slice(0, max || 80);
    } catch (_) {
      return [];
    }
  }

  function resolveHostSignature(host) {
    if (!host) return "";
    return [
      host.id || "",
      host.className || "",
      host.getAttribute ? (host.getAttribute("data-view") || "") : "",
      host.tagName || ""
    ].join("|");
  }

  function safeInvoke(target, names, args) {
    target = target || null;
    names = toArray(names);
    args = toArray(args);
    for (let i = 0; i < names.length; i += 1) {
      const fn = target ? target[names[i]] : null;
      if (isFn(fn)) {
        return fn.apply(target, args);
      }
    }
    throw new Error("No compatible method found: " + names.join(", "));
  }

  function isVisibleElement(el) {
    if (!el || !el.nodeType) return false;
    try {
      if (!document.body.contains(el)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
      if (rect.width <= 0 && rect.height <= 0) return false;
      return true;
    } catch (_) {
      return true;
    }
  }

  function removeAllLegacyRoots() {
    try {
      const roots = document.querySelectorAll("[" + ROOT_ATTR + "]");
      for (let i = 0; i < roots.length; i += 1) {
        const root = roots[i];
        if (root && root.parentNode) {
          root.parentNode.removeChild(root);
        }
      }
    } catch (_) {}
  }

  // =========================================================
  // 4) HISTORY HELPERS
  // =========================================================
  function loadHistory() {
    const raw = readStorage(STORAGE_KEYS.history, "[]");
    state.history = ensureHistoryShape(safeJsonParse(raw, []));
    return state.history.slice();
  }

  function saveHistory() {
    state.history = ensureHistoryShape(state.history);
    writeStorage(STORAGE_KEYS.history, JSON.stringify(state.history));
    return true;
  }

  function getHistory() {
    if (!state.history.length) loadHistory();
    return state.history.slice();
  }

  function buildMessage(role, content, extra) {
    extra = isObj(extra) ? extra : {};
    return {
      id: extra.id || uid("msg"),
      role: normalizeRole(role),
      content: normalizeText(content || ""),
      createdAt: extra.createdAt || nowIso(),
      route: extra.route || "",
      endpoint: extra.endpoint || "",
      error: !!extra.error,
      pending: !!extra.pending,
      attachments: toArray(extra.attachments).map(minifyAttachmentMeta)
    };
  }

  function pushMessage(message, renderNow) {
    state.history.push(buildMessage(
      message.role,
      message.content,
      message
    ));
    if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY);
    saveHistory();
    if (renderNow !== false) appendRenderedMessage(state.history[state.history.length - 1]);
    return state.history[state.history.length - 1];
  }

  function replaceMessage(messageId, patch) {
    let found = false;
    state.history = state.history.map((msg) => {
      if (msg && msg.id === messageId) {
        found = true;
        return buildMessage(
          patch.role || msg.role,
          patch.content != null ? patch.content : msg.content,
          {
            id: msg.id,
            createdAt: patch.createdAt || msg.createdAt,
            route: patch.route != null ? patch.route : msg.route,
            endpoint: patch.endpoint != null ? patch.endpoint : msg.endpoint,
            error: patch.error != null ? patch.error : msg.error,
            pending: patch.pending != null ? patch.pending : msg.pending,
            attachments: patch.attachments != null ? patch.attachments : msg.attachments
          }
        );
      }
      return msg;
    });
    if (!found) {
      state.history.push(buildMessage(patch.role || "assistant", patch.content || "", patch));
    }
    saveHistory();
    rerenderHistoryPreservingScroll();
    return true;
  }

  function clearChat() {
    state.history = [];
    saveHistory();
    rerenderHistoryPreservingScroll(true);
    setComposerStatus("Histórico limpo.");
    return true;
  }

  // =========================================================
  // 5) RENDER HELPERS
  // =========================================================
  function ensureCss() {
    const cssText = `
      [${ROOT_ATTR}]{
        position:relative !important;
        display:flex !important;
        flex-direction:column !important;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        height:100% !important;
        min-height:0 !important;
        flex:1 1 auto !important;
        color:inherit !important;
        background:transparent !important;
        overflow:hidden !important;
        overflow-x:hidden !important;
        box-sizing:border-box !important;
        isolation:isolate !important;
        z-index:1 !important;
      }
      [${ROOT_ATTR}] *{
        box-sizing:border-box !important;
      }
      .rcf-admin-ai-root{
        position:relative;
        display:flex;
        flex-direction:column;
        width:100%;
        max-width:100%;
        min-width:0;
        height:100%;
        min-height:0;
        flex:1 1 auto;
        color:inherit;
        background:transparent;
        overflow:hidden;
        overflow-x:hidden;
      }
      .rcf-admin-ai-shell{
        position:relative;
        display:flex;
        flex-direction:column;
        width:100%;
        max-width:100%;
        min-width:0;
        height:100%;
        min-height:0;
        flex:1 1 auto;
        overflow:hidden;
        overflow-x:hidden;
        background:transparent;
      }
      .rcf-admin-ai-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        width:100%;
        max-width:100%;
        min-width:0;
        flex:0 0 auto;
        padding:12px;
        border-bottom:1px solid rgba(255,255,255,.08);
        overflow:hidden;
      }
      .rcf-admin-ai-head-left{
        min-width:0;
        max-width:100%;
        flex:1 1 auto;
        display:flex;
        align-items:center;
        gap:10px;
        overflow:hidden;
      }
      .rcf-admin-ai-badge{
        width:36px;
        height:36px;
        min-width:36px;
        flex:0 0 36px;
        border-radius:12px;
        display:flex;
        align-items:center;
        justify-content:center;
        background:rgba(255,255,255,.06);
      }
      .rcf-admin-ai-head-copy{
        min-width:0;
        max-width:100%;
        flex:1 1 auto;
        overflow:hidden;
      }
      .rcf-admin-ai-title{
        font-size:14px;
        font-weight:700;
        line-height:1.2;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .rcf-admin-ai-sub{
        font-size:11px;
        opacity:.72;
        line-height:1.2;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .rcf-admin-ai-head-actions{
        display:flex;
        align-items:center;
        gap:8px;
        flex:0 0 auto;
        min-width:0;
      }
      .rcf-admin-ai-btn,
      .rcf-admin-ai-iconbtn{
        border:0;
        outline:0;
        appearance:none;
        -webkit-appearance:none;
        background:rgba(255,255,255,.06);
        color:inherit;
        border-radius:12px;
        cursor:pointer;
        font:inherit;
        touch-action:manipulation;
        user-select:none;
        -webkit-user-select:none;
        position:relative;
        z-index:2;
      }
      .rcf-admin-ai-btn{
        height:34px;
        padding:0 12px;
        font-size:12px;
        white-space:nowrap;
        flex:0 0 auto;
      }
      .rcf-admin-ai-iconbtn{
        width:34px;
        min-width:34px;
        height:34px;
        display:flex;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }
      .rcf-admin-ai-body{
        position:relative;
        flex:1 1 auto;
        min-height:0;
        min-width:0;
        width:100%;
        max-width:100%;
        overflow-x:hidden;
        overflow-y:auto;
        padding:14px 12px 18px 12px;
        overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;
      }
      .rcf-admin-ai-list{
        width:100%;
        max-width:980px;
        min-width:0;
        margin:0 auto;
        display:flex;
        flex-direction:column;
        gap:12px;
      }
      .rcf-admin-ai-empty{
        text-align:center;
        font-size:13px;
        opacity:.72;
        padding:26px 14px;
        width:100%;
        min-width:0;
      }
      .rcf-admin-ai-row{
        display:flex;
        width:100%;
        min-width:0;
        max-width:100%;
      }
      .rcf-admin-ai-row.user{ justify-content:flex-end; }
      .rcf-admin-ai-row.assistant,
      .rcf-admin-ai-row.system{ justify-content:flex-start; }

      .rcf-admin-ai-bubble{
        position:relative;
        max-width:min(88%, 800px);
        min-width:0;
        border-radius:18px;
        padding:12px 12px 10px 12px;
        word-break:break-word;
        overflow-wrap:anywhere;
        box-shadow:0 5px 18px rgba(0,0,0,.08);
        overflow:hidden;
      }
      .rcf-admin-ai-row.user .rcf-admin-ai-bubble{ background:rgba(85,130,255,.16); }
      .rcf-admin-ai-row.assistant .rcf-admin-ai-bubble,
      .rcf-admin-ai-row.system .rcf-admin-ai-bubble{ background:rgba(255,255,255,.05); }
      .rcf-admin-ai-bubble.error{ outline:1px solid rgba(255,100,100,.28); }

      .rcf-admin-ai-role{
        font-size:11px;
        font-weight:700;
        opacity:.62;
        text-transform:uppercase;
        letter-spacing:.04em;
        margin-bottom:7px;
      }
      .rcf-admin-ai-text{
        font-size:14px;
        line-height:1.5;
        white-space:pre-wrap;
        word-break:break-word;
        overflow-wrap:anywhere;
        min-width:0;
      }
      .rcf-admin-ai-meta{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        font-size:11px;
        opacity:.64;
        margin-top:8px;
        min-width:0;
      }
      .rcf-admin-ai-mini-actions{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        margin-top:10px;
      }
      .rcf-admin-ai-mini{
        border:0;
        outline:0;
        appearance:none;
        -webkit-appearance:none;
        background:rgba(255,255,255,.07);
        color:inherit;
        border-radius:10px;
        height:30px;
        padding:0 10px;
        font:inherit;
        font-size:12px;
        cursor:pointer;
        touch-action:manipulation;
      }

      .rcf-admin-ai-code-wrap{
        margin-top:10px;
        border-radius:14px;
        overflow:hidden;
        background:rgba(0,0,0,.28);
        border:1px solid rgba(255,255,255,.06);
        min-width:0;
        max-width:100%;
      }
      .rcf-admin-ai-code-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:8px 10px;
        background:rgba(255,255,255,.05);
        font-size:11px;
        opacity:.86;
        min-width:0;
      }
      .rcf-admin-ai-code{
        margin:0;
        padding:12px;
        overflow:auto;
        max-width:100%;
        white-space:pre;
        font-size:12px;
        line-height:1.5;
        font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      .rcf-admin-ai-attachments-inline{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-top:10px;
        min-width:0;
      }
      .rcf-admin-ai-att-chip{
        display:inline-flex;
        align-items:center;
        gap:8px;
        max-width:100%;
        background:rgba(255,255,255,.07);
        border-radius:12px;
        padding:8px 10px;
        font-size:12px;
        min-width:0;
      }
      .rcf-admin-ai-att-name{
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width:180px;
        min-width:0;
      }

      .rcf-admin-ai-composer-wrap{
        position:relative;
        flex:0 0 auto;
        width:100%;
        max-width:100%;
        min-width:0;
        padding:10px 12px 12px 12px;
        border-top:1px solid rgba(255,255,255,.08);
        overflow:visible;
        z-index:3;
        background:transparent;
      }
      .rcf-admin-ai-attachments-bar{
        display:none;
        max-width:980px;
        width:100%;
        min-width:0;
        margin:0 auto 8px auto;
        gap:8px;
        overflow-x:auto;
        overflow-y:hidden;
        -webkit-overflow-scrolling:touch;
      }
      .rcf-admin-ai-attachments-bar.show{ display:flex; }

      .rcf-admin-ai-chip{
        display:inline-flex;
        align-items:center;
        gap:8px;
        white-space:nowrap;
        background:rgba(255,255,255,.07);
        border-radius:999px;
        padding:8px 10px;
        font-size:12px;
        min-width:0;
        flex:0 0 auto;
      }
      .rcf-admin-ai-chip button{
        border:0;
        background:transparent;
        color:inherit;
        cursor:pointer;
        opacity:.85;
        font-size:14px;
        touch-action:manipulation;
      }

      .rcf-admin-ai-composer{
        position:relative;
        display:flex;
        align-items:flex-end;
        gap:8px;
        width:100%;
        max-width:980px;
        min-width:0;
        margin:0 auto;
        overflow:visible;
      }
      .rcf-admin-ai-plus{
        width:42px;
        min-width:42px;
        height:42px;
        flex:0 0 42px;
        border-radius:14px;
        border:0;
        cursor:pointer;
        background:rgba(255,255,255,.07);
        color:inherit;
        font-size:20px;
        touch-action:manipulation;
        position:relative;
        z-index:4;
      }
      .rcf-admin-ai-core{
        flex:1 1 auto;
        min-width:0;
        width:auto;
        max-width:100%;
        display:flex;
        align-items:flex-end;
        gap:8px;
        background:rgba(255,255,255,.05);
        border-radius:18px;
        padding:8px;
        min-height:58px;
        overflow:hidden;
      }
      .rcf-admin-ai-textarea{
        flex:1 1 auto;
        min-width:0;
        width:100%;
        max-width:100%;
        min-height:42px;
        max-height:180px;
        resize:none;
        background:transparent;
        border:0;
        outline:0;
        color:inherit;
        font:inherit;
        padding:10px 8px 10px 10px;
        line-height:1.4;
        white-space:pre-wrap;
        word-break:break-word;
        overflow-wrap:anywhere;
        overflow-x:hidden;
        overflow-y:auto;
        display:block;
      }
      .rcf-admin-ai-textarea::placeholder{
        white-space:normal;
        word-break:normal;
        overflow-wrap:break-word;
        writing-mode:horizontal-tb;
      }
      .rcf-admin-ai-actions{
        display:flex;
        align-items:center;
        gap:6px;
        flex:0 0 auto;
        min-width:0;
      }
      .rcf-admin-ai-send{
        width:42px;
        min-width:42px;
        height:42px;
        flex:0 0 42px;
        border-radius:14px;
        border:0;
        cursor:pointer;
        background:rgba(255,255,255,.10);
        color:inherit;
        touch-action:manipulation;
        position:relative;
        z-index:4;
      }
      .rcf-admin-ai-send.busy{ opacity:.75; }
      .rcf-admin-ai-status{
        max-width:980px;
        width:100%;
        min-width:0;
        margin:8px auto 0 auto;
        min-height:18px;
        padding:0 2px;
        font-size:12px;
        opacity:.72;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .rcf-admin-ai-menu{
        position:absolute;
        left:12px;
        bottom:82px;
        z-index:20;
        min-width:240px;
        max-width:min(300px, calc(100vw - 24px));
        display:none;
        padding:8px;
        border-radius:14px;
        background:rgba(19,20,25,.96);
        border:1px solid rgba(255,255,255,.08);
        box-shadow:0 12px 30px rgba(0,0,0,.26);
      }
      .rcf-admin-ai-menu.show{ display:block; }
      .rcf-admin-ai-menu button{
        display:block;
        width:100%;
        text-align:left;
        border:0;
        background:transparent;
        color:inherit;
        padding:10px 10px;
        border-radius:10px;
        font:inherit;
        cursor:pointer;
        touch-action:manipulation;
      }

      .rcf-admin-ai-hidden-input{ display:none !important; }

      @media (max-width:640px){
        .rcf-admin-ai-head{ padding:10px; }
        .rcf-admin-ai-body{ padding:12px 10px 16px 10px; }
        .rcf-admin-ai-composer-wrap{ padding:8px 10px 10px 10px; }
        .rcf-admin-ai-bubble{ max-width:93%; }
        .rcf-admin-ai-menu{
          left:10px;
          right:10px;
          bottom:76px;
          min-width:0;
          max-width:none;
        }
      }
    `;

    let style = document.getElementById(CSS_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = CSS_ID;
      document.head.appendChild(style);
    }
    if (style.textContent !== cssText) {
      style.textContent = cssText;
    }
    return true;
  }

  function parseCodeBlocks(text) {
    const out = [];
    const rx = /```([a-zA-Z0-9_.+\-]*)\n([\s\S]*?)```/g;
    let match;
    while ((match = rx.exec(String(text || "")))) {
      out.push({
        lang: (match[1] || "").trim() || "code",
        code: match[2] || ""
      });
    }
    return out;
  }

  function renderMessageText(container, text) {
    text = normalizeText(text);
    const rx = /```([a-zA-Z0-9_.+\-]*)\n([\s\S]*?)```/g;
    let last = 0;
    let match;

    while ((match = rx.exec(text))) {
      const plain = text.slice(last, match.index);
      if (plain) {
        container.appendChild(createEl("div", "rcf-admin-ai-text", plain));
      }

      const wrap = createEl("div", "rcf-admin-ai-code-wrap");
      const head = createEl("div", "rcf-admin-ai-code-head");
      head.appendChild(createEl("div", "", (match[1] || "code").trim() || "code"));

      const btn = createEl("button", "rcf-admin-ai-mini", "Copiar código");
      btn.type = "button";
      btn.addEventListener("click", () => {
        copyText(match[2] || "").then((ok) => setComposerStatus(ok ? "Código copiado." : "Falha ao copiar código."));
      });
      head.appendChild(btn);

      const pre = createEl("pre", "rcf-admin-ai-code");
      const code = document.createElement("code");
      code.textContent = match[2] || "";
      pre.appendChild(code);
      wrap.appendChild(head);
      wrap.appendChild(pre);
      container.appendChild(wrap);

      last = rx.lastIndex;
    }

    const rest = text.slice(last);
    if (rest || !container.childNodes.length) {
      container.appendChild(createEl("div", "rcf-admin-ai-text", rest || ""));
    }
  }

  function minifyAttachmentMeta(file) {
    file = isObj(file) ? file : {};
    return {
      id: file.id || uid("att"),
      name: String(file.name || "arquivo"),
      type: String(file.type || "application/octet-stream"),
      size: Number(file.size || 0),
      kind: String(file.kind || inferAttachmentKind(file.type || "", file.name || "")),
      previewText: file.previewText ? clampText(String(file.previewText), 6000) : "",
      dataUrl: file.dataUrl && String(file.dataUrl).length <= (MAX_INLINE_PREVIEW * 2) ? String(file.dataUrl) : ""
    };
  }

  function renderInlineAttachments(parent, files) {
    files = toArray(files);
    if (!files.length) return;

    const wrap = createEl("div", "rcf-admin-ai-attachments-inline");
    files.forEach((f) => {
      const chip = createEl("div", "rcf-admin-ai-att-chip");
      chip.appendChild(createEl("span", "", attachmentEmoji(f.kind || inferAttachmentKind(f.type, f.name))));
      chip.appendChild(createEl("span", "rcf-admin-ai-att-name", f.name || "arquivo"));
      chip.appendChild(createEl("span", "", bytesLabel(f.size)));
      wrap.appendChild(chip);
    });
    parent.appendChild(wrap);
  }

  function attachmentEmoji(kind) {
    kind = String(kind || "");
    if (kind === "image") return "🖼️";
    if (kind === "pdf") return "📄";
    if (kind === "zip") return "🗜️";
    if (kind === "video") return "🎞️";
    if (kind === "audio") return "🎵";
    return "📎";
  }

  function renderSingleMessage(msg) {
    const row = createEl("div", "rcf-admin-ai-row " + normalizeRole(msg.role));
    row.dataset.messageId = msg.id || "";

    const bubble = createEl("div", "rcf-admin-ai-bubble" + (msg.error ? " error" : ""));
    bubble.appendChild(createEl("div", "rcf-admin-ai-role", msg.role || "assistant"));

    const content = createEl("div", "rcf-admin-ai-content");
    renderMessageText(content, msg.content || "");
    bubble.appendChild(content);

    renderInlineAttachments(bubble, msg.attachments);

    const meta = createEl("div", "rcf-admin-ai-meta");
    if (msg.route) meta.appendChild(createEl("span", "", "route: " + msg.route));
    if (msg.endpoint) meta.appendChild(createEl("span", "", "endpoint: " + msg.endpoint));
    if (msg.createdAt) meta.appendChild(createEl("span", "", msg.createdAt));
    bubble.appendChild(meta);

    const actions = createEl("div", "rcf-admin-ai-mini-actions");

    const copyBtn = createEl("button", "rcf-admin-ai-mini", "Copiar resposta");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", () => {
      copyText(msg.content || "").then((ok) => setComposerStatus(ok ? "Resposta copiada." : "Falha ao copiar resposta."));
    });
    actions.appendChild(copyBtn);

    if (normalizeRole(msg.role) === "assistant") {
      const readBtn = createEl("button", "rcf-admin-ai-mini", "Ler");
      readBtn.type = "button";
      readBtn.addEventListener("click", () => speakText(msg.content || ""));
      actions.appendChild(readBtn);
    }

    bubble.appendChild(actions);
    row.appendChild(bubble);
    return row;
  }

  function appendRenderedMessage(msg) {
    if (!state.ui || !state.ui.list) return false;
    if (!state.ui.list.__hasRealMessage) {
      state.ui.list.innerHTML = "";
      state.ui.list.__hasRealMessage = true;
    }

    const shouldStick = isChatAnchored();
    state.ui.list.appendChild(renderSingleMessage(msg));
    if (shouldStick) scrollChatToBottom(true);
    return true;
  }

  function rerenderHistoryPreservingScroll(forceBottom) {
    if (!state.ui || !state.ui.body || !state.ui.list) return false;

    const body = state.ui.body;
    const infoBefore = scrollInfo(body);
    const wasAnchored = forceBottom ? true : infoBefore.anchored;
    const prevTop = infoBefore.top;
    const prevHeight = infoBefore.height;

    state.ui.list.innerHTML = "";
    state.ui.list.__hasRealMessage = false;

    const list = getHistory().slice(-MAX_RENDERED_HISTORY);
    if (!list.length) {
      state.ui.list.appendChild(createEl("div", "rcf-admin-ai-empty", "Factory AI pronta. Envie um prompt para começar."));
    } else {
      state.ui.list.__hasRealMessage = true;
      list.forEach((msg) => {
        state.ui.list.appendChild(renderSingleMessage(msg));
      });
    }

    requestAnimation(() => {
      if (!state.ui || !state.ui.body) return;
      if (wasAnchored) {
        scrollChatToBottom(true);
      } else {
        const newHeight = state.ui.body.scrollHeight || 0;
        const delta = newHeight - prevHeight;
        state.ui.body.scrollTop = Math.max(0, prevTop + delta);
      }
    });

    return true;
  }

  function isChatAnchored() {
    return !!(state.ui && state.ui.body && scrollInfo(state.ui.body).anchored);
  }

  function scrollChatToBottom(force) {
    if (!state.ui || !state.ui.body) return false;
    if (!force && !state.shouldAutoStick) return false;
    try {
      state.ui.body.scrollTop = state.ui.body.scrollHeight;
      return true;
    } catch (_) {
      return false;
    }
  }

  function onChatScroll() {
    if (!state.ui || !state.ui.body) return;
    const info = scrollInfo(state.ui.body);
    state.lastKnownScrollTop = info.top;
    state.shouldAutoStick = info.anchored;
  }

  function autogrowTextarea() {
    if (!state.ui || !state.ui.textarea) return false;
    const ta = state.ui.textarea;
    ta.style.height = "42px";
    const next = Math.min(180, ta.scrollHeight || 42);
    ta.style.height = next + "px";
    return true;
  }

  function setComposerStatus(text) {
    state.composerStatusText = String(text || "");
    if (state.ui && state.ui.status) state.ui.status.textContent = state.composerStatusText;
  }

  // =========================================================
  // 6) ATTACHMENT HELPERS
  // =========================================================
  function inferAttachmentKind(type, name) {
    type = String(type || "").toLowerCase();
    name = String(name || "").toLowerCase();

    if (type.indexOf("image/") === 0) return "image";
    if (type.indexOf("video/") === 0) return "video";
    if (type.indexOf("audio/") === 0) return "audio";
    if (type.indexOf("pdf") >= 0 || /\.pdf$/i.test(name)) return "pdf";
    if (type.indexOf("zip") >= 0 || /\.(zip|rar|7z)$/i.test(name)) return "zip";
    return "file";
  }

  function getAttachments() {
    return state.attachments.slice();
  }

  function persistAttachmentMetaOnly() {
    const list = state.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      size: a.size,
      kind: a.kind
    }));
    writeStorage(STORAGE_KEYS.attachmentsMeta, JSON.stringify(list));
  }

  function clearAttachments() {
    state.attachments = [];
    persistAttachmentMetaOnly();
    renderAttachmentBar();
    return true;
  }

  function renderAttachmentBar() {
    if (!state.ui || !state.ui.attachmentsBar) return false;
    const bar = state.ui.attachmentsBar;
    bar.innerHTML = "";

    if (!state.attachments.length) {
      bar.classList.remove("show");
      return true;
    }

    state.attachments.forEach((file, index) => {
      const chip = createEl("div", "rcf-admin-ai-chip");
      chip.appendChild(createEl("span", "", attachmentEmoji(file.kind) + " " + (file.name || "arquivo")));
      chip.appendChild(createEl("span", "", bytesLabel(file.size)));
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "×";
      rm.addEventListener("click", () => {
        state.attachments.splice(index, 1);
        persistAttachmentMetaOnly();
        renderAttachmentBar();
      });
      chip.appendChild(rm);
      bar.appendChild(chip);
    });

    bar.classList.add("show");
    return true;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } catch (e) {
        reject(e);
      }
    });
  }

  function fileToText(file) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsText(file);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function normalizeBrowserFile(file, forcedKind) {
    if (!file) return null;
    const normalized = {
      id: uid("att"),
      name: file.name || "arquivo",
      type: file.type || "application/octet-stream",
      size: Number(file.size || 0),
      kind: forcedKind || inferAttachmentKind(file.type, file.name),
      previewText: "",
      dataUrl: ""
    };

    if (normalized.size > MAX_FILE_SIZE) {
      throw new Error("Arquivo excede limite: " + normalized.name + " (" + bytesLabel(normalized.size) + ")");
    }

    const isTextLike =
      /^(text\/|application\/json|application\/javascript|application\/xml)/i.test(normalized.type) ||
      /\.(txt|md|json|js|css|html|xml|csv|log)$/i.test(normalized.name);

    if (normalized.size <= MAX_INLINE_PREVIEW) {
      try {
        normalized.dataUrl = await fileToDataUrl(file);
      } catch (_) {}
      if (isTextLike) {
        try {
          normalized.previewText = clampText(await fileToText(file), 12000);
        } catch (_) {}
      }
    }

    return normalized;
  }

  async function handleSelectedFiles(fileList, forcedKind) {
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return false;

    const next = state.attachments.slice();
    for (let i = 0; i < files.length; i += 1) {
      if (next.length >= MAX_ATTACHMENTS) break;
      try {
        const prepared = await normalizeBrowserFile(files[i], forcedKind || "");
        if (prepared) next.push(prepared);
      } catch (e) {
        setComposerStatus(e && e.message ? e.message : "Falha ao adicionar arquivo.");
      }
    }

    state.attachments = next.slice(0, MAX_ATTACHMENTS);
    persistAttachmentMetaOnly();
    renderAttachmentBar();
    setComposerStatus(state.attachments.length ? "Anexos prontos." : "");
    return true;
  }

  // =========================================================
  // 7) VOICE HELPERS
  // =========================================================
  function speechSynthesisAvailable() {
    return typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
  }

  function recognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function stopSpeak() {
    try {
      if (speechSynthesisAvailable()) window.speechSynthesis.cancel();
    } catch (_) {}
    state.speaking = false;
  }

  function speakText(text) {
    text = clampText(text || "", MAX_VOICE_TEXT);
    if (!text) return false;
    if (!speechSynthesisAvailable()) {
      setComposerStatus("Leitura por voz indisponível.");
      return false;
    }

    try {
      stopSpeak();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "pt-BR";
      utter.rate = 1;
      utter.pitch = 1;
      utter.onstart = () => {
        state.speaking = true;
        setComposerStatus("Lendo resposta...");
      };
      utter.onend = () => {
        state.speaking = false;
        setComposerStatus("");
      };
      utter.onerror = () => {
        state.speaking = false;
        setComposerStatus("Falha na leitura por voz.");
      };
      window.speechSynthesis.speak(utter);
      return true;
    } catch (e) {
      warn("speakText failed", e);
      setComposerStatus("Falha na leitura por voz.");
      return false;
    }
  }

  function reflectVoiceButton() {
    if (!state.ui || !state.ui.voiceBtn) return;
    state.ui.voiceBtn.textContent = state.voiceListening ? "⏹" : "🎤";
    state.ui.voiceBtn.style.opacity = state.voiceListening ? "1" : "";
  }

  function startVoiceInput() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setComposerStatus("Reconhecimento de voz indisponível.");
      return false;
    }
    if (state.voiceListening) return true;

    try {
      const rec = new Ctor();
      rec.lang = "pt-BR";
      rec.interimResults = true;
      rec.continuous = false;

      rec.onstart = () => {
        state.voiceListening = true;
        reflectVoiceButton();
        setComposerStatus("Ouvindo...");
      };

      rec.onresult = (ev) => {
        let transcript = "";
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          transcript += (ev.results[i] && ev.results[i][0] && ev.results[i][0].transcript) || "";
        }
        if (state.ui && state.ui.textarea && transcript.trim()) {
          const current = state.ui.textarea.value || "";
          state.ui.textarea.value = (current ? current + " " : "") + transcript.trim();
          persistDraft();
          autogrowTextarea();
        }
      };

      rec.onerror = () => {
        state.voiceListening = false;
        reflectVoiceButton();
        setComposerStatus("Falha na captura de voz.");
      };

      rec.onend = () => {
        state.voiceListening = false;
        reflectVoiceButton();
        setComposerStatus("");
      };

      state.recognition = rec;
      rec.start();
      return true;
    } catch (e) {
      warn("startVoiceInput failed", e);
      setComposerStatus("Falha ao iniciar voz.");
      return false;
    }
  }

  function stopVoiceInput() {
    try {
      if (state.recognition && isFn(state.recognition.stop)) state.recognition.stop();
    } catch (_) {}
    state.voiceListening = false;
    reflectVoiceButton();
    return true;
  }

  // =========================================================
  // 8) SNAPSHOT / CONTEXT HELPERS
  // =========================================================
  function collectLoggerTail(limit) {
    limit = Number(limit || 60);
    try {
      if (window.RCF_LOGGER && Array.isArray(window.RCF_LOGGER.items)) {
        return window.RCF_LOGGER.items.slice(-limit);
      }
      if (window.RCF_LOGGER && Array.isArray(window.RCF_LOGGER.logs)) {
        return window.RCF_LOGGER.logs.slice(-limit);
      }
      if (window.RCF_LOGGER && Array.isArray(window.RCF_LOGGER.tail)) {
        return window.RCF_LOGGER.tail.slice(-limit);
      }
    } catch (_) {}
    return [];
  }

  function collectDoctorSummary() {
    const registry = resolveRegistry();
    const doctor =
      window.RCF_DOCTOR ||
      registry.doctor ||
      registry.rcf_doctor ||
      window.RCF_FACTORY_DOCTOR ||
      null;

    if (!doctor) return null;

    try {
      if (isFn(doctor.getSummary)) return doctor.getSummary();
      if (isFn(doctor.summary)) return doctor.summary();
      if (isFn(doctor.run)) return doctor.run({ silent: true, summaryOnly: true });
    } catch (_) {}

    return null;
  }

  function getActiveViewSafe() {
    const ctx = resolveContext();
    const fs = resolveFactoryState();
    return (
      ctx.activeView ||
      ctx.view ||
      ctx.currentView ||
      fs.activeView ||
      fs.view ||
      fs.currentView ||
      ""
    );
  }

  function getActiveAppSlugSafe() {
    const ctx = resolveContext();
    const fs = resolveFactoryState();
    return (
      ctx.activeAppSlug ||
      ctx.appSlug ||
      ctx.selectedAppSlug ||
      fs.activeAppSlug ||
      fs.selectedAppSlug ||
      (fs.activeApp && (fs.activeApp.slug || fs.activeApp.id)) ||
      ""
    );
  }

  function getActiveModulesSafe() {
    const registry = resolveRegistry();
    const names = Object.keys(registry);
    const out = [];
    for (let i = 0; i < names.length; i += 1) {
      const mod = registry[names[i]];
      if (mod && (mod.active === true || mod.enabled === true || mod.ready === true || mod.mounted === true)) {
        out.push(names[i]);
      }
    }
    return out.slice(0, 80);
  }

  function summarizeFactoryTree(tree) {
    try {
      if (Array.isArray(tree)) return { type: "array", size: tree.length };
      if (isObj(tree)) {
        const keys = Object.keys(tree);
        return { type: "object", size: keys.length, keys: keys.slice(0, 40) };
      }
      return tree == null ? null : { type: typeof tree };
    } catch (_) {
      return null;
    }
  }

  function buildTechnicalSnapshot() {
    const ctx = resolveContext();
    const fs = resolveFactoryState();
    const registry = resolveRegistry();
    const tree = resolveFactoryTree();
    const doctorSummary = collectDoctorSummary();
    const loggerTail = collectLoggerTail(40);

    const snapshot = {
      version: VERSION,
      ts: nowIso(),
      activeView: getActiveViewSafe(),
      activeAppSlug: getActiveAppSlugSafe(),
      context: {
        keys: safeModuleKeys(ctx, 60),
        route: ctx.route || "",
        mode: ctx.mode || "",
        view: ctx.view || ctx.currentView || ""
      },
      factoryState: {
        keys: safeModuleKeys(fs, 60),
        appsCount: Array.isArray(fs.apps) ? fs.apps.length : 0,
        activeAppId: fs.activeAppId || "",
        activeAppSlug: fs.activeAppSlug || "",
        selectedFile: fs.selectedFile || fs.currentFile || "",
        selectedPath: fs.selectedPath || fs.currentPath || ""
      },
      registry: {
        keys: safeModuleKeys(registry, 120),
        activeModules: getActiveModulesSafe()
      },
      tree: summarizeFactoryTree(tree),
      doctor: doctorSummary || null,
      loggerTail: loggerTail,
      chat: {
        historyCount: state.history.length,
        attachmentsCount: state.attachments.length,
        lastEndpoint: state.lastEndpoint || "",
        lastRoute: state.lastRoute || ""
      }
    };

    state.lastSnapshotAt = Date.now();
    return snapshot;
  }

  function buildTechnicalContextText() {
    const s = buildTechnicalSnapshot();
    return [
      "TECHNICAL SNAPSHOT",
      "version: " + s.version,
      "ts: " + s.ts,
      "activeView: " + (s.activeView || "-"),
      "activeAppSlug: " + (s.activeAppSlug || "-"),
      "context.keys: " + (s.context.keys || []).join(", "),
      "factoryState.keys: " + (s.factoryState.keys || []).join(", "),
      "factoryState.appsCount: " + s.factoryState.appsCount,
      "factoryState.selectedFile: " + (s.factoryState.selectedFile || "-"),
      "factoryState.selectedPath: " + (s.factoryState.selectedPath || "-"),
      "registry.keys: " + (s.registry.keys || []).join(", "),
      "registry.activeModules: " + (s.registry.activeModules || []).join(", "),
      "tree: " + JSON.stringify(s.tree || {}),
      "doctor: " + JSON.stringify(s.doctor || null),
      "loggerTail: " + JSON.stringify(s.loggerTail || []),
      "chat.lastEndpoint: " + (s.chat.lastEndpoint || "-"),
      "chat.historyCount: " + s.chat.historyCount,
      "chat.attachmentsCount: " + s.chat.attachmentsCount
    ].join("\n");
  }

  // =========================================================
  // 9) RESPONSE FORMATTERS
  // =========================================================
  function stringifySafe(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); } catch (_) {}
    try { return String(value); } catch (_) { return ""; }
  }

  function extractResponseText(result) {
    if (result == null) return "";
    if (typeof result === "string") return result;

    const candidates = [
      result.text,
      result.answer,
      result.output,
      result.message,
      result.content,
      deepGet(result, "data.text", ""),
      deepGet(result, "data.answer", ""),
      deepGet(result, "response.text", ""),
      deepGet(result, "response.output_text", ""),
      deepGet(result, "result.text", ""),
      deepGet(result, "choices.0.message.content", ""),
      deepGet(result, "choices.0.text", "")
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      if (typeof candidates[i] === "string" && candidates[i].trim()) return candidates[i];
    }

    return "";
  }

  function formatResponseFallbackObject(result, title) {
    const json = stringifySafe(result || {});
    return [
      title || "Resposta recebida.",
      "",
      "```json",
      json || "{}",
      "```"
    ].join("\n");
  }

  function formatLocalActionResponse(actionName, result) {
    const text = extractResponseText(result);
    if (text && text.trim()) return text;

    return [
      "Ação local supervisionada executada.",
      "",
      "action: " + actionName,
      "",
      "```json",
      stringifySafe(result || {}),
      "```"
    ].join("\n");
  }

  function formatRouteError(route, e) {
    return [
      "Falha ao processar a solicitação.",
      "",
      "route: " + (route || "unknown"),
      "error: " + (e && e.message ? e.message : String(e || "unknown"))
    ].join("\n");
  }

  // =========================================================
  // 10) RUNNERS
  // =========================================================
  function getActionsApi() {
    return window.RCF_FACTORY_AI_ACTIONS || null;
  }

  function getRuntimeApi() {
    return window.RCF_FACTORY_AI_RUNTIME || null;
  }

  function getBrainApi() {
    return window.RCF_FACTORY_AI_BRAIN || null;
  }

  function getOrchestratorApi() {
    return window.RCF_FACTORY_AI_ORCHESTRATOR || null;
  }

  function setLastEndpoint(endpoint) {
    state.lastEndpoint = String(endpoint || "");
    writeStorage(STORAGE_KEYS.lastEndpoint, state.lastEndpoint);
    return state.lastEndpoint;
  }

  function getLastEndpoint() {
    return state.lastEndpoint || "";
  }

  async function callRuntime(payload) {
    const api = getRuntimeApi();
    if (!api) throw new Error("RCF_FACTORY_AI_RUNTIME unavailable");

    const result = await Promise.resolve(
      safeInvoke(api, ["ask", "run", "send", "chat", "complete", "request"], [payload])
    );
    return result;
  }

  async function callBrain(payload) {
    const api = getBrainApi();
    if (!api) throw new Error("RCF_FACTORY_AI_BRAIN unavailable");

    const result = await Promise.resolve(
      safeInvoke(api, ["ask", "run", "send", "chat", "think", "complete"], [payload])
    );
    return result;
  }

  async function callOrchestrator(payload) {
    const api = getOrchestratorApi();
    if (!api) throw new Error("RCF_FACTORY_AI_ORCHESTRATOR unavailable");

    const result = await Promise.resolve(
      safeInvoke(api, ["ask", "run", "send", "chat", "orchestrate", "complete"], [payload])
    );
    return result;
  }

  async function callLocalAction(actionName, payload) {
    const api = getActionsApi();
    if (!api) throw new Error("RCF_FACTORY_AI_ACTIONS unavailable");

    if (isFn(api[actionName])) {
      return Promise.resolve(api[actionName](payload));
    }

    if (isFn(api.dispatch)) {
      return Promise.resolve(api.dispatch(Object.assign({}, payload || {}, { action: actionName })));
    }

    throw new Error("No compatible local action entry");
  }

  async function callEndpointFallback(payload) {
    const res = await fetch(DEFAULT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: payload.prompt || "",
        attachments: payload.attachments || [],
        history: payload.history || [],
        snapshot: payload.snapshot || {},
        source: "/app/js/admin.admin_ai.js",
        version: VERSION
      })
    });

    if (!res.ok) throw new Error("Endpoint HTTP " + res.status);

    const data = await res.json().catch(() => ({}));
    setLastEndpoint(DEFAULT_ENDPOINT);
    return data;
  }

  // =========================================================
  // 11) LOCAL ACTION DETECTION / ROUTING
  // =========================================================
  const LOCAL_ACTION_NAMES = [
    "openai_status",
    "snapshot",
    "plan",
    "next_file",
    "run_doctor",
    "collect_logs",
    "approve_patch",
    "validate_patch",
    "stage_patch",
    "apply_patch"
  ];

  function extractSlashAction(prompt) {
    const m = String(prompt || "").trim().match(/^\/([a-z_]+)\b/i);
    return m ? String(m[1] || "").toLowerCase() : "";
  }

  function looksExplicitLocalAction(prompt) {
    const original = String(prompt || "").trim();
    const lower = original.toLowerCase();
    if (!lower) return "";

    const slash = extractSlashAction(lower);
    if (LOCAL_ACTION_NAMES.indexOf(slash) >= 0) return slash;

    const explicitPatterns = [
      { name: "openai_status", tests: [/^\s*(openai[_ ]status|status da openai|status do openai)\s*$/i, /^\s*(me mostre|mostrar|rodar|executar)\s+(o\s+)?(openai[_ ]status|status da openai|status do openai)\s*$/i] },
      { name: "snapshot", tests: [/^\s*(snapshot|contexto t[eé]cnico|contexto tecnico|estado t[eé]cnico|estado tecnico|resumo t[eé]cnico|resumo tecnico)\s*$/i, /^\s*(gerar|mostrar|me mostre|trazer|coletar)\s+(o\s+)?(snapshot|contexto t[eé]cnico|contexto tecnico|resumo t[eé]cnico|resumo tecnico)\s*$/i] },
      { name: "plan", tests: [/^\s*(plan|planejar patch|planejar corre[cç][aã]o|criar plano de patch|montar plano de patch)\s*$/i, /^\s*(fa[cç]a|crie|gere|monte)\s+(um\s+)?plano(\s+de\s+patch|\s+de\s+corre[cç][aã]o)?\s*$/i] },
      { name: "next_file", tests: [/^\s*(next file|pr[oó]ximo arquivo|proximo arquivo)\s*$/i, /^\s*(qual\s+[ée]\s+o\s+)?(next file|pr[oó]ximo arquivo|proximo arquivo)\s*$/i] },
      { name: "run_doctor", tests: [/^\s*(run doctor|doctor|rodar doctor|executar doctor|diagn[oó]stico|diagnostico)\s*$/i, /^\s*(rode|executa|executar|rodar)\s+(o\s+)?(doctor|diagn[oó]stico|diagnostico)\s*$/i] },
      { name: "collect_logs", tests: [/^\s*(collect logs|coletar logs|mostrar logs|trazer logs|capturar logs)\s*$/i, /^\s*(colete|mostrar|mostre|traga|capturar)\s+(os\s+)?logs\s*$/i] },
      { name: "approve_patch", tests: [/^\s*(approve patch|aprovar patch|aprova patch)\s*$/i, /^\s*(aprove|aprovar)\s+(o\s+)?patch\s*$/i] },
      { name: "validate_patch", tests: [/^\s*(validate patch|validar patch|valida patch)\s*$/i, /^\s*(valide|validar)\s+(o\s+)?patch\s*$/i] },
      { name: "stage_patch", tests: [/^\s*(stage patch|staging patch|colocar patch em stage|preparar patch para stage)\s*$/i, /^\s*(coloque|prepare|stage)\s+(o\s+)?patch(\s+em\s+stage)?\s*$/i] },
      { name: "apply_patch", tests: [/^\s*(apply patch|aplicar patch|aplica patch)\s*$/i, /^\s*(aplique|aplicar)\s+(o\s+)?patch\s*$/i] }
    ];

    for (let i = 0; i < explicitPatterns.length; i += 1) {
      for (let j = 0; j < explicitPatterns[i].tests.length; j += 1) {
        if (explicitPatterns[i].tests[j].test(original)) return explicitPatterns[i].name;
      }
    }

    return "";
  }

  function buildRunnerPayload(prompt) {
    const snapshot = buildTechnicalSnapshot();
    const history = getHistory().slice(-18).map((msg) => ({
      role: msg.role,
      content: clampText(msg.content || "", 6000),
      createdAt: msg.createdAt || ""
    }));

    const attachments = getAttachments().map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      size: a.size,
      kind: a.kind,
      previewText: a.previewText || "",
      dataUrl: a.dataUrl || ""
    }));

    return {
      prompt: String(prompt || ""),
      history: history,
      attachments: attachments,
      snapshot: snapshot,
      snapshotText: buildTechnicalContextText()
    };
  }

  async function executeHybridRoute(prompt) {
    const payload = buildRunnerPayload(prompt);
    const preferredLocalAction = looksExplicitLocalAction(prompt);

    if (preferredLocalAction) {
      try {
        const localResult = await callLocalAction(preferredLocalAction, payload);
        const text = formatLocalActionResponse(preferredLocalAction, localResult);
        state.lastRoute = "local_action";
        setLastEndpoint("local:" + preferredLocalAction);
        return {
          ok: true,
          route: "local_action",
          endpoint: "local:" + preferredLocalAction,
          action: preferredLocalAction,
          text: text,
          raw: localResult
        };
      } catch (e) {
        warn("local action failed, continuing hybrid fallback", preferredLocalAction, e);
      }
    }

    try {
      const runtimeResult = await callRuntime(payload);
      const runtimeText = extractResponseText(runtimeResult);
      if (runtimeText && runtimeText.trim()) {
        state.lastRoute = "runtime";
        setLastEndpoint("runtime");
        return {
          ok: true,
          route: "runtime",
          endpoint: "runtime",
          text: clampText(runtimeText, MAX_RUNTIME_TEXT),
          raw: runtimeResult
        };
      }
      throw new Error("Runtime returned empty text");
    } catch (runtimeError) {
      warn("runtime failed", runtimeError);

      try {
        const brainResult = await callBrain(payload);
        const brainText = extractResponseText(brainResult);
        if (brainText && brainText.trim()) {
          state.lastRoute = "brain";
          setLastEndpoint("brain");
          return {
            ok: true,
            route: "brain",
            endpoint: "brain",
            text: clampText(brainText, MAX_RUNTIME_TEXT),
            raw: brainResult
          };
        }
        throw new Error("Brain returned empty text");
      } catch (brainError) {
        warn("brain failed", brainError);

        try {
          const orchResult = await callOrchestrator(payload);
          const orchText = extractResponseText(orchResult);
          if (orchText && orchText.trim()) {
            state.lastRoute = "orchestrator";
            setLastEndpoint("orchestrator");
            return {
              ok: true,
              route: "orchestrator",
              endpoint: "orchestrator",
              text: clampText(orchText, MAX_RUNTIME_TEXT),
              raw: orchResult
            };
          }
          throw new Error("Orchestrator returned empty text");
        } catch (orchError) {
          warn("orchestrator failed", orchError);

          try {
            const endpointData = await callEndpointFallback(payload);
            const endpointText = extractResponseText(endpointData) || formatResponseFallbackObject(endpointData, "Resposta recebida pelo fallback.");
            state.lastRoute = "endpoint_fallback";
            return {
              ok: true,
              route: "endpoint_fallback",
              endpoint: DEFAULT_ENDPOINT,
              text: clampText(endpointText, MAX_RUNTIME_TEXT),
              raw: endpointData
            };
          } catch (endpointError) {
            errLog("endpoint fallback failed", endpointError);
            state.lastRoute = "failed";
            return {
              ok: false,
              route: "failed",
              endpoint: "",
              text: formatRouteError("hybrid", endpointError),
              raw: {
                runtimeError: String(runtimeError && runtimeError.message || runtimeError || ""),
                brainError: String(brainError && brainError.message || brainError || ""),
                orchestratorError: String(orchError && orchError.message || orchError || ""),
                endpointError: String(endpointError && endpointError.message || endpointError || "")
              }
            };
          }
        }
      }
    }
  }

  // =========================================================
  // 12) SEND / CHAT FLOW
  // =========================================================
  function persistDraft() {
    if (!state.ui || !state.ui.textarea) return false;
    writeStorage(STORAGE_KEYS.draft, String(state.ui.textarea.value || ""));
    return true;
  }

  function restoreDraft() {
    return readStorage(STORAGE_KEYS.draft, "");
  }

  function reflectBusyUi() {
    if (!state.ui) return;
    if (state.ui.sendBtn) {
      state.ui.sendBtn.disabled = !!state.busy;
      state.ui.sendBtn.classList.toggle("busy", !!state.busy);
    }
    reflectVoiceButton();
  }

  async function sendPrompt(prompt) {
    prompt = String(prompt == null ? "" : prompt).trim();

    if (!prompt && !state.attachments.length) return false;
    if (state.busy) {
      setComposerStatus("A Factory AI já está processando.");
      return false;
    }

    state.busy = true;
    reflectBusyUi();

    const userText = prompt || "[prompt com anexos]";
    pushMessage(buildMessage("user", userText, {
      route: "input",
      attachments: state.attachments
    }));

    const pending = buildMessage("assistant", "Pensando...", {
      pending: true,
      route: "pending"
    });
    pushMessage(pending);
    state.pendingMessageId = pending.id;

    if (state.ui && state.ui.textarea) {
      state.ui.textarea.value = "";
      persistDraft();
      autogrowTextarea();
    }

    setComposerStatus("Processando...");

    try {
      const result = await executeHybridRoute(prompt);
      replaceMessage(state.pendingMessageId, {
        role: "assistant",
        content: result.text || "",
        route: result.route || "",
        endpoint: result.endpoint || "",
        error: !result.ok
      });

      clearAttachments();

      if (state.autoRead && result.text) speakText(result.text);
      setComposerStatus(result.ok ? "Resposta pronta." : "Resposta com erro/fallback.");
      return true;
    } catch (e) {
      errLog("sendPrompt failed", e);
      replaceMessage(state.pendingMessageId, {
        role: "assistant",
        content: formatRouteError("sendPrompt", e),
        route: "error",
        endpoint: "",
        error: true
      });
      setComposerStatus("Falha no processamento.");
      return false;
    } finally {
      state.pendingMessageId = "";
      state.busy = false;
      reflectBusyUi();
    }
  }

  // =========================================================
  // 13) HOST RESOLUTION / UI BUILD
  // =========================================================
  function getOfficialHost() {
    const selectors = [
      "#rcf-factory-ai-host",
      "#factory-ai-host",
      "#admin-ai-host",
      "[data-rcf-factory-ai-host]",
      "[data-rcf-factory-ai-slot='main']"
    ];
    for (let i = 0; i < selectors.length; i += 1) {
      try {
        const el = document.querySelector(selectors[i]);
        if (el && isVisibleElement(el)) return el;
      } catch (_) {}
    }
    return null;
  }

  function getViewScopedFallbackHost() {
    const selectors = [
      '[data-view="factory_ai"]',
      '[data-view="factory-ai"]',
      '[data-panel="factory-ai"]',
      "#view-factory-ai",
      "#factory-ai-view",
      "#factory-ai-panel"
    ];
    for (let i = 0; i < selectors.length; i += 1) {
      try {
        const el = document.querySelector(selectors[i]);
        if (el && isVisibleElement(el)) return el;
      } catch (_) {}
    }
    return null;
  }

  function getAdminFallbackHost() {
    const selectors = [
      "#admin-ai-chat",
      "#factory-ai-chat",
      "#rcf-factory-ai",
      "[data-admin-ai-host]",
      ".factory-ai-host",
      ".admin-ai-host",
      '[data-slot="admin-main"]',
      "#admin-main",
      "#view-admin",
      ".admin-panel-body",
      ".admin-panel",
      ".rcf-admin-panel"
    ];
    for (let i = 0; i < selectors.length; i += 1) {
      try {
        const el = document.querySelector(selectors[i]);
        if (!el || !isVisibleElement(el)) continue;
        return el;
      } catch (_) {}
    }
    return null;
  }

  function resolveHost(target) {
    if (target && target.nodeType === 1) return target;

    if (typeof target === "string" && target.trim()) {
      try {
        const q = document.querySelector(target.trim());
        if (q && isVisibleElement(q)) return q;
      } catch (_) {}
    }

    const official = getOfficialHost();
    if (official) return official;

    const viewScoped = getViewScopedFallbackHost();
    if (viewScoped) return viewScoped;

    const adminFallback = getAdminFallbackHost();
    if (adminFallback) return adminFallback;

    return null;
  }

  function stabilizeHostLayout(host) {
    if (!host || !host.style) return;
    host.style.position = host.style.position || "relative";
    host.style.width = host.style.width || "100%";
    host.style.maxWidth = host.style.maxWidth || "100%";
    host.style.minWidth = host.style.minWidth || "0";
    if (!host.style.minHeight) host.style.minHeight = "0";
    if (!host.style.height) host.style.height = "100%";
    if (!host.style.overflowX) host.style.overflowX = "hidden";
  }

  function buildUi(host) {
    ensureCss();
    stabilizeHostLayout(host);

    const existing = host.querySelector("[" + ROOT_ATTR + "]");
    if (existing) existing.remove();

    const root = createEl("div", "rcf-admin-ai-root");
    root.setAttribute(ROOT_ATTR, "1");

    const shell = createEl("div", "rcf-admin-ai-shell");

    const head = createEl("div", "rcf-admin-ai-head");
    const headLeft = createEl("div", "rcf-admin-ai-head-left");
    const badge = createEl("div", "rcf-admin-ai-badge", "🤖");
    const copyWrap = createEl("div", "rcf-admin-ai-head-copy");
    copyWrap.appendChild(createEl("div", "rcf-admin-ai-title", "Factory AI"));
    copyWrap.appendChild(createEl("div", "rcf-admin-ai-sub", "chat principal da Factory"));
    headLeft.appendChild(badge);
    headLeft.appendChild(copyWrap);

    const headActions = createEl("div", "rcf-admin-ai-head-actions");
    const autoReadBtn = createEl("button", "rcf-admin-ai-btn", "Voz off");
    autoReadBtn.type = "button";
    const clearBtn = createEl("button", "rcf-admin-ai-iconbtn", "🧹");
    clearBtn.type = "button";
    clearBtn.title = "Limpar histórico";
    headActions.appendChild(autoReadBtn);
    headActions.appendChild(clearBtn);

    head.appendChild(headLeft);
    head.appendChild(headActions);

    const body = createEl("div", "rcf-admin-ai-body");
    const list = createEl("div", "rcf-admin-ai-list");
    body.appendChild(list);

    const composerWrap = createEl("div", "rcf-admin-ai-composer-wrap");
    const attachmentsBar = createEl("div", "rcf-admin-ai-attachments-bar");

    const composer = createEl("div", "rcf-admin-ai-composer");
    const plusBtn = createEl("button", "rcf-admin-ai-plus", "+");
    plusBtn.type = "button";
    plusBtn.title = "Anexos";

    const core = createEl("div", "rcf-admin-ai-core");
    const textarea = createEl("textarea", "rcf-admin-ai-textarea");
    textarea.placeholder = "Fale com a Factory AI...";
    textarea.setAttribute("rows", "1");
    textarea.setAttribute("spellcheck", "false");
    textarea.setAttribute("autocapitalize", "sentences");
    textarea.setAttribute("autocomplete", "off");
    textarea.setAttribute("autocorrect", "on");

    const actions = createEl("div", "rcf-admin-ai-actions");
    const voiceBtn = createEl("button", "rcf-admin-ai-iconbtn", "🎤");
    voiceBtn.type = "button";
    voiceBtn.title = "Voz";
    const sendBtn = createEl("button", "rcf-admin-ai-send", "➤");
    sendBtn.type = "button";
    sendBtn.title = "Enviar";
    actions.appendChild(voiceBtn);
    actions.appendChild(sendBtn);
    core.appendChild(textarea);
    core.appendChild(actions);

    composer.appendChild(plusBtn);
    composer.appendChild(core);

    const status = createEl("div", "rcf-admin-ai-status", "");

    const menu = createEl("div", "rcf-admin-ai-menu");
    const menuAddFile = createEl("button", "", "Adicionar arquivo");
    const menuAddImage = createEl("button", "", "Adicionar imagem");
    const menuAddPdf = createEl("button", "", "Adicionar PDF");
    const menuAddZip = createEl("button", "", "Adicionar ZIP");
    const menuAddVideo = createEl("button", "", "Adicionar vídeo");
    const menuAddAudio = createEl("button", "", "Adicionar áudio");
    const menuAddSnapshot = createEl("button", "", "Inserir snapshot técnico");
    const menuClearAttachments = createEl("button", "", "Limpar anexos");

    menu.appendChild(menuAddFile);
    menu.appendChild(menuAddImage);
    menu.appendChild(menuAddPdf);
    menu.appendChild(menuAddZip);
    menu.appendChild(menuAddVideo);
    menu.appendChild(menuAddAudio);
    menu.appendChild(menuAddSnapshot);
    menu.appendChild(menuClearAttachments);

    const fileInput = createEl("input", "rcf-admin-ai-hidden-input");
    fileInput.type = "file";
    fileInput.multiple = true;

    const imageInput = createEl("input", "rcf-admin-ai-hidden-input");
    imageInput.type = "file";
    imageInput.multiple = true;
    imageInput.accept = "image/*";

    const pdfInput = createEl("input", "rcf-admin-ai-hidden-input");
    pdfInput.type = "file";
    pdfInput.multiple = true;
    pdfInput.accept = ".pdf,application/pdf";

    const zipInput = createEl("input", "rcf-admin-ai-hidden-input");
    zipInput.type = "file";
    zipInput.multiple = true;
    zipInput.accept = ".zip,.rar,.7z,application/zip,application/x-zip-compressed,application/x-rar-compressed";

    const videoInput = createEl("input", "rcf-admin-ai-hidden-input");
    videoInput.type = "file";
    videoInput.multiple = true;
    videoInput.accept = "video/*,.mp4,.mov,.m4v,.webm";

    const audioInput = createEl("input", "rcf-admin-ai-hidden-input");
    audioInput.type = "file";
    audioInput.multiple = true;
    audioInput.accept = "audio/*,.mp3,.wav,.m4a,.aac,.ogg";

    composerWrap.appendChild(attachmentsBar);
    composerWrap.appendChild(composer);
    composerWrap.appendChild(status);
    composerWrap.appendChild(menu);
    composerWrap.appendChild(fileInput);
    composerWrap.appendChild(imageInput);
    composerWrap.appendChild(pdfInput);
    composerWrap.appendChild(zipInput);
    composerWrap.appendChild(videoInput);
    composerWrap.appendChild(audioInput);

    shell.appendChild(head);
    shell.appendChild(body);
    shell.appendChild(composerWrap);
    root.appendChild(shell);

    host.appendChild(root);

    state.ui = {
      root,
      shell,
      head,
      body,
      list,
      autoReadBtn,
      clearBtn,
      attachmentsBar,
      composerWrap,
      composer,
      plusBtn,
      textarea,
      voiceBtn,
      sendBtn,
      status,
      menu,
      menuAddFile,
      menuAddImage,
      menuAddPdf,
      menuAddZip,
      menuAddVideo,
      menuAddAudio,
      menuAddSnapshot,
      menuClearAttachments,
      fileInput,
      imageInput,
      pdfInput,
      zipInput,
      videoInput,
      audioInput
    };

    return state.ui;
  }

  // =========================================================
  // 14) UI EVENTS
  // =========================================================
  function closeMenu() {
    state.menuOpen = false;
    if (state.ui && state.ui.menu) state.ui.menu.classList.remove("show");
  }

  function openMenu() {
    state.menuOpen = true;
    if (state.ui && state.ui.menu) state.ui.menu.classList.add("show");
  }

  function toggleMenu() {
    if (state.menuOpen) closeMenu();
    else openMenu();
  }

  function bindUiEvents() {
    if (!state.ui || state.ui.__bound) return true;
    const ui = state.ui;
    ui.__bound = true;

    ui.body.addEventListener("scroll", onChatScroll);

    ui.autoReadBtn.addEventListener("click", () => {
      state.autoRead = !state.autoRead;
      ui.autoReadBtn.textContent = state.autoRead ? "Voz on" : "Voz off";
      setComposerStatus(state.autoRead ? "Leitura automática ativada." : "Leitura automática desligada.");
      persistUiState();
    });

    ui.clearBtn.addEventListener("click", () => {
      clearChat();
      closeMenu();
    });

    ui.plusBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });

    ui.menuAddFile.addEventListener("click", () => {
      closeMenu();
      ui.fileInput.click();
    });

    ui.menuAddImage.addEventListener("click", () => {
      closeMenu();
      ui.imageInput.click();
    });

    ui.menuAddPdf.addEventListener("click", () => {
      closeMenu();
      ui.pdfInput.click();
    });

    ui.menuAddZip.addEventListener("click", () => {
      closeMenu();
      ui.zipInput.click();
    });

    ui.menuAddVideo.addEventListener("click", () => {
      closeMenu();
      ui.videoInput.click();
    });

    ui.menuAddAudio.addEventListener("click", () => {
      closeMenu();
      ui.audioInput.click();
    });

    ui.menuAddSnapshot.addEventListener("click", () => {
      closeMenu();
      const snap = buildTechnicalContextText();
      ui.textarea.value = (ui.textarea.value ? ui.textarea.value + "\n\n" : "") + snap;
      persistDraft();
      autogrowTextarea();
      ui.textarea.focus();
    });

    ui.menuClearAttachments.addEventListener("click", () => {
      closeMenu();
      clearAttachments();
      setComposerStatus("Anexos limpos.");
    });

    ui.fileInput.addEventListener("change", async (ev) => {
      await handleSelectedFiles(ev.target.files, "file");
      ev.target.value = "";
    });

    ui.imageInput.addEventListener("change", async (ev) => {
      await handleSelectedFiles(ev.target.files, "image");
      ev.target.value = "";
    });

    ui.pdfInput.addEventListener("change", async (ev) => {
      await handleSelectedFiles(ev.target.files, "pdf");
      ev.target.value = "";
    });

    ui.zipInput.addEventListener("change", async (ev) => {
      await handleSelectedFiles(ev.target.files, "zip");
      ev.target.value = "";
    });

    ui.videoInput.addEventListener("change", async (ev) => {
      await handleSelectedFiles(ev.target.files, "video");
      ev.target.value = "";
    });

    ui.audioInput.addEventListener("change", async (ev) => {
      await handleSelectedFiles(ev.target.files, "audio");
      ev.target.value = "";
    });

    ui.textarea.addEventListener("input", () => {
      persistDraft();
      autogrowTextarea();
    });

    ui.textarea.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        sendPrompt(ui.textarea.value);
      }
    });

    ui.sendBtn.addEventListener("click", () => {
      sendPrompt(ui.textarea.value);
    });

    ui.voiceBtn.addEventListener("click", () => {
      if (state.voiceListening) stopVoiceInput();
      else startVoiceInput();
    });

    if (!state.boundDocClick) {
      state.boundDocClick = function (ev) {
        if (!state.ui || !state.ui.menu || !state.ui.plusBtn) return;
        if (state.ui.menu.contains(ev.target) || state.ui.plusBtn.contains(ev.target)) return;
        closeMenu();
      };
      document.addEventListener("click", state.boundDocClick);
    }

    if (!state.boundVisibility) {
      state.boundVisibility = function () {
        if (document.hidden) stopVoiceInput();
      };
      document.addEventListener("visibilitychange", state.boundVisibility);
    }

    if (!state.boundResize) {
      state.boundResize = function () {
        autogrowTextarea();
        if (state.ui && state.ui.menu && state.menuOpen) {
          closeMenu();
        }
      };
      window.addEventListener("resize", state.boundResize);
    }

    return true;
  }

  function persistUiState() {
    writeStorage(STORAGE_KEYS.ui, JSON.stringify({
      autoRead: !!state.autoRead
    }));
  }

  function restoreUiState() {
    const raw = readStorage(STORAGE_KEYS.ui, "{}");
    const data = safeJsonParse(raw, {});
    state.autoRead = !!data.autoRead;
  }

  // =========================================================
  // 15) MOUNT / SYNC
  // =========================================================
  function renderInitialUiState() {
    if (!state.ui) return false;

    restoreUiState();
    state.ui.autoReadBtn.textContent = state.autoRead ? "Voz on" : "Voz off";
    state.ui.textarea.value = restoreDraft();
    autogrowTextarea();
    renderAttachmentBar();
    loadHistory();
    rerenderHistoryPreservingScroll(true);
    reflectBusyUi();
    setComposerStatus(state.composerStatusText || "");

    requestAnimation(() => {
      autogrowTextarea();
      scrollChatToBottom(true);
    });

    return true;
  }

  function isMountedInValidHost() {
    if (!state.mounted || !state.host || !state.ui || !state.ui.root) return false;
    if (!document.body.contains(state.host)) return false;
    if (!document.body.contains(state.ui.root)) return false;
    if (!state.host.contains(state.ui.root)) return false;
    return true;
  }

  function sync() {
    if (state.isSyncing) return true;
    state.isSyncing = true;

    try {
      if (!state.mounted || !state.ui || !state.host) return false;

      if (!isMountedInValidHost()) {
        state.mounted = false;
        state.ui = null;
        return false;
      }

      stabilizeHostLayout(state.host);
      renderAttachmentBar();
      reflectBusyUi();
      return true;
    } catch (e) {
      warn("sync failed", e);
      return false;
    } finally {
      state.isSyncing = false;
    }
  }

  function startSync() {
    if (state.syncTimer) return true;
    state.syncTimer = setInterval(sync, SYNC_INTERVAL_MS);
    return true;
  }

  function stopSync() {
    if (state.syncTimer) clearInterval(state.syncTimer);
    state.syncTimer = null;
    return true;
  }

  function mount(target) {
    if (state.mounting) return false;

    const nextHost = resolveHost(target);
    if (!nextHost) {
      warn("mount skipped: host not found yet");
      return false;
    }

    const nextSig = resolveHostSignature(nextHost);

    if (state.mounted && state.host === nextHost && isMountedInValidHost()) {
      sync();
      return true;
    }

    if (state.mounted && state.host && state.host !== nextHost) {
      try { unmount(); } catch (_) {}
    }

    state.mounting = true;
    try {
      state.host = nextHost;
      state.lastHostSignature = nextSig;

      buildUi(nextHost);
      bindUiEvents();
      renderInitialUiState();

      state.mounted = true;
      state.mountCount += 1;
      startSync();
      log("mounted", VERSION, "count=", state.mountCount, "host=", nextSig);
      return true;
    } catch (e) {
      errLog("mount failed", e);
      state.mounted = false;
      state.ui = null;
      return false;
    } finally {
      state.mounting = false;
    }
  }

  function mountLoop(target) {
    if (mount(target)) return true;
    if (state.mountTimer) clearTimeout(state.mountTimer);
    state.mountTimer = setTimeout(() => mountLoop(target), MOUNT_RETRY_MS);
    return false;
  }

  function unmount() {
    stopSync();

    if (state.mountTimer) {
      clearTimeout(state.mountTimer);
      state.mountTimer = null;
    }

    if (state.ui && state.ui.root && state.host && state.host.contains(state.ui.root)) {
      state.host.removeChild(state.ui.root);
    }

    state.ui = null;
    state.host = null;
    state.mounted = false;
    state.menuOpen = false;
    return true;
  }

  function destroyRuntime(reason) {
    try { stopVoiceInput(); } catch (_) {}
    try { stopSpeak(); } catch (_) {}
    try { stopSync(); } catch (_) {}

    try {
      if (state.mountTimer) {
        clearTimeout(state.mountTimer);
        state.mountTimer = null;
      }
    } catch (_) {}

    try {
      if (state.boundDocClick) {
        document.removeEventListener("click", state.boundDocClick);
        state.boundDocClick = null;
      }
    } catch (_) {}

    try {
      if (state.boundVisibility) {
        document.removeEventListener("visibilitychange", state.boundVisibility);
        state.boundVisibility = null;
      }
    } catch (_) {}

    try {
      if (state.boundResize) {
        window.removeEventListener("resize", state.boundResize);
        state.boundResize = null;
      }
    } catch (_) {}

    try { unmount(); } catch (_) {}
    try { removeAllLegacyRoots(); } catch (_) {}

    try {
      if (window.__RCF_ADMIN_AI_RUNTIME__ && window.__RCF_ADMIN_AI_RUNTIME__.version === VERSION) {
        window.__RCF_ADMIN_AI_RUNTIME__ = null;
      }
    } catch (_) {}

    log("destroyed", reason || "cleanup");
    return true;
  }

  // =========================================================
  // 16) PUBLIC API
  // =========================================================
  const api = {
    VERSION,
    mount,
    mountLoop,
    unmount,
    sync,
    startSync,
    stopSync,
    clearChat,
    clearAttachments,
    sendPrompt,
    getHistory,
    getAttachments,
    getLastEndpoint,
    getSnapshot: buildTechnicalSnapshot,
    getTechnicalContextText: buildTechnicalContextText,
    speakText,
    startVoiceInput,
    stopVoiceInput,
    debugState: function () {
      return {
        version: VERSION,
        mounted: state.mounted,
        busy: state.busy,
        mountCount: state.mountCount,
        historyCount: state.history.length,
        attachmentsCount: state.attachments.length,
        lastEndpoint: state.lastEndpoint,
        lastRoute: state.lastRoute,
        autoRead: state.autoRead,
        hostSignature: state.lastHostSignature || ""
      };
    }
  };

  window[API_NAME] = Object.assign(window[API_NAME] || {}, api);
  window[LEGACY_API_NAME] = window[API_NAME];
  window.__RCF_ADMIN_AI_RUNTIME__ = {
    version: VERSION,
    destroy: destroyRuntime,
    unmount: unmount,
    mount: mount,
    mountLoop: mountLoop
  };

  // =========================================================
  // 17) BOOT
  // =========================================================
  try {
    removeAllLegacyRoots();
    ensureCss();
    state.history = loadHistory();
    state.attachments = [];
    restoreUiState();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => mountLoop());
    } else {
      mountLoop();
    }
  } catch (e) {
    errLog("boot failed", e);
  }

  log("booted", VERSION);
})();

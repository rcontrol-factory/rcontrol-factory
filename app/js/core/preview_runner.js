/* FILE: /app/js/core/preview_runner.js
   RControl Factory — core/preview_runner.js — v1.3 STUDIO (SAFE)
   PATCH v1.3s (DEGRAU 3):
   - ✅ Storage Namespacing por appSlug (evita apps “misturarem” horas/config no mesmo domínio)
   - ✅ Snapshot por app (salva/restaura estado ao reabrir preview)
   - ✅ PostMessage bridge (child -> parent) para persistir snapshot no localStorage da Factory
   - Mantém: overlay grande, drawer console, Open Clean, normalize refs, revoke blob urls
*/

(() => {
  "use strict";

  // =========================================================
  // GUARD
  // =========================================================
  if (window.RCF_PREVIEW && window.RCF_PREVIEW.__v13) return;

  // =========================================================
  // LOG
  // =========================================================
  const log = (...a) => {
    const s = a.map(x => String(x)).join(" ");
    try { window.RCF_LOGGER?.push?.("INFO", s); } catch {}
    try { console.log("[RCF_PREVIEW]", ...a); } catch {}
  };
  const warn = (...a) => {
    const s = a.map(x => String(x)).join(" ");
    try { window.RCF_LOGGER?.push?.("WARN", s); } catch {}
    try { console.warn("[RCF_PREVIEW]", ...a); } catch {}
  };
  const errlog = (...a) => {
    const s = a.map(x => String(x)).join(" ");
    try { window.RCF_LOGGER?.push?.("ERR", s); } catch {}
    try { console.error("[RCF_PREVIEW]", ...a); } catch {}
  };

  const $ = (sel, root = document) => root.querySelector(sel);

  function safeHTML(s) {
    return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }

  // =========================================================
  // STATE HELPERS
  // =========================================================
  function getState() {
    try { if (window.RCF?.state) return window.RCF.state; } catch {}
    try { if (window.RCF_STATE) return window.RCF_STATE; } catch {}
    return null;
  }

  function getActiveSlugFromState(st) {
    try {
      return st?.active?.appSlug || st?.active?.slug || st?.activeAppSlug || st?.activeSlug || null;
    } catch {
      return null;
    }
  }

  function getActiveAppFromState() {
    const st = getState();
    if (!st) return null;

    const slug = getActiveSlugFromState(st);
    const apps = st?.apps || st?.data?.apps || [];
    if (!slug || !Array.isArray(apps)) return null;

    return apps.find(a => String(a?.slug || "") === String(slug)) || null;
  }

  // Fallback (se UI ainda não colocou estado mas já tem localStorage rcf:apps)
  function getAppsFromLocalStorage() {
    try {
      const raw = localStorage.getItem("rcf:apps") || "[]";
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function getLastActiveSlugFallback() {
    // tenta achar alguma chave comum usada pela UI
    const keys = [
      "rcf:active:app",
      "rcf:active:slug",
      "rcf:activeAppSlug",
      "rcf:lastAppSlug"
    ];
    for (const k of keys) {
      try {
        const v = localStorage.getItem(k);
        if (v && String(v).trim()) return String(v).trim();
      } catch {}
    }
    return null;
  }

  function getActiveAppFallback() {
    const apps = getAppsFromLocalStorage();
    if (!apps.length) return null;

    const slug = getLastActiveSlugFallback();
    if (slug) {
      const hit = apps.find(a => String(a?.slug || "") === String(slug));
      if (hit) return hit;
    }
    // se não sabe qual é o ativo, pega o primeiro (melhor do que nada)
    return apps[0] || null;
  }

  function getActiveApp() {
    return getActiveAppFromState() || getActiveAppFallback();
  }

  // =========================================================
  // PATH / MIME
  // =========================================================
  function normKey(k) {
    let x = String(k || "").trim();
    if (!x) return "";
    x = x.replace(/\\/g, "/");
    x = x.replace(/^[.]\//, ""); // ./file
    x = x.replace(/^\/+/, "");   // /file
    x = x.split("#")[0].split("?")[0];
    x = x.replace(/\/{2,}/g, "/");
    return x;
  }

  function mimeByPath(p) {
    const s = String(p || "").toLowerCase();
    if (s.endsWith(".html") || s.endsWith(".htm")) return "text/html";
    if (s.endsWith(".css")) return "text/css";
    if (s.endsWith(".js")) return "text/javascript";
    if (s.endsWith(".json")) return "application/json";
    if (s.endsWith(".svg")) return "image/svg+xml";
    if (s.endsWith(".png")) return "image/png";
    if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
    if (s.endsWith(".webp")) return "image/webp";
    if (s.endsWith(".pdf")) return "application/pdf";
    return "text/plain";
  }

  function isProbablyDataUrl(s) {
    const x = String(s || "");
    return x.startsWith("data:") && x.includes(";base64,");
  }

  // =========================================================
  // SNAPSHOT STORAGE (PARENT)
  // =========================================================
  function snapKey(slug) {
    return "rcf:preview:snap:" + String(slug || "").trim();
  }

  function loadSnapshot(slug) {
    try {
      const raw = localStorage.getItem(snapKey(slug));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch {
      return null;
    }
  }

  function saveSnapshot(slug, data) {
    try {
      if (!slug) return;
      const safe = data && typeof data === "object" ? data : null;
      if (!safe) return;
      localStorage.setItem(snapKey(slug), JSON.stringify(safe));
    } catch {}
  }

  // bridge: child -> parent
  function ensureSnapBridge() {
    if (window.__RCF_PREVIEW_SNAP_BRIDGE__) return;
    window.__RCF_PREVIEW_SNAP_BRIDGE__ = true;

    window.addEventListener("message", (ev) => {
      try {
        const d = ev?.data;
        if (!d || typeof d !== "object") return;
        if (d.type !== "RCF_PREVIEW_SNAP") return;

        const slug = String(d.slug || "").trim();
        const payload = d.data && typeof d.data === "object" ? d.data : null;
        if (!slug || !payload) return;

        saveSnapshot(slug, payload);
        try { window.RCF_LOGGER?.push?.("INFO", `preview snapshot saved ✅ slug=${slug} keys=${Object.keys(payload).length}`); } catch {}
      } catch {}
    }, false);
  }

  ensureSnapBridge();

  // =========================================================
  // BLOB POOL (leak guard)
  // =========================================================
  const BlobPool = {
    urls: [],
    reset() {
      const list = this.urls.slice(0);
      this.urls = [];
      for (const u of list) {
        try { URL.revokeObjectURL(u); } catch {}
      }
    },
    track(u) {
      try { this.urls.push(u); } catch {}
      return u;
    }
  };

  function buildBlobMap(files) {
    BlobPool.reset();

    const map = {};
    const src = files || {};

    for (const [name, content] of Object.entries(src)) {
      const key = normKey(name);
      if (!key) continue;

      // Se o arquivo já for data:URL, usa direto (não cria blob)
      if (isProbablyDataUrl(content)) {
        map[key] = String(content);
        continue;
      }

      const type = mimeByPath(key);
      const blob = new Blob([String(content ?? "")], { type });
      const url = BlobPool.track(URL.createObjectURL(blob));
      map[key] = url;
    }

    return map;
  }

  function rewriteIndexHtml(indexHtml, blobMap) {
    let html = String(indexHtml ?? "");

    // troca src="..." e href="..." por blob url, quando existir match
    const replaceAttr = (attr) => {
      html = html.replace(
        new RegExp(`${attr}\\s*=\\s*"(.*?)"`, "gi"),
        (m, v) => {
          const raw = String(v || "").trim();
          if (!raw) return m;

          const key = normKey(raw);
          if (blobMap[key]) return `${attr}="${blobMap[key]}"`;

          return m;
        }
      );
    };

    replaceAttr("src");
    replaceAttr("href");

    return html;
  }

  // =========================================================
  // PRELUDE INJECT (namespacing + snapshot)
  // =========================================================
  function injectPrelude(html, slug, snapshotObj) {
    const appSlug = String(slug || "").trim();
    const snap = snapshotObj && typeof snapshotObj === "object" ? snapshotObj : null;

    // IMPORTANT: não mexe em chaves rcf:* (da Factory) e não mexe em chaves que já venham com prefixo
    const prelude = `
<script>
(function(){
  "use strict";
  try { window.__RCF_APP_SLUG__ = ${JSON.stringify(appSlug)}; } catch {}

  var SLUG = ${JSON.stringify(appSlug)};
  var PREFIX = SLUG ? (SLUG + "::") : "";
  var SNAP = ${JSON.stringify(snap || null)};

  function shouldBypass(k){
    try{
      var s = String(k||"");
      if (!s) return true;
      if (!PREFIX) return false;
      if (s.startsWith("rcf:")) return true;
      if (s.startsWith("__RCF")) return true;
      if (s.startsWith(PREFIX)) return true;
      if (s.startsWith("RCF_SHARED::")) return true;
      return false;
    }catch{ return false; }
  }

  function kx(k){
    try{
      if (!PREFIX) return String(k||"");
      var s = String(k||"");
      if (shouldBypass(s)) return s;
      return PREFIX + s;
    }catch{ return String(k||""); }
  }

  function unpx(k){
    try{
      var s = String(k||"");
      if (!PREFIX) return s;
      if (s.startsWith(PREFIX)) return s.slice(PREFIX.length);
      return s;
    }catch{ return String(k||""); }
  }

  function patchStorage(stor){
    try{
      if (!stor || stor.__RCF_PATCHED__) return;
      stor.__RCF_PATCHED__ = true;

      var _get = stor.getItem.bind(stor);
      var _set = stor.setItem.bind(stor);
      var _rem = stor.removeItem.bind(stor);
      var _key = stor.key.bind(stor);
      var _clr = stor.clear.bind(stor);

      stor.getItem = function(k){ return _get(kx(k)); };
      stor.setItem = function(k,v){ return _set(kx(k), String(v)); };
      stor.removeItem = function(k){ return _rem(kx(k)); };

      // key/length precisam "filtrar" para o app
      stor.key = function(i){
        try{
          var idx = Number(i)||0;
          var list = [];
          for (var j=0;j<stor.length;j++){
            var kk = _key(j);
            if (!kk) continue;
            if (!PREFIX) { list.push(kk); continue; }
            if (kk.startsWith(PREFIX)) list.push(kk);
          }
          var hit = list[idx];
          return hit ? unpx(hit) : null;
        }catch{ return null; }
      };

      try{
        Object.defineProperty(stor, "length", {
          configurable: true,
          get: function(){
            try{
              if (!PREFIX) return stor.__RCF_LEN_RAW__ ?? stor.length;
              var c=0;
              for (var j=0;j<stor.__RCF_LEN_RAW__ ?? stor.length;j++){
                var kk = _key(j);
                if (kk && kk.startsWith(PREFIX)) c++;
              }
              return c;
            }catch{ return stor.length; }
          }
        });
      }catch{}

      stor.clear = function(){
        try{
          if (!PREFIX) return _clr();
          var toDel = [];
          for (var j=0;j<stor.length;j++){
            var kk = _key(j);
            if (kk && kk.startsWith(PREFIX)) toDel.push(kk);
          }
          for (var x=0;x<toDel.length;x++) _rem(toDel[x]);
        }catch{}
      };

      // snapshot restore (antes do app rodar)
      try{
        if (SNAP && typeof SNAP === "object"){
          for (var key in SNAP){
            if (!Object.prototype.hasOwnProperty.call(SNAP, key)) continue;
            try { _set(kx(key), String(SNAP[key])); } catch {}
          }
        }
      }catch{}
    }catch{}
  }

  // patch localStorage + sessionStorage (só dentro do preview)
  try { patchStorage(window.localStorage); } catch {}
  try { patchStorage(window.sessionStorage); } catch {}

  // snapshot save: envia pro parent
  function emitSnapshot(){
    try{
      if (!PREFIX) return;
      var out = {};
      var ls = window.localStorage;
      // varre keys reais do storage (sem usar key() patchado)
      for (var i=0;i<ls.length;i++){
        var rk = Object.getPrototypeOf(ls).key.call(ls, i);
        if (!rk || !String(rk).startsWith(PREFIX)) continue;
        var uk = unpx(rk);
        try { out[uk] = Object.getPrototypeOf(ls).getItem.call(ls, rk); } catch {}
      }
      window.parent && window.parent.postMessage({ type:"RCF_PREVIEW_SNAP", slug: SLUG, data: out }, "*");
    }catch{}
  }

  try {
    window.addEventListener("pagehide", emitSnapshot);
    window.addEventListener("beforeunload", emitSnapshot);
  } catch {}

})();
</script>`.trim();

    // injeta no HEAD se existir, senão no começo
    const s = String(html || "");
    if (/\<\/head\>/i.test(s)) {
      return s.replace(/\<\/head\>/i, prelude + "\n</head>");
    }
    if (/\<body[^>]*\>/i.test(s)) {
      return s.replace(/\<body[^>]*\>/i, (m) => m + "\n" + prelude + "\n");
    }
    return prelude + "\n" + s;
  }

  // =========================================================
  // UI — OVERLAY STUDIO
  // =========================================================
  function ensureOverlay() {
    let ov = $("#rcfPreviewOverlay");
    if (ov) return ov;

    ov = document.createElement("div");
    ov.id = "rcfPreviewOverlay";
    ov.style.cssText = [
      "position:fixed;inset:0;z-index:999999;",
      "background:rgba(0,0,0,.62);backdrop-filter:blur(6px);",
      "display:none;align-items:center;justify-content:center;padding:10px;"
    ].join("");

    // Layout: topbar + content (iframe full) + drawer logs (toggle)
    ov.innerHTML = `
      <div id="rcfPreviewCard" style="
        width:min(1180px,98vw);
        height:min(860px,96vh);
        background:rgba(10,14,22,.96);
        border:1px solid rgba(255,255,255,.12);
        border-radius:16px;
        overflow:hidden;
        display:flex;
        flex-direction:column
      ">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10)">
          <div style="font-weight:900;color:#fff">Preview</div>

          <div id="rcfPreviewMeta" style="margin-left:auto;font-size:12px;opacity:.85;color:#fff;max-width:56%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>

          <button id="rcfPreviewOpenClean" type="button" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-weight:900">Open Clean</button>
          <button id="rcfPreviewToggleLogs" type="button" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-weight:900">Console</button>
          <button id="rcfPreviewReload" type="button" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-weight:900">Reload</button>
          <button id="rcfPreviewClose" type="button" style="padding:8px 10px;border-radius:0;background:#ef4444;color:#fff;font-weight:900;border-radius:999px">Close</button>
        </div>

        <div style="display:flex;flex:1;min-height:0;position:relative">
          <iframe id="rcfPreviewFrame" title="RCF Preview" style="border:0;flex:1;width:100%;background:#fff"></iframe>

          <div id="rcfPreviewLogsDrawer" style="
            position:absolute;top:0;right:0;height:100%;
            width:min(420px,92vw);
            transform:translateX(102%);
            transition:transform .18s ease;
            background:rgba(6,10,18,.98);
            border-left:1px solid rgba(255,255,255,.10);
            display:flex;flex-direction:column;
          ">
            <div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(255,255,255,.10);color:#fff">
              <div style="font-weight:900">Console</div>
              <div style="margin-left:auto;opacity:.7;font-size:12px">SAFE</div>
              <button id="rcfPreviewLogsClose" type="button" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font-weight:900">Fechar</button>
            </div>

            <pre id="rcfPreviewLog" style="
              margin:0;flex:1;min-height:0;overflow:auto;
              white-space:pre-wrap;word-break:break-word;
              padding:12px;color:#fff;
              font-family:ui-monospace,Menlo,monospace;font-size:12px;
              background:rgba(0,0,0,.30)
            "></pre>

            <div style="padding:10px;border-top:1px solid rgba(255,255,255,.10);color:#fff;opacity:.75;font-size:12px">
              Dica: se um arquivo não carregar, revise refs (src/href) no index.html.
              <br/>✅ Storage isolado por app: <span style="font-weight:900">slug::key</span> + snapshot auto.
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(ov);

    // click fora fecha
    ov.addEventListener("pointerdown", (ev) => {
      try { if (ev.target === ov) closePreview(); } catch {}
    }, { passive: true });

    $("#rcfPreviewClose")?.addEventListener("click", () => closePreview(), { passive: true });

    $("#rcfPreviewReload")?.addEventListener("click", () => {
      try { window.RCF_PREVIEW?.open?.({ reload: true }); } catch {}
    }, { passive: true });

    const toggleLogs = () => {
      const dr = $("#rcfPreviewLogsDrawer");
      if (!dr) return;
      const open = dr.getAttribute("data-open") === "1";
      if (open) {
        dr.setAttribute("data-open", "0");
        dr.style.transform = "translateX(102%)";
      } else {
        dr.setAttribute("data-open", "1");
        dr.style.transform = "translateX(0%)";
      }
    };

    $("#rcfPreviewToggleLogs")?.addEventListener("click", () => {
      try { toggleLogs(); } catch {}
    }, { passive: true });

    $("#rcfPreviewLogsClose")?.addEventListener("click", () => {
      try { toggleLogs(); } catch {}
    }, { passive: true });

    $("#rcfPreviewOpenClean")?.addEventListener("click", () => {
      try {
        const app = getActiveApp();
        const slug = String(app?.slug || "").trim();
        if (!slug) return;
        const url = `./preview.html?app=${encodeURIComponent(slug)}`;
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {}
    }, { passive: true });

    return ov;
  }

  function pushPreviewLog(line) {
    try {
      const pre = $("#rcfPreviewLog");
      if (!pre) return;
      pre.textContent = (pre.textContent ? pre.textContent + "\n" : "") + String(line || "");
    } catch {}
  }

  function closePreview() {
    // tenta provocar snapshot do child antes de fechar
    try {
      const frame = $("#rcfPreviewFrame");
      frame?.contentWindow?.postMessage?.({ type: "RCF_PREVIEW_SNAP_PLEASE" }, "*");
    } catch {}

    try {
      const ov = $("#rcfPreviewOverlay");
      if (ov) ov.style.display = "none";
    } catch {}
    try { BlobPool.reset(); } catch {}
  }

  // =========================================================
  // OPEN PREVIEW
  // =========================================================
  async function openPreview(opts = {}) {
    const ov = ensureOverlay();
    const frame = $("#rcfPreviewFrame");
    const meta = $("#rcfPreviewMeta");
    const logBox = $("#rcfPreviewLog");

    try { if (logBox) logBox.textContent = ""; } catch {}
    try { BlobPool.reset(); } catch {}

    try {
      const app = getActiveApp();

      if (!app) {
        pushPreviewLog("⚠️ Nenhum app ativo. Selecione um app primeiro.");
        if (meta) meta.textContent = "Sem app ativo";
        ov.style.display = "flex";
        if (frame) frame.srcdoc = `<h1 style="font-family:system-ui;padding:18px">Sem app ativo</h1>`;
        return { ok: false, err: "no_active_app" };
      }

      const slug = String(app?.slug || "").trim();
      const files = app.files || {};
      const indexHtml =
        files["index.html"] ||
        files["/index.html"] ||
        files["app/index.html"] ||
        files["./index.html"] ||
        "";

      if (!indexHtml) {
        pushPreviewLog("⚠️ App ativo não tem index.html.");
        if (meta) meta.textContent = `${app.name || "App"} (${app.slug || "?"})`;
        ov.style.display = "flex";
        if (frame) frame.srcdoc = `<h1 style="font-family:system-ui;padding:18px">App sem index.html</h1>`;
        return { ok: false, err: "missing_index" };
      }

      const blobMap = buildBlobMap(files);
      let html = rewriteIndexHtml(indexHtml, blobMap);

      // ✅ DEGRAU 3: injeção de isolamento + snapshot
      const snap = slug ? loadSnapshot(slug) : null;
      html = injectPrelude(html, slug, snap);

      if (meta) meta.textContent = `${app.name || "App"} (${slug || "?"}) • files=${Object.keys(files).length}`;

      pushPreviewLog("✅ Preview montado (sandbox).");
      if (slug) {
        pushPreviewLog(`✅ Storage isolado por app: prefix="${slug}::"`);
        pushPreviewLog(`✅ Snapshot: ${snap ? "restaurado" : "vazio (primeira vez)"}`);
      } else {
        pushPreviewLog("⚠️ App sem slug — isolamento/snapshot ficam limitados.");
      }
      pushPreviewLog("Dica: se um arquivo não carregar, revise refs (src/href) no index.html.");

      ov.style.display = "flex";

      // se quiser “reload”, força trocar srcdoc
      if (frame) frame.srcdoc = html;

      return { ok: true };
    } catch (e) {
      errlog("preview fail:", e?.message || e);
      pushPreviewLog("❌ Erro no Preview: " + (e?.message || e));
      try {
        ov.style.display = "flex";
        if (frame) frame.srcdoc = `<pre style="font-family:ui-monospace,Menlo,monospace;padding:18px">${safeHTML(String(e?.stack || e?.message || e))}</pre>`;
      } catch {}
      return { ok: false, err: String(e?.message || e) };
    }
  }

  // =========================================================
  // BIND BUTTONS (generator/agent/etc)
  // =========================================================
  function bindPreviewButtons() {
    const candidates = [
      "#btnGenPreview",
      '[data-rcf-action="gen.preview"]',
      "#btnPreview",
      '[data-rcf-action="preview.open"]',
      '[data-rcf-action="preview"]'
    ];

    for (const sel of candidates) {
      const el = $(sel);
      if (!el || el.__rcfPreviewBound__) continue;
      el.__rcfPreviewBound__ = true;

      el.addEventListener("click", (ev) => {
        try { ev.preventDefault(); ev.stopPropagation(); } catch {}
        openPreview({});
      }, { passive: false });

      log("preview hook ok:", sel);
    }
  }

  // =========================================================
  // EXPOSE API
  // =========================================================
  window.RCF_PREVIEW = {
    __v13: true,
    open: (opts) => openPreview(opts),
    close: () => closePreview(),
    bind: () => bindPreviewButtons()
  };

  // boot
  bindPreviewButtons();
  setTimeout(bindPreviewButtons, 800);
  setTimeout(bindPreviewButtons, 2000);

  log("PREVIEW runner ready ✅ v1.3 STUDIO + SNAPSHOT");
})();

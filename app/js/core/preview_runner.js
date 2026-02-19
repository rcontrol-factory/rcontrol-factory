/* RCF — PREVIEW_RUNNER PATCH (v1.2b SAFE) — insert at JS_EOF
   - FIX: revoke blob URLs (anti leak)
   - FIX: normalize refs ./file /file
*/
(() => {
  "use strict";

  try {
    if (window.__RCF_PREVIEW_PATCHED_v12__) return;
    window.__RCF_PREVIEW_PATCHED_v12__ = true;

    const log = (...a) => {
      try {
        (window.RCF_LOGGER?.push?.("INFO", a.map(x => String(x)).join(" ")) ||
         window.RCF_LOGGER?.push?.("LOG",  a.map(x => String(x)).join(" ")));
      } catch {}
      try { console.log("[RCF_PREVIEW]", ...a); } catch {}
    };

    const errlog = (...a) => {
      try { window.RCF_LOGGER?.push?.("ERR", a.map(x => String(x)).join(" ")); } catch {}
      try { console.error("[RCF_PREVIEW]", ...a); } catch {}
    };

    const $ = (sel, root = document) => root.querySelector(sel);

    function getActiveAppFromState() {
      const st = window.RCF?.state || window.RCF_STATE || null;
      const apps = st?.apps || [];
      const slug = st?.active?.appSlug || st?.active?.slug || null;
      if (!slug) return null;
      return apps.find(a => a?.slug === slug) || null;
    }

    function safeHTML(s) {
      return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
    }

    // --- FIX: normalize path keys ---
    function normKey(k) {
      let x = String(k || "").trim();
      if (!x) return "";
      x = x.replace(/\\/g, "/");
      x = x.replace(/^[.]\//, ""); // ./file
      x = x.replace(/^\/+/, "");   // /file
      x = x.split("#")[0].split("?")[0];
      return x;
    }

    // --- leak guard ---
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
      for (const [name, content] of Object.entries(files || {})) {
        const key = normKey(name);
        if (!key) continue;

        const lower = key.toLowerCase();
        let type = "text/plain";
        if (lower.endsWith(".html")) type = "text/html";
        else if (lower.endsWith(".css")) type = "text/css";
        else if (lower.endsWith(".js")) type = "text/javascript";
        else if (lower.endsWith(".json")) type = "application/json";
        else if (lower.endsWith(".pdf")) type = "application/pdf";

        const blob = new Blob([String(content ?? "")], { type });
        const url = BlobPool.track(URL.createObjectURL(blob));

        map[key] = url;
      }
      return map;
    }

    function rewriteIndexHtml(indexHtml, blobMap) {
      let html = String(indexHtml ?? "");

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

    function ensureOverlay() {
      let ov = $("#rcfPreviewOverlay");
      if (ov) return ov;

      ov = document.createElement("div");
      ov.id = "rcfPreviewOverlay";
      ov.style.cssText = [
        "position:fixed;inset:0;z-index:999999;",
        "background:rgba(0,0,0,.62);backdrop-filter:blur(6px);",
        "display:none;align-items:center;justify-content:center;padding:14px;"
      ].join("");

      ov.innerHTML = `
        <div id="rcfPreviewCard" style="width:min(980px,96vw);height:min(760px,92vh);background:rgba(10,14,22,.96);border:1px solid rgba(255,255,255,.12);border-radius:16px;overflow:hidden;display:flex;flex-direction:column">
          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10)">
            <div style="font-weight:900;color:#fff">Preview Sandbox</div>
            <div id="rcfPreviewMeta" style="margin-left:auto;font-size:12px;opacity:.85;color:#fff;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
            <button id="rcfPreviewReload" type="button" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-weight:800">Reload</button>
            <button id="rcfPreviewClose" type="button" style="padding:8px 10px;border-radius:999px;border:0;background:#ef4444;color:#fff;font-weight:900">Close</button>
          </div>

          <div style="display:flex;gap:10px;flex:1;min-height:0">
            <div style="width:260px;max-width:40%;border-right:1px solid rgba(255,255,255,.10);padding:10px;overflow:auto;color:#fff">
              <div style="font-weight:900;margin-bottom:8px">Logs</div>
              <pre id="rcfPreviewLog" style="white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:10px;min-height:120px"></pre>
              <div style="opacity:.75;font-size:12px;margin-top:10px">
                SAFE: se quebrar, fecha sozinho e não trava a Factory.
              </div>
            </div>

            <div style="flex:1;min-width:0;display:flex;flex-direction:column">
              <iframe id="rcfPreviewFrame" title="RCF Preview" style="border:0;flex:1;width:100%;background:#fff"></iframe>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(ov);

      ov.addEventListener("pointerdown", (ev) => {
        try { if (ev.target === ov) closePreview(); } catch {}
      }, { passive: true });

      $("#rcfPreviewClose")?.addEventListener("click", () => closePreview(), { passive: true });
      $("#rcfPreviewReload")?.addEventListener("click", () => {
        try { window.RCF_PREVIEW?.open?.({ reload: true }); } catch {}
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
      try {
        const ov = $("#rcfPreviewOverlay");
        if (ov) ov.style.display = "none";
      } catch {}
      // FIX: revoke blobs on close
      try { BlobPool.reset(); } catch {}
    }

    async function openPreview(opts = {}) {
      const ov = ensureOverlay();
      const frame = $("#rcfPreviewFrame");
      const meta = $("#rcfPreviewMeta");
      const logBox = $("#rcfPreviewLog");

      try { if (logBox) logBox.textContent = ""; } catch {}

      try {
        const app = getActiveAppFromState();
        if (!app) {
          pushPreviewLog("⚠️ Nenhum app ativo. Selecione um app no Dashboard primeiro.");
          if (meta) meta.textContent = "Sem app ativo";
          ov.style.display = "flex";
          if (frame) frame.srcdoc = `<h1 style="font-family:system-ui;padding:18px">Sem app ativo</h1>`;
          return { ok: false, err: "no_active_app" };
        }

        const files = app.files || {};
        const indexHtml =
          files["index.html"] || files["/index.html"] || files["app/index.html"] || "";

        if (!indexHtml) {
          pushPreviewLog("⚠️ App ativo não tem index.html.");
          if (meta) meta.textContent = `${app.name} (${app.slug})`;
          ov.style.display = "flex";
          if (frame) frame.srcdoc = `<h1 style="font-family:system-ui;padding:18px">App sem index.html</h1>`;
          return { ok: false, err: "missing_index" };
        }

        const blobMap = buildBlobMap(files);
        const html = rewriteIndexHtml(indexHtml, blobMap);

        if (meta) meta.textContent = `${app.name} (${app.slug}) • files=${Object.keys(files).length}`;
        pushPreviewLog("✅ Preview montado (sandbox).");
        pushPreviewLog("Dica: se um arquivo não carregar, revise refs (src/href) no index.html.");

        ov.style.display = "flex";
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

    // API global
    window.RCF_PREVIEW = window.RCF_PREVIEW || {};
    window.RCF_PREVIEW.open = openPreview;
    window.RCF_PREVIEW.close = closePreview;

    function bindPreviewButtons() {
      const candidates = [
        "#btnGenPreview",
        '[data-rcf-action="gen.preview"]',
        "#btnPreview",
        '[data-rcf-action="preview.open"]'
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

    bindPreviewButtons();
    setTimeout(bindPreviewButtons, 800);
    setTimeout(bindPreviewButtons, 2000);

    log("PREVIEW patch installed ✅ v1.2b");
  } catch (e) {
    try { console.error("RCF preview patch fatal:", e); } catch {}
  }
})();

/* =========================================================
  RControl Factory — js/core/preview_runner.js (PADRÃO v1.1)
  - Preview instantâneo do app-filho (abre nova aba)
  - Exporta bundle/build (JSON) do app ativo
  - NÃO depende do publish/API (só runtime local)
  - iOS safe tap + init guard
  - Clipboard robusto (await) + fallback no genOut
  - Revoke object URL (evita leak)
========================================================= */

(function () {
  "use strict";

  if (window.RCF_PREVIEW_RUNNER && window.RCF_PREVIEW_RUNNER.__v11) return;

  const $ = (id) => document.getElementById(id);

  // ---------- iOS safe tap ----------
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;

    const handler = async (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { await fn(e); } catch (err) {
        log("err", "PREVIEW error :: " + (err?.message || String(err)));
        uiOut("genOut", "❌ Erro: " + (err?.message || String(err)));
      }
    };

    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
    } catch {}

    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try {
      if (window.RCF && typeof window.RCF.log === "function") window.RCF.log(msg);
      else console.log("[RCF PREVIEW]", level, msg);
    } catch {}
  }

  function uiOut(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text ?? "");
  }

  // ---------- Leitura robusta do app ativo ----------
  // 1) window.RCF.state
  // 2) localStorage rcf:apps + rcf:active
  function getFactoryStateFallback() {
    const prefix = "rcf:";
    const safeJson = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

    const apps = safeJson(localStorage.getItem(prefix + "apps") || "[]", []);
    const active = safeJson(localStorage.getItem(prefix + "active") || "{}", {});
    return { apps, active };
  }

  function getActiveAppObject() {
    // 1) prefer API exposta
    try {
      const st = window.RCF && window.RCF.state;
      if (st && Array.isArray(st.apps) && st.active && st.active.appSlug) {
        const app = st.apps.find(a => a.slug === st.active.appSlug) || null;
        return { app, active: st.active };
      }
    } catch {}

    // 2) fallback storage
    const st2 = getFactoryStateFallback();
    const slug = st2.active?.appSlug || null;
    const app2 = slug ? (st2.apps.find(a => a.slug === slug) || null) : null;
    return { app: app2, active: st2.active || {} };
  }

  function normalizeFiles(app) {
    const files = (app && app.files && typeof app.files === "object") ? app.files : {};
    const out = {};
    for (const k of Object.keys(files)) out[k] = String(files[k] ?? "");
    return out;
  }

  // ---------- Build HTML do Preview ----------
  function buildPreviewHTML(app) {
    const files = normalizeFiles(app);

    const html = files["index.html"] || files["/index.html"] || "";
    const css = files["styles.css"] || files["/styles.css"] || "";
    const js  = files["app.js"] || files["/app.js"] || "";

    let outHtml = String(html || "").trim();

    if (!outHtml) {
      outHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${escapeHtml(app?.name || "Preview")}</title>
  <style>${css}</style>
</head>
<body>
  <h1 style="font-family:system-ui">Preview: ${escapeHtml(app?.name || "")}</h1>
  <div id="root"></div>
  <script>${js}<\/script>
</body>
</html>`;
      return outHtml;
    }

    // remove refs externos típicos
    outHtml = outHtml
      .replace(/<script\s+[^>]*src=["']app\.js["'][^>]*>\s*<\/script>/gi, "")
      .replace(/<link\s+[^>]*href=["']styles\.css["'][^>]*>/gi, "");

    // injeta CSS
    if (css) {
      if (outHtml.includes("</head>")) outHtml = outHtml.replace("</head>", `<style>${css}</style>\n</head>`);
      else outHtml = `<style>${css}</style>\n` + outHtml;
    }

    // injeta JS
    if (js) {
      if (outHtml.includes("</body>")) outHtml = outHtml.replace("</body>", `<script>${js}<\/script>\n</body>`);
      else outHtml = outHtml + `\n<script>${js}<\/script>\n`;
    }

    return outHtml;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }

  // ---------- ações ----------
  async function doPreview() {
    const { app } = getActiveAppObject();
    if (!app) {
      uiOut("genOut", "⚠️ Sem app ativo. Crie um app e selecione.");
      return;
    }

    const html = buildPreviewHTML(app);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const w = window.open(url, "_blank", "noopener,noreferrer");
    uiOut("genOut", `✅ Preview aberto: ${app.slug}`);

    log("ok", "PREVIEW aberto: " + app.slug);

    // evita leak de blob URLs
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
      try { if (w && w.closed) {} } catch {}
    }, 4000);
  }

  async function exportBundleJSON() {
    const { app } = getActiveAppObject();
    if (!app) {
      uiOut("genOut", "⚠️ Sem app ativo. Crie um app e selecione.");
      return;
    }

    const payload = {
      meta: {
        kind: "rcf-app-bundle",
        slug: app.slug,
        name: app.name,
        createdAt: new Date().toISOString()
      },
      files: normalizeFiles(app)
    };

    const txt = JSON.stringify(payload, null, 2);

    // tenta copiar (iOS pode bloquear, então tem fallback)
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(txt);
        copied = true;
      }
    } catch {}

    if (copied) {
      uiOut("genOut", "✅ Bundle exportado e copiado (clipboard).");
    } else {
      // fallback: deixa o JSON no genOut pra copiar manual
      uiOut("genOut", txt);
      log("warn", "Clipboard bloqueado no iOS — JSON enviado para genOut (copie manual).");
    }

    log("ok", "EXPORT bundle: " + app.slug);
  }

  // ---------- bind ----------
  function init() {
    const btnPreview = $("btnGenPreview");
    const btnExport  = $("btnGenZip"); // reaproveitado

    bindTap(btnPreview, doPreview);
    bindTap(btnExport, exportBundleJSON);

    try {
      if (btnExport) btnExport.textContent = "Export Build (bundle)";
      if (btnPreview) btnPreview.textContent = "Preview App";
    } catch {}

    log("ok", "PREVIEW_RUNNER v1.1 carregado ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.RCF_PREVIEW_RUNNER = { __v11: true };
})();

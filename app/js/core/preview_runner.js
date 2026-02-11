/* =========================================================
  RControl Factory — js/core/preview_runner.js (v1.0)
  - Preview instantâneo do app-filho (abre nova aba)
  - Exporta bundle/build (JSON) do app ativo
  - NÃO depende do publish/API (só runtime local)
  - iOS safe click (touchend + click, capture)
========================================================= */

(function () {
  "use strict";

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
        log("PREVIEW err:", err?.message || String(err));
        uiOut("genOut", "❌ Erro: " + (err?.message || String(err)));
      }
    };

    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  function log(...a) {
    try {
      if (window.RCF && typeof window.RCF.log === "function") window.RCF.log(...a);
      else if (window.Logger && typeof window.Logger.write === "function") window.Logger.write(...a);
      else console.log("[RCF PREVIEW]", ...a);
    } catch {}
  }

  function uiOut(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text ?? "");
  }

  // ---------- Leitura robusta do app ativo ----------
  // Tenta:
  // 1) window.RCF.state (se existir)
  // 2) localStorage rcf:apps + rcf:active (prefixo rcf:)
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
    // garante strings
    const out = {};
    for (const k of Object.keys(files)) out[k] = String(files[k] ?? "");
    return out;
  }

  // ---------- Build HTML do Preview ----------
  function buildPreviewHTML(app) {
    const files = normalizeFiles(app);

    // tenta achar index.html
    const html = files["index.html"] || files["/index.html"] || "";

    // CSS e JS padrões
    const css = files["styles.css"] || files["/styles.css"] || "";
    const js = files["app.js"] || files["/app.js"] || "";

    // Se tiver index.html próprio, a gente injeta o CSS/JS nele (para funcionar offline).
    // Se não tiver, cria um index mínimo.
    let outHtml = html.trim();
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

    // injeta CSS no </head> (ou no topo)
    if (css) {
      if (outHtml.includes("</head>")) {
        outHtml = outHtml.replace("</head>", `<style>${css}</style>\n</head>`);
      } else {
        outHtml = `<style>${css}</style>\n` + outHtml;
      }
    }

    // injeta JS antes do </body> (ou no fim)
    if (js) {
      if (outHtml.includes("</body>")) {
        outHtml = outHtml.replace("</body>", `<script>${js}<\/script>\n</body>`);
      } else {
        outHtml = outHtml + `\n<script>${js}<\/script>\n`;
      }
    }

    // remove refs externos típicos (se o user colocou <script src="app.js"> etc)
    outHtml = outHtml
      .replace(/<script\s+[^>]*src=["']app\.js["'][^>]*>\s*<\/script>/gi, "")
      .replace(/<link\s+[^>]*href=["']styles\.css["'][^>]*>/gi, "");

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

    // abre em nova aba
    window.open(url, "_blank", "noopener,noreferrer");
    uiOut("genOut", `✅ Preview aberto: ${app.slug}`);
    log("PREVIEW aberto:", app.slug);
  }

  function exportBundleJSON() {
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

    // tenta copiar
    try {
      navigator.clipboard.writeText(txt);
      uiOut("genOut", "✅ Bundle exportado e copiado (clipboard).");
    } catch {
      uiOut("genOut", "✅ Bundle exportado (não consegui copiar automático). Cole manualmente do console/logs.");
    }

    log("EXPORT bundle:", app.slug);
  }

  // ---------- bind ----------
  function init() {
    // usa seus botões existentes:
    // - btnGenPreview (Preview)
    // - btnGenZip (vamos reaproveitar como Export Bundle por enquanto)
    const btnPreview = $("btnGenPreview");
    const btnExport = $("btnGenZip");

    bindTap(btnPreview, doPreview);
    bindTap(btnExport, exportBundleJSON);

    // melhora texto do botão, sem quebrar layout
    try {
      if (btnExport) btnExport.textContent = "Export Build (bundle)";
      if (btnPreview) btnPreview.textContent = "Preview App";
    } catch {}

    log("PREVIEW_RUNNER v1.0 carregado ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

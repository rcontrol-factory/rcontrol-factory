/* FILE: /app/js/engine/builder.js
   RControl Factory — /app/js/engine/builder.js — v1.0 SAFE
   Objetivo:
   - Construir ZIP a partir de RCF_TEMPLATE_REGISTRY
   - Depende de window.JSZip (via seu vendor_loader + CDN/cache)
   - Exponibiliza: window.RCF_BUILDER.buildZip() + downloadBlob()
*/
(() => {
  "use strict";

  if (window.RCF_BUILDER && window.RCF_BUILDER.__v10) return;

  function safeText(v) { return (v === undefined || v === null) ? "" : String(v); }

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF_BUILDER]", level, msg); } catch {}
  }

  function requireJSZip() {
    const Z = window.JSZip;
    if (!Z) throw new Error("JSZip ausente (window.JSZip). Verifique /app/vendor/jszip.min.js e internet 1x.");
    return Z;
  }

  function getRegistry() {
    const R = window.RCF_TEMPLATE_REGISTRY;
    if (!R || typeof R.get !== "function") throw new Error("RCF_TEMPLATE_REGISTRY ausente (template_registry.js).");
    return R;
  }

  function normalizeFilesMap(filesMap) {
    const out = {};
    const keys = Object.keys(filesMap || {});
    for (const k of keys) {
      const key = String(k || "").replace(/^\/+/, "");
      let val = filesMap[k];
      if (val === undefined || val === null) val = "";
      // garante string (por enquanto)
      out[key] = (typeof val === "string") ? val : safeText(val);
    }
    return out;
  }

  function safeFilename(name) {
    const base = String(name || "app").trim().replace(/[^\w\-]+/g, "_");
    return (base || "app") + ".zip";
  }

  async function buildZip(opts) {
    const o = opts || {};
    const templateId = String(o.templateId || "pwa-base");
    const spec = o.spec || {};
    const filename = safeFilename(o.filename || (spec && spec.name ? spec.name : templateId));

    const Z = requireJSZip();
    const R = getRegistry();

    const tpl = R.get(templateId);
    if (!tpl || typeof tpl.files !== "function") throw new Error("Template inválido: " + templateId);

    const filesRaw = tpl.files(spec);
    const files = normalizeFilesMap(filesRaw);

    const zip = new Z();

    const fileKeys = Object.keys(files);
    if (!fileKeys.length) throw new Error("Template retornou 0 arquivos: " + templateId);

    for (const path of fileKeys) {
      zip.file(path, files[path]);
    }

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    const bytes = (blob && blob.size) ? blob.size : 0;

    log("OK", "buildZip ok ✅ tpl=" + templateId + " files=" + fileKeys.length + " bytes=" + bytes);

    return {
      ok: true,
      templateId,
      filename,
      filesCount: fileKeys.length,
      bytes,
      blob
    };
  }

  function downloadBlob(blob, filename) {
    if (!blob) throw new Error("downloadBlob: blob ausente");
    const name = safeFilename(filename || "app.zip");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    a.click();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 2500);
    return { ok: true, filename: name };
  }

  function buildPreviewHTML(templateId, spec) {
    const R = getRegistry();
    const tpl = R.get(String(templateId || "pwa-base"));
    if (!tpl || typeof tpl.files !== "function") throw new Error("Template inválido: " + templateId);
    const files = normalizeFilesMap(tpl.files(spec || {}));
    const html = files["index.html"] || files["/index.html"] || "";
    if (!html) throw new Error("Preview: index.html não existe no template " + templateId);
    return html;
  }

  window.RCF_BUILDER = {
    __v10: true,
    buildZip,
    downloadBlob,
    buildPreviewHTML
  };

  log("OK", "builder.js ready ✅ (v1.0)");
})();

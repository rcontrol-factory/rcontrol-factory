/* FILE: /app/js/engine/builder.js
   RControl Factory — /app/js/engine/builder.js — v1.0 SAFE
   Builder: gera ZIP de app-filho a partir do TemplateRegistry (window.RCF_TEMPLATE_REGISTRY)
   - iPhone-safe (yield)
   - Nunca quebra o boot
   - Exposição: window.RCF_BUILDER.buildZip({ templateId, spec, zipName })
*/

(function () {
  "use strict";

  if (window.RCF_BUILDER && window.RCF_BUILDER.__v10) return;

  const log = (level, msg) => {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF_BUILDER]", level, msg); } catch {}
  };

  const sleep0 = () => new Promise(r => setTimeout(r, 0));

  function safeName(s, fb) {
    const x = String(s || "").trim();
    return x ? x : (fb || "app");
  }

  async function ensureJSZip() {
    try {
      if (window.JSZip && typeof window.JSZip === "function") return true;

      // tenta via vendor_loader, se existir
      if (window.RCF_VENDOR?.ensureJSZip) {
        await window.RCF_VENDOR.ensureJSZip();
        if (window.JSZip && typeof window.JSZip === "function") return true;
      }

      // fallback CDN (uma vez)
      const cdn = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      log("INFO", "JSZip ausente. Tentando CDN… " + cdn);

      const res = await fetch(cdn, { cache: "no-store" });
      if (!res.ok) throw new Error("CDN HTTP " + res.status);
      const code = await res.text();
      if (!code || code.length < 5000) throw new Error("CDN code inválido");

      // injeta script (não usar src pra evitar CORS/cache estranho)
      const s = document.createElement("script");
      s.textContent = code;
      document.head.appendChild(s);

      if (window.JSZip && typeof window.JSZip === "function") {
        log("OK", "JSZip carregado via CDN ✅");
        return true;
      }

      throw new Error("JSZip não exposto após injeção");
    } catch (e) {
      log("ERR", "ensureJSZip fail: " + (e?.message || e));
      return false;
    }
  }

  function getRegistry() {
    return window.RCF_TEMPLATE_REGISTRY || window.RCF_TEMPLATES || null;
  }

  function toUint8Array(str) {
    // UTF-8
    const enc = new TextEncoder();
    return enc.encode(String(str ?? ""));
  }

  async function buildZip(opts) {
    const templateId = String(opts?.templateId || "pwa-base");
    const spec = opts?.spec || {};
    const zipName = safeName(opts?.zipName, templateId) + ".zip";

    const okZip = await ensureJSZip();
    if (!okZip) return { ok: false, err: "jszip_missing" };

    const reg = getRegistry();
    if (!reg || typeof reg.get !== "function") {
      log("ERR", "TemplateRegistry ausente (window.RCF_TEMPLATE_REGISTRY.get)");
      return { ok: false, err: "registry_missing" };
    }

    const tpl = reg.get(templateId);
    if (!tpl || typeof tpl.files !== "function") {
      log("ERR", "Template inválido: " + templateId);
      return { ok: false, err: "template_invalid" };
    }

    let files = null;
    try {
      files = tpl.files(spec) || {};
    } catch (e) {
      log("ERR", "tpl.files() falhou: " + (e?.message || e));
      return { ok: false, err: "tpl_files_fail" };
    }

    const JSZip = window.JSZip;
    const zip = new JSZip();

    const keys = Object.keys(files);
    if (!keys.length) return { ok: false, err: "no_files" };

    for (let i = 0; i < keys.length; i++) {
      const path = String(keys[i] || "").replace(/^\/+/, "");
      const val = files[keys[i]];

      // se for objeto {bin:Uint8Array} ou string
      if (val && typeof val === "object" && val.bin && val.bin instanceof Uint8Array) {
        zip.file(path, val.bin);
      } else {
        zip.file(path, toUint8Array(String(val ?? "")));
      }

      if ((i % 12) === 0) await sleep0(); // iPhone safe yield
    }

    let blob = null;
    try {
      blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    } catch (e) {
      log("ERR", "zip.generateAsync falhou: " + (e?.message || e));
      return { ok: false, err: "zip_generate_fail" };
    }

    // dispara download no browser
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      a.rel = "noopener";
      a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 2500);
    } catch (e) {
      // mesmo se download falhar, devolve blob
      log("WARN", "download falhou, mas blob ok: " + (e?.message || e));
    }

    log("OK", `buildZip ok ✅ template=${templateId} files=${keys.length}`);
    return { ok: true, name: zipName, files: keys.length, blob };
  }

  // API pública
  window.RCF_BUILDER = {
    __v10: true,
    buildZip,
    ensureJSZip
  };

  log("OK", "builder.js ready ✅ (v1.0)");
})();

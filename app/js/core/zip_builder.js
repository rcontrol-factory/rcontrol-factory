/* FILE: /app/js/core/zip_builder.js
   RControl Factory — core/zip_builder.js — v1.0 SAFE
   OBJETIVO:
   - Gerar ZIP do app ativo (State/apps em localStorage rcf:apps)
   - Suporta arquivos:
     - texto (string normal)
     - binário (DataURL: data:mime;base64,....)  -> converte para Uint8Array
   - JSZip loader robusto (local paths + CDN fallback, rejeita HTML)
   - UI: integra no Generator (slot generator.actions) via RCF:UI_READY
*/

(function () {
  "use strict";

  if (window.RCF_ZIP_BUILDER && window.RCF_ZIP_BUILDER.__v10) return;

  const PREFIX = "rcf:";
  const KEY_APPS = PREFIX + "apps";
  const KEY_ACTIVE = PREFIX + "active";

  const $ = (sel, root = document) => root.querySelector(sel);

  const safeJsonParse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF_ZIP_BUILDER]", level, msg); } catch {}
  }

  function looksLikeHTML(txt) {
    const s = String(txt || "").trim().slice(0, 260).toLowerCase();
    return (
      s.startsWith("<!doctype") ||
      s.startsWith("<html") ||
      s.includes("<head") ||
      s.includes("<body") ||
      s.includes("rcontrol factory")
    );
  }

  function injectInlineScript(code, tag) {
    try {
      const s = document.createElement("script");
      s.setAttribute("data-rcf", tag || "inline");
      s.textContent = String(code || "");
      document.head.appendChild(s);
      return true;
    } catch (e) {
      log("ERR", "inject falhou: " + (e?.message || e));
      return false;
    }
  }

  function loadScriptSrc(src, timeoutMs) {
    return new Promise((resolve) => {
      try {
        const s = document.createElement("script");
        s.async = true;
        s.src = src;
        s.crossOrigin = "anonymous";

        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          try { s.remove(); } catch {}
          resolve(!!ok);
        };

        const t = setTimeout(() => finish(false), timeoutMs || 9000);
        s.onload = () => { clearTimeout(t); finish(true); };
        s.onerror = () => { clearTimeout(t); finish(false); };

        document.head.appendChild(s);
      } catch {
        resolve(false);
      }
    });
  }

  async function ensureJSZip() {
    if (window.JSZip) return true;

    // tenta reaproveitar o loader do zip_vault (se existir)
    // (não depende, só aproveita se já tiver JSZip)
    if (window.JSZip) return true;

    const candidates = [
      "/app/vendor/jszip.min.js",
      "/vendor/jszip.min.js",
      "/js/vendor/jszip.min.js",
      "/app/js/vendor/jszip.min.js"
    ];

    for (const src of candidates) {
      try {
        const res = await fetch(src, { cache: "no-store" });
        if (!res.ok) continue;

        const ct = String(res.headers.get("content-type") || "").toLowerCase();
        const code = await res.text();

        if (!code || code.length < 2000) continue;
        if (ct.includes("text/html") || looksLikeHTML(code)) {
          log("WARN", "JSZip fetch retornou HTML (não vou injetar): " + src);
          continue;
        }

        const ok = injectInlineScript(code, "jszip:" + src);
        if (ok && window.JSZip) {
          log("OK", "JSZip carregado via " + src);
          return true;
        }
      } catch {}
    }

    const cdnList = [
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"
    ];

    for (const url of cdnList) {
      try {
        log("INFO", "Tentando JSZip via CDN… " + url);
        const ok = await loadScriptSrc(url, 9000);
        if (ok && window.JSZip) {
          log("OK", "JSZip carregado via CDN ✅");
          return true;
        }
      } catch {}
    }

    log("ERR", "JSZip ausente. Garanta internet 1x (CDN) ou arquivo local em /app/vendor/jszip.min.js.");
    return false;
  }

  function getApps() {
    return safeJsonParse(localStorage.getItem(KEY_APPS) || "[]", []);
  }

  function getActiveSlug() {
    const a = safeJsonParse(localStorage.getItem(KEY_ACTIVE) || "{}", {});
    return String(a?.appSlug || "").trim() || "";
  }

  function mimeByPath(p) {
    const s = String(p || "").toLowerCase();
    if (s.endsWith(".pdf")) return "application/pdf";
    if (s.endsWith(".png")) return "image/png";
    if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
    if (s.endsWith(".webp")) return "image/webp";
    if (s.endsWith(".svg")) return "image/svg+xml";
    if (s.endsWith(".json")) return "application/json";
    if (s.endsWith(".css")) return "text/css";
    if (s.endsWith(".html") || s.endsWith(".htm")) return "text/html";
    if (s.endsWith(".js")) return "text/javascript";
    if (s.endsWith(".txt") || s.endsWith(".md")) return "text/plain";
    return "application/octet-stream";
  }

  function isDataURL(s) {
    const t = String(s || "");
    return t.startsWith("data:") && t.includes(";base64,");
  }

  function dataURLToU8(dataUrl) {
    const s = String(dataUrl || "");
    const i = s.indexOf(";base64,");
    if (i < 0) return { ok: false, mime: "", u8: new Uint8Array() };

    const mime = s.slice(5, i) || "";
    const b64 = s.slice(i + 8) || "";

    try {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
      return { ok: true, mime, u8 };
    } catch {
      return { ok: false, mime, u8: new Uint8Array() };
    }
  }

  async function buildZipFromFiles(filesObj, zipName) {
    const okZip = await ensureJSZip();
    if (!okZip) throw new Error("JSZip não carregou.");

    const zip = new window.JSZip();

    const files = filesObj && typeof filesObj === "object" ? filesObj : {};
    const paths = Object.keys(files).sort();

    let countText = 0, countBin = 0, bytes = 0;

    for (const path of paths) {
      const val = files[path];

      if (typeof val === "string" && isDataURL(val)) {
        const d = dataURLToU8(val);
        const u8 = d.u8 || new Uint8Array();
        bytes += u8.byteLength || 0;
        zip.file(path, u8, { binary: true });
        countBin++;
      } else {
        const txt = (val == null) ? "" : String(val);
        bytes += txt.length;
        zip.file(path, txt);
        countText++;
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const name = String(zipName || "app.zip").trim() || "app.zip";
    return { ok: true, blob, name, meta: { countText, countBin, total: countText + countBin, bytes } };
  }

  function downloadBlob(blob, filename) {
    const name = String(filename || "app.zip").trim() || "app.zip";

    try {
      // iOS / share (quando disponível)
      if (navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: "application/zip" })] })) {
        return navigator.share({
          files: [new File([blob], name, { type: "application/zip" })],
          title: name
        });
      }
    } catch {}

    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { a.remove(); } catch {}
        try { URL.revokeObjectURL(url); } catch {}
      }, 1200);
      return Promise.resolve(true);
    } catch (e) {
      log("ERR", "downloadBlob falhou: " + (e?.message || e));
      return Promise.resolve(false);
    }
  }

  function getAppBySlug(slug) {
    const s = String(slug || "").trim();
    if (!s) return null;
    const apps = getApps();
    return apps.find(a => String(a.slug) === s) || null;
  }

  async function buildBySlug(slug) {
    const app = getAppBySlug(slug);
    if (!app) return { ok: false, err: "App não encontrado: " + slug };

    const files = app.files || {};
    const zipName = (String(app.slug || "app") + ".zip").replace(/[^a-z0-9._-]+/gi, "-");
    const r = await buildZipFromFiles(files, zipName);
    return { ok: true, app, blob: r.blob, name: r.name, meta: r.meta };
  }

  async function buildActive() {
    const slug = getActiveSlug();
    if (!slug) return { ok: false, err: "Sem app ativo (rcf:active.appSlug vazio)." };
    return buildBySlug(slug);
  }

  // =========================================================
  // UI no Generator (slot generator.actions)
  // =========================================================
  function getSlotEl() {
    try {
      const ui = window.RCF_UI;
      if (ui && typeof ui.getSlot === "function") {
        const s = ui.getSlot("generator.actions");
        if (s) return s;
      }
    } catch {}
    return document.getElementById("rcfGenSlotActions") || document.querySelector('[data-rcf-slot="generator.actions"]') || null;
  }

  function mountUI() {
    const slot = getSlotEl();
    if (!slot) return false;

    if (document.getElementById("rcfZipBuilderCard")) return true;

    const wrap = document.createElement("div");
    wrap.id = "rcfZipBuilderCard";
    wrap.className = "card";
    wrap.style.marginTop = "12px";
    wrap.innerHTML = `
      <h2 style="margin-top:0">ZIP Builder</h2>
      <div class="hint">Gera o ZIP do app ativo (suporta binários DataURL).</div>

      <div class="row" style="flex-wrap:wrap;align-items:center;margin-top:10px">
        <button class="btn ok" id="rcfZipBuilderBtnBuild" type="button">Build ZIP (ativo)</button>
        <button class="btn ghost" id="rcfZipBuilderBtnInfo" type="button">Info</button>
      </div>

      <pre class="mono small" id="rcfZipBuilderOut" style="margin-top:10px">Pronto.</pre>
    `;

    // coloca abaixo dos botões existentes do generator.actions
    slot.appendChild(wrap);

    const out = $("#rcfZipBuilderOut");
    const setOut = (t) => { try { if (out) out.textContent = String(t ?? ""); } catch {} };

    const btnBuild = $("#rcfZipBuilderBtnBuild");
    const btnInfo = $("#rcfZipBuilderBtnInfo");

    if (btnBuild && !btnBuild.__bound) {
      btnBuild.__bound = true;
      btnBuild.addEventListener("click", async () => {
        try {
          setOut("Buildando ZIP…");
          const r = await buildActive();
          if (!r.ok) return setOut("❌ " + (r.err || "falhou"));

          setOut(`✅ ZIP pronto\nslug=${r.app.slug}\nfiles=${r.meta.total} (text=${r.meta.countText} bin=${r.meta.countBin})\nbytes≈${r.meta.bytes}`);
          await downloadBlob(r.blob, r.name);
          try { window.RCF_LOGGER?.push?.("OK", `ZIP build ✅ ${r.app.slug} files=${r.meta.total}`); } catch {}
        } catch (e) {
          setOut("❌ Erro: " + (e?.message || e));
        }
      }, { passive: true });
    }

    if (btnInfo && !btnInfo.__bound) {
      btnInfo.__bound = true;
      btnInfo.addEventListener("click", () => {
        try {
          const slug = getActiveSlug();
          const app = slug ? getAppBySlug(slug) : null;
          const files = app?.files || {};
          const keys = Object.keys(files);
          const bin = keys.filter(k => isDataURL(files[k])).length;
          const txt = keys.length - bin;
          setOut(
            `INFO\nactive=${slug || "(nenhum)"}\nfiles=${keys.length}\ntext=${txt}\nbin(DataURL)=${bin}\nex:\n` +
            keys.slice(0, 14).map(k => "- " + k).join("\n") +
            (keys.length > 14 ? "\n...(mais)" : "")
          );
        } catch (e) {
          setOut("❌ info erro: " + (e?.message || e));
        }
      }, { passive: true });
    }

    setOut("Pronto. Selecione um app e clique Build ZIP.");
    return true;
  }

  function mountLoop() {
    const ok = mountUI();
    if (ok) return;
    setTimeout(() => { try { mountUI(); } catch {} }, 700);
    setTimeout(() => { try { mountUI(); } catch {} }, 1700);
  }

  // =========================================================
  // API pública
  // =========================================================
  window.RCF_ZIP_BUILDER = {
    __v10: true,
    ensureJSZip,
    buildZipFromFiles,
    buildBySlug,
    buildActive,
    downloadBlob,
    mountUI: () => mountUI()
  };

  // auto-mount via UI READY BUS
  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { mountLoop(); } catch {}
    });
  } catch {}

  // fallback
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { try { mountLoop(); } catch {} }, { once: true });
  } else {
    mountLoop();
  }

  log("OK", "zip_builder.js ready ✅ (v1.0)");
})();

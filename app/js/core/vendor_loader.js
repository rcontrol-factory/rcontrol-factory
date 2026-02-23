/* FILE: /app/js/core/vendor_loader.js
   RControl Factory — vendor_loader.js — v1.2 SAFE
   - Mantém compat com boot atual
   - ✅ Auto-load de módulos extras via localStorage: rcf:boot:extra_modules (array)
   - ✅ Default SAFE: tenta carregar ./js/core/agent_runtime.js (se existir) sem quebrar tela
   - ✅ Default SAFE: tenta carregar ./js/core/doctor_scan.js (se existir) sem quebrar tela
*/

(() => {
  "use strict";

  // compat: se v1.2 já está ativo, sai
  if (window.__RCF_VENDOR_LOADER_V12__) return;
  window.__RCF_VENDOR_LOADER_V12__ = true;

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[VENDOR]", lvl, msg); } catch {}
  };

  function safeParse(raw, fb){
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  // loader genérico (não quebra se falhar)
  async function loadScript(src){
    return new Promise((resolve) => {
      try {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve({ ok:true, src });
        s.onerror = () => resolve({ ok:false, src, err:"load_fail" });
        document.head.appendChild(s);
      } catch (e) {
        resolve({ ok:false, src, err:String(e?.message || e) });
      }
    });
  }

  // tenta resolver base URL do app (pra não errar path)
  function basePrefix(){
    // você já usa ./js/... no boot, então mantém padrão "./"
    return "./";
  }

  function normModulePath(p){
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.replace(/\\/g, "/");
    x = x.replace(/^(\.\/)+/, "");
    x = x.replace(/^\/+/, "");
    return x;
  }

  async function loadExtraModules(){
    const base = basePrefix();

    // 1) user-defined extras
    const extras = safeParse(localStorage.getItem("rcf:boot:extra_modules") || "[]", []);
    const list = Array.isArray(extras) ? extras.map(normModulePath).filter(Boolean) : [];

    // 2) default SAFE: agent_runtime
    if (!list.includes("js/core/agent_runtime.js") && !list.includes("app/js/core/agent_runtime.js")) {
      list.unshift("js/core/agent_runtime.js");
    }

    // 3) default SAFE: doctor_scan
    if (!list.includes("js/core/doctor_scan.js") && !list.includes("app/js/core/doctor_scan.js")) {
      list.unshift("js/core/doctor_scan.js");
    }

    // evita spam: marca tentados
    const triedKey = "rcf:boot:extra_tried";
    const tried = safeParse(localStorage.getItem(triedKey) || "{}", {}) || {};
    const now = Date.now();

    let loaded = 0;
    for (const p of list) {
      const src = base + p + (p.includes("?") ? "" : ("?cb=" + now));
      if (tried[src]) continue; // já tentou nesta sessão persistida

      tried[src] = now;
      const r = await loadScript(src);

      if (r.ok) {
        loaded++;
        log("OK", "BOOT: extra module loaded ✅ " + src);
      } else {
        // não loga como erro pesado, pra não assustar nem quebrar
        log("INFO", "BOOT: extra module missing/skip " + src);
      }
    }

    try { localStorage.setItem(triedKey, JSON.stringify(tried)); } catch {}
    return { ok:true, loaded };
  }

  // expõe helper (se quiser usar no futuro)
  window.RCF_VENDOR_LOADER = window.RCF_VENDOR_LOADER || {};
  window.RCF_VENDOR_LOADER.__v12 = true;
  window.RCF_VENDOR_LOADER.loadExtraModules = loadExtraModules;

  // roda depois do core subir (não interfere na ordem do boot)
  const run = () => {
    loadExtraModules().then(() => {
      log("OK", "vendor_loader.js pronto ✅ (v1.2)");
    }).catch(() => {
      log("OK", "vendor_loader.js pronto ✅ (v1.2)");
    });
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", run, { once:true });
  } else {
    run();
  }
})();

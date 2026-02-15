/* RControl Factory — /app/js/core/patchset.js (PADRÃO GLOBAL) — v1.0b
   PATCHSET (iOS safe):
   - SEM export/import (funciona em <script> normal)
   - sem structuredClone
   - fallback de crypto.randomUUID
   - expõe API em window.RCF_PATCHSET { makePatch, applyPatch }
*/

(function () {
  "use strict";

  // evita instalar 2x
  if (window.RCF_PATCHSET && window.RCF_PATCHSET.__v10b) return;

  function safeUUID() {
    try {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
    } catch {}
    return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function safeCloneApp(app) {
    const a = app || {};
    const files = (a.files && typeof a.files === "object") ? a.files : {};
    return {
      ...a,
      files: { ...files },
    };
  }

  function makePatch(opts) {
    const title = String(opts?.title || "").trim() || "patch";
    const changes = Array.isArray(opts?.changes) ? opts.changes : [];
    return {
      id: safeUUID(),
      title,
      createdAt: new Date().toISOString(),
      changes,
    };
  }

  function applyPatch(app, patch) {
    const next = safeCloneApp(app);

    const list = Array.isArray(patch?.changes) ? patch.changes : [];
    for (const ch of list) {
      const file = String(ch?.file || "").trim();
      if (!file) continue;

      const cur = next.files[file] ?? "";

      // segurança: se before foi informado, exige match
      if (typeof ch.before === "string" && ch.before !== cur) {
        throw new Error(`Patch mismatch em ${file} (conteúdo mudou)`);
      }

      next.files[file] = String(ch?.after ?? "");
    }

    return next;
  }

  window.RCF_PATCHSET = {
    __v10b: true,
    makePatch,
    applyPatch,
  };

  try { window.RCF_LOGGER?.push?.("ok", "OK: patchset.js ready ✅ (GLOBAL v1.0b)"); } catch {}
})();

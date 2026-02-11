/* =========================================================
  RControl Factory — core/thompson.js (FULL)
  THOMPSON = Guardião / Policy Gate do Self-Update (Mãe)

  Modos:
   - SAFE (condicional): só permite override em arquivos "seguros"
   - UNLOCK (livre): permite qualquer arquivo (ainda valida estrutura)

  Exposto em:
   window.RCF_THOMPSON.validateBundle(bundle, { mode })

  Bundle esperado:
   {
     meta?: { name, version, createdAt, note? },
     files: { "/js/core/ui_bindings.js": "...", ... }
   }

========================================================= */
(function () {
  "use strict";

  const nowISO = () => new Date().toISOString();

  function log(msg, obj) {
    try {
      if (window.RCF && typeof window.RCF.log === "function") {
        window.RCF.log(msg, obj || "");
      } else {
        console.log("[THOMPSON]", msg, obj || "");
      }
    } catch {}
  }

  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }

  function normalizePath(p) {
    let s = String(p || "").trim();
    if (!s) return "";
    // força começar com /
    if (!s.startsWith("/")) s = "/" + s;
    // remove // duplicado
    s = s.replace(/\/{2,}/g, "/");
    return s;
  }

  function applyMacros(content) {
    const s = String(content ?? "");
    return s.replace(/\{\{DATE\}\}/g, nowISO());
  }

  // ✅ allowlist SAFE: mexer só no que não “mata” a Factory
  // (você pode ajustar depois, mas isso já evita BO pesado)
  const SAFE_ALLOW_PREFIXES = [
    "/js/core/ui_",              // ui_safety.js, ui_bindings.js, ui_gear etc
    "/js/core/mother_",          // mother_selfupdate.js
    "/js/core/vfs_",             // vfs_overrides.js
    "/js/core/logger.js",        // logs
    "/js/admin.js",              // camada admin fora do core
    "/styles.css",               // visual
    "/privacy.html",
    "/terms.html"
  ];

  // ❌ bloqueados no SAFE
  const SAFE_BLOCK_PREFIXES = [
    "/sw.js",
    "/manifest.json",
    "/index.html",
    "/app.js",                   // o cérebro principal
    "/js/app.js",
    "/js/core/storage.js",
    "/js/core/patch.js",
    "/js/core/patchset.js",
    "/js/core/commands.js",
    "/js/core/selfheal.js",
    "/js/core/autofix.js",
    "/js/core/policy.js",
    "/js/core/risk.js",
    "/js/core/diagnostics.js",
  ];

  function startsWithAny(path, list) {
    return list.some((p) => {
      if (p.endsWith("/")) return path.startsWith(p);
      return path === p || path.startsWith(p + "/") || path.startsWith(p);
    });
  }

  function allowedInSafe(path) {
    if (startsWithAny(path, SAFE_BLOCK_PREFIXES)) return false;
    // precisa bater allowlist (por prefixo) OU ser exatamente um arquivo allow explícito
    return startsWithAny(path, SAFE_ALLOW_PREFIXES);
  }

  function summarize(bundle) {
    const meta = bundle.meta || {};
    const files = bundle.files || {};
    const keys = Object.keys(files);
    return {
      name: meta.name || "-",
      version: meta.version || "-",
      createdAt: meta.createdAt || "-",
      files: keys.length
    };
  }

  function validateStructure(bundle) {
    if (!isObj(bundle)) return { ok: false, err: "Bundle não é objeto" };
    if (!isObj(bundle.files)) return { ok: false, err: "Bundle sem 'files' (objeto)" };
    const keys = Object.keys(bundle.files);
    if (!keys.length) return { ok: false, err: "Bundle 'files' está vazio" };

    // valida chaves + valores
    for (const k of keys) {
      const p = normalizePath(k);
      if (!p) return { ok: false, err: "Caminho vazio em files" };
      const v = bundle.files[k];
      if (typeof v !== "string") return { ok: false, err: `Conteúdo não-string em ${k}` };
    }
    return { ok: true };
  }

  function validateBundle(bundle, opts = {}) {
    const mode = String(opts.mode || "safe").toLowerCase(); // safe | unlock
    const s = validateStructure(bundle);
    if (!s.ok) return { ok: false, mode, reason: s.err, allowed: [], blocked: [], dryRun: [] };

    const filesIn = bundle.files;
    const allowed = [];
    const blocked = [];
    const dryRun = [];

    for (const rawPath of Object.keys(filesIn)) {
      const path = normalizePath(rawPath);

      // normaliza e troca macro
      const content = applyMacros(filesIn[rawPath]);

      const rec = { path, bytes: content.length };

      if (mode === "unlock") {
        allowed.push(path);
        dryRun.push(rec);
        continue;
      }

      // SAFE
      if (allowedInSafe(path)) {
        allowed.push(path);
        dryRun.push(rec);
      } else {
        blocked.push(path);
      }
    }

    if (mode !== "unlock" && blocked.length) {
      return {
        ok: false,
        mode,
        reason: "SAFE bloqueou arquivos críticos ou fora da allowlist",
        allowed,
        blocked,
        dryRun
      };
    }

    return { ok: true, mode, reason: "OK", allowed, blocked, dryRun };
  }

  // API pública
  window.RCF_THOMPSON = window.RCF_THOMPSON || {};
  window.RCF_THOMPSON.validateBundle = validateBundle;
  window.RCF_THOMPSON._summarize = summarize;

  log("THOMPSON v2 ✅ pronto (safe/unlock)");

})();

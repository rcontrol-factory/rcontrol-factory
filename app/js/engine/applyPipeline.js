/* FILE: /app/js/engine/applyPipeline.js
   RControl Factory — APPLY PIPELINE
   v1.1 SAFE APPLY + FACTORY/APP ROUTING

   Objetivo:
   - manter snapshot + rollback
   - manter gate + micro-tests
   - aplicar patch em app ativo OU em arquivo real da Factory
   - usar RCF_OVERRIDES_VFS para arquivos da Factory
   - evitar overwrite silencioso quando pedido
   - funcionar como script clássico
*/

(() => {
  "use strict";

  if (window.RCF_APPLY_PIPELINE && window.RCF_APPLY_PIPELINE.__v11) return;

  const VERSION = "v1.1";

  function log(...a) {
    try {
      window.RCF_LOGGER?.push?.("LOG", "[APPLY_PIPELINE] " + a.map(x => {
        try { return typeof x === "string" ? x : JSON.stringify(x); }
        catch { return String(x); }
      }).join(" "));
    } catch {}
    try { console.log("[APPLY_PIPELINE]", ...a); } catch {}
  }

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch { return obj || null; }
  }

  function nowISO() {
    try { return new Date().toISOString(); }
    catch { return ""; }
  }

  function normalizePath(path) {
    let p = String(path || "").trim();
    if (!p) return "";

    p = p.replace(/\\/g, "/");
    p = p.split("#")[0].split("?")[0].trim();

    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    return p;
  }

  function isFactoryPath(path) {
    const p = normalizePath(path);
    if (!p) return false;

    return (
      p === "/app.js" ||
      p === "/index.html" ||
      p === "/manifest.json" ||
      p.startsWith("/app/") ||
      p.startsWith("/functions/") ||
      p.startsWith("/js/") ||
      p.startsWith("/css/") ||
      p.startsWith("/assets/")
    );
  }

  function isAppFilePath(path) {
    const p = normalizePath(path);
    if (!p) return false;
    return !isFactoryPath(p);
  }

  function toAppFileKey(path) {
    return String(normalizePath(path) || "").replace(/^\//, "");
  }

  function snapshotApps() {
    const snap = {};
    try {
      Object.keys(localStorage).forEach((k) => {
        if (String(k || "").startsWith("rcf:")) {
          snap[k] = localStorage.getItem(k);
        }
      });
    } catch {}
    return snap;
  }

  function restoreSnapshot(snap) {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (String(k || "").startsWith("rcf:")) {
          localStorage.removeItem(k);
        }
      });

      Object.keys(snap || {}).forEach((k) => {
        localStorage.setItem(k, snap[k]);
      });
    } catch {}
  }

  function getAppsState() {
    try { return JSON.parse(localStorage.getItem("rcf:apps") || "[]"); }
    catch { return []; }
  }

  function setAppsState(apps) {
    try { localStorage.setItem("rcf:apps", JSON.stringify(apps || [])); } catch {}
  }

  function getActiveState() {
    try { return JSON.parse(localStorage.getItem("rcf:active") || "{}") || {}; }
    catch { return {}; }
  }

  function getActiveSlug() {
    try { return getActiveState().appSlug || null; }
    catch { return null; }
  }

  function applyAppFileWritePatch(patch) {
    const slug = patch.appSlug || getActiveSlug();
    if (!slug) return { ok: false, msg: "Sem app ativo.", mode: "app" };

    const apps = getAppsState();
    const app = apps.find(a => a && a.slug === slug);
    if (!app) return { ok: false, msg: "App não encontrado.", mode: "app" };

    if (!app.files || typeof app.files !== "object") app.files = {};

    const fileKey = toAppFileKey(patch.targetPath);
    if (!fileKey) return { ok: false, msg: "targetPath inválido.", mode: "app" };

    if (!patch.allowOverwrite && Object.prototype.hasOwnProperty.call(app.files, fileKey)) {
      return { ok: false, msg: "Overwrite bloqueado. Use allowOverwrite.", mode: "app", fileKey };
    }

    app.files[fileKey] = String(patch.newText || "");
    setAppsState(apps);

    try {
      const active = getActiveState();
      if (!active.file) {
        active.file = fileKey;
        localStorage.setItem("rcf:active", JSON.stringify(active));
      }
    } catch {}

    return {
      ok: true,
      msg: `OK write app file ${fileKey}`,
      mode: "app",
      appSlug: slug,
      fileKey
    };
  }

  async function readFactoryFile(path) {
    try {
      const vfs = window.RCF_OVERRIDES_VFS;
      if (vfs && typeof vfs.readFile === "function") {
        return await vfs.readFile(normalizePath(path));
      }
    } catch {}
    return null;
  }

  async function writeFactoryFile(path, text) {
    try {
      const vfs = window.RCF_OVERRIDES_VFS;
      if (vfs && typeof vfs.writeFile === "function") {
        const ok = await vfs.writeFile(normalizePath(path), String(text || ""));
        return !!ok;
      }
    } catch {}
    return false;
  }

  async function applyFactoryFileWritePatch(patch) {
    const targetPath = normalizePath(patch.targetPath);
    if (!targetPath) {
      return { ok: false, msg: "targetPath inválido.", mode: "factory" };
    }

    const existing = await readFactoryFile(targetPath);

    if (!patch.allowOverwrite && existing != null) {
      return {
        ok: false,
        msg: "Overwrite bloqueado. Use allowOverwrite.",
        mode: "factory",
        targetPath
      };
    }

    const ok = await writeFactoryFile(targetPath, String(patch.newText || ""));
    if (!ok) {
      return {
        ok: false,
        msg: "Falha ao escrever no overrides VFS.",
        mode: "factory",
        targetPath
      };
    }

    try { window.RCF_FACTORY_TREE?.register?.(targetPath); } catch {}
    try { window.RCF_MODULE_REGISTRY?.refresh?.(); } catch {}
    try { window.RCF_FACTORY_STATE?.refreshRuntime?.(); } catch {}

    return {
      ok: true,
      msg: `OK write factory file ${targetPath}`,
      mode: "factory",
      targetPath
    };
  }

  async function applyWritePatch(patch) {
    const targetPath = normalizePath(patch && patch.targetPath);
    if (!targetPath) return { ok: false, msg: "targetPath ausente." };

    if (isFactoryPath(targetPath)) {
      return applyFactoryFileWritePatch(patch);
    }

    return applyAppFileWritePatch(patch);
  }

  async function runGate() {
    try {
      let diag = null;

      if (window.RCF_DIAGNOSTICS?.runStabilityCheck) {
        diag = await window.RCF_DIAGNOSTICS.runStabilityCheck();
      } else if (window.RCF_DOCTOR_SCAN?.scan) {
        try {
          diag = await window.RCF_DOCTOR_SCAN.scan();
        } catch {}
      }

      const stableFlag =
        typeof window.RCF_STABLE === "boolean"
          ? window.RCF_STABLE
          : true;

      return {
        ok: stableFlag !== false,
        diag: diag || null
      };
    } catch (e) {
      return {
        ok: false,
        err: e?.message || String(e)
      };
    }
  }

  async function runMicroTests() {
    try {
      if (window.RCF_DIAGNOSTICS?.runMicroTests) {
        return await window.RCF_DIAGNOSTICS.runMicroTests();
      }
      return { ok: true, note: "microtests ausente (skip)" };
    } catch (e) {
      return {
        ok: false,
        err: e?.message || String(e)
      };
    }
  }

  async function applyWithRollback(patch) {
    const safePatch = clone(patch || {}) || {};
    safePatch.targetPath = normalizePath(safePatch.targetPath);

    if (!safePatch.targetPath) {
      return { ok: false, step: "validate", msg: "targetPath ausente." };
    }

    const snap = snapshotApps();
    log("snapshot ok", safePatch.targetPath);

    const gate1 = await runGate();
    if (!gate1.ok) {
      log("gate_pre fail");
      return { ok: false, step: "gate_pre", gate: gate1 };
    }

    const tests1 = await runMicroTests();
    if (tests1 && tests1.ok === false) {
      log("tests_pre fail");
      return { ok: false, step: "tests_pre", tests: tests1 };
    }

    const result = await applyWritePatch(safePatch);
    if (!result.ok) {
      log("apply fail", result.msg || "erro");
      return { ok: false, step: "apply", result };
    }

    const tests2 = await runMicroTests();
    if (tests2 && tests2.ok === false) {
      restoreSnapshot(snap);
      log("tests_post fail -> rollback");
      return {
        ok: false,
        step: "tests_post",
        tests: tests2,
        rolledBack: true,
        result
      };
    }

    const gate2 = await runGate();
    if (!gate2.ok) {
      restoreSnapshot(snap);
      log("gate_post fail -> rollback");
      return {
        ok: false,
        step: "gate_post",
        gate: gate2,
        rolledBack: true,
        result
      };
    }

    log("apply ok", result.mode || "unknown", result.targetPath || result.fileKey || "");
    return {
      ok: true,
      applied: true,
      version: VERSION,
      at: nowISO(),
      result,
      gate2
    };
  }

  window.RCF_APPLY_PIPELINE = {
    __v11: true,
    version: VERSION,
    snapshotApps,
    restoreSnapshot,
    applyWithRollback,
    applyWritePatch,
    isFactoryPath,
    isAppFilePath,
    normalizePath
  };
})();

/* applyPipeline.js — APPLY com snapshot, Gate, micro-tests, rollback */

(() => {
  "use strict";

  function log(...a) {
    try { window.RCF_LOGGER?.push?.("log", a.join(" ")); } catch {}
  }

  function snapshotApps() {
    // snapshot do storage principal (apps/cfg/active/pending etc.)
    const snap = {};
    const keys = Object.keys(localStorage);
    keys.forEach(k => {
      if (k.startsWith("rcf:")) snap[k] = localStorage.getItem(k);
    });
    return snap;
  }

  function restoreSnapshot(snap) {
    try {
      // apaga chaves rcf:
      Object.keys(localStorage).forEach(k => { if (k.startsWith("rcf:")) localStorage.removeItem(k); });
      // restaura
      Object.keys(snap || {}).forEach(k => localStorage.setItem(k, snap[k]));
    } catch {}
  }

  function getAppsState() {
    try { return JSON.parse(localStorage.getItem("rcf:apps") || "[]"); }
    catch { return []; }
  }

  function setAppsState(apps) {
    try { localStorage.setItem("rcf:apps", JSON.stringify(apps || [])); } catch {}
  }

  function getActiveSlug() {
    try { return (JSON.parse(localStorage.getItem("rcf:active") || "{}").appSlug) || null; }
    catch { return null; }
  }

  function toAppFileKey(path) {
    // mapeia /index.html -> index.html
    // mapeia /js/core/x.js -> js/core/x.js
    return String(path || "").replace(/^\//, "");
  }

  function applyFileWritePatch(patch) {
    const slug = patch.appSlug || getActiveSlug();
    if (!slug) return { ok:false, msg:"Sem app ativo." };

    const apps = getAppsState();
    const app = apps.find(a => a.slug === slug);
    if (!app) return { ok:false, msg:"App não encontrado." };

    if (!app.files || typeof app.files !== "object") app.files = {};

    const fileKey = toAppFileKey(patch.targetPath);
    if (!fileKey) return { ok:false, msg:"targetPath inválido." };

    // bloqueio overwrite silencioso
    if (!patch.allowOverwrite && (fileKey in app.files)) {
      return { ok:false, msg:"Overwrite bloqueado. Use unlock/allowOverwrite." };
    }

    app.files[fileKey] = String(patch.newText || "");
    setAppsState(apps);
    return { ok:true, msg:`OK write ${fileKey}` };
  }

  async function runGate() {
    // Gate = Stability check + microtests
    try {
      const stable = !!window.RCF_STABLE;
      // se existir diagnostics, roda
      let diag = null;
      if (window.RCF_DIAGNOSTICS?.runStabilityCheck) {
        diag = await window.RCF_DIAGNOSTICS.runStabilityCheck();
      }
      return { ok: stable !== false, diag };
    } catch (e) {
      return { ok:false, err: e?.message || String(e) };
    }
  }

  async function runMicroTests() {
    try {
      if (window.RCF_DIAGNOSTICS?.runMicroTests) {
        return window.RCF_DIAGNOSTICS.runMicroTests();
      }
      return { ok:true, note:"microtests ausente (skip)" };
    } catch (e) {
      return { ok:false, err:e?.message || String(e) };
    }
  }

  async function applyWithRollback(patch) {
    const snap = snapshotApps();
    log("APPLY: snapshot ok");

    // Gate antes
    const gate1 = await runGate();
    if (!gate1.ok) return { ok:false, step:"gate_pre", gate:gate1 };

    const tests1 = await runMicroTests();
    if (tests1 && tests1.ok === false) return { ok:false, step:"tests_pre", tests:tests1 };

    // aplicar patch
    const r = applyFileWritePatch(patch);
    if (!r.ok) return { ok:false, step:"apply", result:r };

    // Gate depois
    const tests2 = await runMicroTests();
    if (tests2 && tests2.ok === false) {
      restoreSnapshot(snap);
      return { ok:false, step:"tests_post", tests:tests2, rolledBack:true };
    }

    const gate2 = await runGate();
    if (!gate2.ok) {
      restoreSnapshot(snap);
      return { ok:false, step:"gate_post", gate:gate2, rolledBack:true };
    }

    return { ok:true, applied:true, gate2 };
  }

  window.RCF_APPLY_PIPELINE = {
    snapshotApps,
    restoreSnapshot,
    applyWithRollback
  };
})();

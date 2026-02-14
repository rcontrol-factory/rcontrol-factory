/* RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v1.3
   - updateFromGitHub: puxa mother_bundle.json via RCF_GH_SYNC.pull e aplica no Overrides VFS
   - clearOverrides: limpa overrides via VFS
   - getLocalBundleText: retorna o último bundle puxado (memória ou localStorage)
   - timeouts robustos (15000ms update, 6500ms clear)
   - normaliza paths pra runtime (strip /app)
*/
(() => {
  "use strict";

  if (window.RCF_MAE && window.RCF_MAE.__v13) return;

  const LS_BUNDLE_TEXT = "rcf:mother_bundle_text";
  const UPDATE_TIMEOUT_MS = 15000;
  const CLEAR_TIMEOUT_MS = 6500;

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[MAE]", lvl, msg); } catch {}
  };

  function withTimeout(promise, ms, label){
    let t;
    const to = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms (${label})`)), ms);
    });
    return Promise.race([promise, to]).finally(() => clearTimeout(t));
  }

  function safeParse(raw, fb){
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  function normPath(input){
    let p = String(input || "").trim();
    if (!p) return "/";
    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    // compat repo -> runtime
    if (p === "/app/index.html") p = "/index.html";
    if (p.startsWith("/app/")) p = p.slice(4); // remove "/app"
    if (!p.startsWith("/")) p = "/" + p;
    return p;
  }

  function getCfg(){
    return window.RCF_GH_SYNC?.loadConfig ? window.RCF_GH_SYNC.loadConfig() : {};
  }

  function hasOverrides(){
    const v = window.RCF_VFS_OVERRIDES;
    return !!(v && typeof v.put === "function" && typeof v.clearOverrides === "function");
  }

  async function applyBundle(bundleObj, opts){
    const vfs = window.RCF_VFS_OVERRIDES;
    if (!vfs || typeof vfs.put !== "function") throw new Error("Overrides VFS sem put()");

    // formato esperado: { files:[{path,content,contentType}] } OU array direto
    const files = Array.isArray(bundleObj) ? bundleObj : (bundleObj?.files || []);
    const total = files.length;

    let wrote = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++){
      const f = files[i] || {};
      const path = normPath(f.path || f.file || f.name || "");
      const content = (f.content ?? f.data ?? "");
      const contentType = f.contentType || f.type || "";

      try {
        await vfs.put(path, content, contentType);
        wrote++;
        opts?.onProgress?.({ step: "apply_progress", done: wrote + failed, total, path });
      } catch (e) {
        failed++;
        log("err", `apply: FAIL ${path} :: ${e?.message || e}`);
        opts?.onProgress?.({ step: "apply_progress", done: wrote + failed, total, path, err: String(e?.message || e) });
      }
    }

    opts?.onProgress?.({ step: "apply_done", done: wrote, failed, total });
    return { ok: failed === 0, wrote, failed, total };
  }

  async function updateFromGitHub(opts){
    return withTimeout((async () => {
      if (!window.RCF_GH_SYNC?.pull) throw new Error("RCF_GH_SYNC.pull ausente");
      if (!hasOverrides()) throw new Error("Overrides VFS incompleto");

      log("ok", "update start");

      const cfg = getCfg();
      const bundleText = await window.RCF_GH_SYNC.pull(cfg);

      // guarda pra pushMotherBundle funcionar
      window.RCF_MAE.__lastBundleText = String(bundleText || "");
      try { localStorage.setItem(LS_BUNDLE_TEXT, window.RCF_MAE.__lastBundleText); } catch {}

      const bundleObj = safeParse(bundleText, null);
      if (!bundleObj) throw new Error("Bundle puxado inválido (JSON parse falhou)");

      const res = await applyBundle(bundleObj, opts);

      log("ok", "update done");
      return { ok: true, ...res };
    })(), UPDATE_TIMEOUT_MS, "updateFromGitHub");
  }

  async function clearOverrides(){
    return withTimeout((async () => {
      const vfs = window.RCF_VFS_OVERRIDES;
      if (!vfs || typeof vfs.clearOverrides !== "function") throw new Error("Overrides VFS sem clearOverrides()");
      const r = await vfs.clearOverrides();
      log("ok", "clearOverrides ok");
      return { ok: true, ...r };
    })(), CLEAR_TIMEOUT_MS, "RCF_OVERRIDE_CLEAR");
  }

  async function getLocalBundleText(){
    // 1) memória
    if (typeof window.RCF_MAE.__lastBundleText === "string" && window.RCF_MAE.__lastBundleText.length) {
      return window.RCF_MAE.__lastBundleText;
    }
    // 2) storage
    const raw = localStorage.getItem(LS_BUNDLE_TEXT);
    if (raw && raw.length) return raw;

    throw new Error("Bundle local indisponível (ainda não fez pull/update)");
  }

  function check(){
    const cfg = getCfg();
    const bt = (typeof window.RCF_MAE.__lastBundleText === "string") ? window.RCF_MAE.__lastBundleText : (localStorage.getItem(LS_BUNDLE_TEXT) || "");
    return {
      ok: true,
      v: "v1.3",
      motherRoot: "/app",
      hasSync: !!window.RCF_GH_SYNC,
      hasOverridesVFS: hasOverrides(),
      bundleSize: (bt || "").length,
      cfg: cfg || {}
    };
  }

  window.RCF_MAE = {
    __v13: true,
    check,
    updateFromGitHub,
    clearOverrides,
    getLocalBundleText,
    __lastBundleText: window.RCF_MAE?.__lastBundleText || ""
  };

  log("ok", "mother_selfupdate.js ready ✅");
})();

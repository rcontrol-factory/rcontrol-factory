/* RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v2.1
   FIX: mother_bundle_local voltando a ficar vazio (Injector: files=0)

   O que este patch faz (mínimo e seguro):
   - Sempre salva o bundle puxado do GitHub em localStorage:
       rcf:mother_bundle_local  (texto JSON)
       rcf:mother_bundle_meta   (info)
   - Expõe getLocalBundleText() (usado pelo pushMotherBundle)
   - Mantém updateFromGitHub() e clear() compatíveis
*/
(() => {
  "use strict";

  if (window.RCF_MAE && window.RCF_MAE.__v21) return;

  const LS_BUNDLE_KEY  = "rcf:mother_bundle_local";
  const LS_BUNDLE_META = "rcf:mother_bundle_meta";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[MAE]", lvl, msg); } catch {}
  };

  function safeParse(raw, fb){
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  function setLocalBundleText(bundleText, metaExtra){
    const txt = String(bundleText || "").trim();
    if (!txt) throw new Error("Bundle local vazio");

    // valida JSON
    let j = null;
    try { j = JSON.parse(txt); } catch { throw new Error("Bundle não é JSON válido"); }

    localStorage.setItem(LS_BUNDLE_KEY, txt);

    const meta = {
      ts: Date.now(),
      filesCount: Array.isArray(j?.files) ? j.files.length : (Array.isArray(j?.items) ? j.items.length : null),
      ...((metaExtra && typeof metaExtra === "object") ? metaExtra : {})
    };
    localStorage.setItem(LS_BUNDLE_META, JSON.stringify(meta));

    return { ok:true, meta };
  }

  function getLocalBundleText(){
    const txt = String(localStorage.getItem(LS_BUNDLE_KEY) || "").trim();
    return txt || "";
  }

  function status(){
    const txt = getLocalBundleText();
    if (!txt) return { ok:false, msg:"bundle local ausente" };
    const meta = safeParse(localStorage.getItem(LS_BUNDLE_META), {}) || {};
    return { ok:true, msg:"bundle local ok", meta };
  }

  async function applyBundleToOverrides(bundleText, opts){
    const onProgress = opts?.onProgress;

    const txt = String(bundleText || "").trim();
    if (!txt) throw new Error("Bundle vazio para aplicar");

    const bundle = JSON.parse(txt);

    // compat: aceita bundle.files (padrão) ou bundle.items
    const files = Array.isArray(bundle.files) ? bundle.files
                : (Array.isArray(bundle.items) ? bundle.items : []);

    if (!files.length) {
      // mesmo se não tiver files, ainda salva local para o Injector parar de dar files=0 sem explicação
      throw new Error("Bundle sem files[]");
    }

    if (!window.RCF_VFS?.put) throw new Error("RCF_VFS.put ausente (Overrides VFS incompleto)");

    let wrote = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++){
      const f = files[i] || {};
      const path = String(f.path || f.name || "").trim();
      const content = (f.content != null) ? String(f.content) : "";
      const contentType = String(f.contentType || f.type || "").trim();

      if (!path) { failed++; continue; }

      try {
        if (onProgress) onProgress({ step:"apply_progress", done:wrote+failed, total:files.length, path });
        await window.RCF_VFS.put(path, content, contentType);
        wrote++;
      } catch (e) {
        failed++;
        log("err", `apply fail ${path} :: ${e?.message || e}`);
      }
    }

    if (onProgress) onProgress({ step:"apply_done", done:wrote, total:files.length });

    return { ok:true, wrote, failed, total:files.length };
  }

  async function updateFromGitHub(opts){
    log("ok", "update start");

    if (!window.RCF_GH_SYNC?.pull) throw new Error("RCF_GH_SYNC.pull ausente");

    // 1) puxa do GitHub
    const cfg = window.RCF_GH_SYNC.loadConfig ? window.RCF_GH_SYNC.loadConfig() : {};
    const bundleText = await window.RCF_GH_SYNC.pull(cfg);

    // 2) salva local SEMPRE (FIX do Injector)
    const saved = setLocalBundleText(bundleText, { source:"github_pull" });
    log("info", "mother_bundle_local saved " + JSON.stringify(saved.meta));

    // 3) aplica nas overrides (VFS)
    const r = await applyBundleToOverrides(bundleText, opts);

    log("ok", "update done");
    return r;
  }

  async function clear(opts){
    // limpa overrides (se existir)
    if (window.RCF_VFS?.clearOverrides) {
      const r = await window.RCF_VFS.clearOverrides();
      log("ok", "clearOverrides ok");
      return r;
    }
    throw new Error("Overrides VFS sem clearOverrides()");
  }

  window.RCF_MAE = {
    __v21: true,
    updateFromGitHub,
    clear,
    status,
    getLocalBundleText,
  };

  log("ok", "mother_selfupdate.js ready ✅");
})();

/* RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v2.2
   FIX: bundle do GitHub vem sem files[] (Injector: files=0)

   - Salva RAW:          rcf:mother_bundle_raw
   - Salva NORMALIZADO:  rcf:mother_bundle_local  (sempre {files:[...]})
   - Salva META:         rcf:mother_bundle_meta
   - Expõe getLocalBundleText() (usado por pushMotherBundle)
   - NÃO mexe no SW
*/
(() => {
  "use strict";

  if (window.RCF_MAE && window.RCF_MAE.__v22) return;

  const LS_BUNDLE_KEY  = "rcf:mother_bundle_local";
  const LS_BUNDLE_RAW  = "rcf:mother_bundle_raw";
  const LS_BUNDLE_META = "rcf:mother_bundle_meta";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[MAE]", lvl, msg); } catch {}
  };

  function safeParse(raw, fb){
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  function isPlainObject(x){
    return !!x && typeof x === "object" && !Array.isArray(x);
  }

  function pick(obj, pathArr){
    // pathArr ex: ["bundle","files"]
    let cur = obj;
    for (const k of (pathArr || [])) {
      if (!cur) return null;
      cur = cur[k];
    }
    return cur ?? null;
  }

  function normalizeFilesFromAnyShape(j){
    // 1) arrays diretas
    const candidates = [
      ["files"], ["items"],
      ["bundle","files"], ["bundle","items"],
      ["data","files"], ["data","items"],
      ["mother","files"], ["mother","items"],
      ["mother_bundle","files"], ["mother_bundle","items"],
      ["payload","files"], ["payload","items"],
    ];

    for (const p of candidates){
      const v = pick(j, p);
      if (Array.isArray(v) && v.length) return v;
    }

    // 2) maps/objetos (ex.: files: { "/index.html": "..." })
    const mapCandidates = [
      ["files"], ["overrides"], ["vfs"], ["entries"], ["map"],
      ["bundle","files"], ["bundle","overrides"],
      ["data","files"], ["data","overrides"],
    ];

    for (const p of mapCandidates){
      const v = pick(j, p);
      if (isPlainObject(v)) {
        const out = [];
        for (const [k, val] of Object.entries(v)) {
          const path = String(k || "").trim();
          if (!path) continue;

          if (typeof val === "string") {
            out.push({ path, content: val, contentType: guessType(path) });
            continue;
          }

          if (isPlainObject(val)) {
            const content =
              (val.content != null) ? String(val.content) :
              (val.text != null) ? String(val.text) :
              (val.body != null) ? String(val.body) :
              "";
            const ct = String(val.contentType || val.type || guessType(path));
            out.push({ path, content, contentType: ct });
            continue;
          }

          // fallback
          out.push({ path, content: String(val ?? ""), contentType: guessType(path) });
        }

        if (out.length) return out;
      }
    }

    // 3) último fallback: se o JSON tiver uma lista em algum lugar, mas vazia/estranha
    return [];
  }

  function normalizeBundleShape(bundleText){
    const rawTxt = String(bundleText || "").trim();
    if (!rawTxt) throw new Error("Bundle vazio");

    let j = null;
    try { j = JSON.parse(rawTxt); }
    catch { throw new Error("Bundle não é JSON válido"); }

    const rawKeys = Object.keys(j || {});
    const filesAny = normalizeFilesFromAnyShape(j);

    // normaliza itens
    const files = (filesAny || []).map((f, idx) => {
      // se já vier no formato {path,content,contentType}
      if (isPlainObject(f) && (f.path || f.name)) {
        const path = String(f.path || f.name || "").trim();
        const content = (f.content != null) ? String(f.content) : "";
        const ct = String(f.contentType || f.type || guessType(path));
        if (!path) return null;
        return { path, content, contentType: ct };
      }

      // se vier como string (raro)
      if (typeof f === "string") {
        return { path: `/unknown_${idx}.txt`, content: f, contentType: "text/plain; charset=utf-8" };
      }

      return null;
    }).filter(Boolean);

    if (!files.length) {
      log("err", "bundle normalize failed: sem files. keys=" + JSON.stringify(rawKeys));
      return { ok:false, rawKeys, normalized:null };
    }

    const normalized = {
      version: "rcf_bundle_v1",
      ts: Date.now(),
      files,
    };

    return { ok:true, rawKeys, normalized };
  }

  function setLocalBundleNormalized(rawTxt, normalizedObj, metaExtra){
    localStorage.setItem(LS_BUNDLE_RAW, String(rawTxt || ""));

    const normTxt = JSON.stringify(normalizedObj);
    localStorage.setItem(LS_BUNDLE_KEY, normTxt);

    const meta = {
      ts: Date.now(),
      filesCount: Array.isArray(normalizedObj?.files) ? normalizedObj.files.length : null,
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

  async function applyBundleToOverrides(normalizedBundleText, opts){
    const onProgress = opts?.onProgress;

    const txt = String(normalizedBundleText || "").trim();
    if (!txt) throw new Error("Bundle normalizado vazio para aplicar");

    const bundle = JSON.parse(txt);
    const files = Array.isArray(bundle.files) ? bundle.files : [];
    if (!files.length) throw new Error("Bundle normalizado sem files[]");

    if (!window.RCF_VFS?.put) throw new Error("RCF_VFS.put ausente (Overrides VFS incompleto)");

    let wrote = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++){
      const f = files[i] || {};
      const path = String(f.path || "").trim();
      const content = (f.content != null) ? String(f.content) : "";
      const contentType = String(f.contentType || guessType(path));

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

    const cfg = window.RCF_GH_SYNC.loadConfig ? window.RCF_GH_SYNC.loadConfig() : {};
    const rawTxt = await window.RCF_GH_SYNC.pull(cfg);

    const norm = normalizeBundleShape(rawTxt);
    if (!norm.ok || !norm.normalized) {
      throw new Error("Bundle sem files[] (formato do mother_bundle.json não reconhecido)");
    }

    const saved = setLocalBundleNormalized(rawTxt, norm.normalized, { source:"github_pull", rawKeys: norm.rawKeys });
    log("info", "mother_bundle_local saved " + JSON.stringify(saved.meta));

    const r = await applyBundleToOverrides(JSON.stringify(norm.normalized), opts);

    log("ok", "update done");
    return r;
  }

  async function clear(){
    if (window.RCF_VFS?.clearOverrides) {
      const r = await window.RCF_VFS.clearOverrides();
      log("ok", "clearOverrides ok");
      return r;
    }
    throw new Error("Overrides VFS sem clearOverrides()");
  }

  window.RCF_MAE = {
    __v22: true,
    updateFromGitHub,
    clear,
    status,
    getLocalBundleText,
  };

  log("ok", "mother_selfupdate.js ready ✅");
})();

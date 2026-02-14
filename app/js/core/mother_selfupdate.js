/* RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v2.2b
   PATCH MÍNIMO:
   - Compat total: salva bundle normalizado em múltiplas chaves (scan antigo não fica files=0)
   - getMotherBundleLocal() único: lê qualquer chave e normaliza {files:[...]}
   - Apply/Clear: prefere RCF_VFS_OVERRIDES, fallback RCF_VFS
   - Mantém getLocalBundleText()/status() (usado no pushMotherBundle)
   - NÃO mexe no SW
*/
(() => {
  "use strict";

  if (window.RCF_MAE && window.RCF_MAE.__v22b) return;

  // ✅ chaves padrão + compat antigas
  const LS_BUNDLE_KEY       = "rcf:mother_bundle_local";     // padrão: SEMPRE normalizado {version,ts,files:[...]}
  const LS_BUNDLE_RAW       = "rcf:mother_bundle_raw";       // texto raw do GH
  const LS_BUNDLE_META      = "rcf:mother_bundle_meta";      // meta/info
  const LS_BUNDLE_COMPAT_1  = "rcf:mother_bundle";           // compat
  const LS_BUNDLE_COMPAT_2  = "rcf:mother_bundle_json";      // compat

  const log = (lvl, msg, obj) => {
    try {
      if (obj !== undefined) window.RCF_LOGGER?.push?.(lvl, String(msg) + " " + JSON.stringify(obj));
      else window.RCF_LOGGER?.push?.(lvl, String(msg));
    } catch {}
    try {
      if (obj !== undefined) console.log("[MAE]", lvl, msg, obj);
      else console.log("[MAE]", lvl, msg);
    } catch {}
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

    // 2) maps/objetos (files: { "/x": "..." } ou { "/x": {content,...} })
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

          out.push({ path, content: String(val ?? ""), contentType: guessType(path) });
        }

        if (out.length) return out;
      }
    }

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

    const files = (filesAny || []).map((f, idx) => {
      if (isPlainObject(f) && (f.path || f.name)) {
        const path = String(f.path || f.name || "").trim();
        const content = (f.content != null) ? String(f.content) : "";
        const ct = String(f.contentType || f.type || guessType(path));
        if (!path) return null;
        return { path, content, contentType: ct };
      }

      if (typeof f === "string") {
        return { path: `/unknown_${idx}.txt`, content: f, contentType: "text/plain; charset=utf-8" };
      }

      return null;
    }).filter(Boolean);

    if (!files.length) {
      log("err", "bundle normalize failed: sem files. keys=", rawKeys);
      return { ok:false, rawKeys, normalized:null };
    }

    const normalized = {
      version: "rcf_bundle_v1",
      ts: Date.now(),
      files,
    };

    return { ok:true, rawKeys, normalized };
  }

  // ✅ Função ÚNICA (pra qualquer SCAN/CP1 ler sempre certo)
  function getMotherBundleLocal(){
    const raw =
      localStorage.getItem(LS_BUNDLE_KEY) ||
      localStorage.getItem(LS_BUNDLE_COMPAT_1) ||
      localStorage.getItem(LS_BUNDLE_COMPAT_2) ||
      "";

    if (!raw) return null;

    let j = null;
    try { j = JSON.parse(raw); } catch { return null; }

    // aceita {version,ts,files:[...]} ou qualquer shape
    let files = [];
    if (Array.isArray(j.files)) files = j.files;
    else files = normalizeFilesFromAnyShape(j);

    // normaliza itens para {path,content,contentType}
    const out = (files || []).map((f, idx) => {
      if (isPlainObject(f) && (f.path || f.name)) {
        const path = String(f.path || f.name || "").trim();
        if (!path) return null;
        const content = (f.content != null) ? String(f.content) : "";
        const ct = String(f.contentType || f.type || guessType(path));
        return { path, content, contentType: ct };
      }
      if (typeof f === "string") {
        return { path: `/unknown_${idx}.txt`, content: f, contentType: "text/plain; charset=utf-8" };
      }
      return null;
    }).filter(Boolean);

    return { meta: j, files: out };
  }

  function setLocalBundleNormalized(rawTxt, normalizedObj, metaExtra){
    // RAW (sempre)
    localStorage.setItem(LS_BUNDLE_RAW, String(rawTxt || ""));

    // NORMALIZADO (padrão)
    const normTxt = JSON.stringify(normalizedObj);
    localStorage.setItem(LS_BUNDLE_KEY, normTxt);

    // ✅ COMPAT: salva também nas chaves antigas (evita scan B lendo errado)
    try { localStorage.setItem(LS_BUNDLE_COMPAT_1, normTxt); } catch {}
    try { localStorage.setItem(LS_BUNDLE_COMPAT_2, normTxt); } catch {}

    const meta = {
      ts: Date.now(),
      filesCount: Array.isArray(normalizedObj?.files) ? normalizedObj.files.length : 0,
      source: "unknown",
      rawKeys: Object.keys(normalizedObj || {}),
      ...((metaExtra && typeof metaExtra === "object") ? metaExtra : {})
    };
    localStorage.setItem(LS_BUNDLE_META, JSON.stringify(meta));

    return { ok:true, meta };
  }

  // texto do bundle normalizado (usado pelo pushMotherBundle)
  function getLocalBundleText(){
    const txt = String(localStorage.getItem(LS_BUNDLE_KEY) || "").trim();
    return txt || "";
  }

  function status(){
    const b = getMotherBundleLocal();
    if (!b) return { ok:false, msg:"bundle local ausente" };

    const meta = safeParse(localStorage.getItem(LS_BUNDLE_META), {}) || {};
    return {
      ok: true,
      msg: "bundle local ok",
      meta: {
        ...meta,
        filesCount: b?.files?.length || meta.filesCount || 0
      }
    };
  }

  function pickVFS(){
    // ✅ preferido (novo)
    if (window.RCF_VFS_OVERRIDES && typeof window.RCF_VFS_OVERRIDES.put === "function") {
      return {
        kind: "OVERRIDES",
        put: window.RCF_VFS_OVERRIDES.put.bind(window.RCF_VFS_OVERRIDES),
        clear: (typeof window.RCF_VFS_OVERRIDES.clear === "function")
          ? window.RCF_VFS_OVERRIDES.clear.bind(window.RCF_VFS_OVERRIDES)
          : null
      };
    }

    // ✅ fallback (antigo)
    if (window.RCF_VFS && typeof window.RCF_VFS.put === "function") {
      return {
        kind: "VFS",
        put: window.RCF_VFS.put.bind(window.RCF_VFS),
        clear: (typeof window.RCF_VFS.clearOverrides === "function")
          ? window.RCF_VFS.clearOverrides.bind(window.RCF_VFS)
          : (typeof window.RCF_VFS.clearAll === "function")
            ? window.RCF_VFS.clearAll.bind(window.RCF_VFS)
            : null
      };
    }

    return null;
  }

  async function applyBundleToOverrides(normalizedBundleText, opts){
    const onProgress = opts?.onProgress;

    const txt = String(normalizedBundleText || "").trim();
    if (!txt) throw new Error("Bundle normalizado vazio para aplicar");

    const bundle = JSON.parse(txt);
    const files = Array.isArray(bundle.files) ? bundle.files : [];
    if (!files.length) throw new Error("Bundle normalizado sem files[]");

    const vfs = pickVFS();
    if (!vfs || !vfs.put) throw new Error("Overrides VFS incompleto (sem put). Recarregue 1x após SW controlar.");

    let wrote = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++){
      const f = files[i] || {};
      const path = String(f.path || "").trim();
      const content = (f.content != null) ? String(f.content) : "";
      const contentType = String(f.contentType || guessType(path));

      if (!path) { failed++; continue; }

      try {
        if (onProgress) onProgress({ step:"apply_progress", done:(wrote+failed), total:files.length, path });
        await Promise.resolve(vfs.put(path, content, contentType));
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
    log("info", "mother_bundle_local saved", saved.meta);

    const r = await applyBundleToOverrides(JSON.stringify(norm.normalized), opts);

    log("ok", "update done");
    return r;
  }

  async function clear(){
    const vfs = pickVFS();
    if (vfs?.clear) {
      const r = await Promise.resolve(vfs.clear());
      log("ok", "mae clear: ok");
      return r;
    }
    throw new Error("Overrides VFS sem clear/clearOverrides()");
  }

  window.RCF_MAE = {
    __v22b: true,
    updateFromGitHub,
    clear,
    status,
    getLocalBundleText,
    // ✅ exposto pra CP1/scan usar (se precisar)
    getMotherBundleLocal,
  };

  log("ok", "mother_selfupdate.js ready ✅");
})();

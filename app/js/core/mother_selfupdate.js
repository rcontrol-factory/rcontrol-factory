/* RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v2.3f
   PATCH OBRIGATÓRIO (BUNDLE BRIDGE + GHCFG AUTO-FIX):
   - Permite bundle com files vazio (bridge)
   - Só rejeita se bundle inválido ou files não for array
   - files.length === 0 => NÃO erro, apenas aviso
   - Auto-completa ghcfg (owner/repo/branch/path) se vier incompleto
   - Salva bundle em chaves compatíveis (local + compat)
*/
(() => {
  "use strict";

  if (window.RCF_MAE && window.RCF_MAE.__v23f) return;

  // ===== Defaults do seu repo (pode ajustar se quiser) =====
  const DEF_OWNER  = "rcontrol-factory";
  const DEF_REPO   = "rcontrol-factory";
  const DEF_BRANCH = "main";
  const DEF_PATH   = "app/import/mother_bundle.json";

  const LS_GHCFG_KEY        = "rcf:ghcfg";

  const LS_BUNDLE_KEY       = "rcf:mother_bundle_local";
  const LS_BUNDLE_RAW       = "rcf:mother_bundle_raw";
  const LS_BUNDLE_META      = "rcf:mother_bundle_meta";
  const LS_BUNDLE_COMPAT_1  = "rcf:mother_bundle";
  const LS_BUNDLE_COMPAT_2  = "rcf:mother_bundle_json";

  const LS_APPLY_GATE_KEY   = "rcf:mae:apply_gate";

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

  function safeStringify(obj, fb){
    try { return JSON.stringify(obj); } catch { return fb || ""; }
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

  // ===== GHCFG AUTO-FIX =====
  function readGhcfg(){
    const raw = String(localStorage.getItem(LS_GHCFG_KEY) || "").trim();
    const j = safeParse(raw, null);
    return isPlainObject(j) ? j : {};
  }

  function normalizeGhcfg(cfg){
    const out = isPlainObject(cfg) ? { ...cfg } : {};

    // aceita variações de campo (caso algum módulo use outros nomes)
    const owner = String(out.owner || out.org || out.user || out.username || "").trim();
    const repo  = String(out.repo  || out.repository || out.repoName || "").trim();
    const branch= String(out.branch|| out.ref || "").trim();
    const path  = String(out.path  || out.bundlePath || "").trim();

    out.owner  = owner  || DEF_OWNER;
    out.repo   = repo   || DEF_REPO;
    out.branch = branch || DEF_BRANCH;
    out.path   = path   || DEF_PATH;

    return out;
  }

  function ensureGhcfgComplete(){
    const cfg0 = readGhcfg();
    const cfg = normalizeGhcfg(cfg0);

    const wasMissing =
      !String(cfg0.owner || cfg0.org || cfg0.user || cfg0.username || "").trim() ||
      !String(cfg0.repo  || cfg0.repository || cfg0.repoName || "").trim();

    // se faltava owner/repo, a gente completa e salva
    if (wasMissing) {
      try {
        localStorage.setItem(LS_GHCFG_KEY, safeStringify(cfg, ""));
        log("warn", "ghcfg incompleto -> auto-fix aplicado", { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, path: cfg.path });
      } catch {}
    }

    // se mesmo assim estiver ruim, aborta com erro claro
    if (!cfg.owner || !cfg.repo) {
      throw new Error("ghcfg incompleto (owner/repo)");
    }

    return cfg;
  }

  // ===== bundle normalize =====
  function normalizeFilesFromAnyShape(j){
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
      if (Array.isArray(v)) return v; // aceita array vazio também
    }

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
        return out; // pode retornar vazio
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

    if (!Array.isArray(filesAny)) {
      log("err", "bundle normalize failed: files não é array", rawKeys);
      return { ok:false, rawKeys, normalized:null };
    }

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

    // aceita files.length === 0 (bridge)
    if (!files.length) {
      log("warn", "bundle bridge detectado (files vazio)", rawKeys);
      const normalized = { version: "rcf_bundle_v1", ts: Date.now(), files: [] };
      return { ok:true, rawKeys, normalized, bridge:true };
    }

    const normalized = { version: "rcf_bundle_v1", ts: Date.now(), files };
    return { ok:true, rawKeys, normalized };
  }

  function getLocalBundleText(){
    const txt = String(localStorage.getItem(LS_BUNDLE_KEY) || "").trim();
    return txt || "";
  }

  function pickVFS(){
    if (window.RCF_VFS_OVERRIDES && typeof window.RCF_VFS_OVERRIDES.put === "function") {
      const o = window.RCF_VFS_OVERRIDES;
      const clearFn =
        (typeof o.clearOverrides === "function") ? o.clearOverrides.bind(o) :
        (typeof o.clear === "function") ? o.clear.bind(o) :
        null;
      return { kind: "OVERRIDES", put: o.put.bind(o), clear: clearFn };
    }

    if (window.RCF_VFS && typeof window.RCF_VFS.put === "function") {
      const v = window.RCF_VFS;
      const clearFn =
        (typeof v.clearOverrides === "function") ? v.clearOverrides.bind(v) :
        (typeof v.clearAll === "function") ? v.clearAll.bind(v) :
        (typeof v.clear === "function") ? v.clear.bind(v) :
        null;
      return { kind: "VFS", put: v.put.bind(v), clear: clearFn };
    }

    return null;
  }

  async function applyBundleToOverrides(normalizedBundleText, opts){
    const txt = String(normalizedBundleText || "").trim();
    if (!txt) throw new Error("Bundle normalizado vazio para aplicar");

    const bundle = JSON.parse(txt);

    if (!bundle || typeof bundle !== "object") throw new Error("Bundle inválido");
    if (!("files" in bundle)) throw new Error("Bundle sem propriedade files");
    if (!Array.isArray(bundle.files)) throw new Error("Bundle files não é array");

    if (bundle.files.length === 0) {
      log("warn", "apply bridge: files vazio");
      return { applied: 0, bridge: true };
    }

    const vfs = pickVFS();
    if (!vfs || !vfs.put) throw new Error("Overrides VFS incompleto");

    let wrote = 0;
    let failed = 0;

    for (let i = 0; i < bundle.files.length; i++){
      const f = bundle.files[i] || {};
      const path = String(f.path || "").trim();
      const content = (f.content != null) ? String(f.content) : "";
      const contentType = String(f.contentType || guessType(path));

      if (!path) { failed++; continue; }

      try {
        await Promise.resolve(vfs.put(path, content, contentType));
        wrote++;
      } catch (e) {
        failed++;
        log("err", `apply fail ${path} :: ${e?.message || e}`);
      }
    }

    return { ok:true, wrote, failed, total: bundle.files.length };
  }

  function saveBundleEverywhere(normalizedObj){
    const txt = safeStringify(normalizedObj, "");
    if (!txt) throw new Error("Falha ao serializar bundle");

    try { localStorage.setItem(LS_BUNDLE_KEY, txt); } catch {}
    try { localStorage.setItem(LS_BUNDLE_COMPAT_1, txt); } catch {}
    try { localStorage.setItem(LS_BUNDLE_COMPAT_2, txt); } catch {}
    try { localStorage.setItem(LS_BUNDLE_RAW, txt); } catch {}
    try { localStorage.setItem(LS_BUNDLE_META, safeStringify({ ts: Date.now(), files: normalizedObj?.files?.length || 0 }, "")); } catch {}

    return txt;
  }

  async function updateFromGitHub(opts){
    log("ok", "update start");

    // garante ghcfg completo ANTES do github_sync ler
    ensureGhcfgComplete();

    if (localStorage.getItem(LS_APPLY_GATE_KEY) == null) {
      try { localStorage.setItem(LS_APPLY_GATE_KEY, "1"); } catch {}
    }

    if (!window.RCF_GH_SYNC?.pull) {
      throw new Error("RCF_GH_SYNC indisponível");
    }

    const rawTxt = await window.RCF_GH_SYNC.pull({});
    const norm = normalizeBundleShape(rawTxt);

    if (!norm.ok || !norm.normalized) {
      throw new Error("Bundle inválido");
    }

    saveBundleEverywhere(norm.normalized);

    if (norm.bridge) {
      return { applied: 0, bridge: true };
    }

    const wantApply = !!opts?.apply;
    if (!wantApply) {
      return { ok:true, passive:true, saved:true, total: norm.normalized.files.length };
    }

    return await applyBundleToOverrides(safeStringify(norm.normalized, ""), opts);
  }

  async function applySaved(opts){
    const txt = getLocalBundleText();
    if (!txt) throw new Error("Sem bundle salvo.");
    return await applyBundleToOverrides(txt, opts);
  }

  async function clear(){
    const vfs = pickVFS();
    if (vfs?.clear) return await Promise.resolve(vfs.clear());
    throw new Error("Overrides VFS sem clear()");
  }

  window.RCF_MAE = {
    __v23f: true,
    updateFromGitHub,
    applySaved,
    clear,
    getLocalBundleText
  };

  log("ok", "mother_selfupdate.js ready ✅ (bridge+ghcfg autofix)");
})();

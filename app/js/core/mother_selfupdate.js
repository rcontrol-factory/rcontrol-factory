/* FILE: /app/js/core/mother_selfupdate.js
   RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v2.3h
   PATCH (mínimo e seguro):
   - Mantém BRIDGE (files[] vazio não dá erro)
   - ✅ FIX: MAE update usa ghcfg salvo (owner/repo/branch/path/token)
   - ✅ FIX: salva bundle em TODOS os keys compat (local/raw/meta/compat1/compat2)
   - ✅ LOG: "mother_bundle_local saved filesCount=X (rawKeys ...)" para confirmar no log
   - ✅ ANTI-OVERWRITE: se algum módulo sobrescrever window.RCF_MAE, reidrata (sem loop infinito)
*/
(() => {
  "use strict";

  // se já estiver nessa versão, não reinstala
  if (window.RCF_MAE && window.RCF_MAE.__v23h) return;

  const LS_BUNDLE_KEY       = "rcf:mother_bundle_local";
  const LS_BUNDLE_RAW       = "rcf:mother_bundle_raw";
  const LS_BUNDLE_META      = "rcf:mother_bundle_meta";
  const LS_BUNDLE_COMPAT_1  = "rcf:mother_bundle";
  const LS_BUNDLE_COMPAT_2  = "rcf:mother_bundle_json";

  const LS_APPLY_GATE_KEY   = "rcf:mae:apply_gate";
  const LS_GHCFG_KEY        = "rcf:ghcfg";

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
      if (Array.isArray(v)) return v; // aceita array vazio
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

    // BRIDGE: aceita files.length === 0
    if (!files.length) {
      console.warn("Bundle bridge detectado (files vazio). Nada para aplicar.");
      log("warn", "bundle bridge detectado (files vazio)", rawKeys);

      const normalized = { version: "rcf_bundle_v1", ts: Date.now(), files: [] };
      return { ok:true, rawKeys, normalized, bridge:true, rawTxt };
    }

    const normalized = { version: "rcf_bundle_v1", ts: Date.now(), files };
    return { ok:true, rawKeys, normalized, rawTxt };
  }

  function getLocalBundleText(){
    const txt = String(localStorage.getItem(LS_BUNDLE_KEY) || "").trim();
    return txt || "";
  }

  // ✅ carrega ghcfg salvo (GH_SYNC.loadConfig OU localStorage)
  function loadGHCfg(){
    let cfg = {};
    try {
      if (window.RCF_GH_SYNC?.loadConfig) cfg = window.RCF_GH_SYNC.loadConfig() || {};
      else cfg = safeParse(localStorage.getItem(LS_GHCFG_KEY), {}) || {};
    } catch {
      cfg = safeParse(localStorage.getItem(LS_GHCFG_KEY), {}) || {};
    }

    const out = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: String(cfg.path || "app/import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(),
    };

    if (!out.owner) out.owner = "rcontrol-factory";
    if (!out.repo)  out.repo  = "rcontrol-factory";
    if (!out.branch) out.branch = "main";
    if (!out.path) out.path = "app/import/mother_bundle.json";

    try {
      if (window.RCF_GH_SYNC?.saveConfig) window.RCF_GH_SYNC.saveConfig(out);
      else localStorage.setItem(LS_GHCFG_KEY, JSON.stringify(out));
      log("warn", "ghcfg carregado/normalizado", { owner: out.owner, repo: out.repo, branch: out.branch, path: out.path });
    } catch {}

    return out;
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

  function saveBundleEverywhere(normObj, rawTxt, rawKeys, bridge){
    const normTxt = safeStringify(normObj, "");
    const meta = {
      ts: Date.now(),
      version: String(normObj?.version || "rcf_bundle_v1"),
      filesCount: Array.isArray(normObj?.files) ? normObj.files.length : 0,
      rawKeys: Array.isArray(rawKeys) ? rawKeys : [],
      bridge: !!bridge
    };

    try { localStorage.setItem(LS_BUNDLE_KEY, normTxt); } catch {}
    try { localStorage.setItem(LS_BUNDLE_COMPAT_1, normTxt); } catch {}
    try { localStorage.setItem(LS_BUNDLE_COMPAT_2, normTxt); } catch {}

    try { localStorage.setItem(LS_BUNDLE_RAW, String(rawTxt || "")); } catch {}
    try { localStorage.setItem(LS_BUNDLE_META, JSON.stringify(meta)); } catch {}

    log("ok", `mother_bundle_local saved filesCount=${meta.filesCount} (rawKeys ${meta.rawKeys.join(",") || "-"})`);
    return meta;
  }

  async function applyBundleToOverrides(normalizedBundleText, opts){
    const txt = String(normalizedBundleText || "").trim();
    if (!txt) throw new Error("Bundle normalizado vazio para aplicar");

    const bundle = JSON.parse(txt);

    if (!bundle || typeof bundle !== "object") throw new Error("Bundle inválido");
    if (!("files" in bundle)) throw new Error("Bundle sem propriedade files");
    if (!Array.isArray(bundle.files)) throw new Error("Bundle files não é array");

    // BRIDGE
    if (bundle.files.length === 0) {
      console.warn("Bundle bridge detectado (files vazio). Nada para aplicar.");
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

  async function updateFromGitHub(opts){
    log("ok", "update start");

    if (localStorage.getItem(LS_APPLY_GATE_KEY) == null) {
      try { localStorage.setItem(LS_APPLY_GATE_KEY, "1"); } catch {}
    }

    const cfg = loadGHCfg();
    if (!window.RCF_GH_SYNC?.pull) throw new Error("RCF_GH_SYNC.pull ausente");

    const rawTxt = await window.RCF_GH_SYNC.pull(cfg);
    const norm = normalizeBundleShape(rawTxt);

    if (!norm.ok || !norm.normalized) throw new Error("Bundle inválido");

    saveBundleEverywhere(norm.normalized, norm.rawTxt, norm.rawKeys, !!norm.bridge);

    if (norm.bridge) {
      return { applied: 0, bridge: true };
    }

    const wantApply = !!opts?.apply;
    if (!wantApply) {
      return { ok:true, passive:true, saved:true, total: norm.normalized.files.length };
    }

    return await applyBundleToOverrides(JSON.stringify(norm.normalized), opts);
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

  // ===========================
  // ✅ INSTALL + ANTI-OVERWRITE
  // ===========================
  function installAPI(reason){
    try {
      const api = (window.RCF_MAE && typeof window.RCF_MAE === "object") ? window.RCF_MAE : {};
      api.__v23h = true;
      api.updateFromGitHub = updateFromGitHub;
      api.applySaved = applySaved;
      api.clear = clear;
      api.getLocalBundleText = getLocalBundleText;

      window.RCF_MAE = api;

      // alias compat (se algum lugar usar outro nome)
      try { window.RCF_MOTHER = window.RCF_MAE; } catch {}

      log("ok", "MAE installed ✅ " + (reason || "install"));
      return api;
    } catch (e) {
      log("err", "MAE install fail :: " + (e?.message || e));
      return null;
    }
  }

  function ensureAPI(reason){
    try {
      const ok = !!(window.RCF_MAE && typeof window.RCF_MAE.updateFromGitHub === "function");
      if (ok) return true;
      installAPI("rehydrate:" + (reason || "unknown"));
      return !!(window.RCF_MAE && typeof window.RCF_MAE.updateFromGitHub === "function");
    } catch {
      return false;
    }
  }

  // instala agora
  installAPI("boot");

  // reidrata algumas vezes no começo (caso app.js ou outro módulo sobrescreva depois)
  (function softWatchdog(){
    let tries = 0;
    const max = 12; // ~12s (1s cada)
    const tick = () => {
      tries++;
      ensureAPI("watchdog#" + tries);
      if (tries < max) setTimeout(tick, 1000);
    };
    setTimeout(tick, 700);
  })();

  // reidrata quando UI_READY disparar (módulos tardios)
  try {
    window.addEventListener("RCF:UI_READY", () => ensureAPI("UI_READY"), { passive: true });
  } catch {}

  log("ok", "mother_selfupdate.js ready ✅ (bridge+ghcfg cfg fix + compat save + anti-overwrite)");
})();

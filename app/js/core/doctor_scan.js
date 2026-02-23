/* FILE: app/js/core/doctor_scan.js
   RControl Factory — Doctor Scan (READ-ONLY) — v0.1
   Objetivo: scanner seguro que NÃO altera nada.

   O que ele faz:
   - Coleta status de módulos (versões), VFS, MAE, GitHub cfg, bundles e chaves do localStorage
   - Ajuda a localizar 'onde está o problema' e 'onde está cada coisa'

   O que ele NÃO faz:
   - Não escreve em VFS, não mexe no GitHub, não aplica bundle.
*/
(() => {
  "use strict";

  if (window.RCF_DOCTOR && window.RCF_DOCTOR.__v01) return;

  const LS_GHCFG_KEY = "rcf:ghcfg";
  const LS_BUNDLE_KEY = "rcf:mother_bundle_local";
  const LS_BUNDLE_RAW = "rcf:mother_bundle_raw";
  const LS_BUNDLE_META = "rcf:mother_bundle_meta";
  const LS_COMPAT_1 = "rcf:mother_bundle";
  const LS_COMPAT_2 = "rcf:mother_bundle_json";

  const log = (lvl, msg, obj) => {
    try {
      if (obj !== undefined) window.RCF_LOGGER?.push?.(lvl, String(msg) + " " + JSON.stringify(obj));
      else window.RCF_LOGGER?.push?.(lvl, String(msg));
    } catch {}
    try {
      if (obj !== undefined) console.log("[DOCTOR]", lvl, msg, obj);
      else console.log("[DOCTOR]", lvl, msg);
    } catch {}
  };

  const safeParse = (raw, fb) => {
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  };

  const nowISO = () => {
    try { return new Date().toISOString(); } catch { return String(Date.now()); }
  };

  function isFn(x){ return typeof x === "function"; }

  function bytesOf(s){
    try { return new Blob([String(s ?? "")]).size; } catch { return String(s ?? "").length; }
  }

  function lsGet(k){
    try { return localStorage.getItem(k); } catch { return null; }
  }

  function summarizeObj(name, obj){
    if (!obj || typeof obj !== "object") return `${name}: absent`;
    const keys = Object.keys(obj);
    return `${name}: ok keys=${keys.length} (${keys.slice(0, 8).join(",")}${keys.length > 8 ? ",…" : ""})`;
  }

  function moduleVersions(){
    const out = [];
    const picks = [
      ["RCF_MAE", "__v23g"],
      ["RCF_GH_SYNC", "version"],
      ["RCF_VFS_OVERRIDES", "version"],
      ["RCF_VFS_SHIM", "version"],
      ["RCF_DIAG", "version"],
      ["RCF_LOGGER", "version"],
      ["RCF_PREVIEW", "version"],
      ["RCF_AGENT_RUNTIME", "version"],
      ["RCF_ZIP_VAULT", "version"],
      ["RCF_AGENT_ZIP_BRIDGE", "version"],
    ];

    for (const [name, key] of picks){
      try {
        const o = window[name];
        if (!o) { out.push(`${name}: absent`); continue; }
        const v = (key && (key in o)) ? o[key] : (o.version || o.__v || o.__version || null);
        out.push(`${name}: ok ${v ? `v=${String(v)}` : "(no version field)"}`);
      } catch (e) {
        out.push(`${name}: err ${(e && e.message) ? e.message : String(e)}`);
      }
    }
    return out;
  }

  function ghcfgReport(){
    const raw = lsGet(LS_GHCFG_KEY);
    const cfg = safeParse(raw, {});
    const owner = String(cfg.owner || "").trim();
    const repo = String(cfg.repo || "").trim();
    const branch = String(cfg.branch || "").trim() || "main";
    const path = String(cfg.path || "").trim();

    const hasToken = !!String(cfg.token || "").trim();
    const ok = !!owner && !!repo && !!path;

    const lines = [];
    lines.push(`ghcfg: ${ok ? "ok" : "warn"} owner=${owner || "-"} repo=${repo || "-"} branch=${branch} path=${path || "-"}`);
    lines.push(`ghcfg: token=${hasToken ? "SET" : "EMPTY"} (não exponho token no log)`);
    lines.push(`ghcfg: rawBytes=${raw ? bytesOf(raw) : 0}`);
    return lines;
  }

  function bundleReport(){
    const keys = [LS_BUNDLE_KEY, LS_COMPAT_1, LS_COMPAT_2, LS_BUNDLE_RAW, LS_BUNDLE_META];
    const lines = [];
    const lens = {};

    for (const k of keys){
      const v = lsGet(k);
      lens[k] = v ? bytesOf(v) : 0;
    }

    const meta = safeParse(lsGet(LS_BUNDLE_META), {});
    const metaCount = Number(meta.filesCount || 0) || 0;
    const metaKeys = Array.isArray(meta.rawKeys) ? meta.rawKeys : [];
    const bridge = !!meta.bridge;

    lines.push(`bundle(keys): local=${lens[LS_BUNDLE_KEY]}B compat1=${lens[LS_COMPAT_1]}B compat2=${lens[LS_COMPAT_2]}B raw=${lens[LS_BUNDLE_RAW]}B meta=${lens[LS_BUNDLE_META]}B`);
    lines.push(`bundle(meta): filesCount=${metaCount} bridge=${bridge ? "YES" : "NO"} rawKeys=${metaKeys.length ? metaKeys.join(",") : "-"}`);

    // sanity: tentar contar files do normalized
    try {
      const txt = String(lsGet(LS_BUNDLE_KEY) || "").trim();
      if (!txt) {
        lines.push("bundle(normalized): absent");
      } else {
        const j = safeParse(txt, null);
        const count = Array.isArray(j?.files) ? j.files.length : -1;
        lines.push(`bundle(normalized): ok files=${count >= 0 ? count : "?"} version=${j?.version || "-"}`);
      }
    } catch (e) {
      lines.push(`bundle(normalized): err ${(e && e.message) ? e.message : String(e)}`);
    }

    return lines;
  }

  function vfsReport(){
    const lines = [];
    const ov = window.RCF_VFS_OVERRIDES;
    const vfs = window.RCF_VFS;
    const shim = window.RCF_VFS_SHIM;

    lines.push(summarizeObj("RCF_VFS_OVERRIDES", ov));
    lines.push(summarizeObj("RCF_VFS", vfs));
    lines.push(summarizeObj("RCF_VFS_SHIM", shim));

    try {
      if (ov && isFn(ov.put)) lines.push("VFS: overrides.put ✅");
      else lines.push("VFS: overrides.put ❌");
    } catch {}

    try {
      const clearFn = (ov && (ov.clearOverrides || ov.clear)) || null;
      lines.push(`VFS: overrides.clear=${clearFn ? "YES" : "NO"}`);
    } catch {}

    return lines;
  }

  async function swReport(){
    const lines = [];
    try {
      if (!("serviceWorker" in navigator)) {
        lines.push("sw: unsupported");
        return lines;
      }

      const regs = await navigator.serviceWorker.getRegistrations();
      lines.push(`sw: registrations=${regs.length}`);

      for (let i = 0; i < Math.min(2, regs.length); i++){
        const r = regs[i];
        const scope = r?.scope || "-";
        const active = r?.active?.scriptURL ? "active" : "noactive";
        const installing = r?.installing?.scriptURL ? "installing" : "";
        const waiting = r?.waiting?.scriptURL ? "waiting" : "";
        lines.push(`sw[${i}]: ${active} ${installing} ${waiting} scope=${scope}`);
      }
    } catch (e) {
      lines.push(`sw: err ${(e && e.message) ? e.message : String(e)}`);
    }
    return lines;
  }

  function storageKeysReport(){
    const lines = [];
    try {
      const all = [];
      for (let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if (k) all.push(k);
      }
      all.sort();

      const rcf = all.filter(k => k.startsWith("rcf:"));
      lines.push(`localStorage: totalKeys=${all.length} rcfKeys=${rcf.length}`);

      // lista curta (pra não poluir)
      lines.push(`localStorage(rcf sample): ${rcf.slice(0, 18).join(",")}${rcf.length > 18 ? ",…" : ""}`);
    } catch (e) {
      lines.push(`localStorage: err ${(e && e.message) ? e.message : String(e)}`);
    }
    return lines;
  }

  function quickMapHint(){
    // Dicas de “onde fica cada coisa”, baseado no layout padrão do projeto
    return [
      "map: UI/View principal → /app/app.js",
      "map: Core modules → /app/js/core/*",
      "map: Engine (builder/registry/engine) → /app/js/engine/*",
      "map: Admin GitHub (pull/push + UI) → /app/js/admin.github.js",
      "map: Mother bundle JSON → /app/import/mother_bundle.json",
      "map: VFS overrides/shim → /app/js/core/vfs_overrides.js + vfs_shim.js",
      "map: Diagnostics output (#diagOut) → /app/js/core/diagnostics.js",
    ];
  }

  async function scan(opts){
    const report = [];
    report.push("========================================");
    report.push(`DOCTOR SCAN (read-only) v0.1 — ${nowISO()}`);
    report.push("========================================");

    // módulos
    report.push("");
    report.push("[MODULES]");
    report.push(...moduleVersions());

    // ghcfg
    report.push("");
    report.push("[GITHUB CFG]");
    report.push(...ghcfgReport());

    // bundle
    report.push("");
    report.push("[MOTHER BUNDLE]");
    report.push(...bundleReport());

    // VFS
    report.push("");
    report.push("[VFS]");
    report.push(...vfsReport());

    // storage keys
    report.push("");
    report.push("[STORAGE KEYS]");
    report.push(...storageKeysReport());

    // service worker
    report.push("");
    report.push("[SERVICE WORKER]");
    if (opts?.skipSW) report.push("sw: skipped");
    else report.push(...(await swReport()));

    // map hint
    report.push("");
    report.push("[WHERE IS WHAT]");
    report.push(...quickMapHint());

    // heurísticas simples
    report.push("");
    report.push("[HEURISTICS]");
    try {
      const mae = window.RCF_MAE;
      if (!mae) report.push("mae: ABSENT ❌ (selfupdate não disponível)");
      else if (!isFn(mae.updateFromGitHub)) report.push("mae: present mas updateFromGitHub AUSENTE ❌");
      else report.push("mae: ok ✅");

      const gh = window.RCF_GH_SYNC;
      if (!gh) report.push("gh_sync: ABSENT ❌");
      else if (!isFn(gh.pull)) report.push("gh_sync: pull AUSENTE ❌");
      else report.push("gh_sync: ok ✅");
    } catch (e) {
      report.push(`heuristics: err ${(e && e.message) ? e.message : String(e)}`);
    }

    return {
      ok: true,
      text: report.join("\n")
    };
  }

  function scanText(opts){
    try {
      // scanText síncrono “best effort” (sem SW)
      const report = [];
      report.push("========================================");
      report.push(`DOCTOR SCAN (read-only) v0.1 — ${nowISO()}`);
      report.push("========================================");
      report.push("");
      report.push("[MODULES]");
      report.push(...moduleVersions());
      report.push("");
      report.push("[GITHUB CFG]");
      report.push(...ghcfgReport());
      report.push("");
      report.push("[MOTHER BUNDLE]");
      report.push(...bundleReport());
      report.push("");
      report.push("[VFS]");
      report.push(...vfsReport());
      report.push("");
      report.push("[STORAGE KEYS]");
      report.push(...storageKeysReport());
      report.push("");
      report.push("[WHERE IS WHAT]");
      report.push(...quickMapHint());
      report.push("");
      report.push("[HEURISTICS]");
      try {
        const mae = window.RCF_MAE;
        if (!mae) report.push("mae: ABSENT ❌ (selfupdate não disponível)");
        else if (typeof mae.updateFromGitHub !== "function") report.push("mae: present mas updateFromGitHub AUSENTE ❌");
        else report.push("mae: ok ✅");

        const gh = window.RCF_GH_SYNC;
        if (!gh) report.push("gh_sync: ABSENT ❌");
        else if (typeof gh.pull !== "function") report.push("gh_sync: pull AUSENTE ❌");
        else report.push("gh_sync: ok ✅");
      } catch {}
      return report.join("\n");
    } catch (e) {
      return `DOCTOR SCAN err: ${(e && e.message) ? e.message : String(e)}`;
    }
  }

  window.RCF_DOCTOR = {
    __v01: true,
    scan,
    scanText
  };

  log("ok", "doctor_scan.js ready ✅ (read-only)");
})();

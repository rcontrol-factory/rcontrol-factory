/* =========================================================
  RControl Factory — /app/js/core/snapshot.js (PADRÃO) — v1.0
  - Snapshot/Restore do estado local (offline)
  - iOS-safe, sem depender do Editor
  - Exporta JSON pra copiar
  API: window.RCF_SNAPSHOT
========================================================= */
(() => {
  "use strict";

  if (window.RCF_SNAPSHOT && window.RCF_SNAPSHOT.__v10) return;

  const PREFIX = "rcf:";
  const KEY_ACTIVE = PREFIX + "active";
  const KEY_APPS   = PREFIX + "apps";
  const KEY_CFG    = PREFIX + "cfg";

  const KEY_LOGS   = PREFIX + "logs";
  const KEY_POLICY = PREFIX + "policy_v2";
  const KEY_REG    = "rcf:registry:v1";

  const KEY_BUNDLE_LOCAL = PREFIX + "mother_bundle_local";
  const KEY_BUNDLE_RAW   = PREFIX + "mother_bundle_raw";
  const KEY_BUNDLE_META  = PREFIX + "mother_bundle_meta";

  function nowISO(){ try { return new Date().toISOString(); } catch { return ""; } }

  function log(level, msg, obj){
    try {
      const t = obj !== undefined ? `${msg} ${JSON.stringify(obj)}` : String(msg);
      window.RCF_LOGGER?.push?.(level, t);
    } catch {}
    try { console.log("[SNAPSHOT]", level, msg, obj ?? ""); } catch {}
  }

  function safeParse(raw, fb){
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  function rawGet(k){
    try {
      if (window.RCF_STORAGE?.rawGet) return window.RCF_STORAGE.rawGet(k, null);
    } catch {}
    try { return localStorage.getItem(k); } catch {}
    return null;
  }

  function rawSet(k, v){
    try {
      if (window.RCF_STORAGE?.rawSet) { window.RCF_STORAGE.rawSet(k, v); return true; }
    } catch {}
    try { localStorage.setItem(k, v); return true; } catch (e) {
      log("err", "rawSet fail", { key:k, msg: e?.message || String(e) });
      return false;
    }
  }

  function rawDel(k){
    try {
      if (window.RCF_STORAGE?.rawDel) { window.RCF_STORAGE.rawDel(k); return true; }
    } catch {}
    try { localStorage.removeItem(k); return true; } catch { return false; }
  }

  function detectEnv(){
    const sw = ("serviceWorker" in navigator);
    return {
      ua: (navigator.userAgent || ""),
      url: (location?.href || ""),
      standalone: !!(navigator.standalone),
      swSupported: sw,
      ts: Date.now(),
      at: nowISO(),
    };
  }

  function getBundleInfo(){
    const meta = safeParse(rawGet(KEY_BUNDLE_META), {}) || {};
    const localTxt = rawGet(KEY_BUNDLE_LOCAL) || "";
    const rawTxt = rawGet(KEY_BUNDLE_RAW) || "";
    let filesCount = meta.filesCount || 0;

    // tenta inferir se meta tá faltando
    if (!filesCount && localTxt) {
      const j = safeParse(localTxt, null);
      if (j && Array.isArray(j.files)) filesCount = j.files.length;
    }

    return {
      meta,
      hasLocal: !!String(localTxt || "").trim(),
      hasRaw: !!String(rawTxt || "").trim(),
      filesCount,
      localBytes: localTxt ? localTxt.length : 0,
      rawBytes: rawTxt ? rawTxt.length : 0,
    };
  }

  function capture(){
    const snap = {
      kind: "rcf-snapshot",
      version: "1.0",
      createdAt: nowISO(),
      env: detectEnv(),

      // estado principal da factory
      state: {
        active: safeParse(rawGet(KEY_ACTIVE), {}),
        apps: safeParse(rawGet(KEY_APPS), []),
        cfg: safeParse(rawGet(KEY_CFG), {}),
      },

      // módulos auxiliares
      registry: safeParse(rawGet(KEY_REG), null),
      policy: safeParse(rawGet(KEY_POLICY), null),

      // mãe
      mother: getBundleInfo(),

      // logs (opcional)
      logs: {
        count: (safeParse(rawGet(KEY_LOGS), []) || []).length,
      },
    };

    log("ok", "snapshot captured", {
      apps: Array.isArray(snap.state.apps) ? snap.state.apps.length : 0,
      filesCount: snap.mother.filesCount,
    });

    return snap;
  }

  function exportText(opts){
    const withLogs = !!opts?.withLogs;
    const snap = capture();

    if (withLogs) {
      snap.logs.items = safeParse(rawGet(KEY_LOGS), []) || [];
    }

    return JSON.stringify(snap, null, 2);
  }

  function restore(snapshotText, opts){
    const mode = String(opts?.mode || "safe"); // safe|force
    const snap = safeParse(String(snapshotText || ""), null);
    if (!snap || snap.kind !== "rcf-snapshot") {
      throw new Error("Snapshot inválido (kind)");
    }

    // safe: só restaura o essencial
    const keysToRestore = [
      [KEY_ACTIVE, snap.state?.active],
      [KEY_APPS,   snap.state?.apps],
      [KEY_CFG,    snap.state?.cfg],
      [KEY_REG,    snap.registry],
      [KEY_POLICY, snap.policy],
    ];

    // mother (opcional)
    if (mode === "force" && snap.mother) {
      // se você quiser mesmo restaurar mãe, precisa do texto completo,
      // mas este snapshot não carrega por padrão (pra não ficar gigante).
      // aqui só restaura meta se existir.
      if (snap.mother.meta) keysToRestore.push([KEY_BUNDLE_META, snap.mother.meta]);
    }

    let ok = 0, fail = 0;
    for (const [k, v] of keysToRestore) {
      if (v === undefined) continue;
      const txt = (typeof v === "string") ? v : JSON.stringify(v);
      const r = rawSet(k, txt);
      if (r) ok++; else fail++;
    }

    log("ok", "snapshot restored", { ok, fail, mode });
    return { ok: fail === 0, wrote: ok, failed: fail, mode };
  }

  function clearFactoryState(){
    // NÃO apaga tudo do localStorage — só o conjunto conhecido da factory
    const keys = [
      KEY_ACTIVE, KEY_APPS, KEY_CFG,
      KEY_REG, KEY_POLICY,
      KEY_BUNDLE_LOCAL, KEY_BUNDLE_RAW, KEY_BUNDLE_META,
    ];

    let ok = 0;
    for (const k of keys) if (rawDel(k)) ok++;
    log("warn", "factory state cleared", { removed: ok });
    return { ok: true, removed: ok };
  }

  window.RCF_SNAPSHOT = {
    __v10: true,
    capture,
    exportText,     // exportText({withLogs:true})
    restore,        // restore(text, {mode:"safe"|"force"})
    clearFactoryState,
  };

  log("ok", "core/snapshot.js ready ✅ (v1.0)");
})();

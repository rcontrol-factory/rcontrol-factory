/* =========================================================
  RControl Factory — /app/js/core/snapshot.js (FULL) — v1.0 (PADRÃO)
  - Snapshot leve do estado (localStorage + registry/policy + bundle local)
  - Sem depender de app.js
  API: window.RCF_SNAPSHOT
========================================================= */
(() => {
  "use strict";

  if (window.RCF_SNAPSHOT && window.RCF_SNAPSHOT.__v10) return;

  const KEY = "rcf:snapshots:v1";
  const MAX = 12;

  function now(){ return new Date().toISOString(); }

  function safeParse(raw, fb){
    try { return JSON.parse(raw); } catch { return fb; }
  }

  function pickLS(keys){
    const out = {};
    for (const k of keys) {
      try {
        const v = localStorage.getItem(k);
        if (v != null) out[k] = v;
      } catch {}
    }
    return out;
  }

  function capture(meta){
    const snap = {
      id: "s_" + Date.now().toString(36),
      at: now(),
      meta: meta || {},
      ls: pickLS([
        "rcf:apps",
        "rcf:active",
        "rcf:registry:v1",
        "rcf:policy_v2",
        "rcf:mother_bundle_local",
        "rcf:mother_bundle",
        "rcf:mother_bundle_json",
        "rcf:mother_bundle_meta",
        "rcf:mother_bundle_raw"
      ])
    };
    return snap;
  }

  function loadAll(){
    const arr = safeParse(localStorage.getItem(KEY) || "[]", []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveAll(arr){
    try { localStorage.setItem(KEY, JSON.stringify(arr || [])); return true; } catch { return false; }
  }

  function push(meta){
    const arr = loadAll();
    const s = capture(meta);
    arr.unshift(s);
    while (arr.length > MAX) arr.pop();
    saveAll(arr);
    try { window.RCF_LOGGER?.push?.("ok", `snapshot saved ✅ (${s.id})`); } catch {}
    return s;
  }

  function list(){ return loadAll(); }

  window.RCF_SNAPSHOT = { __v10:true, push, list, capture };
})();

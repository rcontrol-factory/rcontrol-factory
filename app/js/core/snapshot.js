/* =========================================================
  RControl Factory — /app/js/core/snapshot.js (PADRÃO) — v1.0
  - Snapshot simples do estado (localStorage chaveadas)
  - API: window.RCF_SNAPSHOT
========================================================= */
(() => {
  "use strict";

  if (window.RCF_SNAPSHOT && window.RCF_SNAPSHOT.__v10) return;

  const KEY = "rcf:snapshots:v1";
  const MAX = 8;

  function nowISO(){ return new Date().toISOString(); }

  function safeParse(s, fb){ try { return JSON.parse(s); } catch { return fb; } }

  function loadAll(){
    return safeParse(localStorage.getItem(KEY) || "[]", []);
  }

  function saveAll(arr){
    try { localStorage.setItem(KEY, JSON.stringify(arr || [])); } catch {}
  }

  function capture(){
    const snap = {
      at: nowISO(),
      keys: {
        "rcf:apps": localStorage.getItem("rcf:apps") || null,
        "rcf:active": localStorage.getItem("rcf:active") || null,
        "rcf:registry:v1": localStorage.getItem("rcf:registry:v1") || null
      },
      note: ""
    };

    const arr = loadAll();
    arr.unshift(snap);
    while (arr.length > MAX) arr.pop();
    saveAll(arr);

    try { window.RCF_LOGGER?.push?.("ok", `snapshot saved ✅ (${arr.length}/${MAX})`); } catch {}
    return snap;
  }

  function restore(index = 0){
    const arr = loadAll();
    const snap = arr[Number(index) || 0];
    if (!snap) throw new Error("snapshot não encontrado");

    const k = snap.keys || {};
    try {
      if (k["rcf:apps"] != null) localStorage.setItem("rcf:apps", String(k["rcf:apps"]));
      if (k["rcf:active"] != null) localStorage.setItem("rcf:active", String(k["rcf:active"]));
      if (k["rcf:registry:v1"] != null) localStorage.setItem("rcf:registry:v1", String(k["rcf:registry:v1"]));
    } catch {}

    try { window.RCF_LOGGER?.push?.("ok", `snapshot restore ✅ idx=${index}`); } catch {}
    return { ok:true, restored:index, at: snap.at };
  }

  function list(){
    return loadAll().map((s, i) => ({ i, at: s.at, note: s.note || "" }));
  }

  function clear(){
    try { localStorage.removeItem(KEY); } catch {}
    return true;
  }

  window.RCF_SNAPSHOT = { __v10:true, capture, restore, list, clear };

  try { window.RCF_LOGGER?.push?.("ok", "core/snapshot.js ready ✅ (v1.0)"); } catch {}
})();

/* =========================================================
  RControl Factory — js/core/publish_queue.js (v1.0)
  Fila OFFLINE para publicação (GitHub/Cloudflare) — SEM API por enquanto.
  Objetivo:
   - Enfileirar bundles aplicados (após apply OK)
   - Ver fila / exportar fila / limpar fila
   - Depois a gente liga um "publisher" (Cloudflare Worker) para enviar.

  API: window.RCF_PUBLISH_QUEUE
    - enqueue(bundle, meta)
    - list()
    - peek()
    - pop()
    - clear()
    - exportAll()
========================================================= */

(() => {
  "use strict";

  const KEY = "rcf:publish_queue:v1";

  function nowIso(){ return new Date().toISOString(); }

  function safeParse(raw){
    try { return JSON.parse(String(raw || "")); } catch { return null; }
  }

  function load(){
    const raw = localStorage.getItem(KEY);
    const arr = safeParse(raw);
    return Array.isArray(arr) ? arr : [];
  }

  function save(arr){
    localStorage.setItem(KEY, JSON.stringify(arr || []));
  }

  function sanitizeBundle(bundle){
    // Não muta o original
    const b = (bundle && typeof bundle === "object") ? JSON.parse(JSON.stringify(bundle)) : {};
    if (!b.meta) b.meta = {};
    if (!b.meta.createdAt) b.meta.createdAt = nowIso();
    return b;
  }

  function enqueue(bundle, meta){
    const q = load();
    const item = {
      id: "q_" + Math.random().toString(16).slice(2) + "_" + Date.now(),
      at: nowIso(),
      meta: meta || {},
      bundle: sanitizeBundle(bundle),
      status: "queued"
    };
    q.unshift(item);
    save(q);
    return item;
  }

  function list(){ return load(); }
  function peek(){ const q = load(); return q[0] || null; }

  function pop(){
    const q = load();
    const it = q.shift() || null;
    save(q);
    return it;
  }

  function clear(){ save([]); return true; }

  function exportAll(){
    return {
      meta: { name:"publish-queue", version:"1.0", createdAt: nowIso() },
      items: load()
    };
  }

  window.RCF_PUBLISH_QUEUE = { enqueue, list, peek, pop, clear, exportAll };
})();

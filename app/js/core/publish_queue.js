/* =========================================================
  RControl Factory — js/core/publish_queue.js (PADRÃO) — v1.1
  Fila OFFLINE para publicação (GitHub/Cloudflare) — SEM API por enquanto.

  PATCH v1.1 (mínimo / iOS-safe):
   - Limite de fila (MAX=25) pra não estourar localStorage
   - save/load com try/catch (quota/full)
   - id mais robusto (crypto.randomUUID fallback)
   - sanitizeBundle mais leve (mantém estrutura, corta excessos opcionais)
========================================================= */

(() => {
  "use strict";

  if (window.RCF_PUBLISH_QUEUE && window.RCF_PUBLISH_QUEUE.__v11) return;

  const KEY = "rcf:publish_queue:v1";
  const MAX = 25; // ✅ não deixa crescer infinito

  function nowIso(){ return new Date().toISOString(); }

  function log(lvl, msg){
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[PUBLISH_QUEUE]", lvl, msg); } catch {}
  }

  function safeParse(raw){
    try { return JSON.parse(String(raw || "")); } catch { return null; }
  }

  function safeUUID(){
    try {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
    } catch {}
    return "q_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function load(){
    try {
      const raw = localStorage.getItem(KEY);
      const arr = safeParse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      log("err", "load fail :: " + (e?.message || e));
      return [];
    }
  }

  function save(arr){
    try {
      localStorage.setItem(KEY, JSON.stringify(arr || []));
      return true;
    } catch (e) {
      // quota / storage full
      log("err", "save fail (storage full?) :: " + (e?.message || e));
      return false;
    }
  }

  function sanitizeBundle(bundle){
    // Não muta o original. Clone leve:
    // - mantém meta/files/registryPatch se existirem
    // - evita stringify gigante em objetos estranhos
    const b = (bundle && typeof bundle === "object") ? bundle : {};
    const out = {
      meta: (b.meta && typeof b.meta === "object") ? { ...b.meta } : {},
      files: b.files ?? undefined,
      registryPatch: b.registryPatch ?? undefined,
    };
    if (!out.meta.createdAt) out.meta.createdAt = nowIso();
    return out;
  }

  function trim(q){
    if (!Array.isArray(q)) return [];
    if (q.length <= MAX) return q;
    return q.slice(0, MAX);
  }

  function enqueue(bundle, meta){
    const q = load();

    const item = {
      id: safeUUID(),
      at: nowIso(),
      meta: meta || {},
      bundle: sanitizeBundle(bundle),
      status: "queued"
    };

    q.unshift(item);
    const next = trim(q);

    const ok = save(next);
    if (!ok) {
      // tenta aliviar: mantém só 5 mais recentes e salva de novo
      const small = next.slice(0, 5);
      save(small);
      log("warn", "queue trimmed hard to 5 (storage pressure)");
    }

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
      meta: { name:"publish-queue", version:"1.1", createdAt: nowIso() },
      items: load()
    };
  }

  window.RCF_PUBLISH_QUEUE = { __v11:true, enqueue, list, peek, pop, clear, exportAll };

  log("ok", "publish_queue.js ready ✅ (v1.1)");
})();

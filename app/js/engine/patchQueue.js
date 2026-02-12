/* patchQueue.js — fila de patches pendentes (SAFE) */

(() => {
  "use strict";

  const KEY = "rcf:patchQueue";
  const MAX = 25; // evita crescimento infinito

  function _safeParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function _emit(type, detail) {
    try {
      window.dispatchEvent(new CustomEvent("rcf:patchQueue", { detail: { type, ...detail } }));
    } catch {}
  }

  function read() {
    const q = _safeParse(localStorage.getItem(KEY) || "[]", []);
    return Array.isArray(q) ? q : [];
  }

  function write(queue) {
    const q = Array.isArray(queue) ? queue : [];
    // corta excesso
    const trimmed = q.slice(-MAX);
    try { localStorage.setItem(KEY, JSON.stringify(trimmed)); } catch {}
    _emit("write", { size: trimmed.length });
    return trimmed;
  }

  function clear() {
    write([]);
    _emit("clear", {});
  }

  function enqueue(patch) {
    const q = read();
    const item = {
      id: "p_" + Math.random().toString(16).slice(2),
      ts: Date.now(),
      kind: patch?.kind || "FILE_WRITE",
      title: patch?.title || "",
      risk: patch?.risk || "LOW",
      intent: patch?.intent || "unknown",
      dest: patch?.dest || "",
      file: patch?.file || "",
      content: patch?.content || "",
      diffPreview: patch?.diffPreview || "",
      meta: patch?.meta || {},
    };

    q.push(item);
    const saved = write(q);
    const last = saved[saved.length - 1] || item;
    _emit("enqueue", { item: last, size: saved.length });
    return last;
  }

  function peek() {
    const q = read();
    return q[q.length - 1] || null;
  }

  function pop() {
    const q = read();
    const item = q.pop() || null;
    write(q);
    _emit("pop", { item, size: q.length });
    return item;
  }

  window.RCF_PATCH_QUEUE = { read, write, enqueue, peek, pop, clear };
})();

/* patchQueue.js — fila de patches pendentes (SAFE) */

(() => {
  "use strict";

  const KEY = "rcf:patchQueue";

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  }

  function write(queue) {
    try { localStorage.setItem(KEY, JSON.stringify(queue || [])); } catch {}
  }

  function enqueue(patch) {
    const q = read();
    q.push({
      id: "p_" + Math.random().toString(16).slice(2),
      ts: Date.now(),
      ...patch
    });
    write(q);
    return q[q.length - 1];
  }

  function peek() {
    const q = read();
    return q[q.length - 1] || null;
  }

  function clear() {
    write([]);
  }

  function pop() {
    const q = read();
    const item = q.pop() || null;
    write(q);
    return item;
  }

  window.RCF_PATCH_QUEUE = { read, write, enqueue, peek, pop, clear };
})();

/* =========================================================
  RControl Factory — core/logger.js (FULL)
  - Logger único compartilhado (core + app)
  - Salva em localStorage: "rcf:logs" (array de linhas)
  - Exponibiliza window.RCF_LOGGER:
      push(level,msg), clear(), getText(), dump(), getAll()
========================================================= */

(function () {
  "use strict";

  const KEY = "rcf:logs";
  const MAX = 400;

  function safeParse(s, fb) {
    try { return JSON.parse(s); } catch { return fb; }
  }

  function getAll() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = safeParse(raw, []);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function setAll(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
  }

  function stamp() {
    try { return new Date().toLocaleString(); } catch { return new Date().toISOString(); }
  }

  function push(level, msg) {
    const line = `[${stamp()}] ${String(msg ?? "")}`;
    const logs = getAll();
    logs.push(line);
    while (logs.length > MAX) logs.shift();
    setAll(logs);

    // espelha em UI (se existir)
    const toolsBox = document.getElementById("logsBox");
    if (toolsBox) toolsBox.textContent = logs.join("\n");

    const viewBox = document.getElementById("logsOut");
    if (viewBox) viewBox.textContent = logs.join("\n");

    try { console.log("[RCF]", level || "log", msg); } catch {}
    return line;
  }

  function clear() {
    setAll([]);
    const toolsBox = document.getElementById("logsBox");
    if (toolsBox) toolsBox.textContent = "";
    const viewBox = document.getElementById("logsOut");
    if (viewBox) viewBox.textContent = "";
  }

  function getText() {
    return getAll().join("\n");
  }

  // API global
  window.RCF_LOGGER = {
    push,
    clear,
    getText,
    dump: getText,
    getAll
  };

  // log de boot (só se ainda não tiver nada, pra não “encher”)
  try {
    const existing = getAll();
    if (!existing.length) push("log", "core/logger.js pronto ✅");
  } catch {}
})();

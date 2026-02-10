/* =========================================================
  RControl Factory — core/logger.js (BASE v1.0)
  - Logger único do Core (window.RCF_LOGGER)
  - Usa localStorage chave: "rcf:logs"
  - Compatível com app.js (que já grava em rcf:logs)
========================================================= */
(function () {
  "use strict";

  const KEY = "rcf:logs";
  const MAX = 600;

  function safeText(v) {
    return (v === undefined || v === null) ? "" : String(v);
  }

  function readArr() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(safeText) : [];
    } catch {
      return [];
    }
  }

  function writeArr(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
  }

  function timeStamp() {
    try { return new Date().toLocaleString(); } catch { return new Date().toISOString(); }
  }

  const LOGGER = {
    key: KEY,
    max: MAX,

    push(level, msg) {
      const line = `[${timeStamp()}] ${safeText(msg)}`;
      const arr = readArr();
      arr.push(line);
      while (arr.length > LOGGER.max) arr.shift();
      writeArr(arr);
      try { console.log("[RCF]", level || "log", msg); } catch {}
      return line;
    },

    log(msg) { return LOGGER.push("log", msg); },
    warn(msg) { return LOGGER.push("warn", msg); },
    error(msg) { return LOGGER.push("error", msg); },

    clear() {
      writeArr([]);
      try { console.log("[RCF] logs cleared"); } catch {}
    },

    getLines() {
      return readArr();
    },

    getText() {
      return readArr().join("\n");
    },

    dump() {
      return LOGGER.getText();
    }
  };

  // Expose
  window.RCF_LOGGER = LOGGER;

  // marca que carregou
  LOGGER.log("core/logger.js carregado ✅ (BASE v1.0)");
})();

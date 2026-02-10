/* =========================================================
  RControl Factory — core/logger.js (BASE)
  - Logger único do sistema (UI + core + app)
  - Guarda em localStorage (rcf:logs)
  - Exponde window.RCF_LOGGER: push, clear, getText, dump
========================================================= */

(() => {
  "use strict";

  const PREFIX = "rcf:";
  const KEY = PREFIX + "logs";
  const MAX = 600;

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }
  function safeJsonStringify(v) {
    try { return JSON.stringify(v); } catch { return String(v); }
  }

  function readLines() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = safeJsonParse(raw, []);
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  }

  function writeLines(lines) {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {}
  }

  function formatLine(level, msg) {
    const ts = new Date().toLocaleString();
    const lvl = (level || "log").toUpperCase();
    return `[${ts}] ${lvl}: ${String(msg)}`;
  }

  function uiMirror(linesText) {
    // Drawer (Ferramentas)
    const box = document.getElementById("logsBox");
    if (box) box.textContent = linesText;

    // Tela Logs
    const out = document.getElementById("logsOut");
    if (out) out.textContent = linesText;
  }

  const RCF_LOGGER = {
    lines: [],

    push(level, msg) {
      const line = formatLine(level, msg);

      const lines = readLines();
      lines.push(line);
      while (lines.length > MAX) lines.shift();

      writeLines(lines);
      this.lines = lines;

      uiMirror(lines.join("\n"));

      // console (debug)
      try { console.log("[RCF]", line); } catch {}
      return line;
    },

    clear() {
      writeLines([]);
      this.lines = [];
      uiMirror("");
    },

    getText() {
      const lines = readLines();
      this.lines = lines;
      return lines.join("\n");
    },

    dump() {
      return this.getText();
    }
  };

  // Expor global
  window.RCF_LOGGER = RCF_LOGGER;

  // Log de boot
  RCF_LOGGER.push("log", "core/logger.js carregado ✅");
})();

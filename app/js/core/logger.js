/* =========================================================
  RControl Factory — app/js/core/logger.js (FULL)
  - Logger global (RCF_LOGGER)
  - Persiste em localStorage (rcf:logs)
  - Compatível com <script> normal
========================================================= */
(function () {
  "use strict";

  function safeStr(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "string") return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  }

  const prefix = "rcf:";
  const key = prefix + "logs";

  const Logger = {
    max: 500,
    lines: [],

    _load() {
      try {
        const raw = localStorage.getItem(key);
        const arr = raw ? JSON.parse(raw) : [];
        this.lines = Array.isArray(arr) ? arr : [];
      } catch {
        this.lines = [];
      }
    },

    _save() {
      try { localStorage.setItem(key, JSON.stringify(this.lines)); } catch {}
    },

    _format(level, msg) {
      const stamp = new Date().toLocaleString();
      return `[${stamp}] ${String(level || "log").toUpperCase()}: ${msg}`;
    },

    push(level, msg) {
      const line = this._format(level, safeStr(msg));
      this.lines.push(line);
      while (this.lines.length > this.max) this.lines.shift();
      this._save();
      try { console.log("[RCF]", line); } catch {}
      return line;
    },

    clear() {
      this.lines.length = 0;
      this._save();
    },

    getText() {
      return this.lines.join("\n");
    },

    getAll() {
      return this.lines.slice();
    }
  };

  Logger._load();
  window.RCF_LOGGER = Logger;
})();

/* FILE: /app/js/core/logger.js
   RControl Factory — Logger
   v1.1 STABLE / PATCH MÍNIMO

   Objetivo:
   - manter logger global leve e estável
   - persistir em localStorage (rcf:logs)
   - compatível com <script> clássico
   - alinhar com Factory AI / app.js / diagnostics
   - expor aliases compatíveis: items, write, dump
*/

(function (global) {
  "use strict";

  if (global.RCF_LOGGER && global.RCF_LOGGER.__v11) return;

  var STORAGE_KEY = "rcf:logs";
  var VERSION = "v1.1";

  function safeStr(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "string") return v;
    try { return JSON.stringify(v); } catch (_) {}
    try { return String(v); } catch (_) {}
    return "";
  }

  function nowLabel() {
    try { return new Date().toLocaleString(); }
    catch (_) { return ""; }
  }

  var Logger = {
    __v1: true,
    __v11: true,
    version: VERSION,
    max: 500,
    lines: [],
    items: [],

    _syncAliases: function () {
      try {
        this.items = this.lines;
      } catch (_) {}
    },

    _load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        this.lines = Array.isArray(arr) ? arr : [];
      } catch (_) {
        this.lines = [];
      }
      this._syncAliases();
    },

    _save: function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.lines));
      } catch (_) {}
    },

    _format: function (level, msg) {
      return "[" + nowLabel() + "] " + String(level || "log").toUpperCase() + ": " + safeStr(msg);
    },

    push: function (level, msg) {
      var line = this._format(level, msg);
      this.lines.push(line);

      while (this.lines.length > this.max) {
        this.lines.shift();
      }

      this._syncAliases();
      this._save();

      try { console.log("[RCF]", line); } catch (_) {}
      return line;
    },

    write: function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        parts.push(safeStr(arguments[i]));
      }
      return this.push("LOG", parts.join(" "));
    },

    clear: function () {
      this.lines.length = 0;
      this._syncAliases();
      this._save();
    },

    getText: function () {
      return this.lines.join("\n");
    },

    getAll: function () {
      return this.lines.slice();
    },

    dump: function () {
      return this.getText();
    }
  };

  Logger._load();

  global.RCF_LOGGER = Logger;

  try {
    if (typeof global.log !== "function") {
      global.log = function () {
        try {
          return Logger.write.apply(Logger, arguments);
        } catch (_) {}
      };
    }
  } catch (_) {}

  try {
    Logger.push("OK", "logger ready " + VERSION);
  } catch (_) {}

})(window);

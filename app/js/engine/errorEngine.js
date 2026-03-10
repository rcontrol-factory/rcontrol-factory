/* FILE: /app/js/engine/errorEngine.js
   RControl Factory — Error Engine
   v1.0 SAFE
   Novo arquivo

   Função:
   - centralizar captura simples de erros
   - manter buffer local de erros recentes
   - expor API segura para Doctor/Admin/AI
   - não quebrar se outros módulos não existirem
*/

(function (global) {
  "use strict";

  if (global.RCF_ERROR_ENGINE && global.RCF_ERROR_ENGINE.__v10) return;

  var VERSION = "v1.0";
  var MAX_ERRORS = 80;
  var STORAGE_KEY = "rcf:error_engine_buffer";

  function nowISO() {
    try { return new Date().toISOString(); }
    catch (_) { return ""; }
  }

  function safeJsonParse(text, fallback) {
    try { return JSON.parse(text); }
    catch (_) { return fallback; }
  }

  function safeJsonStringify(obj) {
    try { return JSON.stringify(obj); }
    catch (_) { return "[]"; }
  }

  function readBuffer() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = safeJsonParse(raw, []);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeBuffer(arr) {
    try {
      localStorage.setItem(STORAGE_KEY, safeJsonStringify(arr || []));
    } catch (_) {}
  }

  function trimBuffer(arr) {
    var out = Array.isArray(arr) ? arr.slice(0) : [];
    while (out.length > MAX_ERRORS) out.shift();
    return out;
  }

  function textOf(value) {
    try {
      if (value == null) return "";
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      if (value && typeof value.message === "string") return value.message;
      return JSON.stringify(value);
    } catch (_) {
      try { return String(value); }
      catch (_) { return ""; }
    }
  }

  function normalizeError(payload) {
    payload = payload || {};

    return {
      ts: nowISO(),
      type: String(payload.type || "runtime"),
      source: String(payload.source || "unknown"),
      message: String(payload.message || "unknown error"),
      stack: String(payload.stack || ""),
      file: String(payload.file || ""),
      line: Number(payload.line || 0),
      col: Number(payload.col || 0),
      extra: payload.extra || null
    };
  }

  function pushError(payload) {
    var entry = normalizeError(payload);
    var arr = readBuffer();
    arr.push(entry);
    arr = trimBuffer(arr);
    writeBuffer(arr);

    try {
      if (global.RCF_LOGGER && typeof global.RCF_LOGGER.push === "function") {
        global.RCF_LOGGER.push(
          "ERR",
          "[errorEngine] " + entry.message +
          (entry.file ? (" @ " + entry.file + ":" + entry.line + ":" + entry.col) : "")
        );
      }
    } catch (_) {}

    return entry;
  }

  function list() {
    return readBuffer();
  }

  function clear() {
    writeBuffer([]);
    return true;
  }

  function latest() {
    var arr = readBuffer();
    return arr.length ? arr[arr.length - 1] : null;
  }

  function summary() {
    var arr = readBuffer();
    var last = arr.length ? arr[arr.length - 1] : null;

    return {
      version: VERSION,
      total: arr.length,
      latest: last
    };
  }

  function find(pattern) {
    var q = String(pattern || "").trim().toLowerCase();
    var arr = readBuffer();

    if (!q) return arr;

    return arr.filter(function (item) {
      var blob = [
        item.type,
        item.source,
        item.message,
        item.stack,
        item.file
      ].join(" ").toLowerCase();

      return blob.indexOf(q) >= 0;
    });
  }

  function guessCause(entry) {
    if (!entry) return "Sem erro registrado.";

    var blob = [
      entry.message || "",
      entry.stack || "",
      entry.file || ""
    ].join(" ").toLowerCase();

    if (blob.indexOf("unexpected eof") >= 0) {
      return "Provável bloco aberto ou arquivo cortado.";
    }

    if (blob.indexOf("cannot find variable") >= 0 || blob.indexOf("is not defined") >= 0) {
      return "Provável dependência global ausente ou ordem de carregamento incorreta.";
    }

    if (blob.indexOf("import") >= 0 && blob.indexOf("module") >= 0) {
      return "Provável conflito entre script clássico e módulo ES.";
    }

    if (blob.indexOf("null") >= 0 && blob.indexOf("queryselector") >= 0) {
      return "Provável elemento DOM ausente no momento do bind/render.";
    }

    if (blob.indexOf("serviceworker") >= 0 || blob.indexOf("sw") >= 0) {
      return "Provável problema de registro/cache/scope do Service Worker.";
    }

    return "Causa exata não identificada; verificar mensagem, stack e arquivo.";
  }

  function buildReport() {
    var arr = readBuffer();
    var last = arr.length ? arr[arr.length - 1] : null;

    if (!last) {
      return [
        "RCF ERROR ENGINE REPORT",
        "status: sem erros registrados"
      ].join("\n");
    }

    return [
      "RCF ERROR ENGINE REPORT",
      "version: " + VERSION,
      "total: " + arr.length,
      "ts: " + (last.ts || ""),
      "type: " + (last.type || ""),
      "source: " + (last.source || ""),
      "message: " + (last.message || ""),
      "file: " + (last.file || ""),
      "line: " + (last.line || 0),
      "col: " + (last.col || 0),
      "cause: " + guessCause(last),
      "",
      "stack:",
      last.stack || "(sem stack)"
    ].join("\n");
  }

  function install() {
    if (install.__done__) return true;
    install.__done__ = true;

    try {
      global.addEventListener("error", function (ev) {
        try {
          pushError({
            type: "window.error",
            source: "window",
            message: ev && ev.message ? ev.message : "window error",
            stack: ev && ev.error && ev.error.stack ? ev.error.stack : "",
            file: ev && ev.filename ? ev.filename : "",
            line: ev && ev.lineno ? ev.lineno : 0,
            col: ev && ev.colno ? ev.colno : 0
          });
        } catch (_) {}
      });
    } catch (_) {}

    try {
      global.addEventListener("unhandledrejection", function (ev) {
        var reason = ev ? ev.reason : null;
        pushError({
          type: "unhandledrejection",
          source: "promise",
          message: textOf(reason) || "Unhandled promise rejection",
          stack: reason && reason.stack ? String(reason.stack) : "",
          extra: reason || null
        });
      });
    } catch (_) {}

    try {
      if (global.RCF_LOGGER && typeof global.RCF_LOGGER.push === "function") {
        global.RCF_LOGGER.push("OK", "errorEngine: installed ✅");
      }
    } catch (_) {}

    return true;
  }

  global.RCF_ERROR_ENGINE = {
    __v10: true,
    version: VERSION,
    install: install,
    push: pushError,
    list: list,
    clear: clear,
    latest: latest,
    summary: summary,
    find: find,
    guessCause: guessCause,
    buildReport: buildReport
  };

  try {
    install();
  } catch (_) {}

})(window);

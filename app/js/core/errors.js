/* === RCF_RANGE_START file:/app/js/core/errors.js === */
/* RCF — core/errors.js (Error Orchestrator v1.0)
   Centraliza tratamento de erros da Factory.
   API: window.RCF_ERRORS
*/

(() => {
  "use strict";

  if (window.RCF_ERRORS && window.RCF_ERRORS.__v10) return;

  const now = () => new Date().toISOString();

  function log(level, msg, extra) {
    try {
      window.RCF_LOGGER?.push?.(level, msg + (extra ? " :: " + JSON.stringify(extra) : ""));
    } catch {}
    try {
      console[level === "err" ? "error" : "log"]("[RCF_ERROR]", level, msg, extra || "");
    } catch {}
  }

  function fatal(message, details) {
    const payload = {
      type: "FATAL",
      message: String(message || "Erro fatal"),
      details: details || null,
      ts: now()
    };

    log("err", payload.message, payload.details);

    try {
      window.RCF_STABLE = false;
    } catch {}

    // tenta acionar fallback visual se existir
    try {
      if (window.Stability?.showErrorScreen) {
        window.Stability.showErrorScreen(payload.message, JSON.stringify(payload.details || {}, null, 2));
      }
    } catch {}

    return payload;
  }

  function error(message, details) {
    const payload = {
      type: "ERROR",
      message: String(message || "Erro"),
      details: details || null,
      ts: now()
    };

    log("err", payload.message, payload.details);
    return payload;
  }

  function warn(message, details) {
    const payload = {
      type: "WARN",
      message: String(message || "Aviso"),
      details: details || null,
      ts: now()
    };

    log("warn", payload.message, payload.details);
    return payload;
  }

  window.RCF_ERRORS = {
    __v10: true,
    fatal,
    error,
    warn
  };

  log("ok", "core/errors.js ready ✅ v1.0");
})();
/* === RCF_RANGE_END file:/app/js/core/errors.js === */

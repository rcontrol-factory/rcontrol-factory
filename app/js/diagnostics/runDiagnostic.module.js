(() => {
  "use strict";

  function runDiagnostic(state) {
    const issues = [];
    const s = state || {};

    // Compat: você já usa State.active.appSlug no app.js
    const activeSlug = s.activeSlug || s.active?.appSlug || null;

    if (!activeSlug) {
      issues.push({ level: "warn", code: "NO_ACTIVE_APP", msg: "Sem app ativo." });
    }

    // Se você tiver flags de UI em algum módulo no futuro, já fica pronto:
    if (s.ui?.dockEnabled) {
      issues.push({ level: "info", code: "DOCK_ON", msg: "Dock está ON." });
    }

    if (s.ui?.overlayEnabled) {
      issues.push({ level: "warn", code: "OVERLAY_POINTER", msg: "Overlay pode estar roubando clique (pointer-events)." });
    }

    // Apps: no seu app.js é array (State.apps = [])
    const appsCount = Array.isArray(s.apps) ? s.apps.length : Object.keys(s.apps || {}).length;

    return {
      mode: s.mode || s.cfg?.mode || "safe",
      apps: appsCount,
      active: activeSlug || "-",
      ua: navigator.userAgent,
      dock: s.ui?.dockEnabled ? "on" : "off",
      issues
    };
  }

  window.RCF_RUN_DIAGNOSTIC = window.RCF_RUN_DIAGNOSTIC || { runDiagnostic };
})();

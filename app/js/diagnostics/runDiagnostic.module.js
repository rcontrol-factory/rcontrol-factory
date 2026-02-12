(() => {
  "use strict";

  function safeNum(n, fb = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? x : fb;
  }

  function runDiagnostic(state) {
    const issues = [];

    // compatível com seu State atual:
    // State.active.appSlug
    const activeSlug = state?.active?.appSlug || null;

    if (!activeSlug) {
      issues.push({
        level: "warn",
        code: "NO_ACTIVE_APP",
        msg: "Sem app ativo."
      });
    }

    // Esses campos ui.* podem não existir hoje — então fica como heurística
    if (state?.ui?.dockEnabled) {
      issues.push({
        level: "info",
        code: "DOCK_ON",
        msg: "Dock está ON."
      });
    }

    if (state?.ui?.overlayEnabled) {
      issues.push({
        level: "warn",
        code: "OVERLAY_POINTER",
        msg: "Overlay pode estar roubando clique (pointer-events)."
      });
    }

    const appsCount = Array.isArray(state?.apps)
      ? state.apps.length
      : Object.keys(state?.apps || {}).length;

    return {
      mode: state?.cfg?.mode || state?.mode || "safe",
      apps: safeNum(appsCount, 0),
      active: activeSlug || "-",
      ua: navigator.userAgent,
      dock: state?.ui?.dockEnabled ? "on" : "off",
      issues
    };
  }

  // expõe em global (SEM export)
  window.RCF_RUN_DIAGNOSTIC = window.RCF_RUN_DIAGNOSTIC || runDiagnostic;

  try {
    window.RCF_LOGGER?.push?.("ok", "diagnostics/run_diagnostic.js loaded ✅");
  } catch {}
})();

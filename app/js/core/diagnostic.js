export function runDiagnostic(state) {
  const issues = [];

  if (!state.activeSlug) issues.push({ level: "warn", code: "NO_ACTIVE_APP", msg: "Sem app ativo." });

  // Exemplo: detectar dock ligado (você já mostra isso no diagnóstico)
  if (state.ui?.dockEnabled) issues.push({ level: "info", code: "DOCK_ON", msg: "Dock está ON." });

  // Exemplo: se topbar não clica (heurística): se existir overlay ligado
  if (state.ui?.overlayEnabled) issues.push({ level: "warn", code: "OVERLAY_POINTER", msg: "Overlay pode estar roubando clique (pointer-events)." });

  return {
    mode: state.mode || "private",
    apps: Object.keys(state.apps || {}).length,
    active: state.activeSlug || "-",
    ua: navigator.userAgent,
    dock: state.ui?.dockEnabled ? "on" : "off",
    issues
  };
}

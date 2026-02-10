import { makePatch } from "./patch.js";

export function autoFixSuggestion(state) {
  const diag = state.lastDiag;
  if (!diag) return null;

  // regra 1: overlay roubando clique -> sugerir CSS safe
  const hasOverlayIssue = diag.issues?.some(i => i.code === "OVERLAY_POINTER");
  if (hasOverlayIssue) {
    const file = "styles.css";
    const current = (state.apps[state.activeSlug]?.files?.[file]) ?? "";

    const inject = `
/* --- AUTO FIX: topbar clicável + overlay não rouba toque --- */
.topbar,.top-nav{position:sticky;top:0;z-index:9999;pointer-events:auto}
.overlay,.glass,.bg-blur{pointer-events:none}
.bottom-dock{z-index:2000}
.modal{z-index:10000;pointer-events:auto}
/* --- END AUTO FIX --- */
`.trim();

    const next = current.includes("AUTO FIX: topbar clicável")
      ? current
      : (current + "\n\n" + inject + "\n");

    return makePatch({
      title: "Fix: topbar clicável (z-index/pointer-events)",
      changes: [{ file, before: current, after: next }]
    });
  }

  // regra 2: sem app ativo -> sugerir criar rquotas-test
  const noActive = diag.issues?.some(i => i.code === "NO_ACTIVE_APP");
  if (noActive) {
    return {
      id: crypto.randomUUID(),
      title: "Sugestão: crie e selecione um app (ex: RQuotas)",
      createdAt: new Date().toISOString(),
      changes: [],
      meta: { hint: "Use: create RQuotas rquotas  |  select rquotas" }
    };
  }

  return null;
}

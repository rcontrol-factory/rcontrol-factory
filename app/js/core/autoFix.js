/* RControl Factory — /app/js/core/auto_fix_suggestion.js (PADRÃO) — v1.0
   - Auto-fix suggestion baseado no último diagnóstico (state.lastDiag)
   - Compatível com app.js atual (State.apps = Array, State.active.appSlug)
   - NÃO usa import/export (carrega via <script>)
*/
(() => {
  "use strict";

  if (window.RCF_AUTOFIX && window.RCF_AUTOFIX.__v10) return;

  const safeUUID = () => {
    try {
      if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch {}
    return "patch_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  };

  // tenta achar makePatch em qualquer lugar comum
  function getMakePatch() {
    const mp =
      window.makePatch ||
      window.RCF_makePatch ||
      window.RCF_PATCH?.makePatch ||
      window.RCF_PATCH?.make ||
      null;

    return (typeof mp === "function") ? mp : null;
  }

  function getActiveApp(state) {
    try {
      const slug = state?.active?.appSlug || state?.activeSlug || null;
      if (!slug) return null;

      const apps = Array.isArray(state?.apps) ? state.apps : [];
      return apps.find(a => a && a.slug === slug) || null;
    } catch {
      return null;
    }
  }

  function makePatchCompat(payload) {
    const makePatch = getMakePatch();
    if (makePatch) return makePatch(payload);

    // fallback: formato simples (caso patch.js não esteja carregado)
    return {
      id: safeUUID(),
      title: payload?.title || "Patch",
      createdAt: new Date().toISOString(),
      changes: payload?.changes || [],
      meta: payload?.meta || {}
    };
  }

  function autoFixSuggestion(state) {
    const diag = state?.lastDiag;
    if (!diag) return null;

    const issues = Array.isArray(diag.issues) ? diag.issues : [];

    // regra 1: overlay roubando clique -> sugerir CSS safe
    const hasOverlayIssue = issues.some(i => i && i.code === "OVERLAY_POINTER");
    if (hasOverlayIssue) {
      const app = getActiveApp(state);

      // se não tiver app ativo, cai pra sugestão de criar/selecionar
      if (!app) {
        return {
          id: safeUUID(),
          title: "Sugestão: crie e selecione um app (ex: RQuotas)",
          createdAt: new Date().toISOString(),
          changes: [],
          meta: { hint: "Use: create RQuotas rquotas  |  select rquotas" }
        };
      }

      const file = "styles.css";
      const files = (app.files && typeof app.files === "object") ? app.files : {};
      const current = String(files[file] ?? "");

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

      return makePatchCompat({
        title: "Fix: topbar clicável (z-index/pointer-events)",
        changes: [{ file, before: current, after: next }],
        meta: { appSlug: app.slug }
      });
    }

    // regra 2: sem app ativo -> sugerir criar rquotas-test
    const noActive = issues.some(i => i && i.code === "NO_ACTIVE_APP");
    if (noActive) {
      return {
        id: safeUUID(),
        title: "Sugestão: crie e selecione um app (ex: RQuotas)",
        createdAt: new Date().toISOString(),
        changes: [],
        meta: { hint: "Use: create RQuotas rquotas  |  select rquotas" }
      };
    }

    return null;
  }

  window.RCF_AUTOFIX = {
    __v10: true,
    autoFixSuggestion
  };

  try { window.RCF_LOGGER?.push?.("ok", "auto_fix_suggestion.js ready ✅ v1.0"); } catch {}
})();

/* RControl Factory — patchset.js (PADRÃO) — v1.0
   PATCHSET (iOS safe):
   - remove dependência de structuredClone (falha em iOS antigo)
   - fallback de crypto.randomUUID
   - API simples: makePatch / applyPatch
*/

function safeUUID() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {}
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function safeCloneApp(app) {
  const files = (app && app.files && typeof app.files === "object") ? app.files : {};
  return {
    ...(app || {}),
    files: { ...files },
  };
}

/** changes: [{ file, before, after }] */
export function makePatch({ title, changes }) {
  return {
    id: safeUUID(),
    title: String(title || "").trim() || "patch",
    createdAt: new Date().toISOString(),
    changes: Array.isArray(changes) ? changes : [],
  };
}

export function applyPatch(app, patch) {
  const next = safeCloneApp(app);

  const list = Array.isArray(patch?.changes) ? patch.changes : [];
  for (const ch of list) {
    const file = String(ch?.file || "").trim();
    if (!file) continue;

    const cur = next.files[file] ?? "";

    // segurança: se before foi informado, exige match
    if (typeof ch.before === "string" && ch.before !== cur) {
      throw new Error(`Patch mismatch em ${file} (conteúdo mudou)`);
    }

    next.files[file] = String(ch?.after ?? "");
  }

  return next;
}

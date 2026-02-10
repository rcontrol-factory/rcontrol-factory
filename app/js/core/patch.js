export function makePatch({ title, changes }) {
  // changes: [{file, before, after}]
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date().toISOString(),
    changes
  };
}

export function applyPatch(app, patch) {
  // app.files: { [name]: string }
  const next = structuredClone(app);
  for (const ch of patch.changes) {
    const cur = next.files[ch.file] ?? "";
    // segurança: se before foi informado, exige match
    if (typeof ch.before === "string" && ch.before !== cur) {
      throw new Error(`Patch mismatch em ${ch.file} (conteúdo mudou)`);
    }
    next.files[ch.file] = ch.after;
  }
  return next;
}

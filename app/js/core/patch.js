function safeUUID() {
  // crypto.randomUUID nem sempre existe
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {}
  // fallback simples (suficiente pra id local)
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function safeCloneApp(app) {
  // structuredClone pode falhar no iOS; aqui a gente clona só o necessário
  const files = (app && app.files && typeof app.files === "object") ? app.files : {};
  return {
    ...app,
    files: { ...files }
  };
}

export function makePatch({ title, changes }) {
  // changes: [{file, before, after}]
  return {
    id: safeUUID(),
    title,
    createdAt: new Date().toISOString(),
    changes
  };
}

export function applyPatch(app, patch) {
  // app.files: { [name]: string }
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

import { Storage } from "./storage.js";
import { applyPatch } from "./patch.js";
import { runDiagnostic } from "./diagnostic.js";
import { autoFixSuggestion } from "./autoFix.js";

const KEY = "rcf_state_v1";

export function loadState() {
  return Storage.getJSON(KEY, {
    mode: "private",
    apps: {},
    activeSlug: "",
    vault: {},
    pendingPatch: null,
    lastDiag: null,
    ui: { dockEnabled: true, overlayEnabled: true } // ajuste conforme seu app
  });
}

export function saveState(state) {
  Storage.setJSON(KEY, state);
  return state;
}

function normalizeSlug(s) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function ensureApp(state, slug) {
  const app = state.apps[slug];
  if (!app) throw new Error(`App "${slug}" não existe. Use: list | create NOME SLUG`);
  return app;
}

export function executeCommand(state, input) {
  const raw = (input || "").trim();
  const [cmd, ...rest] = raw.split(/\s+/);

  const out = { ok: true, text: "", state };

  try {
    switch ((cmd || "").toLowerCase()) {
      case "help":
        out.text =
`Comandos:
help
list
create NOME SLUG
select SLUG
open editor
set file NOME_ARQ
write (texto)
show
apply
diag`;
        break;

      case "list": {
        const slugs = Object.keys(state.apps);
        out.text = slugs.length ? `Apps: ${slugs.join(", ")}` : "Nenhum app ainda.";
        break;
      }

      case "create": {
        const name = rest[0];
        const slug = normalizeSlug(rest[1]);
        if (!name || !slug) throw new Error("Use: create NOME SLUG (ex: create RQuotas rquotas)");
        if (state.apps[slug]) throw new Error(`Já existe: ${slug}`);

        state.apps[slug] = {
          name,
          slug,
          createdAt: new Date().toISOString(),
          files: {
            "index.html": "<!doctype html><html><head><meta charset='utf-8'><title>"+name+"</title><link rel='stylesheet' href='styles.css'></head><body><div id='app'></div><script type='module' src='

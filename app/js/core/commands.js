/* core/commands.js
   - Auto-apply SAFE commands (Replit-like)
   - Approval only for risky/dangerous operations or sensitive files
   - Keeps pendingPatch in state for UI buttons (Aprovar/Descartar/Aplicar)
*/

export function executeCommand(inputRaw, state) {
  const out = { ok: true, text: "", patch: null };

  try {
    if (!state) throw new Error("STATE ausente.");

    // defaults
    state.settings = state.settings || {};
    state.settings.autoApplySafe = state.settings.autoApplySafe ?? true; // ON por padrão
    state.settings.requireApprovalOnError = state.settings.requireApprovalOnError ?? true;

    state.apps = state.apps || {};
    state.editor = state.editor || { currentFile: "" };
    state.pendingPatch = state.pendingPatch || null;
    state.lastError = state.lastError || null;

    const input = (inputRaw || "").trim();
    if (!input) {
      out.text = "Digite um comando. Use: help";
      return out;
    }

    // parse: command + rest
    const [cmdToken, ...restArr] = input.split(" ");
    const cmd = (cmdToken || "").toLowerCase();
    const rest = restArr.join(" ").trim();
    const args = restArr.map(s => s.trim()).filter(Boolean);

    switch (cmd) {
      case "help":
        out.text = helpText();
        return out;

      case "list":
        out.text = listApps(state);
        return out;

      case "diag":
        out.text = diag(state);
        return out;

      case "create": {
  // Aceita:
  // create NOME SLUG
  // create NOME   (gera slug automático)
  // create "Nome com espaço"   (se você quiser implementar quotes depois)

  const name = args[0];
  let slug = args[1];

  if (!name) throw new Error("Use: create NOME [SLUG]");

  // Se não passou slug, cria automático estilo Replit
  if (!slug) slug = slugify(name);

  // validações
  if (!isValidName(name) || !isValidSlug(slug)) {
    throw new Error(`Nome/slug inválidos (name: ${name}, slug: ${slug})`);
  }
  if (state.apps[slug]) throw new Error(`Já existe app com slug: ${slug}`);

  state.apps[slug] = createEmptyApp(name, slug);
  state.activeSlug = slug;

  out.text = `App criado ✅\nname: ${name}\nslug: ${slug}\nativo: ${slug}`;
  return out;
}

      case "select": {
        const slug = args[0];
        if (!slug) throw new Error("Use: select SLUG");
        if (!state.apps[slug]) throw new Error(`App não encontrado: ${slug}`);
        state.activeSlug = slug;
        out.text = `App ativo ✅: ${slug}`;
        return out;
      }

      case "open": {
        // open editor
        const what = (args[0] || "").toLowerCase();
        if (what !== "editor") throw new Error("Use: open editor");
        state.ui = state.ui || {};
        state.ui.openTab = "editor";
        out.text = "Editor aberto ✅";
        return out;
      }

      case "set": {
        // set file app.js
        const key = (args[0] || "").toLowerCase();
        const val = args.slice(1).join(" ").trim();

        if (key !== "file") throw new Error("Use: set file NOME_DO_ARQUIVO");
        if (!val) throw new Error("Use: set file app.js");

        state.editor.currentFile = val;
        out.text = `Arquivo selecionado ✅: ${val}`;
        return out;
      }

      case "show": {
        ensureActive(state);
        const app = ensureApp(state, state.activeSlug);

        const file = state.editor.currentFile;
        if (!file) throw new Error("Nenhum arquivo selecionado. Use: set file app.js");

        if (!app.files[file]) throw new Error(`Arquivo não existe no app: ${file}`);
        out.text = app.files[file];
        return out;
      }

      case "write": {
        // write <texto...>
        ensureActive(state);
        const app = ensureApp(state, state.activeSlug);

        const file = state.editor.currentFile;
        if (!file) throw new Error("Nenhum arquivo selecionado. Use: set file app.js");

        const content = rest; // tudo depois de "write"
        if (!content) throw new Error("Use: write (cole o texto depois do comando)");

        const patch = {
          title: `write ${file}`,
          type: "WRITE_FILE",
          file,
          content
        };

        const canAuto =
          state.settings.autoApplySafe &&
          commandRisk("write", [file], state) === "SAFE" &&
          fileRisk(file) === "SAFE";

        if (canAuto) {
          state.apps[state.activeSlug] = applyPatch(app, patch);
          out.text = `Aplicado automaticamente ✅ (${file})`;
        } else {
          state.pendingPatch = patch;
          out.text = `Patch pronto ⚠️ (precisa aprovar): ${file}\nUse: apply`;
        }
        return out;
      }

      case "apply": {
        ensureActive(state);
        const app = ensureApp(state, state.activeSlug);

        if (!state.pendingPatch) {
          out.text = "Nenhum patch pendente.";
          return out;
        }

        state.apps[state.activeSlug] = applyPatch(app, state.pendingPatch);
        const title = state.pendingPatch.title;
        state.pendingPatch = null;

        out.text = `Patch aplicado ✅ (${title})`;
        return out;
      }

      case "discard": {
        state.pendingPatch = null;
        out.text = "Patch descartado ✅";
        return out;
      }

      default: {
        out.text = "Comando não reconhecido. Use: help";
        return out;
      }
    }
  } catch (err) {
    out.ok = false;
    out.text = (err && err.message) ? err.message : String(err);

    state.lastError = {
      message: out.text,
      at: Date.now(),
      command: inputRaw
    };

    return out;
  }
}

/* ------------------ POLICY ------------------ */

function commandRisk(cmd, args, state) {
  const c = (cmd || "").toLowerCase();

  // SEMPRE SEGUROS (não mexem em nada)
  if (["help", "list", "show", "diag"].includes(c)) return "SAFE";

  // SEGUROS (mudança pequena)
  if (["select", "set", "write", "create", "open"].includes(c)) return "SAFE";

  // ARRISCADOS / PERIGOSOS (futuros)
  if (["publish", "generator"].includes(c)) return "RISKY";
  if (["reset", "delete", "clearcache", "wipe"].includes(c)) return "DANGEROUS";

  return "RISKY";
}

function fileRisk(filePath) {
  const f = (filePath || "").toLowerCase().trim();

  // PWA / cache / segurança
  if (f === "sw.js" || f === "manifest.json") return "DANGEROUS";

  // html pode quebrar layout
  if (f === "index.html") return "RISKY";

  // normalmente ok
  if (f === "app.js" || f === "styles.css") return "SAFE";

  return "RISKY";
}

/* ------------------ APP HELPERS ------------------ */

function ensureActive(state) {
  if (!state.activeSlug) throw new Error("Sem app ativo. Use: list / select SLUG / create NOME SLUG");
}

function ensureApp(state, slug) {
  const app = state.apps[slug];
  if (!app) throw new Error(`App não encontrado: ${slug}`);
  return app;
}

function createEmptyApp(name, slug) {
  return {
    name,
    slug,
    files: {
      "index.html": defaultIndexHtml(name),
      "styles.css": defaultStylesCss(),
      "app.js": defaultAppJs(name),
      "manifest.json": defaultManifest(name),
      "sw.js": defaultSw()
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/* ------------------ PATCH ENGINE ------------------ */

function applyPatch(app, patch) {
  const cloned = deepClone(app);
  cloned.updatedAt = Date.now();

  if (!patch || !patch.type) throw new Error("Patch inválido.");

  switch (patch.type) {
    case "WRITE_FILE": {
      if (!patch.file) throw new Error("Patch WRITE_FILE sem file.");
      cloned.files[patch.file] = String(patch.content ?? "");
      return cloned;
    }
    default:
      throw new Error(`Tipo de patch não suportado: ${patch.type}`);
  }
}

/* ------------------ OUTPUT HELPERS ------------------ */

function helpText() {
  return [
    "Comandos disponíveis:",
    "  help",
    "  list",
    "  diag",
    "  create NOME SLUG",
    "  select SLUG",
    "  open editor",
    "  set file app.js",
    "  show",
    "  write SEU_TEXTO_AQUI",
    "  apply   (aplica patch pendente)",
    "  discard (descarta patch pendente)",
    "",
    "Modo Replit:",
    "- write em app.js/styles.css aplica automático ✅",
    "- write em index.html/manifest.json/sw.js pede aprovação ⚠️",
  ].join("\n");
}

function listApps(state) {
  const keys = Object.keys(state.apps || {});
  if (!keys.length) return "Nenhum app salvo ainda.";
  const active = state.activeSlug || "-";
  return `Apps (${keys.length})\nativo: ${active}\n- ` + keys.join("\n- ");
}

function diag(state) {
  const active = state.activeSlug || "-";
  const apps = Object.keys(state.apps || {}).length;
  const file = state.editor?.currentFile || "-";
  const pending = state.pendingPatch ? state.pendingPatch.title : "-";
  const err = state.lastError ? state.lastError.message : "-";

  return [
    "RCF DIAGNÓSTICO",
    `mode: ${state.mode || "private"}`,
    `apps: ${apps}`,
    `active: ${active}`,
    `file: ${file}`,
    `pendingPatch: ${pending}`,
    `lastError: ${err}`,
    `autoApplySafe: ${String(state.settings?.autoApplySafe)}`,
  ].join("\n");
}

/* ------------------ DEFAULT FILE TEMPLATES ------------------ */

function defaultIndexHtml(name) {
  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(name)}</title>
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="app">
    <h1>${escapeHtml(name)}</h1>
    <p>App base criado pela Factory.</p>
  </div>
  <script src="app.js"></script>
</body>
</html>`;
}

function defaultStylesCss() {
  return `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:24px;background:#0b1220;color:#e8eefc}
#app{max-width:900px;margin:0 auto}
h1{margin:0 0 8px 0}`;
}

function defaultAppJs(name) {
  return `console.log("App iniciado: ${escapeJs(name)}");`;
}

function defaultManifest(name) {
  return JSON.stringify({
    name,
    short_name: name,
    start_url: ".",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: []
  }, null, 2);
}

function defaultSw() {
  return `self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});`;
}

function slugify(s){
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}
function isValidSlug(s){
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(s));
}
function isValidName(s){
  return String(s).trim().length >= 2;
}


/* ------------------ UTIL ------------------ */

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(s) {
  return String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

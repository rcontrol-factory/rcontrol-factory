/* core/commands.js
 * RControl Factory - Core Commands (autônomo / estilo Replit)
 * - Parser com aspas: create "R Quotas"
 * - create sem slug: cria slug automático
 * - atalho: se digitar só um slug => vira select slug
 * - auto on/off: aplica patch automaticamente
 *
 * Estado padrão esperado:
 * state = {
 *   mode: "private",
 *   apps: { [slug]: { name, slug, files: {..}, createdAt, updatedAt } },
 *   active: "slug" | null,
 *   editor: { open: false, file: "index.html" },
 *   settings: { autoApply: false }
 * }
 */

(function (root, factory) {
  // UMD para funcionar em qualquer setup
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CoreCommands = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- Utils ----------
  function nowISO() {
    return new Date().toISOString();
  }

  function ensureState(state) {
    if (!state || typeof state !== "object") state = {};
    if (!state.mode) state.mode = "private";
    if (!state.apps) state.apps = {};
    if (!state.editor) state.editor = { open: false, file: "index.html" };
    if (!state.settings) state.settings = { autoApply: false };
    if (typeof state.settings.autoApply !== "boolean") state.settings.autoApply = false;
    if (typeof state.active === "undefined") state.active = null;
    return state;
  }

  function slugify(s) {
    return String(s)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function isValidSlug(s) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(s));
  }

  function isValidName(s) {
    return String(s).trim().length >= 2;
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Parser com aspas:
  // ex: create "R Quotas" r-quotas
  function tokenize(input) {
    const s = String(input || "").trim();
    if (!s) return [];
    const out = [];
    let cur = "";
    let q = null; // " ou '
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === q) {
          q = null;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"' || ch === "'") {
          q = ch;
        } else if (/\s/.test(ch)) {
          if (cur) out.push(cur), (cur = "");
        } else {
          cur += ch;
        }
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  function defaultFiles(name, slug) {
    // Base mínima, você pode melhorar depois no Generator
    return {
      "index.html": `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(name)}</title>
  <link rel="manifest" href="manifest.json"/>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body>
  <main class="wrap">
    <h1>${escapeHtml(name)}</h1>
    <p>App: <b>${escapeHtml(slug)}</b></p>
    <button id="btn">Teste</button>
    <pre id="out"></pre>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
      "styles.css": `:root{color-scheme:dark}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial;background:#0b1220;color:#e7eefc}
.wrap{max-width:900px;margin:0 auto;padding:24px}
button{padding:10px 14px;border-radius:12px;border:1px solid #2c3f66;background:#122447;color:#e7eefc}
pre{background:#0a0f1c;border:1px solid #1c2a44;padding:12px;border-radius:12px;overflow:auto}
`,
      "app.js": `(()=> {
  const out = document.getElementById("out");
  const btn = document.getElementById("btn");
  btn?.addEventListener("click", ()=>{
    const msg = "OK ✅ ${escapeJs(name)} rodando!";
    if(out) out.textContent = msg;
    console.log(msg);
  });
})();`,
      "manifest.json": `{
  "name": "${escapeJson(name)}",
  "short_name": "${escapeJson(name)}",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#0b1220",
  "theme_color": "#0b1220",
  "icons": []
}
`,
      "sw.js": `self.addEventListener("install", (e)=>{ self.skipWaiting(); });
self.addEventListener("activate", (e)=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e)=>{ /* offline-first depois */ });
`
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }
  function escapeJson(s){ return String(s).replace(/\\/g,"\\\\").replace(/"/g,'\\"'); }
  function escapeJs(s){ return String(s).replace(/\\/g,"\\\\").replace(/`/g,"\\`").replace(/\$/g,"\\$"); }

  // ---------- Patch (JSON Patch simples) ----------
  function applyPatch(state, patchOps) {
    const st = deepClone(state);
    for (const op of patchOps || []) {
      const { op: kind, path, value } = op;
      const parts = String(path || "").split("/").slice(1).map(decodeURIComponent);
      if (!parts.length) continue;

      let ref = st;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (typeof ref[k] !== "object" || ref[k] === null) ref[k] = {};
        ref = ref[k];
      }
      const last = parts[parts.length - 1];

      if (kind === "add" || kind === "replace") ref[last] = value;
      else if (kind === "remove") delete ref[last];
    }
    return st;
  }

  // ---------- Engine ----------
  function run(input, env) {
    // env esperado:
    // { state, saveState(nextState), onOpenEditor(bool), onSetEditorFile(file), onSetActiveSlug(slug) }
    env = env || {};
    const out = { ok: true, text: "", patch: [], autoApply: false };

    let state = ensureState(env.state || {});
    const tokens = tokenize(input);
    const raw = String(input || "").trim();

    // Atalho: se digitou só um slug existente => select
    if (tokens.length === 1 && isValidSlug(tokens[0]) && state.apps[tokens[0]]) {
      tokens.unshift("select");
    }

    // Atalho: se digitou só um nome (sem comando) e não existe como slug => ajuda
    if (tokens.length === 1 && !["help","list","diag"].includes(tokens[0])) {
      out.ok = false;
      out.text =
        `Comando não reconhecido: "${tokens[0]}".\n` +
        `Dica: para criar app use:\n  create NOME [SLUG]\n` +
        `Ex.: create RQuotas rquotas\n` +
        `Ou atalho (depois que existir): digite só o slug: rquotas`;
      return out;
    }

    const cmd = (tokens[0] || "").toLowerCase();
    const args = tokens.slice(1);

    try {
      switch (cmd) {
        case "help": {
          out.text = helpText(state);
          return out;
        }
        case "diag": {
          out.text = diagText(state);
          return out;
        }
        case "list": {
          const slugs = Object.keys(state.apps || {});
          if (!slugs.length) out.text = "Nenhum app salvo ainda.";
          else {
            const lines = slugs
              .sort()
              .map((s) => {
                const a = state.apps[s];
                const active = state.active === s ? " (ativo)" : "";
                return `- ${s}${active} — ${a?.name || ""}`;
              });
            out.text = "Apps:\n" + lines.join("\n");
          }
          return out;
        }
        case "auto": {
          const v = (args[0] || "").toLowerCase();
          const on = v === "on" || v === "1" || v === "true";
          const off = v === "off" || v === "0" || v === "false";
          if (!on && !off) throw new Error("Use: auto on | auto off");
          out.patch.push({ op: "replace", path: "/settings/autoApply", value: on });
          out.text = `AutoApply: ${on ? "ON ✅ (sem aprovar toda hora)" : "OFF"}`;
          out.autoApply = true;
          break;
        }
        case "create": {
          // Aceita: create NOME [SLUG]
          // NOME pode vir com aspas pelo tokenize()
          const name = args[0];
          let slug = args[1];

          if (!name) throw new Error("Use: create NOME [SLUG]\nEx.: create RQuotas rquotas\nOu: create \"R Quotas\"");
          if (!isValidName(name)) throw new Error("Nome inválido (mínimo 2 caracteres).");

          if (!slug) slug = slugify(name);
          if (!isValidSlug(slug)) throw new Error(`Slug inválido: ${slug}\nUse minúsculo e sem espaços. Ex.: rquotas, r-quotas`);

          if (state.apps[slug]) throw new Error(`Já existe app com slug: ${slug}`);

          const app = {
            name: String(name).trim(),
            slug,
            files: defaultFiles(name, slug),
            createdAt: nowISO(),
            updatedAt: nowISO()
          };

          out.patch.push({ op: "add", path: `/apps/${encodeURIComponent(slug)}`, value: app });
          out.patch.push({ op: "replace", path: "/active", value: slug });
          out.text = `App criado ✅\nname: ${app.name}\nslug: ${slug}\nativo: ${slug}`;
          out.autoApply = true;
          break;
        }
        case "select": {
          const slug = args[0];
          if (!slug) throw new Error("Use: select SLUG");
          if (!state.apps[slug]) throw new Error(`App não encontrado: ${slug}`);
          out.patch.push({ op: "replace", path: "/active", value: slug });
          out.text = `App ativo ✅ ${slug}`;
          out.autoApply = true;
          break;
        }
        case "open": {
          // open editor
          const what = (args[0] || "").toLowerCase();
          if (what !== "editor") throw new Error("Use: open editor");
          out.patch.push({ op: "replace", path: "/editor/open", value: true });
          out.text = "Editor: aberto ✅";
          out.autoApply = true;
          break;
        }
        case "close": {
          const what = (args[0] || "").toLowerCase();
          if (what !== "editor") throw new Error("Use: close editor");
          out.patch.push({ op: "replace", path: "/editor/open", value: false });
          out.text = "Editor: fechado ✅";
          out.autoApply = true;
          break;
        }
        case "set": {
          // set file app.js
          const what = (args[0] || "").toLowerCase();
          if (what !== "file") throw new Error("Use: set file NOME_ARQUIVO");
          const file = args[1];
          if (!file) throw new Error("Use: set file app.js");
          out.patch.push({ op: "replace", path: "/editor/file", value: file });
          out.text = `Arquivo selecionado ✅ ${file}`;
          out.autoApply = true;
          break;
        }
        case "write": {
          // write (cola texto) -> aqui o texto vem no raw depois da palavra write
          if (!state.active) throw new Error("Sem app ativo. Use: create ... ou select ...");
          const slug = state.active;
          const app = state.apps[slug];
          if (!app) throw new Error("App ativo não encontrado. Use select novamente.");
          const file = state.editor?.file || "app.js";

          const idx = raw.toLowerCase().indexOf("write");
          let text = raw.slice(idx + 5).trim(); // pega tudo após "write"
          if (!text) throw new Error("Use: write (cole o texto do arquivo)");

          // Suporte: se o usuário colar ```...``` remove cercas
          text = stripCodeFences(text);

          out.patch.push({ op: "replace", path: `/apps/${encodeURIComponent(slug)}/files/${encodeURIComponent(file)}`, value: text });
          out.patch.push({ op: "replace", path: `/apps/${encodeURIComponent(slug)}/updatedAt`, value: nowISO() });
          out.text = `Escrito ✅ ${slug}/${file} (${text.length} chars)`;
          out.autoApply = true;
          break;
        }
        case "show": {
          if (!state.active) throw new Error("Sem app ativo. Use: create ... ou select ...");
          const slug = state.active;
          const app = state.apps[slug];
          const file = state.editor?.file || "app.js";
          const txt = app?.files?.[file];
          if (typeof txt !== "string") throw new Error(`Arquivo não existe: ${file}`);
          out.text = `--- ${slug}/${file} ---\n` + txt;
          return out;
        }
        case "apply": {
          // força aplicar patch pendente (no seu UI, pode não usar)
          out.text = "apply ✅ (se houver patch pendente, ele será aplicado)";
          out.autoApply = true;
          break;
        }
        default: {
          out.ok = false;
          out.text = `Comando não reconhecido. Use: help\nRecebido: ${cmd}`;
          return out;
        }
      }

      // Se chegou aqui, tem patch para aplicar
      if (!out.patch.length) return out;

      const next = applyPatch(state, out.patch);
      // autoApply: se settings.autoApply estiver on, aplica sempre
      const shouldAuto = Boolean(next.settings?.autoApply) || Boolean(out.autoApply);

      if (shouldAuto) {
        if (typeof env.saveState === "function") env.saveState(next);
        out.text += `\n\nAutoApply ✅`;
        out.patch = []; // já aplicou
        return out;
      }

      // Se não for auto, devolve patch pro seu botão "Aprovar"
      // (seu UI deve aplicar esse patch no state)
      out.text += `\n\nPatch pronto. Clique em "Aprovar sugestão".`;
      return out;
    } catch (e) {
      out.ok = false;
      out.text = String(e && e.message ? e.message : e);
      return out;
    }
  }

  function stripCodeFences(s) {
    const t = String(s).trim();
    if (t.startsWith("```")) {
      // remove primeira linha ```lang?
      const lines = t.split("\n");
      lines.shift();
      // remove última linha ```
      if (lines.length && lines[lines.length - 1].trim().startsWith("```")) lines.pop();
      return lines.join("\n");
    }
    return t;
  }

  function helpText(state) {
    const a = state.settings?.autoApply ? "ON ✅" : "OFF";
    return (
`Comandos (Agent):
- help
- diag
- list
- auto on | auto off   (atual: ${a})
- create NOME [SLUG]
  Ex.: create RQuotas rquotas
  Ex.: create "R Quotas"   (gera slug automático)
- select SLUG
  Dica: depois que existir, você pode digitar só o slug: rquotas
- open editor
- close editor
- set file index.html|styles.css|app.js|manifest.json|sw.js
- write (cole o texto do arquivo)
- show
- apply

Fluxo rápido (estilo Replit):
1) auto on
2) create "R Quotas"
3) open editor
4) set file app.js
5) write (cola código)
`);
  }

  function diagText(state) {
    const slugs = Object.keys(state.apps || {});
    return (
`RCF DIAGNÓSTICO
mode: ${state.mode}
apps: ${slugs.length}
active: ${state.active || "-"}
editor: ${state.editor?.open ? "open" : "closed"}
file: ${state.editor?.file || "-"}
autoApply: ${state.settings?.autoApply ? "on" : "off"}`
    );
  }

  // Export público
  return {
    run,            // run(input, env)
    tokenize,       // útil p/ debug
    slugify
  };
});

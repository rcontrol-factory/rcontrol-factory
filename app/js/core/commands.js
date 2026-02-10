/**
 * core/commands.js
 * RControl Factory — Command Engine (Replit-like)
 *
 * Objetivo:
 * - Aceitar comandos formais: help, list, create, select, open editor, set file, write, show, apply
 * - Aceitar texto solto (natural) e transformar em ação útil
 * - Auto-slug e validação amigável
 * - Modo "auto" (executa ações seguras sem ficar travando em aprovação)
 *
 * Integração esperada:
 * Este módulo NÃO mexe no DOM.
 * Ele recebe um "ctx" com adaptadores (storage, fs, ui, logger)
 * e devolve um resultado padronizado.
 */

/* ----------------------------- Utilitários ----------------------------- */

function nowISO() {
  return new Date().toISOString();
}

function clampLen(s, max = 80) {
  if (!s) return "";
  s = String(s);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function normalizeSpaces(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function toSlug(input) {
  const s = String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  // slug mínimo decente
  if (!s) return "";
  if (s.length < 2) return s.padEnd(2, "0");
  return s.slice(0, 48);
}

function isValidSlug(slug) {
  return /^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/.test(slug || "");
}

function safeJsonParse(s, fallback = null) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function isProbablyCommand(text) {
  const t = normalizeSpaces(text).toLowerCase();
  const starters = [
    "help",
    "list",
    "create",
    "select",
    "open",
    "set",
    "write",
    "show",
    "apply",
    "auto",
    "diag",
    "diagnostico",
    "diagnóstico",
  ];
  return starters.some((k) => t.startsWith(k + " ") || t === k);
}

/* ------------------------- Ajuda (help) ------------------------- */

const HELP_TEXT = `
Comandos (Replit-like):
- help
- list
- create NOME [SLUG]
  Ex: create Rquotas rquotas
  Ex: create "AgroControl" agrocontrol
- select SLUG
  Ex: select rquotas
- open editor
- set file <caminho>
  Ex: set file app.js
  Ex: set file core/commands.js
- write <texto>
  (cole o texto inteiro após 'write', ou use 'write' e cole no campo)
- show
- apply

Atalhos Replit-like:
- Digitar só um nome (ex: rquotas) -> tenta selecionar; se não existir, sugere criar.
- Digitar algo tipo "criar app X" -> vira create automaticamente.
- Digitar um bloco de código -> vira write automaticamente (no arquivo atual).

Modo auto:
- auto on  -> tenta aplicar ações seguras automaticamente
- auto off -> volta ao modo com confirmação/patch

Diagnóstico:
- diag -> mostra resumo do estado (app ativo, arquivo atual, modo auto, etc)
`.trim();

/* --------------------------- Engine principal --------------------------- */

/**
 * ctx esperado (adaptadores):
 * ctx.state.get() -> retorna estado atual
 * ctx.state.set(partial) -> salva no estado
 *
 * ctx.apps.list() -> [{ name, slug, updatedAt }]
 * ctx.apps.exists(slug) -> boolean
 * ctx.apps.create({name, slug}) -> cria app
 * ctx.apps.select(slug) -> seleciona app ativo
 * ctx.apps.getActive() -> { name, slug } | null
 *
 * ctx.fs.getCurrentFile() -> string | null
 * ctx.fs.setCurrentFile(path) -> void
 * ctx.fs.read(path) -> string
 * ctx.fs.write(path, content) -> void
 *
 * ctx.patch.set(patchObj) -> salva patch pendente (para UI aprovar)
 * ctx.patch.clear()
 *
 * ctx.log.info(msg, data?)
 * ctx.log.error(msg, data?)
 *
 * Observação: se algum adaptador não existir, a engine continua "de boa",
 * devolvendo mensagens e patches para você aplicar manualmente.
 */

function defaultCtxGuards(ctx) {
  const safe = (obj, path, fallback) => {
    try {
      return path.split(".").reduce((a, k) => (a ? a[k] : undefined), obj) ?? fallback;
    } catch {
      return fallback;
    }
  };

  return {
    stateGet: () => safe(ctx, "state.get", () => ({}))(),
    stateSet: (p) => safe(ctx, "state.set", () => {}) (p),

    appsList: () => safe(ctx, "apps.list", () => [])(),
    appsExists: (slug) => safe(ctx, "apps.exists", () => false)(slug),
    appsCreate: (o) => safe(ctx, "apps.create", () => { throw new Error("apps.create não disponível"); })(o),
    appsSelect: (slug) => safe(ctx, "apps.select", () => { throw new Error("apps.select não disponível"); })(slug),
    appsGetActive: () => safe(ctx, "apps.getActive", () => null)(),

    fsGetCurrentFile: () => safe(ctx, "fs.getCurrentFile", () => null)(),
    fsSetCurrentFile: (p) => safe(ctx, "fs.setCurrentFile", () => {}) (p),
    fsRead: (p) => safe(ctx, "fs.read", () => "")(p),
    fsWrite: (p, c) => safe(ctx, "fs.write", () => { throw new Error("fs.write não disponível"); })(p, c),

    patchSet: (patch) => safe(ctx, "patch.set", () => {}) (patch),
    patchClear: () => safe(ctx, "patch.clear", () => {}) (),

    logInfo: (m, d) => safe(ctx, "log.info", () => {}) (m, d),
    logError: (m, d) => safe(ctx, "log.error", () => {}) (m, d),
  };
}

function makeResult({ ok = true, message = "", data = null, patch = null, needsApproval = false } = {}) {
  return { ok, message, data, patch, needsApproval, ts: nowISO() };
}

/**
 * Decide se uma alteração é "segura" pra auto aplicar.
 * (você pode endurecer isso depois)
 */
function isSafeAutoAction(action) {
  const safeActions = new Set([
    "HELP",
    "LIST",
    "DIAG",
    "SELECT",
    "OPEN_EDITOR",
    "SET_FILE",
    "SHOW",
  ]);
  return safeActions.has(action);
}

/* ----------------------- Parser (formal + natural) ---------------------- */

function parseInput(rawInput) {
  const input = String(rawInput ?? "");
  const trimmed = input.trim();

  // vazio
  if (!trimmed) return { action: "EMPTY" };

  // Se parece um bloco de código (muitas linhas / contém { } ; / function / import)
  const lines = trimmed.split("\n");
  const looksLikeCode =
    lines.length >= 3 ||
    /(^|\s)(function|const|let|var|import|export|class)\s/.test(trimmed) ||
    /[{};]{2,}/.test(trimmed) ||
    trimmed.includes("=>") ||
    trimmed.includes("</") ||
    trimmed.includes("/*");

  // Se não é comando e parece código -> vira WRITE automático
  if (!isProbablyCommand(trimmed) && looksLikeCode) {
    return { action: "WRITE", content: trimmed, implicit: true };
  }

  const t = normalizeSpaces(trimmed);
  const lower = t.toLowerCase();

  // help
  if (lower === "help") return { action: "HELP" };

  // list
  if (lower === "list") return { action: "LIST" };

  // diag
  if (lower === "diag" || lower === "diagnostico" || lower === "diagnóstico") return { action: "DIAG" };

  // auto on/off
  if (lower === "auto on") return { action: "AUTO", value: true };
  if (lower === "auto off") return { action: "AUTO", value: false };

  // open editor
  if (lower === "open editor") return { action: "OPEN_EDITOR" };

  // show
  if (lower === "show") return { action: "SHOW" };

  // apply
  if (lower === "apply") return { action: "APPLY" };

  // set file ...
  if (lower.startsWith("set file ")) {
    const path = t.slice("set file ".length).trim();
    return { action: "SET_FILE", path };
  }

  // write ...
  if (lower === "write") {
    // UI pode colar em seguida
    return { action: "WRITE", content: "", waitingPaste: true };
  }
  if (lower.startsWith("write ")) {
    const content = trimmed.slice(trimmed.toLowerCase().indexOf("write") + 5).trimStart();
    return { action: "WRITE", content, implicit: false };
  }

  // create ...
  // Permite: create Nome slug
  // Permite: create "Nome com espaço" slug
  if (lower.startsWith("create ")) {
    const rest = trimmed.slice(7).trim();

    // tenta parse com aspas
    let name = "";
    let slug = "";

    if (rest.startsWith('"')) {
      const end = rest.indexOf('"', 1);
      if (end > 1) {
        name = rest.slice(1, end);
        slug = rest.slice(end + 1).trim();
      } else {
        name = rest.replace(/"/g, "");
      }
    } else {
      const parts = rest.split(" ");
      name = parts.shift() || "";
      slug = parts.join(" ").trim();
    }

    name = normalizeSpaces(name);
    slug = normalizeSpaces(slug);

    return { action: "CREATE", name, slug };
  }

  // select ...
  if (lower.startsWith("select ")) {
    const slug = t.slice(7).trim();
    return { action: "SELECT", slug };
  }

  // Natural language: "criar app X"
  if (lower.startsWith("criar app ")) {
    const name = t.slice(9).trim();
    return { action: "CREATE", name, slug: "" , implicit: true};
  }
  if (lower.startsWith("criar ")) {
    const name = t.slice(6).trim();
    return { action: "CREATE", name, slug: "" , implicit: true};
  }

  // Texto solto: tenta select; se não existir, sugere create
  return { action: "SOFT", text: trimmed };
}

/* ------------------------- Execução das ações -------------------------- */

function buildDiag(guards) {
  const st = guards.stateGet() || {};
  const active = guards.appsGetActive();
  const currentFile = guards.fsGetCurrentFile();
  return {
    mode: st.mode || "private",
    auto: !!st.auto,
    activeApp: active ? active.slug : null,
    currentFile: currentFile || null,
    appsCount: (guards.appsList() || []).length,
    ua: st.ua || null,
    dock: st.dock ?? null,
  };
}

function formatAppsList(apps) {
  if (!apps || !apps.length) return "Nenhum app encontrado.";
  return apps
    .slice(0, 30)
    .map((a, i) => `${i + 1}) ${a.name || a.slug} (${a.slug})`)
    .join("\n");
}

function ensureSlug(name, slugInput) {
  const slug = slugInput ? toSlug(slugInput) : toSlug(name);
  return slug;
}

function normalizeName(name) {
  return clampLen(normalizeSpaces(name), 80);
}

function makePatch({ title, description, changes }) {
  return {
    title: title || "Patch",
    description: description || "",
    changes: Array.isArray(changes) ? changes : [],
    createdAt: nowISO(),
  };
}

/**
 * Execute comando e devolve:
 * - message: texto pra UI
 * - patch: se precisa aplicar (aprovação)
 * - needsApproval: se a UI deve pedir confirmação
 */
export async function runCommand(rawInput, ctx = {}) {
  const g = defaultCtxGuards(ctx);
  const st = g.stateGet() || {};
  const auto = !!st.auto;

  const parsed = parseInput(rawInput);

  try {
    switch (parsed.action) {
      case "EMPTY":
        return makeResult({ ok: true, message: "Digite um comando. Use: help" });

      case "HELP":
        return makeResult({ ok: true, message: HELP_TEXT });

      case "LIST": {
        const apps = g.appsList();
        return makeResult({ ok: true, message: formatAppsList(apps), data: { apps } });
      }

      case "DIAG": {
        const d = buildDiag(g);
        const msg =
          `RCF DIAGNÓSTICO\n` +
          `mode: ${d.mode}\n` +
          `auto: ${d.auto ? "on" : "off"}\n` +
          `apps: ${d.appsCount}\n` +
          `active: ${d.activeApp ?? "-"}\n` +
          `file: ${d.currentFile ?? "-"}\n` +
          (d.ua ? `ua: ${d.ua}\n` : "") +
          (d.dock !== null ? `dock: ${d.dock}\n` : "");
        return makeResult({ ok: true, message: msg.trim(), data: d });
      }

      case "AUTO": {
        g.stateSet({ auto: !!parsed.value });
        return makeResult({ ok: true, message: `Modo auto: ${parsed.value ? "ON" : "OFF"}` });
      }

      case "OPEN_EDITOR": {
        // Aqui a UI pode apenas mudar de aba; engine só confirma
        return makeResult({ ok: true, message: "Abrindo Editor…" });
      }

      case "SET_FILE": {
        const path = normalizeSpaces(parsed.path || "");
        if (!path) return makeResult({ ok: false, message: "Informe o caminho do arquivo. Ex: set file app.js" });
        g.fsSetCurrentFile(path);
        g.stateSet({ currentFile: path });
        return makeResult({ ok: true, message: `Arquivo atual: ${path}`, data: { currentFile: path } });
      }

      case "SHOW": {
        const file = g.fsGetCurrentFile() || st.currentFile;
        if (!file) return makeResult({ ok: false, message: "Nenhum arquivo selecionado. Use: set file app.js" });

        const content = g.fsRead(file);
        const preview = content ? content.slice(0, 2000) : "";
        return makeResult({
          ok: true,
          message: preview ? preview : "(arquivo vazio)",
          data: { file, length: (content || "").length },
        });
      }

      case "APPLY": {
        // A UI normalmente aplica o patch pendente.
        // Aqui apenas confirmamos.
        return makeResult({ ok: true, message: "Aplicar: confirme na UI (Aprovar sugestão) se houver patch pendente." });
      }

      case "SELECT": {
        const slug = toSlug(parsed.slug);
        if (!isValidSlug(slug)) return makeResult({ ok: false, message: "Slug inválido. Ex: select rquotas" });

        if (!g.appsExists(slug)) {
          return makeResult({
            ok: false,
            message: `App "${slug}" não existe. Quer criar? Use: create Nome ${slug}`,
            data: { slug },
          });
        }

        // Seleciona
        await g.appsSelect(slug);
        g.stateSet({ activeApp: slug });
        return makeResult({ ok: true, message: `App ativo: ${slug}`, data: { slug } });
      }

      case "CREATE": {
        const name = normalizeName(parsed.name || "");
        if (!name) return makeResult({ ok: false, message: "Nome inválido. Ex: create Rquotas rquotas" });

        const slug = ensureSlug(name, parsed.slug);
        if (!isValidSlug(slug)) {
          return makeResult({
            ok: false,
            message: `Nome/slug inválidos. Tente: create "${name}" ${toSlug(name)}`,
            data: { name, slugSuggested: toSlug(name) },
          });
        }

        if (g.appsExists(slug)) {
          // Se já existe, só seleciona automaticamente
          await g.appsSelect(slug);
          g.stateSet({ activeApp: slug });
          return makeResult({ ok: true, message: `Já existe. App ativo: ${slug}`, data: { slug, existed: true } });
        }

        // CREATE é ação que mexe em estrutura, mas geralmente é segura.
        // Se auto ON, cria direto.
        // Se auto OFF, gera patch p/ aprovação.
        const doCreate = async () => {
          await g.appsCreate({ name, slug });
          await g.appsSelect(slug);
          g.stateSet({ activeApp: slug });
        };

        if (auto) {
          await doCreate();
          return makeResult({ ok: true, message: `Criado e selecionado: ${name} (${slug})`, data: { name, slug } });
        }

        const patch = makePatch({
          title: "Criar app",
          description: `Criar app "${name}" com slug "${slug}" e selecionar como ativo.`,
          changes: [{ type: "APP_CREATE", name, slug }],
        });

        g.patchSet(patch);
        return makeResult({
          ok: true,
          message: `Sugestão pronta: criar "${name}" (${slug}). Clique "Aprovar sugestão".`,
          patch,
          needsApproval: true,
        });
      }

      case "WRITE": {
        const file = g.fsGetCurrentFile() || st.currentFile || "app.js";
        const content = parsed.content || "";

        // Se não tem conteúdo e waitingPaste, a UI vai colar depois
        if (parsed.waitingPaste) {
          // apenas orienta
          return makeResult({
            ok: true,
            message: `Cole o texto do código após 'write' (ou use: write <cole aqui>). Arquivo atual: ${file}`,
            data: { file, waitingPaste: true },
          });
        }

        if (!content) {
          return makeResult({ ok: false, message: "Nada para escrever. Use: write <código>" });
        }

        // WRITE é potencialmente perigoso (substitui arquivo).
        // Se auto ON: aplica direto
        // Se auto OFF: gera patch
        const doWrite = async () => {
          g.fsWrite(file, content);
          g.stateSet({ currentFile: file });
        };

        if (auto) {
          await doWrite();
          return makeResult({
            ok: true,
            message: `Escrito em ${file} (${content.length} chars).`,
            data: { file, length: content.length, autoApplied: true },
          });
        }

        const patch = makePatch({
          title: "Escrever arquivo",
          description: `Substituir conteúdo de ${file} por novo texto (${content.length} chars).`,
          changes: [{ type: "FILE_WRITE", path: file, content }],
        });

        g.patchSet(patch);

        return makeResult({
          ok: true,
          message: `Sugestão pronta para escrever em ${file}. Clique "Aprovar sugestão".`,
          patch,
          needsApproval: true,
        });
      }

      case "SOFT": {
        // Texto solto (estilo Replit)
        const text = normalizeSpaces(parsed.text);

        // 1) Se for um slug/word só: tenta select automático, ou sugere create
        const single = text.split(" ").length === 1;
        if (single) {
          const candidate = toSlug(text);
          if (isValidSlug(candidate)) {
            if (g.appsExists(candidate)) {
              await g.appsSelect(candidate);
              g.stateSet({ activeApp: candidate });
              return makeResult({ ok: true, message: `App ativo: ${candidate}`, data: { slug: candidate } });
            } else {
              const suggestedName = text;
              const msg = `Não existe app "${candidate}". Sugestão: create "${suggestedName}" ${candidate}`;
              return makeResult({ ok: true, message: msg, data: { suggestedCreate: { name: suggestedName, slug: candidate } } });
            }
          }
        }

        // 2) Se o texto contém "create" implícito
        if (/^(app|projeto|projeto:)\s+/i.test(text)) {
          const name = text.replace(/^(app|projeto|projeto:)\s+/i, "").trim();
          return await runCommand(`create "${name}"`, ctx);
        }

        // 3) Caso geral: responde orientando e oferecendo help
        return makeResult({
          ok: false,
          message: `Comando não reconhecido. Use: help\n\nVocê digitou: "${clampLen(text, 120)}"`,
        });
      }

      default:
        return makeResult({ ok: false, message: "Comando não reconhecido. Use: help" });
    }
  } catch (err) {
    g.logError("runCommand error", { err: String(err?.message || err) });
    return makeResult({ ok: false, message: `Erro: ${String(err?.message || err)}` });
  }
}

/* --------------------------- Compat (opcional) ---------------------------
 * Se sua base antiga esperava outro nome, exporta alias.
 */
export const CoreCommands = { runCommand };
export default { runCommand };

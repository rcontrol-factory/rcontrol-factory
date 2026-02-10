/* core/commands.js
   RControl Factory — Command Router (Replit-like)
   - foco: Factory primeiro (UI + comandos + patch pipeline)
   - sem exemplos fixos de apps (ex: AgroControl)
*/
(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function nowISO() {
    try { return new Date().toISOString(); } catch { return ""; }
  }

  function slugify(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  function setStatus(text, ok = true) {
    // tenta usar status pill se existir, senão só loga
    try {
      const el = $("#statusPillText") || $("#statusText") || $(".status-pill .ok");
      if (el) el.textContent = text;
      const pill = $(".status-pill");
      if (pill) {
        pill.style.borderColor = ok ? "rgba(22,199,132,.45)" : "rgba(211,90,90,.45)";
      }
    } catch {}
  }

  function logLine(line) {
    try {
      if (window.Logger && typeof window.Logger.log === "function") {
        window.Logger.log(line);
        return;
      }
    } catch {}
    try { console.log(line); } catch {}
  }

  // ---------- UI navigation (fallback) ----------
  function openView(name) {
    // padrão: .view[data-view="agent"] etc, ou #view-agent etc
    const n = String(name || "").trim().toLowerCase();

    // 1) se tiver app.js com roteador próprio, delega
    try {
      if (window.App && typeof window.App.openView === "function") {
        window.App.openView(n);
        return true;
      }
      if (window.RCF && typeof window.RCF.openView === "function") {
        window.RCF.openView(n);
        return true;
      }
    } catch {}

    // 2) fallback DOM
    const views = $$(".view");
    if (!views.length) return false;

    let found = false;
    views.forEach(v => {
      const dv = (v.getAttribute("data-view") || "").toLowerCase();
      const id = (v.id || "").toLowerCase();
      const match =
        dv === n ||
        id === n ||
        id === `view-${n}` ||
        id.endsWith(`-${n}`);

      if (match) {
        v.classList.add("active");
        v.style.display = "block";
        found = true;
      } else {
        v.classList.remove("active");
        v.style.display = "none";
      }
    });

    // tenta marcar tab/dock ativo
    try {
      $$(".tab").forEach(t => t.classList.remove("active"));
      const t = $(`.tab[data-view="${n}"]`);
      if (t) t.classList.add("active");
    } catch {}

    return found;
  }

  // ---------- write mode state ----------
  const writeState = {
    active: false,
    buffer: "",
    targetFile: null,
  };

  function startWriteMode(targetFile) {
    writeState.active = true;
    writeState.buffer = "";
    writeState.targetFile = targetFile || null;
    return [
      "WRITE MODE: cole seu texto grande agora.",
      "Quando terminar, digite: /end",
      "Dica: se você quiser cancelar: /cancel",
    ].join("\n");
  }

  function consumeWriteMode(input) {
    const raw = String(input || "");

    // comandos internos do write mode
    if (raw.trim() === "/cancel") {
      writeState.active = false;
      writeState.buffer = "";
      writeState.targetFile = null;
      return { done: true, out: "WRITE MODE cancelado." };
    }

    if (raw.trim() === "/end") {
      const content = writeState.buffer;
      const file = writeState.targetFile;
      writeState.active = false;
      writeState.buffer = "";
      writeState.targetFile = null;
      return { done: true, out: { file, content } };
    }

    // acumula (NÃO TRUNCAR)
    writeState.buffer += raw + "\n";
    return { done: false, out: `capturando... (${writeState.buffer.length} chars)` };
  }

  // ---------- Patch helpers (se existir pipeline) ----------
  function makeFileWritePatch(file, content) {
    return {
      type: "FILE_WRITE",
      file: file || null,
      content: String(content || ""),
      ts: nowISO(),
    };
  }

  function queuePatch(patchObj) {
    try {
      if (window.Patchset && typeof window.Patchset.add === "function") {
        window.Patchset.add(patchObj);
        return true;
      }
      if (window.Patch && typeof window.Patch.queue === "function") {
        window.Patch.queue(patchObj);
        return true;
      }
      if (window.App && typeof window.App.queuePatch === "function") {
        window.App.queuePatch(patchObj);
        return true;
      }
    } catch {}
    // fallback: guarda em memória
    window.__RCF_PENDING_PATCH = patchObj;
    return true;
  }

  function applyPendingPatch() {
    try {
      if (window.Patchset && typeof window.Patchset.apply === "function") {
        return window.Patchset.apply();
      }
      if (window.Patch && typeof window.Patch.apply === "function") {
        return window.Patch.apply();
      }
      if (window.App && typeof window.App.applyPatch === "function") {
        return window.App.applyPatch();
      }
    } catch (e) {
      return { ok: false, out: String(e && e.message ? e.message : e) };
    }

    // fallback simples: se for FILE_WRITE, tenta escrever via Editor/App
    const p = window.__RCF_PENDING_PATCH;
    if (p && p.type === "FILE_WRITE") {
      try {
        if (window.App && typeof window.App.writeFile === "function") {
          window.App.writeFile(p.file, p.content);
          window.__RCF_PENDING_PATCH = null;
          return { ok: true, out: `Aplicado FILE_WRITE em ${p.file}` };
        }
      } catch (e) {
        return { ok: false, out: String(e && e.message ? e.message : e) };
      }
    }
    return { ok: false, out: "Nenhum patch pendente aplicável." };
  }

  function discardPendingPatch() {
    try {
      if (window.Patchset && typeof window.Patchset.clear === "function") {
        window.Patchset.clear();
        return { ok: true, out: "Patchset descartado." };
      }
      if (window.Patch && typeof window.Patch.clear === "function") {
        window.Patch.clear();
        return { ok: true, out: "Patch descartado." };
      }
      if (window.App && typeof window.App.discardPatch === "function") {
        window.App.discardPatch();
        return { ok: true, out: "Patch descartado." };
      }
    } catch {}
    window.__RCF_PENDING_PATCH = null;
    return { ok: true, out: "Patch pendente descartado." };
  }

  // ---------- command handlers ----------
  const HELP_TEXT =
`AGENT HELP (Replit-like)

Comandos:
- help
- list
- create NOME [SLUG]
- select SLUG
- open dashboard | open editor | open admin | open agent | open diag | open logs
- set file NOMEARQ (ex: app.js)
- write        (abre WRITE MODE para colar texto grande; finalize com /end)
- write <<< ... >>>   (modo inline)
- show (mostra app/arquivo atual)
- mode auto | mode safe
- apply (aplica patch pendente)
- discard (descarta patch pendente)

Atalhos:
- digitar só um slug existente => auto select
- diag => abre Diagnóstico
- logs => abre Logs`;

  function cmd_help() {
    return { ok: true, out: HELP_TEXT };
  }

  function cmd_open(arg) {
    const where = String(arg || "").trim().toLowerCase();
    if (!where) return { ok: false, out: "Use: open dashboard|editor|admin|agent|diag|logs" };

    const ok = openView(where);
    if (!ok) return { ok: false, out: `Não consegui abrir view: ${where}` };

    return { ok: true, out: `OK: abriu ${where}` };
  }

  function cmd_diag() {
    // abre view diag e se tiver diagnostics.js, roda dump
    openView("diag");
    try {
      if (window.Diagnostics && typeof window.Diagnostics.run === "function") {
        const r = window.Diagnostics.run();
        return { ok: true, out: typeof r === "string" ? r : JSON.stringify(r, null, 2) };
      }
    } catch {}
    return { ok: true, out: "Diagnóstico aberto. (Se não aparecer info, falta implementar Diagnostics.run)" };
  }

  function cmd_logs() {
    openView("logs");
    return { ok: true, out: "Logs abertos." };
  }

  function cmd_mode(arg) {
    const m = String(arg || "").trim().toLowerCase();
    if (m !== "auto" && m !== "safe") return { ok: false, out: "Use: mode auto | mode safe" };

    try {
      if (window.App && typeof window.App.setMode === "function") window.App.setMode(m);
      window.__RCF_MODE = m;
    } catch {
      window.__RCF_MODE = m;
    }
    return { ok: true, out: `Modo: ${m}` };
  }

  function cmd_list() {
    try {
      if (window.App && typeof window.App.listApps === "function") {
        const a = window.App.listApps();
        return { ok: true, out: typeof a === "string" ? a : JSON.stringify(a, null, 2) };
      }
      if (window.Storage && typeof window.Storage.listApps === "function") {
        const a = window.Storage.listApps();
        return { ok: true, out: typeof a === "string" ? a : JSON.stringify(a, null, 2) };
      }
    } catch (e) {
      return { ok: false, out: String(e && e.message ? e.message : e) };
    }
    return { ok: true, out: "Sem listApps disponível ainda. (OK por enquanto — Factory first.)" };
  }

  function cmd_select(arg) {
    const slug = String(arg || "").trim();
    if (!slug) return { ok: false, out: "Use: select SLUG" };
    try {
      if (window.App && typeof window.App.selectApp === "function") {
        window.App.selectApp(slug);
        return { ok: true, out: `Selecionado: ${slug}` };
      }
    } catch (e) {
      return { ok: false, out: String(e && e.message ? e.message : e) };
    }
    window.__RCF_SELECTED = slug;
    return { ok: true, out: `Selecionado (fallback): ${slug}` };
  }

  function cmd_create(args) {
    const parts = String(args || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { ok: false, out: "Use: create NOME [SLUG]" };

    const name = parts[0];
    const slug = parts[1] ? slugify(parts[1]) : slugify(name);

    if (!slug) return { ok: false, out: "Nome/slug inválidos" };

    try {
      if (window.App && typeof window.App.createApp === "function") {
        window.App.createApp({ name, slug });
        return { ok: true, out: `Criado: ${name} (${slug})` };
      }
    } catch (e) {
      return { ok: false, out: String(e && e.message ? e.message : e) };
    }

    // ainda não tem engine de create? OK — Factory first.
    return { ok: true, out: `Create registrado (sem engine ativa ainda): ${name} (${slug})` };
  }

  function cmd_setfile(arg) {
    const f = String(arg || "").trim();
    if (!f) return { ok: false, out: "Use: set file NOMEARQ (ex: app.js)" };
    try {
      if (window.App && typeof window.App.setFile === "function") {
        window.App.setFile(f);
        return { ok: true, out: `Arquivo atual: ${f}` };
      }
    } catch {}
    window.__RCF_FILE = f;
    return { ok: true, out: `Arquivo atual (fallback): ${f}` };
  }

  function cmd_show() {
    try {
      if (window.App && typeof window.App.showCurrent === "function") {
        const s = window.App.showCurrent();
        return { ok: true, out: typeof s === "string" ? s : JSON.stringify(s, null, 2) };
      }
    } catch {}
    return { ok: true, out: "Show: ainda não ligado ao Editor (ok por enquanto)." };
  }

  function cmd_write_inline(payload) {
    // write <<< ... >>>
    const m = String(payload || "");
    const start = m.indexOf("<<<");
    const end = m.lastIndexOf(">>>");

    if (start === -1 || end === -1 || end <= start + 3) {
      return { ok: false, out: "Formato: write <<< (conteúdo) >>>" };
    }

    const content = m.slice(start + 3, end).replace(/^\n/, "");
    const file = window.__RCF_FILE || null;

    const patch = makeFileWritePatch(file, content);
    queuePatch(patch);

    const mode = (window.__RCF_MODE || "safe");
    if (mode === "auto") {
      const r = applyPendingPatch();
      return { ok: !!r.ok, out: r.out || "Aplicado." };
    }
    return { ok: true, out: "Patch FILE_WRITE criado (pendente). Use: apply" };
  }

  function cmd_write_mode() {
    const file = window.__RCF_FILE || null;
    return { ok: true, out: startWriteMode(file) };
  }

  function cmd_apply() {
    const r = applyPendingPatch();
    return { ok: !!r.ok, out: r.out || "OK" };
  }

  function cmd_discard() {
    const r = discardPendingPatch();
    return r;
  }

  // ---------- parser / router ----------
  function parse(input) {
    const raw = String(input || "").trim();
    if (!raw) return { cmd: "", args: "" };

    // atalhos diretos
    const low = raw.toLowerCase();
    if (low === "diag") return { cmd: "diag", args: "" };
    if (low === "logs") return { cmd: "logs", args: "" };
    if (low === "help" || low === "?") return { cmd: "help", args: "" };

    // write inline
    if (low.startsWith("write") && raw.includes("<<<") && raw.includes(">>>")) {
      return { cmd: "write_inline", args: raw };
    }

    // comandos com espaços
    const m = raw.match(/^([a-zA-Z]+)\s*(.*)$/);
    if (!m) return { cmd: raw, args: "" };

    const cmd = m[1].toLowerCase();
    const args = (m[2] || "").trim();

    // aliases
    if (cmd === "open") return { cmd: "open", args };
    if (cmd === "mode") return { cmd: "mode", args };
    if (cmd === "create") return { cmd: "create", args };
    if (cmd === "select") return { cmd: "select", args };
    if (cmd === "set") {
      // set file X
      const mm = args.match(/^file\s+(.+)$/i);
      if (mm) return { cmd: "setfile", args: mm[1].trim() };
    }
    if (cmd === "setfile") return { cmd: "setfile", args };
    if (cmd === "write") return { cmd: "write_mode", args };
    if (cmd === "show") return { cmd: "show", args };
    if (cmd === "list") return { cmd: "list", args };
    if (cmd === "apply") return { cmd: "apply", args };
    if (cmd === "discard") return { cmd: "discard", args };

    // texto natural mínimo (factory-first, sem forçar apps)
    // ex: "abrir admin" / "abrir diag"
    if (/^(abrir|open)\s+/.test(low)) {
      const w = low.replace(/^(abrir|open)\s+/, "").trim();
      return { cmd: "open", args: w };
    }

    // fallback: comando desconhecido
    return { cmd: "unknown", args: raw };
  }

  function exec(input) {
    const line = String(input || "");

    // WRITE MODE captura TUDO
    if (writeState.active) {
      const r = consumeWriteMode(line);
      if (!r.done) return { ok: true, out: r.out };

      // terminou: cria patch FILE_WRITE
      const data = r.out;
      const file = data.file || window.__RCF_FILE || null;
      const content = data.content || "";

      const patch = makeFileWritePatch(file, content);
      queuePatch(patch);

      const mode = (window.__RCF_MODE || "safe");
      if (mode === "auto") {
        const ar = applyPendingPatch();
        return { ok: !!ar.ok, out: ar.out || "Aplicado." };
      }
      return { ok: true, out: "Patch FILE_WRITE criado (pendente). Use: apply" };
    }

    const p = parse(line);

    // log básico
    logLine(`[CMD] ${p.cmd} ${p.args ? " " + p.args : ""}`);

    switch (p.cmd) {
      case "help": return cmd_help();
      case "open": return cmd_open(p.args);
      case "diag": return cmd_diag();
      case "logs": return cmd_logs();
      case "mode": return cmd_mode(p.args);
      case "list": return cmd_list();
      case "create": return cmd_create(p.args);
      case "select": return cmd_select(p.args);
      case "setfile": return cmd_setfile(p.args);
      case "show": return cmd_show();
      case "write_inline": return cmd_write_inline(p.args);
      case "write_mode": return cmd_write_mode();
      case "apply": return cmd_apply();
      case "discard": return cmd_discard();

      default:
        return { ok: false, out: "Comando não reconhecido. Use: help" };
    }
  }

  // ---------- expose ----------
  const API = {
    exec,
    helpText: HELP_TEXT,
    slugify,
    openView,
  };

  // nomes diferentes pra compatibilidade
  window.CoreCommands = API;
  window.RCFCommands = API;
  window.Commands = API;

  // status
  setStatus("OK ✅", true);

})();

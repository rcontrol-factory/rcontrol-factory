/* core/commands.js
   RControl Factory — Command Router (Replit-like)
   - NLP simples offline (regex/intenção)
   - comandos curtos + texto natural
   - atalhos: digitar só slug -> auto select
   - auto-slug: create Nome -> slugify
   - modos: auto (aplica seguros) / safe (gera patch pendente)
   - logs + snapshot antes de aplicar
*/

(function () {
  const W = typeof window !== "undefined" ? window : globalThis;

  // =========================
  // Utils
  // =========================
  function nowISO() {
    try { return new Date().toISOString(); } catch { return "" + Date.now(); }
  }

  function slugify(input) {
    return String(input || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/--+/g, "-");
  }

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function isNonEmpty(str) {
    return typeof str === "string" && str.trim().length > 0;
  }

  // =========================
  // Optional core modules (tolerant)
  // =========================
  const Core = W.RCF_CORE || (W.RCF_CORE = {});

  const Logger = Core.logger || {
    info: (...a) => console.log("[RCF]", ...a),
    warn: (...a) => console.warn("[RCF]", ...a),
    error: (...a) => console.error("[RCF]", ...a),
  };

  const Storage = Core.storage || {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : safeJsonParse(v, v);
      } catch { return fallback; }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch { return false; }
    },
    del(key) {
      try { localStorage.removeItem(key); return true; } catch { return false; }
    }
  };

  const Snapshot = Core.snapshot || {
    take(label, state) {
      const snaps = Storage.get("rcf.snapshots", []);
      snaps.push({ at: nowISO(), label: label || "snapshot", state: state || null });
      Storage.set("rcf.snapshots", snaps.slice(-20));
      return snaps[snaps.length - 1];
    }
  };

  // Patchset: estrutura simples (pode ser substituída pelo seu patchset.js real)
  const Patchset = Core.patchset || {
    make(ops, meta) {
      return { meta: meta || {}, ops: Array.isArray(ops) ? ops : [] };
    }
  };

  // =========================
  // State
  // =========================
  const STATE_KEY = "rcf.agent.state";
  const APPS_KEY = "rcf.apps";
  const PATCH_PENDING_KEY = "rcf.patch.pending";

  function getState() {
    const s = Storage.get(STATE_KEY, null);
    return s && typeof s === "object"
      ? s
      : { mode: "safe", active: null };
  }
  function setState(next) {
    Storage.set(STATE_KEY, next);
    return next;
  }

  function getApps() {
    const apps = Storage.get(APPS_KEY, []);
    return Array.isArray(apps) ? apps : [];
  }
  function setApps(apps) {
    Storage.set(APPS_KEY, apps);
    return apps;
  }

  function findAppBySlug(slug) {
    const apps = getApps();
    const s = slugify(slug);
    return apps.find(a => a && a.slug === s) || null;
  }

  function upsertApp(app) {
    const apps = getApps();
    const idx = apps.findIndex(a => a && a.slug === app.slug);
    if (idx >= 0) apps[idx] = app;
    else apps.push(app);
    setApps(apps);
    return app;
  }

  // =========================
  // NLP simples offline
  // =========================
  function nlpParse(text) {
    const raw = String(text || "").trim();
    const t = raw.toLowerCase();

    // Natural language: "cria um app chamado AgroControl"
    let m = t.match(/cria(?:r)?\s+(?:um\s+)?app\s+(?:chamado|nomeado)\s+(.+)$/i);
    if (m && m[1]) return { intent: "create", name: raw.slice(raw.toLowerCase().indexOf(m[1])).trim() };

    // "criar app agrocontrol"
    m = t.match(/cria(?:r)?\s+app\s+(.+)$/i);
    if (m && m[1]) return { intent: "create", name: raw.slice(raw.toLowerCase().indexOf(m[1])).trim() };

    // "seleciona r-quotas" / "abrir r-quotas"
    m = t.match(/(seleciona|selecionar|select|abrir|open)\s+(.+)$/i);
    if (m && m[2]) return { intent: "select", slug: slugify(m[2]) };

    // "modo auto" / "modo safe"
    m = t.match(/(modo|mode)\s+(auto|safe)$/i);
    if (m && m[2]) return { intent: "mode", mode: m[2].toLowerCase() };

    return null;
  }

  // =========================
  // Command parsing (curto)
  // =========================
  function parseCommand(input) {
    const raw = String(input || "").trim();
    if (!raw) return { type: "empty" };

    // 1) comandos curtos
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === "help") return { type: "help" };
    if (cmd === "list") return { type: "list" };

    if (cmd === "mode") {
      const mode = (parts[1] || "").toLowerCase();
      return { type: "mode", mode };
    }

    if (cmd === "create") {
      // create NOME SLUG  | create NOME
      const rest = raw.slice(raw.indexOf(" ") + 1).trim();
      if (!rest || rest === "create") return { type: "error", message: "Use: create NOME [SLUG]" };

      // Tenta separar: se tiver 2+ tokens, último pode ser slug se tiver "-" ou já for slug-like
      const p2 = rest.split(/\s+/);
      if (p2.length >= 2) {
        const maybeSlug = slugify(p2[p2.length - 1]);
        const name = p2.slice(0, -1).join(" ").trim();
        // Se o último token era realmente um slug "bom"
        if (maybeSlug && (p2[p2.length - 1].includes("-") || maybeSlug === p2[p2.length - 1].toLowerCase())) {
          return { type: "create", name, slug: maybeSlug };
        }
      }
      return { type: "create", name: rest.trim(), slug: slugify(rest) };
    }

    if (cmd === "select") {
      const slug = slugify(parts.slice(1).join(" "));
      return { type: "select", slug };
    }

    if (cmd === "open" && parts[1] && parts[1].toLowerCase() === "editor") {
      return { type: "open_editor" };
    }

    // set file X
    if (cmd === "set" && parts[1] && parts[1].toLowerCase() === "file") {
      const file = parts.slice(2).join(" ").trim();
      return { type: "set_file", file };
    }

    // write (cola texto...)
    if (cmd === "write") {
      const text = raw.slice(raw.toLowerCase().indexOf("write") + 5).trim();
      return { type: "write", text };
    }

    if (cmd === "show") return { type: "show" };
    if (cmd === "apply") return { type: "apply" };

    // 2) NLP natural
    const nlp = nlpParse(raw);
    if (nlp) {
      if (nlp.intent === "create") return { type: "create", name: nlp.name, slug: slugify(nlp.name) };
      if (nlp.intent === "select") return { type: "select", slug: nlp.slug };
      if (nlp.intent === "mode") return { type: "mode", mode: nlp.mode };
    }

    // 3) atalho: se digitou só um slug existente -> auto select
    const asSlug = slugify(raw);
    if (asSlug && findAppBySlug(asSlug)) {
      return { type: "select", slug: asSlug, shortcut: true };
    }

    // 4) fallback
    return { type: "unknown", raw };
  }

  // =========================
  // Safety / auto apply rules
  // =========================
  function isAutoSafe(opType) {
    // Lista de operações que podem rodar em auto sem pedir apply
    return ["select", "list", "help", "mode"].includes(opType);
  }

  function buildPatchForCreate(app) {
    // patch mínimo: criar app no storage
    return Patchset.make(
      [{ op: "APP_UPSERT", app }],
      { kind: "create", createdAt: nowISO(), risk: "low" }
    );
  }

  function savePendingPatch(patch) {
    Storage.set(PATCH_PENDING_KEY, patch);
    return patch;
  }

  function getPendingPatch() {
    return Storage.get(PATCH_PENDING_KEY, null);
  }

  function clearPendingPatch() {
    Storage.del(PATCH_PENDING_KEY);
  }

  function applyPatch(patch) {
    if (!patch || !Array.isArray(patch.ops)) return { ok: false, message: "Sem patch pendente." };

    // snapshot antes de aplicar
    Snapshot.take("before_apply", {
      state: getState(),
      apps: getApps(),
      pending: patch
    });

    for (const op of patch.ops) {
      if (!op || !op.op) continue;
      if (op.op === "APP_UPSERT" && op.app) {
        upsertApp(op.app);
      }
    }

    clearPendingPatch();
    return { ok: true, message: "Patch aplicado com sucesso." };
  }

  // =========================
  // Public API
  // =========================
  function helpText() {
    const s = getState();
    return [
      "Comandos (Replit-like):",
      "help",
      "list",
      "create NOME [SLUG]     (auto-slug se não passar SLUG)",
      "select SLUG            (ou digite só o SLUG para auto-select)",
      "mode auto | safe       (auto aplica comandos seguros; safe pede apply)",
      "open editor",
      "set file ARQUIVO",
      "write (cola texto)",
      "show",
      "apply                  (aplica patch pendente do modo safe)",
      "",
      `Modo atual: ${s.mode}`,
      `App ativo: ${s.active || "-"}`,
    ].join("\n");
  }

  function run(input) {
    const state = getState();
    const cmd = parseCommand(input);

    // Resposta padrão
    const out = {
      ok: true,
      type: cmd.type,
      message: "",
      state,
      pendingPatch: getPendingPatch() || null
    };

    try {
      if (cmd.type === "empty") {
        out.ok = false;
        out.message = "Digite um comando. Use: help";
        return out;
      }

      if (cmd.type === "unknown") {
        out.ok = false;
        out.message = "Comando não reconhecido. Use: help";
        return out;
      }

      if (cmd.type === "help") {
        out.message = helpText();
        return out;
      }

      if (cmd.type === "list") {
        const apps = getApps();
        out.message = apps.length
          ? apps.map(a => `- ${a.name} (${a.slug})`).join("\n")
          : "Nenhum app ainda. Use: create NOME [SLUG]";
        return out;
      }

      if (cmd.type === "mode") {
        const m = (cmd.mode || "").toLowerCase();
        if (m !== "auto" && m !== "safe") {
          out.ok = false;
          out.message = "Use: mode auto | mode safe";
          return out;
        }
        const next = setState({ ...state, mode: m });
        out.state = next;
        out.message = `Modo definido: ${m}`;
        return out;
      }

      if (cmd.type === "select") {
        if (!cmd.slug) {
          out.ok = false;
          out.message = "Use: select SLUG";
          return out;
        }
        const app = findAppBySlug(cmd.slug);
        if (!app) {
          out.ok = false;
          out.message = `Slug não encontrado: ${cmd.slug}`;
          return out;
        }
        const next = setState({ ...state, active: app.slug });
        out.state = next;
        out.message = cmd.shortcut
          ? `Auto-select: ${app.slug} ✅`
          : `Selecionado: ${app.slug} ✅`;
        return out;
      }

      if (cmd.type === "create") {
        const name = (cmd.name || "").trim();
        const slug = slugify(cmd.slug || cmd.name);

        if (!isNonEmpty(name) || !isNonEmpty(slug)) {
          out.ok = false;
          out.message = "Nome/slug inválidos. Use: create NOME [SLUG]";
          return out;
        }

        const app = {
          name,
          slug,
          createdAt: nowISO(),
          updatedAt: nowISO(),
          files: {} // pode crescer depois
        };

        // Se já existe, só atualiza
        const existing = findAppBySlug(slug);
        if (existing) {
          app.createdAt = existing.createdAt || app.createdAt;
        }

        if (state.mode === "auto") {
          // auto: cria direto (pouco risco), log + snapshot
          Snapshot.take("before_create_auto", { state, apps: getApps(), newApp: app });
          upsertApp(app);
          const next = setState({ ...state, active: slug });
          out.state = next;
          out.message = `App criado (AUTO): ${name} (${slug}) ✅`;
          return out;
        }

        // safe: vira patch pendente
        const patch = buildPatchForCreate(app);
        savePendingPatch(patch);
        out.pendingPatch = patch;
        out.message =
          `Patch pendente (SAFE): criar app "${name}" (${slug}).\n` +
          `Clique "apply" para aplicar.`;
        return out;
      }

      if (cmd.type === "apply") {
        const patch = getPendingPatch();
        if (!patch) {
          out.ok = false;
          out.message = "Sem patch pendente.";
          return out;
        }
        const res = applyPatch(patch);
        out.ok = !!res.ok;
        out.message = res.message || (res.ok ? "Aplicado." : "Falhou.");
        // após aplicar, se patch era create, seta active se tiver só 1 op APP_UPSERT
        const op = patch.ops && patch.ops[0];
        if (op && op.op === "APP_UPSERT" && op.app && op.app.slug) {
          out.state = setState({ ...getState(), active: op.app.slug });
        } else {
          out.state = getState();
        }
        out.pendingPatch = getPendingPatch() || null;
        return out;
      }

      // Comandos avançados ainda “placeholder” (não quebram)
      if (cmd.type === "open_editor") {
        out.message = "OK: open editor (UI deve navegar/abrir o Editor).";
        return out;
      }
      if (cmd.type === "set_file") {
        out.message = `OK: set file "${cmd.file}" (a UI deve selecionar arquivo).`;
        return out;
      }
      if (cmd.type === "write") {
        out.message = `OK: write (${(cmd.text || "").length} chars) (a UI deve colar no editor).`;
        return out;
      }
      if (cmd.type === "show") {
        out.message = "OK: show (a UI deve mostrar preview/estado).";
        return out;
      }

      // fallback
      out.ok = false;
      out.message = "Comando não reconhecido. Use: help";
      return out;

    } catch (e) {
      Logger.error("run() failed", e);
      out.ok = false;
      out.message = `Erro interno: ${e && e.message ? e.message : String(e)}`;
      return out;
    }
  }

  // Expor
  Core.commands = {
    run,
    parseCommand,
    slugify,
    helpText,
    getState,
    setState,
    getApps,
    setApps,
    getPendingPatch,
    applyPatch
  };

  // Conveniência global
  W.RCF = W.RCF || {};
  W.RCF.commands = Core.commands;

})();

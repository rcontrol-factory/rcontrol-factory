/* RControl Factory — app.js (FULL)
   - Replit-like Agent Builder + Admin Self-Healing (base)
   - iOS Safari touch fix (sem clique travado)
   - Offline-friendly: sem dependências externas, storage local
   - PATCH pending + Approve/Discard
   - WRITE MODE: cola 200+ linhas sem truncar (modal) /end
*/

(() => {
  "use strict";

  // -----------------------------
  // Utils
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const nowISO = () => new Date().toISOString();

  const slugify = (str) => {
    return String(str || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const safeJsonParse = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  // -----------------------------
  // Storage (localStorage wrapper)
  // -----------------------------
  const Storage = {
    prefix: "rcf:",
    get(key, fallback) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        if (v == null) return fallback;
        return safeJsonParse(v, fallback);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
      } catch {}
    },
    del(key) {
      try { localStorage.removeItem(this.prefix + key); } catch {}
    }
  };

  // -----------------------------
  // Logger
  // -----------------------------
  const Logger = {
    bufKey: "logs",
    max: 400,
    write(...args) {
      const msg = args
        .map(a => (typeof a === "string" ? a : safeJsonStringify(a)))
        .join(" ");

      const line = `[${new Date().toLocaleString()}] ${msg}`;
      const logs = Storage.get(this.bufKey, []);
      logs.push(line);
      while (logs.length > this.max) logs.shift();
      Storage.set(this.bufKey, logs);

      // UI mirror
      const box = $("#logsBox");
      if (box) box.textContent = logs.join("\n");
      try { console.log("[RCF]", ...args); } catch {}
    },
    clear() {
      Storage.set(this.bufKey, []);
      const box = $("#logsBox");
      if (box) box.textContent = "";
    },
    getAll() {
      return Storage.get(this.bufKey, []);
    }
  };

  function safeJsonStringify(obj) {
    try { return JSON.stringify(obj); } catch { return String(obj); }
  }

  // -----------------------------
  // iOS / Touch Fix
  // -----------------------------
  function bindTap(el, fn) {
    if (!el) return;

    // pointerup is best on modern Safari, but keep touchend/click fallbacks
    let last = 0;
    const handler = (ev) => {
      const t = Date.now();
      if (ev.type === "click" && (t - last) < 350) return;
      last = t;

      // important for iOS: prevent ghost click + overlay weirdness
      if (ev.type === "touchend") ev.preventDefault();

      try { fn(ev); } catch (e) { Logger.write("tap err:", e?.message || e); }
    };

    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    el.addEventListener("pointerup", handler, { passive: true });
    el.addEventListener("touchend", handler, { passive: false });
    el.addEventListener("click", handler, { passive: true });
  }

  // catch-all: if some overlay is blocking, it will still not click;
  // we keep a diagnostic helper to detect top element at touch point.
  function diagnoseTouchOverlay(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return { ok: false, msg: "elementFromPoint vazio" };
    const cs = window.getComputedStyle(el);
    return {
      ok: true,
      tag: el.tagName,
      id: el.id || "",
      cls: el.className || "",
      z: cs.zIndex,
      pos: cs.position,
      pe: cs.pointerEvents
    };
  }

  // -----------------------------
  // State Model
  // -----------------------------
  const State = {
    cfg: Storage.get("cfg", {
      mode: "safe",       // "safe" | "auto"
      autoApplySafe: true,
      writeMode: "modal"  // modal recommended
    }),

    apps: Storage.get("apps", []),

    active: Storage.get("active", {
      appSlug: null,
      file: null,
      view: "dashboard"
    }),

    pending: Storage.get("pending", {
      patch: null,    // patchset object
      source: null    // "agent" | "admin"
    })
  };

  function saveAll() {
    Storage.set("cfg", State.cfg);
    Storage.set("apps", State.apps);
    Storage.set("active", State.active);
    Storage.set("pending", State.pending);
  }

  // -----------------------------
  // UI: Views + Drawer + Dock
  // -----------------------------
  function setStatusPill(text) {
    const el = $("#statusText");
    if (el) el.textContent = text;
  }

  function setView(name) {
    if (!name) return;

    State.active.view = name;
    saveAll();

    $$(".view").forEach(v => v.classList.remove("active"));
    $$("[data-view]").forEach(b => b.classList.remove("active"));

    const view = $(`#view-${CSS.escape(name)}`);
    if (view) view.classList.add("active");

    $$(`[data-view="${name}"]`).forEach(b => b.classList.add("active"));

    Logger.write("view:", name);
  }

  function openTools(open) {
    const d = $("#toolsDrawer");
    if (!d) return;
    if (open) d.classList.add("open");
    else d.classList.remove("open");
  }

  // -----------------------------
  // Apps / Editor
  // -----------------------------
  function getActiveApp() {
    if (!State.active.appSlug) return null;
    return State.apps.find(a => a.slug === State.active.appSlug) || null;
  }

  function setActiveApp(slug) {
    const app = State.apps.find(a => a.slug === slug);
    if (!app) return false;

    State.active.appSlug = slug;
    State.active.file = State.active.file || Object.keys(app.files || {})[0] || null;
    saveAll();

    const text = $("#activeAppText");
    if (text) text.textContent = `App ativo: ${app.name} (${app.slug}) ✅`;

    renderAppsList();
    renderFilesList();
    if (State.active.file) openFile(State.active.file);

    return true;
  }

  function ensureAppFiles(app) {
    if (!app.files) app.files = {};
    if (typeof app.files !== "object") app.files = {};
  }

  function createApp(name, slugMaybe) {
    const nameClean = String(name || "").trim();
    if (!nameClean) return { ok: false, msg: "Nome inválido" };

    let slug = slugify(slugMaybe || nameClean);
    if (!slug) return { ok: false, msg: "Slug inválido" };

    if (State.apps.some(a => a.slug === slug)) {
      return { ok: false, msg: "Slug já existe" };
    }

    const app = {
      name: nameClean,
      slug,
      createdAt: nowISO(),
      files: {
        "index.html": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nameClean}</title></head><body><h1>${nameClean}</h1><script src="app.js"></script></body></html>`,
        "styles.css": `body{font-family:system-ui;margin:0;padding:24px;background:#0b1220;color:#fff}`,
        "app.js": `console.log("${nameClean}");`
      }
    };

    State.apps.push(app);
    saveAll();
    renderAppsList();
    setActiveApp(slug);

    Logger.write("app created:", slug);
    return { ok: true, msg: `✅ App criado: ${nameClean} (${slug})` };
  }

  function renderAppsList() {
    const box = $("#appsList");
    if (!box) return;

    if (!State.apps.length) {
      box.innerHTML = `<div class="hint">Nenhum app salvo ainda.</div>`;
      return;
    }

    box.innerHTML = "";
    State.apps.forEach(app => {
      const row = document.createElement("div");
      row.className = "app-item";
      row.innerHTML = `
        <div>
          <div style="font-weight:800">${escapeHtml(app.name)}</div>
          <div class="hint">${escapeHtml(app.slug)}</div>
        </div>
        <div class="row">
          <button class="btn small" data-act="select" data-slug="${escapeAttr(app.slug)}">Selecionar</button>
          <button class="btn small" data-act="edit" data-slug="${escapeAttr(app.slug)}">Editor</button>
        </div>
      `;
      box.appendChild(row);
    });

    $$('[data-act="select"]', box).forEach(btn => {
      bindTap(btn, () => setActiveApp(btn.getAttribute("data-slug")));
    });
    $$('[data-act="edit"]', box).forEach(btn => {
      bindTap(btn, () => {
        setActiveApp(btn.getAttribute("data-slug"));
        setView("editor");
      });
    });
  }

  function renderFilesList() {
    const box = $("#filesList");
    if (!box) return;

    const app = getActiveApp();
    if (!app) {
      box.innerHTML = `<div class="hint">Selecione um app para ver arquivos.</div>`;
      return;
    }

    ensureAppFiles(app);
    const files = Object.keys(app.files);
    if (!files.length) {
      box.innerHTML = `<div class="hint">App sem arquivos.</div>`;
      return;
    }

    box.innerHTML = "";
    files.forEach(fname => {
      const item = document.createElement("div");
      item.className = "file-item" + (State.active.file === fname ? " active" : "");
      item.textContent = fname;
      bindTap(item, () => openFile(fname));
      box.appendChild(item);
    });
  }

  function openFile(fname) {
    const app = getActiveApp();
    if (!app) return false;

    ensureAppFiles(app);
    if (!(fname in app.files)) return false;

    State.active.file = fname;
    saveAll();

    const head = $("#editorHead");
    if (head) head.textContent = `Arquivo atual: ${fname}`;

    const ta = $("#fileContent");
    if (ta) ta.value = String(app.files[fname] ?? "");

    renderFilesList();
    return true;
  }

  function saveFile() {
    const app = getActiveApp();
    if (!app) return uiMsg("#editorOut", "⚠️ Sem app ativo.");

    const fname = State.active.file;
    if (!fname) return uiMsg("#editorOut", "⚠️ Sem arquivo ativo.");

    const ta = $("#fileContent");
    ensureAppFiles(app);
    app.files[fname] = ta ? String(ta.value || "") : "";

    saveAll();
    uiMsg("#editorOut", "✅ Arquivo salvo.");
    Logger.write("file saved:", app.slug, fname);
  }

  // -----------------------------
  // PATCHSET (pendente) + Apply
  // -----------------------------
  function makePatchset(source, title, ops) {
    return {
      id: "ps_" + Math.random().toString(16).slice(2),
      createdAt: nowISO(),
      source,
      title: title || "Patch",
      ops: Array.isArray(ops) ? ops : []
    };
  }

  function setPendingPatch(source, patchset) {
    State.pending.patch = patchset;
    State.pending.source = source;
    saveAll();

    if (source === "agent") {
      uiMsg("#agentOut", formatPatchset(patchset));
    } else if (source === "admin") {
      uiMsg("#adminOut", formatPatchset(patchset));
    }

    setStatusPill("Patch pendente ✅");
  }

  function clearPendingPatch() {
    State.pending.patch = null;
    State.pending.source = null;
    saveAll();
    setStatusPill("OK ✅");
  }

  function applyPatchset(patchset) {
    if (!patchset || !Array.isArray(patchset.ops)) return { ok: false, msg: "Patch inválido" };

    const resLines = [];
    for (const op of patchset.ops) {
      const r = applyOp(op);
      resLines.push(r.ok ? `✅ ${r.msg}` : `❌ ${r.msg}`);
      if (!r.ok) {
        // stop on first hard failure
        Logger.write("patch op fail:", op, r.msg);
        return { ok: false, msg: resLines.join("\n") };
      }
    }

    saveAll();
    Logger.write("patch applied:", patchset.id);
    return { ok: true, msg: resLines.join("\n") };
  }

  function applyOp(op) {
    if (!op || typeof op !== "object") return { ok: false, msg: "Op inválida" };

    const type = op.type;

    // FILE_WRITE: write into active app file (or specified app)
    if (type === "FILE_WRITE") {
      const slug = op.slug || State.active.appSlug;
      const fname = op.file || State.active.file;
      const content = String(op.content ?? "");

      if (!slug) return { ok: false, msg: "Sem app (slug) para FILE_WRITE" };
      if (!fname) return { ok: false, msg: "Sem arquivo para FILE_WRITE" };

      const app = State.apps.find(a => a.slug === slug);
      if (!app) return { ok: false, msg: `App não encontrado: ${slug}` };

      ensureAppFiles(app);
      app.files[fname] = content;

      return { ok: true, msg: `FILE_WRITE ${slug}/${fname} (${content.length} chars)` };
    }

    // APP_CREATE
    if (type === "APP_CREATE") {
      const name = op.name;
      const slug = op.slug;
      const r = createApp(name, slug);
      return r.ok ? { ok: true, msg: `APP_CREATE ${r.msg}` } : { ok: false, msg: `APP_CREATE ${r.msg}` };
    }

    // APP_SELECT
    if (type === "APP_SELECT") {
      const slug = slugify(op.slug || "");
      const ok = setActiveApp(slug);
      return ok ? { ok: true, msg: `APP_SELECT ${slug}` } : { ok: false, msg: `APP_SELECT falhou (${slug})` };
    }

    // VIEW_SET
    if (type === "VIEW_SET") {
      setView(op.view);
      return { ok: true, msg: `VIEW_SET ${op.view}` };
    }

    // CONFIG_SET
    if (type === "CONFIG_SET") {
      if (op.key) State.cfg[op.key] = op.value;
      saveAll();
      return { ok: true, msg: `CONFIG_SET ${op.key}` };
    }

    return { ok: false, msg: `Tipo de op desconhecido: ${type}` };
  }

  function formatPatchset(ps) {
    const ops = ps.ops.map((o, i) => `${i+1}) ${o.type} ${o.slug ? o.slug : ""} ${o.file ? o.file : ""}`.trim()).join("\n");
    return [
      `PATCHSET: ${ps.title}`,
      `id: ${ps.id}`,
      `source: ${ps.source}`,
      `createdAt: ${ps.createdAt}`,
      `ops:\n${ops || "(vazio)"}`
    ].join("\n");
  }

  // -----------------------------
  // Agent: Router (comandos + NLP offline)
  // -----------------------------
  const Agent = {
    help() {
      return [
        "AGENT HELP (Replit-like)",
        "",
        "Comandos:",
        "- help",
        "- list",
        "- create NOME [SLUG]",
        "- select SLUG",
        "- open editor | open dashboard | open admin | open agent",
        "- set file NOMEARQ (ex: app.js)",
        "- write   (abre WRITE MODE para colar texto grande)",
        "- write <<< ... >>>  (modo inline)",
        "- show (mostra app/arquivo atual)",
        "- mode auto | mode safe",
        "- apply (aplica patch pendente do Agent)",
        "- discard (descarta patch pendente do Agent)",
        "",
        "Atalhos:",
        "- se digitar só um slug existente => auto select",
        "- se digitar texto natural: “cria um app chamado AgroControl” => create",
      ].join("\n");
    },

    list() {
      if (!State.apps.length) return "(vazio)";
      return State.apps.map(a => `${a.slug} — ${a.name}`).join("\n");
    },

    show() {
      const app = getActiveApp();
      const file = State.active.file;
      return [
        `mode: ${State.cfg.mode}`,
        `apps: ${State.apps.length}`,
        `active app: ${app ? `${app.name} (${app.slug})` : "-"}`,
        `active file: ${file || "-"}`,
        `view: ${State.active.view}`
      ].join("\n");
    },

    // Decide auto vs safe
    commitOrPend(source, title, ops, risk = "low") {
      const ps = makePatchset(source, title, ops);

      // Auto mode only applies low risk ops; safe mode always pending
      const canAuto = (State.cfg.mode === "auto" && risk === "low");
      if (canAuto) {
        const r = applyPatchset(ps);
        return { ok: r.ok, msg: (r.ok ? "AUTO ✅\n" : "AUTO ❌\n") + r.msg };
      } else {
        setPendingPatch(source, ps);
        return { ok: true, msg: "Patch pendente. Clique em Aprovar sugestão." };
      }
    },

    parseNatural(text) {
      const t = String(text || "").trim();

      // cria um app chamado X
      let m = t.match(/cria(?:r)?\s+um\s+app\s+chamado\s+([a-z0-9 _-]+)/i);
      if (m) {
        const name = m[1].trim();
        return { intent: "create", name, slug: "" };
      }

      // cria app X
      m = t.match(/cria(?:r)?\s+app\s+([a-z0-9 _-]+)/i);
      if (m) {
        const name = m[1].trim();
        return { intent: "create", name, slug: "" };
      }

      return null;
    },

    route(cmdRaw) {
      const cmd = String(cmdRaw || "").trim();
      const out = $("#agentOut");
      const input = $("#agentCmd");

      if (!cmd) {
        if (out) out.textContent = "Comando vazio.";
        return;
      }

      // shortcut: single token slug existing => select
      if (/^[a-z0-9-]{2,}$/.test(cmd)) {
        const slug = slugify(cmd);
        if (State.apps.some(a => a.slug === slug)) {
          const r = this.commitOrPend("agent", `Select ${slug}`, [{ type: "APP_SELECT", slug }], "low");
          if (out) out.textContent = r.msg;
          return;
        }
      }

      // NLP fallback
      const nlp = this.parseNatural(cmd);
      if (nlp) {
        if (nlp.intent === "create") {
          const name = nlp.name;
          const slug = slugify(nlp.slug || name);
          const r = this.commitOrPend("agent", `Create app ${name}`, [{ type: "APP_CREATE", name, slug }], "low");
          if (out) out.textContent = r.msg;
          return;
        }
      }

      const lower = cmd.toLowerCase();

      if (lower === "help") { out && (out.textContent = this.help()); return; }
      if (lower === "list") { out && (out.textContent = this.list()); return; }
      if (lower === "show") { out && (out.textContent = this.show()); return; }

      if (lower === "mode auto") {
        const r = this.commitOrPend("agent", "Set mode auto", [{ type: "CONFIG_SET", key: "mode", value: "auto" }], "low");
        out && (out.textContent = r.msg);
        return;
      }
      if (lower === "mode safe") {
        const r = this.commitOrPend("agent", "Set mode safe", [{ type: "CONFIG_SET", key: "mode", value: "safe" }], "low");
        out && (out.textContent = r.msg);
        return;
      }

      if (lower.startsWith("open ")) {
        const target = lower.replace("open ", "").trim();
        const viewMap = {
          "editor": "editor",
          "dashboard": "dashboard",
          "admin": "admin",
          "agent": "agent",
          "settings": "settings",
          "generator": "generator",
          "new app": "newapp",
          "newapp": "newapp"
        };
        const view = viewMap[target] || target;
        const r = this.commitOrPend("agent", `Open ${view}`, [{ type: "VIEW_SET", view }], "low");
        out && (out.textContent = r.msg);
        return;
      }

      if (lower.startsWith("create ")) {
        // create NOME [SLUG]
        const parts = cmd.split(/\s+/).slice(1);
        const name = parts[0] ? String(parts[0]).trim() : "";
        const slug = parts[1] ? String(parts[1]).trim() : slugify(name);

        if (!name) { out && (out.textContent = "Nome inválido"); return; }

        const r = this.commitOrPend("agent", `Create app ${name}`, [{ type: "APP_CREATE", name, slug }], "low");
        out && (out.textContent = r.msg);
        return;
      }

      if (lower.startsWith("select ")) {
        const slug = slugify(cmd.split(/\s+/).slice(1).join(" "));
        const r = this.commitOrPend("agent", `Select ${slug}`, [{ type: "APP_SELECT", slug }], "low");
        out && (out.textContent = r.msg);
        return;
      }

      if (lower.startsWith("set file ")) {
        const fname = cmd.replace(/set file\s+/i, "").trim();
        if (!fname) { out && (out.textContent = "Arquivo inválido"); return; }

        const app = getActiveApp();
        if (!app) { out && (out.textContent = "Sem app ativo"); return; }

        ensureAppFiles(app);
        if (!(fname in app.files)) app.files[fname] = "";
        saveAll();
        openFile(fname);
        out && (out.textContent = `OK. arquivo ativo: ${fname}`);
        return;
      }

      // WRITE MODE (inline)
      if (lower.startsWith("write <<<")) {
        const end = cmd.lastIndexOf(">>>");
        if (end === -1) { out && (out.textContent = "Formato inválido. Use: write <<< ... >>>"); return; }
        const content = cmd.slice(cmd.indexOf("<<<") + 3, end);

        const app = getActiveApp();
        if (!app) { out && (out.textContent = "Sem app ativo"); return; }
        const file = State.active.file;
        if (!file) { out && (out.textContent = "Sem arquivo ativo. Use: set file ..."); return; }

        const op = { type: "FILE_WRITE", slug: app.slug, file, content };
        const r = this.commitOrPend("agent", `Write ${file}`, [op], "low");
        out && (out.textContent = r.msg);
        return;
      }

      // WRITE MODE (modal)
      if (lower === "write") {
        openWriteModal();
        out && (out.textContent = "WRITE MODE aberto. Cole o texto e finalize com /end (ou clique salvar).");
        if (input) input.value = "";
        return;
      }

      if (lower === "apply") {
        if (State.pending.patch && State.pending.source === "agent") {
          const r = applyPatchset(State.pending.patch);
          out && (out.textContent = r.msg);
          clearPendingPatch();
          // refresh editor if file write
          refreshAfterPatch();
        } else {
          out && (out.textContent = "Sem patch pendente do Agent.");
        }
        return;
      }

      if (lower === "discard") {
        if (State.pending.patch && State.pending.source === "agent") {
          clearPendingPatch();
          out && (out.textContent = "Patch descartado.");
        } else {
          out && (out.textContent = "Sem patch pendente do Agent.");
        }
        return;
      }

      out && (out.textContent = "Comando não reconhecido. Use: help");
    }
  };

  // -----------------------------
  // Admin: Self-heal base (stub)
  // -----------------------------
  const Admin = {
    diagnostics() {
      const touchHint = "Se botão não clica: provável overlay com pointer-events. Teste tocando e veja Diag.";
      const info = {
        mode: "private",
        cfg: State.cfg,
        apps: State.apps.length,
        active: State.active.appSlug || "-",
        file: State.active.file || "-",
        view: State.active.view || "-",
        ua: navigator.userAgent,
        hint: touchHint
      };
      return "RCF DIAGNÓSTICO\n" + JSON.stringify(info, null, 2);
    },

    proposeFixForTouchOverlay(sampleX = 20, sampleY = 20) {
      const d = diagnoseTouchOverlay(sampleX, sampleY);
      const ops = [
        { type: "VIEW_SET", view: State.active.view || "dashboard" }
      ];
      return makePatchset("admin", "Diagnóstico (touch overlay)", ops);
    }
  };

  // -----------------------------
  // WRITE MODE modal (/end)
  // -----------------------------
  function ensureWriteModal() {
    if ($("#rcfWriteModal")) return;

    const modal = document.createElement("div");
    modal.id = "rcfWriteModal";
    modal.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,.55);
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 14px;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      width: min(900px, 100%);
      max-height: 85vh;
      background: rgba(11,18,32,.97);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,.45);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    card.innerHTML = `
      <div style="padding:12px;border-bottom:1px solid rgba(255,255,255,.10);display:flex;gap:10px;align-items:center;justify-content:space-between">
        <div style="font-weight:800">WRITE MODE</div>
        <div style="display:flex;gap:8px">
          <button class="btn small" id="wmCancel">Cancelar</button>
          <button class="btn small ok" id="wmSave">Salvar</button>
        </div>
      </div>
      <div style="padding:12px">
        <div class="hint" style="margin-bottom:8px">
          Cole seu texto grande aqui. Finalize com <b>/end</b> numa linha, ou clique <b>Salvar</b>.
        </div>
        <textarea id="wmText" spellcheck="false" style="
          width:100%;
          min-height:48vh;
          max-height:60vh;
          resize: vertical;
          border:1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.22);
          color: rgba(255,255,255,.92);
          border-radius: 12px;
          padding: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.45;
          outline: none;
        " placeholder="Cole aqui..."></textarea>
      </div>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    const txt = $("#wmText");
    txt.addEventListener("keydown", (ev) => {
      // /end on its own line
      if (ev.key === "Enter") {
        const value = txt.value || "";
        const lastLine = value.split("\n").slice(-1)[0].trim();
        if (lastLine === "/end") {
          ev.preventDefault();
          txt.value = value.replace(/\n\/end\s*$/, "");
          writeModalSave();
        }
      }
    });

    bindTap($("#wmCancel"), () => closeWriteModal());
    bindTap($("#wmSave"), () => writeModalSave());
  }

  function openWriteModal() {
    ensureWriteModal();
    const m = $("#rcfWriteModal");
    const txt = $("#wmText");
    if (!m || !txt) return;
    txt.value = "";
    m.style.display = "flex";
    setStatusPill("WRITE MODE ✅");
    // focus
    setTimeout(() => { try { txt.focus(); } catch {} }, 50);
  }

  function closeWriteModal() {
    const m = $("#rcfWriteModal");
    if (!m) return;
    m.style.display = "none";
    setStatusPill("OK ✅");
  }

  function writeModalSave() {
    const txt = $("#wmText");
    const content = txt ? String(txt.value || "") : "";

    const app = getActiveApp();
    if (!app) {
      uiMsg("#agentOut", "❌ Sem app ativo. Selecione/crie um app.");
      closeWriteModal();
      return;
    }
    const file = State.active.file;
    if (!file) {
      uiMsg("#agentOut", "❌ Sem arquivo ativo. Use: set file ...");
      closeWriteModal();
      return;
    }

    const op = { type: "FILE_WRITE", slug: app.slug, file, content };
    const r = Agent.commitOrPend("agent", `Write ${file}`, [op], "low");
    uiMsg("#agentOut", r.msg);

    closeWriteModal();
    refreshAfterPatch();
  }

  // -----------------------------
  // UI helpers
  // -----------------------------
  function uiMsg(sel, text) {
    const el = $(sel);
    if (el) el.textContent = String(text ?? "");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function refreshAfterPatch() {
    // re-render current app/editor
    const app = getActiveApp();
    if (app) {
      renderAppsList();
      renderFilesList();
      if (State.active.file) openFile(State.active.file);
    }
  }

  // -----------------------------
  // Bind UI (buttons, tabs, dock)
  // -----------------------------
  function bindUI() {
    // Guarantee body allows taps
    document.body.style.pointerEvents = "auto";

    // data-view navigation
    $$("[data-view]").forEach(btn => bindTap(btn, () => setView(btn.getAttribute("data-view"))));

    // Tools drawer
    bindTap($("#btnOpenTools"), () => openTools(true));
    bindTap($("#btnOpenTools2"), () => openTools(true));
    bindTap($("#btnCloseTools"), () => openTools(false));

    // Logs buttons
    bindTap($("#btnClearLogs"), () => { Logger.clear(); uiMsg("#logsBox", ""); });
    bindTap($("#btnCopyLogs"), async () => {
      const txt = Logger.getAll().join("\n");
      try { await navigator.clipboard.writeText(txt); } catch {}
      setStatusPill("Logs copiados ✅");
      setTimeout(() => setStatusPill("OK ✅"), 800);
    });

    // Dashboard
    bindTap($("#btnCreateNewApp"), () => setView("newapp"));
    bindTap($("#btnOpenEditor"), () => setView("editor"));
    bindTap($("#btnExportBackup"), () => {
      // simple export (apps JSON)
      const payload = JSON.stringify({ apps: State.apps, cfg: State.cfg, active: State.active }, null, 2);
      try { navigator.clipboard.writeText(payload); } catch {}
      uiMsg("#statusHint", "Backup copiado (JSON) — (clipboard).");
      Logger.write("backup copied");
    });

    // New App
    bindTap($("#btnAutoSlug"), () => {
      const n = ($("#newAppName")?.value || "");
      const s = slugify(n);
      const inSlug = $("#newAppSlug");
      if (inSlug) inSlug.value = s;
    });

    bindTap($("#btnDoCreateApp"), () => {
      const name = ($("#newAppName")?.value || "");
      const slug = ($("#newAppSlug")?.value || "");
      const r = createApp(name, slug);
      uiMsg("#newAppOut", r.msg);
      if (r.ok) {
        setStatusPill("OK ✅");
        setView("editor");
      } else {
        setStatusPill("Nome/slug inválidos ✅");
      }
    });

    // Editor
    bindTap($("#btnSaveFile"), () => saveFile());
    bindTap($("#btnResetFile"), () => {
      const app = getActiveApp();
      if (!app || !State.active.file) return uiMsg("#editorOut", "⚠️ Selecione app e arquivo.");
      ensureAppFiles(app);
      app.files[State.active.file] = "";
      saveAll();
      openFile(State.active.file);
      uiMsg("#editorOut", "⚠️ Arquivo resetado (limpo).");
    });

    // Generator stubs
    bindTap($("#btnGenZip"), () => uiMsg("#genOut", "ZIP (stub)."));
    bindTap($("#btnGenPreview"), () => uiMsg("#genOut", "Preview (stub)."));

    // Agent
    bindTap($("#btnAgentRun"), () => Agent.route($("#agentCmd")?.value || ""));
    bindTap($("#btnAgentClear"), () => { if ($("#agentCmd")) $("#agentCmd").value = ""; uiMsg("#agentOut", "Pronto."); });

    bindTap($("#btnAgentApprove"), () => {
      if (State.pending.patch && State.pending.source === "agent") {
        const r = applyPatchset(State.pending.patch);
        uiMsg("#agentOut", r.msg);
        clearPendingPatch();
        refreshAfterPatch();
      } else {
        uiMsg("#agentOut", "Sem patch pendente do Agent.");
      }
    });

    bindTap($("#btnAgentDiscard"), () => {
      if (State.pending.patch && State.pending.source === "agent") {
        clearPendingPatch();
        uiMsg("#agentOut", "Patch descartado.");
      } else {
        uiMsg("#agentOut", "Sem patch pendente do Agent.");
      }
    });

    // Admin
    bindTap($("#btnAdminDiag"), () => uiMsg("#adminOut", Admin.diagnostics()));
    bindTap($("#btnAdminClear"), () => uiMsg("#adminOut", "Limpo."));
    bindTap($("#btnAdminApply"), () => {
      if (State.pending.patch && State.pending.source === "admin") {
        const r = applyPatchset(State.pending.patch);
        uiMsg("#adminOut", r.msg);
        clearPendingPatch();
        refreshAfterPatch();
      } else {
        uiMsg("#adminOut", "Sem patch pendente do Admin.");
      }
    });
    bindTap($("#btnAdminDiscard"), () => {
      if (State.pending.patch && State.pending.source === "admin") {
        clearPendingPatch();
        uiMsg("#adminOut", "Patch descartado.");
      } else {
        uiMsg("#adminOut", "Sem patch pendente do Admin.");
      }
    });

    // Bonus: tap on status pill runs quick touch diag (optional)
    bindTap($("#statusPill"), (ev) => {
      const x = (ev.changedTouches && ev.changedTouches[0] && ev.changedTouches[0].clientX) || 20;
      const y = (ev.changedTouches && ev.changedTouches[0] && ev.changedTouches[0].clientY) || 20;
      const d = diagnoseTouchOverlay(x, y);
      Logger.write("touch diag:", d);
    });
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function hydrateUIFromState() {
    // logs show
    const box = $("#logsBox");
    if (box) box.textContent = Logger.getAll().join("\n");

    renderAppsList();

    const app = getActiveApp();
    if (app) {
      setActiveApp(app.slug);
      if (State.active.file) openFile(State.active.file);
    } else {
      const text = $("#activeAppText");
      if (text) text.textContent = "Sem app ativo ✅";
    }

    // restore pending patch display
    if (State.pending.patch) {
      setStatusPill("Patch pendente ✅");
      if (State.pending.source === "agent") uiMsg("#agentOut", formatPatchset(State.pending.patch));
      if (State.pending.source === "admin") uiMsg("#adminOut", formatPatchset(State.pending.patch));
    } else {
      setStatusPill("OK ✅");
    }

    // set view
    setView(State.active.view || "dashboard");

    // Show current mode on agent output (small)
    if ($("#agentOut") && !$("#agentOut").textContent.trim()) {
      uiMsg("#agentOut", `Pronto. mode=${State.cfg.mode}`);
    }
  }

  function init() {
    // Make sure app is clickable:
    document.documentElement.style.pointerEvents = "auto";
    document.body.style.pointerEvents = "auto";

    // Kill common overlay pointer capture (defensive)
    // (If you have overlays in CSS, they must be pointer-events:none)
    // Here we enforce for pseudo elements through CSS is not possible from JS,
    // but we can ensure our buttons receive pointer-events.
    $$("button, a, .tab, .btn, .dockbtn").forEach(el => {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
    });

    ensureWriteModal();
    bindUI();
    hydrateUIFromState();

    Logger.write("RCF app.js FULL init ok — mode:", State.cfg.mode);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { passive: true });
  } else {
    init();
  }

  // Expose minimal API for debugging
  window.RCF = window.RCF || {};
  window.RCF.state = State;
  window.RCF.log = (...a) => Logger.write(...a);

})();

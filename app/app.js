/* RControl Factory — app.js (FULL)
   - Replit-like Agent Builder + Admin Self-Healing (base)
   - iOS Safari touch fix (sem clique travado)
   - Offline-friendly: sem dependências externas, storage local
   - PATCH pending + Approve/Discard
   - WRITE MODE: cola 200+ linhas sem truncar (modal) /end

   Patch (2026-02-10/11):
   ✅ Expor window.RCF_LOGGER compatível (core lê logs)
   ✅ Logs view atualiza (logsOut + logsBox + logsViewBox)
   ✅ Fallback click-capture no Admin (se overlay travar clique)

   Patch (HOJE):
   ✅ Compat de IDs (HTML antigo vs novo) — botões do meio voltam a funcionar
   ✅ status pill compat: #statusText OU #statusPill
   ✅ agent input compat: #agentCmd OU #agentInput
*/

(() => {
  "use strict";

  // -----------------------------
  // Utils
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // pega o primeiro id que existir
  const byIdAny = (...ids) => {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  };

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

  function safeJsonStringify(obj) {
    try { return JSON.stringify(obj); } catch { return String(obj); }
  }

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

    _mirrorUI(logs) {
      const txt = (logs || []).join("\n");

      // Drawer (Ferramentas)
      const boxDrawer = $("#logsBox");
      if (boxDrawer) boxDrawer.textContent = txt;

      // LOGS view (página)
      const boxLogsOut = $("#logsOut");       // id do seu index.html atual
      if (boxLogsOut) boxLogsOut.textContent = txt;

      const boxView = $("#logsViewBox");      // compat antigo
      if (boxView) boxView.textContent = txt;
    },

    write(...args) {
      const msg = args
        .map(a => (typeof a === "string" ? a : safeJsonStringify(a)))
        .join(" ");

      const line = `[${new Date().toLocaleString()}] ${msg}`;
      const logs = Storage.get(this.bufKey, []);
      logs.push(line);
      while (logs.length > this.max) logs.shift();
      Storage.set(this.bufKey, logs);

      this._mirrorUI(logs);

      try { console.log("[RCF]", ...args); } catch {}
    },

    clear() {
      Storage.set(this.bufKey, []);
      this._mirrorUI([]);
    },

    getAll() {
      return Storage.get(this.bufKey, []);
    }
  };

  // Expor logger compatível pro core
  window.RCF_LOGGER = window.RCF_LOGGER || {
    push(level, msg) {
      Logger.write(String(level || "log") + ":", msg);
    },
    clear() { Logger.clear(); },
    getText() { return Logger.getAll().join("\n"); },
    dump() { return Logger.getAll().join("\n"); }
  };

  // -----------------------------
  // iOS / Touch Fix
  // -----------------------------
  function bindTap(el, fn) {
    if (!el) return;

    let last = 0;
    const handler = (ev) => {
      const t = Date.now();
      if (ev.type === "click" && (t - last) < 350) return;
      last = t;

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
      mode: "safe",
      autoApplySafe: true,
      writeMode: "modal"
    }),

    apps: Storage.get("apps", []),

    active: Storage.get("active", {
      appSlug: null,
      file: null,
      view: "dashboard"
    }),

    pending: Storage.get("pending", {
      patch: null,
      source: null
    })
  };

  function saveAll() {
    Storage.set("cfg", State.cfg);
    Storage.set("apps", State.apps);
    Storage.set("active", State.active);
    Storage.set("pending", State.pending);
  }

  // -----------------------------
  // UI
  // -----------------------------
  function statusEl() {
    // compat: HTML antigo usa #statusText, novo usava #statusPill
    return byIdAny("statusText", "statusPill");
  }

  function setStatusPill(text) {
    const el = statusEl();
    if (el) el.textContent = text;
  }

  function refreshLogsViews() {
    const logs = Logger.getAll();
    Logger._mirrorUI(logs);
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

    if (name === "logs") refreshLogsViews();

    Logger.write("view:", name);
  }

  function openTools(open) {
    const d = byIdAny("toolsDrawer"); // id comum
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

    const text = byIdAny("activeAppText");
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
    const box = byIdAny("appsList");
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
    const box = byIdAny("filesList"); // no HTML antigo isso pode não existir
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

    const head = byIdAny("editorHead");
    if (head) head.textContent = `Arquivo atual: ${fname}`;

    const ta = byIdAny("fileContent", "fileEditor"); // compat: novo/antigo
    if (ta) ta.value = String(app.files[fname] ?? "");

    renderFilesList();
    return true;
  }

  function saveFile() {
    const app = getActiveApp();
    if (!app) return uiMsg("editorOut", "⚠️ Sem app ativo.");

    const fname = State.active.file;
    if (!fname) return uiMsg("editorOut", "⚠️ Sem arquivo ativo.");

    const ta = byIdAny("fileContent", "fileEditor");
    ensureAppFiles(app);
    app.files[fname] = ta ? String(ta.value || "") : "";

    saveAll();
    uiMsg("editorOut", "✅ Arquivo salvo.");
    Logger.write("file saved:", app.slug, fname);
  }

  // -----------------------------
  // PATCHSET
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

    if (source === "agent") uiMsg("agentOut", formatPatchset(patchset));
    else if (source === "admin") uiMsg("adminOut", formatPatchset(patchset));

    setStatusPill("Patch pendente ✅");
  }

  function applyPatchset(patchset) {
    if (!patchset || !Array.isArray(patchset.ops)) return { ok: false, msg: "Patch inválido" };

    const resLines = [];
    for (const op of patchset.ops) {
      const r = applyOp(op);
      resLines.push(r.ok ? `✅ ${r.msg}` : `❌ ${r.msg}`);
      if (!r.ok) {
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

    if (type === "APP_CREATE") {
      const r = createApp(op.name, op.slug);
      return r.ok ? { ok: true, msg: `APP_CREATE ${r.msg}` } : { ok: false, msg: `APP_CREATE ${r.msg}` };
    }

    if (type === "APP_SELECT") {
      const slug = slugify(op.slug || "");
      const ok = setActiveApp(slug);
      return ok ? { ok: true, msg: `APP_SELECT ${slug}` } : { ok: false, msg: `APP_SELECT falhou (${slug})` };
    }

    if (type === "VIEW_SET") {
      setView(op.view);
      return { ok: true, msg: `VIEW_SET ${op.view}` };
    }

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
  // Agent
  // -----------------------------
  function parseCreateArgs(raw) {
    const s = String(raw || "").trim();
    const qm = s.match(/^create\s+"([^"]+)"\s*([a-z0-9-]+)?/i);
    if (qm) {
      const name = qm[1].trim();
      const slug = (qm[2] || "").trim();
      return { name, slug };
    }

    const rest = s.replace(/^create\s+/i, "").trim();
    if (!rest) return { name: "", slug: "" };

    const parts = rest.split(/\s+/);
    const last = parts[parts.length - 1] || "";
    const looksSlug = /^[a-z0-9-]{2,}$/.test(last) && (last.includes("-") || parts.length >= 2);

    if (looksSlug && parts.length >= 2) {
      const slug = last;
      const name = parts.slice(0, -1).join(" ").trim();
      return { name, slug };
    }

    return { name: rest, slug: "" };
  }

  const Agent = {
    help() {
      return [
        "AGENT HELP (Replit-like)",
        "",
        "Comandos:",
        "- help",
        "- list",
        "- create NOME [SLUG]",
        "- create \"NOME COM ESPAÇO\" [SLUG]",
        "- select SLUG",
        "- open editor | open dashboard | open admin | open agent | open logs | open diagnostics",
        "- set file NOMEARQ (ex: app.js)",
        "- write   (abre WRITE MODE para colar texto grande)",
        "- show (mostra app/arquivo atual)",
        "- mode auto | mode safe",
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

    commitOrPend(source, title, ops, risk = "low") {
      const ps = makePatchset(source, title, ops);
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
      let m = t.match(/cria(?:r)?\s+um\s+app\s+chamado\s+(.+)/i);
      if (m) return { intent: "create", name: m[1].trim(), slug: "" };
      m = t.match(/cria(?:r)?\s+app\s+(.+)/i);
      if (m) return { intent: "create", name: m[1].trim(), slug: "" };
      return null;
    },

    route(cmdRaw) {
      const cmd = String(cmdRaw || "").trim();
      const out = byIdAny("agentOut");
      if (!cmd) { out && (out.textContent = "Comando vazio."); return; }

      if (/^[a-z0-9-]{2,}$/.test(cmd)) {
        const slug = slugify(cmd);
        if (State.apps.some(a => a.slug === slug)) {
          const r = this.commitOrPend("agent", `Select ${slug}`, [{ type: "APP_SELECT", slug }], "low");
          out && (out.textContent = r.msg);
          return;
        }
      }

      const nlp = this.parseNatural(cmd);
      if (nlp && nlp.intent === "create") {
        const name = nlp.name;
        const slug = slugify(nlp.slug || name);
        const r = this.commitOrPend("agent", `Create app ${name}`, [{ type: "APP_CREATE", name, slug }], "low");
        out && (out.textContent = r.msg);
        return;
      }

      const lower = cmd.toLowerCase();
      if (lower === "help") { out && (out.textContent = this.help()); return; }
      if (lower === "list") { out && (out.textContent = this.list()); return; }
      if (lower === "show") { out && (out.textContent = this.show()); return; }

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
          "newapp": "newapp",
          "logs": "logs",
          "diag": "diagnostics",
          "diagnostics": "diagnostics"
        };
        const view = viewMap[target] || target;
        const r = this.commitOrPend("agent", `Open ${view}`, [{ type: "VIEW_SET", view }], "low");
        out && (out.textContent = r.msg);
        return;
      }

      if (lower.startsWith("create ")) {
        const parsed = parseCreateArgs(cmd);
        const name = parsed.name;
        const slug = slugify(parsed.slug || name);
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

      if (lower === "write") {
        openWriteModal();
        out && (out.textContent = "WRITE MODE aberto. Cole o texto e finalize com /end (ou clique salvar).");
        const input = byIdAny("agentCmd", "agentInput");
        if (input) input.value = "";
        return;
      }

      out && (out.textContent = "Comando não reconhecido. Use: help");
    }
  };

  // -----------------------------
  // Admin diagnostics (simples)
  // -----------------------------
  const Admin = {
    diagnostics() {
      const info = {
        cfg: State.cfg,
        apps: State.apps.length,
        active: State.active.appSlug || "-",
        file: State.active.file || "-",
        view: State.active.view || "-",
        ua: navigator.userAgent
      };
      return "RCF DIAGNÓSTICO\n" + JSON.stringify(info, null, 2);
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
          <button class="btn small" id="wmCancel" type="button">Cancelar</button>
          <button class="btn small ok" id="wmSave" type="button">Salvar</button>
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
      if (ev.key === "Enter") {
        const value = txt.value || "";
        const lastLine = value.split("\n").slice(-1)[0].trim();
        if (lastLine === "/end") {
          ev.preventDefault();
          txt.value = value.replace(/\n\/end\s*$/, "");
          closeWriteModal();
        }
      }
    });

    bindTap($("#wmCancel"), () => closeWriteModal());
    bindTap($("#wmSave"), () => closeWriteModal());
  }

  function openWriteModal() {
    ensureWriteModal();
    const m = $("#rcfWriteModal");
    const txt = $("#wmText");
    if (!m || !txt) return;
    txt.value = "";
    m.style.display = "flex";
    setStatusPill("WRITE MODE ✅");
    setTimeout(() => { try { txt.focus(); } catch {} }, 50);
  }

  function closeWriteModal() {
    const m = $("#rcfWriteModal");
    if (!m) return;
    m.style.display = "none";
    setStatusPill("OK ✅");
  }

  // -----------------------------
  // UI helpers
  // -----------------------------
  function uiMsg(idOrSel, text) {
    const el = document.getElementById(idOrSel) || $(idOrSel);
    if (el) el.textContent = String(text ?? "");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  // -----------------------------
  // Fallback “Admin click unkill”
  // -----------------------------
  function installAdminFallbackDelegation() {
    const guardMS = 450;
    let last = 0;

    const handler = (e) => {
      const t = Date.now();
      if (t - last < guardMS) { try { e.preventDefault(); e.stopPropagation(); } catch {} return; }
      last = t;

      const target = e.target;
      if (!target || !target.closest) return;

      const inAdmin = !!target.closest("#view-admin");
      if (!inAdmin) return;

      const hit = target.closest("#btnAdminDiag, #btnAdminClear, #btnAdminApply, #btnAdminDiscard");
      if (hit) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        setStatusPill("Clique capturado ✅");
        setTimeout(() => setStatusPill("OK ✅"), 500);
      }
    };

    document.addEventListener("touchend", handler, { passive: false, capture: true });
    document.addEventListener("click", handler, { passive: false, capture: true });
  }

  // -----------------------------
  // Bind UI (COM IDS COMPAT)
  // -----------------------------
  function bindUI() {
    document.body.style.pointerEvents = "auto";

    // Tabs sempre funcionam (data-view)
    $$("[data-view]").forEach(btn => bindTap(btn, () => setView(btn.getAttribute("data-view"))));

    // Drawer (se existir)
    bindTap(byIdAny("btnOpenTools", "btnGear"), () => openTools(true));
    bindTap(byIdAny("btnOpenTools2"), () => openTools(true));
    bindTap(byIdAny("btnCloseTools"), () => openTools(false));

    // Logs
    bindTap(byIdAny("btnClearLogs"), () => { Logger.clear(); });
    bindTap(byIdAny("btnCopyLogs"), async () => {
      const txt = Logger.getAll().join("\n");
      try { await navigator.clipboard.writeText(txt); } catch {}
      setStatusPill("Logs copiados ✅");
      setTimeout(() => setStatusPill("OK ✅"), 800);
    });

    bindTap(byIdAny("btnLogsRefresh"), () => { Logger._mirrorUI(Logger.getAll()); setStatusPill("Logs atualizados ✅"); setTimeout(() => setStatusPill("OK ✅"), 600); });
    bindTap(byIdAny("btnLogsClear"), () => { Logger.clear(); uiMsg("logsOut", ""); setStatusPill("Logs limpos ✅"); setTimeout(() => setStatusPill("OK ✅"), 600); });
    bindTap(byIdAny("btnLogsCopy"), async () => {
      const txt = Logger.getAll().join("\n");
      try { await navigator.clipboard.writeText(txt); } catch {}
      setStatusPill("Logs copiados ✅");
      setTimeout(() => setStatusPill("OK ✅"), 800);
    });

    // Diagnostics
    bindTap(byIdAny("btnDiagRun"), () => { uiMsg("diagOut", Admin.diagnostics()); setStatusPill("Diag OK ✅"); setTimeout(() => setStatusPill("OK ✅"), 700); });
    bindTap(byIdAny("btnDiagClear"), () => { uiMsg("diagOut", "Pronto."); setStatusPill("OK ✅"); });

    // Dashboard buttons (COMPAT)
    bindTap(byIdAny("btnCreateNewApp", "btnNewAppQuick"), () => setView("newapp"));
    bindTap(byIdAny("btnOpenEditor"), () => setView("editor"));
    bindTap(byIdAny("btnExportBackup", "btnBackup"), () => {
      const payload = JSON.stringify({ apps: State.apps, cfg: State.cfg, active: State.active }, null, 2);
      try { navigator.clipboard.writeText(payload); } catch {}
      uiMsg("statusHint", "Backup copiado (JSON) — (clipboard).");
      Logger.write("backup copied");
    });

    // New app (COMPAT)
    bindTap(byIdAny("btnAutoSlug", "btnGenSlug"), () => {
      const n = (byIdAny("newAppName")?.value || "");
      const s = slugify(n);
      const inSlug = byIdAny("newAppSlug");
      if (inSlug) inSlug.value = s;
    });

    bindTap(byIdAny("btnDoCreateApp", "btnCreateApp"), () => {
      const name = (byIdAny("newAppName")?.value || "");
      const slug = (byIdAny("newAppSlug")?.value || "");
      const r = createApp(name, slug);
      uiMsg("newAppOut", r.msg);
      if (r.ok) {
        setStatusPill("OK ✅");
        setView("editor");
      } else {
        setStatusPill("Nome/slug inválidos ✅");
      }
    });

    // Editor save (COMPAT)
    bindTap(byIdAny("btnSaveFile"), () => saveFile());

    // Generator (COMPAT)
    bindTap(byIdAny("btnGenZip", "btnBuildZip"), () => uiMsg("genOut", "ZIP (stub)."));
    bindTap(byIdAny("btnGenPreview"), () => uiMsg("genOut", "Preview (stub)."));

    // Agent (COMPAT)
    bindTap(byIdAny("btnAgentRun"), () => {
      const cmd = byIdAny("agentCmd", "agentInput")?.value || "";
      Agent.route(cmd);
    });
    bindTap(byIdAny("btnAgentClear"), () => {
      const a = byIdAny("agentCmd", "agentInput");
      if (a) a.value = "";
      uiMsg("agentOut", "Pronto.");
    });

    // Touch debug (clicar no status)
    bindTap(statusEl(), (ev) => {
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
    Logger._mirrorUI(Logger.getAll());
    renderAppsList();

    const app = getActiveApp();
    if (app) {
      setActiveApp(app.slug);
      if (State.active.file) openFile(State.active.file);
    } else {
      const text = byIdAny("activeAppText");
      if (text) text.textContent = "Sem app ativo ✅";
    }

    setView(State.active.view || "dashboard");

    const ao = byIdAny("agentOut");
    if (ao && !ao.textContent.trim()) {
      uiMsg("agentOut", `Pronto. mode=${State.cfg.mode}`);
    }
  }

  function init() {
    document.documentElement.style.pointerEvents = "auto";
    document.body.style.pointerEvents = "auto";

    $$("button, a, .tab, .btn, .dockbtn").forEach(el => {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
    });

    ensureWriteModal();
    bindUI();
    installAdminFallbackDelegation();
    hydrateUIFromState();

    Logger.write("RCF app.js init ok — mode:", State.cfg.mode);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { passive: true });
  } else {
    init();
  }

  window.RCF = window.RCF || {};
  window.RCF.state = State;
  window.RCF.log = (...a) => Logger.write(...a);
// =============================
// RCF: Anti-overlay killer (miolo morre depois do 1º clique)
// Cole perto do fim do app.js, antes do "})();"
// =============================
(function installOverlayKiller(){
  const SELS = [
    "#rcfWriteModal",
    ".rcf-gear-backdrop",
    "#toolsDrawer",
    ".tools",
    ".overlay",
    ".backdrop",
    "#overlay",
    "#backdrop"
  ];

  function isVisible(el){
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function killIfBlocking(){
    // se tiver algum overlay visível, mas não era pra estar “ativo”, desliga pointer events
    for (const sel of SELS){
      const el = document.querySelector(sel);
      if (!el) continue;
      if (!isVisible(el)) continue;

      // se for o WriteModal e estiver fechado, pode estar invisível porém “visível” por bug -> mata
      // se for drawer/gear/backdrop sem class open, mata também
      const isOpen =
        el.classList.contains("open") ||
        (el.id === "rcfWriteModal" && (el.style.display === "flex"));

      if (!isOpen){
        el.style.pointerEvents = "none";
      }
    }
  }

  // roda sempre que tocar em qualquer lugar
  document.addEventListener("touchend", (ev) => {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;

    // antes: tenta matar overlays suspeitos
    killIfBlocking();

    // log rápido de quem está por cima do ponto tocado
    const top = document.elementFromPoint(t.clientX, t.clientY);
    if (top && window.RCF_LOGGER && window.RCF_LOGGER.push){
      const cs = getComputedStyle(top);
      window.RCF_LOGGER.push("touch", `TOP=${top.tagName}#${top.id}.${String(top.className||"").slice(0,60)} z=${cs.zIndex} pe=${cs.pointerEvents}`);
    }
  }, { passive: true, capture: true });

  // quando mudar de view, também limpa overlays
  const oldSetView = window.RCF && window.RCF.setView;
  // se não tiver exportado, a gente só escuta mudanças nos botões
  document.addEventListener("click", () => killIfBlocking(), { capture: true, passive: true });
// =============================
// RCF FIX: Delegação global (botões do miolo param após 1 clique)
// Cole antes do "})();" final
// =============================
(function installGlobalActionDelegation(){
  const fire = (fn) => { try { fn(); } catch (e) { try { Logger.write("deleg err:", e?.message||e); } catch {} } };

  function onAction(id){
    switch(id){

      // ===== SETTINGS / Segurança =====
      case "btnPinSave":
        // se você tem função já pronta em admin.js/settings.js, chama via window
        if (window.RCF_SETTINGS?.pinSave) return fire(() => window.RCF_SETTINGS.pinSave());
        // fallback: só log pra você saber que capturou
        return fire(() => setStatusPill("PIN: clique capturado ✅"));

      case "btnPinRemove":
        if (window.RCF_SETTINGS?.pinRemove) return fire(() => window.RCF_SETTINGS.pinRemove());
        return fire(() => setStatusPill("PIN remove: clique capturado ✅"));

      // ===== LOGS (Settings) =====
      case "btnLogsRefresh":
        return fire(() => {
          refreshLogsViews();
          setStatusPill("Logs atualizados ✅");
          setTimeout(() => setStatusPill("OK ✅"), 600);
        });

      case "btnLogsClear":
        return fire(() => {
          Logger.clear();
          const out = document.querySelector("#logsOut");
          if (out) out.textContent = "";
          setStatusPill("Logs limpos ✅");
          setTimeout(() => setStatusPill("OK ✅"), 600);
        });

      case "btnLogsCopy":
        return fire(async () => {
          const txt = Logger.getAll().join("\n");
          try { await navigator.clipboard.writeText(txt); } catch {}
          setStatusPill("Logs copiados ✅");
          setTimeout(() => setStatusPill("OK ✅"), 800);
        });

      case "btnLogsExport":
        return fire(() => {
          // export simples em .txt (download)
          const txt = Logger.getAll().join("\n");
          const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "rcf-logs.txt";
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 800);
          setStatusPill("Export .txt ✅");
          setTimeout(() => setStatusPill("OK ✅"), 800);
        });

      // ===== ADMIN (se tiver ids) =====
      case "btnAdminDiag":
        return fire(() => { uiMsg("#adminOut", Admin.diagnostics()); });

      case "btnAdminClear":
        return fire(() => { Logger.clear(); setStatusPill("Logs limpos ✅"); setTimeout(()=>setStatusPill("OK ✅"),600); });

      default:
        return;
    }
  }

  function handler(ev){
    const t = ev.target && ev.target.closest ? ev.target.closest("button, a, [role='button']") : null;
    if (!t) return;

    const id = t.id || "";
    if (!id) return;

    // só intercepta ids que a gente controla
    const known = [
      "btnPinSave","btnPinRemove",
      "btnLogsRefresh","btnLogsClear","btnLogsCopy","btnLogsExport",
      "btnAdminDiag","btnAdminClear"
    ];
    if (!known.includes(id)) return;

    // evita duplo touchend+click
    ev.preventDefault?.();
    ev.stopPropagation?.();

    onAction(id);
  }

  // captura alto (pega mesmo se alguém re-renderizar)
  document.addEventListener("touchend", handler, { capture: true, passive: false });
  document.addEventListener("click", handler, { capture: true, passive: false });

  try { Logger.write("delegation: ON ✅"); } catch {}
})();
})();
})();

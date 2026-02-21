/* FILE: /app/js/core/agent_runtime.js
   RControl Factory — core/agent_runtime.js — v1.0 SAFE (DEGRAU 1)
   OBJETIVO:
   - Agent interno com "chat" + command queue
   - Auto-detect de writer (VFS overrides / MAE / etc)
   - Commit local do bundle + push opcional via GitHub Sync
   - NÃO usa OpenAI ainda (determinístico)
*/

(() => {
  "use strict";

  if (window.RCF_AGENT && window.RCF_AGENT.__v10) return;

  const PREFIX = "rcf:";
  const KEY_QUEUE = PREFIX + "agent:queue";
  const KEY_LAST  = PREFIX + "agent:last";
  const KEY_CFG   = PREFIX + "agent:cfg";

  const $ = (sel, root = document) => root.querySelector(sel);

  const safeParse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  const safeStr   = (o) => { try { return JSON.stringify(o); } catch { return String(o); } };

  function log(level, msg, obj) {
    try {
      const extra = (obj !== undefined) ? (" " + safeStr(obj)) : "";
      window.RCF_LOGGER?.push?.(level, String(msg) + extra);
    } catch {}
    try { console.log("[RCF_AGENT]", level, msg, obj ?? ""); } catch {}
  }

  function nowISO(){ return new Date().toISOString(); }

  function normPath(p) {
    let x = String(p || "").trim();
    x = x.replace(/\\/g, "/");
    x = x.replace(/^(\.\/)+/, "");
    x = x.replace(/^\/+/, "");
    x = x.replace(/\/{2,}/g, "/");
    return x;
  }

  function cfgGet() {
    return safeParse(localStorage.getItem(KEY_CFG) || "{}", {
      autoCommit: true,
      autoPushMother: false,
      uiAutoMount: true,
      maxQueue: 50
    });
  }

  function cfgSet(patch) {
    const next = Object.assign(cfgGet(), patch || {});
    try { localStorage.setItem(KEY_CFG, safeStr(next)); } catch {}
    return next;
  }

  // ---------------------------------------------------------
  // Queue
  // ---------------------------------------------------------
  function loadQueue() {
    return safeParse(localStorage.getItem(KEY_QUEUE) || "[]", []);
  }

  function saveQueue(list) {
    try { localStorage.setItem(KEY_QUEUE, safeStr(list || [])); } catch {}
  }

  function enqueue(cmd) {
    const q = loadQueue();
    q.unshift({
      id: "cmd_" + Date.now() + "_" + Math.random().toString(16).slice(2),
      ts: Date.now(),
      at: nowISO(),
      cmd: String(cmd || "").trim(),
      status: "queued"
    });
    const max = Number(cfgGet().maxQueue || 50) || 50;
    saveQueue(q.slice(0, Math.max(10, Math.min(250, max))));
    return q[0];
  }

  // ---------------------------------------------------------
  // Writer auto-detect (VFS overrides / fallback)
  // ---------------------------------------------------------
  function getWriter() {
    const O = window.RCF_VFS_OVERRIDES || window.RCF_VFS || null;

    // writer signature: async (path, content) => { ok:true }
    const candidates = [
      // prefer explicit put
      (O && typeof O.put === "function") ? async (p, c) => (await O.put(p, c), { ok: true, via: "RCF_VFS_OVERRIDES.put" }) : null,
      (O && typeof O.write === "function") ? async (p, c) => (await O.write(p, c), { ok: true, via: "RCF_VFS_OVERRIDES.write" }) : null,
      (O && typeof O.set === "function") ? async (p, c) => (await O.set(p, c), { ok: true, via: "RCF_VFS_OVERRIDES.set" }) : null,
      (O && typeof O.writeFile === "function") ? async (p, c) => (await O.writeFile(p, c), { ok: true, via: "RCF_VFS_OVERRIDES.writeFile" }) : null,
    ].filter(Boolean);

    if (candidates.length) {
      return { ok: true, write: candidates[0], del: getDeleter(), list: getLister() };
    }
    return { ok: false, err: "Nenhum writer encontrado (RCF_VFS_OVERRIDES.put/write/set/writeFile)." };
  }

  function getDeleter() {
    const O = window.RCF_VFS_OVERRIDES || window.RCF_VFS || null;
    const candidates = [
      (O && typeof O.del === "function") ? async (p) => (await O.del(p), { ok: true, via: "del" }) : null,
      (O && typeof O.remove === "function") ? async (p) => (await O.remove(p), { ok: true, via: "remove" }) : null,
      (O && typeof O.delete === "function") ? async (p) => (await O.delete(p), { ok: true, via: "delete" }) : null,
    ].filter(Boolean);
    return candidates[0] || (async () => ({ ok:false, err:"deleter ausente" }));
  }

  function getLister() {
    const O = window.RCF_VFS_OVERRIDES || window.RCF_VFS || null;

    // tenta formatos conhecidos (safe)
    if (O && typeof O.listOverridesSafe === "function") {
      return async () => {
        const r = await O.listOverridesSafe({ allowStale:true });
        const res = r?.res || r || {};
        const items = Array.isArray(res.items) ? res.items
          : Array.isArray(res.list) ? res.list
          : Array.isArray(res.paths) ? res.paths
          : Array.isArray(res.keys) ? res.keys
          : [];
        return { ok:true, via:"listOverridesSafe", items };
      };
    }
    if (O && typeof O.listOverrides === "function") {
      return async () => {
        const res = await O.listOverrides();
        const items = Array.isArray(res?.items) ? res.items
          : Array.isArray(res?.list) ? res.list
          : Array.isArray(res?.paths) ? res.paths
          : Array.isArray(res?.keys) ? res.keys
          : [];
        return { ok:true, via:"listOverrides", items };
      };
    }
    return async () => ({ ok:false, err:"lister ausente" });
  }

  // ---------------------------------------------------------
  // Commit (bundle local) + Push (opcional)
  // ---------------------------------------------------------
  function saveMotherBundleLocalText(txt) {
    const key = "rcf:mother_bundle_local";
    try { localStorage.setItem(key, String(txt || "")); return true; } catch { return false; }
  }

  async function commitBundle(opts = {}) {
    // 1) se GH_SYNC.buildFactoryBundle existe, ele mesmo monta o bundle completo (fillers/discovery)
    try {
      const GH = window.RCF_GH_SYNC;
      if (GH && typeof GH.buildFactoryBundle === "function") {
        const built = await GH.buildFactoryBundle({ includeDefault:true, includeDiscovered:true, maxFiles: 250 });
        const txt = JSON.stringify(built);
        saveMotherBundleLocalText(txt);
        log("OK", "commitBundle: salvo em rcf:mother_bundle_local (via GH.buildFactoryBundle)", { files: built?.files?.length || 0 });
        return { ok:true, mode:"gh_buildFactoryBundle", filesCount: built?.files?.length || 0 };
      }
    } catch (e) {
      log("WARN", "commitBundle: GH.buildFactoryBundle falhou", { err: String(e?.message || e) });
    }

    // 2) fallback: se MAE tiver exporter
    try {
      if (window.RCF_MAE?.getLocalBundleText) {
        const txt = String(await window.RCF_MAE.getLocalBundleText() || "");
        if (txt) {
          saveMotherBundleLocalText(txt);
          log("OK", "commitBundle: salvo em rcf:mother_bundle_local (via RCF_MAE.getLocalBundleText)");
          return { ok:true, mode:"mae_getLocalBundleText" };
        }
      }
    } catch {}

    // 3) fallback: mantém como está (não quebra)
    log("WARN", "commitBundle: sem builder/MAE exporter. Mantive bundle local como estava.");
    return { ok:false, err:"no_builder" };
  }

  async function pushMother(opts = {}) {
    const GH = window.RCF_GH_SYNC;
    if (!GH || typeof GH.pushMotherBundle !== "function") {
      return { ok:false, err:"RCF_GH_SYNC.pushMotherBundle ausente" };
    }
    const res = await GH.pushMotherBundle();
    return { ok:true, res };
  }

  // ---------------------------------------------------------
  // Parser simples (determinístico)
  // ---------------------------------------------------------
  function parseCommand(raw) {
    const s = String(raw || "").trim();
    if (!s) return { kind:"noop" };

    // forms:
    // write <path> | <content>
    // delete <path>
    // list overrides
    // commit bundle
    // push mother
    const lower = s.toLowerCase();

    if (lower.startsWith("write ")) {
      const rest = s.slice(6);
      const parts = rest.split("|");
      const path = normPath(parts[0] || "");
      const content = (parts.length >= 2) ? parts.slice(1).join("|").replace(/^\s*/, "") : "";
      return { kind:"write", path, content };
    }

    if (lower.startsWith("delete ") || lower.startsWith("del ")) {
      const path = normPath(s.split(" ").slice(1).join(" "));
      return { kind:"delete", path };
    }

    if (lower === "list overrides" || lower === "list" || lower === "ls overrides") {
      return { kind:"list_overrides" };
    }

    if (lower === "commit bundle" || lower === "commit") {
      return { kind:"commit" };
    }

    if (lower === "push mother" || lower === "push bundle" || lower === "push") {
      return { kind:"push_mother" };
    }

    return { kind:"unknown", raw: s };
  }

  // ---------------------------------------------------------
  // Executor
  // ---------------------------------------------------------
  async function execute(cmdObj, execOpts = {}) {
    const cfg = cfgGet();
    const writer = getWriter();

    if (cmdObj.kind === "noop") return { ok:true, msg:"noop" };

    if (cmdObj.kind === "unknown") {
      return { ok:false, err:"Comando desconhecido. Use: write/delete/list overrides/commit/push mother", raw: cmdObj.raw };
    }

    if (cmdObj.kind === "list_overrides") {
      const r = await writer.list();
      if (!r.ok) return r;
      const items = r.items || [];
      const out = items.map(it =>
        (typeof it === "string") ? it : (it?.path ?? it?.key ?? safeStr(it))
      );
      return { ok:true, via:r.via, items: out };
    }

    if (cmdObj.kind === "commit") {
      return await commitBundle(execOpts);
    }

    if (cmdObj.kind === "push_mother") {
      // antes de push, tenta commit (melhor)
      try { await commitBundle({}); } catch {}
      return await pushMother(execOpts);
    }

    if (cmdObj.kind === "write") {
      if (!writer.ok) return { ok:false, err: writer.err || "writer indisponível" };
      if (!cmdObj.path) return { ok:false, err:"path vazio" };

      const res = await writer.write(cmdObj.path, String(cmdObj.content ?? ""));
      log("OK", "write ok", { path: cmdObj.path, via: res?.via || "writer" });

      if (cfg.autoCommit) {
        try { await commitBundle({}); } catch {}
      }
      if (cfg.autoPushMother) {
        try { await pushMother({}); } catch {}
      }

      return { ok:true, action:"write", path: cmdObj.path, via: res?.via || "writer" };
    }

    if (cmdObj.kind === "delete") {
      if (!cmdObj.path) return { ok:false, err:"path vazio" };
      const del = writer.del || (async () => ({ ok:false, err:"deleter ausente" }));
      const res = await del(cmdObj.path);
      log("OK", "delete ok", { path: cmdObj.path, via: res?.via || "deleter" });

      if (cfg.autoCommit) {
        try { await commitBundle({}); } catch {}
      }
      if (cfg.autoPushMother) {
        try { await pushMother({}); } catch {}
      }

      return { ok:true, action:"delete", path: cmdObj.path, via: res?.via || "deleter" };
    }

    return { ok:false, err:"executor: unhandled" };
  }

  // ---------------------------------------------------------
  // UI (slot agent.actions)
  // ---------------------------------------------------------
  function getSlotEl() {
    try {
      const ui = window.RCF_UI;
      if (ui && typeof ui.getSlot === "function") {
        const s = ui.getSlot("agent.actions");
        if (s) return s;
      }
    } catch {}
    return document.querySelector('[data-rcf-slot="agent.actions"]') ||
           document.getElementById("rcfAgentSlotActions") ||
           document.getElementById("view-agent") ||
           null;
  }

  function mountUI() {
    const slot = getSlotEl();
    if (!slot) return false;
    if (document.getElementById("rcfAgentRuntimeCard")) return true;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "rcfAgentRuntimeCard";
    card.style.marginTop = "12px";

    card.innerHTML = `
      <h2 style="margin-top:0">Agent Runtime (DEGRAU 1)</h2>
      <div class="hint">Comandos determinísticos. Ex: <b>write app/foo.txt | hello</b> • <b>push mother</b></div>

      <div class="row" style="flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px">
        <input id="rcfAgentCmd" placeholder="Digite um comando…" style="flex:1;min-width:220px" />
        <button class="btn ok" id="rcfAgentRun" type="button">Run</button>
        <button class="btn ghost" id="rcfAgentCommit" type="button">Commit</button>
        <button class="btn ghost" id="rcfAgentPush" type="button">Push</button>
      </div>

      <div class="row" style="flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px">
        <label class="badge" style="display:flex;gap:8px;align-items:center">
          <input id="rcfAgentAutoCommit" type="checkbox" style="transform:scale(1.1)" />
          autoCommit
        </label>
        <label class="badge" style="display:flex;gap:8px;align-items:center">
          <input id="rcfAgentAutoPush" type="checkbox" style="transform:scale(1.1)" />
          autoPush
        </label>

        <div class="spacer"></div>
        <button class="btn danger" id="rcfAgentClearQueue" type="button">Clear queue</button>
      </div>

      <pre class="mono small" id="rcfAgentOut" style="margin-top:10px;max-height:26vh;overflow:auto">Pronto.</pre>

      <div style="margin-top:10px">
        <div class="hint" style="margin-bottom:6px">Queue (últimos comandos)</div>
        <div id="rcfAgentQueue" class="files" style="max-height:24vh;overflow:auto"></div>
      </div>
    `;

    slot.appendChild(card);

    const out = $("#rcfAgentOut");
    const boxQ = $("#rcfAgentQueue");
    const inp = $("#rcfAgentCmd");
    const btnRun = $("#rcfAgentRun");
    const btnCommit = $("#rcfAgentCommit");
    const btnPush = $("#rcfAgentPush");
    const btnClear = $("#rcfAgentClearQueue");
    const chkCommit = $("#rcfAgentAutoCommit");
    const chkPush = $("#rcfAgentAutoPush");

    const setOut = (t) => { try { if (out) out.textContent = String(t ?? ""); } catch {} };

    function renderQueue() {
      if (!boxQ) return;
      const q = loadQueue();
      if (!q.length) {
        boxQ.innerHTML = `<div class="hint">vazio</div>`;
        return;
      }
      boxQ.innerHTML = q.slice(0, 16).map(it => {
        const s = String(it.cmd || "");
        const st = String(it.status || "");
        const at = String(it.at || "");
        return `<div class="file-item" data-id="${it.id}" style="cursor:pointer">
          <b>${escapeHtml(st)}</b> • ${escapeHtml(at)}<br/>
          <span style="opacity:.85">${escapeHtml(s)}</span>
        </div>`;
      }).join("");

      try {
        Array.from(boxQ.querySelectorAll("[data-id]")).forEach(el => {
          el.addEventListener("click", () => {
            const id = el.getAttribute("data-id");
            const item = loadQueue().find(x => x.id === id);
            if (item && inp) inp.value = item.cmd || "";
          }, { passive:true });
        });
      } catch {}
    }

    function escapeHtml(s) {
      return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
    }

    // init toggles
    try {
      const cfg = cfgGet();
      if (chkCommit) chkCommit.checked = !!cfg.autoCommit;
      if (chkPush) chkPush.checked = !!cfg.autoPushMother;
    } catch {}

    chkCommit?.addEventListener("change", () => {
      cfgSet({ autoCommit: !!chkCommit.checked });
      setOut("cfg: autoCommit=" + (!!chkCommit.checked));
    }, { passive:true });

    chkPush?.addEventListener("change", () => {
      cfgSet({ autoPushMother: !!chkPush.checked });
      setOut("cfg: autoPush=" + (!!chkPush.checked));
    }, { passive:true });

    async function runCmd(raw) {
      const cmdLine = String(raw || "").trim();
      if (!cmdLine) return setOut("⚠️ Digite um comando.");

      const item = enqueue(cmdLine);
      renderQueue();

      setOut("Rodando… " + cmdLine);

      const cmdObj = parseCommand(cmdLine);

      try {
        const res = await execute(cmdObj, {});
        // update queue status
        const q = loadQueue();
        const ix = q.findIndex(x => x.id === item.id);
        if (ix >= 0) q[ix].status = res.ok ? "ok" : "err";
        saveQueue(q);
        renderQueue();

        setOut((res.ok ? "✅ OK\n" : "❌ ERRO\n") + safeStr(res));
      } catch (e) {
        const q = loadQueue();
        const ix = q.findIndex(x => x.id === item.id);
        if (ix >= 0) q[ix].status = "err";
        saveQueue(q);
        renderQueue();

        setOut("❌ Exceção: " + (e?.message || e));
      }
    }

    btnRun?.addEventListener("click", () => runCmd(inp?.value || ""), { passive:true });
    btnCommit?.addEventListener("click", () => runCmd("commit bundle"), { passive:true });
    btnPush?.addEventListener("click", () => runCmd("push mother"), { passive:true });

    inp?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        try { ev.preventDefault(); } catch {}
        runCmd(inp.value || "");
      }
    });

    btnClear?.addEventListener("click", () => {
      const ok = confirm("Limpar queue do Agent?");
      if (!ok) return;
      saveQueue([]);
      renderQueue();
      setOut("✅ Queue limpa.");
    }, { passive:true });

    renderQueue();
    setOut("Pronto. ✅ Ex: write app/test.txt | oi");
    return true;
  }

  function mountLoop() {
    const cfg = cfgGet();
    if (!cfg.uiAutoMount) return;
    const ok = mountUI();
    if (ok) return;
    setTimeout(() => { try { mountUI(); } catch {} }, 800);
    setTimeout(() => { try { mountUI(); } catch {} }, 2200);
  }

  // ---------------------------------------------------------
  // API global
  // ---------------------------------------------------------
  window.RCF_AGENT = {
    __v10: true,
    cfgGet,
    cfgSet,
    parse: parseCommand,
    execute,
    run(cmdLine) { return execute(parseCommand(cmdLine), {}); },
    queue: { load: loadQueue, save: saveQueue, enqueue }
  };

  // auto-mount (UI_READY bus + fallback)
  try {
    window.addEventListener("RCF:UI_READY", () => { try { mountLoop(); } catch {} });
  } catch {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { try { mountLoop(); } catch {} }, { once:true });
  } else {
    mountLoop();
  }

  log("OK", "agent_runtime.js ready ✅ (v1.0)");
})();

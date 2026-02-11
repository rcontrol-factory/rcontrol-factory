/* =========================================================
  core/github_sync.js (FULL)
  - Cliente de Sync (PWA -> Worker -> GitHub)
  - Treino offline: fila (queue) em localStorage
  - Auto-sync no Save (somente low-risk)
  - SAFE: crítico exige confirmação manual
========================================================= */

(() => {
  "use strict";

  const LS = {
    get(k, fb) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
      catch { return fb; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  const KEY_CFG = "rcf:gh:cfg";
  const KEY_Q = "rcf:gh:queue";

  const DEFAULT_CFG = {
    enabled: false,          // auto-sync on save
    endpoint: "/api/push",   // Worker route
    basePath: "factory/app", // onde gravar no repo (ajusta depois)
    allowCritical: false     // só com confirmação
  };

  const CRITICAL = [
    "index.html",
    "app.js",
    "sw.js",
    "service-worker.js",
    "core/",    // qualquer core/*
  ];

  function isCriticalFile(path) {
    const p = String(path || "");
    if (!p) return false;
    if (p === "index.html") return true;
    if (p === "app.js") return true;
    if (p.endsWith("/sw.js") || p.endsWith("service-worker.js")) return true;
    if (p.includes("/core/") || p.startsWith("core/")) return true;
    return CRITICAL.some(x => p === x);
  }

  function cfgGet() { return Object.assign({}, DEFAULT_CFG, LS.get(KEY_CFG, {})); }
  function cfgSet(patch) {
    const c = cfgGet();
    const next = Object.assign({}, c, patch || {});
    LS.set(KEY_CFG, next);
    return next;
  }

  function qGet() { return LS.get(KEY_Q, []); }
  function qSet(list) { LS.set(KEY_Q, Array.isArray(list) ? list : []); }

  function qPush(job) {
    const q = qGet();
    q.unshift(job);
    while (q.length > 50) q.pop();
    qSet(q);
    return q;
  }

  function qRemove(id) {
    const q = qGet().filter(x => x.id !== id);
    qSet(q);
    return q;
  }

  function nowISO() { return new Date().toISOString(); }

  function makeId() {
    return "gh_" + Math.random().toString(16).slice(2) + "_" + Date.now();
  }

  function getActiveEditorState() {
    // tenta ler do core (app.js) que você já tem
    const s = window.RCF?.state || null;
    const appSlug = s?.active?.appSlug || null;
    const file = s?.active?.file || null;

    // conteúdo do editor (textarea principal)
    const ta = document.getElementById("fileContent");
    const content = ta ? String(ta.value || "") : "";

    return { appSlug, file, content };
  }

  function buildRepoPath(basePath, appSlug, file) {
    // Se appSlug existir, grava dentro de /apps/<slug>/<file>
    // Se não existir (sem app ativo), grava em /factory/<file> (para “mãe”)
    const bp = String(basePath || "").replace(/^\/+|\/+$/g, "");
    if (appSlug && file) return `${bp}/apps/${appSlug}/${file}`;
    if (file) return `${bp}/factory/${file}`;
    return `${bp}/factory/unknown.txt`;
  }

  async function apiPush({ path, content, message }) {
    const c = cfgGet();
    const url = c.endpoint || "/api/push";

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, content, message })
    });

    const txt = await res.text();
    let data = null;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

    if (!res.ok) {
      const msg = data?.error || data?.message || ("HTTP " + res.status);
      throw new Error(msg);
    }
    return data;
  }

  async function pushCurrentFile(opts = {}) {
    const c = cfgGet();
    const { appSlug, file, content } = getActiveEditorState();
    if (!file) throw new Error("Sem arquivo ativo no editor.");

    const repoPath = buildRepoPath(c.basePath, appSlug, file);

    // SAFE: crítico só se allowCritical true (ou confirmação externa no UI)
    const critical = isCriticalFile(repoPath) || isCriticalFile(file);
    if (critical && !c.allowCritical && !opts.forceCritical) {
      throw new Error("SAFE: arquivo crítico. Marque confirmação no Admin para permitir.");
    }

    const message = opts.message || `RCF sync: ${appSlug || "factory"} / ${file} @ ${nowISO()}`;

    const job = {
      id: makeId(),
      at: nowISO(),
      appSlug: appSlug || null,
      file,
      repoPath,
      message,
      bytes: content.length,
      critical
    };

    // tenta push
    try {
      const r = await apiPush({ path: repoPath, content, message });
      return { ok: true, job, result: r };
    } catch (e) {
      // ainda não existe Worker? ok: treina fila
      qPush(Object.assign({ status: "queued", error: (e?.message || String(e)) }, job));
      return { ok: false, job, error: (e?.message || String(e)), queued: true };
    }
  }

  async function flushQueue(limit = 5) {
    const q = qGet();
    if (!q.length) return { ok: true, msg: "Queue vazia." };

    let done = 0;
    let fail = 0;

    for (const item of [...q].slice(0, limit)) {
      try {
        await apiPush({ path: item.repoPath, content: item._content || "", message: item.message });
        qRemove(item.id);
        done++;
      } catch (e) {
        fail++;
      }
    }

    return { ok: true, msg: `Flush: ok=${done} fail=${fail} (limit=${limit})` };
  }

  // Observação: pra fila funcionar “de verdade”, precisamos guardar content também.
  // Mas como isso pode ficar grande, a versão 1 usa fila como “treino do fluxo”.
  // Próximo upgrade: guardar content compactado por hash.

  window.RCF_GH = {
    cfgGet, cfgSet,
    qGet, qSet,
    pushCurrentFile,
    flushQueue
  };
})();

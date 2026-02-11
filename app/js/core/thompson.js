/* =========================================================
  RControl Factory — core/thompson.js (FULL) — v1.0
  "Thompson" = motor de overrides da Mãe (Self-Update)

  Armazena overrides + histórico em localStorage e (se existir)
  também pode mandar pro Service Worker via RCF_VFS (opcional).

  API: window.RCF_THOMPSON
   - parseBundle(raw)
   - loadOverrides()
   - dryRun(bundle, current)
   - guardApply(bundle, mode)   // mode: "safe" | "auto"
   - apply(bundle)
   - rollback(n=1)
   - exportCurrent()
   - resetAll()
   - getHistory()

  Bundle esperado:
  {
    meta: { name, version, createdAt },
    files: { "/core/x.js": "...", "/app.js": "..." }
  }
========================================================= */

(function () {
  "use strict";

  // ---------- helpers ----------
  const nowISO = () => new Date().toISOString();
  const safeText = (v) => (v === undefined || v === null) ? "" : String(v);

  function safeParse(raw) {
    try { return JSON.parse(String(raw || "")); } catch (e) { return null; }
  }

  function safeStringify(obj) {
    try { return JSON.stringify(obj); } catch { return String(obj); }
  }

  function deepClone(v) {
    return safeParse(safeStringify(v)) ?? v;
  }

  function replaceDateTokens(obj) {
    const iso = nowISO();
    const walk = (v) => {
      if (typeof v === "string") return v.split("{{DATE}}").join(iso);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") {
        const out = {};
        for (const k of Object.keys(v)) out[k] = walk(v[k]);
        return out;
      }
      return v;
    };
    return walk(obj);
  }

  function normalizeBundle(bundle) {
    const b = (bundle && typeof bundle === "object") ? deepClone(bundle) : {};
    if (!b.meta || typeof b.meta !== "object") b.meta = {};
    if (!b.meta.name) b.meta.name = "mother-bundle";
    if (!b.meta.version) b.meta.version = "1.0";
    if (!b.meta.createdAt) b.meta.createdAt = "{{DATE}}";
    if (!b.files || typeof b.files !== "object") b.files = {};
    return replaceDateTokens(b);
  }

  function listFiles(filesObj) {
    if (!filesObj || typeof filesObj !== "object") return [];
    return Object.keys(filesObj).filter(Boolean).sort();
  }

  // ---------- storage keys ----------
  const KEY_OVERRIDES = "rcf:thompson:overrides"; // { "/path": {content, contentType, updatedAt} }
  const KEY_HISTORY   = "rcf:thompson:history";   // [{ at, meta, overridesSnapshot }]
  const KEY_CURRENT_META = "rcf:thompson:meta";   // { name, version, createdAt, appliedAt }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const obj = JSON.parse(raw);
      return (obj === undefined || obj === null) ? fallback : obj;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }

  function delKey(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  // ---------- content types ----------
  const CONTENT_TYPES = {
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8"
  };

  function ext(path) {
    const m = String(path || "").toLowerCase().match(/\.[a-z0-9]+$/);
    return m ? m[0] : ".txt";
  }

  function guessContentType(path) {
    return CONTENT_TYPES[ext(path)] || "text/plain; charset=utf-8";
  }

  // ---------- critical files (safe guard) ----------
  // Aqui ficam os “arquivos que podem te trancar” se aplicados errado.
  // Ajuste essa lista depois, mas já deixa seguro agora.
  const CRITICAL_PREFIXES = [
    "/index.html",
    "/app.js",
    "/core/",
    "/sw.js",
    "/service-worker.js",
    "/manifest.json"
  ];

  function isCritical(path) {
    const p = String(path || "");
    return CRITICAL_PREFIXES.some((pre) => p === pre || p.startsWith(pre));
  }

  // ---------- overrides ----------
  function loadOverrides() {
    const ov = loadJSON(KEY_OVERRIDES, {});
    return (ov && typeof ov === "object") ? ov : {};
  }

  function saveOverrides(ov) {
    saveJSON(KEY_OVERRIDES, ov);
  }

  function getHistory() {
    const h = loadJSON(KEY_HISTORY, []);
    return Array.isArray(h) ? h : [];
  }

  function pushHistory(snapshot) {
    const h = getHistory();
    h.unshift(snapshot);
    // limita histórico pra não crescer infinito
    while (h.length > 20) h.pop();
    saveJSON(KEY_HISTORY, h);
  }

  // ---------- DRY RUN ----------
  function dryRun(bundle, currentOverrides) {
    const b = normalizeBundle(bundle);
    const current = (currentOverrides && typeof currentOverrides === "object") ? currentOverrides : loadOverrides();

    const incoming = listFiles(b.files);
    const changed = [];
    const added = [];
    const critical = [];

    for (const p of incoming) {
      const newContent = safeText(b.files[p]);
      const exists = !!current[p];
      if (!exists) {
        added.push(p);
      } else {
        const oldContent = safeText(current[p]?.content);
        if (oldContent !== newContent) changed.push(p);
      }
      if (isCritical(p)) critical.push(p);
    }

    return {
      meta: b.meta,
      totalFiles: incoming.length,
      added,
      changed,
      critical
    };
  }

  // ---------- SAFE GUARD ----------
  function guardApply(bundle, mode) {
    const m = (mode === "auto") ? "auto" : "safe";
    const rep = dryRun(bundle, loadOverrides());
    const needsConfirm = (m === "safe" && rep.critical.length > 0);
    return { needsConfirm, criticalFiles: rep.critical };
  }

  // ---------- APPLY ----------
  async function apply(bundle) {
    const b = normalizeBundle(bundle);

    const ov = loadOverrides();
    const beforeSnapshot = deepClone(ov);

    // snapshot no histórico antes de mexer
    pushHistory({
      at: nowISO(),
      meta: deepClone(b.meta),
      overridesSnapshot: beforeSnapshot
    });

    const paths = listFiles(b.files);

    for (const p of paths) {
      const content = safeText(b.files[p]);
      const contentType = guessContentType(p);
      ov[p] = { content, contentType, updatedAt: nowISO() };
    }

    saveOverrides(ov);
    saveJSON(KEY_CURRENT_META, {
      name: b.meta?.name || "mother-bundle",
      version: b.meta?.version || "1.0",
      createdAt: b.meta?.createdAt || "",
      appliedAt: nowISO(),
      files: paths.length
    });

    // opcional: se existe RCF_VFS (SW channel), tenta enviar pro SW também
    // Isso NÃO é obrigatório pra funcionar agora; é upgrade.
    if (window.RCF_VFS && typeof window.RCF_VFS.put === "function") {
      for (const p of paths) {
        try {
          await window.RCF_VFS.put(p, safeText(b.files[p]), guessContentType(p));
        } catch {
          // se falhar, não quebra. localStorage já ficou aplicado.
        }
      }
    }

    return { ok: true, meta: b.meta, totalFiles: paths.length };
  }

  // ---------- ROLLBACK ----------
  function rollback(n = 1) {
    const steps = Math.max(1, Number(n || 1) | 0);
    const h = getHistory();
    if (!h.length) return { ok: false, msg: "Sem histórico para rollback." };

    const target = h[Math.min(steps - 1, h.length - 1)];
    if (!target || !target.overridesSnapshot) return { ok: false, msg: "Snapshot inválido." };

    saveOverrides(target.overridesSnapshot);

    // remove os snapshots consumidos
    const remaining = h.slice(steps);
    saveJSON(KEY_HISTORY, remaining);

    return { ok: true, msg: "Rollback aplicado. Voltei " + steps + " passo(s)." };
  }

  // ---------- EXPORT ----------
  function exportCurrent() {
    const meta = loadJSON(KEY_CURRENT_META, {});
    const ov = loadOverrides();
    const files = {};
    for (const p of Object.keys(ov || {})) {
      files[p] = safeText(ov[p]?.content);
    }
    return {
      meta: {
        name: meta?.name || "mother-bundle",
        version: meta?.version || "1.0",
        createdAt: meta?.createdAt || nowISO(),
        appliedAt: meta?.appliedAt || ""
      },
      files
    };
  }

  // ---------- RESET ----------
  function resetAll() {
    delKey(KEY_OVERRIDES);
    delKey(KEY_HISTORY);
    delKey(KEY_CURRENT_META);

    // se tem SW override, tenta limpar
    if (window.RCF_VFS && typeof window.RCF_VFS.clearAll === "function") {
      try { window.RCF_VFS.clearAll(); } catch {}
    }
  }

  // ---------- PARSE ----------
  function parseBundle(raw) {
    const obj = safeParse(raw);
    if (!obj) return { ok: false, error: "JSON inválido." };
    const b = normalizeBundle(obj);
    if (!b.files || typeof b.files !== "object") return { ok: false, error: "Bundle sem 'files'." };
    return { ok: true, bundle: b };
  }

  // ---------- expose ----------
  window.RCF_THOMPSON = {
    parseBundle,
    loadOverrides,
    dryRun,
    guardApply,
    apply,
    rollback,
    exportCurrent,
    resetAll,
    getHistory
  };

  // marca no log (se existir)
  try {
    if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
      window.RCF_LOGGER.push("log", "THOMPSON v1.0 carregado ✅");
    }
  } catch {}
})();

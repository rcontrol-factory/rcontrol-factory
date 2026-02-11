/* =========================================================
  RControl Factory — core/thompson.js (FULL) — THOMPSON v1.0
  Função: permitir a Mãe se auto-atualizar SEM copia/cola:
  - Overrides (bundle.files) salvos no localStorage
  - Snapshot automático + rollback
  - Dry-run (prévia) + guard SAFE (arquivos críticos)
  - Export do estado atual

  API global: window.RCF_THOMPSON
========================================================= */
(() => {
  "use strict";

  const KEY_OVR = "rcf:th:overrides";     // { "/path": {content, contentType, at} }
  const KEY_HIST = "rcf:th:history";      // [ {at, overrides} ] (top = mais recente)
  const KEY_LAST = "rcf:th:last_apply";   // string

  const MAX_HIST = 8;

  const CONTENT_TYPES = {
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8"
  };

  const CRITICAL_PREFIX = [
    "/index.html",
    "/app.js",
    "/sw.js",
    "/manifest.json",
    "/core/",
  ];

  function ext(path) {
    const m = String(path || "").toLowerCase().match(/\.[a-z0-9]+$/);
    return m ? m[0] : ".txt";
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function safeJsonStringify(obj) {
    try { return JSON.stringify(obj); } catch { return String(obj); }
  }

  function deepClone(o) {
    return safeJsonParse(safeJsonStringify(o), o);
  }

  function isObj(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }

  function normalizePath(p) {
    let s = String(p || "").trim();
    if (!s.startsWith("/")) s = "/" + s;
    return s;
  }

  function defaultTypeFor(path) {
    const e = ext(path);
    return CONTENT_TYPES[e] || "text/plain; charset=utf-8";
  }

  function replaceDateTokens(obj) {
    const iso = nowISO();
    const walk = (v) => {
      if (typeof v === "string") return v.replaceAll("{{DATE}}", iso);
      if (Array.isArray(v)) return v.map(walk);
      if (isObj(v)) {
        const out = {};
        for (const k of Object.keys(v)) out[k] = walk(v[k]);
        return out;
      }
      return v;
    };
    return walk(obj);
  }

  function ensureMeta(bundle) {
    const b = isObj(bundle) ? bundle : {};
    if (!isObj(b.meta)) b.meta = {};
    if (!b.meta.name) b.meta.name = "mother-bundle";
    if (!b.meta.version) b.meta.version = "1.0";
    if (!b.meta.createdAt) b.meta.createdAt = "{{DATE}}";
    return b;
  }

  // -------------------------
  // Storage
  // -------------------------
  function loadOverrides() {
    const raw = localStorage.getItem(KEY_OVR);
    const o = safeJsonParse(raw || "{}", {});
    return isObj(o) ? o : {};
  }

  function saveOverrides(overrides) {
    localStorage.setItem(KEY_OVR, JSON.stringify(overrides || {}));
    localStorage.setItem(KEY_LAST, nowISO());
  }

  function getHistory() {
    const raw = localStorage.getItem(KEY_HIST);
    const arr = safeJsonParse(raw || "[]", []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveHistory(arr) {
    localStorage.setItem(KEY_HIST, JSON.stringify(arr || []));
  }

  function pushSnapshot(currentOverrides) {
    const hist = getHistory();
    hist.unshift({ at: nowISO(), overrides: deepClone(currentOverrides || {}) });
    while (hist.length > MAX_HIST) hist.pop();
    saveHistory(hist);
    return hist[0];
  }

  function isCritical(path) {
    const p = normalizePath(path);
    return CRITICAL_PREFIX.some(prefix => p === prefix || p.startsWith(prefix));
  }

  // -------------------------
  // Bundle parsing
  // -------------------------
  function parseBundle(raw) {
    const txt = String(raw || "");
    const json = safeJsonParse(txt, null);
    if (!json || !isObj(json)) return { ok: false, error: "JSON inválido ou vazio." };
    if (!isObj(json.files)) json.files = {};
    return { ok: true, bundle: json };
  }

  // -------------------------
  // Dry-run & guard
  // -------------------------
  function dryRun(bundle, current) {
    const b = replaceDateTokens(ensureMeta(deepClone(bundle)));
    const cur = isObj(current) ? current : loadOverrides();

    const files = isObj(b.files) ? b.files : {};
    const added = [];
    const changed = [];
    const same = [];
    const critical = [];

    for (const k of Object.keys(files)) {
      const path = normalizePath(k);
      const content = String(files[k] ?? "");
      const curEntry = cur[path];
      if (!curEntry) added.push(path);
      else {
        const curContent = String(curEntry.content ?? "");
        if (curContent === content) same.push(path);
        else changed.push(path);
      }
      if (isCritical(path)) critical.push(path);
    }

    return {
      meta: b.meta,
      totalFiles: Object.keys(files).length,
      added, changed, same, critical
    };
  }

  function guardApply(bundle, mode) {
    const m = (mode === "auto") ? "auto" : "safe";
    const rep = dryRun(bundle, loadOverrides());
    const needsConfirm = (m === "safe" && rep.critical.length > 0);
    return { mode: m, needsConfirm, criticalFiles: rep.critical };
  }

  // -------------------------
  // Apply / rollback
  // -------------------------
  async function apply(bundle, opts = {}) {
    const b = replaceDateTokens(ensureMeta(deepClone(bundle)));
    const cur = loadOverrides();
    pushSnapshot(cur);

    const files = isObj(b.files) ? b.files : {};
    const next = deepClone(cur);

    for (const k of Object.keys(files)) {
      const path = normalizePath(k);
      const content = String(files[k] ?? "");
      next[path] = {
        content,
        contentType: defaultTypeFor(path),
        at: nowISO()
      };
    }

    saveOverrides(next);

    // Se GitHub Sync estiver configurado, “empurra” os arquivos mudados
    try {
      if (window.RCF_GITHUB_SYNC && window.RCF_GITHUB_SYNC.isConfigured()) {
        const rep = dryRun(b, cur);
        const toPush = [...rep.added, ...rep.changed];
        if (toPush.length) {
          await window.RCF_GITHUB_SYNC.pushFilesFromOverrides(toPush, next, b.meta);
        }
      }
    } catch (e) {
      // Não falha o apply por causa do GitHub; só loga
      try { console.warn("[THOMPSON] GitHub push falhou:", e); } catch {}
    }

    return { ok: true, meta: b.meta, appliedAt: localStorage.getItem(KEY_LAST) || nowISO() };
  }

  function rollback(steps = 1) {
    const n = Math.max(1, Number(steps || 1) | 0);
    const hist = getHistory();
    if (!hist.length) return { ok: false, msg: "Sem histórico para rollback." };
    const snap = hist[n - 1];
    if (!snap) return { ok: false, msg: "Rollback inválido. Hist atual: " + hist.length };

    saveOverrides(snap.overrides || {});
    // remove até n snapshots (as n primeiras)
    hist.splice(0, n);
    saveHistory(hist);

    return { ok: true, msg: `Rollback OK (voltei ${n}).` };
  }

  function exportCurrent() {
    const o = loadOverrides();
    const files = {};
    for (const p of Object.keys(o)) files[p] = String(o[p]?.content ?? "");
    return {
      meta: { name: "export-current", version: "1.0", createdAt: nowISO() },
      files
    };
  }

  function resetAll() {
    localStorage.removeItem(KEY_OVR);
    localStorage.removeItem(KEY_HIST);
    localStorage.removeItem(KEY_LAST);
  }

  // -------------------------
  // Expose
  // -------------------------
  window.RCF_THOMPSON = {
    parseBundle,
    dryRun,
    guardApply,
    apply,
    rollback,
    exportCurrent,
    resetAll,
    loadOverrides,
    getHistory
  };

  try {
    if (window.RCF && typeof window.RCF.log === "function") window.RCF.log("THOMPSON v1.0 carregado ✅");
    else console.log("[RCF] THOMPSON v1.0 carregado ✅");
  } catch {}
})();

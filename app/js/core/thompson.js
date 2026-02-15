/* =========================================================
  RControl Factory — app/js/core/thompson.js — THOMPSON v1.2 (SAFE)
  Função: permitir a Mãe se auto-atualizar SEM copia/cola:
  - Aceita bundle.files como ARRAY [{path,content,contentType}] OU MAP {"/p":"..."}
  - Aplica de verdade via RCF_VFS_OVERRIDES.put (fallback RCF_VFS.put)
  - Snapshot + rollback (reaplica snapshot no VFS)
  - Dry-run + guard SAFE + respeita RCF_POLICY (se existir)

  API global: window.RCF_THOMPSON
========================================================= */
(() => {
  "use strict";

  const KEY_OVR  = "rcf:th:overrides";   // { "/path": {content, contentType, at} }
  const KEY_HIST = "rcf:th:history";     // [ {at, overrides} ] (top = mais recente)
  const KEY_LAST = "rcf:th:last_apply";  // string ISO
  const MAX_HIST = 8;

  const CONTENT_TYPES = {
    ".js":   "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt":  "text/plain; charset=utf-8"
  };

  // SAFE (legacy) — ainda usamos como fallback quando não tem RCF_POLICY
  const CRITICAL_PREFIX = [
    "/index.html",
    "/app.js",
    "/sw.js",
    "/manifest.json",
    "/core/",
    "/app/js/core/"
  ];

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

  function nowISO() { return new Date().toISOString(); }

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function deepClone(o) {
    return safeJsonParse(JSON.stringify(o), o);
  }

  function ext(path) {
    const m = String(path || "").toLowerCase().match(/\.[a-z0-9]+$/);
    return m ? m[0] : ".txt";
  }

  function normalizePath(p) {
    let s = String(p || "").trim();
    if (!s) return "";
    s = s.split("#")[0].split("?")[0].trim();
    if (!s.startsWith("/")) s = "/" + s;
    s = s.replace(/\/{2,}/g, "/");
    // trava path traversal
    if (s.includes("..")) return "";
    return s;
  }

  function defaultTypeFor(path) {
    const e = ext(path);
    return CONTENT_TYPES[e] || "text/plain; charset=utf-8";
  }

  function replaceDateTokens(obj) {
    const iso = nowISO();
    const walk = (v) => {
      if (typeof v === "string") {
        // replaceAll pode falhar em alguns iOS -> split/join
        return v.split("{{DATE}}").join(iso);
      }
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
    if (!("files" in b)) b.files = {};
    return b;
  }

  // -------------------------
  // VFS (aplica de verdade no runtime)
  // -------------------------
  function pickVFS() {
    if (window.RCF_VFS_OVERRIDES && typeof window.RCF_VFS_OVERRIDES.put === "function") {
      return {
        kind: "OVERRIDES",
        put: window.RCF_VFS_OVERRIDES.put.bind(window.RCF_VFS_OVERRIDES),
        clear: (typeof window.RCF_VFS_OVERRIDES.clear === "function")
          ? window.RCF_VFS_OVERRIDES.clear.bind(window.RCF_VFS_OVERRIDES)
          : null
      };
    }
    if (window.RCF_VFS && typeof window.RCF_VFS.put === "function") {
      return {
        kind: "VFS",
        put: window.RCF_VFS.put.bind(window.RCF_VFS),
        clear: (typeof window.RCF_VFS.clearAll === "function")
          ? window.RCF_VFS.clearAll.bind(window.RCF_VFS)
          : (typeof window.RCF_VFS.clearOverrides === "function")
            ? window.RCF_VFS.clearOverrides.bind(window.RCF_VFS)
            : null
      };
    }
    return null;
  }

  async function vfsApplyAll(overrides) {
    const vfs = pickVFS();
    if (!vfs) throw new Error("VFS não disponível (RCF_VFS_OVERRIDES/RCF_VFS). Recarregue 1x após SW controlar.");

    const entries = overrides && isObj(overrides) ? overrides : {};
    const paths = Object.keys(entries);

    for (const p0 of paths) {
      const p = normalizePath(p0);
      if (!p) continue;

      const content = String(entries[p0]?.content ?? "");
      const contentType = String(entries[p0]?.contentType || defaultTypeFor(p));

      await Promise.resolve(vfs.put(p, content, contentType));
    }

    return { ok: true, kind: vfs.kind, total: paths.length };
  }

  async function vfsClear() {
    const vfs = pickVFS();
    if (!vfs || !vfs.clear) return { ok: false, msg: "Clear não disponível no VFS atual." };
    await Promise.resolve(vfs.clear());
    return { ok: true };
  }

  // -------------------------
  // Overrides Storage
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

  function isCriticalLegacy(path) {
    const p = normalizePath(path);
    if (!p) return false;
    return CRITICAL_PREFIX.some(prefix => p === prefix || p.startsWith(prefix));
  }

  // -------------------------
  // Bundle normalize: aceita ARRAY ou MAP
  // -------------------------
  function bundleToMapFiles(bundle) {
    const b = isObj(bundle) ? bundle : {};
    const files = b.files;

    // 1) files como array [{path,content,contentType}]
    if (Array.isArray(files)) {
      const out = {};
      for (const f of files) {
        const p = normalizePath(f?.path || f?.name || "");
        if (!p) continue;
        out[p] = {
          content: String(f?.content ?? ""),
          contentType: String(f?.contentType || f?.type || defaultTypeFor(p)),
          at: nowISO()
        };
      }
      return out;
    }

    // 2) files como map { "/p": "..." } ou { "/p": {content,...} }
    if (isObj(files)) {
      const out = {};
      for (const k of Object.keys(files)) {
        const p = normalizePath(k);
        if (!p) continue;

        const v = files[k];
        if (typeof v === "string") {
          out[p] = { content: String(v), contentType: defaultTypeFor(p), at: nowISO() };
        } else if (isObj(v)) {
          out[p] = {
            content: String(v.content ?? v.text ?? v.body ?? ""),
            contentType: String(v.contentType || v.type || defaultTypeFor(p)),
            at: nowISO()
          };
        } else {
          out[p] = { content: String(v ?? ""), contentType: defaultTypeFor(p), at: nowISO() };
        }
      }
      return out;
    }

    // 3) bundle inteiro pode ser map direto (edge)
    if (isObj(b) && !("files" in b)) {
      const out = {};
      for (const k of Object.keys(b)) {
        const p = normalizePath(k);
        if (!p) continue;
        out[p] = { content: String(b[k] ?? ""), contentType: defaultTypeFor(p), at: nowISO() };
      }
      return out;
    }

    return {};
  }

  // -------------------------
  // Bundle parsing
  // -------------------------
  function parseBundle(raw) {
    const txt = String(raw || "");
    const json = safeJsonParse(txt, null);
    if (!json || !isObj(json)) return { ok: false, error: "JSON inválido ou vazio." };
    return { ok: true, bundle: json };
  }

  // -------------------------
  // Dry-run & guard (com RCF_POLICY se existir)
  // -------------------------
  function classify(path) {
    // Se existir policy oficial, usa ela
    try {
      if (window.RCF_POLICY && typeof window.RCF_POLICY.classify === "function") {
        const r = window.RCF_POLICY.classify(path);
        // r.mode: FREE | CONDITIONAL | BLOCKED
        if (r && r.path && r.mode) return { ok: true, mode: r.mode, path: r.path, reason: r.reason || "" };
      }
    } catch {}
    // fallback legacy
    return { ok: true, mode: isCriticalLegacy(path) ? "CONDITIONAL" : "FREE", path: normalizePath(path) };
  }

  function dryRun(bundle, current) {
    const b = replaceDateTokens(ensureMeta(deepClone(bundle)));
    const cur = isObj(current) ? current : loadOverrides();

    const filesMap = bundleToMapFiles(b); // { "/p": {content,...} }
    const paths = Object.keys(filesMap);

    const added = [];
    const changed = [];
    const same = [];
    const critical = [];
    const blocked = [];

    for (const path0 of paths) {
      const path = normalizePath(path0);
      if (!path) continue;

      const rule = classify(path);
      if (rule.mode === "BLOCKED") blocked.push(path);
      if (rule.mode === "CONDITIONAL") critical.push(path);

      const content = String(filesMap[path0]?.content ?? "");
      const curEntry = cur[path];

      if (!curEntry) added.push(path);
      else {
        const curContent = String(curEntry.content ?? "");
        if (curContent === content) same.push(path);
        else changed.push(path);
      }
    }

    return {
      meta: b.meta,
      totalFiles: paths.length,
      added, changed, same,
      critical,
      blocked
    };
  }

  function guardApply(bundle, mode) {
    const m = (mode === "auto") ? "auto" : "safe";
    const rep = dryRun(bundle, loadOverrides());
    const needsConfirm = (m === "safe" && rep.critical.length > 0);
    return {
      mode: m,
      needsConfirm,
      criticalFiles: rep.critical,
      blockedFiles: rep.blocked
    };
  }

  // -------------------------
  // Apply / rollback / export
  // -------------------------
  async function apply(bundle, opts = {}) {
    const mode = (opts.mode === "auto") ? "auto" : "safe";

    const b = replaceDateTokens(ensureMeta(deepClone(bundle)));
    const report = dryRun(b, loadOverrides());

    // Em safe mode, se tem CONDITIONAL (critical), exige confirmação
    if (mode === "safe" && report.critical.length) {
      return {
        ok: false,
        needsConfirm: true,
        msg: "Há arquivos condicionais/críticos. Use apply(bundle, {mode:'auto'}) OU aprove na UI.",
        report
      };
    }

    const cur = loadOverrides();
    pushSnapshot(cur);

    const filesMap = bundleToMapFiles(b);
    const next = deepClone(cur);

    // aplica no store Thompson (para rollback)
    for (const p0 of Object.keys(filesMap)) {
      const p = normalizePath(p0);
      if (!p) continue;

      const rule = classify(p);
      if (rule.mode === "BLOCKED") continue; // respeita policy

      next[p] = {
        content: String(filesMap[p0]?.content ?? ""),
        contentType: String(filesMap[p0]?.contentType || defaultTypeFor(p)),
        at: nowISO()
      };
    }

    saveOverrides(next);

    // aplica no VFS de verdade
    // (opção: clearFirst para "resetar" antes)
    if (opts.clearFirst) {
      try { await vfsClear(); } catch {}
    }
    await vfsApplyAll(next);

    return {
      ok: true,
      meta: b.meta,
      appliedAt: localStorage.getItem(KEY_LAST) || nowISO(),
      report
    };
  }

  async function rollback(steps = 1) {
    const n = Math.max(1, Number(steps || 1) | 0);
    const hist = getHistory();
    if (!hist.length) return { ok: false, msg: "Sem histórico para rollback." };

    const snap = hist[n - 1];
    if (!snap) return { ok: false, msg: "Rollback inválido. Hist atual: " + hist.length };

    // restaura store
    saveOverrides(snap.overrides || {});
    hist.splice(0, n);
    saveHistory(hist);

    // reaplica no VFS (para refletir no runtime)
    try {
      await vfsClear();
    } catch {}
    await vfsApplyAll(snap.overrides || {});

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
    try { localStorage.removeItem(KEY_OVR); } catch {}
    try { localStorage.removeItem(KEY_HIST); } catch {}
    try { localStorage.removeItem(KEY_LAST); } catch {}
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

  try { console.log("[RCF] THOMPSON v1.2 carregado ✅"); } catch {}
})();

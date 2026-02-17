/* RControl Factory — /app/js/core/github_sync.js — v2.4g (PATCH: pushMotherBundle exports FULL snapshot) */
(() => {
  "use strict";

  if (window.RCF_GH_SYNC && window.RCF_GH_SYNC.__v24g) return;

  const LS_CFG_KEY = "rcf:ghcfg";
  const API_BASE = "https://api.github.com";
  const FIXED_BUNDLE_PATH = "app/import/mother_bundle.json";

  const log = (lvl, msg, obj) => {
    try {
      if (obj !== undefined) {
        window.RCF_LOGGER?.push?.(lvl, msg + " " + JSON.stringify(obj));
      } else {
        window.RCF_LOGGER?.push?.(lvl, msg);
      }
    } catch {}
    try { console.log("[GH]", lvl, msg, obj ?? ""); } catch {}
  };

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  }

  function normalizeBundlePath(input) {
    const raw = String(input || "").trim();
    return { raw, normalized: FIXED_BUNDLE_PATH };
  }

  function loadConfig() {
    const c = safeParse(localStorage.getItem(LS_CFG_KEY), {}) || {};
    const norm = normalizeBundlePath(c.path || FIXED_BUNDLE_PATH);

    const cfg = {
      owner: String(c.owner || "").trim(),
      repo: String(c.repo || "").trim(),
      branch: String(c.branch || "main").trim(),
      path: norm.normalized,
      token: String(c.token || "").trim()
    };

    log("info", "bundle path normalized", { raw: norm.raw, path: cfg.path, fixed: true });
    return cfg;
  }

  function saveConfig(cfg) {
    const inCfg = cfg || {};
    const norm = normalizeBundlePath(inCfg.path || FIXED_BUNDLE_PATH);

    const safe = {
      owner: String(inCfg.owner || "").trim(),
      repo: String(inCfg.repo || "").trim(),
      branch: String(inCfg.branch || "main").trim(),
      path: norm.normalized,
      token: String(inCfg.token || "").trim()
    };

    localStorage.setItem(LS_CFG_KEY, JSON.stringify(safe));
    log("ok", "OK: ghcfg saved");
    return safe;
  }

  function headers(cfg) {
    const h = { "Accept": "application/vnd.github+json" };
    if (cfg.token) h["Authorization"] = "token " + cfg.token;
    return h;
  }

  async function ghFetch(url, cfg, opts) {
    const res = await fetch(url, {
      method: opts?.method || "GET",
      headers: {
        ...headers(cfg),
        ...(opts?.headers || {})
      },
      body: opts?.body
    });

    const text = await res.text();

    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try {
        const j = JSON.parse(text);
        if (j?.message) msg += ": " + j.message;
      } catch {}
      const err = new Error(msg);
      err.status = res.status;
      err.body = text;
      throw err;
    }

    return text;
  }

  function contentUrl(cfg) {
    if (!cfg.owner || !cfg.repo) {
      throw new Error("ghcfg incompleto (owner/repo)");
    }

    const branch = encodeURIComponent(cfg.branch || "main");

    return API_BASE +
      "/repos/" + encodeURIComponent(cfg.owner) +
      "/" + encodeURIComponent(cfg.repo) +
      "/contents/" + cfg.path +
      "?ref=" + branch;
  }

  function decodeB64Utf8(b64) {
    const clean = String(b64 || "").replace(/\n/g, "");
    let bin;
    try { bin = atob(clean); }
    catch { throw new Error("Falha ao decodificar base64"); }

    try { return decodeURIComponent(escape(bin)); }
    catch { return bin; }
  }

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    if (p.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
    if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  function assertValidBundleJSON(txt, where) {
    let j;
    try { j = JSON.parse(txt); }
    catch {
      throw new Error("Bundle inválido (" + where + ")");
    }

    if (!j || typeof j !== "object") {
      throw new Error("Bundle não é objeto JSON (" + where + ")");
    }

    if (!Array.isArray(j.files)) {
      throw new Error("Bundle sem files[] (" + where + ")");
    }

    return j;
  }

  async function pull(cfgIn) {
    const cfg = saveConfig(cfgIn || loadConfig());
    const url = contentUrl(cfg);

    log("info", "GitHub: pull iniciando... path=" + cfg.path);

    const txt = await ghFetch(url, cfg, { method: "GET" });
    const j = safeParse(txt, null);

    if (Array.isArray(j)) {
      throw new Error("Path é diretório (array retornado)");
    }

    if (j && j.content) {
      const decoded = decodeB64Utf8(j.content);
      assertValidBundleJSON(decoded, "content");
      log("info", "GitHub: pull ok (content)");
      return decoded;
    }

    if (j && j.download_url) {
      const raw = await ghFetch(j.download_url, cfg, {
        method: "GET",
        headers: { "Accept": "application/vnd.github.raw" }
      });
      assertValidBundleJSON(raw, "download_url");
      log("info", "GitHub: pull ok (download_url)");
      return raw;
    }

    if (j && j.git_url) {
      const blobTxt = await ghFetch(j.git_url, cfg, { method: "GET" });
      const blob = safeParse(blobTxt, null);
      if (!blob?.content) throw new Error("Blob inválido");

      const decoded = decodeB64Utf8(blob.content);
      assertValidBundleJSON(decoded, "git_url");
      log("info", "GitHub: pull ok (git_url)");
      return decoded;
    }

    throw new Error("Resposta inválida do GitHub");
  }

  async function getShaIfExists(cfg) {
    try {
      const url = contentUrl(cfg);
      const txt = await ghFetch(url, cfg, { method: "GET" });
      const j = safeParse(txt, null);
      return j?.sha || null;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function push(cfgIn, contentStr) {
    const cfg = saveConfig(cfgIn || loadConfig());

    assertValidBundleJSON(String(contentStr || ""), "push");

    const sha = await getShaIfExists(cfg);

    const url = API_BASE +
      "/repos/" + encodeURIComponent(cfg.owner) +
      "/" + encodeURIComponent(cfg.repo) +
      "/contents/" + cfg.path;

    const body = {
      message: "rcf: update " + cfg.path,
      content: btoa(unescape(encodeURIComponent(String(contentStr || "")))),
      branch: cfg.branch || "main"
    };

    if (sha) body.sha = sha;

    await ghFetch(url, cfg, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    log("info", "GitHub: push ok.");
    return { ok: true };
  }

  // =========================================================
  // PATCH: Export FULL snapshot from overrides (not only cached bundle)
  // =========================================================
  function isPlainObject(x) {
    return !!x && typeof x === "object" && !Array.isArray(x);
  }

  function normalizePath(p) {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.replace(/^\/+/, "");
    return x;
  }

  function buildBundleFromFiles(filesArr) {
    const files = (filesArr || [])
      .map((f) => {
        const path = normalizePath(f?.path || f?.name || "");
        if (!path) return null;
        const content = (f?.content != null) ? String(f.content) : "";
        const contentType = String(f?.contentType || f?.type || guessType(path));
        return { path, content, contentType };
      })
      .filter(Boolean);

    return {
      version: "rcf_bundle_v1",
      ts: Date.now(),
      files
    };
  }

  function tryExportSnapshotFiles() {
    // 1) Prefer explicit snapshot module if exists
    try {
      const snap = window.RCF_SNAPSHOT;
      if (snap && typeof snap.take === "function") {
        const r = snap.take();
        if (r && Array.isArray(r.files)) return r.files;
      }
      if (snap && typeof snap.export === "function") {
        const r = snap.export();
        if (r && Array.isArray(r.files)) return r.files;
      }
    } catch {}

    // 2) Look for common override export APIs
    try {
      const o = window.RCF_VFS_OVERRIDES;
      if (o) {
        if (typeof o.exportOverrides === "function") {
          const r = o.exportOverrides();
          if (Array.isArray(r)) return r;
          if (r && Array.isArray(r.files)) return r.files;
          if (isPlainObject(r)) {
            // maybe {path: {content, contentType}}
            const out = [];
            for (const [k, v] of Object.entries(r)) {
              const path = normalizePath(k);
              if (!path) continue;
              if (typeof v === "string") out.push({ path, content: v, contentType: guessType(path) });
              else if (isPlainObject(v)) out.push({ path, content: String(v.content ?? v.text ?? v.body ?? ""), contentType: String(v.contentType || v.type || guessType(path)) });
              else out.push({ path, content: String(v ?? ""), contentType: guessType(path) });
            }
            return out;
          }
        }

        if (typeof o.dump === "function") {
          const r = o.dump();
          if (Array.isArray(r)) return r;
          if (r && Array.isArray(r.files)) return r.files;
          if (isPlainObject(r)) {
            const out = [];
            for (const [k, v] of Object.entries(r)) {
              const path = normalizePath(k);
              if (!path) continue;
              if (typeof v === "string") out.push({ path, content: v, contentType: guessType(path) });
              else if (isPlainObject(v)) out.push({ path, content: String(v.content ?? v.text ?? v.body ?? ""), contentType: String(v.contentType || v.type || guessType(path)) });
              else out.push({ path, content: String(v ?? ""), contentType: guessType(path) });
            }
            return out;
          }
        }

        // Try known properties: overrides / map / entries
        const maybeMap =
          o.overrides ||
          o.map ||
          o.entries ||
          o._overrides ||
          o._map;

        if (isPlainObject(maybeMap)) {
          const out = [];
          for (const [k, v] of Object.entries(maybeMap)) {
            const path = normalizePath(k);
            if (!path) continue;
            if (typeof v === "string") out.push({ path, content: v, contentType: guessType(path) });
            else if (isPlainObject(v)) out.push({ path, content: String(v.content ?? v.text ?? v.body ?? ""), contentType: String(v.contentType || v.type || guessType(path)) });
            else out.push({ path, content: String(v ?? ""), contentType: guessType(path) });
          }
          return out;
        }
      }
    } catch {}

    // 3) As a last resort, check generic VFS
    try {
      const v = window.RCF_VFS;
      if (v && typeof v.exportOverrides === "function") {
        const r = v.exportOverrides();
        if (Array.isArray(r)) return r;
        if (r && Array.isArray(r.files)) return r.files;
      }
    } catch {}

    return null;
  }

  async function pushMotherBundle(cfgIn) {
    const cfg = saveConfig(cfgIn || loadConfig());

    // ✅ NEW: export FULL snapshot from overrides (what is really applied)
    const snapFiles = tryExportSnapshotFiles();
    if (Array.isArray(snapFiles) && snapFiles.length > 0) {
      const bundleObj = buildBundleFromFiles(snapFiles);
      const bundleTxt = JSON.stringify(bundleObj);

      assertValidBundleJSON(bundleTxt, "pushMotherBundle(snapshot)");
      log("ok", "pushMotherBundle: exported snapshot", { filesCount: bundleObj.files.length });

      await push(cfg, bundleTxt);
      log("ok", "GitHub: pushMotherBundle ok");
      return { ok: true, filesCount: bundleObj.files.length, source: "snapshot" };
    }

    // Fallback antigo (mantido)
    if (!window.RCF_MAE?.getLocalBundleText) {
      throw new Error("RCF_MAE.getLocalBundleText ausente");
    }

    const bundleTxt = await window.RCF_MAE.getLocalBundleText();
    if (!bundleTxt) throw new Error("Bundle local vazio");

    assertValidBundleJSON(bundleTxt, "pushMotherBundle(fallback)");
    const j = safeParse(bundleTxt, null);

    log("warn", "pushMotherBundle: usando fallback (bundle local)", { filesCount: j?.files?.length ?? "?" });

    await push(cfg, bundleTxt);
    log("ok", "GitHub: pushMotherBundle ok");
    return { ok: true, filesCount: (j?.files?.length || 0), source: "fallback_localBundle" };
  }

  window.RCF_GH_SYNC = {
    __v24g: true,
    loadConfig,
    saveConfig,
    pull,
    push,
    pushMotherBundle
  };

  log("info", "github_sync.js loaded (v2.4g)");
})();

// ---------------------------------------------------------
// HOTFIX: compat API (admin.github.js espera RCF_GH_SYNC.test)
// ---------------------------------------------------------
(() => {
  try {
    const GH = window.RCF_GH_SYNC;
    if (!GH || typeof GH !== "object") return;

    if (typeof GH.test === "function") return;

    GH.test = async function testToken(opts = {}) {
      const cfg = (() => {
        try {
          const raw = localStorage.getItem("rcf:ghcfg");
          return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
      })();

      const token = (opts.token || cfg.token || cfg.ghToken || cfg.pat || "").trim();
      if (!token) return { ok: false, err: "token ausente (rcf:ghcfg.token)" };

      try {
        const res = await fetch("https://api.github.com/user", {
          headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": `token ${token}`
          },
          cache: "no-store"
        });

        const rateLimit = {
          limit: res.headers.get("x-ratelimit-limit"),
          remaining: res.headers.get("x-ratelimit-remaining"),
          reset: res.headers.get("x-ratelimit-reset")
        };

        if (!res.ok) {
          let body = "";
          try { body = await res.text(); } catch {}
          return { ok: false, status: res.status, err: "token inválido / sem permissão", rateLimit, body: body.slice(0, 300) };
        }

        const me = await res.json().catch(() => ({}));
        return { ok: true, user: { login: me.login, id: me.id }, rateLimit };
      } catch (e) {
        return { ok: false, err: String(e?.message || e) };
      }
    };

    try { window.RCF_LOGGER?.push?.("OK", "RCF_GH_SYNC.test hotfix instalado ✅"); } catch {}
  } catch {}
})();

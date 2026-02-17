/* RControl Factory — /app/js/core/github_sync.js — v2.4h (FINAL STABLE + FILLERS)
   PATCH sobre v2.4g:
   - ✅ FILLERS: gera bundle completo automaticamente (lista padrão + auto-discovery) quando o bundle local estiver “mínimo”
   - ✅ pushMotherBundle passa a empurrar esse bundle completo pro GitHub (resolve root: mother_bundle.json com files=1)
   - ✅ expõe listFillers() para UI futura (search/ordem alfabética)
   - Mantém path FIXO: app/import/mother_bundle.json
*/
(() => {
  "use strict";

  if (window.RCF_GH_SYNC && window.RCF_GH_SYNC.__v24h) return;

  const LS_CFG_KEY = "rcf:ghcfg";
  const API_BASE = "https://api.github.com";
  const FIXED_BUNDLE_PATH = "app/import/mother_bundle.json";

  // bundle local (compat com MAE)
  const LS_BUNDLE_KEY = "rcf:mother_bundle_local";

  const log = (lvl, msg, obj) => {
    try {
      if (obj !== undefined) window.RCF_LOGGER?.push?.(lvl, msg + " " + JSON.stringify(obj));
      else window.RCF_LOGGER?.push?.(lvl, msg);
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
      headers: { ...headers(cfg), ...(opts?.headers || {}) },
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
    if (!cfg.owner || !cfg.repo) throw new Error("ghcfg incompleto (owner/repo)");
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
    if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
    if (p.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
    if (p.endsWith(".md")) return "text/markdown; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  function assertValidBundleJSON(txt, where) {
    let j;
    try { j = JSON.parse(txt); }
    catch { throw new Error("Bundle inválido (" + where + ")"); }

    if (!j || typeof j !== "object") throw new Error("Bundle não é objeto JSON (" + where + ")");
    if (!Array.isArray(j.files)) throw new Error("Bundle sem files[] (" + where + ")");
    return j;
  }

  async function pull(cfgIn) {
    const cfg = saveConfig(cfgIn || loadConfig());
    const url = contentUrl(cfg);

    log("info", "GitHub: pull iniciando... path=" + cfg.path);

    const txt = await ghFetch(url, cfg, { method: "GET" });
    const j = safeParse(txt, null);

    if (Array.isArray(j)) throw new Error("Path é diretório (array retornado)");

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
  // FILLERS (lista padrão + auto-discovery runtime)
  // Objetivo: não ficar voltando em "files=1" nunca mais.
  // =========================================================

  // ✅ Lista padrão “do core” (você pode ir acrescentando sem quebrar)
  // (paths no formato do repo: app/...)
  const DEFAULT_FILLERS = [
    // base
    "app/index.html",
    "app/styles.css",
    "app/app.js",

    // core
    "app/js/core/logger.js",
    "app/js/core/stability_guard.js",
    "app/js/core/storage.js",
    "app/js/core/github_sync.js",
    "app/js/core/vfs_overrides.js",
    "app/js/core/vfs_shim.js",
    "app/js/core/mother_selfupdate.js",
    "app/js/core/errors.js",
    "app/js/core/risk.js",
    "app/js/core/snapshot.js",
    "app/js/core/selfheal.js",
    "app/js/core/ui_safety.js",
    "app/js/core/ui_compact_outputs.js",
    "app/js/core/ui_bindings.js",
    "app/js/core/diagnostics.js",
    "app/js/core/publish_queue.js",
    "app/js/core/preview_runner.js",
    "app/js/core/policy.js",
    "app/js/core/settings_cleanup.js",
    "app/js/core/injector.js",

    // engine
    "app/js/engine/template_registry.js",
    "app/js/engine/module_registry.js",
    "app/js/engine/builder.js",
    "app/js/engine/engine.js",

    // admin
    "app/js/admin.github.js",
  ];

  function uniqSorted(list) {
    const set = new Set();
    for (const x of (list || [])) {
      const p = String(x || "").trim();
      if (!p) continue;
      set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function discoverRuntimeFillers() {
    const out = [];

    // 1) scripts com src (pega tudo que está carregando)
    try {
      const scripts = Array.from(document.querySelectorAll("script[src]"));
      for (const s of scripts) {
        const src = String(s.getAttribute("src") || "").trim();
        if (!src) continue;

        // normaliza pra repo
        // aceita: ./js/core/x.js, /js/core/x.js, app/js/core/x.js
        let p = src.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
        if (p.startsWith("js/")) p = "app/" + p;
        if (p.startsWith("app/js/") || p.startsWith("app/index") || p.startsWith("app/styles") || p.startsWith("app/app.js")) {
          out.push(p);
        }
      }
    } catch {}

    // 2) hints do boot (se existir algum array global)
    // tenta ler nomes comuns sem quebrar
    try {
      const candidates = [
        window.__RCF_BOOT_MODULES,
        window.RCF_BOOT_MODULES,
        window.__boot_modules,
      ];
      for (const arr of candidates) {
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          const src = (typeof item === "string") ? item : (item && item.src) ? item.src : "";
          let p = String(src || "").trim();
          if (!p) continue;
          p = p.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
          if (p.startsWith("js/")) p = "app/" + p;
          if (p.startsWith("app/")) out.push(p);
        }
      }
    } catch {}

    return uniqSorted(out);
  }

  async function fetchTextForPath(repoPath) {
    // Converte repo path (app/...) -> runtime url (./app/...) e tenta fetch
    const p = String(repoPath || "").trim().replace(/^\/+/, "");
    if (!p) return null;

    const url = "./" + p + (p.includes("?") ? "" : ("?cb=" + Date.now()));
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const txt = await res.text();
      return String(txt ?? "");
    } catch {
      return null;
    }
  }

  async function buildFactoryBundle(opts = {}) {
    const includeDefault = (opts.includeDefault !== false);
    const includeDiscovered = (opts.includeDiscovered !== false);
    const maxFiles = Number.isFinite(opts.maxFiles) ? Number(opts.maxFiles) : 250;

    const discovered = includeDiscovered ? discoverRuntimeFillers() : [];
    const baseList = [
      ...(includeDefault ? DEFAULT_FILLERS : []),
      ...discovered
    ];

    const paths = uniqSorted(baseList).slice(0, maxFiles);

    const files = [];
    let okCount = 0;
    let missCount = 0;

    for (const path of paths) {
      const content = await fetchTextForPath(path);
      if (content == null) { missCount++; continue; }
      okCount++;
      files.push({ path, content, contentType: guessType(path) });
    }

    const bundle = { version: "rcf_bundle_v1", ts: Date.now(), files };

    log("warn", "FILLERS: bundle build", {
      candidates: paths.length,
      ok: okCount,
      miss: missCount,
      files: files.length,
      discovered: discovered.length
    });

    return bundle;
  }

  function listFillers() {
    // Para UI futura: alfabético + “todos os conhecidos”
    const discovered = discoverRuntimeFillers();
    return {
      ok: true,
      defaults: uniqSorted(DEFAULT_FILLERS),
      discovered,
      all: uniqSorted([ ...DEFAULT_FILLERS, ...discovered ])
    };
  }

  function getLocalBundleTextCompat() {
    try {
      const txt = String(localStorage.getItem(LS_BUNDLE_KEY) || "").trim();
      return txt || "";
    } catch {
      return "";
    }
  }

  async function pushMotherBundle(cfgIn) {
    const cfg = saveConfig(cfgIn || loadConfig());

    // 1) tenta via MAE (padrão)
    let bundleTxt = "";
    try {
      if (window.RCF_MAE?.getLocalBundleText) {
        bundleTxt = String(await window.RCF_MAE.getLocalBundleText() || "").trim();
      } else {
        bundleTxt = getLocalBundleTextCompat();
      }
    } catch {
      bundleTxt = getLocalBundleTextCompat();
    }

    // 2) valida e mede tamanho
    let localFilesCount = 0;
    let localOk = false;
    try {
      if (bundleTxt) {
        const j = assertValidBundleJSON(bundleTxt, "pushMotherBundle(local)");
        localFilesCount = Array.isArray(j.files) ? j.files.length : 0;
        localOk = true;
      }
    } catch {
      localOk = false;
      localFilesCount = 0;
    }

    // 3) se bundle local estiver “mínimo”, gera bundle completo (FILLERS)
    // threshold: <= 2 é praticamente “bundle mínimo” (teu caso é 1)
    const THRESHOLD_MIN = 2;

    if (!localOk || localFilesCount <= THRESHOLD_MIN) {
      log("warn", "pushMotherBundle: usando FILLERS builder (bundle local mínimo)", { localOk, localFilesCount });

      const built = await buildFactoryBundle({ includeDefault: true, includeDiscovered: true, maxFiles: 250 });
      const builtTxt = JSON.stringify(built);

      // salva local também (pra scanner ver e pra você ter fallback)
      try { localStorage.setItem(LS_BUNDLE_KEY, builtTxt); } catch {}

      // valida antes de push
      assertValidBundleJSON(builtTxt, "pushMotherBundle(built)");
      await push(cfg, builtTxt);

      log("ok", "GitHub: pushMotherBundle ok (FILLERS)");
      return { ok: true, mode: "fillers", filesCount: built.files.length };
    }

    // 4) bundle local normal -> push normal
    assertValidBundleJSON(bundleTxt, "pushMotherBundle");
    await push(cfg, bundleTxt);

    log("ok", "GitHub: pushMotherBundle ok");
    return { ok: true, mode: "local", filesCount: localFilesCount };
  }

  window.RCF_GH_SYNC = {
    __v24h: true,
    loadConfig,
    saveConfig,
    pull,
    push,
    pushMotherBundle,
    listFillers,          // ✅ novo (UI futura)
    buildFactoryBundle    // ✅ novo (debug/manual)
  };

  log("info", "github_sync.js loaded (v2.4h)");
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

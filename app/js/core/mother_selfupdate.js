/* RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v1.1
  - Define a "Mãe" (Self-Update): window.RCF_MAE / window.RCF_MOTHER
  - Usa GitHub Sync (RCF_GH_SYNC) para puxar mother_bundle.json
  - Salva bundle em localStorage (rcf:mother_bundle) para o app.js ler
  - Aplica arquivos no VFS de overrides com retry/backoff (iOS)
  - ✅ PADRÃO: MotherRoot = /app (source of truth = /app/index.html)
  - ✅ normalizeMotherPath(p) em TUDO + log "path normalized: from -> to"
  - ✅ nunca escreve /index.html (vira /app/index.html)
*/
(() => {
  "use strict";

  if (window.RCF_MAE && window.RCF_MAE.__v1_1) return;

  const log = (lvl, msg, extra) => {
    try { window.RCF_LOGGER?.push?.(lvl, String(msg)); } catch {}
    try { console.log("[MAE]", lvl, msg, extra || ""); } catch {}
  };

  const LS_BUNDLE_KEY = "rcf:mother_bundle"; // raw JSON text (string)
  const LS_CFG_KEY    = "rcf:ghcfg";         // {owner,repo,branch,path,token}

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function getCfg() {
    const cfg = safeParse(localStorage.getItem(LS_CFG_KEY), {}) || {};
    return {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),

      // ✅ PADRÃO: dentro de /app/, o path local do bundle é relativo:
      // import/mother_bundle.json  => new URL(path, baseURI) => /app/import/mother_bundle.json
      path: String(cfg.path || "import/mother_bundle.json").trim(),

      token: String(cfg.token || "").trim(),
    };
  }

  // =========================================================
  // ✅ PADRÃO: normalizeMotherPath (source of truth)
  // Regras:
  // - "/index.html" => "/app/index.html"
  // - "/styles.css" "/app.js" "/sw.js" "/manifest.json" => "/app/<file>"
  // - "/js/..." => "/app/js/..."
  // - qualquer path sem "/app/" => força "/app/"
  // =========================================================
  function normalizeMotherPath(p) {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");

    // converte /index.html => /app/index.html
    if (x === "/index.html") x = "/app/index.html";

    // arquivos raiz comuns
    const ROOT_FILES = new Set([
      "/styles.css",
      "/app.js",
      "/sw.js",
      "/manifest.json",
      "/favicon.ico",
    ]);
    if (ROOT_FILES.has(x)) x = "/app" + x;

    // /js/... => /app/js/...
    if (x.startsWith("/js/")) x = "/app" + x;

    // se não começa com /app/, força /app/
    if (!x.startsWith("/app/")) {
      x = "/app" + (x.startsWith("/") ? x : ("/" + x));
      x = x.replace(/\/{2,}/g, "/");
    }

    return x;
  }

  function getOverridesVFS() {
    return window.RCF_VFS_OVERRIDES || window.RCF_OVERRIDES_VFS || null;
  }

  async function writeWithRetry(vfs, path, content, onProgress) {
    const tries = 4;
    let lastErr = null;

    for (let i = 0; i < tries; i++) {
      try {
        onProgress && onProgress({ step: "write_try", i: i + 1, path });

        if (typeof vfs.writeFile === "function") {
          await vfs.writeFile(path, content);
        } else if (typeof vfs.write === "function") {
          await vfs.write(path, content);
        } else if (typeof vfs.put === "function") {
          await vfs.put(path, content);
        } else {
          throw new Error("Overrides VFS sem writeFile/write/put");
        }

        onProgress && onProgress({ step: "write_ok", i: i + 1, path });
        return true;
      } catch (e) {
        lastErr = e;
        onProgress && onProgress({ step: "write_fail", i: i + 1, path, err: String(e?.message || e) });
        await sleep(400 + i * 600); // iOS safe backoff
      }
    }

    throw (lastErr || new Error("write failed"));
  }

  function parseBundleToFiles(bundleText) {
    const parsed = safeParse(bundleText, null);
    if (!parsed || typeof parsed !== "object") return { files: {}, meta: { ok: false } };

    const filesObj = (parsed.files && typeof parsed.files === "object") ? parsed.files : parsed;

    const out = {};
    for (const [rawPath, rawVal] of Object.entries(filesObj || {})) {
      const pNorm = normalizeMotherPath(rawPath);
      const txt = (rawVal && typeof rawVal === "object" && "content" in rawVal)
        ? String(rawVal.content ?? "")
        : String(rawVal ?? "");
      if (pNorm) out[pNorm] = txt;
    }

    return { files: out, meta: { ok: true, count: Object.keys(out).length } };
  }

  async function pullBundleFromGitHub(cfg) {
    if (!window.RCF_GH_SYNC || typeof window.RCF_GH_SYNC.pull !== "function") {
      throw new Error("RCF_GH_SYNC.pull ausente (js/core/github_sync.js)");
    }
    const txt = await window.RCF_GH_SYNC.pull(cfg);
    if (!txt || String(txt).trim().length < 10) throw new Error("bundle vazio (pull retornou vazio)");
    return String(txt);
  }

  async function updateFromGitHub(opts = {}) {
    const cfg = getCfg();
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;

    if (!cfg.owner || !cfg.repo) throw new Error("ghcfg incompleto (owner/repo)");
    onProgress && onProgress({ step: "start", cfg: { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, path: cfg.path } });

    log("ok", "update start", `${cfg.owner}/${cfg.repo}@${cfg.branch} path=${cfg.path}`);

    // 1) pull bundle
    const bundleText = await pullBundleFromGitHub(cfg);
    localStorage.setItem(LS_BUNDLE_KEY, bundleText);
    onProgress && onProgress({ step: "bundle_saved", bytes: bundleText.length });

    // 2) parse
    const parsed = parseBundleToFiles(bundleText);
    if (!parsed.meta.ok || parsed.meta.count < 1) throw new Error("bundle parse falhou ou sem arquivos");

    // 3) apply to overrides vfs
    const vfs = getOverridesVFS();
    if (!vfs) throw new Error("Overrides VFS ausente (js/core/vfs_overrides.js)");

    const paths = Object.keys(parsed.files);
    onProgress && onProgress({ step: "apply_begin", count: paths.length });

    // ordem: index/app.js/styles (reduz chance de “tela branca”)
    paths.sort((a, b) => {
      const prio = (p) => (
        p.endsWith("/index.html") ? 0 :
        p.endsWith("/app.js") ? 1 :
        p.endsWith("/styles.css") ? 2 : 9
      );
      return prio(a) - prio(b);
    });

    let done = 0;
    for (const p of paths) {
      const content = parsed.files[p];

      // ✅ proteção final + LOG
      const safePath = normalizeMotherPath(p);
      if (safePath !== p) log("info", `path normalized: ${p} -> ${safePath}`);
      if (!safePath.startsWith("/app/")) throw new Error("proteção: path fora de /app/ bloqueado: " + safePath);

      await writeWithRetry(vfs, safePath, content, onProgress);

      done++;
      if (done % 10 === 0 || done === paths.length) {
        onProgress && onProgress({ step: "apply_progress", done, total: paths.length });
      }
    }

    onProgress && onProgress({ step: "apply_done", done, total: paths.length });
    log("ok", "update done", `files=${paths.length}`);

    return { ok: true, wrote: paths.length, failed: 0 };
  }

  async function clearOverrides() {
    const vfs = getOverridesVFS();
    if (!vfs) throw new Error("Overrides VFS ausente");

    if (typeof vfs.listFiles !== "function" || typeof vfs.deleteFile !== "function") {
      if (typeof vfs.list === "function" && typeof vfs.del === "function") {
        const list = await vfs.list();
        for (const p of list || []) await vfs.del(p);
        log("ok", "clearOverrides ok", `count=${(list || []).length}`);
        return { ok: true, count: (list || []).length };
      }
      throw new Error("Overrides VFS sem listFiles/deleteFile");
    }

    const list = await vfs.listFiles();
    let n = 0;
    for (const p of list || []) {
      try { await vfs.deleteFile(p); n++; } catch {}
    }

    log("ok", "clearOverrides ok", `count=${n}`);
    return { ok: true, count: n };
  }

  function status() {
    const cfg = getCfg();
    const hasSync = !!(window.RCF_GH_SYNC && typeof window.RCF_GH_SYNC.pull === "function");
    const hasVfs = !!getOverridesVFS();
    const bundleLen = (localStorage.getItem(LS_BUNDLE_KEY) || "").length;

    return {
      ok: true,
      v: "v1.1",
      motherRoot: "/app",
      hasSync,
      hasOverridesVFS: hasVfs,
      bundleSize: bundleLen,
      cfg: {
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        path: cfg.path,
        token: cfg.token ? "set" : "empty"
      }
    };
  }

  window.RCF_MAE = { __v1_1: true, updateFromGitHub, clearOverrides, status, normalizeMotherPath };
  window.RCF_MOTHER = window.RCF_MAE; // alias

  log("ok", "mother_selfupdate.js ready ✅");
})();

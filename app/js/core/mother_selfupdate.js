/* RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v1.2
   - Define a "Mãe" corretamente: window.RCF_MAE / window.RCF_MOTHER
   - MotherRoot = /app (source of truth)
   - Puxa mother_bundle.json via GitHub Sync (RCF_GH_SYNC.pull)
   - Salva bundle em localStorage (rcf:mother_bundle)
   - Aplica arquivos no Overrides VFS (window.RCF_VFS_OVERRIDES) com retry/backoff (iOS)
   - ✅ Normaliza paths: NUNCA escreve /index.html (sempre /app/index.html)
   - ✅ clearOverrides: usa clear() se não existir listFiles/deleteFile
*/
(() => {
  "use strict";

  if (window.RCF_MAE && window.RCF_MAE.__v12) return;

  const log = (lvl, msg, extra) => {
    try { window.RCF_LOGGER?.push?.(lvl, String(msg)); } catch {}
    try { console.log("[MAE]", lvl, msg, extra || ""); } catch {}
  };

  const MOTHER_ROOT = "/app";

  const LS_BUNDLE_KEY = "rcf:mother_bundle"; // raw JSON text (string)
  const LS_CFG_KEY    = "rcf:ghcfg";         // {owner,repo,branch,path,token}

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function getCfg() {
    const cfg = safeParse(localStorage.getItem(LS_CFG_KEY), {}) || {};
    // ✅ default path agora é relativo ao /app (com base href ./)
    // mas se o usuário salvar "app/import/..." também funciona.
    return {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: String(cfg.path || "import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(),
    };
  }

  // ✅ PATCH MÍNIMO (PADRÃO): MotherRoot é /app
  function normalizeMotherPath(p) {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();

    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");

    // ✅ regra: qualquer "/index.html" => "/app/index.html"
    if (x === "/index.html") x = "/app/index.html";
    if (x === "/styles.css") x = "/app/styles.css";
    if (x === "/app.js")     x = "/app/app.js";
    if (x === "/sw.js")      x = "/app/sw.js";
    if (x === "/manifest.json") x = "/app/manifest.json";

    // ✅ se não começa com /app/, empurra pra dentro do MotherRoot
    if (!x.startsWith(MOTHER_ROOT + "/")) {
      x = (MOTHER_ROOT + (x.startsWith("/") ? x : ("/" + x))).replace(/\/{2,}/g, "/");
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
        await sleep(400 + i * 650); // backoff iOS safe
      }
    }

    throw (lastErr || new Error("write failed"));
  }

  function parseBundleToFiles(bundleText) {
    const parsed = safeParse(bundleText, null);
    if (!parsed || typeof parsed !== "object") return { files: {}, meta: { ok: false } };

    // aceita {files:{...}} OU objeto direto
    const filesObj = (parsed.files && typeof parsed.files === "object") ? parsed.files : parsed;

    const out = {};
    for (const [rawPath, rawVal] of Object.entries(filesObj || {})) {
      const normalized = normalizeMotherPath(rawPath);
      const txt = (rawVal && typeof rawVal === "object" && "content" in rawVal)
        ? String(rawVal.content ?? "")
        : String(rawVal ?? "");
      if (normalized) out[normalized] = txt;
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

    onProgress && onProgress({
      step: "start",
      cfg: { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, path: cfg.path }
    });

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

    let paths = Object.keys(parsed.files);

    // ordem: primeiro /app/index.html /app/app.js /app/styles.css (reduz chance de “tela branca”)
    const prio = (p) => (
      p === "/app/index.html" ? 0 :
      p === "/app/app.js"     ? 1 :
      p === "/app/styles.css" ? 2 : 9
    );
    paths.sort((a, b) => prio(a) - prio(b));

    onProgress && onProgress({ step: "apply_begin", count: paths.length });

    let wrote = 0;
    for (const originalPath of paths) {
      const content = parsed.files[originalPath];

      // ✅ normaliza SEMPRE e loga o de->para
      const safePath = normalizeMotherPath(originalPath);
      if (safePath !== originalPath) {
        log("info", `path normalized: ${originalPath} -> ${safePath}`);
      }

      // ✅ proteção final: nunca escrever fora de /app/
      if (!safePath.startsWith("/app/")) {
        log("warn", "skip (outside /app): " + safePath);
        continue;
      }

      await writeWithRetry(vfs, safePath, content, onProgress);
      wrote++;
      if (wrote % 10 === 0 || wrote === paths.length) {
        onProgress && onProgress({ step: "apply_progress", done: wrote, total: paths.length });
      }
    }

    onProgress && onProgress({ step: "apply_done", done: wrote, total: paths.length });
    log("ok", "update done", `wrote=${wrote}`);

    return { ok: true, wrote, failed: 0 };
  }

  // ✅ Clear robusto: se vfs só tem clear(), usa clear()
  async function clearOverrides() {
    const vfs = getOverridesVFS();
    if (!vfs) throw new Error("Overrides VFS ausente");

    if (typeof vfs.clear === "function") {
      await vfs.clear();
      log("ok", "clearOverrides ok", "via clear()");
      return { ok: true, mode: "clear()", count: null };
    }

    // fallback caso algum VFS mais completo exista
    if (typeof vfs.listFiles === "function" && typeof vfs.deleteFile === "function") {
      const list = await vfs.listFiles();
      let n = 0;
      for (const p of list || []) { try { await vfs.deleteFile(p); n++; } catch {} }
      log("ok", "clearOverrides ok", `count=${n}`);
      return { ok: true, mode: "listFiles+deleteFile", count: n };
    }

    throw new Error("Overrides VFS sem clear() e sem listFiles/deleteFile");
  }

  function status() {
    const cfg = getCfg();
    const hasSync = !!(window.RCF_GH_SYNC && typeof window.RCF_GH_SYNC.pull === "function");
    const vfs = getOverridesVFS();
    const hasVfs = !!vfs;

    const bundleLen = (localStorage.getItem(LS_BUNDLE_KEY) || "").length;

    return {
      ok: true,
      v: "v1.2",
      motherRoot: MOTHER_ROOT,
      hasSync,
      hasOverridesVFS: hasVfs,
      overridesKind: vfs ? (typeof vfs.put === "function" ? "RCF_VFS_OVERRIDES.put" : "custom") : "absent",
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

  window.RCF_MAE = {
    __v12: true,
    motherRoot: MOTHER_ROOT,
    normalizeMotherPath,
    updateFromGitHub,
    clearOverrides,
    status
  };
  window.RCF_MOTHER = window.RCF_MAE; // alias

  log("ok", "mother_selfupdate.js ready ✅", "v1.2");
})();

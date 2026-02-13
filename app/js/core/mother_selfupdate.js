/* RControl Factory — /app/js/core/mother_selfupdate.js — v2 (PADRÃO SAFE)
   - Expõe: window.RCF_MAE e window.RCF_MOTHER (alias)
   - API: status(), updateFromGitHub(), clearOverrides()
   - Usa Overrides VFS (localStorage) como destino (sem tela branca)
   - Pull do GitHub via RCF_GH_SYNC.pull(cfg) (mother_bundle.json)
   - iOS safe write: timeout 15s + retries/backoff por arquivo
   - Normaliza paths para começar em /app/ quando necessário
*/
(() => {
  "use strict";

  if (window.RCF_MAE && window.RCF_MAE.__v2) return;

  const LOG = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[MAE]", lvl, msg); } catch {}
  };

  const LS_GHCFG = "rcf:ghcfg";
  const LS_BUNDLE = "rcf:mother_bundle";

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const safeJsonParse = (s, fb = null) => { try { return JSON.parse(s); } catch { return fb; } };

  const normPath = (p) => {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");

    // ✅ padrão da Factory: tudo no root /app
    // Se vier "index.html" ou "/index.html", força "/app/index.html"
    if (x === "/index.html") x = "/app/index.html";
    if (x === "/styles.css") x = "/app/styles.css";
    if (x === "/app.js") x = "/app/app.js";

    // se não começar com /app/ e parecer arquivo da factory, empurra pra /app/
    if (!x.startsWith("/app/")) {
      const looksFactory = /\.(html|js|css|json|txt|md)$/i.test(x) || x.includes("/js/") || x.includes("/styles");
      if (looksFactory && !x.startsWith("/runtime/")) x = "/app" + (x.startsWith("/") ? "" : "/") + x.replace(/^\//, "");
      x = x.replace(/\/{2,}/g, "/");
    }

    return x;
  };

  function ensureOverridesVFS() {
    // Preferir o Overrides do app.js (fase A)
    const vfs =
      window.RCF_OVERRIDES_VFS ||
      window.RCF_VFS_OVERRIDES ||
      null;

    if (!vfs || typeof vfs.writeFile !== "function" || typeof vfs.listFiles !== "function") {
      throw new Error("RCF_OVERRIDES_VFS ausente (precisa do OverridesVFS no app.js)");
    }
    return vfs;
  }

  function loadCfg() {
    const raw = localStorage.getItem(LS_GHCFG);
    const cfg = safeJsonParse(raw, {}) || {};
    return {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: String(cfg.path || "app/import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(),
    };
  }

  async function saveBundleLocal(txt) {
    const s = String(txt || "");
    try { localStorage.setItem(LS_BUNDLE, s); } catch {}
    // Se tiver o storage V2 FULL (IndexedDB), salva também
    try {
      if (window.RCF_STORAGE && typeof window.RCF_STORAGE.put === "function") {
        await window.RCF_STORAGE.put("mother_bundle_local", s);
      }
    } catch {}
  }

  function parseBundle(txt) {
    const obj = safeJsonParse(txt, null);
    if (!obj || typeof obj !== "object") return null;

    // aceita {files:{...}} ou direto {...}
    const files = (obj.files && typeof obj.files === "object") ? obj.files : obj;
    if (!files || typeof files !== "object") return null;

    return { raw: obj, files };
  }

  async function writeWithRetry(vfs, path, content) {
    const tries = 3;
    for (let i = 0; i < tries; i++) {
      const timeoutMs = 15000;
      try {
        await Promise.race([
          Promise.resolve(vfs.writeFile(path, content)),
          new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT writeFile " + timeoutMs + "ms")), timeoutMs))
        ]);
        return { ok: true, attempt: i + 1 };
      } catch (e) {
        const msg = String(e?.message || e);
        LOG("warn", `write fail (${i + 1}/${tries}) path=${path} err=${msg}`);
        // backoff progressivo
        await sleep(500 + i * 900);
      }
    }
    return { ok: false, err: "write failed after retries: " + path };
  }

  let UPDATE_LOCK = false;

  async function updateFromGitHub() {
    if (UPDATE_LOCK) {
      LOG("warn", "updateFromGitHub bloqueado (lock)");
      return { ok: false, msg: "update já está rodando" };
    }
    UPDATE_LOCK = true;

    try {
      if (!window.RCF_GH_SYNC || typeof window.RCF_GH_SYNC.pull !== "function") {
        throw new Error("RCF_GH_SYNC.pull ausente (core/github_sync.js não carregou)");
      }

      const cfg = loadCfg();
      if (!cfg.owner || !cfg.repo) {
        throw new Error("ghcfg incompleto (owner/repo). Abra Admin e salve config.");
      }

      LOG("ok", `update start: ${cfg.owner}/${cfg.repo} @ ${cfg.branch} :: ${cfg.path}`);
      const txt = await window.RCF_GH_SYNC.pull(cfg);
      if (!txt) throw new Error("pull retornou vazio");

      await saveBundleLocal(txt);

      const bundle = parseBundle(txt);
      if (!bundle) throw new Error("bundle inválido (JSON) — confira mother_bundle.json");

      const vfs = ensureOverridesVFS();

      // escreve arquivos no overrides
      const entries = Object.entries(bundle.files);
      let ok = 0, fail = 0;

      for (const [rawPath, rawVal] of entries) {
        const p = normPath(rawPath);
        if (!p) continue;

        // aceita {content:""} ou string
        const content =
          (rawVal && typeof rawVal === "object" && "content" in rawVal)
            ? String(rawVal.content ?? "")
            : String(rawVal ?? "");

        const r = await writeWithRetry(vfs, p, content);
        if (r.ok) ok++;
        else fail++;

        // mantém logs leves
        if ((ok + fail) % 20 === 0) LOG("log", `progress: ok=${ok} fail=${fail}`);
      }

      LOG("ok", `update done: ok=${ok} fail=${fail}`);
      return { ok: fail === 0, wrote: ok, failed: fail };
    } catch (e) {
      const msg = String(e?.message || e);
      LOG("err", "update err: " + msg);
      return { ok: false, msg };
    } finally {
      UPDATE_LOCK = false;
    }
  }

  async function clearOverrides() {
    try {
      const vfs = ensureOverridesVFS();
      const list = await vfs.listFiles();
      let n = 0;
      for (const p0 of (list || [])) {
        const p = normPath(p0);
        try { await vfs.deleteFile(p); n++; } catch {}
      }
      LOG("ok", "clearOverrides ok: " + n);
      return { ok: true, deleted: n };
    } catch (e) {
      const msg = String(e?.message || e);
      LOG("err", "clearOverrides err: " + msg);
      return { ok: false, msg };
    }
  }

  function status() {
    let overridesCount = 0;
    try {
      const vfs = window.RCF_OVERRIDES_VFS;
      if (vfs && typeof vfs._raw?.list === "function") overridesCount = vfs._raw.list().length;
    } catch {}

    const cfg = (() => {
      try { return loadCfg(); } catch { return {}; }
    })();

    const bundleSize = (() => {
      try { return (localStorage.getItem(LS_BUNDLE) || "").length; } catch { return 0; }
    })();

    return {
      ok: true,
      v: "v2",
      lock: UPDATE_LOCK,
      overridesCount,
      bundleSize,
      cfg: { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, path: cfg.path, token: cfg.token ? "set" : "" }
    };
  }

  window.RCF_MAE = { __v2: true, status, updateFromGitHub, clearOverrides };
  window.RCF_MOTHER = window.RCF_MAE; // alias

  LOG("ok", "mother_selfupdate.js v2 loaded ✅");
})();

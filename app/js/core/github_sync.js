/* =========================================================
  RCF — /app/js/core/github_repo_sync.js
  GitHub Contents API — FULL SYNC (bundle.files -> repo paths)
  - cfg via localStorage: "RCF_GH_CFG"
    { owner, repo, branch, token }
  API:
    RCF_GH_FULL.saveCfg(cfg)
    RCF_GH_FULL.loadCfg()
    RCF_GH_FULL.pushBundle(bundle, opts)
    RCF_GH_FULL.pullFile(pathInRepo)  // opcional
========================================================= */

(() => {
  "use strict";

  const KEY = "RCF_GH_CFG";

  function b64encodeUtf8(str){
    // btoa não suporta UTF-8 direto
    const bytes = new TextEncoder().encode(String(str ?? ""));
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function normRepoPath(p){
    // bundle usa "/app/..." e repo usa "app/..."
    let s = String(p || "").trim();
    if (!s) throw new Error("path vazio");
    if (s.startsWith("/")) s = s.slice(1);
    return s;
  }

  function apiBase(cfg){
    return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/`;
  }

  function loadCfg(){
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
    catch { return null; }
  }

  function saveCfg(cfg){
    const clean = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      token: String(cfg.token || "").trim(),
    };
    if (!clean.owner || !clean.repo || !clean.token) throw new Error("CFG incompleta (owner/repo/token).");
    localStorage.setItem(KEY, JSON.stringify(clean));
    return clean;
  }

  async function ghFetch(url, cfg, init){
    const headers = Object.assign({
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    }, (init && init.headers) || {});
    const res = await fetch(url, Object.assign({}, init, { headers }));
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const msg = (json && (json.message || json.error)) ? (json.message || json.error) : text;
      throw new Error(`GitHub HTTP ${res.status}: ${msg}`);
    }
    return json;
  }

  async function getShaIfExists(cfg, pathInRepo){
    const url = apiBase(cfg) + encodeURIComponent(pathInRepo).replaceAll("%2F", "/") + `?ref=${encodeURIComponent(cfg.branch)}`;
    try {
      const j = await ghFetch(url, cfg, { method: "GET" });
      return j && j.sha ? j.sha : null;
    } catch (e) {
      // 404 = não existe ainda
      if (String(e.message || "").includes("HTTP 404")) return null;
      throw e;
    }
  }

  async function putFile(cfg, pathInRepo, content, commitMsg){
    const sha = await getShaIfExists(cfg, pathInRepo);
    const url = apiBase(cfg) + encodeURIComponent(pathInRepo).replaceAll("%2F", "/");
    const body = {
      message: commitMsg,
      content: b64encodeUtf8(String(content ?? "")),
      branch: cfg.branch,
    };
    if (sha) body.sha = sha;

    return ghFetch(url, cfg, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function pushBundle(bundle, opts = {}){
    const cfg = loadCfg();
    if (!cfg || !cfg.owner || !cfg.repo || !cfg.token) {
      throw new Error("CFG do GitHub não configurada. Preencha e salve na UI.");
    }

    const files = (bundle && bundle.files && typeof bundle.files === "object") ? bundle.files : null;
    if (!files) throw new Error("Bundle sem .files");
    const keys = Object.keys(files);
    if (!keys.length) throw new Error("Bundle vazio (0 files).");

    const name = bundle?.meta?.name || "bundle";
    const ver  = bundle?.meta?.version || "0";
    const commitMsg = opts.commitMsg || `RCF sync: ${name} ${ver}`;

    const results = [];
    // push sequencial (mais estável no iOS e evita rate-limit)
    for (const k of keys) {
      const repoPath = normRepoPath(k);
      const content = files[k];
      await putFile(cfg, repoPath, content, commitMsg);
      results.push(repoPath);
    }
    return { ok: true, pushed: results, commitMsg };
  }

  // opcional: puxar um arquivo do repo
  async function pullFile(pathInRepo){
    const cfg = loadCfg();
    if (!cfg) throw new Error("CFG não configurada.");
    const p = normRepoPath(pathInRepo);
    const url = apiBase(cfg) + encodeURIComponent(p).replaceAll("%2F", "/") + `?ref=${encodeURIComponent(cfg.branch)}`;
    const j = await ghFetch(url, cfg, { method: "GET" });
    if (!j || !j.content) throw new Error("Arquivo sem content.");
    // decode base64 -> utf8
    const bin = atob(String(j.content).replaceAll("\n",""));
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    const txt = new TextDecoder().decode(bytes);
    return { ok:true, path:p, text:txt, sha:j.sha };
  }

  window.RCF_GH_FULL = { saveCfg, loadCfg, pushBundle, pullFile };
})();

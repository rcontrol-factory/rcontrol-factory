/* ERCtrl Factory — GitHub Sync (SAFE)
   - GitHub Contents API: GET/PUT file
   - Exponibiliza window.RCF_GH_SYNC = { saveConfig, loadConfig, test, pull, push }
   - Config guardada em localStorage (NUNCA salva token em bundle)
*/
(() => {
  "use strict";

  const LS_KEY = "rcf:ghsync:config";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowISO = () => new Date().toISOString();

  function log(msg) {
    try {
      if (window.RCF_LOGGER && window.RCF_LOGGER.push) window.RCF_LOGGER.push("info", msg);
    } catch {}
  }
  function warn(msg) {
    try {
      if (window.RCF_LOGGER && window.RCF_LOGGER.push) window.RCF_LOGGER.push("warn", msg);
    } catch {}
  }
  function err(msg) {
    try {
      if (window.RCF_LOGGER && window.RCF_LOGGER.push) window.RCF_LOGGER.push("err", msg);
    } catch {}
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveConfig(cfg) {
    const safe = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: String(cfg.path || "app/import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(), // PAT
    };
    localStorage.setItem(LS_KEY, JSON.stringify(safe));
    return safe;
  }

  function requireCfg(cfg) {
    const c = cfg && Object.keys(cfg).length ? cfg : loadConfig();
    if (!c.owner) throw new Error("Falta owner");
    if (!c.repo) throw new Error("Falta repo");
    if (!c.branch) throw new Error("Falta branch");
    if (!c.path) throw new Error("Falta path");
    if (!c.token) throw new Error("Falta token (PAT)");
    return c;
  }

  function apiUrl(c) {
    const path = c.path.replace(/^\/+/, "");
    return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${path}?ref=${encodeURIComponent(c.branch)}`;
  }

  function headers(c) {
    return {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${c.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  function b64encode(str) {
    // UTF-8 safe base64
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64decode(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  async function getFile(c) {
    const res = await fetch(apiUrl(c), { headers: headers(c) });
    if (res.status === 404) return { exists: false };
    if (!res.ok) throw new Error(`GitHub GET falhou: ${res.status}`);
    const j = await res.json();
    if (!j || j.type !== "file") throw new Error("Resposta inesperada do GitHub (nao eh file)");
    return { exists: true, sha: j.sha, content: b64decode(String(j.content || "").replace(/\n/g, "")) };
  }

  async function putFile(c, content, sha) {
    const body = {
      message: `ERCtrl sync ${nowISO()}`,
      content: b64encode(String(content ?? "")),
      branch: c.branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(apiUrl(c), {
      method: "PUT",
      headers: { ...headers(c), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GitHub PUT falhou: ${res.status} ${t}`);
    }
    return res.json();
  }

  async function test(cfg) {
    const c = requireCfg(cfg);
    await sleep(150);
    const res = await fetch(`https://api.github.com/user`, { headers: headers(c) });
    if (!res.ok) throw new Error("Token invalido ou sem permissao");
    return "OK: token válido.";
  }

  async function pull(cfg) {
    const c = requireCfg(cfg);
    log("GitHub: pull iniciando...");
    const f = await getFile(c);
    if (!f.exists) return "Arquivo nao existe no repo (404).";
    log("GitHub: pull ok.");
    return f.content;
  }

  async function push(cfg, content) {
    const c = requireCfg(cfg);
    log("GitHub: push iniciando...");
    const f = await getFile(c);
    const sha = f.exists ? f.sha : undefined;
    await putFile(c, content, sha);
    log("GitHub: push ok.");
    return "OK: enviado pro GitHub.";
  }

  window.RCF_GH_SYNC = { saveConfig, loadConfig, test, pull, push };
  log("github_sync.js loaded");
})();

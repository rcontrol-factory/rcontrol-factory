/* RControl Factory — GitHub Sync (SAFE)
   - GitHub Contents API: GET/PUT file
   - Compatível com app.js (Storage: rcf:ghcfg)
   - pull(): retorna string do bundle (JSON)
   - push(content?): se content não vier, gera bundle “mãe” automaticamente via fetch()
   - NUNCA salva token no bundle (só no localStorage)
*/
(() => {
  "use strict";

  // ✅ Compatível com o app.js que você colou
  const LS_KEY = "rcf:ghcfg";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowISO = () => new Date().toISOString();

  function log(msg) {
    try { window.RCF_LOGGER?.push?.("info", msg); } catch {}
  }
  function warn(msg) {
    try { window.RCF_LOGGER?.push?.("warn", msg); } catch {}
  }
  function err(msg) {
    try { window.RCF_LOGGER?.push?.("err", msg); } catch {}
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
      token: String(cfg.token || "").trim(), // PAT (fica só local)
    };
    localStorage.setItem(LS_KEY, JSON.stringify(safe));
    return safe;
  }

  function requireCfg(cfg) {
    const c = (cfg && Object.keys(cfg).length) ? cfg : loadConfig();
    if (!c.owner) throw new Error("Falta owner");
    if (!c.repo) throw new Error("Falta repo");
    if (!c.branch) throw new Error("Falta branch");
    if (!c.path) throw new Error("Falta path");
    if (!c.token) throw new Error("Falta token (PAT)");
    return c;
  }

  function apiUrl(c) {
    const path = String(c.path || "").replace(/^\/+/, "");
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
    if (!j || j.type !== "file") throw new Error("Resposta inesperada do GitHub (não é file)");
    return { exists: true, sha: j.sha, content: b64decode(String(j.content || "").replace(/\n/g, "")) };
  }

  async function putFile(c, content, sha) {
    const body = {
      message: `RControl Factory sync ${nowISO()}`,
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
    await sleep(100);
    const res = await fetch(`https://api.github.com/user`, { headers: headers(c) });
    if (!res.ok) throw new Error("Token inválido ou sem permissão");
    return "OK: token válido.";
  }

  // -----------------------------
  // Bundle Builder (Mãe)
  // -----------------------------
  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  async function fetchText(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Falhou fetch ${path}: ${res.status}`);
    return await res.text();
  }

  // ✅ Arquivos “mãe” (Factory) que você quer atualizar via overrides
  // Observação: estes paths precisam bater com o SW (raiz /js/...)
  const DEFAULT_MOTHER_FILES = [
    "/index.html",
    "/styles.css",
    "/app.js",
    "/manifest.json",
    "/sw.js",

    "/js/core/vfs_overrides.js",
    "/js/core/github_sync.js",
    "/js/core/mother_selfupdate.js",
  ];

  async function buildMotherBundle(fileList = DEFAULT_MOTHER_FILES) {
    const files = {};
    for (const path of fileList) {
      const content = await fetchText(path);
      files[path] = { content, contentType: guessType(path) };
    }
    // ⚠️ token NUNCA entra aqui
    return JSON.stringify({ files }, null, 2);
  }

  async function pushMotherBundle(cfg, fileList) {
    const bundleText = await buildMotherBundle(fileList);
    return await push(cfg, bundleText);
  }

  // -----------------------------
  // Public API (pull / push)
  // -----------------------------
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

    // ✅ Se não passar content, gera bundle automaticamente
    let payload = content;
    if (payload == null) {
      warn("GitHub: push sem content → gerando mother bundle automaticamente...");
      payload = await buildMotherBundle();
    }

    log("GitHub: push iniciando...");
    const f = await getFile(c);
    const sha = f.exists ? f.sha : undefined;
    await putFile(c, payload, sha);
    log("GitHub: push ok.");
    return "OK: enviado pro GitHub.";
  }

  window.RCF_GH_SYNC = {
    saveConfig,
    loadConfig,
    test,
    pull,
    push,
    buildMotherBundle,
    pushMotherBundle,
  };

  log("github_sync.js loaded");
})();
  

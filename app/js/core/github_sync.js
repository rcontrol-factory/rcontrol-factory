/* RControl Factory — GitHub Sync (SAFE) — v2.2
  - GitHub Contents API: GET/PUT file
  - Storage: rcf:ghcfg
  - pull(): retorna string JSON (bundle) ou lança erro
  - push(content?): se sem content, gera mother bundle via fetch (NO-STORE)
  - ✅ PADRÃO: MotherRoot=/app
  - ✅ buildMotherBundle usa new URL(<rel>, document.baseURI)
  - ✅ DEFAULT_MOTHER_FILES relativos a /app/ (sem “/index.html”)
*/
(() => {
  "use strict";

  const LS_KEY = "rcf:ghcfg";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowISO = () => new Date().toISOString();

  function log(msg)  { try { window.RCF_LOGGER?.push?.("info", msg); } catch {} }
  function warn(msg) { try { window.RCF_LOGGER?.push?.("warn", msg); } catch {} }
  function err(msg)  { try { window.RCF_LOGGER?.push?.("err", msg); } catch {} }

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

      // ✅ PADRÃO local: /app/import/mother_bundle.json
      // No GitHub Contents API, isso vira contents/import/mother_bundle.json (sem /app/)
      path: String(cfg.path || "import/mother_bundle.json").trim(),

      token: String(cfg.token || "").trim(),
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

  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(b64) { return decodeURIComponent(escape(atob(b64))); }

  function head80(t) { return String(t || "").slice(0, 80).replace(/\s+/g, " ").trim(); }

  function looksLikeJson(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (t.startsWith("<!DOCTYPE") || t.startsWith("<html")) return false;
    return t[0] === "{";
  }

  function assertBundleJson(text) {
    if (!looksLikeJson(text)) {
      throw new Error(`pull: resposta não é JSON (head="${head80(text)}")`);
    }
    let j;
    try { j = JSON.parse(text); }
    catch (e) {
      throw new Error(`pull: JSON inválido (${e?.message || e}) head="${head80(text)}"`);
    }
    const files = j?.files || null;
    if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
      throw new Error(`pull: JSON sem files (ou vazio) head="${head80(text)}"`);
    }
    return true;
  }

  async function getFile(c) {
    const res = await fetch(apiUrl(c), { headers: headers(c) });

    if (res.status === 404) return { exists: false };

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GitHub GET falhou: ${res.status} ${head80(t)}`);
    }

    const j = await res.json();
    if (!j || j.type !== "file") throw new Error("Resposta inesperada do GitHub (não é file)");

    const decoded = b64decode(String(j.content || "").replace(/\n/g, ""));
    return { exists: true, sha: j.sha, content: decoded };
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
      throw new Error(`GitHub PUT falhou: ${res.status} ${head80(t)}`);
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
  // Bundle Builder (Mãe) — /app/*
  // -----------------------------
  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  async function fetchText(relPath) {
    // ✅ baseURI aponta para /app/ (por causa do <base href="./">)
    const url = new URL(String(relPath || ""), document.baseURI);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Falhou fetch ${url.pathname}: ${res.status}`);
    return await res.text();
  }

  // ✅ PADRÃO: tudo relativo a /app/
  const DEFAULT_MOTHER_FILES = [
    "index.html",
    "styles.css",
    "app.js",
    "manifest.json",
    "sw.js",
    "js/core/vfs_overrides.js",
    "js/core/github_sync.js",
    "js/core/mother_selfupdate.js",
  ];

  async function buildMotherBundle(fileList = DEFAULT_MOTHER_FILES) {
    const files = {};
    for (const rel of fileList) {
      const content = await fetchText(rel);
      // guardamos no bundle com path ABSOLUTO em /app/ (source of truth)
      const bundlePath = "/app/" + String(rel).replace(/^\/+/, "");
      files[bundlePath] = { content, contentType: guessType(rel) };
    }
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

    if (!f.exists) throw new Error(`Bundle não existe no repo (404): ${c.path}`);

    assertBundleJson(f.content);

    log("GitHub: pull ok (bundle JSON válido).");
    return f.content;
  }

  async function push(cfg, content) {
    const c = requireCfg(cfg);

    let payload = content;
    if (payload == null) {
      warn("GitHub: push sem content → gerando mother bundle automaticamente...");
      payload = await buildMotherBundle();
    }

    try { assertBundleJson(payload); } catch (e) {
      throw new Error("push: bundle inválido, não enviado -> " + (e?.message || e));
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

  log("github_sync.js loaded (v2.2)");
})();
